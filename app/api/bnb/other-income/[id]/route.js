import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requireAnyPermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

export async function PUT(request, { params }) {
  const auth = await requireAnyPermission([PERMISSIONS.BNB_EDIT, PERMISSIONS.BNB_CREATE]);
  if (!auth.ok) return auth.response;

  try {
    const { id } = await params;
    const body = await request.json();
    const { importMonth, warehouse, incomeDate, category, description, amount, note } = body;

    if (!importMonth || !warehouse || !incomeDate || !description || amount == null) {
      return createErrorResponse('REQUIRED_FIELD_MISSING', '缺少必填欄位', 400);
    }

    const record = await prisma.bnbOtherIncome.update({
      where: { id: parseInt(id) },
      data: {
        importMonth, warehouse, incomeDate,
        category: category || null,
        description,
        amount: parseFloat(amount) || 0,
        note: note || null,
      },
    });

    return NextResponse.json({ ...record, amount: Number(record.amount) });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request, { params }) {
  const auth = await requireAnyPermission([PERMISSIONS.BNB_EDIT, PERMISSIONS.BNB_CREATE]);
  if (!auth.ok) return auth.response;

  try {
    const { id } = await params;
    await prisma.bnbOtherIncome.delete({ where: { id: parseInt(id) } });
    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}
