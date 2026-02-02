# D3 Tree Data Construction - Performance Optimization Plan

## Executive Summary

The current D3 tree visualization suffers from significant performance issues due to N+1 query patterns in the backend and inefficient algorithms in the frontend. This plan addresses these issues in phases, prioritized by impact and effort.

**Current State:**
- 4-generation pedigree tree: ~40+ database queries (should be 2-3)
- Relationship path (10 people): ~40 queries (should be 2-3)
- Frontend overlap resolution: O(n² × 50) iterations
- Avatar loading: Blocks render, limited to 20

**Target State:**
- Tree loading: 2-3 queries regardless of size
- Relationship path: 2-3 queries regardless of length
- Frontend algorithms: O(n log n) or better
- Progressive avatar loading with no render blocking

---

## ⚠️ CRITICAL: Security & Safety Constraints

The following constraints MUST be enforced throughout all phases:

### Backend Constraints
| Constraint | Value | Enforcement |
|------------|-------|-------------|
| Max generations | 10 | Validated in API + SQL |
| Max path length | 50 | Validated in API |
| Query timeout | 30 seconds | Database connection |
| Cancellation | Required | All async methods |

### Frontend Constraints
| Constraint | Value | Enforcement |
|------------|-------|-------------|
| Avatar cache max size | 100 entries | LRU eviction |
| Avatar cache max memory | ~10MB | Size-based eviction |
| Request cancellation | Required | AbortController |
| Render timeout | 5 seconds | Graceful degradation |

---

## Phase 0: Quick Wins (1-2 days)

### 0.1 Frontend - Add Subtree Width Memoization

**File:** `frontend/src/app/features/tree/d3-family-tree.component.ts`

**Problem:** `calculateSubtreeWidth()` is called recursively without caching, causing exponential recalculations.

**Solution:**
```typescript
// Add to component class
private subtreeWidthCache = new Map<string, number>();

// Modify calculateSubtreeWidth
private calculateSubtreeWidth(person: TreePersonNode, depth: number): number {
  const cacheKey = `${person.id}:${depth}`;

  // Return cached value if exists
  if (this.subtreeWidthCache.has(cacheKey)) {
    return this.subtreeWidthCache.get(cacheKey)!;
  }

  let width: number;

  if (depth > this.generations || !person.children || person.children.length === 0) {
    const spouseCount = person.unions?.reduce((count, u) =>
      count + (u.partners?.length || 0), 0) || 0;
    width = this.nodeWidth + (spouseCount * (this.nodeWidth + 20));
  } else {
    const childrenWidth = person.children
      .map(child => this.calculateSubtreeWidth(child, depth + 1))
      .reduce((sum, w) => sum + w, 0);
    const spacingWidth = (person.children.length - 1) * this.horizontalSpacing;
    const spouseCount = person.unions?.reduce((count, u) =>
      count + (u.partners?.length || 0), 0) || 0;
    const nodeWithSpouse = this.nodeWidth + (spouseCount * (this.nodeWidth + 20));
    width = Math.max(nodeWithSpouse, childrenWidth + spacingWidth);
  }

  // Cache and return
  this.subtreeWidthCache.set(cacheKey, width);
  return width;
}

// Clear cache in renderTree()
private renderTree(): void {
  if (!this.treeData || !this.container) return;

  // Clear memoization cache
  this.subtreeWidthCache.clear();

  // ... rest of method
}
```

**Impact:** Reduces recursive calls from exponential to linear O(n)

---

### 0.2 Frontend - Optimize Overlap Resolution Algorithm

**File:** `frontend/src/app/features/tree/d3-family-tree.component.ts`

**Problem:** Current algorithm is O(n² × 50) - checks all pairs up to 50 times.

**Solution:**
```typescript
private resolveOverlaps(nodes: D3Node[]): void {
  const padding = 20;
  const maxIterations = 15; // Reduced - usually converges faster

  // Group nodes by generation - use node.generation property, NOT Y position
  // CRITICAL: Using Y position can cause floating point bucketing errors
  const byGeneration = new Map<number, D3Node[]>();
  for (const node of nodes) {
    // Use the actual generation property to avoid floating point issues
    const genKey = node.generation;
    if (!byGeneration.has(genKey)) {
      byGeneration.set(genKey, []);
    }
    byGeneration.get(genKey)!.push(node);
  }

  for (let iteration = 0; iteration < maxIterations; iteration++) {
    let hasOverlap = false;

    // Only check nodes within the same generation
    for (const genNodes of byGeneration.values()) {
      if (genNodes.length < 2) continue;

      // Sort by X position - only adjacent nodes can overlap
      genNodes.sort((a, b) => a.x - b.x);

      // Check only adjacent pairs (O(n) instead of O(n²))
      for (let i = 0; i < genNodes.length - 1; i++) {
        const nodeA = genNodes[i];
        const nodeB = genNodes[i + 1];

        const minDistance = this.nodeWidth + padding;
        const actualDistance = nodeB.x - nodeA.x;
        const overlapX = minDistance - actualDistance;

        if (overlapX > 0) {
          hasOverlap = true;
          const pushAmount = overlapX / 2 + 5;
          nodeA.x -= pushAmount;
          nodeB.x += pushAmount;
        }
      }
    }

    if (!hasOverlap) break;
  }
}
```

**Impact:** O(n² × 50) → O(n log n × 15) - ~100x faster for large trees

---

### 0.3 Backend - Add AsSplitQuery to Union Queries

**File:** `backend/FamilyTreeApi/Services/TreeViewService.cs`

**Problem:** Multiple `.Include()` chains create Cartesian product explosion.

**Solution:** Add `.AsSplitQuery()` to `GetUnionsForPerson()`:

```csharp
private async Task<List<TreeUnionNode>> GetUnionsForPerson(
    Guid personId,
    Guid orgId,
    CancellationToken cancellationToken)
{
    var unions = await _unionRepository.QueryNoTracking()
        .Where(u => u.OrgId == orgId && u.Members.Any(um => um.PersonId == personId))
        .Include(u => u.Members)
            .ThenInclude(um => um.Person)
                .ThenInclude(p => p.BirthPlace)
        .Include(u => u.Members)
            .ThenInclude(um => um.Person)
                .ThenInclude(p => p.DeathPlace)
        .AsSplitQuery()  // ADD THIS - splits into multiple efficient queries
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
        Children = new List<TreePersonNode>()
    }).ToList();
}
```

**Impact:** Reduces data transfer by avoiding Cartesian explosion

---

## Phase 1: Batch Query Optimization (3-5 days)

### 1.1 Create Batch Union Loading Service

**File to create:** `backend/FamilyTreeApi/Services/TreeDataBatchService.cs`

```csharp
using Microsoft.EntityFrameworkCore;
using FamilyTreeApi.Data;
using FamilyTreeApi.DTOs;
using FamilyTreeApi.Models;

namespace FamilyTreeApi.Services;

public interface ITreeDataBatchService
{
    /// <summary>
    /// Load all unions for multiple persons in a single query
    /// </summary>
    Task<Dictionary<Guid, List<TreeUnionNode>>> GetUnionsForPersonsAsync(
        IEnumerable<Guid> personIds,
        Guid orgId,
        CancellationToken ct = default);

    /// <summary>
    /// Load all edge types between consecutive persons in a path
    /// </summary>
    Task<Dictionary<(Guid, Guid), RelationshipEdgeType>> GetEdgeTypesAsync(
        Guid[] pathIds,
        CancellationToken ct = default);

    /// <summary>
    /// Load multiple persons by ID with includes
    /// </summary>
    Task<Dictionary<Guid, Person>> GetPersonsByIdsAsync(
        IEnumerable<Guid> personIds,
        CancellationToken ct = default);
}

public class TreeDataBatchService : ITreeDataBatchService
{
    private readonly ApplicationDbContext _context;
    private readonly ILogger<TreeDataBatchService> _logger;

    public TreeDataBatchService(
        ApplicationDbContext context,
        ILogger<TreeDataBatchService> logger)
    {
        _context = context;
        _logger = logger;
    }

    public async Task<Dictionary<Guid, List<TreeUnionNode>>> GetUnionsForPersonsAsync(
        IEnumerable<Guid> personIds,
        Guid orgId,
        CancellationToken ct = default)
    {
        var personIdList = personIds.ToList();
        if (personIdList.Count == 0)
            return new Dictionary<Guid, List<TreeUnionNode>>();

        var unions = await _context.Unions
            .AsNoTracking()
            .Where(u => u.OrgId == orgId &&
                        u.Members.Any(m => personIdList.Contains(m.PersonId)))
            .Include(u => u.Members)
                .ThenInclude(m => m.Person)
                    .ThenInclude(p => p.BirthPlace)
            .Include(u => u.Members)
                .ThenInclude(m => m.Person)
                    .ThenInclude(p => p.DeathPlace)
            .AsSplitQuery()
            .ToListAsync(ct);

        // Group unions by person ID
        var result = new Dictionary<Guid, List<TreeUnionNode>>();

        foreach (var personId in personIdList)
        {
            var personUnions = unions
                .Where(u => u.Members.Any(m => m.PersonId == personId))
                .Select(u => new TreeUnionNode
                {
                    Id = u.Id,
                    Type = u.Type,
                    StartDate = u.StartDate,
                    EndDate = u.EndDate,
                    Partners = u.Members
                        .Where(m => m.PersonId != personId)
                        .Select(m => MapToTreePersonNode(m.Person))
                        .ToList(),
                    Children = new List<TreePersonNode>()
                })
                .ToList();

            result[personId] = personUnions;
        }

        _logger.LogDebug(
            "Batch loaded unions for {PersonCount} persons, found {UnionCount} unions",
            personIdList.Count, unions.Count);

        return result;
    }

    public async Task<Dictionary<(Guid, Guid), RelationshipEdgeType>> GetEdgeTypesAsync(
        Guid[] pathIds,
        CancellationToken ct = default)
    {
        if (pathIds.Length < 2)
            return new Dictionary<(Guid, Guid), RelationshipEdgeType>();

        var result = new Dictionary<(Guid, Guid), RelationshipEdgeType>();
        var pathIdSet = pathIds.ToHashSet();

        // Load all parent-child relationships in ONE query
        var parentChildPairs = await _context.Set<ParentChild>()
            .AsNoTracking()
            .Where(pc => pathIdSet.Contains(pc.ParentId) && pathIdSet.Contains(pc.ChildId))
            .Select(pc => new { pc.ParentId, pc.ChildId })
            .ToListAsync(ct);

        foreach (var pc in parentChildPairs)
        {
            // From child's perspective, parent is "Parent" edge
            result[(pc.ChildId, pc.ParentId)] = RelationshipEdgeType.Parent;
            // From parent's perspective, child is "Child" edge
            result[(pc.ParentId, pc.ChildId)] = RelationshipEdgeType.Child;
        }

        // Load all spouse pairs in ONE query
        var unionMembers = await _context.Set<UnionMember>()
            .AsNoTracking()
            .Where(um => pathIdSet.Contains(um.PersonId))
            .GroupBy(um => um.UnionId)
            .Where(g => g.Count() >= 2)
            .SelectMany(g => g.ToList())
            .ToListAsync(ct);

        // Group by union and create spouse pairs
        var membersByUnion = unionMembers.GroupBy(um => um.UnionId);
        foreach (var unionGroup in membersByUnion)
        {
            var members = unionGroup.ToList();
            for (int i = 0; i < members.Count; i++)
            {
                for (int j = i + 1; j < members.Count; j++)
                {
                    var p1 = members[i].PersonId;
                    var p2 = members[j].PersonId;
                    result.TryAdd((p1, p2), RelationshipEdgeType.Spouse);
                    result.TryAdd((p2, p1), RelationshipEdgeType.Spouse);
                }
            }
        }

        _logger.LogDebug(
            "Batch loaded edge types for {PathLength} persons, found {EdgeCount} edges",
            pathIds.Length, result.Count);

        return result;
    }

    public async Task<Dictionary<Guid, Person>> GetPersonsByIdsAsync(
        IEnumerable<Guid> personIds,
        CancellationToken ct = default)
    {
        var idList = personIds.ToList();
        if (idList.Count == 0)
            return new Dictionary<Guid, Person>();

        var persons = await _context.Persons
            .AsNoTracking()
            .Where(p => idList.Contains(p.Id))
            .Include(p => p.BirthPlace)
            .Include(p => p.DeathPlace)
            .ToListAsync(ct);

        return persons.ToDictionary(p => p.Id);
    }

    private static TreePersonNode MapToTreePersonNode(Person person)
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
}
```

### 1.2 Register Batch Service

**File:** `backend/FamilyTreeApi/Program.cs`

```csharp
// Add after other service registrations
services.AddScoped<ITreeDataBatchService, TreeDataBatchService>();
```

### 1.3 Update TreeViewService to Use Batch Loading

**File:** `backend/FamilyTreeApi/Services/TreeViewService.cs`

**Changes:**
1. Inject `ITreeDataBatchService`
2. Replace recursive union loading with batch loading
3. Replace per-edge type queries with batch loading

```csharp
// Add to constructor
private readonly ITreeDataBatchService _batchService;

public TreeViewService(
    // ... existing parameters ...
    ITreeDataBatchService batchService,
    ILogger<TreeViewService> logger)
{
    // ... existing assignments ...
    _batchService = batchService;
    _logger = logger;
}

// New method: Build tree with batch loading
private async Task<TreePersonNode> BuildPedigreeWithBatchLoading(
    Person rootPerson,
    Guid orgId,
    int maxGenerations,
    CancellationToken ct)
{
    // Step 1: Collect all person IDs first (recursive but no DB calls)
    var allPersonIds = new HashSet<Guid>();
    var personQueue = new Queue<(Person Person, int Gen)>();
    personQueue.Enqueue((rootPerson, 0));

    var personsToProcess = new List<(Person Person, int Gen)>();

    while (personQueue.Count > 0)
    {
        var (person, gen) = personQueue.Dequeue();
        if (allPersonIds.Contains(person.Id)) continue;

        allPersonIds.Add(person.Id);
        personsToProcess.Add((person, gen));

        if (gen < maxGenerations && person.Parents != null)
        {
            // Note: This still requires parents to be loaded
            // See Phase 2 for full CTE solution
        }
    }

    // Step 2: Batch load all unions for all persons
    var allUnions = await _batchService.GetUnionsForPersonsAsync(allPersonIds, orgId, ct);

    // Step 3: Build tree with pre-loaded data
    return BuildTreeFromPreloadedData(rootPerson, allUnions, maxGenerations);
}

// Update FindRelationshipPathAsync to use batch edge loading
public async Task<ServiceResult<RelationshipPathResponse>> FindRelationshipPathAsync(
    RelationshipPathRequest request,
    UserContext userContext,
    CancellationToken ct = default)
{
    // ... existing code to get sqlResult ...

    // Batch load all persons
    var persons = await _batchService.GetPersonsByIdsAsync(sqlResult.PathIds, ct);

    // Batch load all edge types
    var edgeTypes = await _batchService.GetEdgeTypesAsync(sqlResult.PathIds, ct);

    // Build path nodes without N+1 queries
    var pathNodes = new List<PathPersonNode>();
    for (int i = 0; i < sqlResult.PathIds.Length; i++)
    {
        var personId = sqlResult.PathIds[i];
        if (!persons.TryGetValue(personId, out var person)) continue;

        var node = MapToPathPersonNode(person);

        // Set edge type from pre-loaded data
        if (i < sqlResult.PathIds.Length - 1)
        {
            var nextId = sqlResult.PathIds[i + 1];
            if (edgeTypes.TryGetValue((personId, nextId), out var edge))
            {
                node.EdgeToNext = edge;
                node.RelationshipToNextKey = GetEdgeRelationshipKey(edge, persons[nextId].Sex);
            }
        }

        pathNodes.Add(node);
    }

    // ... rest of method ...
}
```

---

## Phase 2: CTE-Based Tree Loading (5-7 days)

### 2.1 Create PostgreSQL Function for Pedigree

**File to create:** `backend/FamilyTreeApi/Scripts/028_CreatePedigreeFunction.sql`

```sql
-- =============================================
-- Function: get_pedigree_tree
-- Description: Returns all ancestors up to N generations using recursive CTE
-- Returns: Table with person data and generation level
-- SECURITY: Hard cap at 10 generations to prevent unbounded recursion
-- =============================================

CREATE OR REPLACE FUNCTION get_pedigree_tree(
    p_root_id UUID,
    p_org_id UUID,
    p_max_generations INT DEFAULT 4
)
RETURNS TABLE (
    person_id UUID,
    generation INT,
    parent_id UUID,
    name_arabic VARCHAR(200),
    name_english VARCHAR(200),
    name_nobiin VARCHAR(200),
    primary_name VARCHAR(200),
    sex INT,
    birth_date DATE,
    death_date DATE,
    birth_place_id UUID,
    death_place_id UUID,
    avatar_media_id UUID,
    is_living BOOLEAN
) AS $$
DECLARE
    -- CRITICAL: Hard cap to prevent unbounded recursion regardless of input
    v_safe_max_generations INT := LEAST(GREATEST(p_max_generations, 1), 10);
BEGIN
    RETURN QUERY
    WITH RECURSIVE ancestors AS (
        -- Base case: root person
        SELECT
            p."Id" as person_id,
            0 as generation,
            NULL::UUID as parent_id,
            p."NameArabic",
            p."NameEnglish",
            p."NameNobiin",
            p."PrimaryName",
            p."Sex",
            p."BirthDate",
            p."DeathDate",
            p."BirthPlaceId",
            p."DeathPlaceId",
            p."AvatarMediaId",
            (p."DeathDate" IS NULL) as is_living,
            ARRAY[p."Id"] as path
        FROM "Persons" p
        WHERE p."Id" = p_root_id AND p."OrgId" = p_org_id

        UNION ALL

        -- Recursive case: parents
        SELECT
            parent."Id" as person_id,
            a.generation + 1 as generation,
            pc."ChildId" as parent_id,
            parent."NameArabic",
            parent."NameEnglish",
            parent."NameNobiin",
            parent."PrimaryName",
            parent."Sex",
            parent."BirthDate",
            parent."DeathDate",
            parent."BirthPlaceId",
            parent."DeathPlaceId",
            parent."AvatarMediaId",
            (parent."DeathDate" IS NULL) as is_living,
            a.path || parent."Id"
        FROM ancestors a
        INNER JOIN "ParentChild" pc ON pc."ChildId" = a.person_id
        INNER JOIN "Persons" parent ON parent."Id" = pc."ParentId"
        WHERE a.generation < v_safe_max_generations  -- Uses clamped value
          AND parent."OrgId" = p_org_id
          AND NOT parent."Id" = ANY(a.path)  -- Prevent cycles in single ancestral line
          AND array_length(a.path, 1) < 100  -- Additional safety: max 100 nodes in any path
    )
    SELECT
        ancestors.person_id,
        ancestors.generation,
        ancestors.parent_id,
        ancestors."NameArabic",
        ancestors."NameEnglish",
        ancestors."NameNobiin",
        ancestors."PrimaryName",
        ancestors."Sex",
        ancestors."BirthDate",
        ancestors."DeathDate",
        ancestors."BirthPlaceId",
        ancestors."DeathPlaceId",
        ancestors."AvatarMediaId",
        ancestors.is_living
    FROM ancestors
    ORDER BY ancestors.generation, ancestors.person_id;
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- Function: get_descendants_tree
-- Description: Returns all descendants up to N generations using recursive CTE
-- SECURITY: Hard cap at 10 generations to prevent unbounded recursion
-- =============================================

CREATE OR REPLACE FUNCTION get_descendants_tree(
    p_root_id UUID,
    p_org_id UUID,
    p_max_generations INT DEFAULT 4
)
RETURNS TABLE (
    person_id UUID,
    generation INT,
    parent_id UUID,
    name_arabic VARCHAR(200),
    name_english VARCHAR(200),
    name_nobiin VARCHAR(200),
    primary_name VARCHAR(200),
    sex INT,
    birth_date DATE,
    death_date DATE,
    birth_place_id UUID,
    death_place_id UUID,
    avatar_media_id UUID,
    is_living BOOLEAN
) AS $$
DECLARE
    -- CRITICAL: Hard cap to prevent unbounded recursion regardless of input
    v_safe_max_generations INT := LEAST(GREATEST(p_max_generations, 1), 10);
BEGIN
    RETURN QUERY
    WITH RECURSIVE descendants AS (
        -- Base case: root person
        SELECT
            p."Id" as person_id,
            0 as generation,
            NULL::UUID as parent_id,
            p."NameArabic",
            p."NameEnglish",
            p."NameNobiin",
            p."PrimaryName",
            p."Sex",
            p."BirthDate",
            p."DeathDate",
            p."BirthPlaceId",
            p."DeathPlaceId",
            p."AvatarMediaId",
            (p."DeathDate" IS NULL) as is_living,
            ARRAY[p."Id"] as path
        FROM "Persons" p
        WHERE p."Id" = p_root_id AND p."OrgId" = p_org_id

        UNION ALL

        -- Recursive case: children
        SELECT
            child."Id" as person_id,
            d.generation + 1 as generation,
            pc."ParentId" as parent_id,
            child."NameArabic",
            child."NameEnglish",
            child."NameNobiin",
            child."PrimaryName",
            child."Sex",
            child."BirthDate",
            child."DeathDate",
            child."BirthPlaceId",
            child."DeathPlaceId",
            child."AvatarMediaId",
            (child."DeathDate" IS NULL) as is_living,
            d.path || child."Id"
        FROM descendants d
        INNER JOIN "ParentChild" pc ON pc."ParentId" = d.person_id
        INNER JOIN "Persons" child ON child."Id" = pc."ChildId"
        WHERE d.generation < v_safe_max_generations  -- Uses clamped value
          AND child."OrgId" = p_org_id
          AND NOT child."Id" = ANY(d.path)  -- Prevent cycles in single descendant line
          AND array_length(d.path, 1) < 100  -- Additional safety: max 100 nodes in any path
    )
    SELECT
        descendants.person_id,
        descendants.generation,
        descendants.parent_id,
        descendants."NameArabic",
        descendants."NameEnglish",
        descendants."NameNobiin",
        descendants."PrimaryName",
        descendants."Sex",
        descendants."BirthDate",
        descendants."DeathDate",
        descendants."BirthPlaceId",
        descendants."DeathPlaceId",
        descendants."AvatarMediaId",
        descendants.is_living
    FROM descendants
    ORDER BY descendants.generation, descendants.person_id;
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- Required Indexes for CTE Performance
-- =============================================
CREATE INDEX IF NOT EXISTS idx_parentchild_childid ON "ParentChild"("ChildId");
CREATE INDEX IF NOT EXISTS idx_parentchild_parentid ON "ParentChild"("ParentId");
CREATE INDEX IF NOT EXISTS idx_persons_orgid ON "Persons"("OrgId");
CREATE INDEX IF NOT EXISTS idx_persons_id_orgid ON "Persons"("Id", "OrgId");
```

### 2.2 Create Repository Method for CTE Query

**File:** `backend/FamilyTreeApi/Repositories/TreeRepository.cs`

```csharp
using Microsoft.EntityFrameworkCore;
using FamilyTreeApi.Data;
using FamilyTreeApi.Models.Enums;

namespace FamilyTreeApi.Repositories;

public interface ITreeRepository
{
    Task<List<TreePersonFlat>> GetPedigreeTreeAsync(
        Guid rootId, Guid orgId, int maxGenerations, CancellationToken ct = default);

    Task<List<TreePersonFlat>> GetDescendantsTreeAsync(
        Guid rootId, Guid orgId, int maxGenerations, CancellationToken ct = default);
}

public record TreePersonFlat(
    Guid PersonId,
    int Generation,
    Guid? ParentId,
    string? NameArabic,
    string? NameEnglish,
    string? NameNobiin,
    string? PrimaryName,
    Sex Sex,
    DateTime? BirthDate,
    DateTime? DeathDate,
    Guid? BirthPlaceId,
    Guid? DeathPlaceId,
    Guid? AvatarMediaId,
    bool IsLiving
);

public class TreeRepository : ITreeRepository
{
    private readonly ApplicationDbContext _context;
    private readonly ILogger<TreeRepository> _logger;

    /// <summary>
    /// SECURITY: Absolute maximum generations allowed.
    /// This is enforced at BOTH C# layer AND SQL layer for defense in depth.
    /// </summary>
    private const int MaxAllowedGenerations = 10;
    private const int MinAllowedGenerations = 1;

    public TreeRepository(ApplicationDbContext context, ILogger<TreeRepository> logger)
    {
        _context = context;
        _logger = logger;
    }

    public async Task<List<TreePersonFlat>> GetPedigreeTreeAsync(
        Guid rootId, Guid orgId, int maxGenerations, CancellationToken ct = default)
    {
        // CRITICAL: Validate and clamp input BEFORE passing to SQL
        var safeGenerations = ClampGenerations(maxGenerations, nameof(GetPedigreeTreeAsync));

        // Validate GUIDs are not empty
        if (rootId == Guid.Empty)
            throw new ArgumentException("Root person ID cannot be empty", nameof(rootId));
        if (orgId == Guid.Empty)
            throw new ArgumentException("Organization ID cannot be empty", nameof(orgId));

        ct.ThrowIfCancellationRequested();

        return await _context.Set<TreePersonFlat>()
            .FromSqlInterpolated($@"
                SELECT * FROM get_pedigree_tree({rootId}, {orgId}, {safeGenerations})")
            .ToListAsync(ct);
    }

    public async Task<List<TreePersonFlat>> GetDescendantsTreeAsync(
        Guid rootId, Guid orgId, int maxGenerations, CancellationToken ct = default)
    {
        // CRITICAL: Validate and clamp input BEFORE passing to SQL
        var safeGenerations = ClampGenerations(maxGenerations, nameof(GetDescendantsTreeAsync));

        // Validate GUIDs are not empty
        if (rootId == Guid.Empty)
            throw new ArgumentException("Root person ID cannot be empty", nameof(rootId));
        if (orgId == Guid.Empty)
            throw new ArgumentException("Organization ID cannot be empty", nameof(orgId));

        ct.ThrowIfCancellationRequested();

        return await _context.Set<TreePersonFlat>()
            .FromSqlInterpolated($@"
                SELECT * FROM get_descendants_tree({rootId}, {orgId}, {safeGenerations})")
            .ToListAsync(ct);
    }

    /// <summary>
    /// Clamps generations to safe range and logs if clamping occurred.
    /// </summary>
    private int ClampGenerations(int requested, string methodName)
    {
        if (requested < MinAllowedGenerations)
        {
            _logger.LogWarning(
                "{Method}: Requested generations {Requested} below minimum, clamped to {Min}",
                methodName, requested, MinAllowedGenerations);
            return MinAllowedGenerations;
        }

        if (requested > MaxAllowedGenerations)
        {
            _logger.LogWarning(
                "{Method}: Requested generations {Requested} exceeds maximum, clamped to {Max}",
                methodName, requested, MaxAllowedGenerations);
            return MaxAllowedGenerations;
        }

        return requested;
    }
}
```

### 2.2.1 Register TreeRepository

**File:** `backend/FamilyTreeApi/Program.cs`

```csharp
// Add with other repository registrations
services.AddScoped<ITreeRepository, TreeRepository>();
```

### 2.3 Build Tree from Flat CTE Result

**File:** `backend/FamilyTreeApi/Services/TreeViewService.cs`

```csharp
/// <summary>
/// Load tree data with all required batch queries, then build hierarchical structure.
/// This is the main entry point that orchestrates batch loading.
/// </summary>
public async Task<TreePersonNode> GetPedigreeOptimizedAsync(
    Guid rootId,
    Guid orgId,
    int maxGenerations,
    CancellationToken ct = default)
{
    // CRITICAL: All data loaded in parallel batch queries (3 total)

    // Query 1: Get all persons via CTE
    var flatList = await _treeRepository.GetPedigreeTreeAsync(rootId, orgId, maxGenerations, ct);

    if (flatList.Count == 0)
    {
        throw new InvalidOperationException($"Person {rootId} not found in organization {orgId}");
    }

    // Extract all IDs needed for batch loading
    var personIds = flatList.Select(f => f.PersonId).ToHashSet();
    var placeIds = flatList
        .SelectMany(f => new[] { f.BirthPlaceId, f.DeathPlaceId })
        .Where(id => id.HasValue)
        .Select(id => id!.Value)
        .Distinct()
        .ToList();

    // Query 2 & 3: Batch load unions and places in parallel
    var unionsTask = _batchService.GetUnionsForPersonsAsync(personIds, orgId, ct);
    var placesTask = BatchLoadPlacesAsync(placeIds, ct);

    await Task.WhenAll(unionsTask, placesTask);

    ct.ThrowIfCancellationRequested();

    var unions = await unionsTask;
    var places = await placesTask;

    // Build tree in memory (O(n), no DB calls)
    return BuildTreeFromFlatList(flatList, unions, places);
}

/// <summary>
/// Batch load place names by IDs.
/// </summary>
private async Task<Dictionary<Guid, string?>> BatchLoadPlacesAsync(
    List<Guid> placeIds,
    CancellationToken ct)
{
    if (placeIds.Count == 0)
        return new Dictionary<Guid, string?>();

    var places = await _context.Places
        .AsNoTracking()
        .Where(p => placeIds.Contains(p.Id))
        .Select(p => new { p.Id, p.Name })
        .ToListAsync(ct);

    return places.ToDictionary(p => p.Id, p => p.Name);
}

/// <summary>
/// Build hierarchical tree from flat CTE result - O(n) algorithm.
/// No database calls - all data must be pre-loaded.
/// </summary>
private TreePersonNode BuildTreeFromFlatList(
    List<TreePersonFlat> flatList,
    Dictionary<Guid, List<TreeUnionNode>> unions,
    Dictionary<Guid, string?> places)
{
    if (flatList.Count == 0)
        throw new InvalidOperationException("Empty tree data");

    // Create all nodes first - O(n)
    var nodeMap = new Dictionary<Guid, TreePersonNode>(flatList.Count);

    foreach (var flat in flatList)
    {
        var node = new TreePersonNode
        {
            Id = flat.PersonId,
            PrimaryName = flat.PrimaryName ?? "Unknown",
            NameArabic = flat.NameArabic,
            NameEnglish = flat.NameEnglish,
            NameNobiin = flat.NameNobiin,
            Sex = flat.Sex,
            BirthDate = flat.BirthDate,
            BirthPlace = flat.BirthPlaceId.HasValue
                ? places.GetValueOrDefault(flat.BirthPlaceId.Value)
                : null,
            DeathDate = flat.DeathDate,
            DeathPlace = flat.DeathPlaceId.HasValue
                ? places.GetValueOrDefault(flat.DeathPlaceId.Value)
                : null,
            IsLiving = flat.IsLiving,
            AvatarMediaId = flat.AvatarMediaId,
            Parents = new List<TreePersonNode>(),
            Children = new List<TreePersonNode>(),
            Unions = unions.GetValueOrDefault(flat.PersonId) ?? new List<TreeUnionNode>(),
            HasMoreAncestors = false,
            HasMoreDescendants = false
        };

        nodeMap[flat.PersonId] = node;
    }

    // Link parents/children based on ParentId - O(n)
    foreach (var flat in flatList)
    {
        if (flat.ParentId.HasValue && nodeMap.TryGetValue(flat.ParentId.Value, out var childNode))
        {
            var parentNode = nodeMap[flat.PersonId];
            childNode.Parents.Add(parentNode);
        }
    }

    // Root is generation 0
    var root = flatList.FirstOrDefault(f => f.Generation == 0);
    if (root == null)
        throw new InvalidOperationException("No root node (generation 0) found in tree data");

    return nodeMap[root.PersonId];
}
```

---

## Phase 3: Frontend Progressive Loading (2-3 days)

### 3.1 Progressive Avatar Loading with Cancellation & Cache Eviction

**File:** `frontend/src/app/features/tree/d3-family-tree.component.ts`

```typescript
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

// ============================================================================
// CRITICAL: Avatar Cache with LRU Eviction
// Prevents unbounded memory growth across navigation
// ============================================================================

interface AvatarCacheEntry {
  dataUrl: string;
  lastAccessed: number;
  sizeEstimate: number;  // Approximate bytes
}

class LRUAvatarCache {
  private cache = new Map<string, AvatarCacheEntry>();
  private readonly maxEntries: number;
  private readonly maxMemoryBytes: number;
  private currentMemoryBytes = 0;

  constructor(maxEntries = 100, maxMemoryMB = 10) {
    this.maxEntries = maxEntries;
    this.maxMemoryBytes = maxMemoryMB * 1024 * 1024;
  }

  get(mediaId: string): string | undefined {
    const entry = this.cache.get(mediaId);
    if (entry) {
      entry.lastAccessed = Date.now();
      return entry.dataUrl;
    }
    return undefined;
  }

  has(mediaId: string): boolean {
    return this.cache.has(mediaId);
  }

  set(mediaId: string, dataUrl: string): void {
    // Estimate size: base64 is ~1.33x original, plus overhead
    const sizeEstimate = dataUrl.length * 2;  // UTF-16 chars

    // Evict if necessary
    while (
      (this.cache.size >= this.maxEntries ||
       this.currentMemoryBytes + sizeEstimate > this.maxMemoryBytes) &&
      this.cache.size > 0
    ) {
      this.evictLRU();
    }

    // Don't add if single entry exceeds limit
    if (sizeEstimate > this.maxMemoryBytes) {
      console.warn(`Avatar ${mediaId} too large (${sizeEstimate} bytes), skipping cache`);
      return;
    }

    this.cache.set(mediaId, {
      dataUrl,
      lastAccessed: Date.now(),
      sizeEstimate
    });
    this.currentMemoryBytes += sizeEstimate;
  }

  private evictLRU(): void {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    for (const [key, entry] of this.cache) {
      if (entry.lastAccessed < oldestTime) {
        oldestTime = entry.lastAccessed;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      const entry = this.cache.get(oldestKey)!;
      this.currentMemoryBytes -= entry.sizeEstimate;
      this.cache.delete(oldestKey);
    }
  }

  clear(): void {
    this.cache.clear();
    this.currentMemoryBytes = 0;
  }

  get size(): number {
    return this.cache.size;
  }

  get memoryUsage(): number {
    return this.currentMemoryBytes;
  }
}

// ============================================================================
// Component Implementation
// ============================================================================

// Replace the simple Map with LRU cache
private avatarCache = new LRUAvatarCache(100, 10);  // 100 entries, 10MB max

// CRITICAL: Cancellation support to prevent race conditions
private avatarLoadingAbortController: AbortController | null = null;
private avatarLoadingQueue: D3Node[] = [];
private isLoadingAvatars = false;
private destroy$ = new Subject<void>();

ngOnDestroy(): void {
  // CRITICAL: Cancel any in-flight avatar requests
  this.cancelAvatarLoading();
  this.destroy$.next();
  this.destroy$.complete();
}

/**
 * Cancel all in-flight avatar loading.
 * Called on component destroy or when tree data changes.
 */
private cancelAvatarLoading(): void {
  if (this.avatarLoadingAbortController) {
    this.avatarLoadingAbortController.abort();
    this.avatarLoadingAbortController = null;
  }
  this.avatarLoadingQueue = [];
  this.isLoadingAvatars = false;
}

private async loadAvatarsForNodes(nodes: D3Node[]): Promise<void> {
  // CRITICAL: Cancel any previous loading operation
  this.cancelAvatarLoading();

  // Create new abort controller for this loading session
  this.avatarLoadingAbortController = new AbortController();
  const signal = this.avatarLoadingAbortController.signal;

  const nodesToLoad = nodes.filter(n =>
    n.data.avatarMediaId && !this.avatarCache.has(n.data.avatarMediaId)
  );

  if (nodesToLoad.length === 0) return;

  // Load first 5 immediately (likely visible)
  const immediateBatch = nodesToLoad.slice(0, 5);
  await this.loadAvatarBatch(immediateBatch, signal);

  // Check if cancelled
  if (signal.aborted) return;

  // Queue rest for progressive loading
  this.avatarLoadingQueue.push(...nodesToLoad.slice(5));
  this.startProgressiveAvatarLoading(signal);
}

private async startProgressiveAvatarLoading(signal: AbortSignal): Promise<void> {
  if (this.isLoadingAvatars || this.avatarLoadingQueue.length === 0) return;

  this.isLoadingAvatars = true;

  try {
    while (this.avatarLoadingQueue.length > 0) {
      // Check for cancellation at each iteration
      if (signal.aborted) {
        break;
      }

      const batch = this.avatarLoadingQueue.splice(0, 3);
      await this.loadAvatarBatch(batch, signal);

      // Check again after async operation
      if (signal.aborted) {
        break;
      }

      // Update DOM with new avatars
      this.updateRenderedAvatars(batch);

      // Yield to UI thread
      await new Promise(resolve => setTimeout(resolve, 16));
    }
  } finally {
    this.isLoadingAvatars = false;
  }
}

private async loadAvatarBatch(nodes: D3Node[], signal: AbortSignal): Promise<void> {
  const loadPromises = nodes.map(async (node) => {
    // Check cancellation before starting
    if (signal.aborted) return;

    const mediaId = node.data.avatarMediaId;
    if (!mediaId || this.avatarCache.has(mediaId)) return;

    try {
      const media = await firstValueFrom(
        this.mediaService.getMediaById(mediaId).pipe(
          timeout(5000),
          takeUntil(this.destroy$)  // Also cancel on component destroy
        )
      );

      // Check cancellation after async operation
      if (signal.aborted) return;

      if (media?.base64Data) {
        const dataUrl = `data:${media.mimeType || 'image/jpeg'};base64,${media.base64Data}`;
        this.avatarCache.set(mediaId, dataUrl);  // LRU cache handles eviction
      }
    } catch (err: any) {
      // Don't log if cancelled
      if (err?.name === 'AbortError' || signal.aborted) return;

      console.warn('Failed to load avatar:', mediaId, err?.message);
      // IMPORTANT: Do NOT cache failures permanently - allow retry on next render
      // Only cache if it's a definitive 404, not a network error
      if (err?.status === 404) {
        this.avatarCache.set(mediaId, '');  // Mark as definitively missing
      }
      // For network errors, don't cache - will retry on next tree load
    }
  });

  await Promise.all(loadPromises);
}

private updateRenderedAvatars(nodes: D3Node[]): void {
  if (!this.container) return;

  for (const node of nodes) {
    const mediaId = node.data.avatarMediaId;
    if (!mediaId) continue;

    const avatarUrl = this.avatarCache.get(mediaId);
    if (!avatarUrl) continue;

    // Update the image element in the DOM
    this.container.select(`#avatar-${node.id}`)
      .attr('href', avatarUrl);
  }
}

// Also update renderTree to cancel previous loading
private renderTree(): void {
  if (!this.treeData || !this.container) return;

  // CRITICAL: Cancel any in-flight avatar requests from previous render
  this.cancelAvatarLoading();

  // Clear memoization cache
  this.subtreeWidthCache.clear();

  // Clear previous content
  this.container.selectAll('*').remove();

  // ... rest of renderTree
}
```

### 3.2 Virtualized Rendering for Large Trees

For trees with 100+ nodes, consider rendering only visible nodes:

```typescript
interface VisibleBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

private getVisibleBounds(): VisibleBounds {
  const container = this.containerRef.nativeElement;
  const transform = d3.zoomTransform(this.svgRef.nativeElement);

  const padding = 200; // Extra padding to render nodes just outside view

  return {
    minX: (-transform.x - padding) / transform.k,
    maxX: (-transform.x + container.clientWidth + padding) / transform.k,
    minY: (-transform.y - padding) / transform.k,
    maxY: (-transform.y + container.clientHeight + padding) / transform.k
  };
}

private isNodeVisible(node: D3Node, bounds: VisibleBounds): boolean {
  return node.x >= bounds.minX - this.nodeWidth &&
         node.x <= bounds.maxX + this.nodeWidth &&
         node.y >= bounds.minY - this.nodeHeight &&
         node.y <= bounds.maxY + this.nodeHeight;
}

private renderVisibleNodes(): void {
  const bounds = this.getVisibleBounds();
  const visibleNodes = this.currentNodes.filter(n => this.isNodeVisible(n, bounds));
  const visibleLinks = this.currentLinks.filter(l =>
    this.isNodeVisible(l.source, bounds) || this.isNodeVisible(l.target, bounds)
  );

  // Only render visible elements
  this.drawLinks(visibleLinks);
  this.drawNodes(visibleNodes);
}

// Debounce timer for virtualized rendering
private renderVisibleDebounceTimer: ReturnType<typeof setTimeout> | null = null;

// Call on zoom/pan
private onZoom(event: d3.D3ZoomEvent<SVGSVGElement, unknown>): void {
  this.container?.attr('transform', event.transform.toString());

  // Debounce re-render of visible nodes to prevent excessive re-renders during pan/zoom
  this.debounceRenderVisible();
}

/**
 * Debounced render - waits for zoom/pan to stabilize before re-rendering.
 * Prevents 60+ re-renders per second during continuous pan.
 */
private debounceRenderVisible(): void {
  if (this.renderVisibleDebounceTimer) {
    clearTimeout(this.renderVisibleDebounceTimer);
  }

  this.renderVisibleDebounceTimer = setTimeout(() => {
    this.renderVisibleNodes();
    this.renderVisibleDebounceTimer = null;
  }, 100);  // 100ms debounce - renders after user stops panning
}

// Clean up in ngOnDestroy
ngOnDestroy(): void {
  // ... existing cleanup ...

  // Clear debounce timer
  if (this.renderVisibleDebounceTimer) {
    clearTimeout(this.renderVisibleDebounceTimer);
    this.renderVisibleDebounceTimer = null;
  }
}
```

---

## Phase 4: Redis Caching (Future)

### 4.1 Cache Strategy

```csharp
public interface ITreeCacheService
{
    Task<TreePersonNode?> GetCachedTreeAsync(
        Guid rootId, string viewMode, int generations);

    Task SetCachedTreeAsync(
        Guid rootId, string viewMode, int generations,
        TreePersonNode tree, TimeSpan? expiry = null);

    Task InvalidateTreeCacheAsync(Guid personId);
}
```

### 4.2 Cache Key Structure

```
tree:{orgId}:pedigree:{personId}:{generations}
tree:{orgId}:descendants:{personId}:{generations}
tree:{orgId}:hourglass:{personId}:{generations}
```

### 4.3 Cache Invalidation Triggers

- Person created/updated/deleted
- ParentChild relationship changed
- Union created/updated/deleted
- Place renamed (affects display)

---

## Summary: Implementation Order

| Phase | Task | Queries Before | Queries After | Days |
|-------|------|----------------|---------------|------|
| 0.1 | Subtree width memoization | N/A | N/A | 0.5 |
| 0.2 | Overlap algorithm optimization | N/A | N/A | 0.5 |
| 0.3 | AsSplitQuery for unions | N/A | N/A | 0.25 |
| 1.1 | Batch union loading service | 30 | 1 | 1 |
| 1.2 | Batch edge type loading | 27 | 1 | 1 |
| 1.3 | Update TreeViewService | 40+ | 3-5 | 2 |
| 2.1 | PostgreSQL CTE functions | - | - | 1 |
| 2.2 | Repository for CTE | - | - | 1 |
| 2.3 | Build tree from flat list | 40+ | 2 | 2 |
| 3.1 | Progressive avatar loading | N/A | N/A | 1 |
| 3.2 | Virtualized rendering | N/A | N/A | 2 |
| 4.x | Redis caching | - | 0* | 3 |

*With cache hit

---

## Verification Checklist

### Performance Metrics to Track

- [ ] Tree load time (4 generations): Target < 500ms
- [ ] Relationship path time: Target < 200ms
- [ ] Frontend render time (50 nodes): Target < 100ms
- [ ] Memory usage (100 nodes): Target < 50MB

### Test Scenarios

- [ ] Pedigree: 4 generations, 15 ancestors
- [ ] Descendants: 4 generations, 50+ descendants
- [ ] Hourglass: 3 generations each direction
- [ ] Large tree: 200+ nodes
- [ ] Relationship: 10-person path
- [ ] Concurrent users: 10 simultaneous tree loads

### Monitoring

```csharp
// Add timing logs
var sw = Stopwatch.StartNew();
var result = await GetPedigreeAsync(request, userContext, ct);
_logger.LogInformation(
    "GetPedigreeAsync completed in {ElapsedMs}ms for {PersonId}, {Generations} generations",
    sw.ElapsedMilliseconds, request.PersonId, request.Generations);
```

---

## ⚠️ Documented Assumptions

The following assumptions are relied upon by this implementation. Violations may cause incorrect behavior.

### Database Assumptions

| Assumption | Risk if Violated | Mitigation |
|------------|------------------|------------|
| Person IDs are GUIDs | Cache key collisions | Enforce UUID type in schema |
| No circular parent-child relationships | Infinite recursion | Cycle detection in CTE + path array limit |
| PostgreSQL 12+ | CTE syntax incompatible | Check version at startup |
| Parent-child relationships form a DAG | Unexpected traversal | Cycle detection with path array |
| OrgId filter is always applied | Data leakage | Enforced in all queries |

### Frontend Assumptions

| Assumption | Risk if Violated | Mitigation |
|------------|------------------|------------|
| Single browser tab per user | Avatar cache corruption | LRU cache is per-component |
| Avatar images < 1MB each | Memory exhaustion | Size check before caching |
| < 500 nodes per tree | UI freeze | Virtualization for large trees |
| Network errors are transient | Permanent broken avatars | Don't cache network errors |
| D3Node has `generation` property | Overlap algorithm fails | Use generation, not Y position |

### API Contract Assumptions

| Assumption | Risk if Violated | Mitigation |
|------------|------------------|------------|
| Generations parameter is integer | Type error | Validate at API boundary |
| Generations range: 1-10 | Resource exhaustion | Clamp in C# AND SQL |
| CancellationToken is propagated | Wasted resources | Enforce in all async methods |
| Tree data doesn't change during request | Inconsistent state | Consider read transactions |

---

## Audit Response: Critical Issues Fixed

This plan has been audited and the following critical issues have been addressed:

### ✅ Fixed: SQL Injection / Unbounded Recursion
- **Issue:** CTE functions accepted arbitrary `maxGenerations` values
- **Fix:** Hard cap in SQL via `LEAST(GREATEST(p_max_generations, 1), 10)`
- **Fix:** Additional `array_length(path, 1) < 100` safety limit
- **Fix:** C# validation with `ClampGenerations()` method

### ✅ Fixed: Race Condition in Avatar Loading
- **Issue:** Multiple tree renders could cause concurrent avatar loads
- **Fix:** `AbortController` pattern to cancel previous loading
- **Fix:** `cancelAvatarLoading()` called on every `renderTree()`
- **Fix:** `takeUntil(destroy$)` on all subscriptions

### ✅ Fixed: Memory Leak in Avatar Cache
- **Issue:** Cache grew unbounded across navigation
- **Fix:** `LRUAvatarCache` class with max 100 entries / 10MB
- **Fix:** Eviction based on `lastAccessed` timestamp
- **Fix:** Size tracking to enforce memory limit

### ✅ Fixed: Missing Places Batch Load
- **Issue:** Places would be null or require N+1 queries
- **Fix:** `BatchLoadPlacesAsync()` method
- **Fix:** Parallel loading with `Task.WhenAll()`
