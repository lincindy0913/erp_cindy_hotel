/**
 * PATCH  /api/rentals/rent-filing/[id]
 * DELETE /api/rentals/rent-filing/[id]
 */
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

export async function PATCH(request, { params }) {
  const auth = await requirePermission(PERMISSIONS.RENTAL_EDIT);
  if (!auth.ok) return auth.response;

  try {
    const id = parseInt((await params).id, 10);
    if (!id) return createErrorResponse('INVALID_ID', '無效的 ID', 400);

    const existing = await prisma.rentalAnnualRentFiling.findUnique({ where: { id } });
    if (!existing) return createErrorResponse('NOT_FOUND', '找不到申報紀錄', 404);

    const body = await request.json();
    const data = {};

    if (body.contractId !== undefined) {
      data.contractId =
        body.contractId === null || body.contractId === ''
          ? null
          : parseInt(body.contractId, 10);
      if (data.contractId) {
        const c = await prisma.rentalContract.findFirst({
          where: { id: data.contractId, propertyId: existing.propertyId },
        });
        if (!c) return createErrorResponse('INVALID_CONTRACT', '租約不屬於該物業', 400);
      }
    }
    if (body.isPublicInterest !== undefined) data.isPublicInterest = !!body.isPublicInterest;
    if (body.lesseeDisplayName !== undefined) data.lesseeDisplayName = body.lesseeDisplayName || null;
    if (body.declaredMonthlyRent !== undefined) {
      data.declaredMonthlyRent =
        body.declaredMonthlyRent === '' || body.declaredMonthlyRent == null
          ? null
          : parseFloat(body.declaredMonthlyRent);
    }
    if (body.monthsInScope !== undefined) {
      data.monthsInScope =
        body.monthsInScope === '' || body.monthsInScope == null
          ? null
          : parseInt(body.monthsInScope, 10);
    }
    if (body.declaredAnnualIncome !== undefined) {
      data.declaredAnnualIncome =
        body.declaredAnnualIncome === '' || body.declaredAnnualIncome == null
          ? null
          : parseFloat(body.declaredAnnualIncome);
    }
    if (body.estimatedHouseTax !== undefined) {
      data.estimatedHouseTax =
        body.estimatedHouseTax === '' || body.estimatedHouseTax == null
          ? null
          : parseFloat(body.estimatedHouseTax);
    }
    if (body.status !== undefined) data.status = body.status;
    if (body.note !== undefined) data.note = body.note || null;
    if (body.confirmedAt !== undefined) {
      data.confirmedAt = body.confirmedAt ? new Date(body.confirmedAt) : null;
    }

    const updated = await prisma.rentalAnnualRentFiling.update({
      where: { id },
      data,
    });

    return NextResponse.json(updated);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request, { params }) {
  const auth = await requirePermission(PERMISSIONS.RENTAL_EDIT);
  if (!auth.ok) return auth.response;

  try {
    const id = parseInt((await params).id, 10);
    if (!id) return createErrorResponse('INVALID_ID', '無效的 ID', 400);

    await prisma.rentalAnnualRentFiling.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}
