'use client';

import { useRouter } from 'next/navigation';
import { todayStr } from '@/lib/localDate';

export default function AddInvoiceForm({
  editingInvoice,
  suppliers,
  products,
  // filter state
  filterData, setFilterData,
  // available/selected items
  loadingItems,
  availableItems,
  selectedItems,
  // invoice form state
  formData, setFormData,
  invoiceTitles,
  showTitleManager, setShowTitleManager,
  newTitleName, setNewTitleName,
  taxAmount,
  totals,
  salesSaving,
  // handlers
  fetchUninvoicedItems,
  handleItemToggle,
  handleSelectAll,
  handleAddTitle,
  handleDeleteTitle,
  handleSubmit,
  setShowAddForm,
  setEditingInvoice,
  setSelectedItems,
  setAvailableItems,
  setSalesSaving,
  confirm,
}) {
  const router = useRouter();

  function getSupplierName(supplierId) {
    const s = suppliers.find(s => s.id === supplierId);
    return s ? s.name : '未知廠商';
  }

  function getProductName(productId) {
    const p = products.find(p => p.id === productId);
    return p ? p.name : '未知產品';
  }

  async function handleCancel() {
    const isDirty = !!editingInvoice || selectedItems.length > 0 || !!formData.invoiceNo.trim() || !!formData.invoiceAmount.toString().trim();
    if (isDirty && confirm) {
      const ok = await confirm('表單尚有未儲存的內容，確定要離開？', { title: '放棄變更', danger: true });
      if (!ok) return;
    }
    setShowAddForm(false);
    setEditingInvoice(null);
    setSelectedItems([]);
    setAvailableItems([]);
    setSalesSaving(false);
    setFilterData({ yearMonth: '', supplierId: '', warehouse: '' });
    setFormData({
      invoiceNo: '', invoiceDate: todayStr(), invoiceTitle: '',
      invoiceType: '進貨單', taxType: '應稅',
      invoiceAmount: '', supplierDiscount: '', status: '待核銷',
    });
  }

  return (
    <div className="bg-white rounded-lg shadow-sm p-6 mb-6 border-2 border-blue-200">
      <h3 className="text-lg font-semibold mb-4">{editingInvoice ? '編輯發票' : '新增發票'}</h3>
      <form onSubmit={handleSubmit}>
        {/* 篩選條件 */}
        <div className="bg-gray-50 border rounded-lg p-4 mb-6">
          <h4 className="text-md font-semibold mb-3">篩選未核銷的進貨單品項</h4>
          <div className="grid grid-cols-3 gap-4 mb-3">
            <div>
              <label htmlFor="f-21" className="block text-sm font-medium text-gray-700 mb-1">進貨年月</label>
              <input id="f-21" type="month" value={filterData.yearMonth}
                onChange={(e) => setFilterData({ ...filterData, yearMonth: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label htmlFor="f-22" className="block text-sm font-medium text-gray-700 mb-1">廠商</label>
              <select id="f-22" value={filterData.supplierId}
                onChange={(e) => setFilterData({ ...filterData, supplierId: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">全部廠商</option>
                {suppliers.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="f-30" className="block text-sm font-medium text-gray-700 mb-1">館別</label>
              <select id="f-30" value={filterData.warehouse}
                onChange={(e) => setFilterData({ ...filterData, warehouse: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">全部館別</option>
                <option value="麗格">麗格</option>
                <option value="麗軒">麗軒</option>
                <option value="民宿">民宿</option>
              </select>
            </div>
          </div>
          <button type="button" onClick={fetchUninvoicedItems}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
            查詢未核銷品項
          </button>
        </div>

        {/* 未核銷品項列表（勾選） */}
        {loadingItems ? (
          <div className="text-center py-8 text-gray-500">載入中...</div>
        ) : availableItems.length > 0 ? (
          <div className="mb-6">
            <div className="flex justify-between items-center mb-3">
              <h4 className="text-md font-semibold">請勾選要核銷的進貨單品項（共 {availableItems.length} 筆）</h4>
              <button type="button" onClick={handleSelectAll} className="text-sm text-blue-600 hover:underline">
                {selectedItems.length === availableItems.length ? '取消全選' : '全選'}
              </button>
            </div>
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-50 sticky top-0 z-10">
                  <tr>
                    <th className="px-3 py-2 text-left text-sm font-medium text-gray-700 w-12">
                      <input type="checkbox"
                        checked={selectedItems.length === availableItems.length && availableItems.length > 0}
                        onChange={handleSelectAll}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                    </th>
                    <th className="px-3 py-2 text-left text-sm font-medium text-gray-700">館別</th>
                    <th className="px-3 py-2 text-left text-sm font-medium text-gray-700">進貨單號</th>
                    <th className="px-3 py-2 text-left text-sm font-medium text-gray-700">進貨日期</th>
                    <th className="px-3 py-2 text-left text-sm font-medium text-gray-700">廠商</th>
                    <th className="px-3 py-2 text-left text-sm font-medium text-gray-700">產品</th>
                    <th className="px-3 py-2 text-left text-sm font-medium text-gray-700">數量</th>
                    <th className="px-3 py-2 text-left text-sm font-medium text-gray-700">單價</th>
                    <th className="px-3 py-2 text-left text-sm font-medium text-gray-700">小計</th>
                    <th className="px-3 py-2 text-left text-sm font-medium text-gray-700">備註</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {availableItems.map((item) => {
                    const isSelected = selectedItems.some(selected => selected.id === item.id);
                    return (
                      <tr key={item.id} className={isSelected ? 'bg-blue-50' : ''}>
                        <td className="px-3 py-2">
                          <input type="checkbox" checked={isSelected} onChange={() => handleItemToggle(item)}
                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                        </td>
                        <td className="px-3 py-2 text-sm">{item.warehouse || '-'}</td>
                        <td className="px-3 py-2 text-sm font-medium">
                          <button type="button"
                            onClick={() => router.push(`/purchasing?editPurchaseNo=${encodeURIComponent(item.purchaseNo)}`)}
                            className="text-blue-600 hover:underline">
                            {item.purchaseNo}
                          </button>
                        </td>
                        <td className="px-3 py-2 text-sm">{item.purchaseDate}</td>
                        <td className="px-3 py-2 text-sm">{getSupplierName(item.supplierId)}</td>
                        <td className="px-3 py-2 text-sm">{item.productId ? getProductName(item.productId) : '（整張進貨單）'}</td>
                        <td className="px-3 py-2 text-sm">{item.quantity}</td>
                        <td className="px-3 py-2 text-sm">{item.productId ? `NT$ ${item.unitPrice}` : '—'}</td>
                        <td className="px-3 py-2 text-sm">NT$ {Number(item.subtotal).toFixed(2)}</td>
                        <td className="px-3 py-2 text-sm text-gray-500">{item.note || '-'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 mb-6">
            <div className="text-center text-yellow-800">
              <p className="text-sm font-medium mb-2">⚠️ 尚未查詢或沒有未核銷的進貨單品項</p>
              <p className="text-xs text-yellow-600 mb-4">
                請先設定篩選條件（可選），然後點擊「查詢未核銷品項」按鈕
              </p>
              <div className="text-xs text-yellow-600 text-left inline-block">
                <p><strong>提示：</strong></p>
                <ul className="list-disc list-inside space-y-1 mt-2">
                  <li>如果不設定篩選條件，將顯示所有未核銷的進貨單品項</li>
                  <li>已建立的測試資料包含：</li>
                  <li className="ml-4">- 10月份：供應商C、麗格，有2筆毛巾進貨</li>
                  <li className="ml-4">- 11月份：供應商C、麗格，有2筆毛巾進貨</li>
                  <li className="ml-4">- 其他測試資料：洗髮精、床單等</li>
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* 已選品項列表 */}
        {selectedItems.length > 0 && (
          <div className="mb-6">
            <h4 className="text-md font-semibold mb-3">已選品項（共 {selectedItems.length} 項）</h4>
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full">
                <thead className="bg-green-50 sticky top-0 z-10">
                  <tr>
                    <th className="px-3 py-2 text-left text-sm font-medium text-gray-700">館別</th>
                    <th className="px-3 py-2 text-left text-sm font-medium text-gray-700">進貨單號</th>
                    <th className="px-3 py-2 text-left text-sm font-medium text-gray-700">進貨日期</th>
                    <th className="px-3 py-2 text-left text-sm font-medium text-gray-700">廠商</th>
                    <th className="px-3 py-2 text-left text-sm font-medium text-gray-700">產品</th>
                    <th className="px-3 py-2 text-left text-sm font-medium text-gray-700">數量</th>
                    <th className="px-3 py-2 text-left text-sm font-medium text-gray-700">單價</th>
                    <th className="px-3 py-2 text-left text-sm font-medium text-gray-700">銷售金額</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {selectedItems.map((item) => (
                    <tr key={item.id}>
                      <td className="px-3 py-2 text-sm">{item.warehouse || '-'}</td>
                      <td className="px-3 py-2 text-sm">
                        <button type="button"
                          onClick={() => router.push(`/purchasing?editPurchaseNo=${encodeURIComponent(item.purchaseNo)}`)}
                          className="text-blue-600 hover:underline font-medium">
                          {item.purchaseNo}
                        </button>
                      </td>
                      <td className="px-3 py-2 text-sm">{item.purchaseDate}</td>
                      <td className="px-3 py-2 text-sm">{getSupplierName(item.supplierId)}</td>
                      <td className="px-3 py-2 text-sm">{getProductName(item.productId)}</td>
                      <td className="px-3 py-2 text-sm">{item.quantity}</td>
                      <td className="px-3 py-2 text-sm">NT$ {item.unitPrice}</td>
                      <td className="px-3 py-2 text-sm">
                        NT$ {parseFloat(item.salesAmount !== undefined ? item.salesAmount : item.subtotal).toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-50">
                  <tr>
                    <td colSpan="7" className="px-3 py-2 text-sm font-semibold text-right">銷售金額合計：</td>
                    <td className="px-3 py-2 text-sm font-bold text-blue-600">
                      NT$ {selectedItems.reduce((sum, item) => sum + parseFloat(item.salesAmount || item.subtotal || 0), 0).toFixed(2)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}

        {/* 發票資訊 */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div>
            <label htmlFor="f-23" className="block text-sm font-medium text-gray-700 mb-1">發票號碼 *</label>
            <input id="f-23" type="text" required value={formData.invoiceNo}
              onChange={(e) => setFormData({ ...formData, invoiceNo: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="輸入發票號碼" />
          </div>
          <div>
            <label htmlFor="f-24" className="block text-sm font-medium text-gray-700 mb-1">發票日期 *</label>
            <input id="f-24" type="date" required value={formData.invoiceDate}
              onChange={(e) => setFormData({ ...formData, invoiceDate: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-sm font-medium text-gray-700">發票抬頭 *</label>
              <button type="button" onClick={() => setShowTitleManager(!showTitleManager)}
                className="text-xs text-blue-600 hover:underline">
                管理選項
              </button>
            </div>
            <select required value={formData.invoiceTitle}
              onChange={(e) => setFormData({ ...formData, invoiceTitle: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">請選擇抬頭...</option>
              {invoiceTitles.map(t => (
                <option key={t.id} value={t.title}>{t.title}</option>
              ))}
            </select>
          </div>

          {/* 發票抬頭管理面板 */}
          {showTitleManager && (
            <div className="col-span-2 border border-gray-300 rounded-lg p-4 bg-gray-50">
              <div className="flex justify-between items-center mb-3">
                <h4 className="text-sm font-semibold text-gray-700">發票抬頭管理</h4>
                <button type="button" onClick={() => setShowTitleManager(false)}
                  className="text-gray-400 hover:text-gray-600 text-sm">
                  收起
                </button>
              </div>
              <div className="flex gap-2 mb-3">
                <input type="text" placeholder="輸入新抬頭名稱..." value={newTitleName}
                  onChange={(e) => setNewTitleName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddTitle())}
                  className="flex-1 px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
                <button type="button" onClick={handleAddTitle}
                  className="px-4 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                  新增
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {invoiceTitles.map(t => (
                  <span key={t.id} className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-50 text-blue-700 text-xs rounded-full border border-blue-200">
                    {t.title}
                    <button type="button" onClick={() => handleDeleteTitle(t.title)}
                      className="text-blue-400 hover:text-red-500 font-bold ml-0.5">
                      x
                    </button>
                  </span>
                ))}
                {invoiceTitles.length === 0 && (
                  <span className="text-xs text-gray-400">尚無抬頭選項</span>
                )}
              </div>
            </div>
          )}

          <div>
            <label htmlFor="f-25" className="block text-sm font-medium text-gray-700 mb-1">發票類型 *</label>
            <select id="f-25" required value={formData.invoiceType}
              onChange={(e) => setFormData({ ...formData, invoiceType: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="進貨單">進貨單</option>
              <option value="租屋支出">租屋支出</option>
              <option value="固定費用">固定費用</option>
            </select>
          </div>
          <div>
            <label htmlFor="f-26" className="block text-sm font-medium text-gray-700 mb-1">發票金額（手動輸入） *</label>
            <input id="f-26" type="number" step="0.01" required value={formData.invoiceAmount}
              onChange={(e) => setFormData({ ...formData, invoiceAmount: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="輸入發票金額" />
          </div>
          <div>
            <label htmlFor="f-27" className="block text-sm font-medium text-gray-700 mb-1">營業稅類型 *</label>
            <select id="f-27" required value={formData.taxType}
              onChange={(e) => setFormData({ ...formData, taxType: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="應稅">應稅</option>
              <option value="零稅率">零稅率</option>
              <option value="免稅">免稅</option>
            </select>
          </div>
          <div>
            <label htmlFor="f-28" className="block text-sm font-medium text-gray-700 mb-1">營業稅金額（自動計算）</label>
            <input id="f-28" type="text" readOnly value={`NT$ ${taxAmount.toFixed(2)}`}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-100 text-gray-700" />
          </div>
          <div>
            <label htmlFor="f-29" className="block text-sm font-medium text-gray-700 mb-1">廠商折讓金額 *</label>
            <input id="f-29" type="number" step="0.01" required value={formData.supplierDiscount}
              onChange={(e) => setFormData({ ...formData, supplierDiscount: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="輸入廠商折讓金額" />
          </div>
        </div>

        {/* 金額計算 */}
        {selectedItems.length > 0 && (
          <div className="border-t pt-4 mb-4">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex flex-wrap justify-end gap-6">
                <div className="text-right">
                  <div className="text-xs text-gray-500 mb-1">銷售金額合計</div>
                  <div className="text-lg font-semibold">NT$ {totals.subtotal}</div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-gray-500 mb-1">發票金額</div>
                  <div className="text-lg font-semibold">NT$ {(parseFloat(formData.invoiceAmount) || 0).toFixed(2)}</div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-gray-500 mb-1">營業稅</div>
                  <div className="text-lg font-semibold">NT$ {taxAmount.toFixed(2)}</div>
                </div>
                {parseFloat(formData.supplierDiscount) > 0 && (
                  <div className="text-right">
                    <div className="text-xs text-gray-500 mb-1">廠商折讓</div>
                    <div className="text-lg font-semibold text-red-600">- NT$ {(parseFloat(formData.supplierDiscount) || 0).toFixed(2)}</div>
                  </div>
                )}
                <div className="text-right border-l-2 border-blue-300 pl-6">
                  <div className="text-xs text-blue-600 mb-1 font-medium">應付總額</div>
                  <div className="text-2xl font-bold text-blue-600">
                    NT$ {((parseFloat(formData.invoiceAmount) || 0) + taxAmount - (parseFloat(formData.supplierDiscount) || 0)).toFixed(2)}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 操作按鈕 */}
        <div className="flex justify-end gap-3">
          <button type="button" onClick={handleCancel}
            className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
            取消
          </button>
          <button type="submit" disabled={selectedItems.length === 0 || salesSaving}
            className={`px-6 py-2 rounded-lg ${
              selectedItems.length === 0 || salesSaving
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                : 'bg-blue-600 text-white hover:bg-blue-700'
            } disabled:opacity-50`}>
            {salesSaving ? '儲存中…' : '儲存'}
          </button>
        </div>
      </form>
    </div>
  );
}
