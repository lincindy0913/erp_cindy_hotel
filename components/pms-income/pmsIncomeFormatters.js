export function formatNumber(num) {
  if (num === null || num === undefined) return '-';
  return Number(num).toLocaleString('zh-TW', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

export function formatDate(dateStr) {
  if (!dateStr) return '-';
  return dateStr;
}
