'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useToast } from '@/context/ToastContext';
import { useConfirm } from '@/context/ConfirmContext';
import { useSupplierContracts } from '@/hooks/useSupplierContracts';

export const emptyForm = {
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
  rating: null,
  isBlacklisted: false,
  blacklistReason: '',
  blacklistedAt: null,
};

export function useSuppliers() {
  const { data: session } = useSession();
  const { showToast } = useToast();
  const confirm = useConfirm();
  const isLoggedIn = !!session;

  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [suppliersError, setSuppliersError] = useState(null);
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
    setSuppliersError(null);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (keyword) params.set('keyword', keyword);
      const response = await fetch(`/api/suppliers?${params}`);
      if (!response.ok) { setSuppliersError('廠商列表載入失敗，請稍後再試'); setLoading(false); return; }
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
    } catch {
      setSuppliersError('廠商列表載入失敗，請稍後再試');
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

  function handleCancelForm() {
    setShowAddForm(false);
    setEditingSupplier(null);
    setFormData(emptyForm);
    setContracts([]);
  }

  return {
    // session
    isLoggedIn,
    // list state
    suppliers,
    loading,
    suppliersError,
    allSuppliers,
    totalCount,
    currentPage,
    itemsPerPage,
    setItemsPerPage,
    fetchSuppliers,
    // form state
    showAddForm,
    setShowAddForm,
    editingSupplier,
    formData,
    setFormData,
    supplierSaving,
    handleSubmit,
    handleEdit,
    handleDelete,
    handleCancelForm,
    // contracts
    contracts,
    setContracts,
    uploadingContract,
    handleUploadContract,
    handleDeleteContract,
    formatFileSize,
    // sort / filter
    sortType,
    setSortType,
    filterKeyword,
    setFilterKeyword,
    showSortMenu,
    setShowSortMenu,
    searchTimer,
    setSearchTimer,
    handleSortChange,
    handleFilterChange,
    applySortAndFilter,
    // date filter
    showDateFilterMenu,
    setShowDateFilterMenu,
    dateFilterType,
    setDateFilterType,
    customDateRange,
    setCustomDateRange,
    handleDateFilterChange,
    handleCustomDateChange,
    getDateFilterLabel,
    // banner
    bannerDismissed,
    setBannerDismissed,
    expiringItems,
    expiredItems,
    soonItems,
    // computed
    getExpiryStatus,
    // payment terms
    paymentTermsOptions,
    showTermsManager,
    setShowTermsManager,
    newTermName,
    setNewTermName,
  };
}
