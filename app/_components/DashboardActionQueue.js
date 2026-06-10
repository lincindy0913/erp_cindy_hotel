'use client';

import Link from 'next/link';
import FetchErrorBanner from '@/components/FetchErrorBanner';

export default function DashboardActionQueue({ aqData, aqLoading, aqError, fetchActionQueue }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 mb-6 overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 bg-gray-50">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-gray-700">我的待辦佇列</h2>
          {aqData?.items?.length > 0 && (
            <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium text-white ${
              aqData.items.some(i => i.urgency === 'urgent') ? 'bg-red-500'
              : aqData.items.some(i => i.urgency === 'high') ? 'bg-orange-500'
              : 'bg-amber-500'
            }`}>{aqData.items.length}</span>
          )}
        </div>
        <button
          onClick={fetchActionQueue}
          disabled={aqLoading}
          className="text-xs text-gray-400 hover:text-gray-600 disabled:opacity-50"
          title="重新整理待辦佇列"
        >↺</button>
      </div>

      {aqLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-16 bg-gray-100 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : aqData?.items?.length > 0 ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 p-4">
          {aqData.items.map(item => (
            <Link
              key={item.key}
              href={item.href}
              className={`group flex flex-col gap-1.5 p-3 rounded-xl border transition-all hover:shadow-sm ${
                item.urgency === 'urgent' ? 'bg-red-50 border-red-200 hover:border-red-400'
                : item.urgency === 'high' ? 'bg-orange-50 border-orange-200 hover:border-orange-400'
                : 'bg-gray-50 border-gray-200 hover:border-gray-300'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                  item.urgency === 'urgent' ? 'bg-red-100 text-red-700'
                  : item.urgency === 'high' ? 'bg-orange-100 text-orange-700'
                  : 'bg-gray-200 text-gray-600'
                }`}>{item.category}</span>
                <span className="text-xs text-gray-400 group-hover:text-gray-600">→</span>
              </div>
              <p className={`text-xs font-medium leading-snug ${
                item.urgency === 'urgent' ? 'text-red-800'
                : item.urgency === 'high' ? 'text-orange-800'
                : 'text-gray-700'
              }`}>{item.label}</p>
              <p className={`text-xl font-bold tabular-nums leading-none ${
                item.urgency === 'urgent' ? 'text-red-600'
                : item.urgency === 'high' ? 'text-orange-600'
                : 'text-gray-500'
              }`}>{item.count}</p>
              {item.detail && (
                <p className="text-xs text-gray-400 truncate">{item.detail}</p>
              )}
            </Link>
          ))}
        </div>
      ) : aqData ? (
        <div className="flex items-center justify-center gap-2 py-5 text-green-600">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="text-sm font-medium">目前無待辦事項</span>
        </div>
      ) : aqError ? (
        <div className="p-4">
          <FetchErrorBanner message={aqError} onRetry={fetchActionQueue} />
        </div>
      ) : (
        <div className="px-5 py-4 text-xs text-gray-400 text-center">載入中…</div>
      )}
    </div>
  );
}
