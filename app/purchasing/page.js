'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import Navigation from '@/components/Navigation';

export default function PurchasingPage() {
  const { data: session } = useSession();
  const isLoggedIn = !!session;
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingPurchase, setEditingPurchase] = useState(null);
  const [suppliers, setSuppliers] = useState([]);
  const [products, setProducts] = useState([]);
  const [items, setItems] = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [allPurchases, setAllPurchases] = useState([]); // 所有進貨單（未篩選）
  const [loading, setLoading] = useState(true);
  const [expandedPurchaseId, setExpandedPurchaseId] = useState(null); // 展開的進貨單 ID
  const [filterData, setFilterData] = useState({
    supplierId: '',
    startDate: '',
    endDate: ''
  });
  // 館別和部門的對應關係（從 API 載入）
  const [warehouseDepartments, setWarehouseDepartments] = useState({});
  const [showWarehouseManager, setShowWarehouseManager] = useState(false);
  const [newWarehouseName, setNewWarehouseName] = useState('');
  const [newDeptName, setNewDeptName] = useState('');
  const [newDeptWarehouse, setNewDeptWarehouse] = useState('');

  const [formData, setFormData] = useState({
    warehouse: '', // 館別
    department: '', // 部門
    supplierId: '',
    purchaseDate: new Date().toISOString().split('T')[0],
    paymentTerms: '月結'
  });
  const [newItem, setNewItem] = useState({
    productId: '',
    quantity: '',
    unitPrice: '',
    note: '' // 備註
  });
  const [productSearch, setProductSearch] = useState('');
  const [showProductDropdown, setShowProductDropdown] = useState(false);
  const [recentPurchases, setRecentPurchases] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [supplierSearch, setSupplierSearch] = useState('');
  const [showSupplierDropdown, setShowSupplierDropdown] = useState(false);
  const [editingItemIndex, setEditingItemIndex] = useState(null);
  const [invoices, setInvoices] = useState([]); // 發票資料（用於判斷發票狀態）

  useEffect(() => {
    fetchSuppliers();
    fetchProducts();
    fetchPurchases();
    fetchWarehouseDepartments();
    fetchInvoices();
  }, []);

  // 從 URL 參數自動開啟編輯（從發票頁面跳轉過來）
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const editPurchaseNo = params.get('editPurchaseNo');
    if (editPurchaseNo && allPurchases.length > 0 && suppliers.length > 0 && products.length > 0) {
      const purchase = allPurchases.find(p => p.purchaseNo === editPurchaseNo);
      if (purchase) {
        handleEdit(purchase);
        // 清除 URL 參數，避免重複觸發
        window.history.replaceState({}, '', '/purchasing');
      }
    }
  }, [allPurchases, suppliers, products]);

  async function fetchInvoices() {
    try {
      const response = await fetch('/api/sales');
      const data = await response.json();
      setInvoices(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('取得發票資料失敗:', error);
      setInvoices([]);
    }
  }

  // 建立已核銷品項ID集合
  const invoicedItemIds = (() => {
    const ids = new Set();
    invoices.forEach(invoice => {
      if (invoice.items) {
        invoice.items.forEach(item => {
          if (item.purchaseItemId) {
            ids.add(item.purchaseItemId);
          }
        });
      }
    });
    return ids;
  })();

  // 檢查某個進貨品項是否已核銷
  function isItemInvoiced(purchaseId, itemIndex) {
    const itemId = `${purchaseId}-${itemIndex}`;
    return invoicedItemIds.has(itemId);
  }

  async function fetchWarehouseDepartments() {
    try {
      const response = await fetch('/api/warehouse-departments');
      const data = await response.json();
      setWarehouseDepartments(data || {});
    } catch (error) {
      console.error('取得館別部門失敗:', error);
    }
  }

  async function handleAddWarehouse() {
    if (!newWarehouseName.trim()) return;
    try {
      const response = await fetch('/api/warehouse-departments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'addWarehouse', name: newWarehouseName.trim() })
      });
      if (response.ok) {
        const data = await response.json();
        setWarehouseDepartments(data);
        setNewWarehouseName('');
      } else {
        const error = await response.json();
        alert(error.error || '新增失敗');
      }
    } catch (error) {
      alert('新增館別失敗');
    }
  }

  async function handleDeleteWarehouse(name) {
    if (!confirm(`確定要刪除館別「${name}」及其所有部門嗎？`)) return;
    try {
      const response = await fetch('/api/warehouse-departments', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'deleteWarehouse', name })
      });
      if (response.ok) {
        const data = await response.json();
        setWarehouseDepartments(data);
        if (formData.warehouse === name) {
          setFormData({ ...formData, warehouse: '', department: '' });
        }
      }
    } catch (error) {
      alert('刪除館別失敗');
    }
  }

  async function handleAddDepartment() {
    if (!newDeptWarehouse || !newDeptName.trim()) return;
    try {
      const response = await fetch('/api/warehouse-departments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'addDepartment', warehouse: newDeptWarehouse, name: newDeptName.trim() })
      });
      if (response.ok) {
        const data = await response.json();
        setWarehouseDepartments(data);
        setNewDeptName('');
      } else {
        const error = await response.json();
        alert(error.error || '新增失敗');
      }
    } catch (error) {
      alert('新增部門失敗');
    }
  }

  async function handleDeleteDepartment(warehouse, deptName) {
    if (!confirm(`確定要刪除「${warehouse}」的部門「${deptName}」嗎？`)) return;
    try {
      const response = await fetch('/api/warehouse-departments', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'deleteDepartment', warehouse, name: deptName })
      });
      if (response.ok) {
        const data = await response.json();
        setWarehouseDepartments(data);
        if (formData.warehouse === warehouse && formData.department === deptName) {
          setFormData({ ...formData, department: '' });
        }
      }
    } catch (error) {
      alert('刪除部門失敗');
    }
  }

  // 產品搜尋過濾（選擇廠商後只顯示該廠商的產品）
  const filteredProducts = products.filter(p => {
    // 如果已選擇廠商，只顯示該廠商的產品
    if (formData.supplierId) {
      if (p.supplierId !== parseInt(formData.supplierId)) return false;
    }
    if (!productSearch.trim()) return true;
    const keyword = productSearch.toLowerCase().trim();
    return (
      (p.name && p.name.toLowerCase().includes(keyword)) ||
      (p.code && p.code.toLowerCase().includes(keyword)) ||
      (p.category && p.category.toLowerCase().includes(keyword))
    );
  });

  // 廠商搜尋過濾
  const filteredSuppliers = suppliers.filter(s => {
    if (!supplierSearch.trim()) return true;
    const keyword = supplierSearch.toLowerCase().trim();
    return (
      (s.name && s.name.toLowerCase().includes(keyword)) ||
      (s.taxId && s.taxId.includes(keyword)) ||
      (s.contact && s.contact.toLowerCase().includes(keyword))
    );
  });

  // 點擊外部關閉下拉選單
  useEffect(() => {
    function handleClickOutside(event) {
      const productDropdown = document.querySelector('.product-search-container');
      if (productDropdown && !productDropdown.contains(event.target)) {
        setShowProductDropdown(false);
      }
      const supplierDropdown = document.querySelector('.supplier-search-container');
      if (supplierDropdown && !supplierDropdown.contains(event.target)) {
        setShowSupplierDropdown(false);
      }
    }
    if (showProductDropdown || showSupplierDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showProductDropdown, showSupplierDropdown]);

  async function fetchPurchases() {
    try {
      const response = await fetch('/api/purchasing');
      const data = await response.json();
      const purchasesList = Array.isArray(data) ? data : [];
      console.log('取得進貨單資料:', purchasesList.length, '筆');
      setAllPurchases(purchasesList);
      // 初始載入時，如果有篩選條件則應用，否則顯示全部
      if (filterData.supplierId || filterData.startDate || filterData.endDate) {
        applyFilters(purchasesList);
      } else {
        setPurchases(purchasesList); // 沒有篩選條件時顯示全部
      }
      setLoading(false);
    } catch (error) {
      console.error('取得進貨單列表失敗:', error);
      setAllPurchases([]);
      setPurchases([]);
      setLoading(false);
    }
  }

  function applyFilters(data) {
    let filtered = [...data];

    // 篩選廠商
    if (filterData.supplierId) {
      filtered = filtered.filter(p => p.supplierId === parseInt(filterData.supplierId));
    }

    // 篩選日期範圍
    if (filterData.startDate) {
      filtered = filtered.filter(p => p.purchaseDate >= filterData.startDate);
    }
    if (filterData.endDate) {
      filtered = filtered.filter(p => p.purchaseDate <= filterData.endDate);
    }

    setPurchases(filtered);
  }

  function handleFilterChange() {
    applyFilters(allPurchases);
  }

  function handleResetFilter() {
    setFilterData({
      supplierId: '',
      startDate: '',
      endDate: ''
    });
    setPurchases(allPurchases);
  }

  function getSupplierName(supplierId) {
    const supplier = suppliers.find(s => s.id === supplierId);
    return supplier ? supplier.name : '未知廠商';
  }

  function handleViewDetails(purchaseId) {
    // 切換展開/收回狀態
    if (expandedPurchaseId === purchaseId) {
      setExpandedPurchaseId(null);
    } else {
      setExpandedPurchaseId(purchaseId);
    }
  }

  function handleEdit(purchase) {
    setEditingPurchase(purchase);
    setShowAddForm(true);
    setFormData({
      warehouse: purchase.warehouse || '',
      department: purchase.department || '',
      supplierId: purchase.supplierId.toString(),
      purchaseDate: purchase.purchaseDate,
      paymentTerms: purchase.paymentTerms || '月結'
    });
    const supplier = suppliers.find(s => s.id === purchase.supplierId);
    setSupplierSearch(supplier ? supplier.name : '');

    // 載入現有明細
    const purchaseItems = purchase.items.map((item, idx) => {
      const product = products.find(p => p.id === item.productId);
      const itemStatus = item.status || (product ? (product.isInStock ? '待入庫' : '不需入庫') : '不需入庫');
      return {
        productId: item.productId.toString(),
        quantity: item.quantity.toString(),
        unitPrice: item.unitPrice.toString(),
        note: item.note || '',
        productName: product ? product.name : '未知商品',
        subtotal: item.quantity * item.unitPrice,
        status: itemStatus,
        originalIndex: idx // 保留原始索引用於發票狀態檢查
      };
    });
    setItems(purchaseItems);
  }

  // 當館別改變時，清空部門選項
  function handleWarehouseChange(warehouse) {
    setFormData({
      ...formData,
      warehouse,
      department: '' // 清空部門選擇
    });
  }

  async function handleDelete(purchaseId) {
    if (!confirm('確定要刪除這張進貨單嗎？')) return;
    
    try {
      const response = await fetch(`/api/purchasing/${purchaseId}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        alert('進貨單刪除成功！');
        // 從所有資料中移除
        const updatedList = allPurchases.filter(p => p.id !== purchaseId);
        setAllPurchases(updatedList);
        // 重新應用篩選條件
        if (filterData.supplierId || filterData.startDate || filterData.endDate) {
          applyFilters(updatedList);
        } else {
          setPurchases(updatedList);
        }
      } else {
        const error = await response.json();
        alert('刪除失敗：' + (error.error || '未知錯誤'));
      }
    } catch (error) {
      console.error('刪除進貨單失敗:', error);
      alert('刪除進貨單失敗，請稍後再試');
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

  async function fetchRecentPurchases(productId) {
    setLoadingHistory(true);
    try {
      const response = await fetch(`/api/products/${productId}/purchases`);
      if (response.ok) {
        const data = await response.json();
        setRecentPurchases((data.purchases || []).slice(0, 3));
      } else {
        setRecentPurchases([]);
      }
    } catch (error) {
      console.error('取得產品歷史採購記錄失敗:', error);
      setRecentPurchases([]);
    } finally {
      setLoadingHistory(false);
    }
  }

  function addItem() {
    if (!newItem.productId || !newItem.quantity || !newItem.unitPrice) {
      alert('請填寫完整的商品資訊');
      return;
    }

    const product = products.find(p => p.id === parseInt(newItem.productId));
    if (!product) {
      alert('找不到選定的產品');
      return;
    }

    const quantity = parseFloat(newItem.quantity);
    const unitPrice = parseFloat(newItem.unitPrice);
    const subtotal = quantity * unitPrice;
    const itemStatus = product.isInStock ? '待入庫' : '不需入庫';

    setItems([...items, {
      ...newItem,
      productName: product.name,
      subtotal,
      status: itemStatus
    }]);

    setNewItem({
      productId: '',
      quantity: '',
      unitPrice: '',
      note: ''
    });
    setProductSearch('');
    setRecentPurchases([]);
  }

  function removeItem(index) {
    setItems(items.filter((_, i) => i !== index));
  }

  function calculateTotal() {
    const subtotal = items.reduce((sum, item) => sum + (item.subtotal || 0), 0);
    
    return {
      subtotal: subtotal.toFixed(2),
      total: subtotal.toFixed(2)
    };
  }

  async function handleSubmit(e) {
    e.preventDefault();

    if (items.length === 0) {
      alert('請至少新增一項商品');
      return;
    }

    try {
      const totals = calculateTotal();
      // 驗證必填欄位
      if (!formData.warehouse) {
        alert('請選擇館別');
        return;
      }
      if (!formData.department) {
        alert('請選擇部門');
        return;
      }

      const purchaseData = {
        ...formData,
        items: items.map(item => ({
          productId: parseInt(item.productId),
          quantity: parseFloat(item.quantity),
          unitPrice: parseFloat(item.unitPrice),
          note: item.note || '',
          status: item.status || '不需入庫'
        })),
        amount: parseFloat(totals.total), // 金額
        tax: 0, // 稅額設為 0
        totalAmount: parseFloat(totals.total) // 總金額
      };

      const isEditing = !!editingPurchase;
      const url = isEditing ? `/api/purchasing/${editingPurchase.id}` : '/api/purchasing';
      const method = isEditing ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method: method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(purchaseData)
      });

      if (response.ok) {
        alert(`進貨單${isEditing ? '更新' : '新增'}成功！`);
        setShowAddForm(false);
        setEditingPurchase(null);
        setItems([]);
        setFormData({
          warehouse: '',
          department: '',
          supplierId: '',
          purchaseDate: new Date().toISOString().split('T')[0],
          paymentTerms: '月結'
        });
        setSupplierSearch('');
        fetchPurchases();
        // 重新應用篩選條件
        setTimeout(() => {
          if (filterData.supplierId || filterData.startDate || filterData.endDate) {
            handleFilterChange();
          }
        }, 100);
      } else {
        const error = await response.json();
        alert(`${isEditing ? '更新' : '新增'}失敗：` + (error.error || '未知錯誤'));
      }
    } catch (error) {
      console.error(`${editingPurchase ? '更新' : '新增'}進貨單失敗:`, error);
      alert(`${editingPurchase ? '更新' : '新增'}進貨單失敗，請稍後再試`);
    }
  }

  const totals = items.length > 0 ? calculateTotal() : { subtotal: '0', total: '0' };

  return (
    <div className="min-h-screen page-bg-purchasing">
      <Navigation borderColor="border-orange-500" />

      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* 標題與操作 */}
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold">進貨單管理</h2>
          {isLoggedIn && (
            <button
              onClick={() => setShowAddForm(!showAddForm)}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
            >
              ➕ 新增進貨單
            </button>
          )}
        </div>

        {/* 新增進貨單表單 */}
        {showAddForm && (
          <div className="bg-white rounded-lg shadow-sm p-6 mb-6 border-2 border-blue-200">
            <h3 className="text-lg font-semibold mb-4">{editingPurchase ? '編輯進貨單' : '新增進貨單'}</h3>
            <form onSubmit={handleSubmit}>
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-sm font-medium text-gray-700">
                      館別 *
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowWarehouseManager(!showWarehouseManager)}
                      className="text-xs text-blue-600 hover:underline"
                    >
                      管理選項
                    </button>
                  </div>
                  <select
                    required
                    value={formData.warehouse}
                    onChange={(e) => handleWarehouseChange(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">請先選擇館別...</option>
                    {Object.keys(warehouseDepartments).map(w => (
                      <option key={w} value={w}>{w}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    部門 *
                  </label>
                  <select
                    required
                    value={formData.department}
                    onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                    disabled={!formData.warehouse}
                    className={`w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                      !formData.warehouse ? 'bg-gray-100 cursor-not-allowed' : ''
                    }`}
                  >
                    <option value="">
                      {formData.warehouse ? '選擇部門...' : '請先選擇館別'}
                    </option>
                    {formData.warehouse && warehouseDepartments[formData.warehouse]?.map(dept => (
                      <option key={dept} value={dept}>{dept}</option>
                    ))}
                  </select>
                </div>

                {/* 館別/部門管理面板 */}
                {showWarehouseManager && (
                  <div className="col-span-2 border border-gray-300 rounded-lg p-4 bg-gray-50">
                    <div className="flex justify-between items-center mb-3">
                      <h4 className="text-sm font-semibold text-gray-700">館別 / 部門管理</h4>
                      <button
                        type="button"
                        onClick={() => setShowWarehouseManager(false)}
                        className="text-gray-400 hover:text-gray-600 text-sm"
                      >
                        收起
                      </button>
                    </div>

                    {/* 新增館別 */}
                    <div className="flex gap-2 mb-3">
                      <input
                        type="text"
                        placeholder="輸入新館別名稱..."
                        value={newWarehouseName}
                        onChange={(e) => setNewWarehouseName(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddWarehouse())}
                        className="flex-1 px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <button
                        type="button"
                        onClick={handleAddWarehouse}
                        className="px-4 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                      >
                        新增館別
                      </button>
                    </div>

                    {/* 新增部門 */}
                    <div className="flex gap-2 mb-4">
                      <select
                        value={newDeptWarehouse}
                        onChange={(e) => setNewDeptWarehouse(e.target.value)}
                        className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">選擇館別</option>
                        {Object.keys(warehouseDepartments).map(w => (
                          <option key={w} value={w}>{w}</option>
                        ))}
                      </select>
                      <input
                        type="text"
                        placeholder="輸入新部門名稱..."
                        value={newDeptName}
                        onChange={(e) => setNewDeptName(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddDepartment())}
                        className="flex-1 px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <button
                        type="button"
                        onClick={handleAddDepartment}
                        disabled={!newDeptWarehouse}
                        className={`px-4 py-1.5 text-sm rounded-lg ${newDeptWarehouse ? 'bg-green-600 text-white hover:bg-green-700' : 'bg-gray-300 text-gray-500 cursor-not-allowed'}`}
                      >
                        新增部門
                      </button>
                    </div>

                    {/* 現有選項列表 */}
                    <div className="space-y-2">
                      {Object.entries(warehouseDepartments).map(([warehouse, departments]) => (
                        <div key={warehouse} className="bg-white rounded-lg border border-gray-200 p-3">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-semibold text-gray-800">{warehouse}</span>
                            <button
                              type="button"
                              onClick={() => handleDeleteWarehouse(warehouse)}
                              className="text-xs text-red-500 hover:text-red-700"
                            >
                              刪除館別
                            </button>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {departments.length > 0 ? departments.map(dept => (
                              <span key={dept} className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-50 text-blue-700 text-xs rounded-full border border-blue-200">
                                {dept}
                                <button
                                  type="button"
                                  onClick={() => handleDeleteDepartment(warehouse, dept)}
                                  className="text-blue-400 hover:text-red-500 font-bold ml-0.5"
                                >
                                  x
                                </button>
                              </span>
                            )) : (
                              <span className="text-xs text-gray-400">尚無部門</span>
                            )}
                          </div>
                        </div>
                      ))}
                      {Object.keys(warehouseDepartments).length === 0 && (
                        <p className="text-xs text-gray-400 text-center py-2">尚無館別資料</p>
                      )}
                    </div>
                  </div>
                )}
                <div className="relative supplier-search-container">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    廠商 *
                  </label>
                  <input
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
                              // 切換廠商時清空已選的產品搜尋
                              setProductSearch('');
                              setNewItem({ productId: '', quantity: '', unitPrice: '', note: '' });
                              setRecentPurchases([]);
                            }}
                            className={`w-full text-left px-3 py-2 text-sm hover:bg-blue-50 border-b border-gray-100 last:border-b-0 ${
                              formData.supplierId === s.id.toString() ? 'bg-blue-50 text-blue-700' : ''
                            }`}
                          >
                            <span className="font-medium">{s.name}</span>
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
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    進貨日期 *
                  </label>
                  <input
                    type="date"
                    required
                    value={formData.purchaseDate}
                    onChange={(e) => setFormData({ ...formData, purchaseDate: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    付款條件
                  </label>
                  <select
                    value={formData.paymentTerms}
                    onChange={(e) => setFormData({ ...formData, paymentTerms: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option>月結</option>
                    <option>現金</option>
                    <option>支票</option>
                    <option>轉帳</option>
                  </select>
                </div>
              </div>

              {/* 進貨明細 */}
              <div className="mb-6">
                <h4 className="text-md font-semibold mb-3">進貨明細</h4>
                <div className="border rounded-lg p-4 mb-4">
                  {items.length > 0 ? (
                    <table className="w-full">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-3 py-2 text-left text-sm font-medium text-gray-700">產品</th>
                          <th className="px-3 py-2 text-left text-sm font-medium text-gray-700">數量</th>
                          <th className="px-3 py-2 text-left text-sm font-medium text-gray-700">單價</th>
                          <th className="px-3 py-2 text-left text-sm font-medium text-gray-700">小計</th>
                          <th className="px-3 py-2 text-left text-sm font-medium text-gray-700">備註</th>
                          <th className="px-3 py-2 text-left text-sm font-medium text-gray-700">入庫狀態</th>
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
                                <input
                                  type="number"
                                  step="0.01"
                                  value={item.quantity}
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
                                <input
                                  type="number"
                                  step="0.01"
                                  value={item.unitPrice}
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
                              <select
                                value={item.status}
                                onChange={(e) => {
                                  const newItems = [...items];
                                  newItems[index] = { ...newItems[index], status: e.target.value };
                                  setItems(newItems);
                                }}
                                className={`px-2 py-1 rounded text-xs border ${
                                  item.status === '已入庫' ? 'bg-green-100 text-green-800 border-green-300' :
                                  item.status === '待入庫' ? 'bg-yellow-100 text-yellow-800 border-yellow-300' :
                                  'bg-gray-100 text-gray-800 border-gray-300'
                                }`}
                              >
                                <option value="待入庫">待入庫</option>
                                <option value="已入庫">已入庫</option>
                                <option value="不需入庫">不需入庫</option>
                              </select>
                            </td>
                            <td className="px-3 py-2">
                              {(() => {
                                const invoiced = editingPurchase && item.originalIndex !== undefined
                                  ? isItemInvoiced(editingPurchase.id, item.originalIndex)
                                  : false;
                                return (
                                  <span className={`px-2 py-1 rounded text-xs ${
                                    invoiced ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                                  }`}>
                                    {invoiced ? '已核銷' : '未核銷'}
                                  </span>
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
                                      <button
                                        type="button"
                                        onClick={() => setEditingItemIndex(null)}
                                        className="text-blue-600 hover:underline text-sm"
                                      >
                                        完成
                                      </button>
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={() => !itemInvoiced && setEditingItemIndex(index)}
                                        className={`text-sm ${itemInvoiced ? 'text-gray-400 cursor-not-allowed' : 'text-green-600 hover:underline cursor-pointer'}`}
                                        disabled={itemInvoiced}
                                        title={itemInvoiced ? '已核銷品項無法編輯' : ''}
                                      >
                                        編輯
                                      </button>
                                    )}
                                    <button
                                      type="button"
                                      onClick={() => {
                                        if (itemInvoiced) return;
                                        removeItem(index);
                                        if (editingItemIndex === index) setEditingItemIndex(null);
                                      }}
                                      className={`text-sm ${itemInvoiced ? 'text-gray-400 cursor-not-allowed' : 'text-red-600 hover:underline cursor-pointer'}`}
                                      disabled={itemInvoiced}
                                      title={itemInvoiced ? '已核銷品項無法刪除' : ''}
                                    >
                                      刪除
                                    </button>
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
                  <div className="grid grid-cols-5 gap-3 mb-3">
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
                                className={`w-full text-left px-3 py-2 text-sm hover:bg-blue-50 border-b border-gray-100 last:border-b-0 ${
                                  newItem.productId === p.id.toString() ? 'bg-blue-50 text-blue-700' : ''
                                }`}
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
                      <input
                        type="number"
                        step="0.01"
                        placeholder="數量"
                        value={newItem.quantity}
                        onChange={(e) => setNewItem({ ...newItem, quantity: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <input
                        type="number"
                        step="0.01"
                        placeholder="單價"
                        value={newItem.unitPrice}
                        onChange={(e) => setNewItem({ ...newItem, unitPrice: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <input
                        type="text"
                        placeholder="備註"
                        value={newItem.note}
                        onChange={(e) => setNewItem({ ...newItem, note: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <button
                        type="button"
                        onClick={addItem}
                        className="w-full px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                      >
                        新增（若無法新增，請先建檔）
                      </button>
                    </div>
                  </div>

                  {/* 最近三次採購記錄 */}
                  {newItem.productId && (
                    <div className="mt-3 border border-blue-200 rounded-lg bg-blue-50 p-3">
                      <h5 className="text-sm font-semibold text-blue-700 mb-2">
                        最近採購記錄（{productSearch}）
                      </h5>
                      {loadingHistory ? (
                        <p className="text-xs text-gray-500">載入中...</p>
                      ) : recentPurchases.length > 0 ? (
                        <table className="w-full text-sm">
                          <thead>
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
                              return recentPurchases.map((record, idx) => (
                                <tr key={idx} className="bg-white">
                                  <td className="px-3 py-1.5 text-xs">{record.purchaseDate}</td>
                                  <td className={`px-3 py-1.5 text-xs font-semibold ${record.unitPrice === minPrice ? 'text-red-600' : ''}`}>
                                    NT$ {record.unitPrice.toFixed(2)}
                                  </td>
                                  <td className="px-3 py-1.5 text-xs">{record.quantity}</td>
                                  <td className="px-3 py-1.5 text-xs">{record.supplierName}</td>
                                </tr>
                              ));
                            })()}
                          </tbody>
                        </table>
                      ) : (
                        <p className="text-xs text-gray-500">此產品尚無採購記錄</p>
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
                  onClick={() => {
                    setShowAddForm(false);
                    setEditingPurchase(null);
                    setItems([]);
                    setSupplierSearch('');
                    setFormData({
                      warehouse: '',
                      department: '',
                      supplierId: '',
                      purchaseDate: new Date().toISOString().split('T')[0],
                      paymentTerms: '月結'
                    });
                  }}
                  className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  儲存
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
              onChange={(e) => {
                setFilterData({ ...filterData, supplierId: e.target.value });
              }}
              className="px-3 py-2 border rounded"
            >
              <option value="">全部廠商</option>
              {suppliers.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            <input
              type="date"
              value={filterData.startDate}
              onChange={(e) => {
                setFilterData({ ...filterData, startDate: e.target.value });
              }}
              className="px-3 py-2 border rounded"
              placeholder="開始日期"
            />
            <span>~</span>
            <input
              type="date"
              value={filterData.endDate}
              onChange={(e) => {
                setFilterData({ ...filterData, endDate: e.target.value });
              }}
              className="px-3 py-2 border rounded"
              placeholder="結束日期"
            />
            <button
              onClick={handleFilterChange}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              查詢
            </button>
            {(filterData.supplierId || filterData.startDate || filterData.endDate) && (
              <button
                onClick={handleResetFilter}
                className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                清除
              </button>
            )}
            <span className="text-sm text-gray-600">
              顯示 {purchases.length} 筆（共 {allPurchases.length} 筆）
            </span>
          </div>
        </div>

        {/* 列表 */}
        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">單號</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">館別</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">部門</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">廠商</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">日期</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">總金額</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">入庫狀態</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">發票狀態</th>
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
              ) : purchases.length === 0 ? (
                <tr>
                  <td colSpan="9" className="px-4 py-8 text-center text-gray-500">
                    尚無進貨資料
                  </td>
                </tr>
              ) : (
                purchases.map((purchase, index) => {
                  const totalAmount = purchase.totalAmount || parseFloat(purchase.amount || 0);
                  const isExpanded = expandedPurchaseId === purchase.id;
                  return (
                    <>
                      <tr key={purchase.id} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                        <td className="px-4 py-3 text-sm">{purchase.purchaseNo}</td>
                        <td className="px-4 py-3 text-sm">{purchase.warehouse || '-'}</td>
                        <td className="px-4 py-3 text-sm">{purchase.department || '-'}</td>
                        <td className="px-4 py-3 text-sm">{getSupplierName(purchase.supplierId)}</td>
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
                              'bg-red-100 text-red-800'
                            }`}>
                              {purchase.status}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          {purchase.items && purchase.items.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {(() => {
                                let invoicedCount = 0;
                                let uninvoicedCount = 0;
                                purchase.items.forEach((item, idx) => {
                                  if (isItemInvoiced(purchase.id, idx)) {
                                    invoicedCount++;
                                  } else {
                                    uninvoicedCount++;
                                  }
                                });
                                return (
                                  <>
                                    {invoicedCount > 0 && (
                                      <span className="px-2 py-0.5 rounded text-xs bg-green-100 text-green-800">
                                        已核銷{invoicedCount > 1 ? ` x${invoicedCount}` : ''}
                                      </span>
                                    )}
                                    {uninvoicedCount > 0 && (
                                      <span className="px-2 py-0.5 rounded text-xs bg-red-100 text-red-800">
                                        未核銷{uninvoicedCount > 1 ? ` x${uninvoicedCount}` : ''}
                                      </span>
                                    )}
                                  </>
                                );
                              })()}
                            </div>
                          ) : (
                            <span className="px-2 py-1 rounded text-xs bg-red-100 text-red-800">未核銷</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleViewDetails(purchase.id)}
                              className="text-blue-600 hover:underline text-sm"
                            >
                              {isExpanded ? '收起' : '查看'}
                            </button>
                            {isLoggedIn && (() => {
                              const allInvoiced = purchase.items && purchase.items.length > 0 &&
                                purchase.items.every((_, idx) => isItemInvoiced(purchase.id, idx));
                              return (
                                <>
                                  <button
                                    onClick={() => !allInvoiced && handleEdit(purchase)}
                                    className={`text-sm ${allInvoiced ? 'text-gray-400 cursor-not-allowed' : 'text-green-600 hover:underline cursor-pointer'}`}
                                    disabled={allInvoiced}
                                    title={allInvoiced ? '已核銷的進貨單無法編輯' : ''}
                                  >
                                    編輯
                                  </button>
                                  <button
                                    onClick={() => !allInvoiced && handleDelete(purchase.id)}
                                    className={`text-sm ${allInvoiced ? 'text-gray-400 cursor-not-allowed' : 'text-red-600 hover:underline cursor-pointer'}`}
                                    disabled={allInvoiced}
                                    title={allInvoiced ? '已核銷的進貨單無法刪除' : ''}
                                  >
                                    刪除
                                  </button>
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
                                <div>
                                  <span className="text-sm font-medium text-gray-600">單號：</span>
                                  <span className="text-sm text-gray-800">{purchase.purchaseNo}</span>
                                </div>
                                <div>
                                  <span className="text-sm font-medium text-gray-600">館別：</span>
                                  <span className="text-sm text-gray-800">{purchase.warehouse || '未指定'}</span>
                                </div>
                                <div>
                                  <span className="text-sm font-medium text-gray-600">部門：</span>
                                  <span className="text-sm text-gray-800">{purchase.department || '未指定'}</span>
                                </div>
                                <div>
                                  <span className="text-sm font-medium text-gray-600">廠商：</span>
                                  <span className="text-sm text-gray-800">{getSupplierName(purchase.supplierId)}</span>
                                </div>
                                <div>
                                  <span className="text-sm font-medium text-gray-600">日期：</span>
                                  <span className="text-sm text-gray-800">{purchase.purchaseDate}</span>
                                </div>
                                <div>
                                  <span className="text-sm font-medium text-gray-600">付款條件：</span>
                                  <span className="text-sm text-gray-800">{purchase.paymentTerms || '月結'}</span>
                                </div>
                                <div>
                                  <span className="text-sm font-medium text-gray-600">總金額：</span>
                                  <span className="text-sm font-semibold text-blue-600">NT$ {totalAmount.toFixed(2)}</span>
                                </div>
                              </div>
                              <div className="mt-4">
                                <h5 className="text-md font-semibold mb-2 text-gray-800">商品明細</h5>
                                {purchase.items && purchase.items.length > 0 ? (
                                  <table className="w-full border-collapse">
                                    <thead>
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
                                                return (
                                                  <span className={`px-2 py-0.5 rounded text-xs ${
                                                    invoiced ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                                                  }`}>
                                                    {invoiced ? '已核銷' : '未核銷'}
                                                  </span>
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
      </main>
    </div>
  );
}
