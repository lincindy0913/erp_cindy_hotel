import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

// GET /api/cashflow/transactions/transfer-fee-suggestion?fromAccountId=1&toAccountId=2
//
// 查這對帳戶過去 180 天內有手續費的移轉紀錄，
// 回傳出現最多次的金額（眾數）及最近一筆的金額。
// 前端用來預填 hasFee / fee 欄位。
export async function GET(request) {
  const auth = await requirePermission(PERMISSIONS.CASHFLOW_VIEW);
  if (!auth.ok) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const fromId = parseInt(searchParams.get('fromAccountId'));
    const toId   = parseInt(searchParams.get('toAccountId'));

    if (!fromId || !toId || fromId === toId) {
      return createErrorResponse('VALIDATION_FAILED', '需提供不同的來源與目的帳戶', 400);
    }

    const since = new Date();
    since.setDate(since.getDate() - 180);
    const sinceStr = since.toISOString().slice(0, 10);

    const history = await prisma.cashTransaction.findMany({
      where: {
        type: '移轉',
        accountId: fromId,
        transferAccountId: toId,
        hasFee: true,
        transactionDate: { gte: sinceStr },
      },
      select: { fee: true, transactionDate: true },
      orderBy: { transactionDate: 'desc' },
      take: 50,
    });

    if (history.length === 0) {
      return NextResponse.json({ suggestedFee: null, count: 0 });
    }

    // 眾數：出現最多次的金額
    const freq = {};
    for (const tx of history) {
      const f = Number(tx.fee);
      freq[f] = (freq[f] || 0) + 1;
    }
    const modeFee = Number(Object.entries(freq).sort((a, b) => b[1] - a[1])[0][0]);
    const mostRecentFee = Number(history[0].fee);

    return NextResponse.json({
      suggestedFee: modeFee,
      mostRecentFee,
      count: history.length,
      basedOn: history[0].transactionDate,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
