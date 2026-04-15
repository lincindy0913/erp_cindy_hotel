'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import Navigation from '@/components/Navigation';
import { useToast } from '@/context/ToastContext';
import ExportButtons from '@/components/ExportButtons';

const NT = v => `NT$ ${Number(v || 0).toLocaleString()}`;

const TABS = [
  { key: 'monthly',  label: '月結登記' },
  { key: 'yearly',   label: '年度彙整' },
  { key: 'companies',label: '公司管理' },
];

const EXPORT_COLS = [
  { header: '公司名稱', key: 'companyName' },
  { header: '統編',     key: 'taxId' },
  { header: '金額',     key: 'totalAmount', format: 'number' },
  { header: '張數',     key: 'invoiceCount', format: 'number' },
  { header: '狀態',     key: 'status' },
  { header: '備註',     key: 'note' },
];

export default function OwnerExpensesPage() {
  useSession();
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState('monthly');

  // ── 月結 state ────────────────────────────────────────────────
  const [month,        setMonth]        = useState(() => new Date().toISOString().slice(0, 7));
  const [monthData,    setMonthData]    = useState(null);
  const [monthLoading, setMonthLoading] = useState(false);
  // 行內編輯暫存 { companyId: { totalAmount, invoiceCount, note } }
  const [editMap,      setEditMap]      = useState({});
  const [saving,       setSaving]       = useState(new Set());

  // ── 年度 state ────────────────────────────────────────────────
  const [year,        setYear]        = useState(() => new Date().getFullYear().toString());
  const [yearData,    setYearData]    = useState(null);
  const [yearLoading, setYearLoading] = useState(false);

  // ── 公司管理 state ────────────────────────────────────────────
  const [companies,    setCompanies]    = useState([]);
  const [compLoading,  setCompLoading]  = useState(false);
  const [showAddForm,  setShowAddForm]  = useState(false);
  const [newComp,      setNewComp]      = useState({ companyName: '', taxId: '', note: '' });
  const [compSaving,   setCompSaving]   = useState(false);
  const [editCompId,   setEditCompId]   = useState(null);
  const [editCompData, setEditCompData] = useState({});

  // ── Fetch ─────────────────────────────────────────────────────
  const fetchMonth = useCallback(async () => {
    setMonthLoading(true);
    try {
      const res = await fetch(`/api/owner-expenses?month=${month}`);
      if (!res.ok) { showToast('載入月份資料失敗', 'error'); return; }
      const data = await res.json();
      setMonthData(data);
      // 初始化 editMap
      const map = {};
      for (const r of data.rows) {
        map[r.companyId] = {
          totalAmount:  r.totalAmount  || '',
          invoiceCount: r.invoiceCount || '',
          note:         r.note         || '',
        };
      }
      setEditMap(map);
    } catch { showToast('載入月份資料失敗', 'error'); }
    finally { setMonthLoading(false); }
  }, [month]);

  const fetchYear = useCallback(async () => {
    setYearLoading(true);
    try {
      const res = await fetch(`/api/owner-expenses?year=${year}`);
      if (!res.ok) { showToast('載入年度資料失敗', 'error'); return; }
      setYearData(await res.json());
    } catch { showToast('載入年度資料失敗', 'error'); }
    finally { setYearLoading(false); }
  }, [year]);

  const fetchCompanies = useCallback(async () => {
    setCompLoading(true);
    try {
      const res = await fetch('/api/owner-companies');
      if (!res.ok) { showToast('載入公司清單失敗', 'error'); return; }
      setCompanies(await res.json());
    } catch { showToast('載入公司清單失敗', 'error'); }
    finally { setCompLoading(false); }
  }, []);

  useEffect(() => {
    if (activeTab === 'monthly')   fetchMonth();
    if (activeTab === 'yearly')    fetchYear();
    if (activeTab === 'companies') fetchCompanies();
  }, [activeTab]);

  useEffect(() => { if (activeTab === 'monthly')  fetchMonth(); },  [month]);
  useEffect(() => { if (activeTab === 'yearly')   fetchYear(); },   [year]);

  // ── 儲存單行 ──────────────────────────────────────────────────
  async function saveRow(row) {
    const vals = editMap[row.companyId] || {};
    if (!vals.totalAmount && vals.totalAmount !== 0) return;
    setSaving(prev => new Set([...prev, row.companyId]));
    try {
      const method = row.expenseId ? 'PATCH' : 'POST';
      const url    = row.expenseId ? `/api/owner-expenses/${row.expenseId}` : '/api/owner-expenses';
      const body   = row.expenseId
        ? { totalAmount: vals.totalAmount, invoiceCount: vals.invoiceCount || 1, note: vals.note }
        : { expenseMonth: month, companyId: row.companyId, totalAmount: vals.totalAmount, invoiceCount: vals.invoiceCount || 1, note: vals.note };
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) { showToast('儲存失敗', 'error'); return; }
      showToast(`${row.companyName} 已儲存`, 'success');
      fetchMonth();
    } catch { showToast('儲存失敗', 'error'); }
    finally { setSaving(prev => { const n = new Set(prev); n.delete(row.companyId); return n; }); }
  }

  // ── 全部儲存 ──────────────────────────────────────────────────
  async function saveAll() {
    if (!monthData) return;
    setSaving(new Set(monthData.rows.map(r => r.companyId)));
    let count = 0;
    try {
      for (const row of monthData.rows) {
        const vals = editMap[row.companyId] || {};
        if (!vals.totalAmount && vals.totalAmount !== '0') continue;
        const method = row.expenseId ? 'PATCH' : 'POST';
        const url    = row.expenseId ? `/api/owner-expenses/${row.expenseId}` : '/api/owner-expenses';
        const body   = row.expenseId
          ? { totalAmount: vals.totalAmount, invoiceCount: vals.invoiceCount || 1, note: vals.note }
          : { expenseMonth: month, companyId: row.companyId, totalAmount: vals.totalAmount, invoiceCount: vals.invoiceCount || 1, note: vals.note };
        const res = await fetch(url, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (res.ok) count++;
      }
      showToast(`已儲存 ${count} 筆`, 'success');
      fetchMonth();
    } catch { showToast('批次儲存發生錯誤', 'error'); }
    finally { setSaving(new Set()); }
  }

  // ── 確認/取消確認 ─────────────────────────────────────────────
  async function toggleConfirm(row) {
    if (!row.expenseId) { showToast('請先儲存金額', 'error'); return; }
    const newStatus = row.status === '已確認' ? '待確認' : '已確認';
    const res = await fetch(`/api/owner-expenses/${row.expenseId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    });
    if (!res.ok) { showToast('更新狀態失敗', 'error'); return; }
    showToast(newStatus === '已確認' ? '已確認' : '已取消確認', 'success');
    fetchMonth();
  }

  // ── 新增公司 ──────────────────────────────────────────────────
  async function handleAddCompany() {
    if (!newComp.companyName || !newComp.taxId) { showToast('請填寫公司名稱與統編', 'error'); return; }
    setCompSaving(true);
    try {
      const res = await fetch('/api/owner-companies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newComp),
      });
      const d = await res.json();
      if (!res.ok) { showToast(d.message || '新增失敗', 'error'); return; }
      showToast('公司已新增', 'success');
      setNewComp({ companyName: '', taxId: '', note: '' });
      setShowAddForm(false);
      fetchCompanies();
    } catch { showToast('新增失敗', 'error'); }
    finally { setCompSaving(false); }
  }

  // ── 編輯公司儲存 ──────────────────────────────────────────────
  async function handleUpdateCompany(id) {
    const res = await fetch(`/api/owner-companies/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editCompData),
    });
    if (!res.ok) { showToast('更新失敗', 'error'); return; }
    showToast('已更新', 'success');
    setEditCompId(null);
    fetchCompanies();
  }

  // ── 停用公司 ──────────────────────────────────────────────────
  async function handleDeactivate(id, name) {
    if (!confirm(`確定停用「${name}」？歷史記錄不受影響。`)) return;
    const res = await fetch(`/api/owner-companies/${id}`, { method: 'DELETE' });
    if (!res.ok) { showToast('停用失敗', 'error'); return; }
    showToast('已停用', 'success');
    fetchCompanies();
  }

  const inputCls = 'border rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-indigo-400 outline-none';
  const btnCls   = 'px-3 py-1.5 text-sm rounded-lg border hover:bg-gray-50 transition-colors';

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation borderColor="border-purple-500" />

      <main className="max-w-6xl mx-auto px-4 py-8">
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-gray-900">業主往來</h2>
          <p className="text-sm text-gray-500 mt-1">老闆旗下各公司月底私用發票彙整</p>
        </div>

        {/* Tab bar */}
        <div className="flex gap-1 mb-6 bg-white rounded-xl shadow-sm border border-gray-100 p-1 w-fit">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setActiveTab(t.key)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                activeTab === t.key ? 'bg-purple-600 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-50'
              }`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* ══ Tab: 月結登記 ══ */}
        {activeTab === 'monthly' && (
          <div>
            {/* 篩選列 */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-4 flex flex-wrap gap-3 items-end">
              <div>
                <label className="block text-xs text-gray-500 mb-1">月份</label>
                <input type="month" value={month} onChange={e => setMonth(e.target.value)} className={inputCls} />
              </div>
              <button onClick={fetchMonth} className={`${btnCls} bg-purple-50 text-purple-700`}>查詢</button>
              {monthData && (
                <>
                  <button onClick={saveAll}
                    className="px-4 py-1.5 text-sm rounded-lg bg-purple-600 text-white hover:bg-purple-700 transition-colors">
                    全部儲存
                  </button>
                  <div className="ml-auto flex items-end gap-2">
                    <ExportButtons
                      data={monthData.rows.map(r => ({ ...r, ...editMap[r.companyId] }))}
                      columns={EXPORT_COLS}
                      filename={`業主往來_${month}`}
                      title={`業主往來 ${month}`}
                    />
                  </div>
                </>
              )}
            </div>

            {/* 摘要卡 */}
            {monthData && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                {[
                  { label: '本月合計',   val: NT(monthData.monthTotal),           color: 'text-purple-700 font-bold' },
                  { label: '公司數',     val: `${monthData.rows.length} 間`,       color: 'text-gray-700' },
                  { label: '已確認',     val: `${monthData.confirmedCount} 間`,    color: 'text-green-600' },
                  { label: '待確認',     val: `${monthData.rows.filter(r => r.totalAmount > 0 && r.status !== '已確認').length} 間`, color: 'text-amber-600' },
                ].map(c => (
                  <div key={c.label} className="bg-white rounded-xl border border-gray-100 shadow-sm p-3">
                    <p className="text-xs text-gray-500">{c.label}</p>
                    <p className={`text-sm mt-0.5 ${c.color}`}>{c.val}</p>
                  </div>
                ))}
              </div>
            )}

            {/* 月結表格 */}
            {monthLoading ? (
              <div className="text-center py-16 text-gray-400">載入中…</div>
            ) : monthData ? (
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-purple-50 text-purple-800 text-xs">
                      {['公司名稱','統編','金額（NT$）','張數','備註','狀態',''].map(h => (
                        <th key={h} className="px-4 py-2.5 text-left font-medium whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {monthData.rows.length === 0 && (
                      <tr><td colSpan={7} className="text-center py-12 text-gray-400">
                        尚無公司資料，請先至「公司管理」新增
                      </td></tr>
                    )}
                    {monthData.rows.map(row => {
                      const vals = editMap[row.companyId] || {};
                      const isSaving = saving.has(row.companyId);
                      const isConfirmed = row.status === '已確認';
                      return (
                        <tr key={row.companyId} className={`hover:bg-gray-50 ${isConfirmed ? 'bg-green-50/40' : ''}`}>
                          <td className="px-4 py-3 font-medium text-gray-800 whitespace-nowrap">{row.companyName}</td>
                          <td className="px-4 py-3 text-gray-500 font-mono text-xs">{row.taxId}</td>
                          <td className="px-4 py-3">
                            <input
                              type="number" min="0" step="1"
                              value={vals.totalAmount ?? ''}
                              onChange={e => setEditMap(p => ({ ...p, [row.companyId]: { ...p[row.companyId], totalAmount: e.target.value } }))}
                              disabled={isConfirmed}
                              placeholder="0"
                              className="w-32 border rounded-lg px-2 py-1 text-sm text-right focus:ring-2 focus:ring-purple-400 outline-none disabled:bg-gray-50 disabled:text-gray-400"
                            />
                          </td>
                          <td className="px-4 py-3">
                            <input
                              type="number" min="0" step="1"
                              value={vals.invoiceCount ?? ''}
                              onChange={e => setEditMap(p => ({ ...p, [row.companyId]: { ...p[row.companyId], invoiceCount: e.target.value } }))}
                              disabled={isConfirmed}
                              placeholder="0"
                              className="w-16 border rounded-lg px-2 py-1 text-sm text-center focus:ring-2 focus:ring-purple-400 outline-none disabled:bg-gray-50 disabled:text-gray-400"
                            />
                          </td>
                          <td className="px-4 py-3">
                            <input
                              type="text"
                              value={vals.note ?? ''}
                              onChange={e => setEditMap(p => ({ ...p, [row.companyId]: { ...p[row.companyId], note: e.target.value } }))}
                              disabled={isConfirmed}
                              placeholder="備註"
                              className="w-40 border rounded-lg px-2 py-1 text-sm focus:ring-2 focus:ring-purple-400 outline-none disabled:bg-gray-50 disabled:text-gray-400"
                            />
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            {row.status === '已確認' ? (
                              <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700">已確認</span>
                            ) : row.totalAmount > 0 ? (
                              <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">待確認</span>
                            ) : (
                              <span className="text-xs text-gray-300">未填</span>
                            )}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap flex gap-1.5">
                            {!isConfirmed && (
                              <button onClick={() => saveRow(row)} disabled={isSaving}
                                className="text-xs px-2.5 py-1 rounded-lg border border-purple-300 text-purple-600 hover:bg-purple-50 disabled:opacity-50">
                                {isSaving ? '…' : '儲存'}
                              </button>
                            )}
                            {row.expenseId && (
                              <button onClick={() => toggleConfirm(row)}
                                className={`text-xs px-2.5 py-1 rounded-lg border ${
                                  isConfirmed
                                    ? 'border-gray-300 text-gray-500 hover:bg-gray-50'
                                    : 'border-green-300 text-green-600 hover:bg-green-50'
                                }`}>
                                {isConfirmed ? '取消確認' : '確認'}
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  {monthData.rows.length > 0 && (
                    <tfoot>
                      <tr className="bg-purple-50 font-semibold text-purple-800 text-sm">
                        <td className="px-4 py-2.5" colSpan={2}>合計</td>
                        <td className="px-4 py-2.5 text-left">
                          {NT(monthData.rows.reduce((s, r) => {
                            const v = parseFloat(editMap[r.companyId]?.totalAmount) || 0;
                            return s + v;
                          }, 0))}
                        </td>
                        <td className="px-4 py-2.5 text-center text-xs text-purple-600">
                          {monthData.rows.reduce((s, r) => s + (parseInt(editMap[r.companyId]?.invoiceCount) || 0), 0)} 張
                        </td>
                        <td colSpan={3}></td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            ) : (
              <div className="text-center py-16 text-gray-400">請選擇月份後按「查詢」</div>
            )}
          </div>
        )}

        {/* ══ Tab: 年度彙整 ══ */}
        {activeTab === 'yearly' && (
          <div>
            <div className="flex flex-wrap items-center gap-3 mb-4">
              <div>
                <label className="block text-xs text-gray-500 mb-1">年份</label>
                <select value={year} onChange={e => setYear(e.target.value)} className={inputCls}>
                  {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
              <button onClick={fetchYear} className={`${btnCls} bg-purple-50 text-purple-700`}>查詢</button>
              {yearData && (
                <div className="ml-auto">
                  <ExportButtons
                    data={yearData.yearRows.map(r => ({
                      month: r.month,
                      ...Object.fromEntries(yearData.companies.map(c => [c.companyName, r.byCompany[c.id] || 0])),
                      total: r.total,
                    }))}
                    columns={[
                      { header: '月份', key: 'month' },
                      ...(yearData.companies || []).map(c => ({ header: c.companyName, key: c.companyName, format: 'number' })),
                      { header: '合計', key: 'total', format: 'number' },
                    ]}
                    filename={`業主往來年度_${year}`}
                    title={`業主往來年度彙整 ${year}`}
                  />
                </div>
              )}
            </div>

            {yearLoading ? (
              <div className="text-center py-16 text-gray-400">載入中…</div>
            ) : yearData ? (
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-purple-50 text-purple-800 text-xs">
                      <th className="px-4 py-2.5 text-left font-medium whitespace-nowrap">月份</th>
                      {yearData.companies.map(c => (
                        <th key={c.id} className="px-4 py-2.5 text-right font-medium whitespace-nowrap">{c.companyName}</th>
                      ))}
                      <th className="px-4 py-2.5 text-right font-medium whitespace-nowrap">合計</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {yearData.yearRows.length === 0 && (
                      <tr><td colSpan={yearData.companies.length + 2} className="text-center py-12 text-gray-400">本年度無資料</td></tr>
                    )}
                    {yearData.yearRows.map(row => (
                      <tr key={row.month} className="hover:bg-gray-50">
                        <td className="px-4 py-2.5 font-medium text-gray-700">{row.month}</td>
                        {yearData.companies.map(c => (
                          <td key={c.id} className="px-4 py-2.5 text-right text-gray-600">
                            {row.byCompany[c.id] > 0 ? Number(row.byCompany[c.id]).toLocaleString() : '—'}
                          </td>
                        ))}
                        <td className="px-4 py-2.5 text-right font-semibold text-purple-700">
                          {Number(row.total).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  {yearData.yearRows.length > 0 && (
                    <tfoot>
                      <tr className="bg-purple-50 font-bold text-purple-800 text-sm">
                        <td className="px-4 py-2.5">全年合計</td>
                        {yearData.companies.map(c => {
                          const total = yearData.yearRows.reduce((s, r) => s + (r.byCompany[c.id] || 0), 0);
                          return <td key={c.id} className="px-4 py-2.5 text-right">{Number(total).toLocaleString()}</td>;
                        })}
                        <td className="px-4 py-2.5 text-right">{Number(yearData.yearTotal).toLocaleString()}</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            ) : (
              <div className="text-center py-16 text-gray-400">請選擇年份後按「查詢」</div>
            )}
          </div>
        )}

        {/* ══ Tab: 公司管理 ══ */}
        {activeTab === 'companies' && (
          <div className="max-w-2xl">
            <div className="flex justify-between items-center mb-4">
              <p className="text-sm text-gray-500">登記老闆旗下各公司，月底登記時自動帶入</p>
              <button onClick={() => setShowAddForm(v => !v)}
                className="px-4 py-1.5 text-sm rounded-lg bg-purple-600 text-white hover:bg-purple-700">
                + 新增公司
              </button>
            </div>

            {/* 新增表單 */}
            {showAddForm && (
              <div className="bg-white rounded-xl shadow-sm border border-purple-100 p-5 mb-4 space-y-3">
                <h3 className="font-semibold text-gray-800 text-sm">新增公司</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">公司名稱 *</label>
                    <input type="text" value={newComp.companyName}
                      onChange={e => setNewComp(p => ({ ...p, companyName: e.target.value }))}
                      className={inputCls + ' w-full'} placeholder="例：XX股份有限公司" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">統編 *</label>
                    <input type="text" value={newComp.taxId} maxLength={8}
                      onChange={e => setNewComp(p => ({ ...p, taxId: e.target.value }))}
                      className={inputCls + ' w-full'} placeholder="8碼統編" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">備註</label>
                  <input type="text" value={newComp.note}
                    onChange={e => setNewComp(p => ({ ...p, note: e.target.value }))}
                    className={inputCls + ' w-full'} placeholder="例：主要進項：備品" />
                </div>
                <div className="flex gap-2 justify-end">
                  <button onClick={() => setShowAddForm(false)} className={btnCls}>取消</button>
                  <button onClick={handleAddCompany} disabled={compSaving}
                    className="px-4 py-1.5 text-sm rounded-lg bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50">
                    {compSaving ? '儲存中…' : '新增'}
                  </button>
                </div>
              </div>
            )}

            {/* 公司列表 */}
            {compLoading ? (
              <div className="text-center py-16 text-gray-400">載入中…</div>
            ) : (
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-purple-50 text-purple-800 text-xs">
                      {['公司名稱','統編','備註','狀態',''].map(h => (
                        <th key={h} className="px-4 py-2.5 text-left font-medium">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {companies.length === 0 && (
                      <tr><td colSpan={5} className="text-center py-12 text-gray-400">尚無公司，點擊「+ 新增公司」開始</td></tr>
                    )}
                    {companies.map(c => (
                      <tr key={c.id} className={`hover:bg-gray-50 ${!c.isActive ? 'opacity-40' : ''}`}>
                        {editCompId === c.id ? (
                          <>
                            <td className="px-4 py-2">
                              <input type="text" value={editCompData.companyName ?? c.companyName}
                                onChange={e => setEditCompData(p => ({ ...p, companyName: e.target.value }))}
                                className="border rounded px-2 py-1 text-sm w-full" />
                            </td>
                            <td className="px-4 py-2">
                              <input type="text" value={editCompData.taxId ?? c.taxId} maxLength={8}
                                onChange={e => setEditCompData(p => ({ ...p, taxId: e.target.value }))}
                                className="border rounded px-2 py-1 text-sm w-24 font-mono" />
                            </td>
                            <td className="px-4 py-2">
                              <input type="text" value={editCompData.note ?? c.note ?? ''}
                                onChange={e => setEditCompData(p => ({ ...p, note: e.target.value }))}
                                className="border rounded px-2 py-1 text-sm w-full" />
                            </td>
                            <td></td>
                            <td className="px-4 py-2 whitespace-nowrap flex gap-1.5">
                              <button onClick={() => handleUpdateCompany(c.id)}
                                className="text-xs px-2.5 py-1 rounded-lg bg-purple-600 text-white hover:bg-purple-700">儲存</button>
                              <button onClick={() => setEditCompId(null)}
                                className="text-xs px-2.5 py-1 rounded-lg border hover:bg-gray-50">取消</button>
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="px-4 py-3 font-medium text-gray-800">{c.companyName}</td>
                            <td className="px-4 py-3 text-gray-500 font-mono text-xs">{c.taxId}</td>
                            <td className="px-4 py-3 text-gray-400 text-xs">{c.note || '—'}</td>
                            <td className="px-4 py-3">
                              <span className={`text-xs px-2 py-0.5 rounded-full ${c.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                                {c.isActive ? '啟用' : '停用'}
                              </span>
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap flex gap-1.5">
                              <button onClick={() => { setEditCompId(c.id); setEditCompData({}); }}
                                className="text-xs px-2.5 py-1 rounded-lg border border-indigo-300 text-indigo-600 hover:bg-indigo-50">
                                編輯
                              </button>
                              {c.isActive && (
                                <button onClick={() => handleDeactivate(c.id, c.companyName)}
                                  className="text-xs px-2.5 py-1 rounded-lg border border-red-200 text-red-400 hover:bg-red-50">
                                  停用
                                </button>
                              )}
                            </td>
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
