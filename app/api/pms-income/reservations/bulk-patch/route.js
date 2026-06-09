import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requireAnyPermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

const ALLOWED_FIELDS = new Set(['creditCardStatus', 'depositStatus', 'sourceOverride']);

export async function PATCH(request) {
  const auth = await requireAnyPermission([PERMISSIONS.PMS_VIEW, PERMISSIONS.PMS_IMPORT]);
  if (!auth.ok) return auth.response;

  try {
    const { ids, patch } = await request.json();
    if (!Array.isArray(ids) || ids.length === 0) {
      return createErrorResponse('REQUIRED_FIELD_MISSING', '請提供 ids', 400);
    }
    const data = Object.fromEntries(
      Object.entries(patch).filter(([k]) => ALLOWED_FIELDS.has(k))
    );
    if (Object.keys(data).length === 0) {
      return createErrorResponse('VALIDATION_FAILED', '無可更新欄位', 400);
    }

    const { count } = await prisma.pmsReservationRecord.updateMany({
      where: { id: { in: ids.map(Number) } },
      data,
    });
    return NextResponse.json({ updated: count });
  } catch (error) {
    return handleApiError(error);
  }
}
