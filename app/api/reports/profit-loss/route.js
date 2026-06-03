import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { handleApiError } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import {
  PL_LEVEL1_ORDER, PL_UNCLASSIFIED_INCOME, PL_UNCLASSIFIED_EXPENSE,
  PL_LEVEL1_INCOME, PL_LEVEL1_EXPENSE, PL_COST_GROUP
} from '@/lib/pl-constants';

export const dynamic = 'force-dynamic';

// 依日期範圍計算 P&L groups + summary
// 來源：cashTransaction（已確認）+ commonExpenseRecord（已確認但尚未出納執行）
// 與 /api/analytics/pnl 邏輯一致，確保三套數字一致。
async function calcPL(startDate, endDate, warehouse) {
  const txWhere = {
    transactionDate: { gte: startDate, lte: endDate },
    isReversal:    false,
    reversedById:  null,
    status:        '已確認',
  };
  if (warehouse) txWhere.warehouse = warehouse;

  // commonExpenseRecord：已確認但尚未出納執行（避免與 cashTransaction 雙計）
  const startYM = startDate.substring(0, 7);
  const endYM   = endDate.substring(0, 7);
  const executedPoIds = (await prisma.paymentOrder.findMany({
    where: { status: '已執行' },
    select: { id: true },
  })).map(po => po.id);
  const ceWhere = { status: '已確認', expenseMonth: { gte: startYM, lte: endYM } };
  if (executedPoIds.length > 0) ceWhere.NOT = { paymentOrderId: { in: executedPoIds } };
  if (warehouse) ceWhere.warehouse = warehouse;

  const [txs, commonExpenses] = await Promise.all([
    prisma.cashTransaction.findMany({
      where: txWhere,
      select: {
        id: true, type: true, amount: true,
        category: { select: { id: true, name: true, level1: true, plGroup: true, plOrder: true } },
      },
    }),
    prisma.commonExpenseRecord.findMany({
      where: ceWhere,
      select: { totalDebit: true },
    }),
  ]);

  const groupMap = {};
  for (const tx of txs) {
    const cat     = tx.category;
    const level1  = cat?.level1  || (tx.type === '收入' ? PL_LEVEL1_INCOME : PL_LEVEL1_EXPENSE);
    const plGroup = cat?.plGroup || (tx.type === '收入' ? PL_UNCLASSIFIED_INCOME : PL_UNCLASSIFIED_EXPENSE);
    const catId   = cat?.id || 0;
    const catName = cat?.name || '(無科目)';
    const plOrder = cat?.plOrder || 999;

    const gKey = `${level1}|${plGroup}`;
    if (!groupMap[gKey]) groupMap[gKey] = { level1, plGroup, plOrder, categories: {} };
    if (!groupMap[gKey].categories[catId])
      groupMap[gKey].categories[catId] = { catId, catName, plOrder, income: 0, expense: 0 };

    const amt = Number(tx.amount);
    if (tx.type === '收入') groupMap[gKey].categories[catId].income  += amt;
    else                     groupMap[gKey].categories[catId].expense += amt;
  }

  const groups = Object.values(groupMap).sort((a, b) => {
    const lo = (PL_LEVEL1_ORDER[a.level1] || 9) - (PL_LEVEL1_ORDER[b.level1] || 9);
    return lo !== 0 ? lo : a.plOrder - b.plOrder;
  }).map(g => {
    const cats        = Object.values(g.categories).sort((a, b) => a.plOrder - b.plOrder);
    const groupIncome  = cats.reduce((s, c) => s + c.income,  0);
    const groupExpense = cats.reduce((s, c) => s + c.expense, 0);
    return { ...g, categories: cats, groupIncome, groupExpense, groupNet: groupIncome - groupExpense };
  });

  const ceExpenseTotal   = commonExpenses.reduce((s, ce) => s + Number(ce.totalDebit), 0);

  const totalIncome      = groups.filter(g => g.level1 === PL_LEVEL1_INCOME).reduce((s, g) => s + g.groupNet, 0);
  const ccFee            = groups.find(g => g.plGroup === PL_COST_GROUP)?.groupExpense ?? 0;
  const grossProfit      = totalIncome - ccFee;
  const totalOpExp       = groups.filter(g => g.level1 === PL_LEVEL1_EXPENSE && g.plGroup !== PL_COST_GROUP).reduce((s, g) => s + g.groupExpense, 0) + ceExpenseTotal;
  const operatingIncome  = grossProfit - totalOpExp;
  const bizOutsideNet    = groups.filter(g => g.level1 === '業外').reduce((s, g) => s + g.groupNet, 0);
  const netIncome        = operatingIncome + bizOutsideNet;

  return {
    groups,
    summary: { totalIncome, ccFee, grossProfit, totalOpExp, ceExpenseTotal, operatingIncome, bizOutsideNet, netIncome },
  };
}

// GET: 損益表（依 CashCategory.plGroup 彙總）
// Query: ?yearMonth=2026-03&warehouse=A館&compareYearMonth=2026-02
export async function GET(request) {
  const auth = await requirePermission(PERMISSIONS.CASHFLOW_VIEW);
  if (!auth.ok) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const yearMonth        = searchParams.get('yearMonth');
    const warehouse        = searchParams.get('warehouse');
    const compareYearMonth = searchParams.get('compareYearMonth');

    if (!yearMonth) {
      return NextResponse.json({ error: { message: 'yearMonth 為必填' } }, { status: 400 });
    }

    const [y, m]    = yearMonth.split('-').map(Number);
    const startDate = `${yearMonth}-01`;
    const endDate   = `${yearMonth}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`;

    // 主期間
    const { groups, summary } = await calcPL(startDate, endDate, warehouse);

    // 對比期間（選填）
    let compareGroups   = null;
    let compareSummary  = null;
    if (compareYearMonth) {
      const [cy, cm]   = compareYearMonth.split('-').map(Number);
      const cStart     = `${compareYearMonth}-01`;
      const cEnd       = `${compareYearMonth}-${String(new Date(cy, cm, 0).getDate()).padStart(2, '0')}`;
      const cResult    = await calcPL(cStart, cEnd, warehouse);
      compareGroups    = cResult.groups;
      compareSummary   = cResult.summary;
    }

    // 本月 CC 對帳單實際手續費
    const ccStmts = await prisma.creditCardStatement.findMany({
      where: {
        billingDate: { gte: startDate, lte: endDate },
        ...(warehouse ? { warehouse } : {}),
      },
      select: { totalFee: true, serviceFee: true, otherFee: true, totalAmount: true },
    });
    const actualCCFee     = ccStmts.reduce((s, r) => s + Number(r.totalFee) + Number(r.serviceFee) + Number(r.otherFee), 0);
    const actualCCRevenue = ccStmts.reduce((s, r) => s + Number(r.totalAmount), 0);

    return NextResponse.json({
      yearMonth,
      warehouse:          warehouse || null,
      startDate,
      endDate,
      groups,
      summary,
      compareYearMonth:   compareYearMonth || null,
      compareGroups,
      compareSummary,
      ccReconciliation: {
        actualCCRevenue,
        actualCCFee,
        statementCount: ccStmts.length,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
