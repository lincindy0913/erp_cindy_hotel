/**
 * GET  /api/bnb/lock?month=YYYY-MM&warehouse=民宿
 *   查詢鎖帳狀態
 *
 * POST /api/bnb/lock
 *   鎖帳 { month, warehouse }
 *
 * DELETE /api/bnb/lock?month=YYYY-MM&warehouse=民宿
 *   解鎖
 */
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const auth = await requirePermission(PERMISSIONS.BNB_VIEW);
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const month     = searchParams.get('month');
  const warehouse = searchParams.get('warehouse') || '民宿';

  if (!month) return createErrorResponse('REQUIRED_FIELD_MISSING', '缺少 month', 400);

  try {
    const report = await prisma.bnbMonthlyReport.findUnique({
      where: { reportMonth_warehouse: { reportMonth: month, warehouse } },
      select: { lockedAt: true, lockedBy: true },
    });
    return NextResponse.json({
      locked: !!report?.lockedAt,
      lockedAt: report?.lockedAt || null,
      lockedBy: report?.lockedBy || null,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request) {
  const auth = await requirePermission(PERMISSIONS.BNB_EDIT);
  if (!auth.ok) return auth.response;

  try {
    const { month, warehouse = '民宿' } = await request.json();
    if (!month) return createErrorResponse('REQUIRED_FIELD_MISSING', '缺少 month', 400);

    const userName = auth.session.user.name || auth.session.user.email || 'unknown';

    const report = await prisma.bnbMonthlyReport.upsert({
      where: { reportMonth_warehouse: { reportMonth: month, warehouse } },
      update: { lockedAt: new Date(), lockedBy: userName },
      create: { reportMonth: month, warehouse, lockedAt: new Date(), lockedBy: userName },
    });

    return NextResponse.json({
      locked: true,
      lockedAt: report.lockedAt,
      lockedBy: report.lockedBy,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request) {
  const auth = await requirePermission(PERMISSIONS.BNB_EDIT);
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const month     = searchParams.get('month');
  const warehouse = searchParams.get('warehouse') || '民宿';

  if (!month) return createErrorResponse('REQUIRED_FIELD_MISSING', '缺少 month', 400);

  try {
    const existing = await prisma.bnbMonthlyReport.findUnique({
      where: { reportMonth_warehouse: { reportMonth: month, warehouse } },
    });
    if (!existing) {
      return NextResponse.json({ locked: false });
    }

    await prisma.bnbMonthlyReport.update({
      where: { id: existing.id },
      data: { lockedAt: null, lockedBy: null },
    });

    return NextResponse.json({ locked: false });
  } catch (error) {
    return handleApiError(error);
  }
}
