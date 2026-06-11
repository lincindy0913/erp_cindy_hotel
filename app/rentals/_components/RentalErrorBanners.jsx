'use client';

import FetchErrorBanner from '@/components/FetchErrorBanner';

export default function RentalErrorBanners({
  propertiesError, fetchProperties,
  contractsError,  fetchContracts,
  incomesError,    fetchIncomes,
  tenantsError,    fetchTenants,
  taxesError,      fetchTaxes,
  maintenancesError, fetchMaintenances,
  utilityError,    fetchUtilityList,
}) {
  return (
    <>
      {propertiesError   && <div className="mb-4 no-print"><FetchErrorBanner message={propertiesError}   onRetry={fetchProperties} /></div>}
      {contractsError    && <div className="mb-4 no-print"><FetchErrorBanner message={contractsError}    onRetry={fetchContracts} /></div>}
      {incomesError      && <div className="mb-4 no-print"><FetchErrorBanner message={incomesError}      onRetry={fetchIncomes} /></div>}
      {tenantsError      && <div className="mb-4 no-print"><FetchErrorBanner message={tenantsError}      onRetry={fetchTenants} /></div>}
      {taxesError        && <div className="mb-4 no-print"><FetchErrorBanner message={taxesError}        onRetry={fetchTaxes} /></div>}
      {maintenancesError && <div className="mb-4 no-print"><FetchErrorBanner message={maintenancesError} onRetry={fetchMaintenances} /></div>}
      {utilityError      && <div className="mb-4 no-print"><FetchErrorBanner message={utilityError}      onRetry={fetchUtilityList} /></div>}
    </>
  );
}
