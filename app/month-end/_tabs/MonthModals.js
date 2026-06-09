'use client';

import Link from 'next/link';
import { StatusBadge, renderReportTable } from './ReportTable';

// ── Pre-check / Closing Result Modal ─────────────────────────────────
export function PreCheckModal({
  showPreCheck, setShowPreCheck,
  preCheckMonth, preCheckResults, preCheckLoading, reconCheckResult,
  selectedYear, isAdmin, handleForceClose, handleViewReport,
}) {
  if (!showPreCheck) return null;
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      onClick={() => !preCheckLoading && setShowPreCheck(false)}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-auto"
        onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-white px-6 py-4 border-b border-slate-200 flex items-center justify-between z-10">
          <h3 className="text-lg font-bold text-slate-800">
            月結作業 - {selectedYear}/{String(preCheckMonth).padStart(2, '0')}
          </h3>
          <button onClick={() => { if (!preCheckLoading) setShowPreCheck(false); }}
            disabled={preCheckLoading}
            className="text-gray-400 hover:text-gray-600 text-xl font-bold disabled:opacity-30 disabled:cursor-not-allowed">
            &times;
          </button>
        </div>
        <div className="px-6 py-4">
          {preCheckLoading && (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-600"></div>
              <span className="ml-3 text-gray-500">執行月結作業中...</span>
            </div>
          )}
          {preCheckResults?.error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-red-700 font-medium">{preCheckResults.error}</p>
            </div>
          )}
          {preCheckResults?.blocked && (
            <div className="space-y-4">
              <div className="bg-orange-50 border border-orange-300 rounded-lg p-4">
                <p className="text-orange-800 font-medium">月結前置條件未完成</p>
                <p className="text-orange-700 text-sm mt-1">{preCheckResults.detail || preCheckResults.blockedBy}</p>
              </div>
              {isAdmin && (
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                  <p className="text-gray-600 text-sm mb-3">管理員可跳過現金盤點要求強制執行月結，請確認帳實狀況後再操作。</p>
                  <button onClick={handleForceClose} disabled={preCheckLoading}
                    className="px-4 py-2 text-sm bg-orange-600 text-white rounded-lg hover:bg-orange-700 font-medium disabled:opacity-50">
                    強制月結（跳過現金盤點）
                  </button>
                </div>
              )}
            </div>
          )}
          {preCheckResults?.success && (
            <div className="space-y-6">
              <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-center gap-3">
                <svg className="w-6 h-6 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div>
                  <p className="text-green-800 font-medium">月結作業完成</p>
                  <p className="text-green-600 text-sm">已建立 {preCheckResults.reports?.length || 0} 份報表快照</p>
                </div>
              </div>
              {preCheckResults.reportGenerationFailed && (
                <div className="bg-yellow-50 border border-yellow-300 rounded-lg p-3 flex items-start gap-2">
                  <svg className="w-5 h-5 text-yellow-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.268 16.5c-.77.833.192 2.5 1.732 2.5z" />
                  </svg>
                  <div>
                    <p className="text-sm font-medium text-yellow-800">自動業務報告產生失敗</p>
                    <p className="text-xs text-yellow-700 mt-0.5">月結資料已正常儲存，但背景業務報告未能自動產生，請通知管理員處理。</p>
                    {preCheckResults.reportGenerationError && (
                      <p className="text-xs text-yellow-600 mt-1 font-mono">{preCheckResults.reportGenerationError}</p>
                    )}
                  </div>
                </div>
              )}
              {reconCheckResult && (
                <div>
                  <h4 className="text-sm font-semibold text-slate-700 mb-3">對帳連續性檢查</h4>
                  <div className="space-y-2">
                    {(reconCheckResult.accounts || []).map((acc, i) => (
                      <div key={i} className={`flex items-center justify-between p-3 rounded-lg border ${acc.continuous ? 'bg-green-50 border-green-200' : 'bg-yellow-50 border-yellow-200'}`}>
                        <div className="flex items-center gap-2">
                          {acc.continuous ? (
                            <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                          ) : (
                            <svg className="w-5 h-5 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.268 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>
                          )}
                          <span className="text-sm">{acc.accountName}</span>
                        </div>
                        <span className={`text-xs ${acc.continuous ? 'text-green-600' : 'text-yellow-600'}`}>
                          {acc.continuous ? '連續' : `缺少 ${acc.missingMonths?.join(', ') || '部分'} 月`}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <h4 className="text-sm font-semibold text-slate-700 mb-3">前置檢查結果</h4>
                <div className="space-y-2">
                  {preCheckResults.preChecks?.map((check, i) => {
                    const isPass = check.passed && check.level !== 'warning';
                    const isWarehouseCheck = check.name === '館別未完成個別月結';
                    const bgCls = isPass ? 'bg-green-50 border-green-200' : isWarehouseCheck ? 'bg-orange-50 border-orange-300' : 'bg-amber-50 border-amber-200';
                    const textCls = isPass ? 'text-green-700' : isWarehouseCheck ? 'text-orange-800' : 'text-amber-800';
                    const countCls = isPass ? 'text-green-600' : isWarehouseCheck ? 'text-orange-700 font-bold' : 'text-amber-700';
                    return (
                      <div key={i} className={`flex items-start justify-between p-3 rounded-lg border ${bgCls}`}>
                        <div className="flex items-start gap-2 flex-1">
                          {isPass ? (
                            <svg className="w-5 h-5 text-green-500 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                          ) : (
                            <svg className={`w-5 h-5 mt-0.5 shrink-0 ${isWarehouseCheck ? 'text-orange-500' : 'text-amber-500'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.268 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>
                          )}
                          <div>
                            <span className={`text-sm font-medium ${textCls}`}>{check.name}</span>
                            {isWarehouseCheck && !isPass && <p className="text-xs text-orange-600 mt-0.5">請先至各館完成個別月結，再執行全館月結</p>}
                            {check.detail && !isPass && <p className={`text-xs mt-0.5 ${isWarehouseCheck ? 'text-orange-600' : 'text-amber-600'}`}>{check.detail}</p>}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0 ml-3">
                          <span className={`text-sm ${countCls}`}>{isPass ? '通過' : `${check.count} 筆待處理`}</span>
                          {!isPass && check.link && (
                            <Link href={check.link} className={`text-xs px-2 py-0.5 rounded whitespace-nowrap text-white ${isWarehouseCheck ? 'bg-orange-600 hover:bg-orange-700' : 'bg-amber-600 hover:bg-amber-700'}`}>
                              {check.linkText || '前往處理'} →
                            </Link>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              {preCheckResults.summary && (
                <div>
                  <h4 className="text-sm font-semibold text-slate-700 mb-3">月結摘要</h4>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {[
                      { label: '進貨', count: preCheckResults.summary.purchaseCount, total: preCheckResults.summary.purchaseTotal },
                      { label: '銷貨', count: preCheckResults.summary.salesCount, total: preCheckResults.summary.salesTotal },
                      { label: '支出', total: preCheckResults.summary.expenseTotal },
                      { label: '現金交易', count: preCheckResults.summary.cashTransactions },
                    ].map(item => (
                      <div key={item.label} className="bg-slate-50 rounded-lg p-3 text-center">
                        <p className="text-xs text-gray-500">{item.label}</p>
                        {item.count != null && <p className="text-lg font-bold text-slate-700">{item.count}</p>}
                        {item.total != null && <p className="text-xs text-gray-500">${Number(item.total || 0).toLocaleString()}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {preCheckResults.reports?.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-slate-700 mb-3">已產生報表</h4>
                  <div className="space-y-2">
                    {preCheckResults.reports.map(r => (
                      <div key={r.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-200">
                        <div>
                          <span className="text-sm font-medium text-slate-700">{r.reportType}</span>
                          <span className="text-xs text-gray-400 ml-2">{new Date(r.generatedAt).toLocaleString('zh-TW')}</span>
                        </div>
                        <button onClick={() => handleViewReport(r.id)} className="text-xs text-slate-600 hover:text-slate-800 underline">檢視</button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Month Detail Modal ────────────────────────────────────────────────
export function MonthDetailModal({ showMonthDetail, setShowMonthDetail, monthDetail, monthDetailLoading }) {
  if (!showMonthDetail) return null;
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowMonthDetail(false)}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-auto" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-white px-6 py-4 border-b border-slate-200 flex items-center justify-between z-10">
          <h3 className="text-lg font-bold text-slate-800">
            {monthDetail ? `${monthDetail.year}/${String(monthDetail.month).padStart(2, '0')} 月結報表` : '月結詳情'}
          </h3>
          <button onClick={() => setShowMonthDetail(false)} className="text-gray-400 hover:text-gray-600 text-xl font-bold">&times;</button>
        </div>
        <div className="px-6 py-4">
          {monthDetailLoading && (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-600"></div>
              <span className="ml-3 text-gray-500">載入中...</span>
            </div>
          )}
          {monthDetail && (
            <div className="space-y-6">
              <div className="flex items-center gap-4 text-sm">
                <StatusBadge status={monthDetail.status} />
                {monthDetail.closedAt && <span className="text-gray-500">結帳時間: {new Date(monthDetail.closedAt).toLocaleString('zh-TW')}</span>}
                {monthDetail.closedBy && <span className="text-gray-500">操作者: {monthDetail.closedBy}</span>}
                {monthDetail.lockedAt && <span className="text-blue-600">鎖定時間: {new Date(monthDetail.lockedAt).toLocaleString('zh-TW')}</span>}
              </div>
              {monthDetail.unlockReason && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm">
                  <p className="text-amber-800"><strong>曾解鎖:</strong> {monthDetail.unlockReason}</p>
                  <p className="text-amber-600 text-xs mt-1">由 {monthDetail.unlockedBy} 於 {new Date(monthDetail.unlockedAt).toLocaleString('zh-TW')} 解鎖</p>
                </div>
              )}
              {monthDetail.reports?.length > 0 ? (
                <div className="space-y-6">
                  {monthDetail.reports.map(report => (
                    <div key={report.id} className="border border-slate-200 rounded-lg overflow-hidden">
                      <div className="bg-slate-50 px-4 py-3 flex items-center justify-between">
                        <h4 className="font-semibold text-slate-700">{report.reportType}</h4>
                        <span className="text-xs text-gray-400">{new Date(report.generatedAt).toLocaleString('zh-TW')}</span>
                      </div>
                      <div className="p-4 overflow-x-auto">{renderReportTable(report.reportType, report.reportData)}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500 text-center py-8">無報表資料</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Single Report Viewer Modal ────────────────────────────────────────
export function ReportViewerModal({ showReport, setShowReport, reportData, reportLoading }) {
  if (!showReport) return null;
  return (
    <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[85vh] overflow-auto">
        <div className="sticky top-0 bg-white px-6 py-4 border-b border-slate-200 flex items-center justify-between z-10">
          <h3 className="text-lg font-bold text-slate-800">{reportData ? reportData.reportType : '報表'}</h3>
          <button onClick={() => setShowReport(false)} className="text-gray-400 hover:text-gray-600 text-xl font-bold">&times;</button>
        </div>
        <div className="px-6 py-4">
          {reportLoading && (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-600"></div>
              <span className="ml-3 text-gray-500">載入中...</span>
            </div>
          )}
          {reportData && (
            <div className="space-y-4">
              <div className="flex items-center gap-4 text-xs text-gray-500">
                <span>期間: {reportData.year}/{String(reportData.month).padStart(2, '0')}</span>
                {reportData.warehouse && <span>館別: {reportData.warehouse}</span>}
                <span>產生時間: {new Date(reportData.generatedAt).toLocaleString('zh-TW')}</span>
              </div>
              <div className="overflow-x-auto">{renderReportTable(reportData.reportType, reportData.reportData)}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Unlock Modal ──────────────────────────────────────────────────────
export function UnlockModal({ showUnlock, setShowUnlock, unlockTarget, unlockReason, setUnlockReason, unlockLoading, handleUnlockSubmit, selectedYear, monthsData }) {
  if (!showUnlock) return null;
  const later = monthsData.filter(m => m.month > (unlockTarget?.month ?? 0) && ['已結帳', '已鎖定'].includes(m.status));
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      onClick={() => !unlockLoading && setShowUnlock(false)}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-slate-200">
          <h3 className="text-lg font-bold text-slate-800">解鎖月結</h3>
        </div>
        <div className="px-6 py-4 space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
            <p className="text-amber-800 text-sm font-medium">
              即將解鎖 {selectedYear}/{String(unlockTarget?.month).padStart(2, '0')} 月結
            </p>
            <p className="text-amber-600 text-xs mt-1">解鎖後將允許修改該月份的資料，此操作僅限管理員執行。</p>
          </div>
          {later.length > 0 && (
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
              <p className="text-orange-800 text-sm font-medium">⚠ 連帶解鎖警告</p>
              <p className="text-orange-700 text-xs mt-1">以下月份報表依賴 {unlockTarget?.month} 月數據，將同步解鎖：</p>
              <p className="text-orange-800 text-xs font-medium mt-1">{later.map(m => `${m.month} 月（${m.status}）`).join('、')}</p>
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">解鎖原因（必填）</label>
            <textarea
              value={unlockReason}
              onChange={e => setUnlockReason(e.target.value)}
              placeholder="請說明解鎖原因..."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-300 focus:border-amber-400"
              rows={3}
            />
          </div>
          <div className="flex justify-end gap-3">
            <button onClick={() => setShowUnlock(false)} disabled={unlockLoading}
              className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50">
              取消
            </button>
            <button onClick={handleUnlockSubmit} disabled={unlockLoading || !unlockReason.trim()}
              className="px-4 py-2 text-sm bg-amber-500 text-white rounded-lg hover:bg-amber-600 font-medium disabled:opacity-50">
              {unlockLoading ? '解鎖中...' : '確認解鎖'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
