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

const Loading = ({ text = '載入中...' }) => (
  <div className="flex items-center justify-center py-20 text-gray-400">
    <svg className="animate-spin h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
    </svg>
    {text}
  </div>
);

function ReportDataView({ data, onApprove, approving }) {
  const r = data.report || data.generated;
  if (!r) return <div className="text-center py-12 text-gray-400">此月份尚無報告資料</div>;

  const isLive = !data.report;
  const profit = r.profitAnalysis || {};
  const risk = r.riskAnalysis || {};
  const cashFlow = r.cashFlowAnalysis || {};

  return (
    <div className="space-y-5">
      <div className={`rounded-xl border p-4 flex items-center justify-between ${isLive ? 'bg-blue-50 border-blue-200' : r.status === 'approved' ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'}`}>
        <div>
          <p className="font-semibold text-gray-800">{r.reportYear} 年 {r.reportMonth} 月 月度報告</p>
          <p className="text-xs text-gray-500 mt-0.5">
            {isLive ? '即時預覽（月結後可正式核准）' : r.status === 'approved' ? `已核准 — ${r.approvedBy} 於 ${new Date(r.approvedAt).toLocaleDateString('zh-TW')}` : '待核准'}
          </p>
        </div>
        {!isLive && r.status !== 'approved' && (
          <button onClick={onApprove} disabled={approving}
            className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50">
            {approving ? '核准中...' : '核准報告'}
          </button>
        )}
      </div>

      {r.executiveSummary && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <SectionTitle>執行摘要</SectionTitle>
          <p className="text-sm text-gray-700 leading-relaxed">{r.executiveSummary}</p>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="銷貨額" value={NT(profit.totalSales)} color="text-blue-600" icon="📈" />
        <KpiCard label="採購額" value={NT(profit.totalPurchase)} color="text-gray-700" icon="🛒" />
        <KpiCard label="毛利率" value={pct(profit.grossMargin)}
          color={profit.status === 'achieved' ? 'text-emerald-600' : 'text-red-500'} icon="📊"
          sub={`目標 ${profit.targetGrossMargin}%`} />
        <KpiCard label="現金餘額" value={NT(cashFlow.currentBalance)}
          color={cashFlow.currentBalance > 100000 ? 'text-emerald-600' : 'text-orange-600'} icon="💰" />
      </div>

      {risk.supplierConcentration && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <SectionTitle>風險分析</SectionTitle>
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <p className="text-xs font-semibold text-gray-600 mb-3">供應商集中度</p>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-gray-500">Top 1 供應商佔比</span><span className={`font-medium ${risk.supplierConcentration.top1Percentage > 20 ? 'text-red-600' : 'text-gray-700'}`}>{pct(risk.supplierConcentration.top1Percentage)}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Top 3 供應商佔比</span><span className={`font-medium ${risk.supplierConcentration.top3Percentage > 50 ? 'text-orange-600' : 'text-gray-700'}`}>{pct(risk.supplierConcentration.top3Percentage)}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">供應商數量</span><span className="font-medium">{risk.supplierConcentration.supplierCount}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">集中度風險</span>{riskBadge(risk.supplierConcentration.riskLevel)}</div>
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-600 mb-3">現金風險</p>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-gray-500">當前現金</span><span className="font-medium">{NT(risk.cashShortage?.currentCash)}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">風險等級</span>{riskBadge(risk.cashShortage?.riskLevel)}</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {r.recommendations?.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <SectionTitle>改善建議</SectionTitle>
          <div className="space-y-3">
            {r.recommendations.map((rec, i) => (
              <div key={i} className="flex gap-3 p-3 border border-amber-100 bg-amber-50 rounded-lg">
                <span className="flex-shrink-0 w-6 h-6 bg-amber-500 text-white rounded-full flex items-center justify-center text-xs font-bold">{rec.priority}</span>
                <div>
                  <p className="font-semibold text-sm text-gray-800">{rec.action}</p>
                  <p className="text-xs text-gray-600 mt-0.5">{rec.description}</p>
                  <p className="text-xs text-amber-700 mt-1">預期影響：{rec.expectedImpact}｜時程：{rec.timeline}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function ReportTab({
  reportMonth, setReportMonth,
  reportLoading, report,
  reportApproving,
  fetchReport, approveReport,
}) {
  return (
    <div className="space-y-5">
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label htmlFor="yyyymm-2" className="block text-xs text-gray-500 mb-1">月份（YYYYMM）</label>
            <input id="yyyymm-2" type="text" value={reportMonth} onChange={e => setReportMonth(e.target.value)}
              placeholder="202506" maxLength={6}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-36 focus:outline-none focus:ring-2 focus:ring-cyan-400" />
          </div>
          <button onClick={fetchReport} className="px-4 py-1.5 bg-cyan-600 text-white rounded-lg text-sm font-medium hover:bg-cyan-700">
            載入報告
          </button>
        </div>
        <p className="mt-3 text-xs text-gray-500">變更月份後請按「載入報告」重新取得資料（僅切換分頁時會自動載入目前輸入之月份）。</p>
      </div>
      {reportLoading ? <Loading text="載入月度報告中..." /> :
        report ? <ReportDataView data={report} onApprove={approveReport} approving={reportApproving} /> :
        <div className="text-center py-12 text-gray-400">無資料</div>
      }
    </div>
  );
}
