/**
 * GET  /api/rentals/year-locks        — 列出所有鎖定年份
 * POST /api/rentals/year-locks        — 鎖定年份 body: { year, note? }
 */
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const auth = await requirePermission(PERMISSIONS.RENTAL_VIEW);
  if (!auth.ok) return auth.response;

  try {
    const locks = await prisma.rentalYearLock.findMany({
      orderBy: { year: 'desc' },
    });
    return NextResponse.json(locks);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request) {
  const auth = await requirePermission(PERMISSIONS.SETTINGS_EDIT);
  if (!auth.ok) return auth.response;

  try {
    const { year, note } = await request.json();
    if (!year) return createErrorResponse('REQUIRED_FIELD_MISSING', '缺少 year', 400);

    const existing = await prisma.rentalYearLock.findUnique({ where: { year: parseInt(year) } });
    if (existing) return createErrorResponse('CONFLICT', `${year} 年已鎖定`, 409);

    const lock = await prisma.rentalYearLock.create({
      data: {
        year:     parseInt(year),
        lockedAt: new Date(),
        lockedBy: auth.session?.user?.name || auth.session?.user?.email || null,
        note:     note || null,
      },
    });
    return NextResponse.json(lock);
  } catch (error) {
    return handleApiError(error);
  }
}
