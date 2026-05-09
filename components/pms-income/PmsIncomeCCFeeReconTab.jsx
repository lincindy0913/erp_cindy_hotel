'use client';
import { useState, useEffect, useCallback } from 'react';

function fmt(n) {
  if (n == null || Number(n) === 0) return '-';
  return Number(n).toLocaleString('zh-TW');
}
function fmtPct(n) {
  if (n == null) return '-';
  return (Number(n) * 100).toFixed(2) + '%';
}

export default function PmsIncomeCCFeeReconTab({ WAREHOUSES = [] }) {
  const [warehouse, setWarehouse] = useState(WAREHOUSES[0] || '');
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [rows, setRows] = useState([]);
  const [ccStatements, setCcStatements] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [feeRate, setFeeRate] = useState('0.02');
  const [settleDate, setSettleDate] = useState('');
  const [running, setRunning] = useState(false);
  const [msg, setMsg] = useState('');
  const [selectedStatement, setSelectedStatement] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setSelectedIds(new Set());
    setSelectedStatement(null);
    try {
      const params = new URLSearchParams();
      if (warehouse) params.set('warehouse', warehouse);
      if (month) params.set('month', month);
      const res = await fetch(`/api/pms-income/cc-fee-recon?${params}`);
      if (res.ok) {
        const json = await res.json();
        setRows(json.reservations || []);
        setCcStatements(json.ccStatements || []);
        // Auto-select first CC statement
        if (json.ccStatements?.length > 0) {
          setSelectedStatement(json.ccStatements[0]);
          // Auto-calculate fee rate from statement
          const stmt = json.ccStatements[0];
          if (stmt.totalAmount > 0 && stmt.totalFee > 0) {
            const rate = stmt.totalFee / stmt.totalAmount;
            setFeeRate(rate.toFixed(4));
          }
        }
      }
    } finally {
      setLoading(false);
    }
  }, [warehouse, month]);

  useEffect(() => { load(); }, [load]);

  const toggleAll = () => {
    setSelectedIds(selectedIds.size === rows.length ? new Set() : new Set(rows.map(r => r.id)));
  };
  const toggle = (id) => {
    const next = new Set(selectedIds);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelectedIds(next);
  };

  const totalCC = rows.reduce((s, r) => s + r.creditCard, 0);
  const totalFee = rows.reduce((s, r) => s + (r.ccFeeAmount || 0), 0);
  const reconCount = rows.filter(r => r.creditCardStatus === '已核對').length;

  // Three-way comparison values
  const stmt = selectedStatement;
  const stmtGross = stmt?.totalAmount || 0;
  const stmtFee   = stmt?.totalFee || 0;
  const stmtNet   = stmt?.netAmount || 0;
  const pmsDiff   = totalCC - stmtGross;
  const derivedRate = stmtGross > 0 ? stmtFee / stmtGross : 0;

  async function runRecon() {
    if (selectedIds.size === 0) { setMsg('請勾選要核對的訂單'); return; }
    const rate = parseFloat(feeRate);
    if (isNaN(rate) || rate <= 0 || rate > 0.1) { setMsg('手續費率請輸入合理值（例如 0.02 表示 2%）'); return; }
    if (!settleDate) { setMsg('請選擇結帳日期'); return; }
    setRunning(true);
    setMsg('');
    try {
      const res = await fetch('/api/pms-income/cc-fee-recon', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          warehouse,
          date: settleDate,
          feeRate: rate,
          reservationIds: [...selectedIds],
        }),
      });
      const json = await res.json();
      if (res.ok) {
        setMsg(`完成核對 ${json.count} 筆`);
        load();
      } else {
        setMsg(json.error?.message || '核對失敗');
      }
    } catch { setMsg('網路錯誤'); }
    finally { setRunning(false); }
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs text-gray-500 mb-1">館別</label>
          <select className="border rounded px-2 py-1 text-sm" value={warehouse} onChange={e => setWarehouse(e.target.value)}>
            {WAREHOUSES.map(w => <option key={w} value={w}>{w}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">月份</label>
          <input type="month" className="border rounded px-2 py-1 text-sm" value={month} onChange={e => setMonth(e.target.value)} />
        </div>
        <button onClick={load} className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700">重新整理</button>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white border rounded-lg p-3">
          <div className="text-xs text-gray-500">PMS 信用卡收入合計</div>
          <div className="text-lg font-semibold">{totalCC.toLocaleString('zh-TW')}</div>
        </div>
        <div className="bg-white border rounded-lg p-3">
          <div className="text-xs text-gray-500">已提列手續費</div>
          <div className="text-lg font-semibold text-red-600">{totalFee.toLocaleString('zh-TW')}</div>
        </div>
        <div className="bg-white border rounded-lg p-3">
          <div className="text-xs text-gray-500">已核對筆數</div>
          <div className="text-lg font-semibold text-green-600">{reconCount} / {rows.length}</div>
        </div>
      </div>

      {/* CreditCardStatement 三方比對 */}
      {ccStatements.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 space-y-3">
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-sm font-semibold text-amber-800">信用卡對帳單比對</span>
            {ccStatements.length > 1 && (
              <select className="border rounded px-2 py-1 text-xs bg-white"
                value={selectedStatement?.id || ''}
                onChange={e => {
                  const s = ccStatements.find(s => s.id === parseInt(e.target.value));
                  setSelectedStatement(s || null);
                  if (s && s.totalAmount > 0 && s.totalFee > 0) {
                    setFeeRate((s.totalFee / s.totalAmount).toFixed(4));
                  }
                }}>
                {ccStatements.map(s => (
                  <option key={s.id} value={s.id}>{s.billingDate} {s.bankName}</option>
                ))}
              </select>
            )}
          </div>
          {stmt && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <CompareCard
                label="PMS 信用卡（訂房）"
                value={totalCC}
                sub={`${rows.length} 筆`}
                color="text-blue-700"
              />
              <CompareCard
                label="對帳單 請款金額"
                value={stmtGross}
                sub={`${stmt.totalCount} 筆 · ${stmt.bankName}`}
                color="text-teal-700"
                diff={pmsDiff !== 0 ? pmsDiff : null}
              />
              <CompareCard
                label="手續費（對帳單）"
                value={stmtFee}
                sub={`費率 ${(derivedRate * 100).toFixed(2)}%`}
                color="text-red-600"
              />
              <CompareCard
                label="銀行撥款淨額"
                value={stmtNet}
                sub={stmt.paymentDate ? `撥款日 ${stmt.paymentDate}` : ''}
                color="text-green-700"
              />
            </div>
          )}
          {stmt && Math.abs(pmsDiff) > 1 && (
            <div className="text-xs text-amber-800 bg-amber-100 rounded px-3 py-2">
              ⚠ PMS 信用卡合計（{totalCC.toLocaleString('zh-TW')}）與對帳單請款金額（{stmtGross.toLocaleString('zh-TW')}）差異 {pmsDiff > 0 ? '+' : ''}{pmsDiff.toLocaleString('zh-TW')}，請確認是否有未歸入的訂單。
            </div>
          )}
          {stmt && Math.abs(pmsDiff) <= 1 && (
            <div className="text-xs text-green-700 bg-green-50 rounded px-3 py-2">
              ✓ PMS 與對帳單金額吻合。費率已自動帶入：{feeRate}（{(parseFloat(feeRate) * 100).toFixed(2)}%）
            </div>
          )}
        </div>
      )}

      {/* Batch recon panel */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs text-gray-600 mb-1">手續費率（小數）</label>
          <div className="flex items-center gap-1">
            <input type="number" step="0.0001" min="0" max="0.1" className="border rounded px-2 py-1 text-sm w-24"
              value={feeRate} onChange={e => setFeeRate(e.target.value)} placeholder="0.02" />
            <span className="text-xs text-gray-500">= {(parseFloat(feeRate || 0) * 100).toFixed(2)}%</span>
          </div>
        </div>
        <div>
          <label className="block text-xs text-gray-600 mb-1">結帳日期</label>
          <input type="date" className="border rounded px-2 py-1 text-sm" value={settleDate} onChange={e => setSettleDate(e.target.value)} />
        </div>
        <div className="text-xs text-gray-500 self-end pb-1">已勾選 {selectedIds.size} 筆</div>
        <button
          onClick={runRecon}
          disabled={running || selectedIds.size === 0}
          className="px-4 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {running ? '核對中...' : '批次核對信用卡手續費'}
        </button>
        {msg && <span className={`text-sm ${msg.startsWith('完成') ? 'text-green-600' : 'text-red-600'}`}>{msg}</span>}
      </div>

      {loading ? (
        <div className="text-center py-8 text-gray-400">載入中...</div>
      ) : rows.length === 0 ? (
        <div className="text-center py-8 text-gray-400">本月無信用卡收入記錄</div>
      ) : (
        <div className="overflow-x-auto border rounded-lg">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600 text-xs">
              <tr>
                <th className="px-3 py-2">
                  <input type="checkbox" checked={selectedIds.size === rows.length && rows.length > 0} onChange={toggleAll} />
                </th>
                <th className="px-3 py-2 text-left">日期</th>
                <th className="px-3 py-2 text-left">住客</th>
                <th className="px-3 py-2 text-left">房號</th>
                <th className="px-3 py-2 text-right">信用卡</th>
                <th className="px-3 py-2 text-right">費率</th>
                <th className="px-3 py-2 text-right">手續費</th>
                <th className="px-3 py-2 text-right">淨額</th>
                <th className="px-3 py-2 text-center">狀態</th>
                <th className="px-3 py-2 text-left">結帳日</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map(r => (
                <tr key={r.id} className={`hover:bg-gray-50 ${selectedIds.has(r.id) ? 'bg-blue-50' : ''}`}>
                  <td className="px-3 py-2 text-center">
                    <input type="checkbox" checked={selectedIds.has(r.id)} onChange={() => toggle(r.id)} />
                  </td>
                  <td className="px-3 py-2">{r.businessDate}</td>
                  <td className="px-3 py-2">{r.guestName || '-'}</td>
                  <td className="px-3 py-2 text-gray-500">{r.roomNo || '-'}</td>
                  <td className="px-3 py-2 text-right font-medium">{fmt(r.creditCard)}</td>
                  <td className="px-3 py-2 text-right text-gray-500">{fmtPct(r.ccFeeRate)}</td>
                  <td className="px-3 py-2 text-right text-red-600">{fmt(r.ccFeeAmount)}</td>
                  <td className="px-3 py-2 text-right">{fmt(r.ccNetAmount)}</td>
                  <td className="px-3 py-2 text-center">
                    <span className={`px-1.5 py-0.5 rounded text-xs ${r.creditCardStatus === '已核對' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                      {r.creditCardStatus}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-gray-500 text-xs">{r.ccSettleDate || '-'}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-gray-50 text-xs font-semibold">
              <tr>
                <td colSpan={4} className="px-3 py-2 text-gray-600">合計</td>
                <td className="px-3 py-2 text-right">{totalCC.toLocaleString('zh-TW')}</td>
                <td />
                <td className="px-3 py-2 text-right text-red-600">{totalFee > 0 ? totalFee.toLocaleString('zh-TW') : '-'}</td>
                <td colSpan={3} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

function CompareCard({ label, value, sub, color, diff }) {
  return (
    <div className="bg-white rounded-lg border p-3">
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <div className={`text-base font-bold ${color}`}>{Number(value).toLocaleString('zh-TW')}</div>
      {sub && <div className="text-xs text-gray-400 mt-0.5">{sub}</div>}
      {diff != null && (
        <div className={`text-xs mt-1 font-medium ${Math.abs(diff) > 1 ? 'text-red-600' : 'text-green-600'}`}>
          差異：{diff > 0 ? '+' : ''}{diff.toLocaleString('zh-TW')}
        </div>
      )}
    </div>
  );
}
