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
    // AVATAR OPERATIONS
    // ============================================================================

    /// <summary>
    /// Upload avatar for a person (atomic: creates media + sets AvatarMediaId in one transaction)
    /// </summary>
    [HttpPost("{id}/avatar")]
    [RequestSizeLimit(5 * 1024 * 1024)] // 5MB max for avatars
    public async Task<ActionResult<UploadPersonAvatarResponse>> UploadAvatar(
        Guid id,
        [FromBody] UploadPersonAvatarRequest request,
        [FromQuery] Guid? treeId = null)
    {
        var userContext = BuildUserContext();
        var result = await _personService.UploadAvatarAsync(id, request, userContext, treeId);

        if (!result.IsSuccess)
        {
            return HandleError(result);
        }

        return Ok(result.Data);
    }

    /// <summary>
    /// Remove avatar from a person (clears AvatarMediaId, optionally deletes media)
    /// </summary>
    [HttpDelete("{id}/avatar")]
    public async Task<IActionResult> RemoveAvatar(Guid id, [FromQuery] bool deleteMedia = true, [FromQuery] Guid? treeId = null)
    {
        var userContext = BuildUserContext();
        var result = await _personService.RemoveAvatarAsync(id, deleteMedia, userContext, treeId);

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
            SelectedTownId = TryGetSelectedTownIdFromToken(),
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

    private Guid? TryGetSelectedTownIdFromToken()
    {
        var townIdClaim = User.FindFirst("selectedTownId")?.Value;
        if (string.IsNullOrEmpty(townIdClaim) || !Guid.TryParse(townIdClaim, out var townId))
        {
            return null;
        }
        return townId;
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
