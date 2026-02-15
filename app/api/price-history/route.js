import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const productId = searchParams.get('productId');
    const supplierId = searchParams.get('supplierId');

    const where = {};
    if (productId) where.productId = parseInt(productId);
    if (supplierId) where.supplierId = parseInt(supplierId);

    const priceHistory = await prisma.priceHistory.findMany({
      where,
      include: {
        product: { select: { name: true } },
        supplier: { select: { name: true } }
      },
      orderBy: { purchaseDate: 'desc' }
    });

    const result = priceHistory.map(ph => ({
      id: ph.id,
      supplierId: ph.supplierId,
      productId: ph.productId,
      purchaseDate: ph.purchaseDate,
      unitPrice: Number(ph.unitPrice),
      productName: ph.product?.name || '未知產品',
      supplierName: ph.supplier?.name || '未知供應商'
    }));

    return NextResponse.json(result);
  } catch (error) {
    console.error('查詢歷史價格錯誤:', error);
    return NextResponse.json([]);
  }
}
