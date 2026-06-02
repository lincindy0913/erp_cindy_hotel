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

export function useOverview() {
  const { showToast } = useToast();
  const [overview, setOverview] = useState(null);
  const [overviewLoading, setOverviewLoading] = useState(false);

  const fetchOverview = useCallback(async () => {
    setOverviewLoading(true);
    try {
      const now = new Date();
      const month = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
      const [reportRes, cashRes, payRes] = await Promise.all([
        fetch(`/api/analytics/business-report?month=${month}`),
        fetch('/api/analytics/cash-flow-forecast?days=30'),
        fetch('/api/analytics/payables-aging'),
      ]);
      const failed = [];
      if (!reportRes.ok) failed.push('月度摘要');
      if (!cashRes.ok) failed.push('現金流預測');
      if (!payRes.ok) failed.push('應付帳齡');
      if (failed.length > 0) {
        showToast(`經營總覽部分載入失敗：${failed.join('、')}`, 'error');
      }
      const [rep, cash, pay] = await Promise.all([
        reportRes.ok ? reportRes.json() : null,
        cashRes.ok ? cashRes.json() : null,
        payRes.ok ? payRes.json() : null,
      ]);
      setOverview({ rep, cash, pay });
    } catch (e) {
      console.error(e);
      showToast('經營總覽載入失敗，請稍後再試', 'error');
    }
    setOverviewLoading(false);
  }, [showToast]);

  return { overview, overviewLoading, fetchOverview };
}
