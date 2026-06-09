'use client';

const STATUS_MAP = {
  '待出納': { label: '待出納', cls: 'bg-amber-100 text-amber-700' },
  '草稿':   { label: '草稿',   cls: 'bg-gray-100 text-gray-500' },
  '已出納': { label: '已出納', cls: 'bg-blue-100 text-blue-700' },
  '已付款': { label: '已付款', cls: 'bg-green-100 text-green-700' },
  '已取消': { label: '已取消', cls: 'bg-red-100 text-red-400 line-through' },
};

export default function PaymentTab({
  paymentRecords,
  paymentLoading,
  paymentFilter,
  setPaymentFilter,
  fetchPaymentRecords,
  createPaymentOrder,
  creatingPO,
  WAREHOUSE_OPTIONS,
}) {
  const totalPending = paymentRecords.filter(r => r.paymentOrder?.status === '待出納').reduce((s, r) => s + (r.totalAmount || 0), 0);
  const totalPaid    = paymentRecords.filter(r => r.paymentOrder?.status === '已付款').reduce((s, r) => s + (r.totalAmount || 0), 0);
  const noPO         = paymentRecords.filter(r => !r.paymentOrderId).length;

  return (
    <div className="space-y-4">
      {/* 篩選列 */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex flex-wrap gap-3 items-end">
        <div>
          <label htmlFor="f-6" className="block text-xs text-gray-500 mb-1">館別</label>
          <select id="f-6" value={paymentFilter.warehouse}
            onChange={e => setPaymentFilter(f => ({ ...f, warehouse: e.target.value }))}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
            <option value="">全部</option>
            {WAREHOUSE_OPTIONS.filter(o => o.value).map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="f-12" className="block text-xs text-gray-500 mb-1">年度（民國）</label>
          <input id="f-12" type="number" value={paymentFilter.year}
            onChange={e => setPaymentFilter(f => ({ ...f, year: e.target.value }))}
            placeholder="例：114" className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-24" />
        </div>
        <div>
          <label htmlFor="f-7" className="block text-xs text-gray-500 mb-1">類型</label>
          <select id="f-7" value={paymentFilter.billType}
            onChange={e => setPaymentFilter(f => ({ ...f, billType: e.target.value }))}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
            <option value="">全部</option>
            <option value="電費">電費</option>
            <option value="水費">水費</option>
          </select>
        </div>
        <div>
          <label htmlFor="f-4" className="block text-xs text-gray-500 mb-1">付款狀態</label>
          <select id="f-4" value={paymentFilter.status}
            onChange={e => setPaymentFilter(f => ({ ...f, status: e.target.value }))}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
            <option value="">全部</option>
            <option value="待出納">待出納</option>
            <option value="已出納">已出納</option>
            <option value="已付款">已付款</option>
            <option value="已取消">已取消</option>
            <option value="noPO">尚無付款單</option>
          </select>
        </div>
        <button onClick={fetchPaymentRecords}
          className="px-4 py-2 bg-teal-600 text-white rounded-lg text-sm font-medium hover:bg-teal-700">
          重新查詢
        </button>
      </div>

      {/* 統計卡 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: '待出納金額', value: `NT$${totalPending.toLocaleString()}`, cls: 'bg-amber-50 border-amber-200 text-amber-700' },
          { label: '已付款金額', value: `NT$${totalPaid.toLocaleString()}`, cls: 'bg-green-50 border-green-200 text-green-700' },
          { label: '本次查詢筆數', value: `${paymentRecords.length} 筆`, cls: 'bg-gray-50 border-gray-200 text-gray-600' },
          { label: '尚無付款單', value: `${noPO} 筆`, cls: noPO > 0 ? 'bg-red-50 border-red-200 text-red-600' : 'bg-gray-50 border-gray-200 text-gray-400' },
        ].map(c => (
          <div key={c.label} className={`rounded-xl border p-4 ${c.cls}`}>
            <p className="text-xs opacity-70 mb-1">{c.label}</p>
            <p className="text-lg font-bold">{c.value}</p>
          </div>
        ))}
      </div>

      {/* 表格 */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {paymentLoading ? (
          <div className="py-16 text-center text-gray-400">載入中…</div>
        ) : paymentRecords.length === 0 ? (
          <div className="py-16 text-center text-gray-400">查無資料</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-teal-600">
              <tr className="bg-teal-600 text-white text-xs">
                <th className="px-4 py-2 text-left font-medium">館別</th>
                <th className="px-4 py-2 text-left font-medium">年月</th>
                <th className="px-4 py-2 text-left font-medium">類型</th>
                <th className="px-4 py-2 text-right font-medium">繳費金額</th>
                <th className="px-4 py-2 text-left font-medium">付款單號</th>
                <th className="px-4 py-2 text-center font-medium">付款狀態</th>
                <th className="px-4 py-2 text-left font-medium">截止日</th>
                <th className="px-4 py-2 text-center font-medium">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {paymentRecords.map(r => {
                const po = r.paymentOrder;
                const st = po ? (STATUS_MAP[po.status] || { label: po.status, cls: 'bg-gray-100 text-gray-500' }) : null;
                return (
                  <tr key={r.id} className={`hover:bg-gray-50 ${po?.status === '已付款' ? 'opacity-60' : ''}`}>
                    <td className="px-4 py-2 font-medium text-gray-700">{r.warehouse}</td>
                    <td className="px-4 py-2 text-gray-600">{r.billYear}年{String(r.billMonth).padStart(2,'0')}月</td>
                    <td className="px-4 py-2">
                      <span className={`text-xs px-1.5 py-0.5 rounded ${r.billType === '電費' ? 'bg-amber-100 text-amber-700' : 'bg-sky-100 text-sky-700'}`}>
                        {r.billType === '電費' ? '⚡ 電費' : '💧 水費'}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right font-mono font-semibold text-gray-800">
                      {r.totalAmount != null ? `NT$${Number(r.totalAmount).toLocaleString()}` : <span className="text-gray-300 text-xs">未計算</span>}
                    </td>
                    <td className="px-4 py-2 font-mono text-xs text-gray-600">
                      {po ? po.orderNo : <span className="text-gray-300 text-xs">—</span>}
                    </td>
                    <td className="px-4 py-2 text-center">
                      {st
                        ? <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${st.cls}`}>{st.label}</span>
                        : <span className="text-xs text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-2 text-xs text-gray-400">
                      {po?.dueDate || '—'}
                    </td>
                    <td className="px-4 py-2 text-center">
                      {!po || po.status === '已取消' ? (
                        <button
                          onClick={() => createPaymentOrder(r)}
                          disabled={creatingPO === r.id}
                          className="text-xs px-2 py-1 rounded border border-teal-400 text-teal-600 hover:bg-teal-50 disabled:opacity-40 whitespace-nowrap"
                        >
                          {creatingPO === r.id ? '建立中…' : '建立付款單'}
                        </button>
                      ) : (
                        <span className="text-xs text-gray-300">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <p className="text-xs text-gray-400 px-1">
        付款單建立後會自動出現在「出納待支出」清單。如需修改金額或取消，請至「出納」頁面操作。
      </p>
    </div>
  );
}
