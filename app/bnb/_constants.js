export const inputCls = 'border rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-indigo-400 outline-none';
export const btnCls   = 'px-3 py-1.5 text-sm rounded-lg border hover:bg-gray-50 transition-colors';

export const NT = (v) => `NT$ ${Number(v || 0).toLocaleString()}`;
export const DEFAULT_WAREHOUSE = '民宿';
export const parseAmount = (v) => {
  if (v == null || v === '') return 0;
  const n = parseFloat(String(v).replace(/,/g, '').trim());
  return isNaN(n) ? 0 : Math.abs(n);
};

export const PAY_FIELDS = ['payDeposit', 'depositDate', 'depositLast5', 'payTransfer', 'transferDate', 'transferLast5', 'payCard', 'payCash', 'payVoucher'];

export const STATUS_COLORS = {
  '已退房': 'bg-gray-100 text-gray-600',
  '已入住': 'bg-green-100 text-green-700',
  '已預訂': 'bg-blue-100 text-blue-700',
  '已刪除': 'bg-red-100 text-red-500',
  '取消':   'bg-orange-100 text-orange-600',
  '未入住': 'bg-yellow-100 text-yellow-700',
};
export function getStatusColor(s) { return STATUS_COLORS[s] ?? 'bg-gray-100 text-gray-600'; }

export const BOOKING_EXPORT_COLS = [
  { header: '館別',     key: 'warehouse' },
  { header: '來源',     key: 'source' },
  { header: '姓名',     key: 'guestName' },
  { header: '房間',     key: 'roomNo' },
  { header: '入住日期', key: 'checkInDate' },
  { header: '退房日期', key: 'checkOutDate' },
  { header: '房費',     key: 'roomCharge',  format: 'number' },
  { header: '消費',     key: 'otherCharge', format: 'number' },
  { header: '訂金匯款', key: 'payDeposit',  format: 'number' },
  { header: '匯款日期', key: 'depositDate' },
  { header: '帳號後五碼',key: 'depositLast5' },
  { header: '當天匯款', key: 'payTransfer', format: 'number' },
  { header: '匯款日期', key: 'transferDate' },
  { header: '帳號後五碼',key: 'transferLast5' },
  { header: '刷卡',     key: 'payCard',     format: 'number' },
  { header: '刷卡手續費',key:'cardFee',     format: 'number' },
  { header: '現金',     key: 'payCash',     format: 'number' },
  { header: '住宿卷',   key: 'payVoucher',  format: 'number' },
  { header: '狀態',     key: 'status' },
  { header: '備註',     key: 'note' },
];

export const MONTHLY_EXPORT_COLS = [
  { header: '月份',     key: 'month' },
  { header: '間數',     key: 'rooms',        format: 'number' },
  { header: '住宿房費', key: 'totalRevenue', format: 'number' },
  { header: '其他消費', key: 'otherCharge',  format: 'number' },
  { header: '訂金匯款', key: 'payDeposit',   format: 'number' },
  { header: '當天匯款', key: 'payTransfer',  format: 'number' },
  { header: '刷卡',     key: 'payCard',      format: 'number' },
  { header: '現金',     key: 'payCash',      format: 'number' },
  { header: '住宿卷',   key: 'payVoucher',   format: 'number' },
  { header: '手續費',   key: 'cardFee',      format: 'number' },
  { header: '淨收入',   key: 'netRevenue',   format: 'number' },
];

export const PNL_EXPORT_COLS = [
  { header: '月份',     key: 'month' },
  { header: '住宿淨收入',key:'netRevenue',    format: 'number' },
  { header: '其他收入', key: 'otherIncome',   format: 'number' },
  { header: '收入合計', key: 'incomeTotal',   format: 'number' },
  { header: '採購支出', key: 'purchaseExpense',format:'number' },
  { header: '固定費用', key: 'fixedExpense',  format: 'number' },
  { header: '支出合計', key: 'totalExpense',  format: 'number' },
  { header: '淨利',     key: 'pnlNetProfit',  format: 'number' },
];

export const TABS = [
  { key: 'records',       label: '訂房明細',  group: '日常' },
  { key: 'otherIncome',   label: '其他收入',  group: '日常' },
  { key: 'deposit',       label: '訂金核對',  group: '日常' },
  { key: 'otaRecon',      label: 'OTA比對',   group: 'OTA' },
  { key: 'otaCommission', label: 'OTA傭金',   group: 'OTA' },
  { key: 'analytics',     label: '分析',      group: '分析申報' },
  { key: 'declaration',   label: '旅宿網申報', group: '分析申報' },
  { key: 'bossWithdraw',  label: '老闆收取',  group: '稽核' },
  { key: 'payAudit',      label: '付款稽核',  group: '稽核' },
  { key: 'guestHistory',  label: '房客歷史',  group: '稽核' },
];

export const ANALYTICS_SUB_TABS = [
  { key: 'dailyRev',       label: '每日收入',    group: '報表' },
  { key: 'monthly',        label: '月收入總表',  group: '報表' },
  { key: 'pnl',            label: '月收支總表',  group: '報表' },
  { key: 'declList',       label: '年度申報總表', group: '報表' },
  { key: 'sourceAnalysis', label: '來源分析',    group: '統計圖表' },
  { key: 'otaAnalytics',   label: 'OTA收益分析', group: '統計圖表' },
  { key: 'paymentSplit',   label: '收款分流',    group: '統計圖表' },
  { key: 'occupancy',      label: '入住率統計',  group: '統計圖表' },
  { key: 'calendar',       label: '訂房日曆',    group: '統計圖表' },
];

export const BNB_SOURCES = ['電話', 'Booking', 'Agoda', 'Expedia', 'Airbnb', '雲掌櫃', '其他'];

/** 目前支援上傳對帳單做比對的 OTA 來源 */
export const OTA_RECONCILABLE_SOURCES = ['Booking'];

/** 所有 OTA 來源（含尚未支援比對者） */
export const OTA_SOURCES = [
  { value: 'Booking',  label: 'Booking.com',        supported: true },
  { value: 'Agoda',    label: 'Agoda',               supported: false },
  { value: 'Expedia',  label: 'Expedia',             supported: false },
];

export const BNB_SOURCE_COLORS = {
  'Booking':  'bg-indigo-100 text-indigo-700',
  'Agoda':    'bg-red-100 text-red-700',
  'Expedia':  'bg-yellow-100 text-yellow-700',
  'Airbnb':   'bg-rose-100 text-rose-700',
  '雲掌櫃':   'bg-teal-100 text-teal-700',
  '電話':     'bg-amber-100 text-amber-700',
  '其他':     'bg-gray-100 text-gray-600',
};
