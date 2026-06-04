'use client';

import Link from 'next/link';

/**
 * Inline banner shown when a list fetch fails.
 * Detects PERIOD_LOCKED (HTTP 423) and shows a human-readable message with a link.
 *
 * Usage:
 *   {fetchError && <FetchErrorBanner message={fetchError} onRetry={loadFn} />}
 *   {fetchError && <FetchErrorBanner message={fetchError} status={423} onRetry={loadFn} />}
 */
export default function FetchErrorBanner({ message, status, onRetry }) {
  // PERIOD_LOCKED: 2026年3月(某館)已月結，無法新增或修改交易。如需修改請先解鎖該月份。
  const isPeriodLocked =
    status === 423 ||
    (typeof message === 'string' && (
      message.startsWith('PERIOD_LOCKED:') ||
      message.includes('已月結') ||
      message.includes('已鎖定，無法') ||
      message.includes('請先解鎖該月份')
    ));

  if (isPeriodLocked) {
    const detail = typeof message === 'string'
      ? message.replace(/^PERIOD_LOCKED:/, '')
      : '此期間已鎖定，無法新增或修改資料。';
    return (
      <div className="flex items-start gap-3 bg-amber-50 border border-amber-300 rounded-lg px-4 py-3 text-sm text-amber-800">
        <span className="text-xl shrink-0">🔒</span>
        <div className="flex-1">
          <p className="font-medium">期間已鎖定</p>
          <p className="text-xs mt-0.5 text-amber-700">{detail}</p>
          <Link href="/month-end" className="text-xs mt-1.5 inline-block text-blue-600 underline hover:text-blue-800">
            前往月結頁面解鎖 →
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-800">
      <svg className="w-4 h-4 shrink-0 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
      </svg>
      <span className="flex-1">{message || '資料載入失敗，請重新整理後再試。'}</span>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="shrink-0 text-xs font-medium text-red-700 underline hover:text-red-900"
        >
          重試
        </button>
      )}
    </div>
  );
}
