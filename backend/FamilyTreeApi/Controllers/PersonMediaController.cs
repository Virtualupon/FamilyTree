using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using FamilyTreeApi.DTOs;
using FamilyTreeApi.Services;
using System.Security.Claims;

namespace FamilyTreeApi.Controllers;

/// <summary>
/// PersonMedia API controller - handles media file operations with many-to-many person linking
/// </summary>
[ApiController]
[Authorize]
[RequestSizeLimit(150_000_000)] // 150 MB limit for Base64 payloads
public class PersonMediaController : ControllerBase
{
    private readonly IPersonMediaService _personMediaService;
    private readonly ILogger<PersonMediaController> _logger;

    public PersonMediaController(IPersonMediaService personMediaService, ILogger<PersonMediaController> logger)
    {
        _personMediaService = personMediaService;
        _logger = logger;
    }

    // ========================================================================
    // UPLOAD & DELETE MEDIA
    // ========================================================================

    /// <summary>
    /// Upload media file and link to specified persons
    /// POST /api/media
    /// </summary>
    [HttpPost("api/media")]
    public async Task<ActionResult<MediaWithPersonsDto>> UploadMedia(
        [FromBody] MediaUploadWithPersonsDto dto)
    {
        var userContext = BuildUserContext();
        var result = await _personMediaService.UploadMediaAsync(dto, userContext);

        if (!result.IsSuccess)
        {
            return HandleError(result);
        }

        return CreatedAtAction(
            nameof(GetMediaById),
            new { mediaId = result.Data!.Id },
            result.Data);
    }

    /// <summary>
    /// Get a single media with Base64 data and linked persons
    /// GET /api/media/{mediaId}
    /// </summary>
    [HttpGet("api/media/{mediaId:guid}")]
    public async Task<ActionResult<MediaWithDataDto>> GetMediaById(Guid mediaId)
    {
        var userContext = BuildUserContext();
        var result = await _personMediaService.GetMediaByIdAsync(mediaId, userContext);

        return HandleResult(result);
    }

    /// <summary>
    /// Delete media and all its person links
    /// DELETE /api/media/{mediaId}
    /// </summary>
    [HttpDelete("api/media/{mediaId:guid}")]
    public async Task<IActionResult> DeleteMedia(Guid mediaId)
    {
        var userContext = BuildUserContext();
        var result = await _personMediaService.DeleteMediaAsync(mediaId, userContext);

        if (!result.IsSuccess)
        {
            return HandleError(result);
        }

        return NoContent();
    }

    // ========================================================================
    // PERSON-SPECIFIC MEDIA ENDPOINTS
    // ========================================================================

    /// <summary>
    /// Get all media for a person with linked persons info
    /// GET /api/persons/{personId}/media
    /// </summary>
    [HttpGet("api/persons/{personId:guid}/media")]
    public async Task<ActionResult<IEnumerable<PersonMediaListItemDto>>> GetPersonMedia(Guid personId)
    {
        var userContext = BuildUserContext();
        var result = await _personMediaService.GetMediaByPersonAsync(personId, userContext);

        return HandleResult(result);
    }

    /// <summary>
    /// Get all media for a person grouped by type (images, audio, videos)
    /// GET /api/persons/{personId}/media/grouped
    /// </summary>
    [HttpGet("api/persons/{personId:guid}/media/grouped")]
    public async Task<ActionResult<PersonMediaGroupedDto>> GetPersonMediaGrouped(Guid personId)
    {
        var userContext = BuildUserContext();
        var result = await _personMediaService.GetMediaByPersonGroupedAsync(personId, userContext);

        return HandleResult(result);
    }

    /// <summary>
    /// Link a person to existing media
    /// POST /api/persons/{personId}/media/{mediaId}/link
    /// </summary>
    [HttpPost("api/persons/{personId:guid}/media/{mediaId:guid}/link")]
    public async Task<IActionResult> LinkPersonToMedia(
        Guid personId,
        Guid mediaId,
        [FromBody] LinkPersonToMediaDto dto)
    {
        var userContext = BuildUserContext();
        var result = await _personMediaService.LinkPersonToMediaAsync(personId, mediaId, dto, userContext);

        if (!result.IsSuccess)
        {
            return HandleError(result);
        }

        return NoContent();
    }

    /// <summary>
    /// Unlink a person from media
    /// DELETE /api/persons/{personId}/media/{mediaId}/link
    /// </summary>
    [HttpDelete("api/persons/{personId:guid}/media/{mediaId:guid}/link")]
    public async Task<IActionResult> UnlinkPersonFromMedia(Guid personId, Guid mediaId)
    {
        var userContext = BuildUserContext();
        var result = await _personMediaService.UnlinkPersonFromMediaAsync(personId, mediaId, userContext);

        if (!result.IsSuccess)
        {
            return HandleError(result);
        }

        return NoContent();
    }

    /// <summary>
    /// Get all persons linked to a media
    /// GET /api/media/{mediaId}/persons
    /// </summary>
    [HttpGet("api/media/{mediaId:guid}/persons")]
    public async Task<ActionResult<IEnumerable<LinkedPersonDto>>> GetLinkedPersons(Guid mediaId)
    {
        var userContext = BuildUserContext();
        var result = await _personMediaService.GetLinkedPersonsAsync(mediaId, userContext);

        return HandleResult(result);
    }

    // ========================================================================
    // PRIVATE HELPER METHODS
    // ========================================================================

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
            ServiceErrorType.InternalError => StatusCode(500, new { message = result.ErrorMessage }),
            _ => BadRequest(new { message = result.ErrorMessage })
        };
    }
}
