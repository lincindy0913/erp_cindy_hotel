'use client';

import Link from 'next/link';
import { todayStr } from '@/lib/localDate';
import { CONTRACT_STATUSES, getContractDisplayStatus } from '../_lib/rentalHelpers';
import StatusBadge from '../_components/StatusBadge';

const fmt = n => Number(n || 0).toLocaleString('zh-TW');

const PAYMENT_METHODS = ['現金', 'transfer', '支票', '匯款'];
const VALID_ANALYTICS_SUB = ['income', 'operating', 'overdue', 'deposit', 'vacancy'];
const ANALYTICS_SUB_LABELS = [
  { key: 'income',    label: '收入分析' },
  { key: 'operating', label: '營運分析' },
  { key: 'overdue',   label: '逾期催繳' },
  { key: 'vacancy',   label: '空置率' },
  { key: 'deposit',   label: '押金追蹤' },
];

export default function AnalyticsTab({
  analyticsSub, switchAnalyticsSub,
  reportYear, setReportYear,
  reportStartDate, setReportStartDate,
  reportEndDate, setReportEndDate,
  reportCategoryFilter, setReportCategoryFilter,
  incomeReportData, operatingReportData, reportLoading,
  overdueReportData, overdueReportLoading,
  overdueSelectedIds, setOverdueSelectedIds,
  showOverdueBatch, setShowOverdueBatch,
  overdueBatchForm, setOverdueBatchForm, overdueBatchSaving,
  overdueBatchProgress, overdueBatchAbortRef,
  quickPayIncome, setQuickPayIncome,
  quickPayForm, setQuickPayForm, quickPaySaving,
  vacancyYear, setVacancyYear, vacancyData, vacancyLoading,
  depositFilter, setDepositFilter,
  fetchIncomeReport, fetchOperatingReport, fetchOverdueReport, fetchVacancyReport,
  openQuickPay, confirmQuickPay, batchConfirmOverdueIncomes,
  contracts, handleDepositAction,
  accounts, reportCategoryOptions,
  switchTab,
}) {
  return (
    <div>
      <div className="no-print flex flex-wrap gap-2 mb-6 border-b border-gray-100 pb-4">
        {ANALYTICS_SUB_LABELS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => switchAnalyticsSub(key)}
            className={`px-4 py-2 text-sm font-medium rounded-lg border transition-colors whitespace-nowrap ${
              analyticsSub === key
                ? 'bg-teal-600 text-white border-teal-600 shadow-sm'
                : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50 hover:border-gray-300'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {analyticsSub === 'income' && (
        <div className="rental-report-print-area">
          <div className="no-print flex items-center gap-3 mb-4 flex-wrap">
            <label htmlFor="f-18" className="text-sm">年份：</label>
            <select id="f-18" value={reportYear} onChange={e => setReportYear(Number(e.target.value))} className="border rounded px-2 py-1.5 text-sm">
              {[new Date().getFullYear(), new Date().getFullYear() - 1, new Date().getFullYear() - 2].map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
            <span className="text-gray-400 text-xs">或</span>
            <label htmlFor="f-96" className="text-sm">日期區間：</label>
            <input id="f-96" type="date" value={reportStartDate} onChange={e => setReportStartDate(e.target.value)} className="border rounded px-2 py-1.5 text-sm" />
            <span className="text-sm">～</span>
            <input type="date" value={reportEndDate} onChange={e => setReportEndDate(e.target.value)} className="border rounded px-2 py-1.5 text-sm" />
            <label htmlFor="f-77" className="text-sm">類別：</label>
            <select id="f-77" value={reportCategoryFilter} onChange={e => setReportCategoryFilter(e.target.value)} className="border rounded px-2 py-1.5 text-sm min-w-[140px]">
              <option value="">全部</option>
              {reportCategoryOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <button onClick={fetchIncomeReport} disabled={reportLoading} className="bg-teal-600 text-white px-3 py-1.5 rounded text-sm hover:bg-teal-700 disabled:opacity-50">查詢</button>
            <button onClick={() => window.print()} className="bg-gray-700 text-white px-3 py-1.5 rounded text-sm hover:bg-gray-800 no-print">列印</button>
          </div>
          <h2 className="text-lg font-bold text-gray-800 mb-2 print:block">租屋收入分析報表 — {incomeReportData.year || reportYear} 年</h2>
          {reportLoading ? (
            <p className="text-gray-500">載入中...</p>
          ) : (
            <div className="bg-white rounded-lg shadow tbl-wrap overflow-y-auto">
              <table className="w-full text-sm border-collapse">
                <thead className="bg-teal-50 sticky top-0 z-10">
                  <tr>
                    <th className="text-center px-2 py-2 border border-gray-200 w-8 text-gray-500">序號</th>
                    <th className="text-left px-3 py-2 border border-gray-200">房號</th>
                    {[1,2,3,4,5,6,7,8,9,10,11,12].map(m => (
                      <th key={m} className="text-right px-2 py-2 border border-gray-200 whitespace-nowrap">{incomeReportData.year || reportYear}/{m}</th>
                    ))}
                    <th className="text-right px-3 py-2 border border-gray-200 font-semibold">總和</th>
                  </tr>
                </thead>
                <tbody>
                  {incomeReportData.rows.length === 0 ? (
                    <tr><td colSpan={15} className="px-3 py-4 text-gray-500 text-center">尚無資料</td></tr>
                  ) : (
                    (() => {
                      const sorted = [
                        ...incomeReportData.rows.filter(r => !r.isTerminated),
                        ...incomeReportData.rows.filter(r => r.isTerminated),
                      ];
                      return sorted.map((r, idx) => (
                      <tr key={r.propertyId} className={r.isTerminated ? 'bg-gray-50/60 opacity-70' : 'hover:bg-gray-50'}>
                        <td className="text-center px-2 py-2 border border-gray-200 text-xs text-gray-400">{r.sortOrder ?? (idx + 1)}</td>
                        <td className="px-3 py-2 border border-gray-200">
                          {r.tenantName ? `${r.propertyLabel}(${r.tenantName})` : r.propertyLabel}
                          {r.isTerminated && <span className="ml-2 text-xs text-gray-400">（已退租）</span>}
                        </td>
                        {[1,2,3,4,5,6,7,8,9,10,11,12].map(m => {
                          const st = r.monthStatus?.[m] || 'empty';
                          const actual = r.months[m] || 0;
                          const expected = r.monthsExpected?.[m] || 0;
                          const cellBg = st === 'completed' ? 'bg-green-50 text-green-800'
                            : st === 'partial' ? 'bg-orange-50 text-orange-800'
                            : st === 'overdue' ? 'bg-red-50 text-red-700'
                            : st === 'pending' ? 'bg-yellow-50 text-yellow-800'
                            : '';
                          return (
                            <td key={m} className={`text-right px-2 py-2 border border-gray-200 align-top ${cellBg}`}>
                              {st === 'completed' && <div className="font-medium">{fmt(actual)}</div>}
                              {st === 'partial' && (
                                <div>
                                  <div className="font-medium">{fmt(actual)}</div>
                                  <div className="text-xs opacity-60">應收 {fmt(expected)}</div>
                                </div>
                              )}
                              {(st === 'pending' || st === 'overdue') && (
                                <div>
                                  <div className="text-xs font-semibold">{st === 'overdue' ? '逾期' : '待收'}</div>
                                  <div className="text-xs">{fmt(expected)}</div>
                                </div>
                              )}
                              {st === 'empty' && ''}
                            </td>
                          );
                        })}
                        <td className="text-right px-3 py-2 border border-gray-200 font-semibold">{fmt(r.total)}</td>
                      </tr>
                    ));
                    })()
                  )}
                </tbody>
                {incomeReportData.rows.length > 0 && (() => {
                  const rows = incomeReportData.rows;
                  const grandTotal = rows.reduce((s, r) => s + (r.total || 0), 0);
                  return (
                    <tfoot className="bg-teal-50 font-semibold text-sm border-t-2 border-teal-300">
                      <tr>
                        <td className="px-2 py-2 border border-gray-200 text-center text-xs text-gray-500">—</td>
                        <td className="px-3 py-2 border border-gray-200 text-teal-800">合計</td>
                        {[1,2,3,4,5,6,7,8,9,10,11,12].map(m => {
                          const sum = rows.reduce((s, r) => s + (r.months?.[m] || 0), 0);
                          return <td key={m} className="text-right px-2 py-2 border border-gray-200 text-teal-800">{sum > 0 ? fmt(sum) : ''}</td>;
                        })}
                        <td className="text-right px-3 py-2 border border-gray-200 text-teal-900">{fmt(grandTotal)}</td>
                      </tr>
                    </tfoot>
                  );
                })()}
              </table>
            </div>
          )}
          {!reportLoading && incomeReportData.rows.length > 0 && (
            <div className="flex flex-wrap gap-3 mt-2 text-xs no-print">
              <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded bg-green-200" />已收</span>
              <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded bg-orange-200" />部分收</span>
              <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded bg-yellow-200" />待收</span>
              <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded bg-red-200" />逾期未收</span>
            </div>
          )}
        </div>
      )}

      {analyticsSub === 'operating' && (
        <div className="rental-report-print-area">
          <div className="no-print flex items-center gap-3 mb-4 flex-wrap">
            <label htmlFor="f-19" className="text-sm">年份：</label>
            <select id="f-19" value={reportYear} onChange={e => setReportYear(Number(e.target.value))} className="border rounded px-2 py-1.5 text-sm">
              {[new Date().getFullYear(), new Date().getFullYear() - 1, new Date().getFullYear() - 2].map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
            <span className="text-gray-400 text-xs">或</span>
            <label htmlFor="f-97" className="text-sm">日期區間：</label>
            <input id="f-97" type="date" value={reportStartDate} onChange={e => setReportStartDate(e.target.value)} className="border rounded px-2 py-1.5 text-sm" />
            <span className="text-sm">～</span>
            <input type="date" value={reportEndDate} onChange={e => setReportEndDate(e.target.value)} className="border rounded px-2 py-1.5 text-sm" />
            <label htmlFor="f-78" className="text-sm">類別：</label>
            <select id="f-78" value={reportCategoryFilter} onChange={e => setReportCategoryFilter(e.target.value)} className="border rounded px-2 py-1.5 text-sm min-w-[140px]">
              <option value="">全部</option>
              {reportCategoryOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <button onClick={fetchOperatingReport} disabled={reportLoading} className="bg-teal-600 text-white px-3 py-1.5 rounded text-sm hover:bg-teal-700 disabled:opacity-50">查詢</button>
            <button onClick={() => window.print()} className="bg-gray-700 text-white px-3 py-1.5 rounded text-sm hover:bg-gray-800 no-print">列印</button>
          </div>
          <h2 className="text-lg font-bold text-gray-800 mb-2 print:block">物業營運狀況分析報表 — {operatingReportData.year || reportYear} 年</h2>
          <p className="text-sm text-gray-600 mb-2 no-print">收租金額、維修、房務稅/地價稅等支出，淨利與淨利率（投報率需物業成本，可於設定中維護後顯示）。</p>
          {reportLoading ? (
            <p className="text-gray-500">載入中...</p>
          ) : (
            <div className="bg-white rounded-lg shadow tbl-wrap">
              <table className="w-full text-sm border-collapse">
                <thead className="bg-teal-50 sticky top-0 z-10">
                  <tr>
                    <th className="text-center px-2 py-2 border border-gray-200 w-8 text-gray-500">序號</th>
                    <th className="text-left px-3 py-2 border border-gray-200">物業</th>
                    <th className="text-right px-3 py-2 border border-gray-200">租金實收</th>
                    <th className="text-right px-3 py-2 border border-gray-200">水電實收</th>
                    <th className="text-right px-3 py-2 border border-gray-200">維修金額</th>
                    <th className="text-right px-3 py-2 border border-gray-200">房務稅/地價稅</th>
                    <th className="text-right px-3 py-2 border border-gray-200">總支出</th>
                    <th className="text-right px-3 py-2 border border-gray-200">淨利</th>
                    <th className="text-right px-3 py-2 border border-gray-200">淨利率 %</th>
                  </tr>
                </thead>
                <tbody>
                  {operatingReportData.rows.length === 0 ? (
                    <tr><td colSpan={9} className="px-3 py-4 text-gray-500 text-center">尚無資料</td></tr>
                  ) : (
                    operatingReportData.rows.map((r, idx) => (
                      <tr key={r.propertyId} className="hover:bg-gray-50">
                        <td className="text-center px-2 py-2 border border-gray-200 text-xs text-gray-400">{r.sortOrder ?? (idx + 1)}</td>
                        <td className="px-3 py-2 border border-gray-200">{r.propertyLabel}</td>
                        <td className="text-right px-3 py-2 border border-gray-200">{fmt(r.rentOnly ?? r.rentIncome)}</td>
                        <td className="text-right px-3 py-2 border border-gray-200">{r.utilityIncome > 0 ? fmt(r.utilityIncome) : <span className="text-gray-300">—</span>}</td>
                        <td className="text-right px-3 py-2 border border-gray-200">{fmt(r.maintenanceAmount)}</td>
                        <td className="text-right px-3 py-2 border border-gray-200">{fmt(r.taxAmount)}</td>
                        <td className="text-right px-3 py-2 border border-gray-200">{fmt(r.totalExpense)}</td>
                        <td className={`text-right px-3 py-2 border border-gray-200 font-medium ${r.netProfit >= 0 ? 'text-green-700' : 'text-red-700'}`}>{fmt(r.netProfit)}</td>
                        <td className="text-right px-3 py-2 border border-gray-200">{r.profitMarginPercent != null ? `${r.profitMarginPercent}%` : '-'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
                {operatingReportData.rows.length > 0 && (() => {
                  const rows = operatingReportData.rows;
                  const sumRent     = rows.reduce((s, r) => s + (r.rentOnly ?? r.rentIncome ?? 0), 0);
                  const sumUtility  = rows.reduce((s, r) => s + (r.utilityIncome || 0), 0);
                  const sumMaint    = rows.reduce((s, r) => s + (r.maintenanceAmount || 0), 0);
                  const sumTax      = rows.reduce((s, r) => s + (r.taxAmount || 0), 0);
                  const sumExpense  = rows.reduce((s, r) => s + (r.totalExpense || 0), 0);
                  const sumProfit   = rows.reduce((s, r) => s + (r.netProfit || 0), 0);
                  const sumIncome   = sumRent + sumUtility;
                  const totalMargin = sumIncome > 0 ? Math.round((sumProfit / sumIncome) * 10000) / 100 : null;
                  return (
                    <tfoot className="bg-teal-50 font-semibold text-sm border-t-2 border-teal-300">
                      <tr>
                        <td className="px-2 py-2 border border-gray-200 text-center text-xs text-gray-500">—</td>
                        <td className="px-3 py-2 border border-gray-200 text-teal-800">合計</td>
                        <td className="text-right px-3 py-2 border border-gray-200 text-teal-800">{fmt(sumRent)}</td>
                        <td className="text-right px-3 py-2 border border-gray-200 text-teal-800">{sumUtility > 0 ? fmt(sumUtility) : <span className="text-gray-300">—</span>}</td>
                        <td className="text-right px-3 py-2 border border-gray-200 text-teal-800">{fmt(sumMaint)}</td>
                        <td className="text-right px-3 py-2 border border-gray-200 text-teal-800">{fmt(sumTax)}</td>
                        <td className="text-right px-3 py-2 border border-gray-200 text-teal-800">{fmt(sumExpense)}</td>
                        <td className={`text-right px-3 py-2 border border-gray-200 ${sumProfit >= 0 ? 'text-green-700' : 'text-red-700'}`}>{fmt(sumProfit)}</td>
                        <td className="text-right px-3 py-2 border border-gray-200 text-teal-800">{totalMargin != null ? `${totalMargin}%` : '-'}</td>
                      </tr>
                    </tfoot>
                  );
                })()}
              </table>
            </div>
          )}
        </div>
      )}

      {analyticsSub === 'overdue' && (
        <div className="rental-report-print-area">
          <div className="no-print flex items-center gap-3 mb-4 flex-wrap">
            <h3 className="text-base font-semibold text-gray-800">逾期租金催繳報表</h3>
            <span className="text-sm text-gray-500">（所有到期日已過、尚未收款的租金）</span>
            <button onClick={fetchOverdueReport} disabled={overdueReportLoading}
              className="bg-teal-600 text-white px-3 py-1.5 rounded text-sm hover:bg-teal-700 disabled:opacity-50 ml-auto">
              {overdueReportLoading ? '載入中…' : '重新整理'}
            </button>
            <button onClick={() => window.print()} className="bg-gray-700 text-white px-3 py-1.5 rounded text-sm hover:bg-gray-800">列印 / 匯出</button>
          </div>
          <h2 className="hidden print:block text-lg font-bold mb-2">逾期租金催繳報表 — 列印日期：{new Date().toLocaleDateString('zh-TW')}</h2>

          {overdueReportLoading ? (
            <p className="text-gray-500 py-6 text-center">載入中…</p>
          ) : overdueReportData.length === 0 ? (
            <div className="bg-white rounded-lg shadow py-12 text-center text-gray-400">
              目前沒有逾期未收的租金
            </div>
          ) : (
            <>
              <div className="no-print flex flex-wrap gap-3 mb-3 items-center text-sm">
                <span className="bg-red-50 text-red-700 px-3 py-1.5 rounded-lg font-medium">
                  共 {overdueReportData.length} 筆逾期
                </span>
                <span className="bg-red-50 text-red-700 px-3 py-1.5 rounded-lg">
                  逾期總金額：<b>${fmt(overdueReportData.reduce((s, i) => s + Number(i.expectedAmount || 0), 0))}</b>
                </span>
                {overdueSelectedIds.size > 0 && (
                  <button onClick={() => setShowOverdueBatch(true)}
                    className="ml-auto px-4 py-1.5 bg-teal-600 text-white rounded-lg font-medium hover:bg-teal-700">
                    批次收款（{overdueSelectedIds.size} 筆）
                  </button>
                )}
              </div>

              {/* 批次收款 panel */}
              {showOverdueBatch && (
                <div className="no-print mb-3 bg-teal-50 border border-teal-200 rounded-xl p-4">
                  <div className="flex flex-wrap gap-3 items-end">
                    <div>
                      <label htmlFor="f-20" className="text-xs text-gray-600 block mb-1">收款日期 *</label>
                      <input id="f-20" type="date" value={overdueBatchForm.actualDate}
                        onChange={e => setOverdueBatchForm(f => ({ ...f, actualDate: e.target.value }))}
                        className="border rounded px-2 py-1.5 text-sm" />
                    </div>
                    <div>
                      <label htmlFor="f-21" className="text-xs text-gray-600 block mb-1">收款帳戶 *</label>
                      <select id="f-21" value={overdueBatchForm.accountId}
                        onChange={e => {
                          const acct = accounts.find(a => String(a.id) === e.target.value);
                          const autoMethod = acct?.type === '現金' ? '現金' : acct?.type === '銀行存款' ? '匯款' : null;
                          setOverdueBatchForm(f => ({ ...f, accountId: e.target.value, ...(autoMethod ? { paymentMethod: autoMethod } : {}) }));
                        }}
                        className="border rounded px-2 py-1.5 text-sm min-w-[160px]">
                        <option value="">-- 選擇帳戶 --</option>
                        {accounts.map(a => <option key={a.id} value={String(a.id)}>{a.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label htmlFor="f-79" className="text-xs text-gray-600 block mb-1">付款方式</label>
                      <select id="f-79" value={overdueBatchForm.paymentMethod}
                        onChange={e => setOverdueBatchForm(f => ({ ...f, paymentMethod: e.target.value }))}
                        className="border rounded px-2 py-1.5 text-sm">
                        {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m === 'transfer' ? '轉帳' : m}</option>)}
                      </select>
                    </div>
                    <button onClick={batchConfirmOverdueIncomes} disabled={overdueBatchSaving}
                      className="px-4 py-1.5 bg-teal-600 text-white rounded-lg text-sm font-medium hover:bg-teal-700 disabled:opacity-50">
                      {overdueBatchSaving && overdueBatchProgress ? `${overdueBatchProgress.done}/${overdueBatchProgress.total}` : overdueBatchSaving ? '處理中…' : `確認收款 ${overdueSelectedIds.size} 筆`}
                    </button>
                    {overdueBatchSaving && overdueBatchProgress
                      ? <button onClick={() => { overdueBatchAbortRef.current = true; }} className="text-xs text-red-500 hover:underline self-center">中止</button>
                      : <button onClick={() => { setShowOverdueBatch(false); setOverdueSelectedIds(new Set()); }}
                          className="text-xs text-gray-500 hover:text-gray-700">取消</button>
                    }
                    {overdueBatchSaving && overdueBatchProgress && (
                      <div className="w-full mt-2">
                        <div className="flex justify-between text-xs text-gray-500 mb-1">
                          <span>已完成 {overdueBatchProgress.done}/{overdueBatchProgress.total}{overdueBatchProgress.failed > 0 && <span className="text-red-500 ml-1.5">失敗 {overdueBatchProgress.failed}</span>}</span>
                          <span>{Math.round(overdueBatchProgress.done / overdueBatchProgress.total * 100)}%</span>
                        </div>
                        <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                          <div className="h-full bg-teal-500 transition-all duration-200"
                            style={{ width: `${overdueBatchProgress.done / overdueBatchProgress.total * 100}%` }} />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
              <div className="bg-white rounded-lg shadow tbl-wrap">
                <table className="w-full text-sm border-collapse">
                  <thead className="bg-red-50 sticky top-0 z-10">
                    <tr>
                      <th className="text-center px-2 py-2 border border-gray-200 w-8 no-print">
                        <input type="checkbox"
                          checked={overdueSelectedIds.size === overdueReportData.length && overdueReportData.length > 0}
                          onChange={e => setOverdueSelectedIds(e.target.checked ? new Set(overdueReportData.map(i => i.id)) : new Set())} />
                      </th>
                      <th className="text-center px-2 py-2 border border-gray-200 w-8 text-gray-500">序號</th>
                      <th className="text-left px-3 py-2 border border-gray-200">物業</th>
                      <th className="text-left px-3 py-2 border border-gray-200">租客</th>
                      <th className="text-left px-3 py-2 border border-gray-200">聯絡電話</th>
                      <th className="text-center px-3 py-2 border border-gray-200">租期</th>
                      <th className="text-right px-3 py-2 border border-gray-200">應收金額</th>
                      <th className="text-center px-3 py-2 border border-gray-200">到期日</th>
                      <th className="text-right px-3 py-2 border border-gray-200 text-red-700">逾期天數</th>
                      <th className="text-center px-3 py-2 border border-gray-200 no-print">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {overdueReportData.map((i, idx) => {
                      const today = todayStr();
                      const daysOverdue = Math.floor((new Date(today) - new Date(i.dueDate)) / 86400000);
                      const tenantPhone = i.tenant?.phone || '—';
                      const tenantName = i.tenantName || (i.tenant?.tenantType === 'company' ? i.tenant?.companyName : i.tenant?.fullName) || '—';
                      return (
                        <tr key={i.id} className={`border-t ${overdueSelectedIds.has(i.id) ? 'bg-teal-50' : idx % 2 === 0 ? 'bg-white' : 'bg-red-50/30'}`}>
                          <td className="text-center px-2 py-2 border border-gray-200 no-print">
                            <input type="checkbox" checked={overdueSelectedIds.has(i.id)}
                              onChange={e => setOverdueSelectedIds(prev => { const n = new Set(prev); e.target.checked ? n.add(i.id) : n.delete(i.id); return n; })} />
                          </td>
                          <td className="text-center px-2 py-2 border border-gray-200 text-xs text-gray-400">{i.contractSortOrder ?? (idx + 1)}</td>
                          <td className="px-3 py-2 border border-gray-200">{i.propertyName}</td>
                          <td className="px-3 py-2 border border-gray-200 font-medium">{tenantName}</td>
                          <td className="px-3 py-2 border border-gray-200 text-gray-600">{tenantPhone}</td>
                          <td className="px-3 py-2 border border-gray-200 text-center text-gray-500">{i.incomeYear}/{String(i.incomeMonth).padStart(2,'0')}</td>
                          <td className="px-3 py-2 border border-gray-200 text-right font-medium">${fmt(i.expectedAmount)}</td>
                          <td className="px-3 py-2 border border-gray-200 text-center">{i.dueDate}</td>
                          <td className="px-3 py-2 border border-gray-200 text-right">
                            <span className={`px-2 py-0.5 rounded text-xs font-semibold ${daysOverdue > 30 ? 'bg-red-200 text-red-800' : 'bg-orange-100 text-orange-800'}`}>
                              {daysOverdue} 天
                            </span>
                          </td>
                          <td className="px-3 py-2 border border-gray-200 text-center no-print">
                            <button onClick={() => openQuickPay(i)}
                              className="px-3 py-1 bg-teal-600 text-white text-xs rounded hover:bg-teal-700">
                              收款
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                    <tr className="bg-red-100 font-semibold">
                      <td className="px-3 py-2 border border-gray-200" colSpan={5}>合計</td>
                      <td className="px-3 py-2 border border-gray-200 text-right text-red-700">${fmt(overdueReportData.reduce((s, i) => s + Number(i.expectedAmount || 0), 0))}</td>
                      <td className="px-3 py-2 border border-gray-200" colSpan={3}></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {analyticsSub === 'deposit' && (() => {
        const depositContracts = contracts.filter(c => Number(c.depositAmount) > 0);
        const filtered = depositFilter === 'all' ? depositContracts
          : depositFilter === 'pending_receive' ? depositContracts.filter(c => !c.depositReceived)
          : depositFilter === 'received' ? depositContracts.filter(c => c.depositReceived && !c.depositRefunded)
          : depositFilter === 'refunded' ? depositContracts.filter(c => c.depositRefunded)
          : depositContracts;
        const totalHeld = depositContracts.filter(c => c.depositReceived && !c.depositRefunded)
          .reduce((s, c) => s + Number(c.depositAmount || 0), 0);
        const pendingReceive = depositContracts.filter(c => !c.depositReceived).length;
        const pendingRefund = depositContracts.filter(c => c.depositRefundPaymentOrderId && !c.depositRefunded).length;
        return (
          <div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              <div className="bg-white rounded-lg shadow p-3 border-l-4 border-teal-500">
                <p className="text-xs text-gray-500">合約筆數</p>
                <p className="text-xl font-bold text-teal-700">{depositContracts.length}</p>
              </div>
              <div className="bg-white rounded-lg shadow p-3 border-l-4 border-green-500">
                <p className="text-xs text-gray-500">目前持有押金</p>
                <p className="text-xl font-bold text-green-700">${fmt(totalHeld)}</p>
              </div>
              <div className="bg-white rounded-lg shadow p-3 border-l-4 border-blue-500">
                <p className="text-xs text-gray-500">待收押金</p>
                <p className="text-xl font-bold text-blue-700">{pendingReceive} 筆</p>
              </div>
              <div className="bg-white rounded-lg shadow p-3 border-l-4 border-orange-500">
                <p className="text-xs text-gray-500">待退押金（已申請）</p>
                <p className="text-xl font-bold text-orange-700">{pendingRefund} 筆</p>
              </div>
            </div>
            <div className="flex gap-2 mb-3">
              {[['all', '全部'], ['pending_receive', '待收押金'], ['received', '已收持有中'], ['refunded', '已退']].map(([v, l]) => (
                <button key={v} onClick={() => setDepositFilter(v)}
                  className={`text-sm px-3 py-1 rounded-full border ${depositFilter === v ? 'bg-teal-600 text-white border-teal-600' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>{l}</button>
              ))}
            </div>
            <div className="bg-white rounded-lg shadow tbl-wrap">
              <table className="w-full text-sm">
                <thead className="bg-teal-50 sticky top-0 z-10">
                  <tr>
                    <th className="text-center px-2 py-2 w-8 text-gray-500">序號</th>
                    <th className="text-left px-3 py-2">合約號</th>
                    <th className="text-left px-3 py-2">物業</th>
                    <th className="text-left px-3 py-2">租客</th>
                    <th className="text-left px-3 py-2">合約期間</th>
                    <th className="text-right px-3 py-2">月租</th>
                    <th className="text-right px-3 py-2">押金金額</th>
                    <th className="text-center px-3 py-2">收款</th>
                    <th className="text-center px-3 py-2">退款</th>
                    <th className="text-center px-3 py-2">合約狀態</th>
                    <th className="text-center px-3 py-2">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr><td colSpan={11} className="text-center py-8 text-gray-400">暫無資料</td></tr>
                  ) : filtered.map((c, idx) => (
                    <tr key={c.id} className={`border-t hover:bg-gray-50 ${!c.depositReceived ? 'bg-blue-50/30' : c.depositRefunded ? 'bg-gray-50' : ''}`}>
                      <td className="text-center px-2 py-2 text-xs text-gray-400">{idx + 1}</td>
                      <td className="px-3 py-2 font-mono text-xs">{c.contractNo}</td>
                      <td className="px-3 py-2">{c.propertyName}</td>
                      <td className="px-3 py-2">{c.tenantName}</td>
                      <td className="px-3 py-2 text-xs text-gray-500">{c.startDate} ~ {c.endDate}</td>
                      <td className="px-3 py-2 text-right">${fmt(c.monthlyRent)}</td>
                      <td className="px-3 py-2 text-right font-semibold text-teal-700">${fmt(c.depositAmount)}</td>
                      <td className="px-3 py-2 text-center">
                        {c.depositReceived
                          ? <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">已收</span>
                          : <button onClick={() => handleDepositAction(c.id, 'depositReceive')} className="text-xs text-blue-600 hover:underline">收押金</button>}
                      </td>
                      <td className="px-3 py-2 text-center">
                        {c.depositRefunded
                          ? <span className="text-xs bg-gray-200 text-gray-600 px-2 py-0.5 rounded">已退</span>
                          : c.depositRefundPaymentOrderId
                            ? <Link href="/cashier" className="text-xs text-teal-600 hover:underline">待出納</Link>
                            : c.depositReceived
                              ? <button onClick={() => handleDepositAction(c.id, 'depositRefund')} className="text-xs text-orange-600 hover:underline">退押金</button>
                              : <span className="text-gray-300 text-xs">—</span>}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <StatusBadge value={getContractDisplayStatus(c)} list={CONTRACT_STATUSES} />
                      </td>
                      <td className="px-3 py-2 text-center">
                        <button onClick={() => { switchTab('contracts'); }} className="text-xs text-teal-600 hover:underline">查看合約</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                {filtered.length > 0 && (
                  <tfoot>
                    <tr className="bg-teal-50 font-semibold">
                      <td colSpan={6} className="px-3 py-2 text-sm">合計</td>
                      <td className="px-3 py-2 text-right text-teal-700">${fmt(filtered.reduce((s, c) => s + Number(c.depositAmount || 0), 0))}</td>
                      <td colSpan={4} />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        );
      })()}

      {analyticsSub === 'vacancy' && (
        <div>
          <div className="flex flex-wrap items-center gap-3 mb-4 no-print">
            <label htmlFor="f-22" className="text-sm">年份：</label>
            <select id="f-22" value={vacancyYear} onChange={e => setVacancyYear(Number(e.target.value))} className="border rounded px-2 py-1.5 text-sm">
              {[new Date().getFullYear(), new Date().getFullYear() - 1, new Date().getFullYear() - 2].map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
            <button onClick={fetchVacancyReport} disabled={vacancyLoading} className="bg-teal-600 text-white px-3 py-1.5 rounded text-sm hover:bg-teal-700 disabled:opacity-50">查詢</button>
            <button onClick={() => window.print()} className="bg-gray-700 text-white px-3 py-1.5 rounded text-sm hover:bg-gray-800 no-print">列印</button>
          </div>

          {vacancyLoading ? (
            <p className="text-gray-500 text-center py-8">載入中…</p>
          ) : (
            <>
              {vacancyData.rows.length > 0 && (
                <div className="grid grid-cols-3 gap-3 mb-4">
                  <div className="bg-white rounded-lg shadow p-3 border-l-4 border-teal-500">
                    <p className="text-xs text-gray-500">物業總數</p>
                    <p className="text-xl font-bold text-teal-700">{vacancyData.rows.length}</p>
                  </div>
                  <div className="bg-white rounded-lg shadow p-3 border-l-4 border-green-500">
                    <p className="text-xs text-gray-500">全年出租</p>
                    <p className="text-xl font-bold text-green-700">{vacancyData.fullyRented} 間</p>
                  </div>
                  <div className="bg-white rounded-lg shadow p-3 border-l-4 border-red-500">
                    <p className="text-xs text-gray-500">平均空置率</p>
                    <p className="text-xl font-bold text-red-700">{vacancyData.avgVacancy}%</p>
                  </div>
                </div>
              )}
              <div className="bg-white rounded-lg shadow tbl-wrap">
                <table className="w-full text-sm border-collapse">
                  <thead className="bg-teal-50 sticky top-0 z-10">
                    <tr>
                      <th className="text-center px-2 py-2 border border-gray-200 w-8 text-gray-500">序號</th>
                      <th className="text-left px-3 py-2 border border-gray-200">物業</th>
                      {[1,2,3,4,5,6,7,8,9,10,11,12].map(m => (
                        <th key={m} className="text-center px-2 py-2 border border-gray-200 text-xs w-10">{m}月</th>
                      ))}
                      <th className="text-right px-3 py-2 border border-gray-200">出租月數</th>
                      <th className="text-right px-3 py-2 border border-gray-200 text-red-700">空置率</th>
                      <th className="text-right px-3 py-2 border border-gray-200">平均月租</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vacancyData.rows.length === 0 ? (
                      <tr><td colSpan={17} className="text-center py-8 text-gray-400">暫無資料，請點擊查詢</td></tr>
                    ) : vacancyData.rows.map((r, idx) => (
                      <tr key={r.propertyId} className="hover:bg-gray-50">
                        <td className="text-center px-2 py-2 border border-gray-200 text-xs text-gray-400">{idx + 1}</td>
                        <td className="px-3 py-2 border border-gray-200 font-medium">{r.propertyLabel}</td>
                        {r.monthRented.map((rented, idx) => (
                          <td key={idx} className={`border border-gray-200 text-center text-xs ${rented ? 'bg-green-100 text-green-800' : 'bg-red-50 text-red-400'}`}>
                            {rented ? '●' : '○'}
                          </td>
                        ))}
                        <td className="px-3 py-2 border border-gray-200 text-right font-semibold">{r.rentedCount}</td>
                        <td className={`px-3 py-2 border border-gray-200 text-right font-bold ${r.vacancyRate === 0 ? 'text-green-600' : r.vacancyRate >= 50 ? 'text-red-600' : 'text-yellow-600'}`}>
                          {r.vacancyRate}%
                        </td>
                        <td className="px-3 py-2 border border-gray-200 text-right text-gray-600">
                          {r.avgRent > 0 ? `$${fmt(r.avgRent)}` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {vacancyData.rows.length > 0 && (
                <div className="flex gap-4 mt-2 text-xs no-print">
                  <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded bg-green-200" />出租中</span>
                  <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded bg-red-100" />空置</span>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
