/**
 * POST /api/engineering/contracts/[id]/terms-batch
 *
 * 批次追加期數，取代前端 for-await 序列呼叫。
 * body: [{ termName, content, amount, dueDate, note }, ...]
 */
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import { assertEngineeringProjectOpen } from '@/lib/engineering-lock';
import { serializeTerm } from '@/lib/engineering-serializers';

export const dynamic = 'force-dynamic';

export async function POST(request, { params }) {
  const auth = await requirePermission(PERMISSIONS.ENGINEERING_CREATE);
  if (!auth.ok) return auth.response;
  const { id: rawId } = await params; const contractId = parseInt(rawId);
  if (Number.isNaN(contractId)) return createErrorResponse('BAD_REQUEST', '無效的 ID', 400);

  try {
    const terms = await request.json();
    if (!Array.isArray(terms) || terms.length === 0) {
      return createErrorResponse('REQUIRED_FIELD_MISSING', '請提供期數陣列', 400);
    }

    const contract = await prisma.engineeringContract.findUnique({
      where: { id: contractId },
      select: { projectId: true },
    });
    if (!contract) return createErrorResponse('NOT_FOUND', '找不到合約', 404);
    await assertEngineeringProjectOpen(contract.projectId);

    const created = await prisma.$transaction(async (tx) => {
      const maxTerm = await tx.engineeringContractTerm.findFirst({
        where: { contractId },
        orderBy: { termNo: 'desc' },
        select: { termNo: true },
      });
      let nextTermNo = (maxTerm?.termNo ?? 0) + 1;

      const results = [];
      for (const t of terms) {
        const termNo = nextTermNo++;
        const term = await tx.engineeringContractTerm.create({
          data: {
            contractId,
            termNo,
            termType: t.termType || 'regular',
            termName: t.termName?.trim() || `第${termNo}期`,
            content: t.content?.trim() || null,
            amount: parseFloat(t.amount) || 0,
            retentionAmount: parseFloat(t.retentionAmount) || 0,
            dueDate: t.dueDate || null,
            status: 'pending',
            note: t.note?.trim() || null,
          },
        });
        results.push(serializeTerm(term));
      }
      return results;
    });

    return NextResponse.json({ created, count: created.length }, { status: 201 });
  } catch (e) {
    return handleApiError(e);
  }
}
