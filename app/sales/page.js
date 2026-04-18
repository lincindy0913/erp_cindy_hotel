'use client';

import { useState, useEffect, Fragment, Suspense, useMemo } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import Navigation from '@/components/Navigation';
import { useToast } from '@/context/ToastContext';
import { sortRows, useColumnSort, SortableTh } from '@/components/SortableTh';

function InvoicePageInner() {
  const router = useRouter();
  const { data: session } = useSession();
  const { showToast } = useToast();
  const isLoggedIn = !!session;
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState(null);
  const [products, setProducts] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [selectedItems, setSelectedItems] = useState([]); // 勾選的品項
  const [availableItems, setAvailableItems] = useState([]); // 可選的未核銷品項
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingItems, setLoadingItems] = useState(false);
  const [salesSaving, setSalesSaving] = useState(false);
  const [expandedInvoices, setExpandedInvoices] = useState(new Set()); // 追蹤展開的發票ID

  // 發票抬頭：連動系統設定 /api/settings/invoice-titles
  const [invoiceTitles, setInvoiceTitles] = useState([]); // [{ id, title }, ...]
  const [showTitleManager, setShowTitleManager] = useState(false);
  const [newTitleName, setNewTitleName] = useState('');

  // 搜尋廠商（列表篩選）
  const [searchSupplier, setSearchSupplier] = useState('');
  const [searchDateFrom, setSearchDateFrom] = useState('');
  const [searchDateTo, setSearchDateTo] = useState('');
  const [searchInvoiceTitle, setSearchInvoiceTitle] = useState('');
  const [searchWarehouse, setSearchWarehouse] = useState('');

  // 勾選發票（列印用）
  const [checkedInvoiceIds, setCheckedInvoiceIds] = useState(new Set());

  // 月度館別統計 view
  const [activeView, setActiveView] = useState('list');
  const [statsStartMonth, setStatsStartMonth] = useState(() => `${new Date().getFullYear()}-01`);
  const [statsEndMonth,   setStatsEndMonth]   = useState(() => new Date().toISOString().slice(0, 7));
  const [statsWarehouse,  setStatsWarehouse]  = useState('');
  const [statsData, setStatsData] = useState(null);
  const [statsLoading, setStatsLoading] = useState(false);

  // 篩選條件
  const [filterData, setFilterData] = useState({
    yearMonth: '', // YYYY-MM
    supplierId: '',
    warehouse: ''
  });

  // 表單資料
  const [formData, setFormData] = useState({
    invoiceNo: '',
    invoiceDate: new Date().toISOString().split('T')[0],
    invoiceTitle: '', // 發票抬頭
    taxType: '應稅', // 營業稅類型
    invoiceAmount: '', // 發票金額（手動輸入）
    supplierDiscount: '0' // 廠商折讓金額（預設0元）
  });

  // System tax rate
  const [systemTaxRate, setSystemTaxRate] = useState(5);

  // 營業稅金額自動計算
  const taxAmount = (() => {
    const amount = parseFloat(formData.invoiceAmount) || 0;
    if (formData.taxType === '應稅') return amount * (systemTaxRate / 100);
    return 0;
  })();

  useEffect(() => {
    fetchProducts();
    fetchSuppliers();
    fetchInvoices();
    fetchSystemTaxRate();
    fetchInvoiceTitles();
  }, []);

  async function fetchMonthlyStats() {
    setStatsLoading(true);
    try {
      const p = new URLSearchParams({ startMonth: statsStartMonth, endMonth: statsEndMonth });
      if (statsWarehouse) p.set('warehouse', statsWarehouse);
      const res = await fetch(`/api/sales/monthly-stats?${p}`);
      if (res.ok) setStatsData(await res.json());
    } catch {}
    setStatsLoading(false);
  }

  useEffect(() => {
    if (activeView === 'monthly') fetchMonthlyStats();
  }, [activeView]);

  // 從 URL ?month=YYYY-MM&invoiceTitle=XXX 預設篩選（供業主往來頁跳轉）
  useEffect(() => {
    const m = searchParams.get('month');
    const t = searchParams.get('invoiceTitle');
    if (m) {
      setSearchDateFrom(`${m}-01`);
      const [y, mo] = m.split('-').map(Number);
      const lastDay = new Date(y, mo, 0).getDate();
      setSearchDateTo(`${m}-${String(lastDay).padStart(2, '0')}`);
    }
    if (t) setSearchInvoiceTitle(t);
  }, []);

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

  // 從網址 ?edit=id 連動開啟編輯表單（例如從財務頁「發票號」或「編輯」點入）
  const searchParams = useSearchParams();
  useEffect(() => {
    const editId = searchParams.get('edit');
    if (!editId) return;
    const id = parseInt(editId, 10);
    if (Number.isNaN(id)) return;
    let cancelled = false;
    fetch(`/api/sales/${id}`)
      .then(res => (res.ok ? res.json() : null))
      .then(invoice => {
        if (cancelled || !invoice) return;
        if (['草稿', '待出納', '已付款'].includes(invoice.paymentStatus)) {
          showToast(`此發票目前付款狀態為「${invoice.paymentStatus}」，不可修改發票內容。`, 'error');
          return;
        }
        handleEdit(invoice);
        setShowAddForm(true);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [searchParams.get('edit')]);

  async function fetchSystemTaxRate() {
    try {
      const res = await fetch('/api/settings');
      if (res.ok) {
        const data = await res.json();
        if (data.taxRate != null) setSystemTaxRate(Number(data.taxRate));
      }
    } catch { /* use default 5% */ }
  }

  async function fetchInvoices() {
    try {
      const response = await fetch('/api/sales/with-info');
      const data = await response.json();
      setInvoices(Array.isArray(data) ? data : []);
      setLoading(false);
    } catch (error) {
      console.error('取得發票列表失敗:', error);
      setInvoices([]);
      setLoading(false);
    }
  }

  async function fetchProducts() {
    try {
      const response = await fetch('/api/products?all=true');
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
      const data = await response.json();
      setSuppliers(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('取得廠商列表失敗:', error);
      setSuppliers([]);
    }
  }

  // 查詢未核銷的進貨單品項
  async function fetchUninvoicedItems() {
    setLoadingItems(true);
    try {
      const params = new URLSearchParams();
      if (filterData.yearMonth) params.append('yearMonth', filterData.yearMonth);
      if (filterData.supplierId) params.append('supplierId', filterData.supplierId);
      if (filterData.warehouse) params.append('warehouse', filterData.warehouse);
      
      const url = `/api/purchasing/uninvoiced?${params.toString()}`;
      console.log('查詢URL:', url);
      
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      console.log('查詢結果:', data);
      console.log('資料筆數:', Array.isArray(data) ? data.length : 0);
      
      const items = Array.isArray(data) ? data : [];
      setAvailableItems(items);
      setSelectedItems([]); // 清空已選品項
      
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

  function getProductName(productId) {
    const product = products.find(p => p.id === productId);
    return product ? product.name : '未知產品';
  }

  function getSupplierName(supplierId) {
    const supplier = suppliers.find(s => s.id === supplierId);
    return supplier ? supplier.name : '未知廠商';
  }

  const filteredInvoicesForList = useMemo(
    () =>
      invoices.filter((inv) => {
        if (searchSupplier && !(inv.supplierName || '').toLowerCase().includes(searchSupplier.toLowerCase())) return false;
        const invDate = inv.invoiceDate || inv.salesDate || '';
        if (searchDateFrom && invDate < searchDateFrom) return false;
        if (searchDateTo && invDate > searchDateTo) return false;
        if (searchInvoiceTitle && (inv.invoiceTitle || '') !== searchInvoiceTitle) return false;
        if (searchWarehouse && (inv.warehouse || '') !== searchWarehouse) return false;
        return true;
      }),
    [invoices, searchSupplier, searchDateFrom, searchDateTo, searchInvoiceTitle, searchWarehouse]
  );
  const { sortKey: saleInvKey, sortDir: saleInvDir, toggleSort: toggleSaleInv } = useColumnSort('invoiceDate', 'desc');
  const sortedInvoicesForList = useMemo(
    () =>
      sortRows(filteredInvoicesForList, saleInvKey, saleInvDir, {
        warehouse: (i) => i.warehouse || '',
        invoiceTitle: (i) => i.invoiceTitle || '',
        supplierName: (i) => i.supplierName || '',
        invoiceNo: (i) => i.invoiceNo || i.salesNo || '',
        invoiceDate: (i) => i.invoiceDate || i.salesDate || '',
        itemCount: (i) => i.items?.length || 0,
        totalAmount: (i) => Number(i.totalAmount || (Number(i.amount || 0) + Number(i.tax || 0)) || 0),
        paymentStatus: (i) => i.paymentStatus || '',
      }),
    [filteredInvoicesForList, saleInvKey, saleInvDir]
  );

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
    return {
      subtotal: subtotal.toFixed(2)
    };
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
        body: JSON.stringify({ title })
      });
      if (res.ok) {
        await fetchInvoiceTitles();
        setNewTitleName('');
      } else {
        const err = await res.json().catch(() => ({}));
        showToast(err.error?.message || '新增發票抬頭失敗', 'error');
      }
    } catch (err) {
      showToast('新增發票抬頭失敗', 'error');
    }
  }

  async function handleDeleteTitle(title) {
    if (!confirm(`確定要刪除「${title}」嗎？`)) return;
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

    // 前端驗證（在 setSalesSaving 之前）
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
          purchaseId: item.purchaseId,
          purchaseNo: item.purchaseNo,
          purchaseDate: item.purchaseDate,
          supplierId: item.supplierId,
          productId: item.productId,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          salesAmount: parseFloat(item.salesAmount || item.subtotal || 0),
          note: item.note || ''
        })),
        amount: parseFloat(totals.subtotal),
        invoiceAmount: invoiceAmountVal,
        tax: taxAmount,
        supplierDiscount: discountVal,
        totalAmount: invoiceAmountVal + taxAmount - discountVal
      };

      const isEditing = !!editingInvoice;
      const url = isEditing ? `/api/sales/${editingInvoice.id}` : '/api/sales';
      const method = isEditing ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method: method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(invoiceData)
      });

      if (response.ok) {
        const wantAddMore = confirm(`發票${isEditing ? '更新' : '登錄'}成功！\n\n是否要繼續新增發票？`);
        setEditingInvoice(null);
        setSelectedItems([]);
        setAvailableItems([]);
        setFilterData({
          yearMonth: '',
          supplierId: '',
          warehouse: ''
        });
        setFormData({
          invoiceNo: '',
          invoiceDate: new Date().toISOString().split('T')[0],
          invoiceTitle: '',
          taxType: '應稅',
          invoiceAmount: '',
          supplierDiscount: '0'
        });
        fetchInvoices();
        if (!wantAddMore) {
          setShowAddForm(false);
        }
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
      newExpanded.delete(invoiceId); // 如果已展開，則收合
    } else {
      newExpanded.add(invoiceId); // 如果未展開，則展開
    }
    setExpandedInvoices(newExpanded);
  }

  function handleEdit(invoice) {
    // 若發票付款狀態為草稿 / 待出納 / 已付款，不可再修改
    if (['草稿', '待出納', '已付款'].includes(invoice.paymentStatus)) {
      showToast(`此發票目前付款狀態為「${invoice.paymentStatus}」，不可修改發票內容。`, 'error');
      return;
    }
    setEditingInvoice(invoice);
    setFormData({
      invoiceNo: invoice.invoiceNo || '',
      invoiceDate: invoice.invoiceDate || new Date().toISOString().split('T')[0],
      invoiceTitle: invoice.invoiceTitle || '',
      taxType: invoice.taxType || '應稅',
      invoiceAmount: invoice.invoiceAmount != null ? String(invoice.invoiceAmount) : String(invoice.amount || ''),
      supplierDiscount: invoice.supplierDiscount != null ? String(invoice.supplierDiscount) : '0'
    });
    setSelectedItems(invoice.items || []);
    setShowAddForm(true);
  }

  async function handleDelete(invoiceId) {
    if (!confirm('確定要刪除這張發票嗎？刪除後相關進貨單品項將可重新核銷。')) return;
    
    try {
      const response = await fetch(`/api/sales/${invoiceId}`, {
        method: 'DELETE'
      });

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

  const totals = selectedItems.length > 0 ? calculateTotal() : { subtotal: '0' };

  // 列印選取的發票
  function handlePrintInvoices() {
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

  // 列印篩選後的發票清單
  function handlePrintFilteredList() {
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

  // 匯出篩選後的發票為Excel (CSV)
  function handleExportFilteredExcel() {
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
        inv.paymentStatus || ''
      ].map(c => `"${c}"`).join(','));
    });
    const blob = new Blob(['\uFEFF' + csvRows.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `發票清單_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="min-h-screen page-bg-sales">
      <Navigation borderColor="border-green-500" />

      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* 標題與操作 */}
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold">發票登錄/核銷</h2>
          <div className="flex items-center gap-3">
            <button onClick={handlePrintFilteredList}
              className="px-3 py-2 rounded-lg text-sm font-medium bg-white text-gray-600 hover:bg-gray-100 border border-gray-300">
              🖨 列印
            </button>
            <button onClick={handleExportFilteredExcel}
              className="px-3 py-2 rounded-lg text-sm font-medium bg-white text-green-700 hover:bg-green-50 border border-green-300">
              📥 匯出Excel
            </button>
            {isLoggedIn && (
              <button
                onClick={() => {
                  setShowAddForm(!showAddForm);
                  if (!showAddForm) {
                    setSelectedItems([]);
                    setAvailableItems([]);
                    setFilterData({
                      yearMonth: '',
                      supplierId: '',
                      warehouse: ''
                    });
                  }
                }}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
              >
                ➕ 新增發票
              </button>
            )}
          </div>
        </div>

        {/* 新增發票表單 */}
        {showAddForm && (
          <div className="bg-white rounded-lg shadow-sm p-6 mb-6 border-2 border-blue-200">
            <h3 className="text-lg font-semibold mb-4">{editingInvoice ? '編輯發票' : '新增發票'}</h3>
            <form onSubmit={handleSubmit}>
              {/* 篩選條件 */}
              <div className="bg-gray-50 border rounded-lg p-4 mb-6">
                <h4 className="text-md font-semibold mb-3">篩選未核銷的進貨單品項</h4>
                <div className="grid grid-cols-3 gap-4 mb-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      進貨年月
                    </label>
                    <input
                      type="month"
                      value={filterData.yearMonth}
                      onChange={(e) => setFilterData({ ...filterData, yearMonth: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      廠商
                    </label>
                    <select
                      value={filterData.supplierId}
                      onChange={(e) => setFilterData({ ...filterData, supplierId: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">全部廠商</option>
                      {suppliers.map(s => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      館別
                    </label>
                    <select
                      value={filterData.warehouse}
                      onChange={(e) => setFilterData({ ...filterData, warehouse: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">全部館別</option>
                      <option value="麗格">麗格</option>
                      <option value="麗軒">麗軒</option>
                      <option value="民宿">民宿</option>
                    </select>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={fetchUninvoicedItems}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  查詢未核銷品項
                </button>
              </div>

              {/* 未核銷品項列表（勾選） */}
              {loadingItems ? (
                <div className="text-center py-8 text-gray-500">載入中...</div>
              ) : availableItems.length > 0 ? (
                <div className="mb-6">
                  <div className="flex justify-between items-center mb-3">
                    <h4 className="text-md font-semibold">請勾選要核銷的進貨單品項（共 {availableItems.length} 筆）</h4>
                    <button
                      type="button"
                      onClick={handleSelectAll}
                      className="text-sm text-blue-600 hover:underline"
                    >
                      {selectedItems.length === availableItems.length ? '取消全選' : '全選'}
                    </button>
                  </div>
                  <div className="border rounded-lg overflow-hidden">
                    <table className="w-full">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-3 py-2 text-left text-sm font-medium text-gray-700 w-12">
                            <input
                              type="checkbox"
                              checked={selectedItems.length === availableItems.length && availableItems.length > 0}
                              onChange={handleSelectAll}
                              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            />
                          </th>
                          <th className="px-3 py-2 text-left text-sm font-medium text-gray-700">館別</th>
                          <th className="px-3 py-2 text-left text-sm font-medium text-gray-700">進貨單號</th>
                          <th className="px-3 py-2 text-left text-sm font-medium text-gray-700">進貨日期</th>
                          <th className="px-3 py-2 text-left text-sm font-medium text-gray-700">廠商</th>
                          <th className="px-3 py-2 text-left text-sm font-medium text-gray-700">產品</th>
                          <th className="px-3 py-2 text-left text-sm font-medium text-gray-700">數量</th>
                          <th className="px-3 py-2 text-left text-sm font-medium text-gray-700">單價</th>
                          <th className="px-3 py-2 text-left text-sm font-medium text-gray-700">小計</th>
                          <th className="px-3 py-2 text-left text-sm font-medium text-gray-700">備註</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {availableItems.map((item) => {
                          const isSelected = selectedItems.some(selected => selected.id === item.id);
                          return (
                            <tr key={item.id} className={isSelected ? 'bg-blue-50' : ''}>
                              <td className="px-3 py-2">
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => handleItemToggle(item)}
                                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                />
                              </td>
                              <td className="px-3 py-2 text-sm">{item.warehouse || '-'}</td>
                              <td className="px-3 py-2 text-sm font-medium">
                                <button
                                  type="button"
                                  onClick={() => router.push(`/purchasing?editPurchaseNo=${encodeURIComponent(item.purchaseNo)}`)}
                                  className="text-blue-600 hover:underline"
                                >
                                  {item.purchaseNo}
                                </button>
                              </td>
                              <td className="px-3 py-2 text-sm">{item.purchaseDate}</td>
                              <td className="px-3 py-2 text-sm">{getSupplierName(item.supplierId)}</td>
                              <td className="px-3 py-2 text-sm">{getProductName(item.productId)}</td>
                              <td className="px-3 py-2 text-sm">{item.quantity}</td>
                              <td className="px-3 py-2 text-sm">NT$ {item.unitPrice}</td>
                              <td className="px-3 py-2 text-sm">NT$ {item.subtotal.toFixed(2)}</td>
                              <td className="px-3 py-2 text-sm text-gray-500">{item.note || '-'}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 mb-6">
                  <div className="text-center text-yellow-800">
                    <p className="text-sm font-medium mb-2">⚠️ 尚未查詢或沒有未核銷的進貨單品項</p>
                    <p className="text-xs text-yellow-600 mb-4">
                      請先設定篩選條件（可選），然後點擊「查詢未核銷品項」按鈕
                    </p>
                    <div className="text-xs text-yellow-600 text-left inline-block">
                      <p><strong>提示：</strong></p>
                      <ul className="list-disc list-inside space-y-1 mt-2">
                        <li>如果不設定篩選條件，將顯示所有未核銷的進貨單品項</li>
                        <li>已建立的測試資料包含：</li>
                        <li className="ml-4">- 10月份：供應商C、麗格，有2筆毛巾進貨</li>
                        <li className="ml-4">- 11月份：供應商C、麗格，有2筆毛巾進貨</li>
                        <li className="ml-4">- 其他測試資料：洗髮精、床單等</li>
                      </ul>
                    </div>
                  </div>
                </div>
              )}

              {/* 已選品項列表 */}
              {selectedItems.length > 0 && (
                <div className="mb-6">
                  <h4 className="text-md font-semibold mb-3">已選品項（共 {selectedItems.length} 項）</h4>
                  <div className="border rounded-lg overflow-hidden">
                    <table className="w-full">
                      <thead className="bg-green-50">
                        <tr>
                          <th className="px-3 py-2 text-left text-sm font-medium text-gray-700">館別</th>
                          <th className="px-3 py-2 text-left text-sm font-medium text-gray-700">進貨單號</th>
                          <th className="px-3 py-2 text-left text-sm font-medium text-gray-700">進貨日期</th>
                          <th className="px-3 py-2 text-left text-sm font-medium text-gray-700">廠商</th>
                          <th className="px-3 py-2 text-left text-sm font-medium text-gray-700">產品</th>
                          <th className="px-3 py-2 text-left text-sm font-medium text-gray-700">數量</th>
                          <th className="px-3 py-2 text-left text-sm font-medium text-gray-700">單價</th>
                          <th className="px-3 py-2 text-left text-sm font-medium text-gray-700">銷售金額</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {selectedItems.map((item) => (
                            <tr key={item.id}>
                              <td className="px-3 py-2 text-sm">{item.warehouse || '-'}</td>
                              <td className="px-3 py-2 text-sm">
                                <button
                                  type="button"
                                  onClick={() => router.push(`/purchasing?editPurchaseNo=${encodeURIComponent(item.purchaseNo)}`)}
                                  className="text-blue-600 hover:underline font-medium"
                                >
                                  {item.purchaseNo}
                                </button>
                              </td>
                              <td className="px-3 py-2 text-sm">{item.purchaseDate}</td>
                              <td className="px-3 py-2 text-sm">{getSupplierName(item.supplierId)}</td>
                              <td className="px-3 py-2 text-sm">{getProductName(item.productId)}</td>
                              <td className="px-3 py-2 text-sm">{item.quantity}</td>
                              <td className="px-3 py-2 text-sm">NT$ {item.unitPrice}</td>
                              <td className="px-3 py-2 text-sm">
                                NT$ {parseFloat(item.salesAmount !== undefined ? item.salesAmount : item.subtotal).toFixed(2)}
                              </td>
                            </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-gray-50">
                        <tr>
                          <td colSpan="7" className="px-3 py-2 text-sm font-semibold text-right">銷售金額合計：</td>
                          <td className="px-3 py-2 text-sm font-bold text-blue-600">
                            NT$ {selectedItems.reduce((sum, item) => sum + parseFloat(item.salesAmount || item.subtotal || 0), 0).toFixed(2)}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              )}

              {/* 發票資訊 */}
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    發票號碼 *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.invoiceNo}
                    onChange={(e) => setFormData({ ...formData, invoiceNo: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="輸入發票號碼"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    發票日期 *
                  </label>
                  <input
                    type="date"
                    required
                    value={formData.invoiceDate}
                    onChange={(e) => setFormData({ ...formData, invoiceDate: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-sm font-medium text-gray-700">
                      發票抬頭 *
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowTitleManager(!showTitleManager)}
                      className="text-xs text-blue-600 hover:underline"
                    >
                      管理選項
                    </button>
                  </div>
                  <select
                    required
                    value={formData.invoiceTitle}
                    onChange={(e) => setFormData({ ...formData, invoiceTitle: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">請選擇抬頭...</option>
                    {invoiceTitles.map(t => (
                      <option key={t.id} value={t.title}>{t.title}</option>
                    ))}
                  </select>
                </div>

                {/* 發票抬頭管理面板 */}
                {showTitleManager && (
                  <div className="col-span-2 border border-gray-300 rounded-lg p-4 bg-gray-50">
                    <div className="flex justify-between items-center mb-3">
                      <h4 className="text-sm font-semibold text-gray-700">發票抬頭管理</h4>
                      <button
                        type="button"
                        onClick={() => setShowTitleManager(false)}
                        className="text-gray-400 hover:text-gray-600 text-sm"
                      >
                        收起
                      </button>
                    </div>
                    <div className="flex gap-2 mb-3">
                      <input
                        type="text"
                        placeholder="輸入新抬頭名稱..."
                        value={newTitleName}
                        onChange={(e) => setNewTitleName(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddTitle())}
                        className="flex-1 px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <button
                        type="button"
                        onClick={handleAddTitle}
                        className="px-4 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                      >
                        新增
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {invoiceTitles.map(t => (
                        <span key={t.id} className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-50 text-blue-700 text-xs rounded-full border border-blue-200">
                          {t.title}
                          <button
                            type="button"
                            onClick={() => handleDeleteTitle(t.title)}
                            className="text-blue-400 hover:text-red-500 font-bold ml-0.5"
                          >
                            x
                          </button>
                        </span>
                      ))}
                      {invoiceTitles.length === 0 && (
                        <span className="text-xs text-gray-400">尚無抬頭選項</span>
                      )}
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    發票金額（手動輸入） *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={formData.invoiceAmount}
                    onChange={(e) => setFormData({ ...formData, invoiceAmount: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="輸入發票金額"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    營業稅類型 *
                  </label>
                  <select
                    required
                    value={formData.taxType}
                    onChange={(e) => setFormData({ ...formData, taxType: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="應稅">應稅</option>
                    <option value="零稅率">零稅率</option>
                    <option value="免稅">免稅</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    營業稅金額（自動計算）
                  </label>
                  <input
                    type="text"
                    readOnly
                    value={`NT$ ${taxAmount.toFixed(2)}`}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-100 text-gray-700"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    廠商折讓金額 *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={formData.supplierDiscount}
                    onChange={(e) => setFormData({ ...formData, supplierDiscount: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="輸入廠商折讓金額"
                  />
                </div>
              </div>

              {/* 金額計算 */}
              {selectedItems.length > 0 && (
                <div className="border-t pt-4 mb-4">
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <div className="flex flex-wrap justify-end gap-6">
                      <div className="text-right">
                        <div className="text-xs text-gray-500 mb-1">銷售金額合計</div>
                        <div className="text-lg font-semibold">NT$ {totals.subtotal}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-gray-500 mb-1">發票金額</div>
                        <div className="text-lg font-semibold">NT$ {(parseFloat(formData.invoiceAmount) || 0).toFixed(2)}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-gray-500 mb-1">營業稅</div>
                        <div className="text-lg font-semibold">NT$ {taxAmount.toFixed(2)}</div>
                      </div>
                      {parseFloat(formData.supplierDiscount) > 0 && (
                        <div className="text-right">
                          <div className="text-xs text-gray-500 mb-1">廠商折讓</div>
                          <div className="text-lg font-semibold text-red-600">- NT$ {(parseFloat(formData.supplierDiscount) || 0).toFixed(2)}</div>
                        </div>
                      )}
                      <div className="text-right border-l-2 border-blue-300 pl-6">
                        <div className="text-xs text-blue-600 mb-1 font-medium">應付總額</div>
                        <div className="text-2xl font-bold text-blue-600">
                          NT$ {((parseFloat(formData.invoiceAmount) || 0) + taxAmount - (parseFloat(formData.supplierDiscount) || 0)).toFixed(2)}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* 操作按鈕 */}
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddForm(false);
                    setEditingInvoice(null);
                    setSelectedItems([]);
                    setAvailableItems([]);
                    setSalesSaving(false);
                    setFilterData({
                      yearMonth: '',
                      supplierId: '',
                      warehouse: ''
                    });
                    setFormData({
                      invoiceNo: '',
                      invoiceDate: new Date().toISOString().split('T')[0],
                      invoiceTitle: '',
                      taxType: '應稅',
                      invoiceAmount: '',
                      supplierDiscount: '',
                      status: '待核銷'
                    });
                  }}
                  className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={selectedItems.length === 0 || salesSaving}
                  className={`px-6 py-2 rounded-lg ${
                    selectedItems.length === 0 || salesSaving
                      ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                      : 'bg-blue-600 text-white hover:bg-blue-700'
                  } disabled:opacity-50`}
                >
                  {salesSaving ? '儲存中…' : '儲存'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* View toggle */}
        <div className="flex gap-1 mb-4 bg-white rounded-lg shadow-sm border border-gray-100 p-1 w-fit">
          {[{ key: 'list', label: '發票列表' }, { key: 'monthly', label: '月度館別統計' }].map(v => (
            <button key={v.key} onClick={() => setActiveView(v.key)}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                activeView === v.key ? 'bg-green-600 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-50'
              }`}>
              {v.label}
            </button>
          ))}
        </div>

        {/* ══ 月度館別統計 ══ */}
        {activeView === 'monthly' && (
          <div className="space-y-4">
            {/* 篩選列 */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
              <div className="flex flex-wrap items-end gap-4">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">起始月份</label>
                  <input type="month" value={statsStartMonth} onChange={e => setStatsStartMonth(e.target.value)}
                    className="border rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-green-400 outline-none" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">結束月份</label>
                  <input type="month" value={statsEndMonth} onChange={e => setStatsEndMonth(e.target.value)}
                    className="border rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-green-400 outline-none" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">館別</label>
                  <select value={statsWarehouse} onChange={e => setStatsWarehouse(e.target.value)}
                    className="border rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-green-400 outline-none">
                    <option value="">全部館別</option>
                    {(statsData?.warehouses || []).map(wh => (
                      <option key={wh} value={wh}>{wh}</option>
                    ))}
                    {/* fallback options if statsData not yet loaded */}
                    {!statsData && ['麗格','麗軒','民宿'].map(wh => (
                      <option key={wh} value={wh}>{wh}</option>
                    ))}
                  </select>
                </div>
                <button onClick={fetchMonthlyStats}
                  className="px-5 py-1.5 text-sm rounded-lg bg-green-600 text-white hover:bg-green-700 font-medium">
                  查詢
                </button>
                {statsData && (
                  <span className="text-xs text-gray-400 self-center">
                    {statsData.startMonth} ～ {statsData.endMonth}
                    {statsData.warehouse && ` ｜ ${statsData.warehouse}`}
                  </span>
                )}
              </div>
            </div>

            {statsLoading ? (
              <div className="text-center py-16 text-gray-400">統計中…</div>
            ) : statsData ? (
              <div className="space-y-4">
                {/* ── KPI 卡片 ── */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                  {statsData.warehouses.map(wh => {
                    const whTotal = statsData.periodTotal.byWarehouse[wh] || 0;
                    const pct = statsData.periodTotal.total > 0
                      ? Math.round((whTotal / statsData.periodTotal.total) * 100) : 0;
                    return (
                      <div key={wh} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                        <p className="text-xs text-gray-500 mb-1 truncate">{wh}</p>
                        <p className="text-base font-bold text-green-700">NT$ {whTotal.toLocaleString()}</p>
                        <div className="mt-2 bg-gray-100 rounded-full h-1.5">
                          <div className="h-1.5 rounded-full bg-green-400" style={{ width: `${pct}%` }} />
                        </div>
                        <p className="text-xs text-gray-400 mt-1">{pct}% 佔比</p>
                      </div>
                    );
                  })}
                  <div className="bg-green-50 rounded-xl border border-green-200 shadow-sm p-4">
                    <p className="text-xs text-gray-500 mb-1">期間合計</p>
                    <p className="text-base font-bold text-green-800">NT$ {statsData.periodTotal.total.toLocaleString()}</p>
                    <p className="text-xs text-gray-400 mt-2">{statsData.periodTotal.invoiceCount} 張發票</p>
                    <p className="text-xs text-gray-400">{statsData.rows.length} 個月</p>
                  </div>
                </div>

                {/* ── 月 × 館別 樞紐表 ── */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                  <div className="px-4 py-3 border-b bg-gray-50 flex items-center justify-between">
                    <p className="text-sm font-semibold text-gray-700">月份 × 館別 進項發票金額</p>
                    <p className="text-xs text-gray-400">點擊金額可跳至發票列表</p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-green-50 text-green-800 text-xs border-b border-green-100">
                          <th className="px-4 py-2.5 text-left font-medium whitespace-nowrap sticky left-0 bg-green-50">月份</th>
                          {statsData.warehouses.map(wh => (
                            <th key={wh} className="px-4 py-2.5 text-right font-medium whitespace-nowrap">{wh}</th>
                          ))}
                          <th className="px-4 py-2.5 text-right font-medium whitespace-nowrap border-l border-green-100">張數</th>
                          <th className="px-4 py-2.5 text-right font-medium whitespace-nowrap bg-green-100/50">月合計</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {statsData.rows.length === 0 ? (
                          <tr><td colSpan={statsData.warehouses.length + 3} className="text-center py-12 text-gray-400">此期間無進項發票</td></tr>
                        ) : statsData.rows.map((row, idx) => {
                          const jumpToList = (wh) => {
                            const [y, mo] = row.month.split('-').map(Number);
                            setActiveView('list');
                            setSearchDateFrom(`${row.month}-01`);
                            setSearchDateTo(`${row.month}-${String(new Date(y, mo, 0).getDate()).padStart(2, '0')}`);
                            setSearchWarehouse(wh || '');
                            setSearchInvoiceTitle('');
                          };
                          return (
                            <tr key={row.month} className={`hover:bg-green-50/30 ${idx % 2 === 1 ? 'bg-gray-50/30' : ''}`}>
                              <td className="px-4 py-2.5 font-medium text-gray-700 sticky left-0 bg-inherit">
                                <button onClick={() => jumpToList('')} className="text-green-700 hover:underline">
                                  {row.month}
                                </button>
                              </td>
                              {statsData.warehouses.map(wh => (
                                <td key={wh} className="px-4 py-2.5 text-right">
                                  {(row.byWarehouse[wh] || 0) > 0
                                    ? <button onClick={() => jumpToList(wh)}
                                        className="text-green-700 hover:underline font-medium tabular-nums">
                                        {(row.byWarehouse[wh] || 0).toLocaleString()}
                                      </button>
                                    : <span className="text-gray-200">—</span>
                                  }
                                </td>
                              ))}
                              <td className="px-4 py-2.5 text-right text-gray-400 text-xs border-l border-gray-100 tabular-nums">{row.invoiceCount}</td>
                              <td className="px-4 py-2.5 text-right font-semibold text-gray-800 bg-green-50/50 tabular-nums">
                                NT$ {row.total.toLocaleString()}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr className="bg-green-100/60 font-semibold text-green-900 text-sm border-t-2 border-green-200">
                          <td className="px-4 py-2.5 sticky left-0 bg-green-100/60">期間合計</td>
                          {statsData.warehouses.map(wh => (
                            <td key={wh} className="px-4 py-2.5 text-right tabular-nums">
                              {(statsData.periodTotal.byWarehouse[wh] || 0).toLocaleString()}
                            </td>
                          ))}
                          <td className="px-4 py-2.5 text-right text-xs border-l border-green-200 tabular-nums">{statsData.periodTotal.invoiceCount}</td>
                          <td className="px-4 py-2.5 text-right bg-green-100 tabular-nums">NT$ {statsData.periodTotal.total.toLocaleString()}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>

                {/* ── 發票抬頭分析 ── */}
                {statsData.titles.length > 1 && (
                  <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                    <div className="px-4 py-3 border-b bg-gray-50">
                      <p className="text-sm font-semibold text-gray-700">發票抬頭分析</p>
                    </div>
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gray-50 text-gray-500 text-xs">
                          <th className="px-4 py-2 text-left font-medium">發票抬頭</th>
                          <th className="px-4 py-2 text-right font-medium">金額</th>
                          <th className="px-4 py-2 text-right font-medium">佔比</th>
                          <th className="px-4 py-2 font-medium w-40">分布</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {statsData.titles
                          .map(t => ({ title: t, amt: statsData.periodTotal.byTitle[t] || 0 }))
                          .sort((a, b) => b.amt - a.amt)
                          .map(({ title, amt }) => {
                            const pct = statsData.periodTotal.total > 0
                              ? (amt / statsData.periodTotal.total * 100).toFixed(1) : '0.0';
                            return (
                              <tr key={title} className="hover:bg-gray-50">
                                <td className="px-4 py-2.5 font-medium text-gray-700">{title}</td>
                                <td className="px-4 py-2.5 text-right tabular-nums text-gray-700">NT$ {amt.toLocaleString()}</td>
                                <td className="px-4 py-2.5 text-right text-gray-500">{pct}%</td>
                                <td className="px-4 py-2.5">
                                  <div className="bg-gray-100 rounded-full h-2">
                                    <div className="h-2 rounded-full bg-blue-400"
                                      style={{ width: `${Math.min(100, parseFloat(pct))}%` }} />
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-16 text-gray-400">請設定查詢條件後按「查詢」</div>
            )}
          </div>
        )}

        {activeView === 'list' && (<>
        {/* 搜尋列 */}
        <div className="mb-4 bg-white rounded-lg shadow-sm p-4">
          <div className="flex flex-wrap items-center gap-3">
            <input
              type="text"
              value={searchSupplier}
              onChange={(e) => setSearchSupplier(e.target.value)}
              placeholder="搜尋廠商名稱..."
              className="w-full max-w-xs px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            />
            <select
              value={searchInvoiceTitle}
              onChange={(e) => setSearchInvoiceTitle(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            >
              <option value="">全部抬頭</option>
              {invoiceTitles.map(t => (
                <option key={t.id} value={t.title}>{t.title}</option>
              ))}
            </select>
            <select
              value={searchWarehouse}
              onChange={(e) => setSearchWarehouse(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            >
              <option value="">全部館別</option>
              <option value="麗格">麗格</option>
              <option value="麗軒">麗軒</option>
              <option value="民宿">民宿</option>
            </select>
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-600">起始日期</label>
              <input
                type="date"
                value={searchDateFrom}
                onChange={(e) => setSearchDateFrom(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-600">結束日期</label>
              <input
                type="date"
                value={searchDateTo}
                onChange={(e) => setSearchDateTo(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              />
            </div>
            {(searchSupplier || searchDateFrom || searchDateTo || searchInvoiceTitle || searchWarehouse) && (
              <button
                onClick={() => { setSearchSupplier(''); setSearchDateFrom(''); setSearchDateTo(''); setSearchInvoiceTitle(''); setSearchWarehouse(''); }}
                className="px-3 py-2 text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
              >
                清除篩選
              </button>
            )}
          </div>
          {/* 列印按鈕列 */}
          <div className="flex items-center gap-3 mt-3 pt-3 border-t border-gray-200">
            <button
              onClick={() => {
                // 全選/取消全選
                if (checkedInvoiceIds.size === sortedInvoicesForList.length) {
                  setCheckedInvoiceIds(new Set());
                } else {
                  setCheckedInvoiceIds(new Set(sortedInvoicesForList.map(inv => inv.id)));
                }
              }}
              className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              {checkedInvoiceIds.size === sortedInvoicesForList.length && sortedInvoicesForList.length > 0 ? '取消全選' : '全選'}
            </button>
            <span className="text-sm text-gray-500">
              已選 {checkedInvoiceIds.size} 筆
            </span>
            <button
              onClick={() => handlePrintInvoices()}
              disabled={checkedInvoiceIds.size === 0}
              className={`px-4 py-1.5 text-sm rounded-lg ${
                checkedInvoiceIds.size === 0
                  ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  : 'bg-green-600 text-white hover:bg-green-700'
              }`}
            >
              列印選取的發票
            </button>
          </div>
        </div>

        {/* 列表 */}
        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-3 w-10">
                  <input
                    type="checkbox"
                    checked={checkedInvoiceIds.size === sortedInvoicesForList.length && sortedInvoicesForList.length > 0}
                    onChange={() => {
                      if (checkedInvoiceIds.size === sortedInvoicesForList.length) {
                        setCheckedInvoiceIds(new Set());
                      } else {
                        setCheckedInvoiceIds(new Set(sortedInvoicesForList.map(inv => inv.id)));
                      }
                    }}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                </th>
                <SortableTh label="館別" colKey="warehouse" sortKey={saleInvKey} sortDir={saleInvDir} onSort={toggleSaleInv} className="px-4 py-3" />
                <SortableTh label="發票抬頭" colKey="invoiceTitle" sortKey={saleInvKey} sortDir={saleInvDir} onSort={toggleSaleInv} className="px-4 py-3" />
                <SortableTh label="廠商" colKey="supplierName" sortKey={saleInvKey} sortDir={saleInvDir} onSort={toggleSaleInv} className="px-4 py-3" />
                <SortableTh label="發票號" colKey="invoiceNo" sortKey={saleInvKey} sortDir={saleInvDir} onSort={toggleSaleInv} className="px-4 py-3" />
                <SortableTh label="發票日期" colKey="invoiceDate" sortKey={saleInvKey} sortDir={saleInvDir} onSort={toggleSaleInv} className="px-4 py-3" />
                <SortableTh label="品項數" colKey="itemCount" sortKey={saleInvKey} sortDir={saleInvDir} onSort={toggleSaleInv} className="px-4 py-3" />
                <SortableTh label="總金額" colKey="totalAmount" sortKey={saleInvKey} sortDir={saleInvDir} onSort={toggleSaleInv} className="px-4 py-3" align="right" />
                <SortableTh label="付款狀態" colKey="paymentStatus" sortKey={saleInvKey} sortDir={saleInvDir} onSort={toggleSaleInv} className="px-4 py-3" />
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {loading ? (
                <tr>
                  <td colSpan="10" className="px-4 py-8 text-center text-gray-500">
                    載入中...
                  </td>
                </tr>
              ) : invoices.length === 0 ? (
                <tr>
                  <td colSpan="10" className="px-4 py-8 text-center text-gray-500">
                    尚無發票資料
                  </td>
                </tr>
              ) : filteredInvoicesForList.length === 0 ? (
                <tr>
                  <td colSpan="10" className="px-4 py-8 text-center text-gray-500">
                    無符合篩選的發票
                  </td>
                </tr>
              ) : (
                sortedInvoicesForList.map((invoice, index) => {
                  const isExpanded = expandedInvoices.has(invoice.id);
                  return (
                    <Fragment key={invoice.id}>
                      <tr className={index % 2 === 0 ? 'bg-white hover:bg-gray-50' : 'bg-gray-50 hover:bg-gray-100'}>
                        <td className="px-3 py-3">
                          <input
                            type="checkbox"
                            checked={checkedInvoiceIds.has(invoice.id)}
                            onChange={() => {
                              const next = new Set(checkedInvoiceIds);
                              if (next.has(invoice.id)) next.delete(invoice.id);
                              else next.add(invoice.id);
                              setCheckedInvoiceIds(next);
                            }}
                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          />
                        </td>
                        <td className="px-4 py-3 text-sm">{invoice.warehouse || '-'}</td>
                        <td className="px-4 py-3 text-sm">{invoice.invoiceTitle || '-'}</td>
                        <td className="px-4 py-3 text-sm">{invoice.supplierName || '-'}</td>
                        <td className="px-4 py-3 text-sm">{invoice.invoiceNo || invoice.salesNo}</td>
                        <td className="px-4 py-3 text-sm">{invoice.invoiceDate || invoice.salesDate}</td>
                        <td className="px-4 py-3 text-sm">{invoice.items ? invoice.items.length : 0} 項</td>
                        <td className="px-4 py-3 text-sm font-semibold">
                          NT$ {parseFloat(invoice.totalAmount || invoice.amount + invoice.tax || 0).toFixed(2)}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <span className={`px-2 py-1 rounded text-xs ${
                            invoice.paymentStatus === '已付款' ? 'bg-green-100 text-green-800' :
                            invoice.paymentStatus === '待出納' ? 'bg-yellow-100 text-yellow-800' :
                            invoice.paymentStatus === '草稿' ? 'bg-gray-100 text-gray-800' :
                            invoice.paymentStatus === '已代墊' ? 'bg-purple-100 text-purple-800' :
                            invoice.paymentStatus === '已退貨' ? 'bg-orange-100 text-orange-800' :
                            invoice.paymentStatus === '部分退貨' ? 'bg-amber-100 text-amber-800' :
                            'bg-red-100 text-red-800'
                          }`}>
                            {invoice.paymentStatus || '未付款'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleViewDetails(invoice.id)}
                              className="text-blue-600 hover:underline text-sm"
                            >
                              {isExpanded ? '收起' : '查看'}
                            </button>
                            {isLoggedIn && (
                              <>
                                {!['草稿', '待出納', '已付款'].includes(invoice.paymentStatus) && (
                                  <button
                                    onClick={() => handleEdit(invoice)}
                                    className="text-green-600 hover:underline text-sm"
                                  >
                                    編輯
                                  </button>
                                )}
                                {!['草稿', '待出納', '已付款'].includes(invoice.paymentStatus) && (
                                  <button
                                    onClick={() => handleDelete(invoice.id)}
                                    className="text-red-600 hover:underline text-sm"
                                  >
                                    刪除
                                  </button>
                                )}
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                      {/* 展開的詳細資訊 */}
                      {isExpanded && (
                        <tr className="bg-blue-50">
                          <td colSpan="10" className="px-4 py-4">
                            <div className="space-y-4">
                              {/* 發票基本資訊 */}
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pb-4 border-b border-gray-300">
                                <div>
                                  <div className="text-xs text-gray-500 mb-1">發票號</div>
                                  <div className="text-sm font-semibold">{invoice.invoiceNo || invoice.salesNo}</div>
                                </div>
                                <div>
                                  <div className="text-xs text-gray-500 mb-1">發票日期</div>
                                  <div className="text-sm font-semibold">{invoice.invoiceDate || invoice.salesDate}</div>
                                </div>
                                <div>
                                  <div className="text-xs text-gray-500 mb-1">狀態</div>
                                  <div className="text-sm">
                                    <span className={`px-2 py-1 rounded text-xs ${
                                      invoice.status === '已核銷' ? 'bg-green-100 text-green-800' :
                                      invoice.status === '待核銷' ? 'bg-yellow-100 text-yellow-800' :
                                      invoice.status === '已退貨' ? 'bg-orange-100 text-orange-800' :
                                      invoice.status === '部分退貨' ? 'bg-amber-100 text-amber-800' :
                                      'bg-red-100 text-red-800'
                                    }`}>
                                      {invoice.status || '待核銷'}
                                    </span>
                                  </div>
                                </div>
                                <div>
                                  <div className="text-xs text-gray-500 mb-1">品項數</div>
                                  <div className="text-sm font-semibold">{invoice.items ? invoice.items.length : 0} 項</div>
                                </div>
                              </div>

                              {/* 金額資訊 */}
                              <div className="grid grid-cols-3 gap-4 pb-4 border-b border-gray-300">
                                <div>
                                  <div className="text-xs text-gray-500 mb-1">小計</div>
                                  <div className="text-sm font-semibold">
                                    NT$ {parseFloat(invoice.amount || 0).toFixed(2)}
                                  </div>
                                </div>
                                <div>
                                  <div className="text-xs text-gray-500 mb-1">稅額 (5%)</div>
                                  <div className="text-sm font-semibold">
                                    NT$ {parseFloat(invoice.tax || 0).toFixed(2)}
                                  </div>
                                </div>
                                <div>
                                  <div className="text-xs text-gray-500 mb-1">總金額</div>
                                  <div className="text-lg font-bold text-blue-600">
                                    NT$ {parseFloat(invoice.totalAmount || invoice.amount + invoice.tax || 0).toFixed(2)}
                                  </div>
                                </div>
                              </div>

                              {/* 核銷品項列表 */}
                              {invoice.items && invoice.items.length > 0 && (
                                <div>
                                  <div className="text-sm font-semibold mb-3 text-gray-700">核銷品項詳情</div>
                                  <div className="border rounded-lg overflow-hidden">
                                    <table className="w-full text-sm">
                                      <thead className="bg-gray-100">
                                        <tr>
                                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-700">序號</th>
                                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-700">進貨單號</th>
                                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-700">進貨日期</th>
                                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-700">廠商</th>
                                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-700">產品</th>
                                          <th className="px-3 py-2 text-right text-xs font-medium text-gray-700">數量</th>
                                          <th className="px-3 py-2 text-right text-xs font-medium text-gray-700">單價</th>
                                          <th className="px-3 py-2 text-right text-xs font-medium text-gray-700">小計</th>
                                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-700">備註</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-gray-200 bg-white">
                                        {invoice.items.map((item, idx) => {
                                          const product = products.find(p => p.id === item.productId);
                                          const subtotal = (item.quantity || 0) * (item.unitPrice || 0);
                                          return (
                                            <tr key={idx} className="hover:bg-gray-50">
                                              <td className="px-3 py-2 text-gray-600">{idx + 1}</td>
                                              <td className="px-3 py-2 font-medium">
                                                {item.purchaseNo ? (
                                                  <button
                                                    type="button"
                                                    onClick={() => router.push(`/purchasing?editPurchaseNo=${encodeURIComponent(item.purchaseNo)}`)}
                                                    className="text-blue-600 hover:underline"
                                                  >
                                                    {item.purchaseNo}
                                                  </button>
                                                ) : '-'}
                                              </td>
                                              <td className="px-3 py-2 text-gray-600">{item.purchaseDate || '-'}</td>
                                              <td className="px-3 py-2">{item.supplierId ? getSupplierName(item.supplierId) : '未知廠商'}</td>
                                              <td className="px-3 py-2">{product ? product.name : '未知商品'}</td>
                                              <td className="px-3 py-2 text-right">{item.quantity || 0}</td>
                                              <td className="px-3 py-2 text-right">NT$ {parseFloat(item.unitPrice || 0).toFixed(2)}</td>
                                              <td className="px-3 py-2 text-right font-semibold">NT$ {subtotal.toFixed(2)}</td>
                                              <td className="px-3 py-2 text-gray-500 text-xs">{item.note || '-'}</td>
                                            </tr>
                                          );
                                        })}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        </>)}
      </main>
    </div>
  );
}

export default function InvoicePage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-gray-500">載入中...</div>}>
      <InvoicePageInner />
    </Suspense>
  );
}
