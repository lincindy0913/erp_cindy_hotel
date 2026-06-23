'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/context/ToastContext';
import { useConfirm } from '@/context/ConfirmContext';
import { sortRows, useColumnSort } from '@/components/SortableTh';
import { todayStr } from '@/lib/localDate';

export function useSalesInvoice({ searchParams, canSalesView, setActiveView }) {
  const router = useRouter();
  const { showToast } = useToast();
  const confirm = useConfirm();

  const [showAddForm, setShowAddForm] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState(null);
  const [products, setProducts] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [selectedItems, setSelectedItems] = useState([]);
  const [availableItems, setAvailableItems] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [invoicesError, setInvoicesError] = useState(null);
  const [allowances, setAllowances] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingItems, setLoadingItems] = useState(false);
  const [salesSaving, setSalesSaving] = useState(false);
  const [expandedInvoices, setExpandedInvoices] = useState(new Set());

  // 發票抬頭
  const [invoiceTitles, setInvoiceTitles] = useState([]);
  const [showTitleManager, setShowTitleManager] = useState(false);
  const [newTitleName, setNewTitleName] = useState('');

  // 搜尋篩選
  const [searchSupplier, setSearchSupplier] = useState('');
  const [searchDateFrom, setSearchDateFrom] = useState('');
  const [searchDateTo, setSearchDateTo] = useState('');
  const [searchInvoiceTitle, setSearchInvoiceTitle] = useState('');
  const [searchWarehouse, setSearchWarehouse] = useState('');
  const [searchInvoiceType, setSearchInvoiceType] = useState('');
  const [searchStatus, setSearchStatus] = useState('');

  // 新增折讓發票表單
  const [showAddAllowanceForm, setShowAddAllowanceForm] = useState(false);
  const [allowanceSaving, setAllowanceSaving] = useState(false);
  const [allowanceFormData, setAllowanceFormData] = useState({
    allowanceDate: todayStr(),
    warehouse: '',
    supplierName: '',
    invoiceNo: '',
    amount: '',
    tax: '0',
    totalAmount: '',
    reason: '',
    note: '',
  });

  // 勾選發票（列印用）
  const [checkedInvoiceIds, setCheckedInvoiceIds] = useState(new Set());

  // 發票列表分頁
  const [invoicePage, setInvoicePage] = useState(1);
  const [invoiceTotalPages, setInvoiceTotalPages] = useState(1);
  const [invoiceTotal, setInvoiceTotal] = useState(0);
  const invoicePageSize = 50;

  // 篩選條件（新增表單用）
  const [filterData, setFilterData] = useState({
    yearMonth: '',
    supplierId: '',
    warehouse: '',
    purchaseId: '',
  });

  // 表單資料
  const [formData, setFormData] = useState({
    invoiceNo: '',
    invoiceDate: todayStr(),
    invoiceTitle: '',
    invoiceType: '進貨單',
    taxType: '應稅',
    invoiceAmount: '',
    supplierDiscount: '0',
  });

  // System tax rate
  const [systemTaxRate, setSystemTaxRate] = useState(5);

  // 營業稅金額自動計算
  const taxAmount = (() => {
    const amount = parseFloat(formData.invoiceAmount) || 0;
    if (formData.taxType === '應稅') return amount * (systemTaxRate / 100);
    return 0;
  })();

  // ── fetch functions ──

  async function fetchSystemTaxRate() {
    try {
      const res = await fetch('/api/settings');
      if (res.ok) {
        const data = await res.json();
        if (data.taxRate != null) setSystemTaxRate(Number(data.taxRate));
      }
    } catch { /* use default 5% */ }
  }

  async function fetchInvoiceTitles() {
    try {
      const res = await fetch('/api/settings/invoice-titles', { credentials: 'include' });
      const data = await res.json().catch(() => []);
      if (res.ok && Array.isArray(data)) {
        setInvoiceTitles(data.map(t => ({ id: t.id, title: t.title || '' })).filter(t => t.title));
      }
    } catch (err) {
      console.error('載入發票抬頭失敗:', err);
    }
  }

  async function fetchInvoices(page = 1) {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(invoicePageSize) });
      if (searchDateFrom)    params.set('dateFrom', searchDateFrom);
      if (searchDateTo)      params.set('dateTo', searchDateTo);
      if (searchWarehouse)   params.set('warehouse', searchWarehouse);
      if (searchInvoiceType && searchInvoiceType !== '折讓') params.set('invoiceType', searchInvoiceType);
      if (searchInvoiceTitle) params.set('invoiceTitle', searchInvoiceTitle);
      if (searchStatus) params.set('status', searchStatus);

      const response = await fetch(`/api/sales/with-info?${params}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const result = await response.json();
      setInvoicesError(null);
      if (result.data && result.pagination) {
        setInvoices(result.data);
        setInvoicePage(result.pagination.page);
        setInvoiceTotalPages(result.pagination.totalPages);
        setInvoiceTotal(result.pagination.total);
      } else {
        setInvoices(Array.isArray(result) ? result : []);
      }
    } catch (error) {
      console.error('取得發票列表失敗:', error);
      setInvoicesError('發票清單載入失敗，請重試。');
      setInvoices([]);
    }
    setLoading(false);
  }

  async function fetchAllowances() {
    try {
      const res = await fetch('/api/purchase-allowances?status=已確認');
      if (!res.ok) { setAllowances([]); return; }
      const data = await res.json();
      setAllowances(Array.isArray(data) ? data : []);
    } catch { setAllowances([]); }
  }

  async function fetchProducts() {
    try {
      const response = await fetch('/api/products?all=true');
      if (!response.ok) { setProducts([]); return; }
      const data = await response.json();
      setProducts(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('取得產品列表失敗:', error);
      setProducts([]);
    }
  }

  async function fetchSuppliers() {
    try {
      const response = await fetch('/api/suppliers?all=true');
      if (!response.ok) { setSuppliers([]); return; }
      const data = await response.json();
      setSuppliers(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('取得廠商列表失敗:', error);
      setSuppliers([]);
    }
  }

  async function fetchUninvoicedItems() {
    setLoadingItems(true);
    try {
      const params = new URLSearchParams();
      if (filterData.yearMonth)  params.append('yearMonth', filterData.yearMonth);
      if (filterData.supplierId) params.append('supplierId', filterData.supplierId);
      if (filterData.warehouse)  params.append('warehouse', filterData.warehouse);
      if (filterData.purchaseId) params.append('purchaseId', filterData.purchaseId);

      const url = `/api/purchasing/uninvoiced?${params.toString()}`;
      console.log('查詢URL:', url);

      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

      const data = await response.json();
      const items = Array.isArray(data) ? data : (data.data || []);
      console.log('查詢結果筆數:', items.length, data.pagination ? `(共 ${data.pagination.totalCount} 筆)` : '');

      setAvailableItems(items);
      setSelectedItems([]);

      if (items.length === 0) {
        showToast('查詢完成，但沒有找到未核銷的進貨單品項。\n\n請檢查：\n1. 篩選條件是否正確\n2. 是否有建立進貨單資料\n3. 該品項是否已被核銷', 'info');
      }
    } catch (error) {
      console.error('取得未核銷品項失敗:', error);
      setAvailableItems([]);
      showToast('查詢失敗：' + (error.message || '請稍後再試'), 'error');
    } finally {
      setLoadingItems(false);
    }
  }

  // ── handlers ──

  function getProductName(productId) {
    const product = products.find(p => p.id === productId);
    return product ? product.name : '未知產品';
  }

  function getSupplierName(supplierId) {
    const supplier = suppliers.find(s => s.id === supplierId);
    return supplier ? supplier.name : '未知廠商';
  }

  function handleItemToggle(item) {
    const isSelected = selectedItems.some(selected => selected.id === item.id);
    let newItems;
    if (isSelected) {
      newItems = selectedItems.filter(selected => selected.id !== item.id);
    } else {
      newItems = [...selectedItems, { ...item, salesAmount: item.subtotal || 0 }];
    }
    setSelectedItems(newItems);
    const subtotal = newItems.reduce((sum, i) => sum + parseFloat(i.salesAmount || i.subtotal || 0), 0);
    setFormData(prev => ({ ...prev, invoiceAmount: subtotal > 0 ? subtotal.toFixed(2) : '' }));
  }

  function handleSelectAll() {
    let newItems;
    if (selectedItems.length === availableItems.length) {
      newItems = [];
    } else {
      newItems = availableItems.map(item => ({ ...item, salesAmount: item.subtotal || 0 }));
    }
    setSelectedItems(newItems);
    const subtotal = newItems.reduce((sum, i) => sum + parseFloat(i.salesAmount || i.subtotal || 0), 0);
    setFormData(prev => ({ ...prev, invoiceAmount: subtotal > 0 ? subtotal.toFixed(2) : '' }));
  }

  function calculateTotal() {
    const subtotal = selectedItems.reduce((sum, item) => {
      return sum + parseFloat(item.salesAmount || item.subtotal || 0);
    }, 0);
    return { subtotal: subtotal.toFixed(2) };
  }

  async function handleAddTitle() {
    const title = newTitleName.trim();
    if (!title) return;
    if (invoiceTitles.some(t => t.title === title)) {
      showToast('此抬頭已存在', 'error');
      return;
    }
    try {
      const res = await fetch('/api/settings/invoice-titles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ title }),
      });
      if (res.ok) {
        await fetchInvoiceTitles();
        setNewTitleName('');
      } else {
        const err = await res.json().catch(() => ({}));
        showToast(err.error?.message || '新增發票抬頭失敗', 'error');
      }
    } catch {
      showToast('新增發票抬頭失敗', 'error');
    }
  }

  async function handleDeleteTitle(title) {
    if (!(await confirm(`確定要刪除「${title}」嗎？`, { title: '刪除確認', danger: true }))) return;
    const item = invoiceTitles.find(t => t.title === title);
    if (!item) return;
    try {
      const res = await fetch(`/api/settings/invoice-titles?id=${item.id}`, { method: 'DELETE', credentials: 'include' });
      if (res.ok) {
        await fetchInvoiceTitles();
        if (formData.invoiceTitle === title) {
          setFormData(prev => ({ ...prev, invoiceTitle: '' }));
        }
      } else {
        showToast('刪除失敗', 'error');
      }
    } catch {
      showToast('刪除失敗', 'error');
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();

    if (selectedItems.length === 0) {
      showToast('請至少勾選一項進貨單品項', 'error');
      return;
    }
    if (!formData.invoiceNo) {
      showToast('請輸入發票號碼', 'error');
      return;
    }

    const totals = calculateTotal();
    const invoiceAmountVal = parseFloat(formData.invoiceAmount) || 0;
    const discountVal = parseFloat(formData.supplierDiscount) || 0;
    const salesTotalVal = parseFloat(totals.subtotal) || 0;
    const expectedInvoiceAmount = salesTotalVal + taxAmount - discountVal;

    if (Math.abs(expectedInvoiceAmount - invoiceAmountVal) > 0.01) {
      showToast(
        `金額驗證不通過！\n\n` +
        `銷售金額合計：NT$ ${salesTotalVal.toFixed(2)}\n` +
        `+ 營業稅金額：NT$ ${taxAmount.toFixed(2)}\n` +
        `- 廠商折讓金額：NT$ ${discountVal.toFixed(2)}\n` +
        `= NT$ ${expectedInvoiceAmount.toFixed(2)}\n\n` +
        `但發票金額為：NT$ ${invoiceAmountVal.toFixed(2)}\n\n` +
        `兩者不相等，請確認金額後再儲存。`,
        'error'
      );
      return;
    }

    setSalesSaving(true);
    try {
      const invoiceData = {
        ...formData,
        items: selectedItems.map(item => ({
          purchaseItemId: item.purchaseItemId,
          purchaseId:     item.purchaseId,
          purchaseNo:     item.purchaseNo,
          purchaseDate:   item.purchaseDate,
          supplierId:     item.supplierId,
          productId:      item.productId,
          quantity:       item.quantity,
          unitPrice:      item.unitPrice,
          salesAmount:    parseFloat(item.salesAmount || item.subtotal || 0),
          note:           item.note || '',
        })),
        amount:           parseFloat(totals.subtotal),
        invoiceAmount:    invoiceAmountVal,
        tax:              taxAmount,
        supplierDiscount: discountVal,
        totalAmount:      invoiceAmountVal + taxAmount - discountVal,
      };

      const isEditing = !!editingInvoice;
      const url    = isEditing ? `/api/sales/${editingInvoice.id}` : '/api/sales';
      const method = isEditing ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(invoiceData),
      });

      if (response.ok) {
        const wantAddMore = await confirm(`發票${isEditing ? '更新' : '登錄'}成功！\n\n是否要繼續新增發票？`, { title: '繼續新增', danger: false });
        setEditingInvoice(null);
        setSelectedItems([]);
        setAvailableItems([]);
        setFilterData({ yearMonth: '', supplierId: '', warehouse: '', purchaseId: '' });
        setFormData({
          invoiceNo: '', invoiceDate: todayStr(), invoiceTitle: '',
          invoiceType: '進貨單', taxType: '應稅', invoiceAmount: '', supplierDiscount: '0',
        });
        fetchInvoices();
        if (!wantAddMore) setShowAddForm(false);
      } else {
        const error = await response.json();
        showToast(`${isEditing ? '更新' : '登錄'}失敗：` + (error.error || '未知錯誤'), 'error');
      }
    } catch (error) {
      console.error(`${editingInvoice ? '更新' : '登錄'}發票失敗:`, error);
      showToast(`${editingInvoice ? '更新' : '登錄'}發票失敗，請稍後再試`, 'error');
    } finally {
      setSalesSaving(false);
    }
  }

  function handleViewDetails(invoiceId) {
    const newExpanded = new Set(expandedInvoices);
    if (newExpanded.has(invoiceId)) {
      newExpanded.delete(invoiceId);
    } else {
      newExpanded.add(invoiceId);
    }
    setExpandedInvoices(newExpanded);
  }

  function handleEdit(invoice) {
    if (['草稿', '待出納', '已付款', '已退貨', '部分退貨'].includes(invoice.paymentStatus)) {
      showToast(`此發票目前付款狀態為「${invoice.paymentStatus}」，不可修改發票內容。`, 'error');
      return;
    }
    setEditingInvoice(invoice);
    setFormData({
      invoiceNo:        invoice.invoiceNo || '',
      invoiceDate:      invoice.invoiceDate || todayStr(),
      invoiceTitle:     invoice.invoiceTitle || '',
      invoiceType:      invoice.invoiceType || '進貨單',
      taxType:          invoice.taxType || '應稅',
      invoiceAmount:    invoice.invoiceAmount != null ? String(invoice.invoiceAmount) : String(invoice.amount || ''),
      supplierDiscount: invoice.supplierDiscount != null ? String(invoice.supplierDiscount) : '0',
    });
    setSelectedItems(invoice.items || []);
    setShowAddForm(true);
  }

  async function handleDelete(invoiceId) {
    if (!(await confirm('確定要刪除這張發票嗎？刪除後相關進貨單品項將可重新核銷。', { title: '刪除確認', danger: true }))) return;
    try {
      const response = await fetch(`/api/sales/${invoiceId}`, { method: 'DELETE' });
      if (response.ok) {
        showToast('發票刪除成功！', 'success');
        fetchInvoices();
      } else {
        const error = await response.json();
        showToast('刪除失敗：' + (error.error || '未知錯誤'), 'error');
      }
    } catch (error) {
      console.error('刪除發票失敗:', error);
      showToast('刪除發票失敗，請稍後再試', 'error');
    }
  }

  async function saveAllowance(e) {
    e.preventDefault();
    if (!allowanceFormData.allowanceDate || !allowanceFormData.supplierName || !allowanceFormData.totalAmount) {
      showToast('請填寫折讓日期、廠商名稱及折讓金額', 'error');
      return;
    }
    setAllowanceSaving(true);
    try {
      const res = await fetch('/api/purchase-allowances', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...allowanceFormData,
          allowanceType: '折讓',
          status: '已確認',
          amount:      parseFloat(allowanceFormData.amount || allowanceFormData.totalAmount) || 0,
          tax:         parseFloat(allowanceFormData.tax) || 0,
          totalAmount: parseFloat(allowanceFormData.totalAmount) || 0,
        }),
      });
      if (res.ok) {
        showToast('折讓發票已儲存', 'success');
        setShowAddAllowanceForm(false);
        setAllowanceFormData({ allowanceDate: todayStr(), warehouse: '', supplierName: '', invoiceNo: '', amount: '', tax: '0', totalAmount: '', reason: '', note: '' });
        fetchAllowances();
      } else {
        const err = await res.json().catch(() => ({}));
        showToast(err.message || '儲存失敗', 'error');
      }
    } catch { showToast('儲存失敗', 'error'); }
    setAllowanceSaving(false);
  }

  // ── print / export ──

  function handlePrintInvoices(sortedInvoicesForList) {
    const selected = sortedInvoicesForList.filter(inv => checkedInvoiceIds.has(inv.id));
    if (selected.length === 0) return;

    const printWin = window.open('', '_blank');
    if (!printWin) {
      showToast('無法開啟列印視窗，請允許彈出視窗', 'error');
      return;
    }

    const rows = selected.map((inv, i) => {
      const itemRows = (inv.items || []).map((item, idx) => {
        const product = products.find(p => p.id === item.productId);
        const subtotal = (item.quantity || 0) * (item.unitPrice || 0);
        return `<tr>
          <td>${idx + 1}</td>
          <td>${item.purchaseNo || '-'}</td>
          <td>${item.purchaseDate || '-'}</td>
          <td>${product ? product.name : '未知商品'}</td>
          <td style="text-align:right">${item.quantity || 0}</td>
          <td style="text-align:right">${parseFloat(item.unitPrice || 0).toFixed(2)}</td>
          <td style="text-align:right">${subtotal.toFixed(2)}</td>
        </tr>`;
      }).join('');

      return `
        <div class="invoice-block" style="${i > 0 ? 'page-break-before:always;' : ''}">
          <h2 style="text-align:center;margin-bottom:10px;">發票明細</h2>
          <table class="info-table">
            <tr>
              <td><strong>發票號碼：</strong>${inv.invoiceNo || inv.salesNo || '-'}</td>
              <td><strong>發票日期：</strong>${inv.invoiceDate || inv.salesDate || '-'}</td>
              <td><strong>館別：</strong>${inv.warehouse || '-'}</td>
            </tr>
            <tr>
              <td><strong>發票抬頭：</strong>${inv.invoiceTitle || '-'}</td>
              <td><strong>廠商：</strong>${inv.supplierName || '-'}</td>
              <td><strong>付款狀態：</strong>${inv.paymentStatus || '未付款'}</td>
            </tr>
          </table>
          <table class="detail-table">
            <thead>
              <tr>
                <th>序號</th><th>進貨單號</th><th>進貨日期</th><th>產品</th>
                <th style="text-align:right">數量</th><th style="text-align:right">單價</th><th style="text-align:right">小計</th>
              </tr>
            </thead>
            <tbody>${itemRows || '<tr><td colspan="7" style="text-align:center">無品項</td></tr>'}</tbody>
          </table>
          <table class="summary-table">
            <tr>
              <td>發票金額：NT$ ${parseFloat(inv.invoiceAmount || inv.amount || 0).toFixed(2)}</td>
              <td>稅額：NT$ ${parseFloat(inv.tax || 0).toFixed(2)}</td>
              <td>折讓：NT$ ${parseFloat(inv.supplierDiscount || 0).toFixed(2)}</td>
              <td><strong>總金額：NT$ ${parseFloat(inv.totalAmount || 0).toFixed(2)}</strong></td>
            </tr>
          </table>
        </div>`;
    }).join('');

    const grandTotal = selected.reduce((sum, inv) => sum + parseFloat(inv.totalAmount || 0), 0);

    printWin.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>發票列印</title>
      <style>
        body { font-family: "Microsoft JhengHei","PingFang TC",sans-serif; margin:20px; font-size:12px; }
        h2 { font-size:16px; }
        .info-table { width:100%; border-collapse:collapse; margin-bottom:8px; }
        .info-table td { padding:4px 8px; }
        .detail-table { width:100%; border-collapse:collapse; margin-bottom:8px; }
        .detail-table th, .detail-table td { border:1px solid #333; padding:4px 6px; font-size:11px; }
        .detail-table th { background:#eee; }
        .summary-table { width:100%; border-collapse:collapse; margin-bottom:8px; }
        .summary-table td { padding:4px 8px; font-size:12px; }
        .grand-total { text-align:right; font-size:14px; font-weight:bold; margin-top:16px; padding-top:8px; border-top:2px solid #333; }
        @media print { .no-print { display:none; } }
      </style></head><body>
      ${rows}
      <div class="grand-total">共 ${selected.length} 筆發票，總金額合計：NT$ ${grandTotal.toFixed(2)}</div>
      <div class="no-print" style="text-align:center;margin-top:20px;">
        <button onclick="window.print()" style="padding:8px 24px;font-size:14px;cursor:pointer;">列印</button>
      </div>
    </body></html>`);
    printWin.document.close();
  }

  function handlePrintFilteredList(sortedInvoicesForList) {
    const rows = sortedInvoicesForList;
    if (rows.length === 0) { showToast('無資料可列印', 'error'); return; }
    const filterInfo = [];
    if (searchDateFrom || searchDateTo) filterInfo.push(`日期: ${searchDateFrom || '~'} ~ ${searchDateTo || '~'}`);
    if (searchSupplier) filterInfo.push(`廠商: ${searchSupplier}`);
    if (searchInvoiceTitle) filterInfo.push(`抬頭: ${searchInvoiceTitle}`);
    if (searchWarehouse) filterInfo.push(`館別: ${searchWarehouse}`);
    const w = window.open('', '_blank');
    if (!w) { showToast('無法開啟列印視窗', 'error'); return; }
    w.document.write(`<html><head><title>發票清單</title>
      <style>body{font-family:'Microsoft JhengHei',sans-serif;padding:20px}
      table{width:100%;border-collapse:collapse;font-size:12px}
      th,td{border:1px solid #ccc;padding:6px 8px;text-align:left}
      th{background:#f5f5f5;font-weight:600}
      .right{text-align:right}
      h2{margin:0 0 4px} .info{color:#666;font-size:12px;margin-bottom:12px}
      @media print{button{display:none}}</style></head><body>
      <h2>發票登錄/核銷</h2>
      <div class="info">${filterInfo.length ? filterInfo.join('　') + '<br>' : ''}共 ${rows.length} 筆　列印時間: ${new Date().toLocaleString('zh-TW')}</div>
      <table><thead><tr>
        <th>館別</th><th>抬頭</th><th>廠商</th><th>發票號碼</th><th>日期</th>
        <th class="right">品項數</th><th class="right">金額</th><th>付款狀態</th>
      </tr></thead><tbody>`);
    let total = 0;
    rows.forEach(inv => {
      const amt = Number(inv.totalAmount || (Number(inv.amount || 0) + Number(inv.tax || 0)) || 0);
      total += amt;
      w.document.write(`<tr>
        <td>${inv.warehouse || '－'}</td><td>${inv.invoiceTitle || '－'}</td>
        <td>${inv.supplierName || '－'}</td><td>${inv.invoiceNo || inv.salesNo || '－'}</td>
        <td>${inv.invoiceDate || inv.salesDate || '－'}</td>
        <td class="right">${inv.items?.length || 0}</td>
        <td class="right">${amt.toLocaleString()}</td>
        <td>${inv.paymentStatus || '－'}</td>
      </tr>`);
    });
    w.document.write(`</tbody><tfoot><tr>
      <td colspan="6" class="right"><strong>合計 (${rows.length} 筆)</strong></td>
      <td class="right"><strong>${total.toLocaleString()}</strong></td><td></td>
    </tr></tfoot></table>
    <button onclick="window.print()" style="margin-top:12px;padding:8px 20px;font-size:14px;cursor:pointer">列印</button>
    </body></html>`);
    w.document.close();
  }

  function handleExportFilteredExcel(sortedInvoicesForList) {
    const rows = sortedInvoicesForList;
    if (rows.length === 0) { showToast('無資料可匯出', 'error'); return; }
    const header = ['館別', '抬頭', '廠商', '發票號碼', '日期', '品項數', '金額', '付款狀態'];
    const csvRows = [header.join(',')];
    rows.forEach(inv => {
      csvRows.push([
        inv.warehouse || '',
        (inv.invoiceTitle || '').replace(/,/g, '，'),
        (inv.supplierName || '').replace(/,/g, '，'),
        inv.invoiceNo || inv.salesNo || '',
        inv.invoiceDate || inv.salesDate || '',
        inv.items?.length || 0,
        Number(inv.totalAmount || (Number(inv.amount || 0) + Number(inv.tax || 0)) || 0),
        inv.paymentStatus || '',
      ].map(c => `"${c}"`).join(','));
    });
    const blob = new Blob(['﻿' + csvRows.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `發票清單_${todayStr()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── computed / memos ──

  const filteredInvoicesForList = useMemo(
    () => invoices.filter(inv =>
      (!searchSupplier || (inv.supplierName || '').toLowerCase().includes(searchSupplier.toLowerCase())) &&
      (!searchStatus || (inv.status || '待核銷') === searchStatus)
    ),
    [invoices, searchSupplier, searchStatus]
  );

  const filteredAllowancesForList = useMemo(
    () =>
      allowances.filter((a) => {
        if (searchSupplier && !(a.supplierName || '').toLowerCase().includes(searchSupplier.toLowerCase())) return false;
        const d = a.allowanceDate || '';
        if (searchDateFrom && d < searchDateFrom) return false;
        if (searchDateTo && d > searchDateTo) return false;
        if (searchWarehouse && (a.warehouse || '') !== searchWarehouse) return false;
        if (searchInvoiceType && searchInvoiceType !== '折讓') return false;
        return true;
      }),
    [allowances, searchSupplier, searchDateFrom, searchDateTo, searchWarehouse, searchInvoiceType]
  );

  const { sortKey: saleInvKey, sortDir: saleInvDir, toggleSort: toggleSaleInv } = useColumnSort('invoiceDate', 'desc');

  const sortedInvoicesForList = useMemo(
    () =>
      sortRows(filteredInvoicesForList, saleInvKey, saleInvDir, {
        warehouse:    (i) => i.warehouse || '',
        invoiceTitle: (i) => i.invoiceTitle || '',
        supplierName: (i) => i.supplierName || '',
        invoiceNo:    (i) => i.invoiceNo || i.salesNo || '',
        invoiceDate:  (i) => i.invoiceDate || i.salesDate || '',
        itemCount:    (i) => i.items?.length || 0,
        totalAmount:  (i) => Number(i.totalAmount || (Number(i.amount || 0) + Number(i.tax || 0)) || 0),
        paymentStatus:(i) => i.paymentStatus || '',
      }),
    [filteredInvoicesForList, saleInvKey, saleInvDir]
  );

  const mergedListForDisplay = useMemo(() => {
    const invRows = sortedInvoicesForList.map(i => ({ ...i, _isAllowance: false }));
    const allowanceRows = filteredAllowancesForList.map(a => ({
      _isAllowance: true,
      id: `a-${a.id}`,
      _allowanceId: a.id,
      warehouse:    a.warehouse || '',
      invoiceTitle: '-',
      supplierName: a.supplierName || '-',
      invoiceNo:    a.allowanceNo,
      invoiceDate:  a.allowanceDate,
      items:        a.details || [],
      totalAmount:  -Number(a.totalAmount),
      invoiceType:  '折讓',
      paymentStatus:a.status || '',
      allowanceType:a.allowanceType,
      reason:       a.reason || '',
    }));
    const combined = [...invRows, ...allowanceRows];
    combined.sort((a, b) => {
      const da = a.invoiceDate || a.salesDate || '';
      const db = b.invoiceDate || b.salesDate || '';
      if (da > db) return saleInvDir === 'desc' ? -1 : 1;
      if (da < db) return saleInvDir === 'desc' ? 1 : -1;
      return 0;
    });
    return combined;
  }, [sortedInvoicesForList, filteredAllowancesForList, saleInvDir]);

  const totals = selectedItems.length > 0 ? calculateTotal() : { subtotal: '0' };

  // ── effects ──

  useEffect(() => {
    fetchProducts();
    fetchSuppliers();
    fetchInvoices();
    fetchAllowances();
    fetchSystemTaxRate();
    fetchInvoiceTitles();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 從 URL ?month=YYYY-MM&invoiceTitle=XXX 預設篩選
  useEffect(() => {
    const m = searchParams.get('month');
    const t = searchParams.get('invoiceTitle');
    const v = searchParams.get('view');
    const s = searchParams.get('status');
    if (m) {
      setSearchDateFrom(`${m}-01`);
      const [y, mo] = m.split('-').map(Number);
      const lastDay = new Date(y, mo, 0).getDate();
      setSearchDateTo(`${m}-${String(lastDay).padStart(2, '0')}`);
    }
    if (t) setSearchInvoiceTitle(t);
    if (s) setSearchStatus(s);
    if ((m || t || s) && canSalesView) {
      setActiveView('list');
      if (v !== 'list') {
        const p = new URLSearchParams(searchParams.toString());
        p.set('view', 'list');
        router.replace(`/sales?${p.toString()}`, { scroll: false });
      }
      setTimeout(() => fetchInvoices(1), 0);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, canSalesView]);

  // 從網址 ?supplierId=X&purchaseId=Y 一鍵預填廠商篩選並開啟發票新增表單
  useEffect(() => {
    const sid = searchParams?.get('supplierId');
    const pid = searchParams?.get('purchaseId');
    if (!canSalesView) return;
    if (!sid && !pid) return;
    setFilterData(f => ({ ...f, supplierId: sid || f.supplierId, purchaseId: pid || '' }));
    setShowAddForm(true);
    setShowAddAllowanceForm(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 從網址 ?edit=id 連動開啟編輯表單
  const salesEditParam = searchParams.get('edit');
  useEffect(() => {
    if (!salesEditParam) return;
    const id = parseInt(salesEditParam, 10);
    if (Number.isNaN(id)) return;
    let cancelled = false;
    fetch(`/api/sales/${id}`)
      .then(res => (res.ok ? res.json() : null))
      .then(invoice => {
        if (cancelled || !invoice) return;
        if (['草稿', '待出納', '已付款', '已退貨', '部分退貨'].includes(invoice.paymentStatus)) {
          showToast(`此發票目前付款狀態為「${invoice.paymentStatus}」，不可修改發票內容。`, 'error');
          return;
        }
        handleEdit(invoice);
        setShowAddForm(true);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [salesEditParam]);

  return {
    // state
    showAddForm, setShowAddForm,
    editingInvoice, setEditingInvoice,
    products,
    suppliers,
    selectedItems, setSelectedItems,
    availableItems, setAvailableItems,
    invoices,
    invoicesError,
    allowances,
    loading,
    loadingItems,
    salesSaving, setSalesSaving,
    expandedInvoices,
    invoiceTitles,
    showTitleManager, setShowTitleManager,
    newTitleName, setNewTitleName,
    searchSupplier, setSearchSupplier,
    searchDateFrom, setSearchDateFrom,
    searchDateTo, setSearchDateTo,
    searchInvoiceTitle, setSearchInvoiceTitle,
    searchWarehouse, setSearchWarehouse,
    searchInvoiceType, setSearchInvoiceType,
    searchStatus, setSearchStatus,
    showAddAllowanceForm, setShowAddAllowanceForm,
    allowanceSaving,
    allowanceFormData, setAllowanceFormData,
    checkedInvoiceIds, setCheckedInvoiceIds,
    invoicePage,
    invoiceTotalPages,
    invoiceTotal,
    filterData, setFilterData,
    formData, setFormData,
    taxAmount,
    totals,
    // computed
    mergedListForDisplay,
    sortedInvoicesForList,
    saleInvKey, saleInvDir, toggleSaleInv,
    // handlers
    fetchInvoices,
    fetchAllowances,
    fetchUninvoicedItems,
    getProductName,
    getSupplierName,
    handleItemToggle,
    handleSelectAll,
    calculateTotal,
    handleAddTitle,
    handleDeleteTitle,
    handleSubmit,
    handleViewDetails,
    handleEdit,
    handleDelete,
    saveAllowance,
    handlePrintInvoices,
    handlePrintFilteredList,
    handleExportFilteredExcel,
  };
}
