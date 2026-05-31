-- CreateTable engineering_progress_claims
CREATE TABLE IF NOT EXISTS engineering_progress_claims (
    id               SERIAL NOT NULL,
    project_id       INTEGER NOT NULL,
    claim_no         VARCHAR(100),
    term_name        VARCHAR(100) NOT NULL,
    claim_date       VARCHAR(20),
    certified_date   VARCHAR(20),
    claim_amount     DECIMAL(14, 2) NOT NULL,
    certified_amount DECIMAL(14, 2),
    status           VARCHAR(20) NOT NULL DEFAULT 'draft',
    note             TEXT,
    created_at       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT engineering_progress_claims_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS engineering_progress_claims_project_id_idx
    ON engineering_progress_claims(project_id);

DO $$ BEGIN
  ALTER TABLE engineering_progress_claims
    ADD CONSTRAINT engineering_progress_claims_project_id_fkey
    FOREIGN KEY (project_id) REFERENCES engineering_projects(id) ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AlterTable engineering_output_invoices: add progress_claim_id
ALTER TABLE engineering_output_invoices
    ADD COLUMN IF NOT EXISTS progress_claim_id INTEGER;

CREATE INDEX IF NOT EXISTS engineering_output_invoices_progress_claim_id_idx
    ON engineering_output_invoices(progress_claim_id);

DO $$ BEGIN
  ALTER TABLE engineering_output_invoices
    ADD CONSTRAINT engineering_output_invoices_progress_claim_id_fkey
    FOREIGN KEY (progress_claim_id) REFERENCES engineering_progress_claims(id) ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AlterTable engineering_incomes: add progress_claim_id
ALTER TABLE engineering_incomes
    ADD COLUMN IF NOT EXISTS progress_claim_id INTEGER;

CREATE INDEX IF NOT EXISTS engineering_incomes_progress_claim_id_idx
    ON engineering_incomes(progress_claim_id);

DO $$ BEGIN
  ALTER TABLE engineering_incomes
    ADD CONSTRAINT engineering_incomes_progress_claim_id_fkey
    FOREIGN KEY (progress_claim_id) REFERENCES engineering_progress_claims(id) ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
