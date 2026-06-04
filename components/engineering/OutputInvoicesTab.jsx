'use client';
import { useState, useEffect, useMemo } from 'react';
import { useToast } from '@/context/ToastContext';
import { useConfirm } from '@/context/ConfirmContext';
import { sortRows, useColumnSort, SortableTh } from '@/components/SortableTh';
import FetchErrorBanner from '@/components/FetchErrorBanner';

const OUTPUT_INVOICE_TYPES = ['電子發票', '紙本發票', '三聯式統一發票', '二聯式統一發票'];
const OUTPUT_INVOICE_STATUSES = ['已開立', '已作廢'];

const BUCKET_LABELS = {
  current:     '未到期',
  days_1_30:   '1–30 天',
  days_31_60:  '31–60 天',
  days_61_90:  '61–90 天',
  days_90plus: '90+ 天',
  no_due:      '無到期日',
};
const BUCKET_COLORS = {
  current:     'bg-green-100 text-green-700',
  days_1_30:   'bg-yellow-100 text-yellow-700',
  days_31_60:  'bg-orange-100 text-orange-700',
  days_61_90:  'bg-red-100 text-red-600',
  days_90plus: 'bg-red-200 text-red-800 font-bold',
  no_due:      'bg-gray-100 text-gray-500',
};

function fmtMoney(n) {
  if (n == null || n === '') return '－';
  return Number(n).toLocaleString('zh-TW', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function paymentStatus(inv, today) {
  if (inv.status === '已作廢') return { label: '已作廢', color: 'bg-red-100 text-red-400' };
  const total    = Number(inv.totalAmount || 0);
  const received = Number(inv.receivedAmount || 0);
  if (received >= total - 0.01 && total > 0) return { label: '已收清', color: 'bg-green-100 text-green-700' };
  if (received > 0) return { label: '部分收款', color: 'bg-blue-100 text-blue-700' };
  if (!inv.dueDate) return { label: '未收款', color: 'bg-gray-100 text-gray-500' };
  const days = Math.ceil((new Date(inv.dueDate) - new Date(today)) / 86400000);
  if (days < 0) return { label: `逾期${Math.abs(days)}天`, color: 'bg-red-100 text-red-600' };
  if (days <= 30) return { label: `${days}天到期`, color: 'bg-orange-100 text-orange-600' };
  return { label: '未到期', color: 'bg-gray-100 text-gray-500' };
}

export default function OutputInvoicesTab({ projects, progressClaims = [], onDashStatsChanged }) {
  const today = new Date().toISOString().slice(0, 10);
  const [subTab, setSubTab] = useState('invoices');
  const [outputInvoices, setOutputInvoices] = useState([]);
  const [outputInvoicesError, setOutputInvoicesError] = useState(null);
  const [projectFilter, setProjectFilter] = useState('');
  const [showOutputModal, setShowOutputModal] = useState(false);
  const [editingOutputInv, setEditingOutputInv] = useState(null);
  const [outputInvSaving, setOutputInvSaving] = useState(false);
  const emptyForm = { projectId: '', progressClaimId: '', clientName: '', invoiceNo: '', invoiceDate: '', dueDate: '', amount: '', taxAmount: '', totalAmount: '', invoiceType: '電子發票', status: '已開立', note: '' };
  const [outputForm, setOutputForm] = useState(emptyForm);

  // 帳齡分析
  const [agingData, setAgingData] = useState(null);
  const [agingLoading, setAgingLoading] = useState(false);

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
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setOutputInvoicesError(null);
      setOutputInvoices(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error('[fetchOutputInvoices]', e);
      setOutputInvoicesError('業主銷項發票資料載入失敗，請重試。');
      setOutputInvoices([]);
    }
  }

  async function fetchAging(pid) {
    setAgingLoading(true);
    try {
      const url = pid ? `/api/engineering/receivables-aging?projectId=${pid}` : '/api/engineering/receivables-aging';
      const data = await fetch(url).then(r => r.json());
      setAgingData(data);
    } catch { setAgingData(null); }
    finally { setAgingLoading(false); }
  }

  function handleFilterChange(pid) {
    setProjectFilter(pid);
    fetchOutputInvoices(pid || undefined);
    if (subTab === 'aging') fetchAging(pid || undefined);
  }

  function switchSubTab(tab) {
    setSubTab(tab);
    if (tab === 'aging' && !agingData) fetchAging(projectFilter || undefined);
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
      if (agingData) fetchAging(projectFilter || undefined);
      onDashStatsChanged?.();
    } catch { showToast('儲存失敗', 'error'); }
    finally { setOutputInvSaving(false); }
  }

  async function deleteOutputInvoice(inv) {
    if (!(await confirm(`確定刪除發票「${inv.invoiceNo || inv.id}」？`, { title: '刪除確認', danger: true }))) return;
    const res = await fetch(`/api/engineering/output-invoices/${inv.id}`, { method: 'DELETE' });
    if (!res.ok) { showToast('刪除失敗', 'error'); return; }
    fetchOutputInvoices(projectFilter || undefined);
    if (agingData) fetchAging(projectFilter || undefined);
    onDashStatsChanged?.();
  }

  const sorted = sortRows(outputInvoices, sortKey, sortDir, {
    projectCode: inv => `${inv.project?.code || ''} ${inv.project?.name || ''}`,
    clientName:  inv => inv.clientName || inv.project?.clientName || '',
    amount:      inv => Number(inv.amount || 0),
    taxAmount:   inv => Number(inv.taxAmount || 0),
    totalAmount: inv => Number(inv.totalAmount || 0),
    invoiceDate: inv => inv.invoiceDate || '',
    dueDate:     inv => inv.dueDate || '',
    receivedAmount: inv => Number(inv.receivedAmount || 0),
  });

  const totalUnpaid = useMemo(() =>
    outputInvoices.filter(i => i.status === '已開立').reduce((s, i) => s + Math.max(0, Number(i.totalAmount) - Number(i.receivedAmount || 0)), 0),
    [outputInvoices]);
  const overdueCount = useMemo(() =>
    outputInvoices.filter(i => i.status === '已開立' && i.dueDate && i.dueDate < today && Number(i.totalAmount) > Number(i.receivedAmount || 0)).length,
    [outputInvoices, today]);

  return (
    <div>
      {outputInvoicesError && <FetchErrorBanner message={outputInvoicesError} onRetry={() => fetchOutputInvoices(projectFilter || undefined)} className="mb-4" />}
      {/* 篩選列 */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3 flex-wrap">
          <select value={projectFilter} onChange={e => handleFilterChange(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm min-w-[200px]">
            <option value="">全部工程案</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.code} {p.name}</option>)}
          </select>
          <span className="text-sm text-gray-500">共 {outputInvoices.length} 筆</span>
          {totalUnpaid > 0 && <span className="text-sm text-amber-600">未收 {fmtMoney(totalUnpaid)}</span>}
          {overdueCount > 0 && <span className="text-xs font-medium text-red-600 bg-red-50 px-2 py-0.5 rounded-full">⚠ 逾期 {overdueCount} 張</span>}
        </div>
        <button onClick={() => { setEditingOutputInv(null); setOutputForm({ ...emptyForm, projectId: projectFilter }); setShowOutputModal(true); }}
          className="px-4 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700">
          + 新增銷項發票
        </button>
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-1 mb-4 border-b border-gray-200">
        {[
          { key: 'invoices', label: '📋 發票列表' },
          { key: 'aging',    label: '📊 帳齡分析' },
        ].map(t => (
          <button key={t.key} onClick={() => switchSubTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${subTab === t.key ? 'border-green-500 text-green-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── 發票列表 ── */}
      {subTab === 'invoices' && (
        <div className="bg-white rounded-lg shadow overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-green-50 text-xs sticky top-0 z-10">
              <tr>
                <SortableTh label="工程案"   colKey="projectCode"    sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="px-3 py-2" />
                <SortableTh label="業主"     colKey="clientName"     sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="px-3 py-2" />
                <SortableTh label="發票號碼" colKey="invoiceNo"      sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="px-3 py-2" />
                <SortableTh label="發票日期" colKey="invoiceDate"    sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="px-3 py-2" />
                <SortableTh label="到期日"   colKey="dueDate"        sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="px-3 py-2" />
                <SortableTh label="含稅金額" colKey="totalAmount"    sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="px-3 py-2" align="right" />
                <SortableTh label="已收款"   colKey="receivedAmount" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="px-3 py-2" align="right" />
                <th className="px-3 py-2 text-right text-xs font-medium text-gray-700">未收款</th>
                <th className="px-3 py-2 text-center text-xs font-medium text-gray-700">狀態</th>
                <th className="px-3 py-2 text-center text-xs font-medium text-gray-700">操作</th>
              </tr>
            </thead>
            <tbody>
              {outputInvoices.length === 0 ? (
                <tr><td colSpan={10} className="text-center py-10 text-gray-400">尚無銷項發票</td></tr>
              ) : sorted.map(inv => {
                const total    = Number(inv.totalAmount || 0);
                const received = Number(inv.receivedAmount || 0);
                const unpaid   = Math.max(0, total - received);
                const ps       = paymentStatus(inv, today);
                const pct      = total > 0 ? Math.min(100, (received / total) * 100) : 0;
                return (
                  <tr key={inv.id} className={`border-t hover:bg-gray-50 ${inv.status === '已作廢' ? 'opacity-50' : ''}`}>
                    <td className="px-3 py-2 text-xs text-gray-600">{inv.project?.code} {inv.project?.name}</td>
                    <td className="px-3 py-2 font-medium">{inv.clientName || inv.project?.clientName || <span className="text-gray-300">—</span>}</td>
                    <td className="px-3 py-2 font-mono text-xs">{inv.invoiceNo || <span className="text-gray-300">—</span>}</td>
                    <td className="px-3 py-2 text-xs">{inv.invoiceDate}</td>
                    <td className="px-3 py-2 text-xs">{inv.dueDate || <span className="text-gray-300">—</span>}</td>
                    <td className="px-3 py-2 text-right font-semibold text-green-700">{fmtMoney(total)}</td>
                    <td className="px-3 py-2 text-right text-blue-600">{received > 0 ? fmtMoney(received) : <span className="text-gray-300">—</span>}</td>
                    <td className="px-3 py-2 text-right">
                      {unpaid > 0.01 ? <span className="text-amber-700 font-semibold">{fmtMoney(unpaid)}</span> : <span className="text-gray-300">—</span>}
                      {total > 0 && received > 0 && received < total && (
                        <div className="w-full h-1 bg-gray-100 rounded-full mt-0.5 overflow-hidden">
                          <div className="h-full bg-blue-400 rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${ps.color}`}>{ps.label}</span>
                      {inv.progressClaim && <div className="text-[10px] text-indigo-500 mt-0.5">{inv.progressClaim.termName}</div>}
                    </td>
                    <td className="px-3 py-2 text-center whitespace-nowrap">
                      <button onClick={() => {
                        setEditingOutputInv(inv);
                        setOutputForm({ projectId: String(inv.projectId), progressClaimId: inv.progressClaimId ? String(inv.progressClaimId) : '', clientName: inv.clientName || '', invoiceNo: inv.invoiceNo || '', invoiceDate: inv.invoiceDate, dueDate: inv.dueDate || '', amount: String(inv.amount), taxAmount: String(inv.taxAmount), totalAmount: String(inv.totalAmount), invoiceType: inv.invoiceType || '電子發票', status: inv.status, note: inv.note || '' });
                        setShowOutputModal(true);
                      }} className="text-blue-500 hover:underline text-xs mr-2">編輯</button>
                      <button onClick={() => deleteOutputInvoice(inv)} className="text-red-500 hover:underline text-xs">刪除</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {outputInvoices.length > 0 && (
              <tfoot className="bg-green-50 border-t-2 border-green-100 text-xs font-semibold">
                <tr>
                  <td colSpan={5} className="px-3 py-2">合計 {outputInvoices.length} 筆</td>
                  <td className="px-3 py-2 text-right text-green-700">{fmtMoney(outputInvoices.reduce((s, i) => s + Number(i.totalAmount), 0))}</td>
                  <td className="px-3 py-2 text-right text-blue-700">{fmtMoney(outputInvoices.reduce((s, i) => s + Number(i.receivedAmount || 0), 0))}</td>
                  <td className="px-3 py-2 text-right text-amber-700">{fmtMoney(totalUnpaid)}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}

      {/* ── 帳齡分析 ── */}
      {subTab === 'aging' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">以「銷項發票」到期日計算，僅列未收齊發票。</p>
            <button onClick={() => fetchAging(projectFilter || undefined)} className="text-xs text-green-600 hover:underline">重新計算</button>
          </div>
          {agingLoading ? (
            <div className="flex justify-center py-12"><div className="w-6 h-6 border-2 border-green-200 border-t-green-600 rounded-full animate-spin" /></div>
          ) : !agingData ? (
            <div className="bg-white rounded-xl border p-10 text-center text-gray-400">點擊「重新計算」載入帳齡分析</div>
          ) : (
            <>
              {/* 總覽卡片 */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-white rounded-xl border border-gray-200 px-4 py-3">
                  <p className="text-xs text-gray-400">應收帳款總額</p>
                  <p className="text-lg font-bold text-gray-800">{fmtMoney(agingData.summary.totalAmount)}</p>
                </div>
                <div className="bg-white rounded-xl border border-blue-100 px-4 py-3">
                  <p className="text-xs text-blue-500">已收款</p>
                  <p className="text-lg font-bold text-blue-700">{fmtMoney(agingData.summary.receivedAmount)}</p>
                </div>
                <div className="bg-white rounded-xl border border-amber-100 px-4 py-3">
                  <p className="text-xs text-amber-500">未收款</p>
                  <p className="text-lg font-bold text-amber-700">{fmtMoney(agingData.summary.unpaidAmount)}</p>
                </div>
                <div className={`bg-white rounded-xl border px-4 py-3 ${agingData.summary.invoiceCount > 0 ? 'border-red-100' : 'border-gray-200'}`}>
                  <p className="text-xs text-red-400">未收齊發票數</p>
                  <p className={`text-lg font-bold ${agingData.summary.invoiceCount > 0 ? 'text-red-600' : 'text-gray-400'}`}>{agingData.summary.invoiceCount} 張</p>
                </div>
              </div>

              {/* 帳齡表格 */}
              {Object.entries(agingData.buckets).filter(([, b]) => b.invoices.length > 0).map(([key, bucket]) => (
                <div key={key} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <div className={`flex items-center justify-between px-5 py-3 border-b ${key !== 'current' && key !== 'no_due' ? 'bg-red-50' : 'bg-gray-50'}`}>
                    <div className="flex items-center gap-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${BUCKET_COLORS[key]}`}>{BUCKET_LABELS[key]}</span>
                      <span className="text-sm text-gray-600">{bucket.invoices.length} 張</span>
                    </div>
                    <span className="font-semibold text-gray-800">未收 {fmtMoney(bucket.unpaidAmount)}</span>
                  </div>
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50 text-gray-500">
                      <tr>
                        <th className="px-4 py-2 text-left">工程案</th>
                        <th className="px-4 py-2 text-left">業主</th>
                        <th className="px-4 py-2 text-left">發票號碼</th>
                        <th className="px-4 py-2 text-left">發票日期</th>
                        <th className="px-4 py-2 text-left">到期日</th>
                        <th className="px-4 py-2 text-right">發票金額</th>
                        <th className="px-4 py-2 text-right">已收</th>
                        <th className="px-4 py-2 text-right">未收</th>
                        {key !== 'current' && key !== 'no_due' && <th className="px-4 py-2 text-right">逾期天數</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {bucket.invoices.map(r => (
                        <tr key={r.id} className="hover:bg-red-50/30">
                          <td className="px-4 py-2">{r.projectCode} {r.projectName}</td>
                          <td className="px-4 py-2">{r.clientName || '—'}</td>
                          <td className="px-4 py-2 font-mono">{r.invoiceNo || '—'}</td>
                          <td className="px-4 py-2">{r.invoiceDate}</td>
                          <td className="px-4 py-2">{r.dueDate || '—'}</td>
                          <td className="px-4 py-2 text-right">{fmtMoney(r.totalAmount)}</td>
                          <td className="px-4 py-2 text-right text-blue-600">{r.receivedAmount > 0 ? fmtMoney(r.receivedAmount) : '—'}</td>
                          <td className="px-4 py-2 text-right font-semibold text-amber-700">{fmtMoney(r.unpaidAmount)}</td>
                          {key !== 'current' && key !== 'no_due' && (
                            <td className={`px-4 py-2 text-right font-bold ${r.overdueDays > 90 ? 'text-red-800' : r.overdueDays > 60 ? 'text-red-600' : r.overdueDays > 30 ? 'text-orange-600' : 'text-yellow-600'}`}>
                              {r.overdueDays > 0 ? `+${r.overdueDays}` : r.overdueDays}
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
              {agingData.summary.invoiceCount === 0 && (
                <div className="bg-green-50 rounded-xl border border-green-200 p-8 text-center text-green-700 font-medium">
                  所有銷項發票均已收清！
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* 新增/編輯 Modal */}
      {showOutputModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 overflow-y-auto py-4" onClick={() => setShowOutputModal(false)}>
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full mx-4 p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-4">{editingOutputInv ? '編輯業主銷項發票' : '新增業主銷項發票'}</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">工程案 *</label>
                <select value={outputForm.projectId} onChange={e => {
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
                    <select value={outputForm.progressClaimId} onChange={e => setOutputForm(f => ({ ...f, progressClaimId: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm">
                      <option value="">不連結估驗單</option>
                      {claimsForProject.map(c => <option key={c.id} value={c.id}>{c.termName}{c.claimNo ? ` (${c.claimNo})` : ''}</option>)}
                    </select>
                  </div>
                ) : null;
              })()}
              <div>
                <label className="block text-xs text-gray-500 mb-1">業主名稱</label>
                <input value={outputForm.clientName} onChange={e => setOutputForm(f => ({ ...f, clientName: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">發票號碼</label>
                  <input value={outputForm.invoiceNo} onChange={e => setOutputForm(f => ({ ...f, invoiceNo: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm font-mono" placeholder="AB-12345678" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">發票日期 *</label>
                  <input type="date" value={outputForm.invoiceDate} onChange={e => setOutputForm(f => ({ ...f, invoiceDate: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" />
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">付款到期日（應收帳款到期）</label>
                <div className="flex gap-2 items-center">
                  <input type="date" value={outputForm.dueDate} onChange={e => setOutputForm(f => ({ ...f, dueDate: e.target.value }))} className="flex-1 border rounded-lg px-3 py-2 text-sm" />
                  {outputForm.invoiceDate && (
                    <div className="flex gap-1">
                      {[30, 60, 90].map(d => (
                        <button key={d} type="button"
                          onClick={() => { const dt = new Date(outputForm.invoiceDate); dt.setDate(dt.getDate() + d); setOutputForm(f => ({ ...f, dueDate: dt.toISOString().slice(0, 10) })); }}
                          className="text-xs px-2 py-1.5 bg-gray-100 hover:bg-gray-200 rounded border text-gray-600">+{d}天</button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">未稅金額</label>
                  <input type="number" value={outputForm.amount} onChange={e => { const amt = e.target.value; const tax = parseFloat(outputForm.taxAmount) || 0; setOutputForm(f => ({ ...f, amount: amt, totalAmount: String((parseFloat(amt) || 0) + tax) })); }} className="w-full border rounded-lg px-3 py-2 text-sm" step="1" min="0" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">稅額</label>
                  <input type="number" value={outputForm.taxAmount} onChange={e => { const tax = e.target.value; const amt = parseFloat(outputForm.amount) || 0; setOutputForm(f => ({ ...f, taxAmount: tax, totalAmount: String(amt + (parseFloat(tax) || 0)) })); }} className="w-full border rounded-lg px-3 py-2 text-sm" step="1" min="0" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">含稅金額</label>
                  <input type="number" value={outputForm.totalAmount} onChange={e => setOutputForm(f => ({ ...f, totalAmount: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm bg-green-50" step="1" />
                </div>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => { const amt = parseFloat(outputForm.amount) || 0; const tax = Math.round(amt * 0.05); setOutputForm(f => ({ ...f, taxAmount: String(tax), totalAmount: String(amt + tax) })); }} className="text-xs px-2 py-1 bg-gray-100 hover:bg-gray-200 rounded border text-gray-600">自動計算 5% 稅額</button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">發票類型</label>
                  <select value={outputForm.invoiceType} onChange={e => setOutputForm(f => ({ ...f, invoiceType: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm">
                    {OUTPUT_INVOICE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">狀態</label>
                  <select value={outputForm.status} onChange={e => setOutputForm(f => ({ ...f, status: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm">
                    {OUTPUT_INVOICE_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">備註</label>
                <input value={outputForm.note} onChange={e => setOutputForm(f => ({ ...f, note: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" />
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
