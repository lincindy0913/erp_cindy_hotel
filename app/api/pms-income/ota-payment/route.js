import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requireAnyPermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

// GET: 列出 OTA 撥款到帳確認記錄
export async function GET(request) {
  const auth = await requireAnyPermission([PERMISSIONS.PMS_VIEW, PERMISSIONS.PMS_IMPORT]);
  if (!auth.ok) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const warehouse = searchParams.get('warehouse') || '';
    const yearMonth = searchParams.get('yearMonth') || '';

    const where = {};
    if (warehouse) where.warehouse = warehouse;
    if (yearMonth) where.yearMonth = yearMonth;

    const payments = await prisma.pmsOtaPayment.findMany({
      where,
      orderBy: [{ yearMonth: 'desc' }, { source: 'asc' }],
    });

    return NextResponse.json(payments.map(p => ({
      ...p,
      expectedAmount: Number(p.expectedAmount),
      actualAmount:   Number(p.actualAmount),
      diff:           Number(p.diff),
    })));
  } catch (error) {
    return handleApiError(error);
  }
}

// POST: 建立或更新 OTA 撥款確認記錄（upsert）
export async function POST(request) {
  const auth = await requireAnyPermission([PERMISSIONS.PMS_VIEW, PERMISSIONS.PMS_IMPORT]);
  if (!auth.ok) return auth.response;

  try {
    const { warehouse, yearMonth, source, expectedAmount, actualAmount, confirmedDate, note } = await request.json();

    if (!warehouse || !yearMonth || !source) {
      return createErrorResponse('VALIDATION_FAILED', 'warehouse / yearMonth / source 為必填', 400);
    }

    const expected = Number(expectedAmount) || 0;
    const actual   = Number(actualAmount)   || 0;
    const diff     = actual - expected;
    const status   = actual === 0 ? '待確認' : Math.abs(diff) < 1 ? '已到帳' : '有差異';

    const payment = await prisma.pmsOtaPayment.upsert({
      where:  { warehouse_yearMonth_source: { warehouse, yearMonth, source } },
      create: { warehouse, yearMonth, source, expectedAmount: expected, actualAmount: actual, diff, status, confirmedDate: confirmedDate || null, note: note || null },
      update: { expectedAmount: expected, actualAmount: actual, diff, status, confirmedDate: confirmedDate || null, note: note || null, updatedAt: new Date() },
    });

    return NextResponse.json({
      ...payment,
      expectedAmount: Number(payment.expectedAmount),
      actualAmount:   Number(payment.actualAmount),
      diff:           Number(payment.diff),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
