'use client';

import { useState } from 'react';
import { useToast } from '@/context/ToastContext';
import { useConfirm } from '@/context/ConfirmContext';

export function useMonthEndActions({ selectedYear, userName, onMonthDataRefresh }) {
  const { showToast } = useToast();
  const confirm = useConfirm();

  // Lock
  const [lockLoading, setLockLoading] = useState(false);

  // Unlock modal
  const [showUnlock, setShowUnlock] = useState(false);
  const [unlockTarget, setUnlockTarget] = useState(null);
  const [unlockReason, setUnlockReason] = useState('');
  const [unlockLoading, setUnlockLoading] = useState(false);

  // Month detail modal
  const [showMonthDetail, setShowMonthDetail] = useState(false);
  const [monthDetail, setMonthDetail] = useState(null);
  const [monthDetailLoading, setMonthDetailLoading] = useState(false);

  // Single report viewer modal
  const [showReport, setShowReport] = useState(false);
  const [reportData, setReportData] = useState(null);
  const [reportLoading, setReportLoading] = useState(false);

  // Lock a month-end
  async function handleLock(statusId) {
    if (
      !(await confirm('確定要鎖定此月份？鎖定後需要管理員才能解鎖。', {
        title: '月結鎖定確認',
        danger: false,
      }))
    )
      return;
    setLockLoading(true);
    try {
      const res = await fetch(`/api/month-end/${statusId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'lock' }),
      });
      const data = await res.json();
      if (data.success) {
        onMonthDataRefresh();
      } else {
        showToast(data.error || '鎖定失敗', 'error');
      }
    } catch (error) {
      showToast('鎖定失敗: ' + error.message, 'error');
    }
    setLockLoading(false);
  }

  // Open unlock modal
  function handleUnlockClick(monthData) {
    setUnlockTarget(monthData);
    setUnlockReason('');
    setShowUnlock(true);
  }

  // Submit unlock
  async function handleUnlockSubmit() {
    if (!unlockReason.trim()) {
      showToast('請輸入解鎖原因', 'error');
      return;
    }
    setUnlockLoading(true);
    try {
      const res = await fetch(`/api/month-end/${unlockTarget.statusId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'unlock',
          unlockedBy: userName,
          unlockReason: unlockReason.trim(),
        }),
      });
      const data = await res.json();
      if (data.success) {
        setShowUnlock(false);
        onMonthDataRefresh();
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

  // View month detail (all reports)
  async function handleViewDetail(statusId) {
    setShowMonthDetail(true);
    setMonthDetail(null);
    setMonthDetailLoading(true);
    try {
      const res = await fetch(`/api/month-end/${statusId}`);
      const data = await res.json();
      setMonthDetail(data);
    } catch (error) {
      console.error('載入月結詳情失敗:', error);
    }
    setMonthDetailLoading(false);
  }

  // View a single report
  async function handleViewReport(reportId) {
    setShowReport(true);
    setReportData(null);
    setReportLoading(true);
    try {
      const res = await fetch(`/api/month-end/reports/${reportId}`);
      const data = await res.json();
      setReportData(data);
    } catch (error) {
      console.error('載入報表失敗:', error);
    }
    setReportLoading(false);
  }

  return {
    lockLoading,
    handleLock,
    showUnlock,
    setShowUnlock,
    unlockTarget,
    unlockReason,
    setUnlockReason,
    unlockLoading,
    handleUnlockClick,
    handleUnlockSubmit,
    showMonthDetail,
    setShowMonthDetail,
    monthDetail,
    monthDetailLoading,
    handleViewDetail,
    showReport,
    setShowReport,
    reportData,
    reportLoading,
    handleViewReport,
  };
}
