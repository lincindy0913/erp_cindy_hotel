/**
 * GET  /api/bnb/monthly-report?month=2026-03&warehouse=民宿
 * PUT  /api/bnb/monthly-report  — upsert 月報（旅宿網申報欄位）
 */
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requirePermission, requireAnyPermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const auth = await requirePermission(PERMISSIONS.BNB_VIEW);
  if (!auth.ok) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const month     = searchParams.get('month');
    const warehouse = searchParams.get('warehouse') || '民宿';
    if (!month) return createErrorResponse('REQUIRED_FIELD_MISSING', '缺少 month 參數', 400);

    const report = await prisma.bnbMonthlyReport.findUnique({
      where: { reportMonth_warehouse: { reportMonth: month, warehouse } },
    });

    return NextResponse.json(report || null);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(request) {
  const auth = await requireAnyPermission([PERMISSIONS.BNB_CREATE, PERMISSIONS.BNB_EDIT]);
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();
    const { reportMonth, warehouse = '民宿', avgRoomRate, roomSuppliesCost,
            fbExpense, staffCount, salary, businessSource, fitGuestCount,
            otherIncome = 0, otherIncomeNote, note } = body;

    if (!reportMonth) return createErrorResponse('REQUIRED_FIELD_MISSING', '缺少 reportMonth', 400);

    const data = {
      avgRoomRate:      avgRoomRate      != null ? parseFloat(avgRoomRate)      : null,
      roomSuppliesCost: roomSuppliesCost != null ? parseFloat(roomSuppliesCost) : null,
      fbExpense:        fbExpense        != null ? parseFloat(fbExpense)        : null,
      staffCount:       staffCount       != null ? parseInt(staffCount)         : null,
      salary:           salary           != null ? parseFloat(salary)           : null,
      businessSource:   businessSource   || null,
      fitGuestCount:    fitGuestCount    != null ? parseInt(fitGuestCount)      : null,
      otherIncome:      parseFloat(otherIncome) || 0,
      otherIncomeNote:  otherIncomeNote  || null,
      note:             note             || null,
    };

    const report = await prisma.bnbMonthlyReport.upsert({
      where: { reportMonth_warehouse: { reportMonth, warehouse } },
      create: { reportMonth, warehouse, ...data },
      update: data,
    });

    return NextResponse.json({ ...report, otherIncome: Number(report.otherIncome) });
  } catch (error) {
    return handleApiError(error);
  }
}
