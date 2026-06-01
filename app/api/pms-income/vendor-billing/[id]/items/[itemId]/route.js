/**
 * PATCH  /api/pms-income/vendor-billing/[id]/items/[itemId]
 * DELETE /api/pms-income/vendor-billing/[id]/items/[itemId]
 */
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requireAnyPermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

async function recalcTotal(tx, billingId) {
  const agg = await tx.vendorItineraryItem.aggregate({ where: { billingId }, _sum: { amount: true } });
  await tx.vendorItineraryBilling.update({
    where: { id: billingId },
    data:  { totalAmount: agg._sum.amount || 0 },
  });
}

export async function PATCH(request, { params }) {
  const auth = await requireAnyPermission([PERMISSIONS.PMS_VIEW, PERMISSIONS.PMS_IMPORT]);
  if (!auth.ok) return auth.response;

  try {
    const billingId = parseInt((await params).id);
    const itemId    = parseInt((await params).itemId);
    const body      = await request.json();

    const billing = await prisma.vendorItineraryBilling.findUnique({ where: { id: billingId } });
    if (!billing) return createErrorResponse('NOT_FOUND', '帳單不存在', 404);
    if (billing.status === '已結帳') return createErrorResponse('INVALID_OPERATION', '已結帳帳單不可修改', 400);

    const data = {};
    if (body.description  !== undefined) data.description  = body.description.trim();
    if (body.guestName    !== undefined) data.guestName    = body.guestName    || null;
    if (body.checkInDate  !== undefined) data.checkInDate  = body.checkInDate  || null;
    if (body.checkOutDate !== undefined) data.checkOutDate = body.checkOutDate || null;
    if (body.roomType     !== undefined) data.roomType     = body.roomType     || null;
    if (body.notes        !== undefined) data.notes        = body.notes        || null;
    if (body.quantity  !== undefined || body.unitPrice !== undefined) {
      const existing = await prisma.vendorItineraryItem.findUnique({ where: { id: itemId } });
      const qty   = body.quantity  !== undefined ? (parseInt(body.quantity)   || 1)   : Number(existing.quantity);
      const price = body.unitPrice !== undefined ? (parseFloat(body.unitPrice) || 0)  : Number(existing.unitPrice);
      data.quantity  = qty;
      data.unitPrice = price;
      data.amount    = Math.round(qty * price * 100) / 100;
    }

    const updated = await prisma.$transaction(async (tx) => {
      const item = await tx.vendorItineraryItem.update({ where: { id: itemId }, data });
      await recalcTotal(tx, billingId);
      return item;
    });

    return NextResponse.json({ ...updated, unitPrice: Number(updated.unitPrice), amount: Number(updated.amount) });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request, { params }) {
  const auth = await requireAnyPermission([PERMISSIONS.PMS_VIEW, PERMISSIONS.PMS_IMPORT]);
  if (!auth.ok) return auth.response;

  try {
    const billingId = parseInt((await params).id);
    const itemId    = parseInt((await params).itemId);

    const billing = await prisma.vendorItineraryBilling.findUnique({ where: { id: billingId } });
    if (!billing) return createErrorResponse('NOT_FOUND', '帳單不存在', 404);
    if (billing.status === '已結帳') return createErrorResponse('INVALID_OPERATION', '已結帳帳單不可刪除項目', 400);

    await prisma.$transaction(async (tx) => {
      await tx.vendorItineraryItem.delete({ where: { id: itemId } });
      await recalcTotal(tx, billingId);
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}
