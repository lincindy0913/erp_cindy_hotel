'use client';

import WarehouseSelect from '../_components/WarehouseSelect';

export function AdjustModal({
  adjustModal, setAdjustModal, adjustForm, setAdjustForm, adjustSubmitting,
  warehouseList, submitAdjustment,
}) {
  if (!adjustModal) return null;
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b">
          <h2 className="text-base font-semibold">手動調整庫存</h2>
          <button onClick={() => setAdjustModal(null)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>
        <div className="p-5 space-y-4">
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm">
            <span className="font-medium text-gray-800">{adjustModal.productName}</span>
            <span className="ml-2 text-red-700">現存量：{adjustModal.currentQty}</span>
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">倉庫 *</label>
            <WarehouseSelect
              value={adjustForm.warehouse}
              onChange={v => setAdjustForm(prev => ({ ...prev, warehouse: v }))}
              warehouseList={warehouseList}
              placeholder="選擇倉庫"
              className="w-full px-3 py-2 border rounded-lg text-sm"
              required
            />
          </div>
          <div>
            <label htmlFor="adj-qty" className="block text-sm text-gray-600 mb-1">設定為（目標數量） *</label>
            <input id="adj-qty" type="number" value={adjustForm.targetQty}
              onChange={e => setAdjustForm(prev => ({ ...prev, targetQty: e.target.value }))}
              className="w-full px-3 py-2 border rounded-lg text-sm"
              placeholder="例：0 或正整數" />
          </div>
          <div>
            <label htmlFor="adj-reason" className="block text-sm text-gray-600 mb-1">原因</label>
            <input id="adj-reason" type="text" value={adjustForm.reason}
              onChange={e => setAdjustForm(prev => ({ ...prev, reason: e.target.value }))}
              className="w-full px-3 py-2 border rounded-lg text-sm"
              placeholder="說明調整原因（選填）" />
          </div>
        </div>
        <div className="flex justify-end gap-3 p-5 border-t">
          <button onClick={() => setAdjustModal(null)} className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50">取消</button>
          <button onClick={submitAdjustment} disabled={adjustSubmitting}
            className="px-4 py-2 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700 disabled:opacity-50">
            {adjustSubmitting ? '調整中...' : '確認調整'}
          </button>
        </div>
      </div>
    </div>
  );
}
