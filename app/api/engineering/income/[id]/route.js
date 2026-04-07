import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import { recalcBalance } from '@/lib/recalc-balance';

export const dynamic = 'force-dynamic';

export async function PUT(request, { params }) {
  const auth = await requirePermission(PERMISSIONS.ENGINEERING_EDIT);
  if (!auth.ok) return auth.response;
  try {
    const { id } = await params;
    const incomeId = parseInt(id);
    const data = await request.json();

    const existing = await prisma.engineeringIncome.findUnique({ where: { id: incomeId } });
    if (!existing) return createErrorResponse('NOT_FOUND', '找不到收款紀錄', 404);

    const amount = parseFloat(data.amount);
    const receivedDate = data.receivedDate;
    const accountId = data.accountId ? parseInt(data.accountId) : null;

    await prisma.$transaction(async (tx) => {
      // Update income record
      await tx.engineeringIncome.update({
        where: { id: incomeId },
        data: {
          termName: data.termName?.trim() || existing.termName,
          amount,
          receivedDate,
          accountId,
          accountingSubject: data.accountingSubject?.trim() || null,
          note: data.note?.trim() || null,
        },
      });

      // Update linked cash transaction if exists
      if (existing.cashTransactionId) {
        await tx.cashTransaction.update({
          where: { id: existing.cashTransactionId },
          data: {
            amount,
            transactionDate: receivedDate,
            accountId: accountId || existing.accountId,
            accountingSubject: data.accountingSubject?.trim() || '41000 工程收入',
            note: data.note?.trim() || null,
          },
        });
        if (accountId && accountId !== existing.accountId) {
          await recalcBalance(tx, existing.accountId);
        }
        if (accountId) await recalcBalance(tx, accountId);
      }
    });

    const result = await prisma.engineeringIncome.findUnique({
      where: { id: incomeId },
      include: {
        project: { select: { id: true, code: true, name: true, clientName: true, clientContractAmount: true, warehouse: true } },
        account: { select: { id: true, name: true, type: true, warehouse: true } },
      },
    });
    return NextResponse.json({ ...result, amount: Number(result.amount) });
  } catch (e) {
    return handleApiError(e);
  }
}

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
