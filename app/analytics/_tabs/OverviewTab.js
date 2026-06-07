'use client';

import { useState, useEffect } from 'react';

const NT = (v) => `NT$ ${Number(v || 0).toLocaleString()}`;
const pct = (v) => `${Number(v || 0).toFixed(1)}%`;

const MONTH_LABELS = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];

// ── 共用子元件（放在最前避免 const hoisting 問題） ──
const SectionTitle = ({ children }) => (
  <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
    <span className="w-1 h-4 bg-cyan-500 rounded-full inline-block" />
    {children}
  </h3>
);

function cellColor(net, maxNet) {
  if (!net || net <= 0) return 'bg-gray-100 text-gray-400';
  const ratio = maxNet > 0 ? net / maxNet : 0;
  if (ratio >= 0.8) return 'bg-violet-700 text-white';
  if (ratio >= 0.6) return 'bg-violet-500 text-white';
  if (ratio >= 0.4) return 'bg-violet-300 text-violet-900';
  if (ratio >= 0.2) return 'bg-violet-200 text-violet-800';
  return 'bg-violet-100 text-violet-700';
}

function yoyColor(pct) {
  if (pct == null) return 'bg-gray-100 text-gray-400';
  if (pct >= 20)  return 'bg-emerald-600 text-white';
  if (pct >= 5)   return 'bg-emerald-300 text-emerald-900';
  if (pct >= -5)  return 'bg-gray-100 text-gray-500';
  if (pct >= -20) return 'bg-red-200 text-red-800';
  return 'bg-red-500 text-white';
}

function WarehouseHeatmap() {
  const curYear = new Date().getFullYear();
  const [year, setYear]       = useState(curYear);
  const [mode, setMode]       = useState('amount'); // 'amount' | 'yoy'
  const [summaries, setSummaries]     = useState(null);
  const [prevSummaries, setPrevSummaries] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    setSummaries(null);
    setPrevSummaries(null);
    Promise.all([
      fetch(`/api/pms-income/monthly-summary?year=${year}`).then(r => r.ok ? r.json() : null),
      fetch(`/api/pms-income/monthly-summary?year=${year - 1}`).then(r => r.ok ? r.json() : null),
    ]).then(([cur, prev]) => {
      if (Array.isArray(cur))  setSummaries(cur);
      if (Array.isArray(prev)) setPrevSummaries(prev);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [year]);

  if (loading) return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
      <SectionTitle>館別 × 月份收入熱力圖</SectionTitle>
      <div className="text-center py-6 text-gray-400 text-sm">載入中…</div>
    </div>
  );
  if (!summaries) return null;

  const warehouseSet = new Set();
  summaries.forEach(m => Object.keys(m.byWarehouse || {}).forEach(w => warehouseSet.add(w)));
  const warehouses = [...warehouseSet].sort();
  if (warehouses.length === 0) return null;

  let maxNet = 0;
  summaries.forEach(m => Object.values(m.byWarehouse || {}).forEach(v => { if (v.net > maxNet) maxNet = v.net; }));

  const yearOpts = [];
  for (let y = curYear; y >= curYear - 4; y--) yearOpts.push(y);

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
      <div className="flex items-center justify-between mb-3">
        <SectionTitle>館別 × 月份收入熱力圖</SectionTitle>
        <div className="flex items-center gap-2">
          <select
            value={year}
            onChange={e => setYear(Number(e.target.value))}
            className="text-xs border rounded px-2 py-1 text-gray-600"
          >
            {yearOpts.map(y => <option key={y} value={y}>{y} 年</option>)}
          </select>
          <div className="flex gap-1">
            {[['amount', '收入'], ['yoy', 'YoY%']].map(([v, l]) => (
              <button key={v} onClick={() => setMode(v)}
                className={`text-xs px-2.5 py-1 rounded border transition-colors ${mode === v ? 'bg-violet-600 text-white border-violet-600' : 'border-gray-300 text-gray-500 hover:bg-gray-50'}`}>
                {l}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="text-xs w-full">
          <thead>
            <tr>
              <th className="text-left px-2 py-1 text-gray-500 font-medium min-w-[5rem]">館別</th>
              {MONTH_LABELS.map((l, i) => (
                <th key={i} className="text-center px-0.5 py-1 text-gray-500 font-medium w-11">{l}</th>
              ))}
              <th className="text-right px-2 py-1 text-gray-500 font-medium">全年</th>
            </tr>
          </thead>
          <tbody>
            {warehouses.map(wh => {
              let rowTotal = 0;
              return (
                <tr key={wh}>
                  <td className="px-2 py-1 font-medium text-gray-700 whitespace-nowrap">{wh}</td>
                  {summaries.map((m, mi) => {
                    const net  = m.byWarehouse?.[wh]?.net ?? 0;
                    const prev = prevSummaries?.[mi]?.byWarehouse?.[wh]?.net ?? 0;
                    const yoy  = prev > 0 ? Math.round((net - prev) / prev * 100) : null;
                    rowTotal += net;
                    const cls  = mode === 'yoy' ? yoyColor(yoy) : cellColor(net, maxNet);
                    const label = mode === 'yoy'
                      ? (yoy != null ? `${yoy > 0 ? '+' : ''}${yoy}%` : '—')
                      : (net > 0 ? `${Math.round(net / 1000)}k` : '—');
                    const tip = mode === 'yoy'
                      ? `${wh} ${mi + 1}月：${year}=${net.toLocaleString('zh-TW')} / ${year-1}=${prev.toLocaleString('zh-TW')}（YoY ${yoy != null ? (yoy > 0 ? '+' : '') + yoy + '%' : 'N/A'}）`
                      : `${wh} ${mi + 1}月：NT$ ${net.toLocaleString('zh-TW')}`;
                    return (
                      <td key={mi} className="px-0.5 py-0.5">
                        <div className={`rounded text-center py-1 px-0.5 ${cls}`} title={tip}>{label}</div>
                      </td>
                    );
                  })}
                  <td className="px-2 py-1 text-right font-semibold text-gray-700">
                    {rowTotal > 0 ? `${Math.round(rowTotal / 1000)}k` : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t border-gray-200">
              <td className="px-2 py-1 text-xs font-semibold text-gray-600">月合計</td>
              {summaries.map((m, mi) => {
                const total = Object.values(m.byWarehouse || {}).reduce((s, v) => s + (v.net || 0), 0);
                return (
                  <td key={mi} className="px-0.5 py-1 text-center text-xs text-gray-500">
                    {total > 0 ? `${Math.round(total / 1000)}k` : '—'}
                  </td>
                );
              })}
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
      <div className="flex items-center gap-4 mt-3 text-xs text-gray-400">
        {mode === 'amount' && (
          <div className="flex items-center gap-1.5">
            <span>低</span>
            {['bg-violet-100','bg-violet-200','bg-violet-300','bg-violet-500','bg-violet-700'].map(c => (
              <span key={c} className={`inline-block w-4 h-3 rounded ${c}`} />
            ))}
            <span>高</span>
          </div>
        )}
        {mode === 'yoy' && (
          <div className="flex items-center gap-1.5">
            <span className="bg-red-500 text-white px-1 rounded">↓−20%+</span>
            <span className="bg-red-200 text-red-800 px-1 rounded">↓小跌</span>
            <span className="bg-gray-100 text-gray-500 px-1 rounded">持平</span>
            <span className="bg-emerald-300 text-emerald-900 px-1 rounded">↑小漲</span>
            <span className="bg-emerald-600 text-white px-1 rounded">↑+20%+</span>
          </div>
        )}
        <span>數字單位 k = 千元。滑鼠懸停可查看詳細金額。</span>
      </div>
    </div>
  );
}

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

      {/* 館別 × 月份熱力圖 */}
      <WarehouseHeatmap />
    </div>
  );
}
