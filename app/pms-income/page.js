'use client';

import { Suspense } from 'react';
import Navigation from '@/components/Navigation';
import NotificationBanner from '@/components/NotificationBanner';
import ExportButtons from '@/components/ExportButtons';
import { EXPORT_CONFIGS } from '@/lib/export-columns';
import { TAB_GROUPS, TABS } from '@/components/pms-income/pmsIncomeConstants';
import PmsIncomeUploadModal from '@/components/pms-income/PmsIncomeUploadModal';
import PmsIncomeAddRecordModal from '@/components/pms-income/PmsIncomeAddRecordModal';
import PmsIncomeMiniDashboard from '@/components/pms-income/PmsIncomeMiniDashboard';
import PmsIncomeDailyTodoBar from '@/components/pms-income/PmsIncomeDailyTodoBar';
import FetchErrorBanner from '@/components/FetchErrorBanner';
import HelpButton from '@/components/HelpButton';
import { usePmsIncome } from './_hooks/usePmsIncome';
import TravelAgencyModal from './_components/TravelAgencyModal';
import ConfirmCommissionModal from './_components/ConfirmCommissionModal';
import ManualEntryModal from './_components/ManualEntryModal';
import PmsIncomeTabContent from './_components/PmsIncomeTabContent';

export default function PmsIncomePageWrapper() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-gray-500">載入中...</div>}>
      <PmsIncomePage />
    </Suspense>
  );
}

function PmsIncomePage() {
  const p = usePmsIncome();

  return (
    <div className="min-h-screen page-bg-pms-income">
      <Navigation borderColor="border-teal-500" />
      <NotificationBanner moduleFilter="pms-income" />

      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-teal-800">PMS 收入管理</h2>
            <p className="text-sm text-gray-600 mt-1">管理飯店 PMS 系統日報表的匯入與收入記錄</p>
          </div>
          <div className="flex items-center gap-3">
            <HelpButton anchor="十四pms-收入飯店" />
            {p.activeTab === 'records' && (
              <ExportButtons
                data={p.incomeRecords.records}
                columns={EXPORT_CONFIGS.pmsIncome.columns}
                exportName={EXPORT_CONFIGS.pmsIncome.filename}
                title="PMS 收入記錄"
                sheetName="收入記錄"
              />
            )}
          </div>
        </div>

        {p.success && (
          <div className="mb-4 px-4 py-3 bg-green-50 border border-green-200 text-green-700 rounded-lg text-sm flex items-center justify-between">
            <span>{p.success}</span>
            <button onClick={() => p.setSuccess('')} className="text-green-500 hover:text-green-700">&times;</button>
          </div>
        )}
        {p.error && !p.showUploadModal && !p.showAddModal && (
          <div className="mb-4">
            <FetchErrorBanner message={p.error} onRetry={p.activeTab === 'statistics' ? p.fetchStats : undefined} />
          </div>
        )}

        <PmsIncomeDailyTodoBar WAREHOUSES={p.WAREHOUSES} setActiveTab={p.setActiveTab} />
        <PmsIncomeMiniDashboard WAREHOUSES={p.WAREHOUSES} />

        <div className="flex gap-6 items-start">
          <aside className="w-52 flex-shrink-0 sticky top-4 self-start">
            <nav className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
              {TAB_GROUPS.map((group, gi) => (
                <div key={group.key} className={gi > 0 ? 'border-t border-gray-200' : ''}>
                  <div className="px-3 py-2 text-xs font-semibold text-gray-400 bg-gray-50 uppercase tracking-wider flex items-center gap-1.5">
                    <span>{group.icon}</span>
                    <span>{group.label}</span>
                  </div>
                  {group.tabs.map(tabKey => {
                    const tab = TABS.find(t => t.key === tabKey);
                    if (!tab) return null;
                    return (
                      <button
                        key={tabKey}
                        onClick={() => p.setActiveTab(tabKey)}
                        className={`w-full text-left px-4 py-2.5 text-sm transition-colors border-t border-gray-50 ${
                          p.activeTab === tabKey
                            ? 'bg-teal-600 text-white font-medium'
                            : 'text-gray-700 hover:bg-teal-50 hover:text-teal-700'
                        }`}
                      >
                        {tab.label}
                      </button>
                    );
                  })}
                </div>
              ))}
            </nav>
          </aside>

          <div className="flex-1 min-w-0">
            <PmsIncomeTabContent p={p} />
          </div>
        </div>
      </div>

      <PmsIncomeUploadModal
        showUploadModal={p.showUploadModal}
        onClose={() => p.setShowUploadModal(false)}
        resetUploadForm={p.resetUploadForm}
        uploadRecords={p.uploadRecords}
        handleUploadRecordChange={p.handleUploadRecordChange}
        uploadWarehouse={p.uploadWarehouse}
        setUploadWarehouse={p.setUploadWarehouse}
        uploadDate={p.uploadDate}
        setUploadDate={p.setUploadDate}
        uploadFileName={p.uploadFileName}
        setUploadFileName={p.setUploadFileName}
        uploadRoomCount={p.uploadRoomCount}
        setUploadRoomCount={p.setUploadRoomCount}
        uploadOccupancyRate={p.uploadOccupancyRate}
        setUploadOccupancyRate={p.setUploadOccupancyRate}
        uploadAvgRoomRate={p.uploadAvgRoomRate}
        setUploadAvgRoomRate={p.setUploadAvgRoomRate}
        uploadGuestCount={p.uploadGuestCount}
        setUploadGuestCount={p.setUploadGuestCount}
        uploadBreakfastCount={p.uploadBreakfastCount}
        setUploadBreakfastCount={p.setUploadBreakfastCount}
        uploadOccupiedRooms={p.uploadOccupiedRooms}
        setUploadOccupiedRooms={p.setUploadOccupiedRooms}
        handleUploadSubmit={p.handleUploadSubmit}
        uploadSubmitting={p.uploadSubmitting}
        error={p.error}
        WAREHOUSES={p.WAREHOUSES}
        overviewBuildings={p.overview.overviewBuildings}
      />
      <PmsIncomeAddRecordModal
        showAddModal={p.showAddModal}
        onClose={() => p.setShowAddModal(false)}
        addForm={p.addForm}
        setAddForm={p.setAddForm}
        error={p.error}
        handleAddRecord={p.handleAddRecord}
        addRecordSaving={p.addRecordSaving}
        WAREHOUSES={p.WAREHOUSES}
      />
      <TravelAgencyModal
        showTravelAgencyModal={p.showTravelAgencyModal}
        setShowTravelAgencyModal={p.setShowTravelAgencyModal}
        editingTravelAgency={p.editingTravelAgency}
        travelAgencyForm={p.travelAgencyForm}
        setTravelAgencyForm={p.setTravelAgencyForm}
        paymentConfigAccounts={p.paymentConfigAccounts}
        setError={p.setError}
        setSuccess={p.setSuccess}
        fetchTravelAgencyConfigs={p.fetchTravelAgencyConfigs}
      />
      <ConfirmCommissionModal
        showConfirmCommissionModal={p.showConfirmCommissionModal}
        setShowConfirmCommissionModal={p.setShowConfirmCommissionModal}
        selectedManualIds={p.selectedManualIds}
        setSelectedManualIds={p.setSelectedManualIds}
        confirmCommissionForm={p.confirmCommissionForm}
        setConfirmCommissionForm={p.setConfirmCommissionForm}
        manualAccounts={p.manualAccounts}
        setError={p.setError}
        setSuccess={p.setSuccess}
        fetchManualEntries={p.fetchManualEntries}
      />
      <ManualEntryModal
        showManualEntryModal={p.showManualEntryModal}
        setShowManualEntryModal={p.setShowManualEntryModal}
        editingManualEntry={p.editingManualEntry}
        manualMonth={p.manualMonth}
        manualEntryForm={p.manualEntryForm}
        setManualEntryForm={p.setManualEntryForm}
        setError={p.setError}
        setSuccess={p.setSuccess}
        fetchManualEntries={p.fetchManualEntries}
      />
    </div>
  );
}
