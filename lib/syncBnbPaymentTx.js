/**
 * 同步民宿訂房付款資料 → CashTransaction
 * 共用於 PATCH /api/bnb/[id] 及重試 /api/bnb/sync-failures/[id]/retry
 */
import prisma from '@/lib/prisma';
import { assertBnbMonthOpen } from '@/lib/bnb-lock';
import { nextCashTransactionNo } from '@/lib/sequence-generator';

async function upsertBnbTx({ sourceType, sourceRecordId, txDate, amount, description, accountId, categoryId, warehouse }) {
  if (!accountId || !txDate || amount <= 0) return null;

  const existing = await prisma.cashTransaction.findFirst({
    where: { sourceType, sourceRecordId },
    select: { id: true, amount: true, transactionDate: true },
  });

  if (existing) {
    if (Number(existing.amount) !== amount || existing.transactionDate !== txDate) {
      await prisma.cashTransaction.update({
        where: { id: existing.id },
        data: { amount, transactionDate: txDate, description },
      });
    }
    return existing.id;
  }

  const txNo = await nextCashTransactionNo(prisma, txDate);
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

export async function syncBnbPaymentTx(bookingId) {
  const booking = await prisma.bnbBookingRecord.findUnique({
    where: { id: bookingId },
    select: {
      importMonth: true,
      warehouse: true, guestName: true, checkInDate: true, checkOutDate: true,
      cashDestination: true, payCash: true, bossWithdrawNote: true,
      depositDate: true, payDeposit: true, depositCashTxId: true,
      transferDate: true, payTransfer: true, transferCashTxId: true,
      cashDepositDate: true, cashCashTxId: true,
      cardSettlementDate: true, payCard: true, cardFee: true, cardCashTxId: true,
    },
  });
  if (!booking) return {};

  // M6: 同步開始前再次確認月份未鎖帳，縮小鎖帳 race window
  await assertBnbMonthOpen(booking.importMonth, booking.warehouse);

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

  // M2 長期: 優先抓 isPrimary=true，無主要帳戶則 fallback 最早建立（deterministic）
  const account = await prisma.cashAccount.findFirst({
    where: { warehouse: booking.warehouse, type: '銀行存款', isActive: true },
    select: { id: true },
    orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
  });
  // M3: 找不到帳戶改為 throw，讓 PATCH 回 207 + 寫 bnb_sync_failures，不再靜默成功
  if (!account) {
    throw new Error(`找不到館別「${booking.warehouse}」的銀行帳戶（type=銀行存款），請至資金管理新增帳戶後重試`);
  }

  const category = await prisma.cashCategory.findFirst({
    where: { OR: [{ systemCode: 'bnb_income' }, { name: { contains: '民宿' }, type: '收入' }] },
    select: { id: true },
  });

  const baseDesc = `${booking.guestName} ${booking.checkInDate}`;
  const wh = booking.warehouse;
  const acctId = account.id;
  const catId = category?.id || null;
  const updates = {};

  const PAYMENT_TYPES = [
    { sourceType: 'bnb_deposit',  dateField: 'depositDate',        amountField: 'payDeposit',  txIdField: 'depositCashTxId',  label: '訂金匯款' },
    { sourceType: 'bnb_transfer', dateField: 'transferDate',       amountField: 'payTransfer', txIdField: 'transferCashTxId', label: '當天匯款', canDelete: true },
    { sourceType: 'bnb_cash',     dateField: 'cashDepositDate',    amountField: 'payCash',     txIdField: 'cashCashTxId',     label: '現金存入', canDelete: true,
      guard: (b) => b.cashDestination === '存帳' },
    { sourceType: 'bnb_card',     dateField: 'cardSettlementDate', amountField: 'payCard',     txIdField: 'cardCashTxId',     label: '刷卡入帳',
      getAmount: (b) => { const net = Number(b.payCard) - Number(b.cardFee); return net > 0 ? net : Number(b.payCard); } },
  ];

  for (const t of PAYMENT_TYPES) {
    const date   = booking[t.dateField];
    const amount = t.getAmount ? t.getAmount(booking) : Number(booking[t.amountField]);
    const guard  = !t.guard || t.guard(booking);

    if (guard && date && amount > 0) {
      const txId = await upsertBnbTx({
        sourceType: t.sourceType, sourceRecordId: bookingId,
        txDate: date, amount, description: `${t.label} ${baseDesc}`,
        accountId: acctId, categoryId: catId, warehouse: wh,
      });
      if (txId) updates[t.txIdField] = txId;
    } else if (t.canDelete && booking[t.txIdField]) {
      await prisma.cashTransaction.deleteMany({ where: { sourceType: t.sourceType, sourceRecordId: bookingId } });
      updates[t.txIdField] = null;
    }
  }

  if (Object.keys(updates).length > 0) {
    await prisma.bnbBookingRecord.update({ where: { id: bookingId }, data: updates });
  }
  return updates;
}
