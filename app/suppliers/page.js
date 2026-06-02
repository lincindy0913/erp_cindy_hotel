'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import Navigation from '@/components/Navigation';
import { useToast } from '@/context/ToastContext';
import { useConfirm } from '@/context/ConfirmContext';
import { useSupplierContracts } from '@/hooks/useSupplierContracts';
import SupplierForm from '@/components/suppliers/SupplierForm';

export default function SuppliersPage() {
  const { data: session } = useSession();
  const { showToast } = useToast();
  const confirm = useConfirm();
  const isLoggedIn = !!session;
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
    contractEndDate: '',
    paymentStatus: '未付款',
    remarks: '',
    checkPayee: '',
    industryCategory: '',
    sortOrder: '',
  });
  const { contracts, setContracts, uploadingContract, fetchContracts, handleUploadContract, handleDeleteContract } =
    useSupplierContracts({ showToast, confirm, editingSupplier });
  const [supplierSaving, setSupplierSaving] = useState(false);
  const [allSuppliers, setAllSuppliers] = useState([]);
  const [sortType, setSortType] = useState('id-asc');
  const [filterKeyword, setFilterKeyword] = useState('');
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(50);
  const [totalCount, setTotalCount] = useState(0);
  const [searchTimer, setSearchTimer] = useState(null);
  const [showDateFilterMenu, setShowDateFilterMenu] = useState(false);
  const [dateFilterType, setDateFilterType] = useState('all');
  const [customDateRange, setCustomDateRange] = useState({ start: '', end: '' });
  const [bannerDismissed, setBannerDismissed] = useState(false);

  // 付款條件選項管理
  const [paymentTermsOptions, setPaymentTermsOptions] = useState(['月結', '現金', '支票', '轉帳', '信用卡', '員工代付']);
  const [showTermsManager, setShowTermsManager] = useState(false);
  const [newTermName, setNewTermName] = useState('');

  const emptyForm = { name: '', taxId: '', contact: '', personInCharge: '', phone: '', address: '', email: '', paymentTerms: '月結', contractDate: '', contractEndDate: '', paymentStatus: '未付款', remarks: '', checkPayee: '', industryCategory: '', sortOrder: '', rating: null, isBlacklisted: false, blacklistReason: '', blacklistedAt: null };

  const now = new Date();
  const expiringItems = allSuppliers.filter(s => {
    if (!s.contractEndDate) return false;
    const days = Math.ceil((new Date(s.contractEndDate) - now) / 86400000);
    return days < 30;
  });
  const expiredItems = expiringItems.filter(s => new Date(s.contractEndDate) < now);
  const soonItems    = expiringItems.filter(s => new Date(s.contractEndDate) >= now);

  useEffect(() => {
    fetchSuppliers();
  }, []);

  useEffect(() => {
    fetch('/api/settings/payment-methods')
      .then(res => res.ok ? res.json() : [])
      .then(list => {
        if (Array.isArray(list) && list.length > 0) {
          setPaymentTermsOptions(list.map(m => m.name));
        }
      })
      .catch(() => {});
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

  async function fetchSuppliers(page = currentPage, limit = itemsPerPage, keyword = filterKeyword) {
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (keyword) params.set('keyword', keyword);
      const response = await fetch(`/api/suppliers?${params}`);
      const result = await response.json();
      if (result.data && result.pagination) {
        const suppliersList = result.data;
        setAllSuppliers(suppliersList);
        setTotalCount(result.pagination.totalCount);
        setCurrentPage(result.pagination.page);
        applySortAndFilter(suppliersList, sortType, '');
      } else {
        const suppliersList = Array.isArray(result) ? result : [];
        setAllSuppliers(suppliersList);
        setTotalCount(suppliersList.length);
        applySortAndFilter(suppliersList, sortType, '');
      }
      setLoading(false);
    } catch (error) {
      console.error('取得廠商列表失敗:', error);
      setAllSuppliers([]);
      setSuppliers([]);
      setTotalCount(0);
      setLoading(false);
    }
  }

  // 判斷合約到期狀態
  function getExpiryStatus(contractEndDate) {
    if (!contractEndDate) return null;
    const now = new Date();
    const endDate = new Date(contractEndDate);
    const diffMs = endDate - now;
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays < 0) return 'expired';       // 已過期
    if (diffDays <= 60) return 'warning';      // 2個月內到期
    return 'ok';
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
        return null;
    }

    return { startDate, endDate };
  }

  function applySortAndFilter(data, sort, keyword, dateFilter = dateFilterType, customRange = customDateRange) {
    let result = [...data];

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

    switch (sort) {
      case 'id-asc':
        result.sort((a, b) => (a.id || 0) - (b.id || 0));
        break;
      case 'id-desc':
        result.sort((a, b) => (b.id || 0) - (a.id || 0));
        break;
      case 'name-asc':
        result.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'zh-TW'));
        break;
      case 'name-desc':
        result.sort((a, b) => (b.name || '').localeCompare(a.name || '', 'zh-TW'));
        break;
      case 'sort-asc':
        result.sort((a, b) => {
          if (a.sortOrder == null) return 1;
          if (b.sortOrder == null) return -1;
          return a.sortOrder - b.sortOrder;
        });
        break;
      case 'sort-desc':
        result.sort((a, b) => {
          if (a.sortOrder == null) return 1;
          if (b.sortOrder == null) return -1;
          return b.sortOrder - a.sortOrder;
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
    if (newSortType === 'filter') return;
    applySortAndFilter(allSuppliers, newSortType, filterKeyword);
  }

  function handleFilterChange(keyword) {
    setFilterKeyword(keyword);
    applySortAndFilter(allSuppliers, sortType === 'filter' ? 'id-asc' : sortType, keyword);
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
    setSupplierSaving(true);
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
        showToast(`廠商${isEditing ? '更新' : '新增'}成功！`, 'success');
        setShowAddForm(false);
        setEditingSupplier(null);
        setFormData(emptyForm);
        setContracts([]);
        await fetchSuppliers(currentPage, itemsPerPage, filterKeyword);
      } else {
        const error = await response.json().catch(() => ({}));
        const msg = error?.error?.message || error?.error?.code || (typeof error?.error === 'string' ? error.error : '未知錯誤');
        showToast(`${isEditing ? '更新' : '新增'}失敗：${msg}`, 'error');
      }
    } catch (err) {
      console.error('操作失敗:', err);
      showToast('操作失敗，請稍後再試', 'error');
    } finally {
      setSupplierSaving(false);
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
      contractEndDate: supplier.contractEndDate ? supplier.contractEndDate.split('T')[0] : '',
      paymentStatus: supplier.paymentStatus || '未付款',
      remarks: supplier.remarks || '',
      checkPayee: supplier.checkPayee || '',
      industryCategory: supplier.industryCategory || '',
      sortOrder: supplier.sortOrder != null ? String(supplier.sortOrder) : '',
      rating: supplier.rating ?? null,
      isBlacklisted: supplier.isBlacklisted || false,
      blacklistReason: supplier.blacklistReason || '',
      blacklistedAt: supplier.blacklistedAt || null,
    });
    fetchContracts(supplier.id);
  }

  async function handleDelete(supplierId) {
    if (!(await confirm('確定要刪除這個廠商嗎？', { title: '刪除確認', danger: true }))) return;

    try {
      const response = await fetch(`/api/suppliers/${supplierId}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        showToast('廠商刪除成功！', 'success');
        fetchSuppliers(currentPage, itemsPerPage, filterKeyword);
      } else {
        const error = await response.json();
        const msg = error?.error?.message || (typeof error?.error === 'string' ? error.error : '未知錯誤');
        showToast('刪除失敗：' + msg, 'error');
      }
    } catch (error) {
      console.error('刪除廠商失敗:', error);
      showToast('刪除廠商失敗，請稍後再試', 'error');
    }
  }

  function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
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
      <Navigation borderColor="border-teal-500" />

      <main className="max-w-full mx-auto px-4 py-8">
        {!bannerDismissed && expiringItems.length > 0 && (
          <div className="bg-red-50 border-l-4 border-red-500 rounded p-3 mb-4 flex items-start justify-between gap-3">
            <div className="text-sm text-red-700">
              <span className="font-semibold">⚠️ 合約到期警告：</span>
              {expiredItems.length > 0 && (
                <span>已過期 <b>{expiredItems.length}</b> 家（{expiredItems.map(s => s.name).join('、')}）。</span>
              )}
              {soonItems.length > 0 && (
                <span>30 天內到期 <b>{soonItems.length}</b> 家（{soonItems.map(s => s.name).join('、')}）。</span>
              )}
            </div>
            <button onClick={() => setBannerDismissed(true)} className="text-red-400 hover:text-red-600 text-lg leading-none shrink-0">×</button>
          </div>
        )}
        {/* 頁面標題 */}
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-bold">廠商管理</h2>
            <Link href="/suppliers/payment-health"
              className="px-3 py-1.5 text-sm bg-teal-50 border border-teal-300 text-teal-700 rounded-lg hover:bg-teal-100">
              📊 付款健康度
            </Link>
          </div>
          <div className="flex gap-3 items-center">
            {/* 搜尋欄 */}
            <div className="relative">
              <input
                type="text"
                value={filterKeyword}
                onChange={(e) => {
                  const val = e.target.value;
                  setFilterKeyword(val);
                  if (searchTimer) clearTimeout(searchTimer);
                  setSearchTimer(setTimeout(() => {
                    fetchSuppliers(1, itemsPerPage, val);
                  }, 400));
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    if (searchTimer) clearTimeout(searchTimer);
                    fetchSuppliers(1, itemsPerPage, filterKeyword);
                  }
                }}
                placeholder="搜尋廠商名稱、聯絡人、電話..."
                className="w-64 px-4 py-2 pl-9 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              {filterKeyword && (
                <button
                  onClick={() => { setFilterKeyword(''); if (searchTimer) clearTimeout(searchTimer); fetchSuppliers(1, itemsPerPage, ''); }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  ✕
                </button>
              )}
            </div>
            {/* 日期區間篩選按鈕 */}
            <div className="relative date-filter-menu-container">
              <button
                onClick={() => setShowDateFilterMenu(!showDateFilterMenu)}
                className={`px-4 py-2 rounded-lg border text-sm ${
                  dateFilterType !== 'all'
                    ? 'bg-blue-100 border-blue-400 text-blue-700'
                    : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                }`}
              >
                {dateFilterType !== 'all' ? getDateFilterLabel() : '日期篩選'}
              </button>
              {showDateFilterMenu && (
                <div
                  className="absolute top-full right-0 mt-2 bg-white border border-gray-300 rounded-lg shadow-lg z-50 min-w-[280px]"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="p-4">
                    <div className="text-sm font-semibold text-gray-700 mb-3">選擇合約日期區間</div>
                    <div className="grid grid-cols-2 gap-2 mb-3">
                      {['all', '1month', '3months', '6months'].map(type => (
                        <button
                          key={type}
                          onClick={() => handleDateFilterChange(type)}
                          className={`px-3 py-2 text-sm rounded-lg border ${
                            dateFilterType === type ? 'bg-blue-600 text-white border-blue-600' : 'bg-white border-gray-300 hover:bg-gray-50'
                          }`}
                        >
                          {type === 'all' ? '全部' : type === '1month' ? '近1個月' : type === '3months' ? '近3個月' : '近6個月'}
                        </button>
                      ))}
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
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 text-sm"
            >
              + 新增廠商
            </button>
          </div>
        </div>

        {/* 新增/編輯廠商表單 */}
        {showAddForm && (
          <SupplierForm
            formData={formData}
            setFormData={setFormData}
            editingSupplier={editingSupplier}
            supplierSaving={supplierSaving}
            paymentTermsOptions={paymentTermsOptions}
            contracts={contracts}
            uploadingContract={uploadingContract}
            handleUploadContract={handleUploadContract}
            handleDeleteContract={handleDeleteContract}
            formatFileSize={formatFileSize}
            onSubmit={handleSubmit}
            onCancel={() => { setShowAddForm(false); setEditingSupplier(null); setFormData(emptyForm); setContracts([]); }}
          />
        )}

        {/* 廠商列表 */}
        <div className="bg-white rounded-lg shadow-sm">
          <table className="w-full table-fixed">
            <thead className="bg-gray-50 sticky top-0 z-10">
              <tr>
                <th className="w-[4%] px-2 py-3 text-left text-xs font-medium text-gray-700">
                  <div className="relative sort-menu-container">
                    <button
                      onClick={(e) => { e.stopPropagation(); setShowSortMenu(!showSortMenu); }}
                      className="flex items-center gap-1 hover:text-blue-600 cursor-pointer"
                    >
                      <span>序號</span>
                      <span className="text-xs">▼</span>
                    </button>
                    {showSortMenu && (
                      <div className="absolute top-full left-0 mt-1 bg-white border border-gray-300 rounded-lg shadow-lg z-50 min-w-[200px]"
                        onClick={(e) => e.stopPropagation()}>
                        <div className="py-1">
                          <button onClick={(e) => { e.stopPropagation(); handleSortChange('id-asc'); }}
                            className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-100 ${sortType === 'id-asc' ? 'bg-blue-50 text-blue-600' : ''}`}>
                            由小到大 (1→9)
                          </button>
                          <button onClick={(e) => { e.stopPropagation(); handleSortChange('id-desc'); }}
                            className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-100 ${sortType === 'id-desc' ? 'bg-blue-50 text-blue-600' : ''}`}>
                            由大到小 (9→1)
                          </button>
                          <button onClick={(e) => { e.stopPropagation(); handleSortChange('name-asc'); }}
                            className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-100 ${sortType === 'name-asc' ? 'bg-blue-50 text-blue-600' : ''}`}>
                            A到Z (名稱排序)
                          </button>
                          <button onClick={(e) => { e.stopPropagation(); handleSortChange('name-desc'); }}
                            className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-100 ${sortType === 'name-desc' ? 'bg-blue-50 text-blue-600' : ''}`}>
                            Z到A (名稱排序)
                          </button>
                          <button onClick={(e) => { e.stopPropagation(); handleSortChange('sort-asc'); }}
                            className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-100 ${sortType === 'sort-asc' ? 'bg-blue-50 text-blue-600' : ''}`}>
                            依順序小→大
                          </button>
                          <button onClick={(e) => { e.stopPropagation(); handleSortChange('sort-desc'); }}
                            className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-100 ${sortType === 'sort-desc' ? 'bg-blue-50 text-blue-600' : ''}`}>
                            依順序大→小
                          </button>
                          <div className="border-t border-gray-200 my-1"></div>
                          <div className="px-4 py-2">
                            <label htmlFor="f-13" className="block text-xs text-gray-600 mb-1">關鍵字篩選</label>
                            <input id="f-13" type="text" value={filterKeyword}
                              onChange={(e) => { handleFilterChange(e.target.value); setSortType('filter'); }}
                              onClick={(e) => e.stopPropagation()} onFocus={(e) => e.stopPropagation()}
                              placeholder="搜尋序號、名稱、聯絡人等..."
                              className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500" />
                          </div>
                          <button onClick={(e) => { e.stopPropagation(); setFilterKeyword(''); setSortType('id-asc'); setShowSortMenu(false); applySortAndFilter(allSuppliers, 'id-asc', ''); }}
                            className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100 text-gray-500">
                            清除篩選
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </th>
                <th className="w-[8%] px-2 py-3 text-left text-xs font-medium text-gray-700">廠商名稱</th>
                <th className="w-[7%] px-2 py-3 text-left text-xs font-medium text-gray-700">統一編號</th>
                <th className="w-[6%] px-2 py-3 text-left text-xs font-medium text-gray-700">聯絡人</th>
                <th className="w-[6%] px-2 py-3 text-left text-xs font-medium text-gray-700">負責人</th>
                <th className="w-[8%] px-2 py-3 text-left text-xs font-medium text-gray-700">聯絡電話</th>
                <th className="w-[12%] px-2 py-3 text-left text-xs font-medium text-gray-700">地址</th>
                <th className="w-[5%] px-2 py-3 text-left text-xs font-medium text-gray-700">付款</th>
                <th className="w-[7%] px-2 py-3 text-left text-xs font-medium text-gray-700">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (sortType === 'date-asc') handleSortChange('date-desc');
                      else if (sortType === 'date-desc') handleSortChange('id-asc');
                      else handleSortChange('date-asc');
                    }}
                    className="flex items-center gap-1 hover:text-blue-600 cursor-pointer"
                  >
                    <span>合約日期</span>
                    {sortType === 'date-asc' && <span className="text-xs">↑</span>}
                    {sortType === 'date-desc' && <span className="text-xs">↓</span>}
                    {sortType !== 'date-asc' && sortType !== 'date-desc' && <span className="text-xs text-gray-400">⇅</span>}
                  </button>
                </th>
                <th className="w-[9%] px-2 py-3 text-left text-xs font-medium text-gray-700">合約到期</th>
                <th className="w-[6%] px-2 py-3 text-left text-xs font-medium text-gray-700">付款狀態</th>
                <th className="w-[7%] px-2 py-3 text-left text-xs font-medium text-gray-700">支票抬頭</th>
                <th className="w-[5%] px-2 py-3 text-left text-xs font-medium text-gray-700">行業類別</th>
                <th className="w-[4%] px-2 py-3 text-center text-xs font-medium text-gray-700">順序</th>
                <th className="w-[10%] px-2 py-3 text-left text-xs font-medium text-gray-700">備註</th>
                <th className="w-[5%] px-2 py-3 text-left text-xs font-medium text-gray-700">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {suppliers.length === 0 ? (
                <tr>
                  <td colSpan="16" className="px-2 py-8 text-center text-gray-500">
                    尚無廠商資料
                  </td>
                </tr>
              ) : (
                suppliers.map((supplier, index) => {
                  const expiryStatus = getExpiryStatus(supplier.contractEndDate);
                  return (
                    <tr key={supplier.id} className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} ${expiryStatus === 'expired' ? 'bg-red-50' : expiryStatus === 'warning' ? 'bg-yellow-50' : ''}`}>
                      <td className="px-2 py-2 text-xs font-medium">{supplier.id}</td>
                      <td className="px-2 py-2 text-xs" title={supplier.name}>
                        <div className="flex flex-col gap-0.5">
                          <div className="flex items-center gap-1 flex-wrap">
                            {supplier.isBlacklisted && (
                              <span className="px-1 py-0.5 bg-red-100 text-red-700 rounded text-xs font-bold shrink-0" title={supplier.blacklistReason || '黑名單'}>🚫</span>
                            )}
                            <span className="truncate">{supplier.name}</span>
                          </div>
                          {supplier.rating && (
                            <span className="text-yellow-400 text-xs leading-none">{'★'.repeat(supplier.rating)}{'☆'.repeat(5 - supplier.rating)}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-2 py-2 text-xs">{supplier.taxId || '-'}</td>
                      <td className="px-2 py-2 text-xs truncate" title={supplier.contact}>{supplier.contact || '-'}</td>
                      <td className="px-2 py-2 text-xs truncate" title={supplier.personInCharge}>{supplier.personInCharge || '-'}</td>
                      <td className="px-2 py-2 text-xs">{supplier.phone || '-'}</td>
                      <td className="px-2 py-2 text-xs truncate" title={supplier.address || ''}>{supplier.address || '-'}</td>
                      <td className="px-2 py-2 text-xs">{supplier.paymentTerms || '-'}</td>
                      <td className="px-2 py-2 text-xs">{supplier.contractDate ? supplier.contractDate.split('T')[0] : '-'}</td>
                      <td className="px-2 py-2 text-xs">
                        <div className="flex items-center gap-1">
                          <span>{supplier.contractEndDate ? supplier.contractEndDate.split('T')[0] : '-'}</span>
                          {expiryStatus === 'expired' && (
                            <span className="text-red-600 font-bold" title="合約已過期">!!</span>
                          )}
                          {expiryStatus === 'warning' && (
                            <span className="text-yellow-600 font-bold" title="合約即將到期（2個月內）">!</span>
                          )}
                        </div>
                      </td>
                      <td className="px-2 py-2 text-xs">
                        <span className={`inline-flex items-center justify-center px-2 py-1 rounded-full text-xs font-medium ${
                          supplier.paymentStatus === '已付款' ? 'bg-green-100 text-green-700' :
                          supplier.paymentStatus === '部分付款' ? 'bg-yellow-100 text-yellow-700' :
                          'bg-red-100 text-red-700'
                        }`}>
                          {supplier.paymentStatus || '未付款'}
                        </span>
                      </td>
                      <td className="px-2 py-2 text-xs truncate" title={supplier.checkPayee || ''}>{supplier.checkPayee || '-'}</td>
                      <td className="px-2 py-2 text-xs truncate" title={supplier.industryCategory || ''}>{supplier.industryCategory || '-'}</td>
                      <td className="px-2 py-2 text-xs text-center">{supplier.sortOrder != null ? supplier.sortOrder : '-'}</td>
                      <td className="px-2 py-2 text-xs truncate" title={supplier.remarks || ''}>
                        {supplier.remarks || '-'}
                      </td>
                      <td className="px-2 py-2">
                        <div className="flex gap-1">
                          <button onClick={() => handleEdit(supplier)} className="text-blue-600 hover:underline text-xs">
                            編輯
                          </button>
                          <button onClick={() => handleDelete(supplier.id)} className="text-red-600 hover:underline text-xs">
                            刪除
                          </button>
                        </div>
                      </td>
                    </tr>
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
              <button onClick={() => fetchSuppliers(Math.max(1, currentPage - 1))} disabled={currentPage === 1}
                className="px-4 py-2 border rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed">&lt; Prev</button>
              {totalPages > 5 && currentPage > 3 && (<>
                <button onClick={() => fetchSuppliers(1)} className="px-4 py-2 border rounded-lg hover:bg-gray-100">1</button>
                <span className="px-2 text-gray-500">...</span>
              </>)}
              {getPageNumbers().map(p => (
                <button key={p} onClick={() => fetchSuppliers(p)}
                  className={`px-4 py-2 rounded-lg ${p === currentPage ? 'bg-blue-600 text-white' : 'border hover:bg-gray-100'}`}>{p}</button>
              ))}
              {totalPages > 5 && currentPage < totalPages - 2 && (<>
                <span className="px-2 text-gray-500">...</span>
                <button onClick={() => fetchSuppliers(totalPages)} className="px-4 py-2 border rounded-lg hover:bg-gray-100">{totalPages}</button>
              </>)}
              <button onClick={() => fetchSuppliers(Math.min(totalPages, currentPage + 1))} disabled={currentPage === totalPages}
                className="px-4 py-2 border rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed">Next &gt;</button>
              <span className="ml-4 text-sm text-gray-600">每頁</span>
              <select value={itemsPerPage} onChange={(e) => { const n = Number(e.target.value); setItemsPerPage(n); fetchSuppliers(1, n); }}
                className="px-2 py-1 border rounded">
                <option value={20}>20</option><option value={50}>50</option><option value={100}>100</option>
              </select>
              <span className="text-sm text-gray-600">筆</span>
              <span className="ml-2 text-sm text-gray-600">(共 {totalCount} 筆{filterKeyword ? `，搜尋 "${filterKeyword}"` : ''}，第 {currentPage} / {totalPages} 頁)</span>
            </div>
          );
        })()}
      </main>
    </div>
  );
}
