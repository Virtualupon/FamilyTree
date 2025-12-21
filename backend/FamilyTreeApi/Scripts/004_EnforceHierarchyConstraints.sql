-- ============================================================================
-- Script: 004_EnforceHierarchyConstraints.sql
-- Purpose: Enforce the mandatory hierarchy: Town -> Family Tree -> Person
--          Every family tree MUST belong to a town (TownId NOT NULL)
-- ============================================================================

-- STEP 1: Identify any orphaned trees (trees without a town)
-- Run this first to see what needs to be fixed manually before migration
SELECT
    o."Id" AS "TreeId",
    o."Name" AS "TreeName",
    o."OwnerId",
    u."Email" AS "OwnerEmail",
    o."CreatedAt"
FROM "Orgs" o
LEFT JOIN "AspNetUsers" u ON o."OwnerId" = u."Id"
WHERE o."TownId" IS NULL;

-- STEP 2: If there are orphaned trees, you must assign them to a town first
-- Example: Assign all orphaned trees to a default town
-- UNCOMMENT AND MODIFY as needed:
--
-- UPDATE "Orgs"
-- SET "TownId" = (SELECT "Id" FROM "Towns" WHERE "Name" = 'Default Town' LIMIT 1)
-- WHERE "TownId" IS NULL;

-- STEP 3: After fixing orphaned trees, make TownId NOT NULL
-- WARNING: This will fail if there are still trees without a TownId
ALTER TABLE "Orgs"
ALTER COLUMN "TownId" SET NOT NULL;

-- STEP 4: Update the foreign key constraint to RESTRICT instead of SET NULL
-- First drop the existing constraint
ALTER TABLE "Orgs"
DROP CONSTRAINT IF EXISTS "FK_Orgs_Towns_TownId";

-- Then recreate with RESTRICT (prevents deleting a town that has family trees)
ALTER TABLE "Orgs"
ADD CONSTRAINT "FK_Orgs_Towns_TownId"
FOREIGN KEY ("TownId")
REFERENCES "Towns"("Id")
ON DELETE RESTRICT;

-- STEP 5: Add a comment to document the hierarchy rule
COMMENT ON COLUMN "Orgs"."TownId" IS 'REQUIRED: Every family tree must belong to a town. Part of the Town->Family->Person hierarchy.';

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

-- Verify no orphaned trees remain
SELECT COUNT(*) AS "OrphanedTrees"
FROM "Orgs"
WHERE "TownId" IS NULL;
-- Expected result: 0

-- Verify the constraint is NOT NULL
SELECT
    column_name,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_name = 'Orgs' AND column_name = 'TownId';
-- Expected: is_nullable = 'NO'

-- Show hierarchy summary
SELECT
    t."Name" AS "Town",
    COUNT(DISTINCT o."Id") AS "FamilyTrees",
    COUNT(DISTINCT p."Id") AS "People"
FROM "Towns" t
LEFT JOIN "Orgs" o ON t."Id" = o."TownId"
LEFT JOIN "People" p ON o."Id" = p."OrgId"
GROUP BY t."Id", t."Name"
ORDER BY t."Name";
