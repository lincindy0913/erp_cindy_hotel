'use client';

import { useState, useCallback } from 'react';
import { useToast } from '@/context/ToastContext';
import { useConfirm } from '@/context/ConfirmContext';

const DEFAULT_WAREHOUSE = '民宿';

export function useBnbLock({ getActiveLockContext }) {
  const { showToast } = useToast();
  const confirm = useConfirm();

  const [lockStatus,      setLockStatus]      = useState(null);
  const [lockAudits,      setLockAudits]      = useState([]);
  const [showLockHistory, setShowLockHistory] = useState(false);
  const [showBatchLock,   setShowBatchLock]   = useState(false);
  const [lockLoading,     setLockLoading]     = useState(false);

  const fetchLockStatus = useCallback(async (month, warehouse = DEFAULT_WAREHOUSE) => {
    if (!month) return;
    try {
      const p = new URLSearchParams({ month, warehouse });
      const res = await fetch(`/api/bnb/lock?${p}`);
      if (res.ok) setLockStatus(await res.json());
    } catch { /* ignore */ }
  }, []);

  const fetchLockAudits = useCallback(async (month, warehouse) => {
    if (!month) return;
    const p = new URLSearchParams({ month, warehouse });
    fetch(`/api/bnb/lock-audits?${p}`)
      .then(r => r.ok ? r.json() : [])
      .then(data => setLockAudits(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  const toggleLock = useCallback(async () => {
    if (lockLoading) return;
    const { month, warehouse } = getActiveLockContext();
    const isLocked = lockStatus?.locked;
    const action = isLocked ? '解鎖' : '鎖帳';

    let reason = '';
    if (isLocked) {
      reason = window.prompt(`請填寫「${month}（${warehouse}）」解鎖原因（必填）：`);
      if (reason === null) return;
      if (!reason.trim()) { showToast('解鎖原因不可為空', 'error'); return; }
    } else {
      if (!(await confirm(`確定要鎖帳「${month}（${warehouse}）」？\n鎖帳後所有訂房資料、付款明細、匯入、申報都將無法修改。`, { title: '鎖帳確認', danger: true }))) return;
    }

    setLockLoading(true);
    try {
      const p = new URLSearchParams({ month, warehouse, ...(isLocked ? { reason } : {}) });
      const res = isLocked
        ? await fetch(`/api/bnb/lock?${p}`, { method: 'DELETE' })
        : await fetch('/api/bnb/lock', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ month, warehouse }) });
      if (res.ok) {
        const data = await res.json();
        setLockStatus(data);
        showToast(`${month} 已${data.locked ? '鎖帳' : '解鎖'}`, 'success');
        fetchLockAudits(month, warehouse);
      } else {
        const err = await res.json().catch(() => ({}));
        showToast(err.error || `${action}失敗`, 'error');
      }
    } catch { showToast(`${action}失敗`, 'error'); }
    finally { setLockLoading(false); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lockStatus, lockLoading, getActiveLockContext]);

  return {
    lockStatus,
    lockAudits,
    showLockHistory, setShowLockHistory,
    showBatchLock,   setShowBatchLock,
    lockLoading,
    fetchLockStatus,
    fetchLockAudits,
    toggleLock,
  };
}
