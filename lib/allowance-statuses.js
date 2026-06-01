/**
 * Purchase allowance / return statuses.
 * Used in purchase-allowances API routes and UI, and in purchasing to reflect
 * the return status applied to PurchaseMaster / SalesMaster / PaymentOrder.
 */
export const ALLOWANCE_STATUS = {
  DRAFT: '草稿',
  CONFIRMED: '已確認',
  RETURNED: '已退貨',
  PARTIAL_RETURN: '部分退貨',
};
