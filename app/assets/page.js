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
  const [currentMonthIncomeMap, setCurrentMonthIncomeMap] = useState(new Map()); // propertyId → income

  // Selected property for detail panel
  const [selected, setSelected] = useState(null);
  const [detailIncomes, setDetailIncomes] = useState([]);
  const [detailLoading, setDetailLoading] = useState(false);

  // Confirmation modal (replaces browser confirm() which gets blocked in production)
  const [confirmState, setConfirmState] = useState(null); // { message, onConfirm, confirmLabel }
  const showConfirm = (message, onConfirm, confirmLabel = '確定刪除') => setConfirmState({ message, onConfirm, confirmLabel });

  // Property inline edit (序號/分類/狀態)
  const [propInlineEdit, setPropInlineEdit] = useState(null); // { propertyId, field, value }
  const [propInlineSaving, setPropInlineSaving] = useState(false);
  const [syncingAll, setSyncingAll] = useState(false);

  // Property edit modal
  const [showPropModal, setShowPropModal] = useState(false);
  const [editingProp, setEditingProp] = useState(null);
  const [propSaving, setPropSaving] = useState(false);
  const [propForm, setPropForm] = useState({
    name: '', buildingName: '', unitNo: '', address: '', ownerName: '',
    houseTaxRegistrationNo: '', status: 'available', category: '',
    sortOrder: '', rentCollectAccountId: '', depositAccountId: '', note: '',
    collectUtilityFee: false, publicInterestLandlord: false,
  });
  const [accounts, setAccounts] = useState([]);

  // Filter state
  const [searchText, setSearchText] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterCategory, setFilterCategory] = useState('');

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
    const now = new Date();
    const curYear = now.getFullYear();
    const curMonth = now.getMonth() + 1;
    (async () => {
      setLoading(true);
      const [, , acctRes, incomeRes] = await Promise.all([
        loadProperties(),
        loadYearData(year),
        fetch('/api/cashflow/accounts').then(r => r.ok ? r.json() : []),
        fetch(`/api/rentals/income?year=${curYear}&month=${curMonth}`).then(r => r.ok ? r.json() : []),
      ]);
      if (!cancelled) {
        setLoading(false);
        if (Array.isArray(acctRes)) setAccounts(acctRes);
        if (Array.isArray(incomeRes)) {
          const today = new Date().toISOString().split('T')[0];
          const map = new Map();
          incomeRes.forEach(i => {
            const existing = map.get(i.propertyId);
            if (!existing || i.status === 'completed' || (i.status === 'partial' && existing.status === 'pending')) {
              map.set(i.propertyId, { ...i, isOverdue: i.status === 'pending' && i.dueDate < today });
            }
          });
          setCurrentMonthIncomeMap(map);
        }
      }
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

  // Filtered rows (search + status + category)
  const filteredRows = useMemo(() => {
    return mergedRows.filter(p => {
      if (searchText) {
        const q = searchText.toLowerCase();
        const match = (p.name || '').toLowerCase().includes(q)
          || (p.buildingName || '').toLowerCase().includes(q)
          || (p.currentTenantName || '').toLowerCase().includes(q);
        if (!match) return false;
      }
      if (filterStatus && p.status !== filterStatus) return false;
      if (filterCategory && p.category !== filterCategory) return false;
      return true;
    });
  }, [mergedRows, searchText, filterStatus, filterCategory]);

  function exportCSV() {
    const headers = ['物業', '棟別', '序號', '分類', '狀態', '租客', '月租金',
      `${year}年租金實收`, `${year}年房屋稅`, `${year}年地價稅`, `${year}年維護費`, `${year}年淨利`];
    const rows = filteredRows.map(p => [
      p.name + (p.unitNo ? `(${p.unitNo})` : ''),
      p.buildingName || '',
      p.sortOrder ?? '',
      p.category || '',
      STATUS_LABELS[p.status] || p.status || '',
      p.currentTenantName || '',
      p.currentMonthlyRent || '',
      p.rentIncome || 0,
      p.houseTax || 0,
      p.landTax || 0,
      p.maintenanceAmount || 0,
      p.netProfit || 0,
    ]);
    const csv = [headers, ...rows]
      .map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `資產管理_${year}年_${new Date().toLocaleDateString('zh-TW').replace(/\//g, '-')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

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

  async function syncPropertyStatus(p) {
    const correctStatus = p.currentContractStatus === 'active' ? 'rented' : (p.status === 'rented' ? 'available' : p.status);
    if (p.status === correctStatus) { showToast('狀態已是最新，無需同步', 'info'); return; }
    const res = await fetch(`/api/rentals/properties/${p.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: correctStatus }),
    });
    if (!res.ok) { showToast('同步失敗', 'error'); return; }
    showToast(`已同步：${p.name} → ${STATUS_LABELS[correctStatus] || correctStatus}`, 'success');
    setProperties(prev => prev.map(x => x.id === p.id ? { ...x, status: correctStatus } : x));
    if (selected?.id === p.id) setSelected(s => s ? { ...s, status: correctStatus } : s);
  }

  async function syncAllStatus() {
    setSyncingAll(true);
    let updated = 0;
    try {
      for (const p of properties) {
        const correctStatus = p.currentContractStatus === 'active' ? 'rented' : (p.status === 'rented' ? 'available' : p.status);
        if (p.status !== correctStatus) {
          await fetch(`/api/rentals/properties/${p.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: correctStatus }),
          });
          updated++;
        }
      }
      showToast(updated > 0 ? `已同步 ${updated} 筆物業狀態` : '所有物業狀態均已是最新', 'success');
      await loadProperties();
    } catch { showToast('批次同步失敗', 'error'); }
    finally { setSyncingAll(false); }
  }

  async function savePropField(propertyId, field, value) {
    setPropInlineSaving(true);
    try {
      const body = {};
      if (field === 'sortOrder') body.sortOrder = value !== '' && value !== null ? parseInt(value) : null;
      else if (field === 'status') body.status = value;
      else body.category = value || null;
      const res = await fetch(`/api/rentals/properties/${propertyId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) { showToast('儲存失敗', 'error'); return; }
      const parsed = field === 'sortOrder'
        ? (value !== '' && value !== null ? parseInt(value) : null)
        : value || null;
      setProperties(prev => prev.map(p => p.id === propertyId ? { ...p, [field]: parsed } : p));
      if (selected?.id === propertyId) setSelected(s => s ? { ...s, [field]: parsed } : s);
    } catch { showToast('儲存失敗', 'error'); }
    finally { setPropInlineSaving(false); setPropInlineEdit(null); }
  }

  function openNewProperty() {
    setEditingProp(null);
    setPropForm({
      name: '', buildingName: '', unitNo: '', address: '', ownerName: '',
      houseTaxRegistrationNo: '', status: 'available', category: '',
      sortOrder: '', rentCollectAccountId: '', depositAccountId: '', note: '',
      collectUtilityFee: false, publicInterestLandlord: false,
    });
    setShowPropModal(true);
  }

  function openPropertyEdit(p) {
    setEditingProp(p);
    setPropForm({
      name: p.name || '',
      buildingName: p.buildingName || '',
      unitNo: p.unitNo || '',
      address: p.address || '',
      ownerName: p.ownerName || '',
      houseTaxRegistrationNo: p.houseTaxRegistrationNo || '',
      status: p.status || 'available',
      category: p.category || '',
      sortOrder: p.sortOrder != null ? String(p.sortOrder) : '',
      rentCollectAccountId: p.rentCollectAccountId != null ? String(p.rentCollectAccountId) : '',
      depositAccountId: p.depositAccountId != null ? String(p.depositAccountId) : '',
      note: p.note || '',
      collectUtilityFee: p.collectUtilityFee || false,
      publicInterestLandlord: p.publicInterestLandlord || false,
    });
    setShowPropModal(true);
  }

  async function savePropertyEdit() {
    if (!propForm.name.trim() && !editingProp) { showToast('請填寫物業名稱', 'error'); return; }
    setPropSaving(true);
    try {
      const body = {
        name: propForm.name.trim(),
        buildingName: propForm.buildingName,
        unitNo: propForm.unitNo,
        address: propForm.address,
        ownerName: propForm.ownerName || null,
        houseTaxRegistrationNo: propForm.houseTaxRegistrationNo || null,
        status: propForm.status,
        category: propForm.category || null,
        sortOrder: propForm.sortOrder !== '' ? parseInt(propForm.sortOrder) : null,
        rentCollectAccountId: propForm.rentCollectAccountId ? parseInt(propForm.rentCollectAccountId) : null,
        depositAccountId: propForm.depositAccountId ? parseInt(propForm.depositAccountId) : null,
        note: propForm.note || null,
        collectUtilityFee: propForm.collectUtilityFee,
        publicInterestLandlord: propForm.publicInterestLandlord,
      };
      if (editingProp?.asset) {
        delete body.name;
        delete body.address;
      }
      const url = editingProp ? `/api/rentals/properties/${editingProp.id}` : '/api/rentals/properties';
      const method = editingProp ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) { showToast(data?.error?.message || data?.error || '儲存失敗', 'error'); return; }
      showToast('已儲存', 'success');
      setShowPropModal(false);
      await loadProperties();
    } catch { showToast('儲存失敗', 'error'); }
    finally { setPropSaving(false); }
  }

  async function deleteProperty(p) {
    if (!canEdit) return;
    showConfirm(`確定刪除物業「${p.name}」？此操作無法復原。`, async () => {
      const res = await fetch(`/api/rentals/properties/${p.id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data?.code === 'ACCOUNT_HAS_DEPENDENCIES' && data?.counts) {
          const { contractCount, incomeCount, taxCount, maintenanceCount } = data.counts;
          const lines = [];
          if (contractCount > 0) lines.push(`合約 ${contractCount} 筆`);
          if (incomeCount > 0) lines.push(`收款紀錄 ${incomeCount} 筆`);
          if (taxCount > 0) lines.push(`稅務紀錄 ${taxCount} 筆`);
          if (maintenanceCount > 0) lines.push(`維修紀錄 ${maintenanceCount} 筆`);
          showConfirm(
            `「${p.name}」尚有關聯資料：${lines.join('、')}。\n確定要連同所有資料一起刪除？此操作無法復原。`,
            async () => {
              const res2 = await fetch(`/api/rentals/properties/${p.id}?force=true`, { method: 'DELETE' });
              const data2 = await res2.json().catch(() => ({}));
              if (!res2.ok) { showToast(data2?.error || '刪除失敗', 'error'); return; }
              showToast('已刪除', 'success');
              if (selected?.id === p.id) setSelected(null);
              await loadProperties();
            },
            '強制刪除'
          );
          return;
        }
        showToast(data?.error || '刪除失敗', 'error');
        return;
      }
      showToast('已刪除', 'success');
      if (selected?.id === p.id) setSelected(null);
      await loadProperties();
    });
  }

  async function deleteAsset(a) {
    if (!canEdit) return;
    showConfirm(`確定刪除資產「${a.name}」？`, async () => {
      const res = await fetch(`/api/assets/${a.id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { showToast(data?.error?.message || data?.error || '刪除失敗', 'error'); return; }
      showToast('已刪除', 'success');
      if (selected?.asset?.id === a.id) setSelected(prev => prev ? { ...prev, asset: null } : null);
      await loadProperties();
    });
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
          <div className="flex items-center gap-3 flex-wrap">
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
              <button type="button" onClick={syncAllStatus} disabled={syncingAll || loading}
                className="px-3 py-1.5 bg-amber-50 border border-amber-300 text-amber-700 text-sm rounded-lg hover:bg-amber-100 disabled:opacity-50"
                title="依合約自動更新所有物業出租狀態">
                {syncingAll ? '同步中…' : '↺ 同步狀態'}
              </button>
            )}
            <button type="button" onClick={exportCSV}
              className="px-3 py-1.5 bg-gray-100 border border-gray-300 text-gray-700 text-sm rounded-lg hover:bg-gray-200">
              ↓ 匯出 CSV
            </button>
            {canEdit && (
              <button type="button" onClick={openNewProperty}
                className="px-4 py-2 bg-teal-600 text-white text-sm rounded-lg hover:bg-teal-700">
                新增物業
              </button>
            )}
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

        {/* Filter Bar */}
        {!loading && (
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <input
              type="text"
              placeholder="搜尋物業名稱、棟別、租客…"
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
              className="border rounded px-3 py-1.5 text-sm w-56"
            />
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
              className="border rounded px-2 py-1.5 text-sm">
              <option value="">全部狀態</option>
              {Object.entries(STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)}
              className="border rounded px-2 py-1.5 text-sm">
              <option value="">全部分類</option>
              <option value="公司">公司</option>
              <option value="湯三姐">湯三姐</option>
            </select>
            {(searchText || filterStatus || filterCategory) && (
              <button onClick={() => { setSearchText(''); setFilterStatus(''); setFilterCategory(''); }}
                className="text-xs text-gray-500 hover:text-red-500 px-2 py-1 border rounded">
                ✕ 清除篩選
              </button>
            )}
            <span className="text-xs text-gray-400 ml-1">共 {filteredRows.length} 筆</span>
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
                  <th className="text-center px-3 py-2">序號</th>
                  <th className="text-left px-3 py-2">分類</th>
                  <th className="text-left px-3 py-2">狀態</th>
                  <th className="text-left px-3 py-2">租客</th>
                  <th className="text-right px-3 py-2">月租金</th>
                  <th className="text-center px-3 py-2">本月<br/>收款</th>
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
                {filteredRows.length === 0 ? (
                  <tr><td colSpan={canEdit ? 16 : 15} className="text-center py-10 text-gray-400">無符合條件的物業</td></tr>
                ) : (
                  filteredRows.map(p => {
                    const isSelected = selected?.id === p.id;
                    const highlight = highlightPropertyId && p.id === parseInt(highlightPropertyId, 10);
                    const hasIncome = p.rentIncome > 0;
                    const hasTax = p.houseTax > 0 || p.landTax > 0;
                    const hasMaint = p.maintenanceAmount > 0;
                    const expiryDays = p.currentContractEnd
                      ? Math.ceil((new Date(p.currentContractEnd) - new Date()) / 86400000)
                      : null;
                    const hasUnpaidTax = taxesData.some(t => t.propertyId === p.id && t.status !== 'paid');
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
                              {Object.entries(STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                            </select>
                          ) : (
                            <span
                              onClick={() => canEdit && setPropInlineEdit({ propertyId: p.id, field: 'status', value: p.status || 'available' })}
                              title={canEdit ? '點擊編輯狀態' : ''}
                              className={`text-xs px-1.5 py-0.5 rounded whitespace-nowrap ${canEdit ? 'cursor-pointer' : ''}
                                ${p.status === 'rented' ? 'bg-green-100 text-green-700'
                                : p.status === 'available' ? 'bg-gray-100 text-gray-500'
                                : 'bg-yellow-100 text-yellow-700'}`}>
                              {STATUS_LABELS[p.status] || p.status || '—'}
                              {canEdit && p.currentContractStatus === 'active' && p.status !== 'rented' && (
                                <span className="ml-1 text-amber-500" title="有活躍合約但狀態非已出租，建議同步">⚠</span>
                              )}
                              {canEdit && p.currentContractStatus !== 'active' && p.status === 'rented' && (
                                <span className="ml-1 text-amber-500" title="無活躍合約但狀態為已出租，建議同步">⚠</span>
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
                        <td className="px-3 py-2 text-center" onClick={e => e.stopPropagation()}>
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
                              <a
                                href={`/rentals?tab=cashier&propertySearch=${encodeURIComponent(p.name)}`}
                                className="text-teal-600 hover:underline text-xs font-medium"
                                onClick={e => e.stopPropagation()}>
                                收款
                              </a>
                              <button className="text-indigo-600 hover:underline text-xs" onClick={() => openPropertyEdit(p)}>編輯</button>
                              {p.asset ? (
                                <button className="text-blue-600 hover:underline text-xs" onClick={() => openEdit(p.asset)}>資產</button>
                              ) : (
                                <button className="text-teal-600 hover:underline text-xs" onClick={() => {
                                  setEditing(null);
                                  setForm(f => ({ ...f, name: '', assetType: 'BUILDING', address: p.address || '', areaSqm: '', acquisitionDate: '', notes: '', serialNo: '', category: '', rentalPropertyId: String(p.id), isAvailableForRental: false, hasHouseTax: false, hasLandTax: false, hasMaintenanceFee: false }));
                                  setShowModal(true);
                                }}>+資產</button>
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
                    <td colSpan={7} className="px-3 py-2 text-gray-700">合計</td>
                    <td className="px-3 py-2" />
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
            <div className="bg-teal-50 border-b border-teal-100 px-4 py-3 flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-base font-bold text-gray-800">
                    {selected.buildingName ? `${selected.buildingName} · ` : ''}{selected.name}
                    {selected.unitNo && <span className="text-sm text-gray-500 ml-1">({selected.unitNo})</span>}
                  </h3>
                  <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${selected.status === 'rented' ? 'bg-green-100 text-green-700' : selected.status === 'available' ? 'bg-gray-100 text-gray-500' : 'bg-yellow-100 text-yellow-700'}`}>
                    {STATUS_LABELS[selected.status] || selected.status}
                  </span>
                  {selected.publicInterestLandlord && (
                    <span className="text-xs text-purple-700 bg-purple-50 border border-purple-200 px-1.5 py-0.5 rounded">公益出租人</span>
                  )}
                  {selected.currentContractStatus === 'active' && selected.status !== 'rented' && (
                    <span className="text-xs text-amber-600 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">⚠ 狀態與合約不符</span>
                  )}
                  {selected.currentContractStatus !== 'active' && selected.status === 'rented' && (
                    <span className="text-xs text-amber-600 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">⚠ 無活躍合約</span>
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
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {canEdit && (
                  <button onClick={() => syncPropertyStatus(selected)}
                    className="text-xs text-amber-700 hover:underline border border-amber-300 bg-amber-50 hover:bg-amber-100 px-2 py-1 rounded"
                    title="依合約自動更新此物業狀態">↺ 同步狀態</button>
                )}
                {canEdit && (
                  <button onClick={() => openPropertyEdit(selected)}
                    className="text-xs text-indigo-700 hover:underline border border-indigo-300 bg-indigo-50 hover:bg-indigo-100 px-2 py-1 rounded">編輯物業</button>
                )}
                <Link href={`/rentals?propertyId=${selected.id}&tab=contracts`}
                  className="text-xs text-teal-700 hover:underline border border-teal-300 px-2 py-1 rounded">
                  租屋管理 →
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
                          const statusMap = { completed: { l: '已收', cls: 'bg-green-100 text-green-700' }, partial: { l: '部分收', cls: 'bg-yellow-100 text-yellow-700' }, pending: { l: '待收', cls: 'bg-gray-100 text-gray-500' } };
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
            <div className="flex justify-between items-center gap-2 mt-6">
              <div>
                {editing && (
                  <button type="button" disabled={saving}
                    className="px-4 py-2 text-sm text-red-600 border border-red-200 rounded hover:bg-red-50 disabled:opacity-50"
                    onClick={() => { setShowModal(false); deleteAsset(editing); }}>
                    刪除資產
                  </button>
                )}
              </div>
              <div className="flex gap-2">
                <button type="button" disabled={saving} className="px-4 py-2 text-sm bg-gray-200 rounded hover:bg-gray-300" onClick={() => setShowModal(false)}>取消</button>
                <button type="button" disabled={saving} className="px-4 py-2 text-sm bg-teal-600 text-white rounded hover:bg-teal-700 disabled:opacity-50" onClick={saveModal}>
                  {saving ? '儲存中…' : '儲存'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {confirmState && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60]">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-sm mx-4 p-6">
            <p className="text-gray-800 text-sm mb-5 whitespace-pre-line">{confirmState.message}</p>
            <div className="flex justify-end gap-2">
              <button className="px-4 py-2 text-sm bg-gray-200 rounded hover:bg-gray-300"
                onClick={() => setConfirmState(null)}>取消</button>
              <button className="px-4 py-2 text-sm bg-red-600 text-white rounded hover:bg-red-700"
                onClick={() => { const fn = confirmState.onConfirm; setConfirmState(null); fn(); }}>{confirmState.confirmLabel}</button>
            </div>
          </div>
        </div>
      )}

      {/* Property Edit Modal */}
      {showPropModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => !propSaving && setShowPropModal(false)}>
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="p-6">
              <h3 className="text-lg font-bold text-gray-800 mb-4">
                {editingProp ? `編輯物業：${editingProp.name}` : '新增物業'}
              </h3>
              {editingProp?.asset && (
                <div className="text-xs bg-teal-50 border border-teal-100 rounded px-3 py-2 mb-3 text-teal-800">
                  已連結資產主檔，名稱與地址由資產端管理。
                </div>
              )}
              <div className="space-y-3 text-sm">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-gray-600">名稱 *</label>
                    <input className={`w-full border rounded px-3 py-2 mt-1 ${editingProp?.asset ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : ''}`}
                      value={propForm.name} disabled={!!editingProp?.asset}
                      onChange={e => setPropForm(f => ({ ...f, name: e.target.value }))} />
                  </div>
                  <div>
                    <label className="text-gray-600">狀態</label>
                    <select className="w-full border rounded px-3 py-2 mt-1" value={propForm.status}
                      onChange={e => setPropForm(f => ({ ...f, status: e.target.value }))}>
                      {Object.entries(STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="text-gray-600">地址</label>
                  <input className={`w-full border rounded px-3 py-2 mt-1 ${editingProp?.asset ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : ''}`}
                    value={propForm.address} disabled={!!editingProp?.asset}
                    onChange={e => setPropForm(f => ({ ...f, address: e.target.value }))} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-gray-600">大樓名稱</label>
                    <input className="w-full border rounded px-3 py-2 mt-1" value={propForm.buildingName}
                      onChange={e => setPropForm(f => ({ ...f, buildingName: e.target.value }))} />
                  </div>
                  <div>
                    <label className="text-gray-600">戶別</label>
                    <input className="w-full border rounded px-3 py-2 mt-1" value={propForm.unitNo}
                      onChange={e => setPropForm(f => ({ ...f, unitNo: e.target.value }))} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-gray-600">分類</label>
                    <select className="w-full border rounded px-3 py-2 mt-1" value={propForm.category}
                      onChange={e => setPropForm(f => ({ ...f, category: e.target.value }))}>
                      <option value="">—</option>
                      <option value="公司">公司</option>
                      <option value="湯三姐">湯三姐</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-gray-600">序號</label>
                    <input type="number" className="w-full border rounded px-3 py-2 mt-1" value={propForm.sortOrder}
                      onChange={e => setPropForm(f => ({ ...f, sortOrder: e.target.value }))} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-gray-600">所有權人</label>
                    <input className="w-full border rounded px-3 py-2 mt-1" value={propForm.ownerName}
                      onChange={e => setPropForm(f => ({ ...f, ownerName: e.target.value }))} />
                  </div>
                  <div>
                    <label className="text-gray-600">房屋稅稅籍編號</label>
                    <input className="w-full border rounded px-3 py-2 mt-1" value={propForm.houseTaxRegistrationNo}
                      onChange={e => setPropForm(f => ({ ...f, houseTaxRegistrationNo: e.target.value }))} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-gray-600">收租帳戶</label>
                    <select className="w-full border rounded px-3 py-2 mt-1" value={propForm.rentCollectAccountId}
                      onChange={e => setPropForm(f => ({ ...f, rentCollectAccountId: e.target.value }))}>
                      <option value="">無</option>
                      {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-gray-600">押金帳戶</label>
                    <select className="w-full border rounded px-3 py-2 mt-1" value={propForm.depositAccountId}
                      onChange={e => setPropForm(f => ({ ...f, depositAccountId: e.target.value }))}>
                      <option value="">無</option>
                      {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="text-gray-600">備註</label>
                  <textarea className="w-full border rounded px-3 py-2 mt-1" rows={2} value={propForm.note}
                    onChange={e => setPropForm(f => ({ ...f, note: e.target.value }))} />
                </div>
                <div className="flex items-center gap-2">
                  <input type="checkbox" id="propCollectUtilityFee" checked={propForm.collectUtilityFee}
                    onChange={e => setPropForm(f => ({ ...f, collectUtilityFee: e.target.checked }))} className="rounded" />
                  <label htmlFor="propCollectUtilityFee" className="text-sm text-gray-700">需向租客收取水電費</label>
                </div>
                <div className="flex items-center gap-2">
                  <input type="checkbox" id="propPublicInterestLandlord" checked={propForm.publicInterestLandlord}
                    onChange={e => setPropForm(f => ({ ...f, publicInterestLandlord: e.target.checked }))} className="rounded" />
                  <label htmlFor="propPublicInterestLandlord" className="text-sm text-gray-700">是否為公益出租人</label>
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-6">
                <button type="button" disabled={propSaving} className="px-4 py-2 text-sm bg-gray-200 rounded hover:bg-gray-300" onClick={() => setShowPropModal(false)}>取消</button>
                <button type="button" disabled={propSaving} className="px-4 py-2 text-sm bg-teal-600 text-white rounded hover:bg-teal-700 disabled:opacity-50" onClick={savePropertyEdit}>
                  {propSaving ? '儲存中…' : '儲存'}
                </button>
              </div>
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
