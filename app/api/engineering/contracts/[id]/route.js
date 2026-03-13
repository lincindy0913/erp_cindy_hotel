import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  const auth = await requirePermission(PERMISSIONS.ENGINEERING_VIEW);
  if (!auth.ok) return auth.response;
  const id = parseInt(params.id);
  if (Number.isNaN(id)) return createErrorResponse('BAD_REQUEST', '無效的 ID', 400);
  try {
    const contract = await prisma.engineeringContract.findUnique({
      where: { id },
      include: { project: true, supplier: true, terms: { orderBy: { termNo: 'asc' } } },
    });
    if (!contract) return createErrorResponse('NOT_FOUND', '找不到合約', 404);
    return NextResponse.json({
      ...contract,
      totalAmount: Number(contract.totalAmount),
      terms: contract.terms.map(t => ({
        ...t,
        amount: Number(t.amount),
        createdAt: t.createdAt.toISOString(),
        updatedAt: t.updatedAt.toISOString(),
      })),
    });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function PUT(request, { params }) {
  const auth = await requirePermission(PERMISSIONS.ENGINEERING_EDIT);
  if (!auth.ok) return auth.response;
  const id = parseInt(params.id);
  if (Number.isNaN(id)) return createErrorResponse('BAD_REQUEST', '無效的 ID', 400);
  try {
    const data = await request.json();
    const contract = await prisma.engineeringContract.update({
      where: { id },
      data: {
        ...(data.contractNo !== undefined && { contractNo: String(data.contractNo).trim() }),
        ...(data.totalAmount !== undefined && { totalAmount: parseFloat(data.totalAmount) }),
        ...(data.signDate !== undefined && { signDate: data.signDate || null }),
        ...(data.content !== undefined && { content: data.content?.trim() || null }),
        ...(data.note !== undefined && { note: data.note?.trim() || null }),
      },
      include: { project: true, supplier: true, terms: { orderBy: { termNo: 'asc' } } },
    });
    return NextResponse.json({
      ...contract,
      totalAmount: Number(contract.totalAmount),
      terms: contract.terms.map(t => ({
        ...t,
        amount: Number(t.amount),
        createdAt: t.createdAt.toISOString(),
        updatedAt: t.updatedAt.toISOString(),
      })),
    });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function DELETE(request, { params }) {
  const auth = await requirePermission(PERMISSIONS.ENGINEERING_EDIT);
  if (!auth.ok) return auth.response;
  const id = parseInt(params.id);
  if (Number.isNaN(id)) return createErrorResponse('BAD_REQUEST', '無效的 ID', 400);
  try {
    await prisma.engineeringContract.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleApiError(e);
  }
}
