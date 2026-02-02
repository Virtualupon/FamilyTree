-- Migration: Add tri-language Notes fields to People table
-- This adds support for storing Notes translations in Arabic and Nobiin languages
-- Run this script on your PostgreSQL database

-- Add tri-language notes fields to People table
DO $$
BEGIN
    -- Add NotesAr column (Arabic)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'People' AND column_name = 'NotesAr') THEN
        ALTER TABLE "People" ADD COLUMN "NotesAr" text NULL;
        RAISE NOTICE 'Added NotesAr column to People';
    ELSE
        RAISE NOTICE 'NotesAr column already exists in People';
    END IF;

    -- Add NotesNob column (Nobiin)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'People' AND column_name = 'NotesNob') THEN
        ALTER TABLE "People" ADD COLUMN "NotesNob" text NULL;
        RAISE NOTICE 'Added NotesNob column to People';
    ELSE
        RAISE NOTICE 'NotesNob column already exists in People';
    END IF;
END $$;

-- Verify the columns were added
SELECT
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns
WHERE table_name = 'People'
    AND column_name IN ('Notes', 'NotesAr', 'NotesNob')
ORDER BY column_name;
