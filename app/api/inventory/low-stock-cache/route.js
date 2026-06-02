import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { handleApiError } from '@/lib/error-handler';
import { requirePermission, requireAnyPermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import { calcAllQtysForWarehouse, DEFAULT_LOW_STOCK_THRESHOLD } from '@/lib/inventory-helpers';

export const dynamic = 'force-dynamic';

// POST: 手動重算低庫存快取（cron 沒跑時的替代方案）
export async function POST(request) {
  const auth = await requirePermission(PERMISSIONS.INVENTORY_VIEW);
  if (!auth.ok) return auth.response;

  try {
    // 1. 取所有在庫產品及閾值
    const products = await prisma.product.findMany({
      where: { isInStock: true },
      select: { id: true, lowStockThreshold: true },
    });
    const thresholdMap = new Map(
      products.map(p => [p.id, p.lowStockThreshold || DEFAULT_LOW_STOCK_THRESHOLD])
    );

    // 2. 取所有有庫存活動的倉別（進貨 + 領用 + 調撥）
    const [purchaseWhs, reqWhs, transferFromWhs, transferToWhs] = await Promise.all([
      prisma.purchaseDetail.findMany({
        where: { status: '已入庫' },
        distinct: ['inventoryWarehouse'],
        select: { inventoryWarehouse: true },
      }),
      prisma.inventoryRequisition.findMany({ distinct: ['warehouse'], select: { warehouse: true } }),
      prisma.inventoryTransfer.findMany({ distinct: ['fromWarehouse'], select: { fromWarehouse: true } }),
      prisma.inventoryTransfer.findMany({ distinct: ['toWarehouse'],   select: { toWarehouse:   true } }),
    ]);

    const warehouses = new Set([
      ...purchaseWhs.map(r => r.inventoryWarehouse).filter(Boolean),
      ...reqWhs.map(r => r.warehouse),
      ...transferFromWhs.map(r => r.fromWarehouse),
      ...transferToWhs.map(r => r.toWarehouse),
    ]);

    if (warehouses.size === 0) {
      return NextResponse.json({ inserted: 0, message: '無任何庫存資料' });
    }

    // 3. 逐倉計算，收集低庫存品項
    const now = new Date();
    const cacheEntries = [];

    for (const wh of warehouses) {
      const qtyMap = await calcAllQtysForWarehouse(prisma, wh);
      for (const [productId, qty] of qtyMap) {
        const threshold = thresholdMap.get(productId) ?? DEFAULT_LOW_STOCK_THRESHOLD;
        if (qty < threshold) {
          cacheEntries.push({ productId, warehouse: wh, currentQty: qty, threshold, lastCalculated: now });
        }
      }
    }

    // 4. 原子替換：清舊快取 → 寫新快取
    await prisma.$transaction([
      prisma.inventoryLowStockCache.deleteMany({}),
      ...(cacheEntries.length > 0
        ? [prisma.inventoryLowStockCache.createMany({ data: cacheEntries })]
        : []),
    ]);

    return NextResponse.json({
      inserted: cacheEntries.length,
      warehousesScanned: warehouses.size,
      calculatedAt: now.toISOString(),
      message: `低庫存快取已更新：${cacheEntries.length} 筆`,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

// spec4 v3: Read from InventoryLowStockCache for the low-stock banner
export async function GET() {
  const auth = await requirePermission(PERMISSIONS.INVENTORY_VIEW);
  if (!auth.ok) return auth.response;
  
  try {
    let lowStockItems = [];
    let lastCalculated = null;

    try {
      lowStockItems = await prisma.inventoryLowStockCache.findMany({
        include: {
          product: {
            select: { id: true, name: true, code: true, unit: true, costPrice: true },
          },
        },
        orderBy: { currentQty: 'asc' },
      });

      if (lowStockItems.length > 0) {
        lastCalculated = lowStockItems[0].lastCalculated;
      }
    } catch {
      // Table might not exist yet, return empty
    }

    // Check if cache is stale (>26 hours old)
    let isStale = false;
    if (lastCalculated) {
      const hoursDiff = (Date.now() - new Date(lastCalculated).getTime()) / (1000 * 60 * 60);
      isStale = hoursDiff > 26;
    }

    return NextResponse.json({
      items: lowStockItems.map(item => ({
        productId: item.productId,
        warehouse: item.warehouse,
        currentQty: Number(item.currentQty),
        threshold: item.threshold,
        product: item.product ? {
          ...item.product,
          costPrice: Number(item.product.costPrice),
        } : null,
      })),
      count: lowStockItems.length,
      lastCalculated,
      isStale,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
