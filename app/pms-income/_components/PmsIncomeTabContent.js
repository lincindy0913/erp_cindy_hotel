'use client';

import { Suspense, lazy } from 'react';

const PmsIncomeOverviewTab = lazy(() => import('@/components/pms-income/PmsIncomeOverviewTab'));
const PmsIncomeRecordsTab = lazy(() => import('@/components/pms-income/PmsIncomeRecordsTab'));
const PmsIncomeSettlementTab = lazy(() => import('@/components/pms-income/PmsIncomeSettlementTab'));
const PmsIncomeStatisticsTab = lazy(() => import('@/components/pms-income/PmsIncomeStatisticsTab'));
const PmsIncomeTravelAgencyTab = lazy(() => import('@/components/pms-income/PmsIncomeTravelAgencyTab'));
const PmsIncomeManualCommissionTab = lazy(() => import('@/components/pms-income/PmsIncomeManualCommissionTab'));
const PmsIncomePaymentConfigTab = lazy(() => import('@/components/pms-income/PmsIncomePaymentConfigTab'));
const PmsIncomeMappingTab = lazy(() => import('@/components/pms-income/PmsIncomeMappingTab'));
const PmsIncomeExcelImportTab = lazy(() => import('@/components/pms-income/PmsIncomeExcelImportTab'));
const PmsIncomePresetRecordsTab = lazy(() => import('@/components/pms-income/PmsIncomePresetRecordsTab'));
const PmsIncomeBookingCenterTab = lazy(() => import('@/components/pms-income/PmsIncomeBookingCenterTab'));
const PmsIncomeOtaReconTab = lazy(() => import('@/components/pms-income/PmsIncomeOtaReconTab'));
const PmsIncomeOtaCommissionTab = lazy(() => import('@/components/pms-income/PmsIncomeOtaCommissionTab'));
const PmsIncomeVendorBillingTab = lazy(() => import('@/components/pms-income/PmsIncomeVendorBillingTab'));
const PmsIncomeReservationTab = lazy(() => import('@/components/pms-income/PmsIncomeReservationTab'));
const PmsIncomeDepositReconTab = lazy(() => import('@/components/pms-income/PmsIncomeDepositReconTab'));
const PmsIncomeMonthCloseTab = lazy(() => import('@/components/pms-income/PmsIncomeMonthCloseTab'));
const PmsIncomeCashierSummaryTab = lazy(() => import('@/components/pms-income/PmsIncomeCashierSummaryTab'));
const PmsIncomeInvoiceTab = lazy(() => import('@/components/pms-income/PmsIncomeInvoiceTab'));
const PmsIncomeCCFeeReconTab = lazy(() => import('@/components/pms-income/PmsIncomeCCFeeReconTab'));
const PmsIncomeCreditCardTab = lazy(() => import('@/components/pms-income/PmsIncomeCreditCardTab'));

export default function PmsIncomeTabContent({ p }) {
  const { activeTab, setActiveTab, loading, WAREHOUSES, overview, incomeRecords, settlementTab } = p;

  return (
    <Suspense fallback={<div className="p-8 text-center text-gray-400">載入中…</div>}>
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
          setUploadWarehouse={p.setUploadWarehouse}
          setShowUploadModal={p.setShowUploadModal}
          handleExcelUpload={overview.handleExcelUpload}
          excelParsing={overview.excelParsing}
          handleDeleteBatch={overview.handleDeleteBatch}
        />
      )}
      {activeTab === 'excelImport' && <PmsIncomeExcelImportTab WAREHOUSES={WAREHOUSES} setActiveTab={setActiveTab} />}
      {activeTab === 'reservations' && <PmsIncomeReservationTab WAREHOUSES={WAREHOUSES} />}
      {activeTab === 'depositRecon' && <PmsIncomeDepositReconTab WAREHOUSES={WAREHOUSES} />}
      {activeTab === 'invoiceQuery' && <PmsIncomeInvoiceTab WAREHOUSES={WAREHOUSES} />}
      {activeTab === 'ccFeeRecon' && <PmsIncomeCCFeeReconTab WAREHOUSES={WAREHOUSES} />}
      {activeTab === 'creditCardStatement' && <PmsIncomeCreditCardTab WAREHOUSES={WAREHOUSES} />}
      {activeTab === 'otaDeposit' && (
        <PmsIncomePresetRecordsTab
          preset="otaDeposit"
          title="OTA 訂金（飯店 PMS 明細）"
          subtitle="篩選：訂金、預收、網訂、沖訂金、收訂金等；資料須先由「每日匯入總覽」或 Excel 匯入。"
          WAREHOUSES={WAREHOUSES}
          accent="orange"
          onGoFullRecords={() => setActiveTab('records')}
        />
      )}
      {activeTab === 'otaRecon' && <PmsIncomeOtaReconTab WAREHOUSES={WAREHOUSES} />}
      {activeTab === 'otaCommission' && <PmsIncomeOtaCommissionTab WAREHOUSES={WAREHOUSES} />}
      {activeTab === 'bookingCenter' && <PmsIncomeBookingCenterTab WAREHOUSES={WAREHOUSES} setActiveTab={setActiveTab} />}
      {activeTab === 'vendorBilling' && <PmsIncomeVendorBillingTab WAREHOUSES={WAREHOUSES} />}
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
          setShowAddModal={p.setShowAddModal}
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
      {activeTab === 'cashierSummary' && <PmsIncomeCashierSummaryTab WAREHOUSES={WAREHOUSES} />}
      {activeTab === 'monthClose' && <PmsIncomeMonthCloseTab WAREHOUSES={WAREHOUSES} />}
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
          pushedCount={settlementTab.pushedCount}
          settleResult={settlementTab.settleResult}
          handleSettleMonth={settlementTab.handleSettleMonth}
          handleVerifyMonth={settlementTab.handleVerifyMonth}
          handleVerifyBatches={settlementTab.handleVerifyBatches}
          handleUnlockMonth={settlementTab.handleUnlockMonth}
        />
      )}
      {activeTab === 'statistics' && (
        <PmsIncomeStatisticsTab
          statsYear={p.statsYear}
          setStatsYear={p.setStatsYear}
          statsMonth={p.statsMonth}
          setStatsMonth={p.setStatsMonth}
          fetchStats={p.fetchStats}
          loading={loading}
          statsData={p.statsData}
        />
      )}
      {activeTab === 'travelAgency' && (
        <PmsIncomeTravelAgencyTab
          loading={loading}
          travelAgencyConfigs={p.travelAgencyConfigs}
          setError={p.setError}
          fetchTravelAgencyConfigs={p.fetchTravelAgencyConfigs}
          setEditingTravelAgency={p.setEditingTravelAgency}
          setTravelAgencyForm={p.setTravelAgencyForm}
          setShowTravelAgencyModal={p.setShowTravelAgencyModal}
        />
      )}
      {activeTab === 'manualCommission' && (
        <PmsIncomeManualCommissionTab
          manualMonth={p.manualMonth}
          setManualMonth={p.setManualMonth}
          fetchManualEntries={p.fetchManualEntries}
          setEditingManualEntry={p.setEditingManualEntry}
          setManualEntryForm={p.setManualEntryForm}
          setShowManualEntryModal={p.setShowManualEntryModal}
          manualEntries={p.manualEntries}
          loading={loading}
          selectedManualIds={p.selectedManualIds}
          setSelectedManualIds={p.setSelectedManualIds}
          setConfirmCommissionForm={p.setConfirmCommissionForm}
          setShowConfirmCommissionModal={p.setShowConfirmCommissionModal}
          setError={p.setError}
        />
      )}
      {activeTab === 'paymentConfig' && (
        <PmsIncomePaymentConfigTab
          paymentConfigWarehouse={p.paymentConfigWarehouse}
          setPaymentConfigWarehouse={p.setPaymentConfigWarehouse}
          paymentConfigBuildings={p.paymentConfigBuildings}
          paymentConfigAccounts={p.paymentConfigAccounts}
          paymentConfigs={p.paymentConfigs}
          handleSavePaymentConfig={p.handleSavePaymentConfig}
        />
      )}
      {activeTab === 'mapping' && (
        <PmsIncomeMappingTab loading={loading} mappingRules={p.mappingRules} />
      )}
    </Suspense>
  );
}
