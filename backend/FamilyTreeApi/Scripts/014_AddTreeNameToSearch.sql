-- Migration: Add tree_name to search_persons_unified function
-- This adds the organization/tree name to search results for display

-- Drop ALL existing versions of the function (use CASCADE to handle dependencies)
DROP FUNCTION IF EXISTS search_persons_unified CASCADE;

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
    p_nationality TEXT DEFAULT NULL,
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
    father_id UUID,
    father_name_arabic VARCHAR(300),
    father_name_english VARCHAR(300),
    father_name_nobiin VARCHAR(300),
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
    nationality VARCHAR(100),
    is_living BOOLEAN,
    family_id UUID,
    family_name VARCHAR(200),
    org_id UUID,
    tree_name VARCHAR(200),
    names JSONB,
    parents_count BIGINT,
    children_count BIGINT,
    spouses_count BIGINT,
    media_count BIGINT,
    avatar_media_id UUID,
    avatar_url TEXT
) AS $$
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

    SELECT COUNT(*) INTO v_total
    FROM public."People" p
    LEFT JOIN public."Orgs" o ON p."OrgId" = o."Id"
    WHERE
        (p_tree_id IS NULL OR p."OrgId" = p_tree_id)
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
        (SELECT COUNT(*)::BIGINT FROM public."ParentChildren" pc WHERE pc."ChildId" = p."Id") AS parents_count,
        (SELECT COUNT(*)::BIGINT FROM public."ParentChildren" pc WHERE pc."ParentId" = p."Id") AS children_count,
        (SELECT COUNT(*)::BIGINT FROM public."UnionMembers" um WHERE um."PersonId" = p."Id") AS spouses_count,
        (SELECT COUNT(*)::BIGINT FROM public."PersonMedia" pm WHERE pm."PersonId" = p."Id") AS media_count,
        p."AvatarMediaId"::UUID AS avatar_media_id,
        m."Url"::TEXT AS avatar_url
    FROM public."People" p
    LEFT JOIN public."Places" bp ON p."BirthPlaceId" = bp."Id"
    LEFT JOIN public."Places" dp ON p."DeathPlaceId" = dp."Id"
    LEFT JOIN public."Orgs" o ON p."OrgId" = o."Id"
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
        WHERE pc."ChildId" = p."Id" AND parent."Sex" = 0
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
        LIMIT 1
    ) grandfather_data ON TRUE
    WHERE
        (p_tree_id IS NULL OR p."OrgId" = p_tree_id)
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
$$ LANGUAGE plpgsql;
