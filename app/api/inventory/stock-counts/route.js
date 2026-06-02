import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { handleApiError, createErrorResponse } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import { localDateStr } from '@/lib/localDate';
import { nextSequence } from '@/lib/sequence-generator';
import { auditFromSession, AUDIT_ACTIONS } from '@/lib/audit';
import { getSystemQty } from '@/lib/inventory-helpers';

export const dynamic = 'force-dynamic';

function todayStr() {
  return localDateStr(new Date());
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

// POST: 新增盤點（items: [{ productId, actualQty, note }]）
// systemQty 由後端即時計算，前端傳入的 systemQty 一律忽略
export async function POST(request) {
  const auth = await requirePermission(PERMISSIONS.INVENTORY_EDIT);
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

    const validItems = items.filter(i => Number(i.productId) > 0);
    if (validItems.length === 0) {
      return createErrorResponse('VALIDATION_FAILED', '無有效盤點明細', 400);
    }

    const date = countDate || todayStr();

    const created = await prisma.$transaction(async (tx) => {
      // 後端即時計算每個品項的 systemQty，前端值完全忽略
      const itemData = await Promise.all(
        validItems.map(async (i) => {
          const productId = Number(i.productId);
          const sys = await getSystemQty(tx, productId, warehouse);
          const act = (i.actualQty !== undefined && i.actualQty !== null && i.actualQty !== '' && !Number.isNaN(Number(i.actualQty)))
            ? Number(i.actualQty)
            : sys;
          return {
            productId,
            systemQty: sys,
            actualQty: act,
            diff: act - sys,
            note: i.note || null,
          };
        })
      );

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
    });

    await auditFromSession(prisma, auth.session, {
      action: AUDIT_ACTIONS.INVENTORY_STOCK_COUNT_CREATE,
      targetModule: 'inventory_stock_counts',
      targetRecordId: created.id,
      targetRecordNo: created.countNo,
      afterState: {
        warehouse,
        itemCount: created.items.length,
        totalDiff: created.items.reduce((s, i) => s + i.diff, 0),
      },
      note: note || null,
    });

    return NextResponse.json(created);
  } catch (error) {
    return handleApiError(error);
  }
}
