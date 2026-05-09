/**
 * POST /api/pms-income/vendor-billing/push-reservations
 *
 * Push 代訂中心 PmsReservationRecord rows into a VendorItineraryBilling.
 * Body: { billingId, reservationIds }
 */
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requireAnyPermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  const auth = await requireAnyPermission([PERMISSIONS.PMS_VIEW, PERMISSIONS.PMS_IMPORT]);
  if (!auth.ok) return auth.response;

  try {
    const { billingId, reservationIds } = await request.json();
    if (!billingId || !Array.isArray(reservationIds) || reservationIds.length === 0) {
      return createErrorResponse('VALIDATION_FAILED', 'billingId 與 reservationIds 為必填', 400);
    }

    const billing = await prisma.vendorItineraryBilling.findUnique({
      where: { id: billingId },
      select: { id: true, status: true, warehouse: true },
    });
    if (!billing) return createErrorResponse('NOT_FOUND', '找不到廠商帳單', 404);
    if (billing.status === '已結帳') {
      return createErrorResponse('VALIDATION_FAILED', '已結帳的帳單不可新增明細', 400);
    }

    const reservations = await prisma.pmsReservationRecord.findMany({
      where: { id: { in: reservationIds } },
    });

    const result = await prisma.$transaction(async (tx) => {
      const created = [];
      for (const r of reservations) {
        const amount = Number(r.totalRevenue) || Number(r.roomRate) || 0;
        const item = await tx.vendorItineraryItem.create({
          data: {
            billingId,
            description: `訂房明細 #${r.reservationNo || r.id} - ${r.guestName || ''}`,
            guestName:   r.guestName || null,
            checkInDate: r.checkIn || r.businessDate,
            checkOutDate: r.checkOut || null,
            roomType:    r.roomType || null,
            quantity:    1,
            unitPrice:   amount,
            amount,
          },
        });
        created.push(item.id);

        // Link reservation to billing
        await tx.pmsReservationRecord.update({
          where: { id: r.id },
          data: { vendorBillingId: billingId },
        });
      }

      // Recalculate billing totalAmount
      const agg = await tx.vendorItineraryItem.aggregate({
        where: { billingId },
        _sum: { amount: true },
      });
      await tx.vendorItineraryBilling.update({
        where: { id: billingId },
        data: { totalAmount: agg._sum.amount || 0 },
      });

      return { createdItemIds: created, count: created.length };
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
