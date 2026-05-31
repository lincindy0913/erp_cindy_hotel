'use client';
import { useState, useEffect } from 'react';
import { useToast } from '@/context/ToastContext';
import ConfirmModal, { useConfirmDialog } from '@/components/ConfirmModal';
import { todayStr } from '@/lib/localDate';

export default function IncomeTab({ projects, progressClaims = [], outputInvoices = [], onDashStatsChanged }) {
  const [incomes, setIncomes] = useState([]);
  const [incomeSaving, setIncomeSaving] = useState(false);
  const [showIncomeForm, setShowIncomeForm] = useState(false);
  const emptyForm = { projectId: '', progressClaimId: '', outputInvoiceId: '', termName: '', amount: '', receivedDate: todayStr(), accountId: '', accountingSubject: '41000 工程收入', note: '' };
  const [incomeForm, setIncomeForm] = useState(emptyForm);
  const [incomeFilterProjectId, setIncomeFilterProjectId] = useState('');
  const [editingIncome, setEditingIncome] = useState(null);
  const [incomeEditSaving, setIncomeEditSaving] = useState(false);
  const [accounts, setAccounts] = useState([]);

  const { showToast } = useToast();
  const { dialog: confirmDlg, confirm: askConfirm, close: closeConfirm } = useConfirmDialog();

  useEffect(() => {
    fetchIncomes();
    fetchAccounts();
  }, []);

  async function fetchIncomes(projectId) {
    try {
      const pid = projectId !== undefined ? projectId : incomeFilterProjectId;
      const url = pid ? `/api/engineering/income?projectId=${pid}` : '/api/engineering/income';
      const res = await fetch(url);
      const data = await res.json();
      setIncomes(Array.isArray(data) ? data : []);
    } catch { setIncomes([]); }
  }

  async function fetchAccounts() {
    try {
      const res = await fetch('/api/cashflow/accounts');
      const data = await res.json();
      setAccounts(Array.isArray(data) ? data : []);
    } catch { setAccounts([]); }
  }

  async function handleCreateIncome(e) {
    e.preventDefault();
    if (!incomeForm.projectId || !incomeForm.termName || !incomeForm.amount || !incomeForm.receivedDate) {
      showToast('請填寫工程案、期數名稱、收款金額、收款日期', 'error');
      return;
    }
    setIncomeSaving(true);
    try {
      const res = await fetch('/api/engineering/income', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(incomeForm),
      });
      const resData = await res.json();
      if (!res.ok) { showToast(resData.error?.message || '建立失敗', 'error'); return; }
      showToast('收款紀錄已建立', 'success');
      setShowIncomeForm(false);
      setIncomeForm(emptyForm);
      fetchIncomes();
      onDashStatsChanged?.();
    } catch { showToast('建立收款紀錄失敗', 'error'); }
    setIncomeSaving(false);
  }

  function handleDeleteIncome(id) {
    askConfirm('確定要刪除此收款紀錄？對應的現金流交易也會一併刪除。', async () => {
      try {
        const res = await fetch(`/api/engineering/income/${id}`, { method: 'DELETE' });
        if (res.ok) { showToast('已刪除', 'success'); fetchIncomes(); onDashStatsChanged?.(); }
        else { const err = await res.json(); showToast(err.error?.message || '刪除失敗', 'error'); }
      } catch { showToast('刪除失敗', 'error'); }
    });
  }

  function openEditIncome(inc) {
    setEditingIncome({
      id: inc.id,
      form: {
        termName: inc.termName || '',
        amount: String(inc.amount),
        receivedDate: inc.receivedDate || '',
        accountId: inc.accountId ? String(inc.accountId) : '',
        accountingSubject: inc.accountingSubject || '41000 工程收入',
        note: inc.note || '',
      },
    });
  }

  async function handleUpdateIncome(e) {
    e.preventDefault();
    if (!editingIncome) return;
    setIncomeEditSaving(true);
    try {
      const res = await fetch(`/api/engineering/income/${editingIncome.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingIncome.form),
      });
      if (res.ok) {
        showToast('收款紀錄已更新', 'success');
        setEditingIncome(null);
        fetchIncomes();
        onDashStatsChanged?.();
      } else {
        const err = await res.json();
        showToast(err.error?.message || '更新失敗', 'error');
      }
    } catch { showToast('更新失敗', 'error'); }
    setIncomeEditSaving(false);
  }

  const incomesByProject = {};
  incomes.forEach(inc => {
    const pid = String(inc.projectId);
    if (!incomesByProject[pid]) incomesByProject[pid] = [];
    incomesByProject[pid].push(inc);
  });
  const projectsWithClient = projects.filter(p => !!p.clientName);
  const displayProjects = incomeFilterProjectId
    ? projectsWithClient.filter(p => String(p.id) === incomeFilterProjectId)
    : projectsWithClient;

  return (
    <div>
      <div className="flex gap-3 mb-5 items-end">
        <div>
          <label htmlFor="inc-f-1" className="block text-xs text-gray-500 mb-1">篩選工程案</label>
          <select id="inc-f-1" value={incomeFilterProjectId} onChange={e => { setIncomeFilterProjectId(e.target.value); fetchIncomes(e.target.value); }}
            className="border rounded-lg px-3 py-2 text-sm min-w-[200px]">
            <option value="">全部（有業主）</option>
            {projectsWithClient.map(p => <option key={p.id} value={p.id}>{p.code} {p.name} — {p.clientName}</option>)}
          </select>
        </div>
        <button onClick={() => setShowIncomeForm(f => !f)}
          className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700">
          + 新增收款
        </button>
      </div>

      {showIncomeForm && (
        <form onSubmit={handleCreateIncome} className="bg-green-50 border border-green-200 rounded-xl p-4 mb-5">
          <h4 className="text-sm font-semibold text-green-800 mb-3">新增收款紀錄</h4>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <div>
              <label htmlFor="inc-f-2" className="block text-xs text-gray-500 mb-1">工程案 *</label>
              <select id="inc-f-2" value={incomeForm.projectId} onChange={e => setIncomeForm(f => ({ ...f, projectId: e.target.value, progressClaimId: '' }))}
                className="w-full border rounded-lg px-3 py-2 text-sm" required>
                <option value="">請選擇</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.code} {p.name}</option>)}
              </select>
            </div>
            {(() => {
              const pid = incomeForm.projectId ? parseInt(incomeForm.projectId) : null;
              const claimsForProject = pid ? progressClaims.filter(c => c.projectId === pid) : [];
              const invoicesForProject = pid ? outputInvoices.filter(i => i.projectId === pid && i.status === '已開立') : [];
              return (
                <>
                  {claimsForProject.length > 0 && (
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">連結估驗單</label>
                      <select value={incomeForm.progressClaimId} onChange={e => setIncomeForm(f => ({ ...f, progressClaimId: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm">
                        <option value="">不連結</option>
                        {claimsForProject.map(c => <option key={c.id} value={c.id}>{c.termName}{c.claimNo ? ` (${c.claimNo})` : ''}</option>)}
                      </select>
                    </div>
                  )}
                  {invoicesForProject.length > 0 && (
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">連結銷項發票（應收帳款）</label>
                      <select value={incomeForm.outputInvoiceId} onChange={e => {
                        const inv = invoicesForProject.find(i => String(i.id) === e.target.value);
                        const unpaid = inv ? Math.max(0, Number(inv.totalAmount) - Number(inv.receivedAmount || 0)) : '';
                        setIncomeForm(f => ({ ...f, outputInvoiceId: e.target.value, amount: unpaid ? String(unpaid) : f.amount, termName: inv ? (inv.invoiceNo ? `發票 ${inv.invoiceNo}` : f.termName) : f.termName }));
                      }} className="w-full border rounded-lg px-3 py-2 text-sm">
                        <option value="">不連結（一般收款）</option>
                        {invoicesForProject.map(i => {
                          const unpaid = Math.max(0, Number(i.totalAmount) - Number(i.receivedAmount || 0));
                          return <option key={i.id} value={i.id}>{i.invoiceNo ? `${i.invoiceNo} ` : ''}{i.invoiceDate} 含稅{Number(i.totalAmount).toLocaleString('zh-TW')}{unpaid > 0.01 ? ` 未收${unpaid.toLocaleString('zh-TW')}` : ' 已收清'}</option>;
                        })}
                      </select>
                    </div>
                  )}
                </>
              );
            })()}
            <div>
              <label htmlFor="inc-f-3" className="block text-xs text-gray-500 mb-1">期數名稱 *</label>
              <input id="inc-f-3" value={incomeForm.termName} onChange={e => setIncomeForm(f => ({ ...f, termName: e.target.value }))}
                className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="例：第一期款" required />
            </div>
            <div>
              <label htmlFor="inc-f-4" className="block text-xs text-gray-500 mb-1">收款金額 *</label>
              <input id="inc-f-4" type="number" value={incomeForm.amount} onChange={e => setIncomeForm(f => ({ ...f, amount: e.target.value }))}
                className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="0" step="0.01" min="0.01" required />
            </div>
            <div>
              <label htmlFor="inc-f-5" className="block text-xs text-gray-500 mb-1">收款日期 *</label>
              <input id="inc-f-5" type="date" value={incomeForm.receivedDate} onChange={e => setIncomeForm(f => ({ ...f, receivedDate: e.target.value }))}
                className="w-full border rounded-lg px-3 py-2 text-sm" required />
            </div>
            <div>
              <label htmlFor="inc-f-6" className="block text-xs text-gray-500 mb-1">收款帳戶</label>
              <select id="inc-f-6" value={incomeForm.accountId} onChange={e => setIncomeForm(f => ({ ...f, accountId: e.target.value }))}
                className="w-full border rounded-lg px-3 py-2 text-sm">
                <option value="">請選擇（選擇後自動建立現金流）</option>
                {accounts.map(a => <option key={a.id} value={a.id}>{a.warehouse ? `${a.warehouse} - ` : ''}{a.name} ({a.type})</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="inc-f-7" className="block text-xs text-gray-500 mb-1">會計科目</label>
              <input id="inc-f-7" value={incomeForm.accountingSubject} onChange={e => setIncomeForm(f => ({ ...f, accountingSubject: e.target.value }))}
                className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="41000 工程收入" />
            </div>
            <div className="col-span-2 md:col-span-3">
              <label htmlFor="inc-f-8" className="block text-xs text-gray-500 mb-1">備註</label>
              <input id="inc-f-8" value={incomeForm.note} onChange={e => setIncomeForm(f => ({ ...f, note: e.target.value }))}
                className="w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
          </div>
          <div className="flex gap-2 mt-3">
            <button type="submit" disabled={incomeSaving} className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm disabled:opacity-50">
              {incomeSaving ? '儲存中…' : '儲存收款'}
            </button>
            <button type="button" onClick={() => setShowIncomeForm(false)} className="px-4 py-2 border rounded-lg text-sm">取消</button>
          </div>
        </form>
      )}

      {displayProjects.length === 0 ? (
        <div className="bg-white rounded-lg border border-gray-200 p-8 text-center text-gray-400">
          {projectsWithClient.length === 0 ? '尚無設定業主的工程案，請先在「工程案」分頁設定業主名稱' : '查無符合條件的工程案'}
        </div>
      ) : (
        <div className="space-y-5">
          {displayProjects.map(proj => {
            const projIncomes = incomesByProject[String(proj.id)] || [];
            const contractAmt = Number(proj.clientContractAmount || 0);
            const received = projIncomes.reduce((s, i) => s + Number(i.amount), 0);
            const remaining = contractAmt - received;
            const pct = contractAmt > 0 ? Math.min((received / contractAmt) * 100, 100) : 0;
            return (
              <div key={proj.id} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="bg-gradient-to-r from-green-50 to-emerald-50 border-b border-gray-200 px-5 py-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-mono bg-white border border-gray-200 text-gray-600 px-2 py-0.5 rounded">{proj.code}</span>
                        <span className="font-bold text-gray-900 text-base">{proj.name}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${proj.status === '進行中' ? 'bg-green-100 text-green-700' : proj.status === '已結案' ? 'bg-gray-100 text-gray-500' : 'bg-amber-100 text-amber-700'}`}>{proj.status}</span>
                      </div>
                      <div className="text-sm text-gray-500">業主：{proj.clientName || '－'}</div>
                    </div>
                    <div className="flex gap-6 text-sm shrink-0">
                      <div className="text-right">
                        <div className="text-xs text-gray-400 mb-0.5">合約金額</div>
                        <div className="font-semibold text-gray-700">{contractAmt > 0 ? `NT$ ${contractAmt.toLocaleString()}` : <span className="text-gray-400 text-xs">未設定</span>}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-gray-400 mb-0.5">已收款 ({projIncomes.length} 筆)</div>
                        <div className="font-bold text-green-700">NT$ {received.toLocaleString()}</div>
                      </div>
                      {contractAmt > 0 && (
                        <div className="text-right">
                          <div className="text-xs text-gray-400 mb-0.5">尚未收款</div>
                          <div className={`font-bold ${remaining > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>NT$ {remaining.toLocaleString()}</div>
                        </div>
                      )}
                    </div>
                  </div>
                  {contractAmt > 0 && (
                    <div className="mt-3">
                      <div className="flex justify-between text-xs text-gray-400 mb-1">
                        <span>收款進度</span><span>{pct.toFixed(1)}%</span>
                      </div>
                      <div className="bg-gray-200 rounded-full h-2">
                        <div className="bg-green-500 h-2 rounded-full transition-all" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  )}
                </div>
                {projIncomes.length === 0 ? (
                  <div className="px-5 py-5 text-center text-sm text-gray-400">此工程案尚無收款紀錄</div>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-100">
                      <tr>
                        <th className="px-5 py-2.5 text-left text-xs font-semibold text-gray-500 w-6">#</th>
                        <th className="px-5 py-2.5 text-left text-xs font-semibold text-gray-500">期數 / 品項</th>
                        <th className="px-5 py-2.5 text-left text-xs font-semibold text-gray-500">收款日期</th>
                        <th className="px-5 py-2.5 text-right text-xs font-semibold text-gray-500">收款金額</th>
                        <th className="px-5 py-2.5 text-left text-xs font-semibold text-gray-500">連結估驗</th>
                        <th className="px-5 py-2.5 text-left text-xs font-semibold text-gray-500">連結發票</th>
                        <th className="px-5 py-2.5 text-left text-xs font-semibold text-gray-500">收款帳戶</th>
                        <th className="px-5 py-2.5 text-left text-xs font-semibold text-gray-500">備註</th>
                        <th className="px-5 py-2.5 text-center text-xs font-semibold text-gray-500">現金流</th>
                        <th className="px-4 py-2.5 text-center text-xs font-semibold text-gray-500">操作</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {projIncomes.map((inc, idx) => {
                        const isEditing = editingIncome?.id === inc.id;
                        if (isEditing) {
                          return (
                            <tr key={inc.id} className="bg-emerald-50">
                              <td className="px-5 py-2 text-xs text-gray-400">{idx + 1}</td>
                              <td className="px-3 py-2"><input value={editingIncome.form.termName} onChange={e => setEditingIncome(v => ({ ...v, form: { ...v.form, termName: e.target.value } }))} className="w-full border rounded px-2 py-1 text-sm" /></td>
                              <td className="px-3 py-2"><input type="date" value={editingIncome.form.receivedDate} onChange={e => setEditingIncome(v => ({ ...v, form: { ...v.form, receivedDate: e.target.value } }))} className="w-full border rounded px-2 py-1 text-sm" /></td>
                              <td className="px-3 py-2"><input type="number" value={editingIncome.form.amount} onChange={e => setEditingIncome(v => ({ ...v, form: { ...v.form, amount: e.target.value } }))} className="w-full border rounded px-2 py-1 text-sm text-right" /></td>
                              <td className="px-3 py-2">
                                <select value={editingIncome.form.accountId} onChange={e => setEditingIncome(v => ({ ...v, form: { ...v.form, accountId: e.target.value } }))} className="w-full border rounded px-2 py-1 text-sm">
                                  <option value="">無帳戶</option>
                                  {accounts.map(a => <option key={a.id} value={a.id}>{a.warehouse ? a.warehouse + ' - ' : ''}{a.name}</option>)}
                                </select>
                              </td>
                              <td className="px-3 py-2 text-xs text-gray-300">—</td>
                              <td className="px-3 py-2"><input value={editingIncome.form.note} onChange={e => setEditingIncome(v => ({ ...v, form: { ...v.form, note: e.target.value } }))} className="w-full border rounded px-2 py-1 text-sm" placeholder="備註" /></td>
                              <td className="px-3 py-2 text-center text-xs text-gray-400">—</td>
                              <td className="px-3 py-2 text-center">
                                <form onSubmit={handleUpdateIncome} className="flex gap-1 justify-center">
                                  <button type="submit" disabled={incomeEditSaving} className="text-xs px-2 py-1 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50">{incomeEditSaving ? '…' : '儲存'}</button>
                                  <button type="button" onClick={() => setEditingIncome(null)} className="text-xs px-2 py-1 border rounded hover:bg-gray-50">取消</button>
                                </form>
                              </td>
                            </tr>
                          );
                        }
                        return (
                          <tr key={inc.id} className="hover:bg-green-50/40">
                            <td className="px-5 py-3 text-xs text-gray-400">{idx + 1}</td>
                            <td className="px-5 py-3"><span className="font-semibold text-gray-800">{inc.termName}</span></td>
                            <td className="px-5 py-3 text-gray-600">{inc.receivedDate}</td>
                            <td className="px-5 py-3 text-right font-bold text-green-700 text-base">NT$ {Number(inc.amount).toLocaleString()}</td>
                            <td className="px-5 py-3 text-xs">
                              {inc.outputInvoice
                                ? <span className="text-green-700 font-mono">{inc.outputInvoice.invoiceNo || `發票#${inc.outputInvoiceId}`}</span>
                                : inc.progressClaim
                                  ? <span className="text-indigo-500">{inc.progressClaim.termName}</span>
                                  : <span className="text-gray-300">—</span>
                              }
                            </td>
                            <td className="px-5 py-3 text-gray-500 text-xs">{inc.account ? `${inc.account.warehouse ? inc.account.warehouse + ' - ' : ''}${inc.account.name}` : '－'}</td>
                            <td className="px-5 py-3 text-gray-500 text-xs max-w-[200px]">{inc.note || <span className="text-gray-300">－</span>}</td>
                            <td className="px-5 py-3 text-center">
                              {inc.cashTransactionId
                                ? <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">已連動</span>
                                : <span className="text-xs bg-gray-100 text-gray-400 px-2 py-0.5 rounded-full">無帳戶</span>}
                            </td>
                            <td className="px-4 py-3 text-center">
                              <button onClick={() => openEditIncome(inc)} className="text-blue-500 hover:text-blue-700 text-xs hover:underline mr-2">編輯</button>
                              <button onClick={() => handleDeleteIncome(inc.id)} className="text-red-500 hover:text-red-700 text-xs hover:underline">刪除</button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot className="bg-green-50 border-t border-green-100">
                      <tr>
                        <td colSpan={3} className="px-5 py-2.5 text-xs font-semibold text-gray-600">共 {projIncomes.length} 筆收款</td>
                        <td className="px-5 py-2.5 text-right font-bold text-green-800">NT$ {received.toLocaleString()}</td>
                        <td colSpan={6} />
                      </tr>
                    </tfoot>
                  </table>
                )}
              </div>
            );
          })}
        </div>
      )}
      <ConfirmModal dialog={confirmDlg} onClose={closeConfirm} />
    </div>
  );
}
