'use client';
import { useState, useEffect, useCallback } from 'react';
import Navigation from '@/components/Navigation';

const fmt = (n) => (n == null ? '—' : Number(n).toLocaleString('zh-TW'));
const fmtDate = (d) => d || '—';

const STATUS_BADGE = {
  '核對中': 'bg-amber-100 text-amber-700',
  '已平衡': 'bg-green-100 text-green-700',
  '有差異': 'bg-red-100 text-red-700',
};

const MATCH_BADGE = {
  '未配對': 'bg-gray-100 text-gray-600',
  '已配對': 'bg-green-100 text-green-700',
  '例外核准': 'bg-blue-100 text-blue-700',
};

export default function BankReconciliationPage() {
  const [accounts, setAccounts]   = useState([]);
  const [accountId, setAccountId] = useState('');
  const [yearMonth, setYearMonth] = useState(() => {
    const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [stmts, setStmts]         = useState([]);
  const [detail, setDetail]       = useState(null);  // 目前開啟的調節表
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState('');
  const [success, setSuccess]     = useState('');
  const [autoMatching, setAutoMatching] = useState(false);

  // 新增存摺明細的表單狀態
  const [lineForm, setLineForm]   = useState({ txDate: '', description: '', creditAmount: '', debitAmount: '', runningBalance: '', note: '' });
  const [addingLine, setAddingLine] = useState(false);

  useEffect(() => {
    fetch('/api/cashflow/accounts')
      .then(r => r.json())
      .then(d => {
        const bankAccts = Array.isArray(d) ? d.filter(a => a.type === '銀行存款' && a.isActive) : [];
        setAccounts(bankAccts);
        if (bankAccts.length) setAccountId(String(bankAccts[0].id));
      })
      .catch(() => {});
  }, []);

  const loadList = useCallback(async () => {
    if (!accountId) return;
    setLoading(true); setError('');
    try {
      const res  = await fetch(`/api/bank-reconciliation?accountId=${accountId}&yearMonth=${yearMonth}`);
      const data = await res.json();
      setStmts(Array.isArray(data) ? data : []);
    } catch { setError('載入失敗'); }
    setLoading(false);
  }, [accountId, yearMonth]);

  useEffect(() => { loadList(); }, [loadList]);

  async function openOrCreate() {
    if (!accountId) return;
    setError(''); setSuccess('');
    const res  = await fetch('/api/bank-reconciliation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accountId: parseInt(accountId), yearMonth }),
    });
    const data = await res.json();
    if (!res.ok) { setError(data.error?.message || '建立失敗'); return; }
    await loadDetail(data.id);
    loadList();
  }

  async function loadDetail(id) {
    setLoading(true);
    try {
      const res  = await fetch(`/api/bank-reconciliation/${id}`);
      const data = await res.json();
      setDetail(data);
    } catch { setError('載入詳情失敗'); }
    setLoading(false);
  }

  async function updateStmt(patch) {
    if (!detail) return;
    const res  = await fetch(`/api/bank-reconciliation/${detail.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    const data = await res.json();
    if (res.ok) { setDetail(prev => ({ ...prev, ...data })); setSuccess('已更新'); loadList(); }
    else setError(data.error?.message || '更新失敗');
  }

  async function addLine() {
    if (!detail || !lineForm.txDate) return;
    setAddingLine(true);
    const res  = await fetch(`/api/bank-reconciliation/${detail.id}/lines`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        txDate:        lineForm.txDate,
        description:   lineForm.description || null,
        creditAmount:  parseFloat(lineForm.creditAmount) || 0,
        debitAmount:   parseFloat(lineForm.debitAmount)  || 0,
        runningBalance: lineForm.runningBalance ? parseFloat(lineForm.runningBalance) : null,
        note:          lineForm.note || null,
      }),
    });
    if (res.ok) {
      setLineForm({ txDate: '', description: '', creditAmount: '', debitAmount: '', runningBalance: '', note: '' });
      setSuccess('已新增明細');
      await loadDetail(detail.id);
    } else {
      const d = await res.json(); setError(d.error?.message || '新增失敗');
    }
    setAddingLine(false);
  }

  async function matchLine(lineId, txId) {
    await fetch(`/api/bank-reconciliation/${detail.id}/lines/${lineId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ matchedTxId: txId, matchStatus: txId ? '已配對' : '未配對' }),
    });
    await loadDetail(detail.id);
  }

  async function approveException(lineId) {
    await fetch(`/api/bank-reconciliation/${detail.id}/lines/${lineId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ matchStatus: '例外核准' }),
    });
    await loadDetail(detail.id);
  }

  async function deleteLine(lineId) {
    if (!confirm('確定刪除此行？')) return;
    await fetch(`/api/bank-reconciliation/${detail.id}/lines/${lineId}`, { method: 'DELETE' });
    await loadDetail(detail.id);
  }

  async function autoMatch() {
    if (!detail) return;
    setAutoMatching(true); setError(''); setSuccess('');
    const res  = await fetch(`/api/bank-reconciliation/${detail.id}/auto-match`, { method: 'POST' });
    const data = await res.json();
    if (res.ok) { setSuccess(`自動配對完成：新配對 ${data.matched} 筆，剩餘未配對 ${data.unmatchedAfter} 筆`); await loadDetail(detail.id); }
    else setError(data.error?.message || '自動配對失敗');
    setAutoMatching(false);
  }

  // 計算統計
  const calcStats = () => {
    if (!detail) return {};
    const sysBalance = detail.closingSystemBalance ?? 0;
    const bankBalance = detail.closingBankBalance ?? null;
    const diff = bankBalance != null ? bankBalance - sysBalance : null;
    const unmatchedLines = (detail.lines || []).filter(l => l.matchStatus === '未配對').length;
    const unmatchedSysTxs = (detail.systemTransactions || []).filter(t => !t.isMatched).length;
    return { sysBalance, bankBalance, diff, unmatchedLines, unmatchedSysTxs };
  };
  const stats = calcStats();

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-800">存簿核對（銀行調節表）</h1>
        </div>

        {/* 篩選 */}
        <div className="bg-white rounded-xl shadow-sm p-4 flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs text-gray-500 mb-1">銀行帳戶</label>
            <select value={accountId} onChange={e => setAccountId(e.target.value)} className="border rounded-lg px-3 py-1.5 text-sm min-w-[200px]">
              <option value="">— 請選擇 —</option>
              {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">月份</label>
            <input type="month" value={yearMonth} onChange={e => setYearMonth(e.target.value)} className="border rounded-lg px-3 py-1.5 text-sm" />
          </div>
          <button onClick={openOrCreate} className="bg-blue-600 text-white px-4 py-1.5 rounded-lg text-sm hover:bg-blue-700">
            開啟 / 建立調節表
          </button>
        </div>

        {error   && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-lg text-sm">{error}</div>}
        {success && <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-2 rounded-lg text-sm">{success}</div>}

        {/* 調節表主畫面 */}
        {detail && (
          <div className="space-y-4">
            {/* 調節摘要 */}
            <div className="bg-white rounded-xl shadow-sm p-5 border-l-4 border-blue-500">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-bold text-gray-800">{detail.yearMonth} 調節表</h2>
                <span className={`text-xs px-3 py-1 rounded-full ${STATUS_BADGE[detail.status] || 'bg-gray-100 text-gray-600'}`}>{detail.status}</span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <p className="text-xs text-gray-500">系統期初餘額</p>
                  <p className="font-bold text-gray-800">{fmt(detail.openingBalance)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">系統期末餘額（計算值）</p>
                  <p className="font-bold text-blue-700">{fmt(stats.sysBalance)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-1">存摺期末餘額（人工輸入）</p>
                  <input type="number" step="1"
                    defaultValue={detail.closingBankBalance ?? ''}
                    onBlur={e => updateStmt({ closingBankBalance: parseFloat(e.target.value) || null })}
                    className="border rounded-lg px-3 py-1.5 text-sm w-full text-right"
                    placeholder="輸入存摺期末餘額" />
                </div>
                <div>
                  <p className="text-xs text-gray-500">差異</p>
                  <p className={`font-bold text-xl ${stats.diff == null ? 'text-gray-400' : Math.abs(stats.diff) < 1 ? 'text-green-600' : 'text-red-600'}`}>
                    {stats.diff == null ? '—' : (stats.diff >= 0 ? '+' : '') + fmt(stats.diff)}
                  </p>
                  {stats.diff != null && Math.abs(stats.diff) < 1 && (
                    <button onClick={() => updateStmt({ status: '已平衡' })} className="mt-1 text-xs text-green-700 underline">
                      標記為已平衡
                    </button>
                  )}
                </div>
              </div>
              <div className="mt-3 flex gap-3 text-xs text-gray-500">
                <span>未配對存摺明細：<b className={stats.unmatchedLines ? 'text-red-600' : 'text-green-600'}>{stats.unmatchedLines} 筆</b></span>
                <span>未配對系統交易：<b className={stats.unmatchedSysTxs ? 'text-amber-600' : 'text-green-600'}>{stats.unmatchedSysTxs} 筆</b></span>
              </div>
            </div>

            {/* 兩欄並列：存摺明細 vs 系統交易 */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* 左：存摺明細 */}
              <div className="bg-white rounded-xl shadow-sm overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b">
                  <h3 className="font-medium text-sm text-gray-700">銀行存摺明細</h3>
                  <button onClick={autoMatch} disabled={autoMatching} className="text-xs bg-teal-600 text-white px-3 py-1 rounded-lg hover:bg-teal-700 disabled:opacity-50">
                    {autoMatching ? '配對中…' : '自動配對'}
                  </button>
                </div>

                {/* 新增存摺行 */}
                <div className="p-3 border-b bg-gray-50">
                  <p className="text-xs text-gray-500 mb-2">新增存摺行</p>
                  <div className="grid grid-cols-3 gap-2">
                    <input type="date" value={lineForm.txDate} onChange={e => setLineForm(p => ({ ...p, txDate: e.target.value }))}
                      className="border rounded px-2 py-1 text-xs" placeholder="日期" />
                    <input type="text" value={lineForm.description} onChange={e => setLineForm(p => ({ ...p, description: e.target.value }))}
                      className="border rounded px-2 py-1 text-xs" placeholder="說明" />
                    <div className="flex gap-1">
                      <input type="number" step="1" value={lineForm.creditAmount} onChange={e => setLineForm(p => ({ ...p, creditAmount: e.target.value }))}
                        className="border rounded px-2 py-1 text-xs w-full" placeholder="存入" />
                      <input type="number" step="1" value={lineForm.debitAmount} onChange={e => setLineForm(p => ({ ...p, debitAmount: e.target.value }))}
                        className="border rounded px-2 py-1 text-xs w-full" placeholder="提出" />
                    </div>
                    <input type="number" step="1" value={lineForm.runningBalance} onChange={e => setLineForm(p => ({ ...p, runningBalance: e.target.value }))}
                      className="border rounded px-2 py-1 text-xs col-span-2" placeholder="存摺餘額（選填）" />
                    <button onClick={addLine} disabled={addingLine || !lineForm.txDate} className="text-xs bg-green-600 text-white rounded px-2 py-1 hover:bg-green-700 disabled:opacity-50">
                      {addingLine ? '…' : '新增'}
                    </button>
                  </div>
                </div>

                <div className="overflow-y-auto max-h-96">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50 text-gray-500 sticky top-0">
                      <tr>
                        <th className="px-3 py-2 text-left">日期</th>
                        <th className="px-3 py-2 text-left">說明</th>
                        <th className="px-3 py-2 text-right">存入</th>
                        <th className="px-3 py-2 text-right">提出</th>
                        <th className="px-3 py-2 text-center">狀態</th>
                        <th className="px-3 py-2 text-center">操作</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {(detail.lines || []).length === 0 && (
                        <tr><td colSpan={6} className="text-center py-6 text-gray-400">尚無存摺明細</td></tr>
                      )}
                      {(detail.lines || []).map(line => (
                        <tr key={line.id} className={`hover:bg-gray-50 ${line.matchStatus === '未配對' ? 'bg-amber-50/30' : ''}`}>
                          <td className="px-3 py-2 font-mono">{line.txDate}</td>
                          <td className="px-3 py-2 text-gray-500 max-w-[100px] truncate" title={line.description}>{line.description || '—'}</td>
                          <td className="px-3 py-2 text-right text-green-700">{line.creditAmount > 0 ? fmt(line.creditAmount) : ''}</td>
                          <td className="px-3 py-2 text-right text-red-600">{line.debitAmount > 0 ? fmt(line.debitAmount) : ''}</td>
                          <td className="px-3 py-2 text-center">
                            <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${MATCH_BADGE[line.matchStatus] || 'bg-gray-100'}`}>
                              {line.matchStatus}
                              {line.matchedTxId && ` #${line.matchedTxId}`}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-center">
                            <div className="flex gap-1 justify-center">
                              {line.matchStatus === '未配對' && (
                                <button onClick={() => approveException(line.id)} className="text-[10px] text-blue-600 hover:underline">例外</button>
                              )}
                              {line.matchedTxId && (
                                <button onClick={() => matchLine(line.id, null)} className="text-[10px] text-amber-600 hover:underline">解除</button>
                              )}
                              <button onClick={() => deleteLine(line.id)} className="text-[10px] text-red-500 hover:underline">刪</button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* 右：系統交易 */}
              <div className="bg-white rounded-xl shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b">
                  <h3 className="font-medium text-sm text-gray-700">系統現金流交易（本月）</h3>
                </div>
                <div className="overflow-y-auto max-h-[508px]">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50 text-gray-500 sticky top-0">
                      <tr>
                        <th className="px-3 py-2 text-left">日期</th>
                        <th className="px-3 py-2 text-left">說明</th>
                        <th className="px-3 py-2 text-right">金額</th>
                        <th className="px-3 py-2 text-center">配對</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {(detail.systemTransactions || []).length === 0 && (
                        <tr><td colSpan={4} className="text-center py-6 text-gray-400">本月無系統交易</td></tr>
                      )}
                      {(detail.systemTransactions || []).map(t => (
                        <tr key={t.id} className={`hover:bg-gray-50 ${!t.isMatched ? 'bg-yellow-50/30' : ''}`}>
                          <td className="px-3 py-2 font-mono">{t.transactionDate}</td>
                          <td className="px-3 py-2 text-gray-500 max-w-[120px] truncate" title={t.description}>{t.description || t.sourceType}</td>
                          <td className={`px-3 py-2 text-right font-medium ${t.type === '收入' ? 'text-green-700' : 'text-red-600'}`}>
                            {t.type === '收入' ? '+' : '-'}{fmt(t.amount)}
                          </td>
                          <td className="px-3 py-2 text-center">
                            {t.isMatched
                              ? <span className="text-[10px] text-green-600">✓</span>
                              : <span className="text-[10px] text-amber-500">未配對</span>
                            }
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* 說明 */}
            <div className="bg-teal-50 border border-teal-200 rounded-xl p-4 text-xs text-teal-700 space-y-1">
              <p><b>使用流程：</b>①輸入銀行存摺各筆明細 → ②點「自動配對」比對系統交易（同日期±1元） → ③剩餘未配對項目人工處理 → ④輸入存摺期末餘額 → ⑤差異=0 → 標記已平衡</p>
              <p><b>差異來源：</b>在途交易（系統已記/銀行未到）、銀行費用（銀行已扣/系統未記）、錯帳</p>
              <p>銀行費用可回到「現金流」補記一筆支出，再重新自動配對。</p>
            </div>
          </div>
        )}

        {/* 歷史調節表列表 */}
        {stmts.length > 0 && !detail && (
          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500">
                <tr>
                  <th className="px-4 py-3 text-left">月份</th>
                  <th className="px-4 py-3 text-left">帳戶</th>
                  <th className="px-4 py-3 text-right">系統期初</th>
                  <th className="px-4 py-3 text-right">存摺期末</th>
                  <th className="px-4 py-3 text-center">明細筆數</th>
                  <th className="px-4 py-3 text-center">狀態</th>
                  <th className="px-4 py-3 text-center">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {stmts.map(s => (
                  <tr key={s.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono">{s.yearMonth}</td>
                    <td className="px-4 py-3">{s.account?.name || s.accountId}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{fmt(s.openingBalance)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{fmt(s.closingBankBalance)}</td>
                    <td className="px-4 py-3 text-center">{s.lineCount}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_BADGE[s.status] || 'bg-gray-100'}`}>{s.status}</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button onClick={() => loadDetail(s.id)} className="text-xs text-blue-600 hover:underline">開啟</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {detail && (
          <button onClick={() => setDetail(null)} className="text-sm text-gray-500 hover:underline">← 返回列表</button>
        )}
      </div>
    </div>
  );
}
