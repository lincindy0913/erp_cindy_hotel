import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { handleApiError } from '@/lib/error-handler';
import { requirePermission, requireAnyPermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

// spec7 v5: Executive dashboard with decision intelligence
export async function GET() {
  const auth = await requirePermission(PERMISSIONS.ANALYTICS_VIEW);
  if (!auth.ok) return auth.response;
  
  try {
    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();
    const currentMonth = currentDate.getMonth() + 1;
    const monthPrefix = `${currentYear}-${String(currentMonth).padStart(2, '0')}`;

    // Core KPIs
    const thisMonthPurchases = await prisma.purchaseMaster.findMany({
      where: { purchaseDate: { startsWith: monthPrefix } },
      select: { totalAmount: true },
    });
    const purchaseTotal = thisMonthPurchases.reduce((sum, p) => sum + Number(p.totalAmount || 0), 0);

    const thisMonthSales = await prisma.salesMaster.findMany({
      where: { invoiceDate: { startsWith: monthPrefix } },
      select: { totalAmount: true, id: true },
    });
    const salesTotal = thisMonthSales.reduce((sum, s) => sum + Number(s.totalAmount || 0), 0);

    // Cash balance
    const cashAccounts = await prisma.cashAccount.findMany({
      where: { isActive: true },
      select: { currentBalance: true },
    });
    const totalCash = cashAccounts.reduce((sum, a) => sum + Number(a.currentBalance || 0), 0);

    // Supplier concentration analysis (spec16 v5)
    const supplierPurchases = await prisma.purchaseMaster.findMany({
      where: { purchaseDate: { startsWith: monthPrefix } },
      select: { supplierId: true, totalAmount: true },
    });
    const supplierTotals = {};
    supplierPurchases.forEach(p => {
      if (p.supplierId) {
        supplierTotals[p.supplierId] = (supplierTotals[p.supplierId] || 0) + Number(p.totalAmount || 0);
      }
    });
    const sortedSuppliers = Object.entries(supplierTotals)
      .sort((a, b) => b[1] - a[1]);
    const topSupplierPct = purchaseTotal > 0 && sortedSuppliers.length > 0
      ? ((sortedSuppliers[0][1] / purchaseTotal) * 100).toFixed(1)
      : 0;

    // Risk alerts
    const risks = [];

    // Overdue checks
    const todayStr = currentDate.toISOString().split('T')[0];
    const overdueChecks = await prisma.check.count({
      where: { status: 'due', dueDate: { lt: todayStr } },
    });
    if (overdueChecks > 0) {
      risks.push({
        type: 'check_overdue',
        severity: 'high',
        message: `${overdueChecks} 張支票已過期未兌現`,
        action: '請至支票管理處理',
      });
    }

    // Supplier concentration risk
    if (Number(topSupplierPct) > 20) {
      risks.push({
        type: 'supplier_concentration',
        severity: 'medium',
        message: `最大供應商佔比 ${topSupplierPct}%，超過 20% 門檻`,
        action: '建議評估替代供應商',
      });
    }

    // Cash shortage forecast
    if (totalCash < 100000) {
      risks.push({
        type: 'cash_shortage',
        severity: totalCash < 50000 ? 'high' : 'medium',
        message: `現金餘額 NT$${totalCash.toLocaleString()} 低於安全水位`,
        action: '建議加速應收帳款回收',
      });
    }

    // Expiring loans
    const sixMonthsLater = new Date();
    sixMonthsLater.setMonth(sixMonthsLater.getMonth() + 6);
    const expiringLoans = await prisma.loanMaster.findMany({
      where: {
        status: 'active',
        endDate: { lte: sixMonthsLater.toISOString().split('T')[0] },
      },
      select: { loanName: true, endDate: true, currentBalance: true },
    });
    if (expiringLoans.length > 0) {
      risks.push({
        type: 'loan_expiring',
        severity: 'medium',
        message: `${expiringLoans.length} 筆貸款將於 6 個月內到期`,
        action: '建議安排續約或償還計畫',
      });
    }

    // Decision recommendations (spec16 v5)
    const recommendations = [];
    if (Number(topSupplierPct) > 20) {
      recommendations.push({
        priority: 1,
        action: '分散供應商風險',
        description: `最大供應商佔比 ${topSupplierPct}%，建議尋找替代供應商`,
        expectedImpact: '降低供應鏈中斷風險',
        timeline: '30天內',
      });
    }
    if (overdueChecks > 0) {
      recommendations.push({
        priority: 1,
        action: '處理逾期支票',
        description: `${overdueChecks} 張支票已過期，需立即處理`,
        expectedImpact: '降低財務風險',
        timeline: '立即',
      });
    }

    return NextResponse.json({
      kpis: {
        monthlySales: salesTotal,
        monthlyPurchases: purchaseTotal,
        totalCash,
        topSupplierConcentration: Number(topSupplierPct),
      },
      riskAlerts: risks.sort((a, b) => {
        const severityOrder = { high: 0, medium: 1, low: 2 };
        return (severityOrder[a.severity] || 2) - (severityOrder[b.severity] || 2);
      }),
      recommendations,
      expiringLoans: expiringLoans.map(l => ({
        ...l,
        currentBalance: Number(l.currentBalance),
      })),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
