'use client';

import React from 'react';
import ExportButtons from '@/components/ExportButtons';
import FetchErrorBanner from '@/components/FetchErrorBanner';
import WhQuickBtns from '../_components/WhQuickBtns';
import { inputCls, btnCls } from '../_constants';

export default function DailyRevTab({
  drMonth, setDrMonth,
  drWarehouse, setDrWarehouse,
  drData, drLoading,
  drExpandDay, setDrExpandDay,
  fetchDailyRevenue,
  warehouseList,
  doPrint,
  drError,
}) {
  return (
    <div>
      {drError && <div className="mb-4"><FetchErrorBanner message={drError} onRetry={fetchDailyRevenue} /></div>}
      {/* 搜尋列 */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-4 flex flex-wrap gap-3 items-end">
        <div>
          <label htmlFor="f-6" className="block text-xs text-gray-500 mb-1">月份</label>
          <input id="f-6" type="month" value={drMonth} onChange={e => setDrMonth(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label htmlFor="f-7" className="block text-xs text-gray-500 mb-1">館別</label>
          <select id="f-7" value={drWarehouse} onChange={e => setDrWarehouse(e.target.value)} className={inputCls}>
            {(warehouseList.length ? warehouseList : [drWarehouse]).map(w => <option key={w} value={w}>{w}</option>)}
          </select>
          <WhQuickBtns list={warehouseList} value={drWarehouse} onChange={setDrWarehouse} />
        </div>
        <button onClick={fetchDailyRevenue} disabled={drLoading}
          className={`${btnCls} bg-indigo-50 text-indigo-700 disabled:opacity-40`}>
          {drLoading ? '查詢中…' : '查詢'}
        </button>
        {drData && (
          <>
            <div className="ml-auto flex gap-2">
              <ExportButtons
                data={(drData?.days || []).map(d => ({
                  ...d,
                  revenue: d.roomCharge + d.otherCharge,
                  netRevenue: d.roomCharge + d.otherCharge - d.cardFee,
                  dateLabel: `${d.day}日`,
                }))}
                columns={[
                  { header: '日期',     key: 'dateLabel' },
                  { header: '筆數',     key: 'count',       format: 'number' },
                  { header: '房費',     key: 'roomCharge',  format: 'number' },
                  { header: '消費',     key: 'otherCharge', format: 'number' },
                  { header: '營收合計', key: 'revenue',     format: 'number' },
                  { header: '訂金',     key: 'payDeposit',  format: 'number' },
                  { header: '當天匯款', key: 'payTransfer', format: 'number' },
                  { header: '刷卡',     key: 'payCard',     format: 'number' },
                  { header: '現金',     key: 'payCash',     format: 'number' },
                  { header: '住宿卷',   key: 'payVoucher',  format: 'number' },
                  { header: '手續費',   key: 'cardFee',     format: 'number' },
                ]}
                filename={`每日收入_${drMonth}`}
                title={`每日收入 ${drMonth}（${drWarehouse}）`}
              />
              <button
                onClick={() => {
                  const cols = ['日期','筆數','房費','消費','營收','訂金','當天匯款','刷卡','現金','住宿卷','手續費'];
                  const rows = (drData?.days || []).filter(d => d.count > 0).map(d => [
                    `${d.day}日`,
                    d.count,
                    d.roomCharge.toLocaleString(),
                    d.otherCharge > 0 ? d.otherCharge.toLocaleString() : '',
                    (d.roomCharge + d.otherCharge).toLocaleString(),
                    d.payDeposit  > 0 ? d.payDeposit.toLocaleString()  : '',
                    d.payTransfer > 0 ? d.payTransfer.toLocaleString() : '',
                    d.payCard     > 0 ? d.payCard.toLocaleString()     : '',
                    d.payCash     > 0 ? d.payCash.toLocaleString()     : '',
                    d.payVoucher  > 0 ? d.payVoucher.toLocaleString()  : '',
                    d.cardFee     > 0 ? d.cardFee.toLocaleString()     : '',
                  ]);
                  const t = drData.totals;
                  rows.push(['合計', t.count,
                    t.roomCharge.toLocaleString(), t.otherCharge.toLocaleString(),
                    (t.roomCharge + t.otherCharge).toLocaleString(),
                    t.payDeposit.toLocaleString(), t.payTransfer.toLocaleString(), t.payCard.toLocaleString(),
                    t.payCash.toLocaleString(), t.payVoucher.toLocaleString(),
                    t.cardFee.toLocaleString(),
                  ]);
                  doPrint(`每日收入 ${drMonth}（${drWarehouse}）`, cols, rows);
                }}
                className={`${btnCls} text-gray-600`}
              >列印</button>
            </div>
          </>
        )}
      </div>

      {/* 摘要卡 */}
      {drData && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3 mb-4">
          {[
            { label: '營業天數', val: drData.days.filter(d => d.count > 0).length, color: '' },
            { label: '總筆數',   val: drData.totals.count, color: '' },
            { label: '房費',     val: `NT$ ${Number(drData.totals.roomCharge || 0).toLocaleString()}`, color: 'text-indigo-700' },
            { label: '消費',     val: `NT$ ${Number(drData.totals.otherCharge || 0).toLocaleString()}`, color: 'text-gray-600' },
            { label: '訂金',     val: `NT$ ${Number(drData.totals.payDeposit || 0).toLocaleString()}`,  color: 'text-blue-600' },
            { label: '當天匯款', val: `NT$ ${Number(drData.totals.payTransfer || 0).toLocaleString()}`, color: 'text-teal-600' },
            { label: '刷卡',     val: `NT$ ${Number(drData.totals.payCard || 0).toLocaleString()}`,     color: 'text-purple-600' },
            { label: '現金',     val: `NT$ ${Number(drData.totals.payCash || 0).toLocaleString()}`,     color: 'text-green-600' },
            { label: '手續費',   val: `NT$ ${Number(drData.totals.cardFee || 0).toLocaleString()}`,     color: 'text-red-400' },
          ].map(c => (
            <div key={c.label} className="bg-white rounded-xl border border-gray-100 shadow-sm p-3">
              <p className="text-xs text-gray-500">{c.label}</p>
              <p className={`font-bold text-sm mt-0.5 ${c.color}`}>{c.val}</p>
            </div>
          ))}
        </div>
      )}

      {/* 每日收入表格 */}
      {drLoading ? (
        <div className="text-center py-16 text-gray-400">載入中…</div>
      ) : !drData ? (
        <div className="text-center py-16 text-gray-400">請選擇月份後按「查詢」</div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 tbl-wrap">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-indigo-50">
              <tr className="bg-indigo-50 text-indigo-800 text-xs">
                {['日期','筆數','房費','消費','營收合計','訂金','當天匯款','刷卡','現金','住宿卷','手續費',''].map(h => (
                  <th key={h} className="px-3 py-2.5 text-right first:text-left font-medium whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {drData.days.map(d => {
                const rev = d.roomCharge + d.otherCharge;
                const hasData = d.count > 0;
                const isExpanded = drExpandDay === d.day;
                return (
                  <React.Fragment key={d.day}>
                    <tr className={`${hasData ? 'hover:bg-gray-50 cursor-pointer' : 'text-gray-300'} transition-colors`}
                      onClick={() => hasData && setDrExpandDay(isExpanded ? null : d.day)}>
                      <td className="px-3 py-2 font-medium text-gray-700">
                        <span className={hasData ? '' : 'text-gray-300'}>{d.day}日</span>
                        {hasData && (
                          <span className="ml-1.5 text-[10px] text-gray-400">{isExpanded ? '▼' : '▶'}</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">{hasData ? d.count : '—'}</td>
                      <td className="px-3 py-2 text-right text-indigo-700">{hasData ? d.roomCharge.toLocaleString() : '—'}</td>
                      <td className="px-3 py-2 text-right text-gray-500">{d.otherCharge > 0 ? d.otherCharge.toLocaleString() : '—'}</td>
                      <td className="px-3 py-2 text-right font-semibold">{hasData ? rev.toLocaleString() : '—'}</td>
                      <td className="px-3 py-2 text-right text-blue-600">{d.payDeposit > 0 ? d.payDeposit.toLocaleString() : '—'}</td>
                      <td className="px-3 py-2 text-right text-teal-600">{d.payTransfer > 0 ? d.payTransfer.toLocaleString() : '—'}</td>
                      <td className="px-3 py-2 text-right text-purple-600">{d.payCard > 0 ? d.payCard.toLocaleString() : '—'}</td>
                      <td className="px-3 py-2 text-right text-green-600">{d.payCash > 0 ? d.payCash.toLocaleString() : '—'}</td>
                      <td className="px-3 py-2 text-right text-amber-600">{d.payVoucher > 0 ? d.payVoucher.toLocaleString() : '—'}</td>
                      <td className="px-3 py-2 text-right text-red-400">{d.cardFee > 0 ? `(${d.cardFee.toLocaleString()})` : '—'}</td>
                      <td className="px-3 py-2 w-4"></td>
                    </tr>
                    {isExpanded && d.bookings.map((b, i) => (
                      <tr key={`${d.day}-${i}`} className="bg-gray-50/70">
                        <td className="px-3 py-1.5 pl-8 text-xs text-gray-400" colSpan={2}>
                          <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] mr-1.5 ${
                            b.source === 'Booking' ? 'bg-indigo-100 text-indigo-600' : 'bg-amber-100 text-amber-600'
                          }`}>{b.source}</span>
                          {b.guestName}
                        </td>
                        <td className="px-3 py-1.5 text-right text-xs text-gray-500">{b.roomCharge.toLocaleString()}</td>
                        <td className="px-3 py-1.5 text-xs text-gray-400">{b.roomNo || ''}</td>
                        <td colSpan={8}></td>
                      </tr>
                    ))}
                  </React.Fragment>
                );
              })}
              {/* 合計列 */}
              {(() => {
                const t = drData.totals;
                return (
                  <tr className="bg-indigo-50 font-bold text-indigo-800">
                    <td className="px-3 py-2.5">合計</td>
                    <td className="px-3 py-2.5 text-right">{t.count}</td>
                    <td className="px-3 py-2.5 text-right">{Math.round(t.roomCharge).toLocaleString()}</td>
                    <td className="px-3 py-2.5 text-right">{Math.round(t.otherCharge).toLocaleString()}</td>
                    <td className="px-3 py-2.5 text-right">{Math.round(t.roomCharge + t.otherCharge).toLocaleString()}</td>
                    <td className="px-3 py-2.5 text-right">{Math.round(t.payDeposit).toLocaleString()}</td>
                    <td className="px-3 py-2.5 text-right">{Math.round(t.payTransfer).toLocaleString()}</td>
                    <td className="px-3 py-2.5 text-right">{Math.round(t.payCard).toLocaleString()}</td>
                    <td className="px-3 py-2.5 text-right">{Math.round(t.payCash).toLocaleString()}</td>
                    <td className="px-3 py-2.5 text-right">{Math.round(t.payVoucher).toLocaleString()}</td>
                    <td className="px-3 py-2.5 text-right">({Math.round(t.cardFee).toLocaleString()})</td>
                    <td className="px-3 py-2.5"></td>
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
