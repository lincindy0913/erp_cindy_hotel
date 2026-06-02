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

/**
 * Batch-calculate current quantities for ALL in-stock products for a given warehouse.
 * Uses SQL groupBy (same as v2 inventory route) — returns Map<productId, qty>.
 * @param {object} db - Prisma client
 * @param {string|null} warehouse - warehouse filter; null = all warehouses combined
 */
export async function calcAllQtysForWarehouse(db, warehouse) {
  const whValue = warehouse || null;
  const purchaseWhere = { status: '已入庫' };
  if (whValue) purchaseWhere.OR = [
    { inventoryWarehouse: whValue },
    { purchaseMaster: { warehouse: whValue } },
  ];

  const [purchaseGroups, reqGroups, outGroups, inGroups, countGroups] = await Promise.all([
    db.purchaseDetail.groupBy({ by: ['productId'], where: purchaseWhere, _sum: { quantity: true } }),
    db.inventoryRequisition.groupBy({
      by: ['productId'],
      where: whValue ? { warehouse: whValue } : {},
      _sum: { quantity: true },
    }).catch(() => []),
    db.inventoryTransferItem.groupBy({
      by: ['productId'],
      where: whValue ? { transfer: { fromWarehouse: whValue } } : {},
      _sum: { quantity: true },
    }).catch(() => []),
    db.inventoryTransferItem.groupBy({
      by: ['productId'],
      where: whValue ? { transfer: { toWarehouse: whValue } } : {},
      _sum: { quantity: true },
    }).catch(() => []),
    db.stockCountItem.groupBy({
      by: ['productId'],
      where: whValue ? { stockCount: { warehouse: whValue } } : {},
      _sum: { diff: true },
    }).catch(() => []),
  ]);

  const purchaseMap = new Map(purchaseGroups.map(g => [g.productId, g._sum.quantity || 0]));
  const reqMap      = new Map(reqGroups.map(g =>      [g.productId, g._sum.quantity || 0]));
  const outMap      = new Map(outGroups.map(g =>      [g.productId, g._sum.quantity || 0]));
  const inMap       = new Map(inGroups.map(g =>       [g.productId, g._sum.quantity || 0]));
  const adjMap      = new Map(countGroups.map(g =>    [g.productId, g._sum.diff     || 0]));

  const allIds = new Set([
    ...purchaseMap.keys(), ...reqMap.keys(),
    ...outMap.keys(), ...inMap.keys(), ...adjMap.keys(),
  ]);

  const result = new Map();
  for (const id of allIds) {
    result.set(id,
      (purchaseMap.get(id) || 0)
      - (reqMap.get(id)  || 0)
      - (outMap.get(id)  || 0)
      + (inMap.get(id)   || 0)
      + (adjMap.get(id)  || 0)
    );
  }
  return result;
}
