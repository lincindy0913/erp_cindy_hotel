/**
 * GET /api/bnb/actual-stats?month=2026-03&warehouse=民宿
 *
 * 從 BnbBookingRecord 計算該月實際營業數據（不含已刪除）
 * 回傳：間數、房費合計、消費合計、刷卡、現金、訂金、住宿卷、手續費、各來源筆數
 */
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const auth = await requirePermission(PERMISSIONS.BNB_VIEW);
  if (!auth.ok) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const month     = searchParams.get('month');
    const warehouse = searchParams.get('warehouse') || '';

    if (!month) return createErrorResponse('REQUIRED_FIELD_MISSING', '缺少 month 參數', 400);

    const where = {
      importMonth: month,
      status: { notIn: ['已刪除'] },
    };
    if (warehouse) where.warehouse = warehouse;

    const bookings = await prisma.bnbBookingRecord.findMany({
      where,
      select: {
        roomCharge: true, otherCharge: true,
        payDeposit: true, payTransfer: true, payCard: true, payCash: true, payVoucher: true,
        cardFee: true, source: true,
        checkInDate: true, checkOutDate: true,
      },
    });

    const stats = {
      roomCount: bookings.length,
      roomNights: 0,
      roomChargeTotal: 0,
      otherChargeTotal: 0,
      payDeposit: 0,
      payTransfer: 0,
      payCard: 0,
      payCash: 0,
      payVoucher: 0,
      cardFee: 0,
      sourceBooking: 0,
      sourcePhone: 0,
      sourceOther: 0,
    };

    for (const b of bookings) {
      stats.roomChargeTotal += Number(b.roomCharge);
      stats.otherChargeTotal += Number(b.otherCharge);
      stats.payDeposit  += Number(b.payDeposit);
      stats.payTransfer += Number(b.payTransfer);
      stats.payCard += Number(b.payCard);
      stats.payCash += Number(b.payCash);
      stats.payVoucher += Number(b.payVoucher);
      stats.cardFee += Number(b.cardFee);
      if (b.source === 'Booking') stats.sourceBooking++;
      else if (b.source === '電話') stats.sourcePhone++;
      else stats.sourceOther++;

      if (b.checkInDate && b.checkOutDate) {
        const inD = new Date(b.checkInDate + 'T00:00:00');
        const outD = new Date(b.checkOutDate + 'T00:00:00');
        const nights = Math.max(1, Math.round((outD - inD) / 86400000));
        stats.roomNights += nights;
      } else {
        stats.roomNights += 1;
      }
    }

    stats.revenueTotal = stats.roomChargeTotal + stats.otherChargeTotal;
    stats.avgRoomRate = stats.roomCount > 0
      ? Math.round(stats.roomChargeTotal / stats.roomCount)
      : 0;

    const totalSrc = stats.sourceBooking + stats.sourcePhone + stats.sourceOther;
    stats.businessSourceAuto = totalSrc > 0
      ? [
          stats.sourceBooking > 0 ? `Booking ${Math.round(stats.sourceBooking / totalSrc * 100)}%` : '',
          stats.sourcePhone > 0   ? `電話 ${Math.round(stats.sourcePhone / totalSrc * 100)}%`     : '',
          stats.sourceOther > 0   ? `其他 ${Math.round(stats.sourceOther / totalSrc * 100)}%`     : '',
        ].filter(Boolean).join('、')
      : '';

    return NextResponse.json(stats);
  } catch (error) {
    return handleApiError(error);
  }
}
