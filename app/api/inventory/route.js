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

    // 只取得「列入庫存」的產品（上限 2000 筆防止 OOM）
    const products = await prisma.product.findMany({
      where: { isInStock: true },
      take: 2000,
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
      const lastDay = new Date(snapshotYear, snapshotMonth, 0).getDate();
      const snapshotEndDate = `${snapshotYear}-${String(snapshotMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

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

      // 快照後領用（減庫存）
      const postReqWhere = { requisitionDate: { gt: snapshotEndDate } };
      if (whValue) postReqWhere.warehouse = whValue;
      const postRequisitions = await prisma.inventoryRequisition.findMany({ where: postReqWhere }).catch(() => []);
      const reqIncrMap = new Map();
      postRequisitions.forEach(r => {
        const key = `${r.productId}_${r.warehouse || 'default'}`;
        reqIncrMap.set(key, (reqIncrMap.get(key) || 0) + r.quantity);
      });

      // 快照後調撥（轉出減、轉入加）
      const postOutWhere = { transferDate: { gt: snapshotEndDate }, ...(whValue ? { fromWarehouse: whValue } : {}) };
      const postInWhere  = { transferDate: { gt: snapshotEndDate }, ...(whValue ? { toWarehouse:   whValue } : {}) };
      const [postTransfersOut, postTransfersIn] = await Promise.all([
        prisma.inventoryTransfer.findMany({ where: postOutWhere, include: { items: true } }).catch(() => []),
        prisma.inventoryTransfer.findMany({ where: postInWhere,  include: { items: true } }).catch(() => []),
      ]);
      const outIncrMap = new Map();
      const inIncrMap  = new Map();
      postTransfersOut.forEach(t => t.items.forEach(i => {
        const key = `${i.productId}_${t.fromWarehouse || 'default'}`;
        outIncrMap.set(key, (outIncrMap.get(key) || 0) + i.quantity);
      }));
      postTransfersIn.forEach(t => t.items.forEach(i => {
        const key = `${i.productId}_${t.toWarehouse || 'default'}`;
        inIncrMap.set(key, (inIncrMap.get(key) || 0) + i.quantity);
      }));

      // 快照後盤點差異
      const postCountItems = await prisma.stockCountItem.findMany({
        where: {
          stockCount: {
            countDate: { gt: snapshotEndDate },
            ...(whValue ? { warehouse: whValue } : {}),
          },
        },
        include: { stockCount: { select: { warehouse: true } } },
      }).catch(() => []);
      const adjIncrMap = new Map();
      postCountItems.forEach(ci => {
        const key = `${ci.productId}_${ci.stockCount?.warehouse || 'default'}`;
        adjIncrMap.set(key, (adjIncrMap.get(key) || 0) + (ci.diff || 0));
      });

      inventory = products.map((product, index) => {
        const key = `${product.id}_${warehouse || 'default'}`;
        const snapshot = snapshotMap.get(key);
        const closingQty   = snapshot ? Number(snapshot.closingQty) : 0;
        const purchaseIncr = purchaseIncrMap.get(key) || 0;
        const reqIncr      = reqIncrMap.get(key)      || 0;
        const outIncr      = outIncrMap.get(key)      || 0;
        const inIncr       = inIncrMap.get(key)       || 0;
        const adjIncr      = adjIncrMap.get(key)      || 0;
        const currentQty   = closingQty + purchaseIncr - reqIncr - outIncr + inIncr + adjIncr;
        const threshold = product.lowStockThreshold || 10;

        return {
          id: index + 1,
          productId: product.id,
          snapshotQty: closingQty,
          purchaseIncr,
          requisitionIncr: reqIncr,
          transferOutIncr: outIncr,
          transferInIncr: inIncr,
          countAdjIncr: adjIncr,
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
      // v2 fallback: SQL groupBy 彙總，避免全表載入記憶體
      const purchaseWhere = { status: '已入庫' };
      if (whValue) {
        purchaseWhere.OR = [{ inventoryWarehouse: whValue }, { purchaseMaster: { warehouse: whValue } }];
      }

      // 進貨量：DB 彙總，只回傳 (productId, SUM(quantity))
      const [purchaseGroups, warehouseGroups] = await Promise.all([
        prisma.purchaseDetail.groupBy({
          by: ['productId'],
          where: purchaseWhere,
          _sum: { quantity: true },
        }),
        // inventoryWarehouses 欄位：需要 productId × inventoryWarehouse 維度
        prisma.purchaseDetail.groupBy({
          by: ['productId', 'inventoryWarehouse'],
          where: { ...purchaseWhere, inventoryWarehouse: { not: null } },
        }),
      ]);
      const purchaseQtyMap = new Map(purchaseGroups.map(g => [g.productId, g._sum.quantity || 0]));
      const inventoryWarehouseMap = new Map();
      warehouseGroups.forEach(g => {
        if (g.inventoryWarehouse) {
          const locs = inventoryWarehouseMap.get(g.productId) || new Set();
          locs.add(g.inventoryWarehouse);
          inventoryWarehouseMap.set(g.productId, locs);
        }
      });

      // 不扣銷貨：進貨入庫後僅以領用、調撥扣數量

      // 領用：DB 彙總
      const reqGroups = await prisma.inventoryRequisition.groupBy({
        by: ['productId'],
        where: whValue ? { warehouse: whValue } : {},
        _sum: { quantity: true },
      }).catch(() => []);
      const reqQtyMap = new Map(reqGroups.map(g => [g.productId, g._sum.quantity || 0]));

      // 調撥：在 item 層 groupBy，透過 relation 過濾 fromWarehouse / toWarehouse
      // 有倉篩選時只算該倉進出；無倉篩選時 out 與 in 對同一 productId 完全抵消（正確行為）
      const [outGroups, inGroups] = await Promise.all([
        prisma.inventoryTransferItem.groupBy({
          by: ['productId'],
          where: whValue ? { transfer: { fromWarehouse: whValue } } : {},
          _sum: { quantity: true },
        }).catch(() => []),
        prisma.inventoryTransferItem.groupBy({
          by: ['productId'],
          where: whValue ? { transfer: { toWarehouse: whValue } } : {},
          _sum: { quantity: true },
        }).catch(() => []),
      ]);
      const transferOutMap = new Map(outGroups.map(g => [g.productId, g._sum.quantity || 0]));
      const transferInMap  = new Map(inGroups.map(g =>  [g.productId, g._sum.quantity || 0]));

      // 盤點差異：DB 彙總
      const countGroups = await prisma.stockCountItem.groupBy({
        by: ['productId'],
        where: whValue ? { stockCount: { warehouse: whValue } } : {},
        _sum: { diff: true },
      }).catch(() => []);
      const countDiffMap = new Map(countGroups.map(g => [g.productId, g._sum.diff || 0]));

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
