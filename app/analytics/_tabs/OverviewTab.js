'use client';

const NT = (v) => `NT$ ${Number(v || 0).toLocaleString()}`;
const pct = (v) => `${Number(v || 0).toFixed(1)}%`;

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

export default function OverviewTab({ data, onTabSwitch }) {
  const rep = data.rep?.report || data.rep?.generated;
  const cash = data.cash;
  const pay = data.pay;

  const profit = rep?.profitAnalysis;
  const cashFlow = rep?.cashFlowAnalysis || cash;

  return (
    <div className="space-y-6">
      {/* KPI Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard
          label="現金餘額"
          value={NT(cash?.currentCash ?? cashFlow?.currentBalance)}
          sub={cash?.riskLevel ? `風險：${cash.riskLevel}` : undefined}
          color={cash?.riskLevel === 'critical' ? 'text-red-600' : cash?.riskLevel === 'high' ? 'text-orange-600' : 'text-emerald-600'}
          icon="💰"
        />
        <KpiCard
          label="本月銷貨額"
          value={NT(profit?.totalSales)}
          sub="（採購 + PMS 收入）"
          color="text-blue-600"
          icon="📈"
        />
        <KpiCard
          label="本月採購額"
          value={NT(profit?.totalPurchase)}
          sub="（進貨支出）"
          color="text-gray-700"
          icon="🛒"
        />
        <KpiCard
          label="毛利率"
          value={pct(profit?.grossMargin)}
          sub={`目標 ${profit?.targetGrossMargin ?? 36}% | ${profit?.status === 'achieved' ? '✓ 達標' : '⚠ 未達標'}`}
          color={profit?.status === 'achieved' ? 'text-emerald-600' : 'text-red-500'}
          icon="📊"
        />
      </div>

      {/* Cash Flow Forecast quick view */}
      {cash && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <SectionTitle>30 天現金流預測</SectionTitle>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <div className="text-center p-3 bg-blue-50 rounded-lg">
              <p className="text-xs text-gray-500 mb-1">當前現金</p>
              <p className="font-bold text-blue-700">{NT(cash.currentCash)}</p>
            </div>
            <div className="text-center p-3 bg-green-50 rounded-lg">
              <p className="text-xs text-gray-500 mb-1">預計流入</p>
              <p className="font-bold text-green-700">+{NT(cash.totalExpectedInflow)}</p>
            </div>
            <div className="text-center p-3 bg-red-50 rounded-lg">
              <p className="text-xs text-gray-500 mb-1">預計流出</p>
              <p className="font-bold text-red-700">-{NT(cash.totalExpectedOutflow)}</p>
            </div>
            <div className={`text-center p-3 rounded-lg ${cash.predictedBalance >= 0 ? 'bg-emerald-50' : 'bg-red-50'}`}>
              <p className="text-xs text-gray-500 mb-1">預測餘額</p>
              <p className={`font-bold ${cash.predictedBalance >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>{NT(cash.predictedBalance)}</p>
            </div>
          </div>
          <div className="flex items-center justify-between">
            {riskBadge(cash.riskLevel)}
            <button onClick={() => onTabSwitch('cashflow')} className="text-xs text-cyan-600 hover:underline">
              查看詳細預測 →
            </button>
          </div>
        </div>
      )}

      {/* Payables quick view */}
      {pay && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <SectionTitle>應付帳齡概況</SectionTitle>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            {(pay.buckets || []).map(b => (
              <div key={b.range} className={`p-3 rounded-lg border ${b.range === '90+' ? 'border-red-200 bg-red-50' : b.range === '60-90' ? 'border-orange-200 bg-orange-50' : 'border-gray-200 bg-gray-50'}`}>
                <p className="text-xs text-gray-500">{b.range} 天</p>
                <p className={`font-bold text-sm mt-1 ${b.range === '90+' ? 'text-red-700' : b.range === '60-90' ? 'text-orange-700' : 'text-gray-800'}`}>{NT(b.total)}</p>
                <p className="text-xs text-gray-400">{b.count} 筆 ({b.percentage}%)</p>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-600">應付總額：<strong>{NT(pay.totalUnpaid)}</strong></span>
            <button onClick={() => onTabSwitch('payables')} className="text-xs text-cyan-600 hover:underline">
              查看帳齡明細 →
            </button>
          </div>
        </div>
      )}

      {/* Recommendations */}
      {rep?.recommendations?.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <SectionTitle>優先行動建議</SectionTitle>
          <div className="space-y-3">
            {rep.recommendations.map((r, i) => (
              <div key={i} className="flex gap-3 p-3 bg-amber-50 border border-amber-100 rounded-lg">
                <span className="flex-shrink-0 w-6 h-6 bg-amber-500 text-white rounded-full flex items-center justify-center text-xs font-bold">{r.priority}</span>
                <div>
                  <p className="font-semibold text-sm text-gray-800">{r.action}</p>
                  <p className="text-xs text-gray-600 mt-0.5">{r.description}</p>
                  <p className="text-xs text-amber-700 mt-1">預期影響：{r.expectedImpact}｜時程：{r.timeline}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Executive summary */}
      {rep?.executiveSummary && (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-sm text-gray-700 leading-relaxed">
          <span className="font-semibold text-gray-900 mr-2">執行摘要</span>
          {rep.executiveSummary}
        </div>
      )}
    </div>
  );
}
