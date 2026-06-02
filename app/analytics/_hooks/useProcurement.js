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

export function useProcurement() {
  const { showToast } = useToast();

  const [supplierRisk, setSupplierRisk] = useState(null);
  const [supplierLoading, setSupplierLoading] = useState(false);
  const [riskMonth, setRiskMonth] = useState(() => {
    const n = new Date(); return `${n.getFullYear()}${String(n.getMonth() + 1).padStart(2, '0')}`;
  });
  const [procurementSegment, setProcurementSegment] = useState('risk');
  const [procurementStruct, setProcurementStruct] = useState(null);
  const [procurementStructLoading, setProcurementStructLoading] = useState(false);
  const [procStart, setProcStart] = useState(() => {
    const d = new Date(); d.setDate(1); return localDateStr(d);
  });
  const [procEnd, setProcEnd] = useState(() => todayStr());
  const [procWarehouse, setProcWarehouse] = useState('');
  const [pvYearMonth, setPvYearMonth] = useState(() => {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`;
  });
  const [pvWarehouse, setPvWarehouse] = useState('');
  const [pvKeyword, setPvKeyword] = useState('');
  const [pvData, setPvData] = useState(null);
  const [pvLoading, setPvLoading] = useState(false);

  const fetchSupplierRisk = useCallback(async () => {
    setSupplierLoading(true);
    try {
      const res = await fetch(`/api/analytics/supplier-risk?month=${riskMonth}`);
      if (!res.ok) {
        showToast(await apiErrorMessage(res), 'error');
        setSupplierLoading(false);
        return;
      }
      setSupplierRisk(await res.json());
    } catch (e) {
      console.error(e);
      showToast('採購分析載入失敗，請稍後再試', 'error');
    }
    setSupplierLoading(false);
  }, [riskMonth, showToast]);

  const fetchProcurementStruct = useCallback(async () => {
    setProcurementStructLoading(true);
    setProcurementStruct(null);
    try {
      const p = new URLSearchParams({ startDate: procStart, endDate: procEnd });
      if (procWarehouse.trim()) p.set('warehouse', procWarehouse.trim());
      const res = await fetch(`/api/analytics/procurement?${p}`);
      if (!res.ok) {
        showToast(await apiErrorMessage(res), 'error');
        setProcurementStructLoading(false);
        return;
      }
      setProcurementStruct(await res.json());
    } catch (e) {
      console.error(e);
      showToast('採購結構分析載入失敗，請稍後再試', 'error');
    }
    setProcurementStructLoading(false);
  }, [procStart, procEnd, procWarehouse, showToast]);

  const fetchPvBreakfast = useCallback(async () => {
    const ym = (pvYearMonth || '').trim().substring(0, 7);
    if (!ym || ym.length < 7) {
      showToast('請輸入年月（YYYY-MM，例：2026-03）', 'error');
      return;
    }
    setPvLoading(true);
    setPvData(null);
    try {
      const p = new URLSearchParams({ yearMonth: ym });
      if (pvWarehouse.trim()) p.set('warehouse', pvWarehouse.trim());
      if (pvKeyword.trim()) p.set('keyword', pvKeyword.trim());
      const res = await fetch(`/api/analytics/procurement-vs-breakfast?${p}`);
      if (!res.ok) {
        showToast(await apiErrorMessage(res), 'error');
        setPvLoading(false);
        return;
      }
      setPvData(await res.json());
    } catch (e) {
      console.error(e);
      showToast('早餐與採購對照載入失敗', 'error');
    }
    setPvLoading(false);
  }, [pvYearMonth, pvWarehouse, pvKeyword, showToast]);

  return {
    supplierRisk, supplierLoading, riskMonth, setRiskMonth, fetchSupplierRisk,
    procurementSegment, setProcurementSegment,
    procurementStruct, procurementStructLoading,
    procStart, setProcStart, procEnd, setProcEnd, procWarehouse, setProcWarehouse,
    fetchProcurementStruct,
    pvYearMonth, setPvYearMonth, pvWarehouse, setPvWarehouse,
    pvKeyword, setPvKeyword, pvData, pvLoading, fetchPvBreakfast,
  };
}
