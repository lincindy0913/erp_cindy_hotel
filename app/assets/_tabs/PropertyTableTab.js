'use client';

import React from 'react';
import Link from 'next/link';
import { SortableTh } from '@/components/SortableTh';
import FetchErrorBanner from '@/components/FetchErrorBanner';
import { PROPERTY_STATUSES, PROPERTY_STATUS_LABEL } from '@/lib/propertyStatus';
import { todayStr } from '@/lib/localDate';

function fmtMoney(n) {
  if (n == null || n === '') return '—';
  const x = Number(n);
  if (Number.isNaN(x)) return String(n);
  return x.toLocaleString('zh-TW');
}

const ASSET_TYPE_BADGE = {
  LAND:  { label: '土地', cls: 'bg-orange-100 text-orange-700' },
  MIXED: { label: '混合', cls: 'bg-blue-100 text-blue-700' },
  OTHER: { label: '其他', cls: 'bg-gray-100 text-gray-600' },
};

function AssetFlagBadges({ asset }) {
  if (!asset) return null;
  const flags = [];
  const isDisposed = Array.isArray(asset.disposals) && asset.disposals.length > 0;
  if (isDisposed) flags.push({ label: `已處分 ${asset.disposals[0].disposalDate}`, cls: 'bg-red-100 text-red-700' });
  const typeBadge = ASSET_TYPE_BADGE[asset.assetType];
  if (typeBadge) flags.push(typeBadge);
  if (!isDisposed && asset.isAvailableForRental) flags.push({ label: '可出租', cls: 'bg-teal-100 text-teal-700' });
  if (asset.hasHouseTax) flags.push({ label: '房屋稅', cls: 'bg-amber-100 text-amber-700' });
  if (asset.hasLandTax) flags.push({ label: '地價稅', cls: 'bg-orange-100 text-orange-700' });
  if (asset.hasMaintenanceFee) flags.push({ label: '維修費', cls: 'bg-blue-100 text-blue-700' });
  if (flags.length === 0) return null;
  return (
    <span className="flex flex-wrap gap-1">
      {flags.map(f => (
        <span key={f.label} className={`text-xs px-1.5 py-0.5 rounded ${f.cls}`}>{f.label}</span>
      ))}
    </span>
  );
}

export function PropertyTableTab({
  loading,
  loadError,
  canEdit,
  year,
  currentYear,
  activeRange,
  sortedRows,
  mergedRows,
  summary,
  selected,
  setSelected,
  highlightPropertyId,
  currentMonthIncomeMap,
  selectedPropIds,
  setSelectedPropIds,
  batchStatus,
  setBatchStatus,
  batchSavingProps,
  handleBatchStatusChange,
  assetSortKey,
  assetSortDir,
  assetToggleSort,
  propInlineEdit,
  setPropInlineEdit,
  propInlineSaving,
  savePropField,
  openPropertyEdit,
  openEdit,
  openCreateFromProperty,
  deleteProperty,
  exportCSV,
  searchText,
  setSearchText,
  filterStatus,
  setFilterStatus,
  filterCategory,
  setFilterCategory,
  filterUnlinked,
  setFilterUnlinked,
  filterOverdue,
  setFilterOverdue,
  reportError,
  onRetryReport,
  incomeError,
  onRetryIncome,
  onRetryLoad,
}) {
  return (
    <>
      {/* Filter Bar */}
      {!loading && (
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <input
            type="text"
            placeholder="搜尋物業名稱、租客…"
            value={searchText}
            onChange={e => setSearchText(e.target.value)}
            className="border rounded px-3 py-1.5 text-sm w-56"
          />
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
            className="border rounded px-2 py-1.5 text-sm">
            <option value="">全部狀態</option>
            {PROPERTY_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)}
            className="border rounded px-2 py-1.5 text-sm">
            <option value="">全部分類</option>
            <option value="公司">公司</option>
            <option value="湯三姐">湯三姐</option>
          </select>
          <button
            onClick={() => setFilterUnlinked(v => !v)}
            className={`text-xs px-2.5 py-1 rounded border transition-colors ${filterUnlinked ? 'bg-amber-100 border-amber-400 text-amber-700 font-medium' : 'border-gray-300 text-gray-500 hover:border-amber-400'}`}
          >
            未綁資產
          </button>
          <button
            onClick={() => setFilterOverdue(v => !v)}
            className={`text-xs px-2.5 py-1 rounded border transition-colors ${filterOverdue ? 'bg-red-100 border-red-400 text-red-700 font-medium' : 'border-gray-300 text-gray-500 hover:border-red-400'}`}
          >
            本月逾期未收
          </button>
          {(searchText || filterStatus || filterCategory || filterUnlinked || filterOverdue) && (
            <button onClick={() => { setSearchText(''); setFilterStatus(''); setFilterCategory(''); setFilterUnlinked(false); setFilterOverdue(false); }}
              className="text-xs text-gray-500 hover:text-red-500 px-2 py-1 border rounded">
              ✕ 清除篩選
            </button>
          )}
          <span className="text-xs text-gray-400 ml-1">共 {sortedRows.length} 筆</span>
          <button
            onClick={exportCSV}
            className="ml-auto text-xs px-3 py-1.5 border rounded text-gray-600 hover:bg-gray-50"
            title="匯出含公益出租人、綁定資產等完整欄位">
            ↓ 匯出 CSV
          </button>
        </div>
      )}

      {/* Batch toolbar */}
      {canEdit && selectedPropIds.size > 0 && (
        <div className="flex items-center gap-3 px-3 py-2 mb-2 bg-indigo-50 border border-indigo-200 rounded-lg text-sm">
          <span className="font-medium text-indigo-700">已選 {selectedPropIds.size} 筆</span>
          <span className="text-gray-400">|</span>
          <label className="text-gray-600">批次改為</label>
          <select
            value={batchStatus}
            onChange={e => setBatchStatus(e.target.value)}
            className="border rounded px-2 py-1 text-sm">
            <option value="">— 選擇狀態 —</option>
            {PROPERTY_STATUSES.map(s => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
          <button
            onClick={handleBatchStatusChange}
            disabled={!batchStatus || batchSavingProps}
            className="px-3 py-1 text-sm bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50">
            {batchSavingProps ? '套用中…' : '套用'}
          </button>
          <button
            onClick={() => setSelectedPropIds(new Set())}
            className="ml-auto text-xs text-gray-500 hover:text-gray-700">
            取消選取
          </button>
        </div>
      )}

      {/* Error banners */}
      {reportError && <FetchErrorBanner message={reportError} onRetry={onRetryReport} />}
      {incomeError && <FetchErrorBanner message={incomeError} onRetry={onRetryIncome} />}

      {/* Main Table */}
      {loadError && <FetchErrorBanner message={loadError} onRetry={onRetryLoad} />}
      {loading ? (
        <p className="text-gray-500 py-8">載入中…</p>
      ) : !loadError && (
        <div className="bg-white rounded-lg shadow tbl-wrap">
          <table className="w-full text-sm">
            <thead className="bg-teal-50 text-xs sticky top-0 z-10">
              <tr>
                {canEdit && (
                  <th className="px-2 py-2 w-8 text-center" onClick={e => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      className="rounded"
                      checked={sortedRows.length > 0 && sortedRows.every(p => selectedPropIds.has(p.id))}
                      onChange={e => {
                        if (e.target.checked) setSelectedPropIds(new Set(sortedRows.map(p => p.id)));
                        else setSelectedPropIds(new Set());
                      }}
                      title="全選/取消全選"
                    />
                  </th>
                )}
                <SortableTh label="序號" colKey="sortOrder" sortKey={assetSortKey} sortDir={assetSortDir} onSort={assetToggleSort} className="px-3 py-2" align="center" />
                <SortableTh label="物業" colKey="name" sortKey={assetSortKey} sortDir={assetSortDir} onSort={assetToggleSort} className="px-3 py-2" />
                <SortableTh label="分類" colKey="category" sortKey={assetSortKey} sortDir={assetSortDir} onSort={assetToggleSort} className="px-3 py-2" />
                <SortableTh label="狀態" colKey="status" sortKey={assetSortKey} sortDir={assetSortDir} onSort={assetToggleSort} className="px-3 py-2" />
                <SortableTh label="租客" colKey="tenantName" sortKey={assetSortKey} sortDir={assetSortDir} onSort={assetToggleSort} className="px-3 py-2" />
                <SortableTh label="月租金" colKey="monthlyRent" sortKey={assetSortKey} sortDir={assetSortDir} onSort={assetToggleSort} className="px-3 py-2" align="right" />
                <th className={`text-center px-3 py-2 whitespace-nowrap ${year !== currentYear ? 'text-gray-400' : ''}`}
                  title={year !== currentYear ? `本欄固定顯示當前月份（${currentYear}/${String(new Date().getMonth()+1).padStart(2,'0')}），切換年度不影響` : undefined}>
                  本月<br/>收款{year !== currentYear && <span className="block text-[10px] font-normal text-gray-400">({currentYear}年)</span>}
                </th>
                <SortableTh label="租金+水電實收" colKey="rentIncome" sortKey={assetSortKey} sortDir={assetSortDir} onSort={assetToggleSort} className="px-3 py-2" align="right" />
                <SortableTh
                  label={activeRange ? `房屋稅 ⓘ` : '房屋稅'}
                  colKey="houseTax" sortKey={assetSortKey} sortDir={assetSortDir} onSort={assetToggleSort}
                  className={`px-3 py-2 ${activeRange ? 'text-gray-400' : ''}`} align="right"
                  title={activeRange ? `稅款固定以 ${year} 年度為主，區間模式不適用` : undefined} />
                <SortableTh
                  label={activeRange ? `地價稅 ⓘ` : '地價稅'}
                  colKey="landTax" sortKey={assetSortKey} sortDir={assetSortDir} onSort={assetToggleSort}
                  className={`px-3 py-2 ${activeRange ? 'text-gray-400' : ''}`} align="right"
                  title={activeRange ? `稅款固定以 ${year} 年度為主，區間模式不適用` : undefined} />
                <SortableTh label="維護費" colKey="maintenanceAmount" sortKey={assetSortKey} sortDir={assetSortDir} onSort={assetToggleSort} className="px-3 py-2" align="right" />
                <SortableTh label="淨利" colKey="netProfit" sortKey={assetSortKey} sortDir={assetSortDir} onSort={assetToggleSort} className="px-3 py-2" align="right" />
                <th className="text-left px-3 py-2 whitespace-nowrap">標記</th>
                {canEdit && <th className="text-center px-3 py-2 w-20 whitespace-nowrap">操作</th>}
              </tr>
            </thead>
            <tbody>
              {sortedRows.length === 0 ? (
                <tr><td colSpan={canEdit ? 15 : 13} className="text-center py-10 text-gray-400">無符合條件的物業</td></tr>
              ) : (
                sortedRows.map(p => {
                  const isSelected = selected?.id === p.id;
                  const isBatchSelected = selectedPropIds.has(p.id);
                  const highlight = highlightPropertyId && p.id === parseInt(highlightPropertyId, 10);
                  const hasIncome = p.rentIncome > 0;
                  const hasTax = p.houseTax > 0 || p.landTax > 0;
                  const hasMaint = p.maintenanceAmount > 0;
                  const expiryDays = p.currentContractEnd
                    ? Math.ceil((new Date(p.currentContractEnd) - new Date(todayStr())) / 86400000)
                    : null;
                  const hasUnpaidTax = p.hasUnpaidTax;
                  return (
                    <tr
                      key={p.id}
                      onClick={() => setSelected(isSelected ? null : p)}
                      className={`border-t cursor-pointer hover:bg-gray-50 transition-colors
                        ${highlight ? 'bg-amber-50' : ''}
                        ${isSelected ? 'bg-teal-50/70' : ''}
                        ${isBatchSelected ? 'bg-indigo-50/60' : ''}`}
                    >
                      {canEdit && (
                        <td className="px-2 py-2 text-center" onClick={e => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            className="rounded"
                            checked={isBatchSelected}
                            onChange={e => {
                              const next = new Set(selectedPropIds);
                              if (e.target.checked) next.add(p.id); else next.delete(p.id);
                              setSelectedPropIds(next);
                            }}
                          />
                        </td>
                      )}
                      <td className="px-3 py-2 text-center" onClick={e => e.stopPropagation()}>
                        {canEdit && propInlineEdit?.propertyId === p.id && propInlineEdit?.field === 'sortOrder' ? (
                          <input
                            autoFocus
                            type="number"
                            className="w-14 border rounded px-1 py-0.5 text-xs text-center"
                            value={propInlineEdit.value}
                            disabled={propInlineSaving}
                            onChange={e => setPropInlineEdit(prev => ({ ...prev, value: e.target.value }))}
                            onBlur={() => savePropField(p.id, 'sortOrder', propInlineEdit.value)}
                            onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') setPropInlineEdit(null); }}
                          />
                        ) : (
                          <span
                            className={`text-xs text-gray-600 ${canEdit ? 'cursor-pointer hover:bg-gray-100 rounded px-1' : ''}`}
                            onClick={() => canEdit && setPropInlineEdit({ propertyId: p.id, field: 'sortOrder', value: p.sortOrder ?? '' })}
                          >
                            {p.sortOrder ?? <span className="text-gray-300">—</span>}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 font-medium text-gray-800">
                        {p.name}{p.unitNo ? <span className="text-gray-400 text-xs ml-1">({p.unitNo})</span> : ''}
                        {p.buildingName && <span className="ml-1 text-gray-400 text-xs font-normal">({p.buildingName})</span>}
                      </td>
                      <td className="px-3 py-2 text-xs" onClick={e => e.stopPropagation()}>
                        {canEdit && propInlineEdit?.propertyId === p.id && propInlineEdit?.field === 'category' ? (
                          <select
                            autoFocus
                            className="border rounded px-1 py-0.5 text-xs"
                            value={propInlineEdit.value}
                            disabled={propInlineSaving}
                            onChange={e => setPropInlineEdit(prev => ({ ...prev, value: e.target.value }))}
                            onBlur={() => savePropField(p.id, 'category', propInlineEdit.value)}
                          >
                            <option value="">—</option>
                            <option value="公司">公司</option>
                            <option value="湯三姐">湯三姐</option>
                          </select>
                        ) : (
                          <span
                            className={`${canEdit ? 'cursor-pointer hover:bg-gray-100 rounded px-1' : ''}`}
                            onClick={() => canEdit && setPropInlineEdit({ propertyId: p.id, field: 'category', value: p.category ?? '' })}
                          >
                            {p.category || <span className="text-gray-300">—</span>}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2" onClick={e => e.stopPropagation()}>
                        {canEdit && propInlineEdit?.propertyId === p.id && propInlineEdit?.field === 'status' ? (
                          <select autoFocus
                            value={propInlineEdit.value}
                            onChange={e => setPropInlineEdit(v => ({ ...v, value: e.target.value }))}
                            onBlur={() => savePropField(p.id, 'status', propInlineEdit.value)}
                            onKeyDown={e => { if (e.key === 'Escape') setPropInlineEdit(null); }}
                            className="border border-indigo-400 rounded px-1 py-0.5 text-xs outline-none ring-1 ring-indigo-400">
                            {PROPERTY_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                          </select>
                        ) : (
                          <span
                            onClick={() => canEdit && setPropInlineEdit({ propertyId: p.id, field: 'status', value: p.status || 'available' })}
                            title={canEdit ? '點擊編輯狀態' : ''}
                            className={`text-xs px-1.5 py-0.5 rounded whitespace-nowrap ${canEdit ? 'cursor-pointer' : ''}
                              ${p.status === 'rented' ? 'bg-green-100 text-green-700'
                              : p.status === 'available' ? 'bg-gray-100 text-gray-500'
                              : 'bg-yellow-100 text-yellow-700'}`}>
                            {PROPERTY_STATUS_LABEL[p.status] || p.status || '—'}
                            {p.currentContractStatus === 'active' && p.status !== 'rented' && (
                              <Link href={`/rentals?propertyId=${p.id}&tab=contracts`} onClick={e => e.stopPropagation()}
                                className="ml-1 text-amber-500 hover:text-amber-700" title="有活躍合約但狀態非已出租，點擊前往合約管理">⚠</Link>
                            )}
                            {p.currentContractStatus !== 'active' && p.status === 'rented' && (
                              <Link href={`/rentals?propertyId=${p.id}&tab=contracts`} onClick={e => e.stopPropagation()}
                                className="ml-1 text-amber-500 hover:text-amber-700" title="無活躍合約但狀態為已出租，點擊前往合約管理">⚠</Link>
                            )}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-gray-600 text-xs">
                        <div className="flex flex-col gap-0.5">
                          <span className="truncate max-w-[110px]" title={p.currentTenantName || ''}>
                            {p.currentTenantName || <span className="text-gray-300">—</span>}
                          </span>
                          {expiryDays !== null && expiryDays <= 60 && (
                            <span className={`text-xs px-1 py-0.5 rounded w-fit ${expiryDays <= 0 ? 'bg-red-100 text-red-700' : expiryDays <= 30 ? 'bg-red-50 text-red-600' : 'bg-orange-50 text-orange-600'}`}>
                              {expiryDays <= 0 ? `已到期 ${Math.abs(expiryDays)} 天` : `${expiryDays} 天到期`}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right text-gray-700">
                        {p.currentMonthlyRent ? fmtMoney(p.currentMonthlyRent) : <span className="text-gray-300">—</span>}
                      </td>
                      <td className={`px-3 py-2 text-center ${year !== currentYear ? 'opacity-40' : ''}`} onClick={e => e.stopPropagation()}>
                        {(() => {
                          const inc = currentMonthIncomeMap.get(p.id);
                          if (!inc) return <span className="text-gray-300 text-xs">—</span>;
                          if (inc.status === 'completed') return <span className="text-xs px-1.5 py-0.5 rounded bg-green-100 text-green-700 font-medium">已收</span>;
                          if (inc.status === 'partial') return <span className="text-xs px-1.5 py-0.5 rounded bg-orange-100 text-orange-700 font-medium">部分收</span>;
                          if (inc.isOverdue) return <span className="text-xs px-1.5 py-0.5 rounded bg-red-100 text-red-700 font-medium">逾期</span>;
                          return <span className="text-xs px-1.5 py-0.5 rounded bg-yellow-100 text-yellow-700 font-medium">待收</span>;
                        })()}
                      </td>
                      <td className={`px-3 py-2 text-right font-medium ${hasIncome ? 'text-teal-700' : 'text-gray-300'}`}>
                        {hasIncome ? fmtMoney(p.rentIncome) : '—'}
                      </td>
                      <td className={`px-3 py-2 text-right ${hasTax && p.houseTax > 0 ? 'text-amber-700' : 'text-gray-300'}`}>
                        {p.houseTax > 0 ? fmtMoney(p.houseTax) : '—'}
                      </td>
                      <td className={`px-3 py-2 text-right ${hasTax && p.landTax > 0 ? 'text-orange-700' : 'text-gray-300'}`}>
                        {p.landTax > 0 ? fmtMoney(p.landTax) : '—'}
                      </td>
                      <td className={`px-3 py-2 text-right ${hasMaint ? 'text-blue-700' : 'text-gray-300'}`}>
                        {hasMaint ? fmtMoney(p.maintenanceAmount) : '—'}
                      </td>
                      <td className={`px-3 py-2 text-right font-semibold ${
                        hasIncome || hasTax || hasMaint
                          ? p.netProfit >= 0 ? 'text-green-700' : 'text-red-600'
                          : 'text-gray-300'}`}>
                        {hasIncome || hasTax || hasMaint ? fmtMoney(p.netProfit) : '—'}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-1">
                          {p.publicInterestLandlord && (
                            <span className="text-xs px-1.5 py-0.5 rounded bg-purple-100 text-purple-700">公益出租人</span>
                          )}
                          {hasUnpaidTax && (
                            <span className="text-xs px-1.5 py-0.5 rounded bg-red-100 text-red-700" title="有未繳稅款">稅款待繳</span>
                          )}
                          <AssetFlagBadges asset={p.asset} />
                        </div>
                      </td>
                      {canEdit && (
                        <td className="px-3 py-2 text-center whitespace-nowrap" onClick={e => e.stopPropagation()}>
                          <div className="flex items-center justify-center gap-2">
                            <Link
                              href={`/rentals?tab=cashier&propertySearch=${encodeURIComponent(p.name)}`}
                              className="text-teal-600 hover:underline text-xs font-medium"
                              onClick={e => e.stopPropagation()}>
                              收款
                            </Link>
                            <button className="text-indigo-600 hover:underline text-xs" onClick={() => openPropertyEdit(p)}>編輯</button>
                            {p.asset ? (
                              <button className="text-blue-600 hover:underline text-xs" onClick={() => openEdit(p.asset)}>資產</button>
                            ) : (
                              <button className="text-teal-600 hover:underline text-xs" onClick={() => openCreateFromProperty(p)}>+資產</button>
                            )}
                            <button className="text-red-500 hover:underline text-xs" onClick={() => deleteProperty(p)}>刪除</button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
            {/* Totals row */}
            {mergedRows.length > 0 && (
              <tfoot className="bg-teal-50 border-t-2 border-teal-200 text-xs font-semibold">
                <tr>
                  <td colSpan={6} className="px-3 py-2 text-gray-700">合計</td>
                  <td className="px-3 py-2" />
                  <td className="px-3 py-2 text-right text-teal-700">{fmtMoney(summary.totalRent)}</td>
                  <td className="px-3 py-2 text-right text-amber-700">{fmtMoney(summary.totalHouse)}</td>
                  <td className="px-3 py-2 text-right text-orange-700">{fmtMoney(summary.totalLand)}</td>
                  <td className="px-3 py-2 text-right text-blue-700">{fmtMoney(summary.totalMaint)}</td>
                  <td className={`px-3 py-2 text-right ${summary.totalNet >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                    {fmtMoney(summary.totalNet)}
                  </td>
                  <td colSpan={canEdit ? 3 : 1} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </>
  );
}
