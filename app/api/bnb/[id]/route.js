/**
 * PATCH /api/bnb/[id] — 更新付款明細或備註
 * DELETE /api/bnb/[id] — 刪除單筆記錄
 */
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requireAnyPermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import { assertBnbMonthOpen } from '@/lib/bnb-lock';

export const dynamic = 'force-dynamic';

export async function PATCH(request, { params }) {
  const auth = await requireAnyPermission([PERMISSIONS.BNB_EDIT, PERMISSIONS.BNB_CREATE]);
  if (!auth.ok) return auth.response;

  try {
    const id   = parseInt(params.id);

    const record = await prisma.bnbBookingRecord.findUnique({
      where: { id },
      select: { importMonth: true, warehouse: true, paymentLocked: true },
    });
    if (!record) return createErrorResponse('NOT_FOUND', '找不到該筆紀錄', 404);
    await assertBnbMonthOpen(record.importMonth, record.warehouse);

    const body = await request.json();

    // 鎖定的付款列，只允許有 BNB_LOCK 權限的人修改付款欄位
    const isPaymentField = ['payDeposit','depositLast5','payCard','payCash','payVoucher','cardFeeRate'].some(f => f in body);
    if (record.paymentLocked && isPaymentField) {
      const lockAuth = await requireAnyPermission([PERMISSIONS.BNB_LOCK, PERMISSIONS.BNB_EDIT]);
      if (!lockAuth.ok) return createErrorResponse('FORBIDDEN', '此筆已鎖帳，需有鎖帳權限才能修改付款資料', 403);
    }

    // 逐筆解鎖需要 BNB_LOCK 權限
    if (body.paymentLocked === false) {
      const lockAuth = await requireAnyPermission([PERMISSIONS.BNB_LOCK, PERMISSIONS.BNB_EDIT]);
      if (!lockAuth.ok) return createErrorResponse('FORBIDDEN', '需有鎖帳權限才能解鎖', 403);
    }

    const { payDeposit, depositDate, depositLast5,
            payCard, payCash, payVoucher, cardFeeRate,
            status, note, roomCharge, otherCharge, source, guestName,
            roomNo, checkInDate, checkOutDate, paymentLocked } = body;

    const updateData = {};
    if (payDeposit   !== undefined) updateData.payDeposit   = parseFloat(payDeposit);
    if (depositDate  !== undefined) updateData.depositDate  = depositDate || null;
    if (depositLast5 !== undefined) updateData.depositLast5 = depositLast5 || null;
    if (payCard      !== undefined) updateData.payCard      = parseFloat(payCard);
    if (payCash     !== undefined) updateData.payCash     = parseFloat(payCash);
    if (payVoucher  !== undefined) updateData.payVoucher  = parseFloat(payVoucher);
    if (cardFeeRate !== undefined) updateData.cardFeeRate = parseFloat(cardFeeRate);
    if (status      !== undefined) updateData.status      = status;
    if (note        !== undefined) updateData.note        = note;
    if (roomCharge  !== undefined) updateData.roomCharge  = parseFloat(roomCharge);
    if (otherCharge !== undefined) updateData.otherCharge = parseFloat(otherCharge);
    if (source      !== undefined) updateData.source      = source;
    if (guestName   !== undefined) updateData.guestName   = guestName;
    if (roomNo      !== undefined) updateData.roomNo      = roomNo || null;
    if (checkInDate !== undefined) updateData.checkInDate = checkInDate;
    if (checkOutDate !== undefined) updateData.checkOutDate = checkOutDate;
    if (paymentLocked === false) {
      updateData.paymentLocked   = false;
      updateData.paymentLockedAt = null;
      updateData.paymentLockedBy = null;
    }

    // 重新計算手續費
    if (updateData.payCard !== undefined || updateData.cardFeeRate !== undefined) {
      const existing = await prisma.bnbBookingRecord.findUnique({ where: { id }, select: { payCard: true, cardFeeRate: true } });
      const card = updateData.payCard     ?? Number(existing.payCard);
      const rate = updateData.cardFeeRate ?? Number(existing.cardFeeRate);
      updateData.cardFee = card * rate;
    }

    // 自動標記付款已填
    if (updateData.payDeposit !== undefined || updateData.payCard !== undefined ||
        updateData.payCash    !== undefined || updateData.payVoucher !== undefined) {
      const existing = await prisma.bnbBookingRecord.findUnique({ where: { id } });
      const dep = updateData.payDeposit ?? Number(existing.payDeposit);
      const crd = updateData.payCard    ?? Number(existing.payCard);
      const csh = updateData.payCash    ?? Number(existing.payCash);
      const vch = updateData.payVoucher ?? Number(existing.payVoucher);
      updateData.paymentFilled = (dep + crd + csh + vch) > 0;
    }

    const updated = await prisma.bnbBookingRecord.update({ where: { id }, data: updateData });
    return NextResponse.json({ ...updated, roomCharge: Number(updated.roomCharge) });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request, { params }) {
  const auth = await requireAnyPermission([PERMISSIONS.BNB_EDIT]);
  if (!auth.ok) return auth.response;

  try {
    const id = parseInt(params.id);
    const record = await prisma.bnbBookingRecord.findUnique({ where: { id }, select: { importMonth: true, warehouse: true } });
    if (!record) return createErrorResponse('NOT_FOUND', '找不到該筆紀錄', 404);
    await assertBnbMonthOpen(record.importMonth, record.warehouse);

    await prisma.bnbBookingRecord.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
