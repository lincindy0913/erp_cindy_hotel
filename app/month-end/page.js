'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import Navigation from '@/components/Navigation';
import FetchErrorBanner from '@/components/FetchErrorBanner';
import ExportButtons from '@/components/ExportButtons';
import { EXPORT_CONFIGS } from '@/lib/export-columns';
import ModuleGuideCard from '@/components/ModuleGuideCard';
import HelpButton from '@/components/HelpButton';
import Link from 'next/link';
import { useMonthEnd } from './_hooks/useMonthEnd';
import { StatusBadge } from './_tabs/ReportTable';
import { PreCheckModal, MonthDetailModal, ReportViewerModal, UnlockModal } from './_tabs/MonthModals';

const MONTH_NAMES = ['一月','二月','三月','四月','五月','六月','七月','八月','九月','十月','十一月','十二月'];

export default function MonthEndPage() {
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === 'admin';
  const userName = session?.user?.name || '';

  const [currentYear, setCurrentYear] = useState(() => new Date().getFullYear());
  const [selectedYear, setSelectedYear] = useState(() => new Date().getFullYear());

  useEffect(() => {
    const id = setInterval(() => {
      const y = new Date().getFullYear();
      setCurrentYear(prev => prev !== y ? y : prev);
    }, 60_000);
    return () => clearInterval(id);
  }, []);

  const hook = useMonthEnd({ selectedYear, userName, isAdmin });

  const yearOptions = [];
  for (let y = currentYear + 1; y >= currentYear - 5; y--) yearOptions.push(y);

  return (
    <div className="min-h-screen page-bg-monthend">
      <Navigation borderColor="border-slate-500" />
      {hook.monthDataError && (
        <div className="max-w-7xl mx-auto px-4 pt-4">
          <FetchErrorBanner message={hook.monthDataError} onRetry={hook.fetchMonthData} />
        </div>
      )}
      <div className="max-w-7xl mx-auto px-4 py-6">
        <ModuleGuideCard
          title="月結流程說明" color="slate"
          steps={[
            { label: '確認資料完整', desc: '確認當月所有進貨、費用、付款、PMS收入已登錄完成' },
            { label: '執行月結', desc: '點擊各月份「執行月結」，系統將產生損益快照' },
            { label: '鎖定期間', desc: '月結完成後鎖定，防止資料異動；如需修正請先解鎖' },
            { label: '查看報表', desc: '月結後可至「損益表」查看當月財務結果', link: { href: '/reports/profit-loss', text: '前往損益表' } },
          ]}
        />

        {/* Checklist */}
        <div className="mb-5 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-slate-700">月結前確認清單</span>
              {hook.checklistData && (
                hook.checklistData.warningCount > 0 ? (
                  <div className="flex items-center gap-1.5">
                    {hook.checklistData.criticalCount > 0 && <span className="text-xs px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 font-medium">{hook.checklistData.criticalCount} 項阻斷</span>}
                    {(hook.checklistData.warningCount - (hook.checklistData.criticalCount || 0)) > 0 && <span className="text-xs px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-700 font-medium">{hook.checklistData.warningCount - (hook.checklistData.criticalCount || 0)} 項待處理</span>}
                  </div>
                ) : <span className="text-xs px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">全部完成</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <select value={hook.checklistMonth} onChange={e => hook.setChecklistMonth(Number(e.target.value))}
                className="text-xs border border-slate-300 rounded px-2 py-1 text-slate-600">
                {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                  <option key={m} value={m}>{selectedYear}/{String(m).padStart(2, '0')}</option>
                ))}
              </select>
              <button onClick={() => hook.fetchChecklist(hook.checklistMonth)} disabled={hook.checklistLoading}
                className="text-xs px-2.5 py-1 bg-slate-600 text-white rounded hover:bg-slate-700 disabled:opacity-50 whitespace-nowrap">
                {hook.checklistLoading ? '載入中…' : '重新整理'}
              </button>
            </div>
          </div>
          {hook.checklistLoading ? (
            <div className="px-4 py-3 space-y-2">{[...Array(7)].map((_, i) => <div key={i} className="h-10 bg-slate-100 rounded-lg animate-pulse" />)}</div>
          ) : hook.checklistData ? (
            <div className="px-4 py-3 space-y-2">
              {hook.checklistData.items.map(item => {
                const isOk = item.status === 'ok';
                const isCritical = item.status === 'critical';
                const isWarn = item.status === 'warning';
                const isManual = item.status === 'manual';
                const isConfirmed = isManual && !!hook.manualConfirmed[item.key];
                const effectiveOk = isOk || isConfirmed;
                return (
                  <div key={item.key} className={`flex items-start gap-3 p-2.5 rounded-lg border ${effectiveOk ? 'bg-green-50 border-green-100' : isCritical ? 'bg-red-50 border-red-300' : isWarn ? 'bg-orange-50 border-orange-200' : 'bg-slate-50 border-slate-100'}`}>
                    <div className={`mt-0.5 w-5 h-5 rounded-full flex items-center justify-center shrink-0 text-xs font-bold ${effectiveOk ? 'bg-green-500 text-white' : isCritical ? 'bg-red-600 text-white' : isWarn ? 'bg-orange-400 text-white' : 'bg-slate-300 text-white'}`}>
                      {effectiveOk ? '✓' : isCritical ? '✗' : item.step}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium ${effectiveOk ? 'text-green-800' : isCritical ? 'text-red-800' : isWarn ? 'text-orange-800' : 'text-slate-700'}`}>
                        {item.label}
                        {isCritical && <span className="ml-1.5 text-xs font-bold text-red-600 bg-red-100 px-1 rounded">阻斷月結</span>}
                        {item.count > 0 && <span className={`ml-1.5 text-xs font-bold ${isCritical ? 'text-red-700' : 'text-orange-600'}`}>（{item.count} 筆）</span>}
                        {isManual && !isConfirmed && <span className="ml-1.5 text-xs text-slate-400">（請人工確認）</span>}
                        {isConfirmed && <span className="ml-1.5 text-xs text-green-600">（已確認）</span>}
                      </p>
                      {item.desc && <p className={`text-xs mt-0.5 ${isCritical ? 'text-red-600' : 'text-slate-400'}`}>{item.desc}</p>}
                      {item.detail && <p className={`text-xs mt-0.5 ${isCritical ? 'text-red-600' : 'text-orange-600'}`}>{item.detail}</p>}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {isManual && (
                        <button onClick={() => hook.toggleManualConfirm(item.key)}
                          className={`text-xs px-2 py-1 rounded whitespace-nowrap font-medium border transition-colors ${isConfirmed ? 'bg-green-100 border-green-300 text-green-700 hover:bg-green-200' : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-100'}`}>
                          {isConfirmed ? '✓ 已確認' : '標記確認'}
                        </button>
                      )}
                      <Link href={item.href}
                        className={`text-xs px-2 py-1 rounded whitespace-nowrap font-medium transition-colors ${isCritical ? 'bg-red-600 text-white hover:bg-red-700' : isWarn ? 'bg-orange-500 text-white hover:bg-orange-600' : 'bg-white border border-slate-300 text-slate-600 hover:bg-slate-100'}`}>
                        {item.linkText} →
                      </Link>
                    </div>
                  </div>
                );
              })}
              <p className="text-xs text-slate-400 pt-1">{selectedYear}年{hook.checklistMonth}月 即時狀態，資料截至查詢時間。</p>
            </div>
          ) : (
            <div className="px-4 py-6 text-center"><div className="animate-spin inline-block w-5 h-5 border-2 border-slate-300 border-t-slate-600 rounded-full" /></div>
          )}
        </div>

        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-slate-800">月結作業</h2>
            <p className="text-sm text-gray-500 mt-1">管理每月結帳流程、報表快照與期間鎖定</p>
          </div>
          <div className="flex items-center gap-3">
            <HelpButton anchor="二十一月結與年結" />
            <ExportButtons
              data={hook.monthsData.map(m => ({ year: selectedYear, month: m.month, status: m.status, closedAt: m.closedAt, closedBy: m.closedBy, note: m.note || '' }))}
              columns={EXPORT_CONFIGS.monthEnd.columns}
              exportName={EXPORT_CONFIGS.monthEnd.filename}
              period={String(selectedYear)} title={`${selectedYear} 年月結作業`} sheetName="月結狀態"
            />
            <label htmlFor="year-sel" className="text-sm text-gray-600 font-medium">年度:</label>
            <select id="year-sel" value={selectedYear} onChange={e => setSelectedYear(parseInt(e.target.value))}
              className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-slate-400 focus:border-slate-400">
              {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        </div>

        {/* Progress bar */}
        {!hook.loading && hook.monthsData.length > 0 && (
          <div className="mb-5 bg-white rounded-xl border border-slate-200 shadow-sm px-4 py-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold text-slate-700">{selectedYear} 年結準備度</span>
              <span className={`text-xs font-medium ${hook.closedMonthCount === 12 ? 'text-green-700' : 'text-slate-500'}`}>
                {hook.closedMonthCount === 12 ? '✓ 12/12 月完成，可執行年結' : `${hook.closedMonthCount}/12 月完成，還差 ${12 - hook.closedMonthCount} 個月`}
              </span>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-2 mb-2">
              <div className={`h-2 rounded-full transition-all ${hook.closedMonthCount === 12 ? 'bg-green-500' : 'bg-slate-400'}`}
                style={{ width: `${(hook.closedMonthCount / 12) * 100}%` }} />
            </div>
            {hook.closedMonthCount === 12 && selectedYear === currentYear && (
              <Link href="/year-end" className="inline-flex items-center text-xs text-green-700 hover:underline font-medium">前往執行 {selectedYear} 年結 →</Link>
            )}
            {hook.closedMonthCount < 12 && <p className="text-xs text-slate-400">須完成全部 12 個月月結、VAT 申報及 12 月銀行核對後，方可執行年結</p>}
          </div>
        )}

        {hook.loading && (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-600"></div>
            <span className="ml-3 text-gray-500">載入中...</span>
          </div>
        )}

        {/* Month cards */}
        {!hook.loading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {hook.monthsData.map(md => {
              const isClosed = md.status === '已結帳';
              const isLocked = md.status === '已鎖定';
              const isOpen = md.status === '未結帳';
              return (
                <div key={md.month} className={`bg-white rounded-xl shadow-sm border transition-all hover:shadow-md ${isLocked ? 'border-blue-200' : isClosed ? 'border-green-200' : 'border-gray-200'}`}>
                  <div className={`px-4 py-3 rounded-t-xl flex items-center justify-between ${isLocked ? 'bg-blue-50' : isClosed ? 'bg-green-50' : 'bg-slate-50'}`}>
                    <div className="flex items-center gap-2">
                      <span className="text-lg font-bold text-slate-700">{String(md.month).padStart(2, '0')}</span>
                      <span className="text-sm text-slate-500">{MONTH_NAMES[md.month - 1]}</span>
                    </div>
                    <StatusBadge status={md.status} />
                  </div>
                  <div className="px-4 py-3 space-y-2">
                    {[['進貨', `${md.purchaseCount} 筆 / $${Number(md.purchaseTotal||0).toLocaleString()}`], ['銷貨', `${md.salesCount} 筆 / $${Number(md.salesTotal||0).toLocaleString()}`], ['支出', `$${Number(md.expenseTotal||0).toLocaleString()}`]].map(([label, val]) => (
                      <div key={label} className="flex justify-between text-sm">
                        <span className="text-gray-500">{label}</span><span className="text-gray-700 font-medium">{val}</span>
                      </div>
                    ))}
                    {md.reportCount > 0 && <div className="flex justify-between text-sm"><span className="text-gray-500">報表</span><span className="text-slate-600 font-medium">{md.reportCount} 份</span></div>}
                    {md.closedAt && <div className="text-xs text-gray-400 pt-1 border-t border-gray-100">結帳: {new Date(md.closedAt).toLocaleDateString('zh-TW')}{md.closedBy ? ` (${md.closedBy})` : ''}</div>}
                  </div>
                  <div className="px-4 py-3 border-t border-gray-100 flex gap-2 flex-wrap">
                    {isOpen && (() => {
                      const ok = hook.canCloseMonth(md.month);
                      const prevName = md.month > 1 ? `${MONTH_NAMES[md.month - 2]}` : '上年度 12 月';
                      return (
                        <button onClick={() => ok && !hook.showPreCheck && !hook.preCheckLoading && hook.handleStartClose(md.month)}
                          disabled={hook.preCheckLoading || !ok || hook.showPreCheck}
                          title={!ok ? `請先完成 ${prevName}月結（須依序 1→12 月）` : '執行月結'}
                          className={`flex-1 text-xs px-3 py-1.5 rounded-lg transition-colors font-medium ${ok ? 'bg-slate-600 text-white hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed' : 'bg-gray-100 text-gray-400 cursor-not-allowed border border-gray-200'}`}>
                          {hook.preCheckLoading && hook.preCheckMonth === md.month ? '執行中...' : ok ? '開始月結' : `須先完成 ${prevName}`}
                        </button>
                      );
                    })()}
                    {(isClosed || isLocked) && (
                      <button onClick={() => hook.handleViewDetail(md.statusId)} className="flex-1 text-xs bg-white border border-slate-300 text-slate-600 px-3 py-1.5 rounded-lg hover:bg-slate-50 transition-colors">
                        檢視報表
                      </button>
                    )}
                    {isClosed && (
                      <button onClick={() => hook.handleLock(md.statusId)} disabled={hook.lockLoading}
                        className="flex-1 text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:opacity-50">
                        鎖定
                      </button>
                    )}
                    {isLocked && isAdmin && (
                      <button onClick={() => hook.handleUnlockClick(md)}
                        className="flex-1 text-xs bg-amber-500 text-white px-3 py-1.5 rounded-lg hover:bg-amber-600 transition-colors font-medium">
                        解鎖
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <PreCheckModal
        showPreCheck={hook.showPreCheck} setShowPreCheck={hook.setShowPreCheck}
        preCheckMonth={hook.preCheckMonth} preCheckResults={hook.preCheckResults}
        preCheckLoading={hook.preCheckLoading} reconCheckResult={hook.reconCheckResult}
        selectedYear={selectedYear} isAdmin={isAdmin}
        handleForceClose={hook.handleForceClose} handleViewReport={hook.handleViewReport}
      />
      <MonthDetailModal
        showMonthDetail={hook.showMonthDetail} setShowMonthDetail={hook.setShowMonthDetail}
        monthDetail={hook.monthDetail} monthDetailLoading={hook.monthDetailLoading}
      />
      <ReportViewerModal
        showReport={hook.showReport} setShowReport={hook.setShowReport}
        reportData={hook.reportData} reportLoading={hook.reportLoading}
      />
      <UnlockModal
        showUnlock={hook.showUnlock} setShowUnlock={hook.setShowUnlock}
        unlockTarget={hook.unlockTarget} unlockReason={hook.unlockReason} setUnlockReason={hook.setUnlockReason}
        unlockLoading={hook.unlockLoading} handleUnlockSubmit={hook.handleUnlockSubmit}
        selectedYear={selectedYear} monthsData={hook.monthsData}
      />
    </div>
  );
}
