'use client';

import { useState, useCallback } from 'react';
import { useToast } from '@/context/ToastContext';
import { todayStr, localDateStr } from '@/lib/localDate';

async function apiErrorMessage(res) {
  try {
    const j = await res.json();
    return j.error?.message || j.error || j.message || `請求失敗（${res.status}）`;
  } catch {
    return `請求失敗（${res.status}）`;
  }
}

export function usePnl() {
  const { showToast } = useToast();

  // ── P&L by Warehouse ─────────────────────────────────────────
  const [pnl, setPnl] = useState(null);
  const [pnlLoading, setPnlLoading] = useState(false);
  const [pnlStart, setPnlStart] = useState(() => {
    const d = new Date(); d.setDate(1); return localDateStr(d);
  });
  const [pnlEnd, setPnlEnd] = useState(() => todayStr());
  const [pnlWarehouse, setPnlWarehouse] = useState('');
  const [pnlTrace, setPnlTrace] = useState(null);
  const [pnlTraceCtx, setPnlTraceCtx] = useState(null);
  const [pnlTraceLoading, setPnlTraceLoading] = useState(false);

  // ── P&L by Supplier ───────────────────────────────────────────
  const [supplierPnl, setSupplierPnl] = useState(null);
  const [supplierPnlLoading, setSupplierPnlLoading] = useState(false);
  const [supplierPnlStart, setSupplierPnlStart] = useState(() => {
    const d = new Date(); d.setDate(1); return localDateStr(d);
  });
  const [supplierPnlEnd, setSupplierPnlEnd] = useState(() => todayStr());
  const [supplierPnlWarehouse, setSupplierPnlWarehouse] = useState('');
  const [supplierPnlSearch, setSupplierPnlSearch] = useState('');

  // ── 損益彙總 ────────────────────────────────────────────────────
  const [pnlSumStart, setPnlSumStart] = useState(() => {
    const d = new Date(); d.setDate(1); return localDateStr(d);
  });
  const [pnlSumEnd, setPnlSumEnd] = useState(() => todayStr());
  const [pnlSumWarehouse, setPnlSumWarehouse] = useState('');
  const [pnlSummaryData, setPnlSummaryData] = useState(null);
  const [pnlSummaryLoading, setPnlSummaryLoading] = useState(false);

  const fetchPnl = useCallback(async () => {
    setPnlLoading(true); setPnl(null);
    try {
      const p = new URLSearchParams({ startDate: pnlStart, endDate: pnlEnd });
      if (pnlWarehouse.trim()) p.set('warehouse', pnlWarehouse.trim());
      const res = await fetch(`/api/analytics/pnl-by-warehouse?${p}`);
      if (!res.ok) {
        showToast(await apiErrorMessage(res), 'error');
        setPnlLoading(false);
        return;
      }
      setPnl(await res.json());
    } catch (e) {
      console.error(e);
      showToast('館別損益查詢失敗，請稍後再試', 'error');
    }
    setPnlLoading(false);
  }, [pnlStart, pnlEnd, pnlWarehouse, showToast]);

  const fetchSupplierPnl = useCallback(async () => {
    setSupplierPnlLoading(true); setSupplierPnl(null);
    try {
      const p = new URLSearchParams({ startDate: supplierPnlStart, endDate: supplierPnlEnd });
      if (supplierPnlWarehouse.trim()) p.set('warehouse', supplierPnlWarehouse.trim());
      const res = await fetch(`/api/analytics/pnl-by-supplier?${p}`);
      if (!res.ok) {
        showToast(await apiErrorMessage(res), 'error');
        setSupplierPnlLoading(false);
        return;
      }
      setSupplierPnl(await res.json());
    } catch (e) {
      console.error(e);
      showToast('廠商損益查詢失敗，請稍後再試', 'error');
    }
    setSupplierPnlLoading(false);
  }, [supplierPnlStart, supplierPnlEnd, supplierPnlWarehouse, showToast]);

  const fetchPnlSummary = useCallback(async () => {
    setPnlSummaryLoading(true);
    setPnlSummaryData(null);
    try {
      const p = new URLSearchParams({ startDate: pnlSumStart, endDate: pnlSumEnd });
      if (pnlSumWarehouse.trim()) p.set('warehouse', pnlSumWarehouse.trim());
      const res = await fetch(`/api/analytics/pnl?${p}`);
      if (!res.ok) {
        showToast(await apiErrorMessage(res), 'error');
        setPnlSummaryLoading(false);
        return;
      }
      setPnlSummaryData(await res.json());
    } catch (e) {
      console.error(e);
      showToast('損益彙總載入失敗，請稍後再試', 'error');
    }
    setPnlSummaryLoading(false);
  }, [pnlSumStart, pnlSumEnd, pnlSumWarehouse, showToast]);

  const fetchPnlTrace = useCallback(async ({ warehouseLabel, flowType, subjectKey }) => {
    setPnlTraceCtx({ warehouseLabel, flowType, subjectKey }); setPnlTrace(null); setPnlTraceLoading(true);
    try {
      const p = new URLSearchParams({ startDate: pnlStart, endDate: pnlEnd, flowType, subjectKey });
      p.set('warehouse', warehouseLabel === '未指定館別' ? '__NULL__' : (pnlWarehouse.trim() || warehouseLabel));
      const res = await fetch(`/api/analytics/pnl-by-warehouse/drilldown?${p}`);
      if (!res.ok) {
        showToast(await apiErrorMessage(res), 'error');
        setPnlTraceLoading(false);
        return;
      }
      setPnlTrace(await res.json());
    } catch (e) {
      console.error(e);
      showToast('明細載入失敗，請稍後再試', 'error');
    }
    setPnlTraceLoading(false);
  }, [pnlStart, pnlEnd, pnlWarehouse, showToast]);

  return {
    pnl, pnlLoading, pnlStart, setPnlStart, pnlEnd, setPnlEnd, pnlWarehouse, setPnlWarehouse,
    pnlTrace, pnlTraceCtx, setPnlTraceCtx, setPnlTrace, pnlTraceLoading,
    fetchPnl, fetchPnlTrace,
    supplierPnl, supplierPnlLoading, supplierPnlStart, setSupplierPnlStart,
    supplierPnlEnd, setSupplierPnlEnd, supplierPnlWarehouse, setSupplierPnlWarehouse,
    supplierPnlSearch, setSupplierPnlSearch, fetchSupplierPnl,
    pnlSumStart, setPnlSumStart, pnlSumEnd, setPnlSumEnd, pnlSumWarehouse, setPnlSumWarehouse,
    pnlSummaryData, pnlSummaryLoading, fetchPnlSummary,
  };
}
