'use client';

import { useState, useEffect, Fragment } from 'react';
import Link from 'next/link';

export default function InvoicePage() {
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState(null);
  const [products, setProducts] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [selectedItems, setSelectedItems] = useState([]); // 勾選的品項
  const [availableItems, setAvailableItems] = useState([]); // 可選的未核銷品項
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingItems, setLoadingItems] = useState(false);
  const [expandedInvoices, setExpandedInvoices] = useState(new Set()); // 追蹤展開的發票ID
  
  // 篩選條件
  const [filterData, setFilterData] = useState({
    yearMonth: '', // YYYY-MM
    supplierId: '',
    warehouse: ''
  });
  
  // 表單資料
  const [formData, setFormData] = useState({
    invoiceNo: '',
    invoiceDate: new Date().toISOString().split('T')[0],
    status: '待核銷'
  });

  useEffect(() => {
    fetchProducts();
    fetchSuppliers();
    fetchInvoices();
  }, []);

  async function fetchInvoices() {
    try {
      const response = await fetch('/api/sales');
      const data = await response.json();
      setInvoices(Array.isArray(data) ? data : []);
      setLoading(false);
    } catch (error) {
      console.error('取得發票列表失敗:', error);
      setInvoices([]);
      setLoading(false);
    }
  }

  async function fetchProducts() {
    try {
      const response = await fetch('/api/products');
      const data = await response.json();
      setProducts(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('取得產品列表失敗:', error);
      setProducts([]);
    }
  }

  async function fetchSuppliers() {
    try {
      const response = await fetch('/api/suppliers');
      const data = await response.json();
      setSuppliers(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('取得廠商列表失敗:', error);
      setSuppliers([]);
    }
  }

  // 查詢未核銷的進貨單品項
  async function fetchUninvoicedItems() {
    setLoadingItems(true);
    try {
      const params = new URLSearchParams();
      if (filterData.yearMonth) params.append('yearMonth', filterData.yearMonth);
      if (filterData.supplierId) params.append('supplierId', filterData.supplierId);
      if (filterData.warehouse) params.append('warehouse', filterData.warehouse);
      
      const url = `/api/purchasing/uninvoiced?${params.toString()}`;
      console.log('查詢URL:', url);
      
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      console.log('查詢結果:', data);
      console.log('資料筆數:', Array.isArray(data) ? data.length : 0);
      
      const items = Array.isArray(data) ? data : [];
      setAvailableItems(items);
      setSelectedItems([]); // 清空已選品項
      
      if (items.length === 0) {
        alert('查詢完成，但沒有找到未核銷的進貨單品項。\n\n請檢查：\n1. 篩選條件是否正確\n2. 是否有建立進貨單資料\n3. 該品項是否已被核銷');
      }
    } catch (error) {
      console.error('取得未核銷品項失敗:', error);
      setAvailableItems([]);
      alert('查詢失敗：' + (error.message || '請稍後再試'));
    } finally {
      setLoadingItems(false);
    }
  }

  function getProductName(productId) {
    const product = products.find(p => p.id === productId);
    return product ? product.name : '未知產品';
  }

  function getSupplierName(supplierId) {
    const supplier = suppliers.find(s => s.id === supplierId);
    return supplier ? supplier.name : '未知廠商';
  }

  function handleItemToggle(item) {
    const isSelected = selectedItems.some(selected => selected.id === item.id);
    if (isSelected) {
      setSelectedItems(selectedItems.filter(selected => selected.id !== item.id));
    } else {
      // 新增項目時，初始化銷售金額和營業稅欄位
      const salesAmount = item.subtotal || 0;
      const taxType = '應稅'; // 預設為應稅
      const taxAmount = salesAmount * 0.05; // 預設營業稅為銷售金額的 5%
      setSelectedItems([...selectedItems, {
        ...item,
        salesAmount: salesAmount,
        taxType: taxType,
        taxAmount: taxAmount
      }]);
    }
  }

  function updateSelectedItem(itemId, field, value) {
    setSelectedItems(selectedItems.map(item => {
      if (item.id === itemId) {
        const updated = { ...item, [field]: value };
        // 如果更新的是銷售金額或營業稅類型，重新計算營業稅金額
        if (field === 'salesAmount' || field === 'taxType') {
          const salesAmount = field === 'salesAmount' ? parseFloat(value) || 0 : parseFloat(item.salesAmount || 0);
          const taxType = field === 'taxType' ? value : item.taxType;
          
          let taxAmount = 0;
          if (taxType === '應稅') {
            taxAmount = salesAmount * 0.05; // 5% 營業稅
          } else if (taxType === '零稅率' || taxType === '免稅') {
            taxAmount = 0;
          }
          
          updated.taxAmount = taxAmount;
        }
        return updated;
      }
      return item;
    }));
  }

  function handleSelectAll() {
    if (selectedItems.length === availableItems.length) {
      setSelectedItems([]);
    } else {
      // 全選時，為每個項目初始化銷售金額和營業稅欄位
      setSelectedItems(availableItems.map(item => ({
        ...item,
        salesAmount: item.subtotal || 0, // 預設銷售金額為小計
        taxType: '應稅', // 預設為應稅
        taxAmount: (item.subtotal || 0) * 0.05 // 預設營業稅為銷售金額的 5%
      })));
    }
  }

  function calculateTotal() {
    // 使用新的銷售金額和營業稅金額計算
    const subtotal = selectedItems.reduce((sum, item) => {
      return sum + parseFloat(item.salesAmount || item.subtotal || 0);
    }, 0);
    const tax = selectedItems.reduce((sum, item) => {
      return sum + parseFloat(item.taxAmount || 0);
    }, 0);
    return {
      subtotal: subtotal.toFixed(2),
      tax: tax.toFixed(2),
      total: (subtotal + tax).toFixed(2)
    };
  }

  async function handleSubmit(e) {
    e.preventDefault();

    if (selectedItems.length === 0) {
      alert('請至少勾選一項進貨單品項');
      return;
    }

    if (!formData.invoiceNo) {
      alert('請輸入發票號碼');
      return;
    }

    try {
      const totals = calculateTotal();
      const invoiceData = {
        ...formData,
        items: selectedItems.map(item => ({
          purchaseItemId: item.purchaseItemId, // 記錄進貨單品項ID
          purchaseId: item.purchaseId,
          purchaseNo: item.purchaseNo,
          purchaseDate: item.purchaseDate, // 記錄進貨日期，用於區分不同時間進貨的相同產品
          supplierId: item.supplierId, // 記錄廠商ID
          productId: item.productId,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          salesAmount: parseFloat(item.salesAmount || item.subtotal || 0), // 銷售金額
          taxType: item.taxType || '應稅', // 營業稅類型
          taxAmount: parseFloat(item.taxAmount || 0), // 營業稅金額
          note: item.note || ''
        })),
        amount: parseFloat(totals.subtotal),
        tax: parseFloat(totals.tax),
        totalAmount: parseFloat(totals.total)
      };

      const isEditing = !!editingInvoice;
      const url = isEditing ? `/api/sales/${editingInvoice.id}` : '/api/sales';
      const method = isEditing ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method: method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(invoiceData)
      });

      if (response.ok) {
        alert(`發票${isEditing ? '更新' : '登錄'}成功！`);
        setShowAddForm(false);
        setEditingInvoice(null);
        setSelectedItems([]);
        setAvailableItems([]);
        setFilterData({
          yearMonth: '',
          supplierId: '',
          warehouse: ''
        });
        setFormData({
          invoiceNo: '',
          invoiceDate: new Date().toISOString().split('T')[0],
          status: '待核銷'
        });
        fetchInvoices();
      } else {
        const error = await response.json();
        alert(`${isEditing ? '更新' : '登錄'}失敗：` + (error.error || '未知錯誤'));
      }
    } catch (error) {
      console.error(`${editingInvoice ? '更新' : '登錄'}發票失敗:`, error);
      alert(`${editingInvoice ? '更新' : '登錄'}發票失敗，請稍後再試`);
    }
  }

  function handleViewDetails(invoiceId) {
    const newExpanded = new Set(expandedInvoices);
    if (newExpanded.has(invoiceId)) {
      newExpanded.delete(invoiceId); // 如果已展開，則收合
    } else {
      newExpanded.add(invoiceId); // 如果未展開，則展開
    }
    setExpandedInvoices(newExpanded);
  }

  async function handleDelete(invoiceId) {
    if (!confirm('確定要刪除這張發票嗎？刪除後相關進貨單品項將可重新核銷。')) return;
    
    try {
      const response = await fetch(`/api/sales/${invoiceId}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        alert('發票刪除成功！');
        fetchInvoices();
      } else {
        const error = await response.json();
        alert('刪除失敗：' + (error.error || '未知錯誤'));
      }
    } catch (error) {
      console.error('刪除發票失敗:', error);
      alert('刪除發票失敗，請稍後再試');
    }
  }

  const totals = selectedItems.length > 0 ? calculateTotal() : { subtotal: '0', tax: '0', total: '0' };

  return (
    <div className="min-h-screen bg-gray-100">
      {/* 導航欄 */}
      <nav className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-blue-800">📦 進銷存系統</h1>
            <div className="flex gap-6 text-sm flex-wrap">
              <Link href="/" className="hover:text-blue-600">儀表板</Link>
              <Link href="/products" className="hover:text-blue-600">主資料</Link>
              <Link href="/suppliers" className="hover:text-blue-600">廠商</Link>
              <Link href="/purchasing" className="hover:text-blue-600">進貨</Link>
              <Link href="/sales" className="font-medium text-blue-600">發票登錄/核銷</Link>
              <Link href="/finance" className="hover:text-blue-600">付款</Link>
              <Link href="/inventory" className="hover:text-blue-600">庫存</Link>
              <Link href="/analytics" className="hover:text-blue-600">分析</Link>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* 標題與操作 */}
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold">發票登錄/核銷</h2>
          <button
            onClick={() => {
              setShowAddForm(!showAddForm);
              if (!showAddForm) {
                setSelectedItems([]);
                setAvailableItems([]);
                setFilterData({
                  yearMonth: '',
                  supplierId: '',
                  warehouse: ''
                });
              }
            }}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
          >
            ➕ 新增發票
          </button>
        </div>

        {/* 新增發票表單 */}
        {showAddForm && (
          <div className="bg-white rounded-lg shadow-sm p-6 mb-6 border-2 border-blue-200">
            <h3 className="text-lg font-semibold mb-4">{editingInvoice ? '編輯發票' : '新增發票'}</h3>
            <form onSubmit={handleSubmit}>
              {/* 篩選條件 */}
              <div className="bg-gray-50 border rounded-lg p-4 mb-6">
                <h4 className="text-md font-semibold mb-3">篩選未核銷的進貨單品項</h4>
                <div className="grid grid-cols-3 gap-4 mb-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      進貨年月
                    </label>
                    <input
                      type="month"
                      value={filterData.yearMonth}
                      onChange={(e) => setFilterData({ ...filterData, yearMonth: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      廠商
                    </label>
                    <select
                      value={filterData.supplierId}
                      onChange={(e) => setFilterData({ ...filterData, supplierId: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">全部廠商</option>
                      {suppliers.map(s => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      館別
                    </label>
                    <select
                      value={filterData.warehouse}
                      onChange={(e) => setFilterData({ ...filterData, warehouse: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">全部館別</option>
                      <option value="麗格">麗格</option>
                      <option value="麗軒">麗軒</option>
                      <option value="民宿">民宿</option>
                    </select>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={fetchUninvoicedItems}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
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
                    <button
                      type="button"
                      onClick={handleSelectAll}
                      className="text-sm text-blue-600 hover:underline"
                    >
                      {selectedItems.length === availableItems.length ? '取消全選' : '全選'}
                    </button>
                  </div>
                  <div className="border rounded-lg overflow-hidden">
                    <table className="w-full">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-3 py-2 text-left text-sm font-medium text-gray-700 w-12">
                            <input
                              type="checkbox"
                              checked={selectedItems.length === availableItems.length && availableItems.length > 0}
                              onChange={handleSelectAll}
                              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            />
                          </th>
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
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => handleItemToggle(item)}
                                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                />
                              </td>
                              <td className="px-3 py-2 text-sm font-medium">{item.purchaseNo}</td>
                              <td className="px-3 py-2 text-sm">{item.purchaseDate}</td>
                              <td className="px-3 py-2 text-sm">{getSupplierName(item.supplierId)}</td>
                              <td className="px-3 py-2 text-sm">{getProductName(item.productId)}</td>
                              <td className="px-3 py-2 text-sm">{item.quantity}</td>
                              <td className="px-3 py-2 text-sm">NT$ {item.unitPrice}</td>
                              <td className="px-3 py-2 text-sm">NT$ {item.subtotal.toFixed(2)}</td>
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
                      <thead className="bg-green-50">
                        <tr>
                          <th className="px-3 py-2 text-left text-sm font-medium text-gray-700">進貨單號</th>
                          <th className="px-3 py-2 text-left text-sm font-medium text-gray-700">進貨日期</th>
                          <th className="px-3 py-2 text-left text-sm font-medium text-gray-700">廠商</th>
                          <th className="px-3 py-2 text-left text-sm font-medium text-gray-700">產品</th>
                          <th className="px-3 py-2 text-left text-sm font-medium text-gray-700">數量</th>
                          <th className="px-3 py-2 text-left text-sm font-medium text-gray-700">單價</th>
                          <th className="px-3 py-2 text-left text-sm font-medium text-gray-700">銷售金額</th>
                          <th className="px-3 py-2 text-left text-sm font-medium text-gray-700">營業稅類型</th>
                          <th className="px-3 py-2 text-left text-sm font-medium text-gray-700">營業稅金額</th>
                          <th className="px-3 py-2 text-left text-sm font-medium text-gray-700">加總金額</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {selectedItems.map((item) => {
                          const salesAmount = parseFloat(item.salesAmount || item.subtotal || 0);
                          const taxAmount = parseFloat(item.taxAmount || 0);
                          const totalAmount = salesAmount + taxAmount;
                          return (
                            <tr key={item.id}>
                              <td className="px-3 py-2 text-sm">{item.purchaseNo}</td>
                              <td className="px-3 py-2 text-sm">{item.purchaseDate}</td>
                              <td className="px-3 py-2 text-sm">{getSupplierName(item.supplierId)}</td>
                              <td className="px-3 py-2 text-sm">{getProductName(item.productId)}</td>
                              <td className="px-3 py-2 text-sm">{item.quantity}</td>
                              <td className="px-3 py-2 text-sm">NT$ {item.unitPrice}</td>
                              <td className="px-3 py-2">
                                <input
                                  type="number"
                                  step="0.01"
                                  value={item.salesAmount !== undefined ? item.salesAmount : item.subtotal}
                                  onChange={(e) => updateSelectedItem(item.id, 'salesAmount', e.target.value)}
                                  className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                              </td>
                              <td className="px-3 py-2">
                                <select
                                  value={item.taxType || '應稅'}
                                  onChange={(e) => updateSelectedItem(item.id, 'taxType', e.target.value)}
                                  className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                >
                                  <option value="應稅">應稅</option>
                                  <option value="零稅率">零稅率</option>
                                  <option value="免稅">免稅</option>
                                </select>
                              </td>
                              <td className="px-3 py-2 text-sm">
                                NT$ {taxAmount.toFixed(2)}
                              </td>
                              <td className="px-3 py-2 text-sm font-semibold text-blue-600">
                                NT$ {totalAmount.toFixed(2)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot className="bg-gray-50">
                        <tr>
                          <td colSpan="6" className="px-3 py-2 text-sm font-semibold text-right">總計：</td>
                          <td className="px-3 py-2 text-sm font-semibold">
                            NT$ {selectedItems.reduce((sum, item) => sum + parseFloat(item.salesAmount || item.subtotal || 0), 0).toFixed(2)}
                          </td>
                          <td className="px-3 py-2 text-sm"></td>
                          <td className="px-3 py-2 text-sm font-semibold">
                            NT$ {selectedItems.reduce((sum, item) => sum + parseFloat(item.taxAmount || 0), 0).toFixed(2)}
                          </td>
                          <td className="px-3 py-2 text-sm font-bold text-blue-600">
                            NT$ {selectedItems.reduce((sum, item) => {
                              const salesAmount = parseFloat(item.salesAmount || item.subtotal || 0);
                              const taxAmount = parseFloat(item.taxAmount || 0);
                              return sum + salesAmount + taxAmount;
                            }, 0).toFixed(2)}
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
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    發票號碼 *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.invoiceNo}
                    onChange={(e) => setFormData({ ...formData, invoiceNo: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="輸入發票號碼"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    發票日期 *
                  </label>
                  <input
                    type="date"
                    required
                    value={formData.invoiceDate}
                    onChange={(e) => setFormData({ ...formData, invoiceDate: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    狀態
                  </label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option>待核銷</option>
                    <option>已核銷</option>
                    <option>已取消</option>
                  </select>
                </div>
              </div>

              {/* 金額計算 */}
              {selectedItems.length > 0 && (
                <div className="border-t pt-4 mb-4">
                  <div className="flex justify-end gap-8">
                    <div>
                      <span className="text-sm text-gray-600">小計：</span>
                      <span className="text-lg font-semibold ml-2">NT$ {totals.subtotal}</span>
                    </div>
                    <div>
                      <span className="text-sm text-gray-600">稅額 (5%)：</span>
                      <span className="text-lg font-semibold ml-2">NT$ {totals.tax}</span>
                    </div>
                    <div>
                      <span className="text-sm text-gray-600">總金額：</span>
                      <span className="text-xl font-bold text-blue-600 ml-2">NT$ {totals.total}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* 操作按鈕 */}
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddForm(false);
                    setEditingInvoice(null);
                    setSelectedItems([]);
                    setAvailableItems([]);
                    setFilterData({
                      yearMonth: '',
                      supplierId: '',
                      warehouse: ''
                    });
                    setFormData({
                      invoiceNo: '',
                      invoiceDate: new Date().toISOString().split('T')[0],
                      status: '待核銷'
                    });
                  }}
                  className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={selectedItems.length === 0}
                  className={`px-6 py-2 rounded-lg ${
                    selectedItems.length === 0
                      ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                      : 'bg-blue-600 text-white hover:bg-blue-700'
                  }`}
                >
                  儲存
                </button>
              </div>
            </form>
          </div>
        )}

        {/* 列表 */}
        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">發票號</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">發票日期</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">品項數</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">總金額</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">狀態</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {loading ? (
                <tr>
                  <td colSpan="6" className="px-4 py-8 text-center text-gray-500">
                    載入中...
                  </td>
                </tr>
              ) : invoices.length === 0 ? (
                <tr>
                  <td colSpan="6" className="px-4 py-8 text-center text-gray-500">
                    尚無發票資料
                  </td>
                </tr>
              ) : (
                invoices.map((invoice, index) => {
                  const isExpanded = expandedInvoices.has(invoice.id);
                  return (
                    <Fragment key={invoice.id}>
                      <tr className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                        <td className="px-4 py-3 text-sm">{invoice.invoiceNo || invoice.salesNo}</td>
                        <td className="px-4 py-3 text-sm">{invoice.invoiceDate || invoice.salesDate}</td>
                        <td className="px-4 py-3 text-sm">{invoice.items ? invoice.items.length : 0} 項</td>
                        <td className="px-4 py-3 text-sm font-semibold">
                          NT$ {parseFloat(invoice.totalAmount || invoice.amount + invoice.tax || 0).toFixed(2)}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <span className={`px-2 py-1 rounded text-xs ${
                            invoice.status === '已核銷' ? 'bg-green-100 text-green-800' :
                            invoice.status === '待核銷' ? 'bg-yellow-100 text-yellow-800' :
                            'bg-red-100 text-red-800'
                          }`}>
                            {invoice.status || '待核銷'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleViewDetails(invoice.id)}
                              className="text-blue-600 hover:underline text-sm"
                            >
                              {isExpanded ? '收起' : '查看'}
                            </button>
                            <button
                              onClick={() => handleDelete(invoice.id)}
                              className="text-red-600 hover:underline text-sm"
                            >
                              刪除
                            </button>
                          </div>
                        </td>
                      </tr>
                      {/* 展開的詳細資訊 */}
                      {isExpanded && (
                        <tr className="bg-blue-50">
                          <td colSpan="6" className="px-4 py-4">
                            <div className="space-y-4">
                              {/* 發票基本資訊 */}
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pb-4 border-b border-gray-300">
                                <div>
                                  <div className="text-xs text-gray-500 mb-1">發票號</div>
                                  <div className="text-sm font-semibold">{invoice.invoiceNo || invoice.salesNo}</div>
                                </div>
                                <div>
                                  <div className="text-xs text-gray-500 mb-1">發票日期</div>
                                  <div className="text-sm font-semibold">{invoice.invoiceDate || invoice.salesDate}</div>
                                </div>
                                <div>
                                  <div className="text-xs text-gray-500 mb-1">狀態</div>
                                  <div className="text-sm">
                                    <span className={`px-2 py-1 rounded text-xs ${
                                      invoice.status === '已核銷' ? 'bg-green-100 text-green-800' :
                                      invoice.status === '待核銷' ? 'bg-yellow-100 text-yellow-800' :
                                      'bg-red-100 text-red-800'
                                    }`}>
                                      {invoice.status || '待核銷'}
                                    </span>
                                  </div>
                                </div>
                                <div>
                                  <div className="text-xs text-gray-500 mb-1">品項數</div>
                                  <div className="text-sm font-semibold">{invoice.items ? invoice.items.length : 0} 項</div>
                                </div>
                              </div>

                              {/* 金額資訊 */}
                              <div className="grid grid-cols-3 gap-4 pb-4 border-b border-gray-300">
                                <div>
                                  <div className="text-xs text-gray-500 mb-1">小計</div>
                                  <div className="text-sm font-semibold">
                                    NT$ {parseFloat(invoice.amount || 0).toFixed(2)}
                                  </div>
                                </div>
                                <div>
                                  <div className="text-xs text-gray-500 mb-1">稅額 (5%)</div>
                                  <div className="text-sm font-semibold">
                                    NT$ {parseFloat(invoice.tax || 0).toFixed(2)}
                                  </div>
                                </div>
                                <div>
                                  <div className="text-xs text-gray-500 mb-1">總金額</div>
                                  <div className="text-lg font-bold text-blue-600">
                                    NT$ {parseFloat(invoice.totalAmount || invoice.amount + invoice.tax || 0).toFixed(2)}
                                  </div>
                                </div>
                              </div>

                              {/* 核銷品項列表 */}
                              {invoice.items && invoice.items.length > 0 && (
                                <div>
                                  <div className="text-sm font-semibold mb-3 text-gray-700">核銷品項詳情</div>
                                  <div className="border rounded-lg overflow-hidden">
                                    <table className="w-full text-sm">
                                      <thead className="bg-gray-100">
                                        <tr>
                                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-700">序號</th>
                                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-700">進貨單號</th>
                                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-700">進貨日期</th>
                                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-700">廠商</th>
                                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-700">產品</th>
                                          <th className="px-3 py-2 text-right text-xs font-medium text-gray-700">數量</th>
                                          <th className="px-3 py-2 text-right text-xs font-medium text-gray-700">單價</th>
                                          <th className="px-3 py-2 text-right text-xs font-medium text-gray-700">小計</th>
                                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-700">備註</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-gray-200 bg-white">
                                        {invoice.items.map((item, idx) => {
                                          const product = products.find(p => p.id === item.productId);
                                          const subtotal = (item.quantity || 0) * (item.unitPrice || 0);
                                          return (
                                            <tr key={idx} className="hover:bg-gray-50">
                                              <td className="px-3 py-2 text-gray-600">{idx + 1}</td>
                                              <td className="px-3 py-2 font-medium">{item.purchaseNo || '-'}</td>
                                              <td className="px-3 py-2 text-gray-600">{item.purchaseDate || '-'}</td>
                                              <td className="px-3 py-2">{item.supplierId ? getSupplierName(item.supplierId) : '未知廠商'}</td>
                                              <td className="px-3 py-2">{product ? product.name : '未知商品'}</td>
                                              <td className="px-3 py-2 text-right">{item.quantity || 0}</td>
                                              <td className="px-3 py-2 text-right">NT$ {parseFloat(item.unitPrice || 0).toFixed(2)}</td>
                                              <td className="px-3 py-2 text-right font-semibold">NT$ {subtotal.toFixed(2)}</td>
                                              <td className="px-3 py-2 text-gray-500 text-xs">{item.note || '-'}</td>
                                            </tr>
                                          );
                                        })}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
