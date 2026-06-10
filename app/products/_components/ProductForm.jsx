'use client';

export default function ProductForm({
  editingProduct,
  formData,
  setFormData,
  productSaving,
  accountingSearch,
  setAccountingSearch,
  showAccountingDropdown,
  setShowAccountingDropdown,
  inventorySubjectSearch,
  setInventorySubjectSearch,
  showInventorySubjectDropdown,
  setShowInventorySubjectDropdown,
  filteredAccounting,
  filteredInventorySubjects,
  warehouseOptions,
  newWarehouse,
  setNewWarehouse,
  showWarehouseManager,
  setShowWarehouseManager,
  addWarehouseOption,
  removeWarehouseOption,
  handleSubmit,
  cancelForm,
}) {
  return (
    <div className="bg-white rounded-lg shadow-sm p-6 mb-6 border-2 border-blue-200">
      <h3 className="text-lg font-semibold mb-4">{editingProduct ? '編輯產品' : '新增產品'}</h3>
      <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="f" className="block text-sm font-medium text-gray-700 mb-1">
            產品編碼 *
          </label>
          <input id="f"
            type="text"
            required
            value={formData.code}
            onChange={(e) => setFormData({ ...formData, code: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label htmlFor="f-2" className="block text-sm font-medium text-gray-700 mb-1">
            產品名稱 *
          </label>
          <input id="f-2"
            type="text"
            required
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label htmlFor="f-3" className="block text-sm font-medium text-gray-700 mb-1">
            類別
          </label>
          <input id="f-3"
            type="text"
            value={formData.category}
            onChange={(e) => setFormData({ ...formData, category: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label htmlFor="f-4" className="block text-sm font-medium text-gray-700 mb-1">
            單位
          </label>
          <input id="f-4"
            type="text"
            value={formData.unit}
            onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label htmlFor="f-5" className="block text-sm font-medium text-gray-700 mb-1">
            成本價 *
          </label>
          <input id="f-5"
            type="number"
            step="0.01"
            required
            value={formData.costPrice}
            onChange={(e) => setFormData({ ...formData, costPrice: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label htmlFor="f-6" className="block text-sm font-medium text-gray-700 mb-1">
            數量 *
          </label>
          <input id="f-6"
            type="number"
            step="1"
            required
            value={formData.salesPrice}
            onChange={(e) => setFormData({ ...formData, salesPrice: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label htmlFor="f-7" className="block text-sm font-medium text-gray-700 mb-1">
            是否列入庫存 *
          </label>
          <select id="f-7"
            required
            value={formData.isInStock ? '是' : '否'}
            onChange={(e) => {
              const isInStock = e.target.value === '是';
              setFormData({
                ...formData,
                isInStock: isInStock,
                warehouseLocation: isInStock ? formData.warehouseLocation : ''
              });
            }}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="否">否</option>
            <option value="是">是</option>
          </select>
        </div>
        {formData.isInStock && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              倉庫位置 *
              <button
                type="button"
                onClick={() => setShowWarehouseManager(!showWarehouseManager)}
                className="ml-2 text-xs text-blue-600 hover:underline"
              >
                {showWarehouseManager ? '收起管理' : '管理選項'}
              </button>
            </label>
            <select
              required
              value={formData.warehouseLocation}
              onChange={(e) => setFormData({ ...formData, warehouseLocation: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">請選擇</option>
              {warehouseOptions.map(opt => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
            {showWarehouseManager && (
              <div className="mt-2 p-3 bg-gray-50 rounded-lg border border-gray-200">
                <div className="flex gap-2 mb-2">
                  <input
                    type="text"
                    placeholder="輸入新倉庫名稱..."
                    value={newWarehouse}
                    onChange={(e) => setNewWarehouse(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addWarehouseOption(); } }}
                    className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  <button
                    type="button"
                    onClick={addWarehouseOption}
                    className="px-3 py-1 text-sm bg-green-600 text-white rounded hover:bg-green-700"
                  >
                    新增
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {warehouseOptions.map(opt => (
                    <span key={opt} className="inline-flex items-center gap-1 px-2 py-1 text-sm bg-white border rounded">
                      {opt}
                      <button
                        type="button"
                        onClick={() => removeWarehouseOption(opt)}
                        className="text-red-500 hover:text-red-700 font-bold"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
        <div className="relative product-accounting-search">
          <label htmlFor="f-8" className="block text-sm font-medium text-gray-700 mb-1">
            會計科目 *
          </label>
          <input id="f-8"
            type="text"
            required
            placeholder="輸入代碼或名稱搜尋..."
            value={accountingSearch}
            onChange={(e) => {
              setAccountingSearch(e.target.value);
              setShowAccountingDropdown(true);
              if (!e.target.value.trim()) {
                setFormData(prev => ({ ...prev, accountingSubject: '' }));
              }
            }}
            onFocus={() => setShowAccountingDropdown(true)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {showAccountingDropdown && (
            <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
              {filteredAccounting.length > 0 ? (
                filteredAccounting.map(a => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => {
                      const display = `${a.code} ${a.name}`;
                      setFormData(prev => ({ ...prev, accountingSubject: display }));
                      setAccountingSearch(display);
                      setShowAccountingDropdown(false);
                    }}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-blue-50 border-b border-gray-100 last:border-b-0 ${
                      formData.accountingSubject === `${a.code} ${a.name}` ? 'bg-blue-50 text-blue-700' : ''
                    }`}
                  >
                    <span className="font-mono text-purple-600 mr-2">{a.code}</span>
                    <span className="font-medium">{a.name}</span>
                    <span className="text-gray-400 ml-2 text-xs">{a.category}</span>
                  </button>
                ))
              ) : (
                <div className="px-3 py-2 text-sm text-gray-500">找不到符合的會計科目</div>
              )}
            </div>
          )}
        </div>
        <div className="relative product-inventory-subject-search">
          <label htmlFor="f-9" className="block text-sm font-medium text-gray-700 mb-1">
            存貨科目
          </label>
          <input id="f-9"
            type="text"
            placeholder="輸入代碼或名稱搜尋..."
            value={inventorySubjectSearch}
            onChange={(e) => {
              setInventorySubjectSearch(e.target.value);
              setShowInventorySubjectDropdown(true);
              if (!e.target.value.trim()) {
                setFormData(prev => ({ ...prev, inventorySubject: '' }));
              }
            }}
            onFocus={() => setShowInventorySubjectDropdown(true)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {showInventorySubjectDropdown && (
            <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
              <button
                type="button"
                onClick={() => {
                  setFormData(prev => ({ ...prev, inventorySubject: '' }));
                  setInventorySubjectSearch('');
                  setShowInventorySubjectDropdown(false);
                }}
                className="w-full text-left px-3 py-2 text-sm text-gray-400 hover:bg-gray-50 border-b border-gray-100"
              >
                （不設定）
              </button>
              {filteredInventorySubjects.length > 0 ? (
                filteredInventorySubjects.map(a => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => {
                      const display = `${a.code} ${a.name}`;
                      setFormData(prev => ({ ...prev, inventorySubject: display }));
                      setInventorySubjectSearch(display);
                      setShowInventorySubjectDropdown(false);
                    }}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-blue-50 border-b border-gray-100 last:border-b-0 ${
                      formData.inventorySubject === `${a.code} ${a.name}` ? 'bg-blue-50 text-blue-700' : ''
                    }`}
                  >
                    <span className="font-mono text-purple-600 mr-2">{a.code}</span>
                    <span className="font-medium">{a.name}</span>
                    <span className="text-gray-400 ml-2 text-xs">{a.category}</span>
                  </button>
                ))
              ) : (
                <div className="px-3 py-2 text-sm text-gray-500">找不到符合的會計科目</div>
              )}
            </div>
          )}
        </div>
        <div className="col-span-2 flex justify-end gap-3">
          <button
            type="button"
            onClick={cancelForm}
            className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            取消
          </button>
          <button
            type="submit"
            disabled={productSaving}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {productSaving ? '儲存中…' : (editingProduct ? '更新' : '儲存')}
          </button>
        </div>
      </form>
    </div>
  );
}
