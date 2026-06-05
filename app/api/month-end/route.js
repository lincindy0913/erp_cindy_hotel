import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import { applyWarehouseFilter, getAllowedWarehouse } from '@/lib/warehouse-access';
import { auditFromSession, AUDIT_ACTIONS } from '@/lib/audit';
import { localDateStr } from '@/lib/localDate';
import { calcBalanceDelta } from '@/lib/calc-balance-delta';
import { generateMonthEndReports } from '@/lib/generate-month-end-reports';

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
    const whFilter = allowedWarehouse ? { warehouse: allowedWarehouse } : {};

    // Get monthly purchase summaries
    const purchases = await prisma.purchaseMaster.findMany({
      where: {
        purchaseDate: { gte: yearStart, lte: yearEnd },
        ...whFilter,
      },
      select: {
        purchaseDate: true,
        warehouse: true,
        totalAmount: true,
        status: true
      }
    });

    // Get monthly sales summaries (SalesMaster has no warehouse field — not filterable)
    const sales = await prisma.salesMaster.findMany({
      where: {
        invoiceDate: { gte: yearStart, lte: yearEnd }
      },
      select: {
        invoiceDate: true,
        totalAmount: true,
        status: true
      }
    });

    // Get monthly expense summaries (legacy Expense table)
    const expenses = await prisma.expense.findMany({
      where: {
        invoiceDate: { gte: yearStart, lte: yearEnd },
        ...whFilter,
      },
      select: {
        invoiceDate: true,
        warehouse: true,
        amount: true,
        status: true
      }
    });

    // Get CommonExpenseRecord summaries (confirmed only)
    const commonExpenses = await prisma.commonExpenseRecord.findMany({
      where: {
        expenseMonth: { gte: `${year}-01`, lte: `${year}-12` },
        status: '已確認',
        ...whFilter,
      },
      select: {
        expenseMonth: true,
        totalDebit: true,
        warehouse: true
      }
    });

    // Build monthly summary for all 12 months
    const months = [];
    for (let m = 1; m <= 12; m++) {
      const monthStr = String(m).padStart(2, '0');
      const monthStart = `${year}-${monthStr}-01`;
      const lastDay = new Date(year, m, 0).getDate();
      const monthEnd = `${year}-${monthStr}-${String(lastDay).padStart(2, '0')}`;

      const monthPurchases = purchases.filter(p => {
        return p.purchaseDate >= monthStart && p.purchaseDate <= monthEnd;
      });
      const monthSales = sales.filter(s => {
        return s.invoiceDate >= monthStart && s.invoiceDate <= monthEnd;
      });
      const monthExpenses = expenses.filter(e => {
        return e.invoiceDate >= monthStart && e.invoiceDate <= monthEnd;
      });
      const monthCommonExpenses = commonExpenses.filter(e => {
        return e.expenseMonth === `${year}-${monthStr}`;
      });

      const purchaseTotal = monthPurchases.reduce((sum, p) => sum + Number(p.totalAmount), 0);
      const salesTotal = monthSales.reduce((sum, s) => sum + Number(s.totalAmount), 0);
      const legacyExpenseTotal = monthExpenses.reduce((sum, e) => sum + Number(e.amount), 0);
      const commonExpenseTotal = monthCommonExpenses.reduce((sum, e) => sum + Number(e.totalDebit), 0);
      const expenseTotal = legacyExpenseTotal + commonExpenseTotal;

      const key = `${m}-all`;
      const statusInfo = statusMap[key] || null;

      months.push({
        month: m,
        status: statusInfo ? statusInfo.status : '未結帳',
        statusId: statusInfo ? statusInfo.id : null,
        closedAt: statusInfo ? statusInfo.closedAt : null,
        closedBy: statusInfo ? statusInfo.closedBy : null,
        lockedAt: statusInfo ? statusInfo.lockedAt : null,
        reportCount: statusInfo ? statusInfo.reportCount : 0,
        reports: statusInfo ? statusInfo.reports : [],
        purchaseCount: monthPurchases.length,
        purchaseTotal: Math.round(purchaseTotal),
        salesCount: monthSales.length,
        salesTotal: Math.round(salesTotal),
        expenseTotal: Math.round(expenseTotal)
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

    // ==========================================
    // 1. Run pre-checks
    // ==========================================
    const preChecks = [];

    // Check purchases with status='待入庫' older than 30 days
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const thirtyDaysAgoStr = localDateStr(thirtyDaysAgo);

    const pendingPurchaseWhere = {
      status: '待入庫',
      purchaseDate: { lte: thirtyDaysAgoStr }
    };
    if (warehouse) pendingPurchaseWhere.warehouse = warehouse;

    const pendingPurchases = await prisma.purchaseMaster.count({
      where: pendingPurchaseWhere
    });
    preChecks.push({
      name: '逾期待入庫進貨單（超過30天）',
      count: pendingPurchases,
      passed: pendingPurchases === 0,
      level: pendingPurchases > 0 ? 'warning' : 'pass'
    });

    // Check invoices with status='待核銷' older than 60 days
    const sixtyDaysAgo = new Date(now);
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
    const sixtyDaysAgoStr = localDateStr(sixtyDaysAgo);

    const pendingInvoices = await prisma.salesMaster.count({
      where: {
        status: '待核銷',
        invoiceDate: { lte: sixtyDaysAgoStr }
      }
    });
    preChecks.push({
      name: '逾期待核銷發票（超過60天）',
      count: pendingInvoices,
      passed: pendingInvoices === 0,
      level: pendingInvoices > 0 ? 'warning' : 'pass'
    });

    // Check paymentOrder: 待出納（已送出但出納尚未執行）
    const pendingCashierOrders = await prisma.paymentOrder.count({
      where: { status: '待出納' }
    });
    preChecks.push({
      name: '待出納付款單',
      count: pendingCashierOrders,
      passed: pendingCashierOrders === 0,
      level: pendingCashierOrders > 0 ? 'warning' : 'pass',
      link: '/cashier',
      linkText: '前往出納',
    });

    // Check paymentOrder: 草稿（尚未送出出納）
    const draftOrders = await prisma.paymentOrder.count({
      where: { status: '草稿' }
    });
    preChecks.push({
      name: '未送出付款單（草稿）',
      count: draftOrders,
      passed: draftOrders === 0,
      level: draftOrders > 0 ? 'warning' : 'pass',
      link: '/finance',
      linkText: '前往付款',
    });

    // Check cash account balances match transactions
    let cashBalanceMismatch = 0;
    try {
      const cashAccounts = await prisma.cashAccount.findMany({
        where: warehouse ? { warehouse } : {},
        select: { id: true, name: true, openingBalance: true, currentBalance: true }
      });

      for (const account of cashAccounts) {
        const txs = await prisma.cashTransaction.findMany({
          where: { accountId: account.id, status: '已確認' },
          select: { type: true, amount: true, fee: true, hasFee: true },
        });

        const expectedBalance = Number(account.openingBalance) + calcBalanceDelta(txs);
        const currentBalance = Number(account.currentBalance);

        if (Math.abs(expectedBalance - currentBalance) > 0.01) {
          cashBalanceMismatch++;
        }
      }
    } catch (e) {
      // If cash account check fails, just note it
      console.error('現金帳戶檢查錯誤:', e);
    }
    preChecks.push({
      name: '現金帳戶餘額不一致',
      count: cashBalanceMismatch,
      passed: cashBalanceMismatch === 0,
      level: cashBalanceMismatch > 0 ? 'warning' : 'pass'
    });

    // Check cross-warehouse close: when doing a global close (no warehouse), warn if any building-type
    // warehouse is missing a per-warehouse close for this period
    if (!warehouse) {
      try {
        const activeBuildings = await prisma.warehouse.findMany({
          where: { type: 'building', isActive: true },
          select: { name: true },
        });
        if (activeBuildings.length > 0) {
          const closedWarehouseStatuses = await prisma.monthEndStatus.findMany({
            where: {
              year,
              month,
              warehouse: { in: activeBuildings.map(w => w.name) },
              status: { in: ['已結帳', '已鎖定'] },
            },
            select: { warehouse: true },
          });
          const closedWarehouseSet = new Set(closedWarehouseStatuses.map(s => s.warehouse));
          const unclosedBuildings = activeBuildings.filter(w => !closedWarehouseSet.has(w.name));
          if (unclosedBuildings.length > 0) {
            preChecks.push({
              name: '館別未完成個別月結',
              count: unclosedBuildings.length,
              passed: true,
              level: 'warning',
              detail: `以下館別尚未完成個別月結：${unclosedBuildings.map(w => w.name).join('、')}`,
            });
          }
        }
      } catch (e) {
        console.error('跨館別月結驗證錯誤:', e);
      }
    }

    // spec26: Check cash count completion for the last day of the month
    try {
      const lastDayOfMonth = new Date(year, month, 0); // last day of given month
      const lastDayStr = localDateStr(lastDayOfMonth);

      const cashAccountsAll = await prisma.cashAccount.findMany({
        where: {
          type: '現金',
          isActive: true,
          ...(warehouse ? { warehouse } : {}),
        },
        select: { id: true, name: true },
      });

      if (cashAccountsAll.length > 0) {
        const completedCounts = await prisma.cashCount.findMany({
          where: {
            countDate: lastDayStr,
            status: { in: ['confirmed', 'approved'] },
            accountId: { in: cashAccountsAll.map(a => a.id) },
          },
          select: { accountId: true },
        });
        const completedAccountIds = new Set(completedCounts.map(c => c.accountId));
        const missingAccounts = cashAccountsAll.filter(a => !completedAccountIds.has(a.id));

        // Also check for pending abnormal counts (warning only)
        const pendingAbnormal = await prisma.cashCount.count({
          where: {
            countDate: { gte: `${year}-${String(month).padStart(2, '0')}-01`, lte: lastDayStr },
            status: 'pending',
            isAbnormal: true,
          },
        });

        preChecks.push({
          name: '現金盤點未完成',
          count: missingAccounts.length,
          passed: missingAccounts.length === 0,
          level: missingAccounts.length > 0 ? 'warning' : 'pass',
          detail: missingAccounts.length > 0
            ? `以下帳戶尚未完成 ${lastDayStr} 盤點：${missingAccounts.map(a => a.name).join('、')}`
            : undefined,
        });

        if (pendingAbnormal > 0) {
          preChecks.push({
            name: '現金盤點待審核',
            count: pendingAbnormal,
            passed: true, // non-blocking warning
            level: 'warning',
            detail: `${pendingAbnormal} 筆現金盤點待主管審核，建議先完成審核`,
          });
        }
      }
    } catch (e) {
      console.error('現金盤點檢查錯誤:', e);
    }

    // ── 收入端對稱檢查（非阻擋，level='warning'）──────────────────────

    // PMS 月結算未完成
    try {
      const unsettledPms = await prisma.pmsMonthlySettlement.findMany({
        where: { settlementMonth: `${year}-${monthStr}`, status: { not: '已結算' } },
        select: { warehouse: true, status: true },
      });
      if (unsettledPms.length > 0) {
        preChecks.push({
          name: 'PMS 月結算未完成',
          count: unsettledPms.length,
          passed: true,
          level: 'warning',
          detail: `以下館別 PMS 月結算未完成：${unsettledPms.map(s => `${s.warehouse}（${s.status}）`).join('、')}`,
          link: '/pms-income',
          linkText: '前往 PMS 收入',
        });
      }
    } catch (e) {
      console.error('PMS 月結算檢查錯誤:', e);
    }

    // 租屋已確認收款未入帳
    try {
      const unlinkedRental = await prisma.rentalIncome.count({
        where: {
          incomeYear: year,
          incomeMonth: month,
          status: 'confirmed',
          cashTransactionId: null,
        },
      });
      if (unlinkedRental > 0) {
        preChecks.push({
          name: '租屋已確認收款未入帳',
          count: unlinkedRental,
          passed: true,
          level: 'warning',
          detail: `${unlinkedRental} 筆已確認租金尚未建立現金流記錄，月結損益將有落差`,
          link: '/rentals?tab=income',
          linkText: '前往租屋收款',
        });
      }
    } catch (e) {
      console.error('租屋收款入帳檢查錯誤:', e);
    }

    // 工程估驗已核定未開票
    try {
      const certifiedClaims = await prisma.engineeringProgressClaim.findMany({
        where: {
          status: 'certified',
          certifiedDate: { gte: periodStart, lte: periodEnd },
        },
        include: {
          outputInvoices: { where: { status: { not: '已作廢' } }, select: { id: true } },
        },
      });
      const uninvoiced = certifiedClaims.filter(c => c.outputInvoices.length === 0);
      if (uninvoiced.length > 0) {
        preChecks.push({
          name: '工程估驗已核定未開票',
          count: uninvoiced.length,
          passed: true,
          level: 'warning',
          detail: `${uninvoiced.length} 筆已核定估驗尚未開立銷項發票`,
          link: '/engineering?tab=progressClaims',
          linkText: '前往估驗計價',
        });
      }
    } catch (e) {
      console.error('工程估驗發票檢查錯誤:', e);
    }

    // ==========================================
    // 1c. Block on missing cash count (unless force: true)
    // ==========================================
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
