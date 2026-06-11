'use client';

import { useState, useEffect, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useToast } from '@/context/ToastContext';
import { useConfirm } from '@/context/ConfirmContext';
import { todayStr } from '@/lib/localDate';
import { useRentalSummary }     from './useRentalSummary';
import { useRentalProperties }  from './useRentalProperties';
import { useRentalTenants }     from './useRentalTenants';
import { useRentalContracts }   from './useRentalContracts';
import { useRentalIncomes }     from './useRentalIncomes';
import { useRentalTaxes }       from './useRentalTaxes';
import { useRentalMaintenance } from './useRentalMaintenance';
import { useRentalUtility }     from './useRentalUtility';
import { useRentalAnalytics }   from './useRentalAnalytics';

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

export { TABS, VALID_ANALYTICS_SUB };

export function useRentalsPage() {
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

  // ── hooks ──────────────────────────────────────────────────────
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

  // ── computed ───────────────────────────────────────────────────
  const expiringContractCount = (summary?.expiringContractDetails || [])
    .filter(c => c.daysUntilExpiry <= 30).length;

  // ── cross-hook wrappers ────────────────────────────────────────
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

  // ── shared fetch ───────────────────────────────────────────────
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

  // ── tab navigation ─────────────────────────────────────────────
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

  // ── effects ────────────────────────────────────────────────────
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

  return {
    // nav/ui
    activeTab, analyticsSub, loading,
    switchTab, switchAnalyticsSub,
    expiringContractCount,
    // shared
    accounts, accountingSubjects,
    showToast, confirm,
    // summary
    summary, summaryError, summaryLoading, summaryLastFetched, fetchSummary,
    // properties
    properties, setProperties, propertiesError,
    propInlineEdit, setPropInlineEdit, propInlineSaving,
    CONTRACT_INCOME_CATEGORIES, reportCategoryOptions,
    showPropertyModal, setShowPropertyModal,
    editingProperty, setEditingProperty,
    propertyForm, setPropertyForm, propertySaving,
    fetchProperties, savePropField, openPropertyModal, saveProperty,
    // tenants
    tenants, tenantsError,
    tenantSearch, setTenantSearch,
    tenantSortKey, tenantSortDir, tenantToggleSort,
    showTenantModal, setShowTenantModal,
    editingTenant,
    contractPropertyChanges, setContractPropertyChanges,
    tenantForm, setTenantForm, tenantSaving,
    initContractErrors, setInitContractErrors,
    terminateModal, setTerminateModal,
    fetchTenants, openTenantModal, saveTenant, deleteTenant, terminateContract,
    // contracts
    contracts, contractsError,
    contractFilter, setContractFilter,
    contractSortKey, contractSortDir, contractToggleSort,
    showContractModal, setShowContractModal,
    editingContract,
    renewingFromContract, setRenewingFromContract,
    contractForm, setContractForm, contractSaving,
    reminderOpen, setReminderOpen,
    reminderThreshold, setReminderThreshold,
    contractMap, getRenewalDepth,
    fetchContracts, openContractModal, openRenewalModal, saveContract,
    moveContract, deleteContract, handleDepositAction, printContracts,
    markReminderSent, clearReminder,
    // incomes
    incomes, incomesError,
    incomesHasMore, cashierUtilityMap,
    rentIncKey, rentIncDir, rentIncToggle,
    incomeFilter, setIncomeFilter, sortedIncomes,
    payingIncomeId, setPayingIncomeId,
    incomeFormMode, incomePayForm, setIncomePayForm,
    incomeUtilityForm, setIncomeUtilityForm,
    incomePaymentSaving,
    editingPaymentId, setEditingPaymentId,
    editingPaymentForm, setEditingPaymentForm, editingPaymentSaving,
    selectedIncomeIds, setSelectedIncomeIds,
    showBatchPay, setShowBatchPay,
    batchPayForm, setBatchPayForm,
    batchSaving, batchProgress, batchAbortRef, batchLockSaving,
    paymentSortKey, paymentSortDir, paymentToggleSort,
    paymentRecords, paymentRecordsPagination,
    paymentFilter, setPaymentFilter, paymentLoading,
    fetchIncomes, fetchPaymentRecords,
    openIncomePayment, confirmIncomePayment, voidIncomePayment,
    exportIncomeCSV, generateMonthlyIncome, printIncomes,
    openPaymentEdit, savePaymentEdit, deletePaymentRecord, toggleIncomeLock,
    batchConfirmIncomes, batchLockIncomes,
    // taxes
    taxes, taxesError,
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
    // maintenance
    maintenances, maintenancesError,
    maintenancesHasMore, maintenanceFilter, setMaintenanceFilter,
    showMaintenanceModal, setShowMaintenanceModal,
    maintenanceForm, setMaintenanceForm,
    editingMaintenance, setEditingMaintenance,
    maintenanceSaving, maintenanceAnalysis,
    fetchMaintenances, saveMaintenance, deleteMaintenance,
    // utility
    utilityFilter, setUtilityFilter,
    utilityList, utilityError,
    showUtilityModal, setShowUtilityModal,
    utilityForm, setUtilityForm,
    editingUtility, setEditingUtility,
    utilitySaving,
    showBulkUtility, setShowBulkUtility,
    bulkUtilityYear, setBulkUtilityYear,
    bulkUtilityMonth, setBulkUtilityMonth,
    bulkUtilityEntries, setBulkUtilityEntries,
    bulkUtilitySaving,
    fetchUtilityList, saveUtility, deleteUtility, saveBulkUtility, openBulkUtility,
    // analytics / rent filing
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
    openRentFilingModalForNew, openRentFilingModalForEdit, saveRentFilingFromModal, deleteRentFilingRow,
  };
}
