// File: Services/ParentChildService.cs
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using FamilyTreeApi.Data;
using FamilyTreeApi.DTOs;
using FamilyTreeApi.Models;
using FamilyTreeApi.Models.Enums;
using FamilyTreeApi.Services.Caching;

namespace FamilyTreeApi.Services;

/// <summary>
/// ParentChild service implementation containing all business logic for parent-child relationships.
/// </summary>
public class ParentChildService : IParentChildService
{
    private readonly ApplicationDbContext _context;
    private readonly ITreeCacheService _treeCache;
    private readonly IAuditLogService _auditLogService;
    private readonly ILogger<ParentChildService> _logger;

    public ParentChildService(
        ApplicationDbContext context,
        ITreeCacheService treeCache,
        IAuditLogService auditLogService,
        ILogger<ParentChildService> logger)
    {
        _context = context;
        _treeCache = treeCache;
        _auditLogService = auditLogService;
        _logger = logger;
    }

    public async Task<ServiceResult<List<ParentChildResponse>>> GetParentsAsync(
        Guid personId,
        UserContext userContext,
        CancellationToken cancellationToken = default)
    {
        try
        {
            _logger.LogInformation("GetParents called - PersonId: {PersonId}, UserId: {UserId}, SystemRole: {SystemRole}",
                personId, userContext.UserId, userContext.SystemRole);

            // Find the person and check if user has access to their tree
            var person = await _context.People
                .Include(p => p.Org)
                .FirstOrDefaultAsync(p => p.Id == personId, cancellationToken);

            if (person == null)
            {
                _logger.LogWarning("GetParents - Person not found: {PersonId}", personId);
                return ServiceResult<List<ParentChildResponse>>.NotFound("Person not found");
            }

            // Check if user has access to this tree
            var hasAccess = await HasTreeAccessAsync(person.OrgId, userContext, cancellationToken);

            _logger.LogInformation("GetParents - Person: {PersonName}, OrgId: {OrgId}, HasAccess: {HasAccess}",
                person.PrimaryName, person.OrgId, hasAccess);

            if (!hasAccess)
            {
                _logger.LogWarning("GetParents - ACCESS DENIED for UserId {UserId} to PersonId {PersonId} (OrgId: {OrgId})",
                    userContext.UserId, personId, person.OrgId);
                return ServiceResult<List<ParentChildResponse>>.Forbidden();
            }

            var parents = await _context.ParentChildren
                .Include(pc => pc.Parent)
                .Where(pc => pc.ChildId == personId)
                .Select(pc => new ParentChildResponse
                {
                    Id = pc.Id,
                    ParentId = pc.ParentId,
                    ParentName = pc.Parent.PrimaryName,
                    ParentNameArabic = pc.Parent.NameArabic,
                    ParentNameEnglish = pc.Parent.NameEnglish,
                    ParentNameNobiin = pc.Parent.NameNobiin,
                    ParentSex = pc.Parent.Sex,
                    ChildId = pc.ChildId,
                    ChildName = null,
                    ChildNameArabic = null,
                    ChildNameEnglish = null,
                    ChildNameNobiin = null,
                    ChildSex = null,
                    RelationshipType = pc.RelationshipType
                })
                .ToListAsync(cancellationToken);

            return ServiceResult<List<ParentChildResponse>>.Success(parents);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting parents for person {PersonId}", personId);
            return ServiceResult<List<ParentChildResponse>>.InternalError("Error loading parents");
        }
    }

    public async Task<ServiceResult<List<ParentChildResponse>>> GetChildrenAsync(
        Guid personId,
        UserContext userContext,
        CancellationToken cancellationToken = default)
    {
        try
        {
            _logger.LogInformation("GetChildren called - PersonId: {PersonId}, UserId: {UserId}, SystemRole: {SystemRole}",
                personId, userContext.UserId, userContext.SystemRole);

            // Find the person and check if user has access to their tree
            var person = await _context.People
                .Include(p => p.Org)
                .FirstOrDefaultAsync(p => p.Id == personId, cancellationToken);

            if (person == null)
            {
                _logger.LogWarning("GetChildren - Person not found: {PersonId}", personId);
                return ServiceResult<List<ParentChildResponse>>.NotFound("Person not found");
            }

            // Check if user has access to this tree
            var hasAccess = await HasTreeAccessAsync(person.OrgId, userContext, cancellationToken);

            _logger.LogInformation("GetChildren - Person: {PersonName}, OrgId: {OrgId}, HasAccess: {HasAccess}",
                person.PrimaryName, person.OrgId, hasAccess);

            if (!hasAccess)
            {
                _logger.LogWarning("GetChildren - ACCESS DENIED for UserId {UserId} to PersonId {PersonId} (OrgId: {OrgId})",
                    userContext.UserId, personId, person.OrgId);
                return ServiceResult<List<ParentChildResponse>>.Forbidden();
            }

            var children = await _context.ParentChildren
                .Include(pc => pc.Child)
                .Where(pc => pc.ParentId == personId)
                .Select(pc => new ParentChildResponse
                {
                    Id = pc.Id,
                    ParentId = pc.ParentId,
                    ParentName = null,
                    ParentNameArabic = null,
                    ParentNameEnglish = null,
                    ParentNameNobiin = null,
                    ParentSex = null,
                    ChildId = pc.ChildId,
                    ChildName = pc.Child.PrimaryName,
                    ChildNameArabic = pc.Child.NameArabic,
                    ChildNameEnglish = pc.Child.NameEnglish,
                    ChildNameNobiin = pc.Child.NameNobiin,
                    ChildSex = pc.Child.Sex,
                    RelationshipType = pc.RelationshipType
                })
                .ToListAsync(cancellationToken);

            return ServiceResult<List<ParentChildResponse>>.Success(children);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting children for person {PersonId}", personId);
            return ServiceResult<List<ParentChildResponse>>.InternalError("Error loading children");
        }
    }

    public async Task<ServiceResult<ParentChildResponse>> AddParentAsync(
        Guid childId,
        Guid parentId,
        AddParentChildRequest? request,
        UserContext userContext,
        CancellationToken cancellationToken = default)
    {
        try
        {
            // First, find the child person to determine the tree/org
            var child = await _context.People.FirstOrDefaultAsync(
                p => p.Id == childId, cancellationToken);
            if (child == null)
            {
                return ServiceResult<ParentChildResponse>.NotFound("Child not found");
            }

            // Use child's OrgId as the effective org (the tree where the relationship lives)
            var effectiveOrgId = child.OrgId;

            // Verify user has access to this tree (handles multi-org admin users correctly)
            var hasAccess = await HasTreeAccessAsync(effectiveOrgId, userContext, cancellationToken);
            if (!hasAccess)
            {
                return ServiceResult<ParentChildResponse>.Failure("You don't have access to this tree");
            }

            var parent = await _context.People.FirstOrDefaultAsync(p => p.Id == parentId, cancellationToken);
            if (parent == null)
            {
                return ServiceResult<ParentChildResponse>.NotFound("Parent not found");
            }

            // Check for existing relationship
            var existing = await _context.ParentChildren
                .AnyAsync(pc => pc.ParentId == parentId && pc.ChildId == childId, cancellationToken);
            if (existing)
            {
                return ServiceResult<ParentChildResponse>.Failure("This parent-child relationship already exists");
            }

            // Check for cycle (parent can't be their own ancestor)
            if (await WouldCreateCycleAsync(parentId, childId, cancellationToken))
            {
                return ServiceResult<ParentChildResponse>.Failure("This relationship would create a cycle in the family tree");
            }

            // Check if child already has 2 biological parents
            var relationshipType = request?.RelationshipType ?? RelationshipType.Biological;
            if (relationshipType == RelationshipType.Biological)
            {
                var existingBioParents = await _context.ParentChildren
                    .Include(pc => pc.Parent)
                    .Where(pc => pc.ChildId == childId && pc.RelationshipType == RelationshipType.Biological)
                    .ToListAsync(cancellationToken);

                if (existingBioParents.Count >= 2)
                {
                    return ServiceResult<ParentChildResponse>.Failure("A person can have at most 2 biological parents");
                }

                var sameGenderParent = existingBioParents.FirstOrDefault(p => p.Parent.Sex == parent.Sex);
                if (sameGenderParent != null)
                {
                    return ServiceResult<ParentChildResponse>.Failure(
                        $"This person already has a biological {(parent.Sex != Sex.Unknown ? parent.Sex.ToString().ToLower() : "parent")}");
                }
            }

            var parentChild = new ParentChild
            {
                Id = Guid.NewGuid(),
                ParentId = parentId,
                ChildId = childId,
                RelationshipType = relationshipType,
                CreatedAt = DateTime.UtcNow
            };

            _context.ParentChildren.Add(parentChild);
            await _context.SaveChangesAsync(cancellationToken);

            // Invalidate cache for both parent and child
            await _treeCache.InvalidatePersonAsync(parentId, effectiveOrgId, cancellationToken);
            await _treeCache.InvalidatePersonAsync(childId, effectiveOrgId, cancellationToken);

            _logger.LogInformation("Parent-child relationship created: Parent {ParentId} -> Child {ChildId}", parentId, childId);

            await _auditLogService.LogAsync(
                userContext.UserId, "AddParent", "ParentChild", parentChild.Id,
                $"Added parent {parent.PrimaryName} to child {child.PrimaryName}",
                newValuesJson: JsonSerializer.Serialize(new { parentChild.Id, ParentId = parentId, ChildId = childId, parentChild.RelationshipType }),
                cancellationToken: cancellationToken);

            var response = new ParentChildResponse
            {
                Id = parentChild.Id,
                ParentId = parentId,
                ParentName = parent.PrimaryName,
                ParentNameArabic = parent.NameArabic,
                ParentNameEnglish = parent.NameEnglish,
                ParentNameNobiin = parent.NameNobiin,
                ParentSex = parent.Sex,
                ChildId = childId,
                ChildName = child.PrimaryName,
                ChildNameArabic = child.NameArabic,
                ChildNameEnglish = child.NameEnglish,
                ChildNameNobiin = child.NameNobiin,
                ChildSex = child.Sex,
                RelationshipType = parentChild.RelationshipType
            };

            // Suggest additional parents: find parent's spouses via unions who are NOT already
            // a parent of this child, and who wouldn't violate constraints (max 2 bio parents).
            try
            {
                var suggestedParents = await GetSuggestedAdditionalParentsAsync(
                    parentId, childId, cancellationToken);
                if (suggestedParents.Count > 0)
                {
                    response.SuggestedAdditionalParents = suggestedParents;
                }
            }
            catch (Exception suggestEx)
            {
                // Non-critical: log but don't fail the main operation
                _logger.LogWarning(suggestEx,
                    "Error computing suggested additional parents for Parent {ParentId} -> Child {ChildId}",
                    parentId, childId);
            }

            return ServiceResult<ParentChildResponse>.Success(response);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error adding parent {ParentId} to child {ChildId}", parentId, childId);
            return ServiceResult<ParentChildResponse>.InternalError("Error creating relationship");
        }
    }

    public async Task<ServiceResult<ParentChildResponse>> UpdateRelationshipAsync(
        Guid id,
        UpdateParentChildRequest request,
        UserContext userContext,
        CancellationToken cancellationToken = default)
    {
        try
        {
            var relationship = await _context.ParentChildren
                .Include(pc => pc.Parent)
                .Include(pc => pc.Child)
                .FirstOrDefaultAsync(pc => pc.Id == id, cancellationToken);

            if (relationship == null)
            {
                return ServiceResult<ParentChildResponse>.NotFound("Relationship not found");
            }

            // Verify user has access to the tree (handles multi-org admin users)
            if (!await HasTreeAccessAsync(relationship.Parent.OrgId, userContext, cancellationToken))
            {
                return ServiceResult<ParentChildResponse>.Forbidden();
            }

            if (request.RelationshipType.HasValue)
                relationship.RelationshipType = request.RelationshipType.Value;
            await _context.SaveChangesAsync(cancellationToken);

            // Invalidate cache for both parent and child
            var orgId = relationship.Parent.OrgId;
            await _treeCache.InvalidatePersonAsync(relationship.ParentId, orgId, cancellationToken);
            await _treeCache.InvalidatePersonAsync(relationship.ChildId, orgId, cancellationToken);

            _logger.LogInformation("Parent-child relationship updated: {RelationshipId}", id);

            await _auditLogService.LogAsync(
                userContext.UserId, "Update", "ParentChild", id,
                $"Updated parent-child relationship: {relationship.Parent.PrimaryName} -> {relationship.Child.PrimaryName}",
                cancellationToken: cancellationToken);

            var response = new ParentChildResponse
            {
                Id = relationship.Id,
                ParentId = relationship.ParentId,
                ParentName = relationship.Parent.PrimaryName,
                ParentNameArabic = relationship.Parent.NameArabic,
                ParentNameEnglish = relationship.Parent.NameEnglish,
                ParentNameNobiin = relationship.Parent.NameNobiin,
                ParentSex = relationship.Parent.Sex,
                ChildId = relationship.ChildId,
                ChildName = relationship.Child.PrimaryName,
                ChildNameArabic = relationship.Child.NameArabic,
                ChildNameEnglish = relationship.Child.NameEnglish,
                ChildNameNobiin = relationship.Child.NameNobiin,
                ChildSex = relationship.Child.Sex,
                RelationshipType = relationship.RelationshipType
            };

            return ServiceResult<ParentChildResponse>.Success(response);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error updating relationship {RelationshipId}", id);
            return ServiceResult<ParentChildResponse>.InternalError("Error updating relationship");
        }
    }

    public async Task<ServiceResult> DeleteRelationshipAsync(
        Guid id,
        UserContext userContext,
        CancellationToken cancellationToken = default)
    {
        try
        {
            var relationship = await _context.ParentChildren
                .Include(pc => pc.Parent)
                .Include(pc => pc.Child)
                .FirstOrDefaultAsync(pc => pc.Id == id, cancellationToken);

            if (relationship == null)
            {
                return ServiceResult.NotFound("Relationship not found");
            }

            // Verify user has access to the tree (handles multi-org admin users)
            if (!await HasTreeAccessAsync(relationship.Parent.OrgId, userContext, cancellationToken))
            {
                return ServiceResult.Forbidden();
            }

            // Get IDs before removing for cache invalidation
            var parentId = relationship.ParentId;
            var childId = relationship.ChildId;
            var orgId = relationship.Parent.OrgId;

            _context.ParentChildren.Remove(relationship);
            await _context.SaveChangesAsync(cancellationToken);

            // Invalidate cache for both parent and child
            await _treeCache.InvalidatePersonAsync(parentId, orgId, cancellationToken);
            await _treeCache.InvalidatePersonAsync(childId, orgId, cancellationToken);

            _logger.LogInformation("Parent-child relationship deleted: {RelationshipId}", id);

            await _auditLogService.LogAsync(
                userContext.UserId, "Delete", "ParentChild", id,
                $"Deleted parent-child relationship: parent {parentId} -> child {childId}",
                cancellationToken: cancellationToken);

            return ServiceResult.Success();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error deleting relationship {RelationshipId}", id);
            return ServiceResult.InternalError("Error deleting relationship");
        }
    }

    public async Task<ServiceResult> RemoveParentAsync(
        Guid childId,
        Guid parentId,
        UserContext userContext,
        CancellationToken cancellationToken = default)
    {
        try
        {
            var relationship = await _context.ParentChildren
                .Include(pc => pc.Parent)
                .Include(pc => pc.Child)
                .FirstOrDefaultAsync(pc => pc.ParentId == parentId && pc.ChildId == childId, cancellationToken);

            if (relationship == null)
            {
                return ServiceResult.NotFound("Relationship not found");
            }

            // Verify user has access to the tree (handles multi-org admin users)
            if (!await HasTreeAccessAsync(relationship.Parent.OrgId, userContext, cancellationToken))
            {
                return ServiceResult.Forbidden();
            }

            // Get orgId for cache invalidation before removing
            var orgId = relationship.Parent.OrgId;

            _context.ParentChildren.Remove(relationship);
            await _context.SaveChangesAsync(cancellationToken);

            // Invalidate cache for both parent and child
            await _treeCache.InvalidatePersonAsync(parentId, orgId, cancellationToken);
            await _treeCache.InvalidatePersonAsync(childId, orgId, cancellationToken);

            _logger.LogInformation("Parent removed: Parent {ParentId} from Child {ChildId}", parentId, childId);

            await _auditLogService.LogAsync(
                userContext.UserId, "RemoveParent", "ParentChild", relationship.Id,
                $"Removed parent {parentId} from child {childId}",
                cancellationToken: cancellationToken);

            return ServiceResult.Success();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error removing parent {ParentId} from child {ChildId}", parentId, childId);
            return ServiceResult.InternalError("Error removing relationship");
        }
    }

    public async Task<ServiceResult<List<SiblingResponse>>> GetSiblingsAsync(
        Guid personId,
        UserContext userContext,
        CancellationToken cancellationToken = default)
    {
        try
        {
            _logger.LogInformation("GetSiblings called - PersonId: {PersonId}, UserId: {UserId}, SystemRole: {SystemRole}",
                personId, userContext.UserId, userContext.SystemRole);

            // Find the person and check if user has access to their tree
            var person = await _context.People
                .Include(p => p.Org)
                .FirstOrDefaultAsync(p => p.Id == personId, cancellationToken);

            if (person == null)
            {
                return ServiceResult<List<SiblingResponse>>.NotFound("Person not found");
            }

            // Check if user has access to this tree
            var hasAccess = await HasTreeAccessAsync(person.OrgId, userContext, cancellationToken);

            if (!hasAccess)
            {
                _logger.LogWarning("GetSiblings - ACCESS DENIED for UserId {UserId} to PersonId {PersonId} (OrgId: {OrgId})",
                    userContext.UserId, personId, person.OrgId);
                return ServiceResult<List<SiblingResponse>>.Forbidden();
            }

            // Get all parents of this person
            var parentIds = await _context.ParentChildren
                .Where(pc => pc.ChildId == personId)
                .Select(pc => pc.ParentId)
                .ToListAsync(cancellationToken);

            if (!parentIds.Any())
            {
                return ServiceResult<List<SiblingResponse>>.Success(new List<SiblingResponse>());
            }

            // Get all children of these parents (excluding the person themselves)
            var siblings = await _context.ParentChildren
                .Include(pc => pc.Child)
                .Where(pc => parentIds.Contains(pc.ParentId) && pc.ChildId != personId)
                .Select(pc => new { pc.Child, pc.ParentId })
                .ToListAsync(cancellationToken);

            // Group by child and determine sibling type
            var siblingGroups = siblings
                .GroupBy(s => s.Child.Id)
                .Select(g => new SiblingResponse
                {
                    PersonId = g.Key,
                    PersonName = g.First().Child.PrimaryName,
                    PersonNameArabic = g.First().Child.NameArabic,
                    PersonNameEnglish = g.First().Child.NameEnglish,
                    PersonNameNobiin = g.First().Child.NameNobiin,
                    PersonSex = g.First().Child.Sex,
                    SharedParentCount = g.Select(x => x.ParentId).Distinct().Count(),
                    IsFullSibling = g.Select(x => x.ParentId).Distinct().Count() == parentIds.Count && parentIds.Count >= 2,
                    IsHalfSibling = g.Select(x => x.ParentId).Distinct().Count() < parentIds.Count || parentIds.Count < 2
                })
                .ToList();

            return ServiceResult<List<SiblingResponse>>.Success(siblingGroups);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting siblings for person {PersonId}", personId);
            return ServiceResult<List<SiblingResponse>>.InternalError("Error loading siblings");
        }
    }

    // ============================================================================
    // PRIVATE HELPER METHODS
    // ============================================================================

    /// <summary>
    /// Check if user has access to a specific tree.
    /// SuperAdmin: access to all trees
    /// Admin: access to assigned trees + member trees
    /// User: access to member trees, public trees, or trees in their selected town
    /// </summary>
    private async Task<bool> HasTreeAccessAsync(
        Guid treeId,
        UserContext userContext,
        CancellationToken cancellationToken)
    {
        // Developer and SuperAdmin have access to everything
        if (userContext.IsDeveloper || userContext.IsSuperAdmin) return true;

        // Admin: check for assignment or membership
        if (userContext.IsAdmin)
        {
            var isAssigned = await _context.Set<AdminTreeAssignment>()
                .AnyAsync(a => a.UserId == userContext.UserId && a.TreeId == treeId, cancellationToken);
            if (isAssigned) return true;
        }

        // Check direct membership
        var isMember = await _context.OrgUsers
            .AnyAsync(ou => ou.UserId == userContext.UserId && ou.OrgId == treeId, cancellationToken);
        if (isMember) return true;

        // Check if tree is public
        var isPublic = await _context.Orgs
            .AnyAsync(o => o.Id == treeId && o.IsPublic, cancellationToken);
        if (isPublic) return true;

        // Regular users can also access trees in their selected town (browse mode)
        if (userContext.SelectedTownId.HasValue)
        {
            var tree = await _context.Orgs
                .FirstOrDefaultAsync(o => o.Id == treeId, cancellationToken);
            if (tree != null && tree.TownId == userContext.SelectedTownId.Value)
            {
                _logger.LogInformation(
                    "User {UserId} granted read access to tree {TreeId} via town selection {TownId}",
                    userContext.UserId, treeId, userContext.SelectedTownId.Value);
                return true;
            }
        }

        return false;
    }

    /// <summary>
    /// Find spouses/partners of the given parent (via unions) who are NOT already a parent
    /// of the given child, and who could be linked without violating constraints.
    /// </summary>
    private async Task<List<SuggestedParentDto>> GetSuggestedAdditionalParentsAsync(
        Guid parentId,
        Guid childId,
        CancellationToken cancellationToken)
    {
        var suggested = new List<SuggestedParentDto>();

        // Find all unions where the parent is a member
        var parentUnionMemberships = await _context.Set<UnionMember>()
            .Where(um => um.PersonId == parentId && !um.IsDeleted)
            .Include(um => um.Union)
            .Where(um => !um.Union.IsDeleted)
            .Select(um => um.UnionId)
            .ToListAsync(cancellationToken);

        if (!parentUnionMemberships.Any())
            return suggested;

        // Find all other members of those unions (the spouses/partners)
        var spouseMembers = await _context.Set<UnionMember>()
            .Where(um => parentUnionMemberships.Contains(um.UnionId)
                && um.PersonId != parentId
                && !um.IsDeleted)
            .Include(um => um.Person)
            .ToListAsync(cancellationToken);

        if (!spouseMembers.Any())
            return suggested;

        // Get existing parents of this child to check constraints
        var existingParentIds = await _context.ParentChildren
            .Where(pc => pc.ChildId == childId && !pc.IsDeleted)
            .Select(pc => pc.ParentId)
            .ToListAsync(cancellationToken);

        var existingBioParentCount = await _context.ParentChildren
            .CountAsync(pc => pc.ChildId == childId
                && pc.RelationshipType == RelationshipType.Biological
                && !pc.IsDeleted, cancellationToken);

        foreach (var spouseMember in spouseMembers)
        {
            // Skip if spouse is already a parent of this child
            if (existingParentIds.Contains(spouseMember.PersonId))
                continue;

            // Skip if child already has 2 biological parents (adding another bio parent would fail)
            if (existingBioParentCount >= 2)
                continue;

            // Skip if cycle would be created
            if (await WouldCreateCycleAsync(spouseMember.PersonId, childId, cancellationToken))
                continue;

            var person = spouseMember.Person;
            if (person != null && !person.IsDeleted)
            {
                suggested.Add(new SuggestedParentDto
                {
                    PersonId = person.Id,
                    PersonName = person.PrimaryName,
                    PersonNameArabic = person.NameArabic,
                    PersonNameEnglish = person.NameEnglish,
                    PersonNameNobiin = person.NameNobiin,
                    PersonSex = person.Sex,
                    UnionId = spouseMember.UnionId
                });
            }
        }

        return suggested;
    }

    /// <summary>
    /// Check if adding a parent-child relationship would create a cycle in the family tree.
    /// </summary>
    private async Task<bool> WouldCreateCycleAsync(
        Guid parentId,
        Guid childId,
        CancellationToken cancellationToken)
    {
        var visited = new HashSet<Guid>();
        var queue = new Queue<Guid>();
        queue.Enqueue(childId);

        while (queue.Count > 0)
        {
            var current = queue.Dequeue();

            if (current == parentId)
            {
                return true;
            }

            if (visited.Contains(current))
            {
                continue;
            }

            visited.Add(current);

            var children = await _context.ParentChildren
                .Where(pc => pc.ParentId == current)
                .Select(pc => pc.ChildId)
                .ToListAsync(cancellationToken);

            foreach (var child in children)
            {
                if (!visited.Contains(child))
                {
                    queue.Enqueue(child);
                }
            }
        }

        return false;
    }
}
