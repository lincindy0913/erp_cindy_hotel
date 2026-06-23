'use client';

import Link from 'next/link';
import { SortableTh } from '@/components/SortableTh';
import ExportButtons from '@/components/ExportButtons';
import HelpButton from '@/components/HelpButton';
import ExcelBatchImport from '@/components/ExcelBatchImport';
import ReorderSuggestionsPanel from '@/components/purchasing/ReorderSuggestionsPanel';
import { EXPORT_CONFIGS } from '@/lib/export-columns';
import { todayStr } from '@/lib/localDate';
import { ALLOWANCE_STATUS } from '@/lib/allowance-statuses';

export default function OrdersTab({
  isLoggedIn,
  fetchPurchases,
  // purchase list state
  purchases,
  loading,
  totalCount,
  currentPage,
  itemsPerPage,
  setItemsPerPage,
  filterData,
  setFilterData,
  sortedPurchases,
  purSortKey,
  purSortDir,
  togglePurSort,
  expandedPurchaseId,
  // form state
  showAddForm,
  setShowAddForm,
  editingPurchase,
  setEditingPurchase,
  formData,
  setFormData,
  items,
  setItems,
  newItem,
  setNewItem,
  productSearch,
  setProductSearch,
  showProductDropdown,
  setShowProductDropdown,
  recentPurchases,
  setRecentPurchases,
  allProductPurchases, setAllProductPurchases,
  loadingHistory,
  priceCache,
  supplierSearch,
  setSupplierSearch,
  showSupplierDropdown,
  setShowSupplierDropdown,
  editingItemIndex,
  setEditingItemIndex,
  purchaseSaving,
  // handlers
  handleFilterChange,
  handleResetFilter,
  handleViewDetails,
  handleEdit,
  handleWarehouseChange,
  handleDelete,
  fetchRecentPurchases,
  addItem,
  removeItem,
  handleSubmit,
  handleCancelForm,
  isItemInvoiced,
  getPurchaseReturnInvoiceTag,
  // derived
  deliveredPendingItems,
  filteredProducts,
  filteredSuppliers,
  // warehouse/dept
  warehouseDepts,
  // reorder
  reorderHook,
  // shared data
  suppliers,
  products,
  warehousesList,
  storageLocationsList,
  confirm,
}) {
  const {
    warehouseDepartments,
  } = warehouseDepts;

  const {
    reorderSuggestions,
    reorderMeta,
    showReorderPanel,
    setShowReorderPanel,
    recalculateLowStock,
    recalculating,
    handleReorderItem,
  } = reorderHook;

  const totals = items.length > 0
    ? (() => { const s = items.reduce((sum, item) => sum + (item.subtotal || 0), 0); return { subtotal: s.toFixed(2), total: s.toFixed(2) }; })()
    : { subtotal: '0', total: '0' };

  return (
    <>
      {/* 標題與操作 */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold">進貨單管理</h2>
        </div>
        <div className="flex items-center gap-3">
          <HelpButton anchor="四採購與庫存" />
          <ExportButtons
            data={purchases.map(p => ({
              ...p,
              supplierName: p.supplierName || '',
              itemCount: p.items?.length || 0,
            }))}
            columns={EXPORT_CONFIGS.purchasing.columns}
            exportName={EXPORT_CONFIGS.purchasing.filename}
            title="進貨單管理"
            sheetName="進貨單"
          />
          {reorderSuggestions.length > 0 && (
            <button
              onClick={() => setShowReorderPanel(s => !s)}
              className="relative bg-amber-500 text-white px-4 py-2 rounded-lg hover:bg-amber-600 flex items-center gap-2"
            >
              📦 補貨建議
              <span className="bg-white text-amber-600 text-xs font-bold px-1.5 py-0.5 rounded-full">{reorderSuggestions.length}</span>
            </button>
          )}
          {isLoggedIn && (
            <>
              <ExcelBatchImport
                title="進貨單批次匯入"
                hint="相同日期+廠商的多列會合併為一張進貨單。廠商必須先存在於廠商管理中。"
                columns={[
                  { key: 'date',         header: '採購日期',  example: todayStr(),   required: true,  width: 14, note: 'YYYY-MM-DD' },
                  { key: 'supplierName', header: '廠商名稱',  example: '統一超商',   required: true,  width: 18 },
                  { key: 'productCode',  header: '商品代碼',  example: 'PROD-001',   required: true,  width: 14 },
                  { key: 'productName',  header: '商品名稱',  example: '礦泉水',     required: false, width: 16, note: '新商品必填' },
                  { key: 'qty',          header: '數量',      example: '10',         required: true,  width: 8 },
                  { key: 'unitPrice',    header: '單價',      example: '25',         required: true,  width: 10 },
                  { key: 'taxed',        header: '含稅',      example: '否',         required: false, width: 8,  note: '是/否' },
                  { key: 'warehouse',    header: '倉庫',      example: '館別A',      required: false, width: 12 },
                ]}
                onImport={async rows => {
                  const res = await fetch('/api/purchasing/import-excel', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ rows }),
                  });
                  const json = await res.json();
                  if (res.ok) { fetchPurchases(); return json; }
                  throw new Error(json.error || '匯入失敗');
                }}
              />
              <button
                onClick={() => {
                  setShowAddForm(s => !s);
                  setEditingPurchase(null);
                  setItems([]);
                  setSupplierSearch('');
                  setFormData({ warehouse: '', department: '', supplierId: '', purchaseDate: todayStr(), paymentTerms: '月結' });
                }}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
              >
                ➕ 新增進貨單
              </button>
            </>
          )}
        </div>
      </div>

      {/* 補貨建議快取過期提示 */}
      {reorderMeta?.isStale && (
        <div className="flex items-center gap-3 bg-yellow-50 border border-yellow-300 rounded-lg px-4 py-2.5 mb-4 text-sm text-yellow-800">
          <svg className="w-4 h-4 shrink-0 text-yellow-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
          </svg>
          <span className="flex-1">
            補貨建議資料已超過 26 小時未更新
            {reorderMeta.lastCalculated && (
              <span className="text-yellow-600 ml-1">
                （上次：{new Date(reorderMeta.lastCalculated).toLocaleString('zh-TW')}）
              </span>
            )}
            ，建議重新計算後再下單。
          </span>
          <button
            type="button"
            onClick={recalculateLowStock}
            disabled={recalculating}
            className="shrink-0 px-3 py-1 bg-yellow-600 text-white rounded text-xs hover:bg-yellow-700 disabled:opacity-50"
          >
            {recalculating ? '計算中…' : '重新計算'}
          </button>
        </div>
      )}

      {/* 補貨建議 Panel */}
      {showReorderPanel && (
        <ReorderSuggestionsPanel
          suggestions={reorderSuggestions}
          onClose={() => setShowReorderPanel(false)}
          onReorder={handleReorderItem}
          isLoggedIn={isLoggedIn}
        />
      )}

      {/* 待辦條：已入庫但未建發票 / 未建付款單 */}
      {!loading && (deliveredPendingItems.uninvoiced.length > 0 || deliveredPendingItems.unpaid.length > 0) && (
        <div className="mb-4 space-y-2">
          {deliveredPendingItems.uninvoiced.length > 0 && (
            <div className="flex items-center gap-3 bg-orange-50 border border-orange-300 rounded-xl px-4 py-3 text-sm text-orange-800">
              <span className="text-orange-500 text-base shrink-0">🧾</span>
              <span className="flex-1">
                <strong>{deliveredPendingItems.uninvoiced.length} 筆</strong>已入庫進貨單尚未完整建立進項發票
              </span>
              <Link
                href={deliveredPendingItems.uninvoiced[0]?.supplierId ? `/sales?supplierId=${deliveredPendingItems.uninvoiced[0].supplierId}` : '/sales'}
                className="shrink-0 px-3 py-1.5 bg-orange-500 text-white text-xs rounded-lg hover:bg-orange-600 font-medium whitespace-nowrap"
              >
                前往開立發票 →
              </Link>
            </div>
          )}
          {deliveredPendingItems.unpaid.length > 0 && (
            <div className="flex items-center gap-3 bg-blue-50 border border-blue-300 rounded-xl px-4 py-3 text-sm text-blue-800">
              <span className="text-blue-500 text-base shrink-0">💳</span>
              <span className="flex-1">
                <strong>{deliveredPendingItems.unpaid.length} 筆</strong>已入庫進貨單尚未建立付款單
              </span>
              <Link
                href="/finance"
                className="shrink-0 px-3 py-1.5 bg-blue-500 text-white text-xs rounded-lg hover:bg-blue-600 font-medium whitespace-nowrap"
              >
                前往建立付款單 →
              </Link>
            </div>
          )}
        </div>
      )}

      {/* 新增/編輯進貨單表單 */}
      {showAddForm && (
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6 border-2 border-blue-200">
          <h3 className="text-lg font-semibold mb-4">{editingPurchase ? '編輯進貨單' : '新增進貨單'}</h3>
          <form onSubmit={handleSubmit}>
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div>
                <label htmlFor="link-href-settings-wareho" className="block text-sm font-medium text-gray-700 mb-1">
                  館別 *（<Link href="/settings#warehouses" className="text-xs text-blue-600 hover:underline">設定</Link>）
                </label>
                <select id="link-href-settings-wareho"
                  required
                  value={formData.warehouse}
                  onChange={(e) => handleWarehouseChange(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">請先選擇館別...</option>
                  {warehousesList.map(w => (
                    <option key={w} value={w}>{w}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="f-26" className="block text-sm font-medium text-gray-700 mb-1">部門 *</label>
                <select id="f-26"
                  required
                  value={formData.department}
                  onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                  disabled={!formData.warehouse}
                  className={`w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${!formData.warehouse ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                >
                  <option value="">{formData.warehouse ? '選擇部門...' : '請先選擇館別'}</option>
                  {formData.warehouse && warehouseDepartments[formData.warehouse]?.map(dept => (
                    <option key={dept} value={dept}>{dept}</option>
                  ))}
                </select>
              </div>

              <div className="relative supplier-search-container">
                <label htmlFor="f-22" className="block text-sm font-medium text-gray-700 mb-1">廠商 *</label>
                <input id="f-22"
                  type="text"
                  placeholder="輸入關鍵字搜尋廠商..."
                  value={supplierSearch}
                  onChange={(e) => {
                    setSupplierSearch(e.target.value);
                    setShowSupplierDropdown(true);
                    if (!e.target.value.trim()) {
                      setFormData(prev => ({ ...prev, supplierId: '', paymentTerms: '月結' }));
                    }
                  }}
                  onFocus={() => setShowSupplierDropdown(true)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {showSupplierDropdown && (
                  <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                    {filteredSuppliers.length > 0 ? (
                      filteredSuppliers.map(s => (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => {
                            setFormData(prev => ({ ...prev, supplierId: s.id.toString(), paymentTerms: s.paymentTerms || '月結' }));
                            setSupplierSearch(s.name);
                            setShowSupplierDropdown(false);
                          }}
                          className={`w-full text-left px-3 py-2 text-sm hover:bg-blue-50 border-b border-gray-100 last:border-b-0 ${formData.supplierId === s.id.toString() ? 'bg-blue-50 text-blue-700' : ''}`}
                        >
                          <span className="font-medium">{s.name}</span>
                          {s.isBlacklisted && <span className="ml-1 px-1 py-0.5 bg-red-100 text-red-700 rounded text-xs font-bold" title={s.blacklistReason || '黑名單廠商'}>🚫黑名單</span>}
                          {s.taxId && <span className="text-gray-400 ml-2 text-xs">{s.taxId}</span>}
                          {s.contact && <span className="text-gray-400 ml-2 text-xs">({s.contact})</span>}
                        </button>
                      ))
                    ) : (
                      <div className="px-3 py-2 text-sm text-gray-500">找不到符合的廠商</div>
                    )}
                  </div>
                )}
              </div>
              {/* 黑名單廠商警告 */}
              {(() => {
                const sel = suppliers.find(s => s.id.toString() === formData.supplierId);
                return sel?.isBlacklisted ? (
                  <div className="col-span-2 flex items-start gap-2 px-3 py-2 bg-red-50 border border-red-300 rounded-lg text-sm text-red-700">
                    <span className="text-base shrink-0">🚫</span>
                    <div>
                      <span className="font-semibold">此廠商已列入黑名單</span>
                      {sel.blacklistReason && <span className="ml-1">— {sel.blacklistReason}</span>}
                    </div>
                  </div>
                ) : null;
              })()}
              <div>
                <label htmlFor="f-23" className="block text-sm font-medium text-gray-700 mb-1">進貨日期 *</label>
                <input id="f-23"
                  type="date"
                  required
                  value={formData.purchaseDate}
                  onChange={(e) => setFormData({ ...formData, purchaseDate: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label htmlFor="f-24" className="block text-sm font-medium text-gray-700 mb-1">付款條件</label>
                <select id="f-24"
                  value={formData.paymentTerms}
                  onChange={(e) => setFormData({ ...formData, paymentTerms: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {['月結', '現金', '支票', '轉帳', '信用卡', '員工代付'].map(term => (
                    <option key={term} value={term}>{term}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* 進貨明細 */}
            <div className="mb-6">
              <h4 className="text-md font-semibold mb-3">進貨明細</h4>
              <div className="border rounded-lg p-4 mb-4">
                {items.length > 0 ? (
                  <table className="w-full">
                    <thead className="bg-gray-50 sticky top-0 z-10">
                      <tr>
                        <th className="px-3 py-2 text-left text-sm font-medium text-gray-700">產品</th>
                        <th className="px-3 py-2 text-left text-sm font-medium text-gray-700">數量</th>
                        <th className="px-3 py-2 text-left text-sm font-medium text-gray-700">單價</th>
                        <th className="px-3 py-2 text-left text-sm font-medium text-gray-700">小計</th>
                        <th className="px-3 py-2 text-left text-sm font-medium text-gray-700">備註</th>
                        <th className="px-3 py-2 text-left text-sm font-medium text-gray-700">入庫狀態</th>
                        <th className="px-3 py-2 text-left text-sm font-medium text-gray-700">入庫倉庫</th>
                        <th className="px-3 py-2 text-left text-sm font-medium text-gray-700">發票狀態</th>
                        <th className="px-3 py-2 text-left text-sm font-medium text-gray-700">操作</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {items.map((item, index) => (
                        <tr key={index}>
                          <td className="px-3 py-2 text-sm">{item.productName}</td>
                          <td className="px-3 py-2 text-sm">
                            {editingItemIndex === index ? (
                              <input type="number" step="0.01" value={item.quantity}
                                onChange={(e) => {
                                  const newItems = [...items];
                                  const qty = e.target.value;
                                  newItems[index] = { ...newItems[index], quantity: qty, subtotal: parseFloat(qty || 0) * parseFloat(item.unitPrice || 0) };
                                  setItems(newItems);
                                }}
                                className="w-20 px-2 py-1 border border-blue-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                              />
                            ) : item.quantity}
                          </td>
                          <td className="px-3 py-2 text-sm">
                            {editingItemIndex === index ? (
                              <input type="number" step="0.01" value={item.unitPrice}
                                onChange={(e) => {
                                  const newItems = [...items];
                                  const price = e.target.value;
                                  newItems[index] = { ...newItems[index], unitPrice: price, subtotal: parseFloat(item.quantity || 0) * parseFloat(price || 0) };
                                  setItems(newItems);
                                }}
                                className="w-24 px-2 py-1 border border-blue-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                              />
                            ) : <>NT$ {item.unitPrice}</>}
                          </td>
                          <td className="px-3 py-2 text-sm">NT$ {item.subtotal.toFixed(2)}</td>
                          <td className="px-3 py-2 text-sm text-gray-600">{item.note || '-'}</td>
                          <td className="px-3 py-2">
                            {(() => {
                              const product = products.find(p => p.id === parseInt(item.productId));
                              if (!product?.isInStock) {
                                return <span className="px-2 py-1 rounded text-xs bg-gray-100 text-gray-500 border border-gray-200">不需入庫</span>;
                              }
                              const s = item.status || '待入庫';
                              return (
                                <span className={`px-2 py-1 rounded text-xs border ${s === '已入庫' ? 'bg-green-100 text-green-800 border-green-300' : 'bg-yellow-100 text-yellow-800 border-yellow-300'}`}>
                                  {s}<span className="ml-1 text-gray-400 text-xs">(庫存管理)</span>
                                </span>
                              );
                            })()}
                          </td>
                          <td className="px-3 py-2">
                            {(() => {
                              const product = products.find(p => p.id === parseInt(item.productId));
                              if (!product?.isInStock) return <span className="text-xs text-gray-400">-</span>;
                              return <span className="text-xs text-gray-600">{item.inventoryWarehouse || '-'}</span>;
                            })()}
                          </td>
                          <td className="px-3 py-2">
                            {(() => {
                              const invoiced = editingPurchase && item.originalIndex !== undefined
                                ? isItemInvoiced(editingPurchase.id, item.originalIndex)
                                : false;
                              const retTag = editingPurchase ? getPurchaseReturnInvoiceTag(editingPurchase) : null;
                              return (
                                <div className="flex flex-wrap gap-1">
                                  <span className={`px-2 py-1 rounded text-xs ${invoiced ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                                    {invoiced ? '已核銷' : '未核銷'}
                                  </span>
                                  {retTag && <span className={`px-2 py-0.5 rounded text-xs font-semibold ${retTag.className}`}>{retTag.label}</span>}
                                </div>
                              );
                            })()}
                          </td>
                          <td className="px-3 py-2">
                            {(() => {
                              const itemInvoiced = editingPurchase && item.originalIndex !== undefined
                                ? isItemInvoiced(editingPurchase.id, item.originalIndex)
                                : false;
                              return (
                                <div className="flex gap-2">
                                  {editingItemIndex === index ? (
                                    <button type="button" onClick={() => setEditingItemIndex(null)} className="text-blue-600 hover:underline text-sm">完成</button>
                                  ) : (
                                    <button type="button"
                                      onClick={() => !itemInvoiced && setEditingItemIndex(index)}
                                      className={`text-sm ${itemInvoiced ? 'text-gray-400 cursor-not-allowed' : 'text-green-600 hover:underline cursor-pointer'}`}
                                      disabled={itemInvoiced}
                                      title={itemInvoiced ? '已核銷品項無法編輯' : ''}
                                    >編輯</button>
                                  )}
                                  <button type="button"
                                    onClick={() => {
                                      if (itemInvoiced) return;
                                      removeItem(index);
                                      if (editingItemIndex === index) setEditingItemIndex(null);
                                    }}
                                    className={`text-sm ${itemInvoiced ? 'text-gray-400 cursor-not-allowed' : 'text-red-600 hover:underline cursor-pointer'}`}
                                    disabled={itemInvoiced}
                                    title={itemInvoiced ? '已核銷品項無法刪除' : ''}
                                  >刪除</button>
                                </div>
                              );
                            })()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="text-gray-500 text-center py-4">尚未新增商品</p>
                )}
              </div>

              {/* 新增商品 */}
              <div className="border rounded-lg p-4 bg-gray-50">
                <div className="grid grid-cols-6 gap-3 mb-3">
                  <div className="relative product-search-container">
                    <input
                      type="text"
                      placeholder="輸入關鍵字搜尋產品..."
                      value={productSearch}
                      onChange={(e) => {
                        setProductSearch(e.target.value);
                        setShowProductDropdown(true);
                        if (!e.target.value.trim()) {
                          setNewItem({ ...newItem, productId: '' });
                          setRecentPurchases([]);
                          setAllProductPurchases([]);
                        }
                      }}
                      onFocus={() => setShowProductDropdown(true)}
                      className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    {showProductDropdown && (
                      <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                        {filteredProducts.length > 0 ? (
                          filteredProducts.map(p => (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() => {
                                setNewItem({ ...newItem, productId: p.id.toString() });
                                setProductSearch(p.name);
                                setShowProductDropdown(false);
                                fetchRecentPurchases(p.id);
                              }}
                              className={`w-full text-left px-3 py-2 text-sm hover:bg-blue-50 border-b border-gray-100 last:border-b-0 ${newItem.productId === p.id.toString() ? 'bg-blue-50 text-blue-700' : ''}`}
                            >
                              <span className="font-medium">{p.name}</span>
                              <span className="text-gray-400 ml-2 text-xs">{p.code}</span>
                              {p.category && <span className="text-gray-400 ml-2 text-xs">({p.category})</span>}
                            </button>
                          ))
                        ) : (
                          <div className="px-3 py-2 text-sm text-gray-500">找不到符合的產品</div>
                        )}
                      </div>
                    )}
                  </div>
                  <div>
                    <input type="number" step="0.01" placeholder="數量" value={newItem.quantity}
                      onChange={(e) => setNewItem({ ...newItem, quantity: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    {(() => {
                      const sid = formData.supplierId ? parseInt(formData.supplierId) : null;
                      const last = sid ? allProductPurchases.find(r => r.supplierId === sid) : null;
                      return last ? (
                        <div className="flex items-center gap-1 mb-1">
                          <span className="text-xs text-green-700 font-medium">本廠商上次：NT$ {last.unitPrice.toFixed(2)}</span>
                          <button type="button"
                            onClick={() => setNewItem(n => ({ ...n, unitPrice: String(last.unitPrice) }))}
                            className="px-1.5 py-0.5 bg-green-600 text-white rounded text-xs hover:bg-green-700">套用</button>
                        </div>
                      ) : null;
                    })()}
                    <input type="number" step="0.01" placeholder="單價" value={newItem.unitPrice}
                      onChange={(e) => setNewItem({ ...newItem, unitPrice: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <input type="text" placeholder="備註" value={newItem.note}
                      onChange={(e) => setNewItem({ ...newItem, note: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    {(() => {
                      const product = products.find(p => p.id === parseInt(newItem.productId));
                      if (product?.isInStock) {
                        return (
                          <select value={newItem.inventoryWarehouse}
                            onChange={(e) => setNewItem({ ...newItem, inventoryWarehouse: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                          >
                            <option value="">選擇入庫倉庫</option>
                            {storageLocationsList.map(w => (
                              <option key={w} value={w}>{w}</option>
                            ))}
                          </select>
                        );
                      }
                      return <div className="w-full px-3 py-2 text-sm text-gray-400 border border-gray-200 rounded bg-gray-50">不需入庫</div>;
                    })()}
                  </div>
                  <div>
                    <button type="button" onClick={addItem}
                      className="w-full px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
                      新增（若無法新增，請先建檔）
                    </button>
                  </div>
                </div>

                {/* 最近採購記錄 */}
                {newItem.productId && (
                  <div className="mt-3 border border-blue-200 rounded-lg bg-blue-50 p-3">
                    <h5 className="text-sm font-semibold text-blue-700 mb-2">最近採購記錄（{productSearch}）</h5>
                    {loadingHistory ? (
                      <p className="text-xs text-gray-500">載入中...</p>
                    ) : recentPurchases.length > 0 ? (
                      <table className="w-full text-sm">
                        <thead className="sticky top-0 z-10 bg-blue-100">
                          <tr className="bg-blue-100">
                            <th className="px-3 py-1.5 text-left text-xs font-medium text-blue-800">日期</th>
                            <th className="px-3 py-1.5 text-left text-xs font-medium text-blue-800">單價</th>
                            <th className="px-3 py-1.5 text-left text-xs font-medium text-blue-800">數量</th>
                            <th className="px-3 py-1.5 text-left text-xs font-medium text-blue-800">廠商</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-blue-200">
                          {(() => {
                            const minPrice = Math.min(...recentPurchases.map(r => r.unitPrice));
                            const curSid = formData.supplierId ? parseInt(formData.supplierId) : null;
                            return recentPurchases.map((record, idx) => {
                              const isCurrent = curSid && record.supplierId === curSid;
                              return (
                                <tr key={idx} className={isCurrent ? 'bg-green-50' : 'bg-white'}>
                                  <td className="px-3 py-1.5 text-xs">{record.purchaseDate}</td>
                                  <td className={`px-3 py-1.5 text-xs font-semibold ${record.unitPrice === minPrice ? 'text-red-600' : ''}`}>
                                    NT$ {record.unitPrice.toFixed(2)}
                                  </td>
                                  <td className="px-3 py-1.5 text-xs">{record.quantity}</td>
                                  <td className="px-3 py-1.5 text-xs">
                                    {record.supplierName}
                                    {isCurrent && <span className="ml-1 text-green-600 text-xs">★</span>}
                                  </td>
                                </tr>
                              );
                            });
                          })()}
                        </tbody>
                      </table>
                    ) : (
                      <p className="text-xs text-gray-500">此產品尚無採購記錄</p>
                    )}

                    {/* 各廠商最新比價 */}
                    {allProductPurchases.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-blue-200">
                        <h5 className="text-xs font-semibold text-blue-700 mb-1">各廠商最新比價</h5>
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="bg-blue-50">
                              <th className="px-2 py-1 text-left font-medium">廠商</th>
                              <th className="px-2 py-1 text-right font-medium">最新單價</th>
                              <th className="px-2 py-1 text-left font-medium text-gray-500">最近進貨</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-blue-100">
                            {(() => {
                              const bySupplier = {};
                              allProductPurchases.forEach(r => {
                                if (!bySupplier[r.supplierId] || r.purchaseDate > bySupplier[r.supplierId].purchaseDate) {
                                  bySupplier[r.supplierId] = r;
                                }
                              });
                              const rows = Object.values(bySupplier).sort((a, b) => a.unitPrice - b.unitPrice);
                              const minPrice = rows.length > 0 ? rows[0].unitPrice : null;
                              const curSid = formData.supplierId ? parseInt(formData.supplierId) : null;
                              return rows.map(r => (
                                <tr key={r.supplierId} className={r.supplierId === curSid ? 'bg-green-50 font-semibold' : 'bg-white'}>
                                  <td className="px-2 py-1">
                                    {r.supplierName}
                                    {r.supplierId === curSid && <span className="ml-1 text-green-600">★</span>}
                                  </td>
                                  <td className={`px-2 py-1 text-right ${r.unitPrice === minPrice ? 'text-green-600 font-bold' : ''}`}>
                                    NT$ {r.unitPrice.toFixed(2)}
                                    {r.unitPrice === minPrice && <span className="ml-1 text-xs">最低</span>}
                                  </td>
                                  <td className="px-2 py-1 text-gray-500">{r.purchaseDate}</td>
                                </tr>
                              ));
                            })()}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {/* Price Cache Comparison */}
                    {priceCache && (
                      <div className="mt-3 pt-3 border-t border-blue-200">
                        <h5 className="text-xs font-semibold text-blue-700 mb-1">快取比價摘要</h5>
                        <div className="grid grid-cols-3 gap-2 text-xs">
                          <div className="bg-white p-2 rounded">
                            <span className="text-gray-500">最低價</span>
                            <div className="font-bold text-green-600">NT$ {Number(priceCache.minPrice || 0).toFixed(2)}</div>
                            {priceCache.minSupplier && <div className="text-gray-400">{priceCache.minSupplier}</div>}
                          </div>
                          <div className="bg-white p-2 rounded">
                            <span className="text-gray-500">平均價</span>
                            <div className="font-bold">NT$ {Number(priceCache.avgPrice || 0).toFixed(2)}</div>
                          </div>
                          <div className="bg-white p-2 rounded">
                            <span className="text-gray-500">最高價</span>
                            <div className="font-bold text-red-600">NT$ {Number(priceCache.maxPrice || 0).toFixed(2)}</div>
                            {priceCache.maxSupplier && <div className="text-gray-400">{priceCache.maxSupplier}</div>}
                          </div>
                        </div>
                        {newItem.unitPrice && priceCache.avgPrice && (
                          <div className="mt-2 text-xs">
                            {Number(newItem.unitPrice) > Number(priceCache.avgPrice) * 1.1 ? (
                              <span className="text-red-600 font-medium">⚠ 目前單價高於平均價 {((Number(newItem.unitPrice) / Number(priceCache.avgPrice) - 1) * 100).toFixed(1)}%</span>
                            ) : Number(newItem.unitPrice) < Number(priceCache.minPrice) ? (
                              <span className="text-green-600 font-medium">✓ 低於歷史最低價</span>
                            ) : (
                              <span className="text-gray-500">價格在合理範圍內</span>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* 金額計算 */}
            <div className="border-t pt-4 mb-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                <div className="flex flex-wrap justify-end gap-6">
                  <div className="text-right border-l-2 border-blue-300 pl-6">
                    <div className="text-xs text-blue-600 mb-1 font-medium">總金額</div>
                    <div className="text-2xl font-bold text-blue-600">NT$ {totals.total}</div>
                  </div>
                </div>
              </div>
            </div>

            {/* 操作按鈕 */}
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={async () => {
                  const isDirty = !!editingPurchase || items.length > 0 || !!formData.warehouse || !!formData.supplierId;
                  if (isDirty && !(await confirm('表單內有未儲存的資料，確定要離開？', { title: '放棄變更', danger: true }))) return;
                  handleCancelForm();
                }}
                className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                取消
              </button>
              <button type="submit" disabled={purchaseSaving}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
                {purchaseSaving ? '儲存中…' : '儲存'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 篩選區 */}
      <div className="bg-white rounded-lg shadow-sm p-4 mb-6">
        <div className="flex flex-wrap gap-4 items-center">
          <select
            value={filterData.supplierId}
            onChange={(e) => setFilterData({ ...filterData, supplierId: e.target.value })}
            className="px-3 py-2 border rounded"
          >
            <option value="">全部廠商</option>
            {suppliers.map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          <select
            value={filterData.warehouse}
            onChange={(e) => setFilterData({ ...filterData, warehouse: e.target.value })}
            className="px-3 py-2 border rounded"
          >
            <option value="">全部館別</option>
            {warehousesList.map(w => (
              <option key={w} value={w}>{w}</option>
            ))}
          </select>
          <input type="date" value={filterData.startDate}
            onChange={(e) => setFilterData({ ...filterData, startDate: e.target.value })}
            className="px-3 py-2 border rounded" placeholder="開始日期"
          />
          <span>~</span>
          <input type="date" value={filterData.endDate}
            onChange={(e) => setFilterData({ ...filterData, endDate: e.target.value })}
            className="px-3 py-2 border rounded" placeholder="結束日期"
          />
          <select
            value={filterData.status}
            onChange={(e) => setFilterData({ ...filterData, status: e.target.value })}
            className="px-3 py-2 border rounded"
          >
            <option value="">全部狀態</option>
            <option value="待入庫">待入庫</option>
            <option value="已入庫">已入庫</option>
          </select>
          <button onClick={handleFilterChange} className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">查詢</button>
          <button onClick={handleResetFilter}
            disabled={!filterData.supplierId && !filterData.startDate && !filterData.endDate && !filterData.warehouse && !filterData.status}
            className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed">
            清除篩選
          </button>
          <span className="text-sm text-gray-600">顯示 {purchases.length} 筆（共 {totalCount} 筆）</span>
        </div>
      </div>

      {/* 列表 */}
      <div className="bg-white rounded-lg shadow-sm tbl-wrap">
        <table className="w-full">
          <thead className="bg-gray-50 sticky top-0 z-10">
            <tr>
              <SortableTh label="單號" colKey="purchaseNo" sortKey={purSortKey} sortDir={purSortDir} onSort={togglePurSort} className="px-4 py-3" />
              <SortableTh label="館別" colKey="warehouse" sortKey={purSortKey} sortDir={purSortDir} onSort={togglePurSort} className="px-4 py-3" />
              <SortableTh label="部門" colKey="department" sortKey={purSortKey} sortDir={purSortDir} onSort={togglePurSort} className="px-4 py-3" />
              <SortableTh label="廠商" colKey="supplier" sortKey={purSortKey} sortDir={purSortDir} onSort={togglePurSort} className="px-4 py-3" />
              <SortableTh label="日期" colKey="purchaseDate" sortKey={purSortKey} sortDir={purSortDir} onSort={togglePurSort} className="px-4 py-3" />
              <SortableTh label="總金額" colKey="totalAmount" sortKey={purSortKey} sortDir={purSortDir} onSort={togglePurSort} className="px-4 py-3" align="right" />
              <SortableTh label="入庫狀態" colKey="stockStatus" sortKey={purSortKey} sortDir={purSortDir} onSort={togglePurSort} className="px-4 py-3" />
              <SortableTh label="發票狀態" colKey="invoiceStatus" sortKey={purSortKey} sortDir={purSortDir} onSort={togglePurSort} className="px-4 py-3" />
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {loading ? (
              <tr><td colSpan="9" className="px-4 py-8 text-center text-gray-500">載入中...</td></tr>
            ) : purchases.length === 0 ? (
              <tr><td colSpan="9" className="px-4 py-8 text-center text-gray-500">尚無進貨資料</td></tr>
            ) : (
              sortedPurchases.map((purchase, index) => {
                const totalAmount = purchase.totalAmount || parseFloat(purchase.amount || 0);
                const isExpanded = expandedPurchaseId === purchase.id;
                return (
                  <>
                    <tr key={purchase.id} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                      <td className="px-4 py-3 text-sm">{purchase.purchaseNo}</td>
                      <td className="px-4 py-3 text-sm">{purchase.warehouse || '-'}</td>
                      <td className="px-4 py-3 text-sm">{purchase.department || '-'}</td>
                      <td className="px-4 py-3 text-sm">{purchase.supplierName || '-'}</td>
                      <td className="px-4 py-3 text-sm">{purchase.purchaseDate}</td>
                      <td className="px-4 py-3 text-sm font-semibold text-blue-600">NT$ {totalAmount.toFixed(2)}</td>
                      <td className="px-4 py-3 text-sm">
                        {purchase.items && purchase.items.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {(() => {
                              const statusCounts = {};
                              purchase.items.forEach(item => {
                                const s = item.status || purchase.status || '待入庫';
                                statusCounts[s] = (statusCounts[s] || 0) + 1;
                              });
                              return Object.entries(statusCounts).map(([status, count]) => (
                                <span key={status} className={`px-2 py-0.5 rounded text-xs ${
                                  status === '已入庫' ? 'bg-green-100 text-green-800' :
                                  status === '待入庫' ? 'bg-yellow-100 text-yellow-800' :
                                  status === ALLOWANCE_STATUS.RETURNED ? 'bg-orange-100 text-orange-800' :
                                  status === ALLOWANCE_STATUS.PARTIAL_RETURN ? 'bg-amber-100 text-amber-800' :
                                  'bg-gray-100 text-gray-800'
                                }`}>
                                  {status}{count > 1 ? ` x${count}` : ''}
                                </span>
                              ));
                            })()}
                          </div>
                        ) : (
                          <span className={`px-2 py-1 rounded text-xs ${
                            purchase.status === '已入庫' ? 'bg-green-100 text-green-800' :
                            purchase.status === '待入庫' ? 'bg-yellow-100 text-yellow-800' :
                            purchase.status === ALLOWANCE_STATUS.RETURNED ? 'bg-orange-100 text-orange-800' :
                            purchase.status === ALLOWANCE_STATUS.PARTIAL_RETURN ? 'bg-amber-100 text-amber-800' :
                            'bg-red-100 text-red-800'
                          }`}>{purchase.status}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {purchase.items && purchase.items.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {(() => {
                              let invoicedCount = 0; let uninvoicedCount = 0;
                              purchase.items.forEach((item, idx) => {
                                if (isItemInvoiced(purchase.id, idx)) invoicedCount++;
                                else uninvoicedCount++;
                              });
                              const retTag = getPurchaseReturnInvoiceTag(purchase);
                              return (
                                <>
                                  {invoicedCount > 0 && <span className="px-2 py-0.5 rounded text-xs bg-green-100 text-green-800">已核銷{invoicedCount > 1 ? ` x${invoicedCount}` : ''}</span>}
                                  {uninvoicedCount > 0 && <span className="px-2 py-0.5 rounded text-xs bg-red-100 text-red-800">未核銷{uninvoicedCount > 1 ? ` x${uninvoicedCount}` : ''}</span>}
                                  {retTag && <span className={`px-2 py-0.5 rounded text-xs font-semibold ${retTag.className}`}>{retTag.label}</span>}
                                </>
                              );
                            })()}
                          </div>
                        ) : (
                          (() => {
                            const rt = getPurchaseReturnInvoiceTag(purchase);
                            return (
                              <div className="flex flex-wrap gap-1">
                                <span className="px-2 py-1 rounded text-xs bg-red-100 text-red-800">未核銷</span>
                                {rt && <span className={`px-2 py-0.5 rounded text-xs font-semibold ${rt.className}`}>{rt.label}</span>}
                              </div>
                            );
                          })()
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          <button onClick={() => handleViewDetails(purchase.id)} className="text-blue-600 hover:underline text-sm">
                            {isExpanded ? '收起' : '查看'}
                          </button>
                          {isLoggedIn && (() => {
                            const allInvoiced = purchase.items && purchase.items.length > 0 &&
                              purchase.items.every((_, idx) => isItemInvoiced(purchase.id, idx));
                            const showInvoiceLink = purchase.status === '已入庫' && !allInvoiced && purchase.supplierId;
                            const showPaymentLink = purchase.status === '已入庫' && allInvoiced && purchase.supplierId;
                            return (
                              <>
                                {showInvoiceLink && (
                                  <Link
                                    href={`/sales?supplierId=${purchase.supplierId}&purchaseId=${purchase.id}`}
                                    className="text-sm text-orange-600 hover:underline whitespace-nowrap"
                                    title="開立進項發票"
                                  >開立發票</Link>
                                )}
                                {showPaymentLink && (
                                  <Link
                                    href={`/finance?supplierId=${purchase.supplierId}&purchaseId=${purchase.id}`}
                                    className="text-sm text-indigo-600 hover:underline whitespace-nowrap"
                                    title="建立付款單"
                                  >建付款單</Link>
                                )}
                                <button
                                  onClick={() => !allInvoiced && handleEdit(purchase)}
                                  className={`text-sm ${allInvoiced ? 'text-gray-400 cursor-not-allowed' : 'text-green-600 hover:underline cursor-pointer'}`}
                                  disabled={allInvoiced}
                                  title={allInvoiced ? '已核銷的進貨單無法編輯' : ''}
                                >編輯</button>
                                <button
                                  onClick={() => !allInvoiced && handleDelete(purchase.id)}
                                  className={`text-sm ${allInvoiced ? 'text-gray-400 cursor-not-allowed' : 'text-red-600 hover:underline cursor-pointer'}`}
                                  disabled={allInvoiced}
                                  title={allInvoiced ? '已核銷的進貨單無法刪除' : ''}
                                >刪除</button>
                              </>
                            );
                          })()}
                        </div>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr key={`${purchase.id}-details`}>
                        <td colSpan="9" className="px-4 py-4 bg-gray-50">
                          <div className="bg-white rounded-lg border border-gray-200 p-4">
                            <h4 className="text-lg font-semibold mb-4 text-gray-800">進貨單詳情</h4>
                            <div className="grid grid-cols-2 gap-4 mb-4">
                              <div><span className="text-sm font-medium text-gray-600">單號：</span><span className="text-sm text-gray-800">{purchase.purchaseNo}</span></div>
                              <div><span className="text-sm font-medium text-gray-600">館別：</span><span className="text-sm text-gray-800">{purchase.warehouse || '未指定'}</span></div>
                              <div><span className="text-sm font-medium text-gray-600">部門：</span><span className="text-sm text-gray-800">{purchase.department || '未指定'}</span></div>
                              <div><span className="text-sm font-medium text-gray-600">廠商：</span><span className="text-sm text-gray-800">{purchase.supplierName || '未知廠商'}</span></div>
                              <div><span className="text-sm font-medium text-gray-600">日期：</span><span className="text-sm text-gray-800">{purchase.purchaseDate}</span></div>
                              <div><span className="text-sm font-medium text-gray-600">付款條件：</span><span className="text-sm text-gray-800">{purchase.paymentTerms || '月結'}</span></div>
                              <div><span className="text-sm font-medium text-gray-600">總金額：</span><span className="text-sm font-semibold text-blue-600">NT$ {totalAmount.toFixed(2)}</span></div>
                            </div>
                            <div className="mt-4">
                              <h5 className="text-md font-semibold mb-2 text-gray-800">商品明細</h5>
                              {purchase.items && purchase.items.length > 0 ? (
                                <table className="w-full border-collapse">
                                  <thead className="sticky top-0 z-10 bg-gray-100">
                                    <tr className="bg-gray-100">
                                      <th className="px-3 py-2 text-left text-sm font-medium text-gray-700 border border-gray-300">產品</th>
                                      <th className="px-3 py-2 text-left text-sm font-medium text-gray-700 border border-gray-300">數量</th>
                                      <th className="px-3 py-2 text-left text-sm font-medium text-gray-700 border border-gray-300">單價</th>
                                      <th className="px-3 py-2 text-left text-sm font-medium text-gray-700 border border-gray-300">小計</th>
                                      <th className="px-3 py-2 text-left text-sm font-medium text-gray-700 border border-gray-300">備註</th>
                                      <th className="px-3 py-2 text-left text-sm font-medium text-gray-700 border border-gray-300">入庫狀態</th>
                                      <th className="px-3 py-2 text-left text-sm font-medium text-gray-700 border border-gray-300">發票狀態</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {purchase.items.map((item, idx) => {
                                      const product = products.find(p => p.id === item.productId);
                                      const itemSubtotal = item.quantity * item.unitPrice;
                                      return (
                                        <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                                          <td className="px-3 py-2 text-sm border border-gray-300">{product ? product.name : '未知商品'}</td>
                                          <td className="px-3 py-2 text-sm border border-gray-300">{item.quantity}</td>
                                          <td className="px-3 py-2 text-sm border border-gray-300">NT$ {item.unitPrice.toFixed(2)}</td>
                                          <td className="px-3 py-2 text-sm border border-gray-300">NT$ {itemSubtotal.toFixed(2)}</td>
                                          <td className="px-3 py-2 text-sm text-gray-600 border border-gray-300">{item.note || '-'}</td>
                                          <td className="px-3 py-2 text-sm border border-gray-300">
                                            <span className={`px-2 py-0.5 rounded text-xs ${
                                              item.status === '已入庫' ? 'bg-green-100 text-green-800' :
                                              item.status === '待入庫' ? 'bg-yellow-100 text-yellow-800' :
                                              'bg-gray-100 text-gray-800'
                                            }`}>
                                              {item.status || purchase.status || '待入庫'}
                                            </span>
                                          </td>
                                          <td className="px-3 py-2 text-sm border border-gray-300">
                                            {(() => {
                                              const invoiced = isItemInvoiced(purchase.id, idx);
                                              const rt = getPurchaseReturnInvoiceTag(purchase);
                                              return (
                                                <div className="flex flex-wrap gap-1">
                                                  <span className={`px-2 py-0.5 rounded text-xs ${invoiced ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                                                    {invoiced ? '已核銷' : '未核銷'}
                                                  </span>
                                                  {rt && <span className={`px-2 py-0.5 rounded text-xs font-semibold ${rt.className}`}>{rt.label}</span>}
                                                </div>
                                              );
                                            })()}
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              ) : (
                                <p className="text-gray-500 text-sm">尚無商品明細</p>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* 分頁器 */}
      {(() => {
        const totalPages = Math.ceil(totalCount / itemsPerPage);
        if (totalPages <= 0) return null;
        const getPageNumbers = () => {
          const pages = [];
          if (totalPages <= 5) {
            for (let i = 1; i <= totalPages; i++) pages.push(i);
          } else if (currentPage <= 3) {
            for (let i = 1; i <= 5; i++) pages.push(i);
          } else if (currentPage >= totalPages - 2) {
            for (let i = totalPages - 4; i <= totalPages; i++) pages.push(i);
          } else {
            for (let i = currentPage - 2; i <= currentPage + 2; i++) pages.push(i);
          }
          return pages;
        };
        return (
          <div className="flex justify-center items-center gap-4 mt-6">
            <button onClick={() => fetchPurchases(Math.max(1, currentPage - 1), itemsPerPage, filterData)} disabled={currentPage === 1}
              className="px-4 py-2 border rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed">&lt; Prev</button>
            {totalPages > 5 && currentPage > 3 && (<>
              <button onClick={() => fetchPurchases(1, itemsPerPage, filterData)} className="px-4 py-2 border rounded-lg hover:bg-gray-100">1</button>
              <span className="px-2 text-gray-500">...</span>
            </>)}
            {getPageNumbers().map(p => (
              <button key={p} onClick={() => fetchPurchases(p, itemsPerPage, filterData)}
                className={`px-4 py-2 rounded-lg ${p === currentPage ? 'bg-blue-600 text-white' : 'border hover:bg-gray-100'}`}>{p}</button>
            ))}
            {totalPages > 5 && currentPage < totalPages - 2 && (<>
              <span className="px-2 text-gray-500">...</span>
              <button onClick={() => fetchPurchases(totalPages, itemsPerPage, filterData)} className="px-4 py-2 border rounded-lg hover:bg-gray-100">{totalPages}</button>
            </>)}
            <button onClick={() => fetchPurchases(Math.min(totalPages, currentPage + 1), itemsPerPage, filterData)} disabled={currentPage === totalPages}
              className="px-4 py-2 border rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed">Next &gt;</button>
            <span className="ml-4 text-sm text-gray-600">每頁</span>
            <select value={itemsPerPage} onChange={(e) => { const n = Number(e.target.value); setItemsPerPage(n); fetchPurchases(1, n, filterData); }}
              className="px-2 py-1 border rounded">
              <option value={20}>20</option><option value={50}>50</option><option value={100}>100</option>
            </select>
            <span className="text-sm text-gray-600">筆</span>
            <span className="ml-2 text-sm text-gray-600">(共 {totalCount} 筆，第 {currentPage} / {totalPages} 頁)</span>
          </div>
        );
      })()}
    </>
  );
}
