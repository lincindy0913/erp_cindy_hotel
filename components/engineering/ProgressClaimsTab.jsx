'use client';
import { useState, useEffect, useMemo } from 'react';
import { useToast } from '@/context/ToastContext';
import ConfirmModal, { useConfirmDialog } from '@/components/ConfirmModal';
import { todayStr } from '@/lib/localDate';
import FetchErrorBanner from '@/components/FetchErrorBanner';

const STATUS_LABELS = { draft: '草稿', submitted: '已提交', certified: '已核定', rejected: '退件' };
const STATUS_COLORS = {
  draft: 'bg-gray-100 text-gray-500',
  submitted: 'bg-blue-100 text-blue-700',
  certified: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-600',
};
const STATUSES = ['draft', 'submitted', 'certified', 'rejected'];

function formatNum(n) {
  if (n == null || n === '') return '－';
  return Number(n).toLocaleString('zh-TW', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

export default function ProgressClaimsTab({ projects }) {
  const [claims, setClaims] = useState([]);
  const [claimsError, setClaimsError] = useState(null);
  const [filterProjectId, setFilterProjectId] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingClaim, setEditingClaim] = useState(null);
  const [saving, setSaving] = useState(false);

  const emptyForm = {
    projectId: '', claimNo: '', termName: '', claimDate: todayStr(),
    certifiedDate: '', claimAmount: '', certifiedAmount: '', status: 'draft', note: '',
  };
  const [form, setForm] = useState(emptyForm);

  const { showToast } = useToast();
  const { dialog: confirmDlg, confirm: askConfirm, close: closeConfirm } = useConfirmDialog();

  useEffect(() => {
    fetchClaims(filterProjectId || undefined);
  }, [filterProjectId]);

  async function fetchClaims(pid) {
    try {
      const url = pid ? `/api/engineering/progress-claims?projectId=${pid}` : '/api/engineering/progress-claims';
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setClaimsError(null);
      setClaims(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error('[fetchClaims]', e);
      setClaimsError('估驗計價資料載入失敗，請重試。');
      setClaims([]);
    }
  }

  function openAdd() {
    setEditingClaim(null);
    setForm({ ...emptyForm, projectId: filterProjectId || (projects[0]?.id ? String(projects[0].id) : '') });
    setShowModal(true);
  }

  function openEdit(c) {
    setEditingClaim(c);
    setForm({
      projectId: String(c.projectId), claimNo: c.claimNo || '', termName: c.termName,
      claimDate: c.claimDate || '', certifiedDate: c.certifiedDate || '',
      claimAmount: String(c.claimAmount), certifiedAmount: c.certifiedAmount != null ? String(c.certifiedAmount) : '',
      status: c.status, note: c.note || '',
    });
    setShowModal(true);
  }

  async function save() {
    if (!form.projectId) { showToast('請選擇工程案', 'error'); return; }
    if (!form.termName?.trim()) { showToast('請填寫期別名稱', 'error'); return; }
    if (!form.claimAmount) { showToast('請填寫申報金額', 'error'); return; }
    setSaving(true);
    try {
      const url = editingClaim ? `/api/engineering/progress-claims/${editingClaim.id}` : '/api/engineering/progress-claims';
      const method = editingClaim ? 'PUT' : 'POST';
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      const data = await res.json();
      if (!res.ok) { showToast(data.error?.message || '儲存失敗', 'error'); return; }
      showToast(editingClaim ? '已更新估驗單' : '已新增估驗單', 'success');
      setShowModal(false);
      fetchClaims(filterProjectId || undefined);
    } catch { showToast('儲存失敗', 'error'); }
    finally { setSaving(false); }
  }

  function deleteClaim(c) {
    askConfirm(`確定刪除估驗單「${c.termName}」？`, async () => {
      try {
        const res = await fetch(`/api/engineering/progress-claims/${c.id}`, { method: 'DELETE' });
        const data = await res.json();
        if (!res.ok) { showToast(data.error?.message || '刪除失敗', 'error'); return; }
        fetchClaims(filterProjectId || undefined);
      } catch { showToast('刪除失敗', 'error'); }
    });
  }

  const grouped = useMemo(() => {
    const map = {};
    for (const c of claims) {
      const key = String(c.projectId);
      if (!map[key]) map[key] = { project: c.project, claims: [] };
      map[key].claims.push(c);
    }
    return Object.values(map);
  }, [claims]);

  return (
    <div>
      {claimsError && <FetchErrorBanner message={claimsError} onRetry={() => fetchClaims(filterProjectId || undefined)} className="mb-4" />}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <select value={filterProjectId} onChange={e => setFilterProjectId(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm min-w-[200px]">
            <option value="">全部工程案</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.code} {p.name}</option>)}
          </select>
          <span className="text-sm text-gray-500">共 {claims.length} 筆</span>
        </div>
        <button onClick={openAdd} className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700">
          ＋ 新增估驗單
        </button>
      </div>

      {grouped.length === 0 ? (
        <div className="bg-white rounded-lg border border-gray-200 p-10 text-center text-gray-400">
          尚無估驗紀錄，請按「新增估驗單」建立第一筆
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.map(({ project, claims: pClaims }) => {
            const totalClaim = pClaims.reduce((s, c) => s + c.claimAmount, 0);
            const totalCertified = pClaims.filter(c => c.certifiedAmount != null).reduce((s, c) => s + (c.certifiedAmount || 0), 0);
            const totalInvoiced = pClaims.reduce((s, c) => s + (c.outputInvoices || []).reduce((ss, i) => ss + i.totalAmount, 0), 0);
            const totalReceived = pClaims.reduce((s, c) => s + (c.incomes || []).reduce((ss, i) => ss + i.amount, 0), 0);
            return (
              <div key={project?.id} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                {/* 工程案標題 */}
                <div className="bg-gradient-to-r from-indigo-50 to-blue-50 border-b px-5 py-3 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs bg-white border text-gray-600 px-2 py-0.5 rounded">{project?.code}</span>
                    <span className="font-bold text-gray-900">{project?.name}</span>
                    {project?.clientName && <span className="text-sm text-gray-500">業主：{project.clientName}</span>}
                  </div>
                  <div className="flex gap-5 text-sm">
                    <span className="text-gray-500">申報 <span className="font-semibold text-gray-800">{formatNum(totalClaim)}</span></span>
                    <span className="text-gray-500">核定 <span className="font-semibold text-green-700">{formatNum(totalCertified)}</span></span>
                    <span className="text-gray-500">開票 <span className="font-semibold text-blue-700">{formatNum(totalInvoiced)}</span></span>
                    <span className="text-gray-500">收款 <span className="font-semibold text-teal-700">{formatNum(totalReceived)}</span></span>
                  </div>
                </div>

                {/* 估驗清單 */}
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b text-xs text-gray-500">
                      <tr>
                        <th className="px-4 py-2 text-left">估驗編號</th>
                        <th className="px-4 py-2 text-left">期別</th>
                        <th className="px-4 py-2 text-left">申報日</th>
                        <th className="px-4 py-2 text-right">申報金額</th>
                        <th className="px-4 py-2 text-left">核定日</th>
                        <th className="px-4 py-2 text-right">核定金額</th>
                        <th className="px-4 py-2 text-center">狀態</th>
                        <th className="px-4 py-2 text-left">計價（發票）</th>
                        <th className="px-4 py-2 text-left">收款</th>
                        <th className="px-4 py-2 text-center">操作</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {pClaims.map(c => {
                        const invoicedAmt = (c.outputInvoices || []).reduce((s, i) => s + i.totalAmount, 0);
                        const receivedAmt = (c.incomes || []).reduce((s, i) => s + i.amount, 0);
                        const certified = c.certifiedAmount ?? c.claimAmount;
                        const certifiedDiff = c.certifiedAmount != null ? c.certifiedAmount - c.claimAmount : null;
                        return (
                          <tr key={c.id} className="hover:bg-gray-50">
                            <td className="px-4 py-2 font-mono text-xs text-gray-500">{c.claimNo || <span className="text-gray-300">—</span>}</td>
                            <td className="px-4 py-2 font-medium">{c.termName}</td>
                            <td className="px-4 py-2 text-gray-600">{c.claimDate || '—'}</td>
                            <td className="px-4 py-2 text-right">{formatNum(c.claimAmount)}</td>
                            <td className="px-4 py-2 text-gray-600">{c.certifiedDate || '—'}</td>
                            <td className="px-4 py-2 text-right">
                              {c.certifiedAmount != null
                                ? <span className="text-green-700 font-medium">{formatNum(c.certifiedAmount)}</span>
                                : <span className="text-gray-300">待核定</span>
                              }
                              {certifiedDiff != null && certifiedDiff !== 0 && (
                                <span className={`ml-1 text-xs ${certifiedDiff < 0 ? 'text-red-500' : 'text-green-500'}`}>
                                  ({certifiedDiff > 0 ? '+' : ''}{formatNum(certifiedDiff)})
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-2 text-center">
                              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[c.status] || 'bg-gray-100 text-gray-500'}`}>
                                {STATUS_LABELS[c.status] || c.status}
                              </span>
                            </td>
                            <td className="px-4 py-2">
                              {(c.outputInvoices || []).length === 0
                                ? <span className="text-gray-300 text-xs">未開票</span>
                                : (
                                  <div className="space-y-0.5">
                                    {c.outputInvoices.map(i => (
                                      <div key={i.id} className="text-xs text-blue-700">
                                        {i.invoiceNo || `ID:${i.id}`} <span className="text-gray-500">{i.invoiceDate}</span> <span className="font-medium">{formatNum(i.totalAmount)}</span>
                                        <span className={`ml-1 px-1 rounded ${i.status === '已作廢' ? 'bg-red-50 text-red-400' : 'bg-green-50 text-green-600'}`}>{i.status}</span>
                                      </div>
                                    ))}
                                    <div className="text-xs text-gray-400 mt-0.5">合計 {formatNum(invoicedAmt)}</div>
                                  </div>
                                )
                              }
                            </td>
                            <td className="px-4 py-2">
                              {(c.incomes || []).length === 0
                                ? <span className="text-gray-300 text-xs">未收款</span>
                                : (
                                  <div className="space-y-0.5">
                                    {c.incomes.map(i => (
                                      <div key={i.id} className="text-xs text-teal-700">
                                        {i.termName} <span className="text-gray-500">{i.receivedDate}</span> <span className="font-medium">{formatNum(i.amount)}</span>
                                      </div>
                                    ))}
                                    <div className="text-xs text-gray-400 mt-0.5">合計 {formatNum(receivedAmt)}</div>
                                  </div>
                                )
                              }
                            </td>
                            <td className="px-4 py-2 text-center whitespace-nowrap">
                              <button onClick={() => openEdit(c)} className="text-indigo-600 hover:underline text-xs mr-2">編輯</button>
                              {(c.outputInvoices || []).length === 0 && (c.incomes || []).length === 0 && (
                                <button onClick={() => deleteClaim(c)} className="text-red-500 hover:underline text-xs">刪除</button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    {pClaims.length > 1 && (
                      <tfoot className="bg-indigo-50 border-t text-xs font-semibold">
                        <tr>
                          <td colSpan={3} className="px-4 py-2 text-gray-500">合計 {pClaims.length} 筆</td>
                          <td className="px-4 py-2 text-right">{formatNum(totalClaim)}</td>
                          <td />
                          <td className="px-4 py-2 text-right text-green-700">{formatNum(totalCertified)}</td>
                          <td />
                          <td className="px-4 py-2 text-blue-700">{formatNum(totalInvoiced)}</td>
                          <td className="px-4 py-2 text-teal-700">{formatNum(totalReceived)}</td>
                          <td />
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 overflow-y-auto py-4" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full mx-4 p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-4">{editingClaim ? '編輯估驗單' : '新增估驗單'}</h3>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">工程案 *</label>
                  <select value={form.projectId} onChange={e => setForm(f => ({ ...f, projectId: e.target.value }))}
                    className="w-full border rounded-lg px-3 py-2 text-sm" disabled={!!editingClaim}>
                    <option value="">請選擇</option>
                    {projects.map(p => <option key={p.id} value={p.id}>{p.code} {p.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">估驗編號</label>
                  <input value={form.claimNo} onChange={e => setForm(f => ({ ...f, claimNo: e.target.value }))}
                    className="w-full border rounded-lg px-3 py-2 text-sm font-mono" placeholder="業主給的估驗單號" />
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">期別名稱 *</label>
                <input value={form.termName} onChange={e => setForm(f => ({ ...f, termName: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="例：第1期估驗" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">申報日期</label>
                  <input type="date" value={form.claimDate} onChange={e => setForm(f => ({ ...f, claimDate: e.target.value }))}
                    className="w-full border rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">申報金額 *</label>
                  <input type="number" value={form.claimAmount} onChange={e => setForm(f => ({ ...f, claimAmount: e.target.value }))}
                    className="w-full border rounded-lg px-3 py-2 text-sm" step="1" min="0" />
                </div>
              </div>
              <div className="border-t pt-3">
                <p className="text-xs text-gray-400 mb-2">業主核定（待核定後填寫）</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">核定日期</label>
                    <input type="date" value={form.certifiedDate} onChange={e => setForm(f => ({ ...f, certifiedDate: e.target.value }))}
                      className="w-full border rounded-lg px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">核定金額</label>
                    <input type="number" value={form.certifiedAmount} onChange={e => setForm(f => ({ ...f, certifiedAmount: e.target.value }))}
                      className="w-full border rounded-lg px-3 py-2 text-sm" step="1" min="0" placeholder="留空表示待核定" />
                  </div>
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">狀態</label>
                <div className="flex gap-2 flex-wrap">
                  {STATUSES.map(s => (
                    <button key={s} type="button"
                      onClick={() => setForm(f => ({ ...f, status: s }))}
                      className={`px-3 py-1 rounded-full text-xs border transition-colors ${form.status === s ? (STATUS_COLORS[s] + ' border-current font-semibold') : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
                      {STATUS_LABELS[s]}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">備註</label>
                <textarea value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2 text-sm" rows={2} />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 border rounded-lg text-sm" disabled={saving}>取消</button>
              <button onClick={save} disabled={saving} className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm disabled:opacity-50">
                {saving ? '儲存中…' : '儲存'}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal dialog={confirmDlg} onClose={closeConfirm} />
    </div>
  );
}
