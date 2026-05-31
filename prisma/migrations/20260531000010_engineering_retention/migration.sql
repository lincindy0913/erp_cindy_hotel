-- AlterTable engineering_contracts: add retention_rate
ALTER TABLE engineering_contracts
  ADD COLUMN IF NOT EXISTS retention_rate DECIMAL(5,4) NOT NULL DEFAULT 0.0000;

-- AlterTable engineering_contract_terms: add term_type and retention_amount
ALTER TABLE engineering_contract_terms
  ADD COLUMN IF NOT EXISTS term_type VARCHAR(20) NOT NULL DEFAULT 'regular';

ALTER TABLE engineering_contract_terms
  ADD COLUMN IF NOT EXISTS retention_amount DECIMAL(14,2) NOT NULL DEFAULT 0.00;
