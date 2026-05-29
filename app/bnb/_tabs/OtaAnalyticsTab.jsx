'use client';

import WhQuickBtns from '../_components/WhQuickBtns';
import { inputCls } from '../_constants';

export default function OtaAnalyticsTab({
  oaYear, setOaYear, oaWarehouse, setOaWarehouse,
  oaData, oaLoading, fetchOtaAnalytics, warehouseList,
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <input type="number" min="2020" max="2035" value={oaYear} onChange={e => setOaYear(e.target.value)}
          className={inputCls + ' w-24'} />
        <select value={oaWarehouse} onChange={e => setOaWarehouse(e.target.value)} className={inputCls}>
          <option value="">全館</option>
          {warehouseList.map(w => <option key={w} value={w}>{w}</option>)}
        </select>
        <WhQuickBtns list={warehouseList} value={oaWarehouse} onChange={setOaWarehouse} />
        <button onClick={fetchOtaAnalytics} className="px-4 py-1.5 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700">查詢</button>
        {oaLoading && <span className="text-xs text-gray-400 animate-pulse">載入中…</span>}
      </div>
      {oaData && (() => {
        const { months, bySource, totals } = oaData;
        return (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: 'OTA 收入', value: `NT$ ${totals.otaRevenue.toLocaleString()}`, sub: `佔比 ${totals.otaPct}%`, color: 'text-indigo-600' },
                { label: '傭金支出', value: `NT$ ${totals.commissionTotal.toLocaleString()}`, sub: `均率 ${totals.avgCommRate}%`, color: 'text-rose-600' },
                { label: 'OTA 淨收入', value: `NT$ ${totals.netOtaRevenue.toLocaleString()}`, sub: '扣除傭金後', color: 'text-emerald-600' },
                { label: '待付傭金', value: `NT$ ${totals.commissionPending.toLocaleString()}`, sub: `已付 NT$ ${totals.commissionPaid.toLocaleString()}`, color: 'text-amber-600' },
              ].map(k => (
                <div key={k.label} className="bg-white rounded-xl shadow-sm p-4 border border-gray-100">
                  <div className="text-xs text-gray-400 mb-1">{k.label}</div>
                  <div className={`text-xl font-bold ${k.color}`}>{k.value}</div>
                  <div className="text-xs text-gray-400 mt-0.5">{k.sub}</div>
                </div>
              ))}
            </div>
            <div className="bg-white rounded-xl shadow-sm p-5 border border-gray-100">
              <h4 className="text-sm font-semibold text-gray-700 mb-4">來源分析（{oaData.year} 年）</h4>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 z-10 bg-white">
                    <tr className="border-b text-gray-400">
                      <th className="text-left py-2 pr-3 font-medium">來源</th>
                      <th className="text-right py-2 px-2 font-medium">訂房</th>
                      <th className="text-right py-2 px-2 font-medium">收入</th>
                      <th className="text-right py-2 px-2 font-medium">傭金</th>
                      <th className="text-right py-2 px-2 font-medium">淨收入</th>
                      <th className="text-right py-2 pl-2 font-medium">傭金率</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {bySource.map(s => (
                      <tr key={s.source} className="hover:bg-gray-50">
                        <td className="py-2 pr-3">
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${s.isOta ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-600'}`}>{s.source}</span>
                        </td>
                        <td className="py-2 px-2 text-right text-gray-600">{s.bookings}</td>
                        <td className="py-2 px-2 text-right font-semibold text-gray-800">NT$ {s.revenue.toLocaleString()}</td>
                        <td className="py-2 px-2 text-right text-rose-600">{s.commission > 0 ? `NT$ ${s.commission.toLocaleString()}` : '—'}</td>
                        <td className="py-2 px-2 text-right text-emerald-600 font-semibold">NT$ {s.netRevenue.toLocaleString()}</td>
                        <td className="py-2 pl-2 text-right text-gray-500">{s.isOta && s.commissionRate > 0 ? `${s.commissionRate}%` : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="bg-white rounded-xl shadow-sm p-5 border border-gray-100 tbl-wrap">
              <h4 className="text-sm font-semibold text-gray-700 mb-3">月度 OTA 收益趨勢</h4>
              <table className="w-full text-xs">
                <thead className="sticky top-0 z-10 bg-white">
                  <tr className="border-b text-gray-400">
                    <th className="text-left py-1.5 pr-3 font-medium">月份</th>
                    <th className="text-right py-1.5 px-2 font-medium">OTA訂</th>
                    <th className="text-right py-1.5 px-2 font-medium">OTA收入</th>
                    <th className="text-right py-1.5 px-2 font-medium">傭金</th>
                    <th className="text-right py-1.5 px-2 font-medium">待付</th>
                    <th className="text-right py-1.5 px-2 font-medium">OTA淨收</th>
                    <th className="text-right py-1.5 pl-2 font-medium text-gray-600">傭金率</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {months.filter(m => m.totalBookings > 0 || m.commissionTotal > 0).map(m => (
                    <tr key={m.month} className="hover:bg-gray-50">
                      <td className="py-1.5 pr-3 text-gray-600 font-medium">{m.month}</td>
                      <td className="py-1.5 px-2 text-right text-indigo-600">{m.otaBookings}</td>
                      <td className="py-1.5 px-2 text-right font-semibold text-gray-700">{m.otaRevenue > 0 ? `NT$ ${m.otaRevenue.toLocaleString()}` : '—'}</td>
                      <td className="py-1.5 px-2 text-right text-rose-600">{m.commissionTotal > 0 ? `NT$ ${m.commissionTotal.toLocaleString()}` : '—'}</td>
                      <td className={`py-1.5 px-2 text-right ${m.commissionPending > 0 ? 'text-amber-600 font-semibold' : 'text-gray-300'}`}>
                        {m.commissionPending > 0 ? `NT$ ${m.commissionPending.toLocaleString()}` : '—'}
                      </td>
                      <td className="py-1.5 px-2 text-right text-emerald-600 font-semibold">{m.netOtaRevenue !== 0 ? `NT$ ${m.netOtaRevenue.toLocaleString()}` : '—'}</td>
                      <td className="py-1.5 pl-2 text-right text-gray-500">{m.effectiveCommRate > 0 ? `${m.effectiveCommRate}%` : '—'}</td>
                    </tr>
                  ))}
                  <tr className="bg-gray-50 font-semibold">
                    <td className="py-2 pr-3 text-gray-700">合計</td>
                    <td className="py-2 px-2 text-right text-indigo-700">{totals.otaBookings}</td>
                    <td className="py-2 px-2 text-right text-gray-800">NT$ {totals.otaRevenue.toLocaleString()}</td>
                    <td className="py-2 px-2 text-right text-rose-700">NT$ {totals.commissionTotal.toLocaleString()}</td>
                    <td className={`py-2 px-2 text-right ${totals.commissionPending > 0 ? 'text-amber-700' : 'text-gray-400'}`}>
                      {totals.commissionPending > 0 ? `NT$ ${totals.commissionPending.toLocaleString()}` : '—'}
                    </td>
                    <td className="py-2 px-2 text-right text-emerald-700">NT$ {totals.netOtaRevenue.toLocaleString()}</td>
                    <td className="py-2 pl-2 text-right text-gray-600">{totals.avgCommRate}%</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </>
        );
      })()}
    </div>
  );
}
