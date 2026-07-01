'use client';

import React from 'react';
import Link from 'next/link';
import { PROPERTY_STATUS_LABEL } from '@/lib/propertyStatus';
import MaintenanceList from '@/app/assets/_tabs/MaintenanceList';

const ASSET_TYPE_OPTIONS = [
  { value: 'BUILDING', label: '建物' },
  { value: 'LAND', label: '土地' },
  { value: 'MIXED', label: '混合' },
  { value: 'OTHER', label: '其他' },
];

function fmtMoney(n) {
  if (n == null || n === '') return '—';
  const x = Number(n);
  if (Number.isNaN(x)) return String(n);
  return x.toLocaleString('zh-TW');
}

export function DetailPanelModal({
  selected,
  setSelected,
  year,
  activeRange,
  canEdit,
  detailIncomes,
  detailLoading,
  detailTaxes,
  disposals,
  mergedRows,
  openPropertyEdit,
  openEdit,
  openCreateFromProperty,
  openDisposalCreate,
  openDisposalEdit,
  deleteDisposal,
  deleteAsset,
}) {
  if (!selected) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-start justify-center z-40 py-6 px-4 overflow-y-auto"
      onClick={() => setSelected(null)}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-6xl overflow-hidden"
        onClick={e => e.stopPropagation()}>
        {/* Panel Header */}
        <div className="bg-teal-50 border-b border-teal-100 px-4 py-3 flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-base font-bold text-gray-800">
                {selected.buildingName ? `${selected.buildingName} · ` : ''}{selected.name}
                {selected.unitNo && <span className="text-sm text-gray-500 ml-1">({selected.unitNo})</span>}
              </h3>
              <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${selected.status === 'rented' ? 'bg-green-100 text-green-700' : selected.status === 'available' ? 'bg-gray-100 text-gray-500' : 'bg-yellow-100 text-yellow-700'}`}>
                {PROPERTY_STATUS_LABEL[selected.status] || selected.status}
              </span>
              {selected.publicInterestLandlord && (
                <span className="text-xs text-purple-700 bg-purple-50 border border-purple-200 px-1.5 py-0.5 rounded">公益出租人</span>
              )}
              {selected.currentContractStatus === 'active' && selected.status !== 'rented' && (
                <Link href={`/rentals?propertyId=${selected.id}&tab=contracts`}
                  className="text-xs text-amber-600 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded hover:bg-amber-100">⚠ 狀態與合約不符</Link>
              )}
              {selected.currentContractStatus !== 'active' && selected.status === 'rented' && (
                <Link href={`/rentals?propertyId=${selected.id}&tab=contracts`}
                  className="text-xs text-amber-600 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded hover:bg-amber-100">⚠ 無活躍合約</Link>
              )}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-gray-600">
              {selected.address && <span className="text-gray-400">📍 {selected.address}</span>}
              {selected.currentTenantName ? (
                <span>🧑 租客：<strong className="text-gray-800">{selected.currentTenantName}</strong>
                  {selected.currentTenantPhone && <span className="text-gray-400 ml-1">{selected.currentTenantPhone}</span>}
                </span>
              ) : <span className="text-gray-400">無活躍租約</span>}
              {selected.currentMonthlyRent && (
                <span>💰 月租：<strong className="text-teal-700">NT$ {fmtMoney(selected.currentMonthlyRent)}</strong></span>
              )}
              {selected.currentContractNo && (
                <span>📄 合約：<strong className="text-gray-700">{selected.currentContractNo}</strong></span>
              )}
              {selected.currentContractStart && (
                <span>開始：{selected.currentContractStart}</span>
              )}
              {selected.currentContractEnd && (
                <span>到期：<strong className={new Date(selected.currentContractEnd) < new Date() ? 'text-red-600' : 'text-gray-700'}>{selected.currentContractEnd}</strong></span>
              )}
              {selected.currentDepositAmount > 0 && (
                <span>押金：<strong className="text-indigo-700">NT$ {fmtMoney(selected.currentDepositAmount)}</strong>
                  {selected.currentDepositReceived
                    ? <span className="ml-1 text-xs text-green-600">（已收）</span>
                    : <span className="ml-1 text-xs text-amber-600">（未收）</span>}
                  {selected.currentDepositRefunded && <span className="ml-1 text-xs text-gray-400">（已退）</span>}
                </span>
              )}
              {selected.renewalCount > 0 && (
                <span className="text-purple-600">🔄 第 {selected.renewalCount + 1} 次合約</span>
              )}
            </div>
            {selected.publicInterestLandlord && (
              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-xs text-purple-700 bg-purple-50 rounded px-2 py-1">
                <span>公益出租人</span>
                {selected.publicInterestApplicant && <span>申請人：{selected.publicInterestApplicant}</span>}
                {selected.publicInterestStartDate && <span>起：{selected.publicInterestStartDate}</span>}
                {selected.publicInterestEndDate && <span>迄：{selected.publicInterestEndDate}</span>}
                {selected.publicInterestRent > 0 && <span>公益租金：NT$ {fmtMoney(selected.publicInterestRent)}</span>}
                {selected.publicInterestNote && <span>備註：{selected.publicInterestNote}</span>}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {canEdit && (
              <button onClick={() => openPropertyEdit(selected)}
                className="text-xs text-indigo-700 hover:underline border border-indigo-300 bg-indigo-50 hover:bg-indigo-100 px-2 py-1 rounded">編輯物業</button>
            )}
            <Link href={`/rentals?tab=cashier&propertySearch=${encodeURIComponent(selected.name)}`}
              className="text-xs text-green-700 hover:underline border border-green-300 bg-green-50 px-2 py-1 rounded">
              收款
            </Link>
            <Link href={`/rentals?tab=taxes&propertyId=${selected.id}`}
              className="text-xs text-amber-700 hover:underline border border-amber-300 bg-amber-50 px-2 py-1 rounded">
              稅款
            </Link>
            <Link href={`/rentals?tab=maintenance&propertyId=${selected.id}`}
              className="text-xs text-blue-700 hover:underline border border-blue-300 bg-blue-50 px-2 py-1 rounded">
              維護費
            </Link>
            {canEdit && (
              <button
                onClick={() => openPropertyEdit(selected)}
                className="text-xs text-indigo-700 hover:bg-indigo-50 border border-indigo-300 px-2 py-1 rounded">
                ✏ 編輯物業設定
              </button>
            )}
            <Link href={`/rentals?propertyId=${selected.id}&tab=contracts`}
              className="text-xs text-teal-700 hover:underline border border-teal-300 px-2 py-1 rounded">
              合約管理
            </Link>
            <button onClick={() => setSelected(null)}
              className="text-gray-400 hover:text-gray-600 text-lg leading-none px-1">✕</button>
          </div>
        </div>

        <div className="p-4 grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Col 1: Monthly Income Breakdown */}
          <div>
            <h4 className="text-sm font-semibold text-gray-700 mb-2">
              {year} 年各月收租紀錄
            </h4>
            {detailIncomes.length === 0 ? (
              <p className="text-xs text-gray-400">{detailLoading ? '載入中…' : `${year} 年無收租紀錄`}</p>
            ) : (
              <div className={`tbl-wrap transition-opacity duration-150 ${detailLoading ? 'opacity-40 pointer-events-none' : ''}`}>
                <table className="w-full text-xs border">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="text-left px-2 py-1">月份</th>
                      <th className="text-right px-2 py-1">應收</th>
                      <th className="text-right px-2 py-1">實收</th>
                      <th className="text-left px-2 py-1">狀態</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detailIncomes.map(inc => {
                      const statusMap = { completed: { l: '已收', cls: 'bg-green-100 text-green-700' }, paid: { l: '已收', cls: 'bg-green-100 text-green-700' }, partial: { l: '部分收', cls: 'bg-yellow-100 text-yellow-700' }, pending: { l: '待收', cls: 'bg-gray-100 text-gray-500' } };
                      const st = statusMap[inc.status] || { l: inc.status, cls: 'bg-gray-100 text-gray-500' };
                      return (
                        <tr key={inc.id} className="border-t">
                          <td className="px-2 py-1">{inc.incomeYear}/{String(inc.incomeMonth).padStart(2,'0')}</td>
                          <td className="px-2 py-1 text-right">{fmtMoney(inc.expectedAmount)}</td>
                          <td className={`px-2 py-1 text-right font-medium ${inc.actualAmount > 0 ? 'text-teal-700' : 'text-gray-400'}`}>
                            {inc.actualAmount > 0 ? fmtMoney(inc.actualAmount) : '—'}
                          </td>
                          <td className="px-2 py-1">
                            <span className={`px-1.5 py-0.5 rounded ${st.cls}`}>{st.l}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="bg-gray-50 font-semibold">
                    <tr>
                      <td className="px-2 py-1">合計</td>
                      <td className="px-2 py-1 text-right">{fmtMoney(detailIncomes.reduce((s, i) => s + Number(i.expectedAmount || 0), 0))}</td>
                      <td className="px-2 py-1 text-right text-teal-700">{fmtMoney(detailIncomes.reduce((s, i) => s + Number(i.actualAmount || 0), 0))}</td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>

          {/* Col 2: Taxes + Asset Info + Disposals */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-semibold text-gray-700">{year} 年稅款</h4>
              {canEdit && (
                <Link href={`/rentals?tab=taxes&propertyId=${selected.id}`}
                  className="text-xs text-amber-600 hover:underline">
                  + 新增稅款
                </Link>
              )}
            </div>
            {detailTaxes.length === 0 ? (
              <p className="text-xs text-gray-400">
                {(selected.asset?.hasHouseTax || selected.asset?.hasLandTax) ? (
                  <>已標記稅費，請至{' '}
                    <Link href={`/rentals?tab=taxes&propertyId=${selected.id}`}
                      className="text-teal-600 underline hover:text-teal-800">
                      租屋管理 › 稅款登錄
                    </Link>
                  </>
                ) : '無稅款紀錄'}
              </p>
            ) : (
              <table className="w-full text-xs border">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left px-2 py-1">類型</th>
                    <th className="text-right px-2 py-1">金額</th>
                    <th className="text-left px-2 py-1">狀態</th>
                    <th className="text-left px-2 py-1">到期日</th>
                  </tr>
                </thead>
                <tbody>
                  {detailTaxes.map(t => (
                    <tr key={t.id} className="border-t">
                      <td className="px-2 py-1">{t.taxType || '—'}</td>
                      <td className="px-2 py-1 text-right font-medium text-amber-700">{fmtMoney(t.amount)}</td>
                      <td className="px-2 py-1">
                        <span className={`px-1.5 py-0.5 rounded ${t.status === 'paid' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                          {t.status === 'paid' ? '已繳' : '待繳'}
                        </span>
                      </td>
                      <td className="px-2 py-1 text-gray-500">{t.dueDate || '—'}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-50 font-semibold">
                  <tr>
                    <td className="px-2 py-1">合計</td>
                    <td className="px-2 py-1 text-right text-amber-700">{fmtMoney(detailTaxes.reduce((s, t) => s + Number(t.amount || 0), 0))}</td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              </table>
            )}

            {/* Asset info card */}
            {selected.asset ? (
              <div className="mt-4 border border-blue-200 rounded-lg p-3 bg-blue-50 text-xs">
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <div>
                    <span className="text-blue-400 font-medium mr-1">📋 資產主檔</span>
                    <span className="font-semibold text-gray-800">{selected.asset.name}</span>
                    {selected.asset.serialNo && <span className="ml-1 text-gray-400">#{selected.asset.serialNo}</span>}
                  </div>
                  {canEdit && (
                    <div className="flex gap-2 shrink-0">
                      <button onClick={() => openEdit(selected.asset)}
                        className="text-xs text-blue-700 border border-blue-300 px-2 py-0.5 rounded hover:bg-blue-100">
                        編輯資產
                      </button>
                      <button onClick={() => deleteAsset(selected.asset)}
                        className="text-xs text-red-600 border border-red-200 px-2 py-0.5 rounded hover:bg-red-50">
                        刪除
                      </button>
                    </div>
                  )}
                </div>
                <p className="text-gray-600">
                  {ASSET_TYPE_OPTIONS.find(o => o.value === selected.asset.assetType)?.label || selected.asset.assetType}
                  {selected.asset.category && ` · ${selected.asset.category}`}
                  {selected.asset.areaSqm && ` · ${selected.asset.areaSqm} ㎡`}
                  {selected.asset.acquisitionDate && ` · 取得：${selected.asset.acquisitionDate}`}
                </p>
                {(selected.asset.ownerName || selected.asset.registeredOwner || selected.asset.houseTaxRegistrationNo) && (
                  <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1.5 text-gray-600">
                    {selected.asset.ownerName && <span>所有權人：<strong className="text-gray-800">{selected.asset.ownerName}</strong></span>}
                    {selected.asset.registeredOwner && <span>建物登記：<strong className="text-gray-800">{selected.asset.registeredOwner}</strong></span>}
                    {selected.asset.houseTaxRegistrationNo && <span>房屋稅籍：<strong className="text-gray-800">{selected.asset.houseTaxRegistrationNo}</strong></span>}
                  </div>
                )}
                <div className="flex gap-3 mt-1.5 text-gray-500">
                  {selected.asset.hasHouseTax && <span className="bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">房屋稅</span>}
                  {selected.asset.hasLandTax && <span className="bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded">地價稅</span>}
                  {selected.asset.hasMaintenanceFee && <span className="bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">維護費</span>}
                </div>
              </div>
            ) : canEdit ? (
              <button
                className="mt-3 text-xs px-3 py-1.5 bg-teal-600 text-white rounded hover:bg-teal-700"
                onClick={() => openCreateFromProperty(selected)}
              >
                新增資產主檔
              </button>
            ) : null}

            {/* 資產處分記錄 */}
            {selected.asset && (
              <div className="mt-4">
                <div className="flex items-center justify-between mb-1.5">
                  <h4 className="text-xs font-semibold text-gray-700">資產處分記錄</h4>
                  {canEdit && (
                    <button onClick={openDisposalCreate}
                      className="text-xs text-red-600 border border-red-200 px-2 py-0.5 rounded hover:bg-red-50">
                      + 新增處分
                    </button>
                  )}
                </div>
                {disposals.length === 0 ? (
                  <p className="text-xs text-gray-400">尚無處分記錄</p>
                ) : (
                  <div className="space-y-2">
                    {disposals.map(d => (
                      <div key={d.id} className="border border-red-200 rounded-lg p-2.5 bg-red-50 text-xs">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <span className="font-semibold text-gray-800">{d.disposalDate}</span>
                            {d.salePrice != null && (
                              <span className="ml-2 text-teal-700 font-medium">成交 NT$ {fmtMoney(d.salePrice)}</span>
                            )}
                          </div>
                          {canEdit && (
                            <div className="flex gap-2 shrink-0">
                              <button onClick={() => openDisposalEdit(d)}
                                className="text-indigo-600 hover:underline">編輯</button>
                              <button onClick={() => deleteDisposal(d)}
                                className="text-red-600 hover:underline">刪除</button>
                            </div>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-gray-600">
                          {d.stampTax != null && <span>印花稅 NT$ {fmtMoney(d.stampTax)}</span>}
                          {d.landValueIncrementTax != null && <span>土地增值稅 NT$ {fmtMoney(d.landValueIncrementTax)}</span>}
                          {d.notes && <span className="text-gray-500">{d.notes}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Col 3: Maintenance + P&L */}
          <div>
            <h4 className="text-sm font-semibold text-gray-700 mb-2">{year} 年損益小計</h4>
            <div className="space-y-2 mb-4">
              {[
                { label: '租金實收', value: mergedRows.find(r => r.id === selected.id)?.rentOnly || 0, cls: 'text-teal-700' },
                { label: '水電實收', value: mergedRows.find(r => r.id === selected.id)?.utilityIncome || 0, cls: 'text-cyan-700' },
                { label: '房屋稅', value: -(mergedRows.find(r => r.id === selected.id)?.houseTax || 0), cls: 'text-amber-700' },
                { label: '地價稅', value: -(mergedRows.find(r => r.id === selected.id)?.landTax || 0), cls: 'text-orange-700' },
                { label: '維護費', value: -(mergedRows.find(r => r.id === selected.id)?.maintenanceAmount || 0), cls: 'text-blue-700' },
              ].map(row => (
                <div key={row.label} className="flex justify-between text-sm border-b pb-1">
                  <span className="text-gray-600">{row.label}</span>
                  <span className={`font-medium ${row.cls}`}>NT$ {fmtMoney(Math.abs(row.value))}</span>
                </div>
              ))}
              {(() => {
                const r = mergedRows.find(r => r.id === selected.id);
                const net = r?.netProfit || 0;
                return (
                  <div className="flex justify-between text-sm font-bold pt-1">
                    <span className="text-gray-800">年度淨利</span>
                    <span className={net >= 0 ? 'text-green-700' : 'text-red-600'}>NT$ {fmtMoney(net)}</span>
                  </div>
                );
              })()}
            </div>

            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-semibold text-gray-700">{activeRange ? `${activeRange.start}~${activeRange.end}` : `${year} 年`} 維護費</h4>
              {canEdit && (
                <Link href={`/rentals?tab=maintenance&propertyId=${selected.id}`}
                  className="text-xs text-blue-600 hover:underline">
                  + 新增維護費
                </Link>
              )}
            </div>
            <MaintenanceList propertyId={selected.id} year={year} />
          </div>
        </div>
      </div>
    </div>
  );
}
