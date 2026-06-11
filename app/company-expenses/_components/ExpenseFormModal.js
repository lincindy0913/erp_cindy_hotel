'use client';

import { PERIODS, MATERIAL_TYPES } from '../_hooks/useCompanyExpenses';

export default function ExpenseFormModal({
  activeTab, editingRow, saving,
  expenseForm, setExpenseForm,
  invoiceForm, setInvoiceForm,
  suppliers, projects,
  onSave, onClose,
}) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onKeyDown={e => { if (e.key === 'Escape') onClose(); }}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
        onKeyDown={e => {
          if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA' && e.target.tagName !== 'SELECT' && !saving) onSave();
        }}>
        <div className="px-6 py-4 border-b">
          <h3 className="text-lg font-bold">
            {editingRow ? '編輯' : '新增'}
            {activeTab === 'expenses' ? '公司費用' : '工程進項'}
          </h3>
        </div>
        <div className="px-6 py-4 space-y-3">
          {activeTab === 'expenses' ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="f" className="text-xs text-gray-600">日期 *</label>
                  <input id="f" type="date" value={expenseForm.expenseDate}
                    onChange={e => setExpenseForm(f => ({ ...f, expenseDate: e.target.value }))}
                    className="w-full border rounded px-2 py-1.5 text-sm" />
                </div>
                <div>
                  <label htmlFor="f-2" className="text-xs text-gray-600">期間</label>
                  <select id="f-2" value={expenseForm.period}
                    onChange={e => setExpenseForm(f => ({ ...f, period: e.target.value }))}
                    className="w-full border rounded px-2 py-1.5 text-sm">
                    <option value="">—</option>
                    {PERIODS.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label htmlFor="f-exp-sup" className="text-xs text-gray-600">連結廠商主檔（選填）</label>
                <select id="f-exp-sup" value={expenseForm.supplierId}
                  onChange={e => {
                    const sup = suppliers.find(s => String(s.id) === e.target.value);
                    setExpenseForm(f => ({
                      ...f,
                      supplierId: e.target.value,
                      ...(sup ? { vendorName: sup.name, vendorTaxId: sup.taxId || f.vendorTaxId } : {}),
                    }));
                  }}
                  className="w-full border rounded px-2 py-1.5 text-sm">
                  <option value="">（不連結）</option>
                  {suppliers.map(s => <option key={s.id} value={String(s.id)}>{s.name}{s.taxId ? ` (${s.taxId})` : ''}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="f-18" className="text-xs text-gray-600">發票號碼</label>
                  <input id="f-18" value={expenseForm.invoiceNo}
                    onChange={e => setExpenseForm(f => ({ ...f, invoiceNo: e.target.value }))}
                    className="w-full border rounded px-2 py-1.5 text-sm" />
                </div>
                <div>
                  <label htmlFor="f-19" className="text-xs text-gray-600">廠商統編</label>
                  <input id="f-19" value={expenseForm.vendorTaxId}
                    onChange={e => setExpenseForm(f => ({ ...f, vendorTaxId: e.target.value }))}
                    className="w-full border rounded px-2 py-1.5 text-sm" />
                </div>
              </div>
              <div>
                <label htmlFor="f-3" className="text-xs text-gray-600">廠商名稱</label>
                <input id="f-3" value={expenseForm.vendorName}
                  onChange={e => setExpenseForm(f => ({ ...f, vendorName: e.target.value }))}
                  className="w-full border rounded px-2 py-1.5 text-sm" />
              </div>
              <div>
                <label htmlFor="f-4" className="text-xs text-gray-600">品名</label>
                <input id="f-4" value={expenseForm.itemName}
                  onChange={e => setExpenseForm(f => ({ ...f, itemName: e.target.value }))}
                  className="w-full border rounded px-2 py-1.5 text-sm" />
              </div>
              <div className="grid grid-cols-4 gap-2">
                <div>
                  <label htmlFor="f-5" className="text-xs text-gray-600">銷售額</label>
                  <input id="f-5" type="number" value={expenseForm.amount}
                    onChange={e => setExpenseForm(f => ({ ...f, amount: e.target.value }))}
                    className="w-full border rounded px-2 py-1.5 text-sm" />
                </div>
                <div>
                  <label htmlFor="f-6" className="text-xs text-gray-600">稅額</label>
                  <input id="f-6" type="number" value={expenseForm.taxAmount}
                    onChange={e => setExpenseForm(f => ({ ...f, taxAmount: e.target.value }))}
                    className="w-full border rounded px-2 py-1.5 text-sm" />
                </div>
                <div>
                  <label htmlFor="f-7" className="text-xs text-gray-600">其他費用</label>
                  <input id="f-7" type="number" value={expenseForm.otherAmount}
                    onChange={e => setExpenseForm(f => ({ ...f, otherAmount: e.target.value }))}
                    className="w-full border rounded px-2 py-1.5 text-sm" />
                </div>
                <div>
                  <label htmlFor="f-8" className="text-xs text-gray-600">總計</label>
                  <input id="f-8" type="number" value={expenseForm.totalAmount}
                    onChange={e => setExpenseForm(f => ({ ...f, totalAmount: e.target.value }))}
                    className="w-full border rounded px-2 py-1.5 text-sm" />
                </div>
              </div>
              <div>
                <label htmlFor="f-9" className="text-xs text-gray-600">備註</label>
                <input id="f-9" value={expenseForm.note}
                  onChange={e => setExpenseForm(f => ({ ...f, note: e.target.value }))}
                  className="w-full border rounded px-2 py-1.5 text-sm" />
              </div>
            </>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="f-10" className="text-xs text-gray-600">日期 *</label>
                  <input id="f-10" type="date" value={invoiceForm.invoiceDate}
                    onChange={e => setInvoiceForm(f => ({ ...f, invoiceDate: e.target.value }))}
                    className="w-full border rounded px-2 py-1.5 text-sm" />
                </div>
                <div>
                  <label htmlFor="f-11" className="text-xs text-gray-600">期間</label>
                  <select id="f-11" value={invoiceForm.period}
                    onChange={e => setInvoiceForm(f => ({ ...f, period: e.target.value }))}
                    className="w-full border rounded px-2 py-1.5 text-sm">
                    <option value="">—</option>
                    {PERIODS.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label htmlFor="f-inv-sup" className="text-xs text-gray-600">連結廠商主檔（選填）</label>
                <select id="f-inv-sup" value={invoiceForm.supplierId}
                  onChange={e => {
                    const sup = suppliers.find(s => String(s.id) === e.target.value);
                    setInvoiceForm(f => ({
                      ...f,
                      supplierId: e.target.value,
                      ...(sup ? { vendorName: sup.name, vendorTaxId: sup.taxId || f.vendorTaxId } : {}),
                    }));
                  }}
                  className="w-full border rounded px-2 py-1.5 text-sm">
                  <option value="">（不連結）</option>
                  {suppliers.map(s => <option key={s.id} value={String(s.id)}>{s.name}{s.taxId ? ` (${s.taxId})` : ''}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="f-20" className="text-xs text-gray-600">發票號碼</label>
                  <input id="f-20" value={invoiceForm.invoiceNo}
                    onChange={e => setInvoiceForm(f => ({ ...f, invoiceNo: e.target.value }))}
                    className="w-full border rounded px-2 py-1.5 text-sm" />
                </div>
                <div>
                  <label htmlFor="f-21" className="text-xs text-gray-600">廠商統編</label>
                  <input id="f-21" value={invoiceForm.vendorTaxId}
                    onChange={e => setInvoiceForm(f => ({ ...f, vendorTaxId: e.target.value }))}
                    className="w-full border rounded px-2 py-1.5 text-sm" />
                </div>
              </div>
              <div>
                <label htmlFor="f-12" className="text-xs text-gray-600">廠商名稱</label>
                <input id="f-12" value={invoiceForm.vendorName}
                  onChange={e => setInvoiceForm(f => ({ ...f, vendorName: e.target.value }))}
                  className="w-full border rounded px-2 py-1.5 text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="f-13" className="text-xs text-gray-600">材料別</label>
                  <select id="f-13" value={invoiceForm.materialType}
                    onChange={e => setInvoiceForm(f => ({ ...f, materialType: e.target.value }))}
                    className="w-full border rounded px-2 py-1.5 text-sm">
                    <option value="">—</option>
                    {MATERIAL_TYPES.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="f-22" className="text-xs text-gray-600">工程案</label>
                  <select id="f-22" value={invoiceForm.projectId}
                    onChange={e => setInvoiceForm(f => ({ ...f, projectId: e.target.value }))}
                    className="w-full border rounded px-2 py-1.5 text-sm">
                    <option value="">—</option>
                    {projects.map(p => <option key={p.id} value={String(p.id)}>{p.name}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label htmlFor="f-23" className="text-xs text-gray-600">材料名稱</label>
                <input id="f-23" value={invoiceForm.itemName}
                  onChange={e => setInvoiceForm(f => ({ ...f, itemName: e.target.value }))}
                  className="w-full border rounded px-2 py-1.5 text-sm" />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label htmlFor="f-24" className="text-xs text-gray-600">金額</label>
                  <input id="f-24" type="number" value={invoiceForm.amount}
                    onChange={e => setInvoiceForm(f => ({ ...f, amount: e.target.value }))}
                    className="w-full border rounded px-2 py-1.5 text-sm" />
                </div>
                <div>
                  <label htmlFor="f-14" className="text-xs text-gray-600">稅金</label>
                  <input id="f-14" type="number" value={invoiceForm.taxAmount}
                    onChange={e => setInvoiceForm(f => ({ ...f, taxAmount: e.target.value }))}
                    className="w-full border rounded px-2 py-1.5 text-sm" />
                </div>
                <div>
                  <label htmlFor="f-15" className="text-xs text-gray-600">總金額</label>
                  <input id="f-15" type="number" value={invoiceForm.totalAmount}
                    onChange={e => setInvoiceForm(f => ({ ...f, totalAmount: e.target.value }))}
                    className="w-full border rounded px-2 py-1.5 text-sm" />
                </div>
              </div>
              <div>
                <label htmlFor="f-16" className="text-xs text-gray-600">地點</label>
                <input id="f-16" value={invoiceForm.location}
                  onChange={e => setInvoiceForm(f => ({ ...f, location: e.target.value }))}
                  className="w-full border rounded px-2 py-1.5 text-sm" />
              </div>
              <div>
                <label htmlFor="f-17" className="text-xs text-gray-600">備註</label>
                <input id="f-17" value={invoiceForm.note}
                  onChange={e => setInvoiceForm(f => ({ ...f, note: e.target.value }))}
                  className="w-full border rounded px-2 py-1.5 text-sm" />
              </div>
            </>
          )}
        </div>
        <div className="px-6 py-4 border-t flex justify-end gap-2">
          <button onClick={onClose} disabled={saving}
            className="px-4 py-2 border rounded-lg text-sm">取消</button>
          <button onClick={onSave} disabled={saving}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm disabled:opacity-50">
            {saving ? '儲存中…' : '儲存'}
          </button>
        </div>
      </div>
    </div>
  );
}
