import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { handleApiError } from '@/lib/error-handler';
import { requireAnyPermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

/**
 * POST /api/pms-income/reservations/auto-mark-overdue
 * 將超過 N 天（預設 7 天）仍為「待確認」的訂金記錄自動標記為「逾期未入」
 * Query: warehouse (optional), days (optional, default 7)
 */
export async function POST(request) {
  const auth = await requireAnyPermission([PERMISSIONS.PMS_VIEW, PERMISSIONS.PMS_IMPORT]);
  if (!auth.ok) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const warehouse = searchParams.get('warehouse') || '';
    const days = parseInt(searchParams.get('days') || '7', 10);

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const cutoffStr = cutoff.toISOString().slice(0, 10); // YYYY-MM-DD

    const where = {
      depositStatus: '待確認',
      depositIn: { gt: 0 },
      businessDate: { lt: cutoffStr },
    };
    if (warehouse) where.warehouse = warehouse;

    const result = await prisma.pmsReservationRecord.updateMany({
      where,
      data: { depositStatus: '逾期未入' },
    });

    return NextResponse.json({ updatedCount: result.count, cutoffDate: cutoffStr });
  } catch (error) {
    return handleApiError(error);
  }
}
