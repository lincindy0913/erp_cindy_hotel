import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

export async function POST(request, { params }) {
  const auth = await requirePermission(PERMISSIONS.ENGINEERING_CREATE);
  if (!auth.ok) return auth.response;
  const contractId = parseInt(params.id);
  if (Number.isNaN(contractId)) return createErrorResponse('BAD_REQUEST', '無效的 ID', 400);
  try {
    const data = await request.json();
    const maxTerm = await prisma.engineeringContractTerm.findFirst({
      where: { contractId },
      orderBy: { termNo: 'desc' },
      select: { termNo: true },
    });
    const termNo = (maxTerm?.termNo ?? 0) + 1;
    const term = await prisma.engineeringContractTerm.create({
      data: {
        contractId,
        termNo,
        termName: data.termName?.trim() || `第${termNo}期`,
        content: data.content?.trim() || null,
        amount: parseFloat(data.amount) || 0,
        dueDate: data.dueDate || null,
        status: 'pending',
        note: data.note?.trim() || null,
      },
    });
    return NextResponse.json({
      ...term,
      amount: Number(term.amount),
      createdAt: term.createdAt.toISOString(),
      updatedAt: term.updatedAt.toISOString(),
    }, { status: 201 });
  } catch (e) {
    return handleApiError(e);
  }
}
