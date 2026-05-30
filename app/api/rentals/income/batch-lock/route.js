/**
 * PATCH /api/rentals/income/batch-lock
 * body: { ids: number[], lock?: boolean }
 * 一次 updateMany 批次鎖帳/解鎖，取代前端 for-await 串行
 */
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import { auditFromSession, AUDIT_ACTIONS } from '@/lib/audit';

export const dynamic = 'force-dynamic';

export async function PATCH(request) {
  const auth = await requirePermission(PERMISSIONS.RENTAL_EDIT);
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();
    const { ids, lock = true } = body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return createErrorResponse('REQUIRED_FIELD_MISSING', '缺少 ids', 400);
    }

    const operator = auth.session?.user?.name || auth.session?.user?.email || 'unknown';

    const result = await prisma.rentalIncome.updateMany({
      where: { id: { in: ids.map(Number) }, isLocked: !lock },
      data: {
        isLocked:  lock,
        lockedAt:  lock ? new Date() : null,
        lockedBy:  lock ? operator  : null,
      },
    });

    await auditFromSession(prisma, auth.session, {
      action: AUDIT_ACTIONS.RENTAL_INCOME_UPDATE,
      targetModule: 'rentals',
      afterState: { isLocked: lock, count: result.count },
      note: `批次${lock ? '鎖帳' : '解鎖'} ${result.count} 筆`,
    });

    return NextResponse.json({ locked: result.count });
  } catch (error) {
    return handleApiError(error);
  }
}
