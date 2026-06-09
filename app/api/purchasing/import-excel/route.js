import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { nextSequence } from '@/lib/sequence-generator';
import { todayStr } from '@/lib/localDate';

export const dynamic = 'force-dynamic';

/**
 * POST /api/purchasing/import-excel
 * body: { rows: [{ date, supplierName, productCode, productName, qty, unitPrice, taxed, warehouse }] }
 *
 * 相同 date+supplier 的列自動合併為一張進貨單（含多個明細）。
 * 找不到廠商→跳過並回報錯誤；找不到商品代碼→自動建立（name 匯入即可）。
 */
export async function POST(request) {
  const auth = await requirePermission(PERMISSIONS.PURCHASING_CREATE);
  if (!auth.ok) return auth.response;

  try {
    const { rows } = await request.json();
    if (!Array.isArray(rows) || rows.length === 0) {
      return createErrorResponse('VALIDATION_FAILED', '無有效資料', 400);
    }

    const errors  = [];
    let   created = 0;
    const today   = todayStr();

    // 預載所有廠商（名稱 → id 對照）
    const suppliers = await prisma.supplier.findMany({ select: { id: true, name: true } });
    const supMap    = Object.fromEntries(suppliers.map(s => [s.name.trim(), s.id]));

    // 預載所有商品（Product.code → id 對照）
    const products  = await prisma.product.findMany({ select: { id: true, code: true, name: true } });
    const prodMap   = Object.fromEntries(products.map(p => [p.code?.trim(), p.id]));

    // 按 date+supplier 分組
    const groups = {};
    rows.forEach((r, i) => {
      const key = `${r.date?.trim() || today}||${r.supplierName?.trim() || ''}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push({ ...r, _row: r._row ?? (i + 4) });
    });

    await prisma.$transaction(async tx => {
      for (const [key, gRows] of Object.entries(groups)) {
        const [date, supplierName] = key.split('||');
        const supplierId = supMap[supplierName];

        if (!supplierId) {
          gRows.forEach(r => errors.push({ row: r._row, message: `廠商「${supplierName}」不存在，請先至廠商管理新增` }));
          continue;
        }

        const warehouse = gRows[0].warehouse?.trim() || '';
        const taxType   = gRows[0].taxed === '是' || gRows[0].taxed === 'true' || gRows[0].taxed === '1' ? '含稅' : '未稅';

        // 計算金額
        const items = [];
        let totalAmount = 0;
        let totalTax    = 0;

        for (const r of gRows) {
          const qty       = parseFloat(r.qty) || 0;
          const unitPrice = parseFloat(r.unitPrice) || 0;
          if (qty <= 0 || unitPrice <= 0) {
            errors.push({ row: r._row, message: '數量和單價必須大於 0' });
            continue;
          }

          // 尋找或建立商品
          let productId = prodMap[r.productCode?.trim()];
          if (!productId && r.productName?.trim()) {
            // 新商品：建立基本記錄
            const newProd = await tx.product.create({
              data: {
                code:     r.productCode?.trim() || `IMP-${Date.now()}`,
                name:     r.productName.trim(),
                unit:     r.unit?.trim() || '個',
                category: r.category?.trim() || '未分類',
              },
            });
            productId = newProd.id;
            prodMap[r.productCode?.trim()] = productId;
          }
          if (!productId) {
            errors.push({ row: r._row, message: `找不到商品代碼「${r.productCode}」且未提供商品名稱` });
            continue;
          }

          const subtotal = Math.round(qty * unitPrice * 100) / 100;
          const tax      = taxType === '含稅' ? Math.round(subtotal / 1.05 * 0.05 * 100) / 100 : 0;
          totalAmount   += subtotal;
          totalTax      += tax;
          items.push({ productId, qty, unitPrice, subtotal, tax });
        }

        if (items.length === 0) continue;

        const prefix    = `PUR-${date.replace(/-/g, '')}-`;
        const purchaseNo = await nextSequence(tx, 'purchaseMaster', 'purchaseNo', prefix);

        await tx.purchaseMaster.create({
          data: {
            purchaseNo,
            warehouse,
            supplierId,
            purchaseDate: date,
            taxType,
            amount:      totalAmount,
            tax:         totalTax,
            totalAmount: totalAmount + totalTax,
            status:      '待入庫',
            details: {
              create: items.map(it => ({
                productId:   it.productId,
                quantity:    it.qty,
                unitPrice:   it.unitPrice,
                subtotal:    it.subtotal,
                tax:         it.tax,
                totalAmount: it.subtotal + it.tax,
                warehouse,
                receivedQty: 0,
              })),
            },
          },
        });
        created++;
      }
    });

    return NextResponse.json({ count: created, errors });
  } catch (error) {
    return handleApiError(error);
  }
}
