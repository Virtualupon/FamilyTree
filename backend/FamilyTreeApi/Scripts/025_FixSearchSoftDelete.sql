-- ============================================================================
-- Migration: Fix Search Function to Filter Soft-Deleted Records
-- Date: 2026-01-27
-- Description: Updates search_persons_unified to exclude soft-deleted records
--              by adding IsDeleted = FALSE filter to all queries
-- ============================================================================

-- Drop and recreate the function with soft delete filter
DROP FUNCTION IF EXISTS public.search_persons_unified(text, text, uuid, uuid, uuid, text, bool, int4, int4, text, int4, int4);

CREATE OR REPLACE FUNCTION public.search_persons_unified(
    p_query text DEFAULT NULL::text,
    p_search_in text DEFAULT 'auto'::text,
    p_tree_id uuid DEFAULT NULL::uuid,
    p_town_id uuid DEFAULT NULL::uuid,
    p_family_id uuid DEFAULT NULL::uuid,
    p_sex text DEFAULT NULL::text,
    p_is_living boolean DEFAULT NULL::boolean,
    p_birth_year_from integer DEFAULT NULL::integer,
    p_birth_year_to integer DEFAULT NULL::integer,
    p_nationality text DEFAULT NULL::text,
    p_page integer DEFAULT 1,
    p_page_size integer DEFAULT 20
)
RETURNS TABLE(
    total_count bigint,
    page integer,
    page_size integer,
    person_id uuid,
    primary_name character varying,
    name_arabic character varying,
    name_english character varying,
    name_nobiin character varying,
    father_id uuid,
    father_name_arabic character varying,
    father_name_english character varying,
    father_name_nobiin character varying,
    grandfather_id uuid,
    grandfather_name_arabic character varying,
    grandfather_name_english character varying,
    grandfather_name_nobiin character varying,
    sex integer,
    birth_date timestamp without time zone,
    birth_precision integer,
    death_date timestamp without time zone,
    death_precision integer,
    birth_place_name character varying,
    death_place_name character varying,
    nationality character varying,
    is_living boolean,
    family_id uuid,
    family_name character varying,
    org_id uuid,
    tree_name character varying,
    town_id uuid,
    town_name character varying,
    town_name_en character varying,
    town_name_ar character varying,
    country_code character varying,
    country_name_en character varying,
    country_name_ar character varying,
    names jsonb,
    parents_count bigint,
    children_count bigint,
    spouses_count bigint,
    media_count bigint,
    avatar_media_id uuid,
    avatar_url text
)
LANGUAGE plpgsql
AS $function$
DECLARE
    v_offset INT;
    v_total BIGINT;
    v_search_pattern TEXT;
    v_tree_ids UUID[];
BEGIN
    v_offset := (p_page - 1) * p_page_size;

    IF p_query IS NOT NULL AND p_query != '' THEN
        v_search_pattern := '%' || p_query || '%';
    END IF;

    IF p_town_id IS NOT NULL THEN
        SELECT ARRAY_AGG(o."Id") INTO v_tree_ids
        FROM public."Orgs" o
        WHERE o."TownId" = p_town_id;
    END IF;

    -- Count query with soft delete filter
    SELECT COUNT(*) INTO v_total
    FROM public."People" p
    LEFT JOIN public."Orgs" o ON p."OrgId" = o."Id"
    WHERE
        p."IsDeleted" = FALSE  -- SOFT DELETE FILTER
        AND (p_tree_id IS NULL OR p."OrgId" = p_tree_id)
        AND (p_town_id IS NULL OR p."OrgId" = ANY(v_tree_ids))
        AND (p_family_id IS NULL OR p."FamilyId" = p_family_id)
        AND (p_sex IS NULL OR
            (p_sex = 'Male' AND p."Sex" = 0) OR
            (p_sex = 'Female' AND p."Sex" = 1) OR
            (p_sex = 'Unknown' AND p."Sex" = 2))
        AND (p_is_living IS NULL OR
            (p_is_living = TRUE AND p."DeathDate" IS NULL) OR
            (p_is_living = FALSE AND p."DeathDate" IS NOT NULL))
        AND (p_birth_year_from IS NULL OR EXTRACT(YEAR FROM p."BirthDate") >= p_birth_year_from)
        AND (p_birth_year_to IS NULL OR EXTRACT(YEAR FROM p."BirthDate") <= p_birth_year_to)
        AND (p_nationality IS NULL OR p."Nationality" = p_nationality)
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
        ));

    RETURN QUERY
    SELECT
        v_total::BIGINT AS total_count,
        p_page::INT AS page,
        p_page_size::INT AS page_size,
        p."Id" AS person_id,
        p."PrimaryName"::VARCHAR(200) AS primary_name,
        p."NameArabic"::VARCHAR(300) AS name_arabic,
        p."NameEnglish"::VARCHAR(300) AS name_english,
        p."NameNobiin"::VARCHAR(300) AS name_nobiin,
        father_data.father_id,
        father_data.father_name_arabic::VARCHAR(300),
        father_data.father_name_english::VARCHAR(300),
        father_data.father_name_nobiin::VARCHAR(300),
        grandfather_data.grandfather_id,
        grandfather_data.grandfather_name_arabic::VARCHAR(300),
        grandfather_data.grandfather_name_english::VARCHAR(300),
        grandfather_data.grandfather_name_nobiin::VARCHAR(300),
        p."Sex"::INT AS sex,
        p."BirthDate"::TIMESTAMP AS birth_date,
        p."BirthPrecision"::INT AS birth_precision,
        p."DeathDate"::TIMESTAMP AS death_date,
        p."DeathPrecision"::INT AS death_precision,
        bp."Name"::VARCHAR(200) AS birth_place_name,
        dp."Name"::VARCHAR(200) AS death_place_name,
        p."Nationality"::VARCHAR(100) AS nationality,
        (p."DeathDate" IS NULL)::BOOLEAN AS is_living,
        p."FamilyId" AS family_id,
        f."Name"::VARCHAR(200) AS family_name,
        p."OrgId" AS org_id,
        o."Name"::VARCHAR(200) AS tree_name,
        t."Id" AS town_id,
        t."Name"::VARCHAR(200) AS town_name,
        t."NameEn"::VARCHAR(200) AS town_name_en,
        t."NameAr"::VARCHAR(200) AS town_name_ar,
        c."Code"::VARCHAR(2) AS country_code,
        c."NameEn"::VARCHAR(100) AS country_name_en,
        c."NameAr"::VARCHAR(100) AS country_name_ar,
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
        )::JSONB AS names,
        (SELECT COUNT(*)::BIGINT FROM public."ParentChildren" pc WHERE pc."ChildId" = p."Id" AND pc."IsDeleted" = FALSE) AS parents_count,
        (SELECT COUNT(*)::BIGINT FROM public."ParentChildren" pc WHERE pc."ParentId" = p."Id" AND pc."IsDeleted" = FALSE) AS children_count,
        (SELECT COUNT(*)::BIGINT FROM public."UnionMembers" um WHERE um."PersonId" = p."Id" AND um."IsDeleted" = FALSE) AS spouses_count,
        (SELECT COUNT(*)::BIGINT FROM public."PersonMedia" pm WHERE pm."PersonId" = p."Id") AS media_count,
        p."AvatarMediaId"::UUID AS avatar_media_id,
        m."Url"::TEXT AS avatar_url
    FROM public."People" p
    LEFT JOIN public."Places" bp ON p."BirthPlaceId" = bp."Id"
    LEFT JOIN public."Places" dp ON p."DeathPlaceId" = dp."Id"
    LEFT JOIN public."Orgs" o ON p."OrgId" = o."Id"
    LEFT JOIN public."Towns" t ON o."TownId" = t."Id"
    LEFT JOIN public."Countries" c ON p."Nationality" = c."Code"
    LEFT JOIN public."Families" f ON p."FamilyId" = f."Id"
    LEFT JOIN public."MediaFiles" m ON p."AvatarMediaId" = m."Id"
    LEFT JOIN LATERAL (
        SELECT
            parent."Id" AS father_id,
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
    ) father_data ON TRUE
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
          AND pc1."IsDeleted" = FALSE
          AND pc2."IsDeleted" = FALSE
          AND father."IsDeleted" = FALSE
          AND grandparent."IsDeleted" = FALSE
        LIMIT 1
    ) grandfather_data ON TRUE
    WHERE
        p."IsDeleted" = FALSE  -- SOFT DELETE FILTER
        AND (p_tree_id IS NULL OR p."OrgId" = p_tree_id)
        AND (p_town_id IS NULL OR p."OrgId" = ANY(v_tree_ids))
        AND (p_family_id IS NULL OR p."FamilyId" = p_family_id)
        AND (p_sex IS NULL OR
            (p_sex = 'Male' AND p."Sex" = 0) OR
            (p_sex = 'Female' AND p."Sex" = 1) OR
            (p_sex = 'Unknown' AND p."Sex" = 2))
        AND (p_is_living IS NULL OR
            (p_is_living = TRUE AND p."DeathDate" IS NULL) OR
            (p_is_living = FALSE AND p."DeathDate" IS NOT NULL))
        AND (p_birth_year_from IS NULL OR EXTRACT(YEAR FROM p."BirthDate") >= p_birth_year_from)
        AND (p_birth_year_to IS NULL OR EXTRACT(YEAR FROM p."BirthDate") <= p_birth_year_to)
        AND (p_nationality IS NULL OR p."Nationality" = p_nationality)
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
    ORDER BY
        CASE WHEN p."NameArabic" ILIKE v_search_pattern THEN 0 ELSE 1 END,
        CASE WHEN p."NameEnglish" ILIKE v_search_pattern THEN 0 ELSE 1 END,
        COALESCE(p."PrimaryName", p."NameEnglish", p."NameArabic", p."NameNobiin")
    LIMIT p_page_size
    OFFSET v_offset;
END;
$function$;

-- Add comment
COMMENT ON FUNCTION public.search_persons_unified IS
    'Unified person search with soft delete support - excludes deleted records';
