-- Migration: Switch from PersonNames table to direct name columns on People table
-- This migration adds NameArabic, NameEnglish, NameNobiin columns and creates search functions

-- ============================================================================
-- STEP 1: Add new columns to People table (if they don't exist)
-- ============================================================================

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'People' AND column_name = 'NameArabic') THEN
        ALTER TABLE public."People" ADD COLUMN "NameArabic" character varying(300);
        COMMENT ON COLUMN public."People"."NameArabic" IS 'Name in Arabic script';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'People' AND column_name = 'NameEnglish') THEN
        ALTER TABLE public."People" ADD COLUMN "NameEnglish" character varying(300);
        COMMENT ON COLUMN public."People"."NameEnglish" IS 'Name in English/Latin script';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'People' AND column_name = 'NameNobiin') THEN
        ALTER TABLE public."People" ADD COLUMN "NameNobiin" character varying(300);
        COMMENT ON COLUMN public."People"."NameNobiin" IS 'Name in Nobiin (Coptic) script';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'People' AND column_name = 'FamilyId') THEN
        ALTER TABLE public."People" ADD COLUMN "FamilyId" uuid;
    END IF;
END $$;

-- ============================================================================
-- STEP 2: Create indexes for name columns (for fast searching)
-- ============================================================================

-- Check if pg_trgm extension exists, create if not
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS "IX_People_NameArabic" ON public."People" USING gin ("NameArabic" public.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "IX_People_NameEnglish" ON public."People" USING gin ("NameEnglish" public.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "IX_People_NameNobiin" ON public."People" USING gin ("NameNobiin" public.gin_trgm_ops);

-- ============================================================================
-- STEP 3: Migrate existing data from PersonNames to direct columns (if table exists)
-- ============================================================================

DO $$
BEGIN
    -- Only migrate if PersonNames table exists
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'PersonNames') THEN
        -- Migrate Arabic names (Script = 'Arabic')
        UPDATE public."People" p
        SET "NameArabic" = pn."Full"
        FROM public."PersonNames" pn
        WHERE pn."PersonId" = p."Id"
          AND pn."Script" = 'Arabic'
          AND p."NameArabic" IS NULL;

        -- Migrate English/Latin names (Script = 'Latin')
        UPDATE public."People" p
        SET "NameEnglish" = pn."Full"
        FROM public."PersonNames" pn
        WHERE pn."PersonId" = p."Id"
          AND pn."Script" = 'Latin'
          AND p."NameEnglish" IS NULL;

        -- Migrate Nobiin/Coptic names (Script = 'Coptic')
        UPDATE public."People" p
        SET "NameNobiin" = pn."Full"
        FROM public."PersonNames" pn
        WHERE pn."PersonId" = p."Id"
          AND pn."Script" = 'Coptic'
          AND p."NameNobiin" IS NULL;

        RAISE NOTICE 'Migrated names from PersonNames table';
    ELSE
        RAISE NOTICE 'PersonNames table does not exist, skipping migration';
    END IF;
END $$;

-- ============================================================================
-- STEP 4: Create unified search function
-- ============================================================================

-- Drop existing function if it exists (required when changing return type)
DROP FUNCTION IF EXISTS search_persons_unified(TEXT, TEXT, UUID, UUID, UUID, TEXT, BOOLEAN, INT, INT, INT, INT);

CREATE OR REPLACE FUNCTION search_persons_unified(
    p_query TEXT DEFAULT NULL,
    p_search_in TEXT DEFAULT 'auto',
    p_tree_id UUID DEFAULT NULL,
    p_town_id UUID DEFAULT NULL,
    p_family_id UUID DEFAULT NULL,
    p_sex TEXT DEFAULT NULL,
    p_is_living BOOLEAN DEFAULT NULL,
    p_birth_year_from INT DEFAULT NULL,
    p_birth_year_to INT DEFAULT NULL,
    p_page INT DEFAULT 1,
    p_page_size INT DEFAULT 20
)
RETURNS TABLE (
    total_count BIGINT,
    page INT,
    page_size INT,
    person_id UUID,
    primary_name VARCHAR(200),
    name_arabic VARCHAR(300),
    name_english VARCHAR(300),
    name_nobiin VARCHAR(300),
    -- Father info
    father_id UUID,
    father_name_arabic VARCHAR(300),
    father_name_english VARCHAR(300),
    father_name_nobiin VARCHAR(300),
    -- Grandfather info
    grandfather_id UUID,
    grandfather_name_arabic VARCHAR(300),
    grandfather_name_english VARCHAR(300),
    grandfather_name_nobiin VARCHAR(300),
    sex INT,
    birth_date TIMESTAMP,
    birth_precision INT,
    death_date TIMESTAMP,
    death_precision INT,
    birth_place_name VARCHAR(200),
    death_place_name VARCHAR(200),
    is_living BOOLEAN,
    family_id UUID,
    family_name VARCHAR(200),
    org_id UUID,
    names JSONB,
    parents_count BIGINT,
    children_count BIGINT,
    spouses_count BIGINT,
    media_count BIGINT
) AS $$
DECLARE
    v_offset INT;
    v_total BIGINT;
    v_search_pattern TEXT;
    v_tree_ids UUID[];
BEGIN
    -- Calculate offset
    v_offset := (p_page - 1) * p_page_size;

    -- Prepare search pattern for ILIKE
    IF p_query IS NOT NULL AND p_query != '' THEN
        v_search_pattern := '%' || p_query || '%';
    END IF;

    -- If searching by town, get all tree IDs in that town
    IF p_town_id IS NOT NULL THEN
        SELECT ARRAY_AGG(o."Id") INTO v_tree_ids
        FROM public."Orgs" o
        WHERE o."TownId" = p_town_id;
    END IF;

    -- Get total count
    SELECT COUNT(*) INTO v_total
    FROM public."People" p
    LEFT JOIN public."Orgs" o ON p."OrgId" = o."Id"
    WHERE
        -- Tree/Town filter
        (p_tree_id IS NULL OR p."OrgId" = p_tree_id)
        AND (p_town_id IS NULL OR p."OrgId" = ANY(v_tree_ids))
        AND (p_family_id IS NULL OR p."FamilyId" = p_family_id)
        -- Sex filter
        AND (p_sex IS NULL OR
            (p_sex = 'Male' AND p."Sex" = 0) OR
            (p_sex = 'Female' AND p."Sex" = 1) OR
            (p_sex = 'Unknown' AND p."Sex" = 2))
        -- Living status filter
        AND (p_is_living IS NULL OR
            (p_is_living = TRUE AND p."DeathDate" IS NULL) OR
            (p_is_living = FALSE AND p."DeathDate" IS NOT NULL))
        -- Birth year filter
        AND (p_birth_year_from IS NULL OR EXTRACT(YEAR FROM p."BirthDate") >= p_birth_year_from)
        AND (p_birth_year_to IS NULL OR EXTRACT(YEAR FROM p."BirthDate") <= p_birth_year_to)
        -- Name search (across all name columns)
        AND (v_search_pattern IS NULL OR (
            CASE p_search_in
                WHEN 'arabic' THEN p."NameArabic" ILIKE v_search_pattern
                WHEN 'latin' THEN p."NameEnglish" ILIKE v_search_pattern
                WHEN 'coptic' THEN p."NameNobiin" ILIKE v_search_pattern
                WHEN 'nobiin' THEN p."NameNobiin" ILIKE v_search_pattern
                ELSE -- 'auto' or 'all' - search all columns
                    p."PrimaryName" ILIKE v_search_pattern OR
                    p."NameArabic" ILIKE v_search_pattern OR
                    p."NameEnglish" ILIKE v_search_pattern OR
                    p."NameNobiin" ILIKE v_search_pattern
            END
        ));

    -- Return results
    RETURN QUERY
    SELECT
        v_total AS total_count,
        p_page AS page,
        p_page_size AS page_size,
        p."Id" AS person_id,
        p."PrimaryName" AS primary_name,
        p."NameArabic" AS name_arabic,
        p."NameEnglish" AS name_english,
        p."NameNobiin" AS name_nobiin,
        -- Father (male parent)
        father_data.father_id,
        father_data.father_name_arabic,
        father_data.father_name_english,
        father_data.father_name_nobiin,
        -- Grandfather (father's male parent)
        grandfather_data.grandfather_id,
        grandfather_data.grandfather_name_arabic,
        grandfather_data.grandfather_name_english,
        grandfather_data.grandfather_name_nobiin,
        p."Sex" AS sex,
        p."BirthDate" AS birth_date,
        p."BirthPrecision" AS birth_precision,
        p."DeathDate" AS death_date,
        p."DeathPrecision" AS death_precision,
        bp."Name" AS birth_place_name,
        dp."Name" AS death_place_name,
        (p."DeathDate" IS NULL) AS is_living,
        p."FamilyId" AS family_id,
        f."Name" AS family_name,
        p."OrgId" AS org_id,
        -- Build names JSONB for backward compatibility
        COALESCE(
            (SELECT jsonb_agg(
                jsonb_build_object(
                    'id', gen_random_uuid(),
                    'fullName', name_val,
                    'script', script_val,
                    'nameType', 0
                )
            )
            FROM (
                SELECT p."NameArabic" AS name_val, 'Arabic' AS script_val WHERE p."NameArabic" IS NOT NULL
                UNION ALL
                SELECT p."NameEnglish", 'Latin' WHERE p."NameEnglish" IS NOT NULL
                UNION ALL
                SELECT p."NameNobiin", 'Coptic' WHERE p."NameNobiin" IS NOT NULL
            ) name_rows),
            '[]'::jsonb
        ) AS names,
        (SELECT COUNT(*) FROM public."ParentChildren" pc WHERE pc."ChildId" = p."Id") AS parents_count,
        (SELECT COUNT(*) FROM public."ParentChildren" pc WHERE pc."ParentId" = p."Id") AS children_count,
        (SELECT COUNT(*) FROM public."UnionMembers" um WHERE um."PersonId" = p."Id") AS spouses_count,
        (SELECT COUNT(*) FROM public."PersonMedia" pm WHERE pm."PersonId" = p."Id") AS media_count
    FROM public."People" p
    LEFT JOIN public."Places" bp ON p."BirthPlaceId" = bp."Id"
    LEFT JOIN public."Places" dp ON p."DeathPlaceId" = dp."Id"
    LEFT JOIN public."Orgs" o ON p."OrgId" = o."Id"
    LEFT JOIN public."Families" f ON p."FamilyId" = f."Id"
    -- Father subquery
    LEFT JOIN LATERAL (
        SELECT
            parent."Id" AS father_id,
            parent."NameArabic" AS father_name_arabic,
            parent."NameEnglish" AS father_name_english,
            parent."NameNobiin" AS father_name_nobiin
        FROM public."ParentChildren" pc
        JOIN public."People" parent ON pc."ParentId" = parent."Id"
        WHERE pc."ChildId" = p."Id" AND parent."Sex" = 0  -- 0 = Male
        LIMIT 1
    ) father_data ON TRUE
    -- Grandfather subquery (father's father)
    LEFT JOIN LATERAL (
        SELECT
            grandparent."Id" AS grandfather_id,
            grandparent."NameArabic" AS grandfather_name_arabic,
            grandparent."NameEnglish" AS grandfather_name_english,
            grandparent."NameNobiin" AS grandfather_name_nobiin
        FROM public."ParentChildren" pc1
        JOIN public."People" father ON pc1."ParentId" = father."Id"
        JOIN public."ParentChildren" pc2 ON pc2."ChildId" = father."Id"
        JOIN public."People" grandparent ON pc2."ParentId" = grandparent."Id"
        WHERE pc1."ChildId" = p."Id"
          AND father."Sex" = 0
          AND grandparent."Sex" = 0
        LIMIT 1
    ) grandfather_data ON TRUE
    WHERE
        -- Tree/Town filter
        (p_tree_id IS NULL OR p."OrgId" = p_tree_id)
        AND (p_town_id IS NULL OR p."OrgId" = ANY(v_tree_ids))
        AND (p_family_id IS NULL OR p."FamilyId" = p_family_id)
        -- Sex filter
        AND (p_sex IS NULL OR
            (p_sex = 'Male' AND p."Sex" = 0) OR
            (p_sex = 'Female' AND p."Sex" = 1) OR
            (p_sex = 'Unknown' AND p."Sex" = 2))
        -- Living status filter
        AND (p_is_living IS NULL OR
            (p_is_living = TRUE AND p."DeathDate" IS NULL) OR
            (p_is_living = FALSE AND p."DeathDate" IS NOT NULL))
        -- Birth year filter
        AND (p_birth_year_from IS NULL OR EXTRACT(YEAR FROM p."BirthDate") >= p_birth_year_from)
        AND (p_birth_year_to IS NULL OR EXTRACT(YEAR FROM p."BirthDate") <= p_birth_year_to)
        -- Name search
        AND (v_search_pattern IS NULL OR (
            CASE p_search_in
                WHEN 'arabic' THEN p."NameArabic" ILIKE v_search_pattern
                WHEN 'latin' THEN p."NameEnglish" ILIKE v_search_pattern
                WHEN 'coptic' THEN p."NameNobiin" ILIKE v_search_pattern
                WHEN 'nobiin' THEN p."NameNobiin" ILIKE v_search_pattern
                ELSE
                    p."PrimaryName" ILIKE v_search_pattern OR
                    p."NameArabic" ILIKE v_search_pattern OR
                    p."NameEnglish" ILIKE v_search_pattern OR
                    p."NameNobiin" ILIKE v_search_pattern
            END
        ))
    ORDER BY p."PrimaryName" NULLS LAST
    OFFSET v_offset
    LIMIT p_page_size;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- STEP 5: Create family tree data function
-- ============================================================================

-- Drop existing function if it exists (required when changing return type)
DROP FUNCTION IF EXISTS get_family_tree_data(UUID, TEXT, INT, BOOLEAN);

CREATE OR REPLACE FUNCTION get_family_tree_data(
    p_root_person_id UUID,
    p_view_mode TEXT DEFAULT 'pedigree',
    p_generations INT DEFAULT 3,
    p_include_spouses BOOLEAN DEFAULT TRUE
)
RETURNS TABLE (
    person_id UUID,
    primary_name VARCHAR(200),
    name_arabic VARCHAR(300),
    name_english VARCHAR(300),
    name_nobiin VARCHAR(300),
    sex INT,
    birth_date TIMESTAMP,
    death_date TIMESTAMP,
    birth_place VARCHAR(200),
    death_place VARCHAR(200),
    is_living BOOLEAN,
    generation_level INT,
    relationship_type TEXT,
    parent_id UUID,
    spouse_union_id UUID,
    names JSONB
) AS $$
BEGIN
    -- For pedigree view, get ancestors
    IF p_view_mode = 'pedigree' THEN
        RETURN QUERY
        WITH RECURSIVE ancestors AS (
            -- Root person
            SELECT
                p."Id",
                p."PrimaryName",
                p."NameArabic",
                p."NameEnglish",
                p."NameNobiin",
                p."Sex",
                p."BirthDate",
                p."DeathDate",
                p."BirthPlaceId",
                p."DeathPlaceId",
                0 AS gen_level,
                'self'::TEXT AS rel_type,
                NULL::UUID AS parent_id
            FROM public."People" p
            WHERE p."Id" = p_root_person_id

            UNION ALL

            -- Parents
            SELECT
                parent."Id",
                parent."PrimaryName",
                parent."NameArabic",
                parent."NameEnglish",
                parent."NameNobiin",
                parent."Sex",
                parent."BirthDate",
                parent."DeathDate",
                parent."BirthPlaceId",
                parent."DeathPlaceId",
                a.gen_level + 1,
                'parent'::TEXT,
                a."Id"
            FROM ancestors a
            JOIN public."ParentChildren" pc ON pc."ChildId" = a."Id"
            JOIN public."People" parent ON parent."Id" = pc."ParentId"
            WHERE a.gen_level < p_generations
        )
        SELECT
            a."Id" AS person_id,
            a."PrimaryName" AS primary_name,
            a."NameArabic" AS name_arabic,
            a."NameEnglish" AS name_english,
            a."NameNobiin" AS name_nobiin,
            a."Sex" AS sex,
            a."BirthDate" AS birth_date,
            a."DeathDate" AS death_date,
            bp."Name" AS birth_place,
            dp."Name" AS death_place,
            (a."DeathDate" IS NULL) AS is_living,
            a.gen_level AS generation_level,
            a.rel_type AS relationship_type,
            a.parent_id,
            NULL::UUID AS spouse_union_id,
            '[]'::JSONB AS names
        FROM ancestors a
        LEFT JOIN public."Places" bp ON a."BirthPlaceId" = bp."Id"
        LEFT JOIN public."Places" dp ON a."DeathPlaceId" = dp."Id";

    -- For descendants view
    ELSIF p_view_mode = 'descendants' THEN
        RETURN QUERY
        WITH RECURSIVE descendants AS (
            -- Root person
            SELECT
                p."Id",
                p."PrimaryName",
                p."NameArabic",
                p."NameEnglish",
                p."NameNobiin",
                p."Sex",
                p."BirthDate",
                p."DeathDate",
                p."BirthPlaceId",
                p."DeathPlaceId",
                0 AS gen_level,
                'self'::TEXT AS rel_type,
                NULL::UUID AS parent_id
            FROM public."People" p
            WHERE p."Id" = p_root_person_id

            UNION ALL

            -- Children
            SELECT
                child."Id",
                child."PrimaryName",
                child."NameArabic",
                child."NameEnglish",
                child."NameNobiin",
                child."Sex",
                child."BirthDate",
                child."DeathDate",
                child."BirthPlaceId",
                child."DeathPlaceId",
                d.gen_level + 1,
                'child'::TEXT,
                d."Id"
            FROM descendants d
            JOIN public."ParentChildren" pc ON pc."ParentId" = d."Id"
            JOIN public."People" child ON child."Id" = pc."ChildId"
            WHERE d.gen_level < p_generations
        )
        SELECT
            d."Id" AS person_id,
            d."PrimaryName" AS primary_name,
            d."NameArabic" AS name_arabic,
            d."NameEnglish" AS name_english,
            d."NameNobiin" AS name_nobiin,
            d."Sex" AS sex,
            d."BirthDate" AS birth_date,
            d."DeathDate" AS death_date,
            bp."Name" AS birth_place,
            dp."Name" AS death_place,
            (d."DeathDate" IS NULL) AS is_living,
            d.gen_level AS generation_level,
            d.rel_type AS relationship_type,
            d.parent_id,
            NULL::UUID AS spouse_union_id,
            '[]'::JSONB AS names
        FROM descendants d
        LEFT JOIN public."Places" bp ON d."BirthPlaceId" = bp."Id"
        LEFT JOIN public."Places" dp ON d."DeathPlaceId" = dp."Id";
    END IF;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- STEP 6: Create person details function
-- ============================================================================

-- Drop existing function if it exists (required when changing return type)
DROP FUNCTION IF EXISTS get_person_details(UUID);

CREATE OR REPLACE FUNCTION get_person_details(p_person_id UUID)
RETURNS TABLE (
    person_id UUID,
    primary_name VARCHAR(200),
    name_arabic VARCHAR(300),
    name_english VARCHAR(300),
    name_nobiin VARCHAR(300),
    sex INT,
    birth_date TIMESTAMP,
    birth_precision INT,
    death_date TIMESTAMP,
    death_precision INT,
    birth_place_id UUID,
    birth_place_name VARCHAR(200),
    death_place_id UUID,
    death_place_name VARCHAR(200),
    is_living BOOLEAN,
    notes TEXT,
    family_id UUID,
    family_name VARCHAR(200),
    org_id UUID,
    created_at TIMESTAMP,
    updated_at TIMESTAMP,
    names JSONB,
    parents JSONB,
    children JSONB,
    spouses JSONB,
    siblings JSONB
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        p."Id" AS person_id,
        p."PrimaryName" AS primary_name,
        p."NameArabic" AS name_arabic,
        p."NameEnglish" AS name_english,
        p."NameNobiin" AS name_nobiin,
        p."Sex" AS sex,
        p."BirthDate" AS birth_date,
        p."BirthPrecision" AS birth_precision,
        p."DeathDate" AS death_date,
        p."DeathPrecision" AS death_precision,
        p."BirthPlaceId" AS birth_place_id,
        bp."Name" AS birth_place_name,
        p."DeathPlaceId" AS death_place_id,
        dp."Name" AS death_place_name,
        (p."DeathDate" IS NULL) AS is_living,
        p."Notes" AS notes,
        p."FamilyId" AS family_id,
        f."Name" AS family_name,
        p."OrgId" AS org_id,
        p."CreatedAt" AS created_at,
        p."UpdatedAt" AS updated_at,
        '[]'::JSONB AS names,
        -- Parents
        COALESCE(
            (SELECT jsonb_agg(jsonb_build_object(
                'relationshipId', pc."Id",
                'personId', parent."Id",
                'name', COALESCE(parent."NameArabic", parent."NameEnglish", parent."PrimaryName"),
                'sex', parent."Sex",
                'relationshipType', 'parent',
                'birthYear', EXTRACT(YEAR FROM parent."BirthDate"),
                'deathYear', EXTRACT(YEAR FROM parent."DeathDate"),
                'isLiving', parent."DeathDate" IS NULL
            ))
            FROM public."ParentChildren" pc
            JOIN public."People" parent ON parent."Id" = pc."ParentId"
            WHERE pc."ChildId" = p."Id"),
            '[]'::JSONB
        ) AS parents,
        -- Children
        COALESCE(
            (SELECT jsonb_agg(jsonb_build_object(
                'relationshipId', pc."Id",
                'personId', child."Id",
                'name', COALESCE(child."NameArabic", child."NameEnglish", child."PrimaryName"),
                'sex', child."Sex",
                'relationshipType', 'child',
                'birthYear', EXTRACT(YEAR FROM child."BirthDate"),
                'deathYear', EXTRACT(YEAR FROM child."DeathDate"),
                'isLiving', child."DeathDate" IS NULL
            ))
            FROM public."ParentChildren" pc
            JOIN public."People" child ON child."Id" = pc."ChildId"
            WHERE pc."ParentId" = p."Id"),
            '[]'::JSONB
        ) AS children,
        -- Spouses
        COALESCE(
            (SELECT jsonb_agg(jsonb_build_object(
                'unionId', u."Id",
                'personId', spouse."Id",
                'name', COALESCE(spouse."NameArabic", spouse."NameEnglish", spouse."PrimaryName"),
                'sex', spouse."Sex",
                'unionType', u."Type",
                'startDate', u."StartDate",
                'endDate', u."EndDate",
                'birthYear', EXTRACT(YEAR FROM spouse."BirthDate"),
                'deathYear', EXTRACT(YEAR FROM spouse."DeathDate"),
                'isLiving', spouse."DeathDate" IS NULL
            ))
            FROM public."UnionMembers" um
            JOIN public."Unions" u ON u."Id" = um."UnionId"
            JOIN public."UnionMembers" um2 ON um2."UnionId" = u."Id" AND um2."PersonId" != p."Id"
            JOIN public."People" spouse ON spouse."Id" = um2."PersonId"
            WHERE um."PersonId" = p."Id"),
            '[]'::JSONB
        ) AS spouses,
        -- Siblings (share at least one parent)
        COALESCE(
            (SELECT jsonb_agg(DISTINCT jsonb_build_object(
                'personId', sibling."Id",
                'name', COALESCE(sibling."NameArabic", sibling."NameEnglish", sibling."PrimaryName"),
                'sex', sibling."Sex",
                'relationshipType', 'sibling',
                'birthYear', EXTRACT(YEAR FROM sibling."BirthDate"),
                'deathYear', EXTRACT(YEAR FROM sibling."DeathDate"),
                'isLiving', sibling."DeathDate" IS NULL,
                'isFullSibling', TRUE
            ))
            FROM public."ParentChildren" pc1
            JOIN public."ParentChildren" pc2 ON pc2."ParentId" = pc1."ParentId" AND pc2."ChildId" != p."Id"
            JOIN public."People" sibling ON sibling."Id" = pc2."ChildId"
            WHERE pc1."ChildId" = p."Id"),
            '[]'::JSONB
        ) AS siblings
    FROM public."People" p
    LEFT JOIN public."Places" bp ON p."BirthPlaceId" = bp."Id"
    LEFT JOIN public."Places" dp ON p."DeathPlaceId" = dp."Id"
    LEFT JOIN public."Families" f ON p."FamilyId" = f."Id"
    WHERE p."Id" = p_person_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- STEP 7: Create relationship path finding function
-- ============================================================================

-- Drop existing function if it exists (required when changing return type)
DROP FUNCTION IF EXISTS find_relationship_path(UUID, UUID, UUID, INT);

CREATE OR REPLACE FUNCTION find_relationship_path(
    p_person1_id UUID,
    p_person2_id UUID,
    p_tree_id UUID DEFAULT NULL,
    p_max_depth INT DEFAULT 15
)
RETURNS TABLE (
    path_found BOOLEAN,
    path_length INT,
    path_nodes JSONB,
    path_relationships JSONB,
    relationship_summary TEXT
) AS $$
DECLARE
    v_path UUID[];
    v_rel_types TEXT[];
    v_path_nodes JSONB := '[]'::JSONB;
    v_path_rels JSONB := '[]'::JSONB;
    v_found BOOLEAN := FALSE;
    v_length INT := 0;
    v_i INT;
    v_person_id UUID;
    v_person_name TEXT;
    v_person_sex INT;
BEGIN
    -- Handle same person case
    IF p_person1_id = p_person2_id THEN
        v_found := TRUE;
        v_length := 0;

        SELECT COALESCE(p."NameArabic", p."NameEnglish", p."PrimaryName"), p."Sex"
        INTO v_person_name, v_person_sex
        FROM public."People" p
        WHERE p."Id" = p_person1_id;

        v_path_nodes := jsonb_build_array(
            jsonb_build_object('personId', p_person1_id, 'name', v_person_name, 'sex', v_person_sex)
        );

        RETURN QUERY SELECT v_found, v_length, v_path_nodes, v_path_rels, 'Same person'::TEXT;
        RETURN;
    END IF;

    -- Use BFS to find shortest path
    WITH RECURSIVE search AS (
        -- Start from person1
        SELECT
            p."Id" AS current_id,
            ARRAY[p."Id"] AS path,
            ARRAY[]::TEXT[] AS rel_types,
            0 AS depth
        FROM public."People" p
        WHERE p."Id" = p_person1_id
          AND (p_tree_id IS NULL OR p."OrgId" = p_tree_id)

        UNION ALL

        -- Expand through parent-child and spouse relationships
        SELECT
            next_person."Id",
            s.path || next_person."Id",
            s.rel_types || rel_type,
            s.depth + 1
        FROM search s
        CROSS JOIN LATERAL (
            -- Parents
            SELECT pc."ParentId" AS person_id, 'parent'::TEXT AS rel_type
            FROM public."ParentChildren" pc
            WHERE pc."ChildId" = s.current_id
              AND NOT pc."ParentId" = ANY(s.path)

            UNION ALL

            -- Children
            SELECT pc."ChildId" AS person_id, 'child'::TEXT AS rel_type
            FROM public."ParentChildren" pc
            WHERE pc."ParentId" = s.current_id
              AND NOT pc."ChildId" = ANY(s.path)

            UNION ALL

            -- Spouses
            SELECT um2."PersonId" AS person_id, 'spouse'::TEXT AS rel_type
            FROM public."UnionMembers" um1
            JOIN public."UnionMembers" um2 ON um2."UnionId" = um1."UnionId" AND um2."PersonId" != um1."PersonId"
            WHERE um1."PersonId" = s.current_id
              AND NOT um2."PersonId" = ANY(s.path)
        ) AS next_rel
        JOIN public."People" next_person ON next_person."Id" = next_rel.person_id
        WHERE s.depth < p_max_depth
          AND (p_tree_id IS NULL OR next_person."OrgId" = p_tree_id)
    )
    SELECT s.path, s.rel_types
    INTO v_path, v_rel_types
    FROM search s
    WHERE s.current_id = p_person2_id
    ORDER BY s.depth
    LIMIT 1;

    -- Build result
    IF v_path IS NOT NULL THEN
        v_found := TRUE;
        v_length := array_length(v_path, 1) - 1;

        -- Build path nodes
        FOR v_i IN 1..array_length(v_path, 1) LOOP
            v_person_id := v_path[v_i];

            SELECT COALESCE(p."NameArabic", p."NameEnglish", p."PrimaryName"), p."Sex"
            INTO v_person_name, v_person_sex
            FROM public."People" p
            WHERE p."Id" = v_person_id;

            v_path_nodes := v_path_nodes || jsonb_build_object(
                'personId', v_person_id,
                'name', v_person_name,
                'sex', v_person_sex
            );

            -- Build relationship for this step (except for last node)
            IF v_i < array_length(v_path, 1) THEN
                v_path_rels := v_path_rels || jsonb_build_object(
                    'fromId', v_path[v_i],
                    'toId', v_path[v_i + 1],
                    'type', v_rel_types[v_i]
                );
            END IF;
        END LOOP;
    END IF;

    RETURN QUERY SELECT v_found, v_length, v_path_nodes, v_path_rels,
        CASE WHEN v_found THEN 'Path found with ' || v_length || ' steps' ELSE 'No path found' END;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- STEP 8: Grant permissions
-- ============================================================================

GRANT EXECUTE ON FUNCTION search_persons_unified TO PUBLIC;
GRANT EXECUTE ON FUNCTION get_family_tree_data TO PUBLIC;
GRANT EXECUTE ON FUNCTION get_person_details TO PUBLIC;
GRANT EXECUTE ON FUNCTION find_relationship_path TO PUBLIC;

-- ============================================================================
-- Done!
-- ============================================================================
