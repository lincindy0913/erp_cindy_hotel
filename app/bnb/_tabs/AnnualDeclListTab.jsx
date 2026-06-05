'use client';

import ExportButtons from '@/components/ExportButtons';
import FetchErrorBanner from '@/components/FetchErrorBanner';
import WhQuickBtns from '../_components/WhQuickBtns';
import { inputCls, btnCls } from '../_constants';

export default function AnnualDeclListTab({
  dlYear, setDlYear,
  dlWarehouse, setDlWarehouse,
  dlRows, dlLoading,
  fetchDeclList,
  warehouseList,
  doPrint,
  dlError,
}) {
  return (
    <div>
      {dlError && <div className="mb-4"><FetchErrorBanner message={dlError} onRetry={fetchDeclList} /></div>}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <label htmlFor="f-14" className="text-sm text-gray-600">年份</label>
        <select id="f-14" value={dlYear} onChange={e => setDlYear(e.target.value)} className={inputCls}>
          {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <label htmlFor="f-32" className="text-sm text-gray-600">館別</label>
        <select id="f-32" value={dlWarehouse} onChange={e => setDlWarehouse(e.target.value)} className={inputCls}>
          {(warehouseList.length ? warehouseList : [dlWarehouse]).map(w => <option key={w} value={w}>{w}</option>)}
        </select>
        <WhQuickBtns list={warehouseList} value={dlWarehouse} onChange={setDlWarehouse} />
        <button onClick={fetchDeclList} className={`${btnCls} bg-indigo-50 text-indigo-700`}>查詢</button>
        <ExportButtons
          data={dlRows}
          columns={[
            { header: '月份',       key: 'monthLabel' },
            { header: '刷卡總計',    key: 'cardTotal',        format: 'number' },
            { header: '房價金額',    key: 'roomPriceTotal',   format: 'number' },
            { header: '補助間數',    key: 'subsidizedRooms',  format: 'number' },
            { header: '平均房價',    key: 'avgRoomRate',      format: 'number' },
            { header: '每月間數',    key: 'monthlyRoomCount', format: 'number' },
            { header: '客房備品',    key: 'roomSuppliesCost', format: 'number' },
            { header: '餐飲支出',    key: 'fbExpense',        format: 'number' },
            { header: '住客FIT人數', key: 'fitGuestCount',    format: 'number' },
            { header: '員工人數',    key: 'staffCount',       format: 'number' },
            { header: '薪資',       key: 'salary',           format: 'number' },
            { header: '業務來源%',   key: 'businessSource' },
            { header: '其他收入',    key: 'otherIncome',      format: 'number' },
            { header: '收入說明',    key: 'otherIncomeNote' },
            { header: '備註',       key: 'note' },
          ]}
          filename={`旅宿網申報_${dlYear}`}
          title={`旅宿網申報 ${dlYear}（${dlWarehouse}）`}
        />
        <button
          onClick={() => {
            const cols = ['月份','刷卡總計','房價金額','補助間數','平均房價','每月間數','客房備品','餐飲支出','住客FIT','員工','薪資','業務來源%','其他收入','收入說明','備註'];
            const rows = dlRows.map(r => [
              r.monthLabel,
              r.cardTotal != null ? Number(r.cardTotal).toLocaleString() : '',
              r.roomPriceTotal != null ? Number(r.roomPriceTotal).toLocaleString() : '',
              r.subsidizedRooms ?? '',
              r.avgRoomRate != null ? Number(r.avgRoomRate).toLocaleString() : '',
              r.monthlyRoomCount ?? '',
              r.roomSuppliesCost != null ? Number(r.roomSuppliesCost).toLocaleString() : '',
              r.fbExpense != null ? Number(r.fbExpense).toLocaleString() : '',
              r.fitGuestCount ?? '',
              r.staffCount ?? '',
              r.salary != null ? Number(r.salary).toLocaleString() : '',
              r.businessSource || '',
              r.otherIncome ? Number(r.otherIncome).toLocaleString() : '',
              r.otherIncomeNote || '',
              r.note || '',
            ]);
            doPrint(`旅宿網申報 ${dlYear}年（${dlWarehouse}）`, cols, rows);
          }}
          className={`${btnCls} text-gray-600`}
        >列印</button>
      </div>

      {dlLoading ? (
        <div className="text-center py-16 text-gray-400">載入中…</div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 tbl-wrap">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-indigo-50">
              <tr className="bg-indigo-50 text-indigo-800 text-xs">
                {['月份','刷卡總計','房價金額','補助間數','平均房價','每月間數','客房備品','餐飲支出','住客FIT','員工','薪資','業務來源%','其他收入','備註'].map(h => (
                  <th key={h} className="px-3 py-2.5 text-right first:text-left font-medium whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {dlRows.map(r => (
                <tr key={r.month} className={`hover:bg-gray-50 ${r.hasReport ? '' : 'text-gray-300'}`}>
                  <td className="px-3 py-2.5 font-medium text-gray-800">{r.monthLabel}</td>
                  <td className="px-3 py-2.5 text-right text-purple-600">{r.cardTotal != null ? Number(r.cardTotal).toLocaleString() : '—'}</td>
                  <td className="px-3 py-2.5 text-right text-indigo-700 font-semibold">{r.roomPriceTotal != null ? Number(r.roomPriceTotal).toLocaleString() : '—'}</td>
                  <td className="px-3 py-2.5 text-right text-gray-600">{r.subsidizedRooms ?? '—'}</td>
                  <td className="px-3 py-2.5 text-right text-blue-600">{r.avgRoomRate != null ? Number(r.avgRoomRate).toLocaleString() : '—'}</td>
                  <td className="px-3 py-2.5 text-right text-gray-700">{r.monthlyRoomCount ?? '—'}</td>
                  <td className="px-3 py-2.5 text-right text-gray-600">{r.roomSuppliesCost != null ? Number(r.roomSuppliesCost).toLocaleString() : '—'}</td>
                  <td className="px-3 py-2.5 text-right text-gray-600">{r.fbExpense != null ? Number(r.fbExpense).toLocaleString() : '—'}</td>
                  <td className="px-3 py-2.5 text-right text-teal-600">{r.fitGuestCount ?? '—'}</td>
                  <td className="px-3 py-2.5 text-right text-gray-600">{r.staffCount ?? '—'}</td>
                  <td className="px-3 py-2.5 text-right text-gray-700">{r.salary != null ? Number(r.salary).toLocaleString() : '—'}</td>
                  <td className="px-3 py-2.5 text-left text-gray-500 text-xs">{r.businessSource || '—'}</td>
                  <td className="px-3 py-2.5 text-right text-gray-600">{r.otherIncome ? Number(r.otherIncome).toLocaleString() : '—'}</td>
                  <td className="px-3 py-2.5 text-left text-gray-400 text-xs max-w-[120px] truncate" title={[r.otherIncomeNote, r.note].filter(Boolean).join(' / ')}>{r.note || r.otherIncomeNote || '—'}</td>
                </tr>
              ))}
              {dlRows.length > 0 && (() => {
                const tot = dlRows.reduce((a, r) => ({
                  cardTotal:       a.cardTotal       + (Number(r.cardTotal) || 0),
                  roomPriceTotal:  a.roomPriceTotal  + (Number(r.roomPriceTotal) || 0),
                  subsidizedRooms: a.subsidizedRooms + (r.subsidizedRooms || 0),
                  monthlyRoomCount:a.monthlyRoomCount+ (r.monthlyRoomCount || 0),
                  roomSuppliesCost:a.roomSuppliesCost+ (Number(r.roomSuppliesCost) || 0),
                  fbExpense:       a.fbExpense       + (Number(r.fbExpense) || 0),
                  fitGuestCount:   a.fitGuestCount   + (r.fitGuestCount || 0),
                  salary:          a.salary          + (Number(r.salary) || 0),
                  otherIncome:     a.otherIncome     + (Number(r.otherIncome) || 0),
                }), { cardTotal:0, roomPriceTotal:0, subsidizedRooms:0, monthlyRoomCount:0, roomSuppliesCost:0, fbExpense:0, fitGuestCount:0, salary:0, otherIncome:0 });
                return (
                  <tr className="bg-indigo-50 font-bold text-indigo-800">
                    <td className="px-3 py-2.5">合計</td>
                    <td className="px-3 py-2.5 text-right">{tot.cardTotal.toLocaleString()}</td>
                    <td className="px-3 py-2.5 text-right">{tot.roomPriceTotal.toLocaleString()}</td>
                    <td className="px-3 py-2.5 text-right">{tot.subsidizedRooms}</td>
                    <td className="px-3 py-2.5 text-right">—</td>
                    <td className="px-3 py-2.5 text-right">{tot.monthlyRoomCount}</td>
                    <td className="px-3 py-2.5 text-right">{tot.roomSuppliesCost.toLocaleString()}</td>
                    <td className="px-3 py-2.5 text-right">{tot.fbExpense.toLocaleString()}</td>
                    <td className="px-3 py-2.5 text-right">{tot.fitGuestCount}</td>
                    <td className="px-3 py-2.5 text-right">—</td>
                    <td className="px-3 py-2.5 text-right">{tot.salary.toLocaleString()}</td>
                    <td className="px-3 py-2.5"></td>
                    <td className="px-3 py-2.5 text-right">{tot.otherIncome ? tot.otherIncome.toLocaleString() : ''}</td>
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
