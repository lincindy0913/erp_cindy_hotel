import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import { nextCashTransactionNo } from '@/lib/sequence-generator';
import { recalcBalance } from '@/lib/recalc-balance';
import { assertPeriodOpen } from '@/lib/period-lock';
import { RECON_LINE_STATUS } from '@/lib/recon-statuses';

export const dynamic = 'force-dynamic';

// POST: 從未配對存摺明細補建一筆現金流交易
// Body: { categoryId?, description? }
export async function POST(request, { params }) {
  const auth = await requirePermission(PERMISSIONS.CASHFLOW_EDIT);
  if (!auth.ok) return auth.response;

  try {
    const stmtId = parseInt((await params).id);
    const lineId = parseInt((await params).lineId);
    const body = await request.json().catch(() => ({}));
    const { categoryId, description: descOverride } = body;

    const line = await prisma.bankReconLine.findFirst({
      where: { id: lineId, bankStatementId: stmtId },
      include: { bankStatement: { include: { account: true } } },
    });
    if (!line) return createErrorResponse('NOT_FOUND', '找不到存摺明細', 404);
    if (line.matchStatus === RECON_LINE_STATUS.MATCHED) {
      return createErrorResponse('VALIDATION_FAILED', '此明細已配對，無法重複補建', 400);
    }

    const stmt    = line.bankStatement;
    const account = stmt.account;
    const credit  = Number(line.creditAmount);
    const debit   = Number(line.debitAmount);

    if (credit <= 0 && debit <= 0) {
      return createErrorResponse('VALIDATION_FAILED', '存摺明細金額為零，無法補建', 400);
    }

    const txType    = credit > 0 ? '收入' : '支出';
    const amount    = credit > 0 ? credit : debit;
    const description = descOverride?.trim() || line.description || `存摺補建 (${line.txDate})`;

    const newTx = await prisma.$transaction(async (tx) => {
      await assertPeriodOpen(tx, line.txDate, account.warehouse);
      const txNo = await nextCashTransactionNo(tx, line.txDate);

      const cashTx = await tx.cashTransaction.create({
        data: {
          transactionNo:   txNo,
          transactionDate: line.txDate,
          type:            txType,
          amount,
          accountId:       stmt.accountId,
          warehouse:       account.warehouse || null,
          categoryId:      categoryId ? parseInt(categoryId) : null,
          description,
          sourceType:      'BankRecon',
          status:          '已確認',
          isReversal:      false,
        },
      });

      await tx.bankReconLine.update({
        where: { id: lineId },
        data: { matchedTxId: cashTx.id, matchStatus: RECON_LINE_STATUS.MATCHED },
      });

      await recalcBalance(tx, stmt.accountId);
      return cashTx;
    });

    return NextResponse.json({
      success:       true,
      transactionId: newTx.id,
      transactionNo: newTx.transactionNo,
      type:          newTx.type,
      amount:        Number(newTx.amount),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
