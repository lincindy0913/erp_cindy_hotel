import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { handleApiError } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

// GET ?year=2025&warehouse=
// Returns source breakdown + monthly trend
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
        source: true,
        roomCharge: true,
        otherCharge: true,
        checkInDate: true,
        checkOutDate: true,
      },
    });

    const sourceMap = {};
    const monthSourceMap = {};

    for (const r of records) {
      const src = r.source || '其他';
      const rev = Number(r.roomCharge) + Number(r.otherCharge);
      const nights = Math.max(0, Math.round((new Date(r.checkOutDate) - new Date(r.checkInDate)) / 86400000));

      if (!sourceMap[src]) sourceMap[src] = { source: src, bookings: 0, revenue: 0, roomNights: 0 };
      sourceMap[src].bookings++;
      sourceMap[src].revenue += rev;
      sourceMap[src].roomNights += nights;

      if (!monthSourceMap[r.importMonth]) monthSourceMap[r.importMonth] = {};
      if (!monthSourceMap[r.importMonth][src]) monthSourceMap[r.importMonth][src] = { bookings: 0, revenue: 0 };
      monthSourceMap[r.importMonth][src].bookings++;
      monthSourceMap[r.importMonth][src].revenue += rev;
    }

    const totalBookings = Object.values(sourceMap).reduce((s, x) => s + x.bookings, 0);
    const totalRevenue = Object.values(sourceMap).reduce((s, x) => s + x.revenue, 0);

    const sources = Object.values(sourceMap)
      .sort((a, b) => b.bookings - a.bookings)
      .map(s => ({
        ...s,
        bookingPct: totalBookings > 0 ? Math.round((s.bookings / totalBookings) * 100) : 0,
        revenuePct: totalRevenue > 0 ? Math.round((s.revenue / totalRevenue) * 100) : 0,
        avgRevenue: s.bookings > 0 ? Math.round(s.revenue / s.bookings) : 0,
        avgStay: s.bookings > 0 ? +(s.roomNights / s.bookings).toFixed(1) : 0,
      }));

    const months = [...new Set(records.map(r => r.importMonth))].sort();
    const sourceList = sources.map(s => s.source);
    const trend = months.map(m => ({
      month: m,
      ...Object.fromEntries(sourceList.map(src => [src, monthSourceMap[m]?.[src]?.bookings || 0])),
      ...Object.fromEntries(sourceList.map(src => [`rev_${src}`, monthSourceMap[m]?.[src]?.revenue || 0])),
    }));

    return NextResponse.json({ year, sources, trend, totalBookings, totalRevenue });
  } catch (error) {
    console.error('GET /api/bnb/source-analysis error:', error.message || error);
    return handleApiError(error);
  }
}
