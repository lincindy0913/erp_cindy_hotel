import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { handleApiError } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

// GET /api/bnb/lock-audits?month=YYYY-MM&warehouse=民宿
export async function GET(request) {
  const auth = await requirePermission(PERMISSIONS.BNB_VIEW);
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const month     = searchParams.get('month');
  const warehouse = searchParams.get('warehouse');

  try {
    const where = {};
    if (month)     where.reportMonth = month;
    if (warehouse) where.warehouse   = warehouse;

    const audits = await prisma.bnbLockAudit.findMany({
      where,
      orderBy: { performedAt: 'desc' },
      take: 50,
    });

    return NextResponse.json(audits);
  } catch (error) {
    return handleApiError(error);
  }
}
