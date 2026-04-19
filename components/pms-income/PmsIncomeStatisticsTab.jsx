'use client';

import { formatNumber } from './pmsIncomeFormatters';
import PmsIncomeStatsChart from './PmsIncomeStatsChart';

export default function PmsIncomeStatisticsTab({
  statsYear,
  setStatsYear,
  statsMonth,
  setStatsMonth,
  fetchStats,
  loading,
  statsData,
}) {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <select
          value={statsYear}
          onChange={(e) => setStatsYear(parseInt(e.target.value, 10))}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-teal-500"
        >
          {[2024, 2025, 2026, 2027].map((y) => (
            <option key={y} value={y}>
              {y}年
            </option>
          ))}
        </select>
        <select
          value={statsMonth}
          onChange={(e) => setStatsMonth(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-teal-500"
        >
          <option value="">全年總覽</option>
          {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
            <option key={m} value={m}>
              {m}月
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={fetchStats}
          className="px-3 py-2 text-sm border border-teal-300 text-teal-700 rounded-lg hover:bg-teal-50"
        >
          查詢
        </button>
      </div>

      {loading ? (
        <div className="text-center py-8 text-gray-400">載入中...</div>
      ) : statsData ? (
        <>
          <div className="bg-white rounded-lg shadow-sm border p-6">
            <h3 className="text-sm font-bold text-gray-700 mb-4">
              {statsMonth ? `${statsYear}年${statsMonth}月 - 科目分佈` : `${statsYear}年 - 月度收入趨勢`}
            </h3>
            <PmsIncomeStatsChart statsData={statsData} />
          </div>

          {statsMonth && statsData.byAccountingCode && (
            <div className="bg-white rounded-lg shadow-sm border p-4">
              <h3 className="text-sm font-bold text-gray-700 mb-3">科目明細</h3>
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-left">
                    <th className="px-3 py-2 font-medium">科目代碼</th>
                    <th className="px-3 py-2 font-medium">科目名稱</th>
                    <th className="px-3 py-2 font-medium text-right">貸方金額</th>
                    <th className="px-3 py-2 font-medium text-right">借方金額</th>
                    <th className="px-3 py-2 font-medium text-right">淨額</th>
                  </tr>
                </thead>
                <tbody>
                  {statsData.byAccountingCode.map((item, i) => (
                    <tr key={i} className="border-t hover:bg-gray-50">
                      <td className="px-3 py-2 font-mono text-xs">{item.accountingCode}</td>
                      <td className="px-3 py-2">{item.accountingName}</td>
                      <td className="px-3 py-2 text-right text-teal-700">{formatNumber(item.credit)}</td>
                      <td className="px-3 py-2 text-right text-amber-700">{formatNumber(item.debit)}</td>
                      <td
                        className={`px-3 py-2 text-right font-medium ${item.net >= 0 ? 'text-teal-700' : 'text-red-600'}`}
                      >
                        {formatNumber(item.net)}
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-gray-300 font-bold">
                    <td className="px-3 py-2" colSpan={2}>
                      合計
                    </td>
                    <td className="px-3 py-2 text-right text-teal-700">
                      {formatNumber(statsData.byAccountingCode.reduce((s, i) => s + i.credit, 0))}
                    </td>
                    <td className="px-3 py-2 text-right text-amber-700">
                      {formatNumber(statsData.byAccountingCode.reduce((s, i) => s + i.debit, 0))}
                    </td>
                    <td className="px-3 py-2 text-right text-teal-800">{formatNumber(statsData.total)}</td>
                  </tr>
                </tbody>
              </table>

              {Object.keys(statsData.byWarehouse || {}).length > 0 && (
                <div className="mt-6">
                  <h4 className="text-sm font-bold text-gray-700 mb-3">館別匯入統計</h4>
                  <div className="grid grid-cols-3 gap-4">
                    {Object.entries(statsData.byWarehouse).map(([wh, data]) => (
                      <div key={wh} className="border rounded-lg p-3">
                        <div className="font-medium text-teal-800 mb-2">{wh}</div>
                        <div className="grid grid-cols-2 gap-1 text-xs">
                          <span className="text-gray-500">貸方:</span>
                          <span className="text-right text-teal-700">{formatNumber(data.credit)}</span>
                          <span className="text-gray-500">借方:</span>
                          <span className="text-right text-amber-700">{formatNumber(data.debit)}</span>
                          <span className="text-gray-500">淨額:</span>
                          <span className="text-right font-medium">{formatNumber(data.net)}</span>
                          <span className="text-gray-500">匯入天數:</span>
                          <span className="text-right">{data.importedDays}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {!statsMonth && Array.isArray(statsData) && (
            <div className="bg-white rounded-lg shadow-sm border p-4">
              <h3 className="text-sm font-bold text-gray-700 mb-3">月度摘要表</h3>
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-left">
                    <th className="px-3 py-2 font-medium">月份</th>
                    <th className="px-3 py-2 font-medium text-right">淨收入</th>
                    <th className="px-3 py-2 font-medium text-center">匯入天數</th>
                    <th className="px-3 py-2 font-medium text-center">當月天數</th>
                    <th className="px-3 py-2 font-medium text-center">完成率</th>
                    <th className="px-3 py-2 font-medium">涵蓋館別</th>
                  </tr>
                </thead>
                <tbody>
                  {statsData.map((m, i) => (
                    <tr key={i} className="border-t hover:bg-gray-50">
                      <td className="px-3 py-2 font-medium">{m.month}月</td>
                      <td
                        className={`px-3 py-2 text-right font-medium ${
                          m.total >= 0 ? 'text-teal-700' : 'text-red-600'
                        }`}
                      >
                        {formatNumber(m.total)}
                      </td>
                      <td className="px-3 py-2 text-center">{m.importedDays}</td>
                      <td className="px-3 py-2 text-center">{m.totalDays}</td>
                      <td className="px-3 py-2 text-center">
                        {m.totalDays > 0 ? `${Math.round((m.importedDays / m.totalDays) * 100)}%` : '-'}
                      </td>
                      <td className="px-3 py-2 text-xs text-gray-500">
                        {Object.keys(m.byWarehouse || {}).join(', ') || '-'}
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-gray-300 font-bold">
                    <td className="px-3 py-2">全年合計</td>
                    <td className="px-3 py-2 text-right text-teal-800">
                      {formatNumber(statsData.reduce((s, m) => s + m.total, 0))}
                    </td>
                    <td className="px-3 py-2 text-center">
                      {statsData.reduce((s, m) => s + m.importedDays, 0)}
                    </td>
                    <td className="px-3 py-2 text-center">
                      {statsData.reduce((s, m) => s + m.totalDays, 0)}
                    </td>
                    <td className="px-3 py-2 text-center">
                      {(() => {
                        const totalDays = statsData.reduce((s, m) => s + m.totalDays, 0);
                        const importedDays = statsData.reduce((s, m) => s + m.importedDays, 0);
                        return totalDays > 0 ? `${Math.round((importedDays / totalDays) * 100)}%` : '-';
                      })()}
                    </td>
                    <td className="px-3 py-2" />
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : (
        <div className="text-center py-8 text-gray-400">無資料</div>
      )}
    </div>
  );
}
