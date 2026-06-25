/**
 * POST /api/cron/check-due-status
 *
 * 每日由外部排程（GitHub Actions）觸發，將到期的 pending 支票標記為 due。
 * 建議排程：每天 00:05 UTC+8。
 *
 * 驗證：Authorization: Bearer <CRON_SECRET>
 */
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { todayStr } from '@/lib/localDate';

export const dynamic = 'force-dynamic';

function checkAuth(request) {
  const header = request.headers.get('authorization') || '';
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return header === `Bearer ${secret}`;
}

export async function POST(request) {
  if (!checkAuth(request)) {
    return createErrorResponse('UNAUTHORIZED', 'Unauthorized', 401);
  }

  try {
    const today = todayStr();
    const [checkResult, contractResult] = await Promise.all([
      prisma.check.updateMany({
        where: { status: 'pending', dueDate: { lte: today } },
        data: { status: 'due' }
      }),
      prisma.rentalContract.updateMany({
        where: { status: 'active', endDate: { lt: today } },
        data: { status: 'expired' }
      }),
    ]);

    return NextResponse.json({
      success: true,
      checksUpdated: checkResult.count,
      contractsExpired: contractResult.count,
      date: today,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
