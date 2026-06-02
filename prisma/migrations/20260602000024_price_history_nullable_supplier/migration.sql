-- Make supplier_id nullable to allow manual cost-edit records (no supplier)
ALTER TABLE "price_history"
  ALTER COLUMN "supplier_id" DROP NOT NULL;

-- Add source column to distinguish purchase records from manual edits
ALTER TABLE "price_history"
  ADD COLUMN "source" VARCHAR(20) NULL;

-- Backfill existing rows as purchase records
UPDATE "price_history" SET "source" = 'purchase' WHERE "source" IS NULL;
