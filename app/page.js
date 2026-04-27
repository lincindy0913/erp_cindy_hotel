'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import Navigation from '@/components/Navigation';

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
  const [ntfWarningExpanded, setNtfWarningExpanded] = useState(false);

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
      }
    } catch (err) {
      console.error('Failed to fetch notifications:', err);
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
  }, [isLoggedIn, fetchNotifications]);

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

  const kpis = dashboardData.kpis || {};
  const totalCashBalance = kpis.totalCashBalance ?? 0;
  const pendingPayments = kpis.pendingPayments ?? 0;

  const now = new Date();
  const dateStr = `${now.getFullYear()} 年 ${now.getMonth() + 1} 月 ${now.getDate()} 日`;

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
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
          <p className="text-gray-400 text-sm">無法取得資料，請稍後再試</p>
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
                sub={<a href="/inventory" className="text-blue-600 hover:underline">查看詳情 →</a>}
                icon="⚠️"
                colorClass={(kpis.lowInventoryCount || 0) > 0 ? 'text-red-600' : 'text-gray-400'}
                borderClass="border-l-4 border-l-red-400"
              />
              <KpiCard
                label="待付款單"
                value={loading ? '—' : `${pendingPayments} 筆`}
                sub={<a href="/finance" className="text-blue-600 hover:underline">前往處理 →</a>}
                icon="💳"
                colorClass={pendingPayments > 0 ? 'text-orange-600' : 'text-gray-400'}
                borderClass="border-l-4 border-l-orange-400"
              />
              <KpiCard
                label="逾期支票"
                value={loading ? '—' : `${dashboardData.riskAlerts?.overdueChecks || 0} 張`}
                sub={<a href="/checks" className="text-blue-600 hover:underline">前往處理 →</a>}
                icon="📋"
                colorClass={(dashboardData.riskAlerts?.overdueChecks || 0) > 0 ? 'text-yellow-700' : 'text-gray-400'}
                borderClass="border-l-4 border-l-yellow-400"
              />
              <KpiCard
                label="即將到期貸款"
                value={loading ? '—' : `${dashboardData.riskAlerts?.expiringLoans || 0} 筆`}
                sub={<a href="/loans" className="text-blue-600 hover:underline">查看詳情 →</a>}
                icon="🏦"
                colorClass={(dashboardData.riskAlerts?.expiringLoans || 0) > 0 ? 'text-purple-700' : 'text-gray-400'}
                borderClass="border-l-4 border-l-purple-400"
              />
            </div>

            {/* Row 3: 本日待辦 + 財務概況 */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              {/* 本日待辦 */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-semibold text-gray-800">本日待辦</h2>
                    {!ntfLoading && ntfSummary.total > 0 && (
                      <span className={`text-xs px-2 py-0.5 rounded-full text-white ${
                        ntfSummary.critical > 0 ? 'bg-red-500' : ntfSummary.urgent > 0 ? 'bg-orange-500' : 'bg-amber-500'
                      }`}>
                        {ntfSummary.total}
                      </span>
                    )}
                  </div>
                  <Link href="/notifications" className="text-xs text-blue-600 hover:underline">查看全部 →</Link>
                </div>

                {ntfLoading ? (
                  <div className="flex items-center justify-center py-6">
                    <svg className="animate-spin h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                  </div>
                ) : ntfNotifications.length === 0 ? (
                  <div className="flex items-center justify-center gap-2 py-6 text-green-600">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span className="text-sm font-medium">今日無待辦事項，一切順利！</span>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-56 overflow-y-auto">
                    {ntfNotifications.filter(n => n.level === 'critical').map(n => (
                      <div key={n.code} className="flex items-center justify-between p-2.5 rounded-lg bg-red-50 border-l-4 border-red-500">
                        <div>
                          <span className="text-xs font-medium text-red-800">{n.title}</span>
                          <span className="text-xs text-red-600 ml-1">({n.count})</span>
                          <p className="text-xs text-red-600 mt-0.5">{n.message}</p>
                        </div>
                        <Link href={n.targetUrl} className="text-xs text-red-700 font-medium ml-2 whitespace-nowrap">→</Link>
                      </div>
                    ))}
                    {ntfNotifications.filter(n => n.level === 'urgent').map(n => (
                      <div key={n.code} className="flex items-center justify-between p-2.5 rounded-lg bg-orange-50 border-l-4 border-orange-500">
                        <div>
                          <span className="text-xs font-medium text-orange-800">{n.title}</span>
                          <span className="text-xs text-orange-600 ml-1">({n.count})</span>
                          <p className="text-xs text-orange-600 mt-0.5">{n.message}</p>
                        </div>
                        <Link href={n.targetUrl} className="text-xs text-orange-700 font-medium ml-2 whitespace-nowrap">→</Link>
                      </div>
                    ))}
                    {ntfNotifications.filter(n => n.level === 'warning').length > 0 && (
                      <>
                        <button
                          onClick={() => setNtfWarningExpanded(!ntfWarningExpanded)}
                          className="flex items-center gap-2 w-full p-2 rounded-lg hover:bg-amber-50 transition-colors text-left"
                        >
                          <span className="text-xs text-amber-700 font-medium">
                            警告事項 ({ntfNotifications.filter(n => n.level === 'warning').reduce((s, n) => s + n.count, 0)})
                          </span>
                          <svg className={`w-3.5 h-3.5 text-amber-600 transition-transform ${ntfWarningExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>
                        {ntfWarningExpanded && ntfNotifications.filter(n => n.level === 'warning').map(n => (
                          <div key={n.code} className="flex items-center justify-between p-2.5 rounded-lg bg-amber-50 border-l-4 border-amber-400 ml-3">
                            <div>
                              <span className="text-xs font-medium text-amber-800">{n.title}</span>
                              <span className="text-xs text-amber-600 ml-1">({n.count})</span>
                              <p className="text-xs text-amber-600 mt-0.5">{n.message}</p>
                            </div>
                            <Link href={n.targetUrl} className="text-xs text-amber-700 font-medium ml-2 whitespace-nowrap">→</Link>
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
                  <thead>
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
