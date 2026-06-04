'use client';
import { useState, useMemo } from 'react';
import { Fragment } from 'react';
import { useToast } from '@/context/ToastContext';
import { useConfirmDialog, default as ConfirmModal } from '@/components/ConfirmModal';
import { sortRows, useColumnSort, SortableTh } from '@/components/SortableTh';
import AttachmentSection from '@/components/AttachmentSection';
import { getActualPaid } from '@/lib/engineering/payment-utils';

function formatNum(n) {
  if (n == null || n === '') return '－';
  return Number(n).toLocaleString('zh-TW', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

export default function ContractsTab({
  projects, suppliers, contracts, paymentOrders,
  filterProjectId, onFilterChange,
  onMarkTermPaid, onUnmarkTermPaid,
  onRefresh, session,
}) {
  const [showContractModal, setShowContractModal] = useState(false);
  const [editingContract, setEditingContract] = useState(null);
  const emptyContractForm = {
    projectId: '', supplierId: '', contractNo: '', contractType: '主合約', parentContractId: '',
    totalAmount: '', retentionRate: '', signDate: '', content: '', note: '', changeReason: '', terms: [], materials: [],
  };
  const [contractForm, setContractForm] = useState(emptyContractForm);
  const [contractSaving, setContractSaving] = useState(false);

  // 版本歷史 modal
  const [historyContract, setHistoryContract] = useState(null);
  const [historyVersions, setHistoryVersions] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyExpanded, setHistoryExpanded] = useState(null);

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

  function applyRetentionToTerms(terms, rateStr) {
    const rate = Math.min(1, Math.max(0, parseFloat(rateStr) || 0));
    return terms.map(t => {
      if ((t.termType || 'regular') !== 'regular') return t;
      const amt = parseFloat(t.amount) || 0;
      return { ...t, retentionAmount: rate > 0 ? String(Math.round(amt * rate * 100) / 100) : '0' };
    });
  }

  function openAddContract() {
    setEditingContract(null);
    setContractForm({
      projectId: filterProjectId || (projects[0]?.id ? String(projects[0].id) : ''),
      supplierId: '', contractNo: '', contractType: '主合約', parentContractId: '',
      totalAmount: '', retentionRate: '', signDate: '', content: '', note: '',
      terms: [{ termType: 'regular', termName: '第1期', amount: '', retentionAmount: '0', dueDate: '', content: '', note: '' }],
      materials: [{ materialName: '', quantity: '', amount: '' }],
    });
    setShowContractModal(true);
  }

  function openAddSubContract(parentC, childType) {
    setEditingContract(null);
    setContractForm({
      projectId: String(parentC.projectId),
      supplierId: '', contractNo: `${parentC.contractNo}-${childType === '分包' ? 'S' : 'W'}01`,
      contractType: childType, parentContractId: String(parentC.id),
      totalAmount: '', retentionRate: parentC.retentionRate > 0 ? String(Number(parentC.retentionRate) * 100) : '',
      signDate: '', content: '', note: '', changeReason: '',
      terms: [{ termType: 'regular', termName: '第1期', amount: '', retentionAmount: '0', dueDate: '', content: '', note: '' }],
      materials: [],
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
      contractNo: c.contractNo, contractType: c.contractType || '主合約',
      parentContractId: c.parentContractId ? String(c.parentContractId) : '',
      totalAmount: String(c.totalAmount ?? ''),
      retentionRate: c.retentionRate > 0 ? String(Number(c.retentionRate) * 100) : '',
      signDate: c.signDate || '', content: c.content || '', note: c.note || '', changeReason: '',
      terms: (c.terms || []).map(t => ({
        id: t.id, termType: t.termType || 'regular',
        termName: t.termName || `第${t.termNo}期`,
        amount: String(t.amount ?? ''), retentionAmount: String(t.retentionAmount ?? '0'),
        dueDate: t.dueDate || '', content: t.content || '', note: t.note || '', status: t.status,
      })),
      materials: matList,
    });
    setShowContractModal(true);
  }

  function openUploadContract(c) { setContractForUpload(c); setShowContractUploadModal(true); }

  async function openHistory(c) {
    setHistoryContract(c);
    setHistoryVersions([]);
    setHistoryExpanded(null);
    setHistoryLoading(true);
    try {
      const res = await fetch(`/api/engineering/contracts/${c.id}/versions`);
      const data = await res.json();
      setHistoryVersions(Array.isArray(data) ? data : []);
    } catch { setHistoryVersions([]); }
    finally { setHistoryLoading(false); }
  }

  function addContractTermRow(type = 'regular') {
    const n = contractForm.terms.length + 1;
    const rate = Math.min(1, Math.max(0, parseFloat(contractForm.retentionRate || 0) / 100 || 0));
    if (type === 'retention_release') {
      const totalRetained = contractForm.terms
        .filter(t => (t.termType || 'regular') === 'regular')
        .reduce((s, t) => s + (parseFloat(t.retentionAmount) || 0), 0);
      setContractForm(f => ({
        ...f,
        terms: [...f.terms, {
          termType: 'retention_release', termName: '保留款撥付',
          amount: String(Math.round(totalRetained * 100) / 100), retentionAmount: '0',
          dueDate: '', content: '', note: '',
        }],
      }));
    } else {
      setContractForm(f => ({
        ...f,
        terms: [...f.terms, {
          termType: 'regular', termName: `第${n}期`, amount: '', retentionAmount: '0',
          dueDate: '', content: '', note: '',
        }],
      }));
    }
  }

  function removeContractTermRow(i) { setContractForm(f => ({ ...f, terms: f.terms.filter((_, idx) => idx !== i) })); }

  function updateContractTerm(i, field, value) {
    setContractForm(f => {
      const terms = f.terms.map((t, idx) => {
        if (idx !== i) return t;
        const updated = { ...t, [field]: value };
        if (field === 'amount' && (t.termType || 'regular') === 'regular') {
          const rate = Math.min(1, Math.max(0, parseFloat(f.retentionRate || 0) / 100 || 0));
          const amt = parseFloat(value) || 0;
          updated.retentionAmount = rate > 0 ? String(Math.round(amt * rate * 100) / 100) : t.retentionAmount;
        }
        return updated;
      });
      return { ...f, terms };
    });
  }

  function handleRetentionRateChange(value) {
    setContractForm(f => ({
      ...f,
      retentionRate: value,
      terms: applyRetentionToTerms(f.terms, parseFloat(value || 0) / 100),
    }));
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
    const regularTerms = contractForm.terms.filter(t => (t.termType || 'regular') === 'regular');
    if (_contractTotal > 0 && regularTerms.length > 0) {
      const _regularSum = regularTerms.reduce((s, t) => s + (parseFloat(t.amount) || 0), 0);
      if (Math.abs(_regularSum - _contractTotal) > 0.01) {
        showToast(`一般期數合計 ${_regularSum.toLocaleString()} 與合約總金額 ${_contractTotal.toLocaleString()} 不符，請修正後再存檔`, 'error');
        return;
      }
    }
    const retentionRateDecimal = Math.min(1, Math.max(0, parseFloat(contractForm.retentionRate || 0) / 100 || 0));
    setContractSaving(true);
    try {
      const body = {
        projectId: parseInt(contractForm.projectId), supplierId: parseInt(contractForm.supplierId),
        contractNo: contractForm.contractNo.trim(), totalAmount: parseFloat(contractForm.totalAmount) || 0,
        contractType: contractForm.contractType || '主合約',
        parentContractId: contractForm.parentContractId ? parseInt(contractForm.parentContractId) : null,
        retentionRate: retentionRateDecimal,
        changeReason: contractForm.changeReason?.trim() || null,
        signDate: contractForm.signDate || null, content: contractForm.content?.trim() || null, note: contractForm.note?.trim() || null,
        terms: contractForm.terms.filter(t => !t.id).map((t, i) => ({
          termType: t.termType || 'regular',
          termName: t.termName || `第${i + 1}期`,
          amount: parseFloat(t.amount) || 0,
          retentionAmount: parseFloat(t.retentionAmount) || 0,
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
            body: JSON.stringify({
              termType: t.termType || 'regular',
              termName: t.termName || null,
              amount: parseFloat(t.amount) || 0,
              retentionAmount: parseFloat(t.retentionAmount) || 0,
              dueDate: t.dueDate || null, content: t.content?.trim() || null, note: t.note?.trim() || null,
              changeReason: contractForm.changeReason?.trim() || null,
            }),
          });
          if (!r.ok) { const d = await r.json(); throw new Error(d.error?.message || '更新期數失敗'); }
        }
        if (newTerms.length > 0) {
          const tRes = await fetch(`/api/engineering/contracts/${editingContract.id}/terms-batch`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newTerms),
          });
          if (!tRes.ok) { const d = await tRes.json().catch(() => ({})); throw new Error(d.error || '追加期數失敗'); }
        }
        const res = await fetch(`/api/engineering/contracts/${editingContract.id}`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contractNo: body.contractNo, totalAmount: body.totalAmount,
            retentionRate: retentionRateDecimal, changeReason: body.changeReason,
            signDate: body.signDate, content: body.content, note: body.note, materials: body.materials,
          }),
        });
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
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">層級</th>
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
                const hasRetention = Number(c.retentionRate || 0) > 0;
                const totalRetained = (c.terms || [])
                  .filter(t => (t.termType || 'regular') === 'regular')
                  .reduce((s, t) => s + Number(t.retentionAmount || 0), 0);
                const totalReleased = (c.terms || [])
                  .filter(t => t.termType === 'retention_release' && t.status === 'paid')
                  .reduce((s, t) => s + Number(t.amount || 0), 0);
                const retentionBalance = totalRetained - totalReleased;
                const typeColor = { '主合約': 'bg-amber-100 text-amber-800', '分包': 'bg-blue-100 text-blue-700', '工班': 'bg-purple-100 text-purple-700' };
                const subCount = (c.subContracts || []).length;
                const subTotal = (c.subContracts || []).reduce((s, s2) => s + Number(s2.totalAmount || 0) + (s2.subContracts || []).reduce((ss, s3) => ss + Number(s3.totalAmount || 0), 0), 0);
                return (
                  <Fragment key={c.id}>
                  <tr className="hover:bg-gray-50 border-b border-amber-100">
                    <td className="px-4 py-2 text-sm">{c.project?.code} {c.project?.name}</td>
                    <td className="px-4 py-2">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${typeColor[c.contractType] || 'bg-gray-100 text-gray-500'}`}>
                        {c.contractType || '主合約'}
                      </span>
                      {subCount > 0 && <span className="ml-1 text-[10px] text-gray-400">{subCount}個子合約</span>}
                    </td>
                    <td className="px-4 py-2 font-mono text-sm">{c.contractNo}</td>
                    <td className="px-4 py-2 text-sm">{c.supplier?.name}</td>
                    <td className="px-4 py-2 text-right font-medium">
                      {formatNum(c.totalAmount)}
                      {hasRetention && (
                        <span className="ml-1 text-[10px] text-orange-500 font-normal">
                          留{(Number(c.retentionRate) * 100).toFixed(0)}%
                        </span>
                      )}
                      {(c.currentVersion ?? 1) > 1 && (
                        <span className="ml-1 text-[10px] text-indigo-500 font-normal">v{c.currentVersion}</span>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      <span className={`px-2 py-0.5 rounded text-xs ${isCompleted ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
                        {isCompleted ? '已完成' : '進行中'}
                      </span>
                    </td>
                    <td className="px-4 py-2">{c.signDate || '－'}</td>
                    <td className="px-4 py-2">
                      {(c.terms || []).length > 0 && (
                        <>
                          <table className="w-full text-xs border-collapse">
                            <thead className="sticky top-0 z-10 bg-white">
                              <tr className="text-gray-400 border-b border-gray-200">
                                <th className="text-left py-1 pr-2 font-normal whitespace-nowrap">期別</th>
                                <th className="text-right py-1 px-2 font-normal whitespace-nowrap">請款</th>
                                {hasRetention && <th className="text-right py-1 px-2 font-normal whitespace-nowrap text-orange-400">扣留</th>}
                                {hasRetention && <th className="text-right py-1 px-2 font-normal whitespace-nowrap">實付</th>}
                                {!hasRetention && <th className="text-right py-1 px-2 font-normal whitespace-nowrap">已付</th>}
                                <th className="text-right py-1 px-2 font-normal whitespace-nowrap">未付</th>
                                <th className="text-center py-1 px-2 font-normal whitespace-nowrap">狀態</th>
                                <th className="text-center py-1 pl-2 font-normal whitespace-nowrap">操作</th>
                              </tr>
                            </thead>
                            <tbody>
                              {(c.terms || []).map(t => {
                                const isRetentionRelease = t.termType === 'retention_release';
                                const termMaterials = (c.materials || []).filter(m => m.termId === t.id);
                                const termPOs = paymentOrders.filter(po => po.sourceRecordId === t.id);
                                const paidPOs = termPOs.filter(po => po.status === '已執行');
                                const pendingPOs = termPOs.filter(po => po.status === '待出納');
                                const paidAmount = paidPOs.reduce((s, po) => s + getActualPaid(po), 0);
                                const pendingAmount = pendingPOs.reduce((s, po) => s + Number(po.amount || 0), 0);
                                const termAmt = Number(t.amount);
                                const retAmt = Number(t.retentionAmount || 0);
                                const payable = isRetentionRelease ? termAmt : termAmt - retAmt;
                                const unpaidAmount = Math.max(0, payable - paidAmount);
                                const isFullyPaid = paidAmount >= payable && payable > 0;
                                const isPartial = paidAmount > 0 && !isFullyPaid;
                                const hasDetails = paidPOs.length > 0 || pendingPOs.length > 0 || t.content || t.note || termMaterials.length > 0;
                                return (
                                  <Fragment key={t.id}>
                                    <tr className="border-b border-gray-50 hover:bg-gray-50/50">
                                      <td className="py-1.5 pr-2 font-medium whitespace-nowrap">
                                        {isRetentionRelease
                                          ? <span className="text-orange-600">{t.termName || '保留款撥付'}</span>
                                          : (t.termName || `第${t.termNo}期`)}
                                      </td>
                                      <td className="py-1.5 px-2 text-right whitespace-nowrap">{formatNum(termAmt)}</td>
                                      {hasRetention && (
                                        <td className="py-1.5 px-2 text-right whitespace-nowrap text-orange-500">
                                          {isRetentionRelease ? '—' : (retAmt > 0 ? formatNum(retAmt) : '—')}
                                        </td>
                                      )}
                                      {hasRetention
                                        ? <td className={`py-1.5 px-2 text-right whitespace-nowrap ${paidAmount > 0 ? 'text-green-600 font-medium' : 'text-gray-300'}`}>{paidAmount > 0 ? formatNum(paidAmount) : '—'}</td>
                                        : <td className={`py-1.5 px-2 text-right whitespace-nowrap ${paidAmount > 0 ? 'text-green-600 font-medium' : 'text-gray-300'}`}>{paidAmount > 0 ? formatNum(paidAmount) : '—'}</td>
                                      }
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
                                      <tr><td colSpan={hasRetention ? 7 : 6} className="pb-1 pt-0">
                                        <div className="w-full h-1 bg-gray-100 rounded-full overflow-hidden">
                                          <div className={`h-full rounded-full ${isFullyPaid ? 'bg-green-400' : 'bg-blue-400'}`} style={{ width: `${Math.min((paidAmount / (payable || 1)) * 100, 100)}%` }} />
                                        </div>
                                      </td></tr>
                                    )}
                                    {hasDetails && (
                                      <tr><td colSpan={hasRetention ? 7 : 6} className="pb-2 pt-0">
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
                          {hasRetention && totalRetained > 0 && (
                            <div className="mt-1 flex gap-3 text-[11px] text-orange-600 bg-orange-50 rounded px-2 py-1">
                              <span>累計扣留 <strong>{formatNum(totalRetained)}</strong></span>
                              {totalReleased > 0 && <span>已撥付 <strong className="text-green-600">{formatNum(totalReleased)}</strong></span>}
                              {retentionBalance > 0 && <span>未撥付餘額 <strong>{formatNum(retentionBalance)}</strong></span>}
                              {retentionBalance === 0 && totalRetained > 0 && <span className="text-green-600">全數撥付完畢</span>}
                            </div>
                          )}
                        </>
                      )}
                    </td>
                    <td className="px-4 py-2 text-center">
                      <button onClick={() => openUploadContract(c)} className="text-blue-600 hover:underline mr-2">上傳</button>
                      {(c.currentVersion ?? 1) > 1 && (
                        <button onClick={() => openHistory(c)} className="text-indigo-600 hover:underline mr-2">歷史</button>
                      )}
                      {!isCompleted && <button onClick={() => openEditContract(c)} className="text-amber-600 hover:underline mr-2">編輯</button>}
                      {!hasPaidTerms && <button onClick={() => deleteContract(c)} className="text-red-600 hover:underline">刪除</button>}
                      {isCompleted && <span className="text-xs text-gray-400 ml-1">已鎖定</span>}
                      {c.contractType !== '工班' && (
                        <button onClick={() => openAddSubContract(c, c.contractType === '主合約' ? '分包' : '工班')}
                          className="ml-1 text-xs text-blue-500 hover:underline border border-blue-200 rounded px-1.5 py-0.5">
                          ＋{c.contractType === '主合約' ? '分包' : '工班'}
                        </button>
                      )}
                    </td>
                  </tr>
                  {/* 子合約展開列 */}
                  {(c.subContracts || []).flatMap(sub => {
                    const subHasPaid = (sub.terms || []).some(t => t.status === 'paid');
                    const subDone = sub.status === 'completed';
                    const subTermPOs = paymentOrders.filter(po => (sub.terms || []).some(t => t.id === po.sourceRecordId));
                    const subPaid = subTermPOs.filter(po => po.status === '已執行').reduce((s, po) => s + getActualPaid(po), 0);
                    const rows = [(
                      <tr key={`sub-${sub.id}`} className="bg-blue-50/40 hover:bg-blue-50 border-b border-blue-100">
                        <td className="px-4 py-1.5 text-xs text-gray-400">↳</td>
                        <td className="px-4 py-1.5">
                          <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${typeColor[sub.contractType] || 'bg-gray-100 text-gray-400'}`}>{sub.contractType}</span>
                        </td>
                        <td className="px-4 py-1.5 font-mono text-xs text-blue-700">{sub.contractNo}</td>
                        <td className="px-4 py-1.5 text-xs">{sub.supplier?.name}</td>
                        <td className="px-4 py-1.5 text-right text-xs font-medium">
                          {formatNum(sub.totalAmount)}
                          {subPaid > 0 && <span className="ml-1 text-[10px] text-green-600">已付{formatNum(subPaid)}</span>}
                        </td>
                        <td className="px-4 py-1.5">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] ${subDone ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>{subDone ? '已完成' : '進行中'}</span>
                        </td>
                        <td className="px-4 py-1.5 text-xs text-gray-500">{sub.signDate || '—'}</td>
                        <td className="px-4 py-1.5 text-xs text-gray-400">{sub.terms?.length || 0} 期</td>
                        <td className="px-4 py-1.5 text-center whitespace-nowrap">
                          <button onClick={() => openEditContract(sub)} className="text-amber-500 hover:underline text-xs mr-1">編輯</button>
                          {!subHasPaid && <button onClick={() => deleteContract(sub)} className="text-red-400 hover:underline text-xs mr-1">刪</button>}
                          {sub.contractType === '分包' && (
                            <button onClick={() => openAddSubContract(sub, '工班')}
                              className="text-xs text-purple-500 hover:underline border border-purple-200 rounded px-1 py-0.5">＋工班</button>
                          )}
                        </td>
                      </tr>
                    )];
                    // 工班層（第三層）
                    (sub.subContracts || []).forEach(team => {
                      const teamDone = team.status === 'completed';
                      rows.push(
                        <tr key={`team-${team.id}`} className="bg-purple-50/30 hover:bg-purple-50/60 border-b border-purple-100">
                          <td className="px-4 py-1 text-xs text-gray-300">↳↳</td>
                          <td className="px-4 py-1">
                            <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-700">{team.contractType}</span>
                          </td>
                          <td className="px-4 py-1 font-mono text-xs text-purple-700">{team.contractNo}</td>
                          <td className="px-4 py-1 text-xs">{team.supplier?.name}</td>
                          <td className="px-4 py-1 text-right text-xs font-medium">{formatNum(team.totalAmount)}</td>
                          <td className="px-4 py-1">
                            <span className={`px-1.5 py-0.5 rounded text-[10px] ${teamDone ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>{teamDone ? '已完成' : '進行中'}</span>
                          </td>
                          <td className="px-4 py-1 text-xs text-gray-400">{team.signDate || '—'}</td>
                          <td className="px-4 py-1 text-xs text-gray-400">{team.terms?.length || 0} 期</td>
                          <td className="px-4 py-1 text-center whitespace-nowrap">
                            <button onClick={() => openEditContract(team)} className="text-amber-400 hover:underline text-xs mr-1">編輯</button>
                            {!(team.terms || []).some(t => t.status === 'paid') && <button onClick={() => deleteContract(team)} className="text-red-300 hover:underline text-xs">刪</button>}
                          </td>
                        </tr>
                      );
                    });
                    return rows;
                  })}
                  {/* 子合約金額彙整 */}
                  {subCount > 0 && (
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <td colSpan={3} className="px-4 py-1 text-[11px] text-gray-400">↳ 子合約小計（{subCount} 個，不計入工程案總發包）</td>
                      <td className="px-4 py-1" />
                      <td className="px-4 py-1 text-right text-[11px] text-gray-500 font-medium">{formatNum(subTotal)}</td>
                      <td colSpan={4} />
                    </tr>
                  )}
                  </Fragment>
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
              <div className="grid grid-cols-3 gap-3">
                <div><label htmlFor="con-f-4" className="block text-xs text-gray-500 mb-1">合約編號 *</label><input id="con-f-4" value={contractForm.contractNo} onChange={e => setContractForm(f => ({ ...f, contractNo: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" disabled={!!editingContract} /></div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">合約類型</label>
                  <div className="flex gap-1">
                    {['主合約','分包','工班'].map(t => (
                      <button key={t} type="button" onClick={() => setContractForm(f => ({ ...f, contractType: t }))}
                        className={`flex-1 py-2 rounded-lg text-xs border transition-colors ${contractForm.contractType === t ? ({ '主合約':'bg-amber-100 border-amber-400 text-amber-800', '分包':'bg-blue-100 border-blue-400 text-blue-800', '工班':'bg-purple-100 border-purple-400 text-purple-800' }[t]) : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
                <div><label htmlFor="con-f-5" className="block text-xs text-gray-500 mb-1">合約總金額</label><input id="con-f-5" type="number" value={contractForm.totalAmount} onChange={e => setContractForm(f => ({ ...f, totalAmount: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" step="0.01" /></div>
              </div>
              {contractForm.contractType !== '主合約' && (
                <div>
                  <label className="block text-xs text-gray-500 mb-1">上層合約（{contractForm.contractType === '分包' ? '主合約' : '分包合約'}）</label>
                  <select value={contractForm.parentContractId} onChange={e => setContractForm(f => ({ ...f, parentContractId: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm">
                    <option value="">不連結上層</option>
                    {contracts.filter(c => c.projectId === parseInt(contractForm.projectId) && ((contractForm.contractType === '分包' && c.contractType === '主合約') || (contractForm.contractType === '工班' && c.contractType === '分包'))).map(c => (
                      <option key={c.id} value={c.id}>{c.contractNo} ({c.supplier?.name}) NT${Number(c.totalAmount).toLocaleString('zh-TW')}</option>
                    ))}
                  </select>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div><label htmlFor="con-f-6" className="block text-xs text-gray-500 mb-1">簽約日</label><input id="con-f-6" type="date" value={contractForm.signDate} onChange={e => setContractForm(f => ({ ...f, signDate: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
                <div>
                  <label htmlFor="con-f-ret" className="block text-xs text-gray-500 mb-1">保留款比例（%）</label>
                  <div className="flex items-center gap-2">
                    <input
                      id="con-f-ret" type="number" min="0" max="100" step="0.01"
                      value={contractForm.retentionRate}
                      onChange={e => handleRetentionRateChange(e.target.value)}
                      className="w-full border rounded-lg px-3 py-2 text-sm"
                      placeholder="0 表示無保留款"
                    />
                    <span className="text-sm text-gray-400 shrink-0">%</span>
                  </div>
                  {contractForm.retentionRate > 0 && (
                    <p className="text-[11px] text-orange-500 mt-0.5">每期自動扣留 {contractForm.retentionRate}%</p>
                  )}
                </div>
              </div>
              <div><label htmlFor="con-f-7" className="block text-xs text-gray-500 mb-1">合約內容 *</label><textarea id="con-f-7" value={contractForm.content} onChange={e => setContractForm(f => ({ ...f, content: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" rows={3} placeholder="請填寫合約內容（必填）" /></div>

              {/* 付款期數區塊 */}
              <div className="flex justify-between items-center">
                <label className="text-xs text-gray-500">付款期數</label>
                <div className="flex gap-2">
                  <button type="button" onClick={() => addContractTermRow('regular')} className="text-amber-600 text-sm">＋ 一般期</button>
                  <button type="button" onClick={() => addContractTermRow('retention_release')} className="text-orange-600 text-sm">＋ 保留款撥付期</button>
                </div>
              </div>
              {(() => {
                const regularTerms = contractForm.terms.filter(t => (t.termType || 'regular') === 'regular');
                const regularSum = regularTerms.reduce((s, t) => s + (parseFloat(t.amount) || 0), 0);
                const contractTotal = parseFloat(contractForm.totalAmount) || 0;
                const hasMismatch = contractTotal > 0 && regularTerms.length > 0 && Math.abs(regularSum - contractTotal) > 0.01;
                const isMatch = contractTotal > 0 && regularTerms.length > 0 && !hasMismatch;
                const hasRetention = parseFloat(contractForm.retentionRate || 0) > 0;
                return (
                  <>
                    <div className={`border rounded-lg overflow-hidden ${hasMismatch ? 'border-red-300' : ''}`}>
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 sticky top-0 z-10">
                          <tr>
                            <th className="px-2 py-1 text-left">期別</th>
                            <th className="px-2 py-1 text-right">請款金額</th>
                            {hasRetention && <th className="px-2 py-1 text-right text-orange-500">保留款</th>}
                            {hasRetention && <th className="px-2 py-1 text-right">實付</th>}
                            <th className="px-2 py-1 text-left">到期日</th>
                            <th className="px-2 py-1 text-left">內容</th>
                            <th className="px-2 py-1 text-left">備註</th>
                            <th className="w-8" />
                          </tr>
                        </thead>
                        <tbody>
                          {contractForm.terms.length === 0 ? (
                            <tr><td colSpan={hasRetention ? 8 : 6} className="px-2 py-3 text-center text-gray-400 text-xs">尚未新增期數</td></tr>
                          ) : contractForm.terms.map((t, i) => {
                            const isPaid = t.status === 'paid';
                            const isRetentionRelease = t.termType === 'retention_release';
                            const amt = parseFloat(t.amount) || 0;
                            const retAmt = parseFloat(t.retentionAmount) || 0;
                            const payable = isRetentionRelease ? amt : amt - retAmt;
                            return (
                              <tr key={t.id || `new-${i}`} className={`border-t${isPaid ? ' bg-green-50' : isRetentionRelease ? ' bg-orange-50' : ''}`}>
                                <td className="px-2 py-1">
                                  <div className="flex items-center gap-1">
                                    <input value={t.termName} onChange={e => updateContractTerm(i, 'termName', e.target.value)} className="w-full border rounded px-2 py-0.5 text-sm disabled:bg-gray-100 disabled:text-gray-500" disabled={isPaid} />
                                    {isPaid && <span className="text-xs text-green-600 whitespace-nowrap">已付</span>}
                                    {isRetentionRelease && !isPaid && <span className="text-[10px] text-orange-600 whitespace-nowrap bg-orange-100 px-1 rounded">撥付</span>}
                                  </div>
                                </td>
                                <td className="px-2 py-1">
                                  <input type="number" value={t.amount} onChange={e => updateContractTerm(i, 'amount', e.target.value)} className="w-full border rounded px-2 py-0.5 text-sm text-right disabled:bg-gray-100" step="0.01" disabled={isPaid} />
                                </td>
                                {hasRetention && (
                                  <td className="px-2 py-1">
                                    {isRetentionRelease
                                      ? <span className="text-xs text-gray-400 px-2">—</span>
                                      : <input type="number" value={t.retentionAmount} onChange={e => updateContractTerm(i, 'retentionAmount', e.target.value)} className="w-full border rounded px-2 py-0.5 text-sm text-right text-orange-600 disabled:bg-gray-100" step="0.01" disabled={isPaid} />
                                    }
                                  </td>
                                )}
                                {hasRetention && (
                                  <td className="px-2 py-1 text-right text-xs text-gray-500 whitespace-nowrap">
                                    {amt > 0 ? formatNum(payable) : '—'}
                                  </td>
                                )}
                                <td className="px-2 py-1"><input type="date" value={t.dueDate} onChange={e => updateContractTerm(i, 'dueDate', e.target.value)} className="w-full border rounded px-2 py-0.5 text-sm disabled:bg-gray-100" disabled={isPaid} /></td>
                                <td className="px-2 py-1"><input value={t.content || ''} onChange={e => updateContractTerm(i, 'content', e.target.value)} className="w-full border rounded px-2 py-0.5 text-sm disabled:bg-gray-100" placeholder="付款內容" disabled={isPaid} /></td>
                                <td className="px-2 py-1"><input value={t.note || ''} onChange={e => updateContractTerm(i, 'note', e.target.value)} className="w-full border rounded px-2 py-0.5 text-sm disabled:bg-gray-100" placeholder="備註" disabled={isPaid} /></td>
                                <td className="px-2 py-1">{!isPaid && <button type="button" onClick={() => removeContractTermRow(i)} className="text-red-500">×</button>}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                        {contractForm.terms.length > 0 && (
                          <tfoot className={`border-t text-xs font-semibold ${hasMismatch ? 'bg-red-50' : isMatch ? 'bg-green-50' : 'bg-gray-50'}`}>
                            <tr>
                              <td className="px-2 py-1.5 text-gray-500">{`合計 ${contractForm.terms.length} 期`}</td>
                              <td className={`px-2 py-1.5 text-right font-bold ${hasMismatch ? 'text-red-600' : isMatch ? 'text-green-700' : 'text-gray-700'}`}>
                                {regularSum.toLocaleString()}
                                {contractForm.terms.some(t => t.termType === 'retention_release') && (
                                  <span className="text-orange-500 ml-1">(+撥付)</span>
                                )}
                              </td>
                              {hasRetention && (
                                <td className="px-2 py-1.5 text-right text-orange-600">
                                  {contractForm.terms.filter(t => (t.termType || 'regular') === 'regular').reduce((s, t) => s + (parseFloat(t.retentionAmount) || 0), 0).toLocaleString()}
                                </td>
                              )}
                              {hasRetention && <td />}
                              <td colSpan={3} className="px-2 py-1.5">
                                {contractTotal > 0 && (
                                  <span className={`text-xs ${hasMismatch ? 'text-red-600 font-semibold' : 'text-green-600'}`}>
                                    {hasMismatch ? `⚠ 合約金額 ${contractTotal.toLocaleString()}，差 ${(regularSum - contractTotal > 0 ? '+' : '') + (regularSum - contractTotal).toLocaleString()}` : '✓ 與合約金額相符'}
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
                        <span>一般期數合計 <strong>{regularSum.toLocaleString()}</strong> 與合約總金額 <strong>{contractTotal.toLocaleString()}</strong> 不符（相差 {Math.abs(regularSum - contractTotal).toLocaleString()}），請修正後才能存檔。</span>
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
              {editingContract && (
                <div className="border-t pt-3">
                  <label className="block text-xs text-gray-500 mb-1">修約原因（選填，將記入版本歷史）</label>
                  <input value={contractForm.changeReason} onChange={e => setContractForm(f => ({ ...f, changeReason: e.target.value }))}
                    className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="例：業主要求追加防水工程，合約金額調整" />
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setShowContractModal(false)} className="px-4 py-2 border rounded-lg text-sm" disabled={contractSaving}>取消</button>
              <button onClick={saveContract} disabled={contractSaving} className="px-4 py-2 bg-amber-600 text-white rounded-lg text-sm disabled:opacity-50">{contractSaving ? '儲存中…' : '儲存'}</button>
            </div>
          </div>
        </div>
      )}

      {/* 版本歷史 Modal */}
      {historyContract && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 overflow-y-auto py-4" onClick={() => setHistoryContract(null)}>
          <div className="bg-white rounded-xl shadow-2xl max-w-3xl w-full mx-4 p-6 my-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-bold">合約版本歷史</h3>
                <p className="text-sm text-gray-500 mt-0.5">
                  {historyContract.contractNo} · {historyContract.supplier?.name} · 目前版本 v{historyContract.currentVersion ?? 1}
                </p>
              </div>
              <button onClick={() => setHistoryContract(null)} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
            </div>

            {historyLoading ? (
              <div className="flex justify-center py-10">
                <div className="w-6 h-6 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
              </div>
            ) : historyVersions.length === 0 ? (
              <p className="text-center text-gray-400 py-8">尚無版本歷史記錄</p>
            ) : (
              <div className="space-y-3">
                {historyVersions.map(v => {
                  const snap = v.snapshot;
                  const isOpen = historyExpanded === v.id;
                  return (
                    <div key={v.id} className="border rounded-lg overflow-hidden">
                      <button className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-indigo-50 text-left transition-colors"
                        onClick={() => setHistoryExpanded(isOpen ? null : v.id)}>
                        <div className="flex items-center gap-3">
                          <span className="text-xs font-bold text-indigo-600 bg-indigo-100 px-2 py-0.5 rounded">v{v.version}</span>
                          <span className="text-sm font-medium text-gray-700">{v.changeReason || '（無說明）'}</span>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-gray-400">
                          <span>{new Date(v.createdAt).toLocaleString('zh-TW', { year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit' })}</span>
                          <span>{isOpen ? '▲' : '▼'}</span>
                        </div>
                      </button>
                      {isOpen && snap && (
                        <div className="px-4 py-3 text-sm bg-white">
                          <div className="grid grid-cols-3 gap-3 mb-3">
                            <div><span className="text-xs text-gray-400">合約金額</span><div className="font-medium">{formatNum(snap.totalAmount)}</div></div>
                            <div><span className="text-xs text-gray-400">保留比例</span><div className="font-medium">{snap.retentionRate > 0 ? `${(Number(snap.retentionRate) * 100).toFixed(1)}%` : '無'}</div></div>
                            <div><span className="text-xs text-gray-400">簽約日</span><div className="font-medium">{snap.signDate || '—'}</div></div>
                          </div>
                          {snap.terms?.length > 0 && (
                            <table className="w-full text-xs border-collapse mb-3">
                              <thead className="bg-gray-50">
                                <tr>
                                  <th className="px-2 py-1 text-left font-medium text-gray-500">期別</th>
                                  <th className="px-2 py-1 text-right font-medium text-gray-500">請款</th>
                                  <th className="px-2 py-1 text-right font-medium text-gray-500">扣留</th>
                                  <th className="px-2 py-1 text-left font-medium text-gray-500">到期日</th>
                                  <th className="px-2 py-1 text-left font-medium text-gray-500">狀態</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y">
                                {snap.terms.map((t, i) => (
                                  <tr key={i} className={t.termType === 'retention_release' ? 'bg-orange-50' : ''}>
                                    <td className="px-2 py-1">{t.termName || `第${t.termNo}期`}</td>
                                    <td className="px-2 py-1 text-right">{formatNum(t.amount)}</td>
                                    <td className="px-2 py-1 text-right text-orange-500">{t.retentionAmount > 0 ? formatNum(t.retentionAmount) : '—'}</td>
                                    <td className="px-2 py-1">{t.dueDate || '—'}</td>
                                    <td className="px-2 py-1">
                                      <span className={`px-1.5 py-0.5 rounded text-[10px] ${t.status === 'paid' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>{t.status === 'paid' ? '已付' : '待付'}</span>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                          {snap.content && (
                            <div className="mb-2">
                              <span className="text-xs text-gray-400">合約內容：</span>
                              <p className="text-gray-600 mt-0.5 whitespace-pre-wrap text-xs bg-gray-50 rounded px-2 py-1">{snap.content}</p>
                            </div>
                          )}
                          {snap.note && <div className="text-xs text-gray-400">備註：{snap.note}</div>}
                        </div>
                      )}
                    </div>
                  );
                })}
                {/* 目前版本說明 */}
                <div className="border border-indigo-200 rounded-lg px-4 py-3 bg-indigo-50">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-indigo-700 bg-indigo-200 px-2 py-0.5 rounded">v{historyContract.currentVersion ?? 1}（目前）</span>
                    <span className="text-sm text-indigo-600">現行合約版本（請在「合約與期數」頁面查閱）</span>
                  </div>
                </div>
              </div>
            )}
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
