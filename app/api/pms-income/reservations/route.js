import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { handleApiError } from '@/lib/error-handler';
import { requireAnyPermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const auth = await requireAnyPermission([PERMISSIONS.PMS_VIEW, PERMISSIONS.PMS_IMPORT]);
  if (!auth.ok) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const warehouse = searchParams.get('warehouse');
    const month = searchParams.get('month'); // YYYY-MM
    const dateFrom = searchParams.get('dateFrom'); // YYYY-MM-DD
    const dateTo = searchParams.get('dateTo');     // YYYY-MM-DD
    const source = searchParams.get('source');
    const depositStatus = searchParams.get('depositStatus');
    const creditCardStatus = searchParams.get('creditCardStatus');
    const take = parseInt(searchParams.get('take') || '500');

    const where = {};
    if (warehouse) where.warehouse = warehouse;
    if (dateFrom && dateTo) {
      where.businessDate = { gte: dateFrom, lte: dateTo };
    } else if (dateFrom) {
      where.businessDate = { gte: dateFrom };
    } else if (dateTo) {
      where.businessDate = { lte: dateTo };
    } else if (month) {
      where.businessDate = { startsWith: month };
    }
    if (source) where.source = source;
    if (depositStatus) where.depositStatus = depositStatus;
    if (creditCardStatus) where.creditCardStatus = creditCardStatus;

    const rows = await prisma.pmsReservationRecord.findMany({
      where,
      orderBy: [{ businessDate: 'desc' }, { id: 'asc' }],
      take,
    });

    const result = rows.map(r => ({
      ...r,
      roomRate:      Number(r.roomRate),
      serviceFee:    Number(r.serviceFee),
      otherCharges:  Number(r.otherCharges),
      totalRevenue:  Number(r.totalRevenue),
      cash:          Number(r.cash),
      creditCard:    Number(r.creditCard),
      wireTransfer:  Number(r.wireTransfer),
      commission:    Number(r.commission),
      discount:      Number(r.discount),
      complimentary: Number(r.complimentary),
      depositIn:     Number(r.depositIn),
      depositOut:    Number(r.depositOut),
      receivable:    Number(r.receivable),
      voucher:       Number(r.voucher),
      ccFeeRate:     r.ccFeeRate ? Number(r.ccFeeRate) : null,
      ccFeeAmount:   r.ccFeeAmount ? Number(r.ccFeeAmount) : null,
      ccNetAmount:   r.ccNetAmount ? Number(r.ccNetAmount) : null,
      ccActualNet:   r.ccActualNet ? Number(r.ccActualNet) : null,
      ccDiff:        r.ccDiff ? Number(r.ccDiff) : null,
    }));

    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}
