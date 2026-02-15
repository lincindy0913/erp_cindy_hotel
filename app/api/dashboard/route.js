import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();
    const currentMonth = currentDate.getMonth() + 1;

    // 本月日期範圍字串 (YYYY-MM format for startsWith matching)
    const monthPrefix = `${currentYear}-${String(currentMonth).padStart(2, '0')}`;

    // 計算本月進貨總額
    const thisMonthPurchases = await prisma.purchaseMaster.findMany({
      where: { purchaseDate: { startsWith: monthPrefix } },
      select: { totalAmount: true }
    });
    const purchaseTotal = thisMonthPurchases.reduce((sum, p) => sum + Number(p.totalAmount || 0), 0);

    // 計算本月銷貨總額
    const thisMonthSales = await prisma.salesMaster.findMany({
      where: { invoiceDate: { startsWith: monthPrefix } },
      select: { totalAmount: true, id: true }
    });
    const salesTotal = thisMonthSales.reduce((sum, s) => sum + Number(s.totalAmount || 0), 0);

    // 計算毛利（銷貨 - 進貨成本）
    const thisMonthSalesIds = thisMonthSales.map(s => s.id);
    let salesCost = 0;

    if (thisMonthSalesIds.length > 0) {
      const salesDetails = await prisma.salesDetail.findMany({
        where: { salesId: { in: thisMonthSalesIds } },
        select: { productId: true, quantity: true }
      });

      const productIds = [...new Set(salesDetails.map(d => d.productId).filter(Boolean))];
      const products = await prisma.product.findMany({
        where: { id: { in: productIds } },
        select: { id: true, costPrice: true }
      });
      const costMap = new Map();
      products.forEach(p => costMap.set(p.id, Number(p.costPrice || 0)));

      salesDetails.forEach(detail => {
        const cost = costMap.get(detail.productId) || 0;
        salesCost += (detail.quantity || 0) * cost;
      });
    }

    const grossProfit = salesTotal - salesCost;
    const grossProfitMargin = salesTotal > 0 ? ((grossProfit / salesTotal) * 100).toFixed(2) : 0;

    // 計算庫存警示
    const productCount = await prisma.product.count({ where: { isInStock: true } });

    // 計算最近交易
    const recentSales = await prisma.salesMaster.findMany({
      orderBy: { id: 'desc' },
      take: 5,
      select: { salesNo: true, invoiceDate: true, totalAmount: true, status: true }
    });
    const recentPurchases = await prisma.purchaseMaster.findMany({
      orderBy: { id: 'desc' },
      take: 5,
      select: { purchaseNo: true, purchaseDate: true, totalAmount: true }
    });

    const recentTransactions = [
      ...recentSales.map(s => ({
        type: '銷貨',
        no: s.salesNo,
        date: s.invoiceDate,
        amount: Number(s.totalAmount || 0),
        status: s.status
      })),
      ...recentPurchases.map(p => ({
        type: '進貨',
        no: p.purchaseNo,
        date: p.purchaseDate,
        amount: Number(p.totalAmount || 0),
        status: ''
      }))
    ]
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 10);

    const dashboardData = {
      kpis: {
        thisMonthPurchase: purchaseTotal,
        thisMonthSales: salesTotal,
        grossProfit: grossProfit,
        grossProfitMargin: grossProfitMargin,
        lowInventoryCount: productCount
      },
      recentTransactions,
      thisMonthTrend: {
        purchases: thisMonthPurchases.length,
        sales: thisMonthSales.length
      }
    };

    return NextResponse.json(dashboardData);
  } catch (error) {
    console.error('取得儀表板資料錯誤:', error);
    return NextResponse.json({
      kpis: {
        thisMonthPurchase: 0,
        thisMonthSales: 0,
        grossProfit: 0,
        grossProfitMargin: 0,
        lowInventoryCount: 0
      },
      recentTransactions: [],
      thisMonthTrend: { purchases: 0, sales: 0 }
    });
  }
}
