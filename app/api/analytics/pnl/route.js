/**
 * GET /api/analytics/pnl
 *
 * 損益彙總：以 CashTransaction + cashCategory.plGroup 為單一來源，
 * 與月結「損益快照」邏輯一致，涵蓋 PMS、租屋、工程、雜項等所有收入。
 *
 * 欄位對應（保持前端相容）：
 *   revenue    = level1='收入' 全部
 *   cogs       = plGroup='收款成本'（信用卡手續費）
 *   allowances = 0（保留欄位，廢棄進貨折讓概念）
 *   expenses   = level1='費用' 且非收款成本
 *   grossProfit / netProfit 依上述計算
 */
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { handleApiError } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import { applyWarehouseFilter } from '@/lib/warehouse-access';
import {
  PL_LEVEL1_INCOME, PL_LEVEL1_EXPENSE, PL_COST_GROUP
} from '@/lib/pl-constants';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const auth = await requirePermission(PERMISSIONS.ANALYTICS_VIEW);
  if (!auth.ok) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('startDate');
    const endDate   = searchParams.get('endDate');
    const warehouse = searchParams.get('warehouse');

    const txWhere = {
      isReversal:    false,
      reversedById:  null,
      status:        '已確認',
    };
    if (startDate || endDate) {
      txWhere.transactionDate = {};
      if (startDate) txWhere.transactionDate.gte = startDate;
      if (endDate)   txWhere.transactionDate.lte = endDate;
    }
    if (warehouse) txWhere.warehouse = warehouse;

    const wf = applyWarehouseFilter(auth.session, txWhere);
    if (!wf.ok) return wf.response;

    const TAKE_LIMIT = 50000;
    const txs = await prisma.cashTransaction.findMany({
      where: txWhere,
      take: TAKE_LIMIT,
      select: {
        transactionDate: true,
        type:            true,
        amount:          true,
        category: { select: { level1: true, plGroup: true, plOrder: true } },
      },
    });
    const truncated = txs.length >= TAKE_LIMIT;

    // ── commonExpenseRecord：已確認但尚未由出納執行付款（避免與 cashTransaction 雙計）
    // CommonExpenseRecord 無 Prisma paymentOrder 關聯，需兩步查詢：
    // 先取出已執行的付款單 ID，再排除那些 commonExpenseRecord。
    const executedPoIds = (await prisma.paymentOrder.findMany({
      where: { status: '已執行' },
      select: { id: true },
    })).map(po => po.id);

    const ceWhereAll = { status: '已確認' };
    if (executedPoIds.length > 0) {
      ceWhereAll.NOT = { paymentOrderId: { in: executedPoIds } };
    }
    if (startDate || endDate) {
      const startYM = startDate ? startDate.substring(0, 7) : undefined;
      const endYM   = endDate   ? endDate.substring(0, 7)   : undefined;
      ceWhereAll.expenseMonth = {};
      if (startYM) ceWhereAll.expenseMonth.gte = startYM;
      if (endYM)   ceWhereAll.expenseMonth.lte = endYM;
    }
    if (warehouse) ceWhereAll.warehouse = warehouse;

    const commonExpenses = await prisma.commonExpenseRecord.findMany({
      where: ceWhereAll,
      select: { expenseMonth: true, totalDebit: true },
    });

    // ── Summary ─────────────────────────────────────────────────────────
    let totalIncome = 0;
    let totalCcFee  = 0;
    let totalOpExp  = 0;
    let bizOutside  = 0;

    // ── Monthly map ──────────────────────────────────────────────────────
    const monthlyMap = {};

    for (const tx of txs) {
      const cat    = tx.category;
      const level1 = cat?.level1  || (tx.type === '收入' ? PL_LEVEL1_INCOME : PL_LEVEL1_EXPENSE);
      const group  = cat?.plGroup || '';
      const amt    = Number(tx.amount);
      const month  = tx.transactionDate?.substring(0, 7);

      if (!monthlyMap[month]) {
        monthlyMap[month] = { month, revenue: 0, cogs: 0, allowances: 0, expenses: 0 };
      }

      if (level1 === PL_LEVEL1_INCOME) {
        if (tx.type === '收入') {
          totalIncome             += amt;
          monthlyMap[month].revenue += amt;
        } else {
          // 收入科目的支出（退款沖銷），從收入扣
          totalIncome             -= amt;
          monthlyMap[month].revenue -= amt;
        }
      } else if (level1 === PL_LEVEL1_EXPENSE) {
        const isCcFee = group === PL_COST_GROUP;
        if (isCcFee) {
          totalCcFee             += amt;
          monthlyMap[month].cogs += amt;
        } else {
          totalOpExp                 += amt;
          monthlyMap[month].expenses += amt;
        }
      } else {
        // 業外
        if (tx.type === '收入') bizOutside += amt;
        else                    bizOutside -= amt;
      }
    }

    // ── Add confirmed-but-unpaid common expenses ─────────────────────────
    for (const ce of commonExpenses) {
      const amt   = Number(ce.totalDebit);
      const month = ce.expenseMonth; // already YYYY-MM
      if (!monthlyMap[month]) {
        monthlyMap[month] = { month, revenue: 0, cogs: 0, allowances: 0, expenses: 0 };
      }
      totalOpExp                 += amt;
      monthlyMap[month].expenses += amt;
    }

    const grossProfit = totalIncome - totalCcFee;
    const netProfit   = grossProfit - totalOpExp + bizOutside;

    // ── Monthly breakdown ────────────────────────────────────────────────
    const monthly = Object.values(monthlyMap)
      .sort((a, b) => a.month.localeCompare(b.month))
      .map(m => ({
        ...m,
        revenue:     Math.round(m.revenue),
        cogs:        Math.round(m.cogs),
        allowances:  0,
        expenses:    Math.round(m.expenses),
        grossProfit: Math.round(m.revenue - m.cogs),
        netProfit:   Math.round(m.revenue - m.cogs - m.expenses),
      }));

    return NextResponse.json({
      dataSource: 'cashTransaction',
      truncated,
      summary: {
        revenue:     Math.round(totalIncome),
        cogs:        Math.round(totalCcFee),
        allowances:  0,
        expenses:    Math.round(totalOpExp),
        grossProfit: Math.round(grossProfit),
        netProfit:   Math.round(netProfit),
        bizOutside:  Math.round(bizOutside),
      },
      monthly,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
