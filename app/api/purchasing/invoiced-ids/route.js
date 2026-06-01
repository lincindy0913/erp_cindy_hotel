import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { handleApiError } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

// Returns the set of purchaseItemId strings (from salesDetail) that are already invoiced
// for the requested purchase IDs — used by the purchasing page to show invoiced status.
export async function GET(request) {
  const auth = await requirePermission(PERMISSIONS.PURCHASING_VIEW);
  if (!auth.ok) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const raw = searchParams.get('purchaseIds') || '';
    const purchaseIds = raw.split(',').map(Number).filter(n => Number.isInteger(n) && n > 0);

    if (purchaseIds.length === 0) return NextResponse.json([]);

    const details = await prisma.salesDetail.findMany({
      where: { purchaseId: { in: purchaseIds } },
      select: { purchaseItemId: true },
    });

    const ids = [...new Set(details.map(d => d.purchaseItemId).filter(Boolean))];
    return NextResponse.json(ids);
  } catch (error) {
    return handleApiError(error);
  }
}
