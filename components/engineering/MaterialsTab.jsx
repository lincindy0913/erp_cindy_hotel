'use client';
import { useState, useEffect, useMemo } from 'react';
import { useToast } from '@/context/ToastContext';
import { useConfirm } from '@/context/ConfirmContext';
import { sortRows, useColumnSort, SortableTh } from '@/components/SortableTh';
import { todayStr } from '@/lib/localDate';
import FetchErrorBanner from '@/components/FetchErrorBanner';

function formatNum(n) {
  if (n == null || n === '') return '－';
  return Number(n).toLocaleString('zh-TW', { minimumFractionDigits: 0, maximumFractionDigits: 4 });
}
function fmtMoney(n) {
  if (n == null || n === '') return '－';
  return Number(n).toLocaleString('zh-TW', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

export default function MaterialsTab({ projects, contracts }) {
  const [subTab, setSubTab] = useState('issues');
  const [fetchError, setFetchError] = useState(null);

  // ── 領料 state ──
  const [materials, setMaterials] = useState([]);
  const [products, setProducts] = useState([]);
  const [filterProjectId, setFilterProjectId] = useState('');
  const [showMaterialModal, setShowMaterialModal] = useState(false);
  const [editingMaterial, setEditingMaterial] = useState(null);
  const emptyMatForm = { projectId: '', productId: '', contractId: '', termId: '', description: '', quantity: '', unit: '', unitPrice: '', usedAt: todayStr(), note: '' };
  const [materialForm, setMaterialForm] = useState(emptyMatForm);
  const [materialSaving, setMaterialSaving] = useState(false);

  // ── 退料 state ──
  const [returns, setReturns] = useState([]);
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [editingReturn, setEditingReturn] = useState(null);
  const emptyRetForm = { projectId: '', materialId: '', description: '', quantity: '', unit: '', returnDate: todayStr(), reason: '', status: 'pending', note: '' };
  const [returnForm, setReturnForm] = useState(emptyRetForm);
  const [returnSaving, setReturnSaving] = useState(false);

  // ── 盤點 state ──
  const [counts, setCounts] = useState([]);
  const [showCountModal, setShowCountModal] = useState(false);
  const [editingCount, setEditingCount] = useState(null);
  const [countItems, setCountItems] = useState([]);
  const [countSaving, setCountSaving] = useState(false);
  const emptyCountForm = { projectId: '', countDate: todayStr(), counter: '', status: 'draft', note: '' };
  const [countForm, setCountForm] = useState(emptyCountForm);

  const { showToast } = useToast();
  const confirm = useConfirm();
  const { sortKey, sortDir, toggleSort } = useColumnSort('usedAt', 'desc');

  useEffect(() => { fetchProducts(); }, []);
  useEffect(() => {
    fetchMaterials(filterProjectId || undefined);
    fetchReturns(filterProjectId || undefined);
    fetchCounts(filterProjectId || undefined);
  }, [filterProjectId]);

  async function fetchMaterials(pid) {
    try {
      const url = pid ? `/api/engineering/materials?projectId=${pid}` : '/api/engineering/materials';
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setFetchError(null);
      setMaterials(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error('[fetchMaterials]', e);
      setFetchError('材料資料載入失敗，請重試。');
      setMaterials([]);
    }
  }
  async function fetchProducts() {
    try {
      const res = await fetch('/api/products?all=true');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const d = await res.json();
      setProducts(Array.isArray(d) ? d : []);
    } catch (e) { console.error('[fetchProducts]', e); setProducts([]); }
  }
  async function fetchReturns(pid) {
    try {
      const url = pid ? `/api/engineering/material-returns?projectId=${pid}` : '/api/engineering/material-returns';
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setReturns(Array.isArray(data) ? data : []);
    } catch (e) { console.error('[fetchReturns]', e); setReturns([]); }
  }
  async function fetchCounts(pid) {
    try {
      const url = pid ? `/api/engineering/stock-counts?projectId=${pid}` : '/api/engineering/stock-counts';
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setCounts(Array.isArray(data) ? data : []);
    } catch (e) { console.error('[fetchCounts]', e); setCounts([]); }
  }

  // 已驗收退料量 map（materialId → 總退料量）
  const returnedQtyMap = useMemo(() => {
    const map = {};
    for (const r of returns) {
      if (r.materialId && r.status === 'accepted') {
        map[r.materialId] = (map[r.materialId] || 0) + Number(r.quantity);
      }
    }
    return map;
  }, [returns]);

  const sortedMaterials = useMemo(() =>
    sortRows(materials, sortKey, sortDir, {
      projectCode: m => m.project?.code || '',
      contractNo:  m => m.contractNo || '',
      termName:    m => m.termName || '',
      itemDesc:    m => m.product ? `${m.product.code || ''} ${m.product.name || ''}`.trim() : m.description || '',
      quantity:    m => Number(m.quantity || 0),
      unit:        m => m.unit || '',
      unitPrice:   m => Number(m.unitPrice || 0),
      subtotal:    m => Number(m.quantity || 0) * Number(m.unitPrice || 0),
      usedAt:      m => m.usedAt || '',
    }), [materials, sortKey, sortDir]);

  function getTermsForContract(contractId) {
    if (!contractId) return [];
    const c = contracts.find(x => x.id === parseInt(contractId));
    return c?.terms || [];
  }

  // ── 領料 CRUD ──
  function openAddMaterial() {
    setEditingMaterial(null);
    setMaterialForm({ ...emptyMatForm, projectId: filterProjectId || (projects[0]?.id ? String(projects[0].id) : '') });
    setShowMaterialModal(true);
  }
  function openEditMaterial(m) {
    setEditingMaterial(m);
    setMaterialForm({ projectId: String(m.projectId), productId: m.productId ? String(m.productId) : '', contractId: m.contractId ? String(m.contractId) : '', termId: m.termId ? String(m.termId) : '', description: m.description || '', quantity: String(m.quantity), unit: m.unit || '', unitPrice: String(m.unitPrice ?? ''), usedAt: m.usedAt || '', note: m.note || '' });
    setShowMaterialModal(true);
  }
  async function saveMaterial() {
    if (!materialForm.projectId || !materialForm.quantity || parseFloat(materialForm.quantity) <= 0) { showToast('請選擇工程案並填寫數量', 'error'); return; }
    setMaterialSaving(true);
    try {
      const body = { projectId: parseInt(materialForm.projectId), productId: materialForm.productId ? parseInt(materialForm.productId) : null, contractId: materialForm.contractId ? parseInt(materialForm.contractId) : null, termId: materialForm.termId ? parseInt(materialForm.termId) : null, description: materialForm.description?.trim() || null, quantity: parseFloat(materialForm.quantity), unit: materialForm.unit?.trim() || null, unitPrice: parseFloat(materialForm.unitPrice) || 0, usedAt: materialForm.usedAt || null, note: materialForm.note?.trim() || null };
      if (editingMaterial) { await fetch(`/api/engineering/materials/${editingMaterial.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); showToast('已更新', 'success'); }
      else { await fetch('/api/engineering/materials', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); showToast('已新增', 'success'); }
      setShowMaterialModal(false);
      fetchMaterials(filterProjectId || undefined);
    } catch { showToast('儲存失敗', 'error'); }
    finally { setMaterialSaving(false); }
  }
  async function deleteMaterial(m) {
    if (!(await confirm('確定刪除此筆材料？', { title: '刪除確認', danger: true }))) return;
    await fetch(`/api/engineering/materials/${m.id}`, { method: 'DELETE' });
    fetchMaterials(filterProjectId || undefined);
  }

  // ── 退料 CRUD ──
  function openAddReturn(mat) {
    setEditingReturn(null);
    setReturnForm({ ...emptyRetForm, projectId: mat ? String(mat.projectId) : (filterProjectId || ''), materialId: mat ? String(mat.id) : '', description: mat ? (mat.product ? `${mat.product.code} ${mat.product.name}` : (mat.description || '')) : '', unit: mat?.unit || '' });
    setShowReturnModal(true);
  }
  function openEditReturn(r) {
    setEditingReturn(r);
    setReturnForm({ projectId: String(r.projectId), materialId: r.materialId ? String(r.materialId) : '', description: r.description || '', quantity: String(r.quantity), unit: r.unit || '', returnDate: r.returnDate, reason: r.reason || '', status: r.status, note: r.note || '' });
    setShowReturnModal(true);
  }
  async function saveReturn() {
    if (!returnForm.projectId || !returnForm.returnDate || !returnForm.quantity || parseFloat(returnForm.quantity) <= 0) { showToast('請填寫工程案、退料日期、數量', 'error'); return; }
    if (!returnForm.description?.trim()) { showToast('請填寫退料品項說明', 'error'); return; }
    setReturnSaving(true);
    try {
      const body = { projectId: parseInt(returnForm.projectId), materialId: returnForm.materialId ? parseInt(returnForm.materialId) : null, description: returnForm.description.trim(), quantity: parseFloat(returnForm.quantity), unit: returnForm.unit?.trim() || null, returnDate: returnForm.returnDate, reason: returnForm.reason?.trim() || null, status: returnForm.status, note: returnForm.note?.trim() || null };
      if (editingReturn) { await fetch(`/api/engineering/material-returns/${editingReturn.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); showToast('已更新', 'success'); }
      else { await fetch('/api/engineering/material-returns', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); showToast('已新增退料記錄', 'success'); }
      setShowReturnModal(false);
      fetchReturns(filterProjectId || undefined);
      fetchMaterials(filterProjectId || undefined);
    } catch { showToast('儲存失敗', 'error'); }
    finally { setReturnSaving(false); }
  }
  async function acceptReturn(r) {
    await fetch(`/api/engineering/material-returns/${r.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'accepted' }) });
    fetchReturns(filterProjectId || undefined);
    fetchMaterials(filterProjectId || undefined);
  }
  async function deleteReturn(r) {
    if (!(await confirm('確定刪除此退料記錄？', { title: '刪除確認', danger: true }))) return;
    await fetch(`/api/engineering/material-returns/${r.id}`, { method: 'DELETE' });
    fetchReturns(filterProjectId || undefined);
  }

  // ── 盤點 CRUD ──
  function openAddCount() {
    setEditingCount(null);
    setCountForm({ ...emptyCountForm, projectId: filterProjectId || '' });
    const pid = filterProjectId ? parseInt(filterProjectId) : null;
    const items = materials
      .filter(m => !pid || m.projectId === pid)
      .map(m => ({
        materialId:  String(m.id),
        description: m.product ? `${m.product.code} ${m.product.name}` : (m.description || ''),
        unit:        m.unit || '',
        expectedQty: String(Math.max(0, Number(m.quantity) - (returnedQtyMap[m.id] || 0))),
        actualQty:   '',
        note:        '',
      }));
    setCountItems(items.length ? items : [{ materialId: '', description: '', unit: '', expectedQty: '', actualQty: '', note: '' }]);
    setShowCountModal(true);
  }
  function openEditCount(c) {
    setEditingCount(c);
    setCountForm({ projectId: String(c.projectId), countDate: c.countDate, counter: c.counter || '', status: c.status, note: c.note || '' });
    setCountItems((c.items || []).map(i => ({ materialId: i.materialId ? String(i.materialId) : '', description: i.description || (i.material?.description || ''), unit: i.unit || '', expectedQty: String(i.expectedQty), actualQty: String(i.actualQty), note: i.note || '' })));
    setShowCountModal(true);
  }
  function updateCountItem(i, field, value) { setCountItems(prev => prev.map((it, idx) => idx === i ? { ...it, [field]: value } : it)); }
  function addCountItem() { setCountItems(prev => [...prev, { materialId: '', description: '', unit: '', expectedQty: '', actualQty: '', note: '' }]); }
  function removeCountItem(i) { setCountItems(prev => prev.filter((_, idx) => idx !== i)); }
  async function saveCount(confirmOnSave) {
    if (!countForm.projectId || !countForm.countDate) { showToast('請選擇工程案與盤點日期', 'error'); return; }
    if (countItems.some(i => !i.description?.trim())) { showToast('所有盤點品項請填寫說明', 'error'); return; }
    setCountSaving(true);
    try {
      const body = { ...countForm, projectId: parseInt(countForm.projectId), status: confirmOnSave ? 'confirmed' : countForm.status, items: countItems.map(i => ({ materialId: i.materialId ? parseInt(i.materialId) : null, description: i.description.trim(), unit: i.unit?.trim() || null, expectedQty: parseFloat(i.expectedQty) || 0, actualQty: parseFloat(i.actualQty) || 0, note: i.note?.trim() || null })) };
      if (editingCount) { await fetch(`/api/engineering/stock-counts/${editingCount.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); showToast(confirmOnSave ? '盤點單已確認' : '已更新', 'success'); }
      else { await fetch('/api/engineering/stock-counts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); showToast('盤點單已建立', 'success'); }
      setShowCountModal(false);
      fetchCounts(filterProjectId || undefined);
    } catch { showToast('儲存失敗', 'error'); }
    finally { setCountSaving(false); }
  }
  async function deleteCount(c) {
    if (!(await confirm(`確定刪除此盤點單（${c.countDate}）？`, { title: '刪除確認', danger: true }))) return;
    const res = await fetch(`/api/engineering/stock-counts/${c.id}`, { method: 'DELETE' });
    if (!res.ok) { const d = await res.json(); showToast(d.error?.message || '刪除失敗', 'error'); return; }
    fetchCounts(filterProjectId || undefined);
  }

  const totalIssuedAmt  = useMemo(() => materials.reduce((s, m) => s + Number(m.quantity) * Number(m.unitPrice), 0), [materials]);
  const totalReturnedQty = useMemo(() => returns.filter(r => r.status === 'accepted').reduce((s, r) => s + Number(r.quantity), 0), [returns]);

  return (
    <>
      {fetchError && <FetchErrorBanner message={fetchError} onRetry={() => { fetchMaterials(filterProjectId || undefined); fetchReturns(filterProjectId || undefined); fetchCounts(filterProjectId || undefined); }} className="mb-4" />}
      {/* 篩選列 */}
      <div className="flex gap-3 mb-4 items-center flex-wrap">
        <label className="text-sm text-gray-600">篩選工程案</label>
        <select value={filterProjectId} onChange={e => setFilterProjectId(e.target.value)} className="border rounded-lg px-3 py-1.5 text-sm">
          <option value="">全部</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.code} {p.name}</option>)}
        </select>
        <div className="flex gap-3 ml-2 text-xs text-gray-500">
          <span>領料合計 <span className="font-semibold text-gray-700">{fmtMoney(totalIssuedAmt)}</span></span>
          {totalReturnedQty > 0 && <span>已退料 <span className="font-semibold text-orange-600">{formatNum(totalReturnedQty)} 件</span></span>}
          <span>盤點 <span className="font-semibold text-indigo-600">{counts.length} 次</span></span>
        </div>
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-1 mb-4 border-b border-gray-200">
        {[
          { key: 'issues',  label: '📦 領料記錄',  count: materials.length },
          { key: 'returns', label: '🔄 退料記錄',  count: returns.length },
          { key: 'counts',  label: '📋 現場盤點',  count: counts.length },
        ].map(t => (
          <button key={t.key} onClick={() => setSubTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${subTab === t.key ? 'border-amber-500 text-amber-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            {t.label}
            <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-xs ${subTab === t.key ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-500'}`}>{t.count}</span>
          </button>
        ))}
      </div>

      {/* ── 領料記錄 ── */}
      {subTab === 'issues' && (
        <>
          <div className="flex justify-end mb-3">
            <button onClick={openAddMaterial} className="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 text-sm">＋ 新增材料</button>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 sticky top-0 z-10">
                  <tr>
                    <SortableTh label="工程案"    colKey="projectCode" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="px-4 py-2" />
                    <SortableTh label="合約"      colKey="contractNo"  sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="px-4 py-2" />
                    <SortableTh label="期別"      colKey="termName"    sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="px-4 py-2" />
                    <SortableTh label="品項／說明" colKey="itemDesc"   sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="px-4 py-2" />
                    <SortableTh label="領料量"    colKey="quantity"    sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="px-4 py-2" align="right" />
                    <SortableTh label="單位"      colKey="unit"        sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="px-4 py-2" />
                    <SortableTh label="單價"      colKey="unitPrice"   sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="px-4 py-2" align="right" />
                    <SortableTh label="小計"      colKey="subtotal"    sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="px-4 py-2" align="right" />
                    <th className="px-4 py-2 text-right text-xs font-medium text-orange-500">退料量</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-green-700">淨用量</th>
                    <SortableTh label="使用日"    colKey="usedAt"      sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="px-4 py-2" />
                    <th className="px-4 py-2 text-center text-xs font-medium text-gray-700">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {materials.length === 0 ? (
                    <tr><td colSpan={12} className="px-4 py-8 text-center text-gray-400">尚無材料記錄</td></tr>
                  ) : sortedMaterials.map(m => {
                    const qty      = Number(m.quantity || 0);
                    const returned = returnedQtyMap[m.id] || 0;
                    const net      = Math.max(0, qty - returned);
                    const sub      = qty * Number(m.unitPrice || 0);
                    return (
                      <tr key={m.id} className="hover:bg-gray-50">
                        <td className="px-4 py-2 text-xs">{m.project?.code}</td>
                        <td className="px-4 py-2 text-xs text-gray-500">{m.contractNo || '－'}</td>
                        <td className="px-4 py-2 text-xs text-gray-500">{m.termName || '－'}</td>
                        <td className="px-4 py-2">{m.product ? `${m.product.code} ${m.product.name}` : (m.description || '－')}</td>
                        <td className="px-4 py-2 text-right">{formatNum(qty)}</td>
                        <td className="px-4 py-2 text-xs">{m.unit || '－'}</td>
                        <td className="px-4 py-2 text-right">{fmtMoney(m.unitPrice)}</td>
                        <td className="px-4 py-2 text-right font-medium">{fmtMoney(sub)}</td>
                        <td className="px-4 py-2 text-right text-orange-500 text-xs">{returned > 0 ? formatNum(returned) : <span className="text-gray-300">—</span>}</td>
                        <td className="px-4 py-2 text-right font-medium text-green-700">{formatNum(net)}</td>
                        <td className="px-4 py-2 text-xs">{m.usedAt || '－'}</td>
                        <td className="px-4 py-2 text-center whitespace-nowrap">
                          <button onClick={() => openAddReturn(m)} className="text-orange-500 hover:underline text-xs mr-2">退料</button>
                          <button onClick={() => openEditMaterial(m)} className="text-amber-600 hover:underline text-xs mr-2">編輯</button>
                          <button onClick={() => deleteMaterial(m)} className="text-red-500 hover:underline text-xs">刪除</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                {materials.length > 0 && (
                  <tfoot className="bg-amber-50 border-t-2 border-amber-100 text-xs font-semibold">
                    <tr>
                      <td colSpan={7} className="px-4 py-2 text-gray-600">合計 {materials.length} 筆</td>
                      <td className="px-4 py-2 text-right text-amber-800">{fmtMoney(totalIssuedAmt)}</td>
                      <td className="px-4 py-2 text-right text-orange-600">{formatNum(totalReturnedQty)}</td>
                      <td colSpan={3} />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </>
      )}

      {/* ── 退料記錄 ── */}
      {subTab === 'returns' && (
        <>
          <div className="flex justify-end mb-3">
            <button onClick={() => openAddReturn(null)} className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 text-sm">＋ 新增退料</button>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-orange-50 text-xs text-gray-500">
                <tr>
                  <th className="px-4 py-2 text-left">工程案</th>
                  <th className="px-4 py-2 text-left">退料品項</th>
                  <th className="px-4 py-2 text-right">數量</th>
                  <th className="px-4 py-2 text-left">單位</th>
                  <th className="px-4 py-2 text-left">退料日期</th>
                  <th className="px-4 py-2 text-left">退料原因</th>
                  <th className="px-4 py-2 text-center">狀態</th>
                  <th className="px-4 py-2 text-left">原領料記錄</th>
                  <th className="px-4 py-2 text-center">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {returns.length === 0 ? (
                  <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-400">尚無退料記錄</td></tr>
                ) : returns.map(r => (
                  <tr key={r.id} className={`hover:bg-gray-50 ${r.status === 'accepted' ? 'bg-green-50/20' : ''}`}>
                    <td className="px-4 py-2 text-xs">{r.project?.code} {r.project?.name}</td>
                    <td className="px-4 py-2 font-medium">{r.description || '—'}</td>
                    <td className="px-4 py-2 text-right text-orange-600 font-medium">{formatNum(r.quantity)}</td>
                    <td className="px-4 py-2 text-xs">{r.unit || '—'}</td>
                    <td className="px-4 py-2 text-xs">{r.returnDate}</td>
                    <td className="px-4 py-2 text-gray-500 text-xs max-w-[150px] truncate">{r.reason || '—'}</td>
                    <td className="px-4 py-2 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-xs ${r.status === 'accepted' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                        {r.status === 'accepted' ? '已驗收' : '待確認'}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-xs text-gray-400">{r.material ? (r.material.description || `領料#${r.materialId}`) : '—'}</td>
                    <td className="px-4 py-2 text-center whitespace-nowrap">
                      {r.status === 'pending' && <button onClick={() => acceptReturn(r)} className="text-green-600 hover:underline text-xs mr-2">驗收</button>}
                      <button onClick={() => openEditReturn(r)} className="text-amber-600 hover:underline text-xs mr-2">編輯</button>
                      <button onClick={() => deleteReturn(r)} className="text-red-500 hover:underline text-xs">刪除</button>
                    </td>
                  </tr>
                ))}
              </tbody>
              {returns.length > 0 && (
                <tfoot className="bg-orange-50 border-t text-xs font-semibold">
                  <tr>
                    <td colSpan={2} className="px-4 py-2 text-gray-600">合計 {returns.length} 筆</td>
                    <td className="px-4 py-2 text-right text-orange-700">
                      {formatNum(returns.reduce((s, r) => s + Number(r.quantity), 0))}
                      <span className="text-orange-400 ml-1">(已驗收 {formatNum(totalReturnedQty)})</span>
                    </td>
                    <td colSpan={6} />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </>
      )}

      {/* ── 現場盤點 ── */}
      {subTab === 'counts' && (
        <>
          <div className="flex justify-end mb-3">
            <button onClick={openAddCount} className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm">＋ 新增盤點單</button>
          </div>
          {counts.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-10 text-center text-gray-400">尚無盤點記錄</div>
          ) : (
            <div className="space-y-4">
              {counts.map(c => {
                const hasVariance = (c.items || []).some(i => i.variance !== 0);
                return (
                  <div key={c.id} className={`bg-white rounded-xl border ${hasVariance && c.status === 'confirmed' ? 'border-orange-200' : 'border-gray-200'} overflow-hidden`}>
                    <div className="flex items-center justify-between px-5 py-3 bg-gray-50 border-b">
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${c.status === 'confirmed' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                          {c.status === 'confirmed' ? '已確認' : '草稿'}
                        </span>
                        <span className="font-semibold text-gray-800">{c.project?.code} {c.project?.name}</span>
                        <span className="text-sm text-gray-500">盤點日：{c.countDate}</span>
                        {c.counter && <span className="text-xs text-gray-400">盤點人：{c.counter}</span>}
                        {hasVariance && c.status === 'confirmed' && <span className="text-xs font-medium text-orange-600">⚠ 有差異</span>}
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => openEditCount(c)} className="text-indigo-600 hover:underline text-xs">編輯</button>
                        <button onClick={() => deleteCount(c)} className="text-red-500 hover:underline text-xs">刪除</button>
                      </div>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead className="bg-indigo-50 text-gray-500">
                          <tr>
                            <th className="px-4 py-2 text-left">品項</th>
                            <th className="px-4 py-2 text-left">單位</th>
                            <th className="px-4 py-2 text-right">帳面量</th>
                            <th className="px-4 py-2 text-right">實際量</th>
                            <th className="px-4 py-2 text-right">差異</th>
                            <th className="px-4 py-2 text-left">備註</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {(c.items || []).map((i, idx) => {
                            const v = i.variance;
                            return (
                              <tr key={idx} className={v !== 0 ? 'bg-orange-50/50' : ''}>
                                <td className="px-4 py-1.5">{i.description || i.material?.description || '—'}</td>
                                <td className="px-4 py-1.5">{i.unit || '—'}</td>
                                <td className="px-4 py-1.5 text-right text-gray-500">{formatNum(i.expectedQty)}</td>
                                <td className="px-4 py-1.5 text-right font-medium">{formatNum(i.actualQty)}</td>
                                <td className={`px-4 py-1.5 text-right font-semibold ${v > 0 ? 'text-green-600' : v < 0 ? 'text-red-600' : 'text-gray-300'}`}>
                                  {v !== 0 ? `${v > 0 ? '+' : ''}${formatNum(v)}` : '—'}
                                </td>
                                <td className="px-4 py-1.5 text-gray-400">{i.note || '—'}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    {c.note && <div className="px-5 py-2 text-xs text-gray-400 border-t">備註：{c.note}</div>}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ── 領料 Modal ── */}
      {showMaterialModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 overflow-y-auto py-4" onClick={() => setShowMaterialModal(false)}>
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full mx-4 p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-4">{editingMaterial ? '編輯材料' : '新增材料'}</h3>
            <div className="space-y-3">
              <div><label className="block text-xs text-gray-500 mb-1">工程案 *</label><select value={materialForm.projectId} onChange={e => setMaterialForm(f => ({ ...f, projectId: e.target.value, contractId: '', termId: '' }))} className="w-full border rounded-lg px-3 py-2 text-sm" disabled={!!editingMaterial}><option value="">請選擇</option>{projects.map(p => <option key={p.id} value={p.id}>{p.code} {p.name}</option>)}</select></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-xs text-gray-500 mb-1">合約（選填）</label><select value={materialForm.contractId} onChange={e => setMaterialForm(f => ({ ...f, contractId: e.target.value, termId: '' }))} className="w-full border rounded-lg px-3 py-2 text-sm"><option value="">不關聯合約</option>{contracts.filter(c => !materialForm.projectId || c.projectId === parseInt(materialForm.projectId)).map(c => <option key={c.id} value={c.id}>{c.contractNo}</option>)}</select></div>
                <div><label className="block text-xs text-gray-500 mb-1">期別（選填）</label><select value={materialForm.termId} onChange={e => setMaterialForm(f => ({ ...f, termId: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" disabled={!materialForm.contractId}><option value="">不關聯期別</option>{getTermsForContract(materialForm.contractId).map(t => <option key={t.id} value={t.id}>{t.termName || `第${t.termNo}期`}</option>)}</select></div>
              </div>
              <div><label className="block text-xs text-gray-500 mb-1">產品（選填）</label><select value={materialForm.productId} onChange={e => setMaterialForm(f => ({ ...f, productId: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm"><option value="">手動輸入說明</option>{products.map(p => <option key={p.id} value={p.id}>{p.code} {p.name}</option>)}</select></div>
              <div><label className="block text-xs text-gray-500 mb-1">說明</label><input value={materialForm.description} onChange={e => setMaterialForm(f => ({ ...f, description: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="材料名稱或規格" /></div>
              <div className="grid grid-cols-3 gap-3">
                <div><label className="block text-xs text-gray-500 mb-1">數量 *</label><input type="number" value={materialForm.quantity} onChange={e => setMaterialForm(f => ({ ...f, quantity: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" step="0.0001" min="0" /></div>
                <div><label className="block text-xs text-gray-500 mb-1">單位</label><input value={materialForm.unit} onChange={e => setMaterialForm(f => ({ ...f, unit: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="式、m²" /></div>
                <div><label className="block text-xs text-gray-500 mb-1">單價</label><input type="number" value={materialForm.unitPrice} onChange={e => setMaterialForm(f => ({ ...f, unitPrice: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" step="0.01" /></div>
              </div>
              <div><label className="block text-xs text-gray-500 mb-1">使用日期</label><input type="date" value={materialForm.usedAt} onChange={e => setMaterialForm(f => ({ ...f, usedAt: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
              <div><label className="block text-xs text-gray-500 mb-1">備註</label><input value={materialForm.note} onChange={e => setMaterialForm(f => ({ ...f, note: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setShowMaterialModal(false)} className="px-4 py-2 border rounded-lg text-sm" disabled={materialSaving}>取消</button>
              <button onClick={saveMaterial} disabled={materialSaving} className="px-4 py-2 bg-amber-600 text-white rounded-lg text-sm disabled:opacity-50">{materialSaving ? '儲存中…' : '儲存'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── 退料 Modal ── */}
      {showReturnModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 overflow-y-auto py-4" onClick={() => setShowReturnModal(false)}>
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full mx-4 p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-4">{editingReturn ? '編輯退料記錄' : '新增退料記錄'}</h3>
            <div className="space-y-3">
              <div><label className="block text-xs text-gray-500 mb-1">工程案 *</label><select value={returnForm.projectId} onChange={e => setReturnForm(f => ({ ...f, projectId: e.target.value, materialId: '' }))} className="w-full border rounded-lg px-3 py-2 text-sm"><option value="">請選擇</option>{projects.map(p => <option key={p.id} value={p.id}>{p.code} {p.name}</option>)}</select></div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">連結原領料記錄（選填）</label>
                <select value={returnForm.materialId} onChange={e => {
                  const m = materials.find(x => String(x.id) === e.target.value);
                  setReturnForm(f => ({ ...f, materialId: e.target.value, description: m ? (m.product ? `${m.product.code} ${m.product.name}` : (m.description || '')) : f.description, unit: m?.unit || f.unit }));
                }} className="w-full border rounded-lg px-3 py-2 text-sm">
                  <option value="">不連結</option>
                  {materials.filter(m => !returnForm.projectId || m.projectId === parseInt(returnForm.projectId)).map(m => (
                    <option key={m.id} value={m.id}>
                      {m.product ? `${m.product.code} ${m.product.name}` : (m.description || `ID:${m.id}`)} ×{formatNum(m.quantity)}{m.unit || ''}
                    </option>
                  ))}
                </select>
              </div>
              <div><label className="block text-xs text-gray-500 mb-1">退料品項說明 *</label><input value={returnForm.description} onChange={e => setReturnForm(f => ({ ...f, description: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="材料名稱或規格" /></div>
              <div className="grid grid-cols-3 gap-3">
                <div><label className="block text-xs text-gray-500 mb-1">退料數量 *</label><input type="number" value={returnForm.quantity} onChange={e => setReturnForm(f => ({ ...f, quantity: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" step="0.0001" min="0" /></div>
                <div><label className="block text-xs text-gray-500 mb-1">單位</label><input value={returnForm.unit} onChange={e => setReturnForm(f => ({ ...f, unit: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
                <div><label className="block text-xs text-gray-500 mb-1">退料日期 *</label><input type="date" value={returnForm.returnDate} onChange={e => setReturnForm(f => ({ ...f, returnDate: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
              </div>
              <div><label className="block text-xs text-gray-500 mb-1">退料原因</label><input value={returnForm.reason} onChange={e => setReturnForm(f => ({ ...f, reason: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="例：工程縮減、品質不符" /></div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">狀態</label>
                <div className="flex gap-2">
                  {['pending', 'accepted'].map(s => (
                    <button key={s} type="button" onClick={() => setReturnForm(f => ({ ...f, status: s }))}
                      className={`px-3 py-1 rounded-full text-xs border transition-colors ${returnForm.status === s ? 'bg-amber-100 text-amber-700 border-amber-400 font-semibold' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
                      {s === 'pending' ? '待確認' : '已驗收'}
                    </button>
                  ))}
                </div>
              </div>
              <div><label className="block text-xs text-gray-500 mb-1">備註</label><input value={returnForm.note} onChange={e => setReturnForm(f => ({ ...f, note: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setShowReturnModal(false)} className="px-4 py-2 border rounded-lg text-sm" disabled={returnSaving}>取消</button>
              <button onClick={saveReturn} disabled={returnSaving} className="px-4 py-2 bg-orange-600 text-white rounded-lg text-sm disabled:opacity-50">{returnSaving ? '儲存中…' : '儲存'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── 盤點 Modal ── */}
      {showCountModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 overflow-y-auto py-4" onClick={() => setShowCountModal(false)}>
          <div className="bg-white rounded-xl shadow-2xl max-w-3xl w-full mx-4 p-6 my-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-4">{editingCount ? '編輯盤點單' : '新增盤點單'}</h3>
            <div className="space-y-3 mb-4">
              <div className="grid grid-cols-3 gap-3">
                <div><label className="block text-xs text-gray-500 mb-1">工程案 *</label><select value={countForm.projectId} onChange={e => setCountForm(f => ({ ...f, projectId: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm"><option value="">請選擇</option>{projects.map(p => <option key={p.id} value={p.id}>{p.code} {p.name}</option>)}</select></div>
                <div><label className="block text-xs text-gray-500 mb-1">盤點日期 *</label><input type="date" value={countForm.countDate} onChange={e => setCountForm(f => ({ ...f, countDate: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
                <div><label className="block text-xs text-gray-500 mb-1">盤點人員</label><input value={countForm.counter} onChange={e => setCountForm(f => ({ ...f, counter: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
              </div>
              <div><label className="block text-xs text-gray-500 mb-1">備註</label><input value={countForm.note} onChange={e => setCountForm(f => ({ ...f, note: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
            </div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700">盤點明細</span>
              <button type="button" onClick={addCountItem} className="text-indigo-600 text-sm">＋ 新增品項</button>
            </div>
            <div className="border rounded-lg overflow-hidden mb-4 max-h-80 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-indigo-50 text-xs text-gray-500 sticky top-0">
                  <tr>
                    <th className="px-2 py-1.5 text-left">品項說明</th>
                    <th className="px-2 py-1.5 text-left w-16">單位</th>
                    <th className="px-2 py-1.5 text-right w-24">帳面量</th>
                    <th className="px-2 py-1.5 text-right w-24">實際量</th>
                    <th className="px-2 py-1.5 text-right w-20">差異</th>
                    <th className="px-2 py-1.5 text-left">備註</th>
                    <th className="w-6" />
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {countItems.map((item, i) => {
                    const exp = parseFloat(item.expectedQty) || 0;
                    const act = parseFloat(item.actualQty) || 0;
                    const v   = act - exp;
                    return (
                      <tr key={i} className={v !== 0 && item.actualQty !== '' ? 'bg-orange-50/50' : ''}>
                        <td className="px-2 py-1"><input value={item.description} onChange={e => updateCountItem(i, 'description', e.target.value)} className="w-full border rounded px-2 py-0.5 text-xs" placeholder="材料名稱" /></td>
                        <td className="px-2 py-1"><input value={item.unit} onChange={e => updateCountItem(i, 'unit', e.target.value)} className="w-full border rounded px-2 py-0.5 text-xs" /></td>
                        <td className="px-2 py-1"><input type="number" value={item.expectedQty} onChange={e => updateCountItem(i, 'expectedQty', e.target.value)} className="w-full border rounded px-2 py-0.5 text-xs text-right" step="0.0001" /></td>
                        <td className="px-2 py-1"><input type="number" value={item.actualQty} onChange={e => updateCountItem(i, 'actualQty', e.target.value)} className="w-full border rounded px-2 py-0.5 text-xs text-right" step="0.0001" /></td>
                        <td className={`px-2 py-1 text-right text-xs font-semibold ${item.actualQty === '' ? 'text-gray-300' : v > 0 ? 'text-green-600' : v < 0 ? 'text-red-600' : 'text-gray-300'}`}>
                          {item.actualQty !== '' && v !== 0 ? `${v > 0 ? '+' : ''}${formatNum(v)}` : '—'}
                        </td>
                        <td className="px-2 py-1"><input value={item.note} onChange={e => updateCountItem(i, 'note', e.target.value)} className="w-full border rounded px-2 py-0.5 text-xs" /></td>
                        <td className="px-2 py-1"><button type="button" onClick={() => removeCountItem(i)} className="text-red-400 hover:text-red-600 text-sm">×</button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowCountModal(false)} className="px-4 py-2 border rounded-lg text-sm" disabled={countSaving}>取消</button>
              <button onClick={() => saveCount(false)} disabled={countSaving} className="px-4 py-2 border border-indigo-400 text-indigo-600 rounded-lg text-sm disabled:opacity-50">{countSaving ? '…' : '儲存草稿'}</button>
              <button onClick={() => saveCount(true)} disabled={countSaving} className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm disabled:opacity-50">{countSaving ? '…' : '確認盤點'}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
