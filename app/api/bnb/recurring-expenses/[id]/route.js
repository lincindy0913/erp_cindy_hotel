import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

export async function PATCH(request, { params }) {
  const auth = await requirePermission(PERMISSIONS.BNB_EDIT);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  try {
    const body = await request.json();
    const data = {};
    if (body.category    !== undefined) data.category    = body.category;
    if (body.description !== undefined) data.description = body.description;
    if (body.defaultAmt  !== undefined) data.defaultAmt  = parseFloat(body.defaultAmt);
    if (body.isActive    !== undefined) data.isActive    = body.isActive === true;

    const updated = await prisma.bnbRecurringExpense.update({ where: { id: parseInt(id) }, data });
    return NextResponse.json({ ...updated, defaultAmt: Number(updated.defaultAmt) });
  } catch (error) { return handleApiError(error); }
}

export async function DELETE(_request, { params }) {
  const auth = await requirePermission(PERMISSIONS.BNB_EDIT);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  try {
    const existing = await prisma.bnbRecurringExpense.findUnique({ where: { id: parseInt(id) } });
    if (!existing) return createErrorResponse('NOT_FOUND', '找不到模板', 404);
    await prisma.bnbRecurringExpense.update({ where: { id: parseInt(id) }, data: { isActive: false } });
    return NextResponse.json({ ok: true });
  } catch (error) { return handleApiError(error); }
}
