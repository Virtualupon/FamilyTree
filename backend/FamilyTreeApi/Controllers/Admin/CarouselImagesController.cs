using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using FamilyTreeApi.DTOs;
using FamilyTreeApi.Services;
using System.Security.Claims;

namespace FamilyTreeApi.Controllers.Admin;

/// <summary>
/// Admin API controller for Carousel Images CRUD management.
/// Requires SuperAdmin role for all endpoints except public GET.
/// </summary>
[ApiController]
[Route("api/admin/carousel-images")]
public class CarouselImagesController : ControllerBase
{
    private readonly ICarouselImageService _carouselImageService;
    private readonly ILogger<CarouselImagesController> _logger;

    public CarouselImagesController(
        ICarouselImageService carouselImageService,
        ILogger<CarouselImagesController> logger)
    {
        _carouselImageService = carouselImageService;
        _logger = logger;
    }

    /// <summary>
    /// Get all carousel images (SuperAdmin only - for management)
    /// </summary>
    [HttpGet]
    [Authorize(Roles = "Developer,SuperAdmin")]
    [ProducesResponseType(typeof(List<CarouselImageDto>), StatusCodes.Status200OK)]
    public async Task<ActionResult<List<CarouselImageDto>>> GetAll()
    {
        try
        {
            var images = await _carouselImageService.GetAllAsync();
            return Ok(images);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting carousel images list");
            return StatusCode(StatusCodes.Status500InternalServerError,
                new { message = "Failed to get carousel images" });
        }
    }

    /// <summary>
    /// Get a single carousel image by ID (SuperAdmin only)
    /// </summary>
    [HttpGet("{id:guid}")]
    [Authorize(Roles = "Developer,SuperAdmin")]
    [ProducesResponseType(typeof(CarouselImageDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<CarouselImageDto>> GetById(Guid id)
    {
        try
        {
            var image = await _carouselImageService.GetByIdAsync(id);
            if (image == null)
            {
                return NotFound(new { message = "Carousel image not found" });
            }
            return Ok(image);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting carousel image {ImageId}", id);
            return StatusCode(StatusCodes.Status500InternalServerError,
                new { message = "Failed to get carousel image" });
        }
    }

    /// <summary>
    /// Create a new carousel image (SuperAdmin only)
    /// </summary>
    [HttpPost]
    [Authorize(Roles = "Developer,SuperAdmin")]
    [ProducesResponseType(typeof(CarouselImageDto), StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<ActionResult<CarouselImageDto>> Create([FromBody] CreateCarouselImageRequest request)
    {
        try
        {
            if (!ModelState.IsValid)
            {
                return BadRequest(ModelState);
            }

            var userId = GetUserId();
            var image = await _carouselImageService.CreateAsync(request, userId);

            return CreatedAtAction(nameof(GetById), new { id = image.Id }, image);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error creating carousel image");
            return StatusCode(StatusCodes.Status500InternalServerError,
                new { message = "Failed to create carousel image" });
        }
    }

    /// <summary>
    /// Update an existing carousel image (SuperAdmin only)
    /// </summary>
    [HttpPut("{id:guid}")]
    [Authorize(Roles = "Developer,SuperAdmin")]
    [ProducesResponseType(typeof(CarouselImageDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<CarouselImageDto>> Update(
        Guid id,
        [FromBody] UpdateCarouselImageRequest request)
    {
        try
        {
            var image = await _carouselImageService.UpdateAsync(id, request);
            if (image == null)
            {
                return NotFound(new { message = "Carousel image not found" });
            }
            return Ok(image);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error updating carousel image {ImageId}", id);
            return StatusCode(StatusCodes.Status500InternalServerError,
                new { message = "Failed to update carousel image" });
        }
    }

    /// <summary>
    /// Delete a carousel image (SuperAdmin only)
    /// </summary>
    [HttpDelete("{id:guid}")]
    [Authorize(Roles = "Developer,SuperAdmin")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Delete(Guid id)
    {
        try
        {
            var deleted = await _carouselImageService.DeleteAsync(id);
            if (!deleted)
            {
                return NotFound(new { message = "Carousel image not found" });
            }
            return NoContent();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error deleting carousel image {ImageId}", id);
            return StatusCode(StatusCodes.Status500InternalServerError,
                new { message = "Failed to delete carousel image" });
        }
    }

    /// <summary>
    /// Toggle active status of a carousel image (SuperAdmin only)
    /// </summary>
    [HttpPatch("{id:guid}/toggle-active")]
    [Authorize(Roles = "Developer,SuperAdmin")]
    [ProducesResponseType(typeof(CarouselImageDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<CarouselImageDto>> ToggleActive(Guid id)
    {
        try
        {
            var image = await _carouselImageService.ToggleActiveAsync(id);
            if (image == null)
            {
                return NotFound(new { message = "Carousel image not found" });
            }
            return Ok(image);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error toggling carousel image {ImageId}", id);
            return StatusCode(StatusCodes.Status500InternalServerError,
                new { message = "Failed to toggle carousel image status" });
        }
    }

    /// <summary>
    /// Reorder carousel images (SuperAdmin only)
    /// </summary>
    [HttpPost("reorder")]
    [Authorize(Roles = "Developer,SuperAdmin")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> Reorder([FromBody] ReorderCarouselImagesRequest request)
    {
        try
        {
            if (!ModelState.IsValid)
            {
                return BadRequest(ModelState);
            }

            var success = await _carouselImageService.ReorderAsync(request);
            if (!success)
            {
                return BadRequest(new { message = "Failed to reorder - some image IDs may be invalid" });
            }
            return Ok(new { message = "Images reordered successfully" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error reordering carousel images");
            return StatusCode(StatusCodes.Status500InternalServerError,
                new { message = "Failed to reorder carousel images" });
        }
    }

    private long GetUserId()
    {
        var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value
            ?? User.FindFirst("sub")?.Value;

        if (long.TryParse(userIdClaim, out var userId))
        {
            return userId;
        }

        return 0;
    }
}

/// <summary>
/// Public endpoint for getting active carousel images (no auth required)
/// </summary>
[ApiController]
[Route("api/carousel-images")]
public class PublicCarouselImagesController : ControllerBase
{
    private readonly ICarouselImageService _carouselImageService;
    private readonly ILogger<PublicCarouselImagesController> _logger;

    public PublicCarouselImagesController(
        ICarouselImageService carouselImageService,
        ILogger<PublicCarouselImagesController> logger)
    {
        _carouselImageService = carouselImageService;
        _logger = logger;
    }

    /// <summary>
    /// Get active carousel images for public display (no auth required)
    /// Used by the town-selection onboarding page
    /// </summary>
    [HttpGet]
    [AllowAnonymous]
    [ProducesResponseType(typeof(PublicCarouselImagesResponse), StatusCodes.Status200OK)]
    public async Task<ActionResult<PublicCarouselImagesResponse>> GetActiveImages()
    {
        try
        {
            var images = await _carouselImageService.GetActiveImagesAsync();
            return Ok(new PublicCarouselImagesResponse(images));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting public carousel images");
            return StatusCode(StatusCodes.Status500InternalServerError,
                new { message = "Failed to get carousel images" });
        }
    }
}
