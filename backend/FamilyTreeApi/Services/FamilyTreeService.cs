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
/// 
/// OPTIMIZATIONS APPLIED:
/// - AsNoTracking() on all read-only queries
/// - Consolidated queries to reduce database round-trips
/// - Projection to reduce data transfer
/// - Cached role checks where possible
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

            // OPTIMIZED: Get roles once instead of multiple IsInRoleAsync calls
            var roles = await _userManager.GetRolesAsync(user);
            var isSuperAdmin = roles.Contains("SuperAdmin");
            var isAdmin = roles.Contains("Admin");

            IQueryable<Org> query = _context.Orgs.AsNoTracking(); // OPTIMIZED: Added AsNoTracking

            if (isSuperAdmin)
            {
                // SuperAdmin sees all trees - no filter needed
            }
            else if (isAdmin)
            {
                // OPTIMIZED: Single query with UNION instead of two separate queries
                var accessibleTreeIds = await _context.Set<AdminTreeAssignment>()
                    .AsNoTracking() // OPTIMIZED: Added AsNoTracking
                    .Where(a => a.UserId == userId)
                    .Select(a => a.TreeId)
                    .Union(
                        _context.OrgUsers
                            .AsNoTracking() // OPTIMIZED: Added AsNoTracking
                            .Where(ou => ou.UserId == userId)
                            .Select(ou => ou.OrgId)
                    )
                    .ToListAsync(cancellationToken);

                query = query.Where(o => accessibleTreeIds.Contains(o.Id));
            }
            else
            {
                // Regular user sees only member trees
                var memberTreeIds = await _context.OrgUsers
                    .AsNoTracking() // OPTIMIZED: Added AsNoTracking
                    .Where(ou => ou.UserId == userId)
                    .Select(ou => ou.OrgId)
                    .ToListAsync(cancellationToken);

                query = query.Where(o => memberTreeIds.Contains(o.Id));
            }

            // OPTIMIZED: Use projection to select only needed fields
            var trees = await query
                .Include(o => o.Town)
                .OrderBy(o => o.Name)
                .Select(o => new FamilyTreeListItem(
                    o.Id,
                    o.Name,
                    o.Description,
                    o.IsPublic,
                    o.CoverImageUrl,
                    o.People.Count,
                    o.OrgUsers.Where(ou => ou.UserId == userId).Select(ou => (OrgRole?)ou.Role).FirstOrDefault(),
                    o.TownId,
                    o.Town != null ? o.Town.Name : "",
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

            // OPTIMIZED: Use projection instead of loading full entities
            var tree = await _context.Orgs
                .AsNoTracking() // OPTIMIZED: Added AsNoTracking
                .Where(o => o.Id == id)
                .Select(o => new FamilyTreeResponse(
                    o.Id,
                    o.Name,
                    o.Description,
                    o.IsPublic,
                    o.AllowCrossTreeLinking,
                    o.CoverImageUrl,
                    o.OwnerId,
                    o.Owner != null ? (o.Owner.FirstName + " " + o.Owner.LastName).Trim() : null,
                    o.TownId,
                    o.Town != null ? o.Town.Name : "",
                    o.OrgUsers.Count,
                    o.People.Count,
                    o.CreatedAt,
                    o.UpdatedAt
                ))
                .FirstOrDefaultAsync(cancellationToken);

            if (tree == null)
            {
                return ServiceResult<FamilyTreeResponse>.NotFound("Family tree not found");
            }

            return ServiceResult<FamilyTreeResponse>.Success(tree);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting tree {TreeId}", id);
            return ServiceResult<FamilyTreeResponse>.InternalError("Error loading tree");
        }
    }

    public async Task<ServiceResult<FamilyTreeDetailDto>> GetTreeDetailsAsync(
        Guid treeId,
        UserContext userContext,
        CancellationToken cancellationToken = default)
    {
        try
        {
            if (!await HasTreeAccessAsync(treeId, userContext, OrgRole.Viewer, cancellationToken))
            {
                return ServiceResult<FamilyTreeDetailDto>.Forbidden("You do not have access to this tree");
            }

            var tree = await _context.Orgs
                .AsNoTracking()
                .Include(o => o.Town)
                .Include(o => o.Owner)
                .FirstOrDefaultAsync(o => o.Id == treeId, cancellationToken);

            if (tree == null)
            {
                return ServiceResult<FamilyTreeDetailDto>.NotFound("Family tree not found");
            }

            // Get people statistics
            var people = await _context.People
                .AsNoTracking()
                .Where(p => p.OrgId == treeId)
                .ToListAsync(cancellationToken);

            var maleCount = people.Count(p => p.Sex == Sex.Male);
            var femaleCount = people.Count(p => p.Sex == Sex.Female);
            var unknownCount = people.Count(p => p.Sex == Sex.Unknown);
            var livingCount = people.Count(p => p.DeathDate == null);
            var deceasedCount = people.Count(p => p.DeathDate != null);

            // Get counts
            var familiesCount = await _context.Unions
                .AsNoTracking()
                .CountAsync(u => u.OrgId == treeId, cancellationToken);
            var relationshipsCount = await _context.ParentChildren
                .AsNoTracking()
                .CountAsync(pc => pc.Parent.OrgId == treeId, cancellationToken);
            var mediaFiles = await _context.MediaFiles
                .AsNoTracking()
                .Where(m => m.OrgId == treeId)
                .ToListAsync(cancellationToken);

            // Find oldest and youngest
            var oldestPerson = people
                .Where(p => p.BirthDate != null)
                .OrderBy(p => p.BirthDate)
                .FirstOrDefault();
            var youngestPerson = people
                .Where(p => p.BirthDate != null)
                .OrderByDescending(p => p.BirthDate)
                .FirstOrDefault();

            // Recent people
            var recentlyAdded = people
                .OrderByDescending(p => p.CreatedAt)
                .Take(5)
                .Select(p => MapToRecentPerson(p, p.CreatedAt))
                .ToList();

            var recentlyUpdated = people
                .Where(p => p.UpdatedAt > p.CreatedAt)
                .OrderByDescending(p => p.UpdatedAt)
                .Take(5)
                .Select(p => MapToRecentPerson(p, p.UpdatedAt))
                .ToList();

            var statistics = new TreeStatisticsDto(
                TotalPeople: people.Count,
                MaleCount: maleCount,
                FemaleCount: femaleCount,
                UnknownGenderCount: unknownCount,
                LivingCount: livingCount,
                DeceasedCount: deceasedCount,
                FamiliesCount: familiesCount,
                RelationshipsCount: relationshipsCount,
                MediaFilesCount: mediaFiles.Count,
                PhotosCount: mediaFiles.Count(m => m.Kind == MediaKind.Image),
                DocumentsCount: mediaFiles.Count(m => m.Kind == MediaKind.Document),
                OldestPerson: oldestPerson != null ? MapToRecentPerson(oldestPerson, oldestPerson.CreatedAt) : null,
                YoungestPerson: youngestPerson != null ? MapToRecentPerson(youngestPerson, youngestPerson.CreatedAt) : null
            );

            var detail = new FamilyTreeDetailDto(
                Id: tree.Id,
                Name: tree.Name,
                Description: tree.Description,
                CoverImageUrl: tree.CoverImageUrl,
                TownId: tree.TownId,
                TownName: tree.Town?.Name ?? "Unknown",
                IsPublic: tree.IsPublic,
                Statistics: statistics,
                RecentlyAddedPeople: recentlyAdded,
                RecentlyUpdatedPeople: recentlyUpdated,
                OwnerId: tree.OwnerId,
                OwnerName: tree.Owner != null ? $"{tree.Owner.FirstName} {tree.Owner.LastName}".Trim() : null,
                CreatedAt: tree.CreatedAt,
                UpdatedAt: tree.UpdatedAt
            );

            return ServiceResult<FamilyTreeDetailDto>.Success(detail);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting tree details for {TreeId}", treeId);
            return ServiceResult<FamilyTreeDetailDto>.InternalError("Failed to get tree details");
        }
    }

    private static RecentPersonDto MapToRecentPerson(Person p, DateTime activityDate)
    {
        return new RecentPersonDto(
            Id: p.Id,
            PrimaryName: p.PrimaryName,
            NameEnglish: p.NameEnglish,
            NameArabic: p.NameArabic,
            Sex: p.Sex.ToString(),
            BirthDate: p.BirthDate?.ToString("yyyy-MM-dd"),
            DeathDate: p.DeathDate?.ToString("yyyy-MM-dd"),
            AvatarUrl: p.Avatar?.Url,
            ActivityDate: activityDate
        );
    }

    public async Task<ServiceResult<FamilyTreeResponse>> CreateTreeAsync(
        CreateFamilyTreeRequest request,
        UserContext userContext,
        CancellationToken cancellationToken = default)
    {
        try
        {
            var userId = userContext.UserId;

            // HIERARCHY ENFORCEMENT: Validate TownId exists
            // Note: FindAsync uses tracking by default, but this is a write operation so it's acceptable
            var town = await _context.Towns
                .AsNoTracking() // OPTIMIZED: Added AsNoTracking since we only need to check existence
                .FirstOrDefaultAsync(t => t.Id == request.TownId, cancellationToken);

            if (town == null)
            {
                return ServiceResult<FamilyTreeResponse>.Failure(
                    "Invalid TownId. Every family tree must belong to a valid town.",
                    ServiceErrorType.BadRequest);
            }

            var tree = new Org
            {
                Id = Guid.NewGuid(),
                Name = request.Name,
                Description = request.Description,
                IsPublic = request.IsPublic,
                AllowCrossTreeLinking = request.AllowCrossTreeLinking,
                TownId = request.TownId,  // REQUIRED: Every tree must belong to a town
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

            _logger.LogInformation("Family tree created: {TreeId} in Town {TownId} by user {UserId}",
                tree.Id, tree.TownId, userId);

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
                town.Name,
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

            // Note: For updates, we need tracking enabled, so we use AsTracking() explicitly
            // Don't include Town to avoid tracking conflicts when TownId changes
            var tree = await _context.Orgs
                .AsTracking()
                .Include(o => o.Owner)
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

            // HIERARCHY ENFORCEMENT: TownId can be changed but not removed
            if (request.TownId.HasValue)
            {
                if (request.TownId.Value == Guid.Empty)
                {
                    return ServiceResult<FamilyTreeResponse>.Failure(
                        "Cannot remove TownId. Every family tree must belong to a town.",
                        ServiceErrorType.BadRequest);
                }

                // Only validate that the town exists, don't load/attach it
                var townExists = await _context.Towns
                    .AsNoTracking()
                    .AnyAsync(t => t.Id == request.TownId.Value, cancellationToken);

                if (!townExists)
                {
                    return ServiceResult<FamilyTreeResponse>.Failure(
                        "Invalid TownId. The specified town does not exist.",
                        ServiceErrorType.BadRequest);
                }

                // Only set the foreign key, don't assign navigation property to avoid tracking conflicts
                tree.TownId = request.TownId.Value;
            }

            tree.UpdatedAt = DateTime.UtcNow;

            await _context.SaveChangesAsync(cancellationToken);

            _logger.LogInformation("Family tree updated: {TreeId}", id);

            // OPTIMIZED: Get counts and town name with separate efficient queries
            var memberCount = await _context.OrgUsers
                .AsNoTracking()
                .CountAsync(ou => ou.OrgId == id, cancellationToken);

            var personCount = await _context.People
                .AsNoTracking()
                .CountAsync(p => p.OrgId == id, cancellationToken);

            // Get the current Town name (may have changed)
            var townName = await _context.Towns
                .AsNoTracking()
                .Where(t => t.Id == tree.TownId)
                .Select(t => t.Name)
                .FirstOrDefaultAsync(cancellationToken) ?? "";

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
                townName,
                memberCount,
                personCount,
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

            // OPTIMIZED: Only fetch needed fields for deletion check
            var treeInfo = await _context.Orgs
                .AsNoTracking() // OPTIMIZED: Added AsNoTracking
                .Where(o => o.Id == id)
                .Select(o => new { o.Id, o.OwnerId })
                .FirstOrDefaultAsync(cancellationToken);

            if (treeInfo == null)
            {
                return ServiceResult.NotFound("Family tree not found");
            }

            // Only Owner or SuperAdmin can delete
            var isOwner = treeInfo.OwnerId == user.Id;
            var isSuperAdmin = await _userManager.IsInRoleAsync(user, "SuperAdmin");

            if (!isOwner && !isSuperAdmin)
            {
                return ServiceResult.Forbidden("Only the tree owner or SuperAdmin can delete this tree");
            }

            // Now fetch for actual deletion (needs tracking)
            var tree = await _context.Orgs.FindAsync(new object[] { id }, cancellationToken);
            if (tree != null)
            {
                _context.Orgs.Remove(tree);
                await _context.SaveChangesAsync(cancellationToken);
            }

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

            // OPTIMIZED: Single query with projection and AsNoTracking
            // Note: Order before projection to avoid EF Core translation issues
            var members = await _context.OrgUsers
                .AsNoTracking()
                .Where(ou => ou.OrgId == treeId)
                .Join(_context.Users, ou => ou.UserId, u => u.Id, (ou, u) => new { OrgUser = ou, User = u })
                .OrderByDescending(x => x.OrgUser.Role)
                .ThenBy(x => x.User.Email)
                .Select(x => new TreeMemberResponse(
                    x.OrgUser.Id,
                    x.OrgUser.UserId,
                    x.User.Email ?? "",
                    x.User.FirstName,
                    x.User.LastName,
                    x.OrgUser.Role,
                    x.OrgUser.JoinedAt
                ))
                .ToListAsync(cancellationToken);

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

            // OPTIMIZED: Fetch only needed user fields
            var user = await _context.Users
                .AsNoTracking() // OPTIMIZED: Added AsNoTracking
                .Where(u => u.Id == request.UserId)
                .Select(u => new { u.Id, u.Email, u.FirstName, u.LastName })
                .FirstOrDefaultAsync(cancellationToken);

            if (user == null)
            {
                return ServiceResult<TreeMemberResponse>.Failure("User not found", ServiceErrorType.BadRequest);
            }

            // OPTIMIZED: Use AnyAsync with AsNoTracking
            var existingMember = await _context.OrgUsers
                .AsNoTracking() // OPTIMIZED: Added AsNoTracking
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

            // Note: For updates, we need tracking enabled
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

            // Note: For deletion, we need tracking enabled
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

            // OPTIMIZED: AsNoTracking with projection
            var invitations = await _context.Set<TreeInvitation>()
                .AsNoTracking() // OPTIMIZED: Added AsNoTracking
                .Where(i => i.TreeId == treeId)
                .OrderByDescending(i => i.CreatedAt)
                .Select(i => new TreeInvitationResponse(
                    i.Id,
                    i.Email,
                    i.Role,
                    i.InvitedByUser != null
                        ? (i.InvitedByUser.FirstName + " " + i.InvitedByUser.LastName).Trim()
                        : "",
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

            // OPTIMIZED: Fetch only needed user fields
            var user = await _context.Users
                .AsNoTracking() // OPTIMIZED: Added AsNoTracking
                .Where(u => u.Id == userId)
                .Select(u => new { u.FirstName, u.LastName })
                .FirstOrDefaultAsync(cancellationToken);

            // OPTIMIZED: Check if email exists and is member in single query
            var existingUserInfo = await _context.Users
                .AsNoTracking() // OPTIMIZED: Added AsNoTracking
                .Where(u => u.Email == request.Email)
                .Select(u => new
                {
                    u.Id,
                    IsMember = _context.OrgUsers.Any(ou => ou.OrgId == treeId && ou.UserId == u.Id)
                })
                .FirstOrDefaultAsync(cancellationToken);

            if (existingUserInfo != null && existingUserInfo.IsMember)
            {
                return ServiceResult<TreeInvitationResponse>.Failure("User is already a member of this tree", ServiceErrorType.BadRequest);
            }

            // Check for existing pending invitation
            var existingInvite = await _context.Set<TreeInvitation>()
                .AsNoTracking() // OPTIMIZED: Added AsNoTracking
                .Where(i => i.TreeId == treeId && i.Email == request.Email && i.AcceptedAt == null)
                .Select(i => new { i.ExpiresAt })
                .FirstOrDefaultAsync(cancellationToken);

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
                user != null ? $"{user.FirstName} {user.LastName}".Trim() : "",
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

            // Note: For updates, we need tracking on the invitation
            var invitation = await _context.Set<TreeInvitation>()
                .Include(i => i.Tree)
                .ThenInclude(t => t!.Owner)
                .Include(i => i.Tree)
                .ThenInclude(t => t!.Town)
                .FirstOrDefaultAsync(i => i.Token == token, cancellationToken);

            if (invitation == null)
            {
                return ServiceResult<FamilyTreeResponse>.NotFound("Invitation not found");
            }

            if (!invitation.IsValid)
            {
                return ServiceResult<FamilyTreeResponse>.Failure("Invitation has expired or already been used", ServiceErrorType.BadRequest);
            }

            // OPTIMIZED: Use AnyAsync with AsNoTracking
            var isMember = await _context.OrgUsers
                .AsNoTracking() // OPTIMIZED: Added AsNoTracking
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

            var tree = invitation.Tree!;

            // OPTIMIZED: Get counts with efficient queries
            var memberCount = await _context.OrgUsers
                .AsNoTracking()
                .CountAsync(ou => ou.OrgId == tree.Id, cancellationToken);

            var personCount = await _context.People
                .AsNoTracking()
                .CountAsync(p => p.OrgId == tree.Id, cancellationToken);

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
                tree.Town?.Name ?? "",
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

            // Note: For deletion, we need tracking
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
    /// 
    /// OPTIMIZED: Uses AsNoTracking for all read operations and caches role checks.
    /// </summary>
    private async Task<bool> HasTreeAccessAsync(
        Guid treeId,
        UserContext userContext,
        OrgRole minRole = OrgRole.Viewer,
        CancellationToken cancellationToken = default)
    {
        var user = await _userManager.FindByIdAsync(userContext.UserId.ToString());
        if (user == null) return false;

        // OPTIMIZED: Get roles once instead of multiple IsInRoleAsync calls
        var roles = await _userManager.GetRolesAsync(user);

        // SuperAdmin has access to everything
        if (roles.Contains("SuperAdmin")) return true;

        // Admin with tree assignment
        if (roles.Contains("Admin"))
        {
            var hasAssignment = await _context.Set<AdminTreeAssignment>()
                .AsNoTracking() // OPTIMIZED: Added AsNoTracking
                .AnyAsync(a => a.UserId == user.Id && a.TreeId == treeId, cancellationToken);
            if (hasAssignment) return true;
        }

        // OPTIMIZED: Check tree-specific role with projection
        var userRole = await _context.OrgUsers
            .AsNoTracking() // OPTIMIZED: Added AsNoTracking
            .Where(ou => ou.UserId == user.Id && ou.OrgId == treeId)
            .Select(ou => (OrgRole?)ou.Role)
            .FirstOrDefaultAsync(cancellationToken);

        return userRole.HasValue && userRole.Value >= minRole;
    }
}