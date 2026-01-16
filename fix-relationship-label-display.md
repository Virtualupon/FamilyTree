# Fix Relationship Label Display

## PROBLEM
The relationship path is showing but the label (e.g., "Brother") is not displayed.

The frontend expects these fields:
- `relationshipNameKey` - e.g., "relationship.brother" (for i18n translation)
- `relationshipDescription` - e.g., "Ahmed is the brother of Atef"

## SOLUTION

### Option 1: Quick Fix - Update SQL Function to Return Expected Fields

Update your `find_relationship_path` function to return fields the backend expects:

```sql
DROP FUNCTION IF EXISTS find_relationship_path(UUID, UUID, INT);
DROP FUNCTION IF EXISTS find_relationship_path(UUID, UUID, UUID, INT);

CREATE OR REPLACE FUNCTION find_relationship_path(
    p_person1_id UUID,
    p_person2_id UUID,
    p_tree_id UUID DEFAULT NULL,  -- unused but kept for compatibility
    p_max_depth INT DEFAULT 10
)
RETURNS TABLE (
    path_found BOOLEAN,
    path_length INT,
    relationship_type VARCHAR(100),
    relationship_label VARCHAR(100),
    relationship_name_key VARCHAR(100),
    path_ids UUID[],
    common_ancestor_id UUID
) AS $$
DECLARE
    v_person1_sex INT;
    v_person2_sex INT;
    v_parent_id UUID;
    v_label VARCHAR(100);
    v_key VARCHAR(100);
BEGIN
    -- Get sexes
    SELECT "Sex" INTO v_person1_sex FROM "People" WHERE "Id" = p_person1_id;
    SELECT "Sex" INTO v_person2_sex FROM "People" WHERE "Id" = p_person2_id;

    -- Same person
    IF p_person1_id = p_person2_id THEN
        RETURN QUERY SELECT 
            TRUE,
            0,
            'self'::VARCHAR(100),
            'Self'::VARCHAR(100),
            'relationship.self'::VARCHAR(100),
            ARRAY[p_person1_id],
            NULL::UUID;
        RETURN;
    END IF;

    -- ========================================
    -- PARENT (person2 is parent of person1)
    -- ========================================
    IF EXISTS (
        SELECT 1 FROM "ParentChildren" 
        WHERE "ChildId" = p_person1_id AND "ParentId" = p_person2_id
    ) THEN
        v_label := CASE WHEN v_person2_sex = 0 THEN 'Father' ELSE 'Mother' END;
        v_key := CASE WHEN v_person2_sex = 0 THEN 'relationship.father' ELSE 'relationship.mother' END;
        RETURN QUERY SELECT TRUE, 1, 'parent'::VARCHAR(100), v_label, v_key, 
            ARRAY[p_person1_id, p_person2_id], NULL::UUID;
        RETURN;
    END IF;

    -- ========================================
    -- CHILD (person2 is child of person1)
    -- ========================================
    IF EXISTS (
        SELECT 1 FROM "ParentChildren" 
        WHERE "ParentId" = p_person1_id AND "ChildId" = p_person2_id
    ) THEN
        v_label := CASE WHEN v_person2_sex = 0 THEN 'Son' ELSE 'Daughter' END;
        v_key := CASE WHEN v_person2_sex = 0 THEN 'relationship.son' ELSE 'relationship.daughter' END;
        RETURN QUERY SELECT TRUE, 1, 'child'::VARCHAR(100), v_label, v_key,
            ARRAY[p_person1_id, p_person2_id], NULL::UUID;
        RETURN;
    END IF;

    -- ========================================
    -- SPOUSE
    -- ========================================
    IF EXISTS (
        SELECT 1 FROM "UnionMembers" um1
        JOIN "UnionMembers" um2 ON um1."UnionId" = um2."UnionId"
        WHERE um1."PersonId" = p_person1_id 
          AND um2."PersonId" = p_person2_id
          AND um1."PersonId" != um2."PersonId"
    ) THEN
        v_label := CASE WHEN v_person2_sex = 0 THEN 'Husband' ELSE 'Wife' END;
        v_key := CASE WHEN v_person2_sex = 0 THEN 'relationship.husband' ELSE 'relationship.wife' END;
        RETURN QUERY SELECT TRUE, 1, 'spouse'::VARCHAR(100), v_label, v_key,
            ARRAY[p_person1_id, p_person2_id], NULL::UUID;
        RETURN;
    END IF;

    -- ========================================
    -- SIBLING (share at least one parent)
    -- ========================================
    SELECT pc1."ParentId" INTO v_parent_id
    FROM "ParentChildren" pc1
    JOIN "ParentChildren" pc2 ON pc1."ParentId" = pc2."ParentId"
    WHERE pc1."ChildId" = p_person1_id 
      AND pc2."ChildId" = p_person2_id
      AND pc1."ChildId" != pc2."ChildId"
    LIMIT 1;
    
    IF v_parent_id IS NOT NULL THEN
        v_label := CASE WHEN v_person2_sex = 0 THEN 'Brother' ELSE 'Sister' END;
        v_key := CASE WHEN v_person2_sex = 0 THEN 'relationship.brother' ELSE 'relationship.sister' END;
        RETURN QUERY SELECT TRUE, 2, 'sibling'::VARCHAR(100), v_label, v_key,
            ARRAY[p_person1_id, v_parent_id, p_person2_id], v_parent_id;
        RETURN;
    END IF;

    -- ========================================
    -- GRANDPARENT
    -- ========================================
    IF EXISTS (
        SELECT 1 FROM "ParentChildren" pc1
        JOIN "ParentChildren" pc2 ON pc1."ParentId" = pc2."ChildId"
        WHERE pc1."ChildId" = p_person1_id AND pc2."ParentId" = p_person2_id
    ) THEN
        v_label := CASE WHEN v_person2_sex = 0 THEN 'Grandfather' ELSE 'Grandmother' END;
        v_key := CASE WHEN v_person2_sex = 0 THEN 'relationship.grandfather' ELSE 'relationship.grandmother' END;
        RETURN QUERY SELECT TRUE, 2, 'grandparent'::VARCHAR(100), v_label, v_key,
            (SELECT ARRAY[p_person1_id, pc1."ParentId", p_person2_id]
             FROM "ParentChildren" pc1
             JOIN "ParentChildren" pc2 ON pc1."ParentId" = pc2."ChildId"
             WHERE pc1."ChildId" = p_person1_id AND pc2."ParentId" = p_person2_id
             LIMIT 1),
            NULL::UUID;
        RETURN;
    END IF;

    -- ========================================
    -- GRANDCHILD
    -- ========================================
    IF EXISTS (
        SELECT 1 FROM "ParentChildren" pc1
        JOIN "ParentChildren" pc2 ON pc1."ChildId" = pc2."ParentId"
        WHERE pc1."ParentId" = p_person1_id AND pc2."ChildId" = p_person2_id
    ) THEN
        v_label := CASE WHEN v_person2_sex = 0 THEN 'Grandson' ELSE 'Granddaughter' END;
        v_key := CASE WHEN v_person2_sex = 0 THEN 'relationship.grandson' ELSE 'relationship.granddaughter' END;
        RETURN QUERY SELECT TRUE, 2, 'grandchild'::VARCHAR(100), v_label, v_key,
            (SELECT ARRAY[p_person1_id, pc1."ChildId", p_person2_id]
             FROM "ParentChildren" pc1
             JOIN "ParentChildren" pc2 ON pc1."ChildId" = pc2."ParentId"
             WHERE pc1."ParentId" = p_person1_id AND pc2."ChildId" = p_person2_id
             LIMIT 1),
            NULL::UUID;
        RETURN;
    END IF;

    -- ========================================
    -- UNCLE/AUNT
    -- ========================================
    IF EXISTS (
        SELECT 1 FROM "ParentChildren" pc1
        JOIN "ParentChildren" pc2 ON pc1."ParentId" = pc2."ChildId"
        JOIN "ParentChildren" pc3 ON pc2."ParentId" = pc3."ParentId"
        WHERE pc1."ChildId" = p_person1_id 
          AND pc3."ChildId" = p_person2_id
          AND pc1."ParentId" != p_person2_id
    ) THEN
        v_label := CASE WHEN v_person2_sex = 0 THEN 'Uncle' ELSE 'Aunt' END;
        v_key := CASE WHEN v_person2_sex = 0 THEN 'relationship.uncle' ELSE 'relationship.aunt' END;
        RETURN QUERY SELECT TRUE, 3, 'uncle_aunt'::VARCHAR(100), v_label, v_key,
            ARRAY[p_person1_id, p_person2_id], NULL::UUID;
        RETURN;
    END IF;

    -- ========================================
    -- NEPHEW/NIECE
    -- ========================================
    IF EXISTS (
        SELECT 1 FROM "ParentChildren" pc1
        JOIN "ParentChildren" pc2 ON pc1."ParentId" = pc2."ParentId"
        JOIN "ParentChildren" pc3 ON pc2."ChildId" = pc3."ParentId"
        WHERE pc1."ChildId" = p_person1_id 
          AND pc3."ChildId" = p_person2_id
          AND pc2."ChildId" != p_person1_id
    ) THEN
        v_label := CASE WHEN v_person2_sex = 0 THEN 'Nephew' ELSE 'Niece' END;
        v_key := CASE WHEN v_person2_sex = 0 THEN 'relationship.nephew' ELSE 'relationship.niece' END;
        RETURN QUERY SELECT TRUE, 3, 'nephew_niece'::VARCHAR(100), v_label, v_key,
            ARRAY[p_person1_id, p_person2_id], NULL::UUID;
        RETURN;
    END IF;

    -- ========================================
    -- COUSIN
    -- ========================================
    IF EXISTS (
        SELECT 1 FROM "ParentChildren" pc1
        JOIN "ParentChildren" pc2 ON pc1."ParentId" = pc2."ChildId"
        JOIN "ParentChildren" pc3 ON pc2."ParentId" = pc3."ParentId"
        JOIN "ParentChildren" pc4 ON pc3."ChildId" = pc4."ParentId"
        WHERE pc1."ChildId" = p_person1_id 
          AND pc4."ChildId" = p_person2_id
          AND pc1."ParentId" != pc3."ChildId"
    ) THEN
        RETURN QUERY SELECT TRUE, 4, 'cousin'::VARCHAR(100), 'Cousin'::VARCHAR(100), 
            'relationship.cousin'::VARCHAR(100), ARRAY[p_person1_id, p_person2_id], NULL::UUID;
        RETURN;
    END IF;

    -- ========================================
    -- BFS FOR DISTANT RELATIONSHIPS
    -- ========================================
    RETURN QUERY
    WITH RECURSIVE bfs AS (
        SELECT 
            p_person1_id AS current_id,
            ARRAY[p_person1_id] AS path,
            0 AS depth
        
        UNION ALL
        
        SELECT 
            next_id,
            bfs.path || next_id,
            bfs.depth + 1
        FROM bfs
        CROSS JOIN LATERAL (
            SELECT pc."ParentId" AS next_id FROM "ParentChildren" pc 
            WHERE pc."ChildId" = bfs.current_id AND NOT pc."ParentId" = ANY(bfs.path)
            UNION ALL
            SELECT pc."ChildId" FROM "ParentChildren" pc 
            WHERE pc."ParentId" = bfs.current_id AND NOT pc."ChildId" = ANY(bfs.path)
            UNION ALL
            SELECT um2."PersonId" FROM "UnionMembers" um1
            JOIN "UnionMembers" um2 ON um1."UnionId" = um2."UnionId"
            WHERE um1."PersonId" = bfs.current_id 
              AND um2."PersonId" != bfs.current_id
              AND NOT um2."PersonId" = ANY(bfs.path)
        ) neighbors
        WHERE bfs.depth < p_max_depth
    )
    SELECT 
        TRUE,
        bfs.depth,
        'distant'::VARCHAR(100),
        ('Related (' || bfs.depth || ' steps)')::VARCHAR(100),
        'relationship.related'::VARCHAR(100),
        bfs.path,
        NULL::UUID
    FROM bfs
    WHERE bfs.current_id = p_person2_id
    ORDER BY bfs.depth
    LIMIT 1;

    -- If nothing found
    IF NOT FOUND THEN
        RETURN QUERY SELECT 
            FALSE,
            -1,
            'none'::VARCHAR(100),
            'Not Related'::VARCHAR(100),
            'relationship.notRelated'::VARCHAR(100),
            ARRAY[]::UUID[],
            NULL::UUID;
    END IF;
END;
$$ LANGUAGE plpgsql;
```

---

### Option 2: Update TreeViewService to Use SQL Function

**File:** `api/FamilyTreeApi/Services/TreeViewService.cs`

Replace the `FindRelationshipPathAsync` method with:

```csharp
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

        // Call the optimized SQL function
        using var connection = new NpgsqlConnection(_connectionString);
        await connection.OpenAsync(cancellationToken);

        var sql = @"
            SELECT 
                path_found,
                path_length,
                relationship_type,
                relationship_label,
                relationship_name_key,
                path_ids,
                common_ancestor_id
            FROM find_relationship_path(@Person1Id, @Person2Id, @TreeId, @MaxDepth)";

        var result = await connection.QueryFirstOrDefaultAsync<dynamic>(sql, new
        {
            Person1Id = request.Person1Id,
            Person2Id = request.Person2Id,
            TreeId = orgId,
            MaxDepth = request.MaxSearchDepth
        });

        if (result == null || !(bool)result.path_found)
        {
            return ServiceResult<RelationshipPathResponse>.Success(new RelationshipPathResponse
            {
                PathFound = false,
                RelationshipNameKey = "relationship.noRelationFound",
                ErrorMessage = "No relationship path found between these individuals."
            });
        }

        // Get full person details for the path
        var pathIds = ((Guid[])result.path_ids)?.ToList() ?? new List<Guid>();
        var pathPersons = new List<PathPersonNode>();
        
        for (int i = 0; i < pathIds.Count; i++)
        {
            var person = await GetPathPersonNodeAsync(pathIds[i], cancellationToken);
            if (person != null)
            {
                // Set edge type based on position
                if (i < pathIds.Count - 1)
                {
                    person.EdgeToNext = await DetermineEdgeType(pathIds[i], pathIds[i + 1], cancellationToken);
                    person.RelationshipToNextKey = GetEdgeRelationshipKey(person.EdgeToNext, person.Sex);
                }
                pathPersons.Add(person);
            }
        }

        return ServiceResult<RelationshipPathResponse>.Success(new RelationshipPathResponse
        {
            PathFound = true,
            RelationshipNameKey = (string)result.relationship_name_key,
            RelationshipDescription = (string)result.relationship_label,
            Path = pathPersons,
            PathLength = pathPersons.Count
        });
    }
    catch (Exception ex)
    {
        _logger.LogError(ex, "Error finding relationship path between {Person1Id} and {Person2Id}",
            request.Person1Id, request.Person2Id);
        return ServiceResult<RelationshipPathResponse>.InternalError("Error finding relationship path");
    }
}

private async Task<RelationshipEdgeType> DetermineEdgeType(Guid fromId, Guid toId, CancellationToken cancellationToken)
{
    // Check if fromId is parent of toId
    var isParent = await _context.ParentChildren
        .AnyAsync(pc => pc.ParentId == fromId && pc.ChildId == toId, cancellationToken);
    if (isParent) return RelationshipEdgeType.Parent;

    // Check if fromId is child of toId
    var isChild = await _context.ParentChildren
        .AnyAsync(pc => pc.ChildId == fromId && pc.ParentId == toId, cancellationToken);
    if (isChild) return RelationshipEdgeType.Child;

    // Check if spouse
    var isSpouse = await _context.UnionMembers
        .AnyAsync(um1 => um1.PersonId == fromId && 
            _context.UnionMembers.Any(um2 => um2.UnionId == um1.UnionId && um2.PersonId == toId), 
            cancellationToken);
    if (isSpouse) return RelationshipEdgeType.Spouse;

    return RelationshipEdgeType.None;
}
```

---

### Option 3: Quick Frontend Fix (if backend already returns the data)

If the backend IS returning `relationshipLabel` but it's not being displayed, check that the property names match:

**In the API response JSON:**
```json
{
  "pathFound": true,
  "relationshipNameKey": "relationship.brother",
  "relationshipDescription": "Brother",
  "path": [...],
  "pathLength": 2
}
```

**Frontend expects:** `pathData.relationshipNameKey` and `pathData.relationshipDescription`

---

## ADD TRANSLATION KEYS

Add these to your i18n files:

**English (`en.json`):**
```json
{
  "relationship": {
    "brother": "Brother",
    "sister": "Sister",
    "father": "Father",
    "mother": "Mother",
    "son": "Son",
    "daughter": "Daughter",
    "grandfather": "Grandfather",
    "grandmother": "Grandmother",
    "grandson": "Grandson",
    "granddaughter": "Granddaughter",
    "uncle": "Uncle",
    "aunt": "Aunt",
    "nephew": "Nephew",
    "niece": "Niece",
    "cousin": "Cousin",
    "husband": "Husband",
    "wife": "Wife",
    "related": "Related",
    "notRelated": "Not Related",
    "self": "Self"
  }
}
```

**Arabic (`ar.json`):**
```json
{
  "relationship": {
    "brother": "أخ",
    "sister": "أخت",
    "father": "أب",
    "mother": "أم",
    "son": "ابن",
    "daughter": "ابنة",
    "grandfather": "جد",
    "grandmother": "جدة",
    "grandson": "حفيد",
    "granddaughter": "حفيدة",
    "uncle": "عم",
    "aunt": "عمة",
    "nephew": "ابن أخ",
    "niece": "ابنة أخ",
    "cousin": "ابن عم",
    "husband": "زوج",
    "wife": "زوجة",
    "related": "قريب",
    "notRelated": "غير قريب",
    "self": "نفس الشخص"
  }
}
```

---

## VERIFICATION

After implementing:

1. Search for relationship between Atef and Ahmed
2. Should display:
   - Title: **"Brother"** (or "أخ" in Arabic)
   - Path diagram shows: Atef → Mohamed → Ahmed

The relationship label should appear in the header of the relationship path overlay.
