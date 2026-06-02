'use client';

export default function FinanceSection({
  taxRate,
  setTaxRate,
  saving,
  saveTaxRate,
  invoiceTitles,
  newInvoiceTitle,
  setNewInvoiceTitle,
  newInvoiceTaxId,
  setNewInvoiceTaxId,
  addInvoiceTitle,
  deleteInvoiceTitle,
  paymentMethods,
  newPaymentMethod,
  setNewPaymentMethod,
  addPaymentMethod,
  deletePaymentMethod,
  auditInfo,
}) {
  function renderAuditTrail(sectionKey) {
    const info = auditInfo[sectionKey];
    if (!info) return null;
    return (
      <div className="mt-6 pt-4 border-t border-gray-100">
        <p className="text-xs text-gray-400">
          最後修改：{info.email} 於 {new Date(info.updatedAt).toLocaleString('zh-TW')}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Tax Rate */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-700 mb-4">稅率設定</h3>
        <div className="flex items-center gap-4">
          <label htmlFor="f-2" className="text-sm text-gray-600 whitespace-nowrap">預設稅率 (%)</label>
          <input id="f-2"
            type="number"
            min="0"
            max="100"
            step="0.1"
            value={taxRate}
            onChange={e => setTaxRate(e.target.value)}
            className="w-32 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-400 focus:border-gray-400 text-sm"
          />
          <button
            onClick={saveTaxRate}
            disabled={saving}
            className="px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-800 disabled:opacity-50 text-sm font-medium transition-colors"
          >
            {saving ? '儲存中...' : '儲存'}
          </button>
        </div>
        <p className="text-xs text-gray-400 mt-2">此稅率將作為開立發票時的預設值</p>
      </div>

      {/* Invoice Titles */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-700 mb-4">發票抬頭管理</h3>
        <div className="flex items-center gap-3 mb-4">
          <input
            type="text"
            value={newInvoiceTitle}
            onChange={e => setNewInvoiceTitle(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addInvoiceTitle()}
            placeholder="發票抬頭名稱..."
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-400 focus:border-gray-400 text-sm"
          />
          <input
            type="text"
            value={newInvoiceTaxId}
            onChange={e => setNewInvoiceTaxId(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addInvoiceTitle()}
            placeholder="統一編號（選填）"
            className="w-40 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-400 focus:border-gray-400 text-sm"
          />
          <button
            onClick={addInvoiceTitle}
            className="px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-800 text-sm font-medium transition-colors"
          >
            新增
          </button>
        </div>
        {invoiceTitles.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">尚未設定發票抬頭</p>
        ) : (
          <div className="space-y-2">
            {invoiceTitles.map((item) => (
              <div key={item.id} className="flex items-center justify-between px-4 py-3 bg-gray-50 rounded-lg border border-gray-100">
                <div>
                  <span className="text-sm text-gray-700 font-medium">{item.title}</span>
                  {item.taxId && <span className="text-xs text-gray-400 ml-2">({item.taxId})</span>}
                </div>
                <button
                  onClick={() => deleteInvoiceTitle(item.id)}
                  className="text-red-500 hover:text-red-700 text-sm font-medium transition-colors"
                >
                  刪除
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Payment Methods */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-700 mb-4">付款方式管理</h3>
        <div className="flex items-center gap-3 mb-4">
          <input
            type="text"
            value={newPaymentMethod}
            onChange={e => setNewPaymentMethod(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addPaymentMethod()}
            placeholder="輸入付款方式名稱..."
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-400 focus:border-gray-400 text-sm"
          />
          <button
            onClick={addPaymentMethod}
            className="px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-800 text-sm font-medium transition-colors"
          >
            新增
          </button>
        </div>
        {paymentMethods.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">尚未設定付款方式</p>
        ) : (
          <div className="space-y-2">
            {paymentMethods.map((item) => (
              <div key={item.id} className="flex items-center justify-between px-4 py-3 bg-gray-50 rounded-lg border border-gray-100">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-700">{item.name}</span>
                  {item.isDefault && (
                    <span className="text-xs bg-gray-200 text-gray-600 px-2 py-0.5 rounded-full">預設</span>
                  )}
                </div>
                {!item.isDefault && (
                  <button
                    onClick={() => deletePaymentMethod(item.id)}
                    className="text-red-500 hover:text-red-700 text-sm font-medium transition-colors"
                  >
                    刪除
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
      {renderAuditTrail('finance')}
    </div>
  );
}
