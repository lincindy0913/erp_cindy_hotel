/**
 * Calculate signed balance delta from a list of transactions.
 * Mirrors recalc-balance.js type logic with integer-cent arithmetic
 * to avoid floating-point accumulation errors.
 *
 * Rules (amount is always positive; type determines direction):
 *   收入  / 移轉入 → add amount
 *   支出  / 移轉   → subtract amount + fee
 *
 * @param {Array<{type: string, amount: number|string, fee?: number|string, hasFee?: boolean}>} txs
 * @returns {number} signed delta in dollars (positive = net inflow)
 */
export function calcBalanceDelta(txs) {
  const toCents = (v) => Math.round(Number(v || 0) * 100);
  let cents = 0;
  for (const tx of txs) {
    const amt = toCents(tx.amount);
    const fee = tx.hasFee ? toCents(tx.fee) : 0;
    if (tx.type === '收入' || tx.type === '移轉入') {
      cents += amt;
    } else if (tx.type === '支出' || tx.type === '移轉') {
      cents -= (amt + fee);
    }
  }
  return cents / 100;
}
