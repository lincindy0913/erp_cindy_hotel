'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    taxId: '',
    contact: '',
    personInCharge: '',
    phone: '',
    address: '',
    email: '',
    paymentTerms: '月結',
    contractDate: '',
    paymentStatus: '未付款',
    remarks: ''
  });
  const [allSuppliers, setAllSuppliers] = useState([]);
  const [sortType, setSortType] = useState('id-asc'); // id-asc, id-desc, name-asc, name-desc, filter
  const [filterKeyword, setFilterKeyword] = useState('');
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [showDateFilterMenu, setShowDateFilterMenu] = useState(false);
  const [dateFilterType, setDateFilterType] = useState('all'); // all, 1month, 3months, 6months, 1year, custom
  const [customDateRange, setCustomDateRange] = useState({ start: '', end: '' });

  useEffect(() => {
    fetchSuppliers();
  }, []);

  // 點擊外部關閉選單
  useEffect(() => {
    function handleClickOutside(event) {
      if (showSortMenu) {
        const menuElement = document.querySelector('.sort-menu-container');
        if (menuElement && !menuElement.contains(event.target)) {
          setShowSortMenu(false);
        }
      }
      if (showDateFilterMenu) {
        const dateMenuElement = document.querySelector('.date-filter-menu-container');
        if (dateMenuElement && !dateMenuElement.contains(event.target)) {
          setShowDateFilterMenu(false);
        }
      }
    }
    if (showSortMenu || showDateFilterMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showSortMenu, showDateFilterMenu]);

  async function fetchSuppliers() {
    try {
      const response = await fetch('/api/suppliers');
      const data = await response.json();
      const suppliersList = Array.isArray(data) ? data : [];
      setAllSuppliers(suppliersList);
      applySortAndFilter(suppliersList, sortType, filterKeyword);
      setLoading(false);
    } catch (error) {
      console.error('取得廠商列表失敗:', error);
      setAllSuppliers([]);
      setSuppliers([]);
      setLoading(false);
    }
  }

  // 計算日期範圍
  function getDateRange(filterType, customRange) {
    const now = new Date();
    let startDate = null;
    let endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

    switch (filterType) {
      case '1month':
        startDate = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
        break;
      case '3months':
        startDate = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate());
        break;
      case '6months':
        startDate = new Date(now.getFullYear(), now.getMonth() - 6, now.getDate());
        break;
      case '1year':
        startDate = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
        break;
      case 'custom':
        if (customRange.start) {
          startDate = new Date(customRange.start);
        }
        if (customRange.end) {
          endDate = new Date(customRange.end);
          endDate.setHours(23, 59, 59);
        }
        break;
      default:
        return null; // 'all' - no date filter
    }

    return { startDate, endDate };
  }

  function applySortAndFilter(data, sort, keyword, dateFilter = dateFilterType, customRange = customDateRange) {
    let result = [...data];

    // 先進行關鍵字篩選
    if (keyword && keyword.trim() !== '') {
      const lowerKeyword = keyword.toLowerCase().trim();
      result = result.filter(supplier => {
        return (
          (supplier.id && supplier.id.toString().includes(lowerKeyword)) ||
          (supplier.name && supplier.name.toLowerCase().includes(lowerKeyword)) ||
          (supplier.contact && supplier.contact.toLowerCase().includes(lowerKeyword)) ||
          (supplier.phone && supplier.phone.includes(keyword.trim())) ||
          (supplier.address && supplier.address.toLowerCase().includes(lowerKeyword)) ||
          (supplier.email && supplier.email.toLowerCase().includes(lowerKeyword))
        );
      });
    }

    // 進行合約日期篩選
    const dateRange = getDateRange(dateFilter, customRange);
    if (dateRange) {
      result = result.filter(supplier => {
        if (!supplier.contractDate) return false;
        const contractDate = new Date(supplier.contractDate);
        if (dateRange.startDate && contractDate < dateRange.startDate) return false;
        if (dateRange.endDate && contractDate > dateRange.endDate) return false;
        return true;
      });
    }

    // 再進行排序
    switch (sort) {
      case 'id-asc':
        result.sort((a, b) => (a.id || 0) - (b.id || 0));
        break;
      case 'id-desc':
        result.sort((a, b) => (b.id || 0) - (a.id || 0));
        break;
      case 'name-asc':
        result.sort((a, b) => {
          const nameA = (a.name || '').toLowerCase();
          const nameB = (b.name || '').toLowerCase();
          return nameA.localeCompare(nameB, 'zh-TW');
        });
        break;
      case 'name-desc':
        result.sort((a, b) => {
          const nameA = (a.name || '').toLowerCase();
          const nameB = (b.name || '').toLowerCase();
          return nameB.localeCompare(nameA, 'zh-TW');
        });
        break;
      case 'date-asc':
        result.sort((a, b) => {
          if (!a.contractDate) return 1;
          if (!b.contractDate) return -1;
          return new Date(a.contractDate) - new Date(b.contractDate);
        });
        break;
      case 'date-desc':
        result.sort((a, b) => {
          if (!a.contractDate) return 1;
          if (!b.contractDate) return -1;
          return new Date(b.contractDate) - new Date(a.contractDate);
        });
        break;
      default:
        result.sort((a, b) => (a.id || 0) - (b.id || 0));
    }

    setSuppliers(result);
  }

  function handleSortChange(newSortType) {
    setSortType(newSortType);
    setShowSortMenu(false);
    if (newSortType === 'filter') {
      // 如果是篩選模式，顯示輸入框但不關閉選單
      return;
    }
    applySortAndFilter(allSuppliers, newSortType, filterKeyword);
  }

  function handleFilterChange(keyword) {
    setFilterKeyword(keyword);
    if (sortType === 'filter') {
      applySortAndFilter(allSuppliers, 'id-asc', keyword);
    } else {
      applySortAndFilter(allSuppliers, sortType, keyword);
    }
  }

  function handleDateFilterChange(newDateFilter) {
    setDateFilterType(newDateFilter);
    if (newDateFilter !== 'custom') {
      setShowDateFilterMenu(false);
    }
    applySortAndFilter(allSuppliers, sortType, filterKeyword, newDateFilter, customDateRange);
  }

  function handleCustomDateChange(field, value) {
    const newRange = { ...customDateRange, [field]: value };
    setCustomDateRange(newRange);
    if (dateFilterType === 'custom') {
      applySortAndFilter(allSuppliers, sortType, filterKeyword, 'custom', newRange);
    }
  }

  function getDateFilterLabel() {
    switch (dateFilterType) {
      case '1month': return '近1個月';
      case '3months': return '近3個月';
      case '6months': return '近6個月';
      case '1year': return '近1年';
      case 'custom': return '自訂範圍';
      default: return '全部';
    }
  }

  useEffect(() => {
    if (allSuppliers.length > 0) {
      applySortAndFilter(allSuppliers, sortType, filterKeyword, dateFilterType, customDateRange);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortType, filterKeyword, dateFilterType, customDateRange]);

  async function handleSubmit(e) {
    e.preventDefault();
    try {
      const isEditing = !!editingSupplier;
      const url = isEditing ? `/api/suppliers/${editingSupplier.id}` : '/api/suppliers';
      const method = isEditing ? 'PUT' : 'POST';
      
      const response = await fetch(url, {
        method: method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      if (response.ok) {
        alert(`廠商${isEditing ? '更新' : '新增'}成功！`);
        setShowAddForm(false);
        setEditingSupplier(null);
        setFormData({ name: '', taxId: '', contact: '', personInCharge: '', phone: '', address: '', email: '', paymentTerms: '月結', contractDate: '', paymentStatus: '未付款', remarks: '' });
        await fetchSuppliers();
      } else {
        const error = await response.json();
        alert(`${isEditing ? '更新' : '新增'}失敗：` + (error.error || '未知錯誤'));
      }
    } catch (error) {
      console.error('操作失敗:', error);
      alert('操作失敗，請稍後再試');
    }
  }

  function handleEdit(supplier) {
    setEditingSupplier(supplier);
    setShowAddForm(true);
    setFormData({
      name: supplier.name || '',
      taxId: supplier.taxId || '',
      contact: supplier.contact || '',
      personInCharge: supplier.personInCharge || '',
      phone: supplier.phone || '',
      address: supplier.address || '',
      email: supplier.email || '',
      paymentTerms: supplier.paymentTerms || '月結',
      contractDate: supplier.contractDate ? supplier.contractDate.split('T')[0] : '',
      paymentStatus: supplier.paymentStatus || '未付款',
      remarks: supplier.remarks || ''
    });
  }

  async function handleDelete(supplierId) {
    if (!confirm('確定要刪除這個廠商嗎？')) return;
    
    try {
      const response = await fetch(`/api/suppliers/${supplierId}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        alert('廠商刪除成功！');
        fetchSuppliers();
      } else {
        const error = await response.json();
        alert('刪除失敗：' + (error.error || '未知錯誤'));
      }
    } catch (error) {
      console.error('刪除廠商失敗:', error);
      alert('刪除廠商失敗，請稍後再試');
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen page-bg-suppliers flex items-center justify-center">
        <p className="text-gray-600">載入中...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen page-bg-suppliers">
      {/* 導航欄 */}
      <nav className="bg-white shadow-lg border-b-4 border-teal-500">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-gray-800">📦 進銷存系統</h1>
            <div className="flex gap-2 text-sm flex-wrap">
              <Link href="/" className="link-dashboard">儀表板</Link>
              <Link href="/products" className="link-products">主資料</Link>
              <Link href="/suppliers" className="link-suppliers active font-medium">廠商</Link>
              <Link href="/purchasing" className="link-purchasing">進貨</Link>
              <Link href="/sales" className="link-sales">發票登錄/核銷</Link>
              <Link href="/finance" className="link-finance">付款</Link>
              <Link href="/inventory" className="link-inventory">庫存</Link>
              <Link href="/analytics" className="link-analytics">分析</Link>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* 頁面標題 */}
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold">廠商管理</h2>
          <div className="flex gap-3">
            {/* 日期區間篩選按鈕 */}
            <div className="relative date-filter-menu-container">
              <button
                onClick={() => setShowDateFilterMenu(!showDateFilterMenu)}
                className={`px-4 py-2 rounded-lg border ${
                  dateFilterType !== 'all'
                    ? 'bg-blue-100 border-blue-400 text-blue-700'
                    : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                }`}
              >
                📅 {dateFilterType !== 'all' ? getDateFilterLabel() : '日期區間篩選'}
              </button>
              {showDateFilterMenu && (
                <div
                  className="absolute top-full right-0 mt-2 bg-white border border-gray-300 rounded-lg shadow-lg z-50 min-w-[280px]"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="p-4">
                    <div className="text-sm font-semibold text-gray-700 mb-3">選擇合約日期區間</div>
                    <div className="grid grid-cols-2 gap-2 mb-3">
                      <button
                        onClick={() => handleDateFilterChange('all')}
                        className={`px-3 py-2 text-sm rounded-lg border ${
                          dateFilterType === 'all' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white border-gray-300 hover:bg-gray-50'
                        }`}
                      >
                        全部
                      </button>
                      <button
                        onClick={() => handleDateFilterChange('1month')}
                        className={`px-3 py-2 text-sm rounded-lg border ${
                          dateFilterType === '1month' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white border-gray-300 hover:bg-gray-50'
                        }`}
                      >
                        近1個月
                      </button>
                      <button
                        onClick={() => handleDateFilterChange('3months')}
                        className={`px-3 py-2 text-sm rounded-lg border ${
                          dateFilterType === '3months' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white border-gray-300 hover:bg-gray-50'
                        }`}
                      >
                        近3個月
                      </button>
                      <button
                        onClick={() => handleDateFilterChange('6months')}
                        className={`px-3 py-2 text-sm rounded-lg border ${
                          dateFilterType === '6months' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white border-gray-300 hover:bg-gray-50'
                        }`}
                      >
                        近6個月
                      </button>
                      <button
                        onClick={() => handleDateFilterChange('1year')}
                        className={`px-3 py-2 text-sm rounded-lg border col-span-2 ${
                          dateFilterType === '1year' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white border-gray-300 hover:bg-gray-50'
                        }`}
                      >
                        近1年
                      </button>
                    </div>
                    <div className="border-t border-gray-200 pt-3">
                      <div className="text-xs text-gray-500 mb-2">自訂日期範圍</div>
                      <div className="flex gap-2 items-center mb-3">
                        <input
                          type="date"
                          value={customDateRange.start}
                          onChange={(e) => {
                            handleCustomDateChange('start', e.target.value);
                            setDateFilterType('custom');
                          }}
                          className="flex-1 px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <span className="text-gray-400">~</span>
                        <input
                          type="date"
                          value={customDateRange.end}
                          onChange={(e) => {
                            handleCustomDateChange('end', e.target.value);
                            setDateFilterType('custom');
                          }}
                          className="flex-1 px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            setDateFilterType('all');
                            setCustomDateRange({ start: '', end: '' });
                            setShowDateFilterMenu(false);
                            applySortAndFilter(allSuppliers, sortType, filterKeyword, 'all', { start: '', end: '' });
                          }}
                          className="flex-1 px-3 py-2 text-sm text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200"
                        >
                          清除篩選
                        </button>
                        <button
                          onClick={() => setShowDateFilterMenu(false)}
                          className="flex-1 px-3 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700"
                        >
                          確認
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
            <button
              onClick={() => setShowAddForm(!showAddForm)}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
            >
              ➕ 新增廠商
            </button>
          </div>
        </div>

        {/* 新增/編輯廠商表單 */}
        {showAddForm && (
          <div className="bg-white rounded-lg shadow-sm p-6 mb-6 border-2 border-blue-200">
            <h3 className="text-lg font-semibold mb-4">{editingSupplier ? '編輯廠商' : '新增廠商'}</h3>
            <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  廠商名稱 *
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
                  統一編號
                </label>
                <input
                  type="text"
                  value={formData.taxId}
                  onChange={(e) => setFormData({ ...formData, taxId: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  聯絡人 *
                </label>
                <input
                  type="text"
                  required
                  value={formData.contact}
                  onChange={(e) => setFormData({ ...formData, contact: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  負責人
                </label>
                <input
                  type="text"
                  value={formData.personInCharge}
                  onChange={(e) => setFormData({ ...formData, personInCharge: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="例如：王經理"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  聯絡電話 *
                </label>
                <input
                  type="text"
                  required
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="例如：02-1234-5678"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  地址
                </label>
                <input
                  type="text"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="例如：台北市信義區信義路五段7號"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email
                </label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="例如：contact@example.com"
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
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  合約日期
                </label>
                <input
                  type="date"
                  value={formData.contractDate}
                  onChange={(e) => setFormData({ ...formData, contractDate: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  付款狀態
                </label>
                <select
                  value={formData.paymentStatus}
                  onChange={(e) => setFormData({ ...formData, paymentStatus: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="未付款">未付款</option>
                  <option value="已付款">已付款</option>
                  <option value="部分付款">部分付款</option>
                </select>
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  備註
                </label>
                <textarea
                  value={formData.remarks}
                  onChange={(e) => setFormData({ ...formData, remarks: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  rows="3"
                  placeholder="輸入備註事項..."
                />
              </div>
              <div className="col-span-2 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddForm(false);
                    setEditingSupplier(null);
                    setFormData({ name: '', taxId: '', contact: '', personInCharge: '', phone: '', address: '', email: '', paymentTerms: '月結', contractDate: '', paymentStatus: '未付款', remarks: '' });
                  }}
                  className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  {editingSupplier ? '更新' : '儲存'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* 廠商列表 */}
        <div className="bg-white rounded-lg shadow-sm overflow-x-auto">
          <table className="w-full min-w-[1400px]">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">
                  <div className="relative sort-menu-container">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowSortMenu(!showSortMenu);
                      }}
                      className="flex items-center gap-2 hover:text-blue-600 cursor-pointer"
                    >
                      <span>廠商序號</span>
                      <span className="text-xs">▼</span>
                    </button>
                    {showSortMenu && (
                      <div 
                        className="absolute top-full left-0 mt-1 bg-white border border-gray-300 rounded-lg shadow-lg z-50 min-w-[200px]"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="py-1">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSortChange('id-asc');
                            }}
                            className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-100 ${
                              sortType === 'id-asc' ? 'bg-blue-50 text-blue-600' : ''
                            }`}
                          >
                            由小到大 (1→9)
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSortChange('id-desc');
                            }}
                            className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-100 ${
                              sortType === 'id-desc' ? 'bg-blue-50 text-blue-600' : ''
                            }`}
                          >
                            由大到小 (9→1)
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSortChange('name-asc');
                            }}
                            className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-100 ${
                              sortType === 'name-asc' ? 'bg-blue-50 text-blue-600' : ''
                            }`}
                          >
                            A到Z (名稱排序)
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSortChange('name-desc');
                            }}
                            className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-100 ${
                              sortType === 'name-desc' ? 'bg-blue-50 text-blue-600' : ''
                            }`}
                          >
                            Z到A (名稱排序)
                          </button>
                          <div className="border-t border-gray-200 my-1"></div>
                          <div className="px-4 py-2">
                            <label className="block text-xs text-gray-600 mb-1">關鍵字篩選</label>
                            <input
                              type="text"
                              value={filterKeyword}
                              onChange={(e) => {
                                handleFilterChange(e.target.value);
                                setSortType('filter');
                              }}
                              onClick={(e) => e.stopPropagation()}
                              onFocus={(e) => e.stopPropagation()}
                              placeholder="搜尋序號、名稱、聯絡人等..."
                              className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setFilterKeyword('');
                              setSortType('id-asc');
                              setShowSortMenu(false);
                              applySortAndFilter(allSuppliers, 'id-asc', '');
                            }}
                            className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100 text-gray-500"
                          >
                            清除篩選
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                  {filterKeyword && (
                    <div className="mt-1 text-xs text-blue-600">
                      篩選中: {filterKeyword}
                    </div>
                  )}
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">聯絡人</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">負責人</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">聯絡電話</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">廠商名稱</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">統一編號</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">地址</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Email</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">付款條件</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">
                  <div className="relative date-sort-menu-container">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        // Toggle between date sort options
                        if (sortType === 'date-asc') {
                          handleSortChange('date-desc');
                        } else if (sortType === 'date-desc') {
                          handleSortChange('id-asc');
                        } else {
                          handleSortChange('date-asc');
                        }
                      }}
                      className="flex items-center gap-2 hover:text-blue-600 cursor-pointer"
                    >
                      <span>合約日期</span>
                      {sortType === 'date-asc' && <span className="text-xs">↑</span>}
                      {sortType === 'date-desc' && <span className="text-xs">↓</span>}
                      {sortType !== 'date-asc' && sortType !== 'date-desc' && <span className="text-xs text-gray-400">⇅</span>}
                    </button>
                  </div>
                  {(sortType === 'date-asc' || sortType === 'date-desc') && (
                    <div className="mt-1 text-xs text-blue-600">
                      {sortType === 'date-asc' ? '由舊到新' : '由新到舊'}
                    </div>
                  )}
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700 whitespace-nowrap min-w-[100px]">付款狀態</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700 min-w-[150px]">備註</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700 whitespace-nowrap min-w-[80px]">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {suppliers.length === 0 ? (
                <tr>
                  <td colSpan="13" className="px-4 py-8 text-center text-gray-500">
                    尚無廠商資料
                  </td>
                </tr>
              ) : (
                suppliers.map((supplier, index) => (
                  <tr key={supplier.id} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                    <td className="px-4 py-3 text-sm font-medium">{supplier.id}</td>
                    <td className="px-4 py-3 text-sm">{supplier.contact || '-'}</td>
                    <td className="px-4 py-3 text-sm">{supplier.personInCharge || '-'}</td>
                    <td className="px-4 py-3 text-sm">{supplier.phone || '-'}</td>
                    <td className="px-4 py-3 text-sm">{supplier.name}</td>
                    <td className="px-4 py-3 text-sm">{supplier.taxId || '-'}</td>
                    <td className="px-4 py-3 text-sm">{supplier.address || '-'}</td>
                    <td className="px-4 py-3 text-sm">{supplier.email || '-'}</td>
                    <td className="px-4 py-3 text-sm">{supplier.paymentTerms || '-'}</td>
                    <td className="px-4 py-3 text-sm">{supplier.contractDate ? supplier.contractDate.split('T')[0] : '-'}</td>
                    <td className="px-4 py-3 text-sm whitespace-nowrap">
                      <span className={`inline-flex items-center justify-center px-3 py-1.5 rounded-full text-xs font-medium min-w-[70px] ${
                        supplier.paymentStatus === '已付款' ? 'bg-green-100 text-green-700 border border-green-200' :
                        supplier.paymentStatus === '部分付款' ? 'bg-yellow-100 text-yellow-700 border border-yellow-200' :
                        'bg-red-100 text-red-700 border border-red-200'
                      }`}>
                        {supplier.paymentStatus || '未付款'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm min-w-[150px] max-w-[200px] truncate" title={supplier.remarks || ''}>
                      {supplier.remarks || '-'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleEdit(supplier)}
                          className="text-blue-600 hover:underline text-sm"
                        >
                          編輯
                        </button>
                        <button
                          onClick={() => handleDelete(supplier.id)}
                          className="text-red-600 hover:underline text-sm"
                        >
                          刪除
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}

