-- ============================================================================
-- Script: 003_CreateNameMappings.sql
-- Purpose: Create NameMappings table for storing name transliterations
--          between Arabic, English, and Nobiin scripts
-- ============================================================================

-- Create the NameMappings table
CREATE TABLE IF NOT EXISTS "NameMappings" (
    "Id" SERIAL PRIMARY KEY,

    -- Arabic script representation
    "Arabic" VARCHAR(200),
    "ArabicNormalized" VARCHAR(200),

    -- English/Latin script representation
    "English" VARCHAR(200),
    "EnglishNormalized" VARCHAR(200),

    -- Nobiin (Old Nubian/Coptic script) representation
    "Nobiin" VARCHAR(200),
    "NobiinNormalized" VARCHAR(200),

    -- IPA phonetic representation
    "Ipa" VARCHAR(200),

    -- Verification status
    "IsVerified" BOOLEAN NOT NULL DEFAULT FALSE,
    "NeedsReview" BOOLEAN NOT NULL DEFAULT FALSE,

    -- Source and confidence
    "Source" VARCHAR(50),  -- 'user', 'ged', 'ai'
    "Confidence" DOUBLE PRECISION,

    -- Timestamps
    "CreatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    "UpdatedAt" TIMESTAMP WITH TIME ZONE,

    -- Foreign keys
    "ConfirmedByUserId" BIGINT REFERENCES "AspNetUsers"("Id") ON DELETE SET NULL,
    "OrgId" UUID REFERENCES "Orgs"("Id") ON DELETE SET NULL
);

-- Create indexes for efficient lookup
CREATE INDEX IF NOT EXISTS "IX_NameMappings_ArabicNormalized"
    ON "NameMappings" ("ArabicNormalized");

CREATE INDEX IF NOT EXISTS "IX_NameMappings_EnglishNormalized"
    ON "NameMappings" ("EnglishNormalized");

CREATE INDEX IF NOT EXISTS "IX_NameMappings_NobiinNormalized"
    ON "NameMappings" ("NobiinNormalized");

CREATE INDEX IF NOT EXISTS "IX_NameMappings_NeedsReview"
    ON "NameMappings" ("NeedsReview");

CREATE INDEX IF NOT EXISTS "IX_NameMappings_IsVerified"
    ON "NameMappings" ("IsVerified");

CREATE INDEX IF NOT EXISTS "IX_NameMappings_OrgId"
    ON "NameMappings" ("OrgId");

CREATE INDEX IF NOT EXISTS "IX_NameMappings_ConfirmedByUserId"
    ON "NameMappings" ("ConfirmedByUserId");

-- Add comment describing the table
COMMENT ON TABLE "NameMappings" IS
    'Stores verified name transliterations between Arabic, English, and Nobiin scripts for consistency across family trees';

COMMENT ON COLUMN "NameMappings"."Source" IS
    'Source of the mapping: user (manually entered), ged (from GED import), ai (AI-generated)';

COMMENT ON COLUMN "NameMappings"."Confidence" IS
    'AI confidence score (0.0-1.0) if source is ai';

COMMENT ON COLUMN "NameMappings"."NeedsReview" IS
    'Whether this mapping needs human review (low confidence or conflict)';

-- ============================================================================
-- Sample seed data for common Egyptian names (optional)
-- ============================================================================

-- Insert some common verified name mappings
INSERT INTO "NameMappings"
    ("Arabic", "ArabicNormalized", "English", "EnglishNormalized",
     "Nobiin", "NobiinNormalized", "Ipa",
     "IsVerified", "Source", "Confidence", "NeedsReview")
VALUES
    ('محمد', 'محمد', 'Mohamed', 'mohamed',
     'ⲙⲟϩⲁⲙⲉⲇ', 'ⲙⲟϩⲁⲙⲉⲇ', 'mohamed',
     TRUE, 'user', 1.0, FALSE),

    ('أحمد', 'أحمد', 'Ahmed', 'ahmed',
     'ⲁϩⲙⲉⲇ', 'ⲁϩⲙⲉⲇ', 'ahmed',
     TRUE, 'user', 1.0, FALSE),

    ('فاطمة', 'فاطمة', 'Fatma', 'fatma',
     'ⲫⲁⲧⲙⲁ', 'ⲫⲁⲧⲙⲁ', 'fatma',
     TRUE, 'user', 1.0, FALSE),

    ('خالد', 'خالد', 'Khaled', 'khaled',
     'ⲕϩⲁⲗⲉⲇ', 'ⲕϩⲁⲗⲉⲇ', 'khaled',
     TRUE, 'user', 1.0, FALSE),

    ('حسن', 'حسن', 'Hassan', 'hassan',
     'ϩⲁⲥⲥⲁⲛ', 'ϩⲁⲥⲥⲁⲛ', 'hassan',
     TRUE, 'user', 1.0, FALSE),

    ('حسين', 'حسين', 'Hussein', 'hussein',
     'ϩⲟⲩⲥⲥⲉⲓⲛ', 'ϩⲟⲩⲥⲥⲉⲓⲛ', 'hussein',
     TRUE, 'user', 1.0, FALSE),

    ('إبراهيم', 'إبراهيم', 'Ibrahim', 'ibrahim',
     'ⲓⲃⲣⲁϩⲓⲙ', 'ⲓⲃⲣⲁϩⲓⲙ', 'ibrahim',
     TRUE, 'user', 1.0, FALSE),

    ('عبد الله', 'عبد الله', 'Abdullah', 'abdullah',
     'ⲁⲃⲇⲟⲩⲗⲗⲁϩ', 'ⲁⲃⲇⲟⲩⲗⲗⲁϩ', 'abdullah',
     TRUE, 'user', 1.0, FALSE),

    ('عبد الرحمن', 'عبد الرحمن', 'Abdel Rahman', 'abdel rahman',
     'ⲁⲃⲇⲉⲗ ⲣⲁϩⲙⲁⲛ', 'ⲁⲃⲇⲉⲗ ⲣⲁϩⲙⲁⲛ', 'abdel rahman',
     TRUE, 'user', 1.0, FALSE),

    ('مصطفى', 'مصطفى', 'Mostafa', 'mostafa',
     'ⲙⲟⲥⲧⲁⲫⲁ', 'ⲙⲟⲥⲧⲁⲫⲁ', 'mostafa',
     TRUE, 'user', 1.0, FALSE),

    ('يوسف', 'يوسف', 'Youssef', 'youssef',
     'ⲏⲟⲩⲥⲥⲉⲫ', 'ⲏⲟⲩⲥⲥⲉⲫ', 'youssef',
     TRUE, 'user', 1.0, FALSE),

    ('نور', 'نور', 'Nour', 'nour',
     'ⲛⲟⲩⲣ', 'ⲛⲟⲩⲣ', 'nour',
     TRUE, 'user', 1.0, FALSE)
ON CONFLICT DO NOTHING;

-- ============================================================================
-- End of script
-- ============================================================================
