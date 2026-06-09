'use client';

import { useState } from 'react';
import { useToast } from '@/context/ToastContext';
import { todayStr } from '@/lib/localDate';

const DEFAULT_WAREHOUSE = '民宿';

export function useBnbImport({ setFilterMonth, fetchRecords }) {
  const { showToast } = useToast();

  const [importMonth,     setImportMonth]     = useState(() => todayStr().slice(0, 7));
  const [importWarehouse, setImportWarehouse] = useState(DEFAULT_WAREHOUSE);
  const [importFile,      setImportFile]      = useState(null);
  const [importReplace,   setImportReplace]   = useState(false);
  const [importPreview,   setImportPreview]   = useState(null);
  const [importResult,    setImportResult]    = useState(null);
  const [importConfirm,   setImportConfirm]   = useState(null);
  const [showImportPanel, setShowImportPanel] = useState(false);
  const [importing,       setImporting]       = useState(false);
  const [importHistory,   setImportHistory]   = useState(() => {
    try { return JSON.parse(localStorage.getItem('bnb_import_history') || '[]'); } catch { return []; }
  });

  async function handleFileSelect(file) {
    setImportFile(file);
    setImportPreview(null);
    setImportResult(null);
    setImportConfirm(null);
    if (!file) return;

    if (importReplace) {
      try {
        const res = await fetch(`/api/bnb/import?importMonth=${importMonth}&warehouse=${encodeURIComponent(importWarehouse)}`);
        const data = await res.json();
        if (data.count > 0) setImportConfirm({ existingCount: data.count });
      } catch (e) { console.warn('[bnb import] pre-check failed:', e.message); }
    }

    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('importMonth', importMonth);
      fd.append('warehouse', importWarehouse);
      fd.append('preview', 'true');
      const res  = await fetch('/api/bnb/import', { method: 'POST', body: fd });
      const data = await res.json();
      if (res.ok && data.preview) {
        setImportPreview(data);
        if (data.detectedMonth && data.detectedMonth !== importMonth) {
          setImportMonth(data.detectedMonth);
        }
      }
    } catch {} // 預覽失敗不阻礙後續操作
  }

  async function handleImport() {
    if (!importFile) { showToast('請選擇檔案', 'error'); return; }
    if (importReplace && importConfirm) return;
    await doImport();
  }

  async function doImport() {
    setImporting(true); setImportResult(null); setImportConfirm(null);
    try {
      const fd = new FormData();
      fd.append('file', importFile);
      fd.append('importMonth', importMonth);
      fd.append('warehouse', importWarehouse);
      fd.append('replace', importReplace ? 'true' : 'false');
      const res  = await fetch('/api/bnb/import', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) { showToast(data.error || data.message || '匯入失敗', 'error'); return; }
      setImportResult(data);
      const msg = `匯入成功：${data.imported} 筆` +
        (data.deleted > 0 ? `，刪除舊資料 ${data.deleted} 筆` : '') +
        (data.skipped > 0 ? `，略過重複 ${data.skipped} 筆` : '');
      showToast(msg, 'success');
      setImportFile(null);
      setImportPreview(null);
      setFilterMonth(importMonth);
      fetchRecords(1);
      const entry = {
        importMonth,
        warehouse: importWarehouse,
        imported:  data.imported,
        deleted:   data.deleted || 0,
        skipped:   data.skipped || 0,
        replace:   importReplace,
        at:        new Date().toLocaleString('zh-TW'),
      };
      setImportHistory(prev => {
        const next = [entry, ...prev].slice(0, 20);
        try { localStorage.setItem('bnb_import_history', JSON.stringify(next)); } catch {}
        return next;
      });
    } catch { showToast('匯入失敗', 'error'); }
    finally { setImporting(false); }
  }

  return {
    importMonth,     setImportMonth,
    importWarehouse, setImportWarehouse,
    importFile,      setImportFile,
    importReplace,   setImportReplace,
    importPreview,   setImportPreview,
    importResult,    setImportResult,
    importConfirm,   setImportConfirm,
    showImportPanel, setShowImportPanel,
    importing,
    importHistory,   setImportHistory,
    handleFileSelect,
    handleImport,
    doImport,
  };
}
