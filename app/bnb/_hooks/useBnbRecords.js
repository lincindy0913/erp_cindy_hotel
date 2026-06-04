'use client';

import { useState, useCallback, useMemo } from 'react';
import { useToast } from '@/context/ToastContext';
import { useConfirm } from '@/context/ConfirmContext';
import { todayStr } from '@/lib/localDate';

// ── 付款欄位順序（Excel Tab 跳格用）──────────────────────────────
const PAY_FIELDS = [
  'payDeposit', 'depositDate', 'depositLast5',
  'payTransfer', 'transferDate', 'transferLast5',
  'payCard', 'payCash', 'payVoucher',
];

export function useBnbRecords() {
  const { showToast } = useToast();
  const confirm = useConfirm();

  // ── 訂房明細 state ────────────────────────────────────────────
  const [records,        setRecords]        = useState([]);
  const [recLoading,     setRecLoading]     = useState(false);
  const [recError,       setRecError]       = useState(null);
  const [recPage,        setRecPage]        = useState(1);
  const [recTotal,       setRecTotal]       = useState(0);
  const [filterMonth,    setFilterMonth]    = useState(() => todayStr().slice(0, 7));
  const [filterSource,   setFilterSource]   = useState('');
  const [filterStatus,   setFilterStatus]   = useState('');
  const [filterWarehouse,setFilterWarehouse]= useState('');
  const [filterPayment,  setFilterPayment]  = useState(''); // '' | 'unfilled' | 'filled'

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
  const fetchRecords = useCallback(async (page = 1) => {
    setRecLoading(true);
    try {
      const p = new URLSearchParams({ month: filterMonth, page: String(page), pageSize: '200' });
      if (filterSource)    p.set('source', filterSource);
      if (filterStatus)    p.set('status', filterStatus);
      if (filterWarehouse) p.set('warehouse', filterWarehouse);
      const res = await fetch(`/api/bnb?${p}`);
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
    } catch (e) {
      showToast(`載入訂房記錄失敗：${e.message}`, 'error');
      setRecError(`載入訂房記錄失敗：${e.message}`);
    }
    finally { setRecLoading(false); }
  }, [filterMonth, filterSource, filterStatus, filterWarehouse]);

  // ── 批次套用 ──────────────────────────────────────────────────
  async function handleBatchApply() {
    if (!selectedIds.size || !batchValue) {
      showToast('請選擇狀態', 'error'); return;
    }
    setBatchApplying(true);
    try {
      const results = await Promise.all([...selectedIds].map(id =>
        fetch(`/api/bnb/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: batchValue }),
        })
      ));
      const failed = results.filter(r => !r.ok).length;
      const succeeded = results.length - failed;
      if (failed > 0) {
        showToast(`${succeeded} 筆成功，${failed} 筆失敗`, 'error');
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
        payDeposit:      String(r.payDeposit   > 0 ? r.payDeposit   : ''),
        depositLast5:    r.depositLast5 || '',
        payTransfer:     String(r.payTransfer  > 0 ? r.payTransfer  : ''),
        transferDate:    r.transferDate  || '',
        transferLast5:   r.transferLast5 || '',
        payCard:         String(r.payCard      > 0 ? r.payCard      : ''),
        payCash:         String(r.payCash      > 0 ? r.payCash      : ''),
        cashDestination: r.cashDestination || '',
        payVoucher:      String(r.payVoucher   > 0 ? r.payVoucher   : ''),
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

  // ── 月底批次鎖帳（全部已填付款）────────────────────────────────
  async function lockAllFilled() {
    const eligible = records.filter(r => (r.paymentFilled || r.isComplimentary) && !r.paymentLocked && r.status !== '已刪除');
    if (eligible.length === 0) {
      showToast('無可鎖定的記錄（已全部鎖帳或無已填付款記錄）', 'error');
      return;
    }
    const mismatchList = eligible.filter(r => {
      const pt = Number(r.payDeposit) + Number(r.payTransfer) + Number(r.payCard) + Number(r.payCash) + Number(r.payVoucher);
      const ct = Number(r.roomCharge) + Number(r.otherCharge);
      return Math.abs(pt - ct) > 0.01;
    });
    if (mismatchList.length > 0) {
      const names = mismatchList.slice(0, 5).map(r => r.guestName).join('、');
      const extra = mismatchList.length > 5 ? `…等 ${mismatchList.length} 筆` : '';
      if (!(await confirm(`以下 ${mismatchList.length} 筆收款金額與房費+消費不符：\n${names}${extra}\n\n是否仍要繼續鎖帳？`, { title: '金額不符警告', danger: false }))) return;
    }
    if (!(await confirm(`確定要鎖定本月 ${eligible.length} 筆已填付款記錄嗎？鎖定後僅有鎖帳權限者可修改付款資料。`, { title: '批次鎖帳確認', danger: true }))) return;
    setLocking(true);
    try {
      const res = await fetch('/api/bnb/batch', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'lock', ids: eligible.map(r => r.id) }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { showToast(d.message || '鎖帳失敗', 'error'); return; }
      showToast(`已鎖帳 ${eligible.length} 筆`, 'success');
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
    selectedIds, setSelectedIds,
    batchField, setBatchField,
    batchValue, setBatchValue,
    batchApplying,
    inlineEdit, setInlineEdit,
    editMode, editMap, dirtyIds, batchSaving, locking, rowErrors,
    roomNoList,
    // actions
    fetchRecords,
    handleBatchApply,
    handleInlineSave,
    enterEditMode, cancelEditMode, updateCell, focusPayCell, handlePayKeyDown, saveAllEdits,
    handleLockToggle, lockAllFilled, handleUnlockRow, handleDelete, handleRestore,
  };
}
