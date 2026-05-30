'use client';

import WhQuickBtns from '../_components/WhQuickBtns';
import { inputCls } from '../_constants';

export default function PaymentSplitTab({
  psYear, setPsYear, psWarehouse, setPsWarehouse,
  psData, psLoading, fetchPaymentSplit, warehouseList,
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <input type="number" min="2020" max="2035" value={psYear} onChange={e => setPsYear(e.target.value)}
          className={inputCls + ' w-24'} />
        <select value={psWarehouse} onChange={e => setPsWarehouse(e.target.value)} className={inputCls}>
          <option value="">全館</option>
          {warehouseList.map(w => <option key={w} value={w}>{w}</option>)}
        </select>
        <WhQuickBtns list={warehouseList} value={psWarehouse} onChange={setPsWarehouse} />
        <button onClick={fetchPaymentSplit} className="px-4 py-1.5 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700">查詢</button>
        {psLoading && <span className="text-xs text-gray-400 animate-pulse">載入中…</span>}
      </div>

      {psData && (() => {
        const { months, totals } = psData;
        const hasPrivate = totals.privateRevenue > 0;
        const highRisk   = totals.privatePct > 20;

        return (
          <>
            {hasPrivate && (
              <div className={`flex items-start gap-2 rounded-lg border px-4 py-3 text-sm ${highRisk ? 'bg-red-50 border-red-300 text-red-800' : 'bg-amber-50 border-amber-300 text-amber-800'}`}>
                <span className="text-lg leading-tight">{highRisk ? '🚨' : '⚠️'}</span>
                <div>
                  <span className="font-semibold">
                    私帳（老闆收取）{psData.year} 年合計：NT$ {totals.privateRevenue.toLocaleString()}（佔總收入 {totals.privatePct}%）
                  </span>
                  <span className="ml-2">請確認上述現金是否已列入稅務申報範圍，避免漏報。</span>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: '公帳收入',       value: totals.publicRevenue,  color: 'text-emerald-600' },
                { label: '私帳（老闆收取）', value: totals.privateRevenue, color: hasPrivate ? 'text-red-600' : 'text-gray-400' },
                { label: '禮券 / 折抵',    value: totals.voucherRevenue, color: 'text-violet-600' },
                { label: '合計收入',        value: totals.total,          color: 'text-indigo-600' },
              ].map(k => (
                <div key={k.label} className="bg-white rounded-xl shadow-sm p-4 border border-gray-100">
                  <div className="text-xs text-gray-400 mb-1">{k.label}</div>
                  <div className={`text-xl font-bold ${k.color}`}>NT$ {k.value.toLocaleString()}</div>
                  {k.label === '私帳（老闆收取）' && (
                    <div className="text-xs text-gray-400 mt-0.5">佔 {totals.privatePct}%</div>
                  )}
                  {k.label === '合計收入' && (
                    <div className="text-xs text-gray-400 mt-0.5">{totals.bookings} 筆已填付款</div>
                  )}
                </div>
              ))}
            </div>

            <div className="bg-white rounded-xl shadow-sm p-5 border border-gray-100">
              <h4 className="text-sm font-semibold text-gray-700 mb-4">月度收款分流（{psData.year} 年）</h4>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 z-10 bg-white">
                    <tr className="border-b text-gray-400">
                      <th className="text-left py-2 pr-3 font-medium">月份</th>
                      <th className="text-right py-2 px-2 font-medium">筆數</th>
                      <th className="text-right py-2 px-2 font-medium text-emerald-700">公帳收入</th>
                      <th className="text-right py-2 px-2 font-medium text-red-600">私帳（老闆收取）</th>
                      <th className="text-right py-2 px-2 font-medium text-violet-600">禮券 / 折抵</th>
                      <th className="text-right py-2 px-2 font-medium">合計</th>
                      <th className="text-right py-2 pl-2 font-medium text-red-500">私帳佔比</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {months.filter(m => m.bookings > 0).map(m => (
                      <tr key={m.month} className={`hover:bg-gray-50 ${m.privatePct > 20 ? 'bg-red-50' : m.privatePct > 0 ? 'bg-amber-50/40' : ''}`}>
                        <td className="py-2 pr-3 font-medium text-gray-700">{m.month}</td>
                        <td className="py-2 px-2 text-right text-gray-500">{m.bookings}</td>
                        <td className="py-2 px-2 text-right text-emerald-700 font-semibold">NT$ {m.publicRevenue.toLocaleString()}</td>
                        <td className="py-2 px-2 text-right">
                          {m.privateRevenue > 0
                            ? <span className="text-red-600 font-semibold">NT$ {m.privateRevenue.toLocaleString()}</span>
                            : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="py-2 px-2 text-right text-violet-600">{m.voucherRevenue > 0 ? `NT$ ${m.voucherRevenue.toLocaleString()}` : '—'}</td>
                        <td className="py-2 px-2 text-right font-semibold text-gray-800">NT$ {m.total.toLocaleString()}</td>
                        <td className={`py-2 pl-2 text-right font-semibold ${m.privatePct > 20 ? 'text-red-600' : m.privatePct > 0 ? 'text-amber-600' : 'text-gray-300'}`}>
                          {m.privatePct > 0 ? `${m.privatePct}%` : '—'}
                        </td>
                      </tr>
                    ))}
                    <tr className="bg-gray-50 font-semibold border-t-2">
                      <td className="py-2 pr-3 text-gray-700">合計</td>
                      <td className="py-2 px-2 text-right text-gray-600">{totals.bookings}</td>
                      <td className="py-2 px-2 text-right text-emerald-700">NT$ {totals.publicRevenue.toLocaleString()}</td>
                      <td className={`py-2 px-2 text-right ${totals.privateRevenue > 0 ? 'text-red-600' : 'text-gray-400'}`}>
                        {totals.privateRevenue > 0 ? `NT$ ${totals.privateRevenue.toLocaleString()}` : '—'}
                      </td>
                      <td className="py-2 px-2 text-right text-violet-600">{totals.voucherRevenue > 0 ? `NT$ ${totals.voucherRevenue.toLocaleString()}` : '—'}</td>
                      <td className="py-2 px-2 text-right text-gray-800">NT$ {totals.total.toLocaleString()}</td>
                      <td className={`py-2 pl-2 text-right ${totals.privatePct > 20 ? 'text-red-600' : totals.privatePct > 0 ? 'text-amber-600' : 'text-gray-300'}`}>
                        {totals.privatePct > 0 ? `${totals.privatePct}%` : '—'}
                      </td>
                    </tr>
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
