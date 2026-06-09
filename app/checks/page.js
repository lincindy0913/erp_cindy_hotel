'use client';

import Navigation from '@/components/Navigation';
import NotificationBanner from '@/components/NotificationBanner';
import FetchErrorBanner from '@/components/FetchErrorBanner';
import ExportButtons from '@/components/ExportButtons';
import { EXPORT_CONFIGS } from '@/lib/export-columns';

import { useChecks } from './_hooks/useChecks';
import { useChecksPrint } from './_hooks/useChecksPrint';

import PendingTab from './_tabs/PendingTab';
import CrudTab from './_tabs/CrudTab';
import ScheduleTab from './_tabs/ScheduleTab';
import StatsTab from './_tabs/StatsTab';
import CheckModals from './_tabs/CheckModals';
import PrintModals from './_tabs/PrintModals';

const TABS = [
  { key: 'pending', label: '待兌現' },
  { key: 'payable', label: '應付支票' },
  { key: 'receivable', label: '應收支票' },
  { key: 'schedule', label: '到期日程' },
  { key: 'stats', label: '統計報表' }
];

export default function ChecksPage() {
  const checks = useChecks();
  const print = useChecksPrint({ checks: checks.checks, suppliers: checks.suppliers });

  return (
    <div className="min-h-screen bg-gray-50">
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          .no-print, .no-print * { visibility: hidden !important; }
          #check-pickup-print-root { visibility: visible !important; position: absolute !important; left: 0 !important; top: 0 !important; width: 100% !important; background: #fff !important; z-index: 99999 !important; }
          #check-pickup-print-root * { visibility: visible !important; }
        }
      `}} />

      <div className="no-print">
        <Navigation borderColor="border-violet-500" />
        <NotificationBanner moduleFilter="checks" />
        {checks.checksError && (
          <div className="max-w-7xl mx-auto px-4 pt-4">
            <FetchErrorBanner message={checks.checksError} onRetry={() => checks.fetchChecks({})} />
          </div>
        )}
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6 no-print">
        {/* Header */}
        <div className="flex items-center justify-between mb-6 no-print">
          <div>
            <h2 className="text-2xl font-bold text-gray-800">支票管理</h2>
            <p className="text-base text-gray-500 mt-1">管理應付及應收支票，追蹤兌現狀態與到期日程</p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <button
              type="button"
              onClick={() => print.setShowPrintSheetModal(true)}
              className="px-4 py-2 text-base font-medium text-violet-700 bg-violet-50 border border-violet-200 rounded-lg hover:bg-violet-100"
            >
              支票列印表（領取簽名）
            </button>
            <button
              type="button"
              onClick={() => { print.resetPrintSearch(); print.setShowPrintByPOModal(true); }}
              className="px-4 py-2 text-base font-medium text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-lg hover:bg-indigo-100"
            >
              按付款單的館別列印
            </button>
            <button
              type="button"
              onClick={() => { print.resetPrintSearch(); print.setShowPrintByPurchaseModal(true); }}
              className="px-4 py-2 text-base font-medium text-teal-700 bg-teal-50 border border-teal-200 rounded-lg hover:bg-teal-100"
            >
              按進貨單的館別列印
            </button>
            <ExportButtons
              data={checks.checks}
              columns={EXPORT_CONFIGS.checks.columns}
              exportName={EXPORT_CONFIGS.checks.filename}
              title="支票管理"
              sheetName="支票清單"
            />
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 bg-gray-100 rounded-xl p-1">
          {TABS.map(tab => (
            <button key={tab.key} onClick={() => { checks.setActiveTab(tab.key); checks.setSelectedIds([]); }}
              className={`flex-1 py-2.5 text-base font-medium rounded-lg transition-all ${
                checks.activeTab === tab.key
                  ? 'bg-violet-600 text-white shadow-md'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200'
              }`}>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Loading */}
        {checks.loading && (
          <div className="flex items-center justify-center py-12">
            <div className="w-8 h-8 border-4 border-violet-200 border-t-violet-600 rounded-full animate-spin"></div>
          </div>
        )}

        {/* Tab content */}
        {!checks.loading && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            {checks.activeTab === 'pending' && (
              <PendingTab
                summary={checks.summary}
                selectedIds={checks.selectedIds}
                setSelectedIds={checks.setSelectedIds}
                toggleSelectId={checks.toggleSelectId}
                openBatchClearModal={checks.openBatchClearModal}
                checksPagination={checks.checksPagination}
                goToPage={checks.goToPage}
                pendingPayable={checks.pendingPayable}
                pendingReceivable={checks.pendingReceivable}
                sortedPendingPayable={checks.sortedPendingPayable}
                chkPPk={checks.chkPPk} chkPPd={checks.chkPPd} chkPPt={checks.chkPPt}
                sortedPendingReceivable={checks.sortedPendingReceivable}
                chkPRk={checks.chkPRk} chkPRd={checks.chkPRd} chkPRt={checks.chkPRt}
                deletingCheckId={checks.deletingCheckId}
                reissueLoading={checks.reissueLoading}
                openClear={checks.openClear}
                openVoid={checks.openVoid}
                openEdit={checks.openEdit}
                handleDelete={checks.handleDelete}
                handleReissue={checks.handleReissue}
              />
            )}
            {(checks.activeTab === 'payable' || checks.activeTab === 'receivable') && (
              <CrudTab
                type={checks.activeTab}
                suppliers={checks.suppliers}
                filterStatus={checks.filterStatus} setFilterStatus={checks.setFilterStatus}
                filterDateFrom={checks.filterDateFrom} setFilterDateFrom={checks.setFilterDateFrom}
                filterDateTo={checks.filterDateTo} setFilterDateTo={checks.setFilterDateTo}
                filterSupplierId={checks.filterSupplierId} setFilterSupplierId={checks.setFilterSupplierId}
                sortedPayableCrud={checks.sortedPayableCrud}
                chkPayk={checks.chkPayk} chkPayd={checks.chkPayd} chkPayt={checks.chkPayt}
                sortedReceivableCrud={checks.sortedReceivableCrud}
                chkReck={checks.chkReck} chkRecd={checks.chkRecd} chkRect={checks.chkRect}
                selectedIds={checks.selectedIds}
                setSelectedIds={checks.setSelectedIds}
                toggleSelectId={checks.toggleSelectId}
                deletingCheckId={checks.deletingCheckId}
                reissueLoading={checks.reissueLoading}
                openClear={checks.openClear}
                openVoid={checks.openVoid}
                openEdit={checks.openEdit}
                handleDelete={checks.handleDelete}
                handleReissue={checks.handleReissue}
                resetAddForm={checks.resetAddForm}
                setAddForm={checks.setAddForm}
                setShowAddModal={checks.setShowAddModal}
              />
            )}
            {checks.activeTab === 'schedule' && (
              <ScheduleTab
                scheduleRange={checks.scheduleRange}
                setScheduleRange={checks.setScheduleRange}
                getScheduleData={checks.getScheduleData}
                openClear={checks.openClear}
              />
            )}
            {checks.activeTab === 'stats' && (
              <StatsTab
                checks={checks.checks}
                monthlyStats={checks.monthlyStats}
                statsYear={checks.statsYear} setStatsYear={checks.setStatsYear}
                statsMonth={checks.statsMonth} setStatsMonth={checks.setStatsMonth}
                reissueLoading={checks.reissueLoading}
                handleReissue={checks.handleReissue}
                openClear={checks.openClear}
              />
            )}
          </div>
        )}
      </div>

      {/* CRUD Modals */}
      <CheckModals
        showAddModal={checks.showAddModal} setShowAddModal={checks.setShowAddModal}
        showEditModal={checks.showEditModal} setShowEditModal={checks.setShowEditModal}
        showClearModal={checks.showClearModal} setShowClearModal={checks.setShowClearModal}
        showBounceModal={checks.showBounceModal} setShowBounceModal={checks.setShowBounceModal}
        showVoidModal={checks.showVoidModal} setShowVoidModal={checks.setShowVoidModal}
        showBatchClearModal={checks.showBatchClearModal} setShowBatchClearModal={checks.setShowBatchClearModal}
        selectedIds={checks.selectedIds}
        batchClearDate={checks.batchClearDate} setBatchClearDate={checks.setBatchClearDate}
        handleBatchClear={checks.handleBatchClear}
        selectedCheck={checks.selectedCheck} setSelectedCheck={checks.setSelectedCheck}
        addForm={checks.addForm} setAddForm={checks.setAddForm}
        clearForm={checks.clearForm} setClearForm={checks.setClearForm}
        actionReason={checks.actionReason} setActionReason={checks.setActionReason}
        checkSaving={checks.checkSaving} setCheckSaving={checks.setCheckSaving}
        clearSaving={checks.clearSaving}
        handleAdd={checks.handleAdd} handleUpdate={checks.handleUpdate}
        handleClear={checks.handleClear} handleBounce={checks.handleBounce} handleVoid={checks.handleVoid}
        resetAddForm={checks.resetAddForm}
        accounts={checks.accounts} suppliers={checks.suppliers}
      />

      {/* Print Modals */}
      <PrintModals
        showPrintSheetModal={print.showPrintSheetModal} setShowPrintSheetModal={print.setShowPrintSheetModal}
        printWarehouse={print.printWarehouse} setPrintWarehouse={print.setPrintWarehouse}
        checksForPrintSheet={print.checksForPrintSheet}
        getPayeeName={print.getPayeeName}
        showPrintByPOModal={print.showPrintByPOModal} setShowPrintByPOModal={print.setShowPrintByPOModal}
        showPrintByPurchaseModal={print.showPrintByPurchaseModal} setShowPrintByPurchaseModal={print.setShowPrintByPurchaseModal}
        printSearchWarehouse={print.printSearchWarehouse} setPrintSearchWarehouse={print.setPrintSearchWarehouse}
        printSearchDateFrom={print.printSearchDateFrom} setPrintSearchDateFrom={print.setPrintSearchDateFrom}
        printSearchDateTo={print.printSearchDateTo} setPrintSearchDateTo={print.setPrintSearchDateTo}
        printSearchResults={print.printSearchResults}
        printSearchLoading={print.printSearchLoading}
        handlePrintSearch={print.handlePrintSearch}
        resetPrintSearch={print.resetPrintSearch}
      />
    </div>
  );
}
