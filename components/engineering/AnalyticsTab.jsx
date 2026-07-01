'use client';

import { useState, useEffect, useCallback } from 'react';

const fmt = (n) => Number(n || 0).toLocaleString('zh-TW');
const SUB = [
  { key: 'monthly',   label: '月別營收趨勢' },
  { key: 'byClient',  label: '業主別銷項' },
  { key: 'byProject', label: '收付款進度' },
];

export default function AnalyticsTab() {
  const [year, setYear]       = useState(new Date().getFullYear());
  const [sub, setSub]         = useState('monthly');
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch(`/api/engineering/analytics?year=${year}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json());
    } catch {
      setError('分析資料載入失敗，請重試。'); setData(null);
    } finally { setLoading(false); }
  }, [year]);

  useEffect(() => { load(); }, [load]);

  const years = [0, 1, 2, 3].map((d) => new Date().getFullYear() - d);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm text-gray-600">年度：</label>
        <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="border rounded px-2 py-1.5 text-sm">
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        <div className="flex items-center gap-1 border rounded-lg overflow-hidden text-sm ml-2">
          {SUB.map((s) => (
            <button key={s.key} type="button" onClick={() => setSub(s.key)}
              className={`px-3 py-1.5 font-medium transition-colors ${sub === s.key ? 'bg-amber-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
              {s.label}
            </button>
          ))}
        </div>
        {loading && <span className="text-xs text-gray-400">載入中…</span>}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded p-3 text-sm">
          {error} <button type="button" onClick={load} className="underline ml-1">重試</button>
        </div>
      )}

      {data && sub === 'monthly'   && <MonthlyReport monthly={data.monthly} year={data.year} />}
      {data && sub === 'byClient'  && <ByClientReport rows={data.byClient} year={data.year} />}
      {data && sub === 'byProject' && <ByProjectReport rows={data.byProject} />}
    </div>
  );
}

const HEAD = 'bg-amber-50 text-amber-900 text-xs font-semibold';
const FOOT = 'bg-gray-50 font-semibold text-sm border-t-2 border-amber-200';

function MonthlyReport({ monthly, year }) {
  const t = monthly.reduce((a, m) => ({
    output: a.output + m.output, input: a.input + m.input, gross: a.gross + m.gross, income: a.income + m.income,
  }), { output: 0, input: 0, gross: 0, income: 0 });
  return (
    <div className="bg-white rounded-xl shadow tbl-wrap">
      <p className="px-4 pt-3 text-sm text-gray-500">💰 {year} 年 月別營收趨勢（銷項／進項為含稅口徑，毛利 = 銷項 − 進項）</p>
      <table className="w-full text-sm mt-2">
        <thead className={`${HEAD} sticky top-0 z-10`}>
          <tr>
            <th className="px-3 py-2 text-center">月份</th>
            <th className="px-3 py-2 text-right">銷項（收入）</th>
            <th className="px-3 py-2 text-right">進項（成本）</th>
            <th className="px-3 py-2 text-right">毛利</th>
            <th className="px-3 py-2 text-right">實收（收款）</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {monthly.map((m) => (
            <tr key={m.month} className="hover:bg-amber-50/40">
              <td className="px-3 py-1.5 text-center text-gray-600">{m.month} 月</td>
              <td className="px-3 py-1.5 text-right tabular-nums">{m.output ? fmt(m.output) : '—'}</td>
              <td className="px-3 py-1.5 text-right tabular-nums">{m.input ? fmt(m.input) : '—'}</td>
              <td className={`px-3 py-1.5 text-right tabular-nums font-medium ${m.gross < 0 ? 'text-red-600' : 'text-emerald-700'}`}>{m.gross ? fmt(m.gross) : '—'}</td>
              <td className="px-3 py-1.5 text-right tabular-nums text-indigo-700">{m.income ? fmt(m.income) : '—'}</td>
            </tr>
          ))}
        </tbody>
        <tfoot className={FOOT}>
          <tr>
            <td className="px-3 py-2 text-center">合計</td>
            <td className="px-3 py-2 text-right tabular-nums">{fmt(t.output)}</td>
            <td className="px-3 py-2 text-right tabular-nums">{fmt(t.input)}</td>
            <td className={`px-3 py-2 text-right tabular-nums ${t.gross < 0 ? 'text-red-600' : 'text-emerald-700'}`}>{fmt(t.gross)}</td>
            <td className="px-3 py-2 text-right tabular-nums text-indigo-700">{fmt(t.income)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function ByClientReport({ rows, year }) {
  const t = rows.reduce((a, r) => ({ amount: a.amount + r.amount, tax: a.tax + r.tax, total: a.total + r.total, count: a.count + r.count }), { amount: 0, tax: 0, total: 0, count: 0 });
  return (
    <div className="bg-white rounded-xl shadow tbl-wrap">
      <p className="px-4 pt-3 text-sm text-gray-500">🏢 {year} 年 業主（客戶）別 銷項分析　共 {rows.length} 個業主</p>
      <table className="w-full text-sm mt-2">
        <thead className={`${HEAD} sticky top-0 z-10`}>
          <tr>
            <th className="px-3 py-2 text-left">業主／客戶</th>
            <th className="px-3 py-2 text-right">銷項（未稅）</th>
            <th className="px-3 py-2 text-right">稅額</th>
            <th className="px-3 py-2 text-right">含稅金額</th>
            <th className="px-3 py-2 text-center">張數</th>
            <th className="px-3 py-2 text-right">佔比</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.length === 0 ? (
            <tr><td colSpan={6} className="text-center py-10 text-gray-400">{year} 年無銷項發票</td></tr>
          ) : rows.map((r, i) => (
            <tr key={i} className="hover:bg-amber-50/40">
              <td className="px-3 py-1.5 font-medium">{r.client}</td>
              <td className="px-3 py-1.5 text-right tabular-nums">{fmt(r.amount)}</td>
              <td className="px-3 py-1.5 text-right tabular-nums text-gray-500">{fmt(r.tax)}</td>
              <td className="px-3 py-1.5 text-right tabular-nums font-medium">{fmt(r.total)}</td>
              <td className="px-3 py-1.5 text-center text-gray-600">{r.count}</td>
              <td className="px-3 py-1.5 text-right tabular-nums">
                <span className="inline-flex items-center gap-1">
                  <span className="inline-block h-1.5 rounded bg-amber-400" style={{ width: `${Math.max(4, r.pct)}px` }} />
                  {r.pct}%
                </span>
              </td>
            </tr>
          ))}
        </tbody>
        {rows.length > 0 && (
          <tfoot className={FOOT}>
            <tr>
              <td className="px-3 py-2">合計</td>
              <td className="px-3 py-2 text-right tabular-nums">{fmt(t.amount)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{fmt(t.tax)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{fmt(t.total)}</td>
              <td className="px-3 py-2 text-center">{t.count}</td>
              <td className="px-3 py-2 text-right">100%</td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

function ByProjectReport({ rows }) {
  const t = rows.reduce((a, r) => ({
    certified: a.certified + r.certified, output: a.output + r.output, income: a.income + r.income, unreceived: a.unreceived + r.unreceived, paid: a.paid + r.paid,
  }), { certified: 0, output: 0, income: 0, unreceived: 0, paid: 0 });
  return (
    <div className="bg-white rounded-xl shadow tbl-wrap">
      <p className="px-4 pt-3 text-sm text-gray-500">📊 各工程案 累計收付款進度（未收 = 已開銷項 − 已收款；含稅口徑）</p>
      <table className="w-full text-sm mt-2">
        <thead className={`${HEAD} sticky top-0 z-10`}>
          <tr>
            <th className="px-3 py-2 text-left">工程案</th>
            <th className="px-3 py-2 text-left">業主</th>
            <th className="px-3 py-2 text-right">估驗計價</th>
            <th className="px-3 py-2 text-right">已開銷項</th>
            <th className="px-3 py-2 text-right">已收款</th>
            <th className="px-3 py-2 text-right">未收</th>
            <th className="px-3 py-2 text-right">已付款</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.length === 0 ? (
            <tr><td colSpan={7} className="text-center py-10 text-gray-400">尚無工程案資料</td></tr>
          ) : rows.map((r) => (
            <tr key={r.projectId} className="hover:bg-amber-50/40">
              <td className="px-3 py-1.5 font-medium max-w-[200px] truncate" title={r.name}>{r.name}</td>
              <td className="px-3 py-1.5 text-xs text-gray-500 max-w-[120px] truncate" title={r.clientName}>{r.clientName || '—'}</td>
              <td className="px-3 py-1.5 text-right tabular-nums text-gray-600">{r.certified ? fmt(r.certified) : '—'}</td>
              <td className="px-3 py-1.5 text-right tabular-nums">{r.output ? fmt(r.output) : '—'}</td>
              <td className="px-3 py-1.5 text-right tabular-nums text-indigo-700">{r.income ? fmt(r.income) : '—'}</td>
              <td className={`px-3 py-1.5 text-right tabular-nums font-medium ${r.unreceived > 0 ? 'text-red-600' : 'text-gray-400'}`}>{r.unreceived ? fmt(r.unreceived) : '—'}</td>
              <td className="px-3 py-1.5 text-right tabular-nums text-gray-600">{r.paid ? fmt(r.paid) : '—'}</td>
            </tr>
          ))}
        </tbody>
        {rows.length > 0 && (
          <tfoot className={FOOT}>
            <tr>
              <td className="px-3 py-2" colSpan={2}>合計</td>
              <td className="px-3 py-2 text-right tabular-nums">{fmt(t.certified)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{fmt(t.output)}</td>
              <td className="px-3 py-2 text-right tabular-nums text-indigo-700">{fmt(t.income)}</td>
              <td className={`px-3 py-2 text-right tabular-nums ${t.unreceived > 0 ? 'text-red-600' : ''}`}>{fmt(t.unreceived)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{fmt(t.paid)}</td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
