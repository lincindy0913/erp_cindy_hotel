import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { handleApiError } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import { applyWarehouseFilter } from '@/lib/warehouse-access';
import { localDateStr } from '@/lib/localDate';

export const dynamic = 'force-dynamic';

function addDays(dateStr, n) {
  const ms = new Date(dateStr + 'T00:00:00Z').getTime() + n * 86400000;
  return new Date(ms).toISOString().slice(0, 10);
}

function monthsInRange(startDate, endDate) {
  const months = [];
  let [y, m] = startDate.slice(0, 7).split('-').map(Number);
  const [ey, em] = endDate.slice(0, 7).split('-').map(Number);
  while (y < ey || (y === ey && m <= em)) {
    months.push(`${y}-${String(m).padStart(2, '0')}`);
    if (++m > 12) { m = 1; y++; }
  }
  return months;
}

export async function GET(request) {
  const auth = await requirePermission(PERMISSIONS.ANALYTICS_VIEW);
  if (!auth.ok) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const days      = Math.min(parseInt(searchParams.get('days') || '30'), 90);
    const accountId = searchParams.get('accountId') ? parseInt(searchParams.get('accountId')) : null;

    const todayStr  = localDateStr(new Date());
    const endDateStr = addDays(todayStr, days);

    // ── 1. 期初餘額 ──────────────────────────────────────────────
    const acctWhere = { isActive: true };
    if (accountId) {
      acctWhere.id = accountId;
    } else {
      const wf = applyWarehouseFilter(auth.session, acctWhere);
      if (!wf.ok) return wf.response;
    }
    const accounts = await prisma.cashAccount.findMany({
      where: acctWhere,
      select: { id: true, name: true, currentBalance: true },
    });
    const currentBalance = accounts.reduce((s, a) => s + Number(a.currentBalance || 0), 0);

    const items = []; // { date, direction:'in'|'out', amount, source, sourceId, label, isEstimate }

    // ── 2. 付款單（草稿 / 待出納）───────────────────────────────
    const poWhere = {
      status: { in: ['草稿', '待出納'] },
      dueDate: { gte: todayStr, lte: endDateStr },
    };
    if (accountId) poWhere.accountId = accountId;
    else {
      const wf = applyWarehouseFilter(auth.session, poWhere);
      if (!wf.ok) return wf.response;
    }

    const paymentOrders = await prisma.paymentOrder.findMany({
      where: poWhere,
      select: { id: true, dueDate: true, netAmount: true, supplierName: true, summary: true },
    });
    for (const po of paymentOrders) {
      items.push({
        date: po.dueDate,
        direction: 'out',
        amount: Number(po.netAmount),
        source: 'paymentOrder',
        sourceId: po.id,
        label: po.supplierName || po.summary || `付款單 #${po.id}`,
        isEstimate: false,
      });
    }

    // ── 3. 支票應付（payable）────────────────────────────────────
    const chkOutWhere = {
      checkType: 'payable',
      status: { in: ['pending', 'due'] },
      dueDate: { gte: todayStr, lte: endDateStr },
    };
    if (accountId) chkOutWhere.sourceAccountId = accountId;
    else {
      const wf = applyWarehouseFilter(auth.session, chkOutWhere);
      if (!wf.ok) return wf.response;
    }
    const checksOut = await prisma.check.findMany({
      where: chkOutWhere,
      select: { id: true, amount: true, dueDate: true, payeeName: true },
    });
    for (const c of checksOut) {
      items.push({
        date: c.dueDate,
        direction: 'out',
        amount: Number(c.amount),
        source: 'check',
        sourceId: c.id,
        label: `支票 → ${c.payeeName || ''}`,
        isEstimate: false,
      });
    }

    // ── 4. 貸款還款（尚無 PO 者，避免重複計算）──────────────────
    const loanWhere = {
      dueDate: { gte: todayStr, lte: endDateStr },
      status: { notIn: ['已核實', '已預付'] },
      paymentOrderId: null,
    };
    if (accountId) loanWhere.loan = { deductAccountId: accountId };

    const loanRecords = await prisma.loanMonthlyRecord.findMany({
      where: loanWhere,
      select: {
        id: true, dueDate: true, estimatedTotal: true, recordYear: true, recordMonth: true,
        loan: { select: { loanName: true, bankName: true } },
      },
    });
    for (const lr of loanRecords) {
      items.push({
        date: lr.dueDate,
        direction: 'out',
        amount: Number(lr.estimatedTotal || 0),
        source: 'loan',
        sourceId: lr.id,
        label: `${lr.loan.bankName} ${lr.loan.loanName} ${lr.recordYear}/${String(lr.recordMonth).padStart(2, '0')}`,
        isEstimate: true,
      });
    }

    // ── 5. 固定費用範本（該月尚未執行者）────────────────────────
    const upcomingMonths = monthsInRange(todayStr, endDateStr);

    const tmplWhere = { isActive: true, templateType: 'fixed' };
    if (!accountId) {
      const wf = applyWarehouseFilter(auth.session, tmplWhere);
      if (!wf.ok) return wf.response;
    }

    const templates = await prisma.commonExpenseTemplate.findMany({
      where: tmplWhere,
      select: {
        id: true, name: true,
        entryLines: {
          where: { entryType: 'debit' },
          select: { defaultAmount: true, accountId: true },
        },
      },
    });

    // 批次查詢已執行紀錄，避免 N+1
    const executedRecords = await prisma.commonExpenseRecord.findMany({
      where: { expenseMonth: { in: upcomingMonths }, status: { not: '已作廢' } },
      select: { templateId: true, expenseMonth: true },
    });
    const executedSet = new Set(executedRecords.map(r => `${r.templateId}_${r.expenseMonth}`));

    for (const tmpl of templates) {
      if (accountId && !tmpl.entryLines.some(l => l.accountId === accountId)) continue;
      const totalAmt = tmpl.entryLines.reduce((s, l) => s + Number(l.defaultAmount || 0), 0);
      if (totalAmt <= 0) continue;

      for (const month of upcomingMonths) {
        if (executedSet.has(`${tmpl.id}_${month}`)) continue;
        const projDate = `${month}-25`; // 慣例投射到 25 號
        if (projDate < todayStr || projDate > endDateStr) continue;
        items.push({
          date: projDate,
          direction: 'out',
          amount: totalAmt,
          source: 'fixedExpense',
          sourceId: tmpl.id,
          label: `${tmpl.name}（預估）`,
          isEstimate: true,
        });
      }
    }

    // ── 6. 租金收入（pending / overdue）─────────────────────────
    const rentalWhere = {
      status: { in: ['pending', 'overdue'] },
      dueDate: { gte: todayStr, lte: endDateStr },
    };
    if (accountId) rentalWhere.accountId = accountId;

    const rentalIncomes = await prisma.rentalIncome.findMany({
      where: rentalWhere,
      select: { id: true, dueDate: true, expectedAmount: true },
    });
    for (const r of rentalIncomes) {
      items.push({
        date: r.dueDate,
        direction: 'in',
        amount: Number(r.expectedAmount),
        source: 'rentalIncome',
        sourceId: r.id,
        label: '租金收入',
        isEstimate: false,
      });
    }

    // ── 7. 支票應收（receivable）────────────────────────────────
    const chkInWhere = {
      checkType: 'receivable',
      status: { in: ['pending', 'due'] },
      dueDate: { gte: todayStr, lte: endDateStr },
    };
    if (accountId) chkInWhere.destinationAccountId = accountId;
    else {
      const wf = applyWarehouseFilter(auth.session, chkInWhere);
      if (!wf.ok) return wf.response;
    }
    const checksIn = await prisma.check.findMany({
      where: chkInWhere,
      select: { id: true, amount: true, dueDate: true, drawerName: true },
    });
    for (const c of checksIn) {
      items.push({
        date: c.dueDate,
        direction: 'in',
        amount: Number(c.amount),
        source: 'check',
        sourceId: c.id,
        label: `支票收款 ← ${c.drawerName || ''}`,
        isEstimate: false,
      });
    }

    // ── 8. 逐日累計餘額 ─────────────────────────────────────────
    items.sort((a, b) => a.date.localeCompare(b.date));

    const dayMap = {};
    for (let i = 0; i <= days; i++) {
      const d = addDays(todayStr, i);
      dayMap[d] = { date: d, inflow: 0, outflow: 0, runningBalance: 0 };
    }
    for (const item of items) {
      if (!dayMap[item.date]) continue;
      if (item.direction === 'in') dayMap[item.date].inflow  += item.amount;
      else                         dayMap[item.date].outflow += item.amount;
    }
    let running = currentBalance;
    const dailySummary = Object.values(dayMap).sort((a, b) => a.date.localeCompare(b.date));
    for (const day of dailySummary) {
      running = Math.round((running + day.inflow - day.outflow) * 100) / 100;
      day.runningBalance = running;
    }

    // ── 9. 彙總 ─────────────────────────────────────────────────
    const totalInflow  = items.filter(i => i.direction === 'in').reduce((s, i) => s + i.amount, 0);
    const totalOutflow = items.filter(i => i.direction === 'out').reduce((s, i) => s + i.amount, 0);
    const minBalance   = dailySummary.reduce((min, d) => Math.min(min, d.runningBalance), currentBalance);

    let riskLevel = 'low';
    if (minBalance < 0)       riskLevel = 'critical';
    else if (minBalance < 100000) riskLevel = 'high';
    else if (minBalance < 500000) riskLevel = 'medium';

    return NextResponse.json({
      asOf:           todayStr,
      days,
      accountId,
      currentBalance: Math.round(currentBalance * 100) / 100,
      totalInflow:    Math.round(totalInflow  * 100) / 100,
      totalOutflow:   Math.round(totalOutflow * 100) / 100,
      predictedBalance: Math.round((currentBalance + totalInflow - totalOutflow) * 100) / 100,
      minBalance:     Math.round(minBalance * 100) / 100,
      riskLevel,
      forecastItems: items,
      dailySummary,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
