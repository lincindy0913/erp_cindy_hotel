'use client';

function formatMoney(val) {
  if (val == null || isNaN(val)) return '0';
  return Number(val).toLocaleString('zh-TW', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

export function AccountTab({
  // account selector
  selectedAccountId, setSelectedAccountId,
  acctYear, setAcctYear, acctMonth, setAcctMonth,
  bankAccountsOnly,
  // reconciliation data
  reconciliation, bankLines, systemTxs, acctLoading,
  bankBalanceInput, setBankBalanceInput,
  confirmNote, setConfirmNote, diffExplained, setDiffExplained,
  selectedBankLine, setSelectedBankLine, selectedSystemTx, setSelectedSystemTx,
  showImportModal, setShowImportModal, showAdjustModal, setShowAdjustModal,
  adjustForm, setAdjustForm,
  importLines, importFileName, selectedFormatId, setSelectedFormatId,
  importSubmitting, adjustmentSubmitting,
  formats,
  // actions
  updateBankBalance, confirmReconciliation,
  matchPair, unmatchLine, handleFileUpload, submitImport, submitAdjustment,
}) {
  // Matched / unmatched helpers
  const matchedTxIds = new Set(bankLines.filter(l => l.matchedTransactionId).map(l => l.matchedTransactionId));
  const unmatchedBankLines = bankLines.filter(l => l.matchStatus !== 'matched');
  const unmatchedSystemTxs = systemTxs.filter(t => !matchedTxIds.has(t.id));

  const summary = reconciliation ? {
    matched: bankLines.filter(l => l.matchStatus === 'matched').length,
    bankOnly: unmatchedBankLines.length,
    systemOnly: unmatchedSystemTxs.length,
    difference: reconciliation.difference || 0
  } : { matched: 0, bankOnly: 0, systemOnly: 0, difference: 0 };

  return (
    <div>
      {/* Selectors */}
      <div className="bg-white rounded-xl shadow-sm border p-4 mb-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <label htmlFor="f-14" className="text-sm font-medium text-gray-600">帳戶</label>
            <select id="f-14"
              value={selectedAccountId}
              onChange={e => setSelectedAccountId(e.target.value)}
              className="border rounded-lg px-3 py-1.5 text-sm min-w-[200px]"
            >
              <option value="">-- 選擇帳戶 --</option>
              {bankAccountsOnly.map(a => (
                <option key={a.id} value={a.id}>{a.name}{a.warehouse ? ` (${a.warehouse})` : ''}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor="f-40" className="text-sm font-medium text-gray-600">年份</label>
            <select id="f-40" value={acctYear} onChange={e => setAcctYear(parseInt(e.target.value))} className="border rounded-lg px-3 py-1.5 text-sm">
              {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor="f-34" className="text-sm font-medium text-gray-600">月份</label>
            <select id="f-34" value={acctMonth} onChange={e => setAcctMonth(parseInt(e.target.value))} className="border rounded-lg px-3 py-1.5 text-sm">
              {Array.from({ length: 12 }, (_, i) => i + 1).map(m => <option key={m} value={m}>{m} 月</option>)}
            </select>
          </div>
          {selectedAccountId && reconciliation && (
            <>
              <button
                onClick={() => setShowImportModal(true)}
                className="ml-auto px-4 py-1.5 bg-violet-600 text-white text-sm rounded-lg hover:bg-violet-700 transition-colors"
                disabled={reconciliation.status === 'confirmed'}
              >
                匯入 CSV
              </button>
              <button
                onClick={() => setShowAdjustModal(true)}
                className="px-4 py-1.5 bg-amber-500 text-white text-sm rounded-lg hover:bg-amber-600 transition-colors"
                disabled={reconciliation.status === 'confirmed'}
              >
                補建交易
              </button>
            </>
          )}
        </div>
      </div>

      {!selectedAccountId ? (
        <div className="text-center py-16 bg-white rounded-xl shadow-sm border">
          <svg className="w-12 h-12 mx-auto text-gray-300 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
          </svg>
          <p className="text-gray-400">請選擇帳戶以開始對帳</p>
        </div>
      ) : acctLoading ? (
        <div className="text-center py-12 text-gray-400">載入中...</div>
      ) : reconciliation ? (
        <>
          {/* Reconciliation Info Bar */}
          <div className="bg-white rounded-xl shadow-sm border p-4 mb-4">
            <div className="flex flex-wrap items-center gap-6 text-sm">
              <div>
                <span className="text-gray-500">對帳編號：</span>
                <span className="font-medium">{reconciliation.reconciliationNo}</span>
              </div>
              <div>
                <span className="text-gray-500">狀態：</span>
                <span className={`font-medium ${reconciliation.status === 'confirmed' ? 'text-green-600' : 'text-yellow-600'}`}>
                  {reconciliation.status === 'confirmed' ? '已確認' : '草稿'}
                </span>
              </div>
              <div>
                <span className="text-gray-500">期初餘額：</span>
                <span className="font-medium">${formatMoney(reconciliation.openingBalance)}</span>
              </div>
              <div>
                <span className="text-gray-500">系統期末餘額：</span>
                <span className="font-medium">${formatMoney(reconciliation.closingBalanceSystem)}</span>
              </div>
              {reconciliation.adjustmentCount > 0 && (
                <div>
                  <span className="text-gray-500">調整筆數：</span>
                  <span className="font-medium text-amber-600">{reconciliation.adjustmentCount}</span>
                </div>
              )}
            </div>
          </div>

          {/* Bank Balance Input */}
          <div className="bg-white rounded-xl shadow-sm border p-4 mb-4">
            <div className="flex flex-wrap items-end gap-4">
              <div>
                <label htmlFor="f-15" className="block text-sm font-medium text-gray-600 mb-1">銀行存簿期末餘額</label>
                <input id="f-15"
                  type="number"
                  value={bankBalanceInput}
                  onChange={e => setBankBalanceInput(e.target.value)}
                  className="border rounded-lg px-3 py-1.5 text-sm w-48"
                  placeholder="輸入銀行存簿金額"
                  disabled={reconciliation.status === 'confirmed'}
                />
              </div>
              <button
                onClick={updateBankBalance}
                className="px-4 py-1.5 bg-violet-600 text-white text-sm rounded-lg hover:bg-violet-700 disabled:opacity-50"
                disabled={reconciliation.status === 'confirmed'}
              >
                更新餘額
              </button>
              <div className="ml-auto flex items-center gap-4">
                <div className="text-right">
                  <div className="text-xs text-gray-500">差異金額</div>
                  <div className={`text-lg font-bold ${
                    reconciliation.difference === 0 ? 'text-green-600' : 'text-orange-600'
                  }`}>
                    ${formatMoney(reconciliation.difference)}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Three-column Match Layout */}
          <div className="grid grid-cols-1 lg:grid-cols-11 gap-3 mb-4">
            {/* Left: Bank Statement Lines */}
            <div className="lg:col-span-5 bg-white rounded-xl shadow-sm border overflow-hidden">
              <div className="px-4 py-3 bg-violet-50 border-b flex items-center justify-between">
                <h3 className="text-sm font-semibold text-violet-800">銀行對帳單明細</h3>
                <span className="text-xs text-violet-600">{bankLines.length} 筆</span>
              </div>
              <div className="overflow-auto max-h-[500px]">
                {bankLines.length === 0 ? (
                  <div className="text-center py-8 text-gray-400 text-sm">
                    尚無銀行明細，請匯入 CSV
                  </div>
                ) : (
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50 sticky top-0 z-10 sticky top-0">
                      <tr>
                        <th className="px-2 py-2 text-left">日期</th>
                        <th className="px-2 py-2 text-left">說明</th>
                        <th className="px-2 py-2 text-left min-w-[100px]">備註</th>
                        <th className="px-2 py-2 text-right">提款</th>
                        <th className="px-2 py-2 text-right">存入</th>
                        <th className="px-2 py-2 text-center">狀態</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bankLines.map(line => {
                        const isMatched = line.matchStatus === 'matched';
                        const isSelected = selectedBankLine === line.id;
                        return (
                          <tr
                            key={line.id}
                            className={`border-b cursor-pointer transition-colors ${
                              isMatched
                                ? 'bg-green-50 hover:bg-green-100'
                                : isSelected
                                  ? 'bg-violet-100'
                                  : 'bg-yellow-50 hover:bg-yellow-100'
                            }`}
                            onClick={() => {
                              if (!isMatched && reconciliation.status !== 'confirmed') {
                                setSelectedBankLine(isSelected ? null : line.id);
                              }
                            }}
                          >
                            <td className="px-2 py-1.5">{line.txDate}</td>
                            <td className="px-2 py-1.5 max-w-[120px] truncate" title={line.description}>
                              {line.description || '-'}
                            </td>
                            <td className="px-2 py-1.5 max-w-[160px] truncate text-gray-600" title={line.note || line.referenceNo || ''}>
                              {line.note || line.referenceNo || '—'}
                            </td>
                            <td className="px-2 py-1.5 text-right text-red-600">
                              {line.debitAmount > 0 ? formatMoney(line.debitAmount) : ''}
                            </td>
                            <td className="px-2 py-1.5 text-right text-green-600">
                              {line.creditAmount > 0 ? formatMoney(line.creditAmount) : ''}
                            </td>
                            <td className="px-2 py-1.5 text-center">
                              {isMatched ? (
                                <span className="inline-flex items-center gap-1">
                                  <span className="text-green-600">已配對</span>
                                  {reconciliation.status !== 'confirmed' && (
                                    <button
                                      onClick={(e) => { e.stopPropagation(); unmatchLine(line.id); }}
                                      className="text-red-400 hover:text-red-600 ml-1"
                                      title="取消配對"
                                    >
                                      x
                                    </button>
                                  )}
                                </span>
                              ) : (
                                <span className="text-yellow-600">未配對</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            {/* Center: Match Controls */}
            <div className="lg:col-span-1 flex flex-col items-center justify-center gap-3 py-4">
              <button
                onClick={matchPair}
                disabled={!selectedBankLine || !selectedSystemTx || reconciliation.status === 'confirmed'}
                className="p-2 bg-violet-600 text-white rounded-full hover:bg-violet-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                title="配對選取項目"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                </svg>
              </button>
              <div className="text-xs text-gray-400 text-center">
                {selectedBankLine && selectedSystemTx
                  ? '點擊配對'
                  : '選取兩側各一筆'}
              </div>
              <div className="w-px h-8 bg-gray-200" />
              <div className="text-center text-xs space-y-1">
                <div className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-green-500" />
                  <span className="text-gray-500">{summary.matched}</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-yellow-500" />
                  <span className="text-gray-500">{summary.bankOnly}</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-orange-500" />
                  <span className="text-gray-500">{summary.systemOnly}</span>
                </div>
              </div>
            </div>

            {/* Right: System Transactions */}
            <div className="lg:col-span-5 bg-white rounded-xl shadow-sm border overflow-hidden">
              <div className="px-4 py-3 bg-violet-50 border-b flex items-center justify-between">
                <h3 className="text-sm font-semibold text-violet-800">系統交易紀錄</h3>
                <span className="text-xs text-violet-600">{systemTxs.length} 筆</span>
              </div>
              <div className="overflow-auto max-h-[500px]">
                {systemTxs.length === 0 ? (
                  <div className="text-center py-8 text-gray-400 text-sm">
                    本月尚無系統交易
                  </div>
                ) : (
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50 sticky top-0 z-10 sticky top-0">
                      <tr>
                        <th className="px-2 py-2 text-left">日期</th>
                        <th className="px-2 py-2 text-left">說明</th>
                        <th className="px-2 py-2 text-center">類型</th>
                        <th className="px-2 py-2 text-right">金額</th>
                        <th className="px-2 py-2 text-center">狀態</th>
                      </tr>
                    </thead>
                    <tbody>
                      {systemTxs.map(tx => {
                        const isMatched = matchedTxIds.has(tx.id);
                        const isSelected = selectedSystemTx === tx.id;
                        return (
                          <tr
                            key={tx.id}
                            className={`border-b cursor-pointer transition-colors ${
                              isMatched
                                ? 'bg-green-50 hover:bg-green-100'
                                : isSelected
                                  ? 'bg-violet-100'
                                  : 'bg-orange-50 hover:bg-orange-100'
                            }`}
                            onClick={() => {
                              if (!isMatched && reconciliation.status !== 'confirmed') {
                                setSelectedSystemTx(isSelected ? null : tx.id);
                              }
                            }}
                          >
                            <td className="px-2 py-1.5">{tx.transactionDate}</td>
                            <td className="px-2 py-1.5 max-w-[140px] truncate" title={tx.description}>
                              {tx.description || tx.category?.name || '-'}
                            </td>
                            <td className="px-2 py-1.5 text-center">
                              <span className={`px-1.5 py-0.5 rounded text-xs ${
                                tx.type === '收入' ? 'bg-green-100 text-green-700'
                                  : tx.type === '支出' ? 'bg-red-100 text-red-700'
                                  : 'bg-blue-100 text-blue-700'
                              }`}>
                                {tx.type}
                              </span>
                            </td>
                            <td className={`px-2 py-1.5 text-right font-medium ${
                              tx.type === '收入' || tx.type === '移轉入' ? 'text-green-600' : 'text-red-600'
                            }`}>
                              {formatMoney(tx.amount)}
                            </td>
                            <td className="px-2 py-1.5 text-center">
                              {isMatched ? (
                                <span className="text-green-600">已配對</span>
                              ) : (
                                <span className="text-orange-600">未配對</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>

          {/* Summary Bar */}
          <div className="bg-white rounded-xl shadow-sm border p-4 mb-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex gap-6 text-sm">
                <span className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-green-500" />
                  已配對: <strong>{summary.matched}</strong>
                </span>
                <span className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-yellow-500" />
                  銀行獨有: <strong>{summary.bankOnly}</strong>
                </span>
                <span className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-orange-500" />
                  系統獨有: <strong>{summary.systemOnly}</strong>
                </span>
                <span className="flex items-center gap-2">
                  差異金額: <strong className={summary.difference === 0 ? 'text-green-600' : 'text-orange-600'}>
                    ${formatMoney(summary.difference)}
                  </strong>
                </span>
              </div>
              {reconciliation.status !== 'confirmed' && (
                <div className="flex items-center gap-3">
                  {reconciliation.difference !== 0 && (
                    <input
                      type="text"
                      value={diffExplained}
                      onChange={e => setDiffExplained(e.target.value)}
                      placeholder="差異說明（差異不為零時必填）"
                      className="border rounded-lg px-3 py-1.5 text-sm w-60"
                    />
                  )}
                  <button
                    onClick={confirmReconciliation}
                    className="px-6 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition-colors"
                  >
                    確認封存
                  </button>
                </div>
              )}
              {reconciliation.status === 'confirmed' && (
                <div className="flex items-center gap-2 text-sm text-green-600">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  已確認封存
                  {reconciliation.confirmedBy && <span>({reconciliation.confirmedBy})</span>}
                  {reconciliation.confirmedAt && (
                    <span className="text-gray-400 text-xs">
                      {new Date(reconciliation.confirmedAt).toLocaleDateString('zh-TW')}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        </>
      ) : null}

      {/* ======== MODAL: Import CSV ======== */}
      {showImportModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setShowImportModal(false)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-gray-800 mb-4">匯入銀行對帳單 (CSV / Excel / PDF)</h3>
            <div className="space-y-4">
              <div>
                <label htmlFor="f-26" className="block text-sm text-gray-600 mb-1">銀行格式</label>
                <select id="f-26"
                  value={selectedFormatId}
                  onChange={e => setSelectedFormatId(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                >
                  <option value="">-- 選擇格式 --</option>
                  {formats.map(f => (
                    <option key={f.id} value={f.id}>{f.bankName}{f.isBuiltIn ? ' (內建)' : ''}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">上傳對帳單檔案</label>
                <p className="text-xs text-gray-400 mb-2">
                  {selectedFormatId && ['土地', '世華', '國泰世華', '陽信', '兆豐', '玉山'].some(k => formats.find(f => String(f.id) === String(selectedFormatId))?.bankName?.includes(k)) ? (
                    <>已選銀行格式；兆豐、玉山請上傳 .xls/.xlsx，其餘支援 CSV 或 PDF（請先選格式再上傳）</>
                  ) : (
                    <>支援 CSV、Excel（.xls/.xlsx）或 PDF 格式；PDF 請先選擇對應銀行格式</>
                  )}
                </p>
                <input
                  type="file"
                  accept=".csv,.xls,.xlsx,.pdf"
                  onChange={handleFileUpload}
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                />
              </div>
              {importLines.length > 0 && (
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-sm text-gray-600 mb-2">預覽: 共 {importLines.length} 筆</p>
                  <div className="max-h-40 overflow-auto text-xs">
                    <table className="w-full">
                      <thead className="sticky top-0 z-10 bg-white">
                        <tr className="text-gray-500">
                          <th className="text-left py-1">日期</th>
                          <th className="text-left py-1">說明</th>
                          <th className="text-left py-1">備註</th>
                          <th className="text-right py-1">提款</th>
                          <th className="text-right py-1">存入</th>
                        </tr>
                      </thead>
                      <tbody>
                        {importLines.slice(0, 10).map((line, i) => (
                          <tr key={i} className="border-t">
                            <td className="py-1">{line.txDate}</td>
                            <td className="py-1 max-w-[100px] truncate" title={line.description}>{line.description}</td>
                            <td className="py-1 max-w-[120px] truncate text-gray-600" title={line.note || line.referenceNo}>{line.note || line.referenceNo || '—'}</td>
                            <td className="py-1 text-right text-red-600">{line.debitAmount !== '0' ? line.debitAmount : ''}</td>
                            <td className="py-1 text-right text-green-600">{line.creditAmount !== '0' ? line.creditAmount : ''}</td>
                          </tr>
                        ))}
                        {importLines.length > 10 && (
                          <tr><td colSpan={5} className="py-1 text-gray-400">...還有 {importLines.length - 10} 筆</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => { setShowImportModal(false); }}
                className="px-4 py-2 border text-gray-600 text-sm rounded-lg hover:bg-gray-50"
              >
                取消
              </button>
              <button
                onClick={submitImport}
                disabled={importLines.length === 0 || !selectedFormatId || importSubmitting}
                className="px-6 py-2 bg-violet-600 text-white text-sm rounded-lg hover:bg-violet-700 disabled:opacity-50"
              >
                {importSubmitting ? '匯入中…' : '確認匯入'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======== MODAL: Adjustment ======== */}
      {showAdjustModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setShowAdjustModal(false)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-gray-800 mb-4">補建調整交易</h3>
            <div className="space-y-4">
              <div>
                <label htmlFor="f-27" className="block text-sm text-gray-600 mb-1">金額</label>
                <input id="f-27"
                  type="number"
                  value={adjustForm.amount}
                  onChange={e => setAdjustForm({ ...adjustForm, amount: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                  placeholder="正數=收入，負數=支出"
                />
              </div>
              <div>
                <label htmlFor="f-28" className="block text-sm text-gray-600 mb-1">說明 *</label>
                <input id="f-28"
                  type="text"
                  value={adjustForm.description}
                  onChange={e => setAdjustForm({ ...adjustForm, description: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                  placeholder="例: 銀行手續費扣款"
                />
              </div>
              <div>
                <label htmlFor="f-29" className="block text-sm text-gray-600 mb-1">交易日期</label>
                <input id="f-29"
                  type="date"
                  value={adjustForm.transactionDate}
                  onChange={e => setAdjustForm({ ...adjustForm, transactionDate: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowAdjustModal(false)}
                className="px-4 py-2 border text-gray-600 text-sm rounded-lg hover:bg-gray-50"
              >
                取消
              </button>
              <button
                onClick={submitAdjustment}
                disabled={adjustmentSubmitting}
                className="px-6 py-2 bg-amber-500 text-white text-sm rounded-lg hover:bg-amber-600 disabled:opacity-50"
              >
                {adjustmentSubmitting ? '建立中…' : '建立調整'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
