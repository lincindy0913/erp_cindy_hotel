'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import Navigation from '@/components/Navigation';
import FetchErrorBanner from '@/components/FetchErrorBanner';
import OnboardingTour from '@/components/OnboardingTour';

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

function MiniBar({ label, value, max, color = 'bg-blue-500' }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-gray-500 w-16 shrink-0 text-right">{label}</span>
      <div className="flex-1 bg-gray-100 rounded-full h-2.5">
        <div className={`${color} h-2.5 rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-medium text-gray-700 w-24 shrink-0">{NT(value)}</span>
    </div>
  );
}

export default function Dashboard() {
  const { data: session, status } = useSession();
  const isLoggedIn = status === 'authenticated';

  // Public summary (always fetched, no auth)
  const [summary, setSummary] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(true);

  // Authenticated-only data
  const [dashboardData, setDashboardData] = useState({
    kpis: {
      thisMonthPurchase: 0, thisMonthSales: 0, grossProfit: 0, grossProfitMargin: 0,
      lowInventoryCount: 0, totalCashBalance: 0, pendingPayments: 0, thisMonthExpense: 0,
    },
    recentTransactions: [],
    thisMonthTrend: { purchases: 0, sales: 0 },
    cashAccounts: [],
    riskAlerts: { overdueChecks: 0, expiringLoans: 0 },
  });
  const [loading, setLoading] = useState(true);
  const [executiveData, setExecutiveData] = useState(null);
  const [latestReport, setLatestReport] = useState(null);

  const [ntfNotifications, setNtfNotifications] = useState([]);
  const [ntfSummary, setNtfSummary] = useState({ total: 0, critical: 0, urgent: 0, warning: 0 });
  const [ntfLoading, setNtfLoading] = useState(true);
  const [ntfError, setNtfError] = useState(false);
  const [ntfWarningExpanded, setNtfWarningExpanded] = useState(false);
  const [plData, setPlData] = useState(null);
  const [plLoading, setPlLoading] = useState(false);

  // 角色待辦佇列
  const [aqData, setAqData] = useState(null);
  const [aqLoading, setAqLoading] = useState(false);
  const [aqError, setAqError] = useState(null);

  // Always fetch public summary
  useEffect(() => {
    fetch('/api/dashboard/summary')
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setSummary(data); })
      .catch(() => {})
      .finally(() => setSummaryLoading(false));
  }, []);

  const fetchNotifications = useCallback(async (forceRefresh = false) => {
    setNtfLoading(true);
    setNtfError(false);
    try {
      const res = await fetch('/api/notifications/calculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(forceRefresh ? { refresh: true } : {}),
      });
      if (res.ok) {
        const data = await res.json();
        setNtfNotifications(data.notifications || []);
        setNtfSummary(data.summary || { total: 0, critical: 0, urgent: 0, warning: 0 });
      } else {
        setNtfError(true);
      }
    } catch (err) {
      console.error('Failed to fetch notifications:', err);
      setNtfError(true);
    } finally {
      setNtfLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isLoggedIn) {
      setLoading(false);
      setNtfLoading(false);
      return;
    }
    fetchDashboardData();
    fetchNotifications();
    fetchExecutiveData();
    fetchLatestReport();
    fetchPlData();
    fetchActionQueue();
  }, [isLoggedIn, fetchNotifications]);

  async function fetchActionQueue() {
    setAqLoading(true);
    setAqError(null);
    try {
      const res = await fetch('/api/dashboard/action-queue');
      if (res.ok) setAqData(await res.json());
      else setAqError('待辦佇列載入失敗，請稍後再試');
    } catch { setAqError('待辦佇列載入失敗，請稍後再試'); }
    setAqLoading(false);
  }

  async function fetchDashboardData(refresh = false) {
    try {
      const url = refresh ? '/api/dashboard?refresh=true' : '/api/dashboard';
      const response = await fetch(url);
      if (!response.ok) { setLoading(false); return; }
      const data = await response.json();
      setDashboardData(prev => ({ ...prev, ...data }));
    } catch (error) {
      console.error('取得儀表板資料失敗:', error);
    } finally {
      setLoading(false);
    }
  }

  async function fetchExecutiveData(refresh = false) {
    try {
      const url = refresh ? '/api/dashboard/executive?refresh=true' : '/api/dashboard/executive';
      const response = await fetch(url);
      if (response.ok) setExecutiveData(await response.json());
    } catch (error) {
      console.error('取得決策儀表板資料失敗:', error);
    }
  }

  async function handleRefreshAll() {
    setLoading(true);
    await Promise.all([
      fetchDashboardData(true),
      fetchExecutiveData(true),
      fetch('/api/dashboard/summary?refresh=true').then(r => r.ok ? r.json() : null).then(d => { if (d) setSummary(d); }),
      fetchNotifications(true),
      fetchLatestReport(),
      fetchPlData(),
      fetchActionQueue(),
    ]);
  }

  async function fetchLatestReport() {
    try {
      const now = new Date();
      const month = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
      const response = await fetch(`/api/analytics/business-report?month=${month}`);
      if (response.ok) {
        const data = await response.json();
        setLatestReport(data.report || data.generated);
      }
    } catch (error) {
      console.error('取得月度報告失敗:', error);
    }
  }

  async function fetchPlData() {
    setPlLoading(true);
    try {
      const d = new Date();
      const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const res = await fetch(`/api/reports/profit-loss?yearMonth=${ym}`);
      if (res.ok) setPlData(await res.json());
    } catch (e) { console.warn('[homepage] P&L fetch failed:', e.message); }
    setPlLoading(false);
  }

  const kpis = dashboardData.kpis || {};
  const totalCashBalance = kpis.totalCashBalance ?? 0;
  const pendingPayments = kpis.pendingPayments ?? 0;

  const now = new Date();
  const dateStr = `${now.getFullYear()} 年 ${now.getMonth() + 1} 月 ${now.getDate()} 日`;

  // 依角色過濾通知：admin/manager 看全部，其他角色只看相關項目
  const userPerms = session?.user?.permissions || [];
  const isAdminOrManager = session?.user?.role === 'admin' || userPerms.includes('*') || (session?.user?.roles || []).some(r => ['admin', 'manager'].includes(r));

  const NTF_PERM_MAP = {
    N01: ['pms.view'],
    N02: ['loan.view'],
    N03: ['check.view'],
    N04: ['check.view', 'cashier.view', 'finance.view'],
    N05: ['cashier.view', 'finance.view'],
    N06: ['finance.view', 'cashier.view'],
    N07: ['loan.view', 'finance.view'],
    N08: ['expense.view'],
    N09: ['inventory.view'],
    N10: ['monthend.view', 'finance.view'],
    N11: ['pms.view'],
    N12: ['reconciliation.view', 'cashier.view'],
    N13: ['cashflow.view', 'cashier.view'],
    N14: [], // admin only — shown separately
    N15: ['rental.view'],
    N16: ['engineering.view'],
    N17: ['engineering.view'],
  };

  const visibleNotifications = isAdminOrManager
    ? ntfNotifications
    : ntfNotifications.filter(n => {
        if (n.code === 'N14') return false; // admin-only
        const required = NTF_PERM_MAP[n.code];
        if (!required) return true;
        return required.some(p => userPerms.includes(p));
      });

  const cashierPendingCount = ntfNotifications.find(n => n.code === 'N05')?.count ?? pendingPayments;
  const checksPendingCount = (ntfNotifications.find(n => n.code === 'N03')?.count ?? 0) + (ntfNotifications.find(n => n.code === 'N04')?.count ?? 0);

  // ---------- Public (read-only) view ----------
  const renderPublicView = () => {
    if (summaryLoading) {
      return (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-white rounded-xl shadow-sm p-5 h-28 animate-pulse">
              <div className="h-3 bg-gray-200 rounded w-1/2 mb-3"></div>
              <div className="h-7 bg-gray-200 rounded w-3/4"></div>
            </div>
          ))}
        </div>
      );
    }
    if (!summary) {
      return (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center space-y-3">
          <p className="text-gray-500 text-sm">資料載入失敗，請重新整理頁面。</p>
          <button
            onClick={() => window.location.reload()}
            className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            重新整理
          </button>
        </div>
      );
    }

    const sk = summary.kpis || {};
    const sa = summary.alerts || {};
    const purchase = sk.thisMonthPurchase || 0;
    const sales = sk.thisMonthSales || 0;
    const expense = sk.thisMonthExpense || 0;
    const pms = sk.pmsIncome || 0;
    const cash = sk.totalCashBalance || 0;
    const barMax = Math.max(purchase, sales, expense, pms, 1);
    const totalAlerts = (sa.overdueChecks || 0) + (sa.expiringLoans || 0) + (sa.pendingPayments || 0) + (sa.lowInventoryCount || 0);

    return (
      <>
        {/* Login banner */}
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🔒</span>
            <div>
              <p className="text-sm font-medium text-blue-800">目前為唯讀模式</p>
              <p className="text-xs text-blue-600">登入後可檢視完整資料、操作及管理功能</p>
            </div>
          </div>
          <Link href="/login" className="bg-blue-600 text-white px-5 py-2 rounded-lg hover:bg-blue-700 text-sm font-medium whitespace-nowrap">
            前往登入
          </Link>
        </div>

        {/* KPI row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <KpiCard
            label="本月進貨金額"
            value={NT(purchase)}
            sub={`${sk.purchaseCount || 0} 筆`}
            icon="📦"
            borderClass="border-l-4 border-l-blue-400"
          />
          <KpiCard
            label="本月銷貨金額"
            value={NT(sales)}
            sub={`${sk.salesCount || 0} 筆`}
            icon="🧾"
            borderClass="border-l-4 border-l-indigo-400"
          />
          <KpiCard
            label="現金餘額合計"
            value={NT(cash)}
            sub={`${summary.cashAccounts?.length || 0} 個帳戶`}
            icon="💰"
            colorClass="text-emerald-700"
            borderClass="border-l-4 border-l-emerald-400"
          />
          <KpiCard
            label="PMS 營業收入"
            value={NT(pms)}
            sub={`${sk.pmsIncomeCount || 0} 筆`}
            icon="🏨"
            colorClass="text-teal-700"
            borderClass="border-l-4 border-l-teal-400"
          />
        </div>

        {/* Financial overview + Alerts side by side */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          {/* Financial bar chart */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
            <h2 className="text-base font-semibold text-gray-800 mb-4">本月財務概況（{summary.month}）</h2>
            <div className="space-y-4">
              <MiniBar label="進貨" value={purchase} max={barMax} color="bg-blue-500" />
              <MiniBar label="銷貨" value={sales} max={barMax} color="bg-indigo-500" />
              <MiniBar label="費用" value={expense} max={barMax} color="bg-amber-500" />
              <MiniBar label="PMS" value={pms} max={barMax} color="bg-teal-500" />
            </div>
            {summary.cashAccounts?.length > 0 && (
              <div className="mt-5 pt-4 border-t border-gray-100 space-y-1.5">
                <p className="text-xs text-gray-400 font-medium mb-2">現金帳戶餘額</p>
                {summary.cashAccounts.slice(0, 5).map((acc, i) => (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <span className="text-gray-600 truncate max-w-[160px]">
                      {acc.warehouse ? `[${acc.warehouse}] ` : ''}{acc.name}
                    </span>
                    <span className={`font-medium ${acc.balance < 0 ? 'text-red-600' : 'text-gray-800'}`}>
                      {NT(acc.balance)}
                    </span>
                  </div>
                ))}
                {summary.cashAccounts.length > 5 && (
                  <p className="text-xs text-gray-400">…還有 {summary.cashAccounts.length - 5} 個帳戶</p>
                )}
              </div>
            )}
          </div>

          {/* Alerts summary */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-gray-800">待處理事項</h2>
              {totalAlerts > 0 && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-medium">
                  {totalAlerts} 項
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className={`flex items-center gap-3 p-3 rounded-lg ${
                sa.pendingPayments > 0 ? 'bg-orange-50 border border-orange-200' : 'bg-gray-50'
              }`}>
                <span className="text-2xl">💳</span>
                <div>
                  <p className={`text-lg font-bold ${sa.pendingPayments > 0 ? 'text-orange-600' : 'text-gray-300'}`}>{sa.pendingPayments || 0}</p>
                  <p className="text-xs text-gray-500">待付款單</p>
                </div>
              </div>
              <div className={`flex items-center gap-3 p-3 rounded-lg ${
                sa.overdueChecks > 0 ? 'bg-red-50 border border-red-200' : 'bg-gray-50'
              }`}>
                <span className="text-2xl">📋</span>
                <div>
                  <p className={`text-lg font-bold ${sa.overdueChecks > 0 ? 'text-red-600' : 'text-gray-300'}`}>{sa.overdueChecks || 0}</p>
                  <p className="text-xs text-gray-500">逾期支票</p>
                </div>
              </div>
              <div className={`flex items-center gap-3 p-3 rounded-lg ${
                sa.expiringLoans > 0 ? 'bg-purple-50 border border-purple-200' : 'bg-gray-50'
              }`}>
                <span className="text-2xl">🏦</span>
                <div>
                  <p className={`text-lg font-bold ${sa.expiringLoans > 0 ? 'text-purple-600' : 'text-gray-300'}`}>{sa.expiringLoans || 0}</p>
                  <p className="text-xs text-gray-500">即將到期貸款</p>
                </div>
              </div>
              <div className={`flex items-center gap-3 p-3 rounded-lg ${
                sa.lowInventoryCount > 0 ? 'bg-amber-50 border border-amber-200' : 'bg-gray-50'
              }`}>
                <span className="text-2xl">⚠️</span>
                <div>
                  <p className={`text-lg font-bold ${sa.lowInventoryCount > 0 ? 'text-amber-600' : 'text-gray-300'}`}>{sa.lowInventoryCount || 0}</p>
                  <p className="text-xs text-gray-500">庫存警示</p>
                </div>
              </div>
            </div>
            {summary.utilityBillCount > 0 && (
              <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between">
                <span className="text-xs text-gray-500">水電費帳單紀錄</span>
                <span className="text-sm font-medium text-teal-700">{summary.utilityBillCount} 筆</span>
              </div>
            )}
            <div className="mt-4 pt-3 border-t border-gray-100">
              <p className="text-xs text-gray-400 text-center">登入後可查看詳細資料與處理待辦事項</p>
            </div>
          </div>
        </div>
      </>
    );
  };

  return (
    <div className="min-h-screen page-bg-dashboard">
      <Navigation borderColor="border-blue-500" />
      {isLoggedIn && <OnboardingTour />}

      <main className="max-w-7xl mx-auto px-4 py-6">

        {/* Page header */}
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

        {/* Loading skeleton */}
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

        {/* Public read-only view (not logged in) */}
        {status === 'unauthenticated' && renderPublicView()}

        {/* Full authenticated view */}
        {isLoggedIn && (
          <>
            {/* Row 1: Core KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              <KpiCard
                label="本月進貨金額"
                value={loading ? '—' : NT(kpis.thisMonthPurchase)}
                sub={`費用 ${NT(kpis.thisMonthExpense)}`}
                icon="📦"
                borderClass="border-l-4 border-l-blue-400"
              />
              <KpiCard
                label="本月銷貨金額"
                value={loading ? '—' : NT(kpis.thisMonthSales)}
                sub={`毛利率 ${kpis.grossProfitMargin || 0}%`}
                icon="🧾"
                borderClass="border-l-4 border-l-indigo-400"
              />
              <KpiCard
                label="本月毛利"
                value={loading ? '—' : NT(kpis.grossProfit)}
                icon="📈"
                colorClass={(kpis.grossProfit || 0) >= 0 ? 'text-green-700' : 'text-red-600'}
                borderClass="border-l-4 border-l-green-400"
              />
              <KpiCard
                label="現金餘額合計"
                value={loading ? '—' : NT(totalCashBalance)}
                sub={`${dashboardData.cashAccounts?.length || 0} 個帳戶`}
                icon="💰"
                colorClass="text-emerald-700"
                borderClass="border-l-4 border-l-emerald-400"
              />
            </div>

            {/* Row 2: Alert KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <KpiCard
                label="庫存警示"
                value={loading ? '—' : `${kpis.lowInventoryCount || 0} 項`}
                sub={<Link href="/inventory" className="text-blue-600 hover:underline">查看詳情 →</Link>}
                icon="⚠️"
                colorClass={(kpis.lowInventoryCount || 0) > 0 ? 'text-red-600' : 'text-gray-400'}
                borderClass="border-l-4 border-l-red-400"
              />
              <KpiCard
                label="待付款單"
                value={loading ? '—' : `${pendingPayments} 筆`}
                sub={<Link href="/finance" className="text-blue-600 hover:underline">前往處理 →</Link>}
                icon="💳"
                colorClass={pendingPayments > 0 ? 'text-orange-600' : 'text-gray-400'}
                borderClass="border-l-4 border-l-orange-400"
              />
              <KpiCard
                label="逾期支票"
                value={loading ? '—' : `${dashboardData.riskAlerts?.overdueChecks || 0} 張`}
                sub={<Link href="/checks" className="text-blue-600 hover:underline">前往處理 →</Link>}
                icon="📋"
                colorClass={(dashboardData.riskAlerts?.overdueChecks || 0) > 0 ? 'text-yellow-700' : 'text-gray-400'}
                borderClass="border-l-4 border-l-yellow-400"
              />
              <KpiCard
                label="7 天內到期支票"
                value={loading ? '—' : `${dashboardData.riskAlerts?.checksDueSoon || 0} 張`}
                sub={<Link href="/checks" className="text-blue-600 hover:underline">查看支票 →</Link>}
                icon="⏰"
                colorClass={(dashboardData.riskAlerts?.checksDueSoon || 0) > 0 ? 'text-orange-600' : 'text-gray-400'}
                borderClass={(dashboardData.riskAlerts?.checksDueSoon || 0) > 0 ? 'border-l-4 border-l-orange-400' : 'border-l-4 border-l-gray-200'}
              />
              <KpiCard
                label="即將到期貸款"
                value={loading ? '—' : `${dashboardData.riskAlerts?.expiringLoans || 0} 筆`}
                sub={<Link href="/loans" className="text-blue-600 hover:underline">查看詳情 →</Link>}
                icon="🏦"
                colorClass={(dashboardData.riskAlerts?.expiringLoans || 0) > 0 ? 'text-purple-700' : 'text-gray-400'}
                borderClass="border-l-4 border-l-purple-400"
              />
            </div>

            {/* P&L Summary */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 mb-6 overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 bg-gray-50">
                <h2 className="text-sm font-semibold text-gray-700">本月損益摘要（現金流科目）</h2>
                <Link href="/reports/profit-loss" className="text-xs text-blue-600 hover:underline">完整損益表 →</Link>
              </div>
              {plLoading ? (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4">
                  {[...Array(4)].map((_, i) => <div key={i} className="h-14 bg-gray-100 rounded-lg animate-pulse" />)}
                </div>
              ) : plData?.summary ? (
                <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-y md:divide-y-0 divide-gray-100">
                  {[
                    { label: '營業收入', val: plData.summary.totalIncome, color: 'text-blue-700' },
                    { label: '毛利', val: plData.summary.grossProfit, color: 'text-teal-700', pct: plData.summary.totalIncome ? ((plData.summary.grossProfit / plData.summary.totalIncome) * 100).toFixed(1) + '%' : null },
                    { label: '營業淨利', val: plData.summary.operatingIncome, color: 'text-green-700', pct: plData.summary.totalIncome ? ((plData.summary.operatingIncome / plData.summary.totalIncome) * 100).toFixed(1) + '%' : null },
                    { label: '稅前淨利', val: plData.summary.netIncome, color: (plData.summary.netIncome || 0) >= 0 ? 'text-green-700' : 'text-red-600', pct: plData.summary.totalIncome ? ((plData.summary.netIncome / plData.summary.totalIncome) * 100).toFixed(1) + '%' : null },
                  ].map(({ label, val, color, pct }) => (
                    <div key={label} className="px-5 py-4">
                      <p className="text-xs text-gray-500 mb-1">{label}</p>
                      <p className={`text-lg font-bold tabular-nums ${color}`}>{NT(val)}</p>
                      {pct && <p className="text-xs text-gray-400 mt-0.5">{pct}</p>}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="px-5 py-4 text-xs text-gray-400">本月無損益資料，請先設定現金流科目</p>
              )}
            </div>

            {/* 我的待辦佇列（角色專屬動作清單）*/}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 mb-6 overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 bg-gray-50">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-semibold text-gray-700">我的待辦佇列</h2>
                  {aqData?.items?.length > 0 && (
                    <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium text-white ${
                      aqData.items.some(i => i.urgency === 'urgent') ? 'bg-red-500'
                      : aqData.items.some(i => i.urgency === 'high') ? 'bg-orange-500'
                      : 'bg-amber-500'
                    }`}>{aqData.items.length}</span>
                  )}
                </div>
                <button
                  onClick={fetchActionQueue}
                  disabled={aqLoading}
                  className="text-xs text-gray-400 hover:text-gray-600 disabled:opacity-50"
                  title="重新整理待辦佇列"
                >↺</button>
              </div>

              {aqLoading ? (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-4">
                  {[...Array(4)].map((_, i) => (
                    <div key={i} className="h-16 bg-gray-100 rounded-lg animate-pulse" />
                  ))}
                </div>
              ) : aqData?.items?.length > 0 ? (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 p-4">
                  {aqData.items.map(item => (
                    <Link
                      key={item.key}
                      href={item.href}
                      className={`group flex flex-col gap-1.5 p-3 rounded-xl border transition-all hover:shadow-sm ${
                        item.urgency === 'urgent' ? 'bg-red-50 border-red-200 hover:border-red-400'
                        : item.urgency === 'high' ? 'bg-orange-50 border-orange-200 hover:border-orange-400'
                        : 'bg-gray-50 border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                          item.urgency === 'urgent' ? 'bg-red-100 text-red-700'
                          : item.urgency === 'high' ? 'bg-orange-100 text-orange-700'
                          : 'bg-gray-200 text-gray-600'
                        }`}>{item.category}</span>
                        <span className="text-xs text-gray-400 group-hover:text-gray-600">→</span>
                      </div>
                      <p className={`text-xs font-medium leading-snug ${
                        item.urgency === 'urgent' ? 'text-red-800'
                        : item.urgency === 'high' ? 'text-orange-800'
                        : 'text-gray-700'
                      }`}>{item.label}</p>
                      <p className={`text-xl font-bold tabular-nums leading-none ${
                        item.urgency === 'urgent' ? 'text-red-600'
                        : item.urgency === 'high' ? 'text-orange-600'
                        : 'text-gray-500'
                      }`}>{item.count}</p>
                      {item.detail && (
                        <p className="text-xs text-gray-400 truncate">{item.detail}</p>
                      )}
                    </Link>
                  ))}
                </div>
              ) : aqData ? (
                <div className="flex items-center justify-center gap-2 py-5 text-green-600">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="text-sm font-medium">目前無待辦事項</span>
                </div>
              ) : aqError ? (
                <div className="p-4">
                  <FetchErrorBanner message={aqError} onRetry={fetchActionQueue} />
                </div>
              ) : (
                <div className="px-5 py-4 text-xs text-gray-400 text-center">載入中…</div>
              )}
            </div>

            {/* Row 3: 本日待辦 + 財務概況 */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              {/* 今日待辦 */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-semibold text-gray-800">今天要做什麼</h2>
                    {!ntfLoading && !ntfError && visibleNotifications.length > 0 && (
                      <span className={`text-xs px-2 py-0.5 rounded-full text-white font-medium ${
                        visibleNotifications.some(n => n.level === 'critical') ? 'bg-red-500'
                        : visibleNotifications.some(n => n.level === 'urgent') ? 'bg-orange-500'
                        : 'bg-amber-500'
                      }`}>
                        {visibleNotifications.reduce((s, n) => s + n.count, 0)}
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => fetchNotifications(true)}
                    className="text-xs text-gray-400 hover:text-gray-600"
                    title="重新整理"
                  >↺</button>
                </div>

                {/* 出納工作台：待執行付款單 + 待兌現支票並列 */}
                {!loading && (cashierPendingCount > 0 || checksPendingCount > 0) && (
                  <div className="mb-3 p-3 bg-violet-50 border border-violet-200 rounded-xl">
                    <p className="text-xs font-semibold text-violet-700 mb-2">出納工作台</p>
                    <div className="grid grid-cols-2 gap-2">
                      <Link href="/cashier" className={`flex items-center gap-2.5 p-2 rounded-lg transition-colors ${cashierPendingCount > 0 ? 'bg-orange-50 border border-orange-200 hover:bg-orange-100' : 'bg-white border border-gray-100'}`}>
                        <span className="text-lg">💳</span>
                        <div>
                          <p className={`text-base font-bold leading-none ${cashierPendingCount > 0 ? 'text-orange-600' : 'text-gray-300'}`}>{cashierPendingCount} 筆</p>
                          <p className="text-xs text-gray-500 mt-0.5">待執行付款單</p>
                        </div>
                      </Link>
                      <Link href="/checks" className={`flex items-center gap-2.5 p-2 rounded-lg transition-colors ${checksPendingCount > 0 ? 'bg-amber-50 border border-amber-200 hover:bg-amber-100' : 'bg-white border border-gray-100'}`}>
                        <span className="text-lg">📋</span>
                        <div>
                          <p className={`text-base font-bold leading-none ${checksPendingCount > 0 ? 'text-amber-600' : 'text-gray-300'}`}>{checksPendingCount} 張</p>
                          <p className="text-xs text-gray-500 mt-0.5">待兌現支票</p>
                        </div>
                      </Link>
                    </div>
                  </div>
                )}

                {ntfLoading ? (
                  <div className="flex items-center justify-center py-6">
                    <svg className="animate-spin h-5 w-5 text-gray-300" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                  </div>
                ) : ntfError ? (
                  <div className="flex flex-col items-center gap-2 py-6 text-center">
                    <p className="text-sm text-red-500">待辦事項載入失敗</p>
                    <button
                      onClick={() => fetchNotifications(true)}
                      className="text-xs px-3 py-1.5 bg-red-50 text-red-700 border border-red-200 rounded-lg hover:bg-red-100"
                    >
                      重試
                    </button>
                  </div>
                ) : visibleNotifications.length === 0 ? (
                  <div className="flex items-center justify-center gap-2 py-6 text-green-600">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span className="text-sm font-medium">今日無待辦，一切順利！</span>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                    {/* Critical */}
                    {visibleNotifications.filter(n => n.level === 'critical').map(n => (
                      <div key={n.code} className="flex items-center gap-3 p-2.5 rounded-lg bg-red-50 border-l-4 border-red-500">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-red-800">{n.title} <span className="font-normal opacity-75">({n.count})</span></p>
                          <p className="text-xs text-red-600 mt-0.5 truncate">{n.message}</p>
                        </div>
                        <Link href={n.targetUrl} className="shrink-0 text-xs px-2.5 py-1 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium whitespace-nowrap">
                          前往處理
                        </Link>
                      </div>
                    ))}
                    {/* Urgent */}
                    {visibleNotifications.filter(n => n.level === 'urgent').map(n => (
                      <div key={n.code} className="flex items-center gap-3 p-2.5 rounded-lg bg-orange-50 border-l-4 border-orange-500">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-orange-800">{n.title} <span className="font-normal opacity-75">({n.count})</span></p>
                          <p className="text-xs text-orange-600 mt-0.5 truncate">{n.message}</p>
                        </div>
                        <Link href={n.targetUrl} className="shrink-0 text-xs px-2.5 py-1 bg-orange-500 text-white rounded-lg hover:bg-orange-600 font-medium whitespace-nowrap">
                          前往處理
                        </Link>
                      </div>
                    ))}
                    {/* Warning — collapsible */}
                    {visibleNotifications.filter(n => n.level === 'warning').length > 0 && (
                      <>
                        <button
                          onClick={() => setNtfWarningExpanded(!ntfWarningExpanded)}
                          className="flex items-center gap-2 w-full px-2 py-1.5 rounded-lg hover:bg-amber-50 transition-colors text-left"
                        >
                          <span className="text-xs text-amber-700 font-medium">
                            注意事項 ({visibleNotifications.filter(n => n.level === 'warning').reduce((s, n) => s + n.count, 0)} 筆)
                          </span>
                          <svg className={`w-3.5 h-3.5 text-amber-500 transition-transform ${ntfWarningExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>
                        {ntfWarningExpanded && visibleNotifications.filter(n => n.level === 'warning').map(n => (
                          <div key={n.code} className="flex items-center gap-3 p-2.5 rounded-lg bg-amber-50 border-l-4 border-amber-400 ml-2">
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-semibold text-amber-800">{n.title} <span className="font-normal opacity-75">({n.count})</span></p>
                              <p className="text-xs text-amber-700 mt-0.5 truncate">{n.message}</p>
                            </div>
                            <Link href={n.targetUrl} className="shrink-0 text-xs px-2.5 py-1 bg-amber-100 text-amber-800 border border-amber-300 rounded-lg hover:bg-amber-200 font-medium whitespace-nowrap">
                              查看
                            </Link>
                          </div>
                        ))}
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* 本月財務概況 */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
                <h2 className="text-base font-semibold text-gray-800 mb-4">本月財務概況</h2>
                {loading ? (
                  <div className="space-y-4 pt-2">
                    {[...Array(3)].map((_, i) => (
                      <div key={i} className="h-4 bg-gray-100 rounded animate-pulse"></div>
                    ))}
                  </div>
                ) : (
                  <div className="space-y-4 pt-1">
                    {(() => {
                      const purchase = kpis.thisMonthPurchase || 0;
                      const sales = kpis.thisMonthSales || 0;
                      const expense = kpis.thisMonthExpense || 0;
                      const max = Math.max(purchase, sales, expense, 1);
                      return (
                        <>
                          <MiniBar label="進貨" value={purchase} max={max} color="bg-blue-500" />
                          <MiniBar label="銷貨" value={sales} max={max} color="bg-indigo-500" />
                          <MiniBar label="費用" value={expense} max={max} color="bg-amber-500" />
                        </>
                      );
                    })()}
                    <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between">
                      <span className="text-xs text-gray-500">本月毛利</span>
                      <span className={`text-sm font-bold ${(kpis.grossProfit || 0) >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                        {NT(kpis.grossProfit)} ({kpis.grossProfitMargin || 0}%)
                      </span>
                    </div>
                    {dashboardData.cashAccounts?.length > 0 && (
                      <div className="pt-2 space-y-1.5">
                        <p className="text-xs text-gray-400 font-medium mb-2">現金帳戶</p>
                        {dashboardData.cashAccounts.slice(0, 4).map(acc => (
                          <div key={acc.id} className="flex items-center justify-between text-xs">
                            <span className="text-gray-600 truncate max-w-[120px]">{acc.name}</span>
                            <span className={`font-medium ${acc.currentBalance < 0 ? 'text-red-600' : 'text-gray-800'}`}>
                              {NT(acc.currentBalance)}
                            </span>
                          </div>
                        ))}
                        {dashboardData.cashAccounts.length > 4 && (
                          <p className="text-xs text-gray-400">…還有 {dashboardData.cashAccounts.length - 4} 個帳戶</p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Row 4: 決策建議 + 月度報告 */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-base font-semibold text-gray-800">決策建議</h2>
                  <Link href="/analytics" className="text-xs text-blue-600 hover:underline">完整分析 →</Link>
                </div>
                {executiveData?.riskAlerts?.length > 0 && (
                  <div className="mb-3 space-y-1.5">
                    {executiveData.riskAlerts.slice(0, 3).map((alert, i) => (
                      <div key={i} className={`px-3 py-2 rounded-lg text-xs flex items-start gap-2 ${
                        alert.severity === 'high' ? 'bg-red-50 text-red-800' :
                        alert.severity === 'medium' ? 'bg-amber-50 text-amber-800' :
                        'bg-blue-50 text-blue-800'
                      }`}>
                        <span>{alert.severity === 'high' ? '🔴' : alert.severity === 'medium' ? '🟠' : '🟡'}</span>
                        <div>
                          <span className="font-medium">{alert.message}</span>
                          {alert.action && <span className="ml-1 opacity-75">— {alert.action}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {executiveData?.recommendations?.length > 0 ? (
                  <div className="space-y-2 max-h-44 overflow-y-auto">
                    {executiveData.recommendations.map((rec, i) => (
                      <div key={i} className={`p-2.5 rounded-lg border-l-4 ${
                        rec.priority === 1 ? 'bg-red-50 border-red-400' :
                        rec.priority === 2 ? 'bg-amber-50 border-amber-400' :
                        'bg-blue-50 border-blue-400'
                      }`}>
                        <p className={`text-xs font-medium ${
                          rec.priority === 1 ? 'text-red-800' :
                          rec.priority === 2 ? 'text-amber-800' : 'text-blue-800'
                        }`}>{rec.priority}. {rec.action}</p>
                        <p className={`text-xs mt-0.5 ${
                          rec.priority === 1 ? 'text-red-600' :
                          rec.priority === 2 ? 'text-amber-600' : 'text-blue-600'
                        }`}>{rec.description}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex items-center justify-center gap-2 py-6 text-green-600">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span className="text-sm text-gray-600">暫無風險警示，運營狀況良好</span>
                  </div>
                )}
              </div>

              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-base font-semibold text-gray-800">
                    月度經營報告
                    {latestReport && (
                      <span className="ml-2 text-xs font-normal text-gray-400">
                        {latestReport.reportYear}年{latestReport.reportMonth}月
                      </span>
                    )}
                  </h2>
                  <Link href="/analytics?tab=business-report" className="text-xs text-blue-600 hover:underline">完整報告 →</Link>
                </div>
                {latestReport ? (
                  <>
                    <div className="grid grid-cols-2 gap-3 mb-3">
                      <div className="text-center p-3 bg-gray-50 rounded-lg">
                        <p className="text-xs text-gray-500">銷貨額</p>
                        <p className="text-sm font-bold text-gray-800 mt-1">{NT(latestReport.profitAnalysis?.totalSales)}</p>
                      </div>
                      <div className="text-center p-3 bg-gray-50 rounded-lg">
                        <p className="text-xs text-gray-500">毛利率</p>
                        <p className={`text-sm font-bold mt-1 ${(latestReport.profitAnalysis?.grossMargin || 0) >= 36 ? 'text-green-700' : 'text-amber-600'}`}>
                          {latestReport.profitAnalysis?.grossMargin || 0}%
                        </p>
                        <p className="text-xs text-gray-400">目標 36%</p>
                      </div>
                      <div className="text-center p-3 bg-gray-50 rounded-lg">
                        <p className="text-xs text-gray-500">現金餘額</p>
                        <p className="text-sm font-bold text-gray-800 mt-1">{NT(latestReport.cashFlowAnalysis?.currentBalance)}</p>
                      </div>
                      <div className="text-center p-3 bg-gray-50 rounded-lg">
                        <p className="text-xs text-gray-500">廠商集中度</p>
                        <p className={`text-sm font-bold mt-1 ${(latestReport.riskAnalysis?.supplierConcentration?.top1Percentage || 0) > 20 ? 'text-red-600' : 'text-green-700'}`}>
                          {latestReport.riskAnalysis?.supplierConcentration?.top1Percentage || 0}%
                        </p>
                        <p className="text-xs text-gray-400">門檻 20%</p>
                      </div>
                    </div>
                    {latestReport.executiveSummary && (
                      <p className="text-xs text-gray-500 leading-relaxed border-t border-gray-100 pt-3">
                        {latestReport.executiveSummary.length > 180
                          ? latestReport.executiveSummary.substring(0, 180) + '...'
                          : latestReport.executiveSummary}
                      </p>
                    )}
                    <div className="mt-2 flex items-center gap-2">
                      <span className={`text-xs px-2 py-0.5 rounded ${
                        latestReport.status === 'approved' ? 'bg-green-100 text-green-700' :
                        latestReport.status === 'preview' ? 'bg-blue-100 text-blue-700' :
                        'bg-gray-100 text-gray-600'
                      }`}>
                        {latestReport.status === 'approved' ? '已簽核' : latestReport.status === 'preview' ? '即時預覽' : '草稿'}
                      </span>
                    </div>
                  </>
                ) : (
                  <div className="flex items-center justify-center py-8 text-gray-400 text-sm">
                    本月報告尚未生成
                  </div>
                )}
              </div>
            </div>

            {/* Row 5: 最近交易 */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 mb-6">
              <h2 className="text-base font-semibold text-gray-800 mb-4">最近交易</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 z-10 bg-white">
                    <tr className="border-b border-gray-100">
                      <th className="pb-2 text-left text-xs font-medium text-gray-500">時間</th>
                      <th className="pb-2 text-left text-xs font-medium text-gray-500">類型</th>
                      <th className="pb-2 text-left text-xs font-medium text-gray-500">單號</th>
                      <th className="pb-2 text-right text-xs font-medium text-gray-500">金額</th>
                      <th className="pb-2 text-left text-xs font-medium text-gray-500 pl-4">狀態</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {loading ? (
                      <tr><td colSpan="5" className="py-8 text-center text-gray-400 text-xs">載入中...</td></tr>
                    ) : dashboardData.recentTransactions.length === 0 ? (
                      <tr><td colSpan="5" className="py-8 text-center text-gray-400 text-xs">尚無交易資料</td></tr>
                    ) : (
                      dashboardData.recentTransactions.map((t, index) => (
                        <tr key={index} className="hover:bg-gray-50 transition-colors">
                          <td className="py-2.5 text-xs text-gray-500">{t.date}</td>
                          <td className="py-2.5">
                            <span className={`text-xs px-2 py-0.5 rounded-full ${
                              t.type === '進貨' ? 'bg-blue-50 text-blue-700' :
                              t.type === '銷貨' ? 'bg-green-50 text-green-700' :
                              'bg-amber-50 text-amber-700'
                            }`}>{t.type}</span>
                          </td>
                          <td className="py-2.5 text-xs text-gray-600 font-mono">{t.no}</td>
                          <td className="py-2.5 text-xs text-right font-medium text-gray-800">{NT(t.amount)}</td>
                          <td className="py-2.5 pl-4">
                            <span className={`text-xs ${
                              t.status === '已完成' || t.status === '已出貨' || t.status === '已確認'
                                ? 'text-green-600' : t.status ? 'text-amber-600' : 'text-gray-400'
                            }`}>{t.status || '—'}</span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Quick links */}
            <div className="flex gap-3 flex-wrap">
              <Link href="/sales" className="bg-white border border-gray-200 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-50 text-sm inline-flex items-center gap-1.5">
                <span>🧾</span> 新增發票
              </Link>
              <Link href="/inventory" className="bg-white border border-gray-200 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-50 text-sm inline-flex items-center gap-1.5">
                <span>📦</span> 查詢庫存
              </Link>
              <Link href="/cashflow" className="bg-white border border-gray-200 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-50 text-sm inline-flex items-center gap-1.5">
                <span>💸</span> 現金流
              </Link>
              <Link href="/utility-bills" className="bg-white border border-gray-200 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-50 text-sm inline-flex items-center gap-1.5">
                <span>⚡</span> 水電費
              </Link>
              <Link href="/pms-income" className="bg-white border border-gray-200 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-50 text-sm inline-flex items-center gap-1.5">
                <span>🏨</span> PMS收入
              </Link>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
