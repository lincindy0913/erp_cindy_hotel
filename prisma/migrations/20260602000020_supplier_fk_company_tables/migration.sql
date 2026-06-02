-- AddColumn: supplier_id to company_expenses
ALTER TABLE "company_expenses"
  ADD COLUMN "supplier_id" INTEGER NULL
    REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "company_expenses_supplier_id_idx" ON "company_expenses"("supplier_id");

-- AddColumn: supplier_id to company_input_invoices
ALTER TABLE "company_input_invoices"
  ADD COLUMN "supplier_id" INTEGER NULL
    REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "company_input_invoices_supplier_id_idx" ON "company_input_invoices"("supplier_id");
