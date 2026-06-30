'use client';

import Link from 'next/link';
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

function UtilityOccupancyPivot({ data }) {
  const months = data.months || [];
  const yt = data.yearTotals || {};
  const num = (v, opts) => {
    if (v == null || Number.isNaN(v)) return '—';
    const n = Number(v);
    if (opts?.decimals != null) return n.toLocaleString('zh-TW', { minimumFractionDigits: opts.decimals, maximumFractionDigits: opts.decimals });
    return n.toLocaleString('zh-TW', { maximumFractionDigits: 0 });
  };

  const rows = [
    { key: 'elecAmount', label: '電費（元）', pick: (m) => m.elecAmount },
    { key: 'elecUsage', label: '電量（度）', pick: (m) => m.elecUsage },
    { key: 'waterAmount', label: '水費（元）', pick: (m) => m.waterAmount },
    { key: 'waterUsage', label: '水量（度）', pick: (m) => m.waterUsage },
    { key: 'guest', label: '住宿人數（PMS 月合計）', pick: (m) => m.guestCount },
    { key: 'occ', label: '入住間數（PMS 月合計）', pick: (m) => m.occupiedRooms },
    { key: 'epg', label: '每人負擔電費（元）', pick: (m) => m.elecPerGuest, decimals: 1 },
    { key: 'epo', label: '每入住間數電費（元）', pick: (m) => m.elecPerOccRoom, decimals: 1 },
    { key: 'eug', label: '每人用電（度）', pick: (m) => m.elecUsagePerGuest, decimals: 2 },
  ];

  const yearPick = {
    elecAmount: yt.elecAmount,
    elecUsage: yt.elecUsage,
    waterAmount: yt.waterAmount,
    waterUsage: yt.waterUsage,
    guest: yt.guestCount,
    occ: yt.occupiedRooms,
    epg: yt.elecPerGuest,
    epo: yt.elecPerOccRoom,
    eug: yt.guestCount > 0 ? yt.elecUsage / yt.guestCount : null,
  };

  return (
    <div className="space-y-4">
      {data.truncated && <TruncationBanner />}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-gray-800">
          {data.warehouse}　民國 {data.rocYear} 年（西元 {data.adYear}）— 水電與住宿對照
        </h3>
        <Link
          href="/utility-bills"
          className="text-xs text-cyan-700 hover:underline"
        >
          前往水電費 → 年度分析
        </Link>
      </div>
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-x-auto">
        <table className="w-full text-sm border-collapse min-w-[920px]">
          <thead className="sticky top-0 z-10 bg-cyan-700">
            <tr className="bg-cyan-700 text-white">
              <th className="px-3 py-2 text-left font-medium whitespace-nowrap sticky left-0 z-10 bg-cyan-700 min-w-[200px]">指標</th>
              {months.map((m) => (
                <th key={m.month} className="px-2 py-2 text-right font-medium whitespace-nowrap bg-cyan-700">
                  {String(m.month).padStart(2, '0')} 月
                </th>
              ))}
              <th className="px-3 py-2 text-right font-medium whitespace-nowrap border-l border-cyan-500 bg-cyan-800">全年</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.key} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/80'}>
                <td className="px-3 py-1.5 text-gray-700 whitespace-nowrap sticky left-0 z-10 bg-inherit border-r border-gray-100 font-medium">
                  {r.label}
                </td>
                {months.map((m) => (
                  <td key={m.month} className="px-2 py-1.5 text-right tabular-nums text-gray-800">
                    {num(r.pick(m), { decimals: r.decimals })}
                  </td>
                ))}
                <td className="px-3 py-1.5 text-right font-semibold tabular-nums text-gray-900 border-l border-gray-200 bg-gray-50/90">
                  {num(yearPick[r.key], { decimals: r.decimals })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data.note && <p className="text-xs text-gray-400 px-1">{data.note}</p>}
    </div>
  );
}

export default function UtilityOccTab({
  warehouses,
  utilOccWarehouse, setUtilOccWarehouse,
  utilOccRocYear, setUtilOccRocYear,
  utilOccLoading, utilOccData,
  fetchUtilityOccupancy,
}) {
  return (
    <div className="space-y-5">
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label htmlFor="f-24" className="block text-xs text-gray-500 mb-1">館別</label>
            <select id="f-24"
              value={utilOccWarehouse}
              onChange={e => setUtilOccWarehouse(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-400 min-w-[140px]"
            >
              <option value="">請選擇</option>
              {warehouses.map(w => (
                <option key={w} value={w}>{w}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="f-32" className="block text-xs text-gray-500 mb-1">年度（民國，與水電帳單一致）</label>
            <input id="f-32"
              type="number"
              value={utilOccRocYear}
              onChange={e => setUtilOccRocYear(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-28 focus:outline-none focus:ring-2 focus:ring-cyan-400"
              placeholder="例：114"
            />
          </div>
          <button
            type="button"
            onClick={fetchUtilityOccupancy}
            className="px-4 py-1.5 bg-cyan-600 text-white rounded-lg text-sm font-medium hover:bg-cyan-700"
          >
            查詢
          </button>
        </div>
        <p className="mt-3 text-xs text-gray-500 leading-relaxed">
          將同館別、同民國年之<strong>水電帳單</strong>與 <strong>PMS 日匯入</strong>（住宿人數、入住間數）按月對齊。
          可比較「每人電費」「每入住間數電費」等指標；資料來源與「水電費 → 年度分析」相同，此處另加入營運量體。
        </p>
      </div>

      {utilOccLoading ? (
        <Loading text="載入水電與住宿資料..." />
      ) : utilOccData ? (
        <UtilityOccupancyPivot data={utilOccData} />
      ) : (
        <div className="text-center py-16 text-gray-400 bg-white rounded-xl border border-gray-100">
          <p className="text-3xl mb-3">⚡🏨</p>
          <p className="font-medium">請選擇館別與民國年後按「查詢」</p>
          <p className="text-xs mt-2 max-w-lg mx-auto text-gray-400">
            須已上傳該年各月水電帳單，且 PMS 有匯入對應西元年（民國年 + 1911）之住宿批次。
          </p>
        </div>
      )}
    </div>
  );
}
