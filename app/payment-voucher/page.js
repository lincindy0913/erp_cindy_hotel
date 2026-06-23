'use client';

import { useSession } from 'next-auth/react';
import Navigation from '@/components/Navigation';
import FetchErrorBanner from '@/components/FetchErrorBanner';
import ModuleGuideCard from '@/components/ModuleGuideCard';
import { usePaymentVoucher } from './_hooks/usePaymentVoucher';
import MonthlyVoucherPanel from './_components/MonthlyVoucherPanel';
import PaymentOrdersPanel from './_components/PaymentOrdersPanel';
import InvoiceListPanel from './_components/InvoiceListPanel';
import FilterBar from './_components/FilterBar';

export default function PaymentVoucherListPage() {
  useSession();

  const {
    suppliers,
    loading,
    fetchError,
    filteredInvoices,
    filteredOrders,
    activeView,
    setActiveView,
    filterData,
    setFilterData,
    expandedOrderId,
    toggleExpand,
    selectedOrderIds,
    batchPrinting,
    toggleSelectOrder,
    toggleSelectAll,
    batchPrintVouchers,
    voucherFilter,
    setVoucherFilter,
    searchExecuted,
    setSearchExecuted,
    voucherPreview,
    previewLoading,
    preview,
    isLandscape,
    dateColumns,
    noteCount,
    suppliersWithData,
    suppliersLoading,
    selectedSupplierIds,
    monthlyBatchPrinting,
    fetchAll,
    fetchVoucherPreview,
    printPaymentVoucher,
    printMonthlyVoucher,
    handleSearch,
    toggleSelectSupplier,
    toggleSelectAllSuppliers,
    batchPrintMonthlyVouchers,
    getSupplierName,
    getInvoiceNo,
    getStatusBadge,
    setVoucherPreview,
  } = usePaymentVoucher();

  return (
    <div className="min-h-screen page-bg-finance">
      <Navigation borderColor="border-indigo-500" />

      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold">傳票列印</h2>
        </div>

        <ModuleGuideCard
          title="付款傳票流程指引"
          color="slate"
          storageKey="guide-payment-voucher"
          steps={[
            { label: '選擇廠商與月份', desc: '在月度廠商傳票分頁選擇廠商與結算月份' },
            { label: '查看付款單明細', desc: '在付款單追蹤分頁確認各發票對應的付款單' },
            { label: '列印傳票', desc: '單筆點選列印，或批次勾選後一次列印多份傳票' },
            { label: '月度批次列印', desc: '選取廠商後可一次產出整月所有廠商傳票' },
          ]}
        />

        {fetchError && <FetchErrorBanner message={fetchError} onRetry={fetchAll} />}

        {/* View Toggle */}
        <div className="flex gap-2 mb-6">
          {[
            { key: 'monthly', label: '月度廠商傳票' },
            { key: 'orders', label: `付款單追蹤 (${filteredOrders.length})` },
            { key: 'invoices', label: `發票列表 (${filteredInvoices.length})` },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveView(tab.key)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeView === tab.key
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white text-gray-600 hover:bg-indigo-50 border border-gray-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeView === 'monthly' && (
          <MonthlyVoucherPanel
            suppliers={suppliers}
            voucherFilter={voucherFilter}
            setVoucherFilter={setVoucherFilter}
            setSearchExecuted={setSearchExecuted}
            suppliersLoading={suppliersLoading}
            handleSearch={handleSearch}
            fetchVoucherPreview={fetchVoucherPreview}
            previewLoading={previewLoading}
            printMonthlyVoucher={printMonthlyVoucher}
            setVoucherPreview={setVoucherPreview}
            preview={preview}
            isLandscape={isLandscape}
            dateColumns={dateColumns}
            noteCount={noteCount}
            searchExecuted={searchExecuted}
            suppliersWithData={suppliersWithData}
            selectedSupplierIds={selectedSupplierIds}
            toggleSelectSupplier={toggleSelectSupplier}
            toggleSelectAllSuppliers={toggleSelectAllSuppliers}
            monthlyBatchPrinting={monthlyBatchPrinting}
            batchPrintMonthlyVouchers={batchPrintMonthlyVouchers}
          />
        )}

        {activeView !== 'monthly' && (
          <FilterBar
            filterData={filterData}
            setFilterData={setFilterData}
            suppliers={suppliers}
          />
        )}

        {activeView === 'orders' && (
          <PaymentOrdersPanel
            loading={loading}
            filteredOrders={filteredOrders}
            selectedOrderIds={selectedOrderIds}
            batchPrinting={batchPrinting}
            expandedOrderId={expandedOrderId}
            toggleSelectOrder={toggleSelectOrder}
            toggleSelectAll={toggleSelectAll}
            batchPrintVouchers={batchPrintVouchers}
            toggleExpand={toggleExpand}
            printPaymentVoucher={printPaymentVoucher}
            getInvoiceNo={getInvoiceNo}
            getStatusBadge={getStatusBadge}
          />
        )}

        {activeView === 'invoices' && (
          <InvoiceListPanel
            loading={loading}
            filteredInvoices={filteredInvoices}
            getSupplierName={getSupplierName}
          />
        )}
      </main>
    </div>
  );
}
