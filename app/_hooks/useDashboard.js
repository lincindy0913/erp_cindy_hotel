'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';

export function useDashboard() {
  const { data: session, status } = useSession();
  const isLoggedIn = status === 'authenticated';

  const [summary, setSummary] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(true);

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
  const [dashboardError, setDashboardError] = useState(null);
  const [executiveData, setExecutiveData] = useState(null);
  const [latestReport, setLatestReport] = useState(null);

  const [ntfNotifications, setNtfNotifications] = useState([]);
  const [ntfSummary, setNtfSummary] = useState({ total: 0, critical: 0, urgent: 0, warning: 0 });
  const [ntfLoading, setNtfLoading] = useState(true);
  const [ntfError, setNtfError] = useState(false);
  const [ntfWarningExpanded, setNtfWarningExpanded] = useState(false);
  const [plData, setPlData] = useState(null);
  const [plLoading, setPlLoading] = useState(false);

  const [aqData, setAqData] = useState(null);
  const [aqLoading, setAqLoading] = useState(false);
  const [aqError, setAqError] = useState(null);

  const fetchSummary = useCallback(() => {
    setSummaryLoading(true);
    fetch('/api/dashboard/summary')
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setSummary(data); })
      .catch(() => {})
      .finally(() => setSummaryLoading(false));
  }, []);

  useEffect(() => { fetchSummary(); }, [fetchSummary]);

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
    setDashboardError(null);
    try {
      const url = refresh ? '/api/dashboard?refresh=true' : '/api/dashboard';
      const response = await fetch(url);
      if (!response.ok) { setDashboardError('儀表板資料載入失敗，請稍後再試'); setLoading(false); return; }
      const data = await response.json();
      setDashboardData(prev => ({ ...prev, ...data }));
    } catch {
      setDashboardError('儀表板資料載入失敗，請稍後再試');
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

  function retryDashboard() {
    setLoading(true);
    fetchDashboardData();
  }

  const kpis = dashboardData.kpis || {};
  const totalCashBalance = kpis.totalCashBalance ?? 0;
  const pendingPayments = kpis.pendingPayments ?? 0;

  const now = new Date();
  const dateStr = `${now.getFullYear()} 年 ${now.getMonth() + 1} 月 ${now.getDate()} 日`;

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
    N14: [],
    N15: ['rental.view'],
    N16: ['engineering.view'],
    N17: ['engineering.view'],
  };

  const visibleNotifications = isAdminOrManager
    ? ntfNotifications
    : ntfNotifications.filter(n => {
        if (n.code === 'N14') return false;
        const required = NTF_PERM_MAP[n.code];
        if (!required) return true;
        return required.some(p => userPerms.includes(p));
      });

  const cashierPendingCount = ntfNotifications.find(n => n.code === 'N05')?.count ?? pendingPayments;
  const checksPendingCount = (ntfNotifications.find(n => n.code === 'N03')?.count ?? 0) + (ntfNotifications.find(n => n.code === 'N04')?.count ?? 0);

  return {
    session,
    status,
    isLoggedIn,
    summary,
    summaryLoading,
    fetchSummary,
    dashboardData,
    dashboardError,
    loading,
    executiveData,
    latestReport,
    ntfNotifications,
    ntfSummary,
    ntfLoading,
    ntfError,
    ntfWarningExpanded,
    setNtfWarningExpanded,
    plData,
    plLoading,
    aqData,
    aqLoading,
    aqError,
    fetchNotifications,
    fetchActionQueue,
    handleRefreshAll,
    retryDashboard,
    kpis,
    totalCashBalance,
    pendingPayments,
    dateStr,
    visibleNotifications,
    cashierPendingCount,
    checksPendingCount,
  };
}
