import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import { recalcBalance } from '@/lib/recalc-balance';
import { auditFromSession, AUDIT_ACTIONS } from '@/lib/audit';

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
      include: {
        rentalIncome: {
          include: {
            property: { select: { name: true } },
            payments: { orderBy: { sequenceNo: 'asc' } }
          }
        }
      }
    });
    if (!payment) return createErrorResponse('NOT_FOUND', '找不到付款紀錄', 404);

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
          }
        });
      }
      // Update payment record
      await tx.rentalIncomePayment.update({
        where: { id: paymentId },
        data: { amount, paymentDate, accountId, paymentMethod: paymentMethod || null, matchTransferRef: matchTransferRef || null, matchBankAccountName: matchBankAccountName || null, matchNote: matchNote || null }
      });
      // Update income summary
      await tx.rentalIncome.update({
        where: { id: income.id },
        data: { actualAmount: newTotal, status: newStatus }
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
