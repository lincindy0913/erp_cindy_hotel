'use client';

import TruncationBanner from './TruncationBanner';

const Loading = ({ text = '載入中...' }) => (
  <div className="flex items-center justify-center py-20 text-gray-400">
    <svg className="animate-spin h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
    </svg>
    {text}
  </div>
);

function OccupancyStatsDataView({ payload }) {
  const { groupBy, data } = payload || {};
  if (!data || !Array.isArray(data)) {
    return <div className="text-center py-10 text-gray-400">無資料</div>;
  }

  if (groupBy === 'month') {
    return (
      <>
        {payload.truncated && <TruncationBanner />}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-5 py-3 border-b bg-gray-50">
          <p className="font-semibold text-sm text-gray-700">依月彙總</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead className="bg-gray-50 sticky top-0 z-10">
              <tr>
                <th className="px-4 py-2 text-left text-xs text-gray-500">館別</th>
                <th className="px-4 py-2 text-left text-xs text-gray-500">年月</th>
                <th className="px-4 py-2 text-right text-xs text-gray-500">住宿人數</th>
                <th className="px-4 py-2 text-right text-xs text-gray-500">早餐人數</th>
                <th className="px-4 py-2 text-right text-xs text-gray-500">入住間數</th>
                <th className="px-4 py-2 text-right text-xs text-gray-500">總房數累計</th>
                <th className="px-4 py-2 text-right text-xs text-gray-500">天數列數</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.map((row, i) => (
                <tr key={`${row.warehouse}-${row.yearMonth}-${i}`} className="hover:bg-gray-50">
                  <td className="px-4 py-2 font-medium text-gray-800">{row.warehouse || '—'}</td>
                  <td className="px-4 py-2 text-gray-600">{row.yearMonth}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{Number(row.guestCount || 0).toLocaleString()}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{Number(row.breakfastCount || 0).toLocaleString()}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{Number(row.occupiedRooms || 0).toLocaleString()}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{Number(row.roomCount || 0).toLocaleString()}</td>
                  <td className="px-4 py-2 text-right text-gray-500">{row.dayCount ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      </>
    );
  }

  return (
    <>
      {payload.truncated && <TruncationBanner />}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="px-5 py-3 border-b bg-gray-50 flex items-center justify-between flex-wrap gap-2">
        <p className="font-semibold text-sm text-gray-700">依日明細</p>
        <p className="text-xs text-gray-400">共 {data.length} 筆批次</p>
      </div>
      <div className="overflow-x-auto max-h-[70vh] overflow-y-auto">
        <table className="w-full text-sm min-w-[800px]">
          <thead className="bg-gray-50 sticky top-0 z-10">
            <tr>
              <th className="px-4 py-2 text-left text-xs text-gray-500">館別</th>
              <th className="px-4 py-2 text-left text-xs text-gray-500">營業日</th>
              <th className="px-4 py-2 text-right text-xs text-gray-500">住宿人數</th>
              <th className="px-4 py-2 text-right text-xs text-gray-500">早餐</th>
              <th className="px-4 py-2 text-right text-xs text-gray-500">入住間數</th>
              <th className="px-4 py-2 text-right text-xs text-gray-500">總房數</th>
              <th className="px-4 py-2 text-right text-xs text-gray-500">住房率</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {data.map((row, i) => (
              <tr key={`${row.warehouse}-${row.businessDate}-${i}`} className="hover:bg-gray-50">
                <td className="px-4 py-2 font-medium text-gray-800">{row.warehouse || '—'}</td>
                <td className="px-4 py-2 text-gray-600 whitespace-nowrap">{row.businessDate || '—'}</td>
                <td className="px-4 py-2 text-right tabular-nums">{row.guestCount != null ? Number(row.guestCount).toLocaleString() : '—'}</td>
                <td className="px-4 py-2 text-right tabular-nums">{row.breakfastCount != null ? Number(row.breakfastCount).toLocaleString() : '—'}</td>
                <td className="px-4 py-2 text-right tabular-nums">{row.occupiedRooms != null ? Number(row.occupiedRooms).toLocaleString() : '—'}</td>
                <td className="px-4 py-2 text-right tabular-nums">{row.roomCount != null ? Number(row.roomCount).toLocaleString() : '—'}</td>
                <td className="px-4 py-2 text-right text-gray-600">
                  {row.occupancyRate != null ? `${Number(row.occupancyRate).toFixed(1)}%` : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
    </>
  );
}

export default function OccupancyStatsTab({
  warehouses,
  occStatsStart, setOccStatsStart,
  occStatsEnd, setOccStatsEnd,
  occStatsWarehouse, setOccStatsWarehouse,
  occStatsGroupBy, setOccStatsGroupBy,
  occStatsLoading, occStatsPayload,
  fetchOccStats,
}) {
  return (
    <div className="space-y-5">
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label htmlFor="f-20" className="block text-xs text-gray-500 mb-1">起始日期</label>
            <input id="f-20"
              type="date"
              value={occStatsStart}
              onChange={(e) => setOccStatsStart(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-400"
            />
          </div>
          <div>
            <label htmlFor="f-21" className="block text-xs text-gray-500 mb-1">結束日期</label>
            <input id="f-21"
              type="date"
              value={occStatsEnd}
              onChange={(e) => setOccStatsEnd(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-400"
            />
          </div>
          <div>
            <label htmlFor="f-22" className="block text-xs text-gray-500 mb-1">館別（選填）</label>
            <select id="f-22"
              value={occStatsWarehouse}
              onChange={(e) => setOccStatsWarehouse(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-400 min-w-[140px]"
            >
              <option value="">全部館別（依日／月分列）</option>
              {warehouses.map((w) => (
                <option key={w} value={w}>
                  {w}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="f-31" className="block text-xs text-gray-500 mb-1">彙總方式</label>
            <select id="f-31"
              value={occStatsGroupBy}
              onChange={(e) => setOccStatsGroupBy(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-400"
            >
              <option value="day">依日</option>
              <option value="month">依月</option>
            </select>
          </div>
          <button
            type="button"
            onClick={fetchOccStats}
            className="px-4 py-1.5 bg-cyan-600 text-white rounded-lg text-sm font-medium hover:bg-cyan-700"
          >
            查詢
          </button>
        </div>
        <p className="mt-3 text-xs text-gray-500 leading-relaxed">
          資料來源為 <strong>PMS 匯入批次</strong>（住宿人數、早餐人數、入住間數等）。此頁<strong>不含</strong>採購金額或成本；成本分析請用「住宿成本效益」。
        </p>
      </div>
      {occStatsLoading ? (
        <Loading text="載入營運入住統計..." />
      ) : occStatsPayload ? (
        <OccupancyStatsDataView payload={occStatsPayload} />
      ) : (
        <div className="text-center py-16 text-gray-400">
          <p className="text-3xl mb-3">📊</p>
          <p className="font-medium">請設定日期區間後按「查詢」</p>
        </div>
      )}
    </div>
  );
}
