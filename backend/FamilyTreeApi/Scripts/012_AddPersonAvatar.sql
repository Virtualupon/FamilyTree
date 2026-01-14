-- =====================================================
-- Migration: Add Avatar (Profile Picture) to Person
-- Date: 2024
-- Description: Adds AvatarMediaId column to People table
--              to allow each person to have one profile picture
-- =====================================================

-- Add AvatarMediaId column to People table
ALTER TABLE "People"
ADD COLUMN IF NOT EXISTS "AvatarMediaId" uuid NULL;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS "IX_People_AvatarMediaId"
ON "People" ("AvatarMediaId");

-- Add foreign key constraint to MediaFiles table
-- ON DELETE SET NULL: If the media file is deleted, clear the avatar reference
ALTER TABLE "People"
ADD CONSTRAINT "FK_People_MediaFiles_AvatarMediaId"
FOREIGN KEY ("AvatarMediaId")
REFERENCES "MediaFiles"("Id")
ON DELETE SET NULL;

-- Add comment for documentation
COMMENT ON COLUMN "People"."AvatarMediaId" IS 'Reference to the profile picture/avatar media file for this person';
