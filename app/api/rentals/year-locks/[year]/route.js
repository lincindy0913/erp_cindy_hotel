/**
 * DELETE /api/rentals/year-locks/[year] — 解除年度結算鎖定
 */
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

export async function DELETE(request, { params }) {
  const auth = await requirePermission(PERMISSIONS.SETTINGS_EDIT);
  if (!auth.ok) return auth.response;

  try {
    const year = parseInt(params.year);
    const lock = await prisma.rentalYearLock.findUnique({ where: { year } });
    if (!lock) return createErrorResponse('NOT_FOUND', `${year} 年未鎖定`, 404);

    await prisma.rentalYearLock.delete({ where: { year } });
    return NextResponse.json({ success: true, year });
  } catch (error) {
    return handleApiError(error);
  }
}
