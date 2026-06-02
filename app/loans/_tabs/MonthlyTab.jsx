'use client';

import { SortableTh } from '@/components/SortableTh';

const STATUS_BADGES = {
  '暫估': 'bg-yellow-100 text-yellow-800 border-yellow-300',
  '待出納': 'bg-orange-100 text-orange-800 border-orange-300',
  '已預付': 'bg-blue-100 text-blue-800 border-blue-300',
  '已核實': 'bg-green-100 text-green-800 border-green-300',
  '跳過': 'bg-gray-100 text-gray-600 border-gray-300',
  '已結清': 'bg-blue-100 text-blue-800 border-blue-300'
};

function formatCurrency(val) {
  if (val === null || val === undefined) return '-';
  return Number(val).toLocaleString('zh-TW');
}

function formatDate(d) {
  if (!d) return '-';
  return d;
}

export default function MonthlyTab({
  loans,
  accounts,
  monthlyYear,
  setMonthlyYear,
  monthlyMonth,
  setMonthlyMonth,
  monthlyRecords,
  isLoggedIn,
  now,
  sortedMonthlyMatrixRows,
  loanMonKey,
  loanMonDir,
  toggleLoanMon,
  getDaysUntilDue,
  openConfirmModal,
  deleteRecord,
  pushToCashier,
  batchPushToCashier,
  openBatchModal,
  openTransferModal,
}) {
  const activeLoansForMonth = loans.filter(l => l.status === '使用中');
  const recordMap = {};
  monthlyRecords.forEach(r => { recordMap[r.loanId] = r; });

  // ---- Account Summary: group by deductAccountId ----
  const acctMap = {};
  for (const loan of activeLoansForMonth) {
    const acctId = loan.deductAccountId;
    if (!acctMap[acctId]) {
      const acct = accounts.find(a => a.id === acctId);
      acctMap[acctId] = {
        account: acct || { id: acctId, name: loan.deductAccount?.name || `帳戶#${acctId}`, currentBalance: 0 },
        loanCount: 0,
        estimatedTotal: 0,
        confirmedTotal: 0,
        pendingTotal: 0,
      };
    }
    acctMap[acctId].loanCount++;
    const rec = recordMap[loan.id];
    if (rec) {
      acctMap[acctId].estimatedTotal += rec.estimatedTotal || 0;
      if (rec.status === '已核實') {
        acctMap[acctId].confirmedTotal += rec.actualTotal || 0;
      } else {
        acctMap[acctId].pendingTotal += rec.estimatedTotal || 0;
      }
    }
  }
  const acctSummaries = Object.values(acctMap).sort((a, b) => b.pendingTotal - a.pendingTotal);

  return (
    <div>
      {/* Workflow Guide */}
      <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 mb-4">
        <p className="text-sm font-medium text-indigo-800 mb-2">貸款還款流程（3步驟）：</p>
        <ol className="text-xs text-indigo-700 space-y-1 list-decimal list-inside">
          <li><b>批次建立並推送出納</b> — 系統自動計算暫估金額，直接建立付款單送出納</li>
          <li><b>出納付款</b> — 出納在「出納管理」執行付款 → 狀態自動變為「已預付」，金額同步回來</li>
          <li><b>核實回填</b> — 收到銀行利息單後，點「核實」填入實際金額 → 帳戶餘額與貸款餘額同步更新</li>
        </ol>
        <div className="mt-2 flex items-center gap-2 text-xs text-indigo-600">
          <span className="inline-block w-2 h-2 rounded-full bg-yellow-400"></span>暫估
          <span className="inline-block w-2 h-2 rounded-full bg-orange-400 ml-2"></span>待出納
          <span className="inline-block w-2 h-2 rounded-full bg-blue-400 ml-2"></span>已預付
          <span className="inline-block w-2 h-2 rounded-full bg-green-400 ml-2"></span>已核實
        </div>
      </div>

      {/* Month Selector & Actions */}
      <div className="bg-white rounded-xl shadow-sm p-4 mb-4 flex flex-wrap gap-3 items-center">
        <label htmlFor="f" className="text-sm font-medium text-gray-600">年月:</label>
        <select id="f" value={monthlyYear} onChange={e => setMonthlyYear(parseInt(e.target.value))} className="border rounded-lg px-3 py-2 text-sm">
          {[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map(y => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
        <select value={monthlyMonth} onChange={e => setMonthlyMonth(parseInt(e.target.value))} className="border rounded-lg px-3 py-2 text-sm">
          {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
            <option key={m} value={m}>{m}月</option>
          ))}
        </select>
        <div className="flex-1" />
        {isLoggedIn && (() => {
          const dueCount = monthlyRecords.filter(r => r.status === '暫估' && getDaysUntilDue(r.dueDate) !== null && getDaysUntilDue(r.dueDate) <= 7).length;
          return (
            <div className="flex gap-2">
              {dueCount > 0 && (
                <button onClick={batchPushToCashier} className="bg-orange-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-orange-700 transition-colors animate-pulse">
                  批次推送出納 ({dueCount}筆即將到期)
                </button>
              )}
              <button onClick={openBatchModal} className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-indigo-700 transition-colors">
                批次建立並推送出納
              </button>
            </div>
          );
        })()}
      </div>

      {/* ====== ACCOUNT FUND SUMMARY ====== */}
      {acctSummaries.length > 0 && (
        <div className="mb-4">
          <h3 className="text-sm font-bold text-gray-700 mb-3">帳戶資金彙總 — {monthlyYear}年{monthlyMonth}月</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {acctSummaries.map(s => {
              const balance = Number(s.account.currentBalance || 0);
              const shortage = s.pendingTotal - balance;
              const isInsufficient = s.pendingTotal > 0 && shortage > 0;
              const isOk = s.pendingTotal > 0 && shortage <= 0;
              return (
                <div key={s.account.id} className={`bg-white rounded-xl shadow-sm p-4 border-l-4 ${isInsufficient ? 'border-red-500' : isOk ? 'border-green-500' : 'border-gray-300'}`}>
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="text-sm font-bold text-gray-800">{s.account.name}</p>
                      <p className="text-xs text-gray-400">{s.loanCount} 筆貸款</p>
                    </div>
                    {isInsufficient && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-700 border border-red-300 animate-pulse">
                        餘額不足
                      </span>
                    )}
                    {isOk && s.pendingTotal > 0 && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-green-100 text-green-700 border border-green-300">
                        餘額充足
                      </span>
                    )}
                  </div>
                  <div className="space-y-1 text-xs">
                    <div className="flex justify-between">
                      <span className="text-gray-500">帳戶餘額</span>
                      <span className="font-mono font-bold text-gray-800">{formatCurrency(balance)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">本月待扣 (未核實)</span>
                      <span className="font-mono font-medium text-yellow-700">{formatCurrency(s.pendingTotal)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">已核實扣款</span>
                      <span className="font-mono text-green-700">{formatCurrency(s.confirmedTotal)}</span>
                    </div>
                    <div className="border-t pt-1 flex justify-between">
                      <span className="text-gray-500 font-medium">差額 (餘額 - 待扣)</span>
                      <span className={`font-mono font-bold ${shortage > 0 ? 'text-red-600' : 'text-green-600'}`}>
                        {shortage > 0 ? `-${formatCurrency(shortage)}` : `+${formatCurrency(Math.abs(shortage))}`}
                      </span>
                    </div>
                  </div>
                  {isLoggedIn && isInsufficient && (
                    <button
                      onClick={() => openTransferModal(s.account, shortage)}
                      className="mt-3 w-full bg-red-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-red-700 transition-colors"
                    >
                      快速預存 {formatCurrency(Math.ceil(shortage))}
                    </button>
                  )}
                  {isLoggedIn && !isInsufficient && s.pendingTotal > 0 && (
                    <button
                      onClick={() => openTransferModal(s.account, 0)}
                      className="mt-3 w-full border border-gray-300 text-gray-600 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-gray-50 transition-colors"
                    >
                      追加預存
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          {acctSummaries.some(s => s.pendingTotal > 0 && (s.pendingTotal - Number(s.account.currentBalance || 0)) > 0) && (
            <div className="mt-3 bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
              <span className="text-red-500 text-lg leading-none">!</span>
              <div className="text-xs text-red-700">
                <b>注意：</b>有帳戶餘額不足以支付本月預估貸款扣款。請盡速從其他帳戶移轉資金，避免銀行扣款失敗。
                點擊上方「快速預存」按鈕可直接移轉。
              </div>
            </div>
          )}
        </div>
      )}

      {/* Monthly Matrix */}
      <div className="bg-white rounded-xl shadow-sm" style={{ overflow: 'clip' }}>
        <div className="tbl-wrap">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b sticky top-0 z-10">
              <tr>
                <SortableTh label="貸款名稱" colKey="loanName" sortKey={loanMonKey} sortDir={loanMonDir} onSort={toggleLoanMon} className="px-3 py-3" />
                <SortableTh label="扣款帳戶" colKey="deductAccount" sortKey={loanMonKey} sortDir={loanMonDir} onSort={toggleLoanMon} className="px-3 py-3" />
                <SortableTh label="繳款倒數" colKey="daysLeft" sortKey={loanMonKey} sortDir={loanMonDir} onSort={toggleLoanMon} className="px-3 py-3" align="center" />
                <SortableTh label="狀態" colKey="monthStatus" sortKey={loanMonKey} sortDir={loanMonDir} onSort={toggleLoanMon} className="px-3 py-3" align="center" />
                <SortableTh label="暫估合計" colKey="estimatedTotal" sortKey={loanMonKey} sortDir={loanMonDir} onSort={toggleLoanMon} className="px-3 py-3" align="right" />
                <SortableTh label="實際合計" colKey="actualTotal" sortKey={loanMonKey} sortDir={loanMonDir} onSort={toggleLoanMon} className="px-3 py-3" align="right" />
                <SortableTh label="差異" colKey="diffCol" sortKey={loanMonKey} sortDir={loanMonDir} onSort={toggleLoanMon} className="px-3 py-3" align="right" />
                <SortableTh label="現金流狀態" colKey="cashFlowCol" sortKey={loanMonKey} sortDir={loanMonDir} onSort={toggleLoanMon} className="px-3 py-3" align="center" />
                <th className="text-center px-3 py-3 text-sm font-medium text-gray-600">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {activeLoansForMonth.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center py-8 text-gray-400">
                    暫無使用中的貸款，請先在「貸款總覽」新增貸款
                  </td>
                </tr>
              ) : sortedMonthlyMatrixRows.map(({ loan, rec }) => {
                const diff = rec && (rec.status === '已核實' || rec.status === '已預付') && rec.actualTotal != null
                  ? rec.estimatedTotal - rec.actualTotal : null;
                const daysLeft = rec ? getDaysUntilDue(rec.dueDate) : null;
                const dueColor = daysLeft === null ? '' : daysLeft < 0 ? 'text-red-600 font-bold' : daysLeft <= 3 ? 'text-red-600 font-bold animate-pulse' : daysLeft <= 7 ? 'text-orange-600 font-bold' : 'text-gray-600';
                const dueLabel = daysLeft === null ? '-' : daysLeft < 0 ? `已逾期${Math.abs(daysLeft)}天` : daysLeft === 0 ? '今日到期' : `${daysLeft}天`;

                return (
                  <tr key={loan.id} className={`hover:bg-gray-50 ${daysLeft !== null && daysLeft <= 3 && rec?.status === '暫估' ? 'bg-red-50' : ''}`}>
                    <td className="px-3 py-3">
                      <div className="font-medium text-sm">{loan.loanName}</div>
                      <div className="text-xs text-gray-400">{loan.loanCode} | {loan.bankName}</div>
                    </td>
                    <td className="px-3 py-3 text-xs">{loan.deductAccount?.name || '-'}</td>
                    <td className="px-3 py-3 text-center">
                      {rec ? (
                        <div>
                          <div className={`text-sm ${dueColor}`}>{dueLabel}</div>
                          <div className="text-xs text-gray-400">{formatDate(rec.dueDate)}</div>
                        </div>
                      ) : (
                        <span className="text-gray-400 text-xs">每月{loan.repaymentDay}日</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-center">
                      {rec ? (
                        <span className={`inline-block px-2 py-1 rounded text-xs font-medium border ${STATUS_BADGES[rec.status] || 'bg-gray-100'}`}>
                          {rec.status}
                        </span>
                      ) : (
                        <span className="text-gray-400 text-xs">未建立</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-right font-mono text-sm">
                      {rec ? (
                        <div>
                          <div>{formatCurrency(rec.estimatedTotal)}</div>
                          <div className="text-xs text-gray-400">本{formatCurrency(rec.estimatedPrincipal)} 息{formatCurrency(rec.estimatedInterest)}</div>
                        </div>
                      ) : '-'}
                    </td>
                    <td className="px-3 py-3 text-right font-mono text-sm text-green-700">
                      {rec?.actualTotal != null ? (
                        <div>
                          <div>{formatCurrency(rec.actualTotal)}</div>
                          <div className="text-xs text-gray-500">本{formatCurrency(rec.actualPrincipal)} 息{formatCurrency(rec.actualInterest)}</div>
                        </div>
                      ) : '-'}
                    </td>
                    <td className="px-3 py-3 text-right font-mono text-xs">
                      {diff != null ? (
                        <span className={diff > 0 ? 'text-orange-600' : diff < 0 ? 'text-red-600' : 'text-gray-400'}>
                          {diff > 0 ? '+' : ''}{formatCurrency(diff)}
                        </span>
                      ) : '-'}
                    </td>
                    <td className="px-3 py-2 text-center">
                      {rec ? (
                        <div className="space-y-1">
                          {rec.preDeposit && (
                            <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-blue-50 text-blue-700 border border-blue-200">
                              <span>預付</span>
                              <span className="font-mono">{formatCurrency(rec.preDeposit.amount)}</span>
                            </div>
                          )}
                          {rec.cashierTxns && rec.cashierTxns.length > 0 && (
                            <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-emerald-50 text-emerald-700 border border-emerald-200">
                              <span>已付款</span>
                              <span className="font-mono">{formatCurrency(rec.cashierTxns.reduce((s, t) => s + t.amount, 0))}</span>
                            </div>
                          )}
                          {(rec.status === '已預付' || rec.status === '已核實') && rec.actualTotal != null && rec.actualTotal > rec.estimatedTotal && (
                            <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-indigo-50 text-indigo-700 border border-indigo-200">
                              <span>已預付</span>
                              <span className="font-mono">{formatCurrency(Math.round((rec.actualTotal - rec.estimatedTotal) * 100) / 100)}</span>
                            </div>
                          )}
                          {rec.paymentTxns && rec.paymentTxns.length > 0 && (
                            <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-green-50 text-green-700 border border-green-200">
                              <span>扣款</span>
                              <span className="font-mono">{formatCurrency(rec.paymentTxns.reduce((s, t) => s + t.amount, 0))}</span>
                            </div>
                          )}
                          {!rec.preDeposit && (!rec.cashierTxns || rec.cashierTxns.length === 0) && (!rec.paymentTxns || rec.paymentTxns.length === 0) && rec.actualTotal == null && (
                            <span className="text-xs text-gray-400">-</span>
                          )}
                        </div>
                      ) : '-'}
                    </td>
                    <td className="px-3 py-3 text-center">
                      {isLoggedIn && (
                        <div className="flex flex-col gap-1 items-center">
                          {rec && rec.status === '暫估' && (
                            <>
                              <button onClick={() => pushToCashier(rec)} className="bg-orange-500 text-white px-2 py-1 rounded text-xs hover:bg-orange-600 w-full">
                                推送出納
                              </button>
                              <div className="flex gap-1">
                                <button onClick={() => openConfirmModal(rec)} className="bg-green-600 text-white px-2 py-1 rounded text-xs hover:bg-green-700">
                                  核實
                                </button>
                                <button onClick={() => deleteRecord(rec)} className="text-red-600 hover:text-red-800 text-xs px-1 py-1 rounded hover:bg-red-50">
                                  刪除
                                </button>
                              </div>
                            </>
                          )}
                          {rec && rec.status === '待出納' && (
                            <div className="text-xs text-orange-600 font-medium">
                              等待出納付款中...
                            </div>
                          )}
                          {rec && rec.status === '已預付' && (
                            <button onClick={() => openConfirmModal(rec)} className="bg-green-600 text-white px-2 py-1 rounded text-xs hover:bg-green-700 w-full">
                              核實（利息單已到）
                            </button>
                          )}
                          {rec && rec.status === '已核實' && (
                            <button onClick={() => deleteRecord(rec)} className="text-red-600 hover:text-red-800 text-xs px-2 py-1 rounded hover:bg-red-50">
                              沖銷
                            </button>
                          )}
                          {!rec && (
                            <span className="text-gray-400 text-xs">請先批次建立並推送</span>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {monthlyRecords.length > 0 && (() => {
              const totalEstT = monthlyRecords.reduce((s, r) => s + r.estimatedTotal, 0);
              const confirmedRecs = monthlyRecords.filter(r => r.actualTotal != null);
              const totalActT = confirmedRecs.reduce((s, r) => s + (r.actualTotal || 0), 0);
              const totalPreDeposit = monthlyRecords.reduce((s, r) => s + (r.preDeposit ? r.preDeposit.amount : 0), 0);
              const totalExtraPrepaid = confirmedRecs.reduce((s, r) => {
                const extra = r.actualTotal != null && r.actualTotal > r.estimatedTotal ? Math.round((r.actualTotal - r.estimatedTotal) * 100) / 100 : 0;
                return s + extra;
              }, 0);
              const statusCounts = {};
              monthlyRecords.forEach(r => { statusCounts[r.status] = (statusCounts[r.status] || 0) + 1; });
              return (
                <tfoot className="bg-gray-50 border-t-2 border-gray-200">
                  <tr className="font-medium">
                    <td colSpan={2} className="px-3 py-3 text-right text-gray-600">
                      <div className="flex gap-2 justify-end text-xs">
                        {Object.entries(statusCounts).map(([st, cnt]) => (
                          <span key={st} className={`px-2 py-0.5 rounded border ${STATUS_BADGES[st] || 'bg-gray-100'}`}>{st}: {cnt}</span>
                        ))}
                      </div>
                    </td>
                    <td colSpan={2} className="px-3 py-3 text-right text-gray-600 text-sm">合計 ({monthlyRecords.length}筆):</td>
                    <td className="px-3 py-3 text-right font-mono">{formatCurrency(totalEstT)}</td>
                    <td className="px-3 py-3 text-right font-mono text-green-700">{formatCurrency(totalActT)}</td>
                    <td className="px-3 py-3 text-right font-mono text-xs">
                      {confirmedRecs.length > 0 ? (
                        <span className={totalEstT - totalActT > 0 ? 'text-orange-600' : 'text-red-600'}>
                          {totalEstT - totalActT > 0 ? '+' : ''}{formatCurrency(totalEstT - totalActT)}
                        </span>
                      ) : '-'}
                    </td>
                    <td className="px-3 py-3 text-center text-xs">
                      <div className="space-y-1">
                        {totalPreDeposit > 0 && (
                          <div className="text-blue-600 font-mono">預付: {formatCurrency(totalPreDeposit)}</div>
                        )}
                        {totalExtraPrepaid > 0 && (
                          <div className="text-indigo-600 font-mono">已預付: {formatCurrency(totalExtraPrepaid)}</div>
                        )}
                      </div>
                    </td>
                    <td></td>
                  </tr>
                </tfoot>
              );
            })()}
          </table>
        </div>
      </div>
    </div>
  );
}
