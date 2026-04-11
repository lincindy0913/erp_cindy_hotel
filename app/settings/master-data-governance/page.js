'use client';

import { useState, useEffect, useMemo } from 'react';
import { useSession } from 'next-auth/react';
import Navigation from '@/components/Navigation';

const TABS = [
  { key: 'warehouse',         label: '館別',   icon: '🏢' },
  { key: 'supplier',          label: '供應商', icon: '🏭' },
  { key: 'accountingSubject', label: '會計科目', icon: '📒' },
];

function healthColor(pct) {
  if (pct >= 95) return { bar: 'bg-emerald-500', text: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200' };
  if (pct >= 80) return { bar: 'bg-amber-400',   text: 'text-amber-700',   bg: 'bg-amber-50',   border: 'border-amber-200' };
  return            { bar: 'bg-red-500',          text: 'text-red-700',     bg: 'bg-red-50',     border: 'border-red-200' };
}

function calcHealth(list) {
  if (!list.length) return 100;
  const consistent = list.filter(i => i.inMaster).reduce((s, i) => s + i.totalCount, 0);
  const total = list.reduce((s, i) => s + i.totalCount, 0);
  return total === 0 ? 100 : Math.round((consistent / total) * 100);
}

export default function MasterDataGovernancePage() {
  useSession();

  const [loading, setLoading]     = useState(true);
  const [scanning, setScanning]   = useState(false);
  const [data, setData]           = useState({ warehouse: [], supplier: [], accountingSubject: [], masterWarehouses: [], masterSuppliers: [], masterSubjects: [] });
  const [activeTab, setActiveTab] = useState('warehouse');

  // rename modal
  const [renaming, setRenaming]   = useState(null); // { type, oldName, tables }
  const [newName, setNewName]     = useState('');
  const [processing, setProcessing] = useState(false);

  // batch fix
  const [batchMode, setBatchMode]       = useState(false);
  const [selected, setSelected]         = useState(new Set());
  const [batchFixing, setBatchFixing]   = useState(false);
  const [batchTarget, setBatchTarget]   = useState('');

  // filter
  const [search, setSearch]             = useState('');
  const [inconsistentOnly, setInconsistentOnly] = useState(false);

  // toast
  const [toast, setToast] = useState(null);

  useEffect(() => { fetchData(); }, []);

  async function fetchData() {
    setScanning(true); setLoading(true);
    try {
      const res  = await fetch('/api/settings/master-data/normalize');
      const json = await res.json();
      setData(json);
    } catch { showToast('掃描失敗，請重試', 'error'); }
    setScanning(false); setLoading(false);
    setSelected(new Set()); setBatchMode(false);
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
        setRenaming(null); setNewName('');
        fetchData();
      } else {
        showToast(result.error?.message || '更名失敗', 'error');
      }
    } catch (err) { showToast('更名失敗: ' + err.message, 'error'); }
    setProcessing(false);
  }

  async function handleBatchFix() {
    if (!batchTarget.trim() || selected.size === 0) return;
    setBatchFixing(true);
    let totalUpdated = 0;
    for (const oldName of selected) {
      try {
        const res = await fetch('/api/settings/master-data/normalize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: activeTab, oldName, newName: batchTarget.trim() }),
        });
        const result = await res.json();
        if (res.ok) totalUpdated += result.totalUpdated || 0;
      } catch { /* skip */ }
    }
    showToast(`批次修正完成，共更新 ${totalUpdated} 筆`);
    setBatchFixing(false); setBatchMode(false); setSelected(new Set()); setBatchTarget('');
    fetchData();
  }

  // ── Derived data ─────────────────────────────────────────────────
  const currentList = useMemo(() => {
    let list = data[activeTab] || [];
    if (inconsistentOnly) list = list.filter(i => !i.inMaster);
    if (search.trim()) list = list.filter(i => i.name.toLowerCase().includes(search.toLowerCase()));
    return list;
  }, [data, activeTab, search, inconsistentOnly]);

  const masterNames = useMemo(() => {
    if (activeTab === 'warehouse')         return data.masterWarehouses || [];
    if (activeTab === 'supplier')          return (data.masterSuppliers || []).map(s => s.name);
    if (activeTab === 'accountingSubject') return (data.masterSubjects || []).map(s => s.display);
    return [];
  }, [data, activeTab]);

  const tabStats = useMemo(() => TABS.map(tab => {
    const list    = data[tab.key] || [];
    const orphans = list.filter(i => !i.inMaster).length;
    const health  = calcHealth(list);
    return { ...tab, total: list.length, orphans, health };
  }), [data]);

  const inconsistentList = currentList.filter(i => !i.inMaster);

  if (loading) return (
    <>
      <Navigation borderColor="border-gray-500" />
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="flex items-center gap-3 text-gray-500">
          <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
          </svg>
          掃描資料一致性中...
        </div>
      </div>
    </>
  );

  return (
    <>
      <Navigation borderColor="border-gray-500" />

      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-5 py-3 rounded-xl shadow-lg text-sm font-medium text-white transition-all
          ${toast.type === 'error' ? 'bg-red-500' : 'bg-gray-800'}`}>
          {toast.message}
        </div>
      )}

      <div className="min-h-screen bg-gray-50">
        <div className="max-w-6xl mx-auto px-4 py-8">

          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <a href="/settings" className="text-sm text-gray-400 hover:text-gray-600 transition-colors">← 系統設定</a>
              <span className="text-gray-300">/</span>
              <h1 className="text-xl font-bold text-gray-900">主檔治理 — 資料一致性檢查</h1>
            </div>
            <button
              onClick={fetchData}
              disabled={scanning}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 shadow-sm disabled:opacity-50 transition-colors"
            >
              <svg className={`h-4 w-4 ${scanning ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              {scanning ? '掃描中...' : '重新掃描'}
            </button>
          </div>

          {/* Health Score Cards */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            {tabStats.map(tab => {
              const c = healthColor(tab.health);
              return (
                <button key={tab.key} onClick={() => { setActiveTab(tab.key); setSearch(''); setInconsistentOnly(false); }}
                  className={`bg-white rounded-xl border-2 p-4 text-left transition-all hover:shadow-md ${activeTab === tab.key ? 'border-gray-800 shadow-md' : 'border-transparent shadow-sm'}`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-base">{tab.icon}</span>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${c.bg} ${c.text} ${c.border} border`}>
                      {tab.health}%
                    </span>
                  </div>
                  <p className="text-sm font-semibold text-gray-800">{tab.label}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{tab.total} 個唯一值 · {tab.orphans > 0 ? <span className="text-red-500 font-medium">{tab.orphans} 不一致</span> : <span className="text-emerald-600">全部一致</span>}</p>
                  <div className="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className={`h-full ${c.bar} rounded-full transition-all`} style={{ width: `${tab.health}%` }} />
                  </div>
                </button>
              );
            })}
          </div>

          {/* Tab bar + filter bar */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden mb-4">
            {/* Tabs */}
            <div className="flex border-b border-gray-100">
              {TABS.map(tab => {
                const s = tabStats.find(t => t.key === tab.key);
                return (
                  <button key={tab.key} onClick={() => { setActiveTab(tab.key); setSearch(''); setInconsistentOnly(false); setBatchMode(false); setSelected(new Set()); }}
                    className={`flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
                      activeTab === tab.key ? 'border-gray-800 text-gray-900 bg-gray-50' : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                    }`}>
                    <span>{tab.icon}</span>
                    {tab.label}
                    {s?.orphans > 0 && (
                      <span className="ml-1 px-1.5 py-0.5 bg-red-100 text-red-600 text-xs rounded-full font-semibold">{s.orphans}</span>
                    )}
                  </button>
                );
              })}
              <div className="ml-auto flex items-center gap-2 px-4">
                <span className="text-xs text-gray-400">主檔：{masterNames.length} 筆</span>
              </div>
            </div>

            {/* Filter bar */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-50 bg-gray-50/50">
              <div className="relative flex-1 max-w-xs">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="搜尋名稱..."
                  className="pl-9 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-gray-400 bg-white"
                />
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={inconsistentOnly}
                  onChange={e => setInconsistentOnly(e.target.checked)}
                  className="rounded border-gray-300 text-red-500 focus:ring-red-400"
                />
                僅顯示不一致
              </label>
              <div className="flex items-center gap-1 ml-auto">
                {/* Legend */}
                <span className="flex items-center gap-1 text-xs text-gray-500 mr-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 inline-block"></span>主檔
                  <span className="w-2.5 h-2.5 rounded-full bg-red-400 inline-block ml-2"></span>不一致
                </span>
                {inconsistentList.length > 0 && (
                  <button
                    onClick={() => { setBatchMode(!batchMode); setSelected(new Set()); setBatchTarget(''); }}
                    className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-colors ${batchMode ? 'bg-gray-800 text-white' : 'bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100'}`}
                  >
                    {batchMode ? '取消批次' : '批次修正'}
                  </button>
                )}
              </div>
            </div>

            {/* Batch fix bar */}
            {batchMode && (
              <div className="flex items-center gap-3 px-4 py-3 bg-amber-50 border-b border-amber-100">
                <span className="text-sm text-amber-800 font-medium">已選 {selected.size} 項 → 統一更名為：</span>
                <select
                  value={batchTarget}
                  onChange={e => setBatchTarget(e.target.value)}
                  className="flex-1 max-w-xs px-3 py-1.5 text-sm border border-amber-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white"
                >
                  <option value="">-- 選擇目標主檔名稱 --</option>
                  {masterNames.map(n => <option key={n} value={n}>{n}</option>)}
                </select>
                <button
                  onClick={handleBatchFix}
                  disabled={batchFixing || selected.size === 0 || !batchTarget}
                  className="px-4 py-1.5 bg-red-600 text-white text-sm rounded-lg font-medium hover:bg-red-700 disabled:opacity-50 transition-colors"
                >
                  {batchFixing ? '修正中...' : `確認批次修正 (${selected.size} 筆)`}
                </button>
                <button
                  onClick={() => {
                    const orphanNames = inconsistentList.map(i => i.name);
                    setSelected(prev => {
                      if (prev.size === orphanNames.length) return new Set();
                      return new Set(orphanNames);
                    });
                  }}
                  className="text-xs text-amber-700 underline hover:text-amber-900"
                >
                  {selected.size === inconsistentList.length ? '取消全選' : '全選不一致'}
                </button>
              </div>
            )}

            {/* Table */}
            {currentList.length === 0 ? (
              <div className="text-center py-16 text-gray-400">
                <div className="text-4xl mb-3">✅</div>
                <p className="text-sm font-medium">{search || inconsistentOnly ? '無符合條件的結果' : '所有資料皆一致，無需修正'}</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      {batchMode && <th className="px-4 py-3 w-10"></th>}
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">狀態</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">名稱</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">筆數</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">出現在哪些表</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {currentList.map((item, i) => (
                      <tr key={i} className={`transition-colors ${item.inMaster ? 'hover:bg-gray-50' : 'bg-red-50/40 hover:bg-red-50'}`}>
                        {batchMode && (
                          <td className="px-4 py-3">
                            {!item.inMaster && (
                              <input
                                type="checkbox"
                                checked={selected.has(item.name)}
                                onChange={e => {
                                  const next = new Set(selected);
                                  e.target.checked ? next.add(item.name) : next.delete(item.name);
                                  setSelected(next);
                                }}
                                className="rounded border-gray-300 text-red-500 focus:ring-red-400"
                              />
                            )}
                          </td>
                        )}
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold
                            ${item.inMaster ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                            <span className={`w-1.5 h-1.5 rounded-full inline-block ${item.inMaster ? 'bg-emerald-500' : 'bg-red-500'}`}></span>
                            {item.inMaster ? '主檔' : '不一致'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="font-mono text-sm text-gray-900 bg-gray-100 px-2 py-0.5 rounded">{item.name}</span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className={`font-semibold text-sm ${item.inMaster ? 'text-gray-700' : 'text-red-600'}`}>
                            {item.totalCount.toLocaleString()}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1">
                            {item.tables.map((t, j) => (
                              <span key={j} className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs whitespace-nowrap">
                                {t.table} <span className="font-semibold">{t.count}</span>
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <button
                            onClick={() => { setRenaming({ type: activeTab, oldName: item.name, tables: item.tables }); setNewName(item.inMaster ? item.name : ''); }}
                            className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-colors border ${
                              item.inMaster
                                ? 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                                : 'bg-white border-red-200 text-red-600 hover:bg-red-50 font-semibold'
                            }`}
                          >
                            {item.inMaster ? '更名' : '修正'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* Footer summary */}
                <div className="px-4 py-3 bg-gray-50 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
                  <span>顯示 {currentList.length} 筆 · 不一致 {currentList.filter(i => !i.inMaster).length} 筆</span>
                  <span>主檔{TABS.find(t => t.key === activeTab)?.label}：{masterNames.join('、') || '(空)'}</span>
                </div>
              </div>
            )}
          </div>

          {/* Explainer card */}
          <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-sm text-blue-800">
            <p className="font-semibold mb-1">什麼是「主檔治理」？</p>
            <p className="text-xs text-blue-600 leading-relaxed">
              系統中許多欄位（館別、供應商名稱、會計科目）以純文字儲存，長期下來可能出現拼字差異（如「麗格」vs「麗格館」）。
              本頁面掃描所有相關資料表，找出與主檔不符的值，並提供一鍵批次更名，確保報表、月結、篩選結果正確。
            </p>
          </div>
        </div>
      </div>

      {/* ── Rename / Fix Modal ─────────────────────────────────────── */}
      {renaming && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => { setRenaming(null); setNewName(''); }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden" onClick={e => e.stopPropagation()}>
            {/* Modal header */}
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-bold text-gray-900 text-base">
                {TABS.find(t => t.key === renaming.type)?.label} 名稱修正
              </h3>
              <button onClick={() => { setRenaming(null); setNewName(''); }} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
            </div>

            <div className="px-6 py-5 space-y-4">
              {/* Old name */}
              <div className="flex items-start gap-3 bg-red-50 border border-red-100 rounded-xl p-4">
                <span className="text-red-400 text-lg mt-0.5">⚠</span>
                <div>
                  <p className="text-xs text-red-500 font-medium mb-1">原始名稱（將被替換）</p>
                  <code className="text-sm font-mono bg-red-100 text-red-800 px-2 py-0.5 rounded">{renaming.oldName}</code>
                </div>
              </div>

              {/* Affected tables */}
              <div>
                <p className="text-xs font-semibold text-gray-500 mb-2">影響範圍</p>
                <div className="flex flex-wrap gap-1.5">
                  {renaming.tables.map((t, i) => (
                    <span key={i} className="flex items-center gap-1 px-2.5 py-1 bg-gray-100 text-gray-700 rounded-lg text-xs">
                      {t.table}
                      <span className="bg-gray-300 text-gray-700 px-1.5 py-0.5 rounded-full text-xs font-semibold">{t.count}</span>
                    </span>
                  ))}
                </div>
                <p className="text-xs text-gray-400 mt-2">
                  共 <span className="font-semibold text-gray-700">{renaming.tables.reduce((s, t) => s + t.count, 0)}</span> 筆紀錄將被更新
                </p>
              </div>

              {/* New name — select from master */}
              <div>
                <p className="text-xs font-semibold text-gray-500 mb-2">新名稱（選擇主檔）</p>
                <select
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
                >
                  <option value="">-- 從主檔選擇 --</option>
                  {masterNames.map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>

              {/* Or type manually */}
              <div>
                <p className="text-xs font-semibold text-gray-500 mb-2">或手動輸入</p>
                <input
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  placeholder="輸入新名稱..."
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
                />
              </div>

              {/* Preview */}
              {newName.trim() && newName.trim() !== renaming.oldName && (
                <div className="flex items-center gap-2 text-sm bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3">
                  <code className="font-mono text-red-600 bg-red-100 px-2 py-0.5 rounded">{renaming.oldName}</code>
                  <span className="text-gray-400">→</span>
                  <code className="font-mono text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded">{newName.trim()}</code>
                </div>
              )}
            </div>

            {/* Modal footer */}
            <div className="px-6 py-4 border-t border-gray-100 flex gap-3 justify-end">
              <button
                onClick={() => { setRenaming(null); setNewName(''); }}
                className="px-4 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleRename}
                disabled={processing || !newName.trim() || newName.trim() === renaming.oldName}
                className="px-5 py-2 text-sm bg-red-600 text-white rounded-lg font-semibold hover:bg-red-700 disabled:opacity-40 transition-colors"
              >
                {processing ? '更新中...' : '確認更名'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
