'use client';

import { useState, useEffect, useMemo } from 'react';
import { useSession } from 'next-auth/react';
import Navigation from '@/components/Navigation';

export default function MasterDataGovernancePage() {
  const { data: session } = useSession();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({ warehouse: [], supplier: [], masterWarehouses: [], masterSuppliers: [] });
  const [activeTab, setActiveTab] = useState('warehouse');
  const [renaming, setRenaming] = useState(null); // { type, oldName }
  const [newName, setNewName] = useState('');
  const [processing, setProcessing] = useState(false);
  const [toast, setToast] = useState(null);

  useEffect(() => { fetchData(); }, []);

  async function fetchData() {
    setLoading(true);
    try {
      const res = await fetch('/api/settings/master-data/normalize');
      const json = await res.json();
      setData(json);
    } catch { /* ignore */ }
    setLoading(false);
  }

  function showToast(msg, type = 'success') {
    setToast({ message: msg, type });
    setTimeout(() => setToast(null), 4000);
  }

  async function handleRename() {
    if (!renaming || !newName.trim()) return;
    setProcessing(true);
    try {
      const res = await fetch('/api/settings/master-data/normalize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: renaming.type, oldName: renaming.oldName, newName: newName.trim() }),
      });
      const result = await res.json();
      if (res.ok) {
        showToast(result.message);
        setRenaming(null);
        setNewName('');
        fetchData();
      } else {
        showToast(result.error?.message || '更名失敗', 'error');
      }
    } catch (err) { showToast('更名失敗: ' + err.message, 'error'); }
    setProcessing(false);
  }

  const warehouseStats = useMemo(() => {
    const total = data.warehouse.length;
    const orphan = data.warehouse.filter(w => !w.inMaster).length;
    const totalRecords = data.warehouse.reduce((s, w) => s + w.totalCount, 0);
    return { total, orphan, totalRecords };
  }, [data.warehouse]);

  const supplierStats = useMemo(() => {
    const total = data.supplier.length;
    const orphan = data.supplier.filter(s => !s.inMaster).length;
    const totalRecords = data.supplier.reduce((s, v) => s + v.totalCount, 0);
    return { total, orphan, totalRecords };
  }, [data.supplier]);

  const thStyle = { padding: '10px 14px', textAlign: 'left', borderBottom: '2px solid #e5e7eb', fontSize: 13, fontWeight: 600, color: '#374151', whiteSpace: 'nowrap' };
  const tdStyle = { padding: '10px 14px', borderBottom: '1px solid #f3f4f6', fontSize: 14 };

  if (loading) return (
    <>
      <Navigation borderColor="border-gray-500" />
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: 24, textAlign: 'center', paddingTop: 80, color: '#6b7280' }}>掃描中...</div>
    </>
  );

  const currentList = activeTab === 'warehouse' ? data.warehouse : data.supplier;
  const masterNames = activeTab === 'warehouse' ? data.masterWarehouses : data.masterSuppliers.map(s => s.name);

  return (
    <>
      <Navigation borderColor="border-gray-500" />
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: 24 }}>
        {toast && (
          <div style={{ position: 'fixed', top: 16, right: 16, zIndex: 1000, padding: '12px 20px', borderRadius: 8,
            background: toast.type === 'error' ? '#ef4444' : '#374151', color: '#fff', fontSize: 14, fontWeight: 500, boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}>
            {toast.message}
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <a href="/settings" style={{ fontSize: 14, color: '#6b7280', textDecoration: 'none' }}>&larr; 系統設定</a>
          <h2 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>主檔治理 — 資料一致性檢查</h2>
        </div>

        {/* KPI */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
          <div style={{ background: '#f0fdf4', borderRadius: 8, padding: 16 }}>
            <div style={{ fontSize: 12, color: '#065f46' }}>主檔館別</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: '#065f46' }}>{data.masterWarehouses.length}</div>
          </div>
          <div style={{ background: warehouseStats.orphan > 0 ? '#fef2f2' : '#f0fdf4', borderRadius: 8, padding: 16 }}>
            <div style={{ fontSize: 12, color: warehouseStats.orphan > 0 ? '#991b1b' : '#065f46' }}>館別不一致</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: warehouseStats.orphan > 0 ? '#dc2626' : '#065f46' }}>{warehouseStats.orphan}</div>
          </div>
          <div style={{ background: '#f0fdf4', borderRadius: 8, padding: 16 }}>
            <div style={{ fontSize: 12, color: '#065f46' }}>主檔供應商</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: '#065f46' }}>{data.masterSuppliers.length}</div>
          </div>
          <div style={{ background: supplierStats.orphan > 0 ? '#fef2f2' : '#f0fdf4', borderRadius: 8, padding: 16 }}>
            <div style={{ fontSize: 12, color: supplierStats.orphan > 0 ? '#991b1b' : '#065f46' }}>供應商不一致</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: supplierStats.orphan > 0 ? '#dc2626' : '#065f46' }}>{supplierStats.orphan}</div>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 0, borderBottom: '2px solid #e5e7eb', marginBottom: 16 }}>
          {[
            { key: 'warehouse', label: `館別 (${data.warehouse.length} 個值)` },
            { key: 'supplier', label: `供應商 (${data.supplier.length} 個值)` },
          ].map(tab => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)} style={{
              padding: '10px 20px', border: 'none', borderBottom: activeTab === tab.key ? '3px solid #374151' : '3px solid transparent',
              background: 'none', fontSize: 15, fontWeight: activeTab === tab.key ? 600 : 400,
              color: activeTab === tab.key ? '#374151' : '#6b7280', cursor: 'pointer',
            }}>
              {tab.label}
            </button>
          ))}
          <div style={{ marginLeft: 'auto', alignSelf: 'center' }}>
            <button onClick={fetchData} style={{ padding: '6px 14px', background: '#fff', border: '1px solid #d1d5db', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}>
              重新掃描
            </button>
          </div>
        </div>

        {/* Legend */}
        <div style={{ display: 'flex', gap: 16, marginBottom: 12, fontSize: 13, color: '#6b7280' }}>
          <span><span style={{ display: 'inline-block', width: 12, height: 12, background: '#d1fae5', borderRadius: 3, marginRight: 4, verticalAlign: 'middle' }}></span>已在主檔</span>
          <span><span style={{ display: 'inline-block', width: 12, height: 12, background: '#fee2e2', borderRadius: 3, marginRight: 4, verticalAlign: 'middle' }}></span>不在主檔 (需修正)</span>
          <span style={{ marginLeft: 'auto' }}>主檔{activeTab === 'warehouse' ? '館別' : '供應商'}：{masterNames.join('、') || '(空)'}</span>
        </div>

        {/* Table */}
        {currentList.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#9ca3af' }}>所有資料皆一致，無需修正</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f9fafb' }}>
                <th style={thStyle}>狀態</th>
                <th style={thStyle}>名稱</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>筆數</th>
                <th style={thStyle}>出現在哪些表</th>
                <th style={thStyle}>操作</th>
              </tr>
            </thead>
            <tbody>
              {currentList.map((item, i) => (
                <tr key={i} style={{ background: item.inMaster ? undefined : '#fef2f2' }}>
                  <td style={tdStyle}>
                    <span style={{
                      padding: '2px 8px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                      background: item.inMaster ? '#d1fae5' : '#fee2e2',
                      color: item.inMaster ? '#065f46' : '#dc2626',
                    }}>
                      {item.inMaster ? '主檔' : '不一致'}
                    </span>
                  </td>
                  <td style={{ ...tdStyle, fontWeight: 600, fontFamily: 'monospace' }}>{item.name}</td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>{item.totalCount.toLocaleString()}</td>
                  <td style={tdStyle}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {item.tables.map((t, j) => (
                        <span key={j} style={{ padding: '1px 6px', background: '#f3f4f6', borderRadius: 4, fontSize: 12, whiteSpace: 'nowrap' }}>
                          {t.table} ({t.count})
                        </span>
                      ))}
                    </div>
                  </td>
                  <td style={tdStyle}>
                    <button
                      onClick={() => { setRenaming({ type: activeTab, oldName: item.name }); setNewName(item.inMaster ? item.name : ''); }}
                      style={{ padding: '4px 10px', fontSize: 13, background: item.inMaster ? '#f3f4f6' : '#fef3c7', border: '1px solid #d1d5db', borderRadius: 4, cursor: 'pointer', fontWeight: item.inMaster ? 400 : 600 }}
                    >
                      {item.inMaster ? '更名' : '修正'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Rename Modal */}
      {renaming && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#fff', padding: 24, borderRadius: 12, width: 480 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>
              {renaming.type === 'warehouse' ? '館別' : '供應商'}名稱修正
            </h3>
            <div style={{ background: '#fef2f2', padding: 12, borderRadius: 8, marginBottom: 16, fontSize: 14 }}>
              <strong>原名稱：</strong><code style={{ background: '#fee2e2', padding: '2px 6px', borderRadius: 4 }}>{renaming.oldName}</code>
              <div style={{ marginTop: 8, fontSize: 13, color: '#6b7280' }}>
                將批次更新所有表中的「{renaming.oldName}」為新名稱
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 13, color: '#6b7280', display: 'block', marginBottom: 4 }}>
                新名稱（選擇主檔或自行輸入）
              </label>
              <select
                value={newName}
                onChange={e => setNewName(e.target.value)}
                style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14, marginBottom: 8 }}
              >
                <option value="">-- 從主檔選擇 --</option>
                {masterNames.map(n => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
              <input
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="或手動輸入新名稱..."
                style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14, boxSizing: 'border-box' }}
              />
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => { setRenaming(null); setNewName(''); }} style={{ padding: '8px 20px', background: '#e5e7eb', color: '#374151', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 14 }}>取消</button>
              <button
                onClick={handleRename}
                disabled={processing || !newName.trim() || newName.trim() === renaming.oldName}
                style={{ padding: '8px 20px', background: processing ? '#9ca3af' : '#dc2626', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 14, fontWeight: 600 }}
              >
                {processing ? '處理中...' : `確認更名 (${renaming.oldName} → ${newName.trim()})`}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
