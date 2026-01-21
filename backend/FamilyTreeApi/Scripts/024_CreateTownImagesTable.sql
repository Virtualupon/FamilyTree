-- Migration: Create TownImages table for town-specific carousel images
-- Date: 2024
-- Description: Creates the TownImages table to store images associated with specific towns
--              Used for landing page and town selection page carousels
--              Supports Base64 upload with storage fields and Nobiin (Nubian) language

-- Create TownImages table
CREATE TABLE IF NOT EXISTS "TownImages" (
    "Id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "TownId" uuid NOT NULL,

    -- Storage fields (same pattern as MediaFiles table)
    "ImageUrl" varchar(500) NOT NULL,
    "StorageKey" varchar(500) NULL,
    "FileName" varchar(255) NULL,
    "MimeType" varchar(50) NULL,
    "FileSize" bigint NOT NULL DEFAULT 0,
    "StorageType" int NOT NULL DEFAULT 1,

    -- Metadata (Multilingual: Default + Nobiin + Arabic + English)
    "Title" varchar(200) NULL,
    "TitleNb" varchar(200) NULL,
    "TitleAr" varchar(200) NULL,
    "TitleEn" varchar(200) NULL,
    "Description" varchar(500) NULL,
    "DescriptionNb" varchar(500) NULL,
    "DescriptionAr" varchar(500) NULL,
    "DescriptionEn" varchar(500) NULL,
    "DisplayOrder" int NOT NULL DEFAULT 0,
    "IsActive" boolean NOT NULL DEFAULT true,

    -- Audit
    "CreatedAt" timestamp NOT NULL DEFAULT now(),
    "UpdatedAt" timestamp NOT NULL DEFAULT now(),
    "CreatedBy" bigint NOT NULL,
    "UpdatedBy" bigint NULL,

    CONSTRAINT "FK_TownImages_Towns" FOREIGN KEY ("TownId") REFERENCES "Towns"("Id") ON DELETE CASCADE,
    CONSTRAINT "FK_TownImages_CreatedBy" FOREIGN KEY ("CreatedBy") REFERENCES "AspNetUsers"("Id") ON DELETE RESTRICT,
    CONSTRAINT "FK_TownImages_UpdatedBy" FOREIGN KEY ("UpdatedBy") REFERENCES "AspNetUsers"("Id") ON DELETE RESTRICT
);

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS "IX_TownImages_TownId" ON "TownImages"("TownId");
CREATE INDEX IF NOT EXISTS "IX_TownImages_IsActive" ON "TownImages"("IsActive");
CREATE INDEX IF NOT EXISTS "IX_TownImages_TownId_DisplayOrder" ON "TownImages"("TownId", "DisplayOrder");

-- Add new columns if table already exists (for incremental migrations)
DO $$
BEGIN
    -- Add storage columns if they don't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'TownImages' AND column_name = 'StorageKey') THEN
        ALTER TABLE "TownImages" ADD COLUMN "StorageKey" varchar(500) NULL;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'TownImages' AND column_name = 'FileName') THEN
        ALTER TABLE "TownImages" ADD COLUMN "FileName" varchar(255) NULL;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'TownImages' AND column_name = 'MimeType') THEN
        ALTER TABLE "TownImages" ADD COLUMN "MimeType" varchar(50) NULL;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'TownImages' AND column_name = 'FileSize') THEN
        ALTER TABLE "TownImages" ADD COLUMN "FileSize" bigint NOT NULL DEFAULT 0;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'TownImages' AND column_name = 'StorageType') THEN
        ALTER TABLE "TownImages" ADD COLUMN "StorageType" int NOT NULL DEFAULT 1;
    END IF;

    -- Add Nobiin (Nubian) language columns if they don't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'TownImages' AND column_name = 'TitleNb') THEN
        ALTER TABLE "TownImages" ADD COLUMN "TitleNb" varchar(200) NULL;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'TownImages' AND column_name = 'DescriptionNb') THEN
        ALTER TABLE "TownImages" ADD COLUMN "DescriptionNb" varchar(500) NULL;
    END IF;
END $$;

-- Insert sample images for existing towns (using Unsplash images)
-- These are sample Nubian/Sudanese themed images
DO $$
DECLARE
    v_town_id uuid;
    v_user_id bigint;
BEGIN
    -- Get the first SuperAdmin user ID for CreatedBy (using ASP.NET Identity roles)
    SELECT u."Id" INTO v_user_id
    FROM "AspNetUsers" u
    INNER JOIN "AspNetUserRoles" ur ON u."Id" = ur."UserId"
    INNER JOIN "AspNetRoles" r ON ur."RoleId" = r."Id"
    WHERE r."Name" = 'SuperAdmin'
    LIMIT 1;

    -- If no SuperAdmin found, use the first user
    IF v_user_id IS NULL THEN
        SELECT "Id" INTO v_user_id FROM "AspNetUsers" LIMIT 1;
    END IF;

    -- Only proceed if we have a user
    IF v_user_id IS NOT NULL THEN
        -- Insert images for each town (if towns exist)
        FOR v_town_id IN SELECT "Id" FROM "Towns" LIMIT 5
        LOOP
            -- Insert 2 sample images per town (with Nobiin support)
            INSERT INTO "TownImages" (
                "TownId", "ImageUrl",
                "Title", "TitleNb", "TitleAr", "TitleEn",
                "Description", "DescriptionNb", "DescriptionAr", "DescriptionEn",
                "DisplayOrder", "IsActive", "CreatedBy", "StorageType"
            )
            VALUES
                (v_town_id,
                 'https://images.unsplash.com/photo-1539768942893-daf53e448371?w=1920&q=80',
                 'Nubian Heritage',
                 'Nubian Heritage', -- Nobiin placeholder
                 'التراث النوبي',
                 'Nubian Heritage',
                 'Traditional Nubian architecture and culture',
                 'Traditional Nubian architecture and culture', -- Nobiin placeholder
                 'العمارة والثقافة النوبية التقليدية',
                 'Traditional Nubian architecture and culture',
                 0, true, v_user_id, 1),
                (v_town_id,
                 'https://images.unsplash.com/photo-1553913861-c0fddf2619ee?w=1920&q=80',
                 'Nile Valley',
                 'Nile Valley', -- Nobiin placeholder
                 'وادي النيل',
                 'Nile Valley',
                 'Beautiful landscapes of the Nile Valley',
                 'Beautiful landscapes of the Nile Valley', -- Nobiin placeholder
                 'مناظر طبيعية جميلة لوادي النيل',
                 'Beautiful landscapes of the Nile Valley',
                 1, true, v_user_id, 1)
            ON CONFLICT DO NOTHING;
        END LOOP;
    END IF;
END $$;
