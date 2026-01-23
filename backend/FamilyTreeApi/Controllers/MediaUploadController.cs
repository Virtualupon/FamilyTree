using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using FamilyTreeApi.DTOs;
using FamilyTreeApi.Services;

namespace FamilyTreeApi.Controllers;

/// <summary>
/// MediaUploadController - Handles Base64 media uploads for person-level media
/// Uses MediaService which wraps VirtualUpon.Storage (like Nobiin Dictionary baseline)
/// </summary>
[ApiController]
[Route("api/media/person")]
[Authorize]
public class MediaUploadController : ControllerBase
{
    private readonly IMediaService _mediaService;
    private readonly ILogger<MediaUploadController> _logger;

    public MediaUploadController(IMediaService mediaService, ILogger<MediaUploadController> logger)
    {
        _mediaService = mediaService;
        _logger = logger;
    }

    /// <summary>
    /// Upload media (image/video/audio/document) as Base64 for a person
    /// </summary>
    [HttpPost("upload/base64")]
    public async Task<IActionResult> UploadMediaBase64([FromBody] UploadMediaBase64Request request)
    {
        try
        {
            var media = await _mediaService.UploadMediaAsync(
                request.PersonId,
                request.Base64Data,
                request.FileName,
                request.MimeType,
                request.Caption,
                request.Copyright
            );

            var response = new PersonMediaResponse
            {
                Id = media.Id,
                PersonId = media.PersonId ?? Guid.Empty,
                FileName = media.FileName,
                MimeType = media.MimeType,
                FileSize = media.FileSize,
                MediaType = media.Kind.ToString(),
                Caption = media.Title,
                Copyright = media.Copyright,
                UploadedAt = media.CreatedAt,
                ThumbnailUrl = media.ThumbnailPath
            };

            return Ok(response);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error uploading media for person {PersonId}", request.PersonId);
            return StatusCode(500, new { error = "Failed to upload media" });
        }
    }

    /// <summary>
    /// Download media as Base64 (for frontend display)
    /// </summary>
    [HttpGet("{mediaId}/base64")]
    public async Task<IActionResult> GetMediaAsBase64(Guid mediaId)
    {
        try
        {
            var base64Data = await _mediaService.GetMediaAsBase64Async(mediaId);
            if (base64Data == null)
                return NotFound(new { error = "Media not found" });

            var personMedia = await _mediaService.GetPersonMediaAsync(Guid.Empty);
            var mediaItem = personMedia.FirstOrDefault(m => m.Id == mediaId);

            return Ok(new MediaDownloadResponse
            {
                Id = mediaId,
                FileName = mediaItem?.FileName ?? "unknown",
                MimeType = mediaItem?.MimeType,
                Base64Data = base64Data
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error downloading media {MediaId} as Base64", mediaId);
            return StatusCode(500, new { error = "Failed to download media" });
        }
    }

    /// <summary>
    /// Download media as file (direct binary download)
    /// </summary>
    [HttpGet("{mediaId}/download")]
    public async Task<IActionResult> DownloadMedia(Guid mediaId)
    {
        try
        {
            var result = await _mediaService.GetMediaBytesAsync(mediaId);
            if (result == null)
                return NotFound(new { error = "Media not found" });

            var (data, mimeType) = result.Value;

            return File(data, mimeType);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error downloading media {MediaId}", mediaId);
            return StatusCode(500, new { error = "Failed to download media" });
        }
    }

    /// <summary>
    /// Get all media for a person
    /// </summary>
    [HttpGet("{personId}/list")]
    public async Task<IActionResult> GetPersonMedia(Guid personId)
    {
        try
        {
            var media = await _mediaService.GetPersonMediaAsync(personId);

            var response = media.Select(m => new PersonMediaResponse
            {
                Id = m.Id,
                PersonId = m.PersonId ?? Guid.Empty,
                FileName = m.FileName,
                MimeType = m.MimeType,
                FileSize = m.FileSize,
                MediaType = m.Kind.ToString(),
                Caption = m.Title,
                Copyright = m.Copyright,
                UploadedAt = m.CreatedAt,
                ThumbnailUrl = m.ThumbnailPath
            });

            return Ok(response);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting media for person {PersonId}", personId);
            return StatusCode(500, new { error = "Failed to get media" });
        }
    }

    /// <summary>
    /// Delete media
    /// </summary>
    [HttpDelete("{mediaId}")]
    public async Task<IActionResult> DeleteMedia(Guid mediaId)
    {
        try
        {
            var success = await _mediaService.DeleteMediaAsync(mediaId);
            if (!success)
                return NotFound(new { error = "Media not found" });

            return Ok(new { message = "Media deleted successfully" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error deleting media {MediaId}", mediaId);
            return StatusCode(500, new { error = "Failed to delete media" });
        }
    }

    /// <summary>
    /// Get a signed URL for secure media streaming
    /// </summary>
    [HttpGet("{mediaId}/signed-url")]
    public async Task<IActionResult> GetSignedUrl(Guid mediaId, [FromQuery] int expiresInSeconds = 3600)
    {
        try
        {
            // Clamp expiration to max 24 hours
            expiresInSeconds = Math.Clamp(expiresInSeconds, 60, 86400);

            var result = await _mediaService.GetSignedUrlAsync(mediaId, expiresInSeconds);
            if (!result.IsSuccessful)
            {
                return NotFound(new { error = result.ErrorMessage ?? "Media not found" });
            }

            return Ok(new SignedMediaUrlDto
            {
                Url = result.Url!,
                ExpiresAt = result.ExpiresAt!.Value,
                ContentType = result.ContentType ?? "application/octet-stream"
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting signed URL for media {MediaId}", mediaId);
            return StatusCode(500, new { error = "Failed to generate signed URL" });
        }
    }
}
