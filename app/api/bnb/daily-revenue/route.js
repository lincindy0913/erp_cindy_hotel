/**
 * GET /api/bnb/daily-revenue?month=2026-03&warehouse=民宿
 *
 * 回傳該月 1~31 日的每日收入彙總（依入住日期分組）
 * 每日包含：筆數、房費、消費、訂金、刷卡、現金、住宿卷、手續費、合計
 * 以及整月合計
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

    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return createErrorResponse('REQUIRED_FIELD_MISSING', '缺少或格式錯誤的 month 參數 (YYYY-MM)', 400);
    }

    const where = {
      importMonth: month,
      status: { notIn: ['已刪除'] },
    };
    if (warehouse) where.warehouse = warehouse;

    const bookings = await prisma.bnbBookingRecord.findMany({
      where,
      select: {
        checkInDate: true,
        source: true,
        guestName: true,
        roomNo: true,
        roomCharge: true,
        otherCharge: true,
        payDeposit: true,
        payCard: true,
        payCash: true,
        payVoucher: true,
        cardFee: true,
      },
      orderBy: [{ checkInDate: 'asc' }, { id: 'asc' }],
    });

    const [yyyy, mm] = month.split('-');
    const daysInMonth = new Date(parseInt(yyyy), parseInt(mm), 0).getDate();

    const dailyMap = {};
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${month}-${String(d).padStart(2, '0')}`;
      dailyMap[dateStr] = {
        date: dateStr,
        day: d,
        count: 0,
        roomCharge: 0,
        otherCharge: 0,
        payDeposit: 0,
        payCard: 0,
        payCash: 0,
        payVoucher: 0,
        cardFee: 0,
        bookings: [],
      };
    }

    for (const b of bookings) {
      const date = b.checkInDate;
      if (!dailyMap[date]) continue;
      const entry = dailyMap[date];
      entry.count++;
      entry.roomCharge  += Number(b.roomCharge);
      entry.otherCharge += Number(b.otherCharge);
      entry.payDeposit  += Number(b.payDeposit);
      entry.payCard     += Number(b.payCard);
      entry.payCash     += Number(b.payCash);
      entry.payVoucher  += Number(b.payVoucher);
      entry.cardFee     += Number(b.cardFee);
      entry.bookings.push({
        source: b.source,
        guestName: b.guestName,
        roomNo: b.roomNo,
        roomCharge: Number(b.roomCharge),
      });
    }

    const days = Object.values(dailyMap).sort((a, b) => a.day - b.day);

    const totals = days.reduce((acc, d) => ({
      count:       acc.count       + d.count,
      roomCharge:  acc.roomCharge  + d.roomCharge,
      otherCharge: acc.otherCharge + d.otherCharge,
      payDeposit:  acc.payDeposit  + d.payDeposit,
      payCard:     acc.payCard     + d.payCard,
      payCash:     acc.payCash     + d.payCash,
      payVoucher:  acc.payVoucher  + d.payVoucher,
      cardFee:     acc.cardFee     + d.cardFee,
    }), { count: 0, roomCharge: 0, otherCharge: 0, payDeposit: 0, payCard: 0, payCash: 0, payVoucher: 0, cardFee: 0 });

    return NextResponse.json({ month, daysInMonth, days, totals });
  } catch (error) {
    return handleApiError(error);
  }
}
