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

// ── 產生 CF- 交易單號 ───────────────────────────────────────────
async function generateTxNo(date) {
  const dateStr = (date || new Date().toISOString().split('T')[0]).replace(/-/g, '');
  const prefix = `CF-${dateStr}-`;
  const existing = await prisma.cashTransaction.findMany({
    where: { transactionNo: { startsWith: prefix } },
    select: { transactionNo: true },
  });
  let max = 0;
  for (const e of existing) {
    const seq = parseInt(e.transactionNo.substring(prefix.length)) || 0;
    if (seq > max) max = seq;
  }
  return `${prefix}${String(max + 1).padStart(4, '0')}`;
}

// ── 建立或更新單筆民宿收入 CashTransaction ──────────────────────
async function upsertBnbTx({ sourceType, sourceRecordId, txDate, amount, description, accountId, categoryId, warehouse }) {
  if (!accountId || !txDate || amount <= 0) return null;

  const existing = await prisma.cashTransaction.findFirst({
    where: { sourceType, sourceRecordId },
    select: { id: true, transactionNo: true, amount: true, transactionDate: true },
  });

  if (existing) {
    // 若金額或日期有變更才 update
    if (Number(existing.amount) !== amount || existing.transactionDate !== txDate) {
      await prisma.cashTransaction.update({
        where: { id: existing.id },
        data: { amount, transactionDate: txDate, description },
      });
    }
    return existing.id;
  }

  const txNo = await generateTxNo(txDate);
  const tx = await prisma.cashTransaction.create({
    data: {
      transactionNo: txNo,
      transactionDate: txDate,
      type: '收入',
      warehouse,
      accountId,
      categoryId: categoryId || null,
      amount,
      description,
      sourceType,
      sourceRecordId,
    },
  });
  return tx.id;
}

// ── 同步民宿收款 → CashTransaction ────────────────────────────
async function syncBnbPaymentTx(bookingId) {
  const booking = await prisma.bnbBookingRecord.findUnique({ where: { id: bookingId } });
  if (!booking) return {};

  // 老闆收取現金 → 先獨立處理 BnbBossWithdraw（不依賴銀行帳戶）
  if (booking.cashDestination === '老闆收取' && Number(booking.payCash) > 0) {
    const exists = await prisma.bnbBossWithdraw.findFirst({ where: { bookingId } });
    if (!exists) {
      await prisma.bnbBossWithdraw.create({
        data: {
          warehouse: booking.warehouse,
          withdrawDate: booking.checkOutDate || booking.checkInDate,
          amount: Number(booking.payCash),
          bookingId,
          guestName: booking.guestName,
          note: booking.bossWithdrawNote || null,
        },
      });
    } else if (Number(exists.amount) !== Number(booking.payCash)) {
      await prisma.bnbBossWithdraw.update({
        where: { id: exists.id },
        data: { amount: Number(booking.payCash), note: booking.bossWithdrawNote || null },
      });
    }
  } else {
    await prisma.bnbBossWithdraw.deleteMany({ where: { bookingId } });
  }

  // 找該館別的銀行帳戶（type: 銀行存款）
  const account = await prisma.cashAccount.findFirst({
    where: { warehouse: booking.warehouse, type: '銀行存款', isActive: true },
    select: { id: true },
  });
  if (!account) {
    console.warn(`[syncBnbPaymentTx] 找不到 warehouse="${booking.warehouse}" 的銀行帳戶（type=銀行存款），請至資金管理新增帳戶。bookingId=${bookingId}`);
    return {};
  }

  // 找民宿收入類別
  const category = await prisma.cashCategory.findFirst({
    where: { OR: [{ systemCode: 'bnb_income' }, { name: { contains: '民宿' }, type: '收入' }] },
    select: { id: true },
  });

  const baseDesc = `${booking.guestName} ${booking.checkInDate}`;
  const wh = booking.warehouse;
  const acctId = account.id;
  const catId  = category?.id || null;
  const updates = {};

  // 1. 訂金匯款
  if (booking.depositDate && Number(booking.payDeposit) > 0) {
    const txId = await upsertBnbTx({
      sourceType: 'bnb_deposit', sourceRecordId: bookingId,
      txDate: booking.depositDate, amount: Number(booking.payDeposit),
      description: `訂金匯款 ${baseDesc}`,
      accountId: acctId, categoryId: catId, warehouse: wh,
    });
    if (txId) updates.depositCashTxId = txId;
  }

  // 1b. 當天匯款
  if (booking.transferDate && Number(booking.payTransfer) > 0) {
    const txId = await upsertBnbTx({
      sourceType: 'bnb_transfer', sourceRecordId: bookingId,
      txDate: booking.transferDate, amount: Number(booking.payTransfer),
      description: `當天匯款 ${baseDesc}`,
      accountId: acctId, categoryId: catId, warehouse: wh,
    });
    if (txId) updates.transferCashTxId = txId;
  } else if (booking.transferCashTxId) {
    // 若清除匯款金額或日期 → 刪除舊的 CashTransaction
    await prisma.cashTransaction.deleteMany({ where: { sourceType: 'bnb_transfer', sourceRecordId: bookingId } });
    updates.transferCashTxId = null;
  }

  // 2. 現金存帳
  if (booking.cashDestination === '存帳' && booking.cashDepositDate && Number(booking.payCash) > 0) {
    const txId = await upsertBnbTx({
      sourceType: 'bnb_cash', sourceRecordId: bookingId,
      txDate: booking.cashDepositDate, amount: Number(booking.payCash),
      description: `現金存入 ${baseDesc}`,
      accountId: acctId, categoryId: catId, warehouse: wh,
    });
    if (txId) updates.cashCashTxId = txId;
  } else if (booking.cashCashTxId) {
    // 若改為老闆收取 → 刪除舊的 CashTransaction
    await prisma.cashTransaction.deleteMany({ where: { sourceType: 'bnb_cash', sourceRecordId: bookingId } });
    updates.cashCashTxId = null;
  }

  // 3. 刷卡入帳（淨額 = 刷卡 - 手續費）
  if (booking.cardSettlementDate && Number(booking.payCard) > 0) {
    const net = Number(booking.payCard) - Number(booking.cardFee);
    const txId = await upsertBnbTx({
      sourceType: 'bnb_card', sourceRecordId: bookingId,
      txDate: booking.cardSettlementDate, amount: net > 0 ? net : Number(booking.payCard),
      description: `刷卡入帳 ${baseDesc}`,
      accountId: acctId, categoryId: catId, warehouse: wh,
    });
    if (txId) updates.cardCashTxId = txId;
  }

  if (Object.keys(updates).length > 0) {
    await prisma.bnbBookingRecord.update({ where: { id: bookingId }, data: updates });
  }
  return updates;
}

// ── PATCH ──────────────────────────────────────────────────────
export async function PATCH(request, { params }) {
  const auth = await requireAnyPermission([PERMISSIONS.BNB_EDIT, PERMISSIONS.BNB_CREATE]);
  if (!auth.ok) return auth.response;

  try {
    const id = parseInt(params.id);

    const record = await prisma.bnbBookingRecord.findUnique({
      where: { id },
      select: { importMonth: true, warehouse: true, paymentLocked: true },
    });
    if (!record) return createErrorResponse('NOT_FOUND', '找不到該筆紀錄', 404);
    await assertBnbMonthOpen(record.importMonth, record.warehouse);

    const body = await request.json();

    // 鎖定的付款列，只允許有 BNB_LOCK 權限的人修改付款欄位
    const isPaymentField = ['payDeposit','depositLast5','payTransfer','transferLast5','payCard','payCash','payVoucher','cardFeeRate'].some(f => f in body);
    if (record.paymentLocked && isPaymentField) {
      const lockAuth = await requireAnyPermission([PERMISSIONS.BNB_LOCK, PERMISSIONS.BNB_EDIT]);
      if (!lockAuth.ok) return createErrorResponse('FORBIDDEN', '此筆已鎖帳，需有鎖帳權限才能修改付款資料', 403);
    }

    // 逐筆解鎖需要 BNB_LOCK 權限
    if (body.paymentLocked === false) {
      const lockAuth = await requireAnyPermission([PERMISSIONS.BNB_LOCK, PERMISSIONS.BNB_EDIT]);
      if (!lockAuth.ok) return createErrorResponse('FORBIDDEN', '需有鎖帳權限才能解鎖', 403);
    }

    const {
      payDeposit, depositDate, depositLast5,
      payTransfer, transferDate, transferLast5,
      payCard, payCash, payVoucher, cardFeeRate,
      status, note, roomCharge, otherCharge, source, guestName,
      roomNo, checkInDate, checkOutDate, paymentLocked,
      // 新增金流欄位
      cashDestination, cashDepositDate, bossWithdrawNote, cardSettlementDate,
    } = body;

    const updateData = {};
    if (payDeposit        !== undefined) updateData.payDeposit        = parseFloat(payDeposit);
    if (depositDate       !== undefined) updateData.depositDate       = depositDate || null;
    if (depositLast5      !== undefined) updateData.depositLast5      = depositLast5 || null;
    if (payTransfer       !== undefined) updateData.payTransfer       = parseFloat(payTransfer);
    if (transferDate      !== undefined) updateData.transferDate      = transferDate || null;
    if (transferLast5     !== undefined) updateData.transferLast5     = transferLast5 || null;
    if (payCard           !== undefined) updateData.payCard           = parseFloat(payCard);
    if (payCash           !== undefined) updateData.payCash           = parseFloat(payCash);
    if (payVoucher        !== undefined) updateData.payVoucher        = parseFloat(payVoucher);
    if (cardFeeRate       !== undefined) updateData.cardFeeRate       = parseFloat(cardFeeRate);
    if (status            !== undefined) updateData.status            = status;
    if (note              !== undefined) updateData.note              = note;
    if (roomCharge        !== undefined) updateData.roomCharge        = parseFloat(roomCharge);
    if (otherCharge       !== undefined) updateData.otherCharge       = parseFloat(otherCharge);
    if (source            !== undefined) updateData.source            = source;
    if (guestName         !== undefined) updateData.guestName         = guestName;
    if (roomNo            !== undefined) updateData.roomNo            = roomNo || null;
    if (checkInDate       !== undefined) updateData.checkInDate       = checkInDate;
    if (checkOutDate      !== undefined) updateData.checkOutDate      = checkOutDate;
    if (cashDestination   !== undefined) updateData.cashDestination   = cashDestination || null;
    if (cashDepositDate   !== undefined) updateData.cashDepositDate   = cashDepositDate || null;
    if (bossWithdrawNote  !== undefined) updateData.bossWithdrawNote  = bossWithdrawNote || null;
    if (cardSettlementDate !== undefined) updateData.cardSettlementDate = cardSettlementDate || null;
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
    if (updateData.payDeposit  !== undefined || updateData.payTransfer !== undefined ||
        updateData.payCard     !== undefined || updateData.payCash     !== undefined ||
        updateData.payVoucher  !== undefined) {
      const existing = await prisma.bnbBookingRecord.findUnique({ where: { id } });
      const dep = updateData.payDeposit  ?? Number(existing.payDeposit);
      const trn = updateData.payTransfer ?? Number(existing.payTransfer);
      const crd = updateData.payCard     ?? Number(existing.payCard);
      const csh = updateData.payCash     ?? Number(existing.payCash);
      const vch = updateData.payVoucher  ?? Number(existing.payVoucher);
      updateData.paymentFilled = (dep + trn + crd + csh + vch) > 0;
    }

    const updated = await prisma.bnbBookingRecord.update({ where: { id }, data: updateData });

    // 若付款相關欄位有變動，異步同步 CashTransaction（fire-and-forget）
    const paymentChanged = ['payDeposit','depositDate','payTransfer','transferDate','payCash','cashDestination','cashDepositDate','payCard','cardFeeRate','cardSettlementDate'].some(f => f in body);
    if (paymentChanged) {
      syncBnbPaymentTx(id).catch(() => {});
    }

    return NextResponse.json({ ...updated, roomCharge: Number(updated.roomCharge) });
  } catch (error) {
    return handleApiError(error);
  }
}

// ── DELETE ─────────────────────────────────────────────────────
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
