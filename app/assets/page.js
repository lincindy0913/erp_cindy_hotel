'use client';

import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import Navigation from '@/components/Navigation';
import { useToast } from '@/context/ToastContext';
import { hasPermission, PERMISSIONS } from '@/lib/permissions';
import { sortRows, useColumnSort, SortableTh } from '@/components/SortableTh';
import PropertyModal from '@/components/PropertyModal';
import { todayStr } from '@/lib/localDate';
import { PROPERTY_STATUSES, PROPERTY_STATUS_LABEL } from '@/lib/propertyStatus';

const ASSET_TYPE_OPTIONS = [
  { value: 'BUILDING', label: '建物' },
  { value: 'LAND', label: '土地' },
  { value: 'MIXED', label: '混合' },
  { value: 'OTHER', label: '其他' },
];

// PROPERTY_STATUSES / PROPERTY_STATUS_LABEL → imported from @/lib/propertyStatus

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
  const router = useRouter();
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

  const [showHelpModal, setShowHelpModal] = useState(false);

  // Asset disposal
  const [disposals, setDisposals] = useState([]);        // disposals for selected asset
  const [showDisposalModal, setShowDisposalModal] = useState(false);
  const [editingDisposal, setEditingDisposal] = useState(null);
  const [disposalSaving, setDisposalSaving] = useState(false);
  const [disposalForm, setDisposalForm] = useState({ disposalDate: '', salePrice: '', stampTax: '', landValueIncrementTax: '', notes: '' });

  // Property inline edit (序號/分類/狀態)
  const [propInlineEdit, setPropInlineEdit] = useState(null); // { propertyId, field, value }
  const [propInlineSaving, setPropInlineSaving] = useState(false);

  // Property edit modal
  const [showPropModal, setShowPropModal] = useState(false);
  const [editingProp, setEditingProp] = useState(null);
  const [propSaving, setPropSaving] = useState(false);
  const [propForm, setPropForm] = useState({
    name: '', buildingName: '', unitNo: '', address: '', ownerName: '',
    houseTaxRegistrationNo: '', status: 'available', category: '',
    sortOrder: '', rentCollectAccountId: '', depositAccountId: '', note: '',
    collectUtilityFee: false, publicInterestLandlord: false,
    publicInterestApplicant: '', publicInterestNote: '',
    publicInterestStartDate: '', publicInterestEndDate: '', publicInterestRent: '',
  });
  const [accounts, setAccounts] = useState([]);

  // Batch select state
  const [selectedPropIds, setSelectedPropIds] = useState(new Set());
  const [batchStatus, setBatchStatus] = useState('');
  const [batchSavingProps, setBatchSavingProps] = useState(false);

  async function handleBatchStatusChange() {
    if (!selectedPropIds.size || !batchStatus) return;
    setBatchSavingProps(true);
    try {
      const results = await Promise.all([...selectedPropIds].map(id =>
        fetch(`/api/rentals/properties/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: batchStatus }),
        })
      ));
      const failed = results.filter(r => !r.ok).length;
      if (failed > 0) {
        showToast(`${results.length - failed} 筆成功，${failed} 筆失敗`, 'error');
      } else {
        showToast(`已將 ${results.length} 筆物業狀態改為「${PROPERTY_STATUS_LABEL[batchStatus] || batchStatus}」`, 'success');
      }
      setSelectedPropIds(new Set());
      setBatchStatus('');
      await loadProperties();
    } catch { showToast('批次更新失敗', 'error'); }
    finally { setBatchSavingProps(false); }
  }

  // Filter state
  const [searchText, setSearchText] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [dateStart, setDateStart] = useState('');
  const [dateEnd, setDateEnd] = useState('');
  const [activeRange, setActiveRange] = useState(null); // { start, end } when in range mode

  // Sort state
  const { sortKey: assetSortKey, sortDir: assetSortDir, toggleSort: assetToggleSort } = useColumnSort('sortOrder', 'asc');

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
  // sd/ed = startDate/endDate for range mode; if omitted uses year
  const loadYearData = useCallback(async (y, sd, ed) => {
    const opUrl = (sd && ed)
      ? `/api/rentals/reports/operating?startDate=${sd}&endDate=${ed}`
      : `/api/rentals/reports/operating?year=${y}`;
    const [repRes, taxRes] = await Promise.all([
      fetch(opUrl),
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
          const today = todayStr();
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
    router.replace('/assets'); // A9: clear param so refresh doesn't re-trigger
  }, [linkProperty, properties.length, router]);

  // B2: ESC closes detail panel
  useEffect(() => {
    if (!selected) return;
    const handler = e => { if (e.key === 'Escape') setSelected(null); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selected]);

  // Load detail incomes when a property is selected
  useEffect(() => {
    if (!selected) { setDetailIncomes([]); return; }
    let cancelled = false;
    setDetailLoading(true);
    // B3: keep old data visible (dimmed) while new data loads — don't clear immediately
    fetch(`/api/rentals/income?propertyId=${selected.id}&year=${year}`)
      .then(r => r.json())
      .then(data => { if (!cancelled) setDetailIncomes(Array.isArray(data) ? data : []); })
      .catch(() => { if (!cancelled) setDetailIncomes([]); })
      .finally(() => { if (!cancelled) setDetailLoading(false); });
    return () => { cancelled = true; };
  }, [selected?.id, year]);

  // Load disposals when selected asset changes
  useEffect(() => {
    const assetId = selected?.asset?.id;
    if (!assetId) { setDisposals([]); return; }
    let cancelled = false;
    fetch(`/api/assets/${assetId}/disposals`)
      .then(r => r.ok ? r.json() : [])
      .then(data => { if (!cancelled) setDisposals(Array.isArray(data) ? data : []); })
      .catch(() => { if (!cancelled) setDisposals([]); });
    return () => { cancelled = true; };
  }, [selected?.asset?.id]);

  function openDisposalCreate() {
    setEditingDisposal(null);
    setDisposalForm({ disposalDate: '', salePrice: '', stampTax: '', landValueIncrementTax: '', notes: '' });
    setShowDisposalModal(true);
  }

  function openDisposalEdit(d) {
    setEditingDisposal(d);
    setDisposalForm({
      disposalDate: d.disposalDate || '',
      salePrice: d.salePrice != null ? String(d.salePrice) : '',
      stampTax: d.stampTax != null ? String(d.stampTax) : '',
      landValueIncrementTax: d.landValueIncrementTax != null ? String(d.landValueIncrementTax) : '',
      notes: d.notes || '',
    });
    setShowDisposalModal(true);
  }

  async function saveDisposal() {
    if (!disposalForm.disposalDate) { showToast('請填寫處分日期', 'error'); return; }
    const assetId = selected?.asset?.id;
    if (!assetId) return;
    setDisposalSaving(true);
    try {
      const body = {
        disposalDate: disposalForm.disposalDate,
        salePrice: disposalForm.salePrice !== '' ? disposalForm.salePrice : null,
        stampTax: disposalForm.stampTax !== '' ? disposalForm.stampTax : null,
        landValueIncrementTax: disposalForm.landValueIncrementTax !== '' ? disposalForm.landValueIncrementTax : null,
        notes: disposalForm.notes || null,
      };
      const url = editingDisposal
        ? `/api/assets/${assetId}/disposals/${editingDisposal.id}`
        : `/api/assets/${assetId}/disposals`;
      const method = editingDisposal ? 'PATCH' : 'POST';
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) { showToast(data?.error?.message || data?.error || '儲存失敗', 'error'); return; }
      showToast(editingDisposal ? '已更新' : '已建立', 'success');
      setShowDisposalModal(false);
      const refreshed = await fetch(`/api/assets/${assetId}/disposals`).then(r => r.ok ? r.json() : []);
      setDisposals(Array.isArray(refreshed) ? refreshed : []);
    } catch { showToast('儲存失敗', 'error'); }
    finally { setDisposalSaving(false); }
  }

  async function deleteDisposal(d) {
    const assetId = selected?.asset?.id;
    if (!assetId) return;
    showConfirm(`確定刪除「${d.disposalDate}」的處分記錄？`, async () => {
      const res = await fetch(`/api/assets/${assetId}/disposals/${d.id}`, { method: 'DELETE' });
      if (!res.ok) { showToast('刪除失敗', 'error'); return; }
      showToast('已刪除', 'success');
      setDisposals(prev => prev.filter(x => x.id !== d.id));
    });
  }

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
      }
      // unknown types (e.g. 印花稅, 土地增值稅) are capital events — skip from operating buckets
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

  // Sorted rows
  const sortedRows = useMemo(() => {
    const accessors = {
      sortOrder: r => r.sortOrder ?? Infinity,
      name: r => r.name || '',
      category: r => r.category || '',
      status: r => r.status || '',
      tenantName: r => r.currentTenant || '',
      monthlyRent: r => Number(r.monthlyRent || 0),
      rentIncome: r => Number(r.rentIncome || 0),
      houseTax: r => Number(r.houseTax || 0),
      landTax: r => Number(r.landTax || 0),
      maintenanceAmount: r => Number(r.maintenanceAmount || 0),
      netProfit: r => Number(r.rentIncome || 0) - Number(r.houseTax || 0) - Number(r.landTax || 0) - Number(r.maintenanceAmount || 0),
    };
    return sortRows(filteredRows, assetSortKey, assetSortDir, accessors);
  }, [filteredRows, assetSortKey, assetSortDir]);

  function exportCSV() {
    const periodLabel = activeRange ? `${activeRange.start}~${activeRange.end}` : `${year}年`;
    const headers = [
      '序號', '物業', '戶別', '大樓名稱', '地址', '分類', '狀態',
      '所有權人', '房屋稅稅籍編號', '收租帳戶', '押金帳戶', '收水電費',
      '公益出租人', '公益申請人', '公益租約起', '公益租約迄', '公益月租金',
      '綁定資產名稱',
      '租客', '月租金',
      `${periodLabel}租金+水電實收`, `${year}年房屋稅`, `${year}年地價稅`, `${periodLabel}維護費`, `${periodLabel}淨利`,
    ];
    const rows = sortedRows.map(p => [
      p.sortOrder ?? '',
      p.name,
      p.unitNo || '',
      p.buildingName || '',
      p.address || '',
      p.category || '',
      PROPERTY_STATUS_LABEL[p.status] || p.status || '',
      p.ownerName || '',
      p.houseTaxRegistrationNo || '',
      p.rentCollectAccount?.name || '',
      p.depositAccount?.name || '',
      p.collectUtilityFee ? '是' : '否',
      p.publicInterestLandlord ? '是' : '否',
      p.publicInterestApplicant || '',
      p.publicInterestStartDate || '',
      p.publicInterestEndDate || '',
      p.publicInterestRent ?? '',
      p.asset?.name || '',
      p.currentTenantName || '',
      p.currentMonthlyRent || '',
      p.rentIncome || 0,
      p.houseTax || 0,
      p.landTax || 0,
      p.maintenanceAmount || 0,
      p.netProfit || 0,
    ]);
    const csv = [headers, ...rows]
      .map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `資產管理_${periodLabel}_${new Date().toLocaleDateString('zh-TW').replace(/\//g, '-')}.csv`;
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
    return properties
      .filter(p => {
        if (!p.asset) return true;
        if (editing && p.asset.id === editing.id) return true;
        return false;
      })
      .sort((a, b) => {
        const sa = a.sortOrder ?? Infinity;
        const sb = b.sortOrder ?? Infinity;
        if (sa !== sb) return sa - sb;
        return (a.name || '').localeCompare(b.name || '', 'zh-TW');
      });
  }, [properties, editing]);

  function openCreateFromProperty(p) {
    setEditing(null);
    setForm(f => ({ ...f, name: p.name || '', assetType: 'BUILDING', address: p.address || '', areaSqm: '', acquisitionDate: '', notes: '', serialNo: '', category: p.category || '', rentalPropertyId: String(p.id), isAvailableForRental: true, hasHouseTax: false, hasLandTax: false, hasMaintenanceFee: false }));
    setShowModal(true);
  }

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
        areaSqm: form.areaSqm === '' ? null : (isNaN(parseFloat(form.areaSqm)) ? null : parseFloat(form.areaSqm)),
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

  async function savePropField(propertyId, field, value) {
    // Guard 1: race-condition — second blur fires before first setPropInlineSaving(true) settles
    if (propInlineSaving) return;
    // Guard 2: value unchanged — Enter→blur then click-elsewhere→blur sends duplicate request
    const current = properties.find(p => p.id === propertyId);
    const currentVal = current?.[field] ?? '';
    if (String(value ?? '') === String(currentVal ?? '')) {
      setPropInlineEdit(null);
      return;
    }
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
      publicInterestApplicant: '', publicInterestNote: '',
      publicInterestStartDate: '', publicInterestEndDate: '', publicInterestRent: '',
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
      publicInterestApplicant: p.publicInterestApplicant || '',
      publicInterestNote: p.publicInterestNote || '',
      publicInterestStartDate: p.publicInterestStartDate || '',
      publicInterestEndDate: p.publicInterestEndDate || '',
      publicInterestRent: p.publicInterestRent != null ? String(p.publicInterestRent) : '',
    });
    setShowPropModal(true);
  }

  async function savePropertyEdit() {
    if (!propForm.name.trim() && !editingProp?.asset) { showToast('請填寫物業名稱', 'error'); return; }
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
        publicInterestApplicant:  propForm.publicInterestApplicant  || null,
        publicInterestNote:       propForm.publicInterestNote       || null,
        publicInterestStartDate:  propForm.publicInterestStartDate  || null,
        publicInterestEndDate:    propForm.publicInterestEndDate    || null,
        publicInterestRent:       propForm.publicInterestRent ? parseFloat(propForm.publicInterestRent) : null,
      };
      if (editingProp?.asset) {
        delete body.name;
        delete body.address;
      }
      const url = editingProp ? `/api/rentals/properties/${editingProp.id}` : '/api/rentals/properties';
      const method = editingProp ? 'PATCH' : 'POST';
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
          const lockedWarning = incomeCount > 0 ? '\n\n⚠ 收款紀錄中可能含已鎖帳資料，刪除後帳務記錄將無法還原。' : '';
          showConfirm(
            `「${p.name}」尚有關聯資料：${lines.join('、')}。\n確定要連同所有資料一起刪除？此操作無法復原。${lockedWarning}`,
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
                  if (dateStart > dateEnd) { showToast('結束日期不可早於開始日期', 'error'); return; }
                  setLoading(true);
                  setActiveRange({ start: dateStart, end: dateEnd });
                  await loadYearData(year, dateStart, dateEnd);
                  setLoading(false);
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
            {(searchText || filterStatus || filterCategory) && (
              <button onClick={() => { setSearchText(''); setFilterStatus(''); setFilterCategory(''); }}
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

        {/* Batch toolbar — visible when any rows are selected */}
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

        {/* Main Table */}
        {loading ? (
          <p className="text-gray-500 py-8">載入中…</p>
        ) : (
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
                    const hasUnpaidTax = taxesData.some(t => t.propertyId === p.id && t.status !== 'paid');
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

        {/* Detail Panel Modal */}
        {selected && (
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

              {/* Col 2: Taxes */}
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
                {selectedTaxes.length === 0 ? (
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
                    { label: '租金+水電實收', value: mergedRows.find(r => r.id === selected.id)?.rentIncome || 0, cls: 'text-teal-700' },
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
                  <h4 className="text-sm font-semibold text-gray-700">{year} 年維護費</h4>
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
        )}
      </div>

      {/* Asset Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => !saving && setShowModal(false)}>
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4 p-6 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-gray-800 mb-4">{editing ? '編輯資產' : '新增資產'}</h3>
            <div className="space-y-3 text-sm">
              <div>
                <label htmlFor="f" className="text-gray-600">名稱 *</label>
                <input id="f" className="w-full border rounded px-3 py-2 mt-1" value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="f-2" className="text-gray-600">序號</label>
                  <input id="f-2" className="w-full border rounded px-3 py-2 mt-1" placeholder="例：A001" value={form.serialNo}
                    onChange={e => setForm(f => ({ ...f, serialNo: e.target.value }))} />
                </div>
                <div>
                  <label htmlFor="f-3" className="text-gray-600">類別</label>
                  <input id="f-3" className="w-full border rounded px-3 py-2 mt-1" placeholder="例：住宅、商業" value={form.category}
                    onChange={e => setForm(f => ({ ...f, category: e.target.value }))} />
                </div>
              </div>
              <div>
                <label htmlFor="f-4" className="text-gray-600">資產類型</label>
                <select id="f-4" className="w-full border rounded px-3 py-2 mt-1" value={form.assetType}
                  onChange={e => setForm(f => ({ ...f, assetType: e.target.value }))}>
                  {ASSET_TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="f-16" className="text-gray-600">地址</label>
                <input id="f-16" className="w-full border rounded px-3 py-2 mt-1" value={form.address}
                  onChange={e => setForm(f => ({ ...f, address: e.target.value }))} />
                {editing && form.rentalPropertyId && (() => {
                  const linkedProp = properties.find(p => String(p.id) === String(form.rentalPropertyId));
                  if (linkedProp?.address && linkedProp.address !== form.address) {
                    return <p className="text-xs text-amber-600 mt-1">⚠ 與綁定物業地址不同（物業：{linkedProp.address}）</p>;
                  }
                  return null;
                })()}
              </div>
              <div>
                <label htmlFor="f-5" className="text-gray-600">面積（㎡）</label>
                <input id="f-5" type="text" inputMode="decimal" className="w-full border rounded px-3 py-2 mt-1" value={form.areaSqm}
                  onChange={e => setForm(f => ({ ...f, areaSqm: e.target.value }))} />
              </div>
              <div>
                <label htmlFor="f-6" className="text-gray-600">取得日期（選填）</label>
                <input id="f-6" type="date" className="w-full border rounded px-3 py-2 mt-1" value={form.acquisitionDate}
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
                <label htmlFor="f-17" className="text-gray-600">綁定租屋物業</label>
                <select id="f-17" className="w-full border rounded px-3 py-2 mt-1" value={form.rentalPropertyId}
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
                <label htmlFor="f-18" className="text-gray-600">備註</label>
                <textarea id="f-18" className="w-full border rounded px-3 py-2 mt-1" rows={2} value={form.notes}
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
      {showDisposalModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => !disposalSaving && setShowDisposalModal(false)}>
          <div className="bg-white rounded-lg shadow-xl w-full max-w-sm mx-4 p-5" onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-bold text-gray-800 mb-4">{editingDisposal ? '編輯處分記錄' : '新增處分記錄'}</h3>
            <div className="space-y-3 text-sm">
              <div>
                <label className="text-gray-600 block mb-1">處分日期 *</label>
                <input type="date" className="w-full border rounded px-3 py-2"
                  value={disposalForm.disposalDate}
                  onChange={e => setDisposalForm(f => ({ ...f, disposalDate: e.target.value }))} />
              </div>
              <div>
                <label className="text-gray-600 block mb-1">成交價格（選填）</label>
                <input type="text" inputMode="decimal" placeholder="NT$" className="w-full border rounded px-3 py-2"
                  value={disposalForm.salePrice}
                  onChange={e => setDisposalForm(f => ({ ...f, salePrice: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-gray-600 block mb-1">印花稅</label>
                  <input type="text" inputMode="decimal" placeholder="NT$" className="w-full border rounded px-3 py-2"
                    value={disposalForm.stampTax}
                    onChange={e => setDisposalForm(f => ({ ...f, stampTax: e.target.value }))} />
                </div>
                <div>
                  <label className="text-gray-600 block mb-1">土地增值稅</label>
                  <input type="text" inputMode="decimal" placeholder="NT$" className="w-full border rounded px-3 py-2"
                    value={disposalForm.landValueIncrementTax}
                    onChange={e => setDisposalForm(f => ({ ...f, landValueIncrementTax: e.target.value }))} />
                </div>
              </div>
              <div>
                <label className="text-gray-600 block mb-1">備註</label>
                <textarea className="w-full border rounded px-3 py-2" rows={2}
                  value={disposalForm.notes}
                  onChange={e => setDisposalForm(f => ({ ...f, notes: e.target.value }))} />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button disabled={disposalSaving} onClick={() => setShowDisposalModal(false)}
                className="px-4 py-2 text-sm bg-gray-200 rounded hover:bg-gray-300">取消</button>
              <button disabled={disposalSaving} onClick={saveDisposal}
                className="px-4 py-2 text-sm bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50">
                {disposalSaving ? '儲存中…' : '儲存'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Help Modal */}
      {showHelpModal && <AssetsHelpModal onClose={() => setShowHelpModal(false)} />}
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

const ASSET_TYPE_BADGE = {
  LAND:  { label: '土地', cls: 'bg-orange-100 text-orange-700' },
  MIXED: { label: '混合', cls: 'bg-blue-100 text-blue-700' },
  OTHER: { label: '其他', cls: 'bg-gray-100 text-gray-600' },
};

function AssetFlagBadges({ asset }) {
  if (!asset) return null;
  const flags = [];
  const typeBadge = ASSET_TYPE_BADGE[asset.assetType];
  if (typeBadge) flags.push(typeBadge);
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
