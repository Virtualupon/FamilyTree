--
-- PostgreSQL database dump
--

-- Dumped from database version 15.3 (Ubuntu 15.3-1.pgdg22.04+1)
-- Dumped by pg_dump version 17.0

-- Started on 2026-01-05 13:30:07

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
-- TOC entry 3945 (class 0 OID 0)
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
-- TOC entry 3946 (class 0 OID 0)
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
-- TOC entry 3947 (class 0 OID 0)
-- Dependencies: 2
-- Name: EXTENSION "uuid-ossp"; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION "uuid-ossp" IS 'generate universally unique identifiers (UUIDs)';


--
-- TOC entry 323 (class 1255 OID 106072)
-- Name: find_relationship_path(uuid, uuid, uuid, integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.find_relationship_path(p_person1_id uuid, p_person2_id uuid, p_tree_id uuid DEFAULT NULL::uuid, p_max_depth integer DEFAULT 15) RETURNS TABLE(path_found boolean, path_length integer, path_nodes jsonb, path_relationships jsonb, relationship_summary text)
    LANGUAGE plpgsql STABLE
    AS $$
DECLARE
    v_path_nodes jsonb;
    v_path_rels jsonb;
    v_summary text;
    v_length int;
BEGIN
    -- Use recursive CTE with BFS to find shortest path
    WITH RECURSIVE family_graph AS (
        -- Base case: start from person1
        SELECT 
            p."Id" AS current_id,
            p."PrimaryName" AS current_name,
            p."Sex" AS current_sex,
            ARRAY[p."Id"] AS visited_ids,
            jsonb_build_array(
                jsonb_build_object(
                    'personId', p."Id",
                    'name', p."PrimaryName",
                    'sex', p."Sex"
                )
            ) AS path_nodes,
            jsonb_build_array() AS path_relationships,
            0 AS depth
        FROM "People" p
        WHERE p."Id" = p_person1_id
          AND (p_tree_id IS NULL OR p."OrgId" = p_tree_id)
        
        UNION ALL
        
        -- Recursive case: traverse relationships
        SELECT 
            next_person."Id",
            next_person."PrimaryName",
            next_person."Sex",
            fg.visited_ids || next_person."Id",
            fg.path_nodes || jsonb_build_object(
                'personId', next_person."Id",
                'name', next_person."PrimaryName",
                'sex', next_person."Sex"
            ),
            fg.path_relationships || jsonb_build_object(
                'fromId', fg.current_id,
                'toId', next_person."Id",
                'type', conn.rel_type,
                'relationshipId', conn.rel_id
            ),
            fg.depth + 1
        FROM family_graph fg
        CROSS JOIN LATERAL (
            -- Parent relationships (current person's parents)
            SELECT 
                pc."ParentId" AS person_id, 
                'parent'::text AS rel_type,
                pc."Id" AS rel_id
            FROM "ParentChildren" pc 
            WHERE pc."ChildId" = fg.current_id
              AND NOT (pc."ParentId" = ANY(fg.visited_ids))
            
            UNION ALL
            
            -- Child relationships (current person's children)
            SELECT 
                pc."ChildId" AS person_id, 
                'child'::text AS rel_type,
                pc."Id" AS rel_id
            FROM "ParentChildren" pc 
            WHERE pc."ParentId" = fg.current_id
              AND NOT (pc."ChildId" = ANY(fg.visited_ids))
            
            UNION ALL
            
            -- Spouse relationships (through unions)
            SELECT 
                um2."PersonId" AS person_id, 
                'spouse'::text AS rel_type,
                um1."UnionId" AS rel_id
            FROM "UnionMembers" um1
            JOIN "UnionMembers" um2 ON um1."UnionId" = um2."UnionId"
            WHERE um1."PersonId" = fg.current_id 
              AND um2."PersonId" != fg.current_id
              AND NOT (um2."PersonId" = ANY(fg.visited_ids))
        ) AS conn
        JOIN "People" next_person ON next_person."Id" = conn.person_id
        WHERE fg.depth < p_max_depth
          AND (p_tree_id IS NULL OR next_person."OrgId" = p_tree_id)
    ),
    -- Find the shortest path to person2
    shortest_path AS (
        SELECT 
            path_nodes,
            path_relationships,
            depth
        FROM family_graph
        WHERE current_id = p_person2_id
        ORDER BY depth
        LIMIT 1
    )
    SELECT 
        sp.path_nodes,
        sp.path_relationships,
        sp.depth
    INTO v_path_nodes, v_path_rels, v_length
    FROM shortest_path sp;
    
    -- Build relationship summary
    IF v_path_nodes IS NOT NULL THEN
        SELECT string_agg(rel->>'type', ' → ')
        INTO v_summary
        FROM jsonb_array_elements(v_path_rels) AS rel;
        
        IF v_summary IS NULL THEN
            v_summary := 'same person';
        END IF;
        
        RETURN QUERY SELECT 
            true,
            v_length,
            v_path_nodes,
            v_path_rels,
            v_summary;
    ELSE
        RETURN QUERY SELECT 
            false,
            NULL::int,
            NULL::jsonb,
            NULL::jsonb,
            'No relationship found'::text;
    END IF;
END;
$$;


ALTER FUNCTION public.find_relationship_path(p_person1_id uuid, p_person2_id uuid, p_tree_id uuid, p_max_depth integer) OWNER TO postgres;

--
-- TOC entry 324 (class 1255 OID 106073)
-- Name: get_family_tree_data(uuid, text, integer, boolean); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.get_family_tree_data(p_root_person_id uuid, p_view_mode text DEFAULT 'pedigree'::text, p_generations integer DEFAULT 3, p_include_spouses boolean DEFAULT true) RETURNS TABLE(person_id uuid, primary_name text, sex integer, birth_date timestamp with time zone, death_date timestamp with time zone, birth_place text, death_place text, is_living boolean, generation_level integer, relationship_type text, parent_id uuid, spouse_union_id uuid, names jsonb)
    LANGUAGE plpgsql STABLE
    AS $$
BEGIN
    RETURN QUERY
    WITH RECURSIVE 
    -- Get ancestors (for pedigree and hourglass)
    ancestors AS (
        -- Base: root person
        SELECT 
            p."Id",
            p."PrimaryName",
            p."Sex",
            p."BirthDate",
            p."DeathDate",
            bp."Name" AS birth_place,
            dp."Name" AS death_place,
            CASE WHEN p."DeathDate" IS NULL THEN true ELSE false END,
            0 AS gen_level,
            'self'::text AS rel_type,
            NULL::uuid AS parent_id,
            NULL::uuid AS spouse_union_id
        FROM "People" p
        LEFT JOIN "Places" bp ON bp."Id" = p."BirthPlaceId"
        LEFT JOIN "Places" dp ON dp."Id" = p."DeathPlaceId"
        WHERE p."Id" = p_root_person_id
        
        UNION ALL
        
        -- Parents
        SELECT 
            parent."Id",
            parent."PrimaryName",
            parent."Sex",
            parent."BirthDate",
            parent."DeathDate",
            bp."Name",
            dp."Name",
            CASE WHEN parent."DeathDate" IS NULL THEN true ELSE false END,
            a.gen_level - 1,
            CASE parent."Sex" WHEN 0 THEN 'father' WHEN 1 THEN 'mother' ELSE 'parent' END,
            a."Id",  -- Link to child
            NULL::uuid
        FROM ancestors a
        JOIN "ParentChildren" pc ON pc."ChildId" = a."Id"
        JOIN "People" parent ON parent."Id" = pc."ParentId"
        LEFT JOIN "Places" bp ON bp."Id" = parent."BirthPlaceId"
        LEFT JOIN "Places" dp ON dp."Id" = parent."DeathPlaceId"
        WHERE a.gen_level > -p_generations
          AND (p_view_mode IN ('pedigree', 'hourglass'))
    ),
    -- Get descendants (for descendants and hourglass)
    descendants AS (
        -- Base: root person (if not already included)
        SELECT 
            p."Id",
            p."PrimaryName",
            p."Sex",
            p."BirthDate",
            p."DeathDate",
            bp."Name" AS birth_place,
            dp."Name" AS death_place,
            CASE WHEN p."DeathDate" IS NULL THEN true ELSE false END,
            0 AS gen_level,
            'self'::text AS rel_type,
            NULL::uuid AS parent_id,
            NULL::uuid AS spouse_union_id
        FROM "People" p
        LEFT JOIN "Places" bp ON bp."Id" = p."BirthPlaceId"
        LEFT JOIN "Places" dp ON dp."Id" = p."DeathPlaceId"
        WHERE p."Id" = p_root_person_id
          AND p_view_mode IN ('descendants', 'hourglass')
        
        UNION ALL
        
        -- Children
        SELECT 
            child."Id",
            child."PrimaryName",
            child."Sex",
            child."BirthDate",
            child."DeathDate",
            bp."Name",
            dp."Name",
            CASE WHEN child."DeathDate" IS NULL THEN true ELSE false END,
            d.gen_level + 1,
            CASE child."Sex" WHEN 0 THEN 'son' WHEN 1 THEN 'daughter' ELSE 'child' END,
            d."Id",  -- Link to parent
            NULL::uuid
        FROM descendants d
        JOIN "ParentChildren" pc ON pc."ParentId" = d."Id"
        JOIN "People" child ON child."Id" = pc."ChildId"
        LEFT JOIN "Places" bp ON bp."Id" = child."BirthPlaceId"
        LEFT JOIN "Places" dp ON dp."Id" = child."DeathPlaceId"
        WHERE d.gen_level < p_generations
          AND p_view_mode IN ('descendants', 'hourglass')
    ),
    -- Combine results
    all_persons AS (
        SELECT * FROM ancestors
        UNION
        SELECT * FROM descendants
    ),
    -- Get spouses if requested
    spouses AS (
        SELECT DISTINCT
            spouse."Id",
            spouse."PrimaryName",
            spouse."Sex",
            spouse."BirthDate",
            spouse."DeathDate",
            bp."Name" AS birth_place,
            dp."Name" AS death_place,
            CASE WHEN spouse."DeathDate" IS NULL THEN true ELSE false END,
            ap.gen_level,
            'spouse'::text AS rel_type,
            ap."Id" AS parent_id,  -- Link to the person they're spouse of
            um1."UnionId" AS spouse_union_id
        FROM all_persons ap
        JOIN "UnionMembers" um1 ON um1."PersonId" = ap."Id"
        JOIN "UnionMembers" um2 ON um2."UnionId" = um1."UnionId" AND um2."PersonId" != ap."Id"
        JOIN "People" spouse ON spouse."Id" = um2."PersonId"
        LEFT JOIN "Places" bp ON bp."Id" = spouse."BirthPlaceId"
        LEFT JOIN "Places" dp ON dp."Id" = spouse."DeathPlaceId"
        WHERE p_include_spouses
          AND spouse."Id" NOT IN (SELECT "Id" FROM all_persons)
    ),
    -- Final combined result
    final_result AS (
        SELECT * FROM all_persons
        UNION ALL
        SELECT * FROM spouses
    ),
    -- Get names for all persons
    names_agg AS (
        SELECT 
            pn."PersonId",
            jsonb_agg(
                jsonb_build_object(
                    'fullName', pn."Full",
                    'script', pn."Script",
                    'nameType', pn."Type"
                ) ORDER BY CASE WHEN pn."Type" = 0 THEN 0 ELSE 1 END
            ) AS names
        FROM "PersonNames" pn
        WHERE pn."PersonId" IN (SELECT "Id" FROM final_result)
        GROUP BY pn."PersonId"
    )
    SELECT 
        fr."Id",
        fr."PrimaryName",
        fr."Sex",
        fr."BirthDate",
        fr."DeathDate",
        fr.birth_place,
        fr.death_place,
        fr.is_living,
        fr.gen_level,
        fr.rel_type,
        fr.parent_id,
        fr.spouse_union_id,
        COALESCE(na.names, '[]'::jsonb)
    FROM final_result fr
    LEFT JOIN names_agg na ON na."PersonId" = fr."Id"
    ORDER BY fr.gen_level, fr."PrimaryName";
END;
$$;


ALTER FUNCTION public.get_family_tree_data(p_root_person_id uuid, p_view_mode text, p_generations integer, p_include_spouses boolean) OWNER TO postgres;

--
-- TOC entry 325 (class 1255 OID 106075)
-- Name: get_person_details(uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.get_person_details(p_person_id uuid) RETURNS TABLE(person_id uuid, primary_name text, sex integer, birth_date timestamp with time zone, birth_precision integer, death_date timestamp with time zone, death_precision integer, birth_place_id uuid, birth_place_name text, death_place_id uuid, death_place_name text, is_living boolean, notes text, family_id uuid, family_name text, org_id uuid, created_at timestamp with time zone, updated_at timestamp with time zone, names jsonb, parents jsonb, children jsonb, spouses jsonb, siblings jsonb)
    LANGUAGE plpgsql STABLE
    AS $$
BEGIN
    RETURN QUERY
    WITH 
    -- Get all names
    names_data AS (
        SELECT jsonb_agg(
            jsonb_build_object(
                'id', pn."Id",
                'fullName', pn."Full",
                'givenName', pn."Given",
                'surname', pn."Family",
                'script', pn."Script",
                'nameType', pn."Type"
            ) ORDER BY CASE WHEN pn."Type" = 0 THEN 0 ELSE 1 END
        ) AS names
        FROM "PersonNames" pn
        WHERE pn."PersonId" = p_person_id
    ),
    -- Get parents
    parents_data AS (
        SELECT jsonb_agg(
            jsonb_build_object(
                'relationshipId', pc."Id",
                'personId', parent."Id",
                'name', parent."PrimaryName",
                'sex', parent."Sex",
                'relationshipType', pc."RelationshipType",
                'birthYear', EXTRACT(YEAR FROM parent."BirthDate"),
                'deathYear', EXTRACT(YEAR FROM parent."DeathDate"),
                'isLiving', CASE WHEN parent."DeathDate" IS NULL THEN true ELSE false END
            )
        ) AS parents
        FROM "ParentChildren" pc
        JOIN "People" parent ON parent."Id" = pc."ParentId"
        WHERE pc."ChildId" = p_person_id
    ),
    -- Get children
    children_data AS (
        SELECT jsonb_agg(
            jsonb_build_object(
                'relationshipId', pc."Id",
                'personId', child."Id",
                'name', child."PrimaryName",
                'sex', child."Sex",
                'relationshipType', pc."RelationshipType",
                'birthYear', EXTRACT(YEAR FROM child."BirthDate"),
                'deathYear', EXTRACT(YEAR FROM child."DeathDate"),
                'isLiving', CASE WHEN child."DeathDate" IS NULL THEN true ELSE false END
            ) ORDER BY child."BirthDate" NULLS LAST
        ) AS children
        FROM "ParentChildren" pc
        JOIN "People" child ON child."Id" = pc."ChildId"
        WHERE pc."ParentId" = p_person_id
    ),
    -- Get spouses
    spouses_data AS (
        SELECT jsonb_agg(
            jsonb_build_object(
                'unionId', u."Id",
                'personId', spouse."Id",
                'name', spouse."PrimaryName",
                'sex', spouse."Sex",
                'unionType', u."Type",
                'startDate', u."StartDate",
                'endDate', u."EndDate",
                'birthYear', EXTRACT(YEAR FROM spouse."BirthDate"),
                'deathYear', EXTRACT(YEAR FROM spouse."DeathDate"),
                'isLiving', CASE WHEN spouse."DeathDate" IS NULL THEN true ELSE false END
            ) ORDER BY u."StartDate" NULLS LAST
        ) AS spouses
        FROM "UnionMembers" um1
        JOIN "UnionMembers" um2 ON um2."UnionId" = um1."UnionId" AND um2."PersonId" != um1."PersonId"
        JOIN "Unions" u ON u."Id" = um1."UnionId"
        JOIN "People" spouse ON spouse."Id" = um2."PersonId"
        WHERE um1."PersonId" = p_person_id
    ),
    -- Get siblings (share at least one parent)
    siblings_data AS (
        SELECT jsonb_agg(DISTINCT
            jsonb_build_object(
                'personId', sibling."Id",
                'name', sibling."PrimaryName",
                'sex', sibling."Sex",
                'birthYear', EXTRACT(YEAR FROM sibling."BirthDate"),
                'deathYear', EXTRACT(YEAR FROM sibling."DeathDate"),
                'isLiving', CASE WHEN sibling."DeathDate" IS NULL THEN true ELSE false END,
                'isFullSibling', (
                    SELECT count(DISTINCT pc1."ParentId") = count(DISTINCT pc2."ParentId")
                    FROM "ParentChildren" pc1
                    JOIN "ParentChildren" pc2 ON pc2."ParentId" = pc1."ParentId"
                    WHERE pc1."ChildId" = p_person_id AND pc2."ChildId" = sibling."Id"
                )
            ) ORDER BY sibling."BirthDate" NULLS LAST
        ) AS siblings
        FROM "ParentChildren" pc1
        JOIN "ParentChildren" pc2 ON pc2."ParentId" = pc1."ParentId" AND pc2."ChildId" != pc1."ChildId"
        JOIN "People" sibling ON sibling."Id" = pc2."ChildId"
        WHERE pc1."ChildId" = p_person_id
    )
    SELECT 
        p."Id",
        p."PrimaryName",
        p."Sex",
        p."BirthDate",
        p."BirthPrecision",
        p."DeathDate",
        p."DeathPrecision",
        p."BirthPlaceId",
        bp."Name",
        p."DeathPlaceId",
        dp."Name",
        CASE WHEN p."DeathDate" IS NULL THEN true ELSE false END,
        p."Notes",
        p."FamilyId",
        f."Name",
        p."OrgId",
        p."CreatedAt",
        p."UpdatedAt",
        COALESCE(nd.names, '[]'::jsonb),
        COALESCE(pd.parents, '[]'::jsonb),
        COALESCE(cd.children, '[]'::jsonb),
        COALESCE(sd.spouses, '[]'::jsonb),
        COALESCE(sbd.siblings, '[]'::jsonb)
    FROM "People" p
    LEFT JOIN "Places" bp ON bp."Id" = p."BirthPlaceId"
    LEFT JOIN "Places" dp ON dp."Id" = p."DeathPlaceId"
    LEFT JOIN "Families" f ON f."Id" = p."FamilyId"
    CROSS JOIN names_data nd
    CROSS JOIN parents_data pd
    CROSS JOIN children_data cd
    CROSS JOIN spouses_data sd
    CROSS JOIN siblings_data sbd
    WHERE p."Id" = p_person_id;
END;
$$;


ALTER FUNCTION public.get_person_details(p_person_id uuid) OWNER TO postgres;

--
-- TOC entry 320 (class 1255 OID 106067)
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
-- TOC entry 321 (class 1255 OID 106068)
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
-- TOC entry 322 (class 1255 OID 106069)
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
-- TOC entry 326 (class 1255 OID 106100)
-- Name: search_persons_unified(text, text, uuid, uuid, uuid, text, boolean, integer, integer, integer, integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.search_persons_unified(p_query text DEFAULT NULL::text, p_search_in text DEFAULT 'auto'::text, p_tree_id uuid DEFAULT NULL::uuid, p_town_id uuid DEFAULT NULL::uuid, p_family_id uuid DEFAULT NULL::uuid, p_sex text DEFAULT NULL::text, p_is_living boolean DEFAULT NULL::boolean, p_birth_year_from integer DEFAULT NULL::integer, p_birth_year_to integer DEFAULT NULL::integer, p_page integer DEFAULT 1, p_page_size integer DEFAULT 20) RETURNS TABLE(total_count integer, page integer, page_size integer, person_id uuid, primary_name text, sex integer, birth_date timestamp with time zone, birth_precision integer, death_date timestamp with time zone, death_precision integer, birth_place_name text, death_place_name text, is_living boolean, family_id uuid, family_name text, org_id uuid, names jsonb, parents_count integer, children_count integer, spouses_count integer, media_count integer)
    LANGUAGE plpgsql STABLE
    AS $$
DECLARE
    v_offset int;
    v_tsquery tsquery;
    v_norm text;
    v_has_query boolean;
    v_total_count int;
BEGIN
    -- Calculate offset
    v_offset := (GREATEST(p_page, 1) - 1) * p_page_size;
    
    -- Check if we have a search query
    v_has_query := p_query IS NOT NULL AND TRIM(p_query) != '';
    
    IF v_has_query THEN
        v_tsquery := plainto_tsquery('simple', p_query);
        v_norm := '%' || normalize_text_universal(p_query) || '%';
    END IF;

    -- Get total count
    SELECT count(*)::int INTO v_total_count
    FROM "People" p
    LEFT JOIN "Families" f ON f."Id" = p."FamilyId"
    WHERE 
        -- Tree filter (OrgId)
        (p_tree_id IS NULL OR p."OrgId" = p_tree_id)
        -- Town filter (through Family -> Town or direct if exists)
        AND (p_town_id IS NULL OR f."TownId" = p_town_id)
        -- Family filter
        AND (p_family_id IS NULL OR p."FamilyId" = p_family_id)
        -- Sex filter
        AND (p_sex IS NULL OR p."Sex"::text = p_sex)
        -- Living status filter
        AND (p_is_living IS NULL OR (p_is_living = true AND p."DeathDate" IS NULL) OR (p_is_living = false AND p."DeathDate" IS NOT NULL))
        -- Birth year range filter
        AND (p_birth_year_from IS NULL OR EXTRACT(YEAR FROM p."BirthDate") >= p_birth_year_from)
        AND (p_birth_year_to IS NULL OR EXTRACT(YEAR FROM p."BirthDate") <= p_birth_year_to)
        -- Search query filter
        AND (
            NOT v_has_query
            OR CASE p_search_in
                -- AUTO: Search across primary name and all person names
                WHEN 'auto' THEN (
                    -- Primary name full-text search
                    to_tsvector('simple', COALESCE(p."PrimaryName", '')) @@ v_tsquery
                    -- Primary name ILIKE fallback
                    OR normalize_text_universal(p."PrimaryName") ILIKE v_norm
                    -- Search in PersonNames table (all scripts)
                    OR EXISTS (
                        SELECT 1 FROM "PersonNames" pn
                        WHERE pn."PersonId" = p."Id"
                          AND (
                              to_tsvector('simple', pn."Full") @@ v_tsquery
                              OR normalize_text_universal(pn."Full") ILIKE v_norm
                          )
                    )
                )
                -- ALL: Same as auto
                WHEN 'all' THEN (
                    to_tsvector('simple', COALESCE(p."PrimaryName", '')) @@ v_tsquery
                    OR normalize_text_universal(p."PrimaryName") ILIKE v_norm
                    OR EXISTS (
                        SELECT 1 FROM "PersonNames" pn
                        WHERE pn."PersonId" = p."Id"
                          AND (
                              to_tsvector('simple', pn."Full") @@ v_tsquery
                              OR normalize_text_universal(pn."Full") ILIKE v_norm
                          )
                    )
                )
                -- NAME: Search only primary name
                WHEN 'name' THEN (
                    to_tsvector('simple', COALESCE(p."PrimaryName", '')) @@ v_tsquery
                    OR normalize_text_universal(p."PrimaryName") ILIKE v_norm
                )
                -- ARABIC: Search only Arabic script names
                WHEN 'arabic' THEN EXISTS (
                    SELECT 1 FROM "PersonNames" pn
                    WHERE pn."PersonId" = p."Id" AND pn."Script" = 'Arabic'
                      AND (to_tsvector('simple', pn."Full") @@ v_tsquery OR normalize_arabic(pn."Full") ILIKE v_norm)
                )
                -- LATIN: Search only Latin script names
                WHEN 'latin' THEN EXISTS (
                    SELECT 1 FROM "PersonNames" pn
                    WHERE pn."PersonId" = p."Id" AND pn."Script" = 'Latin'
                      AND (to_tsvector('simple', pn."Full") @@ v_tsquery OR normalize_latin(pn."Full") ILIKE v_norm)
                )
                -- COPTIC: Search only Coptic/Nobiin script names
                WHEN 'coptic' THEN EXISTS (
                    SELECT 1 FROM "PersonNames" pn
                    WHERE pn."PersonId" = p."Id" AND pn."Script" = 'Coptic'
                      AND (to_tsvector('simple', pn."Full") @@ v_tsquery OR normalize_text_universal(pn."Full") ILIKE v_norm)
                )
                WHEN 'nobiin' THEN EXISTS (
                    SELECT 1 FROM "PersonNames" pn
                    WHERE pn."PersonId" = p."Id" AND pn."Script" = 'Coptic'
                      AND (to_tsvector('simple', pn."Full") @@ v_tsquery OR normalize_text_universal(pn."Full") ILIKE v_norm)
                )
                ELSE true
            END
        );

    -- Return paginated results with aggregated data
    RETURN QUERY
    WITH matched_persons AS (
        SELECT p."Id"
        FROM "People" p
        LEFT JOIN "Families" f ON f."Id" = p."FamilyId"
        WHERE 
            (p_tree_id IS NULL OR p."OrgId" = p_tree_id)
            AND (p_town_id IS NULL OR f."TownId" = p_town_id)
            AND (p_family_id IS NULL OR p."FamilyId" = p_family_id)
            AND (p_sex IS NULL OR p."Sex"::text = p_sex)
            AND (p_is_living IS NULL OR (p_is_living = true AND p."DeathDate" IS NULL) OR (p_is_living = false AND p."DeathDate" IS NOT NULL))
            AND (p_birth_year_from IS NULL OR EXTRACT(YEAR FROM p."BirthDate") >= p_birth_year_from)
            AND (p_birth_year_to IS NULL OR EXTRACT(YEAR FROM p."BirthDate") <= p_birth_year_to)
            AND (
                NOT v_has_query
                OR CASE p_search_in
                    WHEN 'auto' THEN (
                        to_tsvector('simple', COALESCE(p."PrimaryName", '')) @@ v_tsquery
                        OR normalize_text_universal(p."PrimaryName") ILIKE v_norm
                        OR EXISTS (
                            SELECT 1 FROM "PersonNames" pn
                            WHERE pn."PersonId" = p."Id"
                              AND (
                                  to_tsvector('simple', pn."Full") @@ v_tsquery
                                  OR normalize_text_universal(pn."Full") ILIKE v_norm
                              )
                        )
                    )
                    WHEN 'all' THEN (
                        to_tsvector('simple', COALESCE(p."PrimaryName", '')) @@ v_tsquery
                        OR normalize_text_universal(p."PrimaryName") ILIKE v_norm
                        OR EXISTS (
                            SELECT 1 FROM "PersonNames" pn
                            WHERE pn."PersonId" = p."Id"
                              AND (
                                  to_tsvector('simple', pn."Full") @@ v_tsquery
                                  OR normalize_text_universal(pn."Full") ILIKE v_norm
                              )
                        )
                    )
                    WHEN 'name' THEN (
                        to_tsvector('simple', COALESCE(p."PrimaryName", '')) @@ v_tsquery
                        OR normalize_text_universal(p."PrimaryName") ILIKE v_norm
                    )
                    WHEN 'arabic' THEN EXISTS (
                        SELECT 1 FROM "PersonNames" pn
                        WHERE pn."PersonId" = p."Id" AND pn."Script" = 'Arabic'
                          AND (to_tsvector('simple', pn."Full") @@ v_tsquery OR normalize_arabic(pn."Full") ILIKE v_norm)
                    )
                    WHEN 'latin' THEN EXISTS (
                        SELECT 1 FROM "PersonNames" pn
                        WHERE pn."PersonId" = p."Id" AND pn."Script" = 'Latin'
                          AND (to_tsvector('simple', pn."Full") @@ v_tsquery OR normalize_latin(pn."Full") ILIKE v_norm)
                    )
                    WHEN 'coptic' THEN EXISTS (
                        SELECT 1 FROM "PersonNames" pn
                        WHERE pn."PersonId" = p."Id" AND pn."Script" = 'Coptic'
                          AND (to_tsvector('simple', pn."Full") @@ v_tsquery OR normalize_text_universal(pn."Full") ILIKE v_norm)
                    )
                    WHEN 'nobiin' THEN EXISTS (
                        SELECT 1 FROM "PersonNames" pn
                        WHERE pn."PersonId" = p."Id" AND pn."Script" = 'Coptic'
                          AND (to_tsvector('simple', pn."Full") @@ v_tsquery OR normalize_text_universal(pn."Full") ILIKE v_norm)
                    )
                    ELSE true
                END
            )
        ORDER BY p."PrimaryName" ASC NULLS LAST
        OFFSET v_offset
        LIMIT p_page_size
    ),
    -- Aggregate all names for each person
    names_agg AS (
        SELECT 
            pn."PersonId",
            jsonb_agg(
                jsonb_build_object(
                    'id', pn."Id",
                    'fullName', pn."Full",
                    'givenName', pn."Given",
                    'middleName', pn."Middle",
                    'surname', pn."Family",
                    'script', pn."Script",
                    'nameType', pn."Type"::integer,
                    'transliteration', pn."Transliteration"
                ) ORDER BY 
                    CASE WHEN pn."Type"::integer = 0 THEN 0 ELSE 1 END,  -- Type 0 = Primary
                    pn."CreatedAt" DESC
            ) AS names
        FROM "PersonNames" pn
        WHERE pn."PersonId" IN (SELECT "Id" FROM matched_persons)
        GROUP BY pn."PersonId"
    ),
    -- Count parents
    parents_count_agg AS (
        SELECT pc."ChildId" AS person_id, count(*)::int AS cnt
        FROM "ParentChildren" pc
        WHERE pc."ChildId" IN (SELECT "Id" FROM matched_persons)
        GROUP BY pc."ChildId"
    ),
    -- Count children
    children_count_agg AS (
        SELECT pc."ParentId" AS person_id, count(*)::int AS cnt
        FROM "ParentChildren" pc
        WHERE pc."ParentId" IN (SELECT "Id" FROM matched_persons)
        GROUP BY pc."ParentId"
    ),
    -- Count spouses (through Unions)
    spouses_count_agg AS (
        SELECT 
            um1."PersonId" AS person_id,
            count(DISTINCT um2."PersonId")::int AS cnt
        FROM "UnionMembers" um1
        JOIN "UnionMembers" um2 ON um1."UnionId" = um2."UnionId" AND um2."PersonId" != um1."PersonId"
        WHERE um1."PersonId" IN (SELECT "Id" FROM matched_persons)
        GROUP BY um1."PersonId"
    ),
    -- Count media
    media_count_agg AS (
        SELECT pm."PersonId", count(*)::int AS cnt
        FROM "PersonMedia" pm
        WHERE pm."PersonId" IN (SELECT "Id" FROM matched_persons)
        GROUP BY pm."PersonId"
    )
    SELECT
        v_total_count::integer,                                    -- total_count
        GREATEST(p_page, 1)::integer,                              -- page
        p_page_size::integer,                                      -- page_size
        p."Id"::uuid,                                              -- person_id
        p."PrimaryName"::text,                                     -- primary_name
        p."Sex"::integer,                                          -- sex (CAST enum to integer)
        p."BirthDate"::timestamptz,                                -- birth_date
        p."BirthPrecision"::integer,                               -- birth_precision (CAST enum to integer)
        p."DeathDate"::timestamptz,                                -- death_date
        p."DeathPrecision"::integer,                               -- death_precision (CAST enum to integer)
        bp."Name"::text,                                           -- birth_place_name
        dp."Name"::text,                                           -- death_place_name
        (CASE WHEN p."DeathDate" IS NULL THEN true ELSE false END)::boolean, -- is_living
        p."FamilyId"::uuid,                                        -- family_id
        f."Name"::text,                                            -- family_name
        p."OrgId"::uuid,                                           -- org_id
        COALESCE(na.names, '[]'::jsonb)::jsonb,                   -- names
        COALESCE(pca.cnt, 0)::integer,                            -- parents_count
        COALESCE(cca.cnt, 0)::integer,                            -- children_count
        COALESCE(sca.cnt, 0)::integer,                            -- spouses_count
        COALESCE(mca.cnt, 0)::integer                             -- media_count
    FROM matched_persons mp
    JOIN "People" p ON p."Id" = mp."Id"
    LEFT JOIN "Families" f ON f."Id" = p."FamilyId"
    LEFT JOIN "Places" bp ON bp."Id" = p."BirthPlaceId"
    LEFT JOIN "Places" dp ON dp."Id" = p."DeathPlaceId"
    LEFT JOIN names_agg na ON na."PersonId" = p."Id"
    LEFT JOIN parents_count_agg pca ON pca.person_id = p."Id"
    LEFT JOIN children_count_agg cca ON cca.person_id = p."Id"
    LEFT JOIN spouses_count_agg sca ON sca.person_id = p."Id"
    LEFT JOIN media_count_agg mca ON mca."PersonId" = p."Id"
    ORDER BY p."PrimaryName" ASC NULLS LAST;
END;
$$;


ALTER FUNCTION public.search_persons_unified(p_query text, p_search_in text, p_tree_id uuid, p_town_id uuid, p_family_id uuid, p_sex text, p_is_living boolean, p_birth_year_from integer, p_birth_year_to integer, p_page integer, p_page_size integer) OWNER TO postgres;

--
-- TOC entry 319 (class 1255 OID 72730)
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
-- TOC entry 262 (class 1259 OID 73047)
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
-- TOC entry 3948 (class 0 OID 0)
-- Dependencies: 262
-- Name: TABLE "AdminTownAssignments"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public."AdminTownAssignments" IS 'Assigns Admin-level users to manage specific towns and all trees within them';


--
-- TOC entry 3949 (class 0 OID 0)
-- Dependencies: 262
-- Name: COLUMN "AdminTownAssignments"."UserId"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public."AdminTownAssignments"."UserId" IS 'The admin user being assigned to the town';


--
-- TOC entry 3950 (class 0 OID 0)
-- Dependencies: 262
-- Name: COLUMN "AdminTownAssignments"."TownId"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public."AdminTownAssignments"."TownId" IS 'The town the admin can manage';


--
-- TOC entry 3951 (class 0 OID 0)
-- Dependencies: 262
-- Name: COLUMN "AdminTownAssignments"."AssignedByUserId"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public."AdminTownAssignments"."AssignedByUserId" IS 'SuperAdmin who made this assignment';


--
-- TOC entry 3952 (class 0 OID 0)
-- Dependencies: 262
-- Name: COLUMN "AdminTownAssignments"."IsActive"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public."AdminTownAssignments"."IsActive" IS 'Soft delete flag - inactive assignments are ignored';


--
-- TOC entry 251 (class 1259 OID 72644)
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
-- TOC entry 235 (class 1259 OID 72389)
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
-- TOC entry 236 (class 1259 OID 72394)
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
-- TOC entry 231 (class 1259 OID 72376)
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
-- TOC entry 232 (class 1259 OID 72381)
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
-- TOC entry 242 (class 1259 OID 72414)
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
-- TOC entry 243 (class 1259 OID 72420)
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
-- TOC entry 246 (class 1259 OID 72429)
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
-- TOC entry 247 (class 1259 OID 72436)
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
-- TOC entry 237 (class 1259 OID 72395)
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
-- TOC entry 238 (class 1259 OID 72400)
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
-- TOC entry 239 (class 1259 OID 72401)
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
-- TOC entry 240 (class 1259 OID 72406)
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
-- TOC entry 241 (class 1259 OID 72409)
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
-- TOC entry 233 (class 1259 OID 72382)
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
    "PreferredLanguage" character varying(10) DEFAULT 'en'::character varying NOT NULL
);


ALTER TABLE public."AspNetUsers" OWNER TO postgres;

--
-- TOC entry 3953 (class 0 OID 0)
-- Dependencies: 233
-- Name: COLUMN "AspNetUsers"."PreferredLanguage"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public."AspNetUsers"."PreferredLanguage" IS 'User preferred language code: en, ar, nob';


--
-- TOC entry 234 (class 1259 OID 72388)
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
-- TOC entry 230 (class 1259 OID 71268)
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
-- TOC entry 261 (class 1259 OID 73001)
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
-- TOC entry 3954 (class 0 OID 0)
-- Dependencies: 261
-- Name: TABLE "Families"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public."Families" IS 'Groups of people within a family tree. Part of Town->Org->Family->Person hierarchy.';


--
-- TOC entry 3955 (class 0 OID 0)
-- Dependencies: 261
-- Name: COLUMN "Families"."Name"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public."Families"."Name" IS 'Primary family name/label for grouping';


--
-- TOC entry 3956 (class 0 OID 0)
-- Dependencies: 261
-- Name: COLUMN "Families"."OrgId"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public."Families"."OrgId" IS 'The family tree this family group belongs to';


--
-- TOC entry 3957 (class 0 OID 0)
-- Dependencies: 261
-- Name: COLUMN "Families"."TownId"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public."Families"."TownId" IS 'Denormalized town reference for easier filtering';


--
-- TOC entry 3958 (class 0 OID 0)
-- Dependencies: 261
-- Name: COLUMN "Families"."PatriarchId"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public."Families"."PatriarchId" IS 'Optional reference to founding male ancestor';


--
-- TOC entry 3959 (class 0 OID 0)
-- Dependencies: 261
-- Name: COLUMN "Families"."MatriarchId"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public."Families"."MatriarchId" IS 'Optional reference to founding female ancestor';


--
-- TOC entry 257 (class 1259 OID 72928)
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
-- TOC entry 256 (class 1259 OID 72927)
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
-- TOC entry 3960 (class 0 OID 0)
-- Dependencies: 256
-- Name: FamilyRelationshipTypes_Id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public."FamilyRelationshipTypes_Id_seq" OWNED BY public."FamilyRelationshipTypes"."Id";


--
-- TOC entry 226 (class 1259 OID 71206)
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
-- TOC entry 260 (class 1259 OID 72968)
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
-- TOC entry 3961 (class 0 OID 0)
-- Dependencies: 260
-- Name: TABLE "NameMappings"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public."NameMappings" IS 'Stores verified name transliterations between Arabic, English, and Nobiin scripts for consistency across family trees';


--
-- TOC entry 3962 (class 0 OID 0)
-- Dependencies: 260
-- Name: COLUMN "NameMappings"."NeedsReview"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public."NameMappings"."NeedsReview" IS 'Whether this mapping needs human review (low confidence or conflict)';


--
-- TOC entry 3963 (class 0 OID 0)
-- Dependencies: 260
-- Name: COLUMN "NameMappings"."Source"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public."NameMappings"."Source" IS 'Source of the mapping: user (manually entered), ged (from GED import), ai (AI-generated)';


--
-- TOC entry 3964 (class 0 OID 0)
-- Dependencies: 260
-- Name: COLUMN "NameMappings"."Confidence"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public."NameMappings"."Confidence" IS 'AI confidence score (0.0-1.0) if source is ai';


--
-- TOC entry 259 (class 1259 OID 72967)
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
-- TOC entry 3965 (class 0 OID 0)
-- Dependencies: 259
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
-- TOC entry 3966 (class 0 OID 0)
-- Dependencies: 217
-- Name: COLUMN "Orgs"."TownId"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public."Orgs"."TownId" IS 'REQUIRED: Every family tree must belong to a town. Part of the Town->Family->Person hierarchy.';


--
-- TOC entry 225 (class 1259 OID 71183)
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
-- TOC entry 3967 (class 0 OID 0)
-- Dependencies: 225
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
    "FamilyId" uuid
);


ALTER TABLE public."People" OWNER TO postgres;

--
-- TOC entry 3968 (class 0 OID 0)
-- Dependencies: 221
-- Name: TABLE "People"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public."People" IS 'Core genealogy entity with multi-tenant support';


--
-- TOC entry 3969 (class 0 OID 0)
-- Dependencies: 221
-- Name: COLUMN "People"."SearchVector"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public."People"."SearchVector" IS 'Auto-generated tsvector for full-text search';


--
-- TOC entry 3970 (class 0 OID 0)
-- Dependencies: 221
-- Name: COLUMN "People"."FamilyId"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public."People"."FamilyId" IS 'Optional family group this person belongs to';


--
-- TOC entry 250 (class 1259 OID 72605)
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
-- TOC entry 258 (class 1259 OID 72940)
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
-- TOC entry 253 (class 1259 OID 72698)
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
-- TOC entry 3971 (class 0 OID 0)
-- Dependencies: 253
-- Name: TABLE "PersonMediaLinks"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public."PersonMediaLinks" IS 'Junction table linking People to Media (many-to-many)';


--
-- TOC entry 3972 (class 0 OID 0)
-- Dependencies: 253
-- Name: COLUMN "PersonMediaLinks"."Id"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public."PersonMediaLinks"."Id" IS 'Primary key (UUID)';


--
-- TOC entry 3973 (class 0 OID 0)
-- Dependencies: 253
-- Name: COLUMN "PersonMediaLinks"."PersonId"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public."PersonMediaLinks"."PersonId" IS 'Foreign key to People table';


--
-- TOC entry 3974 (class 0 OID 0)
-- Dependencies: 253
-- Name: COLUMN "PersonMediaLinks"."MediaId"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public."PersonMediaLinks"."MediaId" IS 'Foreign key to MediaFiles table';


--
-- TOC entry 3975 (class 0 OID 0)
-- Dependencies: 253
-- Name: COLUMN "PersonMediaLinks"."IsPrimary"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public."PersonMediaLinks"."IsPrimary" IS 'True if this is the primary/profile photo for this person';


--
-- TOC entry 3976 (class 0 OID 0)
-- Dependencies: 253
-- Name: COLUMN "PersonMediaLinks"."SortOrder"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public."PersonMediaLinks"."SortOrder" IS 'Display order when showing person media';


--
-- TOC entry 3977 (class 0 OID 0)
-- Dependencies: 253
-- Name: COLUMN "PersonMediaLinks"."Notes"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public."PersonMediaLinks"."Notes" IS 'Notes about this person in the media (e.g., position in group photo)';


--
-- TOC entry 3978 (class 0 OID 0)
-- Dependencies: 253
-- Name: COLUMN "PersonMediaLinks"."LinkedAt"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public."PersonMediaLinks"."LinkedAt" IS 'Timestamp when this person was linked to this media';


--
-- TOC entry 222 (class 1259 OID 71120)
-- Name: PersonNames; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."PersonNames" (
    "Id" uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    "PersonId" uuid NOT NULL,
    "Script" character varying(10) DEFAULT 'Latin'::character varying NOT NULL,
    "Given" character varying(100),
    "Middle" character varying(100),
    "Family" character varying(100),
    "Full" character varying(300),
    "Transliteration" character varying(300),
    "Type" integer DEFAULT 0 NOT NULL,
    "CreatedAt" timestamp without time zone DEFAULT (now() AT TIME ZONE 'UTC'::text) NOT NULL
);


ALTER TABLE public."PersonNames" OWNER TO postgres;

--
-- TOC entry 3979 (class 0 OID 0)
-- Dependencies: 222
-- Name: TABLE "PersonNames"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public."PersonNames" IS 'Supports multi-script names (Latin, Arabic, Nobiin)';


--
-- TOC entry 229 (class 1259 OID 71250)
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
-- TOC entry 244 (class 1259 OID 72421)
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
-- TOC entry 245 (class 1259 OID 72428)
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
-- TOC entry 248 (class 1259 OID 72437)
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
-- TOC entry 249 (class 1259 OID 72447)
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
-- TOC entry 227 (class 1259 OID 71230)
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
-- TOC entry 228 (class 1259 OID 71242)
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
-- TOC entry 255 (class 1259 OID 72813)
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
-- TOC entry 252 (class 1259 OID 72670)
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
-- TOC entry 224 (class 1259 OID 71164)
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
-- TOC entry 3980 (class 0 OID 0)
-- Dependencies: 224
-- Name: TABLE "UnionMembers"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public."UnionMembers" IS 'Junction table supporting polygamy (multiple spouses per union)';


--
-- TOC entry 223 (class 1259 OID 71140)
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
-- TOC entry 254 (class 1259 OID 72807)
-- Name: __EFMigrationsHistory; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."__EFMigrationsHistory" (
    "MigrationId" character varying(150) NOT NULL,
    "ProductVersion" character varying(32) NOT NULL
);


ALTER TABLE public."__EFMigrationsHistory" OWNER TO postgres;

--
-- TOC entry 3495 (class 2604 OID 72931)
-- Name: FamilyRelationshipTypes Id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."FamilyRelationshipTypes" ALTER COLUMN "Id" SET DEFAULT nextval('public."FamilyRelationshipTypes_Id_seq"'::regclass);


--
-- TOC entry 3504 (class 2604 OID 72971)
-- Name: NameMappings Id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."NameMappings" ALTER COLUMN "Id" SET DEFAULT nextval('public."NameMappings_Id_seq"'::regclass);


--
-- TOC entry 3939 (class 0 OID 73047)
-- Dependencies: 262
-- Data for Name: AdminTownAssignments; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."AdminTownAssignments" ("Id", "UserId", "TownId", "AssignedByUserId", "AssignedAt", "IsActive") FROM stdin;
b04c8685-bb30-4363-926b-98591a6d60d0	103	b741876a-f8f8-4afe-8e6e-1e55fe02f464	100	2025-12-22 19:10:15.782344+00	t
\.


--
-- TOC entry 3928 (class 0 OID 72644)
-- Dependencies: 251
-- Data for Name: AdminTreeAssignments; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."AdminTreeAssignments" ("Id", "UserId", "TreeId", "AssignedByUserId", "AssignedAt") FROM stdin;
\.


--
-- TOC entry 3912 (class 0 OID 72389)
-- Dependencies: 235
-- Data for Name: AspNetRoleClaims; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."AspNetRoleClaims" ("Id", "RoleId", "ClaimType", "ClaimValue") FROM stdin;
\.


--
-- TOC entry 3908 (class 0 OID 72376)
-- Dependencies: 231
-- Data for Name: AspNetRoles; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."AspNetRoles" ("Id", "Name", "NormalizedName", "ConcurrencyStamp", "CreatedAt", "UpdatedAt", "Description") FROM stdin;
1	SuperAdmin	SUPERADMIN	3f64758b-ee48-450b-8bc3-cb8e74437c5f	2025-12-16 05:45:15.354103+00	2025-12-16 05:45:15.354103+00	\N
2	Admin	ADMIN	37a86994-ef31-40af-8068-81ce2238a0f0	2025-12-16 05:45:15.354103+00	2025-12-16 05:45:15.354103+00	\N
3	User	USER	4857240b-8e50-4dd0-986d-ef9cf08b03e6	2025-12-16 05:45:15.354103+00	2025-12-16 05:45:15.354103+00	\N
\.


--
-- TOC entry 3919 (class 0 OID 72414)
-- Dependencies: 242
-- Data for Name: AspNetTemp; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."AspNetTemp" ("Id", "ParCode", "InsertTime", "AspUser") FROM stdin;
\.


--
-- TOC entry 3923 (class 0 OID 72429)
-- Dependencies: 246
-- Data for Name: AspNetUserBearerToken; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."AspNetUserBearerToken" ("IssuedAt", "ExpiresAt", "IsRevoked", "RevokedAt", "Value", "UserId", "RefreshTokenId", "Id") FROM stdin;
\.


--
-- TOC entry 3914 (class 0 OID 72395)
-- Dependencies: 237
-- Data for Name: AspNetUserClaims; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."AspNetUserClaims" ("Id", "UserId", "ClaimType", "ClaimValue") FROM stdin;
\.


--
-- TOC entry 3916 (class 0 OID 72401)
-- Dependencies: 239
-- Data for Name: AspNetUserLogins; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."AspNetUserLogins" ("LoginProvider", "ProviderKey", "ProviderDisplayName", "UserId") FROM stdin;
\.


--
-- TOC entry 3917 (class 0 OID 72406)
-- Dependencies: 240
-- Data for Name: AspNetUserRoles; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."AspNetUserRoles" ("UserId", "RoleId", "AssignedAt", "AssignedBy") FROM stdin;
100	1	2025-12-16 05:47:46.160533+00	\N
101	2	2025-12-17 13:57:03.609917+00	\N
102	1	2025-12-17 13:57:45.106556+00	\N
103	2	2025-12-18 03:43:18.961506+00	\N
\.


--
-- TOC entry 3918 (class 0 OID 72409)
-- Dependencies: 241
-- Data for Name: AspNetUserTokens; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."AspNetUserTokens" ("UserId", "LoginProvider", "Name", "Value", "CreatedAt") FROM stdin;
101	FamilyTreeApi	RefreshToken	WmaKMUU6hTPThB/tVj5PJVMhPhM8zQSQsROcix4ohuBO1aGvtwwTLWdsvvWQrbsIlllAm1AW/rnDrBaDuwZuPw==	2025-12-18 05:11:56.587219+00
103	FamilyTreeApi	RefreshToken	r8ng5Elxzaq1ESxLAIL6KMR+jw4j/s9jZnSscVPC4PMa8ynhKheGy1MC4y/8pP032yFoxrbMwWrxiIcWsMA/Qg==	2025-12-29 18:22:17.175094+00
100	FamilyTreeApi	RefreshToken	kkIkCsL+a5ZkMJSr1V58LEzB2OgbUVIZzPEtmG19QWS1WKoRnXowUNuSzZFNtvZ5tSRV9CxoRyUKgq8R5F5SDg==	2025-12-22 18:22:37.942014+00
\.


--
-- TOC entry 3910 (class 0 OID 72382)
-- Dependencies: 233
-- Data for Name: AspNetUsers; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."AspNetUsers" ("Id", "InsertTime", "IvrProviderId", "HomePhonenumber", "UserName", "NormalizedUserName", "Email", "NormalizedEmail", "EmailConfirmed", "PasswordHash", "SecurityStamp", "ConcurrencyStamp", "PhoneNumber", "PhoneNumberConfirmed", "TwoFactorEnabled", "LockoutEnd", "LockoutEnabled", "AccessFailedCount", "TwoFactorCode", "CreatedAt", "LastLoginAt", "FirstName", "LastName", "PreferredLanguage") FROM stdin;
102	2025-12-17 13:57:45.732257+00	\N	\N	Atef.Kabaja@gmail.com	ATEF.KABAJA@GMAIL.COM	Atef.Kabaja@gmail.com	ATEF.KABAJA@GMAIL.COM	t	AQAAAAIAAYagAAAAECKgLDxFs0AeBtvAavMk71S5oR2wfWpjjhlwHxXGwDDRIRzVbhowolmwqOWaAzAHsw==	H3ZRVJW7NTDTMTLNF5N7YE3R5TWRA37X	56e6d91f-1205-49c9-839b-e98cc9b88f82	\N	f	f	\N	t	0	\N	2025-12-17 13:57:44.858659+00	2025-12-17 13:57:44.858659+00	Atef 	Kabaja	en
101	2025-12-17 13:57:04.208441+00	\N	\N	Atef.Salih@gmail.com	ATEF.SALIH@GMAIL.COM	Atef.Salih@gmail.com	ATEF.SALIH@GMAIL.COM	t	AQAAAAIAAYagAAAAEGQVsCbo6u91KC8HhFlTGGp79OE2+DMcc/WqaEP1xPgI0D3ba4ZdVtTahY35eG+uYA==	BEXDXFZ5O42OMLSE6XZ3OYOK2FMN5HLP	768c7d04-569d-442d-92bd-49565b1475bd	\N	f	f	\N	t	0	\N	2025-12-15 21:57:03.305429+00	2025-12-18 00:11:56.349072+00	Atef	Salih	en
103	2025-12-18 03:43:19.076232+00	\N	\N	lamis.salih@gmail.com	LAMIS.SALIH@GMAIL.COM	lamis.salih@gmail.com	LAMIS.SALIH@GMAIL.COM	t	AQAAAAIAAYagAAAAEAbqCG9ZmiwBnXVnMTUC8DquM4/4fih0/21+Cnm5X185j7TjuI74kjcXsjnbyNfM8w==	E5TXINQW6NQTDEG2RKQNRKXESAC74DWT	22313d23-5b16-45b6-a9ff-44eae4068f6c	\N	f	f	\N	t	0	\N	2025-11-27 12:43:18.652063+00	2026-01-05 18:08:49.124468+00	Lamis	Mahgoub	en
100	2025-12-14 22:50:02.104016+00	\N	\N	admin@familytree.demo	ADMIN@FAMILYTREE.DEMO	admin@familytree.demo	ADMIN@FAMILYTREE.DEMO	f	AQAAAAIAAYagAAAAEPQLgxpKl28j5/1laUOowHoXkRc/GP+lPfBwfrgaRePfRlkIAoLGbOi12rOKh/0Iuw==	U6XMZPAQ36AI5QU67FEK4M4KQWUYCVB5	93517933-2f9f-45a1-8d89-3bf3991f729f	\N	f	f	\N	t	0	\N	2025-12-06 04:50:00.46135+00	2025-12-22 23:21:04.669587+00	Admin	User	en
\.


--
-- TOC entry 3907 (class 0 OID 71268)
-- Dependencies: 230
-- Data for Name: AuditLogs; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."AuditLogs" ("Id", "ActorId", "EntityType", "EntityId", "Action", "ChangeJson", "Timestamp", "IpAddress") FROM stdin;
\.


--
-- TOC entry 3938 (class 0 OID 73001)
-- Dependencies: 261
-- Data for Name: Families; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."Families" ("Id", "Name", "NameEn", "NameAr", "NameLocal", "Description", "OrgId", "TownId", "PatriarchId", "MatriarchId", "Color", "SortOrder", "CreatedAt", "UpdatedAt") FROM stdin;
\.


--
-- TOC entry 3934 (class 0 OID 72928)
-- Dependencies: 257
-- Data for Name: FamilyRelationshipTypes; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."FamilyRelationshipTypes" ("Id", "NameArabic", "NameEnglish", "NameNubian", "Category", "SortOrder", "IsActive", "CreatedAt") FROM stdin;
1	أب	Father	ⲫⲁ̄ⲡ	Immediate	1	t	2025-12-20 07:00:28.977757+00
2	أم	Mother	ⲉ̄ⲛ	Immediate	2	t	2025-12-20 07:00:28.977757+00
3	ولد	Son	ⲧⲟ̄ⲇ	Immediate	3	t	2025-12-20 07:00:28.977757+00
4	بنت	Daughter	ⲓⲥⲥⲉ̄ ⲓⲥⲥⲉ̄	Immediate	4	t	2025-12-20 07:00:28.977757+00
5	أخ	Brother	ⲉⳟⳟⲁ	Immediate	5	t	2025-12-20 07:00:28.977757+00
6	أخت	Sister	ⲉⲥⲥⲓ	Immediate	6	t	2025-12-20 07:00:28.977757+00
7	زوج	Husband	ⲓⲇ	Immediate	7	t	2025-12-20 07:00:28.977757+00
8	زوجة	Wife	ⲓⲇⲉ̄ⲛ	Immediate	8	t	2025-12-20 07:00:28.977757+00
9	جد	Grandfather	ⲟ̅ⲩ̅	Grandparents	9	t	2025-12-20 07:00:28.977757+00
10	جدة	Grandmother	ⲁ̄ⳣ	Grandparents	10	t	2025-12-20 07:00:28.977757+00
11	حفيد	Grandson	ⲁⲥⲥⲓ	Grandchildren	11	t	2025-12-20 07:00:28.977757+00
12	حفيدة	Granddaughter	ⲁⲥⲥⲓ	Grandchildren	12	t	2025-12-20 07:00:28.977757+00
13	ابن الحفيد	Great-grandson	ⳣⲓⲥⲥⲓ	Grandchildren	13	t	2025-12-20 07:00:28.977757+00
14	بنت الحفيد	Great-granddaughter	ⳣⲓⲥⲥⲓ	Grandchildren	14	t	2025-12-20 07:00:28.977757+00
15	عم	Paternal Uncle	ⲫⲁ̄ⲡⲓⲛ ⲉⳟⳟⲁ	Uncles/Aunts	15	t	2025-12-20 07:00:28.977757+00
16	عمة	Paternal Aunt	ⲁⳡⳡⲓ	Uncles/Aunts	16	t	2025-12-20 07:00:28.977757+00
17	خال	Maternal Uncle	ⲅⲓ̄	Uncles/Aunts	17	t	2025-12-20 07:00:28.977757+00
18	خالة	Maternal Aunt	ⲉ̄ⲛⲡⲉⲥ	Uncles/Aunts	18	t	2025-12-20 07:00:28.977757+00
19	ابن العم	Cousin (paternal uncle's son)	ⲁⲡⲡⲛ ⲉⳟⳟⲁⲛ ⲧⲟ̄ⲇ	Cousins	19	t	2025-12-20 07:00:28.977757+00
20	بنت العم	Cousin (paternal uncle's daughter)	ⲁⲡⲟⲛ ⲉⳟⳟⲁⲛ ⲁⲥ	Cousins	20	t	2025-12-20 07:00:28.977757+00
21	ابن العمة	Cousin (paternal aunt's son)	ⲁⲛⲛⲁⳡⲓⲛ ⲧⲟ̄ⲇ	Cousins	21	t	2025-12-20 07:00:28.977757+00
22	بنت العمة	Cousin (paternal aunt's daughter)	ⲁⲡⲛⲁⲃⲓⲛ ⲁⲇ ⲁⲥ	Cousins	22	t	2025-12-20 07:00:28.977757+00
23	ابن الخال	Cousin (maternal uncle's son)	ⲁⲛⲉ̄ⲛ ⲡⲣⲥⲓⲛ ⲧⲟ̄ⲇ	Cousins	23	t	2025-12-20 07:00:28.977757+00
24	بنت الخال	Cousin (maternal uncle's daughter)	ⲁⲛⲉ̄ⲛ ⲡⲉⲥⲟⲛ ⲁⲥ	Cousins	24	t	2025-12-20 07:00:28.977757+00
25	ابن الأخ	Nephew (brother's son)	ⳝⲟⲩⲧⲧⲓ	Nephews/Nieces	25	t	2025-12-20 07:00:28.977757+00
26	بنت الأخ	Niece (brother's daughter)	ⳝⲟⲩⲧⲧⲓ	Nephews/Nieces	26	t	2025-12-20 07:00:28.977757+00
27	ابن الأخت	Nephew (sister's son)	ⳝⲟⲩⲧⲧⲓ	Nephews/Nieces	27	t	2025-12-20 07:00:28.977757+00
28	بنت الأخت	Niece (sister's daughter)	ⳝⲟⲩⲧⲧⲓ	Nephews/Nieces	28	t	2025-12-20 07:00:28.977757+00
29	حما	Father-in-law	ⲁⲅⲟ	In-Laws	29	t	2025-12-20 07:00:28.977757+00
30	حماة	Mother-in-law	ⲁⲅⲟ	In-Laws	30	t	2025-12-20 07:00:28.977757+00
31	صهر	Son-in-law	ⲟⲧⲧⲓ	In-Laws	31	t	2025-12-20 07:00:28.977757+00
32	كنّة	Daughter-in-law	ⲟⲧⲧⲓ	In-Laws	32	t	2025-12-20 07:00:28.977757+00
33	زوج الأخت	Sister's husband	ⲓⲇ ⲉⲥⲥⲓ	In-Laws	33	t	2025-12-20 07:00:28.977757+00
34	زوجة الأخ	Brother's wife	ⲓⲇ ⲉⳟⳟⲁ	In-Laws	34	t	2025-12-20 07:00:28.977757+00
35	زوج الأم	Stepfather	ⲓⲇ ⲉ̄ⲛ	Step	35	t	2025-12-20 07:00:28.977757+00
36	زوجة الأب	Stepmother	ōčča-r	Step	36	t	2025-12-20 07:00:28.977757+00
37	ابن الزوجة	Stepson	ⲧⲟ̄ⲇ ⲓⲇⲉ̄ⲛ	Step	37	t	2025-12-20 07:00:28.977757+00
38	بنت الزوجة	Stepdaughter	ⲓⲇⲉ̄ⲛ ⲓⲥⲥⲉ̄	Step	38	t	2025-12-20 07:00:28.977757+00
\.


--
-- TOC entry 3903 (class 0 OID 71206)
-- Dependencies: 226
-- Data for Name: MediaFiles; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."MediaFiles" ("Id", "OrgId", "Url", "StorageKey", "Kind", "Title", "Description", "CaptureDate", "CapturePlaceId", "Visibility", "Copyright", "MetadataJson", "CreatedAt", "UpdatedAt", "UploadedByUserId", "Category", "FileName", "MimeType", "FileSize", "PersonId", "ThumbnailPath", "StorageType") FROM stdin;
5d34f2fb-c6be-4d8a-a752-3075f19258db	6f7e2152-c6a2-47ca-b96e-9814df717a03	B:\\var\\www\\familytree\\media\\family-tree\\people\\7bf610c8-5a1b-4c9e-91e5-49d7c7bccc0a\\image\\Image_3fa78a8a-edc5-4a64-b2b6-c2fd92c47a7b.png	family-tree/people/7bf610c8-5a1b-4c9e-91e5-49d7c7bccc0a/image/Image_3fa78a8a-edc5-4a64-b2b6-c2fd92c47a7b.png	0	\N	Test Picture	\N	\N	1	\N	\N	2025-12-29 18:52:17.939985	2025-12-29 18:52:17.940118	\N	\N	didNotwork_3.png	image/png	244736	7bf610c8-5a1b-4c9e-91e5-49d7c7bccc0a	\N	1
\.


--
-- TOC entry 3937 (class 0 OID 72968)
-- Dependencies: 260
-- Data for Name: NameMappings; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."NameMappings" ("Id", "Arabic", "ArabicNormalized", "English", "EnglishNormalized", "Nobiin", "NobiinNormalized", "Ipa", "IsVerified", "NeedsReview", "Source", "Confidence", "CreatedAt", "UpdatedAt", "ConfirmedByUserId", "OrgId") FROM stdin;
1	محمد	محمد	Mohamed	mohamed	ⲙⲟϩⲁⲙⲉⲇ	ⲙⲟϩⲁⲙⲉⲇ	mohamed	t	f	user	1	2025-12-21 19:15:21.52979+00	\N	\N	\N
2	أحمد	أحمد	Ahmed	ahmed	ⲁϩⲙⲉⲇ	ⲁϩⲙⲉⲇ	ahmed	t	f	user	1	2025-12-21 19:15:21.52979+00	\N	\N	\N
3	فاطمة	فاطمة	Fatma	fatma	ⲫⲁⲧⲙⲁ	ⲫⲁⲧⲙⲁ	fatma	t	f	user	1	2025-12-21 19:15:21.52979+00	\N	\N	\N
4	خالد	خالد	Khaled	khaled	ⲕϩⲁⲗⲉⲇ	ⲕϩⲁⲗⲉⲇ	khaled	t	f	user	1	2025-12-21 19:15:21.52979+00	\N	\N	\N
5	حسن	حسن	Hassan	hassan	ϩⲁⲥⲥⲁⲛ	ϩⲁⲥⲥⲁⲛ	hassan	t	f	user	1	2025-12-21 19:15:21.52979+00	\N	\N	\N
6	حسين	حسين	Hussein	hussein	ϩⲟⲩⲥⲥⲉⲓⲛ	ϩⲟⲩⲥⲥⲉⲓⲛ	hussein	t	f	user	1	2025-12-21 19:15:21.52979+00	\N	\N	\N
7	إبراهيم	إبراهيم	Ibrahim	ibrahim	ⲓⲃⲣⲁϩⲓⲙ	ⲓⲃⲣⲁϩⲓⲙ	ibrahim	t	f	user	1	2025-12-21 19:15:21.52979+00	\N	\N	\N
8	عبد الله	عبد الله	Abdullah	abdullah	ⲁⲃⲇⲟⲩⲗⲗⲁϩ	ⲁⲃⲇⲟⲩⲗⲗⲁϩ	abdullah	t	f	user	1	2025-12-21 19:15:21.52979+00	\N	\N	\N
9	عبد الرحمن	عبد الرحمن	Abdel Rahman	abdel rahman	ⲁⲃⲇⲉⲗ ⲣⲁϩⲙⲁⲛ	ⲁⲃⲇⲉⲗ ⲣⲁϩⲙⲁⲛ	abdel rahman	t	f	user	1	2025-12-21 19:15:21.52979+00	\N	\N	\N
10	مصطفى	مصطفى	Mostafa	mostafa	ⲙⲟⲥⲧⲁⲫⲁ	ⲙⲟⲥⲧⲁⲫⲁ	mostafa	t	f	user	1	2025-12-21 19:15:21.52979+00	\N	\N	\N
11	يوسف	يوسف	Youssef	youssef	ⲏⲟⲩⲥⲥⲉⲫ	ⲏⲟⲩⲥⲥⲉⲫ	youssef	t	f	user	1	2025-12-21 19:15:21.52979+00	\N	\N	\N
12	نور	نور	Nour	nour	ⲛⲟⲩⲣ	ⲛⲟⲩⲣ	nour	t	f	user	1	2025-12-21 19:15:21.52979+00	\N	\N	\N
\.


--
-- TOC entry 3896 (class 0 OID 71044)
-- Dependencies: 219
-- Data for Name: OrgUsers; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."OrgUsers" ("Id", "OrgId", "UserId", "Role", "JoinedAt") FROM stdin;
755eadc1-4d4a-4bc6-bca5-0ff07edac7e1	6f7e2152-c6a2-47ca-b96e-9814df717a03	103	5	2025-12-29 16:31:14.787941
36b86e76-f4f1-4376-bc05-3275a24cad41	6f7e2152-c6a2-47ca-b96e-9814df717a03	100	5	2025-12-30 04:36:12.826261
\.


--
-- TOC entry 3894 (class 0 OID 71019)
-- Dependencies: 217
-- Data for Name: Orgs; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."Orgs" ("Id", "Name", "SettingsJson", "CreatedAt", "UpdatedAt", "Description", "IsPublic", "AllowCrossTreeLinking", "CoverImageUrl", "OwnerId", "TownId") FROM stdin;
6f7e2152-c6a2-47ca-b96e-9814df717a03	Al Badr	\N	2025-12-29 16:31:14.76717	2025-12-29 16:32:46.046005		f	t	\N	103	b741876a-f8f8-4afe-8e6e-1e55fe02f464
\.


--
-- TOC entry 3902 (class 0 OID 71183)
-- Dependencies: 225
-- Data for Name: ParentChildren; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."ParentChildren" ("Id", "ParentId", "ChildId", "RelationshipType", "Certainty", "Notes", "CreatedAt") FROM stdin;
0018ac0c-490c-42c3-899d-e2e5076b2096	41ab25c4-81ea-46f0-8ec7-82f30f270160	387edd28-b954-47e9-ab76-633166aa4758	0	\N	\N	2025-12-29 16:31:28.794597
00190422-bbf0-4563-8bc4-97f9848b8bf5	874fc067-a244-478a-ace5-0d352e439606	dd8ce14b-7b18-4673-a974-cbf78d659082	0	\N	\N	2025-12-29 16:31:22.854483
0028d13e-de27-485a-846c-4630a805c085	e45d13e2-7506-4a76-b530-ee69fd0eb2b1	198fd73a-e56d-48c9-9473-1cd6a830a62a	0	\N	\N	2025-12-29 16:31:16.233468
002a207b-8209-4bf9-a46c-0fe0cf580603	0a160248-e4f5-449f-a4af-9dd4197f735a	b1d2b30a-32a3-4db8-9927-6a212b2a79a0	0	\N	\N	2025-12-29 16:31:22.815688
00a11fb7-9c73-4d17-93b6-08da52d92101	3f5b9f66-9803-4368-8dd4-eeb2b3f83dec	e44cd487-3c0b-438c-819e-462bc3480ef1	0	\N	\N	2025-12-29 16:31:16.971909
00fd24d2-6944-422b-919f-186fa7e77c86	57853450-4b79-4a55-b6ae-4267f86e4740	d7467f95-6146-493e-b209-686878c3e641	0	\N	\N	2025-12-29 16:31:17.749797
010a75aa-4c9b-479e-9d49-a92812282e2e	df227c3f-0f26-4e93-b7b9-dd6802a061a5	d913e8e7-7b5a-4516-8d86-0bc443170546	0	\N	\N	2025-12-29 16:31:24.786224
016c6313-23cf-491c-8352-61a3f426f9a1	66bfe7b7-2c8c-4cf5-ae84-8b348fe68cbd	088cc246-a351-465e-b820-60b56fe2263e	0	\N	\N	2025-12-29 16:31:21.346726
0199b4e9-01ae-4fe8-980a-fdaa910d74e9	07875362-d8ee-4928-86ac-7aecb98a86d6	62325283-63f0-4f68-84f9-f52a8c6cde69	0	\N	\N	2025-12-29 16:31:17.139234
01df22a1-014a-4871-96e0-55ed9b5b9ef5	57853450-4b79-4a55-b6ae-4267f86e4740	6a98624b-3524-4aab-89cd-d41ca54b2207	0	\N	\N	2025-12-29 16:31:17.553707
01e6ed95-f34c-432d-851f-87bf48d22ba9	ebeba076-fd3d-4db5-afdd-1b4d9042d038	51e772c9-fdcf-466f-b506-b56e023df862	0	\N	\N	2025-12-29 16:31:27.98245
022aa929-e610-441d-9efa-d6c1014378bf	57853450-4b79-4a55-b6ae-4267f86e4740	a4675322-ed29-4968-8aba-2c803366d80e	0	\N	\N	2025-12-29 16:31:17.584322
027fd92d-7b3e-4700-aafe-e5fe0d8fef1e	b9b13aae-11e6-4e84-b1f2-b57d2918d3d5	2b6d5983-a17e-4413-9888-6e9673e94ad9	0	\N	\N	2025-12-29 16:31:27.852671
02dc3a3f-05a3-4691-b687-14ee4d9e7b69	e35a59c7-dd2c-4085-88ab-345a2978d6bd	20652c23-0026-494e-91c8-5ab698cc4aec	0	\N	\N	2025-12-29 16:31:19.412616
030f3485-3df0-4b83-beda-13fbaea2c074	a0d28119-3e65-42d4-8f64-61ef2942b030	5eadca51-02e7-47a2-9678-afbf2965a3aa	0	\N	\N	2025-12-29 16:31:26.794378
0324419a-ada2-4307-a911-6362be254ba2	822cc8a5-c22d-4a68-9375-662ea3b2dfc6	f6abe729-f7dd-45da-8c31-9be811832569	0	\N	\N	2025-12-29 16:31:19.148108
038a51ba-6bac-43ae-bd9b-94544e3cefaa	976db09a-ec7a-4241-bdc8-f98763174305	b7d8ced6-a4fd-4fec-b75c-63daf3324e8d	0	\N	\N	2025-12-29 16:31:25.546148
039846ed-031f-4149-b03f-0f9c817d0d3f	34f7930c-ebe4-4369-8697-a133297bab81	7de1781e-89dd-4454-800c-5ba3c1ec7885	0	\N	\N	2025-12-29 16:31:30.385232
040253e1-e5cd-4010-9c13-479a0cbd8ce8	113a3b6b-bc1d-4189-a5be-ff0f4b6da898	3d377878-47f8-44d4-b8f8-c69247708b99	0	\N	\N	2025-12-29 16:31:30.176687
046b0fbf-a7b7-48bf-8aad-fe742d786d13	e44cd487-3c0b-438c-819e-462bc3480ef1	68641213-079d-4200-80e0-437391610deb	0	\N	\N	2025-12-29 16:31:18.547814
048d479e-6d38-4068-a850-5eb87fc0b4c3	8039b17f-3028-43be-9ba8-1c3498ef85a9	2bfbbbb6-df60-48c1-9619-7bc9f565e18b	0	\N	\N	2025-12-29 16:31:16.556122
04c49807-cc5a-46a3-8ecf-e6696155474c	db12a4fc-6e43-473d-9239-c5fd59c33e3e	34f7930c-ebe4-4369-8697-a133297bab81	0	\N	\N	2025-12-29 16:31:22.971184
0591d98e-82fa-43dd-bd74-82cf1f2463a3	f9e95815-2b58-46ce-ad03-39d332808875	100e3388-7500-4115-b127-a133e69aad3f	0	\N	\N	2025-12-29 16:31:25.334244
05fc5127-f174-4d68-be44-5b040f5a76be	874fc067-a244-478a-ace5-0d352e439606	976db09a-ec7a-4241-bdc8-f98763174305	0	\N	\N	2025-12-29 16:31:22.988504
06b2d31d-d4c0-433b-9ae8-a4bd784ebe6d	1b91d97e-55a8-4c4f-9a72-dedf95ca2aed	963a9695-5acd-4162-aff2-03b33022cdd4	0	\N	\N	2025-12-29 16:31:16.607945
07c75d5f-79dc-4a7d-802a-f53c68bc1010	b2172455-58f5-416c-bfc5-a1f2b6caff88	4466efbf-f708-4a29-b13d-5c28297f4db3	0	\N	\N	2025-12-29 16:31:23.762023
083db0e8-5694-4753-a49d-6e0a5d897b76	8f4c4dff-b017-4a1d-b563-6bfcaba29a1d	256b6740-757c-4c62-9c1e-912cd09d6946	0	\N	\N	2025-12-29 16:31:23.165882
085e03ad-8b3f-440e-ae48-9bcad4665f51	4a56e8cc-a3a2-490d-a9cb-d0dcad81566a	aa971367-e937-482e-b716-43b0c8b4bd94	0	\N	\N	2025-12-29 16:31:27.236076
086b6ded-1585-4ea7-a55c-a623ca04dc83	5087b661-e52b-417d-ad01-4aebfc684d3c	e4785339-9e4f-41e6-9d41-c31a5ed1883d	0	\N	\N	2025-12-29 16:31:25.744717
08762af0-e280-422b-8121-23ed52aacb85	57853450-4b79-4a55-b6ae-4267f86e4740	5998a405-ab45-42d0-a51e-767985fd8fa7	0	\N	\N	2025-12-29 16:31:17.628105
08987ab1-4261-4814-bb66-2041072d933b	8c370e5c-63ad-46a4-96ae-be21a5ea8683	b7d8ced6-a4fd-4fec-b75c-63daf3324e8d	0	\N	\N	2025-12-29 16:31:25.520191
08aca2e7-872b-4a6b-8fd4-f0ce5e89656a	63f661ac-75e0-4aae-a1aa-879128891215	12ffb31b-f46b-422f-9124-00f363f1ac7b	0	\N	\N	2025-12-29 16:31:29.517422
08bef1b2-2227-4272-97a3-c011eb361243	e7c9085f-4613-453d-8233-7171e2cf9609	2c1bfeee-d425-4831-897b-f2274e085973	0	\N	\N	2025-12-29 16:31:22.163369
08d3c2d6-edae-42c9-8b63-8c10d82ff28e	8f4c4dff-b017-4a1d-b563-6bfcaba29a1d	a97610b7-bbf7-4c51-b401-ef93890feb3f	0	\N	\N	2025-12-29 16:31:23.339164
09039a7a-0f0f-4c9c-a822-9ab1bf761c64	e45d13e2-7506-4a76-b530-ee69fd0eb2b1	99fe3a58-fd18-4de2-bcf6-0971b019fb65	0	\N	\N	2025-12-29 16:31:16.436077
094d0a43-fa45-4e31-8039-36b4d462b92f	874fc067-a244-478a-ace5-0d352e439606	efa7406f-7481-498f-a680-8c0a84e13c7b	0	\N	\N	2025-12-29 16:31:23.114577
0964e185-1fab-4941-bd01-07674392a474	883f5f91-3f16-4eab-8744-e519e45d256f	28e0e0d9-ff42-4392-a80e-2f899f7e7fe8	0	\N	\N	2025-12-29 16:31:28.253063
09a5da26-9a8c-44d9-b812-bb902e976550	e1b7b70c-bd56-42e3-8464-e04327fc62c4	0a160248-e4f5-449f-a4af-9dd4197f735a	0	\N	\N	2025-12-29 16:31:17.878455
09fad03c-97e7-4cb9-b805-abdfa40c4e17	abc95b43-ba5c-43a4-9946-7190e458f953	934ca836-be77-422a-9cbd-34fb31969486	0	\N	\N	2025-12-29 16:31:23.619901
0a1a8320-9b12-4130-916a-647a5d9de55d	f43058ff-54b4-42b3-837e-57c08655f9f6	41ab25c4-81ea-46f0-8ec7-82f30f270160	0	\N	\N	2025-12-29 16:31:22.379236
0ad37077-24e6-4144-bfea-f20d957d0595	5ea9d2fc-288e-4997-b046-0b57b502e3d0	05d61ba4-ede6-48ac-b255-fa8693be7061	0	\N	\N	2025-12-29 16:31:29.883216
0af87e7f-c77e-4567-8b85-e3e79f4d2551	62856f54-242c-4f67-8220-cb451ce52031	60bfd2da-842f-4c70-8a03-689c52e7c9d2	0	\N	\N	2025-12-29 16:31:25.360278
0b500f44-d518-4ea6-ba14-d46922b381bc	8815f86f-febd-4639-bd1d-0e946afa280b	28dfe729-587a-4b7b-970b-7e2077a55bcd	0	\N	\N	2025-12-29 16:31:25.844429
0bbc9406-9227-4a32-ba8f-3178c0267935	cab8e0bd-4e05-450b-bef7-4b8651d5295f	16bd771f-08ea-4656-8239-65f5f9376104	0	\N	\N	2025-12-29 16:31:16.033876
0bc01c10-b63a-4212-92d7-39f33b1e4624	9235266f-7ffa-492b-b318-795465417e73	5e856554-dfb5-4657-9265-01096f0f6451	0	\N	\N	2025-12-29 16:31:21.489622
0cbd29e3-7db4-425f-a9be-2451cb9b8a72	8039b17f-3028-43be-9ba8-1c3498ef85a9	822cc8a5-c22d-4a68-9375-662ea3b2dfc6	0	\N	\N	2025-12-29 16:31:16.707247
0ccb0a89-e572-444b-8541-c06ffa16f61b	4418e04b-2f6e-4196-a0a1-57584f714f60	b871ee60-01ee-4d41-aebf-db6a2334744b	0	\N	\N	2025-12-29 16:31:25.625396
0d2a58bd-b541-4984-be7c-619cbeeae06b	288bfc15-ead3-401d-9bee-e2f5edc370b4	e1d30736-5971-45ff-a06a-f4de4a7acf7e	0	\N	\N	2025-12-29 16:31:30.029904
0d31be9f-d158-434b-a49f-31ed45abec30	8cd3209b-7b52-4a4c-a92a-1f8cd6b5e407	66c8f4e7-94fa-4ff6-b592-07e5ad89ed22	0	\N	\N	2025-12-29 16:31:21.88708
0d477f7b-60d6-4f42-9236-9b5f40b60838	a3177ae6-e4a7-4f49-a4eb-40c3c7f8a616	f8b1a730-10b7-4498-81d7-97a58ad0ec53	0	\N	\N	2025-12-29 16:31:27.109676
0d9802f6-46db-4203-ace1-afead07f5e93	03ad50e3-aa0b-4875-aefd-6c25e9ef1631	5faf0d74-97e9-4988-b6f1-333a4d088bbf	0	\N	\N	2025-12-29 16:31:21.105838
0e5e3ab3-bab8-4ee5-8b62-af5e4a04b4f7	e35a59c7-dd2c-4085-88ab-345a2978d6bd	e8b6f8e0-7503-4834-b07a-7501aec4aac9	0	\N	\N	2025-12-29 16:31:19.364072
0e76580f-9e08-4923-98e8-6ffb2fd194ab	f252346e-a197-4a27-9836-34fb7e50bffd	1e2bde09-e21a-46e3-82d1-0eec6cf6f166	0	\N	\N	2025-12-29 16:31:19.887279
0ede3bba-cdb4-4e72-a82a-437b34c186fe	a0d28119-3e65-42d4-8f64-61ef2942b030	806c3be9-5054-40a0-a67c-89c184a0e34b	0	\N	\N	2025-12-29 16:31:26.690635
0ee80920-0039-4017-9552-64d4815de819	56f64ff2-3752-44b6-bd7c-7dfb1042fe27	bd950ffd-8680-4803-b845-1542f9f85549	0	\N	\N	2025-12-29 16:31:26.717092
1027a533-804f-4edb-bb2b-e0ab63f7917e	f738e1ee-e9f7-49c8-91a5-31f9b9564754	5d0f3a15-3457-4304-ad3f-9e44c33dfc73	0	\N	\N	2025-12-29 16:31:26.587153
10895cef-9ab8-4642-b54c-a990153c8430	56f64ff2-3752-44b6-bd7c-7dfb1042fe27	5eadca51-02e7-47a2-9678-afbf2965a3aa	0	\N	\N	2025-12-29 16:31:26.768102
110fb068-902c-4b46-8ee7-f2b5f291216e	1542491d-e953-45e9-8a81-53b2b8a5931f	7dce3336-a904-4e58-b4ee-4b90af944e44	0	\N	\N	2025-12-29 16:31:19.575682
11338eca-e9dc-4f81-8138-d570aba74058	b9b13aae-11e6-4e84-b1f2-b57d2918d3d5	1c6ea137-4121-40f2-852b-b78686fd071b	0	\N	\N	2025-12-29 16:31:27.69756
113c617a-8bd6-458e-9368-137647634997	2dce1a0b-11b9-41a7-827d-562234457252	f32668a8-9c7c-412a-bbbd-77502615cb5f	0	\N	\N	2025-12-29 16:31:17.074463
115a7a66-da72-4992-aca6-f07b87963759	ee87be0a-b544-47ca-b093-4b168fbd9532	3a7bdfc0-830b-44c6-86ee-dfa84b9b3a6a	0	\N	\N	2025-12-29 16:31:21.083483
1169e7f7-8f2e-4842-9a6c-80848b2bb466	e44cd487-3c0b-438c-819e-462bc3480ef1	9e3b5733-9174-42c4-ae99-d7d15a640b2b	0	\N	\N	2025-12-29 16:31:18.496139
11c020da-9a33-4531-9737-4b949b698abe	01e7143e-e7d9-4723-976d-4e9e92ea06c5	d7efedae-b5ad-43b0-9086-6749206f7216	0	\N	\N	2025-12-29 16:31:30.530867
12992c6f-06bb-47d6-9cdb-fac36875ce76	4a56e8cc-a3a2-490d-a9cb-d0dcad81566a	e58d2487-41a2-4856-8eec-31a6cb8f3bf6	0	\N	\N	2025-12-29 16:31:26.945742
12ca9f08-39b7-48bf-8777-1314a2255628	9254c9c2-552b-48b6-bf47-ec7b9f024086	6988f9c8-0142-4cb1-a30f-60e513910da8	0	\N	\N	2025-12-29 16:31:20.89416
12e16e84-1a8c-4d6a-bb99-b0f1b761b38a	e1b7b70c-bd56-42e3-8464-e04327fc62c4	57853450-4b79-4a55-b6ae-4267f86e4740	0	\N	\N	2025-12-29 16:31:18.219265
13376351-de24-4d53-ba9c-fc355b814404	f9e95815-2b58-46ce-ad03-39d332808875	ef596350-3a6c-4d71-889d-512a773771c1	0	\N	\N	2025-12-29 16:31:25.239143
1353707d-cb4a-417e-ad03-04698148f928	74b38e76-dfbe-409b-ba03-f39025b6de2b	8648c111-f28f-4f0f-9dec-8d88f3455274	0	\N	\N	2025-12-29 16:31:20.514411
1377489b-9729-4832-9c65-93280fda899f	f32668a8-9c7c-412a-bbbd-77502615cb5f	6988f9c8-0142-4cb1-a30f-60e513910da8	0	\N	\N	2025-12-29 16:31:20.915364
13dfee30-699d-4ae2-a4db-4e0ecd7ee040	1542491d-e953-45e9-8a81-53b2b8a5931f	1dd0b591-cf5a-4021-bd1e-d7881437b110	0	\N	\N	2025-12-29 16:31:19.338795
141f975e-0be5-4ec3-8de4-7c51b3b05ae9	5ee5eb1b-6f3f-469c-91b6-1c5300da8f71	854b2dd2-5036-45a3-a142-26e5ee1d64cf	0	\N	\N	2025-12-29 16:31:21.281982
145db595-862f-42bf-950e-d7dd7eea4944	4a56e8cc-a3a2-490d-a9cb-d0dcad81566a	c583a531-e16c-40df-8694-b52868b4b74f	0	\N	\N	2025-12-29 16:31:26.891454
149989f8-9014-4cf6-845c-c4cf934b6257	aa0ec19d-05fe-4c67-8462-5fc99badd90d	1e2bde09-e21a-46e3-82d1-0eec6cf6f166	0	\N	\N	2025-12-29 16:31:19.91365
14a7779c-c672-4c7c-a991-86f90f47c53d	cfcdeebb-3b56-4553-904f-397f374b92a8	138eea36-2263-4093-9a21-dd6aeb846450	0	\N	\N	2025-12-29 16:31:17.473884
157507ae-8f6b-4cdc-abe4-258246bc1df0	a20d7808-69be-49ef-8a9c-58dbe9bef865	22dbe006-c318-418b-a66e-2bfb6ebe2e17	0	\N	\N	2025-12-29 16:31:26.297841
1656de29-13dc-4cc6-96d6-098b0b23ac6c	03ad50e3-aa0b-4875-aefd-6c25e9ef1631	b713c623-e12c-4c4f-bef6-d2a387f88359	0	\N	\N	2025-12-29 16:31:21.191868
1674f095-43ce-4184-828b-134f0d833792	a4675322-ed29-4968-8aba-2c803366d80e	c3aa665d-1a7a-40c9-b6be-fe9a43fcd8f7	0	\N	\N	2025-12-29 16:31:29.706189
16a7eb40-ac2e-41ef-b2c1-3ba4ee75ee5b	f6abe729-f7dd-45da-8c31-9be811832569	e860251a-9d40-4de4-9dcb-1b93469fdf0c	0	\N	\N	2025-12-29 16:31:26.349609
16caf5b8-d364-4d2a-9ec3-b35817233070	13aac49d-554b-4ac5-8c78-ab6abc4a61c4	a3177ae6-e4a7-4f49-a4eb-40c3c7f8a616	0	\N	\N	2025-12-29 16:31:24.01324
17bd2ebd-bff6-4ea1-93b7-f3438fa00a13	1cef3beb-2d1b-4136-a805-285df0f81366	98056226-655c-4f92-8216-199573920cd7	0	\N	\N	2025-12-29 16:31:18.677442
1822e9d6-aa80-4aa7-8acb-ae7d634ec77b	1d3b4207-a170-4014-80db-d5a1b76f0035	9e233a52-68ac-4562-bed2-3fbae2aec730	0	\N	\N	2025-12-29 16:31:16.303122
1828595f-a9c1-4830-a72a-1ea73bd778a2	cb3d8eb8-2628-4ee0-a199-97e0a7a530d1	7bf62e83-8b40-4612-8180-ed6799b3c5cd	0	\N	\N	2025-12-29 16:31:18.694687
18a29841-8a5b-4049-8a91-90e601e1ab4f	ffa02956-07ed-4b37-a8cd-b23414c2b81e	9463577f-8e4a-4f1b-a3d7-17e2eb9ce025	0	\N	\N	2025-12-29 16:31:24.439854
1953bece-7b3d-4aea-81a9-630cb8e4f2b2	e35a59c7-dd2c-4085-88ab-345a2978d6bd	7915d38b-983d-4280-a2ce-1b1714d70ba6	0	\N	\N	2025-12-29 16:31:19.598308
1a0f0d0b-1d2d-4ac8-9104-f5b6a2c5c19f	66bfe7b7-2c8c-4cf5-ae84-8b348fe68cbd	f99f8826-c8b7-4ed9-a3a4-3f805cedbc1d	0	\N	\N	2025-12-29 16:31:21.260458
1a4af3cd-b20d-429d-b0ae-28ff2f64257f	3f5b9f66-9803-4368-8dd4-eeb2b3f83dec	f9e95815-2b58-46ce-ad03-39d332808875	0	\N	\N	2025-12-29 16:31:17.048762
1aa0c96e-df91-4f6f-8af5-99437d60b98b	874fc067-a244-478a-ace5-0d352e439606	34f7930c-ebe4-4369-8697-a133297bab81	0	\N	\N	2025-12-29 16:31:22.954043
1b394bc4-48f3-4055-8e05-de9daf865854	4b1a8a5e-5892-451f-bb44-3b57cc638fae	061cfd7d-2c8c-4ced-8b74-8257d83220ef	0	\N	\N	2025-12-29 16:31:23.474486
1b39b5b2-fc96-4bef-9ee9-839cf903a6cb	df227c3f-0f26-4e93-b7b9-dd6802a061a5	3ea3b6ce-d497-4f20-80a3-7f3801c0d0f5	0	\N	\N	2025-12-29 16:31:24.984538
1bae2d27-ec76-4322-9d31-741b5027240d	a0d28119-3e65-42d4-8f64-61ef2942b030	bd950ffd-8680-4803-b845-1542f9f85549	0	\N	\N	2025-12-29 16:31:26.742457
1be2608f-2d58-4a35-b74f-194f0c44af54	1ee4c37d-18a5-49b2-b0ea-59683c08c323	8a0f7a9d-fda3-43eb-97c5-369b3a2ac52f	0	\N	\N	2025-12-29 16:31:26.167938
1c2ab7ea-9b69-4f86-ba4d-38510de4a50e	51608bf6-00cb-401c-8d52-277068e91c6a	03aa6f04-8208-40e9-ae74-9f6c3aa71a78	0	\N	\N	2025-12-29 16:31:28.600026
1c5e1460-eee4-4976-bf0d-0310dda42a39	a3177ae6-e4a7-4f49-a4eb-40c3c7f8a616	c583a531-e16c-40df-8694-b52868b4b74f	0	\N	\N	2025-12-29 16:31:26.864263
1ca50415-0481-4c3d-85c7-a0833e6ad381	4a56e8cc-a3a2-490d-a9cb-d0dcad81566a	975c5df5-0586-4f04-b84d-be22ce5956cd	0	\N	\N	2025-12-29 16:31:26.984498
1d0a2ebf-5acf-4a96-af10-595c8633ffbb	ae0755a8-a20e-47b1-abf9-5fc6f7347139	e7882853-cc7a-4faa-adcc-ca1b29c661f9	0	\N	\N	2025-12-29 16:31:30.842331
1dc55970-5ad8-41c0-b34f-a282729b49da	e68c6def-f9fb-402e-8066-54a33bd5dd68	ef1450af-4946-4cca-8c69-b8e6ac026ac3	0	\N	\N	2025-12-29 16:31:20.112253
1dccf7ca-6fc6-48de-b44f-879f7e5e2d38	4a56e8cc-a3a2-490d-a9cb-d0dcad81566a	8467f635-2740-4777-b39b-280d34080905	0	\N	\N	2025-12-29 16:31:27.083967
1defe273-18d8-4e11-937b-320207597f8a	9e3b5733-9174-42c4-ae99-d7d15a640b2b	fc1f6782-df84-4b25-9f93-eb260f21018a	0	\N	\N	2025-12-29 16:31:27.447298
1ef7ebe7-061e-4baa-908d-d16c8121b83d	3f5b9f66-9803-4368-8dd4-eeb2b3f83dec	f252346e-a197-4a27-9836-34fb7e50bffd	0	\N	\N	2025-12-29 16:31:16.901701
1f2f2c87-01e0-4315-afc6-cac671909eb6	6921ef81-45c1-48a9-9e58-38fc2117ac58	539b46d3-0702-4d3a-8a05-6beff160a092	0	\N	\N	2025-12-29 16:31:17.493461
1f55d0b9-37ac-43ce-8cd1-e4901d49dff3	6965b15f-d56d-4014-b4dc-2296e0234ade	abc95b43-ba5c-43a4-9946-7190e458f953	0	\N	\N	2025-12-29 16:31:16.75046
201923c6-429d-4557-9d85-6089a1cbe36c	a8bb31d9-739f-4081-8a25-b8dfc1fbb1c3	3009160e-5f07-450d-a731-ce8bfb1683ea	0	\N	\N	2025-12-29 16:31:28.384197
214633d9-6a7c-44b1-a97a-b9500c3c7588	d2ee12d5-5848-48c2-91a6-ffc49270bca1	6812b606-b794-4227-a4ac-2084fa563655	0	\N	\N	2025-12-29 16:31:25.023571
2171c51c-11ea-46aa-a647-d269f24f5265	d2ee12d5-5848-48c2-91a6-ffc49270bca1	d46e7da8-4299-4bb8-840f-364823f42406	0	\N	\N	2025-12-29 16:31:25.200177
21de5fe3-aba0-4c9e-ae29-bdc93003cc66	13aac49d-554b-4ac5-8c78-ab6abc4a61c4	5fa4e123-d0a8-4e78-a27b-24c21fe856ed	0	\N	\N	2025-12-29 16:31:24.341216
21ef1b10-99b5-43ef-adbc-6acd9b397524	ef6fa562-d8aa-445e-a36e-4a5ef15d86ff	2305b11a-9a04-4bf4-8227-f14b846cd9da	0	\N	\N	2025-12-29 16:31:22.042583
2242293f-7fc6-43eb-9c40-d1f7c4b87515	963a9695-5acd-4162-aff2-03b33022cdd4	9ea9feb7-4bdf-40e7-ac99-f7d7d0969229	0	\N	\N	2025-12-29 16:31:18.993755
22587271-045f-48f4-afb8-2f16f88a22a5	6653dba6-6f95-4495-8e3a-3cc187266272	42f2ce5a-4446-461f-9bb6-dcaa636b90c9	0	\N	\N	2025-12-29 16:31:24.034018
235aa2ad-4805-4eb7-bad7-f6ab0a4c1938	1ee4c37d-18a5-49b2-b0ea-59683c08c323	bc84fece-9dc6-4241-87d8-a006e42023e3	0	\N	\N	2025-12-29 16:31:26.069107
23aeeb3d-53ce-4a08-a157-c41c4a4572ff	db12a4fc-6e43-473d-9239-c5fd59c33e3e	dd8ce14b-7b18-4673-a974-cbf78d659082	0	\N	\N	2025-12-29 16:31:22.876332
23e82a69-4d48-4c2f-a621-631270b7f0ce	20cbc50d-1aa5-4b6a-bbfc-80304fe0c544	883f5f91-3f16-4eab-8744-e519e45d256f	0	\N	\N	2025-12-29 16:31:22.490035
248d9156-d60b-407d-b949-cfa3c02b1b75	1ee4c37d-18a5-49b2-b0ea-59683c08c323	cc5b31d8-55c1-48c1-8b90-948dc0fb4624	0	\N	\N	2025-12-29 16:31:26.120477
2496916d-5f41-4b85-831c-0ef9f9e8d572	7915d38b-983d-4280-a2ce-1b1714d70ba6	09f233c6-9768-436e-896f-220370713add	0	\N	\N	2025-12-29 16:31:23.847958
249f946e-96c6-41c0-8e8e-9381e2d70994	6c49b75d-7641-4a73-8174-62a31a9e91d2	a76d5270-26c2-46f6-af85-4d3f892320e9	0	\N	\N	2025-12-29 16:31:22.669041
2532de6e-4933-4706-831e-feac6925b18a	a4675322-ed29-4968-8aba-2c803366d80e	12ffb31b-f46b-422f-9124-00f363f1ac7b	0	\N	\N	2025-12-29 16:31:29.546115
2558b0c7-ea5e-40dc-8055-45de216b39c8	098051ee-bc7c-4051-9883-a1b5165ec030	ae0755a8-a20e-47b1-abf9-5fc6f7347139	0	\N	\N	2025-12-29 16:31:30.409857
25b2d6cc-871a-4514-83ff-086d0a6ffd85	883f5f91-3f16-4eab-8744-e519e45d256f	3009160e-5f07-450d-a731-ce8bfb1683ea	0	\N	\N	2025-12-29 16:31:28.409894
25bfd5fc-7c20-4c73-b16a-f3a39451be33	6965b15f-d56d-4014-b4dc-2296e0234ade	8f87d17f-3cd4-42c0-b09f-f1f0cedb8584	0	\N	\N	2025-12-29 16:31:16.823959
25d069fb-1d67-45b0-9909-f51600f3d85e	2dce1a0b-11b9-41a7-827d-562234457252	13aac49d-554b-4ac5-8c78-ab6abc4a61c4	0	\N	\N	2025-12-29 16:31:16.997302
26449a8b-52e8-41e1-9216-807041e87f8a	1b91d97e-55a8-4c4f-9a72-dedf95ca2aed	03ad50e3-aa0b-4875-aefd-6c25e9ef1631	0	\N	\N	2025-12-29 16:31:17.304471
2682bff5-7401-41a7-a182-ee9376b65d6d	20979cb9-e457-4fdd-be3a-cf039754b7ab	0f4c9db3-f3fb-4909-8c3f-b294735a2b0f	0	\N	\N	2025-12-29 16:31:27.478303
26ac2508-6488-4208-9610-4cd4e40b0c46	99fe3a58-fd18-4de2-bcf6-0971b019fb65	45466f72-d5ec-416d-9721-622f34a814c1	0	\N	\N	2025-12-29 16:31:24.721612
273ce735-10bb-4e3a-bcc5-2db471c538a2	ee816f93-85ab-4827-ac7d-fb13f8a926df	cb190884-e061-4db9-8cc2-c0aa05378280	0	\N	\N	2025-12-29 16:31:17.536768
278ce4bf-7b8a-42b3-a311-e323d6bd231d	28283855-40a5-449c-8ae1-418bd57a1e69	66952afa-c95b-45d8-9de3-c61ecebda807	0	\N	\N	2025-12-29 16:31:27.774987
286f6e49-c2a8-494b-8e1e-ed35d526af4d	963a9695-5acd-4162-aff2-03b33022cdd4	098051ee-bc7c-4051-9883-a1b5165ec030	0	\N	\N	2025-12-29 16:31:18.85904
2884e16b-042d-4d32-92f3-f8d69dca9ad5	8f87d17f-3cd4-42c0-b09f-f1f0cedb8584	09f233c6-9768-436e-896f-220370713add	0	\N	\N	2025-12-29 16:31:23.874214
289dbef6-807e-4b75-a160-a92e3792a32d	cda43562-bfa2-4831-876f-36adfbf0e499	2aaf36b3-1784-43b1-af3d-db36fe7a5d84	0	\N	\N	2025-12-29 16:31:21.597684
28a9353f-8935-46ef-ba12-3ba948f7af24	1542491d-e953-45e9-8a81-53b2b8a5931f	c3b48982-c487-4f76-a575-2a6e889b03ca	0	\N	\N	2025-12-29 16:31:19.528632
291c84ff-4165-45bf-9d59-6f420c9894ee	a76d5270-26c2-46f6-af85-4d3f892320e9	ac7ead63-ff75-4624-839f-7561f79867fc	0	\N	\N	2025-12-29 16:31:29.097193
2a203cd9-6995-4915-ba0a-a3b53111cb66	cc5b31d8-55c1-48c1-8b90-948dc0fb4624	e860251a-9d40-4de4-9dcb-1b93469fdf0c	0	\N	\N	2025-12-29 16:31:26.32411
2bb3e3fa-b750-4483-a9a4-5fe302a7e766	d88c0ea1-6d59-418b-a938-2e6aa399ed22	1b4aa5c2-a13d-461c-b64b-38b6808a1609	0	\N	\N	2025-12-29 16:31:28.479714
2bb7f048-7654-4196-b17a-3d1c25955880	ac78fc6b-1bd3-4657-a9be-28941be581dd	56f64ff2-3752-44b6-bd7c-7dfb1042fe27	0	\N	\N	2025-12-29 16:31:22.103817
2cccacd3-8f52-43b5-9cce-6eaaa798bacb	d7467f95-6146-493e-b209-686878c3e641	e7882853-cc7a-4faa-adcc-ca1b29c661f9	0	\N	\N	2025-12-29 16:31:30.815985
2ccf5b25-83d8-4841-a4ed-f496c910377c	aa0ec19d-05fe-4c67-8462-5fc99badd90d	a2559eae-1de4-4ff0-9c8b-785fd86bf28d	0	\N	\N	2025-12-29 16:31:19.956159
2cd1ba38-ed54-4a10-a716-166712014338	d7467f95-6146-493e-b209-686878c3e641	7df9a2f8-36e9-42e2-b5a4-b3e3716e8848	0	\N	\N	2025-12-29 16:31:30.768797
2cedc04d-2dc2-4d07-a487-dd5adddb73a8	2dce1a0b-11b9-41a7-827d-562234457252	f43058ff-54b4-42b3-837e-57c08655f9f6	0	\N	\N	2025-12-29 16:31:17.147629
2d641c90-5632-4843-b7ee-f4f92097d79e	71baa9d5-46cd-4942-812e-2f49f5144350	6a845e8b-803e-4104-8c22-a74ea7b85e2a	0	\N	\N	2025-12-29 16:31:29.382465
2e27f7c5-288e-4408-8227-b113a22bcfd4	51608bf6-00cb-401c-8d52-277068e91c6a	1b4aa5c2-a13d-461c-b64b-38b6808a1609	0	\N	\N	2025-12-29 16:31:28.504904
2e83109b-1f5b-47e7-8ee2-6c44c17fe50f	99fe3a58-fd18-4de2-bcf6-0971b019fb65	e45421fd-a9ed-492d-8f70-1140742f562c	0	\N	\N	2025-12-29 16:31:25.126831
2ec59283-45f3-432f-84fe-d9bbfcf87775	62325283-63f0-4f68-84f9-f52a8c6cde69	e1911895-7775-491c-a755-ef8a5dbe337e	0	\N	\N	2025-12-29 16:31:20.674771
2f02bd66-cb70-4de1-963d-028587e39b48	49e5a66c-f97d-49cb-89a4-ec66a2423024	0831d51d-6c34-4e26-9cdc-eb57e0f4781c	0	\N	\N	2025-12-29 16:31:28.975862
2fac86de-c83d-4973-93ba-4cf07153d141	82cc8c14-bd9b-4002-836d-4d0b4a712a4d	13978df3-8535-4246-a604-3513619239cd	0	\N	\N	2025-12-29 16:31:20.340131
2fdd138d-47ca-407b-bbe8-ee394bfba940	a73b79fe-5694-45ee-99e5-55755fc11d06	7138116f-fa84-4bcc-93ef-b3965b68e28c	0	\N	\N	2025-12-29 16:31:28.906919
2fe3bf6e-295e-48ae-bf4e-cea17e235025	a76d5270-26c2-46f6-af85-4d3f892320e9	3431da17-9257-42f6-a88a-9d4e8d6eb946	0	\N	\N	2025-12-29 16:31:29.148046
2ff35935-e7da-4a77-87c1-468ac1866b2d	29a6853f-c91b-40d3-ab9a-0fa96762438c	064a8791-ed32-44d6-b911-e3ed3e818261	0	\N	\N	2025-12-29 16:31:18.353273
306ca223-20a7-4e85-8335-015ce92076c8	e68c6def-f9fb-402e-8066-54a33bd5dd68	5865b700-fea3-4e30-a02d-4e9347a7935e	0	\N	\N	2025-12-29 16:31:20.418445
30cda71b-07ad-479a-9e53-9300a6355722	4b1a8a5e-5892-451f-bb44-3b57cc638fae	c4961ae1-d224-4c65-b472-e11cf7517795	0	\N	\N	2025-12-29 16:31:23.416372
313f3ab1-6ae4-42d4-9d51-42a3269de927	da16a5f1-3899-4c27-b5fd-cc67e1eb6826	4a56e8cc-a3a2-490d-a9cb-d0dcad81566a	0	\N	\N	2025-12-29 16:31:24.695011
314c1576-a914-45a7-8231-97eeb86e3e6a	db12a4fc-6e43-473d-9239-c5fd59c33e3e	07859a4d-d5cf-4078-867a-53594e735c31	0	\N	\N	2025-12-29 16:31:23.050128
3238d2ff-b3d4-4b00-b442-a5280a24c9f4	9e233a52-68ac-4562-bed2-3fbae2aec730	f66d612b-8b5c-4c89-b4e2-bf67b591d566	0	\N	\N	2025-12-29 16:31:21.507155
325ec168-f5d1-4a56-92c3-2c4f9b42a252	8039b17f-3028-43be-9ba8-1c3498ef85a9	aa0ec19d-05fe-4c67-8462-5fc99badd90d	0	\N	\N	2025-12-29 16:31:16.590822
32638f45-9a13-45a4-819f-efc2d90c2e1d	ac78fc6b-1bd3-4657-a9be-28941be581dd	2c1bfeee-d425-4831-897b-f2274e085973	0	\N	\N	2025-12-29 16:31:22.146064
32a433e1-79b2-48cd-9c95-ce8d32657b68	a4675322-ed29-4968-8aba-2c803366d80e	5ce8f136-8175-4034-9249-4458b20c1cab	0	\N	\N	2025-12-29 16:31:29.655287
33a7e3c3-28a3-4396-bd97-d73530bb9a4a	cb3d8eb8-2628-4ee0-a199-97e0a7a530d1	15508ffe-69d5-4d0c-a776-c9859d138401	0	\N	\N	2025-12-29 16:31:18.737606
33e8468c-cb23-4ac3-9971-ba2ea247f386	8c6f490b-55da-45f3-b1f6-ae54dde406ef	d7efedae-b5ad-43b0-9086-6749206f7216	0	\N	\N	2025-12-29 16:31:30.554562
343c8ad0-57f8-4f96-86fe-0353a48de014	abc95b43-ba5c-43a4-9946-7190e458f953	43933a5b-7afd-4fff-a6fe-3d7aae8619df	0	\N	\N	2025-12-29 16:31:23.537266
3490c029-570a-481a-bd49-80d991ea1ffe	874fc067-a244-478a-ace5-0d352e439606	a0d28119-3e65-42d4-8f64-61ef2942b030	0	\N	\N	2025-12-29 16:31:22.90282
3513afaf-2e16-4471-9a07-c2408c535292	cab8e0bd-4e05-450b-bef7-4b8651d5295f	e45d13e2-7506-4a76-b530-ee69fd0eb2b1	0	\N	\N	2025-12-29 16:31:15.889413
35a7346e-7c88-41d4-be69-660150669753	a3177ae6-e4a7-4f49-a4eb-40c3c7f8a616	0932b7e4-1f7a-478e-9ec2-d57596a5b969	0	\N	\N	2025-12-29 16:31:26.818456
35c19f32-6bf7-440f-9d4f-aa909c4bfcbe	a73b79fe-5694-45ee-99e5-55755fc11d06	8e032a15-783b-40d2-8c8c-33aa63af9c63	0	\N	\N	2025-12-29 16:31:29.002783
362e5f97-1bbf-45f7-ba61-6083fe1cb233	d21ab576-80be-4b37-823e-25820fc9e16b	925b6cd7-e284-4d9a-9f84-aff837ea3a64	0	\N	\N	2025-12-29 16:31:23.602475
366159ee-d4d3-466e-9a81-ca62fd459b3f	1b91d97e-55a8-4c4f-9a72-dedf95ca2aed	2bfbbbb6-df60-48c1-9619-7bc9f565e18b	0	\N	\N	2025-12-29 16:31:16.539446
368fb751-e3f0-4f45-a0ec-7acc95f840cb	e7c9085f-4613-453d-8233-7171e2cf9609	56f64ff2-3752-44b6-bd7c-7dfb1042fe27	0	\N	\N	2025-12-29 16:31:22.128712
36a85956-b9b2-43a7-8103-8e5754574612	3f5b9f66-9803-4368-8dd4-eeb2b3f83dec	f32668a8-9c7c-412a-bbbd-77502615cb5f	0	\N	\N	2025-12-29 16:31:17.091827
37f1e98d-ac6d-4f9d-a883-b7f2cc8b0cee	8cd3209b-7b52-4a4c-a92a-1f8cd6b5e407	c738a843-0054-47cb-b491-d13f66b1893b	0	\N	\N	2025-12-29 16:31:21.805043
38659aef-877b-47de-941a-90ce4526c6f2	43ba5ec9-f935-4c0d-93c6-8beb676a3250	329a1d03-3aca-47f2-8490-a2c7348be885	0	\N	\N	2025-12-29 16:31:28.81263
3a32f19d-29bf-4451-9e9b-0c7c3af81590	29a6853f-c91b-40d3-ab9a-0fa96762438c	6b4bc1f2-f7fd-4ca8-bb35-7a14eabfa434	0	\N	\N	2025-12-29 16:31:18.266658
3b7a723c-6dbe-4b6c-9379-ae5382fb48b1	e68c6def-f9fb-402e-8066-54a33bd5dd68	13978df3-8535-4246-a604-3513619239cd	0	\N	\N	2025-12-29 16:31:20.367146
3b832397-98ce-4ea3-bff4-beb255f88c0c	9e3b5733-9174-42c4-ae99-d7d15a640b2b	0f4c9db3-f3fb-4909-8c3f-b294735a2b0f	0	\N	\N	2025-12-29 16:31:27.503889
3ba630f4-8a87-485d-a4bb-f5f256bdab3a	5b60b3c6-c57e-4b2c-bbb6-897f3052876b	81720561-a4a7-4054-96e4-02a89cf0c9ca	0	\N	\N	2025-12-29 16:31:30.88553
3c0704d0-60bb-42e5-a6b9-fec8fff08182	f20edf06-3e22-4d9d-a1c9-82d8dbd50b52	20979cb9-e457-4fdd-be3a-cf039754b7ab	0	\N	\N	2025-12-29 16:31:18.292443
3cef6a6b-19c5-441d-8cf1-df5f4cee5ad3	f32668a8-9c7c-412a-bbbd-77502615cb5f	49d29a10-f412-473b-8f8f-3a859cba6995	0	\N	\N	2025-12-29 16:31:20.868237
3d9532ba-bbf8-4c48-9dfd-2ef4798bb5c6	e35a59c7-dd2c-4085-88ab-345a2978d6bd	c3b48982-c487-4f76-a575-2a6e889b03ca	0	\N	\N	2025-12-29 16:31:19.5024
3d9c2489-93ef-45f7-b835-58a6b9887eb7	963a9695-5acd-4162-aff2-03b33022cdd4	6ce83efc-05d0-4c17-9d54-8f9eae1c0c63	0	\N	\N	2025-12-29 16:31:18.953999
3ddf22b9-dd48-4bcb-917e-830eadbdf006	77759e69-6fc4-4eeb-b591-751f3ca36f68	539b46d3-0702-4d3a-8a05-6beff160a092	0	\N	\N	2025-12-29 16:31:17.511026
3e4ad0bb-6c8b-45b3-a8ae-44628fbca9f5	b610bb22-f766-4f82-b792-f7fbb2f7003b	f6abe729-f7dd-45da-8c31-9be811832569	0	\N	\N	2025-12-29 16:31:19.16564
3e5ee9f1-8df9-45c5-a4c6-4f311a374e32	00c6c827-308e-4a6e-88c9-83cf391d2881	98056226-655c-4f92-8216-199573920cd7	0	\N	\N	2025-12-29 16:31:18.659787
3eba414e-b44e-4bf9-9351-28d3f1f524bb	68641213-079d-4200-80e0-437391610deb	b2bea596-1fcc-4a7f-a6d7-fc9a0d26e265	0	\N	\N	2025-12-29 16:31:22.79013
3f0eb8b0-77fb-42ee-ad2c-1f051b82a401	03ad50e3-aa0b-4875-aefd-6c25e9ef1631	3d0b6753-d73b-47d0-bcf4-af4787487323	0	\N	\N	2025-12-29 16:31:20.936549
3f38933b-e53d-47d8-a194-933b88f1ada1	883f5f91-3f16-4eab-8744-e519e45d256f	188b6de4-b9c3-4bc4-9af7-b00278731ddb	0	\N	\N	2025-12-29 16:31:28.35825
3f938f2e-832f-49d8-bf12-cffc6970d592	3c042938-82b4-4060-92c3-6762366c5e4c	12bf3ef5-8a0d-42a0-8f68-fe9ce2113dde	0	\N	\N	2025-12-29 16:31:25.869844
3ffbbf9c-30ca-4368-a20b-c134ce2e9845	63f661ac-75e0-4aae-a1aa-879128891215	86247581-25d4-4736-a2b4-9d8e62e0afbd	0	\N	\N	2025-12-29 16:31:29.572805
40825f0b-7ee8-4b0c-9472-e7957aba18c3	e45d13e2-7506-4a76-b530-ee69fd0eb2b1	ffa02956-07ed-4b37-a8cd-b23414c2b81e	0	\N	\N	2025-12-29 16:31:16.482676
4105163e-a53d-43fd-8e33-e920e3596522	975c5df5-0586-4f04-b84d-be22ce5956cd	95e11722-dda6-4ba8-88c4-e68494398ecf	0	\N	\N	2025-12-29 16:31:27.278312
410e09c5-53a6-4472-994a-5de056735176	9235266f-7ffa-492b-b318-795465417e73	f66d612b-8b5c-4c89-b4e2-bf67b591d566	0	\N	\N	2025-12-29 16:31:21.52453
41220308-bae5-4b40-9823-0c73afd6ed2c	07875362-d8ee-4928-86ac-7aecb98a86d6	f43058ff-54b4-42b3-837e-57c08655f9f6	0	\N	\N	2025-12-29 16:31:17.165129
41adcf75-796a-41e2-b62c-69499a53043a	5ee5eb1b-6f3f-469c-91b6-1c5300da8f71	088cc246-a351-465e-b820-60b56fe2263e	0	\N	\N	2025-12-29 16:31:21.330224
41b91ae5-f783-45e7-a984-c4e5f0b5460a	138eea36-2263-4093-9a21-dd6aeb846450	de21836e-36a4-4655-b204-d32aed148699	0	\N	\N	2025-12-29 16:31:21.94724
42241b83-dd4a-4aae-8282-01ac752fb0fe	43ba5ec9-f935-4c0d-93c6-8beb676a3250	dcfb3ecf-2e43-4c4f-a6bd-6ca52405380e	0	\N	\N	2025-12-29 16:31:28.677839
42b7fb60-5173-492d-a147-dd1e18549f66	74b38e76-dfbe-409b-ba03-f39025b6de2b	e1911895-7775-491c-a755-ef8a5dbe337e	0	\N	\N	2025-12-29 16:31:20.695029
42e3c057-83c3-4cfe-94fa-452fd0e819e3	8206cda8-fa63-444c-a163-cca7b9db0620	1cef3beb-2d1b-4136-a805-285df0f81366	0	\N	\N	2025-12-29 16:31:16.062961
439186a5-fc09-4842-a7b9-f814d5ddf881	1b91d97e-55a8-4c4f-9a72-dedf95ca2aed	1542491d-e953-45e9-8a81-53b2b8a5931f	0	\N	\N	2025-12-29 16:31:16.651531
43a5c81e-0c0c-4d7a-9d86-9ea5ac1ff29a	8f4c4dff-b017-4a1d-b563-6bfcaba29a1d	061cfd7d-2c8c-4ced-8b74-8257d83220ef	0	\N	\N	2025-12-29 16:31:23.442142
45060861-1dcc-4d21-a11f-387665f5cab3	abc95b43-ba5c-43a4-9946-7190e458f953	e9f03b18-e18e-448d-b431-48adc339cf9b	0	\N	\N	2025-12-29 16:31:23.494134
47031762-0217-4913-8377-877b7137f5d6	9649dc43-7677-454a-acdb-68adf33bbce3	cfcdeebb-3b56-4553-904f-397f374b92a8	0	\N	\N	2025-12-29 16:31:16.197774
47938523-1ac0-4da7-9ffc-48789f60b292	f11fb6cb-ece0-4e4d-bb86-fb57e0154ff2	ad99bb72-4ede-4dda-8a06-91aeed3e4683	0	\N	\N	2025-12-29 16:31:28.081845
48c3558a-a651-4f37-bf95-66dd3bf2edce	1d3b4207-a170-4014-80db-d5a1b76f0035	f20edf06-3e22-4d9d-a1c9-82d8dbd50b52	0	\N	\N	2025-12-29 16:31:23.938958
48da0cb9-1376-41c9-a516-0547a4690a66	58eeabb9-73a6-42d1-a743-49ec8debfcb5	8a0a9041-138d-401a-9388-4c09f183c103	0	\N	\N	2025-12-29 16:31:28.151394
49e3c7ad-6cf3-446f-8d23-60ac3d2002f2	1ee4c37d-18a5-49b2-b0ea-59683c08c323	43f290d1-145d-4a30-b375-fe7d58e9406e	0	\N	\N	2025-12-29 16:31:26.220264
4b7b69e4-163d-4927-9714-eca48fc52dfc	ae0755a8-a20e-47b1-abf9-5fc6f7347139	4a6d22c2-43f0-490c-bbfa-f0c187ec77d5	0	\N	\N	2025-12-29 16:31:30.744288
4ced78cc-ff0d-48ad-9f0a-00a8df427614	f6abe729-f7dd-45da-8c31-9be811832569	9ec8c2ad-7a10-4e0d-b22c-dbf241a5e84c	0	\N	\N	2025-12-29 16:31:26.490057
4d06b1b3-3585-499b-b1d9-5e1e351c41f6	0831d51d-6c34-4e26-9cdc-eb57e0f4781c	e296e3ad-4772-4d8b-a76d-b653912d2029	0	\N	\N	2025-12-29 16:31:29.071366
4d42018a-8fa2-48c2-b8c7-872cf4354c5d	6653dba6-6f95-4495-8e3a-3cc187266272	a3177ae6-e4a7-4f49-a4eb-40c3c7f8a616	0	\N	\N	2025-12-29 16:31:23.990474
4daf1ff3-6a4d-415d-9c13-5cebc247cbad	138eea36-2263-4093-9a21-dd6aeb846450	fd11fd84-1e42-4d38-ad83-796210bfdd71	0	\N	\N	2025-12-29 16:31:21.822178
4deeada0-1258-4529-b290-5f78350e77a1	e68c6def-f9fb-402e-8066-54a33bd5dd68	b5f48e56-c241-419c-8a6e-376e7ee236a7	0	\N	\N	2025-12-29 16:31:20.163383
4f793c81-74f1-4b2d-8160-e79aa03aedfd	6653dba6-6f95-4495-8e3a-3cc187266272	c3ebb6f6-de02-4b1a-8f71-fbd3c26eae45	0	\N	\N	2025-12-29 16:31:24.124896
4ffc0dd7-cf61-48ec-abb3-886f5300e992	14047663-ef1d-431b-ae46-d289abae2411	a4e1763e-23f3-4b7f-bb31-16d23e30ee97	0	\N	\N	2025-12-29 16:31:17.35543
5092c85e-c4a0-4853-b2ef-6137574a6af6	34f7930c-ebe4-4369-8697-a133297bab81	ae0755a8-a20e-47b1-abf9-5fc6f7347139	0	\N	\N	2025-12-29 16:31:30.466239
509935e4-dc99-4c7f-b969-454ce1eac1c2	99fe3a58-fd18-4de2-bcf6-0971b019fb65	6812b606-b794-4227-a4ac-2084fa563655	0	\N	\N	2025-12-29 16:31:25.005655
50a78b39-f8d8-40b7-9f23-99d29cadb46d	29a6853f-c91b-40d3-ab9a-0fa96762438c	20979cb9-e457-4fdd-be3a-cf039754b7ab	0	\N	\N	2025-12-29 16:31:18.309898
50a9fe05-59c4-474a-aa09-251b2fe302c7	e35a59c7-dd2c-4085-88ab-345a2978d6bd	ca7e271a-b330-40d5-98c1-17cba2b22e3a	0	\N	\N	2025-12-29 16:31:19.282026
50b737cc-1773-4265-91dd-90507f8f84d4	b610bb22-f766-4f82-b792-f7fbb2f7003b	c8d20780-df3f-439b-a60f-b36d79bc2f77	0	\N	\N	2025-12-29 16:31:19.217495
511d8e26-cf58-4ee1-956e-55484314c6dc	a8bb31d9-739f-4081-8a25-b8dfc1fbb1c3	7bf610c8-5a1b-4c9e-91e5-49d7c7bccc0a	0	\N	\N	2025-12-29 16:31:28.427888
51d3d4cc-94b0-4717-8d0a-481d5fae73b1	ae0755a8-a20e-47b1-abf9-5fc6f7347139	7df9a2f8-36e9-42e2-b5a4-b3e3716e8848	0	\N	\N	2025-12-29 16:31:30.794698
51f2c9d1-81a4-4473-9e72-34811f9fbc7c	b16e1013-de3c-4876-8f2d-41033e1ffb28	8a0a9041-138d-401a-9388-4c09f183c103	0	\N	\N	2025-12-29 16:31:28.125115
524e2fd3-83af-43cb-8a55-d3c74ef28efa	e1b7b70c-bd56-42e3-8464-e04327fc62c4	b610bb22-f766-4f82-b792-f7fbb2f7003b	0	\N	\N	2025-12-29 16:31:17.968769
5320b091-fa0c-402a-8684-344747ff9b13	01e7143e-e7d9-4723-976d-4e9e92ea06c5	da68554d-b7cb-46e5-b8ac-f01a7cbfa835	0	\N	\N	2025-12-29 16:31:30.66981
54ad9ae6-09ed-4e5c-886e-8c8208d61b00	bbc3495b-afe0-4294-958a-a8d0560b5ff8	017d1edf-10bc-4320-8210-582b501ee7c6	0	\N	\N	2025-12-29 16:31:28.029852
55131be5-dc22-4990-beff-d3f6d12c8155	ee87be0a-b544-47ca-b093-4b168fbd9532	5faf0d74-97e9-4988-b6f1-333a4d088bbf	0	\N	\N	2025-12-29 16:31:21.131342
57082e2a-d672-44d5-83c1-2b1e569895c9	f738e1ee-e9f7-49c8-91a5-31f9b9564754	2dd91d5e-4a66-40c9-8ca9-aace4c4ac02a	0	\N	\N	2025-12-29 16:31:26.543884
5748eb2a-5669-4297-8c2e-245f506845a5	2963f2eb-a41a-4ccb-9e7f-f99cee15ed7c	132eb7da-a33c-4e34-80cc-931304148855	0	\N	\N	2025-12-29 16:31:17.416504
576a3acc-eb01-4129-9714-41142131081c	68641213-079d-4200-80e0-437391610deb	b1d2b30a-32a3-4db8-9927-6a212b2a79a0	0	\N	\N	2025-12-29 16:31:22.833177
579380bb-4a18-4d76-9197-414ca4fcddc2	f6abe729-f7dd-45da-8c31-9be811832569	fcf6790a-800a-4dbd-a6b1-d33a7cd50ca4	0	\N	\N	2025-12-29 16:31:26.396912
579d05ab-196d-4690-8d5f-4518ff92a89f	2dce1a0b-11b9-41a7-827d-562234457252	df60a1ec-ab32-45b2-9ca2-93f7926ffa96	0	\N	\N	2025-12-29 16:31:16.77723
57a3c203-58dc-4443-97f2-e5dad895f50e	ee816f93-85ab-4827-ac7d-fb13f8a926df	5b60b3c6-c57e-4b2c-bbb6-897f3052876b	0	\N	\N	2025-12-29 16:31:17.723838
5871235d-2514-4713-9903-3ac70b1b849f	ffa02956-07ed-4b37-a8cd-b23414c2b81e	a174a146-486c-4fe0-9643-a152153d1b27	0	\N	\N	2025-12-29 16:31:24.638968
58806164-1e04-4c05-90ff-53c34bcd429f	20cbc50d-1aa5-4b6a-bbfc-80304fe0c544	41ab25c4-81ea-46f0-8ec7-82f30f270160	0	\N	\N	2025-12-29 16:31:22.397783
5894ab75-cbc1-4eb2-9c12-b67329b64bfa	ee816f93-85ab-4827-ac7d-fb13f8a926df	d7467f95-6146-493e-b209-686878c3e641	0	\N	\N	2025-12-29 16:31:17.774438
5a4f2a0b-1f4d-4752-a52d-69d81383635c	138eea36-2263-4093-9a21-dd6aeb846450	66c8f4e7-94fa-4ff6-b592-07e5ad89ed22	0	\N	\N	2025-12-29 16:31:21.865223
5ad85e0a-f0a9-435a-aa78-169c2c30d604	2dce1a0b-11b9-41a7-827d-562234457252	f252346e-a197-4a27-9836-34fb7e50bffd	0	\N	\N	2025-12-29 16:31:16.881351
5adc0a8c-2291-4a7d-b981-417ee9d0ea22	62325283-63f0-4f68-84f9-f52a8c6cde69	8648c111-f28f-4f0f-9dec-8d88f3455274	0	\N	\N	2025-12-29 16:31:20.487369
5ae21032-be01-4f9d-aea0-351de6b78f9d	13aac49d-554b-4ac5-8c78-ab6abc4a61c4	898cfffd-6302-4f0a-99fa-63ab41e07dc1	0	\N	\N	2025-12-29 16:31:24.102895
5b21f9e6-212c-4934-b684-00b74696f829	288bfc15-ead3-401d-9bee-e2f5edc370b4	0f4c1e01-0dfe-4844-b592-2ac4bb3c9243	0	\N	\N	2025-12-29 16:31:29.986724
5b4ff941-e3d1-4b20-919c-10806c5c2c3e	ee816f93-85ab-4827-ac7d-fb13f8a926df	5998a405-ab45-42d0-a51e-767985fd8fa7	0	\N	\N	2025-12-29 16:31:17.645237
5b8dc4b0-d172-4263-86db-a166f83c1d75	8c6f490b-55da-45f3-b1f6-ae54dde406ef	da68554d-b7cb-46e5-b8ac-f01a7cbfa835	0	\N	\N	2025-12-29 16:31:30.695194
5bb3b427-108d-479c-8b76-89d8ed87eaf4	8815f86f-febd-4639-bd1d-0e946afa280b	d8ade05c-ef45-4ad8-b8f1-7a67431d667e	0	\N	\N	2025-12-29 16:31:25.792492
5c284411-9bea-4369-8d18-16cd16cdf288	13aac49d-554b-4ac5-8c78-ab6abc4a61c4	4630f7f8-db26-46df-93c5-1b8ff2d74445	0	\N	\N	2025-12-29 16:31:24.293213
5cf1d37b-1d25-486a-a92c-1dbc41d36d5f	34f7930c-ebe4-4369-8697-a133297bab81	a8da5c60-9950-4a61-8bdb-01251affa1b9	0	\N	\N	2025-12-29 16:31:30.333415
5d1a2f5a-f6d3-4eeb-b54e-565333d8ce1c	8206cda8-fa63-444c-a163-cca7b9db0620	9649dc43-7677-454a-acdb-68adf33bbce3	0	\N	\N	2025-12-29 16:31:15.947829
5d91798a-9ddc-4acb-83e6-34074cf2567e	cb190884-e061-4db9-8cc2-c0aa05378280	ce3ba4b4-7942-43bc-8a09-16f662ff7542	0	\N	\N	2025-12-29 16:31:29.757909
5f31cbb5-70db-4836-8992-ab07cd54ebe2	b9b13aae-11e6-4e84-b1f2-b57d2918d3d5	2c73a45a-44ea-43e5-a2d8-4b43cd9aac4f	0	\N	\N	2025-12-29 16:31:27.750142
5fd02434-893f-420f-8e55-81b97427ee8c	8815f86f-febd-4639-bd1d-0e946afa280b	f8215677-c02c-4e9a-ad7d-931d8facb1cc	0	\N	\N	2025-12-29 16:31:25.947774
609faa90-5b5f-4c08-ab17-4264aa5268ff	113a3b6b-bc1d-4189-a5be-ff0f4b6da898	c7fb008f-02f4-424c-ba55-b6dfbacec930	0	\N	\N	2025-12-29 16:31:30.081539
60f2207d-8845-4547-965a-fd4e5f7d6cbe	a8bb31d9-739f-4081-8a25-b8dfc1fbb1c3	f9e4938d-5c2d-4827-b9d9-d6962aec538e	0	\N	\N	2025-12-29 16:31:28.280723
6148af23-2fbb-43aa-8e83-f0ea95964128	d2ee12d5-5848-48c2-91a6-ffc49270bca1	e45421fd-a9ed-492d-8f70-1140742f562c	0	\N	\N	2025-12-29 16:31:25.153212
61596406-bec7-4ca6-84cd-f52a21dad1a8	5e856554-dfb5-4657-9265-01096f0f6451	2aaf36b3-1784-43b1-af3d-db36fe7a5d84	0	\N	\N	2025-12-29 16:31:21.580224
61dd782e-0860-4cc0-a83c-c4cf09b14b5b	fd11fd84-1e42-4d38-ad83-796210bfdd71	7726dceb-4193-4202-a422-f39aa003c3c6	0	\N	\N	2025-12-29 16:31:29.490775
61e5365e-0902-4a27-b88c-3abed44a00aa	03ad50e3-aa0b-4875-aefd-6c25e9ef1631	b73dbd91-9da4-45d2-b76e-b35376828646	0	\N	\N	2025-12-29 16:31:21.024698
62253d11-f140-41b0-b6dd-4676f4e1b5eb	e45d13e2-7506-4a76-b530-ee69fd0eb2b1	6653dba6-6f95-4495-8e3a-3cc187266272	0	\N	\N	2025-12-29 16:31:16.358212
6263636e-84b9-4264-b7a7-f302acb0812b	a3177ae6-e4a7-4f49-a4eb-40c3c7f8a616	975c5df5-0586-4f04-b84d-be22ce5956cd	0	\N	\N	2025-12-29 16:31:26.967173
628ca50c-3392-4099-82ee-dfc0d6d53fa0	1542491d-e953-45e9-8a81-53b2b8a5931f	e8b6f8e0-7503-4834-b07a-7501aec4aac9	0	\N	\N	2025-12-29 16:31:19.383218
62cbff80-c358-4cff-926a-4aed4b54a9d5	3c042938-82b4-4060-92c3-6762366c5e4c	f8215677-c02c-4e9a-ad7d-931d8facb1cc	0	\N	\N	2025-12-29 16:31:25.92364
62d77fd9-88d2-4d66-8259-8d1f8fc5a77e	e1b7b70c-bd56-42e3-8464-e04327fc62c4	e7c9085f-4613-453d-8233-7171e2cf9609	0	\N	\N	2025-12-29 16:31:18.072512
633d2a7e-a344-460d-9e27-68dca2e650ec	a3177ae6-e4a7-4f49-a4eb-40c3c7f8a616	6b426b41-4463-4f26-af7b-91c5c103df83	0	\N	\N	2025-12-29 16:31:27.006239
6392cc29-d1d6-4941-a1c5-b687e3e85cf3	cfcdeebb-3b56-4553-904f-397f374b92a8	132eb7da-a33c-4e34-80cc-931304148855	0	\N	\N	2025-12-29 16:31:17.433017
64d1347f-87c5-43d2-a825-15836b5e0153	9e3b5733-9174-42c4-ae99-d7d15a640b2b	d84a5ca2-0f0f-4a2f-9522-d3507f95ebde	0	\N	\N	2025-12-29 16:31:27.651652
6637dddf-e8e3-42c9-b539-486835cae707	1d3b4207-a170-4014-80db-d5a1b76f0035	ffa02956-07ed-4b37-a8cd-b23414c2b81e	0	\N	\N	2025-12-29 16:31:16.46621
669b922f-41fe-4264-990c-9e37d59fa1a7	07875362-d8ee-4928-86ac-7aecb98a86d6	6a128c37-f273-4914-999f-3d2b4b9e1443	0	\N	\N	2025-12-29 16:31:17.193909
66c2264f-221a-400c-ad46-2f9b104b5684	82cc8c14-bd9b-4002-836d-4d0b4a712a4d	9be2e68a-9266-4a0e-a103-ba446735f2dd	0	\N	\N	2025-12-29 16:31:20.033529
66fdecab-36db-4506-b117-307c516fb5bb	a8bb31d9-739f-4081-8a25-b8dfc1fbb1c3	28e0e0d9-ff42-4392-a80e-2f899f7e7fe8	0	\N	\N	2025-12-29 16:31:28.226071
679f3021-743f-4488-ad11-973b2be69521	9235266f-7ffa-492b-b318-795465417e73	8cd3209b-7b52-4a4c-a92a-1f8cd6b5e407	0	\N	\N	2025-12-29 16:31:21.56317
67bcab04-eb72-410f-bf0f-6e9b2464927a	32e2834a-d60d-499c-a626-ae1c23b3dcf1	a174a146-486c-4fe0-9643-a152153d1b27	0	\N	\N	2025-12-29 16:31:24.621432
67f67fa3-59d4-4d89-a7fc-7142cfa23f5d	4418e04b-2f6e-4196-a0a1-57584f714f60	79fb0e06-dbb5-4d11-bacd-e332b736d1c6	0	\N	\N	2025-12-29 16:31:25.675525
6807ea33-c0f3-4f25-90d2-94ba85959326	4a56e8cc-a3a2-490d-a9cb-d0dcad81566a	18d51473-0cfe-4776-ac02-c89fb2d29087	0	\N	\N	2025-12-29 16:31:27.188271
68677402-f060-4110-9f02-18201d1a4dd8	5ee5eb1b-6f3f-469c-91b6-1c5300da8f71	f99f8826-c8b7-4ed9-a3a4-3f805cedbc1d	0	\N	\N	2025-12-29 16:31:21.243216
68e67a2f-29fc-4c55-a659-8df24ac74c3d	43ba5ec9-f935-4c0d-93c6-8beb676a3250	efa08ac8-e46c-4928-915f-f6770536ec25	0	\N	\N	2025-12-29 16:31:28.720931
68f4316e-1f5f-433b-8835-1d9b3a6adc5f	2dce1a0b-11b9-41a7-827d-562234457252	abc95b43-ba5c-43a4-9946-7190e458f953	0	\N	\N	2025-12-29 16:31:16.72507
69544eb9-7e8a-420c-9137-6a423995afe9	2dce1a0b-11b9-41a7-827d-562234457252	f9e95815-2b58-46ce-ad03-39d332808875	0	\N	\N	2025-12-29 16:31:17.031267
69643e47-e130-4e89-ac7f-9ca7c1df5a7a	56f64ff2-3752-44b6-bd7c-7dfb1042fe27	6910f824-c647-4e09-8407-0a74245d41f2	0	\N	\N	2025-12-29 16:31:26.612863
69e62d36-19ab-425e-a5c2-d1e0c41b3f7d	82cc8c14-bd9b-4002-836d-4d0b4a712a4d	5865b700-fea3-4e30-a02d-4e9347a7935e	0	\N	\N	2025-12-29 16:31:20.392315
6a23c734-269a-4527-8130-ec5f287ab165	b2172455-58f5-416c-bfc5-a1f2b6caff88	e11c4b99-c61e-48d4-a36b-8fa1b9562e0a	0	\N	\N	2025-12-29 16:31:23.710284
6a403bdf-0b55-4c20-9529-51d471a7f5ae	14047663-ef1d-431b-ae46-d289abae2411	66bfe7b7-2c8c-4cf5-ae84-8b348fe68cbd	0	\N	\N	2025-12-29 16:31:17.216871
6a68c728-4b86-4122-a701-b0f5dafd7c88	9e3b5733-9174-42c4-ae99-d7d15a640b2b	28283855-40a5-449c-8ae1-418bd57a1e69	0	\N	\N	2025-12-29 16:31:27.409257
6aea55cd-5a24-4fe2-b660-1dadb2239372	2bfbbbb6-df60-48c1-9619-7bc9f565e18b	eec20b24-1f08-4f5a-847e-ae689a7df272	0	\N	\N	2025-12-29 16:31:19.68815
6bc343bb-70a6-439f-ae06-b645fe35259a	ee816f93-85ab-4827-ac7d-fb13f8a926df	a4675322-ed29-4968-8aba-2c803366d80e	0	\N	\N	2025-12-29 16:31:17.610276
6bf5d4d2-2729-44e6-9af5-1f65c988c155	20979cb9-e457-4fdd-be3a-cf039754b7ab	d84a5ca2-0f0f-4a2f-9522-d3507f95ebde	0	\N	\N	2025-12-29 16:31:27.623798
6c50e249-9dd5-44b2-8ab8-8212b4cc95a6	34f7930c-ebe4-4369-8697-a133297bab81	07fe499f-7066-4230-8ea7-3f80edf4d549	0	\N	\N	2025-12-29 16:31:30.280598
6c82d7ea-69c4-4c5f-8a8a-4396c6fbf4a6	f43058ff-54b4-42b3-837e-57c08655f9f6	0b7a58ff-cd04-48fd-b62d-f53a449e3d0c	0	\N	\N	2025-12-29 16:31:22.518538
6d18cf76-287d-4fa4-831a-2079fc101a2d	03ad50e3-aa0b-4875-aefd-6c25e9ef1631	8b3026e0-921c-4f17-970e-f2ec5724fc51	0	\N	\N	2025-12-29 16:31:20.980312
6d1b9c39-8295-4cae-b8ff-14fb45598375	d21ab576-80be-4b37-823e-25820fc9e16b	e9f03b18-e18e-448d-b431-48adc339cf9b	0	\N	\N	2025-12-29 16:31:23.511658
6d1f45e7-2e22-4b09-a088-0006d2eb9b08	ac5fe8ed-d1c4-4ac8-bc93-ec9a906d5f7d	6ce83efc-05d0-4c17-9d54-8f9eae1c0c63	0	\N	\N	2025-12-29 16:31:18.927085
6e2ccee9-474d-4e97-998e-b3e33004fa50	13aac49d-554b-4ac5-8c78-ab6abc4a61c4	c3ebb6f6-de02-4b1a-8f71-fbd3c26eae45	0	\N	\N	2025-12-29 16:31:24.150438
6e7461f3-f2eb-4f53-a4d2-e0a06ba1b095	9649dc43-7677-454a-acdb-68adf33bbce3	6921ef81-45c1-48a9-9e58-38fc2117ac58	0	\N	\N	2025-12-29 16:31:16.117418
6f4af7a8-1f24-40c5-8ee7-523bad8a9c3c	8e032a15-783b-40d2-8c8c-33aa63af9c63	91460bc8-a143-40f4-96ad-b94328ca5d9f	0	\N	\N	2025-12-29 16:31:29.213499
6fb88308-2e60-46a0-b014-31b152d4e164	f20edf06-3e22-4d9d-a1c9-82d8dbd50b52	6b4bc1f2-f7fd-4ca8-bb35-7a14eabfa434	0	\N	\N	2025-12-29 16:31:18.245357
6ffb1371-8c1a-4e14-8652-93e896fdfcb3	e1b7b70c-bd56-42e3-8464-e04327fc62c4	43034613-869a-4c09-ac18-a854a35fe9a6	0	\N	\N	2025-12-29 16:31:18.176908
6ffdcfb1-8e97-46fe-a734-66e05f9d3be8	f32668a8-9c7c-412a-bbbd-77502615cb5f	393d1cc4-7f44-40f9-868d-45d24c13d636	0	\N	\N	2025-12-29 16:31:20.737883
706e503b-3f6d-48b1-a568-24e210536f7f	8039b17f-3028-43be-9ba8-1c3498ef85a9	1542491d-e953-45e9-8a81-53b2b8a5931f	0	\N	\N	2025-12-29 16:31:16.669391
710af47a-b8df-42bc-901b-7a60ad9a7759	b2172455-58f5-416c-bfc5-a1f2b6caff88	3c042938-82b4-4060-92c3-6762366c5e4c	0	\N	\N	2025-12-29 16:31:23.665288
7127a407-9457-4b05-bac5-d5051b830490	822cc8a5-c22d-4a68-9375-662ea3b2dfc6	9a1d400a-0dee-4bb9-93d9-a74f15f3cb98	0	\N	\N	2025-12-29 16:31:19.022728
712ab16c-283e-4b78-8882-29201d8fca8a	43034613-869a-4c09-ac18-a854a35fe9a6	8c370e5c-63ad-46a4-96ae-be21a5ea8683	0	\N	\N	2025-12-29 16:31:19.257034
71906955-bf39-4509-9d8f-628c355a323d	71baa9d5-46cd-4942-812e-2f49f5144350	83050d08-4624-4abf-9565-2344da76d757	0	\N	\N	2025-12-29 16:31:29.425644
724f3bfa-b219-44ff-afe4-2e313938d932	cb190884-e061-4db9-8cc2-c0aa05378280	bbf75e1b-d67c-40b9-b369-05ad4de6ea65	0	\N	\N	2025-12-29 16:31:29.80954
7304406b-d563-402b-a6fb-47a07bb72ce8	ffa02956-07ed-4b37-a8cd-b23414c2b81e	34eccca2-e723-4e34-a2b2-5ee11a0ed4f1	0	\N	\N	2025-12-29 16:31:24.392397
74356501-0bfe-43ec-8e99-14a95e81fb6a	ffa02956-07ed-4b37-a8cd-b23414c2b81e	9588ae77-fb61-481a-95fe-d44540d9c0c9	0	\N	\N	2025-12-29 16:31:24.49761
747fa81c-6d88-47bb-971f-386e4ca49eaf	f252346e-a197-4a27-9836-34fb7e50bffd	5f41b7a1-b5ac-4cf3-ad82-3735b1f050f4	0	\N	\N	2025-12-29 16:31:27.922183
74d7a5cb-9843-43a0-a7c7-099605c16a89	1542491d-e953-45e9-8a81-53b2b8a5931f	20652c23-0026-494e-91c8-5ab698cc4aec	0	\N	\N	2025-12-29 16:31:19.442243
75118ba2-29f9-4df6-9c49-d33870ddcac1	288bfc15-ead3-401d-9bee-e2f5edc370b4	3a2fafe3-0d71-40b5-b2c4-bd9e1b159f3c	0	\N	\N	2025-12-29 16:31:29.934731
756d872d-0fff-46a7-923b-82d8cd539725	1d3b4207-a170-4014-80db-d5a1b76f0035	6653dba6-6f95-4495-8e3a-3cc187266272	0	\N	\N	2025-12-29 16:31:16.340023
75961f72-0f0b-43ef-9fc4-5f25a0d61458	aa0ec19d-05fe-4c67-8462-5fc99badd90d	1ee4c37d-18a5-49b2-b0ea-59683c08c323	0	\N	\N	2025-12-29 16:31:19.860952
75f6df0f-8be7-45ba-b83b-db27a6e62aef	db12a4fc-6e43-473d-9239-c5fd59c33e3e	8080f304-88e7-4326-89c8-5708d13fbcf0	0	\N	\N	2025-12-29 16:31:23.088807
76340644-948b-4263-a547-f347bcbaeb67	41ab25c4-81ea-46f0-8ec7-82f30f270160	dcfb3ecf-2e43-4c4f-a6bd-6ca52405380e	0	\N	\N	2025-12-29 16:31:28.694982
76712664-a060-4526-b82a-0cff1dea0c31	07859a4d-d5cf-4078-867a-53594e735c31	0398475a-18bc-4a9b-b099-b4994a38070e	0	\N	\N	2025-12-29 16:31:26.042833
771c7b42-720c-494a-b6c1-393f3737d9fa	62856f54-242c-4f67-8220-cb451ce52031	100e3388-7500-4115-b127-a133e69aad3f	0	\N	\N	2025-12-29 16:31:25.312689
773e41d8-ec30-4446-b3d4-9a4d85868aa3	e44cd487-3c0b-438c-819e-462bc3480ef1	f6feaafe-2930-415a-877d-49f9265fb8d2	0	\N	\N	2025-12-29 16:31:18.392331
77756c67-26c0-4c72-a803-3acd434b17fe	1542491d-e953-45e9-8a81-53b2b8a5931f	7915d38b-983d-4280-a2ce-1b1714d70ba6	0	\N	\N	2025-12-29 16:31:19.623412
7783993b-e591-4880-95af-4367086f5638	20979cb9-e457-4fdd-be3a-cf039754b7ab	134383ef-3e27-4ee9-9ed0-6f6b278d4b70	0	\N	\N	2025-12-29 16:31:27.529136
78249260-2aaa-4268-9411-f2b9471af06a	82cc8c14-bd9b-4002-836d-4d0b4a712a4d	cda741ed-afbb-4795-a2ec-6e6b0375f0d0	0	\N	\N	2025-12-29 16:31:20.189438
7929e6fe-c7b6-4dca-830e-1ef9e1708d5a	13aac49d-554b-4ac5-8c78-ab6abc4a61c4	07c365b3-2f9f-4397-9605-db31ba4c7752	0	\N	\N	2025-12-29 16:31:24.25019
79339ffb-9e01-4e51-8194-28fc099b79df	963a9695-5acd-4162-aff2-03b33022cdd4	ee816f93-85ab-4827-ac7d-fb13f8a926df	0	\N	\N	2025-12-29 16:31:18.798317
798fd274-bc1b-4001-93b6-2b4289b43095	cab8e0bd-4e05-450b-bef7-4b8651d5295f	1cef3beb-2d1b-4136-a805-285df0f81366	0	\N	\N	2025-12-29 16:31:16.081345
7a95fe35-05b0-4ac0-b269-29328800fe69	63f661ac-75e0-4aae-a1aa-879128891215	c3aa665d-1a7a-40c9-b6be-fe9a43fcd8f7	0	\N	\N	2025-12-29 16:31:29.680154
7aacd1fa-06fb-41f6-9c92-649f0ed486b6	e68c6def-f9fb-402e-8066-54a33bd5dd68	cda741ed-afbb-4795-a2ec-6e6b0375f0d0	0	\N	\N	2025-12-29 16:31:20.211119
7acb472f-f02b-4330-988c-f37238c94a37	df60a1ec-ab32-45b2-9ca2-93f7926ffa96	4466efbf-f708-4a29-b13d-5c28297f4db3	0	\N	\N	2025-12-29 16:31:23.787761
7b08473e-e660-4973-b97f-e1b9312af3c3	df227c3f-0f26-4e93-b7b9-dd6802a061a5	6445e2a6-4866-41d2-a81c-eb1eb6a7c536	0	\N	\N	2025-12-29 16:31:24.895045
7bc7abbf-62c3-4122-8f5c-537a6925651a	20979cb9-e457-4fdd-be3a-cf039754b7ab	28283855-40a5-449c-8ae1-418bd57a1e69	0	\N	\N	2025-12-29 16:31:27.390476
7c8c0df6-cf28-492a-a299-96054b9ea78f	6ce83efc-05d0-4c17-9d54-8f9eae1c0c63	01a3dec3-b563-4c08-95f5-2575c8465f5a	0	\N	\N	2025-12-29 16:31:30.15148
7d9cc70e-e512-46c3-a103-4154972d6e2b	53540c17-78f7-437e-ab6b-87c642f1e868	a7a723f7-e6af-4eb7-b711-4f211531d424	0	\N	\N	2025-12-29 16:31:19.766372
7dd18db6-06e0-4cf9-becb-cfe9b4dd613e	20979cb9-e457-4fdd-be3a-cf039754b7ab	ac9e038f-0460-4c55-ac28-5e5500ab953b	0	\N	\N	2025-12-29 16:31:27.571951
7e2bbaf2-802e-4408-bc84-0e07719a3ca4	874fc067-a244-478a-ace5-0d352e439606	8080f304-88e7-4326-89c8-5708d13fbcf0	0	\N	\N	2025-12-29 16:31:23.07073
7e55cf64-162e-4f05-adb5-e874feb9f803	6ce83efc-05d0-4c17-9d54-8f9eae1c0c63	3d377878-47f8-44d4-b8f8-c69247708b99	0	\N	\N	2025-12-29 16:31:30.194631
7ef43345-2425-4b89-b2b2-4a4f5cd8cf0c	8206cda8-fa63-444c-a163-cca7b9db0620	e45d13e2-7506-4a76-b530-ee69fd0eb2b1	0	\N	\N	2025-12-29 16:31:15.871434
7efd6c31-f4ef-4167-882f-cf4d0991abb0	1542491d-e953-45e9-8a81-53b2b8a5931f	ca7e271a-b330-40d5-98c1-17cba2b22e3a	0	\N	\N	2025-12-29 16:31:19.299669
7f07cdd0-20e8-47e1-8836-798498b53960	138eea36-2263-4093-9a21-dd6aeb846450	c738a843-0054-47cb-b491-d13f66b1893b	0	\N	\N	2025-12-29 16:31:21.787743
7f24d512-90b6-4c1a-a9bd-9425c3fe40fc	883f5f91-3f16-4eab-8744-e519e45d256f	7bf610c8-5a1b-4c9e-91e5-49d7c7bccc0a	0	\N	\N	2025-12-29 16:31:28.450009
7f8ed28b-057e-4f7d-8d70-cf9ec3e17e7d	3c042938-82b4-4060-92c3-6762366c5e4c	d8ade05c-ef45-4ad8-b8f1-7a67431d667e	0	\N	\N	2025-12-29 16:31:25.770758
7fb46c18-0ae2-45fc-b352-7eefeaf53edd	31b8d4b9-326e-4e9a-8803-a9b4ea034b7e	9e3b5733-9174-42c4-ae99-d7d15a640b2b	0	\N	\N	2025-12-29 16:31:18.475433
7fe10a33-7423-47e3-9d30-371bf6efc886	16bd771f-08ea-4656-8239-65f5f9376104	db12a4fc-6e43-473d-9239-c5fd59c33e3e	0	\N	\N	2025-12-29 16:31:18.09877
7fedabaf-74d1-4734-8278-7ae0e4199463	6ce83efc-05d0-4c17-9d54-8f9eae1c0c63	c7fb008f-02f4-424c-ba55-b6dfbacec930	0	\N	\N	2025-12-29 16:31:30.1033
804d5d7e-44a3-43ab-a8ad-7410d938564e	62856f54-242c-4f67-8220-cb451ce52031	ef596350-3a6c-4d71-889d-512a773771c1	0	\N	\N	2025-12-29 16:31:25.217473
80bc496a-360e-4b55-9711-6f5e4a1cf78e	6a98624b-3524-4aab-89cd-d41ca54b2207	3a2fafe3-0d71-40b5-b2c4-bd9e1b159f3c	0	\N	\N	2025-12-29 16:31:29.963385
80d3c2c6-94ff-4a94-8ba5-7c8eaa7641ed	31b8d4b9-326e-4e9a-8803-a9b4ea034b7e	6c49b75d-7641-4a73-8174-62a31a9e91d2	0	\N	\N	2025-12-29 16:31:18.573616
80e1dd03-53df-4bc4-be07-0c54c8e1ee48	df227c3f-0f26-4e93-b7b9-dd6802a061a5	757c135f-7d90-4b8f-a1a0-47a23ed1b601	0	\N	\N	2025-12-29 16:31:24.838124
814f90b5-ef80-4a8e-b816-35c1b61af5af	ee87be0a-b544-47ca-b093-4b168fbd9532	3d0b6753-d73b-47d0-bcf4-af4787487323	0	\N	\N	2025-12-29 16:31:20.962609
8169fc7a-36c9-43a3-a087-abc6e2b66672	ee87be0a-b544-47ca-b093-4b168fbd9532	b73dbd91-9da4-45d2-b76e-b35376828646	0	\N	\N	2025-12-29 16:31:21.049048
82ea54a5-1bba-4d89-9549-eea91e953433	f252346e-a197-4a27-9836-34fb7e50bffd	49e5a66c-f97d-49cb-89a4-ec66a2423024	0	\N	\N	2025-12-29 16:31:19.792021
82f531ad-80a0-4ebe-8ff7-5a29aa1b051b	1d3b4207-a170-4014-80db-d5a1b76f0035	8f4c4dff-b017-4a1d-b563-6bfcaba29a1d	0	\N	\N	2025-12-29 16:31:16.258394
83448119-c664-4141-9b37-89f3aca28764	62325283-63f0-4f68-84f9-f52a8c6cde69	d4fb5def-d0d6-4d1a-9095-58f16285ab6f	0	\N	\N	2025-12-29 16:31:20.625312
836f6d44-548d-4f6f-aaf2-89d6051bccbc	098051ee-bc7c-4051-9883-a1b5165ec030	7de1781e-89dd-4454-800c-5ba3c1ec7885	0	\N	\N	2025-12-29 16:31:30.359443
83cf06ca-069a-4e45-8629-359c8eb8827c	d21ab576-80be-4b37-823e-25820fc9e16b	43933a5b-7afd-4fff-a6fe-3d7aae8619df	0	\N	\N	2025-12-29 16:31:23.55423
84f18f84-6b92-4d17-b48a-2764486612c5	a73b79fe-5694-45ee-99e5-55755fc11d06	a8c68d0c-9488-4a1d-9624-665175ef1c59	0	\N	\N	2025-12-29 16:31:28.859911
855229a7-648e-4854-8714-35313e2b7aa4	a76d5270-26c2-46f6-af85-4d3f892320e9	e296e3ad-4772-4d8b-a76d-b653912d2029	0	\N	\N	2025-12-29 16:31:29.049096
85b8e312-909c-4d9c-94d2-3243320012e2	14047663-ef1d-431b-ae46-d289abae2411	cda43562-bfa2-4831-876f-36adfbf0e499	0	\N	\N	2025-12-29 16:31:17.277906
85e0cb25-6353-4eab-afe3-86fc13bacd9d	cab8e0bd-4e05-450b-bef7-4b8651d5295f	b0ff5995-4e69-4358-b79d-3fa6fef0a69b	0	\N	\N	2025-12-29 16:31:15.931332
860dafce-a12e-40cc-a84a-9875cab80055	9235266f-7ffa-492b-b318-795465417e73	6c9ac109-ed1d-403d-a2f8-b8078a25a94a	0	\N	\N	2025-12-29 16:31:21.446209
86725e4c-ef0a-4f10-844d-45144e635488	f252346e-a197-4a27-9836-34fb7e50bffd	a2559eae-1de4-4ff0-9c8b-785fd86bf28d	0	\N	\N	2025-12-29 16:31:19.938645
86d40214-d22e-4d57-8ab3-f72fd8223b8d	e7c9085f-4613-453d-8233-7171e2cf9609	f571b71a-bc1b-4f2c-98cd-890c1b13800f	0	\N	\N	2025-12-29 16:31:22.202267
86f7dec0-09ca-41a9-a8b8-919dea7cccbe	a3177ae6-e4a7-4f49-a4eb-40c3c7f8a616	8467f635-2740-4777-b39b-280d34080905	0	\N	\N	2025-12-29 16:31:27.05871
87d37f7d-2adf-4a07-a83a-1eb4c50f62f7	f32668a8-9c7c-412a-bbbd-77502615cb5f	04d98e6e-4025-48ff-a39a-97de3d540629	0	\N	\N	2025-12-29 16:31:20.781692
88fb0b9b-dec5-4c99-905e-b2e77be61db5	4418e04b-2f6e-4196-a0a1-57584f714f60	e4785339-9e4f-41e6-9d41-c31a5ed1883d	0	\N	\N	2025-12-29 16:31:25.718738
8909318d-2e43-4687-8152-1eddba7af25c	e1b7b70c-bd56-42e3-8464-e04327fc62c4	db12a4fc-6e43-473d-9239-c5fd59c33e3e	0	\N	\N	2025-12-29 16:31:18.124164
891cec2c-6d44-4d99-a0c8-30e7789c8d55	abc95b43-ba5c-43a4-9946-7190e458f953	925b6cd7-e284-4d9a-9f84-aff837ea3a64	0	\N	\N	2025-12-29 16:31:23.580502
89230619-e57b-404f-9914-bc1af827996e	4b1a8a5e-5892-451f-bb44-3b57cc638fae	a97610b7-bbf7-4c51-b401-ef93890feb3f	0	\N	\N	2025-12-29 16:31:23.364325
899fd6d5-8346-4f14-ad89-5466ba942fff	82cc8c14-bd9b-4002-836d-4d0b4a712a4d	db41a3d7-dd86-46a6-bddc-3928f11adb74	0	\N	\N	2025-12-29 16:31:20.238497
8a370f48-34f9-4bf4-91c7-fa2578281d7e	3f5b9f66-9803-4368-8dd4-eeb2b3f83dec	874fc067-a244-478a-ace5-0d352e439606	0	\N	\N	2025-12-29 16:31:16.928226
8c78a8a3-076f-495b-b73e-b7e23bcea37a	5e856554-dfb5-4657-9265-01096f0f6451	7b053907-6f2c-429a-b61e-775ffe91d482	0	\N	\N	2025-12-29 16:31:21.657715
8cddd493-4025-4a8e-bb43-546c044cd758	f43058ff-54b4-42b3-837e-57c08655f9f6	eefd1cd9-f475-4bac-98a3-7e0def26c573	0	\N	\N	2025-12-29 16:31:22.345344
8d3c743b-cd6a-49e3-8826-3e8d77722d01	5087b661-e52b-417d-ad01-4aebfc684d3c	1e78534b-2c86-4d27-862c-dbab814f2a60	0	\N	\N	2025-12-29 16:31:25.598627
8d6c1246-a774-462a-8970-a751fd3dcf71	13aac49d-554b-4ac5-8c78-ab6abc4a61c4	b9c4aff5-4d35-41a2-90a7-6b8bf2aaf132	0	\N	\N	2025-12-29 16:31:24.199669
8da4ee74-b27b-4364-bf9a-8ab508047e8d	74b38e76-dfbe-409b-ba03-f39025b6de2b	d4fb5def-d0d6-4d1a-9095-58f16285ab6f	0	\N	\N	2025-12-29 16:31:20.65151
8dd6fc7f-07c9-4061-bccc-94e9e3378f35	8206cda8-fa63-444c-a163-cca7b9db0620	16bd771f-08ea-4656-8239-65f5f9376104	0	\N	\N	2025-12-29 16:31:16.01647
8e0633d6-5793-4b68-a973-40c15eb2f98c	2dce1a0b-11b9-41a7-827d-562234457252	6a128c37-f273-4914-999f-3d2b4b9e1443	0	\N	\N	2025-12-29 16:31:17.17373
8e1dd735-b94d-4c2b-a1f2-cacc624a5b9f	f571b71a-bc1b-4f2c-98cd-890c1b13800f	7d5d9172-1051-46f9-b53a-b373f75fd561	0	\N	\N	2025-12-29 16:31:27.347191
8e70f4d4-c080-41c2-8c5c-edb71a8e9f49	db12a4fc-6e43-473d-9239-c5fd59c33e3e	976db09a-ec7a-4241-bdc8-f98763174305	0	\N	\N	2025-12-29 16:31:23.014754
8f42d0a8-e19c-4873-b791-47b4164a92de	53540c17-78f7-437e-ab6b-87c642f1e868	eec20b24-1f08-4f5a-847e-ae689a7df272	0	\N	\N	2025-12-29 16:31:19.714029
8f5511f8-e61e-4f60-9653-e0bbc488eb13	aa0ec19d-05fe-4c67-8462-5fc99badd90d	e68c6def-f9fb-402e-8066-54a33bd5dd68	0	\N	\N	2025-12-29 16:31:20.008265
8f7cb060-9856-450e-9d92-7210a092bce3	8e032a15-783b-40d2-8c8c-33aa63af9c63	5cd8dc2a-88d7-4086-af70-fa26d8d71ed5	0	\N	\N	2025-12-29 16:31:29.313039
8fcf5196-cc58-4595-aed0-57f3b4565ed4	31b8d4b9-326e-4e9a-8803-a9b4ea034b7e	842b98e1-7e28-434f-823a-cb52acf765f5	0	\N	\N	2025-12-29 16:31:18.419298
8fe5e8f5-b9d3-4cfe-957a-6c69b5ea31e7	74b38e76-dfbe-409b-ba03-f39025b6de2b	56f491df-dc4b-4021-b43f-c830c1954ce5	0	\N	\N	2025-12-29 16:31:20.46731
902ec431-8d94-4add-9cdf-4efd4d9b3e08	1d3b4207-a170-4014-80db-d5a1b76f0035	198fd73a-e56d-48c9-9473-1cd6a830a62a	0	\N	\N	2025-12-29 16:31:16.215074
904601af-6e66-4309-9d16-673fba640aa7	f252346e-a197-4a27-9836-34fb7e50bffd	51e772c9-fdcf-466f-b506-b56e023df862	0	\N	\N	2025-12-29 16:31:27.956352
9189cf6e-258f-48ec-927c-55e1909fb5b7	2dce1a0b-11b9-41a7-827d-562234457252	8f87d17f-3cd4-42c0-b09f-f1f0cedb8584	0	\N	\N	2025-12-29 16:31:16.815071
9226e5fd-342e-48b9-9b06-e67f03257002	99fe3a58-fd18-4de2-bcf6-0971b019fb65	a20d7808-69be-49ef-8a9c-58dbe9bef865	0	\N	\N	2025-12-29 16:31:25.084716
92291422-1867-41bd-8c5f-577ec057e865	07859a4d-d5cf-4078-867a-53594e735c31	cc5b31d8-55c1-48c1-8b90-948dc0fb4624	0	\N	\N	2025-12-29 16:31:26.146608
929e2e14-70b1-4c90-a140-f11a039167c6	97e0dc07-6ba9-41b3-a392-f4f0a0ef2737	82cc8c14-bd9b-4002-836d-4d0b4a712a4d	0	\N	\N	2025-12-29 16:31:16.132991
92f92be0-93f3-463b-9989-ed84e1877023	99fe3a58-fd18-4de2-bcf6-0971b019fb65	757c135f-7d90-4b8f-a1a0-47a23ed1b601	0	\N	\N	2025-12-29 16:31:24.812381
9367cf0c-4498-4ace-9dc7-2605a82aa1ed	ef6fa562-d8aa-445e-a36e-4a5ef15d86ff	87418f4f-d319-4998-9ab4-d3b6fd6be733	0	\N	\N	2025-12-29 16:31:22.08549
93a25547-ce98-4f58-820f-8e1d323b0d6f	43ba5ec9-f935-4c0d-93c6-8beb676a3250	387edd28-b954-47e9-ab76-633166aa4758	0	\N	\N	2025-12-29 16:31:28.768953
93c21c22-49ee-47a2-b478-41e3cd4f78e8	f32668a8-9c7c-412a-bbbd-77502615cb5f	226dac23-4cf3-411b-8265-0aabf40bb02b	0	\N	\N	2025-12-29 16:31:20.832978
940348d8-a459-473c-883f-281407aa4fce	1b91d97e-55a8-4c4f-9a72-dedf95ca2aed	cda43562-bfa2-4831-876f-36adfbf0e499	0	\N	\N	2025-12-29 16:31:17.252064
94241c15-508f-4df5-b227-9a092a9a3613	b610bb22-f766-4f82-b792-f7fbb2f7003b	8815f86f-febd-4639-bd1d-0e946afa280b	0	\N	\N	2025-12-29 16:31:19.122878
946efb0c-7eb9-4b49-854c-61903eb5aa4a	5087b661-e52b-417d-ad01-4aebfc684d3c	79fb0e06-dbb5-4d11-bacd-e332b736d1c6	0	\N	\N	2025-12-29 16:31:25.703286
949a7783-3809-483a-b4f3-3f4dbd490bce	f571b71a-bc1b-4f2c-98cd-890c1b13800f	8152d60b-ded3-4367-8ea1-00c3d23ae4fe	0	\N	\N	2025-12-29 16:31:27.304425
954602e6-1506-4101-aacb-6fd8a64de31c	43ba5ec9-f935-4c0d-93c6-8beb676a3250	23861b80-b74c-4e0f-ac1a-e7759818f5e7	0	\N	\N	2025-12-29 16:31:28.626488
96bbe97b-6d46-45bd-bd17-7368d9e62485	975c5df5-0586-4f04-b84d-be22ce5956cd	7d5d9172-1051-46f9-b53a-b373f75fd561	0	\N	\N	2025-12-29 16:31:27.365545
974351d2-7d2c-40b6-89f7-9da48f0f52a8	cab8e0bd-4e05-450b-bef7-4b8651d5295f	1b91d97e-55a8-4c4f-9a72-dedf95ca2aed	0	\N	\N	2025-12-29 16:31:15.999898
975dbc7e-7669-4489-b822-1fc68ef5d1d5	41ab25c4-81ea-46f0-8ec7-82f30f270160	23861b80-b74c-4e0f-ac1a-e7759818f5e7	0	\N	\N	2025-12-29 16:31:28.652158
978b7780-d8da-4634-af36-b78e5c15ac63	01e7143e-e7d9-4723-976d-4e9e92ea06c5	b88dfb6a-da70-4ea5-ad2c-efd1c33156b9	0	\N	\N	2025-12-29 16:31:30.578443
97c0555c-d12d-4d97-81fb-3ea2e758a572	41ab25c4-81ea-46f0-8ec7-82f30f270160	efa08ac8-e46c-4928-915f-f6770536ec25	0	\N	\N	2025-12-29 16:31:28.742997
98db0042-a558-443f-80cd-23c6b2972dba	51608bf6-00cb-401c-8d52-277068e91c6a	910b2aa8-9ffa-4bd5-bc9c-8bdb446bab2f	0	\N	\N	2025-12-29 16:31:28.552588
99465be6-c12a-41bc-ac29-b883bbaac452	5ea9d2fc-288e-4997-b046-0b57b502e3d0	8ba9f4f4-0fc9-445d-805d-2e0ed559c149	0	\N	\N	2025-12-29 16:31:29.83183
997c6bea-0a8f-4c28-8b09-73fbfbd76b66	8815f86f-febd-4639-bd1d-0e946afa280b	12bf3ef5-8a0d-42a0-8f68-fe9ce2113dde	0	\N	\N	2025-12-29 16:31:25.895971
99914875-2642-424e-bb95-54c8eb63ea16	2bfbbbb6-df60-48c1-9619-7bc9f565e18b	a7a723f7-e6af-4eb7-b711-4f211531d424	0	\N	\N	2025-12-29 16:31:19.739902
99b6ee0a-0d81-4e14-9038-83fd57ec4101	1b91d97e-55a8-4c4f-9a72-dedf95ca2aed	a4e1763e-23f3-4b7f-bb31-16d23e30ee97	0	\N	\N	2025-12-29 16:31:17.338194
9a370153-2285-423d-8aeb-d7c8913e69d1	f20edf06-3e22-4d9d-a1c9-82d8dbd50b52	064a8791-ed32-44d6-b911-e3ed3e818261	0	\N	\N	2025-12-29 16:31:18.336453
9a5d7857-dc37-47e6-97cb-941747587b44	2bfbbbb6-df60-48c1-9619-7bc9f565e18b	9ae2788b-8596-4ef7-9682-08124da02aee	0	\N	\N	2025-12-29 16:31:19.649398
9b0119b9-90b0-493a-966f-249d12b02375	a3177ae6-e4a7-4f49-a4eb-40c3c7f8a616	18d51473-0cfe-4776-ac02-c89fb2d29087	0	\N	\N	2025-12-29 16:31:27.161855
9b028131-d45c-4433-afbf-844d3890487e	fd11fd84-1e42-4d38-ad83-796210bfdd71	6a845e8b-803e-4104-8c22-a74ea7b85e2a	0	\N	\N	2025-12-29 16:31:29.407623
9b09ba09-1a04-4261-ac8a-b548bacb635d	e35a59c7-dd2c-4085-88ab-345a2978d6bd	b046d245-e224-482d-ad09-e571f84d37ff	0	\N	\N	2025-12-29 16:31:19.45018
9cdecb73-7579-46b2-9d71-f42f4028b682	62325283-63f0-4f68-84f9-f52a8c6cde69	5721d7c5-dad5-4696-82b5-283b267738f2	0	\N	\N	2025-12-29 16:31:20.582242
9cf0a825-2983-49ee-8b3b-cbbec4bb5c4a	3f5b9f66-9803-4368-8dd4-eeb2b3f83dec	13aac49d-554b-4ac5-8c78-ab6abc4a61c4	0	\N	\N	2025-12-29 16:31:17.014963
9dbc917f-ce21-47da-8dac-85985c62d51c	5b60b3c6-c57e-4b2c-bbb6-897f3052876b	ce2713e6-1855-4496-b9e4-ff650700b7ef	0	\N	\N	2025-12-29 16:31:30.938735
9de6bb43-150e-44ed-97a2-0a5a07be871a	f252346e-a197-4a27-9836-34fb7e50bffd	a45a0267-d72a-4b26-8d48-2b780eae7557	0	\N	\N	2025-12-29 16:31:27.87861
9e03912f-caa9-4f4d-bf29-45846ea8cd64	32e2834a-d60d-499c-a626-ae1c23b3dcf1	a1c06163-d2d7-439d-b905-5455cc4c16a4	0	\N	\N	2025-12-29 16:31:24.518048
9e6dad30-d2d6-4b9e-87b9-afec9e108ee3	f9e95815-2b58-46ce-ad03-39d332808875	1bc6a1c3-74e5-4a82-b4bd-c35653f6de9a	0	\N	\N	2025-12-29 16:31:25.438096
9eee773d-6e06-44cd-86bf-980b9a0a0699	cda43562-bfa2-4831-876f-36adfbf0e499	984cdf4d-965a-446a-9bfd-623f1a067fbd	0	\N	\N	2025-12-29 16:31:21.631949
9f1f96bb-3eeb-46a7-94c9-d3a4c097ff89	9e3b5733-9174-42c4-ae99-d7d15a640b2b	134383ef-3e27-4ee9-9ed0-6f6b278d4b70	0	\N	\N	2025-12-29 16:31:27.54688
9f721a33-ed6f-442c-bbc6-4ddf37a4959b	8f4c4dff-b017-4a1d-b563-6bfcaba29a1d	b594b5d0-3703-49cd-865b-790ac271e59a	0	\N	\N	2025-12-29 16:31:23.295855
a0b8ae8c-c62e-44df-b7c7-c80450641467	975c5df5-0586-4f04-b84d-be22ce5956cd	8152d60b-ded3-4367-8ea1-00c3d23ae4fe	0	\N	\N	2025-12-29 16:31:27.321503
a1875853-1856-40c1-9f91-8400683b509e	df60a1ec-ab32-45b2-9ca2-93f7926ffa96	3c042938-82b4-4060-92c3-6762366c5e4c	0	\N	\N	2025-12-29 16:31:23.684269
a1991eb5-7e10-44de-96bd-e6956697bd07	1b91d97e-55a8-4c4f-9a72-dedf95ca2aed	74b38e76-dfbe-409b-ba03-f39025b6de2b	0	\N	\N	2025-12-29 16:31:17.234743
a1d267e1-34e4-449b-bd94-b6efb0f39bf9	bbc3495b-afe0-4294-958a-a8d0560b5ff8	ad99bb72-4ede-4dda-8a06-91aeed3e4683	0	\N	\N	2025-12-29 16:31:28.099715
a204953b-99f9-45ed-a7a2-deeeb71db3a1	cc5b31d8-55c1-48c1-8b90-948dc0fb4624	bf49f9ee-2dde-4ab1-ac5a-0a7eeb49183f	0	\N	\N	2025-12-29 16:31:26.418907
a274c4b7-5533-4773-89ab-d60569512373	5e856554-dfb5-4657-9265-01096f0f6451	50b85ddc-3ef5-43f1-a25c-b819d33a9e7a	0	\N	\N	2025-12-29 16:31:21.701103
a28950e3-5dfa-45ac-abcc-6b155ea920cd	4b1a8a5e-5892-451f-bb44-3b57cc638fae	256b6740-757c-4c62-9c1e-912cd09d6946	0	\N	\N	2025-12-29 16:31:23.183189
a2dabfec-5778-4125-978f-a8077b539bd1	99fe3a58-fd18-4de2-bcf6-0971b019fb65	2ee746d7-3b1b-4d6a-b6af-9e4c820b3e3a	0	\N	\N	2025-12-29 16:31:25.040529
a2feb9b2-1bb6-4d16-b991-bc01e3c64d7e	58eeabb9-73a6-42d1-a743-49ec8debfcb5	961fac6f-57ec-4e37-81f9-08325ba1548e	0	\N	\N	2025-12-29 16:31:28.199445
a353e71d-a216-4a87-9b2e-99ee5095a79c	16bd771f-08ea-4656-8239-65f5f9376104	5ee5eb1b-6f3f-469c-91b6-1c5300da8f71	0	\N	\N	2025-12-29 16:31:17.904334
a3b5f007-cbd0-46b1-adab-057f60679bdb	6653dba6-6f95-4495-8e3a-3cc187266272	898cfffd-6302-4f0a-99fa-63ab41e07dc1	0	\N	\N	2025-12-29 16:31:24.0815
a5601ffa-4447-40b7-9492-7a62fd926258	db12a4fc-6e43-473d-9239-c5fd59c33e3e	efa7406f-7481-498f-a680-8c0a84e13c7b	0	\N	\N	2025-12-29 16:31:23.139748
a5997eb2-eccb-4812-8bd9-7dad5ff4f135	20cbc50d-1aa5-4b6a-bbfc-80304fe0c544	0b7a58ff-cd04-48fd-b62d-f53a449e3d0c	0	\N	\N	2025-12-29 16:31:22.545314
a5b39055-203a-4f5f-afb1-ccdb37cabb5e	e1b7b70c-bd56-42e3-8464-e04327fc62c4	4396edb8-3cad-46f7-8802-bbcbd17db4d3	0	\N	\N	2025-12-29 16:31:17.826787
a5e86a39-93fb-42cb-8374-44642d5fd3a6	8f4c4dff-b017-4a1d-b563-6bfcaba29a1d	ea942b8e-9168-4269-af69-51383d8d260d	0	\N	\N	2025-12-29 16:31:23.251945
a61f57aa-206e-49f0-bc8a-8d65dbb91e8e	14047663-ef1d-431b-ae46-d289abae2411	03ad50e3-aa0b-4875-aefd-6c25e9ef1631	0	\N	\N	2025-12-29 16:31:17.321061
a7038e11-f832-435a-b5cd-90974b963878	6653dba6-6f95-4495-8e3a-3cc187266272	5fa4e123-d0a8-4e78-a27b-24c21fe856ed	0	\N	\N	2025-12-29 16:31:24.314981
a73d852f-2e34-4bf7-80f6-2113bc542cab	8039b17f-3028-43be-9ba8-1c3498ef85a9	963a9695-5acd-4162-aff2-03b33022cdd4	0	\N	\N	2025-12-29 16:31:16.625327
a799c506-5493-4563-9b1c-bf58118a1b07	4a56e8cc-a3a2-490d-a9cb-d0dcad81566a	6b426b41-4463-4f26-af7b-91c5c103df83	0	\N	\N	2025-12-29 16:31:27.032213
a7ee8899-4578-45f0-b140-adba1aafd3db	32e2834a-d60d-499c-a626-ae1c23b3dcf1	9588ae77-fb61-481a-95fe-d44540d9c0c9	0	\N	\N	2025-12-29 16:31:24.465965
a83d090b-f75a-4700-9c3b-665c8a695ae9	6b4bc1f2-f7fd-4ca8-bb35-7a14eabfa434	2305b11a-9a04-4bf4-8227-f14b846cd9da	0	\N	\N	2025-12-29 16:31:22.016518
a872f582-ddad-4c31-99c6-873a42e5eb0a	bbc3495b-afe0-4294-958a-a8d0560b5ff8	f5f9b671-008f-4a1a-9e0f-5f0aad706015	0	\N	\N	2025-12-29 16:31:28.064282
a9c3872d-97b7-4b99-b4a7-a53608eaaa84	53540c17-78f7-437e-ab6b-87c642f1e868	9ae2788b-8596-4ef7-9682-08124da02aee	0	\N	\N	2025-12-29 16:31:19.670793
a9db27e4-3f01-4f8a-a7b9-ad408d0a4dfe	e44cd487-3c0b-438c-819e-462bc3480ef1	ef6fa562-d8aa-445e-a36e-4a5ef15d86ff	0	\N	\N	2025-12-29 16:31:18.634414
a9e75e1c-4c87-49ca-8a60-fe5f443adc65	82cc8c14-bd9b-4002-836d-4d0b4a712a4d	b5f48e56-c241-419c-8a6e-376e7ee236a7	0	\N	\N	2025-12-29 16:31:20.138058
aa06d9fb-5912-4bd0-a749-b362337dfaf8	68641213-079d-4200-80e0-437391610deb	721ce62e-4c0e-411f-85aa-53c785131c1c	0	\N	\N	2025-12-29 16:31:22.755166
ab1309c5-9423-4a4a-8f98-07da5226307b	b88dfb6a-da70-4ea5-ad2c-efd1c33156b9	ce2713e6-1855-4496-b9e4-ff650700b7ef	0	\N	\N	2025-12-29 16:31:30.911205
ab43378f-37ef-40b5-af4c-b9dfe3718d63	a3177ae6-e4a7-4f49-a4eb-40c3c7f8a616	aa971367-e937-482e-b716-43b0c8b4bd94	0	\N	\N	2025-12-29 16:31:27.213216
ab48babf-d593-4ab4-bac6-18fa0233df11	cda43562-bfa2-4831-876f-36adfbf0e499	7b053907-6f2c-429a-b61e-775ffe91d482	0	\N	\N	2025-12-29 16:31:21.675341
ab8d5f07-fece-45fc-b3e3-d1d1095665cc	6965b15f-d56d-4014-b4dc-2296e0234ade	53540c17-78f7-437e-ab6b-87c642f1e868	0	\N	\N	2025-12-29 16:31:16.854287
ac74cdbc-7eed-4c54-a64b-9d6fa02c39b9	71baa9d5-46cd-4942-812e-2f49f5144350	7726dceb-4193-4202-a422-f39aa003c3c6	0	\N	\N	2025-12-29 16:31:29.468223
ac8503a8-0a41-4ab5-b67c-79716e1e7626	03ad50e3-aa0b-4875-aefd-6c25e9ef1631	3a7bdfc0-830b-44c6-86ee-dfa84b9b3a6a	0	\N	\N	2025-12-29 16:31:21.066181
ac87eeaa-1c93-4a4b-b14b-cbe8b86618e3	6b4bc1f2-f7fd-4ca8-bb35-7a14eabfa434	2dd91d5e-4a66-40c9-8ca9-aace4c4ac02a	0	\N	\N	2025-12-29 16:31:26.518235
ad2b01b7-5fed-4ef1-b42e-ee4ca3c8295b	138eea36-2263-4093-9a21-dd6aeb846450	ae0cd9a8-1fae-4418-bf28-e8fadc2fbc74	0	\N	\N	2025-12-29 16:31:21.982007
ad5ba84d-4103-4b6a-8556-6b831a64adb6	f11fb6cb-ece0-4e4d-bb86-fb57e0154ff2	017d1edf-10bc-4320-8210-582b501ee7c6	0	\N	\N	2025-12-29 16:31:28.004154
ad8d3efe-7f39-42ce-b9c4-ab1734bb27ab	ee87be0a-b544-47ca-b093-4b168fbd9532	8b3026e0-921c-4f17-970e-f2ec5724fc51	0	\N	\N	2025-12-29 16:31:20.997264
ada8b30c-82ee-40ac-8698-c7669ddf457b	ac5fe8ed-d1c4-4ac8-bc93-ec9a906d5f7d	8c6f490b-55da-45f3-b1f6-ae54dde406ef	0	\N	\N	2025-12-29 16:31:18.87579
adb627b2-6817-4581-bb2c-f6233161dcf2	66bfe7b7-2c8c-4cf5-ae84-8b348fe68cbd	854b2dd2-5036-45a3-a142-26e5ee1d64cf	0	\N	\N	2025-12-29 16:31:21.303882
adc18181-133b-426b-8169-a0f3089f99a2	6653dba6-6f95-4495-8e3a-3cc187266272	07c365b3-2f9f-4397-9605-db31ba4c7752	0	\N	\N	2025-12-29 16:31:24.22411
ae06fc4a-e9e8-4455-b627-95a44981cb45	0a160248-e4f5-449f-a4af-9dd4197f735a	12acd2b4-5319-440f-a037-1e4ed0568bd6	0	\N	\N	2025-12-29 16:31:22.694831
ae06fcf7-389f-4873-9d87-b8a0a9774a0e	0831d51d-6c34-4e26-9cdc-eb57e0f4781c	ac7ead63-ff75-4624-839f-7561f79867fc	0	\N	\N	2025-12-29 16:31:29.122843
ae321818-4fa4-4311-bf83-0936197160b2	e45d13e2-7506-4a76-b530-ee69fd0eb2b1	ac78fc6b-1bd3-4657-a9be-28941be581dd	0	\N	\N	2025-12-29 16:31:16.391823
ae41b16d-50be-44a0-9f4e-f7c342295895	8f4c4dff-b017-4a1d-b563-6bfcaba29a1d	c4961ae1-d224-4c65-b472-e11cf7517795	0	\N	\N	2025-12-29 16:31:23.390305
ae47548f-a0ee-4a33-bb30-5e127bd87751	1b91d97e-55a8-4c4f-9a72-dedf95ca2aed	9254c9c2-552b-48b6-bf47-ec7b9f024086	0	\N	\N	2025-12-29 16:31:16.499823
afcc5845-ac24-44c2-a1c6-3bca21e62344	6965b15f-d56d-4014-b4dc-2296e0234ade	df60a1ec-ab32-45b2-9ca2-93f7926ffa96	0	\N	\N	2025-12-29 16:31:16.794588
afd9b93c-78e2-4e86-963b-886efcecaf7c	e1b7b70c-bd56-42e3-8464-e04327fc62c4	5ee5eb1b-6f3f-469c-91b6-1c5300da8f71	0	\N	\N	2025-12-29 16:31:17.922021
afe7de25-543d-4f12-bd3e-6f6ce060612c	8cd3209b-7b52-4a4c-a92a-1f8cd6b5e407	a887abc4-617f-4417-a43e-2017f9e69c1c	0	\N	\N	2025-12-29 16:31:21.92303
b0b5ea3a-13d0-4a86-a81d-fa21bf637cb7	5998a405-ab45-42d0-a51e-767985fd8fa7	91460bc8-a143-40f4-96ad-b94328ca5d9f	0	\N	\N	2025-12-29 16:31:29.187945
b0e01f26-316f-460d-8eea-ceb33af294d1	20979cb9-e457-4fdd-be3a-cf039754b7ab	fc1f6782-df84-4b25-9f93-eb260f21018a	0	\N	\N	2025-12-29 16:31:27.429507
b0f37689-68fb-462b-b4d4-d5ebbc8b74e3	f9e95815-2b58-46ce-ad03-39d332808875	1b360ea6-59f3-4033-9bdd-0e836c64f057	0	\N	\N	2025-12-29 16:31:25.494921
b101bd2a-5552-4c41-a32f-5ea9b14d6c9b	9649dc43-7677-454a-acdb-68adf33bbce3	82cc8c14-bd9b-4002-836d-4d0b4a712a4d	0	\N	\N	2025-12-29 16:31:16.149948
b2071744-b6c7-4538-b0a9-1953beb7f443	b0ff5995-4e69-4358-b79d-3fa6fef0a69b	f20edf06-3e22-4d9d-a1c9-82d8dbd50b52	0	\N	\N	2025-12-29 16:31:23.965584
b22aad65-ba15-407b-8106-3cd579798868	8cd3209b-7b52-4a4c-a92a-1f8cd6b5e407	ae0cd9a8-1fae-4418-bf28-e8fadc2fbc74	0	\N	\N	2025-12-29 16:31:21.999518
b2a6176c-e882-4a24-ab58-ae180e57e6ac	d7467f95-6146-493e-b209-686878c3e641	4a6d22c2-43f0-490c-bbfa-f0c187ec77d5	0	\N	\N	2025-12-29 16:31:30.721336
b2feaf5f-98a8-4de1-9d35-ce93518562f3	098051ee-bc7c-4051-9883-a1b5165ec030	c994605c-13ff-4378-880d-4dbed278c51d	0	\N	\N	2025-12-29 16:31:30.488619
b310e65e-ade5-4501-9320-c4be092420aa	07859a4d-d5cf-4078-867a-53594e735c31	8a0f7a9d-fda3-43eb-97c5-369b3a2ac52f	0	\N	\N	2025-12-29 16:31:26.194695
b3f3896e-b9cb-4fd2-a9df-fb41279e78d5	07859a4d-d5cf-4078-867a-53594e735c31	bc84fece-9dc6-4241-87d8-a006e42023e3	0	\N	\N	2025-12-29 16:31:26.097072
b45c6032-ce76-45ea-a7ab-d53428a546e4	cc5b31d8-55c1-48c1-8b90-948dc0fb4624	fcf6790a-800a-4dbd-a6b1-d33a7cd50ca4	0	\N	\N	2025-12-29 16:31:26.371435
b50e9894-d31d-4676-8c65-019d3c2e02ef	32e2834a-d60d-499c-a626-ae1c23b3dcf1	9463577f-8e4a-4f1b-a3d7-17e2eb9ce025	0	\N	\N	2025-12-29 16:31:24.413967
b5f07c5f-6753-4940-9bff-e315723a4d0e	99fe3a58-fd18-4de2-bcf6-0971b019fb65	6445e2a6-4866-41d2-a81c-eb1eb6a7c536	0	\N	\N	2025-12-29 16:31:24.871966
b6b3c7d9-0a1f-46ec-9caf-9b4db48901b6	822cc8a5-c22d-4a68-9375-662ea3b2dfc6	8c370e5c-63ad-46a4-96ae-be21a5ea8683	0	\N	\N	2025-12-29 16:31:19.238749
b76590b7-ae11-40d8-acea-089c11eaf4a6	3c042938-82b4-4060-92c3-6762366c5e4c	28dfe729-587a-4b7b-970b-7e2077a55bcd	0	\N	\N	2025-12-29 16:31:25.819147
b7d4ef8a-6a1a-4554-b6d2-30bb463c6976	2963f2eb-a41a-4ccb-9e7f-f99cee15ed7c	138eea36-2263-4093-9a21-dd6aeb846450	0	\N	\N	2025-12-29 16:31:17.445746
b88ff002-dea5-4ddd-a887-00393c71c60f	62856f54-242c-4f67-8220-cb451ce52031	1bc6a1c3-74e5-4a82-b4bd-c35653f6de9a	0	\N	\N	2025-12-29 16:31:25.411994
b8cec192-d3ba-4afa-be7c-87afdc197b94	71baa9d5-46cd-4942-812e-2f49f5144350	3da7bbb2-8241-4bff-9a80-2b78b6c50a87	0	\N	\N	2025-12-29 16:31:29.33869
b9419d49-868a-4af6-9998-f1bf902a873d	1b91d97e-55a8-4c4f-9a72-dedf95ca2aed	822cc8a5-c22d-4a68-9375-662ea3b2dfc6	0	\N	\N	2025-12-29 16:31:16.690613
b9c55889-e7a5-4e51-985f-fa015b77b673	9254c9c2-552b-48b6-bf47-ec7b9f024086	226dac23-4cf3-411b-8265-0aabf40bb02b	0	\N	\N	2025-12-29 16:31:20.807082
b9f04584-8288-44d6-aa10-f20f6c1f13fe	9254c9c2-552b-48b6-bf47-ec7b9f024086	393d1cc4-7f44-40f9-868d-45d24c13d636	0	\N	\N	2025-12-29 16:31:20.711951
ba251e88-a275-4303-b811-9c661a7977ea	cfcdeebb-3b56-4553-904f-397f374b92a8	66762b55-a7f9-4eb6-b679-1837ee6fcf9f	0	\N	\N	2025-12-29 16:31:17.398574
bb1d0a07-f181-4f7a-9df0-7df49117c700	e7c9085f-4613-453d-8233-7171e2cf9609	051cff4a-c50e-4293-a715-80994568e565	0	\N	\N	2025-12-29 16:31:22.245688
bb51740b-de13-458b-bc06-3910e079db22	f9e95815-2b58-46ce-ad03-39d332808875	9526efce-2894-4b4f-a2fb-9d1d6a22015c	0	\N	\N	2025-12-29 16:31:25.28712
bb61fcac-3221-47c4-bed9-19593eb0adc7	f6abe729-f7dd-45da-8c31-9be811832569	bf49f9ee-2dde-4ab1-ac5a-0a7eeb49183f	0	\N	\N	2025-12-29 16:31:26.444432
bc1f709f-20ac-4dd3-9b62-ce8a160cd808	0a160248-e4f5-449f-a4af-9dd4197f735a	b2bea596-1fcc-4a7f-a6d7-fc9a0d26e265	0	\N	\N	2025-12-29 16:31:22.772468
bc1fac3b-1eca-46db-ae9a-748e5d2d7487	963a9695-5acd-4162-aff2-03b33022cdd4	8c6f490b-55da-45f3-b1f6-ae54dde406ef	0	\N	\N	2025-12-29 16:31:18.905939
bc4979c0-ce9d-4706-a088-0d3ec9c33d23	1d3b4207-a170-4014-80db-d5a1b76f0035	ac78fc6b-1bd3-4657-a9be-28941be581dd	0	\N	\N	2025-12-29 16:31:16.374806
bcafe263-c098-42a5-a25f-b64b14b0c833	ac78fc6b-1bd3-4657-a9be-28941be581dd	f738e1ee-e9f7-49c8-91a5-31f9b9564754	0	\N	\N	2025-12-29 16:31:22.262584
bcba64df-8e1c-450a-9798-aea0b245b723	b610bb22-f766-4f82-b792-f7fbb2f7003b	9a1d400a-0dee-4bb9-93d9-a74f15f3cb98	0	\N	\N	2025-12-29 16:31:19.040164
bcf25a66-8008-4b02-90fa-c2d1537bf210	e7c9085f-4613-453d-8233-7171e2cf9609	bbc3495b-afe0-4294-958a-a8d0560b5ff8	0	\N	\N	2025-12-29 16:31:22.327543
bcfbe41e-3c0f-40a7-b729-27d79ed218fe	df227c3f-0f26-4e93-b7b9-dd6802a061a5	45466f72-d5ec-416d-9721-622f34a814c1	0	\N	\N	2025-12-29 16:31:24.743305
bd47d7f6-afb8-4774-96e1-f03bd51a2409	68641213-079d-4200-80e0-437391610deb	12acd2b4-5319-440f-a037-1e4ed0568bd6	0	\N	\N	2025-12-29 16:31:22.712832
bd763d32-9e5c-419e-babb-db957e8d6882	63f661ac-75e0-4aae-a1aa-879128891215	5ce8f136-8175-4034-9249-4458b20c1cab	0	\N	\N	2025-12-29 16:31:29.625664
bdb121c8-d4fe-4c35-8f32-f28b47109b80	62856f54-242c-4f67-8220-cb451ce52031	1b360ea6-59f3-4033-9bdd-0e836c64f057	0	\N	\N	2025-12-29 16:31:25.46549
bef386af-5be3-47f4-9015-bb3f617c98a8	cb190884-e061-4db9-8cc2-c0aa05378280	8ba9f4f4-0fc9-445d-805d-2e0ed559c149	0	\N	\N	2025-12-29 16:31:29.857676
bf1b3211-e5cf-43a4-9987-3e75c5a93577	2dce1a0b-11b9-41a7-827d-562234457252	e44cd487-3c0b-438c-819e-462bc3480ef1	0	\N	\N	2025-12-29 16:31:16.944913
bf4c116a-4133-4276-95c0-b98ffa3d4861	99fe3a58-fd18-4de2-bcf6-0971b019fb65	3ea3b6ce-d497-4f20-80a3-7f3801c0d0f5	0	\N	\N	2025-12-29 16:31:24.96703
bf8965d0-f440-4c70-b159-a446ff9c38f8	b0ff5995-4e69-4358-b79d-3fa6fef0a69b	31b8d4b9-326e-4e9a-8803-a9b4ea034b7e	0	\N	\N	2025-12-29 16:31:23.917126
c093df77-5b3e-4f00-ab13-901a15116bc5	99fe3a58-fd18-4de2-bcf6-0971b019fb65	f4da585f-fa85-4ec2-be91-b7bcd0387dbf	0	\N	\N	2025-12-29 16:31:24.920344
c0d500da-afb7-427d-973a-2381ad7fc0a9	13aac49d-554b-4ac5-8c78-ab6abc4a61c4	42f2ce5a-4446-461f-9bb6-dcaa636b90c9	0	\N	\N	2025-12-29 16:31:24.055587
c111cec7-29cc-465b-8e17-e8d5f8bd6983	ffa02956-07ed-4b37-a8cd-b23414c2b81e	a1c06163-d2d7-439d-b905-5455cc4c16a4	0	\N	\N	2025-12-29 16:31:24.54443
c141a7e8-4a68-474e-9a7f-a695d9a56dca	db12a4fc-6e43-473d-9239-c5fd59c33e3e	a0d28119-3e65-42d4-8f64-61ef2942b030	0	\N	\N	2025-12-29 16:31:22.929054
c1a716f1-f437-45f1-9f03-702040210bea	b88dfb6a-da70-4ea5-ad2c-efd1c33156b9	81720561-a4a7-4054-96e4-02a89cf0c9ca	0	\N	\N	2025-12-29 16:31:30.868023
c1d12023-ebe9-405f-a748-d94b864b9827	8206cda8-fa63-444c-a163-cca7b9db0620	2dce1a0b-11b9-41a7-827d-562234457252	0	\N	\N	2025-12-29 16:31:15.809663
c25033e1-7b94-4ec6-b96f-af52c18123a4	f43058ff-54b4-42b3-837e-57c08655f9f6	b16e1013-de3c-4876-8f2d-41033e1ffb28	0	\N	\N	2025-12-29 16:31:22.565265
c26f67b3-c316-4fbb-a38f-6707ca6a23d8	2dce1a0b-11b9-41a7-827d-562234457252	62325283-63f0-4f68-84f9-f52a8c6cde69	0	\N	\N	2025-12-29 16:31:17.118055
c2861fe7-15f1-46b5-bc51-d4a78ffabb4f	fd11fd84-1e42-4d38-ad83-796210bfdd71	83050d08-4624-4abf-9565-2344da76d757	0	\N	\N	2025-12-29 16:31:29.442291
c2b1a675-3a62-470b-8be3-d43d8167deae	5ee5eb1b-6f3f-469c-91b6-1c5300da8f71	56c29211-020f-4254-aaed-33d4966c48be	0	\N	\N	2025-12-29 16:31:21.364102
c2eb654f-f964-4a9b-a234-a7cdcf20fe47	9e233a52-68ac-4562-bed2-3fbae2aec730	8cd3209b-7b52-4a4c-a92a-1f8cd6b5e407	0	\N	\N	2025-12-29 16:31:21.541052
c37b9178-449f-40bb-91ec-4505ca5f9ae0	2dce1a0b-11b9-41a7-827d-562234457252	53540c17-78f7-437e-ab6b-87c642f1e868	0	\N	\N	2025-12-29 16:31:16.837697
c3def788-8cb1-46d5-aae7-ae065f903353	cb190884-e061-4db9-8cc2-c0aa05378280	05d61ba4-ede6-48ac-b255-fa8693be7061	0	\N	\N	2025-12-29 16:31:29.909926
c3f74e40-7a3f-4e43-8d92-9c0716c2b0bf	31b8d4b9-326e-4e9a-8803-a9b4ea034b7e	ef6fa562-d8aa-445e-a36e-4a5ef15d86ff	0	\N	\N	2025-12-29 16:31:18.616875
c42a3fff-8e84-42de-9060-e552974e3559	e35a59c7-dd2c-4085-88ab-345a2978d6bd	7dce3336-a904-4e58-b4ee-4b90af944e44	0	\N	\N	2025-12-29 16:31:19.554068
c4c32396-757a-4213-bb47-7523cd98c4bc	8e032a15-783b-40d2-8c8c-33aa63af9c63	e31e9e9a-9a83-49bf-97e0-9c1d6ebf09c6	0	\N	\N	2025-12-29 16:31:29.265429
c5509353-9e5d-48a5-a7b1-70888117504b	5ea9d2fc-288e-4997-b046-0b57b502e3d0	bbf75e1b-d67c-40b9-b369-05ad4de6ea65	0	\N	\N	2025-12-29 16:31:29.783495
c65f248e-ea92-419f-89f5-01985a336527	5998a405-ab45-42d0-a51e-767985fd8fa7	5cd8dc2a-88d7-4086-af70-fa26d8d71ed5	0	\N	\N	2025-12-29 16:31:29.286828
c66026d7-a2c4-4cc0-8a12-c52dd977ee27	ebeba076-fd3d-4db5-afdd-1b4d9042d038	5f41b7a1-b5ac-4cf3-ad82-3735b1f050f4	0	\N	\N	2025-12-29 16:31:27.939165
c67022d4-eb1a-409e-a71f-c61d39dffa5c	ee816f93-85ab-4827-ac7d-fb13f8a926df	71baa9d5-46cd-4942-812e-2f49f5144350	0	\N	\N	2025-12-29 16:31:17.688027
c6823e4a-2bbc-4c71-8814-dcb88ae8ff8c	f43058ff-54b4-42b3-837e-57c08655f9f6	883f5f91-3f16-4eab-8744-e519e45d256f	0	\N	\N	2025-12-29 16:31:22.46213
c7c8ef1a-7ffe-49b6-97f5-4fd766ad9930	49e5a66c-f97d-49cb-89a4-ec66a2423024	8e032a15-783b-40d2-8c8c-33aa63af9c63	0	\N	\N	2025-12-29 16:31:29.023349
c80d86d6-299e-46d6-abbc-4d32748ad438	4a56e8cc-a3a2-490d-a9cb-d0dcad81566a	0932b7e4-1f7a-478e-9ec2-d57596a5b969	0	\N	\N	2025-12-29 16:31:26.846278
c830217d-7237-4790-b200-99098014eb8f	822cc8a5-c22d-4a68-9375-662ea3b2dfc6	5087b661-e52b-417d-ad01-4aebfc684d3c	0	\N	\N	2025-12-29 16:31:19.065839
c87e77c1-4f3e-4e19-b1ab-6dd82652c7d6	03ad50e3-aa0b-4875-aefd-6c25e9ef1631	40d8b941-d6c2-470c-b463-2f8767138162	0	\N	\N	2025-12-29 16:31:21.147954
c939e1e2-a2f3-4b8c-ae9c-6d37e944f053	32e2834a-d60d-499c-a626-ae1c23b3dcf1	34eccca2-e723-4e34-a2b2-5ee11a0ed4f1	0	\N	\N	2025-12-29 16:31:24.367869
c99e91b1-f2a5-41b8-80ff-2be7207b30ab	8c6f490b-55da-45f3-b1f6-ae54dde406ef	c06bea75-1372-4d24-a784-d45caae6fb2d	0	\N	\N	2025-12-29 16:31:30.652038
c9b878d7-6588-4b70-af08-33e0b3848b93	6653dba6-6f95-4495-8e3a-3cc187266272	b9c4aff5-4d35-41a2-90a7-6b8bf2aaf132	0	\N	\N	2025-12-29 16:31:24.174601
c9c262f5-f4a5-4bad-8d02-850654a46907	4b1a8a5e-5892-451f-bb44-3b57cc638fae	d21ab576-80be-4b37-823e-25820fc9e16b	0	\N	\N	2025-12-29 16:31:23.23482
ca10293f-0db1-46f5-bbde-2b463474711b	df227c3f-0f26-4e93-b7b9-dd6802a061a5	f4da585f-fa85-4ec2-be91-b7bcd0387dbf	0	\N	\N	2025-12-29 16:31:24.945391
caf8de61-9908-4e4f-a495-1292ca89dbdb	e35a59c7-dd2c-4085-88ab-345a2978d6bd	1dd0b591-cf5a-4021-bd1e-d7881437b110	0	\N	\N	2025-12-29 16:31:19.321017
cb752632-ab67-4016-854c-4d1317f8b886	1ee4c37d-18a5-49b2-b0ea-59683c08c323	0398475a-18bc-4a9b-b099-b4994a38070e	0	\N	\N	2025-12-29 16:31:26.018881
cc1580c9-4c87-4fe8-8b13-38f28d6445b3	b16e1013-de3c-4876-8f2d-41033e1ffb28	961fac6f-57ec-4e37-81f9-08325ba1548e	0	\N	\N	2025-12-29 16:31:28.176718
cc9ec579-fd59-43de-aa85-500c2a546a5d	ffa02956-07ed-4b37-a8cd-b23414c2b81e	6b82c82a-d20c-44de-ade0-2bb0a29eb2c0	0	\N	\N	2025-12-29 16:31:24.595558
ccfe06a6-8e2b-43f9-a348-98235062d793	2963f2eb-a41a-4ccb-9e7f-f99cee15ed7c	66762b55-a7f9-4eb6-b679-1837ee6fcf9f	0	\N	\N	2025-12-29 16:31:17.372836
cd02c233-c50a-4bed-814d-f73296c72469	ac5fe8ed-d1c4-4ac8-bc93-ec9a906d5f7d	098051ee-bc7c-4051-9883-a1b5165ec030	0	\N	\N	2025-12-29 16:31:18.824829
cd082147-bc5b-4804-ac48-b1c78c24b258	6ce83efc-05d0-4c17-9d54-8f9eae1c0c63	9a5cef95-9851-4265-9c0f-fa8efb1409af	0	\N	\N	2025-12-29 16:31:30.241574
ce830d95-f9fb-4344-a496-b089485824a5	4b1a8a5e-5892-451f-bb44-3b57cc638fae	b594b5d0-3703-49cd-865b-790ac271e59a	0	\N	\N	2025-12-29 16:31:23.321242
cecb462d-778d-49d7-b698-e2ed8a76b16e	6a98624b-3524-4aab-89cd-d41ca54b2207	e1d30736-5971-45ff-a06a-f4de4a7acf7e	0	\N	\N	2025-12-29 16:31:30.056178
cedca4bd-eaf0-49ce-a6a6-3afa006d3877	cc5b31d8-55c1-48c1-8b90-948dc0fb4624	9ec8c2ad-7a10-4e0d-b22c-dbf241a5e84c	0	\N	\N	2025-12-29 16:31:26.461602
cee54584-f567-40e0-8dea-325fb09092ca	f11fb6cb-ece0-4e4d-bb86-fb57e0154ff2	f5f9b671-008f-4a1a-9e0f-5f0aad706015	0	\N	\N	2025-12-29 16:31:28.047281
cf495126-5952-4a3c-891c-c6b6d4a3c1df	aa0ec19d-05fe-4c67-8462-5fc99badd90d	49e5a66c-f97d-49cb-89a4-ec66a2423024	0	\N	\N	2025-12-29 16:31:19.813265
cfe85e4e-01f4-4b3d-9e15-bcad945caaa0	16bd771f-08ea-4656-8239-65f5f9376104	b610bb22-f766-4f82-b792-f7fbb2f7003b	0	\N	\N	2025-12-29 16:31:17.947049
d01b2258-2bc7-416a-959d-c862d59ab7b9	e7c9085f-4613-453d-8233-7171e2cf9609	f738e1ee-e9f7-49c8-91a5-31f9b9564754	0	\N	\N	2025-12-29 16:31:22.281674
d067471e-ce1e-4ab5-ab2e-3c55b3bf38e0	74b38e76-dfbe-409b-ba03-f39025b6de2b	5721d7c5-dad5-4696-82b5-283b267738f2	0	\N	\N	2025-12-29 16:31:20.600491
d0b34635-54f8-4074-8997-283501eb93e9	f571b71a-bc1b-4f2c-98cd-890c1b13800f	95e11722-dda6-4ba8-88c4-e68494398ecf	0	\N	\N	2025-12-29 16:31:27.261033
d0c7c390-e68b-4691-b107-f0f9efa4166b	9e233a52-68ac-4562-bed2-3fbae2aec730	6c9ac109-ed1d-403d-a2f8-b8078a25a94a	0	\N	\N	2025-12-29 16:31:21.42038
d11c8943-18b4-4d68-9b8e-253ba53232c7	0831d51d-6c34-4e26-9cdc-eb57e0f4781c	3431da17-9257-42f6-a88a-9d4e8d6eb946	0	\N	\N	2025-12-29 16:31:29.166661
d15bc68c-f123-4dcb-a92a-bc227bd46136	16bd771f-08ea-4656-8239-65f5f9376104	43034613-869a-4c09-ac18-a854a35fe9a6	0	\N	\N	2025-12-29 16:31:18.149982
d190cf1f-eb63-4724-adc3-38b584fad301	d2ee12d5-5848-48c2-91a6-ffc49270bca1	a20d7808-69be-49ef-8a9c-58dbe9bef865	0	\N	\N	2025-12-29 16:31:25.109992
d25247f7-5be7-4dba-9cab-8abccc9a7281	8cd3209b-7b52-4a4c-a92a-1f8cd6b5e407	fd11fd84-1e42-4d38-ad83-796210bfdd71	0	\N	\N	2025-12-29 16:31:21.840271
d278eb85-943b-4cf1-a842-f837ad5ecdd1	8f87d17f-3cd4-42c0-b09f-f1f0cedb8584	878307d1-6e66-4245-97f4-7cb71982ec00	0	\N	\N	2025-12-29 16:31:23.832088
d283fcac-3b1a-4b6f-b9e4-b32c06a6a936	1ee4c37d-18a5-49b2-b0ea-59683c08c323	22dbe006-c318-418b-a66e-2bfb6ebe2e17	0	\N	\N	2025-12-29 16:31:26.271915
d2857cf3-9313-4bbc-8df1-edea610b0bb9	098051ee-bc7c-4051-9883-a1b5165ec030	07fe499f-7066-4230-8ea7-3f80edf4d549	0	\N	\N	2025-12-29 16:31:30.259055
d31989b3-d790-44e0-8d70-d36756b60a12	cda43562-bfa2-4831-876f-36adfbf0e499	9f7d376d-1ba6-427e-9630-1fb8bbb07f91	0	\N	\N	2025-12-29 16:31:21.762859
d3b12caf-d460-4873-91c3-76cea10d3862	822cc8a5-c22d-4a68-9375-662ea3b2dfc6	8815f86f-febd-4639-bd1d-0e946afa280b	0	\N	\N	2025-12-29 16:31:19.105009
d4975715-82b9-497c-a20b-15d89fc3ecb6	a0d28119-3e65-42d4-8f64-61ef2942b030	6910f824-c647-4e09-8407-0a74245d41f2	0	\N	\N	2025-12-29 16:31:26.638952
d4d6273d-f260-4e19-b72b-cc770151a1c3	cab8e0bd-4e05-450b-bef7-4b8651d5295f	2dce1a0b-11b9-41a7-827d-562234457252	0	\N	\N	2025-12-29 16:31:15.8489
d5a97084-9f2f-473e-9103-cd0b9b39f45b	6b4bc1f2-f7fd-4ca8-bb35-7a14eabfa434	87418f4f-d319-4998-9ab4-d3b6fd6be733	0	\N	\N	2025-12-29 16:31:22.060015
d5e1b1a2-3246-46ed-8402-b570c43f410a	b9b13aae-11e6-4e84-b1f2-b57d2918d3d5	66952afa-c95b-45d8-9de3-c61ecebda807	0	\N	\N	2025-12-29 16:31:27.801108
d624ab7a-1696-4831-b293-ffaea307cc8d	82cc8c14-bd9b-4002-836d-4d0b4a712a4d	ef1450af-4946-4cca-8c69-b8e6ac026ac3	0	\N	\N	2025-12-29 16:31:20.087225
d6444797-6271-4a7c-99c0-71e066540972	a73b79fe-5694-45ee-99e5-55755fc11d06	0831d51d-6c34-4e26-9cdc-eb57e0f4781c	0	\N	\N	2025-12-29 16:31:28.954214
d6491269-2e36-452f-8559-74623b6b486d	1d3b4207-a170-4014-80db-d5a1b76f0035	99fe3a58-fd18-4de2-bcf6-0971b019fb65	0	\N	\N	2025-12-29 16:31:16.418584
d69a1406-8530-49f4-b724-3b0f5ab4a032	d88c0ea1-6d59-418b-a938-2e6aa399ed22	03aa6f04-8208-40e9-ae74-9f6c3aa71a78	0	\N	\N	2025-12-29 16:31:28.573935
d7b7dd51-9bfe-470d-af80-6fe69e025c43	1d3b4207-a170-4014-80db-d5a1b76f0035	31b8d4b9-326e-4e9a-8803-a9b4ea034b7e	0	\N	\N	2025-12-29 16:31:23.893055
d7e309f8-43f9-4c4c-93d7-228eadbc1b12	a8bb31d9-739f-4081-8a25-b8dfc1fbb1c3	188b6de4-b9c3-4bc4-9af7-b00278731ddb	0	\N	\N	2025-12-29 16:31:28.332138
d848e565-0169-4d5f-b2bb-9ec4ef9b6816	8206cda8-fa63-444c-a163-cca7b9db0620	1b91d97e-55a8-4c4f-9a72-dedf95ca2aed	0	\N	\N	2025-12-29 16:31:15.981826
d8518423-5c77-4d11-b14f-ae7724b42782	ee87be0a-b544-47ca-b093-4b168fbd9532	b713c623-e12c-4c4f-bef6-d2a387f88359	0	\N	\N	2025-12-29 16:31:21.217635
d85ca1cb-2e7a-425a-88d7-3172517ca154	b610bb22-f766-4f82-b792-f7fbb2f7003b	5087b661-e52b-417d-ad01-4aebfc684d3c	0	\N	\N	2025-12-29 16:31:19.083561
d95f0104-baf7-41e9-8d7e-a5658ba9d554	ac78fc6b-1bd3-4657-a9be-28941be581dd	051cff4a-c50e-4293-a715-80994568e565	0	\N	\N	2025-12-29 16:31:22.219761
d9878a94-0a31-4aff-ad5e-8e1cd2e3eee1	31b8d4b9-326e-4e9a-8803-a9b4ea034b7e	68641213-079d-4200-80e0-437391610deb	0	\N	\N	2025-12-29 16:31:18.522202
d9ebc5da-0027-4a2a-8026-4a96cccd50ba	28283855-40a5-449c-8ae1-418bd57a1e69	2c73a45a-44ea-43e5-a2d8-4b43cd9aac4f	0	\N	\N	2025-12-29 16:31:27.721548
dae92b64-3f3c-4b73-98e2-2dd236330aba	9e233a52-68ac-4562-bed2-3fbae2aec730	5e856554-dfb5-4657-9265-01096f0f6451	0	\N	\N	2025-12-29 16:31:21.468625
db4bd86b-a096-45f9-a07d-2f8d0b7a286f	16bd771f-08ea-4656-8239-65f5f9376104	57853450-4b79-4a55-b6ae-4267f86e4740	0	\N	\N	2025-12-29 16:31:18.198615
dc0052e0-0f7e-4f65-afd3-7dd627504653	e1b7b70c-bd56-42e3-8464-e04327fc62c4	20cbc50d-1aa5-4b6a-bbfc-80304fe0c544	0	\N	\N	2025-12-29 16:31:18.020597
dc31b376-b09b-4afb-a626-66c4595d358e	ee816f93-85ab-4827-ac7d-fb13f8a926df	6a98624b-3524-4aab-89cd-d41ca54b2207	0	\N	\N	2025-12-29 16:31:17.57113
dc5e77d2-d39e-48c7-9914-357024d65aea	f43058ff-54b4-42b3-837e-57c08655f9f6	b9b13aae-11e6-4e84-b1f2-b57d2918d3d5	0	\N	\N	2025-12-29 16:31:22.608374
dc74f98b-d12e-4cc6-ada4-ca3985e3624f	41ab25c4-81ea-46f0-8ec7-82f30f270160	329a1d03-3aca-47f2-8490-a2c7348be885	0	\N	\N	2025-12-29 16:31:28.837315
dcd6164a-c533-4d71-aebf-b2d41823ee69	31b8d4b9-326e-4e9a-8803-a9b4ea034b7e	f6feaafe-2930-415a-877d-49f9265fb8d2	0	\N	\N	2025-12-29 16:31:18.374619
dd302c21-0145-4177-ba61-b54ca7c2afa0	e68c6def-f9fb-402e-8066-54a33bd5dd68	db41a3d7-dd86-46a6-bddc-3928f11adb74	0	\N	\N	2025-12-29 16:31:20.262827
dd68a456-d54f-46f2-b4b7-aea5896e36f3	f252346e-a197-4a27-9836-34fb7e50bffd	1ee4c37d-18a5-49b2-b0ea-59683c08c323	0	\N	\N	2025-12-29 16:31:19.835443
dd68d890-763b-4351-a381-f3912b8068ff	16bd771f-08ea-4656-8239-65f5f9376104	4396edb8-3cad-46f7-8802-bbcbd17db4d3	0	\N	\N	2025-12-29 16:31:17.800933
dd7894e1-7162-4aec-af08-aaace77e42f9	98056226-655c-4f92-8216-199573920cd7	15508ffe-69d5-4d0c-a776-c9859d138401	0	\N	\N	2025-12-29 16:31:18.75549
ddd7abde-344a-4429-9fe7-a35e19b032ad	ac5fe8ed-d1c4-4ac8-bc93-ec9a906d5f7d	ee816f93-85ab-4827-ac7d-fb13f8a926df	0	\N	\N	2025-12-29 16:31:18.781939
dde8143c-553e-4b22-b6c7-faa02801e8a4	c4961ae1-d224-4c65-b472-e11cf7517795	c994605c-13ff-4378-880d-4dbed278c51d	0	\N	\N	2025-12-29 16:31:30.513779
de2c54f4-b5d8-4a7c-809d-85b3e6e5421a	28283855-40a5-449c-8ae1-418bd57a1e69	1c6ea137-4121-40f2-852b-b78686fd071b	0	\N	\N	2025-12-29 16:31:27.67345
de45dce1-bd53-49a6-ac6b-2394d88f32ef	a3177ae6-e4a7-4f49-a4eb-40c3c7f8a616	e58d2487-41a2-4856-8eec-31a6cb8f3bf6	0	\N	\N	2025-12-29 16:31:26.920485
de8b9c65-0e25-4bb7-bdca-2eab9672aaae	20cbc50d-1aa5-4b6a-bbfc-80304fe0c544	51608bf6-00cb-401c-8d52-277068e91c6a	0	\N	\N	2025-12-29 16:31:22.444329
def51d86-e12a-4d05-88f3-dff7358628d2	4396edb8-3cad-46f7-8802-bbcbd17db4d3	a76d5270-26c2-46f6-af85-4d3f892320e9	0	\N	\N	2025-12-29 16:31:22.651198
df111fe0-e138-491d-b4dc-5b38fd074515	62325283-63f0-4f68-84f9-f52a8c6cde69	56f491df-dc4b-4021-b43f-c830c1954ce5	0	\N	\N	2025-12-29 16:31:20.436062
df14c7e4-f3f6-4bc0-aabe-45bdbc3bdb6b	28283855-40a5-449c-8ae1-418bd57a1e69	2b6d5983-a17e-4413-9888-6e9673e94ad9	0	\N	\N	2025-12-29 16:31:27.827169
e02443ff-13d3-4276-90e1-a8dbc4eedd33	57853450-4b79-4a55-b6ae-4267f86e4740	5b60b3c6-c57e-4b2c-bbb6-897f3052876b	0	\N	\N	2025-12-29 16:31:17.705186
e10da959-40b9-4e7e-9291-a7c1af892942	e44cd487-3c0b-438c-819e-462bc3480ef1	842b98e1-7e28-434f-823a-cb52acf765f5	0	\N	\N	2025-12-29 16:31:18.443761
e124362e-ddfc-4bcc-9c2c-3d8ecc7b772d	16bd771f-08ea-4656-8239-65f5f9376104	0a160248-e4f5-449f-a4af-9dd4197f735a	0	\N	\N	2025-12-29 16:31:17.85216
e1479630-d664-4056-a10c-efae1a0fc418	2dce1a0b-11b9-41a7-827d-562234457252	874fc067-a244-478a-ace5-0d352e439606	0	\N	\N	2025-12-29 16:31:16.910229
e1c03c48-c0bf-4867-877c-f405757dc933	d2ee12d5-5848-48c2-91a6-ffc49270bca1	2ee746d7-3b1b-4d6a-b6af-9e4c820b3e3a	0	\N	\N	2025-12-29 16:31:25.057894
e286e7f4-a7fc-4294-b93a-007604076998	5998a405-ab45-42d0-a51e-767985fd8fa7	e31e9e9a-9a83-49bf-97e0-9c1d6ebf09c6	0	\N	\N	2025-12-29 16:31:29.239575
e2c69731-b03b-4f7c-9007-cfdb2dd2be80	ac78fc6b-1bd3-4657-a9be-28941be581dd	f571b71a-bc1b-4f2c-98cd-890c1b13800f	0	\N	\N	2025-12-29 16:31:22.184863
e391892b-a450-48f2-9cac-485f837f1e32	32e2834a-d60d-499c-a626-ae1c23b3dcf1	6b82c82a-d20c-44de-ade0-2bb0a29eb2c0	0	\N	\N	2025-12-29 16:31:24.569805
e394146f-bef6-45f8-bd64-f5c1eca7f19e	5e856554-dfb5-4657-9265-01096f0f6451	9f7d376d-1ba6-427e-9630-1fb8bbb07f91	0	\N	\N	2025-12-29 16:31:21.744051
e3df2055-d842-4514-a051-f5513af8b48b	99fe3a58-fd18-4de2-bcf6-0971b019fb65	d913e8e7-7b5a-4516-8d86-0bc443170546	0	\N	\N	2025-12-29 16:31:24.759748
e3fcbe8f-d795-4bc3-921f-65962b17c175	57853450-4b79-4a55-b6ae-4267f86e4740	71baa9d5-46cd-4942-812e-2f49f5144350	0	\N	\N	2025-12-29 16:31:17.666639
e455d347-d382-4a30-8674-263956eb21ad	99fe3a58-fd18-4de2-bcf6-0971b019fb65	d46e7da8-4299-4bb8-840f-364823f42406	0	\N	\N	2025-12-29 16:31:25.174589
e56ec0ac-68e9-40d5-935d-06ad5ed3d996	cda43562-bfa2-4831-876f-36adfbf0e499	50b85ddc-3ef5-43f1-a25c-b819d33a9e7a	0	\N	\N	2025-12-29 16:31:21.718479
e5c65c9f-316e-4dab-9d50-8ea8b5ed666d	ac5fe8ed-d1c4-4ac8-bc93-ec9a906d5f7d	9ea9feb7-4bdf-40e7-ac99-f7d7d0969229	0	\N	\N	2025-12-29 16:31:18.975552
e60d7402-badb-4ab4-bd94-40a7eb6eb669	4a56e8cc-a3a2-490d-a9cb-d0dcad81566a	f8b1a730-10b7-4498-81d7-97a58ad0ec53	0	\N	\N	2025-12-29 16:31:27.135803
e6309b8d-a1da-46d4-9a15-8feee47db6dc	ebeba076-fd3d-4db5-afdd-1b4d9042d038	a45a0267-d72a-4b26-8d48-2b780eae7557	0	\N	\N	2025-12-29 16:31:27.90474
e75a6911-c9ca-4c97-812b-3a17e42f623a	df60a1ec-ab32-45b2-9ca2-93f7926ffa96	e11c4b99-c61e-48d4-a36b-8fa1b9562e0a	0	\N	\N	2025-12-29 16:31:23.73602
e7625e5b-5c6b-4846-9824-34fb2f8b66ec	5e856554-dfb5-4657-9265-01096f0f6451	984cdf4d-965a-446a-9bfd-623f1a067fbd	0	\N	\N	2025-12-29 16:31:21.614662
e77ec508-5377-4003-b55c-d8d0306675a1	d88c0ea1-6d59-418b-a938-2e6aa399ed22	910b2aa8-9ffa-4bd5-bc9c-8bdb446bab2f	0	\N	\N	2025-12-29 16:31:28.531068
e7a67785-aeb8-440a-a7c5-b946a88a0809	9e3b5733-9174-42c4-ae99-d7d15a640b2b	ac9e038f-0460-4c55-ac28-5e5500ab953b	0	\N	\N	2025-12-29 16:31:27.598904
e8101f28-047d-402c-bc7d-e2cb54ebe2b0	98056226-655c-4f92-8216-199573920cd7	7bf62e83-8b40-4612-8180-ed6799b3c5cd	0	\N	\N	2025-12-29 16:31:18.720216
e8708dd0-afc5-4ec1-bab9-45f43ba8bce0	e68c6def-f9fb-402e-8066-54a33bd5dd68	9be2e68a-9266-4a0e-a103-ba446735f2dd	0	\N	\N	2025-12-29 16:31:20.059895
e8eb65bf-43bd-4420-8ef0-ddd91e912c38	e68c6def-f9fb-402e-8066-54a33bd5dd68	8f7b424e-9eb8-4751-a80e-3a8313d1b7d9	0	\N	\N	2025-12-29 16:31:20.315514
e91a5ccf-f351-464b-a8af-90e4da08a590	74b38e76-dfbe-409b-ba03-f39025b6de2b	62795491-b394-4bd9-8a2b-d4e2f91587bd	0	\N	\N	2025-12-29 16:31:20.565283
e97053a4-fc66-491d-99b5-c34005d5711d	8206cda8-fa63-444c-a163-cca7b9db0620	b0ff5995-4e69-4358-b79d-3fa6fef0a69b	0	\N	\N	2025-12-29 16:31:15.904869
e9adaeb7-d83e-4c9b-a645-5726bb3ed17a	97e0dc07-6ba9-41b3-a392-f4f0a0ef2737	6921ef81-45c1-48a9-9e58-38fc2117ac58	0	\N	\N	2025-12-29 16:31:16.09797
e9db34fb-aacb-4078-b5a2-e9cb8b9be5fd	113a3b6b-bc1d-4189-a5be-ff0f4b6da898	01a3dec3-b563-4c08-95f5-2575c8465f5a	0	\N	\N	2025-12-29 16:31:30.129111
e9fc5b36-0abe-47ed-8ce2-e222881c6ba7	5087b661-e52b-417d-ad01-4aebfc684d3c	b871ee60-01ee-4d41-aebf-db6a2334744b	0	\N	\N	2025-12-29 16:31:25.650436
ea389130-49a8-461b-95ad-b70d5379c0e6	098051ee-bc7c-4051-9883-a1b5165ec030	a8da5c60-9950-4a61-8bdb-01251affa1b9	0	\N	\N	2025-12-29 16:31:30.30641
ea3f0bbe-d4eb-4386-b797-4fcfb3267722	1b91d97e-55a8-4c4f-9a72-dedf95ca2aed	aa0ec19d-05fe-4c67-8462-5fc99badd90d	0	\N	\N	2025-12-29 16:31:16.572989
ea48e20e-6196-4480-90f4-4aa8e7d3d7d7	e45d13e2-7506-4a76-b530-ee69fd0eb2b1	9e233a52-68ac-4562-bed2-3fbae2aec730	0	\N	\N	2025-12-29 16:31:16.323963
ea8ffacc-480b-4d99-bfa6-a66113749b15	20cbc50d-1aa5-4b6a-bbfc-80304fe0c544	eefd1cd9-f475-4bac-98a3-7e0def26c573	0	\N	\N	2025-12-29 16:31:22.362386
eac8bd03-bbc7-4a55-9adb-dab445b2b1b8	4418e04b-2f6e-4196-a0a1-57584f714f60	1e78534b-2c86-4d27-862c-dbab814f2a60	0	\N	\N	2025-12-29 16:31:25.572182
eade71c3-55d5-4689-b8f4-1211104547dc	f20edf06-3e22-4d9d-a1c9-82d8dbd50b52	4a56e8cc-a3a2-490d-a9cb-d0dcad81566a	0	\N	\N	2025-12-29 16:31:24.666645
eb84092d-148f-4324-8335-81b14cd5c248	8039b17f-3028-43be-9ba8-1c3498ef85a9	9254c9c2-552b-48b6-bf47-ec7b9f024086	0	\N	\N	2025-12-29 16:31:16.517122
ebde6d88-b7b0-4aa1-8cd5-1f8c5a14b98e	f43058ff-54b4-42b3-837e-57c08655f9f6	51608bf6-00cb-401c-8d52-277068e91c6a	0	\N	\N	2025-12-29 16:31:22.418795
ec74927b-932d-4173-81d7-7f5b240cc3e5	20cbc50d-1aa5-4b6a-bbfc-80304fe0c544	b9b13aae-11e6-4e84-b1f2-b57d2918d3d5	0	\N	\N	2025-12-29 16:31:22.625831
ecdad60b-1407-42c3-80fc-e89c4e945762	62325283-63f0-4f68-84f9-f52a8c6cde69	62795491-b394-4bd9-8a2b-d4e2f91587bd	0	\N	\N	2025-12-29 16:31:20.539636
ecfc691f-5973-47bc-9a0f-46e9338dd120	49e5a66c-f97d-49cb-89a4-ec66a2423024	7138116f-fa84-4bcc-93ef-b3965b68e28c	0	\N	\N	2025-12-29 16:31:28.932409
ed1db6f6-9749-4086-b6c7-694669fb083e	a4675322-ed29-4968-8aba-2c803366d80e	86247581-25d4-4736-a2b4-9d8e62e0afbd	0	\N	\N	2025-12-29 16:31:29.599117
ee11b990-6270-4ae5-bf1d-dc2027702cbe	a20d7808-69be-49ef-8a9c-58dbe9bef865	43f290d1-145d-4a30-b375-fe7d58e9406e	0	\N	\N	2025-12-29 16:31:26.246197
ee11b9ee-6ba2-491a-95d5-27d1cb4456bd	62856f54-242c-4f67-8220-cb451ce52031	9526efce-2894-4b4f-a2fb-9d1d6a22015c	0	\N	\N	2025-12-29 16:31:25.265787
ef86d1f4-ebba-4d4f-85f5-b684ffc933a6	6653dba6-6f95-4495-8e3a-3cc187266272	4630f7f8-db26-46df-93c5-1b8ff2d74445	0	\N	\N	2025-12-29 16:31:24.267187
f03291dc-319e-480e-8f39-9b185173e00a	14047663-ef1d-431b-ae46-d289abae2411	74b38e76-dfbe-409b-ba03-f39025b6de2b	0	\N	\N	2025-12-29 16:31:17.243376
f129204f-c989-4bb3-8871-24db98862e65	4b1a8a5e-5892-451f-bb44-3b57cc638fae	ea942b8e-9168-4269-af69-51383d8d260d	0	\N	\N	2025-12-29 16:31:23.270558
f2b2fd5d-f679-4512-99cf-4998a90031ed	07859a4d-d5cf-4078-867a-53594e735c31	9a1c68b9-7b7c-40d7-9f53-ba5b5c84e7db	0	\N	\N	2025-12-29 16:31:25.999598
f3af4678-ecf2-49a1-9aab-baae9b731a54	20cbc50d-1aa5-4b6a-bbfc-80304fe0c544	b16e1013-de3c-4876-8f2d-41033e1ffb28	0	\N	\N	2025-12-29 16:31:22.586985
f48223f4-6f45-40b7-b67a-7007bbaece22	f9e95815-2b58-46ce-ad03-39d332808875	60bfd2da-842f-4c70-8a03-689c52e7c9d2	0	\N	\N	2025-12-29 16:31:25.386248
f4ac755b-09db-4db8-a4fc-a0f13f834e1b	16bd771f-08ea-4656-8239-65f5f9376104	e7c9085f-4613-453d-8233-7171e2cf9609	0	\N	\N	2025-12-29 16:31:18.048569
f4f30f43-b9d0-49ac-bd6d-018c17284ffe	1542491d-e953-45e9-8a81-53b2b8a5931f	b046d245-e224-482d-ad09-e571f84d37ff	0	\N	\N	2025-12-29 16:31:19.477702
f584f7b4-55bd-423c-a26b-4f9b4fba4935	e44cd487-3c0b-438c-819e-462bc3480ef1	6c49b75d-7641-4a73-8174-62a31a9e91d2	0	\N	\N	2025-12-29 16:31:18.596238
f5b3cdf3-0dea-44e3-a862-78f5af6bcd30	e45d13e2-7506-4a76-b530-ee69fd0eb2b1	8f4c4dff-b017-4a1d-b563-6bfcaba29a1d	0	\N	\N	2025-12-29 16:31:16.275836
f63ee55a-43cc-4ae0-8c8a-abcfa72a3e6d	fd11fd84-1e42-4d38-ad83-796210bfdd71	3da7bbb2-8241-4bff-9a80-2b78b6c50a87	0	\N	\N	2025-12-29 16:31:29.360342
f6d3ab5a-bdec-43a7-b935-da6e102ad5de	0a160248-e4f5-449f-a4af-9dd4197f735a	721ce62e-4c0e-411f-85aa-53c785131c1c	0	\N	\N	2025-12-29 16:31:22.738041
f75f891e-73d8-4a2b-8d0f-363bad6c4792	01e7143e-e7d9-4723-976d-4e9e92ea06c5	c06bea75-1372-4d24-a784-d45caae6fb2d	0	\N	\N	2025-12-29 16:31:30.626305
f785d183-5c66-4d41-9c2b-86358f14559a	49e5a66c-f97d-49cb-89a4-ec66a2423024	a8c68d0c-9488-4a1d-9624-665175ef1c59	0	\N	\N	2025-12-29 16:31:28.885259
f7b88d6b-7440-4dea-b0d5-21dc2131d9f5	7915d38b-983d-4280-a2ce-1b1714d70ba6	878307d1-6e66-4245-97f4-7cb71982ec00	0	\N	\N	2025-12-29 16:31:23.813895
f7e06fd9-46ef-4093-8e8c-bf0a6705c226	8f4c4dff-b017-4a1d-b563-6bfcaba29a1d	d21ab576-80be-4b37-823e-25820fc9e16b	0	\N	\N	2025-12-29 16:31:23.211377
f843ed6c-9965-44b9-877a-7fe9f9d261e3	ee87be0a-b544-47ca-b093-4b168fbd9532	40d8b941-d6c2-470c-b463-2f8767138162	0	\N	\N	2025-12-29 16:31:21.174298
f8489b41-04c2-48b6-9134-8c956b3199f4	cab8e0bd-4e05-450b-bef7-4b8651d5295f	9649dc43-7677-454a-acdb-68adf33bbce3	0	\N	\N	2025-12-29 16:31:15.964494
f9991f7a-486e-4acf-af45-b2c4ad2c5e38	6a98624b-3524-4aab-89cd-d41ca54b2207	0f4c1e01-0dfe-4844-b592-2ac4bb3c9243	0	\N	\N	2025-12-29 16:31:30.009508
fa1e303f-eac6-481c-bb6d-e6ac99891add	9254c9c2-552b-48b6-bf47-ec7b9f024086	49d29a10-f412-473b-8f8f-3a859cba6995	0	\N	\N	2025-12-29 16:31:20.851141
fa281607-d1b2-4e0c-ab1e-8e33a08ca9a6	57853450-4b79-4a55-b6ae-4267f86e4740	cb190884-e061-4db9-8cc2-c0aa05378280	0	\N	\N	2025-12-29 16:31:17.528646
fa944245-5bc6-4afb-a5f5-80d0736fb881	16bd771f-08ea-4656-8239-65f5f9376104	20cbc50d-1aa5-4b6a-bbfc-80304fe0c544	0	\N	\N	2025-12-29 16:31:17.994508
fa954bae-dacf-43f1-a4cd-5c6661ce2a5f	f252346e-a197-4a27-9836-34fb7e50bffd	e68c6def-f9fb-402e-8066-54a33bd5dd68	0	\N	\N	2025-12-29 16:31:19.982033
fadf7558-0ad2-412d-995c-25ab50ac4f3a	822cc8a5-c22d-4a68-9375-662ea3b2dfc6	c8d20780-df3f-439b-a60f-b36d79bc2f77	0	\N	\N	2025-12-29 16:31:19.191585
fb85e0c1-d309-4add-ac1c-661d8aa17df9	ac78fc6b-1bd3-4657-a9be-28941be581dd	bbc3495b-afe0-4294-958a-a8d0560b5ff8	0	\N	\N	2025-12-29 16:31:22.310797
fb86d1f4-85c3-46fe-94a1-d0d587bcfb43	8cd3209b-7b52-4a4c-a92a-1f8cd6b5e407	de21836e-36a4-4655-b204-d32aed148699	0	\N	\N	2025-12-29 16:31:21.964681
fc0fd7ca-ab69-421a-ab16-f481540776c3	883f5f91-3f16-4eab-8744-e519e45d256f	f9e4938d-5c2d-4827-b9d9-d6962aec538e	0	\N	\N	2025-12-29 16:31:28.306393
fc144b54-94dd-4561-a5fa-ab7a38002368	82cc8c14-bd9b-4002-836d-4d0b4a712a4d	8f7b424e-9eb8-4751-a80e-3a8313d1b7d9	0	\N	\N	2025-12-29 16:31:20.289319
fc8c876d-64d6-4172-89a7-f682547b51ac	56f64ff2-3752-44b6-bd7c-7dfb1042fe27	806c3be9-5054-40a0-a67c-89c184a0e34b	0	\N	\N	2025-12-29 16:31:26.66568
fc9b2337-c4b6-43c8-9a80-9d323993228d	9254c9c2-552b-48b6-bf47-ec7b9f024086	04d98e6e-4025-48ff-a39a-97de3d540629	0	\N	\N	2025-12-29 16:31:20.754712
fd0f2bc8-47ee-4116-944c-d9017f0926d1	874fc067-a244-478a-ace5-0d352e439606	07859a4d-d5cf-4078-867a-53594e735c31	0	\N	\N	2025-12-29 16:31:23.03137
fdbb60a5-34f2-4705-bc14-3ca923e664d6	1b91d97e-55a8-4c4f-9a72-dedf95ca2aed	66bfe7b7-2c8c-4cf5-ae84-8b348fe68cbd	0	\N	\N	2025-12-29 16:31:17.208747
fdbf5536-259f-4163-8918-b2fbce155274	8c6f490b-55da-45f3-b1f6-ae54dde406ef	b88dfb6a-da70-4ea5-ad2c-efd1c33156b9	0	\N	\N	2025-12-29 16:31:30.604392
fe231f86-4cac-4ccf-b9c1-55bd1817e626	5ea9d2fc-288e-4997-b046-0b57b502e3d0	ce3ba4b4-7942-43bc-8a09-16f662ff7542	0	\N	\N	2025-12-29 16:31:29.732243
fe61d061-ffd3-4f7c-aac7-1078087773eb	d21ab576-80be-4b37-823e-25820fc9e16b	934ca836-be77-422a-9cbd-34fb31969486	0	\N	\N	2025-12-29 16:31:23.646009
fea90d75-413c-481c-b68c-a33cd9649fae	66bfe7b7-2c8c-4cf5-ae84-8b348fe68cbd	56c29211-020f-4254-aaed-33d4966c48be	0	\N	\N	2025-12-29 16:31:21.390474
feef727b-e10b-4ddb-9a38-45d25d4e2293	138eea36-2263-4093-9a21-dd6aeb846450	a887abc4-617f-4417-a43e-2017f9e69c1c	0	\N	\N	2025-12-29 16:31:21.904153
ff382b8b-05c0-4f80-884a-9dc93c5f7d44	6b4bc1f2-f7fd-4ca8-bb35-7a14eabfa434	5d0f3a15-3457-4304-ad3f-9e44c33dfc73	0	\N	\N	2025-12-29 16:31:26.56562
ff75813e-6cb2-44d8-90a6-c3444721e958	1ee4c37d-18a5-49b2-b0ea-59683c08c323	9a1c68b9-7b7c-40d7-9f53-ba5b5c84e7db	0	\N	\N	2025-12-29 16:31:25.974767
ffa76bce-c89f-4cd9-a312-fd684ff3a8bb	97e0dc07-6ba9-41b3-a392-f4f0a0ef2737	cfcdeebb-3b56-4553-904f-397f374b92a8	0	\N	\N	2025-12-29 16:31:16.176632
ffc09fa9-3ce4-4315-8eec-cf4a6a1c0f0a	113a3b6b-bc1d-4189-a5be-ff0f4b6da898	9a5cef95-9851-4265-9c0f-fa8efb1409af	0	\N	\N	2025-12-29 16:31:30.219958
\.


--
-- TOC entry 3898 (class 0 OID 71084)
-- Dependencies: 221
-- Data for Name: People; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."People" ("Id", "OrgId", "PrimaryName", "Sex", "Gender", "BirthDate", "BirthPrecision", "BirthPlaceId", "DeathDate", "DeathPrecision", "DeathPlaceId", "PrivacyLevel", "Occupation", "Education", "Religion", "Nationality", "Ethnicity", "Notes", "IsVerified", "NeedsReview", "HasConflict", "CreatedAt", "UpdatedAt", "FamilyId") FROM stdin;
00c6c827-308e-4a6e-88c9-83cf391d2881	6f7e2152-c6a2-47ca-b96e-9814df717a03		0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.921617	2025-12-29 16:31:14.921617	\N
017d1edf-10bc-4320-8210-582b501ee7c6	6f7e2152-c6a2-47ca-b96e-9814df717a03	ابتهال	1	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.963611	2025-12-29 16:31:14.963611	\N
01a3dec3-b563-4c08-95f5-2575c8465f5a	6f7e2152-c6a2-47ca-b96e-9814df717a03	هشام	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.973663	2025-12-29 16:31:14.973663	\N
01e7143e-e7d9-4723-976d-4e9e92ea06c5	6f7e2152-c6a2-47ca-b96e-9814df717a03	على احمد خيرى	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.975061	2025-12-29 16:31:14.975061	\N
0398475a-18bc-4a9b-b099-b4994a38070e	6f7e2152-c6a2-47ca-b96e-9814df717a03	عفاف	1	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.955859	2025-12-29 16:31:14.955859	\N
03aa6f04-8208-40e9-ae74-9f6c3aa71a78	6f7e2152-c6a2-47ca-b96e-9814df717a03	اسماء	1	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.966398	2025-12-29 16:31:14.966398	\N
03ad50e3-aa0b-4875-aefd-6c25e9ef1631	6f7e2152-c6a2-47ca-b96e-9814df717a03	محمد احمد	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.919057	2025-12-29 16:31:14.919057	\N
04d98e6e-4025-48ff-a39a-97de3d540629	6f7e2152-c6a2-47ca-b96e-9814df717a03	عبد الرحمن	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.930464	2025-12-29 16:31:14.930464	\N
051cff4a-c50e-4293-a715-80994568e565	6f7e2152-c6a2-47ca-b96e-9814df717a03	محمد	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.93927	2025-12-29 16:31:14.93927	\N
05d61ba4-ede6-48ac-b255-fa8693be7061	6f7e2152-c6a2-47ca-b96e-9814df717a03	خالد	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.972403	2025-12-29 16:31:14.972403	\N
061cfd7d-2c8c-4ced-8b74-8257d83220ef	6f7e2152-c6a2-47ca-b96e-9814df717a03	سعاد	1	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.944486	2025-12-29 16:31:14.944486	\N
064a8791-ed32-44d6-b911-e3ed3e818261	6f7e2152-c6a2-47ca-b96e-9814df717a03	عائشه	1	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.949703	2025-12-29 16:31:14.949703	\N
0672b1df-9ded-4902-a914-6dfe4b32fbc8	6f7e2152-c6a2-47ca-b96e-9814df717a03	زكيه	1	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.913821	2025-12-29 16:31:14.913821	\N
07859a4d-d5cf-4078-867a-53594e735c31	6f7e2152-c6a2-47ca-b96e-9814df717a03	فتحيه	1	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.942492	2025-12-29 16:31:14.942492	\N
07875362-d8ee-4928-86ac-7aecb98a86d6	6f7e2152-c6a2-47ca-b96e-9814df717a03	شريفه	1	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.916178	2025-12-29 16:31:14.916178	\N
07c365b3-2f9f-4397-9605-db31ba4c7752	6f7e2152-c6a2-47ca-b96e-9814df717a03	اسمهان	1	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.947866	2025-12-29 16:31:14.947866	\N
07fe499f-7066-4230-8ea7-3f80edf4d549	6f7e2152-c6a2-47ca-b96e-9814df717a03	احمد	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.974191	2025-12-29 16:31:14.974191	\N
0831d51d-6c34-4e26-9cdc-eb57e0f4781c	6f7e2152-c6a2-47ca-b96e-9814df717a03	انشراح	1	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.968254	2025-12-29 16:31:14.968254	\N
088cc246-a351-465e-b820-60b56fe2263e	6f7e2152-c6a2-47ca-b96e-9814df717a03	متولى	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.933123	2025-12-29 16:31:14.933123	\N
0932b7e4-1f7a-478e-9ec2-d57596a5b969	6f7e2152-c6a2-47ca-b96e-9814df717a03	وصفى	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.958399	2025-12-29 16:31:14.958399	\N
098051ee-bc7c-4051-9883-a1b5165ec030	6f7e2152-c6a2-47ca-b96e-9814df717a03	محمود	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.922858	2025-12-29 16:31:14.922858	\N
09f233c6-9768-436e-896f-220370713add	6f7e2152-c6a2-47ca-b96e-9814df717a03	احمد	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.946413	2025-12-29 16:31:14.946413	\N
0a160248-e4f5-449f-a4af-9dd4197f735a	6f7e2152-c6a2-47ca-b96e-9814df717a03	محمد	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.906322	2025-12-29 16:31:14.906322	\N
0b7a58ff-cd04-48fd-b62d-f53a449e3d0c	6f7e2152-c6a2-47ca-b96e-9814df717a03	نشأت	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.940569	2025-12-29 16:31:14.940569	\N
0f4c1e01-0dfe-4844-b592-2ac4bb3c9243	6f7e2152-c6a2-47ca-b96e-9814df717a03	سامر	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.972957	2025-12-29 16:31:14.972957	\N
0f4c9db3-f3fb-4909-8c3f-b294735a2b0f	6f7e2152-c6a2-47ca-b96e-9814df717a03	ابتسام	1	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.960669	2025-12-29 16:31:14.960669	\N
100e3388-7500-4115-b127-a133e69aad3f	6f7e2152-c6a2-47ca-b96e-9814df717a03	فايزه	1	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.953322	2025-12-29 16:31:14.953322	\N
113a3b6b-bc1d-4189-a5be-ff0f4b6da898	6f7e2152-c6a2-47ca-b96e-9814df717a03	محمد عبدالحليم محمد	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.97331	2025-12-29 16:31:14.97331	\N
12acd2b4-5319-440f-a037-1e4ed0568bd6	6f7e2152-c6a2-47ca-b96e-9814df717a03	محسن	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.941279	2025-12-29 16:31:14.941279	\N
12bf3ef5-8a0d-42a0-8f68-fe9ce2113dde	6f7e2152-c6a2-47ca-b96e-9814df717a03	محمد	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.955317	2025-12-29 16:31:14.955318	\N
12ffb31b-f46b-422f-9124-00f363f1ac7b	6f7e2152-c6a2-47ca-b96e-9814df717a03	احمد	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.970947	2025-12-29 16:31:14.970947	\N
132eb7da-a33c-4e34-80cc-931304148855	6f7e2152-c6a2-47ca-b96e-9814df717a03	محمد	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.91942	2025-12-29 16:31:14.91942	\N
134383ef-3e27-4ee9-9ed0-6f6b278d4b70	6f7e2152-c6a2-47ca-b96e-9814df717a03	احسان	1	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.960844	2025-12-29 16:31:14.960844	\N
138eea36-2263-4093-9a21-dd6aeb846450	6f7e2152-c6a2-47ca-b96e-9814df717a03	احمد	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.93649	2025-12-29 16:31:14.93649	\N
13978df3-8535-4246-a604-3513619239cd	6f7e2152-c6a2-47ca-b96e-9814df717a03	هاديه	1	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.92867	2025-12-29 16:31:14.92867	\N
13aac49d-554b-4ac5-8c78-ab6abc4a61c4	6f7e2152-c6a2-47ca-b96e-9814df717a03	زكيه	1	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.916829	2025-12-29 16:31:14.916829	\N
14047663-ef1d-431b-ae46-d289abae2411	6f7e2152-c6a2-47ca-b96e-9814df717a03	نفيسه فضل	1	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.917972	2025-12-29 16:31:14.917973	\N
1542491d-e953-45e9-8a81-53b2b8a5931f	6f7e2152-c6a2-47ca-b96e-9814df717a03	زينب	1	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.91108	2025-12-29 16:31:14.91108	\N
15508ffe-69d5-4d0c-a776-c9859d138401	6f7e2152-c6a2-47ca-b96e-9814df717a03	فاطمه (قاشو)	1	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.922305	2025-12-29 16:31:14.922305	\N
1630f623-14c7-4db9-b354-666c1300d9e0	6f7e2152-c6a2-47ca-b96e-9814df717a03	احمد	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.912414	2025-12-29 16:31:14.912414	\N
16bd771f-08ea-4656-8239-65f5f9376104	6f7e2152-c6a2-47ca-b96e-9814df717a03	متولى	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.977188	2025-12-29 16:31:14.977188	\N
188b6de4-b9c3-4bc4-9af7-b00278731ddb	6f7e2152-c6a2-47ca-b96e-9814df717a03	مروه	1	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.965336	2025-12-29 16:31:14.965336	\N
18d51473-0cfe-4776-ac02-c89fb2d29087	6f7e2152-c6a2-47ca-b96e-9814df717a03	زينب	1	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.959622	2025-12-29 16:31:14.959622	\N
198fd73a-e56d-48c9-9473-1cd6a830a62a	6f7e2152-c6a2-47ca-b96e-9814df717a03	محمد	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.914503	2025-12-29 16:31:14.914503	\N
1b360ea6-59f3-4033-9bdd-0e836c64f057	6f7e2152-c6a2-47ca-b96e-9814df717a03	فاطمه	1	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.95388	2025-12-29 16:31:14.95388	\N
1b4aa5c2-a13d-461c-b64b-38b6808a1609	6f7e2152-c6a2-47ca-b96e-9814df717a03	رشا	1	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.966037	2025-12-29 16:31:14.966037	\N
1b91d97e-55a8-4c4f-9a72-dedf95ca2aed	6f7e2152-c6a2-47ca-b96e-9814df717a03	محمد	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.908731	2025-12-29 16:31:14.908731	\N
1bc6a1c3-74e5-4a82-b4bd-c35653f6de9a	6f7e2152-c6a2-47ca-b96e-9814df717a03	احمد	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.953702	2025-12-29 16:31:14.953702	\N
1c6ea137-4121-40f2-852b-b78686fd071b	6f7e2152-c6a2-47ca-b96e-9814df717a03	عبد العزيز	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.961374	2025-12-29 16:31:14.961374	\N
1cef3beb-2d1b-4136-a805-285df0f81366	6f7e2152-c6a2-47ca-b96e-9814df717a03	عائشه	1	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.921432	2025-12-29 16:31:14.921432	\N
1d3b4207-a170-4014-80db-d5a1b76f0035	6f7e2152-c6a2-47ca-b96e-9814df717a03	محجوب	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.909077	2025-12-29 16:31:14.909077	\N
1dd0b591-cf5a-4021-bd1e-d7881437b110	6f7e2152-c6a2-47ca-b96e-9814df717a03	حسن	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.925042	2025-12-29 16:31:14.925042	\N
1e2bde09-e21a-46e3-82d1-0eec6cf6f166	6f7e2152-c6a2-47ca-b96e-9814df717a03	كوثر	1	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.927131	2025-12-29 16:31:14.927131	\N
1e78534b-2c86-4d27-862c-dbab814f2a60	6f7e2152-c6a2-47ca-b96e-9814df717a03	طلال	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.954402	2025-12-29 16:31:14.954402	\N
1ee4c37d-18a5-49b2-b0ea-59683c08c323	6f7e2152-c6a2-47ca-b96e-9814df717a03	سيد احمد	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.92696	2025-12-29 16:31:14.92696	\N
20652c23-0026-494e-91c8-5ab698cc4aec	6f7e2152-c6a2-47ca-b96e-9814df717a03	عبد الرحمن	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.925407	2025-12-29 16:31:14.925407	\N
20979cb9-e457-4fdd-be3a-cf039754b7ab	6f7e2152-c6a2-47ca-b96e-9814df717a03	عبد العزيز	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.920345	2025-12-29 16:31:14.920345	\N
20cbc50d-1aa5-4b6a-bbfc-80304fe0c544	6f7e2152-c6a2-47ca-b96e-9814df717a03	هجره	1	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.907411	2025-12-29 16:31:14.907411	\N
226dac23-4cf3-411b-8265-0aabf40bb02b	6f7e2152-c6a2-47ca-b96e-9814df717a03	عواطف	1	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.930642	2025-12-29 16:31:14.930642	\N
22dbe006-c318-418b-a66e-2bfb6ebe2e17	6f7e2152-c6a2-47ca-b96e-9814df717a03	منيه	1	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.956809	2025-12-29 16:31:14.956809	\N
2305b11a-9a04-4bf4-8227-f14b846cd9da	6f7e2152-c6a2-47ca-b96e-9814df717a03	الفاتح	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.937107	2025-12-29 16:31:14.937107	\N
23861b80-b74c-4e0f-ac1a-e7759818f5e7	6f7e2152-c6a2-47ca-b96e-9814df717a03	هشام	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.966747	2025-12-29 16:31:14.966747	\N
256b6740-757c-4c62-9c1e-912cd09d6946	6f7e2152-c6a2-47ca-b96e-9814df717a03	صلاح	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.94344	2025-12-29 16:31:14.94344	\N
28283855-40a5-449c-8ae1-418bd57a1e69	6f7e2152-c6a2-47ca-b96e-9814df717a03	محمد	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.960315	2025-12-29 16:31:14.960315	\N
288bfc15-ead3-401d-9bee-e2f5edc370b4	6f7e2152-c6a2-47ca-b96e-9814df717a03	فيصل حسن يوسف	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.972587	2025-12-29 16:31:14.972587	\N
28dfe729-587a-4b7b-970b-7e2077a55bcd	6f7e2152-c6a2-47ca-b96e-9814df717a03	روان	1	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.955092	2025-12-29 16:31:14.955092	\N
28e0e0d9-ff42-4392-a80e-2f899f7e7fe8	6f7e2152-c6a2-47ca-b96e-9814df717a03	احمد	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.964985	2025-12-29 16:31:14.964985	\N
2963f2eb-a41a-4ccb-9e7f-f99cee15ed7c	6f7e2152-c6a2-47ca-b96e-9814df717a03	محمد بدر كدوده	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.919939	2025-12-29 16:31:14.919939	\N
29a6853f-c91b-40d3-ab9a-0fa96762438c	6f7e2152-c6a2-47ca-b96e-9814df717a03	فاطمه ابايزيد	1	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.936745	2025-12-29 16:31:14.936745	\N
2aaf36b3-1784-43b1-af3d-db36fe7a5d84	6f7e2152-c6a2-47ca-b96e-9814df717a03	عمرو	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.934161	2025-12-29 16:31:14.934161	\N
2b6d5983-a17e-4413-9888-6e9673e94ad9	6f7e2152-c6a2-47ca-b96e-9814df717a03	هاله	1	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.962406	2025-12-29 16:31:14.962407	\N
2bfbbbb6-df60-48c1-9619-7bc9f565e18b	6f7e2152-c6a2-47ca-b96e-9814df717a03	احمد	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.910014	2025-12-29 16:31:14.910014	\N
2c1bfeee-d425-4831-897b-f2274e085973	6f7e2152-c6a2-47ca-b96e-9814df717a03	كامل	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.938913	2025-12-29 16:31:14.938913	\N
2c73a45a-44ea-43e5-a2d8-4b43cd9aac4f	6f7e2152-c6a2-47ca-b96e-9814df717a03	عبد الرحمن	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.961543	2025-12-29 16:31:14.961544	\N
2cecfa3e-92a5-4251-acaf-07ac2a09807b	6f7e2152-c6a2-47ca-b96e-9814df717a03	محمد احمد	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.909634	2025-12-29 16:31:14.909634	\N
2dce1a0b-11b9-41a7-827d-562234457252	6f7e2152-c6a2-47ca-b96e-9814df717a03	عبده	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.908029	2025-12-29 16:31:14.908029	\N
2dd91d5e-4a66-40c9-8ca9-aace4c4ac02a	6f7e2152-c6a2-47ca-b96e-9814df717a03	صلاح	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.957874	2025-12-29 16:31:14.957874	\N
2ee746d7-3b1b-4d6a-b6af-9e4c820b3e3a	6f7e2152-c6a2-47ca-b96e-9814df717a03	محجوب	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.95191	2025-12-29 16:31:14.95191	\N
3009160e-5f07-450d-a731-ce8bfb1683ea	6f7e2152-c6a2-47ca-b96e-9814df717a03	راشد	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.965515	2025-12-29 16:31:14.965515	\N
31b8d4b9-326e-4e9a-8803-a9b4ea034b7e	6f7e2152-c6a2-47ca-b96e-9814df717a03	عثمان	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.911407	2025-12-29 16:31:14.911407	\N
329a1d03-3aca-47f2-8490-a2c7348be885	6f7e2152-c6a2-47ca-b96e-9814df717a03	علاء	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.967446	2025-12-29 16:31:14.967446	\N
32e2834a-d60d-499c-a626-ae1c23b3dcf1	6f7e2152-c6a2-47ca-b96e-9814df717a03	محمد حاج	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.948415	2025-12-29 16:31:14.948415	\N
33a8bd61-c893-4430-88da-03cfe7ac82f6	6f7e2152-c6a2-47ca-b96e-9814df717a03	محمد	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.90945	2025-12-29 16:31:14.90945	\N
3431da17-9257-42f6-a88a-9d4e8d6eb946	6f7e2152-c6a2-47ca-b96e-9814df717a03	نزار	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.96898	2025-12-29 16:31:14.96898	\N
34eccca2-e723-4e34-a2b2-5ee11a0ed4f1	6f7e2152-c6a2-47ca-b96e-9814df717a03	محمد احمد	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.948642	2025-12-29 16:31:14.948642	\N
34f7930c-ebe4-4369-8697-a133297bab81	6f7e2152-c6a2-47ca-b96e-9814df717a03	سعيده	1	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.942139	2025-12-29 16:31:14.942139	\N
387edd28-b954-47e9-ab76-633166aa4758	6f7e2152-c6a2-47ca-b96e-9814df717a03	احمد	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.967269	2025-12-29 16:31:14.967269	\N
393d1cc4-7f44-40f9-868d-45d24c13d636	6f7e2152-c6a2-47ca-b96e-9814df717a03	محمود	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.930225	2025-12-29 16:31:14.930225	\N
3a2fafe3-0d71-40b5-b2c4-bd9e1b159f3c	6f7e2152-c6a2-47ca-b96e-9814df717a03	على	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.972781	2025-12-29 16:31:14.972782	\N
3a7bdfc0-830b-44c6-86ee-dfa84b9b3a6a	6f7e2152-c6a2-47ca-b96e-9814df717a03	ابو الوفا	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.931945	2025-12-29 16:31:14.931945	\N
3c042938-82b4-4060-92c3-6762366c5e4c	6f7e2152-c6a2-47ca-b96e-9814df717a03	فتحى	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.945523	2025-12-29 16:31:14.945523	\N
3d0b6753-d73b-47d0-bcf4-af4787487323	6f7e2152-c6a2-47ca-b96e-9814df717a03	طاهر	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.931329	2025-12-29 16:31:14.931329	\N
3d377878-47f8-44d4-b8f8-c69247708b99	6f7e2152-c6a2-47ca-b96e-9814df717a03	سامح	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.973832	2025-12-29 16:31:14.973832	\N
3da7bbb2-8241-4bff-9a80-2b78b6c50a87	6f7e2152-c6a2-47ca-b96e-9814df717a03	دعاء	1	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.969719	2025-12-29 16:31:14.969719	\N
3ea3b6ce-d497-4f20-80a3-7f3801c0d0f5	6f7e2152-c6a2-47ca-b96e-9814df717a03	رباب	1	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.951383	2025-12-29 16:31:14.951383	\N
3f5b9f66-9803-4368-8dd4-eeb2b3f83dec	6f7e2152-c6a2-47ca-b96e-9814df717a03	شريفه عبدالرحمن فقير	1	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.916006	2025-12-29 16:31:14.916006	\N
40d8b941-d6c2-470c-b463-2f8767138162	6f7e2152-c6a2-47ca-b96e-9814df717a03	احمد	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.932402	2025-12-29 16:31:14.932402	\N
41ab25c4-81ea-46f0-8ec7-82f30f270160	6f7e2152-c6a2-47ca-b96e-9814df717a03	نجاة	1	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.940032	2025-12-29 16:31:14.940032	\N
42f2ce5a-4446-461f-9bb6-dcaa636b90c9	6f7e2152-c6a2-47ca-b96e-9814df717a03	عبد العزيز	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.947083	2025-12-29 16:31:14.947083	\N
43034613-869a-4c09-ac18-a854a35fe9a6	6f7e2152-c6a2-47ca-b96e-9814df717a03	زينب	1	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.911746	2025-12-29 16:31:14.911746	\N
43933a5b-7afd-4fff-a6fe-3d7aae8619df	6f7e2152-c6a2-47ca-b96e-9814df717a03	فاطمه	1	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.944827	2025-12-29 16:31:14.944827	\N
4396edb8-3cad-46f7-8802-bbcbd17db4d3	6f7e2152-c6a2-47ca-b96e-9814df717a03	احمد	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.905851	2025-12-29 16:31:14.905851	\N
43ba5ec9-f935-4c0d-93c6-8beb676a3250	6f7e2152-c6a2-47ca-b96e-9814df717a03	محمد عيبر	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.966568	2025-12-29 16:31:14.966568	\N
43f290d1-145d-4a30-b375-fe7d58e9406e	6f7e2152-c6a2-47ca-b96e-9814df717a03	شداد	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.956604	2025-12-29 16:31:14.956604	\N
4418e04b-2f6e-4196-a0a1-57584f714f60	6f7e2152-c6a2-47ca-b96e-9814df717a03	فاروق مصطفى	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.954227	2025-12-29 16:31:14.954227	\N
4466efbf-f708-4a29-b13d-5c28297f4db3	6f7e2152-c6a2-47ca-b96e-9814df717a03	شوقى	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.945895	2025-12-29 16:31:14.945895	\N
45466f72-d5ec-416d-9721-622f34a814c1	6f7e2152-c6a2-47ca-b96e-9814df717a03	على	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.950399	2025-12-29 16:31:14.950399	\N
4630f7f8-db26-46df-93c5-1b8ff2d74445	6f7e2152-c6a2-47ca-b96e-9814df717a03	فوزيه	1	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.948044	2025-12-29 16:31:14.948044	\N
471a7760-cb62-4c00-89e3-f0cbcfffc40e	6f7e2152-c6a2-47ca-b96e-9814df717a03	عثمان	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.912583	2025-12-29 16:31:14.912583	\N
49d29a10-f412-473b-8f8f-3a859cba6995	6f7e2152-c6a2-47ca-b96e-9814df717a03	عنايات	1	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.930814	2025-12-29 16:31:14.930814	\N
49e5a66c-f97d-49cb-89a4-ec66a2423024	6f7e2152-c6a2-47ca-b96e-9814df717a03	فاطمه	1	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.926787	2025-12-29 16:31:14.926787	\N
4a56e8cc-a3a2-490d-a9cb-d0dcad81566a	6f7e2152-c6a2-47ca-b96e-9814df717a03	فاطمه	1	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.950045	2025-12-29 16:31:14.950045	\N
4a6d22c2-43f0-490c-bbfa-f0c187ec77d5	6f7e2152-c6a2-47ca-b96e-9814df717a03	على	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.975943	2025-12-29 16:31:14.975943	\N
4b1a8a5e-5892-451f-bb44-3b57cc638fae	6f7e2152-c6a2-47ca-b96e-9814df717a03	امينه عبدالحميد صالح شريف	1	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.943265	2025-12-29 16:31:14.943265	\N
5087b661-e52b-417d-ad01-4aebfc684d3c	6f7e2152-c6a2-47ca-b96e-9814df717a03	ناديه	1	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.923724	2025-12-29 16:31:14.923725	\N
50b85ddc-3ef5-43f1-a25c-b819d33a9e7a	6f7e2152-c6a2-47ca-b96e-9814df717a03	عايده	1	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.934896	2025-12-29 16:31:14.934896	\N
51608bf6-00cb-401c-8d52-277068e91c6a	6f7e2152-c6a2-47ca-b96e-9814df717a03	نجوى	1	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.940202	2025-12-29 16:31:14.940202	\N
51e772c9-fdcf-466f-b506-b56e023df862	6f7e2152-c6a2-47ca-b96e-9814df717a03	نعيمه	1	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.963086	2025-12-29 16:31:14.963086	\N
53540c17-78f7-437e-ab6b-87c642f1e868	6f7e2152-c6a2-47ca-b96e-9814df717a03	سعيده	1	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.926104	2025-12-29 16:31:14.926104	\N
539b46d3-0702-4d3a-8a05-6beff160a092	6f7e2152-c6a2-47ca-b96e-9814df717a03	فاطمه	1	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.919774	2025-12-29 16:31:14.919774	\N
56c29211-020f-4254-aaed-33d4966c48be	6f7e2152-c6a2-47ca-b96e-9814df717a03	محمد عثمان	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.943081	2025-12-29 16:31:14.943081	\N
56f491df-dc4b-4021-b43f-c830c1954ce5	6f7e2152-c6a2-47ca-b96e-9814df717a03	عبده سامى	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.929007	2025-12-29 16:31:14.929007	\N
56f64ff2-3752-44b6-bd7c-7dfb1042fe27	6f7e2152-c6a2-47ca-b96e-9814df717a03	محجوب	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.938732	2025-12-29 16:31:14.938732	\N
5721d7c5-dad5-4696-82b5-283b267738f2	6f7e2152-c6a2-47ca-b96e-9814df717a03	وداد	1	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.929521	2025-12-29 16:31:14.929521	\N
57853450-4b79-4a55-b6ae-4267f86e4740	6f7e2152-c6a2-47ca-b96e-9814df717a03	على	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.976824	2025-12-29 16:31:14.976824	\N
5865b700-fea3-4e30-a02d-4e9347a7935e	6f7e2152-c6a2-47ca-b96e-9814df717a03	زهره	1	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.928841	2025-12-29 16:31:14.928841	\N
58eeabb9-73a6-42d1-a743-49ec8debfcb5	6f7e2152-c6a2-47ca-b96e-9814df717a03	رانيا	1	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.964256	2025-12-29 16:31:14.964256	\N
5998a405-ab45-42d0-a51e-767985fd8fa7	6f7e2152-c6a2-47ca-b96e-9814df717a03	سامر	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.938013	2025-12-29 16:31:14.938013	\N
5b60b3c6-c57e-4b2c-bbb6-897f3052876b	6f7e2152-c6a2-47ca-b96e-9814df717a03	هناء	1	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.93837	2025-12-29 16:31:14.93837	\N
5cd8dc2a-88d7-4086-af70-fa26d8d71ed5	6f7e2152-c6a2-47ca-b96e-9814df717a03	اليسا	1	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.969548	2025-12-29 16:31:14.969548	\N
5ce8f136-8175-4034-9249-4458b20c1cab	6f7e2152-c6a2-47ca-b96e-9814df717a03	ثريا	1	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.971309	2025-12-29 16:31:14.97131	\N
5d0f3a15-3457-4304-ad3f-9e44c33dfc73	6f7e2152-c6a2-47ca-b96e-9814df717a03	اشراقه	1	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.958043	2025-12-29 16:31:14.958043	\N
5e856554-dfb5-4657-9265-01096f0f6451	6f7e2152-c6a2-47ca-b96e-9814df717a03	محمد	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.933647	2025-12-29 16:31:14.933647	\N
5ea9d2fc-288e-4997-b046-0b57b502e3d0	6f7e2152-c6a2-47ca-b96e-9814df717a03	محمد الهادى محمد كدوده	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.971668	2025-12-29 16:31:14.971668	\N
5eadca51-02e7-47a2-9678-afbf2965a3aa	6f7e2152-c6a2-47ca-b96e-9814df717a03	امير	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.962237	2025-12-29 16:31:14.962237	\N
5ee5eb1b-6f3f-469c-91b6-1c5300da8f71	6f7e2152-c6a2-47ca-b96e-9814df717a03	عبد الحليم	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.906522	2025-12-29 16:31:14.906522	\N
5f41b7a1-b5ac-4cf3-ad82-3735b1f050f4	6f7e2152-c6a2-47ca-b96e-9814df717a03	عزيزه	1	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.962912	2025-12-29 16:31:14.962912	\N
5fa4e123-d0a8-4e78-a27b-24c21fe856ed	6f7e2152-c6a2-47ca-b96e-9814df717a03	سنيه	1	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.94824	2025-12-29 16:31:14.94824	\N
5faf0d74-97e9-4988-b6f1-333a4d088bbf	6f7e2152-c6a2-47ca-b96e-9814df717a03	سماح	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.932133	2025-12-29 16:31:14.932133	\N
60bfd2da-842f-4c70-8a03-689c52e7c9d2	6f7e2152-c6a2-47ca-b96e-9814df717a03	شريفه	1	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.953523	2025-12-29 16:31:14.953523	\N
62325283-63f0-4f68-84f9-f52a8c6cde69	6f7e2152-c6a2-47ca-b96e-9814df717a03	محمد	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.917329	2025-12-29 16:31:14.917329	\N
62795491-b394-4bd9-8a2b-d4e2f91587bd	6f7e2152-c6a2-47ca-b96e-9814df717a03	تيسير	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.929355	2025-12-29 16:31:14.929355	\N
62856f54-242c-4f67-8220-cb451ce52031	6f7e2152-c6a2-47ca-b96e-9814df717a03	امين نورى	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.952705	2025-12-29 16:31:14.952705	\N
63f661ac-75e0-4aae-a1aa-879128891215	6f7e2152-c6a2-47ca-b96e-9814df717a03	صلاح احمد النعيم	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.970763	2025-12-29 16:31:14.970764	\N
6445e2a6-4866-41d2-a81c-eb1eb6a7c536	6f7e2152-c6a2-47ca-b96e-9814df717a03	عائشه	1	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.950979	2025-12-29 16:31:14.950979	\N
657ef2fe-29fb-41f2-96e4-e5687799b454	6f7e2152-c6a2-47ca-b96e-9814df717a03	زينب	1	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.913995	2025-12-29 16:31:14.913995	\N
6653dba6-6f95-4495-8e3a-3cc187266272	6f7e2152-c6a2-47ca-b96e-9814df717a03	حسن	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.914993	2025-12-29 16:31:14.914993	\N
66762b55-a7f9-4eb6-b679-1837ee6fcf9f	6f7e2152-c6a2-47ca-b96e-9814df717a03	سعيده	1	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.919249	2025-12-29 16:31:14.91925	\N
66952afa-c95b-45d8-9de3-c61ecebda807	6f7e2152-c6a2-47ca-b96e-9814df717a03	تغريد	1	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.961719	2025-12-29 16:31:14.961719	\N
66bfe7b7-2c8c-4cf5-ae84-8b348fe68cbd	6f7e2152-c6a2-47ca-b96e-9814df717a03	فاطمه	1	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.918385	2025-12-29 16:31:14.918385	\N
66c8f4e7-94fa-4ff6-b592-07e5ad89ed22	6f7e2152-c6a2-47ca-b96e-9814df717a03	شاهيناز	1	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.935614	2025-12-29 16:31:14.935614	\N
6812b606-b794-4227-a4ac-2084fa563655	6f7e2152-c6a2-47ca-b96e-9814df717a03	محمد	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.951741	2025-12-29 16:31:14.951741	\N
68641213-079d-4200-80e0-437391610deb	6f7e2152-c6a2-47ca-b96e-9814df717a03	زهره	1	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.921089	2025-12-29 16:31:14.921089	\N
6910f824-c647-4e09-8407-0a74245d41f2	6f7e2152-c6a2-47ca-b96e-9814df717a03	احيد	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.958223	2025-12-29 16:31:14.958223	\N
6921ef81-45c1-48a9-9e58-38fc2117ac58	6f7e2152-c6a2-47ca-b96e-9814df717a03	احمد	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.911905	2025-12-29 16:31:14.911905	\N
6965b15f-d56d-4014-b4dc-2296e0234ade	6f7e2152-c6a2-47ca-b96e-9814df717a03	فاطمه محمود	1	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.915845	2025-12-29 16:31:14.915845	\N
6988f9c8-0142-4cb1-a30f-60e513910da8	6f7e2152-c6a2-47ca-b96e-9814df717a03	فاطمه	1	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.930976	2025-12-29 16:31:14.930976	\N
6a128c37-f273-4914-999f-3d2b4b9e1443	6f7e2152-c6a2-47ca-b96e-9814df717a03	احمد	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.917766	2025-12-29 16:31:14.917766	\N
6a845e8b-803e-4104-8c22-a74ea7b85e2a	6f7e2152-c6a2-47ca-b96e-9814df717a03	كريم	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.969955	2025-12-29 16:31:14.969955	\N
6a98624b-3524-4aab-89cd-d41ca54b2207	6f7e2152-c6a2-47ca-b96e-9814df717a03	عزه	1	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.93765	2025-12-29 16:31:14.93765	\N
6b426b41-4463-4f26-af7b-91c5c103df83	6f7e2152-c6a2-47ca-b96e-9814df717a03	وفاء	1	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.959098	2025-12-29 16:31:14.959098	\N
6b4bc1f2-f7fd-4ca8-bb35-7a14eabfa434	6f7e2152-c6a2-47ca-b96e-9814df717a03	احمد	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.920113	2025-12-29 16:31:14.920113	\N
6b82c82a-d20c-44de-ade0-2bb0a29eb2c0	6f7e2152-c6a2-47ca-b96e-9814df717a03	فوزيه	1	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.94935	2025-12-29 16:31:14.94935	\N
6ba75b67-065b-4d8e-83f7-438a292e9285	6f7e2152-c6a2-47ca-b96e-9814df717a03	هانم	1	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.910368	2025-12-29 16:31:14.910368	\N
6c49b75d-7641-4a73-8174-62a31a9e91d2	6f7e2152-c6a2-47ca-b96e-9814df717a03	علويه	1	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.921258	2025-12-29 16:31:14.921258	\N
6c9ac109-ed1d-403d-a2f8-b8078a25a94a	6f7e2152-c6a2-47ca-b96e-9814df717a03	عبد الرحمن	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.933482	2025-12-29 16:31:14.933482	\N
6ce83efc-05d0-4c17-9d54-8f9eae1c0c63	6f7e2152-c6a2-47ca-b96e-9814df717a03	زينب	1	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.923209	2025-12-29 16:31:14.923209	\N
7138116f-fa84-4bcc-93ef-b3965b68e28c	6f7e2152-c6a2-47ca-b96e-9814df717a03	احمد	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.968047	2025-12-29 16:31:14.968047	\N
71baa9d5-46cd-4942-812e-2f49f5144350	6f7e2152-c6a2-47ca-b96e-9814df717a03	موهوب	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.938197	2025-12-29 16:31:14.938197	\N
721ce62e-4c0e-411f-85aa-53c785131c1c	6f7e2152-c6a2-47ca-b96e-9814df717a03	احمد	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.941445	2025-12-29 16:31:14.941445	\N
74b38e76-dfbe-409b-ba03-f39025b6de2b	6f7e2152-c6a2-47ca-b96e-9814df717a03	هانم	1	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.918643	2025-12-29 16:31:14.918643	\N
757c135f-7d90-4b8f-a1a0-47a23ed1b601	6f7e2152-c6a2-47ca-b96e-9814df717a03	محمد حسن	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.950743	2025-12-29 16:31:14.950743	\N
7726dceb-4193-4202-a422-f39aa003c3c6	6f7e2152-c6a2-47ca-b96e-9814df717a03	مهند	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.97044	2025-12-29 16:31:14.97044	\N
77759e69-6fc4-4eeb-b591-751f3ca36f68	6f7e2152-c6a2-47ca-b96e-9814df717a03	زينب	1	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.919599	2025-12-29 16:31:14.919599	\N
7915d38b-983d-4280-a2ce-1b1714d70ba6	6f7e2152-c6a2-47ca-b96e-9814df717a03	لقمان	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.946065	2025-12-29 16:31:14.946065	\N
79fb0e06-dbb5-4d11-bacd-e332b736d1c6	6f7e2152-c6a2-47ca-b96e-9814df717a03	صفيه	1	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.954752	2025-12-29 16:31:14.954752	\N
7b053907-6f2c-429a-b61e-775ffe91d482	6f7e2152-c6a2-47ca-b96e-9814df717a03	عاصم	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.934666	2025-12-29 16:31:14.934666	\N
7bf610c8-5a1b-4c9e-91e5-49d7c7bccc0a	6f7e2152-c6a2-47ca-b96e-9814df717a03	أواب	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.965691	2025-12-29 16:31:14.965691	\N
7bf62e83-8b40-4612-8180-ed6799b3c5cd	6f7e2152-c6a2-47ca-b96e-9814df717a03	عبد الرحيم	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.922132	2025-12-29 16:31:14.922132	\N
7d5d9172-1051-46f9-b53a-b373f75fd561	6f7e2152-c6a2-47ca-b96e-9814df717a03	تسنيم	1	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.963261	2025-12-29 16:31:14.963261	\N
7dce3336-a904-4e58-b4ee-4b90af944e44	6f7e2152-c6a2-47ca-b96e-9814df717a03	فوزيه	1	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.925934	2025-12-29 16:31:14.925934	\N
7de1781e-89dd-4454-800c-5ba3c1ec7885	6f7e2152-c6a2-47ca-b96e-9814df717a03	منى	1	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.974538	2025-12-29 16:31:14.974538	\N
7df9a2f8-36e9-42e2-b5a4-b3e3716e8848	6f7e2152-c6a2-47ca-b96e-9814df717a03	نور	1	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.976122	2025-12-29 16:31:14.976122	\N
8039b17f-3028-43be-9ba8-1c3498ef85a9	6f7e2152-c6a2-47ca-b96e-9814df717a03	عائشه ابا يزيد	1	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.909272	2025-12-29 16:31:14.909272	\N
806c3be9-5054-40a0-a67c-89c184a0e34b	6f7e2152-c6a2-47ca-b96e-9814df717a03	محمد	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.961901	2025-12-29 16:31:14.961901	\N
8080f304-88e7-4326-89c8-5708d13fbcf0	6f7e2152-c6a2-47ca-b96e-9814df717a03	محاسن	1	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.94266	2025-12-29 16:31:14.94266	\N
8152d60b-ded3-4367-8ea1-00c3d23ae4fe	6f7e2152-c6a2-47ca-b96e-9814df717a03	فاطمه	1	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.959969	2025-12-29 16:31:14.959969	\N
81720561-a4a7-4054-96e4-02a89cf0c9ca	6f7e2152-c6a2-47ca-b96e-9814df717a03	سهى	1	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.976474	2025-12-29 16:31:14.976474	\N
818a3554-ada0-4144-81ba-ea2d00b18851	6f7e2152-c6a2-47ca-b96e-9814df717a03	عبد القادر	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.913321	2025-12-29 16:31:14.913321	\N
8206cda8-fa63-444c-a163-cca7b9db0620	6f7e2152-c6a2-47ca-b96e-9814df717a03	بدر	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.794911	2025-12-29 16:31:14.794965	\N
822cc8a5-c22d-4a68-9375-662ea3b2dfc6	6f7e2152-c6a2-47ca-b96e-9814df717a03	عبد القادر	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.911247	2025-12-29 16:31:14.911247	\N
82cc8c14-bd9b-4002-836d-4d0b4a712a4d	6f7e2152-c6a2-47ca-b96e-9814df717a03	محمد	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.912077	2025-12-29 16:31:14.912077	\N
83050d08-4624-4abf-9565-2344da76d757	6f7e2152-c6a2-47ca-b96e-9814df717a03	محمد	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.97019	2025-12-29 16:31:14.97019	\N
842b98e1-7e28-434f-823a-cb52acf765f5	6f7e2152-c6a2-47ca-b96e-9814df717a03	عبد المنعم	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.920738	2025-12-29 16:31:14.920738	\N
8467f635-2740-4777-b39b-280d34080905	6f7e2152-c6a2-47ca-b96e-9814df717a03	وداد	1	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.959273	2025-12-29 16:31:14.959273	\N
854b2dd2-5036-45a3-a142-26e5ee1d64cf	6f7e2152-c6a2-47ca-b96e-9814df717a03	فريد	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.932957	2025-12-29 16:31:14.932957	\N
86247581-25d4-4736-a2b4-9d8e62e0afbd	6f7e2152-c6a2-47ca-b96e-9814df717a03	ساره	1	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.971133	2025-12-29 16:31:14.971134	\N
8648c111-f28f-4f0f-9dec-8d88f3455274	6f7e2152-c6a2-47ca-b96e-9814df717a03	فاطمه	1	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.929181	2025-12-29 16:31:14.929181	\N
87418f4f-d319-4998-9ab4-d3b6fd6be733	6f7e2152-c6a2-47ca-b96e-9814df717a03	نبيل	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.937291	2025-12-29 16:31:14.937291	\N
874fc067-a244-478a-ace5-0d352e439606	6f7e2152-c6a2-47ca-b96e-9814df717a03	عبد القادر	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.916506	2025-12-29 16:31:14.916506	\N
878307d1-6e66-4245-97f4-7cb71982ec00	6f7e2152-c6a2-47ca-b96e-9814df717a03	ايهاب	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.946252	2025-12-29 16:31:14.946252	\N
8815f86f-febd-4639-bd1d-0e946afa280b	6f7e2152-c6a2-47ca-b96e-9814df717a03	بتول	1	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.923933	2025-12-29 16:31:14.923933	\N
883f5f91-3f16-4eab-8744-e519e45d256f	6f7e2152-c6a2-47ca-b96e-9814df717a03	نوال	1	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.940376	2025-12-29 16:31:14.940376	\N
898cfffd-6302-4f0a-99fa-63ab41e07dc1	6f7e2152-c6a2-47ca-b96e-9814df717a03	مصطفى	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.94727	2025-12-29 16:31:14.94727	\N
8a0a9041-138d-401a-9388-4c09f183c103	6f7e2152-c6a2-47ca-b96e-9814df717a03	كريم	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.964455	2025-12-29 16:31:14.964456	\N
8a0f7a9d-fda3-43eb-97c5-369b3a2ac52f	6f7e2152-c6a2-47ca-b96e-9814df717a03	حماد	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.956392	2025-12-29 16:31:14.956393	\N
8b3026e0-921c-4f17-970e-f2ec5724fc51	6f7e2152-c6a2-47ca-b96e-9814df717a03	فاطمه	1	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.931518	2025-12-29 16:31:14.931518	\N
8ba9f4f4-0fc9-445d-805d-2e0ed559c149	6f7e2152-c6a2-47ca-b96e-9814df717a03	ايمن	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.972225	2025-12-29 16:31:14.972225	\N
8c370e5c-63ad-46a4-96ae-be21a5ea8683	6f7e2152-c6a2-47ca-b96e-9814df717a03	عادل	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.924381	2025-12-29 16:31:14.924381	\N
8c6f490b-55da-45f3-b1f6-ae54dde406ef	6f7e2152-c6a2-47ca-b96e-9814df717a03	سميحه	1	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.923037	2025-12-29 16:31:14.923037	\N
8cd3209b-7b52-4a4c-a92a-1f8cd6b5e407	6f7e2152-c6a2-47ca-b96e-9814df717a03	نفيسه	1	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.933989	2025-12-29 16:31:14.933989	\N
8e032a15-783b-40d2-8c8c-33aa63af9c63	6f7e2152-c6a2-47ca-b96e-9814df717a03	زينب	1	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.968443	2025-12-29 16:31:14.968443	\N
8f4c4dff-b017-4a1d-b563-6bfcaba29a1d	6f7e2152-c6a2-47ca-b96e-9814df717a03	على	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.914662	2025-12-29 16:31:14.914662	\N
8f7b424e-9eb8-4751-a80e-3a8313d1b7d9	6f7e2152-c6a2-47ca-b96e-9814df717a03	احمد	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.928498	2025-12-29 16:31:14.928498	\N
8f87d17f-3cd4-42c0-b09f-f1f0cedb8584	6f7e2152-c6a2-47ca-b96e-9814df717a03	حفيظه	1	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.914335	2025-12-29 16:31:14.914335	\N
910b2aa8-9ffa-4bd5-bc9c-8bdb446bab2f	6f7e2152-c6a2-47ca-b96e-9814df717a03	مصطفى	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.966215	2025-12-29 16:31:14.966215	\N
91460bc8-a143-40f4-96ad-b94328ca5d9f	6f7e2152-c6a2-47ca-b96e-9814df717a03	عمرو	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.969158	2025-12-29 16:31:14.969158	\N
9235266f-7ffa-492b-b318-795465417e73	6f7e2152-c6a2-47ca-b96e-9814df717a03	حرم ابايزيد	1	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.933308	2025-12-29 16:31:14.933308	\N
9254c9c2-552b-48b6-bf47-ec7b9f024086	6f7e2152-c6a2-47ca-b96e-9814df717a03	بدر	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.909815	2025-12-29 16:31:14.909815	\N
925b6cd7-e284-4d9a-9f84-aff837ea3a64	6f7e2152-c6a2-47ca-b96e-9814df717a03	رضا	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.945001	2025-12-29 16:31:14.945001	\N
934ca836-be77-422a-9cbd-34fb31969486	6f7e2152-c6a2-47ca-b96e-9814df717a03	وائل	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.94518	2025-12-29 16:31:14.945181	\N
9463577f-8e4a-4f1b-a3d7-17e2eb9ce025	6f7e2152-c6a2-47ca-b96e-9814df717a03	عبد الله	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.948818	2025-12-29 16:31:14.948818	\N
9526efce-2894-4b4f-a2fb-9d1d6a22015c	6f7e2152-c6a2-47ca-b96e-9814df717a03	عثمان	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.953134	2025-12-29 16:31:14.953134	\N
9588ae77-fb61-481a-95fe-d44540d9c0c9	6f7e2152-c6a2-47ca-b96e-9814df717a03	زهره	1	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.948994	2025-12-29 16:31:14.948994	\N
95e11722-dda6-4ba8-88c4-e68494398ecf	6f7e2152-c6a2-47ca-b96e-9814df717a03	محمد	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.959792	2025-12-29 16:31:14.959792	\N
961fac6f-57ec-4e37-81f9-08325ba1548e	6f7e2152-c6a2-47ca-b96e-9814df717a03	شهد	1	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.964635	2025-12-29 16:31:14.964635	\N
963a9695-5acd-4162-aff2-03b33022cdd4	6f7e2152-c6a2-47ca-b96e-9814df717a03	فاطمه	1	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.910888	2025-12-29 16:31:14.910888	\N
9649dc43-7677-454a-acdb-68adf33bbce3	6f7e2152-c6a2-47ca-b96e-9814df717a03	زهره	1	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.908567	2025-12-29 16:31:14.908567	\N
97586628-2092-49e3-9556-8a04c4423ee4	6f7e2152-c6a2-47ca-b96e-9814df717a03	محمد	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.913087	2025-12-29 16:31:14.913087	\N
975c5df5-0586-4f04-b84d-be22ce5956cd	6f7e2152-c6a2-47ca-b96e-9814df717a03	واجده	1	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.958922	2025-12-29 16:31:14.958922	\N
976db09a-ec7a-4241-bdc8-f98763174305	6f7e2152-c6a2-47ca-b96e-9814df717a03	خديجه	1	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.942314	2025-12-29 16:31:14.942314	\N
97e0dc07-6ba9-41b3-a392-f4f0a0ef2737	6f7e2152-c6a2-47ca-b96e-9814df717a03	برى	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.90889	2025-12-29 16:31:14.90889	\N
98056226-655c-4f92-8216-199573920cd7	6f7e2152-c6a2-47ca-b96e-9814df717a03	سعيده	1	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.921792	2025-12-29 16:31:14.921792	\N
984cdf4d-965a-446a-9bfd-623f1a067fbd	6f7e2152-c6a2-47ca-b96e-9814df717a03	عصام	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.934382	2025-12-29 16:31:14.934382	\N
99fe3a58-fd18-4de2-bcf6-0971b019fb65	6f7e2152-c6a2-47ca-b96e-9814df717a03	عبد الحليم	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.915341	2025-12-29 16:31:14.915341	\N
9a1c68b9-7b7c-40d7-9f53-ba5b5c84e7db	6f7e2152-c6a2-47ca-b96e-9814df717a03	شاديه	1	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.955664	2025-12-29 16:31:14.955664	\N
9a1d400a-0dee-4bb9-93d9-a74f15f3cb98	6f7e2152-c6a2-47ca-b96e-9814df717a03	اسامه	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.923556	2025-12-29 16:31:14.923556	\N
9a5cef95-9851-4265-9c0f-fa8efb1409af	6f7e2152-c6a2-47ca-b96e-9814df717a03	شاهيناز	1	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.974005	2025-12-29 16:31:14.974005	\N
9ae2788b-8596-4ef7-9682-08124da02aee	6f7e2152-c6a2-47ca-b96e-9814df717a03	سناء	1	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.926279	2025-12-29 16:31:14.926279	\N
9be2e68a-9266-4a0e-a103-ba446735f2dd	6f7e2152-c6a2-47ca-b96e-9814df717a03	فاروق	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.927644	2025-12-29 16:31:14.927644	\N
9e233a52-68ac-4562-bed2-3fbae2aec730	6f7e2152-c6a2-47ca-b96e-9814df717a03	عباس	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.914828	2025-12-29 16:31:14.914828	\N
9e3b5733-9174-42c4-ae99-d7d15a640b2b	6f7e2152-c6a2-47ca-b96e-9814df717a03	بتول	1	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.920913	2025-12-29 16:31:14.920913	\N
9ea9feb7-4bdf-40e7-ac99-f7d7d0969229	6f7e2152-c6a2-47ca-b96e-9814df717a03	رقيه	1	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.923382	2025-12-29 16:31:14.923382	\N
9ec8c2ad-7a10-4e0d-b22c-dbf241a5e84c	6f7e2152-c6a2-47ca-b96e-9814df717a03	ساره	1	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.957524	2025-12-29 16:31:14.957524	\N
9f7d376d-1ba6-427e-9630-1fb8bbb07f91	6f7e2152-c6a2-47ca-b96e-9814df717a03	عفيفه	1	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.935062	2025-12-29 16:31:14.935062	\N
a0d28119-3e65-42d4-8f64-61ef2942b030	6f7e2152-c6a2-47ca-b96e-9814df717a03	عليه	1	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.941973	2025-12-29 16:31:14.941973	\N
a174a146-486c-4fe0-9643-a152153d1b27	6f7e2152-c6a2-47ca-b96e-9814df717a03	نفيسه	1	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.949527	2025-12-29 16:31:14.949527	\N
a1c06163-d2d7-439d-b905-5455cc4c16a4	6f7e2152-c6a2-47ca-b96e-9814df717a03	زينب	1	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.94918	2025-12-29 16:31:14.94918	\N
a20d7808-69be-49ef-8a9c-58dbe9bef865	6f7e2152-c6a2-47ca-b96e-9814df717a03	هانم	1	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.952087	2025-12-29 16:31:14.952087	\N
a2559eae-1de4-4ff0-9c8b-785fd86bf28d	6f7e2152-c6a2-47ca-b96e-9814df717a03	فردوس	1	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.927301	2025-12-29 16:31:14.927301	\N
a3177ae6-e4a7-4f49-a4eb-40c3c7f8a616	6f7e2152-c6a2-47ca-b96e-9814df717a03	محمد	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.946914	2025-12-29 16:31:14.946914	\N
a45a0267-d72a-4b26-8d48-2b780eae7557	6f7e2152-c6a2-47ca-b96e-9814df717a03	صلاح	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.96274	2025-12-29 16:31:14.96274	\N
a4675322-ed29-4968-8aba-2c803366d80e	6f7e2152-c6a2-47ca-b96e-9814df717a03	صفاء	1	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.937822	2025-12-29 16:31:14.937823	\N
a4e1763e-23f3-4b7f-bb31-16d23e30ee97	6f7e2152-c6a2-47ca-b96e-9814df717a03	نبويه	1	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.946752	2025-12-29 16:31:14.946752	\N
a73b79fe-5694-45ee-99e5-55755fc11d06	6f7e2152-c6a2-47ca-b96e-9814df717a03	امين حسن	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.96766	2025-12-29 16:31:14.96766	\N
a76d5270-26c2-46f6-af85-4d3f892320e9	6f7e2152-c6a2-47ca-b96e-9814df717a03	صفوت	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.941101	2025-12-29 16:31:14.941101	\N
a7a723f7-e6af-4eb7-b711-4f211531d424	6f7e2152-c6a2-47ca-b96e-9814df717a03	سلوى	1	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.926617	2025-12-29 16:31:14.926617	\N
a887abc4-617f-4417-a43e-2017f9e69c1c	6f7e2152-c6a2-47ca-b96e-9814df717a03	اميمه	1	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.935786	2025-12-29 16:31:14.935786	\N
a8bb31d9-739f-4081-8a25-b8dfc1fbb1c3	6f7e2152-c6a2-47ca-b96e-9814df717a03	الفاتح محمد عبدون	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.964807	2025-12-29 16:31:14.964807	\N
a8c68d0c-9488-4a1d-9624-665175ef1c59	6f7e2152-c6a2-47ca-b96e-9814df717a03	محمد	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.967868	2025-12-29 16:31:14.967868	\N
a8da5c60-9950-4a61-8bdb-01251affa1b9	6f7e2152-c6a2-47ca-b96e-9814df717a03	محمد	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.97436	2025-12-29 16:31:14.97436	\N
a97610b7-bbf7-4c51-b401-ef93890feb3f	6f7e2152-c6a2-47ca-b96e-9814df717a03	سوسن	1	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.944137	2025-12-29 16:31:14.944137	\N
aa0ec19d-05fe-4c67-8462-5fc99badd90d	6f7e2152-c6a2-47ca-b96e-9814df717a03	هجره	1	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.910539	2025-12-29 16:31:14.910539	\N
aa971367-e937-482e-b716-43b0c8b4bd94	6f7e2152-c6a2-47ca-b96e-9814df717a03	وئام	1	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.960146	2025-12-29 16:31:14.960146	\N
abc95b43-ba5c-43a4-9946-7190e458f953	6f7e2152-c6a2-47ca-b96e-9814df717a03	سيد	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.912749	2025-12-29 16:31:14.912749	\N
ac5fe8ed-d1c4-4ac8-bc93-ec9a906d5f7d	6f7e2152-c6a2-47ca-b96e-9814df717a03	محمد صالح شريف	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.922471	2025-12-29 16:31:14.922471	\N
ac78fc6b-1bd3-4657-a9be-28941be581dd	6f7e2152-c6a2-47ca-b96e-9814df717a03	عبد الرحيم	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.915168	2025-12-29 16:31:14.915169	\N
ac7ead63-ff75-4624-839f-7561f79867fc	6f7e2152-c6a2-47ca-b96e-9814df717a03	احمد	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.9688	2025-12-29 16:31:14.9688	\N
ac9e038f-0460-4c55-ac28-5e5500ab953b	6f7e2152-c6a2-47ca-b96e-9814df717a03	منى	1	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.961013	2025-12-29 16:31:14.961013	\N
acdc1662-5acd-49a8-bcdf-b74f6e57b4b3	6f7e2152-c6a2-47ca-b96e-9814df717a03	فاطمه	1	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.91365	2025-12-29 16:31:14.91365	\N
ad99bb72-4ede-4dda-8a06-91aeed3e4683	6f7e2152-c6a2-47ca-b96e-9814df717a03	ابراهيم	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.964042	2025-12-29 16:31:14.964042	\N
ae0755a8-a20e-47b1-abf9-5fc6f7347139	6f7e2152-c6a2-47ca-b96e-9814df717a03	داليا	1	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.974715	2025-12-29 16:31:14.974715	\N
ae0cd9a8-1fae-4418-bf28-e8fadc2fbc74	6f7e2152-c6a2-47ca-b96e-9814df717a03	عمر	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.936256	2025-12-29 16:31:14.936256	\N
b046d245-e224-482d-ad09-e571f84d37ff	6f7e2152-c6a2-47ca-b96e-9814df717a03	محمود	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.925578	2025-12-29 16:31:14.925578	\N
b0ff5995-4e69-4358-b79d-3fa6fef0a69b	6f7e2152-c6a2-47ca-b96e-9814df717a03	فاطمه	1	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.908386	2025-12-29 16:31:14.908386	\N
b16e1013-de3c-4876-8f2d-41033e1ffb28	6f7e2152-c6a2-47ca-b96e-9814df717a03	معز	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.940752	2025-12-29 16:31:14.940752	\N
b1d2b30a-32a3-4db8-9927-6a212b2a79a0	6f7e2152-c6a2-47ca-b96e-9814df717a03	حنان	1	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.946583	2025-12-29 16:31:14.946583	\N
b2172455-58f5-416c-bfc5-a1f2b6caff88	6f7e2152-c6a2-47ca-b96e-9814df717a03	محمد حسن امين	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.945355	2025-12-29 16:31:14.945355	\N
b2bea596-1fcc-4a7f-a6d7-fc9a0d26e265	6f7e2152-c6a2-47ca-b96e-9814df717a03	صباح	1	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.941626	2025-12-29 16:31:14.941626	\N
b594b5d0-3703-49cd-865b-790ac271e59a	6f7e2152-c6a2-47ca-b96e-9814df717a03	هدى	1	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.943961	2025-12-29 16:31:14.943961	\N
b5f48e56-c241-419c-8a6e-376e7ee236a7	6f7e2152-c6a2-47ca-b96e-9814df717a03	محمود	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.927986	2025-12-29 16:31:14.927987	\N
b610bb22-f766-4f82-b792-f7fbb2f7003b	6f7e2152-c6a2-47ca-b96e-9814df717a03	نفيسه	1	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.907202	2025-12-29 16:31:14.907202	\N
b6701ec5-5278-4e7f-9909-8a3058c079d9	6f7e2152-c6a2-47ca-b96e-9814df717a03	منيره	1	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.910186	2025-12-29 16:31:14.910186	\N
b713c623-e12c-4c4f-bef6-d2a387f88359	6f7e2152-c6a2-47ca-b96e-9814df717a03	حسام	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.932609	2025-12-29 16:31:14.932609	\N
b73dbd91-9da4-45d2-b76e-b35376828646	6f7e2152-c6a2-47ca-b96e-9814df717a03	راحيل	1	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.931685	2025-12-29 16:31:14.931685	\N
b7d8ced6-a4fd-4fec-b75c-63daf3324e8d	6f7e2152-c6a2-47ca-b96e-9814df717a03	مجتبى	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.954056	2025-12-29 16:31:14.954056	\N
b871ee60-01ee-4d41-aebf-db6a2334744b	6f7e2152-c6a2-47ca-b96e-9814df717a03	مشعل	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.954578	2025-12-29 16:31:14.954578	\N
b88dfb6a-da70-4ea5-ad2c-efd1c33156b9	6f7e2152-c6a2-47ca-b96e-9814df717a03	اسامه	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.975419	2025-12-29 16:31:14.975419	\N
b9b13aae-11e6-4e84-b1f2-b57d2918d3d5	6f7e2152-c6a2-47ca-b96e-9814df717a03	نسمات	1	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.940929	2025-12-29 16:31:14.940929	\N
b9c4aff5-4d35-41a2-90a7-6b8bf2aaf132	6f7e2152-c6a2-47ca-b96e-9814df717a03	عزيزه	1	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.947618	2025-12-29 16:31:14.947618	\N
bbc3495b-afe0-4294-958a-a8d0560b5ff8	6f7e2152-c6a2-47ca-b96e-9814df717a03	سميحه	1	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.939624	2025-12-29 16:31:14.939624	\N
bbf75e1b-d67c-40b9-b369-05ad4de6ea65	6f7e2152-c6a2-47ca-b96e-9814df717a03	احمد	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.972041	2025-12-29 16:31:14.972042	\N
bc84fece-9dc6-4241-87d8-a006e42023e3	6f7e2152-c6a2-47ca-b96e-9814df717a03	ندى	1	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.956037	2025-12-29 16:31:14.956037	\N
bd950ffd-8680-4803-b845-1542f9f85549	6f7e2152-c6a2-47ca-b96e-9814df717a03	مهند	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.96207	2025-12-29 16:31:14.96207	\N
bea89bd4-6d67-48d7-8235-0ceca57feffc	6f7e2152-c6a2-47ca-b96e-9814df717a03	فاطمه	1	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.910704	2025-12-29 16:31:14.910704	\N
bf49f9ee-2dde-4ab1-ac5a-0a7eeb49183f	6f7e2152-c6a2-47ca-b96e-9814df717a03	شيماء	1	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.957348	2025-12-29 16:31:14.957348	\N
c06bea75-1372-4d24-a784-d45caae6fb2d	6f7e2152-c6a2-47ca-b96e-9814df717a03	مجدى	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.97559	2025-12-29 16:31:14.97559	\N
c3aa665d-1a7a-40c9-b6be-fe9a43fcd8f7	6f7e2152-c6a2-47ca-b96e-9814df717a03	ندى	1	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.971489	2025-12-29 16:31:14.971489	\N
c3b48982-c487-4f76-a575-2a6e889b03ca	6f7e2152-c6a2-47ca-b96e-9814df717a03	مصدق	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.925747	2025-12-29 16:31:14.925747	\N
c3ebb6f6-de02-4b1a-8f71-fbd3c26eae45	6f7e2152-c6a2-47ca-b96e-9814df717a03	سعيده	1	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.947447	2025-12-29 16:31:14.947447	\N
c4961ae1-d224-4c65-b472-e11cf7517795	6f7e2152-c6a2-47ca-b96e-9814df717a03	محاسن	1	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.94431	2025-12-29 16:31:14.94431	\N
c583a531-e16c-40df-8694-b52868b4b74f	6f7e2152-c6a2-47ca-b96e-9814df717a03	وليد	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.958567	2025-12-29 16:31:14.958567	\N
c738a843-0054-47cb-b491-d13f66b1893b	6f7e2152-c6a2-47ca-b96e-9814df717a03	سحر	1	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.935251	2025-12-29 16:31:14.935251	\N
c7fb008f-02f4-424c-ba55-b6dfbacec930	6f7e2152-c6a2-47ca-b96e-9814df717a03	هانى	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.973487	2025-12-29 16:31:14.973487	\N
c8d20780-df3f-439b-a60f-b36d79bc2f77	6f7e2152-c6a2-47ca-b96e-9814df717a03	اقبال	1	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.930039	2025-12-29 16:31:14.930039	\N
c994605c-13ff-4378-880d-4dbed278c51d	6f7e2152-c6a2-47ca-b96e-9814df717a03	امال	1	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.974892	2025-12-29 16:31:14.974892	\N
ca7e271a-b330-40d5-98c1-17cba2b22e3a	6f7e2152-c6a2-47ca-b96e-9814df717a03	محمد عثمان(شلتوت)	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.924736	2025-12-29 16:31:14.924737	\N
cab8e0bd-4e05-450b-bef7-4b8651d5295f	6f7e2152-c6a2-47ca-b96e-9814df717a03	خضره	1	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.915679	2025-12-29 16:31:14.915679	\N
cb190884-e061-4db9-8cc2-c0aa05378280	6f7e2152-c6a2-47ca-b96e-9814df717a03	فاطمه	1	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.937472	2025-12-29 16:31:14.937472	\N
cb3d8eb8-2628-4ee0-a199-97e0a7a530d1	6f7e2152-c6a2-47ca-b96e-9814df717a03	محمد كدوده	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.921958	2025-12-29 16:31:14.921958	\N
cc5b31d8-55c1-48c1-8b90-948dc0fb4624	6f7e2152-c6a2-47ca-b96e-9814df717a03	محمد	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.956216	2025-12-29 16:31:14.956216	\N
cda43562-bfa2-4831-876f-36adfbf0e499	6f7e2152-c6a2-47ca-b96e-9814df717a03	منيره	1	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.918831	2025-12-29 16:31:14.918831	\N
cda741ed-afbb-4795-a2ec-6e6b0375f0d0	6f7e2152-c6a2-47ca-b96e-9814df717a03	لطيفه	1	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.92816	2025-12-29 16:31:14.92816	\N
ce2713e6-1855-4496-b9e4-ff650700b7ef	6f7e2152-c6a2-47ca-b96e-9814df717a03	منى	1	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.976653	2025-12-29 16:31:14.976653	\N
ce3ba4b4-7942-43bc-8a09-16f662ff7542	6f7e2152-c6a2-47ca-b96e-9814df717a03	اشرف	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.971838	2025-12-29 16:31:14.971838	\N
cfcdeebb-3b56-4553-904f-397f374b92a8	6f7e2152-c6a2-47ca-b96e-9814df717a03	فاطمه	1	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.912246	2025-12-29 16:31:14.912246	\N
d21ab576-80be-4b37-823e-25820fc9e16b	6f7e2152-c6a2-47ca-b96e-9814df717a03	نعمات	1	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.943616	2025-12-29 16:31:14.943616	\N
d2ee12d5-5848-48c2-91a6-ffc49270bca1	6f7e2152-c6a2-47ca-b96e-9814df717a03	هجره	1	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.951562	2025-12-29 16:31:14.951562	\N
d46e7da8-4299-4bb8-840f-364823f42406	6f7e2152-c6a2-47ca-b96e-9814df717a03	فاطمه	1	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.952526	2025-12-29 16:31:14.952526	\N
d4fb5def-d0d6-4d1a-9095-58f16285ab6f	6f7e2152-c6a2-47ca-b96e-9814df717a03	انتصار	1	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.929691	2025-12-29 16:31:14.929691	\N
d7467f95-6146-493e-b209-686878c3e641	6f7e2152-c6a2-47ca-b96e-9814df717a03	حاتم	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.938551	2025-12-29 16:31:14.938551	\N
d7efedae-b5ad-43b0-9086-6749206f7216	6f7e2152-c6a2-47ca-b96e-9814df717a03	احمد	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.975242	2025-12-29 16:31:14.975242	\N
d84a5ca2-0f0f-4a2f-9522-d3507f95ebde	6f7e2152-c6a2-47ca-b96e-9814df717a03	فاطمه	1	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.961197	2025-12-29 16:31:14.961198	\N
d88c0ea1-6d59-418b-a938-2e6aa399ed22	6f7e2152-c6a2-47ca-b96e-9814df717a03	محمد مصطفى	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.96586	2025-12-29 16:31:14.96586	\N
d8ade05c-ef45-4ad8-b8f1-7a67431d667e	6f7e2152-c6a2-47ca-b96e-9814df717a03	ساريه	1	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.954922	2025-12-29 16:31:14.954922	\N
d913e8e7-7b5a-4516-8d86-0bc443170546	6f7e2152-c6a2-47ca-b96e-9814df717a03	شاهر	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.950566	2025-12-29 16:31:14.950566	\N
da16a5f1-3899-4c27-b5fd-cc67e1eb6826	6f7e2152-c6a2-47ca-b96e-9814df717a03	حليمه ابايزيد	1	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.949876	2025-12-29 16:31:14.949876	\N
da68554d-b7cb-46e5-b8ac-f01a7cbfa835	6f7e2152-c6a2-47ca-b96e-9814df717a03	عزه	1	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.975768	2025-12-29 16:31:14.975768	\N
db12a4fc-6e43-473d-9239-c5fd59c33e3e	6f7e2152-c6a2-47ca-b96e-9814df717a03	فاطمه	1	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.907815	2025-12-29 16:31:14.907815	\N
db41a3d7-dd86-46a6-bddc-3928f11adb74	6f7e2152-c6a2-47ca-b96e-9814df717a03	احمد	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.928333	2025-12-29 16:31:14.928333	\N
dcfb3ecf-2e43-4c4f-a6bd-6ca52405380e	6f7e2152-c6a2-47ca-b96e-9814df717a03	فدوى	1	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.966922	2025-12-29 16:31:14.966922	\N
dd8ce14b-7b18-4673-a974-cbf78d659082	6f7e2152-c6a2-47ca-b96e-9814df717a03	محمد	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.941799	2025-12-29 16:31:14.941799	\N
de21836e-36a4-4655-b204-d32aed148699	6f7e2152-c6a2-47ca-b96e-9814df717a03	محمد	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.936039	2025-12-29 16:31:14.936039	\N
df1eb182-11bc-4b01-8f31-fceb22540354	6f7e2152-c6a2-47ca-b96e-9814df717a03	محمد	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.912918	2025-12-29 16:31:14.912918	\N
df227c3f-0f26-4e93-b7b9-dd6802a061a5	6f7e2152-c6a2-47ca-b96e-9814df717a03	فاطمه (بابا زهره)	1	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.950222	2025-12-29 16:31:14.950222	\N
df60a1ec-ab32-45b2-9ca2-93f7926ffa96	6f7e2152-c6a2-47ca-b96e-9814df717a03	امينه	1	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.914161	2025-12-29 16:31:14.914161	\N
e11c4b99-c61e-48d4-a36b-8fa1b9562e0a	6f7e2152-c6a2-47ca-b96e-9814df717a03	هادى	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.945697	2025-12-29 16:31:14.945697	\N
e1911895-7775-491c-a755-ef8a5dbe337e	6f7e2152-c6a2-47ca-b96e-9814df717a03	مروان	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.929872	2025-12-29 16:31:14.929872	\N
e1b7b70c-bd56-42e3-8464-e04327fc62c4	6f7e2152-c6a2-47ca-b96e-9814df717a03	زهره	1	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.977002	2025-12-29 16:31:14.977002	\N
e1d30736-5971-45ff-a06a-f4de4a7acf7e	6f7e2152-c6a2-47ca-b96e-9814df717a03	مها	1	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.973128	2025-12-29 16:31:14.973128	\N
e296e3ad-4772-4d8b-a76d-b653912d2029	6f7e2152-c6a2-47ca-b96e-9814df717a03	عمر	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.968621	2025-12-29 16:31:14.968621	\N
e31e9e9a-9a83-49bf-97e0-9c1d6ebf09c6	6f7e2152-c6a2-47ca-b96e-9814df717a03	نبره	1	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.969371	2025-12-29 16:31:14.969372	\N
e35a59c7-dd2c-4085-88ab-345a2978d6bd	6f7e2152-c6a2-47ca-b96e-9814df717a03	احمد عبد الرحمن فقير	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.924557	2025-12-29 16:31:14.924557	\N
e44cd487-3c0b-438c-819e-462bc3480ef1	6f7e2152-c6a2-47ca-b96e-9814df717a03	فاطمه	1	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.916668	2025-12-29 16:31:14.916668	\N
e45421fd-a9ed-492d-8f70-1140742f562c	6f7e2152-c6a2-47ca-b96e-9814df717a03	جليله	1	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.952318	2025-12-29 16:31:14.952318	\N
e45d13e2-7506-4a76-b530-ee69fd0eb2b1	6f7e2152-c6a2-47ca-b96e-9814df717a03	داريه	1	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.908209	2025-12-29 16:31:14.908209	\N
e4785339-9e4f-41e6-9d41-c31a5ed1883d	6f7e2152-c6a2-47ca-b96e-9814df717a03	فواز	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.9577	2025-12-29 16:31:14.9577	\N
e58d2487-41a2-4856-8eec-31a6cb8f3bf6	6f7e2152-c6a2-47ca-b96e-9814df717a03	منصور	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.958743	2025-12-29 16:31:14.958743	\N
e68c6def-f9fb-402e-8066-54a33bd5dd68	6f7e2152-c6a2-47ca-b96e-9814df717a03	شريفه	1	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.927474	2025-12-29 16:31:14.927474	\N
e7882853-cc7a-4faa-adcc-ca1b29c661f9	6f7e2152-c6a2-47ca-b96e-9814df717a03	يوسف	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.976296	2025-12-29 16:31:14.976297	\N
e7c9085f-4613-453d-8233-7171e2cf9609	6f7e2152-c6a2-47ca-b96e-9814df717a03	امنه	1	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.907605	2025-12-29 16:31:14.907605	\N
e860251a-9d40-4de4-9dcb-1b93469fdf0c	6f7e2152-c6a2-47ca-b96e-9814df717a03	السمؤل	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.956997	2025-12-29 16:31:14.956997	\N
e8b6f8e0-7503-4834-b07a-7501aec4aac9	6f7e2152-c6a2-47ca-b96e-9814df717a03	مصطفى	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.925235	2025-12-29 16:31:14.925235	\N
e9f03b18-e18e-448d-b431-48adc339cf9b	6f7e2152-c6a2-47ca-b96e-9814df717a03	طارق	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.94466	2025-12-29 16:31:14.94466	\N
ea942b8e-9168-4269-af69-51383d8d260d	6f7e2152-c6a2-47ca-b96e-9814df717a03	فاطمه	1	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.943785	2025-12-29 16:31:14.943785	\N
ebeba076-fd3d-4db5-afdd-1b4d9042d038	6f7e2152-c6a2-47ca-b96e-9814df717a03	tbd	1	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.962577	2025-12-29 16:31:14.962577	\N
ee816f93-85ab-4827-ac7d-fb13f8a926df	6f7e2152-c6a2-47ca-b96e-9814df717a03	ثريا	1	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.922645	2025-12-29 16:31:14.922645	\N
ee87be0a-b544-47ca-b093-4b168fbd9532	6f7e2152-c6a2-47ca-b96e-9814df717a03	سلامه عثمان حاج	1	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.931152	2025-12-29 16:31:14.931152	\N
eec20b24-1f08-4f5a-847e-ae689a7df272	6f7e2152-c6a2-47ca-b96e-9814df717a03	فاطمه	1	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.926452	2025-12-29 16:31:14.926452	\N
eefd1cd9-f475-4bac-98a3-7e0def26c573	6f7e2152-c6a2-47ca-b96e-9814df717a03	ناجى	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.939813	2025-12-29 16:31:14.939813	\N
ef1450af-4946-4cca-8c69-b8e6ac026ac3	6f7e2152-c6a2-47ca-b96e-9814df717a03	يسرى	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.92781	2025-12-29 16:31:14.92781	\N
ef596350-3a6c-4d71-889d-512a773771c1	6f7e2152-c6a2-47ca-b96e-9814df717a03	محمد	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.952946	2025-12-29 16:31:14.952947	\N
ef6fa562-d8aa-445e-a36e-4a5ef15d86ff	6f7e2152-c6a2-47ca-b96e-9814df717a03	رقيه	1	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.936933	2025-12-29 16:31:14.936933	\N
efa08ac8-e46c-4928-915f-f6770536ec25	6f7e2152-c6a2-47ca-b96e-9814df717a03	تامر	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.967091	2025-12-29 16:31:14.967091	\N
efa7406f-7481-498f-a680-8c0a84e13c7b	6f7e2152-c6a2-47ca-b96e-9814df717a03	ثريا	1	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.942903	2025-12-29 16:31:14.942904	\N
f11fb6cb-ece0-4e4d-bb86-fb57e0154ff2	6f7e2152-c6a2-47ca-b96e-9814df717a03	احمد المصرى	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.963434	2025-12-29 16:31:14.963434	\N
f20edf06-3e22-4d9d-a1c9-82d8dbd50b52	6f7e2152-c6a2-47ca-b96e-9814df717a03	محمد	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.911576	2025-12-29 16:31:14.911576	\N
f252346e-a197-4a27-9836-34fb7e50bffd	6f7e2152-c6a2-47ca-b96e-9814df717a03	محمد	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.916346	2025-12-29 16:31:14.916346	\N
f32668a8-9c7c-412a-bbbd-77502615cb5f	6f7e2152-c6a2-47ca-b96e-9814df717a03	نفيسه	1	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.917146	2025-12-29 16:31:14.917146	\N
f43058ff-54b4-42b3-837e-57c08655f9f6	6f7e2152-c6a2-47ca-b96e-9814df717a03	عثمان	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.917502	2025-12-29 16:31:14.917502	\N
f4da585f-fa85-4ec2-be91-b7bcd0387dbf	6f7e2152-c6a2-47ca-b96e-9814df717a03	ليلى	1	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.951207	2025-12-29 16:31:14.951207	\N
f571b71a-bc1b-4f2c-98cd-890c1b13800f	6f7e2152-c6a2-47ca-b96e-9814df717a03	فوزى	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.939089	2025-12-29 16:31:14.939089	\N
f5f9b671-008f-4a1a-9e0f-5f0aad706015	6f7e2152-c6a2-47ca-b96e-9814df717a03	سامح	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.96386	2025-12-29 16:31:14.96386	\N
f66d612b-8b5c-4c89-b4e2-bf67b591d566	6f7e2152-c6a2-47ca-b96e-9814df717a03	احمد	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.933817	2025-12-29 16:31:14.933817	\N
f6abe729-f7dd-45da-8c31-9be811832569	6f7e2152-c6a2-47ca-b96e-9814df717a03	مريم	1	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.924188	2025-12-29 16:31:14.924188	\N
f6feaafe-2930-415a-877d-49f9265fb8d2	6f7e2152-c6a2-47ca-b96e-9814df717a03	عبد الحميد	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.920567	2025-12-29 16:31:14.920567	\N
f738e1ee-e9f7-49c8-91a5-31f9b9564754	6f7e2152-c6a2-47ca-b96e-9814df717a03	فاطمه	1	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.939451	2025-12-29 16:31:14.939451	\N
f8215677-c02c-4e9a-ad7d-931d8facb1cc	6f7e2152-c6a2-47ca-b96e-9814df717a03	عمار	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.955486	2025-12-29 16:31:14.955486	\N
f86f9da1-8530-46ab-8a13-3f21ec47a173	6f7e2152-c6a2-47ca-b96e-9814df717a03	نفيسه	1	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.91349	2025-12-29 16:31:14.91349	\N
f8b1a730-10b7-4498-81d7-97a58ad0ec53	6f7e2152-c6a2-47ca-b96e-9814df717a03	وجدان	1	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.959447	2025-12-29 16:31:14.959447	\N
f99f8826-c8b7-4ed9-a3a4-3f805cedbc1d	6f7e2152-c6a2-47ca-b96e-9814df717a03	محمد	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.932785	2025-12-29 16:31:14.932785	\N
f9e4938d-5c2d-4827-b9d9-d6962aec538e	6f7e2152-c6a2-47ca-b96e-9814df717a03	رامى	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.965166	2025-12-29 16:31:14.965166	\N
f9e95815-2b58-46ce-ad03-39d332808875	6f7e2152-c6a2-47ca-b96e-9814df717a03	زينب	1	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.916985	2025-12-29 16:31:14.916985	\N
fc1f6782-df84-4b25-9f93-eb260f21018a	6f7e2152-c6a2-47ca-b96e-9814df717a03	مرتضى	0	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.960492	2025-12-29 16:31:14.960492	\N
fcf6790a-800a-4dbd-a6b1-d33a7cd50ca4	6f7e2152-c6a2-47ca-b96e-9814df717a03	ساره	1	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.957177	2025-12-29 16:31:14.957177	\N
fd11fd84-1e42-4d38-ad83-796210bfdd71	6f7e2152-c6a2-47ca-b96e-9814df717a03	فاطمه	1	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.935448	2025-12-29 16:31:14.935448	\N
ffa02956-07ed-4b37-a8cd-b23414c2b81e	6f7e2152-c6a2-47ca-b96e-9814df717a03	فاطمه	1	\N	\N	0	\N	\N	0	\N	1	\N	\N	\N	\N	\N	\N	f	f	f	2025-12-29 16:31:14.915512	2025-12-29 16:31:14.915512	\N
\.


--
-- TOC entry 3927 (class 0 OID 72605)
-- Dependencies: 250
-- Data for Name: PersonLinks; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."PersonLinks" ("Id", "SourcePersonId", "TargetPersonId", "LinkType", "Confidence", "Notes", "CreatedByUserId", "ApprovedByUserId", "Status", "CreatedAt", "UpdatedAt") FROM stdin;
\.


--
-- TOC entry 3935 (class 0 OID 72940)
-- Dependencies: 258
-- Data for Name: PersonMedia; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."PersonMedia" ("Id", "PersonId", "MediaId", "IsPrimary", "SortOrder", "Notes", "CreatedAt", "LinkedAt") FROM stdin;
e3cde8a8-e0a3-4300-a970-1d5d60f033e2	7bf610c8-5a1b-4c9e-91e5-49d7c7bccc0a	5d34f2fb-c6be-4d8a-a752-3075f19258db	t	0	\N	2025-12-29 18:52:18.101724+00	2025-12-29 18:52:18.102055+00
\.


--
-- TOC entry 3930 (class 0 OID 72698)
-- Dependencies: 253
-- Data for Name: PersonMediaLinks; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."PersonMediaLinks" ("Id", "PersonId", "MediaId", "IsPrimary", "SortOrder", "Notes", "CreatedAt", "LinkedAt") FROM stdin;
\.


--
-- TOC entry 3899 (class 0 OID 71120)
-- Dependencies: 222
-- Data for Name: PersonNames; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."PersonNames" ("Id", "PersonId", "Script", "Given", "Middle", "Family", "Full", "Transliteration", "Type", "CreatedAt") FROM stdin;
005ea861-83b1-494e-8c6a-376a4816cb83	07fe499f-7066-4230-8ea7-3f80edf4d549	Latin	احمد	\N	//	احمد	\N	0	2025-12-29 16:31:14.974192
036d6f23-d511-4a6a-8264-8eb8d5bf718e	0398475a-18bc-4a9b-b099-b4994a38070e	Latin	عفاف	\N	//	عفاف	\N	0	2025-12-29 16:31:14.95586
05b8ecfd-1f70-4fcf-80a2-724a27f4c7d4	0b7a58ff-cd04-48fd-b62d-f53a449e3d0c	Latin	نشأت	\N	//	نشأت	\N	0	2025-12-29 16:31:14.94057
07144468-0933-4448-abc9-05b70ed8b9c1	01a3dec3-b563-4c08-95f5-2575c8465f5a	Latin	هشام	\N	//	هشام	\N	0	2025-12-29 16:31:14.973664
095f49c0-dc1d-4906-8168-f61dcc530091	e68c6def-f9fb-402e-8066-54a33bd5dd68	Latin	شريفه	\N	//	شريفه	\N	0	2025-12-29 16:31:14.927474
09698b1a-95c2-450f-b034-0d37802e599e	061cfd7d-2c8c-4ced-8b74-8257d83220ef	Latin	سعاد	\N	//	سعاد	\N	0	2025-12-29 16:31:14.944487
097fe896-471f-4b27-94cc-4a6f8e6fd436	4396edb8-3cad-46f7-8802-bbcbd17db4d3	Latin	احمد	\N	//	احمد	\N	0	2025-12-29 16:31:14.905852
0b621703-c4d2-41f1-a302-17e77a42393b	f11fb6cb-ece0-4e4d-bb86-fb57e0154ff2	Latin	احمد المصرى	\N	//	احمد المصرى	\N	0	2025-12-29 16:31:14.963435
0cd54bf3-26e6-48b7-8ff3-d16dd81ec0ec	c738a843-0054-47cb-b491-d13f66b1893b	Latin	سحر	\N	//	سحر	\N	0	2025-12-29 16:31:14.935252
0df95b39-feda-4a82-8781-69c8605e9470	a97610b7-bbf7-4c51-b401-ef93890feb3f	Latin	سوسن	\N	//	سوسن	\N	0	2025-12-29 16:31:14.944138
0e1a899c-91a4-4ba0-b376-131de40ca565	00c6c827-308e-4a6e-88c9-83cf391d2881	Latin	\N	\N	\N		\N	0	2025-12-29 16:31:14.921618
0e8c7058-56be-46b5-899a-a69b48436476	9649dc43-7677-454a-acdb-68adf33bbce3	Latin	زهره	\N	//	زهره	\N	0	2025-12-29 16:31:14.908568
0ea440c3-422f-4480-bc1e-a59f8a124b32	56f491df-dc4b-4021-b43f-c830c1954ce5	Latin	عبده سامى	\N	//	عبده سامى	\N	0	2025-12-29 16:31:14.929008
0ef30f75-da83-487d-ade3-7a3b5a184351	975c5df5-0586-4f04-b84d-be22ce5956cd	Latin	واجده	\N	//	واجده	\N	0	2025-12-29 16:31:14.958923
12083173-198e-49c3-b27b-0191e9708426	757c135f-7d90-4b8f-a1a0-47a23ed1b601	Latin	محمد حسن	\N	//	محمد حسن	\N	0	2025-12-29 16:31:14.950744
125c0478-ae89-48b7-bdcb-387027003791	2c73a45a-44ea-43e5-a2d8-4b43cd9aac4f	Latin	عبد الرحمن	\N	//	عبد الرحمن	\N	0	2025-12-29 16:31:14.961544
127304bf-7d67-4167-ab1f-5aa6e3bb5a5a	d88c0ea1-6d59-418b-a938-2e6aa399ed22	Latin	محمد مصطفى	\N	//	محمد مصطفى	\N	0	2025-12-29 16:31:14.965861
14387e43-fa63-4cab-b05e-1c4527d68d7e	60bfd2da-842f-4c70-8a03-689c52e7c9d2	Latin	شريفه	\N	//	شريفه	\N	0	2025-12-29 16:31:14.953524
15596203-08c5-4c8e-9897-75b5e9942c7d	961fac6f-57ec-4e37-81f9-08325ba1548e	Latin	شهد	\N	//	شهد	\N	0	2025-12-29 16:31:14.964636
162bca15-4b1c-4566-a836-3f432e9d1050	393d1cc4-7f44-40f9-868d-45d24c13d636	Latin	محمود	\N	//	محمود	\N	0	2025-12-29 16:31:14.930225
163262d5-7632-47c6-95b1-0aea067f3f4d	a4675322-ed29-4968-8aba-2c803366d80e	Latin	صفاء	\N	//	صفاء	\N	0	2025-12-29 16:31:14.937824
1636847e-e5bf-45d8-b3c5-649083c64003	2305b11a-9a04-4bf4-8227-f14b846cd9da	Latin	الفاتح	\N	//	الفاتح	\N	0	2025-12-29 16:31:14.937109
17015061-89ba-4b3e-a027-f839147dd52f	a4e1763e-23f3-4b7f-bb31-16d23e30ee97	Latin	نبويه	\N	//	نبويه	\N	0	2025-12-29 16:31:14.946754
17d043e3-1324-4154-a60f-f986d129781a	16bd771f-08ea-4656-8239-65f5f9376104	Latin	متولى	\N	//	متولى	\N	0	2025-12-29 16:31:14.97719
18b0bd51-db65-4fa6-a1ce-db374d8e1a98	2cecfa3e-92a5-4251-acaf-07ac2a09807b	Latin	محمد احمد	\N	//	محمد احمد	\N	0	2025-12-29 16:31:14.909635
1936d414-d598-491e-99cf-91c7fd7540a6	cb190884-e061-4db9-8cc2-c0aa05378280	Latin	فاطمه	\N	//	فاطمه	\N	0	2025-12-29 16:31:14.937474
198a3fd5-5f92-4e55-aa81-f4c769c9fcda	4b1a8a5e-5892-451f-bb44-3b57cc638fae	Latin	امينه عبدالحميد صالح شريف	\N	//	امينه عبدالحميد صالح شريف	\N	0	2025-12-29 16:31:14.943266
1a5889d4-c743-4f7c-b594-25e0c2d53f64	8c370e5c-63ad-46a4-96ae-be21a5ea8683	Latin	عادل	\N	//	عادل	\N	0	2025-12-29 16:31:14.924382
1ab071f6-5780-4ecf-8bf6-366e507608ee	6c9ac109-ed1d-403d-a2f8-b8078a25a94a	Latin	عبد الرحمن	\N	//	عبد الرحمن	\N	0	2025-12-29 16:31:14.933483
1ceaa722-b77f-4667-924a-029b4b77e8ad	b73dbd91-9da4-45d2-b76e-b35376828646	Latin	راحيل	\N	//	راحيل	\N	0	2025-12-29 16:31:14.931687
1d1c73f9-97c3-4cd0-9670-9f44af1ff419	13aac49d-554b-4ac5-8c78-ab6abc4a61c4	Latin	زكيه	\N	//	زكيه	\N	0	2025-12-29 16:31:14.91683
1da433e3-4c0f-4968-adef-2c770a2e9ee9	017d1edf-10bc-4320-8210-582b501ee7c6	Latin	ابتهال	\N	//	ابتهال	\N	0	2025-12-29 16:31:14.963611
1dbaf5ce-429e-45a9-91f1-471e10172931	a76d5270-26c2-46f6-af85-4d3f892320e9	Latin	صفوت	\N	//	صفوت	\N	0	2025-12-29 16:31:14.941103
1dfcb378-acd7-45d4-82a9-14dad875413e	e296e3ad-4772-4d8b-a76d-b653912d2029	Latin	عمر	\N	//	عمر	\N	0	2025-12-29 16:31:14.968622
1e1b039e-13f5-4da4-8a19-7d4af330588d	e4785339-9e4f-41e6-9d41-c31a5ed1883d	Latin	فواز	\N	//	فواز	\N	0	2025-12-29 16:31:14.957701
1eb9492d-de57-4342-98ea-c2eaf92d81d7	d913e8e7-7b5a-4516-8d86-0bc443170546	Latin	شاهر	\N	//	شاهر	\N	0	2025-12-29 16:31:14.950567
1f3b544a-57a6-4f36-94c7-93398d67f860	ac5fe8ed-d1c4-4ac8-bc93-ec9a906d5f7d	Latin	محمد صالح شريف	\N	//	محمد صالح شريف	\N	0	2025-12-29 16:31:14.922472
2104dea8-e9ad-4246-bf9f-07fb279beddb	51e772c9-fdcf-466f-b506-b56e023df862	Latin	نعيمه	\N	//	نعيمه	\N	0	2025-12-29 16:31:14.963087
21288d72-0d2b-422c-9eec-6adb4bf657ad	2963f2eb-a41a-4ccb-9e7f-f99cee15ed7c	Latin	محمد بدر كدوده	\N	//	محمد بدر كدوده	\N	0	2025-12-29 16:31:14.919941
21481dd5-bbd0-41e2-a47d-9e22ca5f1e87	ce3ba4b4-7942-43bc-8a09-16f662ff7542	Latin	اشرف	\N	//	اشرف	\N	0	2025-12-29 16:31:14.971845
21789ddd-4098-42ab-b46f-ff759aab23a3	7d5d9172-1051-46f9-b53a-b373f75fd561	Latin	تسنيم	\N	//	تسنيم	\N	0	2025-12-29 16:31:14.963262
2215efaf-9954-4155-8c6b-9a6453c2f526	f5f9b671-008f-4a1a-9e0f-5f0aad706015	Latin	سامح	\N	//	سامح	\N	0	2025-12-29 16:31:14.963861
224d1ab5-975b-46e1-8047-a793f509f297	cda43562-bfa2-4831-876f-36adfbf0e499	Latin	منيره	\N	//	منيره	\N	0	2025-12-29 16:31:14.918833
24acdaad-1611-4771-81b5-12fc61607510	ef6fa562-d8aa-445e-a36e-4a5ef15d86ff	Latin	رقيه	\N	//	رقيه	\N	0	2025-12-29 16:31:14.936934
24ae0488-799d-41e9-a204-7eaea8144cf3	28dfe729-587a-4b7b-970b-7e2077a55bcd	Latin	روان	\N	//	روان	\N	0	2025-12-29 16:31:14.955094
254b3656-cff2-4566-bd73-2cdd3c842c80	f8215677-c02c-4e9a-ad7d-931d8facb1cc	Latin	عمار	\N	//	عمار	\N	0	2025-12-29 16:31:14.955487
2683dcc2-b215-4964-b0b1-58e2df99b4ba	7138116f-fa84-4bcc-93ef-b3965b68e28c	Latin	احمد	\N	//	احمد	\N	0	2025-12-29 16:31:14.968049
26995b50-4dff-4ba0-8c24-f17098235417	bea89bd4-6d67-48d7-8235-0ceca57feffc	Latin	فاطمه	\N	//	فاطمه	\N	0	2025-12-29 16:31:14.910705
26e2a9aa-1905-4ecb-953f-cc6846163dcd	6445e2a6-4866-41d2-a81c-eb1eb6a7c536	Latin	عائشه	\N	//	عائشه	\N	0	2025-12-29 16:31:14.95098
2752d3b5-9b0c-40aa-838c-c4ed783c0fe5	bbc3495b-afe0-4294-958a-a8d0560b5ff8	Latin	سميحه	\N	//	سميحه	\N	0	2025-12-29 16:31:14.939626
27fe5ba9-f84d-4d18-8393-de9d56ea0628	854b2dd2-5036-45a3-a142-26e5ee1d64cf	Latin	فريد	\N	//	فريد	\N	0	2025-12-29 16:31:14.932957
29a58e24-518c-4d9b-855f-9d7bed0b841f	4a56e8cc-a3a2-490d-a9cb-d0dcad81566a	Latin	فاطمه	\N	//	فاطمه	\N	0	2025-12-29 16:31:14.950046
2a9e00c4-3dc8-4914-9374-49b1917e0516	3009160e-5f07-450d-a731-ce8bfb1683ea	Latin	 راشد	\N	//	راشد	\N	0	2025-12-29 16:31:14.965515
2b26addd-93cd-4822-8832-6f615bd9c361	a7a723f7-e6af-4eb7-b711-4f211531d424	Latin	سلوى	\N	//	سلوى	\N	0	2025-12-29 16:31:14.926618
2c3d6f19-8a10-4592-8a70-0def3e18447c	a3177ae6-e4a7-4f49-a4eb-40c3c7f8a616	Latin	محمد	\N	//	محمد	\N	0	2025-12-29 16:31:14.946915
2defcfee-63c0-4f25-a71b-56664118f448	8f87d17f-3cd4-42c0-b09f-f1f0cedb8584	Latin	حفيظه	\N	//	حفيظه	\N	0	2025-12-29 16:31:14.914336
2e3ba484-1610-4311-95d8-9d52f484fa90	984cdf4d-965a-446a-9bfd-623f1a067fbd	Latin	عصام	\N	//	عصام	\N	0	2025-12-29 16:31:14.934383
2ee6198b-9da3-472d-b53c-50c3c396ec01	5faf0d74-97e9-4988-b6f1-333a4d088bbf	Latin	سماح	\N	//	سماح	\N	0	2025-12-29 16:31:14.932135
2f05a90a-d9fd-4788-90f8-c8619186db08	8f7b424e-9eb8-4751-a80e-3a8313d1b7d9	Latin	احمد	\N	//	احمد	\N	0	2025-12-29 16:31:14.928499
2f0815dd-430e-4bb3-ac11-51b5456f27f1	a20d7808-69be-49ef-8a9c-58dbe9bef865	Latin	هانم	\N	//	هانم	\N	0	2025-12-29 16:31:14.952088
306b06ee-905d-4c1f-adf1-47f2534792e8	c8d20780-df3f-439b-a60f-b36d79bc2f77	Latin	اقبال	\N	//	اقبال	\N	0	2025-12-29 16:31:14.93004
314c7359-ed01-446a-a9a2-483428d45a75	8a0f7a9d-fda3-43eb-97c5-369b3a2ac52f	Latin	حماد	\N	//	حماد	\N	0	2025-12-29 16:31:14.956393
31921af1-d85a-4639-8614-193e94fc595b	c06bea75-1372-4d24-a784-d45caae6fb2d	Latin	مجدى	\N	//	مجدى	\N	0	2025-12-29 16:31:14.97559
31d202e0-7359-46ea-9d49-9288060a89b7	d84a5ca2-0f0f-4a2f-9522-d3507f95ebde	Latin	فاطمه	\N	//	فاطمه	\N	0	2025-12-29 16:31:14.961198
32438c88-85bf-4474-962a-bb2e09e6da0c	87418f4f-d319-4998-9ab4-d3b6fd6be733	Latin	نبيل	\N	//	نبيل	\N	0	2025-12-29 16:31:14.937292
32f0a63e-64e8-4381-81e2-3bbb839195de	657ef2fe-29fb-41f2-96e4-e5687799b454	Latin	زينب	\N	//	زينب	\N	0	2025-12-29 16:31:14.913997
337cf145-f2d3-4a58-acc3-6cbada355725	b5f48e56-c241-419c-8a6e-376e7ee236a7	Latin	محمود	\N	//	محمود	\N	0	2025-12-29 16:31:14.927987
3458194f-35f3-4b02-8d8f-45abc90ff515	910b2aa8-9ffa-4bd5-bc9c-8bdb446bab2f	Latin	مصطفى	\N	//	مصطفى	\N	0	2025-12-29 16:31:14.966216
35099b17-47d7-407a-9403-fc39d1d9ed21	d21ab576-80be-4b37-823e-25820fc9e16b	Latin	نعمات	\N	//	نعمات	\N	0	2025-12-29 16:31:14.943617
362b6dd8-1c14-45aa-9537-a866dbe44e30	1e78534b-2c86-4d27-862c-dbab814f2a60	Latin	طلال	\N	//	طلال	\N	0	2025-12-29 16:31:14.954403
367cec2a-66ea-4461-a94b-e1a3d0f4a178	ca7e271a-b330-40d5-98c1-17cba2b22e3a	Latin	محمد عثمان(شلتوت)	\N	//	محمد عثمان(شلتوت)	\N	0	2025-12-29 16:31:14.924737
3888c0db-af79-4194-a2af-498450b9a7f0	3431da17-9257-42f6-a88a-9d4e8d6eb946	Latin	نزار	\N	//	نزار	\N	0	2025-12-29 16:31:14.968981
3a2cebf4-f7e4-4466-bed7-e5ff6db8cde1	1cef3beb-2d1b-4136-a805-285df0f81366	Latin	عائشه	\N	//	عائشه	\N	0	2025-12-29 16:31:14.921433
3a361f48-5c92-4d58-97df-7502696b4f12	e11c4b99-c61e-48d4-a36b-8fa1b9562e0a	Latin	هادى	\N	//	هادى	\N	0	2025-12-29 16:31:14.945699
3b65540a-a7b5-44f9-9044-bd189650afed	ef1450af-4946-4cca-8c69-b8e6ac026ac3	Latin	يسرى	\N	//	يسرى	\N	0	2025-12-29 16:31:14.92781
3be108fd-868e-485e-9e96-57d0983c034e	ef596350-3a6c-4d71-889d-512a773771c1	Latin	محمد	\N	//	محمد	\N	0	2025-12-29 16:31:14.952948
3c5240c9-4997-40c4-bd8a-9c7425519bc4	134383ef-3e27-4ee9-9ed0-6f6b278d4b70	Latin	 احسان	\N	//	احسان	\N	0	2025-12-29 16:31:14.960845
3c5e7832-ab35-4d5e-864e-f2d3fc49793b	9254c9c2-552b-48b6-bf47-ec7b9f024086	Latin	بدر	\N	//	بدر	\N	0	2025-12-29 16:31:14.909817
3d4b4708-fc22-45a3-b479-23622a60fa06	1b4aa5c2-a13d-461c-b64b-38b6808a1609	Latin	 رشا	\N	//	رشا	\N	0	2025-12-29 16:31:14.966038
3da82c7a-db73-4c89-b1af-a8929a8ab543	2bfbbbb6-df60-48c1-9619-7bc9f565e18b	Latin	 احمد	\N	//	احمد	\N	0	2025-12-29 16:31:14.910015
3e22bcd4-522a-4477-a14b-e3fb032b10bb	9f7d376d-1ba6-427e-9630-1fb8bbb07f91	Latin	عفيفه	\N	//	عفيفه	\N	0	2025-12-29 16:31:14.935063
3e9b73c7-5d41-4c89-babc-c257ef0ac509	acdc1662-5acd-49a8-bcdf-b74f6e57b4b3	Latin	فاطمه	\N	//	فاطمه	\N	0	2025-12-29 16:31:14.913652
3eee377a-e32c-4c6e-9a20-bce2913598d9	df1eb182-11bc-4b01-8f31-fceb22540354	Latin	محمد	\N	//	محمد	\N	0	2025-12-29 16:31:14.91292
40758291-ed15-4267-bbe5-5f157cf694e8	ac78fc6b-1bd3-4657-a9be-28941be581dd	Latin	عبد الرحيم	\N	//	عبد الرحيم	\N	0	2025-12-29 16:31:14.915169
412013e4-07db-4b41-99fb-49c4e20bf668	a1c06163-d2d7-439d-b905-5455cc4c16a4	Latin	زينب	\N	//	زينب	\N	0	2025-12-29 16:31:14.949181
419cbdfe-793f-47b9-a884-eeab25696d53	c3b48982-c487-4f76-a575-2a6e889b03ca	Latin	مصدق	\N	//	مصدق	\N	0	2025-12-29 16:31:14.925748
41e32e52-257a-4786-9e4d-ceb4a77c5b1a	b610bb22-f766-4f82-b792-f7fbb2f7003b	Latin	نفيسه	\N	//	نفيسه	\N	0	2025-12-29 16:31:14.907204
43d66564-6c86-4284-994c-72da3837a704	f4da585f-fa85-4ec2-be91-b7bcd0387dbf	Latin	ليلى	\N	//	ليلى	\N	0	2025-12-29 16:31:14.951209
44005a64-09d6-4848-84b8-303443460cb3	fc1f6782-df84-4b25-9f93-eb260f21018a	Latin	 مرتضى	\N	//	مرتضى	\N	0	2025-12-29 16:31:14.960493
44b7968d-b56b-40da-9204-f17c9748feca	aa971367-e937-482e-b716-43b0c8b4bd94	Latin	وئام	\N	//	وئام	\N	0	2025-12-29 16:31:14.960147
4518d5fb-a560-44d5-a154-443f49363683	83050d08-4624-4abf-9565-2344da76d757	Latin	محمد	\N	//	محمد	\N	0	2025-12-29 16:31:14.970191
45203f54-a65c-4bd7-be07-64f8bf52627e	e31e9e9a-9a83-49bf-97e0-9c1d6ebf09c6	Latin	نبره	\N	//	نبره	\N	0	2025-12-29 16:31:14.969372
45de4845-7162-4ce7-b662-80766db0c05e	721ce62e-4c0e-411f-85aa-53c785131c1c	Latin	احمد	\N	//	احمد	\N	0	2025-12-29 16:31:14.941447
467381ae-c2e6-4f7a-a597-8c0537d39634	8cd3209b-7b52-4a4c-a92a-1f8cd6b5e407	Latin	نفيسه	\N	//	نفيسه	\N	0	2025-12-29 16:31:14.93399
46bc5e17-bb95-496b-99d7-8254abc10c73	50b85ddc-3ef5-43f1-a25c-b819d33a9e7a	Latin	عايده	\N	//	عايده	\N	0	2025-12-29 16:31:14.934897
48194b36-bb92-4896-90fa-b77e19c0d191	2dd91d5e-4a66-40c9-8ca9-aace4c4ac02a	Latin	صلاح	\N	//	صلاح	\N	0	2025-12-29 16:31:14.957875
4821587a-1391-47c2-b5d0-985249ec82c4	15508ffe-69d5-4d0c-a776-c9859d138401	Latin	فاطمه (قاشو)	\N	//	فاطمه (قاشو)	\N	0	2025-12-29 16:31:14.922307
483e1a28-387f-4829-90ce-29f9fdce2d24	6a128c37-f273-4914-999f-3d2b4b9e1443	Latin	احمد	\N	//	احمد	\N	0	2025-12-29 16:31:14.917767
4859bd88-e912-47f7-b201-2b51ab2543d0	0932b7e4-1f7a-478e-9ec2-d57596a5b969	Latin	وصفى	\N	//	وصفى	\N	0	2025-12-29 16:31:14.9584
489b15a1-85e1-459e-8094-bce5d9b0d343	66c8f4e7-94fa-4ff6-b592-07e5ad89ed22	Latin	شاهيناز	\N	//	شاهيناز	\N	0	2025-12-29 16:31:14.93562
496ba477-33e9-464b-9ebb-0b29e5fa8268	6b82c82a-d20c-44de-ade0-2bb0a29eb2c0	Latin	فوزيه	\N	//	فوزيه	\N	0	2025-12-29 16:31:14.94935
4ac778f9-5cd2-4b55-808c-9b9d19f67b1c	b2172455-58f5-416c-bfc5-a1f2b6caff88	Latin	محمد حسن امين	\N	//	محمد حسن امين	\N	0	2025-12-29 16:31:14.945357
4ada81d6-8ba2-4370-9b1d-09083cfaa1b9	efa7406f-7481-498f-a680-8c0a84e13c7b	Latin	ثريا	\N	//	ثريا	\N	0	2025-12-29 16:31:14.942905
4b0b7be4-f21f-4014-b853-59f86f382a2e	7726dceb-4193-4202-a422-f39aa003c3c6	Latin	مهند	\N	//	مهند	\N	0	2025-12-29 16:31:14.970442
4b41912f-2b1e-4921-b2dc-4be8ce91d283	2c1bfeee-d425-4831-897b-f2274e085973	Latin	كامل	\N	//	كامل	\N	0	2025-12-29 16:31:14.938915
4be0ed63-6878-4d87-8ed7-4cf6d26036a0	56c29211-020f-4254-aaed-33d4966c48be	Latin	محمد عثمان	\N	//	محمد عثمان	\N	0	2025-12-29 16:31:14.943082
4bed6ded-f37a-4842-b2ba-75a4cae2b259	da68554d-b7cb-46e5-b8ac-f01a7cbfa835	Latin	عزه	\N	//	عزه	\N	0	2025-12-29 16:31:14.975769
4c5e2ff1-8114-457d-81cd-8cc950fea153	5eadca51-02e7-47a2-9678-afbf2965a3aa	Latin	امير	\N	//	امير	\N	0	2025-12-29 16:31:14.962238
4c7b6b71-f8b5-42f6-9f43-bde891d3bd13	9235266f-7ffa-492b-b318-795465417e73	Latin	حرم ابايزيد	\N	//	حرم ابايزيد	\N	0	2025-12-29 16:31:14.933309
4cbfb8ad-3410-41aa-98a6-fb914a35e037	40d8b941-d6c2-470c-b463-2f8767138162	Latin	احمد	\N	//	احمد	\N	0	2025-12-29 16:31:14.932404
4d8bbed7-d893-4565-a284-6170b5a05de9	bbf75e1b-d67c-40b9-b369-05ad4de6ea65	Latin	احمد	\N	//	احمد	\N	0	2025-12-29 16:31:14.972042
4dc87b6f-4e65-4f74-9086-0e9dc605f454	33a8bd61-c893-4430-88da-03cfe7ac82f6	Latin	محمد	\N	//	محمد	\N	0	2025-12-29 16:31:14.909451
51607783-67f1-491f-abc6-023cbbed4a00	01e7143e-e7d9-4723-976d-4e9e92ea06c5	Latin	على احمد خيرى	\N	//	على احمد خيرى	\N	0	2025-12-29 16:31:14.975063
52db8d35-c20a-4251-b789-fd304676d11c	34f7930c-ebe4-4369-8697-a133297bab81	Latin	سعيده	\N	//	سعيده	\N	0	2025-12-29 16:31:14.942141
52eb7c6f-ef8d-449d-9d50-575fdaf695ff	288bfc15-ead3-401d-9bee-e2f5edc370b4	Latin	فيصل حسن يوسف	\N	//	فيصل حسن يوسف	\N	0	2025-12-29 16:31:14.972588
5357e1c6-4533-4019-a19e-77938e7b6563	ac9e038f-0460-4c55-ac28-5e5500ab953b	Latin	منى	\N	//	منى	\N	0	2025-12-29 16:31:14.961015
5370974b-9002-41e3-a8d5-2af6968d09f5	f32668a8-9c7c-412a-bbbd-77502615cb5f	Latin	نفيسه	\N	//	نفيسه	\N	0	2025-12-29 16:31:14.917147
544cea8a-e088-4011-8be9-8b6f80498194	6a98624b-3524-4aab-89cd-d41ca54b2207	Latin	عزه	\N	//	عزه	\N	0	2025-12-29 16:31:14.93765
5459473d-f41d-4916-9def-2c8c6b7c03dc	13978df3-8535-4246-a604-3513619239cd	Latin	هاديه	\N	//	هاديه	\N	0	2025-12-29 16:31:14.928671
549172d2-dd4c-4368-88f8-9f41435212bd	03aa6f04-8208-40e9-ae74-9f6c3aa71a78	Latin	اسماء	\N	//	اسماء	\N	0	2025-12-29 16:31:14.966399
554e4cd7-2373-4d63-9e2c-e69b481ba26c	ffa02956-07ed-4b37-a8cd-b23414c2b81e	Latin	فاطمه	\N	//	فاطمه	\N	0	2025-12-29 16:31:14.915513
5572e605-663d-4a32-8886-df40aa94a4c3	6988f9c8-0142-4cb1-a30f-60e513910da8	Latin	فاطمه	\N	//	فاطمه	\N	0	2025-12-29 16:31:14.930978
55b34f35-1fb9-42b0-b86e-9630dee4852b	03ad50e3-aa0b-4875-aefd-6c25e9ef1631	Latin	محمد احمد	\N	//	محمد احمد	\N	0	2025-12-29 16:31:14.919058
55cdd429-ee9c-4ea4-a461-f889ef8faaa8	d46e7da8-4299-4bb8-840f-364823f42406	Latin	فاطمه	\N	//	فاطمه	\N	0	2025-12-29 16:31:14.952534
56673bfe-1156-495d-9613-a9c3a5ba23b9	da16a5f1-3899-4c27-b5fd-cc67e1eb6826	Latin	حليمه ابايزيد	\N	//	حليمه ابايزيد	\N	0	2025-12-29 16:31:14.949878
57bcb9d2-0d97-4b42-9d5b-5d2338b3b19b	1542491d-e953-45e9-8a81-53b2b8a5931f	Latin	زينب	\N	//	زينب	\N	0	2025-12-29 16:31:14.911081
57e60df5-96f9-405f-af74-31b4aa7d079c	eec20b24-1f08-4f5a-847e-ae689a7df272	Latin	فاطمه	\N	//	فاطمه	\N	0	2025-12-29 16:31:14.926452
57f4732f-6020-47be-ac29-b18a35818e50	bf49f9ee-2dde-4ab1-ac5a-0a7eeb49183f	Latin	شيماء	\N	//	شيماء	\N	0	2025-12-29 16:31:14.957349
586c18ba-03bd-441f-b4ad-ea17db7e919e	cb3d8eb8-2628-4ee0-a199-97e0a7a530d1	Latin	محمد كدوده	\N	//	محمد كدوده	\N	0	2025-12-29 16:31:14.921959
58b60376-bfe1-4229-8d1b-9e90100f0d82	5fa4e123-d0a8-4e78-a27b-24c21fe856ed	Latin	سنيه	\N	//	سنيه	\N	0	2025-12-29 16:31:14.948241
597be719-f561-4a21-8b47-c76cccf9a329	f571b71a-bc1b-4f2c-98cd-890c1b13800f	Latin	فوزى	\N	//	فوزى	\N	0	2025-12-29 16:31:14.93909
5a7b4586-6a38-43a6-b677-275e1cacdf6c	b594b5d0-3703-49cd-865b-790ac271e59a	Latin	هدى	\N	//	هدى	\N	0	2025-12-29 16:31:14.943962
5b7a3744-67ef-4c15-bd07-acf56c8a4854	79fb0e06-dbb5-4d11-bacd-e332b736d1c6	Latin	صفيه	\N	//	صفيه	\N	0	2025-12-29 16:31:14.954753
5c66ae28-853e-437c-a5bf-e7ebc97d1e3e	ce2713e6-1855-4496-b9e4-ff650700b7ef	Latin	منى	\N	//	منى	\N	0	2025-12-29 16:31:14.976654
5d76f9d0-da2f-4773-8c56-f9daffd39003	63f661ac-75e0-4aae-a1aa-879128891215	Latin	صلاح احمد النعيم	\N	//	صلاح احمد النعيم	\N	0	2025-12-29 16:31:14.970765
5dbe46b5-9abe-42b8-8f7e-3d045c014929	e58d2487-41a2-4856-8eec-31a6cb8f3bf6	Latin	منصور	\N	//	منصور	\N	0	2025-12-29 16:31:14.958744
5e950dcf-8948-4813-9f28-addf133995b3	963a9695-5acd-4162-aff2-03b33022cdd4	Latin	فاطمه	\N	//	فاطمه	\N	0	2025-12-29 16:31:14.91089
5f4317c5-7e67-4e4f-a7bd-6a8e01252d38	62795491-b394-4bd9-8a2b-d4e2f91587bd	Latin	تيسير	\N	//	تيسير	\N	0	2025-12-29 16:31:14.929356
5fdc0eda-6d77-4eac-88cd-730ec473fbc2	f9e95815-2b58-46ce-ad03-39d332808875	Latin	زينب	\N	//	زينب	\N	0	2025-12-29 16:31:14.916986
6082b901-7ab8-474f-9930-671c1ee4f29f	1e2bde09-e21a-46e3-82d1-0eec6cf6f166	Latin	كوثر	\N	//	كوثر	\N	0	2025-12-29 16:31:14.927132
60f25ec5-9832-4380-a3f8-b62080315ce9	98056226-655c-4f92-8216-199573920cd7	Latin	سعيده	\N	//	سعيده	\N	0	2025-12-29 16:31:14.921793
6103ec5d-af35-448e-b04a-9c02c758e39c	c7fb008f-02f4-424c-ba55-b6dfbacec930	Latin	هانى	\N	//	هانى	\N	0	2025-12-29 16:31:14.973488
618872d3-6903-4e38-ac89-c015f14a8ed2	1b91d97e-55a8-4c4f-9a72-dedf95ca2aed	Latin	محمد	\N	//	محمد	\N	0	2025-12-29 16:31:14.908733
61adb3f8-b5e5-4fe6-a9d8-85449de8d490	051cff4a-c50e-4293-a715-80994568e565	Latin	محمد	\N	//	محمد	\N	0	2025-12-29 16:31:14.939271
63806556-aebc-408f-91b0-705f82d6ecbd	31b8d4b9-326e-4e9a-8803-a9b4ea034b7e	Latin	عثمان	\N	//	عثمان	\N	0	2025-12-29 16:31:14.911408
6477673a-c40c-41cb-a868-84bf0659b804	bc84fece-9dc6-4241-87d8-a006e42023e3	Latin	ندى	\N	//	ندى	\N	0	2025-12-29 16:31:14.956044
649ca622-a4c4-4de3-a981-866d30405bc7	28283855-40a5-449c-8ae1-418bd57a1e69	Latin	محمد	\N	//	محمد	\N	0	2025-12-29 16:31:14.960316
6630fe43-e8ea-41b3-aa6b-7d48a0884a31	b0ff5995-4e69-4358-b79d-3fa6fef0a69b	Latin	فاطمه	\N	//	فاطمه	\N	0	2025-12-29 16:31:14.908388
66720038-4d60-45d1-8095-0f200cbdca77	1b360ea6-59f3-4033-9bdd-0e836c64f057	Latin	فاطمه	\N	//	فاطمه	\N	0	2025-12-29 16:31:14.953881
67180459-3330-4ab8-9ffe-a921bebeee7a	976db09a-ec7a-4241-bdc8-f98763174305	Latin	خديجه	\N	//	خديجه	\N	0	2025-12-29 16:31:14.942315
676ef975-469c-4751-a819-c2d185f32894	8467f635-2740-4777-b39b-280d34080905	Latin	وداد	\N	//	وداد	\N	0	2025-12-29 16:31:14.959274
68a2b89f-f6dc-4991-8e52-2c1b683931b3	138eea36-2263-4093-9a21-dd6aeb846450	Latin	احمد	\N	//	احمد	\N	0	2025-12-29 16:31:14.936491
694b85a5-fb19-4fd4-ad0c-189c72705214	ad99bb72-4ede-4dda-8a06-91aeed3e4683	Latin	ابراهيم	\N	//	ابراهيم	\N	0	2025-12-29 16:31:14.964043
6a0145d9-bd50-499b-98f5-c65517279993	5721d7c5-dad5-4696-82b5-283b267738f2	Latin	وداد	\N	//	وداد	\N	0	2025-12-29 16:31:14.929521
6a7e06e8-ace0-46bf-8ef1-46e2ef77a845	a73b79fe-5694-45ee-99e5-55755fc11d06	Latin	امين حسن	\N	//	امين حسن	\N	0	2025-12-29 16:31:14.967662
6ad060fd-b5cf-4981-a168-12d697afe337	cab8e0bd-4e05-450b-bef7-4b8651d5295f	Latin	خضره	\N	//	خضره	\N	0	2025-12-29 16:31:14.915681
6b0f6721-cd99-4eb5-ab8d-9d351d112e69	91460bc8-a143-40f4-96ad-b94328ca5d9f	Latin	عمرو	\N	//	عمرو	\N	0	2025-12-29 16:31:14.969159
6b3a6523-61bc-4991-8f6d-0f38db6e6afd	cfcdeebb-3b56-4553-904f-397f374b92a8	Latin	فاطمه	\N	//	فاطمه	\N	0	2025-12-29 16:31:14.912247
6b69f253-bffd-4099-89ba-11888c5d02bc	e35a59c7-dd2c-4085-88ab-345a2978d6bd	Latin	احمد عبد الرحمن فقير	\N	//	احمد عبد الرحمن فقير	\N	0	2025-12-29 16:31:14.924557
6c1ea9af-e96b-4f80-87a9-c44973daa48c	34eccca2-e723-4e34-a2b2-5ee11a0ed4f1	Latin	محمد احمد	\N	//	محمد احمد	\N	0	2025-12-29 16:31:14.948643
6cbe7891-de8a-41e6-b57f-4696f6caad39	45466f72-d5ec-416d-9721-622f34a814c1	Latin	على	\N	//	على	\N	0	2025-12-29 16:31:14.9504
6d1efb87-b799-48b2-988a-386667f68616	66952afa-c95b-45d8-9de3-c61ecebda807	Latin	تغريد	\N	//	تغريد	\N	0	2025-12-29 16:31:14.96172
6d49bb64-7135-450e-b506-ef33a2e19355	db12a4fc-6e43-473d-9239-c5fd59c33e3e	Latin	فاطمه	\N	//	فاطمه	\N	0	2025-12-29 16:31:14.907816
6e404b48-6142-4831-a9a5-d130c9229d49	ac7ead63-ff75-4624-839f-7561f79867fc	Latin	احمد	\N	//	احمد	\N	0	2025-12-29 16:31:14.968802
6ee580e3-68fb-4173-9425-70a947971fe0	d2ee12d5-5848-48c2-91a6-ffc49270bca1	Latin	هجره	\N	//	هجره	\N	0	2025-12-29 16:31:14.951564
70458f21-cfb0-4497-a81f-c3def15ca7d8	23861b80-b74c-4e0f-ac1a-e7759818f5e7	Latin	هشام	\N	//	هشام	\N	0	2025-12-29 16:31:14.966748
70741208-46dc-4535-94d0-3b5f3c80175d	9ae2788b-8596-4ef7-9682-08124da02aee	Latin	سناء	\N	//	سناء	\N	0	2025-12-29 16:31:14.92628
71827f87-971d-4629-a243-df87b6b9363c	e45d13e2-7506-4a76-b530-ee69fd0eb2b1	Latin	داريه	\N	//	داريه	\N	0	2025-12-29 16:31:14.90821
726b7a93-2ba9-4498-99b7-52c97614378d	6653dba6-6f95-4495-8e3a-3cc187266272	Latin	حسن	\N	//	حسن	\N	0	2025-12-29 16:31:14.914995
7274a675-9824-4f31-bdb9-97760eeed00e	fd11fd84-1e42-4d38-ad83-796210bfdd71	Latin	فاطمه	\N	//	فاطمه	\N	0	2025-12-29 16:31:14.935449
731b58db-1bb5-4d2f-a034-e6b3f596cd44	abc95b43-ba5c-43a4-9946-7190e458f953	Latin	سيد	\N	//	سيد	\N	0	2025-12-29 16:31:14.91275
746accd3-9ff0-44f1-99e5-6bb26c5e8c41	098051ee-bc7c-4051-9883-a1b5165ec030	Latin	محمود	\N	//	محمود	\N	0	2025-12-29 16:31:14.922859
7488c1fa-5acd-442e-9f45-aa44f53704d9	7df9a2f8-36e9-42e2-b5a4-b3e3716e8848	Latin	نور	\N	//	نور	\N	0	2025-12-29 16:31:14.976123
74d17cae-d672-41ae-90cc-752cd2a3b4f8	8b3026e0-921c-4f17-970e-f2ec5724fc51	Latin	فاطمه	\N	//	فاطمه	\N	0	2025-12-29 16:31:14.931519
74ee9e27-d2a2-4139-acaf-2e999cc025fc	0f4c1e01-0dfe-4844-b592-2ac4bb3c9243	Latin	سامر	\N	//	سامر	\N	0	2025-12-29 16:31:14.972959
75173717-4d46-472b-b56f-6b05ad2bf79e	e1b7b70c-bd56-42e3-8464-e04327fc62c4	Latin	 زهره	\N	//	زهره	\N	0	2025-12-29 16:31:14.977003
75d5365d-7fbd-49cd-a54a-0353ef0b2642	57853450-4b79-4a55-b6ae-4267f86e4740	Latin	على	\N	//	على	\N	0	2025-12-29 16:31:14.976825
7604eae7-da88-43f2-9e92-ef9d86928e30	b6701ec5-5278-4e7f-9909-8a3058c079d9	Latin	منيره	\N	//	منيره	\N	0	2025-12-29 16:31:14.910188
77124b45-cc56-435e-a99b-fd901f3b9dd1	f6abe729-f7dd-45da-8c31-9be811832569	Latin	مريم	\N	//	مريم	\N	0	2025-12-29 16:31:14.924189
7813de4a-bae9-4f1c-b200-f71e7873891d	1d3b4207-a170-4014-80db-d5a1b76f0035	Latin	محجوب	\N	//	محجوب	\N	0	2025-12-29 16:31:14.909078
78482232-7f28-442d-9833-84a1c1b06e7d	b7d8ced6-a4fd-4fec-b75c-63daf3324e8d	Latin	مجتبى	\N	//	مجتبى	\N	0	2025-12-29 16:31:14.954057
78772eaf-9d70-42ff-9338-32faec83bbaa	9463577f-8e4a-4f1b-a3d7-17e2eb9ce025	Latin	عبد الله	\N	//	عبد الله	\N	0	2025-12-29 16:31:14.948819
7888c570-4223-4fee-b469-684766291431	b9b13aae-11e6-4e84-b1f2-b57d2918d3d5	Latin	نسمات	\N	//	نسمات	\N	0	2025-12-29 16:31:14.94093
793b8203-e8db-4194-b273-09f51bc1ecff	8648c111-f28f-4f0f-9dec-8d88f3455274	Latin	فاطمه	\N	//	فاطمه	\N	0	2025-12-29 16:31:14.929182
795c842c-ec6e-42ba-98ec-2c432224b731	7bf62e83-8b40-4612-8180-ed6799b3c5cd	Latin	عبد الرحيم	\N	//	عبد الرحيم	\N	0	2025-12-29 16:31:14.922132
79ae4693-6ff5-4040-9ef5-5f73e758dffc	66762b55-a7f9-4eb6-b679-1837ee6fcf9f	Latin	سعيده	\N	//	سعيده	\N	0	2025-12-29 16:31:14.919251
7a28388b-a98f-495c-a87d-886003127f3b	c583a531-e16c-40df-8694-b52868b4b74f	Latin	وليد	\N	//	وليد	\N	0	2025-12-29 16:31:14.958569
7b386a7b-6393-4d4d-9b68-1d278a3882f0	97e0dc07-6ba9-41b3-a392-f4f0a0ef2737	Latin	برى	\N	//	برى	\N	0	2025-12-29 16:31:14.908891
7c0582b5-7c06-4d00-a5b1-f9e1b90e626d	806c3be9-5054-40a0-a67c-89c184a0e34b	Latin	محمد	\N	//	محمد	\N	0	2025-12-29 16:31:14.961902
7c68aed1-6614-4760-ad88-2636c45b0719	de21836e-36a4-4655-b204-d32aed148699	Latin	محمد	\N	//	محمد	\N	0	2025-12-29 16:31:14.93604
7c79d409-3562-47ae-a3bb-6bee1a24573e	53540c17-78f7-437e-ab6b-87c642f1e868	Latin	سعيده	\N	//	سعيده	\N	0	2025-12-29 16:31:14.926105
7c8a21b8-60d5-4a7d-a5fd-e38986d7f18c	66bfe7b7-2c8c-4cf5-ae84-8b348fe68cbd	Latin	فاطمه	\N	//	فاطمه	\N	0	2025-12-29 16:31:14.918387
7cb90d53-3a14-4163-9079-c307e8b4c151	f20edf06-3e22-4d9d-a1c9-82d8dbd50b52	Latin	محمد	\N	//	محمد	\N	0	2025-12-29 16:31:14.911577
7f3178a0-6c96-4a95-a217-bfbe39638dff	c994605c-13ff-4378-880d-4dbed278c51d	Latin	امال	\N	//	امال	\N	0	2025-12-29 16:31:14.974893
8017d74f-034b-4bb2-8899-306621bf8796	29a6853f-c91b-40d3-ab9a-0fa96762438c	Latin	 فاطمه ابايزيد	\N	//	فاطمه ابايزيد	\N	0	2025-12-29 16:31:14.936748
8042a307-193c-46c9-9c84-c7d234f00126	32e2834a-d60d-499c-a626-ae1c23b3dcf1	Latin	محمد حاج	\N	//	محمد حاج	\N	0	2025-12-29 16:31:14.948417
8126287c-abbc-45c1-b502-d33fb2145423	387edd28-b954-47e9-ab76-633166aa4758	Latin	احمد	\N	//	احمد	\N	0	2025-12-29 16:31:14.96727
813548c2-0469-4dae-a29e-5baa3ef0898f	43034613-869a-4c09-ac18-a854a35fe9a6	Latin	زينب	\N	//	زينب	\N	0	2025-12-29 16:31:14.911747
8233b95d-07fc-4bc1-8b6d-2c72f8c4fc73	20979cb9-e457-4fdd-be3a-cf039754b7ab	Latin	عبد العزيز	\N	//	عبد العزيز	\N	0	2025-12-29 16:31:14.920346
830b04b5-0a89-470e-a9ae-348bf037ab98	6921ef81-45c1-48a9-9e58-38fc2117ac58	Latin	احمد	\N	//	احمد	\N	0	2025-12-29 16:31:14.911907
8443a92a-db75-4e57-9393-1b1b6c296c33	dd8ce14b-7b18-4673-a974-cbf78d659082	Latin	محمد	\N	//	محمد	\N	0	2025-12-29 16:31:14.941801
8456cef4-c20d-4bf3-bb18-a3a2a98a111b	9a1d400a-0dee-4bb9-93d9-a74f15f3cb98	Latin	اسامه	\N	//	اسامه	\N	0	2025-12-29 16:31:14.923557
84e19617-8385-47df-9e28-0def2966b185	1630f623-14c7-4db9-b354-666c1300d9e0	Latin	احمد	\N	//	احمد	\N	0	2025-12-29 16:31:14.912415
86c0d56a-e537-491a-96b6-84a43d83ff82	c3ebb6f6-de02-4b1a-8f71-fbd3c26eae45	Latin	سعيده	\N	//	سعيده	\N	0	2025-12-29 16:31:14.947448
874e9738-535b-4bb5-9211-a6ca297bfc0e	07c365b3-2f9f-4397-9605-db31ba4c7752	Latin	اسمهان	\N	//	اسمهان	\N	0	2025-12-29 16:31:14.947867
8765e9e8-83cc-4f38-bde5-e78e26619d74	07859a4d-d5cf-4078-867a-53594e735c31	Latin	فتحيه	\N	//	فتحيه	\N	0	2025-12-29 16:31:14.942493
886eb87c-0872-4595-85e2-2f026efa937f	818a3554-ada0-4144-81ba-ea2d00b18851	Latin	عبد القادر	\N	//	عبد القادر	\N	0	2025-12-29 16:31:14.913322
891af877-cc6d-4c75-9aba-07a5ae7eafbc	329a1d03-3aca-47f2-8490-a2c7348be885	Latin	علاء	\N	//	علاء	\N	0	2025-12-29 16:31:14.967447
8955bf97-9536-4bb2-a38a-51f82b13a98e	49e5a66c-f97d-49cb-89a4-ec66a2423024	Latin	فاطمه	\N	//	فاطمه	\N	0	2025-12-29 16:31:14.926788
8aa6ce05-c691-467f-b2fb-28b165751d7c	99fe3a58-fd18-4de2-bcf6-0971b019fb65	Latin	عبد الحليم	\N	//	عبد الحليم	\N	0	2025-12-29 16:31:14.915343
8b5b5586-fba5-4c8c-a833-a4b82023aa1a	188b6de4-b9c3-4bc4-9af7-b00278731ddb	Latin	مروه	\N	//	مروه	\N	0	2025-12-29 16:31:14.965337
8b68f548-16c3-493c-ab21-0bbd60548de1	b046d245-e224-482d-ad09-e571f84d37ff	Latin	محمود	\N	//	محمود	\N	0	2025-12-29 16:31:14.925579
8b9c9ab1-0406-47a1-b43e-62a4ceb8bf06	09f233c6-9768-436e-896f-220370713add	Latin	احمد	\N	//	احمد	\N	0	2025-12-29 16:31:14.946414
8c06802f-1178-47d6-aa59-85244f9ffded	f43058ff-54b4-42b3-837e-57c08655f9f6	Latin	عثمان	\N	//	عثمان	\N	0	2025-12-29 16:31:14.917503
8ce1a943-04f3-4c7d-b17c-4cc5d4c6a776	81720561-a4a7-4054-96e4-02a89cf0c9ca	Latin	سهى	\N	//	سهى	\N	0	2025-12-29 16:31:14.976476
8d7d8f01-87c1-4766-8e51-5524412772db	1c6ea137-4121-40f2-852b-b78686fd071b	Latin	عبد العزيز	\N	//	عبد العزيز	\N	0	2025-12-29 16:31:14.961376
8f1cc580-f417-4b28-8739-d5de804b1414	a2559eae-1de4-4ff0-9c8b-785fd86bf28d	Latin	فردوس	\N	//	فردوس	\N	0	2025-12-29 16:31:14.927302
9101f0ba-04e7-44df-a8cd-3a67fc9a26cd	e1911895-7775-491c-a755-ef8a5dbe337e	Latin	مروان	\N	//	مروان	\N	0	2025-12-29 16:31:14.929873
91e232d1-829a-4692-a107-f9b8bdc5bb27	2aaf36b3-1784-43b1-af3d-db36fe7a5d84	Latin	عمرو	\N	//	عمرو	\N	0	2025-12-29 16:31:14.934163
9277c3d4-56a0-4469-815b-c0ee7e549351	3da7bbb2-8241-4bff-9a80-2b78b6c50a87	Latin	دعاء	\N	//	دعاء	\N	0	2025-12-29 16:31:14.96972
930b07dd-e2fa-4c6c-9a5e-de3f595c2cff	822cc8a5-c22d-4a68-9375-662ea3b2dfc6	Latin	عبد القادر	\N	//	عبد القادر	\N	0	2025-12-29 16:31:14.911248
93e0259d-e9b0-4ce1-8faa-645ca1440776	ae0cd9a8-1fae-4418-bf28-e8fadc2fbc74	Latin	عمر	\N	//	عمر	\N	0	2025-12-29 16:31:14.936258
94aca7de-248f-495e-b0e3-54831f291234	4466efbf-f708-4a29-b13d-5c28297f4db3	Latin	شوقى	\N	//	شوقى	\N	0	2025-12-29 16:31:14.945896
94d9716c-c6c4-401f-a56a-a8d725198de6	8e032a15-783b-40d2-8c8c-33aa63af9c63	Latin	زينب	\N	//	زينب	\N	0	2025-12-29 16:31:14.968445
95356e56-cb65-44c6-a852-287bd6918082	f8b1a730-10b7-4498-81d7-97a58ad0ec53	Latin	وجدان	\N	//	وجدان	\N	0	2025-12-29 16:31:14.959448
954177f2-164c-4cc7-b925-4b0e67c41fd1	132eb7da-a33c-4e34-80cc-931304148855	Latin	محمد	\N	//	محمد	\N	0	2025-12-29 16:31:14.919421
95aa3c9e-556c-4447-b7f9-898ab327b0ff	a45a0267-d72a-4b26-8d48-2b780eae7557	Latin	صلاح	\N	//	صلاح	\N	0	2025-12-29 16:31:14.962742
964672ce-f9a3-495c-95cf-a09f42c0dd7b	6ba75b67-065b-4d8e-83f7-438a292e9285	Latin	هانم	\N	//	هانم	\N	0	2025-12-29 16:31:14.910369
9658f8c6-ad8a-4679-825a-6043a8f56282	3d377878-47f8-44d4-b8f8-c69247708b99	Latin	 سامح	\N	//	سامح	\N	0	2025-12-29 16:31:14.973832
966f602c-2846-4186-a97c-612949d5dbf5	41ab25c4-81ea-46f0-8ec7-82f30f270160	Latin	نجاة	\N	//	نجاة	\N	0	2025-12-29 16:31:14.940033
96762dc2-fff6-4116-90a4-28d46dae531d	5f41b7a1-b5ac-4cf3-ad82-3735b1f050f4	Latin	عزيزه	\N	//	عزيزه	\N	0	2025-12-29 16:31:14.962913
97c4510d-2833-4009-bfb5-32a22d160bc4	2b6d5983-a17e-4413-9888-6e9673e94ad9	Latin	هاله	\N	//	هاله	\N	0	2025-12-29 16:31:14.962408
99c1c968-769c-47c2-92f1-1a3cd28cf29a	1bc6a1c3-74e5-4a82-b4bd-c35653f6de9a	Latin	احمد	\N	//	احمد	\N	0	2025-12-29 16:31:14.953704
9a3324d7-f8ba-4544-8031-86950d10d056	f9e4938d-5c2d-4827-b9d9-d6962aec538e	Latin	 رامى	\N	//	رامى	\N	0	2025-12-29 16:31:14.965167
9adfbe65-f837-4cd1-badb-357cc82ebad5	f738e1ee-e9f7-49c8-91a5-31f9b9564754	Latin	فاطمه	\N	//	فاطمه	\N	0	2025-12-29 16:31:14.939452
9b19ed5a-c637-428d-9452-634b3d85bcb3	68641213-079d-4200-80e0-437391610deb	Latin	زهره	\N	//	زهره	\N	0	2025-12-29 16:31:14.92109
9b81a9e2-439d-469e-91c0-81efb18219a0	62325283-63f0-4f68-84f9-f52a8c6cde69	Latin	محمد	\N	//	محمد	\N	0	2025-12-29 16:31:14.917331
9bbb4be6-bdd5-42e7-b157-2ec181c9b64a	e8b6f8e0-7503-4834-b07a-7501aec4aac9	Latin	مصطفى	\N	//	مصطفى	\N	0	2025-12-29 16:31:14.925242
9df3dd49-8620-4434-bee4-25b81cf42342	e9f03b18-e18e-448d-b431-48adc339cf9b	Latin	طارق	\N	//	طارق	\N	0	2025-12-29 16:31:14.944661
9ede24ba-a0ef-49c4-b1c9-0c036aab6ad0	12bf3ef5-8a0d-42a0-8f68-fe9ce2113dde	Latin	محمد	\N	//	محمد	\N	0	2025-12-29 16:31:14.955318
9fc02019-a685-4d13-8a53-9f09547ec666	0f4c9db3-f3fb-4909-8c3f-b294735a2b0f	Latin	ابتسام	\N	//	ابتسام	\N	0	2025-12-29 16:31:14.960671
a01cd595-96b6-4286-8df8-03e6768e4312	f66d612b-8b5c-4c89-b4e2-bf67b591d566	Latin	احمد	\N	//	احمد	\N	0	2025-12-29 16:31:14.933819
a082fd51-5196-4fb1-92db-a394f970bc43	925b6cd7-e284-4d9a-9f84-aff837ea3a64	Latin	رضا	\N	//	رضا	\N	0	2025-12-29 16:31:14.945003
a09c5cc4-ef0c-4ff4-8a04-4b81c757795e	a8bb31d9-739f-4081-8a25-b8dfc1fbb1c3	Latin	الفاتح محمد عبدون	\N	//	الفاتح محمد عبدون	\N	0	2025-12-29 16:31:14.964808
a0ac9cf1-5abf-40cf-95a4-00086634583d	9588ae77-fb61-481a-95fe-d44540d9c0c9	Latin	زهره	\N	//	زهره	\N	0	2025-12-29 16:31:14.948995
a0e554d7-8b6c-4811-9b16-407815d455ce	db41a3d7-dd86-46a6-bddc-3928f11adb74	Latin	احمد	\N	//	احمد	\N	0	2025-12-29 16:31:14.928334
a12ae13a-2d3d-4fab-8567-f4a84c2ff015	7bf610c8-5a1b-4c9e-91e5-49d7c7bccc0a	Latin	أواب	\N	//	أواب	\N	0	2025-12-29 16:31:14.965692
a234562c-a69f-4cf7-9cc6-4705d35ecbd0	6965b15f-d56d-4014-b4dc-2296e0234ade	Latin	فاطمه محمود	\N	//	فاطمه محمود	\N	0	2025-12-29 16:31:14.915845
a2da3c54-5bb5-4c47-9ccd-198c54d1309f	7915d38b-983d-4280-a2ce-1b1714d70ba6	Latin	لقمان	\N	//	لقمان	\N	0	2025-12-29 16:31:14.946066
a2ede733-b74b-4705-8268-363f67a9a04c	8ba9f4f4-0fc9-445d-805d-2e0ed559c149	Latin	ايمن	\N	//	ايمن	\N	0	2025-12-29 16:31:14.972226
a3018df4-d724-490a-a9d2-dbc74e0462e3	97586628-2092-49e3-9556-8a04c4423ee4	Latin	محمد	\N	//	محمد	\N	0	2025-12-29 16:31:14.913088
a349c794-4cf1-45a9-9647-909e442d394c	8815f86f-febd-4639-bd1d-0e946afa280b	Latin	بتول	\N	//	بتول	\N	0	2025-12-29 16:31:14.923934
a3c5d169-8f12-4f4f-9ecd-b4d72cf782ca	539b46d3-0702-4d3a-8a05-6beff160a092	Latin	فاطمه	\N	//	فاطمه	\N	0	2025-12-29 16:31:14.919775
a3daa4c3-9b33-4a94-bf0b-d9695d45eaa6	3a2fafe3-0d71-40b5-b2c4-bd9e1b159f3c	Latin	على	\N	//	على	\N	0	2025-12-29 16:31:14.972782
a56680db-0a71-422c-9905-32e03e7b8652	62856f54-242c-4f67-8220-cb451ce52031	Latin	امين نورى	\N	//	امين نورى	\N	0	2025-12-29 16:31:14.952706
a6a8da11-602a-4fe4-b911-a2bfd35e7769	8039b17f-3028-43be-9ba8-1c3498ef85a9	Latin	عائشه ابا يزيد	\N	//	عائشه ابا يزيد	\N	0	2025-12-29 16:31:14.909273
a7beb9be-f289-474c-ac6a-a4db44c6d2c7	df60a1ec-ab32-45b2-9ca2-93f7926ffa96	Latin	امينه	\N	//	امينه	\N	0	2025-12-29 16:31:14.914162
a81810d2-218f-4bff-b289-7aabf2fd4fe7	8c6f490b-55da-45f3-b1f6-ae54dde406ef	Latin	سميحه	\N	//	سميحه	\N	0	2025-12-29 16:31:14.923039
a897fca5-e952-4940-9ee5-62622012b7a1	43ba5ec9-f935-4c0d-93c6-8beb676a3250	Latin	محمد عيبر	\N	//	محمد عيبر	\N	0	2025-12-29 16:31:14.966569
aa0081a2-0a8f-4b7e-b613-35bf37326f83	f6feaafe-2930-415a-877d-49f9265fb8d2	Latin	عبد الحميد	\N	//	عبد الحميد	\N	0	2025-12-29 16:31:14.920569
aa1bd387-0d41-4384-a372-f925c1c8da69	7de1781e-89dd-4454-800c-5ba3c1ec7885	Latin	منى	\N	//	منى	\N	0	2025-12-29 16:31:14.974539
aa764915-4d58-4968-be14-f07cb24f2459	12ffb31b-f46b-422f-9124-00f363f1ac7b	Latin	احمد	\N	//	احمد	\N	0	2025-12-29 16:31:14.970948
aa9f7f76-677d-44bf-a58a-9c4c2d0cc72e	8152d60b-ded3-4367-8ea1-00c3d23ae4fe	Latin	فاطمه	\N	//	فاطمه	\N	0	2025-12-29 16:31:14.95997
ab5eaaa6-ac59-4946-8921-741f63d6f2f9	b88dfb6a-da70-4ea5-ad2c-efd1c33156b9	Latin	اسامه	\N	//	اسامه	\N	0	2025-12-29 16:31:14.97542
ab87b075-9350-43e4-a925-cb7ad3056cda	842b98e1-7e28-434f-823a-cb52acf765f5	Latin	عبد المنعم	\N	//	عبد المنعم	\N	0	2025-12-29 16:31:14.920739
ab8b136f-cd10-4180-a218-3c3dd454dc41	5ce8f136-8175-4034-9249-4458b20c1cab	Latin	ثريا	\N	//	ثريا	\N	0	2025-12-29 16:31:14.97131
ac57da22-f41a-4b54-b39c-c7f91089e10e	efa08ac8-e46c-4928-915f-f6770536ec25	Latin	تامر	\N	//	تامر	\N	0	2025-12-29 16:31:14.967092
acec6a95-0f42-4fe9-acaa-d5c84b68966a	8a0a9041-138d-401a-9388-4c09f183c103	Latin	كريم	\N	//	كريم	\N	0	2025-12-29 16:31:14.964456
ad834472-aee5-4875-bcaf-e500954ef645	aa0ec19d-05fe-4c67-8462-5fc99badd90d	Latin	هجره	\N	//	هجره	\N	0	2025-12-29 16:31:14.91054
aed76b33-efb5-4549-9175-e9fd1272c063	86247581-25d4-4736-a2b4-9d8e62e0afbd	Latin	ساره	\N	//	ساره	\N	0	2025-12-29 16:31:14.971138
aeddd049-e88f-487d-b4f5-707ef00cbe77	18d51473-0cfe-4776-ac02-c89fb2d29087	Latin	زينب	\N	//	زينب	\N	0	2025-12-29 16:31:14.959624
afb1eb89-f85d-44fb-a930-00e84dfbea8e	c4961ae1-d224-4c65-b472-e11cf7517795	Latin	محاسن	\N	//	محاسن	\N	0	2025-12-29 16:31:14.944311
afb6cd3f-7c7a-4b8f-9a05-f7e6023dd1f1	f99f8826-c8b7-4ed9-a3a4-3f805cedbc1d	Latin	محمد	\N	//	محمد	\N	0	2025-12-29 16:31:14.932787
b004e160-22fc-40bb-b985-5aeeb5dabdba	3a7bdfc0-830b-44c6-86ee-dfa84b9b3a6a	Latin	ابو الوفا	\N	//	ابو الوفا	\N	0	2025-12-29 16:31:14.931946
b13ef927-97e2-462e-8f03-69400ad839e0	6b4bc1f2-f7fd-4ca8-bb35-7a14eabfa434	Latin	احمد	\N	//	احمد	\N	0	2025-12-29 16:31:14.920114
b1c03ee2-9e00-4a94-a65f-3a88714f5cb8	883f5f91-3f16-4eab-8744-e519e45d256f	Latin	نوال	\N	//	نوال	\N	0	2025-12-29 16:31:14.940377
b43bc01f-ca66-4a19-b183-40037d381782	e7c9085f-4613-453d-8233-7171e2cf9609	Latin	امنه	\N	//	امنه	\N	0	2025-12-29 16:31:14.907607
b4a4f15d-1712-4669-93a2-4648a81eeab7	198fd73a-e56d-48c9-9473-1cd6a830a62a	Latin	محمد	\N	//	محمد	\N	0	2025-12-29 16:31:14.914504
b570105d-d8d2-4948-b07a-601487e962ca	ebeba076-fd3d-4db5-afdd-1b4d9042d038	Latin	tbd	\N	//	tbd	\N	0	2025-12-29 16:31:14.962578
b67c86c4-bcac-49bf-b652-fc28de232730	b2bea596-1fcc-4a7f-a6d7-fc9a0d26e265	Latin	صباح	\N	//	صباح	\N	0	2025-12-29 16:31:14.941627
b7c8dd3f-cb6e-4d9d-a017-25adee694e78	49d29a10-f412-473b-8f8f-3a859cba6995	Latin	عنايات	\N	//	عنايات	\N	0	2025-12-29 16:31:14.930815
b7ee670a-47dd-409f-b1e6-b0c5bba252ab	e45421fd-a9ed-492d-8f70-1140742f562c	Latin	جليله	\N	//	جليله	\N	0	2025-12-29 16:31:14.95232
b83bbeae-e07c-4a58-814b-6305d2e7414d	7b053907-6f2c-429a-b61e-775ffe91d482	Latin	عاصم	\N	//	عاصم	\N	0	2025-12-29 16:31:14.934668
b87dba4f-36e7-4255-a33e-0dbc00a6d81a	82cc8c14-bd9b-4002-836d-4d0b4a712a4d	Latin	محمد	\N	//	محمد	\N	0	2025-12-29 16:31:14.912078
b88879a8-8dff-4aad-bffa-cc85511c1902	1ee4c37d-18a5-49b2-b0ea-59683c08c323	Latin	سيد احمد	\N	//	سيد احمد	\N	0	2025-12-29 16:31:14.926961
b8a2e4b7-9fe4-4009-9b18-49d70eee08f5	20cbc50d-1aa5-4b6a-bbfc-80304fe0c544	Latin	هجره	\N	//	هجره	\N	0	2025-12-29 16:31:14.907412
b9af2280-5825-4393-bb22-05142d8223af	6a845e8b-803e-4104-8c22-a74ea7b85e2a	Latin	كريم	\N	//	كريم	\N	0	2025-12-29 16:31:14.969956
ba0c7f0f-2db5-4669-b8fe-0d2a7997ccdc	eefd1cd9-f475-4bac-98a3-7e0def26c573	Latin	ناجى	\N	//	ناجى	\N	0	2025-12-29 16:31:14.939813
badccc57-603a-45b2-8187-a440ca3a61a7	9be2e68a-9266-4a0e-a103-ba446735f2dd	Latin	فاروق	\N	//	فاروق	\N	0	2025-12-29 16:31:14.927645
bcbfd072-baad-4f08-8124-9c19b362d904	4a6d22c2-43f0-490c-bbfa-f0c187ec77d5	Latin	على	\N	//	على	\N	0	2025-12-29 16:31:14.975944
bcdb2691-6fea-4e32-86f1-9a11c8d4a806	113a3b6b-bc1d-4189-a5be-ff0f4b6da898	Latin	محمد عبدالحليم محمد	\N	//	محمد عبدالحليم محمد	\N	0	2025-12-29 16:31:14.973312
bd2713d5-999a-44aa-b94b-24c1543e1f47	8080f304-88e7-4326-89c8-5708d13fbcf0	Latin	محاسن	\N	//	محاسن	\N	0	2025-12-29 16:31:14.942661
bdb101e1-4a23-40f0-af7a-c9355101c09f	5998a405-ab45-42d0-a51e-767985fd8fa7	Latin	سامر	\N	//	سامر	\N	0	2025-12-29 16:31:14.938014
be118813-f196-4d77-8958-446613de0188	04d98e6e-4025-48ff-a39a-97de3d540629	Latin	عبد الرحمن	\N	//	عبد الرحمن	\N	0	2025-12-29 16:31:14.930465
c079478e-5ca6-46ff-81ea-bbee334279ac	6812b606-b794-4227-a4ac-2084fa563655	Latin	محمد	\N	//	محمد	\N	0	2025-12-29 16:31:14.951742
c0d9a650-781f-4bac-83e9-1747e743791c	9e233a52-68ac-4562-bed2-3fbae2aec730	Latin	عباس	\N	//	عباس	\N	0	2025-12-29 16:31:14.914829
c10c39a9-c58c-448f-b2e4-4c98b42a12da	cc5b31d8-55c1-48c1-8b90-948dc0fb4624	Latin	محمد	\N	//	محمد	\N	0	2025-12-29 16:31:14.956217
c1210044-e732-43a3-83c2-7abd96c8ff32	934ca836-be77-422a-9cbd-34fb31969486	Latin	وائل	\N	//	وائل	\N	0	2025-12-29 16:31:14.945181
c128d33d-2d4d-4a15-aced-0a7192d58a5a	b713c623-e12c-4c4f-bef6-d2a387f88359	Latin	حسام	\N	//	حسام	\N	0	2025-12-29 16:31:14.93261
c38ba97d-b78d-44c1-b7cf-1611c235f008	0672b1df-9ded-4902-a914-6dfe4b32fbc8	Latin	زكيه	\N	//	زكيه	\N	0	2025-12-29 16:31:14.913822
c3cb263a-541b-4aed-85d6-5fc12b3f6c14	088cc246-a351-465e-b820-60b56fe2263e	Latin	متولى	\N	//	متولى	\N	0	2025-12-29 16:31:14.933125
c44e1d67-906b-45a4-a5fb-03baceb8e6fe	d7efedae-b5ad-43b0-9086-6749206f7216	Latin	احمد	\N	//	احمد	\N	0	2025-12-29 16:31:14.975243
c4919b24-33e1-4f34-9a0e-cc2e531d84e3	4418e04b-2f6e-4196-a0a1-57584f714f60	Latin	فاروق مصطفى	\N	//	فاروق مصطفى	\N	0	2025-12-29 16:31:14.954228
c602b14f-5190-4189-b094-635811bbfd32	1dd0b591-cf5a-4021-bd1e-d7881437b110	Latin	حسن	\N	//	حسن	\N	0	2025-12-29 16:31:14.925043
c6cd67d1-8856-43dd-bdde-c4e010cb0814	9e3b5733-9174-42c4-ae99-d7d15a640b2b	Latin	بتول	\N	//	بتول	\N	0	2025-12-29 16:31:14.920914
c80c3c8d-8caf-468c-ada4-f7c2c2dc6384	95e11722-dda6-4ba8-88c4-e68494398ecf	Latin	محمد	\N	//	محمد	\N	0	2025-12-29 16:31:14.959792
c8c40f54-03dd-43f2-8a79-2438e6f44b88	77759e69-6fc4-4eeb-b591-751f3ca36f68	Latin	زينب	\N	//	زينب	\N	0	2025-12-29 16:31:14.919601
c8d12880-229e-4205-a153-6d98c62cd406	ae0755a8-a20e-47b1-abf9-5fc6f7347139	Latin	 داليا	\N	//	داليا	\N	0	2025-12-29 16:31:14.974716
c903db42-f2e4-40c0-b15d-a9c2b47c76d1	28e0e0d9-ff42-4392-a80e-2f899f7e7fe8	Latin	 احمد	\N	//	احمد	\N	0	2025-12-29 16:31:14.964986
c969d38d-3f06-4c73-bd7e-94fb148ff2ee	a174a146-486c-4fe0-9643-a152153d1b27	Latin	نفيسه	\N	//	نفيسه	\N	0	2025-12-29 16:31:14.949529
c9ba1e0e-dfe4-4468-9856-bf15df8479c3	43f290d1-145d-4a30-b375-fe7d58e9406e	Latin	شداد	\N	//	شداد	\N	0	2025-12-29 16:31:14.956606
c9fc97cc-209a-4477-9d55-3a833b814639	2ee746d7-3b1b-4d6a-b6af-9e4c820b3e3a	Latin	محجوب	\N	//	محجوب	\N	0	2025-12-29 16:31:14.951911
ca2a7826-e949-47c3-9392-654c4b4fc08d	74b38e76-dfbe-409b-ba03-f39025b6de2b	Latin	هانم	\N	//	هانم	\N	0	2025-12-29 16:31:14.918644
ca529386-17fa-40ba-b1bb-4a801f47aff9	f252346e-a197-4a27-9836-34fb7e50bffd	Latin	محمد	\N	//	محمد	\N	0	2025-12-29 16:31:14.916347
ca7598f8-e0f0-42c8-a105-e541941320aa	ee87be0a-b544-47ca-b093-4b168fbd9532	Latin	سلامه عثمان حاج	\N	//	سلامه عثمان حاج	\N	0	2025-12-29 16:31:14.931153
cafb1da6-1d48-46f3-a61b-c3586cd30529	9ea9feb7-4bdf-40e7-ac99-f7d7d0969229	Latin	رقيه	\N	//	رقيه	\N	0	2025-12-29 16:31:14.923383
cd97e0f9-7afd-48c1-8179-434ce8b3c265	20652c23-0026-494e-91c8-5ab698cc4aec	Latin	عبد الرحمن	\N	//	عبد الرحمن	\N	0	2025-12-29 16:31:14.925407
ce3beb77-6838-47e9-97ca-367423d55534	43933a5b-7afd-4fff-a6fe-3d7aae8619df	Latin	فاطمه	\N	//	فاطمه	\N	0	2025-12-29 16:31:14.944833
cfb68e88-afc4-48f9-9de6-a3b1dc3103a4	56f64ff2-3752-44b6-bd7c-7dfb1042fe27	Latin	محجوب	\N	//	محجوب	\N	0	2025-12-29 16:31:14.938733
d0486545-01bc-45d3-89ad-78e56f7d7b02	226dac23-4cf3-411b-8265-0aabf40bb02b	Latin	عواطف	\N	//	عواطف	\N	0	2025-12-29 16:31:14.930644
d196fb4f-5d99-4606-8910-ae56a06f26b8	6b426b41-4463-4f26-af7b-91c5c103df83	Latin	وفاء	\N	//	وفاء	\N	0	2025-12-29 16:31:14.959099
d41b7b4f-0de2-4dc9-a36f-c901f154818c	14047663-ef1d-431b-ae46-d289abae2411	Latin	نفيسه فضل	\N	//	نفيسه فضل	\N	0	2025-12-29 16:31:14.917973
d4669b31-ef36-4402-ae85-6633b85f6b08	d4fb5def-d0d6-4d1a-9095-58f16285ab6f	Latin	انتصار	\N	//	انتصار	\N	0	2025-12-29 16:31:14.929692
d4f3f1bf-fd01-4358-93ae-03a89ae85212	a8da5c60-9950-4a61-8bdb-01251affa1b9	Latin	 محمد	\N	//	محمد	\N	0	2025-12-29 16:31:14.974361
d5ea7a48-4589-4d52-980f-c892aad22c4c	2dce1a0b-11b9-41a7-827d-562234457252	Latin	عبده	\N	//	عبده	\N	0	2025-12-29 16:31:14.90803
d61e4a41-0f0a-4504-9080-20e5d1b85308	cda741ed-afbb-4795-a2ec-6e6b0375f0d0	Latin	لطيفه	\N	//	لطيفه	\N	0	2025-12-29 16:31:14.928161
d6e6c870-b8a9-49fc-865f-06672374b9ed	df227c3f-0f26-4e93-b7b9-dd6802a061a5	Latin	فاطمه (بابا زهره)	\N	//	فاطمه (بابا زهره)	\N	0	2025-12-29 16:31:14.950224
d6f1c212-ac43-4d98-895f-9e3601513259	256b6740-757c-4c62-9c1e-912cd09d6946	Latin	صلاح	\N	//	صلاح	\N	0	2025-12-29 16:31:14.94344
d960d6d5-ce46-422b-8b61-1b676cf62086	0831d51d-6c34-4e26-9cdc-eb57e0f4781c	Latin	انشراح	\N	//	انشراح	\N	0	2025-12-29 16:31:14.968255
d9819391-cee7-4369-9119-d2ecaeb27b25	e7882853-cc7a-4faa-adcc-ca1b29c661f9	Latin	يوسف	\N	//	يوسف	\N	0	2025-12-29 16:31:14.976297
da86b340-baf1-443c-9c35-83f693d4d7a0	07875362-d8ee-4928-86ac-7aecb98a86d6	Latin	شريفه	\N	//	شريفه	\N	0	2025-12-29 16:31:14.916179
dac62d6f-88ab-4180-9376-91d6aafcdd67	9526efce-2894-4b4f-a2fb-9d1d6a22015c	Latin	عثمان	\N	//	عثمان	\N	0	2025-12-29 16:31:14.953135
db65335f-acf3-4f04-b485-3e32094c33c0	a0d28119-3e65-42d4-8f64-61ef2942b030	Latin	عليه	\N	//	عليه	\N	0	2025-12-29 16:31:14.941974
dce754e9-de19-422f-8e24-b1a47102f96e	7dce3336-a904-4e58-b4ee-4b90af944e44	Latin	فوزيه	\N	//	فوزيه	\N	0	2025-12-29 16:31:14.925935
dcfdadf6-4f97-4001-aea0-652b3c097b72	5cd8dc2a-88d7-4086-af70-fa26d8d71ed5	Latin	اليسا	\N	//	اليسا	\N	0	2025-12-29 16:31:14.969549
dd55b676-3813-4733-939b-6186b6139329	58eeabb9-73a6-42d1-a743-49ec8debfcb5	Latin	 رانيا	\N	//	رانيا	\N	0	2025-12-29 16:31:14.964257
de2641b7-fc98-4377-a197-a451e8c27648	6c49b75d-7641-4a73-8174-62a31a9e91d2	Latin	علويه	\N	//	علويه	\N	0	2025-12-29 16:31:14.921259
df5b3543-fc21-419a-a7e4-38d04142b9a4	71baa9d5-46cd-4942-812e-2f49f5144350	Latin	موهوب	\N	//	موهوب	\N	0	2025-12-29 16:31:14.938198
e05b1fd1-0f8e-4d70-a9d8-2ed19cb12660	874fc067-a244-478a-ace5-0d352e439606	Latin	عبد القادر	\N	//	عبد القادر	\N	0	2025-12-29 16:31:14.916507
e085d4e1-e397-4599-8651-720beecabac8	ea942b8e-9168-4269-af69-51383d8d260d	Latin	فاطمه	\N	//	فاطمه	\N	0	2025-12-29 16:31:14.943786
e14ca70b-66b1-4b2b-8b64-1bec985ea773	e860251a-9d40-4de4-9dcb-1b93469fdf0c	Latin	السمؤل	\N	//	السمؤل	\N	0	2025-12-29 16:31:14.956998
e170e16a-3cd1-42f1-b98c-f6f059357ad9	42f2ce5a-4446-461f-9bb6-dcaa636b90c9	Latin	عبد العزيز	\N	//	عبد العزيز	\N	0	2025-12-29 16:31:14.947084
e2d2975c-9384-42ac-b350-7d3bb68ecf63	064a8791-ed32-44d6-b911-e3ed3e818261	Latin	عائشه	\N	//	عائشه	\N	0	2025-12-29 16:31:14.949704
e34c7cb3-ecb6-4509-adeb-b392d19e8953	e44cd487-3c0b-438c-819e-462bc3480ef1	Latin	فاطمه	\N	//	فاطمه	\N	0	2025-12-29 16:31:14.916669
e379878e-20dd-40ba-9a68-a23980a8ee07	f86f9da1-8530-46ab-8a13-3f21ec47a173	Latin	نفيسه	\N	//	نفيسه	\N	0	2025-12-29 16:31:14.913491
e3ac84f3-b36a-4da5-b509-aba0637523b5	5ee5eb1b-6f3f-469c-91b6-1c5300da8f71	Latin	عبد الحليم	\N	//	عبد الحليم	\N	0	2025-12-29 16:31:14.906528
e3c430df-9f03-4c78-87f5-74b73d5f0651	b871ee60-01ee-4d41-aebf-db6a2334744b	Latin	مشعل	\N	//	مشعل	\N	0	2025-12-29 16:31:14.954578
e3eee3d6-8cb9-4a4e-8654-c1cceca69dab	4630f7f8-db26-46df-93c5-1b8ff2d74445	Latin	فوزيه	\N	//	فوزيه	\N	0	2025-12-29 16:31:14.948046
e41a53a5-0078-484c-8b79-22475de486d2	9a1c68b9-7b7c-40d7-9f53-ba5b5c84e7db	Latin	شاديه	\N	//	شاديه	\N	0	2025-12-29 16:31:14.955665
e72f392c-6b38-4338-820f-f6b698de7141	22dbe006-c318-418b-a66e-2bfb6ebe2e17	Latin	منيه	\N	//	منيه	\N	0	2025-12-29 16:31:14.95681
e7cd8fa3-7445-4a99-96fb-155b0018a015	5087b661-e52b-417d-ad01-4aebfc684d3c	Latin	ناديه	\N	//	ناديه	\N	0	2025-12-29 16:31:14.923726
e7f968e7-acf2-4644-8029-7993552c8211	d8ade05c-ef45-4ad8-b8f1-7a67431d667e	Latin	ساريه	\N	//	ساريه	\N	0	2025-12-29 16:31:14.954923
e8359773-62a0-4245-8547-1969b6f56842	12acd2b4-5319-440f-a037-1e4ed0568bd6	Latin	محسن	\N	//	محسن	\N	0	2025-12-29 16:31:14.94128
e9ad9be6-24a0-4fb0-a0d7-c7609a543a15	b9c4aff5-4d35-41a2-90a7-6b8bf2aaf132	Latin	عزيزه	\N	//	عزيزه	\N	0	2025-12-29 16:31:14.947619
ec4f8a64-a339-44d8-830e-260eae74304d	8f4c4dff-b017-4a1d-b563-6bfcaba29a1d	Latin	على	\N	//	على	\N	0	2025-12-29 16:31:14.914663
ecd81cc8-5eb4-44e6-b553-9280d6b8668d	5b60b3c6-c57e-4b2c-bbb6-897f3052876b	Latin	هناء	\N	//	هناء	\N	0	2025-12-29 16:31:14.938371
ecf2f135-38e9-4f75-9429-c60ff96f8b78	8206cda8-fa63-444c-a163-cca7b9db0620	Latin	بدر	\N	//	بدر	\N	0	2025-12-29 16:31:14.795801
eda1c685-b7be-4cea-84cc-9ce9ad66a7f4	05d61ba4-ede6-48ac-b255-fa8693be7061	Latin	خالد	\N	//	خالد	\N	0	2025-12-29 16:31:14.972403
eea4bd20-5310-4aba-9381-c8d87a420579	878307d1-6e66-4245-97f4-7cb71982ec00	Latin	ايهاب	\N	//	ايهاب	\N	0	2025-12-29 16:31:14.946253
eeb0c173-5363-424c-a05f-68a8b7393366	a887abc4-617f-4417-a43e-2017f9e69c1c	Latin	اميمه	\N	//	اميمه	\N	0	2025-12-29 16:31:14.935787
ef345560-41b2-4775-8c5b-1f1f76d44376	5e856554-dfb5-4657-9265-01096f0f6451	Latin	محمد	\N	//	محمد	\N	0	2025-12-29 16:31:14.933647
f0319897-0bf8-43af-908d-7312c5ac5f7a	bd950ffd-8680-4803-b845-1542f9f85549	Latin	مهند	\N	//	مهند	\N	0	2025-12-29 16:31:14.962071
f05eabfb-8604-4cc5-9ca6-23c9338921bf	51608bf6-00cb-401c-8d52-277068e91c6a	Latin	نجوى	\N	//	نجوى	\N	0	2025-12-29 16:31:14.940207
f0c4491c-c738-4e49-b14d-690135cf72eb	3f5b9f66-9803-4368-8dd4-eeb2b3f83dec	Latin	شريفه عبدالرحمن فقير	\N	//	شريفه عبدالرحمن فقير	\N	0	2025-12-29 16:31:14.916007
f17b3200-c26d-422e-b8d4-f70cdf9afe6b	5d0f3a15-3457-4304-ad3f-9e44c33dfc73	Latin	اشراقه	\N	//	اشراقه	\N	0	2025-12-29 16:31:14.958044
f1929448-d6f8-4c46-9032-6b10907ab85e	3ea3b6ce-d497-4f20-80a3-7f3801c0d0f5	Latin	رباب	\N	//	رباب	\N	0	2025-12-29 16:31:14.951383
f1af668b-4d60-48b1-815b-ab526d38413d	471a7760-cb62-4c00-89e3-f0cbcfffc40e	Latin	عثمان	\N	//	عثمان	\N	0	2025-12-29 16:31:14.912584
f26ccdd8-09ef-44a2-90ff-cd9ef40c10cf	e1d30736-5971-45ff-a06a-f4de4a7acf7e	Latin	مها	\N	//	مها	\N	0	2025-12-29 16:31:14.973129
f2c6c255-f774-4c45-8266-99b3849a19a8	9a5cef95-9851-4265-9c0f-fa8efb1409af	Latin	شاهيناز	\N	//	شاهيناز	\N	0	2025-12-29 16:31:14.974006
f33c76d4-4f62-4b90-aaa0-1b4778c9e6b4	6ce83efc-05d0-4c17-9d54-8f9eae1c0c63	Latin	زينب	\N	//	زينب	\N	0	2025-12-29 16:31:14.92321
f3afb7ee-a580-4456-aa42-e472a0ce03f0	0a160248-e4f5-449f-a4af-9dd4197f735a	Latin	محمد	\N	//	محمد	\N	0	2025-12-29 16:31:14.906324
f4f71d1f-f9bd-4cc7-9b7f-66d5a48d38bf	898cfffd-6302-4f0a-99fa-63ab41e07dc1	Latin	مصطفى	\N	//	مصطفى	\N	0	2025-12-29 16:31:14.947271
f6295f28-6d7c-4a9c-9454-ff48bc4093f3	b16e1013-de3c-4876-8f2d-41033e1ffb28	Latin	معز	\N	//	معز	\N	0	2025-12-29 16:31:14.940753
f68d6195-d86f-4a29-b934-23b58fa0a080	a8c68d0c-9488-4a1d-9624-665175ef1c59	Latin	محمد	\N	//	محمد	\N	0	2025-12-29 16:31:14.967868
f7090ca1-f2bb-4458-addf-55e032a1e584	9ec8c2ad-7a10-4e0d-b22c-dbf241a5e84c	Latin	ساره	\N	//	ساره	\N	0	2025-12-29 16:31:14.957525
f7332c2f-a84e-4a23-b3ee-0230217f74bf	c3aa665d-1a7a-40c9-b6be-fe9a43fcd8f7	Latin	ندى	\N	//	ندى	\N	0	2025-12-29 16:31:14.971491
f98b66e9-a9f1-43fc-a758-dc8a73c174e7	3c042938-82b4-4060-92c3-6762366c5e4c	Latin	فتحى	\N	//	فتحى	\N	0	2025-12-29 16:31:14.945524
f9d0343a-033a-4ddf-8152-8a796cbd54cb	3d0b6753-d73b-47d0-bcf4-af4787487323	Latin	طاهر	\N	//	طاهر	\N	0	2025-12-29 16:31:14.931331
fc15e3ab-6530-4aaa-b4cf-61b8b1be346e	ee816f93-85ab-4827-ac7d-fb13f8a926df	Latin	ثريا	\N	//	ثريا	\N	0	2025-12-29 16:31:14.922646
fcdd3293-35aa-42e9-a99b-d89bb181688a	5ea9d2fc-288e-4997-b046-0b57b502e3d0	Latin	محمد الهادى محمد كدوده	\N	//	محمد الهادى محمد كدوده	\N	0	2025-12-29 16:31:14.971669
fcdde349-447e-4483-b19f-aaf84144ce38	dcfb3ecf-2e43-4c4f-a6bd-6ca52405380e	Latin	 فدوى	\N	//	فدوى	\N	0	2025-12-29 16:31:14.966923
fe5d35da-4695-489e-96c9-8ba1df2a8bfa	d7467f95-6146-493e-b209-686878c3e641	Latin	حاتم	\N	//	حاتم	\N	0	2025-12-29 16:31:14.938552
fecc2cb4-2107-4bb1-b94b-f0358d57b7af	b1d2b30a-32a3-4db8-9927-6a212b2a79a0	Latin	حنان	\N	//	حنان	\N	0	2025-12-29 16:31:14.946584
ff93f16a-d18e-469c-b0c5-8d92a8c78473	5865b700-fea3-4e30-a02d-4e9347a7935e	Latin	زهره	\N	//	زهره	\N	0	2025-12-29 16:31:14.928842
ffba455c-bf3c-426f-83ac-84302a618943	6910f824-c647-4e09-8407-0a74245d41f2	Latin	احيد	\N	//	احيد	\N	0	2025-12-29 16:31:14.958225
ffd86310-aa5a-495a-99de-1af1278c814d	100e3388-7500-4115-b127-a133e69aad3f	Latin	فايزه	\N	//	فايزه	\N	0	2025-12-29 16:31:14.953324
ffeb7933-007f-4de5-9e3a-720659a39eff	fcf6790a-800a-4dbd-a6b1-d33a7cd50ca4	Latin	ساره	\N	//	ساره	\N	0	2025-12-29 16:31:14.957179
\.


--
-- TOC entry 3906 (class 0 OID 71250)
-- Dependencies: 229
-- Data for Name: PersonTags; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."PersonTags" ("Id", "PersonId", "TagId", "CreatedAt") FROM stdin;
\.


--
-- TOC entry 3897 (class 0 OID 71063)
-- Dependencies: 220
-- Data for Name: Places; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."Places" ("Id", "OrgId", "Name", "Type", "ParentId", "Latitude", "Longitude", "AltNamesJson", "CreatedAt") FROM stdin;
\.


--
-- TOC entry 3921 (class 0 OID 72421)
-- Dependencies: 244
-- Data for Name: RefreshToken; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."RefreshToken" ("IssuedAt", "ExpiresAt", "IsRevoked", "RevokedAt", "Value", "Id", "UserId") FROM stdin;
\.


--
-- TOC entry 3925 (class 0 OID 72437)
-- Dependencies: 248
-- Data for Name: SignerToken; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."SignerToken" ("IssuedAt", "ExpiresAt", "IsRevoked", "RevokedAt", "Value", "IsUsed", "UsedAt", "IssuedTo", "IssuedForDocumentId", "Id", "RecipientEmail", "IssuedToId", "Passcode") FROM stdin;
\.


--
-- TOC entry 3904 (class 0 OID 71230)
-- Dependencies: 227
-- Data for Name: Sources; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."Sources" ("Id", "OrgId", "Title", "Repository", "Citation", "Url", "MetadataJson", "CreatedAt", "UpdatedAt") FROM stdin;
\.


--
-- TOC entry 3905 (class 0 OID 71242)
-- Dependencies: 228
-- Data for Name: Tags; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."Tags" ("Id", "OrgId", "Name", "Color", "CreatedAt") FROM stdin;
\.


--
-- TOC entry 3932 (class 0 OID 72813)
-- Dependencies: 255
-- Data for Name: Towns; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."Towns" ("Id", "Name", "NameEn", "NameAr", "NameLocal", "Description", "Country", "CreatedAt", "UpdatedAt") FROM stdin;
177581d9-b35c-4fe0-af88-6ffed6179379	وادي حلفا	Wadi Halfa	وادي حلفا	ⳣⲁ̄ⲇⲓ ϩⲁⲗⲫⲁ	حلفا	Sudan	2025-12-21 16:30:43.077326	2025-12-21 16:30:43.077326
77b38413-d705-421e-abed-c739e741eb51	حلفا القديمة	Old Halfa	حلفا القديمة	ⲟⲩⲛⲇⲉ̄ⲛ ϩⲁⲗⲫⲁ	حلفا	Sudan	2025-12-21 16:30:43.077326	2025-12-21 16:30:43.077326
5482fb9b-df07-44d3-a58a-e377cc147964	دبروسة	Dabrousa	دبروسة	ⲇⲁⲡⲁⲣⲟ̄ⲥⲁ	حلفا	Sudan	2025-12-21 16:30:43.077326	2025-12-21 16:30:43.077326
9ddba419-42be-4997-bb5f-fe80c2581603	أرقين	Argeen	أرقين	ⲁⲣⲅⲓ̄ⲛ	حلفا	Sudan	2025-12-21 16:30:43.077326	2025-12-21 16:30:43.077326
2cfca158-08b2-447e-b94b-e33d377d849c	فرس	Faras	فرس	ⲫⲁⲣⲁⲥ	حلفا	Sudan	2025-12-21 16:30:43.077326	2025-12-21 16:30:43.077326
463948fc-351e-438d-bb71-4a26c88c898b	فرس شرق	Faras East	فرس	ⲫⲁⲣⲥ ⲙⲁⲧⲧⲟ	حلفا	Sudan	2025-12-21 16:30:43.077326	2025-12-21 16:30:43.077326
39fccd0f-acb7-4383-bd34-2845460c908d	سره	Sarra	سره	ⲥⲉⲣⲣⲁ	حلفا	Sudan	2025-12-21 16:30:43.077326	2025-12-21 16:30:43.077326
d974a97e-4a8f-4f87-b066-d99cef224e64	سرة شرق	Sarra East	سرة شرق	ⲥⲉⲣⲣⲁ ⲙⲁⲧⲧⲟ	حلفا	Sudan	2025-12-21 16:30:43.077326	2025-12-21 16:30:43.077326
e3a15575-8170-4c08-b9d0-a4408fd6b182	أشكيت	Ashkeit	أشكيت	ⲓϣⲕⲉ̄ⲧ	حلفا	Sudan	2025-12-21 16:30:43.077326	2025-12-21 16:30:43.077326
bcf004ec-3d17-4a7f-b06e-8177511da871	دبيرة	Debeira	دبيرة	ⲇⲓⲡⲉ̄ⲣⲁ	حلفا	Sudan	2025-12-21 16:30:43.077326	2025-12-21 16:30:43.077326
958577b5-a449-4112-be58-d20bbc8d0075	دبيرة شرق	Debeira East	دبيرة شرق	ⲇⲓⲡⲉ̄ⲣⲁ ⲙⲁⲧⲧⲟ	حلفا	Sudan	2025-12-21 16:30:43.077326	2025-12-21 16:30:43.077326
235b0887-3321-4a5e-a9af-edcf4c9b7a38	دغيم	Dagheim	دغيم	ⲇⲓⲅⲉ̄ⲙ	حلفا	Sudan	2025-12-21 16:30:43.077326	2025-12-21 16:30:43.077326
88e6e9b8-3ebe-4d10-ac29-dffc5b36bcfe	دال	Dal	دال	ⲇⲁ̄ⲗ	حلفا	Sudan	2025-12-21 16:30:43.077326	2025-12-21 16:30:43.077326
45fe598a-e937-48ce-9290-32aceddff906	كولب	Kolb	كولب	ⲕⲟⲩⲗⲟⲩⲡ	حلفا	Sudan	2025-12-21 16:30:43.077326	2025-12-21 16:30:43.077326
fc323843-92f9-47fd-b67c-01a36a84f5b5	صرص	Sars	صرص	ⲥⲁⲣⲁⲥ	حلفا	Sudan	2025-12-21 16:30:43.077326	2025-12-21 16:30:43.077326
3698276d-1f04-4f43-b52e-a119cd760ff0	جمي	Gemi	جمي	ⳝⲓⲙⲉⲓ̈	حلفا	Sudan	2025-12-21 16:30:43.077326	2025-12-21 16:30:43.077326
eb3642a9-ab59-4d98-9190-8b15ade09c66	سمنة	Semna	سمنة	ⲥⲉⲙⲛⲁ	حلفا	Sudan	2025-12-21 16:30:43.077326	2025-12-21 16:30:43.077326
71f297c6-972f-4377-aafe-56cbf7413d57	أتيري	Ateri	أتيري	ⲁⲧⲧⲓ̄ⲣⲓ	حلفا	Sudan	2025-12-21 16:30:43.077326	2025-12-21 16:30:43.077326
8131d796-3ab1-467d-bce8-75cf39b31a32	دويشات	Dawishat	دويشات	ⲇⲟⲩⳣⲉ̄ϣⲁ̄ⲧ	حلفا	Sudan	2025-12-21 16:30:43.077326	2025-12-21 16:30:43.077326
311e04db-9367-4ffa-9836-d640313ddfda	دويشات شرق	Dawishat East	دويشات شرق	ⲇⲟⲩⳣⲉ̄ϣⲁ̄ⲧ ⲙⲁⲧⲧⲟ	حلفا	Sudan	2025-12-21 16:30:43.077326	2025-12-21 16:30:43.077326
b54fedb4-dc1e-4019-ba7b-e616fa8f1653	أمبكول	Umbakul	أمبكول	ⲁⲙⲡⲓⲕⲟ̄ⲗ	حلفا	Sudan	2025-12-21 16:30:43.077326	2025-12-21 16:30:43.077326
04f83f11-3461-4ef7-8c90-f903e25954d8	أمكول شرق	Amkul East	أمكول شرق	ⲁⲙⲡⲓⲕⲟ̄ⲗ ⲙⲁⲧⲧⲟ	حلفا	Sudan	2025-12-21 16:30:43.077326	2025-12-21 16:30:43.077326
7d42aa9b-dbe5-4f8c-b61d-a96a93dc1185	أمكول غرب	Amkul West	أمكول غرب	ⲁⲙⲡⲓⲕⲟ̄ⲗ ⲧⲓⲛⲟ	حلفا	Sudan	2025-12-21 16:30:43.077326	2025-12-21 16:30:43.077326
9e37c49c-222d-40c4-9d6a-3467b0d7a346	الحصاية	Al Hasaya	الحصاية	ⲁⲗϩⲁⲥⲁ̄ⲓ̈ⲁ	حلفا	Sudan	2025-12-21 16:30:43.077326	2025-12-21 16:30:43.077326
77a1f7a3-cc38-40c9-8537-8aa6f713e48b	ضيم	Deim	ضيم	ⲇⲉ̄ⲙ	حلفا	Sudan	2025-12-21 16:30:43.077326	2025-12-21 16:30:43.077326
fa3a351a-1213-4ffe-82d0-22e7bb1e13b9	ضب	Dubb	ضب	ⲇⲟ̅ⲩ̅ⲡ	حلفا	Sudan	2025-12-21 16:30:43.077326	2025-12-21 16:30:43.077326
9b9221ef-feea-4fdd-87cd-d7a0aa444eab	مرش	Marsh	مرش	ⲙⲁⲣⲁϣ	حلفا	Sudan	2025-12-21 16:30:43.077326	2025-12-21 16:30:43.077326
062d637f-a397-4873-8038-78feddd070e2	أمكة شرق	Amka East	أمكة شرق	ⲁⲙⲕⲁ ⲙⲁⲧⲧⲟ	حلفا	Sudan	2025-12-21 16:30:43.077326	2025-12-21 16:30:43.077326
bdb84c54-77db-4331-8ca4-c465181874ee	أمكة غرب	Amka West	أمكة غرب	ⲁⲙⲁⲕⲁ ⲧⲓⲛⲟ	حلفا	Sudan	2025-12-21 16:30:43.077326	2025-12-21 16:30:43.077326
0fedab78-0c22-48de-8f51-931b32513e04	صواردة غرب	Sawarda West	صواردة غرب	ⲥⲟⳣⲁ̄ⲣⲇⲁ ⲧⲓⲛⲟ	حلفا	Sudan	2025-12-21 16:30:43.077326	2025-12-21 16:30:43.077326
c8c931aa-d186-405f-8400-80354f0e4c39	سواورتي	Sawarti	سواورتي	ⲥⲁⳣⲁ̄ⲣⲧⲓ	حلفا	Sudan	2025-12-21 16:30:43.077326	2025-12-21 16:30:43.077326
3a17cd47-f5d7-4c44-8a05-a15660d866e0	سواورتي غرب	Sawarti West	سواورتي غرب	ⲥⲁⳣⲁ̄ⲣⲧⲓ ⲧⲓⲛⲟ	حلفا	Sudan	2025-12-21 16:30:43.077326	2025-12-21 16:30:43.077326
ca28455a-3b28-4517-8a3b-ade4fd793466	مرشمة غرب	Marshama West	مرشمة غرب	ⲙⲁⲣϣⲁⲙⲁ ⲧⲓⲛⲟ	حلفا	Sudan	2025-12-21 16:30:43.077326	2025-12-21 16:30:43.077326
7dfd185f-fe48-4c83-b3be-b5e39b049fb9	طرفي غرب	Tarfi West	طرفي غرب	ⲧⲁⲣⲫⲓ ⲧⲓⲛⲟ	حلفا	Sudan	2025-12-21 16:30:43.077326	2025-12-21 16:30:43.077326
4b4e352d-9474-4487-87be-9670e3a7b759	أريق غرب	Arig West	أريق غرب	ⲁⲣⲓⲅ ⲧⲓⲛⲟ	حلفا	Sudan	2025-12-21 16:30:43.077326	2025-12-21 16:30:43.077326
ad26c9a2-9cd2-4bad-9832-5c399eec632d	أبرق شرق	Abraq East	أبرق شرق	ⲁⲡⲣⲁⲅ ⲙⲁⲧⲧⲟ	حلفا	Sudan	2025-12-21 16:30:43.077326	2025-12-21 16:30:43.077326
e571439f-de56-4dfd-8ec0-ca5be8ec52c6	سمقاق شرق	Semgaq East	سمقاق شرق	ⲥⲉ ⲙⲅⲁ̄ⲅ ⲙⲁⲧⲧⲟ	حلفا	Sudan	2025-12-21 16:30:43.077326	2025-12-21 16:30:43.077326
c6ac27ea-4366-46e7-8332-40358d63d92b	سمقاق غرب	Semgaq West	سمقاق غرب	ⲥⲉⲙⲅⲁ̄ⲅ ⲧⲓⲛⲟ	حلفا	Sudan	2025-12-21 16:30:43.077326	2025-12-21 16:30:43.077326
1c8984d0-a784-4e77-a5a6-6b461d54b5c7	أكمة شرق	Akma East	أكمة شرق	ⲟⲩⲕⲙⲁ ⲙⲁⲧⲧⲟ	حلفا	Sudan	2025-12-21 16:30:43.077326	2025-12-21 16:30:43.077326
c42ee6e8-cfe4-47a5-affb-ee693a0b9490	أكمة غرب	Akma West	أكمة غرب	ⲟⲩⲕⲙⲁ ⲧⲓⲛⲟ	حلفا	Sudan	2025-12-21 16:30:43.077326	2025-12-21 16:30:43.077326
72f5f1a6-6203-4e92-9448-00cdeba0f2aa	عكاشة شرق	Akasha East	عكاشة شرق	ⲟⲕⲁ̄ϣⲁ ⲙⲁⲧⲧⲟ	حلفا	Sudan	2025-12-21 16:30:43.077326	2025-12-21 16:30:43.077326
9a620aa5-2a49-4407-ae75-e57a629ca682	عكاشة غرب	Akasha West	عكاشة غرب	ⲟⲕⲁ̄ϣⲁ ⲧⲓⲛⲟ	حلفا	Sudan	2025-12-21 16:30:43.077326	2025-12-21 16:30:43.077326
0ad67b2d-0b9d-4cd0-a4f0-3cbcd4649bd9	كوهات شرق	Kowhat East	كوهات شرق	ⲕⲟϩⲁ̄ⲧ ⲙⲁⲧⲧⲟ	حلفا	Sudan	2025-12-21 16:30:43.077326	2025-12-21 16:30:43.077326
8c73aa4a-2e01-4f5d-9c2b-880cd3d4e145	كوهات غرب	Kowhat West	كوهات غرب	ⲕⲟϩⲁ̄ⲧ ⲧⲓⲛⲟ	حلفا	Sudan	2025-12-21 16:30:43.077326	2025-12-21 16:30:43.077326
24c7eb2b-1f3b-4210-adfd-014269f9f8cf	حرس شرق	Hirs East	حرس شرق	ϩⲓⲣⲓⲥ ⲙⲁⲧⲧⲟ	حلفا	Sudan	2025-12-21 16:30:43.077326	2025-12-21 16:30:43.077326
e9412178-7b38-4ff0-b5da-772755d5a3cc	سموقة شرق	Samuqa East	سموقة شرق	ⲥⲁⲙⲟ̄ⲅⲁ ⲙⲁⲧⲧⲟ	حلفا	Sudan	2025-12-21 16:30:43.077326	2025-12-21 16:30:43.077326
e7fa98e8-6e04-4dac-b36b-d741d6be0412	ملك الناصر	Malik Al Nasir	ملك الناصر	ⲙⲉⲗⲕⲉ ⲉⲗⲛⲁ̄ⲥⲓⲣ	حلفا	Sudan	2025-12-21 16:30:43.077326	2025-12-21 16:30:43.077326
5798eaae-08f7-429e-b25f-dd98769c63af	عبري	Abri	عبري	ⲁⲡⲣⲓ	سكوت	Sudan	2025-12-21 16:30:43.077326	2025-12-21 16:30:43.077326
e7eb5246-2c10-494a-9daf-65947bee0bd4	صواردة	Sawarda	صواردة	ⲥⲟⳣⲁ̄ⲣⲇⲁ	سكوت	Sudan	2025-12-21 16:30:43.077326	2025-12-21 16:30:43.077326
3b0250a5-79af-4275-a75d-e627add5c9fa	واوة	Wawa	واوة	ⳣⲁⳣⲁ	سكوت	Sudan	2025-12-21 16:30:43.077326	2025-12-21 16:30:43.077326
f715aa0d-5e5d-48ba-9684-f9d0aba42927	أشيمتو	Ashimto	أشيمتو	ⲟϣⲉ̄ⲛⲙⲁⲧⲧⲟ	سكوت	Sudan	2025-12-21 16:30:43.077326	2025-12-21 16:30:43.077326
0a428f9a-de4b-4f8c-9c2f-d98af42d8dd5	ماريا	Maria	ماريا	ⲙⲁ̄ⲣⲓ̈ⲁ	سكوت	Sudan	2025-12-21 16:30:43.077326	2025-12-21 16:30:43.077326
1066bc93-41b4-4940-b16b-00191aab7544	عمارة	Amara	عمارة	ⲁⲙⲁⲣⲁ	سكوت	Sudan	2025-12-21 16:30:43.077326	2025-12-21 16:30:43.077326
b741876a-f8f8-4afe-8e6e-1e55fe02f464	تبج	Tebeg	تبج	ⲧⲉⲡⲉⳝ	سكوت	Sudan	2025-12-21 16:30:43.077326	2025-12-21 16:30:43.077326
61d96332-d995-4ecd-bebf-d13372b7346e	كويكة	Kweka	كويكة	ⲕⲟⲓ̈ⲓⲕⲕⲁ	سكوت	Sudan	2025-12-21 16:30:43.077326	2025-12-21 16:30:43.077326
2fcd8ca1-48ee-46dc-ac9f-243073fb8726	عبود	Aboud	عبود	ⲉⲡⲟ̅ⲩ̅ⲇ	سكوت	Sudan	2025-12-21 16:30:43.077326	2025-12-21 16:30:43.077326
40ea7211-306b-4f6c-a4f7-d86fed91e84d	فركة	Ferka	فركة	ⲫⲁⲣⲕⲁ	سكوت	Sudan	2025-12-21 16:30:43.077326	2025-12-21 16:30:43.077326
1507b54a-f4ce-43d0-8b65-fe4bd1eaaf7a	مفركة	Mafarka	مفركة	ⲙⲟⲩⲫⲣⲁⲕⲕⲁ	سكوت	Sudan	2025-12-21 16:30:43.077326	2025-12-21 16:30:43.077326
99249f64-a236-415b-ac6e-e84b9a90c121	كوشة	Kosha	كوشة	ⲕⲟ̄ϣⲁ	سكوت	Sudan	2025-12-21 16:30:43.077326	2025-12-21 16:30:43.077326
6db2bc8d-6cd1-4fdd-bfe9-f8ad3498960d	جنيس	Ginnis	جنيس	ⲅⲓⲛⲓⲥ	سكوت	Sudan	2025-12-21 16:30:43.077326	2025-12-21 16:30:43.077326
8e098df3-88f8-4c75-adbe-e3432049d5f9	عطب	Atab	عطب	ⲇⲧⲧⲁⲡ	سكوت	Sudan	2025-12-21 16:30:43.077326	2025-12-21 16:30:43.077326
5fbab530-3574-41c6-a43d-83a40d4cc78f	سليم	Salim	سليم	ⲇⲥⲉⲗⲉⲙ	سكوت	Sudan	2025-12-21 16:30:43.077326	2025-12-21 16:30:43.077326
a7e8011b-a2fc-43e4-bdd7-d62da3175998	حميد	Hamid	حميد	ϩⲁⲙⲓ̄ⲇ	سكوت	Sudan	2025-12-21 16:30:43.077326	2025-12-21 16:30:43.077326
e77c7255-dd39-491f-9cb9-e644aa26522b	ساقية العيد	Saqiyat Al Eid	ساقية	ⲥⲁ̄ⲅⲓⲓ̈ⲁⲧ ⲉⲗⲁⲡⲓⲇ	سكوت	Sudan	2025-12-21 16:30:43.077326	2025-12-21 16:30:43.077326
ea07e8d0-924b-436e-ae48-55c981028cfa	قبة سليم	Qubbat Salim	قبة	ⲅⲟⲩⲡⲁⲧ ⲥⲉⲗⲓ̄ⲙ	سكوت	Sudan	2025-12-21 16:30:43.077326	2025-12-21 16:30:43.077326
9873eca0-16e2-47f4-953e-ec8af40256d9	صادنقا	Sadenga	صادنقا	ⲥⲁ̄ⲇⲟⲩⳟⳟⲁ	سكوت	Sudan	2025-12-21 16:30:43.077326	2025-12-21 16:30:43.077326
ce08f5d2-12de-4f20-af55-eabe4fe8f825	نلوة	Nelwa	نلوة	ⲛⲟⲩⲗⳣⲁ	سكوت	Sudan	2025-12-21 16:30:43.077326	2025-12-21 16:30:43.077326
288aaeed-86e4-4506-90cb-0a82b237d2c3	صلب	Solb	صلب	ⲥⲟⲗⲓⲡ	سكوت	Sudan	2025-12-21 16:30:43.077326	2025-12-21 16:30:43.077326
8d612df7-32c1-4666-935a-1ea5af05f4ea	عاقولا	Aqula	عاقولا	ⲁⲅⲟ̅ⲩ̅ⲗⲁ	سكوت	Sudan	2025-12-21 16:30:43.077326	2025-12-21 16:30:43.077326
1fcf414e-6966-439b-9437-f89da14a82f9	أبو راقة	Abu Raqa	أبو راقة	ⲁⲡⲣⲁ̄ⲅⲁ	سكوت	Sudan	2025-12-21 16:30:43.077326	2025-12-21 16:30:43.077326
7d9463f0-ecf0-4963-9f5d-ad723c84489d	خناق	Khanag	خناق	ϩⲁⲛⲛⲁ̄ⲅ	سكوت	Sudan	2025-12-21 16:30:43.077326	2025-12-21 16:30:43.077326
0d655c54-4be6-42d7-aa1d-c9d7b0a9443a	كمة	Akma	كمة	ⲟⲩⲕⲙⲁ	سكوت	Sudan	2025-12-21 16:30:43.077326	2025-12-21 16:30:43.077326
305ff2c1-82d9-4905-8bdb-583ebf474076	عكاشة	Akasha	عكاشة	ⲟⲕⲁ̄ϣⲁ	سكوت	Sudan	2025-12-21 16:30:43.077326	2025-12-21 16:30:43.077326
df42ece9-b028-4778-be2b-48bc088c930a	سركمتو	Sarkameto	سركمتو	ⲥⲁⲣⲕⲉ̄ⲛ ⲙⲁⲧⲧⲟ	سكوت	Sudan	2025-12-21 16:30:43.077326	2025-12-21 16:30:43.077326
9ec1042e-0c6c-4a05-a75f-421ad5ff6927	دلقو	Delgo	دلقو	ⲇⲟⲗⲅⲟ	المحس	Sudan	2025-12-21 16:30:43.077326	2025-12-21 16:30:43.077326
004e6454-abb9-413a-9cf4-3206c3a16364	كرمة	Kerma	كرمة	ⲕⲉⲣⲙⲁ	المحس	Sudan	2025-12-21 16:30:43.077326	2025-12-21 16:30:43.077326
ac312516-034c-47cc-830d-80b7350b4f2c	كرمة البلد	Kerma Town	كرمة البلد	ⲕⲉⲣⲙⲁ ⲡⲁⲗⲁⲇ	المحس	Sudan	2025-12-21 16:30:43.077326	2025-12-21 16:30:43.077326
0ded483c-1b6a-45dd-9a52-1120367d5978	تنقاسي	Tengasi	تنقاسي	ⲧⲁⳟⲁⲥⲓ	المحس	Sudan	2025-12-21 16:30:43.077326	2025-12-21 16:30:43.077326
195c60de-85d7-437f-ab3f-7f159da39c97	أرقو	Argo	أرقو	ⲁⲣⲅⲟ	المحس	Sudan	2025-12-21 16:30:43.077326	2025-12-21 16:30:43.077326
790e6120-1a58-4e51-91ca-419374c4d7f0	كجبار	Kajbar	كجبار	ⲕⲁⳝⳝⲡⲁ̄ⲣ	المحس	Sudan	2025-12-21 16:30:43.077326	2025-12-21 16:30:43.077326
5d06a159-5119-4235-8a5d-1a1d49319514	سيسي	Sisi	سيسي	ⲥⲓ̄ⲥⲓ	المحس	Sudan	2025-12-21 16:30:43.077326	2025-12-21 16:30:43.077326
27224639-f20b-43e9-bae3-b26af68dbd5c	تبو	Tebo	تبو	ⲥⲁⲡⲟ	المحس	Sudan	2025-12-21 16:30:43.077326	2025-12-21 16:30:43.077326
eec3fedf-ad7c-47d7-a1b9-e827c6e75c58	تمنار	Tamnar	تمنار	ⲧⲁⲙⲛⲁ̄ⲣ	المحس	Sudan	2025-12-21 16:30:43.077326	2025-12-21 16:30:43.077326
3c12c78f-9153-449c-a512-13115444c592	ترهاقا	Taharqa	ترهاقا	ⲧⲁϩⲁ̄ⲣⲅⲁ	المحس	Sudan	2025-12-21 16:30:43.077326	2025-12-21 16:30:43.077326
dd212d13-75bb-488b-8209-092528029375	أبو فاطمة	Abu Fatima	أبو فاطمة	ⲁⲡⲟ̅ⲩ̅ ⲫⲁ̄ⲧⲛⲁ	المحس	Sudan	2025-12-21 16:30:43.077326	2025-12-21 16:30:43.077326
07449bf7-043c-4813-aee7-df1a10bd2c99	دنقلا	Dongola	دنقلا	ⲇⲟⲩⳟⳟⲟⲩⲗⲁ	دنقلا	Sudan	2025-12-21 16:30:43.077326	2025-12-21 16:30:43.077326
3761cbe8-7e20-443b-9ed4-7a2817971273	دنقلا العجوز	Old Dongola	دنقلا	ⲇⲟⲩⳟⳟⲟⲩⲗⲁ ⲇⲟⲩⳣⳣⲓ	دنقلا	Sudan	2025-12-21 16:30:43.077326	2025-12-21 16:30:43.077326
836f86ea-13d4-46d8-8d10-1fd038ea1c6a	الغدار	Al Ghaddar	الغدار	ⲁⲗⲅⲁⲇⲇⲁ̄ⲣ	دنقلا	Sudan	2025-12-21 16:30:43.077326	2025-12-21 16:30:43.077326
12716655-6d4f-419b-ae15-0ccfaa1042f9	أشكان	Ashkan	أشكان	ⲁϣⲕⲁ̄ⲛ	دنقلا	Sudan	2025-12-21 16:30:43.077326	2025-12-21 16:30:43.077326
0e545be7-44bc-42c8-975d-e45cd862778b	أقدي	Agdi	أقدي	ⲁⲅⲇⲓ	دنقلا	Sudan	2025-12-21 16:30:43.077326	2025-12-21 16:30:43.077326
86579b15-ac2e-4a98-9126-ac158e8424e7	أنقوري	Angori	أنقوري	ⲁⳟⳟⲟⲣⲓ	دنقلا	Sudan	2025-12-21 16:30:43.077326	2025-12-21 16:30:43.077326
846dca2b-97a0-450d-ad75-7b11f8aebdec	إيماني	Imani	إيماني	ⲓ̄ⲙⲁ̄ⲛⲓ	دنقلا	Sudan	2025-12-21 16:30:43.077326	2025-12-21 16:30:43.077326
05a4eac6-d38b-4488-9b83-e3147b64992a	الكاسورة	Al Kassoura	كاسورا	ⲁⲗⲕⲁ̄ⲥⲟ̅ⲩ̅ⲣⲁ	دنقلا	Sudan	2025-12-21 16:30:43.077326	2025-12-21 16:30:43.077326
e88994e0-6618-4e7f-9af0-1551fd7c313b	الزورات	Al Zorat	زورات	ⲉⲗⲥⲟⳣⲣⲁ̄ⲧ	دنقلا	Sudan	2025-12-21 16:30:43.077326	2025-12-21 16:30:43.077326
36d2feca-f5be-4fc0-9cd0-d00d76dedab6	جزيرة فيلة	Philae Island	جزيرة فيلة	ⲫⲉⲓ̈ⲉⲗⲁⲛ ⲁ̄ⲣⲧⲓ	كنزي	Egypt	2025-12-21 16:30:43.077326	2025-12-21 16:30:43.077326
a92f6894-66d8-471f-870f-8c2c7002f7a7	جزيرة سهيل	Suhail Island	جزيرة سهيل	ⲥⲟⲩϩⲉ̄ⲗⲛ ⲁ̄ⲣⲧⲓ	كنزي	Egypt	2025-12-21 16:30:43.077326	2025-12-21 16:30:43.077326
37c948c2-e32c-4045-9f51-124656b51ed0	غرب سهيل	West Suhail	غرب سهيل	ⲥⲟⲩϩⲉ̄ⲗ ⲧⲓⲛⲟ	كنزي	Egypt	2025-12-21 16:30:43.077326	2025-12-21 16:30:43.077326
66e991a8-bbc8-4876-a5b7-b10be83a4a5a	أسوان القديمة	Old Aswan	أسوان القديمة	ⲟⲩⲛⲇⲉ̄ⲛ ⲟⲩⲥⳣⲁ̄ⲛ	كنزي	Egypt	2025-12-21 16:30:43.077326	2025-12-21 16:30:43.077326
9f5d2182-3288-4465-97d5-0751ddcc726d	بلانة القديمة	Old Ballana	بلانة القديمة	ⲟⲩⲛⲇⲉ̄ⲛ ⲡⲁⲗⲗⲁ̄ⲛⲁ	كنزي	Egypt	2025-12-21 16:30:43.077326	2025-12-21 16:30:43.077326
7274c8e3-72ea-4915-8f76-6864fcc88024	أبو سمبل	Abu Simbel	أبو سمبل	ⲁⲡⲥⲓⲙⲡⲓⲗ	كنزي	Egypt	2025-12-21 16:30:43.077326	2025-12-21 16:30:43.077326
018e70d0-5ca1-4053-977b-246123deadea	قسطل القديمة	Old Qustul	قسطل القديمة	ⲟⲩⲛⲇⲉ̄ⲛ ⲅⲟⲩⲥⲧⲟⲩⲗ	فديجا	Egypt	2025-12-21 16:30:43.077326	2025-12-21 16:30:43.077326
67c2094b-e70c-4d19-adaf-41aca997a799	توماس القديمة	Old Tomas	توماس القديمة	ⲟⲩⲛⲇⲉ̄ⲛ ⲧⲟ̄ⲙⲁ̄ⲥ	فديجا	Egypt	2025-12-21 16:30:43.077326	2025-12-21 16:30:43.077326
379a1069-42b9-4c1d-a5ab-bb35f7850842	عافية القديمة	Old Afya	عافية القديمة	ⲟⲩⲛⲇⲉ̄ⲛ ⲁ̄ⲫⲓ̈ⲁ	فديجا	Egypt	2025-12-21 16:30:43.077326	2025-12-21 16:30:43.077326
b2a706b9-4cb6-4a5b-b6e1-3aed933871b8	إبريم	Ibrim	إبريم	ⲁⲡⲣⲓ̄ⲙ	فديجا	Egypt	2025-12-21 16:30:43.077326	2025-12-21 16:30:43.077326
ac3dd0b5-7ef6-4850-937e-202273d78c2d	الدكة	El Dekka	دكة	ⲉⲗⲇⲁⲕⲕⲁ	فديجا	Egypt	2025-12-21 16:30:43.077326	2025-12-21 16:30:43.077326
9b1d87cc-9b0f-4230-a4e3-ef8856b2d0be	كورسكو	Korosko	كورسكو	ⲕⲟⲣⲟⲥⲕⲟ	فديجا	Egypt	2025-12-21 16:30:43.077326	2025-12-21 16:30:43.077326
c1bf8888-ecec-4f83-b995-973d9ff2bc50	عنيبة القديمة	Old Eniba	عنيبة القديمة	ⲟⲩⲛⲇⲉ̄ⲛ ⲉⲛⲓ̄ⲡⲁ	فديجا	Egypt	2025-12-21 16:30:43.077326	2025-12-21 16:30:43.077326
df82b639-02d2-454f-a4fa-ef264085c34b	لوتي	Loti	لوتي	ⲛⲟⲩⲗⳣⲁⲧⲧⲁ	سكوت	Sudan	2025-12-21 16:30:43.077326	2025-12-21 16:30:43.077326
bc3c568e-5d53-4a1a-8d8e-f0208086533a	سونكي شووقي	Sonki Shouqi	سونكي شووقي	ⲥⲟⳟⲓ̄	حلفا	Sudan	2025-12-21 16:30:43.077326	2025-12-21 16:30:43.077326
\.


--
-- TOC entry 3929 (class 0 OID 72670)
-- Dependencies: 252
-- Data for Name: TreeInvitations; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."TreeInvitations" ("Id", "TreeId", "Email", "Role", "Token", "InvitedByUserId", "ExpiresAt", "AcceptedAt", "AcceptedByUserId", "CreatedAt") FROM stdin;
\.


--
-- TOC entry 3901 (class 0 OID 71164)
-- Dependencies: 224
-- Data for Name: UnionMembers; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."UnionMembers" ("Id", "UnionId", "PersonId", "Role", "CreatedAt") FROM stdin;
04069f4c-4f59-49f1-8ccd-196ea55b5b03	9d3dbb28-9d4f-4e15-befb-617e91c9755c	abc95b43-ba5c-43a4-9946-7190e458f953	Husband	2025-12-29 16:31:23.474718
052b493a-5a1e-4e0e-8beb-da7c4856e510	83d43d3d-57de-4038-b319-b35aa92ac1be	cb190884-e061-4db9-8cc2-c0aa05378280	Wife	2025-12-29 16:31:29.706475
0650456a-ada5-4f11-9219-fd3f258b31bc	ef301bbc-7637-4436-ab22-e6624355d084	51608bf6-00cb-401c-8d52-277068e91c6a	Wife	2025-12-29 16:31:28.45029
08cca213-dea1-4b0f-b551-712488cc6a03	6dcd7aeb-70c1-49be-a58d-0d8f0febc9cc	f252346e-a197-4a27-9836-34fb7e50bffd	Husband	2025-12-29 16:31:19.76663
0931222b-70a7-44ea-8372-28221a93aa66	c525db54-869a-4584-b16d-ce2cb7425a92	cfcdeebb-3b56-4553-904f-397f374b92a8	Wife	2025-12-29 16:31:17.355823
0aa017e9-a2e4-4edd-8da1-a5b783ce7dda	11574e45-1937-4286-b691-8b440f227d0c	b0ff5995-4e69-4358-b79d-3fa6fef0a69b	Wife	2025-12-29 16:31:23.874486
0b242868-14e2-4d0f-8404-11483be7386e	324c1ba2-1cd0-45d3-bae7-f664b28587be	e1b7b70c-bd56-42e3-8464-e04327fc62c4	Wife	2025-12-29 16:31:17.774651
0c44e3e2-0dbf-4dcb-a753-2442355bc852	0b728733-87b8-41c7-a05e-9f5b638a2d72	b610bb22-f766-4f82-b792-f7fbb2f7003b	Wife	2025-12-29 16:31:18.993973
0dda8e37-b129-4881-bb07-f492c6a852c8	d14b0ded-1c76-488f-a970-0eac44f8340f	53540c17-78f7-437e-ab6b-87c642f1e868	Wife	2025-12-29 16:31:19.623706
1336a58a-42fb-4b84-a574-c5aed972835a	9d14010a-e0fc-4d50-b34d-548972dd0f95	4b1a8a5e-5892-451f-bb44-3b57cc638fae	Wife	2025-12-29 16:31:23.140083
18438247-791d-44f8-80a0-ee0f2839fa99	739e556f-8d3a-4464-8dd1-0a193efc1628	f20edf06-3e22-4d9d-a1c9-82d8dbd50b52	Husband	2025-12-29 16:31:24.63917
18fe4ac9-5101-41d8-af17-5d78bf4709f0	7f9705c5-3485-4e78-8437-de3bfb636fee	31b8d4b9-326e-4e9a-8803-a9b4ea034b7e	Husband	2025-12-29 16:31:18.354559
19ef5fbf-512a-48ab-804e-9c27a7ab895f	afc4858b-65d1-40dc-9a74-3ef4d9975467	4396edb8-3cad-46f7-8802-bbcbd17db4d3	Husband	2025-12-29 16:31:22.62608
1ba551ac-4ce8-4944-abe3-2603fce4f5e9	4e14dd0f-7421-432d-88f7-b43737d23193	df60a1ec-ab32-45b2-9ca2-93f7926ffa96	Wife	2025-12-29 16:31:23.646285
1d436ecb-c514-4963-82ee-52228bdc5a3d	976383dc-eff3-4525-90e8-e191612e6143	8815f86f-febd-4639-bd1d-0e946afa280b	Wife	2025-12-29 16:31:25.745115
1e4786e8-5ee5-44de-9bea-866f7d79c8d5	77f2517f-1aa4-42eb-8e7b-a29a03ef4369	9e233a52-68ac-4562-bed2-3fbae2aec730	Husband	2025-12-29 16:31:21.390723
1eee67e4-bc6f-4680-9bf1-7a9a7035047a	9d3dbb28-9d4f-4e15-befb-617e91c9755c	d21ab576-80be-4b37-823e-25820fc9e16b	Wife	2025-12-29 16:31:23.474769
20e4d17f-87ea-4cec-ac59-0a33ca9daad9	ececd687-94fb-4ff2-8e1a-af484318eba1	976db09a-ec7a-4241-bdc8-f98763174305	Wife	2025-12-29 16:31:25.49561
21d3b11c-f97c-426f-bdad-e7e36e2417b3	f2b6b1b6-8ee1-4f03-b92f-d1c63eef2439	113a3b6b-bc1d-4189-a5be-ff0f4b6da898	Husband	2025-12-29 16:31:30.056421
2567a232-0ad3-44ea-a0d8-d8e9e72a5210	099cec2f-8b2e-4a3e-a843-ab921f1b555d	9649dc43-7677-454a-acdb-68adf33bbce3	Wife	2025-12-29 16:31:16.083012
2681417c-7ebd-4436-82b1-7ac7904afc61	36a50a3c-7b23-49c0-bbb2-adb6b0c087e6	13aac49d-554b-4ac5-8c78-ab6abc4a61c4	Wife	2025-12-29 16:31:23.965837
279ce7bf-4bc0-48fd-a7d8-ba6710a97c4a	213cbb36-500f-4a5b-b2f8-ea41bcd0738a	2dce1a0b-11b9-41a7-827d-562234457252	Husband	2025-12-29 16:31:16.70749
28df726f-a643-4b06-9c52-0f5dbea89693	348c18f7-863f-4fe0-94e3-521a43cb119c	e35a59c7-dd2c-4085-88ab-345a2978d6bd	Husband	2025-12-29 16:31:19.257278
28e49a66-9aea-46dd-8cfe-fb978df8f7ea	226da86a-e149-45c2-9a1c-b0c97a5372a9	20979cb9-e457-4fdd-be3a-cf039754b7ab	Husband	2025-12-29 16:31:27.365897
293ce0a5-ae1e-410a-8bb6-3ec7bff10aaa	cdcdf14b-edf7-4ade-afa5-e9ab8df26047	ef6fa562-d8aa-445e-a36e-4a5ef15d86ff	Wife	2025-12-29 16:31:21.999806
2a62a1bf-a03a-4d85-8eb8-7df201ebdd74	a5a7b929-a502-46f3-b135-90396f45b1c1	ee816f93-85ab-4827-ac7d-fb13f8a926df	Wife	2025-12-29 16:31:17.511777
2bdc6f99-9d9a-4352-a2e9-1588bab2ac3b	4359e1cd-9700-46ec-a903-8b764c7ed075	58eeabb9-73a6-42d1-a743-49ec8debfcb5	Wife	2025-12-29 16:31:28.099996
2c0f995d-a6d2-440a-828c-4dbecab47460	94282608-f93a-4a90-a22a-d7b77649cf28	e68c6def-f9fb-402e-8066-54a33bd5dd68	Wife	2025-12-29 16:31:20.008494
2e751acc-67c2-4183-86a1-afc73723a8f0	e86892ea-30a3-4c59-9b94-7db8887c201b	07875362-d8ee-4928-86ac-7aecb98a86d6	Wife	2025-12-29 16:31:17.092061
2ff3f25b-d60d-4e11-b67a-3fe2c6256f27	00064be0-c6bb-4224-8b73-4fcdc775e2b3	63f661ac-75e0-4aae-a1aa-879128891215	Husband	2025-12-29 16:31:29.490923
303810a0-35f3-4930-b24e-6bb0d66ae3e5	3b8831d1-a1d9-4153-ad4f-3208f372ab19	98056226-655c-4f92-8216-199573920cd7	Wife	2025-12-29 16:31:18.677874
31768db3-b633-4292-bafa-02570deb887f	e78eed47-5b30-4431-b967-a1c6e6b3c6ff	f11fb6cb-ece0-4e4d-bb86-fb57e0154ff2	Husband	2025-12-29 16:31:27.98266
317e0857-b09d-409e-98e9-c4fdd3a9f4ee	46222a9a-f5ed-4984-a5df-848fb5f20728	1b91d97e-55a8-4c4f-9a72-dedf95ca2aed	Husband	2025-12-29 16:31:17.194144
318ca636-7d91-4ce9-91c0-b5069f9f0037	3cc86cbb-c08c-4301-b797-26758fb64b63	6a98624b-3524-4aab-89cd-d41ca54b2207	Wife	2025-12-29 16:31:29.910119
31c2f6c2-dd33-43ab-811a-1aa85b8677cc	a11c2592-f25c-4bcd-9958-3c1c6d973f24	ae0755a8-a20e-47b1-abf9-5fc6f7347139	Wife	2025-12-29 16:31:30.695358
3222ba5d-40b4-42f7-9158-92bcea26d60a	f225ce38-56bb-4413-8022-5d1af96352a4	ebeba076-fd3d-4db5-afdd-1b4d9042d038	Wife	2025-12-29 16:31:27.852938
352a74fe-1317-4094-9c42-794f9a4f152e	ea0cceae-9c50-4b9a-9005-92b004d4152f	b88dfb6a-da70-4ea5-ad2c-efd1c33156b9	Husband	2025-12-29 16:31:30.842466
362bd699-69d4-4c15-9f81-24634be79023	25ad41c4-dffa-4471-906e-b70b96aca1bc	f571b71a-bc1b-4f2c-98cd-890c1b13800f	Husband	2025-12-29 16:31:27.236291
366fa5f0-92f7-4c1b-9118-78a04e0bf5bf	6a07cb3b-9b8d-4b25-8eda-a7c65b40f0dd	68641213-079d-4200-80e0-437391610deb	Wife	2025-12-29 16:31:22.669308
37cf35bd-fb6d-479d-98f0-f5cd35da432b	6cd7d7db-dd7c-404d-b738-0bf74c179dd7	7915d38b-983d-4280-a2ce-1b1714d70ba6	Husband	2025-12-29 16:31:23.787982
399ec99a-31ce-4d19-84c8-c484e3ba74c1	31554dfa-ee0e-4aaa-b205-3cf903d0b8a7	a3177ae6-e4a7-4f49-a4eb-40c3c7f8a616	Husband	2025-12-29 16:31:26.794602
39fa8cf0-4ca2-4fa7-a720-0bba3b29d345	b2a4f17c-d4e7-4c51-a17c-db5153d99a80	6921ef81-45c1-48a9-9e58-38fc2117ac58	Husband	2025-12-29 16:31:17.474074
3b373a35-e3fb-4ed2-ada4-d87cb4245ce5	83d43d3d-57de-4038-b319-b35aa92ac1be	5ea9d2fc-288e-4997-b046-0b57b502e3d0	Husband	2025-12-29 16:31:29.706427
3bb16e2e-22a3-4b57-acf6-1c3093718582	2678214f-eec3-451a-bc49-b3b310327f72	df227c3f-0f26-4e93-b7b9-dd6802a061a5	Wife	2025-12-29 16:31:24.695299
3f37d462-7c30-4f69-bb16-cd3a864009fc	dc47a4ac-fb50-4455-8d92-fcd2e5199752	99fe3a58-fd18-4de2-bcf6-0971b019fb65	Husband	2025-12-29 16:31:24.984736
3fdec5c5-7be0-4c78-80ce-92fc5f3f3cd4	cc4331aa-59f6-422a-a409-eb2b8252d27c	f32668a8-9c7c-412a-bbbd-77502615cb5f	Wife	2025-12-29 16:31:20.695251
43596549-cd97-4fd8-8096-2875ecedef76	976383dc-eff3-4525-90e8-e191612e6143	3c042938-82b4-4060-92c3-6762366c5e4c	Husband	2025-12-29 16:31:25.745021
4639a873-8d59-4719-bbad-9b4e6372a567	43d5e3df-227e-4d97-b5b8-25ab596940aa	5e856554-dfb5-4657-9265-01096f0f6451	Husband	2025-12-29 16:31:21.56335
474f1049-a39f-42e8-8135-79c6fc26ea27	fa928927-610d-4b0f-a303-6773c98750f3	62325283-63f0-4f68-84f9-f52a8c6cde69	Husband	2025-12-29 16:31:20.418709
4886b78a-e7b9-402b-941a-8350d206407f	f225ce38-56bb-4413-8022-5d1af96352a4	f252346e-a197-4a27-9836-34fb7e50bffd	Husband	2025-12-29 16:31:27.85289
55fda431-182c-4b6e-9895-1d112f237f7e	06b7cfac-bbd7-4051-9c49-bef674fb2241	a0d28119-3e65-42d4-8f64-61ef2942b030	Wife	2025-12-29 16:31:26.587421
57309684-1494-473a-8678-e47a24214918	ececd687-94fb-4ff2-8e1a-af484318eba1	8c370e5c-63ad-46a4-96ae-be21a5ea8683	Husband	2025-12-29 16:31:25.495336
58a2ab8d-76be-4e4d-a56e-e60d884778be	348c18f7-863f-4fe0-94e3-521a43cb119c	1542491d-e953-45e9-8a81-53b2b8a5931f	Wife	2025-12-29 16:31:19.257344
5a0055d8-41a6-4558-972a-e657eb416d51	e78eed47-5b30-4431-b967-a1c6e6b3c6ff	bbc3495b-afe0-4294-958a-a8d0560b5ff8	Wife	2025-12-29 16:31:27.982705
5a92bccc-47cf-4dfb-ba18-297bb0322626	d14b0ded-1c76-488f-a970-0eac44f8340f	2bfbbbb6-df60-48c1-9619-7bc9f565e18b	Husband	2025-12-29 16:31:19.623646
5bc9b408-bd6c-4100-bb49-eb5d31f1a6f2	ec9aec82-114a-4009-8dce-880b99ea0a6c	a20d7808-69be-49ef-8a9c-58dbe9bef865	Wife	2025-12-29 16:31:26.195078
5bf291ec-e605-4b1c-9ffa-fb528d8311b4	11574e45-1937-4286-b691-8b440f227d0c	1d3b4207-a170-4014-80db-d5a1b76f0035	Husband	2025-12-29 16:31:23.874414
5c31eecd-6174-4dc5-ad8e-bdc627c85fcc	89809e77-36fb-424e-873b-1d2870bcdfa4	29a6853f-c91b-40d3-ab9a-0fa96762438c	Wife	2025-12-29 16:31:18.219586
62d9a66b-1b13-4033-91b0-65915c3ba594	3b8831d1-a1d9-4153-ad4f-3208f372ab19	cb3d8eb8-2628-4ee0-a199-97e0a7a530d1	Husband	2025-12-29 16:31:18.677821
6339067e-7ea2-42fb-b4e6-e6b5e861fe1c	25ad41c4-dffa-4471-906e-b70b96aca1bc	975c5df5-0586-4f04-b84d-be22ce5956cd	Wife	2025-12-29 16:31:27.236367
65f16bab-fb2f-4657-b4c8-e11173e4e094	93e9fa96-d7cb-4caa-ba55-3344976d33d2	6b4bc1f2-f7fd-4ca8-bb35-7a14eabfa434	Husband	2025-12-29 16:31:26.490296
683dbdce-e1b9-4de9-9711-9bc70b4eda46	267ebbd3-05a3-4cc3-9a5e-4b37d18a77e9	07859a4d-d5cf-4078-867a-53594e735c31	Wife	2025-12-29 16:31:25.948061
685d488e-9b63-4d3b-ae35-d2f2b913f60e	a11c2592-f25c-4bcd-9958-3c1c6d973f24	d7467f95-6146-493e-b209-686878c3e641	Husband	2025-12-29 16:31:30.695331
6a2366d2-e592-4f56-93a0-09abf93820fc	31554dfa-ee0e-4aaa-b205-3cf903d0b8a7	4a56e8cc-a3a2-490d-a9cb-d0dcad81566a	Wife	2025-12-29 16:31:26.794649
6a5cc2f6-cd52-4ffd-82b4-4c5a1f79525c	cc4331aa-59f6-422a-a409-eb2b8252d27c	9254c9c2-552b-48b6-bf47-ec7b9f024086	Husband	2025-12-29 16:31:20.69522
6d69668f-99e9-4db2-ad89-77537aba7b9e	7770b10c-d316-42a3-a83d-497af582d523	49e5a66c-f97d-49cb-89a4-ec66a2423024	Wife	2025-12-29 16:31:28.837492
6e552cc3-f02a-42d6-8e02-da931f9fb155	17bbc980-b833-4c65-bf69-b91fe832b12b	82cc8c14-bd9b-4002-836d-4d0b4a712a4d	Husband	2025-12-29 16:31:17.511246
6efd6134-76dc-46f5-af05-616a886fac93	46222a9a-f5ed-4984-a5df-848fb5f20728	14047663-ef1d-431b-ae46-d289abae2411	Wife	2025-12-29 16:31:17.194224
7128fce1-04b0-4cc9-81b3-bfa02b111cfb	5e5d1e60-3e18-47ad-bd1b-1d0c2e011f35	32e2834a-d60d-499c-a626-ae1c23b3dcf1	Husband	2025-12-29 16:31:24.341453
72091cdc-9c49-4e9a-8652-e8d9ad4eeb4b	6cd7d7db-dd7c-404d-b738-0bf74c179dd7	8f87d17f-3cd4-42c0-b09f-f1f0cedb8584	Wife	2025-12-29 16:31:23.788032
72459ddc-6db8-4b8f-a18a-5cb943ab24a5	ea0cceae-9c50-4b9a-9005-92b004d4152f	5b60b3c6-c57e-4b2c-bbb6-897f3052876b	Wife	2025-12-29 16:31:30.842491
7499b2a1-d8c1-49f5-bcc4-0618471c3b26	d4f3e81e-1d74-44fa-84e5-5988e8c95f42	db12a4fc-6e43-473d-9239-c5fd59c33e3e	Wife	2025-12-29 16:31:22.833554
74d28219-846c-42ee-9af0-feeff2eeaf02	fb523d79-b53a-4b36-a510-1437be462361	f9e95815-2b58-46ce-ad03-39d332808875	Wife	2025-12-29 16:31:25.200494
76146be5-1701-4f17-83e7-f30b86ea3b59	487f726f-d8a8-40ca-94be-524636be9ad7	e7c9085f-4613-453d-8233-7171e2cf9609	Wife	2025-12-29 16:31:22.085777
7aec634b-d25d-4541-bfb4-c7c236e5bcea	0af1692c-a00d-419d-9118-9f1e1294f623	8cd3209b-7b52-4a4c-a92a-1f8cd6b5e407	Wife	2025-12-29 16:31:21.763326
7b86f0ec-9a04-453f-81a0-29cb9db1e569	f9eb77de-e2f9-4720-b7a9-8847448dcc7a	d46e7da8-4299-4bb8-840f-364823f42406	Wife	2025-12-29 16:31:27.365805
7c20bbd3-6a93-43ca-9d5e-265d5df02dc4	324c1ba2-1cd0-45d3-bae7-f664b28587be	16bd771f-08ea-4656-8239-65f5f9376104	Husband	2025-12-29 16:31:17.774613
7c39f4be-38f9-4ca2-916a-a11a6b3845d2	fb523d79-b53a-4b36-a510-1437be462361	62856f54-242c-4f67-8220-cb451ce52031	Husband	2025-12-29 16:31:25.200449
7d61e328-6322-470e-8224-4a06c561341d	dc47a4ac-fb50-4455-8d92-fcd2e5199752	d2ee12d5-5848-48c2-91a6-ffc49270bca1	Wife	2025-12-29 16:31:24.984798
7e75143b-b825-4ce3-99d7-a1b8f12e750c	94bfcf61-243b-4d99-885e-7faee8e34310	963a9695-5acd-4162-aff2-03b33022cdd4	Wife	2025-12-29 16:31:18.756154
7fc28696-03ae-44de-87ac-b3748e35dbfb	bc29ce54-d5ba-44fc-8ee0-2840c3762821	a8bb31d9-739f-4081-8a25-b8dfc1fbb1c3	Husband	2025-12-29 16:31:28.199655
82bcd0bc-6697-4c63-9238-a85da067b330	6dcd7aeb-70c1-49be-a58d-0d8f0febc9cc	aa0ec19d-05fe-4c67-8462-5fc99badd90d	Wife	2025-12-29 16:31:19.766682
85d62406-b4ac-4de7-821e-fcd7d4d992f7	2754f453-6b31-463f-900b-ac4113cda43e	a76d5270-26c2-46f6-af85-4d3f892320e9	Husband	2025-12-29 16:31:29.023567
884d9243-823a-4b41-94ad-b845f575bfa0	c0d9e797-2ebf-480a-9090-0b8e0c158d8f	5998a405-ab45-42d0-a51e-767985fd8fa7	Husband	2025-12-29 16:31:29.166807
88bfc9d2-6182-4cfa-b8d4-c4ab6b4f3238	ef301bbc-7637-4436-ab22-e6624355d084	d88c0ea1-6d59-418b-a938-2e6aa399ed22	Husband	2025-12-29 16:31:28.450215
8c84fa07-e9a0-4d3c-972e-a2539e21a47d	2754f453-6b31-463f-900b-ac4113cda43e	0831d51d-6c34-4e26-9cdc-eb57e0f4781c	Wife	2025-12-29 16:31:29.023613
8cdde428-e6ba-46cb-8a14-982df4c54d34	2678214f-eec3-451a-bc49-b3b310327f72	99fe3a58-fd18-4de2-bcf6-0971b019fb65	Husband	2025-12-29 16:31:24.695253
9222f098-c1fc-487c-8b55-ba838f0bc9da	2fed9e5e-ce7a-44b8-9e52-c643750d7fab	5087b661-e52b-417d-ad01-4aebfc684d3c	Wife	2025-12-29 16:31:25.546365
936b6f0e-0aac-4b7b-978a-f6e67fb9d04a	a8dabb6d-c746-44e0-8914-9dacd4e646f1	fd11fd84-1e42-4d38-ad83-796210bfdd71	Wife	2025-12-29 16:31:29.313299
936b96f4-cd8a-4640-8eb0-e7b97a74e929	267ebbd3-05a3-4cc3-9a5e-4b37d18a77e9	1ee4c37d-18a5-49b2-b0ea-59683c08c323	Husband	2025-12-29 16:31:25.948015
97e437e1-70b6-4917-b486-f254d2e742b7	48782029-0fcc-415a-bede-3533d8fbe814	1cef3beb-2d1b-4136-a805-285df0f81366	Wife	2025-12-29 16:31:18.635009
97f62435-78b9-4e11-a64c-e2e3b215a59c	4e0d923d-e392-4b6c-99d6-b5b4ba124f28	c4961ae1-d224-4c65-b472-e11cf7517795	Wife	2025-12-29 16:31:30.466432
987caa08-ec4c-4a51-b783-7b862ba8bd73	099cec2f-8b2e-4a3e-a843-ab921f1b555d	97e0dc07-6ba9-41b3-a392-f4f0a0ef2737	Husband	2025-12-29 16:31:16.082875
99d100e8-c65c-4cb0-af2f-ed69a52720ca	578618ee-9f6e-4460-876d-447a34f6a427	f43058ff-54b4-42b3-837e-57c08655f9f6	Husband	2025-12-29 16:31:22.327795
99d3044e-5df0-4fa3-862e-71b0ef69978b	36a50a3c-7b23-49c0-bbb2-adb6b0c087e6	6653dba6-6f95-4495-8e3a-3cc187266272	Husband	2025-12-29 16:31:23.96579
9b25e9ee-195c-4fd1-b64c-f6c8b0b04b64	48782029-0fcc-415a-bede-3533d8fbe814	00c6c827-308e-4a6e-88c9-83cf391d2881	Husband	2025-12-29 16:31:18.634929
9b6a39a9-88b5-4a36-9228-415bc83b250f	09744ad1-e53d-4a85-b896-c983ee53ea88	28283855-40a5-449c-8ae1-418bd57a1e69	Husband	2025-12-29 16:31:27.651849
9de7662f-83cd-425e-ba20-d753f7ef2797	c0d9e797-2ebf-480a-9090-0b8e0c158d8f	8e032a15-783b-40d2-8c8c-33aa63af9c63	Wife	2025-12-29 16:31:29.166836
a206b737-0d3a-4329-be9e-4d296165b66f	43d5e3df-227e-4d97-b5b8-25ab596940aa	cda43562-bfa2-4831-876f-36adfbf0e499	Wife	2025-12-29 16:31:21.563379
a3877c66-9bdc-4dde-a063-8548d13d8e76	4359e1cd-9700-46ec-a903-8b764c7ed075	b16e1013-de3c-4876-8f2d-41033e1ffb28	Husband	2025-12-29 16:31:28.099913
a400bbd1-61fe-4657-84da-39bd2cf4a8be	0642b3dd-16cf-4fd1-a9ff-470bbd39a9f4	5ee5eb1b-6f3f-469c-91b6-1c5300da8f71	Husband	2025-12-29 16:31:21.217852
a47cc982-99c3-4956-9b0c-e20f6a0340c5	77f2517f-1aa4-42eb-8e7b-a29a03ef4369	9235266f-7ffa-492b-b318-795465417e73	Wife	2025-12-29 16:31:21.390772
a4d0059c-703f-4063-bf0b-1f00e39d5d45	e86892ea-30a3-4c59-9b94-7db8887c201b	2dce1a0b-11b9-41a7-827d-562234457252	Husband	2025-12-29 16:31:17.091994
a75479e3-7865-466c-aa06-cff207bccd19	487f726f-d8a8-40ca-94be-524636be9ad7	ac78fc6b-1bd3-4657-a9be-28941be581dd	Husband	2025-12-29 16:31:22.085709
a7df66cc-faa8-4cd2-b504-07b456074c98	cd84d20c-08b5-46d4-96a7-9491cc41393f	8039b17f-3028-43be-9ba8-1c3498ef85a9	Wife	2025-12-29 16:31:16.483052
ad25d8f2-0aac-44c9-8aea-be6e5f3dfda1	d95b6261-f370-4aaf-a202-bcb727831e3b	cab8e0bd-4e05-450b-bef7-4b8651d5295f	Wife	2025-12-29 16:31:15.783701
ad5aa3b7-03c8-419f-abe7-1e461d205e08	739e556f-8d3a-4464-8dd1-0a193efc1628	da16a5f1-3899-4c27-b5fd-cc67e1eb6826	Wife	2025-12-29 16:31:24.639241
b2afa0c4-02fc-475a-b628-1e64d3e3c930	eaa72d72-8bc2-4c6f-a29e-8439ca720926	cc5b31d8-55c1-48c1-8b90-948dc0fb4624	Husband	2025-12-29 16:31:26.298073
b43892a7-b3f6-4300-b9bf-fe435d31e4d1	0b728733-87b8-41c7-a05e-9f5b638a2d72	822cc8a5-c22d-4a68-9375-662ea3b2dfc6	Husband	2025-12-29 16:31:18.993931
b661cea1-4211-4df3-858f-85115f275d35	447ac2f3-5078-44f3-a937-1846bf8dd4b6	ee87be0a-b544-47ca-b093-4b168fbd9532	Wife	2025-12-29 16:31:20.915629
b77274ba-cf75-4f20-a173-5750b822b30a	19a5bcab-5d05-4d44-817c-d1f854dbe78b	82cc8c14-bd9b-4002-836d-4d0b4a712a4d	Husband	2025-12-29 16:31:20.008711
b7ea9efa-83f2-457b-bdd8-7f6cf2127bc8	94bfcf61-243b-4d99-885e-7faee8e34310	ac5fe8ed-d1c4-4ac8-bc93-ec9a906d5f7d	Husband	2025-12-29 16:31:18.75609
b8e91e04-8fd4-41d9-b406-08a0f3999157	f05a4c82-a7dc-48b9-af4f-6c458407002b	34f7930c-ebe4-4369-8697-a133297bab81	Wife	2025-12-29 16:31:30.241743
b91d7999-4697-4359-9e84-6ad6810e63f0	0642b3dd-16cf-4fd1-a9ff-470bbd39a9f4	66bfe7b7-2c8c-4cf5-ae84-8b348fe68cbd	Wife	2025-12-29 16:31:21.217926
b9bcdf64-35e8-4cc4-a16f-22876db1004b	4e14dd0f-7421-432d-88f7-b43737d23193	b2172455-58f5-416c-bfc5-a1f2b6caff88	Husband	2025-12-29 16:31:23.646216
ba43500e-3f05-42cb-a9f4-04ef3e9083bc	2fed9e5e-ce7a-44b8-9e52-c643750d7fab	4418e04b-2f6e-4196-a0a1-57584f714f60	Husband	2025-12-29 16:31:25.546331
bac524c7-06d3-4c57-88e2-ec296dbd2ae0	5e5d1e60-3e18-47ad-bd1b-1d0c2e011f35	ffa02956-07ed-4b37-a8cd-b23414c2b81e	Wife	2025-12-29 16:31:24.341498
baf989be-3215-4aee-8b84-3fd7266eeda4	00064be0-c6bb-4224-8b73-4fcdc775e2b3	a4675322-ed29-4968-8aba-2c803366d80e	Wife	2025-12-29 16:31:29.490951
be5e4d5a-1078-45b8-b9ff-abf968660e8e	578618ee-9f6e-4460-876d-447a34f6a427	20cbc50d-1aa5-4b6a-bbfc-80304fe0c544	Wife	2025-12-29 16:31:22.327842
beec0169-b9ce-4d1e-86a3-d0b131c5f01b	06b7cfac-bbd7-4051-9c49-bef674fb2241	56f64ff2-3752-44b6-bd7c-7dfb1042fe27	Husband	2025-12-29 16:31:26.58735
bf8db7dc-0114-4c64-8b32-f5e736541367	09744ad1-e53d-4a85-b896-c983ee53ea88	b9b13aae-11e6-4e84-b1f2-b57d2918d3d5	Wife	2025-12-29 16:31:27.651893
c0dfee30-16d0-4d85-9df9-c2584dcfab7c	959e9d2b-db8c-4f03-b9cb-111e3b6495d1	822cc8a5-c22d-4a68-9375-662ea3b2dfc6	Husband	2025-12-29 16:31:19.217892
c10bcb03-14ca-4cf5-8469-8192c39d06c5	7f9705c5-3485-4e78-8437-de3bfb636fee	e44cd487-3c0b-438c-819e-462bc3480ef1	Wife	2025-12-29 16:31:18.354649
c2b66800-1c44-4f6a-83cf-db8881d39e1f	226da86a-e149-45c2-9a1c-b0c97a5372a9	9e3b5733-9174-42c4-ae99-d7d15a640b2b	Wife	2025-12-29 16:31:27.365931
c6263db6-68ac-48f7-9077-8a2f2c2e5888	cd84d20c-08b5-46d4-96a7-9491cc41393f	1b91d97e-55a8-4c4f-9a72-dedf95ca2aed	Husband	2025-12-29 16:31:16.482966
c9794a58-fcf0-41d4-baeb-7188eea2e2ea	93e9fa96-d7cb-4caa-ba55-3344976d33d2	f738e1ee-e9f7-49c8-91a5-31f9b9564754	Wife	2025-12-29 16:31:26.490343
cb46dcfc-11d5-469d-a90b-73de42a8d94c	89809e77-36fb-424e-873b-1d2870bcdfa4	f20edf06-3e22-4d9d-a1c9-82d8dbd50b52	Husband	2025-12-29 16:31:18.219552
cc12424a-a59b-4e56-9ed8-e752d9b03a71	ec9aec82-114a-4009-8dce-880b99ea0a6c	1ee4c37d-18a5-49b2-b0ea-59683c08c323	Husband	2025-12-29 16:31:26.195026
ce44a33c-d078-4db3-a7d1-5247a8af9fe7	4a67d2bf-a3ea-4a2e-920a-a0557e769e3a	e45d13e2-7506-4a76-b530-ee69fd0eb2b1	Wife	2025-12-29 16:31:16.198377
cf334da2-eaf0-4e39-857c-5d1c2dbf3d3e	447ac2f3-5078-44f3-a937-1846bf8dd4b6	03ad50e3-aa0b-4875-aefd-6c25e9ef1631	Husband	2025-12-29 16:31:20.915584
d14705f3-b275-41fd-b2c2-9f2a8b7cf082	a5a7b929-a502-46f3-b135-90396f45b1c1	57853450-4b79-4a55-b6ae-4267f86e4740	Husband	2025-12-29 16:31:17.511737
d2792253-26c3-49b5-aee8-a1b4f501979b	d4f3e81e-1d74-44fa-84e5-5988e8c95f42	874fc067-a244-478a-ace5-0d352e439606	Husband	2025-12-29 16:31:22.833414
d282893a-aa97-47a0-bb5a-b0aff5fc1ded	213cbb36-500f-4a5b-b2f8-ea41bcd0738a	6965b15f-d56d-4014-b4dc-2296e0234ade	Wife	2025-12-29 16:31:16.707699
d28f5f7c-9c4b-43b9-bfa0-ce2f0cac2628	fa928927-610d-4b0f-a303-6773c98750f3	74b38e76-dfbe-409b-ba03-f39025b6de2b	Wife	2025-12-29 16:31:20.418757
d2e95d70-a255-4dee-9d70-2b974603148c	7d905f3f-e481-418e-9d8f-138eaadcdf53	8c6f490b-55da-45f3-b1f6-ae54dde406ef	Wife	2025-12-29 16:31:30.513951
d469c2b8-c250-4bd8-81bc-469df0286e21	0af1692c-a00d-419d-9118-9f1e1294f623	138eea36-2263-4093-9a21-dd6aeb846450	Husband	2025-12-29 16:31:21.763203
d941848c-99c8-400c-a2cf-229ecf4d01de	cdcdf14b-edf7-4ade-afa5-e9ab8df26047	6b4bc1f2-f7fd-4ca8-bb35-7a14eabfa434	Husband	2025-12-29 16:31:21.99976
d9f9c122-323d-47a8-b9d0-1ed159044287	b2a4f17c-d4e7-4c51-a17c-db5153d99a80	77759e69-6fc4-4eeb-b591-751f3ca36f68	Wife	2025-12-29 16:31:17.474112
e2b8a3e0-d3d1-4592-a90a-7e87a3708934	4a67d2bf-a3ea-4a2e-920a-a0557e769e3a	1d3b4207-a170-4014-80db-d5a1b76f0035	Husband	2025-12-29 16:31:16.198242
e3ffaad3-6e3f-4eb9-9ec2-8e58ebedd374	a8dabb6d-c746-44e0-8914-9dacd4e646f1	71baa9d5-46cd-4942-812e-2f49f5144350	Husband	2025-12-29 16:31:29.313232
e565110b-262f-434c-bff6-7fe3f02c343e	c525db54-869a-4584-b16d-ce2cb7425a92	2963f2eb-a41a-4ccb-9e7f-f99cee15ed7c	Husband	2025-12-29 16:31:17.355756
e6cd7b89-2fd3-48e4-bb2e-1c5d510d7e6f	6a07cb3b-9b8d-4b25-8eda-a7c65b40f0dd	0a160248-e4f5-449f-a4af-9dd4197f735a	Husband	2025-12-29 16:31:22.669239
e7ea740f-e4b9-4380-b809-76de7d25fabb	9d14010a-e0fc-4d50-b34d-548972dd0f95	8f4c4dff-b017-4a1d-b563-6bfcaba29a1d	Husband	2025-12-29 16:31:23.139953
e8a362cf-794c-47b5-be4f-1a92aea79074	d95b6261-f370-4aaf-a202-bcb727831e3b	8206cda8-fa63-444c-a163-cca7b9db0620	Husband	2025-12-29 16:31:15.770349
e982ffef-9392-490b-8b4e-7491edf053f4	07787fe8-02b1-4b8b-990a-dd94ec5cd628	2dce1a0b-11b9-41a7-827d-562234457252	Husband	2025-12-29 16:31:16.854663
e9e5a389-b276-4730-97b0-a15696c2b717	afc4858b-65d1-40dc-9a74-3ef4d9975467	6c49b75d-7641-4a73-8174-62a31a9e91d2	Wife	2025-12-29 16:31:22.62634
ea58b912-463d-4a92-9565-24e979f8295f	bc29ce54-d5ba-44fc-8ee0-2840c3762821	883f5f91-3f16-4eab-8744-e519e45d256f	Wife	2025-12-29 16:31:28.199703
ecf29765-b762-496f-8922-fee812271099	3cc86cbb-c08c-4301-b797-26758fb64b63	288bfc15-ead3-401d-9bee-e2f5edc370b4	Husband	2025-12-29 16:31:29.910093
ed761ddf-b693-4ac5-832b-e185217da7db	7d905f3f-e481-418e-9d8f-138eaadcdf53	01e7143e-e7d9-4723-976d-4e9e92ea06c5	Husband	2025-12-29 16:31:30.513925
edfdb72e-eaa7-4ab0-9cb7-4ab08d1ca076	f05a4c82-a7dc-48b9-af4f-6c458407002b	098051ee-bc7c-4051-9883-a1b5165ec030	Husband	2025-12-29 16:31:30.241703
efbfbf99-eb9b-4953-b15a-f649c5a9c3d5	f9eb77de-e2f9-4720-b7a9-8847448dcc7a	a3177ae6-e4a7-4f49-a4eb-40c3c7f8a616	Husband	2025-12-29 16:31:27.365759
f2b69edc-86b8-4ae0-885b-280befaf2400	172dcc92-b625-4c37-9c4c-bec1e0c98c9c	43ba5ec9-f935-4c0d-93c6-8beb676a3250	Husband	2025-12-29 16:31:28.600175
f4e8a11d-51a4-4d8c-b03e-c82de1f6915d	959e9d2b-db8c-4f03-b9cb-111e3b6495d1	43034613-869a-4c09-ac18-a854a35fe9a6	Wife	2025-12-29 16:31:19.217973
f6165ac3-26c9-4514-b6a0-317ec17ae088	172dcc92-b625-4c37-9c4c-bec1e0c98c9c	41ab25c4-81ea-46f0-8ec7-82f30f270160	Wife	2025-12-29 16:31:28.600203
f7cb3519-f352-4a93-ad1b-3e6a3bcfb546	7770b10c-d316-42a3-a83d-497af582d523	a73b79fe-5694-45ee-99e5-55755fc11d06	Husband	2025-12-29 16:31:28.837463
f88c5936-8985-4296-b2ee-04129fa8bf4f	4e0d923d-e392-4b6c-99d6-b5b4ba124f28	098051ee-bc7c-4051-9883-a1b5165ec030	Husband	2025-12-29 16:31:30.466397
facf9148-c251-4677-8775-3c0db0e86e40	eaa72d72-8bc2-4c6f-a29e-8439ca720926	f6abe729-f7dd-45da-8c31-9be811832569	Wife	2025-12-29 16:31:26.298119
fc7b8a2a-0f4e-4098-ad0b-e53809a75460	f2b6b1b6-8ee1-4f03-b92f-d1c63eef2439	6ce83efc-05d0-4c17-9d54-8f9eae1c0c63	Wife	2025-12-29 16:31:30.056467
fe80e64e-c923-466e-861d-b1edc2a61801	07787fe8-02b1-4b8b-990a-dd94ec5cd628	3f5b9f66-9803-4368-8dd4-eeb2b3f83dec	Wife	2025-12-29 16:31:16.854736
ffaa77d8-dd74-4d22-a6a5-9cb54647e06c	19a5bcab-5d05-4d44-817c-d1f854dbe78b	e68c6def-f9fb-402e-8066-54a33bd5dd68	Wife	2025-12-29 16:31:20.00881
\.


--
-- TOC entry 3900 (class 0 OID 71140)
-- Dependencies: 223
-- Data for Name: Unions; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."Unions" ("Id", "OrgId", "Type", "StartDate", "StartPrecision", "StartPlaceId", "EndDate", "EndPrecision", "EndPlaceId", "Notes", "CreatedAt", "UpdatedAt") FROM stdin;
008088ad-43b6-4341-9cf6-51b02758ba13	07665bfd-8244-4a07-8087-0377707443a3	0	\N	0	\N	\N	0	\N	\N	2025-12-18 03:49:06.928106	2025-12-18 03:49:06.928106
02438632-1e3a-4698-9071-992ab12178ce	07665bfd-8244-4a07-8087-0377707443a3	0	\N	0	\N	\N	0	\N	\N	2025-12-18 03:49:10.880065	2025-12-18 03:49:10.880065
06f0d323-77f1-4fab-be0b-a4161fbb2de6	07665bfd-8244-4a07-8087-0377707443a3	0	\N	0	\N	\N	0	\N	\N	2025-12-18 03:48:59.86979	2025-12-18 03:48:59.86979
078becd8-3b24-4195-9074-fdfb931ed17e	07665bfd-8244-4a07-8087-0377707443a3	0	\N	0	\N	\N	0	\N	\N	2025-12-18 03:49:05.99829	2025-12-18 03:49:05.99829
0ce1224e-72f1-45c3-b736-a86438163e0b	07665bfd-8244-4a07-8087-0377707443a3	0	\N	0	\N	\N	0	\N	\N	2025-12-18 03:49:09.977761	2025-12-18 03:49:09.977761
0e4c8914-d367-4ad8-8923-29854ca036c0	07665bfd-8244-4a07-8087-0377707443a3	0	\N	0	\N	\N	0	\N	\N	2025-12-18 03:48:56.377634	2025-12-18 03:48:56.377635
0f6c18c8-af2b-4c19-89e2-f2a515e968d6	07665bfd-8244-4a07-8087-0377707443a3	0	\N	0	\N	\N	0	\N	\N	2025-12-18 03:48:56.891898	2025-12-18 03:48:56.891898
14253c39-fcda-449b-832c-2057963d4274	07665bfd-8244-4a07-8087-0377707443a3	0	\N	0	\N	\N	0	\N	\N	2025-12-18 03:49:10.663935	2025-12-18 03:49:10.663935
1528693e-d885-452c-8912-964dcde26edb	07665bfd-8244-4a07-8087-0377707443a3	0	\N	0	\N	\N	0	\N	\N	2025-12-18 03:49:11.43768	2025-12-18 03:49:11.43768
195e16a5-421f-48be-ad64-97be23561f30	07665bfd-8244-4a07-8087-0377707443a3	0	\N	0	\N	\N	0	\N	\N	2025-12-18 03:49:08.657846	2025-12-18 03:49:08.657846
1d5b0888-be21-4bc0-b97a-756bfd927b44	07665bfd-8244-4a07-8087-0377707443a3	0	\N	0	\N	\N	0	\N	\N	2025-12-18 03:49:10.279907	2025-12-18 03:49:10.279907
21954069-f4bb-4b29-8438-f59cc8447a3d	07665bfd-8244-4a07-8087-0377707443a3	0	\N	0	\N	\N	0	\N	\N	2025-12-18 03:48:56.589616	2025-12-18 03:48:56.589616
23835566-dadb-47d0-aadf-168e4bcc6a30	07665bfd-8244-4a07-8087-0377707443a3	0	\N	0	\N	\N	0	\N	\N	2025-12-18 03:48:55.9887	2025-12-18 03:48:55.9887
280b5739-40b0-4352-87c8-7e43a5814a1b	07665bfd-8244-4a07-8087-0377707443a3	0	\N	0	\N	\N	0	\N	\N	2025-12-18 03:49:00.814624	2025-12-18 03:49:00.814625
2ccd642b-54d1-4bda-890f-20d81ba11339	07665bfd-8244-4a07-8087-0377707443a3	0	\N	0	\N	\N	0	\N	\N	2025-12-18 03:49:07.28567	2025-12-18 03:49:07.285671
31314d71-6784-4cf0-92b3-68c0b0d53ff5	07665bfd-8244-4a07-8087-0377707443a3	0	\N	0	\N	\N	0	\N	\N	2025-12-18 03:49:00.568152	2025-12-18 03:49:00.568152
32d3f1c1-2e27-4264-a5f4-82d974b1b548	07665bfd-8244-4a07-8087-0377707443a3	0	\N	0	\N	\N	0	\N	\N	2025-12-18 03:49:04.387371	2025-12-18 03:49:04.387371
33e61d92-1f21-4331-9712-756ea54d6d4f	07665bfd-8244-4a07-8087-0377707443a3	0	\N	0	\N	\N	0	\N	\N	2025-12-18 03:49:06.715922	2025-12-18 03:49:06.715922
3b3d949a-dc18-4268-b70d-f9562a40673f	07665bfd-8244-4a07-8087-0377707443a3	0	\N	0	\N	\N	0	\N	\N	2025-12-18 03:49:07.791776	2025-12-18 03:49:07.791776
3cb26d4f-69de-434b-935b-a1d236029e78	07665bfd-8244-4a07-8087-0377707443a3	0	\N	0	\N	\N	0	\N	\N	2025-12-18 03:49:02.146524	2025-12-18 03:49:02.146524
407a0352-ea72-4a26-9fcc-5141de5df378	07665bfd-8244-4a07-8087-0377707443a3	0	\N	0	\N	\N	0	\N	\N	2025-12-18 03:48:58.382276	2025-12-18 03:48:58.382276
442b5643-105e-49f9-bc98-472f089b8c46	07665bfd-8244-4a07-8087-0377707443a3	0	\N	0	\N	\N	0	\N	\N	2025-12-18 03:49:09.393793	2025-12-18 03:49:09.393793
4589a3dc-09a8-43cd-9001-319ed909073b	07665bfd-8244-4a07-8087-0377707443a3	0	\N	0	\N	\N	0	\N	\N	2025-12-18 03:48:58.741894	2025-12-18 03:48:58.741894
46c14630-ddc9-4c2b-91e0-ae681a1ab8bd	07665bfd-8244-4a07-8087-0377707443a3	0	\N	0	\N	\N	0	\N	\N	2025-12-18 03:49:01.557494	2025-12-18 03:49:01.557494
49b32648-a035-41ba-ac0f-cd8b7df64b98	07665bfd-8244-4a07-8087-0377707443a3	0	\N	0	\N	\N	0	\N	\N	2025-12-18 03:49:01.351283	2025-12-18 03:49:01.351283
49f930d8-a1a0-41f0-8087-fa5c7058ac29	07665bfd-8244-4a07-8087-0377707443a3	0	\N	0	\N	\N	0	\N	\N	2025-12-18 03:49:02.550984	2025-12-18 03:49:02.550985
4b410832-b411-4b74-94fd-896d034ea0b0	07665bfd-8244-4a07-8087-0377707443a3	0	\N	0	\N	\N	0	\N	\N	2025-12-18 03:49:04.04096	2025-12-18 03:49:04.04096
4de5efb1-a486-4d40-aeea-b8783d48beb1	07665bfd-8244-4a07-8087-0377707443a3	0	\N	0	\N	\N	0	\N	\N	2025-12-18 03:49:09.173511	2025-12-18 03:49:09.173511
4e642d79-aa24-40be-91b6-2a8c1c8a80e4	07665bfd-8244-4a07-8087-0377707443a3	0	\N	0	\N	\N	0	\N	\N	2025-12-18 03:48:55.278055	2025-12-18 03:48:55.278189
50a24c98-2907-4db0-9cf8-01cd3d5dcf52	07665bfd-8244-4a07-8087-0377707443a3	0	\N	0	\N	\N	0	\N	\N	2025-12-18 03:49:08.854032	2025-12-18 03:49:08.854033
6263158b-21ae-4e30-9a2a-eb31d8e5aaab	07665bfd-8244-4a07-8087-0377707443a3	0	\N	0	\N	\N	0	\N	\N	2025-12-18 03:49:10.4785	2025-12-18 03:49:10.4785
6396e842-1170-4f81-92ad-cb2f58ce879f	07665bfd-8244-4a07-8087-0377707443a3	0	\N	0	\N	\N	0	\N	\N	2025-12-18 03:49:09.783313	2025-12-18 03:49:09.783313
689c416a-9cad-4de3-ac2d-7b9291a61395	07665bfd-8244-4a07-8087-0377707443a3	0	\N	0	\N	\N	0	\N	\N	2025-12-18 03:49:05.095609	2025-12-18 03:49:05.09561
6c175f22-0e6f-43ea-8a3e-db0a8ad6d40c	07665bfd-8244-4a07-8087-0377707443a3	0	\N	0	\N	\N	0	\N	\N	2025-12-18 03:48:58.330488	2025-12-18 03:48:58.330488
6c62323d-ca91-4918-b471-1dd3112c1f67	07665bfd-8244-4a07-8087-0377707443a3	0	\N	0	\N	\N	0	\N	\N	2025-12-18 03:48:57.093177	2025-12-18 03:48:57.093177
6ff5da96-34fc-4557-bfab-6c8f6bc194c6	07665bfd-8244-4a07-8087-0377707443a3	0	\N	0	\N	\N	0	\N	\N	2025-12-18 03:48:57.092194	2025-12-18 03:48:57.092194
731a25a4-afea-469c-a54b-14e1b76394b8	07665bfd-8244-4a07-8087-0377707443a3	0	\N	0	\N	\N	0	\N	\N	2025-12-18 03:49:04.798002	2025-12-18 03:49:04.798002
73bb177d-b623-4490-bc57-7cb4a0d1c6f7	07665bfd-8244-4a07-8087-0377707443a3	0	\N	0	\N	\N	0	\N	\N	2025-12-18 03:49:02.957439	2025-12-18 03:49:02.957439
7a45f3bb-9129-4752-a40e-4eb5af2405ce	07665bfd-8244-4a07-8087-0377707443a3	0	\N	0	\N	\N	0	\N	\N	2025-12-18 03:49:04.287793	2025-12-18 03:49:04.287793
7b5addf8-afa6-46bc-8e98-b4f3c9ef8794	07665bfd-8244-4a07-8087-0377707443a3	0	\N	0	\N	\N	0	\N	\N	2025-12-18 03:49:10.133519	2025-12-18 03:49:10.133519
8ea0547d-6fa8-4169-9079-d89eb25116d1	07665bfd-8244-4a07-8087-0377707443a3	0	\N	0	\N	\N	0	\N	\N	2025-12-18 03:48:55.609346	2025-12-18 03:48:55.609346
9684a51a-2cba-4565-996d-bcf6b6c0b0ce	07665bfd-8244-4a07-8087-0377707443a3	0	\N	0	\N	\N	0	\N	\N	2025-12-18 03:48:58.028353	2025-12-18 03:48:58.028353
9dbd113c-0922-4c3e-9e5c-568833361b6b	07665bfd-8244-4a07-8087-0377707443a3	0	\N	0	\N	\N	0	\N	\N	2025-12-18 03:49:11.035303	2025-12-18 03:49:11.035303
9f9bb6f8-93e6-453f-af93-53f108c42e36	07665bfd-8244-4a07-8087-0377707443a3	0	\N	0	\N	\N	0	\N	\N	2025-12-18 03:49:08.983036	2025-12-18 03:49:08.983036
a066ef9c-ac13-464c-b97d-4bfc01dcb1ee	07665bfd-8244-4a07-8087-0377707443a3	0	\N	0	\N	\N	0	\N	\N	2025-12-18 03:48:57.874373	2025-12-18 03:48:57.874373
a1278798-720a-4965-92b8-5fb1c44801a5	07665bfd-8244-4a07-8087-0377707443a3	0	\N	0	\N	\N	0	\N	\N	2025-12-18 03:48:58.481538	2025-12-18 03:48:58.481538
a55ac049-fecc-42a8-bf58-ea9f6dd72d89	07665bfd-8244-4a07-8087-0377707443a3	0	\N	0	\N	\N	0	\N	\N	2025-12-18 03:49:11.239696	2025-12-18 03:49:11.239696
b02b4753-2b2b-4540-b1fa-7ccb3ea46cfb	07665bfd-8244-4a07-8087-0377707443a3	0	\N	0	\N	\N	0	\N	\N	2025-12-18 03:49:07.484174	2025-12-18 03:49:07.484174
b5976dc3-eb3a-450f-9535-6f194f389732	07665bfd-8244-4a07-8087-0377707443a3	0	\N	0	\N	\N	0	\N	\N	2025-12-18 03:49:04.184364	2025-12-18 03:49:04.184365
b5d4ce11-d05a-4522-bcb5-684715dcca53	07665bfd-8244-4a07-8087-0377707443a3	0	\N	0	\N	\N	0	\N	\N	2025-12-18 03:49:01.845604	2025-12-18 03:49:01.845604
b9071428-328e-40ce-881e-51c38e45534a	07665bfd-8244-4a07-8087-0377707443a3	0	\N	0	\N	\N	0	\N	\N	2025-12-18 03:49:02.24886	2025-12-18 03:49:02.248861
b911a0bb-42cb-4c16-aace-bc65187b5cdb	07665bfd-8244-4a07-8087-0377707443a3	0	\N	0	\N	\N	0	\N	\N	2025-12-18 03:49:07.57968	2025-12-18 03:49:07.57968
b9598012-9158-4d8a-9783-149fa0ce42f6	07665bfd-8244-4a07-8087-0377707443a3	0	\N	0	\N	\N	0	\N	\N	2025-12-18 03:49:05.696219	2025-12-18 03:49:05.69622
ba1216d2-fa46-400a-a0f9-4afb13800fe0	07665bfd-8244-4a07-8087-0377707443a3	0	\N	0	\N	\N	0	\N	\N	2025-12-18 03:48:56.2237	2025-12-18 03:48:56.2237
bdaed59e-d02e-4866-8d4f-9d68b75b045a	07665bfd-8244-4a07-8087-0377707443a3	0	\N	0	\N	\N	0	\N	\N	2025-12-18 03:49:03.838611	2025-12-18 03:49:03.838611
bfcda393-a602-4f3d-afe6-9b70f59ca6a6	07665bfd-8244-4a07-8087-0377707443a3	0	\N	0	\N	\N	0	\N	\N	2025-12-18 03:48:57.432629	2025-12-18 03:48:57.432629
c3da623f-8bd3-406c-8a05-2640d7925569	07665bfd-8244-4a07-8087-0377707443a3	0	\N	0	\N	\N	0	\N	\N	2025-12-18 03:48:56.702096	2025-12-18 03:48:56.702096
c653b844-6771-40aa-9513-54307bffba0e	07665bfd-8244-4a07-8087-0377707443a3	0	\N	0	\N	\N	0	\N	\N	2025-12-18 03:49:08.218858	2025-12-18 03:49:08.218859
c75a165f-e728-4d60-b872-eca5d57d1369	07665bfd-8244-4a07-8087-0377707443a3	0	\N	0	\N	\N	0	\N	\N	2025-12-18 03:49:02.914202	2025-12-18 03:49:02.914202
c8f74f16-c8e1-41bf-9c6d-08f397421d89	07665bfd-8244-4a07-8087-0377707443a3	0	\N	0	\N	\N	0	\N	\N	2025-12-18 03:48:59.605047	2025-12-18 03:48:59.605047
ced71414-f1ec-498b-a3c0-ade43186d2c5	07665bfd-8244-4a07-8087-0377707443a3	0	\N	0	\N	\N	0	\N	\N	2025-12-18 03:49:05.145981	2025-12-18 03:49:05.145981
cef696fd-9417-4979-b5dc-3f01bed8bc4f	07665bfd-8244-4a07-8087-0377707443a3	0	\N	0	\N	\N	0	\N	\N	2025-12-18 03:49:06.050105	2025-12-18 03:49:06.050105
d09cc5de-25e2-48ff-97b4-08995deba94b	07665bfd-8244-4a07-8087-0377707443a3	0	\N	0	\N	\N	0	\N	\N	2025-12-18 03:49:03.480107	2025-12-18 03:49:03.480108
d264fbf5-f938-4b43-9a0f-8145d3d3977c	07665bfd-8244-4a07-8087-0377707443a3	0	\N	0	\N	\N	0	\N	\N	2025-12-18 03:49:08.367276	2025-12-18 03:49:08.367276
d6ca4e89-09b7-44d4-8d4c-364c7de60887	07665bfd-8244-4a07-8087-0377707443a3	0	\N	0	\N	\N	0	\N	\N	2025-12-18 03:49:09.087242	2025-12-18 03:49:09.087242
d7b410ed-c69c-4c6b-befa-208fa9985675	07665bfd-8244-4a07-8087-0377707443a3	0	\N	0	\N	\N	0	\N	\N	2025-12-18 03:48:59.458907	2025-12-18 03:48:59.458908
d7f7d17f-0aaf-4da2-8eb9-83b1b5dacbfb	07665bfd-8244-4a07-8087-0377707443a3	0	\N	0	\N	\N	0	\N	\N	2025-12-18 03:49:11.843606	2025-12-18 03:49:11.843607
dc38e35c-a243-4cf9-bcd8-f7dca89c6fd0	07665bfd-8244-4a07-8087-0377707443a3	0	\N	0	\N	\N	0	\N	\N	2025-12-18 03:49:07.18634	2025-12-18 03:49:07.18634
dc3f9619-9b38-4a80-a977-8e8fc4ffdf3d	07665bfd-8244-4a07-8087-0377707443a3	0	\N	0	\N	\N	0	\N	\N	2025-12-18 03:49:11.485728	2025-12-18 03:49:11.485728
df48d380-0674-4beb-b855-b949a5855175	07665bfd-8244-4a07-8087-0377707443a3	0	\N	0	\N	\N	0	\N	\N	2025-12-18 03:48:59.010285	2025-12-18 03:48:59.010285
e74d9744-7250-4061-b1f0-3858f2eba640	07665bfd-8244-4a07-8087-0377707443a3	0	\N	0	\N	\N	0	\N	\N	2025-12-18 03:49:05.450714	2025-12-18 03:49:05.450715
e8703f09-983c-4440-af08-9d08e6037680	07665bfd-8244-4a07-8087-0377707443a3	0	\N	0	\N	\N	0	\N	\N	2025-12-18 03:48:57.038922	2025-12-18 03:48:57.038922
eedd6d25-2cef-4381-8897-f9261a3276d7	07665bfd-8244-4a07-8087-0377707443a3	0	\N	0	\N	\N	0	\N	\N	2025-12-18 03:49:11.693102	2025-12-18 03:49:11.693102
ef52f3f6-c244-42b9-a846-4594cb33608b	07665bfd-8244-4a07-8087-0377707443a3	0	\N	0	\N	\N	0	\N	\N	2025-12-18 03:49:09.545479	2025-12-18 03:49:09.545479
efddfbb9-f2be-42bc-b642-07995b4b80e0	07665bfd-8244-4a07-8087-0377707443a3	0	\N	0	\N	\N	0	\N	\N	2025-12-18 03:49:03.151738	2025-12-18 03:49:03.151738
f16eb485-dd4c-4ed6-861e-3aa9bbbc924f	07665bfd-8244-4a07-8087-0377707443a3	0	\N	0	\N	\N	0	\N	\N	2025-12-18 03:48:59.061061	2025-12-18 03:48:59.061061
f2271d03-b90b-42fe-b37f-ea073fa8f481	07665bfd-8244-4a07-8087-0377707443a3	0	\N	0	\N	\N	0	\N	\N	2025-12-18 03:49:01.1561	2025-12-18 03:49:01.1561
f49bfff0-7483-4409-ad93-2b8c88e53ff8	07665bfd-8244-4a07-8087-0377707443a3	0	\N	0	\N	\N	0	\N	\N	2025-12-18 03:48:55.722038	2025-12-18 03:48:55.722038
f754a352-fdfc-463a-a966-495fef313e4f	07665bfd-8244-4a07-8087-0377707443a3	0	\N	0	\N	\N	0	\N	\N	2025-12-18 03:48:59.869978	2025-12-18 03:48:59.869978
fd59f54d-25fc-4f00-ab20-a3a0720a6354	07665bfd-8244-4a07-8087-0377707443a3	0	\N	0	\N	\N	0	\N	\N	2025-12-18 03:49:00.265566	2025-12-18 03:49:00.265566
fe4bad9d-f103-42b8-8d4e-cc99d0f6da8f	07665bfd-8244-4a07-8087-0377707443a3	0	\N	0	\N	\N	0	\N	\N	2025-12-18 03:49:08.367097	2025-12-18 03:49:08.367097
00064be0-c6bb-4224-8b73-4fcdc775e2b3	6f7e2152-c6a2-47ca-b96e-9814df717a03	0	\N	0	\N	\N	0	\N	\N	2025-12-29 16:31:29.490874	2025-12-29 16:31:29.490874
0642b3dd-16cf-4fd1-a9ff-470bbd39a9f4	6f7e2152-c6a2-47ca-b96e-9814df717a03	0	\N	0	\N	\N	0	\N	\N	2025-12-29 16:31:21.217764	2025-12-29 16:31:21.217764
06b7cfac-bbd7-4051-9c49-bef674fb2241	6f7e2152-c6a2-47ca-b96e-9814df717a03	0	\N	0	\N	\N	0	\N	\N	2025-12-29 16:31:26.587273	2025-12-29 16:31:26.587273
07787fe8-02b1-4b8b-990a-dd94ec5cd628	6f7e2152-c6a2-47ca-b96e-9814df717a03	0	\N	0	\N	\N	0	\N	\N	2025-12-29 16:31:16.854407	2025-12-29 16:31:16.854407
09744ad1-e53d-4a85-b896-c983ee53ea88	6f7e2152-c6a2-47ca-b96e-9814df717a03	0	\N	0	\N	\N	0	\N	\N	2025-12-29 16:31:27.651778	2025-12-29 16:31:27.651778
099cec2f-8b2e-4a3e-a843-ab921f1b555d	6f7e2152-c6a2-47ca-b96e-9814df717a03	0	\N	0	\N	\N	0	\N	\N	2025-12-29 16:31:16.082607	2025-12-29 16:31:16.082608
0af1692c-a00d-419d-9118-9f1e1294f623	6f7e2152-c6a2-47ca-b96e-9814df717a03	0	\N	0	\N	\N	0	\N	\N	2025-12-29 16:31:21.763009	2025-12-29 16:31:21.763009
0b728733-87b8-41c7-a05e-9f5b638a2d72	6f7e2152-c6a2-47ca-b96e-9814df717a03	0	\N	0	\N	\N	0	\N	\N	2025-12-29 16:31:18.993851	2025-12-29 16:31:18.993851
11574e45-1937-4286-b691-8b440f227d0c	6f7e2152-c6a2-47ca-b96e-9814df717a03	0	\N	0	\N	\N	0	\N	\N	2025-12-29 16:31:23.874337	2025-12-29 16:31:23.874337
172dcc92-b625-4c37-9c4c-bec1e0c98c9c	6f7e2152-c6a2-47ca-b96e-9814df717a03	0	\N	0	\N	\N	0	\N	\N	2025-12-29 16:31:28.600112	2025-12-29 16:31:28.600112
17bbc980-b833-4c65-bf69-b91fe832b12b	6f7e2152-c6a2-47ca-b96e-9814df717a03	0	\N	0	\N	\N	0	\N	\N	2025-12-29 16:31:17.51118	2025-12-29 16:31:17.51118
19a5bcab-5d05-4d44-817c-d1f854dbe78b	6f7e2152-c6a2-47ca-b96e-9814df717a03	0	\N	0	\N	\N	0	\N	\N	2025-12-29 16:31:20.008589	2025-12-29 16:31:20.008589
213cbb36-500f-4a5b-b2f8-ea41bcd0738a	6f7e2152-c6a2-47ca-b96e-9814df717a03	0	\N	0	\N	\N	0	\N	\N	2025-12-29 16:31:16.707401	2025-12-29 16:31:16.707401
226da86a-e149-45c2-9a1c-b0c97a5372a9	6f7e2152-c6a2-47ca-b96e-9814df717a03	0	\N	0	\N	\N	0	\N	\N	2025-12-29 16:31:27.365836	2025-12-29 16:31:27.365836
25ad41c4-dffa-4471-906e-b70b96aca1bc	6f7e2152-c6a2-47ca-b96e-9814df717a03	0	\N	0	\N	\N	0	\N	\N	2025-12-29 16:31:27.23621	2025-12-29 16:31:27.236211
2678214f-eec3-451a-bc49-b3b310327f72	6f7e2152-c6a2-47ca-b96e-9814df717a03	0	\N	0	\N	\N	0	\N	\N	2025-12-29 16:31:24.695141	2025-12-29 16:31:24.695141
267ebbd3-05a3-4cc3-9a5e-4b37d18a77e9	6f7e2152-c6a2-47ca-b96e-9814df717a03	0	\N	0	\N	\N	0	\N	\N	2025-12-29 16:31:25.947933	2025-12-29 16:31:25.947933
2754f453-6b31-463f-900b-ac4113cda43e	6f7e2152-c6a2-47ca-b96e-9814df717a03	0	\N	0	\N	\N	0	\N	\N	2025-12-29 16:31:29.023489	2025-12-29 16:31:29.02349
2fed9e5e-ce7a-44b8-9e52-c643750d7fab	6f7e2152-c6a2-47ca-b96e-9814df717a03	0	\N	0	\N	\N	0	\N	\N	2025-12-29 16:31:25.546256	2025-12-29 16:31:25.546256
31554dfa-ee0e-4aaa-b205-3cf903d0b8a7	6f7e2152-c6a2-47ca-b96e-9814df717a03	0	\N	0	\N	\N	0	\N	\N	2025-12-29 16:31:26.794511	2025-12-29 16:31:26.794511
324c1ba2-1cd0-45d3-bae7-f664b28587be	6f7e2152-c6a2-47ca-b96e-9814df717a03	0	\N	0	\N	\N	0	\N	\N	2025-12-29 16:31:17.774552	2025-12-29 16:31:17.774552
348c18f7-863f-4fe0-94e3-521a43cb119c	6f7e2152-c6a2-47ca-b96e-9814df717a03	0	\N	0	\N	\N	0	\N	\N	2025-12-29 16:31:19.257164	2025-12-29 16:31:19.257164
36a50a3c-7b23-49c0-bbb2-adb6b0c087e6	6f7e2152-c6a2-47ca-b96e-9814df717a03	0	\N	0	\N	\N	0	\N	\N	2025-12-29 16:31:23.965709	2025-12-29 16:31:23.965709
3b8831d1-a1d9-4153-ad4f-3208f372ab19	6f7e2152-c6a2-47ca-b96e-9814df717a03	0	\N	0	\N	\N	0	\N	\N	2025-12-29 16:31:18.677601	2025-12-29 16:31:18.677601
3cc86cbb-c08c-4301-b797-26758fb64b63	6f7e2152-c6a2-47ca-b96e-9814df717a03	0	\N	0	\N	\N	0	\N	\N	2025-12-29 16:31:29.910027	2025-12-29 16:31:29.910027
4359e1cd-9700-46ec-a903-8b764c7ed075	6f7e2152-c6a2-47ca-b96e-9814df717a03	0	\N	0	\N	\N	0	\N	\N	2025-12-29 16:31:28.099839	2025-12-29 16:31:28.099839
43d5e3df-227e-4d97-b5b8-25ab596940aa	6f7e2152-c6a2-47ca-b96e-9814df717a03	0	\N	0	\N	\N	0	\N	\N	2025-12-29 16:31:21.563269	2025-12-29 16:31:21.56327
447ac2f3-5078-44f3-a937-1846bf8dd4b6	6f7e2152-c6a2-47ca-b96e-9814df717a03	0	\N	0	\N	\N	0	\N	\N	2025-12-29 16:31:20.915493	2025-12-29 16:31:20.915493
46222a9a-f5ed-4984-a5df-848fb5f20728	6f7e2152-c6a2-47ca-b96e-9814df717a03	0	\N	0	\N	\N	0	\N	\N	2025-12-29 16:31:17.194024	2025-12-29 16:31:17.194024
48782029-0fcc-415a-bede-3533d8fbe814	6f7e2152-c6a2-47ca-b96e-9814df717a03	0	\N	0	\N	\N	0	\N	\N	2025-12-29 16:31:18.634826	2025-12-29 16:31:18.634826
487f726f-d8a8-40ca-94be-524636be9ad7	6f7e2152-c6a2-47ca-b96e-9814df717a03	0	\N	0	\N	\N	0	\N	\N	2025-12-29 16:31:22.085625	2025-12-29 16:31:22.085625
4a67d2bf-a3ea-4a2e-920a-a0557e769e3a	6f7e2152-c6a2-47ca-b96e-9814df717a03	0	\N	0	\N	\N	0	\N	\N	2025-12-29 16:31:16.198068	2025-12-29 16:31:16.198069
4e0d923d-e392-4b6c-99d6-b5b4ba124f28	6f7e2152-c6a2-47ca-b96e-9814df717a03	0	\N	0	\N	\N	0	\N	\N	2025-12-29 16:31:30.466336	2025-12-29 16:31:30.466336
4e14dd0f-7421-432d-88f7-b43737d23193	6f7e2152-c6a2-47ca-b96e-9814df717a03	0	\N	0	\N	\N	0	\N	\N	2025-12-29 16:31:23.646136	2025-12-29 16:31:23.646137
578618ee-9f6e-4460-876d-447a34f6a427	6f7e2152-c6a2-47ca-b96e-9814df717a03	0	\N	0	\N	\N	0	\N	\N	2025-12-29 16:31:22.32771	2025-12-29 16:31:22.32771
5e5d1e60-3e18-47ad-bd1b-1d0c2e011f35	6f7e2152-c6a2-47ca-b96e-9814df717a03	0	\N	0	\N	\N	0	\N	\N	2025-12-29 16:31:24.341349	2025-12-29 16:31:24.341349
6a07cb3b-9b8d-4b25-8eda-a7c65b40f0dd	6f7e2152-c6a2-47ca-b96e-9814df717a03	0	\N	0	\N	\N	0	\N	\N	2025-12-29 16:31:22.669163	2025-12-29 16:31:22.669164
6cd7d7db-dd7c-404d-b738-0bf74c179dd7	6f7e2152-c6a2-47ca-b96e-9814df717a03	0	\N	0	\N	\N	0	\N	\N	2025-12-29 16:31:23.787883	2025-12-29 16:31:23.787883
6dcd7aeb-70c1-49be-a58d-0d8f0febc9cc	6f7e2152-c6a2-47ca-b96e-9814df717a03	0	\N	0	\N	\N	0	\N	\N	2025-12-29 16:31:19.76651	2025-12-29 16:31:19.76651
739e556f-8d3a-4464-8dd1-0a193efc1628	6f7e2152-c6a2-47ca-b96e-9814df717a03	0	\N	0	\N	\N	0	\N	\N	2025-12-29 16:31:24.639092	2025-12-29 16:31:24.639092
7770b10c-d316-42a3-a83d-497af582d523	6f7e2152-c6a2-47ca-b96e-9814df717a03	0	\N	0	\N	\N	0	\N	\N	2025-12-29 16:31:28.837402	2025-12-29 16:31:28.837402
77f2517f-1aa4-42eb-8e7b-a29a03ef4369	6f7e2152-c6a2-47ca-b96e-9814df717a03	0	\N	0	\N	\N	0	\N	\N	2025-12-29 16:31:21.39063	2025-12-29 16:31:21.390631
7d905f3f-e481-418e-9d8f-138eaadcdf53	6f7e2152-c6a2-47ca-b96e-9814df717a03	0	\N	0	\N	\N	0	\N	\N	2025-12-29 16:31:30.513872	2025-12-29 16:31:30.513872
7f9705c5-3485-4e78-8437-de3bfb636fee	6f7e2152-c6a2-47ca-b96e-9814df717a03	0	\N	0	\N	\N	0	\N	\N	2025-12-29 16:31:18.35444	2025-12-29 16:31:18.35444
83d43d3d-57de-4038-b319-b35aa92ac1be	6f7e2152-c6a2-47ca-b96e-9814df717a03	0	\N	0	\N	\N	0	\N	\N	2025-12-29 16:31:29.70635	2025-12-29 16:31:29.70635
89809e77-36fb-424e-873b-1d2870bcdfa4	6f7e2152-c6a2-47ca-b96e-9814df717a03	0	\N	0	\N	\N	0	\N	\N	2025-12-29 16:31:18.219392	2025-12-29 16:31:18.219392
93e9fa96-d7cb-4caa-ba55-3344976d33d2	6f7e2152-c6a2-47ca-b96e-9814df717a03	0	\N	0	\N	\N	0	\N	\N	2025-12-29 16:31:26.490191	2025-12-29 16:31:26.490192
94282608-f93a-4a90-a22a-d7b77649cf28	6f7e2152-c6a2-47ca-b96e-9814df717a03	0	\N	0	\N	\N	0	\N	\N	2025-12-29 16:31:20.008396	2025-12-29 16:31:20.008396
94bfcf61-243b-4d99-885e-7faee8e34310	6f7e2152-c6a2-47ca-b96e-9814df717a03	0	\N	0	\N	\N	0	\N	\N	2025-12-29 16:31:18.755859	2025-12-29 16:31:18.755859
959e9d2b-db8c-4f03-b9cb-111e3b6495d1	6f7e2152-c6a2-47ca-b96e-9814df717a03	0	\N	0	\N	\N	0	\N	\N	2025-12-29 16:31:19.217782	2025-12-29 16:31:19.217782
976383dc-eff3-4525-90e8-e191612e6143	6f7e2152-c6a2-47ca-b96e-9814df717a03	0	\N	0	\N	\N	0	\N	\N	2025-12-29 16:31:25.744869	2025-12-29 16:31:25.74487
9d14010a-e0fc-4d50-b34d-548972dd0f95	6f7e2152-c6a2-47ca-b96e-9814df717a03	0	\N	0	\N	\N	0	\N	\N	2025-12-29 16:31:23.139875	2025-12-29 16:31:23.139875
9d3dbb28-9d4f-4e15-befb-617e91c9755c	6f7e2152-c6a2-47ca-b96e-9814df717a03	0	\N	0	\N	\N	0	\N	\N	2025-12-29 16:31:23.474614	2025-12-29 16:31:23.474615
a11c2592-f25c-4bcd-9958-3c1c6d973f24	6f7e2152-c6a2-47ca-b96e-9814df717a03	0	\N	0	\N	\N	0	\N	\N	2025-12-29 16:31:30.69528	2025-12-29 16:31:30.69528
a5a7b929-a502-46f3-b135-90396f45b1c1	6f7e2152-c6a2-47ca-b96e-9814df717a03	0	\N	0	\N	\N	0	\N	\N	2025-12-29 16:31:17.511674	2025-12-29 16:31:17.511675
a8dabb6d-c746-44e0-8914-9dacd4e646f1	6f7e2152-c6a2-47ca-b96e-9814df717a03	0	\N	0	\N	\N	0	\N	\N	2025-12-29 16:31:29.313159	2025-12-29 16:31:29.313159
afc4858b-65d1-40dc-9a74-3ef4d9975467	6f7e2152-c6a2-47ca-b96e-9814df717a03	0	\N	0	\N	\N	0	\N	\N	2025-12-29 16:31:22.625994	2025-12-29 16:31:22.625994
b2a4f17c-d4e7-4c51-a17c-db5153d99a80	6f7e2152-c6a2-47ca-b96e-9814df717a03	0	\N	0	\N	\N	0	\N	\N	2025-12-29 16:31:17.474011	2025-12-29 16:31:17.474011
bc29ce54-d5ba-44fc-8ee0-2840c3762821	6f7e2152-c6a2-47ca-b96e-9814df717a03	0	\N	0	\N	\N	0	\N	\N	2025-12-29 16:31:28.199578	2025-12-29 16:31:28.199579
c0d9e797-2ebf-480a-9090-0b8e0c158d8f	6f7e2152-c6a2-47ca-b96e-9814df717a03	0	\N	0	\N	\N	0	\N	\N	2025-12-29 16:31:29.16676	2025-12-29 16:31:29.16676
c525db54-869a-4584-b16d-ce2cb7425a92	6f7e2152-c6a2-47ca-b96e-9814df717a03	0	\N	0	\N	\N	0	\N	\N	2025-12-29 16:31:17.355652	2025-12-29 16:31:17.355652
cc4331aa-59f6-422a-a409-eb2b8252d27c	6f7e2152-c6a2-47ca-b96e-9814df717a03	0	\N	0	\N	\N	0	\N	\N	2025-12-29 16:31:20.695157	2025-12-29 16:31:20.695157
cd84d20c-08b5-46d4-96a7-9491cc41393f	6f7e2152-c6a2-47ca-b96e-9814df717a03	0	\N	0	\N	\N	0	\N	\N	2025-12-29 16:31:16.482867	2025-12-29 16:31:16.482867
cdcdf14b-edf7-4ade-afa5-e9ab8df26047	6f7e2152-c6a2-47ca-b96e-9814df717a03	0	\N	0	\N	\N	0	\N	\N	2025-12-29 16:31:21.999645	2025-12-29 16:31:21.999645
d14b0ded-1c76-488f-a970-0eac44f8340f	6f7e2152-c6a2-47ca-b96e-9814df717a03	0	\N	0	\N	\N	0	\N	\N	2025-12-29 16:31:19.623552	2025-12-29 16:31:19.623553
d4f3e81e-1d74-44fa-84e5-5988e8c95f42	6f7e2152-c6a2-47ca-b96e-9814df717a03	0	\N	0	\N	\N	0	\N	\N	2025-12-29 16:31:22.833316	2025-12-29 16:31:22.833317
d95b6261-f370-4aaf-a202-bcb727831e3b	6f7e2152-c6a2-47ca-b96e-9814df717a03	0	\N	0	\N	\N	0	\N	\N	2025-12-29 16:31:15.709191	2025-12-29 16:31:15.709317
dc47a4ac-fb50-4455-8d92-fcd2e5199752	6f7e2152-c6a2-47ca-b96e-9814df717a03	0	\N	0	\N	\N	0	\N	\N	2025-12-29 16:31:24.98466	2025-12-29 16:31:24.98466
e78eed47-5b30-4431-b967-a1c6e6b3c6ff	6f7e2152-c6a2-47ca-b96e-9814df717a03	0	\N	0	\N	\N	0	\N	\N	2025-12-29 16:31:27.982585	2025-12-29 16:31:27.982585
e86892ea-30a3-4c59-9b94-7db8887c201b	6f7e2152-c6a2-47ca-b96e-9814df717a03	0	\N	0	\N	\N	0	\N	\N	2025-12-29 16:31:17.091933	2025-12-29 16:31:17.091934
ea0cceae-9c50-4b9a-9005-92b004d4152f	6f7e2152-c6a2-47ca-b96e-9814df717a03	0	\N	0	\N	\N	0	\N	\N	2025-12-29 16:31:30.842422	2025-12-29 16:31:30.842422
eaa72d72-8bc2-4c6f-a29e-8439ca720926	6f7e2152-c6a2-47ca-b96e-9814df717a03	0	\N	0	\N	\N	0	\N	\N	2025-12-29 16:31:26.29799	2025-12-29 16:31:26.29799
ec9aec82-114a-4009-8dce-880b99ea0a6c	6f7e2152-c6a2-47ca-b96e-9814df717a03	0	\N	0	\N	\N	0	\N	\N	2025-12-29 16:31:26.194921	2025-12-29 16:31:26.194921
ececd687-94fb-4ff2-8e1a-af484318eba1	6f7e2152-c6a2-47ca-b96e-9814df717a03	0	\N	0	\N	\N	0	\N	\N	2025-12-29 16:31:25.495244	2025-12-29 16:31:25.495244
ef301bbc-7637-4436-ab22-e6624355d084	6f7e2152-c6a2-47ca-b96e-9814df717a03	0	\N	0	\N	\N	0	\N	\N	2025-12-29 16:31:28.450141	2025-12-29 16:31:28.450141
f05a4c82-a7dc-48b9-af4f-6c458407002b	6f7e2152-c6a2-47ca-b96e-9814df717a03	0	\N	0	\N	\N	0	\N	\N	2025-12-29 16:31:30.241656	2025-12-29 16:31:30.241656
f225ce38-56bb-4413-8022-5d1af96352a4	6f7e2152-c6a2-47ca-b96e-9814df717a03	0	\N	0	\N	\N	0	\N	\N	2025-12-29 16:31:27.852816	2025-12-29 16:31:27.852817
f2b6b1b6-8ee1-4f03-b92f-d1c63eef2439	6f7e2152-c6a2-47ca-b96e-9814df717a03	0	\N	0	\N	\N	0	\N	\N	2025-12-29 16:31:30.056312	2025-12-29 16:31:30.056312
f9eb77de-e2f9-4720-b7a9-8847448dcc7a	6f7e2152-c6a2-47ca-b96e-9814df717a03	0	\N	0	\N	\N	0	\N	\N	2025-12-29 16:31:27.36566	2025-12-29 16:31:27.36566
fa928927-610d-4b0f-a303-6773c98750f3	6f7e2152-c6a2-47ca-b96e-9814df717a03	0	\N	0	\N	\N	0	\N	\N	2025-12-29 16:31:20.418585	2025-12-29 16:31:20.418585
fb523d79-b53a-4b36-a510-1437be462361	6f7e2152-c6a2-47ca-b96e-9814df717a03	0	\N	0	\N	\N	0	\N	\N	2025-12-29 16:31:25.200367	2025-12-29 16:31:25.200367
\.


--
-- TOC entry 3895 (class 0 OID 71030)
-- Dependencies: 218
-- Data for Name: Users; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."Users" ("Id", "Email", "PasswordHash", "FirstName", "LastName", "EmailConfirmed", "CreatedAt", "LastLoginAt", "RefreshToken", "RefreshTokenExpiryTime") FROM stdin;
22222222-2222-2222-2222-222222222222	admin@familytree.demo	$2a$11$vZ5K5vJ5vZ5K5vJ5vZ5K5u9Z5K5vJ5vZ5K5vJ5vZ5K5vJ5vZ5K5vJ	Admin	User	t	2025-11-15 05:38:31.161469	2025-11-15 05:38:31.161469	\N	\N
\.


--
-- TOC entry 3931 (class 0 OID 72807)
-- Dependencies: 254
-- Data for Name: __EFMigrationsHistory; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."__EFMigrationsHistory" ("MigrationId", "ProductVersion") FROM stdin;
\.


--
-- TOC entry 3981 (class 0 OID 0)
-- Dependencies: 236
-- Name: AspNetRoleClaims_Id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public."AspNetRoleClaims_Id_seq"', 100, false);


--
-- TOC entry 3982 (class 0 OID 0)
-- Dependencies: 232
-- Name: AspNetRoles_Id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public."AspNetRoles_Id_seq"', 100, false);


--
-- TOC entry 3983 (class 0 OID 0)
-- Dependencies: 243
-- Name: AspNetTemp_Id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public."AspNetTemp_Id_seq"', 100, false);


--
-- TOC entry 3984 (class 0 OID 0)
-- Dependencies: 247
-- Name: AspNetUserBearerToken_Id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public."AspNetUserBearerToken_Id_seq"', 1, false);


--
-- TOC entry 3985 (class 0 OID 0)
-- Dependencies: 238
-- Name: AspNetUserClaims_Id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public."AspNetUserClaims_Id_seq"', 100, false);


--
-- TOC entry 3986 (class 0 OID 0)
-- Dependencies: 234
-- Name: AspNetUsers_Id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public."AspNetUsers_Id_seq"', 103, true);


--
-- TOC entry 3987 (class 0 OID 0)
-- Dependencies: 256
-- Name: FamilyRelationshipTypes_Id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public."FamilyRelationshipTypes_Id_seq"', 76, true);


--
-- TOC entry 3988 (class 0 OID 0)
-- Dependencies: 259
-- Name: NameMappings_Id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public."NameMappings_Id_seq"', 12, true);


--
-- TOC entry 3989 (class 0 OID 0)
-- Dependencies: 245
-- Name: RefreshToken_Id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public."RefreshToken_Id_seq"', 1, false);


--
-- TOC entry 3990 (class 0 OID 0)
-- Dependencies: 249
-- Name: SignerToken_Id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public."SignerToken_Id_seq"', 1, false);


--
-- TOC entry 3639 (class 2606 OID 72650)
-- Name: AdminTreeAssignments AdminTreeAssignments_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."AdminTreeAssignments"
    ADD CONSTRAINT "AdminTreeAssignments_pkey" PRIMARY KEY ("Id");


--
-- TOC entry 3589 (class 2606 OID 71276)
-- Name: AuditLogs AuditLogs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."AuditLogs"
    ADD CONSTRAINT "AuditLogs_pkey" PRIMARY KEY ("Id");


--
-- TOC entry 3684 (class 2606 OID 73011)
-- Name: Families Families_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Families"
    ADD CONSTRAINT "Families_pkey" PRIMARY KEY ("Id");


--
-- TOC entry 3665 (class 2606 OID 72936)
-- Name: FamilyRelationshipTypes FamilyRelationshipTypes_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."FamilyRelationshipTypes"
    ADD CONSTRAINT "FamilyRelationshipTypes_pkey" PRIMARY KEY ("Id");


--
-- TOC entry 3577 (class 2606 OID 71217)
-- Name: MediaFiles MediaFiles_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."MediaFiles"
    ADD CONSTRAINT "MediaFiles_pkey" PRIMARY KEY ("Id");


--
-- TOC entry 3682 (class 2606 OID 72978)
-- Name: NameMappings NameMappings_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."NameMappings"
    ADD CONSTRAINT "NameMappings_pkey" PRIMARY KEY ("Id");


--
-- TOC entry 3529 (class 2606 OID 71051)
-- Name: OrgUsers OrgUsers_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."OrgUsers"
    ADD CONSTRAINT "OrgUsers_pkey" PRIMARY KEY ("Id");


--
-- TOC entry 3521 (class 2606 OID 71028)
-- Name: Orgs Orgs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Orgs"
    ADD CONSTRAINT "Orgs_pkey" PRIMARY KEY ("Id");


--
-- TOC entry 3694 (class 2606 OID 73054)
-- Name: AdminTownAssignments PK_AdminTownAssignments; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."AdminTownAssignments"
    ADD CONSTRAINT "PK_AdminTownAssignments" PRIMARY KEY ("Id");


--
-- TOC entry 3606 (class 2606 OID 72453)
-- Name: AspNetRoleClaims PK_AspNetRoleClaims; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."AspNetRoleClaims"
    ADD CONSTRAINT "PK_AspNetRoleClaims" PRIMARY KEY ("Id");


--
-- TOC entry 3594 (class 2606 OID 72449)
-- Name: AspNetRoles PK_AspNetRoles; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."AspNetRoles"
    ADD CONSTRAINT "PK_AspNetRoles" PRIMARY KEY ("Id");


--
-- TOC entry 3619 (class 2606 OID 72463)
-- Name: AspNetTemp PK_AspNetTemp; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."AspNetTemp"
    ADD CONSTRAINT "PK_AspNetTemp" PRIMARY KEY ("Id");


--
-- TOC entry 3609 (class 2606 OID 72455)
-- Name: AspNetUserClaims PK_AspNetUserClaims; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."AspNetUserClaims"
    ADD CONSTRAINT "PK_AspNetUserClaims" PRIMARY KEY ("Id");


--
-- TOC entry 3612 (class 2606 OID 72457)
-- Name: AspNetUserLogins PK_AspNetUserLogins; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."AspNetUserLogins"
    ADD CONSTRAINT "PK_AspNetUserLogins" PRIMARY KEY ("LoginProvider", "ProviderKey");


--
-- TOC entry 3615 (class 2606 OID 72459)
-- Name: AspNetUserRoles PK_AspNetUserRoles; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."AspNetUserRoles"
    ADD CONSTRAINT "PK_AspNetUserRoles" PRIMARY KEY ("UserId", "RoleId");


--
-- TOC entry 3617 (class 2606 OID 72461)
-- Name: AspNetUserTokens PK_AspNetUserTokens; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."AspNetUserTokens"
    ADD CONSTRAINT "PK_AspNetUserTokens" PRIMARY KEY ("UserId", "LoginProvider", "Name");


--
-- TOC entry 3599 (class 2606 OID 72451)
-- Name: AspNetUsers PK_AspNetUsers; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."AspNetUsers"
    ADD CONSTRAINT "PK_AspNetUsers" PRIMARY KEY ("Id");


--
-- TOC entry 3623 (class 2606 OID 72467)
-- Name: RefreshToken PK_RefreshToken; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."RefreshToken"
    ADD CONSTRAINT "PK_RefreshToken" PRIMARY KEY ("Id");


--
-- TOC entry 3629 (class 2606 OID 72471)
-- Name: SignerToken PK_SignerToken; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."SignerToken"
    ADD CONSTRAINT "PK_SignerToken" PRIMARY KEY ("Id");


--
-- TOC entry 3663 (class 2606 OID 72819)
-- Name: Towns PK_Towns; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Towns"
    ADD CONSTRAINT "PK_Towns" PRIMARY KEY ("Id");


--
-- TOC entry 3659 (class 2606 OID 72811)
-- Name: __EFMigrationsHistory PK___EFMigrationsHistory; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."__EFMigrationsHistory"
    ADD CONSTRAINT "PK___EFMigrationsHistory" PRIMARY KEY ("MigrationId");


--
-- TOC entry 3568 (class 2606 OID 71192)
-- Name: ParentChildren ParentChildren_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."ParentChildren"
    ADD CONSTRAINT "ParentChildren_pkey" PRIMARY KEY ("Id");


--
-- TOC entry 3539 (class 2606 OID 71101)
-- Name: People People_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."People"
    ADD CONSTRAINT "People_pkey" PRIMARY KEY ("Id");


--
-- TOC entry 3635 (class 2606 OID 72618)
-- Name: PersonLinks PersonLinks_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."PersonLinks"
    ADD CONSTRAINT "PersonLinks_pkey" PRIMARY KEY ("Id");


--
-- TOC entry 3655 (class 2606 OID 72708)
-- Name: PersonMediaLinks PersonMedia_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."PersonMediaLinks"
    ADD CONSTRAINT "PersonMedia_pkey" PRIMARY KEY ("Id");


--
-- TOC entry 3673 (class 2606 OID 72951)
-- Name: PersonMedia PersonMedia_pkey1; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."PersonMedia"
    ADD CONSTRAINT "PersonMedia_pkey1" PRIMARY KEY ("Id");


--
-- TOC entry 3552 (class 2606 OID 71130)
-- Name: PersonNames PersonNames_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."PersonNames"
    ADD CONSTRAINT "PersonNames_pkey" PRIMARY KEY ("Id");


--
-- TOC entry 3587 (class 2606 OID 71256)
-- Name: PersonTags PersonTags_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."PersonTags"
    ADD CONSTRAINT "PersonTags_pkey" PRIMARY KEY ("Id");


--
-- TOC entry 3627 (class 2606 OID 72469)
-- Name: AspNetUserBearerToken Pk_AspNetUserBearerToken; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."AspNetUserBearerToken"
    ADD CONSTRAINT "Pk_AspNetUserBearerToken" PRIMARY KEY ("Id");


--
-- TOC entry 3533 (class 2606 OID 71071)
-- Name: Places Places_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Places"
    ADD CONSTRAINT "Places_pkey" PRIMARY KEY ("Id");


--
-- TOC entry 3581 (class 2606 OID 71239)
-- Name: Sources Sources_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Sources"
    ADD CONSTRAINT "Sources_pkey" PRIMARY KEY ("Id");


--
-- TOC entry 3584 (class 2606 OID 71248)
-- Name: Tags Tags_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Tags"
    ADD CONSTRAINT "Tags_pkey" PRIMARY KEY ("Id");


--
-- TOC entry 3648 (class 2606 OID 72679)
-- Name: TreeInvitations TreeInvitations_Token_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."TreeInvitations"
    ADD CONSTRAINT "TreeInvitations_Token_key" UNIQUE ("Token");


--
-- TOC entry 3650 (class 2606 OID 72677)
-- Name: TreeInvitations TreeInvitations_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."TreeInvitations"
    ADD CONSTRAINT "TreeInvitations_pkey" PRIMARY KEY ("Id");


--
-- TOC entry 3696 (class 2606 OID 73056)
-- Name: AdminTownAssignments UQ_AdminTownAssignments_User_Town; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."AdminTownAssignments"
    ADD CONSTRAINT "UQ_AdminTownAssignments_User_Town" UNIQUE ("UserId", "TownId");


--
-- TOC entry 3643 (class 2606 OID 72652)
-- Name: AdminTreeAssignments UQ_AdminTreeAssignments_User_Tree; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."AdminTreeAssignments"
    ADD CONSTRAINT "UQ_AdminTreeAssignments_User_Tree" UNIQUE ("UserId", "TreeId");


--
-- TOC entry 3637 (class 2606 OID 72620)
-- Name: PersonLinks UQ_PersonLinks_Source_Target; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."PersonLinks"
    ADD CONSTRAINT "UQ_PersonLinks_Source_Target" UNIQUE ("SourcePersonId", "TargetPersonId");


--
-- TOC entry 3657 (class 2606 OID 72710)
-- Name: PersonMediaLinks UQ_PersonMedia_Person_Media; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."PersonMediaLinks"
    ADD CONSTRAINT "UQ_PersonMedia_Person_Media" UNIQUE ("PersonId", "MediaId");


--
-- TOC entry 3561 (class 2606 OID 71171)
-- Name: UnionMembers UnionMembers_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."UnionMembers"
    ADD CONSTRAINT "UnionMembers_pkey" PRIMARY KEY ("Id");


--
-- TOC entry 3558 (class 2606 OID 71152)
-- Name: Unions Unions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Unions"
    ADD CONSTRAINT "Unions_pkey" PRIMARY KEY ("Id");


--
-- TOC entry 3524 (class 2606 OID 71042)
-- Name: Users Users_Email_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Users"
    ADD CONSTRAINT "Users_Email_key" UNIQUE ("Email");


--
-- TOC entry 3526 (class 2606 OID 71040)
-- Name: Users Users_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Users"
    ADD CONSTRAINT "Users_pkey" PRIMARY KEY ("Id");


--
-- TOC entry 3621 (class 2606 OID 72465)
-- Name: AspNetTemp unique_aspuser_constraint; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."AspNetTemp"
    ADD CONSTRAINT unique_aspuser_constraint UNIQUE ("AspUser");


--
-- TOC entry 3597 (class 1259 OID 72472)
-- Name: EmailIndex; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "EmailIndex" ON public."AspNetUsers" USING btree ("NormalizedEmail");


--
-- TOC entry 3690 (class 1259 OID 73074)
-- Name: IX_AdminTownAssignments_IsActive; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IX_AdminTownAssignments_IsActive" ON public."AdminTownAssignments" USING btree ("IsActive");


--
-- TOC entry 3691 (class 1259 OID 73073)
-- Name: IX_AdminTownAssignments_TownId; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IX_AdminTownAssignments_TownId" ON public."AdminTownAssignments" USING btree ("TownId");


--
-- TOC entry 3692 (class 1259 OID 73072)
-- Name: IX_AdminTownAssignments_UserId; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IX_AdminTownAssignments_UserId" ON public."AdminTownAssignments" USING btree ("UserId");


--
-- TOC entry 3640 (class 1259 OID 72669)
-- Name: IX_AdminTreeAssignments_TreeId; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IX_AdminTreeAssignments_TreeId" ON public."AdminTreeAssignments" USING btree ("TreeId");


--
-- TOC entry 3641 (class 1259 OID 72668)
-- Name: IX_AdminTreeAssignments_UserId; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IX_AdminTreeAssignments_UserId" ON public."AdminTreeAssignments" USING btree ("UserId");


--
-- TOC entry 3604 (class 1259 OID 72478)
-- Name: IX_AspNetRoleClaims_RoleId; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IX_AspNetRoleClaims_RoleId" ON public."AspNetRoleClaims" USING btree ("RoleId");


--
-- TOC entry 3607 (class 1259 OID 72479)
-- Name: IX_AspNetUserClaims_UserId; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IX_AspNetUserClaims_UserId" ON public."AspNetUserClaims" USING btree ("UserId");


--
-- TOC entry 3610 (class 1259 OID 72480)
-- Name: IX_AspNetUserLogins_UserId; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IX_AspNetUserLogins_UserId" ON public."AspNetUserLogins" USING btree ("UserId");


--
-- TOC entry 3613 (class 1259 OID 72481)
-- Name: IX_AspNetUserRoles_RoleId; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IX_AspNetUserRoles_RoleId" ON public."AspNetUserRoles" USING btree ("RoleId");


--
-- TOC entry 3590 (class 1259 OID 71282)
-- Name: IX_AuditLogs_ActorId; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IX_AuditLogs_ActorId" ON public."AuditLogs" USING btree ("ActorId");


--
-- TOC entry 3591 (class 1259 OID 71283)
-- Name: IX_AuditLogs_EntityType_EntityId; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IX_AuditLogs_EntityType_EntityId" ON public."AuditLogs" USING btree ("EntityType", "EntityId");


--
-- TOC entry 3592 (class 1259 OID 71284)
-- Name: IX_AuditLogs_Timestamp; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IX_AuditLogs_Timestamp" ON public."AuditLogs" USING btree ("Timestamp");


--
-- TOC entry 3685 (class 1259 OID 73039)
-- Name: IX_Families_Name; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IX_Families_Name" ON public."Families" USING btree ("Name");


--
-- TOC entry 3686 (class 1259 OID 73037)
-- Name: IX_Families_OrgId; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IX_Families_OrgId" ON public."Families" USING btree ("OrgId");


--
-- TOC entry 3687 (class 1259 OID 73040)
-- Name: IX_Families_SortOrder; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IX_Families_SortOrder" ON public."Families" USING btree ("SortOrder");


--
-- TOC entry 3688 (class 1259 OID 73038)
-- Name: IX_Families_TownId; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IX_Families_TownId" ON public."Families" USING btree ("TownId");


--
-- TOC entry 3689 (class 1259 OID 73075)
-- Name: IX_Families_TownId_Name_Unique; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "IX_Families_TownId_Name_Unique" ON public."Families" USING btree ("TownId", "Name");


--
-- TOC entry 3666 (class 1259 OID 72938)
-- Name: IX_FamilyRelationshipTypes_Category; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IX_FamilyRelationshipTypes_Category" ON public."FamilyRelationshipTypes" USING btree ("Category");


--
-- TOC entry 3667 (class 1259 OID 72939)
-- Name: IX_FamilyRelationshipTypes_IsActive; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IX_FamilyRelationshipTypes_IsActive" ON public."FamilyRelationshipTypes" USING btree ("IsActive");


--
-- TOC entry 3668 (class 1259 OID 72937)
-- Name: IX_FamilyRelationshipTypes_NameEnglish; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IX_FamilyRelationshipTypes_NameEnglish" ON public."FamilyRelationshipTypes" USING btree ("NameEnglish");


--
-- TOC entry 3571 (class 1259 OID 72729)
-- Name: IX_MediaFiles_Category; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IX_MediaFiles_Category" ON public."MediaFiles" USING btree ("Category");


--
-- TOC entry 3572 (class 1259 OID 71228)
-- Name: IX_MediaFiles_OrgId; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IX_MediaFiles_OrgId" ON public."MediaFiles" USING btree ("OrgId");


--
-- TOC entry 3573 (class 1259 OID 72893)
-- Name: IX_MediaFiles_PersonId; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IX_MediaFiles_PersonId" ON public."MediaFiles" USING btree ("PersonId");


--
-- TOC entry 3574 (class 1259 OID 71229)
-- Name: IX_MediaFiles_StorageKey; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IX_MediaFiles_StorageKey" ON public."MediaFiles" USING btree ("StorageKey");


--
-- TOC entry 3575 (class 1259 OID 72728)
-- Name: IX_MediaFiles_UploadedByUserId; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IX_MediaFiles_UploadedByUserId" ON public."MediaFiles" USING btree ("UploadedByUserId");


--
-- TOC entry 3674 (class 1259 OID 72989)
-- Name: IX_NameMappings_ArabicNormalized; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IX_NameMappings_ArabicNormalized" ON public."NameMappings" USING btree ("ArabicNormalized");


--
-- TOC entry 3675 (class 1259 OID 72995)
-- Name: IX_NameMappings_ConfirmedByUserId; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IX_NameMappings_ConfirmedByUserId" ON public."NameMappings" USING btree ("ConfirmedByUserId");


--
-- TOC entry 3676 (class 1259 OID 72990)
-- Name: IX_NameMappings_EnglishNormalized; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IX_NameMappings_EnglishNormalized" ON public."NameMappings" USING btree ("EnglishNormalized");


--
-- TOC entry 3677 (class 1259 OID 72993)
-- Name: IX_NameMappings_IsVerified; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IX_NameMappings_IsVerified" ON public."NameMappings" USING btree ("IsVerified");


--
-- TOC entry 3678 (class 1259 OID 72992)
-- Name: IX_NameMappings_NeedsReview; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IX_NameMappings_NeedsReview" ON public."NameMappings" USING btree ("NeedsReview");


--
-- TOC entry 3679 (class 1259 OID 72991)
-- Name: IX_NameMappings_NobiinNormalized; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IX_NameMappings_NobiinNormalized" ON public."NameMappings" USING btree ("NobiinNormalized");


--
-- TOC entry 3680 (class 1259 OID 72994)
-- Name: IX_NameMappings_OrgId; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IX_NameMappings_OrgId" ON public."NameMappings" USING btree ("OrgId");


--
-- TOC entry 3527 (class 1259 OID 72544)
-- Name: IX_OrgUsers_OrgId_UserId; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "IX_OrgUsers_OrgId_UserId" ON public."OrgUsers" USING btree ("OrgId", "UserId");


--
-- TOC entry 3516 (class 1259 OID 72604)
-- Name: IX_Orgs_IsPublic; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IX_Orgs_IsPublic" ON public."Orgs" USING btree ("IsPublic");


--
-- TOC entry 3517 (class 1259 OID 71029)
-- Name: IX_Orgs_Name; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IX_Orgs_Name" ON public."Orgs" USING btree ("Name");


--
-- TOC entry 3518 (class 1259 OID 72603)
-- Name: IX_Orgs_OwnerId; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IX_Orgs_OwnerId" ON public."Orgs" USING btree ("OwnerId");


--
-- TOC entry 3519 (class 1259 OID 72822)
-- Name: IX_Orgs_TownId; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IX_Orgs_TownId" ON public."Orgs" USING btree ("TownId");


--
-- TOC entry 3564 (class 1259 OID 71204)
-- Name: IX_ParentChildren_ChildId; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IX_ParentChildren_ChildId" ON public."ParentChildren" USING btree ("ChildId");


--
-- TOC entry 3565 (class 1259 OID 71203)
-- Name: IX_ParentChildren_ParentId; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IX_ParentChildren_ParentId" ON public."ParentChildren" USING btree ("ParentId");


--
-- TOC entry 3566 (class 1259 OID 71205)
-- Name: IX_ParentChildren_ParentId_ChildId_Type; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "IX_ParentChildren_ParentId_ChildId_Type" ON public."ParentChildren" USING btree ("ParentId", "ChildId", "RelationshipType");


--
-- TOC entry 3534 (class 1259 OID 73041)
-- Name: IX_People_FamilyId; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IX_People_FamilyId" ON public."People" USING btree ("FamilyId");


--
-- TOC entry 3535 (class 1259 OID 71117)
-- Name: IX_People_OrgId; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IX_People_OrgId" ON public."People" USING btree ("OrgId");


--
-- TOC entry 3536 (class 1259 OID 71118)
-- Name: IX_People_PrimaryName; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IX_People_PrimaryName" ON public."People" USING btree ("PrimaryName");


--
-- TOC entry 3537 (class 1259 OID 71119)
-- Name: IX_People_SearchVector; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IX_People_SearchVector" ON public."People" USING gin ("SearchVector");


--
-- TOC entry 3631 (class 1259 OID 72641)
-- Name: IX_PersonLinks_SourcePersonId; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IX_PersonLinks_SourcePersonId" ON public."PersonLinks" USING btree ("SourcePersonId");


--
-- TOC entry 3632 (class 1259 OID 72643)
-- Name: IX_PersonLinks_Status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IX_PersonLinks_Status" ON public."PersonLinks" USING btree ("Status");


--
-- TOC entry 3633 (class 1259 OID 72642)
-- Name: IX_PersonLinks_TargetPersonId; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IX_PersonLinks_TargetPersonId" ON public."PersonLinks" USING btree ("TargetPersonId");


--
-- TOC entry 3651 (class 1259 OID 72722)
-- Name: IX_PersonMediaLinks_MediaId; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IX_PersonMediaLinks_MediaId" ON public."PersonMediaLinks" USING btree ("MediaId");


--
-- TOC entry 3652 (class 1259 OID 72721)
-- Name: IX_PersonMediaLinks_PersonId; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IX_PersonMediaLinks_PersonId" ON public."PersonMediaLinks" USING btree ("PersonId");


--
-- TOC entry 3653 (class 1259 OID 72894)
-- Name: IX_PersonMediaLinks_PersonId_MediaId; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "IX_PersonMediaLinks_PersonId_MediaId" ON public."PersonMediaLinks" USING btree ("PersonId", "MediaId");


--
-- TOC entry 3669 (class 1259 OID 72963)
-- Name: IX_PersonMedia_MediaId; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IX_PersonMedia_MediaId" ON public."PersonMedia" USING btree ("MediaId");


--
-- TOC entry 3670 (class 1259 OID 72962)
-- Name: IX_PersonMedia_PersonId; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IX_PersonMedia_PersonId" ON public."PersonMedia" USING btree ("PersonId");


--
-- TOC entry 3671 (class 1259 OID 72964)
-- Name: IX_PersonMedia_PersonId_MediaId; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "IX_PersonMedia_PersonId_MediaId" ON public."PersonMedia" USING btree ("PersonId", "MediaId");


--
-- TOC entry 3547 (class 1259 OID 71139)
-- Name: IX_PersonNames_Family; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IX_PersonNames_Family" ON public."PersonNames" USING gin ("Family" public.gin_trgm_ops);


--
-- TOC entry 3548 (class 1259 OID 71137)
-- Name: IX_PersonNames_Full; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IX_PersonNames_Full" ON public."PersonNames" USING gin ("Full" public.gin_trgm_ops);


--
-- TOC entry 3549 (class 1259 OID 71138)
-- Name: IX_PersonNames_Given; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IX_PersonNames_Given" ON public."PersonNames" USING gin ("Given" public.gin_trgm_ops);


--
-- TOC entry 3550 (class 1259 OID 71136)
-- Name: IX_PersonNames_PersonId; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IX_PersonNames_PersonId" ON public."PersonNames" USING btree ("PersonId");


--
-- TOC entry 3585 (class 1259 OID 71267)
-- Name: IX_PersonTags_PersonId_TagId; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "IX_PersonTags_PersonId_TagId" ON public."PersonTags" USING btree ("PersonId", "TagId");


--
-- TOC entry 3530 (class 1259 OID 71082)
-- Name: IX_Places_OrgId_Name; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IX_Places_OrgId_Name" ON public."Places" USING btree ("OrgId", "Name");


--
-- TOC entry 3531 (class 1259 OID 71083)
-- Name: IX_Places_ParentId; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IX_Places_ParentId" ON public."Places" USING btree ("ParentId");


--
-- TOC entry 3578 (class 1259 OID 71240)
-- Name: IX_Sources_OrgId; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IX_Sources_OrgId" ON public."Sources" USING btree ("OrgId");


--
-- TOC entry 3579 (class 1259 OID 71241)
-- Name: IX_Sources_Title; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IX_Sources_Title" ON public."Sources" USING btree ("Title");


--
-- TOC entry 3582 (class 1259 OID 71249)
-- Name: IX_Tags_OrgId_Name; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "IX_Tags_OrgId_Name" ON public."Tags" USING btree ("OrgId", "Name");


--
-- TOC entry 3660 (class 1259 OID 72821)
-- Name: IX_Towns_Country; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IX_Towns_Country" ON public."Towns" USING btree ("Country");


--
-- TOC entry 3661 (class 1259 OID 72820)
-- Name: IX_Towns_Name; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IX_Towns_Name" ON public."Towns" USING btree ("Name");


--
-- TOC entry 3644 (class 1259 OID 72696)
-- Name: IX_TreeInvitations_Email; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IX_TreeInvitations_Email" ON public."TreeInvitations" USING btree ("Email");


--
-- TOC entry 3645 (class 1259 OID 72697)
-- Name: IX_TreeInvitations_Token; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IX_TreeInvitations_Token" ON public."TreeInvitations" USING btree ("Token");


--
-- TOC entry 3646 (class 1259 OID 72695)
-- Name: IX_TreeInvitations_TreeId; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IX_TreeInvitations_TreeId" ON public."TreeInvitations" USING btree ("TreeId");


--
-- TOC entry 3559 (class 1259 OID 71182)
-- Name: IX_UnionMembers_UnionId_PersonId; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "IX_UnionMembers_UnionId_PersonId" ON public."UnionMembers" USING btree ("UnionId", "PersonId");


--
-- TOC entry 3556 (class 1259 OID 71163)
-- Name: IX_Unions_OrgId; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IX_Unions_OrgId" ON public."Unions" USING btree ("OrgId");


--
-- TOC entry 3522 (class 1259 OID 71043)
-- Name: IX_Users_Email; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "IX_Users_Email" ON public."Users" USING btree ("Email");


--
-- TOC entry 3595 (class 1259 OID 72476)
-- Name: RoleNameIndex; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "RoleNameIndex" ON public."AspNetRoles" USING btree ("NormalizedName");


--
-- TOC entry 3600 (class 1259 OID 72473)
-- Name: UserNameIndex; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "UserNameIndex" ON public."AspNetUsers" USING btree ("NormalizedUserName");


--
-- TOC entry 3569 (class 1259 OID 106080)
-- Name: idx_parentchild_child; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_parentchild_child ON public."ParentChildren" USING btree ("ChildId");


--
-- TOC entry 3570 (class 1259 OID 106081)
-- Name: idx_parentchild_parent; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_parentchild_parent ON public."ParentChildren" USING btree ("ParentId");


--
-- TOC entry 3540 (class 1259 OID 106087)
-- Name: idx_people_birthdate; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_people_birthdate ON public."People" USING btree ("BirthDate");


--
-- TOC entry 3541 (class 1259 OID 106085)
-- Name: idx_people_family; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_people_family ON public."People" USING btree ("FamilyId");


--
-- TOC entry 3542 (class 1259 OID 106089)
-- Name: idx_people_family_name; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_people_family_name ON public."People" USING btree ("FamilyId", "PrimaryName");


--
-- TOC entry 3543 (class 1259 OID 106084)
-- Name: idx_people_org; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_people_org ON public."People" USING btree ("OrgId");


--
-- TOC entry 3544 (class 1259 OID 106088)
-- Name: idx_people_org_name; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_people_org_name ON public."People" USING btree ("OrgId", "PrimaryName");


--
-- TOC entry 3545 (class 1259 OID 106076)
-- Name: idx_people_primaryname_fts; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_people_primaryname_fts ON public."People" USING gin (to_tsvector('simple'::regconfig, ("PrimaryName")::text));


--
-- TOC entry 3546 (class 1259 OID 106086)
-- Name: idx_people_sex; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_people_sex ON public."People" USING btree ("Sex");


--
-- TOC entry 3553 (class 1259 OID 106077)
-- Name: idx_personnames_fullname_fts; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_personnames_fullname_fts ON public."PersonNames" USING gin (to_tsvector('simple'::regconfig, ("Full")::text));


--
-- TOC entry 3554 (class 1259 OID 106079)
-- Name: idx_personnames_person_script; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_personnames_person_script ON public."PersonNames" USING btree ("PersonId", "Script");


--
-- TOC entry 3555 (class 1259 OID 106078)
-- Name: idx_personnames_script; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_personnames_script ON public."PersonNames" USING btree ("Script");


--
-- TOC entry 3624 (class 1259 OID 72482)
-- Name: idx_refreshtoken_value; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX idx_refreshtoken_value ON public."RefreshToken" USING btree ("Value");


--
-- TOC entry 3596 (class 1259 OID 72477)
-- Name: idx_role_name; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX idx_role_name ON public."AspNetRoles" USING btree ("Name");


--
-- TOC entry 3630 (class 1259 OID 72484)
-- Name: idx_signertoken_value; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_signertoken_value ON public."SignerToken" USING btree ("Value");


--
-- TOC entry 3562 (class 1259 OID 106082)
-- Name: idx_unionmembers_person; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_unionmembers_person ON public."UnionMembers" USING btree ("PersonId");


--
-- TOC entry 3563 (class 1259 OID 106083)
-- Name: idx_unionmembers_union; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_unionmembers_union ON public."UnionMembers" USING btree ("UnionId");


--
-- TOC entry 3601 (class 1259 OID 72474)
-- Name: idx_user_email; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX idx_user_email ON public."AspNetUsers" USING btree ("Email");


--
-- TOC entry 3602 (class 1259 OID 72475)
-- Name: idx_user_username; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX idx_user_username ON public."AspNetUsers" USING btree ("UserName");


--
-- TOC entry 3603 (class 1259 OID 72966)
-- Name: idx_users_preferred_language; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_users_preferred_language ON public."AspNetUsers" USING btree ("PreferredLanguage");


--
-- TOC entry 3625 (class 1259 OID 72483)
-- Name: refreshtoken_userid_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX refreshtoken_userid_idx ON public."RefreshToken" USING btree ("UserId");


--
-- TOC entry 3733 (class 2606 OID 72663)
-- Name: AdminTreeAssignments AdminTreeAssignments_AssignedByUserId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."AdminTreeAssignments"
    ADD CONSTRAINT "AdminTreeAssignments_AssignedByUserId_fkey" FOREIGN KEY ("AssignedByUserId") REFERENCES public."AspNetUsers"("Id") ON DELETE SET NULL;


--
-- TOC entry 3734 (class 2606 OID 72658)
-- Name: AdminTreeAssignments AdminTreeAssignments_TreeId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."AdminTreeAssignments"
    ADD CONSTRAINT "AdminTreeAssignments_TreeId_fkey" FOREIGN KEY ("TreeId") REFERENCES public."Orgs"("Id") ON DELETE CASCADE;


--
-- TOC entry 3735 (class 2606 OID 72653)
-- Name: AdminTreeAssignments AdminTreeAssignments_UserId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."AdminTreeAssignments"
    ADD CONSTRAINT "AdminTreeAssignments_UserId_fkey" FOREIGN KEY ("UserId") REFERENCES public."AspNetUsers"("Id") ON DELETE CASCADE;


--
-- TOC entry 3749 (class 2606 OID 73067)
-- Name: AdminTownAssignments FK_AdminTownAssignments_AssignedBy; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."AdminTownAssignments"
    ADD CONSTRAINT "FK_AdminTownAssignments_AssignedBy" FOREIGN KEY ("AssignedByUserId") REFERENCES public."AspNetUsers"("Id") ON DELETE SET NULL;


--
-- TOC entry 3750 (class 2606 OID 73062)
-- Name: AdminTownAssignments FK_AdminTownAssignments_Town; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."AdminTownAssignments"
    ADD CONSTRAINT "FK_AdminTownAssignments_Town" FOREIGN KEY ("TownId") REFERENCES public."Towns"("Id") ON DELETE CASCADE;


--
-- TOC entry 3751 (class 2606 OID 73057)
-- Name: AdminTownAssignments FK_AdminTownAssignments_User; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."AdminTownAssignments"
    ADD CONSTRAINT "FK_AdminTownAssignments_User" FOREIGN KEY ("UserId") REFERENCES public."AspNetUsers"("Id") ON DELETE CASCADE;


--
-- TOC entry 3727 (class 2606 OID 72515)
-- Name: AspNetUserBearerToken FK_AspNetBearerToken_RefreshToken; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."AspNetUserBearerToken"
    ADD CONSTRAINT "FK_AspNetBearerToken_RefreshToken" FOREIGN KEY ("RefreshTokenId") REFERENCES public."RefreshToken"("Id");


--
-- TOC entry 3721 (class 2606 OID 72485)
-- Name: AspNetRoleClaims FK_AspNetRoleClaims_AspNetRoles_RoleId; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."AspNetRoleClaims"
    ADD CONSTRAINT "FK_AspNetRoleClaims_AspNetRoles_RoleId" FOREIGN KEY ("RoleId") REFERENCES public."AspNetRoles"("Id") ON DELETE CASCADE;


--
-- TOC entry 3722 (class 2606 OID 72490)
-- Name: AspNetUserClaims FK_AspNetUserClaims_AspNetUsers_UserId; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."AspNetUserClaims"
    ADD CONSTRAINT "FK_AspNetUserClaims_AspNetUsers_UserId" FOREIGN KEY ("UserId") REFERENCES public."AspNetUsers"("Id") ON DELETE CASCADE;


--
-- TOC entry 3723 (class 2606 OID 72495)
-- Name: AspNetUserLogins FK_AspNetUserLogins_AspNetUsers_UserId; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."AspNetUserLogins"
    ADD CONSTRAINT "FK_AspNetUserLogins_AspNetUsers_UserId" FOREIGN KEY ("UserId") REFERENCES public."AspNetUsers"("Id") ON DELETE CASCADE;


--
-- TOC entry 3724 (class 2606 OID 72500)
-- Name: AspNetUserRoles FK_AspNetUserRoles_AspNetRoles_RoleId; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."AspNetUserRoles"
    ADD CONSTRAINT "FK_AspNetUserRoles_AspNetRoles_RoleId" FOREIGN KEY ("RoleId") REFERENCES public."AspNetRoles"("Id") ON DELETE CASCADE;


--
-- TOC entry 3725 (class 2606 OID 72505)
-- Name: AspNetUserRoles FK_AspNetUserRoles_AspNetUsers_UserId; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."AspNetUserRoles"
    ADD CONSTRAINT "FK_AspNetUserRoles_AspNetUsers_UserId" FOREIGN KEY ("UserId") REFERENCES public."AspNetUsers"("Id") ON DELETE CASCADE;


--
-- TOC entry 3726 (class 2606 OID 72510)
-- Name: AspNetUserTokens FK_AspNetUserTokens_AspNetUsers_UserId; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."AspNetUserTokens"
    ADD CONSTRAINT "FK_AspNetUserTokens_AspNetUsers_UserId" FOREIGN KEY ("UserId") REFERENCES public."AspNetUsers"("Id") ON DELETE CASCADE;


--
-- TOC entry 3720 (class 2606 OID 71277)
-- Name: AuditLogs FK_AuditLogs_Actor; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."AuditLogs"
    ADD CONSTRAINT "FK_AuditLogs_Actor" FOREIGN KEY ("ActorId") REFERENCES public."Users"("Id") ON DELETE RESTRICT;


--
-- TOC entry 3745 (class 2606 OID 73012)
-- Name: Families FK_Families_Orgs_OrgId; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Families"
    ADD CONSTRAINT "FK_Families_Orgs_OrgId" FOREIGN KEY ("OrgId") REFERENCES public."Orgs"("Id") ON DELETE CASCADE;


--
-- TOC entry 3746 (class 2606 OID 73032)
-- Name: Families FK_Families_People_MatriarchId; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Families"
    ADD CONSTRAINT "FK_Families_People_MatriarchId" FOREIGN KEY ("MatriarchId") REFERENCES public."People"("Id") ON DELETE SET NULL;


--
-- TOC entry 3747 (class 2606 OID 73027)
-- Name: Families FK_Families_People_PatriarchId; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Families"
    ADD CONSTRAINT "FK_Families_People_PatriarchId" FOREIGN KEY ("PatriarchId") REFERENCES public."People"("Id") ON DELETE SET NULL;


--
-- TOC entry 3748 (class 2606 OID 73017)
-- Name: Families FK_Families_Towns_TownId; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Families"
    ADD CONSTRAINT "FK_Families_Towns_TownId" FOREIGN KEY ("TownId") REFERENCES public."Towns"("Id") ON DELETE RESTRICT;


--
-- TOC entry 3714 (class 2606 OID 71223)
-- Name: MediaFiles FK_MediaFiles_CapturePlace; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."MediaFiles"
    ADD CONSTRAINT "FK_MediaFiles_CapturePlace" FOREIGN KEY ("CapturePlaceId") REFERENCES public."Places"("Id") ON DELETE SET NULL;


--
-- TOC entry 3715 (class 2606 OID 71218)
-- Name: MediaFiles FK_MediaFiles_Orgs; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."MediaFiles"
    ADD CONSTRAINT "FK_MediaFiles_Orgs" FOREIGN KEY ("OrgId") REFERENCES public."Orgs"("Id") ON DELETE CASCADE;


--
-- TOC entry 3716 (class 2606 OID 72888)
-- Name: MediaFiles FK_MediaFiles_Person; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."MediaFiles"
    ADD CONSTRAINT "FK_MediaFiles_Person" FOREIGN KEY ("PersonId") REFERENCES public."People"("Id") ON DELETE SET NULL;


--
-- TOC entry 3699 (class 2606 OID 72550)
-- Name: OrgUsers FK_OrgUsers_AspNetUsers_UserId; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."OrgUsers"
    ADD CONSTRAINT "FK_OrgUsers_AspNetUsers_UserId" FOREIGN KEY ("UserId") REFERENCES public."AspNetUsers"("Id") ON DELETE CASCADE;


--
-- TOC entry 3700 (class 2606 OID 71052)
-- Name: OrgUsers FK_OrgUsers_Orgs; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."OrgUsers"
    ADD CONSTRAINT "FK_OrgUsers_Orgs" FOREIGN KEY ("OrgId") REFERENCES public."Orgs"("Id") ON DELETE CASCADE;


--
-- TOC entry 3697 (class 2606 OID 73042)
-- Name: Orgs FK_Orgs_Towns_TownId; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Orgs"
    ADD CONSTRAINT "FK_Orgs_Towns_TownId" FOREIGN KEY ("TownId") REFERENCES public."Towns"("Id") ON DELETE RESTRICT;


--
-- TOC entry 3712 (class 2606 OID 71198)
-- Name: ParentChildren FK_ParentChildren_Child; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."ParentChildren"
    ADD CONSTRAINT "FK_ParentChildren_Child" FOREIGN KEY ("ChildId") REFERENCES public."People"("Id") ON DELETE RESTRICT;


--
-- TOC entry 3713 (class 2606 OID 71193)
-- Name: ParentChildren FK_ParentChildren_Parent; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."ParentChildren"
    ADD CONSTRAINT "FK_ParentChildren_Parent" FOREIGN KEY ("ParentId") REFERENCES public."People"("Id") ON DELETE RESTRICT;


--
-- TOC entry 3703 (class 2606 OID 71107)
-- Name: People FK_People_BirthPlace; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."People"
    ADD CONSTRAINT "FK_People_BirthPlace" FOREIGN KEY ("BirthPlaceId") REFERENCES public."Places"("Id") ON DELETE SET NULL;


--
-- TOC entry 3704 (class 2606 OID 71112)
-- Name: People FK_People_DeathPlace; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."People"
    ADD CONSTRAINT "FK_People_DeathPlace" FOREIGN KEY ("DeathPlaceId") REFERENCES public."Places"("Id") ON DELETE SET NULL;


--
-- TOC entry 3705 (class 2606 OID 73022)
-- Name: People FK_People_Families_FamilyId; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."People"
    ADD CONSTRAINT "FK_People_Families_FamilyId" FOREIGN KEY ("FamilyId") REFERENCES public."Families"("Id") ON DELETE SET NULL;


--
-- TOC entry 3706 (class 2606 OID 71102)
-- Name: People FK_People_Orgs; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."People"
    ADD CONSTRAINT "FK_People_Orgs" FOREIGN KEY ("OrgId") REFERENCES public."Orgs"("Id") ON DELETE CASCADE;


--
-- TOC entry 3741 (class 2606 OID 72957)
-- Name: PersonMedia FK_PersonMedia_MediaFiles_MediaId; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."PersonMedia"
    ADD CONSTRAINT "FK_PersonMedia_MediaFiles_MediaId" FOREIGN KEY ("MediaId") REFERENCES public."MediaFiles"("Id") ON DELETE CASCADE;


--
-- TOC entry 3742 (class 2606 OID 72952)
-- Name: PersonMedia FK_PersonMedia_People_PersonId; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."PersonMedia"
    ADD CONSTRAINT "FK_PersonMedia_People_PersonId" FOREIGN KEY ("PersonId") REFERENCES public."People"("Id") ON DELETE CASCADE;


--
-- TOC entry 3707 (class 2606 OID 71131)
-- Name: PersonNames FK_PersonNames_People; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."PersonNames"
    ADD CONSTRAINT "FK_PersonNames_People" FOREIGN KEY ("PersonId") REFERENCES public."People"("Id") ON DELETE CASCADE;


--
-- TOC entry 3718 (class 2606 OID 71257)
-- Name: PersonTags FK_PersonTags_People; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."PersonTags"
    ADD CONSTRAINT "FK_PersonTags_People" FOREIGN KEY ("PersonId") REFERENCES public."People"("Id") ON DELETE CASCADE;


--
-- TOC entry 3719 (class 2606 OID 71262)
-- Name: PersonTags FK_PersonTags_Tags; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."PersonTags"
    ADD CONSTRAINT "FK_PersonTags_Tags" FOREIGN KEY ("TagId") REFERENCES public."Tags"("Id") ON DELETE CASCADE;


--
-- TOC entry 3701 (class 2606 OID 71072)
-- Name: Places FK_Places_Orgs; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Places"
    ADD CONSTRAINT "FK_Places_Orgs" FOREIGN KEY ("OrgId") REFERENCES public."Orgs"("Id") ON DELETE CASCADE;


--
-- TOC entry 3702 (class 2606 OID 71077)
-- Name: Places FK_Places_ParentPlace; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Places"
    ADD CONSTRAINT "FK_Places_ParentPlace" FOREIGN KEY ("ParentId") REFERENCES public."Places"("Id") ON DELETE RESTRICT;


--
-- TOC entry 3710 (class 2606 OID 71177)
-- Name: UnionMembers FK_UnionMembers_People; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."UnionMembers"
    ADD CONSTRAINT "FK_UnionMembers_People" FOREIGN KEY ("PersonId") REFERENCES public."People"("Id") ON DELETE CASCADE;


--
-- TOC entry 3711 (class 2606 OID 71172)
-- Name: UnionMembers FK_UnionMembers_Unions; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."UnionMembers"
    ADD CONSTRAINT "FK_UnionMembers_Unions" FOREIGN KEY ("UnionId") REFERENCES public."Unions"("Id") ON DELETE CASCADE;


--
-- TOC entry 3708 (class 2606 OID 71158)
-- Name: Unions FK_Unions_EndPlace; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Unions"
    ADD CONSTRAINT "FK_Unions_EndPlace" FOREIGN KEY ("EndPlaceId") REFERENCES public."Places"("Id") ON DELETE SET NULL;


--
-- TOC entry 3709 (class 2606 OID 71153)
-- Name: Unions FK_Unions_StartPlace; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Unions"
    ADD CONSTRAINT "FK_Unions_StartPlace" FOREIGN KEY ("StartPlaceId") REFERENCES public."Places"("Id") ON DELETE SET NULL;


--
-- TOC entry 3728 (class 2606 OID 72520)
-- Name: AspNetUserBearerToken Fk_AspNetUserBearerToken_AspNetUsers; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."AspNetUserBearerToken"
    ADD CONSTRAINT "Fk_AspNetUserBearerToken_AspNetUsers" FOREIGN KEY ("UserId") REFERENCES public."AspNetUsers"("Id");


--
-- TOC entry 3717 (class 2606 OID 72723)
-- Name: MediaFiles MediaFiles_UploadedByUserId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."MediaFiles"
    ADD CONSTRAINT "MediaFiles_UploadedByUserId_fkey" FOREIGN KEY ("UploadedByUserId") REFERENCES public."AspNetUsers"("Id") ON DELETE SET NULL;


--
-- TOC entry 3743 (class 2606 OID 72979)
-- Name: NameMappings NameMappings_ConfirmedByUserId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."NameMappings"
    ADD CONSTRAINT "NameMappings_ConfirmedByUserId_fkey" FOREIGN KEY ("ConfirmedByUserId") REFERENCES public."AspNetUsers"("Id") ON DELETE SET NULL;


--
-- TOC entry 3744 (class 2606 OID 72984)
-- Name: NameMappings NameMappings_OrgId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."NameMappings"
    ADD CONSTRAINT "NameMappings_OrgId_fkey" FOREIGN KEY ("OrgId") REFERENCES public."Orgs"("Id") ON DELETE SET NULL;


--
-- TOC entry 3698 (class 2606 OID 72598)
-- Name: Orgs Orgs_OwnerId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Orgs"
    ADD CONSTRAINT "Orgs_OwnerId_fkey" FOREIGN KEY ("OwnerId") REFERENCES public."AspNetUsers"("Id") ON DELETE SET NULL;


--
-- TOC entry 3729 (class 2606 OID 72636)
-- Name: PersonLinks PersonLinks_ApprovedByUserId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."PersonLinks"
    ADD CONSTRAINT "PersonLinks_ApprovedByUserId_fkey" FOREIGN KEY ("ApprovedByUserId") REFERENCES public."AspNetUsers"("Id") ON DELETE SET NULL;


--
-- TOC entry 3730 (class 2606 OID 72631)
-- Name: PersonLinks PersonLinks_CreatedByUserId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."PersonLinks"
    ADD CONSTRAINT "PersonLinks_CreatedByUserId_fkey" FOREIGN KEY ("CreatedByUserId") REFERENCES public."AspNetUsers"("Id") ON DELETE SET NULL;


--
-- TOC entry 3731 (class 2606 OID 72621)
-- Name: PersonLinks PersonLinks_SourcePersonId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."PersonLinks"
    ADD CONSTRAINT "PersonLinks_SourcePersonId_fkey" FOREIGN KEY ("SourcePersonId") REFERENCES public."People"("Id") ON DELETE CASCADE;


--
-- TOC entry 3732 (class 2606 OID 72626)
-- Name: PersonLinks PersonLinks_TargetPersonId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."PersonLinks"
    ADD CONSTRAINT "PersonLinks_TargetPersonId_fkey" FOREIGN KEY ("TargetPersonId") REFERENCES public."People"("Id") ON DELETE CASCADE;


--
-- TOC entry 3739 (class 2606 OID 72716)
-- Name: PersonMediaLinks PersonMedia_MediaId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."PersonMediaLinks"
    ADD CONSTRAINT "PersonMedia_MediaId_fkey" FOREIGN KEY ("MediaId") REFERENCES public."MediaFiles"("Id") ON DELETE CASCADE;


--
-- TOC entry 3740 (class 2606 OID 72711)
-- Name: PersonMediaLinks PersonMedia_PersonId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."PersonMediaLinks"
    ADD CONSTRAINT "PersonMedia_PersonId_fkey" FOREIGN KEY ("PersonId") REFERENCES public."People"("Id") ON DELETE CASCADE;


--
-- TOC entry 3736 (class 2606 OID 72690)
-- Name: TreeInvitations TreeInvitations_AcceptedByUserId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."TreeInvitations"
    ADD CONSTRAINT "TreeInvitations_AcceptedByUserId_fkey" FOREIGN KEY ("AcceptedByUserId") REFERENCES public."AspNetUsers"("Id") ON DELETE SET NULL;


--
-- TOC entry 3737 (class 2606 OID 72685)
-- Name: TreeInvitations TreeInvitations_InvitedByUserId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."TreeInvitations"
    ADD CONSTRAINT "TreeInvitations_InvitedByUserId_fkey" FOREIGN KEY ("InvitedByUserId") REFERENCES public."AspNetUsers"("Id") ON DELETE CASCADE;


--
-- TOC entry 3738 (class 2606 OID 72680)
-- Name: TreeInvitations TreeInvitations_TreeId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."TreeInvitations"
    ADD CONSTRAINT "TreeInvitations_TreeId_fkey" FOREIGN KEY ("TreeId") REFERENCES public."Orgs"("Id") ON DELETE CASCADE;


-- Completed on 2026-01-05 13:30:12

--
-- PostgreSQL database dump complete
--

