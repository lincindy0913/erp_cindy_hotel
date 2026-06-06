'use client';

import { useState, useEffect, useCallback } from 'react';
import { formatNumber } from './pmsIncomeFormatters';
import PmsIncomeStatsChart from './PmsIncomeStatsChart';

export default function PmsIncomeStatisticsTab({
  statsYear,
  setStatsYear,
  statsMonth,
  setStatsMonth,
  fetchStats,
  loading,
  statsData,
}) {
  const [showCompare, setShowCompare] = useState(false);
  const [compareYear, setCompareYear] = useState(statsYear - 1);
  const [compareData, setCompareData] = useState(null); // full-year or single-month YoY
  const [momData,     setMomData]     = useState(null); // previous-month (MoM, single-month only)
  const [compareLoading, setCompareLoading] = useState(false);

  const fetchCompareData = useCallback(async () => {
    if (!showCompare) { setCompareData(null); setMomData(null); return; }
    setCompareLoading(true);
    try {
      // YoY: compare year (user-selected or year-1), same month if single-month view
      const yoyUrl = statsMonth
        ? `/api/pms-income/monthly-summary?year=${compareYear}&month=${statsMonth}`
        : `/api/pms-income/monthly-summary?year=${compareYear}`;
      const yoyRes = await fetch(yoyUrl);
      setCompareData(yoyRes.ok ? await yoyRes.json() : null);

      // MoM: previous month (single-month view only)
      if (statsMonth) {
        const m = parseInt(statsMonth);
        const prevYear  = m === 1 ? statsYear - 1 : statsYear;
        const prevMonth = m === 1 ? 12 : m - 1;
        const momUrl = `/api/pms-income/monthly-summary?year=${prevYear}&month=${prevMonth}`;
        const momRes = await fetch(momUrl);
        setMomData(momRes.ok ? await momRes.json() : null);
      } else {
        setMomData(null);
      }
    } catch { setCompareData(null); setMomData(null); }
    setCompareLoading(false);
  }, [showCompare, compareYear, statsYear, statsMonth]);

  useEffect(() => { fetchCompareData(); }, [fetchCompareData]);
  useEffect(() => { if (!showCompare) { setCompareData(null); setMomData(null); } }, [showCompare]);

  // Build a lookup map: compareYear monthly data by month index (full-year view)
  const compareByMonth = Array.isArray(compareData)
    ? Object.fromEntries(compareData.map(m => [m.month, m]))
    : {};

  const delta = (a, b) => (b == null ? null : a - b);
  const deltaPct = (a, b) => (!b ? null : Math.round((a - b) / Math.abs(b) * 100));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={statsYear}
          onChange={(e) => setStatsYear(parseInt(e.target.value, 10))}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-teal-500"
        >
          {[2024, 2025, 2026, 2027].map((y) => (
            <option key={y} value={y}>
              {y}年
            </option>
          ))}
        </select>
        <select
          value={statsMonth}
          onChange={(e) => setStatsMonth(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-teal-500"
        >
          <option value="">全年總覽</option>
          {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
            <option key={m} value={m}>
              {m}月
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={fetchStats}
          className="px-3 py-2 text-sm border border-teal-300 text-teal-700 rounded-lg hover:bg-teal-50"
        >
          查詢
        </button>

        {/* Compare period toggle */}
        <div className="flex items-center gap-2 ml-2 border-l pl-3">
          <button
            type="button"
            onClick={() => setShowCompare(c => !c)}
            className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${showCompare ? 'bg-indigo-600 text-white border-indigo-600' : 'border-indigo-300 text-indigo-600 hover:bg-indigo-50'}`}
          >
            {showCompare ? '✓ 同期比較' : '同期比較'}
          </button>
          {showCompare && (
            <select
              value={compareYear}
              onChange={(e) => setCompareYear(parseInt(e.target.value, 10))}
              className="border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:ring-2 focus:ring-indigo-400"
            >
              {[2023, 2024, 2025, 2026].map((y) => (
                <option key={y} value={y}>{y}年（對比）</option>
              ))}
            </select>
          )}
          {showCompare && compareLoading && <span className="text-xs text-indigo-400">載入中…</span>}
        </div>
      </div>

      {loading ? (
        <div className="text-center py-8 text-gray-400">載入中...</div>
      ) : statsData ? (
        <>
          <div className="bg-white rounded-lg shadow-sm border p-6">
            <h3 className="text-sm font-bold text-gray-700 mb-4">
              {statsMonth ? `${statsYear}年${statsMonth}月 - 科目分佈` : `${statsYear}年 - 月度收入趨勢`}
            </h3>
            <PmsIncomeStatsChart statsData={statsData} />
          </div>

          {statsMonth && statsData.byAccountingCode && (
            <div className="bg-white rounded-lg shadow-sm border p-4">
              <h3 className="text-sm font-bold text-gray-700 mb-3">科目明細</h3>
              {(() => {
                // 單月模式：同期比較輔助變數
                // compareData 是去年同月的 summary object（非陣列）
                const yoy = (!Array.isArray(compareData) && compareData) ? compareData : null;
                const mom = momData && !Array.isArray(momData) ? momData : null;
                const yoyByCode = yoy
                  ? Object.fromEntries((yoy.byAccountingCode || []).map(i => [`${i.accountingCode}|${i.accountingName}`, i]))
                  : null;
                const momByCode = mom
                  ? Object.fromEntries((mom.byAccountingCode || []).map(i => [`${i.accountingCode}|${i.accountingName}`, i]))
                  : null;
                const showYoy = showCompare && yoyByCode;
                const showMom = showCompare && momByCode;

                // MoM 期間標籤
                const m = parseInt(statsMonth);
                const prevMonthLabel = m === 1 ? `${statsYear - 1}/12月` : `${m - 1}月`;
                const yoyLabel = `${compareYear}/${m}月`;

                const pctContent = (cur, refNet, extraCls = '') => {
                  if (!refNet) return <td className={`px-2 py-1.5 text-right text-gray-300 text-xs ${extraCls}`}>—</td>;
                  const pct = Math.round((cur - refNet) / Math.abs(refNet) * 100);
                  return (
                    <td className={`px-2 py-1.5 text-right text-xs font-medium ${pct >= 0 ? 'text-green-600' : 'text-red-500'} ${extraCls}`}>
                      {pct >= 0 ? '+' : ''}{pct}%
                    </td>
                  );
                };

                return (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm min-w-[520px]">
                      <thead>
                        <tr className="bg-gray-50 text-left">
                          <th className="px-3 py-2 font-medium">科目代碼</th>
                          <th className="px-3 py-2 font-medium">科目名稱</th>
                          <th className="px-3 py-2 font-medium text-right">本月淨額</th>
                          {showYoy && <>
                            <th className="px-2 py-2 font-medium text-right text-indigo-500 text-xs">{yoyLabel}</th>
                            <th className="px-2 py-2 font-medium text-right text-indigo-400 text-xs">YoY</th>
                          </>}
                          {showMom && <>
                            <th className="px-2 py-2 font-medium text-right text-purple-500 text-xs hidden md:table-cell">{prevMonthLabel}</th>
                            <th className="px-2 py-2 font-medium text-right text-purple-400 text-xs hidden md:table-cell">MoM</th>
                          </>}
                        </tr>
                      </thead>
                      <tbody>
                        {statsData.byAccountingCode.map((item, i) => {
                          const codeKey = `${item.accountingCode}|${item.accountingName}`;
                          const yoyItem = yoyByCode?.[codeKey];
                          const momItem = momByCode?.[codeKey];
                          return (
                            <tr key={i} className="border-t hover:bg-gray-50">
                              <td className="px-3 py-2 font-mono text-xs">{item.accountingCode}</td>
                              <td className="px-3 py-2">{item.accountingName}</td>
                              <td className={`px-3 py-2 text-right font-medium ${item.net >= 0 ? 'text-teal-700' : 'text-red-600'}`}>
                                {formatNumber(item.net)}
                              </td>
                              {showYoy && <>
                                <td className="px-2 py-1.5 text-right text-xs text-indigo-400 tabular-nums">
                                  {yoyItem ? formatNumber(yoyItem.net) : '—'}
                                </td>
                                {pctContent(item.net, yoyItem?.net)}
                              </>}
                              {showMom && <>
                                <td className="px-2 py-1.5 text-right text-xs text-purple-400 tabular-nums hidden md:table-cell">
                                  {momItem ? formatNumber(momItem.net) : '—'}
                                </td>
                                {pctContent(item.net, momItem?.net, 'hidden md:table-cell')}
                              </>}
                            </tr>
                          );
                        })}
                        <tr className="border-t-2 border-gray-300 font-bold bg-gray-50">
                          <td className="px-3 py-2" colSpan={2}>合計</td>
                          <td className="px-3 py-2 text-right text-teal-800">{formatNumber(statsData.total)}</td>
                          {showYoy && <>
                            <td className="px-2 py-2 text-right text-xs text-indigo-500">{yoy ? formatNumber(yoy.total) : '—'}</td>
                            {pctContent(statsData.total, yoy?.total)}
                          </>}
                          {showMom && <>
                            <td className="px-2 py-2 text-right text-xs text-purple-500 hidden md:table-cell">{mom ? formatNumber(mom.total) : '—'}</td>
                            {pctContent(statsData.total, mom?.total, 'hidden md:table-cell')}
                          </>}
                        </tr>
                      </tbody>
                    </table>
                  </div>
                );
              })()}

              {/* 同期比較提示（未開啟時） */}
              {!showCompare && (
                <p className="text-xs text-gray-400 mt-2">
                  點擊上方「同期比較」可顯示去年同月（YoY）與上個月（MoM）的對比欄位。
                </p>
              )}

              {Object.keys(statsData.byWarehouse || {}).length > 0 && (
                <div className="mt-6">
                  <h4 className="text-sm font-bold text-gray-700 mb-3">館別匯入統計</h4>
                  <div className="grid grid-cols-3 gap-4">
                    {Object.entries(statsData.byWarehouse).map(([wh, data]) => (
                      <div key={wh} className="border rounded-lg p-3">
                        <div className="font-medium text-teal-800 mb-2">{wh}</div>
                        <div className="grid grid-cols-2 gap-1 text-xs">
                          <span className="text-gray-500">貸方:</span>
                          <span className="text-right text-teal-700">{formatNumber(data.credit)}</span>
                          <span className="text-gray-500">借方:</span>
                          <span className="text-right text-amber-700">{formatNumber(data.debit)}</span>
                          <span className="text-gray-500">淨額:</span>
                          <span className="text-right font-medium">{formatNumber(data.net)}</span>
                          <span className="text-gray-500">匯入天數:</span>
                          <span className="text-right">{data.importedDays}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {!statsMonth && Array.isArray(statsData) && (() => {
            // Collect all warehouses across all months
            const whSet = new Set();
            for (const m of statsData) Object.keys(m.byWarehouse || {}).forEach(w => whSet.add(w));
            const warehouses = [...whSet];
            const showWhCompare = warehouses.length > 1;
            const yearTotal = statsData.reduce((s, m) => s + m.total, 0);

            return (
              <>
                {/* Multi-warehouse annual KPI cards */}
                {showWhCompare && (
                  <div className="bg-white rounded-lg shadow-sm border p-4">
                    <h3 className="text-sm font-bold text-gray-700 mb-3">各館別年度合計</h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {warehouses.map((wh, wi) => {
                        const whTotal = statsData.reduce((s, m) => s + (m.byWarehouse?.[wh]?.net || 0), 0);
                        const pct = yearTotal > 0 ? Math.round(whTotal / yearTotal * 100) : 0;
                        const COLORS = ['border-teal-400','border-blue-400','border-amber-400','border-purple-400'];
                        const TXT = ['text-teal-700','text-blue-700','text-amber-700','text-purple-700'];
                        return (
                          <div key={wh} className={`border-l-4 ${COLORS[wi % 4]} bg-white rounded-lg p-3 border border-gray-100`}>
                            <div className="text-xs text-gray-500">{wh}</div>
                            <div className={`text-base font-bold ${TXT[wi % 4]}`}>{formatNumber(whTotal)}</div>
                            <div className="text-xs text-gray-400">佔比 {pct}%</div>
                          </div>
                        );
                      })}
                      <div className="border-l-4 border-gray-400 bg-gray-50 rounded-lg p-3 border border-gray-100">
                        <div className="text-xs text-gray-500">全館合計</div>
                        <div className="text-base font-bold text-gray-800">{formatNumber(yearTotal)}</div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Monthly detail table */}
                <div className="bg-white rounded-lg shadow-sm border p-4">
                  <h3 className="text-sm font-bold text-gray-700 mb-3">月度摘要表</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm min-w-[500px]">
                      <thead>
                        <tr className="bg-gray-50 text-left">
                          <th className="px-3 py-2 font-medium">月份</th>
                          <th className="px-3 py-2 font-medium text-right">淨收入</th>
                          {showWhCompare && warehouses.map(wh => (
                            <th key={wh} className="px-3 py-2 font-medium text-right hidden md:table-cell">{wh}</th>
                          ))}
                          {showCompare && compareData && (
                            <>
                              <th className="px-3 py-2 font-medium text-right text-indigo-500">{compareYear}年</th>
                              <th className="px-3 py-2 font-medium text-right text-indigo-400">增減</th>
                              <th className="px-3 py-2 font-medium text-right text-indigo-400">增減率</th>
                            </>
                          )}
                          <th className="px-3 py-2 font-medium text-center">完成率</th>
                          <th className="px-3 py-2 font-medium text-center">匯入天數</th>
                        </tr>
                      </thead>
                      <tbody>
                        {statsData.map((m, i) => {
                          const cm = compareByMonth[m.month];
                          const d = (showCompare && cm) ? delta(m.total, cm.total) : null;
                          const dp = (showCompare && cm) ? deltaPct(m.total, cm.total) : null;
                          return (
                            <tr key={i} className="border-t hover:bg-gray-50">
                              <td className="px-3 py-2 font-medium">{m.month}月</td>
                              <td className={`px-3 py-2 text-right font-medium ${m.total >= 0 ? 'text-teal-700' : 'text-red-600'}`}>
                                {formatNumber(m.total)}
                              </td>
                              {showWhCompare && warehouses.map(wh => (
                                <td key={wh} className="px-3 py-2 text-right text-xs text-gray-500 hidden md:table-cell">
                                  {formatNumber(m.byWarehouse?.[wh]?.net || 0)}
                                </td>
                              ))}
                              {showCompare && compareData && (
                                <>
                                  <td className="px-3 py-2 text-right text-xs text-indigo-400">
                                    {cm ? formatNumber(cm.total) : '—'}
                                  </td>
                                  <td className={`px-3 py-2 text-right text-xs font-medium ${d == null ? 'text-gray-300' : d >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                                    {d == null ? '—' : (d >= 0 ? '+' : '') + formatNumber(d)}
                                  </td>
                                  <td className={`px-3 py-2 text-right text-xs font-medium ${dp == null ? 'text-gray-300' : dp >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                                    {dp == null ? '—' : (dp >= 0 ? '+' : '') + dp + '%'}
                                  </td>
                                </>
                              )}
                              <td className="px-3 py-2 text-center">
                                {m.totalDays > 0 ? (
                                  <span className={`text-xs font-medium ${Math.round(m.importedDays / m.totalDays * 100) >= 100 ? 'text-green-600' : 'text-amber-600'}`}>
                                    {Math.round((m.importedDays / m.totalDays) * 100)}%
                                  </span>
                                ) : '-'}
                              </td>
                              <td className="px-3 py-2 text-center text-xs text-gray-500">
                                {m.importedDays}/{m.totalDays}
                              </td>
                            </tr>
                          );
                        })}
                        <tr className="border-t-2 border-gray-300 font-bold bg-gray-50">
                          <td className="px-3 py-2">全年合計</td>
                          <td className="px-3 py-2 text-right text-teal-800">{formatNumber(yearTotal)}</td>
                          {showWhCompare && warehouses.map(wh => (
                            <td key={wh} className="px-3 py-2 text-right text-gray-700 hidden md:table-cell">
                              {formatNumber(statsData.reduce((s, m) => s + (m.byWarehouse?.[wh]?.net || 0), 0))}
                            </td>
                          ))}
                          {showCompare && compareData && (() => {
                            const compYearTotal = Array.isArray(compareData) ? compareData.reduce((s, m) => s + m.total, 0) : 0;
                            const d = delta(yearTotal, compYearTotal);
                            const dp = deltaPct(yearTotal, compYearTotal);
                            return (
                              <>
                                <td className="px-3 py-2 text-right text-xs text-indigo-500">{formatNumber(compYearTotal)}</td>
                                <td className={`px-3 py-2 text-right text-xs font-bold ${d >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                                  {(d >= 0 ? '+' : '') + formatNumber(d)}
                                </td>
                                <td className={`px-3 py-2 text-right text-xs font-bold ${dp >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                                  {(dp >= 0 ? '+' : '') + dp + '%'}
                                </td>
                              </>
                            );
                          })()}
                          <td className="px-3 py-2 text-center">
                            {(() => {
                              const td = statsData.reduce((s, m) => s + m.totalDays, 0);
                              const id = statsData.reduce((s, m) => s + m.importedDays, 0);
                              return td > 0 ? `${Math.round(id / td * 100)}%` : '-';
                            })()}
                          </td>
                          <td className="px-3 py-2 text-center">
                            {statsData.reduce((s,m)=>s+m.importedDays,0)}/{statsData.reduce((s,m)=>s+m.totalDays,0)}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            );
          })()}
        </>
      ) : (
        <div className="text-center py-8 text-gray-400">無資料</div>
      )}
    </div>
  );
}
