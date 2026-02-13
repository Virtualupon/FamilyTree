-- ============================================================
-- Migration: Centralized Notes Table
-- Date: 2026-02-11
-- Description: Create a centralized EntityNotes table (one-to-many)
--   replacing inline Notes/NotesAr/NotesNob fields on all entities.
--   Migrates existing data, then drops the old columns.
-- ============================================================

-- ============================================================
-- STEP 1: Create the EntityNotes table
-- ============================================================
CREATE TABLE IF NOT EXISTS "EntityNotes" (
    "Id"            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "EntityType"    varchar(50) NOT NULL,   -- 'Person', 'Union', 'ParentChild', 'PersonMedia', 'PersonLink'
    "EntityId"      uuid NOT NULL,
    "NotesEn"       text,                   -- English
    "NotesAr"       text,                   -- Arabic
    "NotesNob"      text,                   -- Nobiin
    "CreatedByUserId" bigint NULL,
    "CreatedAt"     timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "UpdatedAt"     timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "IsDeleted"     boolean NOT NULL DEFAULT FALSE,
    "DeletedAt"     timestamp with time zone,
    "DeletedByUserId" bigint NULL
);

-- Indexes for efficient lookup
CREATE INDEX IF NOT EXISTS "IX_EntityNotes_EntityType_EntityId"
    ON "EntityNotes" ("EntityType", "EntityId")
    WHERE "IsDeleted" = FALSE;

CREATE INDEX IF NOT EXISTS "IX_EntityNotes_EntityId"
    ON "EntityNotes" ("EntityId")
    WHERE "IsDeleted" = FALSE;

CREATE INDEX IF NOT EXISTS "IX_EntityNotes_CreatedAt"
    ON "EntityNotes" ("CreatedAt" DESC);

-- ============================================================
-- STEP 2: Migrate existing inline notes data into EntityNotes
-- Only inserts if not already migrated (idempotent)
-- ============================================================

-- 2a. Migrate People notes (has Notes, NotesAr, NotesNob)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'People' AND column_name = 'Notes') THEN
        INSERT INTO "EntityNotes" ("EntityType", "EntityId", "NotesEn", "NotesAr", "NotesNob", "CreatedAt", "UpdatedAt")
        SELECT
            'Person',
            p."Id",
            NULLIF(TRIM(p."Notes"), ''),
            NULLIF(TRIM(COALESCE(p."NotesAr", '')), ''),
            NULLIF(TRIM(COALESCE(p."NotesNob", '')), ''),
            COALESCE(p."CreatedAt", CURRENT_TIMESTAMP),
            CURRENT_TIMESTAMP
        FROM "People" p
        WHERE p."IsDeleted" = FALSE
          AND (
              NULLIF(TRIM(COALESCE(p."Notes", '')), '') IS NOT NULL
              OR NULLIF(TRIM(COALESCE(p."NotesAr", '')), '') IS NOT NULL
              OR NULLIF(TRIM(COALESCE(p."NotesNob", '')), '') IS NOT NULL
          )
          AND NOT EXISTS (
              SELECT 1 FROM "EntityNotes" en
              WHERE en."EntityType" = 'Person' AND en."EntityId" = p."Id"
          );

        RAISE NOTICE 'Migrated People notes to EntityNotes table';
    END IF;
END $$;

-- 2b. Migrate PersonMedia notes (has Notes, NotesAr, NotesNob)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'PersonMedia' AND column_name = 'Notes') THEN
        INSERT INTO "EntityNotes" ("EntityType", "EntityId", "NotesEn", "NotesAr", "NotesNob", "CreatedAt", "UpdatedAt")
        SELECT
            'PersonMedia',
            pm."Id",
            NULLIF(TRIM(pm."Notes"), ''),
            NULLIF(TRIM(COALESCE(pm."NotesAr", '')), ''),
            NULLIF(TRIM(COALESCE(pm."NotesNob", '')), ''),
            COALESCE(pm."CreatedAt", CURRENT_TIMESTAMP),
            CURRENT_TIMESTAMP
        FROM "PersonMedia" pm
        WHERE (
              NULLIF(TRIM(COALESCE(pm."Notes", '')), '') IS NOT NULL
              OR NULLIF(TRIM(COALESCE(pm."NotesAr", '')), '') IS NOT NULL
              OR NULLIF(TRIM(COALESCE(pm."NotesNob", '')), '') IS NOT NULL
          )
          AND NOT EXISTS (
              SELECT 1 FROM "EntityNotes" en
              WHERE en."EntityType" = 'PersonMedia' AND en."EntityId" = pm."Id"
          );

        RAISE NOTICE 'Migrated PersonMedia notes to EntityNotes table';
    END IF;
END $$;

-- 2c. Migrate Union notes (has only Notes)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Unions' AND column_name = 'Notes') THEN
        INSERT INTO "EntityNotes" ("EntityType", "EntityId", "NotesEn", "CreatedAt", "UpdatedAt")
        SELECT
            'Union',
            u."Id",
            NULLIF(TRIM(u."Notes"), ''),
            COALESCE(u."CreatedAt", CURRENT_TIMESTAMP),
            CURRENT_TIMESTAMP
        FROM "Unions" u
        WHERE u."IsDeleted" = FALSE
          AND NULLIF(TRIM(COALESCE(u."Notes", '')), '') IS NOT NULL
          AND NOT EXISTS (
              SELECT 1 FROM "EntityNotes" en
              WHERE en."EntityType" = 'Union' AND en."EntityId" = u."Id"
          );

        RAISE NOTICE 'Migrated Union notes to EntityNotes table';
    END IF;
END $$;

-- 2d. Migrate ParentChild notes (has only Notes)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ParentChildren' AND column_name = 'Notes') THEN
        INSERT INTO "EntityNotes" ("EntityType", "EntityId", "NotesEn", "CreatedAt", "UpdatedAt")
        SELECT
            'ParentChild',
            pc."Id",
            NULLIF(TRIM(pc."Notes"), ''),
            COALESCE(pc."CreatedAt", CURRENT_TIMESTAMP),
            CURRENT_TIMESTAMP
        FROM "ParentChildren" pc
        WHERE pc."IsDeleted" = FALSE
          AND NULLIF(TRIM(COALESCE(pc."Notes", '')), '') IS NOT NULL
          AND NOT EXISTS (
              SELECT 1 FROM "EntityNotes" en
              WHERE en."EntityType" = 'ParentChild' AND en."EntityId" = pc."Id"
          );

        RAISE NOTICE 'Migrated ParentChild notes to EntityNotes table';
    END IF;
END $$;

-- 2e. Migrate PersonLink notes (has only Notes)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'PersonLinks' AND column_name = 'Notes') THEN
        INSERT INTO "EntityNotes" ("EntityType", "EntityId", "NotesEn", "CreatedAt", "UpdatedAt")
        SELECT
            'PersonLink',
            pl."Id",
            NULLIF(TRIM(pl."Notes"), ''),
            COALESCE(pl."CreatedAt", CURRENT_TIMESTAMP),
            CURRENT_TIMESTAMP
        FROM "PersonLinks" pl
        WHERE NULLIF(TRIM(COALESCE(pl."Notes", '')), '') IS NOT NULL
          AND NOT EXISTS (
              SELECT 1 FROM "EntityNotes" en
              WHERE en."EntityType" = 'PersonLink' AND en."EntityId" = pl."Id"
          );

        RAISE NOTICE 'Migrated PersonLink notes to EntityNotes table';
    END IF;
END $$;

-- ============================================================
-- STEP 3: Recreate SearchVector BEFORE dropping Notes
-- (SearchVector depends on Notes, so must be dropped first)
-- ============================================================
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'EntityNotes') THEN
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'People' AND column_name = 'SearchVector')
           AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'People' AND column_name = 'Notes') THEN
            -- Drop the old SearchVector that depends on Notes
            DROP INDEX IF EXISTS "IX_People_SearchVector";
            ALTER TABLE "People" DROP COLUMN "SearchVector";
            RAISE NOTICE 'Dropped old People.SearchVector (depended on Notes)';

            -- Recreate SearchVector without Notes reference
            ALTER TABLE "People" ADD COLUMN "SearchVector" tsvector
                GENERATED ALWAYS AS (
                    to_tsvector('english', coalesce("PrimaryName",'') || ' ' || coalesce("Occupation",''))
                ) STORED;
            CREATE INDEX "IX_People_SearchVector" ON "People" USING GIN ("SearchVector");
            RAISE NOTICE 'Recreated People.SearchVector without Notes reference';
        END IF;
    END IF;
END $$;

-- ============================================================
-- STEP 4: Drop old inline columns (only if EntityNotes exists)
-- ============================================================

-- People: drop Notes, NotesAr, NotesNob
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'EntityNotes') THEN
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'People' AND column_name = 'Notes') THEN
            ALTER TABLE "People" DROP COLUMN "Notes";
            RAISE NOTICE 'Dropped People.Notes column';
        END IF;
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'People' AND column_name = 'NotesAr') THEN
            ALTER TABLE "People" DROP COLUMN "NotesAr";
            RAISE NOTICE 'Dropped People.NotesAr column';
        END IF;
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'People' AND column_name = 'NotesNob') THEN
            ALTER TABLE "People" DROP COLUMN "NotesNob";
            RAISE NOTICE 'Dropped People.NotesNob column';
        END IF;
    END IF;
END $$;

-- PersonMedia: drop Notes, NotesAr, NotesNob
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'EntityNotes') THEN
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'PersonMedia' AND column_name = 'Notes') THEN
            ALTER TABLE "PersonMedia" DROP COLUMN "Notes";
            RAISE NOTICE 'Dropped PersonMedia.Notes column';
        END IF;
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'PersonMedia' AND column_name = 'NotesAr') THEN
            ALTER TABLE "PersonMedia" DROP COLUMN "NotesAr";
            RAISE NOTICE 'Dropped PersonMedia.NotesAr column';
        END IF;
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'PersonMedia' AND column_name = 'NotesNob') THEN
            ALTER TABLE "PersonMedia" DROP COLUMN "NotesNob";
            RAISE NOTICE 'Dropped PersonMedia.NotesNob column';
        END IF;
    END IF;
END $$;

-- Unions: drop Notes
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'EntityNotes') THEN
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Unions' AND column_name = 'Notes') THEN
            ALTER TABLE "Unions" DROP COLUMN "Notes";
            RAISE NOTICE 'Dropped Unions.Notes column';
        END IF;
    END IF;
END $$;

-- ParentChildren: drop Notes
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'EntityNotes') THEN
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ParentChildren' AND column_name = 'Notes') THEN
            ALTER TABLE "ParentChildren" DROP COLUMN "Notes";
            RAISE NOTICE 'Dropped ParentChildren.Notes column';
        END IF;
    END IF;
END $$;

-- PersonLinks: drop Notes
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'EntityNotes') THEN
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'PersonLinks' AND column_name = 'Notes') THEN
            ALTER TABLE "PersonLinks" DROP COLUMN "Notes";
            RAISE NOTICE 'Dropped PersonLinks.Notes column';
        END IF;
    END IF;
END $$;

-- GRANT PERMISSIONS
GRANT SELECT, INSERT, UPDATE, DELETE ON "EntityNotes" TO PUBLIC;
