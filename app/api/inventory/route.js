import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { handleApiError } from '@/lib/error-handler';

export const dynamic = 'force-dynamic';

function getInventoryStatus(currentQty, threshold = 10) {
  if (currentQty < 0) return '不足';
  if (currentQty < threshold) return '偏低';
  if (currentQty > 1000) return '過多';
  return '正常';
}

export async function GET(request) {
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
      // Fallback: v2 full calculation
      const purchaseAgg = await prisma.purchaseDetail.groupBy({
        by: ['productId'],
        _sum: { quantity: true }
      });
      const purchaseQtyMap = new Map();
      purchaseAgg.forEach(agg => {
        purchaseQtyMap.set(agg.productId, agg._sum.quantity || 0);
      });

      const salesAgg = await prisma.salesDetail.groupBy({
        by: ['productId'],
        _sum: { quantity: true }
      });
      const salesQtyMap = new Map();
      salesAgg.forEach(agg => {
        salesQtyMap.set(agg.productId, agg._sum.quantity || 0);
      });

      inventory = products.map((product, index) => {
        const purchaseQty = purchaseQtyMap.get(product.id) || 0;
        const salesQty = salesQtyMap.get(product.id) || 0;
        const currentQty = purchaseQty - salesQty;
        const threshold = product.lowStockThreshold || 10;

        return {
          id: index + 1,
          productId: product.id,
          beginningQty: 0,
          purchaseQty,
          salesQty,
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
    }

    // Apply filters
    if (warehouse) {
      // Filter by warehouse if applicable (products have warehouseLocation)
    }
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
