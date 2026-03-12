'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Navigation from '@/components/Navigation';

const TABS = [
  { key: 'overview', label: '總覽' },
  { key: 'cashier', label: '收租工作台' },
  { key: 'tenants', label: '租客管理' },
  { key: 'properties', label: '物業管理' },
  { key: 'contracts', label: '合約管理' },
  { key: 'taxes', label: '稅款管理' },
  { key: 'maintenance', label: '維護費' }
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
  const tabParam = searchParams.get('tab') || 'overview';
  const [activeTab, setActiveTab] = useState(tabParam);

  // Shared data
  const [summary, setSummary] = useState(null);
  const [tenants, setTenants] = useState([]);
  const [properties, setProperties] = useState([]);
  const [contracts, setContracts] = useState([]);
  const [incomes, setIncomes] = useState([]);
  const [taxes, setTaxes] = useState([]);
  const [maintenances, setMaintenances] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [accountingSubjects, setAccountingSubjects] = useState([]);
  const [loading, setLoading] = useState(true);

  // Search / filter states
  const [tenantSearch, setTenantSearch] = useState('');
  const [propertyFilter, setPropertyFilter] = useState({ buildingName: '', status: '' });
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
  const [propertyForm, setPropertyForm] = useState({ name: '', address: '', buildingName: '', unitNo: '', status: 'available', rentCollectAccountId: '', depositAccountId: '', note: '' });

  const [showContractModal, setShowContractModal] = useState(false);
  const [editingContract, setEditingContract] = useState(null);
  const [contractForm, setContractForm] = useState({
    propertyId: '', tenantId: '', startDate: '', endDate: '',
    monthlyRent: '', paymentDueDay: '5', depositAmount: '', depositAccountId: '',
    rentAccountId: '', accountingSubjectId: '', status: 'pending', autoRenew: false, specialTerms: '', note: ''
  });

  const [showTaxModal, setShowTaxModal] = useState(false);
  const [taxForm, setTaxForm] = useState({ propertyId: '', taxYear: new Date().getFullYear(), taxType: '房屋稅', dueDate: '', amount: '' });

  const [showMaintenanceModal, setShowMaintenanceModal] = useState(false);
  const [maintenanceForm, setMaintenanceForm] = useState({ propertyId: '', maintenanceDate: new Date().toISOString().split('T')[0], category: '水電', amount: '', accountingSubjectId: '', accountId: '', note: '' });
  const [editingMaintenance, setEditingMaintenance] = useState(null);

  // Inline payment forms
  const [payingIncomeId, setPayingIncomeId] = useState(null);
  const [incomePayForm, setIncomePayForm] = useState({ actualAmount: '', actualDate: new Date().toISOString().split('T')[0], accountId: '', paymentMethod: '現金', matchTransferRef: '', matchBankAccountName: '' });

  const [payingTaxId, setPayingTaxId] = useState(null);
  const [taxPayForm, setTaxPayForm] = useState({ accountId: '', paymentDate: new Date().toISOString().split('T')[0] });

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
    if (activeTab === 'maintenance') fetchMaintenances();
    if (activeTab === 'overview') fetchSummary();
  }, [activeTab]);

  function switchTab(key) {
    setActiveTab(key);
    router.push(`/rentals?tab=${key}`, { scroll: false });
  }

  async function fetchAll() {
    setLoading(true);
    await Promise.all([
      fetchSummary(),
      fetchAccounts(),
      fetchTenants(),
      fetchProperties(),
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
    try {
      const url = editingTenant ? `/api/rentals/tenants/${editingTenant.id}` : '/api/rentals/tenants';
      const method = editingTenant ? 'PUT' : 'POST';
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(tenantForm) });
      const data = await res.json();
      if (!res.ok) return alert(data.error || '儲存失敗');
      setShowTenantModal(false);
      fetchTenants();
    } catch (err) { alert('儲存失敗: ' + err.message); }
  }

  async function deleteTenant(id) {
    if (!confirm('確定要刪除此租客？')) return;
    try {
      const res = await fetch(`/api/rentals/tenants/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) return alert(data.error || '刪除失敗');
      fetchTenants();
    } catch (err) { alert('刪除失敗: ' + err.message); }
  }

  // ==================== PROPERTY CRUD ====================
  function openPropertyModal(property = null) {
    if (property) {
      setEditingProperty(property);
      setPropertyForm({
        name: property.name || '', address: property.address || '', buildingName: property.buildingName || '',
        unitNo: property.unitNo || '', status: property.status || 'available',
        rentCollectAccountId: property.rentCollectAccountId || '', depositAccountId: property.depositAccountId || '',
        note: property.note || ''
      });
    } else {
      setEditingProperty(null);
      setPropertyForm({ name: '', address: '', buildingName: '', unitNo: '', status: 'available', rentCollectAccountId: '', depositAccountId: '', note: '' });
    }
    setShowPropertyModal(true);
  }

  async function saveProperty() {
    try {
      const url = editingProperty ? `/api/rentals/properties/${editingProperty.id}` : '/api/rentals/properties';
      const method = editingProperty ? 'PUT' : 'POST';
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(propertyForm) });
      const data = await res.json();
      if (!res.ok) return alert(data.error || '儲存失敗');
      setShowPropertyModal(false);
      fetchProperties();
    } catch (err) { alert('儲存失敗: ' + err.message); }
  }

  async function deleteProperty(id) {
    if (!confirm('確定要刪除此物業？')) return;
    try {
      const res = await fetch(`/api/rentals/properties/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) return alert(data.error || '刪除失敗');
      fetchProperties();
    } catch (err) { alert('刪除失敗: ' + err.message); }
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
      alert('請選擇會計科目');
      return;
    }
    try {
      const url = editingContract ? `/api/rentals/contracts/${editingContract.id}` : '/api/rentals/contracts';
      const method = editingContract ? 'PUT' : 'POST';
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(contractForm) });
      const data = await res.json();
      if (!res.ok) return alert(data?.error?.message || data?.error || '儲存失敗');
      setShowContractModal(false);
      fetchContracts();
      fetchProperties();
    } catch (err) { alert('儲存失敗: ' + err.message); }
  }

  async function deleteContract(id) {
    if (!confirm('確定要刪除此合約？')) return;
    try {
      const res = await fetch(`/api/rentals/contracts/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) return alert(data.error || '刪除失敗');
      fetchContracts();
    } catch (err) { alert('刪除失敗: ' + err.message); }
  }

  async function handleDepositAction(contractId, action) {
    if (!confirm(action === 'depositReceive' ? '確定收取押金？' : '確定退還押金？')) return;
    try {
      const res = await fetch(`/api/rentals/contracts/${contractId}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action })
      });
      const data = await res.json();
      if (!res.ok) return alert(data.error || '操作失敗');
      alert('操作成功');
      fetchContracts();
    } catch (err) { alert('操作失敗: ' + err.message); }
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
      if (!res.ok) return alert(data.error || '產生失敗');
      alert(`已產生 ${data.created} 筆，跳過 ${data.skipped} 筆`);
      fetchIncomes();
    } catch (err) { alert('產生失敗: ' + err.message); }
  }

  function openIncomePayment(income) {
    setPayingIncomeId(income.id);
    setIncomePayForm({
      actualAmount: String(income.expectedAmount),
      actualDate: new Date().toISOString().split('T')[0],
      accountId: income.accountId || '',
      paymentMethod: '現金',
      matchTransferRef: '',
      matchBankAccountName: ''
    });
  }

  async function confirmIncomePayment() {
    try {
      const res = await fetch(`/api/rentals/income/${payingIncomeId}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(incomePayForm)
      });
      const data = await res.json();
      if (!res.ok) return alert(data.error || '確認失敗');
      alert(`已確認收款 (${data.status === 'partial' ? '部分收款' : '全額收款'})`);
      setPayingIncomeId(null);
      fetchIncomes();
      fetchSummary();
    } catch (err) { alert('確認失敗: ' + err.message); }
  }

  // ==================== TAXES ====================
  async function saveTax() {
    try {
      const res = await fetch('/api/rentals/taxes', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(taxForm)
      });
      const data = await res.json();
      if (!res.ok) return alert(data.error || '儲存失敗');
      setShowTaxModal(false);
      fetchTaxes();
    } catch (err) { alert('儲存失敗: ' + err.message); }
  }

  async function confirmTaxPayment() {
    try {
      const res = await fetch(`/api/rentals/taxes/${payingTaxId}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(taxPayForm)
      });
      const data = await res.json();
      if (!res.ok) return alert(data.error || '確認失敗');
      alert('稅款已確認繳納');
      setPayingTaxId(null);
      fetchTaxes();
    } catch (err) { alert('確認失敗: ' + err.message); }
  }

  // ==================== MAINTENANCE ====================
  async function saveMaintenance() {
    if (!maintenanceForm.accountingSubjectId) {
      alert('請選擇會計科目');
      return;
    }
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
        if (!res.ok) return alert(data?.error?.message || data?.error || '更新失敗');
        setShowMaintenanceModal(false);
        setEditingMaintenance(null);
        fetchMaintenances();
      } catch (err) { alert('更新失敗: ' + err.message); }
      return;
    }
    if (!maintenanceForm.accountId) {
      alert('請選擇支出戶頭（存檔後將同步至出納待出納）');
      return;
    }
    try {
      const res = await fetch('/api/rentals/maintenance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(maintenanceForm)
      });
      const data = await res.json();
      if (!res.ok) return alert(data?.error?.message || data?.error || '儲存失敗');
      setShowMaintenanceModal(false);
      fetchMaintenances();
    } catch (err) { alert('儲存失敗: ' + err.message); }
  }

  async function deleteMaintenance(m) {
    if (m.status === 'paid' || m.cashTransactionId) {
      alert('已付款的維護費不可刪除');
      return;
    }
    if (!confirm(`確定要刪除此筆維護紀錄嗎？`)) return;
    try {
      const res = await fetch(`/api/rentals/maintenance/${m.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json();
        return alert(data?.error?.message || data?.error || '刪除失敗');
      }
      fetchMaintenances();
    } catch (err) { alert('刪除失敗: ' + err.message); }
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
      <Navigation borderColor="border-teal-500" />

      <div className="max-w-7xl mx-auto px-4 py-6">
        <h2 className="text-2xl font-bold text-gray-800 mb-4">租屋管理</h2>

        {/* Tab Navigation */}
        <div className="flex gap-1 mb-6 border-b overflow-x-auto">
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
                        <th className="text-left px-3 py-2">物業</th>
                        <th className="text-left px-3 py-2">租客</th>
                        <th className="text-right px-3 py-2">應收</th>
                        <th className="text-left px-3 py-2">到期日</th>
                        <th className="text-center px-3 py-2">狀態</th>
                        <th className="text-right px-3 py-2">實收</th>
                        <th className="text-left px-3 py-2">收款日</th>
                        <th className="text-center px-3 py-2">操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {incomes.length === 0 ? (
                        <tr><td colSpan={8} className="text-center py-8 text-gray-400">暫無資料</td></tr>
                      ) : incomes.map(income => {
                        const isOverdue = income.status === 'pending' && income.dueDate < new Date().toISOString().split('T')[0];
                        return (
                          <tr key={income.id} className={`border-t hover:bg-gray-50 ${isOverdue ? 'bg-red-50' : ''}`}>
                            <td className="px-3 py-2">{income.propertyName}</td>
                            <td className="px-3 py-2">{income.tenantName}</td>
                            <td className="px-3 py-2 text-right font-medium">${fmt(income.expectedAmount)}</td>
                            <td className="px-3 py-2">{income.dueDate}</td>
                            <td className="px-3 py-2 text-center">
                              <StatusBadge value={isOverdue ? 'overdue' : income.status} list={INCOME_STATUSES} />
                            </td>
                            <td className="px-3 py-2 text-right">{income.actualAmount ? `$${fmt(income.actualAmount)}` : '-'}</td>
                            <td className="px-3 py-2">{income.actualDate || '-'}</td>
                            <td className="px-3 py-2 text-center">
                              {(income.status === 'pending') && (
                                <button onClick={() => openIncomePayment(income)}
                                  className="text-teal-600 hover:text-teal-800 text-xs font-medium">
                                  確認收款
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Inline payment form */}
                {payingIncomeId && (
                  <div className="mt-4 bg-teal-50 border border-teal-200 rounded-lg p-4">
                    <h4 className="font-medium text-teal-800 mb-3">確認收款</h4>
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
                    </div>
                    <div className="mt-3 flex gap-2">
                      <button onClick={confirmIncomePayment} className="bg-teal-600 text-white px-4 py-1.5 rounded text-sm hover:bg-teal-700">確認</button>
                      <button onClick={() => setPayingIncomeId(null)} className="bg-gray-300 text-gray-700 px-4 py-1.5 rounded text-sm hover:bg-gray-400">取消</button>
                    </div>
                  </div>
                )}
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

                {/* Group by building */}
                {(() => {
                  const grouped = {};
                  properties.forEach(p => {
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
                              <th className="text-left px-3 py-2">名稱</th>
                              <th className="text-left px-3 py-2">地址</th>
                              <th className="text-left px-3 py-2">單元</th>
                              <th className="text-center px-3 py-2">狀態</th>
                              <th className="text-left px-3 py-2">目前租客</th>
                              <th className="text-left px-3 py-2">收租帳戶</th>
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
                                  {c.depositReceived && !c.depositRefunded && (
                                    <button onClick={() => handleDepositAction(c.id, 'depositRefund')} className="text-xs text-orange-600 hover:underline ml-1">退押金</button>
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
                  <button onClick={() => setShowTaxModal(true)} className="bg-blue-600 text-white px-3 py-1.5 rounded text-sm hover:bg-blue-700 ml-auto">
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
                            {tax.status === 'pending' && (
                              <button onClick={() => { setPayingTaxId(tax.id); setTaxPayForm({ accountId: '', paymentDate: new Date().toISOString().split('T')[0] }); }}
                                className="text-teal-600 hover:text-teal-800 text-xs font-medium">
                                確認繳納
                              </button>
                            )}
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
                    setMaintenanceForm({ propertyId: '', maintenanceDate: new Date().toISOString().split('T')[0], category: '水電', amount: '', accountingSubjectId: '', accountId: '', note: '' });
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
                          <td className="px-3 py-2 text-gray-500 text-xs">{m.note || '-'}</td>
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
                <button onClick={saveTenant} className="px-4 py-2 text-sm bg-teal-600 text-white rounded hover:bg-teal-700">儲存</button>
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
                  <label className="text-sm text-gray-600">單元編號</label>
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
              </div>
              <div className="flex justify-end gap-2 mt-6">
                <button onClick={() => setShowPropertyModal(false)} className="px-4 py-2 text-sm bg-gray-200 rounded hover:bg-gray-300">取消</button>
                <button onClick={saveProperty} className="px-4 py-2 text-sm bg-teal-600 text-white rounded hover:bg-teal-700">儲存</button>
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
                <button onClick={saveContract} className="px-4 py-2 text-sm bg-teal-600 text-white rounded hover:bg-teal-700">儲存</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==================== MODAL: TAX ==================== */}
      {showTaxModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowTaxModal(false)}>
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
            <div className="p-6">
              <h3 className="text-lg font-bold text-gray-800 mb-4">新增稅款</h3>
              <div className="space-y-3">
                <div>
                  <label className="text-sm text-gray-600">物業 *</label>
                  <select value={taxForm.propertyId} onChange={e => setTaxForm(f => ({ ...f, propertyId: e.target.value }))}
                    className="w-full border rounded px-3 py-2 text-sm">
                    <option value="">選擇物業</option>
                    {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-sm text-gray-600">年度 *</label>
                  <input type="number" value={taxForm.taxYear} onChange={e => setTaxForm(f => ({ ...f, taxYear: e.target.value }))}
                    className="w-full border rounded px-3 py-2 text-sm" />
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
                <button onClick={() => setShowTaxModal(false)} className="px-4 py-2 text-sm bg-gray-200 rounded hover:bg-gray-300">取消</button>
                <button onClick={saveTax} className="px-4 py-2 text-sm bg-teal-600 text-white rounded hover:bg-teal-700">儲存</button>
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
                <div>
                  <label className="text-sm text-gray-600">備註</label>
                  <textarea value={maintenanceForm.note} onChange={e => setMaintenanceForm(f => ({ ...f, note: e.target.value }))}
                    className="w-full border rounded px-3 py-2 text-sm" rows={2} />
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-6">
                <button onClick={() => { setShowMaintenanceModal(false); setEditingMaintenance(null); }} className="px-4 py-2 text-sm bg-gray-200 rounded hover:bg-gray-300">取消</button>
                <button onClick={saveMaintenance} className="px-4 py-2 text-sm bg-teal-600 text-white rounded hover:bg-teal-700">儲存</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
