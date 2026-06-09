'use client';

import { useState, useEffect } from 'react';
import { useConfirm } from '@/context/ConfirmContext';

export function useSettingsWarehouses({ activeSection, showToast, setSaving }) {
  const confirm = useConfirm();
  const [warehouseData, setWarehouseData] = useState({});
  const [warehouseLoading, setWarehouseLoading] = useState(false);
  const [newWarehouse, setNewWarehouse] = useState('');
  const [selectedBuildingForStorage, setSelectedBuildingForStorage] = useState('');
  const [newDeptWarehouse, setNewDeptWarehouse] = useState('');
  const [newDeptName, setNewDeptName] = useState('');
  const [newBuilding, setNewBuilding] = useState('');

  async function fetchWarehouses() {
    setWarehouseLoading(true);
    try {
      const res = await fetch('/api/warehouse-departments');
      if (res.ok) {
        const data = await res.json();
        if (data && Array.isArray(data.list)) {
          setWarehouseData({ list: data.list, byName: data.byName || {} });
        } else if (typeof data === 'object' && data !== null && !data.list) {
          setWarehouseData({
            list: Object.entries(data).map(([name, depts]) => ({ id: 0, name, type: 'storage', departments: depts || [] })),
            byName: data,
          });
        } else {
          setWarehouseData({ list: [], byName: {} });
        }
      }
    } catch { /* ignore */ }
    setWarehouseLoading(false);
  }

  useEffect(() => {
    if (activeSection === 'warehouses' || activeSection === 'departments') {
      fetchWarehouses();
    }
  }, [activeSection]);

  async function addStorageLocation() {
    if (!selectedBuildingForStorage) { showToast('請先選擇館別', 'error'); return; }
    if (!newWarehouse.trim()) { showToast('請輸入倉庫名稱', 'error'); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/warehouse-departments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'addStorageLocation', buildingId: parseInt(selectedBuildingForStorage), name: newWarehouse.trim() }),
      });
      const result = await res.json();
      if (res.ok && result.list) {
        setWarehouseData({ list: result.list, byName: result.byName || {} });
        setNewWarehouse('');
        showToast(`倉庫「${newWarehouse.trim()}」已新增`);
      } else {
        showToast((typeof result?.error === 'string' ? result.error : result?.error?.message) || '新增失敗', 'error');
      }
    } catch { showToast('新增失敗', 'error'); }
    setSaving(false);
  }

  async function deleteStorageLocation(id, name) {
    if (!(await confirm(`確定刪除倉庫「${name}」？`, { title: '刪除確認', danger: true }))) return;
    try {
      const res = await fetch('/api/warehouse-departments', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'deleteStorageLocation', id }),
      });
      const result = await res.json();
      if (res.ok && result.list) {
        setWarehouseData({ list: result.list, byName: result.byName || {} });
        showToast(`倉庫「${name}」已刪除`);
      } else {
        showToast((typeof result?.error === 'string' ? result.error : result?.error?.message) || '刪除失敗', 'error');
      }
    } catch { showToast('刪除失敗', 'error'); }
  }

  async function addBuilding() {
    if (!newBuilding.trim()) { showToast('請輸入館別名稱', 'error'); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/warehouse-departments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'addWarehouse', name: newBuilding.trim(), type: 'building' }),
      });
      const result = await res.json();
      if (res.ok && result.list) {
        setWarehouseData({ list: result.list, byName: result.byName || {} });
        setNewBuilding('');
        showToast(`館別「${newBuilding.trim()}」已新增`);
      } else if (res.ok) {
        fetchWarehouses();
        setNewBuilding('');
        showToast(`館別「${newBuilding.trim()}」已新增`);
      } else {
        showToast((typeof result?.error === 'string' ? result.error : result?.error?.message) || '新增失敗', 'error');
      }
    } catch { showToast('新增失敗', 'error'); }
    setSaving(false);
  }

  async function addDepartmentToWarehouse() {
    if (!newDeptWarehouse || !newDeptName.trim()) { showToast('請選擇館別並輸入部門名稱', 'error'); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/warehouse-departments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'addDepartment', warehouse: newDeptWarehouse, name: newDeptName.trim() }),
      });
      const result = await res.json();
      if (res.ok && result.list) {
        setWarehouseData({ list: result.list, byName: result.byName || {} });
        setNewDeptName('');
        showToast(`部門「${newDeptName.trim()}」已新增`);
      } else if (res.ok) {
        fetchWarehouses();
        setNewDeptName('');
        showToast(`部門「${newDeptName.trim()}」已新增`);
      } else {
        showToast((typeof result?.error === 'string' ? result.error : result?.error?.message) || '新增失敗', 'error');
      }
    } catch { showToast('新增失敗', 'error'); }
    setSaving(false);
  }

  async function deleteWarehouse(name) {
    if (!(await confirm(`確定刪除「${name}」？`, { title: '刪除確認', danger: true }))) return;
    try {
      const res = await fetch('/api/warehouse-departments', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'deleteWarehouse', name }),
      });
      const result = await res.json();
      if (res.ok && result.list) {
        setWarehouseData({ list: result.list, byName: result.byName || {} });
        showToast(`已刪除「${name}」`);
      } else if (res.ok) {
        fetchWarehouses();
        showToast(`已刪除「${name}」`);
      } else {
        showToast((typeof result?.error === 'string' ? result.error : result?.error?.message) || '刪除失敗', 'error');
      }
    } catch { showToast('刪除失敗', 'error'); }
  }

  async function deleteDepartment(warehouse, deptName) {
    if (!(await confirm(`確定刪除部門「${deptName}」？`, { title: '刪除確認', danger: true }))) return;
    try {
      const res = await fetch('/api/warehouse-departments', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'deleteDepartment', warehouse, name: deptName }),
      });
      const result = await res.json();
      if (res.ok && result.list) {
        setWarehouseData({ list: result.list, byName: result.byName || {} });
        showToast(`部門「${deptName}」已刪除`);
      } else if (res.ok) {
        fetchWarehouses();
        showToast(`部門「${deptName}」已刪除`);
      } else {
        showToast((typeof result?.error === 'string' ? result.error : result?.error?.message) || '刪除失敗', 'error');
      }
    } catch { showToast('刪除失敗', 'error'); }
  }

  return {
    warehouseData,
    warehouseLoading,
    newWarehouse, setNewWarehouse,
    selectedBuildingForStorage, setSelectedBuildingForStorage,
    newDeptWarehouse, setNewDeptWarehouse,
    newDeptName, setNewDeptName,
    newBuilding, setNewBuilding,
    fetchWarehouses,
    addStorageLocation,
    deleteStorageLocation,
    addBuilding,
    addDepartmentToWarehouse,
    deleteWarehouse,
    deleteDepartment,
  };
}
