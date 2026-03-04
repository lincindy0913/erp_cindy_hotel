import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { handleApiError } from '@/lib/error-handler';

export const dynamic = 'force-dynamic';

// spec4 v3: Read from InventoryLowStockCache for the low-stock banner
export async function GET() {
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
