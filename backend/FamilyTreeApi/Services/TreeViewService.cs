// File: Services/TreeViewService.cs
using AutoMapper;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using FamilyTreeApi.DTOs;
using FamilyTreeApi.DTOs.Search;
using FamilyTreeApi.Helpers;
using FamilyTreeApi.Models;
using FamilyTreeApi.Models.Enums;
using FamilyTreeApi.Repositories;
using FamilyTreeApi.Repositories.Interfaces;
using FamilyTreeApi.Services.Caching;

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
    private readonly IPersonSearchRepository _personSearchRepository;
    private readonly IMediaService _mediaService;
    private readonly IRelationshipTypeMappingService _mappingService;
    private readonly ITreeCacheService _cache;
    private readonly IMapper _mapper;
    private readonly ILogger<TreeViewService> _logger;

    public TreeViewService(
        IPersonRepository personRepository,
        IUnionRepository unionRepository,
        IOrgRepository orgRepository,
        IPersonSearchRepository personSearchRepository,
        IMediaService mediaService,
        IRelationshipTypeMappingService mappingService,
        ITreeCacheService cache,
        IMapper mapper,
        ILogger<TreeViewService> logger)
    {
        _personRepository = personRepository;
        _unionRepository = unionRepository;
        _orgRepository = orgRepository;
        _personSearchRepository = personSearchRepository;
        _mediaService = mediaService;
        _mappingService = mappingService;
        _cache = cache;
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

            var generations = request.Generations ?? 4;

            // Try cache first
            var cached = await _cache.GetPedigreeAsync(request.PersonId, generations, orgId.Value, cancellationToken);
            if (cached != null)
            {
                _logger.LogDebug("Pedigree cache HIT for person {PersonId}, org {OrgId}", request.PersonId, orgId);
                return ServiceResult<TreePersonNode>.Success(cached);
            }

            _logger.LogDebug("Pedigree cache MISS for person {PersonId}, org {OrgId}", request.PersonId, orgId);

            var person = await _personRepository.QueryNoTracking()
                                .Include(p => p.BirthPlace)
                .Include(p => p.DeathPlace)
                .FirstOrDefaultAsync(p => p.Id == request.PersonId && p.OrgId == orgId, cancellationToken);

            if (person == null)
            {
                return ServiceResult<TreePersonNode>.NotFound("Person not found");
            }

            var visited = new HashSet<Guid>();
            var rootNode = await BuildPedigreeHierarchy(person, orgId.Value, 0, generations, visited, cancellationToken);

            // Cache successful result
            await _cache.SetPedigreeAsync(request.PersonId, generations, orgId.Value, rootNode, cancellationToken);

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

            var generations = request.Generations ?? 4;

            // Try cache first
            var cached = await _cache.GetDescendantsAsync(request.PersonId, generations, orgId.Value, cancellationToken);
            if (cached != null)
            {
                _logger.LogDebug("Descendants cache HIT for person {PersonId}, org {OrgId}", request.PersonId, orgId);
                return ServiceResult<TreePersonNode>.Success(cached);
            }

            _logger.LogDebug("Descendants cache MISS for person {PersonId}, org {OrgId}", request.PersonId, orgId);

            var person = await _personRepository.QueryNoTracking()
                                .Include(p => p.BirthPlace)
                .Include(p => p.DeathPlace)
                .FirstOrDefaultAsync(p => p.Id == request.PersonId && p.OrgId == orgId, cancellationToken);

            if (person == null)
            {
                return ServiceResult<TreePersonNode>.NotFound("Person not found");
            }

            var visited = new HashSet<Guid>();
            var rootNode = await BuildDescendantsHierarchy(person, orgId.Value, 0, generations, visited, cancellationToken);

            // Cache successful result
            await _cache.SetDescendantsAsync(request.PersonId, generations, orgId.Value, rootNode, cancellationToken);

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

            var generations = request.Generations ?? 3;

            // Try cache first (use same generations for both ancestor and descendant)
            var cached = await _cache.GetHourglassAsync(request.PersonId, generations, generations, orgId.Value, cancellationToken);
            if (cached != null)
            {
                _logger.LogDebug("Hourglass cache HIT for person {PersonId}, org {OrgId}", request.PersonId, orgId);
                return ServiceResult<TreePersonNode>.Success(cached);
            }

            _logger.LogDebug("Hourglass cache MISS for person {PersonId}, org {OrgId}", request.PersonId, orgId);

            var person = await _personRepository.QueryNoTracking()
                                .Include(p => p.BirthPlace)
                .Include(p => p.DeathPlace)
                .FirstOrDefaultAsync(p => p.Id == request.PersonId && p.OrgId == orgId, cancellationToken);

            if (person == null)
            {
                return ServiceResult<TreePersonNode>.NotFound("Person not found");
            }

            // Build ancestors
            var visitedAncestors = new HashSet<Guid>();
            var rootNode = await BuildPedigreeHierarchy(person, orgId.Value, 0, generations, visitedAncestors, cancellationToken);

            // Build descendants and add to root
            var visitedDescendants = new HashSet<Guid> { person.Id }; // Skip root since already added
            var descendants = await GetChildrenRecursive(person.Id, orgId.Value, 0, generations, visitedDescendants, cancellationToken);
            rootNode.Children = descendants;
            rootNode.HasMoreDescendants = descendants.Count > 0 && generations > 0;

            // Cache successful result
            await _cache.SetHourglassAsync(request.PersonId, generations, generations, orgId.Value, rootNode, cancellationToken);

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
            NameArabic = person.NameArabic,
            NameEnglish = person.NameEnglish,
            NameNobiin = person.NameNobiin,
            Sex = person.Sex,
            BirthDate = person.BirthDate,
            BirthPlace = person.BirthPlace?.Name,
            DeathDate = person.DeathDate,
            DeathPlace = person.DeathPlace?.Name,
            IsLiving = person.DeathDate == null,
            AvatarMediaId = person.AvatarMediaId,
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
        // Developer/SuperAdmin can access any tree
        if (userContext.IsDeveloper || userContext.IsSuperAdmin)
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

        // Regular user - must be a member or have access
        // Note: userContext.OrgId may be the FIRST of multiple orgId JWT claims (multi-org bug).
        // A user with multiple tree memberships may have a different tree selected than
        // the one returned by FindFirst("orgId"). Always verify via IsUserMemberOfOrgAsync.

        // If a specific tree was requested, verify membership
        if (requestedTreeId.HasValue)
        {
            // Quick check: does the requested tree match the token orgId?
            if (requestedTreeId.Value == userContext.OrgId)
            {
                return (requestedTreeId, null);
            }

            // Full membership check via OrgUsers table
            var isMember = await _orgRepository.IsUserMemberOfOrgAsync(
                userContext.UserId, requestedTreeId.Value, cancellationToken);

            if (isMember)
            {
                return (requestedTreeId, null);
            }

            // Check if tree exists in user's town (read-only browse access)
            // First try using the user's own tree to determine their town
            if (userContext.OrgId.HasValue)
            {
                var userTree = await _orgRepository.QueryNoTracking()
                    .Where(o => o.Id == userContext.OrgId.Value)
                    .Select(o => new { o.TownId })
                    .FirstOrDefaultAsync(cancellationToken);

                if (userTree?.TownId != null)
                {
                    var requestedTree = await _orgRepository.QueryNoTracking()
                        .Where(o => o.Id == requestedTreeId.Value)
                        .Select(o => new { o.TownId })
                        .FirstOrDefaultAsync(cancellationToken);

                    if (requestedTree?.TownId != null && requestedTree.TownId == userTree.TownId)
                    {
                        return (requestedTreeId, null);
                    }
                }
            }

            // Fallback: check if the requested tree is in the user's selected town
            // (handles case where user's first JWT orgId is in a different town)
            if (userContext.SelectedTownId.HasValue)
            {
                var requestedTree = await _orgRepository.QueryNoTracking()
                    .Where(o => o.Id == requestedTreeId.Value)
                    .Select(o => new { o.TownId })
                    .FirstOrDefaultAsync(cancellationToken);

                if (requestedTree?.TownId != null && requestedTree.TownId == userContext.SelectedTownId.Value)
                {
                    return (requestedTreeId, null);
                }
            }

            return (null, "You are not a member of this tree.");
        }

        // No specific tree requested - use token orgId
        if (userContext.OrgId == null)
        {
            return (null, "You must be a member of a family tree. Please create or join one first.");
        }

        return (userContext.OrgId, null);
    }

    // ============================================================================
    // RELATIONSHIP PATH FINDING (BFS)
    // ============================================================================

    /// <summary>
    /// Find the relationship path between two people using optimized SQL function.
    /// Returns direct relationship labels like "Brother", "Father", etc.
    /// </summary>
    public async Task<ServiceResult<RelationshipPathResponse>> FindRelationshipPathAsync(
        FamilyTreeApi.DTOs.RelationshipPathRequest request,
        UserContext userContext,
        CancellationToken cancellationToken = default)
    {
        try
        {
            // SECURITY: OrgId from authenticated context for cache key
            var orgId = userContext.OrgId ?? Guid.Empty;

            // Try cache first (only if we have a valid orgId)
            if (orgId != Guid.Empty)
            {
                var cached = await _cache.GetRelationshipPathAsync(request.Person1Id, request.Person2Id, orgId, cancellationToken);
                if (cached != null)
                {
                    _logger.LogDebug("Relationship path cache HIT for {Person1Id} <-> {Person2Id}, org {OrgId}",
                        request.Person1Id, request.Person2Id, orgId);
                    return ServiceResult<RelationshipPathResponse>.Success(cached);
                }

                _logger.LogDebug("Relationship path cache MISS for {Person1Id} <-> {Person2Id}, org {OrgId}",
                    request.Person1Id, request.Person2Id, orgId);
            }

            // Use optimized SQL function for fast relationship finding
            var sqlResult = await _personSearchRepository.FindRelationshipPathAsync(
                new FamilyTreeApi.DTOs.Search.RelationshipPathRequest
                {
                    Person1Id = request.Person1Id,
                    Person2Id = request.Person2Id,
                    MaxDepth = request.MaxSearchDepth
                },
                cancellationToken);

            if (sqlResult == null || !sqlResult.PathFound)
            {
                return ServiceResult<RelationshipPathResponse>.Success(new RelationshipPathResponse
                {
                    PathFound = false,
                    RelationshipType = "none",
                    RelationshipLabel = "Not Related",
                    RelationshipNameKey = "relationship.noRelationFound",
                    RelationshipDescription = "No relationship found",
                    ErrorMessage = "No relationship path found between these individuals."
                });
            }

            // Build PathPersonNode list from path IDs
            var pathNodes = new List<PathPersonNode>();
            foreach (var personId in sqlResult.PathIds)
            {
                var node = await GetPathPersonNodeAsync(personId, cancellationToken);
                if (node != null)
                {
                    pathNodes.Add(node);
                }
            }

            // Set edge types and relationship keys between consecutive nodes
            // Also calculate the common ancestor
            Guid? calculatedCommonAncestorId = null;
            int peakIndex = 0;

            for (int i = 0; i < pathNodes.Count - 1; i++)
            {
                var currentNode = pathNodes[i];
                var nextNode = pathNodes[i + 1];

                // Determine the edge type by checking the parent-child relationship
                var edgeType = await DetermineEdgeTypeAsync(currentNode.Id, nextNode.Id, cancellationToken);
                currentNode.EdgeToNext = edgeType;
                currentNode.RelationshipToNextKey = GetEdgeRelationshipKey(edgeType, nextNode.Sex);

                // Track the peak (common ancestor) - it's the last node we reach while going UP
                // EdgeToNext == Parent means NEXT person is the parent of current (going UP)
                if (edgeType == RelationshipEdgeType.Parent)
                {
                    peakIndex = i + 1;
                }
            }

            // The common ancestor is the person at peakIndex
            if (peakIndex > 0 && peakIndex < pathNodes.Count)
            {
                calculatedCommonAncestorId = pathNodes[peakIndex].Id;
            }

            // Use the SQL-provided commonAncestorId if available, otherwise use calculated
            var finalCommonAncestorId = sqlResult.CommonAncestorId ?? calculatedCommonAncestorId;

            // Build common ancestors list
            var commonAncestors = new List<CommonAncestorInfo>();
            if (finalCommonAncestorId.HasValue)
            {
                var ancestorNode = pathNodes.FirstOrDefault(n => n.Id == finalCommonAncestorId.Value);
                if (ancestorNode != null)
                {
                    var ancestorIndex = pathNodes.FindIndex(n => n.Id == finalCommonAncestorId.Value);
                    commonAncestors.Add(new CommonAncestorInfo
                    {
                        PersonId = ancestorNode.Id,
                        PrimaryName = ancestorNode.PrimaryName,
                        GenerationsFromPerson1 = ancestorIndex,
                        GenerationsFromPerson2 = pathNodes.Count - 1 - ancestorIndex
                    });
                }
            }

            // Get TypeId from mapping service
            var typeId = _mappingService.GetTypeIdByKey(sqlResult.RelationshipNameKey);

            var response = new RelationshipPathResponse
            {
                PathFound = true,
                RelationshipType = sqlResult.RelationshipType,
                RelationshipLabel = sqlResult.RelationshipLabel,
                RelationshipNameKey = sqlResult.RelationshipNameKey,
                RelationshipTypeId = typeId,
                RelationshipDescription = sqlResult.RelationshipLabel,
                Path = pathNodes,
                PathLength = sqlResult.PathLength,
                CommonAncestorId = finalCommonAncestorId,
                CommonAncestors = commonAncestors,
                PathIds = sqlResult.PathIds,
                CacheVersion = _mappingService.GetCacheVersion()
            };

            // Cache successful result (only if we have a valid orgId)
            if (orgId != Guid.Empty)
            {
                await _cache.SetRelationshipPathAsync(request.Person1Id, request.Person2Id, orgId, response, cancellationToken);
            }

            return ServiceResult<RelationshipPathResponse>.Success(response);
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

        // Calculate relationship name using instance-based RelationshipNamer
        var relationshipNamer = new RelationshipNamer(_mappingService);
        var relationshipResult = relationshipNamer.CalculateRelationship(path, pathNodes);

        // Find common ancestors for blood relations
        var commonAncestors = await FindCommonAncestorsFromPathAsync(path, cancellationToken);

        return ServiceResult<RelationshipPathResponse>.Success(new RelationshipPathResponse
        {
            PathFound = true,
            RelationshipNameKey = relationshipResult.NameKey,
            RelationshipTypeId = relationshipResult.TypeId,
            RelationshipDescription = relationshipResult.Description,
            Path = pathNodes,
            CommonAncestors = commonAncestors,
            PathLength = pathNodes.Count,
            CacheVersion = _mappingService.GetCacheVersion()
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

        // Get avatar URL if person has an avatar
        string? thumbnailUrl = null;
        if (person.AvatarMediaId.HasValue)
        {
            try
            {
                var signedUrl = await _mediaService.GetSignedUrlAsync(person.AvatarMediaId.Value);
                thumbnailUrl = signedUrl?.Url;
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to get avatar URL for person {PersonId}", personId);
            }
        }

        return new PathPersonNode
        {
            Id = person.Id,
            PrimaryName = person.PrimaryName ?? "Unknown",
            NameArabic = person.NameArabic,
            NameEnglish = person.NameEnglish,
            NameNobiin = person.NameNobiin,
            Sex = person.Sex,
            BirthDate = person.BirthDate,
            BirthPlace = person.BirthPlace?.Name,
            DeathDate = person.DeathDate,
            DeathPlace = person.DeathPlace?.Name,
            Occupation = person.Occupation,
            IsLiving = person.DeathDate == null,
            ThumbnailUrl = thumbnailUrl
        };
    }

    /// <summary>
    /// Determine the edge type between two consecutive people in the path.
    /// Returns what the NEXT person IS relative to CURRENT:
    /// - Parent: nextPerson IS the parent of currentPerson (going UP)
    /// - Child: nextPerson IS the child of currentPerson (going DOWN)
    /// - Spouse: They are spouses
    /// </summary>
    private async Task<RelationshipEdgeType> DetermineEdgeTypeAsync(
        Guid currentPersonId,
        Guid nextPersonId,
        CancellationToken cancellationToken)
    {
        // Check if nextPerson is the PARENT of currentPerson (we're going UP)
        var isNextParent = await _personRepository.QueryNoTracking()
            .AnyAsync(p => p.Id == nextPersonId &&
                          p.AsParent.Any(pc => pc.ChildId == currentPersonId),
                      cancellationToken);
        if (isNextParent)
        {
            return RelationshipEdgeType.Parent;
        }

        // Check if nextPerson is the CHILD of currentPerson (we're going DOWN)
        var isNextChild = await _personRepository.QueryNoTracking()
            .AnyAsync(p => p.Id == nextPersonId &&
                          p.AsChild.Any(pc => pc.ParentId == currentPersonId),
                      cancellationToken);
        if (isNextChild)
        {
            return RelationshipEdgeType.Child;
        }

        // Check if they are spouses
        var areSpouses = await _unionRepository.QueryNoTracking()
            .AnyAsync(u => u.Members.Any(m => m.PersonId == currentPersonId) &&
                          u.Members.Any(m => m.PersonId == nextPersonId),
                      cancellationToken);
        if (areSpouses)
        {
            return RelationshipEdgeType.Spouse;
        }

        return RelationshipEdgeType.None;
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
        //
        // Edge types in path[i].Edge describe the relationship of person i TO person i-1:
        // - Parent: Person i IS the parent of person i-1 (we went UP to reach person i)
        // - Child: Person i IS the child of person i-1 (we went DOWN to reach person i)
        //
        // The peak/common ancestor is the last person we reach while going UP (Parent edges),
        // before we start going DOWN (Child edges)
        var commonAncestors = new List<CommonAncestorInfo>();

        int peakIndex = 0;

        // Walk through the path starting from index 1 (index 0 has no incoming edge)
        // Find the last index where we're still going UP
        for (int i = 1; i < path.Count; i++)
        {
            var edge = path[i].Edge;

            // If person i IS the parent of person i-1, we went UP to reach them
            // This person could be the peak
            if (edge == RelationshipEdgeType.Parent)
            {
                peakIndex = i;
            }
            // If person i IS the child of person i-1, we went DOWN - we've passed the peak
            else if (edge == RelationshipEdgeType.Child)
            {
                // The peak was the previous person (already set to peakIndex)
                break;
            }
        }

        if (peakIndex > 0 && peakIndex < path.Count)
        {
            var ancestorId = path[peakIndex].Id;
            var person = await _personRepository.QueryNoTracking()
                .FirstOrDefaultAsync(p => p.Id == ancestorId, cancellationToken);

            if (person != null)
            {
                // Count generations from each end
                int gen1 = peakIndex;
                int gen2 = path.Count - 1 - peakIndex;

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

    // ============================================================================
    // ROOT PERSONS (TOP LEVEL) METHODS
    // ============================================================================

    // Constants for safety limits
    private const int MaxRootPersonsLimit = 50;
    private const int MaxDescendantDepth = 50;

    /// <summary>
    /// Get root persons (ancestors with no parents) for a tree.
    ///
    /// SECURITY: Uses ResolveOrgIdAsync for authorization
    /// PERFORMANCE: Uses single recursive CTE query for descendant stats (fixes N+1)
    /// SAFETY: Limits results to MaxRootPersonsLimit, depth to MaxDescendantDepth
    /// </summary>
    public async Task<ServiceResult<RootPersonsResponse>> GetRootPersonsAsync(
        Guid treeId,
        UserContext userContext,
        CancellationToken cancellationToken = default)
    {
        try
        {
            // Verify tree access (existing authorization)
            var (orgId, error) = await ResolveOrgIdAsync(treeId, userContext, cancellationToken);
            if (orgId == null)
            {
                return ServiceResult<RootPersonsResponse>.Failure(error!);
            }

            // Try cache first
            var cacheKey = $"root_persons:{treeId}";
            var cached = await _cache.GetRootPersonsAsync(treeId, cancellationToken);
            if (cached != null)
            {
                _logger.LogDebug("Root persons cache HIT for tree {TreeId}", treeId);
                return ServiceResult<RootPersonsResponse>.Success(cached);
            }

            _logger.LogDebug("Root persons cache MISS for tree {TreeId}", treeId);

            // Get tree info
            var tree = await _orgRepository.QueryNoTracking()
                .Where(o => o.Id == treeId)
                .Select(o => new { o.Id, o.Name })
                .FirstOrDefaultAsync(cancellationToken);

            if (tree == null)
            {
                return ServiceResult<RootPersonsResponse>.NotFound("Tree not found");
            }

            // Check cancellation before expensive query
            cancellationToken.ThrowIfCancellationRequested();

            // Find ALL root persons - those with no parents (candidates)
            // Consistent soft-delete filter on BOTH Person AND ParentChild
            var allRootPersons = await _personRepository.QueryNoTracking()
                .Where(p => p.OrgId == treeId)
                .Where(p => !p.IsDeleted)
                .Where(p => !p.AsChild.Any(pc => !pc.IsDeleted))  // No active parent records
                .Take(MaxRootPersonsLimit)
                .Select(p => new RootPersonSummary
                {
                    Id = p.Id,
                    PrimaryName = p.PrimaryName ?? "Unknown",
                    NameArabic = p.NameArabic,
                    NameEnglish = p.NameEnglish,
                    NameNobiin = p.NameNobiin,
                    Sex = p.Sex,
                    BirthDate = p.BirthDate,
                    DeathDate = p.DeathDate,
                    IsLiving = p.DeathDate == null,
                    AvatarMediaId = p.AvatarMediaId,
                    ChildCount = p.AsParent.Count(pc => !pc.IsDeleted)
                })
                .ToListAsync(cancellationToken);

            // Check cancellation before expensive descendant calculation
            cancellationToken.ThrowIfCancellationRequested();

            // Calculate descendant stats for all candidates
            if (allRootPersons.Count > 0)
            {
                var descendantStats = await CalculateDescendantStatsBatchAsync(
                    allRootPersons.Select(p => p.Id).ToList(),
                    treeId,
                    cancellationToken);

                foreach (var rootPerson in allRootPersons)
                {
                    if (descendantStats.TryGetValue(rootPerson.Id, out var stats))
                    {
                        rootPerson.DescendantCount = stats.DescendantCount;
                        rootPerson.GenerationDepth = stats.MaxDepth;
                    }
                }
            }

            // Filter to TRUE founding ancestors: root persons who have descendants.
            // People with no parents AND no descendants are typically spouses who
            // married into the family (imported from GEDCOM without parent links).
            // Sort by descendant count descending so the main founder appears first.
            var rootPersons = allRootPersons
                .Where(p => p.DescendantCount > 0 || p.ChildCount > 0)
                .OrderByDescending(p => p.DescendantCount)
                .ThenByDescending(p => p.GenerationDepth)
                .ThenBy(p => p.BirthDate ?? DateTime.MaxValue)
                .ToList();

            // Fallback: if no roots have descendants, return all roots (tree may have no relationships yet)
            if (rootPersons.Count == 0)
            {
                rootPersons = allRootPersons
                    .OrderBy(p => p.BirthDate ?? DateTime.MaxValue)
                    .ThenBy(p => p.PrimaryName)
                    .ToList();
            }

            var totalCount = rootPersons.Count;

            var response = new RootPersonsResponse
            {
                RootPersons = rootPersons,
                TotalCount = totalCount,
                HasMore = false,
                TreeId = treeId,
                TreeName = tree.Name,
                MaxLimit = MaxRootPersonsLimit
            };

            // Cache for 5 minutes
            await _cache.SetRootPersonsAsync(treeId, response, cancellationToken);

            return ServiceResult<RootPersonsResponse>.Success(response);
        }
        catch (OperationCanceledException)
        {
            _logger.LogInformation("GetRootPersonsAsync cancelled for tree {TreeId}", treeId);
            throw; // Let framework handle cancellation
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting root persons for tree {TreeId}", treeId);
            return ServiceResult<RootPersonsResponse>.InternalError("Error loading root persons");
        }
    }

    /// <summary>
    /// Calculate descendant stats for multiple root persons using batch loading.
    /// Loads all parent-child relationships for the tree once, then calculates in-memory.
    /// This eliminates the N+1 query pattern.
    ///
    /// SAFETY: Depth is capped at MaxDescendantDepth to prevent infinite recursion
    /// SAFETY: Cycle detection via visited tracking
    /// </summary>
    private async Task<Dictionary<Guid, (int DescendantCount, int MaxDepth)>> CalculateDescendantStatsBatchAsync(
        List<Guid> rootPersonIds,
        Guid treeId,
        CancellationToken cancellationToken)
    {
        if (rootPersonIds.Count == 0)
            return new Dictionary<Guid, (int, int)>();

        // Check cancellation before expensive query
        cancellationToken.ThrowIfCancellationRequested();

        // Load ALL parent-child relationships for this tree in ONE query
        var allRelationships = await _personRepository.QueryNoTracking()
            .Where(p => p.OrgId == treeId && !p.IsDeleted)
            .SelectMany(p => p.AsChild.Where(pc => !pc.IsDeleted)
                .Select(pc => new { pc.ParentId, pc.ChildId }))
            .ToListAsync(cancellationToken);

        // Build adjacency list: parent -> children
        var childrenByParent = allRelationships
            .GroupBy(r => r.ParentId)
            .ToDictionary(g => g.Key, g => g.Select(r => r.ChildId).ToList());

        var results = new Dictionary<Guid, (int DescendantCount, int MaxDepth)>();

        // Calculate stats for each root person using BFS
        foreach (var rootId in rootPersonIds)
        {
            cancellationToken.ThrowIfCancellationRequested();

            var visited = new HashSet<Guid>();
            var queue = new Queue<(Guid Id, int Depth)>();
            queue.Enqueue((rootId, 0));

            int maxDepth = 0;
            int count = 0;

            while (queue.Count > 0)
            {
                var (currentId, depth) = queue.Dequeue();

                // Cycle detection
                if (visited.Contains(currentId))
                    continue;
                visited.Add(currentId);

                // Depth limit check
                if (depth > MaxDescendantDepth)
                    continue;

                if (depth > 0) // Don't count the root person
                {
                    count++;
                    maxDepth = Math.Max(maxDepth, depth);
                }

                // Get children from pre-loaded adjacency list
                if (childrenByParent.TryGetValue(currentId, out var children))
                {
                    foreach (var childId in children)
                    {
                        if (!visited.Contains(childId))
                        {
                            queue.Enqueue((childId, depth + 1));
                        }
                    }
                }
            }

            results[rootId] = (count, maxDepth);
        }

        return results;
    }
}