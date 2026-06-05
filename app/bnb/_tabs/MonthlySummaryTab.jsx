'use client';

import ExportButtons from '@/components/ExportButtons';
import FetchErrorBanner from '@/components/FetchErrorBanner';
import WhQuickBtns from '../_components/WhQuickBtns';
import { inputCls, btnCls } from '../_constants';

const MONTHLY_EXPORT_COLS = [
  { header: '月份',     key: 'month' },
  { header: '間數',     key: 'rooms',        format: 'number' },
  { header: '住宿房費', key: 'totalRevenue', format: 'number' },
  { header: '其他消費', key: 'otherCharge',  format: 'number' },
  { header: '訂金匯款', key: 'payDeposit',   format: 'number' },
  { header: '當天匯款', key: 'payTransfer',  format: 'number' },
  { header: '刷卡',     key: 'payCard',      format: 'number' },
  { header: '現金',     key: 'payCash',      format: 'number' },
  { header: '住宿卷',   key: 'payVoucher',   format: 'number' },
  { header: '手續費',   key: 'cardFee',      format: 'number' },
  { header: '淨收入',   key: 'netRevenue',   format: 'number' },
];

export default function MonthlySummaryTab({
  summaryYear, setSummaryYear,
  summaryWarehouse, setSummaryWarehouse,
  summaryRows, summaryLoading,
  fetchSummary,
  warehouseList,
  doPrint,
  summaryError,
}) {
  return (
    <div>
      {summaryError && <div className="mb-4"><FetchErrorBanner message={summaryError} onRetry={fetchSummary} /></div>}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <label htmlFor="f-8" className="text-sm text-gray-600">年份</label>
        <select id="f-8" value={summaryYear} onChange={e => setSummaryYear(e.target.value)} className={inputCls}>
          {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <label htmlFor="f-28" className="text-sm text-gray-600">館別</label>
        <select id="f-28" value={summaryWarehouse} onChange={e => setSummaryWarehouse(e.target.value)} className={inputCls}>
          <option value="">全部</option>
          {warehouseList.map(w => <option key={w} value={w}>{w}</option>)}
        </select>
        <WhQuickBtns list={warehouseList} value={summaryWarehouse} onChange={setSummaryWarehouse} />
        <button onClick={fetchSummary} className={`${btnCls} bg-indigo-50 text-indigo-700`}>重新整理</button>
        <div className="ml-auto flex gap-2">
          <ExportButtons
            data={summaryRows}
            columns={MONTHLY_EXPORT_COLS}
            filename={`月收入總表_${summaryYear}`}
            title={`月收入總表 ${summaryYear}`}
          />
          <button
            onClick={() => doPrint(
              `月收入總表 ${summaryYear}`,
              MONTHLY_EXPORT_COLS.map(c => c.header),
              summaryRows.map(r => MONTHLY_EXPORT_COLS.map(c => r[c.key] ?? ''))
            )}
            className={`${btnCls} text-gray-600`}
          >列印</button>
        </div>
      </div>

      <p className="text-xs text-gray-400 mb-3">
        ※ 依「入住月份」分組；跨月入住（如月底入住隔月退房）整筆計入入住當月，退房月不另計。訂房明細中標有
        <span className="mx-1 px-1 py-0.5 rounded bg-orange-100 text-orange-600 text-[10px] font-medium">跨月</span>
        的訂單即為此情況。
      </p>
      {summaryLoading ? (
        <div className="text-center py-16 text-gray-400">載入中…</div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 tbl-wrap">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-indigo-50">
              <tr className="bg-indigo-50 text-indigo-800 text-xs">
                {['月份','間數','住宿房費','其他消費','訂金匯款','當天匯款','刷卡','現金','住宿卷','手續費','淨收入','鎖帳'].map(h => (
                  <th key={h} className="px-3 py-2 text-right first:text-left font-medium whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {summaryRows.length === 0 && (
                <tr><td colSpan={12} className="text-center py-10 text-gray-400">無資料</td></tr>
              )}
              {summaryRows.map(r => {
                const lockRatio = r.rooms > 0 ? (r.lockedCount || 0) / r.rooms : 0;
                const lockColor = lockRatio === 1 ? 'text-green-600 font-semibold' : lockRatio > 0 ? 'text-amber-600' : 'text-gray-300';
                return (
                <tr key={r.month} className="hover:bg-gray-50">
                  <td className="px-3 py-2 font-medium">{r.month}</td>
                  <td className="px-3 py-2 text-right">{r.rooms}</td>
                  <td className="px-3 py-2 text-right">{Math.round(r.totalRevenue).toLocaleString()}</td>
                  <td className="px-3 py-2 text-right text-gray-500">{Math.round(r.otherCharge).toLocaleString()}</td>
                  <td className="px-3 py-2 text-right text-blue-600">{Math.round(r.payDeposit).toLocaleString()}</td>
                  <td className="px-3 py-2 text-right text-teal-600">{Math.round(r.payTransfer).toLocaleString()}</td>
                  <td className="px-3 py-2 text-right text-purple-600">{Math.round(r.payCard).toLocaleString()}</td>
                  <td className="px-3 py-2 text-right text-green-600">{Math.round(r.payCash).toLocaleString()}</td>
                  <td className="px-3 py-2 text-right text-amber-600">{Math.round(r.payVoucher).toLocaleString()}</td>
                  <td className="px-3 py-2 text-right text-red-400">({Math.round(r.cardFee).toLocaleString()})</td>
                  <td className="px-3 py-2 text-right font-semibold text-indigo-700">{Math.round(r.netRevenue).toLocaleString()}</td>
                  <td className={`px-3 py-2 text-right text-xs ${lockColor}`} title={`${r.lockedCount || 0}/${r.rooms} 筆已鎖帳`}>
                    {r.lockedCount || 0}/{r.rooms}
                  </td>
                </tr>
              );})}
              {summaryRows.length > 0 && (() => {
                const tot = summaryRows.reduce((a, r) => ({
                  rooms: a.rooms + r.rooms,
                  totalRevenue: a.totalRevenue + r.totalRevenue,
                  otherCharge: a.otherCharge + r.otherCharge,
                  payDeposit: a.payDeposit + r.payDeposit,
                  payTransfer: a.payTransfer + (r.payTransfer || 0),
                  payCard: a.payCard + r.payCard,
                  payCash: a.payCash + r.payCash,
                  payVoucher: a.payVoucher + r.payVoucher,
                  cardFee: a.cardFee + r.cardFee,
                  netRevenue: a.netRevenue + r.netRevenue,
                }), { rooms:0, totalRevenue:0, otherCharge:0, payDeposit:0, payTransfer:0, payCard:0, payCash:0, payVoucher:0, cardFee:0, netRevenue:0 });
                return (
                  <tr className="bg-indigo-50 font-bold text-indigo-800">
                    <td className="px-3 py-2">總計</td>
                    <td className="px-3 py-2 text-right">{tot.rooms}</td>
                    <td className="px-3 py-2 text-right">{Math.round(tot.totalRevenue).toLocaleString()}</td>
                    <td className="px-3 py-2 text-right">{Math.round(tot.otherCharge).toLocaleString()}</td>
                    <td className="px-3 py-2 text-right">{Math.round(tot.payDeposit).toLocaleString()}</td>
                    <td className="px-3 py-2 text-right">{Math.round(tot.payTransfer).toLocaleString()}</td>
                    <td className="px-3 py-2 text-right">{Math.round(tot.payCard).toLocaleString()}</td>
                    <td className="px-3 py-2 text-right">{Math.round(tot.payCash).toLocaleString()}</td>
                    <td className="px-3 py-2 text-right">{Math.round(tot.payVoucher).toLocaleString()}</td>
                    <td className="px-3 py-2 text-right">({Math.round(tot.cardFee).toLocaleString()})</td>
                    <td className="px-3 py-2 text-right">{Math.round(tot.netRevenue).toLocaleString()}</td>
                    <td className="px-3 py-2 text-right text-xs">
                      {summaryRows.reduce((s, r) => s + (r.lockedCount || 0), 0)}/{tot.rooms}
                    </td>
                  </tr>
                );
              })()}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
