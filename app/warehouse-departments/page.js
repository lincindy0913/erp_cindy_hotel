'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Navigation from '@/components/Navigation';

export default function WarehouseDepartmentsPage() {
  const [data, setData] = useState({ list: [], byName: {} });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState(null);

  // 館別
  const [newBuilding, setNewBuilding] = useState('');
  // 部門
  const [selectedBuildingForDept, setSelectedBuildingForDept] = useState('');
  const [newDeptName, setNewDeptName] = useState('');
  // 倉庫
  const [selectedBuildingForStorage, setSelectedBuildingForStorage] = useState('');
  const [newStorageName, setNewStorageName] = useState('');

  useEffect(() => { fetchData(); }, []);

  function showToast(msg, type = 'success') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }

  async function fetchData() {
    setLoading(true);
    try {
      const res = await fetch('/api/warehouse-departments');
      if (res.ok) {
        const result = await res.json();
        setData({
          list: Array.isArray(result.list) ? result.list : [],
          byName: result.byName || {},
        });
      } else {
        setError('載入失敗');
      }
    } catch { setError('網路錯誤'); }
    finally { setLoading(false); }
  }

  function updateData(result) {
    if (result && result.list) {
      setData({ list: result.list, byName: result.byName || {} });
    } else {
      fetchData();
    }
  }

  // === 館別 CRUD ===
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
      if (res.ok) {
        updateData(result);
        setNewBuilding('');
        showToast(`館別「${newBuilding.trim()}」已新增`);
      } else {
        showToast(result.error?.message || '新增失敗', 'error');
      }
    } catch { showToast('新增失敗', 'error'); }
    setSaving(false);
  }

  async function deleteBuilding(name) {
    if (!confirm(`確定刪除館別「${name}」？其下所有部門和倉庫也會一併刪除。`)) return;
    setSaving(true);
    try {
      const res = await fetch('/api/warehouse-departments', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'deleteWarehouse', name }),
      });
      const result = await res.json();
      if (res.ok) {
        updateData(result);
        showToast(`館別「${name}」已刪除`);
      } else {
        showToast(result.error?.message || '刪除失敗', 'error');
      }
    } catch { showToast('刪除失敗', 'error'); }
    setSaving(false);
  }

  // === 部門 CRUD ===
  async function addDepartment() {
    if (!selectedBuildingForDept) { showToast('請先選擇館別', 'error'); return; }
    if (!newDeptName.trim()) { showToast('請輸入部門名稱', 'error'); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/warehouse-departments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'addDepartment', warehouse: selectedBuildingForDept, name: newDeptName.trim() }),
      });
      const result = await res.json();
      if (res.ok) {
        updateData(result);
        setNewDeptName('');
        showToast(`部門「${newDeptName.trim()}」已新增`);
      } else {
        showToast(result.error?.message || '新增失敗', 'error');
      }
    } catch { showToast('新增失敗', 'error'); }
    setSaving(false);
  }

  async function deleteDepartment(warehouse, deptName) {
    if (!confirm(`確定刪除部門「${deptName}」？`)) return;
    try {
      const res = await fetch('/api/warehouse-departments', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'deleteDepartment', warehouse, name: deptName }),
      });
      const result = await res.json();
      if (res.ok) {
        updateData(result);
        showToast(`部門「${deptName}」已刪除`);
      } else {
        showToast(result.error?.message || '刪除失敗', 'error');
      }
    } catch { showToast('刪除失敗', 'error'); }
  }

  // === 倉庫位置 CRUD ===
  async function addStorageLocation() {
    if (!selectedBuildingForStorage) { showToast('請先選擇館別', 'error'); return; }
    if (!newStorageName.trim()) { showToast('請輸入倉庫名稱', 'error'); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/warehouse-departments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'addStorageLocation', buildingId: parseInt(selectedBuildingForStorage), name: newStorageName.trim() }),
      });
      const result = await res.json();
      if (res.ok) {
        updateData(result);
        setNewStorageName('');
        showToast(`倉庫「${newStorageName.trim()}」已新增`);
      } else {
        showToast(result.error?.message || '新增失敗', 'error');
      }
    } catch { showToast('新增失敗', 'error'); }
    setSaving(false);
  }

  async function deleteStorageLocation(id, name) {
    if (!confirm(`確定刪除倉庫「${name}」？`)) return;
    try {
      const res = await fetch('/api/warehouse-departments', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'deleteStorageLocation', id }),
      });
      const result = await res.json();
      if (res.ok) {
        updateData(result);
        showToast(`倉庫「${name}」已刪除`);
      } else {
        showToast(result.error?.message || '刪除失敗', 'error');
      }
    } catch { showToast('刪除失敗', 'error'); }
  }

  const list = data.list;
  const byName = data.byName;
  const buildings = list.filter(x => x.type === 'building' && !x.parentId);

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />
      <main className="max-w-4xl mx-auto px-4 py-8">
        {/* Toast */}
        {toast && (
          <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg text-sm font-medium ${
            toast.type === 'error' ? 'bg-red-500 text-white' : 'bg-green-500 text-white'
          }`}>
            {toast.msg}
          </div>
        )}

        <h1 className="text-2xl font-bold text-gray-800 mb-6">館別 / 部門 / 倉庫 管理</h1>

        {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{error}</div>}

        {loading ? (
          <p className="text-gray-500 text-sm">載入中...</p>
        ) : (
          <div className="space-y-6">
            {/* ====== 1. 館別設定 ====== */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-700 mb-2">1. 館別設定</h2>
              <p className="text-sm text-gray-500 mb-4">館別指建築或據點（如麗格）。請先新增館別，再設定其下的部門與倉庫。</p>
              <div className="flex gap-3 mb-4">
                <input
                  type="text"
                  value={newBuilding}
                  onChange={e => setNewBuilding(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addBuilding()}
                  placeholder="館別名稱，例如：麗格"
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-400 focus:border-blue-400 text-sm"
                />
                <button
                  onClick={addBuilding}
                  disabled={saving || !newBuilding.trim()}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm font-medium"
                >
                  新增館別
                </button>
              </div>
              {buildings.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">尚無館別，請先新增</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {buildings.map(b => (
                    <span key={b.id} className="inline-flex items-center gap-1 px-3 py-1.5 bg-blue-50 text-blue-700 rounded-full text-sm font-medium">
                      {b.name}
                      <button onClick={() => deleteBuilding(b.name)} className="ml-1 text-blue-400 hover:text-red-500 leading-none" title="刪除館別">×</button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* ====== 2. 部門設定 ====== */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-700 mb-2">2. 部門設定</h2>
              <p className="text-sm text-gray-500 mb-4">選擇館別後，新增該館別下的部門（如行政部、管理部、房務部）。</p>
              <div className="flex gap-3 mb-4 flex-wrap items-center">
                <select
                  value={selectedBuildingForDept}
                  onChange={e => setSelectedBuildingForDept(e.target.value)}
                  className="w-48 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-400 text-sm"
                >
                  <option value="">選擇館別</option>
                  {buildings.map(b => <option key={b.id} value={b.name}>{b.name}</option>)}
                </select>
                <input
                  type="text"
                  value={newDeptName}
                  onChange={e => setNewDeptName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addDepartment()}
                  placeholder="部門名稱，例如：行政部"
                  className="flex-1 min-w-[160px] px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-400 text-sm"
                />
                <button
                  onClick={addDepartment}
                  disabled={saving || !selectedBuildingForDept || !newDeptName.trim()}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm font-medium"
                >
                  新增部門
                </button>
              </div>
              {buildings.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">請先新增館別</p>
              ) : (
                <div className="space-y-3">
                  {buildings.map(b => (
                    <div key={b.id} className="border border-gray-200 rounded-lg overflow-hidden">
                      <div className="px-4 py-2 bg-gray-50">
                        <span className="font-medium text-gray-700 text-sm">{b.name}</span>
                      </div>
                      <div className="px-4 py-3">
                        {(!byName[b.name] || byName[b.name].length === 0) ? (
                          <p className="text-sm text-gray-400">尚無部門</p>
                        ) : (
                          <div className="flex flex-wrap gap-2">
                            {byName[b.name].map(dept => (
                              <span key={dept} className="inline-flex items-center gap-1 px-3 py-1 bg-purple-50 text-purple-700 rounded-full text-sm">
                                {dept}
                                <button onClick={() => deleteDepartment(b.name, dept)} className="ml-1 text-purple-400 hover:text-red-500 leading-none" title="刪除部門">×</button>
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ====== 3. 倉庫設定 ====== */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-700 mb-2">3. 倉庫設定</h2>
              <p className="text-sm text-gray-500 mb-4">選擇館別後，新增該館別下的倉庫位置（如地下室、備品室、2F倉庫、小倉庫）。</p>
              <div className="flex gap-3 mb-4 flex-wrap items-center">
                <select
                  value={selectedBuildingForStorage}
                  onChange={e => setSelectedBuildingForStorage(e.target.value)}
                  className="w-48 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-400 text-sm"
                >
                  <option value="">選擇館別</option>
                  {buildings.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
                <input
                  type="text"
                  value={newStorageName}
                  onChange={e => setNewStorageName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addStorageLocation()}
                  placeholder="倉庫名稱，例如：地下室"
                  className="flex-1 min-w-[160px] px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-400 text-sm"
                />
                <button
                  onClick={addStorageLocation}
                  disabled={saving || !selectedBuildingForStorage || !newStorageName.trim()}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm font-medium"
                >
                  新增倉庫
                </button>
              </div>
              {buildings.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">請先新增館別</p>
              ) : (
                <div className="space-y-3">
                  {buildings.map(b => {
                    const storageLocations = list.filter(x => x.type === 'storage' && x.parentId === b.id);
                    return (
                      <div key={b.id} className="border border-gray-200 rounded-lg overflow-hidden">
                        <div className="px-4 py-2 bg-gray-50">
                          <span className="font-medium text-gray-700 text-sm">{b.name}</span>
                        </div>
                        <div className="px-4 py-3">
                          {storageLocations.length === 0 ? (
                            <p className="text-sm text-gray-400">尚無倉庫位置</p>
                          ) : (
                            <div className="flex flex-wrap gap-2">
                              {storageLocations.map(loc => (
                                <span key={loc.id} className="inline-flex items-center gap-1 px-3 py-1 bg-green-50 text-green-700 rounded-full text-sm">
                                  {loc.name}
                                  <button onClick={() => deleteStorageLocation(loc.id, loc.name)} className="ml-1 text-green-400 hover:text-red-500 leading-none" title="刪除倉庫">×</button>
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* 範例提示 */}
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <p className="text-sm text-amber-800 font-medium mb-1">設定範例：</p>
              <ul className="text-sm text-amber-700 list-disc list-inside space-y-1">
                <li>館別：麗格</li>
                <li>部門：行政部、管理部、房務部</li>
                <li>倉庫：地下室、備品室、2F倉庫、小倉庫</li>
              </ul>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
