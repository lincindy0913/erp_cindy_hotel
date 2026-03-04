import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';

export async function PUT(request, { params }) {
  try {
    const id = parseInt(params.id);
    const data = await request.json();

    const existing = await prisma.expense.findUnique({ where: { id } });
    if (!existing) {
      return createErrorResponse('NOT_FOUND', '支出紀錄不存在', 404);
    }

    const actualPaymentDate = data.actualPaymentDate || existing.actualPaymentDate;
    const actualPaymentAmount = parseFloat(data.actualPaymentAmount || 0);
    const amount = Number(existing.amount);

    let status = '未完成';
    if (actualPaymentAmount > 0 && Math.abs(actualPaymentAmount - amount) < 0.01) {
      status = '已完成';
    }

    const updated = await prisma.expense.update({
      where: { id },
      data: {
        actualPaymentDate,
        actualPaymentAmount,
        status
      }
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
  try {
    const id = parseInt(params.id);

    const existing = await prisma.expense.findUnique({ where: { id } });
    if (!existing) {
      return createErrorResponse('NOT_FOUND', '支出紀錄不存在', 404);
    }

    await prisma.expense.delete({ where: { id } });
    return NextResponse.json({ message: '支出紀錄已刪除' });
  } catch (error) {
    return handleApiError(error);
  }
}
