using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using FamilyTreeApi.Data;
using FamilyTreeApi.DTOs;
using FamilyTreeApi.Models;
using FamilyTreeApi.Models.Enums;
using VirtualUpon.Storage.Factories;

namespace FamilyTreeApi.Controllers;

/// <summary>
/// MediaController - Handles organization-level media with FormFile uploads
/// Uses VirtualUpon.Storage directly for file operations
/// </summary>
[ApiController]
[Route("api/[controller]")]
[Authorize]
public class MediaController : ControllerBase
{
    private readonly ApplicationDbContext _context;
    private readonly IStorageService _storageService;
    private readonly ILogger<MediaController> _logger;
    private static readonly string[] AllowedImageTypes = { "image/jpeg", "image/png", "image/gif", "image/webp", "image/heic" };
    private static readonly string[] AllowedVideoTypes = { "video/mp4", "video/webm", "video/quicktime" };
    private static readonly string[] AllowedAudioTypes = { "audio/mpeg", "audio/wav", "audio/ogg" };
    private static readonly string[] AllowedDocumentTypes = { "application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document" };
    private const long MaxFileSizeBytes = 50 * 1024 * 1024;

    public MediaController(ApplicationDbContext context, IStorageService storageService, ILogger<MediaController> logger)
    {
        _context = context;
        _storageService = storageService;
        _logger = logger;
    }

    private long GetUserId()
    {
        var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        if (string.IsNullOrEmpty(userIdClaim) || !long.TryParse(userIdClaim, out var userId))
        {
            throw new UnauthorizedAccessException("User ID not found in token");
        }
        return userId;
    }

    private Guid? TryGetUserOrgId()
    {
        var orgIdClaim = User.FindFirst("orgId")?.Value;
        if (string.IsNullOrEmpty(orgIdClaim) || !Guid.TryParse(orgIdClaim, out var orgId))
        {
            return null;
        }
        return orgId;
    }

    [HttpGet]
    public async Task<ActionResult<MediaSearchResponse>> SearchMedia([FromQuery] MediaSearchRequest request)
    {
        var orgId = TryGetUserOrgId();
        if (orgId == null)
        {
            return BadRequest(new { message = "You must be a member of an organization to view media." });
        }
        
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

        var totalCount = await query.CountAsync();
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
            .ToListAsync();

        return Ok(new MediaSearchResponse
        {
            Media = media,
            TotalCount = totalCount,
            Page = request.Page,
            PageSize = request.PageSize,
            TotalPages = totalPages
        });
    }

    [HttpGet("{id}")]
    public async Task<ActionResult<MediaResponse>> GetMedia(Guid id)
    {
        var orgId = TryGetUserOrgId();
        if (orgId == null)
        {
            return BadRequest(new { message = "You must be a member of an organization to view media." });
        }

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
            .FirstOrDefaultAsync();

        if (media == null)
        {
            return NotFound(new { message = "Media not found" });
        }

        return Ok(media);
    }

    [HttpPost("upload")]
    [Authorize(Roles = "0,1,2,3")]
    [RequestSizeLimit(MaxFileSizeBytes)]
    public async Task<ActionResult<MediaResponse>> UploadMedia([FromForm] MediaUploadRequest request, IFormFile file)
    {
        var orgId = TryGetUserOrgId();
        if (orgId == null)
        {
            return BadRequest(new { message = "You must be a member of an organization to upload media." });
        }

        if (file == null || file.Length == 0)
        {
            return BadRequest(new { message = "No file uploaded" });
        }

        if (file.Length > MaxFileSizeBytes)
        {
            return BadRequest(new { message = $"File size exceeds maximum allowed size of {MaxFileSizeBytes / (1024 * 1024)}MB" });
        }

        var contentType = file.ContentType.ToLower();
        var mediaKind = DetermineMediaKind(contentType);

        if (mediaKind == null || !IsAllowedContentType(contentType, mediaKind.Value))
        {
            return BadRequest(new { message = "File type not allowed" });
        }

        if (request.CapturePlaceId.HasValue)
        {
            var placeExists = await _context.Places.AnyAsync(p => p.Id == request.CapturePlaceId.Value && p.OrgId == orgId);
            if (!placeExists)
            {
                return BadRequest(new { message = "Place not found in organization" });
            }
        }

        string fileUrl;
        string storageKey;

        try
        {
            // Read file bytes
            using var memoryStream = new MemoryStream();
            await file.CopyToAsync(memoryStream);
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
            return StatusCode(500, new { message = "Failed to upload file" });
        }

        var media = new Media
        {
            Id = Guid.NewGuid(),
            OrgId = orgId.Value,
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
        await _context.SaveChangesAsync();

        return CreatedAtAction(nameof(GetMedia), new { id = media.Id }, await GetMediaDto(media.Id));
    }

    [HttpPut("{id}")]
    [Authorize(Roles = "0,1,2")]
    public async Task<ActionResult<MediaResponse>> UpdateMedia(Guid id, MediaUpdateRequest request)
    {
        var orgId = TryGetUserOrgId();
        if (orgId == null)
        {
            return BadRequest(new { message = "You must be a member of an organization to update media." });
        }

        var media = await _context.MediaFiles.FirstOrDefaultAsync(m => m.Id == id && m.OrgId == orgId);
        if (media == null)
        {
            return NotFound(new { message = "Media not found" });
        }

        if (request.CapturePlaceId.HasValue)
        {
            var placeExists = await _context.Places.AnyAsync(p => p.Id == request.CapturePlaceId.Value && p.OrgId == orgId);
            if (!placeExists)
            {
                return BadRequest(new { message = "Place not found in organization" });
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

        await _context.SaveChangesAsync();

        return Ok(await GetMediaDto(media.Id));
    }

    [HttpDelete("{id}")]
    [Authorize(Roles = "0,1,2")]
    public async Task<IActionResult> DeleteMedia(Guid id)
    {
        var orgId = TryGetUserOrgId();
        if (orgId == null)
        {
            return BadRequest(new { message = "You must be a member of an organization to delete media." });
        }

        var media = await _context.MediaFiles.FirstOrDefaultAsync(m => m.Id == id && m.OrgId == orgId);
        if (media == null)
        {
            return NotFound(new { message = "Media not found" });
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
        await _context.SaveChangesAsync();

        return NoContent();
    }

    private async Task<MediaResponse?> GetMediaDto(Guid id)
    {
        var orgId = TryGetUserOrgId();
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
            .FirstOrDefaultAsync();
    }

    [HttpGet("{id}/download")]
    public async Task<IActionResult> DownloadMedia(Guid id)
    {
        var orgId = TryGetUserOrgId();
        if (orgId == null)
        {
            return BadRequest(new { message = "You must be a member of an organization to download media." });
        }

        var media = await _context.MediaFiles.FirstOrDefaultAsync(m => m.Id == id && m.OrgId == orgId);
        if (media == null)
        {
            return NotFound(new { message = "Media not found" });
        }

        try
        {
            var response = await _storageService.DownloadFileAsync(media.Url);
            
            var fileName = media.FileName ?? media.Title ?? $"media_{media.Id}";
            var contentType = media.MimeType ?? "application/octet-stream";

            return File(response.FileData, contentType, fileName);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to download media file {MediaId}", id);
            return StatusCode(500, new { message = "Failed to download file" });
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
}
