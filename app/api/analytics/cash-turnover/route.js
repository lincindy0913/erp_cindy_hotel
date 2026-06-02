import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { handleApiError } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import { applyWarehouseFilter } from '@/lib/warehouse-access';

export const dynamic = 'force-dynamic';

function daysBetween(dateA, dateB) {
  return (new Date(dateB + 'T00:00:00Z') - new Date(dateA + 'T00:00:00Z')) / 86400000;
}

function avg(arr) {
  if (!arr.length) return null;
  return Math.round((arr.reduce((s, v) => s + v, 0) / arr.length) * 10) / 10;
}

// GET /api/analytics/cash-turnover
//   ?months=3      (分析區間，預設 3 個月)
//   ?warehouse=    (選填)
export async function GET(request) {
  const auth = await requirePermission(PERMISSIONS.ANALYTICS_VIEW);
  if (!auth.ok) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const months    = Math.min(parseInt(searchParams.get('months') || '3'), 12);
    const warehouse = searchParams.get('warehouse') || null;

    const today     = new Date().toISOString().slice(0, 10);
    const startDate = new Date(Date.now() - months * 30 * 86400000).toISOString().slice(0, 10);

    // ── 1. DSO：租金應收回收天數 ─────────────────────────────────
    // rentalIncome 已收款（actualDate 在區間內）→ actualDate - dueDate
    const rentalConfirmed = await prisma.rentalIncome.findMany({
      where: {
        status: 'confirmed',
        actualDate: { gte: startDate, lte: today },
        dueDate: { not: null },
      },
      select: { dueDate: true, actualDate: true, expectedAmount: true },
    });

    const dsoDelays = rentalConfirmed
      .filter(r => r.actualDate && r.dueDate)
      .map(r => daysBetween(r.dueDate, r.actualDate)); // 正 = 逾期收款

    // ── 2. DPO：付款單實際付款天數 ──────────────────────────────
    // cashierExecution.executionDate - paymentOrder.dueDate
    const execWhere = { executionDate: { gte: startDate, lte: today } };
    if (warehouse) execWhere.paymentOrder = { warehouse };

    const executions = await prisma.cashierExecution.findMany({
      where: execWhere,
      select: {
        executionDate: true,
        actualAmount:  true,
        paymentOrder:  { select: { dueDate: true, createdAt: true } },
      },
    });

    const dpoDelays = executions
      .filter(e => e.paymentOrder?.dueDate)
      .map(e => daysBetween(e.paymentOrder.dueDate, e.executionDate));

    // DPO fallback：若 dueDate 為 null，用 createdAt 到 executionDate
    const dpoFallback = executions
      .filter(e => !e.paymentOrder?.dueDate && e.paymentOrder?.createdAt)
      .map(e => daysBetween(
        e.paymentOrder.createdAt.toISOString().slice(0, 10),
        e.executionDate,
      ));

    const allDpo = [...dpoDelays, ...dpoFallback];

    // ── 3. 現金週轉率 ────────────────────────────────────────────
    // 週轉率 = 區間總收入 / 平均現金餘額
    const txWhere = {
      type: '收入',
      transactionDate: { gte: startDate, lte: today },
      status: { not: 'cc_pending' },
    };
    if (warehouse) txWhere.warehouse = warehouse;
    const wf = applyWarehouseFilter(auth.session, txWhere);
    if (!wf.ok) return wf.response;

    const [revenueAgg, accounts] = await Promise.all([
      prisma.cashTransaction.aggregate({
        where: txWhere,
        _sum: { amount: true },
      }),
      prisma.cashAccount.findMany({
        where: { isActive: true, ...(warehouse ? { warehouse } : {}) },
        select: { currentBalance: true },
      }),
    ]);

    const revenue        = Number(revenueAgg._sum.amount || 0);
    const totalCashBalance = accounts.reduce((s, a) => s + Number(a.currentBalance || 0), 0);
    const cashTurnoverRate = totalCashBalance > 0
      ? Math.round((revenue / totalCashBalance) * 100) / 100
      : null;

    // ── 4. 應收逾期分析（當下未收款）───────────────────────────
    const pendingRental = await prisma.rentalIncome.findMany({
      where: { status: { in: ['pending', 'overdue'] } },
      select: { dueDate: true, expectedAmount: true },
    });

    const aging = { notYetDue: { count: 0, amount: 0 }, overdue1to30: { count: 0, amount: 0 }, overdue31to60: { count: 0, amount: 0 }, overdue60plus: { count: 0, amount: 0 } };
    for (const r of pendingRental) {
      const overdueDays = daysBetween(r.dueDate, today);
      const amt = Number(r.expectedAmount);
      if (overdueDays <= 0)       { aging.notYetDue.count++;    aging.notYetDue.amount    += amt; }
      else if (overdueDays <= 30) { aging.overdue1to30.count++; aging.overdue1to30.amount += amt; }
      else if (overdueDays <= 60) { aging.overdue31to60.count++;aging.overdue31to60.amount+= amt; }
      else                        { aging.overdue60plus.count++;aging.overdue60plus.amount += amt; }
    }
    for (const k of Object.keys(aging)) aging[k].amount = Math.round(aging[k].amount * 100) / 100;

    // ── 5. 應付待付統計 ──────────────────────────────────────────
    const poWhere = { status: { in: ['草稿', '待出納'] } };
    if (warehouse) poWhere.warehouse = warehouse;
    const pendingPos = await prisma.paymentOrder.findMany({
      where: poWhere,
      select: { dueDate: true, netAmount: true },
    });

    let poTotal = 0, poOverdueCount = 0, poOverdueAmt = 0;
    for (const po of pendingPos) {
      const amt = Number(po.netAmount);
      poTotal += amt;
      if (po.dueDate && po.dueDate < today) {
        poOverdueCount++;
        poOverdueAmt += amt;
      }
    }

    return NextResponse.json({
      period:   { from: startDate, to: today, months },
      dso: {
        avgDays:     avg(dsoDelays),
        sampleCount: dsoDelays.length,
        note:        '正值 = 逾期收款天數，負值 = 提前收款',
      },
      dpo: {
        avgDays:     avg(allDpo),
        sampleCount: allDpo.length,
        note:        '正值 = 逾期付款天數，負值 = 提前付款',
      },
      cashTurnoverRate: {
        rate:            cashTurnoverRate,
        revenue:         Math.round(revenue * 100) / 100,
        currentBalance:  Math.round(totalCashBalance * 100) / 100,
        note:            '= 區間總收入 ÷ 目前現金餘額，越高代表現金利用效率越好',
      },
      receivablesAging: aging,
      payablesOutstanding: {
        count:        pendingPos.length,
        totalAmount:  Math.round(poTotal * 100) / 100,
        overdueCount: poOverdueCount,
        overdueAmount:Math.round(poOverdueAmt * 100) / 100,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
