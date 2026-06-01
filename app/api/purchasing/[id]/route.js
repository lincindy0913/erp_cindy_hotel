import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requirePermission, requireAnyPermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import { assertWarehouseAccess } from '@/lib/warehouse-access';
import { auditFromSession, AUDIT_ACTIONS } from '@/lib/audit';
import { assertPeriodOpen } from '@/lib/period-lock';

// PATCH: 更新單一進貨明細的入庫狀態（由庫存管理頁面呼叫）
export async function PATCH(request, { params }) {
  const auth = await requirePermission(PERMISSIONS.PURCHASING_EDIT);
  if (!auth.ok) return auth.response;

  try {
    const id = parseInt(params.id);
    const { detailId, status, inventoryWarehouse } = await request.json();

    if (!detailId || !status) {
      return NextResponse.json({ error: '缺少 detailId 或 status' }, { status: 400 });
    }
    if (!['待入庫', '已入庫', '不需入庫'].includes(status)) {
      return NextResponse.json({ error: '無效的入庫狀態' }, { status: 400 });
    }

    const detail = await prisma.purchaseDetail.findFirst({
      where: { id: parseInt(detailId), purchaseId: id },
      include: { purchaseMaster: true },
    });
    if (!detail) return NextResponse.json({ error: '找不到進貨明細' }, { status: 404 });

    const wa = assertWarehouseAccess(auth.session, detail.purchaseMaster.warehouse);
    if (!wa.ok) return wa.response;

    const updated = await prisma.purchaseDetail.update({
      where: { id: parseInt(detailId) },
      data: {
        status,
        ...(inventoryWarehouse !== undefined ? { inventoryWarehouse: inventoryWarehouse || null } : {}),
      },
      include: { product: { select: { name: true } } },
    });

    return NextResponse.json({
      id: updated.id,
      status: updated.status,
      inventoryWarehouse: updated.inventoryWarehouse || '',
      productName: updated.product?.name || '',
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(request, { params }) {
  const auth = await requirePermission(PERMISSIONS.PURCHASING_EDIT);
  if (!auth.ok) return auth.response;
  
  try {
    const id = parseInt(params.id);
    const data = await request.json();

    const existing = await prisma.purchaseMaster.findUnique({ where: { id } });
    if (!existing) {
      return createErrorResponse('NOT_FOUND', '進貨單不存在', 404);
    }

    const wa = assertWarehouseAccess(auth.session, existing.warehouse);
    if (!wa.ok) return wa.response;

    const updated = await prisma.$transaction(async (tx) => {
      const record = await tx.purchaseMaster.findUnique({ where: { id } });
      await assertPeriodOpen(tx, record.purchaseDate, record.warehouse);

      const incomingItems = data.items || [];

      // ── Diff-based detail sync ────────────────────────────────
      // 1. 取得目前所有明細
      const currentDetails = await tx.purchaseDetail.findMany({
        where: { purchaseId: id },
        select: { id: true },
      });
      const currentIds = new Set(currentDetails.map(d => d.id));
      const incomingIds = new Set(
        incomingItems.filter(i => i.detailId).map(i => parseInt(i.detailId))
      );

      // 2. 需刪除的明細（DB 有、incoming 沒帶 detailId 的）
      const toDeleteIds = [...currentIds].filter(did => !incomingIds.has(did));

      // 3. 防護：確認要刪除的明細未被核銷（purchaseItemId = "${masterId}-${detailId}"）
      if (toDeleteIds.length > 0) {
        const referenced = await tx.salesDetail.findFirst({
          where: { purchaseItemId: { in: toDeleteIds.map(did => `${id}-${did}`) } },
          select: { purchaseItemId: true },
        });
        if (referenced) {
          throw Object.assign(
            new Error(`CONFLICT:明細 ${referenced.purchaseItemId} 已被核銷，無法刪除`),
            { statusCode: 409, code: 'DETAIL_REFERENCED' }
          );
        }
        await tx.purchaseDetail.deleteMany({ where: { id: { in: toDeleteIds }, purchaseId: id } });
      }

      // 4. UPDATE 既有明細 / INSERT 新明細
      for (const item of incomingItems) {
        const detailData = {
          productId: parseInt(item.productId),
          quantity: parseInt(item.quantity),
          unitPrice: parseFloat(item.unitPrice),
          note: item.note || '',
          status: item.status || '待入庫',
          inventoryWarehouse: item.inventoryWarehouse || null,
        };
        if (item.detailId && currentIds.has(parseInt(item.detailId))) {
          await tx.purchaseDetail.update({
            where: { id: parseInt(item.detailId) },
            data: detailData,
          });
        } else {
          await tx.purchaseDetail.create({ data: { purchaseId: id, ...detailData } });
        }
      }

      return await tx.purchaseMaster.update({
        where: { id },
        data: {
          warehouse: data.warehouse || '',
          department: data.department || '',
          supplierId: parseInt(data.supplierId),
          purchaseDate: data.purchaseDate,
          paymentTerms: data.paymentTerms || '月結',
          status: data.status,
          amount: parseFloat(data.amount || 0),
          tax: 0,
          totalAmount: data.totalAmount ? parseFloat(data.totalAmount) : parseFloat(data.amount || 0),
        },
        include: { details: true },
      });
    });

    const result = {
      id: updated.id,
      purchaseNo: updated.purchaseNo,
      warehouse: updated.warehouse,
      department: updated.department,
      supplierId: updated.supplierId,
      purchaseDate: updated.purchaseDate,
      paymentTerms: updated.paymentTerms,
      taxType: updated.taxType,
      amount: Number(updated.amount),
      tax: Number(updated.tax),
      totalAmount: Number(updated.totalAmount),
      status: updated.status,
      items: updated.details.map(d => ({
        detailId: d.id,
        productId: d.productId,
        quantity: d.quantity,
        unitPrice: Number(d.unitPrice),
        note: d.note || '',
        status: d.status,
        inventoryWarehouse: d.inventoryWarehouse || ''
      })),
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString()
    };

    await auditFromSession(prisma, auth.session, {
      action: AUDIT_ACTIONS.PURCHASE_UPDATE,
      targetModule: 'purchasing',
      targetRecordId: id,
      targetRecordNo: existing.purchaseNo,
      beforeState: { warehouse: existing.warehouse, amount: Number(existing.amount), status: existing.status },
      afterState: { warehouse: result.warehouse, amount: result.amount, status: result.status },
      note: `修改進貨單 ${existing.purchaseNo}`,
    });

    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request, { params }) {
  const auth = await requirePermission(PERMISSIONS.PURCHASING_EDIT);
  if (!auth.ok) return auth.response;
  
  try {
    const id = parseInt(params.id);

    const existing = await prisma.purchaseMaster.findUnique({ where: { id } });
    if (!existing) {
      return createErrorResponse('NOT_FOUND', '進貨單不存在', 404);
    }

    const waDel = assertWarehouseAccess(auth.session, existing.warehouse);
    if (!waDel.ok) return waDel.response;

    await prisma.$transaction(async (tx) => {
      const record = await tx.purchaseMaster.findUnique({ where: { id } });
      await assertPeriodOpen(tx, record.purchaseDate, record.warehouse);

      await tx.purchaseMaster.delete({ where: { id } });
    });

    await auditFromSession(prisma, auth.session, {
      action: AUDIT_ACTIONS.PURCHASE_DELETE,
      targetModule: 'purchasing',
      targetRecordId: id,
      targetRecordNo: existing.purchaseNo,
      beforeState: { purchaseNo: existing.purchaseNo, warehouse: existing.warehouse, amount: Number(existing.amount), status: existing.status },
      note: `刪除進貨單 ${existing.purchaseNo}`,
    });

    return NextResponse.json({ message: '進貨單已刪除' });
  } catch (error) {
    return handleApiError(error);
  }
}
