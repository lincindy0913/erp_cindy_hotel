'use client';

import { useState, useMemo } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useToast } from '@/context/ToastContext';
import { useConfirmDialog } from '@/components/ConfirmModal';
import { todayStr, localDateStr } from '@/lib/localDate';
import { getActualPaid } from '@/lib/engineering/payment-utils';
import { useEngineeringData } from '@/app/engineering/_hooks/useEngineeringData';

const VALID_TAB_KEYS = new Set([
  'projects', 'projectMgmt', 'contracts', 'materials', 'payments',
  'progressClaims', 'income', 'inputInvoices', 'outputInvoices',
  'companyInvoices', 'budgetReport',
]);

export function useEngineering() {
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

  const { data: session } = useSession();
  const isAdminOrManager = session?.user?.role === 'admin' ||
    (session?.user?.permissions || []).includes('*') ||
    (session?.user?.roles || []).some(r => ['admin', 'manager'].includes(r));
  const { showToast } = useToast();
  const { dialog: confirmDlg, confirm: askConfirm, close: closeConfirm } = useConfirmDialog();

  // ── tab URL sync ─────────────────────────────────────────────────────────
  function switchEngineeringTab(key) {
    setActiveTab(key);
    router.push(`/engineering?tab=${encodeURIComponent(key)}`, { scroll: false });
  }

  // ── derived data ─────────────────────────────────────────────────────────
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
    const hasExecutedPO = paymentOrders.some(
      po => po.sourceRecordId === term.id && po.status === '已執行'
    );
    setEditingTerm({ ...term, hasExecutedPO });
    setTermForm({
      termName: term.termName || '', amount: String(term.amount), dueDate: term.dueDate || '',
      content: term.content || '', status: 'paid', paidAt: todayStr(),
      paymentOrderId: term.paymentOrderId ? String(term.paymentOrderId) : '',
      note: term.note || '', manualNote: '',
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
          manualNote: termForm.manualNote || null,
        }),
      });
      if (!res.ok) { const d = await res.json(); showToast(d.error?.message || '更新失敗', 'error'); setTermSaving(false); return; }
      setShowTermModal(false);
      fetchContracts(filterProjectId || undefined);
      fetchPaymentOrders();
    } catch (e) { showToast('更新失敗', 'error'); }
    finally { setTermSaving(false); }
  }

  return {
    // tab
    activeTab, switchEngineeringTab,
    // filter
    filterProjectId, setFilterProjectId,
    // data
    projects, contracts, suppliers, loading,
    projectsError, contractsError, paymentOrdersError, authError,
    warehouseDepartments, paymentOrders, progressClaims,
    outputInvoicesList, dashStats, dashStatsError, warrantyRecords, accounts,
    paymentMethodOptions, unassignedInvCount, setUnassignedInvCount,
    fetchProjects, fetchContracts, fetchPaymentOrders,
    refreshDashStats, fetchWarrantyRecords,
    // derived
    dashboardStats,
    // project modal
    showProjectModal, setShowProjectModal,
    editingProject, projectForm, setProjectForm, projectSaving,
    openAddProject, openEditProject, saveProject, deleteProject,
    // term modal
    showTermModal, setShowTermModal,
    editingTerm, termForm, setTermForm, termSaving,
    openMarkTermPaid, openUnmarkTermPaid, saveTerm,
    // payment modal
    showPaymentModal, editingPaymentOrder, initialPaymentForm,
    openPaymentModal, closePaymentModal,
    // session / auth
    session, isAdminOrManager,
    // confirm dialog
    confirmDlg, closeConfirm,
  };
}
