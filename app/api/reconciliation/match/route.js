import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';

export const dynamic = 'force-dynamic';

// POST: Manual match/unmatch
export async function POST(request) {
  try {
    const data = await request.json();
    const { lineId, transactionId, action } = data;

    if (!lineId || !action) {
      return createErrorResponse('REQUIRED_FIELD_MISSING', 'lineId 和 action 為必填', 400);
    }

    const line = await prisma.bankStatementLine.findUnique({
      where: { id: parseInt(lineId) }
    });

    if (!line) {
      return createErrorResponse('NOT_FOUND', '銀行對帳單明細不存在', 404);
    }

    if (action === 'match') {
      if (!transactionId) {
        return createErrorResponse('REQUIRED_FIELD_MISSING', '配對時需提供交易 ID', 400);
      }

      const transaction = await prisma.cashTransaction.findUnique({
        where: { id: parseInt(transactionId) }
      });

      if (!transaction) {
        return createErrorResponse('NOT_FOUND', '系統交易不存在', 404);
      }

      // Update line
      const updated = await prisma.bankStatementLine.update({
        where: { id: parseInt(lineId) },
        data: {
          matchStatus: 'matched',
          matchedTransactionId: parseInt(transactionId),
          matchedBy: 'manual'
        }
      });

      // Update reconciliation counts if reconciliationId exists
      if (line.reconciliationId) {
        await updateReconciliationCounts(line.reconciliationId, line.accountId);
      }

      return NextResponse.json({
        ...updated,
        debitAmount: Number(updated.debitAmount),
        creditAmount: Number(updated.creditAmount),
        netAmount: Number(updated.netAmount),
        runningBalance: updated.runningBalance ? Number(updated.runningBalance) : null
      });
    }

    if (action === 'unmatch') {
      const updated = await prisma.bankStatementLine.update({
        where: { id: parseInt(lineId) },
        data: {
          matchStatus: 'unprocessed',
          matchedTransactionId: null,
          matchedBy: null
        }
      });

      // Update reconciliation counts
      if (line.reconciliationId) {
        await updateReconciliationCounts(line.reconciliationId, line.accountId);
      }

      return NextResponse.json({
        ...updated,
        debitAmount: Number(updated.debitAmount),
        creditAmount: Number(updated.creditAmount),
        netAmount: Number(updated.netAmount),
        runningBalance: updated.runningBalance ? Number(updated.runningBalance) : null
      });
    }

    return createErrorResponse('VALIDATION_FAILED', '無效的操作，請使用 match 或 unmatch', 400);
  } catch (error) {
    return handleApiError(error);
  }
}

async function updateReconciliationCounts(reconciliationId, accountId) {
  const reconciliation = await prisma.bankReconciliation.findUnique({
    where: { id: reconciliationId }
  });
  if (!reconciliation) return;

  const allLines = await prisma.bankStatementLine.findMany({
    where: { reconciliationId }
  });

  const matchedLines = allLines.filter(l => l.matchStatus === 'matched').length;
  const bankOnlyLines = allLines.filter(l => l.matchStatus === 'unprocessed').length;

  // Count system transactions not matched
  const monthStart = `${reconciliation.statementYear}-${String(reconciliation.statementMonth).padStart(2, '0')}-01`;
  const nextMonth = reconciliation.statementMonth === 12 ? 1 : reconciliation.statementMonth + 1;
  const nextYear = reconciliation.statementMonth === 12 ? reconciliation.statementYear + 1 : reconciliation.statementYear;
  const monthEnd = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;

  const systemTxs = await prisma.cashTransaction.findMany({
    where: {
      accountId,
      transactionDate: { gte: monthStart, lt: monthEnd }
    }
  });

  const matchedTxIds = new Set(allLines.filter(l => l.matchedTransactionId).map(l => l.matchedTransactionId));
  const systemOnlyLines = systemTxs.filter(tx => !matchedTxIds.has(tx.id)).length;

  await prisma.bankReconciliation.update({
    where: { id: reconciliationId },
    data: {
      totalBankLines: allLines.length,
      matchedLines,
      bankOnlyLines,
      systemOnlyLines
    }
  });
}
