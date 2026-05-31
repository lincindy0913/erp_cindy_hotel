'use client';

import { useState, useEffect, useMemo, Fragment, Suspense } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { useSearchParams, useRouter } from 'next/navigation';
import Navigation from '@/components/Navigation';
import NotificationBanner from '@/components/NotificationBanner';
import AttachmentSection from '@/components/AttachmentSection';
import EngineeringHeaderInsights from '@/components/engineering/EngineeringHeaderInsights';
import { useToast } from '@/context/ToastContext';
import { useConfirm } from '@/context/ConfirmContext';
import { sortRows, useColumnSort, SortableTh } from '@/components/SortableTh';
import ConfirmModal, { useConfirmDialog } from '@/components/ConfirmModal';
import { todayStr, localDateStr } from '@/lib/localDate';
import IncomeTab from '@/components/engineering/IncomeTab';
import MaterialsTab from '@/components/engineering/MaterialsTab';
import InputInvoicesTab from '@/components/engineering/InputInvoicesTab';
import OutputInvoicesTab from '@/components/engineering/OutputInvoicesTab';
import CompanyInvoicesTab from '@/components/engineering/CompanyInvoicesTab';
import ContractsTab from '@/components/engineering/ContractsTab';
import ProjectMgmtTab from '@/components/engineering/ProjectMgmtTab';
import PaymentsTab from '@/components/engineering/PaymentsTab';

function makeCompanyInvPeriods() {
  const today = new Date();
  const minRoc = (today.getFullYear() - 1911) - 2;
  const maxRoc = (today.getFullYear() - 1911) + 1;
  const result = [];
  for (let y = minRoc; y <= maxRoc; y++) {
    result.push(`${y}.1-2`, `${y}.3-4`, `${y}.5-6`, `${y}.7-8`, `${y}.9-10`, `${y}.11-12`);
  }
  return result;
}
const COMPANY_INV_PERIODS = makeCompanyInvPeriods();

const TABS = [
  { key: 'projects', label: '工程案' },
  { key: 'projectMgmt', label: '專案管理' },
  { key: 'contracts', label: '合約與期數' },
  { key: 'materials', label: '材料使用' },
  { key: 'payments', label: '付款單' },
  { key: 'income', label: '收款管理' },
  { key: 'inputInvoices', label: '廠商進項發票' },
  { key: 'outputInvoices', label: '業主銷項發票' },
  { key: 'companyInvoices', label: '分業進項' },
];

const INPUT_INVOICE_TYPES = ['電子發票', '紙本發票', '三聯式統一發票', '二聯式統一發票'];
const INPUT_INVOICE_STATUSES = ['已取得', '已對帳', '已入帳'];
const OUTPUT_INVOICE_TYPES = ['電子發票', '紙本發票', '三聯式統一發票', '二聯式統一發票'];
const OUTPUT_INVOICE_STATUSES = ['已開立', '已作廢'];

const VALID_TAB_KEYS = new Set(TABS.map((t) => t.key));

const PROJECT_STATUS = ['進行中', '已結案', '暫停'];

function formatNum(n) {
  if (n == null || n === '') return '－';
  return Number(n).toLocaleString('zh-TW', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

// 取得付款單實際已付金額：已執行的用 executions.actualAmount 合計，否則用 po.amount
function getActualPaid(po) {
  if (po.status === '已執行' && po.executions && po.executions.length > 0) {
    return po.executions.reduce((s, e) => s + Number(e.actualAmount || 0), 0);
  }
  return Number(po.amount || 0);
}

function EngineeringPageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const tabParam = searchParams.get('tab');
  const [activeTab, setActiveTab] = useState(() => (VALID_TAB_KEYS.has(tabParam) ? tabParam : 'projects'));
  const [projects, setProjects] = useState([]);
  const [contracts, setContracts] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);

  const [showProjectModal, setShowProjectModal] = useState(false);
  const [showTermModal, setShowTermModal] = useState(false);
  const [editingProject, setEditingProject] = useState(null);
  const [editingTerm, setEditingTerm] = useState(null);

  const [projectForm, setProjectForm] = useState({ code: '', name: '', clientName: '', clientContractAmount: '', startDate: '', endDate: '', budget: '', status: '進行中', warehouseId: '', departmentId: '', location: '', buildingNo: '', permitNo: '', note: '' });
  const [termForm, setTermForm] = useState({ termName: '', amount: '', dueDate: '', status: 'pending', paidAt: '', paymentOrderId: '', note: '' });

  const [unassignedInvCount, setUnassignedInvCount] = useState(0);

  const [filterProjectId, setFilterProjectId] = useState('');
  const [warehouseDepartments, setWarehouseDepartments] = useState({ list: [], byName: {} });
  const [paymentOrders, setPaymentOrders] = useState([]);
  /** 儀表板用：全工程案收款累計（不受收款 tab 篩選影響） */
  const [dashStats, setDashStats] = useState({ totalIncome: 0, totalInputInvoices: 0, totalOutputInvoices: 0, byProject: {} });

  // 搜尋篩選
  const [searchDateFrom, setSearchDateFrom] = useState('');
  const [searchDateTo, setSearchDateTo] = useState('');
  const [searchSupplierId, setSearchSupplierId] = useState('');
  const [searchWarehouse, setSearchWarehouse] = useState('');

  const { sortKey: engProjKey, sortDir: engProjDir, toggleSort: engProjToggle } = useColumnSort('code', 'asc');

  // 搜尋篩選後的工程案
  const filteredProjects = useMemo(() => {
    return projects.filter(p => {
      // 日期區間：工程案的起迄日與搜尋區間有交集
      if (searchDateFrom) {
        const pEnd = p.endDate || '9999-12-31';
        if (pEnd < searchDateFrom) return false;
      }
      if (searchDateTo) {
        const pStart = p.startDate || '0000-01-01';
        if (pStart > searchDateTo) return false;
      }
      // 館別
      if (searchWarehouse) {
        const whName = p.warehouseRef?.name || p.warehouse || '';
        if (whName !== searchWarehouse) return false;
      }
      // 廠商：檢查該工程案是否有合約與此廠商相關
      if (searchSupplierId) {
        const hasSupplier = contracts.some(c => c.projectId === p.id && String(c.supplierId) === searchSupplierId);
        if (!hasSupplier) return false;
      }
      return true;
    });
  }, [projects, contracts, searchDateFrom, searchDateTo, searchWarehouse, searchSupplierId]);

  const sortedProjects = useMemo(
    () =>
      sortRows(filteredProjects, engProjKey, engProjDir, {
        code: (p) => p.code || '',
        name: (p) => p.name || '',
        clientName: (p) => p.clientName || '',
        whDept: (p) => `${p.warehouseRef?.name || p.warehouse || ''} ${p.departmentRef?.name || ''}`,
        location: (p) => [p.location, p.buildingNo, p.permitNo].filter(Boolean).join(' '),
        startDate: (p) => p.startDate || '',
        endDate: (p) => p.endDate || '',
        budget: (p) => Number(p.budget || 0),
        status: (p) => p.status || '',
      }),
    [filteredProjects, engProjKey, engProjDir]
  );


  const dashboardStats = useMemo(() => {
    const activeProjects = projects.filter((p) => p.status === '進行中').length;
    const sumBudget = projects.reduce((s, p) => s + Number(p.budget || 0), 0);
    const sumClient = projects.reduce((s, p) => s + Number(p.clientContractAmount || 0), 0);
    const sumVendorContracts = contracts.reduce((s, c) => s + Number(c.totalAmount || 0), 0);
    let paidExecuted = 0;
    for (const o of paymentOrders) {
      if (o.status === '已執行') paidExecuted += getActualPaid(o);
    }
    const sumIncome         = dashStats.totalIncome;
    const sumInputInvoices  = dashStats.totalInputInvoices;
    const sumOutputInvoices = dashStats.totalOutputInvoices;
    const today = todayStr();
    const weekLater = new Date();
    weekLater.setDate(weekLater.getDate() + 7);
    const weekEnd = localDateStr(weekLater);
    // O(N) 預先建 Map，避免巢狀 O(N×M×K) filter
    const poByTermId = new Map();
    for (const po of paymentOrders) {
      if (po.status !== '已執行') continue;
      const key = String(po.sourceRecordId);
      const arr = poByTermId.get(key) || [];
      arr.push(po);
      poByTermId.set(key, arr);
    }
    let overdueTerms = 0;
    let dueThisWeek = 0;
    for (const c of contracts) {
      for (const t of c.terms || []) {
        const amt = Number(t.amount || 0);
        if (amt <= 0) continue;
        const paid = (poByTermId.get(String(t.id)) || [])
          .reduce((s, po) => s + getActualPaid(po), 0);
        const remaining = amt - paid;
        if (remaining <= 0.005) continue;
        const due = t.dueDate;
        if (!due) continue;
        if (due < today) overdueTerms++;
        else if (due <= weekEnd) dueThisWeek++;
      }
    }
    return {
      activeProjects,
      sumBudget,
      sumClient,
      sumVendorContracts,
      paidExecuted,
      sumIncome,
      sumInputInvoices,
      sumOutputInvoices,
      overdueTerms,
      dueThisWeek,
      projectCount: projects.length,
    };
  }, [projects, contracts, paymentOrders, dashStats]);

  const [termSaving, setTermSaving] = useState(false);
  const [paymentSaving, setPaymentSaving] = useState(false);


  const { data: session } = useSession();
  const { showToast } = useToast();
  const confirm = useConfirm();
  const { dialog: confirmDlg, confirm: askConfirm, close: closeConfirm } = useConfirmDialog();

  function switchEngineeringTab(key) {
    setActiveTab(key);
    router.push(`/engineering?tab=${encodeURIComponent(key)}`, { scroll: false });
  }

  useEffect(() => {
    const t = searchParams.get('tab');
    if (t && VALID_TAB_KEYS.has(t)) setActiveTab(t);
  }, [searchParams]);

  useEffect(() => {
    fetchProjects();
    fetchSuppliers();
    refreshDashStats();
    fetch('/api/company-expenses?type=invoice&projectId=null')
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(data => setUnassignedInvCount(Array.isArray(data) ? data.length : 0))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const ctrl = new AbortController();
    const { signal } = ctrl;
    if (activeTab === 'projects') { fetchContracts(undefined, signal); fetchPaymentOrders(signal); refreshDashStats(signal); fetchWarehouseDepartments(signal); }
    if (activeTab === 'contracts') fetchContracts(filterProjectId || undefined, signal);
    if (activeTab === 'materials') fetchContracts(undefined, signal);
    if (activeTab === 'projectMgmt') { fetchContracts(undefined, signal); fetchPaymentOrders(signal); fetchWarehouseDepartments(signal); }
    if (activeTab === 'payments') {
      fetchPaymentOrders(signal);
      fetchAccounts(signal);
      fetchContracts(undefined, signal);
      fetch('/api/settings/payment-methods', { signal }).then(res => res.ok ? res.json() : Promise.reject()).then(d => Array.isArray(d) && d.length > 0 ? setPaymentMethodOptions(d.map(x => x.name || x)) : null).catch(e => { if (e?.name !== 'AbortError') console.error(e); });
    }
    return () => ctrl.abort();
  }, [activeTab, filterProjectId]);

  async function fetchProjects(signal) {
    setLoading(true);
    try {
      const res = await fetch('/api/engineering/projects', signal ? { signal } : undefined);
      const data = await res.json();
      setProjects(Array.isArray(data) ? data : []);
    } catch (e) { if (e?.name !== 'AbortError') { console.error(e); setProjects([]); } }
    setLoading(false);
  }

  async function fetchContracts(projectId, signal) {
    try {
      const url = projectId ? `/api/engineering/contracts?projectId=${projectId}` : '/api/engineering/contracts';
      const res = await fetch(url, signal ? { signal } : undefined);
      const data = await res.json();
      setContracts(Array.isArray(data) ? data : []);
    } catch (e) { if (e?.name !== 'AbortError') { console.error(e); setContracts([]); } }
  }

  async function fetchSuppliers() {
    try {
      const res = await fetch('/api/suppliers?all=true');
      const data = await res.json();
      setSuppliers(Array.isArray(data) ? data : []);
    } catch { setSuppliers([]); }
  }

  async function fetchWarehouseDepartments(signal) {
    try {
      const res = await fetch('/api/warehouse-departments', signal ? { signal } : undefined);
      const data = await res.json();
      setWarehouseDepartments({ list: data.list || [], byName: data.byName || {} });
    } catch (e) { if (e?.name !== 'AbortError') setWarehouseDepartments({ list: [], byName: {} }); }
  }

  async function fetchPaymentOrders(signal) {
    try {
      const res = await fetch('/api/payment-orders?sourceType=engineering', signal ? { signal } : undefined);
      const data = await res.json();
      setPaymentOrders(Array.isArray(data) ? data : []);
    } catch (e) { if (e?.name !== 'AbortError') setPaymentOrders([]); }
  }

  async function refreshDashStats(signal) {
    try {
      const res = await fetch('/api/engineering/dashboard-stats', signal ? { signal } : undefined);
      if (res.ok) setDashStats(await res.json());
    } catch (e) { if (e?.name === 'AbortError') return; }
  }

  async function fetchAccounts(signal) {
    try {
      const res = await fetch('/api/cashflow/accounts', signal ? { signal } : undefined);
      const data = await res.json();
      setAccounts(Array.isArray(data) ? data : []);
    } catch (e) { if (e?.name !== 'AbortError') setAccounts([]); }
  }



  function openAddProject() {
    setEditingProject(null);
    setProjectForm({ code: '', name: '', clientName: '', clientContractAmount: '', startDate: '', endDate: '', budget: '', status: '進行中', warehouseId: '', departmentId: '', location: '', buildingNo: '', permitNo: '', note: '' });
    setShowProjectModal(true);
  }

  function openEditProject(p) {
    setEditingProject(p);
    setProjectForm({
      code: p.code, name: p.name, clientName: p.clientName || '',
      clientContractAmount: p.clientContractAmount != null ? String(p.clientContractAmount) : '',
      startDate: p.startDate || '', endDate: p.endDate || '',
      budget: p.budget != null ? String(p.budget) : '',
      status: p.status || '進行中',
      warehouseId: p.warehouseId != null ? String(p.warehouseId) : '',
      departmentId: p.departmentId != null ? String(p.departmentId) : '',
      location: p.location || '', buildingNo: p.buildingNo || '', permitNo: p.permitNo || '', note: p.note || '',
    });
    setShowProjectModal(true);
  }

  async function saveProject() {
    if (!projectForm.code?.trim() || !projectForm.name?.trim()) { showToast('請填寫工程代碼與名稱', 'error'); return; }
    setProjectSaving(true);
    try {
      const body = {
        code: projectForm.code.trim(), name: projectForm.name.trim(),
        clientName: projectForm.clientName?.trim() || null,
        clientContractAmount: projectForm.clientContractAmount ? parseFloat(projectForm.clientContractAmount) : null,
        startDate: projectForm.startDate || null, endDate: projectForm.endDate || null,
        budget: projectForm.budget ? parseFloat(projectForm.budget) : null,
        status: projectForm.status,
        warehouseId: projectForm.warehouseId || null, departmentId: projectForm.departmentId || null,
        location: projectForm.location?.trim() || null, buildingNo: projectForm.buildingNo?.trim() || null,
        permitNo: projectForm.permitNo?.trim() || null, note: projectForm.note?.trim() || null,
      };
      if (editingProject) {
        const res = await fetch(`/api/engineering/projects/${editingProject.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        if (!res.ok) { const e = await res.json().catch(() => ({})); showToast(e.error || '更新失敗', 'error'); return; }
        showToast('已更新', 'success');
      } else {
        const res = await fetch('/api/engineering/projects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        if (!res.ok) { const e = await res.json().catch(() => ({})); showToast(e.error || '新增失敗', 'error'); return; }
        showToast('已新增', 'success');
      }
      setShowProjectModal(false); fetchProjects();
    } catch (e) { showToast(e.message || '儲存失敗', 'error'); }
    finally { setProjectSaving(false); }
  }

  function deleteProject(p) {
    askConfirm(`確定刪除工程案「${p.name}」？\n其合約與材料記錄也會一併刪除。`, async () => {
      try {
        const res = await fetch(`/api/engineering/projects/${p.id}`, { method: 'DELETE' });
        if (!res.ok) { const e = await res.json().catch(() => ({})); showToast(e.error || '刪除失敗', 'error'); return; }
        fetchProjects();
        if (filterProjectId === String(p.id)) setFilterProjectId('');
      } catch (e) { showToast('刪除失敗', 'error'); }
    });
  }

  function openPaymentModal(formData) {
    const editingId = formData?._editingId || null;
    const { _editingId, ...cleanForm } = formData || {};
    setEditingPaymentOrder(editingId ? { id: editingId } : null);
    setPaymentForm({ projectId: '', termId: '', contractId: '', supplierId: '', supplierName: '', amount: '', netAmount: '', paymentMethod: '轉帳', accountId: '', dueDate: todayStr(), summary: '', note: '', materials: [], ...cleanForm });
    setShowPaymentModal(true);
  }

  function openMarkTermPaid(term) {
    setEditingTerm(term);
    setTermForm({ termName: term.termName || '', amount: String(term.amount), dueDate: term.dueDate || '',
      content: term.content || '', status: 'paid', paidAt: todayStr(),
      paymentOrderId: term.paymentOrderId ? String(term.paymentOrderId) : '', note: term.note || '' });
    setShowTermModal(true);
  }

  function openUnmarkTermPaid(term) {
    setEditingTerm(term);
    setTermForm({ termName: term.termName || '', amount: String(term.amount), dueDate: term.dueDate || '',
      content: term.content || '', status: 'pending', paidAt: '', paymentOrderId: '', note: term.note || '' });
    setShowTermModal(true);
  }

  async function saveTerm() {
    if (!editingTerm) return;
    setTermSaving(true);
    try {
      const res = await fetch(`/api/engineering/contract-terms/${editingTerm.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: termForm.status, paidAt: termForm.paidAt || null,
          paymentOrderId: termForm.paymentOrderId ? parseInt(termForm.paymentOrderId) : null,
          termName: termForm.termName || null, amount: termForm.amount ? parseFloat(termForm.amount) : undefined,
          dueDate: termForm.dueDate || null, content: termForm.content || null, note: termForm.note || null,
        }),
      });
      if (!res.ok) { const d = await res.json(); showToast(d.error?.message || '更新失敗', 'error'); setTermSaving(false); return; }
      setShowTermModal(false);
      fetchContracts(filterProjectId || undefined);
    } catch (e) { showToast('更新失敗', 'error'); }
    finally { setTermSaving(false); }
  }

  // 列印篩選後的工程案
  function handlePrintProjects() {
    if (sortedProjects.length === 0) {
      showToast('沒有可列印的資料', 'info');
      return;
    }
    const filterDesc = [
      searchDateFrom || searchDateTo ? `日期：${searchDateFrom || '?'} ~ ${searchDateTo || '?'}` : '',
      searchSupplierId ? `廠商：${suppliers.find(s => String(s.id) === searchSupplierId)?.name || ''}` : '',
      searchWarehouse ? `館別：${searchWarehouse}` : '',
    ].filter(Boolean).join('　');

    // 取得每個工程案的相關合約資訊
    const projectRows = sortedProjects.map(p => {
      const projContracts = contracts.filter(c => c.projectId === p.id && (!searchSupplierId || String(c.supplierId) === searchSupplierId));
      const totalContractAmt = projContracts.reduce((s, c) => s + Number(c.totalAmount || 0), 0);
      const supplierNames = [...new Set(projContracts.map(c => c.supplier?.name).filter(Boolean))].join('、');
      return { ...p, projContracts, totalContractAmt, supplierNames };
    });

    const grandTotal = projectRows.reduce((s, p) => s + Number(p.budget || 0), 0);
    const grandContractTotal = projectRows.reduce((s, p) => s + p.totalContractAmt, 0);

    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>工程案列表</title>
<style>
  body { font-family: "Microsoft JhengHei","PingFang TC",sans-serif; margin: 20px; font-size: 12px; }
  h2 { text-align: center; margin-bottom: 4px; }
  .filter-desc { text-align: center; color: #666; margin-bottom: 12px; font-size: 11px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #ccc; padding: 4px 6px; text-align: left; }
  th { background: #f5f5f5; font-weight: 600; }
  .right { text-align: right; }
  .center { text-align: center; }
  .total-row { font-weight: bold; background: #fef3c7; }
  @media print { body { margin: 0; } }
</style></head><body>
<h2>工程案列表</h2>
${filterDesc ? `<div class="filter-desc">${filterDesc}</div>` : ''}
<div style="text-align:right;margin-bottom:4px;font-size:10px;color:#999">列印時間：${new Date().toLocaleString('zh-TW')}</div>
<table>
<thead><tr>
  <th>代碼</th><th>名稱</th><th>業主</th><th>館別</th><th>廠商</th>
  <th>起日</th><th>迄日</th><th class="right">預算</th><th class="right">合約總額</th><th class="center">狀態</th>
</tr></thead>
<tbody>
${projectRows.map(p => `<tr>
  <td>${p.code || ''}</td>
  <td>${p.name || ''}</td>
  <td>${p.clientName || ''}</td>
  <td>${p.warehouseRef?.name || p.warehouse || ''}</td>
  <td>${p.supplierNames || ''}</td>
  <td>${p.startDate || ''}</td>
  <td>${p.endDate || ''}</td>
  <td class="right">${formatNum(p.budget)}</td>
  <td class="right">${formatNum(p.totalContractAmt)}</td>
  <td class="center">${p.status || ''}</td>
</tr>`).join('')}
<tr class="total-row">
  <td colspan="7">合計（${projectRows.length} 筆）</td>
  <td class="right">${formatNum(grandTotal)}</td>
  <td class="right">${formatNum(grandContractTotal)}</td>
  <td></td>
</tr>
</tbody></table>
<script>window.onload=function(){window.print();}</script>
</body></html>`;

    const w = window.open('', '_blank');
    if (w) { w.document.write(html); w.document.close(); }
  }

  function handleExportProjectsCsv() {
    if (sortedProjects.length === 0) return;
    const header = ['代碼', '名稱', '業主', '館別', '廠商', '起日', '迄日', '預算', '合約總額', '狀態'];
    const rows = sortedProjects.map((p) => {
      const projContracts = contracts.filter((c) => c.projectId === p.id && (!searchSupplierId || String(c.supplierId) === searchSupplierId));
      const totalContractAmt = projContracts.reduce((s, c) => s + Number(c.totalAmount || 0), 0);
      const supplierNames = [...new Set(projContracts.map((c) => c.supplier?.name).filter(Boolean))].join('、');
      return [
        p.code || '',
        p.name || '',
        p.clientName || '',
        p.warehouseRef?.name || p.warehouse || '',
        supplierNames,
        p.startDate || '',
        p.endDate || '',
        Number(p.budget || 0),
        totalContractAmt,
        p.status || '',
      ];
    });
    const csvRows = [header.join(',')];
    rows.forEach((r) => {
      csvRows.push(r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','));
    });
    const blob = new Blob(['\uFEFF' + csvRows.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `工程案列表_${todayStr()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation borderColor="border-amber-600" />
      <NotificationBanner moduleFilter="engineering" />
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-gray-800">工程會計</h2>
          <p className="text-sm text-gray-500 mt-1">營造工程案、廠商合約期數付款、材料使用追蹤（一般人事／廠商請款請至「付款」「費用」）</p>
        </div>

        <EngineeringHeaderInsights stats={dashboardStats} onSwitchTab={switchEngineeringTab} />

        <div className="flex flex-wrap gap-1 mb-6 bg-white rounded-lg shadow p-1">
          {TABS.map(tab => (
            <button key={tab.key} type="button" onClick={() => switchEngineeringTab(tab.key)}
              className={`flex-1 py-2.5 rounded-md text-sm font-medium flex items-center justify-center gap-1.5 ${activeTab === tab.key ? 'bg-amber-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>
              {tab.label}
              {tab.key === 'companyInvoices' && unassignedInvCount > 0 && (
                <span className={`text-xs rounded-full px-1.5 py-0.5 font-bold leading-none min-w-[18px] text-center ${activeTab === tab.key ? 'bg-white text-amber-700' : 'bg-amber-500 text-white'}`}>
                  {unassignedInvCount}
                </span>
              )}
            </button>
          ))}
        </div>

        {loading && activeTab === 'projects' && (
          <div className="flex justify-center py-12"><div className="w-8 h-8 border-4 border-amber-200 border-t-amber-600 rounded-full animate-spin" /></div>
        )}

        {/* ===== 工程案 TAB ===== */}
        {activeTab === 'projects' && !loading && (
          <>
          {/* 搜尋列 */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-4">
            <div className="flex flex-wrap gap-3 items-end">
              <div>
                <label htmlFor="f" className="block text-xs text-gray-500 mb-1">起始日期</label>
                <input id="f" type="date" value={searchDateFrom} onChange={e => setSearchDateFrom(e.target.value)} className="border rounded-lg px-3 py-1.5 text-sm" />
              </div>
              <div>
                <label htmlFor="f-2" className="block text-xs text-gray-500 mb-1">結束日期</label>
                <input id="f-2" type="date" value={searchDateTo} onChange={e => setSearchDateTo(e.target.value)} className="border rounded-lg px-3 py-1.5 text-sm" />
              </div>
              <div>
                <label htmlFor="f-3" className="block text-xs text-gray-500 mb-1">廠商</label>
                <select id="f-3" value={searchSupplierId} onChange={e => setSearchSupplierId(e.target.value)} className="border rounded-lg px-3 py-1.5 text-sm min-w-[140px]">
                  <option value="">全部</option>
                  {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="f-22" className="block text-xs text-gray-500 mb-1">館別</label>
                <select id="f-22" value={searchWarehouse} onChange={e => setSearchWarehouse(e.target.value)} className="border rounded-lg px-3 py-1.5 text-sm min-w-[120px]">
                  <option value="">全部</option>
                  {(warehouseDepartments.list || []).filter(w => w.type === 'building').map(w => <option key={w.id} value={w.name}>{w.name}</option>)}
                </select>
              </div>
              <button onClick={() => { setSearchDateFrom(''); setSearchDateTo(''); setSearchSupplierId(''); setSearchWarehouse(''); }} className="px-3 py-1.5 border rounded-lg text-sm text-gray-600 hover:bg-gray-100">清除</button>
              <button type="button" onClick={handlePrintProjects} className="px-4 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm">列印</button>
              <button type="button" onClick={handleExportProjectsCsv} className="px-4 py-1.5 bg-white border border-green-600 text-green-700 rounded-lg hover:bg-green-50 text-sm">匯出 CSV</button>
              {(searchDateFrom || searchDateTo || searchSupplierId || searchWarehouse) && (
                <span className="text-xs text-amber-600">篩選中：{filteredProjects.length} / {projects.length} 筆</span>
              )}
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 border-b flex justify-between items-center">
              <h3 className="font-semibold text-gray-800">工程案列表</h3>
              <button onClick={openAddProject} className="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 text-sm">＋ 新增工程案</button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 sticky top-0 z-10">
                  <tr>
                    <SortableTh label="代碼" colKey="code" sortKey={engProjKey} sortDir={engProjDir} onSort={engProjToggle} className="px-4 py-2" />
                    <SortableTh label="名稱" colKey="name" sortKey={engProjKey} sortDir={engProjDir} onSort={engProjToggle} className="px-4 py-2" />
                    <SortableTh label="業主" colKey="clientName" sortKey={engProjKey} sortDir={engProjDir} onSort={engProjToggle} className="px-4 py-2" />
                    <SortableTh label="館別／部門" colKey="whDept" sortKey={engProjKey} sortDir={engProjDir} onSort={engProjToggle} className="px-4 py-2" />
                    <SortableTh label="工程地點／建造(使)造號碼" colKey="location" sortKey={engProjKey} sortDir={engProjDir} onSort={engProjToggle} className="px-4 py-2" />
                    <SortableTh label="起日" colKey="startDate" sortKey={engProjKey} sortDir={engProjDir} onSort={engProjToggle} className="px-4 py-2" />
                    <SortableTh label="迄日" colKey="endDate" sortKey={engProjKey} sortDir={engProjDir} onSort={engProjToggle} className="px-4 py-2" />
                    <SortableTh label="預算" colKey="budget" sortKey={engProjKey} sortDir={engProjDir} onSort={engProjToggle} className="px-4 py-2" align="right" />
                    <SortableTh label="狀態" colKey="status" sortKey={engProjKey} sortDir={engProjDir} onSort={engProjToggle} className="px-4 py-2" />
                    <th className="px-4 py-2 text-center text-sm font-medium text-gray-700">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {sortedProjects.length === 0 ? (
                    <tr><td colSpan={10} className="px-4 py-8 text-center text-gray-400">{(searchDateFrom || searchDateTo || searchSupplierId || searchWarehouse) ? '無符合條件的工程案' : '尚無工程案，請新增'}</td></tr>
                  ) : sortedProjects.map(p => (
                    <tr key={p.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2 font-mono">
                        <Link href={`/engineering/${p.id}`} className="text-amber-700 hover:underline">{p.code}</Link>
                      </td>
                      <td className="px-4 py-2 font-medium">
                        <Link href={`/engineering/${p.id}`} className="hover:text-amber-700 hover:underline">{p.name}</Link>
                      </td>
                      <td className="px-4 py-2">{p.clientName || '－'}</td>
                      <td className="px-4 py-2">{p.warehouseRef?.name || p.warehouse || '－'} {p.departmentRef ? `／${p.departmentRef.name}` : ''}</td>
                      <td className="px-4 py-2 text-xs">{p.location || '－'} {(p.buildingNo || p.permitNo) ? `（${[p.buildingNo, p.permitNo].filter(Boolean).join('、')}）` : ''}</td>
                      <td className="px-4 py-2">{p.startDate || '－'}</td>
                      <td className="px-4 py-2">{p.endDate || '－'}</td>
                      <td className="px-4 py-2 text-right">{formatNum(p.budget)}</td>
                      <td className="px-4 py-2"><span className={`px-2 py-0.5 rounded text-xs ${p.status === '已結案' ? 'bg-gray-200' : 'bg-amber-100 text-amber-800'}`}>{p.status}</span></td>
                      <td className="px-4 py-2 text-center">
                        <button onClick={() => openEditProject(p)} className="text-amber-600 hover:underline mr-2">編輯</button>
                        <button onClick={() => deleteProject(p)} className="text-red-600 hover:underline">刪除</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          </>
        )}

        {/* ===== 合約與期數 TAB ===== */}
        {activeTab === 'contracts' && (
          <ContractsTab
            projects={projects}
            suppliers={suppliers}
            contracts={contracts}
            paymentOrders={paymentOrders}
            filterProjectId={filterProjectId}
            onFilterChange={setFilterProjectId}
            onMarkTermPaid={openMarkTermPaid}
            onUnmarkTermPaid={openUnmarkTermPaid}
            onRefresh={() => fetchContracts(filterProjectId || undefined)}
            session={session}
          />
        )}

        {/* ===== 專案管理 TAB (含預算追蹤) ===== */}
        {activeTab === 'projectMgmt' && (
          <ProjectMgmtTab
            projects={projects}
            contracts={contracts}
            paymentOrders={paymentOrders}
            warehouseDepartments={warehouseDepartments}
            dashStats={dashStats}
            onMarkTermPaid={openMarkTermPaid}
            onUnmarkTermPaid={openUnmarkTermPaid}
            onOpenPaymentModal={openPaymentModal}
            onSwitchTab={switchEngineeringTab}
          />
        )}

        {/* ===== 付款單 TAB ===== */}
        {activeTab === 'payments' && (
          <PaymentsTab
            paymentOrders={paymentOrders}
            projects={projects}
            suppliers={suppliers}
            warehouseDepartments={warehouseDepartments}
            contracts={contracts}
            onOpenPaymentModal={openPaymentModal}
            onRefresh={fetchPaymentOrders}
          />
        )}

        {/* ===== 材料使用 TAB ===== */}
        {activeTab === 'materials' && <MaterialsTab projects={projects} contracts={contracts} />}

        {/* ===== 收款管理 TAB ===== */}
        {activeTab === 'income' && <IncomeTab projects={projects} onDashStatsChanged={refreshDashStats} />}

      {/* ===== 廠商進項發票 Tab ===== */}
      {activeTab === 'inputInvoices' && <InputInvoicesTab projects={projects} contracts={contracts} onDashStatsChanged={refreshDashStats} />}

      {/* ===== 業主銷項發票 Tab ===== */}
      {activeTab === 'outputInvoices' && <OutputInvoicesTab projects={projects} onDashStatsChanged={refreshDashStats} />}

      </div>

      {/* ===== 工程案 Modal ===== */}
      {showProjectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowProjectModal(false)}>
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full mx-4 p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-4">{editingProject ? '編輯工程案' : '新增工程案'}</h3>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><label htmlFor="f-40" className="block text-xs text-gray-500 mb-1">工程代碼 *</label><input id="f-40" value={projectForm.code} onChange={e => setProjectForm(f => ({ ...f, code: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="例：PRJ-001" disabled={!!editingProject} /></div>
                <div><label htmlFor="f-41" className="block text-xs text-gray-500 mb-1">名稱 *</label><input id="f-41" value={projectForm.name} onChange={e => setProjectForm(f => ({ ...f, name: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label htmlFor="f-42" className="block text-xs text-gray-500 mb-1">業主／客戶</label><input id="f-42" value={projectForm.clientName} onChange={e => setProjectForm(f => ({ ...f, clientName: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
                <div><label htmlFor="f-43" className="block text-xs text-gray-500 mb-1">業主合約金額（收款總額）</label><input id="f-43" type="number" value={projectForm.clientContractAmount} onChange={e => setProjectForm(f => ({ ...f, clientContractAmount: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="0" /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label htmlFor="f-44" className="block text-xs text-gray-500 mb-1">開始日期</label><input id="f-44" type="date" value={projectForm.startDate} onChange={e => setProjectForm(f => ({ ...f, startDate: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
                <div><label htmlFor="f-45" className="block text-xs text-gray-500 mb-1">結束日期</label><input id="f-45" type="date" value={projectForm.endDate} onChange={e => setProjectForm(f => ({ ...f, endDate: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label htmlFor="f-46" className="block text-xs text-gray-500 mb-1">預算</label><input id="f-46" type="number" value={projectForm.budget} onChange={e => setProjectForm(f => ({ ...f, budget: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" step="0.01" /></div>
                <div><label htmlFor="f-47" className="block text-xs text-gray-500 mb-1">狀態</label><select id="f-47" value={projectForm.status} onChange={e => setProjectForm(f => ({ ...f, status: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm">{PROJECT_STATUS.map(s => <option key={s} value={s}>{s}</option>)}</select></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label htmlFor="f-48" className="block text-xs text-gray-500 mb-1">館別</label><select id="f-48" value={projectForm.warehouseId} onChange={e => setProjectForm(f => ({ ...f, warehouseId: e.target.value, departmentId: '' }))} className="w-full border rounded-lg px-3 py-2 text-sm"><option value="">請選擇</option>{(warehouseDepartments.list || []).filter(w => w.type === 'building').map(w => <option key={w.id} value={w.id}>{w.name}</option>)}</select></div>
                <div><label className="block text-xs text-gray-500 mb-1">部門</label><select value={projectForm.departmentId} onChange={e => setProjectForm(f => ({ ...f, departmentId: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm"><option value="">請選擇</option>{projectForm.warehouseId && (() => { const wh = (warehouseDepartments.list || []).find(w => w.id === parseInt(projectForm.warehouseId)); return (wh?.departments || []).map(d => typeof d === 'object' && d.id != null ? <option key={d.id} value={d.id}>{d.name}</option> : <option key={d} value={d}>{d}</option>); })()}</select></div>
              </div>
              <div><label htmlFor="f-49" className="block text-xs text-gray-500 mb-1">工程地點</label><input id="f-49" value={projectForm.location} onChange={e => setProjectForm(f => ({ ...f, location: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label htmlFor="f-50" className="block text-xs text-gray-500 mb-1">建造號碼</label><input id="f-50" value={projectForm.buildingNo} onChange={e => setProjectForm(f => ({ ...f, buildingNo: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
                <div><label htmlFor="f-51" className="block text-xs text-gray-500 mb-1">使造號碼</label><input id="f-51" value={projectForm.permitNo} onChange={e => setProjectForm(f => ({ ...f, permitNo: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
              </div>
              <div><label htmlFor="f-52" className="block text-xs text-gray-500 mb-1">備註</label><textarea id="f-52" value={projectForm.note} onChange={e => setProjectForm(f => ({ ...f, note: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" rows={2} /></div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setShowProjectModal(false)} className="px-4 py-2 border rounded-lg text-sm" disabled={projectSaving}>取消</button>
              <button onClick={saveProject} disabled={projectSaving} className="px-4 py-2 bg-amber-600 text-white rounded-lg text-sm disabled:opacity-50">{projectSaving ? '儲存中…' : '儲存'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== 期數標記 / 取消付款 Modal ===== */}
      {showTermModal && editingTerm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowTermModal(false)}>
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full mx-4 p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-4">{termForm.status === 'paid' ? '標記期數已付款' : '取消付款標記'}</h3>
            <div className="space-y-3">
              <div><label htmlFor="f-59" className="block text-xs text-gray-500 mb-1">期別</label><input id="f-59" value={termForm.termName} onChange={e => setTermForm(f => ({ ...f, termName: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" disabled={termForm.status === 'pending'} /></div>
              <div><label htmlFor="f-60" className="block text-xs text-gray-500 mb-1">金額</label><input id="f-60" type="number" value={termForm.amount} onChange={e => setTermForm(f => ({ ...f, amount: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" step="0.01" disabled={termForm.status === 'pending'} /></div>
              <div><label htmlFor="f-61" className="block text-xs text-gray-500 mb-1">到期日</label><input id="f-61" type="date" value={termForm.dueDate} onChange={e => setTermForm(f => ({ ...f, dueDate: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
              <div><label htmlFor="f-62" className="block text-xs text-gray-500 mb-1">內容</label><input id="f-62" value={termForm.content || ''} onChange={e => setTermForm(f => ({ ...f, content: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="付款內容" /></div>
              {termForm.status === 'paid' && (<>
                <div><label htmlFor="f-63" className="block text-xs text-gray-500 mb-1">付款日期</label><input id="f-63" type="date" value={termForm.paidAt} onChange={e => setTermForm(f => ({ ...f, paidAt: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
                <div><label htmlFor="id" className="block text-xs text-gray-500 mb-1">付款單 ID（選填）</label><input id="id" type="number" value={termForm.paymentOrderId} onChange={e => setTermForm(f => ({ ...f, paymentOrderId: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
              </>)}
              {termForm.status === 'pending' && <p className="text-sm text-gray-600 bg-yellow-50 p-3 rounded-lg">取消此期的付款標記後，合約狀態也會同步更新為「進行中」</p>}
              <div><label htmlFor="f-64" className="block text-xs text-gray-500 mb-1">備註</label><input id="f-64" value={termForm.note} onChange={e => setTermForm(f => ({ ...f, note: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setShowTermModal(false)} className="px-4 py-2 border rounded-lg text-sm" disabled={termSaving}>取消</button>
              <button onClick={saveTerm} disabled={termSaving} className={`px-4 py-2 rounded-lg text-sm text-white disabled:opacity-50 ${termForm.status === 'pending' ? 'bg-red-600 hover:bg-red-700' : 'bg-amber-600 hover:bg-amber-700'}`}>{termSaving ? '儲存中…' : (termForm.status === 'pending' ? '確認取消付款' : '儲存')}</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== 建立付款單 Modal ===== */}
      {showPaymentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 overflow-y-auto py-4" onClick={() => setShowPaymentModal(false)}>
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full mx-4 p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-4">{editingPaymentOrder ? '編輯付款單' : '建立工程付款單'}</h3>
            <div className="space-y-3">
              {!editingPaymentOrder && <div>
                <label htmlFor="f-10" className="block text-xs text-gray-500 mb-1">連結合約期數（選填）</label>
                <select id="f-10" value={paymentForm.termId} onChange={e => {
                  const v = e.target.value;
                  if (!v) { setPaymentForm(f => ({ ...f, termId: '', contractId: '', supplierId: '', supplierName: '', amount: '', netAmount: '', summary: '' })); return; }
                  const [tid, cid] = v.split('-').map(Number);
                  const contract = contracts.find(c => c.id === cid);
                  const term = contract?.terms?.find(t => t.id === tid);
                  if (term && contract) {
                    const proj = projects.find(p => p.id === contract.projectId);
                    const whName = proj?.warehouseRef?.name || proj?.warehouse || '';
                    const deptName = proj?.departmentRef?.name || '';
                    const termPaidAmt = paymentOrders.filter(po => po.sourceRecordId === tid && (po.status === '已執行' || po.status === '待出納')).reduce((s, po) => s + (po.status === '已執行' ? getActualPaid(po) : Number(po.amount || 0)), 0);
                    const remaining = Math.max(0, Number(term.amount) - termPaidAmt);
                    const fillAmount = remaining > 0 ? String(remaining) : String(term.amount);
                    setPaymentForm(f => ({ ...f, termId: tid, contractId: cid, supplierId: String(contract.supplierId),
                      supplierName: contract.supplier?.name || '', amount: fillAmount, netAmount: fillAmount,
                      warehouse: whName, department: deptName,
                      summary: `工程 ${contract.project?.code || ''} ${contract.contractNo} ${term.termName || `第${term.termNo}期`}` }));
                  }
                }} className="w-full border rounded-lg px-3 py-2 text-sm">
                  <option value="">一般工程付款（不連結期數）</option>
                  {contracts.map(c =>
                    (c.terms || []).filter(t => {
                      const paid = paymentOrders.filter(po => po.sourceRecordId === t.id && po.status === '已執行').reduce((s, po) => s + getActualPaid(po), 0);
                      return paid < Number(t.amount); // show terms not fully paid by actual amount
                    }).map(t => {
                      const paidAmt = paymentOrders.filter(po => po.sourceRecordId === t.id && po.status === '已執行').reduce((s, po) => s + getActualPaid(po), 0);
                      const pendingAmt = paymentOrders.filter(po => po.sourceRecordId === t.id && po.status === '待出納').reduce((s, po) => s + Number(po.amount || 0), 0);
                      const remaining = Number(t.amount) - paidAmt;
                      return (
                        <option key={t.id} value={`${t.id}-${c.id}`}>
                          {c.project?.code} {c.contractNo} － {t.termName || `第${t.termNo}期`} 期款{formatNum(t.amount)}
                          {paidAmt > 0 ? ` (已付${formatNum(paidAmt)}, 餘${formatNum(remaining)})` : ''}
                          {pendingAmt > 0 ? ` [待出納${formatNum(pendingAmt)}]` : ''}
                        </option>
                      );
                    })
                  ).flat()}
                </select>
              </div>}
              {/* 選擇期數後顯示付款狀態 */}
              {!editingPaymentOrder && paymentForm.termId && (() => {
                const selContract = contracts.find(c => c.id === Number(paymentForm.contractId));
                const selTerm = selContract?.terms?.find(t => t.id === Number(paymentForm.termId));
                if (!selTerm) return null;
                const selPaidPOs = paymentOrders.filter(po => po.sourceRecordId === selTerm.id && po.status === '已執行');
                const selPaidAmt = selPaidPOs.reduce((s, po) => s + getActualPaid(po), 0);
                const selPendingAmt = paymentOrders.filter(po => po.sourceRecordId === selTerm.id && po.status === '待出納').reduce((s, po) => s + Number(po.amount || 0), 0);
                const selRemaining = Number(selTerm.amount) - selPaidAmt;
                return (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-xs space-y-1">
                    <div className="flex justify-between font-medium">
                      <span>期款金額：{formatNum(selTerm.amount)}</span>
                      <span className={selRemaining > 0 ? 'text-amber-600' : 'text-green-600'}>剩餘應付：{formatNum(Math.max(0, selRemaining))}</span>
                    </div>
                    {selPaidAmt > 0 && <div className="text-green-700">已付款合計：{formatNum(selPaidAmt)}（{selPaidPOs.length} 筆）</div>}
                    {selPendingAmt > 0 && <div className="text-orange-600">待出納合計：{formatNum(selPendingAmt)}</div>}
                    {selPaidPOs.map((po, i) => (
                      <div key={i} className="text-gray-500 pl-2">• {po.paymentNo} {po.dueDate || ''} {formatNum(getActualPaid(po))} {po.paymentMethod || ''}</div>
                    ))}
                  </div>
                );
              })()}
              {(paymentForm.warehouse || paymentForm.department) && (
                <div className="bg-gray-50 rounded-lg px-3 py-2 text-xs text-gray-600">
                  館別：{paymentForm.warehouse || '—'} {paymentForm.department ? `／ 部門：${paymentForm.department}` : ''}
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div><label htmlFor="f-65" className="block text-xs text-gray-500 mb-1">廠商</label><input id="f-65" value={paymentForm.supplierName} onChange={e => setPaymentForm(f => ({ ...f, supplierName: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
                <div><label htmlFor="f-66" className="block text-xs text-gray-500 mb-1">應付金額</label><input id="f-66" type="number" value={paymentForm.netAmount} onChange={e => setPaymentForm(f => ({ ...f, netAmount: e.target.value, amount: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" step="0.01" /></div>
              </div>
              <div><label htmlFor="f-67" className="block text-xs text-gray-500 mb-1">摘要</label><input id="f-67" value={paymentForm.summary} onChange={e => setPaymentForm(f => ({ ...f, summary: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="例：工程案 XXX 第N期款" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label htmlFor="f-68" className="block text-xs text-gray-500 mb-1">付款方式</label><select id="f-68" value={paymentForm.paymentMethod} onChange={e => setPaymentForm(f => ({ ...f, paymentMethod: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm">{paymentMethodOptions.map(m => <option key={m} value={m}>{m}</option>)}</select></div>
                <div><label htmlFor="f-69" className="block text-xs text-gray-500 mb-1">資金帳戶</label><select id="f-69" value={paymentForm.accountId} onChange={e => setPaymentForm(f => ({ ...f, accountId: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm"><option value="">請選擇</option>{accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></div>
              </div>
              <div><label htmlFor="f-70" className="block text-xs text-gray-500 mb-1">預計付款日</label><input id="f-70" type="date" value={paymentForm.dueDate} onChange={e => setPaymentForm(f => ({ ...f, dueDate: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
              <div><label htmlFor="f-71" className="block text-xs text-gray-500 mb-1">備註</label><input id="f-71" value={paymentForm.note} onChange={e => setPaymentForm(f => ({ ...f, note: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
              {/* 領用材料 — 從合約材料選取 */}
              {(() => {
                const selContract = paymentForm.contractId ? contracts.find(c => c.id === Number(paymentForm.contractId)) : null;
                const contractMats = selContract?.materials || [];
                if (contractMats.length === 0 && paymentForm.materials.length === 0) return null;
                return (
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="block text-xs text-gray-500">領用材料</label>
                  {contractMats.length > 0 && (
                    <button type="button" onClick={() => setPaymentForm(f => ({ ...f, materials: [...f.materials, { materialId: '', quantity: '', note: '' }] }))} className="text-amber-600 text-xs hover:underline">＋ 新增領用</button>
                  )}
                </div>
                {contractMats.length === 0 && <div className="text-xs text-gray-400 mb-1">此合約尚無材料可領用</div>}
                {paymentForm.materials.length > 0 && (
                  <div className="space-y-2">
                    {paymentForm.materials.map((mat, mi) => {
                      const selMat = contractMats.find(cm => cm.id === Number(mat.materialId));
                      return (
                      <div key={mi} className="border rounded-lg p-2 bg-gray-50">
                        <div className="grid grid-cols-12 gap-2 mb-1">
                          <div className="col-span-7">
                            <select value={mat.materialId} onChange={e => { const ms = [...paymentForm.materials]; const cm = contractMats.find(c => c.id === Number(e.target.value)); ms[mi] = { ...ms[mi], materialId: e.target.value, quantity: cm ? String(cm.quantity) : '' }; setPaymentForm(f => ({ ...f, materials: ms })); }} className="w-full border rounded px-2 py-1 text-xs">
                              <option value="">選擇材料</option>
                              {contractMats.map(cm => (
                                <option key={cm.id} value={cm.id}>{cm.description} （數量{cm.quantity}，單價{cm.unitPrice}）</option>
                              ))}
                            </select>
                          </div>
                          <div className="col-span-3"><input placeholder="領用數量" type="number" value={mat.quantity} onChange={e => { const ms = [...paymentForm.materials]; ms[mi] = { ...ms[mi], quantity: e.target.value }; setPaymentForm(f => ({ ...f, materials: ms })); }} className="w-full border rounded px-2 py-1 text-xs" step="any" min="0" max={selMat ? selMat.quantity : undefined} /></div>
                          <div className="col-span-2 flex items-center justify-end">
                            <button type="button" onClick={() => { const ms = paymentForm.materials.filter((_, i) => i !== mi); setPaymentForm(f => ({ ...f, materials: ms })); }} className="text-red-500 text-xs hover:underline">移除</button>
                          </div>
                        </div>
                        {selMat && <div className="text-xs text-gray-500">單價 {selMat.unitPrice} × {mat.quantity || 0} = {((parseFloat(mat.quantity) || 0) * selMat.unitPrice).toLocaleString()}</div>}
                        <input placeholder="備註" value={mat.note || ''} onChange={e => { const ms = [...paymentForm.materials]; ms[mi] = { ...ms[mi], note: e.target.value }; setPaymentForm(f => ({ ...f, materials: ms })); }} className="w-full border rounded px-2 py-1 text-xs mt-1" />
                      </div>
                      );
                    })}
                  </div>
                )}
              </div>
                );
              })()}
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setShowPaymentModal(false)} className="px-4 py-2 border rounded-lg text-sm" disabled={paymentSaving}>取消</button>
              <button onClick={async () => {
                if (!paymentForm.netAmount || parseFloat(paymentForm.netAmount) <= 0) { showToast('請填寫應付金額', 'error'); return; }
                setPaymentSaving(true);
                try {
                  if (editingPaymentOrder) {
                    // Edit existing payment order
                    const res = await fetch(`/api/payment-orders/${editingPaymentOrder.id}`, {
                      method: 'PUT', headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        paymentMethod: paymentForm.paymentMethod,
                        netAmount: parseFloat(paymentForm.netAmount), amount: parseFloat(paymentForm.amount || paymentForm.netAmount),
                        supplierName: paymentForm.supplierName || null,
                        dueDate: paymentForm.dueDate || null, accountId: paymentForm.accountId || null,
                        summary: paymentForm.summary || null, note: paymentForm.note || null,
                        status: '待出納',
                      }),
                    });
                    const data = await res.json();
                    if (!res.ok) throw new Error(data.error?.message || data.message || '更新失敗');
                    setShowPaymentModal(false); setEditingPaymentOrder(null);
                    fetchPaymentOrders();
                    showToast('付款單已更新', 'success');
                  } else {
                    // Build material rows from selected contract materials
                    const selContract = paymentForm.contractId ? contracts.find(c => c.id === Number(paymentForm.contractId)) : null;
                    const contractMats = selContract?.materials || [];
                    const matRows = (paymentForm.materials || []).filter(m => m.materialId && parseFloat(m.quantity) > 0);
                    const projId = selContract?.projectId || (paymentForm.projectId ? parseInt(paymentForm.projectId) : null);
                    const materialPayload = matRows.map(mat => {
                      const cm = contractMats.find(c => c.id === Number(mat.materialId));
                      if (!cm) return null;
                      return {
                        projectId: projId, contractId: paymentForm.contractId ? parseInt(paymentForm.contractId) : null,
                        termId: paymentForm.termId ? parseInt(paymentForm.termId) : null,
                        description: cm.description, quantity: parseFloat(mat.quantity) || 0,
                        unit: cm.unit || '式', unitPrice: cm.unitPrice, note: mat.note?.trim() || null,
                      };
                    }).filter(Boolean);

                    // Use combined atomic endpoint when materials are present, else plain payment order
                    const endpoint = materialPayload.length > 0
                      ? '/api/engineering/payment-orders-with-materials'
                      : '/api/payment-orders';
                    const payload = materialPayload.length > 0
                      ? {
                          paymentMethod: paymentForm.paymentMethod,
                          netAmount: parseFloat(paymentForm.netAmount),
                          supplierId: paymentForm.supplierId || null, supplierName: paymentForm.supplierName || null,
                          dueDate: paymentForm.dueDate || null, accountId: paymentForm.accountId || null,
                          summary: paymentForm.summary || null, note: paymentForm.note || null,
                          sourceRecordId: paymentForm.termId ? parseInt(paymentForm.termId) : null,
                          warehouse: paymentForm.warehouse || null,
                          materials: materialPayload,
                        }
                      : {
                          invoiceIds: [], paymentMethod: paymentForm.paymentMethod,
                          netAmount: parseFloat(paymentForm.netAmount), amount: parseFloat(paymentForm.amount || paymentForm.netAmount),
                          discount: 0, supplierId: paymentForm.supplierId || null, supplierName: paymentForm.supplierName || null,
                          dueDate: paymentForm.dueDate || null, accountId: paymentForm.accountId || null,
                          summary: paymentForm.summary || null, note: paymentForm.note || null,
                          status: '待出納', sourceType: 'engineering',
                          sourceRecordId: paymentForm.termId ? parseInt(paymentForm.termId) : null,
                          warehouse: paymentForm.warehouse || null,
                        };

                    const res = await fetch(endpoint, {
                      method: 'POST', headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify(payload),
                    });
                    const data = await res.json();
                    if (!res.ok) throw new Error(data.error?.message || '建立失敗');
                    setShowPaymentModal(false);
                    fetchPaymentOrders();
                    if (activeTab === 'contracts' || activeTab === 'projectMgmt') fetchContracts(filterProjectId || undefined);
                    showToast('付款單已建立，請至出納執行付款（出納付款後自動更新期數狀態）', 'success');
                  }
                } catch (e) { showToast(e.message || '儲存失敗', 'error'); }
                finally { setPaymentSaving(false); }
              }} disabled={paymentSaving} className="px-4 py-2 bg-amber-600 text-white rounded-lg text-sm disabled:opacity-50">{paymentSaving ? '儲存中…' : (editingPaymentOrder ? '儲存' : '儲存並送交出納')}</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== 分業進項 Tab ===== */}
      {activeTab === 'companyInvoices' && <CompanyInvoicesTab projects={projects} onUnassignedCountChange={setUnassignedInvCount} />}

      {/* ── Engineering cashier execute modal ── */}
      <ConfirmModal dialog={confirmDlg} onClose={closeConfirm} />
    </div>
  );
}

export default function EngineeringPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-50 flex justify-center py-24 text-gray-500">載入中…</div>}>
      <EngineeringPageInner />
    </Suspense>
  );
}
