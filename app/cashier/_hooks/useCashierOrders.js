'use client';

import { useState } from 'react';
import { useToast } from '@/context/ToastContext';
import { todayStr, localDateStr } from '@/lib/localDate';

export function defaultCashierDateRange() {
  const now = new Date();
  const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 2, 1);
  return {
    from: `${threeMonthsAgo.getFullYear()}-${String(threeMonthsAgo.getMonth() + 1).padStart(2, '0')}-01`,
    to: localDateStr(now),
  };
}

// Determine the correct display order number based on source
export function getDisplayOrderNo(order) {
  if (order.paymentMethod === '支票' && order.checkNo) return order.checkNo;
  if ((order.summary || '').includes('貸款還款') && order.orderNo.startsWith('PAY-')) {
    return order.orderNo.replace(/^PAY-/, 'LN-');
  }
  const s = order.summary || '';
  if ((s.includes('租賃') || s.includes('房屋稅') || s.includes('地價稅') || s.includes('維護費')) && (order.orderNo.startsWith('PAY-') || order.orderNo.startsWith('TC-'))) {
    return order.orderNo.replace(/^(PAY-|TC-)/, 'RENT-');
  }
  return order.orderNo;
}

// 根據 sourceType + 付款單號前綴 + 摘要 判斷所屬類別
export function getSourceCategory(sourceType, order) {
  if (sourceType) {
    if (['payment_order', 'purchasing', 'check_reissue'].includes(sourceType)) return '進銷存';
    if (['common_expense', 'fixed_expense', 'expense'].includes(sourceType)) return '固定費用';
    if (['rental_deposit_out', 'rental_deposit_in', 'rental'].includes(sourceType)) return '租屋';
    if (['loan_predeposit', 'loan_payment'].includes(sourceType)) return '貸款';
    if (sourceType === 'engineering') return '工程';
    if (sourceType === 'bnb_ota_commission') return '民宿/OTA';
  }
  if (order) {
    const no = order.orderNo || '';
    const summary = order.summary || '';
    if (no.startsWith('LN-') || summary.includes('貸款')) return '貸款';
    if (no.startsWith('RENT-') || no.startsWith('TC-') || summary.includes('租賃') || summary.includes('房屋稅') || summary.includes('地價稅') || summary.includes('維護費')) return '租屋';
    if (summary.includes('工程') || no.startsWith('ENG-')) return '工程';
    if (no.startsWith('PAY-') && (summary.includes('進貨') || summary.includes('採購'))) return '進銷存';
    if (summary.includes('水電費') || summary.includes('支出') || summary.includes('固定費用') || summary.includes('薪資') || summary.includes('勞保') || summary.includes('健保') || summary.includes('電話費') || summary.includes('網路費') || summary.includes('保險') || summary.includes('租金')) return '固定費用';
    if (no.startsWith('PAY-') && summary.includes('—')) return '固定費用';
  }
  if (sourceType) return sourceType;
  return '固定費用';
}

export const SOURCE_OPTIONS = [
  { value: '', label: '全部來源' },
  { value: '進銷存', label: '進銷存' },
  { value: '固定費用', label: '固定費用' },
  { value: '租屋', label: '租屋' },
  { value: '貸款', label: '貸款' },
  { value: '工程', label: '工程' },
  { value: '民宿/OTA', label: '民宿/OTA' },
];

export function useCashierOrders() {
  const { showToast } = useToast();

  const _defaultRange = defaultCashierDateRange();
  const [orders, setOrders] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [warehousesList, setWarehousesList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(null);
  const [searchFilter, setSearchFilter] = useState({
    dateFrom: _defaultRange.from,
    dateTo: _defaultRange.to,
    warehouse: '',
    supplierId: '',
    sourceType: '',
  });

  async function fetchAll() {
    setLoading(true);
    setFetchError(null);
    try {
      await Promise.all([fetchOrders(), fetchAccounts(), fetchSuppliers(), fetchWarehouses()]);
    } catch (e) {
      setFetchError('出納資料載入失敗，請重新整理頁面。');
    } finally {
      setLoading(false);
    }
  }

  async function fetchSuppliers() {
    try {
      const res = await fetch('/api/suppliers?all=true');
      const data = await res.json();
      setSuppliers(Array.isArray(data) ? data : []);
    } catch { setSuppliers([]); }
  }

  async function fetchWarehouses() {
    try {
      const res = await fetch('/api/warehouse-departments');
      const data = await res.json();
      setWarehousesList(Array.isArray(data?.list) ? data.list.filter(w => w.type === 'building') : []);
    } catch { setWarehousesList([]); }
  }

  async function fetchOrders(overrideFilter) {
    const filter = overrideFilter || searchFilter;
    try {
      const params = new URLSearchParams();
      if (filter.dateFrom) params.append('dateFrom', filter.dateFrom);
      if (filter.dateTo) params.append('dateTo', filter.dateTo);
      if (filter.warehouse) params.append('warehouse', filter.warehouse);
      if (filter.supplierId) params.append('supplierId', filter.supplierId);
      const url = `/api/payment-orders?${params.toString()}`;
      const res = await fetch(url);
      const data = await res.json();
      setOrders(Array.isArray(data) ? data : []);
    } catch (e) { setOrders([]); setFetchError('付款單載入失敗，請重試。'); }
  }

  async function fetchAccounts() {
    try {
      const res = await fetch('/api/cashflow/accounts');
      const data = await res.json();
      setAccounts(Array.isArray(data) ? data : []);
    } catch { setAccounts([]); }
  }

  function handleSearch() {
    setLoading(true);
    fetchOrders().finally(() => setLoading(false));
  }

  function clearSearch() {
    const range = defaultCashierDateRange();
    const newFilter = {
      dateFrom: range.from,
      dateTo: range.to,
      warehouse: '',
      supplierId: '',
      sourceType: '',
    };
    setSearchFilter(newFilter);
    setLoading(true);
    const params = new URLSearchParams({ dateFrom: range.from, dateTo: range.to });
    fetch(`/api/payment-orders?${params}`)
      .then(r => r.json())
      .then(data => setOrders(Array.isArray(data) ? data : []))
      .catch(() => setOrders([]))
      .finally(() => setLoading(false));
  }

  function loadAllHistory() {
    setSearchFilter(f => ({ ...f, dateFrom: '', dateTo: '' }));
    setLoading(true);
    fetch('/api/payment-orders')
      .then(r => r.json())
      .then(data => setOrders(Array.isArray(data) ? data : []))
      .catch(() => setOrders([]))
      .finally(() => setLoading(false));
  }

  function handlePrint(sortedRows, activeTab, TABS) {
    const rows = sortedRows;
    if (rows.length === 0) { showToast('無資料可列印', 'error'); return; }
    const tabLabel = TABS.find(t => t.key === activeTab)?.label || activeTab;
    const filterInfo = [];
    if (searchFilter.dateFrom || searchFilter.dateTo) filterInfo.push(`日期: ${searchFilter.dateFrom || '~'} ~ ${searchFilter.dateTo || '~'}`);
    if (searchFilter.warehouse) filterInfo.push(`館別: ${searchFilter.warehouse}`);
    if (searchFilter.sourceType) filterInfo.push(`類別: ${searchFilter.sourceType}`);
    const w = window.open('', '_blank');
    w.document.write(`<html><head><title>出納 - ${tabLabel}</title>
      <style>body{font-family:'Microsoft JhengHei',sans-serif;padding:20px}
      table{width:100%;border-collapse:collapse;font-size:12px}
      th,td{border:1px solid #ccc;padding:6px 8px;text-align:left}
      th{background:#f5f5f5;font-weight:600}
      .right{text-align:right} .center{text-align:center}
      h2{margin:0 0 4px} .info{color:#666;font-size:12px;margin-bottom:12px}
      @media print{button{display:none}}</style></head><body>
      <h2>出納作業 — ${tabLabel}</h2>
      <div class="info">${filterInfo.length ? filterInfo.join('　') + '<br>' : ''}列印時間: ${new Date().toLocaleString('zh-TW')}</div>
      <table><thead><tr>
        <th>單號</th><th>類別</th><th>廠商</th><th>館別</th><th>付款方式</th>
        <th class="right">金額</th><th>摘要</th><th>狀態</th>
      </tr></thead><tbody>`);
    let total = 0;
    rows.forEach(o => {
      const amt = Number(o.netAmount || 0);
      total += amt;
      w.document.write(`<tr>
        <td>${getDisplayOrderNo(o)}</td>
        <td>${getSourceCategory(o.sourceType, o)}</td>
        <td>${o.supplierName || '—'}</td>
        <td>${o.warehouse || '—'}</td>
        <td>${o.paymentMethod || '—'}</td>
        <td class="right">${amt.toLocaleString()}</td>
        <td>${o.summary || '—'}</td>
        <td>${o.status || '—'}</td>
      </tr>`);
    });
    w.document.write(`</tbody><tfoot><tr>
      <td colspan="5" class="right"><strong>合計 (${rows.length} 筆)</strong></td>
      <td class="right"><strong>${total.toLocaleString()}</strong></td>
      <td colspan="2"></td>
    </tr></tfoot></table>
    <button onclick="window.print()" style="margin-top:12px;padding:8px 20px;font-size:14px;cursor:pointer">列印</button>
    </body></html>`);
    w.document.close();
  }

  function handleExportExcel(sortedRows, activeTab, TABS) {
    const rows = sortedRows;
    if (rows.length === 0) { showToast('無資料可匯出', 'error'); return; }
    const header = ['單號', '類別', '廠商', '館別', '付款方式', '金額', '摘要', '備註', '狀態', '建立日期'];
    const csvRows = [header.join(',')];
    rows.forEach(o => {
      const cols = [
        getDisplayOrderNo(o),
        getSourceCategory(o.sourceType, o),
        (o.supplierName || '').replace(/,/g, '，'),
        o.warehouse || '',
        o.paymentMethod || '',
        Number(o.netAmount || 0),
        (o.summary || '').replace(/,/g, '，'),
        (o.note || '').replace(/,/g, '，').replace(/\n/g, ' '),
        o.status || '',
        o.createdAt ? new Date(o.createdAt).toLocaleDateString('zh-TW') : ''
      ];
      csvRows.push(cols.map(c => `"${c}"`).join(','));
    });
    const bom = '﻿';
    const blob = new Blob([bom + csvRows.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const tabLabel = TABS.find(t => t.key === activeTab)?.label?.replace(/\s*\(.*\)/, '') || activeTab;
    a.href = url;
    a.download = `出納_${tabLabel}_${todayStr()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const pendingOrders  = orders.filter(o => o.status === '待出納');
  const executedOrders = orders.filter(o => o.status === '已執行');
  const rejectedOrders = orders.filter(o => o.status === '已拒絕');

  return {
    orders, setOrders,
    accounts, setAccounts,
    suppliers,
    warehousesList,
    loading, setLoading,
    fetchError, setFetchError,
    searchFilter, setSearchFilter,
    fetchAll,
    fetchOrders,
    fetchAccounts,
    handleSearch,
    clearSearch,
    loadAllHistory,
    handlePrint,
    handleExportExcel,
    pendingOrders,
    executedOrders,
    rejectedOrders,
  };
}
