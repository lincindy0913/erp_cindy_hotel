'use client';

import { useState, useCallback } from 'react';
import { useToast } from '@/context/ToastContext';

async function apiErrorMessage(res) {
  try {
    const j = await res.json();
    return j.error?.message || j.error || j.message || `請求失敗（${res.status}）`;
  } catch {
    return `請求失敗（${res.status}）`;
  }
}

export function usePayables() {
  const { showToast } = useToast();

  const [payables, setPayables] = useState(null);
  const [payablesLoading, setPayablesLoading] = useState(false);
  const [payablesSegment, setPayablesSegment] = useState('operations');
  const [apAging, setApAging] = useState(null);
  const [apAgingLoading, setApAgingLoading] = useState(false);
  const [apAgingWarehouse, setApAgingWarehouse] = useState('');

  const fetchPayables = useCallback(async () => {
    setPayablesLoading(true);
    try {
      const res = await fetch('/api/analytics/payables-aging');
      if (!res.ok) {
        showToast(await apiErrorMessage(res), 'error');
        setPayablesLoading(false);
        return;
      }
      setPayables(await res.json());
    } catch (e) {
      console.error(e);
      showToast('應付帳齡載入失敗，請稍後再試', 'error');
    }
    setPayablesLoading(false);
  }, [showToast]);

  const fetchApAging = useCallback(async () => {
    setApAgingLoading(true);
    try {
      const p = new URLSearchParams();
      if (apAgingWarehouse.trim()) p.set('warehouse', apAgingWarehouse.trim());
      const qs = p.toString();
      const res = await fetch(`/api/analytics/ap-aging${qs ? `?${qs}` : ''}`);
      if (!res.ok) {
        showToast(await apiErrorMessage(res), 'error');
        setApAgingLoading(false);
        return;
      }
      setApAging(await res.json());
    } catch (e) {
      console.error(e);
      showToast('費用單帳齡載入失敗，請稍後再試', 'error');
    }
    setApAgingLoading(false);
  }, [apAgingWarehouse, showToast]);

  return {
    payables, payablesLoading, fetchPayables,
    payablesSegment, setPayablesSegment,
    apAging, apAgingLoading, apAgingWarehouse, setApAgingWarehouse, fetchApAging,
  };
}
