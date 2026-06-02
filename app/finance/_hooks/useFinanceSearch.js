'use client';

import { useState, useMemo } from 'react';
import { sortRows, useColumnSort } from '@/components/SortableTh';
import { todayStr } from '@/lib/localDate';

export function useFinanceSearch({ orders = [], suppliers = [], paymentMethodOptions = [] } = {}) {
  const [finSearchDateFrom, setFinSearchDateFrom] = useState('');
  const [finSearchDateTo, setFinSearchDateTo] = useState('');
  const [finSearchWarehouse, setFinSearchWarehouse] = useState('');
  const [finSearchSupplierId, setFinSearchSupplierId] = useState('');
  const [finSearchPaymentMethod, setFinSearchPaymentMethod] = useState('');

  // Tab filter
  const draftOrders = orders.filter(o => o.status === '草稿');
  const pendingOrders = orders.filter(o => o.status === '待出納');
  const executedOrders = orders.filter(o => o.status === '已執行');
  const rejectedOrders = orders.filter(o => o.status === '已拒絕');
  const advancedOrders = orders.filter(o => o.status === '已代墊');
  const returnedOrders = orders.filter(o => o.status === '已退貨');

  const TABS = [
    { key: 'draft', label: '草稿', count: draftOrders.length, color: 'bg-gray-100 text-gray-800' },
    { key: 'pending', label: '待出納', count: pendingOrders.length, color: 'bg-yellow-100 text-yellow-800' },
    { key: 'executed', label: '已執行', count: executedOrders.length, color: 'bg-green-100 text-green-800' },
    { key: 'rejected', label: '已拒絕', count: rejectedOrders.length, color: 'bg-red-100 text-red-800' },
    ...(advancedOrders.length > 0 ? [{ key: 'advanced', label: '已代墊', count: advancedOrders.length, color: 'bg-purple-100 text-purple-800' }] : []),
    ...(returnedOrders.length > 0 ? [{ key: 'returned', label: '已退貨', count: returnedOrders.length, color: 'bg-orange-100 text-orange-800' }] : []),
  ];

  function getDisplayOrders(activeTab) {
    switch (activeTab) {
      case 'draft': return draftOrders;
      case 'pending': return pendingOrders;
      case 'executed': return executedOrders;
      case 'rejected': return rejectedOrders;
      case 'advanced': return advancedOrders;
      case 'returned': return returnedOrders;
      default: return orders;
    }
  }

  function getFilteredDisplayOrders(activeTab) {
    const rawDisplayOrders = getDisplayOrders(activeTab);
    return rawDisplayOrders.filter(o => {
      if (finSearchDateFrom) {
        const d = (o.createdAt || '').slice(0, 10);
        if (d < finSearchDateFrom) return false;
      }
      if (finSearchDateTo) {
        const d = (o.createdAt || '').slice(0, 10);
        if (d > finSearchDateTo) return false;
      }
      if (finSearchWarehouse && (o.warehouse || '') !== finSearchWarehouse) return false;
      if (finSearchSupplierId && String(o.supplierId || '') !== finSearchSupplierId) return false;
      if (finSearchPaymentMethod && (o.paymentMethod || '') !== finSearchPaymentMethod) return false;
      return true;
    });
  }

  const { sortKey: finSortKey, sortDir: finSortDir, toggleSort: toggleFinSort } = useColumnSort('createdAt', 'desc');

  function getSortedDisplayOrders(displayOrders) {
    return sortRows(displayOrders, finSortKey, finSortDir, {
      orderNo: (o) => o.orderNo || '',
      supplierName: (o) => o.supplierName || '',
      warehouse: (o) => o.warehouse || '',
      paymentMethod: (o) => o.paymentMethod || '',
      invoiceCount: (o) => o.invoices?.length || 0,
      discount: (o) => Number(o.discount || 0),
      netAmount: (o) => Number(o.netAmount || 0),
      status: (o) => o.status || '',
      createdAt: (o) => o.createdAt || '',
    });
  }

  function handleFinExportExcel(sortedDisplayOrders, activeTab) {
    const rows = sortedDisplayOrders;
    if (rows.length === 0) { return false; }
    const header = ['付款單號', '廠商', '館別', '付款方式', '發票數', '折讓', '淨額', '狀態', '建立日期'];
    const csvRows = [header.join(',')];
    rows.forEach(o => {
      csvRows.push([
        o.orderNo || '',
        (o.supplierName || '').replace(/,/g, '，'),
        o.warehouse || '',
        o.paymentMethod || '',
        (o.invoices?.length || 0),
        Number(o.discount || 0),
        Number(o.netAmount || 0),
        o.status || '',
        o.createdAt ? new Date(o.createdAt).toLocaleDateString('zh-TW') : ''
      ].map(c => `"${c}"`).join(','));
    });
    const blob = new Blob(['﻿' + csvRows.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `付款單_${todayStr()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    return true;
  }

  function handlePrintFilteredByWarehouse(sortedDisplayOrders, activeTab, filterInfo) {
    const rows = sortedDisplayOrders;
    if (rows.length === 0) return false;
    const groups = {};
    rows.forEach(o => { const k = o.warehouse || '未指定館別'; if (!groups[k]) groups[k] = []; groups[k].push(o); });
    const w = window.open('', '_blank');
    if (!w) return false;
    w.document.write(`<html><head><title>付款單 — 按館別列印</title>
      <style>body{font-family:'Microsoft JhengHei',sans-serif;padding:20px}
      table{width:100%;border-collapse:collapse;font-size:12px;margin-bottom:20px}
      th,td{border:1px solid #ccc;padding:6px 8px;text-align:left}
      th{background:#f5f5f5;font-weight:600} .right{text-align:right}
      h2{margin:0 0 4px} h3{margin:16px 0 8px} .info{color:#666;font-size:12px;margin-bottom:12px}
      .page-break{page-break-before:always}
      @media print{button{display:none}}</style></head><body>
      <h2>付款管理 — ${activeTab === 'draft' ? '草稿' : activeTab === 'pending' ? '待出納' : activeTab === 'executed' ? '已執行' : '已拒絕'}</h2>
      <div class="info">${filterInfo.length ? filterInfo.join('　') + '<br>' : ''}列印時間: ${new Date().toLocaleString('zh-TW')}</div>`);
    let first = true;
    Object.entries(groups).sort().forEach(([wh, list]) => {
      if (!first) w.document.write('<div class="page-break"></div>');
      first = false;
      const total = list.reduce((s, o) => s + Number(o.netAmount || 0), 0);
      w.document.write(`<h3>館別: ${wh} (${list.length} 筆)</h3>
      <table><thead><tr><th>付款單號</th><th>廠商</th><th>付款方式</th><th class="right">淨額</th><th>狀態</th><th>建立日期</th></tr></thead><tbody>`);
      list.forEach(o => {
        w.document.write(`<tr><td>${o.orderNo}</td><td>${o.supplierName || '－'}</td><td>${o.paymentMethod || '－'}</td>
          <td class="right">${Number(o.netAmount || 0).toLocaleString()}</td><td>${o.status}</td>
          <td>${o.createdAt ? new Date(o.createdAt).toLocaleDateString('zh-TW') : '－'}</td></tr>`);
      });
      w.document.write(`</tbody><tfoot><tr><td colspan="3" class="right"><strong>小計</strong></td>
        <td class="right"><strong>${total.toLocaleString()}</strong></td><td colspan="2"></td></tr></tfoot></table>`);
    });
    const grandTotal = rows.reduce((s, o) => s + Number(o.netAmount || 0), 0);
    w.document.write(`<div style="font-size:14px;font-weight:700;margin-top:8px">總計: ${rows.length} 筆, NT$ ${grandTotal.toLocaleString()}</div>
    <button onclick="window.print()" style="margin-top:12px;padding:8px 20px;font-size:14px;cursor:pointer">列印</button></body></html>`);
    w.document.close();
    return true;
  }

  return {
    finSearchDateFrom, setFinSearchDateFrom,
    finSearchDateTo, setFinSearchDateTo,
    finSearchWarehouse, setFinSearchWarehouse,
    finSearchSupplierId, setFinSearchSupplierId,
    finSearchPaymentMethod, setFinSearchPaymentMethod,
    draftOrders,
    pendingOrders,
    executedOrders,
    rejectedOrders,
    advancedOrders,
    returnedOrders,
    TABS,
    finSortKey,
    finSortDir,
    toggleFinSort,
    getDisplayOrders,
    getFilteredDisplayOrders,
    getSortedDisplayOrders,
    handleFinExportExcel,
    handlePrintFilteredByWarehouse,
  };
}
