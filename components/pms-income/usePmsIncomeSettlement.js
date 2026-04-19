'use client';

import { useState, useEffect, useCallback } from 'react';

/**
 * 月度核對結算（settlement）分頁：批次列表、整月核對、批次核對、結算入帳。
 */
export function usePmsIncomeSettlement({ activeTab, setLoading, setError, setSuccess }) {
  const [settlementWarehouse, setSettlementWarehouse] = useState('麗格');
  const [settlementYearMonth, setSettlementYearMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [settlementBatches, setSettlementBatches] = useState([]);
  const [settlementStatus, setSettlementStatus] = useState(null);
  const [settling, setSettling] = useState(false);

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
        setSettlementStatus(Array.isArray(data) && data.length > 0 ? data[0] : null);
      } else {
        setSettlementStatus(null);
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
    if (!confirm(`確定要核對 ${settlementWarehouse} ${settlementYearMonth} 的所有批次嗎？`)) return;
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
  }, [settlementWarehouse, settlementYearMonth, setLoading, setError, setSuccess, fetchSettlementData]);

  const handleSettleMonth = useCallback(async () => {
    if (
      !confirm(
        `確定要結算 ${settlementWarehouse} ${settlementYearMonth} 嗎？\n結算後將自動建立現金流交易（收入、信用卡手續費等）。`
      )
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
        fetchSettlementData();
      } else {
        setError(data.error?.message || data.error || '結算失敗');
      }
    } catch (e) {
      setError(e.message);
    }
    setSettling(false);
  }, [settlementWarehouse, settlementYearMonth, setError, setSuccess, fetchSettlementData]);

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

  return {
    settlementWarehouse,
    setSettlementWarehouse,
    settlementYearMonth,
    setSettlementYearMonth,
    settlementBatches,
    settlementStatus,
    settling,
    fetchSettlementData,
    handleVerifyMonth,
    handleSettleMonth,
    handleVerifyBatches,
  };
}
