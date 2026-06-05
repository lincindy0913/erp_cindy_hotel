import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import prisma from '@/lib/prisma';
import { getCached, setCached } from '@/lib/server-cache';
import { createErrorResponse } from '@/lib/error-handler';
import { localDateStr } from '@/lib/localDate';
import { PERMISSIONS } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

const SUMMARY_TTL = 3 * 60_000; // 3 分鐘

export async function GET(request) {
  const session = await getServerSession(authOptions);
  if (!session) return createErrorResponse('UNAUTHORIZED', '請先登入', 401);
  const forceRefresh = new URL(request.url).searchParams.get('refresh') === 'true';

  const userEmail = session.user?.email || 'anon';
  const userPerms = session.user?.permissions || [];
  const role      = session.user?.role || '';
  const isAdminOrManager =
    role === 'admin' ||
    userPerms.includes('*') ||
    (session.user?.roles || []).some(r => ['admin', 'manager'].includes(r));
  const hasPerm = (p) => isAdminOrManager || userPerms.includes(p);

  const now = new Date();
  const currentYear  = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const monthPrefix  = `${currentYear}-${String(currentMonth).padStart(2, '0')}`;

  // Cache key is per-user — different permission sets yield different subsets
  const cacheKey = `dashboard:summary:${monthPrefix}:${userEmail}`;
  const cached   = forceRefresh ? null : getCached(cacheKey);
  if (cached) {
    return NextResponse.json({ ...cached.data, cacheStatus: 'cached', cachedAt: cached.cachedAt });
  }

  try {
    const todayStr = localDateStr(now);
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
      hasPerm(PERMISSIONS.PURCHASING_VIEW)
        ? prisma.purchaseMaster.aggregate({ where: { purchaseDate: { startsWith: monthPrefix } }, _sum: { totalAmount: true }, _count: true })
        : null,
      hasPerm(PERMISSIONS.SALES_VIEW)
        ? prisma.salesMaster.aggregate({ where: { invoiceDate: { startsWith: monthPrefix } }, _sum: { totalAmount: true }, _count: true })
        : null,
      hasPerm(PERMISSIONS.CASHFLOW_VIEW)
        ? prisma.cashAccount.findMany({ where: { isActive: true }, select: { name: true, currentBalance: true, warehouse: true } })
        : null,
      hasPerm(PERMISSIONS.CHECK_VIEW)
        ? prisma.check.count({ where: { status: 'due', dueDate: { lt: todayStr } } })
        : null,
      hasPerm(PERMISSIONS.LOAN_VIEW)
        ? prisma.loanMaster.count({ where: { status: '使用中', endDate: { lte: localDateStr(sixMonthsLater) } } })
        : null,
      hasPerm(PERMISSIONS.CASHIER_VIEW) || hasPerm(PERMISSIONS.CASHIER_EXECUTE)
        ? prisma.paymentOrder.count({ where: { status: '待出納' } })
        : null,
      hasPerm(PERMISSIONS.INVENTORY_VIEW)
        ? prisma.inventoryLowStockCache.count().catch(() => 0)
        : null,
      hasPerm(PERMISSIONS.EXPENSE_VIEW)
        ? prisma.commonExpenseRecord.aggregate({ where: { expenseMonth: monthPrefix, status: '已確認' }, _sum: { totalDebit: true } })
        : null,
      hasPerm(PERMISSIONS.PMS_VIEW)
        ? prisma.pmsIncomeRecord.aggregate({ where: { businessDate: { startsWith: monthPrefix }, entryType: '貸方' }, _sum: { amount: true }, _count: true })
        : null,
      hasPerm(PERMISSIONS.CASHFLOW_VIEW)
        ? prisma.utilityBillRecord.count()
        : null,
    ]);

    const purchaseTotal    = thisMonthPurchases  != null ? Number(thisMonthPurchases._sum.totalAmount  || 0) : null;
    const salesTotal       = thisMonthSales      != null ? Number(thisMonthSales._sum.totalAmount      || 0) : null;
    const expenseTotal     = thisMonthExpenses   != null ? Number(thisMonthExpenses._sum.totalDebit    || 0) : null;
    const pmsIncomeTotal   = recentPmsIncome     != null ? Number(recentPmsIncome._sum.amount          || 0) : null;
    const totalCashBalance = cashAccounts        != null ? cashAccounts.reduce((s, a) => s + Number(a.currentBalance || 0), 0) : null;

    const body = {
      month: `${currentYear}/${String(currentMonth).padStart(2, '0')}`,
      kpis: {
        thisMonthPurchase: purchaseTotal,
        purchaseCount:     thisMonthPurchases?._count ?? null,
        thisMonthSales:    salesTotal,
        salesCount:        thisMonthSales?._count     ?? null,
        thisMonthExpense:  expenseTotal,
        totalCashBalance,
        pmsIncome:         pmsIncomeTotal,
        pmsIncomeCount:    recentPmsIncome?._count    ?? null,
        lowInventoryCount: lowInventoryCount ?? null,
      },
      alerts: {
        overdueChecks:     overdueChecks     ?? null,
        expiringLoans:     expiringLoans     ?? null,
        pendingPayments:   pendingPayments   ?? null,
        lowInventoryCount: lowInventoryCount ?? null,
      },
      cashAccounts: cashAccounts != null
        ? cashAccounts.map(a => ({ name: a.name, warehouse: a.warehouse, balance: Number(a.currentBalance || 0) }))
        : [],
      utilityBillCount: utilityBillCount ?? null,
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
