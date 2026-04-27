/**
 * GET /api/sales/monthly-stats?startMonth=2026-01&endMonth=2026-12&warehouse=
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
    const thisYear = new Date().getFullYear().toString();
    const startMonth = searchParams.get('startMonth') || `${thisYear}-01`;
    const endMonth   = searchParams.get('endMonth')   || `${thisYear}-12`;
    const warehouse  = searchParams.get('warehouse')  || '';

    // 轉換成日期範圍（YYYY-MM-DD 字串比較）
    const startDate = `${startMonth}-01`;
    const endDate   = `${endMonth}-31`;   // VarChar 比較：YYYY-MM-31 > 任何 YYYY-MM-DD

    const where = {
      invoiceDate: { gte: startDate, lte: endDate },
    };

    const [masters, allowanceRecords] = await Promise.all([
      prisma.salesMaster.findMany({
        where,
        select: {
          id: true,
          invoiceDate: true,
          invoiceTitle: true,
          invoiceNo: true,
          invoiceType: true,
          totalAmount: true,
          details: {
            select: { warehouse: true, subtotal: true },
          },
        },
        orderBy: { invoiceDate: 'asc' },
      }),
      prisma.purchaseAllowance.findMany({
        where: {
          status: '已確認',
          allowanceDate: { gte: startDate, lte: endDate },
          ...(warehouse ? { warehouse } : {}),
        },
        select: { allowanceDate: true, warehouse: true, totalAmount: true },
      }),
    ]);

    // 月份 × 館別 × 抬頭 彙整
    const monthMap = {};
    const warehouseSet = new Set();
    const titleSet = new Set();

    // 業主私帳：獨立統計，不影響一般合計
    const privateMap = {}; // month → { month, total, invoiceCount, byWarehouse }

    for (const m of masters) {
      const month = m.invoiceDate.substring(0, 7);
      const title = m.invoiceTitle || '未分類';
      const total = Number(m.totalAmount || 0);
      const isPrivate = m.invoiceType === '業主私帳';

      if (isPrivate) {
        // 業主私帳走獨立 map（同樣計入 monthMap.total，但也記錄到 privateMap）
        if (!privateMap[month]) privateMap[month] = { month, total: 0, invoiceCount: 0, byWarehouse: {} };
        privateMap[month].total += total;
        privateMap[month].invoiceCount += 1;
        const details = m.details.filter(d => d.warehouse && Number(d.subtotal || 0) > 0);
        if (details.length > 0) {
          for (const d of details) {
            const wh = d.warehouse;
            privateMap[month].byWarehouse[wh] = (privateMap[month].byWarehouse[wh] || 0) + Number(d.subtotal);
          }
        } else {
          const wh = '未分類';
          privateMap[month].byWarehouse[wh] = (privateMap[month].byWarehouse[wh] || 0) + total;
        }
      }

      // 仍加入一般統計（業主私帳也計入 monthMap，符合 C 選項需求）
      titleSet.add(title);
      if (!monthMap[month]) {
        monthMap[month] = { month, total: 0, byWarehouse: {}, byTitle: {}, invoiceCount: 0, allowanceTotal: 0 };
      }
      monthMap[month].total += total;
      monthMap[month].invoiceCount += 1;
      monthMap[month].byTitle[title] = (monthMap[month].byTitle[title] || 0) + total;

      const details = m.details.filter(d => d.warehouse && Number(d.subtotal || 0) > 0);
      if (details.length > 0) {
        for (const d of details) {
          warehouseSet.add(d.warehouse);
          monthMap[month].byWarehouse[d.warehouse] = (monthMap[month].byWarehouse[d.warehouse] || 0) + Number(d.subtotal);
        }
      } else {
        warehouseSet.add('未分類');
        monthMap[month].byWarehouse['未分類'] = (monthMap[month].byWarehouse['未分類'] || 0) + total;
      }
    }

    // 扣除已確認折讓
    for (const a of allowanceRecords) {
      const month = a.allowanceDate.substring(0, 7);
      const wh = a.warehouse || '未分類';
      const amt = Number(a.totalAmount || 0);
      warehouseSet.add(wh);
      if (!monthMap[month]) {
        monthMap[month] = { month, total: 0, byWarehouse: {}, byTitle: {}, invoiceCount: 0, allowanceTotal: 0 };
      }
      monthMap[month].total -= amt;
      monthMap[month].allowanceTotal += amt;
      monthMap[month].byWarehouse[wh] = (monthMap[month].byWarehouse[wh] || 0) - amt;
    }

    let warehouses = [...warehouseSet].sort();
    let rows = Object.values(monthMap).sort((a, b) => a.month.localeCompare(b.month));

    // 前端若有選館別，篩選對應欄位
    if (warehouse) {
      rows = rows.map(r => ({
        ...r,
        total: r.byWarehouse[warehouse] || 0,
        byWarehouse: { [warehouse]: r.byWarehouse[warehouse] || 0 },
        invoiceCount: r.invoiceCount, // 保留月份張數
      })).filter(r => r.total > 0);
      warehouses = [warehouse];
    }

    // 合計行
    const periodTotal = { byWarehouse: {}, byTitle: {}, total: 0, invoiceCount: 0, allowanceTotal: 0 };
    for (const r of rows) {
      periodTotal.total += r.total;
      periodTotal.invoiceCount += r.invoiceCount;
      periodTotal.allowanceTotal += (r.allowanceTotal || 0);
      for (const wh of warehouses) {
        periodTotal.byWarehouse[wh] = (periodTotal.byWarehouse[wh] || 0) + (r.byWarehouse[wh] || 0);
      }
    }
    // byTitle 合計（不受 warehouse filter 影響，顯示全部抬頭佔比）
    const titles = [...titleSet].sort();
    for (const m of masters) {
      const title = m.invoiceTitle || '未分類';
      const total = Number(m.totalAmount || 0);
      periodTotal.byTitle[title] = (periodTotal.byTitle[title] || 0) + total;
    }

    // 業主私帳彙整
    const privateRows = Object.values(privateMap).sort((a, b) => a.month.localeCompare(b.month));
    const privateTotal = privateRows.reduce(
      (acc, r) => { acc.total += r.total; acc.invoiceCount += r.invoiceCount; return acc; },
      { total: 0, invoiceCount: 0 }
    );

    return NextResponse.json({
      startMonth, endMonth, warehouse,
      rows, warehouses, titles,
      periodTotal,
      private: { rows: privateRows, total: privateTotal },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
