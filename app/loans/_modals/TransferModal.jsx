'use client';

function formatCurrency(val) {
  if (val === null || val === undefined) return '-';
  return Number(val).toLocaleString('zh-TW');
}

export default function TransferModal({
  accounts,
  transferForm, setTransferForm,
  transferTargetAccount,
  transfering,
  onClose,
  onExecute,
}) {
  const sourceAcct = accounts.find(a => a.id === parseInt(transferForm.sourceAccountId));
  const sourceBalance = sourceAcct ? Number(sourceAcct.currentBalance || 0) : 0;
  const transferAmt = parseFloat(transferForm.amount) || 0;
  const sourceAfter = sourceBalance - transferAmt;
  const targetBalance = transferTargetAccount ? Number(transferTargetAccount.currentBalance || 0) : 0;
  const targetAfter = targetBalance + transferAmt;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
        <div className="border-b px-6 py-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-gray-800">快速預存款</h3>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
          </div>
          {transferTargetAccount && (
            <p className="text-sm text-gray-500 mt-1">
              移轉資金至：<b>{transferTargetAccount.name}</b>（目前餘額: {formatCurrency(targetBalance)}）
            </p>
          )}
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label htmlFor="f-24" className="block text-sm font-medium text-gray-700 mb-1">來源帳戶 *</label>
            <select id="f-24"
              value={transferForm.sourceAccountId}
              onChange={e => setTransferForm({ ...transferForm, sourceAccountId: e.target.value })}
              className="w-full border rounded-lg px-3 py-2 text-sm"
            >
              <option value="">請選擇來源帳戶</option>
              {accounts.filter(a => a.isActive && a.id !== transferTargetAccount?.id).map(a => (
                <option key={a.id} value={a.id}>
                  {a.name} ({a.type}) — 餘額: {formatCurrency(Number(a.currentBalance || 0))}
                </option>
              ))}
            </select>
          </div>

          {sourceAcct && (
            <div className={`rounded-lg p-3 text-xs ${sourceAfter < 0 ? 'bg-red-50 border border-red-200' : 'bg-gray-50'}`}>
              <div className="flex justify-between">
                <span className="text-gray-500">來源帳戶餘額</span>
                <span className="font-mono font-bold">{formatCurrency(sourceBalance)}</span>
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-gray-500">移轉後餘額</span>
                <span className={`font-mono font-bold ${sourceAfter < 0 ? 'text-red-600' : 'text-green-600'}`}>
                  {formatCurrency(sourceAfter)}
                </span>
              </div>
              {sourceAfter < 0 && (
                <p className="text-red-600 font-medium mt-1">來源帳戶餘額不足</p>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="f-25" className="block text-sm font-medium text-gray-700 mb-1">移轉金額 *</label>
              <input id="f-25" type="number" value={transferForm.amount}
                onChange={e => setTransferForm({ ...transferForm, amount: e.target.value })}
                className="w-full border rounded-lg px-3 py-2 text-sm" min="0"
              />
            </div>
            <div>
              <label htmlFor="f-26" className="block text-sm font-medium text-gray-700 mb-1">交易日期</label>
              <input id="f-26" type="date" value={transferForm.transactionDate}
                onChange={e => setTransferForm({ ...transferForm, transactionDate: e.target.value })}
                className="w-full border rounded-lg px-3 py-2 text-sm"
              />
            </div>
          </div>

          {transferAmt > 0 && transferTargetAccount && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-xs">
              <div className="flex justify-between">
                <span className="text-gray-600">目的帳戶移轉後餘額</span>
                <span className="font-mono font-bold text-green-700">{formatCurrency(targetAfter)}</span>
              </div>
            </div>
          )}

          <div>
            <label htmlFor="f-27" className="block text-sm font-medium text-gray-700 mb-1">說明</label>
            <input id="f-27" type="text" value={transferForm.description}
              onChange={e => setTransferForm({ ...transferForm, description: e.target.value })}
              className="w-full border rounded-lg px-3 py-2 text-sm"
            />
          </div>
        </div>
        <div className="bg-gray-50 border-t px-6 py-4 rounded-b-2xl flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-gray-600 hover:text-gray-800 text-sm">
            取消
          </button>
          <button onClick={onExecute} disabled={transfering}
            className="bg-indigo-600 text-white px-6 py-2 rounded-lg text-sm hover:bg-indigo-700 transition-colors disabled:opacity-50"
          >
            {transfering ? '處理中...' : '確認移轉'}
          </button>
        </div>
      </div>
    </div>
  );
}
