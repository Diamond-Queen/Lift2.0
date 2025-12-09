DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "School" WHERE "name" = 'Alpha High School') THEN
    INSERT INTO "School" ("id", "name", "plan", "createdAt") VALUES ('d420cc4d-744b-4ade-b8f9-c17ab1f10465', 'Alpha High School', 'premium', NOW());
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "SchoolCode" WHERE "code" = 'SCHOOL-ALPHA-2025') THEN
    INSERT INTO "SchoolCode" ("id", "code", "schoolId", "redeemed", "redeemedBy", "createdAt")
    VALUES ('7651638b-c2b9-498b-99bc-7b3036fba6d6', 'SCHOOL-ALPHA-2025', (SELECT "id" FROM "School" WHERE "name" = 'Alpha High School' LIMIT 1), false, NULL, NOW());
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "School" WHERE "name" = 'Beta Academy') THEN
    INSERT INTO "School" ("id", "name", "plan", "createdAt") VALUES ('27148c84-5a99-4746-9a45-d6c31f74cac2', 'Beta Academy', 'standard', NOW());
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "SchoolCode" WHERE "code" = 'SCHOOL-BETA-2025') THEN
    INSERT INTO "SchoolCode" ("id", "code", "schoolId", "redeemed", "redeemedBy", "createdAt")
    VALUES ('9ea2590a-45b4-4801-8e08-4e0da1696328', 'SCHOOL-BETA-2025', (SELECT "id" FROM "School" WHERE "name" = 'Beta Academy' LIMIT 1), false, NULL, NOW());
  END IF;
END$$;

