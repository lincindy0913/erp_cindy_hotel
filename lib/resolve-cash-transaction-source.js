/**
 * 將 CashTransaction.sourceType + sourceRecordId 轉成可追溯說明與站內連結（路徑）。
 * 若無對應單據則僅回文字標籤。
 *
 * 可在 client 與 server 端同時使用（純函式，無 import 依賴）。
 */

const TYPE_LABELS = {
  manual: '手動',
  common_expense: '一般費用',
  fixed_expense: '固定費用',
  purchase_expense: '採購費用',
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
  check_bounce: '支票退票',
  rental_income: '租賃收入',
  rental_deposit_in: '租屋押金入帳',
  rental_deposit_out: '租屋押金退還',
  rental_maintenance: '租屋維護費',
  rental_tax: '租賃稅費',
  pms_income_settlement: 'PMS 結算',
  pms_income_fee: 'PMS 手續費',
  pms_manual_commission: 'PMS 佣金',
  bnb_deposit: '民宿訂金',
  bnb_transfer: '民宿匯款',
  bnb_cash: '民宿現金',
  bnb_card: '民宿刷卡',
  bnb_ota_commission: 'OTA 傭金',
  bnb_boss_withdraw: '民宿老闆收取',
  employee_advance_settle: '員工代墊結清',
  cash_count_adjustment: '盤點調整',
  cash_count_shortage: '盤點短缺',
  engineering_income: '工程收入',
  purchase_allowance: '退貨收入',
  shareholder_loan: '股東借款',
  reversal: '沖銷',
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
  const hasId = id && !Number.isNaN(id);

  if (!hasId) {
    return {
      label: baseLabel,
      path: null,
      hint: '無 sourceRecordId，僅能從現金流交易編號追查',
    };
  }

  switch (type) {
    // ── 費用 ──────────────────────────────────────────────────────
    case 'common_expense':
      return { label: `${baseLabel} #${id}`, path: `/expenses?highlight=${id}`, hint: '費用記錄' };
    case 'fixed_expense':
      return { label: `${baseLabel} #${id}`, path: `/expenses?highlight=${id}`, hint: '固定費用記錄' };
    case 'purchase_expense':
    case 'purchasing':
    case 'payment_order':
      return { label: `${baseLabel} #${id}`, path: `/finance?orderId=${id}`, hint: '請於付款單/財務模組確認' };

    // ── 出納 ──────────────────────────────────────────────────────
    case 'cashier':
    case 'cashier_payment':
      // sourceRecordId = PaymentOrder.id；finance 頁面支援 ?highlight=orderNo，
      // 但需 orderNo 字串，此處只有 id，先導至模組頁
      return { label: `${baseLabel} #${id}`, path: `/cashier`, hint: '出納付款 — 至出納頁查找對應付款單' };

    // ── 租屋 ──────────────────────────────────────────────────────
    case 'rental_income':
      return { label: `${baseLabel} #${id}`, path: `/rentals?tab=income`, hint: '租賃收入記錄' };
    case 'rental_deposit_in':
    case 'rental_deposit_out':
      return { label: `${baseLabel} #${id}`, path: `/rentals?tab=contracts`, hint: '租屋合約押金' };
    case 'rental_maintenance':
    case 'maintenance':
      return { label: `${baseLabel} #${id}`, path: `/rentals?tab=maintenance`, hint: '租屋維護費' };
    case 'rental_tax':
      return { label: `${baseLabel} #${id}`, path: `/rentals?tab=taxes`, hint: '租賃稅費記錄' };

    // ── 民宿 ──────────────────────────────────────────────────────
    // sourceRecordId = BnbBooking.id；BnB 頁面目前不支援 highlight，導至訂房明細分頁
    case 'bnb_deposit':
    case 'bnb_transfer':
    case 'bnb_cash':
    case 'bnb_card':
      return { label: `${baseLabel} #${id}`, path: `/bnb?tab=records`, hint: `民宿訂房 #${id} — 至「訂房明細」依姓名或日期篩查` };
    case 'bnb_ota_commission':
      return { label: `${baseLabel} #${id}`, path: `/bnb?tab=otaCommission`, hint: `OTA 傭金記錄 #${id}` };
    case 'bnb_boss_withdraw':
      return { label: `${baseLabel} #${id}`, path: `/bnb?tab=bossWithdraw`, hint: `民宿老闆收取 #${id}` };

    // ── PMS ───────────────────────────────────────────────────────
    case 'pms_income_settlement':
    case 'pms_income_fee':
    case 'pms_manual_commission':
      return { label: `${baseLabel} #${id}`, path: `/pms-income`, hint: 'PMS 收入模組' };

    // ── 其他 ──────────────────────────────────────────────────────
    case 'engineering':
    case 'engineering_income':
      return { label: `${baseLabel} #${id}`, path: `/engineering`, hint: '工程合約/期數' };
    case 'loan_payment':
      return { label: `${baseLabel} #${id}`, path: `/loans`, hint: '貸款紀錄' };
    case 'check_payment':
    case 'check_receipt':
    case 'check_bounce':
      return { label: `${baseLabel} #${id}`, path: `/checks`, hint: '支票' };
    case 'reconciliation_adjustment':
      return { label: `${baseLabel} #${id}`, path: `/bank-reconciliation`, hint: '銀行對帳調整' };
    case 'employee_advance_settle':
      return { label: `${baseLabel} #${id}`, path: `/employee-advances`, hint: '員工代墊' };
    case 'purchase_allowance':
      return { label: `${baseLabel} #${id}`, path: `/purchase-allowances`, hint: '退貨收入' };
    default:
      return {
        label: `${baseLabel} #${id}`,
        path: null,
        hint: '請至現金流依交易編號或日期篩查',
      };
  }
}
