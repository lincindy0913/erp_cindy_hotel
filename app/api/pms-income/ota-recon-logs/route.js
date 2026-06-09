import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requireAnyPermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

// GET: 查詢歷史 OTA 對帳紀錄
export async function GET(request) {
  const auth = await requireAnyPermission([PERMISSIONS.PMS_VIEW, PERMISSIONS.PMS_IMPORT]);
  if (!auth.ok) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const warehouse = searchParams.get('warehouse');
    const month = searchParams.get('month');
    const withLines = searchParams.get('withLines') === '1';
    const logId = searchParams.get('logId');

    // Single log with lines
    if (logId) {
      const log = await prisma.pmsOtaReconLog.findUnique({
        where: { id: parseInt(logId) },
        include: { lines: { orderBy: { id: 'asc' } } },
      });
      if (!log) return createErrorResponse('NOT_FOUND', '找不到記錄', 404);
      return NextResponse.json({
        ...log,
        totalDiff: Number(log.totalDiff),
        lines: log.lines.map(l => ({
          ...l,
          otaFinalAmount:   Number(l.otaFinalAmount),
          otaCommissionAmt: Number(l.otaCommissionAmt),
          otaCommissionPct: l.otaCommissionPct ? Number(l.otaCommissionPct) : null,
          pmsCommissionAmt: Number(l.pmsCommissionAmt),
          diffAmount:       Number(l.diffAmount),
        })),
      });
    }

    // List logs
    const where = {};
    if (warehouse) where.warehouse = warehouse;
    if (month) where.billingMonth = month;

    const logs = await prisma.pmsOtaReconLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: withLines ? { lines: true } : undefined,
    });

    return NextResponse.json(logs.map(l => ({
      ...l,
      totalDiff: Number(l.totalDiff),
    })));
  } catch (error) {
    return handleApiError(error);
  }
}
