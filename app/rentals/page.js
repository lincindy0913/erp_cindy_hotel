'use client';

import { useState, useEffect, Suspense, useMemo } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Navigation from '@/components/Navigation';
import { useToast } from '@/context/ToastContext';
import { sortRows, useColumnSort, SortableTh } from '@/components/SortableTh';

const TABS = [
  { key: 'overview', label: '總覽' },
  { key: 'cashier', label: '收租工作台' },
  { key: 'tenants', label: '租客管理' },
  { key: 'properties', label: '物業管理' },
  { key: 'contracts', label: '合約管理' },
  { key: 'taxes', label: '稅款管理' },
  { key: 'maintenance', label: '維護費' },
  { key: 'utilityIncome', label: '水電收入' },
  { key: 'incomeReport', label: '收入分析報表' },
  { key: 'operatingReport', label: '營運分析報表' }
];

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
  const [activeTab, setActiveTab] = useState(tabParam);

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
  const [maintenanceFilter, setMaintenanceFilter] = useState({ category: '', status: '' });

  // Modal states
  const [showTenantModal, setShowTenantModal] = useState(false);
  const [editingTenant, setEditingTenant] = useState(null);
  const [tenantForm, setTenantForm] = useState({ tenantType: 'individual', fullName: '', companyName: '', phone: '', email: '', address: '', note: '' });

  const [showPropertyModal, setShowPropertyModal] = useState(false);
  const [editingProperty, setEditingProperty] = useState(null);
  const [propertyForm, setPropertyForm] = useState({ name: '', address: '', buildingName: '', unitNo: '', status: 'available', rentCollectAccountId: '', depositAccountId: '', note: '', publicInterestLandlord: false });

  const [showContractModal, setShowContractModal] = useState(false);
  const [editingContract, setEditingContract] = useState(null);
  const [contractForm, setContractForm] = useState({
    propertyId: '', tenantId: '', startDate: '', endDate: '',
    monthlyRent: '', paymentDueDay: '5', depositAmount: '', depositAccountId: '',
    rentAccountId: '', accountingSubjectId: '', status: 'pending', autoRenew: false, specialTerms: '', note: ''
  });

  const [showTaxModal, setShowTaxModal] = useState(false);
  const [editingTax, setEditingTax] = useState(null);
  const [taxForm, setTaxForm] = useState({ propertyId: '', taxYear: new Date().getFullYear(), taxType: '房屋稅', dueDate: '', amount: '' });

  const [showMaintenanceModal, setShowMaintenanceModal] = useState(false);
  const [maintenanceForm, setMaintenanceForm] = useState({ propertyId: '', maintenanceDate: new Date().toISOString().split('T')[0], category: '水電', amount: '', accountingSubjectId: '', accountId: '', isEmployeeAdvance: false, advancedBy: '', advancePaymentMethod: '現金', note: '' });
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

  const [taxTableYear, setTaxTableYear] = useState(new Date().getFullYear());
  const [taxTableRows, setTaxTableRows] = useState([]);
  const [taxTableSaving, setTaxTableSaving] = useState(false);
  const [tenantSaving, setTenantSaving] = useState(false);
  const [propertySaving, setPropertySaving] = useState(false);
  const [contractSaving, setContractSaving] = useState(false);
  const [taxSaving, setTaxSaving] = useState(false);
  const [maintenanceSaving, setMaintenanceSaving] = useState(false);
  const [utilitySaving, setUtilitySaving] = useState(false);
  const [incomePaymentSaving, setIncomePaymentSaving] = useState(false);

  const [utilityFilter, setUtilityFilter] = useState({ year: new Date().getFullYear(), month: new Date().getMonth() + 1 });
  const [utilityList, setUtilityList] = useState([]);
  const [showUtilityModal, setShowUtilityModal] = useState(false);
  const [utilityForm, setUtilityForm] = useState({ propertyId: '', incomeYear: new Date().getFullYear(), incomeMonth: new Date().getMonth() + 1, expectedAmount: '', actualAmount: '', actualDate: '', accountId: '', note: '' });
  const [editingUtility, setEditingUtility] = useState(null);

  useEffect(() => {
    setActiveTab(tabParam);
  }, [tabParam]);

  useEffect(() => {
    fetchAll();
  }, []);

  useEffect(() => {
    if (activeTab === 'cashier') fetchIncomes();
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
    if (activeTab === 'utilityIncome') fetchUtilityList();
    if (activeTab === 'overview') fetchSummary();
    if (activeTab === 'incomeReport') { fetchIncomeReport(); fetchProperties(); }
    if (activeTab === 'operatingReport') { fetchOperatingReport(); fetchProperties(); }
  }, [activeTab]);

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

  function switchTab(key) {
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
      const res = await fetch(`/api/rentals/income?${params}`);
      const data = await res.json();
      setIncomes(Array.isArray(data) ? data : []);
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

  async function deleteUtility(id) {
    if (!confirm('確定刪除此筆水電收入？相關現金流紀錄也會一併刪除。')) return;
    try {
      const res = await fetch(`/api/rentals/utility-income/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) return showToast(data.error || '刪除失敗', 'error');
      fetchUtilityList();
    } catch (e) { showToast('刪除失敗: ' + e.message, 'error'); }
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

  async function deleteTenant(id) {
    if (!confirm('確定要刪除此租客？')) return;
    try {
      const res = await fetch(`/api/rentals/tenants/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) return showToast(data.error || '刪除失敗', 'error');
      fetchTenants();
    } catch (err) { showToast('刪除失敗: ' + err.message, 'error'); }
  }

  // ==================== PROPERTY CRUD ====================
  function openPropertyModal(property = null) {
    if (property) {
      setEditingProperty(property);
      setPropertyForm({
        name: property.name || '', address: property.address || '', buildingName: property.buildingName || '',
        unitNo: property.unitNo || '', status: property.status || 'available',
        rentCollectAccountId: property.rentCollectAccountId || '', depositAccountId: property.depositAccountId || '',
        note: property.note || '', publicInterestLandlord: property.publicInterestLandlord || false
      });
    } else {
      setEditingProperty(null);
      setPropertyForm({ name: '', address: '', buildingName: '', unitNo: '', status: 'available', rentCollectAccountId: '', depositAccountId: '', note: '', publicInterestLandlord: false });
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

  async function deleteProperty(id) {
    if (!confirm('確定要刪除此物業？')) return;
    try {
      const res = await fetch(`/api/rentals/properties/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) return showToast(data.error || '刪除失敗', 'error');
      fetchProperties();
    } catch (err) { showToast('刪除失敗: ' + err.message, 'error'); }
  }

  // ==================== CONTRACT CRUD ====================
  function openContractModal(contract = null) {
    if (contract) {
      setEditingContract(contract);
      setContractForm({
        propertyId: contract.propertyId || '', tenantId: contract.tenantId || '',
        startDate: contract.startDate || '', endDate: contract.endDate || '',
        monthlyRent: contract.monthlyRent || '', paymentDueDay: contract.paymentDueDay || '5',
        depositAmount: contract.depositAmount || '', depositAccountId: contract.depositAccountId || '',
        rentAccountId: contract.rentAccountId || '', accountingSubjectId: contract.accountingSubjectId ? String(contract.accountingSubjectId) : '',
        status: contract.status || 'pending',
        autoRenew: contract.autoRenew || false, specialTerms: contract.specialTerms || '', note: contract.note || ''
      });
    } else {
      setEditingContract(null);
      setContractForm({
        propertyId: '', tenantId: '', startDate: '', endDate: '',
        monthlyRent: '', paymentDueDay: '5', depositAmount: '', depositAccountId: '',
        rentAccountId: '', accountingSubjectId: '', status: 'pending', autoRenew: false, specialTerms: '', note: ''
      });
    }
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
      fetchContracts();
      fetchProperties();
    } catch (err) { showToast('儲存失敗: ' + err.message, 'error'); }
    finally { setContractSaving(false); }
  }

  async function deleteContract(id) {
    if (!confirm('確定要刪除此合約？')) return;
    try {
      const res = await fetch(`/api/rentals/contracts/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) return showToast(data.error || '刪除失敗', 'error');
      fetchContracts();
    } catch (err) { showToast('刪除失敗: ' + err.message, 'error'); }
  }

  async function handleDepositAction(contractId, action) {
    if (!confirm(action === 'depositReceive' ? '確定收取押金？' : '確定退還押金？')) return;
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
  }

  // ==================== INCOME (CASHIER) ====================
  async function generateMonthlyIncome() {
    if (!confirm(`確定產生 ${incomeFilter.year}/${incomeFilter.month} 月份租金紀錄？`)) return;
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
  }

  function openIncomePayment(income) {
    setIncomeFormMode('confirm');
    setPayingIncomeId(income.id);
    const expected = Number(income.expectedAmount || 0);
    const received = Number(income.actualAmount || 0);
    const remaining = Math.max(0, expected - received);
    setIncomePayForm({
      actualAmount: remaining > 0 ? String(remaining) : String(expected),
      actualDate: new Date().toISOString().split('T')[0],
      accountId: income.accountId || '',
      paymentMethod: income.paymentMethod || '現金',
      matchTransferRef: '',
      matchBankAccountName: income.matchBankAccountName || '',
      matchNote: ''
    });
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
    setIncomePaymentSaving(true);
    try {
      const method = incomeFormMode === 'edit' ? 'PATCH' : 'PUT';
      const res = await fetch(`/api/rentals/income/${payingIncomeId}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(incomePayForm)
      });
      const data = await res.json();
      if (!res.ok) return showToast(data.error || (incomeFormMode === 'edit' ? '更新失敗' : '確認失敗'), 'error');
      showToast(incomeFormMode === 'edit' ? '已更新收款資料' : `已確認收款 (${data.status === 'partial' ? '部分收款' : '全額收款'})`, 'success');
      setPayingIncomeId(null);
      fetchIncomes();
      fetchSummary();
    } catch (err) { showToast(incomeFormMode === 'edit' ? '更新失敗: ' + err.message : '確認失敗: ' + err.message, 'error'); }
    finally { setIncomePaymentSaving(false); }
  }

  async function voidIncomePayment(incomeId) {
    if (!confirm('確定要作廢此筆收款？金流將沖銷，收租紀錄恢復為待收。')) return;
    try {
      const res = await fetch(`/api/rentals/income/${incomeId}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) return showToast(data.error || '作廢失敗', 'error');
      setPayingIncomeId(null);
      fetchIncomes();
      fetchSummary();
    } catch (err) { showToast('作廢失敗: ' + err.message, 'error'); }
  }

  // ==================== TAXES ====================
  function openTaxEdit(tax) {
    setEditingTax(tax);
    setTaxForm({
      propertyId: String(tax.propertyId),
      taxYear: tax.taxYear,
      taxType: tax.taxType || '房屋稅',
      dueDate: tax.dueDate || '',
      amount: tax.amount != null ? String(tax.amount) : ''
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
            taxType: taxForm.taxType || undefined
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
    if (!confirm(`確定要刪除此筆稅款（${tax.property?.name} ${tax.taxYear} ${tax.taxType}）？`)) return;
    try {
      const res = await fetch(`/api/rentals/taxes/${tax.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) return showToast(data.message || data.error || '刪除失敗', 'error');
      fetchTaxes();
    } catch (err) { showToast('刪除失敗: ' + err.message, 'error'); }
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
    if (!confirm(`確定要刪除此筆維護紀錄嗎？`)) return;
    try {
      const res = await fetch(`/api/rentals/maintenance/${m.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json();
        return showToast(data?.error?.message || data?.error || '刪除失敗', 'error');
      }
      fetchMaintenances();
    } catch (err) { showToast('刪除失敗: ' + err.message, 'error'); }
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
            {activeTab === 'overview' && summary && (
              <div>
                {/* Notification banners */}
                {summary.overdueCount > 0 && (
                  <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-4 rounded">
                    <p className="text-red-700 font-medium">
                      有 {summary.overdueCount} 筆租金逾期未收，總金額 ${fmt(summary.overdueAmount)}
                    </p>
                  </div>
                )}
                {summary.expiringContracts > 0 && (
                  <div className="bg-yellow-50 border-l-4 border-yellow-500 p-4 mb-4 rounded">
                    <p className="text-yellow-700 font-medium">
                      有 {summary.expiringContracts} 筆合約將於 60 天內到期
                    </p>
                  </div>
                )}
                {summary.pendingTaxes > 0 && (
                  <div className="bg-orange-50 border-l-4 border-orange-500 p-4 mb-4 rounded">
                    <p className="text-orange-700 font-medium">
                      有 {summary.pendingTaxes} 筆稅款待繳納
                    </p>
                  </div>
                )}

                {/* KPI Cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
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
                  </div>
                  <div className="bg-white rounded-lg shadow p-4 border-l-4 border-green-500">
                    <p className="text-sm text-gray-500">本月已收</p>
                    <p className="text-2xl font-bold text-green-700">${fmt(summary.thisMonthCollected)}</p>
                  </div>
                  <div className="bg-white rounded-lg shadow p-4 border-l-4 border-red-500">
                    <p className="text-sm text-gray-500">逾期未收</p>
                    <p className="text-2xl font-bold text-red-700">{summary.overdueCount} 筆</p>
                    <p className="text-xs text-gray-400 mt-1">${fmt(summary.overdueAmount)}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
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
              </div>
            )}

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
                </div>

                <div className="bg-white rounded-lg shadow overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-teal-50">
                      <tr>
                        <SortableTh label="物業" colKey="propertyName" sortKey={rentIncKey} sortDir={rentIncDir} onSort={rentIncToggle} className="px-3 py-2" />
                        <SortableTh label="租客" colKey="tenantName" sortKey={rentIncKey} sortDir={rentIncDir} onSort={rentIncToggle} className="px-3 py-2" />
                        <SortableTh label="應收" colKey="expectedAmount" sortKey={rentIncKey} sortDir={rentIncDir} onSort={rentIncToggle} className="px-3 py-2" align="right" />
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
                        <tr><td colSpan={9} className="text-center py-8 text-gray-400">暫無資料</td></tr>
                      ) : sortedIncomes.map(income => {
                        const isOverdue = income.status === 'pending' && income.dueDate < new Date().toISOString().split('T')[0];
                        const expected = Number(income.expectedAmount || 0);
                        const actual = Number(income.actualAmount || 0);
                        const remaining = expected - actual;
                        const paymentList = (income.payments && income.payments.length > 0)
                          ? income.payments.map((p, i) => ({ label: `第${i + 1}次`, amount: Number(p.amount), date: p.paymentDate }))
                          : (income.actualAmount != null && income.actualAmount > 0 ? [{ label: '第1次', amount: Number(income.actualAmount), date: income.actualDate || '-' }] : []);
                        return (
                          <tr key={income.id} className={`border-t hover:bg-gray-50 ${isOverdue ? 'bg-red-50' : ''}`}>
                            <td className="px-3 py-2">{income.propertyName}</td>
                            <td className="px-3 py-2">{income.tenantName}</td>
                            <td className="px-3 py-2 text-right font-medium">${fmt(income.expectedAmount)}</td>
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
                                  {paymentList.length <= 1 && (
                                    <button onClick={() => openIncomeEdit(income)} className="text-blue-600 hover:text-blue-800 text-xs font-medium mr-1">編輯</button>
                                  )}
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

                {/* Inline payment form */}
                {payingIncomeId && (() => {
                  const currentIncome = incomes.find(i => i.id === payingIncomeId);
                  const expectedAmt = Number(currentIncome?.expectedAmount || 0);
                  const receivedAmt = Number(currentIncome?.actualAmount || 0);
                  const remainingAmt = Math.max(0, expectedAmt - receivedAmt);
                  const payHistory = currentIncome?.payments || [];
                  return (
                  <div className="mt-4 bg-teal-50 border border-teal-200 rounded-lg p-4">
                    <h4 className="font-medium text-teal-800 mb-3">{incomeFormMode === 'edit' ? '編輯收款' : '新增收款'}</h4>

                    {/* 收款狀態摘要 */}
                    <div className="bg-white rounded-lg px-3 py-2 mb-3 flex gap-4 text-sm">
                      <span>應收：<b className="text-gray-800">${fmt(expectedAmt)}</b></span>
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
                    <div className="mt-3 flex gap-2">
                      <button onClick={confirmIncomePayment} disabled={incomePaymentSaving} className="bg-teal-600 text-white px-4 py-1.5 rounded text-sm hover:bg-teal-700 disabled:opacity-50">{incomePaymentSaving ? '處理中…' : (incomeFormMode === 'edit' ? '儲存' : '確認收款')}</button>
                      <button onClick={() => setPayingIncomeId(null)} className="bg-gray-300 text-gray-700 px-4 py-1.5 rounded text-sm hover:bg-gray-400">取消</button>
                    </div>

                    {/* 歷次收款紀錄 */}
                    {payHistory.length > 0 && (
                      <div className="mt-4 border-t border-teal-200 pt-3">
                        <h5 className="text-sm font-medium text-teal-700 mb-2">歷次收款紀錄</h5>
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-gray-500 border-b">
                              <th className="text-left py-1">次數</th>
                              <th className="text-left py-1">收款日期</th>
                              <th className="text-right py-1">金額</th>
                              <th className="text-left py-1">帳戶</th>
                              <th className="text-left py-1">付款方式</th>
                              <th className="text-left py-1">備註</th>
                            </tr>
                          </thead>
                          <tbody>
                            {payHistory.map((p, i) => (
                              <tr key={p.id || i} className="border-b border-gray-100">
                                <td className="py-1 font-medium">第{p.sequenceNo || (i + 1)}次</td>
                                <td className="py-1">{p.paymentDate || '-'}</td>
                                <td className="py-1 text-right text-green-700 font-medium">${fmt(p.amount)}</td>
                                <td className="py-1">{accounts.find(a => a.id === p.accountId)?.name || '-'}</td>
                                <td className="py-1">{p.paymentMethod === 'transfer' ? '轉帳' : (p.paymentMethod || '-')}</td>
                                <td className="py-1 text-gray-500">{p.matchNote || p.matchTransferRef || '-'}</td>
                              </tr>
                            ))}
                            <tr className="font-medium bg-teal-100/50">
                              <td className="py-1" colSpan={2}>合計已收</td>
                              <td className="py-1 text-right text-green-700">${fmt(receivedAmt)}</td>
                              <td className="py-1" colSpan={3}>{remainingAmt > 0 ? <span className="text-red-600">尚欠 ${fmt(remainingAmt)}</span> : <span className="text-green-600">已收齊</span>}</td>
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
                              <th className="text-left px-3 py-2">名稱{sortArrow('name')}</th>
                              <th className="text-left px-3 py-2">地址{sortArrow('address')}</th>
                              <th className="text-left px-3 py-2">類別{sortArrow('unitNo')}</th>
                              <th className="text-center px-3 py-2">狀態{sortArrow('status')}</th>
                              <th className="text-left px-3 py-2">目前租客{sortArrow('tenant')}</th>
                              <th className="text-left px-3 py-2">收租帳戶{sortArrow('account')}</th>
                              <th className="text-center px-3 py-2">公益出租人{sortArrow('publicInterest')}</th>
                              <th className="text-left px-3 py-2">備註{sortArrow('note')}</th>
                              <th className="text-center px-3 py-2">操作</th>
                            </tr>
                          </thead>
                          <tbody>
                            {props.map(p => (
                              <tr key={p.id} className="border-t hover:bg-gray-50">
                                <td className="px-3 py-2 font-medium">{p.name}</td>
                                <td className="px-3 py-2 text-gray-600">{p.address || '-'}</td>
                                <td className="px-3 py-2">{p.unitNo || '-'}</td>
                                <td className="px-3 py-2 text-center">
                                  <StatusBadge value={p.status} list={PROPERTY_STATUSES} />
                                </td>
                                <td className="px-3 py-2">{p.currentTenantName || '-'}</td>
                                <td className="px-3 py-2 text-xs text-gray-500">{p.rentCollectAccount?.name || '-'}</td>
                                <td className="px-3 py-2 text-center">{p.publicInterestLandlord ? <span className="text-green-600 font-medium">是</span> : <span className="text-gray-400">否</span>}</td>
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
                            <td className="px-3 py-2 font-mono text-xs">{c.contractNo}</td>
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
                            <td className="px-3 py-2 text-center">
                              <button onClick={() => openContractModal(c)} className="text-blue-600 hover:text-blue-800 text-xs mr-2">編輯</button>
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

                <h3 className="text-base font-semibold text-gray-800 mb-3">稅款清單</h3>
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
                  <button onClick={() => { setEditingTax(null); setTaxForm({ propertyId: '', taxYear: new Date().getFullYear(), taxType: '房屋稅', dueDate: '', amount: '' }); setShowTaxModal(true); }} className="bg-blue-600 text-white px-3 py-1.5 rounded text-sm hover:bg-blue-700 ml-auto">
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
                        <th className="text-right px-3 py-2">金額</th>
                        <th className="text-center px-3 py-2">狀態</th>
                        <th className="text-center px-3 py-2">操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {taxes.length === 0 ? (
                        <tr><td colSpan={7} className="text-center py-8 text-gray-400">暫無資料</td></tr>
                      ) : taxes.map(tax => (
                        <tr key={tax.id} className="border-t hover:bg-gray-50">
                          <td className="px-3 py-2">{tax.property?.name}</td>
                          <td className="px-3 py-2 text-center">{tax.taxYear}</td>
                          <td className="px-3 py-2">{tax.taxType}</td>
                          <td className="px-3 py-2">{tax.dueDate}</td>
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
                              {tax.status === 'paid' && <span className="text-xs text-gray-400">—</span>}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

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

            {/* ==================== TAB: MAINTENANCE ==================== */}
            {activeTab === 'maintenance' && (
              <div>
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
                    setMaintenanceForm({ propertyId: '', maintenanceDate: new Date().toISOString().split('T')[0], category: '水電', amount: '', accountingSubjectId: '', accountId: '', isEmployeeAdvance: false, advancedBy: '', advancePaymentMethod: '現金', note: '' });
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
                  <button onClick={() => { setEditingUtility(null); setUtilityForm({ propertyId: '', incomeYear: utilityFilter.year, incomeMonth: utilityFilter.month, expectedAmount: '', actualAmount: '', actualDate: '', accountId: '', note: '' }); setShowUtilityModal(true); }}
                    className="bg-blue-600 text-white px-3 py-1.5 rounded text-sm hover:bg-blue-700 ml-auto">
                    登記水電收入
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

            {/* ==================== TAB: 收入分析報表 ==================== */}
            {activeTab === 'incomeReport' && (
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
                              {[1,2,3,4,5,6,7,8,9,10,11,12].map(m => (
                                <td key={m} className="text-right px-2 py-2 border border-gray-200">{r.months[m] ? fmt(r.months[m]) : ''}</td>
                              ))}
                              <td className="text-right px-3 py-2 border border-gray-200 font-semibold">{fmt(r.total)}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* ==================== TAB: 營運分析報表 ==================== */}
            {activeTab === 'operatingReport' && (
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
          </>
        )}
      </div>

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
                <div className="flex items-center gap-2">
                  <input type="checkbox" id="publicInterestLandlord" checked={propertyForm.publicInterestLandlord}
                    onChange={e => setPropertyForm(f => ({ ...f, publicInterestLandlord: e.target.checked }))} className="rounded" />
                  <label htmlFor="publicInterestLandlord" className="text-sm text-gray-600">公益出租人</label>
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
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowContractModal(false)}>
          <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="p-6">
              <h3 className="text-lg font-bold text-gray-800 mb-4">{editingContract ? '編輯合約' : '新增合約'}</h3>
              <div className="grid grid-cols-2 gap-3">
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
                <button onClick={() => setShowContractModal(false)} className="px-4 py-2 text-sm bg-gray-200 rounded hover:bg-gray-300">取消</button>
                <button onClick={saveContract} disabled={contractSaving} className="px-4 py-2 text-sm bg-teal-600 text-white rounded hover:bg-teal-700 disabled:opacity-50">{contractSaving ? '儲存中…' : '儲存'}</button>
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
                    className="w-full border rounded px-3 py-2 text-sm">
                    <option value="房屋稅">房屋稅</option>
                    <option value="地價稅">地價稅</option>
                    <option value="土地增值稅">土地增值稅</option>
                    <option value="其他">其他</option>
                  </select>
                </div>
                <div>
                  <label className="text-sm text-gray-600">到期日 *</label>
                  <input type="date" value={taxForm.dueDate} onChange={e => setTaxForm(f => ({ ...f, dueDate: e.target.value }))}
                    className="w-full border rounded px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="text-sm text-gray-600">金額 *</label>
                  <input type="number" value={taxForm.amount} onChange={e => setTaxForm(f => ({ ...f, amount: e.target.value }))}
                    className="w-full border rounded px-3 py-2 text-sm" />
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
