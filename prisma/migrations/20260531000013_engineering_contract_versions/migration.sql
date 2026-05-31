-- AlterTable engineering_contracts: add current_version
ALTER TABLE engineering_contracts
    ADD COLUMN IF NOT EXISTS current_version INTEGER NOT NULL DEFAULT 1;

-- CreateTable engineering_contract_versions
CREATE TABLE IF NOT EXISTS engineering_contract_versions (
    id            SERIAL NOT NULL,
    contract_id   INTEGER NOT NULL,
    version       INTEGER NOT NULL,
    change_reason VARCHAR(500),
    snapshot      TEXT NOT NULL,
    created_at    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT engineering_contract_versions_pkey PRIMARY KEY (id),
    CONSTRAINT engineering_contract_versions_contract_id_version_key UNIQUE (contract_id, version)
);

CREATE INDEX IF NOT EXISTS engineering_contract_versions_contract_id_idx
    ON engineering_contract_versions(contract_id);

DO $$ BEGIN
  ALTER TABLE engineering_contract_versions
    ADD CONSTRAINT engineering_contract_versions_contract_id_fkey
    FOREIGN KEY (contract_id) REFERENCES engineering_contracts(id) ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
