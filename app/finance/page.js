'use client';

import { useState, useMemo } from 'react';
import { useSession } from 'next-auth/react';
import Navigation from '@/components/Navigation';
import NotificationBanner from '@/components/NotificationBanner';
import FetchErrorBanner from '@/components/FetchErrorBanner';
import { useToast } from '@/context/ToastContext';
import { usePaymentOrders } from './_hooks/usePaymentOrders';
import { usePaymentForm } from './_hooks/usePaymentForm';
import { useFinanceSearch } from './_hooks/useFinanceSearch';
import { usePaymentOptions } from './_hooks/usePaymentOptions';
import { useFinance } from './_hooks/useFinance';
import ModuleGuideCard from '@/components/ModuleGuideCard';
import FinanceHeader from './_components/FinanceHeader';
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
    orders, loading, ordersError,
    expandedOrders, selectedOrderIds,
    activeTab, setActiveTab,
    batchSubmitting, submittingOrderId, highlightOrderNo,
    submittedToCashier, setSubmittedToCashier,
    fetchOrders,
    handleDelete, handleOrderToggle,
    handleSelectAllOrders: handleSelectAllOrdersBase,
    handleBatchSubmitToCashier: handleBatchSubmitToCashierBase,
    handleSubmitToCashier, handleResubmit, handleVoid,
    handleViewDetails, getStatusBadge,
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
  } = usePaymentOptions({ orders });

  // ── 搜尋篩選 / Tab / 排序 ──────────────────────────────────────────────
  const {
    finSearchDateFrom, setFinSearchDateFrom,
    finSearchDateTo, setFinSearchDateTo,
    finSearchWarehouse, setFinSearchWarehouse,
    finSearchSupplierId, setFinSearchSupplierId,
    finSearchPaymentMethod, setFinSearchPaymentMethod,
    draftOrders, pendingOrders, executedOrders, rejectedOrders,
    TABS, finSortKey, finSortDir, toggleFinSort,
    getDisplayOrders: getDisplayOrdersForTab,
    getFilteredDisplayOrders, getSortedDisplayOrders,
    handleFinExportExcel: handleFinExportExcelRaw,
    handlePrintFilteredByWarehouse: handlePrintRaw,
  } = useFinanceSearch({ orders, suppliers: [], paymentMethodOptions });

  // ── 頁面級狀態與副作用（廠商、發票、報表）─────────────────────────────
  const {
    suppliers, allInvoices,
    showWarehouseReportModal, setShowWarehouseReportModal,
    reportMonth, setReportMonth,
    reportWarehouse, setReportWarehouse,
    warehouseOptionsForReport, reportOrdersByWarehouse,
    showPurchaseReportModal, setShowPurchaseReportModal,
    purchaseReportMonth, setPurchaseReportMonth,
    purchaseReportWarehouse, setPurchaseReportWarehouse,
    purchaseReportDateFrom, setPurchaseReportDateFrom,
    purchaseReportDateTo, setPurchaseReportDateTo,
    purchaseReportSupplierId, setPurchaseReportSupplierId,
    purchaseReportData, purchaseReportLoading,
    fetchPurchaseReport, openPurchaseReportWithFilter,
    fetchUnpaidInvoices, getInvoicesForOrder, getInvoiceDetails,
  } = useFinance({ draftOrders });

  // ── 選取的發票 IDs ─────────────────────────────────────────────────────
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState(new Set());
  const [unpaidInvoices, setUnpaidInvoices] = useState([]);

  // ── 付款表單 ───────────────────────────────────────────────────────────
  const {
    showAddForm, setShowAddForm,
    loadingInvoices, setLoadingInvoices,
    formSaving, setFormSaving,
    filterData, setFilterData,
    formData, setFormData,
    calculateTotal, handleInvoiceToggle, handleSelectAll,
    resetFilterAndForm, handleSubmit, getSupplierName,
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

  // ── 衍生計算 ──────────────────────────────────────────────────────────
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

  // ── Wrappers ──────────────────────────────────────────────────────────
  function getDisplayOrders() { return getDisplayOrdersForTab(activeTab); }
  function handleSelectAllOrders() { handleSelectAllOrdersBase(displayOrders); }
  function handleBatchSubmitToCashier() { handleBatchSubmitToCashierBase(displayOrders); }

  function buildFilterInfo() {
    const info = [];
    if (finSearchDateFrom || finSearchDateTo) info.push(`日期: ${finSearchDateFrom || '~'} ~ ${finSearchDateTo || '~'}`);
    if (finSearchWarehouse) info.push(`館別: ${finSearchWarehouse}`);
    if (finSearchSupplierId) {
      const s = suppliers.find(s => String(s.id) === finSearchSupplierId);
      info.push(`廠商: ${s?.name || ''}`);
    }
    if (finSearchPaymentMethod) info.push(`付款方式: ${finSearchPaymentMethod}`);
    return info;
  }

  function handlePrintFilteredByWarehouse() {
    const ok = handlePrintRaw(sortedDisplayOrders, activeTab, buildFilterInfo());
    if (ok === false) showToast('無資料可列印', 'error');
  }

  function handleFinExportExcel() {
    const ok = handleFinExportExcelRaw(sortedDisplayOrders, activeTab);
    if (ok === false) showToast('無資料可匯出', 'error');
  }

  function handleFetchUnpaidInvoices() {
    fetchUnpaidInvoices({ filterData, setLoadingInvoices, setUnpaidInvoices, setSelectedInvoiceIds });
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

        <FinanceHeader
          isLoggedIn={isLoggedIn}
          showAddForm={showAddForm} setShowAddForm={setShowAddForm}
          setSelectedInvoiceIds={setSelectedInvoiceIds}
          setUnpaidInvoices={setUnpaidInvoices}
          resetFilterAndForm={resetFilterAndForm}
          handlePrintFilteredByWarehouse={handlePrintFilteredByWarehouse}
          openPurchaseReportWithFilter={() => openPurchaseReportWithFilter({ finSearchDateFrom, finSearchDateTo, finSearchWarehouse, finSearchSupplierId })}
          handleFinExportExcel={handleFinExportExcel}
          draftOrders={draftOrders} pendingOrders={pendingOrders}
          executedOrders={executedOrders} rejectedOrders={rejectedOrders}
          submittedToCashier={submittedToCashier} setSubmittedToCashier={setSubmittedToCashier}
        />

        {/* 新增付款表單 */}
        {showAddForm && (
          <AddPaymentFormSection
            filterData={filterData} setFilterData={setFilterData}
            formData={formData} setFormData={setFormData}
            formSaving={formSaving} setFormSaving={setFormSaving}
            loadingInvoices={loadingInvoices}
            unpaidInvoices={unpaidInvoices} setUnpaidInvoices={setUnpaidInvoices}
            selectedInvoiceIds={selectedInvoiceIds} setSelectedInvoiceIds={setSelectedInvoiceIds}
            fetchUnpaidInvoices={handleFetchUnpaidInvoices}
            handleSubmit={handleSubmit}
            handleInvoiceToggle={handleInvoiceToggle}
            handleSelectAll={handleSelectAll}
            calculateTotal={calculateTotal}
            resetFilterAndForm={resetFilterAndForm}
            getSupplierName={getSupplierName}
            setShowAddForm={setShowAddForm}
            suppliers={suppliers}
            paymentTermsOptions={paymentTermsOptions} setPaymentTermsOptions={setPaymentTermsOptions}
            showTermsManager={showTermsManager} setShowTermsManager={setShowTermsManager}
            newTermName={newTermName} setNewTermName={setNewTermName}
            paymentMethodOptions={paymentMethodOptions} setPaymentMethodOptions={setPaymentMethodOptions}
            showMethodManager={showMethodManager} setShowMethodManager={setShowMethodManager}
            newMethodName={newMethodName} setNewMethodName={setNewMethodName}
            cashAccounts={cashAccounts}
          />
        )}

        {/* 搜尋篩選 */}
        <SearchFilterBar
          finSearchDateFrom={finSearchDateFrom} setFinSearchDateFrom={setFinSearchDateFrom}
          finSearchDateTo={finSearchDateTo} setFinSearchDateTo={setFinSearchDateTo}
          finSearchWarehouse={finSearchWarehouse} setFinSearchWarehouse={setFinSearchWarehouse}
          finSearchSupplierId={finSearchSupplierId} setFinSearchSupplierId={setFinSearchSupplierId}
          finSearchPaymentMethod={finSearchPaymentMethod} setFinSearchPaymentMethod={setFinSearchPaymentMethod}
          orders={orders} suppliers={suppliers} paymentMethodOptions={paymentMethodOptions}
          displayOrders={displayOrders} rawDisplayOrders={rawDisplayOrders}
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
          sortedDisplayOrders={sortedDisplayOrders} displayOrders={displayOrders}
          activeTab={activeTab} expandedOrders={expandedOrders}
          selectedOrderIds={selectedOrderIds} highlightOrderNo={highlightOrderNo}
          batchSubmitting={batchSubmitting} submittingOrderId={submittingOrderId}
          isLoggedIn={isLoggedIn} cashAccounts={cashAccounts} allInvoices={allInvoices}
          finSortKey={finSortKey} finSortDir={finSortDir} toggleFinSort={toggleFinSort}
          handleOrderToggle={handleOrderToggle}
          handleSelectAllOrders={handleSelectAllOrders}
          handleBatchSubmitToCashier={handleBatchSubmitToCashier}
          handleViewDetails={handleViewDetails}
          handleSubmitToCashier={handleSubmitToCashier}
          handleVoid={handleVoid} handleDelete={handleDelete} handleResubmit={handleResubmit}
          getStatusBadge={getStatusBadge} getDisplayOrders={getDisplayOrders}
          getInvoicesForOrder={getInvoicesForOrder} getInvoiceDetails={getInvoiceDetails}
          getSupplierName={getSupplierName}
        />
      </main>

      <WarehouseReportModal
        showWarehouseReportModal={showWarehouseReportModal}
        setShowWarehouseReportModal={setShowWarehouseReportModal}
        reportMonth={reportMonth} setReportMonth={setReportMonth}
        reportWarehouse={reportWarehouse} setReportWarehouse={setReportWarehouse}
        warehouseOptionsForReport={warehouseOptionsForReport}
        reportOrdersByWarehouse={reportOrdersByWarehouse}
        getInvoicesForOrder={getInvoicesForOrder}
      />

      <PurchaseReportModal
        showPurchaseReportModal={showPurchaseReportModal}
        setShowPurchaseReportModal={setShowPurchaseReportModal}
        purchaseReportMonth={purchaseReportMonth} setPurchaseReportMonth={setPurchaseReportMonth}
        purchaseReportDateFrom={purchaseReportDateFrom} setPurchaseReportDateFrom={setPurchaseReportDateFrom}
        purchaseReportDateTo={purchaseReportDateTo} setPurchaseReportDateTo={setPurchaseReportDateTo}
        purchaseReportWarehouse={purchaseReportWarehouse} setPurchaseReportWarehouse={setPurchaseReportWarehouse}
        purchaseReportSupplierId={purchaseReportSupplierId} setPurchaseReportSupplierId={setPurchaseReportSupplierId}
        purchaseReportData={purchaseReportData} purchaseReportLoading={purchaseReportLoading}
        fetchPurchaseReport={fetchPurchaseReport}
        orders={orders} suppliers={suppliers}
      />
    </div>
  );
}
