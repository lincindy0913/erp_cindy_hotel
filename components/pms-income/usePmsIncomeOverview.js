'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';

/**
 * 每日匯入總覽（overview）分頁：資料、館別初始化、Excel 帶入 Modal、刪除批次。
 * 匯入 Modal 的 state 仍留在父層，此 hook 只負責觸發 setter。
 */
export function usePmsIncomeOverview({
  activeTab,
  setLoading,
  setError,
  setSuccess,
  WAREHOUSES,
  setWAREHOUSES,
  WAREHOUSES_FALLBACK,
  DEFAULT_PMS_COLUMNS,
  setUploadWarehouse,
  setUploadDate,
  setUploadFileName,
  setUploadRoomCount,
  setUploadOccupancyRate,
  setUploadAvgRoomRate,
  setUploadGuestCount,
  setUploadBreakfastCount,
  setUploadOccupiedRooms,
  setUploadRecords,
  setShowUploadModal,
}) {
  const [overviewYear, setOverviewYear] = useState(() => new Date().getFullYear());
  const [overviewMonth, setOverviewMonth] = useState(() => new Date().getMonth() + 1);
  const [batches, setBatches] = useState([]);
  const [monthlySummary, setMonthlySummary] = useState(null);
  const [excelParsing, setExcelParsing] = useState(false);
  const [overviewBuildings, setOverviewBuildings] = useState([]);
  const [overviewUploadWarehouse, setOverviewUploadWarehouse] = useState(
    () => WAREHOUSES_FALLBACK[0] || '麗格'
  );

  const fetchOverviewData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [batchRes, summaryRes] = await Promise.all([
        fetch(`/api/pms-income/batches?year=${overviewYear}&month=${overviewMonth}`),
        fetch(`/api/pms-income/monthly-summary?year=${overviewYear}&month=${overviewMonth}`),
      ]);
      const batchData = await batchRes.json();
      const summaryData = await summaryRes.json();
      setBatches(Array.isArray(batchData) ? batchData : []);
      setMonthlySummary(summaryData);
    } catch (err) {
      setError('載入資料失敗: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, [overviewYear, overviewMonth, setLoading, setError]);

  useEffect(() => {
    if (activeTab === 'overview') fetchOverviewData();
  }, [activeTab, fetchOverviewData]);

  // Capture the initial warehouse value so the once-on-mount effect below
  // can check it without adding overviewUploadWarehouse to deps (which would
  // cause the warehouse-departments fetch to re-fire on every upload change).
  const initWarehouseRef = useRef(overviewUploadWarehouse);

  useEffect(() => {
    fetch('/api/warehouse-departments')
      .then((r) => r.json())
      .then((data) => {
        const list = Array.isArray(data?.list) ? data.list : [];
        const buildings = list.filter((x) => x.type === 'building').map((x) => x.name);
        const listToUse = buildings.length > 0 ? buildings : WAREHOUSES_FALLBACK;
        setWAREHOUSES(listToUse);
        setOverviewBuildings(listToUse);
        if (!initWarehouseRef.current || !listToUse.includes(initWarehouseRef.current)) {
          setOverviewUploadWarehouse(listToUse[0] || '');
        }
      })
      .catch(() => {
        setOverviewBuildings(WAREHOUSES_FALLBACK);
      });
  }, [WAREHOUSES_FALLBACK, setWAREHOUSES]);

  const buildingList = overviewBuildings.length > 0 ? overviewBuildings : WAREHOUSES;
  const selectedWarehouseForUpload = useMemo(() => {
    if (overviewUploadWarehouse && buildingList.includes(overviewUploadWarehouse)) {
      return overviewUploadWarehouse;
    }
    return buildingList[0] || '麗格';
  }, [overviewUploadWarehouse, buildingList]);

  const handleExcelUpload = useCallback(
    async (file) => {
      if (!file || !file.name) return;
      const ext = (file.name || '').toLowerCase();
      if (!ext.endsWith('.xlsx') && !ext.endsWith('.xls')) {
        setError('請上傳 Excel 檔案（.xlsx 或 .xls）');
        return;
      }
      setExcelParsing(true);
      setError('');
      setSuccess('');
      try {
        const formData = new FormData();
        formData.append('file', file);
        const res = await fetch('/api/pms-income/parse-excel', {
          method: 'POST',
          body: formData,
          credentials: 'include',
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error?.message || data.error || '解析 Excel 失敗');
          setExcelParsing(false);
          return;
        }
        const wh = selectedWarehouseForUpload;
        setUploadWarehouse(wh);
        setUploadDate(data.businessDate || new Date().toISOString().split('T')[0]);
        setUploadFileName(data.fileName || file.name);
        setUploadRoomCount(data.roomCount ?? '');
        setUploadOccupancyRate(data.occupancyRate ?? '');
        setUploadAvgRoomRate(data.avgRoomRate ?? '');
        setUploadGuestCount(data.guestCount ?? '');
        setUploadBreakfastCount(data.breakfastCount ?? '');
        setUploadOccupiedRooms(data.occupiedRooms ?? '');
        if (Array.isArray(data.records) && data.records.length > 0) {
          const excelRecords = data.records.map((r) => ({
            pmsColumnName: r.pmsColumnName,
            entryType: r.entryType,
            accountingCode: r.accountingCode || '',
            accountingName: r.accountingName || '',
            amount: r.amount != null ? String(r.amount) : '',
          }));
          const defaults = DEFAULT_PMS_COLUMNS.filter(
            (d) => !excelRecords.some((e) => e.accountingCode === d.accountingCode && e.entryType === d.entryType)
          ).map((d) => ({ ...d, amount: '' }));
          setUploadRecords([...excelRecords, ...defaults]);
        }
        setShowUploadModal(true);
        setSuccess('已從 Excel 帶入資料，請核對後按「確認匯入」存檔。');
      } catch (err) {
        setError('上傳或解析失敗：' + (err.message || err));
      } finally {
        setExcelParsing(false);
      }
    },
    [
      DEFAULT_PMS_COLUMNS,
      selectedWarehouseForUpload,
      setError,
      setSuccess,
      setUploadAvgRoomRate,
      setUploadBreakfastCount,
      setUploadDate,
      setUploadFileName,
      setUploadGuestCount,
      setUploadOccupancyRate,
      setUploadOccupiedRooms,
      setUploadRecords,
      setUploadRoomCount,
      setUploadWarehouse,
      setShowUploadModal,
    ]
  );

  const handleDeleteBatch = useCallback(
    async (batchId, batchNo) => {
      if (!confirm(`確定要刪除批次 ${batchNo} 及所有相關記錄嗎？`)) return;
      try {
        const res = await fetch(`/api/pms-income/batches/${batchId}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('刪除失敗');
        setSuccess(`已刪除批次 ${batchNo}`);
        fetchOverviewData();
      } catch (err) {
        setError(err.message);
      }
    },
    [fetchOverviewData, setError, setSuccess]
  );

  return {
    overviewYear,
    setOverviewYear,
    overviewMonth,
    setOverviewMonth,
    batches,
    monthlySummary,
    excelParsing,
    overviewBuildings,
    overviewUploadWarehouse,
    setOverviewUploadWarehouse,
    fetchOverviewData,
    handleExcelUpload,
    handleDeleteBatch,
    buildingList,
    selectedWarehouseForUpload,
  };
}
