/**
 * GET  /api/pms-income/vendor-billing/[id]/items   — 項目列表
 * POST /api/pms-income/vendor-billing/[id]/items   — 新增項目（並重算 totalAmount）
 */
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requireAnyPermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  const auth = await requireAnyPermission([PERMISSIONS.PMS_VIEW, PERMISSIONS.PMS_IMPORT]);
  if (!auth.ok) return auth.response;

  try {
    const billingId = parseInt(params.id);
    const items = await prisma.vendorItineraryItem.findMany({
      where: { billingId },
      orderBy: { id: 'asc' },
    });
    return NextResponse.json(items.map(i => ({ ...i, unitPrice: Number(i.unitPrice), amount: Number(i.amount) })));
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request, { params }) {
  const auth = await requireAnyPermission([PERMISSIONS.PMS_VIEW, PERMISSIONS.PMS_IMPORT]);
  if (!auth.ok) return auth.response;

  try {
    const billingId = parseInt(params.id);
    const body = await request.json();
    const { description, guestName, checkInDate, checkOutDate, roomType, quantity, unitPrice, notes } = body;

    if (!description) return createErrorResponse('REQUIRED_FIELD_MISSING', '請填寫項目說明', 400);
    if (unitPrice == null) return createErrorResponse('REQUIRED_FIELD_MISSING', '請填寫單價', 400);

    const billing = await prisma.vendorItineraryBilling.findUnique({ where: { id: billingId } });
    if (!billing) return createErrorResponse('NOT_FOUND', '帳單不存在', 404);
    if (billing.status === '已結帳') return createErrorResponse('INVALID_OPERATION', '已結帳帳單不可新增項目', 400);

    const qty = parseInt(quantity) || 1;
    const price = parseFloat(unitPrice) || 0;
    const amount = Math.round(qty * price * 100) / 100;

    const item = await prisma.$transaction(async (tx) => {
      const created = await tx.vendorItineraryItem.create({
        data: {
          billingId,
          description:  description.trim(),
          guestName:    guestName    || null,
          checkInDate:  checkInDate  || null,
          checkOutDate: checkOutDate || null,
          roomType:     roomType     || null,
          quantity:     qty,
          unitPrice:    price,
          amount,
          notes: notes || null,
        },
      });
      const agg = await tx.vendorItineraryItem.aggregate({ where: { billingId }, _sum: { amount: true } });
      await tx.vendorItineraryBilling.update({
        where: { id: billingId },
        data:  { totalAmount: agg._sum.amount || 0 },
      });
      return created;
    });

    return NextResponse.json({ ...item, unitPrice: Number(item.unitPrice), amount: Number(item.amount) }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
