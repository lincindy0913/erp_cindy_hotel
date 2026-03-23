/**
 * 將 CashTransaction.sourceType + sourceRecordId 轉成可追溯說明與站內連結（路徑）。
 * 若無對應單據則僅回文字標籤。
 */

const TYPE_LABELS = {
  common_expense: '一般費用',
  purchasing: '進貨/採購付款',
  payment_order: '付款單',
  cashier_payment: '出納付款',
  cashier: '出納',
  maintenance: '維護費',
  engineering: '工程',
  reconciliation_adjustment: '對帳調整',
  loan_payment: '貸款還款',
  check_payment: '支票付款',
  check_receipt: '支票兌現',
  rental_deposit_in: '租屋押金入帳',
  rental_deposit_out: '租屋押金退還',
  pms_manual_commission: 'PMS 手動佣金',
  employee_advance_settle: '員工代墊結清',
  shareholder_loan: '股東借款',
  other: '其他',
};

/**
 * @param {string|null|undefined} sourceType
 * @param {number|null|undefined} sourceRecordId
 * @returns {{ label: string, path: string|null, hint: string }}
 */
export function resolveCashTransactionSource(sourceType, sourceRecordId) {
  const type = sourceType || '';
  const id = sourceRecordId != null ? Number(sourceRecordId) : null;
  const baseLabel = TYPE_LABELS[type] || type || '（未標示來源）';

  if (!id || Number.isNaN(id)) {
    return {
      label: baseLabel,
      path: null,
      hint: '無 sourceRecordId，僅能從現金流交易編號追查',
    };
  }

  switch (type) {
    case 'common_expense':
      return { label: `${baseLabel} #${id}`, path: `/expenses?highlight=${id}`, hint: '費用記錄' };
    case 'purchasing':
    case 'payment_order':
      return { label: `${baseLabel} #${id}`, path: `/finance?orderId=${id}`, hint: '請於付款單/財務模組確認' };
    case 'cashier':
    case 'cashier_payment':
      return { label: `${baseLabel} #${id}`, path: `/cashier`, hint: '出納執行紀錄請由管理後台或審計查詢' };
    case 'maintenance':
      return { label: `${baseLabel} #${id}`, path: `/rentals?tab=maintenance`, hint: '租屋維護費' };
    case 'engineering':
      return { label: `${baseLabel} #${id}`, path: `/engineering`, hint: '工程合約/期數' };
    case 'loan_payment':
      return { label: `${baseLabel} #${id}`, path: `/loans`, hint: '貸款紀錄' };
    case 'rental_deposit_in':
    case 'rental_deposit_out':
      return { label: `${baseLabel} #${id}`, path: `/rentals?tab=contracts`, hint: '租屋合約' };
    case 'pms_manual_commission':
      return { label: `${baseLabel} #${id}`, path: `/pms-income`, hint: 'PMS 收入' };
    case 'reconciliation_adjustment':
      return { label: `${baseLabel} #${id}`, path: `/reconciliation`, hint: '對帳調整' };
    case 'check_payment':
    case 'check_receipt':
      return { label: `${baseLabel} #${id}`, path: `/checks`, hint: '支票' };
    default:
      return {
        label: `${baseLabel} #${id}`,
        path: `/cashflow`,
        hint: '請至現金流依交易編號或日期篩查',
      };
  }
}
