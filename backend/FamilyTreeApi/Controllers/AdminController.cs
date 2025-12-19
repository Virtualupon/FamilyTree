// File: Controllers/AdminController.cs
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using FamilyTreeApi.DTOs;
using FamilyTreeApi.Services;
using System.Security.Claims;

namespace FamilyTreeApi.Controllers;

/// <summary>
/// Admin API controller - thin controller handling only HTTP concerns.
/// All business logic is delegated to IAdminService.
/// Requires SuperAdmin role for all endpoints.
/// </summary>
[ApiController]
[Route("api/[controller]")]
[Authorize(Roles = "SuperAdmin")]
public class AdminController : ControllerBase
{
    private readonly IAdminService _adminService;
    private readonly ILogger<AdminController> _logger;

    public AdminController(IAdminService adminService, ILogger<AdminController> logger)
    {
        _adminService = adminService;
        _logger = logger;
    }

    // ========================================================================
    // USER MANAGEMENT
    // ========================================================================

    /// <summary>
    /// Get all users with their system roles
    /// </summary>
    [HttpGet("users")]
    public async Task<ActionResult<List<UserSystemRoleResponse>>> GetAllUsers()
    {
        var result = await _adminService.GetAllUsersAsync();

        return HandleResult(result);
    }

    /// <summary>
    /// Create a new user (admin only)
    /// </summary>
    [HttpPost("users")]
    public async Task<ActionResult<UserSystemRoleResponse>> CreateUser(CreateUserRequest request)
    {
        var userContext = BuildUserContext();
        var result = await _adminService.CreateUserAsync(request, userContext);

        if (!result.IsSuccess)
        {
            return HandleError(result);
        }

        return CreatedAtAction(nameof(GetAllUsers), result.Data);
    }

    /// <summary>
    /// Update a user's system role
    /// </summary>
    [HttpPut("users/{userId}/role")]
    public async Task<ActionResult<UserSystemRoleResponse>> UpdateUserSystemRole(
        long userId, UpdateSystemRoleRequest request)
    {
        var userContext = BuildUserContext();
        var result = await _adminService.UpdateUserSystemRoleAsync(userId, request, userContext);

        return HandleResult(result);
    }

    // ========================================================================
    // ADMIN TREE ASSIGNMENTS
    // ========================================================================

    /// <summary>
    /// Get all admin tree assignments
    /// </summary>
    [HttpGet("assignments")]
    public async Task<ActionResult<List<AdminAssignmentResponse>>> GetAllAssignments()
    {
        var result = await _adminService.GetAllAssignmentsAsync();

        return HandleResult(result);
    }

    /// <summary>
    /// Get assignments for a specific admin user
    /// </summary>
    [HttpGet("users/{userId}/assignments")]
    public async Task<ActionResult<List<AdminAssignmentResponse>>> GetUserAssignments(long userId)
    {
        var result = await _adminService.GetUserAssignmentsAsync(userId);

        return HandleResult(result);
    }

    /// <summary>
    /// Assign an admin to a tree
    /// </summary>
    [HttpPost("assignments")]
    public async Task<ActionResult<AdminAssignmentResponse>> CreateAssignment(CreateAdminAssignmentRequest request)
    {
        var userContext = BuildUserContext();
        var result = await _adminService.CreateAssignmentAsync(request, userContext);

        return HandleResult(result);
    }

    /// <summary>
    /// Remove an admin assignment
    /// </summary>
    [HttpDelete("assignments/{assignmentId}")]
    public async Task<IActionResult> DeleteAssignment(Guid assignmentId)
    {
        var result = await _adminService.DeleteAssignmentAsync(assignmentId);

        if (!result.IsSuccess)
        {
            return HandleError(result);
        }

        return NoContent();
    }

    // ========================================================================
    // STATISTICS
    // ========================================================================

    /// <summary>
    /// Get platform statistics
    /// </summary>
    [HttpGet("stats")]
    public async Task<ActionResult<AdminStatsDto>> GetStats()
    {
        var result = await _adminService.GetStatsAsync();

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
            ServiceErrorType.Unauthorized => Unauthorized(),
            ServiceErrorType.InternalError => StatusCode(500, new { message = result.ErrorMessage }),
            _ => BadRequest(new { message = result.ErrorMessage })
        };
    }
}
