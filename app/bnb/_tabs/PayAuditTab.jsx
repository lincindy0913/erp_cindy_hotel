'use client';

import FetchErrorBanner from '@/components/FetchErrorBanner';
import WhQuickBtns from '../_components/WhQuickBtns';
import { inputCls } from '../_constants';

export default function PayAuditTab({
  auditMonth, setAuditMonth, auditWarehouse, setAuditWarehouse,
  auditData, auditLoading, fetchAudit, warehouseList,
  auditError,
  onGoToRecords,
}) {
  const unfilled   = auditData.filter(r => !r.paymentFilled);
  const mismatched = auditData.filter(r => {
    if (!r.paymentFilled) return false;
    const pay = Number(r.payDeposit) + Number(r.payTransfer) + Number(r.payCard) + Number(r.payCash) + Number(r.payVoucher);
    const chg = Number(r.roomCharge) + Number(r.otherCharge);
    return Math.abs(pay - chg) > 0.01;
  });
  const ok = auditData.length - unfilled.length - mismatched.length;

  return (
    <div className="space-y-4">
      {auditError && <div className="mb-4"><FetchErrorBanner message={auditError} onRetry={fetchAudit} /></div>}
      <div className="flex flex-wrap items-center gap-3">
        <input type="month" value={auditMonth} onChange={e => setAuditMonth(e.target.value)} className={inputCls} />
        <select value={auditWarehouse} onChange={e => setAuditWarehouse(e.target.value)} className={inputCls}>
          <option value="">全館</option>
          {warehouseList.map(w => <option key={w} value={w}>{w}</option>)}
        </select>
        <WhQuickBtns list={warehouseList} value={auditWarehouse} onChange={setAuditWarehouse} />
        <button onClick={fetchAudit} className="px-4 py-1.5 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700">查詢</button>
        {auditLoading && <span className="text-xs text-gray-400 animate-pulse">載入中…</span>}
      </div>
      {auditData.length > 0 && (
        <>
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-emerald-50 rounded-xl p-4 border border-emerald-100">
              <div className="text-xs text-emerald-600 mb-1">付款完整</div>
              <div className="text-2xl font-bold text-emerald-700">{ok}</div>
              <div className="text-[10px] text-emerald-400 mt-1">{auditData.length > 0 ? Math.round(ok / auditData.length * 100) : 0}%</div>
            </div>
            <div className="bg-amber-50 rounded-xl p-4 border border-amber-100">
              <div className="text-xs text-amber-600 mb-1">未填付款</div>
              <div className="text-2xl font-bold text-amber-700">{unfilled.length}</div>
              {unfilled.length > 0 && onGoToRecords && (
                <button onClick={() => onGoToRecords('unfilled')} className="text-[11px] text-amber-600 hover:underline mt-1">→ 前往填寫</button>
              )}
            </div>
            <div className="bg-red-50 rounded-xl p-4 border border-red-100">
              <div className="text-xs text-red-600 mb-1">金額不符</div>
              <div className="text-2xl font-bold text-red-700">{mismatched.length}</div>
              {mismatched.length > 0 && onGoToRecords && (
                <button onClick={() => onGoToRecords('mismatch')} className="text-[11px] text-red-500 hover:underline mt-1">→ 前往核對</button>
              )}
            </div>
          </div>
          {(unfilled.length > 0 || mismatched.length > 0) && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="px-5 py-3 bg-red-50 border-b border-red-100">
                <h4 className="text-sm font-semibold text-red-700">需處理記錄</h4>
              </div>
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10 bg-gray-50">
                  <tr className="text-xs text-gray-400 border-b bg-gray-50">
                    <th className="px-4 py-2 text-left font-medium">問題類型</th>
                    <th className="px-4 py-2 text-left font-medium">館別</th>
                    <th className="px-4 py-2 text-left font-medium">姓名</th>
                    <th className="px-4 py-2 text-left font-medium">入住</th>
                    <th className="px-4 py-2 text-right font-medium">房費</th>
                    <th className="px-4 py-2 text-right font-medium">已收</th>
                    <th className="px-4 py-2 text-right font-medium">差額</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {[...unfilled.map(r => ({ ...r, _issue: '未填付款' })), ...mismatched.map(r => ({ ...r, _issue: '金額不符' }))].map(r => {
                    const pay = Number(r.payDeposit) + Number(r.payTransfer) + Number(r.payCard) + Number(r.payCash) + Number(r.payVoucher);
                    const chg = Number(r.roomCharge) + Number(r.otherCharge);
                    return (
                      <tr key={r.id} className="hover:bg-red-50/30">
                        <td className="px-4 py-2">
                          <span className={`text-[11px] px-1.5 py-0.5 rounded font-medium ${r._issue === '未填付款' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-600'}`}>{r._issue}</span>
                        </td>
                        <td className="px-4 py-2 text-gray-400 text-xs">{r.warehouse}</td>
                        <td className="px-4 py-2 font-medium text-gray-700">{r.guestName}</td>
                        <td className="px-4 py-2 text-gray-500 text-xs">{r.checkInDate}</td>
                        <td className="px-4 py-2 text-right">{chg.toLocaleString()}</td>
                        <td className="px-4 py-2 text-right text-teal-600">{pay.toLocaleString()}</td>
                        <td className={`px-4 py-2 text-right font-semibold ${Math.abs(pay - chg) > 0.01 ? 'text-red-500' : 'text-gray-300'}`}>
                          {pay - chg !== 0 ? (pay - chg > 0 ? '+' : '') + Math.round(pay - chg).toLocaleString() : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {unfilled.length === 0 && mismatched.length === 0 && (
            <div className="text-center py-10 text-emerald-600 bg-emerald-50 rounded-xl border border-emerald-100">
              ✓ {auditMonth} 全部 {auditData.length} 筆付款資料完整，無異常
            </div>
          )}
        </>
      )}
      {!auditLoading && auditData.length === 0 && (
        <div className="text-center py-10 text-gray-400">請選擇月份後點擊查詢</div>
      )}
    </div>
  );
}
