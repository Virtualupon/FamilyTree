-- ============================================================================
-- Migration: Add User Profile Fields for Governance Model
-- Date: 2026-01-17
-- Description: Adds SelectedTownId and IsFirstLogin to ApplicationUser
--              for the new viewer governance flow
-- ============================================================================

-- Add SelectedTownId column - stores the user's currently selected town
ALTER TABLE "AspNetUsers"
ADD COLUMN IF NOT EXISTS "SelectedTownId" uuid;

-- Add IsFirstLogin column - tracks if user needs to complete onboarding
ALTER TABLE "AspNetUsers"
ADD COLUMN IF NOT EXISTS "IsFirstLogin" boolean NOT NULL DEFAULT TRUE;

-- Add foreign key constraint for SelectedTownId
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'FK_AspNetUsers_SelectedTown'
    ) THEN
        ALTER TABLE "AspNetUsers"
        ADD CONSTRAINT "FK_AspNetUsers_SelectedTown"
        FOREIGN KEY ("SelectedTownId") REFERENCES "Towns"("Id")
        ON DELETE SET NULL;
    END IF;
END $$;

-- Create index for SelectedTownId
CREATE INDEX IF NOT EXISTS "IX_AspNetUsers_SelectedTownId"
    ON "AspNetUsers" ("SelectedTownId");

-- Update existing users to not require first login flow (they've already been using the system)
UPDATE "AspNetUsers"
SET "IsFirstLogin" = FALSE
WHERE "IsFirstLogin" = TRUE;

-- Add comments for documentation
COMMENT ON COLUMN "AspNetUsers"."SelectedTownId" IS
    'The town currently selected by the user for browsing family trees. Required for Admin and User roles.';

COMMENT ON COLUMN "AspNetUsers"."IsFirstLogin" IS
    'Flag indicating user needs to complete onboarding (language selection). Set to FALSE after first setup.';
