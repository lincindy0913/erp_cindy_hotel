'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Navigation from '@/components/Navigation';
import NotificationBanner from '@/components/NotificationBanner';
import ExportButtons from '@/components/ExportButtons';
import { EXPORT_CONFIGS } from '@/lib/export-columns';

const WAREHOUSES = ['麗格', '麗軒', '民宿'];
const TABS = [
  { key: 'overview', label: '每日匯入總覽' },
  { key: 'records', label: '收入記錄明細' },
  { key: 'settlement', label: '月度核對結算' },
  { key: 'statistics', label: '月度統計報表' },
  { key: 'travelAgency', label: '旅行社佣金配置' },
  { key: 'manualCommission', label: '每月手動代訂' },
  { key: 'paymentConfig', label: '收入帳戶設定' },
  { key: 'mapping', label: 'PMS 科目對應設定' }
];

// Default PMS mapping rules for the upload form
const DEFAULT_PMS_COLUMNS = [
  { pmsColumnName: '住房收入', entryType: '貸方', accountingCode: '4111', accountingName: '住房收入' },
  { pmsColumnName: '餐飲收入', entryType: '貸方', accountingCode: '4112', accountingName: '餐飲收入' },
  { pmsColumnName: '其他營業收入', entryType: '貸方', accountingCode: '4113', accountingName: '其他營業收入' },
  { pmsColumnName: '服務費收入', entryType: '貸方', accountingCode: '4114', accountingName: '服務費收入' },
  { pmsColumnName: '代收款-稅金', entryType: '貸方', accountingCode: '2171', accountingName: '代收款-稅金' },
  { pmsColumnName: '預收款', entryType: '借方', accountingCode: '2131', accountingName: '預收款' },
  { pmsColumnName: '應收帳款', entryType: '借方', accountingCode: '1131', accountingName: '應收帳款' },
  { pmsColumnName: '現金收入', entryType: '借方', accountingCode: '1111', accountingName: '現金收入' },
  { pmsColumnName: '信用卡收入', entryType: '借方', accountingCode: '1141', accountingName: '信用卡收入' },
  { pmsColumnName: '轉帳收入', entryType: '借方', accountingCode: '1112', accountingName: '銀行轉帳收入' },
];

function formatNumber(num) {
  if (num === null || num === undefined) return '-';
  return Number(num).toLocaleString('zh-TW', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function formatDate(dateStr) {
  if (!dateStr) return '-';
  return dateStr;
}

export default function PmsIncomePageWrapper() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-gray-500">載入中...</div>}>
      <PmsIncomePage />
    </Suspense>
  );
}

function PmsIncomePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeTab = searchParams.get('tab') || 'overview';

  // Shared state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Overview tab state
  const [overviewYear, setOverviewYear] = useState(new Date().getFullYear());
  const [overviewMonth, setOverviewMonth] = useState(new Date().getMonth() + 1);
  const [batches, setBatches] = useState([]);
  const [monthlySummary, setMonthlySummary] = useState(null);

  // Upload modal state
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadWarehouse, setUploadWarehouse] = useState('麗格');
  const [uploadDate, setUploadDate] = useState(new Date().toISOString().split('T')[0]);
  const [uploadFileName, setUploadFileName] = useState('');
  const [uploadRecords, setUploadRecords] = useState(
    DEFAULT_PMS_COLUMNS.map(col => ({ ...col, amount: '' }))
  );
  const [uploadRoomCount, setUploadRoomCount] = useState('');
  const [uploadOccupancyRate, setUploadOccupancyRate] = useState('');
  const [uploadAvgRoomRate, setUploadAvgRoomRate] = useState('');
  const [uploadSubmitting, setUploadSubmitting] = useState(false);

  // Records tab state
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

  // Manual add record modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState({
    warehouse: '麗格', businessDate: new Date().toISOString().split('T')[0],
    entryType: '貸方', pmsColumnName: '', amount: '', accountingCode: '', accountingName: '', note: ''
  });

  // Statistics tab state
  const [statsYear, setStatsYear] = useState(new Date().getFullYear());
  const [statsMonth, setStatsMonth] = useState('');
  const [statsData, setStatsData] = useState(null);

  // Mapping tab state
  const [mappingRules, setMappingRules] = useState([]);

  // 旅行社佣金配置 (spec26)
  const [travelAgencyConfigs, setTravelAgencyConfigs] = useState([]);
  const [showTravelAgencyModal, setShowTravelAgencyModal] = useState(false);
  const [editingTravelAgency, setEditingTravelAgency] = useState(null);
  const [travelAgencyForm, setTravelAgencyForm] = useState({
    companyName: '', agencyCode: '', commissionPercentage: '', paymentType: 'NONE', dataSource: 'AUTO',
    paymentDueDay: '', paymentMethod: '', isActive: true,
  });

  // 每月手動代訂 (spec26)
  const [manualMonth, setManualMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [manualEntries, setManualEntries] = useState([]);
  const [showManualEntryModal, setShowManualEntryModal] = useState(false);
  const [manualEntryForm, setManualEntryForm] = useState({
    agencyName: '', agencyCode: '', totalRoomRent: '', roomNights: '', commissionPercentage: '',
    commissionAmount: '', arOrAp: 'AP', remarks: '',
  });
  const [editingManualEntry, setEditingManualEntry] = useState(null);
  const [manualAccounts, setManualAccounts] = useState([]);
  const [showConfirmCommissionModal, setShowConfirmCommissionModal] = useState(false);
  const [confirmCommissionForm, setConfirmCommissionForm] = useState({ accountId: '', transactionDate: '' });
  const [selectedManualIds, setSelectedManualIds] = useState([]);

  // Payment method config state（依館別設定）
  const [paymentConfigs, setPaymentConfigs] = useState([]);
  const [paymentConfigAccounts, setPaymentConfigAccounts] = useState([]);
  const [paymentConfigWarehouse, setPaymentConfigWarehouse] = useState('');
  const [paymentConfigBuildings, setPaymentConfigBuildings] = useState([]);

  // Settlement tab state
  const [settlementWarehouse, setSettlementWarehouse] = useState('麗格');
  const [settlementYearMonth, setSettlementYearMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [settlementBatches, setSettlementBatches] = useState([]);
  const [settlementStatus, setSettlementStatus] = useState(null);
  const [settling, setSettling] = useState(false);

  // ========================
  // Tab switching
  // ========================
  const setActiveTab = useCallback((tab) => {
    router.push(`/pms-income?tab=${tab}`, { scroll: false });
  }, [router]);

  // ========================
  // Overview tab data fetching
  // ========================
  const fetchOverviewData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [batchRes, summaryRes] = await Promise.all([
        fetch(`/api/pms-income/batches?year=${overviewYear}&month=${overviewMonth}`),
        fetch(`/api/pms-income/monthly-summary?year=${overviewYear}&month=${overviewMonth}`)
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
  }, [overviewYear, overviewMonth]);

  useEffect(() => {
    if (activeTab === 'overview') fetchOverviewData();
  }, [activeTab, fetchOverviewData]);

  // ========================
  // Records tab data fetching
  // ========================
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
  }, [recordsPage, recordsLimit, filterWarehouse, filterStartDate, filterEndDate, filterEntryType, filterAccountingCode]);

  useEffect(() => {
    if (activeTab === 'records') fetchRecords();
  }, [activeTab, fetchRecords]);

  // ========================
  // Statistics tab data fetching
  // ========================
  const fetchStats = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      let url = `/api/pms-income/monthly-summary?year=${statsYear}`;
      if (statsMonth) url += `&month=${statsMonth}`;
      const res = await fetch(url);
      const data = await res.json();
      setStatsData(data);
    } catch (err) {
      setError('載入統計失敗: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, [statsYear, statsMonth]);

  useEffect(() => {
    if (activeTab === 'statistics') fetchStats();
  }, [activeTab, fetchStats]);

  // ========================
  // Mapping tab data fetching
  // ========================
  const fetchMappingRules = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/pms-income/mapping-rules');
      if (res.ok) {
        const data = await res.json();
        setMappingRules(Array.isArray(data) ? data : []);
      } else {
        // If API doesn't exist yet, use defaults
        setMappingRules(DEFAULT_PMS_COLUMNS.map((col, i) => ({ id: i + 1, ...col, sortOrder: i })));
      }
    } catch {
      // Fallback to defaults
      setMappingRules(DEFAULT_PMS_COLUMNS.map((col, i) => ({ id: i + 1, ...col, sortOrder: i })));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'mapping') fetchMappingRules();
  }, [activeTab, fetchMappingRules]);

  const fetchTravelAgencyConfigs = useCallback(async () => {
    try {
      const res = await fetch('/api/pms-income/travel-agency-config');
      if (res.ok) {
        const data = await res.json();
        setTravelAgencyConfigs(Array.isArray(data) ? data : []);
      }
    } catch { setTravelAgencyConfigs([]); }
  }, []);

  const fetchManualEntries = useCallback(async () => {
    if (!manualMonth) return;
    try {
      const res = await fetch(`/api/pms-income/monthly-manual-commission?month=${manualMonth}`);
      if (res.ok) {
        const data = await res.json();
        setManualEntries(Array.isArray(data) ? data : []);
        setSelectedManualIds([]);
      }
    } catch { setManualEntries([]); }
  }, [manualMonth]);

  const fetchManualAccounts = useCallback(async () => {
    try {
      const res = await fetch('/api/cashflow/accounts');
      if (res.ok) {
        const data = await res.json();
        setManualAccounts(Array.isArray(data) ? data.filter(a => a.isActive) : []);
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (activeTab === 'travelAgency') fetchTravelAgencyConfigs();
  }, [activeTab, fetchTravelAgencyConfigs]);

  useEffect(() => {
    if (activeTab === 'manualCommission') {
      fetchManualEntries();
      fetchManualAccounts();
    }
  }, [activeTab, manualMonth, fetchManualEntries, fetchManualAccounts]);

  // ========================
  // Payment config tab
  // ========================
  const fetchPaymentConfigs = useCallback(async () => {
    try {
      const [cfgRes, acctRes, whRes] = await Promise.all([
        fetch('/api/pms-income/payment-method-config'),
        fetch('/api/cashflow/accounts'),
        fetch('/api/warehouse-departments').catch(() => null)
      ]);
      if (cfgRes.ok) {
        const data = await cfgRes.json();
        setPaymentConfigs(Array.isArray(data) ? data : []);
      }
      if (acctRes.ok) {
        const data = await acctRes.json();
        setPaymentConfigAccounts(Array.isArray(data) ? data.filter(a => a.isActive) : []);
      }
      if (whRes && whRes.ok) {
        const whData = await whRes.json();
        const list = Array.isArray(whData?.list) ? whData.list : [];
        const buildings = list.filter(x => x.type === 'building').map(x => x.name);
        setPaymentConfigBuildings(buildings);
        if (buildings.length > 0) {
          setPaymentConfigWarehouse(prev => (prev && buildings.includes(prev) ? prev : buildings[0]));
        }
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (activeTab === 'paymentConfig') fetchPaymentConfigs();
  }, [activeTab, fetchPaymentConfigs]);

  // ========================
  // Settlement tab
  // ========================
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
        fetch(`/api/pms-income/settle?warehouse=${settlementWarehouse}&yearMonth=${ym}`)
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
    } catch { /* ignore */ }
    setLoading(false);
  }, [settlementWarehouse, settlementYearMonth]);

  useEffect(() => {
    if (activeTab === 'settlement') fetchSettlementData();
  }, [activeTab, fetchSettlementData]);

  async function handleVerifyMonth() {
    if (!confirm(`確定要核對 ${settlementWarehouse} ${settlementYearMonth} 的所有批次嗎？`)) return;
    setLoading(true);
    try {
      const res = await fetch('/api/pms-income/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'verify_month',
          warehouse: settlementWarehouse,
          yearMonth: settlementYearMonth
        })
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
  }

  async function handleSettleMonth() {
    if (!confirm(`確定要結算 ${settlementWarehouse} ${settlementYearMonth} 嗎？\n結算後將自動建立現金流交易（收入、信用卡手續費等）。`)) return;
    setSettling(true);
    try {
      const res = await fetch('/api/pms-income/settle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          warehouse: settlementWarehouse,
          yearMonth: settlementYearMonth
        })
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
  }

  async function handleVerifyBatches(batchIds) {
    try {
      const res = await fetch('/api/pms-income/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'verify_batches', batchIds })
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
  }

  async function handleSavePaymentConfig(cfg) {
    try {
      const payload = { ...cfg, warehouse: paymentConfigWarehouse ?? '' };
      const res = await fetch('/api/pms-income/payment-method-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        setSuccess('已儲存');
        fetchPaymentConfigs();
      } else {
        const data = await res.json();
        setError(data.error?.message || data.error || '儲存失敗');
      }
    } catch (e) {
      setError(e.message);
    }
  }

  // ========================
  // Upload handlers
  // ========================
  const handleUploadRecordChange = (index, field, value) => {
    setUploadRecords(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const handleUploadSubmit = async () => {
    setUploadSubmitting(true);
    setError('');
    setSuccess('');
    try {
      // Filter out records with no amount
      const validRecords = uploadRecords
        .filter(r => r.amount !== '' && r.amount !== null && r.amount !== undefined)
        .map(r => ({
          pmsColumnName: r.pmsColumnName,
          entryType: r.entryType,
          amount: parseFloat(r.amount),
          accountingCode: r.accountingCode,
          accountingName: r.accountingName
        }));

      if (validRecords.length === 0) {
        setError('請至少輸入一筆金額');
        setUploadSubmitting(false);
        return;
      }

      const creditTotal = validRecords.filter(r => r.entryType === '貸方').reduce((s, r) => s + r.amount, 0);
      const debitTotal = validRecords.filter(r => r.entryType === '借方').reduce((s, r) => s + r.amount, 0);

      const body = {
        warehouse: uploadWarehouse,
        businessDate: uploadDate,
        fileName: uploadFileName || `PMS_${uploadWarehouse}_${uploadDate}.xlsx`,
        records: validRecords,
        creditTotal,
        debitTotal,
        difference: creditTotal - debitTotal,
        roomCount: uploadRoomCount ? parseInt(uploadRoomCount) : null,
        occupancyRate: uploadOccupancyRate ? parseFloat(uploadOccupancyRate) : null,
        avgRoomRate: uploadAvgRoomRate ? parseFloat(uploadAvgRoomRate) : null
      };

      const res = await fetch('/api/pms-income/batches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || '匯入失敗');
      }

      const result = await res.json();
      setSuccess(`匯入成功！批次號: ${result.batchNo}，共 ${result.recordCount} 筆${result.isReplacement ? ' (已覆蓋舊資料)' : ''}`);
      setShowUploadModal(false);
      resetUploadForm();
      fetchOverviewData();
    } catch (err) {
      setError(err.message);
    } finally {
      setUploadSubmitting(false);
    }
  };

  const resetUploadForm = () => {
    setUploadWarehouse('麗格');
    setUploadDate(new Date().toISOString().split('T')[0]);
    setUploadFileName('');
    setUploadRecords(DEFAULT_PMS_COLUMNS.map(col => ({ ...col, amount: '' })));
    setUploadRoomCount('');
    setUploadOccupancyRate('');
    setUploadAvgRoomRate('');
  };

  // ========================
  // Delete batch handler
  // ========================
  const handleDeleteBatch = async (batchId, batchNo) => {
    if (!confirm(`確定要刪除批次 ${batchNo} 及所有相關記錄嗎？`)) return;
    try {
      const res = await fetch(`/api/pms-income/batches/${batchId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('刪除失敗');
      setSuccess(`已刪除批次 ${batchNo}`);
      fetchOverviewData();
    } catch (err) {
      setError(err.message);
    }
  };

  // ========================
  // Add record handler
  // ========================
  const handleAddRecord = async () => {
    setError('');
    try {
      const res = await fetch('/api/pms-income', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...addForm,
          amount: parseFloat(addForm.amount)
        })
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || '新增失敗');
      }
      setSuccess('手動新增成功');
      setShowAddModal(false);
      setAddForm({
        warehouse: '麗格', businessDate: new Date().toISOString().split('T')[0],
        entryType: '貸方', pmsColumnName: '', amount: '', accountingCode: '', accountingName: '', note: ''
      });
      fetchRecords();
    } catch (err) {
      setError(err.message);
    }
  };

  // ========================
  // Delete record handler
  // ========================
  const handleDeleteRecord = async (recordId) => {
    if (!confirm('確定要刪除此筆記錄嗎？')) return;
    try {
      const res = await fetch(`/api/pms-income/${recordId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('刪除失敗');
      setSuccess('記錄已刪除');
      fetchRecords();
    } catch (err) {
      setError(err.message);
    }
  };

  // ========================
  // Sort handler for records
  // ========================
  const handleSort = (field) => {
    if (sortField === field) {
      setSortDir(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  };

  // Client-side sort for the current page (since API already sorts by businessDate desc)
  const sortedRecords = [...records].sort((a, b) => {
    let va = a[sortField];
    let vb = b[sortField];
    if (typeof va === 'string') {
      const cmp = va.localeCompare(vb);
      return sortDir === 'asc' ? cmp : -cmp;
    }
    return sortDir === 'asc' ? va - vb : vb - va;
  });

  // ========================
  // Calendar grid for overview
  // ========================
  const renderCalendarGrid = () => {
    if (!monthlySummary) return null;
    const daysInMonth = new Date(overviewYear, overviewMonth, 0).getDate();
    const monthStr = String(overviewMonth).padStart(2, '0');

    // Build import status per day per warehouse
    const importStatus = {};
    for (const batch of batches) {
      const key = `${batch.warehouse}|${batch.businessDate}`;
      importStatus[key] = batch;
    }

    const days = [];
    for (let d = 1; d <= daysInMonth; d++) {
      days.push(`${overviewYear}-${monthStr}-${String(d).padStart(2, '0')}`);
    }

    return (
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-teal-50">
              <th className="border border-gray-200 px-3 py-2 text-left font-medium text-teal-800 sticky left-0 bg-teal-50 z-10">日期</th>
              {WAREHOUSES.map(wh => (
                <th key={wh} className="border border-gray-200 px-3 py-2 text-center font-medium text-teal-800 min-w-[100px]">{wh}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {days.map(date => {
              const dayNum = parseInt(date.split('-')[2]);
              const dayOfWeek = new Date(date).getDay();
              const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
              const isFuture = date > new Date().toISOString().split('T')[0];
              return (
                <tr key={date} className={`${isWeekend ? 'bg-gray-50' : ''} ${isFuture ? 'opacity-40' : ''} hover:bg-teal-50/50`}>
                  <td className="border border-gray-200 px-3 py-1.5 font-mono text-xs sticky left-0 bg-white z-10">
                    {dayNum}日 ({['日','一','二','三','四','五','六'][dayOfWeek]})
                  </td>
                  {WAREHOUSES.map(wh => {
                    const key = `${wh}|${date}`;
                    const batch = importStatus[key];
                    return (
                      <td key={wh} className="border border-gray-200 px-3 py-1.5 text-center">
                        {batch ? (
                          <div className="flex items-center justify-center gap-1">
                            <span className="text-green-600 font-bold text-base">&#10003;</span>
                            <span className="text-xs text-gray-500">{formatNumber(batch.creditTotal)}</span>
                          </div>
                        ) : isFuture ? (
                          <span className="text-gray-300">-</span>
                        ) : (
                          <span className="text-red-500 font-bold text-base">&#10007;</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  // ========================
  // Statistics bar chart (pure CSS)
  // ========================
  const renderStatsChart = () => {
    if (!statsData) return null;

    // If single month detail
    if (statsData.byAccountingCode) {
      const items = statsData.byAccountingCode;
      if (items.length === 0) return <p className="text-gray-500 text-center py-8">無資料</p>;
      const maxVal = Math.max(...items.map(i => Math.abs(i.net)));

      return (
        <div className="space-y-3">
          {items.map((item, i) => {
            const pct = maxVal > 0 ? (Math.abs(item.net) / maxVal * 100) : 0;
            const isPositive = item.net >= 0;
            return (
              <div key={i} className="flex items-center gap-3">
                <div className="w-32 text-right text-sm text-gray-700 truncate" title={item.accountingName}>
                  {item.accountingCode} {item.accountingName}
                </div>
                <div className="flex-1 bg-gray-100 rounded-full h-6 relative overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${isPositive ? 'bg-teal-500' : 'bg-amber-500'}`}
                    style={{ width: `${Math.max(pct, 2)}%` }}
                  />
                  <span className="absolute inset-0 flex items-center justify-center text-xs font-medium">
                    {formatNumber(item.net)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      );
    }

    // Year overview: 12 months
    if (Array.isArray(statsData)) {
      const maxTotal = Math.max(...statsData.map(m => Math.abs(m.total)), 1);

      return (
        <div className="space-y-2">
          {statsData.map((m, i) => {
            const pct = maxTotal > 0 ? (Math.abs(m.total) / maxTotal * 100) : 0;
            return (
              <div key={i} className="flex items-center gap-3">
                <div className="w-16 text-right text-sm font-medium text-gray-700">{m.month}月</div>
                <div className="flex-1 bg-gray-100 rounded-full h-7 relative overflow-hidden">
                  <div
                    className="h-full rounded-full bg-teal-500 transition-all"
                    style={{ width: `${Math.max(pct, 1)}%` }}
                  />
                  <span className="absolute inset-0 flex items-center justify-center text-xs font-medium">
                    {formatNumber(m.total)} ({m.importedDays}/{m.totalDays}天)
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      );
    }

    return null;
  };

  // ========================
  // Upload modal component
  // ========================
  const renderUploadModal = () => {
    if (!showUploadModal) return null;

    const creditRecords = uploadRecords.filter(r => r.entryType === '貸方');
    const debitRecords = uploadRecords.filter(r => r.entryType === '借方');
    const creditTotal = creditRecords.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);
    const debitTotal = debitRecords.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);

    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
          <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between z-10">
            <h3 className="text-lg font-bold text-teal-800">匯入 PMS 日報表</h3>
            <button onClick={() => { setShowUploadModal(false); resetUploadForm(); }} className="text-gray-400 hover:text-gray-600 text-2xl">&times;</button>
          </div>

          <div className="p-6 space-y-5">
            {/* Basic info */}
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">館別</label>
                <select value={uploadWarehouse} onChange={e => setUploadWarehouse(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500">
                  {WAREHOUSES.map(w => <option key={w} value={w}>{w}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">營業日期</label>
                <input type="date" value={uploadDate} onChange={e => setUploadDate(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">檔案名稱</label>
                <input type="text" value={uploadFileName} onChange={e => setUploadFileName(e.target.value)}
                  placeholder="PMS_report.xlsx"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500" />
              </div>
            </div>

            {/* Room info */}
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">房間數</label>
                <input type="number" value={uploadRoomCount} onChange={e => setUploadRoomCount(e.target.value)}
                  placeholder="0" min="0"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">住房率 (%)</label>
                <input type="number" value={uploadOccupancyRate} onChange={e => setUploadOccupancyRate(e.target.value)}
                  placeholder="0.00" step="0.01" min="0" max="100"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">平均房價</label>
                <input type="number" value={uploadAvgRoomRate} onChange={e => setUploadAvgRoomRate(e.target.value)}
                  placeholder="0" step="1" min="0"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500" />
              </div>
            </div>

            {/* Credit (貸方) entries */}
            <div>
              <h4 className="text-sm font-bold text-teal-700 mb-2 border-b border-teal-200 pb-1">貸方科目 (收入)</h4>
              <div className="space-y-2">
                {uploadRecords.map((rec, idx) => {
                  if (rec.entryType !== '貸方') return null;
                  return (
                    <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                      <div className="col-span-3 text-sm text-gray-700">{rec.pmsColumnName}</div>
                      <div className="col-span-2 text-xs text-gray-500">{rec.accountingCode}</div>
                      <div className="col-span-3 text-xs text-gray-500">{rec.accountingName}</div>
                      <div className="col-span-4">
                        <input type="number" value={rec.amount} step="1" min="0"
                          onChange={e => handleUploadRecordChange(idx, 'amount', e.target.value)}
                          placeholder="金額"
                          className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm text-right focus:ring-1 focus:ring-teal-500 focus:border-teal-500" />
                      </div>
                    </div>
                  );
                })}
                <div className="text-right text-sm font-bold text-teal-700 pr-1">
                  貸方合計: {formatNumber(creditTotal)}
                </div>
              </div>
            </div>

            {/* Debit (借方) entries */}
            <div>
              <h4 className="text-sm font-bold text-amber-700 mb-2 border-b border-amber-200 pb-1">借方科目 (資產/支出)</h4>
              <div className="space-y-2">
                {uploadRecords.map((rec, idx) => {
                  if (rec.entryType !== '借方') return null;
                  return (
                    <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                      <div className="col-span-3 text-sm text-gray-700">{rec.pmsColumnName}</div>
                      <div className="col-span-2 text-xs text-gray-500">{rec.accountingCode}</div>
                      <div className="col-span-3 text-xs text-gray-500">{rec.accountingName}</div>
                      <div className="col-span-4">
                        <input type="number" value={rec.amount} step="1" min="0"
                          onChange={e => handleUploadRecordChange(idx, 'amount', e.target.value)}
                          placeholder="金額"
                          className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm text-right focus:ring-1 focus:ring-teal-500 focus:border-teal-500" />
                      </div>
                    </div>
                  );
                })}
                <div className="text-right text-sm font-bold text-amber-700 pr-1">
                  借方合計: {formatNumber(debitTotal)}
                </div>
              </div>
            </div>

            {/* Difference */}
            <div className={`text-right text-sm font-bold px-3 py-2 rounded ${Math.abs(creditTotal - debitTotal) < 0.01 ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
              差額 (貸-借): {formatNumber(creditTotal - debitTotal)}
              {Math.abs(creditTotal - debitTotal) < 0.01 ? ' (平衡)' : ' (不平衡)'}
            </div>

            {error && <div className="text-red-600 text-sm bg-red-50 px-3 py-2 rounded">{error}</div>}

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => { setShowUploadModal(false); resetUploadForm(); }}
                className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">
                取消
              </button>
              <button onClick={handleUploadSubmit} disabled={uploadSubmitting}
                className="px-6 py-2 text-sm bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed">
                {uploadSubmitting ? '匯入中...' : '確認匯入'}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // ========================
  // Add record modal component
  // ========================
  const renderAddModal = () => {
    if (!showAddModal) return null;

    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg">
          <div className="border-b px-6 py-4 flex items-center justify-between">
            <h3 className="text-lg font-bold text-teal-800">手動新增收入記錄</h3>
            <button onClick={() => setShowAddModal(false)} className="text-gray-400 hover:text-gray-600 text-2xl">&times;</button>
          </div>

          <div className="p-6 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">館別 *</label>
                <select value={addForm.warehouse} onChange={e => setAddForm(p => ({ ...p, warehouse: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500">
                  {WAREHOUSES.map(w => <option key={w} value={w}>{w}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">營業日期 *</label>
                <input type="date" value={addForm.businessDate} onChange={e => setAddForm(p => ({ ...p, businessDate: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">借貸方 *</label>
                <select value={addForm.entryType} onChange={e => setAddForm(p => ({ ...p, entryType: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500">
                  <option value="貸方">貸方</option>
                  <option value="借方">借方</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">PMS 欄位名 *</label>
                <input type="text" value={addForm.pmsColumnName} onChange={e => setAddForm(p => ({ ...p, pmsColumnName: e.target.value }))}
                  placeholder="例: 住房收入"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500" />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">金額 *</label>
                <input type="number" value={addForm.amount} step="1" min="0"
                  onChange={e => setAddForm(p => ({ ...p, amount: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-right focus:ring-2 focus:ring-teal-500 focus:border-teal-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">科目代碼 *</label>
                <input type="text" value={addForm.accountingCode} onChange={e => setAddForm(p => ({ ...p, accountingCode: e.target.value }))}
                  placeholder="4111"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">科目名稱 *</label>
                <input type="text" value={addForm.accountingName} onChange={e => setAddForm(p => ({ ...p, accountingName: e.target.value }))}
                  placeholder="住房收入"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500" />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">備註</label>
              <input type="text" value={addForm.note} onChange={e => setAddForm(p => ({ ...p, note: e.target.value }))}
                placeholder="選填"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500" />
            </div>

            {error && <div className="text-red-600 text-sm bg-red-50 px-3 py-2 rounded">{error}</div>}

            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setShowAddModal(false)}
                className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">取消</button>
              <button onClick={handleAddRecord}
                className="px-6 py-2 text-sm bg-teal-600 text-white rounded-lg hover:bg-teal-700">確認新增</button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // ========================
  // Pagination component
  // ========================
  const totalPages = Math.ceil(recordsTotal / recordsLimit);
  const renderPagination = () => {
    if (totalPages <= 1) return null;
    const pages = [];
    const start = Math.max(1, recordsPage - 2);
    const end = Math.min(totalPages, recordsPage + 2);
    for (let p = start; p <= end; p++) pages.push(p);

    return (
      <div className="flex items-center justify-between mt-4">
        <span className="text-sm text-gray-600">
          共 {recordsTotal} 筆，第 {recordsPage}/{totalPages} 頁
        </span>
        <div className="flex gap-1">
          <button onClick={() => setRecordsPage(1)} disabled={recordsPage === 1}
            className="px-2 py-1 text-xs border rounded disabled:opacity-30 hover:bg-gray-100">首頁</button>
          <button onClick={() => setRecordsPage(p => Math.max(1, p - 1))} disabled={recordsPage === 1}
            className="px-2 py-1 text-xs border rounded disabled:opacity-30 hover:bg-gray-100">上一頁</button>
          {pages.map(p => (
            <button key={p} onClick={() => setRecordsPage(p)}
              className={`px-3 py-1 text-xs border rounded ${p === recordsPage ? 'bg-teal-600 text-white border-teal-600' : 'hover:bg-gray-100'}`}>
              {p}
            </button>
          ))}
          <button onClick={() => setRecordsPage(p => Math.min(totalPages, p + 1))} disabled={recordsPage === totalPages}
            className="px-2 py-1 text-xs border rounded disabled:opacity-30 hover:bg-gray-100">下一頁</button>
          <button onClick={() => setRecordsPage(totalPages)} disabled={recordsPage === totalPages}
            className="px-2 py-1 text-xs border rounded disabled:opacity-30 hover:bg-gray-100">末頁</button>
        </div>
      </div>
    );
  };

  // ========================
  // Sort indicator
  // ========================
  const SortIcon = ({ field }) => {
    if (sortField !== field) return <span className="text-gray-300 ml-1">&#8597;</span>;
    return <span className="text-teal-600 ml-1">{sortDir === 'asc' ? '&#9650;' : '&#9660;'}</span>;
  };

  // Clear messages after 5 seconds
  useEffect(() => {
    if (success) {
      const t = setTimeout(() => setSuccess(''), 5000);
      return () => clearTimeout(t);
    }
  }, [success]);

  useEffect(() => {
    if (error && !showUploadModal && !showAddModal) {
      const t = setTimeout(() => setError(''), 8000);
      return () => clearTimeout(t);
    }
  }, [error, showUploadModal, showAddModal]);

  return (
    <div className="min-h-screen page-bg-pms-income">
      <Navigation borderColor="border-teal-500" />
      <NotificationBanner moduleFilter="pms-income" />

      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Page header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-teal-800">PMS 收入管理</h2>
            <p className="text-sm text-gray-600 mt-1">管理飯店 PMS 系統日報表的匯入與收入記錄</p>
            <div className="flex items-center gap-2 text-xs text-gray-400 mt-1">
              <span className="w-2 h-2 rounded-full bg-green-400"></span>
              <span>快取啟用中</span>
            </div>
          </div>
          {activeTab === 'records' && (
            <ExportButtons
              data={records}
              columns={EXPORT_CONFIGS.pmsIncome.columns}
              exportName={EXPORT_CONFIGS.pmsIncome.filename}
              title="PMS 收入記錄"
              sheetName="收入記錄"
            />
          )}
        </div>

        {/* Success/Error messages */}
        {success && (
          <div className="mb-4 px-4 py-3 bg-green-50 border border-green-200 text-green-700 rounded-lg text-sm flex items-center justify-between">
            <span>{success}</span>
            <button onClick={() => setSuccess('')} className="text-green-500 hover:text-green-700">&times;</button>
          </div>
        )}
        {error && !showUploadModal && !showAddModal && (
          <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError('')} className="text-red-500 hover:text-red-700">&times;</button>
          </div>
        )}

        {/* Tab navigation */}
        <div className="flex gap-1 mb-6 border-b border-gray-200">
          {TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors ${
                activeTab === tab.key
                  ? 'bg-teal-600 text-white border-b-2 border-teal-600'
                  : 'text-gray-600 hover:text-teal-700 hover:bg-teal-50'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* ============================== */}
        {/* Tab 1: Overview */}
        {/* ============================== */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Month selector + Upload button */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <select value={overviewYear} onChange={e => setOverviewYear(parseInt(e.target.value))}
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-teal-500">
                  {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}年</option>)}
                </select>
                <select value={overviewMonth} onChange={e => setOverviewMonth(parseInt(e.target.value))}
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-teal-500">
                  {Array.from({ length: 12 }, (_, i) => i + 1).map(m => <option key={m} value={m}>{m}月</option>)}
                </select>
                <button onClick={fetchOverviewData}
                  className="px-3 py-2 text-sm border border-teal-300 text-teal-700 rounded-lg hover:bg-teal-50">
                  重新整理
                </button>
                <div className="flex items-center gap-1.5 text-xs text-gray-400 ml-2">
                  <span className="w-2 h-2 rounded-full bg-green-400 inline-block"></span>
                  <span>快取啟用中</span>
                </div>
              </div>
              <button onClick={() => setShowUploadModal(true)}
                className="px-4 py-2 text-sm bg-teal-600 text-white rounded-lg hover:bg-teal-700 flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
                匯入 PMS 日報表
              </button>
            </div>

            {/* Summary cards */}
            {monthlySummary && (
              <div className="grid grid-cols-4 gap-4">
                <div className="bg-white rounded-lg shadow-sm border border-teal-100 p-4">
                  <div className="text-xs text-gray-500 mb-1">本月淨收入</div>
                  <div className="text-xl font-bold text-teal-700">{formatNumber(monthlySummary.total)}</div>
                </div>
                <div className="bg-white rounded-lg shadow-sm border border-teal-100 p-4">
                  <div className="text-xs text-gray-500 mb-1">已匯入天數</div>
                  <div className="text-xl font-bold text-teal-700">{monthlySummary.importedDays} / {monthlySummary.totalDays}</div>
                </div>
                {Object.entries(monthlySummary.byWarehouse || {}).map(([wh, data]) => (
                  <div key={wh} className="bg-white rounded-lg shadow-sm border border-teal-100 p-4">
                    <div className="text-xs text-gray-500 mb-1">{wh} 貸方合計</div>
                    <div className="text-xl font-bold text-teal-700">{formatNumber(data.credit)}</div>
                    <div className="text-xs text-gray-400">{data.importedDays} 天已匯入</div>
                  </div>
                ))}
              </div>
            )}

            {/* Calendar grid */}
            <div className="bg-white rounded-lg shadow-sm border p-4">
              <h3 className="text-sm font-bold text-gray-700 mb-3">每日匯入狀態</h3>
              {loading ? (
                <div className="text-center py-8 text-gray-400">載入中...</div>
              ) : (
                renderCalendarGrid()
              )}
            </div>

            {/* Batch list */}
            <div className="bg-white rounded-lg shadow-sm border p-4">
              <h3 className="text-sm font-bold text-gray-700 mb-3">匯入批次列表</h3>
              {batches.length === 0 ? (
                <p className="text-gray-400 text-center py-4">本月尚無匯入批次</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 text-left">
                        <th className="px-3 py-2 font-medium">批次號</th>
                        <th className="px-3 py-2 font-medium">館別</th>
                        <th className="px-3 py-2 font-medium">營業日期</th>
                        <th className="px-3 py-2 font-medium">檔案名稱</th>
                        <th className="px-3 py-2 font-medium text-right">貸方合計</th>
                        <th className="px-3 py-2 font-medium text-right">借方合計</th>
                        <th className="px-3 py-2 font-medium text-right">差額</th>
                        <th className="px-3 py-2 font-medium text-center">筆數</th>
                        <th className="px-3 py-2 font-medium text-center">狀態</th>
                        <th className="px-3 py-2 font-medium">匯入時間</th>
                        <th className="px-3 py-2 font-medium text-center">操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {batches.map(batch => (
                        <tr key={batch.id} className="border-t hover:bg-gray-50">
                          <td className="px-3 py-2 font-mono text-xs">{batch.batchNo}</td>
                          <td className="px-3 py-2">{batch.warehouse}</td>
                          <td className="px-3 py-2">{formatDate(batch.businessDate)}</td>
                          <td className="px-3 py-2 text-xs text-gray-600 max-w-[150px] truncate">{batch.fileName}</td>
                          <td className="px-3 py-2 text-right text-teal-700 font-medium">{formatNumber(batch.creditTotal)}</td>
                          <td className="px-3 py-2 text-right text-amber-700 font-medium">{formatNumber(batch.debitTotal)}</td>
                          <td className={`px-3 py-2 text-right font-medium ${Math.abs(batch.difference) < 0.01 ? 'text-green-600' : 'text-red-600'}`}>
                            {formatNumber(batch.difference)}
                          </td>
                          <td className="px-3 py-2 text-center">{batch.recordCount}</td>
                          <td className="px-3 py-2 text-center">
                            <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                              batch.status === '已結算' ? 'bg-green-100 text-green-700' :
                              batch.status === '已核對' ? 'bg-blue-100 text-blue-700' :
                              'bg-yellow-100 text-yellow-700'
                            }`}>{batch.status}</span>
                          </td>
                          <td className="px-3 py-2 text-xs text-gray-500">
                            {batch.importedAt ? new Date(batch.importedAt).toLocaleString('zh-TW') : '-'}
                          </td>
                          <td className="px-3 py-2 text-center">
                            <button onClick={() => handleDeleteBatch(batch.id, batch.batchNo)}
                              className="text-red-500 hover:text-red-700 text-xs hover:underline">
                              刪除
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ============================== */}
        {/* Tab 2: Records */}
        {/* ============================== */}
        {activeTab === 'records' && (
          <div className="space-y-4">
            {/* Filters */}
            <div className="bg-white rounded-lg shadow-sm border p-4">
              <div className="flex flex-wrap gap-3 items-end">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">館別</label>
                  <select value={filterWarehouse} onChange={e => { setFilterWarehouse(e.target.value); setRecordsPage(1); }}
                    className="border border-gray-300 rounded px-2 py-1.5 text-sm min-w-[100px]">
                    <option value="">全部</option>
                    {WAREHOUSES.map(w => <option key={w} value={w}>{w}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">起始日期</label>
                  <input type="date" value={filterStartDate} onChange={e => { setFilterStartDate(e.target.value); setRecordsPage(1); }}
                    className="border border-gray-300 rounded px-2 py-1.5 text-sm" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">結束日期</label>
                  <input type="date" value={filterEndDate} onChange={e => { setFilterEndDate(e.target.value); setRecordsPage(1); }}
                    className="border border-gray-300 rounded px-2 py-1.5 text-sm" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">借貸方</label>
                  <select value={filterEntryType} onChange={e => { setFilterEntryType(e.target.value); setRecordsPage(1); }}
                    className="border border-gray-300 rounded px-2 py-1.5 text-sm min-w-[80px]">
                    <option value="">全部</option>
                    <option value="貸方">貸方</option>
                    <option value="借方">借方</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">科目代碼</label>
                  <input type="text" value={filterAccountingCode} onChange={e => { setFilterAccountingCode(e.target.value); setRecordsPage(1); }}
                    placeholder="例: 4111"
                    className="border border-gray-300 rounded px-2 py-1.5 text-sm w-24" />
                </div>
                <button onClick={() => { setFilterWarehouse(''); setFilterStartDate(''); setFilterEndDate(''); setFilterEntryType(''); setFilterAccountingCode(''); setRecordsPage(1); }}
                  className="px-3 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-50">
                  清除篩選
                </button>
                <div className="flex-1" />
                <button onClick={() => setShowAddModal(true)}
                  className="px-4 py-1.5 text-sm bg-teal-600 text-white rounded hover:bg-teal-700">
                  + 手動新增
                </button>
              </div>
            </div>

            {/* Records table */}
            <div className="bg-white rounded-lg shadow-sm border">
              {loading ? (
                <div className="text-center py-8 text-gray-400">載入中...</div>
              ) : records.length === 0 ? (
                <div className="text-center py-8 text-gray-400">無符合條件的記錄</div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gray-50 text-left">
                          <th className="px-3 py-2 font-medium cursor-pointer hover:text-teal-700" onClick={() => handleSort('businessDate')}>
                            營業日期 <SortIcon field="businessDate" />
                          </th>
                          <th className="px-3 py-2 font-medium cursor-pointer hover:text-teal-700" onClick={() => handleSort('warehouse')}>
                            館別 <SortIcon field="warehouse" />
                          </th>
                          <th className="px-3 py-2 font-medium cursor-pointer hover:text-teal-700" onClick={() => handleSort('entryType')}>
                            借貸方 <SortIcon field="entryType" />
                          </th>
                          <th className="px-3 py-2 font-medium">PMS 欄位</th>
                          <th className="px-3 py-2 font-medium text-right cursor-pointer hover:text-teal-700" onClick={() => handleSort('amount')}>
                            金額 <SortIcon field="amount" />
                          </th>
                          <th className="px-3 py-2 font-medium">科目代碼</th>
                          <th className="px-3 py-2 font-medium">科目名稱</th>
                          <th className="px-3 py-2 font-medium">批次</th>
                          <th className="px-3 py-2 font-medium">備註</th>
                          <th className="px-3 py-2 font-medium text-center">操作</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sortedRecords.map(rec => (
                          <tr key={rec.id} className="border-t hover:bg-gray-50">
                            <td className="px-3 py-2 font-mono text-xs">{formatDate(rec.businessDate)}</td>
                            <td className="px-3 py-2">{rec.warehouse}</td>
                            <td className="px-3 py-2">
                              <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                                rec.entryType === '貸方' ? 'bg-teal-100 text-teal-800' : 'bg-amber-100 text-amber-800'
                              }`}>
                                {rec.entryType}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-sm">{rec.pmsColumnName}</td>
                            <td className="px-3 py-2 text-right font-medium">
                              {formatNumber(rec.amount)}
                              {rec.isModified && (
                                <span className="ml-1 text-xs text-orange-500" title={`原始: ${formatNumber(rec.originalAmount)}`}>*</span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-xs text-gray-600">{rec.accountingCode}</td>
                            <td className="px-3 py-2 text-xs text-gray-600">{rec.accountingName}</td>
                            <td className="px-3 py-2 text-xs text-gray-400">{rec.importBatch?.batchNo || '手動'}</td>
                            <td className="px-3 py-2 text-xs text-gray-400 max-w-[100px] truncate">{rec.note || '-'}</td>
                            <td className="px-3 py-2 text-center">
                              <button onClick={() => handleDeleteRecord(rec.id)}
                                className="text-red-500 hover:text-red-700 text-xs hover:underline">
                                刪除
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="px-4 py-3 border-t">
                    {renderPagination()}
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* ============================== */}
        {/* Tab: 月度核對結算 */}
        {/* ============================== */}
        {activeTab === 'settlement' && (
          <div className="space-y-4">
            {/* Workflow Guide */}
            <div className="bg-teal-50 border border-teal-200 rounded-xl p-4">
              <p className="text-sm font-medium text-teal-800 mb-2">PMS 收入結算流程：</p>
              <ol className="text-xs text-teal-700 space-y-1 list-decimal list-inside">
                <li><b>每日匯入</b> — 匯入 PMS 日報表（狀態：已匯入）</li>
                <li><b>會計核對</b> — 飯店會計核對整月資料正確後，點「核對整月」（狀態：已核對）</li>
                <li><b>月度結算</b> — 核對完成後，點「結算入帳」→ 系統自動建立現金流收入（現金、信用卡、轉帳各別入帳）</li>
              </ol>
              <div className="mt-2 flex items-center gap-2 text-xs text-teal-600">
                <span className="inline-block w-2 h-2 rounded-full bg-yellow-400"></span>已匯入
                <span className="inline-block w-2 h-2 rounded-full bg-blue-400 ml-2"></span>已核對
                <span className="inline-block w-2 h-2 rounded-full bg-green-400 ml-2"></span>已結算
              </div>
              <p className="text-xs text-teal-600 mt-2">
                <b>注意：</b>結算前請先到「收入帳戶設定」設定各付款方式（現金、信用卡、轉帳）對應的存簿帳戶、手續費比例、入帳延遲天數。
              </p>
            </div>

            {/* Controls */}
            <div className="bg-white rounded-lg shadow-sm border p-4 flex flex-wrap gap-3 items-center">
              <select value={settlementWarehouse} onChange={e => setSettlementWarehouse(e.target.value)}
                className="border rounded-lg px-3 py-2 text-sm">
                {WAREHOUSES.map(w => <option key={w} value={w}>{w}</option>)}
              </select>
              <input type="month" value={settlementYearMonth} onChange={e => setSettlementYearMonth(e.target.value)}
                className="border rounded-lg px-3 py-2 text-sm" />
              <button onClick={fetchSettlementData} className="px-3 py-2 text-sm border border-teal-300 text-teal-700 rounded-lg hover:bg-teal-50">查詢</button>
              <div className="flex-1" />

              {/* Status & Actions */}
              {settlementStatus ? (
                <div className="flex items-center gap-2">
                  <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                    settlementStatus.status === '已結算' ? 'bg-green-100 text-green-700 border border-green-300' :
                    settlementStatus.status === '已核對' ? 'bg-blue-100 text-blue-700 border border-blue-300' :
                    'bg-yellow-100 text-yellow-700 border border-yellow-300'
                  }`}>{settlementStatus.status}</span>
                  {settlementStatus.status === '已核對' && (
                    <button onClick={handleSettleMonth} disabled={settling}
                      className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-green-700 disabled:opacity-50">
                      {settling ? '結算中...' : '結算入帳'}
                    </button>
                  )}
                  {settlementStatus.status === '已結算' && (
                    <span className="text-xs text-gray-500">
                      結算者: {settlementStatus.settledBy} | {settlementStatus.settledAt ? new Date(settlementStatus.settledAt).toLocaleString('zh-TW') : ''}
                    </span>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  {settlementBatches.filter(b => b.status === '已匯入').length > 0 && (
                    <button onClick={handleVerifyMonth}
                      className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700">
                      核對整月
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Settlement Summary */}
            {settlementStatus && (
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-white rounded-xl shadow-sm p-4 border-l-4 border-teal-500">
                  <p className="text-xs text-gray-500">批次數量</p>
                  <p className="text-xl font-bold text-teal-700">{settlementStatus.batchCount}</p>
                </div>
                <div className="bg-white rounded-xl shadow-sm p-4 border-l-4 border-green-500">
                  <p className="text-xs text-gray-500">貸方合計（收入）</p>
                  <p className="text-xl font-bold text-green-700">{formatNumber(settlementStatus.creditTotal)}</p>
                </div>
                <div className="bg-white rounded-xl shadow-sm p-4 border-l-4 border-amber-500">
                  <p className="text-xs text-gray-500">借方合計（付款方式）</p>
                  <p className="text-xl font-bold text-amber-700">{formatNumber(settlementStatus.debitTotal)}</p>
                </div>
                <div className="bg-white rounded-xl shadow-sm p-4 border-l-4 border-blue-500">
                  <p className="text-xs text-gray-500">核對者</p>
                  <p className="text-sm font-medium text-blue-700">{settlementStatus.verifiedBy || '-'}</p>
                  <p className="text-xs text-gray-400">{settlementStatus.verifiedAt ? new Date(settlementStatus.verifiedAt).toLocaleString('zh-TW') : ''}</p>
                </div>
              </div>
            )}

            {/* Batches Table */}
            <div className="bg-white rounded-lg shadow-sm border">
              <div className="px-4 py-3 border-b bg-gray-50">
                <h3 className="text-sm font-bold text-gray-700">
                  {settlementWarehouse} — {settlementYearMonth} 批次列表 ({settlementBatches.length}筆)
                </h3>
              </div>
              {settlementBatches.length === 0 ? (
                <div className="p-8 text-center text-gray-400">此月份無匯入批次</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium">營業日期</th>
                        <th className="px-3 py-2 text-right font-medium">貸方</th>
                        <th className="px-3 py-2 text-right font-medium">借方</th>
                        <th className="px-3 py-2 text-right font-medium">差額</th>
                        <th className="px-3 py-2 text-center font-medium">筆數</th>
                        <th className="px-3 py-2 text-center font-medium">狀態</th>
                        <th className="px-3 py-2 text-center font-medium">操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {settlementBatches.map(b => (
                        <tr key={b.id} className="border-t hover:bg-gray-50">
                          <td className="px-3 py-2">{b.businessDate}</td>
                          <td className="px-3 py-2 text-right font-mono text-teal-700">{formatNumber(b.creditTotal)}</td>
                          <td className="px-3 py-2 text-right font-mono text-amber-700">{formatNumber(b.debitTotal)}</td>
                          <td className={`px-3 py-2 text-right font-mono ${Math.abs(Number(b.difference)) < 0.01 ? 'text-green-600' : 'text-red-600'}`}>
                            {formatNumber(b.difference)}
                          </td>
                          <td className="px-3 py-2 text-center">{b.recordCount}</td>
                          <td className="px-3 py-2 text-center">
                            <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                              b.status === '已結算' ? 'bg-green-100 text-green-700' :
                              b.status === '已核對' ? 'bg-blue-100 text-blue-700' :
                              'bg-yellow-100 text-yellow-700'
                            }`}>{b.status}</span>
                          </td>
                          <td className="px-3 py-2 text-center">
                            {b.status === '已匯入' && (
                              <button onClick={() => handleVerifyBatches([b.id])}
                                className="text-blue-600 hover:text-blue-800 text-xs hover:underline">核對</button>
                            )}
                            {b.status === '已核對' && (
                              <span className="text-xs text-gray-400">已核對</span>
                            )}
                            {b.status === '已結算' && (
                              <span className="text-xs text-green-600">已結算</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ============================== */}
        {/* Tab 3: Statistics */}
        {/* ============================== */}
        {activeTab === 'statistics' && (
          <div className="space-y-6">
            {/* Controls */}
            <div className="flex items-center gap-3">
              <select value={statsYear} onChange={e => setStatsYear(parseInt(e.target.value))}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-teal-500">
                {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}年</option>)}
              </select>
              <select value={statsMonth} onChange={e => setStatsMonth(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-teal-500">
                <option value="">全年總覽</option>
                {Array.from({ length: 12 }, (_, i) => i + 1).map(m => <option key={m} value={m}>{m}月</option>)}
              </select>
              <button onClick={fetchStats}
                className="px-3 py-2 text-sm border border-teal-300 text-teal-700 rounded-lg hover:bg-teal-50">
                查詢
              </button>
            </div>

            {loading ? (
              <div className="text-center py-8 text-gray-400">載入中...</div>
            ) : statsData ? (
              <>
                {/* Chart */}
                <div className="bg-white rounded-lg shadow-sm border p-6">
                  <h3 className="text-sm font-bold text-gray-700 mb-4">
                    {statsMonth ? `${statsYear}年${statsMonth}月 - 科目分佈` : `${statsYear}年 - 月度收入趨勢`}
                  </h3>
                  {renderStatsChart()}
                </div>

                {/* Detail table for single month */}
                {statsMonth && statsData.byAccountingCode && (
                  <div className="bg-white rounded-lg shadow-sm border p-4">
                    <h3 className="text-sm font-bold text-gray-700 mb-3">科目明細</h3>
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gray-50 text-left">
                          <th className="px-3 py-2 font-medium">科目代碼</th>
                          <th className="px-3 py-2 font-medium">科目名稱</th>
                          <th className="px-3 py-2 font-medium text-right">貸方金額</th>
                          <th className="px-3 py-2 font-medium text-right">借方金額</th>
                          <th className="px-3 py-2 font-medium text-right">淨額</th>
                        </tr>
                      </thead>
                      <tbody>
                        {statsData.byAccountingCode.map((item, i) => (
                          <tr key={i} className="border-t hover:bg-gray-50">
                            <td className="px-3 py-2 font-mono text-xs">{item.accountingCode}</td>
                            <td className="px-3 py-2">{item.accountingName}</td>
                            <td className="px-3 py-2 text-right text-teal-700">{formatNumber(item.credit)}</td>
                            <td className="px-3 py-2 text-right text-amber-700">{formatNumber(item.debit)}</td>
                            <td className={`px-3 py-2 text-right font-medium ${item.net >= 0 ? 'text-teal-700' : 'text-red-600'}`}>
                              {formatNumber(item.net)}
                            </td>
                          </tr>
                        ))}
                        <tr className="border-t-2 border-gray-300 font-bold">
                          <td className="px-3 py-2" colSpan={2}>合計</td>
                          <td className="px-3 py-2 text-right text-teal-700">
                            {formatNumber(statsData.byAccountingCode.reduce((s, i) => s + i.credit, 0))}
                          </td>
                          <td className="px-3 py-2 text-right text-amber-700">
                            {formatNumber(statsData.byAccountingCode.reduce((s, i) => s + i.debit, 0))}
                          </td>
                          <td className="px-3 py-2 text-right text-teal-800">
                            {formatNumber(statsData.total)}
                          </td>
                        </tr>
                      </tbody>
                    </table>

                    {/* Warehouse breakdown */}
                    {Object.keys(statsData.byWarehouse || {}).length > 0 && (
                      <div className="mt-6">
                        <h4 className="text-sm font-bold text-gray-700 mb-3">館別匯入統計</h4>
                        <div className="grid grid-cols-3 gap-4">
                          {Object.entries(statsData.byWarehouse).map(([wh, data]) => (
                            <div key={wh} className="border rounded-lg p-3">
                              <div className="font-medium text-teal-800 mb-2">{wh}</div>
                              <div className="grid grid-cols-2 gap-1 text-xs">
                                <span className="text-gray-500">貸方:</span>
                                <span className="text-right text-teal-700">{formatNumber(data.credit)}</span>
                                <span className="text-gray-500">借方:</span>
                                <span className="text-right text-amber-700">{formatNumber(data.debit)}</span>
                                <span className="text-gray-500">淨額:</span>
                                <span className="text-right font-medium">{formatNumber(data.net)}</span>
                                <span className="text-gray-500">匯入天數:</span>
                                <span className="text-right">{data.importedDays}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Year overview table */}
                {!statsMonth && Array.isArray(statsData) && (
                  <div className="bg-white rounded-lg shadow-sm border p-4">
                    <h3 className="text-sm font-bold text-gray-700 mb-3">月度摘要表</h3>
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gray-50 text-left">
                          <th className="px-3 py-2 font-medium">月份</th>
                          <th className="px-3 py-2 font-medium text-right">淨收入</th>
                          <th className="px-3 py-2 font-medium text-center">匯入天數</th>
                          <th className="px-3 py-2 font-medium text-center">當月天數</th>
                          <th className="px-3 py-2 font-medium text-center">完成率</th>
                          <th className="px-3 py-2 font-medium">涵蓋館別</th>
                        </tr>
                      </thead>
                      <tbody>
                        {statsData.map((m, i) => (
                          <tr key={i} className="border-t hover:bg-gray-50">
                            <td className="px-3 py-2 font-medium">{m.month}月</td>
                            <td className={`px-3 py-2 text-right font-medium ${m.total >= 0 ? 'text-teal-700' : 'text-red-600'}`}>
                              {formatNumber(m.total)}
                            </td>
                            <td className="px-3 py-2 text-center">{m.importedDays}</td>
                            <td className="px-3 py-2 text-center">{m.totalDays}</td>
                            <td className="px-3 py-2 text-center">
                              {m.totalDays > 0 ? `${Math.round(m.importedDays / m.totalDays * 100)}%` : '-'}
                            </td>
                            <td className="px-3 py-2 text-xs text-gray-500">
                              {Object.keys(m.byWarehouse || {}).join(', ') || '-'}
                            </td>
                          </tr>
                        ))}
                        <tr className="border-t-2 border-gray-300 font-bold">
                          <td className="px-3 py-2">全年合計</td>
                          <td className="px-3 py-2 text-right text-teal-800">
                            {formatNumber(statsData.reduce((s, m) => s + m.total, 0))}
                          </td>
                          <td className="px-3 py-2 text-center">{statsData.reduce((s, m) => s + m.importedDays, 0)}</td>
                          <td className="px-3 py-2 text-center">{statsData.reduce((s, m) => s + m.totalDays, 0)}</td>
                          <td className="px-3 py-2 text-center">
                            {(() => {
                              const totalDays = statsData.reduce((s, m) => s + m.totalDays, 0);
                              const importedDays = statsData.reduce((s, m) => s + m.importedDays, 0);
                              return totalDays > 0 ? `${Math.round(importedDays / totalDays * 100)}%` : '-';
                            })()}
                          </td>
                          <td className="px-3 py-2" />
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            ) : (
              <div className="text-center py-8 text-gray-400">無資料</div>
            )}
          </div>
        )}

        {/* ============================== */}
        {/* Tab: 旅行社佣金配置 (spec26) */}
        {/* ============================== */}
        {activeTab === 'travelAgency' && (
          <div className="space-y-4">
            <div className="bg-white rounded-lg shadow-sm border p-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-gray-700">旅行社／代訂中心佣金配置</h3>
                <button type="button" onClick={() => { setEditingTravelAgency(null); setTravelAgencyForm({ companyName: '', agencyCode: '', commissionPercentage: '', paymentType: 'NONE', dataSource: 'AUTO', paymentDueDay: '', paymentMethod: '', isActive: true }); setShowTravelAgencyModal(true); }}
                  className="px-3 py-2 text-sm bg-teal-600 text-white rounded-lg hover:bg-teal-700">＋ 新增</button>
              </div>
              <p className="text-xs text-gray-500 mb-4">設定應收(AR)／應付(AP)／無(NONE)，以及數據源：自動提取(AUTO)或每月手動輸入(MANUAL)。</p>
              {loading ? <div className="text-center py-8 text-gray-400">載入中...</div> : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-left">
                      <th className="px-3 py-2 font-medium">公司名稱</th>
                      <th className="px-3 py-2 font-medium">代碼</th>
                      <th className="px-3 py-2 font-medium">佣金%</th>
                      <th className="px-3 py-2 font-medium">應收/應付</th>
                      <th className="px-3 py-2 font-medium">數據源</th>
                      <th className="px-3 py-2 font-medium text-center">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {travelAgencyConfigs.map((c) => (
                      <tr key={c.id} className="border-t hover:bg-gray-50">
                        <td className="px-3 py-2">{c.companyName}</td>
                        <td className="px-3 py-2 text-gray-600">{c.agencyCode || '—'}</td>
                        <td className="px-3 py-2">{Number(c.commissionPercentage)}%</td>
                        <td className="px-3 py-2">
                          <span className={`px-2 py-0.5 rounded text-xs ${c.paymentType === 'AR' ? 'bg-teal-100 text-teal-800' : c.paymentType === 'AP' ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-600'}`}>
                            {c.paymentType === 'AR' ? 'AR(應收)' : c.paymentType === 'AP' ? 'AP(應付)' : 'NONE'}
                          </span>
                        </td>
                        <td className="px-3 py-2">{c.dataSource === 'MANUAL' ? '手動' : '自動'}</td>
                        <td className="px-3 py-2 text-center">
                          <button type="button" onClick={() => { setEditingTravelAgency(c); setTravelAgencyForm({ companyName: c.companyName, agencyCode: c.agencyCode || '', commissionPercentage: String(c.commissionPercentage), paymentType: c.paymentType, dataSource: c.dataSource, paymentDueDay: c.paymentDueDay != null ? String(c.paymentDueDay) : '', paymentMethod: c.paymentMethod || '', isActive: c.isActive }); setShowTravelAgencyModal(true); }} className="text-teal-600 hover:underline text-xs">編輯</button>
                          <button type="button" onClick={async () => { if (!confirm('確定刪除？')) return; try { const r = await fetch(`/api/pms-income/travel-agency-config/${c.id}`, { method: 'DELETE' }); if (r.ok) fetchTravelAgencyConfigs(); else setError((await r.json())?.error?.message || '刪除失敗'); } catch (e) { setError(e.message); } }} className="ml-2 text-red-500 hover:underline text-xs">刪除</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* ============================== */}
        {/* Tab: 每月手動代訂 (spec26) */}
        {/* ============================== */}
        {activeTab === 'manualCommission' && (
          <div className="space-y-4">
            <div className="bg-white rounded-lg shadow-sm border p-4">
              <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                <h3 className="text-sm font-bold text-gray-700">每月代訂中心佣金輸入</h3>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">結算月份：</span>
                  <input type="text" value={manualMonth} onChange={e => setManualMonth(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="202603" className="w-24 border rounded px-2 py-1 text-sm" />
                  <button type="button" onClick={fetchManualEntries} className="px-3 py-1 text-sm border border-teal-300 text-teal-700 rounded hover:bg-teal-50">查詢</button>
                  <button type="button" onClick={() => { setEditingManualEntry(null); setManualEntryForm({ agencyName: '', agencyCode: '', totalRoomRent: '', roomNights: '', commissionPercentage: '', commissionAmount: '', arOrAp: 'AP', remarks: '' }); setShowManualEntryModal(true); }}
                    className="px-3 py-2 text-sm bg-teal-600 text-white rounded-lg hover:bg-teal-700">＋ 新增代訂記錄</button>
                </div>
              </div>
              <p className="text-xs text-gray-500 mb-4">無法從 PMS 自動提取的代訂中心，於此手動輸入當月房租與佣金，系統自動計算應收/應付。確認無誤後可送出至現金流。</p>
              {loading ? <div className="text-center py-8 text-gray-400">載入中...</div> : (
                <>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 text-left">
                        <th className="px-2 py-2 w-8">
                          <input type="checkbox"
                            checked={manualEntries.filter(e => e.status === 'DRAFT').length > 0 && selectedManualIds.length === manualEntries.filter(e => e.status === 'DRAFT').length}
                            onChange={e => {
                              if (e.target.checked) setSelectedManualIds(manualEntries.filter(x => x.status === 'DRAFT').map(x => x.id));
                              else setSelectedManualIds([]);
                            }}
                          />
                        </th>
                        <th className="px-3 py-2 font-medium">代訂中心</th>
                        <th className="px-3 py-2 font-medium text-right">房租總額</th>
                        <th className="px-3 py-2 font-medium text-right">房晚</th>
                        <th className="px-3 py-2 font-medium text-right">佣金%</th>
                        <th className="px-3 py-2 font-medium text-right">佣金金額</th>
                        <th className="px-3 py-2 font-medium">應收/應付</th>
                        <th className="px-3 py-2 font-medium text-right">淨額</th>
                        <th className="px-3 py-2 font-medium text-center">狀態</th>
                        <th className="px-3 py-2 text-center">操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {manualEntries.map((entry) => (
                        <tr key={entry.id} className={`border-t hover:bg-gray-50 ${entry.status !== 'DRAFT' ? 'bg-gray-50/50' : ''}`}>
                          <td className="px-2 py-2">
                            {entry.status === 'DRAFT' ? (
                              <input type="checkbox"
                                checked={selectedManualIds.includes(entry.id)}
                                onChange={e => {
                                  if (e.target.checked) setSelectedManualIds(prev => [...prev, entry.id]);
                                  else setSelectedManualIds(prev => prev.filter(id => id !== entry.id));
                                }}
                              />
                            ) : <span className="text-gray-300">—</span>}
                          </td>
                          <td className="px-3 py-2">{entry.agencyName}</td>
                          <td className="px-3 py-2 text-right">{formatNumber(entry.totalRoomRent)}</td>
                          <td className="px-3 py-2 text-right">{entry.roomNights}</td>
                          <td className="px-3 py-2 text-right">{Number(entry.commissionPercentage)}%</td>
                          <td className="px-3 py-2 text-right">{formatNumber(entry.commissionAmount)}</td>
                          <td className="px-3 py-2">{entry.arOrAp === 'AR' ? '應收' : entry.arOrAp === 'AP' ? '應付' : '—'}</td>
                          <td className="px-3 py-2 text-right font-medium">{formatNumber(entry.netAmount)}</td>
                          <td className="px-3 py-2 text-center">
                            {entry.status === 'DRAFT' && <span className="px-2 py-0.5 rounded text-xs bg-yellow-100 text-yellow-800">草稿</span>}
                            {entry.status === 'SUBMITTED' && <span className="px-2 py-0.5 rounded text-xs bg-green-100 text-green-800">已送出</span>}
                            {entry.status === 'VERIFIED' && <span className="px-2 py-0.5 rounded text-xs bg-blue-100 text-blue-800">已核實</span>}
                          </td>
                          <td className="px-3 py-2 text-center">
                            {entry.status === 'DRAFT' ? (
                              <>
                                <button type="button" onClick={() => { setEditingManualEntry(entry); setManualEntryForm({ agencyName: entry.agencyName, agencyCode: entry.agencyCode || '', totalRoomRent: String(entry.totalRoomRent), roomNights: String(entry.roomNights), commissionPercentage: String(entry.commissionPercentage), commissionAmount: String(entry.commissionAmount), arOrAp: entry.arOrAp, remarks: entry.remarks || '' }); setShowManualEntryModal(true); }} className="text-teal-600 hover:underline text-xs">編輯</button>
                                <button type="button" onClick={async () => { if (!confirm('確定刪除？')) return; try { const r = await fetch(`/api/pms-income/monthly-manual-commission/${entry.id}`, { method: 'DELETE' }); if (r.ok) fetchManualEntries(); else setError((await r.json())?.error?.message || '刪除失敗'); } catch (err) { setError(err.message); } }} className="ml-2 text-red-500 hover:underline text-xs">刪除</button>
                              </>
                            ) : (
                              <span className="text-xs text-gray-400">已送出</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {manualEntries.length > 0 && (
                    <div className="mt-4 pt-4 border-t flex items-center justify-between flex-wrap gap-3">
                      <div className="text-sm text-gray-600">
                        小計：{manualEntries.length} 筆 · 房租合計 {formatNumber(manualEntries.reduce((s, e) => s + Number(e.totalRoomRent), 0))} · 佣金合計 {formatNumber(manualEntries.reduce((s, e) => s + Number(e.commissionAmount), 0))} · 應付合計 {formatNumber(manualEntries.filter(e => e.arOrAp === 'AP').reduce((s, e) => s + Number(e.netAmount), 0))}
                      </div>
                      {selectedManualIds.length > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            const today = new Date().toISOString().split('T')[0];
                            setConfirmCommissionForm({ accountId: '', transactionDate: today });
                            setShowConfirmCommissionModal(true);
                          }}
                          className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
                        >
                          確認送出至現金流（{selectedManualIds.length} 筆）
                        </button>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {/* ============================== */}
        {/* Tab: 收入帳戶設定 */}
        {/* ============================== */}
        {activeTab === 'paymentConfig' && (
          <div className="space-y-4">
            <div className="bg-teal-50 border border-teal-200 rounded-xl p-4">
              <p className="text-sm font-medium text-teal-800 mb-1">收入帳戶設定說明：</p>
              <p className="text-xs text-teal-700">
                依<strong>館別</strong>設定 PMS 借方收入（現金、信用卡、轉帳等）對應的存簿帳戶。結算時系統會依該館別的設定自動建立現金流交易。
                <br />信用卡收入可設定入帳延遲天數（銀行撥款通常延遲3~7天）和手續費比例（手續費會自動建立支出交易）。館別請至「設定 → 館別設定」新增。
              </p>
            </div>

            <div className="bg-white rounded-lg shadow-sm border">
              <div className="px-4 py-3 border-b bg-gray-50 flex flex-wrap items-center gap-3">
                <h3 className="text-sm font-bold text-gray-700">借方收入 → 存簿帳戶對應</h3>
                <label className="text-sm text-gray-600">館別：</label>
                <select
                  value={paymentConfigWarehouse}
                  onChange={e => setPaymentConfigWarehouse(e.target.value)}
                  className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
                >
                  {paymentConfigBuildings.length === 0 ? (
                    <option value="">請先至設定新增館別</option>
                  ) : (
                    paymentConfigBuildings.map(b => (
                      <option key={b} value={b}>{b}</option>
                    ))
                  )}
                </select>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-left font-medium">PMS 收入項目</th>
                      <th className="px-4 py-2 text-left font-medium">對應存簿帳戶</th>
                      <th className="px-4 py-2 text-center font-medium">入帳延遲(天)</th>
                      <th className="px-4 py-2 text-center font-medium">手續費(%)</th>
                      <th className="px-4 py-2 text-center font-medium">啟用</th>
                      <th className="px-4 py-2 text-center font-medium">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {DEFAULT_PMS_COLUMNS.filter(c => c.entryType === '借方').map(col => {
                      const existing = paymentConfigs.find(p => (p.warehouse ?? '') === paymentConfigWarehouse && p.pmsColumnName === col.pmsColumnName);
                      return (
                        <tr key={col.pmsColumnName} className="border-t hover:bg-gray-50">
                          <td className="px-4 py-3">
                            <div className="font-medium">{col.pmsColumnName}</div>
                            <div className="text-xs text-gray-400">{col.accountingCode} - {col.accountingName}</div>
                          </td>
                          <td className="px-4 py-3">
                            <select
                              value={existing?.cashAccountId || ''}
                              onChange={e => handleSavePaymentConfig({
                                pmsColumnName: col.pmsColumnName,
                                cashAccountId: e.target.value || null,
                                settlementDelayDays: existing?.settlementDelayDays || 0,
                                feePercentage: existing?.feePercentage || 0,
                                isActive: existing?.isActive !== false
                              })}
                              className="w-full border rounded px-2 py-1.5 text-sm"
                            >
                              <option value="">未設定</option>
                              {paymentConfigAccounts.map(a => (
                                <option key={a.id} value={a.id}>{a.name} ({a.type})</option>
                              ))}
                            </select>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <input type="number" min="0" max="30"
                              value={existing?.settlementDelayDays || 0}
                              onChange={e => handleSavePaymentConfig({
                                pmsColumnName: col.pmsColumnName,
                                cashAccountId: existing?.cashAccountId || null,
                                settlementDelayDays: parseInt(e.target.value) || 0,
                                feePercentage: existing?.feePercentage || 0,
                                isActive: existing?.isActive !== false
                              })}
                              className="w-16 border rounded px-2 py-1.5 text-sm text-center"
                            />
                          </td>
                          <td className="px-4 py-3 text-center">
                            <input type="number" min="0" max="10" step="0.1"
                              value={existing?.feePercentage || 0}
                              onChange={e => handleSavePaymentConfig({
                                pmsColumnName: col.pmsColumnName,
                                cashAccountId: existing?.cashAccountId || null,
                                settlementDelayDays: existing?.settlementDelayDays || 0,
                                feePercentage: parseFloat(e.target.value) || 0,
                                isActive: existing?.isActive !== false
                              })}
                              className="w-20 border rounded px-2 py-1.5 text-sm text-center"
                            />
                          </td>
                          <td className="px-4 py-3 text-center">
                            <input type="checkbox"
                              checked={existing?.isActive !== false}
                              onChange={e => handleSavePaymentConfig({
                                pmsColumnName: col.pmsColumnName,
                                cashAccountId: existing?.cashAccountId || null,
                                settlementDelayDays: existing?.settlementDelayDays || 0,
                                feePercentage: existing?.feePercentage || 0,
                                isActive: e.target.checked
                              })}
                              className="rounded"
                            />
                          </td>
                          <td className="px-4 py-3 text-center">
                            {existing ? (
                              <span className="text-xs text-green-600">已設定</span>
                            ) : (
                              <span className="text-xs text-gray-400">未設定</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Guide for credit card setup */}
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <h4 className="text-sm font-bold text-amber-800 mb-2">信用卡收入設定建議</h4>
              <ul className="text-xs text-amber-700 space-y-1 list-disc list-inside">
                <li><b>對應存簿：</b>選擇銀行帳戶（信用卡款項撥入的帳戶）</li>
                <li><b>入帳延遲：</b>一般為 3~7 天（依銀行撥款時間），結算時交易日期 = 月底 + 延遲天數</li>
                <li><b>手續費：</b>例如 2.5%，系統會自動建立一筆手續費支出（從同一帳戶扣除）</li>
                <li><b>現金/轉帳收入：</b>延遲設0天，手續費設0%</li>
              </ul>
            </div>
          </div>
        )}

        {/* ============================== */}
        {/* Tab: Mapping */}
        {/* ============================== */}
        {activeTab === 'mapping' && (
          <div className="space-y-4">
            <div className="bg-white rounded-lg shadow-sm border p-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-gray-700">PMS 科目對應規則</h3>
                <a href="/settings" className="text-sm text-teal-600 hover:text-teal-800 hover:underline">
                  前往設定管理 &rarr;
                </a>
              </div>
              <p className="text-xs text-gray-500 mb-4">
                以下為 PMS 系統欄位與會計科目的對應關係。如需修改，請聯繫系統管理員或前往設定頁面。
              </p>

              {loading ? (
                <div className="text-center py-8 text-gray-400">載入中...</div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-left">
                      <th className="px-3 py-2 font-medium">#</th>
                      <th className="px-3 py-2 font-medium">PMS 欄位名稱</th>
                      <th className="px-3 py-2 font-medium">借貸方</th>
                      <th className="px-3 py-2 font-medium">會計科目代碼</th>
                      <th className="px-3 py-2 font-medium">會計科目名稱</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mappingRules.map((rule, i) => (
                      <tr key={rule.id || i} className="border-t hover:bg-gray-50">
                        <td className="px-3 py-2 text-gray-400">{i + 1}</td>
                        <td className="px-3 py-2 font-medium">{rule.pmsColumnName}</td>
                        <td className="px-3 py-2">
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                            rule.entryType === '貸方' ? 'bg-teal-100 text-teal-800' : 'bg-amber-100 text-amber-800'
                          }`}>
                            {rule.entryType}
                          </span>
                        </td>
                        <td className="px-3 py-2 font-mono text-xs">{rule.accountingCode}</td>
                        <td className="px-3 py-2">{rule.accountingName}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      {renderUploadModal()}
      {renderAddModal()}

      {/* 旅行社佣金配置 新增/編輯 Modal */}
      {showTravelAgencyModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-bold text-gray-800 mb-4">{editingTravelAgency ? '編輯旅行社配置' : '新增旅行社配置'}</h3>
            <div className="space-y-3 text-sm">
              <div>
                <label className="block text-gray-600 mb-1">公司名稱 *</label>
                <input value={travelAgencyForm.companyName} onChange={e => setTravelAgencyForm(f => ({ ...f, companyName: e.target.value }))} className="w-full border rounded px-3 py-2" placeholder="如 booking.com" />
              </div>
              <div>
                <label className="block text-gray-600 mb-1">代碼</label>
                <input value={travelAgencyForm.agencyCode} onChange={e => setTravelAgencyForm(f => ({ ...f, agencyCode: e.target.value }))} className="w-full border rounded px-3 py-2" placeholder="如 TA-01" />
              </div>
              <div>
                <label className="block text-gray-600 mb-1">佣金 % *</label>
                <input type="number" step="0.01" value={travelAgencyForm.commissionPercentage} onChange={e => setTravelAgencyForm(f => ({ ...f, commissionPercentage: e.target.value }))} className="w-full border rounded px-3 py-2" />
              </div>
              <div>
                <label className="block text-gray-600 mb-1">應收/應付</label>
                <select value={travelAgencyForm.paymentType} onChange={e => setTravelAgencyForm(f => ({ ...f, paymentType: e.target.value }))} className="w-full border rounded px-3 py-2">
                  <option value="NONE">NONE（無佣金）</option>
                  <option value="AR">AR（應收）</option>
                  <option value="AP">AP（應付）</option>
                </select>
              </div>
              <div>
                <label className="block text-gray-600 mb-1">數據源</label>
                <select value={travelAgencyForm.dataSource} onChange={e => setTravelAgencyForm(f => ({ ...f, dataSource: e.target.value }))} className="w-full border rounded px-3 py-2">
                  <option value="AUTO">AUTO（自動提取）</option>
                  <option value="MANUAL">MANUAL（每月手動輸入）</option>
                </select>
              </div>
              {travelAgencyForm.paymentType === 'AP' && (
                <>
                  <div>
                    <label className="block text-gray-600 mb-1">應付日（每月幾號）</label>
                    <input type="number" min="1" max="28" value={travelAgencyForm.paymentDueDay} onChange={e => setTravelAgencyForm(f => ({ ...f, paymentDueDay: e.target.value }))} className="w-full border rounded px-3 py-2" placeholder="5" />
                  </div>
                  <div>
                    <label className="block text-gray-600 mb-1">支付方式</label>
                    <input value={travelAgencyForm.paymentMethod} onChange={e => setTravelAgencyForm(f => ({ ...f, paymentMethod: e.target.value }))} className="w-full border rounded px-3 py-2" placeholder="銀行轉帳" />
                  </div>
                </>
              )}
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" onClick={() => setShowTravelAgencyModal(false)} className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50">取消</button>
              <button type="button" onClick={async () => {
                if (!travelAgencyForm.companyName.trim()) { setError('請填寫公司名稱'); return; }
                try {
                  const url = editingTravelAgency ? `/api/pms-income/travel-agency-config/${editingTravelAgency.id}` : '/api/pms-income/travel-agency-config';
                  const method = editingTravelAgency ? 'PUT' : 'POST';
                  const body = { ...travelAgencyForm, commissionPercentage: parseFloat(travelAgencyForm.commissionPercentage) || 0, paymentDueDay: travelAgencyForm.paymentDueDay ? parseInt(travelAgencyForm.paymentDueDay, 10) : null };
                  const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
                  if (r.ok) { setShowTravelAgencyModal(false); setSuccess('已儲存'); fetchTravelAgencyConfigs(); }
                  else setError((await r.json())?.error?.message || '儲存失敗');
                } catch (e) { setError(e.message); }
              }} className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700">儲存</button>
            </div>
          </div>
        </div>
      )}

      {/* 確認送出至現金流 Modal */}
      {showConfirmCommissionModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-bold text-gray-800 mb-4">確認送出至現金流</h3>
            <p className="text-sm text-gray-600 mb-4">
              已選擇 <strong>{selectedManualIds.length}</strong> 筆代訂佣金記錄，確認後將自動建立現金流交易並影響存簿餘額。
            </p>
            <div className="space-y-3 text-sm">
              <div>
                <label className="block text-gray-600 mb-1">交易日期 *</label>
                <input type="date" value={confirmCommissionForm.transactionDate} onChange={e => setConfirmCommissionForm(f => ({ ...f, transactionDate: e.target.value }))} className="w-full border rounded px-3 py-2" />
              </div>
              <div>
                <label className="block text-gray-600 mb-1">存簿帳戶 *</label>
                <select value={confirmCommissionForm.accountId} onChange={e => setConfirmCommissionForm(f => ({ ...f, accountId: e.target.value }))} className="w-full border rounded px-3 py-2">
                  <option value="">請選擇帳戶</option>
                  {manualAccounts.map(a => (
                    <option key={a.id} value={a.id}>{a.name}{a.warehouse ? ` (${a.warehouse})` : ''}</option>
                  ))}
                </select>
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded p-3 text-xs text-amber-800">
                <p className="font-medium mb-1">送出後影響：</p>
                <ul className="list-disc list-inside space-y-0.5">
                  <li>應付（AP）佣金 → 現金流「支出」，存簿餘額減少</li>
                  <li>應收（AR）佣金 → 現金流「收入」，存簿餘額增加</li>
                  <li>記錄狀態由「草稿」變更為「已送出」，不可再編輯</li>
                </ul>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" onClick={() => setShowConfirmCommissionModal(false)} className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50">取消</button>
              <button type="button" disabled={!confirmCommissionForm.accountId || !confirmCommissionForm.transactionDate} onClick={async () => {
                try {
                  const res = await fetch('/api/pms-income/monthly-manual-commission/confirm', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      entryIds: selectedManualIds,
                      accountId: parseInt(confirmCommissionForm.accountId),
                      transactionDate: confirmCommissionForm.transactionDate,
                    }),
                  });
                  const result = await res.json();
                  if (res.ok) {
                    setShowConfirmCommissionModal(false);
                    setSelectedManualIds([]);
                    setSuccess(result.message || '已送出至現金流');
                    fetchManualEntries();
                  } else {
                    setError(result.error?.message || '送出失敗');
                  }
                } catch (e) { setError(e.message); }
              }} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium">確認送出</button>
            </div>
          </div>
        </div>
      )}

      {/* 每月手動代訂 新增/編輯 Modal */}
      {showManualEntryModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold text-gray-800 mb-4">{editingManualEntry ? '編輯代訂記錄' : '新增代訂中心記錄'}（{manualMonth || '請選月份'}）</h3>
            <div className="space-y-3 text-sm">
              <div>
                <label className="block text-gray-600 mb-1">代訂中心名稱 *</label>
                <input value={manualEntryForm.agencyName} onChange={e => setManualEntryForm(f => ({ ...f, agencyName: e.target.value }))} className="w-full border rounded px-3 py-2" placeholder="如 林董代訂(湯總)" />
              </div>
              <div>
                <label className="block text-gray-600 mb-1">本月房租總額 *</label>
                <input type="number" step="0.01" value={manualEntryForm.totalRoomRent} onChange={e => { const v = e.target.value; setManualEntryForm(f => ({ ...f, totalRoomRent: v })); }} className="w-full border rounded px-3 py-2" />
              </div>
              <div>
                <label className="block text-gray-600 mb-1">房晚數</label>
                <input type="number" value={manualEntryForm.roomNights} onChange={e => setManualEntryForm(f => ({ ...f, roomNights: e.target.value }))} className="w-full border rounded px-3 py-2" />
              </div>
              <div>
                <label className="block text-gray-600 mb-1">佣金 %</label>
                <input type="number" step="0.01" value={manualEntryForm.commissionPercentage} onChange={e => setManualEntryForm(f => ({ ...f, commissionPercentage: e.target.value }))} className="w-full border rounded px-3 py-2" />
              </div>
              <div>
                <label className="block text-gray-600 mb-1">應收/應付</label>
                <select value={manualEntryForm.arOrAp} onChange={e => setManualEntryForm(f => ({ ...f, arOrAp: e.target.value }))} className="w-full border rounded px-3 py-2">
                  <option value="AP">AP（應付）</option>
                  <option value="AR">AR（應收）</option>
                  <option value="NONE">NONE</option>
                </select>
              </div>
              <div>
                <label className="block text-gray-600 mb-1">備註</label>
                <input value={manualEntryForm.remarks} onChange={e => setManualEntryForm(f => ({ ...f, remarks: e.target.value }))} className="w-full border rounded px-3 py-2" />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" onClick={() => setShowManualEntryModal(false)} className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50">取消</button>
              <button type="button" onClick={async () => {
                if (!manualMonth || manualMonth.length !== 6) { setError('請填寫結算月份（格式 202603）'); return; }
                if (!manualEntryForm.agencyName.trim()) { setError('請填寫代訂中心名稱'); return; }
                const totalRoomRent = parseFloat(manualEntryForm.totalRoomRent) || 0;
                const pct = parseFloat(manualEntryForm.commissionPercentage) || 0;
                const commissionAmount = Math.round(totalRoomRent * (pct / 100) * 100) / 100;
                try {
                  if (editingManualEntry) {
                    const r = await fetch(`/api/pms-income/monthly-manual-commission/${editingManualEntry.id}`, {
                      method: 'PUT',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        agencyName: manualEntryForm.agencyName.trim(),
                        agencyCode: manualEntryForm.agencyCode.trim() || null,
                        totalRoomRent,
                        roomNights: parseInt(manualEntryForm.roomNights, 10) || 0,
                        commissionPercentage: pct,
                        commissionAmount,
                        arOrAp: manualEntryForm.arOrAp,
                        remarks: manualEntryForm.remarks.trim() || null,
                      }),
                    });
                    if (r.ok) { setShowManualEntryModal(false); setSuccess('已更新'); fetchManualEntries(); }
                    else setError((await r.json())?.error?.message || '更新失敗');
                  } else {
                    const r = await fetch('/api/pms-income/monthly-manual-commission', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        settlementMonth: manualMonth,
                        agencyName: manualEntryForm.agencyName.trim(),
                        agencyCode: manualEntryForm.agencyCode.trim() || null,
                        totalRoomRent,
                        roomNights: parseInt(manualEntryForm.roomNights, 10) || 0,
                        commissionPercentage: pct,
                        commissionAmount,
                        arOrAp: manualEntryForm.arOrAp,
                        remarks: manualEntryForm.remarks.trim() || null,
                      }),
                    });
                    if (r.ok) { setShowManualEntryModal(false); setSuccess('已新增'); fetchManualEntries(); }
                    else setError((await r.json())?.error?.message || '新增失敗');
                  }
                } catch (e) { setError(e.message); }
              }} className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700">儲存</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
