'use client';

import Link from 'next/link';
import HelpButton from '@/components/HelpButton';

export default function FinanceHeader({
  isLoggedIn,
  showAddForm, setShowAddForm,
  setSelectedInvoiceIds,
  setUnpaidInvoices,
  resetFilterAndForm,
  handlePrintFilteredByWarehouse,
  openPurchaseReportWithFilter,
  handleFinExportExcel,
  draftOrders,
  pendingOrders,
  executedOrders,
  rejectedOrders,
  submittedToCashier, setSubmittedToCashier,
}) {
  return (
    <>
      {/* 送出出納成功橫幅 */}
      {submittedToCashier && (
        <div className="max-w-7xl mx-auto px-4 pt-3">
          <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm text-green-800">
            <span>✓ 付款單已送出，請至出納執行匯款。</span>
            <Link href="/cashier" className="ml-1 px-3 py-1 bg-green-600 text-white text-xs rounded-lg hover:bg-green-700 transition-colors whitespace-nowrap">
              前往出納 →
            </Link>
            <button
              onClick={() => setSubmittedToCashier(false)}
              className="ml-auto text-green-500 hover:text-green-700 text-lg leading-none"
              aria-label="關閉提示"
            >
              ×
            </button>
          </div>
        </div>
      )}

      {/* 標題列與操作按鈕 */}
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center gap-2">
          <h2 className="text-2xl font-bold">付款管理</h2>
          <HelpButton anchor="六財務付款" />
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handlePrintFilteredByWarehouse}
            className="bg-white border border-indigo-300 text-indigo-700 px-4 py-2 rounded-lg hover:bg-indigo-50 text-sm"
          >
            按付款單的館別列印
          </button>
          <button
            type="button"
            onClick={openPurchaseReportWithFilter}
            className="bg-white border border-green-300 text-green-700 px-4 py-2 rounded-lg hover:bg-green-50 text-sm"
          >
            按進貨單的館別列印
          </button>
          <button
            onClick={handleFinExportExcel}
            className="px-3 py-2 rounded-lg text-sm font-medium bg-white text-green-700 hover:bg-green-50 border border-green-300"
          >
            📥 匯出Excel
          </button>
          {isLoggedIn && (
            <button
              onClick={() => {
                setShowAddForm(!showAddForm);
                if (!showAddForm) {
                  setSelectedInvoiceIds(new Set());
                  setUnpaidInvoices([]);
                  resetFilterAndForm();
                }
              }}
              className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700"
            >
              + 新增付款單
            </button>
          )}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-lg shadow p-4 border-l-4 border-gray-400">
          <p className="text-sm text-gray-500">草稿</p>
          <p className="text-2xl font-bold text-gray-700">{draftOrders.length}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4 border-l-4 border-yellow-500">
          <p className="text-sm text-gray-500">待出納</p>
          <p className="text-2xl font-bold text-yellow-700">{pendingOrders.length}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4 border-l-4 border-green-500">
          <p className="text-sm text-gray-500">已執行</p>
          <p className="text-2xl font-bold text-green-700">{executedOrders.length}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4 border-l-4 border-red-400">
          <p className="text-sm text-gray-500">已拒絕</p>
          <p className="text-2xl font-bold text-red-600">{rejectedOrders.length}</p>
        </div>
      </div>
    </>
  );
}
