'use client';

function formatCurrency(val) {
  if (val === null || val === undefined) return '-';
  return Number(val).toLocaleString('zh-TW');
}

export default function ConfirmPaymentModal({
  confirmingRecord,
  confirmForm, setConfirmForm,
  accounts,
  onClose,
  onConfirm,
}) {
  const actualTotal = (parseFloat(confirmForm.actualPrincipal) || 0) + (parseFloat(confirmForm.actualInterest) || 0);
  const estTotal = confirmingRecord ? confirmingRecord.estimatedTotal : 0;
  const diff = estTotal - actualTotal;

  const deductAcctId = confirmingRecord?.deductAccountId || confirmingRecord?.loan?.deductAccountId;
  const deductAcct = accounts.find(a => a.id === deductAcctId);
  const acctBalance = deductAcct ? Number(deductAcct.currentBalance || 0) : 0;
  const balanceAfter = acctBalance - actualTotal;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="border-b px-6 py-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-gray-800">核實還款</h3>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
          </div>
          {confirmingRecord && (
            <p className="text-sm text-gray-500 mt-1">
              {confirmingRecord.loan?.loanName} - {confirmingRecord.recordYear}/{String(confirmingRecord.recordMonth).padStart(2, '0')}
            </p>
          )}
        </div>
        <div className="p-6 space-y-4">
          {confirmingRecord && (
            <div className="bg-gray-50 rounded-lg p-3 text-sm">
              <p className="text-gray-500 font-medium">暫估參考:</p>
              <div className="flex gap-4 mt-1">
                <span>本金: <b>{formatCurrency(confirmingRecord.estimatedPrincipal)}</b></span>
                <span>利息: <b>{formatCurrency(confirmingRecord.estimatedInterest)}</b></span>
                <span>合計: <b>{formatCurrency(confirmingRecord.estimatedTotal)}</b></span>
              </div>
            </div>
          )}

          {deductAcct && (
            <div className={`rounded-lg p-3 text-sm ${balanceAfter < 0 ? 'bg-red-50 border border-red-200' : 'bg-blue-50 border border-blue-200'}`}>
              <div className="flex items-center justify-between">
                <span className={balanceAfter < 0 ? 'text-red-700 font-medium' : 'text-blue-700 font-medium'}>
                  扣款帳戶: {deductAcct.name}
                </span>
                {balanceAfter < 0 && (
                  <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-700 border border-red-300">
                    餘額不足
                  </span>
                )}
              </div>
              <div className="flex gap-4 mt-1 text-xs">
                <span>目前餘額: <b className="font-mono">{formatCurrency(acctBalance)}</b></span>
                <span>核實後餘額: <b className={`font-mono ${balanceAfter < 0 ? 'text-red-600' : 'text-green-600'}`}>{formatCurrency(balanceAfter)}</b></span>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="f-19" className="block text-sm font-medium text-gray-700 mb-1">實際本金 *</label>
              <input id="f-19" type="number" value={confirmForm.actualPrincipal}
                onChange={e => setConfirmForm({ ...confirmForm, actualPrincipal: e.target.value })}
                className="w-full border rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label htmlFor="f-20" className="block text-sm font-medium text-gray-700 mb-1">實際利息 *</label>
              <input id="f-20" type="number" value={confirmForm.actualInterest}
                onChange={e => setConfirmForm({ ...confirmForm, actualInterest: e.target.value })}
                className="w-full border rounded-lg px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="rounded-lg p-3 bg-indigo-50 flex items-center justify-between">
            <div>
              <span className="text-sm text-gray-600">實際合計: </span>
              <span className="text-lg font-bold text-indigo-700">{formatCurrency(actualTotal)}</span>
            </div>
            {actualTotal > 0 && (
              <div className="text-right">
                <span className="text-xs text-gray-500">暫估差異: </span>
                <span className={`text-sm font-bold ${diff > 0 ? 'text-orange-600' : diff < 0 ? 'text-red-600' : 'text-gray-500'}`}>
                  {diff > 0 ? '+' : ''}{formatCurrency(diff)}
                </span>
                {diff !== 0 && (
                  <p className="text-xs text-gray-400 mt-0.5">
                    {diff > 0 ? '實際 < 暫估，帳戶留有餘額' : '實際 > 暫估，超出預期'}
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="f-21" className="block text-sm font-medium text-gray-700 mb-1">實際扣款日</label>
              <input id="f-21" type="date" value={confirmForm.actualDebitDate}
                onChange={e => setConfirmForm({ ...confirmForm, actualDebitDate: e.target.value })}
                className="w-full border rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label htmlFor="f-22" className="block text-sm font-medium text-gray-700 mb-1">對帳單號</label>
              <input id="f-22" type="text" value={confirmForm.statementNo}
                onChange={e => setConfirmForm({ ...confirmForm, statementNo: e.target.value })}
                className="w-full border rounded-lg px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div>
            <label htmlFor="f-23" className="block text-sm font-medium text-gray-700 mb-1">備註</label>
            <textarea id="f-23" value={confirmForm.note}
              onChange={e => setConfirmForm({ ...confirmForm, note: e.target.value })}
              className="w-full border rounded-lg px-3 py-2 text-sm" rows={2}
            />
          </div>
        </div>
        <div className="bg-gray-50 border-t px-6 py-4 rounded-b-2xl flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-gray-600 hover:text-gray-800 text-sm">
            取消
          </button>
          <button onClick={onConfirm} className="bg-green-600 text-white px-6 py-2 rounded-lg text-sm hover:bg-green-700 transition-colors">
            確認核實
          </button>
        </div>
      </div>
    </div>
  );
}
