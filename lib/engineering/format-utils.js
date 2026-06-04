/**
 * 工程模組共用數字格式化工具。
 * null / '' → '－'（顯示用佔位符）
 *
 * @param {number|string|null|undefined} n
 * @param {number} decimals  最多小數位，預設 2
 */
export function formatNum(n, decimals = 2) {
  if (n == null || n === '') return '－';
  return Number(n).toLocaleString('zh-TW', {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  });
}
