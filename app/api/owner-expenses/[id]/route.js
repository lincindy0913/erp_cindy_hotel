/**
 * PATCH  /api/owner-expenses/[id] — 更新（含確認）
 * DELETE /api/owner-expenses/[id] — 刪除單筆
 */
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { handleApiError } from '@/lib/error-handler';
import { requireAnyPermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';

export const dynamic = 'force-dynamic';

export async function PATCH(request, { params }) {
  const auth = await requireAnyPermission([PERMISSIONS.OWNER_EXPENSE_EDIT, PERMISSIONS.OWNER_EXPENSE_CREATE]);
  if (!auth.ok) return auth.response;

  try {
    const id   = parseInt(params.id);
    const body = await request.json();
    const { totalAmount, invoiceCount, status, note } = body;
    const data = {};
    if (totalAmount  !== undefined) data.totalAmount  = parseFloat(totalAmount);
    if (invoiceCount !== undefined) data.invoiceCount = parseInt(invoiceCount);
    if (note         !== undefined) data.note         = note || null;
    if (status       !== undefined) {
      data.status = status;
      if (status === '已確認') {
        const session = await getServerSession(authOptions);
        data.confirmedBy = session?.user?.name || session?.user?.email || 'system';
        data.confirmedAt = new Date();
      } else {
        data.confirmedBy = null;
        data.confirmedAt = null;
      }
    }
    const expense = await prisma.ownerMonthlyExpense.update({ where: { id }, data });
    return NextResponse.json({ ...expense, totalAmount: Number(expense.totalAmount) });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request, { params }) {
  const auth = await requireAnyPermission([PERMISSIONS.OWNER_EXPENSE_EDIT]);
  if (!auth.ok) return auth.response;

  try {
    await prisma.ownerMonthlyExpense.delete({ where: { id: parseInt(params.id) } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
