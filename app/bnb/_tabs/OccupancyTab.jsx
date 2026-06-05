'use client';

import FetchErrorBanner from '@/components/FetchErrorBanner';
import WhQuickBtns from '../_components/WhQuickBtns';
import { inputCls } from '../_constants';

export default function OccupancyTab({
  occYear, setOccYear, occWarehouse, setOccWarehouse,
  occData, occLoading, occError, fetchOccupancy, warehouseList,
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <input type="number" min="2020" max="2035" value={occYear} onChange={e => setOccYear(e.target.value)}
          className={inputCls + ' w-24'} placeholder="年度" />
        <select value={occWarehouse} onChange={e => setOccWarehouse(e.target.value)} className={inputCls}>
          <option value="">全館</option>
          {warehouseList.map(w => <option key={w} value={w}>{w}</option>)}
        </select>
        <WhQuickBtns list={warehouseList} value={occWarehouse} onChange={setOccWarehouse} />
        <button onClick={fetchOccupancy} className="px-4 py-1.5 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700">查詢</button>
        {occLoading && <span className="text-xs text-gray-400 animate-pulse">載入中…</span>}
      </div>
      {occError && <FetchErrorBanner message={occError} onRetry={fetchOccupancy} />}
      {occData && (() => {
        const rows = occData.rows || [];
        const totalBookings = rows.reduce((s, r) => s + r.bookings, 0);
        const totalRevenue  = rows.reduce((s, r) => s + r.revenue,  0);
        const totalNights   = rows.reduce((s, r) => s + r.roomNights, 0);
        return (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: '全年訂房數', value: totalBookings, color: 'text-indigo-600' },
                { label: '住宿房夜', value: `${totalNights} 晚`, color: 'text-teal-600' },
                { label: '全年收入', value: `NT$ ${totalRevenue.toLocaleString()}`, color: 'text-emerald-600' },
                { label: '平均住宿天數', value: `${totalBookings > 0 ? (totalNights / totalBookings).toFixed(1) : 0} 晚`, color: 'text-amber-600' },
              ].map(k => (
                <div key={k.label} className="bg-white rounded-xl shadow-sm p-4 border border-gray-100">
                  <div className="text-xs text-gray-400 mb-1">{k.label}</div>
                  <div className={`text-xl font-bold ${k.color}`}>{k.value}</div>
                </div>
              ))}
            </div>
            <div className="bg-white rounded-xl shadow-sm p-5 border border-gray-100">
              <h4 className="text-sm font-semibold text-gray-700 mb-4">月度訂房數與收入</h4>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 z-10 bg-white">
                    <tr className="text-xs text-gray-400 border-b">
                      <th className="text-left py-2 pr-3 font-medium">月份</th>
                      <th className="text-right py-2 px-2 font-medium">訂房</th>
                      <th className="text-right py-2 px-2 font-medium">房夜</th>
                      <th className="text-right py-2 px-2 font-medium">均住</th>
                      <th className="text-right py-2 px-2 font-medium">收入</th>
                      <th className="py-2 pl-3 font-medium w-40">訂房比例</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {rows.map(r => {
                      const pct = totalBookings > 0 ? Math.round(r.bookings / totalBookings * 100) : 0;
                      return (
                        <tr key={r.month} className="hover:bg-gray-50">
                          <td className="py-2 pr-3 text-gray-600 font-medium">{r.month}</td>
                          <td className="py-2 px-2 text-right text-indigo-600 font-semibold">{r.bookings}</td>
                          <td className="py-2 px-2 text-right text-teal-600">{r.roomNights}</td>
                          <td className="py-2 px-2 text-right text-gray-500">{r.avgStay}</td>
                          <td className="py-2 px-2 text-right text-emerald-600">NT$ {r.revenue.toLocaleString()}</td>
                          <td className="py-2 pl-3">
                            <div className="flex items-center gap-2">
                              <div className="flex-1 bg-gray-100 rounded-full h-2">
                                <div className="bg-indigo-400 rounded-full h-2 transition-all" style={{ width: `${pct}%` }} />
                              </div>
                              <span className="text-xs text-gray-400 w-8 text-right">{pct}%</span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        );
      })()}
    </div>
  );
}
