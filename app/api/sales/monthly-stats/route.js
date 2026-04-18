/**
 * GET /api/sales/monthly-stats?year=2026
 * 依月份 × 館別彙整進項發票金額（來源：SalesMaster + SalesDetail）
 */
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { handleApiError } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const auth = await requirePermission(PERMISSIONS.SALES_VIEW);
  if (!auth.ok) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const year = searchParams.get('year') || new Date().getFullYear().toString();

    // 查詢該年度所有發票 + 明細
    const masters = await prisma.salesMaster.findMany({
      where: { invoiceDate: { startsWith: year } },
      select: {
        id: true,
        invoiceDate: true,
        invoiceTitle: true,
        totalAmount: true,
        invoiceNo: true,
        details: {
          select: { warehouse: true, subtotal: true },
        },
      },
      orderBy: { invoiceDate: 'asc' },
    });

    // 建立月份 × 館別 × 抬頭 彙整
    const monthMap = {};      // month → { total, byWarehouse: { wh → amount }, byTitle: { title → amount } }
    const warehouseSet = new Set();
    const titleSet = new Set();

    for (const m of masters) {
      const month = m.invoiceDate.substring(0, 7);
      const title = m.invoiceTitle || '未分類';
      const total = Number(m.totalAmount || 0);
      titleSet.add(title);

      if (!monthMap[month]) {
        monthMap[month] = { month, total: 0, byWarehouse: {}, byTitle: {}, invoiceCount: 0 };
      }
      monthMap[month].total += total;
      monthMap[month].invoiceCount += 1;
      monthMap[month].byTitle[title] = (monthMap[month].byTitle[title] || 0) + total;

      // 依明細館別分攤
      const details = m.details.filter(d => d.warehouse && Number(d.subtotal || 0) > 0);
      if (details.length > 0) {
        for (const d of details) {
          const wh = d.warehouse;
          const amt = Number(d.subtotal || 0);
          warehouseSet.add(wh);
          monthMap[month].byWarehouse[wh] = (monthMap[month].byWarehouse[wh] || 0) + amt;
        }
      } else {
        // 無明細館別資訊：計入「未分類」
        const wh = '未分類';
        warehouseSet.add(wh);
        monthMap[month].byWarehouse[wh] = (monthMap[month].byWarehouse[wh] || 0) + total;
      }
    }

    const warehouses = [...warehouseSet].sort();
    const titles = [...titleSet].sort();
    const rows = Object.values(monthMap).sort((a, b) => a.month.localeCompare(b.month));

    // 年度合計行
    const yearTotal = { byWarehouse: {}, byTitle: {}, total: 0, invoiceCount: 0 };
    for (const r of rows) {
      yearTotal.total += r.total;
      yearTotal.invoiceCount += r.invoiceCount;
      for (const wh of warehouses) {
        yearTotal.byWarehouse[wh] = (yearTotal.byWarehouse[wh] || 0) + (r.byWarehouse[wh] || 0);
      }
      for (const t of titles) {
        yearTotal.byTitle[t] = (yearTotal.byTitle[t] || 0) + (r.byTitle[t] || 0);
      }
    }

    return NextResponse.json({ year, rows, warehouses, titles, yearTotal });
  } catch (error) {
    return handleApiError(error);
  }
}
