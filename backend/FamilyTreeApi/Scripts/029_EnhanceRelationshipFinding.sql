-- ============================================================
-- Migration: Enhanced Relationship Finding
-- Date: 2026-02-06
-- Description: Improves get_person_details to include:
--   - Step-parents (parent's spouse who isn't biological parent)
--   - Half-siblings (share one parent)
--   - Step-siblings (parent's spouse's children)
--   - Proper soft delete filtering
--
-- ASSUMPTIONS DOCUMENTED:
--   - ParentChildren has at most 2 parents per person
--   - Step-parent relationships go through Unions table
--   - No circular relationships exist in the data
--   - Results limited to 100 per relationship type to prevent payload explosion
-- ============================================================

-- Drop and recreate get_person_details with enhanced relationships
CREATE OR REPLACE FUNCTION public.get_person_details(p_person_id uuid)
RETURNS TABLE (
    person_id uuid,
    primary_name character varying,
    name_arabic character varying,
    name_english character varying,
    name_nobiin character varying,
    sex integer,
    birth_date timestamp without time zone,
    birth_precision integer,
    death_date timestamp without time zone,
    death_precision integer,
    birth_place_id uuid,
    birth_place_name character varying,
    death_place_id uuid,
    death_place_name character varying,
    is_living boolean,
    notes text,
    family_id uuid,
    family_name character varying,
    org_id uuid,
    created_at timestamp without time zone,
    updated_at timestamp without time zone,
    names jsonb,
    parents jsonb,
    children jsonb,
    spouses jsonb,
    siblings jsonb
)
LANGUAGE plpgsql
AS $$
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
        p."FamilyId" AS family_id,
        f."Name" AS family_name,
        p."OrgId" AS org_id,
        p."CreatedAt" AS created_at,
        p."UpdatedAt" AS updated_at,
        '[]'::JSONB AS names,

        -- ================================================================
        -- PARENTS: Biological parents + Step-parents (parent's spouse)
        -- Limited to 20 to prevent payload explosion
        -- ================================================================
        COALESCE(
            (WITH all_parents AS (
                -- Biological parents
                SELECT
                    pc."Id" AS rel_id,
                    parent."Id" AS parent_id,
                    COALESCE(parent."NameArabic", parent."NameEnglish", parent."PrimaryName") AS parent_name,
                    parent."Sex" AS parent_sex,
                    CASE WHEN parent."Sex" = 0 THEN 'father' ELSE 'mother' END AS sub_type,
                    TRUE AS is_bio,
                    EXTRACT(YEAR FROM parent."BirthDate") AS birth_yr,
                    EXTRACT(YEAR FROM parent."DeathDate") AS death_yr,
                    parent."DeathDate" IS NULL AS is_alive,
                    1 AS sort_order
                FROM public."ParentChildren" pc
                JOIN public."People" parent ON parent."Id" = pc."ParentId"
                WHERE pc."ChildId" = p."Id"
                  AND pc."IsDeleted" = FALSE
                  AND parent."IsDeleted" = FALSE

                UNION

                -- Step-parents: Spouses of biological parents who are NOT also biological parents
                SELECT
                    um2."Id" AS rel_id,  -- Use UnionMember ID instead of NULL
                    step_parent."Id" AS parent_id,
                    COALESCE(step_parent."NameArabic", step_parent."NameEnglish", step_parent."PrimaryName") AS parent_name,
                    step_parent."Sex" AS parent_sex,
                    CASE WHEN step_parent."Sex" = 0 THEN 'stepfather' ELSE 'stepmother' END AS sub_type,
                    FALSE AS is_bio,
                    EXTRACT(YEAR FROM step_parent."BirthDate") AS birth_yr,
                    EXTRACT(YEAR FROM step_parent."DeathDate") AS death_yr,
                    step_parent."DeathDate" IS NULL AS is_alive,
                    2 AS sort_order
                FROM public."ParentChildren" pc
                JOIN public."UnionMembers" um1 ON um1."PersonId" = pc."ParentId" AND um1."IsDeleted" = FALSE
                JOIN public."Unions" u ON u."Id" = um1."UnionId" AND u."IsDeleted" = FALSE
                JOIN public."UnionMembers" um2 ON um2."UnionId" = u."Id" AND um2."PersonId" != pc."ParentId" AND um2."IsDeleted" = FALSE
                JOIN public."People" step_parent ON step_parent."Id" = um2."PersonId"
                WHERE pc."ChildId" = p."Id"
                  AND pc."IsDeleted" = FALSE
                  AND step_parent."IsDeleted" = FALSE
                  -- Exclude if step_parent is also a biological parent
                  AND NOT EXISTS (
                      SELECT 1 FROM public."ParentChildren" pc2
                      WHERE pc2."ChildId" = p."Id"
                        AND pc2."ParentId" = step_parent."Id"
                        AND pc2."IsDeleted" = FALSE
                  )
            )
            SELECT jsonb_agg(
                jsonb_build_object(
                    'relationshipId', rel_id,
                    'personId', parent_id,
                    'name', parent_name,
                    'sex', parent_sex,
                    'relationshipType', 'parent',
                    'relationshipSubType', sub_type,
                    'isBiological', is_bio,
                    'birthYear', birth_yr,
                    'deathYear', death_yr,
                    'isLiving', is_alive
                )
            )
            FROM (
                SELECT DISTINCT ON (parent_id) *
                FROM all_parents
                ORDER BY parent_id, sort_order
                LIMIT 20
            ) deduped),
            '[]'::JSONB
        ) AS parents,

        -- ================================================================
        -- CHILDREN: Direct children only (limited to 100)
        -- ================================================================
        COALESCE(
            (SELECT jsonb_agg(child_data)
             FROM (
                SELECT jsonb_build_object(
                    'relationshipId', pc."Id",
                    'personId', child."Id",
                    'name', COALESCE(child."NameArabic", child."NameEnglish", child."PrimaryName"),
                    'sex', child."Sex",
                    'relationshipType', 'child',
                    'relationshipSubType', CASE WHEN child."Sex" = 0 THEN 'son' ELSE 'daughter' END,
                    'birthYear', EXTRACT(YEAR FROM child."BirthDate"),
                    'deathYear', EXTRACT(YEAR FROM child."DeathDate"),
                    'isLiving', child."DeathDate" IS NULL
                ) AS child_data
                FROM public."ParentChildren" pc
                JOIN public."People" child ON child."Id" = pc."ChildId"
                WHERE pc."ParentId" = p."Id"
                  AND pc."IsDeleted" = FALSE
                  AND child."IsDeleted" = FALSE
                ORDER BY child."BirthDate" NULLS LAST
                LIMIT 100
             ) children_limited),
            '[]'::JSONB
        ) AS children,

        -- ================================================================
        -- SPOUSES: All union members (limited to 20)
        -- ================================================================
        COALESCE(
            (SELECT jsonb_agg(spouse_data)
             FROM (
                SELECT jsonb_build_object(
                    'unionId', u."Id",
                    'personId', spouse."Id",
                    'name', COALESCE(spouse."NameArabic", spouse."NameEnglish", spouse."PrimaryName"),
                    'sex', spouse."Sex",
                    'relationshipType', 'spouse',
                    'relationshipSubType', CASE WHEN spouse."Sex" = 0 THEN 'husband' ELSE 'wife' END,
                    'unionType', u."Type",
                    'startDate', u."StartDate",
                    'endDate', u."EndDate",
                    'birthYear', EXTRACT(YEAR FROM spouse."BirthDate"),
                    'deathYear', EXTRACT(YEAR FROM spouse."DeathDate"),
                    'isLiving', spouse."DeathDate" IS NULL
                ) AS spouse_data
                FROM public."UnionMembers" um
                JOIN public."Unions" u ON u."Id" = um."UnionId" AND u."IsDeleted" = FALSE
                JOIN public."UnionMembers" um2 ON um2."UnionId" = u."Id" AND um2."PersonId" != p."Id" AND um2."IsDeleted" = FALSE
                JOIN public."People" spouse ON spouse."Id" = um2."PersonId"
                WHERE um."PersonId" = p."Id"
                  AND um."IsDeleted" = FALSE
                  AND spouse."IsDeleted" = FALSE
                ORDER BY u."StartDate" NULLS LAST
                LIMIT 20
             ) spouses_limited),
            '[]'::JSONB
        ) AS spouses,

        -- ================================================================
        -- SIBLINGS: Full, Half, and Step siblings (limited to 100)
        -- ================================================================
        COALESCE(
            (WITH all_siblings AS (
                -- Full siblings (share ALL parents, and BOTH have at least one parent)
                SELECT
                    sibling."Id" AS sib_id,
                    COALESCE(sibling."NameArabic", sibling."NameEnglish", sibling."PrimaryName") AS sib_name,
                    sibling."Sex" AS sib_sex,
                    CASE WHEN sibling."Sex" = 0 THEN 'brother' ELSE 'sister' END AS sub_type,
                    'full' AS sib_type,
                    EXTRACT(YEAR FROM sibling."BirthDate") AS birth_yr,
                    EXTRACT(YEAR FROM sibling."DeathDate") AS death_yr,
                    sibling."DeathDate" IS NULL AS is_alive,
                    sibling."BirthDate" AS birth_date,
                    1 AS sort_order
                FROM public."People" sibling
                WHERE sibling."Id" != p."Id"
                  AND sibling."IsDeleted" = FALSE
                  -- Person must have at least one parent
                  AND EXISTS (
                      SELECT 1 FROM public."ParentChildren" pc_check
                      WHERE pc_check."ChildId" = p."Id" AND pc_check."IsDeleted" = FALSE
                  )
                  -- Sibling must have at least one parent
                  AND EXISTS (
                      SELECT 1 FROM public."ParentChildren" pc_check2
                      WHERE pc_check2."ChildId" = sibling."Id" AND pc_check2."IsDeleted" = FALSE
                  )
                  -- Person's parents must be subset of sibling's parents
                  AND NOT EXISTS (
                      SELECT pc1."ParentId"
                      FROM public."ParentChildren" pc1
                      WHERE pc1."ChildId" = p."Id" AND pc1."IsDeleted" = FALSE
                      EXCEPT
                      SELECT pc2."ParentId"
                      FROM public."ParentChildren" pc2
                      WHERE pc2."ChildId" = sibling."Id" AND pc2."IsDeleted" = FALSE
                  )
                  -- Sibling's parents must be subset of person's parents
                  AND NOT EXISTS (
                      SELECT pc2."ParentId"
                      FROM public."ParentChildren" pc2
                      WHERE pc2."ChildId" = sibling."Id" AND pc2."IsDeleted" = FALSE
                      EXCEPT
                      SELECT pc1."ParentId"
                      FROM public."ParentChildren" pc1
                      WHERE pc1."ChildId" = p."Id" AND pc1."IsDeleted" = FALSE
                  )

                UNION

                -- Half siblings (share exactly ONE parent, not all)
                SELECT DISTINCT
                    sibling."Id" AS sib_id,
                    COALESCE(sibling."NameArabic", sibling."NameEnglish", sibling."PrimaryName") AS sib_name,
                    sibling."Sex" AS sib_sex,
                    CASE WHEN sibling."Sex" = 0 THEN 'halfBrother' ELSE 'halfSister' END AS sub_type,
                    'half' AS sib_type,
                    EXTRACT(YEAR FROM sibling."BirthDate") AS birth_yr,
                    EXTRACT(YEAR FROM sibling."DeathDate") AS death_yr,
                    sibling."DeathDate" IS NULL AS is_alive,
                    sibling."BirthDate" AS birth_date,
                    2 AS sort_order
                FROM public."ParentChildren" pc1
                JOIN public."ParentChildren" pc2 ON pc2."ParentId" = pc1."ParentId"
                    AND pc2."ChildId" != p."Id"
                    AND pc2."IsDeleted" = FALSE
                JOIN public."People" sibling ON sibling."Id" = pc2."ChildId"
                WHERE pc1."ChildId" = p."Id"
                  AND pc1."IsDeleted" = FALSE
                  AND sibling."IsDeleted" = FALSE
                  -- Exclude full siblings: must have at least one different parent
                  AND (
                      -- Person has a parent that sibling doesn't have
                      EXISTS (
                          SELECT pc3."ParentId"
                          FROM public."ParentChildren" pc3
                          WHERE pc3."ChildId" = p."Id" AND pc3."IsDeleted" = FALSE
                          EXCEPT
                          SELECT pc4."ParentId"
                          FROM public."ParentChildren" pc4
                          WHERE pc4."ChildId" = sibling."Id" AND pc4."IsDeleted" = FALSE
                      )
                      OR
                      -- Sibling has a parent that person doesn't have
                      EXISTS (
                          SELECT pc4."ParentId"
                          FROM public."ParentChildren" pc4
                          WHERE pc4."ChildId" = sibling."Id" AND pc4."IsDeleted" = FALSE
                          EXCEPT
                          SELECT pc3."ParentId"
                          FROM public."ParentChildren" pc3
                          WHERE pc3."ChildId" = p."Id" AND pc3."IsDeleted" = FALSE
                      )
                  )

                UNION

                -- Step siblings (children of step-parent, no shared biological parent)
                SELECT DISTINCT
                    step_sibling."Id" AS sib_id,
                    COALESCE(step_sibling."NameArabic", step_sibling."NameEnglish", step_sibling."PrimaryName") AS sib_name,
                    step_sibling."Sex" AS sib_sex,
                    CASE WHEN step_sibling."Sex" = 0 THEN 'stepBrother' ELSE 'stepSister' END AS sub_type,
                    'step' AS sib_type,
                    EXTRACT(YEAR FROM step_sibling."BirthDate") AS birth_yr,
                    EXTRACT(YEAR FROM step_sibling."DeathDate") AS death_yr,
                    step_sibling."DeathDate" IS NULL AS is_alive,
                    step_sibling."BirthDate" AS birth_date,
                    3 AS sort_order
                FROM public."ParentChildren" pc
                -- Get person's biological parent
                JOIN public."UnionMembers" um1 ON um1."PersonId" = pc."ParentId" AND um1."IsDeleted" = FALSE
                JOIN public."Unions" u ON u."Id" = um1."UnionId" AND u."IsDeleted" = FALSE
                -- Get parent's spouse (step-parent)
                JOIN public."UnionMembers" um2 ON um2."UnionId" = u."Id"
                    AND um2."PersonId" != pc."ParentId"
                    AND um2."IsDeleted" = FALSE
                -- Get step-parent's children
                JOIN public."ParentChildren" pc2 ON pc2."ParentId" = um2."PersonId" AND pc2."IsDeleted" = FALSE
                JOIN public."People" step_sibling ON step_sibling."Id" = pc2."ChildId"
                WHERE pc."ChildId" = p."Id"
                  AND pc."IsDeleted" = FALSE
                  AND step_sibling."Id" != p."Id"
                  AND step_sibling."IsDeleted" = FALSE
                  -- Exclude if they share any biological parent (would be half-sibling)
                  AND NOT EXISTS (
                      SELECT 1
                      FROM public."ParentChildren" shared1
                      JOIN public."ParentChildren" shared2 ON shared2."ParentId" = shared1."ParentId"
                      WHERE shared1."ChildId" = p."Id"
                        AND shared2."ChildId" = step_sibling."Id"
                        AND shared1."IsDeleted" = FALSE
                        AND shared2."IsDeleted" = FALSE
                  )
            )
            SELECT jsonb_agg(
                jsonb_build_object(
                    'personId', sib_id,
                    'name', sib_name,
                    'sex', sib_sex,
                    'relationshipType', 'sibling',
                    'relationshipSubType', sub_type,
                    'siblingType', sib_type,
                    'birthYear', birth_yr,
                    'deathYear', death_yr,
                    'isLiving', is_alive
                )
            )
            FROM (
                SELECT DISTINCT ON (sib_id) *
                FROM all_siblings
                ORDER BY sib_id, sort_order, birth_date NULLS LAST
                LIMIT 100
            ) deduped_siblings),
            '[]'::JSONB
        ) AS siblings

    FROM public."People" p
    LEFT JOIN public."Places" bp ON p."BirthPlaceId" = bp."Id"
    LEFT JOIN public."Places" dp ON p."DeathPlaceId" = dp."Id"
    LEFT JOIN public."Families" f ON p."FamilyId" = f."Id"
    WHERE p."Id" = p_person_id
      AND p."IsDeleted" = FALSE;
END;
$$;

-- Add comment
COMMENT ON FUNCTION public.get_person_details(uuid) IS 'Enhanced person details with biological/step-parents, full/half/step-siblings, and soft delete filtering. Results limited per category to prevent payload explosion.';
