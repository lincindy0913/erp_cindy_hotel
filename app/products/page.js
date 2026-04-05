'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import Navigation from '@/components/Navigation';
import ExportButtons from '@/components/ExportButtons';
import { EXPORT_CONFIGS } from '@/lib/export-columns';
import { useToast } from '@/context/ToastContext';

export default function ProductsPage() {
  const { data: session } = useSession();
  const { showToast } = useToast();
  const isLoggedIn = !!session;
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [productSaving, setProductSaving] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [accountingSubjects, setAccountingSubjects] = useState([]);
  const [accountingSearch, setAccountingSearch] = useState('');
  const [showAccountingDropdown, setShowAccountingDropdown] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(50);
  const [totalCount, setTotalCount] = useState(0);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [searchTimer, setSearchTimer] = useState(null);
  const [warehouseOptions, setWarehouseOptions] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('warehouseOptions');
      return saved ? JSON.parse(saved) : ['麗格', '麗軒', '民宿'];
    }
    return ['麗格', '麗軒', '民宿'];
  });
  const [newWarehouse, setNewWarehouse] = useState('');
  const [showWarehouseManager, setShowWarehouseManager] = useState(false);
  const [formData, setFormData] = useState({
    code: '',
    name: '',
    category: '',
    unit: '',
    costPrice: '',
    salesPrice: '',
    isInStock: false,
    warehouseLocation: '',
    accountingSubject: ''
  });

  useEffect(() => {
    fetchProducts(1, itemsPerPage, '');
    fetchAccountingSubjects();
  }, []);

  useEffect(() => {
    localStorage.setItem('warehouseOptions', JSON.stringify(warehouseOptions));
  }, [warehouseOptions]);

  // 點擊外部關閉會計科目下拉選單
  useEffect(() => {
    function handleClickOutside(event) {
      const dropdown = document.querySelector('.product-accounting-search');
      if (dropdown && !dropdown.contains(event.target)) {
        setShowAccountingDropdown(false);
      }
    }
    if (showAccountingDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showAccountingDropdown]);

  async function fetchAccountingSubjects() {
    try {
      const response = await fetch('/api/accounting-subjects');
      const data = await response.json();
      setAccountingSubjects(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('取得會計科目失敗:', error);
      setAccountingSubjects([]);
    }
  }

  const filteredAccounting = accountingSubjects.filter(a => {
    if (!accountingSearch.trim()) return true;
    const keyword = accountingSearch.toLowerCase().trim();
    return (
      a.code.includes(keyword) ||
      a.name.toLowerCase().includes(keyword) ||
      a.category.toLowerCase().includes(keyword) ||
      a.subcategory.toLowerCase().includes(keyword)
    );
  });

  function addWarehouseOption() {
    const trimmed = newWarehouse.trim();
    if (!trimmed) return;
    if (warehouseOptions.includes(trimmed)) {
      showToast('此倉庫位置已存在', 'error');
      return;
    }
    setWarehouseOptions([...warehouseOptions, trimmed]);
    setNewWarehouse('');
  }

  function removeWarehouseOption(option) {
    if (!confirm(`確定要刪除倉庫位置「${option}」嗎？`)) return;
    setWarehouseOptions(warehouseOptions.filter(o => o !== option));
    if (formData.warehouseLocation === option) {
      setFormData({ ...formData, warehouseLocation: '' });
    }
  }

  async function fetchProducts(page = currentPage, limit = itemsPerPage, keyword = searchKeyword) {
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (keyword) params.set('keyword', keyword);
      const response = await fetch(`/api/products?${params}`);
      const result = await response.json();
      if (result.data && result.pagination) {
        setProducts(result.data);
        setTotalCount(result.pagination.totalCount);
        setCurrentPage(result.pagination.page);
      } else {
        // 向下相容 all=true 回傳的陣列
        const list = Array.isArray(result) ? result : [];
        setProducts(list);
        setTotalCount(list.length);
      }
      setLoading(false);
      return result;
    } catch (error) {
      console.error('取得產品列表失敗:', error);
      setProducts([]);
      setTotalCount(0);
      setLoading(false);
      return [];
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    
    // 前端驗證：會計科目必選
    if (!formData.accountingSubject) {
      showToast('請選擇會計科目', 'error');
      return;
    }

    // 前端驗證：如果列入庫存為「是」，倉庫位置必須填寫
    if (formData.isInStock && !formData.warehouseLocation) {
      showToast('列入庫存時必須填寫倉庫位置', 'error');
      return;
    }
    
    setProductSaving(true);
    try {
      const isEditing = !!editingProduct;
      const method = isEditing ? 'PUT' : 'POST';
      const url = isEditing ? `/api/products/${editingProduct.id}` : '/api/products';
      
      // 轉換 isInStock 為布林值
      const submitData = {
        ...formData,
        isInStock: formData.isInStock === true || formData.isInStock === '是'
      };
      
      const response = await fetch(url, {
        method: method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(submitData)
      });

      if (response.ok) {
        showToast(`產品${isEditing ? '更新' : '新增'}成功！`, 'success');
        setShowAddForm(false);
        setEditingProduct(null);
        setFormData({
          code: '',
          name: '',
          category: '',
          unit: '',
          costPrice: '',
          salesPrice: '',
          isInStock: false,
          warehouseLocation: '',
          accountingSubject: ''
        });
        setAccountingSearch('');
        if (!isEditing) {
          // 新增產品後取得最後一頁
          const countRes = await fetch('/api/products?page=1&limit=1');
          const countData = await countRes.json();
          const total = countData?.pagination?.totalCount || 0;
          const lastPage = Math.ceil(total / itemsPerPage) || 1;
          await fetchProducts(lastPage, itemsPerPage, searchKeyword);
        } else {
          await fetchProducts(currentPage, itemsPerPage, searchKeyword);
        }
      } else {
        const error = await response.json();
        showToast(`${isEditing ? '更新' : '新增'}失敗：` + (error.error || '未知錯誤'), 'error');
      }
    } catch (error) {
      console.error('操作失敗:', error);
      showToast('操作失敗，請稍後再試', 'error');
    } finally {
      setProductSaving(false);
    }
  }

  function handleEdit(product) {
    setEditingProduct(product);
    setShowAddForm(true);
    setFormData({
      code: product.code,
      name: product.name,
      category: product.category || '',
      unit: product.unit || '',
      costPrice: product.costPrice,
      salesPrice: product.salesPrice,
      isInStock: product.isInStock || false,
      warehouseLocation: product.warehouseLocation || '',
      accountingSubject: product.accountingSubject || ''
    });
    setAccountingSearch(product.accountingSubject || '');
  }

  async function handleDelete(productId) {
    if (!confirm('確定要刪除這個產品嗎？')) return;
    
    try {
      const response = await fetch(`/api/products/${productId}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        showToast('產品刪除成功！', 'success');
        fetchProducts(currentPage, itemsPerPage, searchKeyword);
      } else {
        const error = await response.json();
        showToast('刪除失敗：' + (error.error || '未知錯誤'), 'error');
      }
    } catch (error) {
      console.error('刪除產品失敗:', error);
      showToast('刪除產品失敗，請稍後再試', 'error');
    }
  }

  function handleViewDetails(product) {
    showToast(`產品詳情：\n\n代碼：${product.code}\n名稱：${product.name}\n類別：${product.category || '未設定'}\n單位：${product.unit || '未設定'}\n成本價：NT$ ${product.costPrice}\n數量：${product.salesPrice}\n列入庫存：${product.isInStock ? '是' : '否'}\n倉庫位置：${product.warehouseLocation || '未設定'}\n會計科目：${product.accountingSubject || '未設定'}`, 'info');
  }

  // Old handleExport removed - replaced by ExportButtons component

  function handleImport() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv';
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      try {
        const text = await file.text();
        const lines = text.split('\n');
        
        if (lines.length < 2) {
          showToast('CSV 檔案格式錯誤：至少需要標題列和一筆資料', 'error');
          return;
        }

        // 解析 CSV（簡單版本）
        const headers = lines[0].split(',');
        const importedProducts = [];
        
        for (let i = 1; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line) continue;
          
          const values = line.split(',');
          if (values.length >= 7) {
            const isInStock = values[7] === '是' || values[7] === 'true' || values[7] === '1';
            importedProducts.push({
              code: values[1],
              name: values[2],
              category: values[3] || '',
              unit: values[4] || '',
              costPrice: parseFloat(values[5]) || 0,
              salesPrice: parseFloat(values[6]) || 0,
              isInStock: isInStock,
              warehouseLocation: isInStock ? (values[8] || '') : '',
              accountingSubject: values[9] || ''
            });
          }
        }

        if (importedProducts.length === 0) {
          showToast('沒有有效資料可匯入', 'error');
          return;
        }

        // 批次新增產品
        const confirmMsg = `即將匯入 ${importedProducts.length} 筆產品資料，是否繼續？`;
        if (!confirm(confirmMsg)) return;

        let successCount = 0;
        let failCount = 0;

        for (const product of importedProducts) {
          try {
            const response = await fetch('/api/products', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(product)
            });

            if (response.ok) {
              successCount++;
            } else {
              failCount++;
            }
          } catch (error) {
            console.error('匯入產品失敗:', product, error);
            failCount++;
          }
        }

        showToast(`匯入完成！\n成功：${successCount} 筆\n失敗：${failCount} 筆`, failCount > 0 ? 'warning' : 'success');
        fetchProducts(1, itemsPerPage, searchKeyword);
      } catch (error) {
        console.error('讀取檔案失敗:', error);
        showToast('讀取檔案失敗，請確認檔案格式正確', 'error');
      }
    };
    input.click();
  }

  // 伺服器端分頁 — products 已是當頁資料
  const totalPages = Math.ceil(totalCount / itemsPerPage);
  const currentProducts = products;

  // 生成頁碼陣列
  const getPageNumbers = () => {
    const pages = [];
    if (totalPages <= 5) {
      // 如果總頁數 <= 5，顯示所有頁碼
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      // 否則只顯示當前頁前後 2 頁
      if (currentPage <= 3) {
        for (let i = 1; i <= 5; i++) {
          pages.push(i);
        }
      } else if (currentPage >= totalPages - 2) {
        for (let i = totalPages - 4; i <= totalPages; i++) {
          pages.push(i);
        }
      } else {
        for (let i = currentPage - 2; i <= currentPage + 2; i++) {
          pages.push(i);
        }
      }
    }
    return pages;
  };

  if (loading) {
    return (
      <div className="min-h-screen page-bg-products flex items-center justify-center">
        <p className="text-gray-600">載入中...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen page-bg-products">
      <Navigation borderColor="border-purple-500" />

      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* 頁面標題 */}
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold">產品主檔管理</h2>
          {isLoggedIn && (
            <button
              onClick={() => setShowAddForm(!showAddForm)}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
            >
              ➕ 新增產品
            </button>
          )}
        </div>

        {/* 新增/編輯產品表單 */}
        {showAddForm && (
          <div className="bg-white rounded-lg shadow-sm p-6 mb-6 border-2 border-blue-200">
            <h3 className="text-lg font-semibold mb-4">{editingProduct ? '編輯產品' : '新增產品'}</h3>
            <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  產品代碼 *
                </label>
                <input
                  type="text"
                  required
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  產品名稱 *
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  類別
                </label>
                <input
                  type="text"
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  單位
                </label>
                <input
                  type="text"
                  value={formData.unit}
                  onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  成本價 *
                </label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={formData.costPrice}
                  onChange={(e) => setFormData({ ...formData, costPrice: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  數量 *
                </label>
                <input
                  type="number"
                  step="1"
                  required
                  value={formData.salesPrice}
                  onChange={(e) => setFormData({ ...formData, salesPrice: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  是否列入庫存 *
                </label>
                <select
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
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  會計科目 *
                </label>
                <input
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
              <div className="col-span-2 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddForm(false);
                    setEditingProduct(null);
                    setAccountingSearch('');
                    setFormData({
                      code: '',
                      name: '',
                      category: '',
                      unit: '',
                      costPrice: '',
                      salesPrice: '',
                      isInStock: false,
                      warehouseLocation: '',
                      accountingSubject: ''
                    });
                  }}
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
        )}

        {/* 搜尋區 */}
        <div className="bg-white rounded-lg shadow-sm p-4 mb-6">
          <div className="flex gap-4">
            <input
              type="text"
              placeholder="搜尋產品（代碼、名稱、類別）..."
              value={searchKeyword}
              onChange={(e) => {
                const val = e.target.value;
                setSearchKeyword(val);
                if (searchTimer) clearTimeout(searchTimer);
                setSearchTimer(setTimeout(() => {
                  fetchProducts(1, itemsPerPage, val);
                }, 400));
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  if (searchTimer) clearTimeout(searchTimer);
                  fetchProducts(1, itemsPerPage, searchKeyword);
                }
              }}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={() => {
                if (searchKeyword) {
                  setSearchKeyword('');
                  if (searchTimer) clearTimeout(searchTimer);
                  fetchProducts(1, itemsPerPage, '');
                }
              }}
              className="px-6 py-2 border border-blue-600 text-blue-600 rounded-lg hover:bg-blue-50"
            >
              {searchKeyword ? '清除' : '搜尋'}
            </button>
            <ExportButtons
              data={products.map(p => ({
                ...p,
                isInStockLabel: p.isInStock ? '是' : '否',
              }))}
              columns={EXPORT_CONFIGS.products.columns}
              exportName={EXPORT_CONFIGS.products.filename}
              title="產品主檔管理"
              sheetName="產品主檔"
            />
            {isLoggedIn && (
              <button
                onClick={handleImport}
                className="px-4 py-2 text-blue-600 hover:underline"
              >
                匯入
              </button>
            )}
          </div>
        </div>

        {/* 產品列表 */}
        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">ID</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">代碼</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">名稱</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">類別</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">單位</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">成本價</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">數量</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">列入庫存</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">倉庫位置</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">會計科目</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {currentProducts.length === 0 ? (
                <tr>
                  <td colSpan="11" className="px-4 py-8 text-center text-gray-500">
                    {totalCount === 0 ? (searchKeyword ? '找不到符合條件的產品' : '尚無產品資料') : '此頁無資料'}
                  </td>
                </tr>
              ) : (
                currentProducts.map((product, index) => (
                  <tr key={product.id} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                    <td className="px-4 py-3 text-sm">{product.id}</td>
                    <td className="px-4 py-3 text-sm">{product.code}</td>
                    <td className="px-4 py-3 text-sm">{product.name}</td>
                    <td className="px-4 py-3 text-sm">{product.category}</td>
                    <td className="px-4 py-3 text-sm">{product.unit}</td>
                    <td className="px-4 py-3 text-sm">NT$ {product.costPrice}</td>
                    <td className="px-4 py-3 text-sm">{product.salesPrice}</td>
                    <td className="px-4 py-3 text-sm">{product.isInStock ? '是' : '否'}</td>
                    <td className="px-4 py-3 text-sm">{product.warehouseLocation || '-'}</td>
                    <td className="px-4 py-3 text-sm">{product.accountingSubject || '-'}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        {isLoggedIn && (
                          <>
                            <button
                              onClick={() => handleEdit(product)}
                              className="text-blue-600 hover:underline text-sm"
                            >
                              編輯
                            </button>
                            <button
                              onClick={() => handleDelete(product.id)}
                              className="text-red-600 hover:underline text-sm"
                            >
                              刪除
                            </button>
                          </>
                        )}
                        <a
                          href={`/products/${product.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:underline text-sm"
                        >
                          詳情
                        </a>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* 分頁器 */}
        {totalPages > 0 && (
          <div className="flex justify-center items-center gap-4 mt-6">
            <button
              onClick={() => fetchProducts(Math.max(1, currentPage - 1))}
              disabled={currentPage === 1}
              className="px-4 py-2 border rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              &lt; Prev
            </button>
            
            {totalPages > 5 && currentPage > 3 && (
              <>
                <button
                  onClick={() => fetchProducts(1)}
                  className="px-4 py-2 border rounded-lg hover:bg-gray-100"
                >
                  1
                </button>
                <span className="px-2 text-gray-500">...</span>
              </>
            )}
            
            {getPageNumbers().map((pageNum) => (
              <button
                key={pageNum}
                onClick={() => fetchProducts(pageNum)}
                className={`px-4 py-2 rounded-lg ${
                  pageNum === currentPage
                    ? 'bg-blue-600 text-white'
                    : 'border hover:bg-gray-100'
                }`}
              >
                {pageNum}
              </button>
            ))}
            
            {totalPages > 5 && currentPage < totalPages - 2 && (
              <>
                <span className="px-2 text-gray-500">...</span>
                <button
                  onClick={() => fetchProducts(totalPages)}
                  className="px-4 py-2 border rounded-lg hover:bg-gray-100"
                >
                  {totalPages}
                </button>
              </>
            )}
            
            <button
              onClick={() => fetchProducts(Math.min(totalPages, currentPage + 1))}
              disabled={currentPage === totalPages}
              className="px-4 py-2 border rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next &gt;
            </button>
            
            <span className="ml-4 text-sm text-gray-600">每頁顯示</span>
            <select
              value={itemsPerPage}
              onChange={(e) => {
                const newLimit = Number(e.target.value);
                setItemsPerPage(newLimit);
                fetchProducts(1, newLimit);
              }}
              className="px-2 py-1 border rounded"
            >
              <option value={20}>20</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
            <span className="text-sm text-gray-600">筆</span>
            <span className="ml-2 text-sm text-gray-600">
              (共 {totalCount} 筆{searchKeyword ? `，搜尋 "${searchKeyword}"` : ''}，第 {currentPage} / {totalPages} 頁)
            </span>
          </div>
        )}
      </main>
    </div>
  );
}
