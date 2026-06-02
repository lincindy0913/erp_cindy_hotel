'use client';

import { useState } from 'react';
import OwnerExpensesPanel from '@/components/owner-expenses/OwnerExpensesPanel';

const INVOICE_SOURCES = ['進貨單', '租屋支出', '固定費用'];
const SOURCE_COLORS = {
  '進貨單':      { bg: 'bg-gray-100',   text: 'text-gray-700',   border: 'border-gray-300',   dot: 'bg-gray-400'   },
  '租屋支出':    { bg: 'bg-purple-100', text: 'text-purple-800', border: 'border-purple-300', dot: 'bg-purple-400' },
  '業主發票私帳': { bg: 'bg-orange-100', text: 'text-orange-800', border: 'border-orange-300', dot: 'bg-orange-400' },
  '固定費用':    { bg: 'bg-blue-100',   text: 'text-blue-800',   border: 'border-blue-300',   dot: 'bg-blue-400'   },
};

export default function ReportView({
  // data
  invoices,
  allowances,
  invoiceTitles,
  privateInvoices,
  privateLoading,
  // sub tab routing
  reportSubIsOwner,
  reportSubIsPrivate,
  goReportSub,
  // report filters
  reportDateFrom,
  reportDateTo,
  reportTitle,
  reportWarehouse,
  reportType,
  setReportDateFrom,
  setReportDateTo,
  setReportTitle,
  setReportWarehouse,
  setReportType,
  fetchPrivateInvoices,
  fetchOwnerExpenseTotal,
  // private invoice form
  showPrivateForm,
  setShowPrivateForm,
  editingPrivateId,
  setEditingPrivateId,
  privateForm,
  setPrivateForm,
  privateSaving,
  savePrivateInvoice,
  deletePrivateInvoice,
  openEditPrivate,
  // navigation
  canSalesView,
  canOwnerExpense,
  goSalesView,
}) {
  const fmt = n => Number(n || 0).toLocaleString('zh-TW');

  const { todayStr } = require('@/lib/localDate');

  const activeSub = reportSubIsOwner ? 'owner' : reportSubIsPrivate ? 'private' : 'summary';

  const reportSubTabs = (
    <div className="flex flex-wrap gap-2 mb-1 bg-white rounded-lg shadow-sm border border-gray-100 p-1 w-fit">
      <button
        type="button"
        onClick={() => goReportSub('summary')}
        className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
          activeSub === 'summary' ? 'bg-green-600 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-50'
        }`}
      >
        進項報表彙總
      </button>
      <button
        type="button"
        onClick={() => goReportSub('private')}
        className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
          activeSub === 'private' ? 'bg-orange-500 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-50'
        }`}
      >
        業主私帳登錄
      </button>
      <button
        type="button"
        onClick={() => goReportSub('owner')}
        className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
          activeSub === 'owner' ? 'bg-purple-600 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-50'
        }`}
      >
        業主私帳月結
      </button>
    </div>
  );

  if (reportSubIsPrivate) {
    const privateDateFiltered = privateInvoices.filter(inv => {
      const d = inv.invoiceDate || '';
      if (reportDateFrom && d < reportDateFrom) return false;
      if (reportDateTo   && d > reportDateTo)   return false;
      return true;
    });
    const privateTotal = privateDateFiltered.reduce((s, i) => s + Number(i.totalAmount || 0), 0);
    return (
      <div className="space-y-4 mb-6">
        {reportSubTabs}
        {/* 篩選列 + 新增按鈕 */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="f-17" className="block text-xs text-gray-500 mb-1">起始日期</label>
            <input id="f-17" type="date" value={reportDateFrom} onChange={e => setReportDateFrom(e.target.value)}
              className="border rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-orange-400 outline-none" />
          </div>
          <div>
            <label htmlFor="f-7" className="block text-xs text-gray-500 mb-1">結束日期</label>
            <input id="f-7" type="date" value={reportDateTo} onChange={e => setReportDateTo(e.target.value)}
              className="border rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-orange-400 outline-none" />
          </div>
          <button type="button" onClick={() => fetchPrivateInvoices(reportDateFrom, reportDateTo)}
            className="px-3 py-1.5 text-sm rounded-lg border border-orange-300 text-orange-700 hover:bg-orange-50">
            查詢
          </button>
          <div className="ml-auto flex items-center gap-3">
            <span className="text-sm text-gray-500">{privateDateFiltered.length} 筆 · 合計 <span className="font-bold text-orange-700">NT$ {fmt(privateTotal)}</span></span>
            <button type="button"
              onClick={() => { setShowPrivateForm(true); setEditingPrivateId(null); setPrivateForm({ invoiceDate: todayStr(), invoiceNo: '', invoiceTitle: '', totalAmount: '', note: '', warehouse: '' }); }}
              className="px-4 py-1.5 text-sm rounded-lg bg-orange-500 text-white hover:bg-orange-600 font-medium">
              + 新增業主私帳
            </button>
          </div>
        </div>

        {/* 新增 / 編輯表單 */}
        {showPrivateForm && (
          <div className="bg-orange-50 border border-orange-200 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-orange-900 mb-4">{editingPrivateId ? '編輯業主私帳發票' : '新增業主私帳發票'}</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs text-gray-600 mb-1">發票日期 <span className="text-red-500">*</span></label>
                <input type="date" value={privateForm.invoiceDate}
                  onChange={e => setPrivateForm(p => ({ ...p, invoiceDate: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-orange-400 outline-none" />
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">發票號碼 <span className="text-red-500">*</span></label>
                <input type="text" value={privateForm.invoiceNo} placeholder="AB-12345678"
                  onChange={e => setPrivateForm(p => ({ ...p, invoiceNo: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-orange-400 outline-none" />
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">發票抬頭 <span className="text-red-500">*</span></label>
                <select value={privateForm.invoiceTitle}
                  onChange={e => setPrivateForm(p => ({ ...p, invoiceTitle: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-orange-400 outline-none">
                  <option value="">— 選擇抬頭 —</option>
                  {invoiceTitles.map(t => <option key={t.id} value={t.title}>{t.title}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">金額（NT$）<span className="text-red-500">*</span></label>
                <input type="number" min="0" step="1" value={privateForm.totalAmount} placeholder="0"
                  onChange={e => setPrivateForm(p => ({ ...p, totalAmount: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-1.5 text-sm text-right focus:ring-2 focus:ring-orange-400 outline-none" />
              </div>
              <div>
                <label htmlFor="f-18" className="block text-xs text-gray-600 mb-1">館別</label>
                <select id="f-18" value={privateForm.warehouse}
                  onChange={e => setPrivateForm(p => ({ ...p, warehouse: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-orange-400 outline-none">
                  <option value="">— 不限 —</option>
                  <option value="麗格">麗格</option>
                  <option value="麗軒">麗軒</option>
                  <option value="民宿">民宿</option>
                </select>
              </div>
              <div>
                <label htmlFor="f-8" className="block text-xs text-gray-600 mb-1">備註</label>
                <input id="f-8" type="text" value={privateForm.note} placeholder="備註（選填）"
                  onChange={e => setPrivateForm(p => ({ ...p, note: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-orange-400 outline-none" />
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <button type="button" onClick={savePrivateInvoice} disabled={privateSaving}
                className="px-5 py-1.5 text-sm rounded-lg bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-50 font-medium">
                {privateSaving ? '儲存中…' : '儲存'}
              </button>
              <button type="button"
                onClick={() => { setShowPrivateForm(false); setEditingPrivateId(null); }}
                className="px-4 py-1.5 text-sm rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50">
                取消
              </button>
            </div>
          </div>
        )}

        {/* 列表 */}
        {privateLoading ? (
          <div className="text-center py-12 text-gray-400">載入中…</div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-orange-50">
                <tr className="bg-orange-50 text-orange-800 text-xs">
                  {['發票日期', '發票號碼', '發票抬頭', '館別', '金額（NT$）', '備註', '操作'].map(h => (
                    <th key={h} className="px-4 py-2.5 text-left font-medium whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {privateDateFiltered.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-12 text-gray-400">
                    尚無業主私帳發票，請點「+ 新增業主私帳」建立
                  </td></tr>
                ) : privateDateFiltered.map((inv, idx) => (
                  <tr key={inv.id} className={`hover:bg-gray-50 ${idx % 2 === 1 ? 'bg-gray-50/30' : ''}`}>
                    <td className="px-4 py-2.5 whitespace-nowrap text-gray-600">{inv.invoiceDate}</td>
                    <td className="px-4 py-2.5 font-medium whitespace-nowrap">{inv.invoiceNo}</td>
                    <td className="px-4 py-2.5 whitespace-nowrap text-orange-700 font-medium">{inv.invoiceTitle || '—'}</td>
                    <td className="px-4 py-2.5 whitespace-nowrap text-gray-500">{inv.warehouse || '—'}</td>
                    <td className="px-4 py-2.5 text-right font-semibold tabular-nums whitespace-nowrap">NT$ {fmt(inv.totalAmount)}</td>
                    <td className="px-4 py-2.5 text-xs text-gray-500 max-w-xs truncate">{inv.items?.[0]?.note || '—'}</td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <div className="flex gap-1.5">
                        <button type="button" onClick={() => openEditPrivate(inv)}
                          className="text-xs px-2.5 py-1 rounded-lg border border-orange-300 text-orange-700 hover:bg-orange-50">
                          編輯
                        </button>
                        <button type="button" onClick={() => deletePrivateInvoice(inv.id)}
                          className="text-xs px-2.5 py-1 rounded-lg border border-red-200 text-red-600 hover:bg-red-50">
                          刪除
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              {privateDateFiltered.length > 0 && (
                <tfoot>
                  <tr className="bg-orange-50 font-semibold text-orange-800 text-sm">
                    <td colSpan={4} className="px-4 py-2.5">合計（{privateDateFiltered.length} 筆）</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">NT$ {fmt(privateTotal)}</td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </div>
    );
  }

  if (reportSubIsOwner) {
    return (
      <div className="space-y-4 mb-6">
        {reportSubTabs}
        <div className="text-sm text-gray-700 rounded-xl border border-orange-100 bg-orange-50/60 px-4 py-3 space-y-2">
          <p>
            在此登打<strong className="text-orange-900">業主發票私帳</strong>（依發票抬頭、每月一次）。儲存後會連動下方「進項報表彙總」頁籤中業主發票私帳卡片的金額。
          </p>
          <p className="text-xs text-gray-500">
            發票抬頭請至「設定 → 發票抬頭」維護。亦可改用頂部分頁「業主私帳月結」全畫面操作。
          </p>
        </div>
        <OwnerExpensesPanel
          embedded
          onSaved={() => fetchOwnerExpenseTotal(reportDateFrom, reportDateTo)}
        />
      </div>
    );
  }

  // summary tab
  const reportInvoices = invoices.filter(inv => {
    const d = inv.invoiceDate || '';
    if (reportDateFrom && d < reportDateFrom) return false;
    if (reportDateTo   && d > reportDateTo)   return false;
    if (reportTitle    && (inv.invoiceTitle || '') !== reportTitle) return false;
    if (reportWarehouse && (inv.warehouse || '') !== reportWarehouse) return false;
    if (reportType     && (inv.invoiceType || '進貨單') !== reportType) return false;
    return true;
  });
  const reportAllowances = allowances.filter(a => {
    const d = a.allowanceDate || '';
    if (reportDateFrom && d < reportDateFrom) return false;
    if (reportDateTo   && d > reportDateTo)   return false;
    if (reportWarehouse && (a.warehouse || '') !== reportWarehouse) return false;
    return true;
  });
  const invoiceTotal = reportInvoices.reduce((s, i) => s + Number(i.totalAmount || 0), 0);
  const allowanceTotal = reportAllowances.reduce((s, a) => s + Number(a.totalAmount || 0), 0);
  const grandTotal = invoiceTotal - allowanceTotal;

  return (
    <div className="space-y-4">
      {reportSubTabs}
      {/* 篩選列 */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="f-9" className="block text-xs text-gray-500 mb-1">起始日期</label>
            <input id="f-9" type="date" value={reportDateFrom} onChange={e => setReportDateFrom(e.target.value)}
              className="border rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-green-400 outline-none" />
          </div>
          <div>
            <label htmlFor="f-10" className="block text-xs text-gray-500 mb-1">結束日期</label>
            <input id="f-10" type="date" value={reportDateTo} onChange={e => setReportDateTo(e.target.value)}
              className="border rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-green-400 outline-none" />
          </div>
          <div>
            <label htmlFor="f-11" className="block text-xs text-gray-500 mb-1">發票抬頭</label>
            <select id="f-11" value={reportTitle} onChange={e => setReportTitle(e.target.value)}
              className="border rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-green-400 outline-none">
              <option value="">全部抬頭</option>
              {invoiceTitles.map(t => <option key={t.id} value={t.title}>{t.title}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="f-19" className="block text-xs text-gray-500 mb-1">來源</label>
            <select id="f-19" value={reportType} onChange={e => setReportType(e.target.value)}
              className="border rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-green-400 outline-none">
              <option value="">全部來源</option>
              {INVOICE_SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
              <option value="業主發票私帳">業主發票私帳</option>
            </select>
          </div>
          <div>
            <label htmlFor="f-20" className="block text-xs text-gray-500 mb-1">館別</label>
            <select id="f-20" value={reportWarehouse} onChange={e => setReportWarehouse(e.target.value)}
              className="border rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-green-400 outline-none">
              <option value="">全部館別</option>
              <option value="麗格">麗格</option>
              <option value="麗軒">麗軒</option>
              <option value="民宿">民宿</option>
            </select>
          </div>
          {(reportDateFrom || reportDateTo || reportTitle || reportWarehouse || reportType) && (
            <button onClick={() => { setReportDateFrom(''); setReportDateTo(''); setReportTitle(''); setReportWarehouse(''); setReportType(''); }}
              className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg border">
              清除
            </button>
          )}
          <div className="ml-auto text-right">
            <div className="text-xs text-gray-400">發票 {reportInvoices.length} 筆 · 折讓 {reportAllowances.length} 筆</div>
            <div className="text-lg font-bold text-green-700">淨額 NT$ {fmt(grandTotal)}</div>
          </div>
        </div>
      </div>

      {/* KPI by source */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {INVOICE_SOURCES.map(src => {
          const rows = reportInvoices.filter(i => (i.invoiceType || '進貨單') === src);
          const total = rows.reduce((s, i) => s + Number(i.totalAmount || 0), 0);
          const pct = invoiceTotal > 0 ? Math.round(total / invoiceTotal * 100) : 0;
          const c = SOURCE_COLORS[src];
          return (
            <div key={src} className={`rounded-xl border ${c.border} bg-white shadow-sm p-4`}>
              <div className="flex items-center gap-2 mb-1">
                <span className={`w-2 h-2 rounded-full ${c.dot}`} />
                <p className={`text-xs font-medium ${c.text}`}>{src}</p>
              </div>
              <p className="text-base font-bold text-gray-800">NT$ {fmt(total)}</p>
              <div className="mt-2 bg-gray-100 rounded-full h-1.5">
                <div className={`h-1.5 rounded-full ${c.dot}`} style={{ width: `${pct}%` }} />
              </div>
              <p className="text-xs text-gray-400 mt-1">{rows.length} 筆 · {pct}%</p>
            </div>
          );
        })}
        {/* 業主發票私帳：來自個別登錄 */}
        {(() => {
          const c = SOURCE_COLORS['業主發票私帳'];
          const filteredPrivate = privateInvoices.filter(inv => {
            const d = inv.invoiceDate || '';
            if (reportDateFrom && d < reportDateFrom) return false;
            if (reportDateTo   && d > reportDateTo)   return false;
            if (reportTitle    && (inv.invoiceTitle || '') !== reportTitle) return false;
            return true;
          });
          const total = filteredPrivate.reduce((s, i) => s + Number(i.totalAmount || 0), 0);
          const count = filteredPrivate.length;
          return (
            <div className={`rounded-xl border ${c.border} bg-white shadow-sm p-4`}>
              <div className="flex items-center gap-2 mb-1">
                <span className={`w-2 h-2 rounded-full ${c.dot}`} />
                <p className={`text-xs font-medium ${c.text}`}>業主發票私帳</p>
              </div>
              <p className="text-base font-bold text-gray-800">NT$ {fmt(total)}</p>
              <div className="mt-2 bg-gray-100 rounded-full h-1.5">
                <div className={`h-1.5 rounded-full ${c.dot}`} style={{ width: total > 0 ? '100%' : '0%' }} />
              </div>
              <p className="text-xs text-gray-400 mt-1">{count} 筆 · 個別登錄</p>
              {(canSalesView || canOwnerExpense) && (
                <button
                  type="button"
                  onClick={() => goReportSub('private')}
                  className="mt-2 text-xs text-orange-700 hover:underline font-medium"
                >
                  前往私帳登錄 →
                </button>
              )}
            </div>
          );
        })()}
      </div>

      {/* 業主發票私帳明細（個別登錄，獨立資料源） */}
      {(!reportType || reportType === '業主發票私帳') && (() => {
        const filteredPrivate = privateInvoices.filter(inv => {
          const d = inv.invoiceDate || '';
          if (reportDateFrom && d < reportDateFrom) return false;
          if (reportDateTo   && d > reportDateTo)   return false;
          if (reportTitle    && (inv.invoiceTitle || '') !== reportTitle) return false;
          if (reportWarehouse && (inv.warehouse || '') !== reportWarehouse) return false;
          return true;
        });
        if (filteredPrivate.length === 0) return null;
        const subTotal = filteredPrivate.reduce((s, i) => s + Number(i.totalAmount || 0), 0);
        const c = SOURCE_COLORS['業主發票私帳'];
        return (
          <div className="bg-white rounded-xl shadow-sm border border-orange-100 overflow-hidden">
            <div className={`px-4 py-2.5 border-b ${c.bg} flex items-center justify-between`}>
              <div className="flex items-center gap-2">
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${c.bg} ${c.text} border ${c.border}`}>業主發票私帳</span>
                <span className="text-xs text-gray-500">{filteredPrivate.length} 筆</span>
              </div>
              <span className={`text-sm font-bold ${c.text}`}>NT$ {fmt(subTotal)}</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10 bg-gray-50">
                  <tr className="bg-gray-50 text-gray-500 text-xs border-b">
                    <th className="px-4 py-2 text-left font-medium whitespace-nowrap">館別</th>
                    <th className="px-4 py-2 text-left font-medium whitespace-nowrap">發票抬頭</th>
                    <th className="px-4 py-2 text-left font-medium whitespace-nowrap">發票號碼</th>
                    <th className="px-4 py-2 text-left font-medium whitespace-nowrap">日期</th>
                    <th className="px-4 py-2 text-right font-medium whitespace-nowrap">金額</th>
                    <th className="px-4 py-2 text-left font-medium whitespace-nowrap">備註</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredPrivate.map((inv, idx) => (
                    <tr key={inv.id} className={idx % 2 === 1 ? 'bg-gray-50/40' : ''}>
                      <td className="px-4 py-2 text-gray-600 whitespace-nowrap">{inv.warehouse || '－'}</td>
                      <td className="px-4 py-2 text-orange-700 font-medium whitespace-nowrap">{inv.invoiceTitle || '－'}</td>
                      <td className="px-4 py-2 font-medium whitespace-nowrap">{inv.invoiceNo}</td>
                      <td className="px-4 py-2 text-gray-500 whitespace-nowrap">{inv.invoiceDate}</td>
                      <td className="px-4 py-2 text-right font-semibold tabular-nums whitespace-nowrap">NT$ {fmt(inv.totalAmount)}</td>
                      <td className="px-4 py-2 text-xs text-gray-500 whitespace-nowrap">{inv.items?.[0]?.note || '—'}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-gray-200 font-semibold text-gray-700">
                    <td colSpan={4} className="px-4 py-2 text-right text-xs">小計（{filteredPrivate.length} 筆）</td>
                    <td className="px-4 py-2 text-right tabular-nums">NT$ {fmt(subTotal)}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        );
      })()}

      {/* 折讓彙總卡片（有折讓時顯示） */}
      {reportAllowances.length > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50 shadow-sm p-4 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <span className="w-2 h-2 rounded-full bg-red-400" />
              <p className="text-xs font-medium text-red-700">進貨折讓（負數）</p>
            </div>
            <p className="text-xs text-gray-500">{reportAllowances.length} 筆折讓，已從總計扣除</p>
          </div>
          <p className="text-base font-bold text-red-700">－ NT$ {fmt(allowanceTotal)}</p>
        </div>
      )}

      {/* 明細報表 - 依來源分組 */}
      {reportInvoices.length === 0 ? (
        <div className="text-center py-16 text-gray-400 bg-white rounded-xl border">無符合條件的發票</div>
      ) : (
        <div className="space-y-4">
          {(reportType ? [reportType] : INVOICE_SOURCES).map(src => {
            const rows = reportInvoices.filter(i => (i.invoiceType || '進貨單') === src);
            if (rows.length === 0) return null;
            const subTotal = rows.reduce((s, i) => s + Number(i.totalAmount || 0), 0);
            const c = SOURCE_COLORS[src];
            return (
              <div key={src} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <div className={`px-4 py-2.5 border-b ${c.bg} flex items-center justify-between`}>
                  <div className="flex items-center gap-2">
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${c.bg} ${c.text} border ${c.border}`}>{src}</span>
                    <span className="text-xs text-gray-500">{rows.length} 筆</span>
                  </div>
                  <span className={`text-sm font-bold ${c.text}`}>NT$ {fmt(subTotal)}</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 z-10 bg-gray-50">
                      <tr className="bg-gray-50 text-gray-500 text-xs border-b">
                        <th className="px-4 py-2 text-left font-medium whitespace-nowrap">館別</th>
                        <th className="px-4 py-2 text-left font-medium whitespace-nowrap">發票抬頭</th>
                        <th className="px-4 py-2 text-left font-medium whitespace-nowrap">廠商</th>
                        <th className="px-4 py-2 text-left font-medium whitespace-nowrap">發票號碼</th>
                        <th className="px-4 py-2 text-left font-medium whitespace-nowrap">日期</th>
                        <th className="px-4 py-2 text-right font-medium whitespace-nowrap">金額</th>
                        <th className="px-4 py-2 text-left font-medium whitespace-nowrap">付款狀態</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {rows.map((inv, idx) => (
                        <tr key={inv.id} className={idx % 2 === 1 ? 'bg-gray-50/40' : ''}>
                          <td className="px-4 py-2 text-gray-600 whitespace-nowrap">{inv.warehouse || '－'}</td>
                          <td className="px-4 py-2 text-gray-700 whitespace-nowrap">{inv.invoiceTitle || '－'}</td>
                          <td className="px-4 py-2 text-gray-600 whitespace-nowrap">{inv.supplierName || '－'}</td>
                          <td className="px-4 py-2 font-medium whitespace-nowrap">{inv.invoiceNo || inv.salesNo}</td>
                          <td className="px-4 py-2 text-gray-500 whitespace-nowrap">{inv.invoiceDate}</td>
                          <td className="px-4 py-2 text-right font-semibold tabular-nums whitespace-nowrap">NT$ {fmt(inv.totalAmount)}</td>
                          <td className="px-4 py-2 whitespace-nowrap">
                            <span className={`px-1.5 py-0.5 rounded text-xs ${
                              inv.paymentStatus === '已付款' ? 'bg-green-100 text-green-800' :
                              inv.paymentStatus === '待出納' ? 'bg-yellow-100 text-yellow-800' :
                              inv.paymentStatus === '草稿'   ? 'bg-gray-100 text-gray-600' :
                              'bg-red-100 text-red-700'
                            }`}>{inv.paymentStatus || '未付款'}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-gray-200 font-semibold text-gray-700">
                        <td colSpan="5" className="px-4 py-2 text-right text-xs">小計（{rows.length} 筆）</td>
                        <td className="px-4 py-2 text-right tabular-nums">NT$ {fmt(subTotal)}</td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            );
          })}

          {/* 折讓明細表 */}
          {reportAllowances.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-red-100 overflow-hidden">
              <div className="px-4 py-2.5 border-b bg-red-50 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700 border border-red-200">進貨折讓</span>
                  <span className="text-xs text-gray-500">{reportAllowances.length} 筆</span>
                </div>
                <span className="text-sm font-bold text-red-700">－ NT$ {fmt(allowanceTotal)}</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 z-10 bg-gray-50">
                    <tr className="bg-gray-50 text-gray-500 text-xs border-b">
                      <th className="px-4 py-2 text-left font-medium whitespace-nowrap">館別</th>
                      <th className="px-4 py-2 text-left font-medium whitespace-nowrap">廠商</th>
                      <th className="px-4 py-2 text-left font-medium whitespace-nowrap">廠商折讓單號</th>
                      <th className="px-4 py-2 text-left font-medium whitespace-nowrap">原發票號</th>
                      <th className="px-4 py-2 text-left font-medium whitespace-nowrap">折讓日期</th>
                      <th className="px-4 py-2 text-right font-medium whitespace-nowrap">折讓金額</th>
                      <th className="px-4 py-2 text-left font-medium whitespace-nowrap">原因</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {reportAllowances.map((a, idx) => (
                      <tr key={a.id} className={`${idx % 2 === 1 ? 'bg-gray-50/40' : ''} text-red-700`}>
                        <td className="px-4 py-2 whitespace-nowrap">{a.warehouse || '－'}</td>
                        <td className="px-4 py-2 whitespace-nowrap">{a.supplierName || '－'}</td>
                        <td className="px-4 py-2 font-medium whitespace-nowrap">{a.creditNoteNo || '－'}</td>
                        <td className="px-4 py-2 whitespace-nowrap">{a.invoiceNo || '－'}</td>
                        <td className="px-4 py-2 whitespace-nowrap">{a.allowanceDate}</td>
                        <td className="px-4 py-2 text-right font-semibold tabular-nums whitespace-nowrap">－ NT$ {fmt(a.totalAmount)}</td>
                        <td className="px-4 py-2 text-xs text-gray-500 whitespace-nowrap">{a.reason || '－'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 總計 */}
          <div className="bg-green-50 border border-green-200 rounded-xl px-6 py-4 flex items-center justify-between">
            <div>
              <span className="text-sm font-semibold text-green-800">期間淨進項合計</span>
              <span className="ml-3 text-xs text-green-600">{reportInvoices.length} 張發票{reportAllowances.length > 0 ? `，${reportAllowances.length} 筆折讓` : ''}</span>
              {(reportDateFrom || reportDateTo) && (
                <span className="ml-2 text-xs text-gray-400">{reportDateFrom || '—'} ～ {reportDateTo || '—'}</span>
              )}
            </div>
            <div className="text-right">
              {reportAllowances.length > 0 && (
                <div className="text-xs text-gray-500 mb-0.5">發票 NT$ {fmt(invoiceTotal)} － 折讓 NT$ {fmt(allowanceTotal)}</div>
              )}
              <span className="text-xl font-bold text-green-800">NT$ {fmt(grandTotal)}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
