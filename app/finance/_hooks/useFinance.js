'use client';

import { useState, useEffect } from 'react';
import { useToast } from '@/context/ToastContext';

export function useFinance({ draftOrders = [] } = {}) {
  const { showToast } = useToast();

  // ── 廠商 / 所有發票 ────────────────────────────────────────────────────
  const [suppliers, setSuppliers] = useState([]);
  const [allInvoices, setAllInvoices] = useState([]);

  // ── 報表相關狀態 ────────────────────────────────────────────────────────
  const [showWarehouseReportModal, setShowWarehouseReportModal] = useState(false);
  const [reportMonth, setReportMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [reportWarehouse, setReportWarehouse] = useState('');

  const [showPurchaseReportModal, setShowPurchaseReportModal] = useState(false);
  const [purchaseReportMonth, setPurchaseReportMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [purchaseReportWarehouse, setPurchaseReportWarehouse] = useState('');
  const [purchaseReportDateFrom, setPurchaseReportDateFrom] = useState('');
  const [purchaseReportDateTo, setPurchaseReportDateTo] = useState('');
  const [purchaseReportSupplierId, setPurchaseReportSupplierId] = useState('');
  const [purchaseReportData, setPurchaseReportData] = useState(null);
  const [purchaseReportLoading, setPurchaseReportLoading] = useState(false);

  // ── 初始資料載入 ─────────────────────────────────────────────────────────
  useEffect(() => {
    fetchSuppliersInternal();
    fetchAllInvoices();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function fetchSuppliersInternal() {
    try {
      const response = await fetch('/api/suppliers?all=true');
      if (!response.ok) { setSuppliers([]); return; }
      const data = await response.json();
      setSuppliers(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('取得廠商列表失敗:', error);
      setSuppliers([]);
    }
  }

  async function fetchAllInvoices() {
    try {
      const response = await fetch('/api/sales');
      if (!response.ok) { setAllInvoices([]); return; }
      const data = await response.json();
      setAllInvoices(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('取得發票列表失敗:', error);
      setAllInvoices([]);
    }
  }

  // ── 查詢未付款的發票（filterData 由呼叫端傳入，避免 hook 間依賴） ────
  async function fetchUnpaidInvoices({
    filterData,
    setLoadingInvoices,
    setUnpaidInvoices,
    setSelectedInvoiceIds,
  }) {
    setLoadingInvoices(true);
    try {
      const params = new URLSearchParams();
      if (filterData.yearMonth) params.append('yearMonth', filterData.yearMonth);
      if (filterData.supplierId) params.append('supplierId', filterData.supplierId);
      if (filterData.warehouse) params.append('warehouse', filterData.warehouse);
      if (filterData.paymentTerms) params.append('paymentTerms', filterData.paymentTerms);

      const url = `/api/sales/unpaid?${params.toString()}`;
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

      const data = await response.json();
      const invoices = Array.isArray(data) ? data : [];
      setUnpaidInvoices(invoices);
      setSelectedInvoiceIds(new Set());

      if (invoices.length === 0) {
        showToast('查詢完成，但沒有找到未付款的發票。\n\n請檢查：\n1. 篩選條件是否正確\n2. 是否有建立發票資料\n3. 該發票是否已被付款', 'info');
      }
    } catch (error) {
      console.error('取得未付款發票失敗:', error);
      setUnpaidInvoices([]);
      showToast('查詢失敗：' + (error.message || '請稍後再試'), 'error');
    } finally {
      setLoadingInvoices(false);
    }
  }

  // ── 輔助函式 ──────────────────────────────────────────────────────────
  function getInvoicesForOrder(order) {
    if (order.invoiceIds && Array.isArray(order.invoiceIds)) return order.invoiceIds;
    return [];
  }

  function getInvoiceDetails(invoiceId) {
    return allInvoices.find(inv => inv.id === invoiceId);
  }

  // ── 報表計算（依 reportMonth / reportWarehouse） ─────────────────────
  const draftOrdersInReportMonth = draftOrders.filter(o => {
    const created = o.createdAt ? o.createdAt.slice(0, 7) : '';
    return created === reportMonth;
  });

  const warehouseOptionsForReport = [
    { value: '', label: '全部館別（分頁列印）' },
    ...Array.from(new Set(draftOrdersInReportMonth.map(o => o.warehouse || '').filter(Boolean)))
      .sort()
      .map(w => ({ value: w, label: w })),
    ...(draftOrdersInReportMonth.some(o => !o.warehouse)
      ? [{ value: '__none__', label: '未指定館別' }]
      : []),
  ];

  const reportOrdersByWarehouse = reportWarehouse === ''
    ? (() => {
        const groups = {};
        draftOrdersInReportMonth.forEach(o => {
          const key = o.warehouse || '__none__';
          if (!groups[key]) groups[key] = [];
          groups[key].push(o);
        });
        return groups;
      })()
    : reportWarehouse === '__none__'
      ? { '__none__': draftOrdersInReportMonth.filter(o => !o.warehouse) }
      : { [reportWarehouse]: draftOrdersInReportMonth.filter(o => o.warehouse === reportWarehouse) };

  // ── 按進貨單的館別列印 ────────────────────────────────────────────────
  async function fetchPurchaseReport() {
    if (!purchaseReportMonth && !purchaseReportDateFrom && !purchaseReportDateTo) {
      showToast('請選擇月份或日期區間', 'error');
      return;
    }
    setPurchaseReportLoading(true);
    setPurchaseReportData(null);
    try {
      const params = new URLSearchParams();
      if (purchaseReportDateFrom || purchaseReportDateTo) {
        if (purchaseReportDateFrom) params.set('dateFrom', purchaseReportDateFrom);
        if (purchaseReportDateTo) params.set('dateTo', purchaseReportDateTo);
      } else {
        params.set('month', purchaseReportMonth);
      }
      if (purchaseReportWarehouse) params.set('warehouse', purchaseReportWarehouse);
      if (purchaseReportSupplierId) params.set('supplierId', purchaseReportSupplierId);
      const res = await fetch(`/api/finance/purchase-warehouse-report?${params}`);
      if (res.ok) {
        const data = await res.json();
        setPurchaseReportData(data);
      } else {
        setPurchaseReportData({ error: '查詢失敗' });
      }
    } catch {
      setPurchaseReportData({ error: '查詢失敗' });
    }
    setPurchaseReportLoading(false);
  }

  // ── 開啟進貨報表並預填搜尋條件 ────────────────────────────────────────
  function openPurchaseReportWithFilter({ finSearchDateFrom, finSearchDateTo, finSearchWarehouse, finSearchSupplierId } = {}) {
    if (finSearchDateFrom) {
      setPurchaseReportDateFrom(finSearchDateFrom);
      setPurchaseReportMonth('');
    }
    if (finSearchDateTo) {
      setPurchaseReportDateTo(finSearchDateTo);
      setPurchaseReportMonth('');
    }
    if (finSearchWarehouse) setPurchaseReportWarehouse(finSearchWarehouse);
    if (finSearchSupplierId) setPurchaseReportSupplierId(finSearchSupplierId);
    setShowPurchaseReportModal(true);
  }

  return {
    // data
    suppliers,
    allInvoices,
    // warehouse report
    showWarehouseReportModal, setShowWarehouseReportModal,
    reportMonth, setReportMonth,
    reportWarehouse, setReportWarehouse,
    warehouseOptionsForReport,
    reportOrdersByWarehouse,
    // purchase report
    showPurchaseReportModal, setShowPurchaseReportModal,
    purchaseReportMonth, setPurchaseReportMonth,
    purchaseReportWarehouse, setPurchaseReportWarehouse,
    purchaseReportDateFrom, setPurchaseReportDateFrom,
    purchaseReportDateTo, setPurchaseReportDateTo,
    purchaseReportSupplierId, setPurchaseReportSupplierId,
    purchaseReportData,
    purchaseReportLoading,
    fetchPurchaseReport,
    openPurchaseReportWithFilter,
    // helpers
    fetchUnpaidInvoices,
    getInvoicesForOrder,
    getInvoiceDetails,
  };
}
