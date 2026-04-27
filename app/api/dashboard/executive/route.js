import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { handleApiError } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import { getCached, setCached } from '@/lib/server-cache';

export const dynamic = 'force-dynamic';

const EXEC_TTL = 5 * 60_000; // 5 分鐘

export async function GET(request) {
  const auth = await requirePermission(PERMISSIONS.ANALYTICS_VIEW);
  if (!auth.ok) return auth.response;

  const forceRefresh = new URL(request.url).searchParams.get('refresh') === 'true';

  const now = new Date();
  const currentYear  = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const monthPrefix  = `${currentYear}-${String(currentMonth).padStart(2, '0')}`;

  const cacheKey = `dashboard:executive:${monthPrefix}`;
  const cached   = forceRefresh ? null : getCached(cacheKey);
  if (cached) {
    return NextResponse.json({ ...cached.data, cacheStatus: 'cached', cachedAt: cached.cachedAt });
  }

  try {
    const sixMonthsLater = new Date();
    sixMonthsLater.setMonth(sixMonthsLater.getMonth() + 6);
    const todayStr = now.toISOString().split('T')[0];

    const [thisMonthPurchases, thisMonthSales, cashAccounts, overdueChecks, expiringLoans] = await Promise.all([
      prisma.purchaseMaster.findMany({
        where: { purchaseDate: { startsWith: monthPrefix } },
        select: { totalAmount: true, supplierId: true },
      }),
      prisma.salesMaster.findMany({
        where: { invoiceDate: { startsWith: monthPrefix } },
        select: { totalAmount: true, id: true },
      }),
      prisma.cashAccount.findMany({
        where: { isActive: true },
        select: { currentBalance: true },
      }),
      prisma.check.count({ where: { status: 'due', dueDate: { lt: todayStr } } }),
      prisma.loanMaster.findMany({
        where: { status: 'active', endDate: { lte: sixMonthsLater.toISOString().split('T')[0] } },
        select: { loanName: true, endDate: true, currentBalance: true },
      }),
    ]);

    const purchaseTotal = thisMonthPurchases.reduce((s, p) => s + Number(p.totalAmount || 0), 0);
    const salesTotal    = thisMonthSales.reduce((s, p) => s + Number(p.totalAmount || 0), 0);
    const totalCash     = cashAccounts.reduce((s, a) => s + Number(a.currentBalance || 0), 0);

    // Supplier concentration analysis
    const supplierTotals = {};
    thisMonthPurchases.forEach(p => {
      if (p.supplierId) supplierTotals[p.supplierId] = (supplierTotals[p.supplierId] || 0) + Number(p.totalAmount || 0);
    });
    const sortedSuppliers = Object.entries(supplierTotals).sort((a, b) => b[1] - a[1]);
    const topSupplierPct = purchaseTotal > 0 && sortedSuppliers.length > 0
      ? +((sortedSuppliers[0][1] / purchaseTotal) * 100).toFixed(1)
      : 0;

    // Risk alerts
    const risks = [];
    if (overdueChecks > 0) risks.push({ type: 'check_overdue', severity: 'high', message: `${overdueChecks} 張支票已過期未兌現`, action: '請至支票管理處理' });
    if (topSupplierPct > 20) risks.push({ type: 'supplier_concentration', severity: 'medium', message: `最大供應商佔比 ${topSupplierPct}%，超過 20% 門檻`, action: '建議評估替代供應商' });
    if (totalCash < 100000) risks.push({ type: 'cash_shortage', severity: totalCash < 50000 ? 'high' : 'medium', message: `現金餘額 NT$${totalCash.toLocaleString()} 低於安全水位`, action: '建議加速應收帳款回收' });
    if (expiringLoans.length > 0) risks.push({ type: 'loan_expiring', severity: 'medium', message: `${expiringLoans.length} 筆貸款將於 6 個月內到期`, action: '建議安排續約或償還計畫' });

    // Decision recommendations
    const recommendations = [];
    if (topSupplierPct > 20) recommendations.push({ priority: 1, action: '分散供應商風險', description: `最大供應商佔比 ${topSupplierPct}%，建議尋找替代供應商`, expectedImpact: '降低供應鏈中斷風險', timeline: '30天內' });
    if (overdueChecks > 0) recommendations.push({ priority: 1, action: '處理逾期支票', description: `${overdueChecks} 張支票已過期，需立即處理`, expectedImpact: '降低財務風險', timeline: '立即' });

    const body = {
      kpis: { monthlySales: salesTotal, monthlyPurchases: purchaseTotal, totalCash, topSupplierConcentration: topSupplierPct },
      riskAlerts: risks.sort((a, b) => ({ high: 0, medium: 1, low: 2 }[a.severity] || 2) - ({ high: 0, medium: 1, low: 2 }[b.severity] || 2)),
      recommendations,
      expiringLoans: expiringLoans.map(l => ({ ...l, currentBalance: Number(l.currentBalance) })),
    };

    const entry = setCached(cacheKey, body, EXEC_TTL);
    return NextResponse.json({ ...body, cacheStatus: 'live', cachedAt: entry.cachedAt });
  } catch (error) {
    return handleApiError(error);
  }
}
