'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Navigation from '@/components/Navigation';
import NotificationBanner from '@/components/NotificationBanner';
import ExportButtons from '@/components/ExportButtons';
import { EXPORT_CONFIGS } from '@/lib/export-columns';
import { TABS, WAREHOUSES_FALLBACK, DEFAULT_PMS_COLUMNS } from '@/components/pms-income/pmsIncomeConstants';
import PmsIncomeUploadModal from '@/components/pms-income/PmsIncomeUploadModal';
import PmsIncomeAddRecordModal from '@/components/pms-income/PmsIncomeAddRecordModal';
import PmsIncomeOverviewTab from '@/components/pms-income/PmsIncomeOverviewTab';
import PmsIncomeRecordsTab from '@/components/pms-income/PmsIncomeRecordsTab';
import PmsIncomeSettlementTab from '@/components/pms-income/PmsIncomeSettlementTab';
import PmsIncomeStatisticsTab from '@/components/pms-income/PmsIncomeStatisticsTab';
import PmsIncomeTravelAgencyTab from '@/components/pms-income/PmsIncomeTravelAgencyTab';
import PmsIncomeManualCommissionTab from '@/components/pms-income/PmsIncomeManualCommissionTab';
import PmsIncomePaymentConfigTab from '@/components/pms-income/PmsIncomePaymentConfigTab';
import PmsIncomeMappingTab from '@/components/pms-income/PmsIncomeMappingTab';
import { usePmsIncomeOverview } from '@/components/pms-income/usePmsIncomeOverview';
import { usePmsIncomeRecords } from '@/components/pms-income/usePmsIncomeRecords';
import { usePmsIncomeSettlement } from '@/components/pms-income/usePmsIncomeSettlement';

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
  const [WAREHOUSES, setWAREHOUSES] = useState(WAREHOUSES_FALLBACK);

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
  const [uploadGuestCount, setUploadGuestCount] = useState('');
  const [uploadBreakfastCount, setUploadBreakfastCount] = useState('');
  const [uploadOccupiedRooms, setUploadOccupiedRooms] = useState('');
  const [uploadSubmitting, setUploadSubmitting] = useState(false);

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

  // ========================
  // Tab switching
  // ========================
  const setActiveTab = useCallback((tab) => {
    router.push(`/pms-income?tab=${tab}`, { scroll: false });
  }, [router]);

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
    setUploadDate(new Date().toISOString().split('T')[0]);
    setUploadFileName('');
    setUploadRecords(DEFAULT_PMS_COLUMNS.map(col => ({ ...col, amount: '' })));
    setUploadRoomCount('');
    setUploadOccupancyRate('');
    setUploadAvgRoomRate('');
    setUploadGuestCount('');
    setUploadBreakfastCount('');
    setUploadOccupiedRooms('');
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
      incomeRecords.fetchRecords();
    } catch (err) {
      setError(err.message);
    }
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
              data={incomeRecords.records}
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

        {activeTab === 'overview' && (
          <PmsIncomeOverviewTab
            overviewYear={overview.overviewYear}
            setOverviewYear={overview.setOverviewYear}
            overviewMonth={overview.overviewMonth}
            setOverviewMonth={overview.setOverviewMonth}
            fetchOverviewData={overview.fetchOverviewData}
            loading={loading}
            monthlySummary={overview.monthlySummary}
            batches={overview.batches}
            WAREHOUSES={WAREHOUSES}
            buildingList={overview.buildingList}
            selectedWarehouseForUpload={overview.selectedWarehouseForUpload}
            setOverviewUploadWarehouse={overview.setOverviewUploadWarehouse}
            setUploadWarehouse={setUploadWarehouse}
            setShowUploadModal={setShowUploadModal}
            handleExcelUpload={overview.handleExcelUpload}
            excelParsing={overview.excelParsing}
            handleDeleteBatch={overview.handleDeleteBatch}
          />
        )}

        {activeTab === 'records' && (
          <PmsIncomeRecordsTab
            filterStartDate={incomeRecords.filterStartDate}
            filterEndDate={incomeRecords.filterEndDate}
            occupancyLoading={incomeRecords.occupancyLoading}
            occupancyStats={incomeRecords.occupancyStats}
            WAREHOUSES={WAREHOUSES}
            filterWarehouse={incomeRecords.filterWarehouse}
            setFilterWarehouse={incomeRecords.setFilterWarehouse}
            setRecordsPage={incomeRecords.setRecordsPage}
            setFilterStartDate={incomeRecords.setFilterStartDate}
            setFilterEndDate={incomeRecords.setFilterEndDate}
            filterEntryType={incomeRecords.filterEntryType}
            setFilterEntryType={incomeRecords.setFilterEntryType}
            filterAccountingCode={incomeRecords.filterAccountingCode}
            setFilterAccountingCode={incomeRecords.setFilterAccountingCode}
            handlePushToCashflow={incomeRecords.handlePushToCashflow}
            pushToCashflowLoading={incomeRecords.pushToCashflowLoading}
            setShowAddModal={setShowAddModal}
            creditCardFeeForm={incomeRecords.creditCardFeeForm}
            setCreditCardFeeForm={incomeRecords.setCreditCardFeeForm}
            handleSaveCreditCardFee={incomeRecords.handleSaveCreditCardFee}
            creditCardFees={incomeRecords.creditCardFees}
            loading={loading}
            records={incomeRecords.records}
            handleSort={incomeRecords.handleSort}
            sortField={incomeRecords.sortField}
            sortDir={incomeRecords.sortDir}
            sortedRecords={incomeRecords.sortedRecords}
            handleDeleteRecord={incomeRecords.handleDeleteRecord}
            recordsTotal={incomeRecords.recordsTotal}
            recordsLimit={incomeRecords.recordsLimit}
            recordsPage={incomeRecords.recordsPage}
          />
        )}

        {activeTab === 'settlement' && (
          <PmsIncomeSettlementTab
            WAREHOUSES={WAREHOUSES}
            settlementWarehouse={settlementTab.settlementWarehouse}
            setSettlementWarehouse={settlementTab.setSettlementWarehouse}
            settlementYearMonth={settlementTab.settlementYearMonth}
            setSettlementYearMonth={settlementTab.setSettlementYearMonth}
            fetchSettlementData={settlementTab.fetchSettlementData}
            settlementStatus={settlementTab.settlementStatus}
            settlementBatches={settlementTab.settlementBatches}
            settling={settlementTab.settling}
            handleSettleMonth={settlementTab.handleSettleMonth}
            handleVerifyMonth={settlementTab.handleVerifyMonth}
            handleVerifyBatches={settlementTab.handleVerifyBatches}
          />
        )}

        {activeTab === 'statistics' && (
          <PmsIncomeStatisticsTab
            statsYear={statsYear}
            setStatsYear={setStatsYear}
            statsMonth={statsMonth}
            setStatsMonth={setStatsMonth}
            fetchStats={fetchStats}
            loading={loading}
            statsData={statsData}
          />
        )}

        {activeTab === 'travelAgency' && (
          <PmsIncomeTravelAgencyTab
            loading={loading}
            travelAgencyConfigs={travelAgencyConfigs}
            setError={setError}
            fetchTravelAgencyConfigs={fetchTravelAgencyConfigs}
            setEditingTravelAgency={setEditingTravelAgency}
            setTravelAgencyForm={setTravelAgencyForm}
            setShowTravelAgencyModal={setShowTravelAgencyModal}
          />
        )}

        {activeTab === 'manualCommission' && (
          <PmsIncomeManualCommissionTab
            manualMonth={manualMonth}
            setManualMonth={setManualMonth}
            fetchManualEntries={fetchManualEntries}
            setEditingManualEntry={setEditingManualEntry}
            setManualEntryForm={setManualEntryForm}
            setShowManualEntryModal={setShowManualEntryModal}
            manualEntries={manualEntries}
            loading={loading}
            selectedManualIds={selectedManualIds}
            setSelectedManualIds={setSelectedManualIds}
            setConfirmCommissionForm={setConfirmCommissionForm}
            setShowConfirmCommissionModal={setShowConfirmCommissionModal}
            setError={setError}
          />
        )}

        {activeTab === 'paymentConfig' && (
          <PmsIncomePaymentConfigTab
            paymentConfigWarehouse={paymentConfigWarehouse}
            setPaymentConfigWarehouse={setPaymentConfigWarehouse}
            paymentConfigBuildings={paymentConfigBuildings}
            paymentConfigAccounts={paymentConfigAccounts}
            paymentConfigs={paymentConfigs}
            handleSavePaymentConfig={handleSavePaymentConfig}
          />
        )}

        {activeTab === 'mapping' && (
          <PmsIncomeMappingTab loading={loading} mappingRules={mappingRules} />
        )}
      </div>

      {/* Modals */}
      <PmsIncomeUploadModal
        showUploadModal={showUploadModal}
        onClose={() => setShowUploadModal(false)}
        resetUploadForm={resetUploadForm}
        uploadRecords={uploadRecords}
        handleUploadRecordChange={handleUploadRecordChange}
        uploadWarehouse={uploadWarehouse}
        setUploadWarehouse={setUploadWarehouse}
        uploadDate={uploadDate}
        setUploadDate={setUploadDate}
        uploadFileName={uploadFileName}
        setUploadFileName={setUploadFileName}
        uploadRoomCount={uploadRoomCount}
        setUploadRoomCount={setUploadRoomCount}
        uploadOccupancyRate={uploadOccupancyRate}
        setUploadOccupancyRate={setUploadOccupancyRate}
        uploadAvgRoomRate={uploadAvgRoomRate}
        setUploadAvgRoomRate={setUploadAvgRoomRate}
        uploadGuestCount={uploadGuestCount}
        setUploadGuestCount={setUploadGuestCount}
        uploadBreakfastCount={uploadBreakfastCount}
        setUploadBreakfastCount={setUploadBreakfastCount}
        uploadOccupiedRooms={uploadOccupiedRooms}
        setUploadOccupiedRooms={setUploadOccupiedRooms}
        handleUploadSubmit={handleUploadSubmit}
        uploadSubmitting={uploadSubmitting}
        error={error}
        WAREHOUSES={WAREHOUSES}
        overviewBuildings={overview.overviewBuildings}
      />
      <PmsIncomeAddRecordModal
        showAddModal={showAddModal}
        onClose={() => setShowAddModal(false)}
        addForm={addForm}
        setAddForm={setAddForm}
        error={error}
        handleAddRecord={handleAddRecord}
        WAREHOUSES={WAREHOUSES}
      />

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
