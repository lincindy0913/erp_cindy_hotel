-- AddColumn: type to stock_counts
ALTER TABLE "stock_counts"
  ADD COLUMN "type" VARCHAR(20) NOT NULL DEFAULT 'count';

-- Backfill: rows with countNo starting with 'ADJ-' are adjustments
UPDATE "stock_counts"
  SET "type" = 'adjustment'
  WHERE "count_no" LIKE 'ADJ-%';

-- Index for filtering by type
CREATE INDEX "stock_counts_type_idx" ON "stock_counts"("type");
