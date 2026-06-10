'use client';

export default function TaxModal({
  showTaxModal, setShowTaxModal,
  editingTax, setEditingTax,
  taxForm, setTaxForm,
  taxSaving, saveTax,
  properties,
}) {
  if (!showTaxModal) return null;

  function close() { setShowTaxModal(false); setEditingTax(null); }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={close}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
        <div className="p-6">
          <h3 className="text-lg font-bold text-gray-800 mb-4">{editingTax ? '編輯稅款' : '新增稅款'}</h3>
          <div className="space-y-3">
            <div>
              <label htmlFor="f-52" className="text-sm text-gray-600">物業 *</label>
              <select id="f-52" value={taxForm.propertyId} onChange={e => setTaxForm(f => ({ ...f, propertyId: e.target.value }))}
                className="w-full border rounded px-3 py-2 text-sm" disabled={!!editingTax}>
                <option value="">選擇物業</option>
                {properties.map(p => {
                  const flags = [];
                  if (p.asset?.hasHouseTax) flags.push('房屋稅');
                  if (p.asset?.hasLandTax)  flags.push('地價稅');
                  const suffix = flags.length > 0 ? ` [${flags.join('·')}]` : '';
                  return <option key={p.id} value={p.id}>{p.name}{suffix}</option>;
                })}
              </select>
            </div>
            <div>
              <label htmlFor="f-88" className="text-sm text-gray-600">年度 *</label>
              <input id="f-88" type="number" value={taxForm.taxYear} onChange={e => setTaxForm(f => ({ ...f, taxYear: e.target.value }))}
                className="w-full border rounded px-3 py-2 text-sm" disabled={!!editingTax} />
            </div>
            <div>
              <label htmlFor="f-89" className="text-sm text-gray-600">稅種 *</label>
              <select id="f-89" value={taxForm.taxType} onChange={e => setTaxForm(f => ({ ...f, taxType: e.target.value }))}
                className="w-full border rounded px-3 py-2 text-sm" disabled={editingTax?.status === 'paid'}>
                <option value="房屋稅">房屋稅</option>
                <option value="地價稅">地價稅</option>
                <option value="土地增值稅">土地增值稅</option>
                <option value="其他">其他</option>
              </select>
            </div>
            <div>
              <label htmlFor="f-53" className="text-sm text-gray-600">應繳到期日 *</label>
              <input id="f-53" type="date" value={taxForm.dueDate} onChange={e => setTaxForm(f => ({ ...f, dueDate: e.target.value }))}
                className="w-full border rounded px-3 py-2 text-sm" disabled={editingTax?.status === 'paid'} />
            </div>
            <div>
              <label htmlFor="f-54" className="text-sm text-gray-600">金額 *</label>
              <input id="f-54" type="number" value={taxForm.amount} onChange={e => setTaxForm(f => ({ ...f, amount: e.target.value }))}
                className="w-full border rounded px-3 py-2 text-sm" disabled={editingTax?.status === 'paid'} />
            </div>
            <div className="border-t pt-3">
              <p className="text-xs text-gray-500 mb-2">繳款憑證（已繳後填寫，供對帳用）</p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label htmlFor="f-55" className="text-xs text-gray-600">實際繳款日</label>
                  <input id="f-55" type="date" value={taxForm.paidDate} onChange={e => setTaxForm(f => ({ ...f, paidDate: e.target.value }))}
                    className="w-full border rounded px-2 py-1.5 text-sm mt-1" />
                </div>
                <div>
                  <label htmlFor="f-56" className="text-xs text-gray-600">繳款憑證號</label>
                  <input id="f-56" type="text" value={taxForm.certNo} onChange={e => setTaxForm(f => ({ ...f, certNo: e.target.value }))}
                    placeholder="e.g. 2026050100001" className="w-full border rounded px-2 py-1.5 text-sm mt-1" />
                </div>
              </div>
            </div>
            <div>
              <label htmlFor="f-57" className="text-sm text-gray-600">備註</label>
              <textarea id="f-57" value={taxForm.note} onChange={e => setTaxForm(f => ({ ...f, note: e.target.value }))}
                rows={2} placeholder="繳款方式、代繳機構…" className="w-full border rounded px-3 py-2 text-sm mt-1" />
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-6">
            <button onClick={close} className="px-4 py-2 text-sm bg-gray-200 rounded hover:bg-gray-300">取消</button>
            <button onClick={saveTax} disabled={taxSaving}
              className="px-4 py-2 text-sm bg-teal-600 text-white rounded hover:bg-teal-700 disabled:opacity-50">
              {taxSaving ? '儲存中…' : '儲存'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
