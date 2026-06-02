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

function SupplierPnlDataView({ data, search }) {
  const { rows = [], summary = {} } = data;
  const maxCost = rows[0]?.totalCost || 1;

  const filtered = search.trim()
    ? rows.filter(r => r.supplierName.toLowerCase().includes(search.toLowerCase()))
    : rows;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <KpiCard label="廠商數量"   value={summary.supplierCount ?? 0} icon="🏢" color="text-blue-600" />
        <KpiCard label="採購總額"   value={NT(summary.totalPurchases)}  icon="🛒" color="text-gray-700" />
        <KpiCard label="退貨總額"   value={NT(summary.totalAllowances)} icon="↩" color="text-orange-600" />
        <KpiCard label="淨採購額"   value={NT(summary.totalNetPurchases)} icon="📦" color="text-cyan-700" />
        <KpiCard label="費用總額"   value={NT(summary.totalExpenses)}   icon="💸" color="text-red-600" />
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-4 py-3 bg-gray-50 border-b flex items-center justify-between">
          <p className="text-sm font-semibold text-gray-700">
            廠商損益明細（共 {filtered.length} 筆{search.trim() ? '，已篩選' : ''}）
          </p>
          <p className="text-xs text-gray-400">依總支出降序排列</p>
        </div>
        <div className="tbl-wrap">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b sticky top-0 z-10">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 w-8">#</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">廠商名稱</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">採購金額</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">退貨金額</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">淨採購額</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">費用</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 w-32">總支出</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 w-40">佔比</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((r, i) => (
                <tr key={r.supplierId} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-2 text-xs text-gray-400">{i + 1}</td>
                  <td className="px-4 py-2 font-medium text-gray-800">{r.supplierName}</td>
                  <td className="px-4 py-2 text-right font-mono text-gray-600">{NT(r.purchases)}</td>
                  <td className="px-4 py-2 text-right font-mono text-orange-600">
                    {r.allowances > 0 ? `-${NT(r.allowances)}` : '-'}
                  </td>
                  <td className="px-4 py-2 text-right font-mono text-cyan-700">{NT(r.netPurchases)}</td>
                  <td className="px-4 py-2 text-right font-mono text-red-600">
                    {r.expenses > 0 ? NT(r.expenses) : '-'}
                  </td>
                  <td className="px-4 py-2 text-right font-mono font-bold text-gray-900">{NT(r.totalCost)}</td>
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-gray-100 rounded-full h-2">
                        <div className="bg-cyan-500 h-2 rounded-full" style={{ width: `${Math.min(100, (r.totalCost / maxCost) * 100)}%` }} />
                      </div>
                      <span className="text-xs text-gray-500 w-10 text-right">
                        {summary.totalCost > 0 ? `${((r.totalCost / summary.totalCost) * 100).toFixed(1)}%` : '-'}
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-10 text-center text-gray-400">無符合條件的廠商資料</td></tr>
              )}
            </tbody>
            <tfoot className="bg-gray-50 border-t font-semibold text-sm">
              <tr>
                <td className="px-4 py-2" />
                <td className="px-4 py-2 text-gray-700">合計</td>
                <td className="px-4 py-2 text-right font-mono">{NT(filtered.reduce((s,r)=>s+r.purchases,0))}</td>
                <td className="px-4 py-2 text-right font-mono text-orange-600">{NT(filtered.reduce((s,r)=>s+r.allowances,0))}</td>
                <td className="px-4 py-2 text-right font-mono text-cyan-700">{NT(filtered.reduce((s,r)=>s+r.netPurchases,0))}</td>
                <td className="px-4 py-2 text-right font-mono text-red-600">{NT(filtered.reduce((s,r)=>s+r.expenses,0))}</td>
                <td className="px-4 py-2 text-right font-mono font-bold text-gray-900">{NT(filtered.reduce((s,r)=>s+r.totalCost,0))}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}

export default function PnlSupplierTab({
  warehouses, suppliersList,
  supplierPnlStart, setSupplierPnlStart,
  supplierPnlEnd, setSupplierPnlEnd,
  supplierPnlWarehouse, setSupplierPnlWarehouse,
  supplierPnlSearch, setSupplierPnlSearch,
  supplierPnlLoading, supplierPnl,
  fetchSupplierPnl,
}) {
  return (
    <div className="space-y-5">
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label htmlFor="f-4" className="block text-xs text-gray-500 mb-1">起始日期</label>
            <input id="f-4" type="date" value={supplierPnlStart} onChange={e => setSupplierPnlStart(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-400" />
          </div>
          <div>
            <label htmlFor="f-5" className="block text-xs text-gray-500 mb-1">結束日期</label>
            <input id="f-5" type="date" value={supplierPnlEnd} onChange={e => setSupplierPnlEnd(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-400" />
          </div>
          <div>
            <label htmlFor="f-6" className="block text-xs text-gray-500 mb-1">館別（選填）</label>
            <select id="f-6" value={supplierPnlWarehouse} onChange={e => setSupplierPnlWarehouse(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-400">
              <option value="">全部館別</option>
              {warehouses.map(w => <option key={w} value={w}>{w}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="f-25" className="block text-xs text-gray-500 mb-1">搜尋廠商</label>
            <select id="f-25" value={supplierPnlSearch} onChange={e => setSupplierPnlSearch(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-400">
              <option value="">全部廠商</option>
              {suppliersList.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <button onClick={fetchSupplierPnl} className="px-4 py-1.5 bg-cyan-600 text-white rounded-lg text-sm font-medium hover:bg-cyan-700">
            查詢
          </button>
        </div>
        <p className="mt-3 text-xs text-gray-500">變更日期、館別或廠商篩選後請按「查詢」重新計算。</p>
      </div>

      {supplierPnlLoading ? <Loading text="計算廠商損益中..." /> :
        supplierPnl ? <SupplierPnlDataView data={supplierPnl} search={supplierPnlSearch} /> :
        <div className="text-center py-12 text-gray-400">請設定日期範圍後查詢</div>
      }
    </div>
  );
}
