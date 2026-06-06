'use client';

import { useState } from 'react';
import FetchErrorBanner from '@/components/FetchErrorBanner';
import ExportButtons from '@/components/ExportButtons';
import WhQuickBtns from '../_components/WhQuickBtns';
import { inputCls, btnCls } from '../_constants';

const NT = (v) => `NT$ ${Number(v || 0).toLocaleString()}`;

const OI_CATEGORIES = ['停車費', '清潔費', '設備租借', '其他'];

export default function OtherIncomeTab({
  // 其他收入
  oiRows,
  oiLoading,
  oiError,
  fetchOtherIncome,
  oiMonth,
  setOiMonth,
  oiWarehouse,
  setOiWarehouse,
  oiModalOpen,
  setOiModalOpen,
  oiEditRow,
  oiForm,
  setOiForm,
  oiSaving,
  saveOtherIncome,
  deleteOtherIncome,
  openOiModal,
  // 月固定費用模板
  recurringTemplates,
  recurringError,
  showRecurringMgr,
  setShowRecurringMgr,
  recurringForm,
  setRecurringForm,
  fetchRecurringTemplates,
  saveRecurringTemplate,
  deleteRecurringTemplate,
  recurringDraftMonth,
  setRecurringDraftMonth,
  recurringDrafting,
  createRecurringDrafts,
  // 共用
  warehouseList,
  showToast,
  confirm,
}) {
  const [subTab, setSubTab] = useState('income');

  return (
    <div>
      {/* 子分頁列 */}
      <div className="flex gap-1 mb-4 border-b border-indigo-100">
        {[
          { key: 'income',   label: '其他收入明細' },
          { key: 'template', label: '固定費用模板' },
        ].map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setSubTab(key)}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors
              ${subTab === key
                ? 'bg-indigo-600 text-white border border-indigo-600 border-b-0 -mb-px'
                : 'text-indigo-600 hover:bg-indigo-50 border border-transparent'
              }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── 子頁：固定費用模板 ── */}
      {subTab === 'template' && (
        <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-semibold text-indigo-800">月固定費用模板</h4>
            <button
              onClick={() => { setShowRecurringMgr(!showRecurringMgr); if (!showRecurringMgr) fetchRecurringTemplates(); }}
              className="text-xs text-indigo-600 border border-indigo-300 px-2.5 py-1 rounded hover:bg-indigo-100"
            >
              {showRecurringMgr ? '收起' : '管理模板'}
            </button>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <label className="text-xs text-indigo-700">建立月份草稿：</label>
            <input
              type="month"
              value={recurringDraftMonth}
              onChange={e => setRecurringDraftMonth(e.target.value)}
              className="border border-indigo-300 rounded px-2 py-1 text-sm bg-white"
            />
            <button
              onClick={createRecurringDrafts}
              disabled={recurringDrafting}
              className="px-3 py-1 text-sm bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50"
            >
              {recurringDrafting ? '建立中…' : '建立本月草稿'}
            </button>
            <span className="text-xs text-indigo-500">（依模板建立草稿，已存在的自動跳過）</span>
          </div>
          {showRecurringMgr && (
            <div className="mt-4 space-y-3">
              <div className="grid grid-cols-5 gap-2">
                {[
                  { key: 'warehouse',   placeholder: '館別',              type: 'text' },
                  { key: 'category',    placeholder: '科目（如：清潔費）', type: 'text' },
                  { key: 'description', placeholder: '描述（如：清潔員薪資）', type: 'text' },
                  { key: 'defaultAmt',  placeholder: '預設金額',          type: 'number' },
                ].map(f => (
                  <input
                    key={f.key}
                    type={f.type}
                    placeholder={f.placeholder}
                    value={recurringForm[f.key]}
                    onChange={e => setRecurringForm(p => ({ ...p, [f.key]: e.target.value }))}
                    className="border rounded px-2 py-1.5 text-sm"
                  />
                ))}
                <button
                  onClick={saveRecurringTemplate}
                  className="px-3 py-1.5 text-sm bg-indigo-600 text-white rounded hover:bg-indigo-700"
                >
                  新增
                </button>
              </div>
              <div className="space-y-1">
                {recurringError && (
                  <p className="text-xs text-red-500">{recurringError}</p>
                )}
                {!recurringError && recurringTemplates.length === 0 && (
                  <p className="text-xs text-indigo-400">尚無模板</p>
                )}
                {recurringTemplates.map(t => (
                  <div
                    key={t.id}
                    className="flex items-center gap-3 bg-white rounded px-3 py-1.5 text-xs border border-indigo-100"
                  >
                    <span className="text-indigo-600 font-medium">{t.warehouse}</span>
                    <span className="text-gray-600">{t.category}</span>
                    <span className="text-gray-700 flex-1">{t.description}</span>
                    <span className="font-semibold text-indigo-700">NT${Number(t.defaultAmt).toLocaleString()}</span>
                    <button
                      onClick={() => confirm(`確定停用模板「${t.description}」？`, () => deleteRecurringTemplate(t.id), '停用')}
                      className="text-red-400 hover:text-red-600 hover:underline"
                    >
                      停用
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── 子頁：其他收入明細 ── */}
      {subTab === 'income' && (
        <div>
          {/* 篩選列 */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-4 flex flex-wrap gap-3 items-end">
            <div>
              <label htmlFor="f-20" className="block text-xs text-gray-500 mb-1">月份</label>
              <input id="f-20" type="month" value={oiMonth} onChange={e => setOiMonth(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label htmlFor="f-21" className="block text-xs text-gray-500 mb-1">館別</label>
              <select id="f-21" value={oiWarehouse} onChange={e => setOiWarehouse(e.target.value)} className={inputCls}>
                <option value="">全部</option>
                {warehouseList.map(w => <option key={w} value={w}>{w}</option>)}
              </select>
              <WhQuickBtns list={warehouseList} value={oiWarehouse} onChange={setOiWarehouse} />
            </div>
            <button
              onClick={fetchOtherIncome}
              disabled={oiLoading}
              className={`${btnCls} bg-indigo-50 text-indigo-700 disabled:opacity-40`}
            >
              {oiLoading ? '載入中…' : '查詢'}
            </button>
            <button
              onClick={() => openOiModal(null)}
              className={`${btnCls} bg-indigo-600 text-white hover:bg-indigo-700`}
            >
              + 新增其他收入
            </button>
            {oiRows.length > 0 && (
              <ExportButtons
                data={oiRows.map(r => ({
                  importMonth: r.importMonth,
                  warehouse: r.warehouse,
                  incomeDate: r.incomeDate,
                  category: r.category || '',
                  description: r.description,
                  amount: r.amount,
                  note: r.note || '',
                }))}
                columns={[
                  { header: '月份', key: 'importMonth' },
                  { header: '館別', key: 'warehouse' },
                  { header: '日期', key: 'incomeDate' },
                  { header: '類別', key: 'category' },
                  { header: '說明', key: 'description' },
                  { header: '金額', key: 'amount', format: 'number' },
                  { header: '備註', key: 'note' },
                ]}
                filename={`其他收入_${oiMonth}${oiWarehouse ? '_' + oiWarehouse : ''}`}
                title={`其他收入 ${oiMonth}${oiWarehouse ? '　' + oiWarehouse : ''}`}
              />
            )}
            {oiRows.length > 0 && (
              <span className="text-sm text-gray-500 ml-2">
                合計 <b className="text-indigo-700">{NT(oiRows.reduce((s, r) => s + Number(r.amount), 0))}</b>（{oiRows.length} 筆）
              </span>
            )}
          </div>

          {/* 資料表格 */}
          {oiError && <FetchErrorBanner message={oiError} onRetry={fetchOtherIncome} />}
          {oiLoading && <div className="text-center py-20 text-gray-400">載入中…</div>}
          {!oiLoading && oiRows.length === 0 && (
            <div className="text-center py-20 text-gray-400">請選擇月份後按「查詢」，或按「+ 新增其他收入」</div>
          )}
          {!oiLoading && oiRows.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 tbl-wrap">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10 bg-indigo-50">
                  <tr className="bg-indigo-50 text-indigo-800 text-xs">
                    <th className="px-3 py-2 text-left">月份</th>
                    <th className="px-3 py-2 text-left">館別</th>
                    <th className="px-3 py-2 text-left">日期</th>
                    <th className="px-3 py-2 text-left">類別</th>
                    <th className="px-3 py-2 text-left">說明</th>
                    <th className="px-3 py-2 text-right">金額</th>
                    <th className="px-3 py-2 text-left">備註</th>
                    <th className="px-3 py-2 text-center">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {oiRows.map(r => (
                    <tr key={r.id} className="hover:bg-gray-50">
                      <td className="px-3 py-2 text-xs text-gray-500">{r.importMonth}</td>
                      <td className="px-3 py-2 text-xs">{r.warehouse}</td>
                      <td className="px-3 py-2 text-xs text-gray-600">{r.incomeDate}</td>
                      <td className="px-3 py-2 text-xs">
                        {r.category
                          ? <span className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 text-xs">{r.category}</span>
                          : '—'}
                      </td>
                      <td className="px-3 py-2">{r.description}</td>
                      <td className="px-3 py-2 text-right font-medium text-indigo-700">{NT(r.amount)}</td>
                      <td className="px-3 py-2 text-xs text-gray-400">{r.note || '—'}</td>
                      <td className="px-3 py-2 text-center whitespace-nowrap">
                        <button
                          onClick={() => openOiModal(r)}
                          className="text-xs px-2 py-1 rounded border border-gray-300 text-gray-600 hover:bg-gray-50 mr-1"
                        >
                          編輯
                        </button>
                        <button
                          onClick={() => confirm(`確定刪除「${r.description}」？`, () => deleteOtherIncome(r.id), '刪除')}
                          className="text-xs px-2 py-1 rounded border border-red-200 text-red-400 hover:bg-red-50"
                        >
                          刪除
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* 新增/編輯 Modal */}
          {oiModalOpen && (
            <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
              <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
                <h3 className="text-lg font-bold mb-4">{oiEditRow ? '編輯其他收入' : '新增其他收入'}</h3>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="f-22" className="block text-xs text-gray-500 mb-1">月份 *</label>
                      <input id="f-22" type="month" value={oiForm.importMonth}
                        onChange={e => setOiForm(f => ({ ...f, importMonth: e.target.value }))}
                        className="w-full border rounded-lg px-3 py-1.5 text-sm" />
                    </div>
                    <div>
                      <label htmlFor="f-23" className="block text-xs text-gray-500 mb-1">日期 *</label>
                      <input id="f-23" type="date" value={oiForm.incomeDate}
                        onChange={e => setOiForm(f => ({ ...f, incomeDate: e.target.value }))}
                        className="w-full border rounded-lg px-3 py-1.5 text-sm" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="f-24" className="block text-xs text-gray-500 mb-1">館別 *</label>
                      <select id="f-24" value={oiForm.warehouse}
                        onChange={e => setOiForm(f => ({ ...f, warehouse: e.target.value }))}
                        className="w-full border rounded-lg px-3 py-1.5 text-sm">
                        {warehouseList.map(w => <option key={w} value={w}>{w}</option>)}
                      </select>
                    </div>
                    <div>
                      <label htmlFor="f-35" className="block text-xs text-gray-500 mb-1">類別</label>
                      <select id="f-35" value={oiForm.category}
                        onChange={e => setOiForm(f => ({ ...f, category: e.target.value }))}
                        className="w-full border rounded-lg px-3 py-1.5 text-sm">
                        <option value="">請選擇</option>
                        {OI_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label htmlFor="f-36" className="block text-xs text-gray-500 mb-1">說明 *</label>
                    <input id="f-36" type="text" value={oiForm.description}
                      onChange={e => setOiForm(f => ({ ...f, description: e.target.value }))}
                      placeholder="例：5月停車費"
                      className="w-full border rounded-lg px-3 py-1.5 text-sm" />
                  </div>
                  <div>
                    <label htmlFor="f-37" className="block text-xs text-gray-500 mb-1">金額 *</label>
                    <input id="f-37" type="number" value={oiForm.amount}
                      onChange={e => setOiForm(f => ({ ...f, amount: e.target.value }))}
                      placeholder="0"
                      className="w-full border rounded-lg px-3 py-1.5 text-sm" />
                  </div>
                  <div>
                    <label htmlFor="f-38" className="block text-xs text-gray-500 mb-1">備註</label>
                    <input id="f-38" type="text" value={oiForm.note}
                      onChange={e => setOiForm(f => ({ ...f, note: e.target.value }))}
                      className="w-full border rounded-lg px-3 py-1.5 text-sm" />
                  </div>
                </div>
                <div className="flex gap-3 mt-5">
                  <button
                    onClick={saveOtherIncome}
                    disabled={oiSaving}
                    className="flex-1 bg-indigo-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {oiSaving ? '儲存中…' : '儲存'}
                  </button>
                  <button
                    onClick={() => setOiModalOpen(false)}
                    className="flex-1 border rounded-lg py-2 text-sm text-gray-600 hover:bg-gray-50"
                  >
                    取消
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
