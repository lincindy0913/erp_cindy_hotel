import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import { recalcBalance } from '@/lib/recalc-balance';
import { assertEngineeringProjectOpen } from '@/lib/engineering-lock';

export const dynamic = 'force-dynamic';

export async function PUT(request, { params }) {
  const auth = await requirePermission(PERMISSIONS.ENGINEERING_EDIT);
  if (!auth.ok) return auth.response;
  try {
    const { id } = await params;
    const incomeId = parseInt(id);
    const data = await request.json();

    const existing = await prisma.engineeringIncome.findUnique({
      where: { id: incomeId },
      include: { project: { select: { code: true, name: true } } },
    });
    if (!existing) return createErrorResponse('NOT_FOUND', '找不到收款紀錄', 404);
    await assertEngineeringProjectOpen(existing.projectId);

    const amount      = parseFloat(data.amount);
    const receivedDate = data.receivedDate;
    const accountId   = data.accountId ? parseInt(data.accountId) : null;
    const termName    = data.termName?.trim() || existing.termName;

    await prisma.$transaction(async (tx) => {
      await tx.engineeringIncome.update({
        where: { id: incomeId },
        data: {
          ...(data.progressClaimId !== undefined && { progressClaimId: data.progressClaimId ? parseInt(data.progressClaimId) : null }),
          ...(data.outputInvoiceId !== undefined && { outputInvoiceId: data.outputInvoiceId ? parseInt(data.outputInvoiceId) : null }),
          termName,
          amount,
          receivedDate,
          accountId,
          accountingSubject: data.accountingSubject?.trim() || null,
          note: data.note?.trim() || null,
        },
      });

      if (existing.cashTransactionId) {
        const description = `工程收款 ${existing.project.code} ${existing.project.name} ${termName}`;
        await tx.cashTransaction.update({
          where: { id: existing.cashTransactionId },
          data: {
            amount,
            transactionDate: receivedDate,
            accountId: accountId || existing.accountId,
            accountingSubject: data.accountingSubject?.trim() || '41000 工程收入',
            description,
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
    await assertEngineeringProjectOpen(income.projectId);

    await prisma.$transaction(async (tx) => {
      if (income.cashTransactionId) {
        await tx.cashTransaction.delete({ where: { id: income.cashTransactionId } });
      }
      await tx.engineeringIncome.delete({ where: { id: incomeId } });
    });

    if (income.accountId) await recalcBalance(prisma, income.accountId);
    return NextResponse.json({ success: true });
  } catch (e) {
    return handleApiError(e);
  }
}
