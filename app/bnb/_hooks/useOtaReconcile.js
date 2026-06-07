'use client';
import { useState, useCallback } from 'react';
import { todayStr } from '@/lib/localDate';

// OTA 比對 + 傭金管理 hook
// setEditBooking — from page (used to open BookingFormModal for OTA add/edit)
export function useOtaReconcile({ showToast, confirm, setEditBooking, DEFAULT_WAREHOUSE }) {
  // ── OTA 比對 state ────────────────────────────────────────────
  const [otaSource,         setOtaSource]         = useState('Booking');
  const [otaDateFrom,       setOtaDateFrom]       = useState('');
  const [otaDateTo,         setOtaDateTo]         = useState('');
  const [otaWarehouse,      setOtaWarehouse]      = useState(DEFAULT_WAREHOUSE);
  const [otaFile,           setOtaFile]           = useState(null);
  const [otaPreview,        setOtaPreview]        = useState(null);
  const [otaPreviewLoading, setOtaPreviewLoading] = useState(false);
  const [otaResult,         setOtaResult]         = useState(null);
  const [otaLoading,        setOtaLoading]        = useState(false);
  const [otaError,          setOtaError]          = useState(null);
  const [otaMonth,          setOtaMonth]          = useState('');
  const [otaViewTab,        setOtaViewTab]        = useState('matched');
  // ── OTA 傭金 state ────────────────────────────────────────────
  const [commAmt,           setCommAmt]           = useState('');
  const [commMethod,        setCommMethod]        = useState('轉帳');
  const [commNote,          setCommNote]          = useState('');
  const [commSubmitting,    setCommSubmitting]    = useState(false);
  const [commExisting,      setCommExisting]      = useState(null);
  const [reconcileConfirmed,  setReconcileConfirmed]  = useState(false);
  const [reconcileConfirming, setReconcileConfirming] = useState(false);
  const [commSource,        setCommSource]        = useState('');
  const [commHistRows,      setCommHistRows]      = useState([]);
  const [commHistLoading,   setCommHistLoading]   = useState(false);
  const [commHistError,     setCommHistError]     = useState(null);
  const [commEditId,        setCommEditId]        = useState(null);
  const [commEditData,      setCommEditData]      = useState({});
  const [commEditSaving,    setCommEditSaving]    = useState(false);
  // ── 比對歷史記錄 ─────────────────────────────────────────────
  const [reconLogs,        setReconLogs]        = useState([]);
  const [reconLogsLoading, setReconLogsLoading] = useState(false);
  const [reconLogsError,   setReconLogsError]   = useState(null);

  // ── 工具：查詢傭金狀態 ─────────────────────────────────────────
  const _checkCommExisting = useCallback(async (month, source, warehouse) => {
    try {
      const p = new URLSearchParams({ month, source, warehouse: warehouse || DEFAULT_WAREHOUSE });
      const chk = await fetch(`/api/bnb/ota-commission?${p}`);
      if (chk.ok) setCommExisting(await chk.json());
    } catch (e) { console.warn('[useOtaReconcile] fetch failed:', e.message); }
  }, [DEFAULT_WAREHOUSE]);

  // ── OTA 解析預覽 ───────────────────────────────────────────────
  const previewOta = useCallback(async () => {
    if (!otaFile) { showToast('請先上傳 OTA 對帳單', 'error'); return; }
    setOtaPreviewLoading(true);
    setOtaPreview(null);
    try {
      const fd = new FormData();
      fd.append('file', otaFile);
      fd.append('source', otaSource);
      fd.append('preview', 'true');
      const res = await fetch('/api/bnb/ota-reconcile', { method: 'POST', body: fd });
      if (!res.ok) { const err = await res.json().catch(() => ({})); showToast(err.message || '解析失敗', 'error'); return; }
      setOtaPreview(await res.json());
    } catch { showToast('解析失敗', 'error'); }
    finally { setOtaPreviewLoading(false); }
  }, [otaFile, otaSource, showToast]);

  // ── OTA 比對執行 ───────────────────────────────────────────────
  const runOtaReconcile = useCallback(async () => {
    if (!otaFile) { showToast('請先上傳 OTA 對帳單', 'error'); return; }
    setOtaLoading(true);
    setOtaResult(null);
    setOtaPreview(null);
    setOtaError(null);
    setReconcileConfirmed(false);
    try {
      const fd = new FormData();
      fd.append('file', otaFile);
      fd.append('source', otaSource);
      if (otaDateFrom) fd.append('dateFrom', otaDateFrom);
      if (otaDateTo)   fd.append('dateTo', otaDateTo);
      if (otaWarehouse) fd.append('warehouse', otaWarehouse);
      const res = await fetch('/api/bnb/ota-reconcile', { method: 'POST', body: fd });
      if (!res.ok) { const err = await res.json().catch(() => ({})); const msg = err.message || 'OTA 比對失敗'; setOtaError(msg); showToast(msg, 'error'); return; }
      const data = await res.json();
      setOtaResult(data);
      setOtaViewTab('matched');
      setCommAmt(data.summary?.otaCommission > 0 ? String(data.summary.otaCommission) : '');
      const month = otaDateFrom ? otaDateFrom.substring(0, 7) : todayStr().slice(0, 7);
      await _checkCommExisting(month, otaSource, otaWarehouse);
    } catch { const msg = 'OTA 比對失敗'; setOtaError(msg); showToast(msg, 'error'); }
    finally { setOtaLoading(false); }
  }, [otaFile, otaSource, otaDateFrom, otaDateTo, otaWarehouse, _checkCommExisting, showToast]);

  // ── 確認比對存檔 ───────────────────────────────────────────────
  const confirmReconcile = useCallback(async () => {
    if (!otaResult) return;
    const month = otaDateFrom ? otaDateFrom.substring(0, 7) : todayStr().slice(0, 7);
    const wh = otaWarehouse || DEFAULT_WAREHOUSE;
    try {
      const chkP = new URLSearchParams({ source: otaSource, warehouse: wh, year: month.substring(0, 4) });
      const chkRes = await fetch(`/api/bnb/ota-reconcile-log?${chkP}`);
      if (chkRes.ok) {
        const chkData = await chkRes.json();
        const existing = (chkData.rows || []).find(r => r.reconcileMonth === month && r.otaSource === otaSource && r.warehouse === wh);
        if (existing) {
          const confirmed = await confirm(
            `${month}（${otaSource} / ${wh}）已有比對記錄（${existing.createdBy || ''}，${new Date(existing.createdAt).toLocaleDateString('zh-TW')}）\n確定要覆蓋此記錄嗎？`,
            { title: '覆蓋確認', danger: false }
          );
          if (!confirmed) return;
        }
      }
    } catch (e) { console.warn('[useOtaReconcile] fetch failed:', e.message); }
    setReconcileConfirming(true);
    try {
      const res = await fetch('/api/bnb/ota-reconcile-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month, source: otaSource, warehouse: wh, result: otaResult }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { showToast(data.error || '存檔失敗', 'error'); return; }
      setReconcileConfirmed(true);
      setCommSource(otaSource);
      showToast('比對結果已確認存檔', 'success');
    } catch { showToast('存檔失敗', 'error'); }
    finally { setReconcileConfirming(false); }
  }, [otaResult, otaSource, otaWarehouse, otaDateFrom, DEFAULT_WAREHOUSE, confirm, showToast]);

  // ── OTA 比對：開啟編輯 ─────────────────────────────────────────
  const openOtaEdit = useCallback(async (bnbId) => {
    try {
      const res = await fetch(`/api/bnb/${bnbId}`);
      if (!res.ok) { showToast('載入訂房記錄失敗', 'error'); return; }
      const record = await res.json();
      if (!record) { showToast('找不到此訂房記錄', 'error'); return; }
      setEditBooking(record);
    } catch { showToast('載入訂房記錄失敗', 'error'); }
  }, [setEditBooking, showToast]);

  // ── OTA 比對：刪除系統記錄 ────────────────────────────────────
  const deleteOtaBnb = useCallback(async (bnbId) => {
    if (!(await confirm('確定要刪除此筆系統訂房記錄嗎？', { title: '刪除系統記錄', danger: true }))) return;
    try {
      const res = await fetch(`/api/bnb/${bnbId}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { showToast(data.error || '刪除失敗', 'error'); return; }
      showToast('已刪除', 'success');
      runOtaReconcile();
    } catch { showToast('刪除失敗', 'error'); }
  }, [runOtaReconcile, confirm, showToast]);

  // ── OTA 比對：新增 OTA 資料 ────────────────────────────────────
  const openOtaAdd = useCallback((otaRow) => {
    setEditBooking({
      id: null,
      guestName:     otaRow.guestName   || '',
      checkInDate:   otaRow.arrival     || '',
      checkOutDate:  otaRow.departure   || '',
      roomCharge:    otaRow.finalAmount || 0,
      source:        otaRow.source      || otaSource,
      reservationNo: otaRow.reservationNo || '',
      warehouse:     otaWarehouse || '',
      status: '已確認',
    });
  }, [otaSource, otaWarehouse, setEditBooking]);

  // ── 比對歷史記錄 ───────────────────────────────────────────────
  const fetchReconLogs = useCallback(async () => {
    setReconLogsLoading(true);
    setReconLogsError(null);
    try {
      const p = new URLSearchParams();
      if (otaWarehouse) p.set('warehouse', otaWarehouse);
      const res = await fetch(`/api/bnb/ota-reconcile-log?${p}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setReconLogs(data.rows || []);
    } catch (e) {
      console.warn('[useOtaReconcile] fetchReconLogs:', e.message);
      setReconLogsError('比對歷史記錄載入失敗，請稍後再試');
      setReconLogs([]);
    } finally { setReconLogsLoading(false); }
  }, [otaWarehouse]);

  // ── 傭金：建立草稿 ────────────────────────────────────────────
  const submitCommission = useCallback(async () => {
    if (!otaResult) return;
    const amt = Number(commAmt);
    if (!amt || amt <= 0) { showToast('請輸入有效的傭金金額', 'error'); return; }
    const month = otaDateFrom ? otaDateFrom.substring(0, 7) : todayStr().slice(0, 7);
    setCommSubmitting(true);
    try {
      const res = await fetch('/api/bnb/ota-commission', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commissionMonth: month, otaSource, warehouse: otaWarehouse || DEFAULT_WAREHOUSE, commissionAmount: amt, paymentMethod: commMethod, note: commNote }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 409) { showToast('此月份傭金已存在，請至「OTA傭金」分頁編輯現有記錄', 'warning'); }
        else { showToast(data.error || '建立失敗', 'error'); }
        return;
      }
      showToast('傭金草稿已建立，請到「OTA傭金」分頁確認金額後送出出納', 'success');
      await _checkCommExisting(month, otaSource, otaWarehouse);
    } catch { showToast('建立失敗', 'error'); }
    finally { setCommSubmitting(false); }
  }, [otaResult, commAmt, commMethod, commNote, otaSource, otaDateFrom, otaWarehouse, DEFAULT_WAREHOUSE, _checkCommExisting, showToast]);

  // ── 傭金：歷史列表 ─────────────────────────────────────────────
  const fetchCommHistory = useCallback(async () => {
    setCommHistLoading(true);
    setCommHistError(null);
    try {
      const p = new URLSearchParams();
      if (otaWarehouse) p.set('warehouse', otaWarehouse);
      if (commSource)   p.set('source', commSource);
      const res = await fetch(`/api/bnb/ota-commission?${p}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setCommHistRows(data.rows || []);
    } catch (e) {
      console.warn('[useOtaReconcile] fetchCommHistory:', e.message);
      setCommHistError('傭金歷史記錄載入失敗，請稍後再試');
      setCommHistRows([]);
    } finally { setCommHistLoading(false); }
  }, [otaWarehouse, commSource]);

  // ── 傭金：確認送出出納 ─────────────────────────────────────────
  const confirmCommission = useCallback(async (id) => {
    if (!(await confirm('確認後將建立付款單並送出出納，確定嗎？', { title: '確認送出出納', danger: false }))) return;
    try {
      const res = await fetch(`/api/bnb/ota-commission?id=${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'confirm' }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { showToast(data.error || '確認失敗', 'error'); return; }
      showToast(`傭金已送出出納（${data.orderNo}）`, 'success');
      fetchCommHistory();
    } catch { showToast('確認失敗', 'error'); }
  }, [fetchCommHistory, confirm, showToast]);

  // ── 傭金：取消 ────────────────────────────────────────────────
  const cancelCommission = useCallback(async (id) => {
    if (!(await confirm('確定要取消此傭金應付款嗎？出納端的待付款單也會一同取消。', { title: '取消傭金應付款', danger: true }))) return;
    try {
      const res = await fetch(`/api/bnb/ota-commission?id=${id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { showToast(data.error || '取消失敗', 'error'); return; }
      showToast('已取消傭金應付款', 'success');
      fetchCommHistory();
      const month = otaDateFrom ? otaDateFrom.substring(0, 7) : todayStr().slice(0, 7);
      await _checkCommExisting(month, otaSource, otaWarehouse);
    } catch { showToast('取消失敗', 'error'); }
  }, [fetchCommHistory, otaSource, otaDateFrom, otaWarehouse, _checkCommExisting, confirm, showToast]);

  // ── 傭金：開始編輯 ─────────────────────────────────────────────
  const startEditComm = useCallback((row) => {
    setCommEditId(row.id);
    setCommEditData({ commissionAmount: String(row.commissionAmount), paymentMethod: row.paymentMethod || '轉帳', note: row.note || '' });
  }, []);

  // ── 傭金：儲存編輯 ─────────────────────────────────────────────
  const saveEditComm = useCallback(async () => {
    if (!commEditId) return;
    setCommEditSaving(true);
    try {
      const res = await fetch(`/api/bnb/ota-commission?id=${commEditId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commissionAmount: parseFloat(commEditData.commissionAmount) || 0, paymentMethod: commEditData.paymentMethod, note: commEditData.note }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { showToast(data.error || '儲存失敗', 'error'); return; }
      showToast('傭金已更新', 'success');
      setCommEditId(null);
      fetchCommHistory();
    } catch { showToast('儲存失敗', 'error'); }
    finally { setCommEditSaving(false); }
  }, [commEditId, commEditData, fetchCommHistory, showToast]);

  return {
    // OTA 比對
    otaSource, setOtaSource, otaDateFrom, setOtaDateFrom, otaDateTo, setOtaDateTo,
    otaWarehouse, setOtaWarehouse, otaFile, setOtaFile, otaPreview, otaPreviewLoading,
    otaResult, otaLoading, otaError, otaMonth, setOtaMonth, otaViewTab, setOtaViewTab,
    previewOta, runOtaReconcile, confirmReconcile,
    reconcileConfirmed, reconcileConfirming,
    openOtaEdit, deleteOtaBnb, openOtaAdd,
    // 比對歷史
    reconLogs, reconLogsLoading, reconLogsError, fetchReconLogs,
    // OTA 傭金
    commAmt, setCommAmt, commMethod, setCommMethod, commNote, setCommNote,
    commSubmitting, commExisting, commSource, setCommSource,
    commHistRows, commHistLoading, commHistError, commEditId, setCommEditId, commEditData, setCommEditData, commEditSaving,
    submitCommission, fetchCommHistory, confirmCommission, cancelCommission,
    startEditComm, saveEditComm,
  };
}
