/**
 * GET /api/year-end/[id]/opening-report
 *
 * 年結後開工報表（純唯讀，不寫入任何資料）
 *
 * 包含：
 *   1. performanceComparison — 本年 vs 去年損益對標
 *   2. agingAnalysis         — 當前應收／應付帳齡分析
 *   3. baseline              — 以本年實績建議的下年度基準目標
 */
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

// ── 帳齡分桶（天數 → 桶標籤）────────────────────────────────────────────────
const AGING_BUCKETS = [
  { label: '0–30 天',   min: 0,   max: 30  },
  { label: '31–60 天',  min: 31,  max: 60  },
  { label: '61–90 天',  min: 61,  max: 90  },
  { label: '91–120 天', min: 91,  max: 120 },
  { label: '120 天以上', min: 121, max: Infinity },
];

function ageBucket(invoiceDateStr, today) {
  const days = Math.floor((today - new Date(invoiceDateStr)) / 86400000);
  const bucket = AGING_BUCKETS.find(b => days >= b.min && days <= b.max);
  return bucket?.label ?? '120 天以上';
}

function emptyBuckets() {
  return Object.fromEntries(AGING_BUCKETS.map(b => [b.label, { count: 0, amount: 0 }]));
}

export async function GET(request, { params }) {
  const auth = await requirePermission(PERMISSIONS.YEAREND_VIEW);
  if (!auth.ok) return auth.response;

  try {
    const id = parseInt((await params).id);
    if (!id) return createErrorResponse('VALIDATION_FAILED', '無效的ID', 400);

    // ── 1. Load current year-end record ─────────────────────────────────
    const yearEnd = await prisma.yearEndRollover.findUnique({
      where: { id },
      include: {
        financialStatements: true,
      },
    });
    if (!yearEnd) return createErrorResponse('NOT_FOUND', '找不到年結記錄', 404);
    if (yearEnd.status !== '已完成') {
      return createErrorResponse('VALIDATION_FAILED', '年結尚未完成，無法產生開工報表', 422);
    }

    const currentYear = yearEnd.year;

    // ── 2. Extract income statements ─────────────────────────────────────
    const currentIS = yearEnd.financialStatements.find(s => s.statementType === '損益表')?.statementData;
    const currentBS = yearEnd.financialStatements.find(s => s.statementType === '資產負債表')?.statementData;

    // Previous year
    const prevYearEnd = await prisma.yearEndRollover.findFirst({
      where: { year: currentYear - 1, status: '已完成' },
      include: { financialStatements: true },
    });
    const prevIS = prevYearEnd?.financialStatements.find(s => s.statementType === '損益表')?.statementData;

    // ── 3. Year-over-year performance comparison ─────────────────────────
    const curr = {
      revenue:    Number(currentIS?.revenue?.totalRevenue  ?? 0),
      cogs:       Number(currentIS?.costOfGoodsSold        ?? 0),
      grossProfit:Number(currentIS?.grossProfit            ?? 0),
      opExpenses: Number(currentIS?.operatingExpenses?.totalExpenses ?? 0),
      netIncome:  Number(currentIS?.netIncome              ?? 0),
    };
    const prev = prevIS ? {
      revenue:    Number(prevIS?.revenue?.totalRevenue  ?? 0),
      cogs:       Number(prevIS?.costOfGoodsSold        ?? 0),
      grossProfit:Number(prevIS?.grossProfit            ?? 0),
      opExpenses: Number(prevIS?.operatingExpenses?.totalExpenses ?? 0),
      netIncome:  Number(prevIS?.netIncome              ?? 0),
    } : null;

    const pct = (cur, pre) => pre && pre !== 0 ? ((cur - pre) / Math.abs(pre) * 100).toFixed(1) : null;

    const performanceComparison = {
      currentYear,
      previousYear: prevYearEnd ? currentYear - 1 : null,
      hasPreviousYear: !!prevYearEnd,
      metrics: [
        { name: '營業收入',   current: curr.revenue,    previous: prev?.revenue,    changePct: pct(curr.revenue,    prev?.revenue) },
        { name: '銷貨成本',   current: curr.cogs,       previous: prev?.cogs,       changePct: pct(curr.cogs,       prev?.cogs) },
        { name: '毛利',       current: curr.grossProfit,previous: prev?.grossProfit,changePct: pct(curr.grossProfit,prev?.grossProfit) },
        { name: '營業費用',   current: curr.opExpenses, previous: prev?.opExpenses, changePct: pct(curr.opExpenses, prev?.opExpenses) },
        { name: '稅前淨利',   current: curr.netIncome,  previous: prev?.netIncome,  changePct: pct(curr.netIncome,  prev?.netIncome) },
      ],
      grossMarginPct: curr.revenue > 0 ? ((curr.grossProfit / curr.revenue) * 100).toFixed(1) : null,
      netMarginPct:   curr.revenue > 0 ? ((curr.netIncome   / curr.revenue) * 100).toFixed(1) : null,
    };

    // ── 4. AR aging (應收帳款：SalesMaster 未核銷) ──────────────────────
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const outstandingAR = await prisma.salesMaster.findMany({
      where: { status: { notIn: ['已核銷', '已作廢'] } },
      select: { invoiceDate: true, totalAmount: true, invoiceNo: true, status: true },
    });

    const arBuckets = emptyBuckets();
    let arTotal = 0;
    for (const r of outstandingAR) {
      const label  = ageBucket(r.invoiceDate, today);
      const amount = Number(r.totalAmount);
      arBuckets[label].count++;
      arBuckets[label].amount += amount;
      arTotal += amount;
    }

    // ── 5. AP aging (應付帳款：Expense 未完成) ──────────────────────────
    const outstandingAP = await prisma.expense.findMany({
      where: { status: { notIn: ['已完成', '已作廢'] } },
      select: { invoiceDate: true, amount: true, invoiceNo: true, status: true },
    });

    const apBuckets = emptyBuckets();
    let apTotal = 0;
    for (const r of outstandingAP) {
      if (!r.invoiceDate) continue;
      const label  = ageBucket(r.invoiceDate, today);
      const amount = Number(r.amount);
      apBuckets[label].count++;
      apBuckets[label].amount += amount;
      apTotal += amount;
    }

    const agingAnalysis = {
      asOf: today.toISOString().split('T')[0],
      receivables: {
        total:   arTotal,
        count:   outstandingAR.length,
        buckets: AGING_BUCKETS.map(b => ({ label: b.label, ...arBuckets[b.label] })),
      },
      payables: {
        total:   apTotal,
        count:   outstandingAP.length,
        buckets: AGING_BUCKETS.map(b => ({ label: b.label, ...apBuckets[b.label] })),
      },
      netWorkingCapital: arTotal - apTotal,
    };

    // ── 6. Baseline targets for new year ─────────────────────────────────
    // Simple heuristic: suggest 10% revenue growth, hold expense growth to 5%
    const REVENUE_GROWTH = 0.10;
    const EXPENSE_GROWTH = 0.05;
    const baseline = {
      targetYear: currentYear + 1,
      basedOnYear: currentYear,
      targets: [
        { name: '目標營收',    amount: Math.round(curr.revenue    * (1 + REVENUE_GROWTH)), basis: `${currentYear} 實績 +10%` },
        { name: '目標毛利',    amount: Math.round(curr.grossProfit* (1 + REVENUE_GROWTH)), basis: `${currentYear} 實績 +10%` },
        { name: '費用上限',    amount: Math.round(curr.opExpenses * (1 + EXPENSE_GROWTH)), basis: `${currentYear} 實績 +5%`  },
        { name: '目標淨利',    amount: Math.round((curr.revenue * (1 + REVENUE_GROWTH)) - curr.cogs - (curr.opExpenses * (1 + EXPENSE_GROWTH))), basis: '推算值' },
      ],
      note: '以上為系統自動推算基準，請依實際營運計畫調整',
    };

    return NextResponse.json({
      yearEndId: id,
      year: currentYear,
      generatedAt: new Date().toISOString(),
      performanceComparison,
      agingAnalysis,
      baseline,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
