import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import { assertPeriodOpen } from '@/lib/period-lock';
import { auditFromSession, AUDIT_ACTIONS } from '@/lib/audit';

export const dynamic = 'force-dynamic';

// PATCH: 修改領用單（僅允許 quantity / note）
export async function PATCH(request, { params }) {
  const auth = await requirePermission(PERMISSIONS.INVENTORY_EDIT);
  if (!auth.ok) return auth.response;

  try {
    const id   = parseInt((await params).id);
    const body = await request.json();

    const existing = await prisma.inventoryRequisition.findUnique({ where: { id } });
    if (!existing) return createErrorResponse('NOT_FOUND', '領用單不存在', 404);

    await assertPeriodOpen(prisma, existing.requisitionDate, existing.warehouse);

    const updateData = {};
    if (body.quantity !== undefined) {
      const qty = Number(body.quantity);
      if (!Number.isInteger(qty) || qty < 1) {
        return createErrorResponse('VALIDATION_FAILED', '數量必須為正整數', 400);
      }
      updateData.quantity = qty;
    }
    if (body.note !== undefined) updateData.note = body.note || null;

    if (Object.keys(updateData).length === 0) {
      return createErrorResponse('VALIDATION_FAILED', '未提供可修改的欄位（quantity / note）', 400);
    }

    const updated = await prisma.inventoryRequisition.update({ where: { id }, data: updateData });

    await auditFromSession(prisma, auth.session, {
      action: AUDIT_ACTIONS.INVENTORY_REQUISITION_UPDATE,
      targetModule: 'inventory_requisitions',
      targetRecordId: id,
      targetRecordNo: existing.requisitionNo,
      beforeState: { quantity: existing.quantity, note: existing.note },
      afterState:  updateData,
    });

    return NextResponse.json(updated);
  } catch (error) {
    return handleApiError(error);
  }
}

// DELETE: 刪除領用單
export async function DELETE(request, { params }) {
  const auth = await requirePermission(PERMISSIONS.INVENTORY_EDIT);
  if (!auth.ok) return auth.response;

  try {
    const id = parseInt((await params).id);

    const existing = await prisma.inventoryRequisition.findUnique({ where: { id } });
    if (!existing) return createErrorResponse('NOT_FOUND', '領用單不存在', 404);

    await assertPeriodOpen(prisma, existing.requisitionDate, existing.warehouse);

    await prisma.inventoryRequisition.delete({ where: { id } });

    await auditFromSession(prisma, auth.session, {
      action: AUDIT_ACTIONS.INVENTORY_REQUISITION_DELETE,
      targetModule: 'inventory_requisitions',
      targetRecordId: id,
      targetRecordNo: existing.requisitionNo,
      beforeState: { productId: existing.productId, warehouse: existing.warehouse, quantity: existing.quantity },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}
