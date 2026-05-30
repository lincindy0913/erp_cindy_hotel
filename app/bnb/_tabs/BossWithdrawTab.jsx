'use client';

import { useState } from 'react';
import WhQuickBtns from '../_components/WhQuickBtns';

export default function BossWithdrawTab({
  bwData, bwLoading,
  bwMonth, setBwMonth,
  bwWarehouse, setBwWarehouse,
  bwViewMode, setBwViewMode,
  bwYear, setBwYear,
  bwSummary, bwSummaryLoad,
  warehouseList,
  fetchBossWithdraw,
  fetchBossWithdrawSummary,
  showToast,
}) {
  const [confirmFilter, setConfirmFilter] = useState('all'); // all | unconfirmed | confirmed
  const [confirming, setConfirming] = useState(null); // id being confirmed

  async function handleConfirm(id, confirm) {
    setConfirming(id);
    try {
      const res = await fetch('/api/bnb/boss-withdraw', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, confirm }),
      });
      if (res.ok) {
        showToast?.(confirm ? '已確認領取' : '已取消確認', 'success');
        fetchBossWithdraw();
      } else {
        showToast?.('操作失敗', 'error');
      }
    } catch { showToast?.('操作失敗', 'error'); }
    finally { setConfirming(null); }
  }

  const allRows = bwData?.rows || [];
  const filteredRows = allRows.filter(r => {
    if (confirmFilter === 'unconfirmed') return !r.confirmedAt;
    if (confirmFilter === 'confirmed')   return !!r.confirmedAt;
    return true;
  });
  const unconfirmedCount = allRows.filter(r => !r.confirmedAt).length;

  return (
    <div>
      {/* 檢視切換 */}
      <div className="flex gap-2 mb-4">
        {[{ key: 'detail', label: '📋 明細' }, { key: 'monthly', label: '📊 月份報表' }].map(v => (
          <button key={v.key} onClick={() => setBwViewMode(v.key)}
            className={`px-4 py-1.5 text-sm rounded-lg font-medium transition-colors ${bwViewMode === v.key ? 'bg-orange-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-orange-50'}`}>
            {v.label}
          </button>
        ))}
      </div>

      {/* ── 明細模式 ── */}
      {bwViewMode === 'detail' && (
        <>
          <div className="bg-white rounded-xl shadow p-4 mb-4 flex flex-wrap items-end gap-3">
            <div>
              <label htmlFor="f-3" className="block text-xs text-gray-500 mb-1">月份</label>
              <input id="f-3" type="month" value={bwMonth} onChange={e => setBwMonth(e.target.value)}
                className="border rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-orange-300 outline-none" />
            </div>
            <div>
              <label htmlFor="f" className="block text-xs text-gray-500 mb-1">館別</label>
              <select id="f" value={bwWarehouse} onChange={e => setBwWarehouse(e.target.value)}
                className="border rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-orange-300 outline-none">
                <option value="">全部</option>
                {warehouseList.map(w => <option key={w} value={w}>{w}</option>)}
              </select>
              <WhQuickBtns list={warehouseList} value={bwWarehouse} onChange={setBwWarehouse} />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">確認狀態</label>
              <select value={confirmFilter} onChange={e => setConfirmFilter(e.target.value)}
                className="border rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-orange-300 outline-none">
                <option value="all">全部</option>
                <option value="unconfirmed">未確認領取</option>
                <option value="confirmed">已確認</option>
              </select>
            </div>
            <button onClick={fetchBossWithdraw}
              className="px-4 py-1.5 text-sm rounded-lg bg-orange-600 text-white hover:bg-orange-700">
              查詢
            </button>
            {bwData && (
              <div className="ml-auto flex items-center gap-3 text-sm text-gray-500">
                {unconfirmedCount > 0 && (
                  <span className="text-amber-600 font-medium bg-amber-50 border border-amber-200 px-2 py-0.5 rounded">
                    未確認領取 {unconfirmedCount} 筆
                  </span>
                )}
                <span>
                  共 <span className="font-semibold text-gray-800">{allRows.length}</span> 筆，
                  合計 <span className="font-bold text-orange-600">NT${Number(bwData.total || 0).toLocaleString()}</span>
                </span>
              </div>
            )}
          </div>
          <div className="bg-white rounded-xl shadow overflow-hidden">
            {bwLoading ? (
              <div className="text-center py-10 text-gray-400">載入中…</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10 bg-orange-50">
                  <tr className="text-orange-800 text-xs">
                    <th className="px-4 py-2 text-left font-medium">日期</th>
                    <th className="px-4 py-2 text-left font-medium">館別</th>
                    <th className="px-4 py-2 text-left font-medium">房客姓名</th>
                    <th className="px-4 py-2 text-right font-medium">金額</th>
                    <th className="px-4 py-2 text-left font-medium">備註</th>
                    <th className="px-4 py-2 text-center font-medium">確認領取</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filteredRows.length === 0 && (
                    <tr><td colSpan={6} className="text-center py-10 text-gray-400">無資料</td></tr>
                  )}
                  {filteredRows.map(r => (
                    <tr key={r.id} className={`hover:bg-orange-50/40 ${r.confirmedAt ? 'opacity-60' : ''}`}>
                      <td className="px-4 py-2 text-gray-600 whitespace-nowrap">{r.withdrawDate}</td>
                      <td className="px-4 py-2 text-gray-400 text-xs">{r.warehouse}</td>
                      <td className="px-4 py-2 font-medium text-gray-700">{r.guestName || '—'}</td>
                      <td className="px-4 py-2 text-right font-semibold text-orange-600">NT${Number(r.amount).toLocaleString()}</td>
                      <td className="px-4 py-2 text-gray-500 text-xs">{r.note || '—'}</td>
                      <td className="px-4 py-2 text-center">
                        {r.confirmedAt ? (
                          <div className="flex flex-col items-center gap-0.5">
                            <span className="text-xs text-green-700 bg-green-50 px-1.5 py-0.5 rounded">
                              ✓ {r.confirmedBy}
                            </span>
                            <span className="text-[10px] text-gray-300">
                              {new Date(r.confirmedAt).toLocaleDateString('zh-TW')}
                            </span>
                            <button onClick={() => handleConfirm(r.id, false)} disabled={confirming === r.id}
                              className="text-[10px] text-gray-400 hover:text-red-500 underline">
                              取消
                            </button>
                          </div>
                        ) : (
                          <button onClick={() => handleConfirm(r.id, true)} disabled={confirming === r.id}
                            className="text-xs px-2.5 py-1 border border-orange-300 text-orange-600 rounded hover:bg-orange-50 disabled:opacity-50">
                            {confirming === r.id ? '確認中…' : '確認領取'}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {/* ── 月份報表模式 ── */}
      {bwViewMode === 'monthly' && (
        <>
          <div className="bg-white rounded-xl shadow p-4 mb-4 flex flex-wrap items-end gap-3">
            <div>
              <label htmlFor="f-2" className="block text-xs text-gray-500 mb-1">年度</label>
              <select id="f-2" value={bwYear} onChange={e => setBwYear(e.target.value)}
                className="border rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-orange-300 outline-none">
                {[0,1,2,3].map(d => {
                  const y = String(new Date().getFullYear() - d);
                  return <option key={y} value={y}>{y} 年</option>;
                })}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">館別</label>
              <select value={bwWarehouse} onChange={e => setBwWarehouse(e.target.value)}
                className="border rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-orange-300 outline-none">
                <option value="">全部</option>
                {warehouseList.map(w => <option key={w} value={w}>{w}</option>)}
              </select>
            </div>
            <button onClick={fetchBossWithdrawSummary}
              className="px-4 py-1.5 text-sm rounded-lg bg-orange-600 text-white hover:bg-orange-700">
              查詢
            </button>
          </div>
          <div className="bg-white rounded-xl shadow overflow-hidden">
            {bwSummaryLoad ? (
              <div className="text-center py-10 text-gray-400">載入中…</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10 bg-orange-50">
                  <tr className="text-orange-800 text-xs">
                    <th className="px-4 py-2 text-left font-medium">月份</th>
                    <th className="px-4 py-2 text-left font-medium">館別</th>
                    <th className="px-4 py-2 text-right font-medium">筆數</th>
                    <th className="px-4 py-2 text-right font-medium">合計</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {(!bwSummary?.summaryRows?.length) && (
                    <tr><td colSpan={4} className="text-center py-10 text-gray-400">無資料</td></tr>
                  )}
                  {(bwSummary?.summaryRows || []).map((r, i) => (
                    <tr key={i} className="hover:bg-orange-50/40">
                      <td className="px-4 py-2 font-medium text-gray-700">{r.month}</td>
                      <td className="px-4 py-2 text-gray-500 text-xs">{r.warehouse}</td>
                      <td className="px-4 py-2 text-right text-gray-600">{r.cnt}</td>
                      <td className="px-4 py-2 text-right font-semibold text-orange-600">NT${Number(r.total).toLocaleString()}</td>
                    </tr>
                  ))}
                  {bwSummary && (
                    <tr className="bg-orange-50 font-bold text-sm">
                      <td colSpan={2} className="px-4 py-2 text-orange-800">合計</td>
                      <td className="px-4 py-2 text-right text-orange-700">{bwSummary.grandCnt}</td>
                      <td className="px-4 py-2 text-right text-orange-700">NT${Number(bwSummary.grandTotal || 0).toLocaleString()}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}
