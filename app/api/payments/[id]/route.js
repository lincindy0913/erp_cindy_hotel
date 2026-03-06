import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requirePermission, requireAnyPermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

export async function PUT(request, { params }) {
  const auth = await requirePermission(PERMISSIONS.CASHIER_EXECUTE);
  if (!auth.ok) return auth.response;
  
  try {
    const id = parseInt(params.id);
    const data = await request.json();

    const existing = await prisma.payment.findUnique({ where: { id } });
    if (!existing) {
      return createErrorResponse('NOT_FOUND', '付款紀錄不存在', 404);
    }

    const updated = await prisma.payment.update({
      where: { id },
      data: {
        status: data.status || existing.status
      }
    });

    return NextResponse.json({
      ...updated,
      amount: Number(updated.amount),
      discount: Number(updated.discount),
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString()
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request, { params }) {
  const auth = await requirePermission(PERMISSIONS.CASHIER_EXECUTE);
  if (!auth.ok) return auth.response;
  
  try {
    const id = parseInt(params.id);

    const existing = await prisma.payment.findUnique({ where: { id } });
    if (!existing) {
      return createErrorResponse('NOT_FOUND', '付款紀錄不存在', 404);
    }

    await prisma.payment.delete({ where: { id } });
    return NextResponse.json({ message: '付款紀錄已刪除' });
  } catch (error) {
    return handleApiError(error);
  }
}
