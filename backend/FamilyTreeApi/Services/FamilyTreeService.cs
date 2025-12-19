// File: Services/FamilyTreeService.cs
using AutoMapper;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using FamilyTreeApi.Data;
using FamilyTreeApi.DTOs;
using FamilyTreeApi.Models;
using FamilyTreeApi.Models.Enums;
using FamilyTreeApi.Repositories;

namespace FamilyTreeApi.Services;

/// <summary>
/// Family Tree service implementation containing all business logic.
/// Uses repositories for data access, UserManager for role checks, and AutoMapper for DTO mapping.
/// Services do NOT reference DbContext directly except where necessary for complex queries.
/// </summary>
public class FamilyTreeService : IFamilyTreeService
{
    private readonly IOrgRepository _orgRepository;
    private readonly ApplicationDbContext _context;
    private readonly UserManager<ApplicationUser> _userManager;
    private readonly IMapper _mapper;
    private readonly ILogger<FamilyTreeService> _logger;

    public FamilyTreeService(
        IOrgRepository orgRepository,
        ApplicationDbContext context,
        UserManager<ApplicationUser> userManager,
        IMapper mapper,
        ILogger<FamilyTreeService> logger)
    {
        _orgRepository = orgRepository;
        _context = context;
        _userManager = userManager;
        _mapper = mapper;
        _logger = logger;
    }

    // ============================================================================
    // TREE CRUD OPERATIONS
    // ============================================================================

    public async Task<ServiceResult<List<FamilyTreeListItem>>> GetMyTreesAsync(
        UserContext userContext,
        CancellationToken cancellationToken = default)
    {
        try
        {
            var user = await _userManager.FindByIdAsync(userContext.UserId.ToString());
            if (user == null)
            {
                return ServiceResult<List<FamilyTreeListItem>>.Failure("User not found", ServiceErrorType.NotFound);
            }

            var userId = user.Id;
            IQueryable<Org> query;

            if (await _userManager.IsInRoleAsync(user, "SuperAdmin"))
            {
                // SuperAdmin sees all trees
                query = _context.Orgs;
            }
            else if (await _userManager.IsInRoleAsync(user, "Admin"))
            {
                // Admin sees assigned trees + member trees
                var assignedTreeIds = await _context.Set<AdminTreeAssignment>()
                    .Where(a => a.UserId == userId)
                    .Select(a => a.TreeId)
                    .ToListAsync(cancellationToken);

                var memberTreeIds = await _context.OrgUsers
                    .Where(ou => ou.UserId == userId)
                    .Select(ou => ou.OrgId)
                    .ToListAsync(cancellationToken);

                var allTreeIds = assignedTreeIds.Union(memberTreeIds).Distinct();
                query = _context.Orgs.Where(o => allTreeIds.Contains(o.Id));
            }
            else
            {
                // Regular user sees only member trees
                var memberTreeIds = await _context.OrgUsers
                    .Where(ou => ou.UserId == userId)
                    .Select(ou => ou.OrgId)
                    .ToListAsync(cancellationToken);

                query = _context.Orgs.Where(o => memberTreeIds.Contains(o.Id));
            }

            var trees = await query
                .OrderBy(o => o.Name)
                .Select(o => new FamilyTreeListItem(
                    o.Id,
                    o.Name,
                    o.Description,
                    o.IsPublic,
                    o.CoverImageUrl,
                    o.People.Count,
                    o.OrgUsers.Where(ou => ou.UserId == userId).Select(ou => (OrgRole?)ou.Role).FirstOrDefault(),
                    o.CreatedAt
                ))
                .ToListAsync(cancellationToken);

            return ServiceResult<List<FamilyTreeListItem>>.Success(trees);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting trees for user {UserId}", userContext.UserId);
            return ServiceResult<List<FamilyTreeListItem>>.InternalError("Error loading trees");
        }
    }

    public async Task<ServiceResult<FamilyTreeResponse>> GetTreeAsync(
        Guid id,
        UserContext userContext,
        CancellationToken cancellationToken = default)
    {
        try
        {
            if (!await HasTreeAccessAsync(id, userContext, OrgRole.Viewer, cancellationToken))
            {
                return ServiceResult<FamilyTreeResponse>.Forbidden("You do not have access to this tree");
            }

            var tree = await _context.Orgs
                .Include(o => o.Owner)
                .Include(o => o.Town)
                .Include(o => o.OrgUsers)
                .Include(o => o.People)
                .FirstOrDefaultAsync(o => o.Id == id, cancellationToken);

            if (tree == null)
            {
                return ServiceResult<FamilyTreeResponse>.NotFound("Family tree not found");
            }

            var response = new FamilyTreeResponse(
                tree.Id,
                tree.Name,
                tree.Description,
                tree.IsPublic,
                tree.AllowCrossTreeLinking,
                tree.CoverImageUrl,
                tree.OwnerId,
                tree.Owner != null ? $"{tree.Owner.FirstName} {tree.Owner.LastName}".Trim() : null,
                tree.TownId,
                tree.Town?.Name,
                tree.OrgUsers.Count,
                tree.People.Count,
                tree.CreatedAt,
                tree.UpdatedAt
            );

            return ServiceResult<FamilyTreeResponse>.Success(response);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting tree {TreeId}", id);
            return ServiceResult<FamilyTreeResponse>.InternalError("Error loading tree");
        }
    }

    public async Task<ServiceResult<FamilyTreeResponse>> CreateTreeAsync(
        CreateFamilyTreeRequest request,
        UserContext userContext,
        CancellationToken cancellationToken = default)
    {
        try
        {
            var userId = userContext.UserId;

            var tree = new Org
            {
                Id = Guid.NewGuid(),
                Name = request.Name,
                Description = request.Description,
                IsPublic = request.IsPublic,
                AllowCrossTreeLinking = request.AllowCrossTreeLinking,
                TownId = request.TownId,
                OwnerId = userId,
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow
            };

            _context.Orgs.Add(tree);

            // Add creator as Owner
            var orgUser = new OrgUser
            {
                Id = Guid.NewGuid(),
                OrgId = tree.Id,
                UserId = userId,
                Role = OrgRole.Owner,
                JoinedAt = DateTime.UtcNow
            };

            _context.OrgUsers.Add(orgUser);
            await _context.SaveChangesAsync(cancellationToken);

            _logger.LogInformation("Family tree created: {TreeId} by user {UserId}", tree.Id, userId);

            // Load the town name if TownId is set
            string? townName = null;
            if (tree.TownId.HasValue)
            {
                townName = await _context.Towns
                    .Where(t => t.Id == tree.TownId.Value)
                    .Select(t => t.Name)
                    .FirstOrDefaultAsync(cancellationToken);
            }

            var response = new FamilyTreeResponse(
                tree.Id,
                tree.Name,
                tree.Description,
                tree.IsPublic,
                tree.AllowCrossTreeLinking,
                tree.CoverImageUrl,
                tree.OwnerId,
                null,
                tree.TownId,
                townName,
                1,
                0,
                tree.CreatedAt,
                tree.UpdatedAt
            );

            return ServiceResult<FamilyTreeResponse>.Success(response);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error creating tree");
            return ServiceResult<FamilyTreeResponse>.InternalError("Error creating tree");
        }
    }

    public async Task<ServiceResult<FamilyTreeResponse>> UpdateTreeAsync(
        Guid id,
        UpdateFamilyTreeRequest request,
        UserContext userContext,
        CancellationToken cancellationToken = default)
    {
        try
        {
            if (!await HasTreeAccessAsync(id, userContext, OrgRole.Admin, cancellationToken))
            {
                return ServiceResult<FamilyTreeResponse>.Forbidden("You do not have permission to update this tree");
            }

            var tree = await _context.Orgs
                .Include(o => o.Owner)
                .Include(o => o.Town)
                .Include(o => o.OrgUsers)
                .Include(o => o.People)
                .FirstOrDefaultAsync(o => o.Id == id, cancellationToken);

            if (tree == null)
            {
                return ServiceResult<FamilyTreeResponse>.NotFound("Family tree not found");
            }

            if (request.Name != null) tree.Name = request.Name;
            if (request.Description != null) tree.Description = request.Description;
            if (request.IsPublic.HasValue) tree.IsPublic = request.IsPublic.Value;
            if (request.AllowCrossTreeLinking.HasValue) tree.AllowCrossTreeLinking = request.AllowCrossTreeLinking.Value;
            if (request.CoverImageUrl != null) tree.CoverImageUrl = request.CoverImageUrl;
            if (request.TownId.HasValue) tree.TownId = request.TownId.Value == Guid.Empty ? null : request.TownId.Value;
            tree.UpdatedAt = DateTime.UtcNow;

            await _context.SaveChangesAsync(cancellationToken);

            // Reload town if changed
            if (request.TownId.HasValue && tree.TownId.HasValue)
            {
                tree.Town = await _context.Towns.FirstOrDefaultAsync(t => t.Id == tree.TownId.Value, cancellationToken);
            }

            _logger.LogInformation("Family tree updated: {TreeId}", id);

            var response = new FamilyTreeResponse(
                tree.Id,
                tree.Name,
                tree.Description,
                tree.IsPublic,
                tree.AllowCrossTreeLinking,
                tree.CoverImageUrl,
                tree.OwnerId,
                tree.Owner != null ? $"{tree.Owner.FirstName} {tree.Owner.LastName}".Trim() : null,
                tree.TownId,
                tree.Town?.Name,
                tree.OrgUsers.Count,
                tree.People.Count,
                tree.CreatedAt,
                tree.UpdatedAt
            );

            return ServiceResult<FamilyTreeResponse>.Success(response);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error updating tree {TreeId}", id);
            return ServiceResult<FamilyTreeResponse>.InternalError("Error updating tree");
        }
    }

    public async Task<ServiceResult> DeleteTreeAsync(
        Guid id,
        UserContext userContext,
        CancellationToken cancellationToken = default)
    {
        try
        {
            var user = await _userManager.FindByIdAsync(userContext.UserId.ToString());
            if (user == null)
            {
                return ServiceResult.Failure("User not found", ServiceErrorType.NotFound);
            }

            var tree = await _context.Orgs.FindAsync(new object[] { id }, cancellationToken);
            if (tree == null)
            {
                return ServiceResult.NotFound("Family tree not found");
            }

            // Only Owner or SuperAdmin can delete
            var isOwner = tree.OwnerId == user.Id;
            var isSuperAdmin = await _userManager.IsInRoleAsync(user, "SuperAdmin");

            if (!isOwner && !isSuperAdmin)
            {
                return ServiceResult.Forbidden("Only the tree owner or SuperAdmin can delete this tree");
            }

            _context.Orgs.Remove(tree);
            await _context.SaveChangesAsync(cancellationToken);

            _logger.LogInformation("Family tree deleted: {TreeId} by user {UserId}", id, user.Id);

            return ServiceResult.Success();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error deleting tree {TreeId}", id);
            return ServiceResult.InternalError("Error deleting tree");
        }
    }

    // ============================================================================
    // TREE MEMBER OPERATIONS
    // ============================================================================

    public async Task<ServiceResult<List<TreeMemberResponse>>> GetMembersAsync(
        Guid treeId,
        UserContext userContext,
        CancellationToken cancellationToken = default)
    {
        try
        {
            if (!await HasTreeAccessAsync(treeId, userContext, OrgRole.Viewer, cancellationToken))
            {
                return ServiceResult<List<TreeMemberResponse>>.Forbidden("You do not have access to this tree");
            }

            // Step 1: Query with anonymous type (EF Core can translate this)
            var data = await _context.OrgUsers
                .Where(ou => ou.OrgId == treeId)
                .Join(_context.Users, ou => ou.UserId, u => u.Id, (ou, u) => new
                {
                    ou.Id,
                    ou.UserId,
                    Email = u.Email ?? "",
                    u.FirstName,
                    u.LastName,
                    ou.Role,
                    ou.JoinedAt
                })
                .OrderByDescending(x => x.Role)
                .ThenBy(x => x.Email)
                .ToListAsync(cancellationToken);

            // Step 2: Project to DTO in memory
            var members = data.Select(x => new TreeMemberResponse(
                x.Id,
                x.UserId,
                x.Email,
                x.FirstName,
                x.LastName,
                x.Role,
                x.JoinedAt
            )).ToList();

            return ServiceResult<List<TreeMemberResponse>>.Success(members);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting members for tree {TreeId}", treeId);
            return ServiceResult<List<TreeMemberResponse>>.InternalError("Error loading members");
        }
    }

    public async Task<ServiceResult<TreeMemberResponse>> AddMemberAsync(
        Guid treeId,
        AddTreeMemberRequest request,
        UserContext userContext,
        CancellationToken cancellationToken = default)
    {
        try
        {
            if (!await HasTreeAccessAsync(treeId, userContext, OrgRole.Admin, cancellationToken))
            {
                return ServiceResult<TreeMemberResponse>.Forbidden("You do not have permission to add members to this tree");
            }

            var user = await _context.Users.FindAsync(new object[] { request.UserId }, cancellationToken);
            if (user == null)
            {
                return ServiceResult<TreeMemberResponse>.Failure("User not found", ServiceErrorType.BadRequest);
            }

            var existingMember = await _context.OrgUsers
                .AnyAsync(ou => ou.OrgId == treeId && ou.UserId == request.UserId, cancellationToken);

            if (existingMember)
            {
                return ServiceResult<TreeMemberResponse>.Failure("User is already a member of this tree", ServiceErrorType.BadRequest);
            }

            var orgUser = new OrgUser
            {
                Id = Guid.NewGuid(),
                OrgId = treeId,
                UserId = request.UserId,
                Role = request.Role,
                JoinedAt = DateTime.UtcNow
            };

            _context.OrgUsers.Add(orgUser);
            await _context.SaveChangesAsync(cancellationToken);

            _logger.LogInformation("Member added to tree: {TreeId}, User: {UserId}, Role: {Role}",
                treeId, request.UserId, request.Role);

            var response = new TreeMemberResponse(
                orgUser.Id,
                user.Id,
                user.Email ?? "",
                user.FirstName,
                user.LastName,
                orgUser.Role,
                orgUser.JoinedAt
            );

            return ServiceResult<TreeMemberResponse>.Success(response);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error adding member to tree {TreeId}", treeId);
            return ServiceResult<TreeMemberResponse>.InternalError("Error adding member");
        }
    }

    public async Task<ServiceResult<TreeMemberResponse>> UpdateMemberRoleAsync(
        Guid treeId,
        long userId,
        UpdateTreeMemberRoleRequest request,
        UserContext userContext,
        CancellationToken cancellationToken = default)
    {
        try
        {
            if (!await HasTreeAccessAsync(treeId, userContext, OrgRole.Admin, cancellationToken))
            {
                return ServiceResult<TreeMemberResponse>.Forbidden("You do not have permission to update member roles");
            }

            var orgUser = await _context.OrgUsers
                .Include(ou => ou.User)
                .FirstOrDefaultAsync(ou => ou.OrgId == treeId && ou.UserId == userId, cancellationToken);

            if (orgUser == null)
            {
                return ServiceResult<TreeMemberResponse>.NotFound("Member not found");
            }

            // Can't change Owner's role
            if (orgUser.Role == OrgRole.Owner)
            {
                return ServiceResult<TreeMemberResponse>.Failure("Cannot change the owner's role", ServiceErrorType.BadRequest);
            }

            // Can't promote to Owner
            if (request.Role == OrgRole.Owner)
            {
                return ServiceResult<TreeMemberResponse>.Failure("Use transfer ownership instead", ServiceErrorType.BadRequest);
            }

            orgUser.Role = request.Role;
            await _context.SaveChangesAsync(cancellationToken);

            _logger.LogInformation("Member role updated: {TreeId}, User: {UserId}, New Role: {Role}",
                treeId, userId, request.Role);

            var response = new TreeMemberResponse(
                orgUser.Id,
                orgUser.UserId,
                orgUser.User.Email ?? "",
                orgUser.User.FirstName,
                orgUser.User.LastName,
                orgUser.Role,
                orgUser.JoinedAt
            );

            return ServiceResult<TreeMemberResponse>.Success(response);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error updating member role for tree {TreeId}, user {UserId}", treeId, userId);
            return ServiceResult<TreeMemberResponse>.InternalError("Error updating member role");
        }
    }

    public async Task<ServiceResult> RemoveMemberAsync(
        Guid treeId,
        long userId,
        UserContext userContext,
        CancellationToken cancellationToken = default)
    {
        try
        {
            if (!await HasTreeAccessAsync(treeId, userContext, OrgRole.Admin, cancellationToken))
            {
                return ServiceResult.Forbidden("You do not have permission to remove members");
            }

            var orgUser = await _context.OrgUsers
                .FirstOrDefaultAsync(ou => ou.OrgId == treeId && ou.UserId == userId, cancellationToken);

            if (orgUser == null)
            {
                return ServiceResult.NotFound("Member not found");
            }

            // Can't remove Owner
            if (orgUser.Role == OrgRole.Owner)
            {
                return ServiceResult.Failure("Cannot remove the tree owner", ServiceErrorType.BadRequest);
            }

            _context.OrgUsers.Remove(orgUser);
            await _context.SaveChangesAsync(cancellationToken);

            _logger.LogInformation("Member removed from tree: {TreeId}, User: {UserId}", treeId, userId);

            return ServiceResult.Success();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error removing member from tree {TreeId}, user {UserId}", treeId, userId);
            return ServiceResult.InternalError("Error removing member");
        }
    }

    // ============================================================================
    // INVITATION OPERATIONS
    // ============================================================================

    public async Task<ServiceResult<List<TreeInvitationResponse>>> GetInvitationsAsync(
        Guid treeId,
        UserContext userContext,
        CancellationToken cancellationToken = default)
    {
        try
        {
            if (!await HasTreeAccessAsync(treeId, userContext, OrgRole.Admin, cancellationToken))
            {
                return ServiceResult<List<TreeInvitationResponse>>.Forbidden("You do not have permission to view invitations");
            }

            var invitations = await _context.Set<TreeInvitation>()
                .Include(i => i.InvitedByUser)
                .Where(i => i.TreeId == treeId)
                .OrderByDescending(i => i.CreatedAt)
                .Select(i => new TreeInvitationResponse(
                    i.Id,
                    i.Email,
                    i.Role,
                    $"{i.InvitedByUser.FirstName} {i.InvitedByUser.LastName}".Trim(),
                    i.ExpiresAt,
                    i.AcceptedAt != null,
                    i.CreatedAt
                ))
                .ToListAsync(cancellationToken);

            return ServiceResult<List<TreeInvitationResponse>>.Success(invitations);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting invitations for tree {TreeId}", treeId);
            return ServiceResult<List<TreeInvitationResponse>>.InternalError("Error loading invitations");
        }
    }

    public async Task<ServiceResult<TreeInvitationResponse>> CreateInvitationAsync(
        Guid treeId,
        CreateInvitationRequest request,
        UserContext userContext,
        CancellationToken cancellationToken = default)
    {
        try
        {
            if (!await HasTreeAccessAsync(treeId, userContext, OrgRole.Admin, cancellationToken))
            {
                return ServiceResult<TreeInvitationResponse>.Forbidden("You do not have permission to create invitations");
            }

            var userId = userContext.UserId;
            var user = await _context.Users.FindAsync(new object[] { userId }, cancellationToken);

            // Check if already a member
            var existingUser = await _context.Users.FirstOrDefaultAsync(u => u.Email == request.Email, cancellationToken);
            if (existingUser != null)
            {
                var isMember = await _context.OrgUsers
                    .AnyAsync(ou => ou.OrgId == treeId && ou.UserId == existingUser.Id, cancellationToken);
                if (isMember)
                {
                    return ServiceResult<TreeInvitationResponse>.Failure("User is already a member of this tree", ServiceErrorType.BadRequest);
                }
            }

            // Check for existing pending invitation
            var existingInvite = await _context.Set<TreeInvitation>()
                .FirstOrDefaultAsync(i => i.TreeId == treeId && i.Email == request.Email && i.AcceptedAt == null, cancellationToken);

            if (existingInvite != null && existingInvite.ExpiresAt > DateTime.UtcNow)
            {
                return ServiceResult<TreeInvitationResponse>.Failure("An active invitation already exists for this email", ServiceErrorType.BadRequest);
            }

            var invitation = new TreeInvitation
            {
                Id = Guid.NewGuid(),
                TreeId = treeId,
                Email = request.Email,
                Role = request.Role,
                Token = Guid.NewGuid().ToString("N"),
                InvitedByUserId = userId,
                ExpiresAt = DateTime.UtcNow.AddDays(request.ExpirationDays),
                CreatedAt = DateTime.UtcNow
            };

            _context.Set<TreeInvitation>().Add(invitation);
            await _context.SaveChangesAsync(cancellationToken);

            _logger.LogInformation("Invitation created: {TreeId}, Email: {Email}", treeId, request.Email);

            var response = new TreeInvitationResponse(
                invitation.Id,
                invitation.Email,
                invitation.Role,
                $"{user?.FirstName} {user?.LastName}".Trim(),
                invitation.ExpiresAt,
                false,
                invitation.CreatedAt
            );

            return ServiceResult<TreeInvitationResponse>.Success(response);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error creating invitation for tree {TreeId}", treeId);
            return ServiceResult<TreeInvitationResponse>.InternalError("Error creating invitation");
        }
    }

    public async Task<ServiceResult<FamilyTreeResponse>> AcceptInvitationAsync(
        string token,
        UserContext userContext,
        CancellationToken cancellationToken = default)
    {
        try
        {
            var userId = userContext.UserId;

            var invitation = await _context.Set<TreeInvitation>()
                .Include(i => i.Tree)
                .ThenInclude(t => t.Owner)
                .Include(i => i.Tree)
                .ThenInclude(t => t.Town)
                .FirstOrDefaultAsync(i => i.Token == token, cancellationToken);

            if (invitation == null)
            {
                return ServiceResult<FamilyTreeResponse>.NotFound("Invitation not found");
            }

            if (!invitation.IsValid)
            {
                return ServiceResult<FamilyTreeResponse>.Failure("Invitation has expired or already been used", ServiceErrorType.BadRequest);
            }

            // Check if already a member
            var isMember = await _context.OrgUsers
                .AnyAsync(ou => ou.OrgId == invitation.TreeId && ou.UserId == userId, cancellationToken);

            if (isMember)
            {
                return ServiceResult<FamilyTreeResponse>.Failure("You are already a member of this tree", ServiceErrorType.BadRequest);
            }

            // Add as member
            var orgUser = new OrgUser
            {
                Id = Guid.NewGuid(),
                OrgId = invitation.TreeId,
                UserId = userId,
                Role = invitation.Role,
                JoinedAt = DateTime.UtcNow
            };

            _context.OrgUsers.Add(orgUser);

            // Mark invitation as accepted
            invitation.AcceptedAt = DateTime.UtcNow;
            invitation.AcceptedByUserId = userId;

            await _context.SaveChangesAsync(cancellationToken);

            _logger.LogInformation("Invitation accepted: {TreeId}, User: {UserId}", invitation.TreeId, userId);

            var tree = invitation.Tree;
            var memberCount = await _context.OrgUsers.CountAsync(ou => ou.OrgId == tree.Id, cancellationToken);
            var personCount = await _context.People.CountAsync(p => p.OrgId == tree.Id, cancellationToken);

            var response = new FamilyTreeResponse(
                tree.Id,
                tree.Name,
                tree.Description,
                tree.IsPublic,
                tree.AllowCrossTreeLinking,
                tree.CoverImageUrl,
                tree.OwnerId,
                tree.Owner != null ? $"{tree.Owner.FirstName} {tree.Owner.LastName}".Trim() : null,
                tree.TownId,
                tree.Town?.Name,
                memberCount,
                personCount,
                tree.CreatedAt,
                tree.UpdatedAt
            );

            return ServiceResult<FamilyTreeResponse>.Success(response);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error accepting invitation with token {Token}", token);
            return ServiceResult<FamilyTreeResponse>.InternalError("Error accepting invitation");
        }
    }

    public async Task<ServiceResult> DeleteInvitationAsync(
        Guid treeId,
        Guid invitationId,
        UserContext userContext,
        CancellationToken cancellationToken = default)
    {
        try
        {
            if (!await HasTreeAccessAsync(treeId, userContext, OrgRole.Admin, cancellationToken))
            {
                return ServiceResult.Forbidden("You do not have permission to delete invitations");
            }

            var invitation = await _context.Set<TreeInvitation>()
                .FirstOrDefaultAsync(i => i.Id == invitationId && i.TreeId == treeId, cancellationToken);

            if (invitation == null)
            {
                return ServiceResult.NotFound("Invitation not found");
            }

            _context.Set<TreeInvitation>().Remove(invitation);
            await _context.SaveChangesAsync(cancellationToken);

            _logger.LogInformation("Invitation deleted: {InvitationId} for tree {TreeId}", invitationId, treeId);

            return ServiceResult.Success();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error deleting invitation {InvitationId} for tree {TreeId}", invitationId, treeId);
            return ServiceResult.InternalError("Error deleting invitation");
        }
    }

    // ============================================================================
    // PRIVATE HELPER METHODS
    // ============================================================================

    /// <summary>
    /// Checks if the current user has access to a tree with at least the specified role.
    /// Preserves exact behavior from original controller.
    /// </summary>
    private async Task<bool> HasTreeAccessAsync(
        Guid treeId,
        UserContext userContext,
        OrgRole minRole = OrgRole.Viewer,
        CancellationToken cancellationToken = default)
    {
        var user = await _userManager.FindByIdAsync(userContext.UserId.ToString());
        if (user == null) return false;

        // SuperAdmin has access to everything
        if (await _userManager.IsInRoleAsync(user, "SuperAdmin")) return true;

        // Admin with tree assignment
        if (await _userManager.IsInRoleAsync(user, "Admin"))
        {
            var hasAssignment = await _context.Set<AdminTreeAssignment>()
                .AnyAsync(a => a.UserId == user.Id && a.TreeId == treeId, cancellationToken);
            if (hasAssignment) return true;
        }

        // Check tree-specific role
        var orgUser = await _context.OrgUsers
            .FirstOrDefaultAsync(ou => ou.UserId == user.Id && ou.OrgId == treeId, cancellationToken);

        return orgUser != null && orgUser.Role >= minRole;
    }
}
