import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { handleApiError } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

// GET ?year=2025&warehouse=
// Returns per-month: bookings, roomNights, revenue
export async function GET(request) {
  const auth = await requirePermission(PERMISSIONS.BNB_VIEW);
  if (!auth.ok) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const year = searchParams.get('year') || new Date().getFullYear().toString();
    const warehouse = searchParams.get('warehouse') || '';

    const where = {
      importMonth: { startsWith: year },
      status: { notIn: ['已刪除'] },
    };
    if (warehouse) where.warehouse = warehouse;

    const records = await prisma.bnbBookingRecord.findMany({
      where,
      select: {
        importMonth: true,
        checkInDate: true,
        checkOutDate: true,
        roomCharge: true,
        otherCharge: true,
        source: true,
        roomNo: true,
        status: true,
      },
    });

    const monthMap = {};
    const ensureMonth = (m) => {
      if (!monthMap[m]) {
        const [y, mo] = m.split('-').map(Number);
        const daysInMonth = new Date(y, mo, 0).getDate();
        monthMap[m] = { month: m, daysInMonth, bookings: 0, roomNights: 0, revenue: 0, bySource: {}, byStatus: {} };
      }
    };

    for (const r of records) {
      ensureMonth(r.importMonth);
      const m = monthMap[r.importMonth];
      m.bookings++;
      const nights = Math.max(0, Math.round((new Date(r.checkOutDate) - new Date(r.checkInDate)) / 86400000));
      m.roomNights += nights;
      m.revenue += Number(r.roomCharge) + Number(r.otherCharge);
      m.bySource[r.source || '其他'] = (m.bySource[r.source || '其他'] || 0) + 1;
      m.byStatus[r.status] = (m.byStatus[r.status] || 0) + 1;
    }

    const rows = Object.values(monthMap)
      .sort((a, b) => a.month.localeCompare(b.month))
      .map(m => ({
        ...m,
        avgStay: m.bookings > 0 ? +(m.roomNights / m.bookings).toFixed(1) : 0,
      }));

    return NextResponse.json({ year, rows });
  } catch (error) {
    console.error('GET /api/bnb/occupancy error:', error.message || error);
    return handleApiError(error);
  }
}
