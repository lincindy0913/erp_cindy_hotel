import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requireAnyPermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import { nextCashTransactionNo } from '@/lib/sequence-generator';

export const dynamic = 'force-dynamic';

// GET: reservations with credit card > 0 + matching CreditCardStatement + merchant config
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

    const [rows, ccStatements, merchantConfig] = await Promise.all([
      prisma.pmsReservationRecord.findMany({
        where,
        orderBy: [{ businessDate: 'asc' }, { id: 'asc' }],
        take: 1000,
      }),
      month ? prisma.creditCardStatement.findMany({
        where: {
          ...(warehouse ? { warehouse } : {}),
          billingDate: { startsWith: month.replace('-', '/') },
        },
        select: {
          id: true, warehouse: true, bankName: true, billingDate: true, paymentDate: true,
          totalCount: true, totalAmount: true, totalFee: true, netAmount: true,
          status: true, pmsAmount: true, difference: true,
        },
        orderBy: { billingDate: 'asc' },
        take: 50,
      }) : Promise.resolve([]),
      // 取得館別的信用卡特店設定（含費率）
      warehouse ? prisma.creditCardMerchantConfig.findFirst({
        where: {
          warehouse: { name: warehouse },
          isActive: true,
        },
        select: {
          id: true, bankName: true, merchantId: true,
          domesticFeeRate: true, foreignFeeRate: true, selfFeeRate: true,
          cashAccountId: true,
        },
      }).catch(() => null) : Promise.resolve(null),
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
      // 費率設定（供前端顯示預設值與修改連結）
      merchantConfig: merchantConfig ? {
        id: merchantConfig.id,
        bankName: merchantConfig.bankName,
        merchantId: merchantConfig.merchantId,
        domesticFeeRate:  Number(merchantConfig.domesticFeeRate),   // 如 1.70 (%)
        foreignFeeRate:   Number(merchantConfig.foreignFeeRate),
        selfFeeRate:      Number(merchantConfig.selfFeeRate),
        cashAccountId:    merchantConfig.cashAccountId,
      } : null,
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

    // 取得特店設定（用來決定入帳帳戶）
    const merchantConfig = await prisma.creditCardMerchantConfig.findFirst({
      where: { warehouse: { name: warehouse }, isActive: true },
      select: { cashAccountId: true, domesticFeeRate: true },
    }).catch(() => null);

    // 入帳帳戶：優先用特店設定的帳戶，否則取館別銀行帳戶
    const settleAccountId = merchantConfig?.cashAccountId ?? bankAccount?.id ?? null;

    const updated = await prisma.$transaction(async (tx) => {
      const reservations = await tx.pmsReservationRecord.findMany({
        where: { id: { in: reservationIds }, warehouse },
      });

      const results = [];
      let batchGross = 0;
      let batchFee   = 0;
      let batchNet   = 0;

      for (const r of reservations) {
        const gross = Number(r.creditCard);
        if (gross <= 0) continue;

        const fee = Math.round(gross * rate * 100) / 100;
        const net = Math.round((gross - fee) * 100) / 100;

        batchGross += gross;
        batchFee   += fee;
        batchNet   += net;

        const updateData = {
          ccFeeRate:        rate,
          ccFeeAmount:      fee,
          ccNetAmount:      net,
          ccSettleDate:     date,
          creditCardStatus: '已核對',
        };

        // 逐筆記錄手續費（支出）
        if (settleAccountId && fee > 0) {
          const txNo = await nextCashTransactionNo(tx, date);
          await tx.cashTransaction.create({
            data: {
              transactionNo: txNo,
              transactionDate: date,
              type: '支出',
              amount: fee,
              accountId: settleAccountId,
              description: `信用卡手續費 - ${r.guestName || r.reservationNo || ''}（${rate * 100}%）`,
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

      // 批次結帳：建立一筆淨額收入（隔日入存簿）
      if (settleAccountId && batchNet > 0) {
        const txNo = await nextCashTransactionNo(tx, date);
        await tx.cashTransaction.create({
          data: {
            transactionNo: txNo,
            transactionDate: date,         // 結帳日（隔天）
            type: '收入',
            amount: Math.round(batchNet * 100) / 100,
            accountId: settleAccountId,
            description: `信用卡批次結帳入帳 ${date}（${results.length} 筆，費率 ${(rate * 100).toFixed(2)}%）`,
            warehouse,
            isAutoCreated: true,
            sourceType: 'PmsCcBatchSettle',
            sourceRecordId: null,
          },
        });
      }

      return { ids: results, batchGross, batchFee, batchNet };
    });

    return NextResponse.json({
      updatedIds: updated.ids,
      count: updated.ids.length,
      batchGross: updated.batchGross,
      batchFee:   updated.batchFee,
      batchNet:   updated.batchNet,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
