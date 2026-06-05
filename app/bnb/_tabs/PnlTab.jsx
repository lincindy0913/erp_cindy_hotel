'use client';

import Link from 'next/link';
import ExportButtons from '@/components/ExportButtons';
import FetchErrorBanner from '@/components/FetchErrorBanner';
import WhQuickBtns from '../_components/WhQuickBtns';
import { inputCls, btnCls } from '../_constants';

const PNL_EXPORT_COLS = [
  { header: '月份',     key: 'month' },
  { header: '住宿淨收入',key:'netRevenue',    format: 'number' },
  { header: '其他收入', key: 'otherIncome',   format: 'number' },
  { header: '收入合計', key: 'incomeTotal',   format: 'number' },
  { header: '採購支出', key: 'purchaseExpense',format:'number' },
  { header: '固定費用', key: 'fixedExpense',  format: 'number' },
  { header: '支出合計', key: 'totalExpense',  format: 'number' },
  { header: '淨利',     key: 'pnlNetProfit',  format: 'number' },
];

export default function PnlTab({
  summaryMode, setSummaryMode,
  summaryYear, setSummaryYear,
  summaryWarehouse, setSummaryWarehouse,
  summaryRows, summaryLoading,
  summaryFixedHelp,
  fetchSummary,
  warehouseList,
  doPrint,
  summaryError,
}) {
  return (
    <div>
      {summaryError && <div className="mb-4"><FetchErrorBanner message={summaryError} onRetry={fetchSummary} /></div>}
      {/* 控制列 */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        {/* 月報/年報 切換 */}
        <div className="flex rounded-lg overflow-hidden border border-gray-200 text-sm">
          {[['monthly','月報'],['annual','年報']].map(([v, label]) => (
            <button
              key={v}
              onClick={() => setSummaryMode(v)}
              className={`px-4 py-1.5 ${summaryMode === v ? 'bg-indigo-600 text-white font-medium' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
            >{label}</button>
          ))}
        </div>
        {summaryMode === 'monthly' && (
          <>
            <label htmlFor="f-29" className="text-sm text-gray-600">年份</label>
            <select id="f-29" value={summaryYear} onChange={e => setSummaryYear(e.target.value)} className={inputCls}>
              {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </>
        )}
        <label htmlFor="f-30" className="text-sm text-gray-600">館別</label>
        <select id="f-30" value={summaryWarehouse} onChange={e => setSummaryWarehouse(e.target.value)} className={inputCls}>
          <option value="">全部</option>
          {warehouseList.map(w => <option key={w} value={w}>{w}</option>)}
        </select>
        <WhQuickBtns list={warehouseList} value={summaryWarehouse} onChange={setSummaryWarehouse} />
        <button onClick={fetchSummary} className={`${btnCls} bg-indigo-50 text-indigo-700`}>重新整理</button>
        <div className="ml-auto flex gap-2">
          {(() => {
            const pnlData = summaryRows.map(r => ({
              ...r,
              month: summaryMode === 'annual' ? r.year : r.month,
              incomeTotal:  r.netRevenue + (r.otherIncome || 0),
              pnlNetProfit: r.netProfit,
            }));
            const title = summaryMode === 'annual'
              ? `損益年報_${summaryWarehouse || '全館'}`
              : `損益月報_${summaryYear}${summaryWarehouse ? '_' + summaryWarehouse : ''}`;
            return (
              <>
                <ExportButtons
                  data={pnlData}
                  columns={PNL_EXPORT_COLS}
                  filename={title}
                  title={title}
                />
                <button
                  onClick={() => doPrint(
                    title,
                    PNL_EXPORT_COLS.map(c => c.header),
                    pnlData.map(r => PNL_EXPORT_COLS.map(c => r[c.key] ?? ''))
                  )}
                  className={`${btnCls} text-gray-600`}
                >列印</button>
              </>
            );
          })()}
        </div>
      </div>

      {/* 月報：固定費用提示 */}
      {summaryMode === 'monthly' && !summaryLoading && summaryFixedHelp && (
        <div className="space-y-2 mb-4 text-sm">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-gray-600">
            <span>此表固定費用來自費用管理之共通費用（僅計入<strong>已確認</strong>）。</span>
            <Link href="/expenses" className="text-indigo-600 hover:underline font-medium whitespace-nowrap">
              前往費用管理
            </Link>
          </div>
          <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-500 space-y-0.5">
            <div><span className="font-medium text-gray-700">採購支出</span>：依進貨單的<strong>進貨日期</strong>歸月，僅計入狀態為「已入庫」或「已完成」的進貨單。</div>
            <div><span className="font-medium text-gray-700">固定費用</span>：依共通費用記錄的<strong>費用月份</strong>歸月，僅計入狀態為「已確認」、類型為固定費用（非進貨單連結）的記錄。</div>
          </div>
          {(summaryFixedHelp.pendingFixedCount ?? 0) > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900">
              {summaryYear} 年度尚有 <strong>{summaryFixedHelp.pendingFixedCount}</strong> 筆共通費用紀錄未確認，不會計入上表固定費用；請至費用管理處理。
            </div>
          )}
          {(summaryFixedHelp.monthsWithZeroFixed?.length ?? 0) > 0 && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-slate-800">
              以下月份有訂房或房費收入，但固定費用為 NT$0，請確認該月是否已建立並確認共通費用：
              <span className="ml-1 font-mono text-xs sm:text-sm">
                {summaryFixedHelp.monthsWithZeroFixed.join('、')}
              </span>
            </div>
          )}
        </div>
      )}

      {summaryLoading ? (
        <div className="text-center py-16 text-gray-400">載入中…</div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 tbl-wrap">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-indigo-50">
              <tr className="bg-indigo-50 text-indigo-800 text-xs">
                {[summaryMode === 'annual' ? '年份' : '月份','住宿淨收入','其他收入','收入合計','採購支出','固定費用','支出合計','淨利'].map(h => (
                  <th key={h} className="px-3 py-2 text-right first:text-left font-medium whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {summaryRows.length === 0 && (
                <tr><td colSpan={8} className="text-center py-10 text-gray-400">無資料</td></tr>
              )}
              {summaryRows.map(r => {
                const key = summaryMode === 'annual' ? r.year : r.month;
                const incomeTotal = r.netRevenue + (r.otherIncome || 0);
                const zeroFixedHint =
                  summaryMode === 'monthly' && (summaryFixedHelp?.monthsWithZeroFixed?.includes(r.month) ?? false);
                const fixedExpenseLink = summaryMode === 'monthly'
                  ? `/expenses?month=${r.month}&subTab=records${summaryWarehouse ? `&warehouse=${encodeURIComponent(summaryWarehouse)}` : ''}`
                  : null;
                const purchaseLink = summaryMode === 'monthly'
                  ? `/purchasing?startDate=${r.month}-01&endDate=${r.month}-31${summaryWarehouse ? `&warehouse=${encodeURIComponent(summaryWarehouse)}` : ''}`
                  : null;
                return (
                  <tr
                    key={key}
                    className={`hover:bg-gray-50 ${zeroFixedHint ? 'bg-amber-50/60' : ''}`}
                  >
                    <td className="px-3 py-2 font-medium">{key}</td>
                    <td className="px-3 py-2 text-right text-indigo-700">{Math.round(r.netRevenue).toLocaleString()}</td>
                    <td className="px-3 py-2 text-right text-gray-500">{Math.round(r.otherIncome || 0).toLocaleString()}</td>
                    <td className="px-3 py-2 text-right font-semibold">{Math.round(incomeTotal).toLocaleString()}</td>
                    <td className="px-3 py-2 text-right text-red-500">
                      {purchaseLink ? (
                        <a href={purchaseLink} target="_blank" rel="noopener" className="hover:underline hover:text-red-600">
                          ({Math.round(r.purchaseExpense).toLocaleString()})
                        </a>
                      ) : (
                        <span>({Math.round(r.purchaseExpense).toLocaleString()})</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right text-red-400">
                      {fixedExpenseLink ? (
                        <a href={fixedExpenseLink} target="_blank" rel="noopener" className="hover:underline hover:text-red-600">
                          ({Math.round(r.fixedExpense).toLocaleString()})
                        </a>
                      ) : (
                        <span>({Math.round(r.fixedExpense).toLocaleString()})</span>
                      )}
                      {zeroFixedHint && (
                        <span className="block text-[10px] leading-tight text-amber-800 font-normal mt-0.5">可能未登記或未確認</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right text-red-600">({Math.round(r.totalExpense).toLocaleString()})</td>
                    <td className={`px-3 py-2 text-right font-bold ${r.netProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {Math.round(r.netProfit).toLocaleString()}
                    </td>
                  </tr>
                );
              })}
              {/* 合計列（月報模式才顯示，年報各年已是年度合計） */}
              {summaryMode === 'monthly' && summaryRows.length > 0 && (() => {
                const tot = summaryRows.reduce((a, r) => ({
                  netRevenue:      (a.netRevenue      || 0) + r.netRevenue,
                  otherIncome:     (a.otherIncome     || 0) + (r.otherIncome || 0),
                  purchaseExpense: (a.purchaseExpense || 0) + r.purchaseExpense,
                  fixedExpense:    (a.fixedExpense    || 0) + r.fixedExpense,
                  totalExpense:    (a.totalExpense    || 0) + r.totalExpense,
                  netProfit:       (a.netProfit       || 0) + r.netProfit,
                }), {});
                const incomeTotal = tot.netRevenue + tot.otherIncome;
                return (
                  <tr className="bg-indigo-50 font-bold text-indigo-800 text-xs border-t-2 border-indigo-200">
                    <td className="px-3 py-2">全年合計</td>
                    <td className="px-3 py-2 text-right">{Math.round(tot.netRevenue).toLocaleString()}</td>
                    <td className="px-3 py-2 text-right">{Math.round(tot.otherIncome).toLocaleString()}</td>
                    <td className="px-3 py-2 text-right">{Math.round(incomeTotal).toLocaleString()}</td>
                    <td className="px-3 py-2 text-right text-red-600">({Math.round(tot.purchaseExpense).toLocaleString()})</td>
                    <td className="px-3 py-2 text-right text-red-500">({Math.round(tot.fixedExpense).toLocaleString()})</td>
                    <td className="px-3 py-2 text-right text-red-700">({Math.round(tot.totalExpense).toLocaleString()})</td>
                    <td className={`px-3 py-2 text-right ${tot.netProfit >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                      {Math.round(tot.netProfit).toLocaleString()}
                    </td>
                  </tr>
                );
              })()}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
