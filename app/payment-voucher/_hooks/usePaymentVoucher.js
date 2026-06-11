'use client';

import { useState, useEffect } from 'react';
import { useToast } from '@/context/ToastContext';
import { localDateStr } from '@/lib/localDate';

export function usePaymentVoucher() {
  const { showToast } = useToast();
  const [invoices, setInvoices] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [paymentOrders, setPaymentOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(null);
  const [activeView, setActiveView] = useState('monthly'); // 'monthly' | 'orders' | 'invoices'
  const [expandedOrderId, setExpandedOrderId] = useState(null);
  const [filterData, setFilterData] = useState({
    yearMonth: '',
    supplierId: '',
    warehouse: ''
  });
  const [filteredInvoices, setFilteredInvoices] = useState([]);

  // Batch print state
  const [selectedOrderIds, setSelectedOrderIds] = useState(new Set());
  const [batchPrinting, setBatchPrinting] = useState(false);

  // Monthly voucher state (spec23 v3)
  const today = new Date();
  const firstOfMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`;
  const todayStr = localDateStr(today);
  const [voucherFilter, setVoucherFilter] = useState({
    supplierId: '',
    startDate: firstOfMonth,
    endDate: todayStr,
    warehouse: ''
  });
  const [searchExecuted, setSearchExecuted] = useState(false);
  const [voucherPreview, setVoucherPreview] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  // Monthly batch state
  const [suppliersWithData, setSuppliersWithData] = useState([]);
  const [suppliersLoading, setSuppliersLoading] = useState(false);
  const [selectedSupplierIds, setSelectedSupplierIds] = useState(new Set());
  const [monthlyBatchPrinting, setMonthlyBatchPrinting] = useState(false);

  useEffect(() => {
    fetchAll();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    filterInvoices();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoices, filterData]);

  async function fetchAll() {
    setLoading(true);
    setFetchError(null);
    try {
      await Promise.all([fetchInvoices(), fetchSuppliers(), fetchPaymentOrders()]);
    } catch {
      setFetchError('資料載入失敗，請稍後再試');
    }
    setLoading(false);
  }

  async function fetchInvoices() {
    const response = await fetch('/api/sales/with-info');
    if (!response.ok) throw new Error('fetchInvoices');
    const data = await response.json();
    setInvoices(Array.isArray(data) ? data : []);
  }

  async function fetchSuppliers() {
    const response = await fetch('/api/suppliers?all=true');
    if (!response.ok) throw new Error('fetchSuppliers');
    const data = await response.json();
    setSuppliers(Array.isArray(data) ? data : []);
  }

  async function fetchPaymentOrders() {
    const response = await fetch('/api/payment-orders');
    if (!response.ok) throw new Error('fetchPaymentOrders');
    const data = await response.json();
    setPaymentOrders(Array.isArray(data) ? data : []);
  }

  function filterInvoices() {
    let filtered = [...invoices];
    if (filterData.yearMonth) {
      filtered = filtered.filter(invoice => {
        const invoiceYearMonth = invoice.invoiceDate ? invoice.invoiceDate.substring(0, 7) : '';
        return invoiceYearMonth === filterData.yearMonth;
      });
    }
    if (filterData.supplierId) {
      filtered = filtered.filter(invoice => invoice.supplierId && invoice.supplierId === parseInt(filterData.supplierId));
    }
    if (filterData.warehouse) {
      filtered = filtered.filter(invoice => invoice.warehouse && invoice.warehouse === filterData.warehouse);
    }
    setFilteredInvoices(filtered);
  }

  function getFilteredOrders() {
    let filtered = [...paymentOrders];
    if (filterData.supplierId) filtered = filtered.filter(o => o.supplierId === parseInt(filterData.supplierId));
    if (filterData.warehouse) filtered = filtered.filter(o => o.warehouse === filterData.warehouse);
    return filtered;
  }

  function getSupplierName(invoice) {
    return invoice.supplierName || '未知廠商';
  }

  function getInvoiceNo(invoiceId) {
    const invoice = invoices.find(inv => inv.id === invoiceId);
    return invoice ? (invoice.invoiceNo || invoice.salesNo || `#${invoiceId}`) : `#${invoiceId}`;
  }

  function getStatusBadge(status) {
    const map = {
      '草稿': 'bg-gray-100 text-gray-800',
      '待出納': 'bg-yellow-100 text-yellow-800',
      '已執行': 'bg-green-100 text-green-800',
      '已拒絕': 'bg-red-100 text-red-800',
      '已作廢': 'bg-gray-200 text-gray-500',
    };
    return map[status] || 'bg-gray-100 text-gray-800';
  }

  function toggleExpand(orderId) {
    setExpandedOrderId(expandedOrderId === orderId ? null : orderId);
  }

  // ---- Monthly Voucher (spec23 v3) ----
  async function fetchVoucherPreview() {
    if (!voucherFilter.supplierId || !voucherFilter.startDate || !voucherFilter.endDate) return;
    setPreviewLoading(true);
    setVoucherPreview(null);
    try {
      const params = new URLSearchParams({
        supplierId: voucherFilter.supplierId,
        startDate: voucherFilter.startDate,
        endDate: voucherFilter.endDate,
        warehouse: voucherFilter.warehouse,
      });
      const res = await fetch(`/api/payment-vouchers/preview?${params}`);
      if (res.ok) {
        const data = await res.json();
        setVoucherPreview(data);
      } else {
        const err = await res.json();
        setVoucherPreview({ error: err.error?.message || '無進貨資料' });
      }
    } catch {
      setVoucherPreview({ error: '載入失敗' });
    }
    setPreviewLoading(false);
  }

  async function printPaymentVoucher(orderId) {
    try {
      const res = await fetch(`/api/export/payment-voucher/${orderId}`, { credentials: 'include' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: { message: `HTTP ${res.status}` } }));
        showToast('列印失敗：' + (err.error?.message || err.error || '未知錯誤'), 'error');
        return;
      }
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      window.open(blobUrl, '_blank');
    } catch (e) {
      showToast('列印失敗：' + (e.message || '網路錯誤'), 'error');
    }
  }

  async function printMonthlyVoucher(showPriceNote = true) {
    if (!voucherFilter.supplierId || !voucherFilter.startDate || !voucherFilter.endDate) return;
    const params = new URLSearchParams({
      supplierId: voucherFilter.supplierId,
      startDate: voucherFilter.startDate,
      endDate: voucherFilter.endDate,
      warehouse: voucherFilter.warehouse,
      showPriceNote: showPriceNote ? 'true' : 'false',
    });
    const url = `/api/export/voucher-monthly?${params}`;
    try {
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: { message: `HTTP ${res.status}` } }));
        showToast('列印失敗：' + (err.error?.message || err.error || '未知錯誤'), 'error');
        return;
      }
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      window.open(blobUrl, '_blank');
    } catch (e) {
      showToast('列印失敗：' + (e.message || '網路錯誤'), 'error');
    }
  }

  // Monthly supplier list fetch
  async function fetchSuppliersWithData() {
    if (!voucherFilter.startDate || !voucherFilter.endDate) return;
    setSuppliersLoading(true);
    setSearchExecuted(true);
    try {
      const params = new URLSearchParams({
        startDate: voucherFilter.startDate,
        endDate: voucherFilter.endDate,
      });
      if (voucherFilter.warehouse) params.set('warehouse', voucherFilter.warehouse);
      const res = await fetch(`/api/payment-vouchers/suppliers-with-data?${params}`);
      const data = await res.json();
      setSuppliersWithData(Array.isArray(data) ? data : []);
    } catch {
      setSuppliersWithData([]);
    }
    setSuppliersLoading(false);
  }

  function handleSearch() {
    setVoucherPreview(null);
    setSelectedSupplierIds(new Set());
    fetchSuppliersWithData();
  }

  function toggleSelectSupplier(supplierId) {
    setSelectedSupplierIds(prev => {
      const next = new Set(prev);
      if (next.has(supplierId)) next.delete(supplierId);
      else next.add(supplierId);
      return next;
    });
  }

  function toggleSelectAllSuppliers() {
    if (selectedSupplierIds.size === suppliersWithData.length) {
      setSelectedSupplierIds(new Set());
    } else {
      setSelectedSupplierIds(new Set(suppliersWithData.map(s => s.id)));
    }
  }

  async function batchPrintMonthlyVouchers() {
    if (selectedSupplierIds.size === 0 || !voucherFilter.startDate || !voucherFilter.endDate) return;
    setMonthlyBatchPrinting(true);
    try {
      const res = await fetch('/api/export/voucher-monthly/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          startDate: voucherFilter.startDate,
          endDate: voucherFilter.endDate,
          warehouse: voucherFilter.warehouse,
          supplierIds: Array.from(selectedSupplierIds),
          showPriceNote: true,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: { message: `HTTP ${res.status}` } }));
        showToast('批量列印失敗：' + (err.error?.message || err.error || '未知錯誤'), 'error');
        return;
      }
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      window.open(blobUrl, '_blank');
    } catch (e) {
      showToast('批量列印失敗：' + (e.message || '網路錯誤'), 'error');
    } finally {
      setMonthlyBatchPrinting(false);
    }
  }

  // Batch select helpers
  function toggleSelectOrder(orderId) {
    setSelectedOrderIds(prev => {
      const next = new Set(prev);
      if (next.has(orderId)) next.delete(orderId);
      else next.add(orderId);
      return next;
    });
  }

  function toggleSelectAll(orders) {
    if (selectedOrderIds.size === orders.length) {
      setSelectedOrderIds(new Set());
    } else {
      setSelectedOrderIds(new Set(orders.map(o => o.id)));
    }
  }

  async function batchPrintVouchers() {
    if (selectedOrderIds.size === 0) return;
    setBatchPrinting(true);
    try {
      const res = await fetch('/api/export/payment-voucher/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ ids: Array.from(selectedOrderIds) }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: { message: `HTTP ${res.status}` } }));
        showToast('批量列印失敗：' + (err.error?.message || err.error || '未知錯誤'), 'error');
        return;
      }
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      window.open(blobUrl, '_blank');
    } catch (e) {
      showToast('批量列印失敗：' + (e.message || '網路錯誤'), 'error');
    } finally {
      setBatchPrinting(false);
    }
  }

  const filteredOrders = getFilteredOrders();
  const preview = voucherPreview;
  const isLandscape = preview?.printConfig?.orientation === 'landscape';
  const dateColumns = preview?.printConfig?.dateColumns || 0;
  const noteCount = preview?.priceNoteSummary?.noteCount || 0;

  return {
    // Data
    invoices,
    suppliers,
    loading,
    fetchError,
    filteredInvoices,
    filteredOrders,
    // View state
    activeView,
    setActiveView,
    filterData,
    setFilterData,
    // Order expand
    expandedOrderId,
    toggleExpand,
    // Batch order print
    selectedOrderIds,
    batchPrinting,
    toggleSelectOrder,
    toggleSelectAll,
    batchPrintVouchers,
    // Monthly voucher
    voucherFilter,
    setVoucherFilter,
    searchExecuted,
    setSearchExecuted,
    voucherPreview,
    setVoucherPreview,
    previewLoading,
    preview,
    isLandscape,
    dateColumns,
    noteCount,
    // Monthly batch
    suppliersWithData,
    suppliersLoading,
    selectedSupplierIds,
    monthlyBatchPrinting,
    // Actions
    fetchAll,
    fetchVoucherPreview,
    printPaymentVoucher,
    printMonthlyVoucher,
    handleSearch,
    toggleSelectSupplier,
    toggleSelectAllSuppliers,
    batchPrintMonthlyVouchers,
    // Helpers
    getSupplierName,
    getInvoiceNo,
    getStatusBadge,
  };
}
