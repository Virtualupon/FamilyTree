-- ============================================================================
-- Migration: Add Soft Delete Fields to Core Entities
-- Date: 2026-01-17
-- Description: Adds IsDeleted, DeletedAt, DeletedByUserId to People,
--              ParentChildren, and Unions tables for soft delete support
-- ============================================================================

-- ============================================================================
-- PEOPLE TABLE
-- ============================================================================

-- Add soft delete columns to People
ALTER TABLE "People"
ADD COLUMN IF NOT EXISTS "IsDeleted" boolean NOT NULL DEFAULT FALSE;

ALTER TABLE "People"
ADD COLUMN IF NOT EXISTS "DeletedAt" timestamp with time zone;

ALTER TABLE "People"
ADD COLUMN IF NOT EXISTS "DeletedByUserId" bigint;

-- Add foreign key for DeletedByUserId
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'FK_People_DeletedByUser'
    ) THEN
        ALTER TABLE "People"
        ADD CONSTRAINT "FK_People_DeletedByUser"
        FOREIGN KEY ("DeletedByUserId") REFERENCES "AspNetUsers"("Id")
        ON DELETE SET NULL;
    END IF;
END $$;

-- Create partial index for non-deleted people (most common query)
CREATE INDEX IF NOT EXISTS "IX_People_IsDeleted"
    ON "People" ("IsDeleted")
    WHERE "IsDeleted" = FALSE;

-- ============================================================================
-- PARENTCHILDREN TABLE
-- ============================================================================

-- Add soft delete columns to ParentChildren
ALTER TABLE "ParentChildren"
ADD COLUMN IF NOT EXISTS "IsDeleted" boolean NOT NULL DEFAULT FALSE;

ALTER TABLE "ParentChildren"
ADD COLUMN IF NOT EXISTS "DeletedAt" timestamp with time zone;

ALTER TABLE "ParentChildren"
ADD COLUMN IF NOT EXISTS "DeletedByUserId" bigint;

-- Add foreign key for DeletedByUserId
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'FK_ParentChildren_DeletedByUser'
    ) THEN
        ALTER TABLE "ParentChildren"
        ADD CONSTRAINT "FK_ParentChildren_DeletedByUser"
        FOREIGN KEY ("DeletedByUserId") REFERENCES "AspNetUsers"("Id")
        ON DELETE SET NULL;
    END IF;
END $$;

-- Create partial index for non-deleted relationships
CREATE INDEX IF NOT EXISTS "IX_ParentChildren_IsDeleted"
    ON "ParentChildren" ("IsDeleted")
    WHERE "IsDeleted" = FALSE;

-- ============================================================================
-- UNIONS TABLE
-- ============================================================================

-- Add soft delete columns to Unions
ALTER TABLE "Unions"
ADD COLUMN IF NOT EXISTS "IsDeleted" boolean NOT NULL DEFAULT FALSE;

ALTER TABLE "Unions"
ADD COLUMN IF NOT EXISTS "DeletedAt" timestamp with time zone;

ALTER TABLE "Unions"
ADD COLUMN IF NOT EXISTS "DeletedByUserId" bigint;

-- Add foreign key for DeletedByUserId
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'FK_Unions_DeletedByUser'
    ) THEN
        ALTER TABLE "Unions"
        ADD CONSTRAINT "FK_Unions_DeletedByUser"
        FOREIGN KEY ("DeletedByUserId") REFERENCES "AspNetUsers"("Id")
        ON DELETE SET NULL;
    END IF;
END $$;

-- Create partial index for non-deleted unions
CREATE INDEX IF NOT EXISTS "IX_Unions_IsDeleted"
    ON "Unions" ("IsDeleted")
    WHERE "IsDeleted" = FALSE;

-- ============================================================================
-- UNIONMEMBERS TABLE
-- ============================================================================

-- Add soft delete columns to UnionMembers
ALTER TABLE "UnionMembers"
ADD COLUMN IF NOT EXISTS "IsDeleted" boolean NOT NULL DEFAULT FALSE;

ALTER TABLE "UnionMembers"
ADD COLUMN IF NOT EXISTS "DeletedAt" timestamp with time zone;

ALTER TABLE "UnionMembers"
ADD COLUMN IF NOT EXISTS "DeletedByUserId" bigint;

-- Add foreign key for DeletedByUserId
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'FK_UnionMembers_DeletedByUser'
    ) THEN
        ALTER TABLE "UnionMembers"
        ADD CONSTRAINT "FK_UnionMembers_DeletedByUser"
        FOREIGN KEY ("DeletedByUserId") REFERENCES "AspNetUsers"("Id")
        ON DELETE SET NULL;
    END IF;
END $$;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON COLUMN "People"."IsDeleted" IS
    'Soft delete flag. TRUE means record is deleted but preserved for audit.';
COMMENT ON COLUMN "People"."DeletedAt" IS
    'Timestamp when the record was soft deleted.';
COMMENT ON COLUMN "People"."DeletedByUserId" IS
    'User who performed the soft delete.';

COMMENT ON COLUMN "ParentChildren"."IsDeleted" IS
    'Soft delete flag. TRUE means relationship is deleted but preserved for audit.';
COMMENT ON COLUMN "ParentChildren"."DeletedAt" IS
    'Timestamp when the relationship was soft deleted.';
COMMENT ON COLUMN "ParentChildren"."DeletedByUserId" IS
    'User who performed the soft delete.';

COMMENT ON COLUMN "Unions"."IsDeleted" IS
    'Soft delete flag. TRUE means union is deleted but preserved for audit.';
COMMENT ON COLUMN "Unions"."DeletedAt" IS
    'Timestamp when the union was soft deleted.';
COMMENT ON COLUMN "Unions"."DeletedByUserId" IS
    'User who performed the soft delete.';
