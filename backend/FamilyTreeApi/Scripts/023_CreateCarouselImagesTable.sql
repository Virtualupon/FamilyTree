-- Migration: Create CarouselImages table for onboarding page background carousel
-- Date: 2026-01-20
-- Description: Stores carousel images managed by SuperAdmins for the town selection page

-- Create the CarouselImages table
CREATE TABLE IF NOT EXISTS "CarouselImages" (
    "Id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "ImageUrl" VARCHAR(1000) NOT NULL,
    "StorageKey" VARCHAR(500),
    "Title" VARCHAR(200),
    "Description" VARCHAR(500),
    "DisplayOrder" INTEGER NOT NULL DEFAULT 0,
    "IsActive" BOOLEAN NOT NULL DEFAULT TRUE,
    "StorageType" INTEGER NOT NULL DEFAULT 1,
    "FileName" VARCHAR(255),
    "FileSize" BIGINT,
    "CreatedByUserId" BIGINT NOT NULL,
    "CreatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "UpdatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create index for active images query (most common query)
CREATE INDEX IF NOT EXISTS "IX_CarouselImages_IsActive_DisplayOrder"
ON "CarouselImages" ("IsActive", "DisplayOrder")
WHERE "IsActive" = TRUE;

-- Create index for display order
CREATE INDEX IF NOT EXISTS "IX_CarouselImages_DisplayOrder"
ON "CarouselImages" ("DisplayOrder");

-- Insert default placeholder images
INSERT INTO "CarouselImages" ("Id", "ImageUrl", "Title", "Description", "DisplayOrder", "IsActive", "StorageType", "CreatedByUserId")
VALUES
    (gen_random_uuid(), 'https://images.unsplash.com/photo-1539768942893-daf53e448371?w=1920&q=80', 'Nubian Heritage', 'Preserving our ancestral legacy', 0, TRUE, 1, 1),
    (gen_random_uuid(), 'https://images.unsplash.com/photo-1553913861-c0fddf2619ee?w=1920&q=80', 'Family Connections', 'Building bridges across generations', 1, TRUE, 1, 1),
    (gen_random_uuid(), 'https://images.unsplash.com/photo-1547471080-7cc2caa01a7e?w=1920&q=80', 'Cultural Roots', 'Honoring our traditions', 2, TRUE, 1, 1),
    (gen_random_uuid(), 'https://images.unsplash.com/photo-1489493887464-892be6d1daae?w=1920&q=80', 'Community', 'Stronger together', 3, TRUE, 1, 1),
    (gen_random_uuid(), 'https://images.unsplash.com/photo-1516026672322-bc52d61a55d5?w=1920&q=80', 'Heritage', 'Our shared history', 4, TRUE, 1, 1)
ON CONFLICT DO NOTHING;

-- Add comment to table
COMMENT ON TABLE "CarouselImages" IS 'Stores carousel/slideshow images for the onboarding town selection page. Managed by SuperAdmins.';
COMMENT ON COLUMN "CarouselImages"."StorageType" IS '1=External URL, 2=Local Storage, 3=Cloudflare R2';
