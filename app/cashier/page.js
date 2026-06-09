'use client';

import { useState, useEffect } from 'react';
import Navigation from '@/components/Navigation';
import NotificationBanner from '@/components/NotificationBanner';
import ModuleGuideCard from '@/components/ModuleGuideCard';
import FetchErrorBanner from '@/components/FetchErrorBanner';
import { useConfirm } from '@/context/ConfirmContext';
import { useCashierOrders, SOURCE_OPTIONS, getSourceCategory } from './_hooks/useCashierOrders';
import { useCashierExecution } from './_hooks/useCashierExecution';
import { useCashierBatch } from './_hooks/useCashierBatch';
import { useCashierReport } from './_hooks/useCashierReport';
import OrdersTab from './_tabs/OrdersTab';
import BatchExecutionPanel from './_tabs/BatchExecutionPanel';
import ReportTab from './_tabs/ReportTab';

const TABS = [
  { key: 'pending', label: '' },
  { key: 'executed', label: '' },
  { key: 'rejected', label: '' },
  { key: 'report', label: '出納報表' },
];

export default function CashierPage() {
  const confirm = useConfirm();
  const [activeTab, setActiveTab] = useState('pending');

  // ── Orders / accounts / filters ──────────────────────────────
  const {
    accounts, suppliers, warehousesList,
    loading, fetchError,
    searchFilter, setSearchFilter,
    fetchAll, fetchOrders, fetchAccounts,
    handleSearch, clearSearch, loadAllHistory,
    handlePrint, handleExportExcel,
    pendingOrders, executedOrders, rejectedOrders,
  } = useCashierOrders();

  // ── Single-order execution ────────────────────────────────────
  const {
    expandedOrderId, setExpandedOrderId,
    rejectingOrderId, setRejectingOrderId,
    rejectReason, setRejectReason,
    executeData, setExecuteData,
    executionResults,
    executingOrderId,
    selfExecWarning, setSelfExecWarning,
    toggleExpand,
    handleExecute,
    handleReject,
  } = useCashierExecution({ fetchOrders, fetchAccounts });

  // ── Batch execution ───────────────────────────────────────────
  const {
    selectedOrderIds, setSelectedOrderIds,
    batchAccounts, setBatchAccounts,
    batchExecutionDate, setBatchExecutionDate,
    batchNote, setBatchNote,
    batchExecuting,
    batchIsEmployeeAdvance, setBatchIsEmployeeAdvance,
    batchAdvancedBy, setBatchAdvancedBy,
    batchAdvancePaymentMethod, setBatchAdvancePaymentMethod,
    batchExtraAmounts, setBatchExtraAmounts,
    selectedOrders,
    batchExtrasTotal,
    selectedTotal,
    hasLoanOrders,
    selectedByMethod,
    batchAccountsTotal,
    batchAmountDiff,
    handleToggleSelect,
    handleSelectAll,
    handleBatchExecute,
    resetBatch,
  } = useCashierBatch({ pendingOrders, accounts, fetchOrders, fetchAccounts });

  // ── Report ────────────────────────────────────────────────────
  const {
    reportDateFrom, setReportDateFrom,
    reportDateTo, setReportDateTo,
    reportData,
    reportLoading,
    fetchReportData,
    reportByMethod,
    reportTotal,
    reportByAccount,
  } = useCashierReport({ accounts });

  useEffect(() => {
    fetchAll();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Derived tab labels with counts
  const tabsWithCounts = TABS.map(t => ({
    ...t,
    label: t.key === 'pending' ? `待執行 (${pendingOrders.length})` :
           t.key === 'executed' ? `已執行 (${executedOrders.length})` :
           t.key === 'rejected' ? `已退回 (${rejectedOrders.length})` :
           t.label,
  }));

  // Compute display orders for the current tab
  function getDisplayOrders() {
    let list;
    switch (activeTab) {
      case 'pending': list = pendingOrders; break;
      case 'executed': list = executedOrders; break;
      case 'rejected': list = rejectedOrders; break;
      default: list = pendingOrders;
    }
    if (searchFilter.sourceType) {
      list = list.filter(o => getSourceCategory(o.sourceType, o) === searchFilter.sourceType);
    }
    return list;
  }

  const displayOrders = getDisplayOrders();
  const isPendingTab = activeTab === 'pending';

  return (
    <div className="min-h-screen page-bg-cashier">
      <Navigation borderColor="border-amber-600" />
      <NotificationBanner moduleFilter="cashier" />
      {fetchError && (
        <div className="max-w-7xl mx-auto px-4 pt-4">
          <FetchErrorBanner message={fetchError} onRetry={fetchAll} />
        </div>
      )}
      <main className="max-w-7xl mx-auto px-4 py-8">
        <h2 className="text-2xl font-bold text-amber-800 mb-4">出納作業</h2>

        <ModuleGuideCard
          title="出納日常流程"
          color="amber"
          steps={[
            { label: '查看待執行付款單', desc: '狀態為「待出納」的付款單列表，確認金額與帳戶後執行匯款' },
            { label: '執行匯款／結清', desc: '點擊「執行」→ 填入實際匯款金額與日期，系統同步現金流帳戶' },
            { label: '確認現金流帳戶', desc: '執行後到「現金流」確認帳戶餘額變動正確', link: { href: '/cashflow', text: '前往現金流' } },
            { label: '到期支票', desc: '每日留意「支票」頁的到期提醒，避免逾期未兌現', link: { href: '/checks', text: '前往支票' } },
          ]}
        />

        {/* 搜尋條件 */}
        <div className="bg-white rounded-lg shadow-sm border border-amber-100 p-4 mb-6">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">查詢條件</h3>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div>
              <label htmlFor="f" className="block text-xs text-gray-500 mb-1">建立日期起</label>
              <input id="f"
                type="date"
                value={searchFilter.dateFrom}
                onChange={e => setSearchFilter({ ...searchFilter, dateFrom: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
              />
            </div>
            <div>
              <label htmlFor="f-2" className="block text-xs text-gray-500 mb-1">建立日期迄</label>
              <input id="f-2"
                type="date"
                value={searchFilter.dateTo}
                onChange={e => setSearchFilter({ ...searchFilter, dateTo: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
              />
            </div>
            <div>
              <label htmlFor="f-3" className="block text-xs text-gray-500 mb-1">館別</label>
              <select id="f-3"
                value={searchFilter.warehouse}
                onChange={e => setSearchFilter({ ...searchFilter, warehouse: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
              >
                <option value="">全部館別</option>
                {warehousesList.map(w => <option key={w.id} value={w.name}>{w.name}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="f-16" className="block text-xs text-gray-500 mb-1">廠商</label>
              <select id="f-16"
                value={searchFilter.supplierId}
                onChange={e => setSearchFilter({ ...searchFilter, supplierId: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
              >
                <option value="">全部廠商</option>
                {suppliers.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="f-18" className="block text-xs text-gray-500 mb-1">類別</label>
              <select id="f-18"
                value={searchFilter.sourceType}
                onChange={e => setSearchFilter({ ...searchFilter, sourceType: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
              >
                {SOURCE_OPTIONS.map(opt => (
                  <option key={opt.value || '_all'} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 mt-3 items-center">
            <button
              type="button"
              onClick={handleSearch}
              className="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 text-sm font-medium"
            >
              查詢
            </button>
            <button
              type="button"
              onClick={clearSearch}
              className="px-4 py-2 border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50 text-sm"
            >
              還原預設（近3個月）
            </button>
            <button
              type="button"
              onClick={loadAllHistory}
              className="px-4 py-2 border border-amber-300 text-amber-700 rounded-lg hover:bg-amber-50 text-sm"
              title="移除日期限制，載入全部歷史資料（資料量大時較慢）"
            >
              查詢全部歷史
            </button>
            <span className="text-xs text-gray-400 ml-1">預設顯示近3個月 · 含所有待執行單據</span>
          </div>
        </div>

        {/* KPI Cards */}
        {activeTab !== 'report' && <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-white rounded-lg shadow p-4 border-l-4 border-amber-500">
            <p className="text-sm text-gray-500">待執行</p>
            <p className="text-2xl font-bold text-amber-700">{pendingOrders.length}</p>
          </div>
          <div className="bg-white rounded-lg shadow p-4 border-l-4 border-green-500">
            <p className="text-sm text-gray-500">已執行</p>
            <p className="text-2xl font-bold text-green-700">{executedOrders.length}</p>
          </div>
          <div className="bg-white rounded-lg shadow p-4 border-l-4 border-blue-500">
            <p className="text-sm text-gray-500">待執行總額</p>
            <p className="text-2xl font-bold text-blue-700">
              NT$ {pendingOrders.reduce((s, o) => s + o.netAmount, 0).toLocaleString()}
            </p>
          </div>
        </div>}

        {/* Tabs */}
        <div className="flex gap-2 mb-4 items-center">
          {tabsWithCounts.map(tab => (
            <button key={tab.key}
              onClick={async () => {
                if (tab.key !== activeTab) {
                  const hasBatch = selectedOrderIds.size > 0 && batchAccounts.some(a => a.accountId && parseFloat(a.amount) > 0);
                  if (hasBatch && !(await confirm('切換分頁會清除目前的批次帳務設定，確定繼續？', { title: '切換分頁' }))) return;
                }
                setActiveTab(tab.key); setExpandedOrderId(null); setSelectedOrderIds(new Set());
              }}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === tab.key
                  ? 'bg-amber-600 text-white'
                  : 'bg-white text-gray-600 hover:bg-amber-50 border border-gray-200'
              }`}
            >{tab.label}</button>
          ))}
          <div className="ml-auto flex gap-2">
            <button onClick={() => handlePrint(displayOrders, activeTab, tabsWithCounts)}
              className="px-3 py-2 rounded-lg text-sm font-medium bg-white text-gray-600 hover:bg-gray-100 border border-gray-300 flex items-center gap-1">
              🖨 列印
            </button>
            <button onClick={() => handleExportExcel(displayOrders, activeTab, tabsWithCounts)}
              className="px-3 py-2 rounded-lg text-sm font-medium bg-white text-green-700 hover:bg-green-50 border border-green-300 flex items-center gap-1">
              📥 匯出Excel
            </button>
          </div>
        </div>

        {/* Orders Table */}
        {activeTab !== 'report' && (
          <OrdersTab
            activeTab={activeTab}
            displayOrders={displayOrders}
            loading={loading}
            accounts={accounts}
            expandedOrderId={expandedOrderId}
            executeData={executeData}
            setExecuteData={setExecuteData}
            executionResults={executionResults}
            executingOrderId={executingOrderId}
            rejectingOrderId={rejectingOrderId}
            setRejectingOrderId={setRejectingOrderId}
            rejectReason={rejectReason}
            setRejectReason={setRejectReason}
            selectedOrderIds={selectedOrderIds}
            pendingOrders={pendingOrders}
            toggleExpand={toggleExpand}
            handleExecute={handleExecute}
            handleReject={handleReject}
            handleToggleSelect={handleToggleSelect}
            handleSelectAll={handleSelectAll}
            searchFilter={searchFilter}
            setExpandedOrderId={setExpandedOrderId}
          />
        )}

        {/* Batch Execution Panel */}
        {isPendingTab && selectedOrderIds.size > 0 && (
          <BatchExecutionPanel
            selectedOrderIds={selectedOrderIds}
            selectedOrders={selectedOrders}
            selectedTotal={selectedTotal}
            batchExtrasTotal={batchExtrasTotal}
            hasLoanOrders={hasLoanOrders}
            selectedByMethod={selectedByMethod}
            batchAccounts={batchAccounts}
            setBatchAccounts={setBatchAccounts}
            batchAccountsTotal={batchAccountsTotal}
            batchAmountDiff={batchAmountDiff}
            batchExecutionDate={batchExecutionDate}
            setBatchExecutionDate={setBatchExecutionDate}
            batchNote={batchNote}
            setBatchNote={setBatchNote}
            batchExecuting={batchExecuting}
            batchIsEmployeeAdvance={batchIsEmployeeAdvance}
            setBatchIsEmployeeAdvance={setBatchIsEmployeeAdvance}
            batchAdvancedBy={batchAdvancedBy}
            setBatchAdvancedBy={setBatchAdvancedBy}
            batchAdvancePaymentMethod={batchAdvancePaymentMethod}
            setBatchAdvancePaymentMethod={setBatchAdvancePaymentMethod}
            batchExtraAmounts={batchExtraAmounts}
            setBatchExtraAmounts={setBatchExtraAmounts}
            accounts={accounts}
            handleBatchExecute={handleBatchExecute}
            resetBatch={resetBatch}
          />
        )}

        {/* Report Tab */}
        {activeTab === 'report' && (
          <ReportTab
            reportDateFrom={reportDateFrom}
            setReportDateFrom={setReportDateFrom}
            reportDateTo={reportDateTo}
            setReportDateTo={setReportDateTo}
            reportData={reportData}
            reportLoading={reportLoading}
            fetchReportData={fetchReportData}
            reportByMethod={reportByMethod}
            reportTotal={reportTotal}
            reportByAccount={reportByAccount}
            accounts={accounts}
          />
        )}
      </main>

      {/* Print styles：確保出納兩段表格與框線正確列印 */}
      <style jsx global>{`
        @media print {
          body * {
            visibility: hidden;
          }
          .print-area, .print-area * {
            visibility: visible;
          }
          .print-area {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            background: white;
          }
          .no-print {
            display: none !important;
          }
          .print-content {
            box-shadow: none !important;
            border-radius: 0 !important;
            background: white !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .print-content .report-table {
            font-size: 10pt;
            border: 1px solid #333 !important;
          }
          .print-content .report-table th,
          .print-content .report-table td {
            padding: 4px 6px;
            border: 1px solid #333 !important;
          }
          .print-content .report-table thead tr {
            background: #f3f4f6 !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .print-content .report-table tfoot tr {
            background: #f9fafb !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          @page {
            size: A4 landscape;
            margin: 10mm 12mm;
          }
        }
      `}</style>

      {/* 職責分離警示 Modal */}
      {selfExecWarning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div>
                <h3 className="text-base font-bold text-gray-900">職責分離提醒</h3>
                <p className="text-sm text-gray-600 mt-1">
                  付款單 <span className="font-mono font-semibold">{selfExecWarning.orderNo}</span> 由您本人建立並執行，
                  不符合財務內控規範（雙人核准原則）。
                </p>
                <p className="text-sm text-gray-500 mt-1.5">
                  建議後續應由不同人員擔任建立人與出納執行人，以確保帳務獨立性。
                </p>
              </div>
            </div>
            <div className="bg-gray-50 rounded-lg px-4 py-3 mb-4 space-y-1 text-xs text-gray-600 font-mono">
              <div>執行單號：{selfExecWarning.executionNo}</div>
              <div>現金交易：{selfExecWarning.cashTransactionNo}</div>
            </div>
            <button
              onClick={() => setSelfExecWarning(null)}
              className="w-full px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 text-sm font-medium"
            >
              已知悉，繼續
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
