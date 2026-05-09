import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { handleApiError } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

// 依 level1/plGroup 判斷現金流量表分類
function getCfSection(level1, plGroup) {
  const pg = plGroup || '';
  const l1 = level1 || '';

  // 融資活動：貸款、股東往來、融資等
  if (['貸款', '股東', '融資', '長期負債', '借款'].some(k => pg.includes(k) || l1.includes(k))) {
    return '融資活動';
  }
  // 投資活動：固定資產、設備、裝修、投資等
  if (['固定資產', '設備', '裝修', '投資', '房產', '土地'].some(k => pg.includes(k) || l1.includes(k))) {
    return '投資活動';
  }
  return '營業活動';
}

// GET: 現金流量表（依月份）
// Query: ?yearMonth=2026-03&warehouse=A館
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

    // 取本期所有現金流交易（含科目分類）
    const txWhere = {
      transactionDate: { gte: startDate, lte: endDate },
      isReversal: false,
      reversedById: null,
    };
    if (warehouse) txWhere.warehouse = warehouse;

    const txs = await prisma.cashTransaction.findMany({
      where: txWhere,
      select: {
        id: true, type: true, amount: true, transactionDate: true, description: true, sourceType: true,
        category: { select: { level1: true, plGroup: true } },
      },
      orderBy: [{ transactionDate: 'asc' }, { id: 'asc' }],
    });

    // 取期初餘額（各現金帳戶）
    const acctWhere = { isActive: true };
    if (warehouse) acctWhere.warehouse = warehouse;

    const accounts = await prisma.cashAccount.findMany({
      where: acctWhere,
      select: { id: true, name: true, type: true, warehouse: true, currentBalance: true, openingBalance: true },
    });

    // 計算期初現金：currentBalance - 截至目前所有交易淨額 + 本期交易淨額
    // 簡化：直接查詢本期前所有確認交易，得出期初餘額
    const preTxs = await prisma.cashTransaction.groupBy({
      by: ['accountId', 'type'],
      where: {
        transactionDate: { lt: startDate },
        isReversal: false,
        reversedById: null,
        status: { not: '已作廢' },
        ...(warehouse ? { warehouse } : {}),
      },
      _sum: { amount: true },
    });

    // Build opening balance per account
    const preNetByAccount = {};
    for (const row of preTxs) {
      if (!preNetByAccount[row.accountId]) preNetByAccount[row.accountId] = 0;
      const amt = Number(row._sum.amount || 0);
      preNetByAccount[row.accountId] += row.type === '收入' ? amt : (row.type === '支出' ? -amt : 0);
    }

    const openingCash = accounts.reduce((s, a) => {
      const opening = Number(a.openingBalance) + (preNetByAccount[a.id] || 0);
      return s + opening;
    }, 0);

    // 本期交易依現金流分類
    const sections = { '營業活動': [], '投資活動': [], '融資活動': [] };

    for (const tx of txs) {
      const section = getCfSection(tx.category?.level1, tx.category?.plGroup);
      const sign = tx.type === '收入' ? 1 : (tx.type === '支出' ? -1 : 0);
      if (sign === 0) continue; // skip 移轉

      sections[section].push({
        id:              tx.id,
        date:            tx.transactionDate,
        description:     tx.description || tx.sourceType || '—',
        amount:          Number(tx.amount) * sign,
        sourceType:      tx.sourceType,
        level1:          tx.category?.level1,
        plGroup:         tx.category?.plGroup,
      });
    }

    const sectionSummary = {};
    for (const [name, items] of Object.entries(sections)) {
      const net = items.reduce((s, t) => s + t.amount, 0);
      sectionSummary[name] = { items, net, inflow: items.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0), outflow: items.filter(t => t.amount < 0).reduce((s, t) => s + t.amount, 0) };
    }

    const netChange = Object.values(sectionSummary).reduce((s, sec) => s + sec.net, 0);
    const closingCash = openingCash + netChange;

    return NextResponse.json({
      yearMonth,
      warehouse: warehouse || null,
      startDate,
      endDate,
      openingCash: Math.round(openingCash),
      closingCash: Math.round(closingCash),
      netChange:   Math.round(netChange),
      sections: sectionSummary,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
