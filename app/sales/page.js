'use client';

import { useState, useEffect, Fragment, Suspense, useMemo } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import Navigation from '@/components/Navigation';
import ExportButtons from '@/components/ExportButtons';
import { EXPORT_CONFIGS } from '@/lib/export-columns';
import { useToast } from '@/context/ToastContext';
import { sortRows, useColumnSort, SortableTh } from '@/components/SortableTh';

function InvoicePageInner() {
  const router = useRouter();
  const { data: session } = useSession();
  const { showToast } = useToast();
  const isLoggedIn = !!session;
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState(null);
  const [products, setProducts] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [selectedItems, setSelectedItems] = useState([]); // 勾選的品項
  const [availableItems, setAvailableItems] = useState([]); // 可選的未核銷品項
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingItems, setLoadingItems] = useState(false);
  const [salesSaving, setSalesSaving] = useState(false);
  const [expandedInvoices, setExpandedInvoices] = useState(new Set()); // 追蹤展開的發票ID

  // 發票抬頭：連動系統設定 /api/settings/invoice-titles
  const [invoiceTitles, setInvoiceTitles] = useState([]); // [{ id, title }, ...]
  const [showTitleManager, setShowTitleManager] = useState(false);
  const [newTitleName, setNewTitleName] = useState('');

  // 搜尋廠商（列表篩選）
  const [searchSupplier, setSearchSupplier] = useState('');
  const [searchDateFrom, setSearchDateFrom] = useState('');
  const [searchDateTo, setSearchDateTo] = useState('');

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
    invoiceTitle: '', // 發票抬頭
    taxType: '應稅', // 營業稅類型
    invoiceAmount: '', // 發票金額（手動輸入）
    supplierDiscount: '0' // 廠商折讓金額（預設0元）
  });

  // System tax rate
  const [systemTaxRate, setSystemTaxRate] = useState(5);

  // 營業稅金額自動計算
  const taxAmount = (() => {
    const amount = parseFloat(formData.invoiceAmount) || 0;
    if (formData.taxType === '應稅') return amount * (systemTaxRate / 100);
    return 0;
  })();

  useEffect(() => {
    fetchProducts();
    fetchSuppliers();
    fetchInvoices();
    fetchSystemTaxRate();
    fetchInvoiceTitles();
  }, []);

  async function fetchInvoiceTitles() {
    try {
      const res = await fetch('/api/settings/invoice-titles', { credentials: 'include' });
      const data = await res.json().catch(() => []);
      if (res.ok && Array.isArray(data)) {
        setInvoiceTitles(data.map(t => ({ id: t.id, title: t.title || '' })).filter(t => t.title));
      }
    } catch (err) {
      console.error('載入發票抬頭失敗:', err);
    }
  }

  // 從網址 ?edit=id 連動開啟編輯表單（例如從財務頁「發票號」或「編輯」點入）
  const searchParams = useSearchParams();
  useEffect(() => {
    const editId = searchParams.get('edit');
    if (!editId) return;
    const id = parseInt(editId, 10);
    if (Number.isNaN(id)) return;
    let cancelled = false;
    fetch(`/api/sales/${id}`)
      .then(res => (res.ok ? res.json() : null))
      .then(invoice => {
        if (cancelled || !invoice) return;
        if (['草稿', '待出納', '已付款'].includes(invoice.paymentStatus)) {
          showToast(`此發票目前付款狀態為「${invoice.paymentStatus}」，不可修改發票內容。`, 'error');
          return;
        }
        handleEdit(invoice);
        setShowAddForm(true);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [searchParams.get('edit')]);

  async function fetchSystemTaxRate() {
    try {
      const res = await fetch('/api/settings');
      if (res.ok) {
        const data = await res.json();
        if (data.taxRate != null) setSystemTaxRate(Number(data.taxRate));
      }
    } catch { /* use default 5% */ }
  }

  async function fetchInvoices() {
    try {
      const response = await fetch('/api/sales/with-info');
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
      const response = await fetch('/api/products?all=true');
      const data = await response.json();
      setProducts(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('取得產品列表失敗:', error);
      setProducts([]);
    }
  }

  async function fetchSuppliers() {
    try {
      const response = await fetch('/api/suppliers?all=true');
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
        showToast('查詢完成，但沒有找到未核銷的進貨單品項。\n\n請檢查：\n1. 篩選條件是否正確\n2. 是否有建立進貨單資料\n3. 該品項是否已被核銷', 'info');
      }
    } catch (error) {
      console.error('取得未核銷品項失敗:', error);
      setAvailableItems([]);
      showToast('查詢失敗：' + (error.message || '請稍後再試'), 'error');
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

  const filteredInvoicesForList = useMemo(
    () =>
      invoices.filter((inv) => {
        if (searchSupplier && !(inv.supplierName || '').toLowerCase().includes(searchSupplier.toLowerCase())) return false;
        const invDate = inv.invoiceDate || inv.salesDate || '';
        if (searchDateFrom && invDate < searchDateFrom) return false;
        if (searchDateTo && invDate > searchDateTo) return false;
        return true;
      }),
    [invoices, searchSupplier, searchDateFrom, searchDateTo]
  );
  const { sortKey: saleInvKey, sortDir: saleInvDir, toggleSort: toggleSaleInv } = useColumnSort('invoiceDate', 'desc');
  const sortedInvoicesForList = useMemo(
    () =>
      sortRows(filteredInvoicesForList, saleInvKey, saleInvDir, {
        warehouse: (i) => i.warehouse || '',
        invoiceTitle: (i) => i.invoiceTitle || '',
        supplierName: (i) => i.supplierName || '',
        invoiceNo: (i) => i.invoiceNo || i.salesNo || '',
        invoiceDate: (i) => i.invoiceDate || i.salesDate || '',
        itemCount: (i) => i.items?.length || 0,
        totalAmount: (i) => Number(i.totalAmount || (Number(i.amount || 0) + Number(i.tax || 0)) || 0),
        paymentStatus: (i) => i.paymentStatus || '',
      }),
    [filteredInvoicesForList, saleInvKey, saleInvDir]
  );

  function handleItemToggle(item) {
    const isSelected = selectedItems.some(selected => selected.id === item.id);
    let newItems;
    if (isSelected) {
      newItems = selectedItems.filter(selected => selected.id !== item.id);
    } else {
      newItems = [...selectedItems, { ...item, salesAmount: item.subtotal || 0 }];
    }
    setSelectedItems(newItems);
    const subtotal = newItems.reduce((sum, i) => sum + parseFloat(i.salesAmount || i.subtotal || 0), 0);
    setFormData(prev => ({ ...prev, invoiceAmount: subtotal > 0 ? subtotal.toFixed(2) : '' }));
  }

  function handleSelectAll() {
    let newItems;
    if (selectedItems.length === availableItems.length) {
      newItems = [];
    } else {
      newItems = availableItems.map(item => ({ ...item, salesAmount: item.subtotal || 0 }));
    }
    setSelectedItems(newItems);
    const subtotal = newItems.reduce((sum, i) => sum + parseFloat(i.salesAmount || i.subtotal || 0), 0);
    setFormData(prev => ({ ...prev, invoiceAmount: subtotal > 0 ? subtotal.toFixed(2) : '' }));
  }

  function calculateTotal() {
    const subtotal = selectedItems.reduce((sum, item) => {
      return sum + parseFloat(item.salesAmount || item.subtotal || 0);
    }, 0);
    return {
      subtotal: subtotal.toFixed(2)
    };
  }

  async function handleAddTitle() {
    const title = newTitleName.trim();
    if (!title) return;
    if (invoiceTitles.some(t => t.title === title)) {
      showToast('此抬頭已存在', 'error');
      return;
    }
    try {
      const res = await fetch('/api/settings/invoice-titles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ title })
      });
      if (res.ok) {
        await fetchInvoiceTitles();
        setNewTitleName('');
      } else {
        const err = await res.json().catch(() => ({}));
        showToast(err.error?.message || '新增發票抬頭失敗', 'error');
      }
    } catch (err) {
      showToast('新增發票抬頭失敗', 'error');
    }
  }

  async function handleDeleteTitle(title) {
    if (!confirm(`確定要刪除「${title}」嗎？`)) return;
    const item = invoiceTitles.find(t => t.title === title);
    if (!item) return;
    try {
      const res = await fetch(`/api/settings/invoice-titles?id=${item.id}`, { method: 'DELETE', credentials: 'include' });
      if (res.ok) {
        await fetchInvoiceTitles();
        if (formData.invoiceTitle === title) {
          setFormData(prev => ({ ...prev, invoiceTitle: '' }));
        }
      } else {
        showToast('刪除失敗', 'error');
      }
    } catch {
      showToast('刪除失敗', 'error');
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();

    if (selectedItems.length === 0) {
      showToast('請至少勾選一項進貨單品項', 'error');
      return;
    }

    if (!formData.invoiceNo) {
      showToast('請輸入發票號碼', 'error');
      return;
    }

    setSalesSaving(true);
    try {
      const totals = calculateTotal();
      const invoiceAmountVal = parseFloat(formData.invoiceAmount) || 0;
      const discountVal = parseFloat(formData.supplierDiscount) || 0;
      const salesTotalVal = parseFloat(totals.subtotal) || 0;

      // 驗證：銷售金額 + 營業稅金額 - 廠商折讓金額 是否等於 發票金額
      const expectedInvoiceAmount = salesTotalVal + taxAmount - discountVal;
      if (Math.abs(expectedInvoiceAmount - invoiceAmountVal) > 0.01) {
        showToast(
          `金額驗證不通過！\n\n` +
          `銷售金額合計：NT$ ${salesTotalVal.toFixed(2)}\n` +
          `+ 營業稅金額：NT$ ${taxAmount.toFixed(2)}\n` +
          `- 廠商折讓金額：NT$ ${discountVal.toFixed(2)}\n` +
          `= NT$ ${expectedInvoiceAmount.toFixed(2)}\n\n` +
          `但發票金額為：NT$ ${invoiceAmountVal.toFixed(2)}\n\n` +
          `兩者不相等，請確認金額後再儲存。`,
          'error'
        );
        return;
      }

      const invoiceData = {
        ...formData,
        items: selectedItems.map(item => ({
          purchaseItemId: item.purchaseItemId,
          purchaseId: item.purchaseId,
          purchaseNo: item.purchaseNo,
          purchaseDate: item.purchaseDate,
          supplierId: item.supplierId,
          productId: item.productId,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          salesAmount: parseFloat(item.salesAmount || item.subtotal || 0),
          note: item.note || ''
        })),
        amount: parseFloat(totals.subtotal),
        invoiceAmount: invoiceAmountVal,
        tax: taxAmount,
        supplierDiscount: discountVal,
        totalAmount: invoiceAmountVal + taxAmount - discountVal
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
        const wantAddMore = confirm(`發票${isEditing ? '更新' : '登錄'}成功！\n\n是否要繼續新增發票？`);
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
          invoiceTitle: '',
          taxType: '應稅',
          invoiceAmount: '',
          supplierDiscount: '0'
        });
        fetchInvoices();
        if (!wantAddMore) {
          setShowAddForm(false);
        }
      } else {
        const error = await response.json();
        showToast(`${isEditing ? '更新' : '登錄'}失敗：` + (error.error || '未知錯誤'), 'error');
      }
    } catch (error) {
      console.error(`${editingInvoice ? '更新' : '登錄'}發票失敗:`, error);
      showToast(`${editingInvoice ? '更新' : '登錄'}發票失敗，請稍後再試`, 'error');
    } finally {
      setSalesSaving(false);
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

  function handleEdit(invoice) {
    // 若發票付款狀態為草稿 / 待出納 / 已付款，不可再修改
    if (['草稿', '待出納', '已付款'].includes(invoice.paymentStatus)) {
      showToast(`此發票目前付款狀態為「${invoice.paymentStatus}」，不可修改發票內容。`, 'error');
      return;
    }
    setEditingInvoice(invoice);
    setFormData({
      invoiceNo: invoice.invoiceNo || '',
      invoiceDate: invoice.invoiceDate || new Date().toISOString().split('T')[0],
      invoiceTitle: invoice.invoiceTitle || '',
      taxType: invoice.taxType || '應稅',
      invoiceAmount: invoice.invoiceAmount != null ? String(invoice.invoiceAmount) : String(invoice.amount || ''),
      supplierDiscount: invoice.supplierDiscount != null ? String(invoice.supplierDiscount) : '0'
    });
    setSelectedItems(invoice.items || []);
    setShowAddForm(true);
  }

  async function handleDelete(invoiceId) {
    if (!confirm('確定要刪除這張發票嗎？刪除後相關進貨單品項將可重新核銷。')) return;
    
    try {
      const response = await fetch(`/api/sales/${invoiceId}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        showToast('發票刪除成功！', 'success');
        fetchInvoices();
      } else {
        const error = await response.json();
        showToast('刪除失敗：' + (error.error || '未知錯誤'), 'error');
      }
    } catch (error) {
      console.error('刪除發票失敗:', error);
      showToast('刪除發票失敗，請稍後再試', 'error');
    }
  }

  const totals = selectedItems.length > 0 ? calculateTotal() : { subtotal: '0' };

  return (
    <div className="min-h-screen page-bg-sales">
      <Navigation borderColor="border-green-500" />

      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* 標題與操作 */}
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold">發票登錄/核銷</h2>
          <div className="flex items-center gap-3">
            <ExportButtons
              data={invoices.map(inv => ({
                ...inv,
                itemCount: inv.items?.length || 0,
                totalWithTax: (parseFloat(inv.amount) || 0) + (parseFloat(inv.taxAmount) || 0),
              }))}
              columns={EXPORT_CONFIGS.sales.columns}
              exportName={EXPORT_CONFIGS.sales.filename}
              title="發票登錄/核銷"
              sheetName="發票紀錄"
            />
            {isLoggedIn && (
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
            )}
          </div>
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
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => handleItemToggle(item)}
                                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                />
                              </td>
                              <td className="px-3 py-2 text-sm">{item.warehouse || '-'}</td>
                              <td className="px-3 py-2 text-sm font-medium">
                                <button
                                  type="button"
                                  onClick={() => router.push(`/purchasing?editPurchaseNo=${encodeURIComponent(item.purchaseNo)}`)}
                                  className="text-blue-600 hover:underline"
                                >
                                  {item.purchaseNo}
                                </button>
                              </td>
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
                                <button
                                  type="button"
                                  onClick={() => router.push(`/purchasing?editPurchaseNo=${encodeURIComponent(item.purchaseNo)}`)}
                                  className="text-blue-600 hover:underline font-medium"
                                >
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
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-sm font-medium text-gray-700">
                      發票抬頭 *
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowTitleManager(!showTitleManager)}
                      className="text-xs text-blue-600 hover:underline"
                    >
                      管理選項
                    </button>
                  </div>
                  <select
                    required
                    value={formData.invoiceTitle}
                    onChange={(e) => setFormData({ ...formData, invoiceTitle: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
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
                      <button
                        type="button"
                        onClick={() => setShowTitleManager(false)}
                        className="text-gray-400 hover:text-gray-600 text-sm"
                      >
                        收起
                      </button>
                    </div>
                    <div className="flex gap-2 mb-3">
                      <input
                        type="text"
                        placeholder="輸入新抬頭名稱..."
                        value={newTitleName}
                        onChange={(e) => setNewTitleName(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddTitle())}
                        className="flex-1 px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <button
                        type="button"
                        onClick={handleAddTitle}
                        className="px-4 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                      >
                        新增
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {invoiceTitles.map(t => (
                        <span key={t.id} className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-50 text-blue-700 text-xs rounded-full border border-blue-200">
                          {t.title}
                          <button
                            type="button"
                            onClick={() => handleDeleteTitle(t.title)}
                            className="text-blue-400 hover:text-red-500 font-bold ml-0.5"
                          >
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
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    發票金額（手動輸入） *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={formData.invoiceAmount}
                    onChange={(e) => setFormData({ ...formData, invoiceAmount: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="輸入發票金額"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    營業稅類型 *
                  </label>
                  <select
                    required
                    value={formData.taxType}
                    onChange={(e) => setFormData({ ...formData, taxType: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="應稅">應稅</option>
                    <option value="零稅率">零稅率</option>
                    <option value="免稅">免稅</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    營業稅金額（自動計算）
                  </label>
                  <input
                    type="text"
                    readOnly
                    value={`NT$ ${taxAmount.toFixed(2)}`}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-100 text-gray-700"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    廠商折讓金額 *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={formData.supplierDiscount}
                    onChange={(e) => setFormData({ ...formData, supplierDiscount: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="輸入廠商折讓金額"
                  />
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
                      invoiceTitle: '',
                      taxType: '應稅',
                      invoiceAmount: '',
                      supplierDiscount: '',
                      status: '待核銷'
                    });
                  }}
                  className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={selectedItems.length === 0 || salesSaving}
                  className={`px-6 py-2 rounded-lg ${
                    selectedItems.length === 0 || salesSaving
                      ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                      : 'bg-blue-600 text-white hover:bg-blue-700'
                  } disabled:opacity-50`}
                >
                  {salesSaving ? '儲存中…' : '儲存'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* 搜尋列：廠商 + 日期區間 */}
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <input
            type="text"
            value={searchSupplier}
            onChange={(e) => setSearchSupplier(e.target.value)}
            placeholder="搜尋廠商名稱..."
            className="w-full max-w-xs px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
          />
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-600">起始日期</label>
            <input
              type="date"
              value={searchDateFrom}
              onChange={(e) => setSearchDateFrom(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-600">結束日期</label>
            <input
              type="date"
              value={searchDateTo}
              onChange={(e) => setSearchDateTo(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            />
          </div>
          {(searchSupplier || searchDateFrom || searchDateTo) && (
            <button
              onClick={() => { setSearchSupplier(''); setSearchDateFrom(''); setSearchDateTo(''); }}
              className="px-3 py-2 text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
            >
              清除篩選
            </button>
          )}
        </div>

        {/* 列表 */}
        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <SortableTh label="館別" colKey="warehouse" sortKey={saleInvKey} sortDir={saleInvDir} onSort={toggleSaleInv} className="px-4 py-3" />
                <SortableTh label="發票抬頭" colKey="invoiceTitle" sortKey={saleInvKey} sortDir={saleInvDir} onSort={toggleSaleInv} className="px-4 py-3" />
                <SortableTh label="廠商" colKey="supplierName" sortKey={saleInvKey} sortDir={saleInvDir} onSort={toggleSaleInv} className="px-4 py-3" />
                <SortableTh label="發票號" colKey="invoiceNo" sortKey={saleInvKey} sortDir={saleInvDir} onSort={toggleSaleInv} className="px-4 py-3" />
                <SortableTh label="發票日期" colKey="invoiceDate" sortKey={saleInvKey} sortDir={saleInvDir} onSort={toggleSaleInv} className="px-4 py-3" />
                <SortableTh label="品項數" colKey="itemCount" sortKey={saleInvKey} sortDir={saleInvDir} onSort={toggleSaleInv} className="px-4 py-3" />
                <SortableTh label="總金額" colKey="totalAmount" sortKey={saleInvKey} sortDir={saleInvDir} onSort={toggleSaleInv} className="px-4 py-3" align="right" />
                <SortableTh label="付款狀態" colKey="paymentStatus" sortKey={saleInvKey} sortDir={saleInvDir} onSort={toggleSaleInv} className="px-4 py-3" />
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {loading ? (
                <tr>
                  <td colSpan="9" className="px-4 py-8 text-center text-gray-500">
                    載入中...
                  </td>
                </tr>
              ) : invoices.length === 0 ? (
                <tr>
                  <td colSpan="9" className="px-4 py-8 text-center text-gray-500">
                    尚無發票資料
                  </td>
                </tr>
              ) : filteredInvoicesForList.length === 0 ? (
                <tr>
                  <td colSpan="9" className="px-4 py-8 text-center text-gray-500">
                    無符合篩選的發票
                  </td>
                </tr>
              ) : (
                sortedInvoicesForList.map((invoice, index) => {
                  const isExpanded = expandedInvoices.has(invoice.id);
                  return (
                    <Fragment key={invoice.id}>
                      <tr className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                        <td className="px-4 py-3 text-sm">{invoice.warehouse || '-'}</td>
                        <td className="px-4 py-3 text-sm">{invoice.invoiceTitle || '-'}</td>
                        <td className="px-4 py-3 text-sm">{invoice.supplierName || '-'}</td>
                        <td className="px-4 py-3 text-sm">{invoice.invoiceNo || invoice.salesNo}</td>
                        <td className="px-4 py-3 text-sm">{invoice.invoiceDate || invoice.salesDate}</td>
                        <td className="px-4 py-3 text-sm">{invoice.items ? invoice.items.length : 0} 項</td>
                        <td className="px-4 py-3 text-sm font-semibold">
                          NT$ {parseFloat(invoice.totalAmount || invoice.amount + invoice.tax || 0).toFixed(2)}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <span className={`px-2 py-1 rounded text-xs ${
                            invoice.paymentStatus === '已付款' ? 'bg-green-100 text-green-800' :
                            invoice.paymentStatus === '待出納' ? 'bg-yellow-100 text-yellow-800' :
                            invoice.paymentStatus === '草稿' ? 'bg-gray-100 text-gray-800' :
                            'bg-red-100 text-red-800'
                          }`}>
                            {invoice.paymentStatus || '未付款'}
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
                            {isLoggedIn && (
                              <>
                                {!['草稿', '待出納', '已付款'].includes(invoice.paymentStatus) && (
                                  <button
                                    onClick={() => handleEdit(invoice)}
                                    className="text-green-600 hover:underline text-sm"
                                  >
                                    編輯
                                  </button>
                                )}
                                {!['草稿', '待出納', '已付款'].includes(invoice.paymentStatus) && (
                                  <button
                                    onClick={() => handleDelete(invoice.id)}
                                    className="text-red-600 hover:underline text-sm"
                                  >
                                    刪除
                                  </button>
                                )}
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                      {/* 展開的詳細資訊 */}
                      {isExpanded && (
                        <tr className="bg-blue-50">
                          <td colSpan="9" className="px-4 py-4">
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
                                              <td className="px-3 py-2 font-medium">
                                                {item.purchaseNo ? (
                                                  <button
                                                    type="button"
                                                    onClick={() => router.push(`/purchasing?editPurchaseNo=${encodeURIComponent(item.purchaseNo)}`)}
                                                    className="text-blue-600 hover:underline"
                                                  >
                                                    {item.purchaseNo}
                                                  </button>
                                                ) : '-'}
                                              </td>
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

export default function InvoicePage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-gray-500">載入中...</div>}>
      <InvoicePageInner />
    </Suspense>
  );
}
