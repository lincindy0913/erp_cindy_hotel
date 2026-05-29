'use client';

import { CONTRACT_STATUSES, getTenantDisplayName } from '../_lib/rentalHelpers';

export default function ContractModal({
  editingContract,
  contractForm, setContractForm,
  contractSaving,
  saveContract,
  onClose,
  renewingFromContract,
  properties,
  tenants,
  accounts,
  accountingSubjects,
}) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="p-6">
          <h3 className="text-lg font-bold text-gray-800 mb-4">
            {renewingFromContract ? '續約' : editingContract ? '編輯合約' : '新增合約'}
          </h3>
          <div className="grid grid-cols-2 gap-3">
            {renewingFromContract && (
              <div className="col-span-2 bg-teal-50 border border-teal-200 rounded-lg px-3 py-2 text-sm text-teal-800">
                <span className="font-medium">續約自：</span>
                {renewingFromContract.contractNo}（{renewingFromContract.propertyName} · {renewingFromContract.tenantName}，舊月租 NT${Number(renewingFromContract.monthlyRent).toLocaleString()}）
              </div>
            )}
            <div>
              <label htmlFor="f" className="text-sm text-gray-600">物業 *</label>
              <select id="f" value={contractForm.propertyId} onChange={e => {
                const pid = e.target.value;
                const prop = properties.find(p => String(p.id) === pid);
                setContractForm(f => ({ ...f, propertyId: pid, category: f.category || (prop?.category || '') }));
              }}
                className="w-full border rounded px-3 py-2 text-sm">
                <option value="">選擇物業</option>
                {properties.map(p => {
                  const isOccupied = (p.currentContractStatus === 'active' || p.currentContractStatus === 'pending')
                    && String(p.id) !== String(contractForm.propertyId);
                  return <option key={p.id} value={p.id} disabled={isOccupied}>{p.name}{isOccupied ? ' （已出租）' : ''}</option>;
                })}
              </select>
            </div>
            <div>
              <label htmlFor="f-7" className="text-sm text-gray-600">租客 *</label>
              <select id="f-7" value={contractForm.tenantId} onChange={e => setContractForm(f => ({ ...f, tenantId: e.target.value }))}
                className="w-full border rounded px-3 py-2 text-sm">
                <option value="">選擇租客</option>
                {tenants.map(t => <option key={t.id} value={t.id}>{getTenantDisplayName(t)}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="f-8" className="text-sm text-gray-600">開始日期 *</label>
              <input id="f-8" type="date" value={contractForm.startDate} onChange={e => setContractForm(f => ({ ...f, startDate: e.target.value }))}
                className="w-full border rounded px-3 py-2 text-sm" />
            </div>
            <div>
              <label htmlFor="f-9" className="text-sm text-gray-600">結束日期 *</label>
              <input id="f-9" type="date" value={contractForm.endDate} onChange={e => setContractForm(f => ({ ...f, endDate: e.target.value }))}
                className="w-full border rounded px-3 py-2 text-sm" />
            </div>
            <div>
              <label htmlFor="f-10" className="text-sm text-gray-600">月租金 *</label>
              <input id="f-10" type="number" value={contractForm.monthlyRent} onChange={e => setContractForm(f => ({ ...f, monthlyRent: e.target.value }))}
                className="w-full border rounded px-3 py-2 text-sm" />
            </div>
            <div>
              <label htmlFor="f-2" className="text-sm text-gray-600">繳租日 (每月) *</label>
              <input id="f-2" type="number" min="1" max="28" value={contractForm.paymentDueDay} onChange={e => setContractForm(f => ({ ...f, paymentDueDay: e.target.value }))}
                className="w-full border rounded px-3 py-2 text-sm" />
            </div>
            <div>
              <label htmlFor="f-3" className="text-sm text-gray-600">押金金額</label>
              <input id="f-3" type="number" value={contractForm.depositAmount} onChange={e => setContractForm(f => ({ ...f, depositAmount: e.target.value }))}
                className="w-full border rounded px-3 py-2 text-sm" />
            </div>
            <div>
              <label htmlFor="f-4" className="text-sm text-gray-600">押金帳戶</label>
              <select id="f-4" value={contractForm.depositAccountId} onChange={e => setContractForm(f => ({ ...f, depositAccountId: e.target.value }))}
                className="w-full border rounded px-3 py-2 text-sm">
                <option value="">無</option>
                {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="f-11" className="text-sm text-gray-600">收租帳戶 *</label>
              <select id="f-11" value={contractForm.rentAccountId} onChange={e => setContractForm(f => ({ ...f, rentAccountId: e.target.value }))}
                className="w-full border rounded px-3 py-2 text-sm">
                <option value="">-- 選擇帳戶 --</option>
                {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="f-12" className="text-sm text-gray-600">會計科目 *</label>
              <select id="f-12" value={contractForm.accountingSubjectId} onChange={e => setContractForm(f => ({ ...f, accountingSubjectId: e.target.value }))}
                className="w-full border rounded px-3 py-2 text-sm">
                <option value="">請選擇會計科目</option>
                {accountingSubjects.map(s => <option key={s.id} value={s.id}>{s.code} - {s.name}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="f-13" className="text-sm text-gray-600">狀態</label>
              <select id="f-13" value={contractForm.status} onChange={e => setContractForm(f => ({ ...f, status: e.target.value }))}
                className="w-full border rounded px-3 py-2 text-sm">
                {CONTRACT_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-sm text-gray-600">分類</label>
              <div className="w-full border rounded px-3 py-2 text-sm bg-gray-50 text-gray-600 flex items-center gap-1">
                {(() => {
                  const prop = properties.find(p => String(p.id) === String(contractForm.propertyId));
                  return prop?.category
                    ? <><span className="text-xs text-gray-400">繼承自物業：</span><span className="font-medium text-gray-800">{prop.category}</span></>
                    : <span className="text-gray-400">（選擇物業後自動帶入）</span>;
                })()}
              </div>
            </div>
            <div className="col-span-2">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={contractForm.autoRenew}
                  onChange={e => setContractForm(f => ({ ...f, autoRenew: e.target.checked }))} />
                自動續約
              </label>
            </div>
            <div className="col-span-2">
              <label htmlFor="f-5" className="text-sm text-gray-600">特殊條款</label>
              <textarea id="f-5" value={contractForm.specialTerms} onChange={e => setContractForm(f => ({ ...f, specialTerms: e.target.value }))}
                className="w-full border rounded px-3 py-2 text-sm" rows={2} />
            </div>
            <div className="col-span-2">
              <label htmlFor="f-6" className="text-sm text-gray-600">備註</label>
              <textarea id="f-6" value={contractForm.note} onChange={e => setContractForm(f => ({ ...f, note: e.target.value }))}
                className="w-full border rounded px-3 py-2 text-sm" rows={2} />
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-6">
            <button onClick={onClose} className="px-4 py-2 text-sm bg-gray-200 rounded hover:bg-gray-300">取消</button>
            <button onClick={saveContract} disabled={contractSaving} className="px-4 py-2 text-sm bg-teal-600 text-white rounded hover:bg-teal-700 disabled:opacity-50">{contractSaving ? '儲存中…' : (renewingFromContract ? '建立續約合約' : '儲存')}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
