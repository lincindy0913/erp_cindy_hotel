'use client';

import Link from 'next/link';
import { todayStr, localDateStr } from '@/lib/localDate';
import { TAX_STATUSES } from '../_lib/rentalHelpers';
import StatusBadge from '../_components/StatusBadge';

const fmt = n => Number(n || 0).toLocaleString('zh-TW');

export default function TaxesTab({
  taxes,
  taxFilter, setTaxFilter,
  yearLocks, yearLockSaving, taxView, setTaxView,
  taxTableYear, setTaxTableYear, taxTableRows, setTaxTableRows, taxTableSaving,
  payingTaxId, setPayingTaxId,
  taxPayForm, setTaxPayForm,
  fetchTaxes, fetchYearLocks, fetchTaxTable,
  lockYear, unlockYear, openTaxEdit, confirmTaxPayment, deleteTax, printTaxes, saveTaxTable,
  properties, accounts,
  setEditingTax, setTaxForm, setShowTaxModal,
}) {
  return (
    <div>
      {/* 年度結算鎖定 */}
      <div className="mb-6 bg-white rounded-lg shadow p-4 border border-gray-100">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-700">年度結算鎖定</h3>
          <span className="text-xs text-gray-400">報稅完成後鎖定，防止誤改歷史資料</span>
        </div>
        <div className="flex flex-wrap gap-3">
          {[new Date().getFullYear() - 1, new Date().getFullYear()].map(y => {
            const lock = yearLocks.find(l => l.year === y);
            return (
              <div key={y} className={`flex items-center gap-3 px-4 py-2 rounded-lg border text-sm ${lock ? 'bg-orange-50 border-orange-300' : 'bg-gray-50 border-gray-200'}`}>
                <span className="font-semibold text-gray-700">{y} 年</span>
                {lock ? (
                  <>
                    <span className="text-orange-700 text-xs">🔒 {lock.lockedAt ? new Date(lock.lockedAt).toLocaleDateString('zh-TW') : ''} 由 {lock.lockedBy || '系統'}</span>
                    <button onClick={() => unlockYear(y)} disabled={yearLockSaving}
                      className="text-xs text-gray-500 hover:text-red-600 underline">解鎖</button>
                  </>
                ) : (
                  <button onClick={() => lockYear(y)} disabled={yearLockSaving}
                    className="text-xs bg-orange-600 text-white px-2 py-0.5 rounded hover:bg-orange-700 disabled:opacity-50">
                    結算鎖定
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* 年度稅額表格 (一年填一次) */}
      <div className="mb-8">
        <h3 className="text-base font-semibold text-gray-800 mb-3">年度稅額表格</h3>
        <div className="flex items-center gap-3 mb-3">
          <label htmlFor="f-11" className="text-sm text-gray-600">年度：</label>
          <select id="f-11" value={taxTableYear} onChange={e => { setTaxTableYear(Number(e.target.value)); }} className="border rounded px-2 py-1.5 text-sm w-28">
            {[new Date().getFullYear(), new Date().getFullYear() - 1, new Date().getFullYear() - 2].map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          <button onClick={fetchTaxTable} className="bg-teal-600 text-white px-3 py-1.5 rounded text-sm hover:bg-teal-700">載入</button>
          <button onClick={saveTaxTable} disabled={taxTableSaving} className="bg-blue-600 text-white px-3 py-1.5 rounded text-sm hover:bg-blue-700 disabled:opacity-50">{taxTableSaving ? '儲存中…' : '儲存'}</button>
        </div>
        <div className="bg-white rounded-lg shadow tbl-wrap border border-gray-200">
          <table className="w-full text-sm">
            <thead className="bg-teal-50 sticky top-0 z-10">
              <tr>
                <th className="text-center px-3 py-2 border-b border-gray-200">序號</th>
                <th className="text-center px-3 py-2 border-b border-gray-200">資產編號</th>
                <th className="text-left px-3 py-2 border-b border-gray-200">門牌</th>
                <th className="text-right px-3 py-2 border-b border-gray-200">地價稅</th>
                <th className="text-right px-3 py-2 border-b border-gray-200">房屋稅</th>
              </tr>
            </thead>
            <tbody>
              {taxTableRows.length === 0 ? (
                <tr><td colSpan={5} className="px-3 py-6 text-center text-gray-500">載入後顯示</td></tr>
              ) : taxTableRows.map((r, idx) => (
                <tr key={r.propertyId} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="px-3 py-2 text-center text-xs text-gray-500">{idx + 1}</td>
                  <td className="px-3 py-2 text-center text-xs text-gray-700 font-mono">{r.sortOrder ?? '—'}</td>
                  <td className="px-3 py-2">{r.doorplate}</td>
                  <td className="px-3 py-2">
                    <input type="number" min="0" step="1" value={r.landTax === '' ? '' : r.landTax}
                      onChange={e => setTaxTableRows(prev => prev.map(x => x.propertyId === r.propertyId ? { ...x, landTax: e.target.value === '' ? '' : e.target.value } : x))}
                      className="w-full text-right border rounded px-2 py-1 text-sm" placeholder="0" />
                  </td>
                  <td className="px-3 py-2">
                    <input type="number" min="0" step="1" value={r.houseTax === '' ? '' : r.houseTax}
                      onChange={e => setTaxTableRows(prev => prev.map(x => x.propertyId === r.propertyId ? { ...x, houseTax: e.target.value === '' ? '' : e.target.value } : x))}
                      className="w-full text-right border rounded px-2 py-1 text-sm" placeholder="0" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 子視圖切換 */}
      <div className="flex items-center gap-2 mb-4">
        {[{k:'list',l:'稅款清單'},{k:'calendar',l:'90天待繳提醒'}].map(({k,l})=>(
          <button key={k} onClick={()=>setTaxView(k)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${taxView===k ? 'bg-teal-600 text-white' : 'bg-white border text-gray-600 hover:bg-gray-50'}`}>
            {l}
          </button>
        ))}
      </div>

      {taxView === 'calendar' && (() => {
        const today = new Date();
        const d90 = new Date(today); d90.setDate(d90.getDate() + 90);
        const todayDate = localDateStr(today);
        const d90Str = localDateStr(d90);
        const upcoming = taxes.filter(t => t.status === 'pending' && t.dueDate >= todayDate && t.dueDate <= d90Str)
          .sort((a,b)=>a.dueDate.localeCompare(b.dueDate));
        const overdue = taxes.filter(t => t.status === 'pending' && t.dueDate < todayDate)
          .sort((a,b)=>a.dueDate.localeCompare(b.dueDate));
        const urgency = (dueDate) => {
          const diff = Math.floor((new Date(dueDate) - today) / 86400000);
          if (diff <= 7) return { cls: 'bg-red-100 border-red-300 text-red-800', label: `${diff}天後` };
          if (diff <= 30) return { cls: 'bg-orange-100 border-orange-300 text-orange-800', label: `${diff}天後` };
          return { cls: 'bg-yellow-50 border-yellow-200 text-yellow-800', label: `${diff}天後` };
        };
        return (
          <div>
            {overdue.length > 0 && (
              <div className="mb-4">
                <h4 className="text-sm font-semibold text-red-700 mb-2">已逾期（{overdue.length} 筆）</h4>
                <div className="space-y-2">
                  {overdue.map(t=>(
                    <div key={t.id} className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                      <span className="text-xs bg-red-200 text-red-900 px-2 py-0.5 rounded font-semibold">逾期</span>
                      <span className="font-medium text-sm">{t.property?.name}</span>
                      <span className="text-xs text-gray-500">{t.taxYear} {t.taxType}</span>
                      <span className="text-xs text-gray-500">到期日：{t.dueDate}</span>
                      <span className="ml-auto font-bold text-sm">${fmt(t.amount)}</span>
                      <button onClick={()=>openTaxEdit(t)} className="text-blue-600 hover:text-blue-800 text-xs">編輯</button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <h4 className="text-sm font-semibold text-gray-700 mb-2">未來 90 天（{upcoming.length} 筆）</h4>
            {upcoming.length === 0 ? (
              <p className="text-sm text-gray-400 py-4">未來 90 天內無待繳稅款</p>
            ) : (
              <div className="space-y-2">
                {upcoming.map(t=>{
                  const u = urgency(t.dueDate);
                  return (
                    <div key={t.id} className={`flex items-center gap-3 border rounded-lg px-3 py-2 ${u.cls}`}>
                      <span className="text-xs font-semibold w-14 shrink-0">{u.label}</span>
                      <span className="font-medium text-sm">{t.property?.name}</span>
                      <span className="text-xs">{t.taxYear} {t.taxType}</span>
                      <span className="text-xs">到期：{t.dueDate}</span>
                      <span className="ml-auto font-bold text-sm">${fmt(t.amount)}</span>
                      <button onClick={()=>openTaxEdit(t)} className="text-blue-600 hover:text-blue-800 text-xs shrink-0">編輯</button>
                      {t.paymentOrderId
                        ? <Link href="/cashier" className="text-teal-600 hover:text-teal-800 text-xs underline shrink-0">前往出納</Link>
                        : <button onClick={()=>{setPayingTaxId(t.id);setTaxPayForm({accountId:'',paymentDate:todayStr()});}}
                            className="text-teal-600 hover:text-teal-800 text-xs shrink-0">確認繳納</button>
                      }
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })()}

      {taxView === 'list' && (
        <>
          <div className="flex items-center gap-3 mb-4 flex-wrap">
            <label htmlFor="f-12" className="text-sm text-gray-600">年度:</label>
            <input id="f-12" type="number" value={taxFilter.taxYear} onChange={e => setTaxFilter(f => ({ ...f, taxYear: e.target.value }))}
              className="border rounded px-2 py-1.5 w-24 text-sm" />
            <select value={taxFilter.propertyId} onChange={e => setTaxFilter(f => ({ ...f, propertyId: e.target.value }))}
              className="border rounded px-2 py-1.5 text-sm">
              <option value="">全部物業</option>
              {properties.map(p => <option key={p.id} value={p.id}>{p.name}{p.asset?.hasHouseTax || p.asset?.hasLandTax ? ` [${[p.asset?.hasHouseTax && '房屋稅', p.asset?.hasLandTax && '地價稅'].filter(Boolean).join('·')}]` : ''}</option>)}
            </select>
            <select value={taxFilter.status} onChange={e => setTaxFilter(f => ({ ...f, status: e.target.value }))}
              className="border rounded px-2 py-1.5 text-sm">
              <option value="">全部狀態</option>
              <option value="pending">待繳</option>
              <option value="paid">已繳</option>
            </select>
            <button onClick={fetchTaxes} className="bg-teal-600 text-white px-3 py-1.5 rounded text-sm hover:bg-teal-700">查詢</button>
            <button onClick={printTaxes} className="px-3 py-1.5 text-sm rounded border border-gray-300 hover:bg-gray-50">🖨️ 列印</button>
            <button onClick={() => { setEditingTax(null); setTaxForm({ propertyId: taxFilter.propertyId || '', taxYear: taxFilter.taxYear || new Date().getFullYear(), taxType: '房屋稅', dueDate: '', amount: '', certNo: '', paidDate: '', note: '' }); setShowTaxModal(true); }} className="bg-blue-600 text-white px-3 py-1.5 rounded text-sm hover:bg-blue-700 ml-auto">
              新增稅款
            </button>
          </div>
          <div className="bg-white rounded-lg shadow tbl-wrap">
            <table className="w-full text-sm">
              <thead className="bg-teal-50 sticky top-0 z-10">
                <tr>
                  <th className="text-center px-3 py-2">序號</th>
                  <th className="text-center px-3 py-2">資產編號</th>
                  <th className="text-left px-3 py-2">物業</th>
                  <th className="text-center px-3 py-2">年度</th>
                  <th className="text-left px-3 py-2">稅種</th>
                  <th className="text-left px-3 py-2">到期日</th>
                  <th className="text-left px-3 py-2">實繳日</th>
                  <th className="text-left px-3 py-2">憑證號</th>
                  <th className="text-right px-3 py-2">金額</th>
                  <th className="text-center px-3 py-2">狀態</th>
                  <th className="text-center px-3 py-2">操作</th>
                </tr>
              </thead>
              <tbody>
                {taxes.length === 0 ? (
                  <tr><td colSpan={11} className="text-center py-8 text-gray-400">暫無資料</td></tr>
                ) : taxes.map((tax, idx) => (
                  <tr key={tax.id} className="border-t hover:bg-gray-50">
                    <td className="px-3 py-2 text-center text-xs text-gray-500">{idx + 1}</td>
                    <td className="px-3 py-2 text-center text-xs text-gray-700 font-mono">{tax.property?.sortOrder ?? '—'}</td>
                    <td className="px-3 py-2">
                      <span>{tax.property?.name}</span>
                      {tax.property?.asset?.hasHouseTax && (
                        <span className="ml-1 text-xs text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">房屋稅</span>
                      )}
                      {tax.property?.asset?.hasLandTax && (
                        <span className="ml-1 text-xs text-orange-700 bg-orange-50 border border-orange-200 px-1.5 py-0.5 rounded">地價稅</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-center">{tax.taxYear}</td>
                    <td className="px-3 py-2">{tax.taxType}</td>
                    <td className="px-3 py-2">{tax.dueDate}</td>
                    <td className="px-3 py-2 text-gray-500 text-xs">{tax.paidDate || '—'}</td>
                    <td className="px-3 py-2 text-gray-500 text-xs max-w-[100px] truncate" title={tax.certNo || ''}>{tax.certNo || '—'}</td>
                    <td className="px-3 py-2 text-right font-medium">${fmt(tax.amount)}</td>
                    <td className="px-3 py-2 text-center">
                      <StatusBadge value={tax.status} list={TAX_STATUSES} />
                    </td>
                    <td className="px-3 py-2 text-center">
                      <div className="flex items-center justify-center gap-2 flex-wrap">
                        {tax.status === 'pending' && (
                          <>
                            <button onClick={() => openTaxEdit(tax)} className="text-blue-600 hover:text-blue-800 text-xs font-medium">
                              編輯
                            </button>
                            {tax.paymentOrderId ? (
                              <Link href="/cashier" className="text-teal-600 hover:text-teal-800 text-xs font-medium underline">前往出納</Link>
                            ) : (
                              <button onClick={() => { setPayingTaxId(tax.id); setTaxPayForm({ accountId: '', paymentDate: todayStr() }); }}
                                className="text-teal-600 hover:text-teal-800 text-xs font-medium">
                                確認繳納
                              </button>
                            )}
                            <button onClick={() => deleteTax(tax)} className="text-red-600 hover:text-red-800 text-xs font-medium">刪除</button>
                          </>
                        )}
                        {tax.status === 'paid' && (
                          <button onClick={() => openTaxEdit(tax)} className="text-blue-600 hover:text-blue-800 text-xs font-medium">補憑證</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Inline tax payment */}
      {payingTaxId && (
        <div className="mt-4 bg-teal-50 border border-teal-200 rounded-lg p-4">
          <h4 className="font-medium text-teal-800 mb-3">確認繳納稅款</h4>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="f-13" className="text-xs text-gray-600">付款帳戶</label>
              <select id="f-13" value={taxPayForm.accountId} onChange={e => setTaxPayForm(f => ({ ...f, accountId: e.target.value }))}
                className="w-full border rounded px-2 py-1 text-sm">
                <option value="">-- 選擇帳戶 --</option>
                {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="f-70" className="text-xs text-gray-600">付款日期</label>
              <input id="f-70" type="date" value={taxPayForm.paymentDate} onChange={e => setTaxPayForm(f => ({ ...f, paymentDate: e.target.value }))}
                className="w-full border rounded px-2 py-1 text-sm" />
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            <button onClick={confirmTaxPayment} className="bg-teal-600 text-white px-4 py-1.5 rounded text-sm hover:bg-teal-700">確認</button>
            <button onClick={() => setPayingTaxId(null)} className="bg-gray-300 text-gray-700 px-4 py-1.5 rounded text-sm hover:bg-gray-400">取消</button>
          </div>
        </div>
      )}
    </div>
  );
}
