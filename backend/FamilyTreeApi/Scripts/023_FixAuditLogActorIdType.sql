-- ============================================================================
-- Migration: Fix AuditLogs.ActorId Column Type
-- Date: 2026-01-21
-- Description: Changes ActorId from uuid to bigint to match AspNetUsers.Id type
-- ============================================================================

-- Step 1: Drop foreign key constraint if exists
ALTER TABLE "AuditLogs"
DROP CONSTRAINT IF EXISTS "FK_AuditLogs_Actor";

ALTER TABLE "AuditLogs"
DROP CONSTRAINT IF EXISTS "FK_AuditLogs_AspNetUsers";

-- Step 2: Drop index if exists
DROP INDEX IF EXISTS "IX_AuditLogs_ActorId";

-- Step 3: Change column type from uuid to bigint
-- We set existing values to NULL since uuid cannot be converted to bigint
ALTER TABLE "AuditLogs"
ALTER COLUMN "ActorId" TYPE bigint USING NULL;

-- Step 4: Make ActorId nullable (it might have existing rows)
-- Note: If you want to require ActorId, remove this line
ALTER TABLE "AuditLogs"
ALTER COLUMN "ActorId" DROP NOT NULL;

-- Step 5: Recreate index
CREATE INDEX "IX_AuditLogs_ActorId" ON "AuditLogs" ("ActorId");

-- Step 6: Recreate foreign key constraint
ALTER TABLE "AuditLogs"
ADD CONSTRAINT "FK_AuditLogs_AspNetUsers"
FOREIGN KEY ("ActorId")
REFERENCES "AspNetUsers"("Id")
ON DELETE SET NULL;

-- ============================================================================
-- Verification query (run after migration)
-- ============================================================================
-- SELECT column_name, data_type
-- FROM information_schema.columns
-- WHERE table_name = 'AuditLogs' AND column_name = 'ActorId';

COMMENT ON COLUMN "AuditLogs"."ActorId" IS
    'User ID (bigint) of the actor who performed the action. References AspNetUsers.Id.';
