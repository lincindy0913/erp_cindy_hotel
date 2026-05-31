'use client';
import { useState, useMemo } from 'react';
import { Fragment } from 'react';
import { useToast } from '@/context/ToastContext';
import { useConfirmDialog, default as ConfirmModal } from '@/components/ConfirmModal';
import { sortRows, useColumnSort, SortableTh } from '@/components/SortableTh';
import AttachmentSection from '@/components/AttachmentSection';

function formatNum(n) {
  if (n == null || n === '') return '－';
  return Number(n).toLocaleString('zh-TW', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function getActualPaid(po) {
  if (po.status === '已執行' && po.executions && po.executions.length > 0) {
    return po.executions.reduce((s, e) => s + Number(e.actualAmount || 0), 0);
  }
  return Number(po.amount || 0);
}

export default function ContractsTab({
  projects, suppliers, contracts, paymentOrders,
  filterProjectId, onFilterChange,
  onMarkTermPaid, onUnmarkTermPaid,
  onRefresh, session,
}) {
  const [showContractModal, setShowContractModal] = useState(false);
  const [editingContract, setEditingContract] = useState(null);
  const emptyContractForm = { projectId: '', supplierId: '', contractNo: '', totalAmount: '', signDate: '', content: '', note: '', terms: [], materials: [] };
  const [contractForm, setContractForm] = useState(emptyContractForm);
  const [contractSaving, setContractSaving] = useState(false);

  const [showContractUploadModal, setShowContractUploadModal] = useState(false);
  const [contractForUpload, setContractForUpload] = useState(null);

  const { showToast } = useToast();
  const { dialog: confirmDlg, confirm: askConfirm, close: closeConfirm } = useConfirmDialog();
  const { sortKey: engConKey, sortDir: engConDir, toggleSort: engConToggle } = useColumnSort('signDate', 'desc');

  const displayContracts = filterProjectId
    ? contracts.filter(c => c.projectId === parseInt(filterProjectId))
    : contracts;

  const sortedContracts = useMemo(
    () => sortRows(displayContracts, engConKey, engConDir, {
      projectLabel: (c) => `${c.project?.code || ''} ${c.project?.name || ''}`,
      contractNo: (c) => c.contractNo || '',
      supplier: (c) => c.supplier?.name || '',
      totalAmount: (c) => Number(c.totalAmount || 0),
      conStatus: (c) => (c.status === 'completed' ? '已完成' : '進行中'),
      signDate: (c) => c.signDate || '',
    }),
    [displayContracts, engConKey, engConDir]
  );

  function openAddContract() {
    setEditingContract(null);
    setContractForm({
      projectId: filterProjectId || (projects[0]?.id ? String(projects[0].id) : ''),
      supplierId: '', contractNo: '', totalAmount: '', signDate: '', content: '', note: '',
      terms: [{ termName: '第1期', amount: '', dueDate: '', content: '', note: '' }],
      materials: [{ materialName: '', quantity: '', amount: '' }],
    });
    setShowContractModal(true);
  }

  function openEditContract(c) {
    setEditingContract(c);
    const matList = (c.materials || []).length ? (c.materials || []).map(m => ({
      materialName: m.description || '', quantity: String(m.quantity ?? ''),
      amount: String((Number(m.quantity) || 0) * (Number(m.unitPrice) || 0)),
    })) : [{ materialName: '', quantity: '', amount: '' }];
    setContractForm({
      projectId: String(c.projectId), supplierId: String(c.supplierId),
      contractNo: c.contractNo, totalAmount: String(c.totalAmount ?? ''),
      signDate: c.signDate || '', content: c.content || '', note: c.note || '',
      terms: (c.terms || []).map(t => ({
        id: t.id, termName: t.termName || `第${t.termNo}期`,
        amount: String(t.amount ?? ''), dueDate: t.dueDate || '',
        content: t.content || '', note: t.note || '', status: t.status,
      })),
      materials: matList,
    });
    setShowContractModal(true);
  }

  function openUploadContract(c) { setContractForUpload(c); setShowContractUploadModal(true); }
  function addContractTermRow() {
    const n = contractForm.terms.length + 1;
    setContractForm(f => ({ ...f, terms: [...f.terms, { termName: `第${n}期`, amount: '', dueDate: '', content: '', note: '' }] }));
  }
  function removeContractTermRow(i) { setContractForm(f => ({ ...f, terms: f.terms.filter((_, idx) => idx !== i) })); }
  function updateContractTerm(i, field, value) {
    setContractForm(f => ({ ...f, terms: f.terms.map((t, idx) => (idx === i ? { ...t, [field]: value } : t)) }));
  }
  function addContractMaterialRow() { setContractForm(f => ({ ...f, materials: [...f.materials, { materialName: '', quantity: '', amount: '' }] })); }
  function removeContractMaterialRow(i) { setContractForm(f => ({ ...f, materials: f.materials.filter((_, idx) => idx !== i) })); }
  function updateContractMaterial(i, field, value) {
    setContractForm(f => ({ ...f, materials: f.materials.map((m, idx) => (idx === i ? { ...m, [field]: value } : m)) }));
  }

  async function saveContract() {
    if (!contractForm.projectId || !contractForm.supplierId || !contractForm.contractNo?.trim()) { showToast('請填寫工程案、廠商、合約編號', 'error'); return; }
    if (!contractForm.content?.trim()) { showToast('請填寫合約內容後再存檔', 'error'); return; }
    if (!contractForm.note?.trim()) { showToast('請填寫備註後再存檔', 'error'); return; }
    const _contractTotal = parseFloat(contractForm.totalAmount) || 0;
    if (_contractTotal > 0 && contractForm.terms.length > 0) {
      const _allTermsSum = contractForm.terms.reduce((s, t) => s + (parseFloat(t.amount) || 0), 0);
      if (Math.abs(_allTermsSum - _contractTotal) > 0.01) {
        showToast(`期數合計 ${_allTermsSum.toLocaleString()} 與合約總金額 ${_contractTotal.toLocaleString()} 不符，請修正後再存檔`, 'error');
        return;
      }
    }
    setContractSaving(true);
    try {
      const body = {
        projectId: parseInt(contractForm.projectId), supplierId: parseInt(contractForm.supplierId),
        contractNo: contractForm.contractNo.trim(), totalAmount: parseFloat(contractForm.totalAmount) || 0,
        signDate: contractForm.signDate || null, content: contractForm.content?.trim() || null, note: contractForm.note?.trim() || null,
        terms: contractForm.terms.filter(t => !t.id).map((t, i) => ({
          termName: t.termName || `第${i + 1}期`, amount: parseFloat(t.amount) || 0,
          dueDate: t.dueDate || null, content: t.content?.trim() || null, note: t.note?.trim() || null,
        })).filter(t => t.amount > 0),
        materials: (contractForm.materials || []).map(m => ({
          materialName: (m.materialName || '').trim(), quantity: parseFloat(m.quantity) || 0,
          amount: parseFloat(m.amount) || 0,
        })).filter(m => m.materialName && m.quantity > 0),
      };
      if (editingContract) {
        const originalTermIds = new Set((editingContract.terms || []).map(t => t.id));
        const existingTermsInForm = contractForm.terms.filter(t => t.id);
        const formTermIds = new Set(existingTermsInForm.map(t => t.id));
        const deleteTermIds = [...originalTermIds].filter(id => !formTermIds.has(id));
        const updateTerms = existingTermsInForm.filter(t => t.status !== 'paid');
        const newTerms = body.terms;
        for (const termId of deleteTermIds) {
          const r = await fetch(`/api/engineering/contract-terms/${termId}`, { method: 'DELETE' });
          if (!r.ok) { const d = await r.json(); throw new Error(d.error?.message || '刪除期數失敗'); }
        }
        for (const t of updateTerms) {
          const r = await fetch(`/api/engineering/contract-terms/${t.id}`, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ termName: t.termName || null, amount: parseFloat(t.amount) || 0, dueDate: t.dueDate || null, content: t.content?.trim() || null, note: t.note?.trim() || null }),
          });
          if (!r.ok) { const d = await r.json(); throw new Error(d.error?.message || '更新期數失敗'); }
        }
        if (newTerms.length > 0) {
          const tRes = await fetch(`/api/engineering/contracts/${editingContract.id}/terms-batch`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newTerms),
          });
          if (!tRes.ok) { const d = await tRes.json().catch(() => ({})); throw new Error(d.error || '追加期數失敗'); }
        }
        const res = await fetch(`/api/engineering/contracts/${editingContract.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contractNo: body.contractNo, totalAmount: body.totalAmount, signDate: body.signDate, content: body.content, note: body.note, materials: body.materials }) });
        if (!res.ok) { const d = await res.json(); throw new Error(d.error?.message || '更新失敗'); }
        const changes = [];
        if (deleteTermIds.length > 0) changes.push(`刪除 ${deleteTermIds.length} 期`);
        if (updateTerms.length > 0) changes.push(`更新 ${updateTerms.length} 期`);
        if (newTerms.length > 0) changes.push(`追加 ${newTerms.length} 期`);
        showToast(changes.length > 0 ? `合約已更新，${changes.join('、')}` : '合約已更新', 'success');
      } else {
        const res = await fetch('/api/engineering/contracts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        if (!res.ok) { const d = await res.json(); throw new Error(d.error?.message || '新增失敗'); }
        showToast('已新增合約', 'success');
      }
      setShowContractModal(false);
      onRefresh?.();
    } catch (e) { showToast(e.message || '儲存失敗', 'error'); }
    finally { setContractSaving(false); }
  }

  function deleteContract(c) {
    askConfirm(`確定刪除合約「${c.contractNo}」？`, async () => {
      try {
        const res = await fetch(`/api/engineering/contracts/${c.id}`, { method: 'DELETE' });
        if (!res.ok) { const d = await res.json(); showToast(d.error?.message || '刪除失敗', 'error'); return; }
        onRefresh?.();
      } catch (e) { showToast('刪除失敗', 'error'); }
    });
  }

  return (
    <>
      <div className="flex gap-3 mb-4 items-center">
        <label htmlFor="con-f-1" className="text-sm text-gray-600">篩選工程案</label>
        <select id="con-f-1" value={filterProjectId} onChange={e => onFilterChange?.(e.target.value)} className="border rounded-lg px-3 py-1.5 text-sm">
          <option value="">全部</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.code} {p.name}</option>)}
        </select>
        <button onClick={openAddContract} className="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 text-sm">＋ 新增合約</button>
      </div>
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 sticky top-0 z-10">
              <tr>
                <SortableTh label="工程案" colKey="projectLabel" sortKey={engConKey} sortDir={engConDir} onSort={engConToggle} className="px-4 py-2" />
                <SortableTh label="合約編號" colKey="contractNo" sortKey={engConKey} sortDir={engConDir} onSort={engConToggle} className="px-4 py-2" />
                <SortableTh label="廠商" colKey="supplier" sortKey={engConKey} sortDir={engConDir} onSort={engConToggle} className="px-4 py-2" />
                <SortableTh label="合約金額" colKey="totalAmount" sortKey={engConKey} sortDir={engConDir} onSort={engConToggle} className="px-4 py-2" align="right" />
                <SortableTh label="狀態" colKey="conStatus" sortKey={engConKey} sortDir={engConDir} onSort={engConToggle} className="px-4 py-2" />
                <SortableTh label="簽約日" colKey="signDate" sortKey={engConKey} sortDir={engConDir} onSort={engConToggle} className="px-4 py-2" />
                <th className="px-4 py-2 text-center text-sm font-medium text-gray-700">期數／付款</th>
                <th className="px-4 py-2 text-center text-sm font-medium text-gray-700">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {contracts.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">尚無合約或請選擇工程案</td></tr>
              ) : sortedContracts.map(c => {
                const hasPaidTerms = (c.terms || []).some(t => t.status === 'paid');
                const isCompleted = c.status === 'completed';
                return (
                  <tr key={c.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2">{c.project?.code} {c.project?.name}</td>
                    <td className="px-4 py-2 font-mono">{c.contractNo}</td>
                    <td className="px-4 py-2">{c.supplier?.name}</td>
                    <td className="px-4 py-2 text-right font-medium">{formatNum(c.totalAmount)}</td>
                    <td className="px-4 py-2">
                      <span className={`px-2 py-0.5 rounded text-xs ${isCompleted ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
                        {isCompleted ? '已完成' : '進行中'}
                      </span>
                    </td>
                    <td className="px-4 py-2">{c.signDate || '－'}</td>
                    <td className="px-4 py-2">
                      {(c.terms || []).length > 0 && (
                        <table className="w-full text-xs border-collapse">
                          <thead className="sticky top-0 z-10 bg-white">
                            <tr className="text-gray-400 border-b border-gray-200">
                              <th className="text-left py-1 pr-2 font-normal whitespace-nowrap">期別</th>
                              <th className="text-right py-1 px-2 font-normal whitespace-nowrap">期款</th>
                              <th className="text-right py-1 px-2 font-normal whitespace-nowrap">已付</th>
                              <th className="text-right py-1 px-2 font-normal whitespace-nowrap">未付</th>
                              <th className="text-center py-1 px-2 font-normal whitespace-nowrap">狀態</th>
                              <th className="text-center py-1 pl-2 font-normal whitespace-nowrap">操作</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(c.terms || []).map(t => {
                              const termMaterials = (c.materials || []).filter(m => m.termId === t.id);
                              const termPOs = paymentOrders.filter(po => po.sourceRecordId === t.id);
                              const paidPOs = termPOs.filter(po => po.status === '已執行');
                              const pendingPOs = termPOs.filter(po => po.status === '待出納');
                              const paidAmount = paidPOs.reduce((s, po) => s + getActualPaid(po), 0);
                              const pendingAmount = pendingPOs.reduce((s, po) => s + Number(po.amount || 0), 0);
                              const termAmt = Number(t.amount);
                              const unpaidAmount = Math.max(0, termAmt - paidAmount);
                              const isFullyPaid = paidAmount >= termAmt && termAmt > 0;
                              const isPartial = paidAmount > 0 && !isFullyPaid;
                              const hasDetails = paidPOs.length > 0 || pendingPOs.length > 0 || t.content || t.note || termMaterials.length > 0;
                              return (
                                <Fragment key={t.id}>
                                  <tr className="border-b border-gray-50 hover:bg-gray-50/50">
                                    <td className="py-1.5 pr-2 font-medium whitespace-nowrap">{t.termName || `第${t.termNo}期`}</td>
                                    <td className="py-1.5 px-2 text-right whitespace-nowrap">{formatNum(termAmt)}</td>
                                    <td className={`py-1.5 px-2 text-right whitespace-nowrap ${paidAmount > 0 ? 'text-green-600 font-medium' : 'text-gray-300'}`}>{paidAmount > 0 ? formatNum(paidAmount) : '—'}</td>
                                    <td className={`py-1.5 px-2 text-right whitespace-nowrap ${isFullyPaid ? 'text-gray-300' : unpaidAmount > 0 ? 'text-amber-600 font-medium' : 'text-gray-300'}`}>{isFullyPaid ? '—' : formatNum(unpaidAmount)}</td>
                                    <td className="py-1.5 px-2 text-center whitespace-nowrap">
                                      <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] leading-tight ${isFullyPaid ? 'bg-green-100 text-green-700' : isPartial ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-500'}`}>
                                        {isFullyPaid ? '已付清' : isPartial ? '部分' : '待付'}
                                      </span>
                                      {pendingAmount > 0 && <span className="inline-block ml-1 px-1.5 py-0.5 rounded text-[10px] leading-tight bg-orange-50 text-orange-500">待出納 {formatNum(pendingAmount)}</span>}
                                    </td>
                                    <td className="py-1.5 pl-2 text-center whitespace-nowrap">
                                      {!isFullyPaid && <button onClick={() => onMarkTermPaid?.(t)} className="text-amber-600 hover:underline">付款</button>}
                                      {isFullyPaid && <button onClick={() => onUnmarkTermPaid?.(t)} className="text-gray-400 hover:text-red-600 hover:underline">取消</button>}
                                    </td>
                                  </tr>
                                  {(isPartial || isFullyPaid) && (
                                    <tr><td colSpan="6" className="pb-1 pt-0">
                                      <div className="w-full h-1 bg-gray-100 rounded-full overflow-hidden">
                                        <div className={`h-full rounded-full ${isFullyPaid ? 'bg-green-400' : 'bg-blue-400'}`} style={{ width: `${Math.min((paidAmount / (termAmt || 1)) * 100, 100)}%` }} />
                                      </div>
                                    </td></tr>
                                  )}
                                  {hasDetails && (
                                    <tr><td colSpan="6" className="pb-2 pt-0">
                                      <div className="pl-3 space-y-0.5">
                                        {paidPOs.map((po, pi) => (
                                          <div key={pi} className="flex items-center gap-2 text-[11px] text-gray-500">
                                            <span className="text-green-600">✓</span>
                                            <span>{po.dueDate || po.createdAt?.slice(0, 10) || ''}</span>
                                            <span className="text-green-600 font-medium">{formatNum(getActualPaid(po))}</span>
                                            <span className="text-gray-400">{po.paymentMethod || ''}</span>
                                            {po.paymentNo && <span className="font-mono text-gray-300">{po.paymentNo}</span>}
                                          </div>
                                        ))}
                                        {pendingPOs.map((po, pi) => (
                                          <div key={`p${pi}`} className="flex items-center gap-2 text-[11px] text-orange-500">
                                            <span>⏳</span>
                                            <span>{po.dueDate || ''}</span>
                                            <span className="font-medium">{formatNum(Number(po.amount))}</span>
                                            <span className="text-orange-400">待出納</span>
                                            {po.paymentNo && <span className="font-mono text-orange-300">{po.paymentNo}</span>}
                                          </div>
                                        ))}
                                        {t.content && <div className="text-[11px] text-gray-500">📋 {t.content}</div>}
                                        {t.note && <div className="text-[11px] text-gray-400">💬 {t.note}</div>}
                                        {termMaterials.length > 0 && (
                                          <div className="text-[11px] text-blue-600">
                                            📦 {termMaterials.map(m => `${m.description || (m.product ? `${m.product.code} ${m.product.name}` : '—')} ×${Number(m.quantity)}`).join('、')}
                                          </div>
                                        )}
                                      </div>
                                    </td></tr>
                                  )}
                                </Fragment>
                              );
                            })}
                          </tbody>
                        </table>
                      )}
                    </td>
                    <td className="px-4 py-2 text-center">
                      <button onClick={() => openUploadContract(c)} className="text-blue-600 hover:underline mr-2">上傳</button>
                      {!isCompleted && <button onClick={() => openEditContract(c)} className="text-amber-600 hover:underline mr-2">編輯</button>}
                      {!hasPaidTerms && <button onClick={() => deleteContract(c)} className="text-red-600 hover:underline">刪除</button>}
                      {isCompleted && <span className="text-xs text-gray-400 ml-1">已鎖定</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Contract Modal */}
      {showContractModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 overflow-y-auto py-4" onClick={() => setShowContractModal(false)}>
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full mx-4 p-6 my-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-4">{editingContract ? '編輯合約' : '新增合約'}</h3>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><label htmlFor="con-f-2" className="block text-xs text-gray-500 mb-1">工程案 *</label><select id="con-f-2" value={contractForm.projectId} onChange={e => setContractForm(f => ({ ...f, projectId: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" disabled={!!editingContract}><option value="">請選擇</option>{projects.map(p => <option key={p.id} value={p.id}>{p.code} {p.name}</option>)}</select></div>
                <div><label htmlFor="con-f-3" className="block text-xs text-gray-500 mb-1">廠商 *</label><select id="con-f-3" value={contractForm.supplierId} onChange={e => setContractForm(f => ({ ...f, supplierId: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" disabled={!!editingContract}><option value="">請選擇</option>{suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label htmlFor="con-f-4" className="block text-xs text-gray-500 mb-1">合約編號 *</label><input id="con-f-4" value={contractForm.contractNo} onChange={e => setContractForm(f => ({ ...f, contractNo: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" disabled={!!editingContract} /></div>
                <div><label htmlFor="con-f-5" className="block text-xs text-gray-500 mb-1">合約總金額</label><input id="con-f-5" type="number" value={contractForm.totalAmount} onChange={e => setContractForm(f => ({ ...f, totalAmount: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" step="0.01" /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label htmlFor="con-f-6" className="block text-xs text-gray-500 mb-1">簽約日</label><input id="con-f-6" type="date" value={contractForm.signDate} onChange={e => setContractForm(f => ({ ...f, signDate: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
                <div />
              </div>
              <div><label htmlFor="con-f-7" className="block text-xs text-gray-500 mb-1">合約內容 *</label><textarea id="con-f-7" value={contractForm.content} onChange={e => setContractForm(f => ({ ...f, content: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" rows={3} placeholder="請填寫合約內容（必填）" /></div>
              <div className="flex justify-between items-center"><label className="text-xs text-gray-500">付款期數</label><button type="button" onClick={addContractTermRow} className="text-amber-600 text-sm">＋ 新增一期</button></div>
              {(() => {
                const totalTermSum = contractForm.terms.reduce((s, t) => s + (parseFloat(t.amount) || 0), 0);
                const contractTotal = parseFloat(contractForm.totalAmount) || 0;
                const hasMismatch = contractTotal > 0 && contractForm.terms.length > 0 && Math.abs(totalTermSum - contractTotal) > 0.01;
                const isMatch = contractTotal > 0 && contractForm.terms.length > 0 && !hasMismatch;
                return (
                  <>
                    <div className={`border rounded-lg overflow-hidden ${hasMismatch ? 'border-red-300' : ''}`}>
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 sticky top-0 z-10"><tr><th className="px-2 py-1 text-left">期別</th><th className="px-2 py-1 text-right">金額</th><th className="px-2 py-1 text-left">到期日</th><th className="px-2 py-1 text-left">內容</th><th className="px-2 py-1 text-left">備註</th><th className="w-8" /></tr></thead>
                        <tbody>
                          {contractForm.terms.length === 0 ? (
                            <tr><td colSpan={6} className="px-2 py-3 text-center text-gray-400 text-xs">尚未新增期數</td></tr>
                          ) : contractForm.terms.map((t, i) => { const isPaid = t.status === 'paid'; return (<tr key={t.id || `new-${i}`} className={`border-t${isPaid ? ' bg-green-50' : ''}`}><td className="px-2 py-1"><div className="flex items-center gap-1"><input value={t.termName} onChange={e => updateContractTerm(i, 'termName', e.target.value)} className="w-full border rounded px-2 py-0.5 text-sm disabled:bg-gray-100 disabled:text-gray-500" disabled={isPaid} />{isPaid && <span className="text-xs text-green-600 whitespace-nowrap">已付</span>}</div></td><td className="px-2 py-1"><input type="number" value={t.amount} onChange={e => updateContractTerm(i, 'amount', e.target.value)} className="w-full border rounded px-2 py-0.5 text-sm text-right disabled:bg-gray-100" step="0.01" disabled={isPaid} /></td><td className="px-2 py-1"><input type="date" value={t.dueDate} onChange={e => updateContractTerm(i, 'dueDate', e.target.value)} className="w-full border rounded px-2 py-0.5 text-sm disabled:bg-gray-100" disabled={isPaid} /></td><td className="px-2 py-1"><input value={t.content || ''} onChange={e => updateContractTerm(i, 'content', e.target.value)} className="w-full border rounded px-2 py-0.5 text-sm disabled:bg-gray-100" placeholder="付款內容" disabled={isPaid} /></td><td className="px-2 py-1"><input value={t.note || ''} onChange={e => updateContractTerm(i, 'note', e.target.value)} className="w-full border rounded px-2 py-0.5 text-sm disabled:bg-gray-100" placeholder="備註" disabled={isPaid} /></td><td className="px-2 py-1">{!isPaid && <button type="button" onClick={() => removeContractTermRow(i)} className="text-red-500">×</button>}</td></tr>); })}
                        </tbody>
                        {contractForm.terms.length > 0 && (
                          <tfoot className={`border-t text-xs font-semibold ${hasMismatch ? 'bg-red-50' : isMatch ? 'bg-green-50' : 'bg-gray-50'}`}>
                            <tr>
                              <td className="px-2 py-1.5 text-gray-500">{`合計 ${contractForm.terms.length} 期`}</td>
                              <td className={`px-2 py-1.5 text-right font-bold ${hasMismatch ? 'text-red-600' : isMatch ? 'text-green-700' : 'text-gray-700'}`}>{totalTermSum.toLocaleString()}</td>
                              <td colSpan={3} className="px-2 py-1.5">
                                {contractTotal > 0 && (
                                  <span className={`text-xs ${hasMismatch ? 'text-red-600 font-semibold' : 'text-green-600'}`}>
                                    {hasMismatch ? `⚠ 合約金額 ${contractTotal.toLocaleString()}，差 ${(totalTermSum - contractTotal > 0 ? '+' : '') + (totalTermSum - contractTotal).toLocaleString()}` : '✓ 與合約金額相符'}
                                  </span>
                                )}
                              </td>
                              <td />
                            </tr>
                          </tfoot>
                        )}
                      </table>
                    </div>
                    {hasMismatch && (
                      <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-700">
                        <span className="text-base leading-none mt-0.5">⚠</span>
                        <span>期數金額合計 <strong>{totalTermSum.toLocaleString()}</strong> 與合約總金額 <strong>{contractTotal.toLocaleString()}</strong> 不符（相差 {Math.abs(totalTermSum - contractTotal).toLocaleString()}），請修正後才能存檔。</span>
                      </div>
                    )}
                  </>
                );
              })()}
              <div className="flex justify-between items-center"><label className="text-xs text-gray-500">材料（會連動至「材料使用」TAB）</label><button type="button" onClick={addContractMaterialRow} className="text-amber-600 text-sm">＋ 新增一筆</button></div>
              <div className="border rounded-lg overflow-hidden"><table className="w-full text-sm"><thead className="bg-gray-50 sticky top-0 z-10"><tr><th className="px-2 py-1 text-left">材料名稱</th><th className="px-2 py-1 text-right">數量</th><th className="px-2 py-1 text-right">金額</th><th className="w-8" /></tr></thead><tbody>
                {(contractForm.materials || []).map((m, i) => (<tr key={i} className="border-t"><td className="px-2 py-1"><input value={m.materialName} onChange={e => updateContractMaterial(i, 'materialName', e.target.value)} className="w-full border rounded px-2 py-0.5 text-sm" placeholder="材料名稱" /></td><td className="px-2 py-1"><input type="number" value={m.quantity} onChange={e => updateContractMaterial(i, 'quantity', e.target.value)} className="w-full border rounded px-2 py-0.5 text-sm text-right" step="any" min="0" /></td><td className="px-2 py-1"><input type="number" value={m.amount} onChange={e => updateContractMaterial(i, 'amount', e.target.value)} className="w-full border rounded px-2 py-0.5 text-sm text-right" step="0.01" min="0" /></td><td className="px-2 py-1"><button type="button" onClick={() => removeContractMaterialRow(i)} className="text-red-500">×</button></td></tr>))}
              </tbody></table></div>
              <div><label className="block text-xs text-gray-500 mb-1">備註 *</label><textarea value={contractForm.note} onChange={e => setContractForm(f => ({ ...f, note: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" rows={2} placeholder="請填寫備註（必填）" /></div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setShowContractModal(false)} className="px-4 py-2 border rounded-lg text-sm" disabled={contractSaving}>取消</button>
              <button onClick={saveContract} disabled={contractSaving} className="px-4 py-2 bg-amber-600 text-white rounded-lg text-sm disabled:opacity-50">{contractSaving ? '儲存中…' : '儲存'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Upload Modal */}
      {showContractUploadModal && contractForUpload && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 overflow-y-auto py-4" onClick={() => setShowContractUploadModal(false)}>
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full mx-4 p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-2">上傳合約檔案</h3>
            <p className="text-sm text-gray-500 mb-4">合約：{contractForUpload.contractNo}（{contractForUpload.supplier?.name}）</p>
            <AttachmentSection sourceModule="engineering_contract" sourceRecordId={contractForUpload.id} canUpload canDelete userEmail={session?.user?.email || ''} />
            <div className="mt-4 flex justify-end"><button onClick={() => setShowContractUploadModal(false)} className="px-4 py-2 border rounded-lg text-sm">關閉</button></div>
          </div>
        </div>
      )}

      <ConfirmModal dialog={confirmDlg} onClose={closeConfirm} />
    </>
  );
}
