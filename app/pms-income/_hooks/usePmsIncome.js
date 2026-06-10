'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { WAREHOUSES_FALLBACK, DEFAULT_PMS_COLUMNS } from '@/components/pms-income/pmsIncomeConstants';
import { usePmsIncomeOverview } from '@/components/pms-income/usePmsIncomeOverview';
import { usePmsIncomeRecords } from '@/components/pms-income/usePmsIncomeRecords';
import { usePmsIncomeSettlement } from '@/components/pms-income/usePmsIncomeSettlement';
import { TABS } from '@/components/pms-income/pmsIncomeConstants';
import { todayStr } from '@/lib/localDate';

const VALID_TAB_KEYS = new Set(TABS.map(t => t.key));

export function usePmsIncome() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeTab = VALID_TAB_KEYS.has(searchParams.get('tab')) ? searchParams.get('tab') : 'overview';

  useEffect(() => {
    const tabParam = searchParams.get('tab');
    if (tabParam && !VALID_TAB_KEYS.has(tabParam)) {
      router.replace('/pms-income?tab=overview', { scroll: false });
    }
  }, [searchParams, router]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [WAREHOUSES, setWAREHOUSES] = useState(WAREHOUSES_FALLBACK);

  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadWarehouse, setUploadWarehouse] = useState('麗格');
  const [uploadDate, setUploadDate] = useState(todayStr());
  const [uploadFileName, setUploadFileName] = useState('');
  const [uploadRecords, setUploadRecords] = useState(
    DEFAULT_PMS_COLUMNS.map(col => ({ ...col, amount: '' }))
  );
  const [uploadRoomCount, setUploadRoomCount] = useState('');
  const [uploadOccupancyRate, setUploadOccupancyRate] = useState('');
  const [uploadAvgRoomRate, setUploadAvgRoomRate] = useState('');
  const [uploadGuestCount, setUploadGuestCount] = useState('');
  const [uploadBreakfastCount, setUploadBreakfastCount] = useState('');
  const [uploadOccupiedRooms, setUploadOccupiedRooms] = useState('');
  const [uploadSubmitting, setUploadSubmitting] = useState(false);

  const [showAddModal, setShowAddModal] = useState(false);
  const [addRecordSaving, setAddRecordSaving] = useState(false);
  const [addForm, setAddForm] = useState({
    warehouse: '麗格', businessDate: todayStr(),
    entryType: '貸方', pmsColumnName: '', amount: '', accountingCode: '', accountingName: '', note: ''
  });

  const [statsYear, setStatsYear] = useState(new Date().getFullYear());
  const [statsMonth, setStatsMonth] = useState('');
  const [statsData, setStatsData] = useState(null);

  const [mappingRules, setMappingRules] = useState([]);

  const [travelAgencyConfigs, setTravelAgencyConfigs] = useState([]);
  const [showTravelAgencyModal, setShowTravelAgencyModal] = useState(false);
  const [editingTravelAgency, setEditingTravelAgency] = useState(null);
  const [travelAgencyForm, setTravelAgencyForm] = useState({
    companyName: '', agencyCode: '', commissionPercentage: '', paymentType: 'NONE', dataSource: 'AUTO',
    paymentDueDay: '', paymentMethod: '', isActive: true,
  });

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

  const [paymentConfigs, setPaymentConfigs] = useState([]);
  const [paymentConfigAccounts, setPaymentConfigAccounts] = useState([]);
  const [paymentConfigWarehouse, setPaymentConfigWarehouse] = useState('');
  const [paymentConfigBuildings, setPaymentConfigBuildings] = useState([]);

  const overview = usePmsIncomeOverview({
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
  });

  const incomeRecords = usePmsIncomeRecords({
    activeTab,
    setLoading,
    setError,
    setSuccess,
    WAREHOUSES_FALLBACK,
  });

  const settlementTab = usePmsIncomeSettlement({
    activeTab,
    setLoading,
    setError,
    setSuccess,
  });

  const setActiveTab = useCallback((tab) => {
    router.push(`/pms-income?tab=${tab}`, { scroll: false });
  }, [router]);

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

  const fetchMappingRules = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/pms-income/mapping-rules');
      if (res.ok) {
        const data = await res.json();
        setMappingRules(Array.isArray(data) ? data : []);
      } else {
        setMappingRules(DEFAULT_PMS_COLUMNS.map((col, i) => ({ id: i + 1, ...col, sortOrder: i })));
      }
    } catch {
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
  }, [activeTab, fetchManualEntries, fetchManualAccounts]);

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
    if (activeTab === 'paymentConfig' || activeTab === 'travelAgency') fetchPaymentConfigs();
  }, [activeTab, fetchPaymentConfigs]);

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
        avgRoomRate: uploadAvgRoomRate ? parseFloat(uploadAvgRoomRate) : null,
        guestCount: uploadGuestCount ? parseInt(uploadGuestCount) : null,
        breakfastCount: uploadBreakfastCount ? parseInt(uploadBreakfastCount) : null,
        occupiedRooms: uploadOccupiedRooms ? parseInt(uploadOccupiedRooms) : null,
      };

      const res = await fetch('/api/pms-income/batches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        credentials: 'include'
      });

      if (!res.ok) {
        let errMsg = '匯入失敗';
        try {
          const errData = await res.json();
          errMsg = errData.error?.message || errData.error?.code || (typeof errData.error === 'string' ? errData.error : errMsg);
        } catch (_) {}
        throw new Error(errMsg);
      }

      const result = await res.json();
      setSuccess(`匯入成功！批次號: ${result.batchNo}，共 ${result.recordCount} 筆${result.isReplacement ? ' (已覆蓋舊資料)' : ''}`);
      setShowUploadModal(false);
      resetUploadForm();
      overview.fetchOverviewData();
    } catch (err) {
      setError(err.message);
    } finally {
      setUploadSubmitting(false);
    }
  };

  const resetUploadForm = () => {
    setUploadWarehouse(overview.selectedWarehouseForUpload);
    setUploadDate(todayStr());
    setUploadFileName('');
    setUploadRecords(DEFAULT_PMS_COLUMNS.map(col => ({ ...col, amount: '' })));
    setUploadRoomCount('');
    setUploadOccupancyRate('');
    setUploadAvgRoomRate('');
    setUploadGuestCount('');
    setUploadBreakfastCount('');
    setUploadOccupiedRooms('');
  };

  const handleAddRecord = async () => {
    if (addRecordSaving) return;
    setAddRecordSaving(true);
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
        warehouse: '麗格', businessDate: todayStr(),
        entryType: '貸方', pmsColumnName: '', amount: '', accountingCode: '', accountingName: '', note: ''
      });
      incomeRecords.fetchRecords();
    } catch (err) {
      setError(err.message);
    } finally {
      setAddRecordSaving(false);
    }
  };

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

  return {
    activeTab,
    setActiveTab,
    loading,
    error,
    setError,
    success,
    setSuccess,
    WAREHOUSES,
    overview,
    incomeRecords,
    settlementTab,
    showUploadModal,
    setShowUploadModal,
    uploadWarehouse,
    setUploadWarehouse,
    uploadDate,
    setUploadDate,
    uploadFileName,
    setUploadFileName,
    uploadRecords,
    uploadRoomCount,
    setUploadRoomCount,
    uploadOccupancyRate,
    setUploadOccupancyRate,
    uploadAvgRoomRate,
    setUploadAvgRoomRate,
    uploadGuestCount,
    setUploadGuestCount,
    uploadBreakfastCount,
    setUploadBreakfastCount,
    uploadOccupiedRooms,
    setUploadOccupiedRooms,
    uploadSubmitting,
    handleUploadRecordChange,
    handleUploadSubmit,
    resetUploadForm,
    showAddModal,
    setShowAddModal,
    addForm,
    setAddForm,
    addRecordSaving,
    handleAddRecord,
    statsYear,
    setStatsYear,
    statsMonth,
    setStatsMonth,
    statsData,
    fetchStats,
    mappingRules,
    travelAgencyConfigs,
    fetchTravelAgencyConfigs,
    showTravelAgencyModal,
    setShowTravelAgencyModal,
    editingTravelAgency,
    setEditingTravelAgency,
    travelAgencyForm,
    setTravelAgencyForm,
    manualMonth,
    setManualMonth,
    manualEntries,
    fetchManualEntries,
    showManualEntryModal,
    setShowManualEntryModal,
    manualEntryForm,
    setManualEntryForm,
    editingManualEntry,
    setEditingManualEntry,
    manualAccounts,
    showConfirmCommissionModal,
    setShowConfirmCommissionModal,
    confirmCommissionForm,
    setConfirmCommissionForm,
    selectedManualIds,
    setSelectedManualIds,
    paymentConfigs,
    paymentConfigAccounts,
    paymentConfigWarehouse,
    setPaymentConfigWarehouse,
    paymentConfigBuildings,
    handleSavePaymentConfig,
  };
}
