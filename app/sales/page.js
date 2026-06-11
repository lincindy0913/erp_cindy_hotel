'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import Navigation from '@/components/Navigation';
import { useConfirm } from '@/context/ConfirmContext';
import FetchErrorBanner from '@/components/FetchErrorBanner';
import ExcelBatchImport from '@/components/ExcelBatchImport';
import HelpButton from '@/components/HelpButton';
import ModuleGuideCard from '@/components/ModuleGuideCard';
import { hasPermission, PERMISSIONS } from '@/lib/permissions';
import OwnerExpensesPanel from '@/components/owner-expenses/OwnerExpensesPanel';
import ReportView from './_sections/ReportView';
import MonthlyView from './_sections/MonthlyView';
import ListView from './_sections/ListView';
import AddInvoiceForm from './_tabs/AddInvoiceForm';
import AddAllowanceForm from './_tabs/AddAllowanceForm';
import { useSalesInvoice } from './_hooks/useSalesInvoice';
import { useSalesReport } from './_hooks/useSalesReport';
import { useSalesMonthly } from './_hooks/useSalesMonthly';
import { useState, useEffect } from 'react';

const SALES_VIEWS = ['list', 'report', 'monthly', 'owner-monthly'];

function InvoicePageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const confirm = useConfirm();

  const userPermissions = session?.user?.permissions || [];
  const isAdmin = session?.user?.role === 'admin';
  const canSalesView =
    isAdmin || userPermissions.includes('*') || hasPermission(userPermissions, PERMISSIONS.SALES_VIEW);
  const canOwnerExpense =
    isAdmin || userPermissions.includes('*') || hasPermission(userPermissions, PERMISSIONS.OWNER_EXPENSE_VIEW);
  const isLoggedIn = !!session;

  const [activeView, setActiveView] = useState('list');

  // ── hooks ──
  const invoice = useSalesInvoice({ searchParams, canSalesView, setActiveView });
  const report  = useSalesReport({ activeView, searchParams });
  const monthly = useSalesMonthly({ activeView, canSalesView });

  // ── view navigation ──
  function goSalesView(next) {
    if (next === 'owner-monthly') {
      if (!canSalesView && !canOwnerExpense) return;
    } else if (!canSalesView) {
      return;
    }
    setActiveView(next);
    const p = new URLSearchParams(searchParams.toString());
    p.set('view', next);
    p.delete('sub');
    router.replace(`/sales?${p.toString()}`, { scroll: false });
  }

  function goReportSub(panel) {
    if (!canSalesView) return;
    setActiveView('report');
    const p = new URLSearchParams(searchParams.toString());
    p.set('view', 'report');
    if (panel === 'owner' || panel === 'private') {
      p.set('sub', panel);
    } else {
      p.delete('sub');
    }
    router.replace(`/sales?${p.toString()}`, { scroll: false });
  }

  // 僅有業主私帳權限時，預設開「業主私帳月結」分頁
  useEffect(() => {
    if (!session) return;
    if (!canSalesView && canOwnerExpense && searchParams.get('view') !== 'owner-monthly') {
      setActiveView('owner-monthly');
      const p = new URLSearchParams(searchParams.toString());
      p.set('view', 'owner-monthly');
      router.replace(`/sales?${p.toString()}`, { scroll: false });
    }
  }, [session, canSalesView, canOwnerExpense, searchParams, router]);

  // 網址 ?view= 與權限同步分頁
  useEffect(() => {
    if (!session) return;
    const v = searchParams.get('view');
    if (!v || !SALES_VIEWS.includes(v)) return;
    if (v === 'owner-monthly') {
      if (canSalesView || canOwnerExpense) setActiveView(v);
      return;
    }
    if (!canSalesView) return;
    setActiveView(v);
  }, [session, searchParams, canSalesView, canOwnerExpense]);

  return (
    <div className="min-h-screen page-bg-sales">
      <Navigation borderColor="border-green-500" />
      {invoice.invoicesError && (
        <div className="max-w-7xl mx-auto px-4 pt-4">
          <FetchErrorBanner message={invoice.invoicesError} onRetry={() => invoice.fetchInvoices(1)} />
        </div>
      )}

      <main className="max-w-7xl mx-auto px-4 py-8">
        <ModuleGuideCard
          title="銷項發票日常流程"
          color="green"
          steps={[
            { label: '從進貨帶入', desc: '切換到「進貨管理」，點擊已入庫進貨單旁的「開立發票 →」，系統自動帶入廠商篩選', link: { href: '/purchasing', text: '前往進貨管理' } },
            { label: '填寫發票', desc: '勾選本次要核銷的進貨品項，填入發票號碼、日期、抬頭，確認金額後送出' },
            { label: '月底查核', desc: '點選「逾 60 天待核銷」快速篩選，確認所有逾期未核銷發票已處理' },
            { label: '月結', desc: '確認所有發票已核銷後，前往月結完成鎖帳', link: { href: '/month-end', text: '前往月結' } },
          ]}
        />

        {/* 標題與操作 */}
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-2">
            <h2 className="text-2xl font-bold">發票登錄/核銷</h2>
            <HelpButton anchor="五發票登錄核銷" />
          </div>
          {activeView === 'list' && canSalesView && (
            <div className="flex items-center gap-3">
              <button onClick={() => invoice.handlePrintFilteredList(invoice.sortedInvoicesForList)}
                className="px-3 py-2 rounded-lg text-sm font-medium bg-white text-gray-600 hover:bg-gray-100 border border-gray-300">
                🖨 列印
              </button>
              <button onClick={() => invoice.handleExportFilteredExcel(invoice.sortedInvoicesForList)}
                className="px-3 py-2 rounded-lg text-sm font-medium bg-white text-green-700 hover:bg-green-50 border border-green-300">
                📥 匯出Excel
              </button>
              {isLoggedIn && (
                <>
                  <ExcelBatchImport
                    title="批次匯入銷項發票"
                    hint="上傳「發票開立報表.xls」，系統依發票號碼+日期去重，相同發票自動跳過。"
                    columns={[
                      { key: 'invoiceNo',    header: '發票號碼', example: 'AB-12345678', required: true,  width: 16 },
                      { key: 'invoiceDate',  header: '發票日期', example: '2026-01-15',  required: false, width: 14, note: '留空用今日' },
                      { key: 'invoiceTitle', header: '發票抬頭', example: '○○有限公司', required: false, width: 20 },
                      { key: 'amount',       header: '銷售額',   example: '1000',        required: false, width: 12 },
                      { key: 'tax',          header: '稅額',     example: '50',          required: false, width: 10 },
                      { key: 'totalAmount',  header: '含稅合計', example: '1050',        required: false, width: 12, note: '留空=銷售額+稅額' },
                      { key: 'taxType',      header: '稅別',     example: '應稅',        required: false, width: 10, note: '應稅/免稅/零稅率' },
                      { key: 'warehouse',    header: '館別',     example: '格',          required: false, width: 10 },
                      { key: 'note',         header: '備註',     example: '',            required: false, width: 16 },
                    ]}
                    onImport={async rows => {
                      const res = await fetch('/api/sales/import-excel', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ rows }),
                      });
                      const json = await res.json();
                      if (res.ok) { invoice.fetchInvoices(1); return json; }
                      throw new Error(json.error || '匯入失敗');
                    }}
                    buttonClass="bg-green-600 text-white px-3 py-2 rounded-lg hover:bg-green-700 flex items-center gap-1.5 text-sm font-medium"
                  />
                  <button
                    onClick={() => { invoice.setShowAddAllowanceForm(!invoice.showAddAllowanceForm); invoice.setShowAddForm(false); }}
                    className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 text-sm">
                    ➕ 新增折讓發票
                  </button>
                  <button
                    onClick={() => {
                      invoice.setShowAddForm(!invoice.showAddForm);
                      invoice.setShowAddAllowanceForm(false);
                      if (!invoice.showAddForm) {
                        invoice.setSelectedItems([]);
                        invoice.setAvailableItems([]);
                        invoice.setFilterData({ yearMonth: '', supplierId: '', warehouse: '' });
                      }
                    }}
                    className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700">
                    ➕ 新增發票
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        {/* 新增折讓發票表單 */}
        {invoice.showAddAllowanceForm && canSalesView && (
          <AddAllowanceForm
            allowanceFormData={invoice.allowanceFormData}
            setAllowanceFormData={invoice.setAllowanceFormData}
            allowanceSaving={invoice.allowanceSaving}
            saveAllowance={invoice.saveAllowance}
            setShowAddAllowanceForm={invoice.setShowAddAllowanceForm}
          />
        )}

        {/* 新增發票表單 */}
        {invoice.showAddForm && canSalesView && (
          <AddInvoiceForm
            editingInvoice={invoice.editingInvoice}
            suppliers={invoice.suppliers}
            products={invoice.products}
            filterData={invoice.filterData}
            setFilterData={invoice.setFilterData}
            loadingItems={invoice.loadingItems}
            availableItems={invoice.availableItems}
            selectedItems={invoice.selectedItems}
            formData={invoice.formData}
            setFormData={invoice.setFormData}
            invoiceTitles={invoice.invoiceTitles}
            showTitleManager={invoice.showTitleManager}
            setShowTitleManager={invoice.setShowTitleManager}
            newTitleName={invoice.newTitleName}
            setNewTitleName={invoice.setNewTitleName}
            taxAmount={invoice.taxAmount}
            totals={invoice.totals}
            salesSaving={invoice.salesSaving}
            fetchUninvoicedItems={invoice.fetchUninvoicedItems}
            handleItemToggle={invoice.handleItemToggle}
            handleSelectAll={invoice.handleSelectAll}
            handleAddTitle={invoice.handleAddTitle}
            handleDeleteTitle={invoice.handleDeleteTitle}
            handleSubmit={invoice.handleSubmit}
            setShowAddForm={invoice.setShowAddForm}
            setEditingInvoice={invoice.setEditingInvoice}
            setSelectedItems={invoice.setSelectedItems}
            setAvailableItems={invoice.setAvailableItems}
            setSalesSaving={invoice.setSalesSaving}
            confirm={confirm}
          />
        )}

        {/* View toggle */}
        {(canSalesView || canOwnerExpense) && (
          <div className="flex flex-wrap gap-1 mb-4 bg-white rounded-lg shadow-sm border border-gray-100 p-1 w-fit">
            {[
              ...(canSalesView
                ? [
                    { key: 'list',    label: '發票列表' },
                    { key: 'report',  label: '報表' },
                    { key: 'monthly', label: '月度館別統計' },
                  ]
                : []),
              ...(canSalesView || canOwnerExpense ? [{ key: 'owner-monthly', label: '業主私帳月結' }] : []),
            ].map((v) => (
              <button
                key={v.key}
                type="button"
                onClick={() => goSalesView(v.key)}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  activeView === v.key ? 'bg-green-600 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-50'
                }`}>
                {v.label}
              </button>
            ))}
          </div>
        )}

        {/* 業主發票私帳月結 */}
        {activeView === 'owner-monthly' && (canSalesView || canOwnerExpense) && (
          <div className="space-y-3 mb-6">
            <p className="text-sm text-gray-600">
              {canSalesView ? (
                <>
                  此處登記「業主發票私帳」月結金額，會反映在
                  <button type="button" className="text-green-700 hover:underline mx-1 font-medium"
                    onClick={() => goSalesView('report')}>
                    報表
                  </button>
                  的業主私帳統計。
                </>
              ) : (
                <>此處登記「業主發票私帳」月結金額（每月依發票抬頭填寫一次）。</>
              )}
              發票抬頭請至
              <Link href="/settings?tab=invoice-titles" className="text-green-700 hover:underline mx-1">
                設定 → 發票抬頭
              </Link>
              維護。
            </p>
            <OwnerExpensesPanel
              embedded
              onSaved={() => report.fetchOwnerExpenseTotal(report.reportDateFrom, report.reportDateTo)}
            />
          </div>
        )}

        {/* 報表 */}
        {activeView === 'report' && canSalesView && (
          <>
            {report.privateError && (
              <FetchErrorBanner message={report.privateError} onRetry={() => report.fetchPrivateInvoices(report.reportDateFrom, report.reportDateTo)} />
            )}
            <ReportView
              invoices={invoice.invoices}
              allowances={invoice.allowances}
              invoiceTitles={invoice.invoiceTitles}
              privateInvoices={report.privateInvoices}
              privateLoading={report.privateLoading}
              reportSubIsOwner={report.reportSubIsOwner}
              reportSubIsPrivate={report.reportSubIsPrivate}
              goReportSub={goReportSub}
              reportDateFrom={report.reportDateFrom}
              reportDateTo={report.reportDateTo}
              reportTitle={report.reportTitle}
              reportWarehouse={report.reportWarehouse}
              reportType={report.reportType}
              setReportDateFrom={report.setReportDateFrom}
              setReportDateTo={report.setReportDateTo}
              setReportTitle={report.setReportTitle}
              setReportWarehouse={report.setReportWarehouse}
              setReportType={report.setReportType}
              fetchPrivateInvoices={report.fetchPrivateInvoices}
              fetchOwnerExpenseTotal={report.fetchOwnerExpenseTotal}
              showPrivateForm={report.showPrivateForm}
              setShowPrivateForm={report.setShowPrivateForm}
              editingPrivateId={report.editingPrivateId}
              setEditingPrivateId={report.setEditingPrivateId}
              privateForm={report.privateForm}
              setPrivateForm={report.setPrivateForm}
              privateSaving={report.privateSaving}
              savePrivateInvoice={report.savePrivateInvoice}
              deletePrivateInvoice={report.deletePrivateInvoice}
              openEditPrivate={report.openEditPrivate}
              canSalesView={canSalesView}
              canOwnerExpense={canOwnerExpense}
              goSalesView={goSalesView}
            />
          </>
        )}

        {/* 月度館別統計 */}
        {activeView === 'monthly' && canSalesView && (
          <>
            {monthly.statsError && <FetchErrorBanner message={monthly.statsError} onRetry={monthly.fetchMonthlyStats} />}
            <MonthlyView
              statsStartMonth={monthly.statsStartMonth}
              statsEndMonth={monthly.statsEndMonth}
              statsWarehouse={monthly.statsWarehouse}
              setStatsStartMonth={monthly.setStatsStartMonth}
              setStatsEndMonth={monthly.setStatsEndMonth}
              setStatsWarehouse={monthly.setStatsWarehouse}
              statsData={monthly.statsData}
              statsLoading={monthly.statsLoading}
              fetchMonthlyStats={monthly.fetchMonthlyStats}
              setSearchDateFrom={invoice.setSearchDateFrom}
              setSearchDateTo={invoice.setSearchDateTo}
              setSearchWarehouse={invoice.setSearchWarehouse}
              setSearchInvoiceTitle={invoice.setSearchInvoiceTitle}
              goSalesView={goSalesView}
            />
          </>
        )}

        {/* 發票列表 */}
        {activeView === 'list' && canSalesView && (
          <ListView
            mergedListForDisplay={invoice.mergedListForDisplay}
            invoiceTitles={invoice.invoiceTitles}
            products={invoice.products}
            loading={invoice.loading}
            invoiceTotal={invoice.invoiceTotal}
            invoicePage={invoice.invoicePage}
            invoiceTotalPages={invoice.invoiceTotalPages}
            searchSupplier={invoice.searchSupplier}
            searchInvoiceTitle={invoice.searchInvoiceTitle}
            searchWarehouse={invoice.searchWarehouse}
            searchInvoiceType={invoice.searchInvoiceType}
            searchDateFrom={invoice.searchDateFrom}
            searchDateTo={invoice.searchDateTo}
            searchStatus={invoice.searchStatus}
            setSearchSupplier={invoice.setSearchSupplier}
            setSearchInvoiceTitle={invoice.setSearchInvoiceTitle}
            setSearchWarehouse={invoice.setSearchWarehouse}
            setSearchInvoiceType={invoice.setSearchInvoiceType}
            setSearchDateFrom={invoice.setSearchDateFrom}
            setSearchDateTo={invoice.setSearchDateTo}
            setSearchStatus={invoice.setSearchStatus}
            saleInvKey={invoice.saleInvKey}
            saleInvDir={invoice.saleInvDir}
            toggleSaleInv={invoice.toggleSaleInv}
            checkedInvoiceIds={invoice.checkedInvoiceIds}
            setCheckedInvoiceIds={invoice.setCheckedInvoiceIds}
            expandedInvoices={invoice.expandedInvoices}
            handleViewDetails={invoice.handleViewDetails}
            fetchInvoices={invoice.fetchInvoices}
            handleEdit={invoice.handleEdit}
            handleDelete={invoice.handleDelete}
            handlePrintInvoices={(sortedList) => invoice.handlePrintInvoices(sortedList || invoice.sortedInvoicesForList)}
            isLoggedIn={isLoggedIn}
            getSupplierName={invoice.getSupplierName}
          />
        )}
      </main>
    </div>
  );
}

export default function InvoicePage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-gray-500">載入中...</div>}>
      <InvoicePageInner />
    </Suspense>
  );
}
