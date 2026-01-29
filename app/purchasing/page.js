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
  // 館別和部門的對應關係
  const warehouseDepartments = {
    '麗格': ['總務部', '行銷部', '財務部'],
    '麗軒': ['總務部', '行銷部', '財務部'],
    '民宿': ['總務部', '行銷部', '財務部']
  };

  const [formData, setFormData] = useState({
    warehouse: '', // 館別
    department: '', // 部門
    supplierId: '',
    purchaseDate: new Date().toISOString().split('T')[0],
    paymentTerms: '月結',
    status: '待入庫'
  });
  const [newItem, setNewItem] = useState({
    productId: '',
    quantity: '',
    unitPrice: '',
    note: '' // 備註
  });

  useEffect(() => {
    fetchSuppliers();
    fetchProducts();
    fetchPurchases();
  }, []);

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
      paymentTerms: purchase.paymentTerms || '月結',
      status: purchase.status
    });
    
    // 載入現有明細
    const purchaseItems = purchase.items.map(item => {
      const product = products.find(p => p.id === item.productId);
      return {
        productId: item.productId.toString(),
        quantity: item.quantity.toString(),
        unitPrice: item.unitPrice.toString(),
        note: item.note || '',
        productName: product ? product.name : '未知商品',
        subtotal: item.quantity * item.unitPrice
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

    setItems([...items, {
      ...newItem,
      productName: product.name,
      subtotal
    }]);

    setNewItem({
      productId: '',
      quantity: '',
      unitPrice: '',
      note: ''
    });
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
          note: item.note || ''
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
          paymentTerms: '月結',
          status: '待入庫'
        });
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
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    館別 *
                  </label>
                  <select
                    required
                    value={formData.warehouse}
                    onChange={(e) => handleWarehouseChange(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">請先選擇館別...</option>
                    <option value="麗格">麗格</option>
                    <option value="麗軒">麗軒</option>
                    <option value="民宿">民宿</option>
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
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    廠商 *
                  </label>
                  <select
                    required
                    value={formData.supplierId}
                    onChange={(e) => setFormData({ ...formData, supplierId: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">選擇廠商...</option>
                    {suppliers.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
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
                  </select>
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
                    <option>待入庫</option>
                    <option>已入庫</option>
                    <option>已取消</option>
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
                          <th className="px-3 py-2 text-left text-sm font-medium text-gray-700">操作</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {items.map((item, index) => (
                          <tr key={index}>
                            <td className="px-3 py-2 text-sm">{item.productName}</td>
                            <td className="px-3 py-2 text-sm">{item.quantity}</td>
                            <td className="px-3 py-2 text-sm">NT$ {item.unitPrice}</td>
                            <td className="px-3 py-2 text-sm">NT$ {item.subtotal.toFixed(2)}</td>
                            <td className="px-3 py-2 text-sm text-gray-600">{item.note || '-'}</td>
                            <td className="px-3 py-2">
                              <button
                                type="button"
                                onClick={() => removeItem(index)}
                                className="text-red-600 hover:underline text-sm"
                              >
                                刪除
                              </button>
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
                    <div>
                      <select
                        value={newItem.productId}
                        onChange={(e) => setNewItem({ ...newItem, productId: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">選擇產品...</option>
                        {products.map(p => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </select>
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
                        新增
                      </button>
                    </div>
                  </div>
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
                    setFormData({
                      warehouse: '',
                      department: '',
                      supplierId: '',
                      purchaseDate: new Date().toISOString().split('T')[0],
                      paymentTerms: '月結',
                      status: '待入庫'
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
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">狀態</th>
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
                          <span className={`px-2 py-1 rounded text-xs ${
                            purchase.status === '已入庫' ? 'bg-green-100 text-green-800' :
                            purchase.status === '待入庫' ? 'bg-yellow-100 text-yellow-800' :
                            'bg-red-100 text-red-800'
                          }`}>
                            {purchase.status}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleViewDetails(purchase.id)}
                              className="text-blue-600 hover:underline text-sm"
                            >
                              {isExpanded ? '收起' : '查看'}
                            </button>
                            {isLoggedIn && (
                              <>
                                <button
                                  onClick={() => handleEdit(purchase)}
                                  className="text-green-600 hover:underline text-sm"
                                >
                                  編輯
                                </button>
                                <button
                                  onClick={() => handleDelete(purchase.id)}
                                  className="text-red-600 hover:underline text-sm"
                                >
                                  刪除
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr key={`${purchase.id}-details`}>
                          <td colSpan="8" className="px-4 py-4 bg-gray-50">
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
                                <div>
                                  <span className="text-sm font-medium text-gray-600">狀態：</span>
                                  <span className={`px-2 py-1 rounded text-xs ${
                                    purchase.status === '已入庫' ? 'bg-green-100 text-green-800' :
                                    purchase.status === '待入庫' ? 'bg-yellow-100 text-yellow-800' :
                                    'bg-red-100 text-red-800'
                                  }`}>
                                    {purchase.status}
                                  </span>
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
