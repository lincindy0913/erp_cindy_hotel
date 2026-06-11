'use client';

import Link from 'next/link';
import { formatCurrency } from '@/lib/format-utils';
import FetchErrorBanner from '@/components/FetchErrorBanner';

const MONTH_NAMES = [
  '一月', '二月', '三月', '四月', '五月', '六月',
  '七月', '八月', '九月', '十月', '十一月', '十二月'
];

export default function RolloverTab({
  selectedYear,
  isYearCompleted,
  yearRecord,
  // Rollover hook state
  validating,
  validationResult,
  backupReady,
  previewData,
  previewLoading,
  previewError,
  fetchPreview,
  step,
  setStep,
  confirmText,
  setConfirmText,
  executing,
  executionResult,
  handleValidate,
  handleExecute,
  handleReset,
  handleViewStatement,
  ignoreNegativeStock,
  setIgnoreNegativeStock,
}) {
  const expectedConfirmText = `確認結轉 ${selectedYear} 年度`;

  // Already completed (from records), no executionResult
  if (isYearCompleted && !executionResult) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-green-200 p-6">
        <div className="flex items-center gap-3">
          <svg className="w-8 h-8 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div>
            <p className="text-green-800 font-bold text-lg">{selectedYear} 年度已完成結轉</p>
            <p className="text-green-600 text-sm">
              由 {yearRecord?.rolledOverBy || '-'} 於 {yearRecord?.rolledOverAt ? new Date(yearRecord.rolledOverAt).toLocaleString('zh-TW') : '-'} 執行
            </p>
          </div>
        </div>
        <p className="text-sm text-gray-500 mt-3">
          請在上方歷史紀錄表中點選「展開詳情」查看庫存快照、帳戶餘額及財務報表。
        </p>
      </div>
    );
  }

  return (
    <>
      {/* ── Rollover Steps ── */}
      {!isYearCompleted && !executionResult?.success && (
        <div className="bg-white rounded-xl shadow-sm border border-violet-200">
          <div className="px-6 py-4 border-b border-violet-100">
            <h3 className="text-lg font-semibold text-violet-800">{selectedYear} 年度結轉</h3>
            <p className="text-sm text-gray-500 mt-1">依序完成前置驗證、預覽確認及結轉執行</p>
          </div>

          <div className="px-6 py-4">
            {/* Step indicator */}
            <div className="flex items-center gap-2 mb-6">
              {[
                { num: 1, label: '驗證前置條件' },
                { num: 2, label: '預覽確認' },
                { num: 3, label: '執行結轉' }
              ].map((s, i) => (
                <div key={s.num} className="flex items-center">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                    step >= s.num ? 'bg-violet-600 text-white' : 'bg-gray-200 text-gray-500'
                  }`}>
                    {step > s.num ? (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    ) : s.num}
                  </div>
                  <span className={`ml-2 text-sm ${step >= s.num ? 'text-violet-700 font-medium' : 'text-gray-400'}`}>
                    {s.label}
                  </span>
                  {i < 2 && <div className={`w-12 h-0.5 mx-3 ${step > s.num ? 'bg-violet-400' : 'bg-gray-200'}`}></div>}
                </div>
              ))}
            </div>

            {/* Step 1: Validate */}
            {step === 1 && (
              <div className="space-y-4">
                <div className="text-center py-6">
                  <div className="w-16 h-16 mx-auto mb-4 bg-violet-100 rounded-full flex items-center justify-center">
                    <svg className="w-8 h-8 text-violet-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
                  </div>
                  <h4 className="text-lg font-semibold text-gray-800">驗證前置條件</h4>
                  <p className="text-sm text-gray-500 mt-1">檢查所有月份是否已鎖定、未沖銷發票及未兌現支票</p>
                </div>

                <div className="text-center">
                  <button
                    onClick={handleValidate}
                    disabled={validating}
                    className="px-6 py-3 bg-violet-600 text-white rounded-lg hover:bg-violet-700 transition-colors font-medium disabled:opacity-50"
                  >
                    {validating ? (
                      <span className="flex items-center gap-2">
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                        驗證中...
                      </span>
                    ) : '開始驗證'}
                  </button>
                </div>

                {backupReady === false && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
                    <p className="text-sm font-medium text-red-800">警告：近7天內無全量備份</p>
                    <p className="text-xs text-red-600 mt-1">建議在執行年度結轉前進行 Tier 1 全量備份</p>
                    <Link href="/admin/backup" className="text-xs text-blue-600 hover:underline mt-2 inline-block">前往備份管理 →</Link>
                  </div>
                )}

                {validationResult && !validationResult.valid && (
                  <div className="space-y-4 mt-6">
                    {validationResult.alreadyCompleted && (
                      <div className="space-y-3">
                        <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-center gap-3">
                          <svg className="w-6 h-6 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          <span className="text-green-700 font-medium">{selectedYear} 年度已完成結轉，各帳戶期初餘額已結轉至 {selectedYear + 1} 年。</span>
                        </div>
                        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800 space-y-1">
                          <p className="font-semibold">⚠ 年結後修改去年帳務的正確流程：</p>
                          <ul className="list-disc ml-4 space-y-0.5 text-amber-700">
                            <li>至<strong>月結管理</strong>（/month-end）解鎖對應月份（需填寫原因，系統留稽核記錄）</li>
                            <li>完成修改後重新執行該月月結並鎖定</li>
                            <li>若為金額調整，可改走<strong>沖銷流程</strong>（現金流交易 → 操作 → 沖銷）無需解鎖</li>
                            <li>請勿直接修改去年已鎖定月份交易，系統會擋住並要求先解鎖</li>
                          </ul>
                        </div>
                      </div>
                    )}

                    {!validationResult.alreadyCompleted && validationResult.blockers?.length > 0 && (
                      <div className="bg-red-50 border-2 border-red-300 rounded-lg p-4">
                        <div className="flex items-center justify-between gap-2 mb-3">
                          <div className="flex items-center gap-2">
                            <svg className="w-5 h-5 text-red-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                            </svg>
                            <h4 className="text-sm font-bold text-red-800">
                              驗證未通過 — 請先解決以下 {validationResult.blockers.length} 個問題
                            </h4>
                          </div>
                          <button
                            onClick={() => window.print()}
                            className="text-xs px-2.5 py-1 border border-red-300 text-red-600 rounded-lg hover:bg-red-100 shrink-0 no-print"
                          >
                            列印清單
                          </button>
                        </div>
                        <ul className="space-y-3">
                          {validationResult.blockers.map((b, i) => {
                            const blockerLink = (() => {
                              if (b.includes('尚未月結') || b.includes('月份')) return { href: '/month-end', label: '前往月結' };
                              if (b.includes('VAT') || b.includes('申報')) return { href: '/sales', label: '前往發票申報' };
                              if (b.includes('對帳') || b.includes('銀行帳戶')) return { href: '/bank-reconciliation', label: '前往存簿核對' };
                              return null;
                            })();
                            return (
                              <li key={i} className="flex items-start gap-2 text-sm text-red-700">
                                <span className="mt-0.5 shrink-0 font-bold text-red-500">{i + 1}.</span>
                                <div className="flex-1">
                                  <span>{b}</span>
                                  {blockerLink && (
                                    <Link
                                      href={blockerLink.href}
                                      className="ml-2 text-xs px-2 py-0.5 bg-red-600 text-white rounded hover:bg-red-700 font-medium whitespace-nowrap"
                                    >
                                      {blockerLink.label} →
                                    </Link>
                                  )}
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    )}

                    {validationResult.monthStatuses && validationResult.monthStatuses.length > 0 && (
                      <div>
                        <h4 className="text-sm font-semibold text-gray-700 mb-3">月結狀態確認（12個月 x 各館別）</h4>
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs border-collapse">
                            <thead className="sticky top-0 z-10 bg-violet-50">
                              <tr className="bg-violet-50">
                                <th className="text-left p-2 border border-violet-200">月份</th>
                                {validationResult.monthStatuses[0]?.warehouses?.map((w, i) => (
                                  <th key={i} className="text-center p-2 border border-violet-200">{w.warehouseName}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {validationResult.monthStatuses.map((ms) => (
                                <tr key={ms.month} className="hover:bg-gray-50">
                                  <td className="p-2 border border-gray-200 font-medium">{MONTH_NAMES[ms.month - 1]}</td>
                                  {ms.warehouses.map((w, i) => (
                                    <td key={i} className="text-center p-2 border border-gray-200">
                                      {w.isLocked ? (
                                        <svg className="w-5 h-5 text-green-500 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                        </svg>
                                      ) : w.isClosed ? (
                                        <div className="flex flex-col items-center">
                                          <svg className="w-5 h-5 text-yellow-500 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                          </svg>
                                          <span className="text-yellow-600 text-xs mt-0.5">已結帳</span>
                                        </div>
                                      ) : (
                                        <div className="flex flex-col items-center">
                                          <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                          </svg>
                                          <span className="text-red-500 text-xs mt-0.5">{w.status}</span>
                                        </div>
                                      )}
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {validationResult.warnings && validationResult.warnings.length > 0 && (
                      <div className="space-y-2">
                        <h4 className="text-sm font-semibold text-gray-700">注意事項</h4>
                        {validationResult.warnings.map((w, i) => (
                          <div
                            key={i}
                            className={`flex items-start gap-3 p-3 rounded-lg border ${
                              w.type === 'error' ? 'bg-red-50 border-red-200' : 'bg-yellow-50 border-yellow-200'
                            }`}
                          >
                            <svg className={`w-5 h-5 flex-shrink-0 mt-0.5 ${w.type === 'error' ? 'text-red-500' : 'text-yellow-500'}`}
                              fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.268 16.5c-.77.833.192 2.5 1.732 2.5z" />
                            </svg>
                            <div>
                              <p className={`text-sm font-medium ${w.type === 'error' ? 'text-red-700' : 'text-yellow-700'}`}>
                                {w.message}
                              </p>
                              {w.details && (
                                <ul className="mt-1 text-xs text-gray-600 list-disc list-inside">
                                  {w.details.map((d, j) => <li key={j}>{d}</li>)}
                                </ul>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {!validationResult.alreadyCompleted && (() => {
                      const hasNegativeStockBlocker = validationResult.blockers?.some(b => b.includes('庫存為負數'));
                      const otherBlockersCount = (validationResult.blockers?.length ?? 0) - (hasNegativeStockBlocker ? 1 : 0);
                      return (
                        <>
                          {hasNegativeStockBlocker && (
                            <label className="flex items-start gap-3 bg-orange-50 border border-orange-300 rounded-lg p-3 cursor-pointer select-none">
                              <input
                                type="checkbox"
                                checked={ignoreNegativeStock}
                                onChange={e => setIgnoreNegativeStock(e.target.checked)}
                                className="mt-0.5 h-4 w-4 rounded border-orange-400 accent-orange-600 cursor-pointer"
                              />
                              <span className="text-sm text-orange-800">
                                <strong>忽略負庫存並繼續（管理員確認）：</strong>
                                我已確認負庫存屬已知盤點誤差，同意在期初庫存值可能不準確的情況下執行年結。
                                {otherBlockersCount > 0 && <span className="block mt-1 text-orange-600 font-medium">注意：仍有 {otherBlockersCount} 個其他阻擋事項需先解決。</span>}
                              </span>
                            </label>
                          )}
                          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800">
                            <strong>提醒：</strong>請解決上述所有阻擋事項後重新驗證，才能執行年度結轉。
                          </div>
                        </>
                      );
                    })()}
                  </div>
                )}
              </div>
            )}

            {/* Step 2: Preview */}
            {step === 2 && validationResult && (
              <div className="space-y-6">
                <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-center gap-3">
                  <svg className="w-6 h-6 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <div>
                    <p className="text-green-800 font-medium">前置條件驗證通過</p>
                    <p className="text-green-600 text-sm">所有月份已結帳／鎖定，可以進行年度結轉</p>
                  </div>
                </div>

                {previewError && (
                  <FetchErrorBanner message={previewError} onRetry={fetchPreview} />
                )}

                {previewLoading && (
                  <div className="flex items-center justify-center py-8 text-gray-500 text-sm gap-2">
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-violet-600"></div>
                    計算預覽數字中…
                  </div>
                )}

                {!previewLoading && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* Inventory preview */}
                    <div className="border border-violet-200 rounded-lg p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <div className="w-8 h-8 bg-violet-100 rounded-lg flex items-center justify-center">
                          <svg className="w-5 h-5 text-violet-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                          </svg>
                        </div>
                        <h4 className="font-medium text-violet-700">庫存結轉</h4>
                      </div>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-gray-500">在庫商品數</span>
                          <span className="font-medium">{previewData?.inventory.productCount ?? validationResult.summary?.warehouseCount ?? '—'}</span>
                        </div>
                        <div className="flex justify-between items-start">
                          <span className="text-gray-500">期末存貨總值</span>
                          <div className="text-right">
                            <span className="font-medium text-violet-700">{previewData ? formatCurrency(previewData.inventory.closingValue) : '—'}</span>
                            {previewData && <p className="text-xs text-violet-400 mt-0.5">→ {selectedYear + 1} 年期初庫存值</p>}
                          </div>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500">負庫存商品</span>
                          <span className={`font-medium ${(previewData?.inventory.negativeCount ?? validationResult.summary?.negativeInventoryCount ?? 0) > 0 ? 'text-red-600' : 'text-green-600'}`}>
                            {previewData?.inventory.negativeCount ?? validationResult.summary?.negativeInventoryCount ?? 0}
                          </span>
                        </div>
                      </div>
                      <p className="text-xs text-gray-400 mt-3">將對所有庫存商品建立結存快照</p>
                    </div>

                    {/* Cash accounts preview */}
                    <div className="border border-violet-200 rounded-lg p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <div className="w-8 h-8 bg-emerald-100 rounded-lg flex items-center justify-center">
                          <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        </div>
                        <h4 className="font-medium text-emerald-700">現金帳戶結轉</h4>
                      </div>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between items-start">
                          <span className="text-gray-500">期末現金合計</span>
                          <div className="text-right">
                            <span className="font-medium text-emerald-700">{previewData ? formatCurrency(previewData.totalCashBalance) : '—'}</span>
                            {previewData && <p className="text-xs text-emerald-400 mt-0.5">→ {selectedYear + 1} 年期初餘額</p>}
                          </div>
                        </div>
                        {previewData?.cashAccounts.slice(0, 4).map(a => (
                          <div key={a.id} className="flex justify-between text-xs text-gray-500">
                            <span className="truncate max-w-[120px]">{a.name}</span>
                            <span title={`次年期初：${formatCurrency(a.newOpeningBalance)}`}>{formatCurrency(a.newOpeningBalance)}</span>
                          </div>
                        ))}
                        {(previewData?.cashAccounts.length ?? 0) > 4 && (
                          <p className="text-xs text-gray-400">…還有 {previewData.cashAccounts.length - 4} 個帳戶</p>
                        )}
                      </div>
                      <p className="text-xs text-gray-400 mt-3">期末餘額將設為新年度期初餘額</p>
                    </div>

                    {/* P&L preview */}
                    <div className="border border-violet-200 rounded-lg p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                          <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                          </svg>
                        </div>
                        <h4 className="font-medium text-blue-700">損益計算</h4>
                      </div>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-gray-500">營業收入</span>
                          <span className="font-medium">{previewData ? formatCurrency(previewData.pl.grossRevenue) : '—'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500">營業費用</span>
                          <span className="font-medium">{previewData ? formatCurrency(previewData.pl.totalExpenses) : '—'}</span>
                        </div>
                        <div className="flex justify-between border-t pt-1 mt-1">
                          <span className="text-gray-700 font-medium">稅前淨利</span>
                          <span className={`font-bold ${(previewData?.pl.netIncome ?? 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {previewData ? formatCurrency(previewData.pl.netIncome) : '—'}
                          </span>
                        </div>
                        {previewData?.vat.carryForwardOut > 0 && (
                          <div className="flex justify-between text-xs text-indigo-600 pt-1">
                            <span>VAT 留抵帶出</span>
                            <span>{formatCurrency(previewData.vat.carryForwardOut)}</span>
                          </div>
                        )}
                      </div>
                      <p className="text-xs text-gray-400 mt-3">將產生損益表、資產負債表及現金流量表</p>
                    </div>
                  </div>
                )}

                {validationResult.warnings && validationResult.warnings.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-sm font-semibold text-gray-700">注意事項（不影響結轉執行）</h4>
                    {validationResult.warnings.map((w, i) => (
                      <div key={i} className="flex items-start gap-3 p-3 rounded-lg border bg-yellow-50 border-yellow-200">
                        <svg className="w-5 h-5 text-yellow-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.268 16.5c-.77.833.192 2.5 1.732 2.5z" />
                        </svg>
                        <p className="text-sm text-yellow-700">{w.message}</p>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex gap-3">
                  <button
                    onClick={() => { setStep(1); }}
                    className="px-4 py-2 border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50 text-sm"
                  >
                    ← 上一步
                  </button>
                  <button
                    onClick={handleReset}
                    className="px-4 py-2 border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50 text-sm"
                  >
                    重新驗證
                  </button>
                  <button
                    onClick={() => setStep(3)}
                    disabled={previewData?.blockers?.length > 0}
                    title={previewData?.blockers?.length > 0 ? `Preview API 仍有阻擋事項：${previewData.blockers[0]}` : undefined}
                    className="px-6 py-2 bg-violet-600 text-white rounded-lg hover:bg-violet-700 transition-colors font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    下一步：確認結轉
                  </button>
                </div>
              </div>
            )}

            {/* Step 3: Confirm & Execute */}
            {step === 3 && (
              <div className="space-y-6">
                <div className="bg-red-50 border-2 border-red-300 rounded-lg p-6">
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0">
                      <svg className="w-7 h-7 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.268 16.5c-.77.833.192 2.5 1.732 2.5z" />
                      </svg>
                    </div>
                    <div>
                      <h4 className="text-lg font-bold text-red-800">年度結轉為不可逆操作，請確認所有資料正確</h4>
                      <ul className="mt-3 space-y-1 text-sm text-red-700">
                        <li>- 所有庫存商品將建立結存快照</li>
                        <li>- 現金帳戶的期末餘額將設為下年度期初餘額</li>
                        <li>- 年度損益將計算並記錄為保留盈餘</li>
                        <li>- 將產生損益表、資產負債表、現金流量表</li>
                        <li>- 此操作無法撤銷</li>
                      </ul>
                    </div>
                  </div>
                </div>

                <div>
                  <label htmlFor="confirm-text-input" className="block text-sm font-medium text-gray-700 mb-2">
                    請輸入「<span className="text-violet-600 font-bold">{expectedConfirmText}</span>」以確認執行
                  </label>
                  <input
                    id="confirm-text-input"
                    type="text"
                    value={confirmText}
                    onChange={e => setConfirmText(e.target.value)}
                    placeholder={expectedConfirmText}
                    className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm focus:ring-2 focus:ring-violet-400 focus:border-violet-400"
                  />
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => { setStep(2); setConfirmText(''); }}
                    className="px-4 py-2 border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50 text-sm"
                  >
                    上一步
                  </button>
                  <button
                    onClick={handleExecute}
                    disabled={confirmText !== expectedConfirmText || executing}
                    className="px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {executing ? (
                      <span className="flex items-center gap-2">
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                        執行結轉中...
                      </span>
                    ) : '確認執行年度結轉'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Execution Result ── */}
      {executionResult && (
        <div className="bg-white rounded-xl shadow-sm border border-violet-200">
          <div className="px-6 py-4 border-b border-violet-100">
            <h3 className="text-lg font-semibold text-violet-800">結轉結果</h3>
          </div>
          <div className="px-6 py-4">
            {executionResult.error ? (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <div className="flex items-center gap-3">
                  <svg className="w-6 h-6 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="text-red-700 font-medium">{executionResult.error}</p>
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-center gap-3">
                  <svg className="w-8 h-8 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <div>
                    <p className="text-green-800 font-bold text-lg">{selectedYear} 年度結轉完成</p>
                    <p className="text-green-600 text-sm">
                      執行時間: {executionResult.rolledOverAt ? new Date(executionResult.rolledOverAt).toLocaleString('zh-TW') : '-'}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-violet-50 rounded-lg p-4 text-center">
                    <p className="text-xs text-gray-500">庫存商品數</p>
                    <p className="text-2xl font-bold text-violet-700">{executionResult.summary?.inventoryProducts || 0}</p>
                  </div>
                  <div className="bg-violet-50 rounded-lg p-4 text-center">
                    <p className="text-xs text-gray-500">庫存總值</p>
                    <p className="text-xl font-bold text-violet-700">{formatCurrency(executionResult.summary?.inventoryTotalValue)}</p>
                  </div>
                  <div className="bg-emerald-50 rounded-lg p-4 text-center">
                    <p className="text-xs text-gray-500">現金帳戶數</p>
                    <p className="text-2xl font-bold text-emerald-700">{executionResult.summary?.cashAccounts || 0}</p>
                  </div>
                  <div className={`rounded-lg p-4 text-center ${executionResult.summary?.netIncome >= 0 ? 'bg-green-50' : 'bg-red-50'}`}>
                    <p className="text-xs text-gray-500">稅前淨利（保留盈餘）</p>
                    <p className={`text-xl font-bold ${executionResult.summary?.netIncome >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                      {formatCurrency(executionResult.summary?.netIncome)}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-xs text-gray-500">營業收入</p>
                    <p className="text-lg font-medium text-gray-800">{formatCurrency(executionResult.summary?.revenue)}</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-xs text-gray-500">營業成本</p>
                    <p className="text-lg font-medium text-gray-800">{formatCurrency(executionResult.summary?.cogs)}</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-xs text-gray-500">營業費用</p>
                    <p className="text-lg font-medium text-gray-800">{formatCurrency(executionResult.summary?.expenses)}</p>
                  </div>
                </div>

                {executionResult.summary?.statements && executionResult.summary.statements.length > 0 && (
                  <div>
                    <h4 className="text-sm font-semibold text-gray-700 mb-2">已產生財務報表</h4>
                    <div className="space-y-2">
                      {executionResult.summary.statements.map((s) => (
                        <div key={s.id} className="flex items-center justify-between p-3 bg-violet-50 rounded-lg border border-violet-200">
                          <div>
                            <span className="text-sm font-medium text-violet-700">{s.type}</span>
                            <span className="text-xs text-gray-400 ml-2">
                              {new Date(s.generatedAt).toLocaleString('zh-TW')}
                            </span>
                          </div>
                          <button
                            onClick={() => handleViewStatement(s.id)}
                            className="text-xs text-violet-600 hover:text-violet-800 underline"
                          >
                            查看明細
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {executionResult.completedSections && (
                  <div>
                    <h4 className="text-sm font-semibold text-gray-700 mb-2">完成項目</h4>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                      {[
                        { key: 'inventory', label: '庫存結轉' },
                        { key: 'cashBalance', label: '現金餘額結轉' },
                        { key: 'profitLoss', label: '損益計算' },
                        { key: 'statements', label: '財務報表' }
                      ].map(section => (
                        <div key={section.key} className={`flex items-center gap-2 p-2 rounded ${
                          executionResult.completedSections[section.key]
                            ? 'bg-green-50 text-green-700'
                            : 'bg-gray-50 text-gray-500'
                        }`}>
                          {executionResult.completedSections[section.key] ? (
                            <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                          ) : (
                            <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                          )}
                          <span className="text-sm">{section.label}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
