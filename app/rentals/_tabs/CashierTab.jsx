'use client';

import React from 'react';
import { todayStr } from '@/lib/localDate';
import { sortRows, SortableTh } from '@/components/SortableTh';
import { INCOME_STATUSES } from '../_lib/rentalHelpers';
import StatusBadge from '../_components/StatusBadge';

const fmt = n => Number(n || 0).toLocaleString('zh-TW');

const PAYMENT_METHODS = ['現金', 'transfer', '支票', '匯款'];
const isTransfer = (m) => m === 'transfer' || m === '轉帳';
const fmtPayMethod = (m) => isTransfer(m) ? '轉帳' : (m || '—');

export default function CashierTab({
  incomes, incomesHasMore, cashierUtilityMap,
  yearLocks,
  rentIncKey, rentIncDir, rentIncToggle,
  incomeFilter, setIncomeFilter, sortedIncomes,
  payingIncomeId, setPayingIncomeId,
  incomeFormMode,
  incomePayForm, setIncomePayForm,
  incomeUtilityForm, setIncomeUtilityForm,
  incomePaymentSaving,
  editingPaymentId, setEditingPaymentId,
  editingPaymentForm, setEditingPaymentForm, editingPaymentSaving,
  selectedIncomeIds, setSelectedIncomeIds,
  showBatchPay, setShowBatchPay,
  batchPayForm, setBatchPayForm,
  batchSaving, batchProgress, batchAbortRef, batchLockSaving,
  fetchIncomes, confirmIncomePayment, voidIncomePayment,
  exportIncomeCSV, generateMonthlyIncome, printIncomes,
  openIncomePayment, openPaymentEdit, savePaymentEdit, deletePaymentRecord, toggleIncomeLock,
  batchConfirmIncomes, batchLockIncomes,
  contracts, setReminderOpen, setReminderThreshold,
  accounts,
  CONTRACT_INCOME_CATEGORIES,
  propInlineEdit, setPropInlineEdit, savePropField, propInlineSaving,
  confirm, showToast,
  switchTab,
}) {
  return (
    <div>
      {/* #7 效能：1200 筆上限提示，加快速篩選本月按鈕 */}
      {incomesHasMore && (
        <div className="flex items-center justify-between text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">
          <span>目前顯示最近 1,200 筆，請縮小篩選範圍</span>
          <button
            type="button"
            onClick={() => {
              const n = new Date();
              const newF = { ...incomeFilter, year: n.getFullYear(), month: n.getMonth() + 1 };
              setIncomeFilter(newF);
              fetchIncomes(newF);
            }}
            className="ml-3 px-2 py-0.5 rounded bg-amber-200 hover:bg-amber-300 whitespace-nowrap">
            篩選本月
          </button>
        </div>
      )}
      {/* #3 年度鎖帳 UI：當前篩選年份已鎖 → 提前告知 */}
      {Array.isArray(yearLocks) && yearLocks.some(l => l.year === Number(incomeFilter.year)) && (
        <div className="flex items-center gap-2 text-sm text-orange-800 bg-orange-50 border border-orange-300 rounded-lg px-4 py-2 mb-3">
          <span>🔒</span>
          <span>{incomeFilter.year} 年已鎖帳，此年度的收款記錄無法新增或修改。如需解鎖請至「稅款管理」分頁。</span>
        </div>
      )}
      {/* 合約到期提醒橫幅 */}
      {(() => {
        const today = todayStr();
        const threshold = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
        const expiring30 = contracts
          .filter(c => c.status === 'active' && c.endDate >= today && c.endDate <= threshold)
          .sort((a, b) => a.endDate.localeCompare(b.endDate));
        if (expiring30.length === 0) return null;
        return (
          <div className="bg-orange-50 border border-orange-300 rounded-lg px-4 py-3 mb-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-base shrink-0">⚠️</span>
              <div className="min-w-0">
                <span className="text-orange-800 font-semibold text-sm">
                  {expiring30.length} 份合約將於 30 天內到期
                </span>
                <span className="text-orange-600 text-xs ml-2 truncate">
                  最近：{expiring30[0].propertyName}（{expiring30[0].endDate}）
                </span>
              </div>
            </div>
            <button
              onClick={() => { switchTab('contracts'); setReminderOpen(true); setReminderThreshold(30); }}
              className="shrink-0 text-xs text-orange-700 bg-orange-100 hover:bg-orange-200 border border-orange-300 px-3 py-1.5 rounded-lg font-medium whitespace-nowrap">
              查看到期合約 →
            </button>
          </div>
        );
      })()}

      {/* Cashier summary cards */}
      {incomes.length > 0 && (
        <div className="grid grid-cols-4 gap-3 mb-4">
          <div className="bg-white rounded-lg shadow-sm p-3 border-l-4 border-teal-500">
            <p className="text-xs text-gray-500">總應收</p>
            <p className="text-lg font-bold">${fmt(sortedIncomes.reduce((s, i) => s + Number(i.expectedAmount || 0), 0))}</p>
          </div>
          <div className="bg-white rounded-lg shadow-sm p-3 border-l-4 border-green-500">
            <p className="text-xs text-gray-500">已收</p>
            <p className="text-lg font-bold text-green-700">${fmt(sortedIncomes.filter(i => i.status === 'completed').reduce((s, i) => s + Number(i.actualAmount || 0), 0))}</p>
          </div>
          <div className="bg-white rounded-lg shadow-sm p-3 border-l-4 border-yellow-500">
            <p className="text-xs text-gray-500">待收</p>
            <p className="text-lg font-bold text-yellow-700">{sortedIncomes.filter(i => i.status === 'pending').length} 筆</p>
          </div>
          <div className="bg-white rounded-lg shadow-sm p-3 border-l-4 border-red-500">
            <p className="text-xs text-gray-500">逾期</p>
            <p className="text-lg font-bold text-red-600">{sortedIncomes.filter(i => i.status === 'pending' && i.dueDate < todayStr()).length} 筆</p>
          </div>
        </div>
      )}

      <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 mb-4">
        {/* 時間區域 */}
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <span className="text-xs font-semibold text-gray-500 w-16">時間區域</span>
          <label htmlFor="f-62" className="text-sm text-gray-600">年份:</label>
          <input id="f-62" type="number" value={incomeFilter.year} onChange={e => setIncomeFilter(f => ({ ...f, year: e.target.value }))}
            className="border rounded px-2 py-1 w-24 text-sm" />
          <label htmlFor="f-63" className="text-sm text-gray-600">月份:</label>
          <select id="f-63" value={incomeFilter.month} onChange={e => setIncomeFilter(f => ({ ...f, month: e.target.value }))}
            className="border rounded px-2 py-1 text-sm">
            <option value="">全部月份</option>
            {Array.from({ length: 12 }, (_, i) => (
              <option key={i + 1} value={i + 1}>{i + 1} 月</option>
            ))}
          </select>
          {/* 快速時間區段 */}
          {[
            { label: '本月', getF: () => { const n = new Date(); return { year: n.getFullYear(), month: n.getMonth() + 1 }; } },
            { label: '上月', getF: () => { const n = new Date(); n.setMonth(n.getMonth() - 1); return { year: n.getFullYear(), month: n.getMonth() + 1 }; } },
            { label: '全年', getF: () => ({ year: new Date().getFullYear(), month: '' }) },
          ].map(btn => (
            <button key={btn.label} type="button" onClick={() => {
              const patch = btn.getF();
              const newF = { ...incomeFilter, ...patch };
              setIncomeFilter(newF);
              fetchIncomes(newF);
            }}
              className="px-2 py-1 text-xs rounded border border-teal-300 text-teal-700 hover:bg-teal-50 bg-white">
              {btn.label}
            </button>
          ))}
        </div>
        {/* 即時搜尋 */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-gray-500 w-16">即時搜尋</span>
          <input
            type="text"
            value={incomeFilter.propertySearch}
            onChange={e => setIncomeFilter(f => ({ ...f, propertySearch: e.target.value }))}
            placeholder="物業名稱 / 租客姓名…"
            className="border rounded px-2 py-1 text-sm w-52"
          />
          {incomeFilter.propertySearch && (
            <button type="button" onClick={() => setIncomeFilter(f => ({ ...f, propertySearch: '' }))}
              className="text-xs text-gray-400 hover:text-gray-600">✕ 清除</button>
          )}
          <select value={incomeFilter.status} onChange={e => setIncomeFilter(f => ({ ...f, status: e.target.value }))}
            className="border rounded px-2 py-1 text-sm ml-4">
            <option value="">全部狀態</option>
            {INCOME_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          {/* #2 月結整合：未入帳篩選（已收款但無現金流記錄） */}
          <button
            type="button"
            onClick={() => setIncomeFilter(f => ({ ...f, unlinked: !f.unlinked }))}
            className={`px-3 py-1 text-xs rounded-full border transition-colors ${
              incomeFilter.unlinked
                ? 'bg-red-600 text-white border-red-600'
                : 'bg-white border-red-300 text-red-600 hover:bg-red-50'
            }`}
            title="篩選已收款但尚未連結現金流記錄的項目（月結前補登用）">
            未入帳
          </button>
          <button onClick={() => fetchIncomes()} className="bg-teal-600 text-white px-3 py-1 rounded text-sm hover:bg-teal-700">查詢</button>
          <button onClick={printIncomes} className="px-3 py-1 text-sm rounded border border-gray-300 hover:bg-gray-50">🖨️ 列印</button>
          <button onClick={generateMonthlyIncome} className="bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700">
            產生 {incomeFilter.year || new Date().getFullYear()}/{incomeFilter.month || (new Date().getMonth() + 1)} 月租金
          </button>
          <button
            onClick={() => {
              const unlocked = incomes.filter(i => !i.isLocked);
              if (unlocked.length === 0) return showToast('沒有可鎖帳的紀錄', 'error');
              setSelectedIncomeIds(new Set(unlocked.map(i => i.id)));
              confirm(`確定批次鎖帳 ${unlocked.length} 筆未鎖帳收租紀錄？鎖帳後無法編輯或刪除收款。`, batchLockIncomes, '批次鎖帳確認', false);
            }}
            disabled={batchLockSaving}
            className="bg-amber-600 text-white px-3 py-1 rounded text-sm hover:bg-amber-700 disabled:opacity-50">
            {batchLockSaving ? '鎖帳中…' : '🔒 批次鎖帳'}
          </button>
          <button onClick={exportIncomeCSV} className="bg-gray-600 text-white px-3 py-1 rounded text-sm hover:bg-gray-700">
            ↓ 匯出 CSV
          </button>
        </div>
        {/* 分類篩選 */}
        <div className="flex flex-wrap items-center gap-2 mt-2">
          <span className="text-xs font-semibold text-gray-500 w-16">分類篩選</span>
          {['', '公司', '湯三姐'].map(cat => (
            <button key={cat || 'all'} type="button"
              onClick={() => setIncomeFilter(f => ({ ...f, category: cat }))}
              className={`px-3 py-1 text-xs rounded-full border transition-colors ${
                incomeFilter.category === cat
                  ? 'bg-teal-600 text-white border-teal-600'
                  : 'bg-white border-gray-300 text-gray-600 hover:bg-teal-50'
              }`}>
              {cat === '' ? '全部' : cat}
            </button>
          ))}
        </div>
      </div>
      {selectedIncomeIds.size > 0 && (
        <div className="flex justify-end gap-2 mb-2">
          {Array.from(selectedIncomeIds).some(id => { const i = incomes.find(x => x.id === id); return i && (i.status === 'pending' || i.status === 'partial'); }) && (
            <button onClick={() => setShowBatchPay(true)} className="bg-green-600 text-white px-3 py-1 rounded text-sm hover:bg-green-700">
              批次確認 ({selectedIncomeIds.size} 筆)
            </button>
          )}
          <button
            onClick={() => confirm(`確定批次鎖帳 ${selectedIncomeIds.size} 筆收租紀錄？鎖帳後無法編輯或刪除收款。`, batchLockIncomes, '批次鎖帳確認', false)}
            disabled={batchLockSaving}
            className="bg-amber-600 text-white px-3 py-1 rounded text-sm hover:bg-amber-700 disabled:opacity-50">
            {batchLockSaving ? '鎖帳中…' : `🔒 批次鎖帳 (${selectedIncomeIds.size} 筆)`}
          </button>
          <button onClick={() => setSelectedIncomeIds(new Set())} className="text-xs text-gray-500 hover:text-gray-700 px-2">
            取消選取
          </button>
        </div>
      )}

      {/* 批次確認收款 panel */}
      {showBatchPay && (
        <div className="mb-4 bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-semibold text-green-800">批次確認收款 — {selectedIncomeIds.size} 筆（全額收款）</h4>
            <button onClick={() => setShowBatchPay(false)} className="text-gray-400 hover:text-gray-600 text-sm">✕</button>
          </div>
          <div className="grid grid-cols-3 gap-3 mb-3">
            <div>
              <label htmlFor="f" className="text-xs text-gray-600">收款日期</label>
              <input id="f" type="date" value={batchPayForm.actualDate} onChange={e => setBatchPayForm(f => ({ ...f, actualDate: e.target.value }))}
                className="w-full border rounded px-2 py-1 text-sm" />
            </div>
            <div>
              <label htmlFor="f-2" className="text-xs text-gray-600">收款帳戶 *</label>
              <select id="f-2" value={batchPayForm.accountId} onChange={e => {
                const acct = accounts.find(a => String(a.id) === e.target.value);
                const autoMethod = acct?.type === '現金' ? '現金' : acct?.type === '銀行存款' ? '匯款' : null;
                setBatchPayForm(f => ({ ...f, accountId: e.target.value, ...(autoMethod ? { paymentMethod: autoMethod } : {}) }));
              }} className="w-full border rounded px-2 py-1 text-sm">
                <option value="">-- 選擇帳戶 --</option>
                {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="f-64" className="text-xs text-gray-600">付款方式</label>
              <select id="f-64" value={batchPayForm.paymentMethod} onChange={e => setBatchPayForm(f => ({ ...f, paymentMethod: e.target.value }))}
                className="w-full border rounded px-2 py-1 text-sm">
                {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m === 'transfer' ? '轉帳' : m}</option>)}
              </select>
            </div>
          </div>
          <p className="text-xs text-gray-500 mb-3">※ 批次操作將以「應收金額」為實收，適用於全額收款的情境。</p>
          <div className="flex gap-2 items-center">
            <button onClick={batchConfirmIncomes} disabled={batchSaving}
              className="bg-green-600 text-white px-4 py-1.5 rounded text-sm hover:bg-green-700 disabled:opacity-50">
              {batchSaving && batchProgress ? `${batchProgress.done}/${batchProgress.total}` : batchSaving ? '處理中…' : '確認送出'}
            </button>
            {batchSaving && batchProgress
              ? <button onClick={() => { batchAbortRef.current = true; }} className="text-xs text-red-500 hover:underline">中止</button>
              : <button onClick={() => { setShowBatchPay(false); setSelectedIncomeIds(new Set()); }}
                  className="bg-gray-300 text-gray-700 px-4 py-1.5 rounded text-sm hover:bg-gray-400">取消</button>
            }
          </div>
          {batchSaving && batchProgress && (
            <div className="mt-2">
              <div className="flex justify-between text-xs text-gray-500 mb-1">
                <span>已完成 {batchProgress.done}/{batchProgress.total}{batchProgress.failed > 0 && <span className="text-red-500 ml-1.5">失敗 {batchProgress.failed}</span>}</span>
                <span>{Math.round(batchProgress.done / batchProgress.total * 100)}%</span>
              </div>
              <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                <div className="h-full bg-green-500 transition-all duration-200"
                  style={{ width: `${batchProgress.done / batchProgress.total * 100}%` }} />
              </div>
            </div>
          )}
        </div>
      )}

      {(() => {
        const hasAnyUtility = incomes.some(i => i.collectUtilityFee);
        const colSpan = hasAnyUtility ? 15 : 13;
        return (
      <div className="bg-white rounded-lg shadow tbl-wrap">
        <table className="w-full text-sm">
          <thead className="bg-teal-50 sticky top-0 z-10">
            <tr>
              <SortableTh label="序號" colKey="contractSortOrder" sortKey={rentIncKey} sortDir={rentIncDir} onSort={rentIncToggle} className="px-3 py-2 w-12" align="center" />
              <SortableTh label="資產編號" colKey="assetNo" sortKey={rentIncKey} sortDir={rentIncDir} onSort={rentIncToggle} className="px-3 py-2 w-12" align="center" />
              <th className="px-3 py-2 text-center w-8">
                <input type="checkbox"
                  title="全選未鎖帳"
                  checked={selectedIncomeIds.size > 0 && incomes.filter(i => !i.isLocked).every(i => selectedIncomeIds.has(i.id))}
                  onChange={e => {
                    const unlocked = incomes.filter(i => !i.isLocked);
                    setSelectedIncomeIds(e.target.checked ? new Set(unlocked.map(i => i.id)) : new Set());
                  }}
                />
              </th>
              <SortableTh label="分類" colKey="contractCategory" sortKey={rentIncKey} sortDir={rentIncDir} onSort={rentIncToggle} className="px-3 py-2 whitespace-nowrap" />
              <SortableTh label="物業" colKey="propertyName" sortKey={rentIncKey} sortDir={rentIncDir} onSort={rentIncToggle} className="px-3 py-2" />
              <SortableTh label="租客" colKey="tenantName" sortKey={rentIncKey} sortDir={rentIncDir} onSort={rentIncToggle} className="px-3 py-2" />
              <SortableTh label="租金應收" colKey="expectedAmount" sortKey={rentIncKey} sortDir={rentIncDir} onSort={rentIncToggle} className="px-3 py-2" align="right" />
              {hasAnyUtility && <th className="text-right px-3 py-2 text-sm font-medium text-blue-700">電費應收</th>}
              {hasAnyUtility && <th className="text-right px-3 py-2 text-sm font-medium text-gray-700">合計應收</th>}
              <SortableTh label="實收" colKey="actualAmount" sortKey={rentIncKey} sortDir={rentIncDir} onSort={rentIncToggle} className="px-3 py-2" align="right" />
              <SortableTh label="未收" colKey="remaining" sortKey={rentIncKey} sortDir={rentIncDir} onSort={rentIncToggle} className="px-3 py-2" align="right" />
              <SortableTh label="到期日" colKey="dueDate" sortKey={rentIncKey} sortDir={rentIncDir} onSort={rentIncToggle} className="px-3 py-2" />
              <SortableTh label="狀態" colKey="status" sortKey={rentIncKey} sortDir={rentIncDir} onSort={rentIncToggle} className="px-3 py-2" align="center" />
              <SortableTh label="付款紀錄" colKey="payCount" sortKey={rentIncKey} sortDir={rentIncDir} onSort={rentIncToggle} className="px-3 py-2" />
              <th className="text-center px-3 py-2 text-sm font-medium text-gray-700">操作</th>
            </tr>
          </thead>
          <tbody>
            {incomes.length === 0 ? (
              <tr><td colSpan={colSpan} className="text-center py-8 text-gray-400">暫無資料</td></tr>
            ) : sortedIncomes.map((income, idx) => {
              const isOverdue = income.status === 'pending' && income.dueDate < todayStr();
              const expected = Number(income.expectedAmount || 0);
              const actual = Number(income.actualAmount || 0);
              const remaining = expected - actual;
              const paymentList = (income.payments && income.payments.length > 0)
                ? income.payments.map((p, i) => ({ label: `第${i + 1}次`, amount: Number(p.amount), date: p.paymentDate }))
                : (income.actualAmount != null && income.actualAmount > 0 ? [{ label: '第1次', amount: Number(income.actualAmount), date: income.actualDate || '-' }] : []);
              const utilityRec = income.collectUtilityFee ? cashierUtilityMap[income.propertyId] : null;
              const utilityExpected = utilityRec ? Number(utilityRec.expectedAmount) : 0;
              const totalExpected = expected + utilityExpected;
              return (
                <tr key={income.id} className={`border-t ${isOverdue ? 'bg-orange-50 border-l-4 border-l-red-400 hover:bg-orange-100' : 'hover:bg-gray-50'}`}>
                  {/* 序號（正常流水號）*/}
                  <td className="px-3 py-2 text-center text-xs text-gray-500">{idx + 1}</td>
                  {/* 資產編號（點擊可編輯）*/}
                  <td className="px-3 py-2 text-center text-xs text-gray-700 font-mono">
                    {propInlineEdit?.propertyId === income.propertyId && propInlineEdit.field === 'sortOrder' ? (
                      <input autoFocus type="number" min="1" step="1"
                        value={propInlineEdit.value}
                        onChange={e => setPropInlineEdit(p => ({ ...p, value: e.target.value }))}
                        onBlur={() => savePropField(income.propertyId, 'sortOrder', propInlineEdit.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') savePropField(income.propertyId, 'sortOrder', propInlineEdit.value);
                          if (e.key === 'Escape') setPropInlineEdit(null);
                        }}
                        className="w-14 border border-indigo-400 rounded px-1 py-0.5 text-xs text-center outline-none ring-1 ring-indigo-400"
                      />
                    ) : (
                      <span onClick={() => setPropInlineEdit({ propertyId: income.propertyId, field: 'sortOrder', value: income.contractSortOrder ?? '' })}
                        className="cursor-pointer hover:text-indigo-600 hover:underline"
                        title="點擊編輯資產編號">
                        {income.contractSortOrder ?? '—'}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-center">
                    {!income.isLocked && (
                      <input type="checkbox"
                        checked={selectedIncomeIds.has(income.id)}
                        onChange={e => setSelectedIncomeIds(prev => {
                          const next = new Set(prev);
                          if (e.target.checked) next.add(income.id); else next.delete(income.id);
                          return next;
                        })}
                      />
                    )}
                  </td>
                  {/* 分類 */}
                  <td className="px-3 py-2 text-xs">
                    {propInlineEdit?.propertyId === income.propertyId && propInlineEdit.field === 'category' ? (
                      <select autoFocus
                        value={propInlineEdit.value || ''}
                        onChange={e => savePropField(income.propertyId, 'category', e.target.value)}
                        onBlur={() => setPropInlineEdit(null)}
                        onKeyDown={e => { if (e.key === 'Escape') setPropInlineEdit(null); }}
                        className="border border-indigo-400 rounded px-1 py-0.5 text-xs outline-none ring-1 ring-indigo-400">
                        <option value="">—</option>
                        {CONTRACT_INCOME_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    ) : (
                      <span onClick={() => setPropInlineEdit({ propertyId: income.propertyId, field: 'category', value: income.contractCategory || '' })}
                        className={`cursor-pointer hover:text-indigo-600 hover:underline px-1.5 py-0.5 rounded ${income.contractCategory ? 'bg-blue-50 text-blue-700' : 'text-gray-300'}`}
                        title="點擊編輯分類">
                        {income.contractCategory || '—'}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2">{income.propertyName}</td>
                  <td className="px-3 py-2">{income.tenantName}</td>
                  <td className="px-3 py-2 text-right font-medium">${fmt(income.expectedAmount)}</td>
                  {hasAnyUtility && (
                    <td className="px-3 py-2 text-right text-blue-700">
                      {income.collectUtilityFee
                        ? (utilityExpected > 0 ? `$${fmt(utilityExpected)}` : <span className="text-gray-400 text-xs">待填</span>)
                        : <span className="text-gray-300">—</span>}
                    </td>
                  )}
                  {hasAnyUtility && (
                    <td className="px-3 py-2 text-right font-semibold">
                      {income.collectUtilityFee ? `$${fmt(totalExpected)}` : `$${fmt(expected)}`}
                    </td>
                  )}
                  <td className="px-3 py-2 text-right">{income.actualAmount ? `$${fmt(income.actualAmount)}` : '-'}</td>
                  <td className="px-3 py-2 text-right font-medium">{remaining > 0 ? `$${fmt(remaining)}` : '-'}</td>
                  <td className="px-3 py-2">
                    {income.dueDate}
                    {isOverdue && (
                      <span className="ml-1 inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-bold bg-red-500 text-white">
                        逾期 {Math.ceil((new Date() - new Date(income.dueDate)) / 86400000)} 天
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-center">
                    <StatusBadge value={isOverdue ? 'overdue' : income.status} list={INCOME_STATUSES} />
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-600">
                    {paymentList.length === 0 ? '-' : (
                      <div className="space-y-0.5">
                        {paymentList.map((p, i) => (
                          <div key={i}><span className="font-medium">{p.label}</span> ${fmt(p.amount)} <span className="text-gray-400">({p.date})</span></div>
                        ))}
                        {remaining > 0 && <div className="text-red-500 font-medium">尚欠 ${fmt(remaining)}</div>}
                      </div>
                    )}
                    {/* #4 轉帳對帳：顯示已比對的轉帳參考號 */}
                    {income.matchTransferRef && (
                      <div className="mt-0.5">
                        <span className="inline-block px-1.5 py-0.5 rounded text-[10px] bg-violet-100 text-violet-700" title={`比對帳戶：${income.matchBankAccountName || '—'}`}>
                          ⇄ {income.matchTransferRef}
                        </span>
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-center whitespace-nowrap">
                    {income.isLocked ? (
                      <button
                        onClick={() => confirm(
                          `確定要解鎖此紀錄？\n${income.propertyName} ${income.incomeYear}/${String(income.incomeMonth).padStart(2,'0')}`,
                          () => toggleIncomeLock(income.id, true), '解鎖確認', false
                        )}
                        className="text-xs px-2 py-1 rounded bg-amber-100 text-amber-700 hover:bg-amber-200 font-medium"
                        title={income.lockedBy ? `由 ${income.lockedBy} 鎖帳` : '已鎖帳'}>
                        🔒 解鎖
                      </button>
                    ) : (
                      <>
                        {(income.status === 'pending' || income.status === 'partial') && (
                          <button onClick={() => openIncomePayment(income)}
                            className="text-teal-600 hover:text-teal-800 text-xs font-medium mr-1">
                            {paymentList.length > 0 ? `第${paymentList.length + 1}次收款` : '確認收款'}
                          </button>
                        )}
                        {(income.status === 'completed' || income.status === 'partial') && (
                          <button onClick={() => voidIncomePayment(income.id)} className="text-red-600 hover:text-red-800 text-xs font-medium mr-1">作廢</button>
                        )}
                        <button
                          onClick={() => confirm(
                            `確定鎖帳此紀錄？鎖帳後無法編輯或刪除收款。\n${income.propertyName} ${income.incomeYear}/${String(income.incomeMonth).padStart(2,'0')}`,
                            () => toggleIncomeLock(income.id, false), '鎖帳確認', false
                          )}
                          className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-600 hover:bg-gray-200 font-medium">
                          🔓 鎖帳
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
        );
      })()}

      {/* Payment modal */}
      {payingIncomeId && (() => {
        const currentIncome = incomes.find(i => i.id === payingIncomeId);
        const expectedAmt = Number(currentIncome?.expectedAmount || 0);
        const receivedAmt = Number(currentIncome?.actualAmount || 0);
        const remainingAmt = Math.max(0, expectedAmt - receivedAmt);
        const payHistory = currentIncome?.payments || [];
        const showUtilitySection = incomeFormMode === 'confirm' && currentIncome?.collectUtilityFee;
        const utilityExpectedAmt = Number(incomeUtilityForm.expectedAmount || 0);
        const utilityActualAmt = Number(incomeUtilityForm.actualAmount || 0);
        const totalExpectedAmt = expectedAmt + utilityExpectedAmt;
        return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/50" onClick={() => setPayingIncomeId(null)} />
          {/* Modal panel */}
          <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
            {/* Sticky header */}
            <div className="flex items-start justify-between px-5 py-4 border-b border-teal-200 bg-teal-50 rounded-t-xl shrink-0">
              <div>
                <h4 className="font-semibold text-teal-800 text-base">{incomeFormMode === 'edit' ? '編輯收款' : '新增收款'}</h4>
                {(currentIncome?.propertyName || currentIncome?.tenantName) && (
                  <p className="text-sm text-teal-600 mt-0.5">
                    {currentIncome?.propertyName}{currentIncome?.tenantName ? ` — ${currentIncome.tenantName}` : ''}
                  </p>
                )}
              </div>
              <button onClick={() => setPayingIncomeId(null)} className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100 transition-colors ml-4 shrink-0">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            {/* Scrollable content */}
            <div className="overflow-y-auto p-5">
              {/* 收款狀態摘要 */}
              <div className="bg-teal-50 border border-teal-100 rounded-lg px-3 py-2 mb-4 flex gap-4 text-sm flex-wrap">
                <span>租金應收：<b className="text-gray-800">${fmt(expectedAmt)}</b></span>
                {showUtilitySection && <span>電費應收：<b className="text-blue-700">${fmt(utilityExpectedAmt)}</b></span>}
                {showUtilitySection && <span>合計應收：<b className="text-gray-900">${fmt(totalExpectedAmt)}</b></span>}
                <span>已收：<b className="text-green-700">${fmt(receivedAmt)}</b></span>
                <span>尚欠：<b className={remainingAmt > 0 ? 'text-red-600' : 'text-green-600'}>${fmt(remainingAmt)}</b></span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="f-95" className="text-xs text-gray-600">
                    實收金額
                    {incomeFormMode === 'confirm' && <span className="ml-1 text-teal-500 font-normal">（自動帶入尚欠）</span>}
                  </label>
                  <input id="f-95" type="number" value={incomePayForm.actualAmount} onChange={e => setIncomePayForm(f => ({ ...f, actualAmount: e.target.value }))}
                    className="w-full border rounded px-2 py-1.5 text-sm" />
                </div>
                <div>
                  <label htmlFor="f-3" className="text-xs text-gray-600">收款日期</label>
                  <input id="f-3" type="date" value={incomePayForm.actualDate} onChange={e => setIncomePayForm(f => ({ ...f, actualDate: e.target.value }))}
                    className="w-full border rounded px-2 py-1.5 text-sm" />
                </div>
                <div>
                  <label htmlFor="f-4" className="text-xs text-gray-600">收款帳戶</label>
                  <select id="f-4" value={incomePayForm.accountId} onChange={e => {
                    const acct = accounts.find(a => String(a.id) === e.target.value);
                    const autoMethod = acct?.type === '現金' ? '現金' : acct?.type === '銀行存款' ? '匯款' : null;
                    setIncomePayForm(f => ({ ...f, accountId: e.target.value, ...(autoMethod ? { paymentMethod: autoMethod } : {}) }));
                  }} className="w-full border rounded px-2 py-1.5 text-sm">
                    <option value="">-- 選擇帳戶 --</option>
                    {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="f-65" className="text-xs text-gray-600">付款方式</label>
                  <select id="f-65" value={incomePayForm.paymentMethod} onChange={e => setIncomePayForm(f => ({ ...f, paymentMethod: e.target.value }))}
                    className="w-full border rounded px-2 py-1.5 text-sm">
                    {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m === 'transfer' ? '轉帳' : m}</option>)}
                  </select>
                </div>
                {incomePayForm.paymentMethod === 'transfer' && (
                  <>
                    <div>
                      <label htmlFor="f-66" className="text-xs text-gray-600">轉帳參考號</label>
                      <input id="f-66" type="text" value={incomePayForm.matchTransferRef} onChange={e => setIncomePayForm(f => ({ ...f, matchTransferRef: e.target.value }))}
                        className="w-full border rounded px-2 py-1.5 text-sm" />
                    </div>
                    <div>
                      <label htmlFor="f-67" className="text-xs text-gray-600">匯款人戶名</label>
                      <input id="f-67" type="text" value={incomePayForm.matchBankAccountName} onChange={e => setIncomePayForm(f => ({ ...f, matchBankAccountName: e.target.value }))}
                        className="w-full border rounded px-2 py-1.5 text-sm" />
                    </div>
                  </>
                )}
                <div className="col-span-2">
                  <label htmlFor="f-5" className="text-xs text-gray-600">備註</label>
                  <input id="f-5" type="text" value={incomePayForm.matchNote} onChange={e => setIncomePayForm(f => ({ ...f, matchNote: e.target.value }))}
                    className="w-full border rounded px-2 py-1.5 text-sm" placeholder="收款備註" />
                </div>
              </div>

              {/* 電費區塊（僅限 confirm 模式且物業有 collectUtilityFee） */}
              {showUtilitySection && (
                <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <h5 className="text-sm font-medium text-blue-800 mb-2">電費收入（與租金一併入帳）</h5>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="f-6" className="text-xs text-blue-700">電費應收金額</label>
                      <input id="f-6" type="number" min="0" step="0.01"
                        value={incomeUtilityForm.expectedAmount}
                        onChange={e => setIncomeUtilityForm(f => ({ ...f, expectedAmount: e.target.value }))}
                        className="w-full border border-blue-200 rounded px-2 py-1.5 text-sm bg-white"
                        placeholder="本月電費帳單金額" />
                    </div>
                    <div>
                      <label htmlFor="f-7" className="text-xs text-blue-700">電費實收金額</label>
                      <input id="f-7" type="number" min="0" step="0.01"
                        value={incomeUtilityForm.actualAmount}
                        onChange={e => setIncomeUtilityForm(f => ({ ...f, actualAmount: e.target.value }))}
                        className="w-full border border-blue-200 rounded px-2 py-1.5 text-sm bg-white"
                        placeholder="留空表示尚未收到電費" />
                    </div>
                  </div>
                  <p className="text-xs text-blue-500 mt-1">※ 電費將使用相同日期與帳戶自動建立金流</p>
                </div>
              )}

              {/* 歷次收款紀錄 */}
              {payHistory.length > 0 && (
                <div className="mt-4 border-t border-gray-200 pt-4">
                  <h5 className="text-sm font-medium text-teal-700 mb-2">歷次收款紀錄（可個別編輯）</h5>
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 z-10 bg-white">
                      <tr className="text-gray-500 border-b">
                        <th className="text-left py-1">次數</th>
                        <th className="text-left py-1">收款日期</th>
                        <th className="text-right py-1">金額</th>
                        <th className="text-left py-1">收款帳戶</th>
                        <th className="text-left py-1">付款方式</th>
                        <th className="text-left py-1">備註</th>
                        <th className="text-center py-1">操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payHistory.map((p, i) => (
                        <React.Fragment key={p.id || i}>
                          <tr className="border-b border-gray-100">
                            <td className="py-1 font-medium">第{p.sequenceNo || (i + 1)}次</td>
                            <td className="py-1">{p.paymentDate || '-'}</td>
                            <td className="py-1 text-right text-green-700 font-medium">${fmt(p.amount)}</td>
                            <td className="py-1">{p.account?.name || accounts.find(a => a.id === p.accountId)?.name || '-'}</td>
                            <td className="py-1">{fmtPayMethod(p.paymentMethod)}</td>
                            <td className="py-1 text-gray-500">{p.matchNote || p.matchTransferRef || '-'}</td>
                            <td className="py-1 text-center">
                              {p.id && (editingPaymentId === p.id ? (
                                <button onClick={() => setEditingPaymentId(null)} className="text-gray-400 text-xs">取消</button>
                              ) : (
                                <button onClick={() => openPaymentEdit(p)} className="text-blue-600 hover:text-blue-800 text-xs font-medium">編輯</button>
                              ))}
                            </td>
                          </tr>
                          {p.id && editingPaymentId === p.id && (
                            <tr className="bg-blue-50/70">
                              <td colSpan={7} className="py-2 px-2">
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-2">
                                  <div>
                                    <label htmlFor="f-8" className="text-xs text-gray-500">金額</label>
                                    <input id="f-8" type="number" value={editingPaymentForm.amount} onChange={e => setEditingPaymentForm(f => ({ ...f, amount: e.target.value }))} className="w-full border rounded px-2 py-0.5 text-xs" />
                                  </div>
                                  <div>
                                    <label htmlFor="f-9" className="text-xs text-gray-500">日期</label>
                                    <input id="f-9" type="date" value={editingPaymentForm.paymentDate} onChange={e => setEditingPaymentForm(f => ({ ...f, paymentDate: e.target.value }))} className="w-full border rounded px-2 py-0.5 text-xs" />
                                  </div>
                                  <div>
                                    <label htmlFor="f-10" className="text-xs text-gray-500">收款帳戶</label>
                                    <select id="f-10" value={editingPaymentForm.accountId} onChange={e => { const acct = accounts.find(a => String(a.id) === e.target.value); const autoMethod = acct?.type === '現金' ? '現金' : acct?.type === '銀行存款' ? '匯款' : null; setEditingPaymentForm(f => ({ ...f, accountId: e.target.value, ...(autoMethod ? { paymentMethod: autoMethod } : {}) })); }} className="w-full border rounded px-2 py-0.5 text-xs">
                                      <option value="">選擇</option>
                                      {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                                    </select>
                                  </div>
                                  <div>
                                    <label htmlFor="f-68" className="text-xs text-gray-500">付款方式</label>
                                    <select id="f-68" value={editingPaymentForm.paymentMethod} onChange={e => setEditingPaymentForm(f => ({ ...f, paymentMethod: e.target.value }))} className="w-full border rounded px-2 py-0.5 text-xs">
                                      {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m === 'transfer' ? '轉帳' : m}</option>)}
                                    </select>
                                  </div>
                                  <div className="col-span-2">
                                    <label htmlFor="f-69" className="text-xs text-gray-500">備註</label>
                                    <input id="f-69" type="text" value={editingPaymentForm.matchNote} onChange={e => setEditingPaymentForm(f => ({ ...f, matchNote: e.target.value }))} className="w-full border rounded px-2 py-0.5 text-xs" />
                                  </div>
                                </div>
                                <div className="flex gap-2">
                                  <button onClick={savePaymentEdit} disabled={editingPaymentSaving} className="bg-blue-600 text-white px-3 py-1 rounded text-xs hover:bg-blue-700 disabled:opacity-50">{editingPaymentSaving ? '儲存中…' : '儲存'}</button>
                                  <button onClick={() => setEditingPaymentId(null)} className="bg-gray-200 text-gray-700 px-3 py-1 rounded text-xs hover:bg-gray-300">取消</button>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      ))}
                      <tr className="font-medium bg-teal-100/50">
                        <td className="py-1" colSpan={2}>合計已收</td>
                        <td className="py-1 text-right text-green-700">${fmt(receivedAmt)}</td>
                        <td className="py-1" colSpan={4}>{remainingAmt > 0 ? <span className="text-red-600">尚欠 ${fmt(remainingAmt)}</span> : <span className="text-green-600">已收齊</span>}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Sticky footer buttons */}
            <div className="shrink-0 px-5 py-4 border-t border-gray-200 bg-gray-50 rounded-b-xl flex gap-2">
              <button onClick={confirmIncomePayment} disabled={incomePaymentSaving} className="bg-teal-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-teal-700 disabled:opacity-50">{incomePaymentSaving ? '處理中…' : (incomeFormMode === 'edit' ? '儲存' : '確認收款')}</button>
              <button onClick={() => setPayingIncomeId(null)} className="bg-white border border-gray-300 text-gray-700 px-5 py-2 rounded-lg text-sm font-medium hover:bg-gray-50">取消</button>
            </div>
          </div>
        </div>
        );
      })()}
    </div>
  );
}
