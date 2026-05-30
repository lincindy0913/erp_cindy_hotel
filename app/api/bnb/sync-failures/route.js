import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { handleApiError } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

// GET /api/bnb/sync-failures?resolved=false&warehouse=xxx
export async function GET(request) {
  const auth = await requirePermission(PERMISSIONS.BNB_VIEW ?? 'bnb.view');
  if (!auth.ok) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const resolvedParam = searchParams.get('resolved');
    const warehouse = searchParams.get('warehouse');

    const where = {};
    if (resolvedParam !== null) where.resolved = resolvedParam !== 'true';
    if (warehouse) where.booking = { warehouse };

    const failures = await prisma.bnbSyncFailure.findMany({
      where,
      include: {
        booking: {
          select: { id: true, guestName: true, checkInDate: true, checkOutDate: true, warehouse: true },
        },
      },
      orderBy: { failedAt: 'desc' },
      take: 100,
    });

    return NextResponse.json(failures);
  } catch (error) {
    return handleApiError(error);
  }
}
