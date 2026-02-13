-- 031: Add LastActiveAt column to AspNetUsers
-- Purpose: Track last user activity for admin dashboard reporting.
-- Updated on token refresh to reflect active sessions.

-- Add the column with a default of UTC now
ALTER TABLE "AspNetUsers"
ADD COLUMN IF NOT EXISTS "LastActiveAt" TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC');

-- Backfill from LastLoginAt for existing users
UPDATE "AspNetUsers"
SET "LastActiveAt" = "LastLoginAt"
WHERE "LastActiveAt" = (NOW() AT TIME ZONE 'UTC');

-- Index for efficient "recently active users" queries
CREATE INDEX IF NOT EXISTS "IX_AspNetUsers_LastActiveAt"
ON "AspNetUsers" ("LastActiveAt" DESC);
