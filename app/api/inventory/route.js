import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

function getInventoryStatus(currentQty) {
  if (currentQty < 0) return '不足';
  if (currentQty < 10) return '偏低';
  if (currentQty > 1000) return '過多';
  return '正常';
}

export async function GET(request) {
  try {
    // 只取得「列入庫存」的產品
    const products = await prisma.product.findMany({
      where: { isInStock: true }
    });

    // 計算進貨數量（按產品分組加總）
    const purchaseAgg = await prisma.purchaseDetail.groupBy({
      by: ['productId'],
      _sum: { quantity: true }
    });
    const purchaseQtyMap = new Map();
    purchaseAgg.forEach(agg => {
      purchaseQtyMap.set(agg.productId, agg._sum.quantity || 0);
    });

    // 計算銷貨數量（按產品分組加總）
    const salesAgg = await prisma.salesDetail.groupBy({
      by: ['productId'],
      _sum: { quantity: true }
    });
    const salesQtyMap = new Map();
    salesAgg.forEach(agg => {
      salesQtyMap.set(agg.productId, agg._sum.quantity || 0);
    });

    // 組合庫存資料
    const inventory = products.map((product, index) => {
      const purchaseQty = purchaseQtyMap.get(product.id) || 0;
      const salesQty = salesQtyMap.get(product.id) || 0;
      const currentQty = purchaseQty - salesQty;

      return {
        id: index + 1,
        productId: product.id,
        beginningQty: 0,
        purchaseQty,
        salesQty,
        currentQty,
        product: {
          id: product.id,
          name: product.name,
          code: product.code,
          unit: product.unit,
          costPrice: Number(product.costPrice),
          sellingPrice: Number(product.salesPrice),
          isInStock: product.isInStock
        },
        status: getInventoryStatus(currentQty)
      };
    });

    return NextResponse.json(inventory);
  } catch (error) {
    console.error('查詢庫存錯誤:', error);
    return NextResponse.json([]);
  }
}
