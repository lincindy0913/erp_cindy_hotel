'use client';

import { usePeriodCheck } from '@/lib/hooks/usePeriodCheck';
import { getDisplayOrderNo } from '../_hooks/useCashierOrders';

export default function BatchExecutionPanel({
  // batch state
  selectedOrderIds,
  selectedOrders,
  selectedTotal,
  batchExtrasTotal,
  hasLoanOrders,
  selectedByMethod,
  batchAccounts, setBatchAccounts,
  batchAccountsTotal,
  batchAmountDiff,
  batchExecutionDate, setBatchExecutionDate,
  batchNote, setBatchNote,
  batchExecuting,
  batchIsEmployeeAdvance, setBatchIsEmployeeAdvance,
  batchAdvancedBy, setBatchAdvancedBy,
  batchAdvancePaymentMethod, setBatchAdvancePaymentMethod,
  batchExtraAmounts, setBatchExtraAmounts,
  // accounts list for dropdowns
  accounts,
  // handlers
  handleBatchExecute,
  resetBatch,
}) {
  const { locked: batchExecLocked, status: batchExecLockStatus } = usePeriodCheck(batchExecutionDate, null);

  return (
    <div className="mt-6 bg-white rounded-lg shadow border-2 border-amber-400 p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-bold text-amber-800">
          批次執行（已選 {selectedOrderIds.size} 筆）
        </h3>
        <div className="text-right">
          <span className="text-sm text-gray-500">總金額</span>
          <span className="text-2xl font-bold text-amber-700 ml-2">NT$ {selectedTotal.toLocaleString()}</span>
        </div>
      </div>

      {/* Selected orders summary by payment method */}
      <div className="mb-4 bg-amber-50 rounded-lg p-4">
        <div className="text-sm font-medium text-gray-700 mb-2">依付款方式分類</div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Object.entries(selectedByMethod).map(([method, info]) => (
            <div key={method} className="bg-white rounded-lg border p-3">
              <div className="text-xs text-gray-500">{method}</div>
              <div className="font-bold text-amber-700">NT$ {info.total.toLocaleString()}</div>
              <div className="text-xs text-gray-400">{info.count} 筆</div>
            </div>
          ))}
        </div>
      </div>

      {/* Selected orders detail list */}
      <div className="mb-4 border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 sticky top-0 z-10">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">付款單號</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">廠商</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">館別</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">付款方式</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">摘要</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">應付金額</th>
              {hasLoanOrders && <th className="px-3 py-2 text-right text-xs font-medium text-indigo-600">額外預付</th>}
              {hasLoanOrders && <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">實付金額</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {selectedOrders.map(o => {
              const isLoan = (o.summary || '').includes('貸款還款');
              const extra = parseFloat(batchExtraAmounts[o.id]) || 0;
              const orderActual = Number(o.netAmount) + extra;
              return (
                <tr key={o.id}>
                  <td className="px-3 py-2 font-medium text-amber-800">{getDisplayOrderNo(o)}</td>
                  <td className="px-3 py-2">{o.supplierName || '-'}</td>
                  <td className="px-3 py-2">{o.warehouse || '-'}</td>
                  <td className="px-3 py-2">{o.paymentMethod}</td>
                  <td className="px-3 py-2 text-gray-700 max-w-[200px] truncate" title={o.note || ''}>{o.note || '-'}</td>
                  <td className="px-3 py-2 text-right font-medium">NT$ {Number(o.netAmount).toLocaleString()}</td>
                  {hasLoanOrders && (
                    <td className="px-3 py-2 text-right">
                      {isLoan ? (
                        <input type="number" step="0.01" min="0"
                          value={batchExtraAmounts[o.id] || ''}
                          onChange={e => setBatchExtraAmounts(prev => ({ ...prev, [o.id]: e.target.value }))}
                          placeholder="0"
                          className="w-24 border border-indigo-300 rounded px-2 py-1 text-sm text-right focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-indigo-50" />
                      ) : <span className="text-gray-400">—</span>}
                    </td>
                  )}
                  {hasLoanOrders && (
                    <td className="px-3 py-2 text-right font-medium">
                      {isLoan && extra > 0 ? (
                        <span className="text-indigo-700">NT$ {orderActual.toLocaleString()}</span>
                      ) : (
                        <span>NT$ {Number(o.netAmount).toLocaleString()}</span>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
            <tr className="bg-amber-50 font-bold">
              <td colSpan={hasLoanOrders ? 5 : 5} className="px-3 py-2 text-right">合計</td>
              {!hasLoanOrders && (
                <td className="px-3 py-2 text-right text-amber-700">NT$ {selectedTotal.toLocaleString()}</td>
              )}
              {hasLoanOrders && (
                <>
                  <td className="px-3 py-2 text-right">{(selectedTotal - batchExtrasTotal) > 0 ? `NT$ ${(selectedTotal - batchExtrasTotal).toLocaleString()}` : ''}</td>
                  <td className="px-3 py-2 text-right text-indigo-700">{batchExtrasTotal > 0 ? `NT$ ${batchExtrasTotal.toLocaleString()}` : ''}</td>
                  <td className="px-3 py-2 text-right text-amber-700">NT$ {selectedTotal.toLocaleString()}</td>
                </>
              )}
            </tr>
          </tbody>
        </table>
      </div>

      {/* Loan prepaid info banner */}
      {hasLoanOrders && batchExtrasTotal > 0 && (
        <div className="mb-4 bg-indigo-50 border border-indigo-200 rounded p-2 text-sm text-indigo-800">
          付款單金額 NT$ {(selectedTotal - batchExtrasTotal).toLocaleString()} + 額外預付 NT$ {batchExtrasTotal.toLocaleString()} =
          <span className="font-bold ml-1">實付 NT$ {selectedTotal.toLocaleString()}</span>
        </div>
      )}

      {/* Batch execution form */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div>
          <label htmlFor="f-10" className="block text-sm font-medium text-gray-700 mb-1">執行日期</label>
          <input id="f-10" type="date" value={batchExecutionDate}
            onChange={e => setBatchExecutionDate(e.target.value)}
            className={`w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none ${batchExecLocked ? 'border-red-400 bg-red-50' : ''}`} />
          {batchExecLocked && (
            <p className="mt-1 text-xs text-red-600">
              ⚠ 此月份已{batchExecLockStatus}，請至 <a href="/month-end" className="underline font-medium">月結管理</a> 解鎖。
            </p>
          )}
        </div>
        <div>
          <label htmlFor="f-11" className="block text-sm font-medium text-gray-700 mb-1">備註</label>
          <input id="f-11" type="text" value={batchNote}
            onChange={e => setBatchNote(e.target.value)}
            placeholder="選填..."
            className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none" />
        </div>
      </div>

      {/* Employee advance section */}
      <div className="mb-4 border-t pt-3">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={batchIsEmployeeAdvance}
            onChange={e => setBatchIsEmployeeAdvance(e.target.checked)}
            className="rounded border-gray-300 text-purple-600 focus:ring-purple-500" />
          <span className="font-medium text-purple-800">此批次為員工代墊款</span>
        </label>
        {batchIsEmployeeAdvance && (
          <div className="grid grid-cols-2 gap-3 mt-2">
            <div>
              <label htmlFor="f-12" className="block text-xs font-medium text-purple-700 mb-1">代墊員工 *</label>
              <input id="f-12" type="text" value={batchAdvancedBy}
                onChange={e => setBatchAdvancedBy(e.target.value)}
                placeholder="員工姓名"
                className="w-full border border-purple-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500 focus:outline-none bg-purple-50" />
            </div>
            <div>
              <label htmlFor="f-13" className="block text-xs font-medium text-purple-700 mb-1">代墊方式</label>
              <select id="f-13" value={batchAdvancePaymentMethod}
                onChange={e => setBatchAdvancePaymentMethod(e.target.value)}
                className="w-full border border-purple-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500 focus:outline-none bg-purple-50">
                <option value="現金">現金</option>
                <option value="信用卡">信用卡</option>
                <option value="其他">其他</option>
              </select>
            </div>
          </div>
        )}
      </div>

      {/* Multiple funding accounts */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm font-medium text-gray-700">資金帳戶 *</label>
          <button type="button"
            onClick={() => setBatchAccounts(prev => [...prev, { accountId: '', amount: '' }])}
            className="text-sm text-amber-600 hover:text-amber-800 font-medium">
            + 新增帳戶
          </button>
        </div>
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 sticky top-0 z-10">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">帳戶</th>
                <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 w-40">支出金額</th>
                <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 w-36">帳戶餘額</th>
                <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 w-36">執行後餘額</th>
                <th className="px-3 py-2 w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {batchAccounts.map((ba, idx) => {
                const acct = ba.accountId ? accounts.find(a => a.id === parseInt(ba.accountId)) : null;
                const currentBal = acct ? Number(acct.currentBalance) : 0;
                const payAmount = parseFloat(ba.amount) || 0;
                const afterBal = currentBal - payAmount;
                const usedIds = batchAccounts.filter((_, i) => i !== idx).map(a => a.accountId).filter(Boolean);
                return (
                  <tr key={idx}>
                    <td className="px-3 py-2">
                      <select value={ba.accountId}
                        onChange={e => {
                          const newAccounts = [...batchAccounts];
                          const otherTotal = newAccounts
                            .filter((_, i) => i !== idx)
                            .reduce((sum, a) => sum + (parseFloat(a.amount) || 0), 0);
                          const remaining = Math.round((selectedTotal - otherTotal) * 100) / 100;
                          newAccounts[idx] = {
                            ...newAccounts[idx],
                            accountId: e.target.value,
                            amount: e.target.value && remaining > 0 ? String(remaining) : newAccounts[idx].amount,
                          };
                          setBatchAccounts(newAccounts);
                        }}
                        className="w-full border rounded px-2 py-1.5 text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none">
                        <option value="">-- 選擇帳戶 --</option>
                        {accounts.filter(a => a.isActive && !usedIds.includes(String(a.id))).map(a => (
                          <option key={a.id} value={a.id}>
                            {a.name} ({a.type})
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <input type="number" step="0.01" min="0"
                        value={ba.amount}
                        onChange={e => {
                          const newAccounts = [...batchAccounts];
                          newAccounts[idx] = { ...newAccounts[idx], amount: e.target.value };
                          setBatchAccounts(newAccounts);
                        }}
                        placeholder="0"
                        className="w-full border rounded px-2 py-1.5 text-sm text-right focus:ring-2 focus:ring-amber-500 focus:outline-none" />
                    </td>
                    <td className="px-3 py-2 text-right text-gray-500">
                      {acct ? `NT$ ${currentBal.toLocaleString()}` : '-'}
                    </td>
                    <td className={`px-3 py-2 text-right font-medium ${acct && afterBal < 0 ? 'text-red-600' : 'text-gray-700'}`}>
                      {acct ? `NT$ ${afterBal.toLocaleString()}` : '-'}
                      {acct && afterBal < 0 && <span className="text-xs ml-1">(不足)</span>}
                    </td>
                    <td className="px-3 py-2 text-center">
                      {batchAccounts.length > 1 && (
                        <button type="button"
                          onClick={() => setBatchAccounts(prev => prev.filter((_, i) => i !== idx))}
                          className="text-red-400 hover:text-red-600 text-lg leading-none">
                          &times;
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-gray-50 font-semibold">
                <td className="px-3 py-2 text-right">合計</td>
                <td className="px-3 py-2 text-right">NT$ {batchAccountsTotal.toLocaleString()}</td>
                <td colSpan="3" className="px-3 py-2"></td>
              </tr>
            </tfoot>
          </table>
        </div>
        {/* Validation message */}
        {batchAccounts.some(a => a.accountId) && (
          <div className={`mt-2 text-sm p-2 rounded ${
            Math.abs(batchAmountDiff) < 0.01
              ? 'bg-green-50 text-green-700'
              : 'bg-red-50 text-red-700'
          }`}>
            {Math.abs(batchAmountDiff) < 0.01
              ? `資金帳戶合計 NT$ ${batchAccountsTotal.toLocaleString()} = 付款單總額 NT$ ${selectedTotal.toLocaleString()} ✓`
              : `差額 NT$ ${batchAmountDiff.toLocaleString()}（付款單總額 NT$ ${selectedTotal.toLocaleString()} − 帳戶合計 NT$ ${batchAccountsTotal.toLocaleString()}）`
            }
          </div>
        )}
      </div>

      <div className="flex justify-end gap-3">
        <button
          onClick={resetBatch}
          className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50"
        >
          取消選取
        </button>
        <button
          onClick={handleBatchExecute}
          disabled={batchExecuting || Math.abs(batchAmountDiff) > 0.01 || !batchAccounts.some(a => a.accountId)}
          className={`px-6 py-2 rounded-lg text-sm font-medium ${
            batchExecuting || Math.abs(batchAmountDiff) > 0.01 || !batchAccounts.some(a => a.accountId)
              ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
              : 'bg-amber-600 text-white hover:bg-amber-700'
          }`}
        >
          {batchExecuting ? '執行中...' : `批次確認執行 (${selectedOrderIds.size} 筆)`}
        </button>
      </div>
    </div>
  );
}
