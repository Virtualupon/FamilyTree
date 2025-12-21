using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using FamilyTreeApi.DTOs;
using FamilyTreeApi.Services;
using System.Security.Claims;

namespace FamilyTreeApi.Controllers;

/// <summary>
/// Family API controller for managing family groups within trees.
/// Hierarchy: Town -> Org (Family Tree) -> Family -> Person
/// </summary>
[ApiController]
[Route("api/[controller]")]
[Authorize]
public class FamilyController : ControllerBase
{
    private readonly IFamilyService _familyService;
    private readonly ILogger<FamilyController> _logger;

    public FamilyController(IFamilyService familyService, ILogger<FamilyController> logger)
    {
        _familyService = familyService;
        _logger = logger;
    }

    // ========================================================================
    // FAMILY QUERIES
    // ========================================================================

    /// <summary>
    /// Get all families in a family tree
    /// </summary>
    [HttpGet("by-tree/{treeId}")]
    public async Task<ActionResult<List<FamilyListItem>>> GetFamiliesByTree(Guid treeId)
    {
        var userContext = BuildUserContext();
        var result = await _familyService.GetFamiliesByTreeAsync(treeId, userContext);
        return HandleResult(result);
    }

    /// <summary>
    /// Get all families in a town (across accessible trees)
    /// </summary>
    [HttpGet("by-town/{townId}")]
    public async Task<ActionResult<List<FamilyListItem>>> GetFamiliesByTown(Guid townId)
    {
        var userContext = BuildUserContext();
        var result = await _familyService.GetFamiliesByTownAsync(townId, userContext);
        return HandleResult(result);
    }

    /// <summary>
    /// Get a specific family by ID
    /// </summary>
    [HttpGet("{id}")]
    public async Task<ActionResult<FamilyResponse>> GetFamily(Guid id)
    {
        var userContext = BuildUserContext();
        var result = await _familyService.GetFamilyAsync(id, userContext);
        return HandleResult(result);
    }

    /// <summary>
    /// Get a family with its members
    /// </summary>
    [HttpGet("{id}/members")]
    public async Task<ActionResult<FamilyWithMembersResponse>> GetFamilyWithMembers(Guid id)
    {
        var userContext = BuildUserContext();
        var result = await _familyService.GetFamilyWithMembersAsync(id, userContext);
        return HandleResult(result);
    }

    // ========================================================================
    // FAMILY CRUD
    // ========================================================================

    /// <summary>
    /// Create a new family
    /// </summary>
    [HttpPost]
    public async Task<ActionResult<FamilyResponse>> CreateFamily(CreateFamilyRequest request)
    {
        var userContext = BuildUserContext();
        var result = await _familyService.CreateFamilyAsync(request, userContext);

        if (!result.IsSuccess)
        {
            return HandleError(result);
        }

        return CreatedAtAction(nameof(GetFamily), new { id = result.Data!.Id }, result.Data);
    }

    /// <summary>
    /// Update an existing family
    /// </summary>
    [HttpPut("{id}")]
    public async Task<ActionResult<FamilyResponse>> UpdateFamily(Guid id, UpdateFamilyRequest request)
    {
        var userContext = BuildUserContext();
        var result = await _familyService.UpdateFamilyAsync(id, request, userContext);
        return HandleResult(result);
    }

    /// <summary>
    /// Delete a family
    /// </summary>
    [HttpDelete("{id}")]
    public async Task<IActionResult> DeleteFamily(Guid id)
    {
        var userContext = BuildUserContext();
        var result = await _familyService.DeleteFamilyAsync(id, userContext);

        if (!result.IsSuccess)
        {
            return HandleError(result);
        }

        return NoContent();
    }

    // ========================================================================
    // MEMBER ASSIGNMENT
    // ========================================================================

    /// <summary>
    /// Assign a person to a family (or remove by passing null FamilyId)
    /// </summary>
    [HttpPost("assign")]
    public async Task<IActionResult> AssignPersonToFamily(AssignFamilyRequest request)
    {
        var userContext = BuildUserContext();
        var result = await _familyService.AssignPersonToFamilyAsync(request, userContext);

        if (!result.IsSuccess)
        {
            return HandleError(result);
        }

        return Ok(new { message = "Person assigned successfully" });
    }

    /// <summary>
    /// Bulk assign multiple people to a family
    /// </summary>
    [HttpPost("{familyId}/bulk-assign")]
    public async Task<ActionResult<int>> BulkAssignToFamily(Guid familyId, [FromBody] List<Guid> personIds)
    {
        var userContext = BuildUserContext();
        var result = await _familyService.BulkAssignToFamilyAsync(familyId, personIds, userContext);
        return HandleResult(result);
    }

    // ========================================================================
    // PRIVATE HELPERS
    // ========================================================================

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

    private ActionResult<T> HandleResult<T>(ServiceResult<T> result)
    {
        if (result.IsSuccess)
        {
            return Ok(result.Data);
        }
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
