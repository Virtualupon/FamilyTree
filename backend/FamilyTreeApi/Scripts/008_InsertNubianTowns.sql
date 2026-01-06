-- Migration: Insert Nubian Towns/Villages
-- These are geographic locations for the Nubian family tree application
-- Run this script to populate the Towns table with actual town data

-- Clear any existing non-town data (optional - uncomment if needed)
-- DELETE FROM "Towns" WHERE "Country" IS NULL;

-- Insert Nubian towns in Egypt (Lower Nubia / Egyptian Nubia)
INSERT INTO "Towns" ("Id", "Name", "NameEn", "NameAr", "NameLocal", "Country", "Description", "CreatedAt", "UpdatedAt")
VALUES
    -- Major Cities
    (gen_random_uuid(), 'Aswan', 'Aswan', 'أسوان', 'ⲁⲥⲟⲩⲁⲛ', 'Egypt', 'Major city in southern Egypt, gateway to Nubia', NOW(), NOW()),
    (gen_random_uuid(), 'Abu Simbel', 'Abu Simbel', 'أبو سمبل', NULL, 'Egypt', 'Famous for ancient temples, relocated due to Aswan Dam', NOW(), NOW()),

    -- Nubian Villages in Egypt (many relocated after High Dam)
    (gen_random_uuid(), 'Gharb Soheil', 'Gharb Soheil', 'غرب سهيل', NULL, 'Egypt', 'Nubian village west of Aswan', NOW(), NOW()),
    (gen_random_uuid(), 'Heissa Island', 'Heissa Island', 'جزيرة هيسا', NULL, 'Egypt', 'Nubian island village near Aswan', NOW(), NOW()),
    (gen_random_uuid(), 'Elephantine Island', 'Elephantine Island', 'جزيرة الفنتين', NULL, 'Egypt', 'Historic island with Nubian villages', NOW(), NOW()),
    (gen_random_uuid(), 'Korosko', 'Korosko', 'كوروسكو', NULL, 'Egypt', 'Historic Nubian town', NOW(), NOW()),
    (gen_random_uuid(), 'Dabod', 'Dabod', 'دابود', NULL, 'Egypt', 'Ancient Nubian village', NOW(), NOW()),
    (gen_random_uuid(), 'Kalabsha', 'Kalabsha', 'كلابشة', NULL, 'Egypt', 'Site of relocated Nubian temple', NOW(), NOW()),
    (gen_random_uuid(), 'Dakka', 'Dakka', 'الدكة', NULL, 'Egypt', 'Historic Nubian settlement', NOW(), NOW()),
    (gen_random_uuid(), 'Amada', 'Amada', 'أمادا', NULL, 'Egypt', 'Ancient Nubian site', NOW(), NOW()),
    (gen_random_uuid(), 'Aniba', 'Aniba', 'عنيبة', NULL, 'Egypt', 'Former Nubian town, now submerged', NOW(), NOW()),
    (gen_random_uuid(), 'Faras', 'Faras', 'فرس', NULL, 'Egypt', 'Historic Nubian village', NOW(), NOW()),
    (gen_random_uuid(), 'Ballana', 'Ballana', 'بلانة', NULL, 'Egypt', 'Relocated Nubian village', NOW(), NOW()),
    (gen_random_uuid(), 'Adendan', 'Adendan', 'أدندان', NULL, 'Egypt', 'Nubian village', NOW(), NOW()),
    (gen_random_uuid(), 'Qustul', 'Qustul', 'قسطل', NULL, 'Egypt', 'Ancient Nubian royal cemetery site', NOW(), NOW()),

    -- Nubian Towns in Sudan (Upper Nubia)
    (gen_random_uuid(), 'Wadi Halfa', 'Wadi Halfa', 'وادي حلفا', NULL, 'Sudan', 'Border town, gateway to Sudanese Nubia', NOW(), NOW()),
    (gen_random_uuid(), 'Dongola', 'Dongola', 'دنقلا', 'ⲇⲟⲅⲟⲗⲁ', 'Sudan', 'Capital of Northern State, historic Nubian center', NOW(), NOW()),
    (gen_random_uuid(), 'Old Dongola', 'Old Dongola', 'دنقلا العجوز', NULL, 'Sudan', 'Ancient capital of Makuria kingdom', NOW(), NOW()),
    (gen_random_uuid(), 'Karma', 'Karma', 'كرمة', NULL, 'Sudan', 'Site of ancient Kerma civilization', NOW(), NOW()),
    (gen_random_uuid(), 'Abri', 'Abri', 'عبري', NULL, 'Sudan', 'Town in Northern Sudan', NOW(), NOW()),
    (gen_random_uuid(), 'Delgo', 'Delgo', 'دلقو', NULL, 'Sudan', 'Nubian town in Northern Sudan', NOW(), NOW()),
    (gen_random_uuid(), 'Soleb', 'Soleb', 'صلب', NULL, 'Sudan', 'Site of ancient temple', NOW(), NOW()),
    (gen_random_uuid(), 'Sai Island', 'Sai Island', 'جزيرة ساي', NULL, 'Sudan', 'Large island in the Nile', NOW(), NOW()),
    (gen_random_uuid(), 'Sedeinga', 'Sedeinga', 'صادنقا', NULL, 'Sudan', 'Ancient Nubian site', NOW(), NOW()),
    (gen_random_uuid(), 'Tombos', 'Tombos', 'تمبس', NULL, 'Sudan', 'Historic Nubian site at Third Cataract', NOW(), NOW()),
    (gen_random_uuid(), 'Kawa', 'Kawa', 'كاوا', NULL, 'Sudan', 'Ancient temple site', NOW(), NOW()),
    (gen_random_uuid(), 'Napata', 'Napata', 'نباتا', NULL, 'Sudan', 'Ancient capital of Kush kingdom', NOW(), NOW()),
    (gen_random_uuid(), 'Meroe', 'Meroe', 'مروي', 'ⲙⲉⲣⲟⲏ', 'Sudan', 'Ancient capital of Kush, famous pyramids', NOW(), NOW()),
    (gen_random_uuid(), 'Shendi', 'Shendi', 'شندي', NULL, 'Sudan', 'Historic trading town', NOW(), NOW()),
    (gen_random_uuid(), 'Atbara', 'Atbara', 'عطبرة', NULL, 'Sudan', 'City at confluence of Atbara and Nile', NOW(), NOW()),
    (gen_random_uuid(), 'Karima', 'Karima', 'كريمة', NULL, 'Sudan', 'Town near Jebel Barkal', NOW(), NOW()),
    (gen_random_uuid(), 'El-Kurru', 'El-Kurru', 'الكرو', NULL, 'Sudan', 'Royal cemetery of Kushite kings', NOW(), NOW()),
    (gen_random_uuid(), 'Nuri', 'Nuri', 'نوري', NULL, 'Sudan', 'Pyramid field and royal cemetery', NOW(), NOW())

ON CONFLICT DO NOTHING;

-- Verify inserted towns
-- SELECT "Name", "NameAr", "Country", "Description" FROM "Towns" ORDER BY "Country", "Name";
