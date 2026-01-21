-- ============================================================================
-- Migration: Create Suggestion Tables for Governance Model
-- Date: 2026-01-17
-- Description: Creates RelationshipSuggestions, SuggestionEvidence, and
--              SuggestionComments tables for the viewer governance workflow
-- ============================================================================

-- ============================================================================
-- TABLE: RelationshipSuggestions
-- Main table for storing structured relationship suggestions from viewers
-- ============================================================================

CREATE TABLE IF NOT EXISTS "RelationshipSuggestions" (
    -- Primary Key
    "Id" uuid DEFAULT gen_random_uuid() NOT NULL,

    -- Scope (which town and tree this suggestion belongs to)
    "TownId" uuid NOT NULL,
    "TreeId" uuid NOT NULL,

    -- Suggestion Type (enum stored as int)
    -- 0=AddPerson, 1=UpdatePerson, 2=AddParent, 3=AddChild,
    -- 4=AddSpouse, 5=RemoveRelationship, 6=MergePerson, 7=SplitPerson
    "Type" integer NOT NULL,

    -- Target entities (what the suggestion relates to)
    "TargetPersonId" uuid,
    "SecondaryPersonId" uuid,
    "TargetUnionId" uuid,

    -- Proposed values (structured data for the suggestion)
    "ProposedValuesJson" jsonb NOT NULL DEFAULT '{}',

    -- Relationship-specific fields
    -- RelationshipType: 0=Biological, 1=Adoptive, 2=Step, 3=Foster, 4=Guardian
    "RelationshipType" integer,
    -- UnionType: 0=Marriage, 1=CivilUnion, 2=Partnership, 3=CommonLaw
    "UnionType" integer,
    -- Confidence: 0=Certain, 1=Probable, 2=Possible, 3=Uncertain
    "Confidence" integer NOT NULL DEFAULT 1,

    -- Status workflow
    -- 0=Pending, 1=Approved, 2=Rejected, 3=NeedsInfo, 4=Withdrawn
    "Status" integer NOT NULL DEFAULT 0,
    "StatusReason" varchar(500),

    -- Submitter information
    "SubmittedByUserId" bigint NOT NULL,
    "SubmittedAt" timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "SubmitterNotes" varchar(1000),

    -- Reviewer information
    "ReviewedByUserId" bigint,
    "ReviewedAt" timestamp with time zone,
    "ReviewerNotes" varchar(1000),

    -- Applied change tracking (for approved suggestions)
    "AppliedEntityType" varchar(50),
    "AppliedEntityId" uuid,
    "PreviousValuesJson" jsonb,

    -- Soft delete
    "IsDeleted" boolean NOT NULL DEFAULT FALSE,
    "DeletedAt" timestamp with time zone,
    "DeletedByUserId" bigint,

    -- Timestamps
    "CreatedAt" timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "UpdatedAt" timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- Constraints
    CONSTRAINT "PK_RelationshipSuggestions" PRIMARY KEY ("Id"),

    CONSTRAINT "FK_RelationshipSuggestions_Town" FOREIGN KEY ("TownId")
        REFERENCES "Towns"("Id") ON DELETE RESTRICT,

    CONSTRAINT "FK_RelationshipSuggestions_Tree" FOREIGN KEY ("TreeId")
        REFERENCES "Orgs"("Id") ON DELETE RESTRICT,

    CONSTRAINT "FK_RelationshipSuggestions_TargetPerson" FOREIGN KEY ("TargetPersonId")
        REFERENCES "People"("Id") ON DELETE SET NULL,

    CONSTRAINT "FK_RelationshipSuggestions_SecondaryPerson" FOREIGN KEY ("SecondaryPersonId")
        REFERENCES "People"("Id") ON DELETE SET NULL,

    CONSTRAINT "FK_RelationshipSuggestions_TargetUnion" FOREIGN KEY ("TargetUnionId")
        REFERENCES "Unions"("Id") ON DELETE SET NULL,

    CONSTRAINT "FK_RelationshipSuggestions_SubmittedBy" FOREIGN KEY ("SubmittedByUserId")
        REFERENCES "AspNetUsers"("Id") ON DELETE RESTRICT,

    CONSTRAINT "FK_RelationshipSuggestions_ReviewedBy" FOREIGN KEY ("ReviewedByUserId")
        REFERENCES "AspNetUsers"("Id") ON DELETE SET NULL,

    CONSTRAINT "FK_RelationshipSuggestions_DeletedBy" FOREIGN KEY ("DeletedByUserId")
        REFERENCES "AspNetUsers"("Id") ON DELETE SET NULL,

    -- Validate Type enum
    CONSTRAINT "CK_RelationshipSuggestions_Type" CHECK ("Type" >= 0 AND "Type" <= 7),

    -- Validate Status enum
    CONSTRAINT "CK_RelationshipSuggestions_Status" CHECK ("Status" >= 0 AND "Status" <= 4),

    -- Validate Confidence enum
    CONSTRAINT "CK_RelationshipSuggestions_Confidence" CHECK ("Confidence" >= 0 AND "Confidence" <= 3)
);

-- ============================================================================
-- INDEXES for RelationshipSuggestions
-- ============================================================================

-- Index for filtering by town
CREATE INDEX IF NOT EXISTS "IX_RelationshipSuggestions_TownId"
    ON "RelationshipSuggestions" ("TownId");

-- Index for filtering by tree
CREATE INDEX IF NOT EXISTS "IX_RelationshipSuggestions_TreeId"
    ON "RelationshipSuggestions" ("TreeId");

-- Index for filtering by status (most common query - pending suggestions)
CREATE INDEX IF NOT EXISTS "IX_RelationshipSuggestions_Status"
    ON "RelationshipSuggestions" ("Status")
    WHERE "IsDeleted" = FALSE;

-- Index for user's own suggestions
CREATE INDEX IF NOT EXISTS "IX_RelationshipSuggestions_SubmittedByUserId"
    ON "RelationshipSuggestions" ("SubmittedByUserId");

-- Index for finding suggestions about a specific person
CREATE INDEX IF NOT EXISTS "IX_RelationshipSuggestions_TargetPersonId"
    ON "RelationshipSuggestions" ("TargetPersonId")
    WHERE "TargetPersonId" IS NOT NULL;

-- Index for chronological ordering (newest first)
CREATE INDEX IF NOT EXISTS "IX_RelationshipSuggestions_CreatedAt"
    ON "RelationshipSuggestions" ("CreatedAt" DESC);

-- Composite index for admin queue queries
CREATE INDEX IF NOT EXISTS "IX_RelationshipSuggestions_TownStatus"
    ON "RelationshipSuggestions" ("TownId", "Status", "CreatedAt")
    WHERE "IsDeleted" = FALSE;

-- Unique index to prevent duplicate pending suggestions for same relationship
CREATE UNIQUE INDEX IF NOT EXISTS "IX_RelationshipSuggestions_NoDuplicatePending"
    ON "RelationshipSuggestions" (
        "TreeId",
        "Type",
        COALESCE("TargetPersonId", '00000000-0000-0000-0000-000000000000'::uuid),
        COALESCE("SecondaryPersonId", '00000000-0000-0000-0000-000000000000'::uuid)
    )
    WHERE "Status" = 0 AND "IsDeleted" = FALSE;

-- ============================================================================
-- TABLE: SuggestionEvidence
-- Stores evidence attachments for suggestions (photos, documents, URLs)
-- ============================================================================

CREATE TABLE IF NOT EXISTS "SuggestionEvidence" (
    "Id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "SuggestionId" uuid NOT NULL,

    -- Evidence type (enum stored as int)
    -- 0=Photo, 1=Document, 2=Audio, 3=Video, 4=Url, 5=OtherMedia
    "Type" integer NOT NULL,

    -- For media file uploads (references existing Media table)
    "MediaId" uuid,

    -- For URL-based evidence
    "Url" varchar(2000),
    "UrlTitle" varchar(200),

    -- Metadata
    "Description" varchar(500),
    "SortOrder" integer NOT NULL DEFAULT 0,

    -- Timestamps
    "CreatedAt" timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- Constraints
    CONSTRAINT "PK_SuggestionEvidence" PRIMARY KEY ("Id"),

    CONSTRAINT "FK_SuggestionEvidence_Suggestion" FOREIGN KEY ("SuggestionId")
        REFERENCES "RelationshipSuggestions"("Id") ON DELETE CASCADE,

    CONSTRAINT "FK_SuggestionEvidence_Media" FOREIGN KEY ("MediaId")
        REFERENCES "MediaFiles"("Id") ON DELETE SET NULL,

    -- Validate Type enum
    CONSTRAINT "CK_SuggestionEvidence_Type" CHECK ("Type" >= 0 AND "Type" <= 5),

    -- Ensure either MediaId or Url is provided
    CONSTRAINT "CK_SuggestionEvidence_HasSource" CHECK (
        "MediaId" IS NOT NULL OR "Url" IS NOT NULL
    )
);

-- Indexes for SuggestionEvidence
CREATE INDEX IF NOT EXISTS "IX_SuggestionEvidence_SuggestionId"
    ON "SuggestionEvidence" ("SuggestionId");

CREATE INDEX IF NOT EXISTS "IX_SuggestionEvidence_MediaId"
    ON "SuggestionEvidence" ("MediaId")
    WHERE "MediaId" IS NOT NULL;

-- ============================================================================
-- TABLE: SuggestionComments
-- Stores conversation between submitter and reviewers
-- ============================================================================

CREATE TABLE IF NOT EXISTS "SuggestionComments" (
    "Id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "SuggestionId" uuid NOT NULL,

    -- Author
    "AuthorUserId" bigint NOT NULL,

    -- Content
    "Content" varchar(2000) NOT NULL,

    -- Flag to distinguish admin responses from submitter replies
    "IsAdminComment" boolean NOT NULL DEFAULT FALSE,

    -- Timestamps
    "CreatedAt" timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- Constraints
    CONSTRAINT "PK_SuggestionComments" PRIMARY KEY ("Id"),

    CONSTRAINT "FK_SuggestionComments_Suggestion" FOREIGN KEY ("SuggestionId")
        REFERENCES "RelationshipSuggestions"("Id") ON DELETE CASCADE,

    CONSTRAINT "FK_SuggestionComments_Author" FOREIGN KEY ("AuthorUserId")
        REFERENCES "AspNetUsers"("Id") ON DELETE RESTRICT
);

-- Indexes for SuggestionComments
CREATE INDEX IF NOT EXISTS "IX_SuggestionComments_SuggestionId"
    ON "SuggestionComments" ("SuggestionId");

-- ============================================================================
-- Add foreign key from AuditLogs to RelationshipSuggestions
-- (Deferred from 019_ExtendAuditLog.sql since table didn't exist yet)
-- ============================================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'FK_AuditLogs_Suggestion'
    ) THEN
        ALTER TABLE "AuditLogs"
        ADD CONSTRAINT "FK_AuditLogs_Suggestion"
        FOREIGN KEY ("SuggestionId") REFERENCES "RelationshipSuggestions"("Id")
        ON DELETE SET NULL;
    END IF;
END $$;

-- ============================================================================
-- COMMENTS
-- ============================================================================

-- RelationshipSuggestions comments
COMMENT ON TABLE "RelationshipSuggestions" IS
    'Stores structured relationship suggestions from viewers. Only Admins can approve and apply changes to canonical tree.';

COMMENT ON COLUMN "RelationshipSuggestions"."Type" IS
    'Suggestion type: 0=AddPerson, 1=UpdatePerson, 2=AddParent, 3=AddChild, 4=AddSpouse, 5=RemoveRelationship, 6=MergePerson, 7=SplitPerson';

COMMENT ON COLUMN "RelationshipSuggestions"."Status" IS
    'Status workflow: 0=Pending, 1=Approved, 2=Rejected, 3=NeedsInfo, 4=Withdrawn';

COMMENT ON COLUMN "RelationshipSuggestions"."Confidence" IS
    'Submitter confidence level: 0=Certain, 1=Probable, 2=Possible, 3=Uncertain';

COMMENT ON COLUMN "RelationshipSuggestions"."ProposedValuesJson" IS
    'JSON object containing proposed field values (names, dates, places, etc.)';

COMMENT ON COLUMN "RelationshipSuggestions"."AppliedEntityType" IS
    'Type of entity created/modified when approved (Person, ParentChild, Union)';

COMMENT ON COLUMN "RelationshipSuggestions"."AppliedEntityId" IS
    'ID of entity created/modified when approved. Used for rollback.';

COMMENT ON COLUMN "RelationshipSuggestions"."PreviousValuesJson" IS
    'JSON snapshot of entity state before approval. Used for rollback.';

-- SuggestionEvidence comments
COMMENT ON TABLE "SuggestionEvidence" IS
    'Evidence attachments supporting suggestions (photos, documents, audio, video, URLs)';

COMMENT ON COLUMN "SuggestionEvidence"."Type" IS
    'Evidence type: 0=Photo, 1=Document, 2=Audio, 3=Video, 4=Url, 5=OtherMedia';

COMMENT ON COLUMN "SuggestionEvidence"."MediaId" IS
    'Reference to uploaded media file in MediaFiles table';

-- SuggestionComments comments
COMMENT ON TABLE "SuggestionComments" IS
    'Conversation thread between suggestion submitter and admin reviewers';

COMMENT ON COLUMN "SuggestionComments"."IsAdminComment" IS
    'TRUE if comment is from an admin/reviewer, FALSE if from the submitter';
