-- Migration: Add tri-language fields for Media and PersonMedia tables
-- This adds support for storing translations in Arabic and Nobiin languages
-- Run this script on your PostgreSQL database

-- Add tri-language description fields to MediaFiles table
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'MediaFiles' AND column_name = 'DescriptionAr') THEN
        ALTER TABLE "MediaFiles" ADD COLUMN "DescriptionAr" text NULL;
        RAISE NOTICE 'Added DescriptionAr column to MediaFiles';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'MediaFiles' AND column_name = 'DescriptionNob') THEN
        ALTER TABLE "MediaFiles" ADD COLUMN "DescriptionNob" text NULL;
        RAISE NOTICE 'Added DescriptionNob column to MediaFiles';
    END IF;
END $$;

-- Add tri-language notes fields to PersonMedia table
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'PersonMedia' AND column_name = 'NotesAr') THEN
        ALTER TABLE "PersonMedia" ADD COLUMN "NotesAr" text NULL;
        RAISE NOTICE 'Added NotesAr column to PersonMedia';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'PersonMedia' AND column_name = 'NotesNob') THEN
        ALTER TABLE "PersonMedia" ADD COLUMN "NotesNob" text NULL;
        RAISE NOTICE 'Added NotesNob column to PersonMedia';
    END IF;
END $$;

-- Verify the columns were added
SELECT
    table_name,
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns
WHERE table_name IN ('MediaFiles', 'PersonMedia')
    AND column_name IN ('DescriptionAr', 'DescriptionNob', 'NotesAr', 'NotesNob')
ORDER BY table_name, column_name;
