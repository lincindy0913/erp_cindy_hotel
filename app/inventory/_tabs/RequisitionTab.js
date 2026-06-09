'use client';

import { SortableTh } from '@/components/SortableTh';
import WarehouseSelect, { getDepartmentsForWarehouse } from '../_components/WarehouseSelect';
import ComboInput from '../_components/ComboInput';

export function RequisitionTab({
  requisitions, requisitionLoading, sortedRequisitions, products,
  reqForm, setReqForm, reqSubmitting, reqKey, reqDir, reqT,
  warehouseList, submitRequisition,
}) {
  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h3 className="text-lg font-semibold mb-4">新增領用單（簡化）</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <div>
            <label className="block text-sm text-gray-600 mb-1">倉庫 / 館別 *</label>
            <WarehouseSelect
              value={reqForm.warehouse}
              onChange={v => setReqForm(prev => ({ ...prev, warehouse: v, department: '' }))}
              warehouseList={warehouseList}
              placeholder="選擇館別/倉庫"
              className="w-full px-3 py-2 border rounded-lg text-sm"
              required
            />
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">部門</label>
            <ComboInput
              value={reqForm.department}
              onChange={v => setReqForm(prev => ({ ...prev, department: v }))}
              options={getDepartmentsForWarehouse(warehouseList, reqForm.warehouse).map(d => d.name)}
              placeholder="選擇或輸入部門"
              className="w-full px-3 py-2 border rounded-lg text-sm"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">產品 *</label>
            <select
              value={reqForm.productId}
              onChange={e => {
                const p = products.find(x => x.id === Number(e.target.value));
                setReqForm(prev => ({ ...prev, productId: e.target.value, productName: p?.name || '' }));
              }}
              className="w-full px-3 py-2 border rounded-lg text-sm"
            >
              <option value="">選擇產品</option>
              {products.map(p => <option key={p.id} value={p.id}>{p.code} - {p.name}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="req-qty" className="block text-sm text-gray-600 mb-1">數量 *</label>
            <input id="req-qty" type="number" min="1" value={reqForm.quantity}
              onChange={e => setReqForm(prev => ({ ...prev, quantity: e.target.value }))}
              className="w-full px-3 py-2 border rounded-lg text-sm" />
          </div>
          <div>
            <label htmlFor="req-note" className="block text-sm text-gray-600 mb-1">備註</label>
            <input id="req-note" type="text" value={reqForm.note}
              onChange={e => setReqForm(prev => ({ ...prev, note: e.target.value }))}
              placeholder="選填" className="w-full px-3 py-2 border rounded-lg text-sm" />
          </div>
        </div>
        <button onClick={submitRequisition} disabled={reqSubmitting}
          className="mt-4 px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50 text-sm">
          {reqSubmitting ? '送出中...' : '建立領用單'}
        </button>
      </div>
      <div className="bg-white rounded-lg shadow-sm tbl-wrap">
        <h3 className="text-lg font-semibold p-4 border-b">領用記錄</h3>
        <table className="w-full">
          <thead className="bg-gray-50 sticky top-0 z-10"><tr>
            <SortableTh label="單號" colKey="requisitionNo" sortKey={reqKey} sortDir={reqDir} onSort={reqT} className="px-4 py-2" />
            <SortableTh label="倉庫" colKey="warehouse" sortKey={reqKey} sortDir={reqDir} onSort={reqT} className="px-4 py-2" />
            <SortableTh label="部門" colKey="department" sortKey={reqKey} sortDir={reqDir} onSort={reqT} className="px-4 py-2" />
            <SortableTh label="產品" colKey="productName" sortKey={reqKey} sortDir={reqDir} onSort={reqT} className="px-4 py-2" />
            <SortableTh label="數量" colKey="quantity" sortKey={reqKey} sortDir={reqDir} onSort={reqT} className="px-4 py-2" align="right" />
            <SortableTh label="日期" colKey="requisitionDate" sortKey={reqKey} sortDir={reqDir} onSort={reqT} className="px-4 py-2" />
          </tr></thead>
          <tbody>
            {requisitionLoading ? <tr><td colSpan="6" className="px-4 py-6 text-center text-gray-500">載入中...</td></tr> :
              requisitions.length === 0 ? <tr><td colSpan="6" className="px-4 py-6 text-center text-gray-500">尚無領用記錄</td></tr> :
              sortedRequisitions.map(r => (
                <tr key={r.id} className="border-t">
                  <td className="px-4 py-2 text-sm">{r.requisitionNo}</td>
                  <td className="px-4 py-2 text-sm">{r.warehouse}</td>
                  <td className="px-4 py-2 text-sm">{r.department || '-'}</td>
                  <td className="px-4 py-2 text-sm">{r.product?.name || '-'}</td>
                  <td className="px-4 py-2 text-sm text-right">{r.quantity}</td>
                  <td className="px-4 py-2 text-sm">{r.requisitionDate}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
