'use client';

import FetchErrorBanner from '@/components/FetchErrorBanner';
import { inputCls } from '../_constants';

const STATUS_COLORS = {
  '已退房': 'bg-gray-100 text-gray-600',
  '已入住': 'bg-green-100 text-green-700',
  '已預訂': 'bg-blue-100 text-blue-700',
  '已刪除': 'bg-red-100 text-red-500',
  '取消':   'bg-orange-100 text-orange-600',
  '未入住': 'bg-yellow-100 text-yellow-700',
};
const getStatusColor = s => STATUS_COLORS[s] ?? 'bg-gray-100 text-gray-600';

export default function GuestHistoryTab({
  ghSearch, setGhSearch, ghData, ghLoading, ghSearched, ghError, fetchGuestHistory,
}) {
  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <input type="text" value={ghSearch} onChange={e => setGhSearch(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && fetchGuestHistory()}
          placeholder="輸入房客姓名搜尋…" className={inputCls + ' flex-1 max-w-xs'} />
        <button onClick={fetchGuestHistory} disabled={ghLoading}
          className="px-4 py-1.5 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50">
          {ghLoading ? '搜尋中…' : '搜尋'}
        </button>
      </div>
      {ghError && <FetchErrorBanner message={ghError} onRetry={fetchGuestHistory} />}
      {ghSearched && !ghLoading && (
        ghData.length === 0 ? (
          <div className="text-center py-10 text-gray-400">找不到「{ghSearch}」的訂房記錄</div>
        ) : (
          <>
            {(() => {
              const nonDel = ghData.filter(r => r.status !== '已刪除');
              const rev    = nonDel.reduce((s, r) => s + Number(r.roomCharge) + Number(r.otherCharge), 0);
              const nights = nonDel.reduce((s, r) => s + Math.max(0, Math.round((new Date(r.checkOutDate) - new Date(r.checkInDate)) / 86400000)), 0);
              return (
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                    <div className="text-xs text-gray-400 mb-1">入住次數</div>
                    <div className="text-2xl font-bold text-indigo-600">{nonDel.length}</div>
                  </div>
                  <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                    <div className="text-xs text-gray-400 mb-1">總住宿天數</div>
                    <div className="text-2xl font-bold text-teal-600">{nights} 晚</div>
                  </div>
                  <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                    <div className="text-xs text-gray-400 mb-1">消費總額</div>
                    <div className="text-2xl font-bold text-emerald-600">NT$ {rev.toLocaleString()}</div>
                  </div>
                </div>
              );
            })()}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10 bg-gray-50">
                  <tr className="bg-gray-50 text-xs text-gray-400 border-b">
                    <th className="px-4 py-2 text-left font-medium">入住月</th>
                    <th className="px-4 py-2 text-left font-medium">館別</th>
                    <th className="px-4 py-2 text-left font-medium">房號</th>
                    <th className="px-4 py-2 text-left font-medium">入住日</th>
                    <th className="px-4 py-2 text-left font-medium">退房日</th>
                    <th className="px-4 py-2 text-right font-medium">房費</th>
                    <th className="px-4 py-2 text-left font-medium">來源</th>
                    <th className="px-4 py-2 text-left font-medium">狀態</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {ghData.map(r => (
                    <tr key={r.id} className={`hover:bg-gray-50 ${r.status === '已刪除' ? 'opacity-40' : ''}`}>
                      <td className="px-4 py-2 text-gray-500 text-xs">{r.importMonth}</td>
                      <td className="px-4 py-2 text-gray-400 text-xs">{r.warehouse}</td>
                      <td className="px-4 py-2 text-gray-600 text-xs">{r.roomNo || '—'}</td>
                      <td className="px-4 py-2 text-gray-700">{r.checkInDate}</td>
                      <td className="px-4 py-2 text-gray-500 text-xs">{r.checkOutDate}</td>
                      <td className="px-4 py-2 text-right font-medium text-emerald-600">
                        NT$ {(Number(r.roomCharge) + Number(r.otherCharge)).toLocaleString()}
                      </td>
                      <td className="px-4 py-2 text-xs text-gray-500">{r.source}</td>
                      <td className="px-4 py-2">
                        <span className={`text-[11px] px-1.5 py-0.5 rounded ${getStatusColor(r.status)}`}>{r.status || '—'}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )
      )}
      {!ghSearched && <div className="text-center py-10 text-gray-300">輸入房客姓名後按 Enter 或點擊搜尋</div>}
    </div>
  );
}
