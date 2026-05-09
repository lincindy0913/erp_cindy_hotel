'use client';
import { useState, useEffect, useCallback } from 'react';
import Navigation from '@/components/Navigation';

const fmt  = (n) => (n == null ? '—' : Number(n).toLocaleString('zh-TW'));
const fmtAmt = (n) => {
  if (n == null) return '—';
  const abs = Math.abs(Number(n));
  return (Number(n) >= 0 ? '' : '-') + abs.toLocaleString('zh-TW');
};

const SECTION_CONFIG = {
  '營業活動': { color: 'border-blue-500',   bg: 'bg-blue-50',   textColor: 'text-blue-700',   icon: '🏃' },
  '投資活動': { color: 'border-teal-500',   bg: 'bg-teal-50',   textColor: 'text-teal-700',   icon: '📈' },
  '融資活動': { color: 'border-purple-500', bg: 'bg-purple-50', textColor: 'text-purple-700', icon: '🏦' },
};

export default function CashFlowPage() {
  const [yearMonth, setYearMonth] = useState(() => {
    const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [warehouses, setWarehouses] = useState([]);
  const [warehouse,  setWarehouse]  = useState('');
  const [data,  setData]   = useState(null);
  const [loading, setLoading] = useState(false);
  const [error,  setError]   = useState('');
  const [expandedSections, setExpandedSections] = useState({ '營業活動': false, '投資活動': false, '融資活動': false });

  useEffect(() => {
    fetch('/api/cashflow/accounts')
      .then(r => r.json())
      .then(d => {
        const ws = [...new Set((Array.isArray(d) ? d : []).map(a => a.warehouse).filter(Boolean))];
        setWarehouses(ws);
      }).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const q = `yearMonth=${yearMonth}${warehouse ? `&warehouse=${encodeURIComponent(warehouse)}` : ''}`;
      const res = await fetch(`/api/reports/cash-flow?${q}`);
      const d   = await res.json();
      if (!res.ok) { setError(d.error?.message || '載入失敗'); setData(null); }
      else setData(d);
    } catch { setError('載入失敗'); }
    setLoading(false);
  }, [yearMonth, warehouse]);

  useEffect(() => { load(); }, [load]);

  function toggleSection(name) {
    setExpandedSections(prev => ({ ...prev, [name]: !prev[name] }));
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-4">

        {/* 篩選列 */}
        <div className="bg-white rounded-xl shadow-sm p-4 flex flex-wrap gap-3 items-end justify-between">
          <div className="flex gap-3 items-end">
            <div>
              <label className="block text-xs text-gray-500 mb-1">月份</label>
              <input type="month" value={yearMonth} onChange={e => setYearMonth(e.target.value)} className="border rounded-lg px-3 py-1.5 text-sm" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">館別（空白=全部）</label>
              <select value={warehouse} onChange={e => setWarehouse(e.target.value)} className="border rounded-lg px-3 py-1.5 text-sm">
                <option value="">全部館別</option>
                {warehouses.map(w => <option key={w} value={w}>{w}</option>)}
              </select>
            </div>
            <button onClick={load} className="bg-blue-600 text-white px-4 py-1.5 rounded-lg text-sm hover:bg-blue-700">重新載入</button>
          </div>
          <div className="text-sm text-gray-500">
            現金流量表 {data?.yearMonth} {data?.warehouse || '（全館）'}
          </div>
        </div>

        {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-lg text-sm">{error}</div>}
        {loading && <div className="text-center py-12 text-gray-400">計算中…</div>}

        {data && !loading && (
          <>
            {/* 摘要卡片：期初 → 淨增減 → 期末 */}
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-white rounded-xl shadow-sm p-4 border-l-4 border-gray-400">
                <p className="text-xs text-gray-500">期初現金餘額</p>
                <p className="text-xl font-bold text-gray-700">{fmt(data.openingCash)}</p>
              </div>
              <div className={`bg-white rounded-xl shadow-sm p-4 border-l-4 ${data.netChange >= 0 ? 'border-green-500' : 'border-red-500'}`}>
                <p className="text-xs text-gray-500">本期淨增減</p>
                <p className={`text-xl font-bold ${data.netChange >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                  {data.netChange >= 0 ? '+' : ''}{fmt(data.netChange)}
                </p>
              </div>
              <div className="bg-white rounded-xl shadow-sm p-4 border-l-4 border-blue-500">
                <p className="text-xs text-gray-500">期末現金餘額</p>
                <p className="text-xl font-bold text-blue-700">{fmt(data.closingCash)}</p>
              </div>
            </div>

            {/* 三大分類 */}
            {['營業活動', '投資活動', '融資活動'].map(sectionName => {
              const sec = data.sections?.[sectionName];
              if (!sec) return null;
              const cfg = SECTION_CONFIG[sectionName];
              const expanded = expandedSections[sectionName];
              return (
                <div key={sectionName} className="bg-white rounded-xl shadow-sm overflow-hidden">
                  {/* Header */}
                  <button
                    className={`w-full flex items-center justify-between px-5 py-4 border-l-4 ${cfg.color} hover:bg-gray-50/50 transition-colors`}
                    onClick={() => toggleSection(sectionName)}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-lg">{cfg.icon}</span>
                      <div className="text-left">
                        <p className="font-semibold text-gray-800">{sectionName}</p>
                        <p className="text-xs text-gray-400">
                          流入 {fmt(sec.inflow)} · 流出 {fmt(Math.abs(sec.outflow))} · {sec.items.length} 筆
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`text-lg font-bold tabular-nums ${sec.net >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                        {sec.net >= 0 ? '+' : ''}{fmt(sec.net)}
                      </span>
                      <span className="text-gray-400 text-xs">{expanded ? '▲' : '▼'}</span>
                    </div>
                  </button>

                  {/* Detail rows */}
                  {expanded && (
                    <div className="border-t border-gray-100">
                      {sec.items.length === 0 ? (
                        <p className="px-5 py-4 text-sm text-gray-400">本期無相關交易</p>
                      ) : (
                        <table className="w-full text-xs">
                          <thead className="bg-gray-50 text-gray-500">
                            <tr>
                              <th className="px-4 py-2 text-left">日期</th>
                              <th className="px-4 py-2 text-left">說明</th>
                              <th className="px-4 py-2 text-left text-gray-400">科目群</th>
                              <th className="px-4 py-2 text-right">金額</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-50">
                            {sec.items.map(t => (
                              <tr key={t.id} className="hover:bg-gray-50">
                                <td className="px-4 py-2 font-mono text-gray-500">{t.date}</td>
                                <td className="px-4 py-2 text-gray-700 max-w-[200px] truncate" title={t.description}>{t.description}</td>
                                <td className="px-4 py-2 text-gray-400">{t.plGroup || t.sourceType || '—'}</td>
                                <td className={`px-4 py-2 text-right tabular-nums font-medium ${t.amount >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                                  {t.amount >= 0 ? '+' : ''}{fmt(t.amount)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot className={`${cfg.bg} border-t border-gray-200`}>
                            <tr>
                              <td colSpan={3} className="px-4 py-2 font-medium text-gray-600">{sectionName}小計</td>
                              <td className={`px-4 py-2 text-right tabular-nums font-bold ${sec.net >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                                {sec.net >= 0 ? '+' : ''}{fmt(sec.net)}
                              </td>
                            </tr>
                          </tfoot>
                        </table>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {/* 期末餘額核對 */}
            <div className="bg-white rounded-xl shadow-sm p-5 border border-gray-100">
              <h3 className="font-semibold text-gray-700 mb-3 text-sm">現金餘額核對</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">期初餘額</span>
                  <span className="tabular-nums font-medium">{fmt(data.openingCash)}</span>
                </div>
                {['營業活動', '投資活動', '融資活動'].map(n => (
                  <div key={n} className="flex justify-between text-xs text-gray-500">
                    <span className="pl-4">{n}淨額</span>
                    <span className={`tabular-nums ${(data.sections?.[n]?.net || 0) >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                      {(data.sections?.[n]?.net || 0) >= 0 ? '+' : ''}{fmt(data.sections?.[n]?.net || 0)}
                    </span>
                  </div>
                ))}
                <div className="flex justify-between border-t border-gray-200 pt-2 font-semibold">
                  <span className="text-gray-700">期末餘額</span>
                  <span className={`tabular-nums ${data.closingCash >= 0 ? 'text-blue-700' : 'text-red-600'}`}>{fmt(data.closingCash)}</span>
                </div>
              </div>
            </div>

            {/* 說明 */}
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 text-xs text-blue-600 space-y-1">
              <p><b>分類說明：</b>營業活動 = 日常收支；投資活動 = 固定資產/設備/裝修；融資活動 = 貸款/股東往來。</p>
              <p>分類依現金流科目（plGroup）自動判斷。如需調整，請在「現金流 → 損益科目管理」修改科目設定。</p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
