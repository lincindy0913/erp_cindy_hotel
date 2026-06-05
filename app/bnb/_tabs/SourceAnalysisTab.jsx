'use client';

import FetchErrorBanner from '@/components/FetchErrorBanner';
import WhQuickBtns from '../_components/WhQuickBtns';
import { inputCls } from '../_constants';

export default function SourceAnalysisTab({
  saYear, setSaYear, saWarehouse, setSaWarehouse,
  saData, saLoading, saError, fetchSourceAnalysis, warehouseList,
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <input type="number" min="2020" max="2035" value={saYear} onChange={e => setSaYear(e.target.value)}
          className={inputCls + ' w-24'} />
        <select value={saWarehouse} onChange={e => setSaWarehouse(e.target.value)} className={inputCls}>
          <option value="">全館</option>
          {warehouseList.map(w => <option key={w} value={w}>{w}</option>)}
        </select>
        <WhQuickBtns list={warehouseList} value={saWarehouse} onChange={setSaWarehouse} />
        <button onClick={fetchSourceAnalysis} className="px-4 py-1.5 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700">查詢</button>
        {saLoading && <span className="text-xs text-gray-400 animate-pulse">載入中…</span>}
      </div>
      {saError && <FetchErrorBanner message={saError} onRetry={fetchSourceAnalysis} />}
      {saData && (() => {
        const sources = saData.sources || [];
        const trend   = saData.trend   || [];
        const colors  = ['bg-indigo-400','bg-amber-400','bg-teal-400','bg-rose-400','bg-purple-400','bg-green-400'];
        const maxBookings = Math.max(...sources.map(s => s.bookings), 1);
        return (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div className="bg-white rounded-xl shadow-sm p-4 border border-gray-100">
                <div className="text-xs text-gray-400 mb-1">總訂房數</div>
                <div className="text-2xl font-bold text-indigo-600">{saData.totalBookings}</div>
              </div>
              <div className="bg-white rounded-xl shadow-sm p-4 border border-gray-100">
                <div className="text-xs text-gray-400 mb-1">總收入</div>
                <div className="text-2xl font-bold text-emerald-600">NT$ {saData.totalRevenue?.toLocaleString()}</div>
              </div>
              <div className="bg-white rounded-xl shadow-sm p-4 border border-gray-100">
                <div className="text-xs text-gray-400 mb-1">來源數</div>
                <div className="text-2xl font-bold text-teal-600">{sources.length}</div>
              </div>
            </div>
            <div className="bg-white rounded-xl shadow-sm p-5 border border-gray-100">
              <h4 className="text-sm font-semibold text-gray-700 mb-4">來源明細</h4>
              <div className="space-y-3">
                {sources.map((s, i) => (
                  <div key={s.source} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium text-gray-700">{s.source}</span>
                      <span className="text-gray-400 text-xs">{s.bookings} 筆 · {s.bookingPct}% · 均 NT${s.avgRevenue?.toLocaleString()} · 均住 {s.avgStay} 晚</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-gray-100 rounded-full h-2.5">
                        <div className={`${colors[i % colors.length]} rounded-full h-2.5 transition-all`} style={{ width: `${Math.round(s.bookings / maxBookings * 100)}%` }} />
                      </div>
                      <span className="text-xs text-emerald-600 w-28 text-right">NT$ {s.revenue?.toLocaleString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            {trend.length > 0 && (
              <div className="bg-white rounded-xl shadow-sm p-5 border border-gray-100 tbl-wrap">
                <h4 className="text-sm font-semibold text-gray-700 mb-3">月度趨勢（訂房數）</h4>
                <table className="w-full text-xs">
                  <thead className="sticky top-0 z-10 bg-white">
                    <tr className="border-b text-gray-400">
                      <th className="text-left py-1.5 pr-3 font-medium">月份</th>
                      {sources.map(s => <th key={s.source} className="text-right py-1.5 px-2 font-medium">{s.source}</th>)}
                      <th className="text-right py-1.5 pl-2 font-medium text-gray-600">合計</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {trend.map(t => {
                      const total = sources.reduce((sum, s) => sum + (t[s.source] || 0), 0);
                      return (
                        <tr key={t.month} className="hover:bg-gray-50">
                          <td className="py-1.5 pr-3 text-gray-600 font-medium">{t.month}</td>
                          {sources.map(s => (
                            <td key={s.source} className="py-1.5 px-2 text-right text-indigo-600">{t[s.source] || 0}</td>
                          ))}
                          <td className="py-1.5 pl-2 text-right font-semibold text-gray-700">{total}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        );
      })()}
    </div>
  );
}
