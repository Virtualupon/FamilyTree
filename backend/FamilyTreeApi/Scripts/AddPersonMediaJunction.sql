-- =====================================================
-- PersonMedia Many-to-Many Migration Script
-- This script adds missing columns to MediaFiles and creates the PersonMedia junction table
-- Run this script on your PostgreSQL database
-- =====================================================

-- =====================================================
-- 1. ADD MISSING COLUMNS TO MediaFiles TABLE
-- =====================================================

-- Add FileName column (required for file uploads)
ALTER TABLE "MediaFiles"
ADD COLUMN IF NOT EXISTS "FileName" VARCHAR(255) NOT NULL DEFAULT '';

-- Add MimeType column
ALTER TABLE "MediaFiles"
ADD COLUMN IF NOT EXISTS "MimeType" VARCHAR(100);

-- Add FileSize column
ALTER TABLE "MediaFiles"
ADD COLUMN IF NOT EXISTS "FileSize" BIGINT NOT NULL DEFAULT 0;

-- Add PersonId column (optional reference to a primary person)
ALTER TABLE "MediaFiles"
ADD COLUMN IF NOT EXISTS "PersonId" UUID;

-- Add ThumbnailPath column
ALTER TABLE "MediaFiles"
ADD COLUMN IF NOT EXISTS "ThumbnailPath" VARCHAR(500);

-- Add StorageType column (1=Local, 2=Linode, 3=AWS, 4=Nextcloud, 5=Cloudflare)
ALTER TABLE "MediaFiles"
ADD COLUMN IF NOT EXISTS "StorageType" INTEGER NOT NULL DEFAULT 1;

-- Add foreign key constraint for PersonId (if People table exists)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'FK_MediaFiles_Person'
    ) THEN
        ALTER TABLE "MediaFiles"
        ADD CONSTRAINT "FK_MediaFiles_Person"
        FOREIGN KEY ("PersonId") REFERENCES "People" ("Id") ON DELETE SET NULL;
    END IF;
END $$;

-- Create index on PersonId
CREATE INDEX IF NOT EXISTS "IX_MediaFiles_PersonId" ON "MediaFiles" ("PersonId");

-- =====================================================
-- 2. CREATE PersonMedia JUNCTION TABLE
-- =====================================================

-- Create the junction table if it doesn't exist
CREATE TABLE IF NOT EXISTS "PersonMedia" (
    "Id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "PersonId" UUID NOT NULL,
    "MediaId" UUID NOT NULL,
    "IsPrimary" BOOLEAN NOT NULL DEFAULT FALSE,
    "SortOrder" INTEGER NOT NULL DEFAULT 0,
    "Notes" TEXT,
    "LinkedAt" TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC'),

    CONSTRAINT "FK_PersonMedia_Person" FOREIGN KEY ("PersonId")
        REFERENCES "People" ("Id") ON DELETE CASCADE,
    CONSTRAINT "FK_PersonMedia_Media" FOREIGN KEY ("MediaId")
        REFERENCES "MediaFiles" ("Id") ON DELETE CASCADE
);

-- Create indexes for performance (if they don't exist)
CREATE INDEX IF NOT EXISTS "IX_PersonMedia_PersonId" ON "PersonMedia" ("PersonId");
CREATE INDEX IF NOT EXISTS "IX_PersonMedia_MediaId" ON "PersonMedia" ("MediaId");

-- Unique constraint to prevent duplicate person-media links
CREATE UNIQUE INDEX IF NOT EXISTS "IX_PersonMedia_PersonId_MediaId" ON "PersonMedia" ("PersonId", "MediaId");

-- =====================================================
-- 3. MIGRATE EXISTING DATA (if MediaFiles.PersonId has data)
-- =====================================================

-- If there's existing media linked via PersonId, create junction entries
INSERT INTO "PersonMedia" ("PersonId", "MediaId", "IsPrimary", "LinkedAt")
SELECT "PersonId", "Id", TRUE, "CreatedAt"
FROM "MediaFiles"
WHERE "PersonId" IS NOT NULL
ON CONFLICT ("PersonId", "MediaId") DO NOTHING;

-- =====================================================
-- VERIFICATION QUERIES (optional - run to verify)
-- =====================================================

-- Check new columns exist:
-- SELECT column_name, data_type FROM information_schema.columns
-- WHERE table_name = 'MediaFiles' AND column_name IN ('FileName', 'MimeType', 'FileSize', 'PersonId', 'ThumbnailPath', 'StorageType');

-- Check PersonMedia table:
-- SELECT * FROM "PersonMedia" LIMIT 5;

-- =====================================================
-- DONE - Script completed successfully
-- =====================================================
