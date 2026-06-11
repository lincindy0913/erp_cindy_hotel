'use client';

import { TABS, ANALYTICS_SUB_TABS } from '../_constants';

export default function BnbTabBar({
  activeTab, setActiveTab,
  analyticsSub, setAnalyticsSub,
  router,
  isLocked, lockLoading, lockStatus,
  getActiveLockContext, toggleLock,
  fetchLockAudits, setShowLockHistory,
  setShowBatchLock,
}) {
  return (
    <>
      {/* Tab bar */}
      <div className="mb-6 flex flex-wrap items-center gap-1 bg-white rounded-xl border p-1.5 shadow-sm">
        {TABS.map((t, i) => {
          const prevGroup = i > 0 ? TABS[i - 1].group : null;
          const showDivider = prevGroup && t.group !== prevGroup;
          return (
            <span key={t.key} className="flex items-center">
              {showDivider && <span className="w-px h-6 bg-gray-200 mx-1 self-center" aria-hidden />}
              <button onClick={() => {
                setActiveTab(t.key);
                const url = t.key === 'analytics' ? `?tab=analytics&sub=${analyticsSub}` : `?tab=${t.key}`;
                router.replace(url, { scroll: false });
              }}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                  activeTab === t.key ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-50'
                }`}
                title={t.group}>
                {t.label}
              </button>
            </span>
          );
        })}
        <div className="ml-auto flex items-center gap-2">
          {isLocked && (
            <span className="flex items-center gap-1 text-xs text-red-600 bg-red-50 px-2.5 py-1.5 rounded-lg border border-red-200">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" /></svg>
              {getActiveLockContext().month} 已鎖帳
              {lockStatus?.lockedBy && <span className="text-gray-400">（{lockStatus.lockedBy}）</span>}
            </span>
          )}
          <button onClick={toggleLock} disabled={lockLoading}
            className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
              isLocked ? 'border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100' : 'border-green-300 bg-green-50 text-green-700 hover:bg-green-100'
            } disabled:opacity-50`}>
            {lockLoading ? `${getActiveLockContext().month} 處理中…` : isLocked ? '解鎖此月' : '鎖帳此月'}
          </button>
          <button onClick={() => { const { month, warehouse } = getActiveLockContext(); fetchLockAudits(month, warehouse); setShowLockHistory(true); }}
            className="px-3 py-1.5 text-xs rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50">
            紀錄
          </button>
          <button onClick={() => setShowBatchLock(true)}
            className="px-3 py-1.5 text-xs rounded-lg border border-indigo-300 bg-indigo-50 text-indigo-700 hover:bg-indigo-100">
            批次鎖帳
          </button>
        </div>
      </div>

      {/* Analytics sub-nav */}
      {activeTab === 'analytics' && (
        <div className="mb-6 bg-indigo-50/80 rounded-xl border border-indigo-100 p-1.5 space-y-1">
          {['報表', '統計圖表'].map(grp => (
            <div key={grp} className="flex flex-wrap items-center gap-1">
              <span className="text-[10px] text-indigo-400 font-medium w-14 shrink-0 pl-1">{grp}</span>
              {ANALYTICS_SUB_TABS.filter(st => st.group === grp).map(st => (
                <button key={st.key} type="button"
                  onClick={() => { setAnalyticsSub(st.key); router.replace(`?tab=analytics&sub=${st.key}`, { scroll: false }); }}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                    analyticsSub === st.key ? 'bg-indigo-700 text-white shadow-sm' : 'text-indigo-900/80 hover:bg-white/80'
                  }`}>
                  {st.label}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
