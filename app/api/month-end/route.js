import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import { applyWarehouseFilter, getAllowedWarehouse } from '@/lib/warehouse-access';
import { auditFromSession, AUDIT_ACTIONS } from '@/lib/audit';

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
      const monthEnd = `${year}-${monthStr}-31`;

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
    const periodEnd = `${year}-${monthStr}-31`;
    const now = new Date();

    // ==========================================
    // 1. Run pre-checks
    // ==========================================
    const preChecks = [];

    // Check purchases with status='待入庫' older than 30 days
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split('T')[0];

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
    const sixtyDaysAgoStr = sixtyDaysAgo.toISOString().split('T')[0];

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

    // Check pending payments
    const pendingPayments = await prisma.payment.count({
      where: {
        status: '未完成'
      }
    });
    preChecks.push({
      name: '未完成付款作業',
      count: pendingPayments,
      passed: pendingPayments === 0,
      level: pendingPayments > 0 ? 'warning' : 'pass'
    });

    // Check cash account balances match transactions
    let cashBalanceMismatch = 0;
    try {
      const cashAccounts = await prisma.cashAccount.findMany({
        where: warehouse ? { warehouse } : {},
        select: { id: true, name: true, openingBalance: true, currentBalance: true }
      });

      for (const account of cashAccounts) {
        const txAgg = await prisma.cashTransaction.aggregate({
          where: { accountId: account.id, status: '已確認' },
          _sum: { amount: true }
        });

        const incomeTxs = await prisma.cashTransaction.aggregate({
          where: { accountId: account.id, status: '已確認', type: '收入' },
          _sum: { amount: true }
        });

        const expenseTxs = await prisma.cashTransaction.aggregate({
          where: { accountId: account.id, status: '已確認', type: '支出' },
          _sum: { amount: true }
        });

        const transferOutTxs = await prisma.cashTransaction.aggregate({
          where: { accountId: account.id, status: '已確認', type: '移轉' },
          _sum: { amount: true }
        });

        const transferInTxs = await prisma.cashTransaction.aggregate({
          where: { transferAccountId: account.id, status: '已確認', type: '移轉' },
          _sum: { amount: true }
        });

        const income = Number(incomeTxs._sum.amount || 0);
        const expense = Number(expenseTxs._sum.amount || 0);
        const transferOut = Number(transferOutTxs._sum.amount || 0);
        const transferIn = Number(transferInTxs._sum.amount || 0);

        const expectedBalance = Number(account.openingBalance) + income - expense - transferOut + transferIn;
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

    // spec26: Check cash count completion for the last day of the month
    try {
      const lastDayOfMonth = new Date(year, month, 0); // last day of given month
      const lastDayStr = lastDayOfMonth.toISOString().split('T')[0];

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

    // ==========================================
    // 2. Generate report snapshots
    // ==========================================
    const reports = [];

    // --- Purchase summary: by supplier, warehouse ---
    const purchaseWhere = {
      purchaseDate: { gte: periodStart, lte: periodEnd }
    };
    if (warehouse) purchaseWhere.warehouse = warehouse;

    const purchaseData = await prisma.purchaseMaster.findMany({
      where: purchaseWhere,
      include: { supplier: { select: { name: true } } }
    });

    const purchaseBySup = {};
    const purchaseByWh = {};
    purchaseData.forEach(p => {
      const supName = p.supplier?.name || '未指定';
      if (!purchaseBySup[supName]) purchaseBySup[supName] = { count: 0, amount: 0, tax: 0, total: 0 };
      purchaseBySup[supName].count++;
      purchaseBySup[supName].amount += Number(p.amount);
      purchaseBySup[supName].tax += Number(p.tax);
      purchaseBySup[supName].total += Number(p.totalAmount);

      const wh = p.warehouse || '未指定';
      if (!purchaseByWh[wh]) purchaseByWh[wh] = { count: 0, amount: 0, tax: 0, total: 0 };
      purchaseByWh[wh].count++;
      purchaseByWh[wh].amount += Number(p.amount);
      purchaseByWh[wh].tax += Number(p.tax);
      purchaseByWh[wh].total += Number(p.totalAmount);
    });

    reports.push({
      reportType: '進貨彙總',
      data: {
        period: `${year}/${monthStr}`,
        totalCount: purchaseData.length,
        totalAmount: purchaseData.reduce((s, p) => s + Number(p.totalAmount), 0),
        bySupplier: Object.entries(purchaseBySup).map(([name, d]) => ({ name, ...d })),
        byWarehouse: Object.entries(purchaseByWh).map(([name, d]) => ({ name, ...d }))
      }
    });

    // --- Sales summary: by invoice, warehouse ---
    const salesData = await prisma.salesMaster.findMany({
      where: {
        invoiceDate: { gte: periodStart, lte: periodEnd }
      },
      include: {
        details: {
          select: { warehouse: true, subtotal: true }
        }
      }
    });

    const salesByStatus = {};
    const salesByWh = {};
    salesData.forEach(s => {
      const st = s.status || '未指定';
      if (!salesByStatus[st]) salesByStatus[st] = { count: 0, total: 0 };
      salesByStatus[st].count++;
      salesByStatus[st].total += Number(s.totalAmount);

      // Aggregate by warehouse from details
      s.details.forEach(d => {
        const wh = d.warehouse || '未指定';
        if (!salesByWh[wh]) salesByWh[wh] = { count: 0, total: 0 };
        salesByWh[wh].count++;
        salesByWh[wh].total += Number(d.subtotal || 0);
      });
    });

    reports.push({
      reportType: '銷貨彙總',
      data: {
        period: `${year}/${monthStr}`,
        totalCount: salesData.length,
        totalAmount: salesData.reduce((s, r) => s + Number(r.totalAmount), 0),
        byStatus: Object.entries(salesByStatus).map(([name, d]) => ({ name, ...d })),
        byWarehouse: Object.entries(salesByWh).map(([name, d]) => ({ name, ...d }))
      }
    });

    // --- Expense summary: by category (sourceType), warehouse ---
    const expenseWhere = {
      invoiceDate: { gte: periodStart, lte: periodEnd }
    };
    if (warehouse) expenseWhere.warehouse = warehouse;

    const expenseData = await prisma.expense.findMany({
      where: expenseWhere
    });

    // Also include CommonExpenseRecord (confirmed)
    const commonExpWhere = {
      expenseMonth: `${year}-${monthStr}`,
      status: '已確認'
    };
    if (warehouse) commonExpWhere.warehouse = warehouse;

    const commonExpData = await prisma.commonExpenseRecord.findMany({
      where: commonExpWhere,
      include: {
        template: { select: { name: true, category: { select: { name: true } } } }
      }
    });

    const expByCat = {};
    const expByWh = {};
    expenseData.forEach(e => {
      const cat = e.sourceType || '未分類';
      if (!expByCat[cat]) expByCat[cat] = { count: 0, total: 0 };
      expByCat[cat].count++;
      expByCat[cat].total += Number(e.amount);

      const wh = e.warehouse || '未指定';
      if (!expByWh[wh]) expByWh[wh] = { count: 0, total: 0 };
      expByWh[wh].count++;
      expByWh[wh].total += Number(e.amount);
    });

    // Merge CommonExpenseRecord into expense summary
    commonExpData.forEach(e => {
      const cat = e.template?.category?.name || e.template?.name || '常見費用';
      if (!expByCat[cat]) expByCat[cat] = { count: 0, total: 0 };
      expByCat[cat].count++;
      expByCat[cat].total += Number(e.totalDebit);

      const wh = e.warehouse || '未指定';
      if (!expByWh[wh]) expByWh[wh] = { count: 0, total: 0 };
      expByWh[wh].count++;
      expByWh[wh].total += Number(e.totalDebit);
    });

    const allExpenseTotal = expenseData.reduce((s, e) => s + Number(e.amount), 0)
      + commonExpData.reduce((s, e) => s + Number(e.totalDebit), 0);

    reports.push({
      reportType: '支出彙總',
      data: {
        period: `${year}/${monthStr}`,
        totalCount: expenseData.length + commonExpData.length,
        totalAmount: allExpenseTotal,
        byCategory: Object.entries(expByCat).map(([name, d]) => ({ name, ...d })),
        byWarehouse: Object.entries(expByWh).map(([name, d]) => ({ name, ...d }))
      }
    });

    // --- Cash flow summary: by account type ---
    const cashTxWhere = {
      transactionDate: { gte: periodStart, lte: periodEnd }
    };
    if (warehouse) cashTxWhere.warehouse = warehouse;

    const cashTxData = await prisma.cashTransaction.findMany({
      where: cashTxWhere,
      include: {
        account: { select: { name: true, type: true } }
      }
    });

    const cashByType = {};
    cashTxData.forEach(tx => {
      const aType = tx.account?.type || '未分類';
      if (!cashByType[aType]) cashByType[aType] = { income: 0, expense: 0, transfer: 0, net: 0 };
      const amt = Number(tx.amount);
      if (tx.type === '收入') {
        cashByType[aType].income += amt;
        cashByType[aType].net += amt;
      } else if (tx.type === '支出') {
        cashByType[aType].expense += amt;
        cashByType[aType].net -= amt;
      } else if (tx.type === '移轉') {
        cashByType[aType].transfer += amt;
      }
    });

    reports.push({
      reportType: '現金流彙總',
      data: {
        period: `${year}/${monthStr}`,
        totalTransactions: cashTxData.length,
        byAccountType: Object.entries(cashByType).map(([name, d]) => ({ name, ...d }))
      }
    });

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
    const reportNo = `RPT-${year}${String(month).padStart(2, '0')}-001`;
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
