-- AddColumn: cash_flow_type on cash_categories
-- Values: 'operating' (default) | 'investing' | 'financing'
ALTER TABLE "cash_categories" ADD COLUMN "cash_flow_type" VARCHAR(20) NOT NULL DEFAULT 'operating';

-- Seed: loan-related system categories → financing
UPDATE "cash_categories"
SET "cash_flow_type" = 'financing'
WHERE "system_code" IN ('LOAN_PRINCIPAL', 'LOAN_INTEREST');
