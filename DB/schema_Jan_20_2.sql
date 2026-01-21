--
-- PostgreSQL database dump
--

\restrict K8Fg1efyg19Ys7SUnAjh2euMbGUDo0YfBalMrSkFXQO5aIvWngPeXADWskIzoze

-- Dumped from database version 15.15 (Ubuntu 15.15-1.pgdg22.04+1)
-- Dumped by pg_dump version 18.0

-- Started on 2026-01-20 16:17:52

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- TOC entry 3 (class 3079 OID 70938)
-- Name: pg_trgm; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;


--
-- TOC entry 3934 (class 0 OID 0)
-- Dependencies: 3
-- Name: EXTENSION pg_trgm; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION pg_trgm IS 'text similarity measurement and index searching based on trigrams';


--
-- TOC entry 4 (class 3079 OID 106017)
-- Name: unaccent; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA public;


--
-- TOC entry 3935 (class 0 OID 0)
-- Dependencies: 4
-- Name: EXTENSION unaccent; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION unaccent IS 'text search dictionary that removes accents';


--
-- TOC entry 2 (class 3079 OID 70927)
-- Name: uuid-ossp; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public;


--
-- TOC entry 3936 (class 0 OID 0)
-- Dependencies: 2
-- Name: EXTENSION "uuid-ossp"; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION "uuid-ossp" IS 'generate universally unique identifiers (UUIDs)';


--
-- TOC entry 327 (class 1255 OID 106797)
-- Name: find_relationship_path(uuid, uuid, uuid, integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.find_relationship_path(p_person1_id uuid, p_person2_id uuid, p_tree_id uuid DEFAULT NULL::uuid, p_max_depth integer DEFAULT 10) RETURNS TABLE(path_found boolean, path_length integer, relationship_type character varying, relationship_label character varying, relationship_name_key character varying, path_ids uuid[], common_ancestor_id uuid)
    LANGUAGE plpgsql
    AS $$
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
$$;


ALTER FUNCTION public.find_relationship_path(p_person1_id uuid, p_person2_id uuid, p_tree_id uuid, p_max_depth integer) OWNER TO postgres;

--
-- TOC entry 325 (class 1255 OID 106400)
-- Name: get_family_tree_data(uuid, text, integer, boolean); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.get_family_tree_data(p_root_person_id uuid, p_view_mode text DEFAULT 'pedigree'::text, p_generations integer DEFAULT 3, p_include_spouses boolean DEFAULT true) RETURNS TABLE(person_id uuid, primary_name character varying, name_arabic character varying, name_english character varying, name_nobiin character varying, sex integer, birth_date timestamp without time zone, death_date timestamp without time zone, birth_place character varying, death_place character varying, is_living boolean, generation_level integer, relationship_type text, parent_id uuid, spouse_union_id uuid, names jsonb)
    LANGUAGE plpgsql
    AS $$
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
$$;


ALTER FUNCTION public.get_family_tree_data(p_root_person_id uuid, p_view_mode text, p_generations integer, p_include_spouses boolean) OWNER TO postgres;

--
-- TOC entry 326 (class 1255 OID 106401)
-- Name: get_person_details(uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.get_person_details(p_person_id uuid) RETURNS TABLE(person_id uuid, primary_name character varying, name_arabic character varying, name_english character varying, name_nobiin character varying, sex integer, birth_date timestamp without time zone, birth_precision integer, death_date timestamp without time zone, death_precision integer, birth_place_id uuid, birth_place_name character varying, death_place_id uuid, death_place_name character varying, is_living boolean, notes text, family_id uuid, family_name character varying, org_id uuid, created_at timestamp without time zone, updated_at timestamp without time zone, names jsonb, parents jsonb, children jsonb, spouses jsonb, siblings jsonb)
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
$$;


ALTER FUNCTION public.get_person_details(p_person_id uuid) OWNER TO postgres;

--
-- TOC entry 322 (class 1255 OID 106067)
-- Name: normalize_arabic(text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.normalize_arabic(p_text text) RETURNS text
    LANGUAGE sql IMMUTABLE PARALLEL SAFE
    AS $$
    SELECT regexp_replace(
        LOWER(COALESCE(p_text, '')),
        '[\u064B-\u065F\u0670]',  -- Arabic diacritics range
        '',
        'g'
    );
$$;


ALTER FUNCTION public.normalize_arabic(p_text text) OWNER TO postgres;

--
-- TOC entry 323 (class 1255 OID 106068)
-- Name: normalize_latin(text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.normalize_latin(p_text text) RETURNS text
    LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE
    AS $$
BEGIN
    -- Try using unaccent if extension is available
    BEGIN
        RETURN LOWER(unaccent(COALESCE(p_text, '')));
    EXCEPTION WHEN undefined_function THEN
        -- Fallback: just lowercase if unaccent not available
        RETURN LOWER(COALESCE(p_text, ''));
    END;
END;
$$;


ALTER FUNCTION public.normalize_latin(p_text text) OWNER TO postgres;

--
-- TOC entry 324 (class 1255 OID 106069)
-- Name: normalize_text_universal(text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.normalize_text_universal(p_text text) RETURNS text
    LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE
    AS $$
BEGIN
    -- Try using unaccent if extension is available
    BEGIN
        RETURN LOWER(
            regexp_replace(
                unaccent(COALESCE(p_text, '')),
                '[\u064B-\u065F\u0670]',  -- Remove Arabic diacritics
                '',
                'g'
            )
        );
    EXCEPTION WHEN undefined_function THEN
        -- Fallback: just remove Arabic diacritics and lowercase
        RETURN LOWER(
            regexp_replace(
                COALESCE(p_text, ''),
                '[\u064B-\u065F\u0670]',
                '',
                'g'
            )
        );
    END;
END;
$$;


ALTER FUNCTION public.normalize_text_universal(p_text text) OWNER TO postgres;

--
-- TOC entry 328 (class 1255 OID 107135)
-- Name: search_persons_unified(text, text, uuid, uuid, uuid, text, boolean, integer, integer, text, integer, integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.search_persons_unified(p_query text DEFAULT NULL::text, p_search_in text DEFAULT 'auto'::text, p_tree_id uuid DEFAULT NULL::uuid, p_town_id uuid DEFAULT NULL::uuid, p_family_id uuid DEFAULT NULL::uuid, p_sex text DEFAULT NULL::text, p_is_living boolean DEFAULT NULL::boolean, p_birth_year_from integer DEFAULT NULL::integer, p_birth_year_to integer DEFAULT NULL::integer, p_nationality text DEFAULT NULL::text, p_page integer DEFAULT 1, p_page_size integer DEFAULT 20) RETURNS TABLE(total_count bigint, page integer, page_size integer, person_id uuid, primary_name character varying, name_arabic character varying, name_english character varying, name_nobiin character varying, father_id uuid, father_name_arabic character varying, father_name_english character varying, father_name_nobiin character varying, grandfather_id uuid, grandfather_name_arabic character varying, grandfather_name_english character varying, grandfather_name_nobiin character varying, sex integer, birth_date timestamp without time zone, birth_precision integer, death_date timestamp without time zone, death_precision integer, birth_place_name character varying, death_place_name character varying, nationality character varying, is_living boolean, family_id uuid, family_name character varying, org_id uuid, tree_name character varying, names jsonb, parents_count bigint, children_count bigint, spouses_count bigint, media_count bigint, avatar_media_id uuid, avatar_url text)
    LANGUAGE plpgsql
    AS $$
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
$$;


ALTER FUNCTION public.search_persons_unified(p_query text, p_search_in text, p_tree_id uuid, p_town_id uuid, p_family_id uuid, p_sex text, p_is_living boolean, p_birth_year_from integer, p_birth_year_to integer, p_nationality text, p_page integer, p_page_size integer) OWNER TO postgres;

--
-- TOC entry 321 (class 1255 OID 72730)
-- Name: user_has_tree_access(bigint, uuid, integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.user_has_tree_access(p_user_id bigint, p_tree_id uuid, p_min_role integer DEFAULT 0) RETURNS boolean
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_is_super_admin BOOLEAN;
    v_is_admin BOOLEAN;
    v_tree_role INTEGER;
BEGIN
    -- Check if SuperAdmin (using AspNetUserRoles)
    SELECT EXISTS (
        SELECT 1 FROM "AspNetUserRoles" ur 
        JOIN "AspNetRoles" r ON r."Id" = ur."RoleId"
        WHERE ur."UserId" = p_user_id AND r."NormalizedName" = 'SUPERADMIN'
    ) INTO v_is_super_admin;
    
    IF v_is_super_admin THEN
        RETURN TRUE;
    END IF;
    
    -- Check if Admin with tree assignment
    SELECT EXISTS (
        SELECT 1 FROM "AspNetUserRoles" ur 
        JOIN "AspNetRoles" r ON r."Id" = ur."RoleId"
        WHERE ur."UserId" = p_user_id AND r."NormalizedName" = 'ADMIN'
    ) INTO v_is_admin;
    
    IF v_is_admin THEN
        IF EXISTS (SELECT 1 FROM "AdminTreeAssignments" 
                   WHERE "UserId" = p_user_id AND "TreeId" = p_tree_id) THEN
            RETURN TRUE;
        END IF;
    END IF;
    
    -- Check tree-specific role
    SELECT "Role" INTO v_tree_role 
    FROM "OrgUsers" 
    WHERE "UserId" = p_user_id AND "OrgId" = p_tree_id;
    
    RETURN COALESCE(v_tree_role >= p_min_role, FALSE);
END;
$$;


ALTER FUNCTION public.user_has_tree_access(p_user_id bigint, p_tree_id uuid, p_min_role integer) OWNER TO postgres;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- TOC entry 261 (class 1259 OID 73047)
-- Name: AdminTownAssignments; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."AdminTownAssignments" (
    "Id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "UserId" bigint NOT NULL,
    "TownId" uuid NOT NULL,
    "AssignedByUserId" bigint,
    "AssignedAt" timestamp with time zone DEFAULT now() NOT NULL,
    "IsActive" boolean DEFAULT true NOT NULL
);


ALTER TABLE public."AdminTownAssignments" OWNER TO postgres;

--
-- TOC entry 3937 (class 0 OID 0)
-- Dependencies: 261
-- Name: TABLE "AdminTownAssignments"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public."AdminTownAssignments" IS 'Assigns Admin-level users to manage specific towns and all trees within them';


--
-- TOC entry 3938 (class 0 OID 0)
-- Dependencies: 261
-- Name: COLUMN "AdminTownAssignments"."UserId"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public."AdminTownAssignments"."UserId" IS 'The admin user being assigned to the town';


--
-- TOC entry 3939 (class 0 OID 0)
-- Dependencies: 261
-- Name: COLUMN "AdminTownAssignments"."TownId"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public."AdminTownAssignments"."TownId" IS 'The town the admin can manage';


--
-- TOC entry 3940 (class 0 OID 0)
-- Dependencies: 261
-- Name: COLUMN "AdminTownAssignments"."AssignedByUserId"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public."AdminTownAssignments"."AssignedByUserId" IS 'SuperAdmin who made this assignment';


--
-- TOC entry 3941 (class 0 OID 0)
-- Dependencies: 261
-- Name: COLUMN "AdminTownAssignments"."IsActive"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public."AdminTownAssignments"."IsActive" IS 'Soft delete flag - inactive assignments are ignored';


--
-- TOC entry 250 (class 1259 OID 72644)
-- Name: AdminTreeAssignments; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."AdminTreeAssignments" (
    "Id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "UserId" bigint NOT NULL,
    "TreeId" uuid NOT NULL,
    "AssignedByUserId" bigint,
    "AssignedAt" timestamp with time zone DEFAULT now()
);


ALTER TABLE public."AdminTreeAssignments" OWNER TO postgres;

--
-- TOC entry 234 (class 1259 OID 72389)
-- Name: AspNetRoleClaims; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."AspNetRoleClaims" (
    "Id" integer NOT NULL,
    "RoleId" bigint NOT NULL,
    "ClaimType" text,
    "ClaimValue" text
);


ALTER TABLE public."AspNetRoleClaims" OWNER TO postgres;

--
-- TOC entry 235 (class 1259 OID 72394)
-- Name: AspNetRoleClaims_Id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public."AspNetRoleClaims" ALTER COLUMN "Id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public."AspNetRoleClaims_Id_seq"
    START WITH 100
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 230 (class 1259 OID 72376)
-- Name: AspNetRoles; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."AspNetRoles" (
    "Id" bigint NOT NULL,
    "Name" character varying(256),
    "NormalizedName" character varying(256),
    "ConcurrencyStamp" text,
    "CreatedAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "UpdatedAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "Description" text
);


ALTER TABLE public."AspNetRoles" OWNER TO postgres;

--
-- TOC entry 231 (class 1259 OID 72381)
-- Name: AspNetRoles_Id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public."AspNetRoles" ALTER COLUMN "Id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public."AspNetRoles_Id_seq"
    START WITH 100
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 241 (class 1259 OID 72414)
-- Name: AspNetTemp; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."AspNetTemp" (
    "Id" integer NOT NULL,
    "ParCode" text NOT NULL,
    "InsertTime" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "AspUser" bigint
);


ALTER TABLE public."AspNetTemp" OWNER TO postgres;

--
-- TOC entry 242 (class 1259 OID 72420)
-- Name: AspNetTemp_Id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public."AspNetTemp" ALTER COLUMN "Id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public."AspNetTemp_Id_seq"
    START WITH 100
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 245 (class 1259 OID 72429)
-- Name: AspNetUserBearerToken; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."AspNetUserBearerToken" (
    "IssuedAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "ExpiresAt" timestamp with time zone NOT NULL,
    "IsRevoked" boolean DEFAULT false NOT NULL,
    "RevokedAt" time with time zone,
    "Value" text NOT NULL,
    "UserId" bigint NOT NULL,
    "RefreshTokenId" bigint NOT NULL,
    "Id" bigint NOT NULL
);


ALTER TABLE public."AspNetUserBearerToken" OWNER TO postgres;

--
-- TOC entry 246 (class 1259 OID 72436)
-- Name: AspNetUserBearerToken_Id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public."AspNetUserBearerToken" ALTER COLUMN "Id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public."AspNetUserBearerToken_Id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 236 (class 1259 OID 72395)
-- Name: AspNetUserClaims; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."AspNetUserClaims" (
    "Id" integer NOT NULL,
    "UserId" bigint NOT NULL,
    "ClaimType" text,
    "ClaimValue" text
);


ALTER TABLE public."AspNetUserClaims" OWNER TO postgres;

--
-- TOC entry 237 (class 1259 OID 72400)
-- Name: AspNetUserClaims_Id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public."AspNetUserClaims" ALTER COLUMN "Id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public."AspNetUserClaims_Id_seq"
    START WITH 100
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 238 (class 1259 OID 72401)
-- Name: AspNetUserLogins; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."AspNetUserLogins" (
    "LoginProvider" text NOT NULL,
    "ProviderKey" text NOT NULL,
    "ProviderDisplayName" text,
    "UserId" bigint NOT NULL
);


ALTER TABLE public."AspNetUserLogins" OWNER TO postgres;

--
-- TOC entry 239 (class 1259 OID 72406)
-- Name: AspNetUserRoles; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."AspNetUserRoles" (
    "UserId" bigint NOT NULL,
    "RoleId" bigint NOT NULL,
    "AssignedAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "AssignedBy" integer
);


ALTER TABLE public."AspNetUserRoles" OWNER TO postgres;

--
-- TOC entry 240 (class 1259 OID 72409)
-- Name: AspNetUserTokens; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."AspNetUserTokens" (
    "UserId" bigint NOT NULL,
    "LoginProvider" text NOT NULL,
    "Name" text NOT NULL,
    "Value" text,
    "CreatedAt" timestamp with time zone DEFAULT now()
);


ALTER TABLE public."AspNetUserTokens" OWNER TO postgres;

--
-- TOC entry 232 (class 1259 OID 72382)
-- Name: AspNetUsers; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."AspNetUsers" (
    "Id" bigint NOT NULL,
    "InsertTime" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "IvrProviderId" text,
    "HomePhonenumber" text,
    "UserName" text,
    "NormalizedUserName" text,
    "Email" text,
    "NormalizedEmail" text,
    "EmailConfirmed" boolean NOT NULL,
    "PasswordHash" text,
    "SecurityStamp" text,
    "ConcurrencyStamp" text,
    "PhoneNumber" text,
    "PhoneNumberConfirmed" boolean NOT NULL,
    "TwoFactorEnabled" boolean NOT NULL,
    "LockoutEnd" timestamp with time zone,
    "LockoutEnabled" boolean NOT NULL,
    "AccessFailedCount" integer NOT NULL,
    "TwoFactorCode" text,
    "CreatedAt" timestamp with time zone DEFAULT now(),
    "LastLoginAt" timestamp with time zone,
    "FirstName" character varying(100),
    "LastName" character varying(100),
    "PreferredLanguage" character varying(10) DEFAULT 'en'::character varying NOT NULL,
    "SelectedTownId" uuid,
    "IsFirstLogin" boolean DEFAULT true NOT NULL
);


ALTER TABLE public."AspNetUsers" OWNER TO postgres;

--
-- TOC entry 3942 (class 0 OID 0)
-- Dependencies: 232
-- Name: COLUMN "AspNetUsers"."PreferredLanguage"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public."AspNetUsers"."PreferredLanguage" IS 'User preferred language code: en, ar, nob';


--
-- TOC entry 3943 (class 0 OID 0)
-- Dependencies: 232
-- Name: COLUMN "AspNetUsers"."SelectedTownId"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public."AspNetUsers"."SelectedTownId" IS 'The town currently selected by the user for browsing family trees. Required for Admin and User roles.';


--
-- TOC entry 3944 (class 0 OID 0)
-- Dependencies: 232
-- Name: COLUMN "AspNetUsers"."IsFirstLogin"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public."AspNetUsers"."IsFirstLogin" IS 'Flag indicating user needs to complete onboarding (language selection). Set to FALSE after first setup.';


--
-- TOC entry 233 (class 1259 OID 72388)
-- Name: AspNetUsers_Id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public."AspNetUsers" ALTER COLUMN "Id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public."AspNetUsers_Id_seq"
    START WITH 100
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 229 (class 1259 OID 71268)
-- Name: AuditLogs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."AuditLogs" (
    "Id" uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    "ActorId" uuid NOT NULL,
    "EntityType" character varying(100) NOT NULL,
    "EntityId" uuid NOT NULL,
    "Action" character varying(50) NOT NULL,
    "ChangeJson" jsonb,
    "Timestamp" timestamp without time zone DEFAULT (now() AT TIME ZONE 'UTC'::text) NOT NULL,
    "IpAddress" character varying(50)
);


ALTER TABLE public."AuditLogs" OWNER TO postgres;

--
-- TOC entry 263 (class 1259 OID 108795)
-- Name: CarouselImages; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."CarouselImages" (
    "Id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "ImageUrl" character varying(1000) NOT NULL,
    "StorageKey" character varying(500),
    "Title" character varying(200),
    "Description" character varying(500),
    "DisplayOrder" integer DEFAULT 0 NOT NULL,
    "IsActive" boolean DEFAULT true NOT NULL,
    "StorageType" integer DEFAULT 1 NOT NULL,
    "FileName" character varying(255),
    "FileSize" bigint,
    "CreatedByUserId" bigint NOT NULL,
    "CreatedAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "UpdatedAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public."CarouselImages" OWNER TO postgres;

--
-- TOC entry 3945 (class 0 OID 0)
-- Dependencies: 263
-- Name: TABLE "CarouselImages"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public."CarouselImages" IS 'Stores carousel/slideshow images for the onboarding town selection page. Managed by SuperAdmins.';


--
-- TOC entry 3946 (class 0 OID 0)
-- Dependencies: 263
-- Name: COLUMN "CarouselImages"."StorageType"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public."CarouselImages"."StorageType" IS '1=External URL, 2=Local Storage, 3=Cloudflare R2';


--
-- TOC entry 262 (class 1259 OID 106652)
-- Name: Countries; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."Countries" (
    "Code" character varying(2) NOT NULL,
    "NameEn" character varying(100) NOT NULL,
    "NameAr" character varying(100),
    "NameLocal" character varying(100),
    "Region" character varying(50),
    "IsActive" boolean DEFAULT true NOT NULL,
    "DisplayOrder" integer DEFAULT 0 NOT NULL
);


ALTER TABLE public."Countries" OWNER TO postgres;

--
-- TOC entry 260 (class 1259 OID 73001)
-- Name: Families; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."Families" (
    "Id" uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    "Name" character varying(200) NOT NULL,
    "NameEn" character varying(200),
    "NameAr" character varying(200),
    "NameLocal" character varying(200),
    "Description" text,
    "OrgId" uuid NOT NULL,
    "TownId" uuid NOT NULL,
    "PatriarchId" uuid,
    "MatriarchId" uuid,
    "Color" character varying(7),
    "SortOrder" integer DEFAULT 0 NOT NULL,
    "CreatedAt" timestamp with time zone DEFAULT now() NOT NULL,
    "UpdatedAt" timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public."Families" OWNER TO postgres;

--
-- TOC entry 3947 (class 0 OID 0)
-- Dependencies: 260
-- Name: TABLE "Families"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public."Families" IS 'Groups of people within a family tree. Part of Town->Org->Family->Person hierarchy.';


--
-- TOC entry 3948 (class 0 OID 0)
-- Dependencies: 260
-- Name: COLUMN "Families"."Name"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public."Families"."Name" IS 'Primary family name/label for grouping';


--
-- TOC entry 3949 (class 0 OID 0)
-- Dependencies: 260
-- Name: COLUMN "Families"."OrgId"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public."Families"."OrgId" IS 'The family tree this family group belongs to';


--
-- TOC entry 3950 (class 0 OID 0)
-- Dependencies: 260
-- Name: COLUMN "Families"."TownId"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public."Families"."TownId" IS 'Denormalized town reference for easier filtering';


--
-- TOC entry 3951 (class 0 OID 0)
-- Dependencies: 260
-- Name: COLUMN "Families"."PatriarchId"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public."Families"."PatriarchId" IS 'Optional reference to founding male ancestor';


--
-- TOC entry 3952 (class 0 OID 0)
-- Dependencies: 260
-- Name: COLUMN "Families"."MatriarchId"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public."Families"."MatriarchId" IS 'Optional reference to founding female ancestor';


--
-- TOC entry 256 (class 1259 OID 72928)
-- Name: FamilyRelationshipTypes; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."FamilyRelationshipTypes" (
    "Id" integer NOT NULL,
    "NameArabic" character varying(100) NOT NULL,
    "NameEnglish" character varying(100) NOT NULL,
    "NameNubian" character varying(100) NOT NULL,
    "Category" character varying(50),
    "SortOrder" integer DEFAULT 0 NOT NULL,
    "IsActive" boolean DEFAULT true NOT NULL,
    "CreatedAt" timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public."FamilyRelationshipTypes" OWNER TO postgres;

--
-- TOC entry 255 (class 1259 OID 72927)
-- Name: FamilyRelationshipTypes_Id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public."FamilyRelationshipTypes_Id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public."FamilyRelationshipTypes_Id_seq" OWNER TO postgres;

--
-- TOC entry 3953 (class 0 OID 0)
-- Dependencies: 255
-- Name: FamilyRelationshipTypes_Id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public."FamilyRelationshipTypes_Id_seq" OWNED BY public."FamilyRelationshipTypes"."Id";


--
-- TOC entry 225 (class 1259 OID 71206)
-- Name: MediaFiles; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."MediaFiles" (
    "Id" uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    "OrgId" uuid NOT NULL,
    "Url" character varying(500) NOT NULL,
    "StorageKey" character varying(500) NOT NULL,
    "Kind" integer DEFAULT 0 NOT NULL,
    "Title" character varying(200),
    "Description" text,
    "CaptureDate" timestamp without time zone,
    "CapturePlaceId" uuid,
    "Visibility" integer DEFAULT 1 NOT NULL,
    "Copyright" text,
    "MetadataJson" jsonb,
    "CreatedAt" timestamp without time zone DEFAULT (now() AT TIME ZONE 'UTC'::text) NOT NULL,
    "UpdatedAt" timestamp without time zone DEFAULT (now() AT TIME ZONE 'UTC'::text) NOT NULL,
    "UploadedByUserId" bigint,
    "Category" character varying(50),
    "FileName" character varying(255) DEFAULT ''::character varying NOT NULL,
    "MimeType" character varying(100),
    "FileSize" bigint DEFAULT 0 NOT NULL,
    "PersonId" uuid,
    "ThumbnailPath" character varying(500),
    "StorageType" integer DEFAULT 1 NOT NULL
);


ALTER TABLE public."MediaFiles" OWNER TO postgres;

--
-- TOC entry 259 (class 1259 OID 72968)
-- Name: NameMappings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."NameMappings" (
    "Id" integer NOT NULL,
    "Arabic" character varying(200),
    "ArabicNormalized" character varying(200),
    "English" character varying(200),
    "EnglishNormalized" character varying(200),
    "Nobiin" character varying(200),
    "NobiinNormalized" character varying(200),
    "Ipa" character varying(200),
    "IsVerified" boolean DEFAULT false NOT NULL,
    "NeedsReview" boolean DEFAULT false NOT NULL,
    "Source" character varying(50),
    "Confidence" double precision,
    "CreatedAt" timestamp with time zone DEFAULT now() NOT NULL,
    "UpdatedAt" timestamp with time zone,
    "ConfirmedByUserId" bigint,
    "OrgId" uuid
);


ALTER TABLE public."NameMappings" OWNER TO postgres;

--
-- TOC entry 3954 (class 0 OID 0)
-- Dependencies: 259
-- Name: TABLE "NameMappings"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public."NameMappings" IS 'Stores verified name transliterations between Arabic, English, and Nobiin scripts for consistency across family trees';


--
-- TOC entry 3955 (class 0 OID 0)
-- Dependencies: 259
-- Name: COLUMN "NameMappings"."NeedsReview"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public."NameMappings"."NeedsReview" IS 'Whether this mapping needs human review (low confidence or conflict)';


--
-- TOC entry 3956 (class 0 OID 0)
-- Dependencies: 259
-- Name: COLUMN "NameMappings"."Source"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public."NameMappings"."Source" IS 'Source of the mapping: user (manually entered), ged (from GED import), ai (AI-generated)';


--
-- TOC entry 3957 (class 0 OID 0)
-- Dependencies: 259
-- Name: COLUMN "NameMappings"."Confidence"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public."NameMappings"."Confidence" IS 'AI confidence score (0.0-1.0) if source is ai';


--
-- TOC entry 258 (class 1259 OID 72967)
-- Name: NameMappings_Id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public."NameMappings_Id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public."NameMappings_Id_seq" OWNER TO postgres;

--
-- TOC entry 3958 (class 0 OID 0)
-- Dependencies: 258
-- Name: NameMappings_Id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public."NameMappings_Id_seq" OWNED BY public."NameMappings"."Id";


--
-- TOC entry 219 (class 1259 OID 71044)
-- Name: OrgUsers; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."OrgUsers" (
    "Id" uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    "OrgId" uuid NOT NULL,
    "UserId" bigint NOT NULL,
    "Role" integer DEFAULT 0 NOT NULL,
    "JoinedAt" timestamp without time zone DEFAULT (now() AT TIME ZONE 'UTC'::text) NOT NULL
);


ALTER TABLE public."OrgUsers" OWNER TO postgres;

--
-- TOC entry 217 (class 1259 OID 71019)
-- Name: Orgs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."Orgs" (
    "Id" uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    "Name" character varying(200) NOT NULL,
    "SettingsJson" jsonb,
    "CreatedAt" timestamp without time zone DEFAULT (now() AT TIME ZONE 'UTC'::text) NOT NULL,
    "UpdatedAt" timestamp without time zone DEFAULT (now() AT TIME ZONE 'UTC'::text) NOT NULL,
    "Description" text,
    "IsPublic" boolean DEFAULT false,
    "AllowCrossTreeLinking" boolean DEFAULT true,
    "CoverImageUrl" character varying(500),
    "OwnerId" bigint,
    "TownId" uuid NOT NULL
);


ALTER TABLE public."Orgs" OWNER TO postgres;

--
-- TOC entry 3959 (class 0 OID 0)
-- Dependencies: 217
-- Name: COLUMN "Orgs"."TownId"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public."Orgs"."TownId" IS 'REQUIRED: Every family tree must belong to a town. Part of the Town->Family->Person hierarchy.';


--
-- TOC entry 224 (class 1259 OID 71183)
-- Name: ParentChildren; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."ParentChildren" (
    "Id" uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    "ParentId" uuid NOT NULL,
    "ChildId" uuid NOT NULL,
    "RelationshipType" integer DEFAULT 0 NOT NULL,
    "Certainty" character varying(50),
    "Notes" text,
    "CreatedAt" timestamp without time zone DEFAULT (now() AT TIME ZONE 'UTC'::text) NOT NULL
);


ALTER TABLE public."ParentChildren" OWNER TO postgres;

--
-- TOC entry 3960 (class 0 OID 0)
-- Dependencies: 224
-- Name: TABLE "ParentChildren"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public."ParentChildren" IS 'Parent-child relationships with cycle detection logic in application';


--
-- TOC entry 221 (class 1259 OID 71084)
-- Name: People; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."People" (
    "Id" uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    "OrgId" uuid NOT NULL,
    "PrimaryName" character varying(200),
    "Sex" integer DEFAULT 2 NOT NULL,
    "Gender" character varying(50),
    "BirthDate" timestamp without time zone,
    "BirthPrecision" integer DEFAULT 5 NOT NULL,
    "BirthPlaceId" uuid,
    "DeathDate" timestamp without time zone,
    "DeathPrecision" integer DEFAULT 5 NOT NULL,
    "DeathPlaceId" uuid,
    "PrivacyLevel" integer DEFAULT 1 NOT NULL,
    "Occupation" text,
    "Education" text,
    "Religion" text,
    "Nationality" text,
    "Ethnicity" text,
    "Notes" text,
    "SearchVector" tsvector GENERATED ALWAYS AS (to_tsvector('english'::regconfig, (((((COALESCE("PrimaryName", ''::character varying))::text || ' '::text) || COALESCE("Occupation", ''::text)) || ' '::text) || COALESCE("Notes", ''::text)))) STORED,
    "IsVerified" boolean DEFAULT false NOT NULL,
    "NeedsReview" boolean DEFAULT false NOT NULL,
    "HasConflict" boolean DEFAULT false NOT NULL,
    "CreatedAt" timestamp without time zone DEFAULT (now() AT TIME ZONE 'UTC'::text) NOT NULL,
    "UpdatedAt" timestamp without time zone DEFAULT (now() AT TIME ZONE 'UTC'::text) NOT NULL,
    "FamilyId" uuid,
    "NameArabic" character varying(300),
    "NameEnglish" character varying(300),
    "NameNobiin" character varying(300),
    "AvatarMediaId" uuid
);


ALTER TABLE public."People" OWNER TO postgres;

--
-- TOC entry 3961 (class 0 OID 0)
-- Dependencies: 221
-- Name: TABLE "People"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public."People" IS 'Core genealogy entity with multi-tenant support';


--
-- TOC entry 3962 (class 0 OID 0)
-- Dependencies: 221
-- Name: COLUMN "People"."SearchVector"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public."People"."SearchVector" IS 'Auto-generated tsvector for full-text search';


--
-- TOC entry 3963 (class 0 OID 0)
-- Dependencies: 221
-- Name: COLUMN "People"."FamilyId"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public."People"."FamilyId" IS 'Optional family group this person belongs to';


--
-- TOC entry 249 (class 1259 OID 72605)
-- Name: PersonLinks; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."PersonLinks" (
    "Id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "SourcePersonId" uuid NOT NULL,
    "TargetPersonId" uuid NOT NULL,
    "LinkType" integer DEFAULT 0 NOT NULL,
    "Confidence" integer DEFAULT 100,
    "Notes" text,
    "CreatedByUserId" bigint,
    "ApprovedByUserId" bigint,
    "Status" integer DEFAULT 0 NOT NULL,
    "CreatedAt" timestamp with time zone DEFAULT now(),
    "UpdatedAt" timestamp with time zone DEFAULT now(),
    CONSTRAINT "CK_PersonLinks_Different" CHECK (("SourcePersonId" <> "TargetPersonId"))
);


ALTER TABLE public."PersonLinks" OWNER TO postgres;

--
-- TOC entry 257 (class 1259 OID 72940)
-- Name: PersonMedia; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."PersonMedia" (
    "Id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "PersonId" uuid NOT NULL,
    "MediaId" uuid NOT NULL,
    "IsPrimary" boolean DEFAULT false NOT NULL,
    "SortOrder" integer DEFAULT 0 NOT NULL,
    "Notes" text,
    "CreatedAt" timestamp with time zone DEFAULT now() NOT NULL,
    "LinkedAt" timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public."PersonMedia" OWNER TO postgres;

--
-- TOC entry 252 (class 1259 OID 72698)
-- Name: PersonMediaLinks; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."PersonMediaLinks" (
    "Id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "PersonId" uuid NOT NULL,
    "MediaId" uuid NOT NULL,
    "IsPrimary" boolean DEFAULT false,
    "SortOrder" integer DEFAULT 0,
    "Notes" text,
    "CreatedAt" timestamp with time zone DEFAULT now(),
    "LinkedAt" timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public."PersonMediaLinks" OWNER TO postgres;

--
-- TOC entry 3964 (class 0 OID 0)
-- Dependencies: 252
-- Name: TABLE "PersonMediaLinks"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public."PersonMediaLinks" IS 'Junction table linking People to Media (many-to-many)';


--
-- TOC entry 3965 (class 0 OID 0)
-- Dependencies: 252
-- Name: COLUMN "PersonMediaLinks"."Id"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public."PersonMediaLinks"."Id" IS 'Primary key (UUID)';


--
-- TOC entry 3966 (class 0 OID 0)
-- Dependencies: 252
-- Name: COLUMN "PersonMediaLinks"."PersonId"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public."PersonMediaLinks"."PersonId" IS 'Foreign key to People table';


--
-- TOC entry 3967 (class 0 OID 0)
-- Dependencies: 252
-- Name: COLUMN "PersonMediaLinks"."MediaId"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public."PersonMediaLinks"."MediaId" IS 'Foreign key to MediaFiles table';


--
-- TOC entry 3968 (class 0 OID 0)
-- Dependencies: 252
-- Name: COLUMN "PersonMediaLinks"."IsPrimary"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public."PersonMediaLinks"."IsPrimary" IS 'True if this is the primary/profile photo for this person';


--
-- TOC entry 3969 (class 0 OID 0)
-- Dependencies: 252
-- Name: COLUMN "PersonMediaLinks"."SortOrder"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public."PersonMediaLinks"."SortOrder" IS 'Display order when showing person media';


--
-- TOC entry 3970 (class 0 OID 0)
-- Dependencies: 252
-- Name: COLUMN "PersonMediaLinks"."Notes"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public."PersonMediaLinks"."Notes" IS 'Notes about this person in the media (e.g., position in group photo)';


--
-- TOC entry 3971 (class 0 OID 0)
-- Dependencies: 252
-- Name: COLUMN "PersonMediaLinks"."LinkedAt"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public."PersonMediaLinks"."LinkedAt" IS 'Timestamp when this person was linked to this media';


--
-- TOC entry 228 (class 1259 OID 71250)
-- Name: PersonTags; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."PersonTags" (
    "Id" uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    "PersonId" uuid NOT NULL,
    "TagId" uuid NOT NULL,
    "CreatedAt" timestamp without time zone DEFAULT (now() AT TIME ZONE 'UTC'::text) NOT NULL
);


ALTER TABLE public."PersonTags" OWNER TO postgres;

--
-- TOC entry 220 (class 1259 OID 71063)
-- Name: Places; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."Places" (
    "Id" uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    "OrgId" uuid NOT NULL,
    "Name" character varying(200) NOT NULL,
    "Type" character varying(50),
    "ParentId" uuid,
    "Latitude" double precision,
    "Longitude" double precision,
    "AltNamesJson" jsonb,
    "CreatedAt" timestamp without time zone DEFAULT (now() AT TIME ZONE 'UTC'::text) NOT NULL
);


ALTER TABLE public."Places" OWNER TO postgres;

--
-- TOC entry 243 (class 1259 OID 72421)
-- Name: RefreshToken; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."RefreshToken" (
    "IssuedAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "ExpiresAt" timestamp with time zone NOT NULL,
    "IsRevoked" boolean DEFAULT false NOT NULL,
    "RevokedAt" timestamp with time zone,
    "Value" text NOT NULL,
    "Id" bigint NOT NULL,
    "UserId" bigint NOT NULL
);


ALTER TABLE public."RefreshToken" OWNER TO postgres;

--
-- TOC entry 244 (class 1259 OID 72428)
-- Name: RefreshToken_Id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public."RefreshToken" ALTER COLUMN "Id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public."RefreshToken_Id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 247 (class 1259 OID 72437)
-- Name: SignerToken; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."SignerToken" (
    "IssuedAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "ExpiresAt" timestamp with time zone NOT NULL,
    "IsRevoked" boolean DEFAULT false NOT NULL,
    "RevokedAt" timestamp with time zone,
    "Value" text NOT NULL,
    "IsUsed" boolean DEFAULT false NOT NULL,
    "UsedAt" timestamp with time zone,
    "IssuedTo" text NOT NULL,
    "IssuedForDocumentId" integer NOT NULL,
    "Id" bigint NOT NULL,
    "RecipientEmail" text NOT NULL,
    "IssuedToId" integer DEFAULT 0 NOT NULL,
    "Passcode" integer DEFAULT 0 NOT NULL
);


ALTER TABLE public."SignerToken" OWNER TO postgres;

--
-- TOC entry 248 (class 1259 OID 72447)
-- Name: SignerToken_Id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public."SignerToken" ALTER COLUMN "Id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public."SignerToken_Id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 226 (class 1259 OID 71230)
-- Name: Sources; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."Sources" (
    "Id" uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    "OrgId" uuid NOT NULL,
    "Title" character varying(300) NOT NULL,
    "Repository" character varying(200),
    "Citation" text,
    "Url" character varying(500),
    "MetadataJson" jsonb,
    "CreatedAt" timestamp without time zone DEFAULT (now() AT TIME ZONE 'UTC'::text) NOT NULL,
    "UpdatedAt" timestamp without time zone DEFAULT (now() AT TIME ZONE 'UTC'::text) NOT NULL
);


ALTER TABLE public."Sources" OWNER TO postgres;

--
-- TOC entry 227 (class 1259 OID 71242)
-- Name: Tags; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."Tags" (
    "Id" uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    "OrgId" uuid NOT NULL,
    "Name" character varying(100) NOT NULL,
    "Color" character varying(50),
    "CreatedAt" timestamp without time zone DEFAULT (now() AT TIME ZONE 'UTC'::text) NOT NULL
);


ALTER TABLE public."Tags" OWNER TO postgres;

--
-- TOC entry 264 (class 1259 OID 108842)
-- Name: TownImages; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."TownImages" (
    "Id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "TownId" uuid NOT NULL,
    "ImageUrl" character varying(500) NOT NULL,
    "StorageKey" character varying(500),
    "FileName" character varying(255),
    "MimeType" character varying(50),
    "FileSize" bigint DEFAULT 0 NOT NULL,
    "StorageType" integer DEFAULT 1 NOT NULL,
    "Title" character varying(200),
    "TitleNb" character varying(200),
    "TitleAr" character varying(200),
    "TitleEn" character varying(200),
    "Description" character varying(500),
    "DescriptionNb" character varying(500),
    "DescriptionAr" character varying(500),
    "DescriptionEn" character varying(500),
    "DisplayOrder" integer DEFAULT 0 NOT NULL,
    "IsActive" boolean DEFAULT true NOT NULL,
    "CreatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "UpdatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "CreatedBy" bigint NOT NULL,
    "UpdatedBy" bigint
);


ALTER TABLE public."TownImages" OWNER TO postgres;

--
-- TOC entry 254 (class 1259 OID 72813)
-- Name: Towns; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."Towns" (
    "Id" uuid NOT NULL,
    "Name" character varying(200) NOT NULL,
    "NameEn" character varying(200),
    "NameAr" character varying(200),
    "NameLocal" character varying(200),
    "Description" text,
    "Country" character varying(100),
    "CreatedAt" timestamp without time zone NOT NULL,
    "UpdatedAt" timestamp without time zone NOT NULL
);


ALTER TABLE public."Towns" OWNER TO postgres;

--
-- TOC entry 251 (class 1259 OID 72670)
-- Name: TreeInvitations; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."TreeInvitations" (
    "Id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "TreeId" uuid NOT NULL,
    "Email" character varying(256) NOT NULL,
    "Role" integer DEFAULT 0 NOT NULL,
    "Token" character varying(100) NOT NULL,
    "InvitedByUserId" bigint NOT NULL,
    "ExpiresAt" timestamp with time zone NOT NULL,
    "AcceptedAt" timestamp with time zone,
    "AcceptedByUserId" bigint,
    "CreatedAt" timestamp with time zone DEFAULT now()
);


ALTER TABLE public."TreeInvitations" OWNER TO postgres;

--
-- TOC entry 223 (class 1259 OID 71164)
-- Name: UnionMembers; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."UnionMembers" (
    "Id" uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    "UnionId" uuid NOT NULL,
    "PersonId" uuid NOT NULL,
    "Role" character varying(50) DEFAULT 'Spouse'::character varying NOT NULL,
    "CreatedAt" timestamp without time zone DEFAULT (now() AT TIME ZONE 'UTC'::text) NOT NULL
);


ALTER TABLE public."UnionMembers" OWNER TO postgres;

--
-- TOC entry 3972 (class 0 OID 0)
-- Dependencies: 223
-- Name: TABLE "UnionMembers"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public."UnionMembers" IS 'Junction table supporting polygamy (multiple spouses per union)';


--
-- TOC entry 222 (class 1259 OID 71140)
-- Name: Unions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."Unions" (
    "Id" uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    "OrgId" uuid NOT NULL,
    "Type" integer DEFAULT 0 NOT NULL,
    "StartDate" timestamp without time zone,
    "StartPrecision" integer DEFAULT 5 NOT NULL,
    "StartPlaceId" uuid,
    "EndDate" timestamp without time zone,
    "EndPrecision" integer DEFAULT 5 NOT NULL,
    "EndPlaceId" uuid,
    "Notes" text,
    "CreatedAt" timestamp without time zone DEFAULT (now() AT TIME ZONE 'UTC'::text) NOT NULL,
    "UpdatedAt" timestamp without time zone DEFAULT (now() AT TIME ZONE 'UTC'::text) NOT NULL
);


ALTER TABLE public."Unions" OWNER TO postgres;

--
-- TOC entry 218 (class 1259 OID 71030)
-- Name: Users; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."Users" (
    "Id" uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    "Email" character varying(256) NOT NULL,
    "PasswordHash" text NOT NULL,
    "FirstName" character varying(100),
    "LastName" character varying(100),
    "EmailConfirmed" boolean DEFAULT false NOT NULL,
    "CreatedAt" timestamp without time zone DEFAULT (now() AT TIME ZONE 'UTC'::text) NOT NULL,
    "LastLoginAt" timestamp without time zone DEFAULT (now() AT TIME ZONE 'UTC'::text) NOT NULL,
    "RefreshToken" text,
    "RefreshTokenExpiryTime" timestamp without time zone
);


ALTER TABLE public."Users" OWNER TO postgres;

--
-- TOC entry 253 (class 1259 OID 72807)
-- Name: __EFMigrationsHistory; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."__EFMigrationsHistory" (
    "MigrationId" character varying(150) NOT NULL,
    "ProductVersion" character varying(32) NOT NULL
);


ALTER TABLE public."__EFMigrationsHistory" OWNER TO postgres;

--
-- TOC entry 3500 (class 2604 OID 72931)
-- Name: FamilyRelationshipTypes Id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."FamilyRelationshipTypes" ALTER COLUMN "Id" SET DEFAULT nextval('public."FamilyRelationshipTypes_Id_seq"'::regclass);


--
-- TOC entry 3509 (class 2604 OID 72971)
-- Name: NameMappings Id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."NameMappings" ALTER COLUMN "Id" SET DEFAULT nextval('public."NameMappings_Id_seq"'::regclass);


--
-- TOC entry 3656 (class 2606 OID 72650)
-- Name: AdminTreeAssignments AdminTreeAssignments_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."AdminTreeAssignments"
    ADD CONSTRAINT "AdminTreeAssignments_pkey" PRIMARY KEY ("Id");


--
-- TOC entry 3605 (class 2606 OID 71276)
-- Name: AuditLogs AuditLogs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."AuditLogs"
    ADD CONSTRAINT "AuditLogs_pkey" PRIMARY KEY ("Id");


--
-- TOC entry 3720 (class 2606 OID 108807)
-- Name: CarouselImages CarouselImages_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."CarouselImages"
    ADD CONSTRAINT "CarouselImages_pkey" PRIMARY KEY ("Id");


--
-- TOC entry 3701 (class 2606 OID 73011)
-- Name: Families Families_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Families"
    ADD CONSTRAINT "Families_pkey" PRIMARY KEY ("Id");


--
-- TOC entry 3682 (class 2606 OID 72936)
-- Name: FamilyRelationshipTypes FamilyRelationshipTypes_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."FamilyRelationshipTypes"
    ADD CONSTRAINT "FamilyRelationshipTypes_pkey" PRIMARY KEY ("Id");


--
-- TOC entry 3593 (class 2606 OID 71217)
-- Name: MediaFiles MediaFiles_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."MediaFiles"
    ADD CONSTRAINT "MediaFiles_pkey" PRIMARY KEY ("Id");


--
-- TOC entry 3699 (class 2606 OID 72978)
-- Name: NameMappings NameMappings_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."NameMappings"
    ADD CONSTRAINT "NameMappings_pkey" PRIMARY KEY ("Id");


--
-- TOC entry 3549 (class 2606 OID 71051)
-- Name: OrgUsers OrgUsers_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."OrgUsers"
    ADD CONSTRAINT "OrgUsers_pkey" PRIMARY KEY ("Id");


--
-- TOC entry 3541 (class 2606 OID 71028)
-- Name: Orgs Orgs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Orgs"
    ADD CONSTRAINT "Orgs_pkey" PRIMARY KEY ("Id");


--
-- TOC entry 3711 (class 2606 OID 73054)
-- Name: AdminTownAssignments PK_AdminTownAssignments; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."AdminTownAssignments"
    ADD CONSTRAINT "PK_AdminTownAssignments" PRIMARY KEY ("Id");


--
-- TOC entry 3623 (class 2606 OID 72453)
-- Name: AspNetRoleClaims PK_AspNetRoleClaims; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."AspNetRoleClaims"
    ADD CONSTRAINT "PK_AspNetRoleClaims" PRIMARY KEY ("Id");


--
-- TOC entry 3610 (class 2606 OID 72449)
-- Name: AspNetRoles PK_AspNetRoles; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."AspNetRoles"
    ADD CONSTRAINT "PK_AspNetRoles" PRIMARY KEY ("Id");


--
-- TOC entry 3636 (class 2606 OID 72463)
-- Name: AspNetTemp PK_AspNetTemp; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."AspNetTemp"
    ADD CONSTRAINT "PK_AspNetTemp" PRIMARY KEY ("Id");


--
-- TOC entry 3626 (class 2606 OID 72455)
-- Name: AspNetUserClaims PK_AspNetUserClaims; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."AspNetUserClaims"
    ADD CONSTRAINT "PK_AspNetUserClaims" PRIMARY KEY ("Id");


--
-- TOC entry 3629 (class 2606 OID 72457)
-- Name: AspNetUserLogins PK_AspNetUserLogins; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."AspNetUserLogins"
    ADD CONSTRAINT "PK_AspNetUserLogins" PRIMARY KEY ("LoginProvider", "ProviderKey");


--
-- TOC entry 3632 (class 2606 OID 72459)
-- Name: AspNetUserRoles PK_AspNetUserRoles; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."AspNetUserRoles"
    ADD CONSTRAINT "PK_AspNetUserRoles" PRIMARY KEY ("UserId", "RoleId");


--
-- TOC entry 3634 (class 2606 OID 72461)
-- Name: AspNetUserTokens PK_AspNetUserTokens; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."AspNetUserTokens"
    ADD CONSTRAINT "PK_AspNetUserTokens" PRIMARY KEY ("UserId", "LoginProvider", "Name");


--
-- TOC entry 3616 (class 2606 OID 72451)
-- Name: AspNetUsers PK_AspNetUsers; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."AspNetUsers"
    ADD CONSTRAINT "PK_AspNetUsers" PRIMARY KEY ("Id");


--
-- TOC entry 3718 (class 2606 OID 106658)
-- Name: Countries PK_Countries; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Countries"
    ADD CONSTRAINT "PK_Countries" PRIMARY KEY ("Code");


--
-- TOC entry 3640 (class 2606 OID 72467)
-- Name: RefreshToken PK_RefreshToken; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."RefreshToken"
    ADD CONSTRAINT "PK_RefreshToken" PRIMARY KEY ("Id");


--
-- TOC entry 3646 (class 2606 OID 72471)
-- Name: SignerToken PK_SignerToken; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."SignerToken"
    ADD CONSTRAINT "PK_SignerToken" PRIMARY KEY ("Id");


--
-- TOC entry 3680 (class 2606 OID 72819)
-- Name: Towns PK_Towns; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Towns"
    ADD CONSTRAINT "PK_Towns" PRIMARY KEY ("Id");


--
-- TOC entry 3676 (class 2606 OID 72811)
-- Name: __EFMigrationsHistory PK___EFMigrationsHistory; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."__EFMigrationsHistory"
    ADD CONSTRAINT "PK___EFMigrationsHistory" PRIMARY KEY ("MigrationId");


--
-- TOC entry 3584 (class 2606 OID 71192)
-- Name: ParentChildren ParentChildren_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."ParentChildren"
    ADD CONSTRAINT "ParentChildren_pkey" PRIMARY KEY ("Id");


--
-- TOC entry 3564 (class 2606 OID 71101)
-- Name: People People_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."People"
    ADD CONSTRAINT "People_pkey" PRIMARY KEY ("Id");


--
-- TOC entry 3652 (class 2606 OID 72618)
-- Name: PersonLinks PersonLinks_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."PersonLinks"
    ADD CONSTRAINT "PersonLinks_pkey" PRIMARY KEY ("Id");


--
-- TOC entry 3672 (class 2606 OID 72708)
-- Name: PersonMediaLinks PersonMedia_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."PersonMediaLinks"
    ADD CONSTRAINT "PersonMedia_pkey" PRIMARY KEY ("Id");


--
-- TOC entry 3690 (class 2606 OID 72951)
-- Name: PersonMedia PersonMedia_pkey1; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."PersonMedia"
    ADD CONSTRAINT "PersonMedia_pkey1" PRIMARY KEY ("Id");


--
-- TOC entry 3603 (class 2606 OID 71256)
-- Name: PersonTags PersonTags_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."PersonTags"
    ADD CONSTRAINT "PersonTags_pkey" PRIMARY KEY ("Id");


--
-- TOC entry 3644 (class 2606 OID 72469)
-- Name: AspNetUserBearerToken Pk_AspNetUserBearerToken; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."AspNetUserBearerToken"
    ADD CONSTRAINT "Pk_AspNetUserBearerToken" PRIMARY KEY ("Id");


--
-- TOC entry 3553 (class 2606 OID 71071)
-- Name: Places Places_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Places"
    ADD CONSTRAINT "Places_pkey" PRIMARY KEY ("Id");


--
-- TOC entry 3597 (class 2606 OID 71239)
-- Name: Sources Sources_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Sources"
    ADD CONSTRAINT "Sources_pkey" PRIMARY KEY ("Id");


--
-- TOC entry 3600 (class 2606 OID 71248)
-- Name: Tags Tags_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Tags"
    ADD CONSTRAINT "Tags_pkey" PRIMARY KEY ("Id");


--
-- TOC entry 3727 (class 2606 OID 108855)
-- Name: TownImages TownImages_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."TownImages"
    ADD CONSTRAINT "TownImages_pkey" PRIMARY KEY ("Id");


--
-- TOC entry 3665 (class 2606 OID 72679)
-- Name: TreeInvitations TreeInvitations_Token_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."TreeInvitations"
    ADD CONSTRAINT "TreeInvitations_Token_key" UNIQUE ("Token");


--
-- TOC entry 3667 (class 2606 OID 72677)
-- Name: TreeInvitations TreeInvitations_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."TreeInvitations"
    ADD CONSTRAINT "TreeInvitations_pkey" PRIMARY KEY ("Id");


--
-- TOC entry 3713 (class 2606 OID 73056)
-- Name: AdminTownAssignments UQ_AdminTownAssignments_User_Town; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."AdminTownAssignments"
    ADD CONSTRAINT "UQ_AdminTownAssignments_User_Town" UNIQUE ("UserId", "TownId");


--
-- TOC entry 3660 (class 2606 OID 72652)
-- Name: AdminTreeAssignments UQ_AdminTreeAssignments_User_Tree; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."AdminTreeAssignments"
    ADD CONSTRAINT "UQ_AdminTreeAssignments_User_Tree" UNIQUE ("UserId", "TreeId");


--
-- TOC entry 3654 (class 2606 OID 72620)
-- Name: PersonLinks UQ_PersonLinks_Source_Target; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."PersonLinks"
    ADD CONSTRAINT "UQ_PersonLinks_Source_Target" UNIQUE ("SourcePersonId", "TargetPersonId");


--
-- TOC entry 3674 (class 2606 OID 72710)
-- Name: PersonMediaLinks UQ_PersonMedia_Person_Media; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."PersonMediaLinks"
    ADD CONSTRAINT "UQ_PersonMedia_Person_Media" UNIQUE ("PersonId", "MediaId");


--
-- TOC entry 3577 (class 2606 OID 71171)
-- Name: UnionMembers UnionMembers_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."UnionMembers"
    ADD CONSTRAINT "UnionMembers_pkey" PRIMARY KEY ("Id");


--
-- TOC entry 3574 (class 2606 OID 71152)
-- Name: Unions Unions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Unions"
    ADD CONSTRAINT "Unions_pkey" PRIMARY KEY ("Id");


--
-- TOC entry 3544 (class 2606 OID 71042)
-- Name: Users Users_Email_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Users"
    ADD CONSTRAINT "Users_Email_key" UNIQUE ("Email");


--
-- TOC entry 3546 (class 2606 OID 71040)
-- Name: Users Users_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Users"
    ADD CONSTRAINT "Users_pkey" PRIMARY KEY ("Id");


--
-- TOC entry 3638 (class 2606 OID 72465)
-- Name: AspNetTemp unique_aspuser_constraint; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."AspNetTemp"
    ADD CONSTRAINT unique_aspuser_constraint UNIQUE ("AspUser");


--
-- TOC entry 3613 (class 1259 OID 72472)
-- Name: EmailIndex; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "EmailIndex" ON public."AspNetUsers" USING btree ("NormalizedEmail");


--
-- TOC entry 3707 (class 1259 OID 73074)
-- Name: IX_AdminTownAssignments_IsActive; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IX_AdminTownAssignments_IsActive" ON public."AdminTownAssignments" USING btree ("IsActive");


--
-- TOC entry 3708 (class 1259 OID 73073)
-- Name: IX_AdminTownAssignments_TownId; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IX_AdminTownAssignments_TownId" ON public."AdminTownAssignments" USING btree ("TownId");


--
-- TOC entry 3709 (class 1259 OID 73072)
-- Name: IX_AdminTownAssignments_UserId; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IX_AdminTownAssignments_UserId" ON public."AdminTownAssignments" USING btree ("UserId");


--
-- TOC entry 3657 (class 1259 OID 72669)
-- Name: IX_AdminTreeAssignments_TreeId; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IX_AdminTreeAssignments_TreeId" ON public."AdminTreeAssignments" USING btree ("TreeId");


--
-- TOC entry 3658 (class 1259 OID 72668)
-- Name: IX_AdminTreeAssignments_UserId; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IX_AdminTreeAssignments_UserId" ON public."AdminTreeAssignments" USING btree ("UserId");


--
-- TOC entry 3621 (class 1259 OID 72478)
-- Name: IX_AspNetRoleClaims_RoleId; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IX_AspNetRoleClaims_RoleId" ON public."AspNetRoleClaims" USING btree ("RoleId");


--
-- TOC entry 3624 (class 1259 OID 72479)
-- Name: IX_AspNetUserClaims_UserId; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IX_AspNetUserClaims_UserId" ON public."AspNetUserClaims" USING btree ("UserId");


--
-- TOC entry 3627 (class 1259 OID 72480)
-- Name: IX_AspNetUserLogins_UserId; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IX_AspNetUserLogins_UserId" ON public."AspNetUserLogins" USING btree ("UserId");


--
-- TOC entry 3630 (class 1259 OID 72481)
-- Name: IX_AspNetUserRoles_RoleId; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IX_AspNetUserRoles_RoleId" ON public."AspNetUserRoles" USING btree ("RoleId");


--
-- TOC entry 3614 (class 1259 OID 106831)
-- Name: IX_AspNetUsers_SelectedTownId; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IX_AspNetUsers_SelectedTownId" ON public."AspNetUsers" USING btree ("SelectedTownId");


--
-- TOC entry 3606 (class 1259 OID 71282)
-- Name: IX_AuditLogs_ActorId; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IX_AuditLogs_ActorId" ON public."AuditLogs" USING btree ("ActorId");


--
-- TOC entry 3607 (class 1259 OID 71283)
-- Name: IX_AuditLogs_EntityType_EntityId; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IX_AuditLogs_EntityType_EntityId" ON public."AuditLogs" USING btree ("EntityType", "EntityId");


--
-- TOC entry 3608 (class 1259 OID 71284)
-- Name: IX_AuditLogs_Timestamp; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IX_AuditLogs_Timestamp" ON public."AuditLogs" USING btree ("Timestamp");


--
-- TOC entry 3721 (class 1259 OID 108809)
-- Name: IX_CarouselImages_DisplayOrder; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IX_CarouselImages_DisplayOrder" ON public."CarouselImages" USING btree ("DisplayOrder");


--
-- TOC entry 3722 (class 1259 OID 108808)
-- Name: IX_CarouselImages_IsActive_DisplayOrder; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IX_CarouselImages_IsActive_DisplayOrder" ON public."CarouselImages" USING btree ("IsActive", "DisplayOrder") WHERE ("IsActive" = true);


--
-- TOC entry 3714 (class 1259 OID 106660)
-- Name: IX_Countries_IsActive; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IX_Countries_IsActive" ON public."Countries" USING btree ("IsActive");


--
-- TOC entry 3715 (class 1259 OID 106659)
-- Name: IX_Countries_NameEn; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IX_Countries_NameEn" ON public."Countries" USING btree ("NameEn");


--
-- TOC entry 3716 (class 1259 OID 106661)
-- Name: IX_Countries_Region; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IX_Countries_Region" ON public."Countries" USING btree ("Region");


--
-- TOC entry 3702 (class 1259 OID 73039)
-- Name: IX_Families_Name; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IX_Families_Name" ON public."Families" USING btree ("Name");


--
-- TOC entry 3703 (class 1259 OID 73037)
-- Name: IX_Families_OrgId; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IX_Families_OrgId" ON public."Families" USING btree ("OrgId");


--
-- TOC entry 3704 (class 1259 OID 73040)
-- Name: IX_Families_SortOrder; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IX_Families_SortOrder" ON public."Families" USING btree ("SortOrder");


--
-- TOC entry 3705 (class 1259 OID 73038)
-- Name: IX_Families_TownId; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IX_Families_TownId" ON public."Families" USING btree ("TownId");


--
-- TOC entry 3706 (class 1259 OID 73075)
-- Name: IX_Families_TownId_Name_Unique; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "IX_Families_TownId_Name_Unique" ON public."Families" USING btree ("TownId", "Name");


--
-- TOC entry 3683 (class 1259 OID 72938)
-- Name: IX_FamilyRelationshipTypes_Category; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IX_FamilyRelationshipTypes_Category" ON public."FamilyRelationshipTypes" USING btree ("Category");


--
-- TOC entry 3684 (class 1259 OID 72939)
-- Name: IX_FamilyRelationshipTypes_IsActive; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IX_FamilyRelationshipTypes_IsActive" ON public."FamilyRelationshipTypes" USING btree ("IsActive");


--
-- TOC entry 3685 (class 1259 OID 72937)
-- Name: IX_FamilyRelationshipTypes_NameEnglish; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IX_FamilyRelationshipTypes_NameEnglish" ON public."FamilyRelationshipTypes" USING btree ("NameEnglish");


--
-- TOC entry 3587 (class 1259 OID 72729)
-- Name: IX_MediaFiles_Category; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IX_MediaFiles_Category" ON public."MediaFiles" USING btree ("Category");


--
-- TOC entry 3588 (class 1259 OID 71228)
-- Name: IX_MediaFiles_OrgId; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IX_MediaFiles_OrgId" ON public."MediaFiles" USING btree ("OrgId");


--
-- TOC entry 3589 (class 1259 OID 72893)
-- Name: IX_MediaFiles_PersonId; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IX_MediaFiles_PersonId" ON public."MediaFiles" USING btree ("PersonId");


--
-- TOC entry 3590 (class 1259 OID 71229)
-- Name: IX_MediaFiles_StorageKey; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IX_MediaFiles_StorageKey" ON public."MediaFiles" USING btree ("StorageKey");


--
-- TOC entry 3591 (class 1259 OID 72728)
-- Name: IX_MediaFiles_UploadedByUserId; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IX_MediaFiles_UploadedByUserId" ON public."MediaFiles" USING btree ("UploadedByUserId");


--
-- TOC entry 3691 (class 1259 OID 72989)
-- Name: IX_NameMappings_ArabicNormalized; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IX_NameMappings_ArabicNormalized" ON public."NameMappings" USING btree ("ArabicNormalized");


--
-- TOC entry 3692 (class 1259 OID 72995)
-- Name: IX_NameMappings_ConfirmedByUserId; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IX_NameMappings_ConfirmedByUserId" ON public."NameMappings" USING btree ("ConfirmedByUserId");


--
-- TOC entry 3693 (class 1259 OID 72990)
-- Name: IX_NameMappings_EnglishNormalized; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IX_NameMappings_EnglishNormalized" ON public."NameMappings" USING btree ("EnglishNormalized");


--
-- TOC entry 3694 (class 1259 OID 72993)
-- Name: IX_NameMappings_IsVerified; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IX_NameMappings_IsVerified" ON public."NameMappings" USING btree ("IsVerified");


--
-- TOC entry 3695 (class 1259 OID 72992)
-- Name: IX_NameMappings_NeedsReview; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IX_NameMappings_NeedsReview" ON public."NameMappings" USING btree ("NeedsReview");


--
-- TOC entry 3696 (class 1259 OID 72991)
-- Name: IX_NameMappings_NobiinNormalized; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IX_NameMappings_NobiinNormalized" ON public."NameMappings" USING btree ("NobiinNormalized");


--
-- TOC entry 3697 (class 1259 OID 72994)
-- Name: IX_NameMappings_OrgId; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IX_NameMappings_OrgId" ON public."NameMappings" USING btree ("OrgId");


--
-- TOC entry 3547 (class 1259 OID 72544)
-- Name: IX_OrgUsers_OrgId_UserId; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "IX_OrgUsers_OrgId_UserId" ON public."OrgUsers" USING btree ("OrgId", "UserId");


--
-- TOC entry 3536 (class 1259 OID 72604)
-- Name: IX_Orgs_IsPublic; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IX_Orgs_IsPublic" ON public."Orgs" USING btree ("IsPublic");


--
-- TOC entry 3537 (class 1259 OID 71029)
-- Name: IX_Orgs_Name; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IX_Orgs_Name" ON public."Orgs" USING btree ("Name");


--
-- TOC entry 3538 (class 1259 OID 72603)
-- Name: IX_Orgs_OwnerId; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IX_Orgs_OwnerId" ON public."Orgs" USING btree ("OwnerId");


--
-- TOC entry 3539 (class 1259 OID 72822)
-- Name: IX_Orgs_TownId; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IX_Orgs_TownId" ON public."Orgs" USING btree ("TownId");


--
-- TOC entry 3580 (class 1259 OID 71204)
-- Name: IX_ParentChildren_ChildId; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IX_ParentChildren_ChildId" ON public."ParentChildren" USING btree ("ChildId");


--
-- TOC entry 3581 (class 1259 OID 71203)
-- Name: IX_ParentChildren_ParentId; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IX_ParentChildren_ParentId" ON public."ParentChildren" USING btree ("ParentId");


--
-- TOC entry 3582 (class 1259 OID 71205)
-- Name: IX_ParentChildren_ParentId_ChildId_Type; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "IX_ParentChildren_ParentId_ChildId_Type" ON public."ParentChildren" USING btree ("ParentId", "ChildId", "RelationshipType");


--
-- TOC entry 3554 (class 1259 OID 106669)
-- Name: IX_People_AvatarMediaId; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IX_People_AvatarMediaId" ON public."People" USING btree ("AvatarMediaId");


--
-- TOC entry 3555 (class 1259 OID 73041)
-- Name: IX_People_FamilyId; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IX_People_FamilyId" ON public."People" USING btree ("FamilyId");


--
-- TOC entry 3556 (class 1259 OID 106271)
-- Name: IX_People_NameArabic; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IX_People_NameArabic" ON public."People" USING gin ("NameArabic" public.gin_trgm_ops);


--
-- TOC entry 3557 (class 1259 OID 106272)
-- Name: IX_People_NameEnglish; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IX_People_NameEnglish" ON public."People" USING gin ("NameEnglish" public.gin_trgm_ops);


--
-- TOC entry 3558 (class 1259 OID 106273)
-- Name: IX_People_NameNobiin; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IX_People_NameNobiin" ON public."People" USING gin ("NameNobiin" public.gin_trgm_ops);


--
-- TOC entry 3559 (class 1259 OID 106664)
-- Name: IX_People_Nationality; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IX_People_Nationality" ON public."People" USING btree ("Nationality");


--
-- TOC entry 3560 (class 1259 OID 71117)
-- Name: IX_People_OrgId; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IX_People_OrgId" ON public."People" USING btree ("OrgId");


--
-- TOC entry 3561 (class 1259 OID 71118)
-- Name: IX_People_PrimaryName; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IX_People_PrimaryName" ON public."People" USING btree ("PrimaryName");


--
-- TOC entry 3562 (class 1259 OID 71119)
-- Name: IX_People_SearchVector; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IX_People_SearchVector" ON public."People" USING gin ("SearchVector");


--
-- TOC entry 3648 (class 1259 OID 72641)
-- Name: IX_PersonLinks_SourcePersonId; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IX_PersonLinks_SourcePersonId" ON public."PersonLinks" USING btree ("SourcePersonId");


--
-- TOC entry 3649 (class 1259 OID 72643)
-- Name: IX_PersonLinks_Status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IX_PersonLinks_Status" ON public."PersonLinks" USING btree ("Status");


--
-- TOC entry 3650 (class 1259 OID 72642)
-- Name: IX_PersonLinks_TargetPersonId; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IX_PersonLinks_TargetPersonId" ON public."PersonLinks" USING btree ("TargetPersonId");


--
-- TOC entry 3668 (class 1259 OID 72722)
-- Name: IX_PersonMediaLinks_MediaId; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IX_PersonMediaLinks_MediaId" ON public."PersonMediaLinks" USING btree ("MediaId");


--
-- TOC entry 3669 (class 1259 OID 72721)
-- Name: IX_PersonMediaLinks_PersonId; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IX_PersonMediaLinks_PersonId" ON public."PersonMediaLinks" USING btree ("PersonId");


--
-- TOC entry 3670 (class 1259 OID 72894)
-- Name: IX_PersonMediaLinks_PersonId_MediaId; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "IX_PersonMediaLinks_PersonId_MediaId" ON public."PersonMediaLinks" USING btree ("PersonId", "MediaId");


--
-- TOC entry 3686 (class 1259 OID 72963)
-- Name: IX_PersonMedia_MediaId; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IX_PersonMedia_MediaId" ON public."PersonMedia" USING btree ("MediaId");


--
-- TOC entry 3687 (class 1259 OID 72962)
-- Name: IX_PersonMedia_PersonId; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IX_PersonMedia_PersonId" ON public."PersonMedia" USING btree ("PersonId");


--
-- TOC entry 3688 (class 1259 OID 72964)
-- Name: IX_PersonMedia_PersonId_MediaId; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "IX_PersonMedia_PersonId_MediaId" ON public."PersonMedia" USING btree ("PersonId", "MediaId");


--
-- TOC entry 3601 (class 1259 OID 71267)
-- Name: IX_PersonTags_PersonId_TagId; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "IX_PersonTags_PersonId_TagId" ON public."PersonTags" USING btree ("PersonId", "TagId");


--
-- TOC entry 3550 (class 1259 OID 71082)
-- Name: IX_Places_OrgId_Name; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IX_Places_OrgId_Name" ON public."Places" USING btree ("OrgId", "Name");


--
-- TOC entry 3551 (class 1259 OID 71083)
-- Name: IX_Places_ParentId; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IX_Places_ParentId" ON public."Places" USING btree ("ParentId");


--
-- TOC entry 3594 (class 1259 OID 71240)
-- Name: IX_Sources_OrgId; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IX_Sources_OrgId" ON public."Sources" USING btree ("OrgId");


--
-- TOC entry 3595 (class 1259 OID 71241)
-- Name: IX_Sources_Title; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IX_Sources_Title" ON public."Sources" USING btree ("Title");


--
-- TOC entry 3598 (class 1259 OID 71249)
-- Name: IX_Tags_OrgId_Name; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "IX_Tags_OrgId_Name" ON public."Tags" USING btree ("OrgId", "Name");


--
-- TOC entry 3723 (class 1259 OID 108872)
-- Name: IX_TownImages_IsActive; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IX_TownImages_IsActive" ON public."TownImages" USING btree ("IsActive");


--
-- TOC entry 3724 (class 1259 OID 108871)
-- Name: IX_TownImages_TownId; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IX_TownImages_TownId" ON public."TownImages" USING btree ("TownId");


--
-- TOC entry 3725 (class 1259 OID 108873)
-- Name: IX_TownImages_TownId_DisplayOrder; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IX_TownImages_TownId_DisplayOrder" ON public."TownImages" USING btree ("TownId", "DisplayOrder");


--
-- TOC entry 3677 (class 1259 OID 72821)
-- Name: IX_Towns_Country; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IX_Towns_Country" ON public."Towns" USING btree ("Country");


--
-- TOC entry 3678 (class 1259 OID 72820)
-- Name: IX_Towns_Name; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IX_Towns_Name" ON public."Towns" USING btree ("Name");


--
-- TOC entry 3661 (class 1259 OID 72696)
-- Name: IX_TreeInvitations_Email; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IX_TreeInvitations_Email" ON public."TreeInvitations" USING btree ("Email");


--
-- TOC entry 3662 (class 1259 OID 72697)
-- Name: IX_TreeInvitations_Token; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IX_TreeInvitations_Token" ON public."TreeInvitations" USING btree ("Token");


--
-- TOC entry 3663 (class 1259 OID 72695)
-- Name: IX_TreeInvitations_TreeId; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IX_TreeInvitations_TreeId" ON public."TreeInvitations" USING btree ("TreeId");


--
-- TOC entry 3575 (class 1259 OID 71182)
-- Name: IX_UnionMembers_UnionId_PersonId; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "IX_UnionMembers_UnionId_PersonId" ON public."UnionMembers" USING btree ("UnionId", "PersonId");


--
-- TOC entry 3572 (class 1259 OID 71163)
-- Name: IX_Unions_OrgId; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IX_Unions_OrgId" ON public."Unions" USING btree ("OrgId");


--
-- TOC entry 3542 (class 1259 OID 71043)
-- Name: IX_Users_Email; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "IX_Users_Email" ON public."Users" USING btree ("Email");


--
-- TOC entry 3611 (class 1259 OID 72476)
-- Name: RoleNameIndex; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "RoleNameIndex" ON public."AspNetRoles" USING btree ("NormalizedName");


--
-- TOC entry 3617 (class 1259 OID 72473)
-- Name: UserNameIndex; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "UserNameIndex" ON public."AspNetUsers" USING btree ("NormalizedUserName");


--
-- TOC entry 3585 (class 1259 OID 106080)
-- Name: idx_parentchild_child; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_parentchild_child ON public."ParentChildren" USING btree ("ChildId");


--
-- TOC entry 3586 (class 1259 OID 106081)
-- Name: idx_parentchild_parent; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_parentchild_parent ON public."ParentChildren" USING btree ("ParentId");


--
-- TOC entry 3565 (class 1259 OID 106087)
-- Name: idx_people_birthdate; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_people_birthdate ON public."People" USING btree ("BirthDate");


--
-- TOC entry 3566 (class 1259 OID 106085)
-- Name: idx_people_family; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_people_family ON public."People" USING btree ("FamilyId");


--
-- TOC entry 3567 (class 1259 OID 106089)
-- Name: idx_people_family_name; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_people_family_name ON public."People" USING btree ("FamilyId", "PrimaryName");


--
-- TOC entry 3568 (class 1259 OID 106084)
-- Name: idx_people_org; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_people_org ON public."People" USING btree ("OrgId");


--
-- TOC entry 3569 (class 1259 OID 106088)
-- Name: idx_people_org_name; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_people_org_name ON public."People" USING btree ("OrgId", "PrimaryName");


--
-- TOC entry 3570 (class 1259 OID 106076)
-- Name: idx_people_primaryname_fts; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_people_primaryname_fts ON public."People" USING gin (to_tsvector('simple'::regconfig, ("PrimaryName")::text));


--
-- TOC entry 3571 (class 1259 OID 106086)
-- Name: idx_people_sex; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_people_sex ON public."People" USING btree ("Sex");


--
-- TOC entry 3641 (class 1259 OID 72482)
-- Name: idx_refreshtoken_value; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX idx_refreshtoken_value ON public."RefreshToken" USING btree ("Value");


--
-- TOC entry 3612 (class 1259 OID 72477)
-- Name: idx_role_name; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX idx_role_name ON public."AspNetRoles" USING btree ("Name");


--
-- TOC entry 3647 (class 1259 OID 72484)
-- Name: idx_signertoken_value; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_signertoken_value ON public."SignerToken" USING btree ("Value");


--
-- TOC entry 3578 (class 1259 OID 106082)
-- Name: idx_unionmembers_person; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_unionmembers_person ON public."UnionMembers" USING btree ("PersonId");


--
-- TOC entry 3579 (class 1259 OID 106083)
-- Name: idx_unionmembers_union; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_unionmembers_union ON public."UnionMembers" USING btree ("UnionId");


--
-- TOC entry 3618 (class 1259 OID 72474)
-- Name: idx_user_email; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX idx_user_email ON public."AspNetUsers" USING btree ("Email");


--
-- TOC entry 3619 (class 1259 OID 72475)
-- Name: idx_user_username; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX idx_user_username ON public."AspNetUsers" USING btree ("UserName");


--
-- TOC entry 3620 (class 1259 OID 72966)
-- Name: idx_users_preferred_language; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_users_preferred_language ON public."AspNetUsers" USING btree ("PreferredLanguage");


--
-- TOC entry 3642 (class 1259 OID 72483)
-- Name: refreshtoken_userid_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX refreshtoken_userid_idx ON public."RefreshToken" USING btree ("UserId");


--
-- TOC entry 3765 (class 2606 OID 72663)
-- Name: AdminTreeAssignments AdminTreeAssignments_AssignedByUserId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."AdminTreeAssignments"
    ADD CONSTRAINT "AdminTreeAssignments_AssignedByUserId_fkey" FOREIGN KEY ("AssignedByUserId") REFERENCES public."AspNetUsers"("Id") ON DELETE SET NULL;


--
-- TOC entry 3766 (class 2606 OID 72658)
-- Name: AdminTreeAssignments AdminTreeAssignments_TreeId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."AdminTreeAssignments"
    ADD CONSTRAINT "AdminTreeAssignments_TreeId_fkey" FOREIGN KEY ("TreeId") REFERENCES public."Orgs"("Id") ON DELETE CASCADE;


--
-- TOC entry 3767 (class 2606 OID 72653)
-- Name: AdminTreeAssignments AdminTreeAssignments_UserId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."AdminTreeAssignments"
    ADD CONSTRAINT "AdminTreeAssignments_UserId_fkey" FOREIGN KEY ("UserId") REFERENCES public."AspNetUsers"("Id") ON DELETE CASCADE;


--
-- TOC entry 3781 (class 2606 OID 73067)
-- Name: AdminTownAssignments FK_AdminTownAssignments_AssignedBy; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."AdminTownAssignments"
    ADD CONSTRAINT "FK_AdminTownAssignments_AssignedBy" FOREIGN KEY ("AssignedByUserId") REFERENCES public."AspNetUsers"("Id") ON DELETE SET NULL;


--
-- TOC entry 3782 (class 2606 OID 73062)
-- Name: AdminTownAssignments FK_AdminTownAssignments_Town; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."AdminTownAssignments"
    ADD CONSTRAINT "FK_AdminTownAssignments_Town" FOREIGN KEY ("TownId") REFERENCES public."Towns"("Id") ON DELETE CASCADE;


--
-- TOC entry 3783 (class 2606 OID 73057)
-- Name: AdminTownAssignments FK_AdminTownAssignments_User; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."AdminTownAssignments"
    ADD CONSTRAINT "FK_AdminTownAssignments_User" FOREIGN KEY ("UserId") REFERENCES public."AspNetUsers"("Id") ON DELETE CASCADE;


--
-- TOC entry 3759 (class 2606 OID 72515)
-- Name: AspNetUserBearerToken FK_AspNetBearerToken_RefreshToken; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."AspNetUserBearerToken"
    ADD CONSTRAINT "FK_AspNetBearerToken_RefreshToken" FOREIGN KEY ("RefreshTokenId") REFERENCES public."RefreshToken"("Id");


--
-- TOC entry 3753 (class 2606 OID 72485)
-- Name: AspNetRoleClaims FK_AspNetRoleClaims_AspNetRoles_RoleId; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."AspNetRoleClaims"
    ADD CONSTRAINT "FK_AspNetRoleClaims_AspNetRoles_RoleId" FOREIGN KEY ("RoleId") REFERENCES public."AspNetRoles"("Id") ON DELETE CASCADE;


--
-- TOC entry 3754 (class 2606 OID 72490)
-- Name: AspNetUserClaims FK_AspNetUserClaims_AspNetUsers_UserId; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."AspNetUserClaims"
    ADD CONSTRAINT "FK_AspNetUserClaims_AspNetUsers_UserId" FOREIGN KEY ("UserId") REFERENCES public."AspNetUsers"("Id") ON DELETE CASCADE;


--
-- TOC entry 3755 (class 2606 OID 72495)
-- Name: AspNetUserLogins FK_AspNetUserLogins_AspNetUsers_UserId; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."AspNetUserLogins"
    ADD CONSTRAINT "FK_AspNetUserLogins_AspNetUsers_UserId" FOREIGN KEY ("UserId") REFERENCES public."AspNetUsers"("Id") ON DELETE CASCADE;


--
-- TOC entry 3756 (class 2606 OID 72500)
-- Name: AspNetUserRoles FK_AspNetUserRoles_AspNetRoles_RoleId; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."AspNetUserRoles"
    ADD CONSTRAINT "FK_AspNetUserRoles_AspNetRoles_RoleId" FOREIGN KEY ("RoleId") REFERENCES public."AspNetRoles"("Id") ON DELETE CASCADE;


--
-- TOC entry 3757 (class 2606 OID 72505)
-- Name: AspNetUserRoles FK_AspNetUserRoles_AspNetUsers_UserId; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."AspNetUserRoles"
    ADD CONSTRAINT "FK_AspNetUserRoles_AspNetUsers_UserId" FOREIGN KEY ("UserId") REFERENCES public."AspNetUsers"("Id") ON DELETE CASCADE;


--
-- TOC entry 3758 (class 2606 OID 72510)
-- Name: AspNetUserTokens FK_AspNetUserTokens_AspNetUsers_UserId; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."AspNetUserTokens"
    ADD CONSTRAINT "FK_AspNetUserTokens_AspNetUsers_UserId" FOREIGN KEY ("UserId") REFERENCES public."AspNetUsers"("Id") ON DELETE CASCADE;


--
-- TOC entry 3752 (class 2606 OID 106826)
-- Name: AspNetUsers FK_AspNetUsers_SelectedTown; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."AspNetUsers"
    ADD CONSTRAINT "FK_AspNetUsers_SelectedTown" FOREIGN KEY ("SelectedTownId") REFERENCES public."Towns"("Id") ON DELETE SET NULL;


--
-- TOC entry 3751 (class 2606 OID 71277)
-- Name: AuditLogs FK_AuditLogs_Actor; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."AuditLogs"
    ADD CONSTRAINT "FK_AuditLogs_Actor" FOREIGN KEY ("ActorId") REFERENCES public."Users"("Id") ON DELETE RESTRICT;


--
-- TOC entry 3777 (class 2606 OID 73012)
-- Name: Families FK_Families_Orgs_OrgId; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Families"
    ADD CONSTRAINT "FK_Families_Orgs_OrgId" FOREIGN KEY ("OrgId") REFERENCES public."Orgs"("Id") ON DELETE CASCADE;


--
-- TOC entry 3778 (class 2606 OID 73032)
-- Name: Families FK_Families_People_MatriarchId; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Families"
    ADD CONSTRAINT "FK_Families_People_MatriarchId" FOREIGN KEY ("MatriarchId") REFERENCES public."People"("Id") ON DELETE SET NULL;


--
-- TOC entry 3779 (class 2606 OID 73027)
-- Name: Families FK_Families_People_PatriarchId; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Families"
    ADD CONSTRAINT "FK_Families_People_PatriarchId" FOREIGN KEY ("PatriarchId") REFERENCES public."People"("Id") ON DELETE SET NULL;


--
-- TOC entry 3780 (class 2606 OID 73017)
-- Name: Families FK_Families_Towns_TownId; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Families"
    ADD CONSTRAINT "FK_Families_Towns_TownId" FOREIGN KEY ("TownId") REFERENCES public."Towns"("Id") ON DELETE RESTRICT;


--
-- TOC entry 3745 (class 2606 OID 71223)
-- Name: MediaFiles FK_MediaFiles_CapturePlace; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."MediaFiles"
    ADD CONSTRAINT "FK_MediaFiles_CapturePlace" FOREIGN KEY ("CapturePlaceId") REFERENCES public."Places"("Id") ON DELETE SET NULL;


--
-- TOC entry 3746 (class 2606 OID 71218)
-- Name: MediaFiles FK_MediaFiles_Orgs; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."MediaFiles"
    ADD CONSTRAINT "FK_MediaFiles_Orgs" FOREIGN KEY ("OrgId") REFERENCES public."Orgs"("Id") ON DELETE CASCADE;


--
-- TOC entry 3747 (class 2606 OID 72888)
-- Name: MediaFiles FK_MediaFiles_Person; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."MediaFiles"
    ADD CONSTRAINT "FK_MediaFiles_Person" FOREIGN KEY ("PersonId") REFERENCES public."People"("Id") ON DELETE SET NULL;


--
-- TOC entry 3730 (class 2606 OID 72550)
-- Name: OrgUsers FK_OrgUsers_AspNetUsers_UserId; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."OrgUsers"
    ADD CONSTRAINT "FK_OrgUsers_AspNetUsers_UserId" FOREIGN KEY ("UserId") REFERENCES public."AspNetUsers"("Id") ON DELETE CASCADE;


--
-- TOC entry 3731 (class 2606 OID 71052)
-- Name: OrgUsers FK_OrgUsers_Orgs; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."OrgUsers"
    ADD CONSTRAINT "FK_OrgUsers_Orgs" FOREIGN KEY ("OrgId") REFERENCES public."Orgs"("Id") ON DELETE CASCADE;


--
-- TOC entry 3728 (class 2606 OID 73042)
-- Name: Orgs FK_Orgs_Towns_TownId; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Orgs"
    ADD CONSTRAINT "FK_Orgs_Towns_TownId" FOREIGN KEY ("TownId") REFERENCES public."Towns"("Id") ON DELETE RESTRICT;


--
-- TOC entry 3743 (class 2606 OID 71198)
-- Name: ParentChildren FK_ParentChildren_Child; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."ParentChildren"
    ADD CONSTRAINT "FK_ParentChildren_Child" FOREIGN KEY ("ChildId") REFERENCES public."People"("Id") ON DELETE RESTRICT;


--
-- TOC entry 3744 (class 2606 OID 71193)
-- Name: ParentChildren FK_ParentChildren_Parent; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."ParentChildren"
    ADD CONSTRAINT "FK_ParentChildren_Parent" FOREIGN KEY ("ParentId") REFERENCES public."People"("Id") ON DELETE RESTRICT;


--
-- TOC entry 3734 (class 2606 OID 71107)
-- Name: People FK_People_BirthPlace; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."People"
    ADD CONSTRAINT "FK_People_BirthPlace" FOREIGN KEY ("BirthPlaceId") REFERENCES public."Places"("Id") ON DELETE SET NULL;


--
-- TOC entry 3735 (class 2606 OID 71112)
-- Name: People FK_People_DeathPlace; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."People"
    ADD CONSTRAINT "FK_People_DeathPlace" FOREIGN KEY ("DeathPlaceId") REFERENCES public."Places"("Id") ON DELETE SET NULL;


--
-- TOC entry 3736 (class 2606 OID 73022)
-- Name: People FK_People_Families_FamilyId; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."People"
    ADD CONSTRAINT "FK_People_Families_FamilyId" FOREIGN KEY ("FamilyId") REFERENCES public."Families"("Id") ON DELETE SET NULL;


--
-- TOC entry 3737 (class 2606 OID 106670)
-- Name: People FK_People_MediaFiles_AvatarMediaId; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."People"
    ADD CONSTRAINT "FK_People_MediaFiles_AvatarMediaId" FOREIGN KEY ("AvatarMediaId") REFERENCES public."MediaFiles"("Id") ON DELETE SET NULL;


--
-- TOC entry 3738 (class 2606 OID 71102)
-- Name: People FK_People_Orgs; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."People"
    ADD CONSTRAINT "FK_People_Orgs" FOREIGN KEY ("OrgId") REFERENCES public."Orgs"("Id") ON DELETE CASCADE;


--
-- TOC entry 3773 (class 2606 OID 72957)
-- Name: PersonMedia FK_PersonMedia_MediaFiles_MediaId; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."PersonMedia"
    ADD CONSTRAINT "FK_PersonMedia_MediaFiles_MediaId" FOREIGN KEY ("MediaId") REFERENCES public."MediaFiles"("Id") ON DELETE CASCADE;


--
-- TOC entry 3774 (class 2606 OID 72952)
-- Name: PersonMedia FK_PersonMedia_People_PersonId; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."PersonMedia"
    ADD CONSTRAINT "FK_PersonMedia_People_PersonId" FOREIGN KEY ("PersonId") REFERENCES public."People"("Id") ON DELETE CASCADE;


--
-- TOC entry 3749 (class 2606 OID 71257)
-- Name: PersonTags FK_PersonTags_People; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."PersonTags"
    ADD CONSTRAINT "FK_PersonTags_People" FOREIGN KEY ("PersonId") REFERENCES public."People"("Id") ON DELETE CASCADE;


--
-- TOC entry 3750 (class 2606 OID 71262)
-- Name: PersonTags FK_PersonTags_Tags; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."PersonTags"
    ADD CONSTRAINT "FK_PersonTags_Tags" FOREIGN KEY ("TagId") REFERENCES public."Tags"("Id") ON DELETE CASCADE;


--
-- TOC entry 3732 (class 2606 OID 71072)
-- Name: Places FK_Places_Orgs; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Places"
    ADD CONSTRAINT "FK_Places_Orgs" FOREIGN KEY ("OrgId") REFERENCES public."Orgs"("Id") ON DELETE CASCADE;


--
-- TOC entry 3733 (class 2606 OID 71077)
-- Name: Places FK_Places_ParentPlace; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Places"
    ADD CONSTRAINT "FK_Places_ParentPlace" FOREIGN KEY ("ParentId") REFERENCES public."Places"("Id") ON DELETE RESTRICT;


--
-- TOC entry 3784 (class 2606 OID 108861)
-- Name: TownImages FK_TownImages_CreatedBy; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."TownImages"
    ADD CONSTRAINT "FK_TownImages_CreatedBy" FOREIGN KEY ("CreatedBy") REFERENCES public."AspNetUsers"("Id") ON DELETE RESTRICT;


--
-- TOC entry 3785 (class 2606 OID 108856)
-- Name: TownImages FK_TownImages_Towns; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."TownImages"
    ADD CONSTRAINT "FK_TownImages_Towns" FOREIGN KEY ("TownId") REFERENCES public."Towns"("Id") ON DELETE CASCADE;


--
-- TOC entry 3786 (class 2606 OID 108866)
-- Name: TownImages FK_TownImages_UpdatedBy; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."TownImages"
    ADD CONSTRAINT "FK_TownImages_UpdatedBy" FOREIGN KEY ("UpdatedBy") REFERENCES public."AspNetUsers"("Id") ON DELETE RESTRICT;


--
-- TOC entry 3741 (class 2606 OID 71177)
-- Name: UnionMembers FK_UnionMembers_People; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."UnionMembers"
    ADD CONSTRAINT "FK_UnionMembers_People" FOREIGN KEY ("PersonId") REFERENCES public."People"("Id") ON DELETE CASCADE;


--
-- TOC entry 3742 (class 2606 OID 71172)
-- Name: UnionMembers FK_UnionMembers_Unions; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."UnionMembers"
    ADD CONSTRAINT "FK_UnionMembers_Unions" FOREIGN KEY ("UnionId") REFERENCES public."Unions"("Id") ON DELETE CASCADE;


--
-- TOC entry 3739 (class 2606 OID 71158)
-- Name: Unions FK_Unions_EndPlace; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Unions"
    ADD CONSTRAINT "FK_Unions_EndPlace" FOREIGN KEY ("EndPlaceId") REFERENCES public."Places"("Id") ON DELETE SET NULL;


--
-- TOC entry 3740 (class 2606 OID 71153)
-- Name: Unions FK_Unions_StartPlace; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Unions"
    ADD CONSTRAINT "FK_Unions_StartPlace" FOREIGN KEY ("StartPlaceId") REFERENCES public."Places"("Id") ON DELETE SET NULL;


--
-- TOC entry 3760 (class 2606 OID 72520)
-- Name: AspNetUserBearerToken Fk_AspNetUserBearerToken_AspNetUsers; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."AspNetUserBearerToken"
    ADD CONSTRAINT "Fk_AspNetUserBearerToken_AspNetUsers" FOREIGN KEY ("UserId") REFERENCES public."AspNetUsers"("Id");


--
-- TOC entry 3748 (class 2606 OID 72723)
-- Name: MediaFiles MediaFiles_UploadedByUserId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."MediaFiles"
    ADD CONSTRAINT "MediaFiles_UploadedByUserId_fkey" FOREIGN KEY ("UploadedByUserId") REFERENCES public."AspNetUsers"("Id") ON DELETE SET NULL;


--
-- TOC entry 3775 (class 2606 OID 72979)
-- Name: NameMappings NameMappings_ConfirmedByUserId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."NameMappings"
    ADD CONSTRAINT "NameMappings_ConfirmedByUserId_fkey" FOREIGN KEY ("ConfirmedByUserId") REFERENCES public."AspNetUsers"("Id") ON DELETE SET NULL;


--
-- TOC entry 3776 (class 2606 OID 72984)
-- Name: NameMappings NameMappings_OrgId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."NameMappings"
    ADD CONSTRAINT "NameMappings_OrgId_fkey" FOREIGN KEY ("OrgId") REFERENCES public."Orgs"("Id") ON DELETE SET NULL;


--
-- TOC entry 3729 (class 2606 OID 72598)
-- Name: Orgs Orgs_OwnerId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Orgs"
    ADD CONSTRAINT "Orgs_OwnerId_fkey" FOREIGN KEY ("OwnerId") REFERENCES public."AspNetUsers"("Id") ON DELETE SET NULL;


--
-- TOC entry 3761 (class 2606 OID 72636)
-- Name: PersonLinks PersonLinks_ApprovedByUserId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."PersonLinks"
    ADD CONSTRAINT "PersonLinks_ApprovedByUserId_fkey" FOREIGN KEY ("ApprovedByUserId") REFERENCES public."AspNetUsers"("Id") ON DELETE SET NULL;


--
-- TOC entry 3762 (class 2606 OID 72631)
-- Name: PersonLinks PersonLinks_CreatedByUserId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."PersonLinks"
    ADD CONSTRAINT "PersonLinks_CreatedByUserId_fkey" FOREIGN KEY ("CreatedByUserId") REFERENCES public."AspNetUsers"("Id") ON DELETE SET NULL;


--
-- TOC entry 3763 (class 2606 OID 72621)
-- Name: PersonLinks PersonLinks_SourcePersonId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."PersonLinks"
    ADD CONSTRAINT "PersonLinks_SourcePersonId_fkey" FOREIGN KEY ("SourcePersonId") REFERENCES public."People"("Id") ON DELETE CASCADE;


--
-- TOC entry 3764 (class 2606 OID 72626)
-- Name: PersonLinks PersonLinks_TargetPersonId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."PersonLinks"
    ADD CONSTRAINT "PersonLinks_TargetPersonId_fkey" FOREIGN KEY ("TargetPersonId") REFERENCES public."People"("Id") ON DELETE CASCADE;


--
-- TOC entry 3771 (class 2606 OID 72716)
-- Name: PersonMediaLinks PersonMedia_MediaId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."PersonMediaLinks"
    ADD CONSTRAINT "PersonMedia_MediaId_fkey" FOREIGN KEY ("MediaId") REFERENCES public."MediaFiles"("Id") ON DELETE CASCADE;


--
-- TOC entry 3772 (class 2606 OID 72711)
-- Name: PersonMediaLinks PersonMedia_PersonId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."PersonMediaLinks"
    ADD CONSTRAINT "PersonMedia_PersonId_fkey" FOREIGN KEY ("PersonId") REFERENCES public."People"("Id") ON DELETE CASCADE;


--
-- TOC entry 3768 (class 2606 OID 72690)
-- Name: TreeInvitations TreeInvitations_AcceptedByUserId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."TreeInvitations"
    ADD CONSTRAINT "TreeInvitations_AcceptedByUserId_fkey" FOREIGN KEY ("AcceptedByUserId") REFERENCES public."AspNetUsers"("Id") ON DELETE SET NULL;


--
-- TOC entry 3769 (class 2606 OID 72685)
-- Name: TreeInvitations TreeInvitations_InvitedByUserId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."TreeInvitations"
    ADD CONSTRAINT "TreeInvitations_InvitedByUserId_fkey" FOREIGN KEY ("InvitedByUserId") REFERENCES public."AspNetUsers"("Id") ON DELETE CASCADE;


--
-- TOC entry 3770 (class 2606 OID 72680)
-- Name: TreeInvitations TreeInvitations_TreeId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."TreeInvitations"
    ADD CONSTRAINT "TreeInvitations_TreeId_fkey" FOREIGN KEY ("TreeId") REFERENCES public."Orgs"("Id") ON DELETE CASCADE;


-- Completed on 2026-01-20 16:17:54

--
-- PostgreSQL database dump complete
--

\unrestrict K8Fg1efyg19Ys7SUnAjh2euMbGUDo0YfBalMrSkFXQO5aIvWngPeXADWskIzoze

