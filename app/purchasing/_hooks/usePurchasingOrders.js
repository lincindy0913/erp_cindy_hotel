'use client';

import { useState, useEffect, useMemo } from 'react';
import { useToast } from '@/context/ToastContext';
import { useConfirm } from '@/context/ConfirmContext';
import { sortRows, useColumnSort } from '@/components/SortableTh';
import { todayStr } from '@/lib/localDate';
import { ALLOWANCE_STATUS } from '@/lib/allowance-statuses';
import { useWarehouseDepartments } from '@/hooks/useWarehouseDepartments';
import { useReorderSuggestions } from '@/hooks/useReorderSuggestions';

export function usePurchasingOrders({ searchParams, products, suppliers }) {
  const { showToast } = useToast();
  const confirm = useConfirm();

  const [showAddForm, setShowAddForm] = useState(false);
  const [editingPurchase, setEditingPurchase] = useState(null);
  const [items, setItems] = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [allPurchases, setAllPurchases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(null);
  const [expandedPurchaseId, setExpandedPurchaseId] = useState(null);
  const [filterData, setFilterData] = useState({
    supplierId: '',
    startDate: searchParams.get('startDate') || '',
    endDate:   searchParams.get('endDate')   || '',
    warehouse: searchParams.get('warehouse') || '',
    status:    searchParams.get('status')    || '',
  });
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(50);
  const [totalCount, setTotalCount] = useState(0);
  const [formData, setFormData] = useState({
    warehouse: '',
    department: '',
    supplierId: '',
    purchaseDate: todayStr(),
    paymentTerms: '月結',
  });
  const [newItem, setNewItem] = useState({
    productId: '',
    quantity: '',
    unitPrice: '',
    note: '',
    inventoryWarehouse: '',
  });
  const [productSearch, setProductSearch] = useState('');
  const [showProductDropdown, setShowProductDropdown] = useState(false);
  const [recentPurchases, setRecentPurchases] = useState([]);
  const [allProductPurchases, setAllProductPurchases] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [priceCache, setPriceCache] = useState(null);
  const [supplierSearch, setSupplierSearch] = useState('');
  const [showSupplierDropdown, setShowSupplierDropdown] = useState(false);
  const [editingItemIndex, setEditingItemIndex] = useState(null);
  const [invoicedIds, setInvoicedIds] = useState(new Set());
  const [purchasingPaymentOrderIds, setPurchasingPaymentOrderIds] = useState(new Set());
  const [purchaseSaving, setPurchaseSaving] = useState(false);

  // 館別部門管理
  const warehouseDepts = useWarehouseDepartments({
    showToast,
    confirm,
    onWarehouseDeleted: (name) => {
      if (formData.warehouse === name) setFormData(f => ({ ...f, warehouse: '', department: '' }));
    },
    onDepartmentDeleted: (warehouse, deptName) => {
      if (formData.warehouse === warehouse && formData.department === deptName)
        setFormData(f => ({ ...f, department: '' }));
    },
  });

  // 補貨建議
  const reorderHook = useReorderSuggestions({
    products,
    onApply: ({ supplierId, supplierName, paymentTerms, warehouse, productId, product, suggestedQty, lastUnitPrice }) => {
      if (supplierId) {
        setFormData(f => ({ ...f, supplierId: String(supplierId), paymentTerms: paymentTerms || '月結', warehouse: f.warehouse || warehouse }));
        setSupplierSearch(supplierName || '');
      }
      if (product) {
        setProductSearch(product.name);
        setNewItem({
          productId: String(productId),
          quantity: String(suggestedQty),
          unitPrice: lastUnitPrice != null ? String(lastUnitPrice) : '',
          note: '',
          inventoryWarehouse: product.isInStock ? warehouse : '',
        });
        fetchRecentPurchases(productId);
      }
      setShowAddForm(true);
      setEditingPurchase(null);
      setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 50);
    },
  });

  // 待辦：已入庫但未建發票/付款單
  const deliveredPendingItems = useMemo(() => {
    const delivered = purchases.filter(p => p.status === '已入庫');
    const uninvoiced = delivered.filter(p => {
      const its = p.items || [];
      return its.length === 0
        ? !invoicedIds.has(`${p.id}-0`)
        : its.some((_, idx) => !invoicedIds.has(`${p.id}-${idx}`));
    });
    const unpaid = delivered.filter(p => !purchasingPaymentOrderIds.has(p.id));
    return { uninvoiced, unpaid };
  }, [purchases, invoicedIds, purchasingPaymentOrderIds]);

  // 篩選產品
  const filteredProducts = useMemo(() => products.filter(p => {
    if (!productSearch.trim()) return true;
    const keyword = productSearch.toLowerCase().trim();
    return (
      (p.name && p.name.toLowerCase().includes(keyword)) ||
      (p.code && p.code.toLowerCase().includes(keyword)) ||
      (p.category && p.category.toLowerCase().includes(keyword))
    );
  }), [products, productSearch]);

  // 篩選廠商
  const filteredSuppliers = useMemo(() => suppliers.filter(s => {
    if (!supplierSearch.trim()) return true;
    const keyword = supplierSearch.toLowerCase().trim();
    return (
      (s.name && s.name.toLowerCase().includes(keyword)) ||
      (s.taxId && s.taxId.includes(keyword)) ||
      (s.contact && s.contact.toLowerCase().includes(keyword))
    );
  }), [suppliers, supplierSearch]);

  // 排序
  const { sortKey: purSortKey, sortDir: purSortDir, toggleSort: togglePurSort } = useColumnSort('purchaseDate', 'desc');
  const sortedPurchases = useMemo(() => {
    const acc = {
      purchaseNo: (r) => r.purchaseNo || '',
      warehouse: (r) => r.warehouse || '',
      department: (r) => r.department || '',
      supplier: (r) => r.supplierName || '',
      purchaseDate: (r) => r.purchaseDate || '',
      totalAmount: (r) => Number(r.totalAmount || r.amount || 0),
      stockStatus: (r) => {
        if (!r.items?.length) return r.status || '';
        const m = {};
        r.items.forEach((item) => {
          const s = item.status || r.status || '待入庫';
          m[s] = (m[s] || 0) + 1;
        });
        return Object.keys(m).sort().map((k) => `${k}:${m[k]}`).join('|');
      },
      invoiceStatus: (r) => {
        const ret = r.status === ALLOWANCE_STATUS.RETURNED ? '1' : r.status === ALLOWANCE_STATUS.PARTIAL_RETURN ? '2' : '0';
        if (!r.items?.length) return `${ret}-0-1`;
        let inv = 0; let uni = 0;
        r.items.forEach((item, idx) => {
          if (isItemInvoiced(r.id, idx)) inv++;
          else uni++;
        });
        return `${ret}-${String(inv).padStart(4, '0')}-${String(uni).padStart(4, '0')}`;
      },
    };
    return sortRows(purchases, purSortKey, purSortDir, acc);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [purchases, purSortKey, purSortDir, invoicedIds]);

  // 點擊外部關閉下拉選單
  useEffect(() => {
    function handleClickOutside(event) {
      const productDropdown = document.querySelector('.product-search-container');
      if (productDropdown && !productDropdown.contains(event.target)) setShowProductDropdown(false);
      const supplierDropdown = document.querySelector('.supplier-search-container');
      if (supplierDropdown && !supplierDropdown.contains(event.target)) setShowSupplierDropdown(false);
    }
    if (showProductDropdown || showSupplierDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showProductDropdown, showSupplierDropdown]);

  // URL 參數自動開啟編輯
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const editPurchaseNo = params.get('editPurchaseNo');
    if (editPurchaseNo && allPurchases.length > 0 && suppliers.length > 0 && products.length > 0) {
      const purchase = allPurchases.find(p => p.purchaseNo === editPurchaseNo);
      if (purchase) {
        handleEdit(purchase);
        window.history.replaceState({}, '', '/purchasing');
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allPurchases, suppliers, products]);

  function isItemInvoiced(purchaseId, itemIndex) {
    return invoicedIds.has(`${purchaseId}-${itemIndex}`);
  }

  function getPurchaseReturnInvoiceTag(purchase) {
    if (!purchase?.status) return null;
    if (purchase.status === ALLOWANCE_STATUS.RETURNED) {
      return { label: '全額退貨', className: 'bg-rose-100 text-rose-800 border border-rose-200' };
    }
    if (purchase.status === ALLOWANCE_STATUS.PARTIAL_RETURN) {
      return { label: '部分退貨', className: 'bg-amber-100 text-amber-900 border border-amber-200' };
    }
    return null;
  }

  async function fetchPurchases(page = currentPage, limit = itemsPerPage, filters = filterData) {
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (filters.supplierId) params.set('supplierId', filters.supplierId);
      if (filters.startDate) params.set('dateFrom', filters.startDate);
      if (filters.endDate) params.set('dateTo', filters.endDate);
      if (filters.warehouse) params.set('warehouse', filters.warehouse);
      if (filters.status) params.set('status', filters.status);
      const response = await fetch(`/api/purchasing?${params}`);
      if (!response.ok) {
        showToast('載入進貨單失敗，請稍後再試', 'error');
        setFetchError('進貨單載入失敗，請重新整理頁面。');
        setAllPurchases([]); setPurchases([]); setTotalCount(0); setLoading(false);
        return;
      }
      setFetchError(null);
      const result = await response.json();
      let purchaseList = [];
      if (result.data && result.pagination) {
        purchaseList = result.data;
        setAllPurchases(result.data);
        setPurchases(result.data);
        setTotalCount(result.pagination.totalCount);
        setCurrentPage(result.pagination.page);
      } else {
        purchaseList = Array.isArray(result) ? result : [];
        setAllPurchases(purchaseList);
        setPurchases(purchaseList);
        setTotalCount(purchaseList.length);
      }
      const visibleIds = purchaseList.map(p => p.id).filter(Boolean);
      if (visibleIds.length > 0) {
        try {
          const invRes = await fetch(`/api/purchasing/invoiced-ids?purchaseIds=${visibleIds.join(',')}`);
          setInvoicedIds(invRes.ok ? new Set(await invRes.json()) : new Set());
        } catch (_) {
          setInvoicedIds(new Set());
        }
        try {
          const poRes = await fetch('/api/payment-orders?sourceType=purchasing&all=true');
          if (poRes.ok) {
            const poData = await poRes.json();
            const orders = Array.isArray(poData) ? poData : (poData.data || []);
            setPurchasingPaymentOrderIds(new Set(
              orders
                .filter(po => po.status !== '已作廢')
                .map(po => po.sourceRecordId)
                .filter(Boolean)
            ));
          }
        } catch (_) {
          setPurchasingPaymentOrderIds(new Set());
        }
      } else {
        setInvoicedIds(new Set());
        setPurchasingPaymentOrderIds(new Set());
      }
      setLoading(false);
    } catch (error) {
      console.error('取得進貨單列表失敗:', error);
      showToast('載入進貨單失敗，請稍後再試', 'error');
      setAllPurchases([]); setPurchases([]); setTotalCount(0); setLoading(false);
    }
  }

  function handleFilterChange() {
    fetchPurchases(1, itemsPerPage, filterData);
  }

  function handleResetFilter() {
    const emptyFilter = { supplierId: '', startDate: '', endDate: '', warehouse: '', status: '' };
    setFilterData(emptyFilter);
    fetchPurchases(1, itemsPerPage, emptyFilter);
  }

  function handleViewDetails(purchaseId) {
    setExpandedPurchaseId(prev => (prev === purchaseId ? null : purchaseId));
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
    });
    const supplier = suppliers.find(s => s.id === purchase.supplierId);
    setSupplierSearch(supplier ? supplier.name : '');
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
        inventoryWarehouse: item.inventoryWarehouse || '',
        originalIndex: idx,
      };
    });
    setItems(purchaseItems);
  }

  function handleWarehouseChange(warehouse) {
    setFormData({ ...formData, warehouse, department: '' });
  }

  async function handleDelete(purchaseId) {
    if (!(await confirm('確定要刪除這張進貨單嗎？', { title: '刪除確認', danger: true }))) return;
    try {
      const response = await fetch(`/api/purchasing/${purchaseId}`, { method: 'DELETE' });
      if (response.ok) {
        showToast('進貨單刪除成功！', 'success');
        fetchPurchases(currentPage, itemsPerPage, filterData);
      } else {
        const error = await response.json();
        showToast('刪除失敗：' + (error.error || '未知錯誤'), 'error');
      }
    } catch (error) {
      console.error('刪除進貨單失敗:', error);
      showToast('刪除進貨單失敗，請稍後再試', 'error');
    }
  }

  async function fetchRecentPurchases(productId) {
    setLoadingHistory(true);
    setPriceCache(null);
    setAllProductPurchases([]);
    try {
      const [purchaseRes, cacheRes] = await Promise.all([
        fetch(`/api/products/${productId}/purchases`),
        fetch(`/api/products/${productId}/price-cache`).catch(() => null),
      ]);
      if (purchaseRes.ok) {
        const data = await purchaseRes.json();
        const all = data.purchases || [];
        setAllProductPurchases(all);
        setRecentPurchases(all.slice(0, 5));
      } else {
        setAllProductPurchases([]);
        setRecentPurchases([]);
      }
      if (cacheRes && cacheRes.ok) {
        const cacheData = await cacheRes.json();
        setPriceCache(cacheData);
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
      showToast('請填寫完整的商品資訊', 'error');
      return;
    }
    const product = products.find(p => p.id === parseInt(newItem.productId));
    if (!product) {
      showToast('找不到選定的產品', 'error');
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
      status: itemStatus,
      inventoryWarehouse: product.isInStock ? newItem.inventoryWarehouse : '',
    }]);
    setNewItem({ productId: '', quantity: '', unitPrice: '', note: '', inventoryWarehouse: '' });
    setProductSearch('');
    setRecentPurchases([]);
  }

  function removeItem(index) {
    setItems(items.filter((_, i) => i !== index));
  }

  function calculateTotal() {
    const subtotal = items.reduce((sum, item) => sum + (item.subtotal || 0), 0);
    return { subtotal: subtotal.toFixed(2), total: subtotal.toFixed(2) };
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (items.length === 0) { showToast('請至少新增一項商品', 'error'); return; }
    if (!formData.warehouse) { showToast('請選擇館別', 'error'); return; }
    if (!formData.department) { showToast('請選擇部門', 'error'); return; }
    if (!formData.supplierId) { showToast('請選擇廠商', 'error'); return; }

    setPurchaseSaving(true);
    try {
      const totals = calculateTotal();
      const purchaseData = {
        ...formData,
        items: items.map(item => ({
          productId: parseInt(item.productId),
          quantity: parseFloat(item.quantity),
          unitPrice: parseFloat(item.unitPrice),
          note: item.note || '',
          status: item.status || '不需入庫',
          inventoryWarehouse: item.inventoryWarehouse || null,
        })),
        amount: parseFloat(totals.total),
        tax: 0,
        totalAmount: parseFloat(totals.total),
      };
      const isEditing = !!editingPurchase;
      const url = isEditing ? `/api/purchasing/${editingPurchase.id}` : '/api/purchasing';
      const method = isEditing ? 'PUT' : 'POST';
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(purchaseData),
      });
      if (response.ok) {
        showToast(`進貨單${isEditing ? '更新' : '新增'}成功！`, 'success');
        setShowAddForm(false);
        setEditingPurchase(null);
        setItems([]);
        setFormData({ warehouse: '', department: '', supplierId: '', purchaseDate: todayStr(), paymentTerms: '月結' });
        setSupplierSearch('');
        fetchPurchases(currentPage, itemsPerPage, filterData);
      } else {
        const error = await response.json();
        showToast(`${isEditing ? '更新' : '新增'}失敗：` + (error.error || '未知錯誤'), 'error');
      }
    } catch (error) {
      console.error(`${editingPurchase ? '更新' : '新增'}進貨單失敗:`, error);
      showToast(`${editingPurchase ? '更新' : '新增'}進貨單失敗，請稍後再試`, 'error');
    } finally {
      setPurchaseSaving(false);
    }
  }

  function handleCancelForm() {
    setShowAddForm(false);
    setEditingPurchase(null);
    setItems([]);
    setSupplierSearch('');
    setPurchaseSaving(false);
    setFormData({ warehouse: '', department: '', supplierId: '', purchaseDate: todayStr(), paymentTerms: '月結' });
  }

  return {
    // state
    showAddForm, setShowAddForm,
    editingPurchase, setEditingPurchase,
    items, setItems,
    purchases, setPurchases,
    allPurchases,
    loading,
    fetchError,
    expandedPurchaseId,
    filterData, setFilterData,
    currentPage,
    itemsPerPage, setItemsPerPage,
    totalCount,
    formData, setFormData,
    newItem, setNewItem,
    productSearch, setProductSearch,
    showProductDropdown, setShowProductDropdown,
    recentPurchases, setRecentPurchases,
    allProductPurchases, setAllProductPurchases,
    loadingHistory,
    priceCache,
    supplierSearch, setSupplierSearch,
    showSupplierDropdown, setShowSupplierDropdown,
    editingItemIndex, setEditingItemIndex,
    invoicedIds,
    purchaseSaving,
    // derived
    deliveredPendingItems,
    filteredProducts,
    filteredSuppliers,
    sortedPurchases,
    purSortKey, purSortDir, togglePurSort,
    // handlers
    fetchPurchases,
    handleFilterChange,
    handleResetFilter,
    handleViewDetails,
    handleEdit,
    handleWarehouseChange,
    handleDelete,
    fetchRecentPurchases,
    addItem,
    removeItem,
    calculateTotal,
    handleSubmit,
    handleCancelForm,
    isItemInvoiced,
    getPurchaseReturnInvoiceTag,
    // warehouse/dept hook (forwarded)
    warehouseDepts,
    // reorder hook (forwarded)
    reorderHook,
  };
}
