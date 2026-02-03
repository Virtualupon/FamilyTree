# Implementation Plan: Storage Migration (Local → Cloudflare R2)

## Overview

Migrate media files from Local Storage to Cloudflare R2 with optional renaming to the new descriptive naming scheme.

**Prerequisites:**
- ✅ Descriptive file naming implemented (`SlugGenerator`, `MediaPathBuilder`)
- ✅ Cloudflare storage service exists (`VirtualUpon.Storage.CloudflareStorageService`)
- Cloudflare R2 bucket configured in `appsettings.json`

---

## Current State Analysis

### Storage Types (from `StorageTypeHelper`)
| Value | Type | Status |
|-------|------|--------|
| 1 | LocalStorage | Current default |
| 2 | Linode | Available |
| 3 | AWS S3 | Available |
| 4 | NextCloud | Available |
| 5 | Cloudflare R2 | Target |

### Media Table Schema
```sql
Media {
    Id: Guid
    OrgId: Guid
    PersonId: Guid?
    Url: string           -- Public URL or signed URL path
    StorageKey: string    -- Full storage path (used for operations)
    StorageType: int      -- 1=Local, 5=Cloudflare
    FileName: string      -- Original filename
    ...
}
```

---

## Migration Strategy

### Approach: Parallel Upload with Atomic Switch

1. **Download** file from Local Storage
2. **Upload** to Cloudflare R2 with new path
3. **Update** database record (Url, StorageKey, StorageType)
4. **Optionally delete** local file after successful migration

### Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Batch processing | Yes (configurable, max 100) | Prevent memory exhaustion |
| Concurrency | Semaphore-limited (max 10) | Balance speed vs resource usage |
| Rename files | Optional (default: yes) | Use new descriptive naming |
| Delete local after | Optional (default: no) | Safe rollback capability |
| Dry run mode | Yes (default: true) | Preview changes before execution |
| Resume capability | By OrgId/MediaKind filter | Continue after interruption |

---

## Audit Fixes Applied

| Issue | Fix | Location |
|-------|-----|----------|
| Service lifetime (Scoped→Singleton) | Use Singleton + IServiceScopeFactory | Service registration |
| Delete uses wrong URL | Store original URL before update | ProcessSingleFileAsync |
| OldPath shows new path | Store original StorageKey before update | ProcessSingleFileAsync |
| Race condition on counters | Use Interlocked for thread-safe increments | All counter updates |
| No input validation | Clamp BatchSize (1-100), MaxConcurrency (1-10) | MigrateToCloudflareAsync |
| Memory growth (FileResults) | Cap at 1000, track overflow count | ProcessSingleFileAsync |
| Inconsistent GetStatus response | Always return MigrationStatusResponse | Controller |
| Semaphore not disposed | Dispose in finally block | MigrateToCloudflareAsync |
| DbContext in Singleton | Use IServiceScopeFactory per batch | GetMediaBatchesAsync |

---

## Implementation Files

### 1. Migration DTOs

**File:** `backend/FamilyTreeApi/DTOs/StorageMigrationDtos.cs`

```csharp
using FamilyTreeApi.Models.Enums;

namespace FamilyTreeApi.DTOs;

/// <summary>
/// Request parameters for storage migration.
/// </summary>
public class MigrationRequest
{
    /// <summary>Filter to specific organization (null = all orgs)</summary>
    public Guid? OrgId { get; set; }

    /// <summary>Filter to specific media kind (null = all kinds)</summary>
    public MediaKind? MediaKind { get; set; }

    /// <summary>Preview changes without executing (default: true for safety)</summary>
    public bool DryRun { get; set; } = true;

    /// <summary>Apply new descriptive naming scheme (default: true)</summary>
    public bool RenameFiles { get; set; } = true;

    /// <summary>Delete local files after successful migration (default: false)</summary>
    public bool DeleteLocalAfter { get; set; } = false;

    /// <summary>Number of files to process per batch (1-100, default: 50)</summary>
    public int BatchSize { get; set; } = 50;

    /// <summary>Maximum files to migrate (0 = unlimited)</summary>
    public int MaxFiles { get; set; } = 0;

    /// <summary>Maximum concurrent uploads (1-10, default: 5)</summary>
    public int MaxConcurrency { get; set; } = 5;
}

/// <summary>
/// Thread-safe progress tracking for migration operation.
/// Uses Interlocked operations for counter updates.
/// </summary>
public class MigrationProgress
{
    private int _totalFiles;
    private int _processedFiles;
    private int _successCount;
    private int _failedCount;
    private int _skippedCount;
    private long _totalBytesTransferred;
    private int _resultOverflowCount;

    // AUDIT FIX: Thread-safe counter properties
    public int TotalFiles
    {
        get => Volatile.Read(ref _totalFiles);
        set => Volatile.Write(ref _totalFiles, value);
    }

    public int ProcessedFiles => Volatile.Read(ref _processedFiles);
    public int SuccessCount => Volatile.Read(ref _successCount);
    public int FailedCount => Volatile.Read(ref _failedCount);
    public int SkippedCount => Volatile.Read(ref _skippedCount);
    public long TotalBytesTransferred => Volatile.Read(ref _totalBytesTransferred);
    public int ResultOverflowCount => Volatile.Read(ref _resultOverflowCount);

    // Thread-safe increment methods
    public void IncrementProcessed() => Interlocked.Increment(ref _processedFiles);
    public void IncrementSuccess() => Interlocked.Increment(ref _successCount);
    public void IncrementFailed() => Interlocked.Increment(ref _failedCount);
    public void IncrementSkipped() => Interlocked.Increment(ref _skippedCount);
    public void AddBytesTransferred(long bytes) => Interlocked.Add(ref _totalBytesTransferred, bytes);
    public void IncrementResultOverflow() => Interlocked.Increment(ref _resultOverflowCount);

    // AUDIT FIX: Cap FileResults to prevent memory exhaustion
    public const int MaxFileResults = 1000;
    private readonly object _resultsLock = new();
    private readonly List<MigrationFileResult> _fileResults = new();
    public IReadOnlyList<MigrationFileResult> FileResults
    {
        get { lock (_resultsLock) { return _fileResults.ToList(); } }
    }

    public void AddFileResult(MigrationFileResult result)
    {
        lock (_resultsLock)
        {
            if (_fileResults.Count < MaxFileResults)
                _fileResults.Add(result);
            else
                IncrementResultOverflow();
        }
    }

    private readonly object _errorsLock = new();
    private readonly List<MigrationError> _errors = new();
    public IReadOnlyList<MigrationError> Errors
    {
        get { lock (_errorsLock) { return _errors.ToList(); } }
    }

    public void AddError(MigrationError error)
    {
        lock (_errorsLock)
        {
            // Keep last 100 errors
            if (_errors.Count >= 100)
                _errors.RemoveAt(0);
            _errors.Add(error);
        }
    }

    public DateTime StartedAt { get; set; }
    public DateTime? CompletedAt { get; set; }
    public string? CurrentFile { get; set; }

    public bool IsComplete => CompletedAt.HasValue;
    public bool IsRunning => StartedAt != default && !CompletedAt.HasValue;
    public double ProgressPercent => TotalFiles > 0 ? (ProcessedFiles * 100.0 / TotalFiles) : 0;
    public TimeSpan? Duration => CompletedAt.HasValue
        ? CompletedAt.Value - StartedAt
        : (StartedAt != default ? DateTime.UtcNow - StartedAt : null);
}

/// <summary>
/// Result for a single migrated file.
/// </summary>
public class MigrationFileResult
{
    public Guid MediaId { get; set; }
    public string OldPath { get; set; } = string.Empty;
    public string NewPath { get; set; } = string.Empty;
    public long FileSize { get; set; }
}

/// <summary>
/// Error information for a failed migration.
/// </summary>
public class MigrationError
{
    public Guid MediaId { get; set; }
    public string FileName { get; set; } = string.Empty;
    public string OldPath { get; set; } = string.Empty;
    public string ErrorMessage { get; set; } = string.Empty;
    public DateTime OccurredAt { get; set; } = DateTime.UtcNow;
}

/// <summary>
/// Overall migration result.
/// </summary>
public class MigrationResult
{
    public bool Success { get; set; }
    public MigrationProgress Progress { get; set; } = new();
    public string Message { get; set; } = string.Empty;
}

/// <summary>
/// Summary of pending migrations.
/// </summary>
public class MigrationPendingCount
{
    public int TotalLocalFiles { get; set; }
    public long TotalBytes { get; set; }
    public Dictionary<string, int> ByMediaKind { get; set; } = new();
    public Dictionary<Guid, int> ByOrg { get; set; } = new();
}

/// <summary>
/// AUDIT FIX: Consistent response type for status endpoint.
/// </summary>
public class MigrationStatusResponse
{
    public bool IsRunning { get; set; }
    public string Message { get; set; } = string.Empty;
    public MigrationProgress? Progress { get; set; }
}
```

### 2. Migration Service Interface

**File:** `backend/FamilyTreeApi/Services/IStorageMigrationService.cs`

```csharp
using FamilyTreeApi.DTOs;

namespace FamilyTreeApi.Services;

public interface IStorageMigrationService
{
    /// <summary>
    /// Get count of files pending migration from local storage.
    /// </summary>
    Task<MigrationPendingCount> GetPendingCountAsync(CancellationToken cancellationToken = default);

    /// <summary>
    /// Get current migration status.
    /// </summary>
    MigrationStatusResponse GetStatus();

    /// <summary>
    /// Check if a migration is currently running.
    /// </summary>
    bool IsMigrationRunning { get; }

    /// <summary>
    /// Start migration from local storage to Cloudflare R2.
    /// </summary>
    Task<MigrationResult> MigrateToCloudflareAsync(
        MigrationRequest request,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Cancel a running migration.
    /// </summary>
    void CancelMigration();
}
```

### 3. Migration Service Implementation

**File:** `backend/FamilyTreeApi/Services/StorageMigrationService.cs`

```csharp
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
/// AUDIT FIX: Registered as Singleton, uses IServiceScopeFactory for DbContext.
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

    // AUDIT FIX: Input validation limits
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
        // AUDIT FIX: Use scoped DbContext
        using var scope = _scopeFactory.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

        var query = context.MediaFiles
            .Where(m => m.StorageType == LocalStorageType)
            .AsNoTracking();

        var totalCount = await query.CountAsync(cancellationToken);
        var totalBytes = await query.SumAsync(m => m.FileSize ?? 0, cancellationToken);

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
        // AUDIT FIX: Validate and clamp input parameters
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

        // AUDIT FIX: Dispose semaphore in finally
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

            // Process in batches
            var skip = 0;
            var totalProcessed = 0;

            while (totalProcessed < _currentProgress.TotalFiles)
            {
                linkedToken.ThrowIfCancellationRequested();

                var batchSize = Math.Min(request.BatchSize, _currentProgress.TotalFiles - totalProcessed);

                // AUDIT FIX: Use scoped DbContext per batch
                using var scope = _scopeFactory.CreateScope();
                var context = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

                var query = context.MediaFiles
                    .Where(m => m.StorageType == LocalStorageType)
                    .AsQueryable();

                if (request.OrgId.HasValue)
                    query = query.Where(m => m.OrgId == request.OrgId.Value);

                if (request.MediaKind.HasValue)
                    query = query.Where(m => m.Kind == request.MediaKind.Value);

                var batch = await query
                    .OrderBy(m => m.Id)
                    .Skip(skip)
                    .Take(batchSize)
                    .Include(m => m.Person)
                        .ThenInclude(p => p!.Org)
                    .ToListAsync(linkedToken);

                if (batch.Count == 0)
                    break;

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

                skip += batch.Count;
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
            // AUDIT FIX: Dispose semaphore
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
        try
        {
            // AUDIT FIX: Thread-safe increment
            _currentProgress!.IncrementProcessed();
            _currentProgress.CurrentFile = media.FileName;

            // AUDIT FIX: Store original values BEFORE any modifications
            var originalUrl = media.Url;
            var originalStorageKey = media.StorageKey ?? "";

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
                    OldPath = originalStorageKey,  // AUDIT FIX: Use stored original
                    NewPath = newStorageKey,
                    FileSize = media.FileSize ?? 0
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

            if (!uploadResult.IsSuccessful)
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
                OldPath = originalStorageKey,  // AUDIT FIX: Use stored original
                NewPath = newStorageKey,
                FileSize = downloadResult.FileData.Length
            });

            // AUDIT FIX: Delete using ORIGINAL URL (not the updated one)
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

            _logger.LogDebug("Migrated {MediaId}: {OldPath} → {NewPath}",
                media.Id, originalStorageKey, newStorageKey);
        }
        catch (Exception ex)
        {
            _currentProgress!.IncrementFailed();
            _currentProgress.AddError(new MigrationError
            {
                MediaId = media.Id,
                FileName = media.FileName ?? "",
                OldPath = media.StorageKey ?? "",
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
```

### 4. Admin Controller

**File:** `backend/FamilyTreeApi/Controllers/Admin/StorageMigrationController.cs`

```csharp
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using FamilyTreeApi.DTOs;
using FamilyTreeApi.Services;

namespace FamilyTreeApi.Controllers.Admin;

[ApiController]
[Route("api/admin/storage-migration")]
[Authorize(Roles = "Admin,SuperAdmin")]
public class StorageMigrationController : ControllerBase
{
    private readonly IStorageMigrationService _migrationService;
    private readonly ILogger<StorageMigrationController> _logger;

    public StorageMigrationController(
        IStorageMigrationService migrationService,
        ILogger<StorageMigrationController> logger)
    {
        _migrationService = migrationService;
        _logger = logger;
    }

    /// <summary>
    /// Get count of files pending migration from local storage.
    /// </summary>
    [HttpGet("pending-count")]
    public async Task<ActionResult<MigrationPendingCount>> GetPendingCount(CancellationToken cancellationToken)
    {
        var result = await _migrationService.GetPendingCountAsync(cancellationToken);
        return Ok(result);
    }

    /// <summary>
    /// Get current migration status/progress.
    /// AUDIT FIX: Always returns consistent MigrationStatusResponse type.
    /// </summary>
    [HttpGet("status")]
    public ActionResult<MigrationStatusResponse> GetStatus()
    {
        var status = _migrationService.GetStatus();
        return Ok(status);
    }

    /// <summary>
    /// Start migration from local storage to Cloudflare R2.
    /// Use dryRun=true to preview changes without executing.
    /// </summary>
    [HttpPost("migrate-to-cloudflare")]
    public async Task<ActionResult<MigrationResult>> MigrateToCloudflare(
        [FromBody] MigrationRequest request,
        CancellationToken cancellationToken)
    {
        _logger.LogInformation(
            "Migration requested: DryRun={DryRun}, OrgId={OrgId}, MaxFiles={MaxFiles}, BatchSize={BatchSize}, Concurrency={Concurrency}",
            request.DryRun, request.OrgId, request.MaxFiles, request.BatchSize, request.MaxConcurrency);

        var result = await _migrationService.MigrateToCloudflareAsync(request, cancellationToken);

        if (!result.Success && _migrationService.IsMigrationRunning)
        {
            return Conflict(result);
        }

        return Ok(result);
    }

    /// <summary>
    /// Preview migration changes without executing (shorthand for dryRun=true).
    /// </summary>
    [HttpPost("preview")]
    public async Task<ActionResult<MigrationResult>> PreviewMigration(
        [FromBody] MigrationRequest request,
        CancellationToken cancellationToken)
    {
        request.DryRun = true;
        return await MigrateToCloudflare(request, cancellationToken);
    }

    /// <summary>
    /// Cancel a running migration.
    /// </summary>
    [HttpPost("cancel")]
    public ActionResult CancelMigration()
    {
        if (!_migrationService.IsMigrationRunning)
        {
            return BadRequest(new { message = "No migration is currently running" });
        }

        _migrationService.CancelMigration();
        return Ok(new { message = "Cancellation requested" });
    }
}
```

### 5. Service Registration

**File:** `backend/FamilyTreeApi/Program.cs`

Add to service registration:
```csharp
// AUDIT FIX: Register as Singleton (service has instance state for progress tracking)
services.AddSingleton<IStorageMigrationService, StorageMigrationService>();
```

---

## API Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/admin/storage-migration/pending-count` | Count files pending migration |
| GET | `/api/admin/storage-migration/status` | Get current migration progress |
| POST | `/api/admin/storage-migration/migrate-to-cloudflare` | Start migration |
| POST | `/api/admin/storage-migration/preview` | Preview changes (dry run) |
| POST | `/api/admin/storage-migration/cancel` | Cancel running migration |

---

## Safety Features

| Feature | Description |
|---------|-------------|
| Dry Run Default | `dryRun: true` by default - must explicitly set to `false` |
| No Auto-Delete | `deleteLocalAfter: false` by default - keeps local files |
| Batch Processing | Capped at 100 per batch to prevent memory exhaustion |
| Concurrency Limit | Capped at 10 concurrent uploads |
| Thread-Safe Counters | Uses `Interlocked` for all counter updates |
| Result Capping | FileResults capped at 1000 to prevent OOM |
| Scoped DbContext | Uses `IServiceScopeFactory` for proper DbContext lifecycle |
| Cancellation | Can cancel running migration at any time |
| Error Tracking | Last 100 errors tracked with details |
| Atomic Updates | Database updated only after successful upload |
| Admin Only | Requires Admin or SuperAdmin role |
| Original Values Preserved | Stores original URL/StorageKey before modification |

---

## Verification Checklist

### Pre-Migration
- [ ] Cloudflare R2 bucket configured
- [ ] Credentials in appsettings.json
- [ ] Test connection to R2 (upload/download test file)
- [ ] Backup database

### Migration
- [ ] Run preview first (dryRun=true)
- [ ] Verify path transformations look correct
- [ ] Start with small batch (maxFiles=10)
- [ ] Monitor progress via status endpoint
- [ ] Check for errors in response

### Post-Migration
- [ ] Verify files accessible via new URLs
- [ ] Check database StorageType updated to 5
- [ ] Test signed URL generation
- [ ] Optionally clean up local files (after verification)

---

## Files Summary

| File | Action | Purpose |
|------|--------|---------|
| `DTOs/StorageMigrationDtos.cs` | Create | Request/response DTOs with thread-safe progress |
| `Services/IStorageMigrationService.cs` | Create | Service interface |
| `Services/StorageMigrationService.cs` | Create | Migration logic with all audit fixes |
| `Controllers/Admin/StorageMigrationController.cs` | Create | Admin API endpoints |
| `Program.cs` | Modify | Register as Singleton |
