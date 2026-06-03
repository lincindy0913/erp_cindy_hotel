-- Fix CASHIER_PAY (出納付款) category classification
-- level1 and plGroup were NULL, causing cashier payments to fall into
-- '未分類費用' in P&L analytics instead of a proper expense group.
UPDATE "cash_categories"
SET
  "level1"   = '費用',
  "pl_group" = '行政費用',
  "pl_order" = 45
WHERE "system_code" = 'CASHIER_PAY'
  AND "level1" IS NULL;
