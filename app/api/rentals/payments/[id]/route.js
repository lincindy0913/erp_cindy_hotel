import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import { recalcBalance } from '@/lib/recalc-balance';
import { auditFromSession, AUDIT_ACTIONS } from '@/lib/audit';
import { assertRentalYearOpen } from '@/lib/rental-year-lock';
import { nextCashTransactionNo } from '@/lib/sequence-generator';
import { todayStr } from '@/lib/localDate';

export const dynamic = 'force-dynamic';

// PATCH: 編輯單筆分期收款（金額、日期、帳戶、付款方式）
export async function PATCH(request, { params }) {
  const auth = await requirePermission(PERMISSIONS.RENTAL_EDIT);
  if (!auth.ok) return auth.response;

  try {
    const { id } = await params;
    const paymentId = parseInt(id);
    const body = await request.json();

    const payment = await prisma.rentalIncomePayment.findUnique({
      where: { id: paymentId },
      select: {
        id: true, amount: true, paymentDate: true, accountId: true,
        paymentMethod: true, matchTransferRef: true, matchBankAccountName: true,
        matchNote: true, cashTransactionId: true,
        rentalIncome: {
          select: {
            id: true, incomeYear: true, expectedAmount: true, cashTransactionId: true, isLocked: true,
            property: { select: { name: true } },
            payments: {
              orderBy: { sequenceNo: 'asc' },
              select: { id: true, sequenceNo: true, amount: true, cashTransactionId: true }
            }
          }
        }
      }
    });
    if (!payment) return createErrorResponse('NOT_FOUND', '找不到付款紀錄', 404);
    if (payment.rentalIncome.isLocked) {
      return createErrorResponse('LOCKED', '此收租紀錄已鎖帳，無法編輯收款', 423);
    }
    await assertRentalYearOpen(payment.rentalIncome.incomeYear);

    const amount = body.amount != null ? parseFloat(body.amount) : Number(payment.amount);
    const paymentDate = body.paymentDate || payment.paymentDate;
    const accountId = body.accountId != null ? parseInt(body.accountId) : payment.accountId;
    const paymentMethod = body.paymentMethod != null ? body.paymentMethod : payment.paymentMethod;
    const matchTransferRef = body.matchTransferRef != null ? body.matchTransferRef : payment.matchTransferRef;
    const matchBankAccountName = body.matchBankAccountName != null ? body.matchBankAccountName : payment.matchBankAccountName;
    const matchNote = body.matchNote != null ? body.matchNote : payment.matchNote;

    const oldAccountId = payment.accountId;
    const income = payment.rentalIncome;
    const allPayments = income.payments;

    // Recalc total after this edit
    const newTotal = allPayments.reduce((s, p) => {
      const amt = p.id === paymentId ? amount : Number(p.amount);
      return s + amt;
    }, 0);
    const newStatus = newTotal >= Number(income.expectedAmount) ? 'completed' : 'partial';

    await prisma.$transaction(async (tx) => {
      // Update cashTransaction if linked
      if (payment.cashTransactionId) {
        await tx.cashTransaction.update({
          where: { id: payment.cashTransactionId },
          data: {
            transactionDate: paymentDate,
            accountId,
            amount,
            paymentTerms: paymentMethod || null
          },
          select: { id: true },
        });
      }
      // Update payment record
      await tx.rentalIncomePayment.update({
        where: { id: paymentId },
        data: { amount, paymentDate, accountId, paymentMethod: paymentMethod || null, matchTransferRef: matchTransferRef || null, matchBankAccountName: matchBankAccountName || null, matchNote: matchNote || null },
        select: { id: true },
      });
      // Update income summary
      await tx.rentalIncome.update({
        where: { id: income.id },
        data: { actualAmount: newTotal, status: newStatus },
        select: { id: true },
      });
    });

    await recalcBalance(prisma, accountId);
    if (oldAccountId !== accountId) await recalcBalance(prisma, oldAccountId);

    await auditFromSession(prisma, auth.session, {
      action: AUDIT_ACTIONS.RENTAL_INCOME_UPDATE,
      targetModule: 'rentals',
      targetRecordId: income.id,
      beforeState: { paymentId, amount: Number(payment.amount), accountId: payment.accountId },
      afterState: { paymentId, amount, accountId },
      note: `分期收款編輯 #${paymentId} ${income.property?.name}`
    });

    return NextResponse.json({ success: true, status: newStatus, newTotal });
  } catch (error) {
    console.error('PATCH /api/rentals/payments/[id] error:', error.message || error);
    return handleApiError(error);
  }
}

// DELETE: 刪除單筆分期收款，同步更新 RentalIncome 狀態與現金帳本
export async function DELETE(request, { params }) {
  const auth = await requirePermission(PERMISSIONS.RENTAL_EDIT);
  if (!auth.ok) return auth.response;

  try {
    const { id } = await params;
    const paymentId = parseInt(id);

    const payment = await prisma.rentalIncomePayment.findUnique({
      where: { id: paymentId },
      select: {
        id: true, amount: true, cashTransactionId: true, accountId: true,
        rentalIncome: {
          select: {
            id: true, incomeYear: true, expectedAmount: true, isLocked: true,
            property: { select: { name: true } },
            payments: {
              where: { id: { not: paymentId } },
              select: { id: true, amount: true }
            }
          }
        }
      }
    });
    if (!payment) return createErrorResponse('NOT_FOUND', '找不到付款紀錄', 404);
    if (payment.rentalIncome.isLocked) {
      return createErrorResponse('LOCKED', '此收租紀錄已鎖帳，無法刪除收款', 423);
    }
    await assertRentalYearOpen(payment.rentalIncome.incomeYear);

    const income = payment.rentalIncome;
    const newTotal = income.payments.reduce((s, p) => s + Number(p.amount), 0);
    const newStatus = newTotal <= 0 ? 'pending' : newTotal >= Number(income.expectedAmount) ? 'completed' : 'partial';

    await prisma.$transaction(async (tx) => {
      if (payment.cashTransactionId) {
        const bankMatched = await tx.bankStatementLine.count({
          where: { matchedTransactionId: payment.cashTransactionId },
        });

        if (bankMatched > 0) {
          // 已對帳 → 沖銷，保留對帳關聯
          const fresh = await tx.cashTransaction.findUnique({
            where: { id: payment.cashTransactionId },
            select: { id: true, accountId: true, categoryId: true, amount: true,
                      description: true, reversedById: true },
          });
          if (fresh && !fresh.reversedById) {
            const revNo = await nextCashTransactionNo(tx, todayStr());
            const rev = await tx.cashTransaction.create({
              data: {
                transactionNo: revNo,
                transactionDate: todayStr(),
                type: '支出',
                accountId: fresh.accountId,
                categoryId: fresh.categoryId,
                amount: Number(fresh.amount),
                description: `沖銷：${fresh.description || ''}`,
                sourceType: 'reversal',
                sourceRecordId: fresh.id,
                status: '已確認',
                isReversal: true,
                reversalOfId: fresh.id,
              },
              select: { id: true },
            });
            await tx.cashTransaction.update({
              where: { id: fresh.id },
              data: { reversedById: rev.id },
              select: { id: true },
            });
          }
        } else {
          // 未對帳 → 物理刪除
          await tx.cashTransaction.delete({ where: { id: payment.cashTransactionId } });
        }
      }
      await tx.rentalIncomePayment.delete({ where: { id: paymentId } });
      await tx.rentalIncome.update({
        where: { id: income.id },
        data: {
          actualAmount: newTotal,
          status: newStatus,
          ...(newTotal <= 0 ? { actualDate: null } : {}),
        },
        select: { id: true },
      });
    });

    await recalcBalance(prisma, payment.accountId);

    await auditFromSession(prisma, auth.session, {
      action: AUDIT_ACTIONS.RENTAL_INCOME_UPDATE,
      targetModule: 'rentals',
      targetRecordId: income.id,
      beforeState: { paymentId, amount: Number(payment.amount) },
      afterState: { deleted: true },
      note: `刪除分期收款 #${paymentId} ${income.property?.name || ''}`,
    });

    return NextResponse.json({ success: true, newTotal, status: newStatus });
  } catch (error) {
    console.error('DELETE /api/rentals/payments/[id] error:', error.message || error);
    return handleApiError(error);
  }
}
