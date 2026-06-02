'use client';

const NT = (v) => `NT$ ${Number(v || 0).toLocaleString()}`;

const riskBadge = (level) => {
  const map = { low: 'bg-green-100 text-green-700', medium: 'bg-amber-100 text-amber-700', high: 'bg-orange-100 text-orange-700', critical: 'bg-red-100 text-red-700' };
  const label = { low: '低風險', medium: '中風險', high: '高風險', critical: '危急' };
  return <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${map[level] || map.low}`}>{label[level] || level}</span>;
};

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

const SectionTitle = ({ children }) => (
  <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
    <span className="w-1 h-4 bg-cyan-500 rounded-full inline-block" />
    {children}
  </h3>
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

function CashflowDataView({ data }) {
  const riskColor = { low: 'text-emerald-600', medium: 'text-amber-600', high: 'text-orange-600', critical: 'text-red-600' };
  const scenarioBg = { optimistic: 'bg-green-50 border-green-200', risk: 'bg-amber-50 border-amber-200', crisis: 'bg-red-50 border-red-200' };
  const scenarioColor = { optimistic: 'text-green-700', risk: 'text-amber-700', crisis: 'text-red-700' };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="當前現金餘額" value={NT(data.currentCash)} color="text-blue-600" icon="💰" />
        <KpiCard label="預計流入" value={NT(data.totalExpectedInflow)} color="text-emerald-600" icon="⬇️"
          sub={`${(data.inflows?.checks?.length || 0)} 張支票 + ${(data.inflows?.rentals?.length || 0)} 筆租金`} />
        <KpiCard label="預計流出" value={NT(data.totalExpectedOutflow)} color="text-red-500" icon="⬆️"
          sub={`${(data.outflows?.checks?.length || 0)} 張支票 + ${(data.outflows?.loans?.length || 0)} 筆貸款`} />
        <KpiCard label="預測餘額" value={NT(data.predictedBalance)}
          color={data.predictedBalance >= 0 ? 'text-emerald-600' : 'text-red-600'} icon="📊"
          sub={<span className={riskColor[data.riskLevel]}>{riskBadge(data.riskLevel)}</span>} />
      </div>

      <div>
        <SectionTitle>情境模擬</SectionTitle>
        <div className="grid md:grid-cols-3 gap-4">
          {Object.entries(data.scenarios || {}).map(([key, s]) => (
            <div key={key} className={`rounded-xl border p-4 ${scenarioBg[key]}`}>
              <p className={`font-semibold text-sm mb-1 ${scenarioColor[key]}`}>{s.label}</p>
              <p className={`text-xl font-bold ${scenarioColor[key]}`}>{NT(s.predictedBalance)}</p>
              <p className="text-xs text-gray-500 mt-1">{s.description}</p>
            </div>
          ))}
        </div>
      </div>

      {data.outflows?.checks?.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-5 py-3 border-b bg-red-50">
            <p className="font-semibold text-sm text-red-700">到期支票（應付）— {data.outflows.checks.length} 張</p>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50 sticky top-0 z-10">
              <tr>
                <th className="px-4 py-2 text-left text-xs text-gray-500">到期日</th>
                <th className="px-4 py-2 text-left text-xs text-gray-500">收款人</th>
                <th className="px-4 py-2 text-right text-xs text-gray-500">金額</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.outflows.checks.slice(0, 10).map((c, i) => (
                <tr key={i} className="hover:bg-gray-50">
                  <td className="px-4 py-2 text-gray-500">{c.dueDate}</td>
                  <td className="px-4 py-2">{c.payeeName || '—'}</td>
                  <td className="px-4 py-2 text-right text-red-600 font-medium">{NT(c.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.outflows.checks.length > 10 && (
            <div className="px-4 py-2 text-xs text-gray-400 bg-gray-50">僅顯示前 10 筆，共 {data.outflows.checks.length} 筆</div>
          )}
        </div>
      )}

      {data.inflows?.rentals?.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-5 py-3 border-b bg-green-50">
            <p className="font-semibold text-sm text-green-700">待收租金 — {data.inflows.rentals.length} 筆</p>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50 sticky top-0 z-10">
              <tr>
                <th className="px-4 py-2 text-left text-xs text-gray-500">到期日</th>
                <th className="px-4 py-2 text-right text-xs text-gray-500">金額</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.inflows.rentals.slice(0, 10).map((r, i) => (
                <tr key={i} className="hover:bg-gray-50">
                  <td className="px-4 py-2 text-gray-500">{r.dueDate}</td>
                  <td className="px-4 py-2 text-right text-green-600 font-medium">{NT(r.expectedAmount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data.outflows?.loans?.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-5 py-3 border-b bg-orange-50">
            <p className="font-semibold text-sm text-orange-700">貸款月繳 — {data.outflows.loans.length} 筆</p>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50 sticky top-0 z-10">
              <tr>
                <th className="px-4 py-2 text-left text-xs text-gray-500">貸款名稱</th>
                <th className="px-4 py-2 text-right text-xs text-gray-500">月繳金額</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.outflows.loans.map((l, i) => (
                <tr key={i} className="hover:bg-gray-50">
                  <td className="px-4 py-2">{l.loanName}</td>
                  <td className="px-4 py-2 text-right text-orange-600 font-medium">{NT(l.monthlyPayment)}</td>
                </tr>
              ))}
              <tr className="bg-orange-50 font-semibold">
                <td className="px-4 py-2 text-right text-xs text-gray-600">合計</td>
                <td className="px-4 py-2 text-right text-orange-700">
                  {NT(data.outflows.loans.reduce((s, l) => s + (l.monthlyPayment || 0), 0))}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function CashflowTab({
  forecastDays, setForecastDays,
  cashflowLoading, cashflow,
  fetchCashflow,
}) {
  return (
    <div className="space-y-5">
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex items-end gap-4">
        <div>
          <label htmlFor="f-10" className="block text-xs text-gray-500 mb-1">預測天數</label>
          <select id="f-10" value={forecastDays} onChange={e => setForecastDays(Number(e.target.value))}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-400">
            <option value={7}>7 天</option>
            <option value={14}>14 天</option>
            <option value={30}>30 天</option>
            <option value={60}>60 天</option>
            <option value={90}>90 天</option>
          </select>
        </div>
        <button onClick={fetchCashflow} className="px-4 py-1.5 bg-cyan-600 text-white rounded-lg text-sm font-medium hover:bg-cyan-700">
          重新預測
        </button>
      </div>
      {cashflowLoading ? <Loading text="預測現金流中..." /> :
        cashflow ? <CashflowDataView data={cashflow} /> :
        <div className="text-center py-12 text-gray-400">無資料</div>
      }
    </div>
  );
}
