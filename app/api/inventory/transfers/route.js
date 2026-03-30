import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { handleApiError, createErrorResponse } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import { expandWarehouseNames, warehouseWhereValue } from '@/lib/warehouse-access';

export const dynamic = 'force-dynamic';

function todayStr() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

// GET: 調撥單列表
export async function GET(request) {
  const auth = await requirePermission(PERMISSIONS.INVENTORY_VIEW);
  if (!auth.ok) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const warehouse = searchParams.get('warehouse');

    const where = {};
    if (warehouse) {
      const whNames = await expandWarehouseNames(prisma, warehouse);
      const whValue = warehouseWhereValue(whNames);
      where.OR = [
        { fromWarehouse: whValue },
        { toWarehouse: whValue },
      ];
    }

    const list = await prisma.inventoryTransfer.findMany({
      where,
      include: {
        items: {
          include: { product: { select: { id: true, code: true, name: true, unit: true } } },
        },
      },
      orderBy: { transferDate: 'desc' },
    });

    return NextResponse.json(list);
  } catch (error) {
    return handleApiError(error);
  }
}

// POST: 新增調撥單（簡化：單品項一筆）
export async function POST(request) {
  const auth = await requirePermission(PERMISSIONS.INVENTORY_VIEW);
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();
    const { fromWarehouse, toWarehouse, productId, quantity, transferDate, note } = body;

    if (!fromWarehouse || !toWarehouse || fromWarehouse === toWarehouse) {
      return createErrorResponse('VALIDATION_FAILED', '來源倉庫與目標倉庫不可相同', 400);
    }
    if (!productId || quantity == null || quantity < 1) {
      return createErrorResponse('REQUIRED_FIELD_MISSING', '請填寫產品、數量', 400);
    }

    const date = transferDate || todayStr();
    const prefix = `TRF-${date.replace(/-/g, '')}`;
    const last = await prisma.inventoryTransfer.findFirst({
      where: { transferNo: { startsWith: prefix } },
      orderBy: { transferNo: 'desc' },
    });
    const seq = last ? parseInt(last.transferNo.slice(-4), 10) + 1 : 1;
    const transferNo = `${prefix}-${String(seq).padStart(4, '0')}`;

    const created = await prisma.inventoryTransfer.create({
      data: {
        transferNo,
        fromWarehouse,
        toWarehouse,
        transferDate: date,
        status: '已調撥',
        note: note || null,
        items: {
          create: { productId: Number(productId), quantity: Number(quantity) },
        },
      },
      include: {
        items: {
          include: { product: { select: { id: true, code: true, name: true, unit: true } } },
        },
      },
    });

    return NextResponse.json(created);
  } catch (error) {
    return handleApiError(error);
  }
}
