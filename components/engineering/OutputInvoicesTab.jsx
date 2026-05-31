'use client';
import { useState, useEffect } from 'react';
import { useToast } from '@/context/ToastContext';
import { useConfirm } from '@/context/ConfirmContext';
import { sortRows, useColumnSort, SortableTh } from '@/components/SortableTh';

const OUTPUT_INVOICE_TYPES = ['電子發票', '紙本發票', '三聯式統一發票', '二聯式統一發票'];
const OUTPUT_INVOICE_STATUSES = ['已開立', '已作廢'];

export default function OutputInvoicesTab({ projects, progressClaims = [], onDashStatsChanged }) {
  const [outputInvoices, setOutputInvoices] = useState([]);
  const [projectFilter, setProjectFilter] = useState('');
  const [showOutputModal, setShowOutputModal] = useState(false);
  const [editingOutputInv, setEditingOutputInv] = useState(null);
  const [outputInvSaving, setOutputInvSaving] = useState(false);
  const emptyForm = { projectId: '', progressClaimId: '', clientName: '', invoiceNo: '', invoiceDate: '', amount: '', taxAmount: '', totalAmount: '', invoiceType: '電子發票', status: '已開立', note: '' };
  const [outputForm, setOutputForm] = useState(emptyForm);

  const { showToast } = useToast();
  const confirm = useConfirm();
  const { sortKey, sortDir, toggleSort } = useColumnSort('invoiceDate', 'desc');

  useEffect(() => {
    fetchOutputInvoices(projectFilter || undefined);
  }, []);

  async function fetchOutputInvoices(pid) {
    try {
      const url = pid ? `/api/engineering/output-invoices?projectId=${pid}` : '/api/engineering/output-invoices';
      const res = await fetch(url);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setOutputInvoices(Array.isArray(data) ? data : []);
    } catch { setOutputInvoices([]); }
  }

  async function saveOutputInvoice() {
    if (!outputForm.projectId) { showToast('請選擇工程案', 'error'); return; }
    if (!outputForm.invoiceDate) { showToast('請填寫發票日期', 'error'); return; }
    setOutputInvSaving(true);
    try {
      const url = editingOutputInv ? `/api/engineering/output-invoices/${editingOutputInv.id}` : '/api/engineering/output-invoices';
      const method = editingOutputInv ? 'PUT' : 'POST';
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(outputForm) });
      const data = await res.json();
      if (!res.ok) { showToast(data.error?.message || '儲存失敗', 'error'); return; }
      showToast(editingOutputInv ? '已更新' : '已新增', 'success');
      setShowOutputModal(false);
      fetchOutputInvoices(projectFilter || undefined);
      onDashStatsChanged?.();
    } catch { showToast('儲存失敗', 'error'); }
    finally { setOutputInvSaving(false); }
  }

  async function deleteOutputInvoice(inv) {
    if (!(await confirm(`確定刪除發票「${inv.invoiceNo || inv.id}」？`, { title: '刪除確認', danger: true }))) return;
    const res = await fetch(`/api/engineering/output-invoices/${inv.id}`, { method: 'DELETE' });
    if (!res.ok) { showToast('刪除失敗', 'error'); return; }
    fetchOutputInvoices(projectFilter || undefined);
    onDashStatsChanged?.();
  }

  const sorted = sortRows(outputInvoices, sortKey, sortDir, {
    projectCode: inv => `${inv.project?.code || ''} ${inv.project?.name || ''}`,
    clientName: inv => inv.clientName || inv.project?.clientName || '',
    amount: inv => Number(inv.amount || 0),
    taxAmount: inv => Number(inv.taxAmount || 0),
    totalAmount: inv => Number(inv.totalAmount || 0),
  });

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <select value={projectFilter} onChange={e => { setProjectFilter(e.target.value); fetchOutputInvoices(e.target.value || undefined); }}
            className="border rounded-lg px-3 py-2 text-sm min-w-[200px]">
            <option value="">全部工程案</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.code} {p.name}</option>)}
          </select>
          <span className="text-sm text-gray-500">共 {outputInvoices.length} 筆</span>
        </div>
        <button onClick={() => { setEditingOutputInv(null); setOutputForm({ ...emptyForm, projectId: projectFilter, progressClaimId: '' }); setShowOutputModal(true); }}
          className="px-4 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700">
          + 新增銷項發票
        </button>
      </div>
      <div className="bg-white rounded-lg shadow overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-green-50 text-xs sticky top-0 z-10">
            <tr>
              <SortableTh label="工程案" colKey="projectCode" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="px-3 py-2" />
              <SortableTh label="業主名稱" colKey="clientName" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="px-3 py-2" />
              <SortableTh label="發票號碼" colKey="invoiceNo" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="px-3 py-2" />
              <SortableTh label="發票日期" colKey="invoiceDate" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="px-3 py-2" />
              <SortableTh label="未稅金額" colKey="amount" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="px-3 py-2" align="right" />
              <SortableTh label="稅額" colKey="taxAmount" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="px-3 py-2" align="right" />
              <SortableTh label="含稅金額" colKey="totalAmount" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="px-3 py-2" align="right" />
              <SortableTh label="類型" colKey="invoiceType" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="px-3 py-2" />
              <SortableTh label="狀態" colKey="status" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="px-3 py-2" />
              <th className="text-left px-3 py-2 text-sm font-medium text-gray-700 whitespace-nowrap">連結估驗</th>
              <th className="text-left px-3 py-2 text-sm font-medium text-gray-700 whitespace-nowrap">備註</th>
              <th className="text-center px-3 py-2 text-sm font-medium text-gray-700 whitespace-nowrap">操作</th>
            </tr>
          </thead>
          <tbody>
            {outputInvoices.length === 0 ? (
              <tr><td colSpan={11} className="text-center py-10 text-gray-400">尚無銷項發票紀錄，請按「新增銷項發票」開始登錄</td></tr>
            ) : sorted.map(inv => (
              <tr key={inv.id} className="border-t hover:bg-gray-50">
                <td className="px-3 py-2 text-xs text-gray-600">{inv.project?.code} {inv.project?.name}</td>
                <td className="px-3 py-2 font-medium">{inv.clientName || inv.project?.clientName || <span className="text-gray-300">—</span>}</td>
                <td className="px-3 py-2 font-mono text-xs">{inv.invoiceNo || <span className="text-gray-300">—</span>}</td>
                <td className="px-3 py-2">{inv.invoiceDate}</td>
                <td className="px-3 py-2 text-right">{Number(inv.amount).toLocaleString('zh-TW')}</td>
                <td className="px-3 py-2 text-right text-gray-500">{Number(inv.taxAmount).toLocaleString('zh-TW')}</td>
                <td className="px-3 py-2 text-right font-semibold text-green-700">{Number(inv.totalAmount).toLocaleString('zh-TW')}</td>
                <td className="px-3 py-2 text-xs">{inv.invoiceType || '—'}</td>
                <td className="px-3 py-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${inv.status === '已作廢' ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-700'}`}>{inv.status}</span>
                </td>
                <td className="px-3 py-2 text-xs">
                  {inv.progressClaim
                    ? <span className="text-indigo-600">{inv.progressClaim.termName}{inv.progressClaim.claimNo ? ` (${inv.progressClaim.claimNo})` : ''}</span>
                    : <span className="text-gray-300">—</span>
                  }
                </td>
                <td className="px-3 py-2 text-xs text-gray-400 max-w-[120px] truncate" title={inv.note || ''}>{inv.note || '—'}</td>
                <td className="px-3 py-2 text-center whitespace-nowrap">
                  <button onClick={() => { setEditingOutputInv(inv); setOutputForm({ projectId: String(inv.projectId), progressClaimId: inv.progressClaimId ? String(inv.progressClaimId) : '', clientName: inv.clientName || '', invoiceNo: inv.invoiceNo || '', invoiceDate: inv.invoiceDate, amount: String(inv.amount), taxAmount: String(inv.taxAmount), totalAmount: String(inv.totalAmount), invoiceType: inv.invoiceType || '電子發票', status: inv.status, note: inv.note || '' }); setShowOutputModal(true); }}
                    className="text-blue-500 hover:underline text-xs mr-2">編輯</button>
                  <button onClick={() => deleteOutputInvoice(inv)} className="text-red-500 hover:underline text-xs">刪除</button>
                </td>
              </tr>
            ))}
          </tbody>
          {outputInvoices.length > 0 && (
            <tfoot className="bg-green-50 border-t-2 border-green-100 text-xs font-semibold">
              <tr>
                <td colSpan={4} className="px-3 py-2">合計 {outputInvoices.length} 筆</td>
                <td className="px-3 py-2 text-right">{outputInvoices.reduce((s, i) => s + Number(i.amount), 0).toLocaleString('zh-TW')}</td>
                <td className="px-3 py-2 text-right text-gray-500">{outputInvoices.reduce((s, i) => s + Number(i.taxAmount), 0).toLocaleString('zh-TW')}</td>
                <td className="px-3 py-2 text-right text-green-700">{outputInvoices.reduce((s, i) => s + Number(i.totalAmount), 0).toLocaleString('zh-TW')}</td>
                <td colSpan={4} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {showOutputModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 overflow-y-auto py-4" onClick={() => setShowOutputModal(false)}>
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full mx-4 p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-4">{editingOutputInv ? '編輯業主銷項發票' : '新增業主銷項發票'}</h3>
            <div className="space-y-3">
              <div>
                <label htmlFor="out-f-1" className="block text-xs text-gray-500 mb-1">工程案 *</label>
                <select id="out-f-1" value={outputForm.projectId} onChange={e => {
                  const pid = e.target.value;
                  const proj = projects.find(p => String(p.id) === pid);
                  setOutputForm(f => ({ ...f, projectId: pid, clientName: proj?.clientName || f.clientName }));
                }} className="w-full border rounded-lg px-3 py-2 text-sm" disabled={!!editingOutputInv}>
                  <option value="">請選擇</option>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.code} {p.name}</option>)}
                </select>
              </div>
              {(() => {
                const pid = outputForm.projectId ? parseInt(outputForm.projectId) : null;
                const claimsForProject = pid ? progressClaims.filter(c => c.projectId === pid) : [];
                return claimsForProject.length > 0 ? (
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">連結估驗單（選填）</label>
                    <select value={outputForm.progressClaimId} onChange={e => setOutputForm(f => ({ ...f, progressClaimId: e.target.value }))}
                      className="w-full border rounded-lg px-3 py-2 text-sm">
                      <option value="">不連結估驗單</option>
                      {claimsForProject.map(c => (
                        <option key={c.id} value={c.id}>{c.termName}{c.claimNo ? ` (${c.claimNo})` : ''} — 申報 {Number(c.claimAmount).toLocaleString('zh-TW')}</option>
                      ))}
                    </select>
                  </div>
                ) : null;
              })()}
              <div>
                <label htmlFor="out-f-2" className="block text-xs text-gray-500 mb-1">業主名稱</label>
                <input id="out-f-2" value={outputForm.clientName} onChange={e => setOutputForm(f => ({ ...f, clientName: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="由工程案帶入或手動修改" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="out-f-3" className="block text-xs text-gray-500 mb-1">發票號碼</label>
                  <input id="out-f-3" value={outputForm.invoiceNo} onChange={e => setOutputForm(f => ({ ...f, invoiceNo: e.target.value }))}
                    className="w-full border rounded-lg px-3 py-2 text-sm font-mono" placeholder="AB-12345678" />
                </div>
                <div>
                  <label htmlFor="out-f-4" className="block text-xs text-gray-500 mb-1">發票日期 *</label>
                  <input id="out-f-4" type="date" value={outputForm.invoiceDate} onChange={e => setOutputForm(f => ({ ...f, invoiceDate: e.target.value }))}
                    className="w-full border rounded-lg px-3 py-2 text-sm" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label htmlFor="out-f-5" className="block text-xs text-gray-500 mb-1">未稅金額</label>
                  <input id="out-f-5" type="number" value={outputForm.amount} onChange={e => {
                    const amt = e.target.value;
                    const tax = parseFloat(outputForm.taxAmount) || 0;
                    setOutputForm(f => ({ ...f, amount: amt, totalAmount: String((parseFloat(amt) || 0) + tax) }));
                  }} className="w-full border rounded-lg px-3 py-2 text-sm" step="1" min="0" />
                </div>
                <div>
                  <label htmlFor="out-f-6" className="block text-xs text-gray-500 mb-1">稅額</label>
                  <input id="out-f-6" type="number" value={outputForm.taxAmount} onChange={e => {
                    const tax = e.target.value;
                    const amt = parseFloat(outputForm.amount) || 0;
                    setOutputForm(f => ({ ...f, taxAmount: tax, totalAmount: String(amt + (parseFloat(tax) || 0)) }));
                  }} className="w-full border rounded-lg px-3 py-2 text-sm" step="1" min="0" />
                </div>
                <div>
                  <label htmlFor="out-f-7" className="block text-xs text-gray-500 mb-1">含稅金額</label>
                  <input id="out-f-7" type="number" value={outputForm.totalAmount} onChange={e => setOutputForm(f => ({ ...f, totalAmount: e.target.value }))}
                    className="w-full border rounded-lg px-3 py-2 text-sm bg-green-50" step="1" />
                </div>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => {
                  const amt = parseFloat(outputForm.amount) || 0;
                  const tax = Math.round(amt * 0.05);
                  setOutputForm(f => ({ ...f, taxAmount: String(tax), totalAmount: String(amt + tax) }));
                }} className="text-xs px-2 py-1 bg-gray-100 hover:bg-gray-200 rounded border text-gray-600">自動計算 5% 稅額</button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="out-f-8" className="block text-xs text-gray-500 mb-1">發票類型</label>
                  <select id="out-f-8" value={outputForm.invoiceType} onChange={e => setOutputForm(f => ({ ...f, invoiceType: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm">
                    {OUTPUT_INVOICE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="out-f-9" className="block text-xs text-gray-500 mb-1">狀態</label>
                  <select id="out-f-9" value={outputForm.status} onChange={e => setOutputForm(f => ({ ...f, status: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm">
                    {OUTPUT_INVOICE_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label htmlFor="out-f-10" className="block text-xs text-gray-500 mb-1">備註</label>
                <input id="out-f-10" value={outputForm.note} onChange={e => setOutputForm(f => ({ ...f, note: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setShowOutputModal(false)} className="px-4 py-2 border rounded-lg text-sm" disabled={outputInvSaving}>取消</button>
              <button onClick={saveOutputInvoice} disabled={outputInvSaving} className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm disabled:opacity-50">
                {outputInvSaving ? '儲存中…' : '儲存'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
