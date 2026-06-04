import { formatNum as _formatNum } from '@/lib/format-utils';

// 工程模組預設 2 位小數（財務金額用 lib/format-utils 的預設 0 位）
export function formatNum(n, decimals = 2) {
  return _formatNum(n, decimals);
}
