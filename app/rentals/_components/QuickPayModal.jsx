'use client';

const PAYMENT_METHODS = ['現金', 'transfer', '支票', '匯款'];

function fmt(n) {
  return Number(n || 0).toLocaleString('zh-TW');
}

export default function QuickPayModal({
  quickPayIncome,
  setQuickPayIncome,
  quickPayForm,
  setQuickPayForm,
  quickPaySaving,
  confirmQuickPay,
  accounts,
}) {
  if (!quickPayIncome) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setQuickPayIncome(null)}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
        <div className="p-6">
          <h3 className="text-lg font-bold text-gray-800 mb-4">確認收款</h3>
          {/* 唯讀資訊 */}
          <div className="bg-gray-50 rounded-lg p-3 mb-4 space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">物業</span>
              <span className="font-medium text-gray-800">{quickPayIncome.propertyName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">租客</span>
              <span className="font-medium text-gray-800">
                {quickPayIncome.tenantName || (quickPayIncome.tenant?.tenantType === 'company' ? quickPayIncome.tenant?.companyName : quickPayIncome.tenant?.fullName) || '—'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">聯絡電話</span>
              <span className="text-gray-700">{quickPayIncome.tenant?.phone || '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">租期</span>
              <span className="text-gray-700">{quickPayIncome.incomeYear}/{String(quickPayIncome.incomeMonth).padStart(2,'0')}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">應收金額</span>
              <span className="font-semibold text-gray-800">${fmt(quickPayIncome.expectedAmount)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">到期日</span>
              <span className="text-red-600 font-medium">{quickPayIncome.dueDate}</span>
            </div>
          </div>
          {/* 可編輯欄位 */}
          <div className="space-y-3">
            <div>
              <label htmlFor="f-30" className="text-sm text-gray-600">實收金額 *</label>
              <input id="f-30" type="number" min="0" value={quickPayForm.actualAmount}
                onChange={e => setQuickPayForm(f => ({ ...f, actualAmount: e.target.value }))}
                className="w-full border rounded px-3 py-2 text-sm" />
            </div>
            <div>
              <label htmlFor="f-31" className="text-sm text-gray-600">收款日期 *</label>
              <input id="f-31" type="date" value={quickPayForm.actualDate}
                onChange={e => setQuickPayForm(f => ({ ...f, actualDate: e.target.value }))}
                className="w-full border rounded px-3 py-2 text-sm" />
            </div>
            <div>
              <label htmlFor="f-32" className="text-sm text-gray-600">收款帳戶 *</label>
              <select id="f-32" value={quickPayForm.accountId}
                onChange={e => {
                  const acct = accounts.find(a => String(a.id) === e.target.value);
                  const autoMethod = acct?.type === '現金' ? '現金' : acct?.type === '銀行存款' ? '匯款' : null;
                  setQuickPayForm(f => ({ ...f, accountId: e.target.value, ...(autoMethod ? { paymentMethod: autoMethod } : {}) }));
                }}
                className="w-full border rounded px-3 py-2 text-sm">
                <option value="">-- 選擇帳戶 --</option>
                {accounts.filter(a => a.isActive !== false).map(a => <option key={a.id} value={String(a.id)}>{a.name}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="f-84" className="text-sm text-gray-600">付款方式</label>
              <select id="f-84" value={quickPayForm.paymentMethod}
                onChange={e => setQuickPayForm(f => ({ ...f, paymentMethod: e.target.value }))}
                className="w-full border rounded px-3 py-2 text-sm">
                {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m === 'transfer' ? '轉帳' : m}</option>)}
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-5">
            <button onClick={() => setQuickPayIncome(null)} className="px-4 py-2 text-sm bg-gray-200 rounded hover:bg-gray-300">取消</button>
            <button onClick={confirmQuickPay} disabled={quickPaySaving}
              className="px-4 py-2 text-sm bg-teal-600 text-white rounded hover:bg-teal-700 disabled:opacity-50">
              {quickPaySaving ? '處理中…' : '確認收款'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
