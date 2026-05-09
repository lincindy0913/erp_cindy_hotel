/**
 * GET  /api/pms-income/vendor-billing   — 列表 (with filters)
 * POST /api/pms-income/vendor-billing   — 新增帳單
 */
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requireAnyPermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const auth = await requireAnyPermission([PERMISSIONS.PMS_VIEW, PERMISSIONS.PMS_IMPORT]);
  if (!auth.ok) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const warehouse    = searchParams.get('warehouse') || '';
    const billingMonth = searchParams.get('billingMonth') || '';
    const direction    = searchParams.get('direction') || '';
    const status       = searchParams.get('status') || '';
    const supplierId   = searchParams.get('supplierId') || '';

    const where = {};
    if (warehouse)    where.warehouse    = warehouse;
    if (billingMonth) where.billingMonth = billingMonth;
    if (direction)    where.direction    = direction;
    if (status)       where.status       = status;
    if (supplierId)   where.supplierId   = parseInt(supplierId);

    const billings = await prisma.vendorItineraryBilling.findMany({
      where,
      orderBy: [{ billingMonth: 'desc' }, { createdAt: 'desc' }],
      include: {
        supplier: { select: { id: true, name: true } },
        account:  { select: { id: true, name: true, type: true } },
        items:    { select: { id: true, amount: true } },
      },
    });

    return NextResponse.json(
      billings.map(b => ({
        ...b,
        totalAmount:   Number(b.totalAmount),
        settledAmount: Number(b.settledAmount),
        itemCount: b.items.length,
        items: undefined,
      }))
    );
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request) {
  const auth = await requireAnyPermission([PERMISSIONS.PMS_VIEW, PERMISSIONS.PMS_IMPORT]);
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();
    const { warehouse, supplierName, supplierId, direction, billingMonth, dueDate, notes, createdBy } = body;

    if (!warehouse)    return createErrorResponse('REQUIRED_FIELD_MISSING', '請選擇館別', 400);
    if (!supplierName) return createErrorResponse('REQUIRED_FIELD_MISSING', '請填寫廠商名稱', 400);
    if (!direction)    return createErrorResponse('REQUIRED_FIELD_MISSING', '請選擇方向 AR/AP', 400);
    if (!billingMonth) return createErrorResponse('REQUIRED_FIELD_MISSING', '請選擇帳單月份', 400);

    const billing = await prisma.vendorItineraryBilling.create({
      data: {
        warehouse,
        supplierName: supplierName.trim(),
        supplierId:   supplierId ? parseInt(supplierId) : null,
        direction,
        billingMonth,
        dueDate:      dueDate || null,
        notes:        notes   || null,
        createdBy:    createdBy || null,
        status:       '草稿',
        totalAmount:  0,
        settledAmount: 0,
      },
      include: {
        supplier: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json({ ...billing, totalAmount: Number(billing.totalAmount), settledAmount: Number(billing.settledAmount) }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
