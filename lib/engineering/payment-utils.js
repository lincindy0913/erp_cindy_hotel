/**
 * 取付款單實際已付金額：
 * 已執行且有 executions 記錄時，用 actualAmount 合計；否則用 po.amount。
 *
 * @param {{ status: string, amount: number|string, executions?: { actualAmount: number|string }[] }} po
 * @returns {number}
 */
export function getActualPaid(po) {
  if (po.status === '已執行' && po.executions && po.executions.length > 0) {
    return po.executions.reduce((s, e) => s + Number(e.actualAmount || 0), 0);
  }
  return Number(po.amount || 0);
}
