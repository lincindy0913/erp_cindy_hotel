'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';

/**
 * 收入記錄（明細 / records）分頁：篩選、列表、排序、住宿摘要、信用卡手續費、同步現金流、刪除明細。
 */
export function usePmsIncomeRecords({
  activeTab,
  setLoading,
  setError,
  setSuccess,
  WAREHOUSES_FALLBACK,
}) {
  const [records, setRecords] = useState([]);
  const [recordsTotal, setRecordsTotal] = useState(0);
  const [recordsPage, setRecordsPage] = useState(1);
  const [recordsLimit] = useState(30);
  const [filterWarehouse, setFilterWarehouse] = useState('');
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');
  const [filterEntryType, setFilterEntryType] = useState('');
  const [filterAccountingCode, setFilterAccountingCode] = useState('');
  const [sortField, setSortField] = useState('businessDate');
  const [sortDir, setSortDir] = useState('desc');

  const [occupancyStats, setOccupancyStats] = useState([]);
  const [occupancyLoading, setOccupancyLoading] = useState(false);

  const [creditCardFees, setCreditCardFees] = useState([]);
  const [creditCardFeeForm, setCreditCardFeeForm] = useState(() => ({
    warehouse: WAREHOUSES_FALLBACK[0] || '麗格',
    settlementDate: new Date().toISOString().split('T')[0],
    feeAmount: '',
    note: '',
  }));
  const [pushToCashflowLoading, setPushToCashflowLoading] = useState(false);

  const fetchRecords = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      params.set('page', recordsPage);
      params.set('limit', recordsLimit);
      if (filterWarehouse) params.set('warehouse', filterWarehouse);
      if (filterStartDate) params.set('startDate', filterStartDate);
      if (filterEndDate) params.set('endDate', filterEndDate);
      if (filterEntryType) params.set('entryType', filterEntryType);
      if (filterAccountingCode) params.set('accountingCode', filterAccountingCode);

      const res = await fetch(`/api/pms-income?${params.toString()}`);
      const data = await res.json();
      setRecords(data.records || []);
      setRecordsTotal(data.total || 0);
    } catch (err) {
      setError('載入記錄失敗: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, [
    recordsPage,
    recordsLimit,
    filterWarehouse,
    filterStartDate,
    filterEndDate,
    filterEntryType,
    filterAccountingCode,
    setLoading,
    setError,
  ]);

  useEffect(() => {
    if (activeTab === 'records') fetchRecords();
  }, [activeTab, fetchRecords]);

  const fetchCreditCardFees = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (filterWarehouse) params.set('warehouse', filterWarehouse);
      if (filterStartDate) params.set('startDate', filterStartDate);
      if (filterEndDate) params.set('endDate', filterEndDate);
      const res = await fetch(`/api/pms-income/credit-card-fees?${params.toString()}`);
      const data = await res.json();
      setCreditCardFees(Array.isArray(data) ? data : []);
    } catch {
      setCreditCardFees([]);
    }
  }, [filterWarehouse, filterStartDate, filterEndDate]);

  useEffect(() => {
    if (activeTab === 'records') fetchCreditCardFees();
  }, [activeTab, fetchCreditCardFees]);

  const fetchOccupancyStats = useCallback(async () => {
    if (!filterStartDate && !filterEndDate) {
      setOccupancyStats([]);
      return;
    }
    setOccupancyLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterWarehouse) params.set('warehouse', filterWarehouse);
      if (filterStartDate) params.set('startDate', filterStartDate);
      if (filterEndDate) params.set('endDate', filterEndDate);
      const res = await fetch(`/api/pms-income/batches?${params.toString()}`);
      const batches = await res.json();
      const list = Array.isArray(batches) ? batches : [];

      const map = new Map();
      for (const b of list) {
        if (!map.has(b.warehouse)) {
          map.set(b.warehouse, {
            warehouse: b.warehouse,
            occupiedRooms: 0,
            guestCount: 0,
            breakfastCount: 0,
            roomCount: 0,
            days: 0,
          });
        }
        const w = map.get(b.warehouse);
        w.occupiedRooms += b.occupiedRooms || 0;
        w.guestCount += b.guestCount || 0;
        w.breakfastCount += b.breakfastCount || 0;
        if (b.roomCount) w.roomCount = b.roomCount;
        w.days += 1;
      }
      setOccupancyStats(Array.from(map.values()));
    } catch {
      setOccupancyStats([]);
    }
    setOccupancyLoading(false);
  }, [filterWarehouse, filterStartDate, filterEndDate]);

  useEffect(() => {
    if (activeTab === 'records') fetchOccupancyStats();
  }, [activeTab, fetchOccupancyStats]);

  const handlePushToCashflow = useCallback(async () => {
    setPushToCashflowLoading(true);
    setError('');
    setSuccess('');
    try {
      const body = {};
      if (filterWarehouse) body.warehouse = filterWarehouse;
      if (filterStartDate) body.startDate = filterStartDate;
      if (filterEndDate) body.endDate = filterEndDate;
      const res = await fetch('/api/pms-income/push-to-cashflow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (res.ok) {
        setSuccess(`已同步 ${data.created} 筆至現金流${data.errors?.length ? '；部分未設定帳戶已略過' : ''}`);
        fetchRecords();
      } else {
        setError(data.error?.message || data.error || '同步失敗');
      }
    } catch (err) {
      setError('同步失敗: ' + err.message);
    } finally {
      setPushToCashflowLoading(false);
    }
  }, [filterWarehouse, filterStartDate, filterEndDate, setError, setSuccess, fetchRecords]);

  const handleSaveCreditCardFee = useCallback(async () => {
    const fee = parseFloat(creditCardFeeForm.feeAmount);
    if (Number.isNaN(fee) || fee < 0) {
      setError('請輸入有效手續費金額');
      return;
    }
    setError('');
    try {
      const res = await fetch('/api/pms-income/credit-card-fees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          warehouse: creditCardFeeForm.warehouse,
          settlementDate: creditCardFeeForm.settlementDate,
          feeAmount: fee,
          note: creditCardFeeForm.note || null,
        }),
      });
      if (res.ok) {
        setSuccess('手續費已儲存');
        setCreditCardFeeForm((prev) => ({ ...prev, feeAmount: '', note: '' }));
        fetchCreditCardFees();
      } else {
        const data = await res.json();
        setError(data.error?.message || data.error || '儲存失敗');
      }
    } catch (err) {
      setError(err.message);
    }
  }, [creditCardFeeForm, setError, setSuccess, fetchCreditCardFees]);

  const handleDeleteRecord = useCallback(
    async (recordId) => {
      if (!confirm('確定要刪除此筆記錄嗎？')) return;
      try {
        const res = await fetch(`/api/pms-income/${recordId}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('刪除失敗');
        setSuccess('記錄已刪除');
        fetchRecords();
      } catch (err) {
        setError(err.message);
      }
    },
    [fetchRecords, setError, setSuccess]
  );

  const handleSort = useCallback((field) => {
    setSortField((prevField) => {
      if (prevField === field) {
        setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
        return prevField;
      }
      setSortDir('desc');
      return field;
    });
  }, []);

  const sortedRecords = useMemo(() => {
    return [...records].sort((a, b) => {
      let va = a[sortField];
      let vb = b[sortField];
      if (typeof va === 'string') {
        const cmp = va.localeCompare(vb);
        return sortDir === 'asc' ? cmp : -cmp;
      }
      return sortDir === 'asc' ? va - vb : vb - va;
    });
  }, [records, sortField, sortDir]);

  return {
    records,
    recordsTotal,
    recordsPage,
    setRecordsPage,
    recordsLimit,
    filterWarehouse,
    setFilterWarehouse,
    filterStartDate,
    setFilterStartDate,
    filterEndDate,
    setFilterEndDate,
    filterEntryType,
    setFilterEntryType,
    filterAccountingCode,
    setFilterAccountingCode,
    occupancyStats,
    occupancyLoading,
    creditCardFees,
    creditCardFeeForm,
    setCreditCardFeeForm,
    pushToCashflowLoading,
    handlePushToCashflow,
    handleSaveCreditCardFee,
    handleDeleteRecord,
    handleSort,
    sortField,
    sortDir,
    sortedRecords,
    fetchRecords,
  };
}
