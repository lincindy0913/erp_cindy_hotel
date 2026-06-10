'use client';

import Link from 'next/link';

export default function DashboardNotifications({
  loading,
  ntfLoading,
  ntfError,
  ntfWarningExpanded,
  setNtfWarningExpanded,
  visibleNotifications,
  cashierPendingCount,
  checksPendingCount,
  fetchNotifications,
}) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-semibold text-gray-800">今天要做什麼</h2>
          {!ntfLoading && !ntfError && visibleNotifications.length > 0 && (
            <span className={`text-xs px-2 py-0.5 rounded-full text-white font-medium ${
              visibleNotifications.some(n => n.level === 'critical') ? 'bg-red-500'
              : visibleNotifications.some(n => n.level === 'urgent') ? 'bg-orange-500'
              : 'bg-amber-500'
            }`}>
              {visibleNotifications.reduce((s, n) => s + n.count, 0)}
            </span>
          )}
        </div>
        <button
          onClick={() => fetchNotifications(true)}
          className="text-xs text-gray-400 hover:text-gray-600"
          title="重新整理"
        >↺</button>
      </div>

      {!loading && (cashierPendingCount > 0 || checksPendingCount > 0) && (
        <div className="mb-3 p-3 bg-violet-50 border border-violet-200 rounded-xl">
          <p className="text-xs font-semibold text-violet-700 mb-2">出納工作台</p>
          <div className="grid grid-cols-2 gap-2">
            <Link href="/cashier" className={`flex items-center gap-2.5 p-2 rounded-lg transition-colors ${cashierPendingCount > 0 ? 'bg-orange-50 border border-orange-200 hover:bg-orange-100' : 'bg-white border border-gray-100'}`}>
              <span className="text-lg">💳</span>
              <div>
                <p className={`text-base font-bold leading-none ${cashierPendingCount > 0 ? 'text-orange-600' : 'text-gray-300'}`}>{cashierPendingCount} 筆</p>
                <p className="text-xs text-gray-500 mt-0.5">待執行付款單</p>
              </div>
            </Link>
            <Link href="/checks" className={`flex items-center gap-2.5 p-2 rounded-lg transition-colors ${checksPendingCount > 0 ? 'bg-amber-50 border border-amber-200 hover:bg-amber-100' : 'bg-white border border-gray-100'}`}>
              <span className="text-lg">📋</span>
              <div>
                <p className={`text-base font-bold leading-none ${checksPendingCount > 0 ? 'text-amber-600' : 'text-gray-300'}`}>{checksPendingCount} 張</p>
                <p className="text-xs text-gray-500 mt-0.5">待兌現支票</p>
              </div>
            </Link>
          </div>
        </div>
      )}

      {ntfLoading ? (
        <div className="flex items-center justify-center py-6">
          <svg className="animate-spin h-5 w-5 text-gray-300" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
        </div>
      ) : ntfError ? (
        <div className="flex flex-col items-center gap-2 py-6 text-center">
          <p className="text-sm text-red-500">待辦事項載入失敗</p>
          <button
            onClick={() => fetchNotifications(true)}
            className="text-xs px-3 py-1.5 bg-red-50 text-red-700 border border-red-200 rounded-lg hover:bg-red-100"
          >
            重試
          </button>
        </div>
      ) : visibleNotifications.length === 0 ? (
        <div className="flex items-center justify-center gap-2 py-6 text-green-600">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="text-sm font-medium">今日無待辦，一切順利！</span>
        </div>
      ) : (
        <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
          {visibleNotifications.filter(n => n.level === 'critical').map(n => (
            <div key={n.code} className="flex items-center gap-3 p-2.5 rounded-lg bg-red-50 border-l-4 border-red-500">
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-red-800">{n.title} <span className="font-normal opacity-75">({n.count})</span></p>
                <p className="text-xs text-red-600 mt-0.5 truncate">{n.message}</p>
              </div>
              <Link href={n.targetUrl} className="shrink-0 text-xs px-2.5 py-1 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium whitespace-nowrap">
                前往處理
              </Link>
            </div>
          ))}
          {visibleNotifications.filter(n => n.level === 'urgent').map(n => (
            <div key={n.code} className="flex items-center gap-3 p-2.5 rounded-lg bg-orange-50 border-l-4 border-orange-500">
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-orange-800">{n.title} <span className="font-normal opacity-75">({n.count})</span></p>
                <p className="text-xs text-orange-600 mt-0.5 truncate">{n.message}</p>
              </div>
              <Link href={n.targetUrl} className="shrink-0 text-xs px-2.5 py-1 bg-orange-500 text-white rounded-lg hover:bg-orange-600 font-medium whitespace-nowrap">
                前往處理
              </Link>
            </div>
          ))}
          {visibleNotifications.filter(n => n.level === 'warning').length > 0 && (
            <>
              <button
                onClick={() => setNtfWarningExpanded(!ntfWarningExpanded)}
                className="flex items-center gap-2 w-full px-2 py-1.5 rounded-lg hover:bg-amber-50 transition-colors text-left"
              >
                <span className="text-xs text-amber-700 font-medium">
                  注意事項 ({visibleNotifications.filter(n => n.level === 'warning').reduce((s, n) => s + n.count, 0)} 筆)
                </span>
                <svg className={`w-3.5 h-3.5 text-amber-500 transition-transform ${ntfWarningExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {ntfWarningExpanded && visibleNotifications.filter(n => n.level === 'warning').map(n => (
                <div key={n.code} className="flex items-center gap-3 p-2.5 rounded-lg bg-amber-50 border-l-4 border-amber-400 ml-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-amber-800">{n.title} <span className="font-normal opacity-75">({n.count})</span></p>
                    <p className="text-xs text-amber-700 mt-0.5 truncate">{n.message}</p>
                  </div>
                  <Link href={n.targetUrl} className="shrink-0 text-xs px-2.5 py-1 bg-amber-100 text-amber-800 border border-amber-300 rounded-lg hover:bg-amber-200 font-medium whitespace-nowrap">
                    查看
                  </Link>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
