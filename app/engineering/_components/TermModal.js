'use client';

export default function TermModal({
  showTermModal,
  editingTerm,
  termForm,
  setTermForm,
  termSaving,
  isAdminOrManager,
  onClose,
  onSave,
}) {
  if (!showTermModal || !editingTerm) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full mx-4 p-6" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-bold mb-4">{termForm.status === 'paid' ? '標記期數已付款' : '取消付款標記'}</h3>

        {/* 手動標記警示 */}
        {termForm.status === 'paid' && (() => {
          const hasExec = editingTerm?.hasExecutedPO;
          if (hasExec) {
            return (
              <div className="mb-4 p-3 bg-green-50 border border-green-300 rounded-lg">
                <p className="text-xs font-semibold text-green-800 mb-1">✓ 已有出納執行記錄</p>
                <p className="text-xs text-green-700">此期數已有對應付款單執行記錄，可直接標記已付。</p>
              </div>
            );
          }
          if (!isAdminOrManager) {
            return (
              <div className="mb-4 p-3 bg-red-50 border border-red-300 rounded-lg">
                <p className="text-xs font-semibold text-red-800 mb-1">⛔ 此期數尚無出納執行記錄</p>
                <p className="text-xs text-red-700">
                  帳外標記需管理員權限。請先建立付款單並透過出納執行付款，
                  完成後系統會自動核銷，或請管理員協助帳外標記。
                </p>
              </div>
            );
          }
          return (
            <div className="mb-4 p-3 bg-amber-50 border border-amber-300 rounded-lg">
              <p className="text-xs font-semibold text-amber-800 mb-1">⚠ 帳外付款（管理員）</p>
              <p className="text-xs text-amber-700">
                此期數尚無出納執行記錄，帳外付款說明為必填，將寫入稽核日誌，不可逆、可查詢。
                正常流程：建立付款單 → 出納執行 → 期數自動核銷。
              </p>
            </div>
          );
        })()}

        <div className="space-y-3">
          <div><label htmlFor="f-59" className="block text-xs text-gray-500 mb-1">期別</label><input id="f-59" value={termForm.termName} onChange={e => setTermForm(f => ({ ...f, termName: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" disabled={termForm.status === 'pending'} /></div>
          <div><label htmlFor="f-60" className="block text-xs text-gray-500 mb-1">金額</label><input id="f-60" type="number" value={termForm.amount} onChange={e => setTermForm(f => ({ ...f, amount: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" step="0.01" disabled={termForm.status === 'pending'} /></div>
          <div><label htmlFor="f-61" className="block text-xs text-gray-500 mb-1">到期日</label><input id="f-61" type="date" value={termForm.dueDate} onChange={e => setTermForm(f => ({ ...f, dueDate: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
          <div><label htmlFor="f-62" className="block text-xs text-gray-500 mb-1">內容</label><input id="f-62" value={termForm.content || ''} onChange={e => setTermForm(f => ({ ...f, content: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="付款內容" /></div>
          {termForm.status === 'paid' && (<>
            <div><label htmlFor="f-63" className="block text-xs text-gray-500 mb-1">付款日期</label><input id="f-63" type="date" value={termForm.paidAt} onChange={e => setTermForm(f => ({ ...f, paidAt: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
            {isAdminOrManager && !editingTerm?.hasExecutedPO && (
              <div>
                <label htmlFor="f-manual-note" className="block text-xs text-gray-500 mb-1">
                  帳外付款說明
                  <span className="ml-1 text-red-600 font-medium">（必填）</span>
                </label>
                <input
                  id="f-manual-note"
                  value={termForm.manualNote || ''}
                  onChange={e => setTermForm(f => ({ ...f, manualNote: e.target.value }))}
                  className="w-full border border-amber-300 rounded-lg px-3 py-2 text-sm focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
                  placeholder="例：現金直付廠商、銀行匯款已完成但未建付款單…"
                />
              </div>
            )}
            <div><label htmlFor="id" className="block text-xs text-gray-500 mb-1">關聯付款單 ID（選填）</label><input id="id" type="number" value={termForm.paymentOrderId} onChange={e => setTermForm(f => ({ ...f, paymentOrderId: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
          </>)}
          {termForm.status === 'pending' && <p className="text-sm text-gray-600 bg-yellow-50 p-3 rounded-lg">取消此期的付款標記後，合約狀態也會同步更新為「進行中」</p>}
          <div><label htmlFor="f-64" className="block text-xs text-gray-500 mb-1">備註</label><input id="f-64" value={termForm.note} onChange={e => setTermForm(f => ({ ...f, note: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="px-4 py-2 border rounded-lg text-sm" disabled={termSaving}>取消</button>
          <button
            onClick={onSave}
            disabled={termSaving || (termForm.status === 'paid' && !editingTerm?.hasExecutedPO && !isAdminOrManager)}
            title={termForm.status === 'paid' && !editingTerm?.hasExecutedPO && !isAdminOrManager ? '帳外標記需管理員權限' : undefined}
            className={`px-4 py-2 rounded-lg text-sm text-white disabled:opacity-50 ${termForm.status === 'pending' ? 'bg-red-600 hover:bg-red-700' : 'bg-amber-600 hover:bg-amber-700'}`}
          >
            {termSaving ? '儲存中…' : (termForm.status === 'pending' ? '確認取消付款' : '儲存')}
          </button>
        </div>
      </div>
    </div>
  );
}
