'use client';

import FetchErrorBanner from '@/components/FetchErrorBanner';
import WhQuickBtns from '../_components/WhQuickBtns';
import { inputCls, btnCls } from '../_constants';

export default function DeclarationTab({
  declMonth, setDeclMonth,
  declWarehouse, setDeclWarehouse,
  declLoading,
  declSearched, setDeclSearched,
  declActual,
  declForm, setDeclForm,
  declSaving,
  fetchDecl,
  handleAutoFillDecl,
  handleDeclSave,
  warehouseList,
  isLocked,
  doPrint,
  declError,
}) {
  return (
    <div>
      {declError && <div className="mb-4"><FetchErrorBanner message={declError} onRetry={fetchDecl} /></div>}
      {/* 搜尋列 */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-4 flex flex-wrap gap-3 items-end">
        <div>
          <label htmlFor="f-9" className="block text-xs text-gray-500 mb-1">申報月份</label>
          <input id="f-9" type="month" value={declMonth} onChange={e => setDeclMonth(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label htmlFor="f-10" className="block text-xs text-gray-500 mb-1">館別</label>
          <select id="f-10" value={declWarehouse} onChange={e => setDeclWarehouse(e.target.value)} className={inputCls}>
            {(warehouseList.length ? warehouseList : [declWarehouse]).map(w => <option key={w} value={w}>{w}</option>)}
          </select>
          <WhQuickBtns list={warehouseList} value={declWarehouse} onChange={setDeclWarehouse} />
        </div>
        <button onClick={fetchDecl} disabled={declLoading}
          className={`${btnCls} bg-indigo-50 text-indigo-700 disabled:opacity-40`}>
          {declLoading ? '查詢中…' : '查詢'}
        </button>
      </div>

      {!declSearched && !declLoading && (
        <div className="text-center py-20 text-gray-400">請選擇月份與館別後按「查詢」</div>
      )}

      {declSearched && !declLoading && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">

          {/* ── 左欄：實際資料（唯讀）── */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-5 py-3 bg-emerald-50 border-b border-emerald-100">
              <h3 className="text-sm font-semibold text-emerald-800">實際營業資料（自動計算）</h3>
              <p className="text-[11px] text-emerald-500 mt-0.5">來源：{declMonth} {declWarehouse} 訂房明細</p>
            </div>
            {declActual ? (
              <div className="p-5">
                <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                  {[
                    ['刷卡總計',        Math.round(declActual.payCard),        'text-purple-600'],
                    ['房費+消費金額',   Math.round(declActual.revenueTotal),   'text-indigo-700'],
                    ['平均房價',        declActual.avgRoomRate,                'text-blue-600'],
                    ['每月間數（筆數）', declActual.roomCount,                  'text-gray-800'],
                    ['住宿間數（晚）',   declActual.roomNights,                 'text-teal-700'],
                    ['訂金匯款',        Math.round(declActual.payDeposit),     'text-blue-500'],
                    ['當天匯款',        Math.round(declActual.payTransfer),    'text-teal-600'],
                    ['現金收入',        Math.round(declActual.payCash),        'text-green-600'],
                    ['住宿卷',          Math.round(declActual.payVoucher),     'text-amber-600'],
                    ['刷卡手續費',      Math.round(declActual.cardFee),        'text-red-400'],
                  ].map(([label, val, color]) => (
                    <div key={label} className="flex justify-between items-center py-1 border-b border-gray-50">
                      <span className="text-xs text-gray-500">{label}</span>
                      <span className={`text-sm font-semibold ${color}`}>{Number(val).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-3 pt-3 border-t flex justify-between items-center">
                  <span className="text-xs text-gray-500">業務來源（自動）</span>
                  <span className="text-xs text-gray-700">{declActual.businessSourceAuto || '—'}</span>
                </div>
                <div className="mt-2 flex justify-between items-center text-[11px] text-gray-400">
                  <span>Booking {declActual.sourceBooking} 筆 / 電話 {declActual.sourcePhone} 筆 / 其他 {declActual.sourceOther} 筆</span>
                </div>
              </div>
            ) : (
              <div className="p-8 text-center text-gray-400 text-sm">本月無訂房資料</div>
            )}
          </div>

          {/* ── 右欄：申報資料（可編輯）── */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-5 py-3 bg-indigo-50 border-b border-indigo-100 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-indigo-800">旅宿網申報資料{isLocked ? '（已鎖帳）' : '（可編輯）'}</h3>
                <p className="text-[11px] text-indigo-400 mt-0.5">{isLocked ? '本月已鎖帳，僅供檢視' : '調整後按儲存，此為實際申報數字'}</p>
              </div>
              <button onClick={handleAutoFillDecl} disabled={isLocked}
                className="text-[11px] px-2.5 py-1 rounded-lg border border-blue-300 text-blue-600 hover:bg-blue-50 whitespace-nowrap disabled:opacity-40">
                ← 從實際帶入
              </button>
            </div>
            <div className="p-5 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                {[
                  ['cardTotal',        '刷卡總計'],
                  ['roomPriceTotal',   '房價金額'],
                  ['subsidizedRooms',  '補助間數'],
                  ['avgRoomRate',      '平均房價'],
                  ['monthlyRoomCount', '每月間數'],
                  ['roomSuppliesCost', '客房備品'],
                  ['fbExpense',        '餐飲支出'],
                  ['fitGuestCount',    '住客FIT人數'],
                  ['staffCount',       '員工人數'],
                  ['salary',           '薪資'],
                ].map(([k, label]) => (
                  <div key={k}>
                    <label className="block text-[11px] text-gray-500 mb-0.5">{label}</label>
                    <input type="number" value={declForm[k]} disabled={isLocked}
                      onChange={e => setDeclForm(p => ({ ...p, [k]: e.target.value }))}
                      className={inputCls + ' w-full text-sm disabled:bg-gray-100'} />
                  </div>
                ))}
              </div>

              <div>
                <label htmlFor="f-31" className="block text-[11px] text-gray-500 mb-0.5">業務來源%</label>
                <input id="f-31" type="text" value={declForm.businessSource} disabled={isLocked}
                  onChange={e => setDeclForm(p => ({ ...p, businessSource: e.target.value }))}
                  placeholder="例：Booking 60%、電話 40%" className={inputCls + ' w-full text-sm disabled:bg-gray-100'} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="f-11" className="block text-[11px] text-gray-500 mb-0.5">其他額外收入</label>
                  <input id="f-11" type="number" value={declForm.otherIncome} disabled={isLocked}
                    onChange={e => setDeclForm(p => ({ ...p, otherIncome: e.target.value }))}
                    className={inputCls + ' w-full text-sm disabled:bg-gray-100'} />
                </div>
                <div>
                  <label htmlFor="f-12" className="block text-[11px] text-gray-500 mb-0.5">收入說明</label>
                  <input id="f-12" type="text" value={declForm.otherIncomeNote} disabled={isLocked}
                    onChange={e => setDeclForm(p => ({ ...p, otherIncomeNote: e.target.value }))}
                    className={inputCls + ' w-full text-sm disabled:bg-gray-100'} />
                </div>
              </div>

              <div>
                <label htmlFor="f-13" className="block text-[11px] text-gray-500 mb-0.5">備註</label>
                <textarea id="f-13" rows={2} value={declForm.note} disabled={isLocked}
                  onChange={e => setDeclForm(p => ({ ...p, note: e.target.value }))}
                  className={inputCls + ' w-full text-sm resize-none disabled:bg-gray-100'} />
              </div>

              <div className="flex gap-2">
                <button onClick={handleDeclSave} disabled={declSaving || isLocked}
                  className="flex-1 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors">
                  {declSaving ? '儲存中…' : isLocked ? '已鎖帳' : '儲存申報資料'}
                </button>
                <button onClick={() => {
                  const d = declForm;
                  const fmtN = v => v != null && v !== '' ? Number(v).toLocaleString() : '—';
                  doPrint(
                    `旅宿網申報 ${declMonth}（${declWarehouse}）`,
                    ['項目', '申報數值'],
                    [
                      ['刷卡總計',   fmtN(d.cardTotal)],
                      ['房價金額',   fmtN(d.roomPriceTotal)],
                      ['補助間數',   fmtN(d.subsidizedRooms)],
                      ['平均房價',   fmtN(d.avgRoomRate)],
                      ['每月間數',   fmtN(d.monthlyRoomCount)],
                      ['客房備品',   fmtN(d.roomSuppliesCost)],
                      ['餐飲支出',   fmtN(d.fbExpense)],
                      ['住客FIT人數',fmtN(d.fitGuestCount)],
                      ['員工人數',   fmtN(d.staffCount)],
                      ['薪資',       fmtN(d.salary)],
                      ['業務來源%',  d.businessSource || '—'],
                      ['其他額外收入',fmtN(d.otherIncome)],
                      ['收入說明',   d.otherIncomeNote || '—'],
                      ['備註',       d.note || '—'],
                    ]
                  );
                }}
                  className={`${btnCls} text-gray-600 whitespace-nowrap`}>
                  列印申報表
                </button>
              </div>
            </div>
          </div>

        </div>
      )}
    </div>
  );
}
