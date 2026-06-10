'use client';

import { useState, useEffect, useMemo } from 'react';
import { useSession } from 'next-auth/react';
import { useToast } from '@/context/ToastContext';
import { useConfirm } from '@/context/ConfirmContext';
import { todayStr } from '@/lib/localDate';
import { ALLOWANCE_STATUS } from '@/lib/allowance-statuses';

export function usePurchaseAllowances() {
  const { data: session } = useSession();
  const { showToast } = useToast();
  const confirm = useConfirm();

  const [activeTab, setActiveTab] = useState('draft');
  const [records, setRecords] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(null);

  const [purchaseSearch, setPurchaseSearch] = useState('');
  const [purchaseFilterDateFrom, setPurchaseFilterDateFrom] = useState('');
  const [purchaseFilterDateTo, setPurchaseFilterDateTo] = useState('');
  const [purchaseFilterSupplierId, setPurchaseFilterSupplierId] = useState('');
  const [purchaseFilterWarehouse, setPurchaseFilterWarehouse] = useState('');
  const [purchaseFilterPaidOnly, setPurchaseFilterPaidOnly] = useState('all');
  const [purchaseListResults, setPurchaseListResults] = useState([]);
  const [purchaseListTruncated, setPurchaseListTruncated] = useState(false);
  const [purchaseListLoading, setPurchaseListLoading] = useState(false);
  const [purchaseListSearched, setPurchaseListSearched] = useState(false);
  const [selectedPurchase, setSelectedPurchase] = useState(null);

  const [showForm, setShowForm] = useState(false);
  const [formMode, setFormMode] = useState('折讓');
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({
    allowanceType: '折讓',
    allowanceDate: todayStr(),
    supplierName: '', warehouse: '', purchaseNo: '', invoiceNo: '', paymentOrderNo: '',
    supplierId: null, invoiceId: null, paymentOrderId: null,
    amount: '', tax: '0', totalAmount: '', reason: '', note: '',
    details: [],
  });
  const [purchaseItems, setPurchaseItems] = useState([]);
  const [formSaving, setFormSaving] = useState(false);
  const [confirmSaving, setConfirmSaving] = useState(false);

  const [confirmingId, setConfirmingId] = useState(null);
  const [confirmAccountId, setConfirmAccountId] = useState('');
  const [confirmDate, setConfirmDate] = useState(todayStr());

  const [filterKeyword, setFilterKeyword] = useState('');

  useEffect(() => { fetchAll(); }, []);

  async function fetchAll() {
    setLoading(true);
    setFetchError(null);
    try {
      const [aRes, accRes, whRes, supRes] = await Promise.all([
        fetch('/api/purchase-allowances').then(r => r.ok ? r.json() : Promise.reject()),
        fetch('/api/cashflow/accounts').then(r => r.json()).catch(() => []),
        fetch('/api/warehouse-departments').then(r => r.json()).catch(() => []),
        fetch('/api/suppliers?all=true').then(r => r.json()).catch(() => []),
      ]);
      setRecords(Array.isArray(aRes) ? aRes : []);
      setAccounts(Array.isArray(accRes) ? accRes : []);
      setWarehouses(Array.isArray(whRes?.list) ? whRes.list.filter(w => w.type === 'building') : Array.isArray(whRes) ? whRes.filter(w => w.type === 'warehouse') : []);
      setSuppliers(Array.isArray(supRes) ? supRes : []);
    } catch {
      setFetchError('退貨資料載入失敗，請稍後再試');
    }
    setLoading(false);
  }

  async function searchPurchaseList() {
    if (!purchaseSearch && !purchaseFilterDateFrom && !purchaseFilterDateTo && !purchaseFilterSupplierId && !purchaseFilterWarehouse) {
      showToast('請至少輸入一個搜尋條件', 'error');
      return;
    }
    setPurchaseListLoading(true);
    setPurchaseListSearched(true);
    try {
      const params = new URLSearchParams();
      if (purchaseSearch) params.set('keyword', purchaseSearch);
      if (purchaseFilterDateFrom) params.set('dateFrom', purchaseFilterDateFrom);
      if (purchaseFilterDateTo) params.set('dateTo', purchaseFilterDateTo);
      if (purchaseFilterSupplierId) params.set('supplierId', purchaseFilterSupplierId);
      if (purchaseFilterWarehouse) params.set('warehouse', purchaseFilterWarehouse);
      if (purchaseFilterPaidOnly === 'paid') params.set('onlyPaid', 'true');
      if (purchaseFilterPaidOnly === 'unpaid') params.set('onlyPaid', 'false');
      const res = await fetch(`/api/purchase-allowances/search-purchases?${params}`);
      const data = await res.json();
      if (Array.isArray(data)) {
        setPurchaseListResults(data);
        setPurchaseListTruncated(false);
      } else {
        setPurchaseListResults(data.data || []);
        setPurchaseListTruncated(data.truncated || false);
      }
    } catch {
      setPurchaseListResults([]);
    }
    setPurchaseListLoading(false);
  }

  function syncPurchaseItemsToForm(items, purchase) {
    const selectedItems = items.filter(item => item.selected);
    const subtotal = selectedItems.reduce((s, item) =>
      s + Math.round((parseFloat(item.returnQty) || 0) * item.unitPrice), 0);
    const origAmount = Number(purchase?.amount || 0);
    const origTax = Number(purchase?.tax || 0);
    const taxRate = origAmount > 0 ? origTax / origAmount : 0;
    const tax = Math.round(subtotal * taxRate);
    setForm(f => ({
      ...f,
      amount: String(subtotal),
      tax: String(tax),
      totalAmount: String(subtotal + tax),
      details: selectedItems.map(item => ({
        productName: item.productName,
        quantity: item.returnQty,
        unitPrice: String(item.unitPrice),
        subtotal: String(Math.round((parseFloat(item.returnQty) || 0) * item.unitPrice)),
        reason: f.reason || '',
      })),
    }));
  }

  function selectPurchase(p) {
    setSelectedPurchase(p);
    setPurchaseListResults([]);
    setPurchaseListTruncated(false);
    setPurchaseSearch('');
    const items = (p.details || []).map(d => ({
      productId: d.productId,
      productName: d.productName || '',
      unit: d.unit || '',
      quantity: Number(d.quantity),
      unitPrice: Number(d.unitPrice),
      returnQty: String(d.quantity),
      selected: true,
    }));
    setPurchaseItems(items);
    setForm(f => ({
      ...f,
      allowanceType: formMode,
      purchaseNo: p.purchaseNo || '',
      purchaseId: p.purchaseId || null,
      invoiceNo: p.invoiceNo || '',
      invoiceId: p.invoiceId || null,
      paymentOrderNo: p.paymentOrderNo || '',
      paymentOrderId: p.paymentOrderId || null,
      supplierName: p.supplierName || '',
      supplierId: p.supplierId || null,
      warehouse: p.warehouse || '',
      amount: String(p.amount || ''),
      tax: String(p.tax || 0),
      totalAmount: String(p.totalAmount || ''),
      details: items.map(item => ({
        productName: item.productName,
        quantity: String(item.quantity),
        unitPrice: String(item.unitPrice),
        subtotal: String(Math.round(item.quantity * item.unitPrice)),
        reason: formMode === '全額退貨' ? '全額退貨' : '',
      })),
    }));
  }

  function togglePurchaseItem(idx) {
    const updated = purchaseItems.map((item, i) =>
      i === idx ? { ...item, selected: !item.selected } : item
    );
    setPurchaseItems(updated);
    syncPurchaseItemsToForm(updated, selectedPurchase);
  }

  function updatePurchaseItemReturnQty(idx, qty) {
    const updated = purchaseItems.map((item, i) =>
      i === idx ? { ...item, returnQty: qty } : item
    );
    setPurchaseItems(updated);
    syncPurchaseItemsToForm(updated, selectedPurchase);
  }

  const draftRecords = useMemo(() => records.filter(r => r.status === ALLOWANCE_STATUS.DRAFT), [records]);
  const confirmedRecords = useMemo(() => records.filter(r => r.status === ALLOWANCE_STATUS.CONFIRMED), [records]);
  const bankAccounts = accounts.filter(a => a.isActive && (a.type === '銀行存款' || a.type === '現金'));

  const filteredDraft = useMemo(() => {
    if (!filterKeyword) return draftRecords;
    const kw = filterKeyword.toLowerCase();
    return draftRecords.filter(r =>
      (r.allowanceNo || '').toLowerCase().includes(kw) ||
      (r.supplierName || '').toLowerCase().includes(kw) ||
      (r.invoiceNo || '').toLowerCase().includes(kw) ||
      (r.reason || '').toLowerCase().includes(kw)
    );
  }, [draftRecords, filterKeyword]);

  const filteredConfirmed = useMemo(() => {
    if (!filterKeyword) return confirmedRecords;
    const kw = filterKeyword.toLowerCase();
    return confirmedRecords.filter(r =>
      (r.allowanceNo || '').toLowerCase().includes(kw) ||
      (r.supplierName || '').toLowerCase().includes(kw) ||
      (r.invoiceNo || '').toLowerCase().includes(kw) ||
      (r.reason || '').toLowerCase().includes(kw)
    );
  }, [confirmedRecords, filterKeyword]);

  const TABS = [
    { key: 'draft', label: `草稿 (${draftRecords.length})` },
    { key: 'confirmed', label: `已確認 (${confirmedRecords.length})` },
  ];

  function resetForm() {
    setForm({
      allowanceType: formMode,
      allowanceDate: todayStr(),
      supplierName: '', warehouse: '', purchaseNo: '', invoiceNo: '', paymentOrderNo: '',
      supplierId: null, invoiceId: null, paymentOrderId: null,
      creditNoteNo: '',
      amount: '', tax: '0', totalAmount: '', reason: formMode === '全額退貨' ? '全額退貨' : '', note: '',
      details: [],
    });
    setEditingId(null);
    setSelectedPurchase(null);
    setPurchaseItems([]);
    setPurchaseSearch('');
    setPurchaseListResults([]);
    setPurchaseListTruncated(false);
    setPurchaseListSearched(false);
  }

  function openEdit(rec) {
    setFormMode(rec.allowanceType || '折讓');
    setForm({
      allowanceType: rec.allowanceType || '折讓',
      allowanceDate: rec.allowanceDate || '',
      supplierName: rec.supplierName || '',
      warehouse: rec.warehouse || '',
      purchaseNo: rec.purchaseNo || '',
      invoiceNo: rec.invoiceNo || '',
      paymentOrderNo: rec.paymentOrderNo || '',
      supplierId: rec.supplierId || null,
      invoiceId: rec.invoiceId || null,
      paymentOrderId: rec.paymentOrderId || null,
      creditNoteNo: rec.creditNoteNo || '',
      amount: String(rec.amount || ''),
      tax: String(rec.tax || '0'),
      totalAmount: String(rec.totalAmount || ''),
      reason: rec.reason || '',
      note: rec.note || '',
      details: rec.details?.map(d => ({
        productName: d.productName || '',
        quantity: String(d.quantity || ''),
        unitPrice: String(d.unitPrice || ''),
        subtotal: String(d.subtotal || ''),
        reason: d.reason || '',
      })) || [],
    });
    setEditingId(rec.id);
    setShowForm(true);
    setSelectedPurchase(null);
  }

  function addDetailLine() {
    setForm(f => ({
      ...f,
      details: [...f.details, { productName: '', quantity: '', unitPrice: '', subtotal: '', reason: '' }],
    }));
  }

  function updateDetail(idx, field, value) {
    setForm(f => {
      const details = [...f.details];
      details[idx] = { ...details[idx], [field]: value };
      if (field === 'quantity' || field === 'unitPrice') {
        const qty = parseFloat(details[idx].quantity) || 0;
        const price = parseFloat(details[idx].unitPrice) || 0;
        details[idx].subtotal = String(Math.round(qty * price));
      }
      const detailTotal = details.reduce((s, d) => s + (parseFloat(d.subtotal) || 0), 0);
      if (detailTotal > 0) {
        const tax = parseFloat(f.tax) || 0;
        return { ...f, details, amount: String(detailTotal), totalAmount: String(detailTotal + tax) };
      }
      return { ...f, details };
    });
  }

  function removeDetail(idx) {
    setForm(f => {
      const details = f.details.filter((_, i) => i !== idx);
      const detailTotal = details.reduce((s, d) => s + (parseFloat(d.subtotal) || 0), 0);
      const tax = parseFloat(f.tax) || 0;
      return {
        ...f, details,
        amount: detailTotal > 0 ? String(detailTotal) : f.amount,
        totalAmount: detailTotal > 0 ? String(detailTotal + tax) : f.totalAmount,
      };
    });
  }

  function updateAmountField(field, value) {
    setForm(f => {
      const updated = { ...f, [field]: value };
      if (field === 'amount' || field === 'tax') {
        const amt = parseFloat(field === 'amount' ? value : f.amount) || 0;
        const tax = parseFloat(field === 'tax' ? value : f.tax) || 0;
        updated.totalAmount = String(amt + tax);
      }
      return updated;
    });
  }

  async function handleSave(e) {
    e.preventDefault();
    if (!form.allowanceDate) return showToast('請選擇退貨日期', 'error');
    if (!form.totalAmount || parseFloat(form.totalAmount) <= 0) return showToast('退貨金額必須大於 0', 'error');
    const payload = { ...form, createdBy: session?.user?.email || '' };
    setFormSaving(true);
    try {
      const url = editingId ? `/api/purchase-allowances/${editingId}` : '/api/purchase-allowances';
      const method = editingId ? 'PUT' : 'POST';
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (res.ok) {
        showToast(editingId ? '退貨單已更新' : '退貨單已建立', 'success');
        setShowForm(false);
        resetForm();
        fetchAll();
      } else {
        const err = await res.json();
        showToast((typeof err.error === 'string' ? err.error : err.error?.message) || '儲存失敗', 'error');
      }
    } catch { showToast('儲存失敗', 'error'); }
    finally { setFormSaving(false); }
  }

  async function handleDelete(rec) {
    if (!(await confirm(`確定刪除退貨單「${rec.allowanceNo}」？`, { title: '刪除確認', danger: true }))) return;
    try {
      const res = await fetch(`/api/purchase-allowances/${rec.id}`, { method: 'DELETE' });
      if (res.ok) { showToast('已刪除', 'success'); fetchAll(); }
      else { const err = await res.json(); showToast(err.error?.message || '刪除失敗', 'error'); }
    } catch { showToast('刪除失敗', 'error'); }
  }

  async function handleConfirm() {
    if (!confirmAccountId) return showToast('請選擇退款帳戶', 'error');
    const rec = records.find(r => r.id === confirmingId);
    if (!rec) return;
    if (!(await confirm(`確認退貨單「${rec.allowanceNo}」，退款 NT$ ${Number(rec.totalAmount).toLocaleString()} 至帳戶？`, { title: '確認退款', danger: false }))) return;
    setConfirmSaving(true);
    try {
      const res = await fetch(`/api/purchase-allowances/${confirmingId}/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId: parseInt(confirmAccountId), refundDate: confirmDate }),
      });
      const result = await res.json();
      if (res.ok) {
        const msg = result.message?.replace(/\n/g, '，') || '確認成功，退款已入帳，損益表已回沖';
        showToast(msg, 'success');
        setConfirmingId(null);
        setConfirmAccountId('');
        fetchAll();
      } else {
        showToast((typeof result.error === 'string' ? result.error : result.error?.message) || result.message || '確認失敗', 'error');
      }
    } catch (err) { showToast('確認失敗: ' + err.message, 'error'); }
    finally { setConfirmSaving(false); }
  }

  function handlePrint() {
    const rows = activeTab === 'draft' ? filteredDraft : filteredConfirmed;
    if (rows.length === 0) return showToast('沒有資料可列印', 'error');
    const title = activeTab === 'draft' ? '進貨退貨 — 草稿' : '進貨退貨 — 已確認';
    const isDraft = activeTab === 'draft';
    const headers = isDraft
      ? ['單號','類型','日期','供應商','館別','發票號碼','付款單號','原因','金額']
      : ['單號','類型','日期','供應商','館別','發票號碼','付款單號','原因','退款金額','退款交易','確認者'];
    const typeLabel = t => t === '折讓' ? '退貨' : (t || '退貨');
    const bodyRows = rows.map(r => {
      const base = [
        r.allowanceNo || '', typeLabel(r.allowanceType), r.allowanceDate || '',
        r.supplierName || '-', r.warehouse || '-', r.invoiceNo || '-',
        r.paymentOrderNo || '-', (r.reason || '-').substring(0, 30),
        `NT$ ${Number(r.totalAmount).toLocaleString()}`,
      ];
      if (!isDraft) base.push(r.cashTransactionNo || '-', r.confirmedBy || '-');
      return base;
    });
    const totalAmt = rows.reduce((s, r) => s + Number(r.totalAmount), 0);
    const w = window.open('', '_blank');
    w.document.write(`<html><head><title>${title}</title><style>
      body{font-family:sans-serif;padding:20px}table{width:100%;border-collapse:collapse;margin-top:10px}
      th,td{border:1px solid #ccc;padding:6px 10px;font-size:13px;text-align:left}th{background:#f3f4f6}
      @media print{button{display:none}}
    </style></head><body>
    <h2>${title}</h2><p>列印日期：${new Date().toLocaleDateString('zh-TW')}</p>
    <table><thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead>
    <tbody>${bodyRows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}
    <tr style="font-weight:bold"><td colspan="${isDraft ? 8 : 9}">合計 ${rows.length} 筆</td><td>NT$ ${totalAmt.toLocaleString()}</td>${!isDraft ? '<td colspan="2"></td>' : ''}</tr>
    </tbody></table>
    <button onclick="window.print()" style="margin-top:16px;padding:8px 20px;font-size:14px;cursor:pointer">列印</button>
    </body></html>`);
    w.document.close();
  }

  function handleExportExcel() {
    const rows = activeTab === 'draft' ? filteredDraft : filteredConfirmed;
    if (rows.length === 0) return showToast('沒有資料可匯出', 'error');
    const isDraft = activeTab === 'draft';
    const headers = isDraft
      ? ['單號','類型','日期','供應商','館別','發票號碼','付款單號','原因','金額']
      : ['單號','類型','日期','供應商','館別','發票號碼','付款單號','原因','退款金額','退款交易','確認者'];
    const typeLabel = t => t === '折讓' ? '退貨' : (t || '退貨');
    const csvRows = rows.map(r => {
      const base = [
        r.allowanceNo || '', typeLabel(r.allowanceType), r.allowanceDate || '',
        r.supplierName || '', r.warehouse || '', r.invoiceNo || '',
        r.paymentOrderNo || '', r.reason || '', Number(r.totalAmount),
      ];
      if (!isDraft) base.push(r.cashTransactionNo || '', r.confirmedBy || '');
      return base;
    });
    const q = v => `"${String(v).replace(/"/g, '""')}"`;
    const csv = '﻿' + [headers.map(q).join(','), ...csvRows.map(r => r.map(q).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `進貨退貨_${activeTab === 'draft' ? '草稿' : '已確認'}_${todayStr()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return {
    loading, fetchError, fetchAll,
    activeTab, setActiveTab,
    records,
    draftRecords, confirmedRecords,
    filteredDraft, filteredConfirmed,
    bankAccounts, warehouses, suppliers,
    TABS,
    filterKeyword, setFilterKeyword,
    purchaseSearch, setPurchaseSearch,
    purchaseFilterDateFrom, setPurchaseFilterDateFrom,
    purchaseFilterDateTo, setPurchaseFilterDateTo,
    purchaseFilterSupplierId, setPurchaseFilterSupplierId,
    purchaseFilterWarehouse, setPurchaseFilterWarehouse,
    purchaseFilterPaidOnly, setPurchaseFilterPaidOnly,
    purchaseListResults,
    purchaseListTruncated,
    purchaseListLoading,
    purchaseListSearched,
    selectedPurchase,
    searchPurchaseList,
    selectPurchase,
    showForm, setShowForm,
    formMode, setFormMode,
    editingId,
    form, setForm,
    purchaseItems,
    formSaving,
    resetForm,
    openEdit,
    addDetailLine, updateDetail, removeDetail,
    updateAmountField,
    togglePurchaseItem,
    updatePurchaseItemReturnQty,
    handleSave,
    handleDelete,
    confirmingId, setConfirmingId,
    confirmAccountId, setConfirmAccountId,
    confirmDate, setConfirmDate,
    confirmSaving,
    handleConfirm,
    handlePrint,
    handleExportExcel,
  };
}
