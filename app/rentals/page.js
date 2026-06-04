'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Navigation from '@/components/Navigation';
import { useToast } from '@/context/ToastContext';
import { todayStr } from '@/lib/localDate';
import { useConfirm } from '@/context/ConfirmContext';
import { getContractDisplayStatus, getTenantDisplayName } from './_lib/rentalHelpers';
import EditTenantModal from './_components/EditTenantModal';
import ContractModal   from './_components/ContractModal';
import PropertyModal   from '@/components/PropertyModal';
import OverviewTab       from './_tabs/OverviewTab';
import CashierTab        from './_tabs/CashierTab';
import TenantsTab        from './_tabs/TenantsTab';
import ContractsTab      from './_tabs/ContractsTab';
import TaxesTab          from './_tabs/TaxesTab';
import RentFilingTab     from './_tabs/RentFilingTab';
import MaintenanceTab    from './_tabs/MaintenanceTab';
import UtilityIncomeTab  from './_tabs/UtilityIncomeTab';
import AnalyticsTab      from './_tabs/AnalyticsTab';
import PaymentRecordsTab from './_tabs/PaymentRecordsTab';
import HelpTab           from './_tabs/HelpTab';
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
  { key: 'overview',        label: '總覽' },
  { key: 'cashier',         label: '收租工作台' },
  { key: 'paymentRecords',  label: '付款紀錄' },
  { key: 'tenants',         label: '租客管理' },
  { key: 'contracts',       label: '合約管理' },
  { key: 'taxes',           label: '稅款管理' },
  { key: 'rentFiling',      label: '租金申報' },
  { key: 'maintenance',     label: '維護費' },
  { key: 'utilityIncome',   label: '水電收入' },
  { key: 'analytics',       label: '分析報表' },
  { key: 'help',            label: '說明' },
];

/** 舊網址 ?tab=incomeReport 等 → 導向 ?tab=analytics&sub=… */
const LEGACY_TAB_TO_SUB = {
  incomeReport:    'income',
  operatingReport: 'operating',
  overdueReport:   'overdue',
  depositTracking: 'deposit',
  vacancyReport:   'vacancy',
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


function fmt(n) {
  return Number(n || 0).toLocaleString('zh-TW');
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
  const router = useRouter();
  const { showToast } = useToast();
  const confirm = useConfirm();
  const tabParam = searchParams.get('tab') || 'overview';
  const [activeTab,    setActiveTab]    = useState(() => resolveRentalsMainTab(tabParam));
  const [analyticsSub, setAnalyticsSub] = useState(() => resolveRentalsAnalyticsSub(tabParam, searchParams));

  // ── Shared state (used across multiple hooks) ─────────────────
  const [accounts,           setAccounts]           = useState([]);
  const [accountingSubjects, setAccountingSubjects] = useState([]);
  const [loading,            setLoading]            = useState(true);

  // ── Hooks ─────────────────────────────────────────────────────
  const {
    summary, summaryError, summaryLoading, summaryLastFetched, fetchSummary,
  } = useRentalSummary();

  const {
    properties, setProperties,
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
    tenants, setTenants,
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
    contracts, setContracts,
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
    // FE1: 合約建立/更新後刷新收租清單（新合約可能產生應收記錄）
    onAfterSave: () => { fetchProperties(); fetchTenants(); fetchIncomes(); },
  });

  const {
    incomes, setIncomes,
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
    taxes, setTaxes,
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
    maintenances, setMaintenances,
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
    utilityList, setUtilityList,
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

  // ── Computed ──────────────────────────────────────────────────
  const expiringContractCount = (summary?.expiringContractDetails || [])
    .filter(c => c.daysUntilExpiry <= 30).length;

  // ── Cross-hook wrappers ───────────────────────────────────────
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

  function openRentFilingModalForNew() {
    _openRentFilingModalForNew(properties);
  }

  // ── Shared fetch ──────────────────────────────────────────────
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

  // ── Tab navigation ────────────────────────────────────────────
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

  // ── Effects ───────────────────────────────────────────────────
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

  useEffect(() => {
    fetchAll();
  }, []);

  useEffect(() => {
    if (activeTab !== 'rentFiling') return;
    fetchRentFiling();
  }, [rentFilingYear, activeTab]);

  useEffect(() => {
    if (activeTab === 'cashier') { fetchIncomes(); if (properties.length === 0) fetchProperties(); if (contracts.length === 0) fetchContracts(); if (accounts.length === 0) fetchAccounts(); }
    if (activeTab === 'tenants') { fetchTenants(); if (properties.length === 0) fetchProperties(); if (accounts.length === 0) fetchAccounts(); }
    if (activeTab === 'contracts') {
      fetchContracts();
      if (properties.length === 0) fetchProperties();
      if (tenants.length === 0) fetchTenants();
    }
    if (activeTab === 'taxes') { fetchTaxes(); fetchYearLocks(); if (properties.length === 0) fetchProperties(); }
    // 維護費頁面也需要物業清單供下拉選單使用
    if (activeTab === 'maintenance') {
      fetchMaintenances();
      fetchProperties();
      return;
    }
    if (activeTab === 'utilityIncome') { fetchUtilityList(); if (properties.length === 0) fetchProperties(); }
    if (activeTab === 'paymentRecords') { fetchPaymentRecords(); if (properties.length === 0) fetchProperties(); }
    if (activeTab === 'overview') fetchSummary();
    if (activeTab === 'analytics') {
      if (analyticsSub === 'overdue') { fetchOverdueReport(); if (properties.length === 0) fetchProperties(); if (accounts.length === 0) fetchAccounts(); }
      if (analyticsSub === 'deposit') { fetchContracts(); if (properties.length === 0) fetchProperties(); }
      if (analyticsSub === 'vacancy') fetchVacancyReport();
      if (analyticsSub === 'income')    { fetchIncomeReport();    fetchProperties(); }
      if (analyticsSub === 'operating') { fetchOperatingReport(); fetchProperties(); }
    }
    if (activeTab === 'rentFiling') {
      fetchRentFiling();
      if (properties.length === 0) fetchProperties();
      if (contracts.length === 0) fetchContracts();
    }
  }, [activeTab, analyticsSub]);

  // 從出納執行回來時自動更新稅款/維護費清單（頁面重新顯示時 refetch）
  useEffect(() => {
    const onVisible = () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      if (activeTab === 'taxes')       fetchTaxes();
      if (activeTab === 'maintenance') fetchMaintenances();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [activeTab]);

  // ── URL ↔ filter sync ─────────────────────────────────────────
  useEffect(() => {
    if (activeTab !== 'contracts') return;
    const p = new URLSearchParams({ tab: 'contracts' });
    if (contractFilter.status)     p.set('contractStatus', contractFilter.status);
    if (contractFilter.propertyId) p.set('propertyId',     contractFilter.propertyId);
    router.replace(`/rentals?${p}`, { scroll: false });
  }, [activeTab, contractFilter.status, contractFilter.propertyId]);

  useEffect(() => {
    if (activeTab !== 'taxes') return;
    const p = new URLSearchParams({ tab: 'taxes', taxYear: taxFilter.taxYear });
    if (taxFilter.status)     p.set('taxStatus',  taxFilter.status);
    if (taxFilter.propertyId) p.set('propertyId', taxFilter.propertyId);
    router.replace(`/rentals?${p}`, { scroll: false });
  }, [activeTab, taxFilter.taxYear, taxFilter.status, taxFilter.propertyId]);

  useEffect(() => {
    if (activeTab !== 'cashier') return;
    const p = new URLSearchParams({ tab: 'cashier', incomeYear: incomeFilter.year });
    if (incomeFilter.month)          p.set('incomeMonth',    incomeFilter.month);
    if (incomeFilter.propertySearch) p.set('propertySearch', incomeFilter.propertySearch);
    router.replace(`/rentals?${p}`, { scroll: false });
  }, [activeTab, incomeFilter.year, incomeFilter.month, incomeFilter.propertySearch]);

  // ── editProperty URL param ────────────────────────────────────
  const editPropertyParam = searchParams.get('editProperty');

  useEffect(() => {
    if (editPropertyParam) fetchProperties();
  }, [editPropertyParam]);

  useEffect(() => {
    if (!editPropertyParam) {
      editPropertyOpenedRef.current = false;
      return;
    }
    const id = parseInt(editPropertyParam, 10);
    if (Number.isNaN(id)) {
      router.replace('/rentals', { scroll: false });
      showToast('物業編號無效', 'error');
      return;
    }
    if (properties.length === 0 || editPropertyOpenedRef.current) return;
    const p = properties.find((x) => x.id === id);
    if (!p) {
      editPropertyOpenedRef.current = true;
      router.replace('/rentals', { scroll: false });
      showToast('查無此物業', 'error');
      return;
    }
    editPropertyOpenedRef.current = true;
    openPropertyModal(p);
    router.replace('/rentals', { scroll: false });
  }, [properties, editPropertyParam, router, openPropertyModal, showToast]);

  // ── Helper ────────────────────────────────────────────────────
  function getCreditColor(count) {
    if (count === 0) return 'text-green-600';
    if (count <= 2)  return 'text-yellow-600';
    return 'text-red-600';
  }

  // ==================== RENDER ====================
  return (
    <div className="min-h-screen page-bg-rentals">
      <div className="no-print"><Navigation borderColor="border-teal-500" /></div>

      <div className="max-w-7xl mx-auto px-4 py-6">
        <h2 className="text-2xl font-bold text-gray-800 mb-4 no-print">租屋管理</h2>

        {/* Tab Navigation */}
        <div className="no-print flex gap-1 mb-6 border-b overflow-x-auto">
          {TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => switchTab(tab.key)}
              className={`px-4 py-2 text-sm font-medium whitespace-nowrap border-b-2 transition-colors inline-flex items-center gap-1 ${
                activeTab === tab.key
                  ? 'border-teal-500 text-teal-700 bg-teal-50'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
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
              <OverviewTab
                summary={summary}
                summaryError={summaryError}
                summaryLoading={summaryLoading}
                summaryLastFetched={summaryLastFetched}
                fetchSummary={fetchSummary}
                switchTab={switchTab}
                switchAnalyticsSub={switchAnalyticsSub}
              />
            )}
            {activeTab === 'cashier' && (
              <CashierTab
                incomes={incomes}
                incomesHasMore={incomesHasMore}
                cashierUtilityMap={cashierUtilityMap}
                rentIncKey={rentIncKey}
                rentIncDir={rentIncDir}
                rentIncToggle={rentIncToggle}
                incomeFilter={incomeFilter}
                setIncomeFilter={setIncomeFilter}
                sortedIncomes={sortedIncomes}
                payingIncomeId={payingIncomeId}
                setPayingIncomeId={setPayingIncomeId}
                incomeFormMode={incomeFormMode}
                incomePayForm={incomePayForm}
                setIncomePayForm={setIncomePayForm}
                incomeUtilityForm={incomeUtilityForm}
                setIncomeUtilityForm={setIncomeUtilityForm}
                incomePaymentSaving={incomePaymentSaving}
                editingPaymentId={editingPaymentId}
                setEditingPaymentId={setEditingPaymentId}
                editingPaymentForm={editingPaymentForm}
                setEditingPaymentForm={setEditingPaymentForm}
                editingPaymentSaving={editingPaymentSaving}
                selectedIncomeIds={selectedIncomeIds}
                setSelectedIncomeIds={setSelectedIncomeIds}
                showBatchPay={showBatchPay}
                setShowBatchPay={setShowBatchPay}
                batchPayForm={batchPayForm}
                setBatchPayForm={setBatchPayForm}
                batchSaving={batchSaving}
                batchProgress={batchProgress}
                batchAbortRef={batchAbortRef}
                batchLockSaving={batchLockSaving}
                fetchIncomes={fetchIncomes}
                confirmIncomePayment={confirmIncomePayment}
                voidIncomePayment={voidIncomePayment}
                exportIncomeCSV={exportIncomeCSV}
                generateMonthlyIncome={generateMonthlyIncome}
                printIncomes={printIncomes}
                openIncomePayment={openIncomePayment}
                openPaymentEdit={openPaymentEdit}
                savePaymentEdit={savePaymentEdit}
                deletePaymentRecord={deletePaymentRecord}
                toggleIncomeLock={toggleIncomeLock}
                batchConfirmIncomes={batchConfirmIncomes}
                batchLockIncomes={batchLockIncomes}
                contracts={contracts}
                setReminderOpen={setReminderOpen}
                setReminderThreshold={setReminderThreshold}
                accounts={accounts}
                CONTRACT_INCOME_CATEGORIES={CONTRACT_INCOME_CATEGORIES}
                propInlineEdit={propInlineEdit}
                setPropInlineEdit={setPropInlineEdit}
                savePropField={savePropField}
                propInlineSaving={propInlineSaving}
                confirm={confirm}
                showToast={showToast}
                switchTab={switchTab}
              />
            )}
            {activeTab === 'tenants' && (
              <TenantsTab
                tenants={tenants}
                tenantSearch={tenantSearch}
                setTenantSearch={setTenantSearch}
                tenantSortKey={tenantSortKey}
                tenantSortDir={tenantSortDir}
                tenantToggleSort={tenantToggleSort}
                fetchTenants={fetchTenants}
                openTenantModal={openTenantModal}
                deleteTenant={deleteTenant}
                getCreditColor={getCreditColor}
              />
            )}
            {activeTab === 'contracts' && (
              <ContractsTab
                contracts={contracts}
                contractFilter={contractFilter}
                setContractFilter={setContractFilter}
                contractSortKey={contractSortKey}
                contractSortDir={contractSortDir}
                contractToggleSort={contractToggleSort}
                reminderOpen={reminderOpen}
                setReminderOpen={setReminderOpen}
                reminderThreshold={reminderThreshold}
                setReminderThreshold={setReminderThreshold}
                contractMap={contractMap}
                getRenewalDepth={getRenewalDepth}
                fetchContracts={fetchContracts}
                openContractModal={openContractModal}
                openRenewalModal={openRenewalModal}
                moveContract={moveContract}
                deleteContract={deleteContract}
                handleDepositAction={handleDepositAction}
                printContracts={printContracts}
                markReminderSent={markReminderSent}
                clearReminder={clearReminder}
                properties={properties}
                tenants={tenants}
                fetchTenants={fetchTenants}
              />
            )}
            {activeTab === 'taxes' && (
              <TaxesTab
                taxes={taxes}
                taxFilter={taxFilter}
                setTaxFilter={setTaxFilter}
                yearLocks={yearLocks}
                yearLockSaving={yearLockSaving}
                taxView={taxView}
                setTaxView={setTaxView}
                taxTableYear={taxTableYear}
                setTaxTableYear={setTaxTableYear}
                taxTableRows={taxTableRows}
                setTaxTableRows={setTaxTableRows}
                taxTableSaving={taxTableSaving}
                payingTaxId={payingTaxId}
                setPayingTaxId={setPayingTaxId}
                taxPayForm={taxPayForm}
                setTaxPayForm={setTaxPayForm}
                fetchTaxes={fetchTaxes}
                fetchYearLocks={fetchYearLocks}
                fetchTaxTable={fetchTaxTable}
                lockYear={lockYear}
                unlockYear={unlockYear}
                openTaxEdit={openTaxEdit}
                confirmTaxPayment={confirmTaxPayment}
                deleteTax={deleteTax}
                printTaxes={printTaxes}
                saveTaxTable={saveTaxTable}
                properties={properties}
                accounts={accounts}
                setEditingTax={setEditingTax}
                setTaxForm={setTaxForm}
                setShowTaxModal={setShowTaxModal}
              />
            )}
            {activeTab === 'rentFiling' && (
              <RentFilingTab
                rentFilingYear={rentFilingYear}
                setRentFilingYear={setRentFilingYear}
                rentFilingData={rentFilingData}
                rentFilingLoading={rentFilingLoading}
                fetchRentFiling={fetchRentFiling}
                seedRentFilingYear={seedRentFilingYear}
                openRentFilingModalForNew={openRentFilingModalForNew}
                openRentFilingModalForEdit={openRentFilingModalForEdit}
                deleteRentFilingRow={deleteRentFilingRow}
              />
            )}
            {activeTab === 'maintenance' && (
              <MaintenanceTab
                maintenances={maintenances}
                maintenancesHasMore={maintenancesHasMore}
                maintenanceFilter={maintenanceFilter}
                setMaintenanceFilter={setMaintenanceFilter}
                maintenanceAnalysis={maintenanceAnalysis}
                fetchMaintenances={fetchMaintenances}
                deleteMaintenance={deleteMaintenance}
                setEditingMaintenance={setEditingMaintenance}
                setMaintenanceForm={setMaintenanceForm}
                setShowMaintenanceModal={setShowMaintenanceModal}
                properties={properties}
                accountingSubjects={accountingSubjects}
              />
            )}
            {activeTab === 'utilityIncome' && (
              <UtilityIncomeTab
                utilityFilter={utilityFilter}
                setUtilityFilter={setUtilityFilter}
                utilityList={utilityList}
                showBulkUtility={showBulkUtility}
                setShowBulkUtility={setShowBulkUtility}
                bulkUtilityYear={bulkUtilityYear}
                setBulkUtilityYear={setBulkUtilityYear}
                bulkUtilityMonth={bulkUtilityMonth}
                setBulkUtilityMonth={setBulkUtilityMonth}
                bulkUtilityEntries={bulkUtilityEntries}
                setBulkUtilityEntries={setBulkUtilityEntries}
                bulkUtilitySaving={bulkUtilitySaving}
                showUtilityModal={showUtilityModal}
                setShowUtilityModal={setShowUtilityModal}
                utilityForm={utilityForm}
                setUtilityForm={setUtilityForm}
                editingUtility={editingUtility}
                setEditingUtility={setEditingUtility}
                utilitySaving={utilitySaving}
                fetchUtilityList={fetchUtilityList}
                saveUtility={saveUtility}
                deleteUtility={deleteUtility}
                saveBulkUtility={saveBulkUtility}
                openBulkUtility={openBulkUtility}
                properties={properties}
                accounts={accounts}
              />
            )}
            {activeTab === 'analytics' && (
              <AnalyticsTab
                analyticsSub={analyticsSub}
                switchAnalyticsSub={switchAnalyticsSub}
                reportYear={reportYear}
                setReportYear={setReportYear}
                reportStartDate={reportStartDate}
                setReportStartDate={setReportStartDate}
                reportEndDate={reportEndDate}
                setReportEndDate={setReportEndDate}
                reportCategoryFilter={reportCategoryFilter}
                setReportCategoryFilter={setReportCategoryFilter}
                incomeReportData={incomeReportData}
                operatingReportData={operatingReportData}
                reportLoading={reportLoading}
                overdueReportData={overdueReportData}
                overdueReportLoading={overdueReportLoading}
                overdueSelectedIds={overdueSelectedIds}
                setOverdueSelectedIds={setOverdueSelectedIds}
                showOverdueBatch={showOverdueBatch}
                setShowOverdueBatch={setShowOverdueBatch}
                overdueBatchForm={overdueBatchForm}
                setOverdueBatchForm={setOverdueBatchForm}
                overdueBatchSaving={overdueBatchSaving}
                overdueBatchProgress={overdueBatchProgress}
                overdueBatchAbortRef={overdueBatchAbortRef}
                quickPayIncome={quickPayIncome}
                setQuickPayIncome={setQuickPayIncome}
                quickPayForm={quickPayForm}
                setQuickPayForm={setQuickPayForm}
                quickPaySaving={quickPaySaving}
                vacancyYear={vacancyYear}
                setVacancyYear={setVacancyYear}
                vacancyData={vacancyData}
                vacancyLoading={vacancyLoading}
                depositFilter={depositFilter}
                setDepositFilter={setDepositFilter}
                fetchIncomeReport={fetchIncomeReport}
                fetchOperatingReport={fetchOperatingReport}
                fetchOverdueReport={fetchOverdueReport}
                fetchVacancyReport={fetchVacancyReport}
                openQuickPay={openQuickPay}
                confirmQuickPay={confirmQuickPay}
                batchConfirmOverdueIncomes={batchConfirmOverdueIncomes}
                contracts={contracts}
                handleDepositAction={handleDepositAction}
                accounts={accounts}
                reportCategoryOptions={reportCategoryOptions}
                switchTab={switchTab}
              />
            )}
            {activeTab === 'paymentRecords' && (
              <PaymentRecordsTab
                paymentFilter={paymentFilter}
                setPaymentFilter={setPaymentFilter}
                paymentRecords={paymentRecords}
                paymentRecordsPagination={paymentRecordsPagination}
                paymentLoading={paymentLoading}
                paymentSortKey={paymentSortKey}
                paymentSortDir={paymentSortDir}
                paymentToggleSort={paymentToggleSort}
                editingPaymentId={editingPaymentId}
                setEditingPaymentId={setEditingPaymentId}
                editingPaymentForm={editingPaymentForm}
                setEditingPaymentForm={setEditingPaymentForm}
                editingPaymentSaving={editingPaymentSaving}
                fetchPaymentRecords={fetchPaymentRecords}
                openPaymentEdit={openPaymentEdit}
                savePaymentEdit={savePaymentEdit}
                deletePaymentRecord={deletePaymentRecord}
                properties={properties}
                accounts={accounts}
                confirm={confirm}
              />
            )}
            {activeTab === 'help' && <HelpTab />}
          </>
                )}
              </div>

      {/* ==================== MODAL: 退租確認 ==================== */}
      {terminateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setTerminateModal(null)}>
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
            <div className="p-5">
              <h3 className="text-base font-semibold text-gray-800 mb-1">辦理退租</h3>
              <p className="text-sm text-gray-500 mb-4">租客：{getTenantDisplayName(terminateModal.tenant)}</p>
              <div className="mb-3">
                <label htmlFor="f-29" className="text-sm text-gray-600 block mb-1">退租日期</label>
                <input id="f-29" type="date" value={terminateModal.endDate}
                  onChange={e => setTerminateModal(m => ({ ...m, endDate: e.target.value }))}
                  className="border rounded px-3 py-1.5 text-sm w-full" />
              </div>
              <p className="text-sm text-gray-600 mb-2">選擇要終止的合約：</p>
              <div className="space-y-2 mb-5">
                {terminateModal.contracts.map(c => (
                  <div key={c.id} className="flex items-center justify-between border rounded-lg px-3 py-2 bg-orange-50">
                    <div>
                      <span className="text-sm font-medium text-gray-800">{c.property?.name || '未知物業'}</span>
                      <span className="text-xs text-gray-500 ml-2">（{{ active: '生效中', pending: '待審核', expired: '已到期', terminated: '已終止' }[getContractDisplayStatus(c)] || c.status}）</span>
                      {c.endDate && <span className="text-xs text-gray-400 ml-2">到期 {c.endDate}</span>}
                    </div>
                    <button
                      onClick={() => terminateContract(c.id, terminateModal.endDate)}
                      className="text-xs px-3 py-1 bg-orange-500 text-white rounded hover:bg-orange-600 font-medium whitespace-nowrap">
                      確認退租
                    </button>
                  </div>
                ))}
              </div>
              <div className="flex justify-end">
                <button onClick={() => setTerminateModal(null)} className="px-4 py-2 text-sm bg-gray-200 rounded hover:bg-gray-300">取消</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==================== MODAL: TENANT ==================== */}
      {showTenantModal && (
        <EditTenantModal
          editingTenant={editingTenant}
          tenantForm={tenantForm} setTenantForm={setTenantForm}
          tenantSaving={tenantSaving}
          saveTenant={saveTenant}
          onClose={() => setShowTenantModal(false)}
          onInitiateTerminate={(tenant, contract) => {
                                  setShowTenantModal(false);
            setTerminateModal({ tenant, contracts: [contract], endDate: todayStr() });
          }}
          contractPropertyChanges={contractPropertyChanges} setContractPropertyChanges={setContractPropertyChanges}
          properties={properties}
          accounts={accounts}
          initContractErrors={initContractErrors} setInitContractErrors={setInitContractErrors}
        />
      )}
      {/* ==================== MODAL: QUICK PAY ==================== */}
      {quickPayIncome && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setQuickPayIncome(null)}>
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
            <div className="p-6">
              <h3 className="text-lg font-bold text-gray-800 mb-4">確認收款</h3>
              {/* 唯讀資訊 */}
              <div className="bg-gray-50 rounded-lg p-3 mb-4 space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">物業</span>
                  <span className="font-medium text-gray-800">{quickPayIncome.propertyName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">租客</span>
                  <span className="font-medium text-gray-800">
                    {quickPayIncome.tenantName || (quickPayIncome.tenant?.tenantType === 'company' ? quickPayIncome.tenant?.companyName : quickPayIncome.tenant?.fullName) || '—'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">聯絡電話</span>
                  <span className="text-gray-700">{quickPayIncome.tenant?.phone || '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">租期</span>
                  <span className="text-gray-700">{quickPayIncome.incomeYear}/{String(quickPayIncome.incomeMonth).padStart(2,'0')}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">應收金額</span>
                  <span className="font-semibold text-gray-800">${fmt(quickPayIncome.expectedAmount)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">到期日</span>
                  <span className="text-red-600 font-medium">{quickPayIncome.dueDate}</span>
                </div>
              </div>
              {/* 可編輯欄位 */}
              <div className="space-y-3">
                <div>
                  <label htmlFor="f-30" className="text-sm text-gray-600">實收金額 *</label>
                  <input id="f-30" type="number" min="0" value={quickPayForm.actualAmount}
                    onChange={e => setQuickPayForm(f => ({ ...f, actualAmount: e.target.value }))}
                    className="w-full border rounded px-3 py-2 text-sm" />
                </div>
                <div>
                  <label htmlFor="f-31" className="text-sm text-gray-600">收款日期 *</label>
                  <input id="f-31" type="date" value={quickPayForm.actualDate}
                    onChange={e => setQuickPayForm(f => ({ ...f, actualDate: e.target.value }))}
                    className="w-full border rounded px-3 py-2 text-sm" />
                </div>
                <div>
                  <label htmlFor="f-32" className="text-sm text-gray-600">收款帳戶 *</label>
                  <select id="f-32" value={quickPayForm.accountId}
                    onChange={e => {
                      const acct = accounts.find(a => String(a.id) === e.target.value);
                      const autoMethod = acct?.type === '現金' ? '現金' : acct?.type === '銀行存款' ? '匯款' : null;
                      setQuickPayForm(f => ({ ...f, accountId: e.target.value, ...(autoMethod ? { paymentMethod: autoMethod } : {}) }));
                    }}
                    className="w-full border rounded px-3 py-2 text-sm">
                    <option value="">-- 選擇帳戶 --</option>
                    {accounts.map(a => <option key={a.id} value={String(a.id)}>{a.name}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="f-84" className="text-sm text-gray-600">付款方式</label>
                  <select id="f-84" value={quickPayForm.paymentMethod}
                    onChange={e => setQuickPayForm(f => ({ ...f, paymentMethod: e.target.value }))}
                    className="w-full border rounded px-3 py-2 text-sm">
                    {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m === 'transfer' ? '轉帳' : m}</option>)}
                  </select>
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-5">
                <button onClick={() => setQuickPayIncome(null)} className="px-4 py-2 text-sm bg-gray-200 rounded hover:bg-gray-300">取消</button>
                <button onClick={confirmQuickPay} disabled={quickPaySaving}
                  className="px-4 py-2 text-sm bg-teal-600 text-white rounded hover:bg-teal-700 disabled:opacity-50">
                  {quickPaySaving ? '處理中…' : '確認收款'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==================== MODAL: RENT FILING ==================== */}
      {showRentFilingModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowRentFilingModal(false)}>
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="p-6">
              <h3 className="text-lg font-bold text-gray-800 mb-4">{editingRentFiling ? '編輯申報列' : '新增申報列'}（{rentFilingYear} 年）</h3>
              <div className="space-y-3 text-sm">
                <div>
                  <label htmlFor="f-33" className="text-gray-600">物業 *</label>
                  <select id="f-33" value={rentFilingForm.propertyId} disabled={!!editingRentFiling}
                    onChange={(e) => setRentFilingForm((f) => ({ ...f, propertyId: e.target.value, contractId: '' }))}
                    className="w-full border rounded px-3 py-2 mt-1">
                    <option value="">選擇物業</option>
                    {properties.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}{p.address ? ` · ${p.address}` : ''}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="f-98" className="text-gray-600">綁定租約（同址多公司時建議指定）</label>
                  <select id="f-98" value={rentFilingForm.contractId} onChange={(e) => setRentFilingForm((f) => ({ ...f, contractId: e.target.value }))}
                    className="w-full border rounded px-3 py-2 mt-1">
                    <option value="">不指定（合計該物業全部實收）</option>
                    {contracts.filter((c) => !rentFilingForm.propertyId || String(c.propertyId) === rentFilingForm.propertyId).map((c) => (
                      <option key={c.id} value={c.id}>{c.contractNo} · {getTenantDisplayName(c.tenant)}{c.monthlyRent != null ? ` · NT$${fmt(c.monthlyRent)}` : ''}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="f-99" className="text-gray-600">承租人／公司抬頭（手動註記）</label>
                  <input id="f-99" type="text" value={rentFilingForm.lesseeDisplayName} onChange={(e) => setRentFilingForm((f) => ({ ...f, lesseeDisplayName: e.target.value }))}
                    className="w-full border rounded px-3 py-2 mt-1" placeholder="例：OO股份有限公司" />
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={rentFilingForm.isPublicInterest} onChange={(e) => setRentFilingForm((f) => ({ ...f, isPublicInterest: e.target.checked }))} />
                  <span>公益出租人（房屋稅／申報類型註記）</span>
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="f-34" className="text-gray-600">申報月租</label>
                    <input id="f-34" type="number" min="0" value={rentFilingForm.declaredMonthlyRent} onChange={(e) => setRentFilingForm((f) => ({ ...f, declaredMonthlyRent: e.target.value }))}
                      className="w-full border rounded px-3 py-2 mt-1 text-right" />
                  </div>
                  <div>
                    <label htmlFor="f-35" className="text-gray-600">申報月數</label>
                    <input id="f-35" type="number" min="1" max="12" value={rentFilingForm.monthsInScope} onChange={(e) => setRentFilingForm((f) => ({ ...f, monthsInScope: e.target.value }))}
                      className="w-full border rounded px-3 py-2 mt-1 text-right" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label htmlFor="f-36" className="text-gray-600">全年申報金額</label>
                      <div className="flex items-center gap-1.5">
                        {editingRentFiling?.actualAnnualIncome > 0 && (
                          <span className="text-xs text-indigo-600">
                            系統實收 ${Number(editingRentFiling.actualAnnualIncome).toLocaleString('zh-TW')}
                          </span>
                        )}
                        {editingRentFiling?.actualAnnualIncome > 0 && (
                          <button type="button"
                            onClick={() => setRentFilingForm((f) => ({ ...f, declaredAnnualIncome: String(editingRentFiling.actualAnnualIncome) }))}
                            className="text-xs px-1.5 py-0.5 border border-indigo-300 text-indigo-600 rounded hover:bg-indigo-50">
                            帶入
                          </button>
                        )}
                        {rentFilingForm.declaredMonthlyRent && rentFilingForm.monthsInScope && (
                          <button type="button"
                            onClick={() => setRentFilingForm((f) => ({ ...f, declaredAnnualIncome: String(Math.round(Number(f.declaredMonthlyRent) * Number(f.monthsInScope))) }))}
                            className="text-xs px-1.5 py-0.5 border border-gray-300 text-gray-600 rounded hover:bg-gray-50">
                            月租×月數
                          </button>
                        )}
                      </div>
                    </div>
                    <input id="f-36" type="number" min="0" value={rentFilingForm.declaredAnnualIncome} onChange={(e) => setRentFilingForm((f) => ({ ...f, declaredAnnualIncome: e.target.value }))}
                      className="w-full border rounded px-3 py-2 text-right" />
                  </div>
                  <div>
                    <label htmlFor="f-37" className="text-gray-600">預估房屋稅</label>
                    <input id="f-37" type="number" min="0" value={rentFilingForm.estimatedHouseTax} onChange={(e) => setRentFilingForm((f) => ({ ...f, estimatedHouseTax: e.target.value }))}
                      className="w-full border rounded px-3 py-2 mt-1 text-right" placeholder="公益與一般稅率不同" />
                  </div>
                </div>
                <div>
                  <label htmlFor="f-38" className="text-gray-600">狀態</label>
                  <select id="f-38" value={rentFilingForm.status} onChange={(e) => setRentFilingForm((f) => ({ ...f, status: e.target.value }))}
                    className="w-full border rounded px-3 py-2 mt-1">
                    <option value="draft">草稿</option>
                    <option value="filed">已報稅</option>
                    <option value="confirmed">已定稿</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="f-39" className="text-gray-600">備註</label>
                  <textarea id="f-39" value={rentFilingForm.note} onChange={(e) => setRentFilingForm((f) => ({ ...f, note: e.target.value }))} rows={2} className="w-full border rounded px-3 py-2 mt-1" />
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-6">
                <button type="button" onClick={() => setShowRentFilingModal(false)} className="px-4 py-2 text-sm bg-gray-200 rounded hover:bg-gray-300">取消</button>
                <button type="button" onClick={() => saveRentFilingFromModal()} disabled={rentFilingSaving} className="px-4 py-2 text-sm bg-teal-600 text-white rounded hover:bg-teal-700 disabled:opacity-50">{rentFilingSaving ? '儲存中…' : '儲存'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==================== MODAL: PROPERTY ==================== */}
      {showPropertyModal && (
        <PropertyModal
          mode="rentals"
          open={showPropertyModal}
          onClose={() => setShowPropertyModal(false)}
          form={propertyForm}
          setForm={setPropertyForm}
          editingProperty={editingProperty}
          accounts={accounts}
          saving={propertySaving}
          onSave={saveProperty}
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
      {/* ==================== MODAL: CONTRACT ==================== */}
      {showContractModal && (
        <ContractModal
          editingContract={editingContract}
          contractForm={contractForm} setContractForm={setContractForm}
          contractSaving={contractSaving}
          saveContract={saveContract}
          onClose={() => { setShowContractModal(false); setRenewingFromContract(null); }}
          renewingFromContract={renewingFromContract}
          properties={properties}
          tenants={tenants}
          accounts={accounts}
          accountingSubjects={accountingSubjects}
        />
      )}
      {/* ==================== MODAL: TAX ==================== */}
      {showTaxModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => { setShowTaxModal(false); setEditingTax(null); }}>
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
            <div className="p-6">
              <h3 className="text-lg font-bold text-gray-800 mb-4">{editingTax ? '編輯稅款' : '新增稅款'}</h3>
              <div className="space-y-3">
                <div>
                  <label htmlFor="f-52" className="text-sm text-gray-600">物業 *</label>
                  <select id="f-52" value={taxForm.propertyId} onChange={e => setTaxForm(f => ({ ...f, propertyId: e.target.value }))}
                    className="w-full border rounded px-3 py-2 text-sm" disabled={!!editingTax}>
                    <option value="">選擇物業</option>
                    {properties.map(p => {
                      const flags = [];
                      if (p.asset?.hasHouseTax) flags.push('房屋稅');
                      if (p.asset?.hasLandTax) flags.push('地價稅');
                      const suffix = flags.length > 0 ? ` [${flags.join('·')}]` : '';
                      return <option key={p.id} value={p.id}>{p.name}{suffix}</option>;
                    })}
                  </select>
                </div>
                <div>
                  <label htmlFor="f-88" className="text-sm text-gray-600">年度 *</label>
                  <input id="f-88" type="number" value={taxForm.taxYear} onChange={e => setTaxForm(f => ({ ...f, taxYear: e.target.value }))}
                    className="w-full border rounded px-3 py-2 text-sm" disabled={!!editingTax} />
                </div>
                <div>
                  <label htmlFor="f-89" className="text-sm text-gray-600">稅種 *</label>
                  <select id="f-89" value={taxForm.taxType} onChange={e => setTaxForm(f => ({ ...f, taxType: e.target.value }))}
                    className="w-full border rounded px-3 py-2 text-sm" disabled={editingTax?.status === 'paid'}>
                    <option value="房屋稅">房屋稅</option>
                    <option value="地價稅">地價稅</option>
                    <option value="土地增值稅">土地增值稅</option>
                    <option value="其他">其他</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="f-53" className="text-sm text-gray-600">應繳到期日 *</label>
                  <input id="f-53" type="date" value={taxForm.dueDate} onChange={e => setTaxForm(f => ({ ...f, dueDate: e.target.value }))}
                    className="w-full border rounded px-3 py-2 text-sm" disabled={editingTax?.status === 'paid'} />
                </div>
                <div>
                  <label htmlFor="f-54" className="text-sm text-gray-600">金額 *</label>
                  <input id="f-54" type="number" value={taxForm.amount} onChange={e => setTaxForm(f => ({ ...f, amount: e.target.value }))}
                    className="w-full border rounded px-3 py-2 text-sm" disabled={editingTax?.status === 'paid'} />
                </div>
                <div className="border-t pt-3">
                  <p className="text-xs text-gray-500 mb-2">繳款憑證（已繳後填寫，供對帳用）</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label htmlFor="f-55" className="text-xs text-gray-600">實際繳款日</label>
                      <input id="f-55" type="date" value={taxForm.paidDate} onChange={e => setTaxForm(f => ({ ...f, paidDate: e.target.value }))}
                        className="w-full border rounded px-2 py-1.5 text-sm mt-1" />
                    </div>
                    <div>
                      <label htmlFor="f-56" className="text-xs text-gray-600">繳款憑證號</label>
                      <input id="f-56" type="text" value={taxForm.certNo} onChange={e => setTaxForm(f => ({ ...f, certNo: e.target.value }))}
                        placeholder="e.g. 2026050100001" className="w-full border rounded px-2 py-1.5 text-sm mt-1" />
                    </div>
                  </div>
                </div>
                <div>
                  <label htmlFor="f-57" className="text-sm text-gray-600">備註</label>
                  <textarea id="f-57" value={taxForm.note} onChange={e => setTaxForm(f => ({ ...f, note: e.target.value }))}
                    rows={2} placeholder="繳款方式、代繳機構…" className="w-full border rounded px-3 py-2 text-sm mt-1" />
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-6">
                <button onClick={() => { setShowTaxModal(false); setEditingTax(null); }} className="px-4 py-2 text-sm bg-gray-200 rounded hover:bg-gray-300">取消</button>
                <button onClick={saveTax} disabled={taxSaving} className="px-4 py-2 text-sm bg-teal-600 text-white rounded hover:bg-teal-700 disabled:opacity-50">{taxSaving ? '儲存中…' : '儲存'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==================== MODAL: MAINTENANCE ==================== */}
      {showMaintenanceModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => { setShowMaintenanceModal(false); setEditingMaintenance(null); }}>
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
            <div className="p-6">
              <h3 className="text-lg font-bold text-gray-800 mb-4">{editingMaintenance ? '編輯維護紀錄' : '新增維護紀錄'}</h3>
              <div className="space-y-3">
                <div>
                  <label htmlFor="f-58" className="text-sm text-gray-600">物業 *</label>
                  <select id="f-58" value={maintenanceForm.propertyId} onChange={e => setMaintenanceForm(f => ({ ...f, propertyId: e.target.value }))}
                    className="w-full border rounded px-3 py-2 text-sm" disabled={!!editingMaintenance}>
                    <option value="">選擇物業</option>
                    {properties.map(p => {
                      const suffix = p.asset?.hasMaintenanceFee ? ' [維護費]' : '';
                      return <option key={p.id} value={p.id}>{p.name}{suffix}</option>;
                    })}
                  </select>
                  {maintenanceForm.propertyId && !editingMaintenance && (() => {
                    const p = properties.find(x => String(x.id) === String(maintenanceForm.propertyId));
                    if (p?.asset && !p.asset.hasMaintenanceFee) {
                      return <p className="text-xs text-amber-600 mt-1">⚠ 此物業資產主檔未標記「有維修費」，請確認</p>;
                    }
                    return null;
                  })()}
                </div>
                <div>
                  <label htmlFor="f-90" className="text-sm text-gray-600">日期 *</label>
                  <input id="f-90" type="date" value={maintenanceForm.maintenanceDate} onChange={e => setMaintenanceForm(f => ({ ...f, maintenanceDate: e.target.value }))}
                    className="w-full border rounded px-3 py-2 text-sm" />
                </div>
                <div>
                  <label htmlFor="f-59" className="text-sm text-gray-600">類別 *</label>
                  <select id="f-59" value={maintenanceForm.category} onChange={e => setMaintenanceForm(f => ({ ...f, category: e.target.value }))}
                    className="w-full border rounded px-3 py-2 text-sm">
                    {MAINTENANCE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="f-91" className="text-sm text-gray-600">金額 *</label>
                  <input id="f-91" type="number" value={maintenanceForm.amount} onChange={e => setMaintenanceForm(f => ({ ...f, amount: e.target.value }))}
                    className="w-full border rounded px-3 py-2 text-sm" />
                </div>
                <div>
                  <label htmlFor="f-92" className="text-sm text-gray-600">會計科目 *</label>
                  <select id="f-92" value={maintenanceForm.accountingSubjectId} onChange={e => setMaintenanceForm(f => ({ ...f, accountingSubjectId: e.target.value }))}
                    className="w-full border rounded px-3 py-2 text-sm">
                    <option value="">請選擇會計科目</option>
                    {accountingSubjects.map(s => <option key={s.id} value={s.id}>{s.code} - {s.name}</option>)}
                  </select>
                </div>
                {!editingMaintenance && (
                  <div>
                    <label htmlFor="f-93" className="text-sm text-gray-600">支出戶頭 *</label>
                    <select id="f-93" value={maintenanceForm.accountId} onChange={e => setMaintenanceForm(f => ({ ...f, accountId: e.target.value }))}
                      className="w-full border rounded px-3 py-2 text-sm">
                      <option value="">請選擇（存檔後同步至出納待出納）</option>
                      {accounts.map(a => <option key={a.id} value={a.id}>{a.name}{a.warehouse ? ` (${a.warehouse})` : ''}</option>)}
                    </select>
                  </div>
                )}
                {/* 員工代墊款 */}
                <div className="border-t pt-3 mt-2">
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={maintenanceForm.isEmployeeAdvance}
                      onChange={e => setMaintenanceForm(f => ({ ...f, isEmployeeAdvance: e.target.checked, advancedBy: e.target.checked ? f.advancedBy : '', advancePaymentMethod: '現金' }))} />
                    <span className="font-medium text-gray-700">員工代墊款</span>
                  </label>
                  {maintenanceForm.isEmployeeAdvance && (
                    <div className="grid grid-cols-2 gap-2 mt-2">
                      <div>
                        <label htmlFor="f-94" className="text-xs text-gray-500">代墊員工 *</label>
                        <input id="f-94" value={maintenanceForm.advancedBy} onChange={e => setMaintenanceForm(f => ({ ...f, advancedBy: e.target.value }))}
                          placeholder="員工姓名" className="w-full border rounded px-3 py-1.5 text-sm" />
                      </div>
                      <div>
                        <label htmlFor="f-60" className="text-xs text-gray-500">代墊方式</label>
                        <select id="f-60" value={maintenanceForm.advancePaymentMethod} onChange={e => setMaintenanceForm(f => ({ ...f, advancePaymentMethod: e.target.value }))}
                          className="w-full border rounded px-3 py-1.5 text-sm">
                          <option value="現金">現金</option>
                          <option value="信用卡">信用卡</option>
                          <option value="其他">其他</option>
                        </select>
                      </div>
                    </div>
                  )}
                </div>
                {/* 費用性質 */}
                <div className="border-t pt-3 mt-2">
                  <p className="text-xs text-gray-500 mb-2">費用性質（影響年度費用分析）</p>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <input type="checkbox" checked={maintenanceForm.isCapitalized}
                        onChange={e => setMaintenanceForm(f => ({ ...f, isCapitalized: e.target.checked }))} />
                      <span className="text-gray-700">資本化支出</span>
                      <span className="text-xs text-gray-400">（設備改良、工程等）</span>
                    </label>
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <input type="checkbox" checked={maintenanceForm.isRecurring}
                        onChange={e => setMaintenanceForm(f => ({ ...f, isRecurring: e.target.checked }))} />
                      <span className="text-gray-700">例行性費用</span>
                      <span className="text-xs text-gray-400">（電梯年檢、定期保養）</span>
                    </label>
                  </div>
                </div>
                <div>
                  <label htmlFor="f-61" className="text-sm text-gray-600">備註</label>
                  <textarea id="f-61" value={maintenanceForm.note} onChange={e => setMaintenanceForm(f => ({ ...f, note: e.target.value }))}
                    className="w-full border rounded px-3 py-2 text-sm" rows={2} />
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-6">
                <button onClick={() => { setShowMaintenanceModal(false); setEditingMaintenance(null); }} className="px-4 py-2 text-sm bg-gray-200 rounded hover:bg-gray-300">取消</button>
                <button onClick={saveMaintenance} disabled={maintenanceSaving} className="px-4 py-2 text-sm bg-teal-600 text-white rounded hover:bg-teal-700 disabled:opacity-50">{maintenanceSaving ? '儲存中…' : '儲存'}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
