'use client';

import { useState, useCallback } from 'react';
import { todayStr } from '@/lib/localDate';
import { DEFAULT_WAREHOUSE } from '../_constants';

export function useBnbDailyRevenue({ showToast }) {
  const [drMonth,     setDrMonth]     = useState(() => todayStr().slice(0, 7));
  const [drWarehouse, setDrWarehouse] = useState(DEFAULT_WAREHOUSE);
  const [drLoading,   setDrLoading]   = useState(false);
  const [drData,      setDrData]      = useState(null);
  const [drError,     setDrError]     = useState(null);
  const [drExpandDay, setDrExpandDay] = useState(null);

  const fetchDailyRevenue = useCallback(async () => {
    setDrLoading(true);
    setDrExpandDay(null);
    setDrError(null);
    try {
      const p = new URLSearchParams({ month: drMonth });
      if (drWarehouse) p.set('warehouse', drWarehouse);
      const res = await fetch(`/api/bnb/daily-revenue?${p}`);
      if (!res.ok) { const msg = '載入每日收入失敗，請稍後再試'; setDrError(msg); showToast(msg, 'error'); return; }
      setDrData(await res.json());
    } catch { const msg = '載入每日收入失敗'; setDrError(msg); showToast(msg, 'error'); }
    finally { setDrLoading(false); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drMonth, drWarehouse]);

  return {
    drMonth, setDrMonth, drWarehouse, setDrWarehouse,
    drLoading, drData, drError, drExpandDay, setDrExpandDay,
    fetchDailyRevenue,
  };
}
