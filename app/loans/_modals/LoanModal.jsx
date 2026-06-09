'use client';

function formatCurrency(val) {
  if (val === null || val === undefined) return '-';
  return Number(val).toLocaleString('zh-TW');
}

const OWNER_TYPES = ['公司', '個人'];
const RATE_TYPES = ['固定利率', '浮動利率'];
const REPAYMENT_TYPES = ['本息攤還', '本金攤還', '到期還本', '按月付息'];
const LOAN_TYPES = ['一般貸款', '房屋貸款', '設備貸款', '週轉金', '其他'];
const LOAN_STATUSES = ['使用中', '已結清', '已停用'];

export default function LoanModal({
  editingLoan,
  loanForm, setLoanForm,
  loanSaving,
  accounts,
  accountingSubjects,
  warehouses,
  onClose,
  onSave,
}) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b px-6 py-4 rounded-t-2xl">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-gray-800">
              {editingLoan ? '編輯貸款' : '新增貸款'}
            </h3>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
          </div>
        </div>
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="f-2" className="block text-sm font-medium text-gray-700 mb-1">貸款名稱 *</label>
              <input id="f-2" type="text" value={loanForm.loanName}
                onChange={e => setLoanForm({ ...loanForm, loanName: e.target.value })}
                className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="例：台銀房貸-麗格"
              />
            </div>
            <div>
              <label htmlFor="f-3" className="block text-sm font-medium text-gray-700 mb-1">持有人類型 *</label>
              <select id="f-3" value={loanForm.ownerType} onChange={e => setLoanForm({ ...loanForm, ownerType: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm">
                {OWNER_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="f-30" className="block text-sm font-medium text-gray-700 mb-1">持有人姓名</label>
              <input id="f-30" type="text" value={loanForm.ownerName}
                onChange={e => setLoanForm({ ...loanForm, ownerName: e.target.value })}
                className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="選填"
              />
            </div>
            <div>
              <label htmlFor="f-4" className="block text-sm font-medium text-gray-700 mb-1">館別</label>
              <select id="f-4" value={loanForm.warehouse} onChange={e => setLoanForm({ ...loanForm, warehouse: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm">
                <option value="">請選擇</option>
                {warehouses.map(w => <option key={w} value={w}>{w}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="f-31" className="block text-sm font-medium text-gray-700 mb-1">銀行名稱 *</label>
              <input id="f-31" type="text" value={loanForm.bankName}
                onChange={e => setLoanForm({ ...loanForm, bankName: e.target.value })}
                className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="例：台灣銀行"
              />
            </div>
            <div>
              <label htmlFor="f-5" className="block text-sm font-medium text-gray-700 mb-1">分行</label>
              <input id="f-5" type="text" value={loanForm.bankBranch}
                onChange={e => setLoanForm({ ...loanForm, bankBranch: e.target.value })}
                className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="選填"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="f-6" className="block text-sm font-medium text-gray-700 mb-1">貸款類型</label>
              <select id="f-6" value={loanForm.loanType} onChange={e => setLoanForm({ ...loanForm, loanType: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm">
                {LOAN_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="f-32" className="block text-sm font-medium text-gray-700 mb-1">貸款金額 *</label>
              <input id="f-32" type="number" value={loanForm.originalAmount}
                onChange={e => setLoanForm({ ...loanForm, originalAmount: e.target.value })}
                className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="原始貸款金額"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label htmlFor="f-7" className="block text-sm font-medium text-gray-700 mb-1">年利率 (%)</label>
              <input id="f-7" type="number" step="0.01" value={loanForm.annualRate}
                onChange={e => setLoanForm({ ...loanForm, annualRate: e.target.value })}
                className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="0 表示無利息"
              />
            </div>
            <div>
              <label htmlFor="f-8" className="block text-sm font-medium text-gray-700 mb-1">利率類型</label>
              <select id="f-8" value={loanForm.rateType} onChange={e => setLoanForm({ ...loanForm, rateType: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm">
                {RATE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="f-33" className="block text-sm font-medium text-gray-700 mb-1">還款日 *</label>
              <input id="f-33" type="number" min="1" max="28" value={loanForm.repaymentDay}
                onChange={e => setLoanForm({ ...loanForm, repaymentDay: e.target.value })}
                className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="1-28"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label htmlFor="f-9" className="block text-sm font-medium text-gray-700 mb-1">還款方式 *</label>
              <select id="f-9" value={loanForm.repaymentType} onChange={e => setLoanForm({ ...loanForm, repaymentType: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm">
                {REPAYMENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="f-34" className="block text-sm font-medium text-gray-700 mb-1">起始日 *</label>
              <input id="f-34" type="date" value={loanForm.startDate}
                onChange={e => setLoanForm({ ...loanForm, startDate: e.target.value })}
                className="w-full border rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label htmlFor="f-35" className="block text-sm font-medium text-gray-700 mb-1">到期日 *</label>
              <input id="f-35" type="date" value={loanForm.endDate}
                onChange={e => setLoanForm({ ...loanForm, endDate: e.target.value })}
                className="w-full border rounded-lg px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="f-10" className="block text-sm font-medium text-gray-700 mb-1">扣款帳戶 *</label>
              <select id="f-10" value={loanForm.deductAccountId} onChange={e => setLoanForm({ ...loanForm, deductAccountId: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm">
                <option value="">請選擇</option>
                {accounts.filter(a => a.isActive).map(a => (
                  <option key={a.id} value={a.id}>{a.name} ({a.type})</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="f-37" className="block text-sm font-medium text-gray-700 mb-1">排序</label>
              <input id="f-37" type="number" value={loanForm.sortOrder}
                onChange={e => setLoanForm({ ...loanForm, sortOrder: e.target.value })}
                className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="0"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="f-11" className="block text-sm font-medium text-gray-700 mb-1">本金會計科目</label>
              <select id="f-11" value={loanForm.principalSubjectId}
                onChange={e => setLoanForm({ ...loanForm, principalSubjectId: e.target.value })}
                className="w-full border rounded-lg px-3 py-2 text-sm"
              >
                <option value="">請選擇（選填）</option>
                {accountingSubjects.map(s => (
                  <option key={s.id} value={s.id}>{s.code} - {s.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="f-38" className="block text-sm font-medium text-gray-700 mb-1">利息會計科目</label>
              <select id="f-38" value={loanForm.interestSubjectId}
                onChange={e => setLoanForm({ ...loanForm, interestSubjectId: e.target.value })}
                className="w-full border rounded-lg px-3 py-2 text-sm"
              >
                <option value="">請選擇（選填）</option>
                {accountingSubjects.map(s => (
                  <option key={s.id} value={s.id}>{s.code} - {s.name}</option>
                ))}
              </select>
            </div>
          </div>

          {editingLoan && (
            <div className="border-t pt-4 mt-2">
              <h4 className="text-sm font-bold text-gray-700 mb-3">貸款狀態管理</h4>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="f-36" className="block text-sm font-medium text-gray-700 mb-1">貸款狀態</label>
                  <select id="f-36" value={loanForm.status} onChange={e => setLoanForm({ ...loanForm, status: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm">
                    {LOAN_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div className="flex items-end">
                  {loanForm.status === '已結清' && (
                    <p className="text-xs text-blue-600 bg-blue-50 rounded-lg p-2">
                      設為「已結清」後，此貸款將不會出現在本月還款的批次建立中。
                    </p>
                  )}
                  {loanForm.status === '已停用' && (
                    <p className="text-xs text-gray-600 bg-gray-50 rounded-lg p-2">
                      設為「已停用」後，此貸款將不會出現在本月還款中。
                    </p>
                  )}
                </div>
              </div>
              {loanForm.status === '已結清' && (
                <div className="mt-3 bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                  <p className="text-xs text-yellow-800">
                    <b>借新還舊：</b>若此貸款已由新貸款取代，請先將此貸款設為「已結清」，
                    再新增一筆新貸款。新貸款的「貸款金額」填入新借入金額，備註欄可註明「借新還舊，原貸款：{editingLoan.loanCode}」。
                  </p>
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="f-12" className="block text-sm font-medium text-gray-700 mb-1">聯絡人</label>
              <input id="f-12" type="text" value={loanForm.contactPerson}
                onChange={e => setLoanForm({ ...loanForm, contactPerson: e.target.value })}
                className="w-full border rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label htmlFor="f-13" className="block text-sm font-medium text-gray-700 mb-1">聯絡電話</label>
              <input id="f-13" type="text" value={loanForm.contactPhone}
                onChange={e => setLoanForm({ ...loanForm, contactPhone: e.target.value })}
                className="w-full border rounded-lg px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div>
            <label htmlFor="f-14" className="block text-sm font-medium text-gray-700 mb-1">擔保物</label>
            <input id="f-14" type="text" value={loanForm.collateral}
              onChange={e => setLoanForm({ ...loanForm, collateral: e.target.value })}
              className="w-full border rounded-lg px-3 py-2 text-sm"
              placeholder="例：土地、建物、設備等"
            />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label htmlFor="f-15" className="block text-sm font-medium text-gray-700 mb-1">保證人/要保人</label>
              <input id="f-15" type="text" value={loanForm.guarantor}
                onChange={e => setLoanForm({ ...loanForm, guarantor: e.target.value })}
                className="w-full border rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label htmlFor="f-16" className="block text-sm font-medium text-gray-700 mb-1">保證人電話</label>
              <input id="f-16" type="text" value={loanForm.guarantorPhone}
                onChange={e => setLoanForm({ ...loanForm, guarantorPhone: e.target.value })}
                className="w-full border rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label htmlFor="f-17" className="block text-sm font-medium text-gray-700 mb-1">保證人身分證</label>
              <input id="f-17" type="text" value={loanForm.guarantorIdNo}
                onChange={e => setLoanForm({ ...loanForm, guarantorIdNo: e.target.value })}
                className="w-full border rounded-lg px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div>
            <label htmlFor="f-18" className="block text-sm font-medium text-gray-700 mb-1">備註</label>
            <textarea id="f-18" value={loanForm.remark}
              onChange={e => setLoanForm({ ...loanForm, remark: e.target.value })}
              className="w-full border rounded-lg px-3 py-2 text-sm" rows={3}
            />
          </div>
        </div>
        <div className="sticky bottom-0 bg-gray-50 border-t px-6 py-4 rounded-b-2xl flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-gray-600 hover:text-gray-800 text-sm" disabled={loanSaving}>
            取消
          </button>
          <button onClick={onSave} disabled={loanSaving} className="bg-indigo-600 text-white px-6 py-2 rounded-lg text-sm hover:bg-indigo-700 transition-colors disabled:opacity-50">
            {loanSaving ? '儲存中…' : (editingLoan ? '更新' : '新增')}
          </button>
        </div>
      </div>
    </div>
  );
}
