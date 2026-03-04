import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';

export async function PUT(request, { params }) {
  try {
    const id = parseInt(params.id);
    const data = await request.json();

    const updateData = {};
    if (data.name !== undefined) updateData.name = data.name.trim();
    if (data.type !== undefined) updateData.type = data.type;
    if (data.warehouse !== undefined) updateData.warehouse = data.warehouse || null;
    if (data.isActive !== undefined) updateData.isActive = data.isActive;

    const category = await prisma.cashCategory.update({
      where: { id },
      data: updateData
    });

    return NextResponse.json({
      ...category,
      createdAt: category.createdAt.toISOString()
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request, { params }) {
  try {
    const id = parseInt(params.id);

    const txCount = await prisma.cashTransaction.count({ where: { categoryId: id } });
    if (txCount > 0) {
      return createErrorResponse('ACCOUNT_HAS_DEPENDENCIES', '此類別有交易紀錄，無法刪除', 400);
    }

    await prisma.cashCategory.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}
