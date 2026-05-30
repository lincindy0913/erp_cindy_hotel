/**
 * BnbBookingRecord 付款類型欄位對照表
 * 單一來源：新增付款類型只需在此加一個 key。
 */
export const PAY_TYPE_CONFIG = {
  deposit: {
    amountField:   'payDeposit',
    dateField:     'depositDate',
    last5Field:    'depositLast5',
    bankLineField: 'depositBankLineId',
    matchedAtField:'depositMatchedAt',
    matchedByField:'depositMatchedBy',
    skipField:     'depositMatchSkip',
    skipNoteField: 'depositMatchSkipNote',
    label:         '訂金匯款',
    bankDateField: 'txDate',
    searchWindowDays: 14,
  },
  transfer: {
    amountField:   'payTransfer',
    dateField:     'transferDate',
    last5Field:    'transferLast5',
    bankLineField: 'transferBankLineId',
    matchedAtField:'transferMatchedAt',
    matchedByField:'transferMatchedBy',
    skipField:     'transferMatchSkip',
    skipNoteField: 'transferMatchSkipNote',
    label:         '當天匯款',
    bankDateField: 'txDate',
    searchWindowDays: 7,
  },
  card: {
    amountField:   'payCard',
    dateField:     'cardSettlementDate',
    last5Field:    null,
    bankLineField: 'cardBankLineId',
    matchedAtField:'cardMatchedAt',
    matchedByField:'cardMatchedBy',
    skipField:     'cardMatchSkip',
    skipNoteField: 'cardMatchSkipNote',
    label:         '刷卡',
    bankDateField: 'txDate',
    searchWindowDays: 5,
  },
  cash: {
    amountField:   'payCash',
    dateField:     'cashDepositDate',
    last5Field:    null,
    bankLineField: 'cashBankLineId',
    matchedAtField:'cashMatchedAt',
    matchedByField:'cashMatchedBy',
    skipField:     'cashMatchSkip',
    skipNoteField: 'cashMatchSkipNote',
    label:         '現金存款',
    bankDateField: 'txDate',
    searchWindowDays: 7,
  },
};

export function getPayTypeConfig(paymentType) {
  return PAY_TYPE_CONFIG[paymentType] || PAY_TYPE_CONFIG.deposit;
}

export const PAY_TYPE_KEYS = Object.keys(PAY_TYPE_CONFIG);

/**
 * 從 BnbBookingRecord（寬表）取出單一付款類型的資料，
 * 轉成 BnbPaymentEntry upsert 用的 data 物件。
 */
export function bookingToPaymentEntry(booking, payType) {
  const cfg = PAY_TYPE_CONFIG[payType];
  if (!cfg) return null;
  const amount = Number(booking[cfg.amountField] ?? 0);
  return {
    amount,
    date:      cfg.dateField      ? (booking[cfg.dateField]      ?? null) : null,
    last5:     cfg.last5Field     ? (booking[cfg.last5Field]     ?? null) : null,
    bankLineId: cfg.bankLineField ? (booking[cfg.bankLineField]  ?? null) : null,
    matchedAt:  cfg.matchedAtField ? (booking[cfg.matchedAtField] ?? null) : null,
    matchedBy:  cfg.matchedByField ? (booking[cfg.matchedByField] ?? null) : null,
    skipReason: cfg.skipField     ? (booking[cfg.skipField]      ?? null) : null,
    skipNote:   cfg.skipNoteField ? (booking[cfg.skipNoteField]  ?? null) : null,
    cashTxId:   cfg.cashTxField   ? (booking[cfg.cashTxField]    ?? null) : null,
  };
}

/**
 * 在 PATCH/batch 寫入寬表後，同步更新對應的 BnbPaymentEntry（雙寫）。
 * prismaClient 可以是 prisma 或 prisma.$transaction 裡的 tx。
 */
export async function syncPaymentEntry(prismaClient, bookingId, payType, entryData) {
  if (entryData.amount === 0 && !entryData.bankLineId && !entryData.cashTxId) {
    await prismaClient.bnbPaymentEntry.deleteMany({
      where: { bookingId, payType },
    });
    return;
  }
  await prismaClient.bnbPaymentEntry.upsert({
    where: { bookingId_payType: { bookingId, payType } },
    create: { bookingId, payType, ...entryData },
    update: entryData,
  });
}
