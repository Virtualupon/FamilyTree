-- ============================================================================
-- Migration: Create Helper Views for Suggestion Management
-- Date: 2026-01-17
-- Description: Creates views and functions for suggestion queue management
--              and statistics
-- ============================================================================

-- ============================================================================
-- VIEW: vw_pending_suggestions_by_town
-- Aggregates pending suggestion counts by town for admin dashboard
-- ============================================================================

CREATE OR REPLACE VIEW "vw_pending_suggestions_by_town" AS
SELECT
    t."Id" AS "TownId",
    t."Name" AS "TownName",
    t."NameEn" AS "TownNameEn",
    t."NameAr" AS "TownNameAr",
    COUNT(rs."Id") AS "PendingCount",
    MIN(rs."CreatedAt") AS "OldestPendingAt"
FROM "Towns" t
LEFT JOIN "RelationshipSuggestions" rs
    ON rs."TownId" = t."Id"
    AND rs."Status" = 0  -- Pending
    AND rs."IsDeleted" = FALSE
GROUP BY t."Id", t."Name", t."NameEn", t."NameAr";

COMMENT ON VIEW "vw_pending_suggestions_by_town" IS
    'Aggregates pending suggestion counts by town for admin dashboard';

-- ============================================================================
-- VIEW: vw_suggestion_queue
-- Detailed view for the admin suggestion queue with joined data
-- ============================================================================

CREATE OR REPLACE VIEW "vw_suggestion_queue" AS
SELECT
    rs."Id",
    rs."Type",
    rs."Status",
    rs."Confidence",
    rs."CreatedAt",
    rs."SubmittedAt",
    rs."SubmitterNotes",

    -- Town info
    rs."TownId",
    t."Name" AS "TownName",
    t."NameEn" AS "TownNameEn",
    t."NameAr" AS "TownNameAr",

    -- Tree info
    rs."TreeId",
    o."Name" AS "TreeName",

    -- Target person info
    rs."TargetPersonId",
    COALESCE(tp."NameArabic", tp."NameEnglish", tp."PrimaryName") AS "TargetPersonName",

    -- Secondary person info (for merge suggestions)
    rs."SecondaryPersonId",
    COALESCE(sp."NameArabic", sp."NameEnglish", sp."PrimaryName") AS "SecondaryPersonName",

    -- Submitter info
    rs."SubmittedByUserId",
    CONCAT(su."FirstName", ' ', su."LastName") AS "SubmitterName",
    su."Email" AS "SubmitterEmail",

    -- Counts
    (SELECT COUNT(*) FROM "SuggestionEvidence" se WHERE se."SuggestionId" = rs."Id") AS "EvidenceCount",
    (SELECT COUNT(*) FROM "SuggestionComments" sc WHERE sc."SuggestionId" = rs."Id") AS "CommentCount"

FROM "RelationshipSuggestions" rs
INNER JOIN "Towns" t ON t."Id" = rs."TownId"
INNER JOIN "Orgs" o ON o."Id" = rs."TreeId"
INNER JOIN "AspNetUsers" su ON su."Id" = rs."SubmittedByUserId"
LEFT JOIN "People" tp ON tp."Id" = rs."TargetPersonId"
LEFT JOIN "People" sp ON sp."Id" = rs."SecondaryPersonId"
WHERE rs."IsDeleted" = FALSE;

COMMENT ON VIEW "vw_suggestion_queue" IS
    'Detailed suggestion view with joined data for admin queue display';

-- ============================================================================
-- FUNCTION: fn_get_suggestion_statistics
-- Returns suggestion statistics for a given scope
-- ============================================================================

CREATE OR REPLACE FUNCTION fn_get_suggestion_statistics(
    p_town_id uuid DEFAULT NULL,
    p_tree_id uuid DEFAULT NULL,
    p_user_id bigint DEFAULT NULL
)
RETURNS TABLE (
    total_count bigint,
    pending_count bigint,
    approved_count bigint,
    rejected_count bigint,
    needs_info_count bigint,
    withdrawn_count bigint,
    avg_review_time_hours numeric,
    oldest_pending_days integer
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        COUNT(*)::bigint AS total_count,
        COUNT(*) FILTER (WHERE rs."Status" = 0)::bigint AS pending_count,
        COUNT(*) FILTER (WHERE rs."Status" = 1)::bigint AS approved_count,
        COUNT(*) FILTER (WHERE rs."Status" = 2)::bigint AS rejected_count,
        COUNT(*) FILTER (WHERE rs."Status" = 3)::bigint AS needs_info_count,
        COUNT(*) FILTER (WHERE rs."Status" = 4)::bigint AS withdrawn_count,
        ROUND(AVG(
            CASE WHEN rs."ReviewedAt" IS NOT NULL
                THEN EXTRACT(EPOCH FROM (rs."ReviewedAt" - rs."SubmittedAt")) / 3600
                ELSE NULL
            END
        )::numeric, 2) AS avg_review_time_hours,
        COALESCE(
            EXTRACT(DAY FROM (NOW() - MIN(rs."CreatedAt") FILTER (WHERE rs."Status" = 0)))::integer,
            0
        ) AS oldest_pending_days
    FROM "RelationshipSuggestions" rs
    WHERE rs."IsDeleted" = FALSE
        AND (p_town_id IS NULL OR rs."TownId" = p_town_id)
        AND (p_tree_id IS NULL OR rs."TreeId" = p_tree_id)
        AND (p_user_id IS NULL OR rs."SubmittedByUserId" = p_user_id);
END;
$$;

COMMENT ON FUNCTION fn_get_suggestion_statistics IS
    'Returns suggestion statistics for a given scope (town, tree, or user)';

-- ============================================================================
-- FUNCTION: fn_check_duplicate_suggestion
-- Checks if a similar pending suggestion already exists
-- ============================================================================

CREATE OR REPLACE FUNCTION fn_check_duplicate_suggestion(
    p_tree_id uuid,
    p_type integer,
    p_target_person_id uuid,
    p_secondary_person_id uuid DEFAULT NULL
)
RETURNS TABLE (
    suggestion_id uuid,
    submitted_at timestamp with time zone,
    submitter_name text
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        rs."Id" AS suggestion_id,
        rs."SubmittedAt" AS submitted_at,
        CONCAT(u."FirstName", ' ', u."LastName")::text AS submitter_name
    FROM "RelationshipSuggestions" rs
    INNER JOIN "AspNetUsers" u ON u."Id" = rs."SubmittedByUserId"
    WHERE rs."TreeId" = p_tree_id
        AND rs."Type" = p_type
        AND rs."Status" = 0  -- Pending only
        AND rs."IsDeleted" = FALSE
        AND (
            (p_target_person_id IS NULL AND rs."TargetPersonId" IS NULL)
            OR rs."TargetPersonId" = p_target_person_id
        )
        AND (
            (p_secondary_person_id IS NULL AND rs."SecondaryPersonId" IS NULL)
            OR rs."SecondaryPersonId" = p_secondary_person_id
        )
    LIMIT 1;
END;
$$;

COMMENT ON FUNCTION fn_check_duplicate_suggestion IS
    'Checks if a similar pending suggestion already exists to prevent duplicates';

-- ============================================================================
-- TRIGGER: tr_suggestion_updated_at
-- Automatically updates UpdatedAt timestamp on modification
-- ============================================================================

CREATE OR REPLACE FUNCTION fn_update_suggestion_timestamp()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW."UpdatedAt" = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_suggestion_updated_at ON "RelationshipSuggestions";

CREATE TRIGGER tr_suggestion_updated_at
    BEFORE UPDATE ON "RelationshipSuggestions"
    FOR EACH ROW
    EXECUTE FUNCTION fn_update_suggestion_timestamp();

COMMENT ON TRIGGER tr_suggestion_updated_at ON "RelationshipSuggestions" IS
    'Automatically updates UpdatedAt timestamp when suggestion is modified';
