'use client';
import { useState, useEffect } from 'react';
import { useToast } from '@/context/ToastContext';
import { useConfirm } from '@/context/ConfirmContext';
import { sortRows, useColumnSort, SortableTh } from '@/components/SortableTh';
import FetchErrorBanner from '@/components/FetchErrorBanner';

const INPUT_INVOICE_TYPES = ['電子發票', '紙本發票', '三聯式統一發票', '二聯式統一發票'];
const INPUT_INVOICE_STATUSES = ['已取得', '已對帳', '已入帳'];

export default function InputInvoicesTab({ projects, contracts, onDashStatsChanged }) {
  const [inputInvoices, setInputInvoices] = useState([]);
  const [inputInvoicesError, setInputInvoicesError] = useState(null);
  const [projectFilter, setProjectFilter] = useState('');
  const [showInputModal, setShowInputModal] = useState(false);
  const [editingInputInv, setEditingInputInv] = useState(null);
  const [inputInvSaving, setInputInvSaving] = useState(false);
  const emptyForm = { projectId: '', contractId: '', supplierName: '', invoiceNo: '', invoiceDate: '', amount: '', taxAmount: '', totalAmount: '', invoiceType: '電子發票', status: '已取得', note: '' };
  const [inputForm, setInputForm] = useState(emptyForm);

  const { showToast } = useToast();
  const confirm = useConfirm();
  const { sortKey, sortDir, toggleSort } = useColumnSort('invoiceDate', 'desc');

  useEffect(() => {
    fetchInputInvoices(projectFilter || undefined);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function fetchInputInvoices(pid) {
    try {
      const url = pid ? `/api/engineering/input-invoices?projectId=${pid}` : '/api/engineering/input-invoices';
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setInputInvoicesError(null);
      setInputInvoices(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error('[fetchInputInvoices]', e);
      setInputInvoicesError('廠商進項發票資料載入失敗，請重試。');
      setInputInvoices([]);
    }
  }

  async function saveInputInvoice() {
    if (!inputForm.projectId) { showToast('請選擇工程案', 'error'); return; }
    if (!inputForm.invoiceDate) { showToast('請填寫發票日期', 'error'); return; }
    setInputInvSaving(true);
    try {
      const url = editingInputInv ? `/api/engineering/input-invoices/${editingInputInv.id}` : '/api/engineering/input-invoices';
      const method = editingInputInv ? 'PUT' : 'POST';
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(inputForm) });
      const data = await res.json();
      if (!res.ok) { showToast(data.error?.message || '儲存失敗', 'error'); return; }
      showToast(editingInputInv ? '已更新' : '已新增', 'success');
      setShowInputModal(false);
      fetchInputInvoices(projectFilter || undefined);
      onDashStatsChanged?.();
    } catch { showToast('儲存失敗', 'error'); }
    finally { setInputInvSaving(false); }
  }

  async function deleteInputInvoice(inv) {
    if (!(await confirm(`確定刪除發票「${inv.invoiceNo || inv.id}」？`, { title: '刪除確認', danger: true }))) return;
    const res = await fetch(`/api/engineering/input-invoices/${inv.id}`, { method: 'DELETE' });
    if (!res.ok) { showToast('刪除失敗', 'error'); return; }
    fetchInputInvoices(projectFilter || undefined);
    onDashStatsChanged?.();
  }

  const sorted = sortRows(inputInvoices, sortKey, sortDir, {
    projectCode: inv => `${inv.project?.code || ''} ${inv.project?.name || ''}`,
    supplierName: inv => inv.supplierName || inv.contract?.supplier?.name || '',
    amount: inv => Number(inv.amount || 0),
    taxAmount: inv => Number(inv.taxAmount || 0),
    totalAmount: inv => Number(inv.totalAmount || 0),
  });

  return (
    <div>
      {inputInvoicesError && <FetchErrorBanner message={inputInvoicesError} onRetry={() => fetchInputInvoices(projectFilter || undefined)} className="mb-4" />}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <select value={projectFilter} onChange={e => { setProjectFilter(e.target.value); fetchInputInvoices(e.target.value || undefined); }}
            className="border rounded-lg px-3 py-2 text-sm min-w-[200px]">
            <option value="">全部工程案</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.code} {p.name}</option>)}
          </select>
          <span className="text-sm text-gray-500">共 {inputInvoices.length} 筆</span>
        </div>
        <button onClick={() => { setEditingInputInv(null); setInputForm({ ...emptyForm, projectId: projectFilter }); setShowInputModal(true); }}
          className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700">
          + 新增進項發票
        </button>
      </div>
      <div className="bg-white rounded-lg shadow overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-blue-50 text-xs sticky top-0 z-10">
            <tr>
              <SortableTh label="工程案" colKey="projectCode" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="px-3 py-2" />
              <SortableTh label="廠商" colKey="supplierName" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="px-3 py-2" />
              <SortableTh label="發票號碼" colKey="invoiceNo" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="px-3 py-2" />
              <SortableTh label="發票日期" colKey="invoiceDate" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="px-3 py-2" />
              <SortableTh label="未稅金額" colKey="amount" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="px-3 py-2" align="right" />
              <SortableTh label="稅額" colKey="taxAmount" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="px-3 py-2" align="right" />
              <SortableTh label="含稅金額" colKey="totalAmount" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="px-3 py-2" align="right" />
              <SortableTh label="類型" colKey="invoiceType" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="px-3 py-2" />
              <SortableTh label="狀態" colKey="status" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="px-3 py-2" />
              <th className="text-left px-3 py-2 text-sm font-medium text-gray-700 whitespace-nowrap">關聯合約</th>
              <th className="text-left px-3 py-2 text-sm font-medium text-gray-700 whitespace-nowrap">備註</th>
              <th className="text-center px-3 py-2 text-sm font-medium text-gray-700 whitespace-nowrap">操作</th>
            </tr>
          </thead>
          <tbody>
            {inputInvoices.length === 0 ? (
              <tr><td colSpan={12} className="text-center py-10 text-gray-400">尚無進項發票紀錄，請按「新增進項發票」開始登錄</td></tr>
            ) : sorted.map(inv => (
              <tr key={inv.id} className="border-t hover:bg-gray-50">
                <td className="px-3 py-2 text-xs text-gray-600">{inv.project?.code} {inv.project?.name}</td>
                <td className="px-3 py-2 font-medium">{inv.supplierName || inv.contract?.supplier?.name || <span className="text-gray-300">—</span>}</td>
                <td className="px-3 py-2 font-mono text-xs">{inv.invoiceNo || <span className="text-gray-300">—</span>}</td>
                <td className="px-3 py-2">{inv.invoiceDate}</td>
                <td className="px-3 py-2 text-right">{Number(inv.amount).toLocaleString('zh-TW')}</td>
                <td className="px-3 py-2 text-right text-gray-500">{Number(inv.taxAmount).toLocaleString('zh-TW')}</td>
                <td className="px-3 py-2 text-right font-semibold text-blue-700">{Number(inv.totalAmount).toLocaleString('zh-TW')}</td>
                <td className="px-3 py-2 text-xs">{inv.invoiceType || '—'}</td>
                <td className="px-3 py-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${inv.status === '已入帳' ? 'bg-green-100 text-green-700' : inv.status === '已對帳' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>{inv.status}</span>
                </td>
                <td className="px-3 py-2 text-xs text-gray-500">{inv.contract?.contractNo || '—'}</td>
                <td className="px-3 py-2 text-xs text-gray-400 max-w-[120px] truncate" title={inv.note || ''}>{inv.note || '—'}</td>
                <td className="px-3 py-2 text-center whitespace-nowrap">
                  <button onClick={() => { setEditingInputInv(inv); setInputForm({ projectId: String(inv.projectId), contractId: inv.contractId ? String(inv.contractId) : '', supplierName: inv.supplierName || '', invoiceNo: inv.invoiceNo || '', invoiceDate: inv.invoiceDate, amount: String(inv.amount), taxAmount: String(inv.taxAmount), totalAmount: String(inv.totalAmount), invoiceType: inv.invoiceType || '電子發票', status: inv.status, note: inv.note || '' }); setShowInputModal(true); }}
                    className="text-blue-500 hover:underline text-xs mr-2">編輯</button>
                  <button onClick={() => deleteInputInvoice(inv)} className="text-red-500 hover:underline text-xs">刪除</button>
                </td>
              </tr>
            ))}
          </tbody>
          {inputInvoices.length > 0 && (
            <tfoot className="bg-blue-50 border-t-2 border-blue-100 text-xs font-semibold">
              <tr>
                <td colSpan={4} className="px-3 py-2">合計 {inputInvoices.length} 筆</td>
                <td className="px-3 py-2 text-right">{inputInvoices.reduce((s, i) => s + Number(i.amount), 0).toLocaleString('zh-TW')}</td>
                <td className="px-3 py-2 text-right text-gray-500">{inputInvoices.reduce((s, i) => s + Number(i.taxAmount), 0).toLocaleString('zh-TW')}</td>
                <td className="px-3 py-2 text-right text-blue-700">{inputInvoices.reduce((s, i) => s + Number(i.totalAmount), 0).toLocaleString('zh-TW')}</td>
                <td colSpan={5} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {showInputModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 overflow-y-auto py-4" onClick={() => setShowInputModal(false)}>
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full mx-4 p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-4">{editingInputInv ? '編輯廠商進項發票' : '新增廠商進項發票'}</h3>
            <div className="space-y-3">
              <div>
                <label htmlFor="inp-f-1" className="block text-xs text-gray-500 mb-1">工程案 *</label>
                <select id="inp-f-1" value={inputForm.projectId} onChange={e => setInputForm(f => ({ ...f, projectId: e.target.value, contractId: '' }))}
                  className="w-full border rounded-lg px-3 py-2 text-sm" disabled={!!editingInputInv}>
                  <option value="">請選擇</option>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.code} {p.name}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="inp-f-2" className="block text-xs text-gray-500 mb-1">關聯合約（選填）</label>
                <select id="inp-f-2" value={inputForm.contractId} onChange={e => setInputForm(f => ({ ...f, contractId: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2 text-sm">
                  <option value="">不關聯合約</option>
                  {contracts.filter(c => !inputForm.projectId || c.projectId === parseInt(inputForm.projectId)).map(c =>
                    <option key={c.id} value={c.id}>{c.contractNo} — {c.supplier?.name}</option>
                  )}
                </select>
              </div>
              <div>
                <label htmlFor="inp-f-3" className="block text-xs text-gray-500 mb-1">廠商名稱</label>
                <input id="inp-f-3" value={inputForm.supplierName} onChange={e => setInputForm(f => ({ ...f, supplierName: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="可由合約帶入或手動輸入" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="inp-f-4" className="block text-xs text-gray-500 mb-1">發票號碼</label>
                  <input id="inp-f-4" value={inputForm.invoiceNo} onChange={e => setInputForm(f => ({ ...f, invoiceNo: e.target.value }))}
                    className="w-full border rounded-lg px-3 py-2 text-sm font-mono" placeholder="AB-12345678" />
                </div>
                <div>
                  <label htmlFor="inp-f-5" className="block text-xs text-gray-500 mb-1">發票日期 *</label>
                  <input id="inp-f-5" type="date" value={inputForm.invoiceDate} onChange={e => setInputForm(f => ({ ...f, invoiceDate: e.target.value }))}
                    className="w-full border rounded-lg px-3 py-2 text-sm" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label htmlFor="inp-f-6" className="block text-xs text-gray-500 mb-1">未稅金額</label>
                  <input id="inp-f-6" type="number" value={inputForm.amount} onChange={e => {
                    const amt = e.target.value;
                    const tax = parseFloat(inputForm.taxAmount) || 0;
                    setInputForm(f => ({ ...f, amount: amt, totalAmount: String((parseFloat(amt) || 0) + tax) }));
                  }} className="w-full border rounded-lg px-3 py-2 text-sm" step="1" min="0" />
                </div>
                <div>
                  <label htmlFor="inp-f-7" className="block text-xs text-gray-500 mb-1">稅額</label>
                  <input id="inp-f-7" type="number" value={inputForm.taxAmount} onChange={e => {
                    const tax = e.target.value;
                    const amt = parseFloat(inputForm.amount) || 0;
                    setInputForm(f => ({ ...f, taxAmount: tax, totalAmount: String(amt + (parseFloat(tax) || 0)) }));
                  }} className="w-full border rounded-lg px-3 py-2 text-sm" step="1" min="0" />
                </div>
                <div>
                  <label htmlFor="inp-f-8" className="block text-xs text-gray-500 mb-1">含稅金額</label>
                  <input id="inp-f-8" type="number" value={inputForm.totalAmount} onChange={e => setInputForm(f => ({ ...f, totalAmount: e.target.value }))}
                    className="w-full border rounded-lg px-3 py-2 text-sm bg-blue-50" step="1" />
                </div>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => {
                  const amt = parseFloat(inputForm.amount) || 0;
                  const tax = Math.round(amt * 0.05);
                  setInputForm(f => ({ ...f, taxAmount: String(tax), totalAmount: String(amt + tax) }));
                }} className="text-xs px-2 py-1 bg-gray-100 hover:bg-gray-200 rounded border text-gray-600">自動計算 5% 稅額</button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="inp-f-9" className="block text-xs text-gray-500 mb-1">發票類型</label>
                  <select id="inp-f-9" value={inputForm.invoiceType} onChange={e => setInputForm(f => ({ ...f, invoiceType: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm">
                    {INPUT_INVOICE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="inp-f-10" className="block text-xs text-gray-500 mb-1">狀態</label>
                  <select id="inp-f-10" value={inputForm.status} onChange={e => setInputForm(f => ({ ...f, status: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm">
                    {INPUT_INVOICE_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label htmlFor="inp-f-11" className="block text-xs text-gray-500 mb-1">備註</label>
                <input id="inp-f-11" value={inputForm.note} onChange={e => setInputForm(f => ({ ...f, note: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setShowInputModal(false)} className="px-4 py-2 border rounded-lg text-sm" disabled={inputInvSaving}>取消</button>
              <button onClick={saveInputInvoice} disabled={inputInvSaving} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm disabled:opacity-50">
                {inputInvSaving ? '儲存中…' : '儲存'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
