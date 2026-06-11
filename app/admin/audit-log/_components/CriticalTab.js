'use client';

import { ACTION_LABELS, LEVEL_STYLES, LEVEL_LABELS } from '../_hooks/useAuditLog';

export default function CriticalTab({ criticalDecisions, criticalLoading, fetchCriticalDecisions }) {
  return (
    <div>
      {/* Critical Summary */}
      <div className="bg-white rounded-lg shadow p-4 mb-6 border-l-4 border-red-500">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-500">重大決策總數</p>
            <p className="text-2xl font-bold text-red-700">{criticalDecisions.length}</p>
          </div>
          <button
            onClick={fetchCriticalDecisions}
            className="bg-zinc-600 text-white px-4 py-2 rounded text-sm hover:bg-zinc-700"
          >
            重新載入
          </button>
        </div>
      </div>

      {/* Critical Decisions Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {criticalLoading ? (
          <div className="p-8 text-center text-gray-500">載入中...</div>
        ) : criticalDecisions.length === 0 ? (
          <div className="p-8 text-center text-gray-500">無重大決策記錄</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 border-b sticky top-0 z-10">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-600">時間</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">使用者</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">操作</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">等級</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">模組</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">備註</th>
              </tr>
            </thead>
            <tbody>
              {criticalDecisions.map(item => (
                <tr key={item.id} className="border-b hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                    {new Date(item.createdAt).toLocaleString('zh-TW')}
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium">{item.userName || '-'}</div>
                    <div className="text-xs text-gray-400">{item.userEmail || '-'}</div>
                  </td>
                  <td className="px-4 py-3">{ACTION_LABELS[item.action] || item.action}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded text-xs ${LEVEL_STYLES[item.level] || 'bg-gray-100 text-gray-800'}`}>
                      {LEVEL_LABELS[item.level] || item.level}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{item.targetModule || '-'}</td>
                  <td className="px-4 py-3 text-gray-600">{item.note || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
