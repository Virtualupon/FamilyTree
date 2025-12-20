-- ============================================================================
-- PersonMedia Direct Storage Migration Script
-- Database: PostgreSQL
-- Description: Renames existing PersonMedia junction table to PersonMediaLinks
--              and creates new PersonMedia table for direct file storage
-- ============================================================================

-- Start transaction
BEGIN;

-- ============================================================================
-- STEP 1: Rename existing PersonMedia table to PersonMediaLinks
-- ============================================================================

-- Rename the table
ALTER TABLE IF EXISTS "PersonMedia" RENAME TO "PersonMediaLinks";

-- Rename the primary key constraint (if it exists with old name)
ALTER INDEX IF EXISTS "PK_PersonMedia" RENAME TO "PK_PersonMediaLinks";

-- Rename indexes
ALTER INDEX IF EXISTS "IX_PersonMedia_PersonId" RENAME TO "IX_PersonMediaLinks_PersonId";
ALTER INDEX IF EXISTS "IX_PersonMedia_MediaId" RENAME TO "IX_PersonMediaLinks_MediaId";
ALTER INDEX IF EXISTS "IX_PersonMedia_PersonId_MediaId" RENAME TO "IX_PersonMediaLinks_PersonId_MediaId";

-- ============================================================================
-- STEP 2: Create new PersonMedia table for direct file storage
-- ============================================================================

CREATE TABLE IF NOT EXISTS "PersonMedia" (
    "PersonMediaId" SERIAL PRIMARY KEY,
    "PersonId" UUID NOT NULL,
    "MediaType" VARCHAR(20) NOT NULL,
    "FileName" VARCHAR(255) NOT NULL,
    "MimeType" VARCHAR(100) NOT NULL,
    "SizeBytes" BIGINT NOT NULL DEFAULT 0,
    "StoragePath" VARCHAR(500) NOT NULL,
    "CreatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    "UpdatedAt" TIMESTAMP WITH TIME ZONE NULL,

    -- Foreign key to People table
    CONSTRAINT "FK_PersonMedia_People_PersonId"
        FOREIGN KEY ("PersonId")
        REFERENCES "People" ("Id")
        ON DELETE CASCADE
);

-- ============================================================================
-- STEP 3: Create indexes for the new PersonMedia table
-- ============================================================================

-- Index on PersonId for fast lookups by person
CREATE INDEX IF NOT EXISTS "IX_PersonMedia_PersonId"
    ON "PersonMedia" ("PersonId");

-- Index on MediaType for filtering by type
CREATE INDEX IF NOT EXISTS "IX_PersonMedia_MediaType"
    ON "PersonMedia" ("MediaType");

-- Composite index for filtering by person and type
CREATE INDEX IF NOT EXISTS "IX_PersonMedia_PersonId_MediaType"
    ON "PersonMedia" ("PersonId", "MediaType");

-- ============================================================================
-- STEP 4: Add comments for documentation
-- ============================================================================

COMMENT ON TABLE "PersonMedia" IS 'Direct media file storage for persons (images, audio, video)';
COMMENT ON COLUMN "PersonMedia"."PersonMediaId" IS 'Primary key (auto-increment)';
COMMENT ON COLUMN "PersonMedia"."PersonId" IS 'Foreign key to People table';
COMMENT ON COLUMN "PersonMedia"."MediaType" IS 'Type of media: Image, Audio, or Video';
COMMENT ON COLUMN "PersonMedia"."FileName" IS 'Original file name';
COMMENT ON COLUMN "PersonMedia"."MimeType" IS 'MIME type (e.g., image/jpeg, audio/mpeg)';
COMMENT ON COLUMN "PersonMedia"."SizeBytes" IS 'File size in bytes';
COMMENT ON COLUMN "PersonMedia"."StoragePath" IS 'Relative path to stored file';
COMMENT ON COLUMN "PersonMedia"."CreatedAt" IS 'Timestamp when record was created';
COMMENT ON COLUMN "PersonMedia"."UpdatedAt" IS 'Timestamp when record was last updated';

COMMENT ON TABLE "PersonMediaLinks" IS 'Junction table linking People to Media (many-to-many)';

-- ============================================================================
-- STEP 5: Verify the changes
-- ============================================================================

-- Check that both tables exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'PersonMedia') THEN
        RAISE EXCEPTION 'PersonMedia table was not created';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'PersonMediaLinks') THEN
        RAISE WARNING 'PersonMediaLinks table does not exist (original PersonMedia may not have existed)';
    END IF;

    RAISE NOTICE 'Migration completed successfully';
END $$;

-- Commit transaction
COMMIT;

-- ============================================================================
-- ROLLBACK SCRIPT (run separately if needed)
-- ============================================================================
/*
BEGIN;

-- Drop the new PersonMedia table
DROP TABLE IF EXISTS "PersonMedia";

-- Rename PersonMediaLinks back to PersonMedia
ALTER TABLE IF EXISTS "PersonMediaLinks" RENAME TO "PersonMedia";

-- Rename indexes back
ALTER INDEX IF EXISTS "PK_PersonMediaLinks" RENAME TO "PK_PersonMedia";
ALTER INDEX IF EXISTS "IX_PersonMediaLinks_PersonId" RENAME TO "IX_PersonMedia_PersonId";
ALTER INDEX IF EXISTS "IX_PersonMediaLinks_MediaId" RENAME TO "IX_PersonMedia_MediaId";
ALTER INDEX IF EXISTS "IX_PersonMediaLinks_PersonId_MediaId" RENAME TO "IX_PersonMedia_PersonId_MediaId";

COMMIT;
*/
