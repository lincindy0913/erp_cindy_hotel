'use client';

import { useState, useMemo } from 'react';
import ExportButtons from '@/components/ExportButtons';

const NT = (v) => `NT$ ${Number(v || 0).toLocaleString()}`;
const MONTHS = [1,2,3,4,5,6,7,8,9,10,11,12];

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

const Loading = ({ text = '載入中...' }) => (
  <div className="flex items-center justify-center py-20 text-gray-400">
    <svg className="animate-spin h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
    </svg>
    {text}
  </div>
);

function OccupancyCostDataView({ data, filterMeta, onRefetch }) {
  const { rows = [] } = data;
  const [viewMode, setViewMode] = useState('daily');

  const warehouseAvg = useMemo(() => {
    const m = new Map();
    for (const r of rows) {
      if (r.costPerGuest == null) continue;
      if (!m.has(r.warehouse)) m.set(r.warehouse, []);
      m.get(r.warehouse).push(r.costPerGuest);
    }
    const out = new Map();
    for (const [wh, vals] of m)
      out.set(wh, vals.reduce((s,v)=>s+v,0) / vals.length);
    return out;
  }, [rows]);

  const isAnomaly = r => {
    const avg = warehouseAvg.get(r.warehouse);
    return avg != null && r.costPerGuest != null && r.costPerGuest > avg * 1.2;
  };

  const anomalyCount = rows.filter(isAnomaly).length;

  const totals = useMemo(() => {
    let occupiedRooms=0, guestCount=0, breakfastCount=0, purchaseTotal=0;
    for (const r of rows) {
      occupiedRooms  += r.occupiedRooms;
      guestCount     += r.guestCount;
      breakfastCount += r.breakfastCount;
      purchaseTotal  += r.purchaseTotal;
    }
    return {
      occupiedRooms, guestCount, breakfastCount, purchaseTotal,
      costPerRoom:      occupiedRooms  > 0 ? Math.round(purchaseTotal/occupiedRooms)  : null,
      costPerGuest:     guestCount     > 0 ? Math.round(purchaseTotal/guestCount)     : null,
      costPerBreakfast: breakfastCount > 0 ? Math.round(purchaseTotal/breakfastCount) : null,
    };
  }, [rows]);

  const monthlyPivot = useMemo(() => {
    const m = new Map();
    for (const r of rows) {
      const mo = parseInt(r.date.slice(5,7), 10);
      if (!m.has(r.warehouse)) m.set(r.warehouse, { warehouse: r.warehouse, months:{} });
      const w = m.get(r.warehouse);
      if (!w.months[mo]) w.months[mo] = { purchaseTotal:0, occupiedRooms:0, guestCount:0, breakfastCount:0 };
      const mb = w.months[mo];
      mb.purchaseTotal  += r.purchaseTotal;
      mb.occupiedRooms  += r.occupiedRooms;
      mb.guestCount     += r.guestCount;
      mb.breakfastCount += r.breakfastCount;
    }
    return Array.from(m.values()).map(w => ({
      ...w,
      total: Object.values(w.months).reduce((s,mb)=>s+mb.purchaseTotal, 0),
    }));
  }, [rows]);

  const monthColTotals = useMemo(() =>
    MONTHS.reduce((acc,mo) => {
      acc[mo] = monthlyPivot.reduce((s,r)=>s+(r.months[mo]?.purchaseTotal||0), 0);
      return acc;
    }, {}),
  [monthlyPivot]);

  const DAILY_EXPORT_COLS = [
    { header:'日期',     key:'date',            width:14 },
    { header:'館別',     key:'warehouse',        width:12 },
    { header:'住宿間數', key:'occupiedRooms',    width:10, format:'number' },
    { header:'住宿人數', key:'guestCount',       width:10, format:'number' },
    { header:'早餐人數', key:'breakfastCount',   width:10, format:'number' },
    { header:'採購總額', key:'purchaseTotal',    width:14, format:'currency' },
    { header:'每間採購', key:'costPerRoom',      width:12, format:'currency' },
    { header:'每人採購', key:'costPerGuest',     width:12, format:'currency' },
    { header:'每份早餐', key:'costPerBreakfast', width:12, format:'currency' },
  ];
  const MONTHLY_EXPORT_COLS = [
    { header:'館別', key:'warehouse', width:14 },
    ...MONTHS.map(m => ({ header:`${m}月`, key:`m${m}`, width:12, format:'currency' })),
    { header:'合計', key:'total', width:14, format:'currency' },
  ];
  const monthlyExportData = useMemo(() =>
    monthlyPivot.map(r => ({
      warehouse: r.warehouse,
      ...MONTHS.reduce((acc,m) => { acc[`m${m}`] = r.months[m]?.purchaseTotal||0; return acc; }, {}),
      total: r.total,
    })),
  [monthlyPivot]);

  const titleLabel = `住宿成本效益${filterMeta.warehouse ? ` — ${filterMeta.warehouse}` : ''}${filterMeta.category ? ` ／ ${filterMeta.category}` : ''}`;

  function openPrint(html) {
    const win = window.open('','_blank','width=1300,height=800');
    win.document.write(html); win.document.close(); win.focus();
    setTimeout(() => win.print(), 400);
  }

  function handlePrintDaily() {
    const css = `body{font-family:Arial,"Microsoft JhengHei",sans-serif;font-size:11px;padding:20px}h2{font-size:15px;margin:0 0 4px}.meta{color:#555;margin-bottom:10px}.kpis{display:flex;gap:14px;margin-bottom:12px;flex-wrap:wrap}.kpi{border:1px solid #ddd;border-radius:5px;padding:5px 12px}.kpi-l{font-size:10px;color:#888}.kpi-v{font-size:13px;font-weight:bold}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccc;padding:4px 7px;white-space:nowrap}th{background:#f5f5f5}tfoot td{background:#f0f0f0;font-weight:bold}.leg{font-size:10px;color:#c05621;margin-top:6px}@page{size:landscape;margin:12mm}`;
    const period = `${filterMeta.start} ~ ${filterMeta.end}`;
    const fmt = v => v!=null ? NT(v) : '—';
    const rowsH = rows.map(r => {
      const a = isAnomaly(r);
      return `<tr><td>${r.date}</td><td>${r.warehouse}</td><td style="text-align:right">${r.occupiedRooms}</td><td style="text-align:right">${r.guestCount}</td><td style="text-align:right">${r.breakfastCount}</td><td style="text-align:right">${NT(r.purchaseTotal)}</td><td style="text-align:right">${r.costPerRoom!=null?r.costPerRoom.toLocaleString():'—'}</td><td style="text-align:right${a?';color:#c05621;font-weight:bold':''}">${r.costPerGuest!=null?r.costPerGuest.toLocaleString():'—'}${a?' ▲':''}</td><td style="text-align:right">${r.costPerBreakfast!=null?r.costPerBreakfast.toLocaleString():'—'}</td></tr>`;
    }).join('');
    openPrint(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${titleLabel}</title><style>${css}</style></head><body>
<h2>${titleLabel}</h2><p class="meta">期間：${period}${filterMeta.category?` / 分類：${filterMeta.category}`:''} / 列印：${new Date().toLocaleString('zh-TW')}</p>
<div class="kpis"><div class="kpi"><div class="kpi-l">住宿間數</div><div class="kpi-v">${totals.occupiedRooms.toLocaleString()}</div></div><div class="kpi"><div class="kpi-l">住宿人數</div><div class="kpi-v">${totals.guestCount.toLocaleString()}</div></div><div class="kpi"><div class="kpi-l">早餐人數</div><div class="kpi-v">${totals.breakfastCount.toLocaleString()}</div></div><div class="kpi"><div class="kpi-l">採購總額</div><div class="kpi-v">${NT(totals.purchaseTotal)}</div></div><div class="kpi"><div class="kpi-l">每間採購</div><div class="kpi-v">${fmt(totals.costPerRoom)}</div></div><div class="kpi"><div class="kpi-l">每人採購</div><div class="kpi-v">${fmt(totals.costPerGuest)}</div></div><div class="kpi"><div class="kpi-l">每份早餐</div><div class="kpi-v">${fmt(totals.costPerBreakfast)}</div></div></div>
<table><thead><tr><th>日期</th><th>館別</th><th>住宿間數</th><th>住宿人數</th><th>早餐人數</th><th>採購總額</th><th>每間採購</th><th>每人採購</th><th>每份早餐</th></tr></thead><tbody>${rowsH}</tbody>
<tfoot><tr><td colspan="2">合計/平均</td><td style="text-align:right">${totals.occupiedRooms.toLocaleString()}</td><td style="text-align:right">${totals.guestCount.toLocaleString()}</td><td style="text-align:right">${totals.breakfastCount.toLocaleString()}</td><td style="text-align:right">${NT(totals.purchaseTotal)}</td><td style="text-align:right">${totals.costPerRoom?.toLocaleString()||'—'}</td><td style="text-align:right">${totals.costPerGuest?.toLocaleString()||'—'}</td><td style="text-align:right">${totals.costPerBreakfast?.toLocaleString()||'—'}</td></tr></tfoot></table>
${anomalyCount>0?`<p class="leg">▲ 橘色 = 每人採購超過本期館別平均 120%（共 ${anomalyCount} 天）</p>`:''}
</body></html>`);
  }

  function handlePrintMonthly() {
    const css = `body{font-family:Arial,"Microsoft JhengHei",sans-serif;font-size:11px;padding:20px}h2{font-size:15px;margin:0 0 4px}.meta{color:#555;margin-bottom:12px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccc;padding:4px 8px;white-space:nowrap}th{background:#f5f5f5;text-align:center}tfoot td{background:#f0f0f0}@page{size:landscape;margin:12mm}`;
    const bR = monthlyPivot.map(r => `<tr><td>${r.warehouse}</td>${MONTHS.map(m=>`<td style="text-align:right">${r.months[m]?.purchaseTotal>0?Math.round(r.months[m].purchaseTotal).toLocaleString():''}</td>`).join('')}<td style="text-align:right;font-weight:bold">${Math.round(r.total).toLocaleString()}</td></tr>`).join('');
    const fR = `<tr><td style="font-weight:bold">合計</td>${MONTHS.map(m=>`<td style="text-align:right;font-weight:bold">${monthColTotals[m]>0?Math.round(monthColTotals[m]).toLocaleString():''}</td>`).join('')}<td style="text-align:right;font-weight:bold">${Math.round(monthlyPivot.reduce((s,r)=>s+r.total,0)).toLocaleString()}</td></tr>`;
    openPrint(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${titleLabel} — 月份彙整</title><style>${css}</style></head><body>
<h2>${titleLabel} — 月份採購彙整</h2><p class="meta">期間：${filterMeta.start} ~ ${filterMeta.end} / 列印：${new Date().toLocaleString('zh-TW')}</p>
<table><thead><tr><th>館別</th>${MONTHS.map(m=>`<th>${m}月</th>`).join('')}<th>合計</th></tr></thead><tbody>${bR}</tbody><tfoot>${fR}</tfoot></table>
</body></html>`);
  }

  const isMonthly = viewMode === 'monthly';

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        <KpiCard label="住宿間數"   value={totals.occupiedRooms.toLocaleString()}   icon="🛏️" color="text-indigo-600" />
        <KpiCard label="住宿人數"   value={totals.guestCount.toLocaleString()}       icon="👤" color="text-blue-600" />
        <KpiCard label="早餐人數"   value={totals.breakfastCount.toLocaleString()}   icon="🍳" color="text-teal-600" />
        <KpiCard label="採購總額"   value={NT(totals.purchaseTotal)}                  icon="🛒" color="text-gray-700" />
        <KpiCard label="每間採購"   value={totals.costPerRoom!=null ? NT(totals.costPerRoom) : '—'}          icon="🏠" color="text-cyan-700" />
        <KpiCard label="每人採購"   value={totals.costPerGuest!=null ? NT(totals.costPerGuest) : '—'}        icon="💰" color="text-cyan-700" />
        <KpiCard label="每份早餐成本" value={totals.costPerBreakfast!=null ? NT(totals.costPerBreakfast) : '—'} icon="☕" color="text-amber-700" />
      </div>

      {anomalyCount > 0 && (
        <div className="flex items-center gap-2 bg-orange-50 border border-orange-200 rounded-lg px-4 py-2.5">
          <span className="text-orange-500 font-bold text-sm">▲</span>
          <p className="text-sm text-orange-800">
            發現 <strong>{anomalyCount}</strong> 天「每人採購」超過本期館別平均的 120%，表格中以橘色標記。
          </p>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-5 py-3 border-b bg-gray-50 flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
            <button onClick={() => setViewMode('daily')}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${!isMonthly ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              每日明細
            </button>
            <button onClick={() => setViewMode('monthly')}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${isMonthly ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              月份彙整
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={isMonthly ? handlePrintMonthly : handlePrintDaily}
              disabled={rows.length === 0}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
              </svg>
              列印
            </button>
            <ExportButtons
              data={isMonthly ? monthlyExportData : rows}
              columns={isMonthly ? MONTHLY_EXPORT_COLS : DAILY_EXPORT_COLS}
              title={isMonthly ? `${titleLabel} — 月份彙整` : titleLabel}
              exportName={isMonthly ? '住宿成本月份彙整' : '住宿成本效益'}
              sheetName={isMonthly ? '月份彙整' : '每日明細'}
            />
          </div>
        </div>

        {!isMonthly && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b sticky top-0 z-10">
                <tr>
                  <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 whitespace-nowrap">日期</th>
                  <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 whitespace-nowrap">館別</th>
                  <th className="px-3 py-2.5 text-right text-xs font-medium text-indigo-500 whitespace-nowrap">住宿間數</th>
                  <th className="px-3 py-2.5 text-right text-xs font-medium text-blue-500 whitespace-nowrap">住宿人數</th>
                  <th className="px-3 py-2.5 text-right text-xs font-medium text-teal-500 whitespace-nowrap">早餐人數</th>
                  <th className="px-3 py-2.5 text-right text-xs font-medium text-gray-500 whitespace-nowrap">採購總額</th>
                  <th className="px-3 py-2.5 text-right text-xs font-medium text-cyan-600 whitespace-nowrap">每間採購</th>
                  <th className="px-3 py-2.5 text-right text-xs font-medium text-cyan-600 whitespace-nowrap">
                    每人採購 <span className="text-orange-400">⚡</span>
                  </th>
                  <th className="px-3 py-2.5 text-right text-xs font-medium text-amber-600 whitespace-nowrap">每份早餐</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((r, i) => {
                  const anomaly = isAnomaly(r);
                  return (
                    <tr key={i} className={`transition-colors ${anomaly ? 'bg-orange-50 hover:bg-orange-100/80' : r.hasPmsData === false ? 'bg-gray-50/60' : 'hover:bg-gray-50'}`}>
                      <td className="px-3 py-2 text-gray-500 whitespace-nowrap tabular-nums">{r.date}</td>
                      <td className="px-3 py-2 font-medium text-gray-800 whitespace-nowrap">
                        {r.warehouse}
                        {r.hasPmsData === false && <span className="ml-1 text-[10px] text-gray-400 font-normal">(無PMS)</span>}
                      </td>
                      <td className="px-3 py-2 text-right text-indigo-700 tabular-nums">{r.occupiedRooms || <span className="text-gray-300">—</span>}</td>
                      <td className="px-3 py-2 text-right text-blue-700 tabular-nums">{r.guestCount || <span className="text-gray-300">—</span>}</td>
                      <td className="px-3 py-2 text-right text-teal-700 tabular-nums">{r.breakfastCount || <span className="text-gray-300">—</span>}</td>
                      <td className="px-3 py-2 text-right text-gray-700 tabular-nums">{r.purchaseTotal > 0 ? NT(r.purchaseTotal) : <span className="text-gray-300">—</span>}</td>
                      <td className="px-3 py-2 text-right text-cyan-700 tabular-nums">{r.costPerRoom != null ? r.costPerRoom.toLocaleString() : <span className="text-gray-300">—</span>}</td>
                      <td className={`px-3 py-2 text-right tabular-nums font-medium ${anomaly ? 'text-orange-600' : 'text-cyan-700'}`}>
                        {r.costPerGuest != null ? (
                          <span className="flex items-center justify-end gap-1">
                            {r.costPerGuest.toLocaleString()}
                            {anomaly && <span className="text-xs text-orange-500" title="超過平均 120%">▲</span>}
                          </span>
                        ) : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-3 py-2 text-right text-amber-700 tabular-nums">{r.costPerBreakfast != null ? r.costPerBreakfast.toLocaleString() : <span className="text-gray-300">—</span>}</td>
                    </tr>
                  );
                })}
                {rows.length === 0 && (
                  <tr><td colSpan={9} className="px-4 py-10 text-center text-gray-400">查無符合條件的資料</td></tr>
                )}
              </tbody>
              {rows.length > 0 && (
                <tfoot className="bg-gray-50 border-t font-semibold text-sm">
                  <tr>
                    <td colSpan={2} className="px-3 py-2.5 text-right text-gray-600">合計 / 平均</td>
                    <td className="px-3 py-2.5 text-right text-indigo-700">{totals.occupiedRooms.toLocaleString()}</td>
                    <td className="px-3 py-2.5 text-right text-blue-700">{totals.guestCount.toLocaleString()}</td>
                    <td className="px-3 py-2.5 text-right text-teal-700">{totals.breakfastCount.toLocaleString()}</td>
                    <td className="px-3 py-2.5 text-right">{NT(totals.purchaseTotal)}</td>
                    <td className="px-3 py-2.5 text-right text-cyan-700">{totals.costPerRoom?.toLocaleString() ?? '—'}</td>
                    <td className="px-3 py-2.5 text-right text-cyan-700">{totals.costPerGuest?.toLocaleString() ?? '—'}</td>
                    <td className="px-3 py-2.5 text-right text-amber-700">{totals.costPerBreakfast?.toLocaleString() ?? '—'}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}

        {isMonthly && (
          <div className="tbl-wrap">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b sticky top-0 z-10">
                <tr>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-600 whitespace-nowrap sticky left-0 bg-gray-50 z-10">館別／月份</th>
                  {MONTHS.map(m => (
                    <th key={m} className="px-3 py-2.5 text-right text-xs font-medium text-gray-500 whitespace-nowrap min-w-[80px]">{m}月</th>
                  ))}
                  <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-700 whitespace-nowrap bg-cyan-50">合計</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {monthlyPivot.map((r, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="px-4 py-2 font-medium text-gray-800 whitespace-nowrap sticky left-0 bg-white z-10">{r.warehouse}</td>
                    {MONTHS.map(m => {
                      const mb = r.months[m];
                      return (
                        <td key={m} className="px-3 py-2 text-right text-gray-700 whitespace-nowrap tabular-nums"
                          title={mb ? `住宿間數：${mb.occupiedRooms} ／ 住宿人數：${mb.guestCount} ／ 早餐：${mb.breakfastCount}` : ''}>
                          {mb?.purchaseTotal > 0 ? Math.round(mb.purchaseTotal).toLocaleString() : <span className="text-gray-200">—</span>}
                        </td>
                      );
                    })}
                    <td className="px-4 py-2 text-right font-bold text-cyan-700 whitespace-nowrap tabular-nums bg-cyan-50">
                      {Math.round(r.total).toLocaleString()}
                    </td>
                  </tr>
                ))}
                {monthlyPivot.length === 0 && (
                  <tr><td colSpan={14} className="px-4 py-10 text-center text-gray-400">查無資料</td></tr>
                )}
              </tbody>
              {monthlyPivot.length > 0 && (
                <tfoot className="bg-gray-50 border-t">
                  <tr>
                    <td className="px-4 py-2.5 font-semibold text-gray-700 sticky left-0 bg-gray-50 z-10">合計</td>
                    {MONTHS.map(m => (
                      <td key={m} className="px-3 py-2.5 text-right font-semibold text-gray-800 tabular-nums">
                        {monthColTotals[m] > 0 ? Math.round(monthColTotals[m]).toLocaleString() : <span className="text-gray-300">—</span>}
                      </td>
                    ))}
                    <td className="px-4 py-2.5 text-right font-bold text-cyan-700 tabular-nums bg-cyan-50">
                      {Math.round(monthlyPivot.reduce((s,r)=>s+r.total,0)).toLocaleString()}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
            <p className="px-4 py-2 text-xs text-gray-400 border-t">數值為採購總額（NT$）；游標停在格子上可看住宿間數／人數詳情</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function OccupancyCostTab({
  warehouses,
  occCostStart, setOccCostStart,
  occCostEnd, setOccCostEnd,
  occCostWarehouse, setOccCostWarehouse,
  occCostCategory, setOccCostCategory,
  occCostLoading, occCost,
  fetchOccCost,
}) {
  return (
    <div className="space-y-5">
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label htmlFor="f-17" className="block text-xs text-gray-500 mb-1">起始日期</label>
            <input id="f-17" type="date" value={occCostStart} onChange={e => setOccCostStart(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-400" />
          </div>
          <div>
            <label htmlFor="f-18" className="block text-xs text-gray-500 mb-1">結束日期</label>
            <input id="f-18" type="date" value={occCostEnd} onChange={e => setOccCostEnd(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-400" />
          </div>
          <div>
            <label htmlFor="f-19" className="block text-xs text-gray-500 mb-1">館別（選填）</label>
            <select id="f-19" value={occCostWarehouse} onChange={e => setOccCostWarehouse(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-400">
              <option value="">全部館別</option>
              {warehouses.map(w => <option key={w} value={w}>{w}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="f-30" className="block text-xs text-gray-500 mb-1">採購分類（選填）</label>
            <select id="f-30" value={occCostCategory} onChange={e => setOccCostCategory(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-400 min-w-[140px]">
              <option value="">全部分類</option>
              {(occCost?.categories || []).map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <button onClick={fetchOccCost}
            className="px-4 py-1.5 bg-cyan-600 text-white rounded-lg text-sm font-medium hover:bg-cyan-700">
            查詢
          </button>
        </div>
        {occCost?.categories?.length > 0 && (
          <p className="mt-2 text-xs text-gray-400">
            提示：選擇分類可分析特定品類的人均成本，例如「餐廳用品」→ 早餐食材成本
          </p>
        )}
      </div>

      {occCostLoading ? <Loading text="計算住宿成本效益中..." /> :
        occCost ? (
          <OccupancyCostDataView
            data={occCost}
            filterMeta={{ start: occCostStart, end: occCostEnd, warehouse: occCostWarehouse, category: occCostCategory }}
            onRefetch={fetchOccCost}
          />
        ) :
        <div className="text-center py-16 text-gray-400">
          <p className="text-3xl mb-3">🏨</p>
          <p className="font-medium">請設定日期區間後按「查詢」</p>
          <p className="text-xs mt-1">分析每日住宿間數、住宿人數、早餐人數與採購金額的對應關係</p>
        </div>
      }
    </div>
  );
}
