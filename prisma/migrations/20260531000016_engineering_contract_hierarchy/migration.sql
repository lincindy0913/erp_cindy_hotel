-- E39: 分包多層合約階層
-- AlterTable engineering_contracts: add contract_type + parent_contract_id
ALTER TABLE engineering_contracts
    ADD COLUMN IF NOT EXISTS contract_type      VARCHAR(20) NOT NULL DEFAULT '主合約';

ALTER TABLE engineering_contracts
    ADD COLUMN IF NOT EXISTS parent_contract_id INTEGER;

CREATE INDEX IF NOT EXISTS engineering_contracts_parent_contract_id_idx
    ON engineering_contracts(parent_contract_id);

DO $$ BEGIN
  ALTER TABLE engineering_contracts
    ADD CONSTRAINT engineering_contracts_parent_contract_id_fkey
    FOREIGN KEY (parent_contract_id) REFERENCES engineering_contracts(id) ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
