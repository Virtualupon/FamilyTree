-- Migration: Add HomeTownId column to AspNetUsers
-- Date: 2026-02-04
-- Description: Adds HomeTownId as a permanent home town association for users,
--              distinct from SelectedTownId which is used for browsing.

-- Add HomeTownId column to AspNetUsers table
ALTER TABLE public."AspNetUsers"
ADD COLUMN IF NOT EXISTS "HomeTownId" uuid NULL;

-- Add foreign key constraint
ALTER TABLE public."AspNetUsers"
ADD CONSTRAINT "FK_AspNetUsers_Towns_HomeTownId"
FOREIGN KEY ("HomeTownId") REFERENCES public."Towns"("Id")
ON DELETE SET NULL;

-- Add index for better query performance
CREATE INDEX IF NOT EXISTS "IX_AspNetUsers_HomeTownId"
ON public."AspNetUsers" ("HomeTownId");

-- Add comment
COMMENT ON COLUMN public."AspNetUsers"."HomeTownId" IS 'The user''s home town (permanent association). Different from SelectedTownId which is for browsing.';
