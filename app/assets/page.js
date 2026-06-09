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

function fmtMoney(n) {
  if (n == null || n === '') return '—';
  const x = Number(n);
  if (Number.isNaN(x)) return String(n);
  return x.toLocaleString('zh-TW');
}

function fmtMoneyShort(n) {
  if (n == null) return '—';
  const x = Number(n);
  if (Number.isNaN(x)) return '—';
  if (Math.abs(x) >= 1_000_000) return `${(x / 1_000_000).toFixed(1)}M`;
  if (Math.abs(x) >= 1_000) return `${(x / 1_000).toFixed(0)}K`;
  return x.toLocaleString('zh-TW');
}

function SummaryCard({ label, value, sub, color = 'gray', small = false }) {
  const colors = {
    teal: 'bg-teal-50 border-teal-200 text-teal-700',
    green: 'bg-green-50 border-green-200 text-green-700',
    red: 'bg-red-50 border-red-200 text-red-600',
    amber: 'bg-amber-50 border-amber-200 text-amber-700',
    orange: 'bg-orange-50 border-orange-200 text-orange-700',
    blue: 'bg-blue-50 border-blue-200 text-blue-700',
    purple: 'bg-purple-50 border-purple-200 text-purple-700',
    gray: 'bg-gray-50 border-gray-200 text-gray-700',
  };
  return (
    <div className={`rounded-lg border p-3 ${colors[color]}`}>
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className={`font-bold ${small ? 'text-lg' : 'text-xl'}`}>{value}</p>
      {sub && <p className="text-xs mt-0.5 opacity-70">{sub}</p>}
    </div>
  );
}

function AssetsHelpModal({ onClose }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-start justify-center z-[70] py-6 px-4 overflow-y-auto" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h3 className="text-base font-bold text-gray-800">資產管理說明</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">✕</button>
        </div>
        <div className="p-5 space-y-5 text-sm">
          <section>
            <h4 className="font-semibold text-gray-800 mb-2">1. 「物業」vs「資產」是什麼差別？</h4>
            <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-700 space-y-1">
              <p><span className="font-medium text-teal-700">物業（RentalProperty）</span>→ 出租管理角度：租客、合約、收款、稅款</p>
              <p><span className="font-medium text-blue-700">資產（Asset）</span>→ 財務管理角度：取得成本、折舊、設備分類</p>
              <p className="pt-1 text-gray-500">兩者可以綁定（1 對 1），綁定後：名稱、地址以資產端為主；房屋稅旗標影響稅款管理分類。</p>
            </div>
          </section>
          <section>
            <h4 className="font-semibold text-gray-800 mb-2">2. 為什麼要綁定？</h4>
            <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-700 space-y-1">
              <p><span className="text-gray-400">不綁定：</span>物業和資產各自獨立，無法交叉核對。</p>
              <p className="pt-1"><span className="font-medium">綁定後：</span></p>
              <ul className="ml-3 space-y-0.5 text-gray-600 list-disc list-inside">
                <li>資產頁看到租客、月租金、收款狀態</li>
                <li>物業頁看到資產類型、面積、取得日</li>
                <li>稅款自動對應（房屋稅 / 地價稅旗標）</li>
              </ul>
            </div>
          </section>
          <section>
            <h4 className="font-semibold text-gray-800 mb-2">3. 「公益出租人」影響什麼？</h4>
            <div className="bg-purple-50 rounded-lg p-3 text-xs text-purple-800 space-y-1">
              <p>公益出租人認定 → 租金申報金額不同（優惠稅率）。</p>
              <p>打勾後：</p>
              <ul className="ml-3 space-y-0.5 list-disc list-inside">
                <li>物業清單顯示「公益出租人」標記</li>
                <li>CSV 匯出包含申請人、起迄日、公益月租金</li>
              </ul>
            </div>
          </section>
          <section>
            <h4 className="font-semibold text-gray-800 mb-2">4. 表格欄位定義</h4>
            <div className="rounded-lg border overflow-hidden text-xs">
              <table className="w-full">
                <tbody>
                  {[
                    ['月租金', '當前有效合約的合約金額（唯讀，在租屋→合約管理修改）'],
                    ['本月收款', '當月實際收款狀態（待收 / 已收 / 逾期）'],
                    ['租金+水電實收', '本年度累計實際入帳（含水電費），不含未收款'],
                    ['淨利', '租金+水電實收 − 房屋稅 − 地價稅 − 維護費'],
                  ].map(([col, desc]) => (
                    <tr key={col} className="border-t first:border-t-0">
                      <td className="px-3 py-2 font-medium text-gray-800 bg-gray-50 whitespace-nowrap w-32">{col}</td>
                      <td className="px-3 py-2 text-gray-600">{desc}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
        <div className="px-5 py-3 border-t flex justify-end">
          <button onClick={onClose} className="px-4 py-2 text-sm bg-gray-100 rounded hover:bg-gray-200 text-gray-700">關閉</button>
        </div>
      </div>
    </div>
  );
}

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

  // Local callback-based confirm modal (replaces browser confirm())
  const [confirmState, setConfirmState] = useState(null);
  const showConfirm = (message, onConfirm, confirmLabel = '確定刪除') =>
    setConfirmState({ message, onConfirm, confirmLabel });

  // Core data hook
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

  // Detail + disposals
  const {
    selected, setSelected,
    detailIncomes,
    detailLoading,
    detailTaxes,
    disposals, setDisposals,
  } = useAssetDetail({ year });

  // Asset CRUD modal
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

  // Property management
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

  // Disposal CRUD
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

  // Merged rows: properties + report data
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

  // Filter + sort + batch + CSV
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

  // Highlight by propertyId URL param
  useEffect(() => {
    if (!highlightPropertyId || properties.length === 0) return;
    const id = parseInt(highlightPropertyId, 10);
    if (Number.isNaN(id)) return;
    const row = properties.find(p => p.id === id);
    if (row) setSelected(row);
  }, [highlightPropertyId, properties, setSelected]);

  // Pre-fill modal when linkProperty param present
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

        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
          <div>
            <h2 className="text-xl font-bold text-gray-800">資產管理總覽</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              各物業出租狀況、收租金額、稅費及維護費
              {activeRange
                ? <span className="ml-1 text-teal-600 font-medium">{activeRange.start} ~ {activeRange.end}</span>
                : <span className="ml-1">{year} 年度彙整</span>
              }
            </p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <label htmlFor="f-23" className="text-sm text-gray-600">年度：</label>
            <select
              id="f-23"
              value={year}
              onChange={e => {
                setYear(Number(e.target.value));
                setActiveRange(null);
                setDateStart('');
                setDateEnd('');
              }}
              className="border rounded px-3 py-1.5 text-sm"
            >
              {[0,1,2,3,4].map(d => {
                const y = currentYear - d;
                return <option key={y} value={y}>{y} 年</option>;
              })}
            </select>
            {/* 日期區間查詢 */}
            <div className="flex items-center gap-2 border rounded px-3 py-1 bg-gray-50">
              <label htmlFor="f-15" className="text-sm text-gray-500 whitespace-nowrap">區間：</label>
              <input id="f-15" type="date" value={dateStart} onChange={e => setDateStart(e.target.value)}
                className="border rounded px-2 py-1 text-sm w-36" />
              <span className="text-gray-400 text-sm">~</span>
              <input type="date" value={dateEnd} onChange={e => setDateEnd(e.target.value)}
                className="border rounded px-2 py-1 text-sm w-36" />
              <button type="button"
                disabled={!dateStart || !dateEnd || loading}
                onClick={async () => {
                  if (!dateStart || !dateEnd) return;
                  if (dateStart > dateEnd) { return; }
                  setLoading(true);
                  setActiveRange({ start: dateStart, end: dateEnd });
                  try {
                    await loadYearData(year, dateStart, dateEnd);
                  } finally {
                    setLoading(false);
                  }
                }}
                className="px-3 py-1 bg-teal-600 text-white text-sm rounded hover:bg-teal-700 disabled:opacity-40 whitespace-nowrap">
                查詢
              </button>
              {activeRange && (
                <button type="button"
                  onClick={() => { setActiveRange(null); setDateStart(''); setDateEnd(''); loadYearData(year); }}
                  className="text-xs text-gray-500 hover:text-red-500 whitespace-nowrap">✕ 清除</button>
              )}
            </div>
            <button type="button" onClick={() => setShowHelpModal(true)}
              className="px-3 py-1.5 bg-gray-100 border border-gray-300 text-gray-600 text-sm rounded-lg hover:bg-gray-200">
              ? 說明
            </button>
            <button type="button" onClick={exportCSV}
              className="px-3 py-1.5 bg-gray-100 border border-gray-300 text-gray-700 text-sm rounded-lg hover:bg-gray-200">
              ↓ 匯出 CSV
            </button>
            {canEdit && (
              <button type="button" onClick={openCreate}
                className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700">
                新增資產
              </button>
            )}
          </div>
        </div>

        {/* Summary Cards */}
        {!loading && (
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3 mb-5">
            <SummaryCard label="物業總數" value={`${properties.length} 間`} color="gray" small />
            <SummaryCard label="已出租" value={`${summary.rentedCount} 間`}
              sub={`空置 ${summary.availableCount} 間`} color="teal" small />
            <SummaryCard
              label={activeRange ? `${activeRange.start}~${activeRange.end} 租金` : `${year} 年租金收入`}
              value={`NT$ ${fmtMoneyShort(summary.totalRent)}`}
              sub={`${fmtMoney(summary.totalRent)}`}
              color="green"
            />
            <SummaryCard
              label={`${year} 年房屋稅`}
              value={`NT$ ${fmtMoneyShort(summary.totalHouse)}`}
              sub={fmtMoney(summary.totalHouse)}
              color="amber"
            />
            <SummaryCard
              label={`${year} 年地價稅`}
              value={`NT$ ${fmtMoneyShort(summary.totalLand)}`}
              sub={fmtMoney(summary.totalLand)}
              color="orange"
            />
            <SummaryCard
              label={activeRange ? `${activeRange.start}~${activeRange.end} 維護費` : `${year} 年維護費`}
              value={`NT$ ${fmtMoneyShort(summary.totalMaint)}`}
              sub={fmtMoney(summary.totalMaint)}
              color="blue"
            />
            <SummaryCard
              label="稅費合計"
              value={`NT$ ${fmtMoneyShort(summary.totalHouse + summary.totalLand + summary.totalMaint)}`}
              sub={fmtMoney(summary.totalHouse + summary.totalLand + summary.totalMaint)}
              color="red"
            />
            <SummaryCard
              label={activeRange ? `${activeRange.start}~${activeRange.end} 淨利` : `${year} 年淨利`}
              value={`NT$ ${fmtMoneyShort(summary.totalNet)}`}
              sub={fmtMoney(summary.totalNet)}
              color={summary.totalNet >= 0 ? 'green' : 'red'}
            />
          </div>
        )}

        {/* Property Table */}
        <PropertyTableTab
          loading={loading}
          loadError={loadError}
          canEdit={canEdit}
          year={year}
          currentYear={currentYear}
          activeRange={activeRange}
          sortedRows={sortedRows}
          mergedRows={mergedRows}
          summary={summary}
          selected={selected}
          setSelected={setSelected}
          highlightPropertyId={highlightPropertyId}
          currentMonthIncomeMap={currentMonthIncomeMap}
          selectedPropIds={selectedPropIds}
          setSelectedPropIds={setSelectedPropIds}
          batchStatus={batchStatus}
          setBatchStatus={setBatchStatus}
          batchSavingProps={batchSavingProps}
          handleBatchStatusChange={handleBatchStatusChange}
          assetSortKey={assetSortKey}
          assetSortDir={assetSortDir}
          assetToggleSort={assetToggleSort}
          propInlineEdit={propInlineEdit}
          setPropInlineEdit={setPropInlineEdit}
          propInlineSaving={propInlineSaving}
          savePropField={savePropField}
          openPropertyEdit={openPropertyEdit}
          openEdit={openEdit}
          openCreateFromProperty={openCreateFromProperty}
          deleteProperty={p => deleteProperty(p, canEdit)}
          exportCSV={exportCSV}
          searchText={searchText}
          setSearchText={setSearchText}
          filterStatus={filterStatus}
          setFilterStatus={setFilterStatus}
          filterCategory={filterCategory}
          setFilterCategory={setFilterCategory}
        />

        {/* Detail Panel Modal */}
        <DetailPanelModal
          selected={selected}
          setSelected={setSelected}
          year={year}
          activeRange={activeRange}
          canEdit={canEdit}
          detailIncomes={detailIncomes}
          detailLoading={detailLoading}
          detailTaxes={detailTaxes}
          disposals={disposals}
          mergedRows={mergedRows}
          openPropertyEdit={openPropertyEdit}
          openEdit={openEdit}
          openCreateFromProperty={openCreateFromProperty}
          openDisposalCreate={openDisposalCreate}
          openDisposalEdit={openDisposalEdit}
          deleteDisposal={deleteDisposal}
          deleteAsset={deleteAsset}
        />

      </div>

      {/* Asset Modal */}
      <AssetModal
        showModal={showModal}
        setShowModal={setShowModal}
        editing={editing}
        saving={saving}
        form={form}
        setForm={setForm}
        propertyOptions={propertyOptions}
        properties={properties}
        saveModal={saveModal}
        deleteAsset={deleteAsset}
      />

      {/* Confirmation Modal */}
      {confirmState && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60]">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-sm mx-4 p-6">
            <p className="text-gray-800 text-sm mb-5 whitespace-pre-line">{confirmState.message}</p>
            <div className="flex justify-end gap-2">
              <button className="px-4 py-2 text-sm bg-gray-200 rounded hover:bg-gray-300"
                onClick={() => setConfirmState(null)}>取消</button>
              <button className="px-4 py-2 text-sm bg-red-600 text-white rounded hover:bg-red-700"
                onClick={() => { const fn = confirmState.onConfirm; setConfirmState(null); fn(); }}>
                {confirmState.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Property Edit Modal */}
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

      {/* Disposal Modal */}
      <DisposalModal
        showDisposalModal={showDisposalModal}
        setShowDisposalModal={setShowDisposalModal}
        editingDisposal={editingDisposal}
        disposalSaving={disposalSaving}
        disposalForm={disposalForm}
        setDisposalForm={setDisposalForm}
        saveDisposal={saveDisposal}
      />

      {/* Help Modal */}
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
