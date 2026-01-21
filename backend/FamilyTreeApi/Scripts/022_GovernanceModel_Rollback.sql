-- ============================================================================
-- ROLLBACK SCRIPT: Governance Model
-- Date: 2026-01-17
-- Description: Rolls back all governance model changes if needed
-- WARNING: This will delete all suggestion data! Use with caution.
-- ============================================================================

-- IMPORTANT: Run this script only if you need to completely remove
-- the governance model feature. All suggestion data will be lost!

-- ============================================================================
-- Step 1: Drop views and functions
-- ============================================================================

DROP VIEW IF EXISTS "vw_suggestion_queue" CASCADE;
DROP VIEW IF EXISTS "vw_pending_suggestions_by_town" CASCADE;
DROP FUNCTION IF EXISTS fn_get_suggestion_statistics(uuid, uuid, bigint) CASCADE;
DROP FUNCTION IF EXISTS fn_check_duplicate_suggestion(uuid, integer, uuid, uuid) CASCADE;
DROP FUNCTION IF EXISTS fn_update_suggestion_timestamp() CASCADE;

-- ============================================================================
-- Step 2: Remove foreign key from AuditLogs
-- ============================================================================

ALTER TABLE "AuditLogs" DROP CONSTRAINT IF EXISTS "FK_AuditLogs_Suggestion";

-- ============================================================================
-- Step 3: Drop suggestion tables (order matters due to foreign keys)
-- ============================================================================

DROP TABLE IF EXISTS "SuggestionComments" CASCADE;
DROP TABLE IF EXISTS "SuggestionEvidence" CASCADE;
DROP TABLE IF EXISTS "RelationshipSuggestions" CASCADE;

-- ============================================================================
-- Step 4: Remove columns added to AuditLogs
-- ============================================================================

ALTER TABLE "AuditLogs" DROP COLUMN IF EXISTS "SuggestionId";
ALTER TABLE "AuditLogs" DROP COLUMN IF EXISTS "PreviousValuesJson";
ALTER TABLE "AuditLogs" DROP COLUMN IF EXISTS "NewValuesJson";

-- ============================================================================
-- Step 5: Remove soft delete columns from core entities
-- ============================================================================

-- People
ALTER TABLE "People" DROP CONSTRAINT IF EXISTS "FK_People_DeletedByUser";
DROP INDEX IF EXISTS "IX_People_IsDeleted";
ALTER TABLE "People" DROP COLUMN IF EXISTS "IsDeleted";
ALTER TABLE "People" DROP COLUMN IF EXISTS "DeletedAt";
ALTER TABLE "People" DROP COLUMN IF EXISTS "DeletedByUserId";

-- ParentChildren
ALTER TABLE "ParentChildren" DROP CONSTRAINT IF EXISTS "FK_ParentChildren_DeletedByUser";
DROP INDEX IF EXISTS "IX_ParentChildren_IsDeleted";
ALTER TABLE "ParentChildren" DROP COLUMN IF EXISTS "IsDeleted";
ALTER TABLE "ParentChildren" DROP COLUMN IF EXISTS "DeletedAt";
ALTER TABLE "ParentChildren" DROP COLUMN IF EXISTS "DeletedByUserId";

-- Unions
ALTER TABLE "Unions" DROP CONSTRAINT IF EXISTS "FK_Unions_DeletedByUser";
DROP INDEX IF EXISTS "IX_Unions_IsDeleted";
ALTER TABLE "Unions" DROP COLUMN IF EXISTS "IsDeleted";
ALTER TABLE "Unions" DROP COLUMN IF EXISTS "DeletedAt";
ALTER TABLE "Unions" DROP COLUMN IF EXISTS "DeletedByUserId";

-- UnionMembers
ALTER TABLE "UnionMembers" DROP CONSTRAINT IF EXISTS "FK_UnionMembers_DeletedByUser";
ALTER TABLE "UnionMembers" DROP COLUMN IF EXISTS "IsDeleted";
ALTER TABLE "UnionMembers" DROP COLUMN IF EXISTS "DeletedAt";
ALTER TABLE "UnionMembers" DROP COLUMN IF EXISTS "DeletedByUserId";

-- ============================================================================
-- Step 6: Remove user profile fields (optional - may want to keep these)
-- ============================================================================

-- Uncomment the following lines if you also want to remove user profile fields
-- Note: This will lose user town selections and first-login tracking

-- ALTER TABLE "AspNetUsers" DROP CONSTRAINT IF EXISTS "FK_AspNetUsers_SelectedTown";
-- DROP INDEX IF EXISTS "IX_AspNetUsers_SelectedTownId";
-- ALTER TABLE "AspNetUsers" DROP COLUMN IF EXISTS "SelectedTownId";
-- ALTER TABLE "AspNetUsers" DROP COLUMN IF EXISTS "IsFirstLogin";

-- ============================================================================
-- Done
-- ============================================================================

-- Verify rollback completed
DO $$
BEGIN
    RAISE NOTICE 'Governance model rollback completed successfully.';
    RAISE NOTICE 'Note: User profile fields (SelectedTownId, IsFirstLogin) were NOT removed.';
    RAISE NOTICE 'Uncomment the relevant section in this script if you want to remove them too.';
END $$;
