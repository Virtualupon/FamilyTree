using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;
using FamilyTreeApi.DTOs;
using FamilyTreeApi.Models;
using FamilyTreeApi.Services;
using FamilyTreeApi.Data;
using Microsoft.EntityFrameworkCore;

namespace FamilyTreeApi.Controllers;

/// <summary>
/// Controller for town image operations.
/// Provides public endpoints for carousels and SuperAdmin CRUD operations.
/// Supports Base64 upload for image storage.
/// </summary>
[ApiController]
[Route("api/town-images")]
public class TownImageController : ControllerBase
{
    private readonly ITownImageService _townImageService;
    private readonly ApplicationDbContext _context;
    private readonly ILogger<TownImageController> _logger;

    public TownImageController(
        ITownImageService townImageService,
        ApplicationDbContext context,
        ILogger<TownImageController> logger)
    {
        _townImageService = townImageService;
        _context = context;
        _logger = logger;
    }

    // ========================================================================
    // PUBLIC ENDPOINTS (No Auth Required)
    // ========================================================================

    /// <summary>
    /// Get all active images for landing page carousel (public)
    /// </summary>
    [HttpGet("landing")]
    [AllowAnonymous]
    public async Task<ActionResult<LandingPageImagesResponse>> GetLandingPageImages()
    {
        var images = await _townImageService.GetAllActiveImagesAsync();

        var response = new LandingPageImagesResponse
        {
            Images = images.Select(MapToCarouselDto).ToList(),
            TotalCount = images.Count()
        };

        return Ok(response);
    }

    /// <summary>
    /// Get images for a specific town (public)
    /// </summary>
    [HttpGet("town/{townId}")]
    [AllowAnonymous]
    public async Task<ActionResult<List<TownCarouselImageDto>>> GetTownImages(Guid townId)
    {
        var images = await _townImageService.GetTownImagesAsync(townId, false);
        return Ok(images.Select(MapToCarouselDto).ToList());
    }

    /// <summary>
    /// Get image as Base64 (for frontend display)
    /// </summary>
    [HttpGet("{imageId}/base64")]
    [AllowAnonymous]
    public async Task<ActionResult> GetImageAsBase64(Guid imageId)
    {
        var base64Data = await _townImageService.GetImageAsBase64Async(imageId);
        if (base64Data == null)
            return NotFound(new { message = "Image not found" });

        return Ok(new { base64Data });
    }

    /// <summary>
    /// Download image as file (direct binary download)
    /// </summary>
    [HttpGet("{imageId}/download")]
    [AllowAnonymous]
    public async Task<ActionResult> DownloadImage(Guid imageId)
    {
        var result = await _townImageService.GetImageBytesAsync(imageId);
        if (result == null)
            return NotFound(new { message = "Image not found" });

        var (data, mimeType) = result.Value;
        return File(data, mimeType);
    }

    /// <summary>
    /// Get a signed URL for secure image streaming (public)
    /// </summary>
    [HttpGet("{imageId}/signed-url")]
    [AllowAnonymous]
    public async Task<ActionResult<SignedMediaUrlDto>> GetSignedUrl(Guid imageId, [FromQuery] int expiresInSeconds = 3600)
    {
        // Clamp expiration to max 24 hours
        expiresInSeconds = Math.Clamp(expiresInSeconds, 60, 86400);

        var result = await _townImageService.GetSignedUrlAsync(imageId, expiresInSeconds);
        if (!result.IsSuccessful)
        {
            return NotFound(new { message = result.ErrorMessage ?? "Image not found" });
        }

        return Ok(new SignedMediaUrlDto
        {
            Url = result.Url!,
            ExpiresAt = result.ExpiresAt!.Value,
            ContentType = result.ContentType ?? "image/webp"
        });
    }

    // ========================================================================
    // AUTHENTICATED ENDPOINTS
    // ========================================================================

    /// <summary>
    /// Get images for user's available towns (for town selection carousel)
    /// </summary>
    [HttpGet("available")]
    [Authorize]
    public async Task<ActionResult<List<TownCarouselImageDto>>> GetAvailableTownImages()
    {
        var userRole = GetSystemRole();
        List<Guid> townIds;

        if (userRole == "SuperAdmin")
        {
            // SuperAdmin sees all images
            var allImages = await _townImageService.GetAllActiveImagesAsync();
            return Ok(allImages.Select(MapToCarouselDto).ToList());
        }
        else if (userRole == "Admin")
        {
            // Admin sees images from assigned towns
            var userId = GetUserId();
            var assignedTowns = await _context.AdminTownAssignments
                .Where(a => a.UserId == userId && a.IsActive)
                .Select(a => a.TownId)
                .ToListAsync();
            townIds = assignedTowns;
        }
        else
        {
            // User sees images from all towns (browsable)
            var allTowns = await _context.Towns.Select(t => t.Id).ToListAsync();
            townIds = allTowns;
        }

        var images = await _townImageService.GetImagesByTownIdsAsync(townIds);
        return Ok(images.Select(MapToCarouselDto).ToList());
    }

    // ========================================================================
    // SUPERADMIN CRUD ENDPOINTS
    // ========================================================================

    /// <summary>
    /// Upload new town image using Base64 - SuperAdmin only
    /// </summary>
    [HttpPost("upload/base64")]
    [Authorize(Roles = "Developer,SuperAdmin")]
    public async Task<ActionResult<TownImageDto>> UploadImage([FromBody] UploadTownImageRequest request)
    {
        try
        {
            var image = await _townImageService.UploadImageAsync(
                request.TownId,
                request.Base64Data,
                request.FileName,
                request.MimeType,
                request.Title,
                request.TitleNb,
                request.TitleAr,
                request.TitleEn,
                request.Description,
                request.DescriptionNb,
                request.DescriptionAr,
                request.DescriptionEn,
                request.DisplayOrder,
                GetUserId()
            );

            _logger.LogInformation("SuperAdmin {UserId} uploaded town image for town {TownId}", GetUserId(), request.TownId);

            return CreatedAtAction(nameof(GetImageAsBase64), new { imageId = image.Id }, MapToDto(image));
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error uploading town image");
            return StatusCode(500, new { message = "Failed to upload image" });
        }
    }

    /// <summary>
    /// Get all images (including inactive) - SuperAdmin only
    /// </summary>
    [HttpGet]
    [Authorize(Roles = "Developer,SuperAdmin")]
    public async Task<ActionResult<List<TownImageDto>>> GetAllImages(
        [FromQuery] Guid? townId,
        [FromQuery] bool includeInactive = true)
    {
        var images = await _townImageService.GetAllImagesAsync(townId, includeInactive);
        return Ok(images.Select(MapToDto).ToList());
    }

    /// <summary>
    /// Get single image by ID - SuperAdmin only
    /// </summary>
    [HttpGet("{id}")]
    [Authorize(Roles = "Developer,SuperAdmin")]
    public async Task<ActionResult<TownImageDto>> GetImageById(Guid id)
    {
        var image = await _townImageService.GetImageByIdAsync(id);
        if (image == null)
        {
            return NotFound(new { message = "Image not found" });
        }

        return Ok(MapToDto(image));
    }

    /// <summary>
    /// Update image metadata - SuperAdmin only
    /// </summary>
    [HttpPut("{id}")]
    [Authorize(Roles = "Developer,SuperAdmin")]
    public async Task<ActionResult<TownImageDto>> UpdateImage(
        Guid id,
        [FromBody] UpdateTownImageRequest request)
    {
        var image = await _townImageService.UpdateImageMetadataAsync(id, request, GetUserId());
        if (image == null)
        {
            return NotFound(new { message = "Image not found" });
        }

        _logger.LogInformation("SuperAdmin {UserId} updated town image {ImageId}", GetUserId(), id);

        return Ok(MapToDto(image));
    }

    /// <summary>
    /// Delete town image - SuperAdmin only
    /// </summary>
    [HttpDelete("{id}")]
    [Authorize(Roles = "Developer,SuperAdmin")]
    public async Task<ActionResult> DeleteImage(Guid id)
    {
        var success = await _townImageService.DeleteImageAsync(id);
        if (!success)
        {
            return NotFound(new { message = "Image not found" });
        }

        _logger.LogInformation("SuperAdmin {UserId} deleted town image {ImageId}", GetUserId(), id);

        return NoContent();
    }

    /// <summary>
    /// Reorder images for a town - SuperAdmin only
    /// </summary>
    [HttpPut("town/{townId}/reorder")]
    [Authorize(Roles = "Developer,SuperAdmin")]
    public async Task<ActionResult> ReorderImages(
        Guid townId,
        [FromBody] ReorderTownImagesRequest request)
    {
        var success = await _townImageService.ReorderImagesAsync(townId, request.Images);

        if (!success)
        {
            return BadRequest(new { message = "Failed to reorder images" });
        }

        _logger.LogInformation("SuperAdmin {UserId} reordered images for town {TownId}", GetUserId(), townId);

        return NoContent();
    }

    /// <summary>
    /// Toggle image active status - SuperAdmin only
    /// </summary>
    [HttpPatch("{id}/toggle-active")]
    [Authorize(Roles = "Developer,SuperAdmin")]
    public async Task<ActionResult<TownImageDto>> ToggleActive(Guid id)
    {
        var image = await _townImageService.ToggleActiveAsync(id, GetUserId());
        if (image == null)
        {
            return NotFound(new { message = "Image not found" });
        }

        _logger.LogInformation("SuperAdmin {UserId} toggled image {ImageId} to {IsActive}",
            GetUserId(), id, image.IsActive);

        return Ok(MapToDto(image));
    }

    // ========================================================================
    // HELPER METHODS
    // ========================================================================

    private static TownImageDto MapToDto(TownImage image) => new()
    {
        Id = image.Id,
        TownId = image.TownId,
        TownName = image.Town?.Name ?? "",
        TownNameNb = image.Town?.NameLocal,  // Nobiin (Nubian)
        TownNameAr = image.Town?.NameAr,
        TownNameEn = image.Town?.NameEn,
        ImageUrl = image.ImageUrl,
        FileName = image.FileName,
        MimeType = image.MimeType,
        FileSize = image.FileSize,
        Title = image.Title,
        TitleNb = image.TitleNb,
        TitleAr = image.TitleAr,
        TitleEn = image.TitleEn,
        Description = image.Description,
        DescriptionNb = image.DescriptionNb,
        DescriptionAr = image.DescriptionAr,
        DescriptionEn = image.DescriptionEn,
        DisplayOrder = image.DisplayOrder,
        IsActive = image.IsActive,
        CreatedAt = image.CreatedAt,
        UpdatedAt = image.UpdatedAt
    };

    private static TownCarouselImageDto MapToCarouselDto(TownImage image) => new()
    {
        Id = image.Id,
        TownId = image.TownId,
        TownName = image.Town?.Name ?? "",
        TownNameNb = image.Town?.NameLocal,  // Nobiin (Nubian)
        TownNameAr = image.Town?.NameAr,
        TownNameEn = image.Town?.NameEn,
        ImageUrl = image.ImageUrl,
        Title = image.Title,
        TitleNb = image.TitleNb,
        TitleAr = image.TitleAr,
        TitleEn = image.TitleEn,
        Description = image.Description,
        DescriptionNb = image.DescriptionNb,
        DescriptionAr = image.DescriptionAr,
        DescriptionEn = image.DescriptionEn
    };

    private long GetUserId()
    {
        var claim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        return long.Parse(claim ?? "0");
    }

    private string GetSystemRole()
    {
        return User.FindFirst("systemRole")?.Value ?? "User";
    }
}
