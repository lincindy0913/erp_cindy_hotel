'use client';

import { useState, useEffect } from 'react';
import { todayStr } from '@/lib/localDate';

export function useSalesMonthly({ activeView, canSalesView }) {
  const [statsStartMonth, setStatsStartMonth] = useState(() => `${new Date().getFullYear()}-01`);
  const [statsEndMonth,   setStatsEndMonth]   = useState(() => todayStr().slice(0, 7));
  const [statsWarehouse,  setStatsWarehouse]  = useState('');
  const [statsData, setStatsData] = useState(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsError, setStatsError] = useState(null);

  async function fetchMonthlyStats() {
    setStatsLoading(true);
    try {
      const p = new URLSearchParams({ startMonth: statsStartMonth, endMonth: statsEndMonth });
      if (statsWarehouse) p.set('warehouse', statsWarehouse);
      const res = await fetch(`/api/sales/monthly-stats?${p}`);
      if (res.ok) { setStatsError(null); setStatsData(await res.json()); }
      else setStatsError('月度統計載入失敗，請重試。');
    } catch { setStatsError('月度統計載入失敗，請檢查網路連線。'); }
    setStatsLoading(false);
  }

  useEffect(() => {
    if (activeView === 'monthly' && canSalesView) fetchMonthlyStats();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeView, canSalesView]);

  return {
    statsStartMonth, setStatsStartMonth,
    statsEndMonth,   setStatsEndMonth,
    statsWarehouse,  setStatsWarehouse,
    statsData,
    statsLoading,
    statsError,
    fetchMonthlyStats,
  };
}
