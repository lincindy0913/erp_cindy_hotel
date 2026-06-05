-- Engineering Material → Inventory Requisition link (Phase 1)
-- Allows materials to be linked to existing inventory requisition records
-- to reduce duplicate entry between engineering materials and inventory usage.
ALTER TABLE "engineering_materials"
  ADD COLUMN "requisition_id" INTEGER REFERENCES "inventory_requisitions"("id") ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "engineering_materials_requisition_id_idx"
  ON "engineering_materials"("requisition_id");
