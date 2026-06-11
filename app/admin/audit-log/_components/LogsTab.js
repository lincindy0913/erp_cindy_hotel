'use client';

import FetchErrorBanner from '@/components/FetchErrorBanner';
import { ACTION_LABELS, LEVEL_STYLES, LEVEL_LABELS } from '../_hooks/useAuditLog';

function renderStateDiff(before, after) {
  if (!before && !after) return <p className="text-gray-400 text-sm">無狀態記錄</p>;

  const beforeObj = before && typeof before === 'object' ? before : {};
  const afterObj = after && typeof after === 'object' ? after : {};
  const allKeys = [...new Set([...Object.keys(beforeObj), ...Object.keys(afterObj)])];

  return (
    <div className="grid grid-cols-2 gap-4">
      <div>
        <h4 className="text-sm font-medium text-gray-500 mb-2">變更前</h4>
        <pre className="text-xs bg-gray-50 p-3 rounded overflow-auto max-h-48">
          {before ? JSON.stringify(before, null, 2) : '(無)'}
        </pre>
      </div>
      <div>
        <h4 className="text-sm font-medium text-gray-500 mb-2">變更後</h4>
        <pre className="text-xs bg-gray-50 p-3 rounded overflow-auto max-h-48">
          {after ? JSON.stringify(after, null, 2) : '(無)'}
        </pre>
      </div>
    </div>
  );
}

export default function LogsTab({
  summary,
  filters, setFilters,
  handleSearch, handleReset,
  loading, logsError,
  logs, fetchLogs,
  pagination,
  expandedId, setExpandedId,
}) {
  return (
    <>
      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-lg shadow p-4 border-l-4 border-blue-500">
          <p className="text-sm text-gray-500">今日操作</p>
          <p className="text-2xl font-bold text-blue-700">{summary.todayOps}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4 border-l-4 border-indigo-500">
          <p className="text-sm text-gray-500">本月財務操作</p>
          <p className="text-2xl font-bold text-indigo-700">{summary.monthFinance}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4 border-l-4 border-yellow-500">
          <p className="text-sm text-gray-500">本月異常嘗試</p>
          <p className="text-2xl font-bold text-yellow-700">{summary.monthAttempts}</p>
        </div>
      </div>

      {/* Filter Bar */}
      <form onSubmit={handleSearch} className="bg-white rounded-lg shadow p-4 mb-6">
        <div className="grid grid-cols-6 gap-3">
          <select value={filters.level} onChange={e => setFilters({...filters, level: e.target.value})}
            className="border rounded px-3 py-2 text-sm">
            <option value="">全部等紀</option>
            <option value="finance">財務</option>
            <option value="admin">管理</option>
            <option value="operation">操作</option>
            <option value="attempt">嗗試</option>
          </select>
          <input type="text" placeholder="操作者信箥" value={filters.userEmail}
            onChange={e => setFilters({...filters, userEmail: e.target.value})}
            className="border rounded px-3 py-2 text-sm" />
          <input type="date" value={filters.dateFrom}
            onChange={e => setFilters({...filters, dateFrom: e.target.value})}
            className="border rounded px-3 py-2 text-sm" />
          <input type="date" value={filters.dateTo}
            onChange={e => setFilters({...filters, dateTo: e.target.value})}
            className="border rounded px-3 py-2 text-sm" />
          <input type="text" placeholder="關鍵字搜尋" value={filters.keyword}
            onChange={e => setFilters({...filters, keyword: e.target.value})}
            className="border rounded px-3 py-2 text-sm" />
          <div className="flex gap-2">
            <button type="submit" className="bg-zinc-600 text-white px-4 py-2 rounded text-sm hover:bg-zinc-700">搜尋</button>
            <button type="button" onClick={handleReset} className="border border-gray-300 px-4 py-2 rounded text-sm hover:bg-gray-50">清除</button>
          </div>
        </div>
      </form>

      {/* Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-500">載入中...</div>
        ) : logsError ? (
          <div className="p-4"><FetchErrorBanner message={logsError} onRetry={fetchLogs} /></div>
        ) : logs.length === 0 ? (
          <div className="p-8 text-center text-gray-500">無稳核日誌記錄</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 border-b sticky top-0 z-10">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-600">時鐓</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">使用者</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">操作</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">等紀</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">模約</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">記錄編號</th>
                <th className="px-4 py-3 text-center font-medium text-gray-600">詳情</th>
              </tr>
            </thead>
            <tbody>
              {logs.map(log => (
                <>
                  <tr key={log.id} className="border-b hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                      {new Date(log.createdAt).toLocaleString('zh-TW')}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium">{log.userName || '-'}</div>
                      <div className="text-xs text-gray-400">{log.userEmail || '-'}</div>
                    </td>
                    <td className="px-4 py-3">{ACTION_LABELS[log.action] || log.action}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded text-xs ${LEVEL_STYLES[log.level] || 'bg-gray-100 text-gray-800'}`}>
                        {LEVEL_LABELS[log.level] || log.level}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{log.targetModule || '-'}</td>
                    <td className="px-4 py-3 text-gray-600">{log.targetRecordNo || '-'}</td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}
                        className="text-zinc-500 hover:text-zinc-700"
                      >
                        {expandedId === log.id ? '收合' : '展開'}
                      </button>
                    </td>
                  </tr>
                  {expandedId === log.id && (
                    <tr key={`detail-${log.id}`} className="bg-zinc-50">
                      <td colSpan={7} className="px-6 py-4">
                        {log.note && <p className="text-sm text-gray-600 mb-3">備註：{log.note}</p>}
                        {log.ipAddress && <p className="text-xs text-gray-400 mb-3">IP: {log.ipAddress}</p>}
                        {renderStateDiff(log.beforeState, log.afterState)}
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        )}

        {/* Pagination */}
        {pagination.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t bg-gray-50">
            <span className="text-sm text-gray-500">
              共 {pagination.total} 筆，第 {pagination.page} / {pagination.totalPages} 頁
            </span>
            <div className="flex gap-2">
              <button
                disabled={pagination.page <= 1}
                onClick={() => fetchLogs(pagination.page - 1)}
                className="px-3 py-1 border rounded text-sm disabled:opacity-50 hover:bg-gray-100"
              >上一頁</button>
              <button
                disabled={pagination.page >= pagination.totalPages}
                onClick={() => fetchLogs(pagination.page + 1)}
                className="px-3 py-1 border rounded text-sm disabled:opacity-50 hover:bg-gray-100"
              >下一頁</button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
