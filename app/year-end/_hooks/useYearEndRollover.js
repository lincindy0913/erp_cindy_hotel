'use client';

import { useState, useEffect } from 'react';

export function useYearEndRollover({ selectedYear, userName, onRecordsRefresh }) {
  // 年結前置清單資料
  const [yearChecklist, setYearChecklist] = useState(null);

  // 年結手動確認項目（VAT 申報、年度盤點）
  const [yearManualChecks, setYearManualChecks] = useState({});

  // Validation
  const [validating, setValidating] = useState(false);
  const [validationResult, setValidationResult] = useState(null);

  // Backup readiness
  const [backupReady, setBackupReady] = useState(null);

  // Preview (step 2)
  const [previewData, setPreviewData] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState(null);

  // Execution
  const [step, setStep] = useState(1); // 1=validate, 2=preview, 3=confirm
  const [confirmText, setConfirmText] = useState('');
  const [executing, setExecuting] = useState(false);
  const [executionResult, setExecutionResult] = useState(null);

  useEffect(() => {
    if (!selectedYear) return;
    fetch(`/api/month-end?year=${selectedYear}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data?.months) return;
        const months = data.months;
        const closedCount = months.filter(m => m.status === '已結帳' || m.status === '已鎖定').length;
        const lockedCount = months.filter(m => m.status === '已鎖定').length;
        setYearChecklist({ months, closedCount, lockedCount });
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedYear]);

  useEffect(() => {
    let cancelled = false;
    setYearManualChecks({});
    fetch(`/api/year-end/manual-check?year=${selectedYear}`)
      .then(r => r.ok ? r.json() : {})
      .then(d => { if (!cancelled) setYearManualChecks(d); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [selectedYear]);

  async function toggleYearManual(key) {
    const next = { ...yearManualChecks, [key]: !yearManualChecks[key] };
    setYearManualChecks(next); // optimistic
    try {
      await fetch('/api/year-end/manual-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year: selectedYear, key, value: next[key] }),
      });
    } catch {
      setYearManualChecks(prev => ({ ...prev, [key]: !next[key] })); // rollback
    }
  }

  async function checkBackupReady() {
    try {
      const res = await fetch('/api/backup');
      const data = await res.json();
      const backups = Array.isArray(data) ? data : (data.backups || []);
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const recentFull = backups.find(b =>
        b.tier === 'tier1_full' && new Date(b.createdAt) >= sevenDaysAgo
      );
      setBackupReady(!!recentFull);
    } catch {
      setBackupReady(false);
    }
  }

  async function fetchPreview() {
    setPreviewLoading(true);
    setPreviewData(null);
    setPreviewError(null);
    try {
      const res = await fetch('/api/year-end/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year: selectedYear }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setPreviewData(await res.json());
    } catch (e) {
      console.error('[fetchPreview]', e);
      setPreviewError('預覽數字載入失敗，結轉仍可執行但金額將顯示「—」。');
    }
    setPreviewLoading(false);
  }

  async function handleValidate() {
    setValidating(true);
    setValidationResult(null);
    setExecutionResult(null);
    setBackupReady(null);
    setStep(1);

    await checkBackupReady();

    try {
      const res = await fetch('/api/year-end/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year: selectedYear })
      });
      const data = await res.json();
      setValidationResult(data);
      if (data.valid) {
        setStep(2);
        fetchPreview();
      }
    } catch (error) {
      setValidationResult({ valid: false, warnings: [{ type: 'error', message: '驗證失敗: ' + error.message }] });
    }
    setValidating(false);
  }

  async function handleExecute() {
    setExecuting(true);
    setExecutionResult(null);
    try {
      const res = await fetch('/api/year-end', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          year: selectedYear,
          rolledOverBy: userName,
          preCheckSummary: validationResult?.summary || null
        })
      });
      const data = await res.json();
      if (data.success) {
        setExecutionResult(data);
        onRecordsRefresh();
      } else {
        setExecutionResult({ error: data.error?.message || '結轉失敗' });
      }
    } catch (error) {
      setExecutionResult({ error: '結轉失敗: ' + error.message });
    }
    setExecuting(false);
  }

  function handleReset() {
    setStep(1);
    setValidationResult(null);
    setExecutionResult(null);
    setPreviewData(null);
    setPreviewError(null);
    setConfirmText('');
    setBackupReady(null);
  }

  return {
    yearChecklist,
    yearManualChecks,
    toggleYearManual,
    validating,
    validationResult,
    backupReady,
    previewData,
    previewLoading,
    previewError,
    fetchPreview,
    step,
    setStep,
    confirmText,
    setConfirmText,
    executing,
    executionResult,
    handleValidate,
    handleExecute,
    handleReset,
  };
}
