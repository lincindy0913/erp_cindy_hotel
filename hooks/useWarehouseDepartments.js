'use client';
import { useState } from 'react';

export function useWarehouseDepartments({ showToast, confirm, onWarehouseDeleted, onDepartmentDeleted }) {
  const [warehouseDepartments, setWarehouseDepartments] = useState({});
  const [warehouseList, setWarehouseList] = useState([]);
  const [showWarehouseManager, setShowWarehouseManager] = useState(false);
  const [newWarehouseName, setNewWarehouseName] = useState('');
  const [newDeptName, setNewDeptName] = useState('');
  const [newDeptWarehouse, setNewDeptWarehouse] = useState('');

  async function fetchWarehouseDepartments() {
    try {
      const response = await fetch('/api/warehouse-departments');
      if (!response.ok) { showToast('載入館別資料失敗', 'error'); return; }
      const data = await response.json();
      setWarehouseDepartments((data && data.byName) ? data.byName : (data || {}));
      if (data && Array.isArray(data.list)) setWarehouseList(data.list);
    } catch (error) {
      console.error('取得館別部門失敗:', error);
      showToast('載入館別資料失敗', 'error');
    }
  }

  async function handleAddWarehouse() {
    if (!newWarehouseName.trim()) return;
    try {
      const response = await fetch('/api/warehouse-departments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'addWarehouse', name: newWarehouseName.trim() }),
      });
      if (response.ok) {
        const data = await response.json();
        setWarehouseDepartments((data && data.byName) ? data.byName : data);
        setNewWarehouseName('');
      } else {
        const error = await response.json();
        showToast(error.error || '新增失敗', 'error');
      }
    } catch { showToast('新增館別失敗', 'error'); }
  }

  async function handleDeleteWarehouse(name) {
    if (!(await confirm(`確定要刪除館別「${name}」及其所有部門嗎？`, { title: '刪除確認', danger: true }))) return;
    try {
      const response = await fetch('/api/warehouse-departments', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'deleteWarehouse', name }),
      });
      if (response.ok) {
        const data = await response.json();
        setWarehouseDepartments((data && data.byName) ? data.byName : data);
        onWarehouseDeleted?.(name);
      }
    } catch { showToast('刪除館別失敗', 'error'); }
  }

  async function handleAddDepartment() {
    if (!newDeptWarehouse || !newDeptName.trim()) return;
    try {
      const response = await fetch('/api/warehouse-departments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'addDepartment', warehouse: newDeptWarehouse, name: newDeptName.trim() }),
      });
      if (response.ok) {
        const data = await response.json();
        setWarehouseDepartments((data && data.byName) ? data.byName : data);
        setNewDeptName('');
      } else {
        const error = await response.json();
        showToast(error.error || '新增失敗', 'error');
      }
    } catch { showToast('新增部門失敗', 'error'); }
  }

  async function handleDeleteDepartment(warehouse, deptName) {
    if (!(await confirm(`確定要刪除「${warehouse}」的部門「${deptName}」嗎？`, { title: '刪除確認', danger: true }))) return;
    try {
      const response = await fetch('/api/warehouse-departments', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'deleteDepartment', warehouse, name: deptName }),
      });
      if (response.ok) {
        const data = await response.json();
        setWarehouseDepartments((data && data.byName) ? data.byName : data);
        onDepartmentDeleted?.(warehouse, deptName);
      }
    } catch { showToast('刪除部門失敗', 'error'); }
  }

  return {
    warehouseDepartments, warehouseList,
    showWarehouseManager, setShowWarehouseManager,
    newWarehouseName, setNewWarehouseName,
    newDeptName, setNewDeptName,
    newDeptWarehouse, setNewDeptWarehouse,
    fetchWarehouseDepartments,
    handleAddWarehouse, handleDeleteWarehouse,
    handleAddDepartment, handleDeleteDepartment,
  };
}
