'use client';

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
}) {
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
            <button onClick={fetchBossWithdraw}
              className="px-4 py-1.5 text-sm rounded-lg bg-orange-600 text-white hover:bg-orange-700">
              查詢
            </button>
            {bwData && (
              <div className="ml-auto text-sm text-gray-500">
                共 <span className="font-semibold text-gray-800">{(bwData.rows || []).length}</span> 筆，
                合計 <span className="font-bold text-orange-600">NT${Number(bwData.total || 0).toLocaleString()}</span>
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
                    <th className="px-4 py-2 text-left font-medium">建立時間</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {(!bwData || !bwData.rows || bwData.rows.length === 0) && (
                    <tr><td colSpan={6} className="text-center py-10 text-gray-400">無資料</td></tr>
                  )}
                  {(bwData?.rows || []).map(r => (
                    <tr key={r.id} className="hover:bg-orange-50/40">
                      <td className="px-4 py-2 text-gray-600 whitespace-nowrap">{r.withdrawDate}</td>
                      <td className="px-4 py-2 text-gray-400 text-xs">{r.warehouse}</td>
                      <td className="px-4 py-2 font-medium text-gray-700">{r.guestName || '—'}</td>
                      <td className="px-4 py-2 text-right font-semibold text-orange-600">NT${Number(r.amount).toLocaleString()}</td>
                      <td className="px-4 py-2 text-gray-500 text-xs">{r.note || '—'}</td>
                      <td className="px-4 py-2 text-gray-300 text-xs whitespace-nowrap">
                        {r.createdAt ? new Date(r.createdAt).toLocaleString('zh-TW', { month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' }) : '—'}
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
              <label htmlFor="f-4" className="block text-xs text-gray-500 mb-1">館別</label>
              <select id="f-4" value={bwWarehouse} onChange={e => setBwWarehouse(e.target.value)}
                className="border rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-orange-300 outline-none">
                <option value="">全部</option>
                {warehouseList.map(w => <option key={w} value={w}>{w}</option>)}
              </select>
              <WhQuickBtns list={warehouseList} value={bwWarehouse} onChange={setBwWarehouse} />
            </div>
            <button onClick={fetchBossWithdrawSummary}
              className="px-4 py-1.5 text-sm rounded-lg bg-orange-600 text-white hover:bg-orange-700">
              {bwSummaryLoad ? '載入中…' : '查詢'}
            </button>
            {bwSummary && (
              <div className="ml-auto text-sm text-gray-500">
                全年共 <span className="font-semibold">{bwSummary.grandCnt}</span> 筆，
                合計 <span className="font-bold text-orange-600">NT${Number(bwSummary.grandTotal || 0).toLocaleString()}</span>
              </div>
            )}
          </div>

          {/* 月份彙整表 */}
          <div className="bg-white rounded-xl shadow overflow-hidden">
            {bwSummaryLoad ? (
              <div className="text-center py-10 text-gray-400">載入中…</div>
            ) : !bwSummary ? (
              <div className="text-center py-10 text-gray-400">請選擇年度後按「查詢」</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10 bg-orange-50">
                  <tr className="text-orange-800 text-xs font-medium">
                    <th className="px-4 py-3 text-left">月份</th>
                    <th className="px-4 py-3 text-left">館別</th>
                    <th className="px-4 py-3 text-center">筆數</th>
                    <th className="px-4 py-3 text-right">老闆收取現金</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {(bwSummary.summaryRows || []).length === 0 && (
                    <tr><td colSpan={4} className="text-center py-10 text-gray-400">{bwYear} 年無資料</td></tr>
                  )}
                  {(bwSummary.summaryRows || []).map((r, i) => (
                    <tr key={i} className="hover:bg-orange-50/40">
                      <td className="px-4 py-3 font-medium text-gray-800">{r.month}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{r.warehouse}</td>
                      <td className="px-4 py-3 text-center text-gray-500">{r.cnt} 筆</td>
                      <td className="px-4 py-3 text-right font-bold text-orange-600 text-base">
                        NT${r.total.toLocaleString('zh-TW')}
                      </td>
                    </tr>
                  ))}
                </tbody>
                {(bwSummary.summaryRows || []).length > 0 && (
                  <tfoot className="bg-orange-100 font-bold text-sm">
                    <tr>
                      <td className="px-4 py-3 text-orange-800">全年合計</td>
                      <td className="px-4 py-3"></td>
                      <td className="px-4 py-3 text-center text-orange-700">{bwSummary.grandCnt} 筆</td>
                      <td className="px-4 py-3 text-right text-orange-700 text-lg">
                        NT${Number(bwSummary.grandTotal).toLocaleString('zh-TW')}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}
