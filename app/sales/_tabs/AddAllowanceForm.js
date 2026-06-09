'use client';

export default function AddAllowanceForm({
  allowanceFormData,
  setAllowanceFormData,
  allowanceSaving,
  saveAllowance,
  setShowAddAllowanceForm,
}) {
  return (
    <div className="bg-white rounded-lg shadow-sm p-6 mb-6 border-2 border-red-200">
      <h3 className="text-lg font-semibold mb-4 text-red-700">新增折讓發票</h3>
      <form onSubmit={saveAllowance}>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
          <div>
            <label htmlFor="f" className="block text-sm font-medium text-gray-700 mb-1">折讓日期 *</label>
            <input id="f" type="date" required value={allowanceFormData.allowanceDate}
              onChange={e => setAllowanceFormData({ ...allowanceFormData, allowanceDate: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 text-sm" />
          </div>
          <div>
            <label htmlFor="f-2" className="block text-sm font-medium text-gray-700 mb-1">館別</label>
            <select id="f-2" value={allowanceFormData.warehouse}
              onChange={e => setAllowanceFormData({ ...allowanceFormData, warehouse: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 text-sm">
              <option value="">請選擇</option>
              <option value="麗格">麗格</option>
              <option value="麗軒">麗軒</option>
              <option value="民宿">民宿</option>
            </select>
          </div>
          <div>
            <label htmlFor="f-3" className="block text-sm font-medium text-gray-700 mb-1">廠商名稱 *</label>
            <input id="f-3" type="text" required value={allowanceFormData.supplierName}
              onChange={e => setAllowanceFormData({ ...allowanceFormData, supplierName: e.target.value })}
              placeholder="廠商名稱"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 text-sm" />
          </div>
          <div>
            <label htmlFor="f-4" className="block text-sm font-medium text-gray-700 mb-1">原發票號</label>
            <input id="f-4" type="text" value={allowanceFormData.invoiceNo}
              onChange={e => setAllowanceFormData({ ...allowanceFormData, invoiceNo: e.target.value })}
              placeholder="原始發票號碼"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 text-sm" />
          </div>
          <div>
            <label htmlFor="f-5" className="block text-sm font-medium text-gray-700 mb-1">折讓金額（含稅）*</label>
            <input id="f-5" type="number" required min="0.01" step="0.01" value={allowanceFormData.totalAmount}
              onChange={e => setAllowanceFormData({ ...allowanceFormData, totalAmount: e.target.value, amount: e.target.value })}
              placeholder="0.00"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 text-sm" />
          </div>
          <div>
            <label htmlFor="f-6" className="block text-sm font-medium text-gray-700 mb-1">折讓原因</label>
            <input id="f-6" type="text" value={allowanceFormData.reason}
              onChange={e => setAllowanceFormData({ ...allowanceFormData, reason: e.target.value })}
              placeholder="折讓原因"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 text-sm" />
          </div>
        </div>
        <div className="flex justify-end gap-3">
          <button type="button" onClick={() => setShowAddAllowanceForm(false)}
            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm">
            取消
          </button>
          <button type="submit" disabled={allowanceSaving}
            className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 text-sm">
            {allowanceSaving ? '儲存中…' : '儲存折讓發票'}
          </button>
        </div>
      </form>
    </div>
  );
}
