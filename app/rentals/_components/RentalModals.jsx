'use client';

import { todayStr } from '@/lib/localDate';
import EditTenantModal        from './EditTenantModal';
import ContractModal          from './ContractModal';
import PropertyModal          from '@/components/PropertyModal';
import TerminateContractModal from './TerminateContractModal';
import QuickPayModal          from './QuickPayModal';
import RentFilingModal        from './RentFilingModal';
import TaxModal               from './TaxModal';
import MaintenanceModal       from './MaintenanceModal';

export default function RentalModals({
  // terminate
  terminateModal, setTerminateModal, terminateContract,
  // quick pay
  quickPayIncome, setQuickPayIncome,
  quickPayForm, setQuickPayForm, quickPaySaving, confirmQuickPay,
  accounts,
  // rent filing
  showRentFilingModal, setShowRentFilingModal,
  editingRentFiling, rentFilingYear,
  rentFilingForm, setRentFilingForm,
  rentFilingSaving, saveRentFilingFromModal,
  properties, contracts,
  // tax
  showTaxModal, setShowTaxModal,
  editingTax, setEditingTax,
  taxForm, setTaxForm, taxSaving, saveTax,
  // maintenance
  showMaintenanceModal, setShowMaintenanceModal,
  editingMaintenance, setEditingMaintenance,
  maintenanceForm, setMaintenanceForm,
  maintenanceSaving, saveMaintenance,
  accountingSubjects,
  // tenant
  showTenantModal, setShowTenantModal,
  editingTenant,
  tenantForm, setTenantForm, tenantSaving, saveTenant,
  contractPropertyChanges, setContractPropertyChanges,
  initContractErrors, setInitContractErrors,
  // property
  showPropertyModal, setShowPropertyModal,
  propertyForm, setPropertyForm,
  editingProperty, propertySaving, saveProperty,
  confirm, showToast, fetchProperties, switchTab,
  // contract
  showContractModal, setShowContractModal,
  editingContract,
  contractForm, setContractForm, contractSaving, saveContract,
  renewingFromContract, setRenewingFromContract,
  tenants,
}) {
  return (
    <>
      <TerminateContractModal
        terminateModal={terminateModal}
        setTerminateModal={setTerminateModal}
        terminateContract={terminateContract}
      />

      <QuickPayModal
        quickPayIncome={quickPayIncome} setQuickPayIncome={setQuickPayIncome}
        quickPayForm={quickPayForm} setQuickPayForm={setQuickPayForm}
        quickPaySaving={quickPaySaving} confirmQuickPay={confirmQuickPay}
        accounts={accounts}
      />

      <RentFilingModal
        showRentFilingModal={showRentFilingModal} setShowRentFilingModal={setShowRentFilingModal}
        editingRentFiling={editingRentFiling} rentFilingYear={rentFilingYear}
        rentFilingForm={rentFilingForm} setRentFilingForm={setRentFilingForm}
        rentFilingSaving={rentFilingSaving} saveRentFilingFromModal={saveRentFilingFromModal}
        properties={properties} contracts={contracts}
      />

      <TaxModal
        showTaxModal={showTaxModal} setShowTaxModal={setShowTaxModal}
        editingTax={editingTax} setEditingTax={setEditingTax}
        taxForm={taxForm} setTaxForm={setTaxForm} taxSaving={taxSaving} saveTax={saveTax}
        properties={properties}
      />

      <MaintenanceModal
        showMaintenanceModal={showMaintenanceModal} setShowMaintenanceModal={setShowMaintenanceModal}
        editingMaintenance={editingMaintenance} setEditingMaintenance={setEditingMaintenance}
        maintenanceForm={maintenanceForm} setMaintenanceForm={setMaintenanceForm}
        maintenanceSaving={maintenanceSaving} saveMaintenance={saveMaintenance}
        properties={properties} accountingSubjects={accountingSubjects} accounts={accounts}
      />

      {showTenantModal && (
        <EditTenantModal
          editingTenant={editingTenant}
          tenantForm={tenantForm} setTenantForm={setTenantForm}
          tenantSaving={tenantSaving} saveTenant={saveTenant}
          onClose={() => setShowTenantModal(false)}
          onInitiateTerminate={(tenant, contract) => {
            setShowTenantModal(false);
            setTerminateModal({ tenant, contracts: [contract], endDate: todayStr() });
          }}
          contractPropertyChanges={contractPropertyChanges} setContractPropertyChanges={setContractPropertyChanges}
          properties={properties} accounts={accounts}
          initContractErrors={initContractErrors} setInitContractErrors={setInitContractErrors}
        />
      )}

      {showPropertyModal && (
        <PropertyModal
          mode="rentals" open={showPropertyModal}
          onClose={() => setShowPropertyModal(false)}
          form={propertyForm} setForm={setPropertyForm}
          editingProperty={editingProperty} accounts={accounts}
          saving={propertySaving} onSave={saveProperty}
          onDelete={editingProperty ? async () => {
            const id = editingProperty.id;
            if (!(await confirm('確定要刪除此物業？此操作無法復原。', { title: '刪除物業', danger: true }))) return;
            try {
              const res = await fetch(`/api/rentals/properties/${id}`, { method: 'DELETE' });
              const data = await res.json();
              if (!res.ok) return showToast(data.error || '刪除失敗', 'error');
              setShowPropertyModal(false);
              fetchProperties();
            } catch (err) { showToast('刪除失敗: ' + err.message, 'error'); }
          } : undefined}
          onOpenRentFiling={() => { setShowPropertyModal(false); switchTab('rentFiling'); }}
        />
      )}

      {showContractModal && (
        <ContractModal
          editingContract={editingContract}
          contractForm={contractForm} setContractForm={setContractForm}
          contractSaving={contractSaving} saveContract={saveContract}
          onClose={() => { setShowContractModal(false); setRenewingFromContract(null); }}
          renewingFromContract={renewingFromContract}
          properties={properties} tenants={tenants} accounts={accounts}
          accountingSubjects={accountingSubjects}
        />
      )}
    </>
  );
}
