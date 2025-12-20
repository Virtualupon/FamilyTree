-- ============================================================================
-- Create PersonMedia junction table for many-to-many Person-Media relationship
-- ============================================================================

-- Create the table
CREATE TABLE IF NOT EXISTS "PersonMedia" (
    "Id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "PersonId" UUID NOT NULL,
    "MediaId" UUID NOT NULL,
    "IsPrimary" BOOLEAN NOT NULL DEFAULT FALSE,
    "SortOrder" INT NOT NULL DEFAULT 0,
    "Notes" TEXT NULL,
    "CreatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "LinkedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Foreign keys
    CONSTRAINT "FK_PersonMedia_People_PersonId"
        FOREIGN KEY ("PersonId") REFERENCES "People" ("Id") ON DELETE CASCADE,
    CONSTRAINT "FK_PersonMedia_MediaFiles_MediaId"
        FOREIGN KEY ("MediaId") REFERENCES "MediaFiles" ("Id") ON DELETE CASCADE
);

-- Create indexes
CREATE INDEX IF NOT EXISTS "IX_PersonMedia_PersonId" ON "PersonMedia" ("PersonId");
CREATE INDEX IF NOT EXISTS "IX_PersonMedia_MediaId" ON "PersonMedia" ("MediaId");
CREATE UNIQUE INDEX IF NOT EXISTS "IX_PersonMedia_PersonId_MediaId" ON "PersonMedia" ("PersonId", "MediaId");

-- Verify
SELECT 'PersonMedia table created successfully' as status;
