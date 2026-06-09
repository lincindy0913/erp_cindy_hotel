'use client';

import { SortableTh } from '@/components/SortableTh';
import WarehouseSelect from '../_components/WarehouseSelect';

export function TransferTab({
  transfers, transferLoading, sortedTransferRows, products,
  trfForm, setTrfForm, trfSubmitting, trfKey, trfDir, trfT,
  warehouseList, submitTransfer,
}) {
  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h3 className="text-lg font-semibold mb-4">新增調撥單（簡化）</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <div>
            <label className="block text-sm text-gray-600 mb-1">來源館別/倉庫 *</label>
            <WarehouseSelect
              value={trfForm.fromWarehouse}
              onChange={v => setTrfForm(prev => ({ ...prev, fromWarehouse: v }))}
              warehouseList={warehouseList}
              placeholder="選擇來源"
              className="w-full px-3 py-2 border rounded-lg text-sm"
              required
            />
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">目標館別/倉庫 *</label>
            <WarehouseSelect
              value={trfForm.toWarehouse}
              onChange={v => setTrfForm(prev => ({ ...prev, toWarehouse: v }))}
              warehouseList={warehouseList}
              placeholder="選擇目標"
              className="w-full px-3 py-2 border rounded-lg text-sm"
              required
            />
          </div>
          <div>
            <label htmlFor="trf-prod" className="block text-sm text-gray-600 mb-1">產品 *</label>
            <select id="trf-prod"
              value={trfForm.productId}
              onChange={e => {
                const p = products.find(x => x.id === Number(e.target.value));
                setTrfForm(prev => ({ ...prev, productId: e.target.value, productName: p?.name || '' }));
              }}
              className="w-full px-3 py-2 border rounded-lg text-sm"
            >
              <option value="">選擇產品</option>
              {products.map(p => <option key={p.id} value={p.id}>{p.code} - {p.name}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="trf-qty" className="block text-sm text-gray-600 mb-1">數量 *</label>
            <input id="trf-qty" type="number" min="1" value={trfForm.quantity}
              onChange={e => setTrfForm(prev => ({ ...prev, quantity: e.target.value }))}
              className="w-full px-3 py-2 border rounded-lg text-sm" />
          </div>
          <div>
            <label htmlFor="trf-note" className="block text-sm text-gray-600 mb-1">備註</label>
            <input id="trf-note" type="text" value={trfForm.note}
              onChange={e => setTrfForm(prev => ({ ...prev, note: e.target.value }))}
              placeholder="選填" className="w-full px-3 py-2 border rounded-lg text-sm" />
          </div>
        </div>
        <button onClick={submitTransfer} disabled={trfSubmitting}
          className="mt-4 px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50 text-sm">
          {trfSubmitting ? '送出中...' : '建立調撥單'}
        </button>
      </div>
      <div className="bg-white rounded-lg shadow-sm tbl-wrap">
        <h3 className="text-lg font-semibold p-4 border-b">調撥記錄</h3>
        <table className="w-full">
          <thead className="bg-gray-50 sticky top-0 z-10"><tr>
            <SortableTh label="單號" colKey="transferNo" sortKey={trfKey} sortDir={trfDir} onSort={trfT} className="px-4 py-2" />
            <SortableTh label="來源" colKey="fromWarehouse" sortKey={trfKey} sortDir={trfDir} onSort={trfT} className="px-4 py-2" />
            <SortableTh label="目標" colKey="toWarehouse" sortKey={trfKey} sortDir={trfDir} onSort={trfT} className="px-4 py-2" />
            <SortableTh label="產品" colKey="productName" sortKey={trfKey} sortDir={trfDir} onSort={trfT} className="px-4 py-2" />
            <SortableTh label="數量" colKey="quantity" sortKey={trfKey} sortDir={trfDir} onSort={trfT} className="px-4 py-2" align="right" />
            <SortableTh label="日期" colKey="transferDate" sortKey={trfKey} sortDir={trfDir} onSort={trfT} className="px-4 py-2" />
          </tr></thead>
          <tbody>
            {transferLoading ? <tr><td colSpan="6" className="px-4 py-6 text-center text-gray-500">載入中...</td></tr> :
              transfers.length === 0 ? <tr><td colSpan="6" className="px-4 py-6 text-center text-gray-500">尚無調撥記錄</td></tr> :
              sortedTransferRows.map(row => (
                <tr key={row._key} className="border-t">
                  <td className="px-4 py-2 text-sm">{row.transferNo}</td>
                  <td className="px-4 py-2 text-sm">{row.fromWarehouse}</td>
                  <td className="px-4 py-2 text-sm">{row.toWarehouse}</td>
                  <td className="px-4 py-2 text-sm">{row.productName}</td>
                  <td className="px-4 py-2 text-sm text-right">{row.quantity}</td>
                  <td className="px-4 py-2 text-sm">{row.transferDate}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
