'use client';

import Link from 'next/link';
import Navigation from '@/components/Navigation';
import OnboardingTour from '@/components/OnboardingTour';
import { useDashboard } from './_hooks/useDashboard';
import DashboardPublicView from './_components/DashboardPublicView';
import DashboardActionQueue from './_components/DashboardActionQueue';
import DashboardNotifications from './_components/DashboardNotifications';
import DashboardFinancialOverview from './_components/DashboardFinancialOverview';
import DashboardPlSummary from './_components/DashboardPlSummary';
import DashboardDecisionPanel from './_components/DashboardDecisionPanel';
import DashboardRecentTransactions from './_components/DashboardRecentTransactions';

function NT(val) {
  return `NT$ ${Number(val || 0).toLocaleString()}`;
}

function KpiCard({ label, value, sub, icon, colorClass = 'text-gray-900', borderClass = '' }) {
  return (
    <div className={`bg-white rounded-xl shadow-sm p-5 border border-gray-100 ${borderClass}`}>
      <div className="flex items-start justify-between mb-3">
        <p className="text-sm text-gray-500 font-medium">{label}</p>
        {icon && <span className="text-xl">{icon}</span>}
      </div>
      <p className={`text-2xl font-bold ${colorClass}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-2">{sub}</p>}
    </div>
  );
}

export default function Dashboard() {
  const {
    status, isLoggedIn,
    summary, summaryLoading,
    dashboardData, loading,
    executiveData, latestReport,
    ntfLoading, ntfError, ntfWarningExpanded, setNtfWarningExpanded,
    plData, plLoading, aqData, aqLoading, aqError,
    fetchNotifications, fetchActionQueue, handleRefreshAll,
    kpis, totalCashBalance, pendingPayments,
    dateStr, visibleNotifications, cashierPendingCount, checksPendingCount,
  } = useDashboard();

  return (
    <div className="min-h-screen page-bg-dashboard">
      <Navigation borderColor="border-blue-500" />
      {isLoggedIn && <OnboardingTour />}

      <main className="max-w-7xl mx-auto px-4 py-6">

        <div className="flex items-end justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-800">經營儀錶板</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              {dateStr}
              {dashboardData?.cachedAt && (
                <span className="ml-2 text-xs text-gray-400">
                  · 統計資料更新於 {new Date(dashboardData.cachedAt).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })}
                  {dashboardData.cacheStatus === 'cached' && ' (快取)'}
                </span>
              )}
            </p>
          </div>
          {isLoggedIn && (
            <div className="flex gap-2">
              <button
                onClick={handleRefreshAll}
                disabled={loading}
                className="bg-white border border-gray-300 text-gray-600 px-3 py-2 rounded-lg hover:bg-gray-50 text-sm disabled:opacity-50"
                title="強制重新整理統計資料"
              >
                重新整理
              </button>
              <Link href="/purchasing" className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 text-sm inline-flex items-center gap-1.5">
                <span>➕</span> 新增進貨單
              </Link>
              <Link href="/analytics" className="bg-white border border-blue-600 text-blue-600 px-4 py-2 rounded-lg hover:bg-blue-50 text-sm inline-flex items-center gap-1.5">
                <span>📊</span> 查看報表
              </Link>
            </div>
          )}
        </div>

        {status === 'loading' && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="bg-white rounded-xl shadow-sm p-5 h-28 animate-pulse">
                <div className="h-3 bg-gray-200 rounded w-1/2 mb-3"></div>
                <div className="h-7 bg-gray-200 rounded w-3/4"></div>
              </div>
            ))}
          </div>
        )}

        {status === 'unauthenticated' && (
          <DashboardPublicView summary={summary} summaryLoading={summaryLoading} />
        )}

        {isLoggedIn && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              <KpiCard label="本月進貨金額" value={loading ? '—' : NT(kpis.thisMonthPurchase)} sub={`費用 ${NT(kpis.thisMonthExpense)}`} icon="📦" borderClass="border-l-4 border-l-blue-400" />
              <KpiCard label="本月銷貨金額" value={loading ? '—' : NT(kpis.thisMonthSales)} sub={`毛利率 ${kpis.grossProfitMargin || 0}%`} icon="🧾" borderClass="border-l-4 border-l-indigo-400" />
              <KpiCard label="本月毛利" value={loading ? '—' : NT(kpis.grossProfit)} icon="📈" colorClass={(kpis.grossProfit || 0) >= 0 ? 'text-green-700' : 'text-red-600'} borderClass="border-l-4 border-l-green-400" />
              <KpiCard label="現金餘額合計" value={loading ? '—' : NT(totalCashBalance)} sub={`${dashboardData.cashAccounts?.length || 0} 個帳戶`} icon="💰" colorClass="text-emerald-700" borderClass="border-l-4 border-l-emerald-400" />
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <KpiCard label="庫存警示" value={loading ? '—' : `${kpis.lowInventoryCount || 0} 項`} sub={<Link href="/inventory" className="text-blue-600 hover:underline">查看詳情 →</Link>} icon="⚠️" colorClass={(kpis.lowInventoryCount || 0) > 0 ? 'text-red-600' : 'text-gray-400'} borderClass="border-l-4 border-l-red-400" />
              <KpiCard label="待付款單" value={loading ? '—' : `${pendingPayments} 筆`} sub={<Link href="/finance" className="text-blue-600 hover:underline">前往處理 →</Link>} icon="💳" colorClass={pendingPayments > 0 ? 'text-orange-600' : 'text-gray-400'} borderClass="border-l-4 border-l-orange-400" />
              <KpiCard label="逾期支票" value={loading ? '—' : `${dashboardData.riskAlerts?.overdueChecks || 0} 張`} sub={<Link href="/checks" className="text-blue-600 hover:underline">前往處理 →</Link>} icon="📋" colorClass={(dashboardData.riskAlerts?.overdueChecks || 0) > 0 ? 'text-yellow-700' : 'text-gray-400'} borderClass="border-l-4 border-l-yellow-400" />
              <KpiCard label="7 天內到期支票" value={loading ? '—' : `${dashboardData.riskAlerts?.checksDueSoon || 0} 張`} sub={<Link href="/checks" className="text-blue-600 hover:underline">查看支票 →</Link>} icon="⏰" colorClass={(dashboardData.riskAlerts?.checksDueSoon || 0) > 0 ? 'text-orange-600' : 'text-gray-400'} borderClass={(dashboardData.riskAlerts?.checksDueSoon || 0) > 0 ? 'border-l-4 border-l-orange-400' : 'border-l-4 border-l-gray-200'} />
              <KpiCard label="即將到期貸款" value={loading ? '—' : `${dashboardData.riskAlerts?.expiringLoans || 0} 筆`} sub={<Link href="/loans" className="text-blue-600 hover:underline">查看詳情 →</Link>} icon="🏦" colorClass={(dashboardData.riskAlerts?.expiringLoans || 0) > 0 ? 'text-purple-700' : 'text-gray-400'} borderClass="border-l-4 border-l-purple-400" />
            </div>

            <DashboardPlSummary plData={plData} plLoading={plLoading} />

            <DashboardActionQueue aqData={aqData} aqLoading={aqLoading} aqError={aqError} fetchActionQueue={fetchActionQueue} />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              <DashboardNotifications
                loading={loading}
                ntfLoading={ntfLoading}
                ntfError={ntfError}
                ntfWarningExpanded={ntfWarningExpanded}
                setNtfWarningExpanded={setNtfWarningExpanded}
                visibleNotifications={visibleNotifications}
                cashierPendingCount={cashierPendingCount}
                checksPendingCount={checksPendingCount}
                fetchNotifications={fetchNotifications}
              />
              <DashboardFinancialOverview
                loading={loading}
                kpis={kpis}
                cashAccounts={dashboardData.cashAccounts}
              />
            </div>

            <DashboardDecisionPanel executiveData={executiveData} latestReport={latestReport} />

            <DashboardRecentTransactions loading={loading} recentTransactions={dashboardData.recentTransactions} />

            <div className="flex gap-3 flex-wrap">
              <Link href="/sales" className="bg-white border border-gray-200 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-50 text-sm inline-flex items-center gap-1.5"><span>🧾</span> 新增發票</Link>
              <Link href="/inventory" className="bg-white border border-gray-200 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-50 text-sm inline-flex items-center gap-1.5"><span>📦</span> 查詢庫存</Link>
              <Link href="/cashflow" className="bg-white border border-gray-200 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-50 text-sm inline-flex items-center gap-1.5"><span>💸</span> 現金流</Link>
              <Link href="/utility-bills" className="bg-white border border-gray-200 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-50 text-sm inline-flex items-center gap-1.5"><span>⚡</span> 水電費</Link>
              <Link href="/pms-income" className="bg-white border border-gray-200 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-50 text-sm inline-flex items-center gap-1.5"><span>🏨</span> PMS收入</Link>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
