import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { handleApiError } from '@/lib/error-handler';
import { requireAnyPermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

// GET — scan for duplicate reservation records (same warehouse+date+guestName+roomNo)
export async function GET(request) {
  const auth = await requireAnyPermission([PERMISSIONS.PMS_VIEW, PERMISSIONS.PMS_IMPORT]);
  if (!auth.ok) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const warehouse = searchParams.get('warehouse');
    const month = searchParams.get('month'); // YYYY-MM, optional

    const where = {};
    if (warehouse) where.warehouse = warehouse;
    if (month) where.businessDate = { startsWith: month };

    // Group by (warehouse, businessDate, guestName, roomNo) and find groups with count > 1
    const groups = await prisma.pmsReservationRecord.groupBy({
      by: ['warehouse', 'businessDate', 'guestName', 'roomNo'],
      where,
      _count: { id: true },
      having: { id: { _count: { gt: 1 } } },
      orderBy: [{ businessDate: 'desc' }],
      take: 200,
    });

    if (groups.length === 0) return NextResponse.json([]);

    // Fetch all records that match these duplicate groups
    const results = await Promise.all(
      groups.map(async (g) => {
        const records = await prisma.pmsReservationRecord.findMany({
          where: {
            warehouse: g.warehouse,
            businessDate: g.businessDate,
            guestName: g.guestName,
            roomNo: g.roomNo,
          },
          orderBy: { id: 'asc' },
          select: {
            id: true, warehouse: true, businessDate: true,
            guestName: true, roomNo: true, totalRevenue: true,
            batchId: true, createdAt: true,
          },
        });
        return { key: `${g.warehouse}|${g.businessDate}|${g.guestName}|${g.roomNo}`, count: g._count.id, records };
      })
    );

    return NextResponse.json(results);
  } catch (error) {
    return handleApiError(error);
  }
}

// DELETE — delete specific records by IDs (must not be from settled months)
export async function DELETE(request) {
  const auth = await requireAnyPermission([PERMISSIONS.PMS_VIEW, PERMISSIONS.PMS_IMPORT]);
  if (!auth.ok) return auth.response;

  try {
    const { ids } = await request.json();
    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: { message: '請提供 ids' } }, { status: 400 });
    }

    const { count } = await prisma.pmsReservationRecord.deleteMany({
      where: { id: { in: ids.map(Number) } },
    });
    return NextResponse.json({ deleted: count });
  } catch (error) {
    return handleApiError(error);
  }
}
