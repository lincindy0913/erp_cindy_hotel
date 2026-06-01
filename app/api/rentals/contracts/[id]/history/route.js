/**
 * GET /api/rentals/contracts/[id]/history
 * 查詢合約的 audit_log 變更歷史（最近 50 筆）
 */
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  const auth = await requirePermission(PERMISSIONS.RENTAL_VIEW);
  if (!auth.ok) return auth.response;

  try {
    const contractId = parseInt((await params).id);
    if (!contractId) return createErrorResponse('REQUIRED_FIELD_MISSING', '缺少 id', 400);

    const logs = await prisma.auditLog.findMany({
      where: {
        targetModule:   'rentals',
        targetRecordId: contractId,
        action:         { startsWith: 'rental_contract' },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id:          true,
        action:      true,
        beforeState: true,
        afterState:  true,
        note:        true,
        userName:    true,
        userEmail:   true,
        createdAt:   true,
      },
    });

    return NextResponse.json(logs);
  } catch (error) {
    return handleApiError(error);
  }
}
