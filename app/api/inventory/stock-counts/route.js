import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { handleApiError, createErrorResponse } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import { localDateStr } from '@/lib/localDate';
import { nextSequence } from '@/lib/sequence-generator';
import { auditFromSession, AUDIT_ACTIONS } from '@/lib/audit';

export const dynamic = 'force-dynamic';

function todayStr() {
  const d = new Date();
  return localDateStr(d);
}

// GET: 盤點記錄列表
export async function GET(request) {
  const auth = await requirePermission(PERMISSIONS.INVENTORY_VIEW);
  if (!auth.ok) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const warehouse = searchParams.get('warehouse');

    const where = {};
    if (warehouse) where.warehouse = warehouse;

    const list = await prisma.stockCount.findMany({
      where,
      include: {
        items: {
          include: { product: { select: { id: true, code: true, name: true, unit: true } } },
        },
      },
      orderBy: { countDate: 'desc' },
    });

    return NextResponse.json(list);
  } catch (error) {
    return handleApiError(error);
  }
}

// POST: 新增盤點（簡化：一次性送出，items: [{ productId, systemQty, actualQty }]）
export async function POST(request) {
  const auth = await requirePermission(PERMISSIONS.INVENTORY_VIEW);
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();
    const { warehouse, countDate, note, items } = body;

    if (!warehouse) {
      return createErrorResponse('REQUIRED_FIELD_MISSING', '請選擇倉庫', 400);
    }
    if (!Array.isArray(items) || items.length === 0) {
      return createErrorResponse('REQUIRED_FIELD_MISSING', '請至少新增一筆盤點明細', 400);
    }

    const date = countDate || todayStr();

    const itemData = items.map((i) => {
      const sys = Number(i.systemQty) || 0;
      const act = Number(i.actualQty) ?? sys;
      const diff = act - sys;
      return {
        productId: Number(i.productId),
        systemQty: sys,
        actualQty: act,
        diff,
        note: i.note || null,
      };
    }).filter((i) => i.productId > 0);

    if (itemData.length === 0) {
      return createErrorResponse('VALIDATION_FAILED', '無有效盤點明細', 400);
    }

    const created = await prisma.$transaction(async (tx) => {
      const countNo = await nextSequence(tx, 'stockCount', 'countNo', `CNT-${date.replace(/-/g, '')}-`);
      return tx.stockCount.create({
      data: {
        countNo,
        warehouse,
        countDate: date,
        status: '已確認',
        note: note || null,
        items: { create: itemData },
      },
      include: {
        items: {
          include: { product: { select: { id: true, code: true, name: true, unit: true } } },
        },
      },
    });
    }); // end $transaction

    await auditFromSession(prisma, auth.session, {
      action: AUDIT_ACTIONS.INVENTORY_STOCK_COUNT_CREATE,
      targetModule: 'inventory_stock_counts',
      targetRecordId: created.id,
      targetRecordNo: created.countNo,
      afterState: { warehouse, itemCount: itemData.length, totalDiff: itemData.reduce((s, i) => s + i.diff, 0) },
      note: note || null,
    });

    return NextResponse.json(created);
  } catch (error) {
    return handleApiError(error);
  }
}
