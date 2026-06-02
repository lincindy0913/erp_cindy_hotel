'use client';

const NT = (v) => `NT$ ${Number(v || 0).toLocaleString()}`;

const KpiCard = ({ label, value, sub, color = 'text-gray-900', icon }) => (
  <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
    <div className="flex items-start justify-between">
      <p className="text-xs text-gray-500 font-medium">{label}</p>
      {icon && <span className="text-lg">{icon}</span>}
    </div>
    <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
    {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
  </div>
);

const Loading = ({ text = '載入中...' }) => (
  <div className="flex items-center justify-center py-20 text-gray-400">
    <svg className="animate-spin h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
    </svg>
    {text}
  </div>
);

function PnlSummaryDataView({ data }) {
  const s = data.summary || {};
  const monthly = data.monthly || [];
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard label="PMS 收入（貸方）" value={NT(s.revenue)} color="text-blue-700" icon="📈" />
        <KpiCard label="進貨成本（已扣折讓）" value={NT(s.cogs)} color="text-amber-700" icon="📦" />
        <KpiCard label="進貨折讓合計" value={NT(s.allowances)} color="text-gray-600" icon="↩️" />
        <KpiCard label="費用" value={NT(s.expenses)} color="text-orange-700" icon="🧾" />
        <KpiCard label="毛利" value={NT(s.grossProfit)} color={s.grossProfit >= 0 ? 'text-emerald-700' : 'text-red-600'} icon="◆" />
        <KpiCard label="淨利" value={NT(s.netProfit)} color={s.netProfit >= 0 ? 'text-cyan-700' : 'text-red-600'} icon="✓" />
      </div>
      {monthly.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-5 py-3 border-b bg-gray-50">
            <p className="font-semibold text-sm text-gray-700">月度彙總</p>
          </div>
          <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
            <table className="w-full text-sm min-w-[880px]">
              <thead className="bg-gray-50 sticky top-0 z-10">
                <tr>
                  <th className="px-4 py-2 text-left text-xs text-gray-500">月份</th>
                  <th className="px-4 py-2 text-right text-xs text-gray-500">收入</th>
                  <th className="px-4 py-2 text-right text-xs text-gray-500">進貨成本</th>
                  <th className="px-4 py-2 text-right text-xs text-gray-500">折讓</th>
                  <th className="px-4 py-2 text-right text-xs text-gray-500">費用</th>
                  <th className="px-4 py-2 text-right text-xs text-gray-500">毛利</th>
                  <th className="px-4 py-2 text-right text-xs text-gray-500">淨利</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {monthly.map((m) => (
                  <tr key={m.month} className="hover:bg-gray-50">
                    <td className="px-4 py-2 font-medium text-gray-800">{m.month}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{NT(m.revenue)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{NT(m.cogs)}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-gray-500">{NT(m.allowances)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{NT(m.expenses)}</td>
                    <td className={`px-4 py-2 text-right tabular-nums font-medium ${m.grossProfit >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>{NT(m.grossProfit)}</td>
                    <td className={`px-4 py-2 text-right tabular-nums font-medium ${m.netProfit >= 0 ? 'text-cyan-700' : 'text-red-600'}`}>{NT(m.netProfit)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

export default function PnlSummaryTab({
  warehouses,
  pnlSumStart, setPnlSumStart,
  pnlSumEnd, setPnlSumEnd,
  pnlSumWarehouse, setPnlSumWarehouse,
  pnlSummaryLoading, pnlSummaryData,
  fetchPnlSummary,
}) {
  return (
    <div className="space-y-5">
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label htmlFor="f-7" className="block text-xs text-gray-500 mb-1">起始日期</label>
            <input id="f-7" type="date" value={pnlSumStart} onChange={e => setPnlSumStart(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-400" />
          </div>
          <div>
            <label htmlFor="f-8" className="block text-xs text-gray-500 mb-1">結束日期</label>
            <input id="f-8" type="date" value={pnlSumEnd} onChange={e => setPnlSumEnd(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-400" />
          </div>
          <div>
            <label htmlFor="f-9" className="block text-xs text-gray-500 mb-1">館別（選填）</label>
            <select id="f-9" value={pnlSumWarehouse} onChange={e => setPnlSumWarehouse(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-400">
              <option value="">全部館別</option>
              {warehouses.map(w => <option key={w} value={w}>{w}</option>)}
            </select>
          </div>
          <button type="button" onClick={fetchPnlSummary} className="px-4 py-1.5 bg-cyan-600 text-white rounded-lg text-sm font-medium hover:bg-cyan-700">
            查詢
          </button>
        </div>
        <p className="mt-3 text-xs text-gray-500 leading-relaxed">
          將 PMS 收入、進貨（扣折讓）、費用分項加總為<strong>不分館別矩陣</strong>的整體損益；與「館別損益」分頁（依館別展開與鑽取）算法不同。
        </p>
      </div>
      {pnlSummaryLoading ? <Loading text="計算損益彙總中..." /> :
        pnlSummaryData ? <PnlSummaryDataView data={pnlSummaryData} /> :
        <div className="text-center py-12 text-gray-400">請設定日期後按「查詢」</div>
      }
    </div>
  );
}
