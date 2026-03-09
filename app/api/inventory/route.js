import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { handleApiError } from '@/lib/error-handler';
import { requirePermission, requireAnyPermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

function getInventoryStatus(currentQty, threshold = 10) {
  if (currentQty < 0) return '不足';
  if (currentQty < threshold) return '偏低';
  if (currentQty > 1000) return '過多';
  return '正常';
}

export async function GET(request) {
  const auth = await requirePermission(PERMISSIONS.INVENTORY_VIEW);
  if (!auth.ok) return auth.response;
  
  try {
    const { searchParams } = new URL(request.url);
    const warehouse = searchParams.get('warehouse');
    const status = searchParams.get('status');

    // 只取得「列入庫存」的產品
    const products = await prisma.product.findMany({
      where: { isInStock: true }
    });

    // v3: Try snapshot-based calculation first
    let snapshots = [];
    let snapshotMode = false;
    let snapshotYear = null;
    let snapshotMonth = null;

    try {
      // Find latest non-stale snapshot
      const latestSnapshot = await prisma.inventoryMonthlySnapshot.findFirst({
        where: { isStale: false },
        orderBy: [{ snapshotYear: 'desc' }, { snapshotMonth: 'desc' }],
      });

      if (latestSnapshot) {
        snapshotYear = latestSnapshot.snapshotYear;
        snapshotMonth = latestSnapshot.snapshotMonth;
        snapshotMode = true;

        snapshots = await prisma.inventoryMonthlySnapshot.findMany({
          where: {
            snapshotYear,
            snapshotMonth,
            isStale: false,
          },
        });
      }
    } catch {
      // InventoryMonthlySnapshot table might not exist yet, fall back
    }

    let inventory;

    if (snapshotMode && snapshots.length > 0) {
      // Snapshot + incremental calculation (spec4 v3)
      const snapshotMap = new Map();
      snapshots.forEach(s => {
        const key = `${s.productId}_${s.warehouse || 'default'}`;
        snapshotMap.set(key, s);
      });

      // Calculate post-snapshot increments
      const snapshotEndDate = `${snapshotYear}-${String(snapshotMonth).padStart(2, '0')}-31`;

      // Post-snapshot purchases
      const postPurchases = await prisma.purchaseDetail.findMany({
        where: {
          purchaseMaster: {
            purchaseDate: { gt: snapshotEndDate },
          },
        },
        include: {
          purchaseMaster: { select: { purchaseDate: true, warehouse: true } },
        },
      });

      const purchaseIncrMap = new Map();
      postPurchases.forEach(d => {
        const key = `${d.productId}_${d.purchaseMaster?.warehouse || 'default'}`;
        purchaseIncrMap.set(key, (purchaseIncrMap.get(key) || 0) + (d.quantity || 0));
      });

      // Post-snapshot sales
      const postSales = await prisma.salesDetail.findMany({
        where: {
          salesMaster: {
            invoiceDate: { gt: snapshotEndDate },
          },
        },
        include: {
          salesMaster: { select: { invoiceDate: true } },
        },
      });

      const salesIncrMap = new Map();
      postSales.forEach(d => {
        const key = `${d.productId}_default`;
        salesIncrMap.set(key, (salesIncrMap.get(key) || 0) + (d.quantity || 0));
      });

      inventory = products.map((product, index) => {
        const key = `${product.id}_${warehouse || 'default'}`;
        const snapshot = snapshotMap.get(key);
        const closingQty = snapshot ? Number(snapshot.closingQty) : 0;
        const purchaseIncr = purchaseIncrMap.get(key) || 0;
        const salesIncr = salesIncrMap.get(key) || 0;
        const currentQty = closingQty + purchaseIncr - salesIncr;
        const threshold = product.lowStockThreshold || 10;

        return {
          id: index + 1,
          productId: product.id,
          snapshotQty: closingQty,
          purchaseIncr,
          salesIncr,
          currentQty,
          product: {
            id: product.id, name: product.name, code: product.code,
            unit: product.unit, costPrice: Number(product.costPrice),
            sellingPrice: Number(product.salesPrice), isInStock: product.isInStock,
          },
          status: getInventoryStatus(currentQty, threshold),
          totalValue: currentQty * Number(product.costPrice || 0),
        };
      });
    } else {
      // Fallback: v2 full calculation (含領用、調撥、盤點)
      const wh = warehouse || null;
      const baseWhere = wh ? undefined : {};
      const purchaseWhere = wh
        ? { OR: [{ inventoryWarehouse: wh }, { purchaseMaster: { warehouse: wh } }] }
        : {};
      const purchaseDetails = await prisma.purchaseDetail.findMany({
        where: Object.keys(purchaseWhere).length ? purchaseWhere : {},
        include: { purchaseMaster: { select: { warehouse: true } } },
      });
      const purchaseQtyMap = new Map();
      purchaseDetails.forEach(d => {
        const w = d.inventoryWarehouse || d.purchaseMaster?.warehouse || 'default';
        if (!wh || w === wh) {
          const key = d.productId;
          purchaseQtyMap.set(key, (purchaseQtyMap.get(key) || 0) + (d.quantity || 0));
        }
      });

      const salesWhere = wh ? { warehouse: wh } : {};
      const salesDetails = await prisma.salesDetail.findMany({
        where: Object.keys(salesWhere).length ? salesWhere : {},
      });
      const salesQtyMap = new Map();
      salesDetails.forEach(d => {
        const w = d.warehouse || 'default';
        if (!wh || w === wh) {
          const pid = d.productId;
          if (pid) salesQtyMap.set(pid, (salesQtyMap.get(pid) || 0) + (d.quantity || 0));
        }
      });

      // 領用：減庫存
      const reqWhere = wh ? { warehouse: wh } : {};
      const requisitions = await prisma.inventoryRequisition.findMany({ where: reqWhere }).catch(() => []);
      const reqQtyMap = new Map();
      requisitions.forEach(r => {
        reqQtyMap.set(r.productId, (reqQtyMap.get(r.productId) || 0) + r.quantity);
      });

      // 調撥：轉出減、轉入加
      const transferOutWhere = wh ? { fromWarehouse: wh } : {};
      const transferInWhere = wh ? { toWarehouse: wh } : {};
      const [transfersOut, transfersIn] = await Promise.all([
        prisma.inventoryTransfer.findMany({ where: transferOutWhere, include: { items: true } }).catch(() => []),
        prisma.inventoryTransfer.findMany({ where: transferInWhere, include: { items: true } }).catch(() => []),
      ]);
      const transferOutMap = new Map();
      transfersOut.forEach(t => t.items.forEach(i => transferOutMap.set(i.productId, (transferOutMap.get(i.productId) || 0) + i.quantity)));
      const transferInMap = new Map();
      transfersIn.forEach(t => t.items.forEach(i => transferInMap.set(i.productId, (transferInMap.get(i.productId) || 0) + i.quantity)));

      // 盤點差異
      const countItems = await prisma.stockCountItem.findMany({
        where: wh ? { stockCount: { warehouse: wh } } : {},
        include: { stockCount: true },
      }).catch(() => []);
      const countItemsFiltered = countItems;
      const countDiffMap = new Map();
      countItemsFiltered.forEach(ci => {
        countDiffMap.set(ci.productId, (countDiffMap.get(ci.productId) || 0) + (ci.diff || 0));
      });

      inventory = products.map((product, index) => {
        const purchaseQty = purchaseQtyMap.get(product.id) || 0;
        const salesQty = salesQtyMap.get(product.id) || 0;
        const reqQty = reqQtyMap.get(product.id) || 0;
        const outQty = transferOutMap.get(product.id) || 0;
        const inQty = transferInMap.get(product.id) || 0;
        const adjQty = countDiffMap.get(product.id) || 0;
        const currentQty = purchaseQty - salesQty - reqQty - outQty + inQty + adjQty;
        const threshold = product.lowStockThreshold || 10;

        return {
          id: index + 1,
          productId: product.id,
          beginningQty: 0,
          purchaseQty,
          salesQty,
          requisitionQty: reqQty,
          transferOutQty: outQty,
          transferInQty: inQty,
          countAdjustQty: adjQty,
          currentQty,
          product: {
            id: product.id, name: product.name, code: product.code,
            unit: product.unit, costPrice: Number(product.costPrice),
            sellingPrice: Number(product.salesPrice), isInStock: product.isInStock,
            warehouseLocation: product.warehouseLocation,
          },
          status: getInventoryStatus(currentQty, threshold),
          totalValue: currentQty * Number(product.costPrice || 0),
        };
      });

      if (wh) {
        inventory = inventory.filter(item => item.currentQty !== 0 || item.purchaseQty || item.requisitionQty || item.transferInQty || item.transferOutQty || item.countAdjustQty);
      }
    }

    // Apply filters
    if (status) {
      inventory = inventory.filter(item => item.status === status);
    }

    return NextResponse.json({
      data: inventory,
      calculationMode: snapshotMode ? 'snapshot' : 'full',
      snapshotInfo: snapshotMode ? { year: snapshotYear, month: snapshotMonth } : null,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
