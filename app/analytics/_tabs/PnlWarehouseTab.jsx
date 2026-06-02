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

const Bar = ({ value, max, color = 'bg-cyan-500' }) => {
  const w = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="flex-1 bg-gray-100 rounded-full h-2">
      <div className={`${color} h-2 rounded-full transition-all`} style={{ width: `${w}%` }} />
    </div>
  );
};

const Loading = ({ text = '載入中...' }) => (
  <div className="flex items-center justify-center py-20 text-gray-400">
    <svg className="animate-spin h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
    </svg>
    {text}
  </div>
);

function PnlDataView({ data, onTrace }) {
  const warehouses = data.byWarehouse || [];
  const totals = warehouses.reduce((acc, w) => ({
    income: acc.income + w.totalIncome,
    expense: acc.expense + w.totalExpense,
    net: acc.net + w.netProfit,
  }), { income: 0, expense: 0, net: 0 });

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-4">
        <KpiCard label="總收入" value={NT(totals.income)} color="text-blue-600" icon="📥" />
        <KpiCard label="總支出" value={NT(totals.expense)} color="text-red-500" icon="📤" />
        <KpiCard label="淨損益" value={NT(totals.net)} color={totals.net >= 0 ? 'text-emerald-600' : 'text-red-600'} icon="⚖️" />
      </div>

      {warehouses.length === 0 ? (
        <div className="text-center py-12 text-gray-400">此期間無現金流資料</div>
      ) : warehouses.map(w => (
        <div key={w.warehouse} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-5 py-3 bg-gradient-to-r from-cyan-50 to-blue-50 border-b border-gray-100 flex items-center justify-between">
            <h4 className="font-semibold text-gray-800">{w.warehouse}</h4>
            <div className="flex gap-6 text-sm">
              <span className="text-blue-600">收入 {NT(w.totalIncome)}</span>
              <span className="text-red-500">支出 {NT(w.totalExpense)}</span>
              <span className={`font-bold ${w.netProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                淨損益 {NT(w.netProfit)}
              </span>
            </div>
          </div>

          <div className="grid md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-gray-100">
            <div className="p-4">
              <p className="text-xs font-semibold text-blue-600 mb-2">收入明細</p>
              <table className="w-full text-xs">
                <tbody className="divide-y divide-gray-50">
                  {w.incomeBySubject.map((item, i) => (
                    <tr key={i} className="hover:bg-blue-50/40 cursor-pointer" onClick={() => onTrace({ warehouseLabel: w.warehouse, flowType: 'income', subjectKey: item.subjectKey, subjectName: item.subject?.name })}>
                      <td className="py-1.5 text-gray-600">{item.subject?.name || item.subjectKey}</td>
                      <td className="py-1.5 text-right font-medium text-blue-700">{NT(item.amount)}</td>
                      <td className="py-1.5 pl-2 w-24">
                        <Bar value={item.amount} max={w.totalIncome} color="bg-blue-400" />
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-gray-200 font-semibold">
                    <td className="py-1.5 text-gray-700">合計</td>
                    <td className="py-1.5 text-right text-blue-700">{NT(w.totalIncome)}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>

            <div className="p-4">
              <p className="text-xs font-semibold text-red-500 mb-2">支出明細</p>
              <table className="w-full text-xs">
                <thead className="sticky top-0 z-10 bg-white">
                  <tr className="text-gray-400 border-b border-gray-100">
                    <th className="py-1 text-left font-normal">廠商</th>
                    <th className="py-1 text-left font-normal">會計科目</th>
                    <th className="py-1 text-left font-normal">內容</th>
                    <th className="py-1 text-right font-normal">金額</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {w.expenseBySubject.flatMap((item, i) =>
                    (item.items && item.items.length > 0 ? item.items : [{ supplierName: '', accountingSubjectName: item.subject?.name || item.subjectKey, description: '', amount: item.amount }]).map((tx, j) => (
                      <tr key={`${i}-${j}`} className="hover:bg-red-50/40 cursor-pointer" onClick={() => onTrace({ warehouseLabel: w.warehouse, flowType: 'expense', subjectKey: item.subjectKey, subjectName: item.subject?.name })}>
                        <td className="py-1.5 text-gray-600 pr-2">{tx.supplierName || <span className="text-gray-300">—</span>}</td>
                        <td className="py-1.5 text-gray-600 pr-2">{tx.accountingSubjectName || <span className="text-gray-300">—</span>}</td>
                        <td className="py-1.5 text-gray-600 pr-2">{tx.description || <span className="text-gray-300">—</span>}</td>
                        <td className="py-1.5 text-right font-medium text-red-600 whitespace-nowrap">{NT(tx.amount)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
                <tfoot>
                  <tr className="border-t border-gray-200 font-semibold">
                    <td className="py-1.5 text-gray-700" colSpan={3}>合計</td>
                    <td className="py-1.5 text-right text-red-600">{NT(w.totalExpense)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      ))}
      <p className="text-xs text-gray-400 text-right">點擊各科目列可查看現金流明細</p>
    </div>
  );
}

export default function PnlWarehouseTab({
  warehouses,
  pnlStart, setPnlStart,
  pnlEnd, setPnlEnd,
  pnlWarehouse, setPnlWarehouse,
  pnlLoading, pnl,
  fetchPnl, onTrace,
}) {
  return (
    <div className="space-y-5">
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label htmlFor="f" className="block text-xs text-gray-500 mb-1">起始日期</label>
            <input id="f" type="date" value={pnlStart} onChange={e => setPnlStart(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-400" />
          </div>
          <div>
            <label htmlFor="f-2" className="block text-xs text-gray-500 mb-1">結束日期</label>
            <input id="f-2" type="date" value={pnlEnd} onChange={e => setPnlEnd(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-400" />
          </div>
          <div>
            <label htmlFor="f-3" className="block text-xs text-gray-500 mb-1">館別（選填）</label>
            <select id="f-3" value={pnlWarehouse} onChange={e => setPnlWarehouse(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-400">
              <option value="">全部館別</option>
              {warehouses.map(w => <option key={w} value={w}>{w}</option>)}
            </select>
          </div>
          <button onClick={fetchPnl} className="px-4 py-1.5 bg-cyan-600 text-white rounded-lg text-sm font-medium hover:bg-cyan-700">
            查詢
          </button>
        </div>
        <p className="mt-3 text-xs text-gray-500">變更日期或館別後請按「查詢」重新計算。</p>
      </div>

      {pnlLoading ? <Loading text="計算損益中..." /> :
        pnl ? <PnlDataView data={pnl} onTrace={onTrace} /> :
        <div className="text-center py-12 text-gray-400">請設定日期範圍後查詢</div>
      }
    </div>
  );
}
