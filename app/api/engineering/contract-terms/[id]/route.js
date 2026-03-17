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

    // Check if term is already paid — only allow status change back to pending (unmark)
    const existing = await prisma.engineeringContractTerm.findUnique({ where: { id } });
    if (!existing) return createErrorResponse('NOT_FOUND', '找不到期數', 404);
    if (existing.status === 'paid' && data.status !== 'pending') {
      return createErrorResponse('VALIDATION_FAILED', '已付款的期數不可修改，如需修改請先取消付款狀態', 400);
    }

    const term = await prisma.engineeringContractTerm.update({
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

    // Auto-update contract status based on term statuses
    if (term.contract) {
      const allPaid = term.contract.terms.every(t => t.status === 'paid');
      const newContractStatus = allPaid ? 'completed' : 'active';
      if (term.contract.status !== newContractStatus) {
        await prisma.engineeringContract.update({
          where: { id: term.contractId },
          data: { status: newContractStatus },
        });
      }
    }
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
