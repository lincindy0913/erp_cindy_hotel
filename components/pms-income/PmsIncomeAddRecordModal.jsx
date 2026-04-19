'use client';

export default function PmsIncomeAddRecordModal({
  showAddModal,
  onClose,
  addForm,
  setAddForm,
  error,
  handleAddRecord,
  WAREHOUSES,
}) {
  if (!showAddModal) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg">
        <div className="border-b px-6 py-4 flex items-center justify-between">
          <h3 className="text-lg font-bold text-teal-800">手動新增收入記錄</h3>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl">
            &times;
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">館別 *</label>
              <select
                value={addForm.warehouse}
                onChange={(e) => setAddForm((p) => ({ ...p, warehouse: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
              >
                {WAREHOUSES.map((w) => (
                  <option key={w} value={w}>
                    {w}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">營業日期 *</label>
              <input
                type="date"
                value={addForm.businessDate}
                onChange={(e) => setAddForm((p) => ({ ...p, businessDate: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">借貸方 *</label>
              <select
                value={addForm.entryType}
                onChange={(e) => setAddForm((p) => ({ ...p, entryType: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
              >
                <option value="貸方">貸方</option>
                <option value="借方">借方</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">PMS 欄位名 *</label>
              <input
                type="text"
                value={addForm.pmsColumnName}
                onChange={(e) => setAddForm((p) => ({ ...p, pmsColumnName: e.target.value }))}
                placeholder="例: 住房收入"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">金額 *</label>
              <input
                type="number"
                value={addForm.amount}
                step="1"
                min="0"
                onChange={(e) => setAddForm((p) => ({ ...p, amount: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-right focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">科目代碼 *</label>
              <input
                type="text"
                value={addForm.accountingCode}
                onChange={(e) => setAddForm((p) => ({ ...p, accountingCode: e.target.value }))}
                placeholder="4111"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">科目名稱 *</label>
              <input
                type="text"
                value={addForm.accountingName}
                onChange={(e) => setAddForm((p) => ({ ...p, accountingName: e.target.value }))}
                placeholder="住房收入"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">備註</label>
            <input
              type="text"
              value={addForm.note}
              onChange={(e) => setAddForm((p) => ({ ...p, note: e.target.value }))}
              placeholder="選填"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
            />
          </div>

          {error && <div className="text-red-600 text-sm bg-red-50 px-3 py-2 rounded">{error}</div>}

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">
              取消
            </button>
            <button type="button" onClick={handleAddRecord} className="px-6 py-2 text-sm bg-teal-600 text-white rounded-lg hover:bg-teal-700">
              確認新增
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
