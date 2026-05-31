'use client';
import { useState, useEffect, useMemo } from 'react';
import { useToast } from '@/context/ToastContext';
import { useConfirm } from '@/context/ConfirmContext';
import { sortRows, useColumnSort, SortableTh } from '@/components/SortableTh';
import { todayStr } from '@/lib/localDate';

function formatNum(n) {
  if (n == null || n === '') return '－';
  return Number(n).toLocaleString('zh-TW', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

export default function MaterialsTab({ projects, contracts }) {
  const [materials, setMaterials] = useState([]);
  const [products, setProducts] = useState([]);
  const [filterProjectId, setFilterProjectId] = useState('');
  const [showMaterialModal, setShowMaterialModal] = useState(false);
  const [editingMaterial, setEditingMaterial] = useState(null);
  const emptyForm = { projectId: '', productId: '', contractId: '', termId: '', description: '', quantity: '', unit: '', unitPrice: '', usedAt: todayStr(), note: '' };
  const [materialForm, setMaterialForm] = useState(emptyForm);
  const [materialSaving, setMaterialSaving] = useState(false);

  const { showToast } = useToast();
  const confirm = useConfirm();
  const { sortKey, sortDir, toggleSort } = useColumnSort('usedAt', 'desc');

  useEffect(() => {
    fetchMaterials(filterProjectId || undefined);
    fetchProducts();
  }, []);

  async function fetchMaterials(projectId) {
    try {
      const url = projectId ? `/api/engineering/materials?projectId=${projectId}` : '/api/engineering/materials';
      const res = await fetch(url);
      const data = await res.json();
      setMaterials(Array.isArray(data) ? data : []);
    } catch { setMaterials([]); }
  }

  async function fetchProducts() {
    try {
      const res = await fetch('/api/products?all=true');
      const data = await res.json();
      setProducts(Array.isArray(data) ? data : []);
    } catch { setProducts([]); }
  }

  const materialUsedMap = useMemo(() => {
    const map = {};
    const getKey = (m) => m.productId
      ? `${m.projectId}_${m.contractId || ''}_pid:${m.productId}`
      : `${m.projectId}_${m.contractId || ''}_desc:${(m.description || '').trim()}`;
    materials.forEach(m => {
      if (!m.usedAt) return;
      const key = getKey(m);
      map[key] = (map[key] || 0) + Number(m.quantity || 0);
    });
    return map;
  }, [materials]);

  function getMaterialUsed(m) {
    const key = m.productId
      ? `${m.projectId}_${m.contractId || ''}_pid:${m.productId}`
      : `${m.projectId}_${m.contractId || ''}_desc:${(m.description || '').trim()}`;
    return materialUsedMap[key] || 0;
  }

  const sortedMaterials = useMemo(() =>
    sortRows(materials, sortKey, sortDir, {
      projectCode: (m) => m.project?.code || '',
      contractNo: (m) => m.contractNo || '',
      termName: (m) => m.termName || '',
      itemDesc: (m) => m.product ? `${m.product.code || ''} ${m.product.name || ''}`.trim() : m.description || '',
      quantity: (m) => Number(m.quantity || 0),
      unit: (m) => m.unit || '',
      unitPrice: (m) => Number(m.unitPrice || 0),
      subtotal: (m) => Number(m.quantity || 0) * Number(m.unitPrice || 0),
      usedQty: (m) => m.usedAt ? Number(m.quantity || 0) : getMaterialUsed(m),
      remaining: (m) => m.usedAt ? 0 : Math.max(0, Number(m.quantity || 0) - getMaterialUsed(m)),
      usedAt: (m) => m.usedAt || '',
    }), [materials, sortKey, sortDir, materialUsedMap]);

  function getTermsForContract(contractId) {
    if (!contractId) return [];
    const c = contracts.find(x => x.id === parseInt(contractId));
    return c?.terms || [];
  }

  function openAddMaterial() {
    setEditingMaterial(null);
    setMaterialForm({ ...emptyForm, projectId: filterProjectId || (projects[0]?.id ? String(projects[0].id) : '') });
    setShowMaterialModal(true);
  }

  function openEditMaterial(m) {
    setEditingMaterial(m);
    setMaterialForm({
      projectId: String(m.projectId), productId: m.productId ? String(m.productId) : '',
      contractId: m.contractId ? String(m.contractId) : '', termId: m.termId ? String(m.termId) : '',
      description: m.description || '', quantity: String(m.quantity), unit: m.unit || '',
      unitPrice: String(m.unitPrice ?? ''), usedAt: m.usedAt || '', note: m.note || '',
    });
    setShowMaterialModal(true);
  }

  async function saveMaterial() {
    if (!materialForm.projectId || !materialForm.quantity || parseFloat(materialForm.quantity) <= 0) {
      showToast('請選擇工程案並填寫數量', 'error'); return;
    }
    setMaterialSaving(true);
    try {
      const body = {
        projectId: parseInt(materialForm.projectId),
        productId: materialForm.productId ? parseInt(materialForm.productId) : null,
        contractId: materialForm.contractId ? parseInt(materialForm.contractId) : null,
        termId: materialForm.termId ? parseInt(materialForm.termId) : null,
        description: materialForm.description?.trim() || null, quantity: parseFloat(materialForm.quantity),
        unit: materialForm.unit?.trim() || null, unitPrice: parseFloat(materialForm.unitPrice) || 0,
        usedAt: materialForm.usedAt || null, note: materialForm.note?.trim() || null,
      };
      if (editingMaterial) {
        await fetch(`/api/engineering/materials/${editingMaterial.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        showToast('已更新', 'success');
      } else {
        await fetch('/api/engineering/materials', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        showToast('已新增', 'success');
      }
      setShowMaterialModal(false);
      fetchMaterials(filterProjectId || undefined);
    } catch { showToast('儲存失敗', 'error'); }
    finally { setMaterialSaving(false); }
  }

  async function deleteMaterial(m) {
    if (!(await confirm('確定刪除此筆材料？', { title: '刪除確認', danger: true }))) return;
    try {
      await fetch(`/api/engineering/materials/${m.id}`, { method: 'DELETE' });
      fetchMaterials(filterProjectId || undefined);
    } catch { showToast('刪除失敗', 'error'); }
  }

  return (
    <>
      <div className="flex gap-3 mb-4 items-center">
        <label htmlFor="mat-f-1" className="text-sm text-gray-600">篩選工程案</label>
        <select id="mat-f-1" value={filterProjectId} onChange={e => { setFilterProjectId(e.target.value); fetchMaterials(e.target.value || undefined); }} className="border rounded-lg px-3 py-1.5 text-sm">
          <option value="">全部</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.code} {p.name}</option>)}
        </select>
        <button onClick={openAddMaterial} className="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 text-sm">＋ 新增材料</button>
      </div>
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 sticky top-0 z-10">
              <tr>
                <SortableTh label="工程案" colKey="projectCode" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="px-4 py-2" />
                <SortableTh label="合約" colKey="contractNo" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="px-4 py-2" />
                <SortableTh label="期別" colKey="termName" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="px-4 py-2" />
                <SortableTh label="品項／說明" colKey="itemDesc" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="px-4 py-2" />
                <SortableTh label="數量" colKey="quantity" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="px-4 py-2" align="right" />
                <SortableTh label="單位" colKey="unit" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="px-4 py-2" />
                <SortableTh label="單價" colKey="unitPrice" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="px-4 py-2" align="right" />
                <SortableTh label="小計" colKey="subtotal" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="px-4 py-2" align="right" />
                <SortableTh label="已領用" colKey="usedQty" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="px-4 py-2" align="right" />
                <SortableTh label="剩餘" colKey="remaining" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="px-4 py-2" align="right" />
                <SortableTh label="使用日" colKey="usedAt" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="px-4 py-2" />
                <th className="px-4 py-2 text-center text-sm font-medium text-gray-700">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {materials.length === 0 ? (
                <tr><td colSpan={12} className="px-4 py-8 text-center text-gray-400">尚無材料記錄或請選擇工程案</td></tr>
              ) : sortedMaterials.map(m => {
                const sub = Number(m.quantity) * Number(m.unitPrice);
                return (
                  <tr key={m.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2">{m.project?.code}</td>
                    <td className="px-4 py-2 text-gray-600">{m.contractNo || '－'}</td>
                    <td className="px-4 py-2 text-gray-600">{m.termName || '－'}</td>
                    <td className="px-4 py-2">{m.product ? `${m.product.code} ${m.product.name}` : (m.description || '－')}</td>
                    <td className="px-4 py-2 text-right">{formatNum(m.quantity)}</td>
                    <td className="px-4 py-2">{m.unit || '－'}</td>
                    <td className="px-4 py-2 text-right">{formatNum(m.unitPrice)}</td>
                    <td className="px-4 py-2 text-right font-medium">{formatNum(sub)}</td>
                    <td className="px-4 py-2 text-right">{(() => {
                      if (m.usedAt) return <span className="text-green-600 font-medium">{formatNum(m.quantity)}</span>;
                      const used = getMaterialUsed(m);
                      return used > 0 ? <span className="text-green-600 font-medium">{formatNum(used)}</span> : <span className="text-gray-400">0</span>;
                    })()}</td>
                    <td className="px-4 py-2 text-right">{(() => {
                      if (m.usedAt) return <span className="text-gray-400">—</span>;
                      const remaining = Math.max(0, Number(m.quantity || 0) - getMaterialUsed(m));
                      const qty = Number(m.quantity || 0);
                      return remaining <= 0
                        ? <span className="text-red-500 font-medium">0</span>
                        : remaining < qty
                          ? <span className="text-amber-600 font-medium">{formatNum(remaining)}</span>
                          : <span className="text-gray-600">{formatNum(remaining)}</span>;
                    })()}</td>
                    <td className="px-4 py-2">{m.usedAt || '－'}</td>
                    <td className="px-4 py-2 text-center">
                      <button onClick={() => openEditMaterial(m)} className="text-amber-600 hover:underline mr-2">編輯</button>
                      <button onClick={() => deleteMaterial(m)} className="text-red-600 hover:underline">刪除</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {showMaterialModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowMaterialModal(false)}>
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full mx-4 p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-4">{editingMaterial ? '編輯材料' : '新增材料'}</h3>
            <div className="space-y-3">
              <div><label htmlFor="mat-f-2" className="block text-xs text-gray-500 mb-1">工程案 *</label><select id="mat-f-2" value={materialForm.projectId} onChange={e => setMaterialForm(f => ({ ...f, projectId: e.target.value, contractId: '', termId: '' }))} className="w-full border rounded-lg px-3 py-2 text-sm" disabled={!!editingMaterial}><option value="">請選擇</option>{projects.map(p => <option key={p.id} value={p.id}>{p.code} {p.name}</option>)}</select></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label htmlFor="mat-f-3" className="block text-xs text-gray-500 mb-1">合約（選填）</label><select id="mat-f-3" value={materialForm.contractId} onChange={e => setMaterialForm(f => ({ ...f, contractId: e.target.value, termId: '' }))} className="w-full border rounded-lg px-3 py-2 text-sm"><option value="">不關聯合約</option>{contracts.filter(c => !materialForm.projectId || c.projectId === parseInt(materialForm.projectId)).map(c => <option key={c.id} value={c.id}>{c.contractNo} - {c.supplier?.name}</option>)}</select></div>
                <div><label htmlFor="mat-f-4" className="block text-xs text-gray-500 mb-1">期別（選填）</label><select id="mat-f-4" value={materialForm.termId} onChange={e => setMaterialForm(f => ({ ...f, termId: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" disabled={!materialForm.contractId}><option value="">不關聯期別</option>{getTermsForContract(materialForm.contractId).map(t => <option key={t.id} value={t.id}>{t.termName || `第${t.termNo}期`} ({formatNum(t.amount)})</option>)}</select></div>
              </div>
              <div><label htmlFor="mat-f-5" className="block text-xs text-gray-500 mb-1">產品（選填，可改為手動說明）</label><select id="mat-f-5" value={materialForm.productId} onChange={e => setMaterialForm(f => ({ ...f, productId: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm"><option value="">手動輸入說明</option>{products.map(p => <option key={p.id} value={p.id}>{p.code} {p.name}</option>)}</select></div>
              <div><label htmlFor="mat-f-6" className="block text-xs text-gray-500 mb-1">說明（無產品時填寫）</label><input id="mat-f-6" value={materialForm.description} onChange={e => setMaterialForm(f => ({ ...f, description: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="材料名稱或規格" /></div>
              <div className="grid grid-cols-3 gap-3">
                <div><label htmlFor="mat-f-7" className="block text-xs text-gray-500 mb-1">數量 *</label><input id="mat-f-7" type="number" value={materialForm.quantity} onChange={e => setMaterialForm(f => ({ ...f, quantity: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" step="0.0001" min="0" /></div>
                <div><label htmlFor="mat-f-8" className="block text-xs text-gray-500 mb-1">單位</label><input id="mat-f-8" value={materialForm.unit} onChange={e => setMaterialForm(f => ({ ...f, unit: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="例：式、m²" /></div>
                <div><label htmlFor="mat-f-9" className="block text-xs text-gray-500 mb-1">單價</label><input id="mat-f-9" type="number" value={materialForm.unitPrice} onChange={e => setMaterialForm(f => ({ ...f, unitPrice: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" step="0.01" /></div>
              </div>
              <div><label htmlFor="mat-f-10" className="block text-xs text-gray-500 mb-1">使用日期</label><input id="mat-f-10" type="date" value={materialForm.usedAt} onChange={e => setMaterialForm(f => ({ ...f, usedAt: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
              <div><label htmlFor="mat-f-11" className="block text-xs text-gray-500 mb-1">備註</label><input id="mat-f-11" value={materialForm.note} onChange={e => setMaterialForm(f => ({ ...f, note: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setShowMaterialModal(false)} className="px-4 py-2 border rounded-lg text-sm" disabled={materialSaving}>取消</button>
              <button onClick={saveMaterial} disabled={materialSaving} className="px-4 py-2 bg-amber-600 text-white rounded-lg text-sm disabled:opacity-50">{materialSaving ? '儲存中…' : '儲存'}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
