-- ============================================================
-- Migration: Duplicate Detection Functions (v2 — Constructed Full Names)
-- Date: 2026-02-07 (updated 2026-02-10)
-- Description: PostgreSQL functions for detecting duplicate person records
--   using CONSTRUCTED full names (given + father + grandfather)
--   derived from the ParentChild relationship graph.
-- ============================================================

-- Ensure pg_trgm extension is available
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ============================================================
-- DROP OLD FUNCTIONS FIRST (clean slate)
-- ============================================================
DROP FUNCTION IF EXISTS duplicate_candidates_summary(UUID, UUID, TEXT, INT);
DROP FUNCTION IF EXISTS detect_duplicate_candidates(UUID, UUID, TEXT, INT, INT, INT);
DROP FUNCTION IF EXISTS extract_surname_part(TEXT);
DROP FUNCTION IF EXISTS extract_given_name(TEXT);
DROP FUNCTION IF EXISTS best_comparison_name(TEXT, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS construct_full_name(TEXT, TEXT, TEXT);

-- ============================================================
-- HELPER FUNCTION: Best comparison name (per language)
-- Returns the first non-null, non-empty name from the available fields.
-- ============================================================
CREATE OR REPLACE FUNCTION best_comparison_name(
    name_arabic TEXT,
    primary_name TEXT,
    name_english TEXT DEFAULT NULL,
    name_nobiin TEXT DEFAULT NULL
)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE PARALLEL SAFE
AS $$
    SELECT COALESCE(
        NULLIF(TRIM(name_arabic), ''),
        NULLIF(TRIM(primary_name), ''),
        NULLIF(TRIM(name_english), ''),
        NULLIF(TRIM(name_nobiin), '')
    );
$$;

COMMENT ON FUNCTION best_comparison_name IS 'Returns best available name for comparison, skipping NULL and empty strings';

-- ============================================================
-- HELPER FUNCTION: Construct full name from given + father + grandfather
-- Concatenates non-null parts with space separator.
-- ============================================================
CREATE OR REPLACE FUNCTION construct_full_name(
    given_name TEXT,
    father_name TEXT DEFAULT NULL,
    grandfather_name TEXT DEFAULT NULL
)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE PARALLEL SAFE
AS $$
    SELECT TRIM(
        COALESCE(NULLIF(TRIM(given_name), ''), '') ||
        CASE WHEN NULLIF(TRIM(father_name), '') IS NOT NULL THEN ' ' || TRIM(father_name) ELSE '' END ||
        CASE WHEN NULLIF(TRIM(grandfather_name), '') IS NOT NULL THEN ' ' || TRIM(grandfather_name) ELSE '' END
    );
$$;

COMMENT ON FUNCTION construct_full_name IS 'Builds full patronymic name: given + father + grandfather';

-- ============================================================
-- HELPER FUNCTION: Extract given name (first word)
-- ============================================================
CREATE OR REPLACE FUNCTION extract_given_name(full_name TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE STRICT PARALLEL SAFE
AS $$
    SELECT COALESCE(
        NULLIF(SPLIT_PART(TRIM(full_name), ' ', 1), ''),
        full_name
    );
$$;

COMMENT ON FUNCTION extract_given_name(TEXT) IS 'Extracts the first space-delimited word from a name (given name)';

-- ============================================================
-- HELPER FUNCTION: Extract surname part (everything after first word)
-- ============================================================
CREATE OR REPLACE FUNCTION extract_surname_part(full_name TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE STRICT PARALLEL SAFE
AS $$
    SELECT CASE
        WHEN POSITION(' ' IN TRIM(full_name)) > 0
        THEN TRIM(SUBSTRING(TRIM(full_name) FROM POSITION(' ' IN TRIM(full_name)) + 1))
        ELSE ''
    END;
$$;

COMMENT ON FUNCTION extract_surname_part(TEXT) IS 'Extracts everything after the first word (surname/family name part)';

-- ============================================================
-- MAIN FUNCTION: Detect duplicate candidates
-- Uses CONSTRUCTED full names (person + father + grandfather)
-- derived from ParentChild relationships.
-- ============================================================
CREATE OR REPLACE FUNCTION detect_duplicate_candidates(
    p_org_id UUID DEFAULT NULL,
    p_target_org_id UUID DEFAULT NULL,
    p_mode TEXT DEFAULT 'auto',
    p_min_confidence INT DEFAULT 50,
    p_page INT DEFAULT 1,
    p_page_size INT DEFAULT 50
)
RETURNS TABLE (
    total_count BIGINT,
    page INT,
    page_size INT,
    person_a_id UUID,
    person_a_name VARCHAR(300),
    person_a_name_arabic VARCHAR(300),
    person_a_name_english VARCHAR(300),
    person_a_sex INT,
    person_a_birth_date TIMESTAMP,
    person_a_death_date TIMESTAMP,
    person_a_org_id UUID,
    person_a_org_name VARCHAR(200),
    person_b_id UUID,
    person_b_name VARCHAR(300),
    person_b_name_arabic VARCHAR(300),
    person_b_name_english VARCHAR(300),
    person_b_sex INT,
    person_b_birth_date TIMESTAMP,
    person_b_death_date TIMESTAMP,
    person_b_org_id UUID,
    person_b_org_name VARCHAR(200),
    match_type TEXT,
    confidence INT,
    similarity_score FLOAT,
    given_name_a TEXT,
    surname_a TEXT,
    given_name_b TEXT,
    surname_b TEXT,
    shared_parent_count INT,
    evidence JSONB
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_offset INT;
    v_total BIGINT;
BEGIN
    -- Defensive guard: reject target without source
    IF p_target_org_id IS NOT NULL AND p_org_id IS NULL THEN
        RAISE EXCEPTION 'p_org_id is required when p_target_org_id is specified';
    END IF;

    v_offset := (GREATEST(p_page, 1) - 1) * LEAST(GREATEST(p_page_size, 1), 100);

    -- ================================================================
    -- CTE: Build enriched person data with constructed full names
    -- Each person gets: given name, father's given name, grandfather's given name
    -- Full name = "given father grandfather" (patronymic)
    -- ================================================================
    CREATE TEMP TABLE IF NOT EXISTS _enriched_persons (
        person_id UUID PRIMARY KEY,
        given_name TEXT,
        father_given_name TEXT,
        grandfather_given_name TEXT,
        full_name_arabic TEXT,
        full_name_english TEXT,
        full_name_best TEXT,
        sex INT,
        birth_date TIMESTAMP,
        death_date TIMESTAMP,
        org_id UUID
    ) ON COMMIT DROP;

    TRUNCATE _enriched_persons;

    INSERT INTO _enriched_persons
    SELECT
        p."Id" AS person_id,
        -- Given name (stored name)
        best_comparison_name(p."NameArabic", p."PrimaryName", p."NameEnglish", p."NameNobiin") AS given_name,
        -- Father's given name (via ParentChild, male parent)
        best_comparison_name(
            fd.father_name_arabic, fd.father_name_arabic,
            fd.father_name_english, fd.father_name_nobiin
        ) AS father_given_name,
        -- Grandfather's given name (father's male parent)
        best_comparison_name(
            gd.grandfather_name_arabic, gd.grandfather_name_arabic,
            gd.grandfather_name_english, gd.grandfather_name_nobiin
        ) AS grandfather_given_name,
        -- Constructed full name in Arabic
        construct_full_name(
            COALESCE(NULLIF(TRIM(p."NameArabic"), ''), NULLIF(TRIM(p."PrimaryName"), '')),
            fd.father_name_arabic,
            gd.grandfather_name_arabic
        ) AS full_name_arabic,
        -- Constructed full name in English
        construct_full_name(
            COALESCE(NULLIF(TRIM(p."NameEnglish"), ''), NULLIF(TRIM(p."PrimaryName"), '')),
            fd.father_name_english,
            gd.grandfather_name_english
        ) AS full_name_english,
        -- Best full name (using best language for each part)
        construct_full_name(
            best_comparison_name(p."NameArabic", p."PrimaryName", p."NameEnglish", p."NameNobiin"),
            best_comparison_name(
                fd.father_name_arabic, fd.father_name_arabic,
                fd.father_name_english, fd.father_name_nobiin
            ),
            best_comparison_name(
                gd.grandfather_name_arabic, gd.grandfather_name_arabic,
                gd.grandfather_name_english, gd.grandfather_name_nobiin
            )
        ) AS full_name_best,
        p."Sex",
        p."BirthDate",
        p."DeathDate",
        p."OrgId"
    FROM public."People" p
    -- Father: male parent via ParentChild
    LEFT JOIN LATERAL (
        SELECT
            parent."NameArabic" AS father_name_arabic,
            parent."NameEnglish" AS father_name_english,
            parent."NameNobiin" AS father_name_nobiin
        FROM public."ParentChildren" pc
        JOIN public."People" parent ON pc."ParentId" = parent."Id"
        WHERE pc."ChildId" = p."Id"
          AND parent."Sex" = 0
          AND pc."IsDeleted" = FALSE
          AND parent."IsDeleted" = FALSE
        LIMIT 1
    ) fd ON TRUE
    -- Grandfather: father's male parent
    LEFT JOIN LATERAL (
        SELECT
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
          AND pc1."IsDeleted" = FALSE
          AND pc2."IsDeleted" = FALSE
          AND father."IsDeleted" = FALSE
          AND grandparent."IsDeleted" = FALSE
        LIMIT 1
    ) gd ON TRUE
    WHERE p."IsDeleted" = FALSE
      AND (p_org_id IS NULL OR p."OrgId" = p_org_id);

    -- ================================================================
    -- Candidates temp table
    -- ================================================================
    CREATE TEMP TABLE IF NOT EXISTS _dup_candidates (
        person_a_id UUID,
        person_b_id UUID,
        match_type TEXT,
        confidence INT,
        similarity_score FLOAT,
        shared_parent_count INT DEFAULT 0,
        evidence JSONB DEFAULT '{}'::JSONB
    ) ON COMMIT DROP;

    TRUNCATE _dup_candidates;

    -- ================================================================
    -- Tree filter logic:
    --   p_target_org_id IS NOT NULL -> b from target tree (cross-tree)
    --   p_target_org_id IS NULL AND p_org_id IS NOT NULL -> b from same tree as a (intra-tree)
    --   both NULL -> all trees (global scan)
    -- ================================================================

    -- STRATEGY 1: Exact full name match (confidence 95)
    -- Compares the constructed full names (given + father + grandfather)
    IF p_mode IN ('auto', 'name_exact') THEN
        INSERT INTO _dup_candidates (person_a_id, person_b_id, match_type, confidence, similarity_score, evidence)
        SELECT
            a.person_id, b.person_id, 'name_exact', 95, 1.0,
            jsonb_build_object(
                'matchedFullName', a.full_name_best,
                'fullNameA', a.full_name_best,
                'fullNameB', b.full_name_best,
                'givenNameA', a.given_name,
                'fatherNameA', a.father_given_name,
                'grandfatherNameA', a.grandfather_given_name,
                'givenNameB', b.given_name,
                'fatherNameB', b.father_given_name,
                'grandfatherNameB', b.grandfather_given_name,
                'strategy', 'Exact full name match (given + father + grandfather)'
            )
        FROM _enriched_persons a
        JOIN _enriched_persons b ON
            a.full_name_best = b.full_name_best
            AND a.sex = b.sex
            AND a.person_id < b.person_id
        WHERE a.full_name_best IS NOT NULL
          AND LENGTH(a.full_name_best) > 0
          -- At least 2 name parts for meaningful exact match
          AND (a.father_given_name IS NOT NULL OR a.grandfather_given_name IS NOT NULL)
          AND (
            CASE
              WHEN p_target_org_id IS NOT NULL THEN b.org_id = p_target_org_id
              WHEN p_org_id IS NOT NULL THEN b.org_id = p_org_id
              ELSE TRUE
            END
          );
    END IF;

    -- STRATEGY 2: Similar full name match using trigram
    -- Compares the constructed full names with pg_trgm similarity
    IF p_mode IN ('auto', 'name_similar') THEN
        INSERT INTO _dup_candidates (person_a_id, person_b_id, match_type, confidence, similarity_score, evidence)
        SELECT
            a.person_id, b.person_id, 'name_similar',
            LEAST((similarity(a.full_name_best, b.full_name_best) * 100)::INT, 90),
            similarity(a.full_name_best, b.full_name_best),
            jsonb_build_object(
                'fullNameA', a.full_name_best,
                'fullNameB', b.full_name_best,
                'similarity', similarity(a.full_name_best, b.full_name_best),
                'givenNameA', a.given_name,
                'fatherNameA', a.father_given_name,
                'grandfatherNameA', a.grandfather_given_name,
                'givenNameB', b.given_name,
                'fatherNameB', b.father_given_name,
                'grandfatherNameB', b.grandfather_given_name,
                'strategy', 'Trigram similarity on constructed full name'
            )
        FROM _enriched_persons a
        JOIN _enriched_persons b ON
            a.full_name_best % b.full_name_best
            AND a.sex = b.sex
            AND a.person_id < b.person_id
            AND a.full_name_best != b.full_name_best
        WHERE a.full_name_best IS NOT NULL
          AND b.full_name_best IS NOT NULL
          AND LENGTH(a.full_name_best) > 0
          AND LENGTH(b.full_name_best) > 0
          -- At least 2 name parts for meaningful similarity
          AND (a.father_given_name IS NOT NULL OR a.grandfather_given_name IS NOT NULL)
          AND (b.father_given_name IS NOT NULL OR b.grandfather_given_name IS NOT NULL)
          AND (
            CASE
              WHEN p_target_org_id IS NOT NULL THEN b.org_id = p_target_org_id
              WHEN p_org_id IS NOT NULL THEN b.org_id = p_org_id
              ELSE TRUE
            END
          );
    END IF;

    -- STRATEGY 3: Same given name + father, different grandfather (mother surname pattern)
    -- Detects people with same given name AND same father but listed with different grandfathers
    -- (could be same person entered by different family branches using mother's family name)
    IF p_mode IN ('auto', 'mother_surn') THEN
        INSERT INTO _dup_candidates (person_a_id, person_b_id, match_type, confidence, similarity_score, evidence)
        SELECT
            a.person_id, b.person_id, 'mother_surn',
            LEAST(60 + 5 * COALESCE(sibling_count.cnt, 0), 95),
            0.6,
            jsonb_build_object(
                'givenNameA', a.given_name,
                'fatherNameA', a.father_given_name,
                'grandfatherNameA', a.grandfather_given_name,
                'fullNameA', a.full_name_best,
                'givenNameB', b.given_name,
                'fatherNameB', b.father_given_name,
                'grandfatherNameB', b.grandfather_given_name,
                'fullNameB', b.full_name_best,
                'strategy', 'Same given name + father, different grandfather (possible mother surname or data entry variant)'
            )
        FROM _enriched_persons a
        JOIN _enriched_persons b ON
            -- Same given name
            a.given_name = b.given_name
            AND a.sex = b.sex
            AND a.person_id < b.person_id
            -- Same father name
            AND a.father_given_name IS NOT NULL
            AND b.father_given_name IS NOT NULL
            AND a.father_given_name = b.father_given_name
            -- Different grandfather name (or one is missing)
            AND (
                (a.grandfather_given_name IS NOT NULL AND b.grandfather_given_name IS NOT NULL
                 AND a.grandfather_given_name != b.grandfather_given_name)
                OR (a.grandfather_given_name IS NULL AND b.grandfather_given_name IS NOT NULL)
                OR (a.grandfather_given_name IS NOT NULL AND b.grandfather_given_name IS NULL)
            )
            -- Intra-tree or cross-tree
            AND a.org_id = b.org_id
        LEFT JOIN LATERAL (
            SELECT COUNT(DISTINCT pc2."ChildId") as cnt
            FROM public."ParentChildren" pc1
            JOIN public."ParentChildren" pc2 ON pc1."ParentId" = pc2."ParentId"
            WHERE pc1."ChildId" IN (a.person_id, b.person_id)
              AND pc2."ChildId" NOT IN (a.person_id, b.person_id)
              AND pc1."IsDeleted" = FALSE
              AND pc2."IsDeleted" = FALSE
        ) sibling_count ON TRUE
        WHERE a.given_name IS NOT NULL AND a.given_name != '';
    END IF;

    -- STRATEGY 4: Shared parent + same given name (confidence 92)
    -- People who share the same parent AND have the same given name are likely duplicates
    IF p_mode IN ('auto', 'shared_parent') THEN
        INSERT INTO _dup_candidates (person_a_id, person_b_id, match_type, confidence, similarity_score, shared_parent_count, evidence)
        SELECT
            a.person_id, b.person_id, 'shared_parent', 92, 0.92,
            shared.parent_count,
            jsonb_build_object(
                'sharedParentCount', shared.parent_count,
                'sharedParentIds', shared.parent_ids,
                'fullNameA', a.full_name_best,
                'fullNameB', b.full_name_best,
                'givenNameA', a.given_name,
                'givenNameB', b.given_name,
                'strategy', 'Same given name, sex, and shared parent(s)'
            )
        FROM _enriched_persons a
        JOIN _enriched_persons b ON
            a.given_name = b.given_name
            AND a.sex = b.sex
            AND a.person_id < b.person_id
        JOIN LATERAL (
            SELECT
                COUNT(DISTINCT pc1."ParentId") as parent_count,
                ARRAY_AGG(DISTINCT pc1."ParentId") as parent_ids
            FROM public."ParentChildren" pc1
            JOIN public."ParentChildren" pc2 ON pc1."ParentId" = pc2."ParentId"
            WHERE pc1."ChildId" = a.person_id
              AND pc2."ChildId" = b.person_id
              AND pc1."IsDeleted" = FALSE
              AND pc2."IsDeleted" = FALSE
        ) shared ON shared.parent_count > 0
        WHERE a.given_name IS NOT NULL
          AND (
            CASE
              WHEN p_target_org_id IS NOT NULL THEN b.org_id = p_target_org_id
              WHEN p_org_id IS NOT NULL THEN b.org_id = p_org_id
              ELSE TRUE
            END
          );
    END IF;

    -- STRATEGY 5: Given name only match (lower confidence)
    -- For people without father/grandfather links, fall back to given name comparison
    -- Only matches people who BOTH lack parent relationships (to avoid false positives)
    IF p_mode IN ('auto', 'name_exact') THEN
        INSERT INTO _dup_candidates (person_a_id, person_b_id, match_type, confidence, similarity_score, evidence)
        SELECT
            a.person_id, b.person_id, 'name_exact', 55, 0.55,
            jsonb_build_object(
                'matchedGivenName', a.given_name,
                'fullNameA', a.full_name_best,
                'fullNameB', b.full_name_best,
                'note', 'Given name only match (no parent data available for either person)',
                'strategy', 'Exact given name match (no patronymic data)'
            )
        FROM _enriched_persons a
        JOIN _enriched_persons b ON
            a.given_name = b.given_name
            AND a.sex = b.sex
            AND a.person_id < b.person_id
        WHERE a.given_name IS NOT NULL
          AND LENGTH(a.given_name) > 1
          -- Both must lack father data (otherwise strategies 1-2 would catch them)
          AND a.father_given_name IS NULL
          AND b.father_given_name IS NULL
          -- Same birth year if available (narrow down matches)
          AND (
            (a.birth_date IS NULL AND b.birth_date IS NULL)
            OR (a.birth_date IS NOT NULL AND b.birth_date IS NOT NULL
                AND ABS(EXTRACT(YEAR FROM a.birth_date) - EXTRACT(YEAR FROM b.birth_date)) <= 5)
          )
          AND (
            CASE
              WHEN p_target_org_id IS NOT NULL THEN b.org_id = p_target_org_id
              WHEN p_org_id IS NOT NULL THEN b.org_id = p_org_id
              ELSE TRUE
            END
          )
          -- Avoid inserting duplicates if already found by other strategies
          AND NOT EXISTS (
            SELECT 1 FROM _dup_candidates d
            WHERE d.person_a_id = a.person_id AND d.person_b_id = b.person_id
          );
    END IF;

    -- POST-PROCESSING: Deduplicate (keep highest confidence per pair)
    DELETE FROM _dup_candidates d1
    USING _dup_candidates d2
    WHERE d1.person_a_id = d2.person_a_id
      AND d1.person_b_id = d2.person_b_id
      AND d1.match_type != d2.match_type
      AND d1.confidence < d2.confidence;

    -- Also deduplicate same match_type (keep one)
    DELETE FROM _dup_candidates d1
    USING _dup_candidates d2
    WHERE d1.person_a_id = d2.person_a_id
      AND d1.person_b_id = d2.person_b_id
      AND d1.match_type = d2.match_type
      AND d1.ctid < d2.ctid;

    -- Exclude existing PersonLinks (already resolved pairs)
    DELETE FROM _dup_candidates d
    WHERE EXISTS (
        SELECT 1 FROM public."PersonLinks" pl
        WHERE (pl."SourcePersonId" = d.person_a_id AND pl."TargetPersonId" = d.person_b_id)
           OR (pl."SourcePersonId" = d.person_b_id AND pl."TargetPersonId" = d.person_a_id)
    );

    -- Filter by minimum confidence
    DELETE FROM _dup_candidates WHERE confidence < p_min_confidence;

    SELECT COUNT(*) INTO v_total FROM _dup_candidates;

    -- ================================================================
    -- Return results with constructed full names
    -- ================================================================
    RETURN QUERY
    SELECT
        v_total, p_page, p_page_size,
        d.person_a_id,
        -- Person A: show constructed full name as display name
        COALESCE(ea.full_name_best, ea.given_name, '')::VARCHAR(300),
        COALESCE(ea.full_name_arabic, a."NameArabic")::VARCHAR(300),
        COALESCE(ea.full_name_english, a."NameEnglish")::VARCHAR(300),
        a."Sex", a."BirthDate", a."DeathDate",
        a."OrgId", oa."Name",
        d.person_b_id,
        -- Person B: show constructed full name as display name
        COALESCE(eb.full_name_best, eb.given_name, '')::VARCHAR(300),
        COALESCE(eb.full_name_arabic, b."NameArabic")::VARCHAR(300),
        COALESCE(eb.full_name_english, b."NameEnglish")::VARCHAR(300),
        b."Sex", b."BirthDate", b."DeathDate",
        b."OrgId", ob."Name",
        d.match_type, d.confidence, d.similarity_score,
        -- Given name + surname (father+grandfather) parts for display
        ea.given_name,
        TRIM(COALESCE(ea.father_given_name, '') || ' ' || COALESCE(ea.grandfather_given_name, '')),
        eb.given_name,
        TRIM(COALESCE(eb.father_given_name, '') || ' ' || COALESCE(eb.grandfather_given_name, '')),
        d.shared_parent_count, d.evidence
    FROM _dup_candidates d
    JOIN public."People" a ON a."Id" = d.person_a_id
    JOIN public."People" b ON b."Id" = d.person_b_id
    LEFT JOIN _enriched_persons ea ON ea.person_id = d.person_a_id
    LEFT JOIN _enriched_persons eb ON eb.person_id = d.person_b_id
    LEFT JOIN public."Orgs" oa ON oa."Id" = a."OrgId"
    LEFT JOIN public."Orgs" ob ON ob."Id" = b."OrgId"
    ORDER BY d.confidence DESC, d.match_type, ea.full_name_best
    OFFSET v_offset
    LIMIT p_page_size;
END;
$$;

COMMENT ON FUNCTION detect_duplicate_candidates IS 'Detects potential duplicate person records using constructed full names (given + father + grandfather from ParentChild graph)';

-- ============================================================
-- SUMMARY FUNCTION
-- ============================================================
CREATE OR REPLACE FUNCTION duplicate_candidates_summary(
    p_org_id UUID DEFAULT NULL,
    p_target_org_id UUID DEFAULT NULL,
    p_mode TEXT DEFAULT 'auto',
    p_min_confidence INT DEFAULT 50
)
RETURNS TABLE (
    match_type TEXT,
    candidate_count BIGINT,
    avg_confidence NUMERIC,
    min_confidence INT,
    max_confidence INT
)
LANGUAGE plpgsql
AS $$
BEGIN
    IF p_target_org_id IS NOT NULL AND p_org_id IS NULL THEN
        RAISE EXCEPTION 'p_org_id is required when p_target_org_id is specified';
    END IF;

    RETURN QUERY
    WITH all_candidates AS (
        SELECT dc.match_type as mt, dc.confidence as conf
        FROM detect_duplicate_candidates(p_org_id, p_target_org_id, p_mode, p_min_confidence, 1, 10000) dc
    )
    SELECT
        ac.mt, COUNT(*),
        ROUND(AVG(ac.conf), 1),
        MIN(ac.conf),
        MAX(ac.conf)
    FROM all_candidates ac
    GROUP BY ac.mt
    ORDER BY COUNT(*) DESC;
END;
$$;

COMMENT ON FUNCTION duplicate_candidates_summary IS 'Returns aggregate statistics for duplicate candidates by match type';

-- GRANT PERMISSIONS
GRANT EXECUTE ON FUNCTION best_comparison_name(TEXT, TEXT, TEXT, TEXT) TO PUBLIC;
GRANT EXECUTE ON FUNCTION construct_full_name(TEXT, TEXT, TEXT) TO PUBLIC;
GRANT EXECUTE ON FUNCTION extract_given_name(TEXT) TO PUBLIC;
GRANT EXECUTE ON FUNCTION extract_surname_part(TEXT) TO PUBLIC;
GRANT EXECUTE ON FUNCTION detect_duplicate_candidates TO PUBLIC;
GRANT EXECUTE ON FUNCTION duplicate_candidates_summary TO PUBLIC;
