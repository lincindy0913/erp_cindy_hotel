import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';

export async function PUT(request, { params }) {
  try {
    const id = parseInt(params.id);
    const data = await request.json();

    const existing = await prisma.cashAccount.findUnique({ where: { id } });
    if (!existing) {
      return createErrorResponse('NOT_FOUND', '帳戶不存在', 404);
    }

    const updateData = {};
    if (data.name !== undefined) updateData.name = data.name.trim();
    if (data.type !== undefined) updateData.type = data.type;
    if (data.warehouse !== undefined) updateData.warehouse = data.warehouse;
    if (data.isActive !== undefined) updateData.isActive = data.isActive;
    if (data.openingBalance !== undefined) {
      const newOpening = parseFloat(data.openingBalance);
      const diff = newOpening - Number(existing.openingBalance);
      updateData.openingBalance = newOpening;
      updateData.currentBalance = Number(existing.currentBalance) + diff;
    }

    const account = await prisma.cashAccount.update({
      where: { id },
      data: updateData
    });

    return NextResponse.json({
      ...account,
      openingBalance: Number(account.openingBalance),
      currentBalance: Number(account.currentBalance),
      createdAt: account.createdAt.toISOString(),
      updatedAt: account.updatedAt.toISOString()
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request, { params }) {
  try {
    const id = parseInt(params.id);

    const txCount = await prisma.cashTransaction.count({
      where: { OR: [{ accountId: id }, { transferAccountId: id }] }
    });

    if (txCount > 0) {
      return createErrorResponse('ACCOUNT_HAS_DEPENDENCIES', '此帳戶有交易紀錄，無法刪除。請先停用帳戶。', 400);
    }

    await prisma.cashAccount.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}
