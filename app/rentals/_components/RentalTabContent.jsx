'use client';

import OverviewTab        from '../_tabs/OverviewTab';
import CashierTab         from '../_tabs/CashierTab';
import TenantsTab         from '../_tabs/TenantsTab';
import ContractsTab       from '../_tabs/ContractsTab';
import TaxesTab           from '../_tabs/TaxesTab';
import RentFilingTab      from '../_tabs/RentFilingTab';
import MaintenanceTab     from '../_tabs/MaintenanceTab';
import UtilityIncomeTab   from '../_tabs/UtilityIncomeTab';
import AnalyticsTab       from '../_tabs/AnalyticsTab';
import PaymentRecordsTab  from '../_tabs/PaymentRecordsTab';
import HelpTab            from '../_tabs/HelpTab';

export default function RentalTabContent({ p }) {
  const { activeTab } = p;

  if (activeTab === 'overview') return (
    <OverviewTab summary={p.summary} summaryError={p.summaryError} summaryLoading={p.summaryLoading}
      summaryLastFetched={p.summaryLastFetched} fetchSummary={p.fetchSummary}
      switchTab={p.switchTab} switchAnalyticsSub={p.switchAnalyticsSub} />
  );

  if (activeTab === 'cashier') return (
    <CashierTab
      incomes={p.incomes} incomesHasMore={p.incomesHasMore} cashierUtilityMap={p.cashierUtilityMap}
      yearLocks={p.yearLocks}
      rentIncKey={p.rentIncKey} rentIncDir={p.rentIncDir} rentIncToggle={p.rentIncToggle}
      incomeFilter={p.incomeFilter} setIncomeFilter={p.setIncomeFilter} sortedIncomes={p.sortedIncomes}
      payingIncomeId={p.payingIncomeId} setPayingIncomeId={p.setPayingIncomeId}
      incomeFormMode={p.incomeFormMode} incomePayForm={p.incomePayForm} setIncomePayForm={p.setIncomePayForm}
      incomeUtilityForm={p.incomeUtilityForm} setIncomeUtilityForm={p.setIncomeUtilityForm}
      incomePaymentSaving={p.incomePaymentSaving}
      editingPaymentId={p.editingPaymentId} setEditingPaymentId={p.setEditingPaymentId}
      editingPaymentForm={p.editingPaymentForm} setEditingPaymentForm={p.setEditingPaymentForm}
      editingPaymentSaving={p.editingPaymentSaving}
      selectedIncomeIds={p.selectedIncomeIds} setSelectedIncomeIds={p.setSelectedIncomeIds}
      showBatchPay={p.showBatchPay} setShowBatchPay={p.setShowBatchPay}
      batchPayForm={p.batchPayForm} setBatchPayForm={p.setBatchPayForm}
      batchSaving={p.batchSaving} batchProgress={p.batchProgress} batchAbortRef={p.batchAbortRef}
      batchLockSaving={p.batchLockSaving}
      fetchIncomes={p.fetchIncomes} confirmIncomePayment={p.confirmIncomePayment}
      voidIncomePayment={p.voidIncomePayment} exportIncomeCSV={p.exportIncomeCSV}
      generateMonthlyIncome={p.generateMonthlyIncome} printIncomes={p.printIncomes}
      openIncomePayment={p.openIncomePayment} openPaymentEdit={p.openPaymentEdit}
      savePaymentEdit={p.savePaymentEdit} deletePaymentRecord={p.deletePaymentRecord}
      toggleIncomeLock={p.toggleIncomeLock} batchConfirmIncomes={p.batchConfirmIncomes}
      batchLockIncomes={p.batchLockIncomes} contracts={p.contracts}
      setReminderOpen={p.setReminderOpen} setReminderThreshold={p.setReminderThreshold}
      accounts={p.accounts} CONTRACT_INCOME_CATEGORIES={p.CONTRACT_INCOME_CATEGORIES}
      propInlineEdit={p.propInlineEdit} setPropInlineEdit={p.setPropInlineEdit}
      savePropField={p.savePropField} propInlineSaving={p.propInlineSaving}
      confirm={p.confirm} showToast={p.showToast} switchTab={p.switchTab}
    />
  );

  if (activeTab === 'tenants') return (
    <TenantsTab tenants={p.tenants} tenantSearch={p.tenantSearch} setTenantSearch={p.setTenantSearch}
      tenantSortKey={p.tenantSortKey} tenantSortDir={p.tenantSortDir} tenantToggleSort={p.tenantToggleSort}
      fetchTenants={p.fetchTenants} openTenantModal={p.openTenantModal} deleteTenant={p.deleteTenant}
      getCreditColor={c => c === 0 ? 'text-green-600' : c <= 2 ? 'text-yellow-600' : 'text-red-600'}
    />
  );

  if (activeTab === 'contracts') return (
    <ContractsTab contracts={p.contracts} contractFilter={p.contractFilter} setContractFilter={p.setContractFilter}
      contractSortKey={p.contractSortKey} contractSortDir={p.contractSortDir} contractToggleSort={p.contractToggleSort}
      reminderOpen={p.reminderOpen} setReminderOpen={p.setReminderOpen}
      reminderThreshold={p.reminderThreshold} setReminderThreshold={p.setReminderThreshold}
      contractMap={p.contractMap} getRenewalDepth={p.getRenewalDepth}
      fetchContracts={p.fetchContracts} openContractModal={p.openContractModal}
      openRenewalModal={p.openRenewalModal} moveContract={p.moveContract}
      deleteContract={p.deleteContract} forceDeleteContract={p.forceDeleteContract}
      confirmMergeDelete={p.confirmMergeDelete}
      mergeDeleteModal={p.mergeDeleteModal} setMergeDeleteModal={p.setMergeDeleteModal}
      mergeTargetId={p.mergeTargetId} setMergeTargetId={p.setMergeTargetId}
      handleDepositAction={p.handleDepositAction}
      printContracts={p.printContracts} markReminderSent={p.markReminderSent}
      clearReminder={p.clearReminder} properties={p.properties} tenants={p.tenants}
      fetchTenants={p.fetchTenants}
    />
  );

  if (activeTab === 'taxes') return (
    <TaxesTab taxes={p.taxes} taxFilter={p.taxFilter} setTaxFilter={p.setTaxFilter}
      yearLocks={p.yearLocks} yearLockSaving={p.yearLockSaving} taxView={p.taxView} setTaxView={p.setTaxView}
      taxTableYear={p.taxTableYear} setTaxTableYear={p.setTaxTableYear}
      taxTableRows={p.taxTableRows} setTaxTableRows={p.setTaxTableRows} taxTableSaving={p.taxTableSaving}
      payingTaxId={p.payingTaxId} setPayingTaxId={p.setPayingTaxId}
      taxPayForm={p.taxPayForm} setTaxPayForm={p.setTaxPayForm}
      fetchTaxes={p.fetchTaxes} fetchYearLocks={p.fetchYearLocks} fetchTaxTable={p.fetchTaxTable}
      lockYear={p.lockYear} unlockYear={p.unlockYear} openTaxEdit={p.openTaxEdit}
      confirmTaxPayment={p.confirmTaxPayment} deleteTax={p.deleteTax} printTaxes={p.printTaxes}
      saveTaxTable={p.saveTaxTable} properties={p.properties} accounts={p.accounts}
      setEditingTax={p.setEditingTax} setTaxForm={p.setTaxForm} setShowTaxModal={p.setShowTaxModal}
    />
  );

  if (activeTab === 'rentFiling') return (
    <RentFilingTab rentFilingYear={p.rentFilingYear} setRentFilingYear={p.setRentFilingYear}
      rentFilingData={p.rentFilingData} rentFilingLoading={p.rentFilingLoading}
      fetchRentFiling={p.fetchRentFiling} seedRentFilingYear={p.seedRentFilingYear}
      openRentFilingModalForNew={p.openRentFilingModalForNew}
      openRentFilingModalForEdit={p.openRentFilingModalForEdit}
      deleteRentFilingRow={p.deleteRentFilingRow}
    />
  );

  if (activeTab === 'maintenance') return (
    <MaintenanceTab maintenances={p.maintenances} maintenancesHasMore={p.maintenancesHasMore}
      maintenanceFilter={p.maintenanceFilter} setMaintenanceFilter={p.setMaintenanceFilter}
      maintenanceAnalysis={p.maintenanceAnalysis} fetchMaintenances={p.fetchMaintenances}
      deleteMaintenance={p.deleteMaintenance}
      setEditingMaintenance={p.setEditingMaintenance} setMaintenanceForm={p.setMaintenanceForm}
      setShowMaintenanceModal={p.setShowMaintenanceModal}
      properties={p.properties} accountingSubjects={p.accountingSubjects}
    />
  );

  if (activeTab === 'utilityIncome') return (
    <UtilityIncomeTab utilityFilter={p.utilityFilter} setUtilityFilter={p.setUtilityFilter}
      utilityList={p.utilityList} showBulkUtility={p.showBulkUtility} setShowBulkUtility={p.setShowBulkUtility}
      bulkUtilityYear={p.bulkUtilityYear} setBulkUtilityYear={p.setBulkUtilityYear}
      bulkUtilityMonth={p.bulkUtilityMonth} setBulkUtilityMonth={p.setBulkUtilityMonth}
      bulkUtilityEntries={p.bulkUtilityEntries} setBulkUtilityEntries={p.setBulkUtilityEntries}
      bulkUtilitySaving={p.bulkUtilitySaving} showUtilityModal={p.showUtilityModal}
      setShowUtilityModal={p.setShowUtilityModal} utilityForm={p.utilityForm} setUtilityForm={p.setUtilityForm}
      editingUtility={p.editingUtility} setEditingUtility={p.setEditingUtility} utilitySaving={p.utilitySaving}
      fetchUtilityList={p.fetchUtilityList} saveUtility={p.saveUtility} deleteUtility={p.deleteUtility}
      saveBulkUtility={p.saveBulkUtility} openBulkUtility={p.openBulkUtility}
      properties={p.properties} accounts={p.accounts}
    />
  );

  if (activeTab === 'analytics') return (
    <AnalyticsTab analyticsSub={p.analyticsSub} switchAnalyticsSub={p.switchAnalyticsSub}
      reportYear={p.reportYear} setReportYear={p.setReportYear}
      reportStartDate={p.reportStartDate} setReportStartDate={p.setReportStartDate}
      reportEndDate={p.reportEndDate} setReportEndDate={p.setReportEndDate}
      reportCategoryFilter={p.reportCategoryFilter} setReportCategoryFilter={p.setReportCategoryFilter}
      incomeReportData={p.incomeReportData} operatingReportData={p.operatingReportData}
      byTenantReportData={p.byTenantReportData}
      reportLoading={p.reportLoading} overdueReportData={p.overdueReportData}
      overdueReportLoading={p.overdueReportLoading}
      overdueSelectedIds={p.overdueSelectedIds} setOverdueSelectedIds={p.setOverdueSelectedIds}
      showOverdueBatch={p.showOverdueBatch} setShowOverdueBatch={p.setShowOverdueBatch}
      overdueBatchForm={p.overdueBatchForm} setOverdueBatchForm={p.setOverdueBatchForm}
      overdueBatchSaving={p.overdueBatchSaving} overdueBatchProgress={p.overdueBatchProgress}
      overdueBatchAbortRef={p.overdueBatchAbortRef}
      quickPayIncome={p.quickPayIncome} setQuickPayIncome={p.setQuickPayIncome}
      quickPayForm={p.quickPayForm} setQuickPayForm={p.setQuickPayForm} quickPaySaving={p.quickPaySaving}
      vacancyYear={p.vacancyYear} setVacancyYear={p.setVacancyYear}
      vacancyData={p.vacancyData} vacancyLoading={p.vacancyLoading}
      depositFilter={p.depositFilter} setDepositFilter={p.setDepositFilter}
      fetchIncomeReport={p.fetchIncomeReport} fetchOperatingReport={p.fetchOperatingReport}
      fetchByTenantReport={p.fetchByTenantReport}
      fetchOverdueReport={p.fetchOverdueReport} fetchVacancyReport={p.fetchVacancyReport}
      openQuickPay={p.openQuickPay} confirmQuickPay={p.confirmQuickPay}
      batchConfirmOverdueIncomes={p.batchConfirmOverdueIncomes}
      contracts={p.contracts} handleDepositAction={p.handleDepositAction}
      accounts={p.accounts} reportCategoryOptions={p.reportCategoryOptions} switchTab={p.switchTab}
    />
  );

  if (activeTab === 'paymentRecords') return (
    <PaymentRecordsTab paymentFilter={p.paymentFilter} setPaymentFilter={p.setPaymentFilter}
      paymentRecords={p.paymentRecords} paymentRecordsPagination={p.paymentRecordsPagination}
      paymentLoading={p.paymentLoading} paymentSortKey={p.paymentSortKey}
      paymentSortDir={p.paymentSortDir} paymentToggleSort={p.paymentToggleSort}
      editingPaymentId={p.editingPaymentId} setEditingPaymentId={p.setEditingPaymentId}
      editingPaymentForm={p.editingPaymentForm} setEditingPaymentForm={p.setEditingPaymentForm}
      editingPaymentSaving={p.editingPaymentSaving} fetchPaymentRecords={p.fetchPaymentRecords}
      openPaymentEdit={p.openPaymentEdit} savePaymentEdit={p.savePaymentEdit}
      deletePaymentRecord={p.deletePaymentRecord}
      properties={p.properties} accounts={p.accounts} confirm={p.confirm}
    />
  );

  if (activeTab === 'help') return <HelpTab />;

  return null;
}
