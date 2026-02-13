// File: Services/AdminService.cs
using AutoMapper;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using FamilyTreeApi.DTOs;
using FamilyTreeApi.Models;
using FamilyTreeApi.Repositories;

namespace FamilyTreeApi.Services;

/// <summary>
/// Admin service implementation containing all Developer/SuperAdmin business logic.
/// Uses repositories for data access and AutoMapper for DTO mapping.
/// All methods enforce service-layer authorization (defense in depth).
/// </summary>
public class AdminService : IAdminService
{
    private readonly IRepository<AdminTreeAssignment> _adminAssignmentRepository;
    private readonly IRepository<AdminTownAssignment> _adminTownAssignmentRepository;
    private readonly IRepository<Org> _orgRepository;
    private readonly IRepository<Town> _townRepository;
    private readonly IRepository<Person> _personRepository;
    private readonly IRepository<Media> _mediaRepository;
    private readonly IRepository<ParentChild> _parentChildRepository;
    private readonly IRepository<Union> _unionRepository;
    private readonly IRepository<OrgUser> _orgUserRepository;
    private readonly UserManager<ApplicationUser> _userManager;
    private readonly RoleManager<ApplicationRole> _roleManager;
    private readonly IMapper _mapper;
    private readonly ILogger<AdminService> _logger;

    public AdminService(
        IRepository<AdminTreeAssignment> adminAssignmentRepository,
        IRepository<AdminTownAssignment> adminTownAssignmentRepository,
        IRepository<Org> orgRepository,
        IRepository<Town> townRepository,
        IRepository<Person> personRepository,
        IRepository<Media> mediaRepository,
        IRepository<ParentChild> parentChildRepository,
        IRepository<Union> unionRepository,
        IRepository<OrgUser> orgUserRepository,
        UserManager<ApplicationUser> userManager,
        RoleManager<ApplicationRole> roleManager,
        IMapper mapper,
        ILogger<AdminService> logger)
    {
        _adminAssignmentRepository = adminAssignmentRepository;
        _adminTownAssignmentRepository = adminTownAssignmentRepository;
        _orgRepository = orgRepository;
        _townRepository = townRepository;
        _personRepository = personRepository;
        _mediaRepository = mediaRepository;
        _parentChildRepository = parentChildRepository;
        _unionRepository = unionRepository;
        _orgUserRepository = orgUserRepository;
        _userManager = userManager;
        _roleManager = roleManager;
        _mapper = mapper;
        _logger = logger;
    }

    // ============================================================================
    // USER MANAGEMENT
    // ============================================================================

    public async Task<ServiceResult<List<UserSystemRoleResponse>>> GetAllUsersAsync(
        UserContext userContext,
        CancellationToken cancellationToken = default)
    {
        // Authorization: Developer or SuperAdmin only
        if (!userContext.HasAdminPanelAccess)
            return ServiceResult<List<UserSystemRoleResponse>>.Forbidden("Access denied. Developer or SuperAdmin role required.");

        try
        {
            // PERFORMANCE FIX: Single query with eager loading instead of N+1 queries.
            // Previously: 1 query for users + N queries for roles + N queries for tree count = 2N+1 queries.
            // Now: 1 query with Include for roles and a subquery for tree count.
            var usersWithRoles = await _userManager.Users
                .Include(u => u.UserRoles)
                    .ThenInclude(ur => ur.Role)
                .Select(u => new
                {
                    u.Id,
                    Email = u.Email ?? "",
                    u.FirstName,
                    u.LastName,
                    u.CreatedAt,
                    RoleNames = u.UserRoles.Select(ur => ur.Role.Name).ToList(),
                    TreeCount = u.OrgUsers.Count
                })
                .OrderBy(u => u.Email)
                .ToListAsync(cancellationToken);

            var result = usersWithRoles.Select(u =>
            {
                var primaryRole = u.RoleNames.Contains("Developer") ? "Developer"
                                : u.RoleNames.Contains("SuperAdmin") ? "SuperAdmin"
                                : u.RoleNames.Contains("Admin") ? "Admin"
                                : "User";

                return new UserSystemRoleResponse(
                    u.Id,
                    u.Email,
                    u.FirstName,
                    u.LastName,
                    primaryRole,
                    u.TreeCount,
                    u.CreatedAt
                );
            }).ToList();

            return ServiceResult<List<UserSystemRoleResponse>>.Success(result);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting all users: {Message}", ex.Message);
            return ServiceResult<List<UserSystemRoleResponse>>.InternalError("Error loading users");
        }
    }

    public async Task<ServiceResult<UserSystemRoleResponse>> CreateUserAsync(
        CreateUserRequest request,
        UserContext userContext,
        CancellationToken cancellationToken = default)
    {
        // Authorization: Developer or SuperAdmin only
        if (!userContext.HasAdminPanelAccess)
            return ServiceResult<UserSystemRoleResponse>.Forbidden("Access denied. Developer or SuperAdmin role required.");

        try
        {
            // Developer role cannot be assigned through the API — it is immutable
            if (request.SystemRole == "Developer")
            {
                return ServiceResult<UserSystemRoleResponse>.Forbidden(
                    "Cannot assign Developer role through the API. Developer role is immutable.");
            }

            // Validate role value
            var validRoles = new[] { "User", "Admin", "SuperAdmin" };
            if (!validRoles.Contains(request.SystemRole))
            {
                return ServiceResult<UserSystemRoleResponse>.Failure(
                    "Invalid system role. Must be User, Admin, or SuperAdmin");
            }

            // Check if email already exists
            var existingUser = await _userManager.FindByEmailAsync(request.Email);
            if (existingUser != null)
            {
                return ServiceResult<UserSystemRoleResponse>.Failure(
                    "A user with this email already exists");
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
                return ServiceResult<UserSystemRoleResponse>.Failure(errors);
            }

            // Assign the system role
            var roleResult = await _userManager.AddToRoleAsync(user, request.SystemRole);
            if (!roleResult.Succeeded)
            {
                // Rollback user creation if role assignment fails
                await _userManager.DeleteAsync(user);
                var errors = string.Join(", ", roleResult.Errors.Select(e => e.Description));
                return ServiceResult<UserSystemRoleResponse>.Failure($"Failed to assign role: {errors}");
            }

            _logger.LogInformation("User created by admin: {Email} with role {Role} by {AdminId}",
                request.Email, request.SystemRole, userContext.UserId);

            var response = new UserSystemRoleResponse(
                user.Id,
                user.Email ?? "",
                user.FirstName,
                user.LastName,
                request.SystemRole,
                0,
                user.CreatedAt
            );

            return ServiceResult<UserSystemRoleResponse>.Success(response);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error creating user {Email}: {Message}", request.Email, ex.Message);
            return ServiceResult<UserSystemRoleResponse>.InternalError("Error creating user");
        }
    }

    public async Task<ServiceResult<UserSystemRoleResponse>> UpdateUserSystemRoleAsync(
        long userId,
        UpdateSystemRoleRequest request,
        UserContext userContext,
        CancellationToken cancellationToken = default)
    {
        // Authorization: Developer or SuperAdmin only
        if (!userContext.HasAdminPanelAccess)
            return ServiceResult<UserSystemRoleResponse>.Forbidden("Access denied. Developer or SuperAdmin role required.");

        try
        {
            // Can't change own role
            if (userId == userContext.UserId)
            {
                return ServiceResult<UserSystemRoleResponse>.Failure(
                    "Cannot change your own system role");
            }

            // Developer role cannot be assigned through the API — it is immutable
            if (request.SystemRole == "Developer")
            {
                return ServiceResult<UserSystemRoleResponse>.Forbidden(
                    "Cannot assign Developer role through the API. Developer role is immutable.");
            }

            // Validate role value
            var validRoles = new[] { "User", "Admin", "SuperAdmin" };
            if (!validRoles.Contains(request.SystemRole))
            {
                return ServiceResult<UserSystemRoleResponse>.Failure(
                    "Invalid system role. Must be User, Admin, or SuperAdmin");
            }

            var user = await _userManager.FindByIdAsync(userId.ToString());
            if (user == null)
            {
                return ServiceResult<UserSystemRoleResponse>.NotFound("User not found");
            }

            // Developer's role cannot be changed by anyone
            var targetUserRoles = await _userManager.GetRolesAsync(user);
            if (targetUserRoles.Contains("Developer"))
            {
                return ServiceResult<UserSystemRoleResponse>.Forbidden(
                    "Cannot change a Developer's system role. Developer role is immutable.");
            }

            // Remove from all system roles first
            var currentRoles = targetUserRoles.Where(r => validRoles.Contains(r)).ToList();
            if (currentRoles.Any())
            {
                await _userManager.RemoveFromRolesAsync(user, currentRoles);
            }

            // Add to new role
            var result = await _userManager.AddToRoleAsync(user, request.SystemRole);
            if (!result.Succeeded)
            {
                return ServiceResult<UserSystemRoleResponse>.Failure(
                    string.Join(", ", result.Errors.Select(e => e.Description)));
            }

            _logger.LogInformation("User system role changed: {UserId} to {NewRole} by {AdminId}",
                userId, request.SystemRole, userContext.UserId);

            var treeCount = await _orgUserRepository.CountAsync(ou => ou.UserId == userId, cancellationToken);

            var response = new UserSystemRoleResponse(
                user.Id,
                user.Email ?? "",
                user.FirstName,
                user.LastName,
                request.SystemRole,
                treeCount,
                user.CreatedAt
            );

            return ServiceResult<UserSystemRoleResponse>.Success(response);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error updating user role {UserId}: {Message}", userId, ex.Message);
            return ServiceResult<UserSystemRoleResponse>.InternalError("Error updating user role");
        }
    }

    // ============================================================================
    // ADMIN TREE ASSIGNMENTS
    // ============================================================================

    public async Task<ServiceResult<List<AdminAssignmentResponse>>> GetAllAssignmentsAsync(
        UserContext userContext,
        CancellationToken cancellationToken = default)
    {
        // Authorization: Developer or SuperAdmin only
        if (!userContext.HasAdminPanelAccess)
            return ServiceResult<List<AdminAssignmentResponse>>.Forbidden("Access denied. Developer or SuperAdmin role required.");

        try
        {
            var assignments = await _adminAssignmentRepository
                .Query()
                .Include(a => a.User)
                .Include(a => a.Tree)
                .Include(a => a.AssignedByUser)
                .OrderBy(a => a.User.Email)
                .ToListAsync(cancellationToken);

            var result = assignments.Select(a => new AdminAssignmentResponse(
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
            )).ToList();

            return ServiceResult<List<AdminAssignmentResponse>>.Success(result);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting all assignments: {Message}", ex.Message);
            return ServiceResult<List<AdminAssignmentResponse>>.InternalError("Error loading assignments");
        }
    }

    public async Task<ServiceResult<List<AdminAssignmentResponse>>> GetUserAssignmentsAsync(
        long userId,
        UserContext userContext,
        CancellationToken cancellationToken = default)
    {
        // Authorization: Developer/SuperAdmin can see any user, Admin can see own only
        if (!userContext.HasAdminOrHigherAccess)
            return ServiceResult<List<AdminAssignmentResponse>>.Forbidden("Access denied.");

        if (userContext.IsAdmin && userContext.UserId != userId)
            return ServiceResult<List<AdminAssignmentResponse>>.Forbidden("Admins can only view their own assignments.");

        try
        {
            var assignments = await _adminAssignmentRepository
                .Query()
                .Include(a => a.User)
                .Include(a => a.Tree)
                .Include(a => a.AssignedByUser)
                .Where(a => a.UserId == userId)
                .ToListAsync(cancellationToken);

            var result = assignments.Select(a => new AdminAssignmentResponse(
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
            )).ToList();

            return ServiceResult<List<AdminAssignmentResponse>>.Success(result);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting user assignments for {UserId}: {Message}", userId, ex.Message);
            return ServiceResult<List<AdminAssignmentResponse>>.InternalError("Error loading user assignments");
        }
    }

    public async Task<ServiceResult<AdminAssignmentResponse>> CreateAssignmentAsync(
        CreateAdminAssignmentRequest request,
        UserContext userContext,
        CancellationToken cancellationToken = default)
    {
        // Authorization: Developer or SuperAdmin only
        if (!userContext.HasAdminPanelAccess)
            return ServiceResult<AdminAssignmentResponse>.Forbidden("Access denied. Developer or SuperAdmin role required.");

        try
        {
            var user = await _userManager.FindByIdAsync(request.UserId.ToString());
            if (user == null)
            {
                return ServiceResult<AdminAssignmentResponse>.NotFound("User not found");
            }

            // User must be in Admin role
            if (!await _userManager.IsInRoleAsync(user, "Admin"))
            {
                return ServiceResult<AdminAssignmentResponse>.Failure(
                    "User must have Admin system role to be assigned to trees");
            }

            var tree = await _orgRepository.GetByIdAsync(request.TreeId, cancellationToken);
            if (tree == null)
            {
                return ServiceResult<AdminAssignmentResponse>.NotFound("Family tree not found");
            }

            var existingAssignment = await _adminAssignmentRepository.ExistsAsync(
                a => a.UserId == request.UserId && a.TreeId == request.TreeId, cancellationToken);

            if (existingAssignment)
            {
                return ServiceResult<AdminAssignmentResponse>.Failure(
                    "Admin is already assigned to this tree");
            }

            var assignment = new AdminTreeAssignment
            {
                Id = Guid.NewGuid(),
                UserId = request.UserId,
                TreeId = request.TreeId,
                AssignedByUserId = userContext.UserId,
                AssignedAt = DateTime.UtcNow
            };

            _adminAssignmentRepository.Add(assignment);
            await _adminAssignmentRepository.SaveChangesAsync(cancellationToken);

            _logger.LogInformation("Admin assigned to tree: User {UserId} -> Tree {TreeId} by {AdminId}",
                request.UserId, request.TreeId, userContext.UserId);

            var currentUser = await _userManager.FindByIdAsync(userContext.UserId.ToString());

            var response = new AdminAssignmentResponse(
                assignment.Id,
                user.Id,
                user.Email,
                $"{user.FirstName} {user.LastName}".Trim(),
                tree.Id,
                tree.Name,
                currentUser != null ? $"{currentUser.FirstName} {currentUser.LastName}".Trim() : null,
                assignment.AssignedAt
            );

            return ServiceResult<AdminAssignmentResponse>.Success(response);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error creating assignment for User {UserId} to Tree {TreeId}: {Message}",
                request.UserId, request.TreeId, ex.Message);
            return ServiceResult<AdminAssignmentResponse>.InternalError("Error creating assignment");
        }
    }

    public async Task<ServiceResult> DeleteAssignmentAsync(
        Guid assignmentId,
        UserContext userContext,
        CancellationToken cancellationToken = default)
    {
        // Authorization: Developer or SuperAdmin only
        if (!userContext.HasAdminPanelAccess)
            return ServiceResult.Forbidden("Access denied. Developer or SuperAdmin role required.");

        try
        {
            var assignment = await _adminAssignmentRepository.GetByIdAsync(assignmentId, cancellationToken);
            if (assignment == null)
            {
                return ServiceResult.NotFound("Assignment not found");
            }

            _adminAssignmentRepository.Remove(assignment);
            await _adminAssignmentRepository.SaveChangesAsync(cancellationToken);

            _logger.LogInformation("Admin assignment removed: {AssignmentId} by {AdminId}", assignmentId, userContext.UserId);

            return ServiceResult.Success();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error deleting assignment {AssignmentId}: {Message}", assignmentId, ex.Message);
            return ServiceResult.InternalError("Error deleting assignment");
        }
    }

    // ============================================================================
    // STATISTICS
    // ============================================================================

    public async Task<ServiceResult<AdminStatsDto>> GetStatsAsync(
        UserContext userContext,
        CancellationToken cancellationToken = default)
    {
        // Authorization: Developer or SuperAdmin only
        if (!userContext.HasAdminPanelAccess)
            return ServiceResult<AdminStatsDto>.Forbidden("Access denied. Developer or SuperAdmin role required.");

        try
        {
            // Get counts
            var totalUsers = await _userManager.Users.CountAsync(cancellationToken);

            // Count users in SuperAdmin role
            var superAdminUsers = await _userManager.GetUsersInRoleAsync("SuperAdmin");
            var superAdmins = superAdminUsers.Count;

            // Count users in Admin role
            var adminUsers = await _userManager.GetUsersInRoleAsync("Admin");
            var admins = adminUsers.Count;

            var totalTrees = await _orgRepository.CountAsync(null, cancellationToken);
            var publicTrees = await _orgRepository.CountAsync(o => o.IsPublic, cancellationToken);
            var totalPeople = await _personRepository.CountAsync(null, cancellationToken);
            var totalMedia = await _mediaRepository.CountAsync(null, cancellationToken);
            var totalParentChild = await _parentChildRepository.CountAsync(null, cancellationToken);
            var totalUnions = await _unionRepository.CountAsync(null, cancellationToken);
            var totalRelationships = totalParentChild + totalUnions;

            // Get recent users
            var recentUsersList = await _userManager.Users
                .OrderByDescending(u => u.CreatedAt)
                .Take(5)
                .Select(u => new RecentUserDto(
                    u.Id,
                    u.Email,
                    u.FirstName,
                    u.LastName,
                    u.CreatedAt
                ))
                .ToListAsync(cancellationToken);

            // Get largest trees
            var largestTreesList = await _orgRepository
                .Query()
                .OrderByDescending(o => o.People.Count)
                .Take(5)
                .Select(o => new LargestTreeDto(
                    o.Id,
                    o.Name,
                    o.People.Count
                ))
                .ToListAsync(cancellationToken);

            var stats = new AdminStatsDto(
                TotalUsers: totalUsers,
                SuperAdmins: superAdmins,
                Admins: admins,
                TotalTrees: totalTrees,
                PublicTrees: publicTrees,
                TotalPeople: totalPeople,
                TotalMedia: totalMedia,
                TotalRelationships: totalRelationships,
                RecentUsers: recentUsersList,
                LargestTrees: largestTreesList
            );

            return ServiceResult<AdminStatsDto>.Success(stats);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting stats: {Message}", ex.Message);
            return ServiceResult<AdminStatsDto>.InternalError("Error loading statistics");
        }
    }

    // ============================================================================
    // ADMIN TOWN ASSIGNMENTS (Town-scoped access)
    // ============================================================================

    public async Task<ServiceResult<List<AdminTownAssignmentResponse>>> GetAllTownAssignmentsAsync(
        UserContext userContext,
        CancellationToken cancellationToken = default)
    {
        // Authorization: Developer or SuperAdmin only
        if (!userContext.HasAdminPanelAccess)
            return ServiceResult<List<AdminTownAssignmentResponse>>.Forbidden("Access denied. Developer or SuperAdmin role required.");

        try
        {
            var assignments = await _adminTownAssignmentRepository
                .Query()
                .Include(a => a.User)
                .Include(a => a.Town)
                    .ThenInclude(t => t.FamilyTrees)
                .Include(a => a.AssignedByUser)
                .Where(a => a.IsActive)
                .OrderBy(a => a.User.Email)
                .ToListAsync(cancellationToken);

            var result = assignments.Select(a => MapToTownAssignmentResponse(a)).ToList();

            return ServiceResult<List<AdminTownAssignmentResponse>>.Success(result);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting all town assignments: {Message}", ex.Message);
            return ServiceResult<List<AdminTownAssignmentResponse>>.InternalError("Error loading town assignments");
        }
    }

    public async Task<ServiceResult<List<AdminTownAssignmentResponse>>> GetUserTownAssignmentsAsync(
        long userId,
        UserContext userContext,
        CancellationToken cancellationToken = default)
    {
        // Authorization: Developer/SuperAdmin can see any user, Admin can see own only
        if (!userContext.HasAdminOrHigherAccess)
            return ServiceResult<List<AdminTownAssignmentResponse>>.Forbidden("Access denied.");

        if (userContext.IsAdmin && userContext.UserId != userId)
            return ServiceResult<List<AdminTownAssignmentResponse>>.Forbidden("Admins can only view their own town assignments.");

        try
        {
            var assignments = await _adminTownAssignmentRepository
                .Query()
                .Include(a => a.User)
                .Include(a => a.Town)
                    .ThenInclude(t => t.FamilyTrees)
                .Include(a => a.AssignedByUser)
                .Where(a => a.UserId == userId && a.IsActive)
                .ToListAsync(cancellationToken);

            var result = assignments.Select(a => MapToTownAssignmentResponse(a)).ToList();

            return ServiceResult<List<AdminTownAssignmentResponse>>.Success(result);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting user town assignments for {UserId}: {Message}", userId, ex.Message);
            return ServiceResult<List<AdminTownAssignmentResponse>>.InternalError("Error loading user town assignments");
        }
    }

    public async Task<ServiceResult<AdminTownAssignmentResponse>> CreateTownAssignmentAsync(
        CreateAdminTownAssignmentRequest request,
        UserContext userContext,
        CancellationToken cancellationToken = default)
    {
        // Authorization: Developer or SuperAdmin only
        if (!userContext.HasAdminPanelAccess)
            return ServiceResult<AdminTownAssignmentResponse>.Forbidden("Access denied. Developer or SuperAdmin role required.");

        try
        {
            var user = await _userManager.FindByIdAsync(request.UserId.ToString());
            if (user == null)
            {
                return ServiceResult<AdminTownAssignmentResponse>.NotFound("User not found");
            }

            // User must be in Admin role
            if (!await _userManager.IsInRoleAsync(user, "Admin"))
            {
                return ServiceResult<AdminTownAssignmentResponse>.Failure(
                    "User must have Admin system role to be assigned to towns");
            }

            var town = await _townRepository
                .Query()
                .Include(t => t.FamilyTrees)
                .FirstOrDefaultAsync(t => t.Id == request.TownId, cancellationToken);

            if (town == null)
            {
                return ServiceResult<AdminTownAssignmentResponse>.NotFound("Town not found");
            }

            // Check for existing active assignment
            var existingAssignment = await _adminTownAssignmentRepository.ExistsAsync(
                a => a.UserId == request.UserId && a.TownId == request.TownId && a.IsActive, cancellationToken);

            if (existingAssignment)
            {
                return ServiceResult<AdminTownAssignmentResponse>.Failure(
                    "Admin is already assigned to this town");
            }

            var assignment = new AdminTownAssignment
            {
                Id = Guid.NewGuid(),
                UserId = request.UserId,
                TownId = request.TownId,
                AssignedByUserId = userContext.UserId,
                AssignedAt = DateTime.UtcNow,
                IsActive = true
            };

            _adminTownAssignmentRepository.Add(assignment);
            await _adminTownAssignmentRepository.SaveChangesAsync(cancellationToken);

            _logger.LogInformation("Admin assigned to town: User {UserId} -> Town {TownId} by {AdminId}",
                request.UserId, request.TownId, userContext.UserId);

            // Reload with navigation properties
            assignment = await _adminTownAssignmentRepository
                .Query()
                .Include(a => a.User)
                .Include(a => a.Town)
                    .ThenInclude(t => t.FamilyTrees)
                .Include(a => a.AssignedByUser)
                .FirstOrDefaultAsync(a => a.Id == assignment.Id, cancellationToken);

            return ServiceResult<AdminTownAssignmentResponse>.Success(MapToTownAssignmentResponse(assignment!));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error creating town assignment for User {UserId} to Town {TownId}: {Message}",
                request.UserId, request.TownId, ex.Message);
            return ServiceResult<AdminTownAssignmentResponse>.InternalError("Error creating town assignment");
        }
    }

    public async Task<ServiceResult<List<AdminTownAssignmentResponse>>> CreateTownAssignmentsBulkAsync(
        CreateAdminTownAssignmentBulkRequest request,
        UserContext userContext,
        CancellationToken cancellationToken = default)
    {
        // Authorization: Developer or SuperAdmin only
        if (!userContext.HasAdminPanelAccess)
            return ServiceResult<List<AdminTownAssignmentResponse>>.Forbidden("Access denied. Developer or SuperAdmin role required.");

        try
        {
            var user = await _userManager.FindByIdAsync(request.UserId.ToString());
            if (user == null)
            {
                return ServiceResult<List<AdminTownAssignmentResponse>>.NotFound("User not found");
            }

            // User must be in Admin role
            if (!await _userManager.IsInRoleAsync(user, "Admin"))
            {
                return ServiceResult<List<AdminTownAssignmentResponse>>.Failure(
                    "User must have Admin system role to be assigned to towns");
            }

            var results = new List<AdminTownAssignment>();

            foreach (var townId in request.TownIds)
            {
                var town = await _townRepository.GetByIdAsync(townId, cancellationToken);
                if (town == null) continue;

                // Skip if already assigned
                var existing = await _adminTownAssignmentRepository.ExistsAsync(
                    a => a.UserId == request.UserId && a.TownId == townId && a.IsActive, cancellationToken);
                if (existing) continue;

                var assignment = new AdminTownAssignment
                {
                    Id = Guid.NewGuid(),
                    UserId = request.UserId,
                    TownId = townId,
                    AssignedByUserId = userContext.UserId,
                    AssignedAt = DateTime.UtcNow,
                    IsActive = true
                };

                _adminTownAssignmentRepository.Add(assignment);
                results.Add(assignment);
            }

            await _adminTownAssignmentRepository.SaveChangesAsync(cancellationToken);

            _logger.LogInformation("Admin bulk assigned to {Count} towns: User {UserId} by {AdminId}",
                results.Count, request.UserId, userContext.UserId);

            // Reload with navigation properties
            var assignmentIds = results.Select(a => a.Id).ToList();
            var loaded = await _adminTownAssignmentRepository
                .Query()
                .Include(a => a.User)
                .Include(a => a.Town)
                    .ThenInclude(t => t.FamilyTrees)
                .Include(a => a.AssignedByUser)
                .Where(a => assignmentIds.Contains(a.Id))
                .ToListAsync(cancellationToken);

            return ServiceResult<List<AdminTownAssignmentResponse>>.Success(
                loaded.Select(a => MapToTownAssignmentResponse(a)).ToList());
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error bulk creating town assignments for User {UserId}: {Message}",
                request.UserId, ex.Message);
            return ServiceResult<List<AdminTownAssignmentResponse>>.InternalError("Error creating town assignments");
        }
    }

    public async Task<ServiceResult> DeleteTownAssignmentAsync(
        Guid assignmentId,
        UserContext userContext,
        CancellationToken cancellationToken = default)
    {
        // Authorization: Developer or SuperAdmin only
        if (!userContext.HasAdminPanelAccess)
            return ServiceResult.Forbidden("Access denied. Developer or SuperAdmin role required.");

        try
        {
            var assignment = await _adminTownAssignmentRepository.GetByIdAsync(assignmentId, cancellationToken);
            if (assignment == null)
            {
                return ServiceResult.NotFound("Town assignment not found");
            }

            _adminTownAssignmentRepository.Remove(assignment);
            await _adminTownAssignmentRepository.SaveChangesAsync(cancellationToken);

            _logger.LogInformation("Admin town assignment deleted: {AssignmentId} by {AdminId}", assignmentId, userContext.UserId);

            return ServiceResult.Success();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error deleting town assignment {AssignmentId}: {Message}", assignmentId, ex.Message);
            return ServiceResult.InternalError("Error deleting town assignment");
        }
    }

    public async Task<ServiceResult> DeactivateTownAssignmentAsync(
        Guid assignmentId,
        UserContext userContext,
        CancellationToken cancellationToken = default)
    {
        // Authorization: Developer or SuperAdmin only
        if (!userContext.HasAdminPanelAccess)
            return ServiceResult.Forbidden("Access denied. Developer or SuperAdmin role required.");

        try
        {
            var assignment = await _adminTownAssignmentRepository.GetByIdAsync(assignmentId, cancellationToken);
            if (assignment == null)
            {
                return ServiceResult.NotFound("Town assignment not found");
            }

            assignment.IsActive = false;
            await _adminTownAssignmentRepository.SaveChangesAsync(cancellationToken);

            _logger.LogInformation("Admin town assignment deactivated: {AssignmentId} by {AdminId}", assignmentId, userContext.UserId);

            return ServiceResult.Success();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error deactivating town assignment {AssignmentId}: {Message}", assignmentId, ex.Message);
            return ServiceResult.InternalError("Error deactivating town assignment");
        }
    }

    public async Task<ServiceResult<AdminLoginResponse>> GetAdminTownsAsync(
        long userId,
        UserContext userContext,
        CancellationToken cancellationToken = default)
    {
        // Authorization: Developer/SuperAdmin can see any user, Admin can see own only
        if (!userContext.HasAdminOrHigherAccess)
            return ServiceResult<AdminLoginResponse>.Forbidden("Access denied.");

        if (userContext.IsAdmin && userContext.UserId != userId)
            return ServiceResult<AdminLoginResponse>.Forbidden("Admins can only view their own towns.");

        try
        {
            var user = await _userManager.FindByIdAsync(userId.ToString());
            if (user == null)
            {
                return ServiceResult<AdminLoginResponse>.NotFound("User not found");
            }

            // Get assigned towns
            var assignments = await _adminTownAssignmentRepository
                .Query()
                .Include(a => a.Town)
                    .ThenInclude(t => t.FamilyTrees)
                .Where(a => a.UserId == userId && a.IsActive)
                .ToListAsync(cancellationToken);

            var towns = assignments.Select(a => new TownSummaryDto(
                a.Town.Id,
                a.Town.Name,
                a.Town.NameEn,
                a.Town.NameAr,
                a.Town.NameLocal,
                a.Town.FamilyTrees.Count
            )).ToList();

            var response = new AdminLoginResponse(
                AssignedTowns: towns.Select(t => new TownInfoDto(
                    t.Id, t.Name, t.NameEn, t.NameAr, null, t.TreeCount
                )).ToList(),
                IsSuperAdmin: false
            );

            return ServiceResult<AdminLoginResponse>.Success(response);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting admin towns for {UserId}: {Message}", userId, ex.Message);
            return ServiceResult<AdminLoginResponse>.InternalError("Error loading admin towns");
        }
    }

    // ============================================================================
    // PRIVATE HELPERS
    // ============================================================================

    private static AdminTownAssignmentResponse MapToTownAssignmentResponse(AdminTownAssignment a)
    {
        return new AdminTownAssignmentResponse(
            a.Id,
            a.UserId,
            a.User.Email,
            $"{a.User.FirstName} {a.User.LastName}".Trim(),
            a.TownId,
            a.Town.Name,
            a.Town.NameEn,
            a.Town.NameAr,
            a.Town.NameLocal,
            a.Town.FamilyTrees.Count,
            a.AssignedByUser != null
                ? $"{a.AssignedByUser.FirstName} {a.AssignedByUser.LastName}".Trim()
                : null,
            a.AssignedAt,
            a.IsActive
        );
    }
}
