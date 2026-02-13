// File: Controllers/MediaController.cs
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using FamilyTreeApi.DTOs;
using FamilyTreeApi.Services;
using System.Security.Claims;

namespace FamilyTreeApi.Controllers;

/// <summary>
/// MediaController - thin controller handling only HTTP concerns.
/// All business logic is delegated to IMediaManagementService.
/// </summary>
[ApiController]
[Route("api/[controller]")]
[Authorize]
public class MediaController : ControllerBase
{
    private readonly IMediaManagementService _mediaManagementService;
    private readonly ILogger<MediaController> _logger;
    private const long MaxFileSizeBytes = 50 * 1024 * 1024;

    public MediaController(IMediaManagementService mediaManagementService, ILogger<MediaController> logger)
    {
        _mediaManagementService = mediaManagementService;
        _logger = logger;
    }

    // ========================================================================
    // MEDIA CRUD
    // ========================================================================

    /// <summary>
    /// Search media with filters
    /// </summary>
    [HttpGet]
    public async Task<ActionResult<MediaSearchResponse>> SearchMedia([FromQuery] MediaSearchRequest request)
    {
        var userContext = BuildUserContext();
        var result = await _mediaManagementService.SearchMediaAsync(request, userContext);

        return HandleResult(result);
    }

    /// <summary>
    /// Get a specific media item
    /// </summary>
    [HttpGet("{id}")]
    public async Task<ActionResult<MediaResponse>> GetMedia(Guid id)
    {
        var userContext = BuildUserContext();
        var result = await _mediaManagementService.GetMediaAsync(id, userContext);

        return HandleResult(result);
    }

    /// <summary>
    /// Upload a new media file
    /// </summary>
    [HttpPost("upload")]
    [Authorize(Roles = "0,1,2,3")]
    [RequestSizeLimit(MaxFileSizeBytes)]
    public async Task<ActionResult<MediaResponse>> UploadMedia([FromForm] MediaUploadRequest request, IFormFile file)
    {
        if (file == null || file.Length == 0)
        {
            return BadRequest(new { message = "No file uploaded" });
        }

        if (file.Length > MaxFileSizeBytes)
        {
            return BadRequest(new { message = $"File size exceeds maximum allowed size of {MaxFileSizeBytes / (1024 * 1024)}MB" });
        }

        var userContext = BuildUserContext();
        var result = await _mediaManagementService.UploadMediaAsync(request, file, userContext);

        if (!result.IsSuccess)
        {
            return HandleError(result);
        }

        return CreatedAtAction(nameof(GetMedia), new { id = result.Data!.Id }, result.Data);
    }

    /// <summary>
    /// Update media metadata
    /// </summary>
    [HttpPut("{id}")]
    [Authorize(Roles = "0,1,2")]
    public async Task<ActionResult<MediaResponse>> UpdateMedia(Guid id, MediaUpdateRequest request)
    {
        var userContext = BuildUserContext();
        var result = await _mediaManagementService.UpdateMediaAsync(id, request, userContext);

        return HandleResult(result);
    }

    /// <summary>
    /// Delete a media item
    /// </summary>
    [HttpDelete("{id}")]
    [Authorize(Roles = "Developer,SuperAdmin,Admin")]
    public async Task<IActionResult> DeleteMedia(Guid id)
    {
        var userContext = BuildUserContext();
        var result = await _mediaManagementService.DeleteMediaAsync(id, userContext);

        if (!result.IsSuccess)
        {
            return HandleError(result);
        }

        return NoContent();
    }

    /// <summary>
    /// Download a media file
    /// </summary>
    [HttpGet("{id}/download")]
    public async Task<IActionResult> DownloadMedia(Guid id)
    {
        var userContext = BuildUserContext();
        var result = await _mediaManagementService.DownloadMediaAsync(id, userContext);

        if (!result.IsSuccess)
        {
            return HandleError(result);
        }

        var (data, contentType, fileName) = result.Data!;
        return File(data, contentType, fileName);
    }

    /// <summary>
    /// Get a signed URL for secure media streaming
    /// </summary>
    [HttpGet("{id}/signed-url")]
    public async Task<ActionResult<SignedMediaUrlDto>> GetSignedUrl(Guid id, [FromQuery] int expiresInSeconds = 3600)
    {
        // Clamp expiration to max 24 hours
        expiresInSeconds = Math.Clamp(expiresInSeconds, 60, 86400);

        var userContext = BuildUserContext();
        var result = await _mediaManagementService.GetSignedUrlAsync(id, expiresInSeconds, userContext);

        return HandleResult(result);
    }

    // ============================================================================
    // MEDIA APPROVAL
    // ============================================================================

    /// <summary>
    /// Get the media approval queue (pending items)
    /// </summary>
    [HttpGet("approval-queue")]
    [Authorize(Roles = "Developer,SuperAdmin,Admin")]
    public async Task<ActionResult<MediaApprovalQueueResponse>> GetApprovalQueue([FromQuery] MediaApprovalQueueRequest request)
    {
        var userContext = BuildUserContext();
        var result = await _mediaManagementService.GetApprovalQueueAsync(request, userContext);

        return HandleResult(result);
    }

    /// <summary>
    /// Approve a pending media item
    /// </summary>
    [HttpPost("{id}/approve")]
    [Authorize(Roles = "Developer,SuperAdmin,Admin")]
    public async Task<IActionResult> ApproveMedia(Guid id, [FromBody] MediaApprovalRequest? request)
    {
        var userContext = BuildUserContext();
        var result = await _mediaManagementService.ApproveMediaAsync(id, request ?? new MediaApprovalRequest(), userContext);

        if (!result.IsSuccess)
        {
            return HandleError(result);
        }

        return Ok(new { message = "Media approved." });
    }

    /// <summary>
    /// Reject a pending media item
    /// </summary>
    [HttpPost("{id}/reject")]
    [Authorize(Roles = "Developer,SuperAdmin,Admin")]
    public async Task<IActionResult> RejectMedia(Guid id, [FromBody] MediaApprovalRequest? request)
    {
        var userContext = BuildUserContext();
        var result = await _mediaManagementService.RejectMediaAsync(id, request ?? new MediaApprovalRequest(), userContext);

        if (!result.IsSuccess)
        {
            return HandleError(result);
        }

        return Ok(new { message = "Media rejected." });
    }

    // ============================================================================
    // PRIVATE HELPER METHODS
    // ============================================================================

    /// <summary>
    /// Builds UserContext from JWT claims for service-layer authorization.
    /// </summary>
    private UserContext BuildUserContext()
    {
        return new UserContext
        {
            UserId = GetUserId(),
            OrgId = TryGetOrgIdFromToken(),
            SystemRole = GetSystemRole(),
            TreeRole = GetTreeRole()
        };
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

    private Guid? TryGetOrgIdFromToken()
    {
        var orgIdClaim = User.FindFirst("orgId")?.Value;
        if (string.IsNullOrEmpty(orgIdClaim) || !Guid.TryParse(orgIdClaim, out var orgId))
        {
            return null;
        }
        return orgId;
    }

    private string GetSystemRole()
    {
        var systemRole = User.FindFirst("systemRole")?.Value;
        return systemRole ?? "User";
    }

    private string GetTreeRole()
    {
        var role = User.FindFirst(ClaimTypes.Role)?.Value;
        if (string.IsNullOrEmpty(role))
        {
            return "Viewer";
        }

        if (role.Contains(':'))
        {
            role = role.Split(':').Last();
        }

        return role;
    }

    /// <summary>
    /// Maps ServiceResult to appropriate ActionResult with data.
    /// </summary>
    private ActionResult<T> HandleResult<T>(ServiceResult<T> result)
    {
        if (result.IsSuccess)
        {
            return Ok(result.Data);
        }

        return HandleError(result);
    }

    /// <summary>
    /// Maps ServiceResult errors to appropriate HTTP status codes.
    /// </summary>
    private ActionResult HandleError(ServiceResult result)
    {
        return result.ErrorType switch
        {
            ServiceErrorType.NotFound => NotFound(new { message = result.ErrorMessage }),
            ServiceErrorType.Forbidden => Forbid(),
            ServiceErrorType.Unauthorized => Unauthorized(),
            ServiceErrorType.InternalError => StatusCode(500, new { message = result.ErrorMessage }),
            _ => BadRequest(new { message = result.ErrorMessage })
        };
    }
}
