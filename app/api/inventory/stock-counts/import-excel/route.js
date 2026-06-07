import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import { handleApiError } from '@/lib/error-handler';
import { nextSequence } from '@/lib/sequence-generator';
import { todayStr } from '@/lib/localDate';

export const dynamic = 'force-dynamic';

/**
 * POST /api/inventory/stock-counts/import-excel
 * body: { rows: [{ productCode, productName, actualQty, warehouse, note }], warehouse, countDate }
 *
 * 建立一張盤點單（StockCount）含多個明細（StockCountItem）。
 * systemQty 從目前庫存快取取得，diff = actualQty - systemQty。
 */
export async function POST(request) {
  const auth = await requirePermission(PERMISSIONS.INVENTORY_EDIT);
  if (!auth.ok) return auth.response;

  try {
    const { rows, warehouse: whParam, countDate: cdParam } = await request.json();
    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: '無有效資料' }, { status: 400 });
    }

    const errors    = [];
    const today     = todayStr();
    const warehouse = whParam?.trim() || rows[0]?.warehouse?.trim() || '';
    const countDate = cdParam?.trim() || today;

    // 預載商品（代碼 → {id, currentQty}）
    const products = await prisma.product.findMany({
      select: { id: true, productCode: true, name: true },
    });
    const prodMap = Object.fromEntries(products.map(p => [p.productCode?.trim(), p]));

    // 預載庫存數量（productId+warehouse → qty）
    const inventoryRows = await prisma.inventoryItem.findMany({
      where:  warehouse ? { warehouse } : {},
      select: { productId: true, quantity: true, warehouse: true },
    });
    const invMap = Object.fromEntries(
      inventoryRows.map(i => [`${i.productId}||${i.warehouse}`, Number(i.quantity)])
    );

    const items = [];
    for (const r of rows) {
      const rowNum     = r._row ?? '?';
      const code       = r.productCode?.trim();
      const actualQty  = parseInt(r.actualQty);
      const rowWarehouse = r.warehouse?.trim() || warehouse;

      if (!code)               { errors.push({ row: rowNum, message: '商品代碼為必填' }); continue; }
      if (isNaN(actualQty))    { errors.push({ row: rowNum, message: '實際數量需為整數' }); continue; }

      const product = prodMap[code];
      if (!product) { errors.push({ row: rowNum, message: `找不到商品代碼「${code}」` }); continue; }

      const systemQty = invMap[`${product.id}||${rowWarehouse}`] ?? 0;
      items.push({
        productId: product.id,
        systemQty,
        actualQty,
        diff:      actualQty - systemQty,
        note:      r.note?.trim() || null,
      });
    }

    if (items.length === 0) {
      return NextResponse.json({ count: 0, errors });
    }

    let createdCount = 0;
    await prisma.$transaction(async tx => {
      const countNo = await nextSequence(tx, 'stockCount', 'countNo', `CNT-${countDate.replace(/-/g, '')}-`);
      await tx.stockCount.create({
      data: {
        countNo,
        warehouse,
        countDate,
        status: '已確認',
        type:   'count',
        items:  { create: items },
        },
      });
      createdCount = items.length;
    });

    return NextResponse.json({ count: createdCount, errors });
  } catch (error) {
    return handleApiError(error);
  }
}
