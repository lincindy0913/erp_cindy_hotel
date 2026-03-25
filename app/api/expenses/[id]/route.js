import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requirePermission, requireAnyPermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import { assertWarehouseAccess } from '@/lib/warehouse-access';
import { assertPeriodOpen } from '@/lib/period-lock';

export async function PUT(request, { params }) {
  const auth = await requirePermission(PERMISSIONS.EXPENSE_CREATE);
  if (!auth.ok) return auth.response;
  
  try {
    const id = parseInt(params.id);
    const data = await request.json();

    const existing = await prisma.expense.findUnique({ where: { id } });
    if (!existing) {
      return createErrorResponse('NOT_FOUND', '支出紀錄不存在', 404);
    }

    if (existing.warehouse) {
      const wa = assertWarehouseAccess(auth.session, existing.warehouse);
      if (!wa.ok) return wa.response;
    }

    const updated = await prisma.$transaction(async (tx) => {
      const record = await tx.expense.findUnique({ where: { id } });
      const lockDate = record.actualPaymentDate || record.invoiceDate;
      await assertPeriodOpen(tx, lockDate, record.warehouse);

      const actualPaymentDate = data.actualPaymentDate || record.actualPaymentDate;
      const actualPaymentAmount = parseFloat(data.actualPaymentAmount || 0);
      const amount = Number(record.amount);

      let status = '未完成';
      if (actualPaymentAmount > 0 && Math.abs(actualPaymentAmount - amount) < 0.01) {
        status = '已完成';
      }

      return tx.expense.update({
        where: { id },
        data: {
          actualPaymentDate,
          actualPaymentAmount,
          status
        }
      });
    });

    return NextResponse.json({
      ...updated,
      amount: Number(updated.amount),
      actualPaymentAmount: Number(updated.actualPaymentAmount),
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString()
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request, { params }) {
  const auth = await requirePermission(PERMISSIONS.EXPENSE_CREATE);
  if (!auth.ok) return auth.response;
  
  try {
    const id = parseInt(params.id);

    const existing = await prisma.expense.findUnique({ where: { id } });
    if (!existing) {
      return createErrorResponse('NOT_FOUND', '支出紀錄不存在', 404);
    }

    if (existing.warehouse) {
      const waDel = assertWarehouseAccess(auth.session, existing.warehouse);
      if (!waDel.ok) return waDel.response;
    }

    await prisma.$transaction(async (tx) => {
      const record = await tx.expense.findUnique({ where: { id } });
      const lockDate = record.actualPaymentDate || record.invoiceDate;
      await assertPeriodOpen(tx, lockDate, record.warehouse);

      await tx.expense.delete({ where: { id } });
    });

    return NextResponse.json({ message: '支出紀錄已刪除' });
  } catch (error) {
    return handleApiError(error);
  }
}
