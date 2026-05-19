'use client';
import { useState, useEffect, useCallback, useRef } from 'react';

const fmt = (n) => (n == null ? '—' : Number(n).toLocaleString('zh-TW'));
const fmtPct = (a, b) => (b ? ((a / b) * 100).toFixed(2) + '%' : '—');

const STATUS_BADGE = {
  '未核對': 'bg-gray-100 text-gray-600',
  '已核對': 'bg-green-100 text-green-700',
  '有差異': 'bg-amber-100 text-amber-700',
  '已建帳': 'bg-blue-100 text-blue-700',
};

const EMPTY_FORM = {
  provider: '國泰世華', merchantCode: '', billingDate: '', settlementDate: '',
  bankAccountId: '',
  billedAmount: '', adjustment: '0', feeAmount: '', serviceFee: '0', otherFee: '0', netAmount: '',
  cardBreakdown: { VISA: { count: '', amount: '', fee: '' }, MASTER: { count: '', amount: '', fee: '' }, JCB: { count: '', amount: '', fee: '' }, CUP: { count: '', amount: '', fee: '' } },
  note: '',
};

export default function PmsIncomeCreditCardTab({ WAREHOUSES }) {
  const [warehouse, setWarehouse]   = useState(WAREHOUSES?.[0] || '');
  const [yearMonth, setYearMonth]   = useState(() => {
    const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [statements, setStatements] = useState([]);
  const [accounts, setAccounts]     = useState([]);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState('');
  const [success, setSuccess]       = useState('');

  const [showForm, setShowForm]     = useState(false);
  const [editId, setEditId]         = useState(null);
  const [form, setForm]             = useState(EMPTY_FORM);
  const [saving, setSaving]         = useState(false);
  const [expandedId, setExpandedId] = useState(null);

  // ── Excel 匯入 state ──────────────────────────────────────────
  const [showExcel,     setShowExcel]     = useState(false);
  const [excelFile,     setExcelFile]     = useState(null);
  const [excelPreview,  setExcelPreview]  = useState(null); // parsed 預覽資料
  const [excelLoading,  setExcelLoading]  = useState(false);
  const [excelImporting,setExcelImporting]= useState(false);
  const [excelMsg,      setExcelMsg]      = useState('');   // success/error message
  const fileInputRef = useRef(null);

  // 載入對帳單列表
  const load = useCallback(async () => {
    if (!warehouse) return;
    setLoading(true); setError('');
    try {
      const res = await fetch(`/api/pms-income/credit-card-statements?warehouse=${encodeURIComponent(warehouse)}&yearMonth=${yearMonth}`);
      const data = await res.json();
      setStatements(Array.isArray(data) ? data : []);
    } catch { setError('載入失敗'); }
    setLoading(false);
  }, [warehouse, yearMonth]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    fetch('/api/cashflow/accounts').then(r => r.json()).then(d => {
      setAccounts(Array.isArray(d) ? d.filter(a => a.type === '銀行存款' && a.isActive) : []);
    }).catch(() => {});
  }, []);

  function openNew() {
    setEditId(null);
    const today = new Date();
    const yest  = new Date(today); yest.setDate(yest.getDate() - 1);
    const fmt8  = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    setForm({ ...EMPTY_FORM, billingDate: fmt8(yest), settlementDate: fmt8(today), bankAccountId: accounts[0]?.id || '' });
    setShowForm(true);
  }

  function openEdit(s) {
    setEditId(s.id);
    const breakdown = s.cardBreakdown || { VISA: {}, MASTER: {}, JCB: {}, CUP: {} };
    setForm({
      provider: s.provider, merchantCode: s.merchantCode || '',
      billingDate: s.billingDate, settlementDate: s.settlementDate,
      bankAccountId: s.bankAccountId || '',
      billedAmount: s.billedAmount, adjustment: s.adjustment,
      feeAmount: s.feeAmount, serviceFee: s.serviceFee, otherFee: s.otherFee,
      netAmount: s.netAmount,
      cardBreakdown: {
        VISA:   breakdown.VISA   || {},
        MASTER: breakdown.MASTER || {},
        JCB:    breakdown.JCB   || {},
        CUP:    breakdown.CUP   || {},
      },
      note: s.note || '',
    });
    setShowForm(true);
  }

  // 自動計算撥款淨額
  function autoCalcNet(f) {
    const b = parseFloat(f.billedAmount) || 0;
    const a = parseFloat(f.adjustment)  || 0;
    const fee = parseFloat(f.feeAmount) || 0;
    const sv  = parseFloat(f.serviceFee) || 0;
    const ot  = parseFloat(f.otherFee)   || 0;
    return (b - fee + a - sv - ot).toFixed(0);
  }

  function setField(k, v) {
    setForm(prev => {
      const next = { ...prev, [k]: v };
      if (['billedAmount', 'adjustment', 'feeAmount', 'serviceFee', 'otherFee'].includes(k)) {
        next.netAmount = autoCalcNet(next);
      }
      return next;
    });
  }

  function setBreakdown(card, field, val) {
    setForm(prev => ({
      ...prev,
      cardBreakdown: { ...prev.cardBreakdown, [card]: { ...prev.cardBreakdown[card], [field]: val } },
    }));
  }

  async function save() {
    setSaving(true); setError(''); setSuccess('');
    try {
      const body = {
        warehouse, ...form,
        billedAmount: parseFloat(form.billedAmount) || 0,
        adjustment:   parseFloat(form.adjustment)   || 0,
        feeAmount:    parseFloat(form.feeAmount)    || 0,
        serviceFee:   parseFloat(form.serviceFee)   || 0,
        otherFee:     parseFloat(form.otherFee)     || 0,
        netAmount:    parseFloat(form.netAmount)    || 0,
        bankAccountId: form.bankAccountId ? parseInt(form.bankAccountId) : null,
        cardBreakdown: form.cardBreakdown,
      };
      const url    = editId ? `/api/pms-income/credit-card-statements/${editId}` : '/api/pms-income/credit-card-statements';
      const method = editId ? 'PATCH' : 'POST';
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json();
      if (res.ok) {
        setSuccess(editId ? '已更新' : '已新增');
        setShowForm(false); load();
      } else {
        setError(data.error?.message || '儲存失敗');
      }
    } catch { setError('儲存失敗'); }
    setSaving(false);
  }

  async function book(id) {
    if (!confirm('確定建立現金流分錄？\n系統將建立：\n① 收入（撥款淨額→銀行帳戶）\n② 支出（手續費）')) return;
    setError(''); setSuccess('');
    const res = await fetch(`/api/pms-income/credit-card-statements/${id}/book`, { method: 'POST' });
    const data = await res.json();
    if (res.ok) { setSuccess('現金流分錄建立成功'); load(); }
    else setError(data.error?.message || '建帳失敗');
  }

  async function del(id) {
    if (!confirm('確定刪除此對帳單？')) return;
    const res = await fetch(`/api/pms-income/credit-card-statements/${id}`, { method: 'DELETE' });
    if (res.ok) { setSuccess('已刪除'); load(); }
    else { const d = await res.json(); setError(d.error?.message || '刪除失敗'); }
  }

  // ── Excel 匯入邏輯 ────────────────────────────────────────────
  async function handleExcelFileChange(file) {
    setExcelFile(file);
    setExcelPreview(null);
    setExcelMsg('');
    if (!file) return;
    setExcelLoading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('warehouse', warehouse);
      fd.append('preview', 'true');
      const res = await fetch('/api/reconciliation/credit-card-statements/import-excel', { method: 'POST', body: fd });
      const data = await res.json();
      if (res.ok && data.preview) {
        setExcelPreview(data.parsed);
      } else if (res.status === 422) {
        setExcelPreview(data.parsed);
        setExcelMsg(`⚠️ ${data.warning}`);
      } else {
        setExcelMsg(`解析失敗：${data.error?.message || data.message || '格式無法識別'}`);
      }
    } catch { setExcelMsg('解析失敗，請確認檔案格式'); }
    setExcelLoading(false);
  }

  async function doExcelImport() {
    if (!excelFile) return;
    setExcelImporting(true); setExcelMsg('');
    try {
      const fd = new FormData();
      fd.append('file', excelFile);
      fd.append('warehouse', warehouse);
      const res = await fetch('/api/reconciliation/credit-card-statements/import-excel', { method: 'POST', body: fd });
      const data = await res.json();
      if (res.ok && data.ok) {
        setExcelMsg(`✅ 匯入成功，對帳單 ID: ${data.id}`);
        setExcelFile(null);
        setExcelPreview(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
        load();
      } else if (res.status === 409) {
        setExcelMsg(`⚠️ ${data.message}`);
      } else {
        setExcelMsg(`匯入失敗：${data.error?.message || data.message || '未知錯誤'}`);
      }
    } catch { setExcelMsg('匯入失敗'); }
    setExcelImporting(false);
  }

  function closeExcel() {
    setShowExcel(false);
    setExcelFile(null);
    setExcelPreview(null);
    setExcelMsg('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  // 統計
  const totalBilled = statements.reduce((s, r) => s + (r.billedAmount || 0), 0);
  const totalFee    = statements.reduce((s, r) => s + (r.feeAmount || 0) + (r.serviceFee || 0) + (r.otherFee || 0), 0);
  const totalNet    = statements.reduce((s, r) => s + (r.netAmount || 0), 0);
  const unbooked    = statements.filter(r => r.status !== '已建帳').length;

  return (
    <div className="space-y-4">
      {/* 篩選列 */}
      <div className="bg-white rounded-xl shadow-sm p-4 flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs text-gray-500 mb-1">館別</label>
          <select value={warehouse} onChange={e => setWarehouse(e.target.value)} className="border rounded-lg px-3 py-1.5 text-sm">
            {(WAREHOUSES || []).map(w => <option key={w} value={w}>{w}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">月份</label>
          <input type="month" value={yearMonth} onChange={e => setYearMonth(e.target.value)} className="border rounded-lg px-3 py-1.5 text-sm" />
        </div>
        <button onClick={load} className="bg-blue-600 text-white px-4 py-1.5 rounded-lg text-sm hover:bg-blue-700">載入</button>
        <div className="ml-auto flex gap-2">
          <button onClick={() => { setShowExcel(true); setExcelMsg(''); }} className="bg-purple-600 text-white px-4 py-1.5 rounded-lg text-sm hover:bg-purple-700">Excel 匯入</button>
          <button onClick={openNew} className="bg-green-600 text-white px-4 py-1.5 rounded-lg text-sm hover:bg-green-700">＋ 新增對帳單</button>
        </div>
      </div>

      {error   && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-lg text-sm">{error}</div>}
      {success && <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-2 rounded-lg text-sm">{success}</div>}

      {/* 月度摘要 */}
      {statements.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: '請款金額合計', val: fmt(totalBilled), color: 'border-blue-400' },
            { label: '手續費合計',   val: fmt(totalFee),    color: 'border-amber-400', sub: fmtPct(totalFee, totalBilled) },
            { label: '撥款淨額合計', val: fmt(totalNet),    color: 'border-green-400' },
            { label: '待建帳筆數',   val: `${unbooked} 筆`, color: unbooked ? 'border-red-400' : 'border-gray-300' },
          ].map(({ label, val, color, sub }) => (
            <div key={label} className={`bg-white rounded-xl shadow-sm p-4 border-l-4 ${color}`}>
              <p className="text-xs text-gray-500">{label}</p>
              <p className="text-xl font-bold text-gray-800">{val}</p>
              {sub && <p className="text-xs text-gray-400">{sub}</p>}
            </div>
          ))}
        </div>
      )}

      {/* 對帳單列表 */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs text-gray-500">
            <tr>
              <th className="px-4 py-3 text-left">請款日</th>
              <th className="px-4 py-3 text-left">撥款日</th>
              <th className="px-4 py-3 text-left">收單機構</th>
              <th className="px-4 py-3 text-right">請款金額</th>
              <th className="px-4 py-3 text-right">PMS合計</th>
              <th className="px-4 py-3 text-right">差異</th>
              <th className="px-4 py-3 text-right">手續費</th>
              <th className="px-4 py-3 text-right">撥款淨額</th>
              <th className="px-4 py-3 text-center">狀態</th>
              <th className="px-4 py-3 text-center">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading && <tr><td colSpan={10} className="text-center py-8 text-gray-400">載入中…</td></tr>}
            {!loading && statements.length === 0 && <tr><td colSpan={10} className="text-center py-8 text-gray-400">本月尚無對帳單，請點「新增對帳單」輸入</td></tr>}
            {statements.map(s => {
              const isExpanded = expandedId === s.id;
              const totalFeeRow = (s.feeAmount || 0) + (s.serviceFee || 0) + (s.otherFee || 0);
              const diffOk = s.diffAmount != null && Math.abs(s.diffAmount) < 0.5;
              return [
                <tr key={s.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => setExpandedId(isExpanded ? null : s.id)}>
                  <td className="px-4 py-3 font-mono text-xs">{s.billingDate}</td>
                  <td className="px-4 py-3 font-mono text-xs text-blue-600">{s.settlementDate}</td>
                  <td className="px-4 py-3">{s.provider}{s.merchantCode && <span className="ml-1 text-xs text-gray-400">#{s.merchantCode}</span>}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{fmt(s.billedAmount)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-gray-500">{fmt(s.pmsBilledAmount)}</td>
                  <td className={`px-4 py-3 text-right tabular-nums font-medium ${s.diffAmount == null ? 'text-gray-300' : diffOk ? 'text-green-600' : 'text-red-600'}`}>
                    {s.diffAmount == null ? '—' : (s.diffAmount >= 0 ? '+' : '') + fmt(s.diffAmount)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-amber-700">{fmt(totalFeeRow)}</td>
                  <td className="px-4 py-3 text-right tabular-nums font-medium text-blue-700">{fmt(s.netAmount)}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_BADGE[s.status] || 'bg-gray-100'}`}>{s.status}</span>
                  </td>
                  <td className="px-4 py-3 text-center" onClick={e => e.stopPropagation()}>
                    <div className="flex gap-1 justify-center">
                      {s.status !== '已建帳' && (
                        <>
                          <button onClick={() => openEdit(s)} className="text-xs px-2 py-1 border rounded hover:bg-gray-50">編輯</button>
                          <button onClick={() => book(s.id)} className="text-xs px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700" title="建立現金流分錄">建帳</button>
                          <button onClick={() => del(s.id)} className="text-xs px-2 py-1 text-red-600 border border-red-300 rounded hover:bg-red-50">刪除</button>
                        </>
                      )}
                      {s.status === '已建帳' && (
                        <span className="text-xs text-gray-400">已建帳</span>
                      )}
                    </div>
                  </td>
                </tr>,
                isExpanded && (
                  <tr key={`${s.id}-detail`} className="bg-blue-50">
                    <td colSpan={10} className="px-6 py-4">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                        <div>
                          <p className="text-gray-500 mb-1">金額明細（對帳單公式）</p>
                          <p>請款金額(1)：{fmt(s.billedAmount)}</p>
                          <p>調整(2)：{s.adjustment > 0 ? '+' : ''}{fmt(s.adjustment)}</p>
                          <p>手續費(3)：{fmt(s.feeAmount)}</p>
                          <p>服務費(4)：{fmt(s.serviceFee)}</p>
                          <p>費用(5)：{fmt(s.otherFee)}</p>
                          <p className="font-medium text-blue-700 mt-1">撥款淨額(6)：{fmt(s.netAmount)}</p>
                        </div>
                        {s.cardBreakdown && (
                          <div>
                            <p className="text-gray-500 mb-1">卡別明細</p>
                            {Object.entries(s.cardBreakdown).map(([card, d]) =>
                              d?.amount ? (
                                <p key={card}>{card}：{d.count}筆 {fmt(d.amount)} 費{fmt(d.fee)}</p>
                              ) : null
                            )}
                          </div>
                        )}
                        <div>
                          <p className="text-gray-500 mb-1">核對結果</p>
                          <p>PMS 信用卡合計：{fmt(s.pmsBilledAmount)}</p>
                          <p>對帳單請款金額：{fmt(s.billedAmount)}</p>
                          <p className={`font-medium ${diffOk ? 'text-green-700' : 'text-red-600'}`}>
                            差異：{s.diffAmount == null ? '未比對' : (s.diffAmount >= 0 ? '+' : '') + fmt(s.diffAmount)}
                          </p>
                        </div>
                        <div>
                          <p className="text-gray-500 mb-1">現金流分錄</p>
                          {s.incomeTxId  && <p className="text-green-700">收入 TX#{s.incomeTxId}（{fmt(s.netAmount)}）</p>}
                          {s.feeTxId     && <p className="text-amber-700">手續費 TX#{s.feeTxId}（{fmt(s.feeAmount)}）</p>}
                          {!s.incomeTxId && <p className="text-gray-400">尚未建帳</p>}
                          {s.note && <p className="text-gray-500 mt-1">備註：{s.note}</p>}
                        </div>
                      </div>
                    </td>
                  </tr>
                ),
              ];
            })}
          </tbody>
        </table>
      </div>

      {/* 說明 */}
      <div className="bg-teal-50 border border-teal-200 rounded-xl p-4 text-xs text-teal-700 space-y-1">
        <p><b>使用流程：</b>①收到銀行對帳單 Email → ②點「新增對帳單」輸入數字 → ③確認與 PMS 差異 → ④點「建帳」建立現金流分錄（收入+手續費）</p>
        <p><b>撥款淨額(6) = 請款金額(1) − 手續費(3) ± 調整(2) − 服務費(4) − 費用(5)</b>（系統自動驗算）</p>
        <p><b>建帳後：</b>銀行帳戶新增「收入＋撥款淨額」及「支出＋手續費」各一筆，自動影響存簿餘額與損益表。</p>
      </div>

      {/* Excel 匯入 Modal */}
      {showExcel && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto">
            <div className="p-5 border-b flex justify-between items-center">
              <h2 className="text-base font-bold">匯入聯合刷卡中心 Excel 對帳單</h2>
              <button onClick={closeExcel} className="text-gray-400 hover:text-gray-700 text-xl">✕</button>
            </div>
            <div className="p-5 space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-700">
                支援 .xls / .xlsx 格式。系統會自動識別請款日、撥款日、卡別、金額、手續費等欄位。<br />
                目前館別：<strong>{warehouse}</strong>
              </div>

              <div>
                <label className="block text-xs text-gray-500 mb-1">選擇 Excel 檔案</label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xls,.xlsx"
                  onChange={e => handleExcelFileChange(e.target.files?.[0] || null)}
                  className="block w-full text-sm text-gray-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-sm file:bg-purple-50 file:text-purple-700 hover:file:bg-purple-100 border rounded-lg px-2 py-1.5"
                />
              </div>

              {excelLoading && (
                <div className="text-center py-4 text-gray-400 text-sm">解析中…</div>
              )}

              {excelMsg && (
                <div className={`rounded-lg px-3 py-2 text-sm ${excelMsg.startsWith('✅') ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-amber-50 text-amber-700 border border-amber-200'}`}>
                  {excelMsg}
                </div>
              )}

              {excelPreview && !excelLoading && (
                <div className="border rounded-xl overflow-hidden text-xs">
                  <div className="bg-gray-50 px-4 py-2 font-medium text-gray-700 flex gap-4 flex-wrap">
                    <span>請款日：<strong>{excelPreview.billingDate || '—'}</strong></span>
                    <span>撥款日：<strong>{excelPreview.paymentDate || '—'}</strong></span>
                    <span>銀行：<strong>{excelPreview.bankName || '—'}</strong></span>
                    <span>特店代號：<strong>{excelPreview.merchantId || '—'}</strong></span>
                  </div>
                  <div className="grid grid-cols-2 divide-x">
                    <div className="p-3 space-y-1">
                      <p className="font-medium text-gray-600 mb-1">金額摘要</p>
                      <p>請款金額：<span className="font-mono">{Number(excelPreview.totalAmount).toLocaleString()}</span></p>
                      <p>調整：<span className="font-mono">{Number(excelPreview.adjustment).toLocaleString()}</span></p>
                      <p>手續費：<span className="font-mono text-amber-700">{Number(excelPreview.totalFee).toLocaleString()}</span></p>
                      <p>撥款淨額：<span className="font-mono font-bold text-blue-700">{Number(excelPreview.netAmount).toLocaleString()}</span></p>
                      <p>筆數：{excelPreview.totalCount}</p>
                    </div>
                    <div className="p-3 space-y-1">
                      <p className="font-medium text-gray-600 mb-1">
                        批次明細 ({excelPreview.batchLines?.length || 0} 筆)
                        {excelPreview.feeDetails?.length > 0 && `・費率明細 (${excelPreview.feeDetails.length} 筆)`}
                      </p>
                      {excelPreview.batchLines?.slice(0, 5).map((l, i) => (
                        <p key={i}>{l.cardType} {l.batchNo ? `批#${l.batchNo}` : ''} {Number(l.amount).toLocaleString()}</p>
                      ))}
                      {(excelPreview.batchLines?.length || 0) > 5 && <p className="text-gray-400">…</p>}
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="p-5 border-t flex gap-3 justify-end">
              <button onClick={closeExcel} className="px-4 py-2 border rounded-lg text-sm text-gray-600 hover:bg-gray-50">取消</button>
              <button
                onClick={doExcelImport}
                disabled={!excelFile || excelLoading || excelImporting || !excelPreview?.billingDate}
                className="px-5 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {excelImporting ? '匯入中…' : '確認匯入'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 新增/編輯 Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b flex justify-between items-center">
              <h2 className="text-lg font-bold">{editId ? '編輯對帳單' : '新增信用卡對帳單'}</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-700 text-xl">✕</button>
            </div>
            <div className="p-6 space-y-5">
              {/* 基本資訊 */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">收單機構 *</label>
                  <input value={form.provider} onChange={e => setField('provider', e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="國泰世華、玉山…" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">特店代號</label>
                  <input value={form.merchantCode} onChange={e => setField('merchantCode', e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="310800073" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">請款日 *（對帳單上的日期）</label>
                  <input type="date" value={form.billingDate} onChange={e => setField('billingDate', e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">撥款日 *（銀行入帳日）</label>
                  <input type="date" value={form.settlementDate} onChange={e => setField('settlementDate', e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm" />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs text-gray-500 mb-1">入帳帳戶 *</label>
                  <select value={form.bankAccountId} onChange={e => setField('bankAccountId', e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm">
                    <option value="">— 請選擇 —</option>
                    {accounts.map(a => <option key={a.id} value={a.id}>{a.name}（{a.type}）</option>)}
                  </select>
                </div>
              </div>

              {/* 金額（對帳單格式） */}
              <div className="border rounded-xl p-4 bg-gray-50">
                <p className="text-xs font-medium text-gray-600 mb-3">金額欄位（依國泰世華對帳單格式）</p>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: '請款金額(1) *', key: 'billedAmount' },
                    { label: '調整(2)±',      key: 'adjustment'  },
                    { label: '手續費(3) *',   key: 'feeAmount'   },
                    { label: '服務費(4)',      key: 'serviceFee'  },
                    { label: '費用(5)',        key: 'otherFee'    },
                  ].map(({ label, key }) => (
                    <div key={key}>
                      <label className="block text-xs text-gray-500 mb-1">{label}</label>
                      <input type="number" step="1" value={form[key]}
                        onChange={e => setField(key, e.target.value)}
                        className="w-full border rounded-lg px-3 py-2 text-sm text-right" />
                    </div>
                  ))}
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">撥款淨額(6) ← 自動計算</label>
                    <input type="number" step="1" value={form.netAmount}
                      onChange={e => setField('netAmount', e.target.value)}
                      className="w-full border-2 border-blue-300 rounded-lg px-3 py-2 text-sm text-right font-bold text-blue-700 bg-blue-50" />
                  </div>
                </div>
                <p className="text-xs text-gray-400 mt-2">公式：(1) − (3) ± (2) − (4) − (5) = (6)，系統於儲存時驗算</p>
              </div>

              {/* 卡別明細（選填） */}
              <details className="border rounded-xl">
                <summary className="px-4 py-3 text-sm font-medium cursor-pointer text-gray-700">卡別明細（選填，依對帳單第二頁）</summary>
                <div className="p-4 space-y-2">
                  {['VISA', 'MASTER', 'JCB', 'CUP'].map(card => (
                    <div key={card} className="grid grid-cols-4 gap-2 items-center">
                      <span className="text-xs font-medium text-gray-600">{card}</span>
                      {['count', 'amount', 'fee'].map(f => (
                        <input key={f} type="number" step="any"
                          placeholder={f === 'count' ? '筆數' : f === 'amount' ? '金額' : '手續費'}
                          value={form.cardBreakdown?.[card]?.[f] ?? ''}
                          onChange={e => setBreakdown(card, f, e.target.value)}
                          className="border rounded px-2 py-1 text-xs text-right" />
                      ))}
                    </div>
                  ))}
                </div>
              </details>

              <div>
                <label className="block text-xs text-gray-500 mb-1">備註</label>
                <input value={form.note} onChange={e => setField('note', e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm" />
              </div>
            </div>
            <div className="p-6 border-t flex justify-end gap-3">
              <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">取消</button>
              <button onClick={save} disabled={saving} className="px-6 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50">
                {saving ? '儲存中…' : '儲存'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
