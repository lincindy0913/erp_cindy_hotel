'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Navigation from '@/components/Navigation';
import FetchErrorBanner from '@/components/FetchErrorBanner';
import { useToast } from '@/context/ToastContext';
import { todayStr } from '@/lib/localDate';
import { useConfirm } from '@/context/ConfirmContext';
import EditTenantModal        from './_components/EditTenantModal';
import ContractModal          from './_components/ContractModal';
import PropertyModal          from '@/components/PropertyModal';
import TerminateContractModal from './_components/TerminateContractModal';
import QuickPayModal          from './_components/QuickPayModal';
import RentFilingModal        from './_components/RentFilingModal';
import TaxModal               from './_components/TaxModal';
import MaintenanceModal       from './_components/MaintenanceModal';
import OverviewTab        from './_tabs/OverviewTab';
import CashierTab         from './_tabs/CashierTab';
import TenantsTab         from './_tabs/TenantsTab';
import ContractsTab       from './_tabs/ContractsTab';
import TaxesTab           from './_tabs/TaxesTab';
import RentFilingTab      from './_tabs/RentFilingTab';
import MaintenanceTab     from './_tabs/MaintenanceTab';
import UtilityIncomeTab   from './_tabs/UtilityIncomeTab';
import AnalyticsTab       from './_tabs/AnalyticsTab';
import PaymentRecordsTab  from './_tabs/PaymentRecordsTab';
import HelpTab            from './_tabs/HelpTab';
import { useRentalSummary }     from './_hooks/useRentalSummary';
import { useRentalProperties }  from './_hooks/useRentalProperties';
import { useRentalTenants }     from './_hooks/useRentalTenants';
import { useRentalContracts }   from './_hooks/useRentalContracts';
import { useRentalIncomes }     from './_hooks/useRentalIncomes';
import { useRentalTaxes }       from './_hooks/useRentalTaxes';
import { useRentalMaintenance } from './_hooks/useRentalMaintenance';
import { useRentalUtility }     from './_hooks/useRentalUtility';
import { useRentalAnalytics }   from './_hooks/useRentalAnalytics';

const TABS = [
  { key: 'overview',       label: '總覽' },
  { key: 'cashier',        label: '收租工作台' },
  { key: 'paymentRecords', label: '付款紀錄' },
  { key: 'tenants',        label: '租客管理' },
  { key: 'contracts',      label: '合約管理' },
  { key: 'taxes',          label: '稅款管理' },
  { key: 'rentFiling',     label: '租金申報' },
  { key: 'maintenance',    label: '維護費' },
  { key: 'utilityIncome',  label: '水電收入' },
  { key: 'analytics',      label: '分析報表' },
  { key: 'help',           label: '說明' },
];

const LEGACY_TAB_TO_SUB = {
  incomeReport: 'income', operatingReport: 'operating',
  overdueReport: 'overdue', depositTracking: 'deposit', vacancyReport: 'vacancy',
};
const VALID_ANALYTICS_SUB = ['income', 'operating', 'overdue', 'deposit', 'vacancy'];

function resolveRentalsMainTab(tabParam) {
  if (!tabParam) return 'overview';
  return LEGACY_TAB_TO_SUB[tabParam] ? 'analytics' : tabParam;
}
function resolveRentalsAnalyticsSub(tabParam, sp) {
  const mapped = LEGACY_TAB_TO_SUB[tabParam];
  if (mapped) return mapped;
  const s = sp.get('sub');
  if (s && VALID_ANALYTICS_SUB.includes(s)) return s;
  return 'income';
}

export default function RentalsPageWrapper() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-gray-500">載入中...</div>}>
      <RentalsPage />
    </Suspense>
  );
}

function RentalsPage() {
  const searchParams = useSearchParams();
  const router       = useRouter();
  const { showToast } = useToast();
  const confirm       = useConfirm();
  const tabParam      = searchParams.get('tab') || 'overview';

  const [activeTab,    setActiveTab]    = useState(() => resolveRentalsMainTab(tabParam));
  const [analyticsSub, setAnalyticsSub] = useState(() => resolveRentalsAnalyticsSub(tabParam, searchParams));
  const [accounts,           setAccounts]           = useState([]);
  const [accountingSubjects, setAccountingSubjects] = useState([]);
  const [loading,            setLoading]            = useState(true);

  // ── hooks ─────────────────────────────────────────────────────
  const {
    summary, summaryError, summaryLoading, summaryLastFetched, fetchSummary,
  } = useRentalSummary();

  const {
    properties, setProperties, propertiesError,
    propInlineEdit, setPropInlineEdit, propInlineSaving,
    CONTRACT_INCOME_CATEGORIES, reportCategoryOptions,
    showPropertyModal, setShowPropertyModal,
    editingProperty, setEditingProperty,
    propertyForm, setPropertyForm, propertySaving,
    editPropertyOpenedRef,
    fetchProperties, savePropField, openPropertyModal, saveProperty,
  } = useRentalProperties({
    onInlineEditSaved: (propertyId, apiField, parsed) => {
      setIncomes(prev => prev.map(i =>
        i.propertyId === propertyId ? { ...i, [apiField]: parsed } : i
      ));
    },
  });

  const {
    tenants, setTenants, tenantsError,
    tenantSearch, setTenantSearch,
    tenantSortKey, tenantSortDir, tenantToggleSort,
    showTenantModal, setShowTenantModal,
    editingTenant, setEditingTenant,
    contractPropertyChanges, setContractPropertyChanges,
    tenantForm, setTenantForm, tenantSaving,
    initContractErrors, setInitContractErrors,
    terminateModal, setTerminateModal,
    fetchTenants, openTenantModal, saveTenant, deleteTenant, terminateContract,
  } = useRentalTenants({
    onAfterSave: () => { fetchContracts(); fetchProperties(); },
  });

  const {
    contracts, setContracts, contractsError,
    contractFilter, setContractFilter,
    contractSortKey, contractSortDir, contractToggleSort,
    showContractModal, setShowContractModal,
    editingContract, setEditingContract,
    renewingFromContract, setRenewingFromContract,
    contractForm, setContractForm, contractSaving,
    reminderOpen, setReminderOpen,
    reminderThreshold, setReminderThreshold,
    contractMap, getRenewalDepth,
    fetchContracts, openContractModal, openRenewalModal, saveContract,
    moveContract, deleteContract, handleDepositAction, printContracts,
    markReminderSent, clearReminder,
  } = useRentalContracts({
    initialFilter: {
      status:     searchParams.get('contractStatus') || '',
      propertyId: searchParams.get('propertyId')     || '',
    },
    onAfterSave: () => { fetchProperties(); fetchTenants(); fetchIncomes(); },
  });

  const {
    incomes, setIncomes, incomesError,
    incomesHasMore, cashierUtilityMap, setCashierUtilityMap,
    rentIncKey, rentIncDir, rentIncToggle,
    incomeFilter, setIncomeFilter, sortedIncomes,
    payingIncomeId, setPayingIncomeId,
    incomeFormMode, setIncomeFormMode,
    incomePayForm, setIncomePayForm,
    incomeUtilityForm, setIncomeUtilityForm,
    incomePaymentSaving,
    editingPaymentId, setEditingPaymentId,
    editingPaymentForm, setEditingPaymentForm, editingPaymentSaving,
    selectedIncomeIds, setSelectedIncomeIds,
    showBatchPay, setShowBatchPay,
    batchPayForm, setBatchPayForm,
    batchSaving, batchProgress, setBatchProgress, batchAbortRef, batchLockSaving,
    paymentSortKey, paymentSortDir, paymentToggleSort,
    paymentRecords, paymentRecordsPagination,
    paymentFilter, setPaymentFilter, paymentLoading,
    fetchIncomes, fetchPaymentRecords, resolvePaymentMethod,
    openIncomePayment, openIncomeEdit, confirmIncomePayment, voidIncomePayment,
    exportIncomeCSV, generateMonthlyIncome, printIncomes,
    openPaymentEdit, savePaymentEdit, deletePaymentRecord, toggleIncomeLock,
    batchConfirmIncomes, batchLockIncomes,
  } = useRentalIncomes({
    initialIncomeFilter: {
      year:           parseInt(searchParams.get('incomeYear'))  || new Date().getFullYear(),
      month:          searchParams.get('incomeMonth')           || '',
      status:         '',
      propertySearch: searchParams.get('propertySearch')        || '',
      category:       '',
    },
    accounts,
    properties,
    onAfterConfirm: () => fetchSummary(),
  });

  const {
    taxes, setTaxes, taxesError,
    taxFilter, setTaxFilter,
    yearLocks, yearLockSaving, taxView, setTaxView,
    showTaxModal, setShowTaxModal,
    editingTax, setEditingTax,
    taxForm, setTaxForm, taxSaving,
    payingTaxId, setPayingTaxId,
    taxPayForm, setTaxPayForm,
    taxTableYear, setTaxTableYear, taxTableRows, setTaxTableRows, taxTableSaving,
    fetchTaxes, fetchYearLocks, fetchTaxTable,
    lockYear, unlockYear, openTaxEdit, saveTax, confirmTaxPayment, deleteTax, printTaxes, saveTaxTable,
  } = useRentalTaxes({
    initialFilter: {
      taxYear:    parseInt(searchParams.get('taxYear')) || new Date().getFullYear(),
      status:     searchParams.get('taxStatus')         || '',
      propertyId: tabParam === 'taxes' ? (searchParams.get('propertyId') || '') : '',
    },
  });

  const {
    maintenances, setMaintenances, maintenancesError,
    maintenancesHasMore, maintenanceFilter, setMaintenanceFilter,
    showMaintenanceModal, setShowMaintenanceModal,
    maintenanceForm, setMaintenanceForm,
    editingMaintenance, setEditingMaintenance,
    maintenanceSaving, maintenanceAnalysis,
    fetchMaintenances, saveMaintenance, deleteMaintenance,
  } = useRentalMaintenance({
    initialFilter: {
      year:       new Date().getFullYear(),
      category:   '',
      status:     '',
      propertyId: tabParam === 'maintenance' ? (searchParams.get('propertyId') || '') : '',
    },
  });

  const {
    utilityFilter, setUtilityFilter,
    utilityList, setUtilityList, utilityError,
    showUtilityModal, setShowUtilityModal,
    utilityForm, setUtilityForm,
    editingUtility, setEditingUtility,
    utilitySaving, setUtilitySaving,
    showBulkUtility, setShowBulkUtility,
    bulkUtilityYear, setBulkUtilityYear,
    bulkUtilityMonth, setBulkUtilityMonth,
    bulkUtilityEntries, setBulkUtilityEntries,
    bulkUtilitySaving,
    fetchUtilityList, saveUtility, deleteUtility, saveBulkUtility,
    openBulkUtility: _openBulkUtility,
  } = useRentalUtility();

  const {
    reportYear, setReportYear,
    reportStartDate, setReportStartDate,
    reportEndDate, setReportEndDate,
    reportCategoryFilter, setReportCategoryFilter,
    incomeReportData, operatingReportData, reportLoading,
    overdueReportData, overdueReportLoading,
    overdueSelectedIds, setOverdueSelectedIds,
    showOverdueBatch, setShowOverdueBatch,
    overdueBatchForm, setOverdueBatchForm, overdueBatchSaving,
    overdueBatchProgress, overdueBatchAbortRef,
    quickPayIncome, setQuickPayIncome,
    quickPayForm, setQuickPayForm, quickPaySaving,
    vacancyYear, setVacancyYear, vacancyData, vacancyLoading,
    depositFilter, setDepositFilter,
    rentFilingYear, setRentFilingYear, rentFilingData, rentFilingLoading,
    showRentFilingModal, setShowRentFilingModal,
    editingRentFiling, rentFilingForm, setRentFilingForm, rentFilingSaving,
    fetchIncomeReport, fetchOperatingReport, fetchOverdueReport, fetchVacancyReport, fetchRentFiling,
    openQuickPay, confirmQuickPay, batchConfirmOverdueIncomes,
    seedRentFilingYear,
    openRentFilingModalForNew: _openRentFilingModalForNew,
    openRentFilingModalForEdit, saveRentFilingFromModal, deleteRentFilingRow,
  } = useRentalAnalytics({ accounts, properties });

  // ── computed ──────────────────────────────────────────────────
  const expiringContractCount = (summary?.expiringContractDetails || [])
    .filter(c => c.daysUntilExpiry <= 30).length;

  // ── cross-hook wrappers ───────────────────────────────────────
  async function openBulkUtility() {
    let propList = properties;
    if (propList.length === 0) {
      try {
        const res = await fetch('/api/rentals/properties');
        const data = await res.json();
        propList = Array.isArray(data) ? data : [];
        setProperties(propList);
      } catch { propList = []; }
    }
    _openBulkUtility(propList);
  }

  function openRentFilingModalForNew() { _openRentFilingModalForNew(properties); }

  // ── shared fetch ──────────────────────────────────────────────
  async function fetchAccounts() {
    try {
      const res = await fetch('/api/cashflow/accounts');
      const data = await res.json();
      setAccounts(Array.isArray(data) ? data : []);
    } catch { setAccounts([]); }
  }

  async function fetchAll() {
    setLoading(true);
    await Promise.all([
      fetchSummary(),
      fetchAccounts(),
      (async () => {
        try {
          const res = await fetch('/api/accounting-subjects');
          const data = await res.json();
          setAccountingSubjects(Array.isArray(data) ? data : []);
        } catch { setAccountingSubjects([]); }
      })(),
    ]);
    setLoading(false);
  }

  // ── tab navigation ────────────────────────────────────────────
  function switchAnalyticsSub(sub) {
    if (!VALID_ANALYTICS_SUB.includes(sub)) return;
    setAnalyticsSub(sub);
    setActiveTab('analytics');
    router.push(`/rentals?tab=analytics&sub=${sub}`, { scroll: false });
  }

  function switchTab(key) {
    if (key === 'properties') { router.push('/assets'); return; }
    if (key === 'analytics') {
      setActiveTab('analytics');
      router.push(`/rentals?tab=analytics&sub=${analyticsSub}`, { scroll: false });
      return;
    }
    setActiveTab(key);
    router.push(`/rentals?tab=${key}`, { scroll: false });
  }

  // ── effects ───────────────────────────────────────────────────
  useEffect(() => {
    const mapped = LEGACY_TAB_TO_SUB[tabParam];
    if (mapped) {
      setActiveTab('analytics');
      setAnalyticsSub(mapped);
      router.replace(`/rentals?tab=analytics&sub=${mapped}`, { scroll: false });
      return;
    }
    setActiveTab(resolveRentalsMainTab(tabParam));
    if (tabParam === 'analytics') {
      const s = searchParams.get('sub');
      if (s && VALID_ANALYTICS_SUB.includes(s)) setAnalyticsSub(s);
    }
  }, [tabParam, searchParams, router]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchAll(); }, []);

  useEffect(() => {
    if (activeTab !== 'rentFiling') return;
    fetchRentFiling();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rentFilingYear, activeTab]);

  useEffect(() => {
    if (activeTab === 'cashier')       { fetchIncomes(); if (properties.length === 0) fetchProperties(); if (contracts.length === 0) fetchContracts(); if (accounts.length === 0) fetchAccounts(); }
    if (activeTab === 'tenants')       { fetchTenants(); if (properties.length === 0) fetchProperties(); if (accounts.length === 0) fetchAccounts(); }
    if (activeTab === 'contracts')     { fetchContracts(); if (properties.length === 0) fetchProperties(); if (tenants.length === 0) fetchTenants(); }
    if (activeTab === 'taxes')         { fetchTaxes(); fetchYearLocks(); if (properties.length === 0) fetchProperties(); }
    if (activeTab === 'maintenance')   { fetchMaintenances(); fetchProperties(); return; }
    if (activeTab === 'utilityIncome') { fetchUtilityList(); if (properties.length === 0) fetchProperties(); }
    if (activeTab === 'paymentRecords'){ fetchPaymentRecords(); if (properties.length === 0) fetchProperties(); }
    if (activeTab === 'overview')      fetchSummary();
    if (activeTab === 'analytics') {
      if (analyticsSub === 'overdue')    { fetchOverdueReport(); if (properties.length === 0) fetchProperties(); if (accounts.length === 0) fetchAccounts(); }
      if (analyticsSub === 'deposit')    { fetchContracts(); if (properties.length === 0) fetchProperties(); }
      if (analyticsSub === 'vacancy')    fetchVacancyReport();
      if (analyticsSub === 'income')     { fetchIncomeReport();    fetchProperties(); }
      if (analyticsSub === 'operating')  { fetchOperatingReport(); fetchProperties(); }
    }
    if (activeTab === 'rentFiling') { fetchRentFiling(); if (properties.length === 0) fetchProperties(); if (contracts.length === 0) fetchContracts(); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, analyticsSub]);

  useEffect(() => {
    const onVisible = () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      if (activeTab === 'taxes')       fetchTaxes();
      if (activeTab === 'maintenance') fetchMaintenances();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  useEffect(() => {
    if (activeTab !== 'contracts') return;
    const p = new URLSearchParams({ tab: 'contracts' });
    if (contractFilter.status)     p.set('contractStatus', contractFilter.status);
    if (contractFilter.propertyId) p.set('propertyId',     contractFilter.propertyId);
    router.replace(`/rentals?${p}`, { scroll: false });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, contractFilter.status, contractFilter.propertyId]);

  useEffect(() => {
    if (activeTab !== 'taxes') return;
    const p = new URLSearchParams({ tab: 'taxes', taxYear: taxFilter.taxYear });
    if (taxFilter.status)     p.set('taxStatus',  taxFilter.status);
    if (taxFilter.propertyId) p.set('propertyId', taxFilter.propertyId);
    router.replace(`/rentals?${p}`, { scroll: false });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, taxFilter.taxYear, taxFilter.status, taxFilter.propertyId]);

  useEffect(() => {
    if (activeTab !== 'cashier') return;
    const p = new URLSearchParams({ tab: 'cashier', incomeYear: incomeFilter.year });
    if (incomeFilter.month)          p.set('incomeMonth',    incomeFilter.month);
    if (incomeFilter.propertySearch) p.set('propertySearch', incomeFilter.propertySearch);
    router.replace(`/rentals?${p}`, { scroll: false });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, incomeFilter.year, incomeFilter.month, incomeFilter.propertySearch]);

  const editPropertyParam = searchParams.get('editProperty');

  useEffect(() => {
    if (editPropertyParam) fetchProperties();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editPropertyParam]);

  useEffect(() => {
    if (!editPropertyParam) { editPropertyOpenedRef.current = false; return; }
    const id = parseInt(editPropertyParam, 10);
    if (Number.isNaN(id)) { router.replace('/rentals', { scroll: false }); showToast('物業編號無效', 'error'); return; }
    if (properties.length === 0 || editPropertyOpenedRef.current) return;
    const p = properties.find((x) => x.id === id);
    if (!p) { editPropertyOpenedRef.current = true; router.replace('/rentals', { scroll: false }); showToast('查無此物業', 'error'); return; }
    editPropertyOpenedRef.current = true;
    openPropertyModal(p);
    router.replace('/rentals', { scroll: false });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [properties, editPropertyParam, router, openPropertyModal, showToast]);

  // ==================== RENDER ====================
  return (
    <div className="min-h-screen page-bg-rentals">
      <div className="no-print"><Navigation borderColor="border-teal-500" /></div>

      <div className="max-w-7xl mx-auto px-4 py-6">
        <h2 className="text-2xl font-bold text-gray-800 mb-4 no-print">租屋管理</h2>

        {propertiesError   && <div className="mb-4 no-print"><FetchErrorBanner message={propertiesError}   onRetry={fetchProperties} /></div>}
        {contractsError    && <div className="mb-4 no-print"><FetchErrorBanner message={contractsError}    onRetry={fetchContracts} /></div>}
        {incomesError      && <div className="mb-4 no-print"><FetchErrorBanner message={incomesError}      onRetry={fetchIncomes} /></div>}
        {tenantsError      && <div className="mb-4 no-print"><FetchErrorBanner message={tenantsError}      onRetry={fetchTenants} /></div>}
        {taxesError        && <div className="mb-4 no-print"><FetchErrorBanner message={taxesError}        onRetry={fetchTaxes} /></div>}
        {maintenancesError && <div className="mb-4 no-print"><FetchErrorBanner message={maintenancesError} onRetry={fetchMaintenances} /></div>}
        {utilityError      && <div className="mb-4 no-print"><FetchErrorBanner message={utilityError}      onRetry={fetchUtilityList} /></div>}

        <div className="no-print flex gap-1 mb-6 border-b overflow-x-auto">
          {TABS.map(tab => (
            <button key={tab.key} onClick={() => switchTab(tab.key)}
              className={`px-4 py-2 text-sm font-medium whitespace-nowrap border-b-2 transition-colors inline-flex items-center gap-1 ${
                activeTab === tab.key
                  ? 'border-teal-500 text-teal-700 bg-teal-50'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}>
              {tab.label}
              {tab.key === 'contracts' && expiringContractCount > 0 && (
                <span className="bg-orange-500 text-white text-xs rounded-full px-1.5 py-0.5 leading-none font-semibold min-w-[18px] text-center">
                  {expiringContractCount}
                </span>
              )}
            </button>
          ))}
        </div>

        {loading && activeTab === 'overview' ? (
          <div className="text-center py-12 text-gray-500">載入中...</div>
        ) : (
          <>
            {activeTab === 'overview' && (
              <OverviewTab summary={summary} summaryError={summaryError} summaryLoading={summaryLoading}
                summaryLastFetched={summaryLastFetched} fetchSummary={fetchSummary}
                switchTab={switchTab} switchAnalyticsSub={switchAnalyticsSub} />
            )}
            {activeTab === 'cashier' && (
              <CashierTab
                incomes={incomes} incomesHasMore={incomesHasMore} cashierUtilityMap={cashierUtilityMap}
                rentIncKey={rentIncKey} rentIncDir={rentIncDir} rentIncToggle={rentIncToggle}
                incomeFilter={incomeFilter} setIncomeFilter={setIncomeFilter} sortedIncomes={sortedIncomes}
                payingIncomeId={payingIncomeId} setPayingIncomeId={setPayingIncomeId}
                incomeFormMode={incomeFormMode} incomePayForm={incomePayForm} setIncomePayForm={setIncomePayForm}
                incomeUtilityForm={incomeUtilityForm} setIncomeUtilityForm={setIncomeUtilityForm}
                incomePaymentSaving={incomePaymentSaving}
                editingPaymentId={editingPaymentId} setEditingPaymentId={setEditingPaymentId}
                editingPaymentForm={editingPaymentForm} setEditingPaymentForm={setEditingPaymentForm}
                editingPaymentSaving={editingPaymentSaving}
                selectedIncomeIds={selectedIncomeIds} setSelectedIncomeIds={setSelectedIncomeIds}
                showBatchPay={showBatchPay} setShowBatchPay={setShowBatchPay}
                batchPayForm={batchPayForm} setBatchPayForm={setBatchPayForm}
                batchSaving={batchSaving} batchProgress={batchProgress} batchAbortRef={batchAbortRef}
                batchLockSaving={batchLockSaving}
                fetchIncomes={fetchIncomes} confirmIncomePayment={confirmIncomePayment}
                voidIncomePayment={voidIncomePayment} exportIncomeCSV={exportIncomeCSV}
                generateMonthlyIncome={generateMonthlyIncome} printIncomes={printIncomes}
                openIncomePayment={openIncomePayment} openPaymentEdit={openPaymentEdit}
                savePaymentEdit={savePaymentEdit} deletePaymentRecord={deletePaymentRecord}
                toggleIncomeLock={toggleIncomeLock} batchConfirmIncomes={batchConfirmIncomes}
                batchLockIncomes={batchLockIncomes} contracts={contracts}
                setReminderOpen={setReminderOpen} setReminderThreshold={setReminderThreshold}
                accounts={accounts} CONTRACT_INCOME_CATEGORIES={CONTRACT_INCOME_CATEGORIES}
                propInlineEdit={propInlineEdit} setPropInlineEdit={setPropInlineEdit}
                savePropField={savePropField} propInlineSaving={propInlineSaving}
                confirm={confirm} showToast={showToast} switchTab={switchTab}
              />
            )}
            {activeTab === 'tenants' && (
              <TenantsTab tenants={tenants} tenantSearch={tenantSearch} setTenantSearch={setTenantSearch}
                tenantSortKey={tenantSortKey} tenantSortDir={tenantSortDir} tenantToggleSort={tenantToggleSort}
                fetchTenants={fetchTenants} openTenantModal={openTenantModal} deleteTenant={deleteTenant}
                getCreditColor={c => c === 0 ? 'text-green-600' : c <= 2 ? 'text-yellow-600' : 'text-red-600'}
              />
            )}
            {activeTab === 'contracts' && (
              <ContractsTab contracts={contracts} contractFilter={contractFilter} setContractFilter={setContractFilter}
                contractSortKey={contractSortKey} contractSortDir={contractSortDir} contractToggleSort={contractToggleSort}
                reminderOpen={reminderOpen} setReminderOpen={setReminderOpen}
                reminderThreshold={reminderThreshold} setReminderThreshold={setReminderThreshold}
                contractMap={contractMap} getRenewalDepth={getRenewalDepth}
                fetchContracts={fetchContracts} openContractModal={openContractModal}
                openRenewalModal={openRenewalModal} moveContract={moveContract}
                deleteContract={deleteContract} handleDepositAction={handleDepositAction}
                printContracts={printContracts} markReminderSent={markReminderSent}
                clearReminder={clearReminder} properties={properties} tenants={tenants}
                fetchTenants={fetchTenants}
              />
            )}
            {activeTab === 'taxes' && (
              <TaxesTab taxes={taxes} taxFilter={taxFilter} setTaxFilter={setTaxFilter}
                yearLocks={yearLocks} yearLockSaving={yearLockSaving} taxView={taxView} setTaxView={setTaxView}
                taxTableYear={taxTableYear} setTaxTableYear={setTaxTableYear}
                taxTableRows={taxTableRows} setTaxTableRows={setTaxTableRows} taxTableSaving={taxTableSaving}
                payingTaxId={payingTaxId} setPayingTaxId={setPayingTaxId}
                taxPayForm={taxPayForm} setTaxPayForm={setTaxPayForm}
                fetchTaxes={fetchTaxes} fetchYearLocks={fetchYearLocks} fetchTaxTable={fetchTaxTable}
                lockYear={lockYear} unlockYear={unlockYear} openTaxEdit={openTaxEdit}
                confirmTaxPayment={confirmTaxPayment} deleteTax={deleteTax} printTaxes={printTaxes}
                saveTaxTable={saveTaxTable} properties={properties} accounts={accounts}
                setEditingTax={setEditingTax} setTaxForm={setTaxForm} setShowTaxModal={setShowTaxModal}
              />
            )}
            {activeTab === 'rentFiling' && (
              <RentFilingTab rentFilingYear={rentFilingYear} setRentFilingYear={setRentFilingYear}
                rentFilingData={rentFilingData} rentFilingLoading={rentFilingLoading}
                fetchRentFiling={fetchRentFiling} seedRentFilingYear={seedRentFilingYear}
                openRentFilingModalForNew={openRentFilingModalForNew}
                openRentFilingModalForEdit={openRentFilingModalForEdit}
                deleteRentFilingRow={deleteRentFilingRow}
              />
            )}
            {activeTab === 'maintenance' && (
              <MaintenanceTab maintenances={maintenances} maintenancesHasMore={maintenancesHasMore}
                maintenanceFilter={maintenanceFilter} setMaintenanceFilter={setMaintenanceFilter}
                maintenanceAnalysis={maintenanceAnalysis} fetchMaintenances={fetchMaintenances}
                deleteMaintenance={deleteMaintenance}
                setEditingMaintenance={setEditingMaintenance} setMaintenanceForm={setMaintenanceForm}
                setShowMaintenanceModal={setShowMaintenanceModal}
                properties={properties} accountingSubjects={accountingSubjects}
              />
            )}
            {activeTab === 'utilityIncome' && (
              <UtilityIncomeTab utilityFilter={utilityFilter} setUtilityFilter={setUtilityFilter}
                utilityList={utilityList} showBulkUtility={showBulkUtility} setShowBulkUtility={setShowBulkUtility}
                bulkUtilityYear={bulkUtilityYear} setBulkUtilityYear={setBulkUtilityYear}
                bulkUtilityMonth={bulkUtilityMonth} setBulkUtilityMonth={setBulkUtilityMonth}
                bulkUtilityEntries={bulkUtilityEntries} setBulkUtilityEntries={setBulkUtilityEntries}
                bulkUtilitySaving={bulkUtilitySaving} showUtilityModal={showUtilityModal}
                setShowUtilityModal={setShowUtilityModal} utilityForm={utilityForm} setUtilityForm={setUtilityForm}
                editingUtility={editingUtility} setEditingUtility={setEditingUtility} utilitySaving={utilitySaving}
                fetchUtilityList={fetchUtilityList} saveUtility={saveUtility} deleteUtility={deleteUtility}
                saveBulkUtility={saveBulkUtility} openBulkUtility={openBulkUtility}
                properties={properties} accounts={accounts}
              />
            )}
            {activeTab === 'analytics' && (
              <AnalyticsTab analyticsSub={analyticsSub} switchAnalyticsSub={switchAnalyticsSub}
                reportYear={reportYear} setReportYear={setReportYear}
                reportStartDate={reportStartDate} setReportStartDate={setReportStartDate}
                reportEndDate={reportEndDate} setReportEndDate={setReportEndDate}
                reportCategoryFilter={reportCategoryFilter} setReportCategoryFilter={setReportCategoryFilter}
                incomeReportData={incomeReportData} operatingReportData={operatingReportData}
                reportLoading={reportLoading} overdueReportData={overdueReportData}
                overdueReportLoading={overdueReportLoading}
                overdueSelectedIds={overdueSelectedIds} setOverdueSelectedIds={setOverdueSelectedIds}
                showOverdueBatch={showOverdueBatch} setShowOverdueBatch={setShowOverdueBatch}
                overdueBatchForm={overdueBatchForm} setOverdueBatchForm={setOverdueBatchForm}
                overdueBatchSaving={overdueBatchSaving} overdueBatchProgress={overdueBatchProgress}
                overdueBatchAbortRef={overdueBatchAbortRef}
                quickPayIncome={quickPayIncome} setQuickPayIncome={setQuickPayIncome}
                quickPayForm={quickPayForm} setQuickPayForm={setQuickPayForm} quickPaySaving={quickPaySaving}
                vacancyYear={vacancyYear} setVacancyYear={setVacancyYear}
                vacancyData={vacancyData} vacancyLoading={vacancyLoading}
                depositFilter={depositFilter} setDepositFilter={setDepositFilter}
                fetchIncomeReport={fetchIncomeReport} fetchOperatingReport={fetchOperatingReport}
                fetchOverdueReport={fetchOverdueReport} fetchVacancyReport={fetchVacancyReport}
                openQuickPay={openQuickPay} confirmQuickPay={confirmQuickPay}
                batchConfirmOverdueIncomes={batchConfirmOverdueIncomes}
                contracts={contracts} handleDepositAction={handleDepositAction}
                accounts={accounts} reportCategoryOptions={reportCategoryOptions} switchTab={switchTab}
              />
            )}
            {activeTab === 'paymentRecords' && (
              <PaymentRecordsTab paymentFilter={paymentFilter} setPaymentFilter={setPaymentFilter}
                paymentRecords={paymentRecords} paymentRecordsPagination={paymentRecordsPagination}
                paymentLoading={paymentLoading} paymentSortKey={paymentSortKey}
                paymentSortDir={paymentSortDir} paymentToggleSort={paymentToggleSort}
                editingPaymentId={editingPaymentId} setEditingPaymentId={setEditingPaymentId}
                editingPaymentForm={editingPaymentForm} setEditingPaymentForm={setEditingPaymentForm}
                editingPaymentSaving={editingPaymentSaving} fetchPaymentRecords={fetchPaymentRecords}
                openPaymentEdit={openPaymentEdit} savePaymentEdit={savePaymentEdit}
                deletePaymentRecord={deletePaymentRecord}
                properties={properties} accounts={accounts} confirm={confirm}
              />
            )}
            {activeTab === 'help' && <HelpTab />}
          </>
        )}
      </div>

      {/* ── Modals ── */}
      <TerminateContractModal terminateModal={terminateModal} setTerminateModal={setTerminateModal} terminateContract={terminateContract} />

      <QuickPayModal quickPayIncome={quickPayIncome} setQuickPayIncome={setQuickPayIncome}
        quickPayForm={quickPayForm} setQuickPayForm={setQuickPayForm}
        quickPaySaving={quickPaySaving} confirmQuickPay={confirmQuickPay} accounts={accounts} />

      <RentFilingModal showRentFilingModal={showRentFilingModal} setShowRentFilingModal={setShowRentFilingModal}
        editingRentFiling={editingRentFiling} rentFilingYear={rentFilingYear}
        rentFilingForm={rentFilingForm} setRentFilingForm={setRentFilingForm}
        rentFilingSaving={rentFilingSaving} saveRentFilingFromModal={saveRentFilingFromModal}
        properties={properties} contracts={contracts} />

      <TaxModal showTaxModal={showTaxModal} setShowTaxModal={setShowTaxModal}
        editingTax={editingTax} setEditingTax={setEditingTax}
        taxForm={taxForm} setTaxForm={setTaxForm} taxSaving={taxSaving} saveTax={saveTax}
        properties={properties} />

      <MaintenanceModal showMaintenanceModal={showMaintenanceModal} setShowMaintenanceModal={setShowMaintenanceModal}
        editingMaintenance={editingMaintenance} setEditingMaintenance={setEditingMaintenance}
        maintenanceForm={maintenanceForm} setMaintenanceForm={setMaintenanceForm}
        maintenanceSaving={maintenanceSaving} saveMaintenance={saveMaintenance}
        properties={properties} accountingSubjects={accountingSubjects} accounts={accounts} />

      {showTenantModal && (
        <EditTenantModal editingTenant={editingTenant}
          tenantForm={tenantForm} setTenantForm={setTenantForm}
          tenantSaving={tenantSaving} saveTenant={saveTenant}
          onClose={() => setShowTenantModal(false)}
          onInitiateTerminate={(tenant, contract) => {
            setShowTenantModal(false);
            setTerminateModal({ tenant, contracts: [contract], endDate: todayStr() });
          }}
          contractPropertyChanges={contractPropertyChanges} setContractPropertyChanges={setContractPropertyChanges}
          properties={properties} accounts={accounts}
          initContractErrors={initContractErrors} setInitContractErrors={setInitContractErrors}
        />
      )}

      {showPropertyModal && (
        <PropertyModal mode="rentals" open={showPropertyModal}
          onClose={() => setShowPropertyModal(false)}
          form={propertyForm} setForm={setPropertyForm}
          editingProperty={editingProperty} accounts={accounts}
          saving={propertySaving} onSave={saveProperty}
          onDelete={editingProperty ? async () => {
            const id = editingProperty.id;
            if (!(await confirm('確定要刪除此物業？此操作無法復原。', { title: '刪除物業', danger: true }))) return;
            try {
              const res = await fetch(`/api/rentals/properties/${id}`, { method: 'DELETE' });
              const data = await res.json();
              if (!res.ok) return showToast(data.error || '刪除失敗', 'error');
              setShowPropertyModal(false);
              fetchProperties();
            } catch (err) { showToast('刪除失敗: ' + err.message, 'error'); }
          } : undefined}
          onOpenRentFiling={() => { setShowPropertyModal(false); switchTab('rentFiling'); }}
        />
      )}

      {showContractModal && (
        <ContractModal editingContract={editingContract}
          contractForm={contractForm} setContractForm={setContractForm}
          contractSaving={contractSaving} saveContract={saveContract}
          onClose={() => { setShowContractModal(false); setRenewingFromContract(null); }}
          renewingFromContract={renewingFromContract}
          properties={properties} tenants={tenants} accounts={accounts}
          accountingSubjects={accountingSubjects}
        />
      )}
    </div>
  );
}
