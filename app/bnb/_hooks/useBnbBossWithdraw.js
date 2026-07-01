'use client';

import { useState, useCallback } from 'react';
import { useToast } from '@/context/ToastContext';
import { todayStr } from '@/lib/localDate';

export function useBnbBossWithdraw() {
  const { showToast } = useToast();

  const [bwMonth,       setBwMonth]       = useState(() => todayStr().slice(0, 7));
  const [bwDateFrom,    setBwDateFrom]    = useState('');
  const [bwDateTo,      setBwDateTo]      = useState('');
  const [bwWarehouse,   setBwWarehouse]   = useState('');
  const [bwViewMode,    setBwViewMode]    = useState('detail');
  const [bwYear,        setBwYear]        = useState(() => String(new Date().getFullYear()));
  const [bwData,        setBwData]        = useState(null);
  const [bwLoading,     setBwLoading]     = useState(false);
  const [bwError,       setBwError]       = useState(null);
  const [bwSummary,     setBwSummary]     = useState(null);
  const [bwSummaryLoad, setBwSummaryLoad] = useState(false);

  const fetchBossWithdraw = useCallback(async () => {
    setBwLoading(true);
    setBwError(null);
    try {
      const q = new URLSearchParams();
      if (bwDateFrom || bwDateTo) {
        if (bwDateFrom) q.set('dateFrom', bwDateFrom);
        if (bwDateTo)   q.set('dateTo', bwDateTo);
      } else {
        q.set('month', bwMonth);
      }
      if (bwWarehouse) q.set('warehouse', bwWarehouse);
      const res = await fetch(`/api/bnb/boss-withdraw?${q}`);
      if (!res.ok) { setBwError('載入老闆收取失敗，請稍後再試'); return; }
      setBwData(await res.json());
    } catch { setBwError('載入老闆收取失敗'); } finally { setBwLoading(false); }
  }, [bwMonth, bwDateFrom, bwDateTo, bwWarehouse]);

  const fetchBossWithdrawSummary = useCallback(async () => {
    setBwSummaryLoad(true);
    try {
      const q = new URLSearchParams({ year: bwYear, summary: 'true' });
      if (bwWarehouse) q.set('warehouse', bwWarehouse);
      const res = await fetch(`/api/bnb/boss-withdraw?${q}`);
      if (res.ok) setBwSummary(await res.json());
    } catch { /* ignore */ } finally { setBwSummaryLoad(false); }
  }, [bwYear, bwWarehouse]);

  return {
    bwMonth,       setBwMonth,
    bwDateFrom,    setBwDateFrom,
    bwDateTo,      setBwDateTo,
    bwWarehouse,   setBwWarehouse,
    bwViewMode,    setBwViewMode,
    bwYear,        setBwYear,
    bwData,
    bwLoading,
    bwError,
    bwSummary,
    bwSummaryLoad,
    fetchBossWithdraw,
    fetchBossWithdrawSummary,
  };
}
