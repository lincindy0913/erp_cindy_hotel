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

export function useReport() {
  const { showToast } = useToast();

  const [report, setReport] = useState(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportMonth, setReportMonth] = useState(() => {
    const n = new Date(); return `${n.getFullYear()}${String(n.getMonth() + 1).padStart(2, '0')}`;
  });
  const [reportApproving, setReportApproving] = useState(false);

  const fetchReport = useCallback(async () => {
    setReportLoading(true); setReport(null);
    try {
      const res = await fetch(`/api/analytics/business-report?month=${reportMonth}`);
      if (!res.ok) {
        showToast(await apiErrorMessage(res), 'error');
        setReportLoading(false);
        return;
      }
      setReport(await res.json());
    } catch (e) {
      console.error(e);
      showToast('月度報告載入失敗，請稍後再試', 'error');
    }
    setReportLoading(false);
  }, [reportMonth, showToast]);

  const approveReport = useCallback(async () => {
    setReportApproving(true);
    try {
      const res = await fetch(`/api/analytics/business-report?month=${reportMonth}`, { method: 'PATCH' });
      if (res.ok) {
        const d = await res.json();
        setReport((prev) => ({ ...prev, report: d.report }));
        showToast('月度報告已核定', 'success');
      } else {
        showToast(await apiErrorMessage(res), 'error');
      }
    } catch (e) {
      console.error(e);
      showToast('核定失敗，請稍後再試', 'error');
    }
    setReportApproving(false);
  }, [reportMonth, showToast]);

  return {
    report, reportLoading, reportMonth, setReportMonth, fetchReport,
    reportApproving, approveReport,
  };
}
