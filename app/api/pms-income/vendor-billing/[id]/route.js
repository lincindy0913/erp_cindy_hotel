/**
 * GET    /api/pms-income/vendor-billing/[id]
 * PATCH  /api/pms-income/vendor-billing/[id]
 * DELETE /api/pms-income/vendor-billing/[id]
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
    const id = parseInt((await params).id);
    const billing = await prisma.vendorItineraryBilling.findUnique({
      where: { id },
      include: {
        supplier: { select: { id: true, name: true, taxId: true, phone: true, bankName: true, bankAccount: true } },
        account:  { select: { id: true, name: true, type: true, warehouse: true } },
        items:    { orderBy: { id: 'asc' } },
      },
    });
    if (!billing) return createErrorResponse('NOT_FOUND', '帳單不存在', 404);

    return NextResponse.json({
      ...billing,
      totalAmount:   Number(billing.totalAmount),
      settledAmount: Number(billing.settledAmount),
      items: billing.items.map(i => ({
        ...i,
        unitPrice: Number(i.unitPrice),
        amount:    Number(i.amount),
      })),
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request, { params }) {
  const auth = await requireAnyPermission([PERMISSIONS.PMS_VIEW, PERMISSIONS.PMS_IMPORT]);
  if (!auth.ok) return auth.response;

  try {
    const id   = parseInt((await params).id);
    const body = await request.json();

    const existing = await prisma.vendorItineraryBilling.findUnique({ where: { id } });
    if (!existing) return createErrorResponse('NOT_FOUND', '帳單不存在', 404);
    if (existing.status === '已結帳') return createErrorResponse('INVALID_OPERATION', '已結帳帳單不可修改', 400);

    const data = {};
    if (body.warehouse    !== undefined) data.warehouse    = body.warehouse;
    if (body.supplierName !== undefined) data.supplierName = body.supplierName.trim();
    if (body.supplierId   !== undefined) data.supplierId   = body.supplierId ? parseInt(body.supplierId) : null;
    if (body.direction    !== undefined) data.direction    = body.direction;
    if (body.status       !== undefined) data.status       = body.status;
    if (body.billingMonth !== undefined) data.billingMonth = body.billingMonth;
    if (body.dueDate      !== undefined) data.dueDate      = body.dueDate || null;
    if (body.notes        !== undefined) data.notes        = body.notes   || null;

    const updated = await prisma.vendorItineraryBilling.update({
      where: { id },
      data,
      include: {
        supplier: { select: { id: true, name: true } },
        account:  { select: { id: true, name: true, type: true } },
        items:    { orderBy: { id: 'asc' } },
      },
    });

    return NextResponse.json({
      ...updated,
      totalAmount:   Number(updated.totalAmount),
      settledAmount: Number(updated.settledAmount),
      items: updated.items.map(i => ({ ...i, unitPrice: Number(i.unitPrice), amount: Number(i.amount) })),
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request, { params }) {
  const auth = await requireAnyPermission([PERMISSIONS.PMS_VIEW, PERMISSIONS.PMS_IMPORT]);
  if (!auth.ok) return auth.response;

  try {
    const id = parseInt((await params).id);
    const existing = await prisma.vendorItineraryBilling.findUnique({ where: { id } });
    if (!existing) return createErrorResponse('NOT_FOUND', '帳單不存在', 404);
    if (existing.status === '已結帳') return createErrorResponse('INVALID_OPERATION', '已結帳帳單不可刪除', 400);

    await prisma.vendorItineraryBilling.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}
