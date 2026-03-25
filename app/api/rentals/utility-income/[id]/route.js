import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import { recalcBalance } from '@/lib/recalc-balance';

export const dynamic = 'force-dynamic';

// DELETE: 刪除水電收入，連動刪除已建立的 CashTransaction
export async function DELETE(request, { params }) {
  const auth = await requirePermission(PERMISSIONS.RENTAL_EDIT);
  if (!auth.ok) return auth.response;

  try {
    const { id } = await params;
    const incomeId = parseInt(id);

    const record = await prisma.rentalUtilityIncome.findUnique({
      where: { id: incomeId }
    });
    if (!record) {
      return createErrorResponse('NOT_FOUND', '找不到水電收入紀錄', 404);
    }

    // Cascade delete linked CashTransaction and recalc balance
    if (record.cashTransactionId) {
      const cashTx = await prisma.cashTransaction.findUnique({
        where: { id: record.cashTransactionId },
        select: { accountId: true }
      });

      await prisma.rentalUtilityIncome.update({
        where: { id: incomeId },
        data: { cashTransactionId: null }
      });

      await prisma.cashTransaction.delete({
        where: { id: record.cashTransactionId }
      });

      if (cashTx) {
        await recalcBalance(prisma, cashTx.accountId);
      }
    }

    await prisma.rentalUtilityIncome.delete({ where: { id: incomeId } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/rentals/utility-income/[id] error:', error.message || error);
    return handleApiError(error);
  }
}
