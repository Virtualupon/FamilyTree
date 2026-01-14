// File: Controllers/PersonController.cs
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using FamilyTreeApi.DTOs;
using FamilyTreeApi.Services;
using System.Security.Claims;

namespace FamilyTreeApi.Controllers;

/// <summary>
/// Person API controller - thin controller handling only HTTP concerns.
/// All business logic is delegated to IPersonService.
/// </summary>
[ApiController]
[Route("api/[controller]")]
[Authorize]
public class PersonController : ControllerBase
{
    private readonly IPersonService _personService;
    private readonly ILogger<PersonController> _logger;

    public PersonController(IPersonService personService, ILogger<PersonController> logger)
    {
        _personService = personService;
        _logger = logger;
    }

    /// <summary>
    /// Get all persons in the current tree with pagination and filtering
    /// </summary>
    [HttpGet]
    public async Task<ActionResult<PagedResult<PersonListItemDto>>> GetPersons(
        [FromQuery] PersonSearchDto search)
    {
        var userContext = BuildUserContext();
        var result = await _personService.GetPersonsAsync(search, userContext);

        return HandleResult(result);
    }

    /// <summary>
    /// Get a specific person by ID
    /// </summary>
    [HttpGet("{id}")]
    public async Task<ActionResult<PersonResponseDto>> GetPerson(Guid id, [FromQuery] Guid? treeId = null)
    {
        var userContext = BuildUserContext();
        var result = await _personService.GetPersonAsync(id, treeId, userContext);

        return HandleResult(result);
    }

    /// <summary>
    /// Create a new person in the tree
    /// </summary>
    [HttpPost]
    public async Task<ActionResult<PersonResponseDto>> CreatePerson(CreatePersonDto dto)
    {
        var userContext = BuildUserContext();
        var result = await _personService.CreatePersonAsync(dto, userContext);

        if (!result.IsSuccess)
        {
            return HandleError(result);
        }

        return CreatedAtAction(nameof(GetPerson), new { id = result.Data!.Id }, result.Data);
    }

    /// <summary>
    /// Update a person
    /// </summary>
    [HttpPut("{id}")]
    public async Task<ActionResult<PersonResponseDto>> UpdatePerson(Guid id, UpdatePersonDto dto, [FromQuery] Guid? treeId = null)
    {
        var userContext = BuildUserContext();
        var result = await _personService.UpdatePersonAsync(id, dto, treeId, userContext);

        return HandleResult(result);
    }

    /// <summary>
    /// Delete a person
    /// </summary>
    [HttpDelete("{id}")]
    public async Task<IActionResult> DeletePerson(Guid id, [FromQuery] Guid? treeId = null)
    {
        var userContext = BuildUserContext();
        var result = await _personService.DeletePersonAsync(id, treeId, userContext);

        if (!result.IsSuccess)
        {
            return HandleError(result);
        }

        return NoContent();
    }

    // ============================================================================
    // AVATAR ENDPOINTS
    // ============================================================================

    /// <summary>
    /// Upload a profile picture/avatar for a person
    /// </summary>
    [HttpPost("{id}/avatar")]
    [ProducesResponseType(typeof(AvatarDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<AvatarDto>> UploadAvatar(Guid id, [FromBody] UploadAvatarDto dto)
    {
        var userContext = BuildUserContext();
        var result = await _personService.UploadAvatarAsync(id, dto, userContext);

        return HandleResult(result);
    }

    /// <summary>
    /// Get avatar info for a person (without image data)
    /// </summary>
    [HttpGet("{id}/avatar")]
    [ProducesResponseType(typeof(AvatarDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<AvatarDto?>> GetAvatar(Guid id)
    {
        var result = await _personService.GetAvatarAsync(id);

        if (!result.IsSuccess)
        {
            return HandleError(result);
        }

        if (result.Data == null)
        {
            return Ok(null);
        }

        return Ok(result.Data);
    }

    /// <summary>
    /// Get avatar with Base64 image data for a person
    /// </summary>
    [HttpGet("{id}/avatar/data")]
    [ProducesResponseType(typeof(AvatarWithDataDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<AvatarWithDataDto?>> GetAvatarWithData(Guid id)
    {
        var result = await _personService.GetAvatarWithDataAsync(id);

        if (!result.IsSuccess)
        {
            return HandleError(result);
        }

        if (result.Data == null)
        {
            return Ok(null);
        }

        return Ok(result.Data);
    }

    /// <summary>
    /// Delete avatar for a person
    /// </summary>
    [HttpDelete("{id}/avatar")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> DeleteAvatar(Guid id)
    {
        var userContext = BuildUserContext();
        var result = await _personService.DeleteAvatarAsync(id, userContext);

        if (!result.IsSuccess)
        {
            return HandleError(result);
        }

        return NoContent();
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
    /// Preserves exact error response shapes from original controller.
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
