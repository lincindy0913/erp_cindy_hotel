'use client';

import { useState, useMemo, Suspense } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { useSearchParams, useRouter } from 'next/navigation';
import Navigation from '@/components/Navigation';
import NotificationBanner from '@/components/NotificationBanner';
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
import ProgressClaimsTab from '@/components/engineering/ProgressClaimsTab';
import BudgetReportTab from '@/components/engineering/BudgetReportTab';
import PaymentOrderModal from '@/components/engineering/PaymentOrderModal';
import FetchErrorBanner from '@/components/FetchErrorBanner';
import { useEngineeringData } from '@/app/engineering/_hooks/useEngineeringData';
import { getActualPaid } from '@/lib/engineering/payment-utils';
import { formatNum } from '@/lib/engineering/format-utils';

const TABS = [
  { key: 'projects', label: '工程案' },
  { key: 'projectMgmt', label: '專案管理' },
  { key: 'contracts', label: '合約與期數' },
  { key: 'materials', label: '材料使用' },
  { key: 'payments', label: '付款單' },
  { key: 'progressClaims', label: '估驗計價' },
  { key: 'income', label: '收款管理' },
  { key: 'inputInvoices', label: '廠商進項發票' },
  { key: 'outputInvoices', label: '業主銷項發票' },
  { key: 'companyInvoices', label: '分業進項' },
  { key: 'budgetReport', label: '預算報表' },
];

const PROJECT_STATUS = ['進行中', '已結案', '暫停'];

const VALID_TAB_KEYS = new Set(TABS.map((t) => t.key));

function EngineeringPageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const tabParam = searchParams.get('tab');
  const [activeTab, setActiveTab] = useState(() => (VALID_TAB_KEYS.has(tabParam) ? tabParam : 'projects'));
  const [filterProjectId, setFilterProjectId] = useState('');

  // ── data via hook ────────────────────────────────────────────────────────
  const {
    projects, contracts, suppliers, loading,
    projectsError, contractsError, paymentOrdersError, authError,
    warehouseDepartments, paymentOrders, progressClaims,
    outputInvoicesList, dashStats, dashStatsError, warrantyRecords, accounts,
    paymentMethodOptions, unassignedInvCount, setUnassignedInvCount,
    fetchProjects, fetchContracts, fetchPaymentOrders,
    refreshDashStats, fetchWarrantyRecords,
  } = useEngineeringData({ activeTab, filterProjectId });

  // ── project modal ────────────────────────────────────────────────────────
  const [showProjectModal, setShowProjectModal] = useState(false);
  const [editingProject, setEditingProject] = useState(null);
  const [projectSaving, setProjectSaving] = useState(false);
  const [projectForm, setProjectForm] = useState({
    code: '', name: '', clientName: '', clientContractAmount: '',
    startDate: '', endDate: '', budget: '', status: '進行中',
    warehouseId: '', departmentId: '', location: '', buildingNo: '',
    permitNo: '', note: '', warrantyStartDate: '', warrantyEndDate: '',
    warrantyMonths: '', warrantyNote: '',
  });

  // ── term modal ───────────────────────────────────────────────────────────
  const [showTermModal, setShowTermModal] = useState(false);
  const [editingTerm, setEditingTerm] = useState(null);
  const [termSaving, setTermSaving] = useState(false);
  const [termForm, setTermForm] = useState({
    termName: '', amount: '', dueDate: '', status: 'pending',
    paidAt: '', paymentOrderId: '', note: '',
  });

  // ── payment modal control ────────────────────────────────────────────────
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [editingPaymentOrder, setEditingPaymentOrder] = useState(null);
  const [initialPaymentForm, setInitialPaymentForm] = useState({});

  // ── search filters ───────────────────────────────────────────────────────
  const [searchDateFrom, setSearchDateFrom] = useState('');
  const [searchDateTo, setSearchDateTo] = useState('');
  const [searchSupplierId, setSearchSupplierId] = useState('');
  const [searchWarehouse, setSearchWarehouse] = useState('');

  const { sortKey: engProjKey, sortDir: engProjDir, toggleSort: engProjToggle } = useColumnSort('code', 'asc');

  const { data: session } = useSession();
  const { showToast } = useToast();
  const confirm = useConfirm();
  const { dialog: confirmDlg, confirm: askConfirm, close: closeConfirm } = useConfirmDialog();

  // ── tab URL sync ─────────────────────────────────────────────────────────
  function switchEngineeringTab(key) {
    setActiveTab(key);
    router.push(`/engineering?tab=${encodeURIComponent(key)}`, { scroll: false });
  }

  // ── derived data ─────────────────────────────────────────────────────────
  const filteredProjects = useMemo(() => {
    return projects.filter(p => {
      if (searchDateFrom) {
        const pEnd = p.endDate || '9999-12-31';
        if (pEnd < searchDateFrom) return false;
      }
      if (searchDateTo) {
        const pStart = p.startDate || '0000-01-01';
        if (pStart > searchDateTo) return false;
      }
      if (searchWarehouse) {
        const whName = p.warehouseRef?.name || p.warehouse || '';
        if (whName !== searchWarehouse) return false;
      }
      if (searchSupplierId) {
        const hasSupplier = contracts.some(c => c.projectId === p.id && String(c.supplierId) === searchSupplierId);
        if (!hasSupplier) return false;
      }
      return true;
    });
  }, [projects, contracts, searchDateFrom, searchDateTo, searchWarehouse, searchSupplierId]);

  const sortedProjects = useMemo(
    () => sortRows(filteredProjects, engProjKey, engProjDir, {
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
    const sumVendorContracts = contracts
      .filter(c => (c.contractType || '主合約') === '主合約')
      .reduce((s, c) => s + Number(c.totalAmount || 0), 0);
    let paidExecuted = 0;
    for (const o of paymentOrders) {
      if (o.status === '已執行') paidExecuted += getActualPaid(o);
    }
    const sumIncome         = dashStatsError ? null : dashStats.totalIncome;
    const sumInputInvoices  = dashStatsError ? null : dashStats.totalInputInvoices;
    const sumOutputInvoices = dashStatsError ? null : dashStats.totalOutputInvoices;
    const today = todayStr();
    const weekLater = new Date();
    weekLater.setDate(weekLater.getDate() + 7);
    const weekEnd = localDateStr(weekLater);
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
      activeProjects, sumBudget, sumClient, sumVendorContracts, paidExecuted,
      sumIncome, sumInputInvoices, sumOutputInvoices,
      totalMaterialCost: dashStatsError ? null : (dashStats.totalMaterialCost || 0),
      overdueTerms, dueThisWeek, projectCount: projects.length,
    };
  }, [projects, contracts, paymentOrders, dashStats, dashStatsError]);

  // ── project handlers ─────────────────────────────────────────────────────
  function openAddProject() {
    setEditingProject(null);
    setProjectForm({
      code: '', name: '', clientName: '', clientContractAmount: '',
      startDate: '', endDate: '', budget: '', status: '進行中',
      warehouseId: '', departmentId: '', location: '', buildingNo: '',
      permitNo: '', note: '',
    });
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
      location: p.location || '', buildingNo: p.buildingNo || '',
      permitNo: p.permitNo || '', note: p.note || '',
      warrantyStartDate: p.warrantyStartDate || '', warrantyEndDate: p.warrantyEndDate || '',
      warrantyMonths: p.warrantyMonths != null ? String(p.warrantyMonths) : '',
      warrantyNote: p.warrantyNote || '',
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
        warrantyStartDate: projectForm.warrantyStartDate || null,
        warrantyEndDate: projectForm.warrantyEndDate || null,
        warrantyMonths: projectForm.warrantyMonths ? parseInt(projectForm.warrantyMonths) : null,
        warrantyNote: projectForm.warrantyNote?.trim() || null,
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
      setShowProjectModal(false);
      fetchProjects();
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

  // ── payment modal control ────────────────────────────────────────────────
  function openPaymentModal(formData) {
    const editingId = formData?._editingId || null;
    const { _editingId, ...cleanForm } = formData || {};
    setEditingPaymentOrder(editingId ? { id: editingId } : null);
    setInitialPaymentForm(cleanForm);
    setShowPaymentModal(true);
  }

  function closePaymentModal() {
    setShowPaymentModal(false);
    setEditingPaymentOrder(null);
  }

  // ── term handlers ────────────────────────────────────────────────────────
  function openMarkTermPaid(term) {
    setEditingTerm(term);
    setTermForm({
      termName: term.termName || '', amount: String(term.amount), dueDate: term.dueDate || '',
      content: term.content || '', status: 'paid', paidAt: todayStr(),
      paymentOrderId: term.paymentOrderId ? String(term.paymentOrderId) : '', note: term.note || '',
    });
    setShowTermModal(true);
  }

  function openUnmarkTermPaid(term) {
    setEditingTerm(term);
    setTermForm({
      termName: term.termName || '', amount: String(term.amount), dueDate: term.dueDate || '',
      content: term.content || '', status: 'pending', paidAt: '', paymentOrderId: '', note: term.note || '',
    });
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
      fetchPaymentOrders();
    } catch (e) { showToast('更新失敗', 'error'); }
    finally { setTermSaving(false); }
  }

  // ── print / export ───────────────────────────────────────────────────────
  function handlePrintProjects() {
    if (sortedProjects.length === 0) { showToast('沒有可列印的資料', 'info'); return; }
    const filterDesc = [
      searchDateFrom || searchDateTo ? `日期：${searchDateFrom || '?'} ~ ${searchDateTo || '?'}` : '',
      searchSupplierId ? `廠商：${suppliers.find(s => String(s.id) === searchSupplierId)?.name || ''}` : '',
      searchWarehouse ? `館別：${searchWarehouse}` : '',
    ].filter(Boolean).join('　');

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
        p.code || '', p.name || '', p.clientName || '',
        p.warehouseRef?.name || p.warehouse || '',
        supplierNames, p.startDate || '', p.endDate || '',
        Number(p.budget || 0), totalContractAmt, p.status || '',
      ];
    });
    const csvRows = [header.join(',')];
    rows.forEach((r) => { csvRows.push(r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')); });
    const blob = new Blob(['﻿' + csvRows.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `工程案列表_${todayStr()}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  // ── render ───────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation borderColor="border-amber-600" />
      <NotificationBanner moduleFilter="engineering" />
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-gray-800">工程會計</h2>
          <p className="text-sm text-gray-500 mt-1">營造工程案、廠商合約期數付款、材料使用追蹤（一般人事／廠商請款請至「付款」「費用」）</p>
        </div>

        {dashStatsError && (
          <FetchErrorBanner
            message="收款／發票統計載入失敗，以下數字顯示為「－」。"
            onRetry={refreshDashStats}
          />
        )}
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

        {authError && (
          <FetchErrorBanner message="登入已逾期，請重新整理頁面或重新登入。" />
        )}

        {loading && activeTab === 'projects' && (
          <div className="flex justify-center py-12"><div className="w-8 h-8 border-4 border-amber-200 border-t-amber-600 rounded-full animate-spin" /></div>
        )}

        {/* ===== 工程案 TAB ===== */}
        {activeTab === 'projects' && !loading && projectsError && (
          <FetchErrorBanner message={projectsError} onRetry={fetchProjects} />
        )}
        {activeTab === 'contracts' && contractsError && (
          <FetchErrorBanner message={contractsError} onRetry={() => fetchContracts(filterProjectId || undefined)} />
        )}
        {activeTab === 'payments' && paymentOrdersError && (
          <FetchErrorBanner message={paymentOrdersError} onRetry={fetchPaymentOrders} />
        )}
        {activeTab === 'projects' && !loading && (
          <>
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
            projects={projects} suppliers={suppliers} contracts={contracts}
            paymentOrders={paymentOrders} filterProjectId={filterProjectId}
            onFilterChange={setFilterProjectId} onMarkTermPaid={openMarkTermPaid}
            onUnmarkTermPaid={openUnmarkTermPaid}
            onRefresh={() => fetchContracts(filterProjectId || undefined)}
            session={session}
          />
        )}

        {/* ===== 專案管理 TAB ===== */}
        {activeTab === 'projectMgmt' && (
          <ProjectMgmtTab
            projects={projects} contracts={contracts} paymentOrders={paymentOrders}
            warehouseDepartments={warehouseDepartments} dashStats={dashStats}
            warrantyRecords={warrantyRecords}
            onWarrantyRefresh={() => fetchWarrantyRecords()}
            onMarkTermPaid={openMarkTermPaid} onUnmarkTermPaid={openUnmarkTermPaid}
            onOpenPaymentModal={openPaymentModal} onSwitchTab={switchEngineeringTab}
          />
        )}

        {/* ===== 付款單 TAB ===== */}
        {activeTab === 'payments' && (
          <PaymentsTab
            paymentOrders={paymentOrders} projects={projects} suppliers={suppliers}
            warehouseDepartments={warehouseDepartments} contracts={contracts}
            onOpenPaymentModal={openPaymentModal} onRefresh={fetchPaymentOrders}
          />
        )}

        {/* ===== 材料使用 TAB ===== */}
        {activeTab === 'materials' && <MaterialsTab projects={projects} contracts={contracts} />}

        {/* ===== 估驗計價 TAB ===== */}
        {activeTab === 'progressClaims' && <ProgressClaimsTab projects={projects} />}

        {/* ===== 收款管理 TAB ===== */}
        {activeTab === 'income' && (
          <IncomeTab projects={projects} progressClaims={progressClaims}
            outputInvoices={outputInvoicesList} onDashStatsChanged={refreshDashStats} />
        )}

        {/* ===== 廠商進項發票 TAB ===== */}
        {activeTab === 'inputInvoices' && (
          <InputInvoicesTab projects={projects} contracts={contracts} onDashStatsChanged={refreshDashStats} />
        )}

        {/* ===== 業主銷項發票 TAB ===== */}
        {activeTab === 'outputInvoices' && (
          <OutputInvoicesTab projects={projects} progressClaims={progressClaims} onDashStatsChanged={refreshDashStats} />
        )}

        {/* ===== 預算報表 TAB ===== */}
        {activeTab === 'budgetReport' && (
          <BudgetReportTab
            projects={projects} contracts={contracts} paymentOrders={paymentOrders}
            progressClaims={progressClaims} dashStats={dashStats}
          />
        )}

        {/* ===== 分業進項 TAB ===== */}
        {activeTab === 'companyInvoices' && (
          <CompanyInvoicesTab projects={projects} onUnassignedCountChange={setUnassignedInvCount} />
        )}

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
              <div className="border-t pt-3">
                <p className="text-xs font-medium text-purple-700 mb-2">保固期設定</p>
                <div className="grid grid-cols-3 gap-3">
                  <div><label className="block text-xs text-gray-500 mb-1">保固開始日</label><input type="date" value={projectForm.warrantyStartDate} onChange={e => { const s = e.target.value; const months = parseInt(projectForm.warrantyMonths || 0); setProjectForm(f => ({ ...f, warrantyStartDate: s, warrantyEndDate: s && months ? new Date(new Date(s).setMonth(new Date(s).getMonth() + months)).toISOString().slice(0,10) : f.warrantyEndDate })); }} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
                  <div><label className="block text-xs text-gray-500 mb-1">保固月數</label><input type="number" min="1" max="120" value={projectForm.warrantyMonths} onChange={e => { const m = e.target.value; const s = projectForm.warrantyStartDate; setProjectForm(f => ({ ...f, warrantyMonths: m, warrantyEndDate: s && m ? new Date(new Date(s).setMonth(new Date(s).getMonth() + parseInt(m))).toISOString().slice(0,10) : f.warrantyEndDate })); }} className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="例：24" /></div>
                  <div><label className="block text-xs text-gray-500 mb-1">保固結束日</label><input type="date" value={projectForm.warrantyEndDate} onChange={e => setProjectForm(f => ({ ...f, warrantyEndDate: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
                </div>
                <div className="mt-2"><label className="block text-xs text-gray-500 mb-1">保固備註</label><input value={projectForm.warrantyNote} onChange={e => setProjectForm(f => ({ ...f, warrantyNote: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="例：結構防水 2 年、其他 1 年" /></div>
              </div>
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

      {/* ===== 付款單 Modal ===== */}
      <PaymentOrderModal
        isOpen={showPaymentModal}
        editingOrder={editingPaymentOrder}
        initialForm={initialPaymentForm}
        contracts={contracts}
        projects={projects}
        accounts={accounts}
        paymentOrders={paymentOrders}
        paymentMethodOptions={paymentMethodOptions}
        onClose={closePaymentModal}
        onSaved={({ isNew }) => {
          fetchPaymentOrders();
          if (isNew) fetchContracts(filterProjectId || undefined);
        }}
      />

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
