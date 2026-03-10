import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requirePermission, requireAnyPermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

export async function PUT(request, { params }) {
  const auth = await requirePermission(PERMISSIONS.CASHFLOW_EDIT);
  if (!auth.ok) return auth.response;
  
  try {
    const id = parseInt(params.id);
    const data = await request.json();

    const updateData = {};
    if (data.name !== undefined) updateData.name = data.name.trim();
    if (data.type !== undefined) updateData.type = data.type;
    if (data.warehouse !== undefined) updateData.warehouse = data.warehouse || null;
    if (data.accountingSubjectId !== undefined) updateData.accountingSubjectId = data.accountingSubjectId ? parseInt(data.accountingSubjectId) : null;
    if (data.isActive !== undefined) updateData.isActive = data.isActive;

    const category = await prisma.cashCategory.update({
      where: { id },
      data: updateData,
      include: {
        accountingSubject: {
          select: { id: true, code: true, name: true }
        }
      }
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
  const auth = await requirePermission(PERMISSIONS.CASHFLOW_EDIT);
  if (!auth.ok) return auth.response;
  
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
