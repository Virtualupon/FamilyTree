// File: Controllers/TreeController.cs
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using FamilyTreeApi.DTOs;
using FamilyTreeApi.Services;
using System.Security.Claims;

namespace FamilyTreeApi.Controllers;

/// <summary>
/// Tree API controller - thin controller handling only HTTP concerns.
/// All tree view business logic is delegated to ITreeViewService.
/// </summary>
[ApiController]
[Route("api/[controller]")]
[Authorize]
public class TreeController : ControllerBase
{
    private readonly ITreeViewService _treeViewService;
    private readonly ILogger<TreeController> _logger;

    public TreeController(ITreeViewService treeViewService, ILogger<TreeController> logger)
    {
        _treeViewService = treeViewService;
        _logger = logger;
    }

    /// <summary>
    /// Get pedigree (ancestors) view for a person - returns hierarchical tree
    /// </summary>
    [HttpPost("pedigree")]
    public async Task<ActionResult<TreePersonNode>> GetPedigree([FromBody] TreeViewRequest request)
    {
        var userContext = BuildUserContext();
        var result = await _treeViewService.GetPedigreeAsync(request, userContext);

        return HandleResult(result);
    }

    /// <summary>
    /// Get descendants view for a person - returns hierarchical tree
    /// </summary>
    [HttpPost("descendants")]
    public async Task<ActionResult<TreePersonNode>> GetDescendants([FromBody] TreeViewRequest request)
    {
        var userContext = BuildUserContext();
        var result = await _treeViewService.GetDescendantsAsync(request, userContext);

        return HandleResult(result);
    }

    /// <summary>
    /// Get hourglass view (both ancestors and descendants) for a person
    /// </summary>
    [HttpPost("hourglass")]
    public async Task<ActionResult<TreePersonNode>> GetHourglass([FromBody] TreeViewRequest request)
    {
        var userContext = BuildUserContext();
        var result = await _treeViewService.GetHourglassAsync(request, userContext);

        return HandleResult(result);
    }

    /// <summary>
    /// Get family group (person with spouse(s) and children)
    /// </summary>
    [HttpGet("family/{personId}")]
    public async Task<ActionResult<FamilyGroupResponse>> GetFamilyGroup(Guid personId, [FromQuery] Guid? treeId)
    {
        var userContext = BuildUserContext();
        var result = await _treeViewService.GetFamilyGroupAsync(personId, treeId, userContext);

        return HandleResult(result);
    }

    /// <summary>
    /// Calculate relationship between two people
    /// </summary>
    [HttpGet("relationship")]
    public async Task<ActionResult<RelationshipResponse>> GetRelationship(
        [FromQuery] Guid person1Id,
        [FromQuery] Guid person2Id,
        [FromQuery] Guid? treeId)
    {
        var userContext = BuildUserContext();
        var result = await _treeViewService.GetRelationshipAsync(person1Id, person2Id, treeId, userContext);

        return HandleResult(result);
    }

    /// <summary>
    /// Find relationship path between two people with full details.
    /// Returns the shortest path using BFS with person details and relationship labels.
    /// </summary>
    [HttpPost("relationship-path")]
    public async Task<ActionResult<RelationshipPathResponse>> FindRelationshipPath(
        [FromBody] RelationshipPathRequest request)
    {
        var userContext = BuildUserContext();
        var result = await _treeViewService.FindRelationshipPathAsync(request, userContext);

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
