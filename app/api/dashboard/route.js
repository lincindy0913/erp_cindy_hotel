import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { handleApiError } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import { getCached, setCached } from '@/lib/server-cache';

export const dynamic = 'force-dynamic';

const KPI_TTL    = 3 * 60_000; // 3 分鐘：月度統計快取
const COUNTS_TTL = 2 * 60_000; // 2 分鐘：待處理件數快取

export async function GET(request) {
  const auth = await requirePermission(PERMISSIONS.ANALYTICS_VIEW);
  if (!auth.ok) return auth.response;

  const forceRefresh = new URL(request.url).searchParams.get('refresh') === 'true';

  try {
    const now = new Date();
    const currentYear  = now.getFullYear();
    const currentMonth = now.getMonth() + 1;
    const monthPrefix  = `${currentYear}-${String(currentMonth).padStart(2, '0')}`;

    // ── 1. 月度 KPI（最貴）：進貨、銷貨、毛利 ──
    const kpiKey = `dashboard:kpi:${monthPrefix}`;
    let kpiData  = forceRefresh ? null : getCached(kpiKey);
    let cacheStatus = 'cached';

    if (!kpiData) {
      cacheStatus = 'live';

      const [thisMonthPurchases, thisMonthSales] = await Promise.all([
        prisma.purchaseMaster.findMany({
          where: { purchaseDate: { startsWith: monthPrefix } },
          select: { totalAmount: true },
        }),
        prisma.salesMaster.findMany({
          where: { invoiceDate: { startsWith: monthPrefix } },
          select: { totalAmount: true, id: true },
        }),
      ]);

      const purchaseTotal = thisMonthPurchases.reduce((s, p) => s + Number(p.totalAmount || 0), 0);
      const salesTotal    = thisMonthSales.reduce((s, p) => s + Number(p.totalAmount || 0), 0);

      // 毛利：需要 salesDetail → product.costPrice
      const thisMonthSalesIds = thisMonthSales.map(s => s.id);
      let salesCost = 0;
      if (thisMonthSalesIds.length > 0) {
        const salesDetails = await prisma.salesDetail.findMany({
          where: { salesId: { in: thisMonthSalesIds } },
          select: { productId: true, quantity: true },
        });
        const productIds = [...new Set(salesDetails.map(d => d.productId).filter(Boolean))];
        if (productIds.length > 0) {
          const products = await prisma.product.findMany({
            where: { id: { in: productIds } },
            select: { id: true, costPrice: true },
          });
          const costMap = new Map(products.map(p => [p.id, Number(p.costPrice || 0)]));
          salesDetails.forEach(d => {
            salesCost += (d.quantity || 0) * (costMap.get(d.productId) || 0);
          });
        }
      }

      const grossProfit       = salesTotal - salesCost;
      const grossProfitMargin = salesTotal > 0 ? +((grossProfit / salesTotal) * 100).toFixed(2) : 0;

      kpiData = setCached(kpiKey, { purchaseTotal, salesTotal, grossProfit, grossProfitMargin }, KPI_TTL);
    }

    const { purchaseTotal, salesTotal, grossProfit, grossProfitMargin } = kpiData.data;

    // ── 2. 即時計數 + 近期交易（TTL 2 分鐘）──
    const countsKey = `dashboard:counts:${monthPrefix}`;
    let countsData  = forceRefresh ? null : getCached(countsKey);

    if (!countsData) {
      const sixMonthsLater = new Date();
      sixMonthsLater.setMonth(sixMonthsLater.getMonth() + 6);
      const todayStr = now.toISOString().split('T')[0];

      const [
        cashAccounts,
        lowInventoryCount,
        thisMonthExpenses,
        pendingExpenses,
        pendingPayments,
        recentSales,
        recentPurchases,
        recentExpenseRecords,
        overdueChecks,
        expiringLoans,
      ] = await Promise.all([
        prisma.cashAccount.findMany({
          where: { isActive: true },
          select: { id: true, name: true, currentBalance: true, type: true, warehouse: true },
        }),
        prisma.inventoryLowStockCache.count().catch(() =>
          prisma.product.count({ where: { isInStock: true } })
        ),
        prisma.commonExpenseRecord.findMany({
          where: { expenseMonth: monthPrefix, status: '已確認' },
          select: { totalDebit: true },
        }),
        prisma.commonExpenseRecord.count({ where: { status: '待確認' } }),
        prisma.paymentOrder.count({ where: { status: { in: ['pending', 'pending_cashier'] } } }),
        prisma.salesMaster.findMany({
          orderBy: { id: 'desc' }, take: 5,
          select: { salesNo: true, invoiceDate: true, totalAmount: true, status: true },
        }),
        prisma.purchaseMaster.findMany({
          orderBy: { id: 'desc' }, take: 5,
          select: { purchaseNo: true, purchaseDate: true, totalAmount: true },
        }),
        prisma.commonExpenseRecord.findMany({
          orderBy: { id: 'desc' }, take: 5,
          select: { recordNo: true, expenseMonth: true, totalDebit: true, status: true, warehouse: true },
        }),
        prisma.check.count({ where: { status: 'due', dueDate: { lt: todayStr } } }),
        prisma.loanMaster.count({
          where: { status: 'active', endDate: { lte: sixMonthsLater.toISOString().split('T')[0] } },
        }),
      ]);

      countsData = setCached(countsKey, {
        cashAccounts, lowInventoryCount, thisMonthExpenses,
        pendingExpenses, pendingPayments,
        recentSales, recentPurchases, recentExpenseRecords,
        overdueChecks, expiringLoans,
      }, COUNTS_TTL);
    }

    const {
      cashAccounts, lowInventoryCount, thisMonthExpenses,
      pendingExpenses, pendingPayments,
      recentSales, recentPurchases, recentExpenseRecords,
      overdueChecks, expiringLoans,
    } = countsData.data;

    const totalCashBalance = cashAccounts.reduce((s, a) => s + Number(a.currentBalance || 0), 0);
    const expenseTotal     = thisMonthExpenses.reduce((s, e) => s + Number(e.totalDebit || 0), 0);

    const recentTransactions = [
      ...recentSales.map(s => ({ type: '銷貨', no: s.salesNo, date: s.invoiceDate, amount: Number(s.totalAmount || 0), status: s.status })),
      ...recentPurchases.map(p => ({ type: '進貨', no: p.purchaseNo, date: p.purchaseDate, amount: Number(p.totalAmount || 0), status: '' })),
      ...recentExpenseRecords.map(e => ({ type: '費用', no: e.recordNo, date: e.expenseMonth + '-01', amount: Number(e.totalDebit || 0), status: e.status })),
    ].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 10);

    return NextResponse.json({
      kpis: {
        thisMonthPurchase: purchaseTotal,
        thisMonthSales: salesTotal,
        grossProfit,
        grossProfitMargin,
        lowInventoryCount,
        totalCashBalance,
        pendingPayments,
        thisMonthExpense: expenseTotal,
        pendingExpenses,
      },
      recentTransactions,
      riskAlerts: { overdueChecks, expiringLoans },
      cashAccounts: cashAccounts.map(a => ({ ...a, currentBalance: Number(a.currentBalance) })),
      thisMonthTrend: { purchases: recentPurchases.length, sales: recentSales.length },
      cacheStatus,
      cachedAt: kpiData.cachedAt,
    });
  } catch (error) {
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
