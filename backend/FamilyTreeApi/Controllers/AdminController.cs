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
/// Requires Developer or SuperAdmin role for all endpoints (with Admin for specific endpoints).
/// </summary>
[ApiController]
[Route("api/[controller]")]
[Authorize(Roles = "Developer,SuperAdmin")]
public class AdminController : ControllerBase
{
    private readonly IAdminService _adminService;
    private readonly IAuditLogService _auditLogService;
    private readonly IAnalyticsService _analyticsService;
    private readonly ILogger<AdminController> _logger;

    public AdminController(
        IAdminService adminService,
        IAuditLogService auditLogService,
        IAnalyticsService analyticsService,
        ILogger<AdminController> logger)
    {
        _adminService = adminService;
        _auditLogService = auditLogService;
        _analyticsService = analyticsService;
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
        var userContext = BuildUserContext();

        // SECURITY: Audit log admin access to user list
        await _auditLogService.LogAdminAccessAsync(
            userContext.UserId, "GET /api/admin/users", GetClientIp());

        var result = await _adminService.GetAllUsersAsync(userContext);

        return HandleResult(result);
    }

    /// <summary>
    /// Create a new user (admin only)
    /// </summary>
    [HttpPost("users")]
    public async Task<ActionResult<UserSystemRoleResponse>> CreateUser(CreateUserRequest request)
    {
        var userContext = BuildUserContext();

        // SECURITY: Audit log user creation
        await _auditLogService.LogAdminAccessAsync(
            userContext.UserId, "POST /api/admin/users", GetClientIp());

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

        // SECURITY: Audit log role changes (high-sensitivity action)
        await _auditLogService.LogAdminAccessAsync(
            userContext.UserId, $"PUT /api/admin/users/{userId}/role", GetClientIp());

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
        var result = await _adminService.GetAllAssignmentsAsync(BuildUserContext());

        return HandleResult(result);
    }

    /// <summary>
    /// Get assignments for a specific admin user
    /// Admins can only get their own assignments; Developer/SuperAdmins can get any user's
    /// </summary>
    [Authorize(Roles = "Developer,SuperAdmin,Admin")]
    [HttpGet("users/{userId}/assignments")]
    public async Task<ActionResult<List<AdminAssignmentResponse>>> GetUserAssignments(long userId)
    {
        var userContext = BuildUserContext();
        var result = await _adminService.GetUserAssignmentsAsync(userId, userContext);

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
        var result = await _adminService.DeleteAssignmentAsync(assignmentId, BuildUserContext());

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
        var userContext = BuildUserContext();

        // SECURITY: Audit log stats access
        await _auditLogService.LogAdminAccessAsync(
            userContext.UserId, "GET /api/admin/stats", GetClientIp());

        var result = await _adminService.GetStatsAsync(userContext);

        return HandleResult(result);
    }

    // ========================================================================
    // ADMIN TOWN ASSIGNMENTS (Town-scoped access)
    // ========================================================================

    /// <summary>
    /// Get all admin town assignments
    /// </summary>
    [HttpGet("town-assignments")]
    public async Task<ActionResult<List<AdminTownAssignmentResponse>>> GetAllTownAssignments()
    {
        var result = await _adminService.GetAllTownAssignmentsAsync(BuildUserContext());

        return HandleResult(result);
    }

    /// <summary>
    /// Get town assignments for a specific admin user
    /// Admins can only get their own assignments; Developer/SuperAdmins can get any user's
    /// </summary>
    [Authorize(Roles = "Developer,SuperAdmin,Admin")]
    [HttpGet("users/{userId}/town-assignments")]
    public async Task<ActionResult<List<AdminTownAssignmentResponse>>> GetUserTownAssignments(long userId)
    {
        var userContext = BuildUserContext();
        var result = await _adminService.GetUserTownAssignmentsAsync(userId, userContext);

        return HandleResult(result);
    }

    /// <summary>
    /// Assign an admin to a town (grants access to all trees in the town)
    /// </summary>
    [HttpPost("town-assignments")]
    public async Task<ActionResult<AdminTownAssignmentResponse>> CreateTownAssignment(
        CreateAdminTownAssignmentRequest request)
    {
        var userContext = BuildUserContext();
        var result = await _adminService.CreateTownAssignmentAsync(request, userContext);

        return HandleResult(result);
    }

    /// <summary>
    /// Assign an admin to multiple towns at once
    /// </summary>
    [HttpPost("town-assignments/bulk")]
    public async Task<ActionResult<List<AdminTownAssignmentResponse>>> CreateTownAssignmentsBulk(
        CreateAdminTownAssignmentBulkRequest request)
    {
        var userContext = BuildUserContext();
        var result = await _adminService.CreateTownAssignmentsBulkAsync(request, userContext);

        return HandleResult(result);
    }

    /// <summary>
    /// Remove an admin town assignment (hard delete)
    /// </summary>
    [HttpDelete("town-assignments/{assignmentId}")]
    public async Task<IActionResult> DeleteTownAssignment(Guid assignmentId)
    {
        var result = await _adminService.DeleteTownAssignmentAsync(assignmentId, BuildUserContext());

        if (!result.IsSuccess)
        {
            return HandleError(result);
        }

        return NoContent();
    }

    /// <summary>
    /// Deactivate an admin town assignment (soft delete)
    /// </summary>
    [HttpPatch("town-assignments/{assignmentId}/deactivate")]
    public async Task<IActionResult> DeactivateTownAssignment(Guid assignmentId)
    {
        var result = await _adminService.DeactivateTownAssignmentAsync(assignmentId, BuildUserContext());

        if (!result.IsSuccess)
        {
            return HandleError(result);
        }

        return NoContent();
    }

    /// <summary>
    /// Get assigned towns for an admin (used after login for town selection)
    /// </summary>
    [HttpGet("users/{userId}/admin-towns")]
    [Authorize(Roles = "Developer,SuperAdmin,Admin")]
    public async Task<ActionResult<AdminLoginResponse>> GetAdminTowns(long userId)
    {
        var userContext = BuildUserContext();
        var result = await _adminService.GetAdminTownsAsync(userId, userContext);

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

    // ========================================================================
    // ANALYTICS
    // ========================================================================

    /// <summary>
    /// Get complete analytics dashboard data
    /// </summary>
    [HttpGet("analytics")]
    public async Task<ActionResult<AnalyticsDashboardDto>> GetAnalytics(
        [FromQuery] int days = 30)
    {
        var userContext = BuildUserContext();

        await _auditLogService.LogAdminAccessAsync(
            userContext.UserId, "GET /api/admin/analytics", GetClientIp());

        var result = await _analyticsService.GetDashboardAsync(days, userContext);
        return HandleResult(result);
    }

    /// <summary>
    /// Get growth metrics for a specific period (for period toggle)
    /// </summary>
    [HttpGet("analytics/growth")]
    public async Task<ActionResult<GrowthMetricsDto>> GetGrowthMetrics(
        [FromQuery] int days = 30)
    {
        var userContext = BuildUserContext();
        var result = await _analyticsService.GetGrowthMetricsAsync(days, userContext);
        return HandleResult(result);
    }

    // ========================================================================
    // ACTIVITY LOGS
    // ========================================================================

    /// <summary>
    /// Get paginated, filtered activity logs (SuperAdmin/Developer only)
    /// </summary>
    [HttpGet("activity-logs")]
    public async Task<ActionResult<ActivityLogResponse>> GetActivityLogs(
        [FromQuery] ActivityLogQuery query)
    {
        var result = await _auditLogService.GetPagedLogsAsync(query);
        return Ok(result);
    }

    /// <summary>
    /// Get available filter values for activity log dropdowns
    /// </summary>
    [HttpGet("activity-logs/filters")]
    public async Task<ActionResult<ActivityLogFiltersDto>> GetActivityLogFilters()
    {
        var result = await _auditLogService.GetFiltersAsync();
        return Ok(result);
    }

    // ========================================================================
    // PRIVATE HELPER METHODS
    // ========================================================================

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
    /// Get client IP address for audit logging.
    /// </summary>
    private string? GetClientIp()
    {
        return HttpContext.Connection.RemoteIpAddress?.ToString();
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
