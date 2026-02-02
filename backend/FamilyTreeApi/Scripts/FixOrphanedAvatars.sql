-- ============================================
-- Fix Orphaned Avatar Media (PostgreSQL)
-- ============================================
-- This script identifies media files that appear to be avatars
-- but aren't properly linked via Person.AvatarMediaId
--
-- Run the diagnostic queries first to review before applying fixes
-- ============================================

-- ============================================
-- DIAGNOSTIC QUERIES (Safe to run anytime)
-- ============================================

-- 1. Find media that look like avatars (Title contains 'Avatar')
--    but aren't linked to any Person.AvatarMediaId
SELECT
    m."Id" AS "MediaId",
    m."PersonId",
    m."Title",
    m."FileName",
    m."FileSize",
    m."Kind",
    m."CreatedAt",
    p."Id" AS "PersonId",
    COALESCE(p."NameEnglish", p."NameArabic", p."NameNobiin") AS "PersonName",
    p."AvatarMediaId" AS "CurrentAvatarMediaId"
FROM public."MediaFiles" m
LEFT JOIN public."People" p ON m."PersonId" = p."Id"
WHERE m."Title" ILIKE '%Avatar%'
  AND (p."AvatarMediaId" IS NULL OR p."AvatarMediaId" != m."Id")
ORDER BY m."CreatedAt" DESC;

-- 2. Find all People who have media uploaded but no AvatarMediaId set
--    (potential candidates for avatar linking)
SELECT
    p."Id" AS "PersonId",
    COALESCE(p."NameEnglish", p."NameArabic", p."NameNobiin") AS "PersonName",
    p."AvatarMediaId",
    COUNT(m."Id") AS "MediaCount",
    STRING_AGG(m."Title", ', ') AS "MediaTitles"
FROM public."People" p
INNER JOIN public."MediaFiles" m ON m."PersonId" = p."Id" AND m."Kind" = 0 -- Images only
WHERE p."AvatarMediaId" IS NULL
GROUP BY p."Id", p."NameEnglish", p."NameArabic", p."NameNobiin", p."AvatarMediaId"
HAVING COUNT(m."Id") > 0
ORDER BY COUNT(m."Id") DESC;

-- 3. Count summary of avatar issues
SELECT 'Media with Avatar title but not linked' AS "Issue", COUNT(*) AS "Count"
FROM public."MediaFiles" m
LEFT JOIN public."People" p ON m."PersonId" = p."Id"
WHERE m."Title" ILIKE '%Avatar%'
  AND (p."AvatarMediaId" IS NULL OR p."AvatarMediaId" != m."Id")

UNION ALL

SELECT 'People with images but no avatar set' AS "Issue", COUNT(DISTINCT p."Id") AS "Count"
FROM public."People" p
INNER JOIN public."MediaFiles" m ON m."PersonId" = p."Id" AND m."Kind" = 0
WHERE p."AvatarMediaId" IS NULL

UNION ALL

SELECT 'Properly linked avatars' AS "Issue", COUNT(*) AS "Count"
FROM public."People" p
WHERE p."AvatarMediaId" IS NOT NULL;

-- ============================================
-- FIX QUERIES (Review diagnostic results first!)
-- ============================================

-- Option A: Link media titled 'Avatar' to their Person.AvatarMediaId
-- This updates People where the PersonId on the media matches
-- and the media title contains 'Avatar'

BEGIN;

-- Show what will be updated
SELECT
    p."Id" AS "PersonId",
    COALESCE(p."NameEnglish", p."NameArabic", p."NameNobiin") AS "PersonName",
    p."AvatarMediaId" AS "OldAvatarMediaId",
    m."Id" AS "NewAvatarMediaId",
    m."Title" AS "MediaTitle",
    m."FileName"
FROM public."People" p
INNER JOIN public."MediaFiles" m ON m."PersonId" = p."Id"
WHERE m."Title" ILIKE '%Avatar%'
  AND m."Kind" = 0 -- Images only
  AND (p."AvatarMediaId" IS NULL OR p."AvatarMediaId" != m."Id");

-- Uncomment to apply the fix:
/*
UPDATE public."People" p
SET
    "AvatarMediaId" = m."Id",
    "UpdatedAt" = NOW()
FROM public."MediaFiles" m
WHERE m."PersonId" = p."Id"
  AND m."Title" ILIKE '%Avatar%'
  AND m."Kind" = 0 -- Images only
  AND (p."AvatarMediaId" IS NULL OR p."AvatarMediaId" != m."Id");
*/

-- Uncomment to commit changes:
-- COMMIT;

-- Or rollback if something looks wrong:
ROLLBACK;


-- ============================================
-- Option B: For each Person without an avatar,
-- set the OLDEST image media as their avatar
-- (assumes first uploaded image was likely the profile pic)
-- ============================================

BEGIN;

-- Show what will be updated
WITH "OldestImages" AS (
    SELECT
        m."PersonId",
        m."Id" AS "MediaId",
        m."FileName",
        m."CreatedAt",
        ROW_NUMBER() OVER (PARTITION BY m."PersonId" ORDER BY m."CreatedAt" ASC) AS "RowNum"
    FROM public."MediaFiles" m
    WHERE m."Kind" = 0 -- Images only
      AND m."PersonId" IS NOT NULL
)
SELECT
    p."Id" AS "PersonId",
    COALESCE(p."NameEnglish", p."NameArabic", p."NameNobiin") AS "PersonName",
    p."AvatarMediaId" AS "CurrentAvatarMediaId",
    oi."MediaId" AS "ProposedAvatarMediaId",
    oi."FileName",
    oi."CreatedAt"
FROM public."People" p
INNER JOIN "OldestImages" oi ON oi."PersonId" = p."Id" AND oi."RowNum" = 1
WHERE p."AvatarMediaId" IS NULL;

-- Uncomment to apply the fix:
/*
WITH "OldestImages" AS (
    SELECT
        m."PersonId",
        m."Id" AS "MediaId",
        ROW_NUMBER() OVER (PARTITION BY m."PersonId" ORDER BY m."CreatedAt" ASC) AS "RowNum"
    FROM public."MediaFiles" m
    WHERE m."Kind" = 0 -- Images only
      AND m."PersonId" IS NOT NULL
)
UPDATE public."People" p
SET
    "AvatarMediaId" = oi."MediaId",
    "UpdatedAt" = NOW()
FROM "OldestImages" oi
WHERE oi."PersonId" = p."Id"
  AND oi."RowNum" = 1
  AND p."AvatarMediaId" IS NULL;
*/

-- Uncomment to commit changes:
-- COMMIT;

-- Or rollback:
ROLLBACK;


-- ============================================
-- VERIFICATION QUERY
-- Run after applying fixes to confirm
-- ============================================

SELECT 'Total People' AS "Metric", COUNT(*) AS "Count"
FROM public."People"

UNION ALL

SELECT 'People with Avatar' AS "Metric", COUNT(*) AS "Count"
FROM public."People"
WHERE "AvatarMediaId" IS NOT NULL

UNION ALL

SELECT 'People without Avatar' AS "Metric", COUNT(*) AS "Count"
FROM public."People"
WHERE "AvatarMediaId" IS NULL

UNION ALL

SELECT 'Media in Gallery (excluding avatars)' AS "Metric", COUNT(*) AS "Count"
FROM public."MediaFiles" m
WHERE NOT EXISTS (
    SELECT 1 FROM public."People" p
    WHERE p."AvatarMediaId" = m."Id"
);
