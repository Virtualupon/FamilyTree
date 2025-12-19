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
[Authorize]
public class FamilyTreeController : ControllerBase
{
    private readonly ApplicationDbContext _context;
    private readonly UserManager<ApplicationUser> _userManager;
    private readonly ILogger<FamilyTreeController> _logger;

    public FamilyTreeController(
        ApplicationDbContext context,
        UserManager<ApplicationUser> userManager,
        ILogger<FamilyTreeController> logger)
    {
        _context = context;
        _userManager = userManager;
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

    private async Task<ApplicationUser?> GetCurrentUser()
    {
        var userId = GetUserId();
        return await _userManager.FindByIdAsync(userId.ToString());
    }

    private async Task<bool> HasTreeAccess(Guid treeId, OrgRole minRole = OrgRole.Viewer)
    {
        var user = await GetCurrentUser();
        if (user == null) return false;

        // SuperAdmin has access to everything
        if (await _userManager.IsInRoleAsync(user, "SuperAdmin")) return true;

        // Admin with tree assignment
        if (await _userManager.IsInRoleAsync(user, "Admin"))
        {
            var hasAssignment = await _context.Set<AdminTreeAssignment>()
                .AnyAsync(a => a.UserId == user.Id && a.TreeId == treeId);
            if (hasAssignment) return true;
        }

        // Check tree-specific role
        var orgUser = await _context.OrgUsers
            .FirstOrDefaultAsync(ou => ou.UserId == user.Id && ou.OrgId == treeId);

        return orgUser != null && orgUser.Role >= minRole;
    }

    // ========================================================================
    // TREE CRUD
    // ========================================================================

    /// <summary>
    /// Get all trees accessible by current user
    /// </summary>
    [HttpGet]
    public async Task<ActionResult<List<FamilyTreeListItem>>> GetMyTrees()
    {
        var user = await GetCurrentUser();
        if (user == null) return Unauthorized();

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
                .ToListAsync();

            var memberTreeIds = await _context.OrgUsers
                .Where(ou => ou.UserId == userId)
                .Select(ou => ou.OrgId)
                .ToListAsync();

            var allTreeIds = assignedTreeIds.Union(memberTreeIds).Distinct();
            query = _context.Orgs.Where(o => allTreeIds.Contains(o.Id));
        }
        else
        {
            // Regular user sees only member trees
            var memberTreeIds = await _context.OrgUsers
                .Where(ou => ou.UserId == userId)
                .Select(ou => ou.OrgId)
                .ToListAsync();

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
            .ToListAsync();

        return trees;
    }

    /// <summary>
    /// Get a specific tree by ID
    /// </summary>
    [HttpGet("{id}")]
    public async Task<ActionResult<FamilyTreeResponse>> GetTree(Guid id)
    {
        if (!await HasTreeAccess(id))
        {
            return Forbid();
        }

        var tree = await _context.Orgs
            .Include(o => o.Owner)
            .Include(o => o.Town)
            .Include(o => o.OrgUsers)
            .Include(o => o.People)
            .FirstOrDefaultAsync(o => o.Id == id);

        if (tree == null)
        {
            return NotFound(new { message = "Family tree not found" });
        }

        return new FamilyTreeResponse(
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
    }

    /// <summary>
    /// Create a new family tree
    /// </summary>
    [HttpPost]
    public async Task<ActionResult<FamilyTreeResponse>> CreateTree(CreateFamilyTreeRequest request)
    {
        var userId = GetUserId();

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
        await _context.SaveChangesAsync();

        _logger.LogInformation("Family tree created: {TreeId} by user {UserId}", tree.Id, userId);

        // Load the town name if TownId is set
        string? townName = null;
        if (tree.TownId.HasValue)
        {
            townName = await _context.Towns
                .Where(t => t.Id == tree.TownId.Value)
                .Select(t => t.Name)
                .FirstOrDefaultAsync();
        }

        return CreatedAtAction(nameof(GetTree), new { id = tree.Id }, new FamilyTreeResponse(
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
        ));
    }

    /// <summary>
    /// Update a family tree
    /// </summary>
    [HttpPut("{id}")]
    public async Task<ActionResult<FamilyTreeResponse>> UpdateTree(Guid id, UpdateFamilyTreeRequest request)
    {
        if (!await HasTreeAccess(id, OrgRole.Admin))
        {
            return Forbid();
        }

        var tree = await _context.Orgs
            .Include(o => o.Owner)
            .Include(o => o.Town)
            .Include(o => o.OrgUsers)
            .Include(o => o.People)
            .FirstOrDefaultAsync(o => o.Id == id);

        if (tree == null)
        {
            return NotFound(new { message = "Family tree not found" });
        }

        if (request.Name != null) tree.Name = request.Name;
        if (request.Description != null) tree.Description = request.Description;
        if (request.IsPublic.HasValue) tree.IsPublic = request.IsPublic.Value;
        if (request.AllowCrossTreeLinking.HasValue) tree.AllowCrossTreeLinking = request.AllowCrossTreeLinking.Value;
        if (request.CoverImageUrl != null) tree.CoverImageUrl = request.CoverImageUrl;
        if (request.TownId.HasValue) tree.TownId = request.TownId.Value == Guid.Empty ? null : request.TownId.Value;
        tree.UpdatedAt = DateTime.UtcNow;

        await _context.SaveChangesAsync();

        // Reload town if changed
        if (request.TownId.HasValue && tree.TownId.HasValue)
        {
            tree.Town = await _context.Towns.FirstOrDefaultAsync(t => t.Id == tree.TownId.Value);
        }

        _logger.LogInformation("Family tree updated: {TreeId}", id);

        return new FamilyTreeResponse(
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
    }

    /// <summary>
    /// Delete a family tree (Owner or SuperAdmin only)
    /// </summary>
    [HttpDelete("{id}")]
    public async Task<IActionResult> DeleteTree(Guid id)
    {
        var user = await GetCurrentUser();
        if (user == null) return Unauthorized();

        var tree = await _context.Orgs.FindAsync(id);
        if (tree == null)
        {
            return NotFound(new { message = "Family tree not found" });
        }

        // Only Owner or SuperAdmin can delete
        var isOwner = tree.OwnerId == user.Id;
        var isSuperAdmin = await _userManager.IsInRoleAsync(user, "SuperAdmin");

        if (!isOwner && !isSuperAdmin)
        {
            return Forbid();
        }

        _context.Orgs.Remove(tree);
        await _context.SaveChangesAsync();

        _logger.LogInformation("Family tree deleted: {TreeId} by user {UserId}", id, user.Id);

        return NoContent();
    }

    // ========================================================================
    // TREE MEMBERS
    // ========================================================================

    /// <summary>
    /// Get all members of a tree
    /// </summary>
    [HttpGet("{treeId}/members")]
    public async Task<ActionResult<List<TreeMemberResponse>>> GetTreeMembers(Guid treeId)
    {
        if (!await HasTreeAccess(treeId))
        {
            return Forbid();
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
            .ToListAsync();

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

        return members;
    }

    /// <summary>
    /// Add a member to a tree
    /// </summary>
    [HttpPost("{treeId}/members")]
    public async Task<ActionResult<TreeMemberResponse>> AddTreeMember(Guid treeId, AddTreeMemberRequest request)
    {
        if (!await HasTreeAccess(treeId, OrgRole.Admin))
        {
            return Forbid();
        }

        var user = await _context.Users.FindAsync(request.UserId);
        if (user == null)
        {
            return BadRequest(new { message = "User not found" });
        }

        var existingMember = await _context.OrgUsers
            .AnyAsync(ou => ou.OrgId == treeId && ou.UserId == request.UserId);

        if (existingMember)
        {
            return BadRequest(new { message = "User is already a member of this tree" });
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
        await _context.SaveChangesAsync();

        _logger.LogInformation("Member added to tree: {TreeId}, User: {UserId}, Role: {Role}",
            treeId, request.UserId, request.Role);

        return new TreeMemberResponse(
            orgUser.Id,
            user.Id,
            user.Email ?? "",
            user.FirstName,
            user.LastName,
            orgUser.Role,
            orgUser.JoinedAt
        );
    }

    /// <summary>
    /// Update a member's role
    /// </summary>
    [HttpPut("{treeId}/members/{userId}")]
    public async Task<ActionResult<TreeMemberResponse>> UpdateMemberRole(
        Guid treeId, long userId, UpdateTreeMemberRoleRequest request)
    {
        if (!await HasTreeAccess(treeId, OrgRole.Admin))
        {
            return Forbid();
        }

        var orgUser = await _context.OrgUsers
            .Include(ou => ou.User)
            .FirstOrDefaultAsync(ou => ou.OrgId == treeId && ou.UserId == userId);

        if (orgUser == null)
        {
            return NotFound(new { message = "Member not found" });
        }

        // Can't change Owner's role
        if (orgUser.Role == OrgRole.Owner)
        {
            return BadRequest(new { message = "Cannot change the owner's role" });
        }

        // Can't promote to Owner
        if (request.Role == OrgRole.Owner)
        {
            return BadRequest(new { message = "Use transfer ownership instead" });
        }

        orgUser.Role = request.Role;
        await _context.SaveChangesAsync();

        _logger.LogInformation("Member role updated: {TreeId}, User: {UserId}, New Role: {Role}",
            treeId, userId, request.Role);

        return new TreeMemberResponse(
            orgUser.Id,
            orgUser.UserId,
            orgUser.User.Email ?? "",
            orgUser.User.FirstName,
            orgUser.User.LastName,
            orgUser.Role,
            orgUser.JoinedAt
        );
    }

    /// <summary>
    /// Remove a member from a tree
    /// </summary>
    [HttpDelete("{treeId}/members/{userId}")]
    public async Task<IActionResult> RemoveMember(Guid treeId, long userId)
    {
        if (!await HasTreeAccess(treeId, OrgRole.Admin))
        {
            return Forbid();
        }

        var orgUser = await _context.OrgUsers
            .FirstOrDefaultAsync(ou => ou.OrgId == treeId && ou.UserId == userId);

        if (orgUser == null)
        {
            return NotFound(new { message = "Member not found" });
        }

        // Can't remove Owner
        if (orgUser.Role == OrgRole.Owner)
        {
            return BadRequest(new { message = "Cannot remove the tree owner" });
        }

        _context.OrgUsers.Remove(orgUser);
        await _context.SaveChangesAsync();

        _logger.LogInformation("Member removed from tree: {TreeId}, User: {UserId}", treeId, userId);

        return NoContent();
    }

    // ========================================================================
    // INVITATIONS
    // ========================================================================

    /// <summary>
    /// Get pending invitations for a tree
    /// </summary>
    [HttpGet("{treeId}/invitations")]
    public async Task<ActionResult<List<TreeInvitationResponse>>> GetInvitations(Guid treeId)
    {
        if (!await HasTreeAccess(treeId, OrgRole.Admin))
        {
            return Forbid();
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
            .ToListAsync();

        return invitations;
    }

    /// <summary>
    /// Create an invitation to join a tree
    /// </summary>
    [HttpPost("{treeId}/invitations")]
    public async Task<ActionResult<TreeInvitationResponse>> CreateInvitation(
        Guid treeId, CreateInvitationRequest request)
    {
        if (!await HasTreeAccess(treeId, OrgRole.Admin))
        {
            return Forbid();
        }

        var userId = GetUserId();
        var user = await _context.Users.FindAsync(userId);

        // Check if already a member
        var existingUser = await _context.Users.FirstOrDefaultAsync(u => u.Email == request.Email);
        if (existingUser != null)
        {
            var isMember = await _context.OrgUsers
                .AnyAsync(ou => ou.OrgId == treeId && ou.UserId == existingUser.Id);
            if (isMember)
            {
                return BadRequest(new { message = "User is already a member of this tree" });
            }
        }

        // Check for existing pending invitation
        var existingInvite = await _context.Set<TreeInvitation>()
            .FirstOrDefaultAsync(i => i.TreeId == treeId && i.Email == request.Email && i.AcceptedAt == null);

        if (existingInvite != null && existingInvite.ExpiresAt > DateTime.UtcNow)
        {
            return BadRequest(new { message = "An active invitation already exists for this email" });
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
        await _context.SaveChangesAsync();

        _logger.LogInformation("Invitation created: {TreeId}, Email: {Email}", treeId, request.Email);

        return new TreeInvitationResponse(
            invitation.Id,
            invitation.Email,
            invitation.Role,
            $"{user?.FirstName} {user?.LastName}".Trim(),
            invitation.ExpiresAt,
            false,
            invitation.CreatedAt
        );
    }

    /// <summary>
    /// Accept an invitation
    /// </summary>
    [HttpPost("invitations/accept")]
    public async Task<ActionResult<FamilyTreeResponse>> AcceptInvitation(AcceptInvitationRequest request)
    {
        var userId = GetUserId();

        var invitation = await _context.Set<TreeInvitation>()
            .Include(i => i.Tree)
            .ThenInclude(t => t.Owner)
            .Include(i => i.Tree)
            .ThenInclude(t => t.Town)
            .FirstOrDefaultAsync(i => i.Token == request.Token);

        if (invitation == null)
        {
            return NotFound(new { message = "Invitation not found" });
        }

        if (!invitation.IsValid)
        {
            return BadRequest(new { message = "Invitation has expired or already been used" });
        }

        // Check if already a member
        var isMember = await _context.OrgUsers
            .AnyAsync(ou => ou.OrgId == invitation.TreeId && ou.UserId == userId);

        if (isMember)
        {
            return BadRequest(new { message = "You are already a member of this tree" });
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

        await _context.SaveChangesAsync();

        _logger.LogInformation("Invitation accepted: {TreeId}, User: {UserId}", invitation.TreeId, userId);

        var tree = invitation.Tree;
        var memberCount = await _context.OrgUsers.CountAsync(ou => ou.OrgId == tree.Id);
        var personCount = await _context.People.CountAsync(p => p.OrgId == tree.Id);

        return new FamilyTreeResponse(
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
    }

    /// <summary>
    /// Delete/revoke an invitation
    /// </summary>
    [HttpDelete("{treeId}/invitations/{invitationId}")]
    public async Task<IActionResult> DeleteInvitation(Guid treeId, Guid invitationId)
    {
        if (!await HasTreeAccess(treeId, OrgRole.Admin))
        {
            return Forbid();
        }

        var invitation = await _context.Set<TreeInvitation>()
            .FirstOrDefaultAsync(i => i.Id == invitationId && i.TreeId == treeId);

        if (invitation == null)
        {
            return NotFound(new { message = "Invitation not found" });
        }

        _context.Set<TreeInvitation>().Remove(invitation);
        await _context.SaveChangesAsync();

        return NoContent();
    }
}