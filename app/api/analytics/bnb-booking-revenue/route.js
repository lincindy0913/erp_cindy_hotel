/**
 * GET /api/analytics/bnb-booking-revenue?year=YYYY&month=M&warehouse=自在海
 *
 * 民宿「月報房收」——依【入住月份(importMonth)】彙總訂房記錄的房費+消費(應收/營運口徑)，
 * 供決策分析「即時損益」等現金基準報表旁邊對照用（非現金流基準）。
 */
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { handleApiError } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const auth = await requirePermission(PERMISSIONS.ANALYTICS_VIEW);
  if (!auth.ok) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const year  = parseInt(searchParams.get('year') || new Date().getFullYear(), 10);
    const month = parseInt(searchParams.get('month') || (new Date().getMonth() + 1), 10);
    const warehouse = searchParams.get('warehouse') || null;
    const importMonth = `${year}-${String(month).padStart(2, '0')}`;

    const where = {
      importMonth,
      deletedAt: null,
      status: { not: '已刪除' },
    };
    if (warehouse) where.warehouse = warehouse;

    const rows = await prisma.bnbBookingRecord.findMany({
      where,
      select: { roomCharge: true, otherCharge: true, cardFee: true },
    });

    let roomCharge = 0, otherCharge = 0, cardFee = 0;
    for (const r of rows) {
      roomCharge  += Number(r.roomCharge  || 0);
      otherCharge += Number(r.otherCharge || 0);
      cardFee     += Number(r.cardFee     || 0);
    }
    // 與民宿帳月報「淨收入」口徑一致：房費 + 消費 − 刷卡手續費
    const netRevenue = roomCharge + otherCharge - cardFee;

    return NextResponse.json({
      importMonth,
      warehouse: warehouse || null,
      rooms: rows.length,
      roomCharge,
      otherCharge,
      cardFee,
      netRevenue,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
