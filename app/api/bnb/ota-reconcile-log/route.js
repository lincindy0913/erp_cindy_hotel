/**
 * GET /api/bnb/ota-reconcile-log
 *   ?source=Booking&warehouse=民宿&year=2026
 *   → 回傳歷次 OTA 比對摘要記錄（最新在前）
 */
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { handleApiError } from '@/lib/error-handler';
import { requireAnyPermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const auth = await requireAnyPermission([PERMISSIONS.BNB_VIEW, PERMISSIONS.BNB_EDIT]);
  if (!auth.ok) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const source    = searchParams.get('source')    || undefined;
    const warehouse = searchParams.get('warehouse') || undefined;
    const year      = searchParams.get('year')      || undefined;

    const where = {};
    if (source)    where.otaSource       = source;
    if (warehouse) where.warehouse       = warehouse;
    if (year)      where.reconcileMonth  = { startsWith: year };

    const rows = await prisma.bnbOtaReconcileLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return NextResponse.json({
      rows: rows.map(r => ({
        ...r,
        otaTotal:      Number(r.otaTotal),
        bnbTotal:      Number(r.bnbTotal),
        diff:          Number(r.diff),
        otaCommission: Number(r.otaCommission),
      })),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
