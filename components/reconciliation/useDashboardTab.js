'use client';

import { useState, useEffect, useCallback } from 'react';
import { useColumnSort } from '@/components/SortableTh';

export function useDashboardTab({ activeTab, showMessage }) {
  const now = new Date();
  const [dashYear, setDashYear] = useState(now.getFullYear());
  const [dashMonth, setDashMonth] = useState(now.getMonth() + 1);
  const [dashboardData, setDashboardData] = useState(null);
  const [dashLoading, setDashLoading] = useState(false);
  const [dashFetchError, setDashFetchError] = useState(null);
  const [dashFilter, setDashFilter] = useState('all');
  const [dashSearch, setDashSearch] = useState('');
  const { sortKey: dashSortKey, sortDir: dashSortDir, toggleSort: dashToggleSort } = useColumnSort('accountName', 'asc');

  const fetchDashboard = useCallback(async () => {
    setDashLoading(true);
    setDashFetchError(null);
    try {
      const res = await fetch(`/api/reconciliation/dashboard?year=${dashYear}&month=${dashMonth}`);
      const data = await res.json();
      setDashboardData(data);
    } catch (e) {
      setDashFetchError('載入儀表板失敗：' + (e.message || '請稍後再試'));
    }
    setDashLoading(false);
  }, [dashYear, dashMonth]);

  useEffect(() => {
    if (activeTab === 'dashboard') fetchDashboard();
  }, [activeTab, fetchDashboard]);

  return {
    dashYear, setDashYear,
    dashMonth, setDashMonth,
    dashboardData,
    dashLoading,
    dashFetchError,
    dashFilter, setDashFilter,
    dashSearch, setDashSearch,
    dashSortKey, dashSortDir, dashToggleSort,
    fetchDashboard,
  };
}
