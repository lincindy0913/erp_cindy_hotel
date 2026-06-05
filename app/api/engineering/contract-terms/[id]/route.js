import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import { assertEngineeringProjectOpen } from '@/lib/engineering-lock';
import { serializeTerm } from '@/lib/engineering-serializers';
import { snapshotContract } from '@/lib/contract-snapshot';

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
    await snapshotContract(term.contractId, { reason: `刪除期數：${term.termName || `第${term.termNo}期`}` });
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

    // 手動標記 paid 必須有出納執行記錄，或填寫帳外付款說明
    if (data.status === 'paid' && existing.status !== 'paid') {
      const execCount = await prisma.cashierExecution.count({
        where: { paymentOrder: { sourceType: 'engineering', sourceRecordId: id } },
      });
      if (execCount === 0) {
        if (!data.manualNote?.trim()) {
          return createErrorResponse(
            'MANUAL_PAYMENT_BLOCKED',
            '此期數尚無出納執行記錄。應透過「付款單→出納執行」流程完成付款，系統將自動核銷期數。如確為帳外付款，請填寫帳外付款說明。',
            400
          );
        }
        // 帳外付款：將說明寫入 note 供稽核
        data.note = `[帳外付款] ${data.manualNote.trim()}${data.note ? ` | ${data.note}` : ''}`;
      }
    }

    // 結構性欄位異動才快照（不含付款狀態更新）
    const TERM_STRUCTURAL = ['amount', 'retentionAmount', 'termName', 'termType', 'content', 'dueDate', 'note'];
    if (TERM_STRUCTURAL.some(f => data[f] !== undefined)) {
      await snapshotContract(existing.contractId, { reason: data.changeReason || `修改期數：${existing.termName || `第${existing.termNo}期`}` });
    }

    const term = await prisma.$transaction(async (tx) => {
      const updated = await tx.engineeringContractTerm.update({
        where: { id },
        data: {
          ...(data.status !== undefined && { status: data.status }),
          ...(data.paidAt !== undefined && { paidAt: data.paidAt || null }),
          ...(data.paymentOrderId !== undefined && { paymentOrderId: data.paymentOrderId ? parseInt(data.paymentOrderId) : null }),
          ...(data.termType !== undefined && { termType: data.termType || 'regular' }),
          ...(data.termName !== undefined && { termName: data.termName?.trim() || null }),
          ...(data.content !== undefined && { content: data.content?.trim() || null }),
          ...(data.amount !== undefined && { amount: parseFloat(data.amount) || 0 }),
          ...(data.retentionAmount !== undefined && { retentionAmount: parseFloat(data.retentionAmount) || 0 }),
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
