-- VAT1: Add manual_output_adjustment to vat_filing_periods
-- For capturing PMS / rental / other taxable income not covered by formal invoices.
ALTER TABLE "vat_filing_periods"
  ADD COLUMN "manual_output_adjustment" DECIMAL(14, 2) NOT NULL DEFAULT 0;
