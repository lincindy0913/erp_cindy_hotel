import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { handleApiError } from '@/lib/error-handler';
import { requirePermission, requireAnyPermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import { expandWarehouseNames, warehouseWhereValue } from '@/lib/warehouse-access';

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

    // Expand building → [building, ...children] so filtering works at both levels
    const whNames = await expandWarehouseNames(prisma, warehouse);
    const whValue = warehouseWhereValue(whNames);

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

      // Post-snapshot purchases (只計入已入庫的明細)
      const postPurchases = await prisma.purchaseDetail.findMany({
        where: {
          status: '已入庫',
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

      // 不扣銷貨：流程為進貨入庫 → 領用/調撥扣數量

      inventory = products.map((product, index) => {
        const key = `${product.id}_${warehouse || 'default'}`;
        const snapshot = snapshotMap.get(key);
        const closingQty = snapshot ? Number(snapshot.closingQty) : 0;
        const purchaseIncr = purchaseIncrMap.get(key) || 0;
        const currentQty = closingQty + purchaseIncr;
        const threshold = product.lowStockThreshold || 10;

        return {
          id: index + 1,
          productId: product.id,
          snapshotQty: closingQty,
          purchaseIncr,
          salesIncr: 0,
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
      // v2 fallback: 只計入已入庫的明細，待入庫尚未到庫不計入庫存
      const purchaseWhere = { status: '已入庫' };
      if (whValue) {
        purchaseWhere.OR = [{ inventoryWarehouse: whValue }, { purchaseMaster: { warehouse: whValue } }];
      }
      const purchaseDetails = await prisma.purchaseDetail.findMany({
        where: purchaseWhere,
        include: { purchaseMaster: { select: { warehouse: true } } },
      });
      const purchaseQtyMap = new Map();
      const inventoryWarehouseMap = new Map(); // productId → [unique warehouse list]
      purchaseDetails.forEach(d => {
        const w = d.inventoryWarehouse || d.purchaseMaster?.warehouse || 'default';
        const matchesFilter = !whNames || whNames.includes(w);
        if (matchesFilter) {
          purchaseQtyMap.set(d.productId, (purchaseQtyMap.get(d.productId) || 0) + (d.quantity || 0));
          if (d.inventoryWarehouse) {
            const locs = inventoryWarehouseMap.get(d.productId) || new Set();
            locs.add(d.inventoryWarehouse);
            inventoryWarehouseMap.set(d.productId, locs);
          }
        }
      });

      // 不扣銷貨：進貨入庫後僅以領用、調撥扣數量

      // 領用：減庫存
      const reqWhere = whValue ? { warehouse: whValue } : {};
      const requisitions = await prisma.inventoryRequisition.findMany({ where: reqWhere }).catch(() => []);
      const reqQtyMap = new Map();
      requisitions.forEach(r => {
        reqQtyMap.set(r.productId, (reqQtyMap.get(r.productId) || 0) + r.quantity);
      });

      // 調撥：轉出減、轉入加
      const transferOutWhere = whValue ? { fromWarehouse: whValue } : {};
      const transferInWhere = whValue ? { toWarehouse: whValue } : {};
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
        where: whValue ? { stockCount: { warehouse: whValue } } : {},
        include: { stockCount: true },
      }).catch(() => []);
      const countDiffMap = new Map();
      countItems.forEach(ci => {
        countDiffMap.set(ci.productId, (countDiffMap.get(ci.productId) || 0) + (ci.diff || 0));
      });

      inventory = products.map((product, index) => {
        const purchaseQty = purchaseQtyMap.get(product.id) || 0;
        const reqQty = reqQtyMap.get(product.id) || 0;
        const outQty = transferOutMap.get(product.id) || 0;
        const inQty = transferInMap.get(product.id) || 0;
        const adjQty = countDiffMap.get(product.id) || 0;
        const currentQty = purchaseQty - reqQty - outQty + inQty + adjQty;
        const threshold = product.lowStockThreshold || 10;

        const locSet = inventoryWarehouseMap.get(product.id);
        return {
          id: index + 1,
          productId: product.id,
          beginningQty: 0,
          purchaseQty,
          salesQty: 0,
          requisitionQty: reqQty,
          transferOutQty: outQty,
          transferInQty: inQty,
          countAdjustQty: adjQty,
          currentQty,
          inventoryWarehouses: locSet ? [...locSet] : [],
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

      if (whNames) {
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
