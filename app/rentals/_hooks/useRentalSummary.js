'use client';

import { useState } from 'react';
import { useToast } from '@/context/ToastContext';

export function useRentalSummary() {
  const { showToast } = useToast();
  const [summary,            setSummary]            = useState(null);
  const [summaryError,       setSummaryError]       = useState(null);
  const [summaryLoading,     setSummaryLoading]     = useState(false);
  const [summaryLastFetched, setSummaryLastFetched] = useState(null);

  async function fetchSummary() {
    setSummaryLoading(true);
    setSummaryError(null);
    try {
      const res = await fetch('/api/rentals/summary');
      if (!res.ok) throw new Error(`伺服器錯誤（${res.status}）`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setSummary(data);
      setSummaryLastFetched(Date.now());
    } catch (e) {
      setSummaryError(e.message || '載入失敗');
    } finally {
      setSummaryLoading(false);
    }
  }

  return { summary, summaryError, summaryLoading, summaryLastFetched, fetchSummary };
}
