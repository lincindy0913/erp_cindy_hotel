/**
 * 從 API 錯誤回應中取得可顯示的錯誤訊息。
 * 支援統一格式 { error: string, code?: string } 以及舊版巢狀格式。
 * 前端建議：const data = await res.json(); showToast(getApiError(data), 'error');
 */
export function getApiError(data) {
  if (data == null) return '未知錯誤';
  if (typeof data.error === 'string') return data.error;
  if (data.error && typeof data.error.message === 'string') return data.error.message;
  if (typeof data.message === 'string') return data.message;
  return '未知錯誤';
}
