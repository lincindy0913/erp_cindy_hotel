'use client';

import { useState, useEffect, useMemo } from 'react';
import { sortRows, useColumnSort } from '@/components/SortableTh';

export function useInventoryShared({ warehouse }) {
  // Warehouse list (structured) and flat names
  const [warehouseList, setWarehouseList] = useState([]);
  const [warehouses, setWarehouses] = useState([]);

  // 庫存查詢
  const [inventory, setInventory] = useState([]);
  const [inventoryLoading, setInventoryLoading] = useState(true);
  const [inventoryError, setInventoryError] = useState(null);
  const [calcMode, setCalcMode] = useState(null);

  // Products (shared across requisition / transfer / count tabs)
  const [products, setProducts] = useState([]);

  // Toast
  const [toast, setToast] = useState(null);

  // Low-stock filter (query tab)
  const [filterLowStock, setFilterLowStock] = useState(false);

  const { sortKey: invQKey, sortDir: invQDir, toggleSort: invQT } = useColumnSort('productName', 'asc');
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

  function showToast(msg, type = 'success') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }

  async function fetchWarehouses(currentWarehouse, setWarehouse) {
    try {
      const res = await fetch('/api/warehouse-departments');
      if (res.ok) {
        const data = await res.json();
        const list = data?.list || [];
        setWarehouseList(list);
        const names = list.map(w => w.name);
        setWarehouses(names);
        if (names.length > 0 && !currentWarehouse) setWarehouse(names[0]);
      }
    } catch { /* ignore */ }
  }

  async function fetchInventory(wh) {
    setInventoryLoading(true);
    try {
      const url = wh ? `/api/inventory?warehouse=${encodeURIComponent(wh)}` : '/api/inventory';
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

  return {
    warehouseList,
    warehouses,
    inventory,
    inventoryLoading,
    inventoryError,
    calcMode,
    products,
    toast,
    filterLowStock,
    setFilterLowStock,
    sortedInventory,
    invQKey,
    invQDir,
    invQT,
    showToast,
    fetchWarehouses,
    fetchInventory,
    fetchProducts,
  };
}
