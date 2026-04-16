/**
 * GET  /api/bnb  — 查詢訂房記錄
 * POST /api/bnb  — 新增單筆訂房記錄
 */
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requirePermission, requireAnyPermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import { assertBnbMonthOpen } from '@/lib/bnb-lock';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const auth = await requirePermission(PERMISSIONS.BNB_VIEW);
  if (!auth.ok) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const month     = searchParams.get('month');     // 2026-03
    const warehouse = searchParams.get('warehouse');
    const source    = searchParams.get('source');
    const status    = searchParams.get('status');

    const where = {};
    if (month)     where.importMonth = month;
    if (warehouse) where.warehouse   = warehouse;
    if (source)    where.source      = source;
    if (status)    where.status      = status;

    const records = await prisma.bnbBookingRecord.findMany({
      where,
      orderBy: [{ checkInDate: 'desc' }, { id: 'desc' }],
      take: 2000,
    });

    // 批次查詢哪些 CashTransaction 已有存簿對帳匹配
    const allTxIds = [];
    for (const r of records) {
      if (r.depositCashTxId)  allTxIds.push(r.depositCashTxId);
      if (r.transferCashTxId) allTxIds.push(r.transferCashTxId);
      if (r.cashCashTxId)     allTxIds.push(r.cashCashTxId);
      if (r.cardCashTxId)     allTxIds.push(r.cardCashTxId);
    }
    const matchedLines = allTxIds.length
      ? await prisma.bankStatementLine.findMany({
          where: { matchedTransactionId: { in: allTxIds }, matchStatus: 'matched' },
          select: { matchedTransactionId: true },
        })
      : [];
    const matchedSet = new Set(matchedLines.map(l => l.matchedTransactionId));

    return NextResponse.json(records.map(r => ({
      ...r,
      roomCharge:  Number(r.roomCharge),
      otherCharge: Number(r.otherCharge),
      payDeposit:   Number(r.payDeposit),
      payTransfer:  Number(r.payTransfer),
      payCard:      Number(r.payCard),
      payCash:      Number(r.payCash),
      payVoucher:   Number(r.payVoucher),
      cardFeeRate:  Number(r.cardFeeRate),
      cardFee:      Number(r.cardFee),
      depositMatched:  r.depositCashTxId  ? matchedSet.has(r.depositCashTxId)  : false,
      transferMatched: r.transferCashTxId ? matchedSet.has(r.transferCashTxId) : false,
      cashMatched:     r.cashCashTxId     ? matchedSet.has(r.cashCashTxId)     : false,
      cardMatched:     r.cardCashTxId     ? matchedSet.has(r.cardCashTxId)     : false,
    })));
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request) {
  const auth = await requireAnyPermission([PERMISSIONS.BNB_CREATE, PERMISSIONS.BNB_EDIT]);
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();
    const { importMonth, warehouse = '民宿', source, guestName, roomNo,
            checkInDate, checkOutDate, roomCharge = 0, otherCharge = 0,
            status = '已入住', payDeposit = 0, payCard = 0, payCash = 0,
            payVoucher = 0, cardFeeRate = 0, note } = body;

    if (!importMonth || !source || !guestName || !checkInDate || !checkOutDate) {
      return createErrorResponse('REQUIRED_FIELD_MISSING', '缺少必填欄位', 400);
    }

    const safeFloat = (v) => { const n = parseFloat(v); return isNaN(n) ? 0 : n; };

    await assertBnbMonthOpen(importMonth, warehouse);

    const pDeposit = safeFloat(payDeposit);
    const pCard    = safeFloat(payCard);
    const pCash    = safeFloat(payCash);
    const pVoucher = safeFloat(payVoucher);
    const feeRate  = safeFloat(cardFeeRate);
    const cardFee  = pCard * feeRate;

    const record = await prisma.bnbBookingRecord.create({
      data: {
        importMonth, warehouse, source, guestName, roomNo: roomNo || null,
        checkInDate, checkOutDate,
        roomCharge:  safeFloat(roomCharge),
        otherCharge: safeFloat(otherCharge),
        status,
        payDeposit:  pDeposit,
        payCard:     pCard,
        payCash:     pCash,
        payVoucher:  pVoucher,
        cardFeeRate: feeRate,
        cardFee,
        paymentFilled: (pDeposit + pCard + pCash + pVoucher) > 0,
        note: note || null,
      },
    });

    return NextResponse.json({ ...record, roomCharge: Number(record.roomCharge) }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
