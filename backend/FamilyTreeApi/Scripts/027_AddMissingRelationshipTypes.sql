-- =============================================
-- Script: 027_AddMissingRelationshipTypes.sql
-- Description: Add missing relationship types to FamilyRelationshipTypes table
-- Note: Replace [NOBIIN_*] placeholders with correct Nobiin translations before running
-- Transaction: Wrapped in BEGIN/COMMIT with automatic ROLLBACK on error
-- =============================================

BEGIN;

-- Generic Terms (used as fallbacks when gender unknown)
INSERT INTO "FamilyRelationshipTypes" ("NameArabic", "NameEnglish", "NameNubian", "Category", "SortOrder", "IsActive", "CreatedAt")
VALUES
    ('طفل', 'Child', '[NOBIIN_CHILD]', 'Immediate', 39, TRUE, NOW()),
    ('والد', 'Parent', '[NOBIIN_PARENT]', 'Immediate', 40, TRUE, NOW()),
    ('شقيق', 'Sibling', '[NOBIIN_SIBLING]', 'Immediate', 41, TRUE, NOW()),
    ('زوج/ة', 'Spouse', '[NOBIIN_SPOUSE]', 'Immediate', 42, TRUE, NOW());

-- Great-Grandparents (new category)
INSERT INTO "FamilyRelationshipTypes" ("NameArabic", "NameEnglish", "NameNubian", "Category", "SortOrder", "IsActive", "CreatedAt")
VALUES
    ('جد أكبر', 'Great-Grandfather', '[NOBIIN_GREAT_GRANDFATHER]', 'Great-Grandparents', 43, TRUE, NOW()),
    ('جدة كبرى', 'Great-Grandmother', '[NOBIIN_GREAT_GRANDMOTHER]', 'Great-Grandparents', 44, TRUE, NOW()),
    ('جد/ة أكبر', 'Great-Grandparent', '[NOBIIN_GREAT_GRANDPARENT]', 'Great-Grandparents', 45, TRUE, NOW());

-- Generic grandparent/grandchild terms
INSERT INTO "FamilyRelationshipTypes" ("NameArabic", "NameEnglish", "NameNubian", "Category", "SortOrder", "IsActive", "CreatedAt")
VALUES
    ('جد/ة', 'Grandparent', '[NOBIIN_GRANDPARENT]', 'Grandparents', 46, TRUE, NOW()),
    ('حفيد/ة', 'Grandchild', '[NOBIIN_GRANDCHILD]', 'Grandchildren', 47, TRUE, NOW()),
    ('حفيد/ة أكبر', 'Great-Grandchild', '[NOBIIN_GREAT_GRANDCHILD]', 'Grandchildren', 48, TRUE, NOW());

-- Cousin Variations (degrees and removed)
INSERT INTO "FamilyRelationshipTypes" ("NameArabic", "NameEnglish", "NameNubian", "Category", "SortOrder", "IsActive", "CreatedAt")
VALUES
    ('ابن/ة عم أو خال', 'First Cousin', '[NOBIIN_FIRST_COUSIN]', 'Cousins', 49, TRUE, NOW()),
    ('ابن/ة عم الأب', 'Second Cousin', '[NOBIIN_SECOND_COUSIN]', 'Cousins', 50, TRUE, NOW()),
    ('ابن/ة عم الجد', 'Third Cousin', '[NOBIIN_THIRD_COUSIN]', 'Cousins', 51, TRUE, NOW()),
    ('ابن ابن العم', 'Cousin Once Removed', '[NOBIIN_COUSIN_ONCE_REMOVED]', 'Cousins', 52, TRUE, NOW()),
    ('حفيد ابن العم', 'Cousin Twice Removed', '[NOBIIN_COUSIN_TWICE_REMOVED]', 'Cousins', 53, TRUE, NOW());

-- Half-Siblings
INSERT INTO "FamilyRelationshipTypes" ("NameArabic", "NameEnglish", "NameNubian", "Category", "SortOrder", "IsActive", "CreatedAt")
VALUES
    ('أخ غير شقيق', 'Half-Brother', '[NOBIIN_HALF_BROTHER]', 'Half-Siblings', 54, TRUE, NOW()),
    ('أخت غير شقيقة', 'Half-Sister', '[NOBIIN_HALF_SISTER]', 'Half-Siblings', 55, TRUE, NOW());

-- Generic In-Laws (Brother-in-Law and Sister-in-Law as single terms)
-- Note: DB already has specific ones (Sister's husband, Brother's wife), these are generic
INSERT INTO "FamilyRelationshipTypes" ("NameArabic", "NameEnglish", "NameNubian", "Category", "SortOrder", "IsActive", "CreatedAt")
VALUES
    ('صهر', 'Brother-in-Law', '[NOBIIN_BROTHER_IN_LAW]', 'In-Laws', 56, TRUE, NOW()),
    ('سلفة', 'Sister-in-Law', '[NOBIIN_SISTER_IN_LAW]', 'In-Laws', 57, TRUE, NOW());

-- Abstract/Genealogical Terms
INSERT INTO "FamilyRelationshipTypes" ("NameArabic", "NameEnglish", "NameNubian", "Category", "SortOrder", "IsActive", "CreatedAt")
VALUES
    ('سلف', 'Ancestor', '[NOBIIN_ANCESTOR]', 'Abstract', 58, TRUE, NOW()),
    ('نسل', 'Descendant', '[NOBIIN_DESCENDANT]', 'Abstract', 59, TRUE, NOW()),
    ('قريب بعيد', 'Distant Relative', '[NOBIIN_DISTANT_RELATIVE]', 'Abstract', 60, TRUE, NOW());

-- =============================================
-- Validation: Ensure no Nobiin placeholders remain
-- This will cause a ROLLBACK if any placeholders are found
-- =============================================
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM "FamilyRelationshipTypes" WHERE "NameNubian" LIKE '[NOBIIN_%]') THEN
        RAISE EXCEPTION 'Nobiin placeholders not replaced - aborting. Please replace all [NOBIIN_*] values before running this script.';
    END IF;
END $$;

COMMIT;

-- =============================================
-- Summary of additions:
-- =============================================
-- Generic Terms:       4 (Child, Parent, Sibling, Spouse)
-- Great-Grandparents:  3 (Great-Grandfather, Great-Grandmother, Great-Grandparent)
-- Generic Grand:       3 (Grandparent, Grandchild, Great-Grandchild)
-- Cousin Variations:   5 (First, Second, Third, Once Removed, Twice Removed)
-- Half-Siblings:       2 (Half-Brother, Half-Sister)
-- Generic In-Laws:     2 (Brother-in-Law, Sister-in-Law)
-- Abstract:            3 (Ancestor, Descendant, Distant Relative)
-- =============================================
-- TOTAL NEW RECORDS:  22
-- TOTAL IN TABLE:     60 (38 existing + 22 new)
-- =============================================

-- Verification query (run after insert):
-- SELECT "Category", COUNT(*) as "Count"
-- FROM "FamilyRelationshipTypes"
-- GROUP BY "Category"
-- ORDER BY MIN("SortOrder");
