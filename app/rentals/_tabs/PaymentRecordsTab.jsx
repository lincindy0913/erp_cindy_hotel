'use client';

import { sortRows, SortableTh } from '@/components/SortableTh';

const fmt = n => Number(n || 0).toLocaleString('zh-TW');

const PAYMENT_METHODS = ['現金', 'transfer', '支票', '匯款'];
const isTransfer = (m) => m === 'transfer' || m === '轉帳';
const fmtPayMethod = (m) => isTransfer(m) ? '轉帳' : (m || '—');

export default function PaymentRecordsTab({
  paymentFilter, setPaymentFilter,
  paymentRecords, paymentRecordsPagination, paymentLoading,
  paymentSortKey, paymentSortDir, paymentToggleSort,
  editingPaymentId, setEditingPaymentId,
  editingPaymentForm, setEditingPaymentForm, editingPaymentSaving,
  fetchPaymentRecords, openPaymentEdit, savePaymentEdit, deletePaymentRecord,
  properties, accounts,
  confirm,
}) {
  return (
    <>
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <label htmlFor="f-23" className="text-sm text-gray-600">年份：</label>
        <input id="f-23" type="number" value={paymentFilter.year} onChange={e => setPaymentFilter(f => ({ ...f, year: e.target.value }))}
          className="border rounded px-2 py-1 w-24 text-sm" />
        <label htmlFor="f-24" className="text-sm text-gray-600">月份：</label>
        <select id="f-24" value={paymentFilter.month} onChange={e => setPaymentFilter(f => ({ ...f, month: e.target.value }))}
          className="border rounded px-2 py-1 text-sm">
          <option value="">全部月份</option>
          {Array.from({ length: 12 }, (_, i) => (
            <option key={i + 1} value={i + 1}>{i + 1} 月</option>
          ))}
        </select>
        <label htmlFor="f-25" className="text-sm text-gray-600">物業：</label>
        <select id="f-25" value={paymentFilter.propertyId} onChange={e => setPaymentFilter(f => ({ ...f, propertyId: e.target.value }))}
          className="border rounded px-2 py-1 text-sm">
          <option value="">全部物業</option>
          {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <label htmlFor="f-80" className="text-sm text-gray-600">收款帳戶：</label>
        <select id="f-80" value={paymentFilter.accountId} onChange={e => setPaymentFilter(f => ({ ...f, accountId: e.target.value }))}
          className="border rounded px-2 py-1 text-sm">
          <option value="">全部收款帳戶</option>
          {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <label htmlFor="f-81" className="text-sm text-gray-600">付款方式：</label>
        <select id="f-81" value={paymentFilter.paymentMethod} onChange={e => setPaymentFilter(f => ({ ...f, paymentMethod: e.target.value }))}
          className="border rounded px-2 py-1 text-sm">
          <option value="">全部</option>
          {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m === 'transfer' ? '轉帳' : m}</option>)}
        </select>
        <button onClick={() => fetchPaymentRecords(1)} disabled={paymentLoading}
          className="bg-teal-600 text-white px-3 py-1 rounded text-sm hover:bg-teal-700 disabled:opacity-50">查詢</button>
      </div>
      {paymentRecords.length > 0 && (
        <div className="flex gap-4 mb-3 text-sm">
          <span className="bg-teal-50 px-3 py-1.5 rounded-lg">共 <b>{paymentRecordsPagination.totalCount}</b> 筆</span>
          <span className="bg-green-50 px-3 py-1.5 rounded-lg text-green-800">
            合計實收 <b>NT$ {fmt(paymentRecords.reduce((s, p) => s + p.amount, 0))}</b>
            {paymentRecordsPagination.totalPages > 1 && <span className="text-gray-400 ml-1">（本頁）</span>}
          </span>
        </div>
      )}
      <div className="bg-white rounded-lg shadow tbl-wrap">
        <table className="w-full text-sm">
          <thead className="bg-teal-50 sticky top-0 z-10">
            <tr>
              <th className="text-center px-3 py-2 text-sm font-medium text-gray-700 whitespace-nowrap">序號</th>
              <SortableTh label="分類" colKey="category" sortKey={paymentSortKey} sortDir={paymentSortDir} onSort={paymentToggleSort} className="px-3 py-2" />
              <SortableTh label="收款日期" colKey="paymentDate" sortKey={paymentSortKey} sortDir={paymentSortDir} onSort={paymentToggleSort} className="px-3 py-2" />
              <SortableTh label="物業" colKey="propertyName" sortKey={paymentSortKey} sortDir={paymentSortDir} onSort={paymentToggleSort} className="px-3 py-2" />
              <SortableTh label="租客" colKey="tenantName" sortKey={paymentSortKey} sortDir={paymentSortDir} onSort={paymentToggleSort} className="px-3 py-2" />
              <SortableTh label="租期" colKey="incomeYear" sortKey={paymentSortKey} sortDir={paymentSortDir} onSort={paymentToggleSort} className="px-3 py-2" align="center" />
              <SortableTh label="應收金額" colKey="expectedAmount" sortKey={paymentSortKey} sortDir={paymentSortDir} onSort={paymentToggleSort} className="px-3 py-2" align="right" />
              <SortableTh label="實收金額" colKey="amount" sortKey={paymentSortKey} sortDir={paymentSortDir} onSort={paymentToggleSort} className="px-3 py-2 text-teal-800" align="right" />
              <th className="text-center px-3 py-2 text-sm font-medium text-gray-700 whitespace-nowrap">次序</th>
              <SortableTh label="付款方式" colKey="paymentMethod" sortKey={paymentSortKey} sortDir={paymentSortDir} onSort={paymentToggleSort} className="px-3 py-2" />
              <th className="text-left px-3 py-2 text-sm font-medium text-gray-700 whitespace-nowrap">收款帳戶</th>
              <th className="text-left px-3 py-2 text-sm font-medium text-gray-700 whitespace-nowrap">匯款人/備註</th>
              <th className="text-center px-3 py-2 text-sm font-medium text-gray-700 whitespace-nowrap">操作</th>
            </tr>
          </thead>
          <tbody>
            {paymentLoading ? (
              <tr><td colSpan={13} className="text-center py-8 text-gray-400">載入中…</td></tr>
            ) : paymentRecords.length === 0 ? (
              <tr><td colSpan={13} className="text-center py-8 text-gray-400">暫無付款紀錄</td></tr>
            ) : sortRows(paymentRecords, paymentSortKey, paymentSortDir, {
                expectedAmount: p => Number(p.expectedAmount || 0),
                amount: p => Number(p.amount || 0),
                incomeYear: p => p.incomeYear * 100 + (p.incomeMonth || 0),
              }).map((p, idx) => (
              <tr key={p.id} className={`border-t ${p.incomeIsLocked ? 'bg-amber-50 border-l-4 border-l-amber-400 hover:bg-amber-100' : `hover:bg-gray-50 ${idx % 2 === 0 ? '' : 'bg-gray-50/50'}`}`}>
                <td className="px-3 py-2 text-center text-xs text-gray-500">
                  <div className="flex flex-col items-center gap-0.5">
                    <span>{p.serialNo || '—'}</span>
                    {p.incomeIsLocked && (
                      <span title={`已鎖帳${p.incomeLockedBy ? `（${p.incomeLockedBy}）` : ''}`}
                        className="text-amber-500 leading-none">🔒</span>
                    )}
                  </div>
                </td>
                <td className="px-3 py-2">
                  {p.category ? (
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${p.category === '公司' ? 'bg-blue-50 text-blue-700' : p.category === '湯三姐' ? 'bg-orange-50 text-orange-700' : 'bg-gray-100 text-gray-600'}`}>
                      {p.category}
                    </span>
                  ) : '—'}
                </td>
                <td className="px-3 py-2 font-mono text-sm">{p.paymentDate}</td>
                <td className="px-3 py-2">{p.propertyName}</td>
                <td className="px-3 py-2">{p.tenantName}</td>
                <td className="px-3 py-2 text-center text-gray-500">{p.incomeYear}/{String(p.incomeMonth).padStart(2,'0')}</td>
                <td className="px-3 py-2 text-right text-gray-500">${fmt(p.expectedAmount)}</td>
                <td className="px-3 py-2 text-right font-semibold text-teal-700">${fmt(p.amount)}</td>
                <td className="px-3 py-2 text-center text-xs text-gray-500">第{p.sequenceNo}次</td>
                <td className="px-3 py-2 text-sm">
                  <span className={`px-2 py-0.5 rounded text-xs ${p.paymentMethod === '匯款' || isTransfer(p.paymentMethod) ? 'bg-blue-100 text-blue-800' : p.paymentMethod === '現金' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>
                    {fmtPayMethod(p.paymentMethod)}
                  </span>
                </td>
                <td className="px-3 py-2 text-xs text-gray-500" title={p.accountWarehouse || ''}>
                  {p.accountName || accounts.find(a => a.id === p.accountId)?.name || '—'}
                  {p.accountCode ? <span className="text-gray-400 ml-1">({p.accountCode})</span> : null}
                </td>
                <td className="px-3 py-2 text-xs text-gray-500 max-w-[160px] truncate" title={[p.matchBankAccountName, p.matchTransferRef, p.matchNote].filter(Boolean).join(' / ')}>
                  {[p.matchBankAccountName, p.matchNote].filter(Boolean).join(' / ') || '—'}
                </td>
                <td className="px-3 py-2 text-center whitespace-nowrap">
                  {p.incomeIsLocked ? (
                    <span title={`已鎖帳${p.incomeLockedBy ? `（${p.incomeLockedBy}）` : ''}`}
                      className="inline-flex items-center gap-1 text-xs text-amber-600 font-medium">
                      🔒 已鎖帳
                    </span>
                  ) : (
                    <>
                      <button onClick={() => openPaymentEdit(p)}
                        className="text-xs px-2 py-1 rounded bg-blue-50 text-blue-700 hover:bg-blue-100 mr-1">編輯</button>
                      <button onClick={() => confirm(
                        `確定刪除此收款紀錄？\n${p.propertyName} ${p.incomeYear}/${String(p.incomeMonth).padStart(2,'0')} 第${p.sequenceNo}次 $${fmt(p.amount)}`,
                        () => deletePaymentRecord(p.id), '刪除收款記錄', true
                      )}
                        className="text-xs px-2 py-1 rounded bg-red-50 text-red-700 hover:bg-red-100">刪除</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {paymentRecordsPagination.totalPages > 1 && (
        <div className="flex justify-center gap-2 mt-4">
          <button disabled={paymentRecordsPagination.page <= 1}
            onClick={() => fetchPaymentRecords(paymentRecordsPagination.page - 1)}
            className="px-3 py-1 text-sm border rounded disabled:opacity-40 hover:bg-gray-50">上一頁</button>
          <span className="px-3 py-1 text-sm text-gray-600">{paymentRecordsPagination.page} / {paymentRecordsPagination.totalPages}</span>
          <button disabled={paymentRecordsPagination.page >= paymentRecordsPagination.totalPages}
            onClick={() => fetchPaymentRecords(paymentRecordsPagination.page + 1)}
            className="px-3 py-1 text-sm border rounded disabled:opacity-40 hover:bg-gray-50">下一頁</button>
        </div>
      )}
    </div>

    {/* 付款記錄編輯 Modal */}
    {editingPaymentId !== null && (
      <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[60]"
        onClick={() => setEditingPaymentId(null)}>
        <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6" onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-800">編輯收款記錄</h3>
            <button onClick={() => setEditingPaymentId(null)} className="text-gray-400 hover:text-gray-600">✕</button>
          </div>
          <div className="space-y-3">
            <div>
              <label htmlFor="f-26" className="text-xs text-gray-600">實收金額 *</label>
              <input id="f-26" type="number" value={editingPaymentForm.amount}
                onChange={e => setEditingPaymentForm(f => ({ ...f, amount: e.target.value }))}
                className="w-full border rounded px-3 py-1.5 text-sm mt-0.5" />
            </div>
            <div>
              <label htmlFor="f-27" className="text-xs text-gray-600">收款日期 *</label>
              <input id="f-27" type="date" value={editingPaymentForm.paymentDate}
                onChange={e => setEditingPaymentForm(f => ({ ...f, paymentDate: e.target.value }))}
                className="w-full border rounded px-3 py-1.5 text-sm mt-0.5" />
            </div>
            <div>
              <label htmlFor="f-28" className="text-xs text-gray-600">收款帳戶 *</label>
              <select id="f-28" value={editingPaymentForm.accountId}
                onChange={e => {
                  const acct = accounts.find(a => String(a.id) === e.target.value);
                  const autoMethod = acct?.type === '現金' ? '現金' : acct?.type === '銀行存款' ? '匯款' : null;
                  setEditingPaymentForm(f => ({ ...f, accountId: e.target.value, ...(autoMethod ? { paymentMethod: autoMethod } : {}) }));
                }}
                className="w-full border rounded px-3 py-1.5 text-sm mt-0.5">
                <option value="">-- 選擇帳戶 --</option>
                {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="f-82" className="text-xs text-gray-600">付款方式</label>
              <select id="f-82" value={editingPaymentForm.paymentMethod}
                onChange={e => setEditingPaymentForm(f => ({ ...f, paymentMethod: e.target.value }))}
                className="w-full border rounded px-3 py-1.5 text-sm mt-0.5">
                {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m === 'transfer' ? '轉帳' : m}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="f-83" className="text-xs text-gray-600">備註</label>
              <input id="f-83" type="text" value={editingPaymentForm.matchNote}
                onChange={e => setEditingPaymentForm(f => ({ ...f, matchNote: e.target.value }))}
                className="w-full border rounded px-3 py-1.5 text-sm mt-0.5" placeholder="匯款備註…" />
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-5">
            <button onClick={() => setEditingPaymentId(null)}
              className="px-4 py-2 text-sm bg-gray-100 rounded-lg hover:bg-gray-200">取消</button>
            <button onClick={savePaymentEdit} disabled={editingPaymentSaving}
              className="px-4 py-2 text-sm bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50">
              {editingPaymentSaving ? '儲存中…' : '儲存'}
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
