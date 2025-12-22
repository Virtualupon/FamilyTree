-- =============================================
-- Migration: 007_AddFamilyNameUniqueConstraint
-- Description: Add unique constraint to prevent duplicate family names within the same town
-- Date: 2025-12-21
-- =============================================

-- Add unique constraint on (TownId, Name) to prevent duplicate family names in the same town
-- This ensures that within each town, family names are unique

DO $$
BEGIN
    -- Check if the constraint already exists
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE indexname = 'IX_Families_TownId_Name_Unique'
    ) THEN
        -- Create unique index
        CREATE UNIQUE INDEX "IX_Families_TownId_Name_Unique"
        ON "Families" ("TownId", "Name");

        RAISE NOTICE 'Created unique index IX_Families_TownId_Name_Unique on Families(TownId, Name)';
    ELSE
        RAISE NOTICE 'Index IX_Families_TownId_Name_Unique already exists, skipping...';
    END IF;
END $$;

-- Verify the constraint was created
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'Families' AND indexname = 'IX_Families_TownId_Name_Unique';
