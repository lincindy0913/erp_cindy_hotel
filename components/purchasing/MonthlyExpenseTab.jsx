'use client';
import Link from 'next/link';

export default function MonthlyExpenseTab({ expense, suppliers, products, warehousesList, storageLocationsList, paymentMethodOptions, invoiceTitles }) {
  const {
    monthlyExpenseSubTab, setMonthlyExpenseSubTab,
    expenseTemplates,
    showExpTemplateForm, setShowExpTemplateForm,
    editingExpTemplate,
    expTemplateForm, setExpTemplateForm,
    resetExpTemplateForm, handleEditExpTemplate, handleSaveExpTemplate,
    handleDeleteExpTemplate, handleToggleExpTemplateActive,
    templateSaving,
    selectedExpenseTemplateId, setSelectedExpenseTemplateId,
    handleSelectExpenseTemplate,
    executeExpenseForm, setExecuteExpenseForm,
    updateExecuteExpenseItem,
    getExecPurchaseTotal, calcTaxAmount,
    handleExecutePurchaseExpense,
    submittingExpense,
    expenseRecordFilter, setExpenseRecordFilter,
    expenseRecords, expenseRecordsLoading,
  } = expense;

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">進銷存每月費用</h2>
      <div className="flex gap-2 border-b border-gray-200 mb-4">
        <button type="button" onClick={() => setMonthlyExpenseSubTab('templates')}
          className={`px-3 py-2 text-sm rounded-t ${monthlyExpenseSubTab === 'templates' ? 'bg-orange-100 text-orange-800 border border-b-0 border-orange-300' : 'text-gray-600 hover:bg-gray-100'}`}>
          費用範本
        </button>
        <button type="button" onClick={() => setMonthlyExpenseSubTab('execute')}
          className={`px-3 py-2 text-sm rounded-t ${monthlyExpenseSubTab === 'execute' ? 'bg-orange-100 text-orange-800 border border-b-0 border-orange-300' : 'text-gray-600 hover:bg-gray-100'}`}>
          快速執行
        </button>
        <button type="button" onClick={() => setMonthlyExpenseSubTab('records')}
          className={`px-3 py-2 text-sm rounded-t ${monthlyExpenseSubTab === 'records' ? 'bg-orange-100 text-orange-800 border border-b-0 border-orange-300' : 'text-gray-600 hover:bg-gray-100'}`}>
          執行記錄
        </button>
      </div>

      {/* ── 費用範本 ── */}
      {monthlyExpenseSubTab === 'templates' && (
        <div className="bg-white rounded-lg border p-4">
          <div className="flex justify-between items-center mb-4">
            <p className="text-gray-600 text-sm">依廠商建立每月固定進貨範本，執行時自動帶入廠商與品項。</p>
            <button type="button" onClick={() => { resetExpTemplateForm(); setShowExpTemplateForm(true); }}
              className="bg-orange-600 text-white px-4 py-2 rounded-lg hover:bg-orange-700 text-sm font-medium">
              + 新增範本
            </button>
          </div>

          {showExpTemplateForm && (
            <div className="border border-orange-200 rounded-lg p-4 mb-4 bg-orange-50">
              <h4 className="text-md font-semibold mb-3">{editingExpTemplate ? '編輯範本' : '新增範本'}</h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
                <div>
                  <label htmlFor="et-name" className="block text-sm font-medium text-gray-700 mb-1">範本名稱 *</label>
                  <input id="et-name" value={expTemplateForm.name}
                    onChange={e => setExpTemplateForm(p => ({ ...p, name: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" placeholder="例: OO食品每月進貨" />
                </div>
                <div>
                  <label htmlFor="et-supplier" className="block text-sm font-medium text-gray-700 mb-1">廠商 *</label>
                  <select id="et-supplier" value={expTemplateForm.defaultSupplierId}
                    onChange={e => {
                      const sid = e.target.value;
                      const s = suppliers.find(s => s.id === parseInt(sid));
                      setExpTemplateForm(p => ({ ...p, defaultSupplierId: sid, paymentMethod: s?.paymentTerms || p.paymentMethod }));
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                    <option value="">選擇廠商</option>
                    {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="et-payment" className="block text-sm font-medium text-gray-700 mb-1">付款方式 (連動廠商)</label>
                  <input id="et-payment" value={expTemplateForm.paymentMethod}
                    onChange={e => setExpTemplateForm(p => ({ ...p, paymentMethod: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" placeholder="月結" />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
                <div>
                  <label htmlFor="et-wh" className="block text-sm font-medium text-gray-700 mb-1">預設館別</label>
                  <select id="et-wh" value={expTemplateForm.warehouse}
                    onChange={e => setExpTemplateForm(p => ({ ...p, warehouse: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                    <option value="">不限</option>
                    {warehousesList.map(w => <option key={w} value={w}>{w}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="et-tax" className="block text-sm font-medium text-gray-700 mb-1">稅別</label>
                  <select id="et-tax" value={expTemplateForm.defaultTaxType}
                    onChange={e => setExpTemplateForm(p => ({ ...p, defaultTaxType: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                    <option value="">不指定</option>
                    <option value="應稅">應稅</option>
                    <option value="免稅">免稅</option>
                    <option value="零稅率">零稅率</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="et-desc" className="block text-sm font-medium text-gray-700 mb-1">說明</label>
                  <input id="et-desc" value={expTemplateForm.description}
                    onChange={e => setExpTemplateForm(p => ({ ...p, description: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" placeholder="範本說明..." />
                </div>
              </div>
              <h5 className="text-sm font-semibold mb-2">預設進貨品項</h5>
              <table className="w-full border-collapse border border-gray-300 text-sm mb-2">
                <thead className="sticky top-0 z-10 bg-gray-100">
                  <tr className="bg-gray-100">
                    <th className="border border-gray-300 px-2 py-2 text-left">商品</th>
                    <th className="border border-gray-300 px-2 py-2 w-20">數量</th>
                    <th className="border border-gray-300 px-2 py-2 w-28">單價</th>
                    <th className="border border-gray-300 px-2 py-2 w-28 text-right">小計</th>
                    <th className="border border-gray-300 px-2 py-2 text-left">備註</th>
                    <th className="border border-gray-300 px-2 py-2 text-left w-36">庫存地點</th>
                    <th className="border border-gray-300 px-2 py-2 w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {expTemplateForm.purchaseItems.map((item, idx) => {
                    const product = products.find(p => p.id === parseInt(item.productId));
                    const needInventory = !!product?.isInStock;
                    return (
                      <tr key={idx}>
                        <td className="border border-gray-300 px-2 py-1">
                          <select value={item.productId}
                            onChange={e => setExpTemplateForm(p => ({ ...p, purchaseItems: p.purchaseItems.map((it, i) => i === idx ? { ...it, productId: e.target.value, inventoryWarehouse: '' } : it) }))}
                            className="w-full px-2 py-1 border border-gray-300 rounded text-sm">
                            <option value="">選擇商品</option>
                            {products.map(p => <option key={p.id} value={p.id}>{p.code || ''} - {p.name}</option>)}
                          </select>
                        </td>
                        <td className="border border-gray-300 px-2 py-1">
                          <input type="number" min={1} value={item.quantity}
                            onChange={e => setExpTemplateForm(p => ({ ...p, purchaseItems: p.purchaseItems.map((it, i) => i === idx ? { ...it, quantity: e.target.value } : it) }))}
                            className="w-full px-2 py-1 border border-gray-300 rounded text-sm" />
                        </td>
                        <td className="border border-gray-300 px-2 py-1">
                          <input type="number" step="0.01" value={item.unitPrice}
                            onChange={e => setExpTemplateForm(p => ({ ...p, purchaseItems: p.purchaseItems.map((it, i) => i === idx ? { ...it, unitPrice: e.target.value } : it) }))}
                            className="w-full px-2 py-1 border border-gray-300 rounded text-sm" />
                        </td>
                        <td className="border border-gray-300 px-2 py-1 text-right font-medium">
                          {((parseFloat(item.quantity) || 0) * (parseFloat(item.unitPrice) || 0)).toLocaleString()}
                        </td>
                        <td className="border border-gray-300 px-2 py-1">
                          <input value={item.note}
                            onChange={e => setExpTemplateForm(p => ({ ...p, purchaseItems: p.purchaseItems.map((it, i) => i === idx ? { ...it, note: e.target.value } : it) }))}
                            className="w-full px-2 py-1 border border-gray-300 rounded text-sm" placeholder="備註" />
                        </td>
                        <td className="border border-gray-300 px-2 py-1">
                          {needInventory ? (
                            <select value={item.inventoryWarehouse || ''}
                              onChange={e => setExpTemplateForm(p => ({ ...p, purchaseItems: p.purchaseItems.map((it, i) => i === idx ? { ...it, inventoryWarehouse: e.target.value } : it) }))}
                              className="w-full px-2 py-1 border border-gray-300 rounded text-sm">
                              <option value="">選擇庫存地點</option>
                              {storageLocationsList.map(w => <option key={w} value={w}>{w}</option>)}
                            </select>
                          ) : (
                            <span className="text-gray-400 text-xs">不需入庫</span>
                          )}
                        </td>
                        <td className="border border-gray-300 px-2 py-1 text-center">
                          {expTemplateForm.purchaseItems.length > 1 && (
                            <button type="button" onClick={() => setExpTemplateForm(p => ({ ...p, purchaseItems: p.purchaseItems.filter((_, i) => i !== idx) }))}
                              className="text-red-500 hover:text-red-700 text-lg">✕</button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-gray-50">
                    <td colSpan={3} className="border border-gray-300 px-2 py-2 text-right font-semibold">合計</td>
                    <td className="border border-gray-300 px-2 py-2 text-right font-bold">
                      {expTemplateForm.purchaseItems.reduce((s, it) => s + (parseFloat(it.quantity) || 0) * (parseFloat(it.unitPrice) || 0), 0).toLocaleString()}
                    </td>
                    <td colSpan={3} className="border border-gray-300 px-2 py-2"></td>
                  </tr>
                </tfoot>
              </table>
              <button type="button"
                onClick={() => setExpTemplateForm(p => ({ ...p, purchaseItems: [...p.purchaseItems, { productId: '', quantity: 1, unitPrice: '', note: '', inventoryWarehouse: '' }] }))}
                className="text-sm text-orange-600 hover:underline mb-3">
                + 新增品項
              </button>
              <div className="flex gap-2 justify-end mt-2">
                <button type="button" onClick={resetExpTemplateForm}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-100">取消</button>
                <button type="button" onClick={handleSaveExpTemplate} disabled={templateSaving}
                  className="px-4 py-2 bg-orange-600 text-white rounded-lg text-sm hover:bg-orange-700 font-medium disabled:opacity-50">
                  {templateSaving ? '儲存中…' : (editingExpTemplate ? '更新範本' : '儲存範本')}
                </button>
              </div>
            </div>
          )}

          <table className="w-full border-collapse border border-gray-300 text-sm">
            <thead className="sticky top-0 z-10 bg-gray-100">
              <tr className="bg-gray-100">
                <th className="border border-gray-300 px-2 py-2 text-left">範本名稱</th>
                <th className="border border-gray-300 px-2 py-2 text-left">廠商</th>
                <th className="border border-gray-300 px-2 py-2 text-left">付款方式</th>
                <th className="border border-gray-300 px-2 py-2 text-left">館別</th>
                <th className="border border-gray-300 px-2 py-2 text-center">品項數</th>
                <th className="border border-gray-300 px-2 py-2 text-right">預估金額</th>
                <th className="border border-gray-300 px-2 py-2 text-center">狀態</th>
                <th className="border border-gray-300 px-2 py-2 text-center">操作</th>
              </tr>
            </thead>
            <tbody>
              {expenseTemplates.map(t => {
                const itemCount = Array.isArray(t.purchaseItems) ? t.purchaseItems.length : 0;
                const totalAmt = Array.isArray(t.purchaseItems) ? t.purchaseItems.reduce((s, i) => s + (i.quantity || 0) * (i.unitPrice || 0), 0) : 0;
                return (
                  <tr key={t.id} className={t.isActive === false ? 'opacity-50' : ''}>
                    <td className="border border-gray-300 px-2 py-2">
                      <div className="font-medium">{t.name}</div>
                      {t.description && <div className="text-xs text-gray-500">{t.description}</div>}
                    </td>
                    <td className="border border-gray-300 px-2 py-2">{suppliers.find(s => s.id === t.defaultSupplierId)?.name || '-'}</td>
                    <td className="border border-gray-300 px-2 py-2">{t.paymentMethod || '-'}</td>
                    <td className="border border-gray-300 px-2 py-2">{t.warehouse || '不限'}</td>
                    <td className="border border-gray-300 px-2 py-2 text-center">{itemCount}</td>
                    <td className="border border-gray-300 px-2 py-2 text-right">{totalAmt > 0 ? totalAmt.toLocaleString() : '-'}</td>
                    <td className="border border-gray-300 px-2 py-2 text-center">
                      <span className={`px-2 py-0.5 rounded text-xs ${t.isActive !== false ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                        {t.isActive !== false ? '啟用' : '停用'}
                      </span>
                    </td>
                    <td className="border border-gray-300 px-2 py-2 text-center">
                      <div className="flex gap-1 justify-center flex-wrap">
                        <button type="button" onClick={() => handleEditExpTemplate(t)}
                          className="px-2 py-1 text-xs border border-gray-300 rounded hover:bg-gray-100 text-blue-600">編輯</button>
                        <button type="button" onClick={() => handleToggleExpTemplateActive(t)}
                          className={`px-2 py-1 text-xs border border-gray-300 rounded hover:bg-gray-100 ${t.isActive !== false ? 'text-red-600' : 'text-green-600'}`}>
                          {t.isActive !== false ? '停用' : '啟用'}
                        </button>
                        <button type="button" onClick={() => handleDeleteExpTemplate(t.id)}
                          className="px-2 py-1 text-xs border border-gray-300 rounded hover:bg-gray-100 text-red-600">刪除</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {expenseTemplates.length === 0 && !showExpTemplateForm && (
            <p className="text-gray-500 mt-2">尚無進銷存每月費用範本，請點擊上方「+ 新增範本」建立。</p>
          )}
        </div>
      )}

      {/* ── 快速執行 ── */}
      {monthlyExpenseSubTab === 'execute' && (
        <div className="bg-white rounded-lg border p-6">
          <h3 className="text-lg font-semibold mb-4">快速執行</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div>
              <label htmlFor="ex-tmpl" className="block text-sm font-medium text-gray-700 mb-1">選擇範本 *</label>
              <select id="ex-tmpl" value={selectedExpenseTemplateId}
                onChange={e => handleSelectExpenseTemplate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg">
                <option value="">-- 選擇範本 --</option>
                {expenseTemplates.filter(t => t.isActive !== false).map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="ex-wh" className="block text-sm font-medium text-gray-700 mb-1">館別 *</label>
              <select id="ex-wh" value={executeExpenseForm.warehouse}
                onChange={e => setExecuteExpenseForm(prev => ({ ...prev, warehouse: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg">
                <option value="">選擇館別</option>
                {warehousesList.map(w => <option key={w} value={w}>{w}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="ex-month" className="block text-sm font-medium text-gray-700 mb-1">費用月份 *</label>
              <input id="ex-month" type="month" value={executeExpenseForm.expenseMonth}
                onChange={e => setExecuteExpenseForm(prev => ({ ...prev, expenseMonth: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
            </div>
          </div>

          {selectedExpenseTemplateId && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <div>
                <label htmlFor="ex-supplier" className="block text-sm font-medium text-gray-700 mb-1">廠商 *</label>
                <select id="ex-supplier" value={executeExpenseForm.supplierId}
                  onChange={e => {
                    const sid = e.target.value;
                    const s = suppliers.find(s => s.id === parseInt(sid));
                    setExecuteExpenseForm(prev => ({ ...prev, supplierId: sid, supplierName: s ? s.name : '', paymentTerms: s?.paymentTerms || '月結' }));
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                  <option value="">選擇廠商</option>
                  {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="ex-pt" className="block text-sm font-medium text-gray-700 mb-1">付款方式</label>
                <select id="ex-pt" value={executeExpenseForm.paymentTerms}
                  onChange={e => setExecuteExpenseForm(prev => ({ ...prev, paymentTerms: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                  <option value="">請選擇付款方式</option>
                  {(paymentMethodOptions.length > 0 ? paymentMethodOptions : ['月結', '現金', '支票', '轉帳', '信用卡', '員工代付']).map(m => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>
              {executeExpenseForm.taxType && (
                <div>
                  <label htmlFor="ex-taxtype" className="block text-sm font-medium text-gray-700 mb-1">稅別</label>
                  <input id="ex-taxtype" value={executeExpenseForm.taxType} readOnly
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-gray-50" />
                </div>
              )}
            </div>
          )}

          {selectedExpenseTemplateId && (
            <>
              <div className="mb-4">
                <h4 className="text-sm font-semibold mb-2">進貨品項（需入庫品項將連動至 <Link href="/inventory" className="text-orange-600 hover:underline">庫存</Link>）</h4>
                <table className="w-full border-collapse border border-gray-300 text-sm">
                  <thead className="sticky top-0 z-10 bg-gray-100">
                    <tr className="bg-gray-100">
                      <th className="border border-gray-300 px-2 py-2 text-left">商品</th>
                      <th className="border border-gray-300 px-2 py-2 w-20">數量</th>
                      <th className="border border-gray-300 px-2 py-2 w-28">單價</th>
                      <th className="border border-gray-300 px-2 py-2 w-28 text-right">小計</th>
                      <th className="border border-gray-300 px-2 py-2 text-left">備註</th>
                      <th className="border border-gray-300 px-2 py-2 text-center w-24">是否入庫</th>
                      <th className="border border-gray-300 px-2 py-2 text-left w-36">庫存地點</th>
                      <th className="border border-gray-300 px-2 py-2 w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {executeExpenseForm.items.map((item, idx) => {
                      const product = products.find(p => p.id === parseInt(item.productId, 10));
                      const isInStock = !!product?.isInStock;
                      return (
                        <tr key={idx}>
                          <td className="border border-gray-300 px-2 py-1">
                            <select value={item.productId}
                              onChange={e => {
                                const pid = e.target.value;
                                const p = products.find(x => x.id === parseInt(pid, 10));
                                updateExecuteExpenseItem(idx, 'productId', pid);
                                if (p?.isInStock) {
                                  setExecuteExpenseForm(prev => ({
                                    ...prev,
                                    items: prev.items.map((it, i) => i === idx ? { ...it, putInInventory: true, inventoryWarehouse: '' } : it),
                                  }));
                                }
                              }}
                              className="w-full px-2 py-1 border border-gray-300 rounded text-sm">
                              <option value="">選擇商品</option>
                              {products.map(p => <option key={p.id} value={p.id}>{p.code || ''} - {p.name}</option>)}
                            </select>
                          </td>
                          <td className="border border-gray-300 px-2 py-1">
                            <input type="number" min={1} value={item.quantity}
                              onChange={e => updateExecuteExpenseItem(idx, 'quantity', e.target.value)}
                              className="w-full px-2 py-1 border border-gray-300 rounded text-sm" />
                          </td>
                          <td className="border border-gray-300 px-2 py-1">
                            <input type="number" step="0.01" value={item.unitPrice}
                              onChange={e => updateExecuteExpenseItem(idx, 'unitPrice', e.target.value)}
                              className="w-full px-2 py-1 border border-gray-300 rounded text-sm" />
                          </td>
                          <td className="border border-gray-300 px-2 py-1 text-right font-medium">
                            {((parseFloat(item.quantity) || 0) * (parseFloat(item.unitPrice) || 0)).toLocaleString()}
                          </td>
                          <td className="border border-gray-300 px-2 py-1">
                            <input value={item.note}
                              onChange={e => updateExecuteExpenseItem(idx, 'note', e.target.value)}
                              className="w-full px-2 py-1 border border-gray-300 rounded text-sm" placeholder="備註" />
                          </td>
                          <td className="border border-gray-300 px-2 py-1 text-center">
                            {isInStock ? (
                              <label className="inline-flex items-center gap-1">
                                <input type="checkbox" checked={!!item.putInInventory}
                                  onChange={e => updateExecuteExpenseItem(idx, 'putInInventory', e.target.checked)}
                                  className="rounded border-gray-300 text-orange-600 focus:ring-orange-500" />
                                <span className="text-xs">入庫</span>
                              </label>
                            ) : (
                              <span className="text-gray-400 text-xs">不需入庫</span>
                            )}
                          </td>
                          <td className="border border-gray-300 px-2 py-1">
                            {isInStock && item.putInInventory ? (
                              <select value={item.inventoryWarehouse || ''}
                                onChange={e => updateExecuteExpenseItem(idx, 'inventoryWarehouse', e.target.value)}
                                className="w-full px-2 py-1 border border-gray-300 rounded text-sm">
                                <option value="">選擇庫存地點</option>
                                {storageLocationsList.map(w => <option key={w} value={w}>{w}</option>)}
                              </select>
                            ) : isInStock ? (
                              <span className="text-gray-400 text-xs">勾選入庫後選擇</span>
                            ) : (
                              <span className="text-gray-400 text-xs">-</span>
                            )}
                          </td>
                          <td className="border border-gray-300 px-2 py-1 text-center">
                            {executeExpenseForm.items.length > 1 && (
                              <button type="button"
                                onClick={() => setExecuteExpenseForm(prev => ({ ...prev, items: prev.items.filter((_, i) => i !== idx) }))}
                                className="text-red-500 hover:text-red-700 text-lg">✕</button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-gray-50">
                      <td colSpan={3} className="border border-gray-300 px-2 py-2 text-right font-semibold">進貨金額合計</td>
                      <td className="border border-gray-300 px-2 py-2 text-right font-bold text-lg">
                        {getExecPurchaseTotal().toLocaleString()}
                      </td>
                      <td colSpan={2} className="border border-gray-300 px-2 py-2"></td>
                    </tr>
                  </tfoot>
                </table>
                <button type="button"
                  onClick={() => setExecuteExpenseForm(prev => ({ ...prev, items: [...prev.items, { productId: '', quantity: 1, unitPrice: '', note: '', putInInventory: true, inventoryWarehouse: '' }] }))}
                  className="mt-2 text-sm text-orange-600 hover:underline">
                  + 新增品項
                </button>
              </div>

              <div className="border-2 border-blue-200 rounded-lg p-4 mb-4 bg-blue-50">
                <h4 className="text-md font-semibold mb-3 text-blue-800">發票資訊（填寫後會同時建立發票記錄）</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
                  <div>
                    <label htmlFor="ex-inv-no" className="block text-sm font-medium text-gray-700 mb-1">發票號碼</label>
                    <input id="ex-inv-no" value={executeExpenseForm.invoiceNo}
                      onChange={e => setExecuteExpenseForm(prev => ({ ...prev, invoiceNo: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" placeholder="例: AB-12345678" />
                  </div>
                  <div>
                    <label htmlFor="ex-inv-date" className="block text-sm font-medium text-gray-700 mb-1">發票日期</label>
                    <input id="ex-inv-date" type="date" value={executeExpenseForm.invoiceDate}
                      onChange={e => setExecuteExpenseForm(prev => ({ ...prev, invoiceDate: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                  </div>
                  <div>
                    <label htmlFor="ex-inv-title" className="block text-sm font-medium text-gray-700 mb-1">
                      發票抬頭
                      {invoiceTitles.length === 0 && (
                        <Link href="/settings" className="text-xs text-blue-600 hover:underline ml-1">（請先至設定新增）</Link>
                      )}
                    </label>
                    <select id="ex-inv-title"
                      value={invoiceTitles.some(t => t.title === executeExpenseForm.invoiceTitle) ? executeExpenseForm.invoiceTitle : (executeExpenseForm.invoiceTitle ? '__other__' : '')}
                      onChange={e => {
                        const v = e.target.value;
                        setExecuteExpenseForm(prev => ({ ...prev, invoiceTitle: v === '__other__' ? '' : v }));
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                      <option value="">請選擇</option>
                      {invoiceTitles.map(t => (
                        <option key={t.id} value={t.title}>{t.title}{t.taxId ? ` (${t.taxId})` : ''}</option>
                      ))}
                      <option value="__other__">其他（手動輸入）</option>
                    </select>
                    {(executeExpenseForm.invoiceTitle && !invoiceTitles.some(t => t.title === executeExpenseForm.invoiceTitle)) && (
                      <input value={executeExpenseForm.invoiceTitle}
                        onChange={e => setExecuteExpenseForm(prev => ({ ...prev, invoiceTitle: e.target.value }))}
                        className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                        placeholder="輸入發票抬頭" />
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-3">
                  <div>
                    <label htmlFor="ex-taxtype2" className="block text-sm font-medium text-gray-700 mb-1">營業稅類型</label>
                    <select id="ex-taxtype2" value={executeExpenseForm.taxType}
                      onChange={e => {
                        const newTaxType = e.target.value;
                        const purchaseAmt = getExecPurchaseTotal();
                        const autoTax = calcTaxAmount(purchaseAmt, newTaxType);
                        const discount = parseFloat(executeExpenseForm.supplierDiscount) || 0;
                        setExecuteExpenseForm(prev => ({ ...prev, taxType: newTaxType, taxAmount: String(autoTax), invoiceAmount: String(purchaseAmt + autoTax - discount) }));
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                      <option value="">不指定</option>
                      <option value="應稅">應稅 (5%)</option>
                      <option value="免稅">免稅</option>
                      <option value="零稅率">零稅率</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor="ex-tax-amt" className="block text-sm font-medium text-gray-700 mb-1">營業稅金額</label>
                    <input id="ex-tax-amt" type="number" step="1" value={executeExpenseForm.taxAmount}
                      onChange={e => {
                        const taxAmt = parseFloat(e.target.value) || 0;
                        const purchaseAmt = getExecPurchaseTotal();
                        const discount = parseFloat(executeExpenseForm.supplierDiscount) || 0;
                        setExecuteExpenseForm(prev => ({ ...prev, taxAmount: e.target.value, invoiceAmount: String(purchaseAmt + taxAmt - discount) }));
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" placeholder="0" />
                  </div>
                  <div>
                    <label htmlFor="ex-discount" className="block text-sm font-medium text-gray-700 mb-1">廠商折讓金額</label>
                    <input id="ex-discount" type="number" step="1" value={executeExpenseForm.supplierDiscount}
                      onChange={e => {
                        const discount = parseFloat(e.target.value) || 0;
                        const purchaseAmt = getExecPurchaseTotal();
                        const taxAmt = parseFloat(executeExpenseForm.taxAmount) || 0;
                        setExecuteExpenseForm(prev => ({ ...prev, supplierDiscount: e.target.value, invoiceAmount: String(purchaseAmt + taxAmt - discount) }));
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" placeholder="0" />
                  </div>
                  <div>
                    <label htmlFor="ex-inv-amt" className="block text-sm font-medium text-gray-700 mb-1">發票金額</label>
                    <input id="ex-inv-amt" type="number" step="1" value={executeExpenseForm.invoiceAmount}
                      onChange={e => setExecuteExpenseForm(prev => ({ ...prev, invoiceAmount: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-bold" placeholder="0" />
                  </div>
                </div>
                {executeExpenseForm.invoiceNo?.trim() && (() => {
                  const purchaseAmt = getExecPurchaseTotal();
                  const taxAmt = parseFloat(executeExpenseForm.taxAmount) || 0;
                  const discount = parseFloat(executeExpenseForm.supplierDiscount) || 0;
                  const invAmt = parseFloat(executeExpenseForm.invoiceAmount) || 0;
                  const expected = purchaseAmt + taxAmt - discount;
                  const isValid = Math.abs(invAmt - expected) < 0.01;
                  return (
                    <div className={`text-sm p-2 rounded ${isValid ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                      驗證：進貨金額 {purchaseAmt.toLocaleString()} + 營業稅 {taxAmt.toLocaleString()} - 廠商折讓 {discount.toLocaleString()} = {expected.toLocaleString()}
                      {isValid ? ' ✓ 與發票金額一致' : ` ✗ 發票金額 ${invAmt.toLocaleString()} 不符`}
                    </div>
                  );
                })()}
              </div>

              <div className="mb-4">
                <label htmlFor="ex-note" className="block text-sm font-medium text-gray-700 mb-1">備註</label>
                <input id="ex-note" value={executeExpenseForm.note}
                  onChange={e => setExecuteExpenseForm(prev => ({ ...prev, note: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" placeholder="選填" />
              </div>

              <div className="bg-gray-50 rounded-lg p-3 mb-4 text-sm text-gray-600">
                <strong>執行後資料流向：</strong>
                <br />→ 進貨管理：自動建立進貨單 (PUR-XXXXXX)
                {executeExpenseForm.invoiceNo?.trim() && <><br />→ 發票管理：自動建立發票記錄 (INV-XXXXXX)</>}
                <br />→ 費用記錄：建立本筆費用執行記錄 (EXP-XXXXXX)
              </div>

              <button type="button" onClick={handleExecutePurchaseExpense} disabled={submittingExpense}
                className="bg-orange-600 text-white px-6 py-2 rounded-lg hover:bg-orange-700 disabled:opacity-50 font-medium">
                {submittingExpense ? '執行中...' : '執行並建立記錄'}
              </button>
            </>
          )}
        </div>
      )}

      {/* ── 執行記錄 ── */}
      {monthlyExpenseSubTab === 'records' && (
        <div className="bg-white rounded-lg border p-4">
          <div className="flex flex-wrap gap-4 mb-4">
            <div>
              <label htmlFor="rec-month" className="block text-xs text-gray-600 mb-1">月份</label>
              <input id="rec-month" type="month" value={expenseRecordFilter.month}
                onChange={e => setExpenseRecordFilter(prev => ({ ...prev, month: e.target.value }))}
                className="px-2 py-1 border border-gray-300 rounded text-sm" />
            </div>
            <div>
              <label htmlFor="rec-wh" className="block text-xs text-gray-600 mb-1">館別</label>
              <select id="rec-wh" value={expenseRecordFilter.warehouse}
                onChange={e => setExpenseRecordFilter(prev => ({ ...prev, warehouse: e.target.value }))}
                className="px-2 py-1 border border-gray-300 rounded text-sm">
                <option value="">全部</option>
                {warehousesList.map(w => <option key={w} value={w}>{w}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="rec-status" className="block text-xs text-gray-600 mb-1">狀態</label>
              <select id="rec-status" value={expenseRecordFilter.status}
                onChange={e => setExpenseRecordFilter(prev => ({ ...prev, status: e.target.value }))}
                className="px-2 py-1 border border-gray-300 rounded text-sm">
                <option value="">全部</option>
                <option value="待確認">待確認</option>
                <option value="已確認">已確認</option>
                <option value="已作廢">已作廢</option>
              </select>
            </div>
          </div>
          {expenseRecordsLoading ? (
            <p className="text-gray-500">載入中...</p>
          ) : expenseRecords.length === 0 ? (
            <p className="text-gray-500">尚無進銷存每月費用記錄</p>
          ) : (
            <table className="w-full border-collapse border border-gray-300 text-sm">
              <thead className="sticky top-0 z-10 bg-gray-100">
                <tr className="bg-gray-100">
                  <th className="border border-gray-300 px-2 py-2 text-left">記錄單號</th>
                  <th className="border border-gray-300 px-2 py-2 text-left">範本</th>
                  <th className="border border-gray-300 px-2 py-2 text-left">月份</th>
                  <th className="border border-gray-300 px-2 py-2 text-left">館別</th>
                  <th className="border border-gray-300 px-2 py-2 text-right">金額</th>
                  <th className="border border-gray-300 px-2 py-2 text-left">關聯單號</th>
                  <th className="border border-gray-300 px-2 py-2 text-left">狀態</th>
                </tr>
              </thead>
              <tbody>
                {expenseRecords.map(r => (
                  <tr key={r.id}>
                    <td className="border border-gray-300 px-2 py-2 font-mono text-xs">{r.recordNo}</td>
                    <td className="border border-gray-300 px-2 py-2">{r.template?.name || '-'}</td>
                    <td className="border border-gray-300 px-2 py-2">{r.expenseMonth}</td>
                    <td className="border border-gray-300 px-2 py-2">{r.warehouse}</td>
                    <td className="border border-gray-300 px-2 py-2 text-right">{Number(r.totalDebit).toLocaleString()}</td>
                    <td className="border border-gray-300 px-2 py-2">
                      {r.purchaseNo && <span className="text-blue-600">{r.purchaseNo}</span>}
                      {r.paymentOrderNo && <span className="text-blue-600 ml-1">{r.paymentOrderNo}</span>}
                      {!r.purchaseNo && !r.paymentOrderNo && '-'}
                    </td>
                    <td className="border border-gray-300 px-2 py-2">
                      <span className={`px-2 py-0.5 rounded text-xs ${r.status === '已確認' ? 'bg-green-100 text-green-800' : r.status === '已作廢' ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'}`}>
                        {r.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
