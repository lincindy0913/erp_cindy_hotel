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

export function useCashflow() {
  const { showToast } = useToast();
  const [cashflow, setCashflow] = useState(null);
  const [cashflowLoading, setCashflowLoading] = useState(false);
  const [forecastDays, setForecastDays] = useState(30);

  const fetchCashflow = useCallback(async () => {
    setCashflowLoading(true);
    try {
      const res = await fetch(`/api/analytics/cash-flow-forecast?days=${forecastDays}`);
      if (!res.ok) {
        showToast(await apiErrorMessage(res), 'error');
        setCashflowLoading(false);
        return;
      }
      setCashflow(await res.json());
    } catch (e) {
      console.error(e);
      showToast('現金流預測載入失敗，請稍後再試', 'error');
    }
    setCashflowLoading(false);
  }, [forecastDays, showToast]);

  return { cashflow, cashflowLoading, forecastDays, setForecastDays, fetchCashflow };
}
