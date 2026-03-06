import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { handleApiError } from '@/lib/error-handler';
import { requirePermission, requireAnyPermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const auth = await requirePermission(PERMISSIONS.ANALYTICS_VIEW);
  if (!auth.ok) return auth.response;

  try {
    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();
    const currentMonth = currentDate.getMonth() + 1;
    const monthPrefix = `${currentYear}-${String(currentMonth).padStart(2, '0')}`;

    // Try to read from MonthlyAggregation cache first (spec24)
    const cachedAgg = await prisma.monthlyAggregation.findFirst({
      where: {
        type: 'dashboard',
        year: currentYear,
        month: currentMonth,
      },
    });

    let purchaseTotal = 0;
    let salesTotal = 0;
    let grossProfit = 0;
    let grossProfitMargin = 0;
    let cacheStatus = 'live';

    if (cachedAgg && cachedAgg.data && !cachedAgg.isStale) {
      // Use cached data
      const data = cachedAgg.data;
      purchaseTotal = data.purchaseTotal || 0;
      salesTotal = data.salesTotal || 0;
      grossProfit = data.grossProfit || 0;
      grossProfitMargin = data.grossProfitMargin || 0;
      cacheStatus = 'cached';
    } else {
      // Live calculation
      const thisMonthPurchases = await prisma.purchaseMaster.findMany({
        where: { purchaseDate: { startsWith: monthPrefix } },
        select: { totalAmount: true }
      });
      purchaseTotal = thisMonthPurchases.reduce((sum, p) => sum + Number(p.totalAmount || 0), 0);

      const thisMonthSales = await prisma.salesMaster.findMany({
        where: { invoiceDate: { startsWith: monthPrefix } },
        select: { totalAmount: true, id: true }
      });
      salesTotal = thisMonthSales.reduce((sum, s) => sum + Number(s.totalAmount || 0), 0);

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

      grossProfit = salesTotal - salesCost;
      grossProfitMargin = salesTotal > 0 ? ((grossProfit / salesTotal) * 100).toFixed(2) : 0;
    }

    // Cash balance summary (spec7 v5)
    const cashAccounts = await prisma.cashAccount.findMany({
      where: { isActive: true },
      select: { id: true, name: true, currentBalance: true, type: true, warehouse: true }
    });
    const totalCashBalance = cashAccounts.reduce((sum, a) => sum + Number(a.currentBalance || 0), 0);

    // Low inventory count (spec4 v3 - from cache if available)
    let lowInventoryCount = 0;
    try {
      lowInventoryCount = await prisma.inventoryLowStockCache.count();
    } catch {
      lowInventoryCount = await prisma.product.count({ where: { isInStock: true } });
    }

    // Pending payment orders count
    const pendingPayments = await prisma.paymentOrder.count({
      where: { status: { in: ['pending', 'pending_cashier'] } }
    });

    // Recent transactions
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
        type: '銷貨', no: s.salesNo, date: s.invoiceDate,
        amount: Number(s.totalAmount || 0), status: s.status
      })),
      ...recentPurchases.map(p => ({
        type: '進貨', no: p.purchaseNo, date: p.purchaseDate,
        amount: Number(p.totalAmount || 0), status: ''
      }))
    ].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 10);

    // Risk alerts (spec7 v5 / spec16 v5)
    const overdueChecks = await prisma.check.count({
      where: { status: 'due', dueDate: { lt: new Date().toISOString().split('T')[0] } }
    });

    // Expiring loans (spec11)
    const sixMonthsLater = new Date();
    sixMonthsLater.setMonth(sixMonthsLater.getMonth() + 6);
    const expiringLoans = await prisma.loanMaster.count({
      where: {
        status: 'active',
        endDate: { lte: sixMonthsLater.toISOString().split('T')[0] }
      }
    });

    const dashboardData = {
      kpis: {
        thisMonthPurchase: purchaseTotal,
        thisMonthSales: salesTotal,
        grossProfit,
        grossProfitMargin,
        lowInventoryCount,
        totalCashBalance,
        pendingPayments,
      },
      recentTransactions,
      riskAlerts: {
        overdueChecks,
        expiringLoans,
      },
      cashAccounts: cashAccounts.map(a => ({
        ...a,
        currentBalance: Number(a.currentBalance),
      })),
      thisMonthTrend: {
        purchases: recentPurchases.length,
        sales: recentSales.length
      },
      cacheStatus,
    };

    return NextResponse.json(dashboardData);
  } catch (error) {
    // DB connection error → return empty dashboard instead of 500
    const isConnectionError =
      error.code === 'P1001' || error.code === 'P1002' || error.code === 'P1003' ||
      error.message?.includes('connect ECONNREFUSED') ||
      error.message?.includes("Can't reach database server");
    if (isConnectionError) {
      return NextResponse.json({
        kpis: { thisMonthPurchase: 0, thisMonthSales: 0, grossProfit: 0, grossProfitMargin: 0, lowInventoryCount: 0 },
        recentTransactions: [],
        thisMonthTrend: { purchases: 0, sales: 0 },
        totalCashBalance: 0,
        cashAccounts: [],
        pendingPayments: 0,
        riskAlerts: { overdueChecks: 0, expiringLoans: 0 },
        cacheStatus: 'offline',
      });
    }
    return handleApiError(error);
  }
}
