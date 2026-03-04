import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';

export const dynamic = 'force-dynamic';

// Helper: recalculate account balance
async function recalcBalance(tx, accountId) {
  const account = await tx.cashAccount.findUnique({ where: { id: accountId } });
  if (!account) return;

  const transactions = await tx.cashTransaction.findMany({
    where: { accountId },
    select: { type: true, amount: true, fee: true, hasFee: true }
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

export async function GET(request, { params }) {
  try {
    const id = parseInt(params.id);

    const transaction = await prisma.cashTransaction.findUnique({
      where: { id },
      include: {
        account: { select: { id: true, name: true, type: true, warehouse: true } },
        category: { select: { id: true, name: true, type: true } },
        transferAccount: { select: { id: true, name: true, type: true, warehouse: true } },
      }
    });

    if (!transaction) {
      return createErrorResponse('NOT_FOUND', '交易不存在', 404);
    }

    // If reversed, fetch the reversal transaction info
    let reversedByInfo = null;
    if (transaction.reversedById) {
      const reversedBy = await prisma.cashTransaction.findUnique({
        where: { id: transaction.reversedById },
        select: { id: true, transactionNo: true, transactionDate: true }
      });
      reversedByInfo = reversedBy;
    }

    // If this is a reversal, fetch the original transaction info
    let reversalOfInfo = null;
    if (transaction.reversalOfId) {
      const reversalOf = await prisma.cashTransaction.findUnique({
        where: { id: transaction.reversalOfId },
        select: { id: true, transactionNo: true, transactionDate: true }
      });
      reversalOfInfo = reversalOf;
    }

    return NextResponse.json({
      ...transaction,
      amount: Number(transaction.amount),
      fee: Number(transaction.fee),
      createdAt: transaction.createdAt.toISOString(),
      updatedAt: transaction.updatedAt.toISOString(),
      isReversal: transaction.isReversal,
      reversedById: transaction.reversedById,
      reversedByInfo,
      reversalOfId: transaction.reversalOfId,
      reversalOfInfo,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(request, { params }) {
  try {
    const id = parseInt(params.id);
    const data = await request.json();

    const existing = await prisma.cashTransaction.findUnique({ where: { id } });
    if (!existing) {
      return createErrorResponse('NOT_FOUND', '交易不存在', 404);
    }

    // 移轉交易不允許單獨編輯
    if (existing.type === '移轉' || existing.type === '移轉入') {
      return createErrorResponse('TRANSACTION_CONFIRMED_IMMUTABLE', '移轉交易無法單獨編輯，請刪除後重新建立', 403);
    }

    // 系統產生的交易不可修改金額或帳戶
    if (existing.sourceType && existing.sourceType !== 'manual') {
      if (data.amount !== undefined || data.accountId !== undefined) {
        return createErrorResponse('TRANSACTION_CONFIRMED_IMMUTABLE', '系統產生的交易不可修改金額或帳戶', 403);
      }
    }

    const updateData = {};
    if (data.transactionDate !== undefined) updateData.transactionDate = data.transactionDate;
    if (data.categoryId !== undefined) updateData.categoryId = data.categoryId ? parseInt(data.categoryId) : null;
    if (data.supplierId !== undefined) updateData.supplierId = data.supplierId ? parseInt(data.supplierId) : null;
    if (data.amount !== undefined) updateData.amount = parseFloat(data.amount);
    if (data.fee !== undefined) updateData.fee = parseFloat(data.fee);
    if (data.hasFee !== undefined) updateData.hasFee = data.hasFee;
    if (data.accountingSubject !== undefined) updateData.accountingSubject = data.accountingSubject || null;
    if (data.paymentTerms !== undefined) updateData.paymentTerms = data.paymentTerms || null;
    if (data.description !== undefined) updateData.description = data.description || null;
    if (data.paymentNo !== undefined) updateData.paymentNo = data.paymentNo || null;

    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.cashTransaction.update({
        where: { id },
        data: updateData
      });

      await recalcBalance(tx, updated.accountId);

      return updated;
    });

    return NextResponse.json({
      ...result,
      amount: Number(result.amount),
      fee: Number(result.fee),
      createdAt: result.createdAt.toISOString(),
      updatedAt: result.updatedAt.toISOString(),
      isReversal: result.isReversal,
      reversedById: result.reversedById,
      reversalOfId: result.reversalOfId,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request, { params }) {
  try {
    const id = parseInt(params.id);

    const existing = await prisma.cashTransaction.findUnique({ where: { id } });
    if (!existing) {
      return createErrorResponse('NOT_FOUND', '交易不存在', 404);
    }

    const result = await prisma.$transaction(async (tx) => {
      const accountIds = new Set([existing.accountId]);

      // If transfer, delete both linked transactions
      if ((existing.type === '移轉' || existing.type === '移轉入') && existing.linkedTransactionId) {
        const linked = await tx.cashTransaction.findUnique({
          where: { id: existing.linkedTransactionId }
        });
        if (linked) {
          accountIds.add(linked.accountId);
          await tx.cashTransaction.delete({ where: { id: linked.id } });
        }
      }

      await tx.cashTransaction.delete({ where: { id } });

      // Recalculate all affected accounts
      for (const accId of accountIds) {
        await recalcBalance(tx, accId);
      }

      return { success: true };
    });

    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}
