'use client';

export default function WarehouseReportModal({
  showWarehouseReportModal,
  setShowWarehouseReportModal,
  reportMonth, setReportMonth,
  reportWarehouse, setReportWarehouse,
  warehouseOptionsForReport,
  reportOrdersByWarehouse,
  getInvoicesForOrder,
}) {
  if (!showWarehouseReportModal) return null;

  return (
    <>
      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 no-print-finance" onClick={() => setShowWarehouseReportModal(false)}>
        <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto no-print-finance" onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-bold text-gray-800">付款單草稿報表（按付款單的館別列印）</h3>
            <button type="button" onClick={() => setShowWarehouseReportModal(false)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
          </div>
          <div className="px-6 py-4 space-y-4">
            <p className="text-sm text-gray-600">每月進銷存費用之付款單草稿，可依館別篩選後列印，供飯店會計使用。</p>
            <div className="flex flex-wrap items-end gap-4">
              <div>
                <label htmlFor="f-19" className="block text-xs text-gray-500 mb-1">報表月份</label>
                <input id="f-19" type="month" value={reportMonth} onChange={e => setReportMonth(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm" />
              </div>
              <div>
                <label htmlFor="f-20" className="block text-xs text-gray-500 mb-1">館別</label>
                <select id="f-20" value={reportWarehouse} onChange={e => setReportWarehouse(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm min-w-[180px]">
                  {warehouseOptionsForReport.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="border border-gray-200 rounded-lg overflow-hidden overflow-x-auto">
              {Object.keys(reportOrdersByWarehouse).length === 0 ? (
                <div className="px-4 py-8 text-center text-gray-500 text-sm">該月份無草稿付款單，或請選擇其他館別。</div>
              ) : (
                Object.entries(reportOrdersByWarehouse).map(([whKey, list]) => {
                  const whLabel = whKey === '__none__' ? '未指定館別' : whKey;
                  const total = list.reduce((s, o) => s + Number(o.netAmount || 0), 0);
                  return (
                    <div key={whKey} className="mb-6 last:mb-0">
                      <div className="bg-gray-100 px-4 py-2 font-semibold text-gray-800 border-b border-gray-200">館別：{whLabel}（共 {list.length} 筆，淨額合計 NT$ {total.toLocaleString()}）</div>
                      <table className="w-full text-sm">
                        <thead className="sticky top-0 z-10 bg-gray-50">
                          <tr className="bg-gray-50">
                            <th className="px-3 py-2 text-left">序號</th>
                            <th className="px-3 py-2 text-left">付款單號</th>
                            <th className="px-3 py-2 text-left">銷帳年月</th>
                            <th className="px-3 py-2 text-left">廠商</th>
                            <th className="px-3 py-2 text-left">付款方式</th>
                            <th className="px-3 py-2 text-right">發票數</th>
                            <th className="px-3 py-2 text-right">折讓</th>
                            <th className="px-3 py-2 text-right">淨額</th>
                            <th className="px-3 py-2 text-left">建立日期</th>
                            <th className="px-3 py-2 text-left">備註</th>
                          </tr>
                        </thead>
                        <tbody>
                          {list.map((o, idx) => {
                            const invCount = getInvoicesForOrder(o).length;
                            return (
                              <tr key={o.id} className="border-t border-gray-100">
                                <td className="px-3 py-2 text-gray-600">{idx + 1}</td>
                                <td className="px-3 py-2 font-medium text-indigo-700">{o.orderNo}</td>
                                <td className="px-3 py-2 text-gray-600">{reportMonth || '－'}</td>
                                <td className="px-3 py-2">{o.supplierName || '-'}</td>
                                <td className="px-3 py-2">{o.paymentMethod}</td>
                                <td className="px-3 py-2 text-right">{invCount} 張</td>
                                <td className="px-3 py-2 text-right">{Number(o.discount) > 0 ? `NT$ ${Number(o.discount).toLocaleString()}` : '-'}</td>
                                <td className="px-3 py-2 text-right font-semibold">NT$ {Number(o.netAmount).toLocaleString()}</td>
                                <td className="px-3 py-2 text-gray-500">{o.createdAt ? new Date(o.createdAt).toLocaleDateString('zh-TW') : '-'}</td>
                                <td className="px-3 py-2 text-gray-500 max-w-[120px] truncate" title={o.note || ''}>{o.note || '－'}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  );
                })
              )}
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={() => setShowWarehouseReportModal(false)} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">關閉</button>
              <button type="button" onClick={() => window.print()} className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">列印</button>
            </div>
          </div>
        </div>
      </div>

      {/* 列印時只顯示此區塊 */}
      <div id="finance-warehouse-report-print-root" className="fixed -left-[9999px] top-0 w-screen bg-white p-8" aria-hidden="true">
        <h1 className="text-xl font-bold text-gray-800 mb-2">付款單草稿報表（按付款單的館別）</h1>
        <p className="text-sm text-gray-500 mb-4">報表月份：{reportMonth}　列印日期：{new Date().toLocaleDateString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</p>
        <p className="text-sm text-gray-600 mb-4">每月進銷存費用之付款單草稿，依館別列示。</p>
        {Object.keys(reportOrdersByWarehouse).length === 0 ? (
          <p className="text-sm text-gray-500">該月份無草稿付款單。</p>
        ) : (
          Object.entries(reportOrdersByWarehouse).map(([whKey, list]) => {
            const whLabel = whKey === '__none__' ? '未指定館別' : whKey;
            const total = list.reduce((s, o) => s + Number(o.netAmount || 0), 0);
            return (
              <div key={whKey} className="mb-6 break-inside-avoid">
                <h2 className="text-base font-bold text-gray-800 mt-4 mb-2 border-b border-gray-300 pb-1">館別：{whLabel}（共 {list.length} 筆，淨額合計 NT$ {total.toLocaleString()}）</h2>
                <table className="w-full text-sm border border-gray-300">
                  <thead>
                    <tr className="bg-gray-100">
                      <th className="px-3 py-2 text-left border border-gray-300">序號</th>
                      <th className="px-3 py-2 text-left border border-gray-300">付款單號</th>
                      <th className="px-3 py-2 text-left border border-gray-300">銷帳年月</th>
                      <th className="px-3 py-2 text-left border border-gray-300">廠商</th>
                      <th className="px-3 py-2 text-left border border-gray-300">付款方式</th>
                      <th className="px-3 py-2 text-right border border-gray-300">發票數</th>
                      <th className="px-3 py-2 text-right border border-gray-300">折讓</th>
                      <th className="px-3 py-2 text-right border border-gray-300">淨額</th>
                      <th className="px-3 py-2 text-left border border-gray-300">建立日期</th>
                      <th className="px-3 py-2 text-left border border-gray-300">備註</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((o, idx) => {
                      const invCount = getInvoicesForOrder(o).length;
                      return (
                        <tr key={o.id}>
                          <td className="px-3 py-2 border border-gray-300 text-gray-600">{idx + 1}</td>
                          <td className="px-3 py-2 border border-gray-300 font-medium">{o.orderNo}</td>
                          <td className="px-3 py-2 border border-gray-300">{reportMonth || '－'}</td>
                          <td className="px-3 py-2 border border-gray-300">{o.supplierName || '-'}</td>
                          <td className="px-3 py-2 border border-gray-300">{o.paymentMethod}</td>
                          <td className="px-3 py-2 border border-gray-300 text-right">{invCount} 張</td>
                          <td className="px-3 py-2 border border-gray-300 text-right">{Number(o.discount) > 0 ? `NT$ ${Number(o.discount).toLocaleString()}` : '-'}</td>
                          <td className="px-3 py-2 border border-gray-300 text-right font-semibold">NT$ {Number(o.netAmount).toLocaleString()}</td>
                          <td className="px-3 py-2 border border-gray-300 text-gray-500">{o.createdAt ? new Date(o.createdAt).toLocaleDateString('zh-TW') : '-'}</td>
                          <td className="px-3 py-2 border border-gray-300 text-gray-500">{o.note || '－'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            );
          })
        )}
      </div>
    </>
  );
}
