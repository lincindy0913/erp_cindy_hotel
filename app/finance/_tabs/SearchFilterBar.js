'use client';

export default function SearchFilterBar({
  finSearchDateFrom, setFinSearchDateFrom,
  finSearchDateTo, setFinSearchDateTo,
  finSearchWarehouse, setFinSearchWarehouse,
  finSearchSupplierId, setFinSearchSupplierId,
  finSearchPaymentMethod, setFinSearchPaymentMethod,
  orders,
  suppliers,
  paymentMethodOptions,
  displayOrders,
  rawDisplayOrders,
}) {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-4">
      <h3 className="text-sm font-semibold text-gray-700 mb-3">查詢條件</h3>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 items-end">
        <div>
          <label htmlFor="f-16" className="block text-xs text-gray-500 mb-1">建立日期起</label>
          <input id="f-16" type="date" value={finSearchDateFrom} onChange={e => setFinSearchDateFrom(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500" />
        </div>
        <div>
          <label htmlFor="f-17" className="block text-xs text-gray-500 mb-1">建立日期迄</label>
          <input id="f-17" type="date" value={finSearchDateTo} onChange={e => setFinSearchDateTo(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500" />
        </div>
        <div>
          <label htmlFor="f-18" className="block text-xs text-gray-500 mb-1">館別</label>
          <select id="f-18" value={finSearchWarehouse} onChange={e => setFinSearchWarehouse(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500">
            <option value="">全部館別</option>
            {[...new Set(orders.map(o => o.warehouse).filter(Boolean))].sort().map(w => <option key={w} value={w}>{w}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="f-27" className="block text-xs text-gray-500 mb-1">廠商</label>
          <select id="f-27" value={finSearchSupplierId} onChange={e => setFinSearchSupplierId(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500">
            <option value="">全部廠商</option>
            {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="f-28" className="block text-xs text-gray-500 mb-1">付款方式</label>
          <select id="f-28" value={finSearchPaymentMethod} onChange={e => setFinSearchPaymentMethod(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500">
            <option value="">全部方式</option>
            {paymentMethodOptions.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
      </div>
      <div className="flex items-center gap-3 mt-3">
        {(finSearchDateFrom || finSearchDateTo || finSearchWarehouse || finSearchSupplierId || finSearchPaymentMethod) && (
          <button onClick={() => { setFinSearchDateFrom(''); setFinSearchDateTo(''); setFinSearchWarehouse(''); setFinSearchSupplierId(''); setFinSearchPaymentMethod(''); }}
            className="px-3 py-1.5 border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50 text-sm">清除篩選</button>
        )}
        <span className="text-xs text-gray-400">共 {displayOrders.length} 筆 / 總計 {rawDisplayOrders.length} 筆</span>
      </div>
    </div>
  );
}
