'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import Navigation from '@/components/Navigation';
import ExportButtons from '@/components/ExportButtons';
import { EXPORT_CONFIGS } from '@/lib/export-columns';
import { sortRows, useColumnSort, SortableTh } from '@/components/SortableTh';

const TABS = [
  { key: 'query', label: '庫存查詢', icon: '📦' },
  { key: 'inbound', label: '待入庫', icon: '📥' },
  { key: 'requisition', label: '領用單', icon: '📤' },
  { key: 'transfer', label: '調撥單', icon: '🔄' },
  { key: 'count', label: '盤點', icon: '📋' },
];

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

// Combobox: text input with styled suggestion dropdown
function ComboInput({ value, onChange, options, placeholder, className }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function handler(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filtered = options.filter(o => o.toLowerCase().includes(value.toLowerCase()));

  return (
    <div ref={ref} className="relative w-full">
      <input
        type="text"
        value={value}
        onChange={e => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        className={className}
        autoComplete="off"
      />
      {open && options.length > 0 && (
        <ul className="absolute z-20 left-0 right-0 mt-1 bg-white border border-gray-300 rounded-lg shadow-md max-h-48 overflow-y-auto text-sm">
          {filtered.length > 0 ? filtered.map(o => (
            <li
              key={o}
              onMouseDown={() => { onChange(o); setOpen(false); }}
              className={`px-3 py-2 cursor-pointer hover:bg-amber-50 hover:text-amber-800 ${value === o ? 'bg-amber-50 text-amber-800 font-medium' : 'text-gray-700'}`}
            >
              {o}
            </li>
          )) : (
            <li className="px-3 py-2 text-gray-400">無符合選項，可直接輸入</li>
          )}
        </ul>
      )}
    </div>
  );
}

// Get departments for a selected warehouse name (handles both building-level and storage-child selection)
function getDepartmentsForWarehouse(warehouseList, selectedName) {
  if (!selectedName) return [];
  // Find exact match
  const match = warehouseList.find(w => w.name === selectedName);
  if (!match) return [];
  // If it's a building, return its departments
  if (match.type === 'building') return match.departments || [];
  // If it's a storage child, find parent building and return its departments
  if (match.parentId) {
    const parent = warehouseList.find(w => w.id === match.parentId);
    return parent?.departments || [];
  }
  return [];
}

// Grouped warehouse dropdown: buildings (館別) with their storage children (倉庫) as optgroups
function WarehouseSelect({ value, onChange, warehouseList, placeholder = '全部', className = '', required = false }) {
  const buildings = warehouseList.filter(w => w.type === 'building');
  const childIds = new Set(warehouseList.filter(w => w.parentId).map(w => w.id));
  // Standalone storage locations (not under any building)
  const standalone = warehouseList.filter(w => w.type !== 'building' && !w.parentId);

  return (
    <select value={value} onChange={e => onChange(e.target.value)} className={className} required={required}>
      <option value="">{placeholder}</option>
      {buildings.map(b => {
        const children = warehouseList.filter(w => w.parentId === b.id);
        return (
          <optgroup key={b.id} label={`🏢 ${b.name}`}>
            <option value={b.name}>全部 {b.name}（館別）</option>
            {children.map(c => (
              <option key={c.id} value={c.name}>&nbsp;&nbsp;{c.name}</option>
            ))}
          </optgroup>
        );
      })}
      {standalone.length > 0 && (
        <optgroup label="其他倉庫">
          {standalone.map(s => (
            <option key={s.id} value={s.name}>{s.name}</option>
          ))}
        </optgroup>
      )}
    </select>
  );
}

export default function InventoryPage() {
  const { data: session } = useSession();
  const isLoggedIn = !!session;
  const [activeTab, setActiveTab] = useState('query');
  // warehouseList: full structured list { id, name, type, parentId, children }
  const [warehouseList, setWarehouseList] = useState([]);
  // warehouses: flat list of all selectable names (for simple selects in forms)
  const [warehouses, setWarehouses] = useState([]);
  const [warehouse, setWarehouse] = useState('');

  // 庫存查詢
  const [inventory, setInventory] = useState([]);
  const [inventoryLoading, setInventoryLoading] = useState(true);
  const [calcMode, setCalcMode] = useState(null);

  // 領用單
  const [requisitions, setRequisitions] = useState([]);
  const [requisitionLoading, setRequisitionLoading] = useState(false);
  const [reqForm, setReqForm] = useState({ warehouse: '', department: '', productId: '', productName: '', quantity: '', note: '' });
  const [products, setProducts] = useState([]);
  const [reqSubmitting, setReqSubmitting] = useState(false);

  // 調撥單
  const [transfers, setTransfers] = useState([]);
  const [transferLoading, setTransferLoading] = useState(false);
  const [trfForm, setTrfForm] = useState({ fromWarehouse: '', toWarehouse: '', productId: '', productName: '', quantity: '', note: '' });
  const [trfSubmitting, setTrfSubmitting] = useState(false);

  // 盤點
  const [stockCounts, setStockCounts] = useState([]);
  const [countLoading, setCountLoading] = useState(false);
  const [countForm, setCountForm] = useState({ warehouse: '', countDate: todayStr(), items: [] });
  const [countSubmitting, setCountSubmitting] = useState(false);

  // 庫存調整 Modal
  const [adjustModal, setAdjustModal] = useState(null); // { productId, productName, currentQty }
  const [adjustForm, setAdjustForm] = useState({ warehouse: '', targetQty: '', reason: '' });
  const [adjustSubmitting, setAdjustSubmitting] = useState(false);
  const [toast, setToast] = useState(null);

  // 待入庫
  const [pendingInbound, setPendingInbound] = useState([]);
  const [inboundLoading, setInboundLoading] = useState(false);
  const [inboundUpdating, setInboundUpdating] = useState({});
  const [inboundWarehouseEdits, setInboundWarehouseEdits] = useState({});
  const [storageLocations, setStorageLocations] = useState([]);
  const [inboundWareFilter, setInboundWareFilter] = useState('');
  const [inboundSearch, setInboundSearch] = useState('');
  const [inboundDateFrom, setInboundDateFrom] = useState('');
  const [inboundDateTo, setInboundDateTo] = useState('');
  const [inboundSelected, setInboundSelected] = useState(new Set()); // keys for batch
  const [batchConfirming, setBatchConfirming] = useState(false);

  const { sortKey: invQKey, sortDir: invQDir, toggleSort: invQT } = useColumnSort('productName', 'asc');
  const sortedInventory = useMemo(
    () =>
      sortRows(inventory, invQKey, invQDir, {
        productName: (row) => row.product?.name || '',
        warehouseLoc: (row) => warehouse || row.product?.warehouseLocation || '',
        purchaseIn: (row) => Number(row.purchaseQty ?? row.purchaseIncr ?? 0),
        requisitionQty: (row) => Number(row.requisitionQty ?? 0),
        transferOutQty: (row) => Number(row.transferOutQty ?? 0),
        transferInQty: (row) => Number(row.transferInQty ?? 0),
        countAdjustQty: (row) => Number(row.countAdjustQty ?? 0),
        currentQty: (row) => Number(row.currentQty ?? 0),
        status: (row) => row.status || '',
      }),
    [inventory, warehouse, invQKey, invQDir]
  );

  const { sortKey: reqKey, sortDir: reqDir, toggleSort: reqT } = useColumnSort('requisitionDate', 'desc');
  const sortedRequisitions = useMemo(
    () =>
      sortRows(requisitions, reqKey, reqDir, {
        requisitionNo: (r) => r.requisitionNo || '',
        warehouse: (r) => r.warehouse || '',
        department: (r) => r.department || '',
        productName: (r) => r.product?.name || '',
        quantity: (r) => Number(r.quantity || 0),
        requisitionDate: (r) => r.requisitionDate || '',
      }),
    [requisitions, reqKey, reqDir]
  );

  const transferFlatRows = useMemo(() => {
    const rows = [];
    transfers.forEach((t) => {
      (t.items || []).forEach((i, idx) => {
        rows.push({
          _key: `${t.id}-${idx}`,
          transferNo: t.transferNo,
          fromWarehouse: t.fromWarehouse,
          toWarehouse: t.toWarehouse,
          productName: i.product?.name || '-',
          quantity: Number(i.quantity || 0),
          transferDate: t.transferDate || '',
        });
      });
    });
    return rows;
  }, [transfers]);
  const { sortKey: trfKey, sortDir: trfDir, toggleSort: trfT } = useColumnSort('transferDate', 'desc');
  const sortedTransferRows = useMemo(
    () => sortRows(transferFlatRows, trfKey, trfDir, {
      transferNo: (r) => r.transferNo || '',
      fromWarehouse: (r) => r.fromWarehouse || '',
      toWarehouse: (r) => r.toWarehouse || '',
      productName: (r) => r.productName || '',
      quantity: (r) => r.quantity,
      transferDate: (r) => r.transferDate || '',
    }),
    [transferFlatRows, trfKey, trfDir]
  );

  const { sortKey: cntKey, sortDir: cntDir, toggleSort: cntT } = useColumnSort('countDate', 'desc');
  const sortedStockCounts = useMemo(
    () =>
      sortRows(stockCounts, cntKey, cntDir, {
        countNo: (s) => s.countNo || '',
        warehouse: (s) => s.warehouse || '',
        countDate: (s) => s.countDate || '',
        itemCount: (s) => s.items?.length || 0,
      }),
    [stockCounts, cntKey, cntDir]
  );

  function showToast(msg, type = 'success') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }

  useEffect(() => {
    fetchWarehouses();
  }, []);

  async function fetchWarehouses() {
    try {
      const res = await fetch('/api/warehouse-departments');
      if (res.ok) {
        const data = await res.json();
        const list = data?.list || [];
        setWarehouseList(list);
        // Flat list of all names for simple selects
        const names = list.map(w => w.name);
        setWarehouses(names);
        if (names.length > 0 && !warehouse) setWarehouse(names[0]);
      }
    } catch { /* ignore */ }
  }

  useEffect(() => {
    if (activeTab === 'query') fetchInventory();
    if (activeTab === 'inbound') fetchPendingInbound();
    if (activeTab === 'requisition') fetchRequisitions();
    if (activeTab === 'transfer') fetchTransfers();
    if (activeTab === 'count') {
      fetchStockCounts();
      fetchInventory();
    }
    if (activeTab === 'requisition' || activeTab === 'transfer' || activeTab === 'count') fetchProducts();
  }, [activeTab, warehouse]);

  useEffect(() => {
    if (activeTab === 'count' && warehouse) setCountForm(prev => ({ ...prev, warehouse }));
    if (activeTab === 'requisition' && warehouse) setReqForm(prev => ({ ...prev, warehouse }));
    if (activeTab === 'transfer' && warehouse) {
      setTrfForm(prev => ({ ...prev, fromWarehouse: warehouse }));
    }
  }, [activeTab, warehouse]);

  async function fetchInventory() {
    setInventoryLoading(true);
    try {
      const url = warehouse ? `/api/inventory?warehouse=${encodeURIComponent(warehouse)}` : '/api/inventory';
      const res = await fetch(url);
      const data = await res.json();
      const arr = Array.isArray(data) ? data : (data?.data || []);
      setInventory(arr);
      if (data?.calculationMode) setCalcMode(data.calculationMode);
    } catch {
      setInventory([]);
    }
    setInventoryLoading(false);
  }

  async function fetchProducts() {
    try {
      const res = await fetch('/api/products?all=true');
      const data = await res.json();
      const arr = Array.isArray(data) ? data : (data?.products || data?.data || []);
      setProducts(arr.filter(p => p.isInStock !== false));
    } catch { setProducts([]); }
  }

  async function fetchRequisitions() {
    setRequisitionLoading(true);
    try {
      const url = warehouse ? `/api/inventory/requisitions?warehouse=${encodeURIComponent(warehouse)}` : '/api/inventory/requisitions';
      const res = await fetch(url);
      const data = await res.ok ? await res.json() : [];
      setRequisitions(Array.isArray(data) ? data : []);
    } catch { setRequisitions([]); }
    setRequisitionLoading(false);
  }

  async function fetchTransfers() {
    setTransferLoading(true);
    try {
      const url = warehouse ? `/api/inventory/transfers?warehouse=${encodeURIComponent(warehouse)}` : '/api/inventory/transfers';
      const res = await fetch(url);
      const data = await res.ok ? await res.json() : [];
      setTransfers(Array.isArray(data) ? data : []);
    } catch { setTransfers([]); }
    setTransferLoading(false);
  }

  async function fetchStockCounts() {
    setCountLoading(true);
    try {
      const url = warehouse ? `/api/inventory/stock-counts?warehouse=${encodeURIComponent(warehouse)}` : '/api/inventory/stock-counts';
      const res = await fetch(url);
      const data = await res.ok ? await res.json() : [];
      setStockCounts(Array.isArray(data) ? data : []);
    } catch { setStockCounts([]); }
    setCountLoading(false);
  }

  async function fetchPendingInbound() {
    setInboundLoading(true);
    try {
      const [purRes, wdRes, prodRes] = await Promise.all([
        fetch('/api/purchasing?all=true'),
        fetch('/api/warehouse-departments'),
        fetch('/api/products?all=true'),
      ]);
      const purchases = purRes.ok ? await purRes.json() : [];
      const prodData = prodRes.ok ? await prodRes.json() : [];
      const prodArr = Array.isArray(prodData) ? prodData : (prodData?.products || prodData?.data || []);
      const prodMap = Object.fromEntries(prodArr.map(p => [p.id, p.name]));

      // Build flat list of pending items
      const rows = [];
      purchases.forEach(p => {
        (p.items || []).forEach(item => {
          if (item.status === '待入庫') {
            rows.push({
              ...item,
              productName: prodMap[item.productId] || `商品#${item.productId}`,
              purchaseId: p.id,
              purchaseNo: p.purchaseNo,
              purchaseDate: p.purchaseDate,
              purchaseWarehouse: p.warehouse,
              supplierName: p.supplierName || '',
            });
          }
        });
      });
      // Sort: oldest purchase first
      rows.sort((a, b) => a.purchaseDate.localeCompare(b.purchaseDate));
      setPendingInbound(rows);

      // Storage locations (type === 'storage')
      if (wdRes.ok) {
        const wd = await wdRes.json();
        const locs = (wd?.list || []).filter(w => w.type === 'storage').map(w => w.name);
        setStorageLocations(locs);
      }
    } catch { setPendingInbound([]); }
    setInboundLoading(false);
  }

  async function confirmInbound(row) {
    const key = `${row.purchaseId}-${row.detailId}`;
    const loc = inboundWarehouseEdits[key] ?? row.inventoryWarehouse ?? '';
    setInboundUpdating(prev => ({ ...prev, [key]: true }));
    try {
      const res = await fetch(`/api/purchasing/${row.purchaseId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ detailId: row.detailId, status: '已入庫', inventoryWarehouse: loc }),
      });
      if (res.ok) {
        showToast(`已確認入庫：${row.productName || ''}`, 'success');
        fetchPendingInbound();
      } else {
        const d = await res.json().catch(() => ({}));
        showToast(d.error || '更新失敗', 'error');
      }
    } catch { showToast('網路錯誤', 'error'); }
    setInboundUpdating(prev => ({ ...prev, [key]: false }));
  }

  async function batchConfirmInbound(rows) {
    const selected = rows.filter(r => inboundSelected.has(`${r.purchaseId}-${r.detailId}`));
    if (selected.length === 0) return;
    // Validate all have a warehouse
    const missing = selected.filter(r => !(inboundWarehouseEdits[`${r.purchaseId}-${r.detailId}`] ?? r.inventoryWarehouse));
    if (missing.length > 0) {
      showToast(`有 ${missing.length} 筆未選擇入庫倉庫，請先填寫`, 'error');
      return;
    }
    if (!confirm(`確認批次入庫 ${selected.length} 筆商品？`)) return;
    setBatchConfirming(true);
    let ok = 0;
    let fail = 0;
    for (const row of selected) {
      const key = `${row.purchaseId}-${row.detailId}`;
      const loc = inboundWarehouseEdits[key] ?? row.inventoryWarehouse ?? '';
      setInboundUpdating(prev => ({ ...prev, [key]: true }));
      try {
        const res = await fetch(`/api/purchasing/${row.purchaseId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ detailId: row.detailId, status: '已入庫', inventoryWarehouse: loc }),
        });
        if (res.ok) ok++;
        else fail++;
      } catch { fail++; }
      setInboundUpdating(prev => ({ ...prev, [key]: false }));
    }
    setBatchConfirming(false);
    setInboundSelected(new Set());
    showToast(fail === 0 ? `批次入庫完成，共 ${ok} 筆` : `完成 ${ok} 筆，失敗 ${fail} 筆`, fail === 0 ? 'success' : 'error');
    fetchPendingInbound();
  }

  async function submitRequisition() {
    if (!reqForm.warehouse || !reqForm.productId || !reqForm.quantity || Number(reqForm.quantity) < 1) {
      showToast('請填寫倉庫、產品、數量', 'error');
      return;
    }
    setReqSubmitting(true);
    try {
      const res = await fetch('/api/inventory/requisitions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          warehouse: reqForm.warehouse,
          department: reqForm.department || undefined,
          productId: Number(reqForm.productId),
          quantity: Number(reqForm.quantity),
          requisitionDate: todayStr(),
          note: reqForm.note || undefined,
        }),
      });
      const result = await res.json();
      if (res.ok) {
        setReqForm(prev => ({ ...prev, productId: '', productName: '', quantity: '', note: '' }));
        showToast('領用單已建立');
        fetchRequisitions();
        fetchInventory();
      } else {
        showToast(result.error?.message || '建立失敗', 'error');
      }
    } catch { showToast('建立失敗', 'error'); }
    setReqSubmitting(false);
  }

  async function submitTransfer() {
    if (!trfForm.fromWarehouse || !trfForm.toWarehouse || trfForm.fromWarehouse === trfForm.toWarehouse) {
      showToast('來源與目標倉庫不可相同', 'error');
      return;
    }
    if (!trfForm.productId || !trfForm.quantity || Number(trfForm.quantity) < 1) {
      showToast('請填寫產品、數量', 'error');
      return;
    }
    setTrfSubmitting(true);
    try {
      const res = await fetch('/api/inventory/transfers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromWarehouse: trfForm.fromWarehouse,
          toWarehouse: trfForm.toWarehouse,
          productId: Number(trfForm.productId),
          quantity: Number(trfForm.quantity),
          transferDate: todayStr(),
          note: trfForm.note || undefined,
        }),
      });
      const result = await res.json();
      if (res.ok) {
        setTrfForm(prev => ({ ...prev, productId: '', productName: '', quantity: '', note: '' }));
        showToast('調撥單已建立');
        fetchTransfers();
        fetchInventory();
      } else {
        showToast(result.error?.message || '建立失敗', 'error');
      }
    } catch { showToast('建立失敗', 'error'); }
    setTrfSubmitting(false);
  }

  async function submitStockCount() {
    if (!countForm.warehouse) {
      showToast('請選擇倉庫', 'error');
      return;
    }
    const items = countForm.items.filter(i => i.productId && (i.actualQty != null || i.systemQty != null));
    if (items.length === 0) {
      showToast('請至少新增一筆盤點明細', 'error');
      return;
    }
    const payload = items.map(i => ({
      productId: Number(i.productId),
      systemQty: Number(i.systemQty) || 0,
      actualQty: (Number(i.actualQty) ?? Number(i.systemQty)) || 0,
    }));
    setCountSubmitting(true);
    try {
      const res = await fetch('/api/inventory/stock-counts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          warehouse: countForm.warehouse,
          countDate: countForm.countDate || todayStr(),
          items: payload,
        }),
      });
      const result = await res.json();
      if (res.ok) {
        setCountForm(prev => ({ ...prev, items: [] }));
        showToast('盤點已建立');
        fetchStockCounts();
        fetchInventory();
      } else {
        showToast(result.error?.message || '建立失敗', 'error');
      }
    } catch { showToast('建立失敗', 'error'); }
    setCountSubmitting(false);
  }

  async function submitAdjustment() {
    if (!adjustForm.warehouse) {
      showToast('請選擇倉庫', 'error');
      return;
    }
    if (adjustForm.targetQty === '' || adjustForm.targetQty === null) {
      showToast('請輸入目標數量', 'error');
      return;
    }
    setAdjustSubmitting(true);
    try {
      const res = await fetch('/api/inventory/adjustments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: adjustModal.productId,
          warehouse: adjustForm.warehouse,
          targetQty: Number(adjustForm.targetQty),
          reason: adjustForm.reason,
        }),
      });
      const result = await res.json();
      if (res.ok) {
        showToast(`調整完成：${adjustModal.productName} ${result.systemQty} → ${result.actualQty}`);
        setAdjustModal(null);
        setAdjustForm({ warehouse: '', targetQty: '', reason: '' });
        fetchInventory();
        fetchStockCounts();
      } else {
        showToast(result.error?.message || '調整失敗', 'error');
      }
    } catch { showToast('調整失敗', 'error'); }
    setAdjustSubmitting(false);
  }

  function addCountItem() {
    const invItem = inventory.find(i => i.productId && !countForm.items.some(c => c.productId === i.productId));
    if (!invItem) {
      showToast('請先選擇庫存中的產品', 'error');
      return;
    }
    setCountForm(prev => ({
      ...prev,
      items: [...prev.items, { productId: invItem.productId, productName: invItem.product?.name, systemQty: invItem.currentQty || 0, actualQty: invItem.currentQty || 0 }],
    }));
  }

  function updateCountItem(idx, field, value) {
    setCountForm(prev => ({
      ...prev,
      items: prev.items.map((it, i) => i === idx ? { ...it, [field]: value } : it),
    }));
  }

  function removeCountItem(idx) {
    setCountForm(prev => ({ ...prev, items: prev.items.filter((_, i) => i !== idx) }));
  }

  function getStatusIcon(status) {
    switch (status) {
      case '正常': return '🟢';
      case '偏低': return '🟠';
      case '不足': return '🔴';
      case '過多': return '🔵';
      default: return '⚪';
    }
  }

  return (
    <div className="min-h-screen page-bg-inventory">
      <Navigation borderColor="border-amber-500" />
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-2 rounded-lg shadow-lg text-sm font-medium text-white ${toast.type === 'error' ? 'bg-red-500' : 'bg-gray-700'}`}>
          {toast.msg}
        </div>
      )}

      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-bold">庫存管理</h2>
            {calcMode && (
              <span className="text-xs px-2 py-0.5 rounded bg-amber-100 text-amber-700">
                {calcMode === 'snapshot' ? '快照計算' : '即時計算'}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <WarehouseSelect
              value={warehouse}
              onChange={setWarehouse}
              warehouseList={warehouseList}
              placeholder="全部館別/倉庫"
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-amber-500"
            />
            <Link href="/settings#warehouses" className="text-sm text-amber-600 hover:underline">倉庫設定</Link>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6 border-b border-gray-200">
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors -mb-px ${
                activeTab === t.key
                  ? 'border-amber-500 text-amber-700'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {/* 待入庫管理 */}
        {activeTab === 'inbound' && (() => {
          // Apply filters
          const filteredInbound = pendingInbound.filter(row => {
            if (inboundWareFilter && row.purchaseWarehouse !== inboundWareFilter) return false;
            if (inboundSearch) {
              const q = inboundSearch.toLowerCase();
              if (!row.productName?.toLowerCase().includes(q) &&
                  !row.supplierName?.toLowerCase().includes(q) &&
                  !row.purchaseNo?.toLowerCase().includes(q)) return false;
            }
            if (inboundDateFrom && row.purchaseDate < inboundDateFrom) return false;
            if (inboundDateTo && row.purchaseDate > inboundDateTo) return false;
            return true;
          });
          const totalQty = filteredInbound.reduce((s, r) => s + Number(r.quantity), 0);
          const totalAmt = filteredInbound.reduce((s, r) => s + Number(r.quantity) * Number(r.unitPrice || 0), 0);
          const uniqueWarehouses = [...new Set(pendingInbound.map(r => r.purchaseWarehouse).filter(Boolean))];

          return (
          <div className="space-y-4">
            {/* KPI cards */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-center">
                <p className="text-xs text-blue-600">待入庫筆數</p>
                <p className="text-2xl font-bold text-blue-700">{filteredInbound.length}</p>
              </div>
              <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3 text-center">
                <p className="text-xs text-indigo-600">待入庫數量</p>
                <p className="text-2xl font-bold text-indigo-700">{totalQty}</p>
              </div>
              <div className="bg-violet-50 border border-violet-200 rounded-lg p-3 text-center">
                <p className="text-xs text-violet-600">待入庫金額</p>
                <p className="text-2xl font-bold text-violet-700">NT$ {totalAmt.toLocaleString()}</p>
              </div>
            </div>

            {/* Filters */}
            <div className="bg-white rounded-xl shadow-sm border p-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 items-end">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">關鍵字（商品/廠商/單號）</label>
                  <input type="text" value={inboundSearch} onChange={e => setInboundSearch(e.target.value)}
                    placeholder="搜尋..." className="w-full px-3 py-2 border rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">館別</label>
                  <select value={inboundWareFilter} onChange={e => setInboundWareFilter(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg text-sm">
                    <option value="">全部館別</option>
                    {uniqueWarehouses.map(w => <option key={w} value={w}>{w}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">進貨日期起</label>
                  <input type="date" value={inboundDateFrom} onChange={e => setInboundDateFrom(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg text-sm" />
                </div>
                <div className="flex gap-2 items-end">
                  <div className="flex-1">
                    <label className="block text-xs text-gray-500 mb-1">進貨日期迄</label>
                    <input type="date" value={inboundDateTo} onChange={e => setInboundDateTo(e.target.value)}
                      className="w-full px-3 py-2 border rounded-lg text-sm" />
                  </div>
                  <button onClick={() => { setInboundSearch(''); setInboundWareFilter(''); setInboundDateFrom(''); setInboundDateTo(''); }}
                    className="px-3 py-2 border rounded-lg text-sm text-gray-600 hover:bg-gray-50 whitespace-nowrap">清除</button>
                </div>
              </div>
            </div>

            {/* Batch action bar */}
            {inboundSelected.size > 0 && (
              <div className="bg-blue-700 text-white rounded-xl px-4 py-3 flex items-center justify-between">
                <span className="text-sm font-medium">已勾選 {inboundSelected.size} 筆</span>
                <div className="flex gap-2">
                  <button onClick={() => setInboundSelected(new Set())}
                    className="px-3 py-1.5 bg-white/20 hover:bg-white/30 text-white text-xs rounded-lg">
                    取消選取
                  </button>
                  <button onClick={() => batchConfirmInbound(filteredInbound)} disabled={batchConfirming}
                    className="px-4 py-1.5 bg-green-400 hover:bg-green-300 text-gray-900 text-xs font-bold rounded-lg disabled:opacity-60">
                    {batchConfirming ? '處理中…' : `批次確認入庫（${inboundSelected.size} 筆）`}
                  </button>
                </div>
              </div>
            )}

            {/* Table */}
            <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
              <div className="px-4 py-3 bg-blue-50 border-b flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-blue-800">待入庫商品</h3>
                  <p className="text-xs text-blue-600 mt-0.5">勾選多筆後可批次確認入庫；或逐筆按「確認入庫」</p>
                </div>
                <button onClick={fetchPendingInbound} className="text-xs text-blue-600 hover:underline">重新整理</button>
              </div>
              {inboundLoading ? (
                <div className="text-center py-12 text-gray-400">載入中…</div>
              ) : filteredInbound.length === 0 ? (
                <div className="text-center py-12 text-gray-400">
                  <div className="text-4xl mb-2">📥</div>
                  <p>{pendingInbound.length === 0 ? '目前沒有待入庫商品' : '無符合篩選條件的商品'}</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[900px]">
                    <thead className="bg-gray-50 border-b">
                      <tr>
                        <th className="px-3 py-2 text-center w-8">
                          <input type="checkbox"
                            checked={filteredInbound.length > 0 && filteredInbound.every(r => inboundSelected.has(`${r.purchaseId}-${r.detailId}`))}
                            onChange={e => {
                              if (e.target.checked) {
                                setInboundSelected(new Set(filteredInbound.map(r => `${r.purchaseId}-${r.detailId}`)));
                              } else {
                                setInboundSelected(new Set());
                              }
                            }}
                            className="cursor-pointer"
                          />
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">進貨單號</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">館別</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">進貨日期</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">廠商</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">商品</th>
                        <th className="px-4 py-2 text-center text-xs font-medium text-gray-500">數量</th>
                        <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">單價</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">備註</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">入庫倉庫 *</th>
                        <th className="px-4 py-2 text-center text-xs font-medium text-gray-500">操作</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {filteredInbound.map((row) => {
                        const key = `${row.purchaseId}-${row.detailId}`;
                        const currentLoc = inboundWarehouseEdits[key] ?? row.inventoryWarehouse ?? '';
                        const isUpdating = !!inboundUpdating[key];
                        const isChecked = inboundSelected.has(key);
                        return (
                          <tr key={key} className={`hover:bg-blue-50/30 ${isChecked ? 'bg-blue-50' : ''}`}>
                            <td className="px-3 py-2.5 text-center">
                              <input type="checkbox" checked={isChecked}
                                onChange={e => {
                                  setInboundSelected(prev => {
                                    const next = new Set(prev);
                                    e.target.checked ? next.add(key) : next.delete(key);
                                    return next;
                                  });
                                }}
                                className="cursor-pointer"
                              />
                            </td>
                            <td className="px-4 py-2.5 font-mono text-blue-700 text-xs">{row.purchaseNo}</td>
                            <td className="px-4 py-2.5 text-gray-600 text-xs">{row.purchaseWarehouse || '-'}</td>
                            <td className="px-4 py-2.5 text-gray-500 text-xs">{row.purchaseDate}</td>
                            <td className="px-4 py-2.5 text-gray-700 text-xs">{row.supplierName || '-'}</td>
                            <td className="px-4 py-2.5 font-medium text-gray-800">{row.productName || `#${row.productId}`}</td>
                            <td className="px-4 py-2.5 text-center font-medium">{row.quantity}</td>
                            <td className="px-4 py-2.5 text-right text-gray-600 text-xs">NT$ {Number(row.unitPrice || 0).toLocaleString()}</td>
                            <td className="px-4 py-2.5 text-gray-500 text-xs">{row.note || '-'}</td>
                            <td className="px-4 py-2.5">
                              <select
                                value={currentLoc}
                                onChange={e => setInboundWarehouseEdits(prev => ({ ...prev, [key]: e.target.value }))}
                                className={`w-full px-2 py-1 border rounded text-xs focus:ring-1 focus:ring-blue-500 ${
                                  currentLoc ? 'bg-white border-gray-300' : 'bg-yellow-50 border-yellow-300'
                                }`}
                              >
                                <option value="">⚠ 請選擇倉庫</option>
                                {storageLocations.length > 0
                                  ? storageLocations.map(loc => <option key={loc} value={loc}>{loc}</option>)
                                  : ['格-地下室','格-2F辦公室','格-備品室','軒-B2小倉庫','軒-辦公室','軒-備品室','海-樓梯下','海-備品室','花-備品室','格-B2F','管理部','工程部'].map(loc => <option key={loc} value={loc}>{loc}</option>)
                                }
                              </select>
                            </td>
                            <td className="px-4 py-2.5 text-center">
                              <button
                                onClick={() => {
                                  if (!currentLoc) { showToast('請先選擇入庫倉庫', 'error'); return; }
                                  confirmInbound(row);
                                }}
                                disabled={isUpdating}
                                className="px-3 py-1.5 bg-green-600 text-white text-xs rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                              >
                                {isUpdating ? '處理中…' : '確認入庫'}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
          );
        })()}

        {/* 庫存查詢 */}
        {activeTab === 'query' && (
          <>
            <div className="mb-4 flex justify-end">
              <ExportButtons
                data={inventory.map(item => ({
                  productCode: item.product?.code || '-',
                  productName: item.product?.name || '未知產品',
                  category: item.product?.category || '-',
                  warehouse: warehouse || item.product?.warehouseLocation || '-',
                  quantity: item.currentQty,
                  unit: item.product?.unit || '-',
                  costPrice: item.product?.costPrice || 0,
                  totalValue: (item.currentQty || 0) * (item.product?.costPrice || 0),
                }))}
                columns={EXPORT_CONFIGS.inventory.columns}
                exportName={EXPORT_CONFIGS.inventory.filename}
                title="庫存查詢"
                sheetName="庫存清單"
              />
            </div>
            <div className="bg-white rounded-lg shadow-sm overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <SortableTh label="產品" colKey="productName" sortKey={invQKey} sortDir={invQDir} onSort={invQT} className="px-4 py-3" />
                    <SortableTh label="館別/倉庫" colKey="warehouseLoc" sortKey={invQKey} sortDir={invQDir} onSort={invQT} className="px-4 py-3" />
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">入庫倉庫</th>
                    <SortableTh label="進貨（已入庫）" colKey="purchaseIn" sortKey={invQKey} sortDir={invQDir} onSort={invQT} className="px-4 py-3" align="right" />
                    <SortableTh label="領用" colKey="requisitionQty" sortKey={invQKey} sortDir={invQDir} onSort={invQT} className="px-4 py-3" align="right" />
                    <SortableTh label="調出" colKey="transferOutQty" sortKey={invQKey} sortDir={invQDir} onSort={invQT} className="px-4 py-3" align="right" />
                    <SortableTh label="調入" colKey="transferInQty" sortKey={invQKey} sortDir={invQDir} onSort={invQT} className="px-4 py-3" align="right" />
                    <SortableTh label="盤點調整" colKey="countAdjustQty" sortKey={invQKey} sortDir={invQDir} onSort={invQT} className="px-4 py-3" align="right" />
                    <SortableTh label="現存量" colKey="currentQty" sortKey={invQKey} sortDir={invQDir} onSort={invQT} className="px-4 py-3" align="right" />
                    <SortableTh label="狀態" colKey="status" sortKey={invQKey} sortDir={invQDir} onSort={invQT} className="px-4 py-3" />
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {inventoryLoading ? (
                    <tr><td colSpan="11" className="px-4 py-8 text-center text-gray-500">載入中...</td></tr>
                  ) : inventory.length === 0 ? (
                    <tr><td colSpan="11" className="px-4 py-8 text-center text-gray-500">尚無庫存資料（只顯示已確認入庫的商品）</td></tr>
                  ) : (
                    sortedInventory.map((item, i) => (
                      <tr key={item.productId || i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                        <td className="px-4 py-3 text-sm">{item.product?.name || '-'}</td>
                        <td className="px-4 py-3 text-sm text-gray-500">{warehouse || item.product?.warehouseLocation || '-'}</td>
                        <td className="px-4 py-3 text-sm">
                          {item.inventoryWarehouses?.length > 0
                            ? item.inventoryWarehouses.map(w => (
                                <span key={w} className="inline-block mr-1 mb-0.5 px-1.5 py-0.5 bg-blue-50 text-blue-700 text-xs rounded">{w}</span>
                              ))
                            : <span className="text-gray-300 text-xs">—</span>
                          }
                        </td>
                        <td className="px-4 py-3 text-sm text-right">{item.purchaseQty ?? item.purchaseIncr ?? '-'}</td>
                        <td className="px-4 py-3 text-sm text-right">{item.requisitionQty ?? '-'}</td>
                        <td className="px-4 py-3 text-sm text-right">{item.transferOutQty ?? '-'}</td>
                        <td className="px-4 py-3 text-sm text-right">{item.transferInQty ?? '-'}</td>
                        <td className="px-4 py-3 text-sm text-right">{item.countAdjustQty ?? '-'}</td>
                        <td className={`px-4 py-3 text-sm font-bold text-right ${
                          (item.currentQty || 0) < 0 ? 'text-red-600' : (item.currentQty || 0) < 10 ? 'text-orange-600' : 'text-gray-900'
                        }`}>{item.currentQty}</td>
                        <td className="px-4 py-3 text-sm">{getStatusIcon(item.status)} {item.status}</td>
                        <td className="px-4 py-3 text-sm">
                          {(item.currentQty || 0) < 0 && (
                            <button
                              onClick={() => {
                                setAdjustModal({ productId: item.productId, productName: item.product?.name || '未知', currentQty: item.currentQty });
                                setAdjustForm({ warehouse: warehouse || '', targetQty: '0', reason: '' });
                              }}
                              className="px-2 py-1 bg-red-100 text-red-700 text-xs rounded hover:bg-red-200 whitespace-nowrap"
                            >
                              調整庫存
                            </button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* 領用單 */}
        {activeTab === 'requisition' && (
          <div className="space-y-6">
            <div className="bg-white rounded-lg shadow-sm p-6">
              <h3 className="text-lg font-semibold mb-4">新增領用單（簡化）</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                <div>
                  <label className="block text-sm text-gray-600 mb-1">倉庫 / 館別 *</label>
                  <WarehouseSelect
                    value={reqForm.warehouse}
                    onChange={v => setReqForm(prev => ({ ...prev, warehouse: v, department: '' }))}
                    warehouseList={warehouseList}
                    placeholder="選擇館別/倉庫"
                    className="w-full px-3 py-2 border rounded-lg text-sm"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">部門</label>
                  <ComboInput
                    value={reqForm.department}
                    onChange={v => setReqForm(prev => ({ ...prev, department: v }))}
                    options={getDepartmentsForWarehouse(warehouseList, reqForm.warehouse).map(d => d.name)}
                    placeholder="選擇或輸入部門"
                    className="w-full px-3 py-2 border rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">產品 *</label>
                  <select
                    value={reqForm.productId}
                    onChange={e => {
                      const p = products.find(x => x.id === Number(e.target.value));
                      setReqForm(prev => ({ ...prev, productId: e.target.value, productName: p?.name || '' }));
                    }}
                    className="w-full px-3 py-2 border rounded-lg text-sm"
                  >
                    <option value="">選擇產品</option>
                    {products.map(p => <option key={p.id} value={p.id}>{p.code} - {p.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">數量 *</label>
                  <input
                    type="number"
                    min="1"
                    value={reqForm.quantity}
                    onChange={e => setReqForm(prev => ({ ...prev, quantity: e.target.value }))}
                    className="w-full px-3 py-2 border rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">備註</label>
                  <input
                    type="text"
                    value={reqForm.note}
                    onChange={e => setReqForm(prev => ({ ...prev, note: e.target.value }))}
                    placeholder="選填"
                    className="w-full px-3 py-2 border rounded-lg text-sm"
                  />
                </div>
              </div>
              <button
                onClick={submitRequisition}
                disabled={reqSubmitting}
                className="mt-4 px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50 text-sm"
              >
                {reqSubmitting ? '送出中...' : '建立領用單'}
              </button>
            </div>
            <div className="bg-white rounded-lg shadow-sm overflow-hidden">
              <h3 className="text-lg font-semibold p-4 border-b">領用記錄</h3>
              <table className="w-full">
                <thead className="bg-gray-50"><tr>
                  <SortableTh label="單號" colKey="requisitionNo" sortKey={reqKey} sortDir={reqDir} onSort={reqT} className="px-4 py-2" />
                  <SortableTh label="倉庫" colKey="warehouse" sortKey={reqKey} sortDir={reqDir} onSort={reqT} className="px-4 py-2" />
                  <SortableTh label="部門" colKey="department" sortKey={reqKey} sortDir={reqDir} onSort={reqT} className="px-4 py-2" />
                  <SortableTh label="產品" colKey="productName" sortKey={reqKey} sortDir={reqDir} onSort={reqT} className="px-4 py-2" />
                  <SortableTh label="數量" colKey="quantity" sortKey={reqKey} sortDir={reqDir} onSort={reqT} className="px-4 py-2" align="right" />
                  <SortableTh label="日期" colKey="requisitionDate" sortKey={reqKey} sortDir={reqDir} onSort={reqT} className="px-4 py-2" />
                </tr></thead>
                <tbody>
                  {requisitionLoading ? <tr><td colSpan="6" className="px-4 py-6 text-center text-gray-500">載入中...</td></tr> :
                    requisitions.length === 0 ? <tr><td colSpan="6" className="px-4 py-6 text-center text-gray-500">尚無領用記錄</td></tr> :
                    sortedRequisitions.map(r => (
                      <tr key={r.id} className="border-t"><td className="px-4 py-2 text-sm">{r.requisitionNo}</td>
                        <td className="px-4 py-2 text-sm">{r.warehouse}</td><td className="px-4 py-2 text-sm">{r.department || '-'}</td>
                        <td className="px-4 py-2 text-sm">{r.product?.name || '-'}</td>
                        <td className="px-4 py-2 text-sm text-right">{r.quantity}</td>
                        <td className="px-4 py-2 text-sm">{r.requisitionDate}</td></tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 調撥單 */}
        {activeTab === 'transfer' && (
          <div className="space-y-6">
            <div className="bg-white rounded-lg shadow-sm p-6">
              <h3 className="text-lg font-semibold mb-4">新增調撥單（簡化）</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                <div>
                  <label className="block text-sm text-gray-600 mb-1">來源館別/倉庫 *</label>
                  <WarehouseSelect
                    value={trfForm.fromWarehouse}
                    onChange={v => setTrfForm(prev => ({ ...prev, fromWarehouse: v }))}
                    warehouseList={warehouseList}
                    placeholder="選擇來源"
                    className="w-full px-3 py-2 border rounded-lg text-sm"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">目標館別/倉庫 *</label>
                  <WarehouseSelect
                    value={trfForm.toWarehouse}
                    onChange={v => setTrfForm(prev => ({ ...prev, toWarehouse: v }))}
                    warehouseList={warehouseList}
                    placeholder="選擇目標"
                    className="w-full px-3 py-2 border rounded-lg text-sm"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">產品 *</label>
                  <select
                    value={trfForm.productId}
                    onChange={e => {
                      const p = products.find(x => x.id === Number(e.target.value));
                      setTrfForm(prev => ({ ...prev, productId: e.target.value, productName: p?.name || '' }));
                    }}
                    className="w-full px-3 py-2 border rounded-lg text-sm"
                  >
                    <option value="">選擇產品</option>
                    {products.map(p => <option key={p.id} value={p.id}>{p.code} - {p.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">數量 *</label>
                  <input
                    type="number"
                    min="1"
                    value={trfForm.quantity}
                    onChange={e => setTrfForm(prev => ({ ...prev, quantity: e.target.value }))}
                    className="w-full px-3 py-2 border rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">備註</label>
                  <input
                    type="text"
                    value={trfForm.note}
                    onChange={e => setTrfForm(prev => ({ ...prev, note: e.target.value }))}
                    placeholder="選填"
                    className="w-full px-3 py-2 border rounded-lg text-sm"
                  />
                </div>
              </div>
              <button
                onClick={submitTransfer}
                disabled={trfSubmitting}
                className="mt-4 px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50 text-sm"
              >
                {trfSubmitting ? '送出中...' : '建立調撥單'}
              </button>
            </div>
            <div className="bg-white rounded-lg shadow-sm overflow-hidden">
              <h3 className="text-lg font-semibold p-4 border-b">調撥記錄</h3>
              <table className="w-full">
                <thead className="bg-gray-50"><tr>
                  <SortableTh label="單號" colKey="transferNo" sortKey={trfKey} sortDir={trfDir} onSort={trfT} className="px-4 py-2" />
                  <SortableTh label="來源" colKey="fromWarehouse" sortKey={trfKey} sortDir={trfDir} onSort={trfT} className="px-4 py-2" />
                  <SortableTh label="目標" colKey="toWarehouse" sortKey={trfKey} sortDir={trfDir} onSort={trfT} className="px-4 py-2" />
                  <SortableTh label="產品" colKey="productName" sortKey={trfKey} sortDir={trfDir} onSort={trfT} className="px-4 py-2" />
                  <SortableTh label="數量" colKey="quantity" sortKey={trfKey} sortDir={trfDir} onSort={trfT} className="px-4 py-2" align="right" />
                  <SortableTh label="日期" colKey="transferDate" sortKey={trfKey} sortDir={trfDir} onSort={trfT} className="px-4 py-2" />
                </tr></thead>
                <tbody>
                  {transferLoading ? <tr><td colSpan="6" className="px-4 py-6 text-center text-gray-500">載入中...</td></tr> :
                    transfers.length === 0 ? <tr><td colSpan="6" className="px-4 py-6 text-center text-gray-500">尚無調撥記錄</td></tr> :
                    sortedTransferRows.map((row) => (
                      <tr key={row._key} className="border-t">
                        <td className="px-4 py-2 text-sm">{row.transferNo}</td>
                        <td className="px-4 py-2 text-sm">{row.fromWarehouse}</td>
                        <td className="px-4 py-2 text-sm">{row.toWarehouse}</td>
                        <td className="px-4 py-2 text-sm">{row.productName}</td>
                        <td className="px-4 py-2 text-sm text-right">{row.quantity}</td>
                        <td className="px-4 py-2 text-sm">{row.transferDate}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 盤點 */}
        {activeTab === 'count' && (
          <div className="space-y-6">
            <div className="bg-white rounded-lg shadow-sm p-6">
              <h3 className="text-lg font-semibold mb-4">新增盤點（簡化）</h3>
              <p className="text-sm text-gray-500 mb-4">請先選擇倉庫，再從庫存中選產品並輸入實盤數量，系統會計算差異並更新庫存。</p>
              <div className="flex gap-4 mb-4">
                <div>
                  <label className="block text-sm text-gray-600 mb-1">館別 / 倉庫 *</label>
                  <WarehouseSelect
                    value={countForm.warehouse}
                    onChange={v => {
                      setCountForm(prev => ({ ...prev, warehouse: v }));
                      setWarehouse(v);
                    }}
                    warehouseList={warehouseList}
                    placeholder="選擇館別/倉庫"
                    className="px-3 py-2 border rounded-lg text-sm"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">盤點日期</label>
                  <input
                    type="date"
                    value={countForm.countDate}
                    onChange={e => setCountForm(prev => ({ ...prev, countDate: e.target.value }))}
                    className="px-3 py-2 border rounded-lg text-sm"
                  />
                </div>
                <button
                  onClick={addCountItem}
                  disabled={!countForm.warehouse || inventory.length === 0}
                  className="self-end px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50 text-sm"
                >
                  從庫存加入產品
                </button>
              </div>
              {countForm.items.length > 0 && (
                <>
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50"><tr>
                      <th className="px-4 py-2 text-left font-medium text-gray-600">產品</th>
                      <th className="px-4 py-2 text-right font-medium text-gray-600">帳面數</th>
                      <th className="px-4 py-2 text-right font-medium text-gray-600">實盤數</th>
                      <th className="px-4 py-2 text-right font-medium text-gray-600">差異</th>
                      <th className="px-4 py-2 w-16">操作</th>
                    </tr></thead>
                    <tbody>
                      {countForm.items.map((it, idx) => {
                        const act = (Number(it.actualQty) ?? Number(it.systemQty)) || 0;
                        const sys = Number(it.systemQty) || 0;
                        const diff = act - sys;
                        return (
                          <tr key={idx} className="border-t">
                            <td className="px-4 py-2">{it.productName || '-'}</td>
                            <td className="px-4 py-2 text-right">{sys}</td>
                            <td className="px-4 py-2">
                              <input
                                type="number"
                                value={it.actualQty ?? ''}
                                onChange={e => updateCountItem(idx, 'actualQty', e.target.value === '' ? '' : Number(e.target.value))}
                                className="w-20 px-2 py-1 border rounded text-right"
                              />
                            </td>
                            <td className={`px-4 py-2 text-right font-medium ${diff > 0 ? 'text-green-600' : diff < 0 ? 'text-red-600' : 'text-gray-500'}`}>{diff}</td>
                            <td><button onClick={() => removeCountItem(idx)} className="text-red-500 hover:underline text-xs">刪除</button></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  <button
                    onClick={submitStockCount}
                    disabled={countSubmitting}
                    className="mt-4 px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50 text-sm"
                  >
                    {countSubmitting ? '送出中...' : '確認盤點'}
                  </button>
                </>
              )}
            </div>
            <div className="bg-white rounded-lg shadow-sm overflow-hidden">
              <h3 className="text-lg font-semibold p-4 border-b">盤點記錄</h3>
              <table className="w-full">
                <thead className="bg-gray-50"><tr>
                  <SortableTh label="單號" colKey="countNo" sortKey={cntKey} sortDir={cntDir} onSort={cntT} className="px-4 py-2" />
                  <SortableTh label="倉庫" colKey="warehouse" sortKey={cntKey} sortDir={cntDir} onSort={cntT} className="px-4 py-2" />
                  <SortableTh label="日期" colKey="countDate" sortKey={cntKey} sortDir={cntDir} onSort={cntT} className="px-4 py-2" />
                  <SortableTh label="品項數" colKey="itemCount" sortKey={cntKey} sortDir={cntDir} onSort={cntT} className="px-4 py-2" />
                </tr></thead>
                <tbody>
                  {countLoading ? <tr><td colSpan="4" className="px-4 py-6 text-center text-gray-500">載入中...</td></tr> :
                    stockCounts.length === 0 ? <tr><td colSpan="4" className="px-4 py-6 text-center text-gray-500">尚無盤點記錄</td></tr> :
                    sortedStockCounts.map(s => (
                      <tr key={s.id} className="border-t">
                        <td className="px-4 py-2 text-sm">{s.countNo}</td>
                        <td className="px-4 py-2 text-sm">{s.warehouse}</td>
                        <td className="px-4 py-2 text-sm">{s.countDate}</td>
                        <td className="px-4 py-2 text-sm">{s.items?.length || 0}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      {/* 庫存調整 Modal */}
      {adjustModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b">
              <h2 className="text-base font-semibold">手動調整庫存</h2>
              <button onClick={() => setAdjustModal(null)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
            </div>
            <div className="p-5 space-y-4">
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm">
                <span className="font-medium text-gray-800">{adjustModal.productName}</span>
                <span className="ml-2 text-red-700">現存量：{adjustModal.currentQty}</span>
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">倉庫 *</label>
                <WarehouseSelect
                  value={adjustForm.warehouse}
                  onChange={v => setAdjustForm(prev => ({ ...prev, warehouse: v }))}
                  warehouseList={warehouseList}
                  placeholder="選擇倉庫"
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                  required
                />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">設定為（目標數量） *</label>
                <input
                  type="number"
                  value={adjustForm.targetQty}
                  onChange={e => setAdjustForm(prev => ({ ...prev, targetQty: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                  placeholder="例：0 或正整數"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">原因</label>
                <input
                  type="text"
                  value={adjustForm.reason}
                  onChange={e => setAdjustForm(prev => ({ ...prev, reason: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                  placeholder="說明調整原因（選填）"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 p-5 border-t">
              <button onClick={() => setAdjustModal(null)} className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50">取消</button>
              <button
                onClick={submitAdjustment}
                disabled={adjustSubmitting}
                className="px-4 py-2 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                {adjustSubmitting ? '調整中...' : '確認調整'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
