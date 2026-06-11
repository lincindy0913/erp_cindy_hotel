'use client';

import React, { useState, useEffect, useMemo, Suspense } from 'react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import Navigation from '@/components/Navigation';
import FetchErrorBanner from '@/components/FetchErrorBanner';
import HelpButton from '@/components/HelpButton';
import { useDashboardTab } from '@/components/reconciliation/useDashboardTab';
import { useAccountTab } from '@/components/reconciliation/useAccountTab';
import { useCreditCardTab } from '@/components/reconciliation/useCreditCardTab';
import { useReconciliationAccounts } from './_hooks/useReconciliationAccounts';
import { useReconciliationFormats } from './_hooks/useReconciliationFormats';
import { useReconciliationRental } from './_hooks/useReconciliationRental';
import { DashboardTab } from './_tabs/DashboardTab';
import { AccountTab } from './_tabs/AccountTab';
import { RentalTab } from './_tabs/RentalTab';
import { FormatsTab } from './_tabs/FormatsTab';
import { CreditCardTab } from './_tabs/CreditCardTab';

const TABS = [
  { key: 'dashboard', label: '對帳儀表板' },
  { key: 'account', label: '帳戶對帳' },
  { key: 'rental', label: '租金對帳' },
  { key: 'formats', label: '銀行格式管理' },
  { key: 'credit-card', label: '信用卡對帳' }
];

function ReconciliationPageInner() {
  const { data: session } = useSession();
  const isLoggedIn = !!session;
  const router = useRouter();
  const searchParams = useSearchParams();

  // Tab state — initialised from URL, kept in sync on back/forward
  const [activeTab, setActiveTab] = useState(() => {
    const tab = searchParams.get('tab');
    return tab && TABS.find(t => t.key === tab) ? tab : 'dashboard';
  });

  // Messages
  const [message, setMessage] = useState({ text: '', type: '' });

  const showMessage = (text, type = 'success') => {
    setMessage({ text, type });
    setTimeout(() => setMessage({ text: '', type: '' }), 4000);
  };

  // Sync activeTab when browser back/forward changes URL
  useEffect(() => {
    const tab = searchParams.get('tab');
    if (!tab) return;
    if (!TABS.find(t => t.key === tab)) {
      router.replace('?tab=dashboard');
      return;
    }
    if (tab !== activeTab) setActiveTab(tab);
  }, [searchParams]); // eslint-disable-line react-hooks/exhaustive-deps

  const changeTab = (tab) => {
    setActiveTab(tab);
    router.push(`?tab=${tab}`, { scroll: false });
  };

  // ---- Shared hooks ----
  const { accounts, fetchAccounts, accountsFetchError } = useReconciliationAccounts({ showMessage });

  const bankAccountsOnly = useMemo(
    () => accounts.filter(a => a.type === '銀行存款' && a.isActive),
    [accounts]
  );

  const {
    formats, formatsLoading, formatsFetchError,
    showFormatForm, setShowFormatForm,
    formatForm, setFormatForm,
    formatSaving, submitFormat,
    fetchFormats,
  } = useReconciliationFormats({ activeTab, showMessage });

  const {
    rentalPayments, rentalReconLoading, rentalFetchError,
    rentalReconYear, setRentalReconYear,
    rentalReconMonth, setRentalReconMonth,
    rentalReconAccountId, setRentalReconAccountId,
    rentalReconMethodFilter, setRentalReconMethodFilter,
    rentalReconSearch, setRentalReconSearch,
    fetchRentalPayments,
  } = useReconciliationRental({ activeTab, showMessage });

  // ---- Feature hooks (from components/reconciliation/) ----
  const {
    dashYear, setDashYear, dashMonth, setDashMonth,
    dashboardData, dashLoading, dashFetchError,
    dashFilter, setDashFilter,
    dashSearch, setDashSearch, dashSortKey, dashSortDir, dashToggleSort,
    fetchDashboard,
  } = useDashboardTab({ activeTab, showMessage });

  const {
    selectedAccountId, setSelectedAccountId,
    acctYear, setAcctYear, acctMonth, setAcctMonth,
    reconciliation, acctFetchError, bankLines, systemTxs, acctLoading,
    bankBalanceInput, setBankBalanceInput,
    confirmNote, setConfirmNote, diffExplained, setDiffExplained,
    selectedBankLine, setSelectedBankLine, selectedSystemTx, setSelectedSystemTx,
    showImportModal, setShowImportModal, showAdjustModal, setShowAdjustModal,
    adjustForm, setAdjustForm,
    importLines, importFileName, selectedFormatId, setSelectedFormatId,
    importSubmitting, adjustmentSubmitting,
    updateBankBalance, confirmReconciliation,
    matchPair, unmatchLine, handleFileUpload, submitImport, submitAdjustment,
    loadReconciliation,
  } = useAccountTab({ activeTab, showMessage, session, formats });

  const {
    ccStatements, ccSummary, ccFetchError, ccMerchantConfigs, ccLoading,
    ccMonth, setCcMonth, ccWarehouseFilter, setCcWarehouseFilter,
    ccStatusFilter, setCcStatusFilter, ccExpandedId, setCcExpandedId,
    ccBuildings, ccShowUpload, setCcShowUpload,
    ccUploadWarehouse, setCcUploadWarehouse, ccParsedData, setCcParsedData,
    ccMatchResults, ccMatchLoading, ccInnerTab, setCcInnerTab,
    ccPmsRecords, ccPmsLoading,
    ccPmsStartDate, setCcPmsStartDate, ccPmsEndDate, setCcPmsEndDate,
    ccPmsWarehouse, setCcPmsWarehouse,
    ccShowConfigModal, setCcShowConfigModal,
    ccConfigForm, setCcConfigForm, ccBankType, setCcBankType, ccConfigSaving,
    fetchCcData, fetchCcPmsData, handleCcPdfUpload,
    saveParsedCcStatement, matchCcPms, matchAllCcPms,
    toggleCcConfirm, deleteCcStatement, saveCcConfig,
  } = useCreditCardTab({ activeTab, showMessage });

  const navigateToAccount = (accountId) => {
    setSelectedAccountId(String(accountId));
    changeTab('account');
  };

  return (
    <div className="min-h-screen page-bg-reconciliation">
      <Navigation borderColor="border-violet-500" />

      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-800">存簿對帳</h2>
            <p className="text-sm text-gray-500 mt-1">信用卡、OTA 等科目對帳。銀行存款月結調節表請至 <Link href="/bank-reconciliation" className="text-violet-600 hover:underline">存簿核對 →</Link></p>
          </div>
          <HelpButton anchor="九銀行對帳" />
        </div>

        {/* Message */}
        {message.text && message.type === 'error' && (
          <FetchErrorBanner message={message.text} className="mb-4" />
        )}
        {message.text && message.type !== 'error' && (
          <div className="mb-4 px-4 py-3 rounded-lg text-sm font-medium bg-green-50 text-green-700 border border-green-200">
            {message.text}
          </div>
        )}

        {/* Tabs */}
        <div className="flex flex-wrap gap-1 mb-6 bg-white rounded-lg p-1 shadow-sm border">
          {TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => changeTab(tab.key)}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                activeTab === tab.key
                  ? 'bg-violet-600 text-white shadow-sm'
                  : 'text-gray-600 hover:bg-violet-50 hover:text-violet-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Shared data error banner (accounts) */}
        {accountsFetchError && <FetchErrorBanner message={accountsFetchError} onRetry={fetchAccounts} className="mb-4" />}

        {/* ======== TAB: Dashboard ======== */}
        {activeTab === 'dashboard' && (
          <DashboardTab
            dashYear={dashYear} setDashYear={setDashYear}
            dashMonth={dashMonth} setDashMonth={setDashMonth}
            dashboardData={dashboardData} dashLoading={dashLoading}
            dashFilter={dashFilter} setDashFilter={setDashFilter}
            dashSearch={dashSearch} setDashSearch={setDashSearch}
            dashSortKey={dashSortKey} dashSortDir={dashSortDir} dashToggleSort={dashToggleSort}
            navigateToAccount={navigateToAccount}
            fetchError={dashFetchError} onRetryFetch={fetchDashboard}
          />
        )}

        {/* ======== TAB: Account Reconciliation ======== */}
        {activeTab === 'account' && (
          <AccountTab
            selectedAccountId={selectedAccountId} setSelectedAccountId={setSelectedAccountId}
            acctYear={acctYear} setAcctYear={setAcctYear}
            acctMonth={acctMonth} setAcctMonth={setAcctMonth}
            bankAccountsOnly={bankAccountsOnly}
            reconciliation={reconciliation} bankLines={bankLines}
            systemTxs={systemTxs} acctLoading={acctLoading}
            bankBalanceInput={bankBalanceInput} setBankBalanceInput={setBankBalanceInput}
            confirmNote={confirmNote} setConfirmNote={setConfirmNote}
            diffExplained={diffExplained} setDiffExplained={setDiffExplained}
            selectedBankLine={selectedBankLine} setSelectedBankLine={setSelectedBankLine}
            selectedSystemTx={selectedSystemTx} setSelectedSystemTx={setSelectedSystemTx}
            showImportModal={showImportModal} setShowImportModal={setShowImportModal}
            showAdjustModal={showAdjustModal} setShowAdjustModal={setShowAdjustModal}
            adjustForm={adjustForm} setAdjustForm={setAdjustForm}
            importLines={importLines} importFileName={importFileName}
            selectedFormatId={selectedFormatId} setSelectedFormatId={setSelectedFormatId}
            importSubmitting={importSubmitting} adjustmentSubmitting={adjustmentSubmitting}
            formats={formats}
            updateBankBalance={updateBankBalance} confirmReconciliation={confirmReconciliation}
            matchPair={matchPair} unmatchLine={unmatchLine}
            handleFileUpload={handleFileUpload} submitImport={submitImport}
            submitAdjustment={submitAdjustment}
            fetchError={acctFetchError} onRetryFetch={loadReconciliation}
          />
        )}

        {/* ======== TAB: Rental Reconciliation ======== */}
        {activeTab === 'rental' && (
          <RentalTab
            rentalPayments={rentalPayments} rentalReconLoading={rentalReconLoading}
            rentalReconYear={rentalReconYear} setRentalReconYear={setRentalReconYear}
            rentalReconMonth={rentalReconMonth} setRentalReconMonth={setRentalReconMonth}
            rentalReconAccountId={rentalReconAccountId} setRentalReconAccountId={setRentalReconAccountId}
            rentalReconMethodFilter={rentalReconMethodFilter} setRentalReconMethodFilter={setRentalReconMethodFilter}
            rentalReconSearch={rentalReconSearch} setRentalReconSearch={setRentalReconSearch}
            fetchRentalPayments={fetchRentalPayments}
            accounts={accounts}
            fetchError={rentalFetchError} onRetryFetch={fetchRentalPayments}
          />
        )}

        {/* ======== TAB: Formats ======== */}
        {activeTab === 'formats' && (
          <FormatsTab
            isLoggedIn={isLoggedIn}
            formats={formats} formatsLoading={formatsLoading}
            showFormatForm={showFormatForm} setShowFormatForm={setShowFormatForm}
            formatForm={formatForm} setFormatForm={setFormatForm}
            formatSaving={formatSaving} submitFormat={submitFormat}
            fetchError={formatsFetchError} onRetryFetch={fetchFormats}
          />
        )}

        {/* ======== TAB: Credit Card ======== */}
        {activeTab === 'credit-card' && (
          <CreditCardTab
            ccStatements={ccStatements} ccSummary={ccSummary}
            ccMerchantConfigs={ccMerchantConfigs} ccLoading={ccLoading}
            ccMonth={ccMonth} setCcMonth={setCcMonth}
            ccWarehouseFilter={ccWarehouseFilter} setCcWarehouseFilter={setCcWarehouseFilter}
            ccStatusFilter={ccStatusFilter} setCcStatusFilter={setCcStatusFilter}
            ccExpandedId={ccExpandedId} setCcExpandedId={setCcExpandedId}
            ccBuildings={ccBuildings} ccShowUpload={ccShowUpload} setCcShowUpload={setCcShowUpload}
            ccUploadWarehouse={ccUploadWarehouse} setCcUploadWarehouse={setCcUploadWarehouse}
            ccParsedData={ccParsedData} setCcParsedData={setCcParsedData}
            ccMatchResults={ccMatchResults} ccMatchLoading={ccMatchLoading}
            ccInnerTab={ccInnerTab} setCcInnerTab={setCcInnerTab}
            ccPmsRecords={ccPmsRecords} ccPmsLoading={ccPmsLoading}
            ccPmsStartDate={ccPmsStartDate} setCcPmsStartDate={setCcPmsStartDate}
            ccPmsEndDate={ccPmsEndDate} setCcPmsEndDate={setCcPmsEndDate}
            ccPmsWarehouse={ccPmsWarehouse} setCcPmsWarehouse={setCcPmsWarehouse}
            ccShowConfigModal={ccShowConfigModal} setCcShowConfigModal={setCcShowConfigModal}
            ccConfigForm={ccConfigForm} setCcConfigForm={setCcConfigForm}
            ccBankType={ccBankType} setCcBankType={setCcBankType}
            ccConfigSaving={ccConfigSaving}
            fetchCcPmsData={fetchCcPmsData} handleCcPdfUpload={handleCcPdfUpload}
            saveParsedCcStatement={saveParsedCcStatement} matchCcPms={matchCcPms}
            matchAllCcPms={matchAllCcPms} toggleCcConfirm={toggleCcConfirm}
            deleteCcStatement={deleteCcStatement} saveCcConfig={saveCcConfig}
            fetchError={ccFetchError} onRetryFetch={fetchCcData}
          />
        )}
      </div>
    </div>
  );
}

export default function ReconciliationPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-gray-500">載入中…</div>}>
      <ReconciliationPageInner />
    </Suspense>
  );
}
