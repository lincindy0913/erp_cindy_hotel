'use client';

import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import Navigation from '@/components/Navigation';
import { useToast } from '@/context/ToastContext';
import { hasPermission, PERMISSIONS } from '@/lib/permissions';

const ASSET_TYPE_OPTIONS = [
  { value: 'BUILDING', label: '建物' },
  { value: 'LAND', label: '土地' },
  { value: 'MIXED', label: '混合' },
  { value: 'OTHER', label: '其他' },
];

const STATUS_LABELS = {
  rented: '已出租',
  available: '空置',
  renovation: '裝修中',
  pending: '洽談中',
  inactive: '停用',
};

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

function AssetsPageInner() {
  const { data: session } = useSession();
  const { showToast } = useToast();
  const searchParams = useSearchParams();
  const linkOpenedRef = useRef(false);

  const userPerms = session?.user?.permissions || [];
  const isAdmin = session?.user?.role === 'admin';
  const canWildcard = isAdmin || userPerms.includes('*');
  const canView = canWildcard || hasPermission(userPerms, PERMISSIONS.ASSET_VIEW);
  const canEdit = canWildcard || hasPermission(userPerms, PERMISSIONS.ASSET_EDIT);

  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);

  // Core data
  const [properties, setProperties] = useState([]);
  const [reportData, setReportData] = useState([]);   // operating report rows
  const [taxesData, setTaxesData] = useState([]);     // all taxes for year
  const [loading, setLoading] = useState(true);

  // Selected property for detail panel
  const [selected, setSelected] = useState(null);
  const [detailIncomes, setDetailIncomes] = useState([]);
  const [detailLoading, setDetailLoading] = useState(false);

  // Asset modal
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: '', assetType: 'BUILDING', address: '', areaSqm: '',
    acquisitionDate: '', notes: '', rentalPropertyId: '',
    serialNo: '', category: '',
    isAvailableForRental: false, hasHouseTax: false, hasLandTax: false, hasMaintenanceFee: false,
  });

  const highlightPropertyId = searchParams.get('propertyId');
  const linkProperty = searchParams.get('linkProperty');

  // Load properties (static — no year dependency)
  const loadProperties = useCallback(async () => {
    const res = await fetch('/api/rentals/properties');
    const data = await res.json();
    const arr = res.ok && Array.isArray(data) ? data : [];
    setProperties(arr);
    return arr;
  }, []);

  // Load year-dependent report + taxes in parallel
  const loadYearData = useCallback(async (y) => {
    const [repRes, taxRes] = await Promise.all([
      fetch(`/api/rentals/reports/operating?year=${y}`),
      fetch(`/api/rentals/taxes?taxYear=${y}`),
    ]);
    const repData = await repRes.json();
    const taxData = await taxRes.json();
    setReportData(repRes.ok && repData.rows ? repData.rows : []);
    setTaxesData(taxRes.ok && Array.isArray(taxData) ? taxData : []);
  }, []);

  // Initial load
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      await Promise.all([loadProperties(), loadYearData(year)]);
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [loadProperties, loadYearData, year]);

  // Highlight by propertyId URL param
  useEffect(() => {
    if (!highlightPropertyId || properties.length === 0) return;
    const id = parseInt(highlightPropertyId, 10);
    if (Number.isNaN(id)) return;
    const row = properties.find(p => p.id === id);
    if (row) setSelected(row);
  }, [highlightPropertyId, properties]);

  // Pre-fill modal when linkProperty param present
  useEffect(() => {
    if (linkOpenedRef.current || !linkProperty || properties.length === 0) return;
    linkOpenedRef.current = true;
    setEditing(null);
    setForm(f => ({ ...f, rentalPropertyId: linkProperty }));
    setShowModal(true);
  }, [linkProperty, properties.length]);

  // Load detail incomes when a property is selected
  useEffect(() => {
    if (!selected) { setDetailIncomes([]); return; }
    let cancelled = false;
    setDetailLoading(true);
    setDetailIncomes([]);
    fetch(`/api/rentals/income?propertyId=${selected.id}&year=${year}`)
      .then(r => r.json())
      .then(data => { if (!cancelled) setDetailIncomes(Array.isArray(data) ? data : []); })
      .catch(() => { if (!cancelled) setDetailIncomes([]); })
      .finally(() => { if (!cancelled) setDetailLoading(false); });
    return () => { cancelled = true; };
  }, [selected?.id, year]);

  // Merged rows: properties + report + taxes split by type
  const { mergedRows, summary } = useMemo(() => {
    const reportByPid = new Map();
    for (const r of reportData) reportByPid.set(r.propertyId, r);

    const houseTaxByPid = new Map();
    const landTaxByPid = new Map();
    for (const t of taxesData) {
      const pid = t.propertyId;
      const amt = Number(t.amount || 0);
      if (t.taxType?.includes('房屋') || t.taxType?.includes('house')) {
        houseTaxByPid.set(pid, (houseTaxByPid.get(pid) || 0) + amt);
      } else if (t.taxType?.includes('地價') || t.taxType?.includes('land')) {
        landTaxByPid.set(pid, (landTaxByPid.get(pid) || 0) + amt);
      } else {
        // Unknown type — count in house tax bucket
        houseTaxByPid.set(pid, (houseTaxByPid.get(pid) || 0) + amt);
      }
    }

    let totalRent = 0, totalHouse = 0, totalLand = 0, totalMaint = 0;
    let rentedCount = 0, availableCount = 0;

    const rows = properties.map(p => {
      const r = reportByPid.get(p.id) || {};
      const houseTax = houseTaxByPid.get(p.id) || 0;
      const landTax = landTaxByPid.get(p.id) || 0;
      const maint = r.maintenanceAmount || 0;
      const rent = r.rentIncome || 0;
      const netProfit = rent - houseTax - landTax - maint;
      if (p.status === 'rented') rentedCount++;
      else if (p.status === 'available') availableCount++;
      totalRent += rent;
      totalHouse += houseTax;
      totalLand += landTax;
      totalMaint += maint;
      return { ...p, rentIncome: rent, houseTax, landTax, maintenanceAmount: maint, netProfit };
    });

    const totalNet = totalRent - totalHouse - totalLand - totalMaint;

    return {
      mergedRows: rows,
      summary: { rentedCount, availableCount, totalRent, totalHouse, totalLand, totalMaint, totalNet },
    };
  }, [properties, reportData, taxesData]);

  // Taxes for the selected property (detail panel)
  const selectedTaxes = useMemo(() => {
    if (!selected) return [];
    return taxesData.filter(t => t.propertyId === selected.id);
  }, [selected, taxesData]);

  // Unlinked properties for the modal dropdown
  const propertyOptions = useMemo(() => {
    return properties.filter(p => {
      if (!p.asset) return true;
      if (editing && p.asset.id === editing.id) return true;
      return false;
    });
  }, [properties, editing]);

  function openCreate() {
    setEditing(null);
    setForm({
      name: '', assetType: 'BUILDING', address: '', areaSqm: '',
      acquisitionDate: '', notes: '', rentalPropertyId: linkProperty || '',
      serialNo: '', category: '',
      isAvailableForRental: false, hasHouseTax: false, hasLandTax: false, hasMaintenanceFee: false,
    });
    setShowModal(true);
  }

  function openEdit(a) {
    setEditing(a);
    setForm({
      name: a.name || '',
      assetType: a.assetType || 'BUILDING',
      address: a.address || '',
      areaSqm: a.areaSqm != null ? String(a.areaSqm) : '',
      acquisitionDate: a.acquisitionDate || '',
      notes: a.notes || '',
      rentalPropertyId: a.rentalPropertyId != null ? String(a.rentalPropertyId) : '',
      serialNo: a.serialNo || '',
      category: a.category || '',
      isAvailableForRental: a.isAvailableForRental || false,
      hasHouseTax: a.hasHouseTax || false,
      hasLandTax: a.hasLandTax || false,
      hasMaintenanceFee: a.hasMaintenanceFee || false,
    });
    setShowModal(true);
  }

  async function saveModal() {
    if (!form.name.trim()) { showToast('請填寫資產名稱', 'error'); return; }
    setSaving(true);
    try {
      const body = {
        name: form.name.trim(),
        assetType: form.assetType,
        address: form.address.trim() || null,
        areaSqm: form.areaSqm === '' ? null : form.areaSqm,
        acquisitionDate: form.acquisitionDate || null,
        notes: form.notes.trim() || null,
        serialNo: form.serialNo.trim() || null,
        category: form.category.trim() || null,
        rentalPropertyId: form.rentalPropertyId === '' ? null : form.rentalPropertyId,
        isAvailableForRental: form.isAvailableForRental,
        hasHouseTax: form.hasHouseTax,
        hasLandTax: form.hasLandTax,
        hasMaintenanceFee: form.hasMaintenanceFee,
      };
      const url = editing ? `/api/assets/${editing.id}` : '/api/assets';
      const method = editing ? 'PATCH' : 'POST';
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) { showToast(data?.error?.message || data?.error || '儲存失敗', 'error'); return; }
      showToast(editing ? '已更新' : '已建立', 'success');
      setShowModal(false);
      const freshProps = await loadProperties();
      // Update selected to the property containing this asset
      const linkedProp = freshProps.find(p => p.asset?.id === data.id);
      if (linkedProp) setSelected(linkedProp);
    } catch {
      showToast('儲存失敗', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function deleteAsset(a) {
    if (!canEdit) return;
    if (!confirm(`確定刪除資產「${a.name}」？`)) return;
    const res = await fetch(`/api/assets/${a.id}`, { method: 'DELETE' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { showToast(data?.error?.message || data?.error || '刪除失敗', 'error'); return; }
    showToast('已刪除', 'success');
    if (selected?.asset?.id === a.id) setSelected(prev => prev ? { ...prev, asset: null } : null);
    await loadProperties();
  }

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
            <p className="text-sm text-gray-500 mt-0.5">各物業出租狀況、收租金額、稅費及維護費年度彙整</p>
          </div>
          <div className="flex items-center gap-3">
            <label className="text-sm text-gray-600">年度：</label>
            <select
              value={year}
              onChange={e => setYear(Number(e.target.value))}
              className="border rounded px-3 py-1.5 text-sm"
            >
              {[0,1,2,3,4].map(d => {
                const y = currentYear - d;
                return <option key={y} value={y}>{y} 年</option>;
              })}
            </select>
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
              label={`${year} 年租金收入`}
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
              label={`${year} 年維護費`}
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
              label={`${year} 年淨利`}
              value={`NT$ ${fmtMoneyShort(summary.totalNet)}`}
              sub={fmtMoney(summary.totalNet)}
              color={summary.totalNet >= 0 ? 'green' : 'red'}
            />
          </div>
        )}

        {/* Main Table */}
        {loading ? (
          <p className="text-gray-500 py-8">載入中…</p>
        ) : (
          <div className="bg-white rounded-lg shadow overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-teal-50 text-xs">
                <tr>
                  <th className="text-left px-3 py-2">物業</th>
                  <th className="text-left px-3 py-2">棟別</th>
                  <th className="text-left px-3 py-2">狀態</th>
                  <th className="text-left px-3 py-2">租客</th>
                  <th className="text-right px-3 py-2">月租金</th>
                  <th className="text-right px-3 py-2">{year} 年<br/>租金實收</th>
                  <th className="text-right px-3 py-2">{year} 年<br/>房屋稅</th>
                  <th className="text-right px-3 py-2">{year} 年<br/>地價稅</th>
                  <th className="text-right px-3 py-2">{year} 年<br/>維護費</th>
                  <th className="text-right px-3 py-2">{year} 年<br/>淨利</th>
                  <th className="text-left px-3 py-2">資產主檔</th>
                  <th className="text-left px-3 py-2">標記</th>
                  {canEdit && <th className="text-center px-3 py-2 w-20">操作</th>}
                </tr>
              </thead>
              <tbody>
                {mergedRows.length === 0 ? (
                  <tr><td colSpan={canEdit ? 13 : 12} className="text-center py-10 text-gray-400">尚無物業資料</td></tr>
                ) : (
                  mergedRows.map(p => {
                    const isSelected = selected?.id === p.id;
                    const highlight = highlightPropertyId && p.id === parseInt(highlightPropertyId, 10);
                    const hasIncome = p.rentIncome > 0;
                    const hasTax = p.houseTax > 0 || p.landTax > 0;
                    const hasMaint = p.maintenanceAmount > 0;
                    return (
                      <tr
                        key={p.id}
                        onClick={() => setSelected(isSelected ? null : p)}
                        className={`border-t cursor-pointer hover:bg-gray-50 transition-colors
                          ${highlight ? 'bg-amber-50' : ''}
                          ${isSelected ? 'bg-teal-50/70' : ''}`}
                      >
                        <td className="px-3 py-2 font-medium text-gray-800">
                          {p.name}{p.unitNo ? <span className="text-gray-400 text-xs ml-1">({p.unitNo})</span> : ''}
                        </td>
                        <td className="px-3 py-2 text-gray-500 text-xs">{p.buildingName || '—'}</td>
                        <td className="px-3 py-2">
                          <span className={`text-xs px-1.5 py-0.5 rounded whitespace-nowrap
                            ${p.status === 'rented' ? 'bg-green-100 text-green-700'
                            : p.status === 'available' ? 'bg-gray-100 text-gray-500'
                            : 'bg-yellow-100 text-yellow-700'}`}>
                            {STATUS_LABELS[p.status] || p.status || '—'}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-gray-600 max-w-[120px] truncate text-xs" title={p.currentTenantName || ''}>
                          {p.currentTenantName || <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-3 py-2 text-right text-gray-700">
                          {p.currentMonthlyRent ? fmtMoney(p.currentMonthlyRent) : <span className="text-gray-300">—</span>}
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
                        <td className="px-3 py-2 text-xs text-teal-700">
                          {p.asset ? (
                            <span>
                              {p.asset.name}
                              {p.asset.serialNo && <span className="ml-1 text-gray-400">#{p.asset.serialNo}</span>}
                              {p.asset.category && <span className="ml-1 text-gray-400">({p.asset.category})</span>}
                            </span>
                          ) : <span className="text-gray-300">未建立</span>}
                        </td>
                        <td className="px-3 py-2">
                          <AssetFlagBadges asset={p.asset} />
                        </td>
                        {canEdit && (
                          <td className="px-3 py-2 text-center" onClick={e => e.stopPropagation()}>
                            {p.asset ? (
                              <button className="text-blue-600 hover:underline text-xs" onClick={() => openEdit(p.asset)}>編輯</button>
                            ) : (
                              <button className="text-teal-600 hover:underline text-xs" onClick={() => {
                                setEditing(null);
                                setForm(f => ({ ...f, name: '', assetType: 'BUILDING', address: p.address || '', areaSqm: '', acquisitionDate: '', notes: '', serialNo: '', category: '', rentalPropertyId: String(p.id), isAvailableForRental: false, hasHouseTax: false, hasLandTax: false, hasMaintenanceFee: false }));
                                setShowModal(true);
                              }}>新增資產</button>
                            )}
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
                    <td colSpan={5} className="px-3 py-2 text-gray-700">合計</td>
                    <td className="px-3 py-2 text-right text-teal-700">{fmtMoney(summary.totalRent)}</td>
                    <td className="px-3 py-2 text-right text-amber-700">{fmtMoney(summary.totalHouse)}</td>
                    <td className="px-3 py-2 text-right text-orange-700">{fmtMoney(summary.totalLand)}</td>
                    <td className="px-3 py-2 text-right text-blue-700">{fmtMoney(summary.totalMaint)}</td>
                    <td className={`px-3 py-2 text-right ${summary.totalNet >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                      {fmtMoney(summary.totalNet)}
                    </td>
                    <td colSpan={canEdit ? 3 : 2} />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}

        {/* Detail Panel */}
        {selected && (
          <div className="mt-5 border border-gray-200 rounded-lg bg-white overflow-hidden">
            {/* Panel Header */}
            <div className="bg-teal-50 border-b border-teal-100 px-4 py-3 flex items-start justify-between">
              <div>
                <h3 className="text-base font-bold text-gray-800">
                  {selected.buildingName ? `${selected.buildingName} · ` : ''}{selected.name}
                  {selected.unitNo && <span className="text-sm text-gray-500 ml-2">({selected.unitNo})</span>}
                </h3>
                <div className="flex flex-wrap gap-3 mt-1 text-xs text-gray-500">
                  {selected.address && <span>📍 {selected.address}</span>}
                  <span>狀態：<strong className={selected.status === 'rented' ? 'text-green-700' : 'text-gray-600'}>
                    {STATUS_LABELS[selected.status] || selected.status}
                  </strong></span>
                  {selected.currentTenantName && <span>租客：<strong className="text-gray-700">{selected.currentTenantName}</strong></span>}
                  {selected.currentMonthlyRent && <span>月租：<strong className="text-teal-700">NT$ {fmtMoney(selected.currentMonthlyRent)}</strong></span>}
                  {selected.currentContractEnd && <span>合約到期：{selected.currentContractEnd}</span>}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Link href={`/rentals?editProperty=${selected.id}`}
                  className="text-xs text-teal-700 hover:underline border border-teal-300 px-2 py-1 rounded">
                  租屋設定
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
                {detailLoading ? (
                  <p className="text-xs text-gray-400">載入中…</p>
                ) : detailIncomes.length === 0 ? (
                  <p className="text-xs text-gray-400">{year} 年無收租紀錄</p>
                ) : (
                  <div className="overflow-x-auto">
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
                          const statusMap = { paid: { l: '已繳', cls: 'bg-green-100 text-green-700' }, partial: { l: '部分', cls: 'bg-yellow-100 text-yellow-700' }, pending: { l: '待繳', cls: 'bg-gray-100 text-gray-500' } };
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

              {/* Col 2: Taxes */}
              <div>
                <h4 className="text-sm font-semibold text-gray-700 mb-2">{year} 年稅款</h4>
                {selectedTaxes.length === 0 ? (
                  <p className="text-xs text-gray-400">
                    {(selected.asset?.hasHouseTax || selected.asset?.hasLandTax)
                      ? '已標記稅費，請至租屋管理 > 稅款登錄。'
                      : '無稅款紀錄'}
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
                      {selectedTaxes.map(t => (
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
                        <td className="px-2 py-1 text-right text-amber-700">{fmtMoney(selectedTaxes.reduce((s, t) => s + Number(t.amount || 0), 0))}</td>
                        <td colSpan={2} />
                      </tr>
                    </tfoot>
                  </table>
                )}

                {/* Asset info */}
                {selected.asset && (
                  <div className="mt-4 border rounded p-2 bg-gray-50 text-xs space-y-1">
                    <p className="font-semibold text-gray-700">
                      資產主檔：{selected.asset.name}
                      {selected.asset.serialNo && <span className="ml-1 text-gray-400">#{selected.asset.serialNo}</span>}
                    </p>
                    <p className="text-gray-500">
                      {ASSET_TYPE_OPTIONS.find(o => o.value === selected.asset.assetType)?.label || selected.asset.assetType}
                      {selected.asset.category && ` · ${selected.asset.category}`}
                      {selected.asset.areaSqm && ` · ${selected.asset.areaSqm} ㎡`}
                      {selected.asset.acquisitionDate && ` · 取得：${selected.asset.acquisitionDate}`}
                    </p>
                    {canEdit && (
                      <div className="flex gap-2 mt-1">
                        <button onClick={() => openEdit(selected.asset)} className="text-blue-600 hover:underline">編輯資產</button>
                        <span className="text-gray-300">|</span>
                        <button onClick={() => deleteAsset(selected.asset)} className="text-red-600 hover:underline">刪除</button>
                      </div>
                    )}
                  </div>
                )}
                {!selected.asset && canEdit && (
                  <button
                    className="mt-3 text-xs px-3 py-1.5 bg-teal-600 text-white rounded hover:bg-teal-700"
                    onClick={() => {
                      setEditing(null);
                      setForm(f => ({ ...f, name: '', assetType: 'BUILDING', address: selected.address || '', areaSqm: '', acquisitionDate: '', notes: '', serialNo: '', category: '', rentalPropertyId: String(selected.id), isAvailableForRental: false, hasHouseTax: false, hasLandTax: false, hasMaintenanceFee: false }));
                      setShowModal(true);
                    }}
                  >
                    新增資產主檔
                  </button>
                )}
              </div>

              {/* Col 3: Maintenance + P&L */}
              <div>
                <h4 className="text-sm font-semibold text-gray-700 mb-2">{year} 年損益小計</h4>
                <div className="space-y-2 mb-4">
                  {[
                    { label: '租金實收', value: mergedRows.find(r => r.id === selected.id)?.rentIncome || 0, cls: 'text-teal-700' },
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

                <h4 className="text-sm font-semibold text-gray-700 mb-2">{year} 年維護費</h4>
                <MaintenanceList propertyId={selected.id} year={year} />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Asset Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => !saving && setShowModal(false)}>
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4 p-6 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-gray-800 mb-4">{editing ? '編輯資產' : '新增資產'}</h3>
            <div className="space-y-3 text-sm">
              <div>
                <label className="text-gray-600">名稱 *</label>
                <input className="w-full border rounded px-3 py-2 mt-1" value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-gray-600">序號</label>
                  <input className="w-full border rounded px-3 py-2 mt-1" placeholder="例：A001" value={form.serialNo}
                    onChange={e => setForm(f => ({ ...f, serialNo: e.target.value }))} />
                </div>
                <div>
                  <label className="text-gray-600">類別</label>
                  <input className="w-full border rounded px-3 py-2 mt-1" placeholder="例：住宅、商業" value={form.category}
                    onChange={e => setForm(f => ({ ...f, category: e.target.value }))} />
                </div>
              </div>
              <div>
                <label className="text-gray-600">資產類型</label>
                <select className="w-full border rounded px-3 py-2 mt-1" value={form.assetType}
                  onChange={e => setForm(f => ({ ...f, assetType: e.target.value }))}>
                  {ASSET_TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-gray-600">地址</label>
                <input className="w-full border rounded px-3 py-2 mt-1" value={form.address}
                  onChange={e => setForm(f => ({ ...f, address: e.target.value }))} />
              </div>
              <div>
                <label className="text-gray-600">面積（㎡）</label>
                <input type="text" inputMode="decimal" className="w-full border rounded px-3 py-2 mt-1" value={form.areaSqm}
                  onChange={e => setForm(f => ({ ...f, areaSqm: e.target.value }))} />
              </div>
              <div>
                <label className="text-gray-600">取得日期（選填）</label>
                <input type="date" className="w-full border rounded px-3 py-2 mt-1" value={form.acquisitionDate}
                  onChange={e => setForm(f => ({ ...f, acquisitionDate: e.target.value }))} />
              </div>
              <div className="border rounded-lg p-3 bg-gray-50">
                <p className="text-gray-700 font-medium mb-2">出租與稅費標記</p>
                <div className="space-y-2">
                  {[
                    { key: 'isAvailableForRental', label: '可出租' },
                    { key: 'hasHouseTax', label: '有房屋稅' },
                    { key: 'hasLandTax', label: '有地價稅' },
                    { key: 'hasMaintenanceFee', label: '有維修費' },
                  ].map(item => (
                    <label key={item.key} className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={form[item.key]}
                        onChange={e => setForm(f => ({ ...f, [item.key]: e.target.checked }))} />
                      <span>{item.label}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-gray-600">綁定租屋物業</label>
                <select className="w-full border rounded px-3 py-2 mt-1" value={form.rentalPropertyId}
                  onChange={e => setForm(f => ({ ...f, rentalPropertyId: e.target.value }))}>
                  <option value="">不綁定</option>
                  {propertyOptions.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.buildingName ? `${p.buildingName} · ` : ''}{p.name}{p.unitNo ? `（${p.unitNo}）` : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-gray-600">備註</label>
                <textarea className="w-full border rounded px-3 py-2 mt-1" rows={2} value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button type="button" disabled={saving} className="px-4 py-2 text-sm bg-gray-200 rounded hover:bg-gray-300" onClick={() => setShowModal(false)}>取消</button>
              <button type="button" disabled={saving} className="px-4 py-2 text-sm bg-teal-600 text-white rounded hover:bg-teal-700 disabled:opacity-50" onClick={saveModal}>
                {saving ? '儲存中…' : '儲存'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Lazy maintenance list — only fetches when parent property is selected
function MaintenanceList({ propertyId, year }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/rentals/maintenance?propertyId=${propertyId}`)
      .then(r => r.json())
      .then(data => {
        if (cancelled) return;
        const arr = Array.isArray(data) ? data : [];
        // Filter to current year
        setItems(arr.filter(m => m.maintenanceDate?.startsWith(String(year))));
      })
      .catch(() => { if (!cancelled) setItems([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [propertyId, year]);

  if (loading) return <p className="text-xs text-gray-400">載入中…</p>;
  if (items.length === 0) return <p className="text-xs text-gray-400">{year} 年無維護費紀錄</p>;

  return (
    <table className="w-full text-xs border">
      <thead className="bg-gray-50">
        <tr>
          <th className="text-left px-2 py-1">日期</th>
          <th className="text-left px-2 py-1">類別</th>
          <th className="text-right px-2 py-1">金額</th>
        </tr>
      </thead>
      <tbody>
        {items.map(m => (
          <tr key={m.id} className="border-t">
            <td className="px-2 py-1">{m.maintenanceDate}</td>
            <td className="px-2 py-1">{m.category || '—'}</td>
            <td className="px-2 py-1 text-right text-blue-700 font-medium">{Number(m.amount).toLocaleString('zh-TW')}</td>
          </tr>
        ))}
      </tbody>
      <tfoot className="bg-gray-50 font-semibold">
        <tr>
          <td colSpan={2} className="px-2 py-1">合計</td>
          <td className="px-2 py-1 text-right text-blue-700">{items.reduce((s, m) => s + Number(m.amount || 0), 0).toLocaleString('zh-TW')}</td>
        </tr>
      </tfoot>
    </table>
  );
}

function AssetFlagBadges({ asset }) {
  if (!asset) return null;
  const flags = [];
  if (asset.isAvailableForRental) flags.push({ label: '可出租', cls: 'bg-teal-100 text-teal-700' });
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
