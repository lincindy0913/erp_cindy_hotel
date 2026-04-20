'use client';

import React, { useState, useEffect, Suspense, useMemo } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import Navigation from '@/components/Navigation';
import { useToast } from '@/context/ToastContext';
import { sortRows, useColumnSort, SortableTh } from '@/components/SortableTh';

const TABS = [
  { key: 'overview', label: '總覽' },
  { key: 'cashier', label: '收租工作台' },
  { key: 'paymentRecords', label: '付款紀錄' },
  { key: 'tenants', label: '租客管理' },
  { key: 'properties', label: '物業管理' },
  { key: 'contracts', label: '合約管理' },
  { key: 'taxes', label: '稅款管理' },
  { key: 'rentFiling', label: '租金申報' },
  { key: 'maintenance', label: '維護費' },
  { key: 'utilityIncome', label: '水電收入' },
  { key: 'analytics', label: '分析報表' }
];

/** 舊網址 ?tab=incomeReport 等 → 導向 ?tab=analytics&sub=… */
const LEGACY_TAB_TO_SUB = {
  incomeReport: 'income',
  operatingReport: 'operating',
  overdueReport: 'overdue',
  depositTracking: 'deposit',
  vacancyReport: 'vacancy',
};
const VALID_ANALYTICS_SUB = ['income', 'operating', 'overdue', 'deposit', 'vacancy'];
const ANALYTICS_SUB_LABELS = [
  { key: 'income', label: '收入分析' },
  { key: 'operating', label: '營運分析' },
  { key: 'overdue', label: '逾期催繳' },
  { key: 'vacancy', label: '空置率' },
  { key: 'deposit', label: '押金追蹤' },
];

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

const PROPERTY_STATUSES = [
  { value: 'available', label: '空置', color: 'bg-green-100 text-green-800' },
  { value: 'rented', label: '已出租', color: 'bg-blue-100 text-blue-800' },
  { value: 'maintenance', label: '維護中', color: 'bg-yellow-100 text-yellow-800' }
];

const CONTRACT_STATUSES = [
  { value: 'pending', label: '待審核', color: 'bg-gray-100 text-gray-800' },
  { value: 'active', label: '生效中', color: 'bg-green-100 text-green-800' },
  { value: 'expired', label: '已到期', color: 'bg-yellow-100 text-yellow-800' },
  { value: 'terminated', label: '已終止', color: 'bg-red-100 text-red-800' }
];

const INCOME_STATUSES = [
  { value: 'pending', label: '待收', color: 'bg-yellow-100 text-yellow-800' },
  { value: 'completed', label: '已收', color: 'bg-green-100 text-green-800' },
  { value: 'partial', label: '部分收', color: 'bg-orange-100 text-orange-800' },
  { value: 'overdue', label: '逾期', color: 'bg-red-100 text-red-800' }
];

const MAINTENANCE_CATEGORIES = ['水電', '管線', '油漆', '設備', '清潔', '結構', '其他'];

const PAYMENT_METHODS = ['現金', 'transfer', '支票', '匯款'];

/** 報表「未填類別」篩選值，需與 API category 參數一致 */
const REPORT_CAT_EMPTY = '__RENTAL_CAT_EMPTY__';

function StatusBadge({ value, list }) {
  const item = list.find(s => s.value === value);
  if (!item) return <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-600">{value}</span>;
  return <span className={`text-xs px-2 py-0.5 rounded ${item.color}`}>{item.label}</span>;
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
  const tabParam = searchParams.get('tab') || 'overview';
  const [activeTab, setActiveTab] = useState(() => resolveRentalsMainTab(tabParam));
  const [analyticsSub, setAnalyticsSub] = useState(() => resolveRentalsAnalyticsSub(tabParam, searchParams));

  // Shared data
  const [summary, setSummary] = useState(null);
  const [tenants, setTenants] = useState([]);
  const [properties, setProperties] = useState([]);
  const [contracts, setContracts] = useState([]);
  const [incomes, setIncomes] = useState([]);
  const { sortKey: rentIncKey, sortDir: rentIncDir, toggleSort: rentIncToggle } = useColumnSort('dueDate', 'desc');
  const sortedIncomes = useMemo(
    () =>
      sortRows(incomes, rentIncKey, rentIncDir, {
        propertyName: (i) => i.propertyName || '',
        tenantName: (i) => i.tenantName || '',
        expectedAmount: (i) => Number(i.expectedAmount || 0),
        actualAmount: (i) => Number(i.actualAmount || 0),
        remaining: (i) => Number(i.expectedAmount || 0) - Number(i.actualAmount || 0),
        dueDate: (i) => i.dueDate || '',
        status: (i) => (i.status === 'pending' && i.dueDate < new Date().toISOString().split('T')[0] ? 'overdue' : i.status || ''),
        payCount: (i) => (i.payments?.length || (i.actualAmount != null && i.actualAmount > 0 ? 1 : 0)),
      }),
    [incomes, rentIncKey, rentIncDir]
  );
  const reportCategoryOptions = useMemo(() => {
    const map = new Map();
    properties.forEach((p) => {
      const raw = p.unitNo;
      const isEmpty = raw == null || String(raw).trim() === '';
      const value = isEmpty ? REPORT_CAT_EMPTY : String(raw).trim();
      if (!map.has(value)) map.set(value, isEmpty ? '未填類別' : String(raw).trim());
    });
    return Array.from(map.entries())
      .sort((a, b) => {
        if (a[0] === REPORT_CAT_EMPTY) return 1;
        if (b[0] === REPORT_CAT_EMPTY) return -1;
        return (a[1] || '').localeCompare(b[1] || '', 'zh-Hant');
      })
      .map(([value, label]) => ({ value, label }));
  }, [properties]);
  const [taxes, setTaxes] = useState([]);
  const [maintenances, setMaintenances] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [accountingSubjects, setAccountingSubjects] = useState([]);
  const [loading, setLoading] = useState(true);

  const maintenanceAnalysis = useMemo(() => {
    const byCategory = {};
    const byProperty = {};
    let total = 0; let paid = 0; let pending = 0;
    maintenances.forEach(m => {
      const amt = Number(m.amount || 0);
      total += amt;
      if (m.status === 'paid') paid += amt; else pending += amt;
      byCategory[m.category] = (byCategory[m.category] || 0) + amt;
      const pname = m.property?.name || `物業#${m.propertyId}`;
      byProperty[pname] = (byProperty[pname] || 0) + amt;
    });
    const catEntries = Object.entries(byCategory).sort((a, b) => b[1] - a[1]);
    const propEntries = Object.entries(byProperty).sort((a, b) => b[1] - a[1]);
    return { total, paid, pending, catEntries, propEntries };
  }, [maintenances]);

  // Search / filter states
  const [tenantSearch, setTenantSearch] = useState('');
  const [propertyFilter, setPropertyFilter] = useState({ buildingName: '', status: '' });
  const [propertySort, setPropertySort] = useState({ key: '', dir: 'asc' });
  const [contractFilter, setContractFilter] = useState({ status: '', propertyId: '' });
  const [incomeFilter, setIncomeFilter] = useState({
    year: new Date().getFullYear(),
    month: new Date().getMonth() + 1,
    status: ''
  });
  const [taxFilter, setTaxFilter] = useState({ taxYear: new Date().getFullYear(), status: '' });
  const [taxView, setTaxView] = useState('list'); // 'list' | 'calendar'
  const [maintenanceFilter, setMaintenanceFilter] = useState({ category: '', status: '' });

  // Modal states
  const [showTenantModal, setShowTenantModal] = useState(false);
  const [editingTenant, setEditingTenant] = useState(null);
  const [tenantForm, setTenantForm] = useState({ tenantType: 'individual', fullName: '', companyName: '', phone: '', email: '', address: '', note: '' });

  const [showPropertyModal, setShowPropertyModal] = useState(false);
  const [editingProperty, setEditingProperty] = useState(null);
  const [propertyForm, setPropertyForm] = useState({ name: '', address: '', buildingName: '', unitNo: '', ownerName: '', houseTaxRegistrationNo: '', status: 'available', rentCollectAccountId: '', depositAccountId: '', note: '', collectUtilityFee: false, publicInterestLandlord: false, publicInterestApplicant: '', publicInterestNote: '', publicInterestStartDate: '', publicInterestEndDate: '' });

  const [showContractModal, setShowContractModal] = useState(false);
  const [editingContract, setEditingContract] = useState(null);
  const [renewingFromContract, setRenewingFromContract] = useState(null);
  const [contractForm, setContractForm] = useState({
    propertyId: '', tenantId: '', startDate: '', endDate: '',
    monthlyRent: '', paymentDueDay: '5', depositAmount: '', depositAccountId: '',
    rentAccountId: '', accountingSubjectId: '', status: 'pending', autoRenew: false,
    specialTerms: '', note: '', previousContractId: ''
  });

  const [showTaxModal, setShowTaxModal] = useState(false);
  const [editingTax, setEditingTax] = useState(null);
  const [taxForm, setTaxForm] = useState({ propertyId: '', taxYear: new Date().getFullYear(), taxType: '房屋稅', dueDate: '', amount: '', certNo: '', paidDate: '', note: '' });

  const [showMaintenanceModal, setShowMaintenanceModal] = useState(false);
  const [maintenanceForm, setMaintenanceForm] = useState({ propertyId: '', maintenanceDate: new Date().toISOString().split('T')[0], category: '水電', amount: '', accountingSubjectId: '', accountId: '', isEmployeeAdvance: false, advancedBy: '', advancePaymentMethod: '現金', isCapitalized: false, isRecurring: false, note: '' });
  const [editingMaintenance, setEditingMaintenance] = useState(null);

  // Inline payment forms
  const [payingIncomeId, setPayingIncomeId] = useState(null);
  const [incomeFormMode, setIncomeFormMode] = useState('confirm'); // 'confirm' | 'edit'
  const [incomePayForm, setIncomePayForm] = useState({ actualAmount: '', actualDate: new Date().toISOString().split('T')[0], accountId: '', paymentMethod: '現金', matchTransferRef: '', matchBankAccountName: '', matchNote: '' });

  const [payingTaxId, setPayingTaxId] = useState(null);
  const [taxPayForm, setTaxPayForm] = useState({ accountId: '', paymentDate: new Date().toISOString().split('T')[0] });

  const [reportYear, setReportYear] = useState(new Date().getFullYear());
  const [reportStartDate, setReportStartDate] = useState('');
  const [reportEndDate, setReportEndDate] = useState('');
  const [reportCategoryFilter, setReportCategoryFilter] = useState('');
  const [incomeReportData, setIncomeReportData] = useState({ year: null, rows: [] });
  const [operatingReportData, setOperatingReportData] = useState({ year: null, rows: [] });
  const [reportLoading, setReportLoading] = useState(false);

  const [rentFilingYear, setRentFilingYear] = useState(new Date().getFullYear());
  const [rentFilingData, setRentFilingData] = useState({ rows: [], totals: { declaredAnnual: 0, actualAnnual: 0, estimatedHouseTax: 0 } });
  const [rentFilingLoading, setRentFilingLoading] = useState(false);
  const [showRentFilingModal, setShowRentFilingModal] = useState(false);
  const [editingRentFiling, setEditingRentFiling] = useState(null);
  const [rentFilingForm, setRentFilingForm] = useState({
    propertyId: '', contractId: '', slotIndex: 0,
    isPublicInterest: false, lesseeDisplayName: '',
    declaredMonthlyRent: '', monthsInScope: '12', declaredAnnualIncome: '', estimatedHouseTax: '',
    status: 'draft', note: '',
  });
  const [rentFilingSaving, setRentFilingSaving] = useState(false);

  const [taxTableYear, setTaxTableYear] = useState(new Date().getFullYear());
  const [taxTableRows, setTaxTableRows] = useState([]);
  const [taxTableSaving, setTaxTableSaving] = useState(false);
  const [tenantSaving, setTenantSaving] = useState(false);
  const [propertySaving, setPropertySaving] = useState(false);
  const [contractSaving, setContractSaving] = useState(false);
  const [taxSaving, setTaxSaving] = useState(false);
  const [maintenanceSaving, setMaintenanceSaving] = useState(false);
  const [utilitySaving, setUtilitySaving] = useState(false);
  const [cashierUtilityMap, setCashierUtilityMap] = useState({});
  const [incomeUtilityForm, setIncomeUtilityForm] = useState({ expectedAmount: '', actualAmount: '' });
  const [paymentRecords, setPaymentRecords] = useState([]);
  const [paymentRecordsPagination, setPaymentRecordsPagination] = useState({ page: 1, totalCount: 0, totalPages: 1 });
  const [paymentFilter, setPaymentFilter] = useState({ year: new Date().getFullYear(), month: '', propertyId: '', accountId: '', paymentMethod: '' });
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [incomePaymentSaving, setIncomePaymentSaving] = useState(false);

  // Overdue report
  const [overdueReportData, setOverdueReportData] = useState([]);
  const [overdueReportLoading, setOverdueReportLoading] = useState(false);

  // Confirm dialog (replaces window.confirm)
  const [confirmDialog, setConfirmDialog] = useState({ open: false, title: '', message: '', onConfirm: null, danger: true });

  // Per-payment editing
  const [editingPaymentId, setEditingPaymentId] = useState(null);
  const [editingPaymentForm, setEditingPaymentForm] = useState({ amount: '', paymentDate: '', accountId: '', paymentMethod: '', matchTransferRef: '', matchBankAccountName: '', matchNote: '' });
  const [editingPaymentSaving, setEditingPaymentSaving] = useState(false);

  // Deposit tracking
  const [depositFilter, setDepositFilter] = useState('all');

  // Vacancy report
  const [vacancyYear, setVacancyYear] = useState(new Date().getFullYear());
  const [vacancyData, setVacancyData] = useState({ rows: [], avgVacancy: 0, fullyRented: 0 });
  const [vacancyLoading, setVacancyLoading] = useState(false);

  // Contract reminders (localStorage-based)
  const [reminderOpen, setReminderOpen] = useState(false);
  const [reminderThreshold, setReminderThreshold] = useState(60);
  const [reminderSentDates, setReminderSentDates] = useState({});

  // Batch cashier operations
  const [selectedIncomeIds, setSelectedIncomeIds] = useState(new Set());
  const [showBatchPay, setShowBatchPay] = useState(false);
  const [batchPayForm, setBatchPayForm] = useState({ actualDate: new Date().toISOString().split('T')[0], accountId: '', paymentMethod: '匯款' });
  const [batchSaving, setBatchSaving] = useState(false);

  // Bulk utility input
  const [showBulkUtility, setShowBulkUtility] = useState(false);
  const [bulkUtilityYear, setBulkUtilityYear] = useState(new Date().getFullYear());
  const [bulkUtilityMonth, setBulkUtilityMonth] = useState(new Date().getMonth() + 1);
  const [bulkUtilityEntries, setBulkUtilityEntries] = useState([]);
  const [bulkUtilitySaving, setBulkUtilitySaving] = useState(false);

  const [utilityFilter, setUtilityFilter] = useState({ year: new Date().getFullYear(), month: new Date().getMonth() + 1 });
  const [utilityList, setUtilityList] = useState([]);
  const [showUtilityModal, setShowUtilityModal] = useState(false);
  const [utilityForm, setUtilityForm] = useState({ propertyId: '', incomeYear: new Date().getFullYear(), incomeMonth: new Date().getMonth() + 1, expectedAmount: '', actualAmount: '', actualDate: '', accountId: '', note: '' });
  const [editingUtility, setEditingUtility] = useState(null);

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
    if (activeTab === 'cashier') { fetchIncomes(); if (properties.length === 0) fetchProperties(); }
    if (activeTab === 'tenants') fetchTenants();
    if (activeTab === 'properties') fetchProperties();
    if (activeTab === 'contracts') fetchContracts();
    if (activeTab === 'taxes') fetchTaxes();
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
      if (analyticsSub === 'overdue') { fetchOverdueReport(); if (properties.length === 0) fetchProperties(); }
      if (analyticsSub === 'deposit') { fetchContracts(); if (properties.length === 0) fetchProperties(); }
      if (analyticsSub === 'vacancy') fetchVacancyReport();
      if (analyticsSub === 'income') { fetchIncomeReport(); fetchProperties(); }
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
      if (activeTab === 'taxes') fetchTaxes();
      if (activeTab === 'maintenance') fetchMaintenances();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [activeTab]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('rental_contract_reminders');
      if (stored) setReminderSentDates(JSON.parse(stored));
    } catch { /* ignore */ }
  }, []);

  function buildReportParams() {
    const params = new URLSearchParams();
    if (reportStartDate && reportEndDate) {
      if (reportStartDate > reportEndDate) {
        showToast('結束日期不可早於開始日期', 'error');
        return null;
      }
      params.set('startDate', reportStartDate);
      params.set('endDate', reportEndDate);
    } else {
      params.set('year', reportYear);
    }
    if (reportCategoryFilter) params.set('category', reportCategoryFilter);
    return params.toString();
  }

  async function fetchIncomeReport() {
    const qs = buildReportParams();
    if (qs === null) return;
    setReportLoading(true);
    try {
      const res = await fetch(`/api/rentals/reports/income-by-month?${qs}`);
      const data = await res.json();
      if (data.error) throw new Error(data.message || data.error);
      setIncomeReportData({ year: data.year, rows: data.rows || [] });
    } catch (e) {
      setIncomeReportData({ year: reportYear, rows: [] });
    } finally {
      setReportLoading(false);
    }
  }

  async function fetchOperatingReport() {
    const qs = buildReportParams();
    if (qs === null) return;
    setReportLoading(true);
    try {
      const res = await fetch(`/api/rentals/reports/operating?${qs}`);
      const data = await res.json();
      if (data.error) throw new Error(data.message || data.error);
      setOperatingReportData({ year: data.year, rows: data.rows || [] });
    } catch (e) {
      setOperatingReportData({ year: reportYear, rows: [] });
    } finally {
      setReportLoading(false);
    }
  }

  async function fetchRentFiling() {
    setRentFilingLoading(true);
    try {
      const res = await fetch(`/api/rentals/rent-filing?year=${rentFilingYear}`);
      const data = await res.json();
      if (data.error) throw new Error(data.message || data.error);
      setRentFilingData({
        rows: data.rows || [],
        totals: data.totals || { declaredAnnual: 0, actualAnnual: 0, estimatedHouseTax: 0 },
      });
    } catch {
      setRentFilingData({ rows: [], totals: { declaredAnnual: 0, actualAnnual: 0, estimatedHouseTax: 0 } });
    } finally {
      setRentFilingLoading(false);
    }
  }

  async function seedRentFilingYear() {
    setRentFilingLoading(true);
    try {
      const res = await fetch('/api/rentals/rent-filing/seed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year: rentFilingYear }),
      });
      const data = await res.json();
      if (!res.ok) return showToast(data.error || data.message || '建立失敗', 'error');
      showToast(`已建立 ${data.created} 筆草稿，略過 ${data.skipped} 筆已存在`, 'success');
      fetchRentFiling();
    } catch (e) {
      showToast('建立失敗: ' + e.message, 'error');
    } finally {
      setRentFilingLoading(false);
    }
  }

  function openRentFilingModalForNew() {
    setEditingRentFiling(null);
    setRentFilingForm({
      propertyId: properties[0]?.id ? String(properties[0].id) : '',
      contractId: '',
      slotIndex: 0,
      isPublicInterest: false,
      lesseeDisplayName: '',
      declaredMonthlyRent: '', monthsInScope: '12', declaredAnnualIncome: '', estimatedHouseTax: '',
      status: 'draft', note: '',
    });
    setShowRentFilingModal(true);
  }

  function openRentFilingModalForEdit(row) {
    setEditingRentFiling(row);
    setRentFilingForm({
      propertyId: String(row.propertyId),
      contractId: row.contractId != null ? String(row.contractId) : '',
      slotIndex: row.slotIndex,
      isPublicInterest: !!row.isPublicInterest,
      lesseeDisplayName: row.lesseeDisplayName || '',
      declaredMonthlyRent: row.declaredMonthlyRent != null ? String(row.declaredMonthlyRent) : '',
      monthsInScope: row.monthsInScope != null ? String(row.monthsInScope) : '12',
      declaredAnnualIncome: row.declaredAnnualIncome != null ? String(row.declaredAnnualIncome) : '',
      estimatedHouseTax: row.estimatedHouseTax != null ? String(row.estimatedHouseTax) : '',
      status: row.status || 'draft',
      note: row.note || '',
    });
    setShowRentFilingModal(true);
  }

  function nextSlotForProperty(propertyId) {
    const pid = parseInt(propertyId, 10);
    const same = rentFilingData.rows.filter((r) => r.propertyId === pid);
    if (same.length === 0) return 0;
    return Math.max(...same.map((r) => r.slotIndex)) + 1;
  }

  async function saveRentFilingFromModal() {
    if (!rentFilingForm.propertyId) {
      showToast('請選擇物業', 'error');
      return;
    }
    setRentFilingSaving(true);
    try {
      if (editingRentFiling) {
        const res = await fetch(`/api/rentals/rent-filing/${editingRentFiling.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contractId: rentFilingForm.contractId || null,
            isPublicInterest: rentFilingForm.isPublicInterest,
            lesseeDisplayName: rentFilingForm.lesseeDisplayName || null,
            declaredMonthlyRent: rentFilingForm.declaredMonthlyRent,
            monthsInScope: rentFilingForm.monthsInScope,
            declaredAnnualIncome: rentFilingForm.declaredAnnualIncome,
            estimatedHouseTax: rentFilingForm.estimatedHouseTax,
            status: rentFilingForm.status,
            note: rentFilingForm.note,
          }),
        });
        const data = await res.json();
        if (!res.ok) return showToast(data.error || data.message || '儲存失敗', 'error');
        showToast('已儲存', 'success');
      } else {
        const slot = nextSlotForProperty(rentFilingForm.propertyId);
        const res = await fetch('/api/rentals/rent-filing', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            propertyId: parseInt(rentFilingForm.propertyId, 10),
            filingYear: rentFilingYear,
            slotIndex: slot,
            contractId: rentFilingForm.contractId || null,
            isPublicInterest: rentFilingForm.isPublicInterest,
            lesseeDisplayName: rentFilingForm.lesseeDisplayName || null,
            declaredMonthlyRent: rentFilingForm.declaredMonthlyRent,
            monthsInScope: rentFilingForm.monthsInScope,
            declaredAnnualIncome: rentFilingForm.declaredAnnualIncome,
            estimatedHouseTax: rentFilingForm.estimatedHouseTax,
            status: rentFilingForm.status,
            note: rentFilingForm.note,
          }),
        });
        const data = await res.json();
        if (!res.ok) return showToast(data.error || data.message || '建立失敗', 'error');
        showToast('已建立', 'success');
      }
      setShowRentFilingModal(false);
      fetchRentFiling();
    } catch (e) {
      showToast('儲存失敗: ' + e.message, 'error');
    } finally {
      setRentFilingSaving(false);
    }
  }

  function deleteRentFilingRow(row) {
    askConfirm('確定刪除此筆申報列？', async () => {
      try {
        const res = await fetch(`/api/rentals/rent-filing/${row.id}`, { method: 'DELETE' });
        if (!res.ok) {
          const data = await res.json();
          return showToast(data.error || '刪除失敗', 'error');
        }
        fetchRentFiling();
      } catch (e) {
        showToast('刪除失敗: ' + e.message, 'error');
      }
    }, '刪除申報列');
  }

  function switchAnalyticsSub(sub) {
    if (!VALID_ANALYTICS_SUB.includes(sub)) return;
    setAnalyticsSub(sub);
    setActiveTab('analytics');
    router.push(`/rentals?tab=analytics&sub=${sub}`, { scroll: false });
  }

  function switchTab(key) {
    if (key === 'analytics') {
      setActiveTab('analytics');
      router.push(`/rentals?tab=analytics&sub=${analyticsSub}`, { scroll: false });
      return;
    }
    setActiveTab(key);
    router.push(`/rentals?tab=${key}`, { scroll: false });
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
      })()
    ]);
    setLoading(false);
  }

  async function fetchSummary() {
    try {
      const res = await fetch('/api/rentals/summary');
      const data = await res.json();
      if (!data.error) setSummary(data);
    } catch { /* ignore */ }
  }

  async function fetchAccounts() {
    try {
      const res = await fetch('/api/cashflow/accounts');
      const data = await res.json();
      setAccounts(Array.isArray(data) ? data : []);
    } catch { setAccounts([]); }
  }

  async function fetchTenants() {
    try {
      const params = new URLSearchParams();
      if (tenantSearch) params.set('search', tenantSearch);
      const res = await fetch(`/api/rentals/tenants?${params}`);
      const data = await res.json();
      setTenants(Array.isArray(data) ? data : []);
    } catch { setTenants([]); }
  }

  async function fetchProperties() {
    try {
      const params = new URLSearchParams();
      if (propertyFilter.buildingName) params.set('buildingName', propertyFilter.buildingName);
      if (propertyFilter.status) params.set('status', propertyFilter.status);
      const res = await fetch(`/api/rentals/properties?${params}`);
      const data = await res.json();
      setProperties(Array.isArray(data) ? data : []);
    } catch { setProperties([]); }
  }

  async function fetchContracts() {
    try {
      const params = new URLSearchParams();
      if (contractFilter.status) params.set('status', contractFilter.status);
      if (contractFilter.propertyId) params.set('propertyId', contractFilter.propertyId);
      const res = await fetch(`/api/rentals/contracts?${params}`);
      const data = await res.json();
      setContracts(Array.isArray(data) ? data : []);
    } catch { setContracts([]); }
  }

  async function fetchIncomes() {
    try {
      const params = new URLSearchParams();
      if (incomeFilter.year) params.set('year', incomeFilter.year);
      if (incomeFilter.month) params.set('month', incomeFilter.month);
      if (incomeFilter.status) params.set('status', incomeFilter.status);
      const uParams = new URLSearchParams();
      if (incomeFilter.year) uParams.set('year', incomeFilter.year);
      if (incomeFilter.month) uParams.set('month', incomeFilter.month);
      const [incRes, utiRes] = await Promise.all([
        fetch(`/api/rentals/income?${params}`),
        fetch(`/api/rentals/utility-income?${uParams}`)
      ]);
      const incData = await incRes.json();
      setIncomes(Array.isArray(incData) ? incData : []);
      if (utiRes.ok) {
        const utiData = await utiRes.json();
        const map = {};
        (Array.isArray(utiData) ? utiData : []).forEach(u => { map[u.propertyId] = u; });
        setCashierUtilityMap(map);
      }
    } catch { setIncomes([]); }
  }

  async function fetchTaxes() {
    try {
      const params = new URLSearchParams();
      if (taxFilter.taxYear) params.set('taxYear', taxFilter.taxYear);
      if (taxFilter.status) params.set('status', taxFilter.status);
      const res = await fetch(`/api/rentals/taxes?${params}`);
      const data = await res.json();
      setTaxes(Array.isArray(data) ? data : []);
    } catch { setTaxes([]); }
  }

  async function fetchTaxTable() {
    try {
      const res = await fetch(`/api/rentals/taxes/by-year?year=${taxTableYear}`);
      const data = await res.json();
      if (data.rows) setTaxTableRows(data.rows);
      else setTaxTableRows([]);
    } catch { setTaxTableRows([]); }
  }

  async function saveTaxTable() {
    setTaxTableSaving(true);
    try {
      const res = await fetch('/api/rentals/taxes/by-year', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          year: taxTableYear,
          rows: taxTableRows.map(r => ({ propertyId: r.propertyId, landTax: r.landTax, houseTax: r.houseTax }))
        })
      });
      const data = await res.json();
      if (!res.ok) return showToast(data.error || '儲存失敗', 'error');
      showToast('已儲存年度稅額', 'success');
      fetchTaxTable();
      fetchTaxes();
    } catch (e) { showToast('儲存失敗: ' + e.message, 'error'); }
    finally { setTaxTableSaving(false); }
  }

  async function fetchUtilityList() {
    try {
      const params = new URLSearchParams();
      if (utilityFilter.year) params.set('year', utilityFilter.year);
      if (utilityFilter.month) params.set('month', utilityFilter.month);
      const res = await fetch(`/api/rentals/utility-income?${params}`);
      const data = await res.json();
      setUtilityList(Array.isArray(data) ? data : []);
    } catch { setUtilityList([]); }
  }

  async function fetchPaymentRecords(pageNum = 1) {
    setPaymentLoading(true);
    try {
      const params = new URLSearchParams();
      if (paymentFilter.year) params.set('year', paymentFilter.year);
      if (paymentFilter.month) params.set('month', paymentFilter.month);
      if (paymentFilter.propertyId) params.set('propertyId', paymentFilter.propertyId);
      if (paymentFilter.accountId) params.set('accountId', paymentFilter.accountId);
      if (paymentFilter.paymentMethod) params.set('paymentMethod', paymentFilter.paymentMethod);
      params.set('page', pageNum);
      params.set('limit', '100');
      const res = await fetch(`/api/rentals/payments?${params}`);
      const data = await res.json();
      setPaymentRecords(data.data || []);
      setPaymentRecordsPagination(data.pagination || { page: 1, totalCount: 0, totalPages: 1 });
    } catch { setPaymentRecords([]); }
    finally { setPaymentLoading(false); }
  }

  function askConfirm(message, onConfirm, title = '確認操作', danger = true) {
    setConfirmDialog({ open: true, title, message, onConfirm, danger });
  }

  function openPaymentEdit(payment) {
    setEditingPaymentId(payment.id);
    setEditingPaymentForm({
      amount: String(payment.amount),
      paymentDate: payment.paymentDate || '',
      accountId: String(payment.accountId || ''),
      paymentMethod: payment.paymentMethod || '匯款',
      matchTransferRef: payment.matchTransferRef || '',
      matchBankAccountName: payment.matchBankAccountName || '',
      matchNote: payment.matchNote || ''
    });
  }

  async function savePaymentEdit() {
    if (!editingPaymentForm.amount || Number(editingPaymentForm.amount) <= 0) return showToast('請填寫金額', 'error');
    if (!editingPaymentForm.accountId) return showToast('請選擇收款帳戶', 'error');
    setEditingPaymentSaving(true);
    try {
      const res = await fetch(`/api/rentals/payments/${editingPaymentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingPaymentForm)
      });
      const data = await res.json();
      if (!res.ok) return showToast(data.error || '更新失敗', 'error');
      showToast('收款已更新', 'success');
      setEditingPaymentId(null);
      fetchIncomes();
      fetchSummary();
      if (activeTab === 'paymentRecords') fetchPaymentRecords(paymentRecordsPagination.page);
    } catch (e) { showToast('更新失敗: ' + e.message, 'error'); }
    finally { setEditingPaymentSaving(false); }
  }

  async function fetchOverdueReport() {
    setOverdueReportLoading(true);
    try {
      const res = await fetch('/api/rentals/income?status=pending');
      const data = await res.json();
      const today = new Date().toISOString().split('T')[0];
      const overdue = (Array.isArray(data) ? data : [])
        .filter(i => i.dueDate && i.dueDate < today)
        .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
      setOverdueReportData(overdue);
    } catch { setOverdueReportData([]); }
    finally { setOverdueReportLoading(false); }
  }

  async function fetchVacancyReport() {
    setVacancyLoading(true);
    try {
      const res = await fetch(`/api/rentals/reports/vacancy?year=${vacancyYear}`);
      const data = await res.json();
      if (data.error) throw new Error(data.message || data.error);
      setVacancyData({ rows: data.rows || [], avgVacancy: data.avgVacancy || 0, fullyRented: data.fullyRented || 0 });
    } catch { setVacancyData({ rows: [], avgVacancy: 0, fullyRented: 0 }); }
    finally { setVacancyLoading(false); }
  }

  function markReminderSent(contractId) {
    const today = new Date().toISOString().split('T')[0];
    const updated = { ...reminderSentDates, [contractId]: today };
    setReminderSentDates(updated);
    try { localStorage.setItem('rental_contract_reminders', JSON.stringify(updated)); } catch { /* ignore */ }
    showToast('已標記為已提醒', 'success');
  }

  function clearReminder(contractId) {
    const updated = { ...reminderSentDates };
    delete updated[contractId];
    setReminderSentDates(updated);
    try { localStorage.setItem('rental_contract_reminders', JSON.stringify(updated)); } catch { /* ignore */ }
  }

  async function batchConfirmIncomes() {
    if (!batchPayForm.accountId) return showToast('請選擇收款帳戶', 'error');
    const ids = Array.from(selectedIncomeIds);
    if (ids.length === 0) return;
    setBatchSaving(true);
    let success = 0; let failed = 0;
    try {
      for (const id of ids) {
        const income = incomes.find(i => i.id === id);
        if (!income) continue;
        const res = await fetch(`/api/rentals/income/${id}/confirm`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rent: { actualAmount: String(Number(income.expectedAmount) - Number(income.actualAmount || 0)), actualDate: batchPayForm.actualDate, accountId: batchPayForm.accountId, paymentMethod: batchPayForm.paymentMethod, matchTransferRef: '', matchBankAccountName: '', matchNote: '' } })
        });
        if (res.ok) success++; else failed++;
      }
      showToast(`批次確認完成：${success} 筆成功${failed > 0 ? `，${failed} 筆失敗` : ''}`, 'success');
      setSelectedIncomeIds(new Set());
      setShowBatchPay(false);
      fetchIncomes(); fetchSummary();
    } catch (e) { showToast('批次操作失敗: ' + e.message, 'error'); }
    finally { setBatchSaving(false); }
  }

  async function openBulkUtility() {
    // Fetch directly (not from state) so we always have the latest data
    let propList = properties;
    if (propList.length === 0) {
      try {
        const res = await fetch('/api/rentals/properties');
        const data = await res.json();
        propList = Array.isArray(data) ? data : [];
        setProperties(propList);
      } catch { propList = []; }
    }
    const utilProps = propList.filter(p => p.collectUtilityFee);
    const entries = utilProps.map(p => ({ propertyId: p.id, propertyName: p.name, expectedAmount: '' }));
    setBulkUtilityEntries(entries);
    setShowBulkUtility(true);
    // Pre-fill existing records
    try {
      const res = await fetch(`/api/rentals/utility-income?year=${bulkUtilityYear}&month=${bulkUtilityMonth}`);
      const data = await res.json();
      if (Array.isArray(data)) {
        setBulkUtilityEntries(prev => prev.map(e => {
          const existing = data.find(u => u.propertyId === e.propertyId);
          return existing ? { ...e, expectedAmount: String(existing.expectedAmount || '') } : e;
        }));
      }
    } catch { /* ignore */ }
  }

  async function saveBulkUtility() {
    setBulkUtilitySaving(true);
    try {
      const toSave = bulkUtilityEntries.filter(e => e.expectedAmount !== '' && !isNaN(parseFloat(e.expectedAmount)));
      let saved = 0;
      for (const entry of toSave) {
        const res = await fetch('/api/rentals/utility-income', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ propertyId: entry.propertyId, incomeYear: bulkUtilityYear, incomeMonth: bulkUtilityMonth, expectedAmount: entry.expectedAmount })
        });
        if (res.ok) saved++;
      }
      showToast(`已儲存 ${saved} 筆電費應收`, 'success');
      setShowBulkUtility(false);
      fetchUtilityList();
    } catch (e) { showToast('儲存失敗: ' + e.message, 'error'); }
    finally { setBulkUtilitySaving(false); }
  }

  async function saveUtility() {
    try {
      const payload = { ...utilityForm, incomeYear: utilityForm.incomeYear || new Date().getFullYear(), incomeMonth: utilityForm.incomeMonth || new Date().getMonth() + 1 };
      const res = await fetch('/api/rentals/utility-income', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) return showToast(data.error || '儲存失敗', 'error');
      setShowUtilityModal(false);
      fetchUtilityList();
    } catch (e) { showToast('儲存失敗: ' + e.message, 'error'); }
    finally { setUtilitySaving(false); }
  }

  function deleteUtility(id) {
    askConfirm('確定刪除此筆水電收入？相關現金流紀錄也會一併刪除。', async () => {
      try {
        const res = await fetch(`/api/rentals/utility-income/${id}`, { method: 'DELETE' });
        const data = await res.json();
        if (!res.ok) return showToast(data.error || '刪除失敗', 'error');
        fetchUtilityList();
      } catch (e) { showToast('刪除失敗: ' + e.message, 'error'); }
    }, '刪除水電收入');
  }

  async function fetchMaintenances() {
    try {
      const params = new URLSearchParams();
      if (maintenanceFilter.category) params.set('category', maintenanceFilter.category);
      if (maintenanceFilter.status) params.set('status', maintenanceFilter.status);
      const res = await fetch(`/api/rentals/maintenance?${params}`);
      const data = await res.json();
      setMaintenances(Array.isArray(data) ? data : []);
    } catch { setMaintenances([]); }
  }

  // ==================== TENANT CRUD ====================
  function openTenantModal(tenant = null) {
    if (tenant) {
      setEditingTenant(tenant);
      setTenantForm({
        tenantType: tenant.tenantType, fullName: tenant.fullName || '', companyName: tenant.companyName || '',
        phone: tenant.phone || '', email: tenant.email || '', address: tenant.address || '',
        note: tenant.note || '', isBlacklisted: tenant.isBlacklisted || false, blacklistReason: tenant.blacklistReason || ''
      });
    } else {
      setEditingTenant(null);
      setTenantForm({ tenantType: 'individual', fullName: '', companyName: '', phone: '', email: '', address: '', note: '', isBlacklisted: false, blacklistReason: '' });
    }
    setShowTenantModal(true);
  }

  async function saveTenant() {
    setTenantSaving(true);
    try {
      const url = editingTenant ? `/api/rentals/tenants/${editingTenant.id}` : '/api/rentals/tenants';
      const method = editingTenant ? 'PUT' : 'POST';
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(tenantForm) });
      const data = await res.json();
      if (!res.ok) return showToast(data.error || '儲存失敗', 'error');
      setShowTenantModal(false);
      fetchTenants();
    } catch (err) { showToast('儲存失敗: ' + err.message, 'error'); }
    finally { setTenantSaving(false); }
  }

  function deleteTenant(id) {
    askConfirm('確定要刪除此租客？', async () => {
      try {
        const res = await fetch(`/api/rentals/tenants/${id}`, { method: 'DELETE' });
        const data = await res.json();
        if (!res.ok) return showToast(data.error || '刪除失敗', 'error');
        fetchTenants();
      } catch (err) { showToast('刪除失敗: ' + err.message, 'error'); }
    }, '刪除租客');
  }

  // ==================== PROPERTY CRUD ====================
  function openPropertyModal(property = null) {
    if (property) {
      setEditingProperty(property);
      setPropertyForm({
        name: property.name || '', address: property.address || '', buildingName: property.buildingName || '',
        unitNo: property.unitNo || '', ownerName: property.ownerName || '', houseTaxRegistrationNo: property.houseTaxRegistrationNo || '',
        status: property.status || 'available',
        rentCollectAccountId: property.rentCollectAccountId || '', depositAccountId: property.depositAccountId || '',
        note: property.note || '', collectUtilityFee: property.collectUtilityFee || false, publicInterestLandlord: property.publicInterestLandlord || false,
        publicInterestApplicant: property.publicInterestApplicant || '',
        publicInterestNote: property.publicInterestNote || '',
        publicInterestStartDate: property.publicInterestStartDate || '',
        publicInterestEndDate: property.publicInterestEndDate || '',
      });
    } else {
      setEditingProperty(null);
      setPropertyForm({ name: '', address: '', buildingName: '', unitNo: '', ownerName: '', houseTaxRegistrationNo: '', status: 'available', rentCollectAccountId: '', depositAccountId: '', note: '', collectUtilityFee: false, publicInterestLandlord: false, publicInterestApplicant: '', publicInterestNote: '', publicInterestStartDate: '', publicInterestEndDate: '' });
    }
    setShowPropertyModal(true);
  }

  async function saveProperty() {
    setPropertySaving(true);
    try {
      const url = editingProperty ? `/api/rentals/properties/${editingProperty.id}` : '/api/rentals/properties';
      const method = editingProperty ? 'PUT' : 'POST';
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(propertyForm) });
      const data = await res.json();
      if (!res.ok) return showToast(data.error || '儲存失敗', 'error');
      setShowPropertyModal(false);
      fetchProperties();
    } catch (err) { showToast('儲存失敗: ' + err.message, 'error'); }
    finally { setPropertySaving(false); }
  }

  function deleteProperty(id) {
    askConfirm('確定要刪除此物業？此操作無法復原。', async () => {
      try {
        const res = await fetch(`/api/rentals/properties/${id}`, { method: 'DELETE' });
        const data = await res.json();
        if (!res.ok) return showToast(data.error || '刪除失敗', 'error');
        fetchProperties();
      } catch (err) { showToast('刪除失敗: ' + err.message, 'error'); }
    }, '刪除物業');
  }

  // ==================== CONTRACT CRUD ====================
  function openContractModal(contract = null) {
    setRenewingFromContract(null);
    if (contract) {
      setEditingContract(contract);
      setContractForm({
        propertyId: contract.propertyId || '', tenantId: contract.tenantId || '',
        startDate: contract.startDate || '', endDate: contract.endDate || '',
        monthlyRent: contract.monthlyRent || '', paymentDueDay: contract.paymentDueDay || '5',
        depositAmount: contract.depositAmount || '', depositAccountId: contract.depositAccountId || '',
        rentAccountId: contract.rentAccountId || '', accountingSubjectId: contract.accountingSubjectId ? String(contract.accountingSubjectId) : '',
        status: contract.status || 'pending',
        autoRenew: contract.autoRenew || false, specialTerms: contract.specialTerms || '', note: contract.note || '',
        previousContractId: ''
      });
    } else {
      setEditingContract(null);
      setContractForm({
        propertyId: '', tenantId: '', startDate: '', endDate: '',
        monthlyRent: '', paymentDueDay: '5', depositAmount: '', depositAccountId: '',
        rentAccountId: '', accountingSubjectId: '', status: 'pending', autoRenew: false,
        specialTerms: '', note: '', previousContractId: ''
      });
    }
    setShowContractModal(true);
  }

  function openRenewalModal(contract) {
    const nextDay = new Date(contract.endDate);
    nextDay.setDate(nextDay.getDate() + 1);
    const nextStart = nextDay.toISOString().split('T')[0];
    setRenewingFromContract(contract);
    setEditingContract(null);
    setContractForm({
      propertyId: contract.propertyId || '',
      tenantId: contract.tenantId || '',
      startDate: nextStart,
      endDate: '',
      monthlyRent: contract.monthlyRent || '',
      paymentDueDay: contract.paymentDueDay || '5',
      depositAmount: contract.depositAmount || '',
      depositAccountId: contract.depositAccountId || '',
      rentAccountId: contract.rentAccountId || '',
      accountingSubjectId: contract.accountingSubjectId ? String(contract.accountingSubjectId) : '',
      status: 'active',
      autoRenew: contract.autoRenew || false,
      specialTerms: contract.specialTerms || '',
      note: '',
      previousContractId: contract.id,
    });
    setShowContractModal(true);
  }

  async function saveContract() {
    if (!contractForm.accountingSubjectId) {
      showToast('請選擇會計科目', 'error');
      return;
    }
    setContractSaving(true);
    try {
      const url = editingContract ? `/api/rentals/contracts/${editingContract.id}` : '/api/rentals/contracts';
      const method = editingContract ? 'PUT' : 'POST';
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(contractForm) });
      const data = await res.json();
      if (!res.ok) return showToast(data?.error?.message || data?.error || '儲存失敗', 'error');
      setShowContractModal(false);
      setRenewingFromContract(null);
      fetchContracts();
      fetchProperties();
    } catch (err) { showToast('儲存失敗: ' + err.message, 'error'); }
    finally { setContractSaving(false); }
  }

  function deleteContract(id) {
    askConfirm('確定要刪除此合約？', async () => {
      try {
        const res = await fetch(`/api/rentals/contracts/${id}`, { method: 'DELETE' });
        const data = await res.json();
        if (!res.ok) return showToast(data.error || '刪除失敗', 'error');
        fetchContracts();
      } catch (err) { showToast('刪除失敗: ' + err.message, 'error'); }
    }, '刪除合約');
  }

  function handleDepositAction(contractId, action) {
    const msg = action === 'depositReceive' ? '確定收取押金？收款後將建立金流紀錄。' : '確定退還押金？退還後將建立支出金流。';
    askConfirm(msg, async () => {
    try {
      const res = await fetch(`/api/rentals/contracts/${contractId}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action })
      });
      const data = await res.json();
      if (!res.ok) return showToast(data.error || '操作失敗', 'error');
      showToast('操作成功', 'success');
      fetchContracts();
    } catch (err) { showToast('操作失敗: ' + err.message, 'error'); }
    }, action === 'depositReceive' ? '收取押金' : '退還押金', false);
  }

  // ==================== INCOME (CASHIER) ====================
  function generateMonthlyIncome() {
    askConfirm(`確定產生 ${incomeFilter.year}/${incomeFilter.month} 月份租金紀錄？`, async () => {
    try {
      const res = await fetch('/api/rentals/income', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year: incomeFilter.year, month: incomeFilter.month })
      });
      const data = await res.json();
      if (!res.ok) return showToast(data.error || '產生失敗', 'error');
      showToast(`已產生 ${data.created} 筆，跳過 ${data.skipped} 筆`, 'success');
      fetchIncomes();
    } catch (err) { showToast('產生失敗: ' + err.message, 'error'); }
    }, '產生月份租金', false);
  }

  function openIncomePayment(income) {
    setIncomeFormMode('confirm');
    setPayingIncomeId(income.id);
    const expected = Number(income.expectedAmount || 0);
    const received = Number(income.actualAmount || 0);
    const remaining = Math.max(0, expected - received);
    const propertyData = properties.find(p => p.id === income.propertyId);
    const defaultAccountId = String(
      income.accountId ||
      income.rentCollectAccountId ||
      propertyData?.rentCollectAccountId ||
      propertyData?.rentCollectAccount?.id ||
      ''
    );
    setIncomePayForm({
      actualAmount: remaining > 0 ? String(remaining) : String(expected),
      actualDate: new Date().toISOString().split('T')[0],
      accountId: defaultAccountId === 'null' || defaultAccountId === 'undefined' ? '' : defaultAccountId,
      paymentMethod: income.paymentMethod || '匯款',
      matchTransferRef: '',
      matchBankAccountName: income.matchBankAccountName || '',
      matchNote: ''
    });
    if (income.collectUtilityFee) {
      const existingUtility = cashierUtilityMap[income.propertyId];
      setIncomeUtilityForm({
        expectedAmount: existingUtility ? String(existingUtility.expectedAmount) : '',
        actualAmount: ''
      });
    } else {
      setIncomeUtilityForm({ expectedAmount: '', actualAmount: '' });
    }
  }

  function openIncomeEdit(income) {
    setIncomeFormMode('edit');
    setPayingIncomeId(income.id);
    setIncomePayForm({
      actualAmount: String(income.actualAmount ?? ''),
      actualDate: income.actualDate || new Date().toISOString().split('T')[0],
      accountId: income.accountId || '',
      paymentMethod: income.paymentMethod || '現金',
      matchTransferRef: income.matchTransferRef || '',
      matchBankAccountName: income.matchBankAccountName || '',
      matchNote: income.matchNote || ''
    });
  }

  async function confirmIncomePayment() {
    if (!incomePayForm.actualAmount || Number(incomePayForm.actualAmount) <= 0) {
      return showToast('請填寫實收金額', 'error');
    }
    if (!incomePayForm.accountId) {
      return showToast('請選擇收款帳戶', 'error');
    }
    setIncomePaymentSaving(true);
    try {
      let res;
      if (incomeFormMode === 'edit') {
        res = await fetch(`/api/rentals/income/${payingIncomeId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(incomePayForm)
        });
      } else {
        const currentIncome = incomes.find(i => i.id === payingIncomeId);
        const hasUtility = currentIncome?.collectUtilityFee;
        const utilityPayload = hasUtility && (incomeUtilityForm.expectedAmount || incomeUtilityForm.actualAmount)
          ? { expectedAmount: incomeUtilityForm.expectedAmount || '', actualAmount: incomeUtilityForm.actualAmount || '' }
          : null;
        res = await fetch(`/api/rentals/income/${payingIncomeId}/confirm`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rent: incomePayForm, utility: utilityPayload })
        });
      }
      const data = await res.json();
      if (!res.ok) return showToast(data.error || (incomeFormMode === 'edit' ? '更新失敗' : '確認失敗'), 'error');
      showToast(incomeFormMode === 'edit' ? '已更新收款資料' : `已確認收款 (${data.status === 'partial' ? '部分收款' : '全額收款'})`, 'success');
      setPayingIncomeId(null);
      fetchIncomes();
      fetchSummary();
    } catch (err) { showToast(incomeFormMode === 'edit' ? '更新失敗: ' + err.message : '確認失敗: ' + err.message, 'error'); }
    finally { setIncomePaymentSaving(false); }
  }

  function voidIncomePayment(incomeId) {
    askConfirm('確定要作廢此筆收款？金流將沖銷，收租紀錄恢復為待收。', async () => {
      try {
        const res = await fetch(`/api/rentals/income/${incomeId}`, { method: 'DELETE' });
        const data = await res.json();
        if (!res.ok) return showToast(data.error || '作廢失敗', 'error');
        setPayingIncomeId(null);
        fetchIncomes();
        fetchSummary();
      } catch (err) { showToast('作廢失敗: ' + err.message, 'error'); }
    }, '作廢收款');
  }

  // ==================== TAXES ====================
  function openTaxEdit(tax) {
    setEditingTax(tax);
    setTaxForm({
      propertyId: String(tax.propertyId),
      taxYear: tax.taxYear,
      taxType: tax.taxType || '房屋稅',
      dueDate: tax.dueDate || '',
      amount: tax.amount != null ? String(tax.amount) : '',
      certNo: tax.certNo || '',
      paidDate: tax.paidDate || '',
      note: tax.note || '',
    });
    setShowTaxModal(true);
  }

  async function saveTax() {
    setTaxSaving(true);
    try {
      if (editingTax) {
        const res = await fetch(`/api/rentals/taxes/${editingTax.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            amount: taxForm.amount === '' ? undefined : Number(taxForm.amount),
            dueDate: taxForm.dueDate || undefined,
            taxType: taxForm.taxType || undefined,
            certNo: taxForm.certNo,
            paidDate: taxForm.paidDate,
            note: taxForm.note,
          })
        });
        const data = await res.json();
        if (!res.ok) return showToast(data.error || data.message || '更新失敗', 'error');
        setShowTaxModal(false);
        setEditingTax(null);
        fetchTaxes();
      } else {
        const res = await fetch('/api/rentals/taxes', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(taxForm)
        });
        const data = await res.json();
        if (!res.ok) return showToast(data.error || '儲存失敗', 'error');
        setShowTaxModal(false);
        fetchTaxes();
      }
    } catch (err) { showToast(editingTax ? '更新失敗: ' + err.message : '儲存失敗: ' + err.message, 'error'); }
    finally { setTaxSaving(false); }
  }

  async function confirmTaxPayment() {
    try {
      const res = await fetch(`/api/rentals/taxes/${payingTaxId}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(taxPayForm)
      });
      const data = await res.json();
      if (!res.ok) return showToast(data.error || '確認失敗', 'error');
      showToast('稅款已確認繳納', 'success');
      setPayingTaxId(null);
      fetchTaxes();
    } catch (err) { showToast('確認失敗: ' + err.message, 'error'); }
  }

  async function deleteTax(tax) {
    if (tax.status === 'paid') {
      showToast('已付款的稅款不可刪除', 'error');
      return;
    }
    askConfirm(`確定要刪除此筆稅款（${tax.property?.name} ${tax.taxYear} ${tax.taxType}）？`, async () => {
      try {
        const res = await fetch(`/api/rentals/taxes/${tax.id}`, { method: 'DELETE' });
        const data = await res.json();
        if (!res.ok) return showToast(data.message || data.error || '刪除失敗', 'error');
        fetchTaxes();
      } catch (err) { showToast('刪除失敗: ' + err.message, 'error'); }
    }, '刪除稅款');
  }

  // ==================== MAINTENANCE ====================
  async function saveMaintenance() {
    if (!maintenanceForm.accountingSubjectId) {
      showToast('請選擇會計科目', 'error');
      return;
    }
    setMaintenanceSaving(true);
    if (editingMaintenance) {
      try {
        const res = await fetch(`/api/rentals/maintenance/${editingMaintenance.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            propertyId: maintenanceForm.propertyId,
            maintenanceDate: maintenanceForm.maintenanceDate,
            category: maintenanceForm.category,
            amount: maintenanceForm.amount,
            accountingSubjectId: maintenanceForm.accountingSubjectId,
            isCapitalized: maintenanceForm.isCapitalized,
            isRecurring: maintenanceForm.isRecurring,
            note: maintenanceForm.note
          })
        });
        const data = await res.json();
        if (!res.ok) return showToast(data?.error?.message || data?.error || '更新失敗', 'error');
        setShowMaintenanceModal(false);
        setEditingMaintenance(null);
        fetchMaintenances();
      } catch (err) { showToast('更新失敗: ' + err.message, 'error'); }
      finally { setMaintenanceSaving(false); }
      return;
    }
    if (!maintenanceForm.accountId) {
      showToast('請選擇支出戶頭（存檔後將同步至出納待出納）', 'error');
      setMaintenanceSaving(false);
      return;
    }
    try {
      const res = await fetch('/api/rentals/maintenance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(maintenanceForm)
      });
      const data = await res.json();
      if (!res.ok) return showToast(data?.error?.message || data?.error || '儲存失敗', 'error');
      setShowMaintenanceModal(false);
      fetchMaintenances();
    } catch (err) { showToast('儲存失敗: ' + err.message, 'error'); }
    finally { setMaintenanceSaving(false); }
  }

  async function deleteMaintenance(m) {
    if (m.status === 'paid' || m.cashTransactionId) {
      showToast('已付款的維護費不可刪除', 'error');
      return;
    }
    askConfirm('確定要刪除此筆維護紀錄嗎？', async () => {
      try {
        const res = await fetch(`/api/rentals/maintenance/${m.id}`, { method: 'DELETE' });
        if (!res.ok) {
          const data = await res.json();
          return showToast(data?.error?.message || data?.error || '刪除失敗', 'error');
        }
        fetchMaintenances();
      } catch (err) { showToast('刪除失敗: ' + err.message, 'error'); }
    }, '刪除維護紀錄');
  }

  // ==================== HELPER ====================
  function getTenantDisplayName(tenant) {
    if (!tenant) return '-';
    return tenant.tenantType === 'company' ? tenant.companyName : tenant.fullName;
  }

  function getCreditColor(count) {
    if (count === 0) return 'text-green-600';
    if (count <= 2) return 'text-yellow-600';
    return 'text-red-600';
  }

  const buildingNames = [...new Set(properties.map(p => p.buildingName).filter(Boolean))];

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
              className={`px-4 py-2 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                activeTab === tab.key
                  ? 'border-teal-500 text-teal-700 bg-teal-50'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {loading && activeTab === 'overview' ? (
          <div className="text-center py-12 text-gray-500">載入中...</div>
        ) : (
          <>
            {/* ==================== TAB: OVERVIEW ==================== */}
            {activeTab === 'overview' && summary && (() => {
              const thirtyDayCount = (summary.expiringContractDetails || []).filter(c => c.daysUntilExpiry <= 30).length;
              return (
              <div>
                {/* Notification banners */}
                {summary.overdueCount > 0 && (
                  <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-3 rounded flex items-center justify-between">
                    <p className="text-red-700 font-medium">
                      有 {summary.overdueCount} 筆租金逾期未收，總金額 ${fmt(summary.overdueAmount)}
                    </p>
                    <button onClick={() => switchAnalyticsSub('overdue')} className="text-xs text-red-600 underline">前往逾期催繳報表</button>
                  </div>
                )}
                {thirtyDayCount > 0 && (
                  <div className="bg-red-50 border-l-4 border-red-600 p-4 mb-3 rounded flex items-center justify-between">
                    <p className="text-red-700 font-semibold">
                      緊急：有 {thirtyDayCount} 筆合約將於 30 天內到期，請儘速處理續約
                    </p>
                    <button onClick={() => switchTab('contracts')} className="text-xs text-red-600 underline">前往合約管理</button>
                  </div>
                )}
                {summary.expiringContracts > thirtyDayCount && (
                  <div className="bg-yellow-50 border-l-4 border-yellow-500 p-4 mb-3 rounded flex items-center justify-between">
                    <p className="text-yellow-700 font-medium">
                      有 {summary.expiringContracts - thirtyDayCount} 筆合約將於 31–60 天內到期
                    </p>
                    <button onClick={() => switchTab('contracts')} className="text-xs text-yellow-600 underline">前往合約管理</button>
                  </div>
                )}
                {summary.pendingTaxes > 0 && (
                  <div className="bg-orange-50 border-l-4 border-orange-500 p-4 mb-3 rounded">
                    <p className="text-orange-700 font-medium">
                      有 {summary.pendingTaxes} 筆稅款待繳納
                    </p>
                  </div>
                )}

                {/* KPI Cards Row 1 */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                  <div className="bg-white rounded-lg shadow p-4 border-l-4 border-teal-500">
                    <p className="text-sm text-gray-500">總物業數</p>
                    <p className="text-2xl font-bold text-teal-700">{summary.totalProperties}</p>
                    <p className="text-xs text-gray-400 mt-1">
                      已出租 {summary.rentedCount} / 空置 {summary.availableCount} / 維護 {summary.maintenanceCount}
                    </p>
                  </div>
                  <div className="bg-white rounded-lg shadow p-4 border-l-4 border-blue-500">
                    <p className="text-sm text-gray-500">本月應收</p>
                    <p className="text-2xl font-bold text-blue-700">${fmt(summary.thisMonthExpected)}</p>
                    <p className="text-xs text-gray-400 mt-1">待收 {summary.thisMonthPending ?? '-'} 筆</p>
                  </div>
                  <div className="bg-white rounded-lg shadow p-4 border-l-4 border-green-500">
                    <p className="text-sm text-gray-500">本月已收</p>
                    <p className="text-2xl font-bold text-green-700">${fmt(summary.thisMonthCollected)}</p>
                    <p className="text-xs text-gray-400 mt-1">收款率 {summary.collectionRate ?? 0}%</p>
                  </div>
                  <div className="bg-white rounded-lg shadow p-4 border-l-4 border-red-500">
                    <p className="text-sm text-gray-500">逾期未收</p>
                    <p className="text-2xl font-bold text-red-700">{summary.overdueCount} 筆</p>
                    <p className="text-xs text-gray-400 mt-1">${fmt(summary.overdueAmount)}</p>
                  </div>
                </div>

                {/* KPI Cards Row 2 */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                  <div className="bg-white rounded-lg shadow p-4 border-l-4 border-indigo-500">
                    <p className="text-sm text-gray-500">本月收款率</p>
                    <p className="text-2xl font-bold text-indigo-700">{summary.collectionRate ?? 0}%</p>
                    <div className="mt-2 bg-gray-100 rounded-full h-2">
                      <div className="bg-indigo-500 h-2 rounded-full" style={{ width: `${Math.min(summary.collectionRate ?? 0, 100)}%` }} />
                    </div>
                  </div>
                  <div className="bg-white rounded-lg shadow p-4 border-l-4 border-yellow-500">
                    <p className="text-sm text-gray-500">即將到期合約</p>
                    <p className="text-2xl font-bold text-yellow-700">{summary.expiringContracts}</p>
                    <p className="text-xs text-gray-400 mt-1">60天內</p>
                  </div>
                  <div className="bg-white rounded-lg shadow p-4 border-l-4 border-orange-500">
                    <p className="text-sm text-gray-500">待繳稅款</p>
                    <p className="text-2xl font-bold text-orange-700">{summary.pendingTaxes}</p>
                  </div>
                  <div className="bg-white rounded-lg shadow p-4 border-l-4 border-purple-500">
                    <p className="text-sm text-gray-500">待付維護費</p>
                    <p className="text-2xl font-bold text-purple-700">{summary.pendingMaintenance}</p>
                  </div>
                </div>

                {/* Detail lists */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Overdue list */}
                  {summary.overdueDetails && summary.overdueDetails.length > 0 && (
                    <div className="bg-white rounded-lg shadow p-4">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="font-semibold text-red-700">逾期租金明細</h3>
                        <button onClick={() => switchTab('cashier')} className="text-xs text-teal-600 underline">前往收租</button>
                      </div>
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-gray-400 border-b">
                            <th className="text-left pb-1">物業</th>
                            <th className="text-left pb-1">租客</th>
                            <th className="text-right pb-1">金額</th>
                            <th className="text-right pb-1">逾期天數</th>
                          </tr>
                        </thead>
                        <tbody>
                          {summary.overdueDetails.map(d => (
                            <tr key={d.id} className="border-b border-gray-50 hover:bg-red-50">
                              <td className="py-1.5 text-gray-700">{d.propertyName}</td>
                              <td className="py-1.5 text-gray-600">{d.tenantName}</td>
                              <td className="py-1.5 text-right font-medium text-red-600">${fmt(d.expectedAmount)}</td>
                              <td className="py-1.5 text-right">
                                <span className="bg-red-100 text-red-700 px-1.5 py-0.5 rounded">{d.daysOverdue}天</span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {summary.overdueCount > summary.overdueDetails.length && (
                        <p className="text-xs text-gray-400 mt-2 text-right">僅顯示前 {summary.overdueDetails.length} 筆，共 {summary.overdueCount} 筆</p>
                      )}
                    </div>
                  )}

                  {/* Expiring contracts list */}
                  {summary.expiringContractDetails && summary.expiringContractDetails.length > 0 && (
                    <div className="bg-white rounded-lg shadow p-4">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="font-semibold text-yellow-700">即將到期合約明細</h3>
                        <button onClick={() => switchTab('contracts')} className="text-xs text-teal-600 underline">前往合約</button>
                      </div>
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-gray-400 border-b">
                            <th className="text-left pb-1">物業</th>
                            <th className="text-left pb-1">租客</th>
                            <th className="text-right pb-1">月租</th>
                            <th className="text-right pb-1">剩餘天數</th>
                          </tr>
                        </thead>
                        <tbody>
                          {summary.expiringContractDetails.map(c => (
                            <tr key={c.id} className="border-b border-gray-50 hover:bg-yellow-50">
                              <td className="py-1.5 text-gray-700">{c.propertyName}</td>
                              <td className="py-1.5 text-gray-600">{c.tenantName}</td>
                              <td className="py-1.5 text-right font-medium">${fmt(c.monthlyRent)}</td>
                              <td className="py-1.5 text-right">
                                <span className={`px-1.5 py-0.5 rounded ${c.daysUntilExpiry <= 30 ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>
                                  {c.daysUntilExpiry}天
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {summary.expiringContracts > summary.expiringContractDetails.length && (
                        <p className="text-xs text-gray-400 mt-2 text-right">僅顯示前 {summary.expiringContractDetails.length} 筆，共 {summary.expiringContracts} 筆</p>
                      )}
                    </div>
                  )}
                </div>
              </div>
              );
            })()}

            {/* ==================== TAB: CASHIER ==================== */}
            {activeTab === 'cashier' && (
              <div>
                {/* Cashier summary cards */}
                {incomes.length > 0 && (
                  <div className="grid grid-cols-4 gap-3 mb-4">
                    <div className="bg-white rounded-lg shadow-sm p-3 border-l-4 border-teal-500">
                      <p className="text-xs text-gray-500">總應收</p>
                      <p className="text-lg font-bold">${fmt(incomes.reduce((s, i) => s + Number(i.expectedAmount || 0), 0))}</p>
                    </div>
                    <div className="bg-white rounded-lg shadow-sm p-3 border-l-4 border-green-500">
                      <p className="text-xs text-gray-500">已收</p>
                      <p className="text-lg font-bold text-green-700">${fmt(incomes.filter(i => i.status === 'completed').reduce((s, i) => s + Number(i.actualAmount || 0), 0))}</p>
                    </div>
                    <div className="bg-white rounded-lg shadow-sm p-3 border-l-4 border-yellow-500">
                      <p className="text-xs text-gray-500">待收</p>
                      <p className="text-lg font-bold text-yellow-700">{incomes.filter(i => i.status === 'pending').length} 筆</p>
                    </div>
                    <div className="bg-white rounded-lg shadow-sm p-3 border-l-4 border-red-500">
                      <p className="text-xs text-gray-500">逾期</p>
                      <p className="text-lg font-bold text-red-600">{incomes.filter(i => i.status === 'pending' && i.dueDate < new Date().toISOString().split('T')[0]).length} 筆</p>
                    </div>
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-3 mb-4">
                  <label className="text-sm text-gray-600">年份:</label>
                  <input type="number" value={incomeFilter.year} onChange={e => setIncomeFilter(f => ({ ...f, year: e.target.value }))}
                    className="border rounded px-2 py-1 w-24 text-sm" />
                  <label className="text-sm text-gray-600">月份:</label>
                  <select value={incomeFilter.month} onChange={e => setIncomeFilter(f => ({ ...f, month: e.target.value }))}
                    className="border rounded px-2 py-1 text-sm">
                    {Array.from({ length: 12 }, (_, i) => (
                      <option key={i + 1} value={i + 1}>{i + 1} 月</option>
                    ))}
                  </select>
                  <select value={incomeFilter.status} onChange={e => setIncomeFilter(f => ({ ...f, status: e.target.value }))}
                    className="border rounded px-2 py-1 text-sm">
                    <option value="">全部狀態</option>
                    {INCOME_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                  <button onClick={fetchIncomes} className="bg-teal-600 text-white px-3 py-1 rounded text-sm hover:bg-teal-700">查詢</button>
                  <button onClick={generateMonthlyIncome} className="bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700">
                    產生本月租金
                  </button>
                  {selectedIncomeIds.size > 0 && (
                    <button onClick={() => setShowBatchPay(true)} className="bg-green-600 text-white px-3 py-1 rounded text-sm hover:bg-green-700 ml-auto">
                      批次確認 ({selectedIncomeIds.size} 筆)
                    </button>
                  )}
                </div>

                {/* 批次確認收款 panel */}
                {showBatchPay && (
                  <div className="mb-4 bg-green-50 border border-green-200 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="font-semibold text-green-800">批次確認收款 — {selectedIncomeIds.size} 筆（全額收款）</h4>
                      <button onClick={() => setShowBatchPay(false)} className="text-gray-400 hover:text-gray-600 text-sm">✕</button>
                    </div>
                    <div className="grid grid-cols-3 gap-3 mb-3">
                      <div>
                        <label className="text-xs text-gray-600">收款日期</label>
                        <input type="date" value={batchPayForm.actualDate} onChange={e => setBatchPayForm(f => ({ ...f, actualDate: e.target.value }))}
                          className="w-full border rounded px-2 py-1 text-sm" />
                      </div>
                      <div>
                        <label className="text-xs text-gray-600">收款帳戶 *</label>
                        <select value={batchPayForm.accountId} onChange={e => setBatchPayForm(f => ({ ...f, accountId: e.target.value }))}
                          className="w-full border rounded px-2 py-1 text-sm">
                          <option value="">選擇帳戶</option>
                          {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="text-xs text-gray-600">付款方式</label>
                        <select value={batchPayForm.paymentMethod} onChange={e => setBatchPayForm(f => ({ ...f, paymentMethod: e.target.value }))}
                          className="w-full border rounded px-2 py-1 text-sm">
                          {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m === 'transfer' ? '轉帳' : m}</option>)}
                        </select>
                      </div>
                    </div>
                    <p className="text-xs text-gray-500 mb-3">※ 批次操作將以「應收金額」為實收，適用於全額收款的情境。</p>
                    <div className="flex gap-2">
                      <button onClick={batchConfirmIncomes} disabled={batchSaving}
                        className="bg-green-600 text-white px-4 py-1.5 rounded text-sm hover:bg-green-700 disabled:opacity-50">
                        {batchSaving ? '處理中…' : '確認送出'}
                      </button>
                      <button onClick={() => { setShowBatchPay(false); setSelectedIncomeIds(new Set()); }}
                        className="bg-gray-300 text-gray-700 px-4 py-1.5 rounded text-sm hover:bg-gray-400">取消</button>
                    </div>
                  </div>
                )}

                {(() => {
                  const hasAnyUtility = incomes.some(i => i.collectUtilityFee);
                  const colSpan = hasAnyUtility ? 12 : 10;
                  return (
                <div className="bg-white rounded-lg shadow overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-teal-50">
                      <tr>
                        <th className="px-3 py-2 text-center w-8">
                          <input type="checkbox"
                            checked={selectedIncomeIds.size > 0 && incomes.filter(i => i.status === 'pending' || i.status === 'partial').every(i => selectedIncomeIds.has(i.id))}
                            onChange={e => {
                              const pending = incomes.filter(i => i.status === 'pending' || i.status === 'partial');
                              setSelectedIncomeIds(e.target.checked ? new Set(pending.map(i => i.id)) : new Set());
                            }}
                          />
                        </th>
                        <SortableTh label="物業" colKey="propertyName" sortKey={rentIncKey} sortDir={rentIncDir} onSort={rentIncToggle} className="px-3 py-2" />
                        <SortableTh label="租客" colKey="tenantName" sortKey={rentIncKey} sortDir={rentIncDir} onSort={rentIncToggle} className="px-3 py-2" />
                        <SortableTh label="租金應收" colKey="expectedAmount" sortKey={rentIncKey} sortDir={rentIncDir} onSort={rentIncToggle} className="px-3 py-2" align="right" />
                        {hasAnyUtility && <th className="text-right px-3 py-2 text-sm font-medium text-blue-700">電費應收</th>}
                        {hasAnyUtility && <th className="text-right px-3 py-2 text-sm font-medium text-gray-700">合計應收</th>}
                        <SortableTh label="實收" colKey="actualAmount" sortKey={rentIncKey} sortDir={rentIncDir} onSort={rentIncToggle} className="px-3 py-2" align="right" />
                        <SortableTh label="未收" colKey="remaining" sortKey={rentIncKey} sortDir={rentIncDir} onSort={rentIncToggle} className="px-3 py-2" align="right" />
                        <SortableTh label="到期日" colKey="dueDate" sortKey={rentIncKey} sortDir={rentIncDir} onSort={rentIncToggle} className="px-3 py-2" />
                        <SortableTh label="狀態" colKey="status" sortKey={rentIncKey} sortDir={rentIncDir} onSort={rentIncToggle} className="px-3 py-2" align="center" />
                        <SortableTh label="付款紀錄" colKey="payCount" sortKey={rentIncKey} sortDir={rentIncDir} onSort={rentIncToggle} className="px-3 py-2" />
                        <th className="text-center px-3 py-2 text-sm font-medium text-gray-700">操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {incomes.length === 0 ? (
                        <tr><td colSpan={colSpan} className="text-center py-8 text-gray-400">暫無資料</td></tr>
                      ) : sortedIncomes.map(income => {
                        const isOverdue = income.status === 'pending' && income.dueDate < new Date().toISOString().split('T')[0];
                        const expected = Number(income.expectedAmount || 0);
                        const actual = Number(income.actualAmount || 0);
                        const remaining = expected - actual;
                        const paymentList = (income.payments && income.payments.length > 0)
                          ? income.payments.map((p, i) => ({ label: `第${i + 1}次`, amount: Number(p.amount), date: p.paymentDate }))
                          : (income.actualAmount != null && income.actualAmount > 0 ? [{ label: '第1次', amount: Number(income.actualAmount), date: income.actualDate || '-' }] : []);
                        const utilityRec = income.collectUtilityFee ? cashierUtilityMap[income.propertyId] : null;
                        const utilityExpected = utilityRec ? Number(utilityRec.expectedAmount) : 0;
                        const totalExpected = expected + utilityExpected;
                        return (
                          <tr key={income.id} className={`border-t hover:bg-gray-50 ${isOverdue ? 'bg-red-50' : ''}`}>
                            <td className="px-3 py-2 text-center">
                              {(income.status === 'pending' || income.status === 'partial') && (
                                <input type="checkbox"
                                  checked={selectedIncomeIds.has(income.id)}
                                  onChange={e => setSelectedIncomeIds(prev => {
                                    const next = new Set(prev);
                                    if (e.target.checked) next.add(income.id); else next.delete(income.id);
                                    return next;
                                  })}
                                />
                              )}
                            </td>
                            <td className="px-3 py-2">{income.propertyName}</td>
                            <td className="px-3 py-2">{income.tenantName}</td>
                            <td className="px-3 py-2 text-right font-medium">${fmt(income.expectedAmount)}</td>
                            {hasAnyUtility && (
                              <td className="px-3 py-2 text-right text-blue-700">
                                {income.collectUtilityFee
                                  ? (utilityExpected > 0 ? `$${fmt(utilityExpected)}` : <span className="text-gray-400 text-xs">待填</span>)
                                  : <span className="text-gray-300">—</span>}
                              </td>
                            )}
                            {hasAnyUtility && (
                              <td className="px-3 py-2 text-right font-semibold">
                                {income.collectUtilityFee ? `$${fmt(totalExpected)}` : `$${fmt(expected)}`}
                              </td>
                            )}
                            <td className="px-3 py-2 text-right">{income.actualAmount ? `$${fmt(income.actualAmount)}` : '-'}</td>
                            <td className="px-3 py-2 text-right font-medium">{remaining > 0 ? `$${fmt(remaining)}` : '-'}</td>
                            <td className="px-3 py-2">{income.dueDate}</td>
                            <td className="px-3 py-2 text-center">
                              <StatusBadge value={isOverdue ? 'overdue' : income.status} list={INCOME_STATUSES} />
                            </td>
                            <td className="px-3 py-2 text-xs text-gray-600">
                              {paymentList.length === 0 ? '-' : (
                                <div className="space-y-0.5">
                                  {paymentList.map((p, i) => (
                                    <div key={i}><span className="font-medium">{p.label}</span> ${fmt(p.amount)} <span className="text-gray-400">({p.date})</span></div>
                                  ))}
                                  {remaining > 0 && <div className="text-red-500 font-medium">尚欠 ${fmt(remaining)}</div>}
                                </div>
                              )}
                            </td>
                            <td className="px-3 py-2 text-center">
                              {(income.status === 'pending' || income.status === 'partial') && (
                                <button onClick={() => openIncomePayment(income)}
                                  className="text-teal-600 hover:text-teal-800 text-xs font-medium mr-1">
                                  {paymentList.length > 0 ? `第${paymentList.length + 1}次收款` : '確認收款'}
                                </button>
                              )}
                              {(income.status === 'completed' || income.status === 'partial') && (
                                <>
                                  <button onClick={() => voidIncomePayment(income.id)} className="text-red-600 hover:text-red-800 text-xs font-medium">作廢</button>
                                </>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                  );
                })()}

                {/* Inline payment form */}
                {payingIncomeId && (() => {
                  const currentIncome = incomes.find(i => i.id === payingIncomeId);
                  const expectedAmt = Number(currentIncome?.expectedAmount || 0);
                  const receivedAmt = Number(currentIncome?.actualAmount || 0);
                  const remainingAmt = Math.max(0, expectedAmt - receivedAmt);
                  const payHistory = currentIncome?.payments || [];
                  const showUtilitySection = incomeFormMode === 'confirm' && currentIncome?.collectUtilityFee;
                  const utilityExpectedAmt = Number(incomeUtilityForm.expectedAmount || 0);
                  const utilityActualAmt = Number(incomeUtilityForm.actualAmount || 0);
                  const totalExpectedAmt = expectedAmt + utilityExpectedAmt;
                  return (
                  <div className="mt-4 bg-teal-50 border border-teal-200 rounded-lg p-4">
                    <h4 className="font-medium text-teal-800 mb-3">{incomeFormMode === 'edit' ? '編輯收款' : '新增收款'}</h4>

                    {/* 收款狀態摘要 */}
                    <div className="bg-white rounded-lg px-3 py-2 mb-3 flex gap-4 text-sm flex-wrap">
                      <span>租金應收：<b className="text-gray-800">${fmt(expectedAmt)}</b></span>
                      {showUtilitySection && <span>電費應收：<b className="text-blue-700">${fmt(utilityExpectedAmt)}</b></span>}
                      {showUtilitySection && <span>合計應收：<b className="text-gray-900">${fmt(totalExpectedAmt)}</b></span>}
                      <span>已收：<b className="text-green-700">${fmt(receivedAmt)}</b></span>
                      <span>尚欠：<b className={remainingAmt > 0 ? 'text-red-600' : 'text-green-600'}>${fmt(remainingAmt)}</b></span>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                      <div>
                        <label className="text-xs text-gray-600">實收金額</label>
                        <input type="number" value={incomePayForm.actualAmount} onChange={e => setIncomePayForm(f => ({ ...f, actualAmount: e.target.value }))}
                          className="w-full border rounded px-2 py-1 text-sm" />
                      </div>
                      <div>
                        <label className="text-xs text-gray-600">收款日期</label>
                        <input type="date" value={incomePayForm.actualDate} onChange={e => setIncomePayForm(f => ({ ...f, actualDate: e.target.value }))}
                          className="w-full border rounded px-2 py-1 text-sm" />
                      </div>
                      <div>
                        <label className="text-xs text-gray-600">收款帳戶</label>
                        <select value={incomePayForm.accountId} onChange={e => setIncomePayForm(f => ({ ...f, accountId: e.target.value }))}
                          className="w-full border rounded px-2 py-1 text-sm">
                          <option value="">選擇帳戶</option>
                          {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="text-xs text-gray-600">付款方式</label>
                        <select value={incomePayForm.paymentMethod} onChange={e => setIncomePayForm(f => ({ ...f, paymentMethod: e.target.value }))}
                          className="w-full border rounded px-2 py-1 text-sm">
                          {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m === 'transfer' ? '轉帳' : m}</option>)}
                        </select>
                      </div>
                      {incomePayForm.paymentMethod === 'transfer' && (
                        <>
                          <div>
                            <label className="text-xs text-gray-600">轉帳參考號</label>
                            <input type="text" value={incomePayForm.matchTransferRef} onChange={e => setIncomePayForm(f => ({ ...f, matchTransferRef: e.target.value }))}
                              className="w-full border rounded px-2 py-1 text-sm" />
                          </div>
                          <div>
                            <label className="text-xs text-gray-600">匯款人戶名</label>
                            <input type="text" value={incomePayForm.matchBankAccountName} onChange={e => setIncomePayForm(f => ({ ...f, matchBankAccountName: e.target.value }))}
                              className="w-full border rounded px-2 py-1 text-sm" />
                          </div>
                        </>
                      )}
                      <div>
                        <label className="text-xs text-gray-600">備註</label>
                        <input type="text" value={incomePayForm.matchNote} onChange={e => setIncomePayForm(f => ({ ...f, matchNote: e.target.value }))}
                          className="w-full border rounded px-2 py-1 text-sm" placeholder="收款備註" />
                      </div>
                    </div>

                    {/* 電費區塊（僅限 confirm 模式且物業有 collectUtilityFee） */}
                    {showUtilitySection && (
                      <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                        <h5 className="text-sm font-medium text-blue-800 mb-2">電費收入（與租金一併入帳）</h5>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="text-xs text-blue-700">電費應收金額</label>
                            <input type="number" min="0" step="0.01"
                              value={incomeUtilityForm.expectedAmount}
                              onChange={e => setIncomeUtilityForm(f => ({ ...f, expectedAmount: e.target.value }))}
                              className="w-full border border-blue-200 rounded px-2 py-1 text-sm bg-white"
                              placeholder="本月電費帳單金額" />
                          </div>
                          <div>
                            <label className="text-xs text-blue-700">電費實收金額</label>
                            <input type="number" min="0" step="0.01"
                              value={incomeUtilityForm.actualAmount}
                              onChange={e => setIncomeUtilityForm(f => ({ ...f, actualAmount: e.target.value }))}
                              className="w-full border border-blue-200 rounded px-2 py-1 text-sm bg-white"
                              placeholder="留空表示尚未收到電費" />
                          </div>
                        </div>
                        <p className="text-xs text-blue-500 mt-1">※ 電費將使用相同日期與帳戶自動建立金流</p>
                      </div>
                    )}

                    <div className="mt-3 flex gap-2">
                      <button onClick={confirmIncomePayment} disabled={incomePaymentSaving} className="bg-teal-600 text-white px-4 py-1.5 rounded text-sm hover:bg-teal-700 disabled:opacity-50">{incomePaymentSaving ? '處理中…' : (incomeFormMode === 'edit' ? '儲存' : '確認收款')}</button>
                      <button onClick={() => setPayingIncomeId(null)} className="bg-gray-300 text-gray-700 px-4 py-1.5 rounded text-sm hover:bg-gray-400">取消</button>
                    </div>

                    {/* 歷次收款紀錄 */}
                    {payHistory.length > 0 && (
                      <div className="mt-4 border-t border-teal-200 pt-3">
                        <h5 className="text-sm font-medium text-teal-700 mb-2">歷次收款紀錄（可個別編輯）</h5>
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-gray-500 border-b">
                              <th className="text-left py-1">次數</th>
                              <th className="text-left py-1">收款日期</th>
                              <th className="text-right py-1">金額</th>
                              <th className="text-left py-1">收款帳戶</th>
                              <th className="text-left py-1">付款方式</th>
                              <th className="text-left py-1">備註</th>
                              <th className="text-center py-1">操作</th>
                            </tr>
                          </thead>
                          <tbody>
                            {payHistory.map((p, i) => (
                              <React.Fragment key={p.id || i}>
                                <tr className="border-b border-gray-100">
                                  <td className="py-1 font-medium">第{p.sequenceNo || (i + 1)}次</td>
                                  <td className="py-1">{p.paymentDate || '-'}</td>
                                  <td className="py-1 text-right text-green-700 font-medium">${fmt(p.amount)}</td>
                                  <td className="py-1">{p.account?.name || accounts.find(a => a.id === p.accountId)?.name || '-'}</td>
                                  <td className="py-1">{p.paymentMethod === 'transfer' ? '轉帳' : (p.paymentMethod || '-')}</td>
                                  <td className="py-1 text-gray-500">{p.matchNote || p.matchTransferRef || '-'}</td>
                                  <td className="py-1 text-center">
                                    {p.id && (editingPaymentId === p.id ? (
                                      <button onClick={() => setEditingPaymentId(null)} className="text-gray-400 text-xs">取消</button>
                                    ) : (
                                      <button onClick={() => openPaymentEdit(p)} className="text-blue-600 hover:text-blue-800 text-xs font-medium">編輯</button>
                                    ))}
                                  </td>
                                </tr>
                                {p.id && editingPaymentId === p.id && (
                                  <tr className="bg-blue-50/70">
                                    <td colSpan={7} className="py-2 px-2">
                                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-2">
                                        <div>
                                          <label className="text-xs text-gray-500">金額</label>
                                          <input type="number" value={editingPaymentForm.amount} onChange={e => setEditingPaymentForm(f => ({ ...f, amount: e.target.value }))} className="w-full border rounded px-2 py-0.5 text-xs" />
                                        </div>
                                        <div>
                                          <label className="text-xs text-gray-500">日期</label>
                                          <input type="date" value={editingPaymentForm.paymentDate} onChange={e => setEditingPaymentForm(f => ({ ...f, paymentDate: e.target.value }))} className="w-full border rounded px-2 py-0.5 text-xs" />
                                        </div>
                                        <div>
                                          <label className="text-xs text-gray-500">收款帳戶</label>
                                          <select value={editingPaymentForm.accountId} onChange={e => setEditingPaymentForm(f => ({ ...f, accountId: e.target.value }))} className="w-full border rounded px-2 py-0.5 text-xs">
                                            <option value="">選擇</option>
                                            {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                                          </select>
                                        </div>
                                        <div>
                                          <label className="text-xs text-gray-500">付款方式</label>
                                          <select value={editingPaymentForm.paymentMethod} onChange={e => setEditingPaymentForm(f => ({ ...f, paymentMethod: e.target.value }))} className="w-full border rounded px-2 py-0.5 text-xs">
                                            {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m === 'transfer' ? '轉帳' : m}</option>)}
                                          </select>
                                        </div>
                                        <div className="col-span-2">
                                          <label className="text-xs text-gray-500">備註</label>
                                          <input type="text" value={editingPaymentForm.matchNote} onChange={e => setEditingPaymentForm(f => ({ ...f, matchNote: e.target.value }))} className="w-full border rounded px-2 py-0.5 text-xs" />
                                        </div>
                                      </div>
                                      <div className="flex gap-2">
                                        <button onClick={savePaymentEdit} disabled={editingPaymentSaving} className="bg-blue-600 text-white px-3 py-1 rounded text-xs hover:bg-blue-700 disabled:opacity-50">{editingPaymentSaving ? '儲存中…' : '儲存'}</button>
                                        <button onClick={() => setEditingPaymentId(null)} className="bg-gray-200 text-gray-700 px-3 py-1 rounded text-xs hover:bg-gray-300">取消</button>
                                      </div>
                                    </td>
                                  </tr>
                                )}
                              </React.Fragment>
                            ))}
                            <tr className="font-medium bg-teal-100/50">
                              <td className="py-1" colSpan={2}>合計已收</td>
                              <td className="py-1 text-right text-green-700">${fmt(receivedAmt)}</td>
                              <td className="py-1" colSpan={4}>{remainingAmt > 0 ? <span className="text-red-600">尚欠 ${fmt(remainingAmt)}</span> : <span className="text-green-600">已收齊</span>}</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                  );
                })()}
              </div>
            )}

            {/* ==================== TAB: TENANTS ==================== */}
            {activeTab === 'tenants' && (
              <div>
                <div className="flex items-center gap-3 mb-4">
                  <input type="text" placeholder="搜尋姓名/公司/電話/代碼..." value={tenantSearch}
                    onChange={e => setTenantSearch(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && fetchTenants()}
                    className="border rounded px-3 py-1.5 text-sm w-64" />
                  <button onClick={fetchTenants} className="bg-teal-600 text-white px-3 py-1.5 rounded text-sm hover:bg-teal-700">搜尋</button>
                  <button onClick={() => openTenantModal()} className="bg-blue-600 text-white px-3 py-1.5 rounded text-sm hover:bg-blue-700 ml-auto">
                    新增租客
                  </button>
                </div>

                <div className="bg-white rounded-lg shadow overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-teal-50">
                      <tr>
                        <th className="text-left px-3 py-2">代碼</th>
                        <th className="text-left px-3 py-2">類型</th>
                        <th className="text-left px-3 py-2">姓名/公司</th>
                        <th className="text-left px-3 py-2">電話</th>
                        <th className="text-center px-3 py-2">有效合約</th>
                        <th className="text-center px-3 py-2">信用評等</th>
                        <th className="text-center px-3 py-2">黑名單</th>
                        <th className="text-center px-3 py-2">操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tenants.length === 0 ? (
                        <tr><td colSpan={8} className="text-center py-8 text-gray-400">暫無資料</td></tr>
                      ) : tenants.map(t => (
                        <tr key={t.id} className={`border-t hover:bg-gray-50 ${t.isBlacklisted ? 'bg-red-50' : ''}`}>
                          <td className="px-3 py-2 font-mono text-xs">{t.tenantCode}</td>
                          <td className="px-3 py-2">{t.tenantType === 'company' ? '公司' : '個人'}</td>
                          <td className="px-3 py-2 font-medium">{getTenantDisplayName(t)}</td>
                          <td className="px-3 py-2">{t.phone}</td>
                          <td className="px-3 py-2 text-center">{t.activeContractCount}</td>
                          <td className={`px-3 py-2 text-center font-medium ${getCreditColor(t.contracts?.filter(c => c.status === 'overdue').length || 0)}`}>
                            {(() => {
                              const oc = t.contracts?.filter(c => c.status === 'overdue').length || 0;
                              if (oc === 0) return '良好';
                              if (oc <= 2) return '注意';
                              return '警示';
                            })()}
                          </td>
                          <td className="px-3 py-2 text-center">
                            {t.isBlacklisted ? <span className="text-xs px-2 py-0.5 bg-red-100 text-red-800 rounded">黑名單</span> : '-'}
                          </td>
                          <td className="px-3 py-2 text-center">
                            <button onClick={() => openTenantModal(t)} className="text-blue-600 hover:text-blue-800 text-xs mr-2">編輯</button>
                            <button onClick={() => deleteTenant(t.id)} className="text-red-600 hover:text-red-800 text-xs">刪除</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ==================== TAB: PROPERTIES ==================== */}
            {activeTab === 'properties' && (
              <div>
                <div className="flex items-center gap-3 mb-4">
                  <select value={propertyFilter.buildingName} onChange={e => setPropertyFilter(f => ({ ...f, buildingName: e.target.value }))}
                    className="border rounded px-2 py-1.5 text-sm">
                    <option value="">全部大樓</option>
                    {buildingNames.map(b => <option key={b} value={b}>{b}</option>)}
                  </select>
                  <select value={propertyFilter.status} onChange={e => setPropertyFilter(f => ({ ...f, status: e.target.value }))}
                    className="border rounded px-2 py-1.5 text-sm">
                    <option value="">全部狀態</option>
                    {PROPERTY_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                  <button onClick={fetchProperties} className="bg-teal-600 text-white px-3 py-1.5 rounded text-sm hover:bg-teal-700">查詢</button>
                  <button onClick={() => openPropertyModal()} className="bg-blue-600 text-white px-3 py-1.5 rounded text-sm hover:bg-blue-700 ml-auto">
                    新增物業
                  </button>
                </div>

                {/* Sortable table */}
                {(() => {
                  const sortArrow = (key) => {
                    const active = propertySort.key === key;
                    return (
                      <button onClick={() => setPropertySort(s => ({ key, dir: s.key === key && s.dir === 'asc' ? 'desc' : 'asc' }))} className="ml-1 inline-flex flex-col leading-none text-[10px]">
                        <span className={active && propertySort.dir === 'asc' ? 'text-teal-700' : 'text-gray-300'}>▲</span>
                        <span className={active && propertySort.dir === 'desc' ? 'text-teal-700' : 'text-gray-300'}>▼</span>
                      </button>
                    );
                  };
                  const sorted = [...properties].sort((a, b) => {
                    if (!propertySort.key) return 0;
                    const dir = propertySort.dir === 'asc' ? 1 : -1;
                    const keyMap = {
                      name: p => p.name || '',
                      address: p => p.address || '',
                      unitNo: p => p.unitNo || '',
                      status: p => p.status || '',
                      tenant: p => p.currentTenantName || '',
                      account: p => p.rentCollectAccount?.name || '',
                      publicInterest: p => p.publicInterestLandlord ? 1 : 0,
                      note: p => p.note || '',
                      building: p => p.buildingName || '',
                    };
                    const fn = keyMap[propertySort.key];
                    if (!fn) return 0;
                    const va = fn(a), vb = fn(b);
                    if (typeof va === 'number') return (va - vb) * dir;
                    return String(va).localeCompare(String(vb)) * dir;
                  });
                  const grouped = {};
                  sorted.forEach(p => {
                    const key = p.buildingName || '未分類';
                    if (!grouped[key]) grouped[key] = [];
                    grouped[key].push(p);
                  });

                  return Object.entries(grouped).map(([building, props]) => (
                    <div key={building} className="mb-6">
                      <h3 className="text-lg font-medium text-gray-700 mb-2">{building}</h3>
                      <div className="bg-white rounded-lg shadow overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-teal-50">
                            <tr>
                              <th className="text-center px-3 py-2 w-10">序號</th>
                              <th className="text-left px-3 py-2">名稱{sortArrow('name')}</th>
                              <th className="text-left px-3 py-2">資產</th>
                              <th className="text-left px-3 py-2">地址{sortArrow('address')}</th>
                              <th className="text-left px-3 py-2">類別{sortArrow('unitNo')}</th>
                              <th className="text-center px-3 py-2">狀態{sortArrow('status')}</th>
                              <th className="text-left px-3 py-2">目前租客{sortArrow('tenant')}</th>
                              <th className="text-left px-3 py-2">收租帳戶{sortArrow('account')}</th>
                              <th className="text-center px-3 py-2">收電費</th>
                              <th className="text-center px-3 py-2">公益出租人{sortArrow('publicInterest')}</th>
                              <th className="text-left px-3 py-2">申請人</th>
                              <th className="text-left px-3 py-2">公益租約期間</th>
                              <th className="text-center px-3 py-2">租金申報</th>
                              <th className="text-left px-3 py-2">備註{sortArrow('note')}</th>
                              <th className="text-center px-3 py-2">操作</th>
                            </tr>
                          </thead>
                          <tbody>
                            {props.map((p, idx) => (
                              <tr key={p.id} className="border-t hover:bg-gray-50">
                                <td className="px-3 py-2 text-center text-xs text-gray-400">{idx + 1}</td>
                                <td className="px-3 py-2 font-medium">{p.name}</td>
                                <td className="px-3 py-2 text-xs">
                                  {p.asset ? (
                                    <Link href={`/assets?id=${p.asset.id}`} className="text-teal-700 hover:underline font-medium">
                                      {p.asset.name}
                                    </Link>
                                  ) : (
                                    <Link href={`/assets?linkProperty=${p.id}`} className="text-gray-400 hover:text-teal-700 hover:underline">
                                      建立／綁定
                                    </Link>
                                  )}
                                </td>
                                <td className="px-3 py-2 text-gray-600">{p.address || '-'}</td>
                                <td className="px-3 py-2">{p.unitNo || '-'}</td>
                                <td className="px-3 py-2 text-center">
                                  <StatusBadge value={p.status} list={PROPERTY_STATUSES} />
                                </td>
                                <td className="px-3 py-2">{p.currentTenantName || '-'}</td>
                                <td className="px-3 py-2 text-xs text-gray-500">{p.rentCollectAccount?.name || '-'}</td>
                                <td className="px-3 py-2 text-center">{p.collectUtilityFee ? <span className="text-blue-600 font-medium">是</span> : <span className="text-gray-400">—</span>}</td>
                                <td className="px-3 py-2 text-center">{p.publicInterestLandlord ? <span className="text-green-600 font-medium">是</span> : <span className="text-gray-400">否</span>}</td>
                                <td className="px-3 py-2 text-xs text-gray-600" title={p.publicInterestNote || ''}>{p.publicInterestApplicant || <span className="text-gray-300">—</span>}</td>
                                <td className="px-3 py-2 text-xs text-gray-600">
                                  {p.publicInterestLandlord && (p.publicInterestStartDate || p.publicInterestEndDate)
                                    ? <span>{p.publicInterestStartDate || '—'} ～ {p.publicInterestEndDate || '—'}</span>
                                    : <span className="text-gray-300">—</span>}
                                </td>
                                <td className="px-3 py-2 text-center">
                                  <button type="button" onClick={() => switchTab('rentFiling')} className="text-teal-600 hover:underline text-xs font-medium">
                                    {p.publicInterestLandlord ? '前往年度申報' : '總表'}
                                  </button>
                                </td>
                                <td className="px-3 py-2 text-xs text-gray-500 max-w-[150px] truncate" title={p.note || ''}>{p.note || '-'}</td>
                                <td className="px-3 py-2 text-center">
                                  <button onClick={() => openPropertyModal(p)} className="text-blue-600 hover:text-blue-800 text-xs mr-2">編輯</button>
                                  <button onClick={() => deleteProperty(p.id)} className="text-red-600 hover:text-red-800 text-xs">刪除</button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ));
                })()}
              </div>
            )}

            {/* ==================== TAB: CONTRACTS ==================== */}
            {activeTab === 'contracts' && (
              <div>
                <div className="flex items-center gap-3 mb-4">
                  <select value={contractFilter.status} onChange={e => setContractFilter(f => ({ ...f, status: e.target.value }))}
                    className="border rounded px-2 py-1.5 text-sm">
                    <option value="">全部狀態</option>
                    {CONTRACT_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                  <select value={contractFilter.propertyId} onChange={e => setContractFilter(f => ({ ...f, propertyId: e.target.value }))}
                    className="border rounded px-2 py-1.5 text-sm">
                    <option value="">全部物業</option>
                    {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                  <button onClick={fetchContracts} className="bg-teal-600 text-white px-3 py-1.5 rounded text-sm hover:bg-teal-700">查詢</button>
                  <button onClick={() => openContractModal()} className="bg-blue-600 text-white px-3 py-1.5 rounded text-sm hover:bg-blue-700 ml-auto">
                    新增合約
                  </button>
                </div>

                {/* 到期提醒管理 */}
                <div className="mb-4">
                  <button onClick={() => setReminderOpen(o => !o)}
                    className="flex items-center gap-2 text-sm font-medium text-yellow-700 bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-2 hover:bg-yellow-100">
                    <span>🔔 到期提醒管理</span>
                    <span className="text-xs text-yellow-500">{reminderOpen ? '▲ 收起' : '▼ 展開'}</span>
                  </button>
                  {reminderOpen && (() => {
                    const today = new Date().toISOString().split('T')[0];
                    const thresholdDate = new Date(Date.now() + reminderThreshold * 86400000).toISOString().split('T')[0];
                    const expiring = contracts.filter(c => c.status === 'active' && c.endDate >= today && c.endDate <= thresholdDate)
                      .sort((a, b) => a.endDate.localeCompare(b.endDate));
                    return (
                      <div className="mt-2 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                        <div className="flex items-center gap-3 mb-3">
                          <label className="text-sm text-gray-600">提醒天數：</label>
                          {[30, 45, 60, 90].map(d => (
                            <button key={d} onClick={() => setReminderThreshold(d)}
                              className={`text-xs px-3 py-1 rounded-full ${reminderThreshold === d ? 'bg-yellow-500 text-white' : 'bg-white border text-gray-600 hover:bg-yellow-100'}`}>
                              {d} 天
                            </button>
                          ))}
                          <span className="text-xs text-gray-400 ml-2">共 {expiring.length} 筆合約在 {reminderThreshold} 天內到期</span>
                        </div>
                        {expiring.length === 0 ? (
                          <p className="text-sm text-gray-400 py-2">{reminderThreshold} 天內無即將到期合約</p>
                        ) : (
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="text-xs text-gray-500 border-b">
                                <th className="text-left pb-1">物業</th>
                                <th className="text-left pb-1">租客</th>
                                <th className="text-right pb-1">到期日</th>
                                <th className="text-right pb-1">剩餘天數</th>
                                <th className="text-center pb-1">上次提醒</th>
                                <th className="text-center pb-1">操作</th>
                              </tr>
                            </thead>
                            <tbody>
                              {expiring.map(c => {
                                const days = Math.ceil((new Date(c.endDate) - new Date(today)) / 86400000);
                                const lastReminder = reminderSentDates[c.id];
                                return (
                                  <tr key={c.id} className="border-b border-yellow-100">
                                    <td className="py-1.5 text-gray-800">{c.propertyName}</td>
                                    <td className="py-1.5 text-gray-600">{c.tenantName}</td>
                                    <td className="py-1.5 text-right text-gray-700">{c.endDate}</td>
                                    <td className="py-1.5 text-right">
                                      <span className={`text-xs px-1.5 py-0.5 rounded ${days <= 30 ? 'bg-red-100 text-red-700 font-semibold' : 'bg-yellow-100 text-yellow-700'}`}>{days} 天</span>
                                    </td>
                                    <td className="py-1.5 text-center text-xs text-gray-400">
                                      {lastReminder ? lastReminder : <span className="text-gray-300">—</span>}
                                    </td>
                                    <td className="py-1.5 text-center">
                                      <button onClick={() => markReminderSent(c.id)}
                                        className="text-xs text-teal-600 hover:text-teal-800 mr-2">已提醒</button>
                                      {lastReminder && <button onClick={() => clearReminder(c.id)} className="text-xs text-gray-400 hover:text-gray-600">清除</button>}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        )}
                      </div>
                    );
                  })()}
                </div>

                <div className="bg-white rounded-lg shadow overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-teal-50">
                      <tr>
                        <th className="text-left px-3 py-2">合約編號</th>
                        <th className="text-left px-3 py-2">物業</th>
                        <th className="text-left px-3 py-2">租客</th>
                        <th className="text-left px-3 py-2">期間</th>
                        <th className="text-right px-3 py-2">月租</th>
                        <th className="text-right px-3 py-2">押金</th>
                        <th className="text-center px-3 py-2">押金狀態</th>
                        <th className="text-center px-3 py-2">狀態</th>
                        <th className="text-center px-3 py-2">操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {contracts.length === 0 ? (
                        <tr><td colSpan={9} className="text-center py-8 text-gray-400">暫無資料</td></tr>
                      ) : contracts.map(c => {
                        const today = new Date().toISOString().split('T')[0];
                        const daysToExpire = Math.ceil((new Date(c.endDate) - new Date()) / (1000 * 60 * 60 * 24));
                        const isExpiring = c.status === 'active' && daysToExpire <= 60 && daysToExpire > 0;

                        return (
                          <tr key={c.id} className={`border-t hover:bg-gray-50 ${isExpiring ? 'bg-yellow-50' : ''}`}>
                            <td className="px-3 py-2 font-mono text-xs">
                              {c.contractNo}
                              {c.previousContractId && <span className="ml-1 text-[10px] px-1 py-0.5 rounded bg-teal-100 text-teal-700 font-normal">續</span>}
                            </td>
                            <td className="px-3 py-2">{c.propertyName}</td>
                            <td className="px-3 py-2">{c.tenantName}</td>
                            <td className="px-3 py-2 text-xs">
                              {c.startDate} ~ {c.endDate}
                              {isExpiring && <span className="ml-1 text-yellow-600 font-medium">({daysToExpire}天到期)</span>}
                            </td>
                            <td className="px-3 py-2 text-right">${fmt(c.monthlyRent)}</td>
                            <td className="px-3 py-2 text-right">${fmt(c.depositAmount)}</td>
                            <td className="px-3 py-2 text-center">
                              {Number(c.depositAmount) > 0 ? (
                                <div className="flex items-center justify-center gap-1">
                                  {c.depositReceived
                                    ? <span className="text-xs text-green-600">已收</span>
                                    : <button onClick={() => handleDepositAction(c.id, 'depositReceive')} className="text-xs text-blue-600 hover:underline">收押金</button>
                                  }
                                  {c.depositReceived && !c.depositRefunded && !c.depositRefundPaymentOrderId && (
                                    <button onClick={() => handleDepositAction(c.id, 'depositRefund')} className="text-xs text-orange-600 hover:underline ml-1">退押金</button>
                                  )}
                                  {c.depositRefundPaymentOrderId && !c.depositRefunded && (
                                    <a href="/cashier" className="text-xs text-teal-600 hover:underline ml-1">待出納</a>
                                  )}
                                  {c.depositRefunded && <span className="text-xs text-gray-500 ml-1">已退</span>}
                                </div>
                              ) : '-'}
                            </td>
                            <td className="px-3 py-2 text-center">
                              <StatusBadge value={c.status} list={CONTRACT_STATUSES} />
                            </td>
                            <td className="px-3 py-2 text-center whitespace-nowrap">
                              <button onClick={() => openContractModal(c)} className="text-blue-600 hover:text-blue-800 text-xs mr-2">編輯</button>
                              {['active', 'expired'].includes(c.status) && (
                                <button onClick={() => openRenewalModal(c)} className="text-teal-600 hover:text-teal-800 text-xs mr-2">續約</button>
                              )}
                              {c.status === 'pending' && (
                                <button onClick={() => deleteContract(c.id)} className="text-red-600 hover:text-red-800 text-xs">刪除</button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ==================== TAB: TAXES ==================== */}
            {activeTab === 'taxes' && (
              <div>
                {/* 年度稅額表格 (一年填一次) */}
                <div className="mb-8">
                  <h3 className="text-base font-semibold text-gray-800 mb-3">年度稅額表格</h3>
                  <div className="flex items-center gap-3 mb-3">
                    <label className="text-sm text-gray-600">年度：</label>
                    <select value={taxTableYear} onChange={e => { setTaxTableYear(Number(e.target.value)); }} className="border rounded px-2 py-1.5 text-sm w-28">
                      {[new Date().getFullYear(), new Date().getFullYear() - 1, new Date().getFullYear() - 2].map(y => (
                        <option key={y} value={y}>{y}</option>
                      ))}
                    </select>
                    <button onClick={fetchTaxTable} className="bg-teal-600 text-white px-3 py-1.5 rounded text-sm hover:bg-teal-700">載入</button>
                    <button onClick={saveTaxTable} disabled={taxTableSaving} className="bg-blue-600 text-white px-3 py-1.5 rounded text-sm hover:bg-blue-700 disabled:opacity-50">{taxTableSaving ? '儲存中…' : '儲存'}</button>
                  </div>
                  <div className="bg-white rounded-lg shadow overflow-x-auto border border-gray-200">
                    <table className="w-full text-sm">
                      <thead className="bg-teal-50">
                        <tr>
                          <th className="text-left px-3 py-2 border-b border-gray-200">門牌</th>
                          <th className="text-right px-3 py-2 border-b border-gray-200">地價稅</th>
                          <th className="text-right px-3 py-2 border-b border-gray-200">房屋稅</th>
                        </tr>
                      </thead>
                      <tbody>
                        {taxTableRows.length === 0 ? (
                          <tr><td colSpan={3} className="px-3 py-6 text-center text-gray-500">載入後顯示</td></tr>
                        ) : taxTableRows.map(r => (
                          <tr key={r.propertyId} className="border-b border-gray-100 hover:bg-gray-50">
                            <td className="px-3 py-2">{r.doorplate}</td>
                            <td className="px-3 py-2">
                              <input type="number" min="0" step="1" value={r.landTax === '' ? '' : r.landTax}
                                onChange={e => setTaxTableRows(prev => prev.map(x => x.propertyId === r.propertyId ? { ...x, landTax: e.target.value === '' ? '' : e.target.value } : x))}
                                className="w-full text-right border rounded px-2 py-1 text-sm" placeholder="0" />
                            </td>
                            <td className="px-3 py-2">
                              <input type="number" min="0" step="1" value={r.houseTax === '' ? '' : r.houseTax}
                                onChange={e => setTaxTableRows(prev => prev.map(x => x.propertyId === r.propertyId ? { ...x, houseTax: e.target.value === '' ? '' : e.target.value } : x))}
                                className="w-full text-right border rounded px-2 py-1 text-sm" placeholder="0" />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* 子視圖切換 */}
                <div className="flex items-center gap-2 mb-4">
                  {[{k:'list',l:'稅款清單'},{k:'calendar',l:'90天待繳提醒'}].map(({k,l})=>(
                    <button key={k} onClick={()=>setTaxView(k)}
                      className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${taxView===k ? 'bg-teal-600 text-white' : 'bg-white border text-gray-600 hover:bg-gray-50'}`}>
                      {l}
                    </button>
                  ))}
                </div>

                {taxView === 'calendar' && (() => {
                  const today = new Date();
                  const d90 = new Date(today); d90.setDate(d90.getDate() + 90);
                  const todayStr = today.toISOString().split('T')[0];
                  const d90Str = d90.toISOString().split('T')[0];
                  const upcoming = taxes.filter(t => t.status === 'pending' && t.dueDate >= todayStr && t.dueDate <= d90Str)
                    .sort((a,b)=>a.dueDate.localeCompare(b.dueDate));
                  const overdue = taxes.filter(t => t.status === 'pending' && t.dueDate < todayStr)
                    .sort((a,b)=>a.dueDate.localeCompare(b.dueDate));
                  const urgency = (dueDate) => {
                    const diff = Math.floor((new Date(dueDate) - today) / 86400000);
                    if (diff <= 7) return { cls: 'bg-red-100 border-red-300 text-red-800', label: `${diff}天後` };
                    if (diff <= 30) return { cls: 'bg-orange-100 border-orange-300 text-orange-800', label: `${diff}天後` };
                    return { cls: 'bg-yellow-50 border-yellow-200 text-yellow-800', label: `${diff}天後` };
                  };
                  return (
                    <div>
                      {overdue.length > 0 && (
                        <div className="mb-4">
                          <h4 className="text-sm font-semibold text-red-700 mb-2">已逾期（{overdue.length} 筆）</h4>
                          <div className="space-y-2">
                            {overdue.map(t=>(
                              <div key={t.id} className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                                <span className="text-xs bg-red-200 text-red-900 px-2 py-0.5 rounded font-semibold">逾期</span>
                                <span className="font-medium text-sm">{t.property?.name}</span>
                                <span className="text-xs text-gray-500">{t.taxYear} {t.taxType}</span>
                                <span className="text-xs text-gray-500">到期日：{t.dueDate}</span>
                                <span className="ml-auto font-bold text-sm">${fmt(t.amount)}</span>
                                <button onClick={()=>openTaxEdit(t)} className="text-blue-600 hover:text-blue-800 text-xs">編輯</button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      <h4 className="text-sm font-semibold text-gray-700 mb-2">未來 90 天（{upcoming.length} 筆）</h4>
                      {upcoming.length === 0 ? (
                        <p className="text-sm text-gray-400 py-4">未來 90 天內無待繳稅款</p>
                      ) : (
                        <div className="space-y-2">
                          {upcoming.map(t=>{
                            const u = urgency(t.dueDate);
                            return (
                              <div key={t.id} className={`flex items-center gap-3 border rounded-lg px-3 py-2 ${u.cls}`}>
                                <span className="text-xs font-semibold w-14 shrink-0">{u.label}</span>
                                <span className="font-medium text-sm">{t.property?.name}</span>
                                <span className="text-xs">{t.taxYear} {t.taxType}</span>
                                <span className="text-xs">到期：{t.dueDate}</span>
                                <span className="ml-auto font-bold text-sm">${fmt(t.amount)}</span>
                                <button onClick={()=>openTaxEdit(t)} className="text-blue-600 hover:text-blue-800 text-xs shrink-0">編輯</button>
                                {t.paymentOrderId
                                  ? <a href="/cashier" className="text-teal-600 hover:text-teal-800 text-xs underline shrink-0">前往出納</a>
                                  : <button onClick={()=>{setPayingTaxId(t.id);setTaxPayForm({accountId:'',paymentDate:new Date().toISOString().split('T')[0]});}}
                                      className="text-teal-600 hover:text-teal-800 text-xs shrink-0">確認繳納</button>
                                }
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })()}

                {taxView === 'list' && (
                  <>
                    <div className="flex items-center gap-3 mb-4">
                      <label className="text-sm text-gray-600">年度:</label>
                      <input type="number" value={taxFilter.taxYear} onChange={e => setTaxFilter(f => ({ ...f, taxYear: e.target.value }))}
                        className="border rounded px-2 py-1.5 w-24 text-sm" />
                      <select value={taxFilter.status} onChange={e => setTaxFilter(f => ({ ...f, status: e.target.value }))}
                        className="border rounded px-2 py-1.5 text-sm">
                        <option value="">全部狀態</option>
                        <option value="pending">待繳</option>
                        <option value="paid">已繳</option>
                      </select>
                      <button onClick={fetchTaxes} className="bg-teal-600 text-white px-3 py-1.5 rounded text-sm hover:bg-teal-700">查詢</button>
                      <button onClick={() => { setEditingTax(null); setTaxForm({ propertyId: '', taxYear: new Date().getFullYear(), taxType: '房屋稅', dueDate: '', amount: '', certNo: '', paidDate: '', note: '' }); setShowTaxModal(true); }} className="bg-blue-600 text-white px-3 py-1.5 rounded text-sm hover:bg-blue-700 ml-auto">
                        新增稅款
                      </button>
                    </div>
                    <div className="bg-white rounded-lg shadow overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-teal-50">
                          <tr>
                            <th className="text-left px-3 py-2">物業</th>
                            <th className="text-center px-3 py-2">年度</th>
                            <th className="text-left px-3 py-2">稅種</th>
                            <th className="text-left px-3 py-2">到期日</th>
                            <th className="text-left px-3 py-2">實繳日</th>
                            <th className="text-left px-3 py-2">憑證號</th>
                            <th className="text-right px-3 py-2">金額</th>
                            <th className="text-center px-3 py-2">狀態</th>
                            <th className="text-center px-3 py-2">操作</th>
                          </tr>
                        </thead>
                        <tbody>
                          {taxes.length === 0 ? (
                            <tr><td colSpan={9} className="text-center py-8 text-gray-400">暫無資料</td></tr>
                          ) : taxes.map(tax => (
                            <tr key={tax.id} className="border-t hover:bg-gray-50">
                              <td className="px-3 py-2">{tax.property?.name}</td>
                              <td className="px-3 py-2 text-center">{tax.taxYear}</td>
                              <td className="px-3 py-2">{tax.taxType}</td>
                              <td className="px-3 py-2">{tax.dueDate}</td>
                              <td className="px-3 py-2 text-gray-500 text-xs">{tax.paidDate || '—'}</td>
                              <td className="px-3 py-2 text-gray-500 text-xs max-w-[100px] truncate" title={tax.certNo || ''}>{tax.certNo || '—'}</td>
                              <td className="px-3 py-2 text-right font-medium">${fmt(tax.amount)}</td>
                              <td className="px-3 py-2 text-center">
                                <span className={`text-xs px-2 py-0.5 rounded ${tax.status === 'paid' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                                  {tax.status === 'paid' ? '已繳' : '待繳'}
                                </span>
                              </td>
                              <td className="px-3 py-2 text-center">
                                <div className="flex items-center justify-center gap-2 flex-wrap">
                                  {tax.status === 'pending' && (
                                    <>
                                      <button onClick={() => openTaxEdit(tax)} className="text-blue-600 hover:text-blue-800 text-xs font-medium">
                                        編輯
                                      </button>
                                      {tax.paymentOrderId ? (
                                        <a href="/cashier" className="text-teal-600 hover:text-teal-800 text-xs font-medium underline">前往出納</a>
                                      ) : (
                                        <button onClick={() => { setPayingTaxId(tax.id); setTaxPayForm({ accountId: '', paymentDate: new Date().toISOString().split('T')[0] }); }}
                                          className="text-teal-600 hover:text-teal-800 text-xs font-medium">
                                          確認繳納
                                        </button>
                                      )}
                                      <button onClick={() => deleteTax(tax)} className="text-red-600 hover:text-red-800 text-xs font-medium">刪除</button>
                                    </>
                                  )}
                                  {tax.status === 'paid' && (
                                    <button onClick={() => openTaxEdit(tax)} className="text-blue-600 hover:text-blue-800 text-xs font-medium">補憑證</button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}

                {/* Inline tax payment */}
                {payingTaxId && (
                  <div className="mt-4 bg-teal-50 border border-teal-200 rounded-lg p-4">
                    <h4 className="font-medium text-teal-800 mb-3">確認繳納稅款</h4>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs text-gray-600">付款帳戶</label>
                        <select value={taxPayForm.accountId} onChange={e => setTaxPayForm(f => ({ ...f, accountId: e.target.value }))}
                          className="w-full border rounded px-2 py-1 text-sm">
                          <option value="">選擇帳戶</option>
                          {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="text-xs text-gray-600">付款日期</label>
                        <input type="date" value={taxPayForm.paymentDate} onChange={e => setTaxPayForm(f => ({ ...f, paymentDate: e.target.value }))}
                          className="w-full border rounded px-2 py-1 text-sm" />
                      </div>
                    </div>
                    <div className="mt-3 flex gap-2">
                      <button onClick={confirmTaxPayment} className="bg-teal-600 text-white px-4 py-1.5 rounded text-sm hover:bg-teal-700">確認</button>
                      <button onClick={() => setPayingTaxId(null)} className="bg-gray-300 text-gray-700 px-4 py-1.5 rounded text-sm hover:bg-gray-400">取消</button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ==================== TAB: RENT FILING ==================== */}
            {activeTab === 'rentFiling' && (
              <div>
                <div className="bg-teal-50 border border-teal-100 rounded-lg px-4 py-3 mb-4 text-sm text-teal-900">
                  <p><strong>年度租金／租賃所得申報總表</strong>（每年一報）。請註記<strong>公益出租人</strong>以利房屋稅／申報類型區別；同一門牌若有兩間承租公司，請新增第二列並填<strong>承租人／租約綁定</strong>以利實收對照。</p>
                </div>
                <div className="flex flex-wrap items-end gap-3 mb-4">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">申報／所得年度</label>
                    <select value={rentFilingYear} onChange={(e) => setRentFilingYear(Number(e.target.value))}
                      className="border rounded-lg px-3 py-1.5 text-sm">
                      {[0, 1, 2, 3].map((d) => {
                        const y = new Date().getFullYear() - d;
                        return <option key={y} value={y}>{y}</option>;
                      })}
                    </select>
                  </div>
                  <button type="button" onClick={() => fetchRentFiling()} disabled={rentFilingLoading}
                    className="px-4 py-1.5 text-sm rounded-lg bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-50">
                    {rentFilingLoading ? '載入…' : '重新整理'}
                  </button>
                  <button type="button" onClick={() => seedRentFilingYear()} disabled={rentFilingLoading}
                    className="px-4 py-1.5 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
                    為全部物業建立草稿
                  </button>
                  <button type="button" onClick={() => openRentFilingModalForNew()}
                    className="px-4 py-1.5 text-sm rounded-lg bg-gray-800 text-white hover:bg-gray-900 ml-auto">
                    新增申報列
                  </button>
                </div>

                <div className="bg-white rounded-xl shadow overflow-x-auto mb-4">
                  <table className="w-full text-sm">
                    <thead className="bg-teal-50 text-teal-900 text-xs">
                      <tr>
                        <th className="px-3 py-2 text-left">列</th>
                        <th className="px-3 py-2 text-left">物業</th>
                        <th className="px-3 py-2 text-left">地址</th>
                        <th className="px-3 py-2 text-left">所有權人／稅籍</th>
                        <th className="px-3 py-2 text-center">公益</th>
                        <th className="px-3 py-2 text-left">承租人／抬頭</th>
                        <th className="px-3 py-2 text-right">申報月租</th>
                        <th className="px-3 py-2 text-center">月數</th>
                        <th className="px-3 py-2 text-right">全年申報</th>
                        <th className="px-3 py-2 text-right">預估房屋稅</th>
                        <th className="px-3 py-2 text-right">當年實收</th>
                        <th className="px-3 py-2 text-left">備註</th>
                        <th className="px-3 py-2 text-center">操作</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {rentFilingLoading ? (
                        <tr><td colSpan={13} className="text-center py-12 text-gray-400">載入中…</td></tr>
                      ) : rentFilingData.rows.length === 0 ? (
                        <tr><td colSpan={13} className="text-center py-12 text-gray-400">尚無資料，可使用「為全部物業建立草稿」或「新增申報列」</td></tr>
                      ) : rentFilingData.rows.map((r) => (
                        <tr key={r.id} className="hover:bg-gray-50">
                          <td className="px-3 py-2 text-xs text-gray-500">{r.slotIndex + 1}</td>
                          <td className="px-3 py-2 font-medium">{r.propertyName}</td>
                          <td className="px-3 py-2 text-xs text-gray-600 max-w-[140px]" title={r.address || ''}>{r.address || '—'}</td>
                          <td className="px-3 py-2 text-xs">
                            <div>{r.ownerName || '—'}</div>
                            <div className="text-gray-400 font-mono">{r.houseTaxRegistrationNo || '—'}</div>
                          </td>
                          <td className="px-3 py-2 text-center">
                            {r.isPublicInterest ? <span className="text-green-700 font-medium">是</span> : <span className="text-gray-400">否</span>}
                          </td>
                          <td className="px-3 py-2 text-xs">
                            <div>{r.lesseeDisplayName || r.contractLesseeName || '—'}</div>
                            {r.contractId && <div className="text-gray-400">租約 #{r.contractId}</div>}
                          </td>
                          <td className="px-3 py-2 text-right">{r.declaredMonthlyRent != null ? `$${fmt(r.declaredMonthlyRent)}` : '—'}</td>
                          <td className="px-3 py-2 text-center">{r.monthsInScope ?? '—'}</td>
                          <td className="px-3 py-2 text-right font-medium">{r.declaredAnnualIncome != null ? `$${fmt(r.declaredAnnualIncome)}` : '—'}</td>
                          <td className="px-3 py-2 text-right text-amber-800">{r.estimatedHouseTax != null ? `$${fmt(r.estimatedHouseTax)}` : '—'}</td>
                          <td className="px-3 py-2 text-right text-indigo-700">${fmt(r.actualAnnualIncome)}</td>
                          <td className="px-3 py-2 text-xs text-gray-500 max-w-[120px]">
                            {r.incomeSplitHint && <span className="text-amber-700 block">{r.incomeSplitHint}</span>}
                            {r.note || ''}
                          </td>
                          <td className="px-3 py-2 text-center whitespace-nowrap">
                            <button type="button" className="text-teal-600 hover:underline text-xs mr-2" onClick={() => openRentFilingModalForEdit(r)}>編輯</button>
                            <button type="button" className="text-red-600 hover:underline text-xs" onClick={() => deleteRentFilingRow(r)}>刪除</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    {rentFilingData.rows.length > 0 && (
                      <tfoot className="bg-gray-50 font-semibold text-sm">
                        <tr>
                          <td colSpan={8} className="px-3 py-2 text-right">合計</td>
                          <td className="px-3 py-2 text-right">${fmt(rentFilingData.totals.declaredAnnual)}</td>
                          <td className="px-3 py-2 text-right">${fmt(rentFilingData.totals.estimatedHouseTax)}</td>
                          <td className="px-3 py-2 text-right">${fmt(rentFilingData.totals.actualAnnual)}</td>
                          <td colSpan={2} />
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              </div>
            )}

            {/* ==================== TAB: MAINTENANCE ==================== */}
            {activeTab === 'maintenance' && (
              <div>
                {/* 維護費分析摘要 */}
                {maintenances.length > 0 && (
                  <div className="bg-white rounded-lg shadow p-4 mb-4">
                    <h3 className="font-semibold text-gray-800 mb-3">維護費分析</h3>
                    <div className="grid grid-cols-3 gap-3 mb-4">
                      <div className="bg-purple-50 rounded-lg p-3 border-l-4 border-purple-500">
                        <p className="text-xs text-gray-500">合計</p>
                        <p className="text-xl font-bold text-purple-700">${fmt(maintenanceAnalysis.total)}</p>
                      </div>
                      <div className="bg-green-50 rounded-lg p-3 border-l-4 border-green-500">
                        <p className="text-xs text-gray-500">已付</p>
                        <p className="text-xl font-bold text-green-700">${fmt(maintenanceAnalysis.paid)}</p>
                      </div>
                      <div className="bg-yellow-50 rounded-lg p-3 border-l-4 border-yellow-500">
                        <p className="text-xs text-gray-500">待出納</p>
                        <p className="text-xl font-bold text-yellow-700">${fmt(maintenanceAnalysis.pending)}</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <h4 className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">依類別</h4>
                        {maintenanceAnalysis.catEntries.map(([cat, amt]) => (
                          <div key={cat} className="flex items-center gap-2 mb-1">
                            <span className="text-xs text-gray-600 w-16">{cat}</span>
                            <div className="flex-1 bg-gray-100 rounded-full h-2">
                              <div className="bg-purple-400 h-2 rounded-full" style={{ width: `${maintenanceAnalysis.total > 0 ? Math.round((amt / maintenanceAnalysis.total) * 100) : 0}%` }} />
                            </div>
                            <span className="text-xs text-gray-700 w-20 text-right">${fmt(amt)}</span>
                            <span className="text-xs text-gray-400 w-10 text-right">{maintenanceAnalysis.total > 0 ? Math.round((amt / maintenanceAnalysis.total) * 100) : 0}%</span>
                          </div>
                        ))}
                      </div>
                      <div>
                        <h4 className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">依物業</h4>
                        {maintenanceAnalysis.propEntries.slice(0, 8).map(([pname, amt]) => (
                          <div key={pname} className="flex items-center gap-2 mb-1">
                            <span className="text-xs text-gray-600 w-24 truncate" title={pname}>{pname}</span>
                            <div className="flex-1 bg-gray-100 rounded-full h-2">
                              <div className="bg-teal-400 h-2 rounded-full" style={{ width: `${maintenanceAnalysis.total > 0 ? Math.round((amt / maintenanceAnalysis.total) * 100) : 0}%` }} />
                            </div>
                            <span className="text-xs text-gray-700 w-20 text-right">${fmt(amt)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
                <div className="flex items-center gap-3 mb-4">
                  <select value={maintenanceFilter.category} onChange={e => setMaintenanceFilter(f => ({ ...f, category: e.target.value }))}
                    className="border rounded px-2 py-1.5 text-sm">
                    <option value="">全部類別</option>
                    {MAINTENANCE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <select value={maintenanceFilter.status} onChange={e => setMaintenanceFilter(f => ({ ...f, status: e.target.value }))}
                    className="border rounded px-2 py-1.5 text-sm">
                    <option value="">全部狀態</option>
                    <option value="pending">待付</option>
                    <option value="paid">已付</option>
                  </select>
                  <button onClick={fetchMaintenances} className="bg-teal-600 text-white px-3 py-1.5 rounded text-sm hover:bg-teal-700">查詢</button>
                  <button onClick={() => {
                    setEditingMaintenance(null);
                    setMaintenanceForm({ propertyId: '', maintenanceDate: new Date().toISOString().split('T')[0], category: '水電', amount: '', accountingSubjectId: '', accountId: '', isEmployeeAdvance: false, advancedBy: '', advancePaymentMethod: '現金', isCapitalized: false, isRecurring: false, note: '' });
                    setShowMaintenanceModal(true);
                  }}
                    className="bg-blue-600 text-white px-3 py-1.5 rounded text-sm hover:bg-blue-700 ml-auto">
                    新增維護
                  </button>
                </div>

                <div className="bg-white rounded-lg shadow overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-teal-50">
                      <tr>
                        <th className="text-left px-3 py-2">物業</th>
                        <th className="text-left px-3 py-2">日期</th>
                        <th className="text-left px-3 py-2">類別</th>
                        <th className="text-right px-3 py-2">金額</th>
                        <th className="text-left px-3 py-2">備註</th>
                        <th className="text-center px-3 py-2">狀態</th>
                        <th className="text-center px-3 py-2">操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {maintenances.length === 0 ? (
                        <tr><td colSpan={7} className="text-center py-8 text-gray-400">暫無資料</td></tr>
                      ) : maintenances.map(m => (
                        <tr key={m.id} className="border-t hover:bg-gray-50">
                          <td className="px-3 py-2">{m.property?.name}</td>
                          <td className="px-3 py-2">{m.maintenanceDate}</td>
                          <td className="px-3 py-2">{m.category}</td>
                          <td className="px-3 py-2 text-right font-medium">${fmt(m.amount)}</td>
                          <td className="px-3 py-2 text-gray-500 text-xs">
                            {m.isEmployeeAdvance && <span className="inline-block bg-purple-100 text-purple-800 text-xs px-1.5 py-0.5 rounded mr-1">代墊:{m.advancedBy}{m.advancePaymentMethod === '信用卡' ? '(卡)' : ''}</span>}
                            {m.note || '-'}
                          </td>
                          <td className="px-3 py-2 text-center">
                            <span className={`text-xs px-2 py-0.5 rounded ${m.status === 'paid' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                              {m.status === 'paid' ? '已付' : '待出納'}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-center">
                            {m.status === 'pending' && (
                              <>
                                <a href="/cashier" className="text-blue-600 hover:text-blue-800 text-xs font-medium mr-2">出納</a>
                                <button onClick={() => {
                                  setEditingMaintenance(m);
                                  setMaintenanceForm({
                                    propertyId: String(m.propertyId),
                                    maintenanceDate: m.maintenanceDate,
                                    category: m.category,
                                    amount: String(m.amount),
                                    accountingSubjectId: m.accountingSubjectId ? String(m.accountingSubjectId) : '',
                                    accountId: '',
                                    isEmployeeAdvance: !!m.isEmployeeAdvance,
                                    advancedBy: m.advancedBy || '',
                                    advancePaymentMethod: m.advancePaymentMethod || '現金',
                                    isCapitalized: !!m.isCapitalized,
                                    isRecurring: !!m.isRecurring,
                                    note: m.note || ''
                                  });
                                  setShowMaintenanceModal(true);
                                }} className="text-teal-600 hover:text-teal-800 text-xs font-medium mr-2">編輯</button>
                                <button onClick={() => deleteMaintenance(m)} className="text-red-600 hover:text-red-800 text-xs font-medium">刪除</button>
                              </>
                            )}
                            {m.status === 'paid' && <span className="text-xs text-gray-400">—</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ==================== TAB: 水電收入 ==================== */}
            {activeTab === 'utilityIncome' && (
              <div>
                <div className="flex items-center gap-3 mb-4 flex-wrap">
                  <label className="text-sm text-gray-600">年月：</label>
                  <select value={utilityFilter.year} onChange={e => setUtilityFilter(f => ({ ...f, year: Number(e.target.value) }))} className="border rounded px-2 py-1.5 text-sm">
                    {[new Date().getFullYear(), new Date().getFullYear() - 1].map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                  <span className="text-sm">年</span>
                  <select value={utilityFilter.month} onChange={e => setUtilityFilter(f => ({ ...f, month: Number(e.target.value) }))} className="border rounded px-2 py-1.5 text-sm">
                    {[1,2,3,4,5,6,7,8,9,10,11,12].map(m => <option key={m} value={m}>{m}月</option>)}
                  </select>
                  <button onClick={fetchUtilityList} className="bg-teal-600 text-white px-3 py-1.5 rounded text-sm hover:bg-teal-700">查詢</button>
                  <button onClick={() => { setBulkUtilityYear(utilityFilter.year); setBulkUtilityMonth(utilityFilter.month); openBulkUtility(); }}
                    className="bg-teal-600 text-white px-3 py-1.5 rounded text-sm hover:bg-teal-700 ml-auto">
                    批次輸入電費
                  </button>
                  <button onClick={() => { setEditingUtility(null); setUtilityForm({ propertyId: '', incomeYear: utilityFilter.year, incomeMonth: utilityFilter.month, expectedAmount: '', actualAmount: '', actualDate: '', accountId: '', note: '' }); setShowUtilityModal(true); }}
                    className="bg-blue-600 text-white px-3 py-1.5 rounded text-sm hover:bg-blue-700">
                    單筆登記
                  </button>
                </div>
                <p className="text-sm text-gray-600 mb-2">物業每月向租客收取之水電等費用，在此登記為收入。</p>
                <div className="bg-white rounded-lg shadow overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-teal-50">
                      <tr>
                        <th className="text-left px-3 py-2">物業</th>
                        <th className="text-center px-3 py-2">年月</th>
                        <th className="text-right px-3 py-2">應收</th>
                        <th className="text-right px-3 py-2">實收</th>
                        <th className="text-center px-3 py-2">狀態</th>
                        <th className="text-center px-3 py-2">操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {utilityList.length === 0 ? (
                        <tr><td colSpan={6} className="text-center py-8 text-gray-400">暫無資料</td></tr>
                      ) : utilityList.map(u => (
                        <tr key={u.id} className="border-t hover:bg-gray-50">
                          <td className="px-3 py-2">{u.propertyName}</td>
                          <td className="px-3 py-2 text-center">{u.incomeYear}/{u.incomeMonth}</td>
                          <td className="px-3 py-2 text-right">${fmt(u.expectedAmount)}</td>
                          <td className="px-3 py-2 text-right">{u.actualAmount != null ? `$${fmt(u.actualAmount)}` : '-'}</td>
                          <td className="px-3 py-2 text-center">
                            <span className={`text-xs px-2 py-0.5 rounded ${u.status === 'completed' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                              {u.status === 'completed' ? '已收' : '待收'}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-center">
                            <button onClick={() => deleteUtility(u.id)} className="text-red-600 hover:text-red-800 text-xs">刪除</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* 批次輸入電費 panel */}
                {showBulkUtility && (
                  <div className="mt-4 bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="font-semibold text-blue-800">批次輸入電費應收</h4>
                      <div className="flex items-center gap-2">
                        <select value={bulkUtilityYear} onChange={e => setBulkUtilityYear(Number(e.target.value))} className="border rounded px-2 py-1 text-sm">
                          {[new Date().getFullYear(), new Date().getFullYear() - 1].map(y => <option key={y} value={y}>{y}</option>)}
                        </select>
                        <span className="text-sm text-blue-700">年</span>
                        <select value={bulkUtilityMonth} onChange={e => setBulkUtilityMonth(Number(e.target.value))} className="border rounded px-2 py-1 text-sm">
                          {[1,2,3,4,5,6,7,8,9,10,11,12].map(m => <option key={m} value={m}>{m}月</option>)}
                        </select>
                        <button onClick={openBulkUtility} className="text-xs text-blue-600 underline">重新載入</button>
                      </div>
                    </div>
                    {bulkUtilityEntries.length === 0 ? (
                      <p className="text-sm text-gray-500 py-4">無需收電費的物業。請在「物業管理」中勾選「需向租客收取水電費」。</p>
                    ) : (
                      <>
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 mb-3">
                          {bulkUtilityEntries.map((entry, idx) => (
                            <div key={entry.propertyId} className="flex items-center gap-2 bg-white border rounded px-2 py-1.5">
                              <span className="text-sm text-gray-700 flex-1 truncate">{entry.propertyName}</span>
                              <span className="text-xs text-gray-400">$</span>
                              <input
                                type="number" min="0" step="1"
                                value={entry.expectedAmount}
                                onChange={e => setBulkUtilityEntries(prev => prev.map((en, i) => i === idx ? { ...en, expectedAmount: e.target.value } : en))}
                                className="w-24 border rounded px-2 py-0.5 text-sm text-right"
                                placeholder="金額"
                              />
                            </div>
                          ))}
                        </div>
                        <p className="text-xs text-blue-500 mb-3">留空的物業不儲存；已有紀錄的會更新應收金額。</p>
                        <div className="flex gap-2">
                          <button onClick={saveBulkUtility} disabled={bulkUtilitySaving}
                            className="bg-blue-600 text-white px-4 py-1.5 rounded text-sm hover:bg-blue-700 disabled:opacity-50">
                            {bulkUtilitySaving ? '儲存中…' : '儲存全部'}
                          </button>
                          <button onClick={() => setShowBulkUtility(false)} className="bg-gray-300 text-gray-700 px-4 py-1.5 rounded text-sm hover:bg-gray-400">取消</button>
                        </div>
                      </>
                    )}
                  </div>
                )}

                {/* Modal: 水電收入 */}
                {showUtilityModal && (
                  <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowUtilityModal(false)}>
                    <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
                      <div className="p-6">
                        <h3 className="text-lg font-bold text-gray-800 mb-4">登記水電收入</h3>
                        <div className="space-y-3">
                          <div>
                            <label className="text-sm text-gray-600">物業 *</label>
                            <select value={utilityForm.propertyId} onChange={e => setUtilityForm(f => ({ ...f, propertyId: e.target.value }))}
                              className="w-full border rounded px-3 py-2 text-sm">
                              <option value="">選擇物業</option>
                              {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                            </select>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="text-sm text-gray-600">年份</label>
                              <input type="number" value={utilityForm.incomeYear} onChange={e => setUtilityForm(f => ({ ...f, incomeYear: e.target.value }))} className="w-full border rounded px-3 py-2 text-sm" />
                            </div>
                            <div>
                              <label className="text-sm text-gray-600">月份</label>
                              <select value={utilityForm.incomeMonth} onChange={e => setUtilityForm(f => ({ ...f, incomeMonth: Number(e.target.value) }))} className="w-full border rounded px-3 py-2 text-sm">
                                {[1,2,3,4,5,6,7,8,9,10,11,12].map(m => <option key={m} value={m}>{m}</option>)}
                              </select>
                            </div>
                          </div>
                          <div>
                            <label className="text-sm text-gray-600">應收金額</label>
                            <input type="number" min="0" step="0.01" value={utilityForm.expectedAmount} onChange={e => setUtilityForm(f => ({ ...f, expectedAmount: e.target.value }))} className="w-full border rounded px-3 py-2 text-sm" />
                          </div>
                          <div>
                            <label className="text-sm text-gray-600">實收金額（已收再填）</label>
                            <input type="number" min="0" step="0.01" value={utilityForm.actualAmount} onChange={e => setUtilityForm(f => ({ ...f, actualAmount: e.target.value }))} className="w-full border rounded px-3 py-2 text-sm" />
                          </div>
                          <div>
                            <label className="text-sm text-gray-600">收款日期</label>
                            <input type="date" value={utilityForm.actualDate} onChange={e => setUtilityForm(f => ({ ...f, actualDate: e.target.value }))} className="w-full border rounded px-3 py-2 text-sm" />
                          </div>
                          <div>
                            <label className="text-sm text-gray-600">收款帳戶</label>
                            <select value={utilityForm.accountId} onChange={e => setUtilityForm(f => ({ ...f, accountId: e.target.value }))} className="w-full border rounded px-3 py-2 text-sm">
                              <option value="">選擇帳戶</option>
                              {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                            </select>
                          </div>
                          <div>
                            <label className="text-sm text-gray-600">備註</label>
                            <input type="text" value={utilityForm.note} onChange={e => setUtilityForm(f => ({ ...f, note: e.target.value }))} className="w-full border rounded px-3 py-2 text-sm" />
                          </div>
                        </div>
                        <div className="flex justify-end gap-2 mt-6">
                          <button onClick={() => setShowUtilityModal(false)} className="px-4 py-2 text-sm bg-gray-200 rounded hover:bg-gray-300">取消</button>
                          <button onClick={saveUtility} disabled={utilitySaving} className="px-4 py-2 text-sm bg-teal-600 text-white rounded hover:bg-teal-700 disabled:opacity-50">{utilitySaving ? '儲存中…' : '儲存'}</button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ==================== TAB: 分析報表（收入／營運／逾期／空置／押金）==================== */}
            {activeTab === 'analytics' && (
              <div>
                <div className="no-print flex flex-wrap gap-2 mb-6 border-b border-gray-100 pb-4">
                  {ANALYTICS_SUB_LABELS.map(({ key, label }) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => switchAnalyticsSub(key)}
                      className={`px-4 py-2 text-sm font-medium rounded-lg border transition-colors whitespace-nowrap ${
                        analyticsSub === key
                          ? 'bg-teal-600 text-white border-teal-600 shadow-sm'
                          : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50 hover:border-gray-300'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

            {analyticsSub === 'income' && (
              <div className="rental-report-print-area">
                <div className="no-print flex items-center gap-3 mb-4 flex-wrap">
                  <label className="text-sm">年份：</label>
                  <select value={reportYear} onChange={e => setReportYear(Number(e.target.value))} className="border rounded px-2 py-1.5 text-sm">
                    {[new Date().getFullYear(), new Date().getFullYear() - 1, new Date().getFullYear() - 2].map(y => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                  <span className="text-gray-400 text-xs">或</span>
                  <label className="text-sm">日期區間：</label>
                  <input type="date" value={reportStartDate} onChange={e => setReportStartDate(e.target.value)} className="border rounded px-2 py-1.5 text-sm" />
                  <span className="text-sm">～</span>
                  <input type="date" value={reportEndDate} onChange={e => setReportEndDate(e.target.value)} className="border rounded px-2 py-1.5 text-sm" />
                  <label className="text-sm">類別：</label>
                  <select value={reportCategoryFilter} onChange={e => setReportCategoryFilter(e.target.value)} className="border rounded px-2 py-1.5 text-sm min-w-[140px]">
                    <option value="">全部</option>
                    {reportCategoryOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                  <button onClick={fetchIncomeReport} disabled={reportLoading} className="bg-teal-600 text-white px-3 py-1.5 rounded text-sm hover:bg-teal-700 disabled:opacity-50">查詢</button>
                  <button onClick={() => window.print()} className="bg-gray-700 text-white px-3 py-1.5 rounded text-sm hover:bg-gray-800 no-print">列印</button>
                </div>
                <h2 className="text-lg font-bold text-gray-800 mb-2 print:block">租屋收入分析報表 — {incomeReportData.year || reportYear} 年</h2>
                {reportLoading ? (
                  <p className="text-gray-500">載入中...</p>
                ) : (
                  <div className="bg-white rounded-lg shadow overflow-x-auto overflow-y-auto">
                    <table className="w-full text-sm border-collapse">
                      <thead className="bg-teal-50">
                        <tr>
                          <th className="text-left px-3 py-2 border border-gray-200">房號</th>
                          {[1,2,3,4,5,6,7,8,9,10,11,12].map(m => (
                            <th key={m} className="text-right px-2 py-2 border border-gray-200 whitespace-nowrap">{incomeReportData.year || reportYear}/{m}</th>
                          ))}
                          <th className="text-right px-3 py-2 border border-gray-200 font-semibold">總和</th>
                        </tr>
                      </thead>
                      <tbody>
                        {incomeReportData.rows.length === 0 ? (
                          <tr><td colSpan={14} className="px-3 py-4 text-gray-500 text-center">尚無資料</td></tr>
                        ) : (
                          incomeReportData.rows.map(r => (
                            <tr key={r.propertyId} className="hover:bg-gray-50">
                              <td className="px-3 py-2 border border-gray-200">{r.tenantName ? `${r.propertyLabel}(${r.tenantName})` : r.propertyLabel}</td>
                              {[1,2,3,4,5,6,7,8,9,10,11,12].map(m => {
                                const st = r.monthStatus?.[m] || 'empty';
                                const actual = r.months[m] || 0;
                                const expected = r.monthsExpected?.[m] || 0;
                                const cellBg = st === 'completed' ? 'bg-green-50 text-green-800'
                                  : st === 'partial' ? 'bg-orange-50 text-orange-800'
                                  : st === 'overdue' ? 'bg-red-50 text-red-700'
                                  : st === 'pending' ? 'bg-yellow-50 text-yellow-800'
                                  : '';
                                return (
                                  <td key={m} className={`text-right px-2 py-2 border border-gray-200 align-top ${cellBg}`}>
                                    {st === 'completed' && <div className="font-medium">{fmt(actual)}</div>}
                                    {st === 'partial' && (
                                      <div>
                                        <div className="font-medium">{fmt(actual)}</div>
                                        <div className="text-xs opacity-60">應收 {fmt(expected)}</div>
                                      </div>
                                    )}
                                    {(st === 'pending' || st === 'overdue') && (
                                      <div>
                                        <div className="text-xs font-semibold">{st === 'overdue' ? '逾期' : '待收'}</div>
                                        <div className="text-xs">{fmt(expected)}</div>
                                      </div>
                                    )}
                                    {st === 'empty' && ''}
                                  </td>
                                );
                              })}
                              <td className="text-right px-3 py-2 border border-gray-200 font-semibold">{fmt(r.total)}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
                {!reportLoading && incomeReportData.rows.length > 0 && (
                  <div className="flex flex-wrap gap-3 mt-2 text-xs no-print">
                    <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded bg-green-200" />已收</span>
                    <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded bg-orange-200" />部分收</span>
                    <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded bg-yellow-200" />待收</span>
                    <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded bg-red-200" />逾期未收</span>
                  </div>
                )}
              </div>
            )}

            {analyticsSub === 'operating' && (
              <div className="rental-report-print-area">
                <div className="no-print flex items-center gap-3 mb-4 flex-wrap">
                  <label className="text-sm">年份：</label>
                  <select value={reportYear} onChange={e => setReportYear(Number(e.target.value))} className="border rounded px-2 py-1.5 text-sm">
                    {[new Date().getFullYear(), new Date().getFullYear() - 1, new Date().getFullYear() - 2].map(y => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                  <span className="text-gray-400 text-xs">或</span>
                  <label className="text-sm">日期區間：</label>
                  <input type="date" value={reportStartDate} onChange={e => setReportStartDate(e.target.value)} className="border rounded px-2 py-1.5 text-sm" />
                  <span className="text-sm">～</span>
                  <input type="date" value={reportEndDate} onChange={e => setReportEndDate(e.target.value)} className="border rounded px-2 py-1.5 text-sm" />
                  <label className="text-sm">類別：</label>
                  <select value={reportCategoryFilter} onChange={e => setReportCategoryFilter(e.target.value)} className="border rounded px-2 py-1.5 text-sm min-w-[140px]">
                    <option value="">全部</option>
                    {reportCategoryOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                  <button onClick={fetchOperatingReport} disabled={reportLoading} className="bg-teal-600 text-white px-3 py-1.5 rounded text-sm hover:bg-teal-700 disabled:opacity-50">查詢</button>
                  <button onClick={() => window.print()} className="bg-gray-700 text-white px-3 py-1.5 rounded text-sm hover:bg-gray-800 no-print">列印</button>
                </div>
                <h2 className="text-lg font-bold text-gray-800 mb-2 print:block">物業營運狀況分析報表 — {operatingReportData.year || reportYear} 年</h2>
                <p className="text-sm text-gray-600 mb-2 no-print">收租金額、維修、房務稅/地價稅等支出，淨利與淨利率（投報率需物業成本，可於設定中維護後顯示）。</p>
                {reportLoading ? (
                  <p className="text-gray-500">載入中...</p>
                ) : (
                  <div className="bg-white rounded-lg shadow overflow-x-auto">
                    <table className="w-full text-sm border-collapse">
                      <thead className="bg-teal-50">
                        <tr>
                          <th className="text-left px-3 py-2 border border-gray-200">物業</th>
                          <th className="text-right px-3 py-2 border border-gray-200">收租金額</th>
                          <th className="text-right px-3 py-2 border border-gray-200">維修金額</th>
                          <th className="text-right px-3 py-2 border border-gray-200">房務稅/地價稅</th>
                          <th className="text-right px-3 py-2 border border-gray-200">總支出</th>
                          <th className="text-right px-3 py-2 border border-gray-200">淨利</th>
                          <th className="text-right px-3 py-2 border border-gray-200">淨利率 %</th>
                        </tr>
                      </thead>
                      <tbody>
                        {operatingReportData.rows.length === 0 ? (
                          <tr><td colSpan={7} className="px-3 py-4 text-gray-500 text-center">尚無資料</td></tr>
                        ) : (
                          operatingReportData.rows.map(r => (
                            <tr key={r.propertyId} className="hover:bg-gray-50">
                              <td className="px-3 py-2 border border-gray-200">{r.propertyLabel}</td>
                              <td className="text-right px-3 py-2 border border-gray-200">{fmt(r.rentIncome)}</td>
                              <td className="text-right px-3 py-2 border border-gray-200">{fmt(r.maintenanceAmount)}</td>
                              <td className="text-right px-3 py-2 border border-gray-200">{fmt(r.taxAmount)}</td>
                              <td className="text-right px-3 py-2 border border-gray-200">{fmt(r.totalExpense)}</td>
                              <td className={`text-right px-3 py-2 border border-gray-200 font-medium ${r.netProfit >= 0 ? 'text-green-700' : 'text-red-700'}`}>{fmt(r.netProfit)}</td>
                              <td className="text-right px-3 py-2 border border-gray-200">{r.profitMarginPercent != null ? `${r.profitMarginPercent}%` : '-'}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {analyticsSub === 'overdue' && (
              <div className="rental-report-print-area">
                <div className="no-print flex items-center gap-3 mb-4 flex-wrap">
                  <h3 className="text-base font-semibold text-gray-800">逾期租金催繳報表</h3>
                  <span className="text-sm text-gray-500">（所有到期日已過、尚未收款的租金）</span>
                  <button onClick={fetchOverdueReport} disabled={overdueReportLoading}
                    className="bg-teal-600 text-white px-3 py-1.5 rounded text-sm hover:bg-teal-700 disabled:opacity-50 ml-auto">
                    {overdueReportLoading ? '載入中…' : '重新整理'}
                  </button>
                  <button onClick={() => window.print()} className="bg-gray-700 text-white px-3 py-1.5 rounded text-sm hover:bg-gray-800">列印 / 匯出</button>
                </div>
                <h2 className="hidden print:block text-lg font-bold mb-2">逾期租金催繳報表 — 列印日期：{new Date().toLocaleDateString('zh-TW')}</h2>

                {overdueReportLoading ? (
                  <p className="text-gray-500 py-6 text-center">載入中…</p>
                ) : overdueReportData.length === 0 ? (
                  <div className="bg-white rounded-lg shadow py-12 text-center text-gray-400">
                    目前沒有逾期未收的租金
                  </div>
                ) : (
                  <>
                    <div className="no-print flex gap-4 mb-3 text-sm">
                      <span className="bg-red-50 text-red-700 px-3 py-1.5 rounded-lg font-medium">
                        共 {overdueReportData.length} 筆逾期
                      </span>
                      <span className="bg-red-50 text-red-700 px-3 py-1.5 rounded-lg">
                        逾期總金額：<b>${fmt(overdueReportData.reduce((s, i) => s + Number(i.expectedAmount || 0), 0))}</b>
                      </span>
                    </div>
                    <div className="bg-white rounded-lg shadow overflow-x-auto">
                      <table className="w-full text-sm border-collapse">
                        <thead className="bg-red-50">
                          <tr>
                            <th className="text-left px-3 py-2 border border-gray-200">物業</th>
                            <th className="text-left px-3 py-2 border border-gray-200">租客</th>
                            <th className="text-left px-3 py-2 border border-gray-200">聯絡電話</th>
                            <th className="text-center px-3 py-2 border border-gray-200">租期</th>
                            <th className="text-right px-3 py-2 border border-gray-200">應收金額</th>
                            <th className="text-center px-3 py-2 border border-gray-200">到期日</th>
                            <th className="text-right px-3 py-2 border border-gray-200 text-red-700">逾期天數</th>
                            <th className="text-center px-3 py-2 border border-gray-200 no-print">操作</th>
                          </tr>
                        </thead>
                        <tbody>
                          {overdueReportData.map((i, idx) => {
                            const today = new Date().toISOString().split('T')[0];
                            const daysOverdue = Math.floor((new Date(today) - new Date(i.dueDate)) / 86400000);
                            const tenantPhone = i.tenant?.phone || '—';
                            const tenantName = i.tenantName || (i.tenant?.tenantType === 'company' ? i.tenant?.companyName : i.tenant?.fullName) || '—';
                            return (
                              <tr key={i.id} className={`border-t ${idx % 2 === 0 ? 'bg-white' : 'bg-red-50/30'}`}>
                                <td className="px-3 py-2 border border-gray-200">{i.propertyName}</td>
                                <td className="px-3 py-2 border border-gray-200 font-medium">{tenantName}</td>
                                <td className="px-3 py-2 border border-gray-200 text-gray-600">{tenantPhone}</td>
                                <td className="px-3 py-2 border border-gray-200 text-center text-gray-500">{i.incomeYear}/{String(i.incomeMonth).padStart(2,'0')}</td>
                                <td className="px-3 py-2 border border-gray-200 text-right font-medium">${fmt(i.expectedAmount)}</td>
                                <td className="px-3 py-2 border border-gray-200 text-center">{i.dueDate}</td>
                                <td className="px-3 py-2 border border-gray-200 text-right">
                                  <span className={`px-2 py-0.5 rounded text-xs font-semibold ${daysOverdue > 30 ? 'bg-red-200 text-red-800' : 'bg-orange-100 text-orange-800'}`}>
                                    {daysOverdue} 天
                                  </span>
                                </td>
                                <td className="px-3 py-2 border border-gray-200 text-center no-print">
                                  <button onClick={() => { switchTab('cashier'); }}
                                    className="text-teal-600 hover:text-teal-800 text-xs underline">
                                    前往收款
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                          <tr className="bg-red-100 font-semibold">
                            <td className="px-3 py-2 border border-gray-200" colSpan={4}>合計</td>
                            <td className="px-3 py-2 border border-gray-200 text-right text-red-700">${fmt(overdueReportData.reduce((s, i) => s + Number(i.expectedAmount || 0), 0))}</td>
                            <td className="px-3 py-2 border border-gray-200" colSpan={3}></td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </div>
            )}

            {analyticsSub === 'deposit' && (() => {
              const depositContracts = contracts.filter(c => Number(c.depositAmount) > 0);
              const filtered = depositFilter === 'all' ? depositContracts
                : depositFilter === 'pending_receive' ? depositContracts.filter(c => !c.depositReceived)
                : depositFilter === 'received' ? depositContracts.filter(c => c.depositReceived && !c.depositRefunded)
                : depositFilter === 'refunded' ? depositContracts.filter(c => c.depositRefunded)
                : depositContracts;
              const totalHeld = depositContracts.filter(c => c.depositReceived && !c.depositRefunded)
                .reduce((s, c) => s + Number(c.depositAmount || 0), 0);
              const pendingReceive = depositContracts.filter(c => !c.depositReceived).length;
              const pendingRefund = depositContracts.filter(c => c.depositRefundPaymentOrderId && !c.depositRefunded).length;
              return (
                <div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                    <div className="bg-white rounded-lg shadow p-3 border-l-4 border-teal-500">
                      <p className="text-xs text-gray-500">合約筆數</p>
                      <p className="text-xl font-bold text-teal-700">{depositContracts.length}</p>
                    </div>
                    <div className="bg-white rounded-lg shadow p-3 border-l-4 border-green-500">
                      <p className="text-xs text-gray-500">目前持有押金</p>
                      <p className="text-xl font-bold text-green-700">${fmt(totalHeld)}</p>
                    </div>
                    <div className="bg-white rounded-lg shadow p-3 border-l-4 border-blue-500">
                      <p className="text-xs text-gray-500">待收押金</p>
                      <p className="text-xl font-bold text-blue-700">{pendingReceive} 筆</p>
                    </div>
                    <div className="bg-white rounded-lg shadow p-3 border-l-4 border-orange-500">
                      <p className="text-xs text-gray-500">待退押金（已申請）</p>
                      <p className="text-xl font-bold text-orange-700">{pendingRefund} 筆</p>
                    </div>
                  </div>
                  <div className="flex gap-2 mb-3">
                    {[['all', '全部'], ['pending_receive', '待收押金'], ['received', '已收持有中'], ['refunded', '已退']].map(([v, l]) => (
                      <button key={v} onClick={() => setDepositFilter(v)}
                        className={`text-sm px-3 py-1 rounded-full border ${depositFilter === v ? 'bg-teal-600 text-white border-teal-600' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>{l}</button>
                    ))}
                  </div>
                  <div className="bg-white rounded-lg shadow overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-teal-50">
                        <tr>
                          <th className="text-left px-3 py-2">合約號</th>
                          <th className="text-left px-3 py-2">物業</th>
                          <th className="text-left px-3 py-2">租客</th>
                          <th className="text-left px-3 py-2">合約期間</th>
                          <th className="text-right px-3 py-2">月租</th>
                          <th className="text-right px-3 py-2">押金金額</th>
                          <th className="text-center px-3 py-2">收款</th>
                          <th className="text-center px-3 py-2">退款</th>
                          <th className="text-center px-3 py-2">合約狀態</th>
                          <th className="text-center px-3 py-2">操作</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filtered.length === 0 ? (
                          <tr><td colSpan={10} className="text-center py-8 text-gray-400">暫無資料</td></tr>
                        ) : filtered.map(c => (
                          <tr key={c.id} className={`border-t hover:bg-gray-50 ${!c.depositReceived ? 'bg-blue-50/30' : c.depositRefunded ? 'bg-gray-50' : ''}`}>
                            <td className="px-3 py-2 font-mono text-xs">{c.contractNo}</td>
                            <td className="px-3 py-2">{c.propertyName}</td>
                            <td className="px-3 py-2">{c.tenantName}</td>
                            <td className="px-3 py-2 text-xs text-gray-500">{c.startDate} ~ {c.endDate}</td>
                            <td className="px-3 py-2 text-right">${fmt(c.monthlyRent)}</td>
                            <td className="px-3 py-2 text-right font-semibold text-teal-700">${fmt(c.depositAmount)}</td>
                            <td className="px-3 py-2 text-center">
                              {c.depositReceived
                                ? <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">已收</span>
                                : <button onClick={() => handleDepositAction(c.id, 'depositReceive')} className="text-xs text-blue-600 hover:underline">收押金</button>}
                            </td>
                            <td className="px-3 py-2 text-center">
                              {c.depositRefunded
                                ? <span className="text-xs bg-gray-200 text-gray-600 px-2 py-0.5 rounded">已退</span>
                                : c.depositRefundPaymentOrderId
                                  ? <a href="/cashier" className="text-xs text-teal-600 hover:underline">待出納</a>
                                  : c.depositReceived
                                    ? <button onClick={() => handleDepositAction(c.id, 'depositRefund')} className="text-xs text-orange-600 hover:underline">退押金</button>
                                    : <span className="text-gray-300 text-xs">—</span>}
                            </td>
                            <td className="px-3 py-2 text-center">
                              <StatusBadge value={c.status} list={CONTRACT_STATUSES} />
                            </td>
                            <td className="px-3 py-2 text-center">
                              <button onClick={() => { switchTab('contracts'); }} className="text-xs text-teal-600 hover:underline">查看合約</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      {filtered.length > 0 && (
                        <tfoot>
                          <tr className="bg-teal-50 font-semibold">
                            <td colSpan={5} className="px-3 py-2 text-sm">合計</td>
                            <td className="px-3 py-2 text-right text-teal-700">${fmt(filtered.reduce((s, c) => s + Number(c.depositAmount || 0), 0))}</td>
                            <td colSpan={4} />
                          </tr>
                        </tfoot>
                      )}
                    </table>
                  </div>
                </div>
              );
            })()}

            {analyticsSub === 'vacancy' && (
              <div>
                <div className="flex flex-wrap items-center gap-3 mb-4 no-print">
                  <label className="text-sm">年份：</label>
                  <select value={vacancyYear} onChange={e => setVacancyYear(Number(e.target.value))} className="border rounded px-2 py-1.5 text-sm">
                    {[new Date().getFullYear(), new Date().getFullYear() - 1, new Date().getFullYear() - 2].map(y => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                  <button onClick={fetchVacancyReport} disabled={vacancyLoading} className="bg-teal-600 text-white px-3 py-1.5 rounded text-sm hover:bg-teal-700 disabled:opacity-50">查詢</button>
                  <button onClick={() => window.print()} className="bg-gray-700 text-white px-3 py-1.5 rounded text-sm hover:bg-gray-800 no-print">列印</button>
                </div>

                {vacancyLoading ? (
                  <p className="text-gray-500 text-center py-8">載入中…</p>
                ) : (
                  <>
                    {vacancyData.rows.length > 0 && (
                      <div className="grid grid-cols-3 gap-3 mb-4">
                        <div className="bg-white rounded-lg shadow p-3 border-l-4 border-teal-500">
                          <p className="text-xs text-gray-500">物業總數</p>
                          <p className="text-xl font-bold text-teal-700">{vacancyData.rows.length}</p>
                        </div>
                        <div className="bg-white rounded-lg shadow p-3 border-l-4 border-green-500">
                          <p className="text-xs text-gray-500">全年出租</p>
                          <p className="text-xl font-bold text-green-700">{vacancyData.fullyRented} 間</p>
                        </div>
                        <div className="bg-white rounded-lg shadow p-3 border-l-4 border-red-500">
                          <p className="text-xs text-gray-500">平均空置率</p>
                          <p className="text-xl font-bold text-red-700">{vacancyData.avgVacancy}%</p>
                        </div>
                      </div>
                    )}
                    <div className="bg-white rounded-lg shadow overflow-x-auto">
                      <table className="w-full text-sm border-collapse">
                        <thead className="bg-teal-50">
                          <tr>
                            <th className="text-left px-3 py-2 border border-gray-200">物業</th>
                            {[1,2,3,4,5,6,7,8,9,10,11,12].map(m => (
                              <th key={m} className="text-center px-2 py-2 border border-gray-200 text-xs w-10">{m}月</th>
                            ))}
                            <th className="text-right px-3 py-2 border border-gray-200">出租月數</th>
                            <th className="text-right px-3 py-2 border border-gray-200 text-red-700">空置率</th>
                            <th className="text-right px-3 py-2 border border-gray-200">平均月租</th>
                          </tr>
                        </thead>
                        <tbody>
                          {vacancyData.rows.length === 0 ? (
                            <tr><td colSpan={16} className="text-center py-8 text-gray-400">暫無資料，請點擊查詢</td></tr>
                          ) : vacancyData.rows.map(r => (
                            <tr key={r.propertyId} className="hover:bg-gray-50">
                              <td className="px-3 py-2 border border-gray-200 font-medium">{r.propertyLabel}</td>
                              {r.monthRented.map((rented, idx) => (
                                <td key={idx} className={`border border-gray-200 text-center text-xs ${rented ? 'bg-green-100 text-green-800' : 'bg-red-50 text-red-400'}`}>
                                  {rented ? '●' : '○'}
                                </td>
                              ))}
                              <td className="px-3 py-2 border border-gray-200 text-right font-semibold">{r.rentedCount}</td>
                              <td className={`px-3 py-2 border border-gray-200 text-right font-bold ${r.vacancyRate === 0 ? 'text-green-600' : r.vacancyRate >= 50 ? 'text-red-600' : 'text-yellow-600'}`}>
                                {r.vacancyRate}%
                              </td>
                              <td className="px-3 py-2 border border-gray-200 text-right text-gray-600">
                                {r.avgRent > 0 ? `$${fmt(r.avgRent)}` : '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {vacancyData.rows.length > 0 && (
                      <div className="flex gap-4 mt-2 text-xs no-print">
                        <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded bg-green-200" />出租中</span>
                        <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded bg-red-100" />空置</span>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
              </div>
            )}

            {/* ==================== TAB: 付款紀錄 ==================== */}
            {activeTab === 'paymentRecords' && (
              <div>
                <div className="flex flex-wrap items-center gap-3 mb-4">
                  <label className="text-sm text-gray-600">年份：</label>
                  <input type="number" value={paymentFilter.year} onChange={e => setPaymentFilter(f => ({ ...f, year: e.target.value }))}
                    className="border rounded px-2 py-1 w-24 text-sm" />
                  <label className="text-sm text-gray-600">月份：</label>
                  <select value={paymentFilter.month} onChange={e => setPaymentFilter(f => ({ ...f, month: e.target.value }))}
                    className="border rounded px-2 py-1 text-sm">
                    <option value="">全部月份</option>
                    {Array.from({ length: 12 }, (_, i) => (
                      <option key={i + 1} value={i + 1}>{i + 1} 月</option>
                    ))}
                  </select>
                  <label className="text-sm text-gray-600">物業：</label>
                  <select value={paymentFilter.propertyId} onChange={e => setPaymentFilter(f => ({ ...f, propertyId: e.target.value }))}
                    className="border rounded px-2 py-1 text-sm">
                    <option value="">全部物業</option>
                    {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                  <label className="text-sm text-gray-600">收款帳戶：</label>
                  <select value={paymentFilter.accountId} onChange={e => setPaymentFilter(f => ({ ...f, accountId: e.target.value }))}
                    className="border rounded px-2 py-1 text-sm">
                    <option value="">全部收款帳戶</option>
                    {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                  <label className="text-sm text-gray-600">付款方式：</label>
                  <select value={paymentFilter.paymentMethod} onChange={e => setPaymentFilter(f => ({ ...f, paymentMethod: e.target.value }))}
                    className="border rounded px-2 py-1 text-sm">
                    <option value="">全部</option>
                    {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m === 'transfer' ? '轉帳' : m}</option>)}
                  </select>
                  <button onClick={() => fetchPaymentRecords(1)} disabled={paymentLoading}
                    className="bg-teal-600 text-white px-3 py-1 rounded text-sm hover:bg-teal-700 disabled:opacity-50">查詢</button>
                </div>
                {paymentRecords.length > 0 && (
                  <div className="flex gap-4 mb-3 text-sm">
                    <span className="bg-teal-50 px-3 py-1.5 rounded-lg">共 <b>{paymentRecordsPagination.totalCount}</b> 筆</span>
                    <span className="bg-green-50 px-3 py-1.5 rounded-lg text-green-800">
                      合計實收 <b>NT$ {fmt(paymentRecords.reduce((s, p) => s + p.amount, 0))}</b>
                      {paymentRecordsPagination.totalPages > 1 && <span className="text-gray-400 ml-1">（本頁）</span>}
                    </span>
                  </div>
                )}
                <div className="bg-white rounded-lg shadow overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-teal-50">
                      <tr>
                        <th className="text-left px-3 py-2 font-medium text-gray-700">收款日期</th>
                        <th className="text-left px-3 py-2 font-medium text-gray-700">物業</th>
                        <th className="text-left px-3 py-2 font-medium text-gray-700">租客</th>
                        <th className="text-center px-3 py-2 font-medium text-gray-700">租期</th>
                        <th className="text-right px-3 py-2 font-medium text-gray-700">應收金額</th>
                        <th className="text-right px-3 py-2 font-medium text-gray-700 text-teal-800">實收金額</th>
                        <th className="text-center px-3 py-2 font-medium text-gray-700">次序</th>
                        <th className="text-left px-3 py-2 font-medium text-gray-700">付款方式</th>
                        <th className="text-left px-3 py-2 font-medium text-gray-700">收款帳戶</th>
                        <th className="text-left px-3 py-2 font-medium text-gray-700">匯款人/備註</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paymentLoading ? (
                        <tr><td colSpan={10} className="text-center py-8 text-gray-400">載入中…</td></tr>
                      ) : paymentRecords.length === 0 ? (
                        <tr><td colSpan={10} className="text-center py-8 text-gray-400">暫無付款紀錄</td></tr>
                      ) : paymentRecords.map((p, idx) => (
                        <tr key={p.id} className={`border-t hover:bg-gray-50 ${idx % 2 === 0 ? '' : 'bg-gray-50/50'}`}>
                          <td className="px-3 py-2 font-mono text-sm">{p.paymentDate}</td>
                          <td className="px-3 py-2">{p.propertyName}</td>
                          <td className="px-3 py-2">{p.tenantName}</td>
                          <td className="px-3 py-2 text-center text-gray-500">{p.incomeYear}/{String(p.incomeMonth).padStart(2,'0')}</td>
                          <td className="px-3 py-2 text-right text-gray-500">${fmt(p.expectedAmount)}</td>
                          <td className="px-3 py-2 text-right font-semibold text-teal-700">${fmt(p.amount)}</td>
                          <td className="px-3 py-2 text-center text-xs text-gray-500">第{p.sequenceNo}次</td>
                          <td className="px-3 py-2 text-sm">
                            <span className={`px-2 py-0.5 rounded text-xs ${p.paymentMethod === '匯款' || p.paymentMethod === 'transfer' ? 'bg-blue-100 text-blue-800' : p.paymentMethod === '現金' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>
                              {p.paymentMethod === 'transfer' ? '轉帳' : (p.paymentMethod || '—')}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-xs text-gray-500" title={p.accountWarehouse || ''}>
                            {p.accountName || accounts.find(a => a.id === p.accountId)?.name || '—'}
                            {p.accountCode ? <span className="text-gray-400 ml-1">({p.accountCode})</span> : null}
                          </td>
                          <td className="px-3 py-2 text-xs text-gray-500 max-w-[160px] truncate" title={[p.matchBankAccountName, p.matchTransferRef, p.matchNote].filter(Boolean).join(' / ')}>
                            {[p.matchBankAccountName, p.matchNote].filter(Boolean).join(' / ') || '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {paymentRecordsPagination.totalPages > 1 && (
                  <div className="flex justify-center gap-2 mt-4">
                    <button disabled={paymentRecordsPagination.page <= 1}
                      onClick={() => fetchPaymentRecords(paymentRecordsPagination.page - 1)}
                      className="px-3 py-1 text-sm border rounded disabled:opacity-40 hover:bg-gray-50">上一頁</button>
                    <span className="px-3 py-1 text-sm text-gray-600">{paymentRecordsPagination.page} / {paymentRecordsPagination.totalPages}</span>
                    <button disabled={paymentRecordsPagination.page >= paymentRecordsPagination.totalPages}
                      onClick={() => fetchPaymentRecords(paymentRecordsPagination.page + 1)}
                      className="px-3 py-1 text-sm border rounded disabled:opacity-40 hover:bg-gray-50">下一頁</button>
                  </div>
                )}
              </div>
            )}

          </>
        )}
      </div>

      {/* ==================== CONFIRM DIALOG ==================== */}
      {confirmDialog.open && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[70]" onClick={() => setConfirmDialog(d => ({ ...d, open: false }))}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm mx-4 p-6" onClick={e => e.stopPropagation()}>
            <h3 className="font-semibold text-gray-800 mb-2">{confirmDialog.title}</h3>
            <p className="text-sm text-gray-600 mb-6 whitespace-pre-line">{confirmDialog.message}</p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setConfirmDialog(d => ({ ...d, open: false }))}
                className="px-4 py-2 text-sm bg-gray-100 rounded-lg hover:bg-gray-200"
              >取消</button>
              <button
                onClick={() => {
                  setConfirmDialog(d => ({ ...d, open: false }));
                  confirmDialog.onConfirm?.();
                }}
                className={`px-4 py-2 text-sm text-white rounded-lg ${confirmDialog.danger ? 'bg-red-600 hover:bg-red-700' : 'bg-teal-600 hover:bg-teal-700'}`}
              >確定</button>
            </div>
          </div>
        </div>
      )}

      {/* ==================== MODAL: TENANT ==================== */}
      {showTenantModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowTenantModal(false)}>
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="p-6">
              <h3 className="text-lg font-bold text-gray-800 mb-4">{editingTenant ? '編輯租客' : '新增租客'}</h3>
              <div className="space-y-3">
                <div>
                  <label className="text-sm text-gray-600">類型 *</label>
                  <select value={tenantForm.tenantType} onChange={e => setTenantForm(f => ({ ...f, tenantType: e.target.value }))}
                    className="w-full border rounded px-3 py-2 text-sm">
                    <option value="individual">個人</option>
                    <option value="company">公司</option>
                  </select>
                </div>
                {tenantForm.tenantType === 'individual' ? (
                  <div>
                    <label className="text-sm text-gray-600">姓名 *</label>
                    <input type="text" value={tenantForm.fullName} onChange={e => setTenantForm(f => ({ ...f, fullName: e.target.value }))}
                      className="w-full border rounded px-3 py-2 text-sm" />
                  </div>
                ) : (
                  <div>
                    <label className="text-sm text-gray-600">公司名稱 *</label>
                    <input type="text" value={tenantForm.companyName} onChange={e => setTenantForm(f => ({ ...f, companyName: e.target.value }))}
                      className="w-full border rounded px-3 py-2 text-sm" />
                  </div>
                )}
                <div>
                  <label className="text-sm text-gray-600">電話 *</label>
                  <input type="text" value={tenantForm.phone} onChange={e => setTenantForm(f => ({ ...f, phone: e.target.value }))}
                    className="w-full border rounded px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="text-sm text-gray-600">Email</label>
                  <input type="email" value={tenantForm.email} onChange={e => setTenantForm(f => ({ ...f, email: e.target.value }))}
                    className="w-full border rounded px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="text-sm text-gray-600">地址</label>
                  <input type="text" value={tenantForm.address} onChange={e => setTenantForm(f => ({ ...f, address: e.target.value }))}
                    className="w-full border rounded px-3 py-2 text-sm" />
                </div>
                {editingTenant && (
                  <div className="border-t pt-3 mt-3">
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={tenantForm.isBlacklisted || false}
                        onChange={e => setTenantForm(f => ({ ...f, isBlacklisted: e.target.checked }))} />
                      列入黑名單
                    </label>
                    {tenantForm.isBlacklisted && (
                      <div className="mt-2">
                        <label className="text-sm text-gray-600">黑名單原因 *</label>
                        <textarea value={tenantForm.blacklistReason || ''} onChange={e => setTenantForm(f => ({ ...f, blacklistReason: e.target.value }))}
                          className="w-full border rounded px-3 py-2 text-sm" rows={2} />
                      </div>
                    )}
                  </div>
                )}
                <div>
                  <label className="text-sm text-gray-600">備註</label>
                  <textarea value={tenantForm.note} onChange={e => setTenantForm(f => ({ ...f, note: e.target.value }))}
                    className="w-full border rounded px-3 py-2 text-sm" rows={2} />
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-6">
                <button onClick={() => setShowTenantModal(false)} className="px-4 py-2 text-sm bg-gray-200 rounded hover:bg-gray-300">取消</button>
                <button onClick={saveTenant} disabled={tenantSaving} className="px-4 py-2 text-sm bg-teal-600 text-white rounded hover:bg-teal-700 disabled:opacity-50">{tenantSaving ? '儲存中…' : '儲存'}</button>
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
                  <label className="text-gray-600">物業 *</label>
                  <select value={rentFilingForm.propertyId} disabled={!!editingRentFiling}
                    onChange={(e) => setRentFilingForm((f) => ({ ...f, propertyId: e.target.value, contractId: '' }))}
                    className="w-full border rounded px-3 py-2 mt-1">
                    <option value="">選擇物業</option>
                    {properties.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}{p.address ? ` · ${p.address}` : ''}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-gray-600">綁定租約（同址多公司時建議指定）</label>
                  <select value={rentFilingForm.contractId} onChange={(e) => setRentFilingForm((f) => ({ ...f, contractId: e.target.value }))}
                    className="w-full border rounded px-3 py-2 mt-1">
                    <option value="">不指定（合計該物業全部實收）</option>
                    {contracts.filter((c) => !rentFilingForm.propertyId || String(c.propertyId) === rentFilingForm.propertyId).map((c) => (
                      <option key={c.id} value={c.id}>{c.contractNo} · {getTenantDisplayName(c.tenant)}{c.monthlyRent != null ? ` · NT$${fmt(c.monthlyRent)}` : ''}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-gray-600">承租人／公司抬頭（手動註記）</label>
                  <input type="text" value={rentFilingForm.lesseeDisplayName} onChange={(e) => setRentFilingForm((f) => ({ ...f, lesseeDisplayName: e.target.value }))}
                    className="w-full border rounded px-3 py-2 mt-1" placeholder="例：OO股份有限公司" />
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={rentFilingForm.isPublicInterest} onChange={(e) => setRentFilingForm((f) => ({ ...f, isPublicInterest: e.target.checked }))} />
                  <span>公益出租人（房屋稅／申報類型註記）</span>
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-gray-600">申報月租</label>
                    <input type="number" min="0" value={rentFilingForm.declaredMonthlyRent} onChange={(e) => setRentFilingForm((f) => ({ ...f, declaredMonthlyRent: e.target.value }))}
                      className="w-full border rounded px-3 py-2 mt-1 text-right" />
                  </div>
                  <div>
                    <label className="text-gray-600">申報月數</label>
                    <input type="number" min="1" max="12" value={rentFilingForm.monthsInScope} onChange={(e) => setRentFilingForm((f) => ({ ...f, monthsInScope: e.target.value }))}
                      className="w-full border rounded px-3 py-2 mt-1 text-right" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-gray-600">全年申報金額</label>
                    <input type="number" min="0" value={rentFilingForm.declaredAnnualIncome} onChange={(e) => setRentFilingForm((f) => ({ ...f, declaredAnnualIncome: e.target.value }))}
                      className="w-full border rounded px-3 py-2 mt-1 text-right" />
                  </div>
                  <div>
                    <label className="text-gray-600">預估房屋稅</label>
                    <input type="number" min="0" value={rentFilingForm.estimatedHouseTax} onChange={(e) => setRentFilingForm((f) => ({ ...f, estimatedHouseTax: e.target.value }))}
                      className="w-full border rounded px-3 py-2 mt-1 text-right" placeholder="公益與一般稅率不同" />
                  </div>
                </div>
                <div>
                  <label className="text-gray-600">狀態</label>
                  <select value={rentFilingForm.status} onChange={(e) => setRentFilingForm((f) => ({ ...f, status: e.target.value }))}
                    className="w-full border rounded px-3 py-2 mt-1">
                    <option value="draft">草稿</option>
                    <option value="filed">已報稅</option>
                    <option value="confirmed">已定稿</option>
                  </select>
                </div>
                <div>
                  <label className="text-gray-600">備註</label>
                  <textarea value={rentFilingForm.note} onChange={(e) => setRentFilingForm((f) => ({ ...f, note: e.target.value }))} rows={2} className="w-full border rounded px-3 py-2 mt-1" />
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
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowPropertyModal(false)}>
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="p-6">
              <h3 className="text-lg font-bold text-gray-800 mb-4">{editingProperty ? '編輯物業' : '新增物業'}</h3>
              <div className="space-y-3">
                <div>
                  <label className="text-sm text-gray-600">名稱 *</label>
                  <input type="text" value={propertyForm.name} onChange={e => setPropertyForm(f => ({ ...f, name: e.target.value }))}
                    className="w-full border rounded px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="text-sm text-gray-600">大樓名稱</label>
                  <input type="text" value={propertyForm.buildingName} onChange={e => setPropertyForm(f => ({ ...f, buildingName: e.target.value }))}
                    className="w-full border rounded px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="text-sm text-gray-600">類別</label>
                  <input type="text" value={propertyForm.unitNo} onChange={e => setPropertyForm(f => ({ ...f, unitNo: e.target.value }))}
                    className="w-full border rounded px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="text-sm text-gray-600">地址</label>
                  <input type="text" value={propertyForm.address} onChange={e => setPropertyForm(f => ({ ...f, address: e.target.value }))}
                    className="w-full border rounded px-3 py-2 text-sm" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm text-gray-600">所有權人</label>
                    <input type="text" value={propertyForm.ownerName || ''} onChange={e => setPropertyForm(f => ({ ...f, ownerName: e.target.value }))}
                      className="w-full border rounded px-3 py-2 text-sm" placeholder="建物登記所有權人" />
                  </div>
                  <div>
                    <label className="text-sm text-gray-600">房屋稅稅籍編號</label>
                    <input type="text" value={propertyForm.houseTaxRegistrationNo || ''} onChange={e => setPropertyForm(f => ({ ...f, houseTaxRegistrationNo: e.target.value }))}
                      className="w-full border rounded px-3 py-2 text-sm" placeholder="對應房屋稅單" />
                  </div>
                </div>
                <div>
                  <label className="text-sm text-gray-600">狀態</label>
                  <select value={propertyForm.status} onChange={e => setPropertyForm(f => ({ ...f, status: e.target.value }))}
                    className="w-full border rounded px-3 py-2 text-sm">
                    {PROPERTY_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-sm text-gray-600">收租帳戶</label>
                  <select value={propertyForm.rentCollectAccountId} onChange={e => setPropertyForm(f => ({ ...f, rentCollectAccountId: e.target.value }))}
                    className="w-full border rounded px-3 py-2 text-sm">
                    <option value="">無</option>
                    {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-sm text-gray-600">押金帳戶</label>
                  <select value={propertyForm.depositAccountId} onChange={e => setPropertyForm(f => ({ ...f, depositAccountId: e.target.value }))}
                    className="w-full border rounded px-3 py-2 text-sm">
                    <option value="">無</option>
                    {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-sm text-gray-600">備註</label>
                  <textarea value={propertyForm.note} onChange={e => setPropertyForm(f => ({ ...f, note: e.target.value }))}
                    className="w-full border rounded px-3 py-2 text-sm" rows={2} />
                </div>
                <div className="col-span-2">
                  <div className="flex items-center gap-2 mb-3">
                    <input type="checkbox" id="collectUtilityFee" checked={propertyForm.collectUtilityFee}
                      onChange={e => setPropertyForm(f => ({ ...f, collectUtilityFee: e.target.checked }))} className="rounded" />
                    <label htmlFor="collectUtilityFee" className="text-sm text-gray-700 font-medium">需向租客收取水電費</label>
                    <span className="text-xs text-gray-400">（勾選後收租工作台將顯示電費欄）</span>
                  </div>
                </div>
                <div className="col-span-2">
                  <div className="flex items-center gap-2 mb-2">
                    <input type="checkbox" id="publicInterestLandlord" checked={propertyForm.publicInterestLandlord}
                      onChange={e => setPropertyForm(f => ({ ...f, publicInterestLandlord: e.target.checked }))} className="rounded" />
                    <label htmlFor="publicInterestLandlord" className="text-sm text-gray-600 font-medium">公益出租人</label>
                  </div>
                  {propertyForm.publicInterestLandlord && (
                    <div className="bg-green-50 border border-green-200 rounded-lg p-3 space-y-3">
                      <p className="text-xs text-green-800"><strong>公益出租</strong>之申報金額、預估房屋稅請至「租金申報」分頁依<strong>所得年度</strong>填寫同一張總表。</p>
                      <button type="button" onClick={() => { setShowPropertyModal(false); switchTab('rentFiling'); }} className="text-xs text-teal-700 underline font-medium">開啟租金申報 →</button>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs text-green-700 font-medium block mb-1">申請人名稱</label>
                          <input type="text" value={propertyForm.publicInterestApplicant}
                            onChange={e => setPropertyForm(f => ({ ...f, publicInterestApplicant: e.target.value }))}
                            placeholder="申請公益出租人之人名"
                            className="w-full border border-green-300 rounded px-2 py-1.5 text-sm bg-white" />
                        </div>
                        <div />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs text-green-700 font-medium block mb-1">租約開始日期</label>
                          <input type="date" value={propertyForm.publicInterestStartDate}
                            onChange={e => setPropertyForm(f => ({ ...f, publicInterestStartDate: e.target.value }))}
                            className="w-full border border-green-300 rounded px-2 py-1.5 text-sm bg-white" />
                        </div>
                        <div>
                          <label className="text-xs text-green-700 font-medium block mb-1">租約結束日期</label>
                          <input type="date" value={propertyForm.publicInterestEndDate}
                            onChange={e => setPropertyForm(f => ({ ...f, publicInterestEndDate: e.target.value }))}
                            className="w-full border border-green-300 rounded px-2 py-1.5 text-sm bg-white" />
                        </div>
                      </div>
                      <div>
                        <label className="text-xs text-green-700 font-medium block mb-1">公益出租人備註</label>
                        <textarea value={propertyForm.publicInterestNote}
                          onChange={e => setPropertyForm(f => ({ ...f, publicInterestNote: e.target.value }))}
                          placeholder="申請相關備註"
                          className="w-full border border-green-300 rounded px-2 py-1.5 text-sm bg-white" rows={2} />
                      </div>
                    </div>
                  )}
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-6">
                <button onClick={() => setShowPropertyModal(false)} className="px-4 py-2 text-sm bg-gray-200 rounded hover:bg-gray-300">取消</button>
                <button onClick={saveProperty} disabled={propertySaving} className="px-4 py-2 text-sm bg-teal-600 text-white rounded hover:bg-teal-700 disabled:opacity-50">{propertySaving ? '儲存中…' : '儲存'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==================== MODAL: CONTRACT ==================== */}
      {showContractModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => { setShowContractModal(false); setRenewingFromContract(null); }}>
          <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="p-6">
              <h3 className="text-lg font-bold text-gray-800 mb-4">
                {renewingFromContract ? '續約' : editingContract ? '編輯合約' : '新增合約'}
              </h3>
              <div className="grid grid-cols-2 gap-3">
                {renewingFromContract && (
                  <div className="col-span-2 bg-teal-50 border border-teal-200 rounded-lg px-3 py-2 text-sm text-teal-800">
                    <span className="font-medium">續約自：</span>
                    {renewingFromContract.contractNo}（{renewingFromContract.propertyName} · {renewingFromContract.tenantName}，舊月租 NT${Number(renewingFromContract.monthlyRent).toLocaleString()}）
                  </div>
                )}
                <div>
                  <label className="text-sm text-gray-600">物業 *</label>
                  <select value={contractForm.propertyId} onChange={e => setContractForm(f => ({ ...f, propertyId: e.target.value }))}
                    className="w-full border rounded px-3 py-2 text-sm">
                    <option value="">選擇物業</option>
                    {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-sm text-gray-600">租客 *</label>
                  <select value={contractForm.tenantId} onChange={e => setContractForm(f => ({ ...f, tenantId: e.target.value }))}
                    className="w-full border rounded px-3 py-2 text-sm">
                    <option value="">選擇租客</option>
                    {tenants.map(t => <option key={t.id} value={t.id}>{getTenantDisplayName(t)}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-sm text-gray-600">開始日期 *</label>
                  <input type="date" value={contractForm.startDate} onChange={e => setContractForm(f => ({ ...f, startDate: e.target.value }))}
                    className="w-full border rounded px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="text-sm text-gray-600">結束日期 *</label>
                  <input type="date" value={contractForm.endDate} onChange={e => setContractForm(f => ({ ...f, endDate: e.target.value }))}
                    className="w-full border rounded px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="text-sm text-gray-600">月租金 *</label>
                  <input type="number" value={contractForm.monthlyRent} onChange={e => setContractForm(f => ({ ...f, monthlyRent: e.target.value }))}
                    className="w-full border rounded px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="text-sm text-gray-600">繳租日 (每月) *</label>
                  <input type="number" min="1" max="28" value={contractForm.paymentDueDay} onChange={e => setContractForm(f => ({ ...f, paymentDueDay: e.target.value }))}
                    className="w-full border rounded px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="text-sm text-gray-600">押金金額</label>
                  <input type="number" value={contractForm.depositAmount} onChange={e => setContractForm(f => ({ ...f, depositAmount: e.target.value }))}
                    className="w-full border rounded px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="text-sm text-gray-600">押金帳戶</label>
                  <select value={contractForm.depositAccountId} onChange={e => setContractForm(f => ({ ...f, depositAccountId: e.target.value }))}
                    className="w-full border rounded px-3 py-2 text-sm">
                    <option value="">無</option>
                    {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-sm text-gray-600">收租帳戶 *</label>
                  <select value={contractForm.rentAccountId} onChange={e => setContractForm(f => ({ ...f, rentAccountId: e.target.value }))}
                    className="w-full border rounded px-3 py-2 text-sm">
                    <option value="">選擇帳戶</option>
                    {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-sm text-gray-600">會計科目 *</label>
                  <select value={contractForm.accountingSubjectId} onChange={e => setContractForm(f => ({ ...f, accountingSubjectId: e.target.value }))}
                    className="w-full border rounded px-3 py-2 text-sm">
                    <option value="">請選擇會計科目</option>
                    {accountingSubjects.map(s => <option key={s.id} value={s.id}>{s.code} - {s.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-sm text-gray-600">狀態</label>
                  <select value={contractForm.status} onChange={e => setContractForm(f => ({ ...f, status: e.target.value }))}
                    className="w-full border rounded px-3 py-2 text-sm">
                    {CONTRACT_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={contractForm.autoRenew}
                      onChange={e => setContractForm(f => ({ ...f, autoRenew: e.target.checked }))} />
                    自動續約
                  </label>
                </div>
                <div className="col-span-2">
                  <label className="text-sm text-gray-600">特殊條款</label>
                  <textarea value={contractForm.specialTerms} onChange={e => setContractForm(f => ({ ...f, specialTerms: e.target.value }))}
                    className="w-full border rounded px-3 py-2 text-sm" rows={2} />
                </div>
                <div className="col-span-2">
                  <label className="text-sm text-gray-600">備註</label>
                  <textarea value={contractForm.note} onChange={e => setContractForm(f => ({ ...f, note: e.target.value }))}
                    className="w-full border rounded px-3 py-2 text-sm" rows={2} />
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-6">
                <button onClick={() => { setShowContractModal(false); setRenewingFromContract(null); }} className="px-4 py-2 text-sm bg-gray-200 rounded hover:bg-gray-300">取消</button>
                <button onClick={saveContract} disabled={contractSaving} className="px-4 py-2 text-sm bg-teal-600 text-white rounded hover:bg-teal-700 disabled:opacity-50">{contractSaving ? '儲存中…' : (renewingFromContract ? '建立續約合約' : '儲存')}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==================== MODAL: TAX ==================== */}
      {showTaxModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => { setShowTaxModal(false); setEditingTax(null); }}>
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
            <div className="p-6">
              <h3 className="text-lg font-bold text-gray-800 mb-4">{editingTax ? '編輯稅款' : '新增稅款'}</h3>
              <div className="space-y-3">
                <div>
                  <label className="text-sm text-gray-600">物業 *</label>
                  <select value={taxForm.propertyId} onChange={e => setTaxForm(f => ({ ...f, propertyId: e.target.value }))}
                    className="w-full border rounded px-3 py-2 text-sm" disabled={!!editingTax}>
                    <option value="">選擇物業</option>
                    {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-sm text-gray-600">年度 *</label>
                  <input type="number" value={taxForm.taxYear} onChange={e => setTaxForm(f => ({ ...f, taxYear: e.target.value }))}
                    className="w-full border rounded px-3 py-2 text-sm" disabled={!!editingTax} />
                </div>
                <div>
                  <label className="text-sm text-gray-600">稅種 *</label>
                  <select value={taxForm.taxType} onChange={e => setTaxForm(f => ({ ...f, taxType: e.target.value }))}
                    className="w-full border rounded px-3 py-2 text-sm" disabled={editingTax?.status === 'paid'}>
                    <option value="房屋稅">房屋稅</option>
                    <option value="地價稅">地價稅</option>
                    <option value="土地增值稅">土地增值稅</option>
                    <option value="其他">其他</option>
                  </select>
                </div>
                <div>
                  <label className="text-sm text-gray-600">應繳到期日 *</label>
                  <input type="date" value={taxForm.dueDate} onChange={e => setTaxForm(f => ({ ...f, dueDate: e.target.value }))}
                    className="w-full border rounded px-3 py-2 text-sm" disabled={editingTax?.status === 'paid'} />
                </div>
                <div>
                  <label className="text-sm text-gray-600">金額 *</label>
                  <input type="number" value={taxForm.amount} onChange={e => setTaxForm(f => ({ ...f, amount: e.target.value }))}
                    className="w-full border rounded px-3 py-2 text-sm" disabled={editingTax?.status === 'paid'} />
                </div>
                <div className="border-t pt-3">
                  <p className="text-xs text-gray-500 mb-2">繳款憑證（已繳後填寫，供對帳用）</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs text-gray-600">實際繳款日</label>
                      <input type="date" value={taxForm.paidDate} onChange={e => setTaxForm(f => ({ ...f, paidDate: e.target.value }))}
                        className="w-full border rounded px-2 py-1.5 text-sm mt-1" />
                    </div>
                    <div>
                      <label className="text-xs text-gray-600">繳款憑證號</label>
                      <input type="text" value={taxForm.certNo} onChange={e => setTaxForm(f => ({ ...f, certNo: e.target.value }))}
                        placeholder="e.g. 2026050100001" className="w-full border rounded px-2 py-1.5 text-sm mt-1" />
                    </div>
                  </div>
                </div>
                <div>
                  <label className="text-sm text-gray-600">備註</label>
                  <textarea value={taxForm.note} onChange={e => setTaxForm(f => ({ ...f, note: e.target.value }))}
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
                  <label className="text-sm text-gray-600">物業 *</label>
                  <select value={maintenanceForm.propertyId} onChange={e => setMaintenanceForm(f => ({ ...f, propertyId: e.target.value }))}
                    className="w-full border rounded px-3 py-2 text-sm" disabled={!!editingMaintenance}>
                    <option value="">選擇物業</option>
                    {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-sm text-gray-600">日期 *</label>
                  <input type="date" value={maintenanceForm.maintenanceDate} onChange={e => setMaintenanceForm(f => ({ ...f, maintenanceDate: e.target.value }))}
                    className="w-full border rounded px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="text-sm text-gray-600">類別 *</label>
                  <select value={maintenanceForm.category} onChange={e => setMaintenanceForm(f => ({ ...f, category: e.target.value }))}
                    className="w-full border rounded px-3 py-2 text-sm">
                    {MAINTENANCE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-sm text-gray-600">金額 *</label>
                  <input type="number" value={maintenanceForm.amount} onChange={e => setMaintenanceForm(f => ({ ...f, amount: e.target.value }))}
                    className="w-full border rounded px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="text-sm text-gray-600">會計科目 *</label>
                  <select value={maintenanceForm.accountingSubjectId} onChange={e => setMaintenanceForm(f => ({ ...f, accountingSubjectId: e.target.value }))}
                    className="w-full border rounded px-3 py-2 text-sm">
                    <option value="">請選擇會計科目</option>
                    {accountingSubjects.map(s => <option key={s.id} value={s.id}>{s.code} - {s.name}</option>)}
                  </select>
                </div>
                {!editingMaintenance && (
                  <div>
                    <label className="text-sm text-gray-600">支出戶頭 *</label>
                    <select value={maintenanceForm.accountId} onChange={e => setMaintenanceForm(f => ({ ...f, accountId: e.target.value }))}
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
                        <label className="text-xs text-gray-500">代墊員工 *</label>
                        <input value={maintenanceForm.advancedBy} onChange={e => setMaintenanceForm(f => ({ ...f, advancedBy: e.target.value }))}
                          placeholder="員工姓名" className="w-full border rounded px-3 py-1.5 text-sm" />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500">代墊方式</label>
                        <select value={maintenanceForm.advancePaymentMethod} onChange={e => setMaintenanceForm(f => ({ ...f, advancePaymentMethod: e.target.value }))}
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
                  <label className="text-sm text-gray-600">備註</label>
                  <textarea value={maintenanceForm.note} onChange={e => setMaintenanceForm(f => ({ ...f, note: e.target.value }))}
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
