using Microsoft.AspNetCore.Mvc;
using VirtualUpon.Storage.Factories;
using VirtualUpon.Storage.Utilities;

namespace FamilyTreeApi.Controllers;

/// <summary>
/// Controller for streaming media files with token validation.
/// Used for local storage signed URLs - validates HMACSHA256 tokens and serves files.
/// Cloud storage (AWS, Cloudflare, Linode) uses native pre-signed URLs directly.
/// </summary>
[ApiController]
[Route("media")]
public class MediaStreamController : ControllerBase
{
    private readonly IStorageService _storageService;
    private readonly ILogger<MediaStreamController> _logger;

    public MediaStreamController(
        IStorageService storageService,
        ILogger<MediaStreamController> logger)
    {
        _storageService = storageService;
        _logger = logger;
    }

    /// <summary>
    /// Stream a media file with token validation.
    /// Route: GET /media/stream/{*fileName}?token=xxx&expires=123
    /// </summary>
    /// <param name="fileName">The file path relative to storage root (supports nested paths via catch-all)</param>
    /// <param name="token">HMACSHA256 token for validation</param>
    /// <param name="expires">Unix timestamp when the URL expires</param>
    [HttpGet("stream/{*fileName}")]
    public IActionResult StreamMedia(string fileName, [FromQuery] string token, [FromQuery] long expires)
    {
        try
        {
            // Validate required parameters
            if (string.IsNullOrEmpty(fileName))
            {
                return BadRequest(new { message = "File name is required" });
            }

            if (string.IsNullOrEmpty(token))
            {
                return BadRequest(new { message = "Token is required" });
            }

            if (expires <= 0)
            {
                return BadRequest(new { message = "Expires timestamp is required" });
            }

            // Check if URL has expired
            var expiresDateTime = DateTimeOffset.FromUnixTimeSeconds(expires).UtcDateTime;
            if (DateTime.UtcNow > expiresDateTime)
            {
                _logger.LogWarning("Expired stream request for {FileName}, expired at {ExpiresAt}", fileName, expiresDateTime);
                return Unauthorized(new { message = "URL has expired" });
            }

            // Validate the token
            if (!_storageService.ValidateSignedToken(fileName, token, expires))
            {
                _logger.LogWarning("Invalid token for stream request: {FileName}", fileName);
                return Unauthorized(new { message = "Invalid token" });
            }

            // Get the local file path
            var localFilePath = _storageService.GetLocalFilePath(fileName);
            if (string.IsNullOrEmpty(localFilePath))
            {
                _logger.LogWarning("Could not resolve local path for: {FileName}", fileName);
                return NotFound(new { message = "File not found" });
            }

            // Check if file exists
            if (!System.IO.File.Exists(localFilePath))
            {
                _logger.LogWarning("File not found on disk: {FilePath}", localFilePath);
                return NotFound(new { message = "File not found" });
            }

            // Get content type
            var contentType = MediaTypeHelper.GetContentType(fileName);

            // Calculate cache duration based on URL expiration
            // Cache until URL expires minus a small buffer, with bounds checking
            const int maxCacheSeconds = 3600; // 1 hour maximum
            var totalSeconds = (expiresDateTime - DateTime.UtcNow).TotalSeconds - 60;
            var cacheSeconds = (int)Math.Clamp(totalSeconds, 0, maxCacheSeconds);

            // Set caching headers - allow browser to cache until URL expires
            // Private = only browser can cache (not CDNs), immutable = content won't change
            if (cacheSeconds > 0)
            {
                Response.Headers.CacheControl = $"private, max-age={cacheSeconds}, immutable";
                // Use actual cache expiry time, not URL expiry (respects max duration)
                var cacheExpires = DateTime.UtcNow.AddSeconds(cacheSeconds);
                Response.Headers.Expires = cacheExpires.ToString("R"); // RFC 1123 format
            }

            _logger.LogDebug("Streaming file {FileName} with content type {ContentType}, cache {CacheSeconds}s", fileName, contentType, cacheSeconds);

            // Return file with range processing support for video/audio streaming
            return PhysicalFile(
                localFilePath,
                contentType,
                Path.GetFileName(fileName),
                enableRangeProcessing: true
            );
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error streaming file {FileName}", fileName);
            return StatusCode(500, new { message = "Error streaming file" });
        }
    }
}
