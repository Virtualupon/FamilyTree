-- ============================================================================
-- Migration: Add TargetMediaId Column to RelationshipSuggestions
-- Date: 2026-01-27
-- Description: Adds TargetMediaId column for media-related suggestions
--              (AddMedia, SetAvatar, RemoveMedia, LinkMediaToPerson)
-- ============================================================================

-- Add TargetMediaId column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'RelationshipSuggestions'
        AND column_name = 'TargetMediaId'
    ) THEN
        ALTER TABLE "RelationshipSuggestions"
        ADD COLUMN "TargetMediaId" uuid;
    END IF;
END $$;

-- Add foreign key constraint
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'FK_RelationshipSuggestions_TargetMedia'
    ) THEN
        ALTER TABLE "RelationshipSuggestions"
        ADD CONSTRAINT "FK_RelationshipSuggestions_TargetMedia"
        FOREIGN KEY ("TargetMediaId") REFERENCES "MediaFiles"("Id")
        ON DELETE SET NULL;
    END IF;
END $$;

-- Create index for media-related queries
CREATE INDEX IF NOT EXISTS "IX_RelationshipSuggestions_TargetMediaId"
    ON "RelationshipSuggestions" ("TargetMediaId")
    WHERE "TargetMediaId" IS NOT NULL;

-- Update constraint for Type enum to include media-related types
-- Type enum now includes:
--   0=AddPerson, 1=UpdatePerson, 2=AddParent, 3=AddChild, 4=AddSpouse
--   5=RemoveRelationship, 6=MergePerson, 7=SplitPerson, 8=DeletePerson
--   9=UpdateUnion, 10=DeleteUnion
--   11=AddMedia, 12=SetAvatar, 13=RemoveMedia, 14=LinkMediaToPerson

-- First drop the old constraint if it exists
ALTER TABLE "RelationshipSuggestions"
DROP CONSTRAINT IF EXISTS "CK_RelationshipSuggestions_Type";

-- Add updated constraint with extended enum range
ALTER TABLE "RelationshipSuggestions"
ADD CONSTRAINT "CK_RelationshipSuggestions_Type"
CHECK ("Type" >= 0 AND "Type" <= 14);

-- Update comment
COMMENT ON COLUMN "RelationshipSuggestions"."TargetMediaId" IS
    'Target media ID for media-related suggestions (AddMedia, SetAvatar, RemoveMedia, LinkMediaToPerson)';

COMMENT ON COLUMN "RelationshipSuggestions"."Type" IS
    'Suggestion type: 0=AddPerson, 1=UpdatePerson, 2=AddParent, 3=AddChild, 4=AddSpouse, 5=RemoveRelationship, 6=MergePerson, 7=SplitPerson, 8=DeletePerson, 9=UpdateUnion, 10=DeleteUnion, 11=AddMedia, 12=SetAvatar, 13=RemoveMedia, 14=LinkMediaToPerson';
