-- ============================================================================
-- Create FamilyRelationshipTypes lookup table with trilingual support
-- Arabic, English, Nubian relationship names
-- ============================================================================

-- Create the table
CREATE TABLE IF NOT EXISTS "FamilyRelationshipTypes" (
    "Id" SERIAL PRIMARY KEY,
    "NameArabic" VARCHAR(100) NOT NULL,
    "NameEnglish" VARCHAR(100) NOT NULL,
    "NameNubian" VARCHAR(100) NOT NULL,
    "Category" VARCHAR(50) NULL,
    "SortOrder" INT NOT NULL DEFAULT 0,
    "IsActive" BOOLEAN NOT NULL DEFAULT TRUE,
    "CreatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS "IX_FamilyRelationshipTypes_NameEnglish" ON "FamilyRelationshipTypes" ("NameEnglish");
CREATE INDEX IF NOT EXISTS "IX_FamilyRelationshipTypes_Category" ON "FamilyRelationshipTypes" ("Category");
CREATE INDEX IF NOT EXISTS "IX_FamilyRelationshipTypes_IsActive" ON "FamilyRelationshipTypes" ("IsActive");

-- ============================================================================
-- Seed data: 38 relationship types with trilingual names
-- ============================================================================

INSERT INTO "FamilyRelationshipTypes" ("NameArabic", "NameEnglish", "NameNubian", "Category", "SortOrder", "IsActive") VALUES
-- Immediate Family (1-8)
('أب', 'Father', 'ⲫⲁ̄ⲡ', 'Immediate', 1, TRUE),
('أم', 'Mother', 'ⲉ̄ⲛ', 'Immediate', 2, TRUE),
('ولد', 'Son', 'ⲧⲟ̄ⲇ', 'Immediate', 3, TRUE),
('بنت', 'Daughter', 'ⲓⲥⲥⲉ̄ ⲓⲥⲥⲉ̄', 'Immediate', 4, TRUE),
('أخ', 'Brother', 'ⲉⳟⳟⲁ', 'Immediate', 5, TRUE),
('أخت', 'Sister', 'ⲉⲥⲥⲓ', 'Immediate', 6, TRUE),
('زوج', 'Husband', 'ⲓⲇ', 'Immediate', 7, TRUE),
('زوجة', 'Wife', 'ⲓⲇⲉ̄ⲛ', 'Immediate', 8, TRUE),

-- Grandparents/Grandchildren (9-14)
('جد', 'Grandfather', 'ⲟ̅ⲩ̅', 'Grandparents', 9, TRUE),
('جدة', 'Grandmother', 'ⲁ̄ⳣ', 'Grandparents', 10, TRUE),
('حفيد', 'Grandson', 'ⲁⲥⲥⲓ', 'Grandchildren', 11, TRUE),
('حفيدة', 'Granddaughter', 'ⲁⲥⲥⲓ', 'Grandchildren', 12, TRUE),
('ابن الحفيد', 'Great-grandson', 'ⳣⲓⲥⲥⲓ', 'Grandchildren', 13, TRUE),
('بنت الحفيد', 'Great-granddaughter', 'ⳣⲓⲥⲥⲓ', 'Grandchildren', 14, TRUE),

-- Uncles/Aunts (15-18)
('عم', 'Paternal Uncle', 'ⲫⲁ̄ⲡⲓⲛ ⲉⳟⳟⲁ', 'Uncles/Aunts', 15, TRUE),
('عمة', 'Paternal Aunt', 'ⲁⳡⳡⲓ', 'Uncles/Aunts', 16, TRUE),
('خال', 'Maternal Uncle', 'ⲅⲓ̄', 'Uncles/Aunts', 17, TRUE),
('خالة', 'Maternal Aunt', 'ⲉ̄ⲛⲡⲉⲥ', 'Uncles/Aunts', 18, TRUE),

-- Cousins (19-24)
('ابن العم', 'Cousin (paternal uncle''s son)', 'ⲁⲡⲡⲛ ⲉⳟⳟⲁⲛ ⲧⲟ̄ⲇ', 'Cousins', 19, TRUE),
('بنت العم', 'Cousin (paternal uncle''s daughter)', 'ⲁⲡⲟⲛ ⲉⳟⳟⲁⲛ ⲁⲥ', 'Cousins', 20, TRUE),
('ابن العمة', 'Cousin (paternal aunt''s son)', 'ⲁⲛⲛⲁⳡⲓⲛ ⲧⲟ̄ⲇ', 'Cousins', 21, TRUE),
('بنت العمة', 'Cousin (paternal aunt''s daughter)', 'ⲁⲡⲛⲁⲃⲓⲛ ⲁⲇ ⲁⲥ', 'Cousins', 22, TRUE),
('ابن الخال', 'Cousin (maternal uncle''s son)', 'ⲁⲛⲉ̄ⲛ ⲡⲣⲥⲓⲛ ⲧⲟ̄ⲇ', 'Cousins', 23, TRUE),
('بنت الخال', 'Cousin (maternal uncle''s daughter)', 'ⲁⲛⲉ̄ⲛ ⲡⲉⲥⲟⲛ ⲁⲥ', 'Cousins', 24, TRUE),

-- Nephews/Nieces (25-28)
('ابن الأخ', 'Nephew (brother''s son)', 'ⳝⲟⲩⲧⲧⲓ', 'Nephews/Nieces', 25, TRUE),
('بنت الأخ', 'Niece (brother''s daughter)', 'ⳝⲟⲩⲧⲧⲓ', 'Nephews/Nieces', 26, TRUE),
('ابن الأخت', 'Nephew (sister''s son)', 'ⳝⲟⲩⲧⲧⲓ', 'Nephews/Nieces', 27, TRUE),
('بنت الأخت', 'Niece (sister''s daughter)', 'ⳝⲟⲩⲧⲧⲓ', 'Nephews/Nieces', 28, TRUE),

-- In-Laws (29-34)
('حما', 'Father-in-law', 'ⲁⲅⲟ', 'In-Laws', 29, TRUE),
('حماة', 'Mother-in-law', 'ⲁⲅⲟ', 'In-Laws', 30, TRUE),
('صهر', 'Son-in-law', 'ⲟⲧⲧⲓ', 'In-Laws', 31, TRUE),
('كنّة', 'Daughter-in-law', 'ⲟⲧⲧⲓ', 'In-Laws', 32, TRUE),
('زوج الأخت', 'Sister''s husband', 'ⲓⲇ ⲉⲥⲥⲓ', 'In-Laws', 33, TRUE),
('زوجة الأخ', 'Brother''s wife', 'ⲓⲇ ⲉⳟⳟⲁ', 'In-Laws', 34, TRUE),

-- Step Relations (35-38)
('زوج الأم', 'Stepfather', 'ⲓⲇ ⲉ̄ⲛ', 'Step', 35, TRUE),
('زوجة الأب', 'Stepmother', 'ōčča-r', 'Step', 36, TRUE),
('ابن الزوجة', 'Stepson', 'ⲧⲟ̄ⲇ ⲓⲇⲉ̄ⲛ', 'Step', 37, TRUE),
('بنت الزوجة', 'Stepdaughter', 'ⲓⲇⲉ̄ⲛ ⲓⲥⲥⲉ̄', 'Step', 38, TRUE);

-- Verify insertion
SELECT COUNT(*) as "TotalRelationshipTypes" FROM "FamilyRelationshipTypes";
