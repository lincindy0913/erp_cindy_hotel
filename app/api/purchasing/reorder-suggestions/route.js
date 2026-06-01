import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { handleApiError } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

// Returns items from InventoryLowStockCache with suggested reorder qty,
// default supplier, and last purchase price — used to generate purchase suggestions.
export async function GET() {
  const auth = await requirePermission(PERMISSIONS.PURCHASING_VIEW);
  if (!auth.ok) return auth.response;

  try {
    const lowStockItems = await prisma.inventoryLowStockCache.findMany({
      include: {
        product: {
          select: {
            id: true, name: true, code: true, unit: true,
            supplierId: true, costPrice: true,
            supplier: { select: { id: true, name: true, paymentTerms: true } },
          },
        },
      },
      orderBy: { currentQty: 'asc' },
    });

    if (lowStockItems.length === 0) return NextResponse.json([]);

    // Fetch last purchase price per product+supplier from PriceHistory
    const productIds = lowStockItems.map(i => i.productId);
    const priceHistories = await prisma.priceHistory.findMany({
      where: { productId: { in: productIds } },
      orderBy: { purchaseDate: 'desc' },
      select: { productId: true, supplierId: true, unitPrice: true, purchaseDate: true },
    });

    // productId-supplierId → first (latest) record
    const lastPriceMap = {};
    for (const ph of priceHistories) {
      const key = `${ph.productId}-${ph.supplierId}`;
      if (!lastPriceMap[key]) {
        lastPriceMap[key] = { unitPrice: Number(ph.unitPrice), purchaseDate: ph.purchaseDate };
      }
    }

    const suggestions = lowStockItems.map(item => {
      const product = item.product;
      const supplierId = product?.supplierId ?? null;
      const lastPrice = supplierId ? (lastPriceMap[`${item.productId}-${supplierId}`] ?? null) : null;

      const currentQty = Number(item.currentQty);
      const threshold  = Number(item.threshold);
      const suggestedQty = Math.max(1, Math.ceil(threshold * 2 - currentQty));

      return {
        productId:        item.productId,
        productName:      product?.name  || '未知商品',
        productCode:      product?.code  || '',
        unit:             product?.unit  || '',
        warehouse:        item.warehouse,
        currentQty,
        threshold,
        shortage:         Math.max(0, threshold - currentQty),
        suggestedQty,
        supplierId,
        supplierName:     product?.supplier?.name         || null,
        paymentTerms:     product?.supplier?.paymentTerms || '月結',
        lastUnitPrice:    lastPrice?.unitPrice    ?? null,
        lastPurchaseDate: lastPrice?.purchaseDate ?? null,
      };
    });

    return NextResponse.json(suggestions);
  } catch (error) {
    return handleApiError(error);
  }
}
