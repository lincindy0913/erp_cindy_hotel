/**
 * 專案共用數字格式化工具。
 * null / '' → '－'（顯示用佔位符）
 *
 * @param {number|string|null|undefined} n
 * @param {number} decimals  最多小數位，預設 0
 */
export function formatNum(n, decimals = 0) {
  if (n == null || n === '') return '－';
  return Number(n).toLocaleString('zh-TW', {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  });
}

/**
 * 財務金額格式化：null / NaN → '0'（適合報表顯示，不用佔位符）
 *
 * @param {number|string|null|undefined} n
 * @param {number} decimals  最多小數位，預設 0
 */
export function formatNum0(n, decimals = 0) {
  if (n == null || n === '' || isNaN(Number(n))) return '0';
  return Number(n).toLocaleString('zh-TW', {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  });
}

/**
 * 貨幣格式化：null / NaN → '$0'（年結、月結報表用）
 * 輸出格式：$1,234,567
 *
 * @param {number|string|null|undefined} n
 */
export function formatCurrency(n) {
  if (n == null || isNaN(Number(n))) return '$0';
  return '$' + Number(n).toLocaleString('zh-TW');
}
