-- AddColumn: invoiced_amount to payment_orders (immutable snapshot set at creation)
ALTER TABLE "payment_orders"
  ADD COLUMN "invoiced_amount" DECIMAL(12,2) NULL;
