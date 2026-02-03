using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Distributed;
using FamilyTreeApi.Data;
using FamilyTreeApi.DTOs;
using FamilyTreeApi.Models;
using FamilyTreeApi.Models.Configuration;
using FamilyTreeApi.Models.Enums;
using FamilyTreeApi.Utilities;
using VirtualUpon.Storage.Factories;

namespace FamilyTreeApi.Services;

/// <summary>
/// Storage migration service for migrating files from local storage to Cloudflare R2.
/// Registered as Singleton, uses IServiceScopeFactory for DbContext.
/// </summary>
public class StorageMigrationService : IStorageMigrationService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly StorageConfiguration _storageConfig;
    private readonly IDistributedCache _cache;
    private readonly ILogger<StorageMigrationService> _logger;

    private MigrationProgress? _currentProgress;
    private CancellationTokenSource? _migrationCts;
    private readonly object _lock = new();

    // Storage type constants
    private const int LocalStorageType = 1;
    private const int CloudflareStorageType = 5;

    // Input validation limits
    private const int MaxBatchSize = 100;
    private const int MinBatchSize = 1;
    private const int MaxConcurrency = 10;
    private const int MinConcurrency = 1;

    public StorageMigrationService(
        IServiceScopeFactory scopeFactory,
        StorageConfiguration storageConfig,
        IDistributedCache cache,
        ILogger<StorageMigrationService> logger)
    {
        _scopeFactory = scopeFactory;
        _storageConfig = storageConfig;
        _cache = cache;
        _logger = logger;
    }

    public bool IsMigrationRunning
    {
        get
        {
            lock (_lock)
            {
                return _currentProgress?.IsRunning == true;
            }
        }
    }

    public MigrationStatusResponse GetStatus()
    {
        lock (_lock)
        {
            if (_currentProgress == null)
            {
                return new MigrationStatusResponse
                {
                    IsRunning = false,
                    Message = "No migration in progress",
                    Progress = null
                };
            }

            return new MigrationStatusResponse
            {
                IsRunning = _currentProgress.IsRunning,
                Message = _currentProgress.IsRunning
                    ? $"Migration in progress: {_currentProgress.ProgressPercent:F1}%"
                    : "Migration completed",
                Progress = _currentProgress
            };
        }
    }

    public async Task<MigrationPendingCount> GetPendingCountAsync(CancellationToken cancellationToken = default)
    {
        using var scope = _scopeFactory.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

        var query = context.MediaFiles
            .Where(m => m.StorageType == LocalStorageType)
            .AsNoTracking();

        var totalCount = await query.CountAsync(cancellationToken);
        var totalBytes = await query.SumAsync(m => m.FileSize, cancellationToken);

        var byKind = await query
            .GroupBy(m => m.Kind)
            .Select(g => new { Kind = g.Key, Count = g.Count() })
            .ToDictionaryAsync(x => x.Kind.ToString(), x => x.Count, cancellationToken);

        var byOrg = await query
            .GroupBy(m => m.OrgId)
            .Select(g => new { OrgId = g.Key, Count = g.Count() })
            .ToDictionaryAsync(x => x.OrgId, x => x.Count, cancellationToken);

        return new MigrationPendingCount
        {
            TotalLocalFiles = totalCount,
            TotalBytes = totalBytes,
            ByMediaKind = byKind,
            ByOrg = byOrg
        };
    }

    public async Task<MigrationResult> MigrateToCloudflareAsync(
        MigrationRequest request,
        CancellationToken cancellationToken = default)
    {
        // Validate and clamp input parameters
        request.BatchSize = Math.Clamp(request.BatchSize, MinBatchSize, MaxBatchSize);
        request.MaxConcurrency = Math.Clamp(request.MaxConcurrency, MinConcurrency, MaxConcurrency);

        lock (_lock)
        {
            if (IsMigrationRunning)
            {
                return new MigrationResult
                {
                    Success = false,
                    Message = "A migration is already in progress.",
                    Progress = _currentProgress!
                };
            }

            _migrationCts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
            _currentProgress = new MigrationProgress { StartedAt = DateTime.UtcNow };
        }

        SemaphoreSlim? semaphore = null;

        try
        {
            var linkedToken = _migrationCts.Token;

            // Get total count using scoped context
            int totalCount;
            using (var scope = _scopeFactory.CreateScope())
            {
                var context = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
                var query = context.MediaFiles
                    .Where(m => m.StorageType == LocalStorageType)
                    .AsNoTracking();

                if (request.OrgId.HasValue)
                    query = query.Where(m => m.OrgId == request.OrgId.Value);

                if (request.MediaKind.HasValue)
                    query = query.Where(m => m.Kind == request.MediaKind.Value);

                totalCount = await query.CountAsync(linkedToken);
            }

            if (totalCount == 0)
            {
                _currentProgress.CompletedAt = DateTime.UtcNow;
                return new MigrationResult
                {
                    Success = true,
                    Message = "No files to migrate.",
                    Progress = _currentProgress
                };
            }

            // Apply limit if specified
            _currentProgress.TotalFiles = request.MaxFiles > 0
                ? Math.Min(totalCount, request.MaxFiles)
                : totalCount;

            _logger.LogInformation(
                "Starting migration: {TotalFiles} files, DryRun={DryRun}, Rename={Rename}, BatchSize={BatchSize}, Concurrency={Concurrency}",
                _currentProgress.TotalFiles, request.DryRun, request.RenameFiles, request.BatchSize, request.MaxConcurrency);

            // Create storage services
            var localService = StorageServiceFactory.CreateLocalStorageService(_storageConfig, _cache);
            var cloudflareService = StorageServiceFactory.CreateCloudflareStorageService(_storageConfig, _cache);

            semaphore = new SemaphoreSlim(request.MaxConcurrency);

            // Process in batches using cursor-based pagination
            Guid? lastProcessedId = null;
            var totalProcessed = 0;

            while (totalProcessed < _currentProgress.TotalFiles)
            {
                linkedToken.ThrowIfCancellationRequested();

                var batchSize = Math.Min(request.BatchSize, _currentProgress.TotalFiles - totalProcessed);

                // Use scoped DbContext per batch
                using var scope = _scopeFactory.CreateScope();
                var context = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

                // Cursor-based pagination: get files after last processed ID
                var query = context.MediaFiles
                    .Where(m => m.StorageType == LocalStorageType)
                    .AsQueryable();

                if (request.OrgId.HasValue)
                    query = query.Where(m => m.OrgId == request.OrgId.Value);

                if (request.MediaKind.HasValue)
                    query = query.Where(m => m.Kind == request.MediaKind.Value);

                // Cursor-based: only get records after the last one we processed
                if (lastProcessedId.HasValue)
                    query = query.Where(m => m.Id.CompareTo(lastProcessedId.Value) > 0);

                var batch = await query
                    .OrderBy(m => m.Id)
                    .Take(batchSize)
                    .Include(m => m.Person)
                        .ThenInclude(p => p!.Org)
                    .ToListAsync(linkedToken);

                if (batch.Count == 0)
                    break;

                // Update cursor for next batch
                lastProcessedId = batch[^1].Id;

                var tasks = batch.Select(media => ProcessSingleFileAsync(
                    media,
                    localService,
                    cloudflareService,
                    request.DryRun,
                    request.RenameFiles,
                    request.DeleteLocalAfter,
                    semaphore,
                    linkedToken));

                await Task.WhenAll(tasks);

                // Save changes after each batch (if not dry run)
                if (!request.DryRun)
                {
                    await context.SaveChangesAsync(linkedToken);
                }

                totalProcessed += batch.Count;

                _logger.LogInformation(
                    "Migration progress: {Processed}/{Total} ({Percent:F1}%) - Success: {Success}, Failed: {Failed}",
                    _currentProgress.ProcessedFiles,
                    _currentProgress.TotalFiles,
                    _currentProgress.ProgressPercent,
                    _currentProgress.SuccessCount,
                    _currentProgress.FailedCount);
            }

            _currentProgress.CompletedAt = DateTime.UtcNow;

            var resultMessage = request.DryRun
                ? $"Dry run complete. {_currentProgress.SuccessCount} files would be migrated."
                : $"Migration complete. {_currentProgress.SuccessCount} files migrated, {_currentProgress.FailedCount} failed.";

            if (_currentProgress.ResultOverflowCount > 0)
            {
                resultMessage += $" (Note: {_currentProgress.ResultOverflowCount} results truncated from response)";
            }

            _logger.LogInformation(resultMessage);

            return new MigrationResult
            {
                Success = _currentProgress.FailedCount == 0,
                Message = resultMessage,
                Progress = _currentProgress
            };
        }
        catch (OperationCanceledException)
        {
            _currentProgress!.CompletedAt = DateTime.UtcNow;
            return new MigrationResult
            {
                Success = false,
                Message = "Migration was cancelled.",
                Progress = _currentProgress
            };
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Migration failed");
            _currentProgress!.CompletedAt = DateTime.UtcNow;
            return new MigrationResult
            {
                Success = false,
                Message = $"Migration failed: {ex.Message}",
                Progress = _currentProgress
            };
        }
        finally
        {
            semaphore?.Dispose();
            _migrationCts?.Dispose();
            _migrationCts = null;
        }
    }

    public void CancelMigration()
    {
        lock (_lock)
        {
            _migrationCts?.Cancel();
        }
        _logger.LogWarning("Migration cancellation requested");
    }

    private async Task ProcessSingleFileAsync(
        Media media,
        IStorageService localService,
        IStorageService cloudflareService,
        bool dryRun,
        bool renameFiles,
        bool deleteLocalAfter,
        SemaphoreSlim semaphore,
        CancellationToken cancellationToken)
    {
        await semaphore.WaitAsync(cancellationToken);

        // Store original values BEFORE any modifications (for error handling too)
        var originalUrl = media.Url;
        var originalStorageKey = media.StorageKey ?? "";

        try
        {
            _currentProgress!.IncrementProcessed();
            _currentProgress.CurrentFile = media.FileName;

            // Determine new path
            string[] pathSegments;
            string newFileName;

            if (renameFiles && media.Person != null)
            {
                try
                {
                    var extension = Path.GetExtension(media.FileName ?? ".bin");
                    (pathSegments, newFileName) = MediaPathBuilder.BuildDescriptivePath(
                        media.Person.Org?.Name ?? "unknown",
                        media.Person.PrimaryName ?? "unknown",
                        media.Kind.ToString(),
                        media.CreatedAt,
                        media.Id,
                        extension);
                }
                catch (ArgumentException)
                {
                    // Fallback: keep original structure
                    var parts = originalStorageKey.Split('/');
                    newFileName = parts.Length > 0 ? parts[^1] : $"{media.Id}.bin";
                    pathSegments = parts.Length > 1 ? parts[..^1] : new[] { "migrated" };
                }
            }
            else
            {
                // Keep existing path structure
                var parts = originalStorageKey.Split('/');
                newFileName = parts.Length > 0 ? parts[^1] : $"{media.Id}.bin";
                pathSegments = parts.Length > 1 ? parts[..^1] : new[] { "migrated" };
            }

            var newStorageKey = MediaPathBuilder.BuildStorageKey(pathSegments, newFileName);

            // Dry run - just record what would happen
            if (dryRun)
            {
                _currentProgress.IncrementSuccess();
                _currentProgress.AddFileResult(new MigrationFileResult
                {
                    MediaId = media.Id,
                    OldPath = originalStorageKey,
                    NewPath = newStorageKey,
                    FileSize = media.FileSize
                });
                return;
            }

            // Download from local storage using ORIGINAL URL
            var downloadResult = await localService.DownloadFileAsync(originalUrl);
            if (!downloadResult.IsSuccessful || downloadResult.FileData == null)
            {
                _currentProgress.IncrementFailed();
                _currentProgress.AddError(new MigrationError
                {
                    MediaId = media.Id,
                    FileName = media.FileName ?? "",
                    OldPath = originalStorageKey,
                    ErrorMessage = $"Failed to download: {downloadResult.ErrorMessage}"
                });
                return;
            }

            // Upload to Cloudflare
            var uploadResult = await cloudflareService.UploadFileAsync(
                pathSegments,
                newFileName,
                downloadResult.FileData);

            if (!uploadResult.Success)
            {
                _currentProgress.IncrementFailed();
                _currentProgress.AddError(new MigrationError
                {
                    MediaId = media.Id,
                    FileName = media.FileName ?? "",
                    OldPath = originalStorageKey,
                    ErrorMessage = $"Failed to upload: {uploadResult.ErrorMessage}"
                });
                return;
            }

            // Update database record (AFTER successful upload)
            media.Url = uploadResult.ImagePath;
            media.StorageKey = newStorageKey;
            media.StorageType = CloudflareStorageType;
            media.UpdatedAt = DateTime.UtcNow;

            _currentProgress.IncrementSuccess();
            _currentProgress.AddBytesTransferred(downloadResult.FileData.Length);
            _currentProgress.AddFileResult(new MigrationFileResult
            {
                MediaId = media.Id,
                OldPath = originalStorageKey,
                NewPath = newStorageKey,
                FileSize = downloadResult.FileData.Length
            });

            // Delete using ORIGINAL URL (not the updated one)
            if (deleteLocalAfter)
            {
                try
                {
                    await localService.DeleteFileAsync(originalUrl);
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Failed to delete local file after migration: {MediaId}", media.Id);
                }
            }

            _logger.LogDebug("Migrated {MediaId}: {OldPath} -> {NewPath}",
                media.Id, originalStorageKey, newStorageKey);
        }
        catch (Exception ex)
        {
            _currentProgress!.IncrementFailed();
            _currentProgress.AddError(new MigrationError
            {
                MediaId = media.Id,
                FileName = media.FileName ?? "",
                OldPath = originalStorageKey, // Use stored original value
                ErrorMessage = ex.Message
            });
            _logger.LogError(ex, "Failed to migrate media {MediaId}", media.Id);
        }
        finally
        {
            semaphore.Release();
        }
    }
}
