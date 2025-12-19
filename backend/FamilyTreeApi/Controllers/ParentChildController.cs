using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using FamilyTreeApi.Data;
using FamilyTreeApi.Models;
using FamilyTreeApi.Models.Enums;
using System.Security.Claims;

namespace FamilyTreeApi.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class ParentChildController : ControllerBase
{
    private readonly ApplicationDbContext _context;
    private readonly ILogger<ParentChildController> _logger;

    public ParentChildController(ApplicationDbContext context, ILogger<ParentChildController> logger)
    {
        _context = context;
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

    private Guid? TryGetUserOrgId()
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

    private bool IsSuperAdmin() => GetSystemRole() == "SuperAdmin";
    private bool IsAdmin() => GetSystemRole() == "Admin";

    /// <summary>
    /// Check if user has access to a specific tree
    /// SuperAdmin: access to all trees
    /// Admin: access to assigned trees + member trees
    /// User: access to member trees only (or public trees)
    /// </summary>
    private async Task<bool> HasTreeAccessAsync(Guid treeId)
    {
        // SuperAdmin has access to everything
        if (IsSuperAdmin()) return true;

        var userId = GetUserId();

        // Admin: check for assignment or membership
        if (IsAdmin())
        {
            var isAssigned = await _context.Set<AdminTreeAssignment>()
                .AnyAsync(a => a.UserId == userId && a.TreeId == treeId);
            if (isAssigned) return true;
        }

        // Check direct membership
        var isMember = await _context.OrgUsers
            .AnyAsync(ou => ou.UserId == userId && ou.OrgId == treeId);
        if (isMember) return true;

        // Check if tree is public
        var isPublic = await _context.Orgs
            .AnyAsync(o => o.Id == treeId && o.IsPublic);

        return isPublic;
    }

    /// <summary>
    /// Get all parents of a person
    /// </summary>
    [HttpGet("person/{personId}/parents")]
    public async Task<ActionResult<List<ParentChildResponse>>> GetParents(Guid personId)
    {
        var userId = GetUserId();
        _logger.LogInformation("GetParents called - PersonId: {PersonId}, UserId: {UserId}, SystemRole: {SystemRole}",
            personId, userId, GetSystemRole());

        // Find the person and check if user has access to their tree
        var person = await _context.People
            .Include(p => p.Org)
            .FirstOrDefaultAsync(p => p.Id == personId);

        if (person == null)
        {
            _logger.LogWarning("GetParents - Person not found: {PersonId}", personId);
            return NotFound(new { message = "Person not found" });
        }

        // Check if user has access to this tree (including SuperAdmin/Admin)
        var hasAccess = await HasTreeAccessAsync(person.OrgId);

        _logger.LogInformation("GetParents - Person: {PersonName}, OrgId: {OrgId}, HasAccess: {HasAccess}",
            person.PrimaryName, person.OrgId, hasAccess);

        if (!hasAccess)
        {
            _logger.LogWarning("GetParents - ACCESS DENIED for UserId {UserId} to PersonId {PersonId} (OrgId: {OrgId})",
                userId, personId, person.OrgId);
            return Forbid();
        }

        var parents = await _context.ParentChildren
            .Include(pc => pc.Parent)
            .Where(pc => pc.ChildId == personId)
            .Select(pc => new ParentChildResponse
            {
                Id = pc.Id,
                ParentId = pc.ParentId,
                ParentName = pc.Parent.PrimaryName,
                ParentSex = pc.Parent.Sex,
                ChildId = pc.ChildId,
                ChildName = null,
                ChildSex = null,
                RelationshipType = pc.RelationshipType,
                Notes = pc.Notes
            })
            .ToListAsync();

        return parents;
    }

    /// <summary>
    /// Get all children of a person
    /// </summary>
    [HttpGet("person/{personId}/children")]
    public async Task<ActionResult<List<ParentChildResponse>>> GetChildren(Guid personId)
    {
        var userId = GetUserId();
        _logger.LogInformation("GetChildren called - PersonId: {PersonId}, UserId: {UserId}, SystemRole: {SystemRole}",
            personId, userId, GetSystemRole());

        // Find the person and check if user has access to their tree
        var person = await _context.People
            .Include(p => p.Org)
            .FirstOrDefaultAsync(p => p.Id == personId);

        if (person == null)
        {
            _logger.LogWarning("GetChildren - Person not found: {PersonId}", personId);
            return NotFound(new { message = "Person not found" });
        }

        // Check if user has access to this tree (including SuperAdmin/Admin)
        var hasAccess = await HasTreeAccessAsync(person.OrgId);

        _logger.LogInformation("GetChildren - Person: {PersonName}, OrgId: {OrgId}, HasAccess: {HasAccess}",
            person.PrimaryName, person.OrgId, hasAccess);

        if (!hasAccess)
        {
            _logger.LogWarning("GetChildren - ACCESS DENIED for UserId {UserId} to PersonId {PersonId} (OrgId: {OrgId})",
                userId, personId, person.OrgId);
            return Forbid();
        }

        var children = await _context.ParentChildren
            .Include(pc => pc.Child)
            .Where(pc => pc.ParentId == personId)
            .Select(pc => new ParentChildResponse
            {
                Id = pc.Id,
                ParentId = pc.ParentId,
                ParentName = null,
                ParentSex = null,
                ChildId = pc.ChildId,
                ChildName = pc.Child.PrimaryName,
                ChildSex = pc.Child.Sex,
                RelationshipType = pc.RelationshipType,
                Notes = pc.Notes
            })
            .ToListAsync();

        return children;
    }

    /// <summary>
    /// Add a parent to a person
    /// </summary>
    [HttpPost("person/{childId}/parents/{parentId}")]
    [Authorize(Roles = "Owner,Admin,Editor,Contributor,SuperAdmin")]
    public async Task<ActionResult<ParentChildResponse>> AddParent(
        Guid childId,
        Guid parentId,
        [FromBody] AddParentChildRequest? request = null)
    {
        var orgId = TryGetUserOrgId();
        if (orgId == null)
        {
            return BadRequest(new { message = "You must be a member of an organization to add relationships." });
        }

        var child = await _context.People.FirstOrDefaultAsync(p => p.Id == childId && p.OrgId == orgId);
        if (child == null)
        {
            return NotFound(new { message = "Child not found" });
        }

        var parent = await _context.People.FirstOrDefaultAsync(p => p.Id == parentId);
        if (parent == null)
        {
            return NotFound(new { message = "Parent not found" });
        }

        // Check for existing relationship
        var existing = await _context.ParentChildren
            .AnyAsync(pc => pc.ParentId == parentId && pc.ChildId == childId);
        if (existing)
        {
            return BadRequest(new { message = "This parent-child relationship already exists" });
        }

        // Check for cycle (parent can't be their own ancestor)
        if (await WouldCreateCycle(parentId, childId))
        {
            return BadRequest(new { message = "This relationship would create a cycle in the family tree" });
        }

        // Check if child already has 2 biological parents
        var relationshipType = request?.RelationshipType ?? RelationshipType.Biological;
        if (relationshipType == RelationshipType.Biological)
        {
            var existingBioParents = await _context.ParentChildren
                .Include(pc => pc.Parent)
                .Where(pc => pc.ChildId == childId && pc.RelationshipType == RelationshipType.Biological)
                .ToListAsync();

            if (existingBioParents.Count >= 2)
            {
                return BadRequest(new { message = "A person can have at most 2 biological parents" });
            }

            var sameGenderParent = existingBioParents.FirstOrDefault(p => p.Parent.Sex == parent.Sex);
            if (sameGenderParent != null)
            {
                return BadRequest(new { message = $"This person already has a biological (parent.Sex.HasValue ? parent.Sex.Value.ToString().ToLower() : \"parent\")" });
            }
        }

        var parentChild = new ParentChild
        {
            Id = Guid.NewGuid(),
            ParentId = parentId,
            ChildId = childId,
            RelationshipType = relationshipType,
            Notes = request?.Notes,
            CreatedAt = DateTime.UtcNow
        };

        _context.ParentChildren.Add(parentChild);
        await _context.SaveChangesAsync();

        _logger.LogInformation("Parent-child relationship created: Parent {ParentId} -> Child {ChildId}", parentId, childId);

        return CreatedAtAction(nameof(GetParents), new { personId = childId }, new ParentChildResponse
        {
            Id = parentChild.Id,
            ParentId = parentId,
            ParentName = parent.PrimaryName,
            ParentSex = parent.Sex,
            ChildId = childId,
            ChildName = child.PrimaryName,
            ChildSex = child.Sex,
            RelationshipType = parentChild.RelationshipType,
            Notes = parentChild.Notes
        });
    }

    /// <summary>
    /// Add a child to a person
    /// </summary>
    [HttpPost("person/{parentId}/children/{childId}")]
    [Authorize(Roles = "Owner,Admin,Editor,Contributor,SuperAdmin")]
    public async Task<ActionResult<ParentChildResponse>> AddChild(
        Guid parentId,
        Guid childId,
        [FromBody] AddParentChildRequest? request = null)
    {
        // This is just a convenience endpoint that calls AddParent with swapped parameters
        return await AddParent(childId, parentId, request);
    }

    /// <summary>
    /// Update a parent-child relationship
    /// </summary>
    [HttpPut("{id}")]
    [Authorize(Roles = "Owner,Admin,Editor,SuperAdmin")]
    public async Task<ActionResult<ParentChildResponse>> UpdateRelationship(Guid id, UpdateParentChildRequest request)
    {
        var orgId = TryGetUserOrgId();
        if (orgId == null)
        {
            return BadRequest(new { message = "You must be a member of an organization to update relationships." });
        }

        var relationship = await _context.ParentChildren
            .Include(pc => pc.Parent)
            .Include(pc => pc.Child)
            .FirstOrDefaultAsync(pc => pc.Id == id &&
                (pc.Parent.OrgId == orgId || pc.Child.OrgId == orgId));

        if (relationship == null)
        {
            return NotFound(new { message = "Relationship not found" });
        }

        if (request.RelationshipType.HasValue)
            relationship.RelationshipType = request.RelationshipType.Value;
        if (request.Notes != null)
            relationship.Notes = request.Notes;

        await _context.SaveChangesAsync();

        _logger.LogInformation("Parent-child relationship updated: {RelationshipId}", id);

        return new ParentChildResponse
        {
            Id = relationship.Id,
            ParentId = relationship.ParentId,
            ParentName = relationship.Parent.PrimaryName,
            ParentSex = relationship.Parent.Sex,
            ChildId = relationship.ChildId,
            ChildName = relationship.Child.PrimaryName,
            ChildSex = relationship.Child.Sex,
            RelationshipType = relationship.RelationshipType,
            Notes = relationship.Notes
        };
    }

    /// <summary>
    /// Delete a parent-child relationship
    /// </summary>
    [HttpDelete("{id}")]
    [Authorize(Roles = "Owner,Admin,Editor,SuperAdmin")]
    public async Task<IActionResult> DeleteRelationship(Guid id)
    {
        var orgId = TryGetUserOrgId();
        if (orgId == null)
        {
            return BadRequest(new { message = "You must be a member of an organization to delete relationships." });
        }

        var relationship = await _context.ParentChildren
            .Include(pc => pc.Parent)
            .Include(pc => pc.Child)
            .FirstOrDefaultAsync(pc => pc.Id == id &&
                (pc.Parent.OrgId == orgId || pc.Child.OrgId == orgId));

        if (relationship == null)
        {
            return NotFound(new { message = "Relationship not found" });
        }

        _context.ParentChildren.Remove(relationship);
        await _context.SaveChangesAsync();

        _logger.LogInformation("Parent-child relationship deleted: {RelationshipId}", id);

        return NoContent();
    }

    /// <summary>
    /// Remove a specific parent from a child
    /// </summary>
    [HttpDelete("person/{childId}/parents/{parentId}")]
    [Authorize(Roles = "Owner,Admin,Editor,SuperAdmin")]
    public async Task<IActionResult> RemoveParent(Guid childId, Guid parentId)
    {
        var orgId = TryGetUserOrgId();
        if (orgId == null)
        {
            return BadRequest(new { message = "You must be a member of an organization to remove relationships." });
        }

        var relationship = await _context.ParentChildren
            .Include(pc => pc.Parent)
            .Include(pc => pc.Child)
            .FirstOrDefaultAsync(pc => pc.ParentId == parentId && pc.ChildId == childId &&
                (pc.Parent.OrgId == orgId || pc.Child.OrgId == orgId));

        if (relationship == null)
        {
            return NotFound(new { message = "Relationship not found" });
        }

        _context.ParentChildren.Remove(relationship);
        await _context.SaveChangesAsync();

        _logger.LogInformation("Parent removed: Parent {ParentId} from Child {ChildId}", parentId, childId);

        return NoContent();
    }

    /// <summary>
    /// Remove a specific child from a parent
    /// </summary>
    [HttpDelete("person/{parentId}/children/{childId}")]
    [Authorize(Roles = "Owner,Admin,Editor,SuperAdmin")]
    public async Task<IActionResult> RemoveChild(Guid parentId, Guid childId)
    {
        return await RemoveParent(childId, parentId);
    }

    /// <summary>
    /// Get siblings of a person
    /// </summary>
    [HttpGet("person/{personId}/siblings")]
    public async Task<ActionResult<List<SiblingResponse>>> GetSiblings(Guid personId)
    {
        var userId = GetUserId();
        _logger.LogInformation("GetSiblings called - PersonId: {PersonId}, UserId: {UserId}, SystemRole: {SystemRole}",
            personId, userId, GetSystemRole());

        // Find the person and check if user has access to their tree
        var person = await _context.People
            .Include(p => p.Org)
            .FirstOrDefaultAsync(p => p.Id == personId);

        if (person == null)
        {
            return NotFound(new { message = "Person not found" });
        }

        // Check if user has access to this tree (including SuperAdmin/Admin)
        var hasAccess = await HasTreeAccessAsync(person.OrgId);

        if (!hasAccess)
        {
            _logger.LogWarning("GetSiblings - ACCESS DENIED for UserId {UserId} to PersonId {PersonId} (OrgId: {OrgId})",
                userId, personId, person.OrgId);
            return Forbid();
        }

        // Get all parents of this person
        var parentIds = await _context.ParentChildren
            .Where(pc => pc.ChildId == personId)
            .Select(pc => pc.ParentId)
            .ToListAsync();

        if (!parentIds.Any())
        {
            return new List<SiblingResponse>();
        }

        // Get all children of these parents (excluding the person themselves)
        var siblings = await _context.ParentChildren
            .Include(pc => pc.Child)
            .Where(pc => parentIds.Contains(pc.ParentId) && pc.ChildId != personId)
            .Select(pc => new { pc.Child, pc.ParentId })
            .ToListAsync();

        // Group by child and determine sibling type
        var siblingGroups = siblings
            .GroupBy(s => s.Child.Id)
            .Select(g => new SiblingResponse
            {
                PersonId = g.Key,
                PersonName = g.First().Child.PrimaryName,
                PersonSex = g.First().Child.Sex,
                SharedParentCount = g.Select(x => x.ParentId).Distinct().Count(),
                IsFullSibling = g.Select(x => x.ParentId).Distinct().Count() == parentIds.Count && parentIds.Count >= 2,
                IsHalfSibling = g.Select(x => x.ParentId).Distinct().Count() < parentIds.Count || parentIds.Count < 2
            })
            .ToList();

        return siblingGroups;
    }

    /// <summary>
    /// Check if adding a parent-child relationship would create a cycle
    /// </summary>
    private async Task<bool> WouldCreateCycle(Guid parentId, Guid childId)
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
                .ToListAsync();

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

// DTOs for ParentChild
public class ParentChildResponse
{
    public Guid Id { get; set; }
    public Guid ParentId { get; set; }
    public string? ParentName { get; set; }
    public Sex? ParentSex { get; set; }
    public Guid ChildId { get; set; }
    public string? ChildName { get; set; }
    public Sex? ChildSex { get; set; }
    public RelationshipType RelationshipType { get; set; }
    public string? Notes { get; set; }
}

public class AddParentChildRequest
{
    public RelationshipType? RelationshipType { get; set; }
    public string? Notes { get; set; }
}

public class UpdateParentChildRequest
{
    public RelationshipType? RelationshipType { get; set; }
    public string? Notes { get; set; }
}

public class SiblingResponse
{
    public Guid PersonId { get; set; }
    public string? PersonName { get; set; }
    public Sex? PersonSex { get; set; }
    public int SharedParentCount { get; set; }
    public bool IsFullSibling { get; set; }
    public bool IsHalfSibling { get; set; }
}