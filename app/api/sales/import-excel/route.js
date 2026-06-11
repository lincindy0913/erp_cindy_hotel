import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { nextSequence } from '@/lib/sequence-generator';
import { todayStr } from '@/lib/localDate';

export const dynamic = 'force-dynamic';

/**
 * POST /api/sales/import-excel
 * body: { rows: [{ invoiceNo, invoiceDate, invoiceTitle, amount, tax, totalAmount, taxType, warehouse, note }] }
 *
 * 批次匯入發票開立報表（銷項發票）。
 * 相同 invoiceNo + invoiceDate 的列視為重複並跳過（冪等）。
 * invoiceType 固定為「銷項發票」；每筆建立一個空 SalesDetail 佔位。
 */
export async function POST(request) {
  const auth = await requirePermission(PERMISSIONS.SALES_CREATE);
  if (!auth.ok) return auth.response;

  try {
    const { rows } = await request.json();
    if (!Array.isArray(rows) || rows.length === 0) {
      return createErrorResponse('VALIDATION_FAILED', '無有效資料', 400);
    }

    const errors  = [];
    let created  = 0;
    let skipped  = 0;

    // 預載已存在的 invoiceNo 集合（同日+號碼判重）
    const invoiceNos = rows.map(r => r.invoiceNo?.trim()).filter(Boolean);
    const existing = await prisma.salesMaster.findMany({
      where: { invoiceNo: { in: invoiceNos }, invoiceType: '銷項發票' },
      select: { invoiceNo: true, invoiceDate: true },
    });
    const existingKeys = new Set(existing.map(e => `${e.invoiceNo}|${e.invoiceDate}`));

    for (const r of rows) {
      const rowNum      = r._row ?? '?';
      const invoiceNo   = r.invoiceNo?.toString().trim();
      const invoiceDate = r.invoiceDate?.toString().trim() || todayStr();
      const invoiceTitle= r.invoiceTitle?.toString().trim() || null;
      const taxType     = r.taxType?.toString().trim() || '應稅';
      const warehouse   = r.warehouse?.toString().trim() || null;
      const note        = r.note?.toString().trim() || null;

      if (!invoiceNo) { errors.push({ row: rowNum, message: '發票號碼為必填' }); continue; }

      const amount      = parseFloat(r.amount)      || 0;
      const tax         = parseFloat(r.tax)         || 0;
      const totalAmount = parseFloat(r.totalAmount) || (amount + tax);

      if (isNaN(amount)) { errors.push({ row: rowNum, message: '銷售額需為有效數字' }); continue; }

      const dupKey = `${invoiceNo}|${invoiceDate}`;
      if (existingKeys.has(dupKey)) { skipped++; continue; }
      existingKeys.add(dupKey); // 避免同批次重複

      const today   = todayStr().replace(/-/g, '');
      const salesNo = await nextSequence(prisma, 'salesMaster', 'salesNo', `INV-${today}-`);

      await prisma.salesMaster.create({
        data: {
          salesNo,
          invoiceNo,
          invoiceDate,
          invoiceTitle,
          invoiceType: '銷項發票',
          taxType,
          amount,
          tax,
          totalAmount,
          status: '待核銷',
          details: {
            create: [{ purchaseItemId: '', warehouse, note }],
          },
        },
      });
      created++;
    }

    return NextResponse.json({ count: created, skipped, errors });
  } catch (error) {
    return handleApiError(error);
  }
}
