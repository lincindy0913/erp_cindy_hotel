/**
 * Default low-stock threshold used when a product has no explicit threshold set.
 * Change this value to adjust the system-wide default.
 */
export const DEFAULT_LOW_STOCK_THRESHOLD = 10;

/**
 * Calculate current system quantity for a product + warehouse.
 * Must be called with a Prisma transaction client (tx) so the read is
 * part of the same transaction as any subsequent write.
 *
 * Formula: purchases - requisitions - transferOut + transferIn + countAdj
 */
export async function getSystemQty(tx, productId, warehouse) {
  const whereWarehouse = warehouse
    ? { OR: [{ inventoryWarehouse: warehouse }, { purchaseMaster: { warehouse } }] }
    : {};

  const [purchaseAgg, countItems, transfersOut, transfersIn] = await Promise.all([
    tx.purchaseDetail.aggregate({
      where: { productId, status: '已入庫', ...whereWarehouse },
      _sum: { quantity: true },
    }),
    tx.stockCountItem.findMany({
      where: { productId, ...(warehouse ? { stockCount: { warehouse } } : {}) },
    }).catch(() => []),
    tx.inventoryTransfer.findMany({
      where: { ...(warehouse ? { fromWarehouse: warehouse } : {}) },
      include: { items: { where: { productId } } },
    }).catch(() => []),
    tx.inventoryTransfer.findMany({
      where: { ...(warehouse ? { toWarehouse: warehouse } : {}) },
      include: { items: { where: { productId } } },
    }).catch(() => []),
  ]);

  const reqAgg = await tx.inventoryRequisition.aggregate({
    where: { productId, ...(warehouse ? { warehouse } : {}) },
    _sum: { quantity: true },
  }).catch(() => ({ _sum: { quantity: null } }));

  const purchaseQty = purchaseAgg._sum.quantity || 0;
  const reqQty      = reqAgg._sum.quantity      || 0;
  const outQty      = transfersOut.reduce((s, t) => s + t.items.reduce((ss, i) => ss + (i.quantity || 0), 0), 0);
  const inQty       = transfersIn.reduce((s,  t) => s + t.items.reduce((ss, i) => ss + (i.quantity || 0), 0), 0);
  const adjQty      = countItems.reduce((s, ci) => s + (ci.diff || 0), 0);

  return purchaseQty - reqQty - outQty + inQty + adjQty;
}
