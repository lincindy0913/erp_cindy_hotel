-- Add index on sales_details.purchase_id to speed up uninvoiced query
-- (previously full-table scanned all salesDetail; now scoped to relevant purchase IDs)
CREATE INDEX IF NOT EXISTS "sales_details_purchase_id_idx" ON "sales_details"("purchase_id");
