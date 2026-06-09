'use client';

function formatCurrency(val) {
  if (val === null || val === undefined) return '-';
  return Number(val).toLocaleString('zh-TW');
}

export default function BatchModal({
  loans,
  monthlyYear,
  monthlyMonth,
  batchLoanIds, setBatchLoanIds,
  toggleBatchLoan,
  onClose,
  onExecute,
}) {
  const activeLoansForBatch = loans.filter(l => l.status === '使用中');
  const allSelected = activeLoansForBatch.length > 0 && activeLoansForBatch.every(l => batchLoanIds.includes(l.id));

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b px-6 py-4 rounded-t-2xl">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-gray-800">批次建立並推送出納</h3>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            為 {monthlyYear}年{monthlyMonth}月 批次建立暫估記錄並自動推送至出納
          </p>
        </div>
        <div className="p-6">
          <div className="mb-4">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={() => {
                  if (allSelected) {
                    setBatchLoanIds([]);
                  } else {
                    setBatchLoanIds(activeLoansForBatch.map(l => l.id));
                  }
                }}
                className="rounded"
              />
              <span className="font-medium">全選 ({activeLoansForBatch.length} 筆)</span>
            </label>
          </div>
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {activeLoansForBatch.map(loan => (
              <label key={loan.id} className="flex items-center gap-3 p-2 rounded hover:bg-gray-50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={batchLoanIds.includes(loan.id)}
                  onChange={() => toggleBatchLoan(loan.id)}
                  className="rounded"
                />
                <div className="flex-1">
                  <div className="text-sm font-medium">{loan.loanName}</div>
                  <div className="text-xs text-gray-400">{loan.loanCode} | {loan.bankName} | 餘額: {formatCurrency(loan.currentBalance)}</div>
                </div>
              </label>
            ))}
          </div>
        </div>
        <div className="sticky bottom-0 bg-gray-50 border-t px-6 py-4 rounded-b-2xl flex justify-between items-center">
          <span className="text-sm text-gray-500">已選 {batchLoanIds.length} 筆</span>
          <div className="flex gap-3">
            <button onClick={onClose} className="px-4 py-2 text-gray-600 hover:text-gray-800 text-sm">
              取消
            </button>
            <button onClick={onExecute} className="bg-indigo-600 text-white px-6 py-2 rounded-lg text-sm hover:bg-indigo-700 transition-colors">
              建立並推送出納
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
