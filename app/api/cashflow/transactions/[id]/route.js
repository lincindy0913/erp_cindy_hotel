import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { recalcBalance } from '@/lib/recalc-balance';
import { requirePermission, requireAnyPermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import { assertPeriodOpen } from '@/lib/period-lock';
import { auditFromSession, AUDIT_ACTIONS } from '@/lib/audit';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../auth/[...nextauth]/route';

export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  const auth = await requirePermission(PERMISSIONS.CASHFLOW_VIEW);
  if (!auth.ok) return auth.response;
  
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
  const auth = await requirePermission(PERMISSIONS.CASHFLOW_EDIT);
  if (!auth.ok) return auth.response;
  
  try {
    const id = parseInt(params.id);
    const data = await request.json();

    const existing = await prisma.cashTransaction.findUnique({ where: { id } });
    if (!existing) {
      return createErrorResponse('NOT_FOUND', '交易不存在', 404);
    }

    // 移轉交易：允許修改金額、手續費、備註、日期（同步更新配對交易）
    if (existing.type === '移轉' || existing.type === '移轉入') {
      // Only allow amount, fee, description, date edits for transfers
      const allowedKeys = ['amount', 'fee', 'hasFee', 'description', 'transactionDate'];
      const disallowedKeys = Object.keys(data).filter(k => !allowedKeys.includes(k));
      if (disallowedKeys.length > 0) {
        return createErrorResponse('VALIDATION_FAILED', '移轉交易僅可修改金額、手續費、備註和日期', 403);
      }

      const result = await prisma.$transaction(async (tx) => {
        // Enforce period lock
        await assertPeriodOpen(tx, existing.transactionDate, existing.warehouse);

        const transferUpdateData = {};
        if (data.amount !== undefined) transferUpdateData.amount = parseFloat(data.amount);
        if (data.fee !== undefined) transferUpdateData.fee = parseFloat(data.fee);
        if (data.hasFee !== undefined) transferUpdateData.hasFee = data.hasFee;
        if (data.description !== undefined) transferUpdateData.description = data.description || null;
        if (data.transactionDate !== undefined) transferUpdateData.transactionDate = data.transactionDate;

        // Update this transaction
        const updated = await tx.cashTransaction.update({
          where: { id },
          data: transferUpdateData,
        });

        // Update the linked (paired) transaction
        if (existing.linkedTransactionId) {
          const linkedUpdate = { ...transferUpdateData };
          // The linked transaction should not have fee (fee only on outgoing 移轉)
          if (existing.type === '移轉入') {
            // This is the incoming side; the linked is the outgoing side — keep fee on linked
          } else {
            // This is the outgoing side; the linked is the incoming side — no fee on linked
            delete linkedUpdate.fee;
            delete linkedUpdate.hasFee;
          }
          await tx.cashTransaction.update({
            where: { id: existing.linkedTransactionId },
            data: linkedUpdate,
          });

          // Get linked transaction to know its account
          const linked = await tx.cashTransaction.findUnique({
            where: { id: existing.linkedTransactionId },
            select: { accountId: true },
          });
          if (linked) {
            await recalcBalance(tx, linked.accountId);
          }
        }

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
      // Enforce period lock
      await assertPeriodOpen(tx, existing.transactionDate, existing.warehouse);

      const updated = await tx.cashTransaction.update({
        where: { id },
        data: updateData
      });

      await recalcBalance(tx, updated.accountId);

      return updated;
    });

    // Audit log
    const session = await getServerSession(authOptions);
    if (session) {
      await auditFromSession(prisma, session, {
        action: AUDIT_ACTIONS.CASH_TRANSACTION_UPDATE,
        targetModule: 'cashflow',
        targetRecordId: id,
        targetRecordNo: existing.transactionNo,
        beforeState: { amount: Number(existing.amount), fee: Number(existing.fee) },
        afterState: updateData,
      });
    }

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
    if (error.message?.startsWith('PERIOD_LOCKED:')) {
      return createErrorResponse('PERIOD_LOCKED', error.message.replace('PERIOD_LOCKED:', ''), 423);
    }
    return handleApiError(error);
  }
}

export async function DELETE(request, { params }) {
  const auth = await requirePermission(PERMISSIONS.CASHFLOW_EDIT);
  if (!auth.ok) return auth.response;
  
  try {
    const id = parseInt(params.id);

    const existing = await prisma.cashTransaction.findUnique({ where: { id } });
    if (!existing) {
      return createErrorResponse('NOT_FOUND', '交易不存在', 404);
    }

    const result = await prisma.$transaction(async (tx) => {
      // Enforce period lock
      await assertPeriodOpen(tx, existing.transactionDate, existing.warehouse);

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

    // Audit log
    const session = await getServerSession(authOptions);
    if (session) {
      await auditFromSession(prisma, session, {
        action: AUDIT_ACTIONS.CASH_TRANSACTION_REVERSE,
        targetModule: 'cashflow',
        targetRecordId: id,
        targetRecordNo: existing.transactionNo,
        note: `刪除交易 ${existing.transactionNo}`,
        beforeState: { type: existing.type, amount: Number(existing.amount), accountId: existing.accountId },
      });
    }

    return NextResponse.json(result);
  } catch (error) {
    if (error.message?.startsWith('PERIOD_LOCKED:')) {
      return createErrorResponse('PERIOD_LOCKED', error.message.replace('PERIOD_LOCKED:', ''), 423);
    }
    return handleApiError(error);
  }
}
