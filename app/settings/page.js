'use client';

import { useState, useEffect } from 'react';
import Navigation from '@/components/Navigation';
import FetchErrorBanner from '@/components/FetchErrorBanner';

// Hooks
import { useSettingsCore } from './_hooks/useSettingsCore';
import { useSettingsWarehouses } from './_hooks/useSettingsWarehouses';
import { useSettingsPmsMapping } from './_hooks/useSettingsPmsMapping';
import { useSettingsExpenseCategories } from './_hooks/useSettingsExpenseCategories';
import { useSettingsUsers } from './_hooks/useSettingsUsers';

// Section components
import WarehousesSection from './_sections/WarehousesSection';
import DepartmentsSection from './_sections/DepartmentsSection';
import MasterDataSection from './_sections/MasterDataSection';
import FinanceSection from './_sections/FinanceSection';
import PmsMappingSection from './_sections/PmsMappingSection';
import ExpenseCategoriesSection from './_sections/ExpenseCategoriesSection';
import NotificationsSection from './_sections/NotificationsSection';
import NotificationChannelsSection from './_sections/NotificationChannelsSection';
import CashCountSection from './_sections/CashCountSection';
import DataImportSection from './_sections/DataImportSection';
import UsersSection from './_sections/UsersSection';
import SecuritySection from './_sections/SecuritySection';
import SystemInfoSection from './_sections/SystemInfoSection';

const SECTIONS = [
  { key: 'master-data', label: '基礎主資料', icon: '📋' },
  { key: 'warehouses', label: '倉庫設定', icon: '🏪' },
  { key: 'departments', label: '館別設定', icon: '🏢' },
  { key: 'finance', label: '財務參數', icon: '💰' },
  { key: 'pms-mapping', label: 'PMS 科目對應', icon: '🔗' },
  { key: 'expense-categories', label: '費用分類管理', icon: '📂' },
  { key: 'notifications', label: '通知設定', icon: '🔔' },
  { key: 'notification-channels', label: '通知渠道管理', icon: '📨' },
  { key: 'cash-count', label: '現金盤點設定', icon: '🏦' },
  { key: 'data-import', label: '期初資料匯入', icon: '📥' },
  { key: 'users', label: '使用者管理', icon: '👥' },
  { key: 'master-governance', label: '主檔治理', icon: '🔍', href: '/settings/master-data-governance' },
  { key: 'security', label: '帳號安全', icon: '🔒' },
  { key: 'system-info', label: '系統資訊', icon: '⚙️' },
];

export default function SettingsPage() {
  const [activeSection, setActiveSection] = useState('master-data');

  // Core hook — loads settings, finance, notifications, system info, master data counts, expense categories
  const core = useSettingsCore();

  // Feature-specific hooks
  const warehouses = useSettingsWarehouses({
    activeSection,
    showToast: core.showToast,
    setSaving: core.setSaving,
  });

  const pmsMapping = useSettingsPmsMapping({
    activeSection,
    showToast: core.showToast,
    setSaving: core.setSaving,
  });

  const expenseCategories = useSettingsExpenseCategories({
    showToast: core.showToast,
    setSaving: core.setSaving,
    fetchExpenseCategories: core.fetchExpenseCategories,
  });

  const usersHook = useSettingsUsers({ activeSection });

  // ---- URL Hash Navigation ----
  useEffect(() => {
    const hash = window.location.hash.replace('#', '');
    if (hash) {
      const matched = SECTIONS.find(s => s.key === hash);
      if (matched) setActiveSection(hash);
    }

    function onHashChange() {
      const newHash = window.location.hash.replace('#', '');
      if (newHash) {
        const matched = SECTIONS.find(s => s.key === newHash);
        if (matched) setActiveSection(newHash);
      }
    }
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  function handleSectionChange(key) {
    setActiveSection(key);
    window.location.hash = key;
  }

  // ---- Section renderer ----
  function renderContent() {
    switch (activeSection) {
      case 'warehouses':
        return (
          <WarehousesSection
            warehouseData={warehouses.warehouseData}
            warehouseLoading={warehouses.warehouseLoading}
            saving={core.saving}
            selectedBuildingForStorage={warehouses.selectedBuildingForStorage}
            setSelectedBuildingForStorage={warehouses.setSelectedBuildingForStorage}
            newWarehouse={warehouses.newWarehouse}
            setNewWarehouse={warehouses.setNewWarehouse}
            addStorageLocation={warehouses.addStorageLocation}
            deleteStorageLocation={warehouses.deleteStorageLocation}
          />
        );
      case 'departments':
        return (
          <DepartmentsSection
            warehouseData={warehouses.warehouseData}
            warehouseLoading={warehouses.warehouseLoading}
            saving={core.saving}
            newBuilding={warehouses.newBuilding}
            setNewBuilding={warehouses.setNewBuilding}
            addBuilding={warehouses.addBuilding}
            newDeptWarehouse={warehouses.newDeptWarehouse}
            setNewDeptWarehouse={warehouses.setNewDeptWarehouse}
            newDeptName={warehouses.newDeptName}
            setNewDeptName={warehouses.setNewDeptName}
            addDepartmentToWarehouse={warehouses.addDepartmentToWarehouse}
            deleteWarehouse={warehouses.deleteWarehouse}
            deleteDepartment={warehouses.deleteDepartment}
          />
        );
      case 'master-data':
        return <MasterDataSection masterDataCounts={core.masterDataCounts} auditInfo={core.auditInfo} />;
      case 'finance':
        return (
          <FinanceSection
            taxRate={core.taxRate}
            setTaxRate={core.setTaxRate}
            saving={core.saving}
            saveTaxRate={core.saveTaxRate}
            invoiceTitles={core.invoiceTitles}
            newInvoiceTitle={core.newInvoiceTitle}
            setNewInvoiceTitle={core.setNewInvoiceTitle}
            newInvoiceTaxId={core.newInvoiceTaxId}
            setNewInvoiceTaxId={core.setNewInvoiceTaxId}
            addInvoiceTitle={core.addInvoiceTitle}
            deleteInvoiceTitle={core.deleteInvoiceTitle}
            paymentMethods={core.paymentMethods}
            newPaymentMethod={core.newPaymentMethod}
            setNewPaymentMethod={core.setNewPaymentMethod}
            addPaymentMethod={core.addPaymentMethod}
            deletePaymentMethod={core.deletePaymentMethod}
            auditInfo={core.auditInfo}
          />
        );
      case 'pms-mapping':
        return (
          <PmsMappingSection
            mappingRules={pmsMapping.mappingRules}
            mappingSubTab={pmsMapping.mappingSubTab}
            setMappingSubTab={pmsMapping.setMappingSubTab}
            editingMappingId={pmsMapping.editingMappingId}
            mappingEditForm={pmsMapping.mappingEditForm}
            setMappingEditForm={pmsMapping.setMappingEditForm}
            showAddMappingForm={pmsMapping.showAddMappingForm}
            setShowAddMappingForm={pmsMapping.setShowAddMappingForm}
            newMappingForm={pmsMapping.newMappingForm}
            setNewMappingForm={pmsMapping.setNewMappingForm}
            accountingSubjects={pmsMapping.accountingSubjects}
            saving={core.saving}
            startEditMapping={pmsMapping.startEditMapping}
            cancelEditMapping={pmsMapping.cancelEditMapping}
            saveMappingEdit={pmsMapping.saveMappingEdit}
            addMappingRule={pmsMapping.addMappingRule}
            deleteMappingRule={pmsMapping.deleteMappingRule}
            auditInfo={core.auditInfo}
          />
        );
      case 'expense-categories':
        return (
          <ExpenseCategoriesSection
            expenseCategories={core.expenseCategories}
            categoryForm={expenseCategories.categoryForm}
            setCategoryForm={expenseCategories.setCategoryForm}
            editingCategoryId={expenseCategories.editingCategoryId}
            saving={core.saving}
            saveExpenseCategory={expenseCategories.saveExpenseCategory}
            editExpenseCategory={expenseCategories.editExpenseCategory}
            cancelEditCategory={expenseCategories.cancelEditCategory}
            deleteExpenseCategory={expenseCategories.deleteExpenseCategory}
            auditInfo={core.auditInfo}
          />
        );
      case 'notifications':
        return (
          <NotificationsSection
            notificationSettings={core.notificationSettings}
            setNotificationSettings={core.setNotificationSettings}
            saving={core.saving}
            saveNotificationSettings={core.saveNotificationSettings}
            auditInfo={core.auditInfo}
          />
        );
      case 'notification-channels':
        return <NotificationChannelsSection showToast={core.showToast} />;
      case 'cash-count':
        return <CashCountSection showToast={core.showToast} />;
      case 'data-import':
        return <DataImportSection showToast={core.showToast} />;
      case 'users':
        return (
          <UsersSection
            users={usersHook.users}
            usersLoading={usersHook.usersLoading}
            usersError={usersHook.usersError}
            fetchUsers={usersHook.fetchUsers}
            auditInfo={core.auditInfo}
          />
        );
      case 'security':
        return <SecuritySection />;
      case 'system-info':
        return (
          <SystemInfoSection
            systemInfo={core.systemInfo}
            showToast={core.showToast}
            fetchAllData={core.fetchAllData}
            auditInfo={core.auditInfo}
          />
        );
      default:
        return null;
    }
  }

  if (core.loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navigation borderColor="border-gray-500" />
        <div className="flex items-center justify-center h-[calc(100vh-64px)]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-600 mx-auto"></div>
            <p className="mt-4 text-gray-500 text-sm">載入系統設定中...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation borderColor="border-gray-500" />
      {core.settingsError && (
        <div className="max-w-5xl mx-auto px-4 pt-4">
          <FetchErrorBanner message={core.settingsError} onRetry={core.fetchAllData} />
        </div>
      )}

      {/* Toast Notification */}
      {core.toast && (
        <div className="fixed top-4 right-4 z-50 animate-slide-in">
          <div
            className={`px-5 py-3 rounded-lg shadow-lg text-sm font-medium text-white ${
              core.toast.type === 'error' ? 'bg-red-500' : 'bg-gray-700'
            }`}
          >
            {core.toast.message}
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Page Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-700">系統設定</h1>
          <p className="text-sm text-gray-500 mt-1">管理系統參數、主資料、PMS對應、財務設定、通知門檻、使用者與費用分類</p>
        </div>

        <div className="flex flex-col lg:flex-row gap-6">
          {/* Left Sidebar */}
          <div className="lg:w-60 flex-shrink-0">
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden sticky top-8">
              <div className="px-4 py-3 bg-gray-100 border-b border-gray-200">
                <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wider">設定選單</h2>
              </div>
              <nav className="p-2 space-y-1">
                {SECTIONS.map((section) => (
                  section.href ? (
                    <a
                      key={section.key}
                      href={section.href}
                      className="w-full text-left px-4 py-3 rounded-lg text-sm font-medium transition-all duration-150 flex items-center gap-3 text-gray-600 hover:bg-gray-100 hover:text-gray-800"
                    >
                      <span className="text-base">{section.icon}</span>
                      <span>{section.label}</span>
                      <span className="ml-auto text-xs text-gray-400">&rarr;</span>
                    </a>
                  ) : (
                    <button
                      key={section.key}
                      onClick={() => handleSectionChange(section.key)}
                      className={`w-full text-left px-4 py-3 rounded-lg text-sm font-medium transition-all duration-150 flex items-center gap-3 ${
                        activeSection === section.key
                          ? 'bg-gray-700 text-white shadow-sm'
                          : 'text-gray-600 hover:bg-gray-100 hover:text-gray-800'
                      }`}
                    >
                      <span className="text-base">{section.icon}</span>
                      <span>{section.label}</span>
                    </button>
                  )
                ))}
              </nav>
            </div>
          </div>

          {/* Right Content Area */}
          <div className="flex-1 min-w-0">
            {/* Section Title */}
            <div className="mb-6">
              <h2 className="text-xl font-semibold text-gray-700">
                {SECTIONS.find(s => s.key === activeSection)?.label}
              </h2>
              <div className="h-1 w-16 bg-gray-600 rounded mt-2"></div>
            </div>

            <div id={activeSection}>
              {renderContent()}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
