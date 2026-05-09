import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requireAnyPermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import { auditFromSession, AUDIT_ACTIONS } from '@/lib/audit';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../auth/[...nextauth]/route';

export const dynamic = 'force-dynamic';

export async function DELETE(request, { params }) {
  const auth = await requireAnyPermission([PERMISSIONS.PMS_VIEW, PERMISSIONS.PMS_IMPORT]);
  if (!auth.ok) return auth.response;

  const id = parseInt(params.id);
  if (!id) return createErrorResponse('VALIDATION_FAILED', '無效的 ID', 400);

  try {
    // Check settlement status — reject delete if month is settled
    const record = await prisma.pmsReservationRecord.findUnique({
      where: { id },
      select: { warehouse: true, businessDate: true },
    });
    if (!record) return createErrorResponse('NOT_FOUND', '找不到記錄', 404);

    const month = record.businessDate.slice(0, 7); // YYYY-MM
    const settledBatch = await prisma.pmsImportBatch.findFirst({
      where: { warehouse: record.warehouse, businessDate: { startsWith: month }, status: '已結算' },
      select: { id: true },
    });
    if (settledBatch) {
      return createErrorResponse('VALIDATION_FAILED', '該月份已結算，無法刪除記錄', 403);
    }

    await prisma.pmsReservationRecord.delete({ where: { id } });
    return NextResponse.json({ deleted: true });
  } catch (error) {
    return handleApiError(error);
  }
}

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
      // Amount fields — allowed for manual correction
      'totalRevenue', 'cash', 'creditCard', 'wireTransfer', 'commission',
      'depositIn', 'depositOut', 'receivable', 'voucher',
    ];
    const updateData = {};
    for (const k of allowed) {
      if (k in body) updateData[k] = body[k];
    }

    // Fetch before state for audit (only when status/amount fields change)
    const before = await prisma.pmsReservationRecord.findUnique({ where: { id } });

    const updated = await prisma.pmsReservationRecord.update({
      where: { id },
      data: updateData,
    });

    // Audit log for meaningful changes
    const session = await getServerSession(authOptions);
    if (session) {
      const changedKeys = Object.keys(updateData);
      const noteFields = ['creditCardStatus', 'depositStatus', 'sourceOverride',
        'totalRevenue', 'cash', 'creditCard', 'wireTransfer', 'commission',
        'depositIn', 'depositOut'];
      if (changedKeys.some(k => noteFields.includes(k))) {
        const beforeSnap = {};
        const afterSnap  = {};
        for (const k of changedKeys) {
          beforeSnap[k] = before?.[k];
          afterSnap[k]  = updated[k];
        }
        await auditFromSession(prisma, session, {
          action: AUDIT_ACTIONS.CASH_TRANSACTION_UPDATE,
          targetModule: 'pms_reservation',
          targetId: id,
          beforeState: beforeSnap,
          afterState: afterSnap,
          note: `訂房記錄修改 id=${id} ${updated.guestName || ''} ${updated.businessDate || ''}`,
        }).catch(() => {});
      }
    }

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
