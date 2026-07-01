'use client';

import { useState } from 'react';

const fmt = n => Number(n || 0).toLocaleString('zh-TW');
const MONTHS = [1,2,3,4,5,6,7,8,9,10,11,12];

export default function UtilityIncomeTab({
  utilityFilter, setUtilityFilter,
  utilityList,
  showBulkUtility, setShowBulkUtility,
  bulkUtilityYear, setBulkUtilityYear,
  bulkUtilityMonth, setBulkUtilityMonth,
  bulkUtilityEntries, setBulkUtilityEntries,
  bulkUtilitySaving,
  showUtilityModal, setShowUtilityModal,
  utilityForm, setUtilityForm,
  editingUtility, setEditingUtility,
  utilitySaving,
  fetchUtilityList, saveUtility, deleteUtility, saveBulkUtility,
  openBulkUtility,
  properties, accounts,
}) {
  // 全年檢視（月份選「全年」= 空值）：把整年資料樞紐成 12月×物業
  const isAnnual = !utilityFilter.month;
  const [annualMode, setAnnualMode] = useState('actual');  // actual=實收 / expected=應收
  const defaultMonth = utilityFilter.month || (new Date().getMonth() + 1);

  const pivot = (() => {
    if (!isAnnual) return null;
    const map = new Map();
    for (const u of utilityList) {
      if (!map.has(u.propertyId)) {
        map.set(u.propertyId, { label: u.propertyName, sortOrder: u.sortOrder ?? 999999, m: {}, total: 0 });
      }
      const row = map.get(u.propertyId);
      const amt = annualMode === 'actual' ? Number(u.actualAmount || 0) : Number(u.expectedAmount || 0);
      row.m[u.incomeMonth] = (row.m[u.incomeMonth] || 0) + amt;
      row.total += amt;
    }
    const rows = [...map.values()].sort((a, b) => (a.sortOrder - b.sortOrder) || String(a.label).localeCompare(String(b.label), 'zh-Hant'));
    const colTotals = MONTHS.map(mo => rows.reduce((s, r) => s + (r.m[mo] || 0), 0));
    const grand = colTotals.reduce((a, b) => a + b, 0);
    return { rows, colTotals, grand };
  })();

  return (
    <div>
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <label htmlFor="f-15" className="text-sm text-gray-600">年月：</label>
        <select id="f-15" value={utilityFilter.year} onChange={e => setUtilityFilter(f => ({ ...f, year: Number(e.target.value) }))} className="border rounded px-2 py-1.5 text-sm">
          {[new Date().getFullYear(), new Date().getFullYear() - 1].map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <span className="text-sm">年</span>
        <select value={utilityFilter.month} onChange={e => setUtilityFilter(f => ({ ...f, month: e.target.value === '' ? '' : Number(e.target.value) }))} className="border rounded px-2 py-1.5 text-sm">
          <option value="">全年</option>
          {[1,2,3,4,5,6,7,8,9,10,11,12].map(m => <option key={m} value={m}>{m}月</option>)}
        </select>
        <button onClick={fetchUtilityList} className="bg-teal-600 text-white px-3 py-1.5 rounded text-sm hover:bg-teal-700">查詢</button>
        {isAnnual && (
          <div className="flex items-center gap-1 border rounded-lg overflow-hidden text-sm">
            {[['actual', '實收'], ['expected', '應收']].map(([v, l]) => (
              <button key={v} type="button" onClick={() => setAnnualMode(v)}
                className={`px-3 py-1.5 font-medium ${annualMode === v ? 'bg-teal-500 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}>
                {l}
              </button>
            ))}
          </div>
        )}
        <button onClick={() => { setBulkUtilityYear(utilityFilter.year); setBulkUtilityMonth(defaultMonth); openBulkUtility(); }}
          className="bg-teal-600 text-white px-3 py-1.5 rounded text-sm hover:bg-teal-700 ml-auto">
          批次輸入電費
        </button>
        <button onClick={() => { setEditingUtility(null); setUtilityForm({ propertyId: '', incomeYear: utilityFilter.year, incomeMonth: defaultMonth, expectedAmount: '', actualAmount: '', actualDate: '', accountId: '', note: '' }); setShowUtilityModal(true); }}
          className="bg-blue-600 text-white px-3 py-1.5 rounded text-sm hover:bg-blue-700">
          單筆登記
        </button>
      </div>
      {isAnnual ? (
        <p className="text-sm text-gray-600 mb-2">
          💧⚡ {utilityFilter.year} 年 水電收入年度總表（{annualMode === 'actual' ? '實收' : '應收'}）
          　共 <strong>{pivot?.rows.length || 0}</strong> 戶
          <span className="text-gray-400 ml-1">— 每格為該月該戶金額</span>
        </p>
      ) : (
        <p className="text-sm text-gray-600 mb-2">物業每月向租客收取之水電等費用，在此登記為收入。</p>
      )}

      {/* 全年樞紐表（12月 × 物業）*/}
      {isAnnual && (
        <div className="bg-white rounded-lg shadow overflow-auto">
          {(!pivot || pivot.rows.length === 0) ? (
            <div className="py-12 text-center text-gray-400">{utilityFilter.year} 年暫無水電收入資料</div>
          ) : (
            <table className="w-full text-sm border-collapse">
              <thead className="sticky top-0 z-10">
                <tr className="text-white">
                  <th className="px-3 py-2 text-left font-medium sticky left-0 z-20 bg-teal-600 min-w-[180px]">資產編號 · 物業</th>
                  {MONTHS.map(mo => (
                    <th key={mo} className="px-2 py-2 text-right font-medium whitespace-nowrap bg-teal-600 min-w-[56px]">{mo}月</th>
                  ))}
                  <th className="px-3 py-2 text-right font-medium bg-teal-700 min-w-[80px] whitespace-nowrap">全年合計</th>
                </tr>
              </thead>
              <tbody>
                {pivot.rows.map((r, i) => (
                  <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                    <td className="px-3 py-1.5 text-gray-700 whitespace-nowrap sticky left-0 z-10 bg-inherit border-r border-gray-100">
                      <span className="text-gray-400 font-mono mr-2">{r.sortOrder === 999999 ? '—' : r.sortOrder}</span>{r.label}
                    </td>
                    {MONTHS.map(mo => (
                      <td key={mo} className="px-2 py-1.5 text-right tabular-nums text-gray-700">{r.m[mo] ? fmt(r.m[mo]) : ''}</td>
                    ))}
                    <td className="px-3 py-1.5 text-right font-semibold tabular-nums text-teal-800 border-l border-gray-100 bg-teal-50/50">{r.total ? fmt(r.total) : '—'}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="font-bold border-t-2 border-teal-300">
                  <td className="px-3 py-2 sticky left-0 z-10 bg-teal-50">每月小計</td>
                  {pivot.colTotals.map((t, i) => (
                    <td key={i} className="px-2 py-2 text-right tabular-nums bg-teal-50">{t ? fmt(t) : ''}</td>
                  ))}
                  <td className="px-3 py-2 text-right tabular-nums bg-teal-100 text-teal-900 border-l border-teal-200">{fmt(pivot.grand)}</td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      )}

      {/* 逐月明細（選特定月份時）*/}
      {!isAnnual && (
      <div className="bg-white rounded-lg shadow tbl-wrap">
        <table className="w-full text-sm">
          <thead className="bg-teal-50 sticky top-0 z-10">
            <tr>
              <th className="text-center px-3 py-2">序號</th>
              <th className="text-center px-3 py-2">資產編號</th>
              <th className="text-left px-3 py-2">物業</th>
              <th className="text-center px-3 py-2">年月</th>
              <th className="text-right px-3 py-2">應收</th>
              <th className="text-right px-3 py-2">實收</th>
              <th className="text-center px-3 py-2">狀態</th>
              <th className="text-center px-3 py-2">操作</th>
            </tr>
          </thead>
          <tbody>
            {utilityList.length === 0 ? (
              <tr><td colSpan={8} className="text-center py-8 text-gray-400">暫無資料</td></tr>
            ) : utilityList.map((u, idx) => (
              <tr key={u.id} className="border-t hover:bg-gray-50">
                <td className="px-3 py-2 text-center text-xs text-gray-500">{idx + 1}</td>
                <td className="px-3 py-2 text-center text-xs text-gray-700 font-mono">{u.sortOrder ?? '—'}</td>
                <td className="px-3 py-2">{u.propertyName}</td>
                <td className="px-3 py-2 text-center">{u.incomeYear}/{u.incomeMonth}</td>
                <td className="px-3 py-2 text-right">${fmt(u.expectedAmount)}</td>
                <td className="px-3 py-2 text-right">{u.actualAmount != null ? `$${fmt(u.actualAmount)}` : '-'}</td>
                <td className="px-3 py-2 text-center">
                  <span className={`text-xs px-2 py-0.5 rounded ${u.status === 'completed' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                    {u.status === 'completed' ? '已收' : '待收'}
                  </span>
                </td>
                <td className="px-3 py-2 text-center">
                  <button onClick={() => deleteUtility(u.id)} className="text-red-600 hover:text-red-800 text-xs">刪除</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      )}

      {/* 批次輸入電費 panel */}
      {showBulkUtility && (
        <div className="mt-4 bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-semibold text-blue-800">批次輸入電費應收</h4>
            <div className="flex items-center gap-2">
              <select value={bulkUtilityYear} onChange={e => setBulkUtilityYear(Number(e.target.value))} className="border rounded px-2 py-1 text-sm">
                {[new Date().getFullYear(), new Date().getFullYear() - 1].map(y => <option key={y} value={y}>{y}</option>)}
              </select>
              <span className="text-sm text-blue-700">年</span>
              <select value={bulkUtilityMonth} onChange={e => setBulkUtilityMonth(Number(e.target.value))} className="border rounded px-2 py-1 text-sm">
                {[1,2,3,4,5,6,7,8,9,10,11,12].map(m => <option key={m} value={m}>{m}月</option>)}
              </select>
              <button onClick={openBulkUtility} className="text-xs text-blue-600 underline">重新載入</button>
            </div>
          </div>
          {bulkUtilityEntries.length === 0 ? (
            <p className="text-sm text-gray-500 py-4">無需收電費的物業。請在「物業管理」中勾選「需向租客收取水電費」。</p>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 mb-3">
                {bulkUtilityEntries.map((entry, idx) => (
                  <div key={entry.propertyId} className="flex items-center gap-2 bg-white border rounded px-2 py-1.5">
                    <span className="text-sm text-gray-700 flex-1 truncate">{entry.propertyName}</span>
                    <span className="text-xs text-gray-400">$</span>
                    <input
                      type="number" min="0" step="1"
                      value={entry.expectedAmount}
                      onChange={e => setBulkUtilityEntries(prev => prev.map((en, i) => i === idx ? { ...en, expectedAmount: e.target.value } : en))}
                      className="w-24 border rounded px-2 py-0.5 text-sm text-right"
                      placeholder="金額"
                    />
                  </div>
                ))}
              </div>
              <p className="text-xs text-blue-500 mb-3">留空的物業不儲存；已有紀錄的會更新應收金額。</p>
              <div className="flex gap-2">
                <button onClick={saveBulkUtility} disabled={bulkUtilitySaving}
                  className="bg-blue-600 text-white px-4 py-1.5 rounded text-sm hover:bg-blue-700 disabled:opacity-50">
                  {bulkUtilitySaving ? '儲存中…' : '儲存全部'}
                </button>
                <button onClick={() => setShowBulkUtility(false)} className="bg-gray-300 text-gray-700 px-4 py-1.5 rounded text-sm hover:bg-gray-400">取消</button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Modal: 水電收入 */}
      {showUtilityModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowUtilityModal(false)}>
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
            <div className="p-6">
              <h3 className="text-lg font-bold text-gray-800 mb-4">登記水電收入</h3>
              <div className="space-y-3">
                <div>
                  <label htmlFor="f-16" className="text-sm text-gray-600">物業 *</label>
                  <select id="f-16" value={utilityForm.propertyId} onChange={e => setUtilityForm(f => ({ ...f, propertyId: e.target.value }))}
                    className="w-full border rounded px-3 py-2 text-sm">
                    <option value="">選擇物業</option>
                    {properties.map(p => <option key={p.id} value={p.id}>{p.name}{p.collectUtilityFee ? '' : ' ⚠'}</option>)}
                  </select>
                  {utilityForm.propertyId && !properties.find(p => String(p.id) === String(utilityForm.propertyId))?.collectUtilityFee && (
                    <p className="text-xs text-amber-600 mt-1">⚠ 此物業未啟用「代收水電費」，請確認是否要登記</p>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label htmlFor="f-71" className="text-sm text-gray-600">年份</label>
                    <input id="f-71" type="number" value={utilityForm.incomeYear} onChange={e => setUtilityForm(f => ({ ...f, incomeYear: e.target.value }))} className="w-full border rounded px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label htmlFor="f-72" className="text-sm text-gray-600">月份</label>
                    <select id="f-72" value={utilityForm.incomeMonth} onChange={e => setUtilityForm(f => ({ ...f, incomeMonth: Number(e.target.value) }))} className="w-full border rounded px-3 py-2 text-sm">
                      {[1,2,3,4,5,6,7,8,9,10,11,12].map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label htmlFor="f-73" className="text-sm text-gray-600">應收金額</label>
                  <input id="f-73" type="number" min="0" step="0.01" value={utilityForm.expectedAmount} onChange={e => setUtilityForm(f => ({ ...f, expectedAmount: e.target.value }))} className="w-full border rounded px-3 py-2 text-sm" />
                </div>
                <div>
                  <label htmlFor="f-74" className="text-sm text-gray-600">實收金額（已收再填）</label>
                  <input id="f-74" type="number" min="0" step="0.01" value={utilityForm.actualAmount} onChange={e => setUtilityForm(f => ({ ...f, actualAmount: e.target.value }))} className="w-full border rounded px-3 py-2 text-sm" />
                </div>
                <div>
                  <label htmlFor="f-75" className="text-sm text-gray-600">收款日期</label>
                  <input id="f-75" type="date" value={utilityForm.actualDate} onChange={e => setUtilityForm(f => ({ ...f, actualDate: e.target.value }))} className="w-full border rounded px-3 py-2 text-sm" />
                </div>
                <div>
                  <label htmlFor="f-17" className="text-sm text-gray-600">收款帳戶</label>
                  <select id="f-17" value={utilityForm.accountId} onChange={e => setUtilityForm(f => ({ ...f, accountId: e.target.value }))} className="w-full border rounded px-3 py-2 text-sm">
                    <option value="">-- 選擇帳戶 --</option>
                    {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="f-76" className="text-sm text-gray-600">備註</label>
                  <input id="f-76" type="text" value={utilityForm.note} onChange={e => setUtilityForm(f => ({ ...f, note: e.target.value }))} className="w-full border rounded px-3 py-2 text-sm" />
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-6">
                <button onClick={() => setShowUtilityModal(false)} className="px-4 py-2 text-sm bg-gray-200 rounded hover:bg-gray-300">取消</button>
                <button onClick={saveUtility} disabled={utilitySaving} className="px-4 py-2 text-sm bg-teal-600 text-white rounded hover:bg-teal-700 disabled:opacity-50">{utilitySaving ? '儲存中…' : '儲存'}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
