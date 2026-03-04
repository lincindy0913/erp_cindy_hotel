import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { handleApiError } from '@/lib/error-handler';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const productId = searchParams.get('productId');

    const where = {};
    if (productId) where.productId = parseInt(productId);

    const comparisons = await prisma.priceComparison.findMany({
      where,
      include: {
        product: { select: { name: true } },
        supplier: { select: { name: true } }
      }
    });

    const result = comparisons.map(comp => ({
      productId: comp.productId,
      supplierId: comp.supplierId,
      unitPrice: Number(comp.unitPrice),
      lastPurchaseDate: comp.date,
      productName: comp.product?.name || '未知產品',
      supplierName: comp.supplier?.name || '未知供應商'
    }));

    // 找出每個產品的最低價
    const minPrices = {};
    result.forEach(comp => {
      const key = comp.productId;
      if (!minPrices[key] || comp.unitPrice < minPrices[key].price) {
        minPrices[key] = { price: comp.unitPrice, supplierId: comp.supplierId, supplierName: comp.supplierName };
      }
    });

    // 標記最低價
    const resultWithMin = result.map(comp => ({
      ...comp,
      isMinPrice: minPrices[comp.productId] && minPrices[comp.productId].supplierId === comp.supplierId
    }));

    return NextResponse.json(resultWithMin);
  } catch (error) {
    return handleApiError(error);
  }
}
