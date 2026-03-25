import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import { applyWarehouseFilter } from '@/lib/warehouse-access';

export const dynamic = 'force-dynamic';

/**
 * 館別營運指標：住宿人數、早餐人數、住宿間數（來自 PMS 匯入批次）
 * Query: startDate, endDate, warehouse (optional), groupBy=day|month
 */
export async function GET(request) {
  const auth = await requirePermission(PERMISSIONS.ANALYTICS_VIEW);
  if (!auth.ok) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const warehouse = searchParams.get('warehouse') || null;
    const groupBy = searchParams.get('groupBy') || 'day';

    if (!startDate || !endDate) {
      return createErrorResponse('REQUIRED_FIELD_MISSING', '請提供 startDate 與 endDate', 400);
    }

    const where = {
      businessDate: { gte: startDate, lte: endDate },
    };
    if (warehouse) where.warehouse = warehouse;

    const wf = applyWarehouseFilter(auth.session, where);
    if (!wf.ok) return wf.response;

    const batches = await prisma.pmsImportBatch.findMany({
      where,
      take: 10000,
      select: {
        warehouse: true,
        businessDate: true,
        guestCount: true,
        breakfastCount: true,
        occupiedRooms: true,
        roomCount: true,
        occupancyRate: true,
      },
      orderBy: { businessDate: 'asc' },
    });

    if (groupBy === 'month') {
      const byMonth = {};
      for (const b of batches) {
        const ym = b.businessDate ? b.businessDate.substring(0, 7) : '';
        if (!ym) continue;
        const key = warehouse ? ym : `${b.warehouse}|${ym}`;
        if (!byMonth[key]) {
          byMonth[key] = {
            warehouse: b.warehouse,
            yearMonth: ym,
            guestCount: 0,
            breakfastCount: 0,
            occupiedRooms: 0,
            roomCount: 0,
            dayCount: 0,
          };
        }
        byMonth[key].guestCount += Number(b.guestCount) || 0;
        byMonth[key].breakfastCount += Number(b.breakfastCount) || 0;
        byMonth[key].occupiedRooms += Number(b.occupiedRooms) || 0;
        byMonth[key].roomCount += Number(b.roomCount) || 0;
        byMonth[key].dayCount += 1;
      }
      const list = Object.values(byMonth).sort((a, b) => (a.yearMonth + (a.warehouse || '')).localeCompare(b.yearMonth + (b.warehouse || '')));
      return NextResponse.json({ groupBy: 'month', data: list });
    }

    const data = batches.map(b => ({
      warehouse: b.warehouse,
      businessDate: b.businessDate,
      guestCount: b.guestCount != null ? Number(b.guestCount) : null,
      breakfastCount: b.breakfastCount != null ? Number(b.breakfastCount) : null,
      occupiedRooms: b.occupiedRooms != null ? Number(b.occupiedRooms) : null,
      roomCount: b.roomCount != null ? Number(b.roomCount) : null,
      occupancyRate: b.occupancyRate != null ? Number(b.occupancyRate) : null,
    }));

    return NextResponse.json({ groupBy: 'day', data });
  } catch (e) {
    return handleApiError(e);
  }
}
