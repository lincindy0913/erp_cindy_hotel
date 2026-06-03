/**
 * PUT /api/vat/periods/[id]
 *
 * 更新申報期狀態（已申報 / 已繳納）或修改備註。
 * 已申報後不可重算，已繳納後不可改回草稿。
 */
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import { auditFromSession, AUDIT_ACTIONS } from '@/lib/audit';

export const dynamic = 'force-dynamic';

const STATUS_TRANSITIONS = {
  '草稿':  ['已申報'],
  '已申報': ['已繳納', '草稿'],  // allow rollback to 草稿 for corrections
  '已繳納': [],
};

export async function PUT(request, { params }) {
  const auth = await requirePermission(PERMISSIONS.FINANCE_CREATE);
  if (!auth.ok) return auth.response;

  try {
    const id   = parseInt((await params).id);
    const body = await request.json();
    const { status, note, filedBy, manualOutputAdjustment } = body;

    const record = await prisma.vatFilingPeriod.findUnique({ where: { id } });
    if (!record) return createErrorResponse('NOT_FOUND', '找不到申報期記錄', 404);

    if (status) {
      const allowed = STATUS_TRANSITIONS[record.status] || [];
      if (!allowed.includes(status)) {
        return createErrorResponse(
          'VALIDATION_FAILED',
          `無法從「${record.status}」變更為「${status}」`,
          422
        );
      }
    }

    const updateData = {};
    if (status)  updateData.status  = status;
    if (note !== undefined) updateData.note = note;

    // VAT1: 允許更新手動調整（PMS/租屋等無發票收入稅額），並重算 taxPayable
    if (manualOutputAdjustment !== undefined && record.status === '草稿') {
      const manual       = Number(manualOutputAdjustment) || 0;
      const totalOutput  = Number(record.outputTax) + manual;
      const netPosition  = totalOutput - Number(record.inputTax) - Number(record.carryForwardIn);
      updateData.manualOutputAdjustment = manual;
      updateData.taxPayable             = Math.max(0,  netPosition);
      updateData.carryForwardOut        = Math.max(0, -netPosition);
    }

    if (status === '已申報') {
      updateData.filedBy = filedBy || auth.session?.user?.name || null;
      updateData.filedAt = new Date();
    }
    if (status === '草稿') {
      updateData.filedBy = null;
      updateData.filedAt = null;
    }

    const updated = await prisma.vatFilingPeriod.update({ where: { id }, data: updateData });

    await auditFromSession(prisma, auth.session, {
      action: AUDIT_ACTIONS.FINANCE_UPDATE ?? 'finance.update',
      targetModule: 'vat-periods',
      targetRecordId: id,
      beforeState: { status: record.status },
      afterState: updateData,
      note: `VAT 申報期 ${record.year} 第${record.period}期 → ${status ?? '更新備註'}`,
    }).catch(e => console.error('[AUDIT_FAIL] vat period update:', e.message));

    return NextResponse.json({
      ...updated,
      outputTax:              Number(updated.outputTax),
      manualOutputAdjustment: Number(updated.manualOutputAdjustment),
      inputTax:               Number(updated.inputTax),
      carryForwardIn:         Number(updated.carryForwardIn),
      taxPayable:             Number(updated.taxPayable),
      carryForwardOut:        Number(updated.carryForwardOut),
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
      filedAt:   updated.filedAt ? updated.filedAt.toISOString() : null,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
