import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAnyPermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import { handleApiError } from '@/lib/error-handler';

export const dynamic = 'force-dynamic';

const OTA_SOURCES = [
  'OTA-Booking', 'OTA-Agoda', 'OTA-Expedia',
  'OTA-易遊網', 'OTA-MOMO', 'OTA-Klook',
  'OTA-KKday', 'OTA-雄獅', 'OTA-可樂旅遊', '代訂中心',
];

/**
 * GET /api/pms-income/ota-trend?warehouse=X&months=6
 *
 * 回傳最近 N 個月各 OTA 來源的收入彙總（groupBy，單次 DB 查詢）
 * Response: [{ month: "YYYY-MM", "OTA-Booking": 12000, "OTA-Agoda": 8000, ... }, ...]
 */
export async function GET(request) {
  const auth = await requireAnyPermission([PERMISSIONS.PMS_VIEW, PERMISSIONS.PMS_IMPORT]);
  if (!auth.ok) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const warehouse = searchParams.get('warehouse') || '';
    const months    = Math.min(Math.max(parseInt(searchParams.get('months') || '6', 10), 1), 24);

    // 計算起始月份
    const startDate = new Date();
    startDate.setDate(1);
    startDate.setMonth(startDate.getMonth() - (months - 1));
    const startStr = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}-01`;

    // 一次 groupBy 查詢，取得起始月份至今所有 OTA 訂房的月份×來源彙總
    const groups = await prisma.pmsReservationRecord.groupBy({
      by:    ['businessDate', 'source'],
      where: {
        ...(warehouse ? { warehouse } : {}),
        OR: [
          { source:         { in: OTA_SOURCES } },
          { sourceOverride: { in: OTA_SOURCES } },
        ],
        totalRevenue: { gt: 0 },
        businessDate: { gte: startStr },
      },
      _sum: { totalRevenue: true, commission: true },
    });

    // 建立月份清單
    const monthList = [];
    for (let i = months - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(1);
      d.setMonth(d.getMonth() - i);
      monthList.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }

    // 彙總 groupBy 結果 → month → source → totalRevenue
    const agg = {};  // agg[month][source] = { revenue, commission }
    for (const g of groups) {
      const month  = g.businessDate.slice(0, 7);
      const source = g.source; // sourceOverride 已在 OTA_SOURCES 範圍內
      if (!monthList.includes(month)) continue;
      if (!agg[month]) agg[month] = {};
      if (!agg[month][source]) agg[month][source] = { revenue: 0, commission: 0 };
      agg[month][source].revenue    += Number(g._sum.totalRevenue ?? 0);
      agg[month][source].commission += Number(g._sum.commission   ?? 0);
    }

    // 組出最終 response 陣列
    const result = monthList.map(month => {
      const entry = { month };
      let total = 0;
      for (const src of OTA_SOURCES) {
        const v = agg[month]?.[src];
        entry[src]              = v ? Math.round(v.revenue)    : 0;
        entry[src + '_comm']    = v ? Math.round(v.commission) : 0;
        total += entry[src];
      }
      entry._total = total;
      return entry;
    });

    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}
