-- ============================================================================
-- 035: Create Support Ticket System
-- Tables: SupportTickets, SupportTicketAttachments, SupportTicketComments
-- Platform-level (no OrgId) — any authenticated user can submit
-- ============================================================================

-- ============================================================================
-- 1. SupportTickets
-- ============================================================================
CREATE TABLE IF NOT EXISTS "SupportTickets" (
    "Id"                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "TicketNumber"      serial NOT NULL,
    "Category"          int NOT NULL DEFAULT 0,          -- 0=Bug, 1=Enhancement
    "Priority"          int NOT NULL DEFAULT 1,          -- 0=Low, 1=Medium, 2=High
    "Status"            int NOT NULL DEFAULT 0,          -- 0=Open, 1=WorkingOnIt, 2=Resolved, 3=Closed
    "Subject"           varchar(200) NOT NULL,
    "Description"       text NOT NULL,
    "StepsToReproduce"  text,
    "PageUrl"           varchar(500),
    "BrowserInfo"       varchar(500),

    -- Submitter
    "SubmittedByUserId" bigint NOT NULL REFERENCES "AspNetUsers"("Id") ON DELETE RESTRICT,
    "SubmittedAt"       timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- Assignment
    "AssignedToUserId"  bigint REFERENCES "AspNetUsers"("Id") ON DELETE SET NULL,
    "AssignedAt"        timestamptz,

    -- Admin internal notes (hidden from submitter)
    "AdminNotes"        text,

    -- Resolution
    "ResolvedAt"        timestamptz,
    "ResolvedByUserId"  bigint REFERENCES "AspNetUsers"("Id") ON DELETE SET NULL,
    "ResolutionNotes"   text,

    -- Timestamps & soft delete
    "CreatedAt"         timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "UpdatedAt"         timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "IsDeleted"         boolean NOT NULL DEFAULT FALSE,
    "DeletedAt"         timestamptz,
    "DeletedByUserId"   bigint REFERENCES "AspNetUsers"("Id") ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "IX_SupportTickets_TicketNumber"
    ON "SupportTickets" ("TicketNumber");

CREATE INDEX IF NOT EXISTS "IX_SupportTickets_Status"
    ON "SupportTickets" ("Status")
    WHERE "IsDeleted" = FALSE;

CREATE INDEX IF NOT EXISTS "IX_SupportTickets_SubmittedByUserId"
    ON "SupportTickets" ("SubmittedByUserId")
    WHERE "IsDeleted" = FALSE;

CREATE INDEX IF NOT EXISTS "IX_SupportTickets_AssignedToUserId"
    ON "SupportTickets" ("AssignedToUserId")
    WHERE "IsDeleted" = FALSE AND "AssignedToUserId" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "IX_SupportTickets_Category_Status"
    ON "SupportTickets" ("Category", "Status")
    WHERE "IsDeleted" = FALSE;

CREATE INDEX IF NOT EXISTS "IX_SupportTickets_Priority_Status"
    ON "SupportTickets" ("Priority" DESC, "Status")
    WHERE "IsDeleted" = FALSE;

-- ============================================================================
-- 2. SupportTicketAttachments
-- ============================================================================
CREATE TABLE IF NOT EXISTS "SupportTicketAttachments" (
    "Id"                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "TicketId"          uuid NOT NULL REFERENCES "SupportTickets"("Id") ON DELETE CASCADE,
    "FileName"          varchar(255) NOT NULL,
    "StorageKey"        varchar(500) NOT NULL,
    "Url"               varchar(500) NOT NULL,
    "MimeType"          varchar(100),
    "FileSize"          bigint NOT NULL DEFAULT 0,
    "UploadedByUserId"  bigint NOT NULL REFERENCES "AspNetUsers"("Id") ON DELETE RESTRICT,
    "CreatedAt"         timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "IX_SupportTicketAttachments_TicketId"
    ON "SupportTicketAttachments" ("TicketId");

-- ============================================================================
-- 3. SupportTicketComments
-- ============================================================================
CREATE TABLE IF NOT EXISTS "SupportTicketComments" (
    "Id"                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "TicketId"          uuid NOT NULL REFERENCES "SupportTickets"("Id") ON DELETE CASCADE,
    "Content"           text NOT NULL,
    "IsAdminResponse"   boolean NOT NULL DEFAULT FALSE,
    "AuthorUserId"      bigint NOT NULL REFERENCES "AspNetUsers"("Id") ON DELETE RESTRICT,
    "CreatedAt"         timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "UpdatedAt"         timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "IsDeleted"         boolean NOT NULL DEFAULT FALSE,
    "DeletedAt"         timestamptz
);

CREATE INDEX IF NOT EXISTS "IX_SupportTicketComments_TicketId"
    ON "SupportTicketComments" ("TicketId")
    WHERE "IsDeleted" = FALSE;

-- ============================================================================
-- Permissions
-- ============================================================================
GRANT SELECT, INSERT, UPDATE, DELETE ON "SupportTickets" TO PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON "SupportTicketAttachments" TO PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON "SupportTicketComments" TO PUBLIC;
GRANT USAGE, SELECT ON SEQUENCE "SupportTickets_TicketNumber_seq" TO PUBLIC;
