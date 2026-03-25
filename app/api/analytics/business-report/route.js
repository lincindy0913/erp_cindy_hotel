import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { handleApiError } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

// Helper: compute business metrics for a given year/month
async function computeMetrics(year, month) {
  const monthPrefix = `${year}-${String(month).padStart(2, '0')}`;

  const [purchases, sales, cashAccounts] = await Promise.all([
    prisma.purchaseMaster.findMany({
      where: { purchaseDate: { startsWith: monthPrefix } },
      select: { totalAmount: true, supplierId: true },
    }),
    prisma.salesMaster.findMany({
      where: { invoiceDate: { startsWith: monthPrefix } },
      select: { totalAmount: true },
    }),
    prisma.cashAccount.findMany({
      where: { isActive: true },
      select: { currentBalance: true },
    }),
  ]);

  const totalPurchase = purchases.reduce((s, p) => s + Number(p.totalAmount || 0), 0);
  const totalSales = sales.reduce((s, s2) => s + Number(s2.totalAmount || 0), 0);
  const grossProfit = totalSales - totalPurchase;
  const grossMargin = totalSales > 0 ? Number(((grossProfit / totalSales) * 100).toFixed(1)) : 0;
  const totalCash = cashAccounts.reduce((s, a) => s + Number(a.currentBalance || 0), 0);

  // Supplier concentration
  const supplierTotals = {};
  purchases.forEach(p => {
    if (p.supplierId) {
      supplierTotals[p.supplierId] = (supplierTotals[p.supplierId] || 0) + Number(p.totalAmount || 0);
    }
  });
  const sortedSuppliers = Object.entries(supplierTotals).sort((a, b) => b[1] - a[1]);
  const topSupplierPct = totalPurchase > 0 && sortedSuppliers.length > 0
    ? Number(((sortedSuppliers[0][1] / totalPurchase) * 100).toFixed(1))
    : 0;
  const top3Pct = totalPurchase > 0
    ? Number((sortedSuppliers.slice(0, 3).reduce((s, [, v]) => s + v, 0) / totalPurchase * 100).toFixed(1))
    : 0;

  const TARGET_GROSS_MARGIN = 36;

  const profitAnalysis = {
    totalSales,
    totalPurchase,
    grossProfit,
    grossMargin,
    targetGrossMargin: TARGET_GROSS_MARGIN,
    achievement: TARGET_GROSS_MARGIN > 0 ? Number(((grossMargin / TARGET_GROSS_MARGIN) * 100).toFixed(1)) : 0,
    status: grossMargin >= TARGET_GROSS_MARGIN ? 'achieved' : 'below_target',
  };

  const riskAnalysis = {
    supplierConcentration: {
      top1Percentage: topSupplierPct,
      top3Percentage: top3Pct,
      supplierCount: sortedSuppliers.length,
      riskLevel: topSupplierPct > 20 ? 'high' : topSupplierPct > 15 ? 'medium' : 'low',
    },
    cashShortage: {
      currentCash: totalCash,
      riskLevel: totalCash < 50000 ? 'critical' : totalCash < 100000 ? 'high' : 'low',
    },
  };

  const cashFlowAnalysis = {
    currentBalance: totalCash,
    monthlyInflow: totalSales,
    monthlyOutflow: totalPurchase,
    netCashFlow: totalSales - totalPurchase,
  };

  const recommendations = [];
  if (topSupplierPct > 20) {
    recommendations.push({
      priority: 1,
      action: '分散廠商採購',
      description: `最大廠商採購佔比 ${topSupplierPct}%，超過 20% 門檻，建議評估替代廠商`,
      expectedImpact: '降低供應鏈中斷風險',
      timeline: '30天內',
    });
  }
  if (grossMargin < TARGET_GROSS_MARGIN) {
    recommendations.push({
      priority: 2,
      action: '提升銷售毛利率',
      description: `當前毛利率 ${grossMargin}%，未達目標 ${TARGET_GROSS_MARGIN}%，差距 ${(TARGET_GROSS_MARGIN - grossMargin).toFixed(1)}%`,
      expectedImpact: '增加利潤收益',
      timeline: '本月',
    });
  }
  if (totalCash < 100000) {
    recommendations.push({
      priority: recommendations.length + 1,
      action: '加強資金管理',
      description: `現金餘額 NT$${totalCash.toLocaleString()} 偏低，建議加速應收款回收`,
      expectedImpact: '改善流動性',
      timeline: '本週',
    });
  }

  const statusLabel = grossMargin >= TARGET_GROSS_MARGIN ? '達成目標' : '未達目標';
  const executiveSummary = `${year}年${month}月經營摘要：本月銷貨額 NT$${totalSales.toLocaleString()}，採購額 NT$${totalPurchase.toLocaleString()}，毛利率 ${grossMargin}%（目標 ${TARGET_GROSS_MARGIN}%，${statusLabel}）。現金餘額 NT$${totalCash.toLocaleString()}。廠商集中度：最大廠商佔比 ${topSupplierPct}%。${recommendations.length > 0 ? `優先行動：${recommendations.map(r => r.action).join('、')}。` : '各項指標正常。'}`;

  return { profitAnalysis, riskAnalysis, cashFlowAnalysis, recommendations, executiveSummary };
}

// GET /api/analytics/business-report?month=YYYYMM
export async function GET(request) {
  const auth = await requirePermission(PERMISSIONS.ANALYTICS_VIEW);
  if (!auth.ok) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const monthStr = searchParams.get('month');

    let year, month;
    if (monthStr && monthStr.length === 6) {
      year = parseInt(monthStr.substring(0, 4));
      month = parseInt(monthStr.substring(4, 6));
    } else {
      const now = new Date();
      year = now.getFullYear();
      month = now.getMonth() + 1;
    }

    // Try to find existing persisted report
    const report = await prisma.monthlyBusinessReport.findFirst({
      where: { reportYear: year, reportMonth: month },
    });

    if (report) {
      return NextResponse.json({ report, generated: null });
    }

    // Generate live preview from current data
    const metrics = await computeMetrics(year, month);

    return NextResponse.json({
      report: null,
      generated: {
        reportYear: year,
        reportMonth: month,
        status: 'preview',
        ...metrics,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

// PATCH /api/analytics/business-report?month=YYYYMM — approve report
export async function PATCH(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const monthStr = searchParams.get('month');
    if (!monthStr || monthStr.length !== 6) {
      return NextResponse.json({ error: 'month 參數必填（格式 YYYYMM）' }, { status: 400 });
    }

    const year = parseInt(monthStr.substring(0, 4));
    const month = parseInt(monthStr.substring(4, 6));

    const report = await prisma.monthlyBusinessReport.findFirst({
      where: { reportYear: year, reportMonth: month },
    });

    if (!report) {
      return NextResponse.json({ error: '報告不存在，請先完成月結以生成報告' }, { status: 404 });
    }

    const updated = await prisma.monthlyBusinessReport.update({
      where: { id: report.id },
      data: {
        status: 'approved',
        approvedBy: session.user.name || session.user.email,
        approvedAt: new Date(),
      },
    });

    return NextResponse.json({ report: updated });
  } catch (error) {
    return handleApiError(error);
  }
}
