import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requireAnyPermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

export async function PATCH(request, { params }) {
  const auth = await requireAnyPermission([PERMISSIONS.PMS_VIEW, PERMISSIONS.PMS_IMPORT]);
  if (!auth.ok) return auth.response;

  const id = parseInt(params.id);
  if (!id) return createErrorResponse('VALIDATION_FAILED', '無效的 ID', 400);

  try {
    const body = await request.json();
    const allowed = [
      'sourceOverride', 'note',
      'cashStatus', 'wireStatus', 'commissionStatus', 'depositStatus', 'creditCardStatus',
      'ccFeeRate', 'ccFeeAmount', 'ccNetAmount', 'ccActualNet', 'ccDiff', 'ccSettleDate',
      'vendorBillingId',
    ];
    const updateData = {};
    for (const k of allowed) {
      if (k in body) updateData[k] = body[k];
    }

    const updated = await prisma.pmsReservationRecord.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({
      ...updated,
      roomRate:      Number(updated.roomRate),
      serviceFee:    Number(updated.serviceFee),
      otherCharges:  Number(updated.otherCharges),
      totalRevenue:  Number(updated.totalRevenue),
      cash:          Number(updated.cash),
      creditCard:    Number(updated.creditCard),
      wireTransfer:  Number(updated.wireTransfer),
      commission:    Number(updated.commission),
      discount:      Number(updated.discount),
      complimentary: Number(updated.complimentary),
      depositIn:     Number(updated.depositIn),
      depositOut:    Number(updated.depositOut),
      receivable:    Number(updated.receivable),
      voucher:       Number(updated.voucher),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
