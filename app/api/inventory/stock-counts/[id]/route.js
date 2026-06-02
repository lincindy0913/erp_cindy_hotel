import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import { assertPeriodOpen } from '@/lib/period-lock';
import { auditFromSession, AUDIT_ACTIONS } from '@/lib/audit';

export const dynamic = 'force-dynamic';

// PATCH: 修改盤點單的品項 actualQty 或 note
// diff 用「原始 systemQty」重算（盤點當時的快照），不重查當下庫存
export async function PATCH(request, { params }) {
  const auth = await requirePermission(PERMISSIONS.INVENTORY_EDIT);
  if (!auth.ok) return auth.response;

  try {
    const id   = parseInt((await params).id);
    const body = await request.json();

    const existing = await prisma.stockCount.findUnique({
      where: { id },
      include: { items: true },
    });
    if (!existing) return createErrorResponse('NOT_FOUND', '盤點單不存在', 404);

    await assertPeriodOpen(prisma, existing.countDate, existing.warehouse);

    const stockCountUpdate = {};
    if (body.note !== undefined) stockCountUpdate.note = body.note || null;

    // 支援批次更新 items: [{ itemId, actualQty, note }]
    const itemUpdates = Array.isArray(body.items) ? body.items : [];
    for (const patch of itemUpdates) {
      const item = existing.items.find(i => i.id === Number(patch.itemId));
      if (!item) return createErrorResponse('NOT_FOUND', `盤點明細 #${patch.itemId} 不存在`, 404);

      const itemData = {};
      if (patch.actualQty !== undefined) {
        const qty = Number(patch.actualQty);
        if (Number.isNaN(qty) || qty < 0) {
          return createErrorResponse('VALIDATION_FAILED', '實盤數量不可為負數', 400);
        }
        itemData.actualQty = qty;
        // diff 用原始 systemQty 重算，保留盤點當時的系統數字
        itemData.diff = qty - item.systemQty;
      }
      if (patch.note !== undefined) itemData.note = patch.note || null;

      if (Object.keys(itemData).length > 0) {
        await prisma.stockCountItem.update({ where: { id: item.id }, data: itemData });
      }
    }

    if (itemUpdates.length === 0 && Object.keys(stockCountUpdate).length === 0) {
      return createErrorResponse('VALIDATION_FAILED', '未提供可修改的欄位', 400);
    }

    const updated = Object.keys(stockCountUpdate).length > 0
      ? await prisma.stockCount.update({ where: { id }, data: stockCountUpdate })
      : existing;

    await auditFromSession(prisma, auth.session, {
      action: AUDIT_ACTIONS.INVENTORY_STOCK_COUNT_UPDATE,
      targetModule: 'inventory_stock_counts',
      targetRecordId: id,
      targetRecordNo: existing.countNo,
      afterState: { note: body.note, items: itemUpdates },
    });

    return NextResponse.json(updated);
  } catch (error) {
    return handleApiError(error);
  }
}

// DELETE: 刪除盤點單（StockCountItem 由 onDelete: Cascade 自動清除）
export async function DELETE(request, { params }) {
  const auth = await requirePermission(PERMISSIONS.INVENTORY_EDIT);
  if (!auth.ok) return auth.response;

  try {
    const id = parseInt((await params).id);

    const existing = await prisma.stockCount.findUnique({
      where: { id },
      include: { items: { select: { productId: true, diff: true } } },
    });
    if (!existing) return createErrorResponse('NOT_FOUND', '盤點單不存在', 404);

    await assertPeriodOpen(prisma, existing.countDate, existing.warehouse);

    await prisma.stockCount.delete({ where: { id } });

    await auditFromSession(prisma, auth.session, {
      action: AUDIT_ACTIONS.INVENTORY_STOCK_COUNT_DELETE,
      targetModule: 'inventory_stock_counts',
      targetRecordId: id,
      targetRecordNo: existing.countNo,
      beforeState: {
        warehouse: existing.warehouse,
        countDate: existing.countDate,
        type:      existing.type,
        items:     existing.items,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}
