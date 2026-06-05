'use client';
import { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { useToast } from '@/context/ToastContext';
import { useConfirm } from '@/context/ConfirmContext';
import { sortRows, useColumnSort, SortableTh } from '@/components/SortableTh';
import { todayStr } from '@/lib/localDate';
import { getActualPaid } from '@/lib/engineering/payment-utils';
import { formatNum } from '@/lib/engineering/format-utils';

const PAY_PAGE_SIZE = 40;

export default function PaymentsTab({ paymentOrders, projects, suppliers, warehouseDepartments, onOpenPaymentModal, onRefresh }) {
  const [paySearchDateFrom, setPaySearchDateFrom] = useState('');
  const [paySearchDateTo, setPaySearchDateTo] = useState('');
  const [paySearchSupplierId, setPaySearchSupplierId] = useState('');
  const [paySearchWarehouse, setPaySearchWarehouse] = useState('');
  const [payTab, setPayTab] = useState('draft');
  const [payPage, setPayPage] = useState(1);

  const { showToast } = useToast();
  const confirm = useConfirm();
  const { sortKey: engPayKey, sortDir: engPayDir, toggleSort: engPayToggle } = useColumnSort('orderNo', 'asc');

  const payGrouped = useMemo(() => {
    const g = { '草稿': [], '待出納': [], '已執行': [], '已拒絕': [] };
    for (const o of paymentOrders) if (o.status in g) g[o.status].push(o);
    return g;
  }, [paymentOrders]);
  const draftPaymentOrders    = payGrouped['草稿'];
  const pendingPaymentOrders  = payGrouped['待出納'];
  const executedPaymentOrders = payGrouped['已執行'];
  const rejectedPaymentOrders = payGrouped['已拒絕'];

  const filteredPaymentOrders = useMemo(() => {
    const statusMap = { draft: '草稿', pending: '待出納', executed: '已執行', rejected: '已拒絕' };
    const targetStatus = statusMap[payTab];
    const base = targetStatus ? paymentOrders.filter(o => o.status === targetStatus) : paymentOrders;
    return base.filter(o => {
      if (paySearchDateFrom && (o.createdAt || '').slice(0, 10) < paySearchDateFrom) return false;
      if (paySearchDateTo && (o.createdAt || '').slice(0, 10) > paySearchDateTo) return false;
      if (paySearchSupplierId && String(o.supplierId) !== paySearchSupplierId) return false;
      if (paySearchWarehouse && (o.warehouse || '') !== paySearchWarehouse) return false;
      return true;
    });
  }, [paymentOrders, payTab, paySearchDateFrom, paySearchDateTo, paySearchSupplierId, paySearchWarehouse]);

  const sortedPaymentOrders = useMemo(() =>
    sortRows(filteredPaymentOrders, engPayKey, engPayDir, {
      orderNo: (o) => o.orderNo || '',
      summary: (o) => o.summary || '',
      supplierName: (o) => o.supplierName || '',
      warehouse: (o) => o.warehouse || '',
      netAmount: (o) => Number(o.netAmount || 0),
      poStatus: (o) => o.status || '',
      createdAt: (o) => o.createdAt || '',
    }), [filteredPaymentOrders, engPayKey, engPayDir]);

  useEffect(() => { setPayPage(1); }, [payTab, paySearchDateFrom, paySearchDateTo, paySearchSupplierId, paySearchWarehouse]);

  const pagedPaymentOrders = useMemo(() => {
    const start = (payPage - 1) * PAY_PAGE_SIZE;
    return sortedPaymentOrders.slice(start, start + PAY_PAGE_SIZE);
  }, [sortedPaymentOrders, payPage]);

  function handlePayPrint() {
    if (sortedPaymentOrders.length === 0) return;
    const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const filterInfo = [];
    if (paySearchDateFrom || paySearchDateTo) filterInfo.push(`日期: ${esc(paySearchDateFrom || '~')} ~ ${esc(paySearchDateTo || '~')}`);
    if (paySearchWarehouse) filterInfo.push(`館別: ${esc(paySearchWarehouse)}`);
    if (paySearchSupplierId) { const s = suppliers?.find(s => String(s.id) === paySearchSupplierId); filterInfo.push(`廠商: ${esc(s?.name || paySearchSupplierId)}`); }
    const w = window.open('', '_blank');
    w.document.write(`<html><head><title>工程付款單</title><style>body{font-family:'Microsoft JhengHei',sans-serif;padding:20px}table{width:100%;border-collapse:collapse;font-size:12px}th,td{border:1px solid #ccc;padding:6px 8px;text-align:left}th{background:#f5f5f5;font-weight:600}.right{text-align:right}h2{margin:0 0 4px}.info{color:#666;font-size:12px;margin-bottom:12px}@media print{button{display:none}}</style></head><body><h2>工程付款單</h2><div class="info">${filterInfo.length ? filterInfo.join('　') + '<br>' : ''}列印時間: ${esc(new Date().toLocaleString('zh-TW'))}</div><table><thead><tr><th>付款單號</th><th>摘要</th><th>廠商</th><th>館別</th><th class="right">金額</th><th>狀態</th><th>建立日期</th></tr></thead><tbody>`);
    let total = 0;
    sortedPaymentOrders.forEach(o => {
      const amt = Number(o.netAmount || 0); total += amt;
      w.document.write(`<tr><td>${esc(o.orderNo)}</td><td>${esc(o.summary) || '－'}</td><td>${esc(o.supplierName) || '－'}</td><td>${esc(o.warehouse) || '－'}</td><td class="right">${amt.toLocaleString()}</td><td>${esc(o.status)}</td><td>${o.createdAt ? esc(new Date(o.createdAt).toLocaleDateString('zh-TW')) : '－'}</td></tr>`);
    });
    w.document.write(`</tbody><tfoot><tr><td colspan="4" class="right"><strong>合計 (${sortedPaymentOrders.length} 筆)</strong></td><td class="right"><strong>${total.toLocaleString()}</strong></td><td colspan="2"></td></tr></tfoot></table><button onclick="window.print()" style="margin-top:12px;padding:8px 20px;font-size:14px;cursor:pointer">列印</button></body></html>`);
    w.document.close();
  }

  function handlePayExportExcel() {
    if (sortedPaymentOrders.length === 0) return;
    const csvEsc = (v) => { const s = String(v == null ? '' : v); return `"${s.replace(/"/g, '""').replace(/\r?\n/g, ' ')}"`; };
    const header = ['付款單號', '摘要', '廠商', '館別', '金額', '狀態', '建立日期'];
    const csvRows = [header.map(csvEsc).join(',')];
    sortedPaymentOrders.forEach(o => {
      csvRows.push([o.orderNo || '', o.summary || '', o.supplierName || '', o.warehouse || '', Number(o.netAmount || 0), o.status || '', o.createdAt ? new Date(o.createdAt).toLocaleDateString('zh-TW') : ''].map(csvEsc).join(','));
    });
    const blob = new Blob(['﻿' + csvRows.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `工程付款單_${todayStr()}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <div className="bg-white rounded-lg border border-gray-200 px-4 py-3"><p className="text-xs text-gray-500">草稿</p><p className="text-xl font-bold text-gray-700">{draftPaymentOrders.length}</p><p className="text-xs text-gray-400">NT$ {draftPaymentOrders.reduce((s, o) => s + Number(o.netAmount || 0), 0).toLocaleString()}</p></div>
        <div className="bg-white rounded-lg border border-yellow-200 px-4 py-3"><p className="text-xs text-yellow-600">待出納</p><p className="text-xl font-bold text-yellow-700">{pendingPaymentOrders.length}</p><p className="text-xs text-yellow-500">NT$ {pendingPaymentOrders.reduce((s, o) => s + Number(o.netAmount || 0), 0).toLocaleString()}</p></div>
        <div className="bg-white rounded-lg border border-green-200 px-4 py-3"><p className="text-xs text-green-600">已執行</p><p className="text-xl font-bold text-green-700">{executedPaymentOrders.length}</p><p className="text-xs text-green-500">NT$ {executedPaymentOrders.reduce((s, o) => s + Number(o.netAmount || 0), 0).toLocaleString()}</p></div>
        <div className="bg-white rounded-lg border border-red-200 px-4 py-3"><p className="text-xs text-red-500">已拒絕</p><p className="text-xl font-bold text-red-600">{rejectedPaymentOrders.length}</p><p className="text-xs text-red-400">NT$ {rejectedPaymentOrders.reduce((s, o) => s + Number(o.netAmount || 0), 0).toLocaleString()}</p></div>
      </div>

      <div className="flex gap-3 mb-4 items-center flex-wrap">
        <button onClick={() => onOpenPaymentModal?.({ projectId: '', termId: '', contractId: '', supplierId: '', supplierName: '', amount: '', netAmount: '', paymentMethod: '轉帳', accountId: '', dueDate: todayStr(), summary: '', note: '', materials: [] })} className="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 text-sm">＋ 建立付款單</button>
        <Link href="/cashier" className="text-sm text-amber-600 hover:underline">→ 至出納執行付款</Link>
        <div className="ml-auto flex gap-2">
          <button onClick={handlePayPrint} className="px-3 py-2 rounded-lg text-sm font-medium bg-white text-gray-600 hover:bg-gray-100 border border-gray-300">🖨 列印</button>
          <button onClick={handlePayExportExcel} className="px-3 py-2 rounded-lg text-sm font-medium bg-white text-green-700 hover:bg-green-50 border border-green-300">📥 匯出 CSV（Excel 可開）</button>
        </div>
      </div>

      {/* 搜尋篩選 */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-4">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 items-end">
          <div><label htmlFor="pay-f-1" className="block text-xs text-gray-500 mb-1">建立日期起</label><input id="pay-f-1" type="date" value={paySearchDateFrom} onChange={e => setPaySearchDateFrom(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" /></div>
          <div><label htmlFor="pay-f-2" className="block text-xs text-gray-500 mb-1">建立日期迄</label><input id="pay-f-2" type="date" value={paySearchDateTo} onChange={e => setPaySearchDateTo(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" /></div>
          <div><label htmlFor="pay-f-3" className="block text-xs text-gray-500 mb-1">館別</label><select id="pay-f-3" value={paySearchWarehouse} onChange={e => setPaySearchWarehouse(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"><option value="">全部館別</option>{(warehouseDepartments?.list || []).filter(w => w.type === 'building').map(w => <option key={w.id} value={w.name}>{w.name}</option>)}</select></div>
          <div><label htmlFor="pay-f-4" className="block text-xs text-gray-500 mb-1">廠商</label><select id="pay-f-4" value={paySearchSupplierId} onChange={e => setPaySearchSupplierId(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"><option value="">全部廠商</option>{(suppliers || []).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
          <div><button onClick={() => { setPaySearchDateFrom(''); setPaySearchDateTo(''); setPaySearchSupplierId(''); setPaySearchWarehouse(''); }} className="px-4 py-2 border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50 text-sm">清除</button></div>
        </div>
      </div>

      {/* 狀態分頁 */}
      <div className="flex gap-1 mb-4 border-b border-gray-200">
        {[
          { key: 'draft',    label: '草稿',  count: draftPaymentOrders.length,    active: 'border-gray-600 text-gray-800' },
          { key: 'pending',  label: '待出納', count: pendingPaymentOrders.length,  active: 'border-yellow-500 text-yellow-700' },
          { key: 'executed', label: '已執行', count: executedPaymentOrders.length, active: 'border-green-600 text-green-700' },
          { key: 'rejected', label: '已拒絕', count: rejectedPaymentOrders.length, active: 'border-red-500 text-red-600' },
        ].map(t => (
          <button key={t.key} onClick={() => setPayTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${payTab === t.key ? t.active + ' border-b-2' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            {t.label}
            <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-xs font-semibold ${payTab === t.key ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-500'}`}>{t.count}</span>
          </button>
        ))}
        <span className="ml-auto text-xs text-gray-400 self-center">共 {filteredPaymentOrders.length} 筆</span>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 sticky top-0 z-10"><tr>
              <SortableTh label="付款單號" colKey="orderNo" sortKey={engPayKey} sortDir={engPayDir} onSort={engPayToggle} className="px-4 py-2" />
              <SortableTh label="摘要" colKey="summary" sortKey={engPayKey} sortDir={engPayDir} onSort={engPayToggle} className="px-4 py-2" />
              <SortableTh label="廠商" colKey="supplierName" sortKey={engPayKey} sortDir={engPayDir} onSort={engPayToggle} className="px-4 py-2" />
              <SortableTh label="館別" colKey="warehouse" sortKey={engPayKey} sortDir={engPayDir} onSort={engPayToggle} className="px-4 py-2" />
              <SortableTh label="金額" colKey="netAmount" sortKey={engPayKey} sortDir={engPayDir} onSort={engPayToggle} className="px-4 py-2" align="right" />
              <SortableTh label="狀態" colKey="poStatus" sortKey={engPayKey} sortDir={engPayDir} onSort={engPayToggle} className="px-4 py-2" />
              <SortableTh label="建立日期" colKey="createdAt" sortKey={engPayKey} sortDir={engPayDir} onSort={engPayToggle} className="px-4 py-2" />
              <th className="px-4 py-2 text-center text-sm font-medium text-gray-700">操作</th>
            </tr></thead>
            <tbody className="divide-y">
              {sortedPaymentOrders.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">
                  {payTab === 'draft' ? '目前無草稿付款單' : payTab === 'pending' ? '目前無待出納的付款單' : payTab === 'executed' ? '目前無已執行的付款單' : '目前無已拒絕的付款單'}
                </td></tr>
              ) : pagedPaymentOrders.map(o => {
                const isExecuted = o.status === '已執行';
                const isDraft = o.status === '草稿';
                const isPending = o.status === '待出納';
                const isRejected = o.status === '已拒絕';
                const statusColor = isExecuted ? 'bg-green-100 text-green-700' : isPending ? 'bg-yellow-100 text-yellow-800' : isRejected ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-700';
                const openEdit = () => onOpenPaymentModal?.({
                  _editingId: o.id,
                  projectId: '', termId: o.sourceRecordId ? String(o.sourceRecordId) : '', contractId: '',
                  supplierId: o.supplierId ? String(o.supplierId) : '', supplierName: o.supplierName || '',
                  amount: String(o.amount || o.netAmount), netAmount: String(o.netAmount),
                  paymentMethod: o.paymentMethod || '轉帳', accountId: o.accountId ? String(o.accountId) : '',
                  dueDate: o.dueDate || '', summary: o.summary || '', note: o.note || '', materials: [],
                });
                return (
                  <tr key={o.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2 font-mono">{o.orderNo}</td>
                    <td className="px-4 py-2">{o.summary || '－'}</td>
                    <td className="px-4 py-2">{o.supplierName || '－'}</td>
                    <td className="px-4 py-2">{o.warehouse || '－'}</td>
                    <td className="px-4 py-2 text-right font-medium">{formatNum(o.netAmount)}</td>
                    <td className="px-4 py-2"><span className={`px-2 py-0.5 rounded text-xs ${statusColor}`}>{o.status}</span></td>
                    <td className="px-4 py-2 text-sm text-gray-500">{o.createdAt ? new Date(o.createdAt).toLocaleDateString('zh-TW') : '－'}</td>
                    <td className="px-4 py-2 text-center">
                      {isExecuted ? (
                        <span className="text-xs text-gray-400">已執行</span>
                      ) : isPending ? (
                        <div className="flex items-center justify-center gap-2">
                          <Link href="/cashier" className="text-amber-600 hover:underline text-xs whitespace-nowrap">→ 至出納</Link>
                          <button onClick={openEdit} className="text-amber-600 hover:underline text-xs">編輯</button>
                          <button onClick={async () => {
                            if (!(await confirm(`確定要刪除付款單 ${o.orderNo}？`, { title: '刪除確認', danger: true }))) return;
                            const res = await fetch(`/api/payment-orders/${o.id}`, { method: 'DELETE' });
                            if (res.ok) { showToast('付款單已刪除', 'success'); onRefresh?.(); }
                            else { const d = await res.json(); showToast((typeof d.error === 'string' ? d.error : d.error?.message) || '刪除失敗', 'error'); }
                          }} className="text-red-500 hover:underline text-xs">刪除</button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-center gap-2">
                          <button onClick={openEdit} className="text-amber-600 hover:underline text-xs">編輯</button>
                          {(isDraft || isRejected) && (
                            <button onClick={async () => {
                              if (!(await confirm(`確定要將付款單 ${o.orderNo} 送出出納？`, { title: '送出確認', danger: false }))) return;
                              const action = isRejected ? 'resubmit' : 'submit';
                              const res = await fetch(`/api/payment-orders/${o.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }) });
                              if (res.ok) { showToast('付款單已送出，請至出納執行匯款', 'success', { href: '/cashier', label: '→ 前往出納' }); onRefresh?.(); setPayTab('pending'); }
                              else { const d = await res.json(); showToast((typeof d.error === 'string' ? d.error : d.error?.message) || '送出失敗', 'error'); }
                            }} className="text-blue-600 hover:underline text-xs">送出出納</button>
                          )}
                          <button onClick={async () => {
                            if (!(await confirm(`確定要刪除付款單 ${o.orderNo}？`, { title: '刪除確認', danger: true }))) return;
                            const res = await fetch(`/api/payment-orders/${o.id}`, { method: 'DELETE' });
                            if (res.ok) { showToast('付款單已刪除', 'success'); onRefresh?.(); }
                            else { const d = await res.json(); showToast((typeof d.error === 'string' ? d.error : d.error?.message) || '刪除失敗', 'error'); }
                          }} className="text-red-500 hover:underline text-xs">刪除</button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {sortedPaymentOrders.length > PAY_PAGE_SIZE && (
          <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-t border-gray-100 bg-gray-50/80 text-sm">
            <span className="text-gray-600">第 {(payPage - 1) * PAY_PAGE_SIZE + 1}–{Math.min(payPage * PAY_PAGE_SIZE, sortedPaymentOrders.length)} 筆，共 {sortedPaymentOrders.length} 筆</span>
            <div className="flex items-center gap-2">
              <button type="button" disabled={payPage <= 1} onClick={() => setPayPage(p => Math.max(1, p - 1))} className="px-3 py-1 rounded-lg border border-gray-300 bg-white disabled:opacity-40 hover:bg-gray-50">上一頁</button>
              <span className="text-gray-500">{payPage} / {Math.max(1, Math.ceil(sortedPaymentOrders.length / PAY_PAGE_SIZE))}</span>
              <button type="button" disabled={payPage >= Math.ceil(sortedPaymentOrders.length / PAY_PAGE_SIZE)} onClick={() => setPayPage(p => Math.min(Math.ceil(sortedPaymentOrders.length / PAY_PAGE_SIZE), p + 1))} className="px-3 py-1 rounded-lg border border-gray-300 bg-white disabled:opacity-40 hover:bg-gray-50">下一頁</button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
