// File: Controllers/UnionController.cs
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using FamilyTreeApi.DTOs;
using FamilyTreeApi.Services;
using System.Security.Claims;

namespace FamilyTreeApi.Controllers;

/// <summary>
/// Union API controller - handles marriages, partnerships, and family units.
/// Thin controller delegating to IUnionService.
/// </summary>
[ApiController]
[Route("api/[controller]")]
[Authorize]
public class UnionController : ControllerBase
{
    private readonly IUnionService _unionService;
    private readonly ILogger<UnionController> _logger;

    public UnionController(IUnionService unionService, ILogger<UnionController> logger)
    {
        _unionService = unionService;
        _logger = logger;
    }

    /// <summary>
    /// Search unions (marriages/partnerships) with filtering
    /// </summary>
    [HttpGet]
    public async Task<ActionResult<PagedResult<UnionListItemDto>>> SearchUnions([FromQuery] UnionSearchRequest request)
    {
        var search = new UnionSearchDto(
            request.TreeId,
            request.Type,
            request.PersonId,
            request.StartDateFrom,
            request.StartDateTo,
            request.PlaceId,
            request.Page,
            request.PageSize
        );

        var userContext = BuildUserContext();
        var result = await _unionService.GetUnionsAsync(search, userContext);

        return HandleResult(result);
    }

    /// <summary>
    /// Get a specific union by ID
    /// </summary>
    [HttpGet("{id}")]
    public async Task<ActionResult<UnionResponseDto>> GetUnion(Guid id, [FromQuery] Guid? treeId = null)
    {
        var userContext = BuildUserContext();
        var result = await _unionService.GetUnionAsync(id, treeId, userContext);

        return HandleResult(result);
    }

    /// <summary>
    /// Create a new union (marriage/partnership)
    /// </summary>
    [HttpPost]
    [Authorize(Roles = "Developer,Owner,Admin,Editor,Contributor,SuperAdmin")]
    public async Task<ActionResult<UnionResponseDto>> CreateUnion(CreateUnionRequest request)
    {
        var dto = new CreateUnionDto(
            null,
            request.Type,
            request.StartDate,
            request.StartPrecision,
            request.StartPlaceId,
            request.EndDate,
            request.EndPrecision,
            request.EndPlaceId,
            request.Notes,
            request.MemberIds
        );

        var userContext = BuildUserContext();
        var result = await _unionService.CreateUnionAsync(dto, userContext);

        if (!result.IsSuccess)
        {
            return HandleError(result);
        }

        return CreatedAtAction(nameof(GetUnion), new { id = result.Data!.Id }, result.Data);
    }

    /// <summary>
    /// Update a union
    /// </summary>
    [HttpPut("{id}")]
    [Authorize(Roles = "Developer,Owner,Admin,Editor,SuperAdmin")]
    public async Task<ActionResult<UnionResponseDto>> UpdateUnion(Guid id, UpdateUnionRequest request, [FromQuery] Guid? treeId = null)
    {
        var dto = new UpdateUnionDto(
            request.Type,
            request.StartDate,
            request.StartPrecision,
            request.StartPlaceId,
            request.EndDate,
            request.EndPrecision,
            request.EndPlaceId,
            request.Notes
        );

        var userContext = BuildUserContext();
        var result = await _unionService.UpdateUnionAsync(id, dto, treeId, userContext);

        return HandleResult(result);
    }

    /// <summary>
    /// Delete a union
    /// </summary>
    [HttpDelete("{id}")]
    [Authorize(Roles = "Developer,Owner,Admin,Editor,SuperAdmin")]
    public async Task<IActionResult> DeleteUnion(Guid id, [FromQuery] Guid? treeId = null)
    {
        var userContext = BuildUserContext();
        var result = await _unionService.DeleteUnionAsync(id, treeId, userContext);

        if (!result.IsSuccess)
        {
            return HandleError(result);
        }

        return NoContent();
    }

    /// <summary>
    /// Add a member (spouse/partner) to a union
    /// </summary>
    [HttpPost("{id}/members")]
    [Authorize(Roles = "Developer,Owner,Admin,Editor,SuperAdmin")]
    public async Task<ActionResult<UnionMemberDto>> AddMember(Guid id, AddUnionMemberRequest request, [FromQuery] Guid? treeId = null)
    {
        var dto = new AddUnionMemberDto(request.PersonId);
        var userContext = BuildUserContext();
        var result = await _unionService.AddMemberAsync(id, dto, treeId, userContext);

        if (!result.IsSuccess)
        {
            return HandleError(result);
        }

        return CreatedAtAction(nameof(GetUnion), new { id }, result.Data);
    }

    /// <summary>
    /// Remove a member from a union
    /// </summary>
    [HttpDelete("{unionId}/members/{personId}")]
    [Authorize(Roles = "Developer,Owner,Admin,Editor,SuperAdmin")]
    public async Task<IActionResult> RemoveMember(Guid unionId, Guid personId, [FromQuery] Guid? treeId = null)
    {
        var userContext = BuildUserContext();
        var result = await _unionService.RemoveMemberAsync(unionId, personId, treeId, userContext);

        if (!result.IsSuccess)
        {
            return HandleError(result);
        }

        return NoContent();
    }

    /// <summary>
    /// Get children of a union
    /// </summary>
    [HttpGet("{id}/children")]
    public async Task<ActionResult<List<UnionChildDto>>> GetChildren(Guid id, [FromQuery] Guid? treeId = null)
    {
        var userContext = BuildUserContext();
        var result = await _unionService.GetChildrenAsync(id, treeId, userContext);

        return HandleResult(result);
    }

    /// <summary>
    /// Add a child to a union
    /// </summary>
    [HttpPost("{id}/children")]
    [Authorize(Roles = "Developer,Owner,Admin,Editor,Contributor,SuperAdmin")]
    public async Task<ActionResult<UnionChildDto>> AddChild(Guid id, [FromBody] AddUnionChildDto dto, [FromQuery] Guid? treeId = null)
    {
        var userContext = BuildUserContext();
        var result = await _unionService.AddChildAsync(id, dto, treeId, userContext);

        if (!result.IsSuccess)
        {
            return HandleError(result);
        }

        return CreatedAtAction(nameof(GetChildren), new { id }, result.Data);
    }

    /// <summary>
    /// Remove a child from a union
    /// </summary>
    [HttpDelete("{unionId}/children/{childId}")]
    [Authorize(Roles = "Developer,Owner,Admin,Editor,SuperAdmin")]
    public async Task<IActionResult> RemoveChild(Guid unionId, Guid childId, [FromQuery] Guid? treeId = null)
    {
        var userContext = BuildUserContext();
        var result = await _unionService.RemoveChildAsync(unionId, childId, treeId, userContext);

        if (!result.IsSuccess)
        {
            return HandleError(result);
        }

        return NoContent();
    }

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
        return User.FindFirst("systemRole")?.Value ?? "User";
    }

    private string GetTreeRole()
    {
        // Read from "treeRole" claim (set per org membership), not ClaimTypes.Role (Identity roles)
        var role = User.FindFirst("treeRole")?.Value;
        if (string.IsNullOrEmpty(role)) return "Viewer";
        return role;
    }

    private ActionResult<T> HandleResult<T>(ServiceResult<T> result)
    {
        if (result.IsSuccess) return Ok(result.Data);
        return HandleError(result);
    }

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
