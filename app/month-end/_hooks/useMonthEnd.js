'use client';

import { useState, useEffect, useCallback } from 'react';
import { useEscKey } from '@/lib/hooks/useEscKey';
import { useToast } from '@/context/ToastContext';
import { useConfirm } from '@/context/ConfirmContext';

export function useMonthEnd({ selectedYear, userName, isAdmin }) {
  const { showToast } = useToast();
  const confirm = useConfirm();

  const [monthsData, setMonthsData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [monthDataError, setMonthDataError] = useState(null);
  const [lockLoading, setLockLoading] = useState(false);

  // Pre-check modal
  const [showPreCheck, setShowPreCheck] = useState(false);
  const [preCheckMonth, setPreCheckMonth] = useState(null);
  const [preCheckResults, setPreCheckResults] = useState(null);
  const [preCheckLoading, setPreCheckLoading] = useState(false);
  const [reconCheckResult, setReconCheckResult] = useState(null);

  // Report viewer
  const [showReport, setShowReport] = useState(false);
  const [reportData, setReportData] = useState(null);
  const [reportLoading, setReportLoading] = useState(false);

  // Month detail
  const [showMonthDetail, setShowMonthDetail] = useState(false);
  const [monthDetail, setMonthDetail] = useState(null);
  const [monthDetailLoading, setMonthDetailLoading] = useState(false);

  // Unlock modal
  const [showUnlock, setShowUnlock] = useState(false);
  const [unlockTarget, setUnlockTarget] = useState(null);
  const [unlockReason, setUnlockReason] = useState('');
  const [unlockLoading, setUnlockLoading] = useState(false);

  // Checklist
  const [checklistData, setChecklistData] = useState(null);
  const [checklistLoading, setChecklistLoading] = useState(false);
  const [checklistMonth, setChecklistMonth] = useState(new Date().getMonth() + 1);

  // Manual confirm
  const [manualConfirmed, setManualConfirmed] = useState({});
  const [manualConfirmLoading, setManualConfirmLoading] = useState(false);

  useEscKey(useCallback(() => {
    if (showUnlock && !unlockLoading)     { setShowUnlock(false);      return; }
    if (showMonthDetail)                  { setShowMonthDetail(false); return; }
    if (showPreCheck && !preCheckLoading) { setShowPreCheck(false);    return; }
  }, [showUnlock, unlockLoading, showMonthDetail, showPreCheck, preCheckLoading]));

  useEffect(() => {
    let cancelled = false;
    setManualConfirmed({});
    fetch(`/api/month-end/manual-check?year=${selectedYear}&month=${checklistMonth}`)
      .then(r => r.ok ? r.json() : {})
      .then(d => { if (!cancelled) setManualConfirmed(d); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [selectedYear, checklistMonth]);

  useEffect(() => { fetchMonthData(); }, [selectedYear]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { fetchChecklist(checklistMonth); }, [selectedYear, checklistMonth]); // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchMonthData() {
    setLoading(true);
    try {
      const res = await fetch(`/api/month-end?year=${selectedYear}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setMonthDataError(null);
      if (data.months) setMonthsData(data.months);
    } catch (error) {
      setMonthDataError('月結資料載入失敗，請重試。');
    }
    setLoading(false);
  }

  async function fetchChecklist(month = checklistMonth) {
    setChecklistLoading(true);
    try {
      const res = await fetch(`/api/month-end/checklist?year=${selectedYear}&month=${month}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setChecklistData(await res.json());
    } catch { /* ignore */ }
    setChecklistLoading(false);
  }

  async function toggleManualConfirm(itemKey) {
    const next = { ...manualConfirmed, [itemKey]: !manualConfirmed[itemKey] };
    setManualConfirmed(next);
    setManualConfirmLoading(true);
    try {
      await fetch('/api/month-end/manual-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year: selectedYear, month: checklistMonth, key: itemKey, value: next[itemKey] }),
      });
    } catch {
      setManualConfirmed(prev => ({ ...prev, [itemKey]: !next[itemKey] }));
    } finally {
      setManualConfirmLoading(false);
    }
  }

  async function submitMonthEnd(month, force = false) {
    setPreCheckLoading(true);
    try {
      const [monthEndRes, reconRes] = await Promise.all([
        fetch('/api/month-end', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ year: selectedYear, month, closedBy: userName, ...(force ? { force: true } : {}) }),
        }),
        fetch(`/api/reconciliation/continuity-check?year=${selectedYear}&month=${month}`).catch(() => null),
      ]);
      const data = await monthEndRes.json();
      if (reconRes && reconRes.ok) setReconCheckResult(await reconRes.json());
      if (data.blocked) {
        setPreCheckResults({ blocked: true, blockedBy: data.blockedBy, detail: data.detail, preChecks: data.preChecks });
      } else if (data.error) {
        setPreCheckResults({ error: data.error });
      } else {
        setPreCheckResults(data);
        fetchMonthData();
      }
    } catch (error) {
      setPreCheckResults({ error: '月結作業執行失敗: ' + error.message });
    }
    setPreCheckLoading(false);
  }

  async function handleStartClose(month) {
    setPreCheckMonth(month);
    setPreCheckResults(null);
    setReconCheckResult(null);
    setShowPreCheck(true);
    await submitMonthEnd(month, false);
  }

  async function handleForceClose() {
    if (!(await confirm(
      `現金盤點尚未完成，確定要強制月結？\n\n${preCheckResults?.detail || ''}\n\n此操作將跳過現金盤點要求，請確認帳實相符後再繼續。`,
      { title: '強制月結確認', danger: true }
    ))) return;
    await submitMonthEnd(preCheckMonth, true);
  }

  async function handleLock(statusId) {
    if (!(await confirm('確定要鎖定此月份？鎖定後需要管理員才能解鎖。', { title: '月結鎖定確認', danger: false }))) return;
    setLockLoading(true);
    try {
      const res = await fetch(`/api/month-end/${statusId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'lock' }),
      });
      const data = await res.json();
      if (data.success) fetchMonthData();
      else showToast(data.error || '鎖定失敗', 'error');
    } catch (error) {
      showToast('鎖定失敗: ' + error.message, 'error');
    }
    setLockLoading(false);
  }

  function handleUnlockClick(monthData) {
    setUnlockTarget(monthData);
    setUnlockReason('');
    setShowUnlock(true);
  }

  async function handleUnlockSubmit() {
    if (!unlockReason.trim()) { showToast('請輸入解鎖原因', 'error'); return; }
    setUnlockLoading(true);
    try {
      const res = await fetch(`/api/month-end/${unlockTarget.statusId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'unlock', unlockedBy: userName, unlockReason: unlockReason.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        setShowUnlock(false);
        fetchMonthData();
        const cascaded = data.cascadeUnlocked || [];
        if (cascaded.length > 0) {
          const months = cascaded.map(m => `${m.month} 月`).join('、');
          showToast(`已解鎖 ${unlockTarget.month} 月，並連帶解鎖 ${months}`, 'warning');
        } else {
          showToast(`${unlockTarget.month} 月結已解鎖`, 'success');
        }
      } else {
        showToast(data.error || '解鎖失敗', 'error');
      }
    } catch (error) {
      showToast('解鎖失敗: ' + error.message, 'error');
    }
    setUnlockLoading(false);
  }

  async function handleViewDetail(statusId) {
    setShowMonthDetail(true);
    setMonthDetail(null);
    setMonthDetailLoading(true);
    try {
      const res = await fetch(`/api/month-end/${statusId}`);
      setMonthDetail(await res.json());
    } catch { /* ignore */ }
    setMonthDetailLoading(false);
  }

  async function handleViewReport(reportId) {
    setShowReport(true);
    setReportData(null);
    setReportLoading(true);
    try {
      const res = await fetch(`/api/month-end/reports/${reportId}`);
      setReportData(await res.json());
    } catch { /* ignore */ }
    setReportLoading(false);
  }

  const closedMonthSet = new Set(
    monthsData.filter(m => m.status === '已結帳' || m.status === '已鎖定').map(m => m.month)
  );
  const closedMonthCount = closedMonthSet.size;

  function canCloseMonth(month) {
    if (month <= 1) return true;
    return closedMonthSet.has(month - 1);
  }

  return {
    monthsData, loading, monthDataError, lockLoading,
    closedMonthCount, canCloseMonth,
    fetchMonthData,
    showPreCheck, setShowPreCheck, preCheckMonth, preCheckResults, preCheckLoading, reconCheckResult,
    handleStartClose, handleForceClose,
    showReport, setShowReport, reportData, reportLoading, handleViewReport,
    showMonthDetail, setShowMonthDetail, monthDetail, monthDetailLoading, handleViewDetail,
    showUnlock, setShowUnlock, unlockTarget, unlockReason, setUnlockReason, unlockLoading,
    handleUnlockClick, handleUnlockSubmit,
    checklistData, checklistLoading, checklistMonth, setChecklistMonth, fetchChecklist,
    manualConfirmed, manualConfirmLoading, toggleManualConfirm,
    handleLock,
  };
}
