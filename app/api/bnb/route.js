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

    return NextResponse.json(records.map(r => ({
      ...r,
      roomCharge:  Number(r.roomCharge),
      otherCharge: Number(r.otherCharge),
      payDeposit:  Number(r.payDeposit),
      payCard:     Number(r.payCard),
      payCash:     Number(r.payCash),
      payVoucher:  Number(r.payVoucher),
      cardFeeRate: Number(r.cardFeeRate),
      cardFee:     Number(r.cardFee),
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

    await assertBnbMonthOpen(importMonth, warehouse);

    const cardFee = parseFloat(payCard) * parseFloat(cardFeeRate);

    const record = await prisma.bnbBookingRecord.create({
      data: {
        importMonth, warehouse, source, guestName, roomNo: roomNo || null,
        checkInDate, checkOutDate,
        roomCharge: parseFloat(roomCharge),
        otherCharge: parseFloat(otherCharge),
        status,
        payDeposit: parseFloat(payDeposit),
        payCard: parseFloat(payCard),
        payCash: parseFloat(payCash),
        payVoucher: parseFloat(payVoucher),
        cardFeeRate: parseFloat(cardFeeRate),
        cardFee,
        paymentFilled: (parseFloat(payDeposit) + parseFloat(payCard) + parseFloat(payCash) + parseFloat(payVoucher)) > 0,
        note: note || null,
      },
    });

    return NextResponse.json({ ...record, roomCharge: Number(record.roomCharge) }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
