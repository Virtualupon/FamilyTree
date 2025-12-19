using Microsoft.AspNetCore.Authorization;
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
public class TreeController : ControllerBase
{
    private readonly ApplicationDbContext _context;
    private readonly ILogger<TreeController> _logger;

    public TreeController(ApplicationDbContext context, ILogger<TreeController> logger)
    {
        _context = context;
        _logger = logger;
    }

    #region Helper Methods

    private Guid? TryGetUserOrgId()
    {
        var orgIdClaim = User.FindFirst("orgId")?.Value;
        if (string.IsNullOrEmpty(orgIdClaim) || !Guid.TryParse(orgIdClaim, out var orgId))
        {
            return null;
        }
        return orgId;
    }

    private string? GetSystemRole()
    {
        return User.FindFirst("systemRole")?.Value;
    }

    private bool IsSuperAdmin()
    {
        return GetSystemRole() == "SuperAdmin";
    }

    private bool IsAdmin()
    {
        return GetSystemRole() == "Admin";
    }

    private long? GetUserId()
    {
        var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        if (long.TryParse(userIdClaim, out var userId))
        {
            return userId;
        }
        return null;
    }

    private async Task<Guid?> ResolveOrgIdAsync(Guid? requestedTreeId)
    {
        var systemRole = GetSystemRole();
        var userId = GetUserId();
        var tokenOrgId = TryGetUserOrgId();

        _logger.LogInformation("TreeController.ResolveOrgIdAsync - SystemRole: {SystemRole}, UserId: {UserId}, TokenOrgId: {TokenOrgId}, RequestedTreeId: {RequestedTreeId}",
            systemRole, userId, tokenOrgId, requestedTreeId);

        // SuperAdmin can access any tree
        if (systemRole == "SuperAdmin")
        {
            if (requestedTreeId.HasValue)
            {
                var treeExists = await _context.Orgs.AnyAsync(o => o.Id == requestedTreeId.Value);
                if (treeExists)
                {
                    _logger.LogInformation("SuperAdmin accessing tree {TreeId}", requestedTreeId.Value);
                    return requestedTreeId.Value;
                }
            }
            return tokenOrgId;
        }

        // Admin can access assigned trees or member trees
        if (systemRole == "Admin" && userId.HasValue)
        {
            if (requestedTreeId.HasValue)
            {
                var isAssigned = await _context.AdminTreeAssignments
                    .AnyAsync(a => a.UserId == userId.Value && a.TreeId == requestedTreeId.Value);

                if (isAssigned)
                {
                    _logger.LogInformation("Admin accessing assigned tree {TreeId}", requestedTreeId.Value);
                    return requestedTreeId.Value;
                }

                var isMember = await _context.OrgUsers
                    .AnyAsync(ou => ou.OrgId == requestedTreeId.Value && ou.UserId == userId.Value);

                if (isMember)
                {
                    _logger.LogInformation("Admin accessing member tree {TreeId}", requestedTreeId.Value);
                    return requestedTreeId.Value;
                }

                _logger.LogWarning("Admin {UserId} attempted to access tree {TreeId} but is not assigned or member",
                    userId.Value, requestedTreeId.Value);
            }
            return tokenOrgId;
        }

        // Regular user: use token orgId
        return tokenOrgId;
    }

    #endregion

    #region API Endpoints

    /// <summary>
    /// Get pedigree (ancestors) view for a person - returns hierarchical tree
    /// </summary>
    [HttpPost("pedigree")]
    public async Task<ActionResult<TreePersonNode>> GetPedigree([FromBody] TreeViewRequest request)
    {
        var orgId = await ResolveOrgIdAsync(request.TreeId);
        if (orgId == null)
        {
            return BadRequest(new { message = "Unable to determine tree. Please specify a treeId or ensure you are a member of a tree." });
        }

        var person = await _context.People
            .Include(p => p.Names)
            .Include(p => p.BirthPlace)
            .Include(p => p.DeathPlace)
            .FirstOrDefaultAsync(p => p.Id == request.PersonId && p.OrgId == orgId);

        if (person == null)
        {
            return NotFound(new { message = "Person not found" });
        }

        var generations = request.Generations ?? 4;
        var visited = new HashSet<Guid>();

        var rootNode = await BuildPedigreeHierarchy(person, orgId.Value, 0, generations, visited);

        return rootNode;
    }

    /// <summary>
    /// Get descendants view for a person - returns hierarchical tree
    /// </summary>
    [HttpPost("descendants")]
    public async Task<ActionResult<TreePersonNode>> GetDescendants([FromBody] TreeViewRequest request)
    {
        var orgId = await ResolveOrgIdAsync(request.TreeId);
        if (orgId == null)
        {
            return BadRequest(new { message = "Unable to determine tree. Please specify a treeId or ensure you are a member of a tree." });
        }

        var person = await _context.People
            .Include(p => p.Names)
            .Include(p => p.BirthPlace)
            .Include(p => p.DeathPlace)
            .FirstOrDefaultAsync(p => p.Id == request.PersonId && p.OrgId == orgId);

        if (person == null)
        {
            return NotFound(new { message = "Person not found" });
        }

        var generations = request.Generations ?? 4;
        var visited = new HashSet<Guid>();

        var rootNode = await BuildDescendantsHierarchy(person, orgId.Value, 0, generations, visited);

        return rootNode;
    }

    /// <summary>
    /// Get hourglass view (both ancestors and descendants) for a person
    /// </summary>
    [HttpPost("hourglass")]
    public async Task<ActionResult<TreePersonNode>> GetHourglass([FromBody] TreeViewRequest request)
    {
        var orgId = await ResolveOrgIdAsync(request.TreeId);
        if (orgId == null)
        {
            return BadRequest(new { message = "Unable to determine tree. Please specify a treeId or ensure you are a member of a tree." });
        }

        var person = await _context.People
            .Include(p => p.Names)
            .Include(p => p.BirthPlace)
            .Include(p => p.DeathPlace)
            .FirstOrDefaultAsync(p => p.Id == request.PersonId && p.OrgId == orgId);

        if (person == null)
        {
            return NotFound(new { message = "Person not found" });
        }

        var generations = request.Generations ?? 3;

        // Build ancestors
        var visitedAncestors = new HashSet<Guid>();
        var rootNode = await BuildPedigreeHierarchy(person, orgId.Value, 0, generations, visitedAncestors);

        // Build descendants and add to root
        var visitedDescendants = new HashSet<Guid> { person.Id }; // Skip root since already added
        var descendants = await GetChildrenRecursive(person.Id, orgId.Value, 0, generations, visitedDescendants);
        rootNode.Children = descendants;
        rootNode.HasMoreDescendants = descendants.Count > 0 && generations > 0;

        return rootNode;
    }

    /// <summary>
    /// Get family group (person with spouse(s) and children)
    /// </summary>
    [HttpGet("family/{personId}")]
    public async Task<ActionResult<FamilyGroupResponse>> GetFamilyGroup(Guid personId, [FromQuery] Guid? treeId)
    {
        var orgId = await ResolveOrgIdAsync(treeId);
        if (orgId == null)
        {
            return BadRequest(new { message = "Unable to determine tree. Please specify a treeId or ensure you are a member of a tree." });
        }

        var person = await _context.People
            .Include(p => p.Names)
            .Include(p => p.BirthPlace)
            .Include(p => p.DeathPlace)
            .FirstOrDefaultAsync(p => p.Id == personId && p.OrgId == orgId);

        if (person == null)
        {
            return NotFound(new { message = "Person not found" });
        }

        // Get all unions (marriages) this person is part of
        var unions = await _context.UnionMembers
            .Include(um => um.Union)
            .ThenInclude(u => u.Members)
            .ThenInclude(um => um.Person)
            .ThenInclude(p => p.Names)
            .Include(um => um.Union)
            .ThenInclude(u => u.Members)
            .ThenInclude(um => um.Person)
            .ThenInclude(p => p.BirthPlace)
            .Include(um => um.Union)
            .ThenInclude(u => u.Members)
            .ThenInclude(um => um.Person)
            .ThenInclude(p => p.DeathPlace)
            .Where(um => um.PersonId == personId && um.Union.OrgId == orgId)
            .Select(um => um.Union)
            .ToListAsync();

        // Get all children
        var children = await _context.ParentChildren
            .Include(pc => pc.Child)
            .ThenInclude(c => c.Names)
            .Include(pc => pc.Child)
            .ThenInclude(c => c.BirthPlace)
            .Include(pc => pc.Child)
            .ThenInclude(c => c.DeathPlace)
            .Where(pc => pc.ParentId == personId)
            .Select(pc => pc.Child)
            .ToListAsync();

        // Get parents
        var parents = await _context.ParentChildren
            .Include(pc => pc.Parent)
            .ThenInclude(p => p.Names)
            .Include(pc => pc.Parent)
            .ThenInclude(p => p.BirthPlace)
            .Include(pc => pc.Parent)
            .ThenInclude(p => p.DeathPlace)
            .Where(pc => pc.ChildId == personId)
            .Select(pc => pc.Parent)
            .ToListAsync();

        return new FamilyGroupResponse
        {
            Person = MapToTreePersonNode(person),
            Parents = parents.Select(p => MapToTreePersonNode(p)).ToList(),
            Spouses = unions.SelectMany(u => u.Members
                .Where(m => m.PersonId != personId)
                .Select(m => new SpouseInfo
                {
                    Person = MapToTreePersonNode(m.Person),
                    UnionId = u.Id,
                    UnionType = u.Type,
                    StartDate = u.StartDate,
                    EndDate = u.EndDate
                })).ToList(),
            Children = children.Select(c => MapToTreePersonNode(c)).ToList()
        };
    }

    /// <summary>
    /// Calculate relationship between two people
    /// </summary>
    [HttpGet("relationship")]
    public async Task<ActionResult<RelationshipResponse>> GetRelationship(
        [FromQuery] Guid person1Id,
        [FromQuery] Guid person2Id,
        [FromQuery] Guid? treeId)
    {
        var orgId = await ResolveOrgIdAsync(treeId);
        if (orgId == null)
        {
            return BadRequest(new { message = "Unable to determine tree." });
        }

        var person1 = await _context.People.FirstOrDefaultAsync(p => p.Id == person1Id && p.OrgId == orgId);
        var person2 = await _context.People.FirstOrDefaultAsync(p => p.Id == person2Id && p.OrgId == orgId);

        if (person1 == null || person2 == null)
        {
            return NotFound(new { message = "One or both persons not found" });
        }

        // Find common ancestors using BFS
        var ancestors1 = await GetAllAncestors(person1Id, new HashSet<Guid>());
        var ancestors2 = await GetAllAncestors(person2Id, new HashSet<Guid>());

        var commonAncestors = ancestors1.Keys.Intersect(ancestors2.Keys).ToList();

        if (commonAncestors.Count == 0)
        {
            return new RelationshipResponse
            {
                Person1Id = person1Id,
                Person2Id = person2Id,
                RelationshipType = "No blood relation found",
                Description = "These individuals do not share any common ancestors in the tree."
            };
        }

        // Find closest common ancestor
        var closestAncestor = commonAncestors
            .OrderBy(a => ancestors1[a] + ancestors2[a])
            .First();

        var gen1 = ancestors1[closestAncestor];
        var gen2 = ancestors2[closestAncestor];

        var (relType, description) = CalculateRelationshipType(gen1, gen2);

        return new RelationshipResponse
        {
            Person1Id = person1Id,
            Person2Id = person2Id,
            RelationshipType = relType,
            Description = description,
            GenerationsFromCommonAncestor1 = gen1,
            GenerationsFromCommonAncestor2 = gen2,
            CommonAncestors = commonAncestors
        };
    }

    #endregion

    #region Hierarchy Building Methods

    private async Task<TreePersonNode> BuildPedigreeHierarchy(
        Person person,
        Guid orgId,
        int currentGen,
        int maxGen,
        HashSet<Guid> visited)
    {
        var node = MapToTreePersonNode(person);

        if (visited.Contains(person.Id))
        {
            return node;
        }
        visited.Add(person.Id);

        // Get parents
        if (currentGen < maxGen)
        {
            var parentRelations = await _context.ParentChildren
                .Include(pc => pc.Parent)
                .ThenInclude(p => p.Names)
                .Include(pc => pc.Parent)
                .ThenInclude(p => p.BirthPlace)
                .Include(pc => pc.Parent)
                .ThenInclude(p => p.DeathPlace)
                .Where(pc => pc.ChildId == person.Id)
                .ToListAsync();

            var parentNodes = new List<TreePersonNode>();
            foreach (var relation in parentRelations)
            {
                var parentNode = await BuildPedigreeHierarchy(
                    relation.Parent, orgId, currentGen + 1, maxGen, visited);
                parentNodes.Add(parentNode);
            }
            node.Parents = parentNodes;
            node.HasMoreAncestors = parentNodes.Count > 0 && currentGen + 1 >= maxGen;
        }
        else
        {
            // Check if there are more ancestors beyond maxGen
            var hasMoreParents = await _context.ParentChildren
                .AnyAsync(pc => pc.ChildId == person.Id);
            node.HasMoreAncestors = hasMoreParents;
        }

        // Get unions/spouses for this person
        node.Unions = await GetUnionsForPerson(person.Id, orgId);

        return node;
    }

    private async Task<TreePersonNode> BuildDescendantsHierarchy(
        Person person,
        Guid orgId,
        int currentGen,
        int maxGen,
        HashSet<Guid> visited)
    {
        var node = MapToTreePersonNode(person);

        if (visited.Contains(person.Id))
        {
            return node;
        }
        visited.Add(person.Id);

        // Get children
        if (currentGen < maxGen)
        {
            node.Children = await GetChildrenRecursive(person.Id, orgId, currentGen, maxGen, visited);
            node.HasMoreDescendants = node.Children.Count > 0 && currentGen + 1 >= maxGen;
        }
        else
        {
            // Check if there are more descendants beyond maxGen
            var hasMoreChildren = await _context.ParentChildren
                .AnyAsync(pc => pc.ParentId == person.Id);
            node.HasMoreDescendants = hasMoreChildren;
        }

        // Get unions/spouses for this person
        node.Unions = await GetUnionsForPerson(person.Id, orgId);

        return node;
    }

    private async Task<List<TreePersonNode>> GetChildrenRecursive(
        Guid parentId,
        Guid orgId,
        int currentGen,
        int maxGen,
        HashSet<Guid> visited)
    {
        var childRelations = await _context.ParentChildren
            .Include(pc => pc.Child)
            .ThenInclude(c => c.Names)
            .Include(pc => pc.Child)
            .ThenInclude(c => c.BirthPlace)
            .Include(pc => pc.Child)
            .ThenInclude(c => c.DeathPlace)
            .Where(pc => pc.ParentId == parentId)
            .ToListAsync();

        var childNodes = new List<TreePersonNode>();
        foreach (var relation in childRelations)
        {
            if (visited.Contains(relation.Child.Id))
            {
                continue;
            }

            var childNode = await BuildDescendantsHierarchy(
                relation.Child, orgId, currentGen + 1, maxGen, visited);
            childNodes.Add(childNode);
        }

        return childNodes;
    }

    private async Task<List<TreeUnionNode>> GetUnionsForPerson(Guid personId, Guid orgId)
    {
        var unions = await _context.UnionMembers
            .Include(um => um.Union)
            .ThenInclude(u => u.Members)
            .ThenInclude(um => um.Person)
            .ThenInclude(p => p.Names)
            .Include(um => um.Union)
            .ThenInclude(u => u.Members)
            .ThenInclude(um => um.Person)
            .ThenInclude(p => p.BirthPlace)
            .Include(um => um.Union)
            .ThenInclude(u => u.Members)
            .ThenInclude(um => um.Person)
            .ThenInclude(p => p.DeathPlace)
            .Where(um => um.PersonId == personId && um.Union.OrgId == orgId)
            .Select(um => um.Union)
            .Distinct()
            .ToListAsync();

        return unions.Select(u => new TreeUnionNode
        {
            Id = u.Id,
            Type = u.Type,
            StartDate = u.StartDate,
            EndDate = u.EndDate,
            Partners = u.Members
                .Where(m => m.PersonId != personId)
                .Select(m => MapToTreePersonNode(m.Person))
                .ToList(),
            Children = new List<TreePersonNode>() // Children are handled in parent-child relationships
        }).ToList();
    }

    #endregion

    #region Mapping Methods

    private TreePersonNode MapToTreePersonNode(Person person)
    {
        return new TreePersonNode
        {
            Id = person.Id,
            PrimaryName = person.PrimaryName ?? "Unknown",
            Sex = person.Sex,
            BirthDate = person.BirthDate,
            BirthPlace = person.BirthPlace?.Name,
            DeathDate = person.DeathDate,
            DeathPlace = person.DeathPlace?.Name,
            IsLiving = person.DeathDate == null,
            Parents = new List<TreePersonNode>(),
            Children = new List<TreePersonNode>(),
            Unions = new List<TreeUnionNode>(),
            HasMoreAncestors = false,
            HasMoreDescendants = false
        };
    }

    #endregion

    #region Relationship Calculation

    private async Task<Dictionary<Guid, int>> GetAllAncestors(Guid personId, HashSet<Guid> visited)
    {
        var ancestors = new Dictionary<Guid, int>();
        var queue = new Queue<(Guid Id, int Generation)>();
        queue.Enqueue((personId, 0));

        while (queue.Count > 0)
        {
            var (currentId, generation) = queue.Dequeue();

            if (visited.Contains(currentId))
            {
                continue;
            }
            visited.Add(currentId);

            if (generation > 0)
            {
                if (!ancestors.ContainsKey(currentId) || ancestors[currentId] > generation)
                {
                    ancestors[currentId] = generation;
                }
            }

            var parents = await _context.ParentChildren
                .Where(pc => pc.ChildId == currentId)
                .Select(pc => pc.ParentId)
                .ToListAsync();

            foreach (var parentId in parents)
            {
                queue.Enqueue((parentId, generation + 1));
            }
        }

        return ancestors;
    }

    private (string Type, string Description) CalculateRelationshipType(int gen1, int gen2)
    {
        if (gen1 == 0)
        {
            return gen2 switch
            {
                1 => ("Parent", "Parent"),
                2 => ("Grandparent", "Grandparent"),
                3 => ("Great-Grandparent", "Great-Grandparent"),
                _ => ($"Ancestor ({gen2}x Great-Grandparent)", $"{gen2 - 2}x Great-Grandparent")
            };
        }

        if (gen2 == 0)
        {
            return gen1 switch
            {
                1 => ("Child", "Child"),
                2 => ("Grandchild", "Grandchild"),
                3 => ("Great-Grandchild", "Great-Grandchild"),
                _ => ($"Descendant ({gen1}x Great-Grandchild)", $"{gen1 - 2}x Great-Grandchild")
            };
        }

        if (gen1 == 1 && gen2 == 1)
        {
            return ("Sibling", "Sibling");
        }

        if (gen1 == 1)
        {
            return gen2 switch
            {
                2 => ("Aunt/Uncle", "Aunt or Uncle"),
                3 => ("Great-Aunt/Uncle", "Great-Aunt or Great-Uncle"),
                _ => ($"Ancestor's Sibling", $"{gen2 - 2}x Great-Aunt/Uncle")
            };
        }

        if (gen2 == 1)
        {
            return gen1 switch
            {
                2 => ("Niece/Nephew", "Niece or Nephew"),
                3 => ("Great-Niece/Nephew", "Great-Niece or Great-Nephew"),
                _ => ($"Sibling's Descendant", $"{gen1 - 2}x Great-Niece/Nephew")
            };
        }

        var cousinDegree = Math.Min(gen1, gen2) - 1;
        var removed = Math.Abs(gen1 - gen2);

        if (removed == 0)
        {
            return cousinDegree switch
            {
                1 => ("First Cousin", "First Cousin"),
                2 => ("Second Cousin", "Second Cousin"),
                3 => ("Third Cousin", "Third Cousin"),
                _ => ($"{cousinDegree}th Cousin", $"{cousinDegree}th Cousin")
            };
        }

        var ordinal = cousinDegree switch
        {
            1 => "First",
            2 => "Second",
            3 => "Third",
            _ => $"{cousinDegree}th"
        };

        return ($"{ordinal} Cousin {removed}x Removed", $"{ordinal} Cousin, {removed} times removed");
    }

    #endregion
}

#region DTOs

public class TreeViewRequest
{
    public Guid PersonId { get; set; }
    public Guid? TreeId { get; set; }
    public int? Generations { get; set; }
}

/// <summary>
/// Hierarchical tree node matching frontend TreePersonNode interface
/// </summary>
public class TreePersonNode
{
    public Guid Id { get; set; }
    public string PrimaryName { get; set; } = "Unknown";
    public Sex Sex { get; set; } = Sex.Unknown;
    public DateTime? BirthDate { get; set; }
    public string? BirthPlace { get; set; }
    public DateTime? DeathDate { get; set; }
    public string? DeathPlace { get; set; }
    public bool IsLiving { get; set; }
    public string? ThumbnailUrl { get; set; }
    public List<TreePersonNode> Parents { get; set; } = new();
    public List<TreePersonNode> Children { get; set; } = new();
    public List<TreeUnionNode> Unions { get; set; } = new();
    public bool HasMoreAncestors { get; set; }
    public bool HasMoreDescendants { get; set; }
}

public class TreeUnionNode
{
    public Guid Id { get; set; }
    public UnionType Type { get; set; }
    public DateTime? StartDate { get; set; }
    public DateTime? EndDate { get; set; }
    public string? StartPlace { get; set; }
    public List<TreePersonNode> Partners { get; set; } = new();
    public List<TreePersonNode> Children { get; set; } = new();
}

public class FamilyGroupResponse
{
    public TreePersonNode Person { get; set; } = null!;
    public List<TreePersonNode> Parents { get; set; } = new();
    public List<SpouseInfo> Spouses { get; set; } = new();
    public List<TreePersonNode> Children { get; set; } = new();
}

public class SpouseInfo
{
    public TreePersonNode Person { get; set; } = null!;
    public Guid UnionId { get; set; }
    public UnionType UnionType { get; set; }
    public DateTime? StartDate { get; set; }
    public DateTime? EndDate { get; set; }
}

public class RelationshipResponse
{
    public Guid Person1Id { get; set; }
    public Guid Person2Id { get; set; }
    public string RelationshipType { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public int? GenerationsFromCommonAncestor1 { get; set; }
    public int? GenerationsFromCommonAncestor2 { get; set; }
    public List<Guid> CommonAncestors { get; set; } = new();
}

#endregion