import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import { applyWarehouseFilter, getAllowedWarehouse } from '@/lib/warehouse-access';
import { auditFromSession, AUDIT_ACTIONS } from '@/lib/audit';
import { generateMonthEndReports } from '@/lib/generate-month-end-reports';
import { runMonthEndPreChecks } from '@/lib/month-end/preChecks';

export const dynamic = 'force-dynamic';

// GET: List month-end statuses for a given year
export async function GET(request) {
  const auth = await requirePermission(PERMISSIONS.MONTHEND_VIEW);
  if (!auth.ok) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const year = parseInt(searchParams.get('year'));

    if (!year) {
      return createErrorResponse('REQUIRED_FIELD_MISSING', '請提供年份', 400);
    }

    // Warehouse-level access control
    const meWhere = { year };
    const wf = applyWarehouseFilter(auth.session, meWhere);
    if (!wf.ok) return wf.response;

    // Get all month-end statuses for the year
    const statuses = await prisma.monthEndStatus.findMany({
      where: meWhere,
      include: {
        reports: {
          select: { id: true, reportType: true, generatedAt: true }
        }
      },
      orderBy: { month: 'desc' }
    });

    // Build a map of existing statuses
    const statusMap = {};
    statuses.forEach(s => {
      const key = `${s.month}-${s.warehouse || 'all'}`;
      statusMap[key] = {
        id: s.id,
        year: s.year,
        month: s.month,
        warehouse: s.warehouse,
        status: s.status,
        closedBy: s.closedBy,
        closedAt: s.closedAt ? s.closedAt.toISOString() : null,
        lockedAt: s.lockedAt ? s.lockedAt.toISOString() : null,
        unlockedBy: s.unlockedBy,
        unlockedAt: s.unlockedAt ? s.unlockedAt.toISOString() : null,
        unlockReason: s.unlockReason,
        note: s.note,
        reportCount: s.reports.length,
        reports: s.reports.map(r => ({
          id: r.id,
          reportType: r.reportType,
          generatedAt: r.generatedAt.toISOString()
        }))
      };
    });

    // Get date range for the entire year
    const yearStart = `${year}-01-01`;
    const yearEnd = `${year}-12-31`;

    // Derive warehouse restriction once for all subsequent queries
    const allowedWarehouse = getAllowedWarehouse(auth.session);
    const whClause = allowedWarehouse ? Prisma.sql`AND warehouse = ${allowedWarehouse}` : Prisma.empty;

    // DB-level GROUP BY month：避免載入整年資料再用 JS 拆月
    const [purchaseGroups, salesGroups, expenseGroups, commonExpenseGroups] = await Promise.all([
      prisma.$queryRaw`
        SELECT LEFT(purchase_date, 7) AS month,
               COUNT(*)::int          AS count,
               COALESCE(SUM(total_amount), 0)::numeric AS total
        FROM purchase_masters
        WHERE purchase_date >= ${yearStart} AND purchase_date <= ${yearEnd}
        ${whClause}
        GROUP BY LEFT(purchase_date, 7)
      `,
      prisma.$queryRaw`
        SELECT LEFT(invoice_date, 7) AS month,
               COUNT(*)::int          AS count,
               COALESCE(SUM(total_amount), 0)::numeric AS total
        FROM sales_masters
        WHERE invoice_date >= ${yearStart} AND invoice_date <= ${yearEnd}
        GROUP BY LEFT(invoice_date, 7)
      `,
      prisma.$queryRaw`
        SELECT LEFT(invoice_date, 7) AS month,
               COALESCE(SUM(amount), 0)::numeric AS total
        FROM expenses
        WHERE invoice_date >= ${yearStart} AND invoice_date <= ${yearEnd}
        ${whClause}
        GROUP BY LEFT(invoice_date, 7)
      `,
      prisma.$queryRaw`
        SELECT expense_month AS month,
               COALESCE(SUM(total_debit), 0)::numeric AS total
        FROM common_expense_records
        WHERE expense_month >= ${`${year}-01`} AND expense_month <= ${`${year}-12`}
          AND status = ${'已確認'}
        ${whClause}
        GROUP BY expense_month
      `,
    ]);

    const purchaseByMonth  = new Map(purchaseGroups.map(r => [r.month, r]));
    const salesByMonth     = new Map(salesGroups.map(r => [r.month, r]));
    const expenseByMonth   = new Map(expenseGroups.map(r => [r.month, r]));
    const commonExpByMonth = new Map(commonExpenseGroups.map(r => [r.month, r]));

    // 直接從 Map lookup，不再逐月 filter
    const months = [];
    for (let m = 1; m <= 12; m++) {
      const monthStr = String(m).padStart(2, '0');
      const key = `${year}-${monthStr}`;

      const purchData  = purchaseByMonth.get(key);
      const salesData  = salesByMonth.get(key);
      const expData    = expenseByMonth.get(key);
      const commonData = commonExpByMonth.get(key);

      const purchaseTotal      = Number(purchData?.total  ?? 0);
      const purchaseCount      = Number(purchData?.count  ?? 0);
      const salesTotal         = Number(salesData?.total  ?? 0);
      const salesCount         = Number(salesData?.count  ?? 0);
      const legacyExpenseTotal = Number(expData?.total    ?? 0);
      const commonExpenseTotal = Number(commonData?.total ?? 0);
      const expenseTotal       = legacyExpenseTotal + commonExpenseTotal;

      const statusKey  = `${m}-all`;
      const statusInfo = statusMap[statusKey] || null;

      months.push({
        month: m,
        status:      statusInfo ? statusInfo.status      : '未結帳',
        statusId:    statusInfo ? statusInfo.id          : null,
        closedAt:    statusInfo ? statusInfo.closedAt    : null,
        closedBy:    statusInfo ? statusInfo.closedBy    : null,
        lockedAt:    statusInfo ? statusInfo.lockedAt    : null,
        reportCount: statusInfo ? statusInfo.reportCount : 0,
        reports:     statusInfo ? statusInfo.reports     : [],
        purchaseCount: Number(purchaseCount),
        purchaseTotal: Math.round(purchaseTotal),
        salesCount:    Number(salesCount),
        salesTotal:    Math.round(salesTotal),
        expenseTotal:  Math.round(expenseTotal),
      });
    }

    return NextResponse.json({ year, months });
  } catch (error) {
    return handleApiError(error);
  }
}

// POST: Start month-end closing process
export async function POST(request) {
  const auth = await requirePermission(PERMISSIONS.MONTHEND_EXECUTE);
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();
    const { year, month, warehouse } = body;

    if (!year || !month || month < 1 || month > 12) {
      return createErrorResponse('VALIDATION_FAILED', '請提供有效的年份和月份', 400);
    }

    const monthStr = String(month).padStart(2, '0');
    const periodStart = `${year}-${monthStr}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const periodEnd = `${year}-${monthStr}-${String(lastDay).padStart(2, '0')}`;
    const now = new Date();

    // ==========================================
    // 0. Enforce sequential month-end closing
    // ==========================================
    if (month > 1) {
      const prevUnclosed = await prisma.monthEndStatus.findFirst({
        where: {
          year,
          month: { lt: month },
          warehouse: warehouse || null,
          status: { in: ['已結帳', '已鎖定'] },
        },
        orderBy: { month: 'desc' },
      });
      const lastClosedMonth = prevUnclosed?.month || 0;
      if (lastClosedMonth < month - 1) {
        const missingMonth = lastClosedMonth + 1;
        return createErrorResponse(
          'VALIDATION_FAILED',
          `請先完成 ${year}年${missingMonth}月 的月結，才能執行 ${month}月月結（不可跳月）`,
          400
        );
      }
    } else {
      const prevYearDec = await prisma.monthEndStatus.findFirst({
        where: {
          year: year - 1,
          month: 12,
          warehouse: warehouse || null,
          status: { in: ['已結帳', '已鎖定'] },
        },
      });
      if (!prevYearDec) {
        const prevYearAny = await prisma.monthEndStatus.findFirst({
          where: { year: year - 1, warehouse: warehouse || null, status: { in: ['已結帳', '已鎖定'] } },
        });
        if (prevYearAny) {
          return createErrorResponse(
            'VALIDATION_FAILED',
            `請先完成 ${year - 1}年12月 的月結，才能執行 ${year}年1月月結（不可跳月）`,
            400
          );
        }
      }
    }

    // 1. Run pre-checks
    const preChecks = await runMonthEndPreChecks(prisma, { year, month, monthStr, periodStart, periodEnd, warehouse, now });

    // Block on missing cash count (unless force: true)
    const cashCountCheck = preChecks.find(c => c.name === '現金盤點未完成');
    if (cashCountCheck && !cashCountCheck.passed && body.force !== true) {
      return NextResponse.json(
        { blocked: true, blockedBy: '現金盤點未完成', detail: cashCountCheck.detail, preChecks },
        { status: 422 }
      );
    }

    // ==========================================
    // 2. Generate report snapshots
    // ==========================================
    const reports = await generateMonthEndReports(prisma, { year, month, monthStr, periodStart, periodEnd, warehouse });

    // ==========================================
    // 3. Create MonthEndStatus and Reports in DB
    // ==========================================
    const closedByName = auth.session?.user?.name || auth.session?.user?.email || null;

    const result = await prisma.$transaction(async (tx) => {
      // 冪等檢查：已結帳/已鎖定 → 不可重複結帳（在 transaction 內避免 race condition）
      const existing = await tx.monthEndStatus.findFirst({
        where: {
          year,
          month,
          warehouse: warehouse || null,
          status: { in: ['已結帳', '已鎖定'] }
        }
      });
      if (existing) {
        throw new Error('PERIOD_LOCKED:此月份已結帳或已鎖定，無法重複結帳');
      }

      // Delete existing unclosed status if any
      await tx.monthEndStatus.deleteMany({
        where: {
          year,
          month,
          warehouse: warehouse || null,
          status: '未結帳'
        }
      });

      // Create the month-end status
      const monthEnd = await tx.monthEndStatus.create({
        data: {
          year,
          month,
          warehouse: warehouse || null,
          status: '已結帳',
          closedBy: closedByName,
          closedAt: now,
          note: body.note || null
        }
      });

      // Create report records
      const createdReports = [];
      for (const report of reports) {
        const r = await tx.monthEndReport.create({
          data: {
            monthEndId: monthEnd.id,
            reportType: report.reportType,
            year,
            month,
            warehouse: warehouse || null,
            reportData: report.data
          }
        });
        createdReports.push({
          id: r.id,
          reportType: r.reportType,
          generatedAt: r.generatedAt.toISOString()
        });
      }

      return { monthEnd, createdReports };
    });

    // ==========================================
    // spec13 v9 STEP 9: Auto-generate MonthlyBusinessReport (async, non-blocking)
    // ==========================================
    let reportGenerationFailed = false;
    let reportGenerationError = null;
    const warehouseTag = warehouse ? warehouse.replace(/\s+/g, '_') : 'ALL';
    const reportNo = `RPT-${year}${String(month).padStart(2, '0')}-${warehouseTag}-001`;
    try {
      const purchaseTotal = reports[0]?.data?.totalAmount || 0;
      const salesTotal = reports[1]?.data?.totalAmount || 0;
      const expenseTotal = reports[2]?.data?.totalAmount || 0;
      const grossMargin = salesTotal > 0 ? ((salesTotal - purchaseTotal) / salesTotal * 100).toFixed(1) : 0;

      const profitAnalysis = {
        revenue: Math.round(salesTotal),
        cogs: Math.round(purchaseTotal),
        grossProfit: Math.round(salesTotal - purchaseTotal),
        grossMarginPct: Number(grossMargin),
        operatingExpenses: Math.round(expenseTotal),
        operatingProfit: Math.round(salesTotal - purchaseTotal - expenseTotal),
        diagnosis: grossMargin < 20
          ? '毛利率偏低，建議檢視採購成本或調整售價結構'
          : grossMargin > 50
          ? '毛利率良好，持續維持成本控制'
          : '毛利率正常',
      };

      const cashByType = reports[3]?.data?.byAccountType || [];
      const totalIncome = cashByType.reduce((s, t) => s + (t.income || 0), 0);
      const totalExpCash = cashByType.reduce((s, t) => s + (t.expense || 0), 0);
      const cashFlowAnalysis = {
        operatingInflow: Math.round(totalIncome),
        operatingOutflow: Math.round(totalExpCash),
        netCashFlow: Math.round(totalIncome - totalExpCash),
        diagnosis: (totalIncome - totalExpCash) < 0
          ? '本月淨現金流為負，需關注資金充裕度'
          : '本月淨現金流為正，資金狀況穩健',
      };

      const decisionRecommendations = [];
      if (Number(grossMargin) < 20) {
        decisionRecommendations.push({
          priority: 1,
          action: '檢視採購成本',
          description: `本月毛利率 ${grossMargin}%，低於建議值 20%`,
          expectedImpact: '提升毛利率 5–10%',
          timeline: '下個月',
          owner: 'manager',
        });
      }
      if ((totalIncome - totalExpCash) < 0) {
        decisionRecommendations.push({
          priority: 2,
          action: '加速應收帳款回收',
          description: '本月淨現金流為負，建議追催未收款項',
          expectedImpact: '改善現金流',
          timeline: '兩週內',
          owner: 'finance',
        });
      }

      const executiveSummary = `${year}年${month}月營運摘要：銷貨收入 NT$${Math.round(salesTotal).toLocaleString()}，` +
        `進貨成本 NT$${Math.round(purchaseTotal).toLocaleString()}，毛利率 ${grossMargin}%，` +
        `淨現金流 NT$${Math.round(totalIncome - totalExpCash).toLocaleString()}。`;

      await prisma.monthlyBusinessReport.upsert({
        where: { reportNo },
        create: {
          reportNo,
          reportYear: year,
          reportMonth: month,
          warehouse: warehouse || null,
          status: 'draft',
          profitAnalysis,
          cashFlowAnalysis,
          decisionRecommendations,
          executiveSummary,
          generatedAt: new Date(),
          generatedBy: closedByName || 'system',
        },
        update: {
          profitAnalysis,
          cashFlowAnalysis,
          decisionRecommendations,
          executiveSummary,
          generatedAt: new Date(),
          status: 'draft',
        },
      });
    } catch (reportErr) {
      console.error('月結業務報告生成失敗（非阻斷）:', reportErr.message);
      reportGenerationFailed = true;
      reportGenerationError = reportErr.message;
    }

    await auditFromSession(prisma, auth.session, {
      action: AUDIT_ACTIONS.MONTH_END_CLOSE,
      targetModule: 'month-end',
      targetRecordId: result.monthEnd.id,
      afterState: { year, month, warehouse: warehouse || null, status: '已結帳', reportsCount: result.createdReports.length },
      note: `月結關帳 ${year}/${month}${warehouse ? ` (${warehouse})` : ''}`,
    });

    return NextResponse.json({
      success: true,
      id: result.monthEnd.id,
      year,
      month,
      warehouse: warehouse || null,
      status: '已結帳',
      closedAt: result.monthEnd.closedAt.toISOString(),
      preChecks,
      reports: result.createdReports,
      businessReport: reportNo,
      ...(reportGenerationFailed && { reportGenerationFailed: true, reportGenerationError }),
      summary: {
        purchaseCount: reports[0]?.data.totalCount || 0,
        purchaseTotal: Math.round(reports[0]?.data.totalAmount || 0),
        salesCount: reports[1]?.data.totalCount || 0,
        salesTotal: Math.round(reports[1]?.data.totalAmount || 0),
        expenseTotal: Math.round(reports[2]?.data.totalAmount || 0),
        cashTransactions: reports[3]?.data.totalTransactions || 0
      }
    });
  } catch (error) {
    return handleApiError(error);
  }
}
