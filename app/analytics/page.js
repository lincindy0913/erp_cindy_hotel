'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import Navigation from '@/components/Navigation';

const TABS = [
  { key: 'overview',       label: '經營總覽' },
  { key: 'pnl-warehouse',  label: '館別損益' },
  { key: 'pnl-supplier',   label: '廠商損益' },
  { key: 'cashflow',       label: '現金流預測' },
  { key: 'procurement',    label: '採購分析' },
  { key: 'payables',       label: '應付帳齡' },
  { key: 'report',         label: '月度報告' },
];

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

const Bar = ({ value, max, color = 'bg-cyan-500' }) => {
  const w = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="flex-1 bg-gray-100 rounded-full h-2">
      <div className={`${color} h-2 rounded-full transition-all`} style={{ width: `${w}%` }} />
    </div>
  );
};

export default function AnalyticsPage() {
  useSession();
  const [activeTab, setActiveTab] = useState('overview');

  // ── Overview ─────────────────────────────────────────────────
  const [overview, setOverview] = useState(null);
  const [overviewLoading, setOverviewLoading] = useState(false);

  // ── P&L by Warehouse ─────────────────────────────────────────
  const [pnl, setPnl] = useState(null);
  const [pnlLoading, setPnlLoading] = useState(false);
  const [pnlStart, setPnlStart] = useState(() => {
    const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10);
  });
  const [pnlEnd, setPnlEnd] = useState(() => new Date().toISOString().slice(0, 10));
  const [pnlWarehouse, setPnlWarehouse] = useState('');
  const [pnlTrace, setPnlTrace] = useState(null);
  const [pnlTraceCtx, setPnlTraceCtx] = useState(null);
  const [pnlTraceLoading, setPnlTraceLoading] = useState(false);

  // ── P&L by Supplier ───────────────────────────────────────────
  const [supplierPnl, setSupplierPnl] = useState(null);
  const [supplierPnlLoading, setSupplierPnlLoading] = useState(false);
  const [supplierPnlStart, setSupplierPnlStart] = useState(() => {
    const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10);
  });
  const [supplierPnlEnd, setSupplierPnlEnd] = useState(() => new Date().toISOString().slice(0, 10));
  const [supplierPnlWarehouse, setSupplierPnlWarehouse] = useState('');
  const [supplierPnlSearch, setSupplierPnlSearch] = useState('');

  // ── Cash Flow ─────────────────────────────────────────────────
  const [cashflow, setCashflow] = useState(null);
  const [cashflowLoading, setCashflowLoading] = useState(false);
  const [forecastDays, setForecastDays] = useState(30);

  // ── Procurement / Supplier Risk ───────────────────────────────
  const [supplierRisk, setSupplierRisk] = useState(null);
  const [supplierLoading, setSupplierLoading] = useState(false);
  const [riskMonth, setRiskMonth] = useState(() => {
    const n = new Date(); return `${n.getFullYear()}${String(n.getMonth() + 1).padStart(2, '0')}`;
  });

  // ── Payables Aging ────────────────────────────────────────────
  const [payables, setPayables] = useState(null);
  const [payablesLoading, setPayablesLoading] = useState(false);

  // ── Monthly Report ────────────────────────────────────────────
  const [report, setReport] = useState(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportMonth, setReportMonth] = useState(() => {
    const n = new Date(); return `${n.getFullYear()}${String(n.getMonth() + 1).padStart(2, '0')}`;
  });
  const [reportApproving, setReportApproving] = useState(false);

  // ── Fetch helpers ─────────────────────────────────────────────
  const fetchOverview = useCallback(async () => {
    setOverviewLoading(true);
    try {
      const now = new Date();
      const month = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
      const [reportRes, cashRes, payRes] = await Promise.all([
        fetch(`/api/analytics/business-report?month=${month}`),
        fetch('/api/analytics/cash-flow-forecast?days=30'),
        fetch('/api/analytics/payables-aging'),
      ]);
      const [rep, cash, pay] = await Promise.all([
        reportRes.ok ? reportRes.json() : null,
        cashRes.ok ? cashRes.json() : null,
        payRes.ok ? payRes.json() : null,
      ]);
      setOverview({ rep, cash, pay });
    } catch (e) { console.error(e); }
    setOverviewLoading(false);
  }, []);

  const fetchPnl = useCallback(async () => {
    setPnlLoading(true); setPnl(null);
    try {
      const p = new URLSearchParams({ startDate: pnlStart, endDate: pnlEnd });
      if (pnlWarehouse.trim()) p.set('warehouse', pnlWarehouse.trim());
      const res = await fetch(`/api/analytics/pnl-by-warehouse?${p}`);
      if (res.ok) setPnl(await res.json());
    } catch (e) { console.error(e); }
    setPnlLoading(false);
  }, [pnlStart, pnlEnd, pnlWarehouse]);

  const fetchSupplierPnl = useCallback(async () => {
    setSupplierPnlLoading(true); setSupplierPnl(null);
    try {
      const p = new URLSearchParams({ startDate: supplierPnlStart, endDate: supplierPnlEnd });
      if (supplierPnlWarehouse.trim()) p.set('warehouse', supplierPnlWarehouse.trim());
      const res = await fetch(`/api/analytics/pnl-by-supplier?${p}`);
      if (res.ok) setSupplierPnl(await res.json());
    } catch (e) { console.error(e); }
    setSupplierPnlLoading(false);
  }, [supplierPnlStart, supplierPnlEnd, supplierPnlWarehouse]);

  const fetchPnlTrace = useCallback(async ({ warehouseLabel, flowType, subjectKey }) => {
    setPnlTraceCtx({ warehouseLabel, flowType, subjectKey }); setPnlTrace(null); setPnlTraceLoading(true);
    try {
      const p = new URLSearchParams({ startDate: pnlStart, endDate: pnlEnd, flowType, subjectKey });
      p.set('warehouse', warehouseLabel === '未指定館別' ? '__NULL__' : (pnlWarehouse.trim() || warehouseLabel));
      const res = await fetch(`/api/analytics/pnl-by-warehouse/drilldown?${p}`);
      if (res.ok) setPnlTrace(await res.json());
    } catch (e) { console.error(e); }
    setPnlTraceLoading(false);
  }, [pnlStart, pnlEnd, pnlWarehouse]);

  const fetchCashflow = useCallback(async () => {
    setCashflowLoading(true);
    try {
      const res = await fetch(`/api/analytics/cash-flow-forecast?days=${forecastDays}`);
      if (res.ok) setCashflow(await res.json());
    } catch (e) { console.error(e); }
    setCashflowLoading(false);
  }, [forecastDays]);

  const fetchSupplierRisk = useCallback(async () => {
    setSupplierLoading(true);
    try {
      const res = await fetch(`/api/analytics/supplier-risk?month=${riskMonth}`);
      if (res.ok) setSupplierRisk(await res.json());
    } catch (e) { console.error(e); }
    setSupplierLoading(false);
  }, [riskMonth]);

  const fetchPayables = useCallback(async () => {
    setPayablesLoading(true);
    try {
      const res = await fetch('/api/analytics/payables-aging');
      if (res.ok) setPayables(await res.json());
    } catch (e) { console.error(e); }
    setPayablesLoading(false);
  }, []);

  const fetchReport = useCallback(async () => {
    setReportLoading(true); setReport(null);
    try {
      const res = await fetch(`/api/analytics/business-report?month=${reportMonth}`);
      if (res.ok) setReport(await res.json());
    } catch (e) { console.error(e); }
    setReportLoading(false);
  }, [reportMonth]);

  const approveReport = async () => {
    setReportApproving(true);
    try {
      const res = await fetch(`/api/analytics/business-report?month=${reportMonth}`, { method: 'PATCH' });
      if (res.ok) { const d = await res.json(); setReport(prev => ({ ...prev, report: d.report })); }
    } catch (e) { console.error(e); }
    setReportApproving(false);
  };

  // Load on tab activation
  useEffect(() => {
    if (activeTab === 'overview') fetchOverview();
    if (activeTab === 'pnl-warehouse') fetchPnl();
    if (activeTab === 'pnl-supplier') fetchSupplierPnl();
    if (activeTab === 'cashflow') fetchCashflow();
    if (activeTab === 'procurement') fetchSupplierRisk();
    if (activeTab === 'payables') fetchPayables();
    if (activeTab === 'report') fetchReport();
  }, [activeTab]);

  useEffect(() => { if (activeTab === 'report') fetchReport(); }, [reportMonth]);

  // ── Render ────────────────────────────────────────────────────
  return (
    <div className="min-h-screen page-bg-analytics">
      <Navigation borderColor="border-cyan-500" />

      <main className="max-w-[96rem] mx-auto px-4 py-8">
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-gray-900">決策分析</h2>
          <p className="text-sm text-gray-500 mt-1">整合現金流、損益、採購與帳齡的即時分析儀表板</p>
        </div>

        {/* Tab bar */}
        <div className="flex flex-wrap gap-1 mb-6 bg-white rounded-xl shadow-sm border border-gray-100 p-1">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setActiveTab(t.key)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                activeTab === t.key ? 'bg-cyan-600 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-50'
              }`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* ══ 總覽 ══════════════════════════════════════════════ */}
        {activeTab === 'overview' && (
          overviewLoading ? <Loading text="載入經營總覽..." /> :
          overview ? <OverviewTab data={overview} onTabSwitch={setActiveTab} /> :
          <div className="text-center py-12 text-gray-400">無法載入資料</div>
        )}

        {/* ══ 館別損益 ═══════════════════════════════════════════ */}
        {activeTab === 'pnl-warehouse' && (
          <div className="space-y-5">
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
              <div className="flex flex-wrap items-end gap-4">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">起始日期</label>
                  <input type="date" value={pnlStart} onChange={e => setPnlStart(e.target.value)}
                    className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-400" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">結束日期</label>
                  <input type="date" value={pnlEnd} onChange={e => setPnlEnd(e.target.value)}
                    className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-400" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">館別（選填）</label>
                  <input type="text" value={pnlWarehouse} onChange={e => setPnlWarehouse(e.target.value)}
                    placeholder="全部館別" className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-32 focus:outline-none focus:ring-2 focus:ring-cyan-400" />
                </div>
                <button onClick={fetchPnl} className="px-4 py-1.5 bg-cyan-600 text-white rounded-lg text-sm font-medium hover:bg-cyan-700">
                  查詢
                </button>
              </div>
            </div>

            {pnlLoading ? <Loading text="計算損益中..." /> :
              pnl ? <PnlTab data={pnl} onTrace={fetchPnlTrace} /> :
              <div className="text-center py-12 text-gray-400">請設定日期範圍後查詢</div>
            }
          </div>
        )}

        {/* ══ 廠商損益 ═══════════════════════════════════════════ */}
        {activeTab === 'pnl-supplier' && (
          <div className="space-y-5">
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
              <div className="flex flex-wrap items-end gap-4">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">起始日期</label>
                  <input type="date" value={supplierPnlStart} onChange={e => setSupplierPnlStart(e.target.value)}
                    className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-400" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">結束日期</label>
                  <input type="date" value={supplierPnlEnd} onChange={e => setSupplierPnlEnd(e.target.value)}
                    className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-400" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">館別（選填）</label>
                  <input type="text" value={supplierPnlWarehouse} onChange={e => setSupplierPnlWarehouse(e.target.value)}
                    placeholder="全部館別" className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-32 focus:outline-none focus:ring-2 focus:ring-cyan-400" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">搜尋廠商</label>
                  <input type="text" value={supplierPnlSearch} onChange={e => setSupplierPnlSearch(e.target.value)}
                    placeholder="廠商名稱..." className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-36 focus:outline-none focus:ring-2 focus:ring-cyan-400" />
                </div>
                <button onClick={fetchSupplierPnl} className="px-4 py-1.5 bg-cyan-600 text-white rounded-lg text-sm font-medium hover:bg-cyan-700">
                  查詢
                </button>
              </div>
            </div>

            {supplierPnlLoading ? <Loading text="計算廠商損益中..." /> :
              supplierPnl ? <SupplierPnlTab data={supplierPnl} search={supplierPnlSearch} /> :
              <div className="text-center py-12 text-gray-400">請設定日期範圍後查詢</div>
            }
          </div>
        )}

        {/* ══ 現金流預測 ════════════════════════════════════════ */}
        {activeTab === 'cashflow' && (
          <div className="space-y-5">
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex items-end gap-4">
              <div>
                <label className="block text-xs text-gray-500 mb-1">預測天數</label>
                <select value={forecastDays} onChange={e => setForecastDays(Number(e.target.value))}
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
              cashflow ? <CashflowTab data={cashflow} /> :
              <div className="text-center py-12 text-gray-400">無資料</div>
            }
          </div>
        )}

        {/* ══ 採購分析 ═══════════════════════════════════════════ */}
        {activeTab === 'procurement' && (
          <div className="space-y-5">
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex items-end gap-4">
              <div>
                <label className="block text-xs text-gray-500 mb-1">月份（YYYYMM）</label>
                <input type="text" value={riskMonth} onChange={e => setRiskMonth(e.target.value)}
                  placeholder="202506" maxLength={6}
                  className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-32 focus:outline-none focus:ring-2 focus:ring-cyan-400" />
              </div>
              <button onClick={fetchSupplierRisk} className="px-4 py-1.5 bg-cyan-600 text-white rounded-lg text-sm font-medium hover:bg-cyan-700">
                查詢
              </button>
              <Link href="/purchasing" className="px-4 py-1.5 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200">
                前往採購模組 →
              </Link>
            </div>
            {supplierLoading ? <Loading text="分析供應商資料中..." /> :
              supplierRisk ? <ProcurementTab data={supplierRisk} /> :
              <div className="text-center py-12 text-gray-400">無採購資料</div>
            }
          </div>
        )}

        {/* ══ 應付帳齡 ═══════════════════════════════════════════ */}
        {activeTab === 'payables' && (
          payablesLoading ? <Loading text="分析應付帳齡中..." /> :
          payables ? <PayablesTab data={payables} /> :
          <div className="text-center py-12 text-gray-400">無資料</div>
        )}

        {/* ══ 月度報告 ═══════════════════════════════════════════ */}
        {activeTab === 'report' && (
          <div className="space-y-5">
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex items-end gap-4">
              <div>
                <label className="block text-xs text-gray-500 mb-1">月份（YYYYMM）</label>
                <input type="text" value={reportMonth} onChange={e => setReportMonth(e.target.value)}
                  placeholder="202506" maxLength={6}
                  className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-36 focus:outline-none focus:ring-2 focus:ring-cyan-400" />
              </div>
              <button onClick={fetchReport} className="px-4 py-1.5 bg-cyan-600 text-white rounded-lg text-sm font-medium hover:bg-cyan-700">
                載入報告
              </button>
            </div>
            {reportLoading ? <Loading text="載入月度報告中..." /> :
              report ? <ReportTab data={report} onApprove={approveReport} approving={reportApproving} /> :
              <div className="text-center py-12 text-gray-400">無資料</div>
            }
          </div>
        )}
      </main>

      {/* P&L Drilldown Modal */}
      {pnlTraceCtx && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => { setPnlTraceCtx(null); setPnlTrace(null); }}>
          <div className="bg-white rounded-xl shadow-xl max-w-3xl w-full max-h-[85vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-start mb-4">
              <div>
                <h4 className="font-semibold text-gray-900">
                  {pnlTraceCtx.flowType === 'income' ? '收入' : '支出'}明細 — {pnlTraceCtx.subjectKey}
                </h4>
                <p className="text-xs text-gray-500 mt-0.5">館別：{pnlTraceCtx.warehouseLabel}</p>
              </div>
              <button onClick={() => { setPnlTraceCtx(null); setPnlTrace(null); }} className="text-gray-400 hover:text-gray-700 text-xl font-bold leading-none">×</button>
            </div>
            {pnlTraceLoading ? <Loading text="載入明細中..." /> :
              pnlTrace ? (
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs text-gray-500">日期</th>
                      <th className="px-3 py-2 text-left text-xs text-gray-500">說明</th>
                      <th className="px-3 py-2 text-right text-xs text-gray-500">金額</th>
                      <th className="px-3 py-2 text-left text-xs text-gray-500">科目</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {(pnlTrace.transactions || []).map((tx, i) => (
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="px-3 py-2 text-gray-500">{tx.transactionDate?.slice(0, 10)}</td>
                        <td className="px-3 py-2">{tx.description || tx.note || '—'}</td>
                        <td className="px-3 py-2 text-right font-medium">{NT(tx.amount)}</td>
                        <td className="px-3 py-2 text-gray-400 text-xs">{tx.accountingSubject || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-gray-50 font-semibold">
                    <tr>
                      <td colSpan={2} className="px-3 py-2 text-right text-xs text-gray-600">小計</td>
                      <td className="px-3 py-2 text-right">{NT((pnlTrace.transactions || []).reduce((s, t) => s + Number(t.amount || 0), 0))}</td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              ) : <div className="text-center py-8 text-gray-400">無明細</div>
            }
          </div>
        </div>
      )}
    </div>
  );
}

// ══ Sub-components ══════════════════════════════════════════════

function OverviewTab({ data, onTabSwitch }) {
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

function PnlTab({ data, onTrace }) {
  const warehouses = data.byWarehouse || [];
  const totals = warehouses.reduce((acc, w) => ({
    income: acc.income + w.totalIncome,
    expense: acc.expense + w.totalExpense,
    net: acc.net + w.netProfit,
  }), { income: 0, expense: 0, net: 0 });

  return (
    <div className="space-y-5">
      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <KpiCard label="總收入" value={NT(totals.income)} color="text-blue-600" icon="📥" />
        <KpiCard label="總支出" value={NT(totals.expense)} color="text-red-500" icon="📤" />
        <KpiCard label="淨損益" value={NT(totals.net)} color={totals.net >= 0 ? 'text-emerald-600' : 'text-red-600'} icon="⚖️" />
      </div>

      {warehouses.length === 0 ? (
        <div className="text-center py-12 text-gray-400">此期間無現金流資料</div>
      ) : warehouses.map(w => (
        <div key={w.warehouse} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          {/* Warehouse header */}
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
            {/* Income */}
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

            {/* Expense */}
            <div className="p-4">
              <p className="text-xs font-semibold text-red-500 mb-2">支出明細</p>
              <table className="w-full text-xs">
                <thead>
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

function CashflowTab({ data }) {
  const riskColor = { low: 'text-emerald-600', medium: 'text-amber-600', high: 'text-orange-600', critical: 'text-red-600' };
  const scenarioBg = { optimistic: 'bg-green-50 border-green-200', risk: 'bg-amber-50 border-amber-200', crisis: 'bg-red-50 border-red-200' };
  const scenarioColor = { optimistic: 'text-green-700', risk: 'text-amber-700', crisis: 'text-red-700' };

  return (
    <div className="space-y-5">
      {/* Main KPIs */}
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

      {/* Scenarios */}
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

      {/* Outflows detail */}
      {data.outflows?.checks?.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-5 py-3 border-b bg-red-50">
            <p className="font-semibold text-sm text-red-700">到期支票（應付）— {data.outflows.checks.length} 張</p>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
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

      {/* Inflows detail */}
      {data.inflows?.rentals?.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-5 py-3 border-b bg-green-50">
            <p className="font-semibold text-sm text-green-700">待收租金 — {data.inflows.rentals.length} 筆</p>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
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

      {/* Loan repayments */}
      {data.outflows?.loans?.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-5 py-3 border-b bg-orange-50">
            <p className="font-semibold text-sm text-orange-700">貸款月繳 — {data.outflows.loans.length} 筆</p>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
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

function ProcurementTab({ data }) {
  const maxAmt = data.suppliers?.[0]?.amount || 1;
  return (
    <div className="space-y-5">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="採購總額" value={NT(data.totalAmount)} color="text-gray-800" icon="🛒" />
        <KpiCard label="供應商數量" value={data.supplierCount ?? 0} color="text-blue-600" icon="🏢"
          sub={`建議 ≥ 15 家`} />
        <KpiCard label="Top 1 集中度" value={pct(data.top1Concentration)}
          color={(data.top1Concentration || 0) > 20 ? 'text-red-600' : 'text-emerald-600'} icon="⚠️"
          sub="門檻 20%" />
        <KpiCard label="Top 3 集中度" value={pct(data.top3Concentration)}
          color={(data.top3Concentration || 0) > 50 ? 'text-orange-600' : 'text-emerald-600'} icon="📋"
          sub={`HHI: ${(data.hhiIndex || 0).toFixed(4)}`} />
      </div>

      {/* Risk alerts */}
      {data.risks?.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-2">
          <p className="text-sm font-semibold text-amber-800 mb-2">風險警示</p>
          {data.risks.map((r, i) => (
            <div key={i} className="flex items-start gap-2">
              <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium shrink-0 ${r.severity === 'high' ? 'bg-red-100 text-red-700' : r.severity === 'medium' ? 'bg-orange-100 text-orange-700' : 'bg-yellow-100 text-yellow-700'}`}>{r.severity}</span>
              <p className="text-sm text-amber-700">{r.message}</p>
            </div>
          ))}
        </div>
      )}

      {/* Supplier breakdown */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-5 py-3 border-b bg-gray-50">
          <p className="font-semibold text-sm text-gray-700">供應商採購佔比</p>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-2 text-left text-xs text-gray-500">排名</th>
              <th className="px-4 py-2 text-left text-xs text-gray-500">供應商</th>
              <th className="px-4 py-2 text-right text-xs text-gray-500">採購金額</th>
              <th className="px-4 py-2 text-right text-xs text-gray-500">佔比</th>
              <th className="px-4 py-2 w-32 text-xs text-gray-500">分布</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {(data.suppliers || []).map((s, i) => (
              <tr key={i} className="hover:bg-gray-50">
                <td className="px-4 py-2 text-gray-400">{i + 1}</td>
                <td className="px-4 py-2 font-medium">{s.supplierName}</td>
                <td className="px-4 py-2 text-right">{NT(s.amount)}</td>
                <td className={`px-4 py-2 text-right font-medium ${Number(s.percentage) > 20 ? 'text-red-600' : Number(s.percentage) > 10 ? 'text-amber-600' : 'text-gray-700'}`}>
                  {pct(s.percentage)}
                </td>
                <td className="px-4 py-2">
                  <Bar value={s.amount} max={maxAmt} color={Number(s.percentage) > 20 ? 'bg-red-400' : 'bg-cyan-400'} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PayablesTab({ data }) {
  const AGING_COLORS = { '0-30': 'text-gray-700 bg-gray-50', '30-60': 'text-amber-700 bg-amber-50', '60-90': 'text-orange-700 bg-orange-50', '90+': 'text-red-700 bg-red-50' };

  return (
    <div className="space-y-5">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <KpiCard label="未核銷總額" value={NT(data.totalUnpaid)} color="text-gray-800" icon="📋" />
        <KpiCard label="當前現金餘額" value={NT(data.currentCash)} color="text-blue-600" icon="💰" />
        <KpiCard label="風險等級" value={data.riskLevel === 'high' ? '高風險' : data.riskLevel === 'medium' ? '中風險' : '低風險'}
          color={data.riskLevel === 'high' ? 'text-red-600' : data.riskLevel === 'medium' ? 'text-amber-600' : 'text-green-600'} icon="⚠️" />
      </div>

      {/* Aging buckets */}
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

      {/* Cash pressure */}
      {data.cashPressure?.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <SectionTitle>資金壓力預測</SectionTitle>
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
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

      {/* High risk overdue */}
      {data.overdueHighRisk?.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-red-100 overflow-hidden">
          <div className="px-5 py-3 border-b bg-red-50">
            <p className="font-semibold text-sm text-red-700">高風險逾期項目（超過 60 天 & 金額 &gt; 50,000）</p>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
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

function ReportTab({ data, onApprove, approving }) {
  const r = data.report || data.generated;
  if (!r) return <div className="text-center py-12 text-gray-400">此月份尚無報告資料</div>;

  const isLive = !data.report;
  const profit = r.profitAnalysis || {};
  const risk = r.riskAnalysis || {};
  const cashFlow = r.cashFlowAnalysis || {};

  return (
    <div className="space-y-5">
      {/* Status */}
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

      {/* Executive summary */}
      {r.executiveSummary && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <SectionTitle>執行摘要</SectionTitle>
          <p className="text-sm text-gray-700 leading-relaxed">{r.executiveSummary}</p>
        </div>
      )}

      {/* KPI grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="銷貨額" value={NT(profit.totalSales)} color="text-blue-600" icon="📈" />
        <KpiCard label="採購額" value={NT(profit.totalPurchase)} color="text-gray-700" icon="🛒" />
        <KpiCard label="毛利率" value={pct(profit.grossMargin)}
          color={profit.status === 'achieved' ? 'text-emerald-600' : 'text-red-500'} icon="📊"
          sub={`目標 ${profit.targetGrossMargin}%`} />
        <KpiCard label="現金餘額" value={NT(cashFlow.currentBalance)}
          color={cashFlow.currentBalance > 100000 ? 'text-emerald-600' : 'text-orange-600'} icon="💰" />
      </div>

      {/* Risk analysis */}
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

      {/* Recommendations */}
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

// ══ SupplierPnlTab ═══════════════════════════════════════════════
function SupplierPnlTab({ data, search }) {
  const { rows = [], summary = {} } = data;
  const maxCost = rows[0]?.totalCost || 1;

  const filtered = search.trim()
    ? rows.filter(r => r.supplierName.toLowerCase().includes(search.toLowerCase()))
    : rows;

  return (
    <div className="space-y-5">
      {/* Summary KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <KpiCard label="廠商數量"   value={summary.supplierCount ?? 0} icon="🏢" color="text-blue-600" />
        <KpiCard label="採購總額"   value={NT(summary.totalPurchases)}  icon="🛒" color="text-gray-700" />
        <KpiCard label="退貨總額"   value={NT(summary.totalAllowances)} icon="↩" color="text-orange-600" />
        <KpiCard label="淨採購額"   value={NT(summary.totalNetPurchases)} icon="📦" color="text-cyan-700" />
        <KpiCard label="費用總額"   value={NT(summary.totalExpenses)}   icon="💸" color="text-red-600" />
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-4 py-3 bg-gray-50 border-b flex items-center justify-between">
          <p className="text-sm font-semibold text-gray-700">
            廠商損益明細（共 {filtered.length} 筆{search.trim() ? '，已篩選' : ''}）
          </p>
          <p className="text-xs text-gray-400">依總支出降序排列</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
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
