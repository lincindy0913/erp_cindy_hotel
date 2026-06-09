'use client';

export default function PurchaseReportModal({
  showPurchaseReportModal,
  setShowPurchaseReportModal,
  purchaseReportMonth, setPurchaseReportMonth,
  purchaseReportDateFrom, setPurchaseReportDateFrom,
  purchaseReportDateTo, setPurchaseReportDateTo,
  purchaseReportWarehouse, setPurchaseReportWarehouse,
  purchaseReportSupplierId, setPurchaseReportSupplierId,
  purchaseReportData,
  purchaseReportLoading,
  fetchPurchaseReport,
  orders,
  suppliers,
}) {
  if (!showPurchaseReportModal) return null;

  return (
    <>
      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 no-print-finance" onClick={() => setShowPurchaseReportModal(false)}>
        <div className="bg-white rounded-xl shadow-2xl max-w-5xl w-full mx-4 max-h-[90vh] overflow-y-auto no-print-finance" onClick={e => e.stopPropagation()}>
          {/* Modal header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 sticky top-0 bg-white z-10">
            <div>
              <h3 className="text-lg font-bold text-gray-800">付款單報表（按進貨單館別）</h3>
              <p className="text-xs text-gray-500 mt-0.5">依進貨單館別查詢對應付款單，篩選後列印</p>
            </div>
            <button type="button" onClick={() => setShowPurchaseReportModal(false)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
          </div>

          <div className="px-6 py-4 space-y-5">
            {/* Filters */}
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-3">
                <div>
                  <label htmlFor="f-21" className="block text-xs font-medium text-gray-500 mb-1">進貨日期起</label>
                  <input id="f-21" type="date" value={purchaseReportDateFrom} onChange={e => { setPurchaseReportDateFrom(e.target.value); if (e.target.value) setPurchaseReportMonth(''); }} className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm" />
                </div>
                <div>
                  <label htmlFor="f-22" className="block text-xs font-medium text-gray-500 mb-1">進貨日期迄</label>
                  <input id="f-22" type="date" value={purchaseReportDateTo} onChange={e => { setPurchaseReportDateTo(e.target.value); if (e.target.value) setPurchaseReportMonth(''); }} className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm" />
                </div>
                <div>
                  <label htmlFor="f-23" className="block text-xs font-medium text-gray-500 mb-1">或選擇月份</label>
                  <input id="f-23" type="month" value={purchaseReportMonth} onChange={e => { setPurchaseReportMonth(e.target.value); if (e.target.value) { setPurchaseReportDateFrom(''); setPurchaseReportDateTo(''); } }} className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm" />
                </div>
                <div>
                  <label htmlFor="f-24" className="block text-xs font-medium text-gray-500 mb-1">進貨館別</label>
                  <select id="f-24" value={purchaseReportWarehouse} onChange={e => setPurchaseReportWarehouse(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm">
                    <option value="">全部館別</option>
                    {[...new Set(orders.map(o => o.warehouse).filter(Boolean))].sort().map(w => <option key={w} value={w}>{w}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="f-29" className="block text-xs font-medium text-gray-500 mb-1">廠商</label>
                  <select id="f-29" value={purchaseReportSupplierId} onChange={e => setPurchaseReportSupplierId(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm">
                    <option value="">全部廠商</option>
                    {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div className="flex items-end">
                  <button type="button" onClick={fetchPurchaseReport} disabled={purchaseReportLoading}
                    className="w-full px-4 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 disabled:opacity-50 font-medium">
                    {purchaseReportLoading ? '查詢中...' : '查詢報表'}
                  </button>
                </div>
              </div>
            </div>

            {/* Results */}
            {!purchaseReportData ? (
              <div className="py-12 text-center text-gray-400 text-sm">請設定條件後按「查詢報表」</div>
            ) : purchaseReportData.error ? (
              <div className="py-8 text-center text-red-500 text-sm">{purchaseReportData.error}</div>
            ) : Object.keys(purchaseReportData.groups || {}).length === 0 ? (
              <div className="py-12 text-center text-gray-400 text-sm">查無符合條件的進貨資料</div>
            ) : (() => {
              const groups = purchaseReportData.groups;
              const allOrders = Object.values(groups).flat();
              const grandTotal = allOrders.reduce((s, o) => s + Number(o.netAmount || 0), 0);
              const whCount = Object.keys(groups).length;
              return (
                <div className="space-y-1">
                  {/* Summary bar */}
                  <div className="grid grid-cols-3 gap-3 mb-4">
                    <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-center">
                      <p className="text-xs text-green-600 font-medium">館別數</p>
                      <p className="text-2xl font-bold text-green-700">{whCount}</p>
                    </div>
                    <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3 text-center">
                      <p className="text-xs text-indigo-600 font-medium">付款單筆數</p>
                      <p className="text-2xl font-bold text-indigo-700">{allOrders.length}</p>
                    </div>
                    <div className="bg-violet-50 border border-violet-200 rounded-lg p-3 text-center">
                      <p className="text-xs text-violet-600 font-medium">總淨額</p>
                      <p className="text-xl font-bold text-violet-700">NT$ {grandTotal.toLocaleString()}</p>
                    </div>
                  </div>

                  {/* Per-warehouse sections */}
                  {Object.entries(groups).map(([whKey, list], gIdx) => {
                    const subtotal = list.reduce((s, o) => s + Number(o.netAmount || 0), 0);
                    return (
                      <div key={whKey} className="border border-gray-200 rounded-xl overflow-hidden">
                        {/* Group header */}
                        <div className="bg-gradient-to-r from-green-600 to-green-500 px-4 py-2.5 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="bg-white/20 text-white text-xs font-bold px-2 py-0.5 rounded">{gIdx + 1}</span>
                            <span className="text-white font-bold text-sm">{whKey}</span>
                            <span className="text-green-100 text-xs">{list.length} 筆</span>
                          </div>
                          <span className="text-white font-bold text-sm">小計 NT$ {subtotal.toLocaleString()}</span>
                        </div>
                        {/* Table */}
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead className="sticky top-0 z-10 bg-gray-50">
                              <tr className="bg-gray-50 border-b border-gray-200">
                                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 w-8">#</th>
                                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">付款單號</th>
                                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">廠商</th>
                                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">付款方式</th>
                                <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">淨額</th>
                                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">進貨單號</th>
                                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">備註</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                              {list.map((o, idx) => (
                                <tr key={o.id} className="hover:bg-gray-50">
                                  <td className="px-3 py-2 text-gray-400 text-xs">{idx + 1}</td>
                                  <td className="px-3 py-2 font-mono text-indigo-700 font-medium text-xs">{o.orderNo}</td>
                                  <td className="px-3 py-2 text-gray-800">{o.supplierName || '-'}</td>
                                  <td className="px-3 py-2">
                                    <span className="px-1.5 py-0.5 bg-gray-100 text-gray-700 text-xs rounded">{o.paymentMethod || '-'}</span>
                                  </td>
                                  <td className="px-3 py-2 text-right font-semibold text-gray-900">NT$ {Number(o.netAmount).toLocaleString()}</td>
                                  <td className="px-3 py-2 text-gray-500 text-xs font-mono">{o.purchaseNo || '-'}</td>
                                  <td className="px-3 py-2 text-gray-400 text-xs max-w-[120px] truncate" title={o.note || ''}>{o.note || '－'}</td>
                                </tr>
                              ))}
                            </tbody>
                            <tfoot>
                              <tr className="bg-green-50 border-t-2 border-green-200">
                                <td colSpan={4} className="px-3 py-2 text-right text-sm font-semibold text-green-800">小計</td>
                                <td className="px-3 py-2 text-right text-sm font-bold text-green-800">NT$ {subtotal.toLocaleString()}</td>
                                <td colSpan={2}></td>
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      </div>
                    );
                  })}

                  {/* Grand total */}
                  <div className="bg-gray-800 text-white rounded-xl px-5 py-3 flex items-center justify-between mt-2">
                    <span className="text-sm font-medium">總計 {allOrders.length} 筆 · {whCount} 個館別</span>
                    <span className="text-lg font-bold">NT$ {grandTotal.toLocaleString()}</span>
                  </div>
                </div>
              );
            })()}

            <div className="flex justify-end gap-3 pt-1 border-t border-gray-100">
              <button type="button" onClick={() => setShowPurchaseReportModal(false)} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">關閉</button>
              {purchaseReportData && !purchaseReportData.error && Object.keys(purchaseReportData.groups || {}).length > 0 && (
                <button type="button" onClick={() => window.print()} className="px-5 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium">
                  🖨 列印
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 按進貨單的館別列印 — 列印區域 */}
      {purchaseReportData && !purchaseReportData.error && (() => {
        const groups = purchaseReportData.groups || {};
        const allOrders = Object.values(groups).flat();
        const grandTotal = allOrders.reduce((s, o) => s + Number(o.netAmount || 0), 0);
        const periodLabel = purchaseReportMonth
          ? `進貨月份：${purchaseReportMonth}`
          : `進貨日期：${purchaseReportDateFrom || '—'} ～ ${purchaseReportDateTo || '—'}`;
        return (
          <div id="finance-warehouse-report-print-root" className="fixed -left-[9999px] top-0 w-screen bg-white" style={{ fontFamily: "'Microsoft JhengHei', 'PingFang TC', sans-serif", padding: '24px' }} aria-hidden="true">
            {/* Print header */}
            <div style={{ borderBottom: '3px solid #16a34a', paddingBottom: '10px', marginBottom: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                <div>
                  <h1 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#111827', margin: 0 }}>付款單報表（按進貨單館別）</h1>
                  <p style={{ fontSize: '0.875rem', color: '#6b7280', margin: '4px 0 0' }}>{periodLabel}　廠商：{suppliers.find(s => String(s.id) === purchaseReportSupplierId)?.name || '全部'}</p>
                </div>
                <div style={{ textAlign: 'right', fontSize: '0.75rem', color: '#9ca3af' }}>
                  <p style={{ margin: 0 }}>列印日期：{new Date().toLocaleString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</p>
                  <p style={{ margin: '2px 0 0' }}>共 {allOrders.length} 筆 / {Object.keys(groups).length} 館別 / 總計 NT$ {grandTotal.toLocaleString()}</p>
                </div>
              </div>
            </div>

            {/* Per-warehouse groups */}
            {Object.entries(groups).map(([whKey, list], gIdx) => {
              const subtotal = list.reduce((s, o) => s + Number(o.netAmount || 0), 0);
              return (
                <div key={whKey} style={{ marginBottom: '24px', breakInside: 'avoid', pageBreakInside: 'avoid' }}>
                  {/* Group header bar */}
                  <div style={{ background: '#166534', color: '#fff', padding: '6px 12px', borderRadius: '4px 4px 0 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ background: 'rgba(255,255,255,0.25)', borderRadius: '3px', padding: '1px 6px', fontSize: '0.75rem', fontWeight: 700 }}>{gIdx + 1}</span>
                      <span style={{ fontWeight: 700, fontSize: '1rem' }}>進貨館別：{whKey}</span>
                      <span style={{ fontSize: '0.75rem', opacity: 0.85 }}>（{list.length} 筆）</span>
                    </div>
                    <span style={{ fontWeight: 700, fontSize: '1rem' }}>小計 NT$ {subtotal.toLocaleString()}</span>
                  </div>
                  {/* Table */}
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem', border: '1px solid #d1d5db' }}>
                    <thead>
                      <tr style={{ background: '#f0fdf4' }}>
                        <th style={{ padding: '5px 8px', textAlign: 'left', border: '1px solid #d1d5db', width: '28px', color: '#374151' }}>#</th>
                        <th style={{ padding: '5px 8px', textAlign: 'left', border: '1px solid #d1d5db', color: '#374151' }}>付款單號</th>
                        <th style={{ padding: '5px 8px', textAlign: 'left', border: '1px solid #d1d5db', color: '#374151' }}>廠商</th>
                        <th style={{ padding: '5px 8px', textAlign: 'left', border: '1px solid #d1d5db', color: '#374151' }}>付款方式</th>
                        <th style={{ padding: '5px 8px', textAlign: 'right', border: '1px solid #d1d5db', color: '#374151' }}>淨額</th>
                        <th style={{ padding: '5px 8px', textAlign: 'left', border: '1px solid #d1d5db', color: '#374151' }}>進貨單號</th>
                        <th style={{ padding: '5px 8px', textAlign: 'left', border: '1px solid #d1d5db', color: '#374151' }}>備註</th>
                      </tr>
                    </thead>
                    <tbody>
                      {list.map((o, idx) => (
                        <tr key={o.id} style={{ background: idx % 2 === 0 ? '#fff' : '#f9fafb' }}>
                          <td style={{ padding: '4px 8px', border: '1px solid #e5e7eb', color: '#9ca3af', fontSize: '0.75rem' }}>{idx + 1}</td>
                          <td style={{ padding: '4px 8px', border: '1px solid #e5e7eb', fontWeight: 600, fontFamily: 'monospace', color: '#4338ca' }}>{o.orderNo}</td>
                          <td style={{ padding: '4px 8px', border: '1px solid #e5e7eb' }}>{o.supplierName || '-'}</td>
                          <td style={{ padding: '4px 8px', border: '1px solid #e5e7eb', color: '#6b7280' }}>{o.paymentMethod || '-'}</td>
                          <td style={{ padding: '4px 8px', border: '1px solid #e5e7eb', textAlign: 'right', fontWeight: 600 }}>NT$ {Number(o.netAmount).toLocaleString()}</td>
                          <td style={{ padding: '4px 8px', border: '1px solid #e5e7eb', color: '#6b7280', fontFamily: 'monospace', fontSize: '0.75rem' }}>{o.purchaseNo || '-'}</td>
                          <td style={{ padding: '4px 8px', border: '1px solid #e5e7eb', color: '#9ca3af', fontSize: '0.75rem' }}>{o.note || '－'}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr style={{ background: '#dcfce7' }}>
                        <td colSpan={4} style={{ padding: '5px 8px', border: '1px solid #d1d5db', textAlign: 'right', fontWeight: 600, color: '#166534' }}>小計</td>
                        <td style={{ padding: '5px 8px', border: '1px solid #d1d5db', textAlign: 'right', fontWeight: 700, color: '#166534' }}>NT$ {subtotal.toLocaleString()}</td>
                        <td colSpan={2} style={{ border: '1px solid #d1d5db' }}></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              );
            })}

            {/* Grand total */}
            <div style={{ background: '#1f2937', color: '#fff', padding: '10px 16px', borderRadius: '6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px' }}>
              <span style={{ fontSize: '1rem' }}>總計　{allOrders.length} 筆　{Object.keys(groups).length} 個館別</span>
              <span style={{ fontSize: '1rem', fontWeight: 700 }}>NT$ {grandTotal.toLocaleString()}</span>
            </div>
          </div>
        );
      })()}
    </>
  );
}
