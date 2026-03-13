import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

export async function PUT(request, { params }) {
  const auth = await requirePermission(PERMISSIONS.ENGINEERING_EDIT);
  if (!auth.ok) return auth.response;
  const id = parseInt(params.id);
  if (Number.isNaN(id)) return createErrorResponse('BAD_REQUEST', '無效的 ID', 400);
  try {
    const data = await request.json();
    const term = await prisma.engineeringContractTerm.update({
      where: { id },
      data: {
        ...(data.status !== undefined && { status: data.status }),
        ...(data.paidAt !== undefined && { paidAt: data.paidAt || null }),
        ...(data.paymentOrderId !== undefined && { paymentOrderId: data.paymentOrderId ? parseInt(data.paymentOrderId) : null }),
        ...(data.termName !== undefined && { termName: data.termName?.trim() || null }),
        ...(data.dueDate !== undefined && { dueDate: data.dueDate || null }),
        ...(data.note !== undefined && { note: data.note?.trim() || null }),
      },
      include: { contract: { include: { project: true, supplier: true } } },
    });
    return NextResponse.json({
      ...term,
      amount: Number(term.amount),
      createdAt: term.createdAt.toISOString(),
      updatedAt: term.updatedAt.toISOString(),
    });
  } catch (e) {
    return handleApiError(e);
  }
}
