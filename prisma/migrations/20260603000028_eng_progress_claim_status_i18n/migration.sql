-- ENG4: Migrate EngineeringProgressClaim.status from English to Chinese
-- draft → 草稿, approved → 已審核
UPDATE "engineering_progress_claims"
SET "status" = CASE
  WHEN "status" = 'draft'    THEN '草稿'
  WHEN "status" = 'approved' THEN '已審核'
  ELSE "status"
END
WHERE "status" IN ('draft', 'approved');

ALTER TABLE "engineering_progress_claims"
  ALTER COLUMN "status" SET DEFAULT '草稿';
