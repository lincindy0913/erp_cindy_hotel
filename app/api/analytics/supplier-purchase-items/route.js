/**
 * GET /api/analytics/supplier-purchase-items
 *
 * 廠商採購品項明細查詢 — 依廠商 + 日期區間展開為逐筆品項清單
 *
 * Query params:
 *   supplierId  (optional) — 限定廠商 ID
 *   startDate   (optional) — 進貨日期起始 YYYY-MM-DD
 *   endDate     (optional) — 進貨日期結束 YYYY-MM-DD
 *   warehouse   (optional) — 館別
 */

import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { handleApiError } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import { applyWarehouseFilter } from '@/lib/warehouse-access';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const auth = await requirePermission(PERMISSIONS.PURCHASING_VIEW);
  if (!auth.ok) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const supplierId = searchParams.get('supplierId');
    const startDate  = searchParams.get('startDate');
    const endDate    = searchParams.get('endDate');
    const warehouse  = searchParams.get('warehouse');

    const where = {};
    if (supplierId) where.supplierId = parseInt(supplierId);
    if (startDate || endDate) {
      where.purchaseDate = {};
      if (startDate) where.purchaseDate.gte = startDate;
      if (endDate)   where.purchaseDate.lte = endDate;
    }
    if (warehouse) where.warehouse = warehouse;

    // Apply warehouse-level access control
    const wf = applyWarehouseFilter(auth.session, where);
    if (!wf.ok) return wf.response;

    const purchases = await prisma.purchaseMaster.findMany({
      where,
      include: {
        supplier: { select: { id: true, name: true } },
        details: {
          include: {
            product: {
              select: { id: true, code: true, name: true, unit: true, category: true },
            },
          },
        },
      },
      orderBy: [{ purchaseDate: 'asc' }, { id: 'asc' }],
      take: 10000,
    });

    // Flatten to item level
    const rows = [];
    for (const p of purchases) {
      for (const d of p.details) {
        const subtotal = Number(d.unitPrice) * d.quantity;
        rows.push({
          purchaseDate: p.purchaseDate,
          purchaseNo:   p.purchaseNo,
          warehouse:    p.warehouse    || '',
          department:   p.department   || '',
          supplierId:   p.supplierId,
          supplierName: p.supplier?.name || '',
          productId:    d.productId,
          productCode:  d.product?.code     || '',
          productName:  d.product?.name     || '',
          unit:         d.product?.unit     || '',
          category:     d.product?.category || '',
          quantity:     d.quantity,
          unitPrice:    Number(d.unitPrice),
          subtotal,
          note:         d.note || '',
        });
      }
    }

    const totalAmount = rows.reduce((s, r) => s + r.subtotal,  0);
    const totalQty    = rows.reduce((s, r) => s + r.quantity, 0);

    return NextResponse.json({ rows, totalAmount, totalQty, count: rows.length });
  } catch (error) {
    return handleApiError(error);
  }
}
