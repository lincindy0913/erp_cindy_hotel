import { calcAllQtysForWarehouse } from '@/lib/inventory-helpers';

/**
 * Build inventory snapshots and write them to yearEndInventory.
 * @param {object} prisma
 * @param {number} yearEndId
 * @returns {{ inventorySnapshots: object[], closingInventoryValue: number }}
 */
export async function runInventoryRollover(prisma, yearEndId) {
  const inStockProducts = await prisma.product.findMany({
    where: { isInStock: true, isActive: true },
    select: { id: true, code: true, name: true, costPrice: true },
  });

  const qtyMap = await calcAllQtysForWarehouse(prisma, null);

  const inventorySnapshots = [];
  for (const product of inStockProducts) {
    const currentQty = qtyMap.get(product.id) || 0;
    const costPrice  = Number(product.costPrice);
    const isNegative = currentQty < 0;
    const closingQty = isNegative ? 0 : currentQty;
    inventorySnapshots.push({
      yearEndId,
      productId: product.id,
      productCode: product.code,
      productName: product.name,
      costPrice: product.costPrice,
      closingQuantity: closingQty,
      closingValue: closingQty * costPrice,
      isNegative,
      adjustedToZero: isNegative
    });
  }

  if (inventorySnapshots.length > 0) {
    await prisma.yearEndInventory.createMany({ data: inventorySnapshots });
  }

  const closingInventoryValue = inventorySnapshots.reduce((s, i) => s + Number(i.closingValue), 0);

  return { inventorySnapshots, closingInventoryValue };
}
