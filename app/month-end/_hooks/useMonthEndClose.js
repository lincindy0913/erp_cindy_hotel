'use client';

import { useState } from 'react';
import { useConfirm } from '@/context/ConfirmContext';

export function useMonthEndClose({ selectedYear, userName, onMonthDataRefresh }) {
  const confirm = useConfirm();

  // Pre-check modal
  const [showPreCheck, setShowPreCheck] = useState(false);
  const [preCheckMonth, setPreCheckMonth] = useState(null);
  const [preCheckResults, setPreCheckResults] = useState(null);
  const [preCheckLoading, setPreCheckLoading] = useState(false);

  // Reconciliation continuity check
  const [reconCheckResult, setReconCheckResult] = useState(null);

  // Internal helper — sends the month-end POST, handles blocked/success/error
  async function submitMonthEnd(month, force = false) {
    setPreCheckLoading(true);
    try {
      const [monthEndRes, reconRes] = await Promise.all([
        fetch('/api/month-end', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            year: selectedYear,
            month,
            closedBy: userName,
            ...(force ? { force: true } : {}),
          }),
        }),
        fetch(
          `/api/reconciliation/continuity-check?year=${selectedYear}&month=${month}`
        ).catch(() => null),
      ]);

      const data = await monthEndRes.json();

      if (reconRes && reconRes.ok) {
        const reconData = await reconRes.json();
        setReconCheckResult(reconData);
      }

      if (data.blocked) {
        setPreCheckResults({
          blocked: true,
          blockedBy: data.blockedBy,
          detail: data.detail,
          preChecks: data.preChecks,
        });
      } else if (data.error) {
        setPreCheckResults({ error: data.error });
      } else {
        setPreCheckResults(data);
        onMonthDataRefresh();
      }
    } catch (error) {
      setPreCheckResults({ error: '月結作業執行失敗: ' + error.message });
    }
    setPreCheckLoading(false);
  }

  // Start the month-end closing flow
  async function handleStartClose(month) {
    setPreCheckMonth(month);
    setPreCheckResults(null);
    setReconCheckResult(null);
    setShowPreCheck(true);
    await submitMonthEnd(month, false);
  }

  // Force-close override (admin confirmed)
  async function handleForceClose() {
    if (
      !(await confirm(
        `現金盤點尚未完成，確定要強制月結？\n\n${preCheckResults?.detail || ''}\n\n此操作將跳過現金盤點要求，請確認帳實相符後再繼續。`,
        { title: '強制月結確認', danger: true }
      ))
    )
      return;
    await submitMonthEnd(preCheckMonth, true);
  }

  return {
    showPreCheck,
    setShowPreCheck,
    preCheckMonth,
    preCheckResults,
    preCheckLoading,
    reconCheckResult,
    handleStartClose,
    handleForceClose,
  };
}
