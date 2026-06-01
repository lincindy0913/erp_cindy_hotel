/**
 * GET    /api/bnb/[id] — 取得單筆訂房記錄
 * PATCH  /api/bnb/[id] — 更新付款明細或備註
 * DELETE /api/bnb/[id] — 刪除單筆記錄
 */
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requireAnyPermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import { assertBnbMonthOpen } from '@/lib/bnb-lock';
import { PAY_TYPE_KEYS, bookingToPaymentEntry, syncPaymentEntry } from '@/lib/bnb-pay-types';

export const dynamic = 'force-dynamic';

// ── 同步民宿收款 → CashTransaction（實作在 lib/syncBnbPaymentTx.js）────
async function syncBnbPaymentTx(bookingId) {
  const booking = await prisma.bnbBookingRecord.findUnique({
    where: { id: bookingId },
    select: {
      warehouse: true, guestName: true, checkInDate: true, checkOutDate: true,
      cashDestination: true, payCash: true, bossWithdrawNote: true,
      depositDate: true, payDeposit: true, depositCashTxId: true,
      transferDate: true, payTransfer: true, transferCashTxId: true,
      cashDepositDate: true, cashCashTxId: true,
      cardSettlementDate: true, payCard: true, cardFee: true, cardCashTxId: true,
    },
  });
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

// ── GET ────────────────────────────────────────────────────────
export async function GET(request, { params }) {
  const auth = await requireAnyPermission([PERMISSIONS.BNB_VIEW, PERMISSIONS.BNB_EDIT]);
  if (!auth.ok) return auth.response;
  try {
    const id = parseInt((await params).id);
    const record = await prisma.bnbBookingRecord.findUnique({ where: { id } });
    if (!record) return createErrorResponse('NOT_FOUND', '找不到此訂房記錄', 404);
    return NextResponse.json(record);
  } catch (error) {
    return handleApiError(error);
  }
}

// ── PATCH ──────────────────────────────────────────────────────
export async function PATCH(request, { params }) {
  const auth = await requireAnyPermission([PERMISSIONS.BNB_EDIT, PERMISSIONS.BNB_CREATE]);
  if (!auth.ok) return auth.response;

  try {
    const id = parseInt((await params).id);

    const record = await prisma.bnbBookingRecord.findUnique({
      where: { id },
      select: { importMonth: true, warehouse: true, paymentLocked: true },
    });
    if (!record) return createErrorResponse('NOT_FOUND', '找不到該筆紀錄', 404);
    await assertBnbMonthOpen(record.importMonth, record.warehouse);

    const body = await request.json();

    if (body.status === '已刪除') {
      return createErrorResponse('FORBIDDEN', '刪除請使用 DELETE，不可直接設定「已刪除」狀態', 400);
    }

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

    const NUM_FIELDS      = ['payDeposit','payTransfer','payCard','payCash','payVoucher','cardFeeRate','roomCharge','otherCharge'];
    const STR_NULL_FIELDS = ['depositDate','depositLast5','transferDate','transferLast5','roomNo',
                              'cashDestination','cashDepositDate','bossWithdrawNote','cardSettlementDate'];
    const STR_FIELDS      = ['status','note','source','guestName','checkInDate','checkOutDate'];

    const updateData = {};
    for (const f of NUM_FIELDS)      if (f in body) updateData[f] = parseFloat(body[f]);
    for (const f of STR_NULL_FIELDS) if (f in body) updateData[f] = body[f] || null;
    for (const f of STR_FIELDS)      if (f in body) updateData[f] = body[f];

    if (body.paymentLocked === false) {
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

    // M8: accept isComplimentary
    if (body.isComplimentary !== undefined) updateData.isComplimentary = body.isComplimentary === true;

    // 自動標記付款已填：金額 > 0 OR 標記為招待才算 filled
    if (updateData.payDeposit !== undefined || updateData.payTransfer !== undefined ||
        updateData.payCard    !== undefined || updateData.payCash     !== undefined ||
        updateData.payVoucher !== undefined || updateData.isComplimentary !== undefined) {
      const existing = await prisma.bnbBookingRecord.findUnique({
        where: { id },
        select: { payDeposit: true, payTransfer: true, payCard: true, payCash: true, payVoucher: true, isComplimentary: true },
      });
      const dep  = updateData.payDeposit    ?? Number(existing.payDeposit);
      const trn  = updateData.payTransfer   ?? Number(existing.payTransfer);
      const crd  = updateData.payCard       ?? Number(existing.payCard);
      const csh  = updateData.payCash       ?? Number(existing.payCash);
      const vch  = updateData.payVoucher    ?? Number(existing.payVoucher);
      const comp = updateData.isComplimentary ?? existing.isComplimentary;
      updateData.paymentFilled = comp || (dep + trn + crd + csh + vch) > 0;
    }

    const updated = await prisma.bnbBookingRecord.update({
      where: { id },
      data: updateData,
      select: { id: true, roomCharge: true, paymentFilled: true, isComplimentary: true, cardFee: true,
                payDeposit: true, payTransfer: true, payCard: true, payCash: true, payVoucher: true },
    });

    // B16 雙寫：付款欄位有變動時同步更新 BnbPaymentEntry
    if (Object.keys(updateData).some(k => ['payDeposit','payTransfer','payCard','payCash','payVoucher',
        'depositDate','transferDate','cardSettlementDate','cashDepositDate',
        'depositLast5','transferLast5','cashDestination','bossWithdrawNote','cardFeeRate'].includes(k))) {
      const refreshed = await prisma.bnbBookingRecord.findUnique({
        where: { id },
        select: {
          payDeposit: true, depositDate: true, depositLast5: true, depositBankLineId: true,
          depositMatchedAt: true, depositMatchedBy: true, depositMatchSkip: true, depositMatchSkipNote: true, depositCashTxId: true,
          payTransfer: true, transferDate: true, transferLast5: true, transferBankLineId: true,
          transferMatchedAt: true, transferMatchedBy: true, transferMatchSkip: true, transferMatchSkipNote: true, transferCashTxId: true,
          payCard: true, cardFeeRate: true, cardFee: true, cardSettlementDate: true, cardBankLineId: true,
          cardMatchedAt: true, cardMatchedBy: true, cardMatchSkip: true, cardMatchSkipNote: true, cardCashTxId: true,
          payCash: true, cashDepositDate: true, cashDestination: true, bossWithdrawNote: true, cashBankLineId: true,
          cashMatchedAt: true, cashMatchedBy: true, cashMatchSkip: true, cashMatchSkipNote: true, cashCashTxId: true,
          payVoucher: true,
        },
      });
      if (refreshed) {
        for (const payType of PAY_TYPE_KEYS) {
          const entryData = bookingToPaymentEntry(refreshed, payType);
          if (entryData) await syncPaymentEntry(prisma, id, payType, entryData).catch(() => {});
        }
      }
    }

    // M1: 改為 await + 失敗時回 207，不再 fire-and-forget
    const paymentChanged = ['payDeposit','depositDate','payTransfer','transferDate','payCash','cashDestination','cashDepositDate','payCard','cardFeeRate','cardSettlementDate'].some(f => f in body);
    let syncWarning = null;
    if (paymentChanged) {
      try {
        await syncBnbPaymentTx(id);
        // 同步成功：清除該訂單的未解決失敗記錄
        await prisma.bnbSyncFailure.updateMany({
          where: { bookingId: id, resolved: false },
          data: { resolved: true, resolvedAt: new Date() },
        });
      } catch (syncErr) {
        const msg = syncErr?.message || String(syncErr);
        console.error('[syncBnbPaymentTx] 同步失敗 bookingId=%d:', id, msg);
        await prisma.bnbSyncFailure.create({
          data: { bookingId: id, errorMsg: msg },
        });
        syncWarning = '付款資料已儲存，但出納現金流同步失敗，請至出納管理手動確認。';
      }
    }

    const responseBody = {
      id:              updated.id,
      roomCharge:      Number(updated.roomCharge),
      paymentFilled:   updated.paymentFilled,
      isComplimentary: updated.isComplimentary,
      cardFee:         Number(updated.cardFee),
      payDeposit:    Number(updated.payDeposit),
      payTransfer:   Number(updated.payTransfer),
      payCard:       Number(updated.payCard),
      payCash:       Number(updated.payCash),
      payVoucher:    Number(updated.payVoucher),
      ...(syncWarning ? { syncWarning } : {}),
    };
    return NextResponse.json(responseBody, { status: syncWarning ? 207 : 200 });
  } catch (error) {
    return handleApiError(error);
  }
}

// ── DELETE ─────────────────────────────────────────────────────
export async function DELETE(request, { params }) {
  const auth = await requireAnyPermission([PERMISSIONS.BNB_EDIT]);
  if (!auth.ok) return auth.response;

  try {
    const id = parseInt((await params).id);
    const { searchParams } = new URL(request.url);
    const restore = searchParams.get('restore') === 'true';

    const record = await prisma.bnbBookingRecord.findUnique({
      where: { id },
      select: { importMonth: true, warehouse: true, paymentLocked: true, status: true, previousStatus: true, deletedAt: true },
    });
    if (!record) return createErrorResponse('NOT_FOUND', '找不到該筆紀錄', 404);
    await assertBnbMonthOpen(record.importMonth, record.warehouse);

    // 還原軟刪除
    if (restore) {
      if (!record.deletedAt) return createErrorResponse('VALIDATION_FAILED', '此筆並未被刪除', 400);
      await prisma.bnbBookingRecord.update({
        where: { id },
        data: { deletedAt: null, deletedBy: null, previousStatus: null, status: record.previousStatus ?? '已入住' },
      });
      return NextResponse.json({ ok: true, restored: true });
    }

    if (record.paymentLocked) return createErrorResponse('FORBIDDEN', '此筆已鎖帳，無法刪除，請先解除鎖帳', 403);

    // 軟刪除：保留記錄與稽核軌跡，僅標記 deletedAt
    await prisma.bnbBookingRecord.update({
      where: { id },
      data: {
        deletedAt:      new Date(),
        deletedBy:      auth.user?.email ?? auth.user?.name ?? 'unknown',
        previousStatus: record.status,
      },
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
