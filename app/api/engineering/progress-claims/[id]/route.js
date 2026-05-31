import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import { assertEngineeringProjectOpen } from '@/lib/engineering-lock';

export const dynamic = 'force-dynamic';

const CLAIM_INCLUDE = {
  project: { select: { id: true, code: true, name: true, clientName: true } },
  outputInvoices: {
    select: { id: true, invoiceNo: true, invoiceDate: true, amount: true, taxAmount: true, totalAmount: true, status: true },
    orderBy: { invoiceDate: 'asc' },
  },
  incomes: {
    select: { id: true, termName: true, receivedDate: true, amount: true },
    orderBy: { receivedDate: 'asc' },
  },
};

function serializeClaim(c) {
  return {
    ...c,
    claimAmount: Number(c.claimAmount),
    certifiedAmount: c.certifiedAmount != null ? Number(c.certifiedAmount) : null,
    outputInvoices: (c.outputInvoices || []).map(i => ({
      ...i, amount: Number(i.amount), taxAmount: Number(i.taxAmount), totalAmount: Number(i.totalAmount),
    })),
    incomes: (c.incomes || []).map(i => ({ ...i, amount: Number(i.amount) })),
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}

export async function PUT(request, { params }) {
  const auth = await requirePermission(PERMISSIONS.ENGINEERING_EDIT);
  if (!auth.ok) return auth.response;
  const { id: rawId } = await params; const id = parseInt(rawId);
  if (Number.isNaN(id)) return createErrorResponse('BAD_REQUEST', '無效的 ID', 400);
  try {
    const data = await request.json();
    const existing = await prisma.engineeringProgressClaim.findUnique({ where: { id }, select: { projectId: true } });
    if (!existing) return createErrorResponse('NOT_FOUND', '找不到估驗單', 404);
    await assertEngineeringProjectOpen(existing.projectId);
    const claim = await prisma.engineeringProgressClaim.update({
      where: { id },
      data: {
        ...(data.claimNo !== undefined && { claimNo: data.claimNo?.trim() || null }),
        ...(data.termName !== undefined && { termName: data.termName.trim() }),
        ...(data.claimDate !== undefined && { claimDate: data.claimDate || null }),
        ...(data.certifiedDate !== undefined && { certifiedDate: data.certifiedDate || null }),
        ...(data.claimAmount !== undefined && { claimAmount: parseFloat(data.claimAmount) }),
        ...(data.certifiedAmount !== undefined && { certifiedAmount: data.certifiedAmount ? parseFloat(data.certifiedAmount) : null }),
        ...(data.status !== undefined && { status: data.status }),
        ...(data.note !== undefined && { note: data.note?.trim() || null }),
      },
      include: CLAIM_INCLUDE,
    });
    return NextResponse.json(serializeClaim(claim));
  } catch (e) { return handleApiError(e); }
}

export async function DELETE(request, { params }) {
  const auth = await requirePermission(PERMISSIONS.ENGINEERING_EDIT);
  if (!auth.ok) return auth.response;
  const { id: rawId } = await params; const id = parseInt(rawId);
  if (Number.isNaN(id)) return createErrorResponse('BAD_REQUEST', '無效的 ID', 400);
  try {
    const existing = await prisma.engineeringProgressClaim.findUnique({
      where: { id },
      select: { projectId: true, _count: { select: { outputInvoices: true, incomes: true } } },
    });
    if (!existing) return createErrorResponse('NOT_FOUND', '找不到估驗單', 404);
    await assertEngineeringProjectOpen(existing.projectId);
    if (existing._count.outputInvoices > 0 || existing._count.incomes > 0) {
      return createErrorResponse(
        'HAS_DEPENDENCIES',
        `此估驗單尚有連結的銷項發票（${existing._count.outputInvoices} 張）或收款（${existing._count.incomes} 筆），請先解除連結後再刪除`,
        409
      );
    }
    await prisma.engineeringProgressClaim.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) { return handleApiError(e); }
}
