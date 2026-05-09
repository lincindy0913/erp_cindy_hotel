import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { handleApiError } from '@/lib/error-handler';
import { requireAnyPermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const auth = await requireAnyPermission([PERMISSIONS.PMS_VIEW, PERMISSIONS.PMS_IMPORT]);
  if (!auth.ok) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const warehouse = searchParams.get('warehouse');
    const month = searchParams.get('month'); // YYYY-MM

    const baseWhere = {};
    if (warehouse) baseWhere.warehouse = warehouse;

    const monthWhere = { ...baseWhere };
    if (month) monthWhere.businessDate = { startsWith: month };

    const depositFilter = { OR: [{ depositIn: { gt: 0 } }, { depositOut: { gt: 0 } }] };

    const [monthAgg, allAgg, statusAgg] = await Promise.all([
      prisma.pmsReservationRecord.aggregate({
        where: { ...monthWhere, ...depositFilter },
        _sum: { depositIn: true, depositOut: true },
        _count: { id: true },
      }),
      prisma.pmsReservationRecord.aggregate({
        where: { ...baseWhere, ...depositFilter },
        _sum: { depositIn: true, depositOut: true },
      }),
      prisma.pmsReservationRecord.groupBy({
        by: ['depositStatus'],
        where: { ...monthWhere, ...depositFilter },
        _sum: { depositIn: true, depositOut: true },
        _count: { id: true },
      }),
    ]);

    return NextResponse.json({
      month: {
        depositIn:  Number(monthAgg._sum.depositIn  || 0),
        depositOut: Number(monthAgg._sum.depositOut || 0),
        count:      monthAgg._count.id,
      },
      all: {
        depositIn:  Number(allAgg._sum.depositIn  || 0),
        depositOut: Number(allAgg._sum.depositOut || 0),
      },
      byStatus: statusAgg.map(s => ({
        status:     s.depositStatus,
        count:      s._count.id,
        depositIn:  Number(s._sum.depositIn  || 0),
        depositOut: Number(s._sum.depositOut || 0),
      })),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
