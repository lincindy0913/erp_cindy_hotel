'use client';

import { useState, useMemo, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { useSearchParams, useRouter } from 'next/navigation';
import Navigation from '@/components/Navigation';
import NotificationBanner from '@/components/NotificationBanner';
import EngineeringHeaderInsights from '@/components/engineering/EngineeringHeaderInsights';
import HelpButton from '@/components/HelpButton';
import { useToast } from '@/context/ToastContext';
import { useConfirm } from '@/context/ConfirmContext';
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
import ProjectsTab from '@/components/engineering/ProjectsTab';
import ProjectFormModal from '@/components/engineering/ProjectFormModal';
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

  const { data: session } = useSession();
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
    setEditingTerm(term);
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

  // ── print / export ───────────────────────────────────────────────────────
  // ── render ───────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation borderColor="border-amber-600" />
      <NotificationBanner moduleFilter="engineering" />
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="mb-6 flex items-start justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-800">工程會計</h2>
            <p className="text-sm text-gray-500 mt-1">營造工程案、廠商合約期數付款、材料使用追蹤（一般人事／廠商請款請至「付款」「費用」）</p>
          </div>
          <HelpButton anchor="十八工程管理" className="mt-1" />
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
          <ProjectsTab
            projects={projects}
            contracts={contracts}
            suppliers={suppliers}
            warehouseDepartments={warehouseDepartments}
            onAdd={openAddProject}
            onEdit={openEditProject}
            onDelete={deleteProject}
          />
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
      <ProjectFormModal
        isOpen={showProjectModal}
        editingProject={editingProject}
        projectForm={projectForm}
        setProjectForm={setProjectForm}
        projectSaving={projectSaving}
        warehouseDepartments={warehouseDepartments}
        onClose={() => setShowProjectModal(false)}
        onSave={saveProject}
      />

      {/* ===== 期數標記 / 取消付款 Modal ===== */}
      {showTermModal && editingTerm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowTermModal(false)}>
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full mx-4 p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-4">{termForm.status === 'paid' ? '標記期數已付款' : '取消付款標記'}</h3>

            {/* 手動標記警示 */}
            {termForm.status === 'paid' && (
              <div className="mb-4 p-3 bg-amber-50 border border-amber-300 rounded-lg">
                <p className="text-xs font-semibold text-amber-800 mb-1">⚠ 注意：建議使用出納流程</p>
                <p className="text-xs text-amber-700">
                  正常流程：建立付款單 → 出納執行 → 期數自動核銷（可建立現金流紀錄）。
                  帳外標記需管理員權限，且帳外付款說明將寫入稽核日誌，不可逆、可查詢。
                </p>
              </div>
            )}

            <div className="space-y-3">
              <div><label htmlFor="f-59" className="block text-xs text-gray-500 mb-1">期別</label><input id="f-59" value={termForm.termName} onChange={e => setTermForm(f => ({ ...f, termName: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" disabled={termForm.status === 'pending'} /></div>
              <div><label htmlFor="f-60" className="block text-xs text-gray-500 mb-1">金額</label><input id="f-60" type="number" value={termForm.amount} onChange={e => setTermForm(f => ({ ...f, amount: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" step="0.01" disabled={termForm.status === 'pending'} /></div>
              <div><label htmlFor="f-61" className="block text-xs text-gray-500 mb-1">到期日</label><input id="f-61" type="date" value={termForm.dueDate} onChange={e => setTermForm(f => ({ ...f, dueDate: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
              <div><label htmlFor="f-62" className="block text-xs text-gray-500 mb-1">內容</label><input id="f-62" value={termForm.content || ''} onChange={e => setTermForm(f => ({ ...f, content: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="付款內容" /></div>
              {termForm.status === 'paid' && (<>
                <div><label htmlFor="f-63" className="block text-xs text-gray-500 mb-1">付款日期</label><input id="f-63" type="date" value={termForm.paidAt} onChange={e => setTermForm(f => ({ ...f, paidAt: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
                <div>
                  <label htmlFor="f-manual-note" className="block text-xs text-gray-500 mb-1">
                    帳外付款說明
                    <span className="ml-1 text-amber-600 font-medium">（無出納紀錄時必填）</span>
                  </label>
                  <input
                    id="f-manual-note"
                    value={termForm.manualNote || ''}
                    onChange={e => setTermForm(f => ({ ...f, manualNote: e.target.value }))}
                    className="w-full border border-amber-300 rounded-lg px-3 py-2 text-sm focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
                    placeholder="例：現金直付廠商、銀行匯款已完成但未建付款單…"
                  />
                </div>
                <div><label htmlFor="id" className="block text-xs text-gray-500 mb-1">關聯付款單 ID（選填）</label><input id="id" type="number" value={termForm.paymentOrderId} onChange={e => setTermForm(f => ({ ...f, paymentOrderId: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
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
