// File: Controllers/FamilyTreeController.cs
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using FamilyTreeApi.DTOs;
using FamilyTreeApi.Services;
using System.Security.Claims;

namespace FamilyTreeApi.Controllers;

/// <summary>
/// FamilyTree API controller - thin controller handling only HTTP concerns.
/// All business logic is delegated to IFamilyTreeService.
/// </summary>
[ApiController]
[Route("api/[controller]")]
[Authorize]
public class FamilyTreeController : ControllerBase
{
    private readonly IFamilyTreeService _familyTreeService;
    private readonly ILogger<FamilyTreeController> _logger;

    public FamilyTreeController(IFamilyTreeService familyTreeService, ILogger<FamilyTreeController> logger)
    {
        _familyTreeService = familyTreeService;
        _logger = logger;
    }

    // ============================================================================
    // TREE CRUD OPERATIONS
    // ============================================================================

    /// <summary>
    /// Get all family trees accessible to the current user.
    /// </summary>
    [HttpGet]
    public async Task<ActionResult<List<FamilyTreeListItem>>> GetMyTrees()
    {
        var userContext = BuildUserContext();
        var result = await _familyTreeService.GetMyTreesAsync(userContext);

        return HandleResult(result);
    }

    /// <summary>
    /// Get a specific family tree by ID.
    /// </summary>
    [HttpGet("{id}")]
    public async Task<ActionResult<FamilyTreeResponse>> GetTree(Guid id)
    {
        var userContext = BuildUserContext();
        var result = await _familyTreeService.GetTreeAsync(id, userContext);

        return HandleResult(result);
    }

    /// <summary>
    /// Get detailed family tree information with statistics
    /// </summary>
    [HttpGet("{treeId}/details")]
    public async Task<ActionResult<FamilyTreeDetailDto>> GetTreeDetails(Guid treeId)
    {
        var userContext = BuildUserContext();
        var result = await _familyTreeService.GetTreeDetailsAsync(treeId, userContext);

        return HandleResult(result);
    }

    /// <summary>
    /// Get paginated list of people in a family tree
    /// </summary>
    [HttpGet("{treeId}/people")]
    public async Task<ActionResult<PaginatedPeopleResponse>> GetTreePeople(
        Guid treeId,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 50,
        [FromQuery] string? search = null,
        [FromQuery] string? sex = null,
        [FromQuery] bool? isLiving = null,
        [FromQuery] string sortBy = "name",
        [FromQuery] string sortOrder = "asc")
    {
        var userContext = BuildUserContext();
        var request = new GetTreePeopleRequest
        {
            Page = page,
            PageSize = pageSize,
            Search = search,
            Sex = sex,
            IsLiving = isLiving,
            SortBy = sortBy,
            SortOrder = sortOrder
        };
        var result = await _familyTreeService.GetTreePeopleAsync(treeId, request, userContext);

        return HandleResult(result);
    }

    /// <summary>
    /// Create a new family tree.
    /// </summary>
    [HttpPost]
    public async Task<ActionResult<FamilyTreeResponse>> CreateTree(CreateFamilyTreeRequest request)
    {
        var userContext = BuildUserContext();
        var result = await _familyTreeService.CreateTreeAsync(request, userContext);

        if (!result.IsSuccess)
        {
            return HandleError(result);
        }

        return CreatedAtAction(nameof(GetTree), new { id = result.Data!.Id }, result.Data);
    }

    /// <summary>
    /// Update an existing family tree.
    /// </summary>
    [HttpPut("{id}")]
    public async Task<ActionResult<FamilyTreeResponse>> UpdateTree(Guid id, UpdateFamilyTreeRequest request)
    {
        var userContext = BuildUserContext();
        var result = await _familyTreeService.UpdateTreeAsync(id, request, userContext);

        return HandleResult(result);
    }

    /// <summary>
    /// Delete a family tree.
    /// </summary>
    [HttpDelete("{id}")]
    public async Task<IActionResult> DeleteTree(Guid id)
    {
        var userContext = BuildUserContext();
        var result = await _familyTreeService.DeleteTreeAsync(id, userContext);

        if (!result.IsSuccess)
        {
            return HandleError(result);
        }

        return NoContent();
    }

    // ============================================================================
    // TREE MEMBER OPERATIONS
    // ============================================================================

    /// <summary>
    /// Get all members of a family tree.
    /// </summary>
    [HttpGet("{treeId}/members")]
    public async Task<ActionResult<List<TreeMemberResponse>>> GetTreeMembers(Guid treeId)
    {
        var userContext = BuildUserContext();
        var result = await _familyTreeService.GetMembersAsync(treeId, userContext);

        return HandleResult(result);
    }

    /// <summary>
    /// Add a member to a family tree.
    /// </summary>
    [HttpPost("{treeId}/members")]
    public async Task<ActionResult<TreeMemberResponse>> AddTreeMember(Guid treeId, AddTreeMemberRequest request)
    {
        var userContext = BuildUserContext();
        var result = await _familyTreeService.AddMemberAsync(treeId, request, userContext);

        if (!result.IsSuccess)
        {
            return HandleError(result);
        }

        return CreatedAtAction(nameof(GetTreeMembers), new { treeId }, result.Data);
    }

    /// <summary>
    /// Update a member's role.
    /// </summary>
    [HttpPut("{treeId}/members/{userId}")]
    public async Task<ActionResult<TreeMemberResponse>> UpdateMemberRole(
        Guid treeId,
        long userId,
        UpdateTreeMemberRoleRequest request)
    {
        var userContext = BuildUserContext();
        var result = await _familyTreeService.UpdateMemberRoleAsync(treeId, userId, request, userContext);

        return HandleResult(result);
    }

    /// <summary>
    /// Remove a member from a family tree.
    /// </summary>
    [HttpDelete("{treeId}/members/{userId}")]
    public async Task<IActionResult> RemoveMember(Guid treeId, long userId)
    {
        var userContext = BuildUserContext();
        var result = await _familyTreeService.RemoveMemberAsync(treeId, userId, userContext);

        if (!result.IsSuccess)
        {
            return HandleError(result);
        }

        return NoContent();
    }

    // ============================================================================
    // INVITATION OPERATIONS
    // ============================================================================

    /// <summary>
    /// Get all invitations for a family tree.
    /// </summary>
    [HttpGet("{treeId}/invitations")]
    public async Task<ActionResult<List<TreeInvitationResponse>>> GetInvitations(Guid treeId)
    {
        var userContext = BuildUserContext();
        var result = await _familyTreeService.GetInvitationsAsync(treeId, userContext);

        return HandleResult(result);
    }

    /// <summary>
    /// Create an invitation to join a family tree.
    /// </summary>
    [HttpPost("{treeId}/invitations")]
    public async Task<ActionResult<TreeInvitationResponse>> CreateInvitation(
        Guid treeId,
        CreateInvitationRequest request)
    {
        var userContext = BuildUserContext();
        var result = await _familyTreeService.CreateInvitationAsync(treeId, request, userContext);

        if (!result.IsSuccess)
        {
            return HandleError(result);
        }

        return CreatedAtAction(nameof(GetInvitations), new { treeId }, result.Data);
    }

    /// <summary>
    /// Accept an invitation to join a family tree.
    /// </summary>
    [HttpPost("invitations/accept")]
    public async Task<ActionResult<FamilyTreeResponse>> AcceptInvitation(AcceptInvitationRequest request)
    {
        var userContext = BuildUserContext();
        var result = await _familyTreeService.AcceptInvitationAsync(request.Token, userContext);

        return HandleResult(result);
    }

    /// <summary>
    /// Delete an invitation.
    /// </summary>
    [HttpDelete("{treeId}/invitations/{invitationId}")]
    public async Task<IActionResult> DeleteInvitation(Guid treeId, Guid invitationId)
    {
        var userContext = BuildUserContext();
        var result = await _familyTreeService.DeleteInvitationAsync(treeId, invitationId, userContext);

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
