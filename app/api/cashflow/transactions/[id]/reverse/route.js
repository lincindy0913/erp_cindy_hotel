import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { auditFromSession, AUDIT_ACTIONS } from '@/lib/audit';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../../auth/[...nextauth]/route';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';

export const dynamic = 'force-dynamic';

// Helper: recalculate account balance from opening + all transactions
async function recalcBalance(tx, accountId) {
  const account = await tx.cashAccount.findUnique({ where: { id: accountId } });
  if (!account) return;

  const transactions = await tx.cashTransaction.findMany({
    where: { accountId },
    select: { type: true, amount: true, fee: true, hasFee: true, linkedTransactionId: true }
  });

  let balance = Number(account.openingBalance);
  for (const t of transactions) {
    const amt = Number(t.amount);
    const fee = t.hasFee ? Number(t.fee) : 0;

    if (t.type === '收入') {
      balance += amt;
    } else if (t.type === '支出') {
      balance -= amt;
      balance -= fee;
    } else if (t.type === '移轉') {
      balance -= amt;
      balance -= fee;
    } else if (t.type === '移轉入') {
      balance += amt;
    }
  }

  await tx.cashAccount.update({
    where: { id: accountId },
    data: { currentBalance: balance }
  });
}

// Generate transaction number: CF-YYYYMMDD-XXXX
async function generateTransactionNo(date) {
  const dateStr = (date || new Date().toISOString().split('T')[0]).replace(/-/g, '');
  const prefix = `CF-${dateStr}-`;

  const existing = await prisma.cashTransaction.findMany({
    where: { transactionNo: { startsWith: prefix } },
    select: { transactionNo: true }
  });

  let maxSeq = 0;
  for (const t of existing) {
    const seq = parseInt(t.transactionNo.substring(prefix.length)) || 0;
    if (seq > maxSeq) maxSeq = seq;
  }

  return `${prefix}${String(maxSeq + 1).padStart(4, '0')}`;
}

export async function POST(request, { params }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return createErrorResponse('UNAUTHORIZED', '未登入', 401);
    }

    const id = parseInt(params.id);
    const body = await request.json();
    const { reason } = body;

    // Find original transaction
    const original = await prisma.cashTransaction.findUnique({
      where: { id },
      include: {
        account: { select: { id: true, name: true } },
        category: { select: { id: true, name: true } }
      }
    });

    if (!original) {
      return createErrorResponse('NOT_FOUND', '交易不存在', 404);
    }

    // Cannot reverse an already reversed transaction
    if (original.reversedById) {
      return createErrorResponse('TRANSACTION_CONFIRMED_IMMUTABLE', '此交易已被沖銷', 400);
    }

    // Cannot reverse a transaction that is itself a reversal
    if (original.isReversal) {
      return createErrorResponse('TRANSACTION_CONFIRMED_IMMUTABLE', '沖銷交易不可再次沖銷', 400);
    }

    // Determine opposite type
    let reversalType;
    if (original.type === '收入') {
      reversalType = '支出';
    } else if (original.type === '支出') {
      reversalType = '收入';
    } else {
      return createErrorResponse('VALIDATION_FAILED', '移轉交易不支援沖銷，請刪除後重新建立', 400);
    }

    const result = await prisma.$transaction(async (tx) => {
      // Generate new transaction number
      const txNo = await generateTransactionNo(original.transactionDate);

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
