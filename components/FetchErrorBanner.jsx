'use client';

/**
 * Inline banner shown when a list fetch fails.
 * Prevents silent empty-state that users mistake for "no data".
 *
 * Usage:
 *   {fetchError && <FetchErrorBanner message={fetchError} onRetry={loadFn} />}
 */
export default function FetchErrorBanner({ message, onRetry }) {
  return (
    <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-800">
      <svg className="w-4 h-4 shrink-0 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
      </svg>
      <span className="flex-1">{message || '資料載入失敗，請檢查網路連線後重試。'}</span>
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
