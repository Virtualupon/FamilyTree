// File: Services/TreeViewService.cs
using AutoMapper;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using FamilyTreeApi.DTOs;
using FamilyTreeApi.Models;
using FamilyTreeApi.Models.Enums;
using FamilyTreeApi.Repositories;

namespace FamilyTreeApi.Services;

/// <summary>
/// Tree view service implementation containing all tree visualization business logic.
/// Handles pedigree, descendants, hourglass views, family groups, and relationship calculations.
/// Uses repositories for data access and AutoMapper for DTO mapping.
/// Services do NOT reference DbContext directly.
/// </summary>
public class TreeViewService : ITreeViewService
{
    private readonly IPersonRepository _personRepository;
    private readonly IUnionRepository _unionRepository;
    private readonly IOrgRepository _orgRepository;
    private readonly IMapper _mapper;
    private readonly ILogger<TreeViewService> _logger;

    public TreeViewService(
        IPersonRepository personRepository,
        IUnionRepository unionRepository,
        IOrgRepository orgRepository,
        IMapper mapper,
        ILogger<TreeViewService> logger)
    {
        _personRepository = personRepository;
        _unionRepository = unionRepository;
        _orgRepository = orgRepository;
        _mapper = mapper;
        _logger = logger;
    }

    // ============================================================================
    // PUBLIC API METHODS
    // ============================================================================

    /// <summary>
    /// Get pedigree (ancestors) view for a person - returns hierarchical tree
    /// </summary>
    public async Task<ServiceResult<TreePersonNode>> GetPedigreeAsync(
        TreeViewRequest request,
        UserContext userContext,
        CancellationToken cancellationToken = default)
    {
        try
        {
            var (orgId, error) = await ResolveOrgIdAsync(request.TreeId, userContext, cancellationToken);
            if (orgId == null)
            {
                return ServiceResult<TreePersonNode>.Failure(error!);
            }

            var person = await _personRepository.QueryNoTracking()
                .Include(p => p.Names)
                .Include(p => p.BirthPlace)
                .Include(p => p.DeathPlace)
                .FirstOrDefaultAsync(p => p.Id == request.PersonId && p.OrgId == orgId, cancellationToken);

            if (person == null)
            {
                return ServiceResult<TreePersonNode>.NotFound("Person not found");
            }

            var generations = request.Generations ?? 4;
            var visited = new HashSet<Guid>();

            var rootNode = await BuildPedigreeHierarchy(person, orgId.Value, 0, generations, visited, cancellationToken);

            return ServiceResult<TreePersonNode>.Success(rootNode);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting pedigree for person {PersonId} in tree {TreeId}",
                request.PersonId, request.TreeId);
            return ServiceResult<TreePersonNode>.InternalError("Error loading pedigree");
        }
    }

    /// <summary>
    /// Get descendants view for a person - returns hierarchical tree
    /// </summary>
    public async Task<ServiceResult<TreePersonNode>> GetDescendantsAsync(
        TreeViewRequest request,
        UserContext userContext,
        CancellationToken cancellationToken = default)
    {
        try
        {
            var (orgId, error) = await ResolveOrgIdAsync(request.TreeId, userContext, cancellationToken);
            if (orgId == null)
            {
                return ServiceResult<TreePersonNode>.Failure(error!);
            }

            var person = await _personRepository.QueryNoTracking()
                .Include(p => p.Names)
                .Include(p => p.BirthPlace)
                .Include(p => p.DeathPlace)
                .FirstOrDefaultAsync(p => p.Id == request.PersonId && p.OrgId == orgId, cancellationToken);

            if (person == null)
            {
                return ServiceResult<TreePersonNode>.NotFound("Person not found");
            }

            var generations = request.Generations ?? 4;
            var visited = new HashSet<Guid>();

            var rootNode = await BuildDescendantsHierarchy(person, orgId.Value, 0, generations, visited, cancellationToken);

            return ServiceResult<TreePersonNode>.Success(rootNode);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting descendants for person {PersonId} in tree {TreeId}",
                request.PersonId, request.TreeId);
            return ServiceResult<TreePersonNode>.InternalError("Error loading descendants");
        }
    }

    /// <summary>
    /// Get hourglass view (both ancestors and descendants) for a person
    /// </summary>
    public async Task<ServiceResult<TreePersonNode>> GetHourglassAsync(
        TreeViewRequest request,
        UserContext userContext,
        CancellationToken cancellationToken = default)
    {
        try
        {
            var (orgId, error) = await ResolveOrgIdAsync(request.TreeId, userContext, cancellationToken);
            if (orgId == null)
            {
                return ServiceResult<TreePersonNode>.Failure(error!);
            }

            var person = await _personRepository.QueryNoTracking()
                .Include(p => p.Names)
                .Include(p => p.BirthPlace)
                .Include(p => p.DeathPlace)
                .FirstOrDefaultAsync(p => p.Id == request.PersonId && p.OrgId == orgId, cancellationToken);

            if (person == null)
            {
                return ServiceResult<TreePersonNode>.NotFound("Person not found");
            }

            var generations = request.Generations ?? 3;

            // Build ancestors
            var visitedAncestors = new HashSet<Guid>();
            var rootNode = await BuildPedigreeHierarchy(person, orgId.Value, 0, generations, visitedAncestors, cancellationToken);

            // Build descendants and add to root
            var visitedDescendants = new HashSet<Guid> { person.Id }; // Skip root since already added
            var descendants = await GetChildrenRecursive(person.Id, orgId.Value, 0, generations, visitedDescendants, cancellationToken);
            rootNode.Children = descendants;
            rootNode.HasMoreDescendants = descendants.Count > 0 && generations > 0;

            return ServiceResult<TreePersonNode>.Success(rootNode);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting hourglass view for person {PersonId} in tree {TreeId}",
                request.PersonId, request.TreeId);
            return ServiceResult<TreePersonNode>.InternalError("Error loading hourglass view");
        }
    }

    /// <summary>
    /// Get family group (person with spouse(s) and children)
    /// </summary>
    public async Task<ServiceResult<FamilyGroupResponse>> GetFamilyGroupAsync(
        Guid personId,
        Guid? treeId,
        UserContext userContext,
        CancellationToken cancellationToken = default)
    {
        try
        {
            var (orgId, error) = await ResolveOrgIdAsync(treeId, userContext, cancellationToken);
            if (orgId == null)
            {
                return ServiceResult<FamilyGroupResponse>.Failure(error!);
            }

            var person = await _personRepository.QueryNoTracking()
                .Include(p => p.Names)
                .Include(p => p.BirthPlace)
                .Include(p => p.DeathPlace)
                .FirstOrDefaultAsync(p => p.Id == personId && p.OrgId == orgId, cancellationToken);

            if (person == null)
            {
                return ServiceResult<FamilyGroupResponse>.NotFound("Person not found");
            }

            // Get all unions (marriages) this person is part of
            var unions = await _unionRepository.QueryNoTracking()
                .Include(u => u.Members)
                .ThenInclude(um => um.Person)
                .ThenInclude(p => p.Names)
                .Include(u => u.Members)
                .ThenInclude(um => um.Person)
                .ThenInclude(p => p.BirthPlace)
                .Include(u => u.Members)
                .ThenInclude(um => um.Person)
                .ThenInclude(p => p.DeathPlace)
                .Where(u => u.OrgId == orgId && u.Members.Any(um => um.PersonId == personId))
                .ToListAsync(cancellationToken);

            // Get all children
            var children = await _personRepository.QueryNoTracking()
                .Where(p => p.AsChild.Any(pc => pc.ParentId == personId))
                .Include(p => p.Names)
                .Include(p => p.BirthPlace)
                .Include(p => p.DeathPlace)
                .ToListAsync(cancellationToken);

            // Get parents
            var parents = await _personRepository.QueryNoTracking()
                .Where(p => p.AsParent.Any(pc => pc.ChildId == personId))
                .Include(p => p.Names)
                .Include(p => p.BirthPlace)
                .Include(p => p.DeathPlace)
                .ToListAsync(cancellationToken);

            var response = new FamilyGroupResponse
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

            return ServiceResult<FamilyGroupResponse>.Success(response);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting family group for person {PersonId} in tree {TreeId}",
                personId, treeId);
            return ServiceResult<FamilyGroupResponse>.InternalError("Error loading family group");
        }
    }

    /// <summary>
    /// Calculate relationship between two people
    /// </summary>
    public async Task<ServiceResult<RelationshipResponse>> GetRelationshipAsync(
        Guid person1Id,
        Guid person2Id,
        Guid? treeId,
        UserContext userContext,
        CancellationToken cancellationToken = default)
    {
        try
        {
            var (orgId, error) = await ResolveOrgIdAsync(treeId, userContext, cancellationToken);
            if (orgId == null)
            {
                return ServiceResult<RelationshipResponse>.Failure(error!);
            }

            var person1 = await _personRepository.FirstOrDefaultAsync(
                p => p.Id == person1Id && p.OrgId == orgId, cancellationToken);
            var person2 = await _personRepository.FirstOrDefaultAsync(
                p => p.Id == person2Id && p.OrgId == orgId, cancellationToken);

            if (person1 == null || person2 == null)
            {
                return ServiceResult<RelationshipResponse>.NotFound("One or both persons not found");
            }

            // Find common ancestors using BFS
            var ancestors1 = await GetAllAncestors(person1Id, new HashSet<Guid>(), cancellationToken);
            var ancestors2 = await GetAllAncestors(person2Id, new HashSet<Guid>(), cancellationToken);

            var commonAncestors = ancestors1.Keys.Intersect(ancestors2.Keys).ToList();

            if (commonAncestors.Count == 0)
            {
                var response = new RelationshipResponse
                {
                    Person1Id = person1Id,
                    Person2Id = person2Id,
                    RelationshipType = "No blood relation found",
                    Description = "These individuals do not share any common ancestors in the tree."
                };
                return ServiceResult<RelationshipResponse>.Success(response);
            }

            // Find closest common ancestor
            var closestAncestor = commonAncestors
                .OrderBy(a => ancestors1[a] + ancestors2[a])
                .First();

            var gen1 = ancestors1[closestAncestor];
            var gen2 = ancestors2[closestAncestor];

            var (relType, description) = CalculateRelationshipType(gen1, gen2);

            var relationshipResponse = new RelationshipResponse
            {
                Person1Id = person1Id,
                Person2Id = person2Id,
                RelationshipType = relType,
                Description = description,
                GenerationsFromCommonAncestor1 = gen1,
                GenerationsFromCommonAncestor2 = gen2,
                CommonAncestors = commonAncestors
            };

            return ServiceResult<RelationshipResponse>.Success(relationshipResponse);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error calculating relationship between {Person1Id} and {Person2Id} in tree {TreeId}",
                person1Id, person2Id, treeId);
            return ServiceResult<RelationshipResponse>.InternalError("Error calculating relationship");
        }
    }

    // ============================================================================
    // HIERARCHY BUILDING METHODS
    // ============================================================================

    private async Task<TreePersonNode> BuildPedigreeHierarchy(
        Person person,
        Guid orgId,
        int currentGen,
        int maxGen,
        HashSet<Guid> visited,
        CancellationToken cancellationToken)
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
            var parentRelations = await _personRepository.QueryNoTracking()
                .Where(p => p.AsParent.Any(pc => pc.ChildId == person.Id))
                .Include(p => p.Names)
                .Include(p => p.BirthPlace)
                .Include(p => p.DeathPlace)
                .ToListAsync(cancellationToken);

            var parentNodes = new List<TreePersonNode>();
            foreach (var parent in parentRelations)
            {
                var parentNode = await BuildPedigreeHierarchy(
                    parent, orgId, currentGen + 1, maxGen, visited, cancellationToken);
                parentNodes.Add(parentNode);
            }
            node.Parents = parentNodes;
            node.HasMoreAncestors = parentNodes.Count > 0 && currentGen + 1 >= maxGen;
        }
        else
        {
            // Check if there are more ancestors beyond maxGen
            var hasMoreParents = await _personRepository.QueryNoTracking()
                .AnyAsync(p => p.AsParent.Any(pc => pc.ChildId == person.Id), cancellationToken);
            node.HasMoreAncestors = hasMoreParents;
        }

        // Get unions/spouses for this person
        node.Unions = await GetUnionsForPerson(person.Id, orgId, cancellationToken);

        return node;
    }

    private async Task<TreePersonNode> BuildDescendantsHierarchy(
        Person person,
        Guid orgId,
        int currentGen,
        int maxGen,
        HashSet<Guid> visited,
        CancellationToken cancellationToken)
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
            node.Children = await GetChildrenRecursive(person.Id, orgId, currentGen, maxGen, visited, cancellationToken);
            node.HasMoreDescendants = node.Children.Count > 0 && currentGen + 1 >= maxGen;
        }
        else
        {
            // Check if there are more descendants beyond maxGen
            var hasMoreChildren = await _personRepository.QueryNoTracking()
                .AnyAsync(p => p.AsChild.Any(pc => pc.ParentId == person.Id), cancellationToken);
            node.HasMoreDescendants = hasMoreChildren;
        }

        // Get unions/spouses for this person
        node.Unions = await GetUnionsForPerson(person.Id, orgId, cancellationToken);

        return node;
    }

    private async Task<List<TreePersonNode>> GetChildrenRecursive(
        Guid parentId,
        Guid orgId,
        int currentGen,
        int maxGen,
        HashSet<Guid> visited,
        CancellationToken cancellationToken)
    {
        var children = await _personRepository.QueryNoTracking()
            .Where(p => p.AsChild.Any(pc => pc.ParentId == parentId))
            .Include(p => p.Names)
            .Include(p => p.BirthPlace)
            .Include(p => p.DeathPlace)
            .ToListAsync(cancellationToken);

        var childNodes = new List<TreePersonNode>();
        foreach (var child in children)
        {
            if (visited.Contains(child.Id))
            {
                continue;
            }

            var childNode = await BuildDescendantsHierarchy(
                child, orgId, currentGen + 1, maxGen, visited, cancellationToken);
            childNodes.Add(childNode);
        }

        return childNodes;
    }

    private async Task<List<TreeUnionNode>> GetUnionsForPerson(
        Guid personId,
        Guid orgId,
        CancellationToken cancellationToken)
    {
        var unions = await _unionRepository.QueryNoTracking()
            .Where(u => u.OrgId == orgId && u.Members.Any(um => um.PersonId == personId))
            .Include(u => u.Members)
            .ThenInclude(um => um.Person)
            .ThenInclude(p => p.Names)
            .Include(u => u.Members)
            .ThenInclude(um => um.Person)
            .ThenInclude(p => p.BirthPlace)
            .Include(u => u.Members)
            .ThenInclude(um => um.Person)
            .ThenInclude(p => p.DeathPlace)
            .Distinct()
            .ToListAsync(cancellationToken);

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

    // ============================================================================
    // RELATIONSHIP CALCULATION METHODS
    // ============================================================================

    private async Task<Dictionary<Guid, int>> GetAllAncestors(
        Guid personId,
        HashSet<Guid> visited,
        CancellationToken cancellationToken)
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

            var parentIds = await _personRepository.QueryNoTracking()
                .Where(p => p.AsParent.Any(pc => pc.ChildId == currentId))
                .Select(p => p.Id)
                .ToListAsync(cancellationToken);

            foreach (var parentId in parentIds)
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

    // ============================================================================
    // MAPPING METHODS
    // ============================================================================

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

    // ============================================================================
    // PRIVATE HELPER METHODS
    // ============================================================================

    /// <summary>
    /// Resolves the effective OrgId based on user role.
    /// Preserves exact behavior from original controller.
    /// </summary>
    private async Task<(Guid? OrgId, string? Error)> ResolveOrgIdAsync(
        Guid? requestedTreeId,
        UserContext userContext,
        CancellationToken cancellationToken)
    {
        // SuperAdmin can access any tree
        if (userContext.IsSuperAdmin)
        {
            if (requestedTreeId.HasValue)
            {
                var treeExists = await _orgRepository.ExistsAsync(o => o.Id == requestedTreeId.Value, cancellationToken);
                if (!treeExists)
                {
                    return (null, "The specified tree does not exist.");
                }
                return (requestedTreeId, null);
            }

            // SuperAdmin without specified tree - try token orgId
            if (userContext.OrgId.HasValue)
            {
                return (userContext.OrgId, null);
            }

            return (null, "SuperAdmin must specify a treeId or be a member of a tree.");
        }

        // Admin can access assigned trees
        if (userContext.IsAdmin)
        {
            if (requestedTreeId.HasValue)
            {
                // Check if admin is assigned to this tree
                var isAssigned = await _orgRepository.IsAdminAssignedToTreeAsync(
                    userContext.UserId, requestedTreeId.Value, cancellationToken);

                if (isAssigned)
                {
                    return (requestedTreeId, null);
                }

                // Also check if admin is a member of the tree
                var isMember = await _orgRepository.IsUserMemberOfOrgAsync(
                    userContext.UserId, requestedTreeId.Value, cancellationToken);

                if (isMember)
                {
                    return (requestedTreeId, null);
                }

                return (null, "You are not assigned to this tree.");
            }

            // Admin without specified tree - try token orgId
            if (userContext.OrgId.HasValue)
            {
                return (userContext.OrgId, null);
            }

            // Check if admin has any assignments
            var hasAssignments = await _orgRepository.HasAdminAssignmentsAsync(userContext.UserId, cancellationToken);

            if (hasAssignments)
            {
                return (null, "Admin must specify a treeId to work on an assigned tree.");
            }

            return (null, "You must be assigned to a tree or be a member of one.");
        }

        // Regular user - must be a member
        if (userContext.OrgId == null)
        {
            return (null, "You must be a member of a family tree. Please create or join one first.");
        }

        // If a specific tree was requested, verify membership
        if (requestedTreeId.HasValue && requestedTreeId.Value != userContext.OrgId.Value)
        {
            var isMember = await _orgRepository.IsUserMemberOfOrgAsync(
                userContext.UserId, requestedTreeId.Value, cancellationToken);

            if (!isMember)
            {
                return (null, "You are not a member of this tree.");
            }

            return (requestedTreeId, null);
        }

        return (userContext.OrgId, null);
    }
}
