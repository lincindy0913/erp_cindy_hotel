'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import Navigation from '@/components/Navigation';
import NotificationBanner from '@/components/NotificationBanner';
import FetchErrorBanner from '@/components/FetchErrorBanner';
import { useToast } from '@/context/ToastContext';
import { todayStr } from '@/lib/localDate';
import { usePaymentOrders } from './_hooks/usePaymentOrders';
import { usePaymentForm } from './_hooks/usePaymentForm';
import { useFinanceSearch } from './_hooks/useFinanceSearch';
import { usePaymentOptions } from './_hooks/usePaymentOptions';
import HelpButton from '@/components/HelpButton';
import ModuleGuideCard from '@/components/ModuleGuideCard';
import AddPaymentFormSection from './_tabs/AddPaymentFormSection';
import SearchFilterBar from './_tabs/SearchFilterBar';
import PaymentOrdersTable from './_tabs/PaymentOrdersTable';
import WarehouseReportModal from './_tabs/WarehouseReportModal';
import PurchaseReportModal from './_tabs/PurchaseReportModal';

export default function PaymentPage() {
  const { data: session } = useSession();
  const { showToast } = useToast();
  const isLoggedIn = !!session;

  // ── 付款單列表、操作、狀態 ──────────────────────────────────────────────
  const {
    orders,
    loading,
    ordersError,
    expandedOrders,
    selectedOrderIds,
    activeTab, setActiveTab,
    batchSubmitting,
    submittingOrderId,
    highlightOrderNo,
    submittedToCashier, setSubmittedToCashier,
    fetchOrders,
    handleDelete,
    handleOrderToggle,
    handleSelectAllOrders: handleSelectAllOrdersBase,
    handleBatchSubmitToCashier: handleBatchSubmitToCashierBase,
    handleSubmitToCashier,
    handleResubmit,
    handleVoid,
    handleViewDetails,
    getStatusBadge,
  } = usePaymentOrders();

  // ── 付款條件 / 方式 / 帳戶選項 ─────────────────────────────────────────
  const {
    paymentTermsOptions, setPaymentTermsOptions,
    showTermsManager, setShowTermsManager,
    newTermName, setNewTermName,
    paymentMethodOptions, setPaymentMethodOptions,
    showMethodManager, setShowMethodManager,
    newMethodName, setNewMethodName,
    cashAccounts,
    fetchCashAccounts,
  } = usePaymentOptions({ orders });

  // ── 未付款發票 / 廠商 / 發票（非 hook 管理的資料源） ─────────────────
  const [unpaidInvoices, setUnpaidInvoices] = useState([]);
  const [allInvoices, setAllInvoices] = useState([]);
  const [suppliers, setSuppliers] = useState([]);

  // ── 付款表單 ───────────────────────────────────────────────────────────
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState(new Set());

  const {
    showAddForm, setShowAddForm,
    loadingInvoices, setLoadingInvoices,
    formSaving, setFormSaving,
    filterData, setFilterData,
    formData, setFormData,
    calculateTotal,
    handleInvoiceToggle,
    handleSelectAll,
    resetFilterAndForm,
    handleSubmit,
    getSupplierName,
  } = usePaymentForm({
    suppliers,
    unpaidInvoices,
    selectedInvoiceIds,
    setSelectedInvoiceIds,
    paymentMethodOptions,
    setPaymentMethodOptions,
    onAfterSubmit: () => {
      setUnpaidInvoices([]);
      setActiveTab('draft');
      fetchOrders();
    },
  });

  // ── 搜尋篩選 / Tab / 排序 ──────────────────────────────────────────────
  const {
    finSearchDateFrom, setFinSearchDateFrom,
    finSearchDateTo, setFinSearchDateTo,
    finSearchWarehouse, setFinSearchWarehouse,
    finSearchSupplierId, setFinSearchSupplierId,
    finSearchPaymentMethod, setFinSearchPaymentMethod,
    draftOrders,
    pendingOrders,
    executedOrders,
    rejectedOrders,
    TABS,
    finSortKey,
    finSortDir,
    toggleFinSort,
    getDisplayOrders: getDisplayOrdersForTab,
    getFilteredDisplayOrders,
    getSortedDisplayOrders,
  } = useFinanceSearch({ orders, suppliers, paymentMethodOptions });

  // ── 本地衍生計算（JSX 直接使用的 const） ───────────────────────────────
  const rawDisplayOrders = getDisplayOrdersForTab(activeTab);
  const displayOrders = useMemo(
    () => getFilteredDisplayOrders(activeTab),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rawDisplayOrders, finSearchDateFrom, finSearchDateTo, finSearchWarehouse, finSearchSupplierId, finSearchPaymentMethod]
  );
  const sortedDisplayOrders = useMemo(
    () => getSortedDisplayOrders(displayOrders),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [displayOrders, finSortKey, finSortDir]
  );

  // ── Wrapper：hook 版需要傳 displayOrders 參數 ──────────────────────────
  function getDisplayOrders() { return getDisplayOrdersForTab(activeTab); }
  function handleSelectAllOrders() { handleSelectAllOrdersBase(displayOrders); }
  function handleBatchSubmitToCashier() { handleBatchSubmitToCashierBase(displayOrders); }

  // ── 報表相關狀態（非 hook 管理） ──────────────────────────────────────
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

  // ── 初始資料載入 ────────────────────────────────────────────────────────
  useEffect(() => {
    fetchOrders();
    fetchSuppliers();
    fetchAllInvoices();
    fetchCashAccounts();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function fetchSuppliers() {
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

  // 查詢未付款的發票
  async function fetchUnpaidInvoices() {
    setLoadingInvoices(true);
    try {
      const params = new URLSearchParams();
      if (filterData.yearMonth) params.append('yearMonth', filterData.yearMonth);
      if (filterData.supplierId) params.append('supplierId', filterData.supplierId);
      if (filterData.warehouse) params.append('warehouse', filterData.warehouse);
      if (filterData.paymentTerms) params.append('paymentTerms', filterData.paymentTerms);

      const url = `/api/sales/unpaid?${params.toString()}`;
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

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

  function getInvoicesForOrder(order) {
    if (order.invoiceIds && Array.isArray(order.invoiceIds)) {
      return order.invoiceIds;
    }
    return [];
  }

  function getInvoiceDetails(invoiceId) {
    return allInvoices.find(inv => inv.id === invoiceId);
  }

  // 按館別列印報表：依報表月份篩選草稿，再依館別分組
  const draftOrdersInReportMonth = draftOrders.filter(o => {
    const created = o.createdAt ? o.createdAt.slice(0, 7) : '';
    return created === reportMonth;
  });
  const warehouseOptionsForReport = [
    { value: '', label: '全部館別（分頁列印）' },
    ...Array.from(new Set(draftOrdersInReportMonth.map(o => o.warehouse || '').filter(Boolean))).sort().map(w => ({ value: w, label: w })),
    ...(draftOrdersInReportMonth.some(o => !o.warehouse) ? [{ value: '__none__', label: '未指定館別' }] : []),
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

  // 按進貨單的館別列印：查詢進貨單館別對應的付款單
  async function fetchPurchaseReport() {
    if (!purchaseReportMonth && !purchaseReportDateFrom && !purchaseReportDateTo) { showToast('請選擇月份或日期區間', 'error'); return; }
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

  // 按搜尋結果列印付款單（依館別分頁）
  function handlePrintFilteredByWarehouse() {
    const rows = sortedDisplayOrders;
    if (rows.length === 0) { showToast('無資料可列印', 'error'); return; }
    const groups = {};
    rows.forEach(o => { const k = o.warehouse || '未指定館別'; if (!groups[k]) groups[k] = []; groups[k].push(o); });
    const filterInfo = [];
    if (finSearchDateFrom || finSearchDateTo) filterInfo.push(`日期: ${finSearchDateFrom || '~'} ~ ${finSearchDateTo || '~'}`);
    if (finSearchWarehouse) filterInfo.push(`館別: ${finSearchWarehouse}`);
    if (finSearchSupplierId) { const s = suppliers.find(s => String(s.id) === finSearchSupplierId); filterInfo.push(`廠商: ${s?.name || ''}`); }
    if (finSearchPaymentMethod) filterInfo.push(`付款方式: ${finSearchPaymentMethod}`);
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(`<html><head><title>付款單 — 按館別列印</title>
      <style>body{font-family:'Microsoft JhengHei',sans-serif;padding:20px}
      table{width:100%;border-collapse:collapse;font-size:12px;margin-bottom:20px}
      th,td{border:1px solid #ccc;padding:6px 8px;text-align:left}
      th{background:#f5f5f5;font-weight:600} .right{text-align:right}
      h2{margin:0 0 4px} h3{margin:16px 0 8px} .info{color:#666;font-size:12px;margin-bottom:12px}
      .page-break{page-break-before:always}
      @media print{button{display:none}}</style></head><body>
      <h2>付款管理 — ${activeTab === 'draft' ? '草稿' : activeTab === 'pending' ? '待出納' : activeTab === 'executed' ? '已執行' : '已拒絕'}</h2>
      <div class="info">${filterInfo.length ? filterInfo.join('　') + '<br>' : ''}列印時間: ${new Date().toLocaleString('zh-TW')}</div>`);
    let first = true;
    Object.entries(groups).sort().forEach(([wh, list]) => {
      if (!first) w.document.write('<div class="page-break"></div>');
      first = false;
      const total = list.reduce((s, o) => s + Number(o.netAmount || 0), 0);
      w.document.write(`<h3>館別: ${wh} (${list.length} 筆)</h3>
      <table><thead><tr><th>付款單號</th><th>廠商</th><th>付款方式</th><th class="right">淨額</th><th>狀態</th><th>建立日期</th></tr></thead><tbody>`);
      list.forEach(o => {
        w.document.write(`<tr><td>${o.orderNo}</td><td>${o.supplierName || '－'}</td><td>${o.paymentMethod || '－'}</td>
          <td class="right">${Number(o.netAmount || 0).toLocaleString()}</td><td>${o.status}</td>
          <td>${o.createdAt ? new Date(o.createdAt).toLocaleDateString('zh-TW') : '－'}</td></tr>`);
      });
      w.document.write(`</tbody><tfoot><tr><td colspan="3" class="right"><strong>小計</strong></td>
        <td class="right"><strong>${total.toLocaleString()}</strong></td><td colspan="2"></td></tr></tfoot></table>`);
    });
    const grandTotal = rows.reduce((s, o) => s + Number(o.netAmount || 0), 0);
    w.document.write(`<div style="font-size:14px;font-weight:700;margin-top:8px">總計: ${rows.length} 筆, NT$ ${grandTotal.toLocaleString()}</div>
    <button onclick="window.print()" style="margin-top:12px;padding:8px 20px;font-size:14px;cursor:pointer">列印</button></body></html>`);
    w.document.close();
  }

  // 匯出Excel
  function handleFinExportExcel() {
    const rows = sortedDisplayOrders;
    if (rows.length === 0) { showToast('無資料可匯出', 'error'); return; }
    const header = ['付款單號', '廠商', '館別', '付款方式', '發票數', '折讓', '淨額', '狀態', '建立日期'];
    const csvRows = [header.join(',')];
    rows.forEach(o => {
      csvRows.push([
        o.orderNo || '',
        (o.supplierName || '').replace(/,/g, '，'),
        o.warehouse || '',
        o.paymentMethod || '',
        (o.invoices?.length || 0),
        Number(o.discount || 0),
        Number(o.netAmount || 0),
        o.status || '',
        o.createdAt ? new Date(o.createdAt).toLocaleDateString('zh-TW') : ''
      ].map(c => `"${c}"`).join(','));
    });
    const blob = new Blob(['﻿' + csvRows.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `付款單_${todayStr()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="min-h-screen page-bg-finance">
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          .no-print-finance, .no-print-finance * { visibility: hidden !important; }
          #finance-warehouse-report-print-root { visibility: visible !important; position: absolute !important; left: 0 !important; top: 0 !important; width: 100% !important; background: #fff !important; z-index: 99999 !important; }
          #finance-warehouse-report-print-root * { visibility: visible !important; }
        }
      `}} />
      <Navigation borderColor="border-indigo-500" />
      <NotificationBanner moduleFilter="finance" />

      {submittedToCashier && (
        <div className="max-w-7xl mx-auto px-4 pt-3">
          <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm text-green-800">
            <span>✓ 付款單已送出，請至出納執行匯款。</span>
            <Link href="/cashier" className="ml-1 px-3 py-1 bg-green-600 text-white text-xs rounded-lg hover:bg-green-700 transition-colors whitespace-nowrap">
              前往出納 →
            </Link>
            <button
              onClick={() => setSubmittedToCashier(false)}
              className="ml-auto text-green-500 hover:text-green-700 text-lg leading-none"
              aria-label="關閉提示"
            >
              ×
            </button>
          </div>
        </div>
      )}

      {ordersError && (
        <div className="max-w-7xl mx-auto px-4 pt-4">
          <FetchErrorBanner message={ordersError} onRetry={fetchOrders} />
        </div>
      )}

      <main className="max-w-7xl mx-auto px-4 py-8">
        <ModuleGuideCard
          title="財務付款日常流程"
          color="blue"
          steps={[
            { label: '審核待付款單', desc: '查看「草稿」分頁，確認金額與廠商資訊無誤' },
            { label: '送出出納', desc: '點擊「送出出納」→ 付款單狀態變為「待出納」；如需批次送出可多選後批次操作' },
            { label: '確認出納執行狀態', desc: '切換到「待出納」分頁確認是否已執行，或直接前往出納', link: { href: '/cashier', text: '前往出納' } },
            { label: '存簿核對', desc: '月底前到「存簿核對」將銀行月結單與系統對帳', link: { href: '/bank-reconciliation', text: '前往存簿核對' } },
            { label: '月結', desc: '確認所有付款執行完畢後執行月結鎖定', link: { href: '/month-end', text: '前往月結' } },
          ]}
        />
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-2">
            <h2 className="text-2xl font-bold">付款管理</h2>
            <HelpButton anchor="六財務付款" />
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handlePrintFilteredByWarehouse}
              className="bg-white border border-indigo-300 text-indigo-700 px-4 py-2 rounded-lg hover:bg-indigo-50 text-sm"
            >
              按付款單的館別列印
            </button>
            <button
              type="button"
              onClick={() => {
                // 預填搜尋條件到進貨報表
                if (finSearchDateFrom) {
                  setPurchaseReportDateFrom(finSearchDateFrom);
                  setPurchaseReportMonth('');
                }
                if (finSearchDateTo) {
                  setPurchaseReportDateTo(finSearchDateTo);
                  setPurchaseReportMonth('');
                }
                if (finSearchWarehouse) {
                  setPurchaseReportWarehouse(finSearchWarehouse);
                }
                if (finSearchSupplierId) {
                  setPurchaseReportSupplierId(finSearchSupplierId);
                }
                setShowPurchaseReportModal(true);
              }}
              className="bg-white border border-green-300 text-green-700 px-4 py-2 rounded-lg hover:bg-green-50 text-sm"
            >
              按進貨單的館別列印
            </button>
            <button onClick={handleFinExportExcel}
              className="px-3 py-2 rounded-lg text-sm font-medium bg-white text-green-700 hover:bg-green-50 border border-green-300">
              📥 匯出Excel
            </button>
            {isLoggedIn && (
              <button
                onClick={() => {
                  setShowAddForm(!showAddForm);
                  if (!showAddForm) {
                    setSelectedInvoiceIds(new Set());
                    setUnpaidInvoices([]);
                    resetFilterAndForm();
                  }
                }}
                className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700"
              >
                + 新增付款單
              </button>
            )}
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-lg shadow p-4 border-l-4 border-gray-400">
            <p className="text-sm text-gray-500">草稿</p>
            <p className="text-2xl font-bold text-gray-700">{draftOrders.length}</p>
          </div>
          <div className="bg-white rounded-lg shadow p-4 border-l-4 border-yellow-500">
            <p className="text-sm text-gray-500">待出納</p>
            <p className="text-2xl font-bold text-yellow-700">{pendingOrders.length}</p>
          </div>
          <div className="bg-white rounded-lg shadow p-4 border-l-4 border-green-500">
            <p className="text-sm text-gray-500">已執行</p>
            <p className="text-2xl font-bold text-green-700">{executedOrders.length}</p>
          </div>
          <div className="bg-white rounded-lg shadow p-4 border-l-4 border-red-400">
            <p className="text-sm text-gray-500">已拒絕</p>
            <p className="text-2xl font-bold text-red-600">{rejectedOrders.length}</p>
          </div>
        </div>

        {/* 新增付款表單 */}
        {showAddForm && (
          <AddPaymentFormSection
            filterData={filterData}
            setFilterData={setFilterData}
            formData={formData}
            setFormData={setFormData}
            formSaving={formSaving}
            setFormSaving={setFormSaving}
            loadingInvoices={loadingInvoices}
            unpaidInvoices={unpaidInvoices}
            setUnpaidInvoices={setUnpaidInvoices}
            selectedInvoiceIds={selectedInvoiceIds}
            setSelectedInvoiceIds={setSelectedInvoiceIds}
            fetchUnpaidInvoices={fetchUnpaidInvoices}
            handleSubmit={handleSubmit}
            handleInvoiceToggle={handleInvoiceToggle}
            handleSelectAll={handleSelectAll}
            calculateTotal={calculateTotal}
            resetFilterAndForm={resetFilterAndForm}
            getSupplierName={getSupplierName}
            setShowAddForm={setShowAddForm}
            suppliers={suppliers}
            paymentTermsOptions={paymentTermsOptions}
            setPaymentTermsOptions={setPaymentTermsOptions}
            showTermsManager={showTermsManager}
            setShowTermsManager={setShowTermsManager}
            newTermName={newTermName}
            setNewTermName={setNewTermName}
            paymentMethodOptions={paymentMethodOptions}
            setPaymentMethodOptions={setPaymentMethodOptions}
            showMethodManager={showMethodManager}
            setShowMethodManager={setShowMethodManager}
            newMethodName={newMethodName}
            setNewMethodName={setNewMethodName}
            cashAccounts={cashAccounts}
          />
        )}

        {/* 搜尋篩選 */}
        <SearchFilterBar
          finSearchDateFrom={finSearchDateFrom}
          setFinSearchDateFrom={setFinSearchDateFrom}
          finSearchDateTo={finSearchDateTo}
          setFinSearchDateTo={setFinSearchDateTo}
          finSearchWarehouse={finSearchWarehouse}
          setFinSearchWarehouse={setFinSearchWarehouse}
          finSearchSupplierId={finSearchSupplierId}
          setFinSearchSupplierId={setFinSearchSupplierId}
          finSearchPaymentMethod={finSearchPaymentMethod}
          setFinSearchPaymentMethod={setFinSearchPaymentMethod}
          orders={orders}
          suppliers={suppliers}
          paymentMethodOptions={paymentMethodOptions}
          displayOrders={displayOrders}
          rawDisplayOrders={rawDisplayOrders}
        />

        {/* Tabs */}
        <div className="flex gap-2 mb-4">
          {TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === tab.key
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white text-gray-600 hover:bg-indigo-50 border border-gray-200'
              }`}
            >
              {tab.label} ({tab.count})
            </button>
          ))}
        </div>

        {/* 付款單列表 */}
        <PaymentOrdersTable
          loading={loading}
          sortedDisplayOrders={sortedDisplayOrders}
          displayOrders={displayOrders}
          activeTab={activeTab}
          expandedOrders={expandedOrders}
          selectedOrderIds={selectedOrderIds}
          highlightOrderNo={highlightOrderNo}
          batchSubmitting={batchSubmitting}
          submittingOrderId={submittingOrderId}
          isLoggedIn={isLoggedIn}
          cashAccounts={cashAccounts}
          allInvoices={allInvoices}
          finSortKey={finSortKey}
          finSortDir={finSortDir}
          toggleFinSort={toggleFinSort}
          handleOrderToggle={handleOrderToggle}
          handleSelectAllOrders={handleSelectAllOrders}
          handleBatchSubmitToCashier={handleBatchSubmitToCashier}
          handleViewDetails={handleViewDetails}
          handleSubmitToCashier={handleSubmitToCashier}
          handleVoid={handleVoid}
          handleDelete={handleDelete}
          handleResubmit={handleResubmit}
          getStatusBadge={getStatusBadge}
          getDisplayOrders={getDisplayOrders}
          getInvoicesForOrder={getInvoicesForOrder}
          getInvoiceDetails={getInvoiceDetails}
          getSupplierName={getSupplierName}
        />
      </main>

      {/* 按館別列印草稿報表 Modal */}
      <WarehouseReportModal
        showWarehouseReportModal={showWarehouseReportModal}
        setShowWarehouseReportModal={setShowWarehouseReportModal}
        reportMonth={reportMonth}
        setReportMonth={setReportMonth}
        reportWarehouse={reportWarehouse}
        setReportWarehouse={setReportWarehouse}
        warehouseOptionsForReport={warehouseOptionsForReport}
        reportOrdersByWarehouse={reportOrdersByWarehouse}
        getInvoicesForOrder={getInvoicesForOrder}
      />

      {/* 按進貨單的館別列印 Modal */}
      <PurchaseReportModal
        showPurchaseReportModal={showPurchaseReportModal}
        setShowPurchaseReportModal={setShowPurchaseReportModal}
        purchaseReportMonth={purchaseReportMonth}
        setPurchaseReportMonth={setPurchaseReportMonth}
        purchaseReportDateFrom={purchaseReportDateFrom}
        setPurchaseReportDateFrom={setPurchaseReportDateFrom}
        purchaseReportDateTo={purchaseReportDateTo}
        setPurchaseReportDateTo={setPurchaseReportDateTo}
        purchaseReportWarehouse={purchaseReportWarehouse}
        setPurchaseReportWarehouse={setPurchaseReportWarehouse}
        purchaseReportSupplierId={purchaseReportSupplierId}
        setPurchaseReportSupplierId={setPurchaseReportSupplierId}
        purchaseReportData={purchaseReportData}
        purchaseReportLoading={purchaseReportLoading}
        fetchPurchaseReport={fetchPurchaseReport}
        orders={orders}
        suppliers={suppliers}
      />
    </div>
  );
}
