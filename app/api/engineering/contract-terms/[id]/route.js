import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import { assertEngineeringProjectOpen } from '@/lib/engineering-lock';
import { serializeTerm } from '@/lib/engineering-serializers';

export const dynamic = 'force-dynamic';

export async function DELETE(request, { params }) {
  const auth = await requirePermission(PERMISSIONS.ENGINEERING_EDIT);
  if (!auth.ok) return auth.response;
  const { id: rawId } = await params; const id = parseInt(rawId);
  if (Number.isNaN(id)) return createErrorResponse('BAD_REQUEST', '無效的 ID', 400);
  try {
    const term = await prisma.engineeringContractTerm.findUnique({
      where: { id },
      include: { contract: { select: { projectId: true } } },
    });
    if (!term) return createErrorResponse('NOT_FOUND', '找不到期數', 404);
    await assertEngineeringProjectOpen(term.contract?.projectId);
    if (term.status === 'paid') {
      return createErrorResponse('VALIDATION_FAILED', '已付款的期數不可刪除，請先取消付款狀態', 400);
    }
    await prisma.engineeringContractTerm.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function PUT(request, { params }) {
  const auth = await requirePermission(PERMISSIONS.ENGINEERING_EDIT);
  if (!auth.ok) return auth.response;
  const { id: rawId } = await params; const id = parseInt(rawId);
  if (Number.isNaN(id)) return createErrorResponse('BAD_REQUEST', '無效的 ID', 400);
  try {
    const data = await request.json();

    // Check if term is already paid — only allow status change back to pending (unmark)
    const existing = await prisma.engineeringContractTerm.findUnique({
      where: { id },
      include: { contract: { select: { projectId: true } } },
    });
    if (!existing) return createErrorResponse('NOT_FOUND', '找不到期數', 404);
    await assertEngineeringProjectOpen(existing.contract?.projectId);
    if (existing.status === 'paid' && data.status !== 'pending') {
      return createErrorResponse('VALIDATION_FAILED', '已付款的期數不可修改，如需修改請先取消付款狀態', 400);
    }

    const term = await prisma.$transaction(async (tx) => {
      const updated = await tx.engineeringContractTerm.update({
        where: { id },
        data: {
          ...(data.status !== undefined && { status: data.status }),
          ...(data.paidAt !== undefined && { paidAt: data.paidAt || null }),
          ...(data.paymentOrderId !== undefined && { paymentOrderId: data.paymentOrderId ? parseInt(data.paymentOrderId) : null }),
          ...(data.termName !== undefined && { termName: data.termName?.trim() || null }),
          ...(data.content !== undefined && { content: data.content?.trim() || null }),
          ...(data.amount !== undefined && { amount: parseFloat(data.amount) || 0 }),
          ...(data.dueDate !== undefined && { dueDate: data.dueDate || null }),
          ...(data.note !== undefined && { note: data.note?.trim() || null }),
        },
        include: { contract: { include: { project: true, supplier: true, terms: true } } },
      });

      // 在 tx 內重新 count 未付期數，避免並發競態
      const unpaidCount = await tx.engineeringContractTerm.count({
        where: { contractId: updated.contractId, status: { not: 'paid' } },
      });
      const newContractStatus = unpaidCount === 0 ? 'completed' : 'active';

      if (updated.contract && updated.contract.status !== newContractStatus) {
        await tx.engineeringContract.update({
          where: { id: updated.contractId },
          data: { status: newContractStatus },
        });
      }
      return updated;
    });

    return NextResponse.json(serializeTerm(term));
  } catch (e) {
    return handleApiError(e);
  }
}
