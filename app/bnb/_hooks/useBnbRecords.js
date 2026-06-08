'use client';

import { useState, useCallback, useMemo, useEffect } from 'react';
import { useToast } from '@/context/ToastContext';
import { useConfirm } from '@/context/ConfirmContext';
import { todayStr } from '@/lib/localDate';
import { useFetchWithTimeout } from '@/lib/hooks/useFetchWithTimeout';

// ── 付款欄位順序（Excel Tab 跳格用）──────────────────────────────
const PAY_FIELDS = [
  'payDeposit', 'depositDate', 'depositLast5',
  'payTransfer', 'transferDate', 'transferLast5',
  'payCard', 'cardSettlementDate',
  'payCash', 'cashDepositDate', 'cashDestination',
  'payVoucher',
];

export function useBnbRecords() {
  const { showToast } = useToast();
  const confirm = useConfirm();
  const fetchT = useFetchWithTimeout(10000); // 10s timeout for BnB record lists

  // ── 訂房明細 state ────────────────────────────────────────────
  const [records,        setRecords]        = useState([]);
  const [recLoading,     setRecLoading]     = useState(false);
  const [recError,       setRecError]       = useState(null);
  const [recPage,        setRecPage]        = useState(1);
  const [recTotal,       setRecTotal]       = useState(0);
  const getLS = (k, fb) => { try { return localStorage.getItem(k) || fb; } catch { return fb; } };
  const [filterMonth,    setFilterMonth]    = useState(() => getLS('bnb_filterMonth', todayStr().slice(0, 7)));
  const [filterSource,   setFilterSource]   = useState('');
  const [filterStatus,   setFilterStatus]   = useState('');
  const [filterWarehouse,setFilterWarehouse]= useState(() => getLS('bnb_filterWarehouse', ''));
  const [pageSize,       setPageSize]       = useState(() => parseInt(getLS('bnb_pageSize', '200')));

  useEffect(() => { try { localStorage.setItem('bnb_filterMonth', filterMonth); } catch {} }, [filterMonth]);
  useEffect(() => { try { localStorage.setItem('bnb_filterWarehouse', filterWarehouse); } catch {} }, [filterWarehouse]);
  useEffect(() => { try { localStorage.setItem('bnb_pageSize', String(pageSize)); } catch {} }, [pageSize]);
  const [filterPayment,  setFilterPayment]  = useState(''); // '' | 'unfilled' | 'filled'

  // ── 全月稽核摘要（不受分頁限制）─────────────────────────────────
  const [auditSummary,    setAuditSummary]    = useState(null);
  const [auditSummaryLoading, setAuditSummaryLoading] = useState(false);

  const fetchAuditSummary = useCallback(async () => {
    setAuditSummaryLoading(true);
    try {
      const p = new URLSearchParams({ month: filterMonth });
      if (filterWarehouse) p.set('warehouse', filterWarehouse);
      const res = await fetch(`/api/bnb/audit-summary?${p}`);
      if (res.ok) setAuditSummary(await res.json());
    } catch {}
    finally { setAuditSummaryLoading(false); }
  }, [filterMonth, filterWarehouse]);

  // 月份或館別切換時重新取全月稽核摘要
  useEffect(() => { fetchAuditSummary(); }, [fetchAuditSummary]);

  // ── 批次填入 state ────────────────────────────────────────────
  const [selectedIds,   setSelectedIds]   = useState(new Set());
  const [batchField,    setBatchField]    = useState('status');
  const [batchValue,    setBatchValue]    = useState('');
  const [batchApplying, setBatchApplying] = useState(false);

  // ── Inline edit state ─────────────────────────────────────────
  const [inlineEdit, setInlineEdit] = useState(null); // { id, field }

  // ── Excel 模式 state ──────────────────────────────────────────
  const [editMode,    setEditMode]    = useState(false);
  const [editMap,     setEditMap]     = useState({});  // { [id]: { payDeposit, ... } }
  const [dirtyIds,    setDirtyIds]    = useState(new Set());
  const [batchSaving, setBatchSaving] = useState(false);
  const [locking,     setLocking]     = useState(false);
  const [rowErrors,   setRowErrors]   = useState({});  // { [id]: errorMsg }

  // ── roomNoList useMemo ────────────────────────────────────────
  const roomNoList = useMemo(
    () => [...new Set(records.map(r => r.roomNo).filter(Boolean))].sort(),
    [records]
  );

  // ── 訂房明細 fetch ────────────────────────────────────────────
  const fetchRecords = useCallback(async (page = 1, pageSizeOverride) => {
    setRecLoading(true);
    try {
      const effectivePageSize = pageSizeOverride ?? pageSize;
      const p = new URLSearchParams({ month: filterMonth, page: String(page), pageSize: String(effectivePageSize) });
      if (filterSource)    p.set('source', filterSource);
      if (filterStatus)    p.set('status', filterStatus);
      if (filterWarehouse) p.set('warehouse', filterWarehouse);
      if (filterPayment) {
        // mismatch 由 API server-side 過濾（全月範圍，無 500 筆上限）
        p.set('paymentFilter', filterPayment);
      }
      const res = await fetchT(`/api/bnb?${p}`);
      if (!res.ok) {
        if (res.status === 401) { window.location.href = '/login'; return; }
        const errJson = await res.json().catch(() => ({}));
        const msg = errJson?.error || `載入訂房記錄失敗（${res.status}）`;
        showToast(msg, 'error');
        setRecError(msg);
        return;
      }
      const json = await res.json();
      setRecError(null);
      setRecords(json.data ?? json);
      setRecTotal(json.total ?? (json.data ?? json).length);
      setRecPage(page);
      if (json.mismatchOverflow) {
        showToast('金額不符記錄超過顯示上限，部分結果可能未顯示，請縮小篩選條件', 'warning');
      }
    } catch (e) {
      showToast(`載入訂房記錄失敗：${e.message}`, 'error');
      setRecError(`載入訂房記錄失敗：${e.message}`);
    }
    finally { setRecLoading(false); }
  }, [filterMonth, filterSource, filterStatus, filterWarehouse, filterPayment, pageSize, showToast, fetchT]);

  // ── 批次套用 ──────────────────────────────────────────────────
  async function handleBatchApply() {
    if (!selectedIds.size || !batchValue) {
      showToast('請選擇狀態', 'error'); return;
    }
    setBatchApplying(true);
    try {
      const idList = [...selectedIds];
      const results = await Promise.all(idList.map(async id => {
        const res = await fetch(`/api/bnb/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: batchValue }),
        });
        const body = await res.json().catch(() => ({}));
        return { id, ok: res.ok, error: body?.error || null };
      }));
      const failed    = results.filter(r => !r.ok);
      const succeeded = results.length - failed.length;
      if (failed.length > 0) {
        // 找失敗記錄的姓名（從 records 陣列）
        const failNames = failed
          .map(f => records.find(r => r.id === f.id)?.guestName || `#${f.id}`)
          .slice(0, 5)
          .join('、');
        const extra = failed.length > 5 ? `…等 ${failed.length} 筆` : '';
        showToast(`${succeeded} 筆成功，${failed.length} 筆失敗：${failNames}${extra}`, 'error');
      } else {
        showToast(`已套用 ${succeeded} 筆`, 'success');
      }
      setSelectedIds(new Set());
      setBatchValue('');
      fetchRecords();
    } catch { showToast('批次套用失敗', 'error'); }
    finally { setBatchApplying(false); }
  }

  // ── Inline 儲存 ───────────────────────────────────────────────
  async function handleInlineSave(id, field, value) {
    setInlineEdit(null);
    const isText = ['depositLast5', 'transferLast5', 'note', 'roomNo'].includes(field);
    const payload = isText ? { [field]: value || null } : { [field]: parseFloat(value) || 0 };
    const res = await fetch(`/api/bnb/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      showToast(err.message || err.error || '儲存失敗', 'error');
      fetchRecords();
      return;
    }
    const updated = await res.json();
    // merge payload so inline-edited field is reflected immediately without refetch
    setRecords(prev => prev.map(r => r.id === id ? { ...r, ...payload, ...updated } : r));
  }

  // ── Excel 模式：進入 ──────────────────────────────────────────
  function enterEditMode() {
    const map = {};
    // 未填付款的記錄預設加入 dirtyIds，讓使用者直接點「儲存全部」
    // 即可將 0 元付款（免費/招待）標記為已填，不需要手動輸入 0
    const initialDirty = new Set();
    for (const r of records) {
      if (r.status === '已刪除' || r.paymentLocked) continue;
      map[r.id] = {
        payDeposit:         String(r.payDeposit   > 0 ? r.payDeposit   : ''),
        depositLast5:       r.depositLast5 || '',
        payTransfer:        String(r.payTransfer  > 0 ? r.payTransfer  : ''),
        transferDate:       r.transferDate  || '',
        transferLast5:      r.transferLast5 || '',
        payCard:            String(r.payCard      > 0 ? r.payCard      : ''),
        cardSettlementDate: r.cardSettlementDate  || '',
        payCash:            String(r.payCash      > 0 ? r.payCash      : ''),
        cashDestination:    r.cashDestination || '',
        cashDepositDate:    r.cashDepositDate || '',
        payVoucher:         String(r.payVoucher   > 0 ? r.payVoucher   : ''),
      };
      if (!r.paymentFilled) initialDirty.add(r.id);
    }
    setEditMap(map);
    setDirtyIds(initialDirty);
    setEditMode(true);
    setInlineEdit(null);
  }

  function cancelEditMode() {
    setEditMode(false);
    setEditMap({});
    setDirtyIds(new Set());
    setRowErrors({});
  }

  function updateCell(id, field, value) {
    setEditMap(prev => ({ ...prev, [id]: { ...prev[id], [field]: value } }));
    setDirtyIds(prev => new Set([...prev, id]));
  }

  function focusPayCell(id, field) {
    const el = document.getElementById(`pc-${id}-${field}`);
    if (el) { el.focus(); el.select(); }
  }

  function handlePayKeyDown(e, rid, field, editableRecords) {
    if (e.key === 'Escape') { cancelEditMode(); return; }
    const fieldIdx  = PAY_FIELDS.indexOf(field);
    const recordIdx = editableRecords.findIndex(x => x.id === rid);

    if (e.key === 'Tab') {
      e.preventDefault();
      if (fieldIdx < PAY_FIELDS.length - 1) {
        focusPayCell(rid, PAY_FIELDS[fieldIdx + 1]);
      } else if (recordIdx < editableRecords.length - 1) {
        focusPayCell(editableRecords[recordIdx + 1].id, PAY_FIELDS[0]);
      }
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (recordIdx < editableRecords.length - 1) {
        focusPayCell(editableRecords[recordIdx + 1].id, field);
      }
    }
  }

  async function saveAllEdits() {
    const toSave = [...dirtyIds].map(id => ({ id, ...editMap[id] }));
    if (!toSave.length) { cancelEditMode(); return; }
    setBatchSaving(true);
    try {
      const res = await fetch('/api/bnb/batch', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'savePayment', records: toSave }),
      });
      if (!res.ok) { showToast('批次儲存失敗', 'error'); return; }
      const d = await res.json();
      if (d.failures?.length > 0) {
        setRowErrors(Object.fromEntries(d.failures.map(f => [f.id, f.error])));
        const parts = [];
        if (d.saved   > 0) parts.push(`已儲存 ${d.saved} 筆`);
        if (d.skipped > 0) parts.push(`${d.skipped} 筆鎖定跳過`);
        parts.push(`${d.failures.length} 筆失敗（見紅框）`);
        showToast(parts.join('，'), 'warning');
        fetchRecords();
      } else {
        setRowErrors({});
        const msg = d.skipped > 0 ? `已儲存 ${d.saved} 筆（${d.skipped} 筆鎖定跳過）` : `已儲存 ${d.saved} 筆`;
        showToast(msg, 'success');
        cancelEditMode();
        fetchRecords();
      }
    } catch { showToast('儲存失敗', 'error'); }
    finally { setBatchSaving(false); }
  }

  async function handleLockToggle(action) {
    if (!selectedIds.size) return;
    setLocking(true);
    try {
      const res = await fetch('/api/bnb/batch', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ids: [...selectedIds] }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        showToast(d.message || (action === 'lock' ? '鎖帳失敗' : '解鎖失敗'), 'error');
        return;
      }
      showToast(action === 'lock' ? `已鎖帳 ${selectedIds.size} 筆` : `已解鎖 ${selectedIds.size} 筆`, 'success');
      setSelectedIds(new Set());
      fetchRecords();
    } catch { showToast('操作失敗', 'error'); }
    finally { setLocking(false); }
  }

  // ── 月底批次鎖帳（全月範圍，server-side 查詢，不受前端分頁限制）──
  async function lockAllFilled() {
    setLocking(true);
    try {
      // Step 1: 乾跑 — server 計算全月可鎖筆數與金額不符清單
      const body1 = { action: 'lockAllFilled', importMonth: filterMonth, warehouse: filterWarehouse || undefined };
      const res1 = await fetch('/api/bnb/batch', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body1),
      });
      const d1 = await res1.json().catch(() => ({}));

      if (!res1.ok && res1.status !== 409) {
        showToast(d1.error || '鎖帳失敗', 'error'); return;
      }

      const eligible = d1.eligible ?? d1.locked ?? 0;
      if (eligible === 0) {
        showToast('無可鎖定的記錄（已全部鎖帳或無已填付款記錄）', 'error'); return;
      }

      // Step 2: 若有金額不符，先讓使用者確認
      if (res1.status === 409 && d1.mismatches?.length > 0) {
        const names = d1.mismatches.slice(0, 5).map(r => r.guestName).join('、');
        const extra = d1.mismatches.length > 5 ? `…等 ${d1.mismatches.length} 筆` : '';
        if (!(await confirm(
          `以下 ${d1.mismatches.length} 筆收款金額與房費+消費不符（全月範圍）：\n${names}${extra}\n\n是否仍要繼續鎖帳？`,
          { title: '金額不符警告', danger: false }
        ))) return;
      }

      // Step 3: 最終確認後正式鎖帳
      if (!(await confirm(
        `確定要鎖定 ${filterMonth}${filterWarehouse ? `（${filterWarehouse}）` : '（全館）'} 共 ${eligible} 筆已填付款記錄嗎？`,
        { title: '批次鎖帳確認', danger: true }
      ))) return;

      const res2 = await fetch('/api/bnb/batch', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body1, confirmMismatch: true }),
      });
      const d2 = await res2.json().catch(() => ({}));
      if (!res2.ok) { showToast(d2.error || '鎖帳失敗', 'error'); return; }
      showToast(`已鎖帳 ${d2.locked} 筆（全月範圍）`, 'success');
      fetchRecords();
    } catch { showToast('鎖帳失敗', 'error'); }
    finally { setLocking(false); }
  }

  // ── 逐筆解鎖 ─────────────────────────────────────────────────
  async function handleUnlockRow(id, name) {
    if (!(await confirm(`確定解鎖「${name}」的付款鎖定？解鎖後可重新編輯付款資料。`, { title: '解鎖付款', danger: false }))) return;
    const res = await fetch(`/api/bnb/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paymentLocked: false }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      showToast(err.error || '解鎖失敗', 'error');
      return;
    }
    showToast('已解鎖', 'success');
    fetchRecords();
  }

  // ── 刪除記錄（軟刪除：將狀態改為「已刪除」）──────────────────
  async function handleDelete(id, name) {
    if (!(await confirm(`確定刪除「${name}」的訂房記錄？刪除後可點擊「還原」恢復。`, { title: '刪除訂房記錄', danger: true }))) return;
    const res = await fetch(`/api/bnb/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: '已刪除' }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      showToast(err.error || '刪除失敗', 'error');
      return;
    }
    showToast('已刪除（可點擊「還原」恢復）', 'success');
    fetchRecords();
  }

  // ── 還原已刪除記錄 ──────────────────────────────────────────
  async function handleRestore(id, name) {
    if (!(await confirm(`確定還原「${name}」的訂房記錄？`, { title: '還原訂房記錄', danger: false }))) return;
    const res = await fetch(`/api/bnb/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: '已退房' }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      showToast(err.error || '還原失敗', 'error');
      return;
    }
    showToast('已還原', 'success');
    fetchRecords();
  }

  return {
    // state
    records, setRecords,
    recLoading, recError, recPage, recTotal,
    filterMonth, setFilterMonth,
    filterSource, setFilterSource,
    filterStatus, setFilterStatus,
    filterWarehouse, setFilterWarehouse,
    filterPayment, setFilterPayment,
    pageSize, setPageSize,
    selectedIds, setSelectedIds,
    batchField, setBatchField,
    batchValue, setBatchValue,
    batchApplying,
    inlineEdit, setInlineEdit,
    editMode, editMap, dirtyIds, batchSaving, locking, rowErrors,
    roomNoList,
    auditSummary, auditSummaryLoading, fetchAuditSummary,
    // actions
    fetchRecords,
    handleBatchApply,
    handleInlineSave,
    enterEditMode, cancelEditMode, updateCell, focusPayCell, handlePayKeyDown, saveAllEdits,
    handleLockToggle, lockAllFilled, handleUnlockRow, handleDelete, handleRestore,
  };
}
