/**
 * GET /api/bnb/audit-summary?month=YYYY-MM&warehouse=
 *
 * 全月訂房稽核摘要（不分頁，用於訂房明細頁頂部的「全月」統計卡）
 * 包含：revenue 類金額 + unfilled / mismatch / overdueUnpaid / cardDateMissing
 */
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import { todayStr } from '@/lib/localDate';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const auth = await requirePermission(PERMISSIONS.BNB_VIEW);
  if (!auth.ok) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const month     = searchParams.get('month');
    const dateFrom  = searchParams.get('dateFrom');
    const dateTo    = searchParams.get('dateTo');
    const warehouse = searchParams.get('warehouse') || '';

    if (!month && !dateFrom && !dateTo) return createErrorResponse('REQUIRED_FIELD_MISSING', '缺少 month 或日期區間參數', 400);

    const where = {
      status: { notIn: ['已刪除'] },
    };
    // 日期區間（依入住日）優先；否則用月份
    if (dateFrom || dateTo) {
      where.checkInDate = {};
      if (dateFrom) where.checkInDate.gte = dateFrom;
      if (dateTo)   where.checkInDate.lte = dateTo;
    } else {
      where.importMonth = month;
    }
    if (warehouse) where.warehouse = warehouse;

    const today = todayStr();

    // 取得全月所有未刪除記錄的稽核所需欄位
    const rows = await prisma.bnbBookingRecord.findMany({
      where,
      select: {
        roomCharge:         true,
        otherCharge:        true,
        payDeposit:         true,
        payTransfer:        true,
        payCard:            true,
        payCash:            true,
        payVoucher:         true,
        cardFee:            true,
        paymentFilled:      true,
        paymentLocked:      true,
        isComplimentary:    true,
        cardSettlementDate: true,
        status:             true,
        checkOutDate:       true,
      },
    });

    let totalCount    = 0;
    let revenue       = 0;
    let payDeposit    = 0;
    let payTransfer   = 0;
    let payCard       = 0;
    let payCash       = 0;
    let payVoucher    = 0;
    let cardFee       = 0;
    let unfilled      = 0;
    let complimentary = 0;
    let locked        = 0;
    let mismatch      = 0;
    let overdueUnpaid = 0;
    let cardDateMissing = 0;

    for (const r of rows) {
      totalCount++;
      const rc  = Number(r.roomCharge   || 0);
      const oc  = Number(r.otherCharge  || 0);
      const pd  = Number(r.payDeposit   || 0);
      const pt  = Number(r.payTransfer  || 0);
      const pc  = Number(r.payCard      || 0);
      const pca = Number(r.payCash      || 0);
      const pv  = Number(r.payVoucher   || 0);
      const cf  = Number(r.cardFee      || 0);

      revenue     += rc + oc;
      payDeposit  += pd;
      payTransfer += pt;
      payCard     += pc;
      payCash     += pca;
      payVoucher  += pv;
      cardFee     += cf;

      if (r.paymentLocked)  locked++;
      if (r.isComplimentary) complimentary++;

      if (!r.paymentFilled && !r.isComplimentary) unfilled++;

      // 已退房 + 未填款 + 超過退房日 → 逾期未收
      if (r.status === '已退房' && !r.paymentFilled && !r.isComplimentary && r.checkOutDate && r.checkOutDate < today) {
        overdueUnpaid++;
      }

      // 刷卡但未填入帳日
      if (pc > 0 && !r.cardSettlementDate) cardDateMissing++;

      // 收支不符（已填款 + 非招待 + |收款合計 - 房費合計| > 0.01）
      if (r.paymentFilled && !r.isComplimentary) {
        const totalPay    = pd + pt + pc + pca + pv;
        const totalCharge = rc + oc;
        if (Math.abs(totalPay - totalCharge) > 0.01) mismatch++;
      }
    }

    return NextResponse.json({
      totalCount,
      revenue,
      payDeposit,
      payTransfer,
      payCard,
      payCash,
      payVoucher,
      cardFee,
      unfilled,
      complimentary,
      locked,
      mismatch,
      overdueUnpaid,
      cardDateMissing,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
