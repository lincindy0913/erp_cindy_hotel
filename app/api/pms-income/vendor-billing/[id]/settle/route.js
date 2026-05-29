/**
 * POST /api/pms-income/vendor-billing/[id]/settle
 *
 * 結帳廠商行程帳單，建立對應金流：
 *   direction=AR → CashTransaction type='收入'  (飯店向代訂中心/旅行社收款)
 *   direction=AP → CashTransaction type='支出'  (飯店支付廠商行程費用)
 *
 * Body: { accountId, settleDate }
 *   accountId  — 必填，該館別對應存簿的 CashAccount.id
 *   settleDate — YYYY-MM-DD，預設今天
 */
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requireAnyPermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import { nextCashTransactionNo } from '@/lib/sequence-generator';
import { todayStr } from '@/lib/localDate';

export const dynamic = 'force-dynamic';

export async function POST(request, { params }) {
  const auth = await requireAnyPermission([PERMISSIONS.PMS_VIEW, PERMISSIONS.PMS_IMPORT]);
  if (!auth.ok) return auth.response;

  try {
    const billingId = parseInt(params.id);
    const body = await request.json();
    const { accountId, settleDate } = body;

    if (!accountId) return createErrorResponse('REQUIRED_FIELD_MISSING', '請選擇存簿帳戶', 400);

    const billing = await prisma.vendorItineraryBilling.findUnique({
      where: { id: billingId },
      include: { items: true },
    });
    if (!billing) return createErrorResponse('NOT_FOUND', '帳單不存在', 404);
    if (billing.status === '已結帳') return createErrorResponse('INVALID_OPERATION', '帳單已結帳', 400);
    if (Number(billing.totalAmount) === 0) return createErrorResponse('INVALID_OPERATION', '帳單金額為零，無法結帳', 400);

    const account = await prisma.cashAccount.findUnique({ where: { id: parseInt(accountId) } });
    if (!account) return createErrorResponse('NOT_FOUND', '帳戶不存在', 404);

    const txDate  = settleDate || todayStr();
    const txType  = billing.direction === 'AR' ? '收入' : '支出';
    const amount  = Number(billing.totalAmount);

    const result = await prisma.$transaction(async (tx) => {
      const txNo = await nextCashTransactionNo(tx, txDate);

      const cashTx = await tx.cashTransaction.create({
        data: {
          transactionNo:      txNo,
          transactionDate:    txDate,
          type:               txType,
          warehouse:          billing.warehouse,
          accountId:          parseInt(accountId),
          supplierId:         billing.supplierId || null,
          amount,
          fee:                0,
          hasFee:             false,
          accountingSubject:  billing.direction === 'AR' ? '應收帳款-行程收款' : '廠商行程費用',
          description:        `${billing.supplierName} ${billing.billingMonth} 行程費用 (${billing.direction})`,
          sourceType:         'VendorItineraryBilling',
          sourceRecordId:     billingId,
          isAutoCreated:      true,
          autoCreationReason: 'vendor_itinerary_settle',
          status:             '已確認',
        },
      });

      // update account balance
      const balanceDelta = billing.direction === 'AR' ? amount : -amount;
      await tx.cashAccount.update({
        where: { id: parseInt(accountId) },
        data:  { currentBalance: { increment: balanceDelta } },
      });

      const updated = await tx.vendorItineraryBilling.update({
        where: { id: billingId },
        data:  {
          status:        '已結帳',
          settledAmount: amount,
          accountId:     parseInt(accountId),
        },
      });

      return { cashTx, billing: updated };
    });

    return NextResponse.json({
      success: true,
      transactionNo: result.cashTx.transactionNo,
      amount,
      type: txType,
      accountName: account.name,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
