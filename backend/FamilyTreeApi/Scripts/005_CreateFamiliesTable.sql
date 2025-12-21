-- ============================================================================
-- Script: 005_CreateFamiliesTable.sql
-- Purpose: Create Families table for grouping people within a family tree
--          Hierarchy: Town -> Org (Family Tree) -> Family -> Person
-- ============================================================================

-- Create the Families table
CREATE TABLE IF NOT EXISTS "Families" (
    "Id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Family name (trilingual support)
    "Name" VARCHAR(200) NOT NULL,           -- Primary/default name
    "NameEn" VARCHAR(200),                  -- English name
    "NameAr" VARCHAR(200),                  -- Arabic name
    "NameLocal" VARCHAR(200),               -- Nobiin/local name

    -- Description
    "Description" TEXT,

    -- Hierarchy references
    "OrgId" UUID NOT NULL,                  -- Which family tree this belongs to
    "TownId" UUID NOT NULL,                 -- Denormalized for easier queries

    -- Optional: Reference to patriarch/matriarch
    "PatriarchId" UUID,                     -- Reference to founding male ancestor
    "MatriarchId" UUID,                     -- Reference to founding female ancestor

    -- Display settings
    "Color" VARCHAR(7),                     -- Hex color for UI display (e.g., #FF5733)
    "SortOrder" INT NOT NULL DEFAULT 0,     -- For custom ordering

    -- Timestamps
    "CreatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    "UpdatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

    -- Foreign keys
    CONSTRAINT "FK_Families_Orgs_OrgId"
        FOREIGN KEY ("OrgId") REFERENCES "Orgs"("Id") ON DELETE CASCADE,
    CONSTRAINT "FK_Families_Towns_TownId"
        FOREIGN KEY ("TownId") REFERENCES "Towns"("Id") ON DELETE RESTRICT
);

-- Add FamilyId column to People table
ALTER TABLE "People"
ADD COLUMN IF NOT EXISTS "FamilyId" UUID;

-- Add foreign key constraint for People.FamilyId
ALTER TABLE "People"
ADD CONSTRAINT "FK_People_Families_FamilyId"
FOREIGN KEY ("FamilyId") REFERENCES "Families"("Id") ON DELETE SET NULL;

-- Add foreign keys for patriarch/matriarch after People table has FamilyId
ALTER TABLE "Families"
ADD CONSTRAINT "FK_Families_People_PatriarchId"
FOREIGN KEY ("PatriarchId") REFERENCES "People"("Id") ON DELETE SET NULL;

ALTER TABLE "Families"
ADD CONSTRAINT "FK_Families_People_MatriarchId"
FOREIGN KEY ("MatriarchId") REFERENCES "People"("Id") ON DELETE SET NULL;

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS "IX_Families_OrgId" ON "Families" ("OrgId");
CREATE INDEX IF NOT EXISTS "IX_Families_TownId" ON "Families" ("TownId");
CREATE INDEX IF NOT EXISTS "IX_Families_Name" ON "Families" ("Name");
CREATE INDEX IF NOT EXISTS "IX_Families_SortOrder" ON "Families" ("SortOrder");
CREATE INDEX IF NOT EXISTS "IX_People_FamilyId" ON "People" ("FamilyId");

-- Add comments for documentation
COMMENT ON TABLE "Families" IS 'Groups of people within a family tree. Part of Town->Org->Family->Person hierarchy.';
COMMENT ON COLUMN "Families"."Name" IS 'Primary family name/label for grouping';
COMMENT ON COLUMN "Families"."OrgId" IS 'The family tree this family group belongs to';
COMMENT ON COLUMN "Families"."TownId" IS 'Denormalized town reference for easier filtering';
COMMENT ON COLUMN "Families"."PatriarchId" IS 'Optional reference to founding male ancestor';
COMMENT ON COLUMN "Families"."MatriarchId" IS 'Optional reference to founding female ancestor';
COMMENT ON COLUMN "People"."FamilyId" IS 'Optional family group this person belongs to';

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

-- Verify table was created
SELECT
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns
WHERE table_name = 'Families'
ORDER BY ordinal_position;

-- Verify People has FamilyId
SELECT
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns
WHERE table_name = 'People' AND column_name = 'FamilyId';
