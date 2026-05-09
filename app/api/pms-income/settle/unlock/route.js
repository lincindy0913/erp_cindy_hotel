import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requireAnyPermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import { auditFromSession, AUDIT_ACTIONS } from '@/lib/audit';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../auth/[...nextauth]/route';

export const dynamic = 'force-dynamic';

// POST: 解除月結 — 將 已結算 狀態倒退回 已核對（不刪除現金流交易，由會計自行處理）
export async function POST(request) {
  const auth = await requireAnyPermission([PERMISSIONS.PMS_IMPORT]);
  if (!auth.ok) return auth.response;

  try {
    const { warehouse, yearMonth } = await request.json();
    if (!warehouse || !yearMonth) {
      return createErrorResponse('VALIDATION_FAILED', '請提供館別與月份', 400);
    }

    const settlement = await prisma.pmsMonthlySettlement.findUnique({
      where: { warehouse_settlementMonth: { warehouse, settlementMonth: yearMonth } },
    });

    if (!settlement) {
      return createErrorResponse('NOT_FOUND', '找不到月度結算記錄', 404);
    }
    if (settlement.status !== '已結算') {
      return createErrorResponse('VALIDATION_FAILED', `此月份狀態為「${settlement.status}」，無需解鎖`, 400);
    }

    const [y, m] = yearMonth.split('-').map(Number);
    const lastDay = new Date(y, m, 0).getDate();
    const startDate = `${yearMonth}-01`;
    const endDate   = `${yearMonth}-${String(lastDay).padStart(2, '0')}`;

    await prisma.$transaction([
      prisma.pmsImportBatch.updateMany({
        where: { warehouse, businessDate: { gte: startDate, lte: endDate }, status: '已結算' },
        data: { status: '已核對' },
      }),
      prisma.pmsMonthlySettlement.update({
        where: { warehouse_settlementMonth: { warehouse, settlementMonth: yearMonth } },
        data: { status: '已核對', settledBy: null, settledAt: null },
      }),
    ]);

    const session = await getServerSession(authOptions);
    if (session) {
      await auditFromSession(prisma, session, {
        action: AUDIT_ACTIONS.MONTH_END_UNLOCK,
        targetModule: 'pms_income',
        afterState: { warehouse, yearMonth },
        note: `PMS月結解鎖 ${warehouse} ${yearMonth}（現金流交易需手動核查）`,
      });
    }

    return NextResponse.json({
      success: true,
      message: `${warehouse} ${yearMonth} 已解除月結，狀態退回「已核對」。注意：結算時建立的現金流交易需手動刪除。`,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
