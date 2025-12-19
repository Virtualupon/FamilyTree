using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using FamilyTreeApi.Data;
using FamilyTreeApi.DTOs;
using FamilyTreeApi.Models;
using FamilyTreeApi.Models.Enums;
using System.Security.Claims;

namespace FamilyTreeApi.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize(Roles = "SuperAdmin")] // Require SuperAdmin for all endpoints
public class AdminController : ControllerBase
{
    private readonly ApplicationDbContext _context;
    private readonly UserManager<ApplicationUser> _userManager;
    private readonly RoleManager<ApplicationRole> _roleManager;
    private readonly ILogger<AdminController> _logger;

    public AdminController(
        ApplicationDbContext context, 
        UserManager<ApplicationUser> userManager,
        RoleManager<ApplicationRole> roleManager,
        ILogger<AdminController> logger)
    {
        _context = context;
        _userManager = userManager;
        _roleManager = roleManager;
        _logger = logger;
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

    // ========================================================================
    // USER MANAGEMENT
    // ========================================================================

    /// <summary>
    /// Get all users with their system roles
    /// </summary>
    [HttpGet("users")]
    public async Task<ActionResult<List<UserSystemRoleResponse>>> GetAllUsers()
    {
        var users = await _userManager.Users.ToListAsync();
        var result = new List<UserSystemRoleResponse>();

        foreach (var user in users)
        {
            var roles = await _userManager.GetRolesAsync(user);
            var primaryRole = roles.Contains("SuperAdmin") ? "SuperAdmin" 
                            : roles.Contains("Admin") ? "Admin" 
                            : "User";
            
            var treeCount = await _context.OrgUsers.CountAsync(ou => ou.UserId == user.Id);
            
            result.Add(new UserSystemRoleResponse(
                user.Id,
                user.Email ?? "",
                user.FirstName,
                user.LastName,
                primaryRole,
                treeCount,
                user.CreatedAt
            ));
        }

        return result.OrderBy(u => u.Email).ToList();
    }

    /// <summary>
    /// Create a new user (admin only)
    /// </summary>
    [HttpPost("users")]
    public async Task<ActionResult<UserSystemRoleResponse>> CreateUser(CreateUserRequest request)
    {
        var currentUserId = GetUserId();

        // Validate role value
        var validRoles = new[] { "User", "Admin", "SuperAdmin" };
        if (!validRoles.Contains(request.SystemRole))
        {
            return BadRequest(new { message = "Invalid system role. Must be User, Admin, or SuperAdmin" });
        }

        // Check if email already exists
        var existingUser = await _userManager.FindByEmailAsync(request.Email);
        if (existingUser != null)
        {
            return BadRequest(new { message = "A user with this email already exists" });
        }

        // Create the user
        var user = new ApplicationUser
        {
            UserName = request.Email,
            Email = request.Email,
            FirstName = request.FirstName,
            LastName = request.LastName,
            EmailConfirmed = true, // Admin-created users are pre-confirmed
            CreatedAt = DateTime.UtcNow,
            LastLoginAt = DateTime.UtcNow
        };

        var createResult = await _userManager.CreateAsync(user, request.Password);
        if (!createResult.Succeeded)
        {
            var errors = string.Join(", ", createResult.Errors.Select(e => e.Description));
            return BadRequest(new { message = errors });
        }

        // Assign the system role
        var roleResult = await _userManager.AddToRoleAsync(user, request.SystemRole);
        if (!roleResult.Succeeded)
        {
            // Rollback user creation if role assignment fails
            await _userManager.DeleteAsync(user);
            var errors = string.Join(", ", roleResult.Errors.Select(e => e.Description));
            return BadRequest(new { message = $"Failed to assign role: {errors}" });
        }

        _logger.LogInformation("User created by admin: {Email} with role {Role} by {AdminId}",
            request.Email, request.SystemRole, currentUserId);

        return CreatedAtAction(nameof(GetAllUsers), new UserSystemRoleResponse(
            user.Id,
            user.Email ?? "",
            user.FirstName,
            user.LastName,
            request.SystemRole,
            0,
            user.CreatedAt
        ));
    }

    /// <summary>
    /// Update a user's system role
    /// </summary>
    [HttpPut("users/{userId}/role")]
    public async Task<ActionResult<UserSystemRoleResponse>> UpdateUserSystemRole(
        long userId, UpdateSystemRoleRequest request)
    {
        var currentUserId = GetUserId();
        
        // Can't change own role
        if (userId == currentUserId)
        {
            return BadRequest(new { message = "Cannot change your own system role" });
        }

        // Validate role value
        var validRoles = new[] { "User", "Admin", "SuperAdmin" };
        if (!validRoles.Contains(request.SystemRole))
        {
            return BadRequest(new { message = "Invalid system role. Must be User, Admin, or SuperAdmin" });
        }

        var user = await _userManager.FindByIdAsync(userId.ToString());
        if (user == null)
        {
            return NotFound(new { message = "User not found" });
        }

        // Remove from all system roles first
        var currentRoles = await _userManager.GetRolesAsync(user);
        var systemRoles = currentRoles.Where(r => validRoles.Contains(r)).ToList();
        if (systemRoles.Any())
        {
            await _userManager.RemoveFromRolesAsync(user, systemRoles);
        }

        // Add to new role
        var result = await _userManager.AddToRoleAsync(user, request.SystemRole);
        if (!result.Succeeded)
        {
            return BadRequest(new { message = string.Join(", ", result.Errors.Select(e => e.Description)) });
        }

        _logger.LogInformation("User system role changed: {UserId} to {NewRole} by {AdminId}",
            userId, request.SystemRole, currentUserId);

        var treeCount = await _context.OrgUsers.CountAsync(ou => ou.UserId == userId);

        return new UserSystemRoleResponse(
            user.Id,
            user.Email ?? "",
            user.FirstName,
            user.LastName,
            request.SystemRole,
            treeCount,
            user.CreatedAt
        );
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
        var data = await _context.AdminTreeAssignments
            .Join(_context.Users, a => a.UserId, u => u.Id, (a, u) => new { Assignment = a, User = u })
            .Join(_context.Orgs, x => x.Assignment.TreeId, o => o.Id, (x, o) => new { x.Assignment, x.User, Tree = o })
            .GroupJoin(_context.Users, x => x.Assignment.AssignedByUserId, u => u.Id, (x, assigners) => new { x.Assignment, x.User, x.Tree, Assigner = assigners.FirstOrDefault() })
            .Select(x => new
            {
                x.Assignment.Id,
                x.Assignment.UserId,
                UserEmail = x.User.Email,
                UserFirstName = x.User.FirstName,
                UserLastName = x.User.LastName,
                x.Assignment.TreeId,
                TreeName = x.Tree.Name,
                AssignerFirstName = x.Assigner != null ? x.Assigner.FirstName : null,
                AssignerLastName = x.Assigner != null ? x.Assigner.LastName : null,
                x.Assignment.AssignedAt
            })
            .OrderBy(x => x.UserEmail)
            .ToListAsync();

        var result = data.Select(x => new AdminAssignmentResponse(
            x.Id,
            x.UserId,
            x.UserEmail ?? "",
            $"{x.UserFirstName} {x.UserLastName}".Trim(),
            x.TreeId,
            x.TreeName,
            x.AssignerFirstName != null ? $"{x.AssignerFirstName} {x.AssignerLastName}".Trim() : null,
            x.AssignedAt
        )).ToList();

        return Ok(result);
    }

    /// <summary>
    /// Get assignments for a specific admin user
    /// </summary>
    [HttpGet("users/{userId}/assignments")]
    public async Task<ActionResult<List<AdminAssignmentResponse>>> GetUserAssignments(long userId)
    {
        var assignments = await _context.Set<AdminTreeAssignment>()
            .Include(a => a.User)
            .Include(a => a.Tree)
            .Include(a => a.AssignedByUser)
            .Where(a => a.UserId == userId)
            .Select(a => new AdminAssignmentResponse(
                a.Id,
                a.UserId,
                a.User.Email,
                $"{a.User.FirstName} {a.User.LastName}".Trim(),
                a.TreeId,
                a.Tree.Name,
                a.AssignedByUser != null 
                    ? $"{a.AssignedByUser.FirstName} {a.AssignedByUser.LastName}".Trim() 
                    : null,
                a.AssignedAt
            ))
            .ToListAsync();

        return assignments;
    }

    /// <summary>
    /// Assign an admin to a tree
    /// </summary>
    [HttpPost("assignments")]
    public async Task<ActionResult<AdminAssignmentResponse>> CreateAssignment(CreateAdminAssignmentRequest request)
    {
        var currentUserId = GetUserId();

        var user = await _userManager.FindByIdAsync(request.UserId.ToString());
        if (user == null)
        {
            return NotFound(new { message = "User not found" });
        }

        // User must be in Admin role
        if (!await _userManager.IsInRoleAsync(user, "Admin"))
        {
            return BadRequest(new { message = "User must have Admin system role to be assigned to trees" });
        }

        var tree = await _context.Orgs.FindAsync(request.TreeId);
        if (tree == null)
        {
            return NotFound(new { message = "Family tree not found" });
        }

        var existingAssignment = await _context.Set<AdminTreeAssignment>()
            .AnyAsync(a => a.UserId == request.UserId && a.TreeId == request.TreeId);

        if (existingAssignment)
        {
            return BadRequest(new { message = "Admin is already assigned to this tree" });
        }

        var assignment = new AdminTreeAssignment
        {
            Id = Guid.NewGuid(),
            UserId = request.UserId,
            TreeId = request.TreeId,
            AssignedByUserId = currentUserId,
            AssignedAt = DateTime.UtcNow
        };

        _context.Set<AdminTreeAssignment>().Add(assignment);
        await _context.SaveChangesAsync();

        _logger.LogInformation("Admin assigned to tree: User {UserId} -> Tree {TreeId} by {AdminId}",
            request.UserId, request.TreeId, currentUserId);

        var currentUser = await _userManager.FindByIdAsync(currentUserId.ToString());

        return new AdminAssignmentResponse(
            assignment.Id,
            user.Id,
            user.Email,
            $"{user.FirstName} {user.LastName}".Trim(),
            tree.Id,
            tree.Name,
            currentUser != null ? $"{currentUser.FirstName} {currentUser.LastName}".Trim() : null,
            assignment.AssignedAt
        );
    }

    /// <summary>
    /// Remove an admin assignment
    /// </summary>
    [HttpDelete("assignments/{assignmentId}")]
    public async Task<IActionResult> DeleteAssignment(Guid assignmentId)
    {
        var assignment = await _context.Set<AdminTreeAssignment>().FindAsync(assignmentId);
        if (assignment == null)
        {
            return NotFound(new { message = "Assignment not found" });
        }

        _context.Set<AdminTreeAssignment>().Remove(assignment);
        await _context.SaveChangesAsync();

        _logger.LogInformation("Admin assignment removed: {AssignmentId}", assignmentId);

        return NoContent();
    }

    // ========================================================================
    // STATISTICS
    // ========================================================================

    /// <summary>
    /// Get platform statistics
    /// </summary>
    [HttpGet("stats")]
    public async Task<ActionResult<object>> GetStats()
    {
        var superAdminRole = await _roleManager.FindByNameAsync("SuperAdmin");
        var adminRole = await _roleManager.FindByNameAsync("Admin");

        var stats = new
        {
            TotalUsers = await _userManager.Users.CountAsync(),
            SuperAdmins = superAdminRole != null 
                ? await _context.UserRoles.CountAsync(ur => ur.RoleId == superAdminRole.Id) 
                : 0,
            Admins = adminRole != null 
                ? await _context.UserRoles.CountAsync(ur => ur.RoleId == adminRole.Id) 
                : 0,
            TotalTrees = await _context.Orgs.CountAsync(),
            PublicTrees = await _context.Orgs.CountAsync(o => o.IsPublic),
            TotalPeople = await _context.People.CountAsync(),
            TotalMedia = await _context.MediaFiles.CountAsync(),
            TotalRelationships = await _context.ParentChildren.CountAsync() + await _context.Unions.CountAsync(),
            RecentUsers = await _userManager.Users
                .OrderByDescending(u => u.CreatedAt)
                .Take(5)
                .Select(u => new { u.Id, u.Email, u.FirstName, u.LastName, u.CreatedAt })
                .ToListAsync(),
            LargestTrees = await _context.Orgs
                .OrderByDescending(o => o.People.Count)
                .Take(5)
                .Select(o => new { o.Id, o.Name, PersonCount = o.People.Count })
                .ToListAsync()
        };

        return stats;
    }
}
