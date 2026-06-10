'use client';

export default function ConfirmCommissionModal({
  showConfirmCommissionModal,
  setShowConfirmCommissionModal,
  selectedManualIds,
  setSelectedManualIds,
  confirmCommissionForm,
  setConfirmCommissionForm,
  manualAccounts,
  setError,
  setSuccess,
  fetchManualEntries,
}) {
  if (!showConfirmCommissionModal) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
        <h3 className="text-lg font-bold text-gray-800 mb-4">確認送出至現金流</h3>
        <p className="text-sm text-gray-600 mb-4">
          已選擇 <strong>{selectedManualIds.length}</strong> 筆代訂佣金記錄，確認後將自動建立現金流交易並影響存簿餘額。
        </p>
        <div className="space-y-3 text-sm">
          <div>
            <label htmlFor="f-7" className="block text-gray-600 mb-1">交易日期 *</label>
            <input id="f-7" type="date" value={confirmCommissionForm.transactionDate} onChange={e => setConfirmCommissionForm(f => ({ ...f, transactionDate: e.target.value }))} className="w-full border rounded px-3 py-2" />
          </div>
          <div>
            <label htmlFor="f-8" className="block text-gray-600 mb-1">存簿帳戶 *</label>
            <select id="f-8" value={confirmCommissionForm.accountId} onChange={e => setConfirmCommissionForm(f => ({ ...f, accountId: e.target.value }))} className="w-full border rounded px-3 py-2">
              <option value="">請選擇帳戶</option>
              {manualAccounts.map(a => (
                <option key={a.id} value={a.id}>{a.name}{a.warehouse ? ` (${a.warehouse})` : ''}</option>
              ))}
            </select>
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded p-3 text-xs text-amber-800">
            <p className="font-medium mb-1">送出後影響：</p>
            <ul className="list-disc list-inside space-y-0.5">
              <li>應付（AP）佣金 → 現金流「支出」，存簿餘額減少</li>
              <li>應收（AR）佣金 → 現金流「收入」，存簿餘額增加</li>
              <li>記錄狀態由「草稿」變更為「已送出」，不可再編輯</li>
            </ul>
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={() => setShowConfirmCommissionModal(false)} className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50">取消</button>
          <button type="button" disabled={!confirmCommissionForm.accountId || !confirmCommissionForm.transactionDate} onClick={async () => {
            try {
              const res = await fetch('/api/pms-income/monthly-manual-commission/confirm', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  entryIds: selectedManualIds,
                  accountId: parseInt(confirmCommissionForm.accountId),
                  transactionDate: confirmCommissionForm.transactionDate,
                }),
              });
              const result = await res.json();
              if (res.ok) {
                setShowConfirmCommissionModal(false);
                setSelectedManualIds([]);
                setSuccess(result.message || '已送出至現金流');
                fetchManualEntries();
              } else {
                setError(result.error?.message || '送出失敗');
              }
            } catch (e) { setError(e.message); }
          }} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium">確認送出</button>
        </div>
      </div>
    </div>
  );
}
