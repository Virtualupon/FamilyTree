-- Add index on Action column for filtered activity log queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS "IX_AuditLogs_Action" ON "AuditLogs" ("Action");
