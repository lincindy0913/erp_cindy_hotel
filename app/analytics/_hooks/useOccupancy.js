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

export function useOccupancy() {
  const { showToast } = useToast();

  // ── Occupancy Cost Efficiency ─────────────────────────────────
  const [occCost, setOccCost] = useState(null);
  const [occCostLoading, setOccCostLoading] = useState(false);
  const [occCostStart, setOccCostStart] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 89); return localDateStr(d);
  });
  const [occCostEnd, setOccCostEnd] = useState(() => todayStr());
  const [occCostWarehouse, setOccCostWarehouse] = useState('');
  const [occCostCategory, setOccCostCategory] = useState('');

  // ── 營運入住統計 ────────────────────────────────────────────────
  const [occStatsStart, setOccStatsStart] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 29); return localDateStr(d);
  });
  const [occStatsEnd, setOccStatsEnd] = useState(() => todayStr());
  const [occStatsWarehouse, setOccStatsWarehouse] = useState('');
  const [occStatsGroupBy, setOccStatsGroupBy] = useState('day');
  const [occStatsPayload, setOccStatsPayload] = useState(null);
  const [occStatsLoading, setOccStatsLoading] = useState(false);

  const fetchOccCost = useCallback(async () => {
    setOccCostLoading(true); setOccCost(null);
    try {
      const p = new URLSearchParams({ startDate: occCostStart, endDate: occCostEnd });
      if (occCostWarehouse) p.set('warehouse', occCostWarehouse);
      if (occCostCategory)  p.set('category',  occCostCategory);
      const res = await fetch(`/api/analytics/occupancy-cost?${p}`);
      if (res.ok) setOccCost(await res.json());
      else showToast(await apiErrorMessage(res), 'error');
    } catch (e) { console.error(e); showToast('住宿成本效益查詢失敗，請稍後再試', 'error'); }
    setOccCostLoading(false);
  }, [occCostStart, occCostEnd, occCostWarehouse, occCostCategory, showToast]);

  const fetchOccStats = useCallback(async () => {
    setOccStatsLoading(true);
    try {
      const p = new URLSearchParams({
        startDate: occStatsStart,
        endDate: occStatsEnd,
        groupBy: occStatsGroupBy,
      });
      if (occStatsWarehouse.trim()) p.set('warehouse', occStatsWarehouse.trim());
      const res = await fetch(`/api/analytics/occupancy-stats?${p}`);
      if (!res.ok) {
        showToast(await apiErrorMessage(res), 'error');
        setOccStatsLoading(false);
        return;
      }
      setOccStatsPayload(await res.json());
    } catch (e) {
      console.error(e);
      showToast('營運入住統計載入失敗', 'error');
    }
    setOccStatsLoading(false);
  }, [occStatsStart, occStatsEnd, occStatsWarehouse, occStatsGroupBy, showToast]);

  return {
    occCost, occCostLoading,
    occCostStart, setOccCostStart,
    occCostEnd, setOccCostEnd,
    occCostWarehouse, setOccCostWarehouse,
    occCostCategory, setOccCostCategory,
    fetchOccCost,
    occStatsStart, setOccStatsStart,
    occStatsEnd, setOccStatsEnd,
    occStatsWarehouse, setOccStatsWarehouse,
    occStatsGroupBy, setOccStatsGroupBy,
    occStatsPayload, occStatsLoading,
    fetchOccStats,
  };
}
