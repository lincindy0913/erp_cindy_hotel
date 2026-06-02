import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import { assertPeriodOpen } from '@/lib/period-lock';
import { auditFromSession, AUDIT_ACTIONS } from '@/lib/audit';

export const dynamic = 'force-dynamic';

// PATCH: 修改調撥單（僅允許 item quantity / note）
export async function PATCH(request, { params }) {
  const auth = await requirePermission(PERMISSIONS.INVENTORY_EDIT);
  if (!auth.ok) return auth.response;

  try {
    const id   = parseInt((await params).id);
    const body = await request.json();

    const existing = await prisma.inventoryTransfer.findUnique({
      where: { id },
      include: { items: true },
    });
    if (!existing) return createErrorResponse('NOT_FOUND', '調撥單不存在', 404);

    await assertPeriodOpen(prisma, existing.transferDate, existing.fromWarehouse);

    const updateData = {};
    if (body.note !== undefined) updateData.note = body.note || null;

    // 支援修改第一筆（也是唯一一筆）調撥品項的數量
    let itemUpdated = false;
    if (body.quantity !== undefined && existing.items.length > 0) {
      const qty = Number(body.quantity);
      if (!Number.isInteger(qty) || qty < 1) {
        return createErrorResponse('VALIDATION_FAILED', '數量必須為正整數', 400);
      }
      await prisma.inventoryTransferItem.update({
        where: { id: existing.items[0].id },
        data:  { quantity: qty },
      });
      itemUpdated = true;
    }

    const updated = Object.keys(updateData).length > 0
      ? await prisma.inventoryTransfer.update({ where: { id }, data: updateData })
      : existing;

    if (!itemUpdated && Object.keys(updateData).length === 0) {
      return createErrorResponse('VALIDATION_FAILED', '未提供可修改的欄位（quantity / note）', 400);
    }

    await auditFromSession(prisma, auth.session, {
      action: AUDIT_ACTIONS.INVENTORY_TRANSFER_UPDATE,
      targetModule: 'inventory_transfers',
      targetRecordId: id,
      targetRecordNo: existing.transferNo,
      beforeState: { quantity: existing.items[0]?.quantity, note: existing.note },
      afterState:  { quantity: body.quantity, note: body.note },
    });

    return NextResponse.json(updated);
  } catch (error) {
    return handleApiError(error);
  }
}

// DELETE: 刪除調撥單（items 由 onDelete: Cascade 自動清除）
export async function DELETE(request, { params }) {
  const auth = await requirePermission(PERMISSIONS.INVENTORY_EDIT);
  if (!auth.ok) return auth.response;

  try {
    const id = parseInt((await params).id);

    const existing = await prisma.inventoryTransfer.findUnique({
      where: { id },
      include: { items: true },
    });
    if (!existing) return createErrorResponse('NOT_FOUND', '調撥單不存在', 404);

    await assertPeriodOpen(prisma, existing.transferDate, existing.fromWarehouse);

    await prisma.inventoryTransfer.delete({ where: { id } });

    await auditFromSession(prisma, auth.session, {
      action: AUDIT_ACTIONS.INVENTORY_TRANSFER_DELETE,
      targetModule: 'inventory_transfers',
      targetRecordId: id,
      targetRecordNo: existing.transferNo,
      beforeState: {
        fromWarehouse: existing.fromWarehouse,
        toWarehouse:   existing.toWarehouse,
        items: existing.items.map(i => ({ productId: i.productId, quantity: i.quantity })),
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}
