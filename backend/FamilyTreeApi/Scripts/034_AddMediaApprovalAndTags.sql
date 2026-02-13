-- ============================================================
-- Migration 034: Media Approval Workflow + Media Tags
-- Date: 2026-02-11
-- Description: Adds approval status columns to MediaFiles
--   and creates MediaTags junction table for tagging media.
--   Existing media defaults to Approved (0) with no migration needed.
-- ============================================================

-- ============================================================
-- STEP 1: Add approval columns to MediaFiles
-- Default 0 = Approved, so existing rows are automatically approved.
-- ============================================================
ALTER TABLE "MediaFiles" ADD COLUMN IF NOT EXISTS "ApprovalStatus" int NOT NULL DEFAULT 0;
ALTER TABLE "MediaFiles" ADD COLUMN IF NOT EXISTS "ReviewedByUserId" bigint NULL;
ALTER TABLE "MediaFiles" ADD COLUMN IF NOT EXISTS "ReviewedAt" timestamptz NULL;
ALTER TABLE "MediaFiles" ADD COLUMN IF NOT EXISTS "ReviewerNotes" varchar(500) NULL;

CREATE INDEX IF NOT EXISTS "IX_MediaFiles_ApprovalStatus"
    ON "MediaFiles" ("ApprovalStatus");

CREATE INDEX IF NOT EXISTS "IX_MediaFiles_OrgId_ApprovalStatus"
    ON "MediaFiles" ("OrgId", "ApprovalStatus");

-- ============================================================
-- STEP 2: Create MediaTags junction table
-- ============================================================
CREATE TABLE IF NOT EXISTS "MediaTags" (
    "Id"        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "MediaId"   uuid NOT NULL REFERENCES "MediaFiles"("Id") ON DELETE CASCADE,
    "TagId"     uuid NOT NULL REFERENCES "Tags"("Id") ON DELETE CASCADE,
    "CreatedAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "IX_MediaTags_MediaId_TagId"
    ON "MediaTags" ("MediaId", "TagId");

CREATE INDEX IF NOT EXISTS "IX_MediaTags_TagId"
    ON "MediaTags" ("TagId");

-- ============================================================
-- STEP 3: Permissions
-- ============================================================
GRANT SELECT, INSERT, UPDATE, DELETE ON "MediaTags" TO PUBLIC;
