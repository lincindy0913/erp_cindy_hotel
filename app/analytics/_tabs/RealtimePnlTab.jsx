'use client';
import { useState, useEffect } from 'react';

const NT  = v => `NT$ ${Number(v || 0).toLocaleString()}`;
const pct = v => `${Number(v || 0).toFixed(1)}%`;

function KpiCard({ label, value, sub, color = 'text-gray-900', borderColor = 'border-gray-200' }) {
  return (
    <div className={`bg-white rounded-xl shadow-sm border-l-4 ${borderColor} p-4`}>
      <p className="text-xs text-gray-500 font-medium">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}

function MomBadge({ current, prev }) {
  if (!prev || prev === 0) return null;
  const diff = ((current - prev) / Math.abs(prev)) * 100;
  const up = diff >= 0;
  return (
    <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${up ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
      {up ? '▲' : '▼'} {Math.abs(diff).toFixed(1)}% MoM
    </span>
  );
}

function fetchPnl(startDate, endDate, warehouse) {
  const p = new URLSearchParams({ startDate, endDate });
  if (warehouse) p.set('warehouse', warehouse);
  return fetch(`/api/analytics/pnl?${p}`).then(r => r.ok ? r.json() : null);
}

function monthRange(year, month) {
  const mm = String(month).padStart(2, '0');
  const lastDay = new Date(year, month, 0).getDate();
  return { start: `${year}-${mm}-01`, end: `${year}-${mm}-${lastDay}` };
}

export default function RealtimePnlTab({ warehouses = [] }) {
  const now       = new Date();
  const [year, setYear]       = useState(now.getFullYear());
  const [month, setMonth]     = useState(now.getMonth() + 1);
  const [warehouse, setWh]    = useState('');
  const [cur, setCur]         = useState(null);
  const [prev, setPrev]       = useState(null);
  const [bnbRev, setBnbRev]   = useState(null);   // 月報房收(入住月)對照
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    setCur(null); setPrev(null); setBnbRev(null);
    const { start: cs, end: ce } = monthRange(year, month);
    const prevMonth = month === 1 ? 12 : month - 1;
    const prevYear  = month === 1 ? year - 1 : year;
    const { start: ps, end: pe } = monthRange(prevYear, prevMonth);
    const bnbP = new URLSearchParams({ year: String(year), month: String(month) });
    if (warehouse) bnbP.set('warehouse', warehouse);
    Promise.all([
      fetchPnl(cs, ce, warehouse),
      fetchPnl(ps, pe, warehouse),
      fetch(`/api/analytics/bnb-booking-revenue?${bnbP}`).then(r => r.ok ? r.json() : null).catch(() => null),
    ]).then(([c, p, b]) => { setCur(c?.summary ?? null); setPrev(p?.summary ?? null); setBnbRev(b ?? null); setLoading(false); });
  }, [year, month, warehouse]);

  const yearOpts  = [now.getFullYear(), now.getFullYear() - 1, now.getFullYear() - 2];
  const monthOpts = Array.from({ length: 12 }, (_, i) => i + 1);

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs text-gray-500 mb-1">年份</label>
          <select value={year} onChange={e => setYear(Number(e.target.value))}
            className="border rounded px-2 py-1.5 text-sm">
            {yearOpts.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">月份</label>
          <select value={month} onChange={e => setMonth(Number(e.target.value))}
            className="border rounded px-2 py-1.5 text-sm">
            {monthOpts.map(m => <option key={m} value={m}>{m} 月</option>)}
          </select>
        </div>
        {warehouses.length > 0 && (
          <div>
            <label className="block text-xs text-gray-500 mb-1">館別</label>
            <select value={warehouse} onChange={e => setWh(e.target.value)}
              className="border rounded px-2 py-1.5 text-sm">
              <option value="">全部</option>
              {warehouses.map(w => <option key={w} value={w}>{w}</option>)}
            </select>
          </div>
        )}
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-gray-400 text-sm py-12 justify-center">
          <div className="animate-spin w-5 h-5 border-2 border-gray-300 border-t-gray-600 rounded-full" />
          載入損益數字中…
        </div>
      )}

      {!loading && cur && (
        <>
          <div>
            <h3 className="text-sm font-semibold text-gray-600 mb-3">
              {year} 年 {month} 月 損益概況
              <span className="ml-2 text-xs font-normal text-gray-400">（資料基準：已確認現金流交易）</span>
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <KpiCard
                label="營業收入"
                value={NT(cur.revenue)}
                sub={<MomBadge current={cur.revenue} prev={prev?.revenue} />}
                color="text-blue-700"
                borderColor="border-blue-400"
              />
              <KpiCard
                label="營業成本"
                value={NT(cur.cogs)}
                sub={<MomBadge current={cur.cogs} prev={prev?.cogs} />}
                color="text-orange-600"
                borderColor="border-orange-400"
              />
              <KpiCard
                label="毛利"
                value={NT(cur.grossProfit)}
                sub={cur.revenue > 0 ? `毛利率 ${pct(cur.grossProfit / cur.revenue * 100)}` : undefined}
                color={cur.grossProfit >= 0 ? 'text-green-700' : 'text-red-600'}
                borderColor="border-green-400"
              />
              <KpiCard
                label="稅前淨利"
                value={NT(cur.netProfit)}
                sub={<MomBadge current={cur.netProfit} prev={prev?.netProfit} />}
                color={cur.netProfit >= 0 ? 'text-emerald-700' : 'text-red-700'}
                borderColor={cur.netProfit >= 0 ? 'border-emerald-500' : 'border-red-500'}
              />
            </div>
          </div>

          {/* 月報房收(入住月)對照 —— 民宿應收口徑，與上方現金基準不同，不影響損益 */}
          {bnbRev && bnbRev.rooms > 0 && (
            <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 flex flex-wrap items-center gap-x-6 gap-y-2">
              <div>
                <p className="text-xs text-indigo-500 font-medium">🏨 月報房收（入住月）</p>
                <p className="text-2xl font-bold mt-1 text-indigo-700">{NT(bnbRev.netRevenue)}</p>
              </div>
              <div className="text-xs text-indigo-600/80 leading-5">
                <div>房費+消費 {NT(bnbRev.roomCharge + bnbRev.otherCharge)}　手續費 −{NT(bnbRev.cardFee)}　（{bnbRev.rooms} 間）</div>
                <div className="text-indigo-400">
                  ※ 此為<strong>民宿帳月報「入住月·應收」</strong>口徑（與月收入總表一致），<strong>與上方現金基準不同、不計入損益</strong>；
                  現金差異來自收款入帳月份不同與老闆收取現金。
                </div>
              </div>
            </div>
          )}

          {/* Secondary KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <KpiCard label="營業費用"  value={NT(cur.expenses)} color="text-orange-600" borderColor="border-orange-300" />
            <KpiCard label="收款成本"  value={NT(cur.cogs)}     color="text-gray-600"   borderColor="border-gray-300" sub="（信用卡手續費等）" />
            <KpiCard label="毛利率"    value={cur.revenue > 0 ? pct(cur.grossProfit / cur.revenue * 100) : '—'}
              color={cur.grossProfit >= 0 ? 'text-green-700' : 'text-red-600'} borderColor="border-green-300"
              sub={prev?.revenue > 0 ? `上月 ${pct(prev.grossProfit / prev.revenue * 100)}` : undefined} />
          </div>

          {/* MoM summary table */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100">
              <h4 className="text-sm font-semibold text-gray-700">本月 vs 上月對比</h4>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500">
                <tr>
                  <th className="text-left px-4 py-2">項目</th>
                  <th className="text-right px-4 py-2">本月</th>
                  <th className="text-right px-4 py-2 text-gray-400">上月</th>
                  <th className="text-right px-4 py-2">增減</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {[
                  { label: '營業收入', key: 'revenue',    color: 'text-blue-700' },
                  { label: '營業費用', key: 'expenses',   color: 'text-orange-600' },
                  { label: '毛　　利', key: 'grossProfit', color: 'text-green-700' },
                  { label: '稅前淨利', key: 'netProfit',  color: 'text-emerald-700', bold: true },
                ].map(({ label, key, color, bold }) => {
                  const c = cur[key] ?? 0;
                  const p = prev?.[key] ?? 0;
                  const d = c - p;
                  return (
                    <tr key={key} className={bold ? 'bg-gray-50 font-semibold' : 'hover:bg-gray-50/50'}>
                      <td className="px-4 py-2 text-gray-700">{label}</td>
                      <td className={`text-right px-4 py-2 ${color}`}>{NT(c)}</td>
                      <td className="text-right px-4 py-2 text-gray-400">{NT(p)}</td>
                      <td className={`text-right px-4 py-2 text-xs font-medium ${d > 0 ? 'text-green-600' : d < 0 ? 'text-red-500' : 'text-gray-400'}`}>
                        {d !== 0 ? `${d > 0 ? '+' : ''}${NT(d)}` : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <p className="text-xs text-gray-400">
            資料來源：已確認現金流交易（含 PMS 收入推送、手動補記、出納執行付款單）。
            未確認交易不計入。如與月結快照有差異，請優先以月結資料為準。
          </p>
        </>
      )}

      {!loading && !cur && (
        <div className="text-center py-16 text-gray-400">無法載入損益資料</div>
      )}
    </div>
  );
}
