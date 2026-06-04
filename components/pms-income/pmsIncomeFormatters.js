import { formatNum } from '@/lib/format-utils';

export function formatNumber(num) {
  return formatNum(num, 2);
}

export function formatDate(dateStr) {
  if (!dateStr) return '-';
  return dateStr;
}
