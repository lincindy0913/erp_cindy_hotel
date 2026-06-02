import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { handleApiError, createErrorResponse } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import { expandWarehouseNames, warehouseWhereValue } from '@/lib/warehouse-access';
import { localDateStr } from '@/lib/localDate';
import { nextSequence } from '@/lib/sequence-generator';
import { auditFromSession, AUDIT_ACTIONS } from '@/lib/audit';

export const dynamic = 'force-dynamic';

function todayStr() {
  const d = new Date();
  return localDateStr(d);
}

// GET: 領用單列表
export async function GET(request) {
  const auth = await requirePermission(PERMISSIONS.INVENTORY_VIEW);
  if (!auth.ok) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const warehouse = searchParams.get('warehouse');

    const where = {};
    if (warehouse) {
      const whNames = await expandWarehouseNames(prisma, warehouse);
      where.warehouse = warehouseWhereValue(whNames);
    }

    const list = await prisma.inventoryRequisition.findMany({
      where,
      include: { product: { select: { id: true, code: true, name: true, unit: true } } },
      orderBy: { requisitionDate: 'desc' },
    });

    return NextResponse.json(list);
  } catch (error) {
    return handleApiError(error);
  }
}

// POST: 新增領用單（簡化：單品項一筆）
export async function POST(request) {
  const auth = await requirePermission(PERMISSIONS.INVENTORY_EDIT);
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();
    const { warehouse, department, productId, quantity, requisitionDate, note } = body;

    if (!warehouse || !productId || quantity == null || quantity < 1) {
      return createErrorResponse('REQUIRED_FIELD_MISSING', '請填寫倉庫、產品、數量', 400);
    }

    const date = requisitionDate || todayStr();

    const created = await prisma.$transaction(async (tx) => {
      const requisitionNo = await nextSequence(tx, 'inventoryRequisition', 'requisitionNo', `REQ-${date.replace(/-/g, '')}-`);
      return tx.inventoryRequisition.create({
      data: {
        requisitionNo,
        warehouse,
        department: department || null,
        productId: Number(productId),
        quantity: Number(quantity),
        requisitionDate: date,
        status: '已領用',
        note: note || null,
      },
      include: { product: { select: { id: true, code: true, name: true, unit: true } } },
    });
    }); // end $transaction

    await auditFromSession(prisma, auth.session, {
      action: AUDIT_ACTIONS.INVENTORY_REQUISITION_CREATE,
      targetModule: 'inventory_requisitions',
      targetRecordId: created.id,
      targetRecordNo: created.requisitionNo,
      afterState: { warehouse, department: department || null, productId: Number(productId), quantity: Number(quantity) },
    });

    return NextResponse.json(created);
  } catch (error) {
    return handleApiError(error);
  }
}
