import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import { auditFromSession, AUDIT_ACTIONS } from '@/lib/audit';

export const dynamic = 'force-dynamic';

// PATCH /api/rentals/income/[id]/lock  — 切換鎖帳狀態
export async function PATCH(request, { params }) {
  const auth = await requirePermission(PERMISSIONS.RENTAL_EDIT);
  if (!auth.ok) return auth.response;

  try {
    const { id } = await params;
    const incomeId = parseInt(id);

    const income = await prisma.rentalIncome.findUnique({
      where: { id: incomeId },
      select: {
        id: true, isLocked: true,
        property: { select: { name: true } },
        incomeYear: true, incomeMonth: true,
      },
    });
    if (!income) return createErrorResponse('NOT_FOUND', '找不到收租紀錄', 404);

    const nowLocked = !income.isLocked;
    const operator = auth.session?.user?.name || auth.session?.user?.email || 'unknown';

    await prisma.rentalIncome.update({
      where: { id: incomeId },
      data: {
        isLocked: nowLocked,
        lockedAt: nowLocked ? new Date() : null,
        lockedBy: nowLocked ? operator : null,
      },
      select: { id: true },
    });

    await auditFromSession(prisma, auth.session, {
      action: AUDIT_ACTIONS.RENTAL_INCOME_UPDATE,
      targetModule: 'rentals',
      targetRecordId: incomeId,
      beforeState: { isLocked: income.isLocked },
      afterState: { isLocked: nowLocked },
      note: `${nowLocked ? '鎖帳' : '解鎖'} ${income.property?.name} ${income.incomeYear}/${String(income.incomeMonth).padStart(2, '0')}`,
    });

    return NextResponse.json({ success: true, isLocked: nowLocked });
  } catch (error) {
    return handleApiError(error);
  }
}
