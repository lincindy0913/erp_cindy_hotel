import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { nextSequence } from '@/lib/sequence-generator';
import { todayStr } from '@/lib/localDate';
import { getSystemQty } from '@/lib/inventory-helpers';

export const dynamic = 'force-dynamic';

/**
 * POST /api/inventory/stock-counts/import-excel
 * body: { rows: [{ productCode, productName, actualQty, warehouse, note }], warehouse, countDate }
 *
 * 建立一張盤點單（StockCount）含多個明細（StockCountItem）。
 * systemQty 由 getSystemQty() 即時計算（與手動建立盤點一致）。
 */
export async function POST(request) {
  const auth = await requirePermission(PERMISSIONS.INVENTORY_EDIT);
  if (!auth.ok) return auth.response;

  try {
    const { rows, warehouse: whParam, countDate: cdParam } = await request.json();
    if (!Array.isArray(rows) || rows.length === 0) {
      return createErrorResponse('VALIDATION_FAILED', '無有效資料', 400);
    }

    const errors    = [];
    const today     = todayStr();
    const warehouse = whParam?.trim() || rows.find(r => r.warehouse?.trim())?.warehouse?.trim() || '';
    const countDate = cdParam?.trim() || today;

    if (!warehouse) {
      return createErrorResponse('REQUIRED_FIELD_MISSING', '倉庫為必填，請在匯入時指定或在每列填寫倉庫欄位', 400);
    }

    // 預載商品（code → {id, name}），Product 主鍵欄位為 code
    const products = await prisma.product.findMany({
      select: { id: true, code: true, name: true },
    });
    const prodMap = Object.fromEntries(products.map(p => [p.code?.trim(), p]));

    // 驗證並整理明細
    const validRows = [];
    const seenCodes = new Set();

    for (const r of rows) {
      const rowNum    = r._row ?? '?';
      const code      = r.productCode?.trim();
      const actualQty = parseInt(r.actualQty);
      const rowWh     = (r.warehouse?.trim() || warehouse);

      if (!code)            { errors.push({ row: rowNum, message: '商品代碼為必填' }); continue; }
      if (isNaN(actualQty)) { errors.push({ row: rowNum, message: '實際數量需為整數' }); continue; }

      const product = prodMap[code];
      if (!product) { errors.push({ row: rowNum, message: `找不到商品代碼「${code}」，請先在商品管理中建立` }); continue; }

      if (seenCodes.has(`${code}||${rowWh}`)) {
        errors.push({ row: rowNum, message: `商品「${code}」在同一倉庫重複，每件商品只能盤點一次` }); continue;
      }
      seenCodes.add(`${code}||${rowWh}`);

      validRows.push({ productId: product.id, actualQty, note: r.note?.trim() || null, rowWh });
    }

    if (validRows.length === 0) {
      return NextResponse.json({ count: 0, errors });
    }

    let createdCount = 0;
    await prisma.$transaction(async tx => {
      // 即時計算每品項的帳面數量（與手動建立盤點邏輯一致）
      const itemData = await Promise.all(
        validRows.map(async r => {
          const sys = await getSystemQty(tx, r.productId, r.rowWh);
          return {
            productId: r.productId,
            systemQty: sys,
            actualQty: r.actualQty,
            diff:      r.actualQty - sys,
            note:      r.note,
          };
        })
      );

      const countNo = await nextSequence(tx, 'stockCount', 'countNo', `CNT-${countDate.replace(/-/g, '')}-`);
      await tx.stockCount.create({
        data: {
          countNo,
          warehouse,
          countDate,
          status: '已確認',
          type:   'count',
          items:  { create: itemData },
        },
      });
      createdCount = itemData.length;
    });

    return NextResponse.json({ count: createdCount, errors });
  } catch (error) {
    return handleApiError(error);
  }
}
