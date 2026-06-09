'use client';

import { formatNum } from '@/lib/format-utils';
import { todayStr, parseLocalDate } from '@/lib/localDate';

export default function StatsTab({
  checks,
  monthlyStats,
  statsYear, setStatsYear,
  statsMonth, setStatsMonth,
  reissueLoading,
  handleReissue,
  openClear,
}) {
  const bouncedChecks = checks.filter(c => c.status === 'bounced');
  const today = todayStr();
  const overdueChecks = checks.filter(c => (c.status === 'pending' || c.status === 'due') && c.dueDate < today);

  return (
    <div className="space-y-6">
      {/* Month selector */}
      <div className="flex items-center gap-3 bg-gray-50 p-4 rounded-lg">
        <label htmlFor="f-25" className="text-base text-gray-600">統計月份:</label>
        <select id="f-25" value={statsYear} onChange={e => setStatsYear(parseInt(e.target.value))}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-base">
          {[2024, 2025, 2026, 2027].map(y => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
        <select value={statsMonth} onChange={e => setStatsMonth(parseInt(e.target.value))}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-base">
          {Array.from({ length: 12 }, (_, i) => (
            <option key={i + 1} value={i + 1}>{i + 1} 月</option>
          ))}
        </select>
      </div>

      {/* Monthly summary */}
      {monthlyStats && (
        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <h3 className="text-lg font-bold text-gray-700 mb-4">{statsYear} 年 {statsMonth} 月 統計</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-violet-50 p-4 rounded-lg">
              <div className="text-sm text-violet-500">總支票數</div>
              <div className="text-xl font-bold text-violet-700">{monthlyStats.total}</div>
              <div className="text-base text-violet-500">${formatNum(monthlyStats.totalAmount)}</div>
            </div>
            <div className="bg-red-50 p-4 rounded-lg">
              <div className="text-sm text-red-500">應付</div>
              <div className="text-xl font-bold text-red-700">{monthlyStats.payable?.count || 0}</div>
              <div className="text-base text-red-500">${formatNum(monthlyStats.payable?.total)}</div>
            </div>
            <div className="bg-green-50 p-4 rounded-lg">
              <div className="text-sm text-green-500">應收</div>
              <div className="text-xl font-bold text-green-700">{monthlyStats.receivable?.count || 0}</div>
              <div className="text-base text-green-500">${formatNum(monthlyStats.receivable?.total)}</div>
            </div>
            <div className="bg-blue-50 p-4 rounded-lg">
              <div className="text-sm text-blue-500">已兌現</div>
              <div className="text-xl font-bold text-blue-700">{monthlyStats.cleared?.count || 0}</div>
              <div className="text-base text-blue-500">${formatNum(monthlyStats.cleared?.total)}</div>
            </div>
          </div>
        </div>
      )}

      {/* Abnormal checks */}
      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <h3 className="text-lg font-bold text-gray-700 mb-4">異常支票</h3>

        {/* Bounced */}
        <div className="mb-4">
          <h4 className="text-base font-semibold text-red-600 mb-2 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-red-400"></span>
            退票 ({bouncedChecks.length})
          </h4>
          {bouncedChecks.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-base">
                <thead className="sticky top-0 z-10 bg-red-50">
                  <tr className="bg-red-50">
                    <th className="px-3 py-2 text-left">支票號碼</th>
                    <th className="px-3 py-2 text-left">類型</th>
                    <th className="px-3 py-2 text-right">金額</th>
                    <th className="px-3 py-2 text-left">到期日</th>
                    <th className="px-3 py-2 text-left">退票原因</th>
                    <th className="px-3 py-2 text-center">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {bouncedChecks.map(c => (
                    <tr key={c.id} className="border-t border-red-100">
                      <td className="px-3 py-2 font-mono text-sm">{c.checkNumber}</td>
                      <td className="px-3 py-2">{c.checkType === 'payable' ? '應付' : '應收'}</td>
                      <td className="px-3 py-2 text-right font-medium">${formatNum(c.amount)}</td>
                      <td className="px-3 py-2">{c.dueDate}</td>
                      <td className="px-3 py-2 text-sm text-gray-500">{c.bouncedReason || '-'}</td>
                      <td className="px-3 py-2 text-center">
                        {c.checkType === 'payable' ? (
                          (c.reissuedByChecks || []).length > 0 ? (
                            <span className="text-sm text-green-600">已重新開票 → {c.reissuedByChecks[0].checkNo}</span>
                          ) : (
                            <button
                              onClick={() => handleReissue(c)}
                              disabled={reissueLoading === c.id}
                              className="px-2 py-1 text-sm bg-amber-50 text-amber-700 rounded hover:bg-amber-100 disabled:opacity-50">
                              {reissueLoading === c.id ? '處理中…' : '重新開票'}
                            </button>
                          )
                        ) : (
                          <span className="text-gray-400">－</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-base text-gray-400 py-2">無退票記錄</div>
          )}
        </div>

        {/* Overdue */}
        <div>
          <h4 className="text-base font-semibold text-orange-600 mb-2 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-orange-400"></span>
            逾期未兌現 ({overdueChecks.length})
          </h4>
          {overdueChecks.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-base">
                <thead className="sticky top-0 z-10 bg-orange-50">
                  <tr className="bg-orange-50">
                    <th className="px-3 py-2 text-left">支票號碼</th>
                    <th className="px-3 py-2 text-left">類型</th>
                    <th className="px-3 py-2 text-right">金額</th>
                    <th className="px-3 py-2 text-left">到期日</th>
                    <th className="px-3 py-2 text-left">逾期天數</th>
                    <th className="px-3 py-2 text-center">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {overdueChecks.map(c => {
                    const diffDays = Math.ceil((new Date() - parseLocalDate(c.dueDate)) / (1000 * 60 * 60 * 24));
                    return (
                      <tr key={c.id} className="border-t border-orange-100">
                        <td className="px-3 py-2 font-mono text-sm">{c.checkNumber}</td>
                        <td className="px-3 py-2">{c.checkType === 'payable' ? '應付' : '應收'}</td>
                        <td className="px-3 py-2 text-right font-medium">${formatNum(c.amount)}</td>
                        <td className="px-3 py-2 text-red-600">{c.dueDate}</td>
                        <td className="px-3 py-2 text-red-600 font-bold">{diffDays} 天</td>
                        <td className="px-3 py-2 text-center">
                          <button onClick={() => openClear(c)}
                            className="px-2 py-1 text-sm bg-green-50 text-green-700 rounded hover:bg-green-100">兌現</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-base text-gray-400 py-2">無逾期記錄</div>
          )}
        </div>
      </div>
    </div>
  );
}
