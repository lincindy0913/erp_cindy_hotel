import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getCached, setCached } from '@/lib/server-cache';

export const dynamic = 'force-dynamic';

const SUMMARY_TTL = 3 * 60_000; // 3 分鐘

// Public summary — no auth required (internal network only)
export async function GET(request) {
  const forceRefresh = new URL(request.url).searchParams.get('refresh') === 'true';

  const now = new Date();
  const currentYear  = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const monthPrefix  = `${currentYear}-${String(currentMonth).padStart(2, '0')}`;

  const cacheKey = `dashboard:summary:${monthPrefix}`;
  const cached   = forceRefresh ? null : getCached(cacheKey);
  if (cached) {
    return NextResponse.json({ ...cached.data, cacheStatus: 'cached', cachedAt: cached.cachedAt });
  }

  try {
    const todayStr = now.toISOString().split('T')[0];
    const sixMonthsLater = new Date();
    sixMonthsLater.setMonth(sixMonthsLater.getMonth() + 6);

    const [
      thisMonthPurchases,
      thisMonthSales,
      cashAccounts,
      overdueChecks,
      expiringLoans,
      pendingPayments,
      lowInventoryCount,
      thisMonthExpenses,
      recentPmsIncome,
      utilityBillCount,
    ] = await Promise.all([
      prisma.purchaseMaster.aggregate({
        where: { purchaseDate: { startsWith: monthPrefix } },
        _sum: { totalAmount: true }, _count: true,
      }),
      prisma.salesMaster.aggregate({
        where: { invoiceDate: { startsWith: monthPrefix } },
        _sum: { totalAmount: true }, _count: true,
      }),
      prisma.cashAccount.findMany({
        where: { isActive: true },
        select: { name: true, currentBalance: true, warehouse: true },
      }),
      prisma.check.count({ where: { status: 'due', dueDate: { lt: todayStr } } }),
      prisma.loanMaster.count({
        where: { status: 'active', endDate: { lte: sixMonthsLater.toISOString().split('T')[0] } },
      }),
      prisma.paymentOrder.count({ where: { status: { in: ['pending', 'pending_cashier'] } } }),
      prisma.inventoryLowStockCache.count().catch(() =>
        prisma.product.count({ where: { isInStock: true } })
      ),
      prisma.commonExpenseRecord.aggregate({
        where: { expenseMonth: monthPrefix, status: '已確認' },
        _sum: { totalDebit: true },
      }),
      prisma.pmsIncomeRecord.aggregate({
        where: { businessDate: { startsWith: monthPrefix } },
        _sum: { amount: true }, _count: true,
      }),
      prisma.utilityBillRecord.count(),
    ]);

    const purchaseTotal  = Number(thisMonthPurchases._sum.totalAmount || 0);
    const salesTotal     = Number(thisMonthSales._sum.totalAmount || 0);
    const totalCashBalance = cashAccounts.reduce((s, a) => s + Number(a.currentBalance || 0), 0);
    const expenseTotal   = Number(thisMonthExpenses._sum.totalDebit || 0);
    const pmsIncomeTotal = Number(recentPmsIncome._sum.amount || 0);

    const body = {
      month: `${currentYear}/${String(currentMonth).padStart(2, '0')}`,
      kpis: {
        thisMonthPurchase: purchaseTotal,
        purchaseCount: thisMonthPurchases._count,
        thisMonthSales: salesTotal,
        salesCount: thisMonthSales._count,
        thisMonthExpense: expenseTotal,
        totalCashBalance,
        pmsIncome: pmsIncomeTotal,
        pmsIncomeCount: recentPmsIncome._count,
      },
      alerts: { overdueChecks, expiringLoans, pendingPayments, lowInventoryCount },
      cashAccounts: cashAccounts.map(a => ({
        name: a.name, warehouse: a.warehouse, balance: Number(a.currentBalance || 0),
      })),
      utilityBillCount,
    };

    const entry = setCached(cacheKey, body, SUMMARY_TTL);
    return NextResponse.json({ ...body, cacheStatus: 'live', cachedAt: entry.cachedAt });
  } catch (error) {
    const isConnectionError =
      error.code === 'P1001' || error.code === 'P1002' ||
      error.message?.includes('connect ECONNREFUSED') ||
      error.message?.includes("Can't reach database server");
    if (isConnectionError) {
      return NextResponse.json({
        month: '',
        kpis: { thisMonthPurchase: 0, thisMonthSales: 0, thisMonthExpense: 0, totalCashBalance: 0, pmsIncome: 0 },
        alerts: { overdueChecks: 0, expiringLoans: 0, pendingPayments: 0, lowInventoryCount: 0 },
        cashAccounts: [],
        utilityBillCount: 0,
        offline: true,
        cacheStatus: 'offline',
      });
    }
    console.error('Dashboard summary error:', error.message);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
