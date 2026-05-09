import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { handleApiError } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

// POST: 自動配對 — 按日期 + 金額比對存摺明細與系統交易
export async function POST(request, { params }) {
  const auth = await requirePermission(PERMISSIONS.CASHFLOW_VIEW);
  if (!auth.ok) return auth.response;

  try {
    const id   = parseInt(params.id);
    const stmt = await prisma.bankStatement.findUnique({
      where: { id },
      include: { lines: true },
    });
    if (!stmt) return Response.json({ error: { message: '找不到調節表' } }, { status: 404 });

    const [y, m] = stmt.yearMonth.split('-').map(Number);
    const startDate = `${stmt.yearMonth}-01`;
    const endDate   = `${stmt.yearMonth}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`;

    // 取本期系統交易
    const sysTxs = await prisma.cashTransaction.findMany({
      where: { accountId: stmt.accountId, transactionDate: { gte: startDate, lte: endDate } },
      select: { id: true, transactionDate: true, type: true, amount: true },
    });

    // 未配對的存摺明細
    const unmatched = stmt.lines.filter(l => l.matchStatus === '未配對');

    let matched = 0;

    await prisma.$transaction(async (tx) => {
      for (const line of unmatched) {
        const lineAmt = line.creditAmount > 0 ? Number(line.creditAmount) : -Number(line.debitAmount);
        const lineDate = line.txDate;

        // 尋找同日期、同金額（±1元容忍）的系統交易
        const candidate = sysTxs.find(t => {
          const txAmt = t.type === '收入' ? Number(t.amount) : -Number(t.amount);
          return t.transactionDate === lineDate && Math.abs(txAmt - lineAmt) <= 1;
        });

        if (candidate) {
          await tx.bankReconLine.update({
            where: { id: line.id },
            data: { matchedTxId: candidate.id, matchStatus: '已配對' },
          });
          matched++;
        }
      }
    });

    const unmatchedAfter = unmatched.length - matched;
    return NextResponse.json({ success: true, matched, unmatchedAfter });
  } catch (error) {
    return handleApiError(error);
  }
}
