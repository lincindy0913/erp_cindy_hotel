import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requireAnyPermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import { nextCashTransactionNo } from '@/lib/sequence-generator';

export const dynamic = 'force-dynamic';

// GET: reservations with credit card > 0 + matching CreditCardStatement for the month
export async function GET(request) {
  const auth = await requireAnyPermission([PERMISSIONS.PMS_VIEW, PERMISSIONS.PMS_IMPORT]);
  if (!auth.ok) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const warehouse = searchParams.get('warehouse');
    const month = searchParams.get('month'); // YYYY-MM

    const where = { creditCard: { gt: 0 } };
    if (warehouse) where.warehouse = warehouse;
    if (month) where.businessDate = { startsWith: month };

    const [rows, ccStatements] = await Promise.all([
      prisma.pmsReservationRecord.findMany({
        where,
        orderBy: [{ businessDate: 'asc' }, { id: 'asc' }],
        take: 1000,
      }),
      // Fetch CreditCardStatement for this warehouse+month
      month ? prisma.creditCardStatement.findMany({
        where: {
          ...(warehouse ? { warehouse } : {}),
          billingDate: {
            startsWith: month.replace('-', '/'),
          },
        },
        select: {
          id: true, warehouse: true, bankName: true, billingDate: true, paymentDate: true,
          totalCount: true, totalAmount: true, totalFee: true, netAmount: true,
          status: true, pmsAmount: true, difference: true,
        },
        orderBy: { billingDate: 'asc' },
        take: 50,
      }) : Promise.resolve([]),
    ]);

    return NextResponse.json({
      reservations: rows.map(r => ({
        ...r,
        creditCard:    Number(r.creditCard),
        totalRevenue:  Number(r.totalRevenue),
        ccFeeRate:     r.ccFeeRate ? Number(r.ccFeeRate) : null,
        ccFeeAmount:   r.ccFeeAmount ? Number(r.ccFeeAmount) : null,
        ccNetAmount:   r.ccNetAmount ? Number(r.ccNetAmount) : null,
        ccActualNet:   r.ccActualNet ? Number(r.ccActualNet) : null,
        ccDiff:        r.ccDiff ? Number(r.ccDiff) : null,
      })),
      ccStatements: ccStatements.map(s => ({
        ...s,
        totalAmount: Number(s.totalAmount),
        totalFee:    Number(s.totalFee),
        netAmount:   Number(s.netAmount),
        pmsAmount:   s.pmsAmount != null ? Number(s.pmsAmount) : null,
        difference:  s.difference != null ? Number(s.difference) : null,
      })),
    });
  } catch (error) {
    return handleApiError(error);
  }
}

// POST: run credit card fee reconciliation for selected reservations
export async function POST(request) {
  const auth = await requireAnyPermission([PERMISSIONS.PMS_VIEW, PERMISSIONS.PMS_IMPORT]);
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();
    // body: { warehouse, date, feeRate, reservationIds: number[] }
    const { warehouse, date, feeRate, reservationIds } = body;
    if (!warehouse || !date || feeRate == null || !Array.isArray(reservationIds) || reservationIds.length === 0) {
      return createErrorResponse('VALIDATION_FAILED', 'warehouse, date, feeRate, reservationIds 為必填', 400);
    }

    const rate = parseFloat(feeRate);
    if (isNaN(rate) || rate < 0 || rate > 1) {
      return createErrorResponse('VALIDATION_FAILED', '手續費率需為 0~1 之間的小數', 400);
    }

    const bankAccount = await prisma.cashAccount.findFirst({
      where: { warehouse, type: '銀行存款', isActive: true },
      select: { id: true },
    });

    const updated = await prisma.$transaction(async (tx) => {
      const reservations = await tx.pmsReservationRecord.findMany({
        where: { id: { in: reservationIds }, warehouse },
      });

      const results = [];
      for (const r of reservations) {
        const gross = Number(r.creditCard);
        if (gross <= 0) continue;

        const fee = Math.round(gross * rate * 100) / 100;
        const net = Math.round((gross - fee) * 100) / 100;

        const updateData = {
          ccFeeRate:       rate,
          ccFeeAmount:     fee,
          ccNetAmount:     net,
          ccSettleDate:    date,
          creditCardStatus: '已核對',
        };

        // Create fee CashTransaction if account exists
        if (bankAccount && fee > 0) {
          const txNo = await nextCashTransactionNo(tx, date);
          await tx.cashTransaction.create({
            data: {
              transactionNo: txNo,
              transactionDate: date,
              type: '支出',
              amount: fee,
              accountId: bankAccount.id,
              description: `信用卡手續費 - ${r.guestName || r.reservationNo || ''}`,
              warehouse,
              isAutoCreated: true,
              sourceType: 'PmsReservation',
              sourceRecordId: r.id,
            },
          });
        }

        const upd = await tx.pmsReservationRecord.update({
          where: { id: r.id },
          data: updateData,
        });
        results.push(upd.id);
      }
      return results;
    });

    return NextResponse.json({ updatedIds: updated, count: updated.length });
  } catch (error) {
    return handleApiError(error);
  }
}
