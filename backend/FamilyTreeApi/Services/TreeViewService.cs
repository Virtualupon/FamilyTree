// File: Services/TreeViewService.cs
using AutoMapper;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using FamilyTreeApi.DTOs;
using FamilyTreeApi.Helpers;
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
                                .Include(p => p.BirthPlace)
                .Include(p => p.DeathPlace)
                .ToListAsync(cancellationToken);

            // Get parents
            var parents = await _personRepository.QueryNoTracking()
                .Where(p => p.AsParent.Any(pc => pc.ChildId == personId))
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

    // ============================================================================
    // RELATIONSHIP PATH FINDING (BFS)
    // ============================================================================

    /// <summary>
    /// Find the relationship path between two people using BFS.
    /// </summary>
    public async Task<ServiceResult<RelationshipPathResponse>> FindRelationshipPathAsync(
        RelationshipPathRequest request,
        UserContext userContext,
        CancellationToken cancellationToken = default)
    {
        try
        {
            var (orgId, error) = await ResolveOrgIdAsync(request.TreeId, userContext, cancellationToken);
            if (orgId == null)
            {
                return ServiceResult<RelationshipPathResponse>.Failure(error!);
            }

            // Handle same person edge case
            if (request.Person1Id == request.Person2Id)
            {
                var samePerson = await GetPathPersonNodeAsync(request.Person1Id, cancellationToken);
                if (samePerson == null)
                {
                    return ServiceResult<RelationshipPathResponse>.NotFound("Person not found");
                }

                return ServiceResult<RelationshipPathResponse>.Success(new RelationshipPathResponse
                {
                    PathFound = true,
                    RelationshipNameKey = "relationship.samePerson",
                    RelationshipDescription = "Same person",
                    Path = new List<PathPersonNode> { samePerson },
                    PathLength = 1
                });
            }

            // BFS to find shortest path
            var visited = new HashSet<Guid>();
            var queue = new Queue<(Guid PersonId, List<(Guid Id, RelationshipEdgeType Edge)> Path)>();

            queue.Enqueue((request.Person1Id, new List<(Guid, RelationshipEdgeType)> { (request.Person1Id, RelationshipEdgeType.None) }));
            visited.Add(request.Person1Id);

            while (queue.Count > 0)
            {
                var (currentId, currentPath) = queue.Dequeue();

                // Check max depth to prevent infinite loops
                if (currentPath.Count > request.MaxSearchDepth)
                {
                    continue;
                }

                // Get all neighbors (parents, children, spouses)
                var neighbors = await GetNeighborsAsync(currentId, orgId.Value, cancellationToken);

                foreach (var (neighborId, edgeType) in neighbors)
                {
                    if (visited.Contains(neighborId))
                    {
                        continue;
                    }

                    var newPath = new List<(Guid Id, RelationshipEdgeType Edge)>(currentPath)
                    {
                        (neighborId, edgeType)
                    };

                    // Found target!
                    if (neighborId == request.Person2Id)
                    {
                        return await BuildPathResponseAsync(newPath, cancellationToken);
                    }

                    visited.Add(neighborId);
                    queue.Enqueue((neighborId, newPath));
                }
            }

            // No path found
            return ServiceResult<RelationshipPathResponse>.Success(new RelationshipPathResponse
            {
                PathFound = false,
                RelationshipNameKey = "relationship.noRelationFound",
                ErrorMessage = "No relationship path found between these individuals. They may be in different family branches."
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error finding relationship path between {Person1Id} and {Person2Id}",
                request.Person1Id, request.Person2Id);
            return ServiceResult<RelationshipPathResponse>.InternalError("Error finding relationship path");
        }
    }

    /// <summary>
    /// Get all neighbors of a person (parents, children, spouses)
    /// </summary>
    private async Task<List<(Guid PersonId, RelationshipEdgeType EdgeType)>> GetNeighborsAsync(
        Guid personId,
        Guid orgId,
        CancellationToken cancellationToken)
    {
        var neighbors = new List<(Guid, RelationshipEdgeType)>();

        // Parents (person is child → navigate to parent)
        var parents = await _personRepository.QueryNoTracking()
            .Where(p => p.AsParent.Any(pc => pc.ChildId == personId))
            .Select(p => p.Id)
            .ToListAsync(cancellationToken);
        neighbors.AddRange(parents.Select(p => (p, RelationshipEdgeType.Parent)));

        // Children (person is parent → navigate to child)
        var children = await _personRepository.QueryNoTracking()
            .Where(p => p.AsChild.Any(pc => pc.ParentId == personId))
            .Select(p => p.Id)
            .ToListAsync(cancellationToken);
        neighbors.AddRange(children.Select(c => (c, RelationshipEdgeType.Child)));

        // Spouses (via unions)
        var spouses = await _unionRepository.QueryNoTracking()
            .Where(u => u.OrgId == orgId && u.Members.Any(m => m.PersonId == personId))
            .SelectMany(u => u.Members.Where(m => m.PersonId != personId).Select(m => m.PersonId))
            .Distinct()
            .ToListAsync(cancellationToken);
        neighbors.AddRange(spouses.Select(s => (s, RelationshipEdgeType.Spouse)));

        return neighbors;
    }

    /// <summary>
    /// Build the relationship path response from a BFS path
    /// </summary>
    private async Task<ServiceResult<RelationshipPathResponse>> BuildPathResponseAsync(
        List<(Guid Id, RelationshipEdgeType Edge)> path,
        CancellationToken cancellationToken)
    {
        var pathNodes = new List<PathPersonNode>();

        // First pass: Load all person nodes
        for (int i = 0; i < path.Count; i++)
        {
            var (personId, edgeType) = path[i];
            var node = await GetPathPersonNodeAsync(personId, cancellationToken);

            if (node == null)
            {
                continue;
            }

            pathNodes.Add(node);
        }

        // Second pass: Set edge info using NEXT person's sex for relationship labels
        // This fixes the bug where the current person's sex was used instead of the next person's sex
        for (int i = 0; i < pathNodes.Count - 1; i++)
        {
            var currentNode = pathNodes[i];
            var nextNode = pathNodes[i + 1];

            // Find the corresponding edge in the original path
            // The edge at index i+1 describes the relationship TO that person
            var nextEdge = path[i + 1].Edge;

            currentNode.EdgeToNext = nextEdge;
            // Use the NEXT person's sex to determine the gendered relationship label
            // because the edge describes what the NEXT person IS (parent/child/spouse)
            currentNode.RelationshipToNextKey = GetEdgeRelationshipKey(nextEdge, nextNode.Sex);
        }

        // Calculate relationship name
        var (relationshipKey, description) = RelationshipNamer.CalculateRelationship(path, pathNodes);

        // Find common ancestors for blood relations
        var commonAncestors = await FindCommonAncestorsFromPathAsync(path, cancellationToken);

        return ServiceResult<RelationshipPathResponse>.Success(new RelationshipPathResponse
        {
            PathFound = true,
            RelationshipNameKey = relationshipKey,
            RelationshipDescription = description,
            Path = pathNodes,
            CommonAncestors = commonAncestors,
            PathLength = pathNodes.Count
        });
    }

    /// <summary>
    /// Get a person node with full details for the path
    /// </summary>
    private async Task<PathPersonNode?> GetPathPersonNodeAsync(Guid personId, CancellationToken cancellationToken)
    {
        var person = await _personRepository.QueryNoTracking()
            .Include(p => p.BirthPlace)
            .Include(p => p.DeathPlace)
            .FirstOrDefaultAsync(p => p.Id == personId, cancellationToken);

        if (person == null)
        {
            return null;
        }

        return new PathPersonNode
        {
            Id = person.Id,
            PrimaryName = person.PrimaryName ?? "Unknown",
            Sex = person.Sex,
            BirthDate = person.BirthDate,
            BirthPlace = person.BirthPlace?.Name,
            DeathDate = person.DeathDate,
            DeathPlace = person.DeathPlace?.Name,
            Occupation = person.Occupation,
            IsLiving = person.DeathDate == null,
            ThumbnailUrl = null // TODO: Add media service to get thumbnail
        };
    }

    /// <summary>
    /// Get the i18n key for an edge relationship
    /// </summary>
    private static string GetEdgeRelationshipKey(RelationshipEdgeType edgeType, Sex personSex)
    {
        return edgeType switch
        {
            RelationshipEdgeType.Parent => personSex switch
            {
                Sex.Male => "relationship.fatherOf",
                Sex.Female => "relationship.motherOf",
                _ => "relationship.parentOf"
            },
            RelationshipEdgeType.Child => personSex switch
            {
                Sex.Male => "relationship.sonOf",
                Sex.Female => "relationship.daughterOf",
                _ => "relationship.childOf"
            },
            RelationshipEdgeType.Spouse => "relationship.spouseOf",
            _ => string.Empty
        };
    }

    /// <summary>
    /// Find common ancestors from the path (for blood relations)
    /// </summary>
    private async Task<List<CommonAncestorInfo>> FindCommonAncestorsFromPathAsync(
        List<(Guid Id, RelationshipEdgeType Edge)> path,
        CancellationToken cancellationToken)
    {
        // Find the pivot point where we go from ascending to descending
        // This is the common ancestor(s)
        var commonAncestors = new List<CommonAncestorInfo>();

        int ascending = 0;
        int pivotIndex = -1;

        // Track generation changes
        for (int i = 1; i < path.Count; i++)
        {
            var edge = path[i].Edge;

            if (edge == RelationshipEdgeType.Parent)
            {
                ascending++;
            }
            else if (edge == RelationshipEdgeType.Child && ascending > 0)
            {
                // Found pivot (first time going down after going up)
                if (pivotIndex == -1)
                {
                    pivotIndex = i - 1; // The person before the first descent is the common ancestor
                }
            }
        }

        if (pivotIndex > 0)
        {
            var ancestorId = path[pivotIndex].Id;
            var person = await _personRepository.QueryNoTracking()
                .FirstOrDefaultAsync(p => p.Id == ancestorId, cancellationToken);

            if (person != null)
            {
                // Count generations from each end
                int gen1 = pivotIndex;
                int gen2 = path.Count - 1 - pivotIndex;

                commonAncestors.Add(new CommonAncestorInfo
                {
                    PersonId = person.Id,
                    PrimaryName = person.PrimaryName ?? "Unknown",
                    GenerationsFromPerson1 = gen1,
                    GenerationsFromPerson2 = gen2
                });
            }
        }

        return commonAncestors;
    }
}