'use client';

import { getTenantDisplayName } from '../_lib/rentalHelpers';

function fmt(n) {
  return Number(n || 0).toLocaleString('zh-TW');
}

export default function RentFilingModal({
  showRentFilingModal,
  setShowRentFilingModal,
  editingRentFiling,
  rentFilingYear,
  rentFilingForm,
  setRentFilingForm,
  rentFilingSaving,
  saveRentFilingFromModal,
  properties,
  contracts,
}) {
  if (!showRentFilingModal) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowRentFilingModal(false)}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="p-6">
          <h3 className="text-lg font-bold text-gray-800 mb-4">{editingRentFiling ? '編輯申報列' : '新增申報列'}（{rentFilingYear} 年）</h3>
          <div className="space-y-3 text-sm">
            <div>
              <label htmlFor="f-33" className="text-gray-600">物業 *</label>
              <select id="f-33" value={rentFilingForm.propertyId} disabled={!!editingRentFiling}
                onChange={(e) => setRentFilingForm((f) => ({ ...f, propertyId: e.target.value, contractId: '' }))}
                className="w-full border rounded px-3 py-2 mt-1">
                <option value="">選擇物業</option>
                {properties.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}{p.address ? ` · ${p.address}` : ''}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="f-98" className="text-gray-600">綁定租約（同址多公司時建議指定）</label>
              <select id="f-98" value={rentFilingForm.contractId} onChange={(e) => setRentFilingForm((f) => ({ ...f, contractId: e.target.value }))}
                className="w-full border rounded px-3 py-2 mt-1">
                <option value="">不指定（合計該物業全部實收）</option>
                {contracts.filter((c) => !rentFilingForm.propertyId || String(c.propertyId) === rentFilingForm.propertyId).map((c) => (
                  <option key={c.id} value={c.id}>{c.contractNo} · {getTenantDisplayName(c.tenant)}{c.monthlyRent != null ? ` · NT$${fmt(c.monthlyRent)}` : ''}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="f-99" className="text-gray-600">承租人／公司抬頭（手動註記）</label>
              <input id="f-99" type="text" value={rentFilingForm.lesseeDisplayName} onChange={(e) => setRentFilingForm((f) => ({ ...f, lesseeDisplayName: e.target.value }))}
                className="w-full border rounded px-3 py-2 mt-1" placeholder="例：OO股份有限公司" />
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={rentFilingForm.isPublicInterest} onChange={(e) => setRentFilingForm((f) => ({ ...f, isPublicInterest: e.target.checked }))} />
              <span>公益出租人（房屋稅／申報類型註記）</span>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="f-34" className="text-gray-600">申報月租</label>
                <input id="f-34" type="number" min="0" value={rentFilingForm.declaredMonthlyRent} onChange={(e) => setRentFilingForm((f) => ({ ...f, declaredMonthlyRent: e.target.value }))}
                  className="w-full border rounded px-3 py-2 mt-1 text-right" />
              </div>
              <div>
                <label htmlFor="f-35" className="text-gray-600">申報月數</label>
                <input id="f-35" type="number" min="1" max="12" value={rentFilingForm.monthsInScope} onChange={(e) => setRentFilingForm((f) => ({ ...f, monthsInScope: e.target.value }))}
                  className="w-full border rounded px-3 py-2 mt-1 text-right" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label htmlFor="f-36" className="text-gray-600">全年申報金額</label>
                  <div className="flex items-center gap-1.5">
                    {editingRentFiling?.actualAnnualIncome > 0 && (
                      <span className="text-xs text-indigo-600">
                        系統實收 ${Number(editingRentFiling.actualAnnualIncome).toLocaleString('zh-TW')}
                      </span>
                    )}
                    {editingRentFiling?.actualAnnualIncome > 0 && (
                      <button type="button"
                        onClick={() => setRentFilingForm((f) => ({ ...f, declaredAnnualIncome: String(editingRentFiling.actualAnnualIncome) }))}
                        className="text-xs px-1.5 py-0.5 border border-indigo-300 text-indigo-600 rounded hover:bg-indigo-50">
                        帶入
                      </button>
                    )}
                    {rentFilingForm.declaredMonthlyRent && rentFilingForm.monthsInScope && (
                      <button type="button"
                        onClick={() => setRentFilingForm((f) => ({ ...f, declaredAnnualIncome: String(Math.round(Number(f.declaredMonthlyRent) * Number(f.monthsInScope))) }))}
                        className="text-xs px-1.5 py-0.5 border border-gray-300 text-gray-600 rounded hover:bg-gray-50">
                        月租×月數
                      </button>
                    )}
                  </div>
                </div>
                <input id="f-36" type="number" min="0" value={rentFilingForm.declaredAnnualIncome} onChange={(e) => setRentFilingForm((f) => ({ ...f, declaredAnnualIncome: e.target.value }))}
                  className="w-full border rounded px-3 py-2 text-right" />
              </div>
              <div>
                <label htmlFor="f-37" className="text-gray-600">預估房屋稅</label>
                <input id="f-37" type="number" min="0" value={rentFilingForm.estimatedHouseTax} onChange={(e) => setRentFilingForm((f) => ({ ...f, estimatedHouseTax: e.target.value }))}
                  className="w-full border rounded px-3 py-2 mt-1 text-right" placeholder="公益與一般稅率不同" />
              </div>
            </div>
            <div>
              <label htmlFor="f-38" className="text-gray-600">狀態</label>
              <select id="f-38" value={rentFilingForm.status} onChange={(e) => setRentFilingForm((f) => ({ ...f, status: e.target.value }))}
                className="w-full border rounded px-3 py-2 mt-1">
                <option value="draft">草稿</option>
                <option value="filed">已報稅</option>
                <option value="confirmed">已定稿</option>
              </select>
            </div>
            <div>
              <label htmlFor="f-39" className="text-gray-600">備註</label>
              <textarea id="f-39" value={rentFilingForm.note} onChange={(e) => setRentFilingForm((f) => ({ ...f, note: e.target.value }))} rows={2} className="w-full border rounded px-3 py-2 mt-1" />
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-6">
            <button type="button" onClick={() => setShowRentFilingModal(false)} className="px-4 py-2 text-sm bg-gray-200 rounded hover:bg-gray-300">取消</button>
            <button type="button" onClick={() => saveRentFilingFromModal()} disabled={rentFilingSaving} className="px-4 py-2 text-sm bg-teal-600 text-white rounded hover:bg-teal-700 disabled:opacity-50">{rentFilingSaving ? '儲存中…' : '儲存'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
