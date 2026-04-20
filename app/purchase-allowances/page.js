'use client';

import { useState, useEffect, useMemo } from 'react';
import { useSession } from 'next-auth/react';
import Navigation from '@/components/Navigation';
import { useToast } from '@/context/ToastContext';

export default function PurchaseAllowancesPage() {
  const { data: session } = useSession();
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState('draft');
  const [records, setRecords] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);

  // Purchase search
  const [purchaseSearch, setPurchaseSearch] = useState('');
  const [purchaseFilterDateFrom, setPurchaseFilterDateFrom] = useState('');
  const [purchaseFilterDateTo, setPurchaseFilterDateTo] = useState('');
  const [purchaseFilterSupplierId, setPurchaseFilterSupplierId] = useState('');
  const [purchaseFilterWarehouse, setPurchaseFilterWarehouse] = useState('');
  const [purchaseFilterPaidOnly, setPurchaseFilterPaidOnly] = useState('all'); // 'all' | 'paid' | 'unpaid'
  const [purchaseListResults, setPurchaseListResults] = useState([]);
  const [purchaseListLoading, setPurchaseListLoading] = useState(false);
  const [purchaseListSearched, setPurchaseListSearched] = useState(false);
  const [selectedPurchase, setSelectedPurchase] = useState(null);

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [formMode, setFormMode] = useState('折讓'); // '折讓' or '全額退貨'
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({
    allowanceType: '折讓',
    allowanceDate: new Date().toISOString().split('T')[0],
    supplierName: '', warehouse: '', purchaseNo: '', invoiceNo: '', paymentOrderNo: '',
    supplierId: null, invoiceId: null, paymentOrderId: null,
    amount: '', tax: '0', totalAmount: '', reason: '', note: '',
    details: [],
  });

  // Purchase item selection (checkbox per item)
  const [purchaseItems, setPurchaseItems] = useState([]);

  // Saving states
  const [formSaving, setFormSaving] = useState(false);
  const [confirmSaving, setConfirmSaving] = useState(false);

  // Confirm modal
  const [confirmingId, setConfirmingId] = useState(null);
  const [confirmAccountId, setConfirmAccountId] = useState('');
  const [confirmDate, setConfirmDate] = useState(new Date().toISOString().split('T')[0]);

  // Filter state
  const [filterKeyword, setFilterKeyword] = useState('');

  useEffect(() => { fetchAll(); }, []);

  async function fetchAll() {
    setLoading(true);
    const [aRes, accRes, whRes, supRes] = await Promise.all([
      fetch('/api/purchase-allowances').then(r => r.json()).catch(() => []),
      fetch('/api/cashflow/accounts').then(r => r.json()).catch(() => []),
      fetch('/api/warehouse-departments').then(r => r.json()).catch(() => []),
      fetch('/api/suppliers?all=true').then(r => r.json()).catch(() => []),
    ]);
    setRecords(Array.isArray(aRes) ? aRes : []);
    setAccounts(Array.isArray(accRes) ? accRes : []);
    setWarehouses(Array.isArray(whRes?.list) ? whRes.list.filter(w => w.type === 'building') : Array.isArray(whRes) ? whRes.filter(w => w.type === 'warehouse') : []);
    setSuppliers(Array.isArray(supRes) ? supRes : []);
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
      setPurchaseListResults(Array.isArray(data) ? data : []);
    } catch {
      setPurchaseListResults([]);
    }
    setPurchaseListLoading(false);
  }

  // Sync purchaseItems selection → form.details + recalc amounts
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

  // Select purchase and auto-populate form (連動發票單號、付款單號、品項)
  function selectPurchase(p) {
    setSelectedPurchase(p);
    setPurchaseListResults([]);  // fix: was setPurchaseResults (undefined)
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

  const draftRecords = useMemo(() => records.filter(r => r.status === '草稿'), [records]);
  const confirmedRecords = useMemo(() => records.filter(r => r.status === '已確認'), [records]);
  const bankAccounts = accounts.filter(a => a.isActive && (a.type === '銀行存款' || a.type === '現金'));

  // Filter records
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
      allowanceDate: new Date().toISOString().split('T')[0],
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
    if (!confirm(`確定刪除退貨單「${rec.allowanceNo}」？`)) return;
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

    if (!confirm(`確認退貨單「${rec.allowanceNo}」，退款 NT$ ${Number(rec.totalAmount).toLocaleString()} 至帳戶？`)) return;

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
      if (!isDraft) {
        base.push(r.cashTransactionNo || '-', r.confirmedBy || '-');
      }
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
    <tr style="font-weight:bold"><td colspan="${isDraft ? 8 : 9}">合計 ${rows.length} 筆</td><td>${isDraft ? '' : ''}NT$ ${totalAmt.toLocaleString()}</td>${!isDraft ? '<td colspan="2"></td>' : ''}</tr>
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
      if (!isDraft) {
        base.push(r.cashTransactionNo || '', r.confirmedBy || '');
      }
      return base;
    });
    const q = v => `"${String(v).replace(/"/g, '""')}"`;
    const csv = '\uFEFF' + [headers.map(q).join(','), ...csvRows.map(r => r.map(q).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `進貨退貨_${activeTab === 'draft' ? '草稿' : '已確認'}_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const thStyle = { padding: '10px 14px', textAlign: 'left', borderBottom: '2px solid #e5e7eb', fontSize: '1rem', fontWeight: 600, color: '#374151', whiteSpace: 'nowrap' };
  const tdStyle = { padding: '10px 14px', borderBottom: '1px solid #f3f4f6', fontSize: '1rem' };
  const inputStyle = { width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: '1rem', boxSizing: 'border-box' };
  const labelStyle = { fontSize: '0.875rem', color: '#6b7280', display: 'block', marginBottom: 4 };

  if (loading) return (
    <>
      <Navigation borderColor="border-orange-500" />
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: 24 }}>
        <div style={{ textAlign: 'center', padding: 60, color: '#6b7280' }}>載入中...</div>
      </div>
    </>
  );

  return (
    <>
      <Navigation borderColor="border-orange-500" />
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 700 }}>進貨退貨管理</h2>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => { setFormMode('折讓'); resetForm(); setShowForm(v => formMode !== '折讓' ? true : !v); }}
              style={{ padding: '8px 16px', background: '#ea580c', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: '1rem' }}>
              + 新增退貨單
            </button>
            <button onClick={() => { setFormMode('全額退貨'); resetForm(); setShowForm(v => formMode !== '全額退貨' ? true : !v); }}
              style={{ padding: '8px 16px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: '1rem' }}>
              + 全額退貨退款
            </button>
          </div>
        </div>

        {/* KPI Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 24 }}>
          <div style={{ background: '#fff7ed', borderRadius: 8, padding: 16 }}>
            <div style={{ fontSize: '0.875rem', color: '#9a3412' }}>草稿件數</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#9a3412' }}>{draftRecords.length}</div>
          </div>
          <div style={{ background: '#fef3c7', borderRadius: 8, padding: 16 }}>
            <div style={{ fontSize: '0.875rem', color: '#92400e' }}>草稿金額</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#92400e' }}>NT$ {draftRecords.reduce((s, r) => s + r.totalAmount, 0).toLocaleString()}</div>
          </div>
          <div style={{ background: '#d1fae5', borderRadius: 8, padding: 16 }}>
            <div style={{ fontSize: '0.875rem', color: '#065f46' }}>已退款金額</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#065f46' }}>NT$ {confirmedRecords.reduce((s, r) => s + r.totalAmount, 0).toLocaleString()}</div>
          </div>
        </div>

        {/* Add/Edit form */}
        {showForm && (
          <div style={{ background: formMode === '全額退貨' ? '#fef2f2' : '#fffbeb', border: `1px solid ${formMode === '全額退貨' ? '#fca5a5' : '#fbbf24'}`, borderRadius: 8, padding: 20, marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: 0 }}>
                {editingId ? '編輯' : '新增'}{formMode === '全額退貨' ? '全額退貨退款單' : '退貨單'}
              </h3>
              <span style={{
                padding: '2px 10px', borderRadius: 10, fontSize: '0.875rem', fontWeight: 600,
                background: formMode === '全額退貨' ? '#fee2e2' : '#fef3c7',
                color: formMode === '全額退貨' ? '#dc2626' : '#92400e',
              }}>
                {formMode === '全額退貨' ? '全額退貨 — 將作廢原發票/付款單/進貨單' : '部分退貨'}
              </span>
            </div>

            {/* Purchase Search Section */}
            {!editingId && (
              <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 16, marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <label style={{ fontSize: '1rem', fontWeight: 600, color: '#374151' }}>
                    Step 1: 搜尋「已出納」進貨單，勾選後自動帶入表單
                    {formMode === '全額退貨' && <span style={{ color: '#dc2626', marginLeft: 8 }}>— 確認後將全額退款並作廢原單據</span>}
                  </label>
                  {selectedPurchase && (
                    <button type="button" onClick={() => { setSelectedPurchase(null); resetForm(); setShowForm(true); }}
                      style={{ padding: '2px 10px', fontSize: '0.75rem', background: 'none', border: '1px solid #dc2626', color: '#dc2626', borderRadius: 4, cursor: 'pointer' }}>
                      清除選取
                    </button>
                  )}
                </div>

                {/* Filters */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 8, marginBottom: 10 }}>
                  <div>
                    <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: 3 }}>進貨日期起</div>
                    <input type="date" value={purchaseFilterDateFrom} onChange={e => setPurchaseFilterDateFrom(e.target.value)}
                      style={{ ...inputStyle, fontSize: '0.875rem', padding: '6px 8px' }} />
                  </div>
                  <div>
                    <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: 3 }}>進貨日期迄</div>
                    <input type="date" value={purchaseFilterDateTo} onChange={e => setPurchaseFilterDateTo(e.target.value)}
                      style={{ ...inputStyle, fontSize: '0.875rem', padding: '6px 8px' }} />
                  </div>
                  <div>
                    <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: 3 }}>廠商</div>
                    <select value={purchaseFilterSupplierId} onChange={e => setPurchaseFilterSupplierId(e.target.value)}
                      style={{ ...inputStyle, fontSize: '0.875rem', padding: '6px 8px' }}>
                      <option value="">全部廠商</option>
                      {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: 3 }}>館別</div>
                    <select value={purchaseFilterWarehouse} onChange={e => setPurchaseFilterWarehouse(e.target.value)}
                      style={{ ...inputStyle, fontSize: '0.875rem', padding: '6px 8px' }}>
                      <option value="">全部館別</option>
                      {warehouses.map(w => <option key={w.id} value={w.name}>{w.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: 3 }}>付款狀態</div>
                    <select value={purchaseFilterPaidOnly} onChange={e => setPurchaseFilterPaidOnly(e.target.value)}
                      style={{ ...inputStyle, fontSize: '0.875rem', padding: '6px 8px' }}>
                      <option value="all">全部</option>
                      <option value="paid">僅已付款</option>
                      <option value="unpaid">未付款</option>
                    </select>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: 3 }}>關鍵字（單號/品名）</div>
                    <input value={purchaseSearch} onChange={e => setPurchaseSearch(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && searchPurchaseList()}
                      placeholder="進貨單號 / 品名..."
                      style={{ ...inputStyle, fontSize: '0.875rem', padding: '6px 8px' }} />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                    <button type="button" onClick={searchPurchaseList} disabled={purchaseListLoading}
                      style={{ width: '100%', padding: '7px 12px', background: '#f59e0b', color: '#fff', border: 'none', borderRadius: 6, cursor: purchaseListLoading ? 'not-allowed' : 'pointer', fontSize: '0.875rem', fontWeight: 600, opacity: purchaseListLoading ? 0.7 : 1 }}>
                      {purchaseListLoading ? '查詢中...' : '查詢進貨單'}
                    </button>
                  </div>
                </div>

                {/* Results list */}
                {purchaseListSearched && !purchaseListLoading && (
                  purchaseListResults.length === 0 ? (
                    <div style={{ padding: '14px', textAlign: 'center', fontSize: '0.875rem', color: '#9ca3af', background: '#f9fafb', borderRadius: 6, border: '1px solid #e5e7eb' }}>
                      查無符合條件的已出納進貨單
                    </div>
                  ) : (
                    <div style={{ border: '1px solid #e5e7eb', borderRadius: 6, overflow: 'hidden', maxHeight: 320, overflowY: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                        <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                          <tr style={{ background: '#fef3c7' }}>
                            <th style={{ padding: '7px 10px', textAlign: 'left', fontWeight: 600, color: '#92400e', borderBottom: '1px solid #e5e7eb', whiteSpace: 'nowrap' }}>進貨單號</th>
                            <th style={{ padding: '7px 10px', textAlign: 'left', fontWeight: 600, color: '#92400e', borderBottom: '1px solid #e5e7eb' }}>廠商</th>
                            <th style={{ padding: '7px 10px', textAlign: 'left', fontWeight: 600, color: '#92400e', borderBottom: '1px solid #e5e7eb' }}>館別</th>
                            <th style={{ padding: '7px 10px', textAlign: 'left', fontWeight: 600, color: '#92400e', borderBottom: '1px solid #e5e7eb', whiteSpace: 'nowrap' }}>進貨日期</th>
                            <th style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 600, color: '#92400e', borderBottom: '1px solid #e5e7eb', whiteSpace: 'nowrap' }}>金額</th>
                            <th style={{ padding: '7px 10px', textAlign: 'left', fontWeight: 600, color: '#92400e', borderBottom: '1px solid #e5e7eb', whiteSpace: 'nowrap' }}>付款單號</th>
                            <th style={{ padding: '7px 10px', textAlign: 'center', fontWeight: 600, color: '#92400e', borderBottom: '1px solid #e5e7eb', whiteSpace: 'nowrap' }}>選取</th>
                          </tr>
                        </thead>
                        <tbody>
                          {purchaseListResults.map((p, idx) => {
                            const isSelected = selectedPurchase?.purchaseId === p.purchaseId;
                            return (
                              <tr key={p.purchaseId} onClick={() => selectPurchase(p)}
                                style={{ cursor: 'pointer', background: isSelected ? '#fef9c3' : idx % 2 === 0 ? '#fff' : '#fafafa', borderBottom: '1px solid #f3f4f6' }}
                                onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = '#fffbeb'; }}
                                onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = idx % 2 === 0 ? '#fff' : '#fafafa'; }}>
                                <td style={{ padding: '8px 10px', fontWeight: 600, color: '#1d4ed8', fontFamily: 'monospace' }}>{p.purchaseNo}</td>
                                <td style={{ padding: '8px 10px', color: '#ea580c', fontWeight: 600 }}>{p.supplierName}</td>
                                <td style={{ padding: '8px 10px', color: '#374151' }}>{p.warehouse || '-'}</td>
                                <td style={{ padding: '8px 10px', color: '#6b7280', whiteSpace: 'nowrap' }}>{p.purchaseDate || '-'}</td>
                                <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, color: '#059669', whiteSpace: 'nowrap' }}>NT$ {Number(p.totalAmount).toLocaleString()}</td>
                                <td style={{ padding: '8px 10px', color: '#b45309', fontSize: '0.75rem', fontFamily: 'monospace' }}>{p.paymentOrderNo || '-'}</td>
                                <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                                  {isSelected
                                    ? <span style={{ fontSize: '1rem', color: '#f59e0b' }}>✓</span>
                                    : <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>選取</span>}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )
                )}

                {/* Selected purchase info banner */}
                {selectedPurchase && (
                  <div style={{ marginTop: 10, background: '#f0fdf4', border: '2px solid #86efac', borderRadius: 8, padding: '10px 14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 700, fontSize: '0.875rem', color: '#166534' }}>✓ 已帶入：</span>
                      <span style={{ fontWeight: 700, color: '#1d4ed8', fontFamily: 'monospace', fontSize: '0.875rem' }}>{selectedPurchase.purchaseNo}</span>
                      <span style={{ color: '#ea580c', fontWeight: 600, fontSize: '0.875rem' }}>{selectedPurchase.supplierName}</span>
                      <span style={{ color: '#374151', fontSize: '0.875rem' }}>{selectedPurchase.warehouse}</span>
                      <span style={{ fontWeight: 700, color: '#059669', fontSize: '0.875rem' }}>NT$ {Number(selectedPurchase.totalAmount).toLocaleString()}</span>
                      {selectedPurchase.invoiceNo && <span style={{ fontSize: '0.75rem', color: '#7c3aed' }}>發票: {selectedPurchase.invoiceNo}</span>}
                      {selectedPurchase.paymentOrderNo && <span style={{ fontSize: '0.75rem', color: '#b45309' }}>付款單: {selectedPurchase.paymentOrderNo}</span>}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#166534', marginTop: 4 }}>表單欄位已自動填寫，您仍可手動修改任何欄位</div>
                  </div>
                )}

                {!purchaseListSearched && (
                  <div style={{ marginTop: 8, fontSize: '0.875rem', color: '#9ca3af' }}>
                    設定條件後按「查詢進貨單」，也可跳過直接手動填寫
                  </div>
                )}
              </div>
            )}

            <form onSubmit={handleSave}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 12 }}>
                <div>
                  <label style={labelStyle}>退貨日期 *</label>
                  <input type="date" value={form.allowanceDate} onChange={e => setForm(f => ({ ...f, allowanceDate: e.target.value }))} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>供應商名稱</label>
                  <select value={form.supplierName} onChange={e => { const s = suppliers.find(s => s.name === e.target.value); setForm(f => ({ ...f, supplierName: e.target.value, supplierId: s?.id || null })); }} style={inputStyle}>
                    <option value="">選擇供應商</option>
                    {suppliers.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
                    {form.supplierName && !suppliers.some(s => s.name === form.supplierName) && <option value={form.supplierName}>{form.supplierName}</option>}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>館別</label>
                  <select value={form.warehouse} onChange={e => setForm(f => ({ ...f, warehouse: e.target.value }))} style={inputStyle}>
                    <option value="">選擇館別</option>
                    {warehouses.map(w => <option key={w.id} value={w.name}>{w.name}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>原進貨單號 {selectedPurchase && form.purchaseNo && <span style={{ color: '#059669', fontSize: '0.75rem' }}>✓ 已連動</span>}</label>
                  <input value={form.purchaseNo} onChange={e => setForm(f => ({ ...f, purchaseNo: e.target.value }))} placeholder="選填"
                    style={{ ...inputStyle, ...(selectedPurchase && form.purchaseNo ? { background: '#f0fdf4', borderColor: '#86efac' } : {}) }} />
                </div>
                <div>
                  <label style={labelStyle}>原發票號碼 {selectedPurchase && form.invoiceNo && <span style={{ color: '#059669', fontSize: '0.75rem' }}>✓ 已連動</span>}</label>
                  <input value={form.invoiceNo} onChange={e => setForm(f => ({ ...f, invoiceNo: e.target.value }))} placeholder="選填"
                    style={{ ...inputStyle, ...(selectedPurchase && form.invoiceNo ? { background: '#f0fdf4', borderColor: '#86efac' } : {}) }} />
                </div>
                <div>
                  <label style={labelStyle}>原付款單號 {selectedPurchase && form.paymentOrderNo && <span style={{ color: '#059669', fontSize: '0.75rem' }}>✓ 已連動</span>}</label>
                  <input value={form.paymentOrderNo} onChange={e => setForm(f => ({ ...f, paymentOrderNo: e.target.value }))} placeholder="選填"
                    style={{ ...inputStyle, ...(selectedPurchase && form.paymentOrderNo ? { background: '#f0fdf4', borderColor: '#86efac' } : {}) }} />
                </div>
              </div>

              {/* Detail lines */}
              <div style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <label style={{ fontSize: '1rem', fontWeight: 600 }}>
                    退貨明細
                    {selectedPurchase && purchaseItems.length > 0 && (
                      <span style={{ fontSize: '0.75rem', fontWeight: 400, color: '#6b7280', marginLeft: 8 }}>
                        勾選要退貨的品項，可調整退貨數量
                      </span>
                    )}
                  </label>
                  {!selectedPurchase && (
                    <button type="button" onClick={addDetailLine} style={{ padding: '4px 12px', background: '#f59e0b', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: '0.875rem' }}>+ 新增項目</button>
                  )}
                </div>

                {/* 已選進貨單：顯示 checkbox 勾選介面 */}
                {selectedPurchase && purchaseItems.length > 0 ? (
                  <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 8, border: '1px solid #e5e7eb', borderRadius: 6, overflow: 'hidden' }}>
                    <thead>
                      <tr style={{ background: '#fef9c3' }}>
                        <th style={{ padding: '7px 10px', fontSize: '0.875rem', textAlign: 'center', width: 50, borderBottom: '1px solid #e5e7eb' }}>退貨</th>
                        <th style={{ padding: '7px 10px', fontSize: '0.875rem', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>品名</th>
                        <th style={{ padding: '7px 10px', fontSize: '0.875rem', textAlign: 'right', width: 80, borderBottom: '1px solid #e5e7eb' }}>原數量</th>
                        <th style={{ padding: '7px 10px', fontSize: '0.875rem', textAlign: 'right', width: 110, borderBottom: '1px solid #e5e7eb' }}>退貨數量</th>
                        <th style={{ padding: '7px 10px', fontSize: '0.875rem', textAlign: 'center', width: 60, borderBottom: '1px solid #e5e7eb' }}>單位</th>
                        <th style={{ padding: '7px 10px', fontSize: '0.875rem', textAlign: 'right', width: 110, borderBottom: '1px solid #e5e7eb' }}>單價</th>
                        <th style={{ padding: '7px 10px', fontSize: '0.875rem', textAlign: 'right', width: 120, borderBottom: '1px solid #e5e7eb' }}>退貨小計</th>
                      </tr>
                    </thead>
                    <tbody>
                      {purchaseItems.map((item, idx) => (
                        <tr key={idx} style={{ background: item.selected ? '#f0fdf4' : '#f9fafb', borderBottom: '1px solid #f3f4f6', opacity: item.selected ? 1 : 0.55 }}>
                          <td style={{ padding: '6px 10px', textAlign: 'center' }}>
                            <input type="checkbox" checked={item.selected} onChange={() => togglePurchaseItem(idx)}
                              style={{ width: 18, height: 18, cursor: 'pointer', accentColor: '#16a34a' }} />
                          </td>
                          <td style={{ padding: '6px 10px', fontSize: '0.875rem', fontWeight: item.selected ? 600 : 400, color: item.selected ? '#111827' : '#6b7280' }}>
                            {item.productName}
                          </td>
                          <td style={{ padding: '6px 10px', fontSize: '0.875rem', textAlign: 'right', color: '#6b7280' }}>
                            {item.quantity}
                          </td>
                          <td style={{ padding: '4px 8px' }}>
                            <input
                              type="number" min="0" max={item.quantity} step="1"
                              value={item.returnQty}
                              disabled={!item.selected}
                              onChange={e => updatePurchaseItemReturnQty(idx, e.target.value)}
                              style={{ width: '100%', padding: '4px 6px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: '0.875rem', textAlign: 'right', background: item.selected ? '#fff' : '#f3f4f6', cursor: item.selected ? 'text' : 'not-allowed' }}
                            />
                          </td>
                          <td style={{ padding: '6px 10px', fontSize: '0.75rem', textAlign: 'center', color: '#6b7280' }}>{item.unit}</td>
                          <td style={{ padding: '6px 10px', fontSize: '0.875rem', textAlign: 'right' }}>
                            NT$ {Number(item.unitPrice).toLocaleString()}
                          </td>
                          <td style={{ padding: '6px 10px', fontSize: '0.875rem', textAlign: 'right', fontWeight: 700, color: item.selected ? '#dc2626' : '#9ca3af' }}>
                            NT$ {Math.round((parseFloat(item.returnQty) || 0) * item.unitPrice).toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr style={{ background: '#fef3c7' }}>
                        <td colSpan={6} style={{ padding: '7px 10px', fontSize: '0.875rem', textAlign: 'right', fontWeight: 600 }}>
                          已勾選 {purchaseItems.filter(i => i.selected).length} / {purchaseItems.length} 項，退貨小計
                        </td>
                        <td style={{ padding: '7px 10px', fontSize: '1rem', textAlign: 'right', fontWeight: 700, color: '#dc2626' }}>
                          NT$ {purchaseItems.filter(i => i.selected).reduce((s, i) => s + Math.round((parseFloat(i.returnQty) || 0) * i.unitPrice), 0).toLocaleString()}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                ) : (
                  /* 無選取進貨單：手動填寫模式 */
                  form.details.length > 0 && (
                    <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 8 }}>
                      <thead>
                        <tr style={{ background: '#fef9c3' }}>
                          <th style={{ padding: '6px 8px', fontSize: '0.875rem', textAlign: 'left' }}>品名</th>
                          <th style={{ padding: '6px 8px', fontSize: '0.875rem', textAlign: 'right', width: 80 }}>數量</th>
                          <th style={{ padding: '6px 8px', fontSize: '0.875rem', textAlign: 'right', width: 100 }}>單價</th>
                          <th style={{ padding: '6px 8px', fontSize: '0.875rem', textAlign: 'right', width: 100 }}>小計</th>
                          <th style={{ padding: '6px 8px', fontSize: '0.875rem', textAlign: 'left' }}>原因</th>
                          <th style={{ width: 40 }}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {form.details.map((d, idx) => (
                          <tr key={idx}>
                            <td style={{ padding: '4px 6px' }}>
                              <input value={d.productName} onChange={e => updateDetail(idx, 'productName', e.target.value)} style={{ width: '100%', padding: '4px 6px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: '0.875rem' }} />
                            </td>
                            <td style={{ padding: '4px 6px' }}>
                              <input type="number" value={d.quantity} onChange={e => updateDetail(idx, 'quantity', e.target.value)} style={{ width: '100%', padding: '4px 6px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: '0.875rem', textAlign: 'right' }} />
                            </td>
                            <td style={{ padding: '4px 6px' }}>
                              <input type="number" value={d.unitPrice} onChange={e => updateDetail(idx, 'unitPrice', e.target.value)} style={{ width: '100%', padding: '4px 6px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: '0.875rem', textAlign: 'right' }} />
                            </td>
                            <td style={{ padding: '4px 6px' }}>
                              <input type="number" value={d.subtotal} onChange={e => updateDetail(idx, 'subtotal', e.target.value)} style={{ width: '100%', padding: '4px 6px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: '0.875rem', textAlign: 'right', background: '#f9fafb' }} />
                            </td>
                            <td style={{ padding: '4px 6px' }}>
                              <input value={d.reason} onChange={e => updateDetail(idx, 'reason', e.target.value)} placeholder="產品瑕疵/數量不符" style={{ width: '100%', padding: '4px 6px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: '0.875rem' }} />
                            </td>
                            <td style={{ padding: '4px 6px', textAlign: 'center' }}>
                              <button type="button" onClick={() => removeDetail(idx)} style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: '1rem' }}>✕</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )
                )}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 12 }}>
                {formMode === '全額退貨' && selectedPurchase && (
                  <div style={{ gridColumn: '1 / -1', background: '#fee2e2', padding: '6px 12px', borderRadius: 6, fontSize: '0.875rem', color: '#991b1b', marginBottom: 4 }}>
                    全額退貨模式：金額已鎖定為原進貨單全額，不可修改
                  </div>
                )}
                <div>
                  <label style={labelStyle}>{formMode === '全額退貨' ? '退貨金額（未稅）' : '退貨金額（未稅）*'}</label>
                  <input type="number" value={form.amount}
                    onChange={e => updateAmountField('amount', e.target.value)}
                    readOnly={formMode === '全額退貨' && !!selectedPurchase}
                    style={{ ...inputStyle, textAlign: 'right', ...(formMode === '全額退貨' && selectedPurchase ? { background: '#f3f4f6', cursor: 'not-allowed' } : {}) }} />
                </div>
                <div>
                  <label style={labelStyle}>稅額</label>
                  <input type="number" value={form.tax}
                    onChange={e => updateAmountField('tax', e.target.value)}
                    readOnly={formMode === '全額退貨' && !!selectedPurchase}
                    style={{ ...inputStyle, textAlign: 'right', ...(formMode === '全額退貨' && selectedPurchase ? { background: '#f3f4f6', cursor: 'not-allowed' } : {}) }} />
                </div>
                <div>
                  <label style={labelStyle}>{formMode === '全額退貨' ? '退貨總額（含稅）' : '退貨總額（含稅）*'}</label>
                  <input type="number" value={form.totalAmount}
                    onChange={e => setForm(f => ({ ...f, totalAmount: e.target.value }))}
                    readOnly={formMode === '全額退貨' && !!selectedPurchase}
                    style={{ ...inputStyle, border: `2px solid ${formMode === '全額退貨' ? '#dc2626' : '#f59e0b'}`, fontSize: '1rem', fontWeight: 700, textAlign: 'right',
                      background: formMode === '全額退貨' && selectedPurchase ? '#fee2e2' : '#fffbeb',
                      ...(formMode === '全額退貨' && selectedPurchase ? { cursor: 'not-allowed' } : {}),
                    }} />
                </div>
              </div>

              <div style={{ marginBottom: 12 }}>
                <label style={labelStyle}>廠商折讓單號</label>
                <input value={form.creditNoteNo || ''} onChange={e => setForm(f => ({ ...f, creditNoteNo: e.target.value }))}
                  placeholder="廠商開立的折讓單號碼（選填，申報進項用）" style={inputStyle} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                <div>
                  <label style={labelStyle}>退貨原因 *</label>
                  <textarea value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} rows={2} placeholder="產品瑕疵 / 數量不符 / 價格錯誤..." style={{ ...inputStyle, resize: 'vertical' }} />
                </div>
                <div>
                  <label style={labelStyle}>備註</label>
                  <textarea value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} rows={2} placeholder="選填" style={{ ...inputStyle, resize: 'vertical' }} />
                </div>
              </div>

              {formMode === '全額退貨' && selectedPurchase && (
                <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 8, padding: 12, marginBottom: 12, fontSize: '1rem', color: '#991b1b' }}>
                  <strong>全額退貨確認後將執行：</strong>
                  <ul style={{ margin: '4px 0 0 16px', padding: 0, lineHeight: 1.8 }}>
                    <li>建立退款收入交易 NT$ {form.totalAmount ? Number(form.totalAmount).toLocaleString() : '0'}</li>
                    {form.purchaseNo && <li>原進貨單 {form.purchaseNo} 標記為「已退貨」</li>}
                    {form.invoiceNo && <li>原發票 {form.invoiceNo} 標記為「已退貨」</li>}
                    {form.paymentOrderNo && <li>原付款單 {form.paymentOrderNo} 標記為「已退貨」</li>}
                    <li>沖銷原出納付款交易</li>
                    <li>回沖損益表及月度彙總</li>
                  </ul>
                </div>
              )}

              <div style={{ display: 'flex', gap: 8 }}>
                <button type="submit" disabled={formSaving} style={{
                  padding: '8px 24px', color: '#fff', border: 'none', borderRadius: 6, cursor: formSaving ? 'not-allowed' : 'pointer', fontSize: '1rem', fontWeight: 600,
                  background: formMode === '全額退貨' ? '#dc2626' : '#ea580c', opacity: formSaving ? 0.7 : 1,
                }}>
                  {formSaving ? '儲存中...' : `${editingId ? '更新' : '建立'}${formMode === '全額退貨' ? '退貨單（草稿）' : '退貨單（草稿）'}`}
                </button>
                <button type="button" onClick={() => { setShowForm(false); resetForm(); }} disabled={formSaving} style={{ padding: '8px 20px', background: '#e5e7eb', color: '#374151', border: 'none', borderRadius: 6, cursor: formSaving ? 'not-allowed' : 'pointer', fontSize: '1rem' }}>取消</button>
              </div>
            </form>
          </div>
        )}

        {/* Search filter + Tabs */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ display: 'flex', gap: 0, borderBottom: '2px solid #e5e7eb' }}>
            {TABS.map(tab => (
              <button key={tab.key} onClick={() => setActiveTab(tab.key)} style={{
                padding: '10px 20px', border: 'none', borderBottom: activeTab === tab.key ? '3px solid #ea580c' : '3px solid transparent',
                background: 'none', fontSize: '1rem', fontWeight: activeTab === tab.key ? 600 : 400,
                color: activeTab === tab.key ? '#ea580c' : '#6b7280', cursor: 'pointer',
              }}>
                {tab.label}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button onClick={handlePrint} style={{ padding: '6px 14px', background: '#fff', border: '1px solid #d1d5db', borderRadius: 6, cursor: 'pointer', fontSize: '0.875rem', color: '#374151' }}>列印</button>
            <button onClick={handleExportExcel} style={{ padding: '6px 14px', background: '#fff', border: '1px solid #d1d5db', borderRadius: 6, cursor: 'pointer', fontSize: '0.875rem', color: '#374151' }}>匯出 Excel</button>
            <input
              value={filterKeyword}
              onChange={e => setFilterKeyword(e.target.value)}
              placeholder="篩選退貨單..."
              style={{ padding: '6px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: '1rem', width: 200 }}
            />
          </div>
        </div>

        {/* Draft Tab */}
        {activeTab === 'draft' && (
          filteredDraft.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: '#9ca3af' }}>目前沒有草稿退貨單</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f9fafb' }}>
                  <th style={thStyle}>單號</th>
                  <th style={thStyle}>類型</th>
                  <th style={thStyle}>日期</th>
                  <th style={thStyle}>供應商</th>
                  <th style={thStyle}>館別</th>
                  <th style={thStyle}>原發票/付款單</th>
                  <th style={thStyle}>原因</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>金額</th>
                  <th style={thStyle}>操作</th>
                </tr>
              </thead>
              <tbody>
                {filteredDraft.map(r => (
                  <tr key={r.id} style={{ background: r.allowanceType === '全額退貨' ? '#fef2f2' : undefined }}>
                    <td style={tdStyle}><span style={{ fontFamily: 'monospace', fontSize: '1rem' }}>{r.allowanceNo}</span></td>
                    <td style={tdStyle}>
                      <span style={{
                        padding: '2px 8px', borderRadius: 8, fontSize: '0.75rem', fontWeight: 600,
                        background: r.allowanceType === '全額退貨' ? '#fee2e2' : '#fef3c7',
                        color: r.allowanceType === '全額退貨' ? '#dc2626' : '#92400e',
                      }}>
                        {r.allowanceType === '折讓' ? '退貨' : (r.allowanceType || '退貨')}
                      </span>
                    </td>
                    <td style={tdStyle}>{r.allowanceDate}</td>
                    <td style={{ ...tdStyle, fontWeight: 600 }}>{r.supplierName || '-'}</td>
                    <td style={tdStyle}>{r.warehouse || '-'}</td>
                    <td style={tdStyle}>
                      <div style={{ fontSize: '0.875rem' }}>
                        {r.invoiceNo && <div>發票: {r.invoiceNo}</div>}
                        {r.paymentOrderNo && <div style={{ color: '#6b7280' }}>付款: {r.paymentOrderNo}</div>}
                        {!r.invoiceNo && !r.paymentOrderNo && '-'}
                      </div>
                    </td>
                    <td style={tdStyle}><span style={{ fontSize: '0.875rem', color: '#6b7280' }}>{r.reason?.substring(0, 20) || '-'}{r.reason?.length > 20 ? '...' : ''}</span></td>
                    <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700, color: '#059669' }}>NT$ {r.totalAmount.toLocaleString()}</td>
                    <td style={tdStyle}>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button onClick={() => { setConfirmingId(r.id); setConfirmDate(r.allowanceDate); }} style={{ padding: '4px 10px', fontSize: '0.875rem', color: '#fff', background: '#059669', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 600 }}>確認退款</button>
                        <button onClick={() => openEdit(r)} style={{ padding: '4px 10px', fontSize: '0.875rem', color: '#2563eb', background: 'none', border: '1px solid #2563eb', borderRadius: 4, cursor: 'pointer' }}>編輯</button>
                        <button onClick={() => handleDelete(r)} style={{ padding: '4px 10px', fontSize: '0.875rem', color: '#dc2626', background: 'none', border: '1px solid #dc2626', borderRadius: 4, cursor: 'pointer' }}>刪除</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: '#f9fafb' }}>
                  <td colSpan={7} style={{ ...tdStyle, fontWeight: 600 }}>合計 {filteredDraft.length} 筆</td>
                  <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700, color: '#059669' }}>NT$ {filteredDraft.reduce((s, r) => s + r.totalAmount, 0).toLocaleString()}</td>
                  <td style={tdStyle}></td>
                </tr>
              </tfoot>
            </table>
          )
        )}

        {/* Confirmed Tab */}
        {activeTab === 'confirmed' && (
          filteredConfirmed.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: '#9ca3af' }}>尚無已確認退貨紀錄</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f9fafb' }}>
                  <th style={thStyle}>單號</th>
                  <th style={thStyle}>類型</th>
                  <th style={thStyle}>日期</th>
                  <th style={thStyle}>供應商</th>
                  <th style={thStyle}>館別</th>
                  <th style={thStyle}>原發票/付款單</th>
                  <th style={thStyle}>原因</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>退款金額</th>
                  <th style={thStyle}>退款交易</th>
                  <th style={thStyle}>確認者</th>
                </tr>
              </thead>
              <tbody>
                {filteredConfirmed.map(r => (
                  <tr key={r.id} style={{ background: r.allowanceType === '全額退貨' ? '#fef2f2' : undefined }}>
                    <td style={tdStyle}><span style={{ fontFamily: 'monospace', fontSize: '1rem' }}>{r.allowanceNo}</span></td>
                    <td style={tdStyle}>
                      <span style={{
                        padding: '2px 8px', borderRadius: 8, fontSize: '0.75rem', fontWeight: 600,
                        background: r.allowanceType === '全額退貨' ? '#fee2e2' : '#d1fae5',
                        color: r.allowanceType === '全額退貨' ? '#dc2626' : '#065f46',
                      }}>
                        {r.allowanceType === '折讓' ? '退貨' : (r.allowanceType || '退貨')}
                      </span>
                    </td>
                    <td style={tdStyle}>{r.allowanceDate}</td>
                    <td style={{ ...tdStyle, fontWeight: 600 }}>{r.supplierName || '-'}</td>
                    <td style={tdStyle}>{r.warehouse || '-'}</td>
                    <td style={tdStyle}>
                      <div style={{ fontSize: '0.875rem' }}>
                        {r.invoiceNo && <div>發票: {r.invoiceNo}</div>}
                        {r.paymentOrderNo && <div style={{ color: '#6b7280' }}>付款: {r.paymentOrderNo}</div>}
                        {!r.invoiceNo && !r.paymentOrderNo && '-'}
                      </div>
                    </td>
                    <td style={tdStyle}><span style={{ fontSize: '0.875rem', color: '#6b7280' }}>{r.reason?.substring(0, 30) || '-'}</span></td>
                    <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700, color: '#059669' }}>NT$ {r.totalAmount.toLocaleString()}</td>
                    <td style={tdStyle}><span style={{ fontFamily: 'monospace', fontSize: '0.875rem', color: '#059669' }}>{r.cashTransactionNo || '-'}</span></td>
                    <td style={tdStyle}><span style={{ fontSize: '0.875rem' }}>{r.confirmedBy || '-'}</span></td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: '#f9fafb' }}>
                  <td colSpan={7} style={{ ...tdStyle, fontWeight: 600 }}>合計 {filteredConfirmed.length} 筆</td>
                  <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700, color: '#059669' }}>NT$ {filteredConfirmed.reduce((s, r) => s + r.totalAmount, 0).toLocaleString()}</td>
                  <td colSpan={2} style={tdStyle}></td>
                </tr>
              </tfoot>
            </table>
          )
        )}
      </div>

      {/* Confirm Modal */}
      {confirmingId && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#fff', padding: 24, borderRadius: 12, width: 480 }}>
            {(() => {
              const rec = records.find(r => r.id === confirmingId);
              if (!rec) return null;
              const isFullReturn = rec.allowanceType === '全額退貨';
              return (
                <>
                  <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: 16, color: isFullReturn ? '#dc2626' : '#374151' }}>
                    {isFullReturn ? '確認全額退貨退款' : '確認退貨退款'}
                  </h3>

                  <div style={{ background: isFullReturn ? '#fef2f2' : '#f0fdf4', padding: 12, borderRadius: 8, marginBottom: 16, fontSize: '1rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div><strong>{isFullReturn ? '退貨單' : '退貨單'}：</strong>{rec.allowanceNo}</div>
                      <span style={{
                        padding: '2px 10px', borderRadius: 8, fontSize: '0.75rem', fontWeight: 600,
                        background: isFullReturn ? '#fee2e2' : '#fef3c7',
                        color: isFullReturn ? '#dc2626' : '#92400e',
                      }}>{rec.allowanceType === '折讓' ? '退貨' : (rec.allowanceType || '退貨')}</span>
                    </div>
                    <div><strong>供應商：</strong>{rec.supplierName || '-'}</div>
                    {rec.invoiceNo && <div><strong>原發票：</strong>{rec.invoiceNo}</div>}
                    {rec.paymentOrderNo && <div><strong>原付款單：</strong>{rec.paymentOrderNo}</div>}
                    <div style={{ marginTop: 8 }}>
                      <strong>退款金額：</strong>
                      <span style={{ color: isFullReturn ? '#dc2626' : '#059669', fontWeight: 700, fontSize: '1.25rem' }}>NT$ {rec.totalAmount.toLocaleString()}</span>
                    </div>
                    {rec.reason && <div style={{ marginTop: 4 }}><strong>原因：</strong>{rec.reason}</div>}
                  </div>

                  <div style={{ background: isFullReturn ? '#fef2f2' : '#eff6ff', padding: 10, borderRadius: 6, marginBottom: 16, fontSize: '0.875rem', color: isFullReturn ? '#991b1b' : '#1d4ed8' }}>
                    確認後系統將自動：
                    <ul style={{ margin: '4px 0 0 16px', padding: 0, lineHeight: 1.6 }}>
                      <li>建立退款收入交易 NT$ {rec.totalAmount.toLocaleString()}</li>
                      <li>更新帳戶餘額</li>
                      <li>回沖損益表（DepartmentExpense）及月度彙總</li>
                      {isFullReturn && rec.paymentOrderNo && <li style={{ fontWeight: 600 }}>原付款單 {rec.paymentOrderNo} 標記「已退貨」</li>}
                      {isFullReturn && rec.invoiceNo && <li style={{ fontWeight: 600 }}>原發票 {rec.invoiceNo} 標記「已退貨」</li>}
                      {isFullReturn && <li style={{ fontWeight: 600 }}>原進貨單標記「已退貨」</li>}
                      {isFullReturn && <li style={{ fontWeight: 600 }}>沖銷原出納付款交易</li>}
                    </ul>
                  </div>

                  <div style={{ marginBottom: 12 }}>
                    <label style={{ fontSize: '0.875rem', color: '#374151', display: 'block', marginBottom: 4, fontWeight: 600 }}>退款入帳帳戶 *</label>
                    <select value={confirmAccountId} onChange={e => setConfirmAccountId(e.target.value)} style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: '1rem' }}>
                      <option value="">選擇帳戶</option>
                      {bankAccounts.map(a => <option key={a.id} value={a.id}>{a.name} ({a.type})</option>)}
                    </select>
                  </div>
                  <div style={{ marginBottom: 16 }}>
                    <label style={{ fontSize: '0.875rem', color: '#374151', display: 'block', marginBottom: 4, fontWeight: 600 }}>退款日期</label>
                    <input type="date" value={confirmDate} onChange={e => setConfirmDate(e.target.value)} style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: '1rem', boxSizing: 'border-box' }} />
                  </div>
                </>
              );
            })()}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button onClick={() => { setConfirmingId(null); setConfirmAccountId(''); }} disabled={confirmSaving} style={{ padding: '8px 20px', background: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: 6, cursor: confirmSaving ? 'not-allowed' : 'pointer', fontSize: '1rem' }}>取消</button>
              <button onClick={handleConfirm} disabled={confirmSaving} style={{ padding: '8px 20px', background: '#059669', color: '#fff', border: 'none', borderRadius: 6, cursor: confirmSaving ? 'not-allowed' : 'pointer', fontSize: '1rem', fontWeight: 600, opacity: confirmSaving ? 0.7 : 1 }}>{confirmSaving ? '處理中...' : '確認退款入帳'}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
