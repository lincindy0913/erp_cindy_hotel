import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import { recalcBalance } from '@/lib/recalc-balance';

export const dynamic = 'force-dynamic';

export async function DELETE(request, { params }) {
  const auth = await requirePermission(PERMISSIONS.ENGINEERING_EDIT);
  if (!auth.ok) return auth.response;
  try {
    const { id } = await params;
    const incomeId = parseInt(id);

    const income = await prisma.engineeringIncome.findUnique({
      where: { id: incomeId },
    });
    if (!income) return createErrorResponse('NOT_FOUND', '找不到收款紀錄', 404);

    // Delete linked cash transaction first
    if (income.cashTransactionId) {
      await prisma.cashTransaction.delete({ where: { id: income.cashTransactionId } });
      if (income.accountId) await recalcBalance(prisma, income.accountId);
    }

    await prisma.engineeringIncome.delete({ where: { id: incomeId } });
    return NextResponse.json({ success: true });
  } catch (e) {
    return handleApiError(e);
  }
}
