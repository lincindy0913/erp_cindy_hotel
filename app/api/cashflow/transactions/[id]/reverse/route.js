import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { auditFromSession, AUDIT_ACTIONS } from '@/lib/audit';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { recalcBalance } from '@/lib/recalc-balance';
import { assertPeriodOpen } from '@/lib/period-lock';
import { nextCashTransactionNo } from '@/lib/sequence-generator';

export const dynamic = 'force-dynamic';


export async function POST(request, { params }) {
  try {
    const auth = await requirePermission(PERMISSIONS.CASHFLOW_EDIT);
    if (!auth.ok) return auth.response;
    const session = auth.session;

    const id = parseInt(params.id);
    const body = await request.json();
    const { reason } = body;

    const result = await prisma.$transaction(async (tx) => {
      // Find and verify original transaction INSIDE transaction to prevent double-reversal
      const original = await tx.cashTransaction.findUnique({
        where: { id },
        include: {
          account: { select: { id: true, name: true } },
          category: { select: { id: true, name: true } }
        }
      });

      if (!original) throw new Error('NOT_FOUND:交易不存在');
      if (original.reversedById) throw new Error('IDEMPOTENT:此交易已被沖銷');
      if (original.isReversal) throw new Error('VALIDATION:沖銷交易不可再次沖銷');

      // Enforce period lock
      await assertPeriodOpen(tx, original.transactionDate, original.warehouse);

      // Determine opposite type
      let reversalType;
      if (original.type === '收入') {
        reversalType = '支出';
      } else if (original.type === '支出') {
        reversalType = '收入';
      } else {
        throw new Error('VALIDATION:移轉交易不支援沖銷，請刪除後重新建立');
      }

      // Generate new transaction number
      const txNo = await nextCashTransactionNo(tx, original.transactionDate);

      // Create reversal transaction with opposite type
      const reversalTx = await tx.cashTransaction.create({
        data: {
          transactionNo: txNo,
          transactionDate: new Date().toISOString().split('T')[0],
          type: reversalType,
          warehouse: original.warehouse,
          accountId: original.accountId,
          categoryId: original.categoryId,
          supplierId: original.supplierId,
          paymentNo: original.paymentNo,
          amount: original.amount,
          fee: 0,
          hasFee: false,
          accountingSubject: original.accountingSubject,
          paymentTerms: original.paymentTerms,
          description: reason ? `沖銷 ${original.transactionNo}：${reason}` : `沖銷 ${original.transactionNo}`,
          sourceType: 'reversal',
          sourceRecordId: original.id,
          status: '已確認',
          isReversal: true,
          reversalOfId: original.id,
        }
      });

      // Update original transaction: mark as reversed
      await tx.cashTransaction.update({
        where: { id: original.id },
        data: { reversedById: reversalTx.id }
      });

      // Recalculate account balance
      await recalcBalance(tx, original.accountId);

      // Create audit log
      await auditFromSession(tx, session, {
        action: AUDIT_ACTIONS.CASH_TRANSACTION_REVERSE,
        targetModule: 'cashflow',
        targetRecordId: original.id,
        targetRecordNo: original.transactionNo,
        beforeState: {
          id: original.id,
          transactionNo: original.transactionNo,
          type: original.type,
          amount: Number(original.amount),
        },
        afterState: {
          reversalId: reversalTx.id,
          reversalNo: reversalTx.transactionNo,
          reversalType: reversalTx.type,
          amount: Number(reversalTx.amount),
        },
        note: reason || '沖銷交易',
      });

      return reversalTx;
    });

    return NextResponse.json({
      ...result,
      amount: Number(result.amount),
      fee: Number(result.fee),
      createdAt: result.createdAt.toISOString(),
      updatedAt: result.updatedAt.toISOString(),
    });
  } catch (error) {



    return handleApiError(error);
  }
}
