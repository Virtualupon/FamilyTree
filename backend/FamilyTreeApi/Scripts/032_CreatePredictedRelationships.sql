-- Migration: 032_CreatePredictedRelationships
-- Description: Create the PredictedRelationships table for the relationship prediction engine.
--   Stores system-generated predictions for missing relationships that admins can review/accept/dismiss.
--   Separate from RelationshipSuggestions (which is for user-submitted suggestions) to avoid
--   unique index conflicts, lifecycle mismatches, and admin queue pollution.

-- =============================================================================
-- PREDICTED RELATIONSHIPS TABLE
-- =============================================================================
CREATE TABLE IF NOT EXISTS "PredictedRelationships" (
    "Id"                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "TreeId"                uuid NOT NULL REFERENCES "Orgs"("Id") ON DELETE CASCADE,

    -- Which rule generated this prediction
    "RuleId"                varchar(50) NOT NULL,       -- e.g. 'spouse_child_gap', 'missing_union', 'sibling_parent_gap', 'patronymic_name', 'age_family'

    -- What relationship is being predicted
    "PredictedType"         varchar(30) NOT NULL,       -- 'parent_child', 'union'
    "SourcePersonId"        uuid NOT NULL REFERENCES "People"("Id") ON DELETE CASCADE,
    "TargetPersonId"        uuid NOT NULL REFERENCES "People"("Id") ON DELETE CASCADE,

    -- Confidence scoring
    "Confidence"            decimal(5,2) NOT NULL,      -- 0.00-100.00 (numeric precision)
    "ConfidenceLevel"       varchar(20) NOT NULL,       -- 'High' (>=85), 'Medium' (60-84), 'Low' (<60)

    -- Human-readable explanation of why this was predicted
    "Explanation"           text NOT NULL,

    -- Lifecycle management
    "Status"                integer NOT NULL DEFAULT 0,  -- 0=New, 1=Confirmed, 2=Dismissed, 3=Applied
    "ResolvedByUserId"      bigint REFERENCES "AspNetUsers"("Id") ON DELETE SET NULL,
    "ResolvedAt"            timestamp with time zone,
    "DismissReason"         varchar(500),

    -- When accepted, track what was created
    "AppliedEntityType"     varchar(50),                -- 'ParentChild' or 'Union'
    "AppliedEntityId"       uuid,                       -- The ParentChild.Id or Union.Id created

    -- Metadata
    "CreatedAt"             timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ScanBatchId"           uuid,                       -- Groups predictions from the same scan run

    -- Prevent duplicate predictions for the same pair+type
    CONSTRAINT "UQ_Prediction_Pair" UNIQUE ("TreeId", "SourcePersonId", "TargetPersonId", "PredictedType")
);

-- =============================================================================
-- INDEXES
-- =============================================================================

-- Primary query pattern: get predictions for a tree filtered by status
CREATE INDEX IF NOT EXISTS "IX_PredictedRelationships_TreeStatus"
    ON "PredictedRelationships" ("TreeId", "Status");

-- Sort by confidence for "accept all high" batch operations
CREATE INDEX IF NOT EXISTS "IX_PredictedRelationships_Confidence"
    ON "PredictedRelationships" ("Confidence" DESC);

-- Group predictions by scan batch
CREATE INDEX IF NOT EXISTS "IX_PredictedRelationships_ScanBatch"
    ON "PredictedRelationships" ("ScanBatchId")
    WHERE "ScanBatchId" IS NOT NULL;

-- Person-based lookups: find predictions about a specific person
CREATE INDEX IF NOT EXISTS "IX_PredictedRelationships_SourcePerson"
    ON "PredictedRelationships" ("SourcePersonId");

CREATE INDEX IF NOT EXISTS "IX_PredictedRelationships_TargetPerson"
    ON "PredictedRelationships" ("TargetPersonId");

-- Partial index for pending (new) predictions only
CREATE INDEX IF NOT EXISTS "IX_PredictedRelationships_NewOnly"
    ON "PredictedRelationships" ("TreeId", "ConfidenceLevel", "CreatedAt" DESC)
    WHERE "Status" = 0;

-- =============================================================================
-- ENUM COMMENTS
-- =============================================================================
COMMENT ON COLUMN "PredictedRelationships"."Status" IS '0=New, 1=Confirmed, 2=Dismissed, 3=Applied';
COMMENT ON COLUMN "PredictedRelationships"."RuleId" IS 'spouse_child_gap | missing_union | sibling_parent_gap | patronymic_name | age_family';
COMMENT ON COLUMN "PredictedRelationships"."PredictedType" IS 'parent_child | union';
COMMENT ON COLUMN "PredictedRelationships"."ConfidenceLevel" IS 'High (>=85) | Medium (60-84) | Low (<60)';
