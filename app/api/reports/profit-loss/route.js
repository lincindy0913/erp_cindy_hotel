import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { handleApiError } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

// GET: 損益表（依 CashCategory.plGroup 彙總）
// Query: ?yearMonth=2026-03&warehouse=A館  （warehouse 選填）
export async function GET(request) {
  const auth = await requirePermission(PERMISSIONS.CASHFLOW_VIEW);
  if (!auth.ok) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const yearMonth = searchParams.get('yearMonth');
    const warehouse = searchParams.get('warehouse');

    if (!yearMonth) {
      return NextResponse.json({ error: { message: 'yearMonth 為必填' } }, { status: 400 });
    }

    const [y, m]    = yearMonth.split('-').map(Number);
    const startDate = `${yearMonth}-01`;
    const endDate   = `${yearMonth}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`;

    const txWhere = {
      transactionDate: { gte: startDate, lte: endDate },
      isReversal: false,
      reversedById: null,
    };
    if (warehouse) txWhere.warehouse = warehouse;

    // 取所有有科目的交易（含科目 P&L 資訊）
    const txs = await prisma.cashTransaction.findMany({
      where: txWhere,
      select: {
        id: true, type: true, amount: true, categoryId: true, warehouse: true,
        transactionDate: true, description: true,
        category: {
          select: { id: true, name: true, type: true, level1: true, plGroup: true, plOrder: true },
        },
      },
    });

    // 取所有 P&L 科目定義（用於保留有科目但本月無交易的行）
    const allCategories = await prisma.cashCategory.findMany({
      where: { isActive: true, level1: { not: null } },
      orderBy: [{ plOrder: 'asc' }, { name: 'asc' }],
    });

    // 按 level1 + plGroup + categoryId 彙總
    const groupMap = {};

    for (const tx of txs) {
      const cat = tx.category;
      const level1  = cat?.level1  || (tx.type === '收入' ? '收入' : '費用');
      const plGroup = cat?.plGroup || (tx.type === '收入' ? '未分類收入' : '未分類費用');
      const catId   = cat?.id || 0;
      const catName = cat?.name || '(無科目)';
      const plOrder = cat?.plOrder || 999;

      const gKey = `${level1}|${plGroup}`;
      if (!groupMap[gKey]) {
        groupMap[gKey] = { level1, plGroup, plOrder, categories: {} };
      }

      if (!groupMap[gKey].categories[catId]) {
        groupMap[gKey].categories[catId] = { catId, catName, plOrder, income: 0, expense: 0, transactions: [] };
      }

      const amt = Number(tx.amount);
      if (tx.type === '收入') groupMap[gKey].categories[catId].income  += amt;
      else                     groupMap[gKey].categories[catId].expense += amt;
    }

    // 排序並計算小計
    const P_L_ORDER = { '收入': 1, '費用': 2, '業外': 3 };
    const groups = Object.values(groupMap).sort((a, b) => {
      const lo = (P_L_ORDER[a.level1] || 9) - (P_L_ORDER[b.level1] || 9);
      return lo !== 0 ? lo : a.plOrder - b.plOrder;
    }).map(g => {
      const cats = Object.values(g.categories).sort((a, b) => a.plOrder - b.plOrder);
      const groupIncome  = cats.reduce((s, c) => s + c.income,  0);
      const groupExpense = cats.reduce((s, c) => s + c.expense, 0);
      const groupNet     = groupIncome - groupExpense;
      return { ...g, categories: cats, groupIncome, groupExpense, groupNet };
    });

    // 計算損益摘要
    const totalIncome  = groups.filter(g => g.level1 === '收入').reduce((s, g) => s + g.groupNet, 0);
    const ccFeeGroup   = groups.find(g => g.plGroup === '收款成本');
    const ccFee        = ccFeeGroup ? ccFeeGroup.groupExpense : 0;
    const grossProfit  = totalIncome - ccFee;
    const opExpGroups  = groups.filter(g => g.level1 === '費用' && g.plGroup !== '收款成本');
    const totalOpExp   = opExpGroups.reduce((s, g) => s + g.groupExpense, 0);
    const operatingIncome = grossProfit - totalOpExp;
    const bizOutsideGroups = groups.filter(g => g.level1 === '業外');
    const bizOutsideNet = bizOutsideGroups.reduce((s, g) => s + g.groupIncome - g.groupExpense, 0);
    const netIncome = operatingIncome + bizOutsideNet;

    // 本月 CC 對帳單實際手續費
    const ccStmts = await prisma.creditCardStatement.findMany({
      where: {
        billingDate: { gte: startDate, lte: endDate },
        ...(warehouse ? { warehouse } : {}),
      },
      select: { totalFee: true, serviceFee: true, otherFee: true, totalAmount: true },
    });
    const actualCCFee = ccStmts.reduce((s, r) => s + Number(r.totalFee) + Number(r.serviceFee) + Number(r.otherFee), 0);
    const actualCCRevenue = ccStmts.reduce((s, r) => s + Number(r.totalAmount), 0);

    return NextResponse.json({
      yearMonth,
      warehouse: warehouse || null,
      startDate,
      endDate,
      groups,
      summary: {
        totalIncome,
        ccFee,
        grossProfit,
        totalOpExp,
        operatingIncome,
        bizOutsideNet,
        netIncome,
      },
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
