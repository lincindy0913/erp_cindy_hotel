'use client';

import Link from 'next/link';

function NT(val) {
  return `NT$ ${Number(val || 0).toLocaleString()}`;
}

export default function DashboardPlSummary({ plData, plLoading }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 mb-6 overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 bg-gray-50">
        <h2 className="text-sm font-semibold text-gray-700">本月損益摘要（現金流科目）</h2>
        <Link href="/reports/profit-loss" className="text-xs text-blue-600 hover:underline">完整損益表 →</Link>
      </div>
      {plLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4">
          {[...Array(4)].map((_, i) => <div key={i} className="h-14 bg-gray-100 rounded-lg animate-pulse" />)}
        </div>
      ) : plData?.summary ? (
        <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-y md:divide-y-0 divide-gray-100">
          {[
            { label: '營業收入', val: plData.summary.totalIncome, color: 'text-blue-700' },
            { label: '毛利', val: plData.summary.grossProfit, color: 'text-teal-700', pct: plData.summary.totalIncome ? ((plData.summary.grossProfit / plData.summary.totalIncome) * 100).toFixed(1) + '%' : null },
            { label: '營業淨利', val: plData.summary.operatingIncome, color: 'text-green-700', pct: plData.summary.totalIncome ? ((plData.summary.operatingIncome / plData.summary.totalIncome) * 100).toFixed(1) + '%' : null },
            { label: '稅前淨利', val: plData.summary.netIncome, color: (plData.summary.netIncome || 0) >= 0 ? 'text-green-700' : 'text-red-600', pct: plData.summary.totalIncome ? ((plData.summary.netIncome / plData.summary.totalIncome) * 100).toFixed(1) + '%' : null },
          ].map(({ label, val, color, pct }) => (
            <div key={label} className="px-5 py-4">
              <p className="text-xs text-gray-500 mb-1">{label}</p>
              <p className={`text-lg font-bold tabular-nums ${color}`}>{NT(val)}</p>
              {pct && <p className="text-xs text-gray-400 mt-0.5">{pct}</p>}
            </div>
          ))}
        </div>
      ) : (
        <p className="px-5 py-4 text-xs text-gray-400">本月無損益資料，請先設定現金流科目</p>
      )}
    </div>
  );
}
