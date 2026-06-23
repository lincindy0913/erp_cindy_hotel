'use client';

import { Suspense } from 'react';
import Navigation from '@/components/Navigation';
import ConfirmModal from '@/components/ConfirmModal';
import FetchErrorBanner from '@/components/FetchErrorBanner';
import ModuleGuideCard from '@/components/ModuleGuideCard';
import { useCompanyExpenses, TABS, PERIODS, MATERIAL_TYPES } from './_hooks/useCompanyExpenses';
import ExpensesTable from './_components/ExpensesTable';
import InvoicesTable from './_components/InvoicesTable';
import ExpenseFormModal from './_components/ExpenseFormModal';
import CsvImportModal from './_components/CsvImportModal';

function CompanyExpensesPageInner() {
  const {
    session,
    activeTab, switchTab,
    loading, fetchError, load,
    filteredExpenses, filteredInvoices,
    projects, suppliers,
    periodFilter, setPeriodFilter,
    projectFilter, setProjectFilter,
    vendorFilter, setVendorFilter,
    matFilter, setMatFilter,
    clearFilters,
    showModal, setShowModal,
    editingRow, saving,
    expenseForm, setExpenseForm,
    invoiceForm, setInvoiceForm,
    openAdd, openEdit,
    saveExpense, saveInvoice,
    deleteRow,
    showCsvModal, setShowCsvModal,
    csvRows, setCsvRows,
    csvImporting,
    handleCsvFile, importCsvRows,
    downloadCsvTemplate,
    expKey, expDir, expToggle,
    invKey, invDir, invToggle,
    confirmDlg, closeConfirm,
  } = useCompanyExpenses();

  if (!session) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />
      <div className="max-w-screen-xl mx-auto px-4 py-6">
        {fetchError && <FetchErrorBanner message={fetchError} onRetry={load} />}

        <ModuleGuideCard
          title="公司費用流程指引"
          color="amber"
          storageKey="guide-company-expenses"
          steps={[
            { label: '登記費用單', desc: '點選「新增」登記水電、材料、工程等費用' },
            { label: '關聯工程案', desc: '可將費用單關聯至特定工程案，便於成本追蹤' },
            { label: '批次匯入', desc: '下載 CSV 範本填寫後批次匯入發票資料' },
            { label: '費用/發票切換', desc: '上方分頁可切換費用單清單與對應進項發票' },
          ]}
        />

        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold text-gray-900">慶豐營造工程分業</h1>
          <div className="flex items-center gap-2">
            {activeTab === 'invoices' && (
              <>
                <button onClick={downloadCsvTemplate}
                  className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 border border-gray-300">
                  ↓ 下載範本
                </button>
                <label className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 cursor-pointer">
                  ↑ 匯入 CSV
                  <input type="file" accept=".csv" className="hidden" onChange={handleCsvFile} />
                </label>
              </>
            )}
            <button onClick={openAdd} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
              + 新增
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-4 border-b border-gray-200">
          {TABS.map(t => (
            <button key={t.key} onClick={() => switchTab(t.key)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === t.key ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-2 mb-4">
          <select value={periodFilter} onChange={e => setPeriodFilter(e.target.value)}
            className="border rounded-lg px-3 py-1.5 text-sm">
            <option value="">全部期間</option>
            {PERIODS.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          {activeTab === 'invoices' && (
            <>
              <select value={projectFilter} onChange={e => setProjectFilter(e.target.value)}
                className="border rounded-lg px-3 py-1.5 text-sm">
                <option value="">全部工程</option>
                {projects.map(p => <option key={p.id} value={String(p.id)}>{p.name}</option>)}
              </select>
              <select value={matFilter} onChange={e => setMatFilter(e.target.value)}
                className="border rounded-lg px-3 py-1.5 text-sm">
                <option value="">全部材料別</option>
                {MATERIAL_TYPES.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </>
          )}
          <input value={vendorFilter} onChange={e => setVendorFilter(e.target.value)}
            placeholder="廠商名稱搜尋…" className="border rounded-lg px-3 py-1.5 text-sm w-44" />
          <button onClick={clearFilters}
            className="px-3 py-1.5 border rounded-lg text-sm text-gray-600 hover:bg-gray-50">清除</button>
        </div>

        {loading ? (
          <div className="text-center py-20 text-gray-400">載入中…</div>
        ) : (
          <>
            {activeTab === 'expenses' && (
              <ExpensesTable
                filteredExpenses={filteredExpenses}
                expKey={expKey} expDir={expDir} expToggle={expToggle}
                onEdit={openEdit} onDelete={deleteRow}
              />
            )}
            {activeTab === 'invoices' && (
              <InvoicesTable
                filteredInvoices={filteredInvoices}
                invKey={invKey} invDir={invDir} invToggle={invToggle}
                onEdit={openEdit} onDelete={deleteRow}
              />
            )}
          </>
        )}
      </div>

      {showCsvModal && (
        <CsvImportModal
          csvRows={csvRows}
          csvImporting={csvImporting}
          onImport={importCsvRows}
          onClose={() => { setShowCsvModal(false); setCsvRows([]); }}
        />
      )}

      {showModal && (
        <ExpenseFormModal
          activeTab={activeTab}
          editingRow={editingRow}
          saving={saving}
          expenseForm={expenseForm} setExpenseForm={setExpenseForm}
          invoiceForm={invoiceForm} setInvoiceForm={setInvoiceForm}
          suppliers={suppliers} projects={projects}
          onSave={activeTab === 'expenses' ? saveExpense : saveInvoice}
          onClose={() => setShowModal(false)}
        />
      )}

      <ConfirmModal dialog={confirmDlg} onClose={closeConfirm} />
    </div>
  );
}

export default function CompanyExpensesPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-50 flex items-center justify-center text-gray-400">載入中…</div>}>
      <CompanyExpensesPageInner />
    </Suspense>
  );
}
