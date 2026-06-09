'use client';

import { useState, useEffect, useCallback } from 'react';
import { useEscKey } from '@/lib/hooks/useEscKey';
import { useSession } from 'next-auth/react';
import Navigation from '@/components/Navigation';
import NotificationBanner from '@/components/NotificationBanner';
import FetchErrorBanner from '@/components/FetchErrorBanner';
import ExportButtons from '@/components/ExportButtons';
import { EXPORT_CONFIGS } from '@/lib/export-columns';
import { useLoansData } from './_hooks/useLoansData';
import { useLoansModals } from './_hooks/useLoansModals';
import HelpButton from '@/components/HelpButton';
import ReportTab    from './_tabs/ReportTab';
import AnnualTab    from './_tabs/AnnualTab';
import OverviewTab  from './_tabs/OverviewTab';
import MonthlyTab   from './_tabs/MonthlyTab';
import RecordsTab   from './_tabs/RecordsTab';
import LoanModal            from './_modals/LoanModal';
import ConfirmPaymentModal  from './_modals/ConfirmPaymentModal';
import BatchModal           from './_modals/BatchModal';
import TransferModal        from './_modals/TransferModal';
import LoansPrintModal      from './_modals/LoansPrintModal';
import AnnualPrintModal     from './_modals/AnnualPrintModal';

const TABS = [
  { key: 'overview', label: '貸款總覽' },
  { key: 'monthly',  label: '本月還款' },
  { key: 'records',  label: '還款記錄' },
  { key: 'report',   label: '月度報表' },
  { key: 'annual',   label: '年度報表' }
];

export default function LoansPage() {
  const { data: session } = useSession();
  const isLoggedIn = !!session;
  const [activeTab, setActiveTab] = useState('overview');

  // ---- Shared data & logic ----
  const data = useLoansData();

  // ---- Modal state & handlers ----
  const modals = useLoansModals({
    loans: data.loans,
    accounts: data.accounts,
    fetchAll: data.fetchAll,
    fetchMonthlyRecords: data.fetchMonthlyRecords,
    monthlyYear: data.monthlyYear,
    monthlyMonth: data.monthlyMonth,
  });

  // ---- Tab-gated effects ----
  useEffect(() => {
    if (activeTab === 'monthly') {
      if (data.loans.length === 0) data.fetchAll();
      data.autoSetupMonthly();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, data.monthlyYear, data.monthlyMonth]);

  useEffect(() => {
    if (activeTab === 'records') data.fetchAllRecords();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, data.recFilterLoan, data.recFilterYear, data.recFilterMonth, data.recFilterStatus]);

  useEffect(() => {
    if (activeTab === 'report') data.fetchReportData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, data.reportYear, data.reportMonth]);

  useEffect(() => {
    if (activeTab === 'annual') data.fetchAnnualData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, data.annualYear]);

  // ---- Esc key: close topmost modal ----
  useEscKey(useCallback(() => {
    if (modals.showTransferModal)    { modals.setShowTransferModal(false);    return; }
    if (modals.showBatchModal)       { modals.setShowBatchModal(false);       return; }
    if (modals.showConfirmModal)     { modals.setShowConfirmModal(false);     return; }
    if (modals.showAnnualPrintModal) { modals.setShowAnnualPrintModal(false); return; }
    if (modals.showLoanModal)        { modals.setShowLoanModal(false);        return; }
    if (modals.showLoansPrintModal)  { modals.setShowLoansPrintModal(false);  return; }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modals.showTransferModal, modals.showBatchModal, modals.showConfirmModal, modals.showAnnualPrintModal, modals.showLoanModal, modals.showLoansPrintModal]));

  // ---- Loading skeleton ----
  if (data.loading) {
    return (
      <div className="min-h-screen page-bg-loans">
        <Navigation borderColor="border-indigo-500" />
        <div className="max-w-7xl mx-auto px-4 py-8">
          <div className="h-8 bg-gray-200 rounded w-48 mb-6 animate-pulse" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="bg-white rounded-xl p-5 shadow-sm h-28 animate-pulse">
                <div className="h-3 bg-gray-200 rounded w-1/2 mb-3" />
                <div className="h-7 bg-gray-200 rounded w-3/4" />
              </div>
            ))}
          </div>
          <div className="bg-white rounded-xl shadow-sm p-4 animate-pulse space-y-3">
            {[...Array(5)].map((_, i) => <div key={i} className="h-4 bg-gray-100 rounded" />)}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen page-bg-loans">
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          .no-print-loans, .no-print-loans * { visibility: hidden !important; }
          #loans-monthly-report-print-root { visibility: visible !important; position: absolute !important; left: 0 !important; top: 0 !important; width: 100% !important; background: #fff !important; z-index: 99999 !important; }
          #loans-monthly-report-print-root * { visibility: visible !important; }
        }
      `}} />

      <div className="no-print-loans">
        <Navigation borderColor="border-indigo-500" />
        <NotificationBanner moduleFilter="loans" />
      </div>

      {data.fetchError && (
        <div className="max-w-7xl mx-auto px-4 pt-4 no-print-loans">
          <FetchErrorBanner message={data.fetchError} onRetry={data.fetchAll} />
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 py-6 no-print-loans">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-800">貸款利息管理</h2>
            <p className="text-sm text-gray-500 mt-1">管理公司與個人貸款、月還款追蹤與核實</p>
          </div>
          <div className="flex items-center gap-3">
            <HelpButton anchor="十一貸款管理" />
            <ExportButtons
              data={data.filteredLoans.map(l => ({ ...l, balance: l.currentBalance ?? l.loanAmount }))}
              columns={EXPORT_CONFIGS.loans.columns}
              exportName={EXPORT_CONFIGS.loans.filename}
              title="貸款利息管理"
              sheetName="貸款清單"
            />
          </div>
        </div>

        {/* Tab bar */}
        <div className="flex flex-wrap gap-1 mb-6 bg-white rounded-lg shadow p-1">
          {TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex-1 px-4 py-2.5 rounded-md text-sm font-medium transition-colors ${
                activeTab === tab.key
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {activeTab === 'overview' && (
          <OverviewTab
            activeLoans={data.activeLoans} totalBalance={data.totalBalance}
            thisMonthDue={data.thisMonthDue} monthlyYear={data.monthlyYear} monthlyMonth={data.monthlyMonth}
            overdueLoans={data.overdueLoans}
            filterWarehouse={data.filterWarehouse} setFilterWarehouse={data.setFilterWarehouse}
            filterStatus={data.filterStatus} setFilterStatus={data.setFilterStatus}
            filterOwnerType={data.filterOwnerType} setFilterOwnerType={data.setFilterOwnerType}
            warehouses={data.warehouses} isLoggedIn={isLoggedIn}
            openAddLoan={modals.openAddLoan}
            filteredLoans={data.filteredLoans} sortedFilteredLoans={data.sortedFilteredLoans}
            loanOvKey={data.loanOvKey} loanOvDir={data.loanOvDir} toggleLoanOv={data.toggleLoanOv}
            getDueDateWarning={data.getDueDateWarning}
            openEditLoan={modals.openEditLoan} deleteLoan={data.deleteLoan}
          />
        )}
        {activeTab === 'monthly' && (
          <MonthlyTab
            loans={data.loans} accounts={data.accounts}
            monthlyYear={data.monthlyYear} setMonthlyYear={data.setMonthlyYear}
            monthlyMonth={data.monthlyMonth} setMonthlyMonth={data.setMonthlyMonth}
            monthlyRecords={data.monthlyRecords} isLoggedIn={isLoggedIn} now={data.now}
            sortedMonthlyMatrixRows={data.sortedMonthlyMatrixRows}
            loanMonKey={data.loanMonKey} loanMonDir={data.loanMonDir} toggleLoanMon={data.toggleLoanMon}
            getDaysUntilDue={data.getDaysUntilDue}
            openConfirmModal={modals.openConfirmModal}
            deleteRecord={data.deleteRecord}
            pushToCashier={data.pushToCashier}
            batchPushToCashier={data.batchPushToCashier}
            openBatchModal={modals.openBatchModal}
            openTransferModal={modals.openTransferModal}
          />
        )}
        {activeTab === 'records' && (
          <RecordsTab
            loans={data.loans} records={data.records}
            recFilterLoan={data.recFilterLoan} setRecFilterLoan={data.setRecFilterLoan}
            recFilterYear={data.recFilterYear} setRecFilterYear={data.setRecFilterYear}
            recFilterMonth={data.recFilterMonth} setRecFilterMonth={data.setRecFilterMonth}
            recFilterStatus={data.recFilterStatus} setRecFilterStatus={data.setRecFilterStatus}
            sortedLoanRecords={data.sortedLoanRecords}
            loanRecKey={data.loanRecKey} loanRecDir={data.loanRecDir} toggleLoanRec={data.toggleLoanRec}
            isLoggedIn={isLoggedIn}
            openConfirmModal={modals.openConfirmModal}
            deleteRecord={data.deleteRecord} now={data.now}
          />
        )}
        {activeTab === 'report' && (
          <ReportTab
            reportYear={data.reportYear} setReportYear={data.setReportYear}
            reportMonth={data.reportMonth} setReportMonth={data.setReportMonth}
            reportData={data.reportData}
            setShowLoansPrintModal={modals.setShowLoansPrintModal}
            now={data.now}
          />
        )}
        {activeTab === 'annual' && (
          <AnnualTab
            annualYear={data.annualYear} setAnnualYear={data.setAnnualYear}
            annualData={data.annualData} annualLoading={data.annualLoading}
            setShowAnnualPrintModal={modals.setShowAnnualPrintModal}
            now={data.now}
          />
        )}
      </div>

      {/* Modals */}
      {modals.showLoanModal && (
        <LoanModal
          editingLoan={modals.editingLoan}
          loanForm={modals.loanForm} setLoanForm={modals.setLoanForm}
          loanSaving={modals.loanSaving}
          accounts={data.accounts}
          accountingSubjects={data.accountingSubjects}
          warehouses={data.warehouses}
          onClose={() => modals.setShowLoanModal(false)}
          onSave={modals.saveLoan}
        />
      )}
      {modals.showAnnualPrintModal && (
        <AnnualPrintModal
          annualYear={data.annualYear}
          annualData={data.annualData}
          onClose={() => modals.setShowAnnualPrintModal(false)}
        />
      )}
      {modals.showConfirmModal && (
        <ConfirmPaymentModal
          confirmingRecord={modals.confirmingRecord}
          confirmForm={modals.confirmForm} setConfirmForm={modals.setConfirmForm}
          accounts={data.accounts}
          onClose={() => modals.setShowConfirmModal(false)}
          onConfirm={modals.confirmPayment}
        />
      )}
      {modals.showBatchModal && (
        <BatchModal
          loans={data.loans}
          monthlyYear={data.monthlyYear}
          monthlyMonth={data.monthlyMonth}
          batchLoanIds={modals.batchLoanIds} setBatchLoanIds={modals.setBatchLoanIds}
          toggleBatchLoan={modals.toggleBatchLoan}
          onClose={() => modals.setShowBatchModal(false)}
          onExecute={modals.executeBatch}
        />
      )}
      {modals.showTransferModal && (
        <TransferModal
          accounts={data.accounts}
          transferForm={modals.transferForm} setTransferForm={modals.setTransferForm}
          transferTargetAccount={modals.transferTargetAccount}
          transfering={modals.transfering}
          onClose={() => modals.setShowTransferModal(false)}
          onExecute={modals.executeTransfer}
        />
      )}
      {modals.showLoansPrintModal && (
        <LoansPrintModal
          reportYear={data.reportYear}
          reportMonth={data.reportMonth}
          reportData={data.reportData}
          onClose={() => modals.setShowLoansPrintModal(false)}
        />
      )}
    </div>
  );
}
