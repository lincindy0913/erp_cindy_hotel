'use client';

import { sortRows, SortableTh } from '@/components/SortableTh';
import FetchErrorBanner from '@/components/FetchErrorBanner';

const STATUS_MAP = {
  not_started: { label: '未開始', color: 'bg-red-100 text-red-700 border-red-300', dot: 'bg-red-500' },
  draft: { label: '進行中', color: 'bg-yellow-100 text-yellow-700 border-yellow-300', dot: 'bg-yellow-500' },
  confirmed: { label: '已確認', color: 'bg-green-100 text-green-700 border-green-300', dot: 'bg-green-500' }
};

function formatMoney(val) {
  if (val == null || isNaN(val)) return '0';
  return Number(val).toLocaleString('zh-TW', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

export function DashboardTab({
  dashYear, setDashYear, dashMonth, setDashMonth,
  dashboardData, dashLoading, dashFilter, setDashFilter,
  dashSearch, setDashSearch, dashSortKey, dashSortDir, dashToggleSort,
  navigateToAccount,
  fetchError, onRetryFetch,
}) {
  const dashSortAccessors = {
    currentBalance: i => Number(i.currentBalance ?? 0),
    difference: i => Number(i.difference ?? 0),
    status: i => ({ not_started: 0, draft: 1, confirmed: 2 }[i.status] ?? 0),
  };
  const filteredDashItems = sortRows(
    (dashboardData?.items || []).filter(item => {
      if (dashFilter !== 'all' && item.status !== dashFilter) return false;
      if (dashSearch && !item.accountName.includes(dashSearch) && !(item.warehouse || '').includes(dashSearch)) return false;
      return true;
    }),
    dashSortKey, dashSortDir, dashSortAccessors
  );

  return (
    <div>
      {fetchError && <FetchErrorBanner message={fetchError} onRetry={onRetryFetch} />}
      {/* Year/Month + Filters */}
      <div className="bg-white rounded-xl shadow-sm border p-4 mb-6">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <label htmlFor="f-13" className="text-sm font-medium text-gray-600">年份</label>
            <select id="f-13"
              value={dashYear}
              onChange={e => setDashYear(parseInt(e.target.value))}
              className="border rounded-lg px-3 py-1.5 text-sm"
            >
              {[2024, 2025, 2026, 2027].map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor="f-38" className="text-sm font-medium text-gray-600">月份</label>
            <select id="f-38"
              value={dashMonth}
              onChange={e => setDashMonth(parseInt(e.target.value))}
              className="border rounded-lg px-3 py-1.5 text-sm"
            >
              {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                <option key={m} value={m}>{m} 月</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor="f-39" className="text-sm font-medium text-gray-600">狀態</label>
            <select id="f-39"
              value={dashFilter}
              onChange={e => setDashFilter(e.target.value)}
              className="border rounded-lg px-3 py-1.5 text-sm"
            >
              <option value="all">全部</option>
              <option value="not_started">未開始</option>
              <option value="draft">進行中</option>
              <option value="confirmed">已確認</option>
            </select>
          </div>
          <input
            type="text"
            placeholder="搜尋帳戶名稱..."
            value={dashSearch}
            onChange={e => setDashSearch(e.target.value)}
            className="border rounded-lg px-3 py-1.5 text-sm flex-1 min-w-[180px]"
          />
        </div>
      </div>

      {/* Progress Bar */}
      {dashboardData?.summary && (
        <div className="bg-white rounded-xl shadow-sm border p-4 mb-6">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-gray-700">
              {dashYear} 年 {dashMonth} 月 對帳進度
            </h3>
            <span className="text-sm text-violet-600 font-medium">
              {dashboardData.summary.completedCount} / {dashboardData.summary.totalAccounts} 完成
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-3">
            <div
              className="bg-violet-500 h-3 rounded-full transition-all duration-500"
              style={{
                width: dashboardData.summary.totalAccounts > 0
                  ? `${(dashboardData.summary.completedCount / dashboardData.summary.totalAccounts * 100)}%`
                  : '0%'
              }}
            />
          </div>
          <div className="flex gap-6 mt-3 text-xs text-gray-500">
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full bg-green-500 inline-block" />
              已確認: {dashboardData.summary.completedCount}
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full bg-yellow-500 inline-block" />
              進行中: {dashboardData.summary.inProgressCount}
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block" />
              未開始: {dashboardData.summary.notStartedCount}
            </span>
            {dashboardData.summary.hasDifferenceCount > 0 && (
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-orange-500 inline-block" />
                有差異: {dashboardData.summary.hasDifferenceCount}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Account List Table */}
      {dashLoading ? (
        <div className="text-center py-12 text-gray-400">載入中...</div>
      ) : filteredDashItems.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl shadow-sm border">
          <p className="text-gray-400">尚無銀行帳戶或無符合篩選條件的資料</p>
          <p className="text-gray-300 text-sm mt-1">請先至現金流模組新增銀行存款帳戶</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 sticky top-0 z-10 border-b">
              <tr>
                <SortableTh label="帳戶名稱" colKey="accountName" sortKey={dashSortKey} sortDir={dashSortDir} onSort={dashToggleSort} className="px-4 py-3" />
                <SortableTh label="館別" colKey="warehouse" sortKey={dashSortKey} sortDir={dashSortDir} onSort={dashToggleSort} className="px-4 py-3" />
                <SortableTh label="存簿餘額" colKey="currentBalance" sortKey={dashSortKey} sortDir={dashSortDir} onSort={dashToggleSort} className="px-4 py-3" align="right" />
                <SortableTh label="差異金額" colKey="difference" sortKey={dashSortKey} sortDir={dashSortDir} onSort={dashToggleSort} className="px-4 py-3" align="right" />
                <SortableTh label="對帳狀態" colKey="status" sortKey={dashSortKey} sortDir={dashSortDir} onSort={dashToggleSort} className="px-4 py-3" align="center" />
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredDashItems.map(item => {
                const statusInfo = STATUS_MAP[item.status] || STATUS_MAP.not_started;
                const hasDiff = item.status === 'confirmed' && item.difference !== 0;
                return (
                  <tr
                    key={item.accountId}
                    className={`hover:bg-violet-50/40 cursor-pointer transition-colors ${hasDiff ? 'bg-orange-50/30' : ''}`}
                    onClick={() => navigateToAccount(item.accountId)}
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-800">{item.accountName}</div>
                      {item.accountCode && <div className="text-xs text-gray-400">{item.accountCode}</div>}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{item.warehouse || <span className="text-gray-300">—</span>}</td>
                    <td className="px-4 py-3 text-right font-mono font-medium text-gray-800">${formatMoney(item.currentBalance)}</td>
                    <td className="px-4 py-3 text-right font-mono">
                      {item.status === 'not_started' || item.difference === 0
                        ? <span className="text-gray-300">—</span>
                        : <span className={item.difference !== 0 ? 'text-orange-600 font-medium' : 'text-green-600'}>${formatMoney(item.difference)}</span>
                      }
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full border ${statusInfo.color}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${statusInfo.dot}`} />
                        {statusInfo.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {hasDiff && (
                        <span className="text-xs text-orange-500 flex items-center justify-end gap-1">
                          <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                          </svg>
                          需複查
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="px-4 py-2 bg-gray-50 border-t text-xs text-gray-400 text-right">
            共 {filteredDashItems.length} 筆帳戶
          </div>
        </div>
      )}
    </div>
  );
}
