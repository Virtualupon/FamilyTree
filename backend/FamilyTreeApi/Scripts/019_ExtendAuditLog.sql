-- ============================================================================
-- Migration: Extend AuditLog for Suggestion Tracking
-- Date: 2026-01-17
-- Description: Adds SuggestionId, PreviousValuesJson, NewValuesJson to AuditLogs
--              for comprehensive change tracking and rollback capability
-- ============================================================================

-- Add SuggestionId column to link audit entries to suggestions
ALTER TABLE "AuditLogs"
ADD COLUMN IF NOT EXISTS "SuggestionId" uuid;

-- Add PreviousValuesJson to store state before change
ALTER TABLE "AuditLogs"
ADD COLUMN IF NOT EXISTS "PreviousValuesJson" jsonb;

-- Add NewValuesJson to store state after change
ALTER TABLE "AuditLogs"
ADD COLUMN IF NOT EXISTS "NewValuesJson" jsonb;

-- Note: Foreign key for SuggestionId will be added in 020_CreateSuggestionTables.sql
-- after the RelationshipSuggestions table is created

-- Create index for SuggestionId queries
CREATE INDEX IF NOT EXISTS "IX_AuditLogs_SuggestionId"
    ON "AuditLogs" ("SuggestionId")
    WHERE "SuggestionId" IS NOT NULL;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON COLUMN "AuditLogs"."SuggestionId" IS
    'Reference to the suggestion that triggered this change (if applicable).';

COMMENT ON COLUMN "AuditLogs"."PreviousValuesJson" IS
    'JSON snapshot of entity state before the change. Used for rollback.';

COMMENT ON COLUMN "AuditLogs"."NewValuesJson" IS
    'JSON snapshot of entity state after the change.';
