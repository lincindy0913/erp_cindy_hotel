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
