'use client';

import { useState, useEffect, useMemo } from 'react';
import { useConfirm } from '@/context/ConfirmContext';
import { sortRows, useColumnSort } from '@/components/SortableTh';
import { todayStr } from '@/lib/localDate';

export function useInventory() {
  const confirm = useConfirm();

  const [activeTab, setActiveTab] = useState('query');
  const [warehouseList, setWarehouseList] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [warehouse, setWarehouse] = useState('');

  // 庫存查詢
  const [inventory, setInventory] = useState([]);
  const [inventoryLoading, setInventoryLoading] = useState(true);
  const [inventoryError, setInventoryError] = useState(null);
  const [calcMode, setCalcMode] = useState(null);
  const [filterLowStock, setFilterLowStock] = useState(false);

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
  const [adjustModal, setAdjustModal] = useState(null);
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
  const [inboundSelected, setInboundSelected] = useState(new Set());
  const [batchConfirming, setBatchConfirming] = useState(false);

  // Sort hooks
  const { sortKey: invQKey, sortDir: invQDir, toggleSort: invQT } = useColumnSort('productName', 'asc');
  const { sortKey: reqKey, sortDir: reqDir, toggleSort: reqT } = useColumnSort('requisitionDate', 'desc');
  const { sortKey: trfKey, sortDir: trfDir, toggleSort: trfT } = useColumnSort('transferDate', 'desc');
  const { sortKey: cntKey, sortDir: cntDir, toggleSort: cntT } = useColumnSort('countDate', 'desc');

  const sortedInventory = useMemo(() => {
    const base = filterLowStock
      ? inventory.filter(row => row.status === '偏低' || row.status === '缺貨')
      : inventory;
    return sortRows(base, invQKey, invQDir, {
      productName: (row) => row.product?.name || '',
      warehouseLoc: (row) => warehouse || row.product?.warehouseLocation || '',
      purchaseIn: (row) => Number(row.purchaseQty ?? row.purchaseIncr ?? 0),
      requisitionQty: (row) => Number(row.requisitionQty ?? 0),
      transferOutQty: (row) => Number(row.transferOutQty ?? 0),
      transferInQty: (row) => Number(row.transferInQty ?? 0),
      countAdjustQty: (row) => Number(row.countAdjustQty ?? 0),
      currentQty: (row) => Number(row.currentQty ?? 0),
      status: (row) => row.status || '',
    });
  }, [inventory, warehouse, invQKey, invQDir, filterLowStock]);

  const sortedRequisitions = useMemo(
    () => sortRows(requisitions, reqKey, reqDir, {
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

  const sortedStockCounts = useMemo(
    () => sortRows(stockCounts, cntKey, cntDir, {
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
    const params = new URLSearchParams(window.location.search);
    const tabParam = params.get('tab');
    if (tabParam && ['query', 'inbound', 'requisition', 'transfer', 'count'].includes(tabParam)) {
      setActiveTab(tabParam);
    }
    if (params.get('lowstock') === '1') setFilterLowStock(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (activeTab === 'query') fetchInventory();
    if (activeTab === 'inbound') fetchPendingInbound();
    if (activeTab === 'requisition') fetchRequisitions();
    if (activeTab === 'transfer') fetchTransfers();
    if (activeTab === 'count') { fetchStockCounts(); fetchInventory(); }
    if (['requisition', 'transfer', 'count'].includes(activeTab)) fetchProducts();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, warehouse]);

  useEffect(() => {
    if (activeTab === 'count' && warehouse) setCountForm(prev => ({ ...prev, warehouse }));
    if (activeTab === 'requisition' && warehouse) setReqForm(prev => ({ ...prev, warehouse, department: '' }));
    if (activeTab === 'transfer' && warehouse) setTrfForm(prev => ({ ...prev, fromWarehouse: warehouse }));
  }, [activeTab, warehouse]);

  async function fetchWarehouses() {
    try {
      const res = await fetch('/api/warehouse-departments');
      if (res.ok) {
        const data = await res.json();
        const list = data?.list || [];
        setWarehouseList(list);
        const names = list.map(w => w.name);
        setWarehouses(names);
        if (names.length > 0 && !warehouse) setWarehouse(names[0]);
      }
    } catch { /* ignore */ }
  }

  async function fetchInventory() {
    setInventoryLoading(true);
    try {
      const url = warehouse ? `/api/inventory?warehouse=${encodeURIComponent(warehouse)}` : '/api/inventory';
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const arr = Array.isArray(data) ? data : (data?.data || []);
      setInventoryError(null);
      setInventory(arr);
      if (data?.calculationMode) setCalcMode(data.calculationMode);
    } catch (e) {
      console.error('[fetchInventory]', e);
      setInventoryError('庫存資料載入失敗，請重試。');
      setInventory([]);
    }
    setInventoryLoading(false);
  }

  async function fetchProducts() {
    try {
      const res = await fetch('/api/products?all=true');
      const data = await res.json();
      const arr = Array.isArray(data) ? data : (data?.products || data?.data || []);
      setProducts(arr.filter(p => p.isInStock === true));
    } catch { setProducts([]); }
  }

  async function fetchRequisitions() {
    setRequisitionLoading(true);
    try {
      const url = warehouse ? `/api/inventory/requisitions?warehouse=${encodeURIComponent(warehouse)}` : '/api/inventory/requisitions';
      const res = await fetch(url);
      const data = res.ok ? await res.json() : [];
      setRequisitions(Array.isArray(data) ? data : []);
    } catch { setRequisitions([]); }
    setRequisitionLoading(false);
  }

  async function fetchTransfers() {
    setTransferLoading(true);
    try {
      const url = warehouse ? `/api/inventory/transfers?warehouse=${encodeURIComponent(warehouse)}` : '/api/inventory/transfers';
      const res = await fetch(url);
      const data = res.ok ? await res.json() : [];
      setTransfers(Array.isArray(data) ? data : []);
    } catch { setTransfers([]); }
    setTransferLoading(false);
  }

  async function fetchStockCounts() {
    setCountLoading(true);
    try {
      const url = warehouse ? `/api/inventory/stock-counts?warehouse=${encodeURIComponent(warehouse)}` : '/api/inventory/stock-counts';
      const res = await fetch(url);
      const data = res.ok ? await res.json() : [];
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
      rows.sort((a, b) => a.purchaseDate.localeCompare(b.purchaseDate));
      setPendingInbound(rows);
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

  async function batchConfirmInbound(filteredRows) {
    const selected = filteredRows.filter(r => inboundSelected.has(`${r.purchaseId}-${r.detailId}`));
    if (selected.length === 0) return;
    const missing = selected.filter(r => !(inboundWarehouseEdits[`${r.purchaseId}-${r.detailId}`] ?? r.inventoryWarehouse));
    if (missing.length > 0) {
      showToast(`有 ${missing.length} 筆未選擇入庫倉庫，請先填寫`, 'error');
      return;
    }
    if (!(await confirm(`確認批次入庫 ${selected.length} 筆商品？`, { title: '入庫確認', danger: false }))) return;
    setBatchConfirming(true);
    let ok = 0; let fail = 0;
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
        if (res.ok) ok++; else fail++;
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
    if (!countForm.warehouse) { showToast('請選擇倉庫', 'error'); return; }
    const items = countForm.items.filter(i => i.productId && (i.actualQty != null || i.systemQty != null));
    if (items.length === 0) { showToast('請至少新增一筆盤點明細', 'error'); return; }
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
        body: JSON.stringify({ warehouse: countForm.warehouse, countDate: countForm.countDate || todayStr(), items: payload }),
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
    if (!adjustForm.warehouse) { showToast('請選擇倉庫', 'error'); return; }
    if (adjustForm.targetQty === '' || adjustForm.targetQty === null) { showToast('請輸入目標數量', 'error'); return; }
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
    if (!invItem) { showToast('請先選擇庫存中的產品', 'error'); return; }
    setCountForm(prev => ({
      ...prev,
      items: [...prev.items, { productId: invItem.productId, productName: invItem.product?.name, systemQty: invItem.currentQty || 0, actualQty: invItem.currentQty || 0 }],
    }));
  }

  function updateCountItem(idx, field, value) {
    setCountForm(prev => ({ ...prev, items: prev.items.map((it, i) => i === idx ? { ...it, [field]: value } : it) }));
  }

  function removeCountItem(idx) {
    setCountForm(prev => ({ ...prev, items: prev.items.filter((_, i) => i !== idx) }));
  }

  return {
    activeTab, setActiveTab, warehouse, setWarehouse, warehouseList, warehouses, toast, calcMode,
    inventoryError, fetchInventory, fetchStockCounts,
    inventory, inventoryLoading, sortedInventory, filterLowStock, setFilterLowStock,
    invQKey, invQDir, invQT,
    adjustModal, setAdjustModal, adjustForm, setAdjustForm, adjustSubmitting, submitAdjustment,
    pendingInbound, inboundLoading, inboundUpdating, inboundWarehouseEdits, setInboundWarehouseEdits,
    inboundWareFilter, setInboundWareFilter, inboundSearch, setInboundSearch,
    inboundDateFrom, setInboundDateFrom, inboundDateTo, setInboundDateTo,
    inboundSelected, setInboundSelected, batchConfirming, storageLocations,
    confirmInbound, batchConfirmInbound, fetchPendingInbound,
    requisitions, requisitionLoading, sortedRequisitions, products,
    reqForm, setReqForm, reqSubmitting, reqKey, reqDir, reqT, submitRequisition,
    transfers, transferLoading, sortedTransferRows,
    trfForm, setTrfForm, trfSubmitting, trfKey, trfDir, trfT, submitTransfer,
    stockCounts, countLoading, sortedStockCounts,
    countForm, setCountForm, countSubmitting, cntKey, cntDir, cntT,
    addCountItem, updateCountItem, removeCountItem, submitStockCount,
  };
}
