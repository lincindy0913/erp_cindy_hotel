-- E38: 業主請款應收帳款工作流
-- AlterTable engineering_output_invoices: add due_date
ALTER TABLE engineering_output_invoices
    ADD COLUMN IF NOT EXISTS due_date VARCHAR(20);

-- AlterTable engineering_incomes: add output_invoice_id
ALTER TABLE engineering_incomes
    ADD COLUMN IF NOT EXISTS output_invoice_id INTEGER;

CREATE INDEX IF NOT EXISTS engineering_incomes_output_invoice_id_idx
    ON engineering_incomes(output_invoice_id);

DO $$ BEGIN
  ALTER TABLE engineering_incomes
    ADD CONSTRAINT engineering_incomes_output_invoice_id_fkey
    FOREIGN KEY (output_invoice_id) REFERENCES engineering_output_invoices(id) ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
