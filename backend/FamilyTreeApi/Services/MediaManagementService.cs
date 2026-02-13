// File: Services/MediaManagementService.cs
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using FamilyTreeApi.Data;
using FamilyTreeApi.DTOs;
using FamilyTreeApi.Models;
using FamilyTreeApi.Models.Enums;
using FamilyTreeApi.Utilities;
using System.Text.Json;
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
    private readonly IAuditLogService _auditLogService;

    private static readonly string[] AllowedImageTypes = { "image/jpeg", "image/png", "image/gif", "image/webp", "image/heic" };
    private static readonly string[] AllowedVideoTypes = { "video/mp4", "video/webm", "video/quicktime" };
    private static readonly string[] AllowedAudioTypes = { "audio/mpeg", "audio/wav", "audio/ogg" };
    private static readonly string[] AllowedDocumentTypes = { "application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document" };
    private const long MaxFileSizeBytes = 50 * 1024 * 1024;

    public MediaManagementService(
        ApplicationDbContext context,
        VirtualUpon.Storage.Factories.IStorageService storageService,
        ILogger<MediaManagementService> logger,
        IAuditLogService auditLogService)
    {
        _context = context;
        _storageService = storageService;
        _logger = logger;
        _auditLogService = auditLogService;
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

    /// <summary>
    /// Verify that a user has access to a specific organization.
    /// Handles multi-org admin users whose first JWT orgId claim may not match.
    /// </summary>
    private async Task<bool> HasOrgAccessAsync(Guid orgId, UserContext userContext, CancellationToken cancellationToken = default)
    {
        // Developer/SuperAdmin can access any org
        if (userContext.IsDeveloper || userContext.IsSuperAdmin)
        {
            return true;
        }

        // Check if user's token orgId matches
        if (userContext.OrgId.HasValue && userContext.OrgId.Value == orgId)
        {
            return true;
        }

        // Check if user is a member of this org (handles multi-org admin/regular users)
        return await _context.OrgUsers.AnyAsync(
            ou => ou.UserId == userContext.UserId && ou.OrgId == orgId,
            cancellationToken);
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

            // Approval status filter: by default, regular users only see Approved media + their own pending
            if (!string.IsNullOrWhiteSpace(request.ApprovalStatus) &&
                Enum.TryParse<MediaApprovalStatus>(request.ApprovalStatus, true, out var statusFilter))
            {
                query = query.Where(m => m.ApprovalStatus == statusFilter);
            }
            else if (!userContext.IsDeveloper && !userContext.IsSuperAdmin && !userContext.CanEdit())
            {
                query = query.Where(m =>
                    m.ApprovalStatus == MediaApprovalStatus.Approved ||
                    (m.ApprovalStatus == MediaApprovalStatus.Pending && m.UploadedByUserId == userContext.UserId));
            }

            // Tag filter
            if (!string.IsNullOrWhiteSpace(request.Tag))
            {
                var tagName = request.Tag.Trim();
                query = query.Where(m => m.MediaTags.Any(mt => mt.Tag.Name == tagName));
            }

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
                    ApprovalStatus = m.ApprovalStatus.ToString(),
                    Tags = m.MediaTags.Select(mt => mt.Tag.Name).ToList(),
                    // Project linked persons inline - EF Core generates efficient JOIN
                    LinkedPersons = m.PersonLinks
                        .Select(pl => new LinkedPersonDto(
                            pl.PersonId,
                            pl.Person != null
                                ? (pl.Person.PrimaryName ?? pl.Person.NameEnglish ?? pl.Person.NameArabic ?? "Unknown")
                                : "Unknown",
                            pl.IsPrimary,
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
            // Find media by ID first (without org filter), then verify access.
            // This handles multi-org admin users whose first JWT orgId claim
            // may not match the org that owns this media.
            var media = await _context.MediaFiles
                .Where(m => m.Id == id)
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

            // Verify user has access to the org that owns this media
            if (!await HasOrgAccessAsync(media.OrgId, userContext, cancellationToken))
            {
                return ServiceResult<MediaResponse>.Forbidden("Access denied to this media.");
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

            // Admins/Editors get auto-approved; regular contributors go to pending
            var approvalStatus = (userContext.IsDeveloper || userContext.IsSuperAdmin || userContext.CanEdit())
                ? MediaApprovalStatus.Approved
                : MediaApprovalStatus.Pending;

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
                ApprovalStatus = approvalStatus,
                UploadedByUserId = userContext.UserId,
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow
            };

            _context.MediaFiles.Add(media);
            await _context.SaveChangesAsync(cancellationToken);

            await _auditLogService.LogAsync(
                userContext.UserId, "Upload", "Media", media.Id,
                $"Uploaded media: {media.FileName}",
                newValuesJson: JsonSerializer.Serialize(new { media.Id, media.FileName, media.MimeType }),
                cancellationToken: cancellationToken);

            // Process tags
            await ProcessMediaTagsAsync(media.Id, effectiveOrgId, request.Tags, cancellationToken);

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

            await _auditLogService.LogAsync(
                userContext.UserId, "Delete", "Media", id,
                $"Deleted media: {media.FileName}",
                cancellationToken: cancellationToken);

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
            // Find media by ID first, then verify access (handles multi-org users)
            var media = await _context.MediaFiles.FirstOrDefaultAsync(
                m => m.Id == id, cancellationToken);

            if (media == null)
            {
                return ServiceResult<(byte[] Data, string ContentType, string FileName)>.NotFound("Media not found");
            }

            if (!await HasOrgAccessAsync(media.OrgId, userContext, cancellationToken))
            {
                return ServiceResult<(byte[] Data, string ContentType, string FileName)>.Forbidden("Access denied to this media.");
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
            // Find media by ID first (without org filter), then verify access.
            // This handles multi-org admin users whose first JWT orgId claim
            // may not match the org that owns this media.
            var media = await _context.MediaFiles
                .FirstOrDefaultAsync(m => m.Id == id, cancellationToken);

            if (media == null)
            {
                return ServiceResult<SignedMediaUrlDto>.NotFound("Media not found");
            }

            // Verify user has access to the org that owns this media
            if (!await HasOrgAccessAsync(media.OrgId, userContext, cancellationToken))
            {
                return ServiceResult<SignedMediaUrlDto>.Forbidden("Access denied to this media.");
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
                UpdatedAt = m.UpdatedAt,
                ApprovalStatus = m.ApprovalStatus.ToString(),
                Tags = m.MediaTags.Select(mt => mt.Tag.Name).ToList(),
                LinkedPersons = m.PersonLinks
                    .Select(pl => new LinkedPersonDto(
                        pl.PersonId,
                        pl.Person != null
                            ? (pl.Person.PrimaryName ?? pl.Person.NameEnglish ?? pl.Person.NameArabic ?? "Unknown")
                            : "Unknown",
                        pl.IsPrimary,
                        pl.LinkedAt
                    ))
                    .ToList()
            })
            .FirstOrDefaultAsync(cancellationToken);
    }

    /// <summary>
    /// Process tag names for a media item: find existing tags or create new ones, then create junction records.
    /// </summary>
    private async Task ProcessMediaTagsAsync(Guid mediaId, Guid orgId, List<string>? tagNames, CancellationToken cancellationToken)
    {
        if (tagNames == null || tagNames.Count == 0)
            return;

        // Validate: max 20 tags per media
        var validTags = tagNames
            .Select(t => t.Trim())
            .Where(t => !string.IsNullOrWhiteSpace(t))
            .Select(t => t.Length > 100 ? t[..100] : t) // Truncate to 100 chars
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .Take(20)
            .ToList();

        if (validTags.Count == 0)
            return;

        // Fetch existing tags for this org (case-insensitive match)
        var lowerTagNames = validTags.Select(t => t.ToLowerInvariant()).ToList();
        var existingTags = await _context.Tags
            .Where(t => t.OrgId == orgId && lowerTagNames.Contains(t.Name.ToLower()))
            .ToListAsync(cancellationToken);

        var existingTagNamesLower = existingTags.Select(t => t.Name.ToLowerInvariant()).ToHashSet();

        // Create new tags that don't exist yet
        var newTags = validTags
            .Where(t => !existingTagNamesLower.Contains(t.ToLowerInvariant()))
            .Select(t => new Tag
            {
                Id = Guid.NewGuid(),
                OrgId = orgId,
                Name = t,
                CreatedAt = DateTime.UtcNow
            })
            .ToList();

        if (newTags.Count > 0)
        {
            _context.Tags.AddRange(newTags);
            await _context.SaveChangesAsync(cancellationToken);
        }

        var allTags = existingTags.Concat(newTags).ToList();

        // Get existing MediaTag records to avoid duplicates
        var existingMediaTagIds = await _context.MediaTags
            .Where(mt => mt.MediaId == mediaId)
            .Select(mt => mt.TagId)
            .ToListAsync(cancellationToken);
        var existingMediaTagSet = existingMediaTagIds.ToHashSet();

        // Create junction records
        var mediaTags = allTags
            .Where(t => !existingMediaTagSet.Contains(t.Id))
            .Select(t => new MediaTag
            {
                Id = Guid.NewGuid(),
                MediaId = mediaId,
                TagId = t.Id,
                CreatedAt = DateTime.UtcNow
            })
            .ToList();

        if (mediaTags.Count > 0)
        {
            _context.MediaTags.AddRange(mediaTags);
            await _context.SaveChangesAsync(cancellationToken);
        }
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

    // ============================================================================
    // MEDIA APPROVAL
    // ============================================================================

    public async Task<ServiceResult<MediaApprovalQueueResponse>> GetApprovalQueueAsync(
        MediaApprovalQueueRequest request,
        UserContext userContext,
        CancellationToken cancellationToken = default)
    {
        if (!userContext.IsDeveloper && !userContext.IsSuperAdmin && !userContext.CanEdit())
        {
            return ServiceResult<MediaApprovalQueueResponse>.Forbidden("Only admins can view the approval queue.");
        }

        try
        {
            const int MaxPageSize = 100;
            if (request.PageSize > MaxPageSize) request.PageSize = MaxPageSize;
            if (request.PageSize < 1) request.PageSize = 20;
            if (request.Page < 1) request.Page = 1;

            IQueryable<Media> query;

            if (userContext.IsDeveloper || userContext.IsSuperAdmin)
            {
                // Developer/SuperAdmin sees pending media across all orgs
                query = _context.MediaFiles
                    .Where(m => m.ApprovalStatus == MediaApprovalStatus.Pending);
            }
            else
            {
                // Admin sees pending media only for their org(s)
                var userOrgIds = await _context.OrgUsers
                    .Where(ou => ou.UserId == userContext.UserId)
                    .Select(ou => ou.OrgId)
                    .ToListAsync(cancellationToken);

                query = _context.MediaFiles
                    .Where(m => m.ApprovalStatus == MediaApprovalStatus.Pending &&
                                userOrgIds.Contains(m.OrgId));
            }

            // Filters
            if (request.Kind.HasValue)
            {
                query = query.Where(m => m.Kind == request.Kind.Value);
            }

            if (!string.IsNullOrWhiteSpace(request.SearchTerm))
            {
                var term = request.SearchTerm.ToLower();
                query = query.Where(m =>
                    (m.Title != null && m.Title.ToLower().Contains(term)) ||
                    (m.Description != null && m.Description.ToLower().Contains(term)) ||
                    (m.FileName != null && m.FileName.ToLower().Contains(term)));
            }

            var total = await query.CountAsync(cancellationToken);
            var totalPages = (int)Math.Ceiling(total / (double)request.PageSize);

            var items = await query
                .OrderBy(m => m.CreatedAt)
                .Skip((request.Page - 1) * request.PageSize)
                .Take(request.PageSize)
                .Select(m => new MediaApprovalQueueItem
                {
                    Id = m.Id,
                    OrgId = m.OrgId,
                    TreeName = _context.Orgs
                        .Where(o => o.Id == m.OrgId)
                        .Select(o => o.Name)
                        .FirstOrDefault(),
                    FileName = m.FileName,
                    MimeType = m.MimeType,
                    FileSize = m.FileSize,
                    Kind = m.Kind.ToString(),
                    ApprovalStatus = m.ApprovalStatus.ToString(),
                    UploaderName = _context.Users
                        .Where(u => u.Id == m.UploadedByUserId)
                        .Select(u => (u.FirstName != null && u.LastName != null)
                            ? u.FirstName + " " + u.LastName
                            : u.UserName)
                        .FirstOrDefault(),
                    UploadedByUserId = m.UploadedByUserId,
                    CreatedAt = m.CreatedAt,
                    Title = m.Title,
                    Description = m.Description,
                    Tags = m.MediaTags.Select(mt => mt.Tag.Name).ToList(),
                    LinkedPersons = m.PersonLinks
                        .Select(pl => new LinkedPersonDto(
                            pl.PersonId,
                            pl.Person != null
                                ? (pl.Person.PrimaryName ?? pl.Person.NameEnglish ?? pl.Person.NameArabic ?? "Unknown")
                                : "Unknown",
                            pl.IsPrimary,
                            pl.LinkedAt
                        ))
                        .ToList()
                })
                .ToListAsync(cancellationToken);

            return ServiceResult<MediaApprovalQueueResponse>.Success(new MediaApprovalQueueResponse
            {
                Items = items,
                Total = total,
                Page = request.Page,
                PageSize = request.PageSize,
                TotalPages = totalPages
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting media approval queue");
            return ServiceResult<MediaApprovalQueueResponse>.InternalError("Error loading approval queue");
        }
    }

    public async Task<ServiceResult> ApproveMediaAsync(
        Guid mediaId,
        MediaApprovalRequest request,
        UserContext userContext,
        CancellationToken cancellationToken = default)
    {
        if (!userContext.IsDeveloper && !userContext.IsSuperAdmin && !userContext.CanEdit())
        {
            return ServiceResult.Forbidden("Only admins can approve media.");
        }

        try
        {
            var media = await _context.MediaFiles
                .FirstOrDefaultAsync(m => m.Id == mediaId, cancellationToken);

            if (media == null)
            {
                return ServiceResult.NotFound("Media not found.");
            }

            // Verify admin has access to this media's org
            if (!await HasOrgAccessAsync(media.OrgId, userContext, cancellationToken))
            {
                return ServiceResult.Forbidden("Access denied to this media.");
            }

            // Idempotent: if already approved, return success
            if (media.ApprovalStatus == MediaApprovalStatus.Approved)
            {
                return ServiceResult.Success();
            }

            media.ApprovalStatus = MediaApprovalStatus.Approved;
            media.ReviewedByUserId = userContext.UserId;
            media.ReviewedAt = DateTime.UtcNow;
            media.ReviewerNotes = request.ReviewerNotes;
            media.UpdatedAt = DateTime.UtcNow;

            await _context.SaveChangesAsync(cancellationToken);

            _logger.LogInformation("Media {MediaId} approved by user {UserId}", mediaId, userContext.UserId);

            return ServiceResult.Success();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error approving media {MediaId}", mediaId);
            return ServiceResult.InternalError("Error approving media");
        }
    }

    public async Task<ServiceResult> RejectMediaAsync(
        Guid mediaId,
        MediaApprovalRequest request,
        UserContext userContext,
        CancellationToken cancellationToken = default)
    {
        if (!userContext.IsDeveloper && !userContext.IsSuperAdmin && !userContext.CanEdit())
        {
            return ServiceResult.Forbidden("Only admins can reject media.");
        }

        try
        {
            var media = await _context.MediaFiles
                .FirstOrDefaultAsync(m => m.Id == mediaId, cancellationToken);

            if (media == null)
            {
                return ServiceResult.NotFound("Media not found.");
            }

            // Verify admin has access to this media's org
            if (!await HasOrgAccessAsync(media.OrgId, userContext, cancellationToken))
            {
                return ServiceResult.Forbidden("Access denied to this media.");
            }

            // Idempotent: if already rejected, return success
            if (media.ApprovalStatus == MediaApprovalStatus.Rejected)
            {
                return ServiceResult.Success();
            }

            media.ApprovalStatus = MediaApprovalStatus.Rejected;
            media.ReviewedByUserId = userContext.UserId;
            media.ReviewedAt = DateTime.UtcNow;
            media.ReviewerNotes = request.ReviewerNotes;
            media.UpdatedAt = DateTime.UtcNow;

            // Keep the stored file — admin may reconsider later.
            // File is only deleted on explicit media delete.

            await _context.SaveChangesAsync(cancellationToken);

            _logger.LogInformation("Media {MediaId} rejected by user {UserId}", mediaId, userContext.UserId);

            return ServiceResult.Success();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error rejecting media {MediaId}", mediaId);
            return ServiceResult.InternalError("Error rejecting media");
        }
    }
}
