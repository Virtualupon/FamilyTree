-- ============================================================
-- FUNCTION: find_relationship_path
-- Fast relationship finding with proper labels and i18n keys
-- Returns simple relationship labels like "Brother", "Father", etc.
-- Includes relationship_name_key for frontend translation
-- ============================================================

DROP FUNCTION IF EXISTS find_relationship_path(UUID, UUID, UUID, INT);
DROP FUNCTION IF EXISTS find_relationship_path(UUID, UUID, INT);

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

    -- Validate persons exist
    IF v_person1_sex IS NULL OR v_person2_sex IS NULL THEN
        RETURN QUERY SELECT
            FALSE,
            -1,
            'error'::VARCHAR(100),
            'Person not found'::VARCHAR(100),
            'relationship.notFound'::VARCHAR(100),
            ARRAY[]::UUID[],
            NULL::UUID;
        RETURN;
    END IF;

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
