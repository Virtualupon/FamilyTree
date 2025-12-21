-- ============================================================================
-- Migration: Add PreferredLanguage column to Users table
-- Date: 2024
-- Description: Adds user language preference for trilingual support
-- ============================================================================

-- Add PreferredLanguage column with default 'en'
ALTER TABLE "AspNetUsers"
ADD COLUMN IF NOT EXISTS "PreferredLanguage" VARCHAR(10) NOT NULL DEFAULT 'en';

-- Add comment for documentation
COMMENT ON COLUMN "AspNetUsers"."PreferredLanguage" IS 'User preferred language code: en, ar, nob';

-- Create index for querying by language (optional, for analytics)
CREATE INDEX IF NOT EXISTS idx_users_preferred_language ON "AspNetUsers" ("PreferredLanguage");
