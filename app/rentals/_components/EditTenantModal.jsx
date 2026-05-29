'use client';

import { todayStr } from '@/lib/localDate';
import { getContractDisplayStatus } from '../_lib/rentalHelpers';

export default function EditTenantModal({
  editingTenant,
  tenantForm, setTenantForm,
  tenantSaving,
  saveTenant,
  onClose,
  onInitiateTerminate,
  contractPropertyChanges, setContractPropertyChanges,
  properties,
  accounts,
  initContractErrors, setInitContractErrors,
}) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="p-6">
          <h3 className="text-lg font-bold text-gray-800 mb-4">{editingTenant ? '編輯租客' : '新增租客'}</h3>

          {/* 基本資料 */}
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">基本資料</p>
          <div className="grid grid-cols-2 gap-3 mb-4">
            {editingTenant && (
              <div>
                <label htmlFor="f" className="text-sm text-gray-600">代碼</label>
                <input id="f" type="text" value={tenantForm.tenantCode} onChange={e => setTenantForm(f => ({ ...f, tenantCode: e.target.value }))}
                  className="w-full border rounded px-3 py-2 text-sm font-mono" />
              </div>
            )}
            <div>
              <label htmlFor="f-2" className="text-sm text-gray-600">類型 *</label>
              <select id="f-2" value={tenantForm.tenantType} onChange={e => setTenantForm(f => ({ ...f, tenantType: e.target.value }))}
                className="w-full border rounded px-3 py-2 text-sm">
                <option value="individual">個人</option>
                <option value="company">公司</option>
              </select>
            </div>
            <div>
              <label htmlFor="f-3" className="text-sm text-gray-600">狀態</label>
              <select id="f-3" value={tenantForm.leaseStatus || 'active'} onChange={e => setTenantForm(f => ({ ...f, leaseStatus: e.target.value }))}
                className="w-full border rounded px-3 py-2 text-sm">
                <option value="active">出租中</option>
                <option value="terminating">退租</option>
                <option value="terminated">已退租</option>
              </select>
            </div>
            {tenantForm.tenantType === 'individual' ? (
              <>
                <div>
                  <label htmlFor="f-4" className="text-sm text-gray-600">姓名 *</label>
                  <input id="f-4" type="text" value={tenantForm.fullName} onChange={e => setTenantForm(f => ({ ...f, fullName: e.target.value }))}
                    className="w-full border rounded px-3 py-2 text-sm" />
                </div>
                <div>
                  <label htmlFor="f-5" className="text-sm text-gray-600">身分證號</label>
                  <input id="f-5" type="text" value={tenantForm.idNumber} onChange={e => setTenantForm(f => ({ ...f, idNumber: e.target.value }))}
                    className="w-full border rounded px-3 py-2 text-sm" />
                </div>
                <div>
                  <label htmlFor="f-6" className="text-sm text-gray-600">生日</label>
                  <input id="f-6" type="date" value={tenantForm.birthDate} onChange={e => setTenantForm(f => ({ ...f, birthDate: e.target.value }))}
                    className="w-full border rounded px-3 py-2 text-sm" />
                </div>
              </>
            ) : (
              <>
                <div>
                  <label htmlFor="f-7" className="text-sm text-gray-600">公司名稱 *</label>
                  <input id="f-7" type="text" value={tenantForm.companyName} onChange={e => setTenantForm(f => ({ ...f, companyName: e.target.value }))}
                    className="w-full border rounded px-3 py-2 text-sm" />
                </div>
                <div>
                  <label htmlFor="f-8" className="text-sm text-gray-600">統一編號</label>
                  <input id="f-8" type="text" value={tenantForm.taxId} onChange={e => setTenantForm(f => ({ ...f, taxId: e.target.value }))}
                    className="w-full border rounded px-3 py-2 text-sm" />
                </div>
                <div>
                  <label htmlFor="f-9" className="text-sm text-gray-600">負責人</label>
                  <input id="f-9" type="text" value={tenantForm.representativeName} onChange={e => setTenantForm(f => ({ ...f, representativeName: e.target.value }))}
                    className="w-full border rounded px-3 py-2 text-sm" />
                </div>
              </>
            )}
          </div>

          {/* 聯絡資料 */}
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">聯絡資料</p>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div>
              <label htmlFor="f-10" className="text-sm text-gray-600">電話 *</label>
              <input id="f-10" type="text" value={tenantForm.phone} onChange={e => setTenantForm(f => ({ ...f, phone: e.target.value }))}
                className="w-full border rounded px-3 py-2 text-sm" />
            </div>
            <div>
              <label htmlFor="2" className="text-sm text-gray-600">電話 2</label>
              <input id="2" type="text" value={tenantForm.phone2} onChange={e => setTenantForm(f => ({ ...f, phone2: e.target.value }))}
                className="w-full border rounded px-3 py-2 text-sm" />
            </div>
            <div>
              <label htmlFor="email" className="text-sm text-gray-600">Email</label>
              <input id="email" type="email" value={tenantForm.email} onChange={e => setTenantForm(f => ({ ...f, email: e.target.value }))}
                className="w-full border rounded px-3 py-2 text-sm" />
            </div>
            <div className="col-span-2">
              <label htmlFor="f-11" className="text-sm text-gray-600">地址</label>
              <input id="f-11" type="text" value={tenantForm.address} onChange={e => setTenantForm(f => ({ ...f, address: e.target.value }))}
                className="w-full border rounded px-3 py-2 text-sm" />
            </div>
            <div>
              <label htmlFor="f-12" className="text-sm text-gray-600">緊急聯絡人</label>
              <input id="f-12" type="text" value={tenantForm.emergencyContact} onChange={e => setTenantForm(f => ({ ...f, emergencyContact: e.target.value }))}
                className="w-full border rounded px-3 py-2 text-sm" />
            </div>
            <div>
              <label htmlFor="f-13" className="text-sm text-gray-600">緊急聯絡電話</label>
              <input id="f-13" type="text" value={tenantForm.emergencyPhone} onChange={e => setTenantForm(f => ({ ...f, emergencyPhone: e.target.value }))}
                className="w-full border rounded px-3 py-2 text-sm" />
            </div>
          </div>

          {/* 銀行資料 */}
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">銀行資料</p>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div>
              <label htmlFor="f-14" className="text-sm text-gray-600">銀行代碼</label>
              <input id="f-14" type="text" value={tenantForm.bankCode} onChange={e => setTenantForm(f => ({ ...f, bankCode: e.target.value }))}
                className="w-full border rounded px-3 py-2 text-sm" />
            </div>
            <div>
              <label htmlFor="f-15" className="text-sm text-gray-600">分行</label>
              <input id="f-15" type="text" value={tenantForm.bankBranch} onChange={e => setTenantForm(f => ({ ...f, bankBranch: e.target.value }))}
                className="w-full border rounded px-3 py-2 text-sm" />
            </div>
            <div>
              <label htmlFor="f-16" className="text-sm text-gray-600">帳戶名稱</label>
              <input id="f-16" type="text" value={tenantForm.bankAccountName} onChange={e => setTenantForm(f => ({ ...f, bankAccountName: e.target.value }))}
                className="w-full border rounded px-3 py-2 text-sm" />
            </div>
            <div>
              <label htmlFor="f-17" className="text-sm text-gray-600">帳號</label>
              <input id="f-17" type="text" value={tenantForm.bankAccountNumber} onChange={e => setTenantForm(f => ({ ...f, bankAccountNumber: e.target.value }))}
                className="w-full border rounded px-3 py-2 text-sm" />
            </div>
          </div>

          {/* 信用與備註 */}
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">信用與備註</p>
          <div className="space-y-3">
            <div>
              <label htmlFor="f-18" className="text-sm text-gray-600">信用備註</label>
              <textarea id="f-18" value={tenantForm.creditNote} onChange={e => setTenantForm(f => ({ ...f, creditNote: e.target.value }))}
                className="w-full border rounded px-3 py-2 text-sm" rows={2} />
            </div>
            <div>
              <label htmlFor="f-19" className="text-sm text-gray-600">備註</label>
              <textarea id="f-19" value={tenantForm.note} onChange={e => setTenantForm(f => ({ ...f, note: e.target.value }))}
                className="w-full border rounded px-3 py-2 text-sm" rows={2} />
            </div>
            <div className="border-t pt-3">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={tenantForm.isBlacklisted || false}
                  onChange={e => setTenantForm(f => ({ ...f, isBlacklisted: e.target.checked }))} />
                列入黑名單
              </label>
              {tenantForm.isBlacklisted && (
                <div className="mt-2">
                  <label htmlFor="f-20" className="text-sm text-gray-600">黑名單原因</label>
                  <textarea id="f-20" value={tenantForm.blacklistReason || ''} onChange={e => setTenantForm(f => ({ ...f, blacklistReason: e.target.value }))}
                    className="w-full border rounded px-3 py-2 text-sm" rows={2} />
                </div>
              )}
            </div>
          </div>

          {/* 合約 / 物業 — 僅編輯時顯示 */}
          {editingTenant && (() => {
            const tenantContracts = editingTenant.contracts || [];
            const hasActiveContract = tenantContracts.some(c => {
              const ds = getContractDisplayStatus(c);
              return (c.status === 'active' || c.status === 'pending') && ds !== 'expired';
            });
            return (
              <div className="mt-5 border-t pt-4">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">合約 / 物業 <span className="normal-case font-normal text-gray-400">（生效中及待審核合約可更換物業）</span></p>

                {/* 現有合約列表 */}
                {tenantContracts.length > 0 && (
                  <div className="space-y-2 mb-3">
                    {tenantContracts.map(c => {
                      const contractDisplayStatus = getContractDisplayStatus(c);
                      const isActive = (c.status === 'active' || c.status === 'pending') && contractDisplayStatus !== 'expired';
                      const isTerminated = c.status === 'terminated' || contractDisplayStatus === 'expired';
                      const statusLabel = { active: '生效中', pending: '待審核', terminated: '已終止', expired: '已到期' }[contractDisplayStatus] || contractDisplayStatus;
                      const statusColor = isActive ? 'bg-green-50 text-green-700 border-green-200' : 'bg-gray-100 text-gray-500 border-gray-200';
                      return (
                        <div key={c.id} className="flex items-center justify-between border rounded-lg px-3 py-2 bg-gray-50 gap-2">
                          <div className="flex-1 min-w-0">
                            {isActive ? (
                              <select
                                value={contractPropertyChanges[c.id] || ''}
                                onChange={e => setContractPropertyChanges(prev => ({ ...prev, [c.id]: e.target.value }))}
                                className="text-sm border rounded px-2 py-1 w-full max-w-xs"
                              >
                                <option value="">-- 選擇物業 --</option>
                                {properties.map(p => {
                                  const isOccupied = (p.currentContractStatus === 'active' || p.currentContractStatus === 'pending')
                                    && String(p.id) !== String(c.property?.id);
                                  return <option key={p.id} value={String(p.id)} disabled={isOccupied}>{p.name}{isOccupied ? ' （已出租）' : ''}</option>;
                                })}
                              </select>
                            ) : (
                              <span className="text-sm font-medium text-gray-800">{c.property?.name || '未知物業'}</span>
                            )}
                            {c.contractNo && <span className="text-xs text-gray-400 ml-2">{c.contractNo}</span>}
                            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                              <span className={`text-xs px-2 py-0.5 border rounded ${statusColor}`}>{statusLabel}</span>
                              {c.startDate && <span className="text-xs text-gray-400">{c.startDate}{c.endDate ? ` ~ ${c.endDate}` : ''}</span>}
                            </div>
                          </div>
                          {isActive ? (
                            <button
                              onClick={() => onInitiateTerminate(editingTenant, c)}
                              className="text-xs px-3 py-1 bg-orange-50 text-orange-700 border border-orange-300 rounded hover:bg-orange-100 font-medium whitespace-nowrap shrink-0">
                              退租
                            </button>
                          ) : isTerminated ? (
                            <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-500 border border-gray-200 rounded shrink-0">已退租</span>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* 新增物業合約（無生效合約時顯示） */}
                {!hasActiveContract && (
                  <div className={`${tenantContracts.length > 0 ? 'border-t pt-3 mt-2' : ''}`}>
                    <p className="text-xs text-gray-500 mb-2">新增物業合約 <span className="text-gray-400">（儲存後自動建立待審核合約）</span></p>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="col-span-2">
                        <label htmlFor="f-21" className="text-sm text-gray-600">物業</label>
                        <select id="f-21" value={tenantForm.initPropertyId}
                          onChange={e => setTenantForm(f => ({ ...f, initPropertyId: e.target.value }))}
                          className="w-full border rounded px-3 py-2 text-sm">
                          <option value="">-- 不設定 --</option>
                          {properties.map(p => {
                            const isOccupied = p.currentContractStatus === 'active' || p.currentContractStatus === 'pending';
                            return <option key={p.id} value={String(p.id)} disabled={isOccupied}>{p.name}{isOccupied ? ' （已出租）' : ''}</option>;
                          })}
                        </select>
                      </div>
                      {tenantForm.initPropertyId && (
                        <>
                          <div>
                            <label htmlFor="f-27" className={`text-sm ${initContractErrors.has('initMonthlyRent') ? 'text-red-600 font-medium' : 'text-gray-600'}`}>月租金 *</label>
                            <input id="f-27" type="number" min="0" value={tenantForm.initMonthlyRent}
                              onChange={e => { setTenantForm(f => ({ ...f, initMonthlyRent: e.target.value })); setInitContractErrors(prev => { const n = new Set(prev); n.delete('initMonthlyRent'); return n; }); }}
                              className={`w-full border rounded px-3 py-2 text-sm ${initContractErrors.has('initMonthlyRent') ? 'border-red-400 bg-red-50' : ''}`} placeholder="0" />
                          </div>
                          <div>
                            <label htmlFor="f-28" className="text-sm text-gray-600">每月應繳日</label>
                            <input id="f-28" type="number" min="1" max="28" value={tenantForm.initPaymentDueDay}
                              onChange={e => setTenantForm(f => ({ ...f, initPaymentDueDay: e.target.value }))}
                              className="w-full border rounded px-3 py-2 text-sm" />
                          </div>
                          <div>
                            <label htmlFor="f-22" className={`text-sm ${initContractErrors.has('initStartDate') ? 'text-red-600 font-medium' : 'text-gray-600'}`}>開始日期 *</label>
                            <input id="f-22" type="date" value={tenantForm.initStartDate}
                              onChange={e => { setTenantForm(f => ({ ...f, initStartDate: e.target.value })); setInitContractErrors(prev => { const n = new Set(prev); n.delete('initStartDate'); return n; }); }}
                              className={`w-full border rounded px-3 py-2 text-sm ${initContractErrors.has('initStartDate') ? 'border-red-400 bg-red-50' : ''}`} />
                          </div>
                          <div className="col-span-2">
                            <label htmlFor="f-23" className={`text-sm ${initContractErrors.has('initRentAccountId') ? 'text-red-600 font-medium' : 'text-gray-600'}`}>收租帳戶 *</label>
                            <select id="f-23" value={tenantForm.initRentAccountId}
                              onChange={e => { setTenantForm(f => ({ ...f, initRentAccountId: e.target.value })); setInitContractErrors(prev => { const n = new Set(prev); n.delete('initRentAccountId'); return n; }); }}
                              className={`w-full border rounded px-3 py-2 text-sm ${initContractErrors.has('initRentAccountId') ? 'border-red-400 bg-red-50' : ''}`}>
                              <option value="">-- 選擇帳戶 --</option>
                              {accounts.map(a => <option key={a.id} value={String(a.id)}>{a.name}</option>)}
                            </select>
                          </div>
                          {initContractErrors.size > 0 && (
                            <p className="col-span-2 text-xs text-red-500 font-medium">請補齊標紅的必填欄位</p>
                          )}
                          <p className="col-span-2 text-xs text-gray-400">合約結束日期自動設為開始日期 +1 年，狀態為「待審核」，可至合約管理補全資訊。</p>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          {/* 物業合約：新增租客時顯示 */}
          {!editingTenant && (
            <div className="mt-5 border-t pt-4">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
                初始物業合約 <span className="normal-case font-normal">（選填，儲存後自動建立待審核合約）</span>
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label htmlFor="f-24" className="text-sm text-gray-600">物業</label>
                  <select id="f-24" value={tenantForm.initPropertyId}
                    onChange={e => setTenantForm(f => ({ ...f, initPropertyId: e.target.value }))}
                    className="w-full border rounded px-3 py-2 text-sm">
                    <option value="">-- 不設定 --</option>
                    {properties.map(p => {
                      const isOccupied = p.currentContractStatus === 'active' || p.currentContractStatus === 'pending';
                      return <option key={p.id} value={String(p.id)} disabled={isOccupied}>{p.name}{isOccupied ? ' （已出租）' : ''}</option>;
                    })}
                  </select>
                </div>
                {tenantForm.initPropertyId && (
                  <>
                    <div>
                      <label htmlFor="f-29" className={`text-sm ${initContractErrors.has('initMonthlyRent') ? 'text-red-600 font-medium' : 'text-gray-600'}`}>月租金 *</label>
                      <input id="f-29" type="number" min="0" value={tenantForm.initMonthlyRent}
                        onChange={e => { setTenantForm(f => ({ ...f, initMonthlyRent: e.target.value })); setInitContractErrors(prev => { const n = new Set(prev); n.delete('initMonthlyRent'); return n; }); }}
                        className={`w-full border rounded px-3 py-2 text-sm ${initContractErrors.has('initMonthlyRent') ? 'border-red-400 bg-red-50' : ''}`} placeholder="0" />
                    </div>
                    <div>
                      <label htmlFor="f-30" className="text-sm text-gray-600">每月應繳日</label>
                      <input id="f-30" type="number" min="1" max="28" value={tenantForm.initPaymentDueDay}
                        onChange={e => setTenantForm(f => ({ ...f, initPaymentDueDay: e.target.value }))}
                        className="w-full border rounded px-3 py-2 text-sm" />
                    </div>
                    <div>
                      <label htmlFor="f-25" className={`text-sm ${initContractErrors.has('initStartDate') ? 'text-red-600 font-medium' : 'text-gray-600'}`}>開始日期 *</label>
                      <input id="f-25" type="date" value={tenantForm.initStartDate}
                        onChange={e => { setTenantForm(f => ({ ...f, initStartDate: e.target.value })); setInitContractErrors(prev => { const n = new Set(prev); n.delete('initStartDate'); return n; }); }}
                        className={`w-full border rounded px-3 py-2 text-sm ${initContractErrors.has('initStartDate') ? 'border-red-400 bg-red-50' : ''}`} />
                    </div>
                    <div className="col-span-2">
                      <label htmlFor="f-26" className={`text-sm ${initContractErrors.has('initRentAccountId') ? 'text-red-600 font-medium' : 'text-gray-600'}`}>收租帳戶 *</label>
                      <select id="f-26" value={tenantForm.initRentAccountId}
                        onChange={e => { setTenantForm(f => ({ ...f, initRentAccountId: e.target.value })); setInitContractErrors(prev => { const n = new Set(prev); n.delete('initRentAccountId'); return n; }); }}
                        className={`w-full border rounded px-3 py-2 text-sm ${initContractErrors.has('initRentAccountId') ? 'border-red-400 bg-red-50' : ''}`}>
                        <option value="">-- 選擇帳戶 --</option>
                        {accounts.map(a => <option key={a.id} value={String(a.id)}>{a.name}</option>)}
                      </select>
                    </div>
                    {initContractErrors.size > 0 && (
                      <p className="col-span-2 text-xs text-red-500 font-medium">請補齊標紅的必填欄位</p>
                    )}
                    <p className="col-span-2 text-xs text-gray-400">合約結束日期自動設為開始日期 +1 年，狀態為「待審核」，可至合約管理補全資訊。</p>
                  </>
                )}
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 mt-6">
            <button onClick={onClose} className="px-4 py-2 text-sm bg-gray-200 rounded hover:bg-gray-300">取消</button>
            <button onClick={saveTenant} disabled={tenantSaving} className="px-4 py-2 text-sm bg-teal-600 text-white rounded hover:bg-teal-700 disabled:opacity-50">{tenantSaving ? '儲存中…' : '儲存'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
