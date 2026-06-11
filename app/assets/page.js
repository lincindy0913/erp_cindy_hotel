'use client';

import React, { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import Navigation from '@/components/Navigation';
import { hasPermission, PERMISSIONS } from '@/lib/permissions';
import PropertyModal from '@/components/PropertyModal';

import { useAssetData } from '@/app/assets/_hooks/useAssetData';
import { useAssetDetail } from '@/app/assets/_hooks/useAssetDetail';
import { useAssetModal } from '@/app/assets/_hooks/useAssetModal';
import { usePropertyManagement } from '@/app/assets/_hooks/usePropertyManagement';
import { useAssetDisposals } from '@/app/assets/_hooks/useAssetDisposals';
import { useAssetFilter } from '@/app/assets/_hooks/useAssetFilter';

import { PropertyTableTab } from '@/app/assets/_tabs/PropertyTableTab';
import { DetailPanelModal } from '@/app/assets/_tabs/DetailPanelModal';
import { AssetModal } from '@/app/assets/_tabs/AssetModal';
import { DisposalModal } from '@/app/assets/_tabs/DisposalModal';

import { AssetsHeader } from '@/app/assets/_components/AssetsHeader';
import { AssetsSummaryCards } from '@/app/assets/_components/AssetsSummaryCards';
import { AssetsHelpModal } from '@/app/assets/_components/AssetsHelpModal';
import { ConfirmModal } from '@/app/assets/_components/ConfirmModal';

function AssetsPageInner() {
  const { data: session } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const linkOpenedRef = useRef(false);

  const userPerms = session?.user?.permissions || [];
  const isAdmin = session?.user?.role === 'admin';
  const canWildcard = isAdmin || userPerms.includes('*');
  const canView = canWildcard || hasPermission(userPerms, PERMISSIONS.ASSET_VIEW);
  const canEdit = canWildcard || hasPermission(userPerms, PERMISSIONS.ASSET_EDIT);

  const highlightPropertyId = searchParams.get('propertyId');
  const linkProperty = searchParams.get('linkProperty');

  const [showHelpModal, setShowHelpModal] = useState(false);
  const [confirmState, setConfirmState] = useState(null);
  const showConfirm = (message, onConfirm, confirmLabel = '確定刪除') =>
    setConfirmState({ message, onConfirm, confirmLabel });

  const {
    currentYear, year, setYear,
    properties, setProperties,
    reportData,
    loading, setLoading,
    loadError,
    currentMonthIncomeMap,
    accounts,
    dateStart, setDateStart,
    dateEnd, setDateEnd,
    activeRange, setActiveRange,
    loadProperties,
    loadYearData,
  } = useAssetData();

  const {
    selected, setSelected,
    detailIncomes,
    detailLoading,
    detailTaxes,
    disposals, setDisposals,
  } = useAssetDetail({ year });

  const {
    showModal, setShowModal,
    editing,
    saving,
    form, setForm,
    propertyOptions,
    openCreate,
    openEdit,
    openCreateFromProperty,
    saveModal,
    deleteAsset,
  } = useAssetModal({ properties, loadProperties, setSelected, linkProperty, showConfirm });

  const {
    propInlineEdit, setPropInlineEdit,
    propInlineSaving,
    showPropModal, setShowPropModal,
    editingProp,
    propSaving,
    propForm, setPropForm,
    savePropField,
    openPropertyEdit,
    savePropertyEdit,
    deleteProperty,
  } = usePropertyManagement({ properties, setProperties, loadProperties, selected, setSelected, showConfirm });

  const {
    showDisposalModal, setShowDisposalModal,
    editingDisposal,
    disposalSaving,
    disposalForm, setDisposalForm,
    openDisposalCreate,
    openDisposalEdit,
    saveDisposal,
    deleteDisposal,
  } = useAssetDisposals({ selected, setDisposals, disposals, showConfirm });

  const { mergedRows, summary } = useMemo(() => {
    const reportByPid = new Map();
    for (const r of reportData) reportByPid.set(r.propertyId, r);

    let totalRent = 0, totalHouse = 0, totalLand = 0, totalMaint = 0;
    let rentedCount = 0, availableCount = 0;

    const rows = properties.map(p => {
      const r = reportByPid.get(p.id) || {};
      const houseTax = r.houseTaxAmount || 0;
      const landTax  = r.landTaxAmount  || 0;
      const maint = r.maintenanceAmount || 0;
      const rent = r.rentIncome || 0;
      const netProfit = rent - houseTax - landTax - maint;
      if (p.status === 'rented') rentedCount++;
      else if (p.status === 'available') availableCount++;
      totalRent += rent;
      totalHouse += houseTax;
      totalLand += landTax;
      totalMaint += maint;
      return { ...p, rentIncome: rent, houseTax, landTax, maintenanceAmount: maint, netProfit, hasUnpaidTax: r.hasUnpaidTax || false };
    });

    const totalNet = totalRent - totalHouse - totalLand - totalMaint;
    return {
      mergedRows: rows,
      summary: { rentedCount, availableCount, totalRent, totalHouse, totalLand, totalMaint, totalNet },
    };
  }, [properties, reportData]);

  const {
    searchText, setSearchText,
    filterStatus, setFilterStatus,
    filterCategory, setFilterCategory,
    assetSortKey, assetSortDir, assetToggleSort,
    selectedPropIds, setSelectedPropIds,
    batchStatus, setBatchStatus,
    batchSavingProps,
    sortedRows,
    handleBatchStatusChange,
    exportCSV,
  } = useAssetFilter({ mergedRows, year, activeRange, loadProperties });

  useEffect(() => {
    if (!highlightPropertyId || properties.length === 0) return;
    const id = parseInt(highlightPropertyId, 10);
    if (Number.isNaN(id)) return;
    const row = properties.find(p => p.id === id);
    if (row) setSelected(row);
  }, [highlightPropertyId, properties, setSelected]);

  useEffect(() => {
    if (linkOpenedRef.current || !linkProperty || properties.length === 0) return;
    linkOpenedRef.current = true;
    setForm(f => ({ ...f, rentalPropertyId: linkProperty }));
    setShowModal(true);
    router.replace('/assets');
  }, [linkProperty, properties.length, router, setForm, setShowModal]);

  if (!canView) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navigation borderColor="border-teal-500" />
        <div className="max-w-7xl mx-auto px-4 py-12 text-center text-gray-500">
          您沒有權限查看資產管理，請聯繫系統管理員。
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation borderColor="border-teal-500" />
      <div className="max-w-[100rem] mx-auto px-4 py-6">

        <AssetsHeader
          currentYear={currentYear} year={year} setYear={setYear}
          activeRange={activeRange} setActiveRange={setActiveRange}
          dateStart={dateStart} setDateStart={setDateStart}
          dateEnd={dateEnd} setDateEnd={setDateEnd}
          loading={loading} setLoading={setLoading}
          loadYearData={loadYearData}
          canEdit={canEdit}
          openCreate={openCreate}
          exportCSV={exportCSV}
          onShowHelp={() => setShowHelpModal(true)}
        />

        {!loading && (
          <AssetsSummaryCards
            properties={properties}
            summary={summary}
            year={year}
            activeRange={activeRange}
          />
        )}

        <PropertyTableTab
          loading={loading} loadError={loadError} canEdit={canEdit}
          year={year} currentYear={currentYear} activeRange={activeRange}
          sortedRows={sortedRows} mergedRows={mergedRows} summary={summary}
          selected={selected} setSelected={setSelected}
          highlightPropertyId={highlightPropertyId}
          currentMonthIncomeMap={currentMonthIncomeMap}
          selectedPropIds={selectedPropIds} setSelectedPropIds={setSelectedPropIds}
          batchStatus={batchStatus} setBatchStatus={setBatchStatus}
          batchSavingProps={batchSavingProps}
          handleBatchStatusChange={handleBatchStatusChange}
          assetSortKey={assetSortKey} assetSortDir={assetSortDir} assetToggleSort={assetToggleSort}
          propInlineEdit={propInlineEdit} setPropInlineEdit={setPropInlineEdit}
          propInlineSaving={propInlineSaving} savePropField={savePropField}
          openPropertyEdit={openPropertyEdit} openEdit={openEdit}
          openCreateFromProperty={openCreateFromProperty}
          deleteProperty={p => deleteProperty(p, canEdit)}
          exportCSV={exportCSV}
          searchText={searchText} setSearchText={setSearchText}
          filterStatus={filterStatus} setFilterStatus={setFilterStatus}
          filterCategory={filterCategory} setFilterCategory={setFilterCategory}
        />

        <DetailPanelModal
          selected={selected} setSelected={setSelected}
          year={year} activeRange={activeRange} canEdit={canEdit}
          detailIncomes={detailIncomes} detailLoading={detailLoading} detailTaxes={detailTaxes}
          disposals={disposals} mergedRows={mergedRows}
          openPropertyEdit={openPropertyEdit} openEdit={openEdit}
          openCreateFromProperty={openCreateFromProperty}
          openDisposalCreate={openDisposalCreate} openDisposalEdit={openDisposalEdit}
          deleteDisposal={deleteDisposal} deleteAsset={deleteAsset}
        />

      </div>

      <AssetModal
        showModal={showModal} setShowModal={setShowModal}
        editing={editing} saving={saving}
        form={form} setForm={setForm}
        propertyOptions={propertyOptions} properties={properties}
        saveModal={saveModal} deleteAsset={deleteAsset}
      />

      <ConfirmModal confirmState={confirmState} setConfirmState={setConfirmState} />

      {showPropModal && (
        <PropertyModal
          mode="assets"
          open={showPropModal}
          onClose={() => !propSaving && setShowPropModal(false)}
          form={propForm}
          setForm={setPropForm}
          editingProperty={editingProp}
          accounts={accounts}
          saving={propSaving}
          onSave={savePropertyEdit}
        />
      )}

      <DisposalModal
        showDisposalModal={showDisposalModal} setShowDisposalModal={setShowDisposalModal}
        editingDisposal={editingDisposal} disposalSaving={disposalSaving}
        disposalForm={disposalForm} setDisposalForm={setDisposalForm}
        saveDisposal={saveDisposal}
      />

      {showHelpModal && <AssetsHelpModal onClose={() => setShowHelpModal(false)} />}
    </div>
  );
}

export default function AssetsPage() {
  return (
    <Suspense fallback={(
      <div className="min-h-screen bg-gray-50">
        <Navigation borderColor="border-teal-500" />
        <div className="max-w-7xl mx-auto px-4 py-6 text-gray-500">載入中…</div>
      </div>
    )}>
      <AssetsPageInner />
    </Suspense>
  );
}
