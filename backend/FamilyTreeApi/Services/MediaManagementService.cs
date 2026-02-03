// File: Services/MediaManagementService.cs
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using FamilyTreeApi.Data;
using FamilyTreeApi.DTOs;
using FamilyTreeApi.Models;
using FamilyTreeApi.Models.Enums;
using FamilyTreeApi.Utilities;
using VirtualUpon.Storage.Factories;
using VirtualUpon.Storage.Dto;

namespace FamilyTreeApi.Services;

/// <summary>
/// Media management service implementation containing all business logic.
/// Uses ApplicationDbContext for data access and VirtualUpon.Storage.IStorageService for file operations.
/// </summary>
public class MediaManagementService : IMediaManagementService
{
    private readonly ApplicationDbContext _context;
    private readonly VirtualUpon.Storage.Factories.IStorageService _storageService;
    private readonly ILogger<MediaManagementService> _logger;

    private static readonly string[] AllowedImageTypes = { "image/jpeg", "image/png", "image/gif", "image/webp", "image/heic" };
    private static readonly string[] AllowedVideoTypes = { "video/mp4", "video/webm", "video/quicktime" };
    private static readonly string[] AllowedAudioTypes = { "audio/mpeg", "audio/wav", "audio/ogg" };
    private static readonly string[] AllowedDocumentTypes = { "application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document" };
    private const long MaxFileSizeBytes = 50 * 1024 * 1024;

    public MediaManagementService(
        ApplicationDbContext context,
        VirtualUpon.Storage.Factories.IStorageService storageService,
        ILogger<MediaManagementService> logger)
    {
        _context = context;
        _storageService = storageService;
        _logger = logger;
    }

    // ============================================================================
    // HELPER METHODS
    // ============================================================================

    /// <summary>
    /// Get the effective organization ID for a user.
    /// First checks the token claim, then falls back to looking up OrgUser records.
    /// </summary>
    private async Task<Guid?> GetEffectiveOrgIdAsync(UserContext userContext, CancellationToken cancellationToken = default)
    {
        if (userContext.OrgId.HasValue)
        {
            return userContext.OrgId.Value;
        }

        // Fall back to looking up user's organization from OrgUser records
        return await _context.OrgUsers
            .Where(ou => ou.UserId == userContext.UserId)
            .Select(ou => ou.OrgId)
            .FirstOrDefaultAsync(cancellationToken);
    }

    // ============================================================================
    // MEDIA OPERATIONS
    // ============================================================================

    public async Task<ServiceResult<MediaSearchResponse>> SearchMediaAsync(
        MediaSearchRequest request,
        UserContext userContext,
        CancellationToken cancellationToken = default)
    {
        try
        {
            // Enforce maximum page size to prevent DoS
            const int MaxPageSize = 100;
            if (request.PageSize > MaxPageSize)
            {
                request.PageSize = MaxPageSize;
            }
            if (request.PageSize < 1)
            {
                request.PageSize = 20;
            }
            if (request.Page < 1)
            {
                request.Page = 1;
            }

            // Get orgId from context, or fall back to looking up user's organization
            var orgId = await GetEffectiveOrgIdAsync(userContext, cancellationToken);

            if (orgId == null)
            {
                return ServiceResult<MediaSearchResponse>.Failure("You must be a member of an organization to view media.");
            }

            var effectiveOrgId = orgId.Value;

            var query = _context.MediaFiles
                .Where(m => m.OrgId == effectiveOrgId)
                .AsQueryable();

            // Exclude avatar media by default (media used as person profile pictures)
            // Uses NOT EXISTS pattern for efficient query execution
            if (request.ExcludeAvatars)
            {
                query = query.Where(m => !_context.People
                    .Any(p => p.OrgId == effectiveOrgId && p.AvatarMediaId == m.Id));
            }

            if (request.Kind.HasValue)
            {
                query = query.Where(m => m.Kind == request.Kind.Value);
            }

            if (request.PersonId.HasValue)
            {
                query = query.Where(m => m.PersonId == request.PersonId.Value);
            }

            if (request.CaptureDateFrom.HasValue)
            {
                query = query.Where(m => m.CaptureDate >= request.CaptureDateFrom.Value);
            }

            if (request.CaptureDateTo.HasValue)
            {
                query = query.Where(m => m.CaptureDate <= request.CaptureDateTo.Value);
            }

            if (request.CapturePlaceId.HasValue)
            {
                query = query.Where(m => m.CapturePlaceId == request.CapturePlaceId.Value);
            }

            if (!string.IsNullOrWhiteSpace(request.SearchTerm))
            {
                var searchTerm = request.SearchTerm.ToLower();
                query = query.Where(m =>
                    (m.Title != null && m.Title.ToLower().Contains(searchTerm)) ||
                    (m.Description != null && m.Description.ToLower().Contains(searchTerm)) ||
                    (m.FileName != null && m.FileName.ToLower().Contains(searchTerm)));
            }

            var totalCount = await query.CountAsync(cancellationToken);
            var totalPages = (int)Math.Ceiling(totalCount / (double)request.PageSize);

            // CRITICAL: Pagination happens at DB level BEFORE projection
            // LinkedPersons are projected inline to avoid N+1 queries
            var media = await query
                .OrderByDescending(m => m.CaptureDate)
                .ThenByDescending(m => m.CreatedAt)
                .Skip((request.Page - 1) * request.PageSize)
                .Take(request.PageSize)
                .Select(m => new MediaResponse
                {
                    Id = m.Id,
                    OrgId = m.OrgId,
                    PersonId = m.PersonId,
                    Kind = m.Kind,
                    Url = m.Url,
                    StorageKey = m.StorageKey,
                    FileName = m.FileName,
                    MimeType = m.MimeType,
                    FileSize = m.FileSize,
                    Title = m.Title,
                    Description = m.Description,
                    CaptureDate = m.CaptureDate,
                    CapturePlaceId = m.CapturePlaceId,
                    PlaceName = m.CapturePlace != null ? m.CapturePlace.Name : null,
                    Visibility = m.Visibility,
                    Copyright = m.Copyright,
                    ThumbnailPath = m.ThumbnailPath,
                    MetadataJson = m.MetadataJson,
                    CreatedAt = m.CreatedAt,
                    UpdatedAt = m.UpdatedAt,
                    // Project linked persons inline - EF Core generates efficient JOIN
                    LinkedPersons = m.PersonLinks
                        .Select(pl => new LinkedPersonDto(
                            pl.PersonId,
                            pl.Person != null
                                ? (pl.Person.PrimaryName ?? pl.Person.NameEnglish ?? pl.Person.NameArabic ?? "Unknown")
                                : "Unknown",
                            pl.IsPrimary,
                            pl.Notes,
                            pl.NotesAr,
                            pl.NotesNob,
                            pl.LinkedAt
                        ))
                        .ToList()
                })
                .ToListAsync(cancellationToken);

            var response = new MediaSearchResponse
            {
                Media = media,
                TotalCount = totalCount,
                Page = request.Page,
                PageSize = request.PageSize,
                TotalPages = totalPages
            };

            return ServiceResult<MediaSearchResponse>.Success(response);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error searching media for organization {OrgId}", userContext.OrgId);
            return ServiceResult<MediaSearchResponse>.InternalError("Error searching media");
        }
    }

    public async Task<ServiceResult<MediaResponse>> GetMediaAsync(
        Guid id,
        UserContext userContext,
        CancellationToken cancellationToken = default)
    {
        try
        {
            var orgId = await GetEffectiveOrgIdAsync(userContext, cancellationToken);
            if (orgId == null)
            {
                return ServiceResult<MediaResponse>.Failure("You must be a member of an organization to view media.");
            }

            var media = await _context.MediaFiles
                .Where(m => m.Id == id && m.OrgId == orgId.Value)
                .Include(m => m.CapturePlace)
                .Select(m => new MediaResponse
                {
                    Id = m.Id,
                    OrgId = m.OrgId,
                    PersonId = m.PersonId,
                    Kind = m.Kind,
                    Url = m.Url,
                    StorageKey = m.StorageKey,
                    FileName = m.FileName,
                    MimeType = m.MimeType,
                    FileSize = m.FileSize,
                    Title = m.Title,
                    Description = m.Description,
                    CaptureDate = m.CaptureDate,
                    CapturePlaceId = m.CapturePlaceId,
                    PlaceName = m.CapturePlace != null ? m.CapturePlace.Name : null,
                    Visibility = m.Visibility,
                    Copyright = m.Copyright,
                    ThumbnailPath = m.ThumbnailPath,
                    MetadataJson = m.MetadataJson,
                    CreatedAt = m.CreatedAt,
                    UpdatedAt = m.UpdatedAt
                })
                .FirstOrDefaultAsync(cancellationToken);

            if (media == null)
            {
                return ServiceResult<MediaResponse>.NotFound("Media not found");
            }

            return ServiceResult<MediaResponse>.Success(media);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting media {MediaId}", id);
            return ServiceResult<MediaResponse>.InternalError("Error loading media");
        }
    }

    public async Task<ServiceResult<MediaResponse>> UploadMediaAsync(
        MediaUploadRequest request,
        IFormFile file,
        UserContext userContext,
        CancellationToken cancellationToken = default)
    {
        if (!userContext.CanContribute())
        {
            return ServiceResult<MediaResponse>.Forbidden();
        }

        try
        {
            var orgId = await GetEffectiveOrgIdAsync(userContext, cancellationToken);
            if (orgId == null)
            {
                return ServiceResult<MediaResponse>.Failure("You must be a member of an organization to upload media.");
            }

            if (file == null || file.Length == 0)
            {
                return ServiceResult<MediaResponse>.Failure("No file uploaded");
            }

            if (file.Length > MaxFileSizeBytes)
            {
                return ServiceResult<MediaResponse>.Failure($"File size exceeds maximum allowed size of {MaxFileSizeBytes / (1024 * 1024)}MB");
            }

            var contentType = file.ContentType.ToLower();
            var mediaKind = DetermineMediaKind(contentType);

            if (mediaKind == null || !IsAllowedContentType(contentType, mediaKind.Value))
            {
                return ServiceResult<MediaResponse>.Failure("File type not allowed");
            }

            var effectiveOrgId = orgId.Value;

            if (request.CapturePlaceId.HasValue)
            {
                var placeExists = await _context.Places.AnyAsync(
                    p => p.Id == request.CapturePlaceId.Value && p.OrgId == effectiveOrgId,
                    cancellationToken);

                if (!placeExists)
                {
                    return ServiceResult<MediaResponse>.Failure("Place not found in organization");
                }
            }

            string fileUrl;
            string storageKey;
            var mediaId = Guid.NewGuid();

            try
            {
                // Read file bytes
                using var memoryStream = new MemoryStream();
                await file.CopyToAsync(memoryStream, cancellationToken);
                var fileBytes = memoryStream.ToArray();

                // Get org name for descriptive path
                var org = await _context.Orgs
                    .AsNoTracking()
                    .FirstOrDefaultAsync(o => o.Id == effectiveOrgId, cancellationToken);
                var orgName = org?.Name ?? "unknown-org";

                // Generate descriptive path using MediaPathBuilder
                var extension = Path.GetExtension(file.FileName);
                string[] pathSegments;
                string uniqueFileName;

                try
                {
                    // For org-level media (no person), use org-media as person placeholder
                    (pathSegments, uniqueFileName) = MediaPathBuilder.BuildDescriptivePath(
                        orgName,
                        "org-media",  // Placeholder for org-level media
                        mediaKind.Value.ToString(),
                        DateTime.UtcNow,
                        mediaId,
                        extension);
                }
                catch (ArgumentException ex)
                {
                    _logger.LogWarning(ex, "Invalid file parameters for upload, falling back to legacy naming");
                    // Fallback to legacy naming if validation fails
                    uniqueFileName = $"{mediaKind.Value}_{mediaId}{extension}";
                    pathSegments = new[] { "family-tree", "orgs", effectiveOrgId.ToString(), mediaKind.Value.ToString().ToLowerInvariant() };
                }

                // Upload to VirtualUpon.Storage
                var savedMediaInfo = await _storageService.UploadFileAsync(pathSegments, uniqueFileName, fileBytes);

                fileUrl = savedMediaInfo.ImagePath;
                storageKey = MediaPathBuilder.BuildStorageKey(pathSegments, uniqueFileName);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to upload media file");
                return ServiceResult<MediaResponse>.InternalError("Failed to upload file");
            }

            var media = new Media
            {
                Id = mediaId,
                OrgId = effectiveOrgId,
                Kind = mediaKind.Value,
                Url = fileUrl,
                StorageKey = storageKey,
                FileName = file.FileName,
                MimeType = contentType,
                FileSize = file.Length,
                Title = request.Title,
                Description = request.Description,
                CaptureDate = request.CaptureDate,
                CapturePlaceId = request.CapturePlaceId,
                Visibility = request.Visibility,
                Copyright = request.Copyright,
                MetadataJson = request.MetadataJson,
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow
            };

            _context.MediaFiles.Add(media);
            await _context.SaveChangesAsync(cancellationToken);

            _logger.LogInformation("Media uploaded: {MediaId} in Org: {OrgId}", media.Id, effectiveOrgId);

            // Reload with includes for response
            var response = await GetMediaDtoAsync(media.Id, effectiveOrgId, cancellationToken);

            return ServiceResult<MediaResponse>.Success(response!);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error uploading media for organization {OrgId}", userContext.OrgId);
            return ServiceResult<MediaResponse>.InternalError("Error uploading media");
        }
    }

    public async Task<ServiceResult<MediaResponse>> UpdateMediaAsync(
        Guid id,
        MediaUpdateRequest request,
        UserContext userContext,
        CancellationToken cancellationToken = default)
    {
        if (!userContext.CanEdit())
        {
            return ServiceResult<MediaResponse>.Forbidden();
        }

        try
        {
            var orgId = await GetEffectiveOrgIdAsync(userContext, cancellationToken);
            if (orgId == null)
            {
                return ServiceResult<MediaResponse>.Failure("You must be a member of an organization to update media.");
            }

            var effectiveOrgId = orgId.Value;

            var media = await _context.MediaFiles.FirstOrDefaultAsync(
                m => m.Id == id && m.OrgId == effectiveOrgId,
                cancellationToken);

            if (media == null)
            {
                return ServiceResult<MediaResponse>.NotFound("Media not found");
            }

            if (request.CapturePlaceId.HasValue)
            {
                var placeExists = await _context.Places.AnyAsync(
                    p => p.Id == request.CapturePlaceId.Value && p.OrgId == effectiveOrgId,
                    cancellationToken);

                if (!placeExists)
                {
                    return ServiceResult<MediaResponse>.Failure("Place not found in organization");
                }
                media.CapturePlaceId = request.CapturePlaceId.Value;
            }

            if (request.Title != null) media.Title = request.Title;
            if (request.Description != null) media.Description = request.Description;
            if (request.CaptureDate.HasValue) media.CaptureDate = request.CaptureDate.Value;
            if (request.Visibility.HasValue) media.Visibility = request.Visibility.Value;
            if (request.Copyright != null) media.Copyright = request.Copyright;
            if (request.MetadataJson != null) media.MetadataJson = request.MetadataJson;

            media.UpdatedAt = DateTime.UtcNow;

            await _context.SaveChangesAsync(cancellationToken);

            _logger.LogInformation("Media updated: {MediaId}", id);

            var response = await GetMediaDtoAsync(media.Id, effectiveOrgId, cancellationToken);

            return ServiceResult<MediaResponse>.Success(response!);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error updating media {MediaId}", id);
            return ServiceResult<MediaResponse>.InternalError("Error updating media");
        }
    }

    public async Task<ServiceResult> DeleteMediaAsync(
        Guid id,
        UserContext userContext,
        CancellationToken cancellationToken = default)
    {
        if (!userContext.CanEdit())
        {
            return ServiceResult.Forbidden();
        }

        try
        {
            var orgId = await GetEffectiveOrgIdAsync(userContext, cancellationToken);
            if (orgId == null)
            {
                return ServiceResult.Failure("You must be a member of an organization to delete media.");
            }

            var media = await _context.MediaFiles.FirstOrDefaultAsync(
                m => m.Id == id && m.OrgId == orgId.Value,
                cancellationToken);

            if (media == null)
            {
                return ServiceResult.NotFound("Media not found");
            }

            try
            {
                var deleteResult = await _storageService.DeleteFileAsync(media.Url);
                if (!deleteResult.IsSuccessful)
                {
                    _logger.LogWarning("Failed to delete media file from storage: {Error}", deleteResult.ErrorMessage);
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to delete media file from storage for media {MediaId}", id);
            }

            _context.MediaFiles.Remove(media);
            await _context.SaveChangesAsync(cancellationToken);

            _logger.LogInformation("Media deleted: {MediaId}", id);

            return ServiceResult.Success();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error deleting media {MediaId}", id);
            return ServiceResult.InternalError("Error deleting media");
        }
    }

    public async Task<ServiceResult<(byte[] Data, string ContentType, string FileName)>> DownloadMediaAsync(
        Guid id,
        UserContext userContext,
        CancellationToken cancellationToken = default)
    {
        try
        {
            var orgId = await GetEffectiveOrgIdAsync(userContext, cancellationToken);
            if (orgId == null)
            {
                return ServiceResult<(byte[] Data, string ContentType, string FileName)>.Failure("You must be a member of an organization to download media.");
            }

            var media = await _context.MediaFiles.FirstOrDefaultAsync(
                m => m.Id == id && m.OrgId == orgId.Value,
                cancellationToken);

            if (media == null)
            {
                return ServiceResult<(byte[] Data, string ContentType, string FileName)>.NotFound("Media not found");
            }

            try
            {
                var response = await _storageService.DownloadFileAsync(media.Url);

                if (!response.IsSuccessful || response.FileData == null)
                {
                    return ServiceResult<(byte[] Data, string ContentType, string FileName)>.NotFound("Media file data not found");
                }

                var fileName = media.FileName ?? media.Title ?? $"media_{media.Id}";
                var contentType = media.MimeType ?? "application/octet-stream";

                return ServiceResult<(byte[] Data, string ContentType, string FileName)>.Success((response.FileData, contentType, fileName));
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to download media file {MediaId}", id);
                return ServiceResult<(byte[] Data, string ContentType, string FileName)>.InternalError("Failed to download file");
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error downloading media {MediaId}", id);
            return ServiceResult<(byte[] Data, string ContentType, string FileName)>.InternalError("Error downloading media");
        }
    }

    // ============================================================================
    // SIGNED URL METHODS
    // ============================================================================

    public async Task<ServiceResult<SignedMediaUrlDto>> GetSignedUrlAsync(
        Guid id,
        int expiresInSeconds,
        UserContext userContext,
        CancellationToken cancellationToken = default)
    {
        try
        {
            var orgId = await GetEffectiveOrgIdAsync(userContext, cancellationToken);
            if (orgId == null)
            {
                return ServiceResult<SignedMediaUrlDto>.Failure("You must be a member of an organization.");
            }

            var media = await _context.MediaFiles
                .FirstOrDefaultAsync(m => m.Id == id && m.OrgId == orgId.Value, cancellationToken);

            if (media == null)
            {
                return ServiceResult<SignedMediaUrlDto>.NotFound("Media not found");
            }

            var result = await _storageService.GetSignedUrlAsync(media.Url, expiresInSeconds);
            if (!result.IsSuccessful)
            {
                return ServiceResult<SignedMediaUrlDto>.Failure(result.ErrorMessage ?? "Failed to generate signed URL");
            }

            return ServiceResult<SignedMediaUrlDto>.Success(new SignedMediaUrlDto
            {
                Url = result.Url!,
                ExpiresAt = result.ExpiresAt!.Value,
                ContentType = result.ContentType ?? media.MimeType ?? "application/octet-stream"
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error generating signed URL for media {MediaId}", id);
            return ServiceResult<SignedMediaUrlDto>.InternalError("Error generating signed URL");
        }
    }

    // ============================================================================
    // PRIVATE HELPER METHODS
    // ============================================================================

    private async Task<MediaResponse?> GetMediaDtoAsync(Guid id, Guid orgId, CancellationToken cancellationToken)
    {
        return await _context.MediaFiles
            .Where(m => m.Id == id && m.OrgId == orgId)
            .Include(m => m.CapturePlace)
            .Select(m => new MediaResponse
            {
                Id = m.Id,
                OrgId = m.OrgId,
                PersonId = m.PersonId,
                Kind = m.Kind,
                Url = m.Url,
                StorageKey = m.StorageKey,
                FileName = m.FileName,
                MimeType = m.MimeType,
                FileSize = m.FileSize,
                Title = m.Title,
                Description = m.Description,
                CaptureDate = m.CaptureDate,
                CapturePlaceId = m.CapturePlaceId,
                PlaceName = m.CapturePlace != null ? m.CapturePlace.Name : null,
                Visibility = m.Visibility,
                Copyright = m.Copyright,
                ThumbnailPath = m.ThumbnailPath,
                MetadataJson = m.MetadataJson,
                CreatedAt = m.CreatedAt,
                UpdatedAt = m.UpdatedAt
            })
            .FirstOrDefaultAsync(cancellationToken);
    }

    private static MediaKind? DetermineMediaKind(string contentType)
    {
        return contentType.Split('/')[0] switch
        {
            "image" => MediaKind.Image,
            "video" => MediaKind.Video,
            "audio" => MediaKind.Audio,
            "application" => MediaKind.Document,
            _ => null
        };
    }

    private static bool IsAllowedContentType(string contentType, MediaKind mediaKind)
    {
        return mediaKind switch
        {
            MediaKind.Image => AllowedImageTypes.Contains(contentType),
            MediaKind.Video => AllowedVideoTypes.Contains(contentType),
            MediaKind.Audio => AllowedAudioTypes.Contains(contentType),
            MediaKind.Document => AllowedDocumentTypes.Contains(contentType),
            _ => false
        };
    }
}
