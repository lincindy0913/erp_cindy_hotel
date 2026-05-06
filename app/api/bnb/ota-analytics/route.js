/**
 * GET /api/bnb/ota-analytics?year=2026&warehouse=民宿
 *
 * 回傳 OTA 收入與傭金的綜合分析：
 *  - 按月份 × 來源拆分收入
 *  - 結合 BnbOtaCommission 傭金資料
 *  - 計算含傭金前/後的淨收入
 */
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { handleApiError } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

const OTA_SOURCES = ['Booking', 'Agoda', 'Expedia'];
const DIRECT_SOURCES = ['電話', '其他'];

export async function GET(request) {
  const auth = await requirePermission(PERMISSIONS.BNB_VIEW);
  if (!auth.ok) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const year      = parseInt(searchParams.get('year') || new Date().getFullYear());
    const warehouse = searchParams.get('warehouse') || '';

    const yearStart = `${year}-01`;
    const yearEnd   = `${year}-12`;

    // ── 1. 訂房記錄（按月份 × 來源）────────────────────────────
    const bookingWhere = {
      importMonth: { gte: yearStart, lte: yearEnd },
      status:      { not: '已刪除' },
    };
    if (warehouse) bookingWhere.warehouse = warehouse;

    const bookings = await prisma.bnbBookingRecord.findMany({
      where: bookingWhere,
      select: {
        importMonth: true,
        source:      true,
        roomCharge:  true,
        otherCharge: true,
      },
    });

    // ── 2. 傭金記錄 ────────────────────────────────────────────
    const commWhere = {
      commissionMonth: { gte: yearStart, lte: yearEnd },
      status: { not: '已取消' },
    };
    if (warehouse) commWhere.warehouse = warehouse;

    const commissions = await prisma.bnbOtaCommission.findMany({
      where: commWhere,
      select: {
        commissionMonth:  true,
        otaSource:        true,
        commissionAmount: true,
        status:           true,
      },
    });

    // ── 3. 按月彙整 ────────────────────────────────────────────
    const months = [];
    for (let m = 1; m <= 12; m++) {
      const monthKey = `${year}-${String(m).padStart(2, '0')}`;
      const mb = bookings.filter(b => b.importMonth === monthKey);
      const mc = commissions.filter(c => c.commissionMonth === monthKey);

      const otaBookings    = mb.filter(b => OTA_SOURCES.includes(b.source));
      const directBookings = mb.filter(b => !OTA_SOURCES.includes(b.source));

      const otaRevenue    = otaBookings.reduce((s, b)    => s + Number(b.roomCharge) + Number(b.otherCharge), 0);
      const directRevenue = directBookings.reduce((s, b) => s + Number(b.roomCharge) + Number(b.otherCharge), 0);
      const totalRevenue  = otaRevenue + directRevenue;

      const commTotal   = mc.reduce((s, c) => s + Number(c.commissionAmount), 0);
      const commPaid    = mc.filter(c => c.status === '已付款').reduce((s, c) => s + Number(c.commissionAmount), 0);
      const commPending = mc.filter(c => c.status === '待出納').reduce((s, c) => s + Number(c.commissionAmount), 0);

      months.push({
        month:               monthKey,
        totalBookings:       mb.length,
        totalRevenue:        Math.round(totalRevenue),
        otaBookings:         otaBookings.length,
        otaRevenue:          Math.round(otaRevenue),
        directBookings:      directBookings.length,
        directRevenue:       Math.round(directRevenue),
        commissionTotal:     Math.round(commTotal),
        commissionPaid:      Math.round(commPaid),
        commissionPending:   Math.round(commPending),
        netOtaRevenue:       Math.round(otaRevenue - commTotal),
        effectiveCommRate:   otaRevenue > 0 ? parseFloat((commTotal / otaRevenue * 100).toFixed(1)) : 0,
        otaPct:              totalRevenue > 0 ? parseFloat((otaRevenue / totalRevenue * 100).toFixed(1)) : 0,
      });
    }

    // ── 4. 按來源彙整 ──────────────────────────────────────────
    const sourceMap = {};
    for (const b of bookings) {
      const s = b.source || '其他';
      if (!sourceMap[s]) sourceMap[s] = { source: s, bookings: 0, revenue: 0 };
      sourceMap[s].bookings++;
      sourceMap[s].revenue += Number(b.roomCharge) + Number(b.otherCharge);
    }
    // 合入傭金（僅 OTA 來源）
    for (const c of commissions) {
      const s = c.otaSource;
      if (!sourceMap[s]) sourceMap[s] = { source: s, bookings: 0, revenue: 0 };
      sourceMap[s].commission = (sourceMap[s].commission || 0) + Number(c.commissionAmount);
    }
    const bySource = Object.values(sourceMap).map(s => ({
      ...s,
      revenue:       Math.round(s.revenue),
      commission:    Math.round(s.commission || 0),
      netRevenue:    Math.round(s.revenue - (s.commission || 0)),
      commissionRate: s.revenue > 0 ? parseFloat(((s.commission || 0) / s.revenue * 100).toFixed(1)) : 0,
      isOta:         OTA_SOURCES.includes(s.source),
    })).sort((a, b) => b.revenue - a.revenue);

    // ── 5. 年度合計 ────────────────────────────────────────────
    const totals = months.reduce((acc, m) => {
      acc.totalBookings    += m.totalBookings;
      acc.totalRevenue     += m.totalRevenue;
      acc.otaBookings      += m.otaBookings;
      acc.otaRevenue       += m.otaRevenue;
      acc.directRevenue    += m.directRevenue;
      acc.commissionTotal  += m.commissionTotal;
      acc.commissionPaid   += m.commissionPaid;
      acc.commissionPending+= m.commissionPending;
      acc.netOtaRevenue    += m.netOtaRevenue;
      return acc;
    }, {
      totalBookings: 0, totalRevenue: 0, otaBookings: 0,
      otaRevenue: 0, directRevenue: 0, commissionTotal: 0,
      commissionPaid: 0, commissionPending: 0, netOtaRevenue: 0,
    });
    totals.avgCommRate = totals.otaRevenue > 0
      ? parseFloat((totals.commissionTotal / totals.otaRevenue * 100).toFixed(1))
      : 0;
    totals.otaPct = totals.totalRevenue > 0
      ? parseFloat((totals.otaRevenue / totals.totalRevenue * 100).toFixed(1))
      : 0;

    return NextResponse.json({ year, months, bySource, totals });
  } catch (error) {
    return handleApiError(error);
  }
}
