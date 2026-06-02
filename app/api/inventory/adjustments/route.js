import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { handleApiError, createErrorResponse } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import { todayStr } from '@/lib/localDate';
import { auditFromSession, AUDIT_ACTIONS } from '@/lib/audit';
import { nextSequence } from '@/lib/sequence-generator';
import { getSystemQty } from '@/lib/inventory-helpers';
import { assertPeriodOpen } from '@/lib/period-lock';

export const dynamic = 'force-dynamic';

// POST: Create a manual inventory adjustment (stock count) for a product
export async function POST(request) {
  // 庫存調整需要 INVENTORY_EDIT，不是只有 VIEW
  const auth = await requirePermission(PERMISSIONS.INVENTORY_EDIT);
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

    const date = adjustDate || todayStr();
    const prefix = `ADJ-${date.replace(/-/g, '')}`;

    // 整個讀-計算-寫流程都在同一個 transaction 內，消除競爭條件
    const created = await prisma.$transaction(async (tx) => {
      await assertPeriodOpen(tx, date, warehouse);
      // getSystemQty 在 tx 內執行，讀寫原子化
      const systemQty = await getSystemQty(tx, Number(productId), warehouse);
      const actualQty = Number(targetQty);
      if (Number.isNaN(actualQty)) throw new Error('VALIDATION:目標數量格式錯誤');
      const diff      = actualQty - systemQty;

      if (diff === 0) {
        throw new Error('VALIDATION:目標數量與現存量相同，無需調整');
      }

      // nextSequence 使用 FOR UPDATE row-level lock，消除 unique violation 競爭
      const countNo = await nextSequence(tx, 'stockCount', 'countNo', prefix);

      return tx.stockCount.create({
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
    });

    // 從建立結果取回 systemQty/actualQty/diff（寫在 item 內）
    const item = created.items[0];

    await auditFromSession(prisma, auth.session, {
      action: AUDIT_ACTIONS.INVENTORY_ADJUSTMENT_CREATE,
      targetModule: 'inventory_adjustments',
      targetRecordId: created.id,
      targetRecordNo: created.countNo,
      afterState: {
        product: product.name,
        warehouse,
        systemQty: item.systemQty,
        actualQty: item.actualQty,
        diff: item.diff,
      },
      note: reason || `手動調整：${product.name}`,
    });

    return NextResponse.json({
      ...created,
      systemQty: item.systemQty,
      actualQty: item.actualQty,
      diff: item.diff,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
