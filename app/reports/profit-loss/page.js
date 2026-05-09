'use client';
import { useState, useEffect, useCallback } from 'react';
import Navigation from '@/components/Navigation';

const fmt = (n) => (n == null ? '—' : Number(n).toLocaleString('zh-TW'));
const fmtPct = (n, d) => (d ? ((n / d) * 100).toFixed(1) + '%' : '—');

const LEVEL1_COLOR = {
  '收入': 'text-blue-700',
  '費用': 'text-red-700',
  '業外': 'text-purple-700',
};

const GROUP_BG = {
  '住宿收入': 'bg-blue-50',
  '收款成本': 'bg-amber-50',
  '人事費用': 'bg-red-50',
  '行政費用': 'bg-orange-50',
  '業外收支': 'bg-purple-50',
};

export default function ProfitLossPage() {
  const [yearMonth, setYearMonth] = useState(() => {
    const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [warehouses, setWarehouses] = useState([]);
  const [warehouse,  setWarehouse]  = useState('');
  const [data,  setData]   = useState(null);
  const [loading, setLoading] = useState(false);
  const [error,  setError]   = useState('');
  const [expandedGroups, setExpandedGroups] = useState({});

  useEffect(() => {
    fetch('/api/pms-income/batches?limit=1')
      .then(r => r.json())
      .then(() => {})
      .catch(() => {});
    // 取館別列表
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
      const res = await fetch(`/api/reports/profit-loss?${q}`);
      const d   = await res.json();
      if (!res.ok) { setError(d.error?.message || '載入失敗'); setData(null); }
      else setData(d);
    } catch { setError('載入失敗'); }
    setLoading(false);
  }, [yearMonth, warehouse]);

  useEffect(() => { load(); }, [load]);

  function toggleGroup(key) {
    setExpandedGroups(prev => ({ ...prev, [key]: !prev[key] }));
  }

  const s = data?.summary || {};

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-4">

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
            損益表 {data?.yearMonth} {data?.warehouse || '（全館）'}
          </div>
        </div>

        {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-lg text-sm">{error}</div>}

        {loading && <div className="text-center py-12 text-gray-400">計算中…</div>}

        {data && !loading && (
          <>
            {/* 損益摘要卡片 */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: '營業收入',   val: s.totalIncome,       color: 'border-blue-500',  text: 'text-blue-700' },
                { label: '毛利',       val: s.grossProfit,       color: 'border-teal-500',  text: 'text-teal-700', pct: fmtPct(s.grossProfit, s.totalIncome) },
                { label: '營業淨利',   val: s.operatingIncome,   color: 'border-green-500', text: 'text-green-700', pct: fmtPct(s.operatingIncome, s.totalIncome) },
                { label: '稅前淨利',   val: s.netIncome,         color: s.netIncome >= 0 ? 'border-green-500' : 'border-red-500', text: s.netIncome >= 0 ? 'text-green-700' : 'text-red-700', pct: fmtPct(s.netIncome, s.totalIncome) },
              ].map(({ label, val, color, text, pct }) => (
                <div key={label} className={`bg-white rounded-xl shadow-sm p-4 border-l-4 ${color}`}>
                  <p className="text-xs text-gray-500">{label}</p>
                  <p className={`text-xl font-bold ${text}`}>{fmt(val)}</p>
                  {pct && <p className="text-xs text-gray-400">{pct}</p>}
                </div>
              ))}
            </div>

            {/* 信用卡對帳單核對摘要 */}
            {data.ccReconciliation?.statementCount > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                <p className="text-sm font-medium text-amber-800 mb-2">信用卡對帳單（本月已輸入 {data.ccReconciliation.statementCount} 筆）</p>
                <div className="grid grid-cols-3 gap-4 text-xs">
                  <div><p className="text-gray-500">對帳單請款合計</p><p className="font-bold text-gray-800">{fmt(data.ccReconciliation.actualCCRevenue)}</p></div>
                  <div><p className="text-gray-500">實際手續費合計</p><p className="font-bold text-amber-700">{fmt(data.ccReconciliation.actualCCFee)}</p></div>
                  <div><p className="text-gray-500">有效費率</p><p className="font-bold text-gray-800">{fmtPct(data.ccReconciliation.actualCCFee, data.ccReconciliation.actualCCRevenue)}</p></div>
                </div>
              </div>
            )}

            {/* 損益表主體 */}
            <div className="bg-white rounded-xl shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b bg-gray-50 flex justify-between">
                <h2 className="font-bold text-gray-800">損益明細</h2>
                <button onClick={() => {
                  const all = {};
                  (data.groups || []).forEach(g => { all[`${g.level1}|${g.plGroup}`] = true; });
                  setExpandedGroups(all);
                }} className="text-xs text-blue-600 hover:underline">展開全部</button>
              </div>

              <div className="divide-y divide-gray-100">
                {/* 一、營業收入 */}
                <SectionHeader label="一、營業收入" amount={s.totalIncome} total={s.totalIncome} />
                {(data.groups || []).filter(g => g.level1 === '收入').map(g => (
                  <GroupRow key={`${g.level1}|${g.plGroup}`} group={g} total={s.totalIncome}
                    expanded={expandedGroups[`${g.level1}|${g.plGroup}`]}
                    onToggle={() => toggleGroup(`${g.level1}|${g.plGroup}`)} />
                ))}

                {/* 二、收款成本 */}
                <SectionHeader label="二、收款成本" amount={-s.ccFee} total={s.totalIncome} negative />
                {(data.groups || []).filter(g => g.plGroup === '收款成本').map(g => (
                  <GroupRow key={`${g.level1}|${g.plGroup}`} group={g} total={s.totalIncome} isExpense
                    expanded={expandedGroups[`${g.level1}|${g.plGroup}`]}
                    onToggle={() => toggleGroup(`${g.level1}|${g.plGroup}`)} />
                ))}

                {/* 毛利 */}
                <SubtotalRow label="毛利" amount={s.grossProfit} total={s.totalIncome} highlight="teal" />

                {/* 三、營業費用 */}
                <SectionHeader label="三、營業費用" amount={-s.totalOpExp} total={s.totalIncome} negative />
                {(data.groups || []).filter(g => g.level1 === '費用' && g.plGroup !== '收款成本').map(g => (
                  <GroupRow key={`${g.level1}|${g.plGroup}`} group={g} total={s.totalIncome} isExpense
                    expanded={expandedGroups[`${g.level1}|${g.plGroup}`]}
                    onToggle={() => toggleGroup(`${g.level1}|${g.plGroup}`)} />
                ))}

                {/* 營業淨利 */}
                <SubtotalRow label="四、營業淨利（EBIT）" amount={s.operatingIncome} total={s.totalIncome} highlight="green" />

                {/* 五、業外 */}
                {(data.groups || []).filter(g => g.level1 === '業外').length > 0 && (
                  <>
                    <SectionHeader label="五、業外收支" amount={s.bizOutsideNet} total={s.totalIncome} />
                    {(data.groups || []).filter(g => g.level1 === '業外').map(g => (
                      <GroupRow key={`${g.level1}|${g.plGroup}`} group={g} total={s.totalIncome}
                        expanded={expandedGroups[`${g.level1}|${g.plGroup}`]}
                        onToggle={() => toggleGroup(`${g.level1}|${g.plGroup}`)} />
                    ))}
                  </>
                )}

                {/* 稅前淨利 */}
                <SubtotalRow label="稅前淨利" amount={s.netIncome} total={s.totalIncome} highlight={s.netIncome >= 0 ? 'green' : 'red'} bold />
              </div>
            </div>

            {/* 未分類交易提醒 */}
            {(data.groups || []).some(g => g.plGroup?.includes('未分類')) && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-3 text-xs text-yellow-700 flex items-center justify-between gap-3">
                <span>有交易未指定科目（列為「未分類」），損益表數據不完整。</span>
                <a href="/cashflow#category-mgmt" className="underline font-medium whitespace-nowrap hover:text-yellow-900">
                  前往損益科目管理 →
                </a>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function SectionHeader({ label, amount, total, negative }) {
  return (
    <div className="flex justify-between items-center px-6 py-3 bg-gray-50 font-semibold text-sm">
      <span className="text-gray-700">{label}</span>
      <span className={`tabular-nums ${(negative ? amount < 0 : amount >= 0) ? 'text-green-700' : 'text-red-600'}`}>
        {fmt(amount)}
        <span className="ml-2 text-xs font-normal text-gray-400">{total ? fmtPct(Math.abs(amount), total) : ''}</span>
      </span>
    </div>
  );
}

function SubtotalRow({ label, amount, total, highlight, bold }) {
  const colors = { teal: 'bg-teal-50 border-teal-200 text-teal-800', green: 'bg-green-50 border-green-200 text-green-800', red: 'bg-red-50 border-red-200 text-red-800' };
  const cls = colors[highlight] || 'bg-gray-100 border-gray-200 text-gray-800';
  return (
    <div className={`flex justify-between items-center px-6 py-3 border-t-2 ${cls} ${bold ? 'font-bold text-base' : 'font-semibold text-sm'}`}>
      <span>{label}</span>
      <span className="tabular-nums">
        {fmt(amount)}
        <span className="ml-2 text-xs font-normal opacity-70">{total ? fmtPct(Math.abs(amount), total) : ''}</span>
      </span>
    </div>
  );
}

function GroupRow({ group, total, isExpense, expanded, onToggle }) {
  const net = isExpense ? -group.groupExpense : group.groupNet;
  const bgCls = GROUP_BG[group.plGroup] || '';
  return (
    <>
      <div className={`flex justify-between items-center px-6 py-2 cursor-pointer hover:bg-gray-50/80 ${bgCls}`} onClick={onToggle}>
        <span className="text-sm text-gray-700 flex items-center gap-2">
          <span className="text-gray-400 text-xs">{expanded ? '▼' : '▶'}</span>
          {group.plGroup}
        </span>
        <span className={`text-sm tabular-nums font-medium ${net >= 0 ? 'text-gray-800' : 'text-red-600'}`}>
          {fmt(Math.abs(net))}
          <span className="ml-2 text-xs font-normal text-gray-400">{total ? fmtPct(Math.abs(net), total) : ''}</span>
        </span>
      </div>
      {expanded && (group.categories || []).map(cat => {
        const catNet = isExpense ? cat.expense : (cat.income - cat.expense);
        return (
          <div key={cat.catId} className={`flex justify-between items-center pl-12 pr-6 py-1.5 text-xs text-gray-600 border-b border-gray-50 ${bgCls} opacity-90`}>
            <span>{cat.catName}</span>
            <span className="tabular-nums">{fmt(catNet)}</span>
          </div>
        );
      })}
    </>
  );
}


