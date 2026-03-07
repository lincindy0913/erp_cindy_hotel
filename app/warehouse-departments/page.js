'use client';

import { useState, useEffect } from 'react';
import Navigation from '@/components/Navigation';

export default function WarehouseDepartmentsPage() {
  const [data, setData] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [newWarehouse, setNewWarehouse] = useState('');
  const [newDept, setNewDept] = useState({ warehouse: '', name: '' });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => { fetchData(); }, []);

  async function fetchData() {
    setLoading(true);
    try {
      const res = await fetch('/api/warehouse-departments');
      if (res.ok) setData(await res.json());
      else setError('載入失敗');
    } catch { setError('網路錯誤'); }
    finally { setLoading(false); }
  }

  function showSuccess(msg) {
    setSuccess(msg);
    setTimeout(() => setSuccess(''), 3000);
  }

  async function addWarehouse() {
    if (!newWarehouse.trim()) return;
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch('/api/warehouse-departments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'addWarehouse', name: newWarehouse.trim() }),
      });
      const result = await res.json();
      if (res.ok) { setData(result); setNewWarehouse(''); showSuccess(`館別「${newWarehouse.trim()}」已新增`); }
      else setError(result.error?.message || '新增失敗');
    } catch { setError('網路錯誤'); }
    finally { setSubmitting(false); }
  }

  async function addDepartment() {
    if (!newDept.warehouse || !newDept.name.trim()) return;
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch('/api/warehouse-departments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'addDepartment', warehouse: newDept.warehouse, name: newDept.name.trim() }),
      });
      const result = await res.json();
      if (res.ok) { setData(result); setNewDept(prev => ({ ...prev, name: '' })); showSuccess(`部門「${newDept.name.trim()}」已新增`); }
      else setError(result.error?.message || '新增失敗');
    } catch { setError('網路錯誤'); }
    finally { setSubmitting(false); }
  }

  async function deleteWarehouse(name) {
    if (!confirm(`確定刪除館別「${name}」？底下的部門也會一併刪除。`)) return;
    setError('');
    try {
      const res = await fetch('/api/warehouse-departments', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'deleteWarehouse', name }),
      });
      const result = await res.json();
      if (res.ok) { setData(result); showSuccess(`館別「${name}」已刪除`); }
      else setError(result.error?.message || '刪除失敗');
    } catch { setError('網路錯誤'); }
  }

  async function deleteDepartment(warehouse, name) {
    if (!confirm(`確定刪除部門「${name}」？`)) return;
    setError('');
    try {
      const res = await fetch('/api/warehouse-departments', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'deleteDepartment', warehouse, name }),
      });
      const result = await res.json();
      if (res.ok) { setData(result); showSuccess(`部門「${name}」已刪除`); }
      else setError(result.error?.message || '刪除失敗');
    } catch { setError('網路錯誤'); }
  }

  const warehouses = Object.keys(data);

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />
      <main className="max-w-4xl mx-auto px-4 py-8">
        <div className="flex items-center gap-3 mb-6">
          <a href="/settings" className="text-sm text-gray-500 hover:text-gray-700">← 系統設定</a>
          <span className="text-gray-300">/</span>
          <h1 className="text-2xl font-bold text-gray-800">館別 / 部門管理</h1>
        </div>

        {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{error}</div>}
        {success && <div className="mb-4 p-3 bg-green-50 border border-green-200 text-green-700 rounded-lg text-sm">{success}</div>}

        {/* 新增館別 */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">新增館別</h2>
          <div className="flex gap-3">
            <input
              type="text"
              value={newWarehouse}
              onChange={e => setNewWarehouse(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addWarehouse()}
              placeholder="例如：麗格、麗軒、民宿"
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={addWarehouse}
              disabled={submitting || !newWarehouse.trim()}
              className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              新增館別
            </button>
          </div>
        </div>

        {/* 新增部門 */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">新增部門</h2>
          <div className="flex gap-3">
            <select
              value={newDept.warehouse}
              onChange={e => setNewDept(prev => ({ ...prev, warehouse: e.target.value }))}
              className="w-40 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">選擇館別</option>
              {warehouses.map(w => <option key={w} value={w}>{w}</option>)}
            </select>
            <input
              type="text"
              value={newDept.name}
              onChange={e => setNewDept(prev => ({ ...prev, name: e.target.value }))}
              onKeyDown={e => e.key === 'Enter' && addDepartment()}
              placeholder="部門名稱，例如：總務部"
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={addDepartment}
              disabled={submitting || !newDept.warehouse || !newDept.name.trim()}
              className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              新增部門
            </button>
          </div>
        </div>

        {/* 館別列表 */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <h2 className="text-lg font-semibold mb-4">現有館別與部門</h2>
          {loading ? (
            <p className="text-gray-500 text-sm">載入中...</p>
          ) : warehouses.length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-8">尚無館別，請先新增館別</p>
          ) : (
            <div className="space-y-4">
              {warehouses.map(warehouse => (
                <div key={warehouse} className="border border-gray-200 rounded-lg overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 bg-gray-50">
                    <span className="font-medium text-gray-800">{warehouse}</span>
                    <button
                      onClick={() => deleteWarehouse(warehouse)}
                      className="text-xs text-red-500 hover:text-red-700 hover:underline"
                    >
                      刪除館別
                    </button>
                  </div>
                  <div className="px-4 py-3">
                    {data[warehouse].length === 0 ? (
                      <p className="text-gray-400 text-sm">尚無部門</p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {data[warehouse].map(dept => (
                          <span key={dept} className="inline-flex items-center gap-1 px-3 py-1 bg-blue-50 text-blue-700 rounded-full text-sm">
                            {dept}
                            <button
                              onClick={() => deleteDepartment(warehouse, dept)}
                              className="ml-1 text-blue-400 hover:text-red-500 leading-none"
                              title="刪除部門"
                            >
                              ×
                            </button>
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
      </main>
    </div>
  );
}
