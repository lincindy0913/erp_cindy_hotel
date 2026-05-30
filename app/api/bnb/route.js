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

const BNB_SELECT = {
  id: true, importMonth: true, warehouse: true, source: true,
  guestName: true, roomNo: true, checkInDate: true, checkOutDate: true,
  roomCharge: true, otherCharge: true, status: true, note: true,
  // 訂金
  payDeposit: true, depositDate: true, depositLast5: true,
  depositBankLineId: true, depositMatchedAt: true, depositMatchedBy: true,
  depositMatchSkip: true, depositMatchSkipNote: true,
  // 當天匯款
  payTransfer: true, transferDate: true, transferLast5: true,
  transferBankLineId: true, transferMatchedAt: true, transferMatchedBy: true,
  transferMatchSkip: true, transferMatchSkipNote: true,
  // 刷卡
  payCard: true, cardFeeRate: true, cardFee: true,
  cardSettlementDate: true, cardBankLineId: true, cardMatchedAt: true, cardMatchedBy: true,
  cardMatchSkip: true, cardMatchSkipNote: true,
  // 現金
  payCash: true, payVoucher: true,
  cashDestination: true, cashDepositDate: true, cashBankLineId: true,
  cashMatchedAt: true, cashMatchedBy: true,
  cashMatchSkip: true, cashMatchSkipNote: true, bossWithdrawNote: true,
  // 付款狀態
  paymentFilled: true, isComplimentary: true, paymentLocked: true, paymentLockedAt: true, paymentLockedBy: true,
  // 出納連動
  depositCashTxId: true, transferCashTxId: true, cashCashTxId: true, cardCashTxId: true,
  // 軟刪除
  deletedAt: true, deletedBy: true, previousStatus: true,
  createdAt: true, updatedAt: true,
};

export async function GET(request) {
  const auth = await requirePermission(PERMISSIONS.BNB_VIEW);
  if (!auth.ok) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const month      = searchParams.get('month');     // 2026-03
    const monthFrom  = searchParams.get('monthFrom'); // 2026-01（月份區間起）
    const monthTo    = searchParams.get('monthTo');   // 2026-05（月份區間迄）
    const warehouse  = searchParams.get('warehouse');
    const source     = searchParams.get('source');
    const status     = searchParams.get('status');
    const guestName  = searchParams.get('guestName');
    const page       = Math.max(1, parseInt(searchParams.get('page')     || '1'));
    const pageSize   = Math.min(2000, Math.max(1, parseInt(searchParams.get('pageSize') || '200')));

    const where = { deletedAt: null };
    if (month)     where.importMonth = month;
    if (monthFrom || monthTo) {
      where.importMonth = {};
      if (monthFrom) where.importMonth.gte = monthFrom;
      if (monthTo)   where.importMonth.lte = monthTo;
    }
    if (warehouse) where.warehouse   = warehouse;
    if (source)    where.source      = source;
    if (status)    where.status      = status;  // explicit status overrides default
    if (guestName) where.guestName   = { contains: guestName.replace(/\s+/g, '').replace(/[%_\\]/g, '\\$&'), mode: 'insensitive' };

    const [total, records] = await prisma.$transaction([
      prisma.bnbBookingRecord.count({ where }),
      prisma.bnbBookingRecord.findMany({
        where,
        select: BNB_SELECT,
        orderBy: [{ checkInDate: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

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

    const data = records.map(r => ({
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
    }));
    return NextResponse.json({ data, total, page, pageSize });
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
    if (checkOutDate <= checkInDate) {
      return createErrorResponse('INVALID_DATE', '退房日期必須晚於入住日期', 400);
    }

    const safeFloat = (v) => { const n = parseFloat(v); return isNaN(n) ? 0 : n; };

    await assertBnbMonthOpen(importMonth, warehouse);

    if (roomNo) {
      const overlap = await prisma.bnbBookingRecord.findFirst({
        where: {
          warehouse, roomNo,
          deletedAt: null,
          status: { notIn: ['取消'] },
          checkInDate: { lt: checkOutDate },
          checkOutDate: { gt: checkInDate },
        },
        select: { id: true, guestName: true, checkInDate: true, checkOutDate: true },
      });
      if (overlap) {
        return createErrorResponse(
          'ROOM_OVERLAP',
          `房號 ${roomNo} 此時段已有訂房（${overlap.guestName}，${overlap.checkInDate}～${overlap.checkOutDate}）`,
          409
        );
      }
    }

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
        isComplimentary: body.isComplimentary === true,
        paymentFilled: body.isComplimentary === true || (pDeposit + pCard + pCash + pVoucher) > 0,
        note: note || null,
      },
      select: BNB_SELECT,
    });

    return NextResponse.json({ ...record, roomCharge: Number(record.roomCharge) }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
