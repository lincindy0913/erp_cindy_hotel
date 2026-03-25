import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import { assertPeriodOpen } from '@/lib/period-lock';

export const dynamic = 'force-dynamic';

export async function PUT(request, { params }) {
  const auth = await requirePermission(PERMISSIONS.CASHIER_EXECUTE);
  if (!auth.ok) return auth.response;

  try {
    const id = parseInt(params.id);
    const data = await request.json();

    const updated = await prisma.$transaction(async (tx) => {
      // Re-read inside transaction for idempotency
      const existing = await tx.payment.findUnique({ where: { id } });
      if (!existing) throw new Error('NOT_FOUND:付款紀錄不存在');

      // Period lock based on payment date
      const lockDate = existing.paymentDate || existing.createdAt?.toISOString?.() || new Date().toISOString();
      await assertPeriodOpen(tx, lockDate);

      // Idempotency: if trying to set same status, return success
      if (data.status && existing.status === data.status) {
        return existing; // already in target state
      }

      // Cannot modify completed/voided payments
      if (existing.status === '已核銷' && data.status !== '已作廢') {
        throw new Error('VALIDATION:已核銷的付款紀錄不可修改');
      }

      return await tx.payment.update({
        where: { id },
        data: { status: data.status || existing.status },
      });
    });

    return NextResponse.json({
      ...updated,
      amount: Number(updated.amount),
      discount: Number(updated.discount),
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    });
  } catch (error) {


    return handleApiError(error, '/api/payments/[id]');
  }
}

export async function DELETE(request, { params }) {
  const auth = await requirePermission(PERMISSIONS.CASHIER_EXECUTE);
  if (!auth.ok) return auth.response;

  try {
    const id = parseInt(params.id);

    await prisma.$transaction(async (tx) => {
      // Re-read inside transaction
      const existing = await tx.payment.findUnique({ where: { id } });
      if (!existing) throw new Error('NOT_FOUND:付款紀錄不存在');

      // Period lock
      const lockDate = existing.paymentDate || existing.createdAt?.toISOString?.() || new Date().toISOString();
      await assertPeriodOpen(tx, lockDate);

      // Cannot delete completed payments
      if (existing.status === '已核銷') {
        throw new Error('VALIDATION:已核銷的付款紀錄不可刪除，請改用作廢');
      }

      await tx.payment.delete({ where: { id } });
    });

    return NextResponse.json({ message: '付款紀錄已刪除' });
  } catch (error) {


    return handleApiError(error, '/api/payments/[id]');
  }
}
