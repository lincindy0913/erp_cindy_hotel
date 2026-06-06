'use client';

import { useState, useEffect, useCallback } from 'react';
import { useConfirm } from '@/context/ConfirmContext';

/**
 * 月度核對結算（settlement）分頁：批次列表、整月核對、批次核對、結算入帳。
 */
export function usePmsIncomeSettlement({ activeTab, setLoading, setError, setSuccess }) {
  const confirm = useConfirm();
  const [settlementWarehouse, setSettlementWarehouse] = useState('麗格');
  const [settlementYearMonth, setSettlementYearMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [settlementBatches, setSettlementBatches] = useState([]);
  const [settlementStatus, setSettlementStatus] = useState(null);
  const [settling, setSettling] = useState(false);
  const [pushedCount, setPushedCount] = useState(0);    // PMS2: 已逐筆推送的記錄數
  const [settleResult, setSettleResult] = useState(null); // PMS1: 結算結果（含 skipped）

  const fetchSettlementData = useCallback(async () => {
    setLoading(true);
    try {
      const ym = settlementYearMonth;
      const [y, m] = ym.split('-').map(Number);
      const lastDay = new Date(y, m, 0).getDate();
      const startDate = `${ym}-01`;
      const endDate = `${ym}-${String(lastDay).padStart(2, '0')}`;

      const [batchRes, statusRes] = await Promise.all([
        fetch(`/api/pms-income/batches?warehouse=${settlementWarehouse}&startDate=${startDate}&endDate=${endDate}`),
        fetch(`/api/pms-income/settle?warehouse=${settlementWarehouse}&yearMonth=${ym}`),
      ]);
      if (batchRes.ok) {
        const data = await batchRes.json();
        setSettlementBatches(Array.isArray(data) ? data : []);
      }
      if (statusRes.ok) {
        const data = await statusRes.json();
        // 新格式：{ settlements: [...], pushedCount: N }
        if (data && typeof data === 'object' && 'settlements' in data) {
          setSettlementStatus(data.settlements.length > 0 ? data.settlements[0] : null);
          setPushedCount(data.pushedCount || 0);
        } else {
          // 相容舊格式（純陣列）
          setSettlementStatus(Array.isArray(data) && data.length > 0 ? data[0] : null);
          setPushedCount(0);
        }
      } else {
        setSettlementStatus(null);
        setPushedCount(0);
      }
    } catch {
      /* ignore */
    }
    setLoading(false);
  }, [settlementWarehouse, settlementYearMonth, setLoading]);

  useEffect(() => {
    if (activeTab === 'settlement') fetchSettlementData();
  }, [activeTab, fetchSettlementData]);

  const handleVerifyMonth = useCallback(async () => {
    if (!(await confirm(`確定要核對 ${settlementWarehouse} ${settlementYearMonth} 的所有批次嗎？`, { title: '整月核對', danger: false }))) return;
    setLoading(true);
    try {
      const res = await fetch('/api/pms-income/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'verify_month',
          warehouse: settlementWarehouse,
          yearMonth: settlementYearMonth,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setSuccess(data.message || '核對完成');
        fetchSettlementData();
      } else {
        setError(data.error?.message || data.error || '核對失敗');
      }
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  }, [confirm, settlementWarehouse, settlementYearMonth, setLoading, setError, setSuccess, fetchSettlementData]);

  const handleSettleMonth = useCallback(async () => {
    if (
      !(await confirm(
        `確定要結算 ${settlementWarehouse} ${settlementYearMonth} 嗎？\n結算後將自動建立現金流交易（收入、信用卡手續費等）。`,
        { title: '月結結算', danger: false }
      ))
    )
      return;
    setSettling(true);
    try {
      const res = await fetch('/api/pms-income/settle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          warehouse: settlementWarehouse,
          yearMonth: settlementYearMonth,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setSuccess(data.message || '結算完成');
        setSettleResult(data); // PMS1: 儲存 skipped 清單供 UI 顯示
        fetchSettlementData();
      } else {
        setError(data.error?.message || data.error || '結算失敗');
      }
    } catch (e) {
      setError(e.message);
    }
    setSettling(false);
  }, [confirm, settlementWarehouse, settlementYearMonth, setError, setSuccess, fetchSettlementData]);

  const handleVerifyBatches = useCallback(
    async (batchIds) => {
      try {
        const res = await fetch('/api/pms-income/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'verify_batches', batchIds }),
        });
        const data = await res.json();
        if (res.ok) {
          setSuccess(data.message);
          fetchSettlementData();
        } else {
          setError(data.error?.message || data.error || '核對失敗');
        }
      } catch (e) {
        setError(e.message);
      }
    },
    [setError, setSuccess, fetchSettlementData]
  );

  const handleUnlockMonth = useCallback(async () => {
    if (!(await confirm(
      `確定解除 ${settlementWarehouse} ${settlementYearMonth} 的月結狀態嗎？\n` +
      `系統將自動沖銷結算時建立的現金流交易（以今日日期建立對沖分錄）。`,
      { title: '解除月結', danger: false }
    ))) return;
    setLoading(true);
    try {
      const res = await fetch('/api/pms-income/settle/unlock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ warehouse: settlementWarehouse, yearMonth: settlementYearMonth }),
      });
      const data = await res.json();
      if (res.ok) {
        setSuccess(data.message || '已解除月結');
        fetchSettlementData();
      } else {
        setError(data.error?.message || data.error || '解鎖失敗');
      }
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  }, [confirm, settlementWarehouse, settlementYearMonth, setLoading, setError, setSuccess, fetchSettlementData]);

  return {
    settlementWarehouse,
    setSettlementWarehouse,
    settlementYearMonth,
    setSettlementYearMonth,
    settlementBatches,
    settlementStatus,
    settling,
    pushedCount,
    settleResult,
    fetchSettlementData,
    handleVerifyMonth,
    handleSettleMonth,
    handleVerifyBatches,
    handleUnlockMonth,
  };
}
