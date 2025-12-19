// File: Services/MediaManagementService.cs
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using FamilyTreeApi.Data;
using FamilyTreeApi.DTOs;
using FamilyTreeApi.Models;
using FamilyTreeApi.Models.Enums;
using VirtualUpon.Storage.Factories;

namespace FamilyTreeApi.Services;

/// <summary>
/// Media management service implementation containing all business logic.
/// Uses ApplicationDbContext for data access and IStorageService for file operations.
/// </summary>
public class MediaManagementService : IMediaManagementService
{
    private readonly ApplicationDbContext _context;
    private readonly IStorageService _storageService;
    private readonly ILogger<MediaManagementService> _logger;

    private static readonly string[] AllowedImageTypes = { "image/jpeg", "image/png", "image/gif", "image/webp", "image/heic" };
    private static readonly string[] AllowedVideoTypes = { "video/mp4", "video/webm", "video/quicktime" };
    private static readonly string[] AllowedAudioTypes = { "audio/mpeg", "audio/wav", "audio/ogg" };
    private static readonly string[] AllowedDocumentTypes = { "application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document" };
    private const long MaxFileSizeBytes = 50 * 1024 * 1024;

    public MediaManagementService(
        ApplicationDbContext context,
        IStorageService storageService,
        ILogger<MediaManagementService> logger)
    {
        _context = context;
        _storageService = storageService;
        _logger = logger;
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
            if (userContext.OrgId == null)
            {
                return ServiceResult<MediaSearchResponse>.Failure("You must be a member of an organization to view media.");
            }

            var orgId = userContext.OrgId.Value;

            var query = _context.MediaFiles
                .Where(m => m.OrgId == orgId)
                .AsQueryable();

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

            var media = await query
                .OrderByDescending(m => m.CaptureDate)
                .ThenByDescending(m => m.CreatedAt)
                .Skip((request.Page - 1) * request.PageSize)
                .Take(request.PageSize)
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
            if (userContext.OrgId == null)
            {
                return ServiceResult<MediaResponse>.Failure("You must be a member of an organization to view media.");
            }

            var orgId = userContext.OrgId.Value;

            var media = await _context.MediaFiles
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
            if (userContext.OrgId == null)
            {
                return ServiceResult<MediaResponse>.Failure("You must be a member of an organization to upload media.");
            }

            var orgId = userContext.OrgId.Value;

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

            if (request.CapturePlaceId.HasValue)
            {
                var placeExists = await _context.Places.AnyAsync(
                    p => p.Id == request.CapturePlaceId.Value && p.OrgId == orgId,
                    cancellationToken);

                if (!placeExists)
                {
                    return ServiceResult<MediaResponse>.Failure("Place not found in organization");
                }
            }

            string fileUrl;
            string storageKey;

            try
            {
                // Read file bytes
                using var memoryStream = new MemoryStream();
                await file.CopyToAsync(memoryStream, cancellationToken);
                var fileBytes = memoryStream.ToArray();

                // Generate unique filename
                var extension = Path.GetExtension(file.FileName);
                var uniqueFileName = $"{mediaKind}_{Guid.NewGuid()}{extension}";

                // Define storage path
                string[] pathSegments = new[] { "family-tree", "orgs", orgId.ToString(), mediaKind.ToString().ToLower() };

                // Upload to VirtualUpon.Storage
                var savedMediaInfo = await _storageService.UploadFileAsync(pathSegments, uniqueFileName, fileBytes);

                fileUrl = savedMediaInfo.ImagePath;
                storageKey = $"{string.Join("/", pathSegments)}/{uniqueFileName}";
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to upload media file");
                return ServiceResult<MediaResponse>.InternalError("Failed to upload file");
            }

            var media = new Media
            {
                Id = Guid.NewGuid(),
                OrgId = orgId,
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

            _logger.LogInformation("Media uploaded: {MediaId} in Org: {OrgId}", media.Id, orgId);

            // Reload with includes for response
            var response = await GetMediaDtoAsync(media.Id, orgId, cancellationToken);

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
            if (userContext.OrgId == null)
            {
                return ServiceResult<MediaResponse>.Failure("You must be a member of an organization to update media.");
            }

            var orgId = userContext.OrgId.Value;

            var media = await _context.MediaFiles.FirstOrDefaultAsync(
                m => m.Id == id && m.OrgId == orgId,
                cancellationToken);

            if (media == null)
            {
                return ServiceResult<MediaResponse>.NotFound("Media not found");
            }

            if (request.CapturePlaceId.HasValue)
            {
                var placeExists = await _context.Places.AnyAsync(
                    p => p.Id == request.CapturePlaceId.Value && p.OrgId == orgId,
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

            var response = await GetMediaDtoAsync(media.Id, orgId, cancellationToken);

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
            if (userContext.OrgId == null)
            {
                return ServiceResult.Failure("You must be a member of an organization to delete media.");
            }

            var orgId = userContext.OrgId.Value;

            var media = await _context.MediaFiles.FirstOrDefaultAsync(
                m => m.Id == id && m.OrgId == orgId,
                cancellationToken);

            if (media == null)
            {
                return ServiceResult.NotFound("Media not found");
            }

            try
            {
                await _storageService.DeleteFileAsync(media.Url);
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
            if (userContext.OrgId == null)
            {
                return ServiceResult<(byte[] Data, string ContentType, string FileName)>.Failure("You must be a member of an organization to download media.");
            }

            var orgId = userContext.OrgId.Value;

            var media = await _context.MediaFiles.FirstOrDefaultAsync(
                m => m.Id == id && m.OrgId == orgId,
                cancellationToken);

            if (media == null)
            {
                return ServiceResult<(byte[] Data, string ContentType, string FileName)>.NotFound("Media not found");
            }

            try
            {
                var response = await _storageService.DownloadFileAsync(media.Url);

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
