// File: Controllers/ParentChildController.cs
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using FamilyTreeApi.DTOs;
using FamilyTreeApi.Services;
using System.Security.Claims;

namespace FamilyTreeApi.Controllers;

/// <summary>
/// ParentChild API controller - thin controller handling only HTTP concerns.
/// All business logic is delegated to IParentChildService.
/// </summary>
[ApiController]
[Route("api/[controller]")]
[Authorize]
public class ParentChildController : ControllerBase
{
    private readonly IParentChildService _parentChildService;
    private readonly ILogger<ParentChildController> _logger;

    public ParentChildController(IParentChildService parentChildService, ILogger<ParentChildController> logger)
    {
        _parentChildService = parentChildService;
        _logger = logger;
    }

    /// <summary>
    /// Get all parents of a person
    /// </summary>
    [HttpGet("person/{personId}/parents")]
    public async Task<ActionResult<List<ParentChildResponse>>> GetParents(Guid personId)
    {
        var userContext = BuildUserContext();
        var result = await _parentChildService.GetParentsAsync(personId, userContext);

        return HandleResult(result);
    }

    /// <summary>
    /// Get all children of a person
    /// </summary>
    [HttpGet("person/{personId}/children")]
    public async Task<ActionResult<List<ParentChildResponse>>> GetChildren(Guid personId)
    {
        var userContext = BuildUserContext();
        var result = await _parentChildService.GetChildrenAsync(personId, userContext);

        return HandleResult(result);
    }

    /// <summary>
    /// Add a parent to a person
    /// </summary>
    [HttpPost("person/{childId}/parents/{parentId}")]
    [Authorize(Roles = "Developer,Owner,Admin,Editor,Contributor,SuperAdmin")]
    public async Task<ActionResult<ParentChildResponse>> AddParent(
        Guid childId,
        Guid parentId,
        [FromBody] AddParentChildRequest? request = null)
    {
        var userContext = BuildUserContext();
        var result = await _parentChildService.AddParentAsync(childId, parentId, request, userContext);

        if (!result.IsSuccess)
        {
            return HandleError(result);
        }

        return CreatedAtAction(nameof(GetParents), new { personId = childId }, result.Data);
    }

    /// <summary>
    /// Add a child to a person
    /// </summary>
    [HttpPost("person/{parentId}/children/{childId}")]
    [Authorize(Roles = "Developer,Owner,Admin,Editor,Contributor,SuperAdmin")]
    public async Task<ActionResult<ParentChildResponse>> AddChild(
        Guid parentId,
        Guid childId,
        [FromBody] AddParentChildRequest? request = null)
    {
        // This is just a convenience endpoint that calls AddParent with swapped parameters
        return await AddParent(childId, parentId, request);
    }

    /// <summary>
    /// Update a parent-child relationship
    /// </summary>
    [HttpPut("{id}")]
    [Authorize(Roles = "Developer,Owner,Admin,Editor,SuperAdmin")]
    public async Task<ActionResult<ParentChildResponse>> UpdateRelationship(Guid id, UpdateParentChildRequest request)
    {
        var userContext = BuildUserContext();
        var result = await _parentChildService.UpdateRelationshipAsync(id, request, userContext);

        return HandleResult(result);
    }

    /// <summary>
    /// Delete a parent-child relationship
    /// </summary>
    [HttpDelete("{id}")]
    [Authorize(Roles = "Developer,Owner,Admin,Editor,SuperAdmin")]
    public async Task<IActionResult> DeleteRelationship(Guid id)
    {
        var userContext = BuildUserContext();
        var result = await _parentChildService.DeleteRelationshipAsync(id, userContext);

        if (!result.IsSuccess)
        {
            return HandleError(result);
        }

        return NoContent();
    }

    /// <summary>
    /// Remove a specific parent from a child
    /// </summary>
    [HttpDelete("person/{childId}/parents/{parentId}")]
    [Authorize(Roles = "Developer,Owner,Admin,Editor,SuperAdmin")]
    public async Task<IActionResult> RemoveParent(Guid childId, Guid parentId)
    {
        var userContext = BuildUserContext();
        var result = await _parentChildService.RemoveParentAsync(childId, parentId, userContext);

        if (!result.IsSuccess)
        {
            return HandleError(result);
        }

        return NoContent();
    }

    /// <summary>
    /// Remove a specific child from a parent
    /// </summary>
    [HttpDelete("person/{parentId}/children/{childId}")]
    [Authorize(Roles = "Developer,Owner,Admin,Editor,SuperAdmin")]
    public async Task<IActionResult> RemoveChild(Guid parentId, Guid childId)
    {
        return await RemoveParent(childId, parentId);
    }

    /// <summary>
    /// Get siblings of a person
    /// </summary>
    [HttpGet("person/{personId}/siblings")]
    public async Task<ActionResult<List<SiblingResponse>>> GetSiblings(Guid personId)
    {
        var userContext = BuildUserContext();
        var result = await _parentChildService.GetSiblingsAsync(personId, userContext);

        return HandleResult(result);
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
        // Read from "treeRole" claim (set per org membership), not ClaimTypes.Role (Identity roles)
        var role = User.FindFirst("treeRole")?.Value;
        if (string.IsNullOrEmpty(role))
        {
            return "Viewer";
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
