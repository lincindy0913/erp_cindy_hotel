/**
 * GET /api/bnb/declaration-list?year=2025&warehouse=民宿
 *
 * 回傳該年度 12 個月的旅宿網申報資料：
 *   - 從 BnbBookingRecord 自動計算：刷卡總計、房價金額、每月間數
 *   - 從 BnbMonthlyReport 取得手動填寫值（手動值優先）
 */
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { handleApiError } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const auth = await requirePermission(PERMISSIONS.BNB_VIEW);
  if (!auth.ok) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const year      = searchParams.get('year') || new Date().getFullYear().toString();
    const warehouse = searchParams.get('warehouse') || '';

    const bookingWhere = {
      importMonth: { startsWith: year },
      status: { notIn: ['已刪除'] },
    };
    if (warehouse) bookingWhere.warehouse = warehouse;

    const bookings = await prisma.bnbBookingRecord.findMany({
      where: bookingWhere,
      select: {
        importMonth: true,
        roomCharge: true, otherCharge: true,
        payCard: true, cardFee: true,
      },
    });

    const reportWhere = { reportMonth: { startsWith: year } };
    if (warehouse) reportWhere.warehouse = warehouse;
    const reports = await prisma.bnbMonthlyReport.findMany({ where: reportWhere });
    const reportMap = new Map(reports.map(r => [r.reportMonth, r]));

    const computed = {};
    for (const b of bookings) {
      const m = b.importMonth;
      if (!computed[m]) computed[m] = { cardTotal: 0, roomPriceTotal: 0, roomCount: 0 };
      computed[m].cardTotal      += Number(b.payCard);
      computed[m].roomPriceTotal += Number(b.roomCharge) + Number(b.otherCharge);
      computed[m].roomCount++;
    }

    const rows = [];
    for (let i = 1; i <= 12; i++) {
      const mm = `${year}-${String(i).padStart(2, '0')}`;
      const rpt = reportMap.get(mm);
      const calc = computed[mm] || { cardTotal: 0, roomPriceTotal: 0, roomCount: 0 };

      rows.push({
        month: mm,
        monthLabel: `${i}月`,
        cardTotal:        rpt?.cardTotal        != null ? Number(rpt.cardTotal)        : Math.round(calc.cardTotal),
        roomPriceTotal:   rpt?.roomPriceTotal   != null ? Number(rpt.roomPriceTotal)   : Math.round(calc.roomPriceTotal),
        subsidizedRooms:  rpt?.subsidizedRooms  ?? null,
        avgRoomRate:      rpt?.avgRoomRate      != null ? Number(rpt.avgRoomRate)      : null,
        monthlyRoomCount: rpt?.monthlyRoomCount != null ? rpt.monthlyRoomCount         : calc.roomCount,
        roomSuppliesCost: rpt?.roomSuppliesCost != null ? Number(rpt.roomSuppliesCost) : null,
        fbExpense:        rpt?.fbExpense        != null ? Number(rpt.fbExpense)        : null,
        fitGuestCount:    rpt?.fitGuestCount    ?? null,
        staffCount:       rpt?.staffCount       ?? null,
        salary:           rpt?.salary           != null ? Number(rpt.salary)           : null,
        businessSource:   rpt?.businessSource   || '',
        otherIncome:      rpt?.otherIncome      != null ? Number(rpt.otherIncome)      : 0,
        otherIncomeNote:  rpt?.otherIncomeNote  || '',
        note:             rpt?.note             || '',
        hasReport:        !!rpt,
        calcCardTotal:    Math.round(calc.cardTotal),
        calcRoomPrice:    Math.round(calc.roomPriceTotal),
        calcRoomCount:    calc.roomCount,
      });
    }

    return NextResponse.json({ year, rows });
  } catch (error) {
    return handleApiError(error);
  }
}
