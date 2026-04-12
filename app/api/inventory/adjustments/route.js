import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { handleApiError, createErrorResponse } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Calculate current system qty for a product+warehouse using v2 full calculation.
 */
async function getSystemQty(productId, warehouse) {
  const whereWarehouse = warehouse
    ? { OR: [{ inventoryWarehouse: warehouse }, { purchaseMaster: { warehouse } }] }
    : {};

  const [purchaseAgg, countItems, transfersOut, transfersIn] = await Promise.all([
    prisma.purchaseDetail.aggregate({
      where: { productId, status: '已入庫', ...whereWarehouse },
      _sum: { quantity: true },
    }),
    prisma.stockCountItem.findMany({
      where: { productId, ...(warehouse ? { stockCount: { warehouse } } : {}) },
    }).catch(() => []),
    prisma.inventoryTransfer.findMany({
      where: { ...(warehouse ? { fromWarehouse: warehouse } : {}) },
      include: { items: { where: { productId } } },
    }).catch(() => []),
    prisma.inventoryTransfer.findMany({
      where: { ...(warehouse ? { toWarehouse: warehouse } : {}) },
      include: { items: { where: { productId } } },
    }).catch(() => []),
  ]);

  const reqAgg = await prisma.inventoryRequisition.aggregate({
    where: { productId, ...(warehouse ? { warehouse } : {}) },
    _sum: { quantity: true },
  }).catch(() => ({ _sum: { quantity: null } }));

  const purchaseQty = purchaseAgg._sum.quantity || 0;
  const reqQty = reqAgg._sum.quantity || 0;
  const outQty = transfersOut.reduce((s, t) => s + t.items.reduce((ss, i) => ss + (i.quantity || 0), 0), 0);
  const inQty = transfersIn.reduce((s, t) => s + t.items.reduce((ss, i) => ss + (i.quantity || 0), 0), 0);
  const adjQty = countItems.reduce((s, ci) => s + (ci.diff || 0), 0);

  return purchaseQty - reqQty - outQty + inQty + adjQty;
}

// POST: Create a manual inventory adjustment (stock count) for a product
export async function POST(request) {
  const auth = await requirePermission(PERMISSIONS.INVENTORY_VIEW);
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();
    const { productId, warehouse, targetQty, reason, adjustDate } = body;

    if (!productId) {
      return createErrorResponse('REQUIRED_FIELD_MISSING', '請提供產品', 400);
    }
    if (!warehouse) {
      return createErrorResponse('REQUIRED_FIELD_MISSING', '請選擇倉庫', 400);
    }
    if (targetQty === undefined || targetQty === null || targetQty === '') {
      return createErrorResponse('REQUIRED_FIELD_MISSING', '請輸入目標數量', 400);
    }

    const product = await prisma.product.findUnique({
      where: { id: Number(productId) },
      select: { id: true, code: true, name: true },
    });
    if (!product) {
      return createErrorResponse('NOT_FOUND', '找不到產品', 404);
    }

    const systemQty = await getSystemQty(Number(productId), warehouse);
    const actualQty = Number(targetQty);
    const diff = actualQty - systemQty;

    if (diff === 0) {
      return createErrorResponse('VALIDATION_FAILED', '目標數量與現存量相同，無需調整', 400);
    }

    const date = adjustDate || todayStr();
    const prefix = `ADJ-${date.replace(/-/g, '')}`;
    const last = await prisma.stockCount.findFirst({
      where: { countNo: { startsWith: prefix } },
      orderBy: { countNo: 'desc' },
    });
    const seq = last ? parseInt(last.countNo.slice(-4), 10) + 1 : 1;
    const countNo = `${prefix}-${String(seq).padStart(4, '0')}`;

    const created = await prisma.stockCount.create({
      data: {
        countNo,
        warehouse,
        countDate: date,
        status: '已確認',
        note: reason || `手動調整：${product.name}`,
        items: {
          create: [{
            productId: product.id,
            systemQty,
            actualQty,
            diff,
            note: reason || null,
          }],
        },
      },
      include: {
        items: {
          include: { product: { select: { id: true, code: true, name: true, unit: true } } },
        },
      },
    });

    return NextResponse.json({
      ...created,
      systemQty,
      actualQty,
      diff,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
