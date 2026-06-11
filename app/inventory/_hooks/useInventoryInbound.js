'use client';

import { useState } from 'react';
import { useConfirm } from '@/context/ConfirmContext';

export function useInventoryInbound({ showToast }) {
  const confirm = useConfirm();

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
        const allItems = p.items || [];
        const totalItemsInPo = allItems.length;
        const doneItemsInPo  = allItems.filter(i => i.status === '已入庫').length;
        allItems.forEach(item => {
          if (item.status === '待入庫') {
            rows.push({
              ...item,
              productName: prodMap[item.productId] || `商品#${item.productId}`,
              purchaseId: p.id,
              purchaseNo: p.purchaseNo,
              purchaseDate: p.purchaseDate,
              purchaseWarehouse: p.warehouse,
              supplierName: p.supplierName || '',
              totalItemsInPo,
              doneItemsInPo,
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

  async function batchConfirmInbound(filteredInbound) {
    const selected = filteredInbound.filter(r => inboundSelected.has(`${r.purchaseId}-${r.detailId}`));
    if (selected.length === 0) return;
    const missing = selected.filter(r => !(inboundWarehouseEdits[`${r.purchaseId}-${r.detailId}`] ?? r.inventoryWarehouse));
    if (missing.length > 0) {
      showToast(`有 ${missing.length} 筆未選擇入庫倉庫，請先填寫`, 'error');
      return;
    }
    if (!(await confirm(`確認批次入庫 ${selected.length} 筆商品？`, { title: '入庫確認', danger: false }))) return;
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

  return {
    pendingInbound,
    inboundLoading,
    inboundUpdating,
    inboundWarehouseEdits,
    setInboundWarehouseEdits,
    storageLocations,
    inboundWareFilter,
    setInboundWareFilter,
    inboundSearch,
    setInboundSearch,
    inboundDateFrom,
    setInboundDateFrom,
    inboundDateTo,
    setInboundDateTo,
    inboundSelected,
    setInboundSelected,
    batchConfirming,
    fetchPendingInbound,
    confirmInbound,
    batchConfirmInbound,
  };
}
