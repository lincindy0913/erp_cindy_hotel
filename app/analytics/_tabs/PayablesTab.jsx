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

function PayablesDataView({ data }) {
  const AGING_COLORS = { '0-30': 'text-gray-700 bg-gray-50', '30-60': 'text-amber-700 bg-amber-50', '60-90': 'text-orange-700 bg-orange-50', '90+': 'text-red-700 bg-red-50' };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <KpiCard label="未核銷總額" value={NT(data.totalUnpaid)} color="text-gray-800" icon="📋" />
        <KpiCard label="當前現金餘額" value={NT(data.currentCash)} color="text-blue-600" icon="💰" />
        <KpiCard label="風險等級" value={data.riskLevel === 'high' ? '高風險' : data.riskLevel === 'medium' ? '中風險' : '低風險'}
          color={data.riskLevel === 'high' ? 'text-red-600' : data.riskLevel === 'medium' ? 'text-amber-600' : 'text-green-600'} icon="⚠️" />
      </div>

      <div>
        <SectionTitle>帳齡分佈</SectionTitle>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {(data.buckets || []).map(b => (
            <div key={b.range} className={`rounded-xl border p-4 ${AGING_COLORS[b.range] || 'bg-gray-50'}`}>
              <p className="text-xs font-medium opacity-70 mb-1">{b.range} 天</p>
              <p className="text-xl font-bold">{NT(b.total)}</p>
              <p className="text-xs opacity-60 mt-1">{b.count} 筆 — {b.percentage}%</p>
              <div className="mt-2 bg-white/60 rounded-full h-1.5">
                <div className="h-1.5 rounded-full bg-current opacity-40" style={{ width: `${Math.min(100, b.percentage)}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {data.cashPressure?.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <SectionTitle>資金壓力預測</SectionTitle>
          <table className="w-full text-sm">
            <thead className="bg-gray-50 sticky top-0 z-10">
              <tr>
                <th className="px-4 py-2 text-left text-xs text-gray-500">期間</th>
                <th className="px-4 py-2 text-right text-xs text-gray-500">到期支出</th>
                <th className="px-4 py-2 text-right text-xs text-gray-500">預測餘額</th>
                <th className="px-4 py-2 text-right text-xs text-gray-500">資金充足率</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.cashPressure.map((p, i) => (
                <tr key={i} className="hover:bg-gray-50">
                  <td className="px-4 py-2 font-medium">{p.days} 天內</td>
                  <td className="px-4 py-2 text-right text-red-500">{NT(p.pendingOutflow)}</td>
                  <td className={`px-4 py-2 text-right font-medium ${p.predictedBalance >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{NT(p.predictedBalance)}</td>
                  <td className={`px-4 py-2 text-right ${p.sufficiency < 50 ? 'text-red-600 font-semibold' : 'text-gray-700'}`}>{p.sufficiency}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data.overdueHighRisk?.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-red-100 overflow-hidden">
          <div className="px-5 py-3 border-b bg-red-50">
            <p className="font-semibold text-sm text-red-700">高風險逾期項目（超過 60 天 & 金額 &gt; 50,000）</p>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50 sticky top-0 z-10">
              <tr>
                <th className="px-4 py-2 text-left text-xs text-gray-500">客戶</th>
                <th className="px-4 py-2 text-left text-xs text-gray-500">發票日</th>
                <th className="px-4 py-2 text-right text-xs text-gray-500">逾期天數</th>
                <th className="px-4 py-2 text-right text-xs text-gray-500">金額</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.overdueHighRisk.map((r, i) => (
                <tr key={i} className="hover:bg-red-50/30">
                  <td className="px-4 py-2 font-medium">{r.supplierName || '—'}</td>
                  <td className="px-4 py-2 text-gray-500">{r.invoiceDate}</td>
                  <td className="px-4 py-2 text-right text-red-600 font-semibold">{r.daysOutstanding} 天</td>
                  <td className="px-4 py-2 text-right text-red-600 font-bold">{NT(r.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ExpenseApAgingView({ data }) {
  const bucketCls = [
    'text-gray-700 bg-gray-50 border-gray-100',
    'text-amber-700 bg-amber-50 border-amber-100',
    'text-orange-700 bg-orange-50 border-orange-100',
    'text-red-700 bg-red-50 border-red-100',
  ];
  const totalAmt = data.totalUnpaid || 0;
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="費用單未結總額" value={NT(data.totalUnpaid)} color="text-gray-800" icon="📋" />
        <KpiCard label="筆數" value={`${data.totalCount ?? 0} 筆`} color="text-cyan-700" icon="📑" />
      </div>
      <div>
        <SectionTitle>帳齡分佈（由發票日起算）</SectionTitle>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {(data.buckets || []).map((b, i) => {
            const pct = totalAmt > 0 ? ((b.amount / totalAmt) * 100).toFixed(1) : '0';
            return (
              <div key={b.range} className={`rounded-xl border p-4 ${bucketCls[i] || bucketCls[0]}`}>
                <p className="text-xs font-medium opacity-80 mb-1">{b.range}</p>
                <p className="text-xl font-bold">{NT(b.amount)}</p>
                <p className="text-xs opacity-70 mt-1">{b.count} 筆 — {pct}%</p>
              </div>
            );
          })}
        </div>
      </div>
      {(data.topUnpaid || []).length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-5 py-3 border-b bg-gray-50">
            <p className="font-semibold text-sm text-gray-700">金額前 20 筆（未結費用單）</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[720px]">
              <thead className="bg-gray-50 sticky top-0 z-10">
                <tr>
                  <th className="px-4 py-2 text-left text-xs text-gray-500">發票／單號</th>
                  <th className="px-4 py-2 text-left text-xs text-gray-500">發票日</th>
                  <th className="px-4 py-2 text-left text-xs text-gray-500">廠商</th>
                  <th className="px-4 py-2 text-left text-xs text-gray-500">館別</th>
                  <th className="px-4 py-2 text-right text-xs text-gray-500">金額</th>
                  <th className="px-4 py-2 text-right text-xs text-gray-500">帳齡（天）</th>
                  <th className="px-4 py-2 text-center text-xs text-gray-500">狀態</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.topUnpaid.map((row) => (
                  <tr key={row.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2 font-mono text-xs">{row.invoiceNo || '—'}</td>
                    <td className="px-4 py-2 text-gray-600">{row.invoiceDate || '—'}</td>
                    <td className="px-4 py-2">{row.supplierName || '—'}</td>
                    <td className="px-4 py-2 text-gray-600">{row.warehouse || '—'}</td>
                    <td className="px-4 py-2 text-right font-medium">{NT(row.amount)}</td>
                    <td className="px-4 py-2 text-right text-amber-700 font-medium">{row.daysOutstanding}</td>
                    <td className="px-4 py-2 text-center text-xs text-gray-500">{row.status || '—'}</td>
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

export default function PayablesTab({
  warehouses,
  payablesSegment, setPayablesSegment,
  payablesLoading, payables,
  apAgingLoading, apAging,
  apAgingWarehouse, setApAgingWarehouse,
  fetchApAging,
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-xs text-gray-500 mr-1">資料來源：</span>
        <button
          type="button"
          onClick={() => setPayablesSegment('operations')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            payablesSegment === 'operations' ? 'bg-cyan-600 text-white shadow-sm' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
          }`}
        >
          營運應付與資金
        </button>
        <button
          type="button"
          onClick={() => setPayablesSegment('expenseAp')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            payablesSegment === 'expenseAp' ? 'bg-cyan-600 text-white shadow-sm' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
          }`}
        >
          費用單應付（AP）
        </button>
      </div>
      <p className="text-xs text-gray-500 leading-relaxed px-0.5">
        <strong>營運應付與資金</strong>：銷貨應付未核銷、支票到期與現金壓力（原「應付帳齡」）。
        <span className="mx-1.5 text-gray-300">｜</span>
        <strong>費用單應付（AP）</strong>：費用單狀態非「已完成」之欠款與發票帳齡。
      </p>

      {payablesSegment === 'operations' && (
        payablesLoading ? <Loading text="分析應付帳齡中..." /> :
        payables ? <PayablesDataView data={payables} /> :
        <div className="text-center py-12 text-gray-400">無資料</div>
      )}

      {payablesSegment === 'expenseAp' && (
        <>
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex flex-wrap items-end gap-4">
            <div>
              <label htmlFor="f-15" className="block text-xs text-gray-500 mb-1">館別篩選（選填）</label>
              <select id="f-15" value={apAgingWarehouse} onChange={e => setApAgingWarehouse(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-400 min-w-[140px]">
                <option value="">全部館別</option>
                {warehouses.map(w => <option key={w} value={w}>{w}</option>)}
              </select>
            </div>
            <button type="button" onClick={fetchApAging} className="px-4 py-1.5 bg-cyan-600 text-white rounded-lg text-sm font-medium hover:bg-cyan-700">
              套用並重新載入
            </button>
          </div>
          {apAgingLoading ? <Loading text="分析費用單帳齡中..." /> :
            apAging ? <ExpenseApAgingView data={apAging} /> :
            <div className="text-center py-12 text-gray-400">無資料</div>
          }
        </>
      )}
    </div>
  );
}
