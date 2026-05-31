-- AlterTable engineering_projects: add warranty fields
ALTER TABLE engineering_projects ADD COLUMN IF NOT EXISTS warranty_start_date VARCHAR(20);
ALTER TABLE engineering_projects ADD COLUMN IF NOT EXISTS warranty_end_date   VARCHAR(20);
ALTER TABLE engineering_projects ADD COLUMN IF NOT EXISTS warranty_months     INTEGER;
ALTER TABLE engineering_projects ADD COLUMN IF NOT EXISTS warranty_note       TEXT;

-- CreateTable engineering_warranty_records
CREATE TABLE IF NOT EXISTS engineering_warranty_records (
    id            SERIAL NOT NULL,
    project_id    INTEGER NOT NULL,
    report_date   VARCHAR(20) NOT NULL,
    description   TEXT NOT NULL,
    handler       VARCHAR(100),
    resolved_date VARCHAR(20),
    cost          DECIMAL(14, 2),
    status        VARCHAR(20) NOT NULL DEFAULT 'pending',
    note          TEXT,
    created_at    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT engineering_warranty_records_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS engineering_warranty_records_project_id_idx
    ON engineering_warranty_records(project_id);

DO $$ BEGIN
  ALTER TABLE engineering_warranty_records
    ADD CONSTRAINT engineering_warranty_records_project_id_fkey
    FOREIGN KEY (project_id) REFERENCES engineering_projects(id) ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
