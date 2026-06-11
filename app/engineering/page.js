'use client';

import { Suspense } from 'react';
import Navigation from '@/components/Navigation';
import NotificationBanner from '@/components/NotificationBanner';
import EngineeringHeaderInsights from '@/components/engineering/EngineeringHeaderInsights';
import HelpButton from '@/components/HelpButton';
import ConfirmModal from '@/components/ConfirmModal';
import FetchErrorBanner from '@/components/FetchErrorBanner';
import ProjectFormModal from '@/components/engineering/ProjectFormModal';
import PaymentOrderModal from '@/components/engineering/PaymentOrderModal';
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
import ProjectsTab from '@/components/engineering/ProjectsTab';
import TermModal from '@/app/engineering/_components/TermModal';
import { useEngineering } from '@/app/engineering/_hooks/useEngineering';

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

function EngineeringPageInner() {
  const {
    activeTab, switchEngineeringTab,
    filterProjectId, setFilterProjectId,
    projects, contracts, suppliers, loading,
    projectsError, contractsError, paymentOrdersError, authError,
    warehouseDepartments, paymentOrders, progressClaims,
    outputInvoicesList, dashStats, dashStatsError, warrantyRecords, accounts,
    paymentMethodOptions, unassignedInvCount, setUnassignedInvCount,
    fetchProjects, fetchContracts, fetchPaymentOrders,
    refreshDashStats, fetchWarrantyRecords,
    dashboardStats,
    showProjectModal, setShowProjectModal,
    editingProject, projectForm, setProjectForm, projectSaving,
    openAddProject, openEditProject, saveProject, deleteProject,
    showTermModal, setShowTermModal,
    editingTerm, termForm, setTermForm, termSaving,
    openMarkTermPaid, openUnmarkTermPaid, saveTerm,
    showPaymentModal, editingPaymentOrder, initialPaymentForm,
    openPaymentModal, closePaymentModal,
    session, isAdminOrManager,
    confirmDlg, closeConfirm,
  } = useEngineering();

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

        {authError && <FetchErrorBanner message="登入已逾期，請重新整理頁面或重新登入。" />}

        {loading && activeTab === 'projects' && (
          <div className="flex justify-center py-12"><div className="w-8 h-8 border-4 border-amber-200 border-t-amber-600 rounded-full animate-spin" /></div>
        )}

        {activeTab === 'projects' && !loading && projectsError && (
          <FetchErrorBanner message={projectsError} onRetry={fetchProjects} />
        )}
        {activeTab === 'payments' && paymentOrdersError && (
          <FetchErrorBanner message={paymentOrdersError} onRetry={fetchPaymentOrders} />
        )}

        {activeTab === 'projects' && !loading && (
          <ProjectsTab
            projects={projects} contracts={contracts} suppliers={suppliers}
            warehouseDepartments={warehouseDepartments}
            onAdd={openAddProject} onEdit={openEditProject} onDelete={deleteProject}
          />
        )}
        {activeTab === 'contracts' && (
          <ContractsTab
            projects={projects} suppliers={suppliers} contracts={contracts}
            paymentOrders={paymentOrders} filterProjectId={filterProjectId}
            onFilterChange={setFilterProjectId} onMarkTermPaid={openMarkTermPaid}
            onUnmarkTermPaid={openUnmarkTermPaid}
            onRefresh={() => fetchContracts(filterProjectId || undefined)}
            session={session} contractsError={contractsError}
            onRetryContracts={() => fetchContracts(filterProjectId || undefined)}
          />
        )}
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
        {activeTab === 'payments' && (
          <PaymentsTab
            paymentOrders={paymentOrders} projects={projects} suppliers={suppliers}
            warehouseDepartments={warehouseDepartments} contracts={contracts}
            onOpenPaymentModal={openPaymentModal} onRefresh={fetchPaymentOrders}
          />
        )}
        {activeTab === 'materials' && <MaterialsTab projects={projects} contracts={contracts} />}
        {activeTab === 'progressClaims' && <ProgressClaimsTab projects={projects} />}
        {activeTab === 'income' && (
          <IncomeTab projects={projects} progressClaims={progressClaims}
            outputInvoices={outputInvoicesList} onDashStatsChanged={refreshDashStats} />
        )}
        {activeTab === 'inputInvoices' && (
          <InputInvoicesTab projects={projects} contracts={contracts} onDashStatsChanged={refreshDashStats} />
        )}
        {activeTab === 'outputInvoices' && (
          <OutputInvoicesTab projects={projects} progressClaims={progressClaims} onDashStatsChanged={refreshDashStats} />
        )}
        {activeTab === 'budgetReport' && (
          <BudgetReportTab
            projects={projects} contracts={contracts} paymentOrders={paymentOrders}
            progressClaims={progressClaims} dashStats={dashStats}
          />
        )}
        {activeTab === 'companyInvoices' && (
          <CompanyInvoicesTab projects={projects} onUnassignedCountChange={setUnassignedInvCount} />
        )}
      </div>

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

      <TermModal
        showTermModal={showTermModal}
        editingTerm={editingTerm}
        termForm={termForm}
        setTermForm={setTermForm}
        termSaving={termSaving}
        isAdminOrManager={isAdminOrManager}
        onClose={() => setShowTermModal(false)}
        onSave={saveTerm}
      />

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
