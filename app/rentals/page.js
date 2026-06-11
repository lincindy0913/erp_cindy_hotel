'use client';

import React, { Suspense } from 'react';
import Navigation         from '@/components/Navigation';
import { useRentalsPage } from './_hooks/useRentalsPage';
import RentalErrorBanners from './_components/RentalErrorBanners';
import RentalTabBar       from './_components/RentalTabBar';
import RentalTabContent   from './_components/RentalTabContent';
import RentalModals       from './_components/RentalModals';

export default function RentalsPageWrapper() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-gray-500">載入中...</div>}>
      <RentalsPage />
    </Suspense>
  );
}

function RentalsPage() {
  const p = useRentalsPage();

  return (
    <div className="min-h-screen page-bg-rentals">
      <div className="no-print"><Navigation borderColor="border-teal-500" /></div>

      <div className="max-w-7xl mx-auto px-4 py-6">
        <h2 className="text-2xl font-bold text-gray-800 mb-4 no-print">租屋管理</h2>

        <RentalErrorBanners
          propertiesError={p.propertiesError}     fetchProperties={p.fetchProperties}
          contractsError={p.contractsError}       fetchContracts={p.fetchContracts}
          incomesError={p.incomesError}           fetchIncomes={p.fetchIncomes}
          tenantsError={p.tenantsError}           fetchTenants={p.fetchTenants}
          taxesError={p.taxesError}               fetchTaxes={p.fetchTaxes}
          maintenancesError={p.maintenancesError} fetchMaintenances={p.fetchMaintenances}
          utilityError={p.utilityError}           fetchUtilityList={p.fetchUtilityList}
        />

        <RentalTabBar
          activeTab={p.activeTab}
          expiringContractCount={p.expiringContractCount}
          switchTab={p.switchTab}
        />

        {p.loading && p.activeTab === 'overview' ? (
          <div className="text-center py-12 text-gray-500">載入中...</div>
        ) : (
          <RentalTabContent p={p} />
        )}
      </div>

      <RentalModals
        terminateModal={p.terminateModal} setTerminateModal={p.setTerminateModal} terminateContract={p.terminateContract}
        quickPayIncome={p.quickPayIncome} setQuickPayIncome={p.setQuickPayIncome}
        quickPayForm={p.quickPayForm} setQuickPayForm={p.setQuickPayForm}
        quickPaySaving={p.quickPaySaving} confirmQuickPay={p.confirmQuickPay}
        accounts={p.accounts}
        showRentFilingModal={p.showRentFilingModal} setShowRentFilingModal={p.setShowRentFilingModal}
        editingRentFiling={p.editingRentFiling} rentFilingYear={p.rentFilingYear}
        rentFilingForm={p.rentFilingForm} setRentFilingForm={p.setRentFilingForm}
        rentFilingSaving={p.rentFilingSaving} saveRentFilingFromModal={p.saveRentFilingFromModal}
        properties={p.properties} contracts={p.contracts}
        showTaxModal={p.showTaxModal} setShowTaxModal={p.setShowTaxModal}
        editingTax={p.editingTax} setEditingTax={p.setEditingTax}
        taxForm={p.taxForm} setTaxForm={p.setTaxForm} taxSaving={p.taxSaving} saveTax={p.saveTax}
        showMaintenanceModal={p.showMaintenanceModal} setShowMaintenanceModal={p.setShowMaintenanceModal}
        editingMaintenance={p.editingMaintenance} setEditingMaintenance={p.setEditingMaintenance}
        maintenanceForm={p.maintenanceForm} setMaintenanceForm={p.setMaintenanceForm}
        maintenanceSaving={p.maintenanceSaving} saveMaintenance={p.saveMaintenance}
        accountingSubjects={p.accountingSubjects}
        showTenantModal={p.showTenantModal} setShowTenantModal={p.setShowTenantModal}
        editingTenant={p.editingTenant}
        tenantForm={p.tenantForm} setTenantForm={p.setTenantForm}
        tenantSaving={p.tenantSaving} saveTenant={p.saveTenant}
        contractPropertyChanges={p.contractPropertyChanges} setContractPropertyChanges={p.setContractPropertyChanges}
        initContractErrors={p.initContractErrors} setInitContractErrors={p.setInitContractErrors}
        showPropertyModal={p.showPropertyModal} setShowPropertyModal={p.setShowPropertyModal}
        propertyForm={p.propertyForm} setPropertyForm={p.setPropertyForm}
        editingProperty={p.editingProperty} propertySaving={p.propertySaving} saveProperty={p.saveProperty}
        confirm={p.confirm} showToast={p.showToast} fetchProperties={p.fetchProperties} switchTab={p.switchTab}
        showContractModal={p.showContractModal} setShowContractModal={p.setShowContractModal}
        editingContract={p.editingContract}
        contractForm={p.contractForm} setContractForm={p.setContractForm}
        contractSaving={p.contractSaving} saveContract={p.saveContract}
        renewingFromContract={p.renewingFromContract} setRenewingFromContract={p.setRenewingFromContract}
        tenants={p.tenants}
      />
    </div>
  );
}
