'use client';

import Navigation from '@/components/Navigation';
import NotificationBanner from '@/components/NotificationBanner';
import FetchErrorBanner from '@/components/FetchErrorBanner';
import ModuleGuideCard from '@/components/ModuleGuideCard';
import { useCashflow } from './_hooks/useCashflow';
import CashflowHeader from './_components/CashflowHeader';
import CashflowTabs from './_components/CashflowTabs';
import CashflowLoadingSkeleton from './_components/CashflowLoadingSkeleton';
import ReportTab from './_tabs/ReportTab';
import ForecastTab from './_tabs/ForecastTab';
import CashCountTabComponent from './_tabs/CashCountTab';
import CategoryMgmtTab from './_tabs/CategoryMgmtTab';
import OverviewTab from './_tabs/OverviewTab';
import SubjectQueryTab from './_tabs/SubjectQueryTab';
import TransactionsTab from './_tabs/TransactionsTab';

export default function CashFlowPage() {
  const cf = useCashflow();

  if (cf.loading) return <CashflowLoadingSkeleton />;

  return (
    <div className="min-h-screen page-bg-cashflow">
      <Navigation borderColor="border-emerald-600" />
      <NotificationBanner moduleFilter="cashflow" />

      <main className="max-w-7xl mx-auto px-4 py-8">
        <CashflowHeader
          activeTab={cf.activeTab}
          transactions={cf.transactions}
          fetchTransactions={cf.fetchTransactions}
        />

        <ModuleGuideCard
          title="現金流操作流程"
          color="slate"
          storageKey="guide:cashflow:ops"
          steps={[
            {
              label: '日常：以自動來源為主',
              desc: '出納執行付款、PMS 收入匯入、民宿匯入後，系統自動產生交易，請勿重複手動補登。只有真正缺少來源的雜項才用「手動」(manual) 補記。',
            },
            {
              label: '分辨「存簿對帳」vs「存簿核對」',
              desc: '「存簿對帳（/reconciliation）」是核對信用卡／OTA 流水；「存簿核對（/bank-reconciliation）」是逐筆比對銀行月結對帳單，確認系統餘額與銀行一致。兩者都確認後才代表數字可信。',
            },
            {
              label: '現金帳戶：月底盤點',
              desc: '若有現金帳戶，每月底至「現金盤點」分頁填寫實點面額，系統自動計算差異並留存稽核紀錄。',
            },
            {
              label: '損益科目：每月批次歸類',
              desc: '至「損益科目管理」分頁，找出未分類（plLevel1 為空）的交易，批次指定科目分類，否則收支報表會有缺口。',
              link: { href: '/manual#八現金流管理', text: '查看手冊說明' },
            },
          ]}
        />

        <CashflowTabs
          activeTab={cf.activeTab}
          setActiveTab={cf.setActiveTab}
          fetchTransactions={cf.fetchTransactions}
          fetchSummary={cf.fetchSummary}
        />

        {cf.accountsError && (
          <FetchErrorBanner message={cf.accountsError} onRetry={cf.fetchAccounts} />
        )}
        {cf.activeTab === 'transactions' && cf.transactionsError && (
          <FetchErrorBanner message={cf.transactionsError} onRetry={cf.fetchTransactions} />
        )}

        {cf.activeTab === 'overview' && (
          <OverviewTab
            accounts={cf.accounts} warehouses={cf.warehouses} isLoggedIn={cf.isLoggedIn}
            pmsDashboard={cf.pmsDashboard} overviewCategorySummary={cf.overviewCategorySummary}
            showAccountForm={cf.showAccountForm} setShowAccountForm={cf.setShowAccountForm}
            accountForm={cf.accountForm} setAccountForm={cf.setAccountForm}
            handleCreateAccount={cf.handleCreateAccount} handleSetPrimaryAccount={cf.handleSetPrimaryAccount}
            handleDeleteAccount={cf.handleDeleteAccount} formatMoney={cf.formatMoney}
          />
        )}

        {cf.activeTab === 'transactions' && (
          <TransactionsTab
            accounts={cf.accounts} suppliers={cf.suppliers} warehouses={cf.warehouses}
            accountingSubjects={cf.accountingSubjects} categories={cf.categories}
            isLoggedIn={cf.isLoggedIn} noCatStats={cf.noCatStats} setActiveTab={cf.setActiveTab}
            txFilter={cf.txFilter} setTxFilter={cf.setTxFilter}
            txPage={cf.txPage} setTxPage={cf.setTxPage} txPagination={cf.txPagination}
            transactions={cf.transactions} sortedTransactions={cf.sortedTransactions}
            cfTxKey={cf.cfTxKey} cfTxDir={cf.cfTxDir} cfTxToggle={cf.cfTxToggle}
            showTxForm={cf.showTxForm} setShowTxForm={cf.setShowTxForm}
            txForm={cf.txForm} setTxForm={cf.setTxForm}
            handleCreateTransaction={cf.handleCreateTransaction} handleDeleteTransaction={cf.handleDeleteTransaction}
            fetchTransactions={cf.fetchTransactions} formatMoney={cf.formatMoney}
            getAccountName={cf.getAccountName} getSupplierName={cf.getSupplierName}
            getCategoriesForType={cf.getCategoriesForType}
            onUpdate={cf.handleUpdateTransaction} onReverse={cf.handleReverseTransaction}
          />
        )}

        {cf.activeTab === 'subject-query' && (
          <SubjectQueryTab
            warehouses={cf.warehouses} accountingSubjects={cf.accountingSubjects}
            subjectFilter={cf.subjectFilter} setSubjectFilter={cf.setSubjectFilter}
            subjectData={cf.subjectData} subjectLoading={cf.subjectLoading}
            fetchSubjectQuery={cf.fetchSubjectQuery} formatMoney={cf.formatMoney}
            noCatStats={cf.noCatStats}
            onGoToCategoryMgmt={() => cf.setActiveTab('category-mgmt')}
          />
        )}

        {cf.activeTab === 'report' && (
          <ReportTab
            reportFilter={cf.reportFilter}
            setReportFilter={cf.setReportFilter}
            warehouses={cf.warehouses}
            suppliers={cf.suppliers}
            reportData={cf.reportData}
            fetchReport={cf.fetchReport}
            formatMoney={cf.formatMoney}
            onGoToCategoryMgmt={() => cf.setActiveTab('category-mgmt')}
          />
        )}

        {cf.activeTab === 'forecast' && (
          <ForecastTab
            forecastWarehouse={cf.forecastWarehouse}
            setForecastWarehouse={cf.setForecastWarehouse}
            warehouses={cf.warehouses}
            summaryData={cf.summaryData}
            fetchSummary={cf.fetchSummary}
            formatMoney={cf.formatMoney}
          />
        )}

        {cf.activeTab === 'cash-count' && (
          <CashCountTabComponent
            accounts={cf.accounts.filter(a => a.type === '現金')}
            warehouses={cf.warehouses}
          />
        )}

        {cf.activeTab === 'category-mgmt' && (
          <CategoryMgmtTab
            noCatStats={cf.noCatStats}
            seedLoading={cf.seedLoading}
            handleSeedCategories={cf.handleSeedCategories}
            batchCatForm={cf.batchCatForm}
            setBatchCatForm={cf.setBatchCatForm}
            batchLoading={cf.batchLoading}
            handleBatchCategorize={cf.handleBatchCategorize}
            categories={cf.categories}
            showCategoryForm={cf.showCategoryForm}
            setShowCategoryForm={cf.setShowCategoryForm}
            categoryForm={cf.categoryForm}
            setCategoryForm={cf.setCategoryForm}
            handleCreateCategory={cf.handleCreateCategory}
            editCatId={cf.editCatId}
            setEditCatId={cf.setEditCatId}
            editCatForm={cf.editCatForm}
            setEditCatForm={cf.setEditCatForm}
            handleUpdateCategory={cf.handleUpdateCategory}
            handleDeleteCategory={cf.handleDeleteCategory}
          />
        )}
      </main>
    </div>
  );
}
