'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
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
  const [loading, setLoading] = useState(true);

  // Invoice search
  const [invoiceSearch, setInvoiceSearch] = useState('');
  const [invoiceResults, setInvoiceResults] = useState([]);
  const [searchingInvoice, setSearchingInvoice] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState(null);

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

  // Confirm modal
  const [confirmingId, setConfirmingId] = useState(null);
  const [confirmAccountId, setConfirmAccountId] = useState('');
  const [confirmDate, setConfirmDate] = useState(new Date().toISOString().split('T')[0]);

  // Filter state
  const [filterKeyword, setFilterKeyword] = useState('');

  useEffect(() => { fetchAll(); }, []);

  async function fetchAll() {
    setLoading(true);
    const [aRes, accRes, whRes] = await Promise.all([
      fetch('/api/purchase-allowances').then(r => r.json()).catch(() => []),
      fetch('/api/cashflow/accounts').then(r => r.json()).catch(() => []),
      fetch('/api/warehouse-departments').then(r => r.json()).catch(() => []),
    ]);
    setRecords(Array.isArray(aRes) ? aRes : []);
    setAccounts(Array.isArray(accRes) ? accRes : []);
    setWarehouses(Array.isArray(whRes) ? whRes.filter(w => w.type === 'warehouse') : []);
    setLoading(false);
  }

  // Debounced invoice search
  const searchInvoices = useCallback(async (keyword) => {
    if (!keyword || keyword.length < 1) {
      setInvoiceResults([]);
      return;
    }
    setSearchingInvoice(true);
    try {
      const res = await fetch(`/api/purchase-allowances/search-invoices?keyword=${encodeURIComponent(keyword)}`);
      const data = await res.json();
      setInvoiceResults(Array.isArray(data) ? data : []);
    } catch {
      setInvoiceResults([]);
    }
    setSearchingInvoice(false);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (invoiceSearch.length >= 1) searchInvoices(invoiceSearch);
      else setInvoiceResults([]);
    }, 400);
    return () => clearTimeout(timer);
  }, [invoiceSearch, searchInvoices]);

  // Select invoice and auto-populate form
  function selectInvoice(inv) {
    setSelectedInvoice(inv);
    setInvoiceResults([]);
    setInvoiceSearch('');
    setForm(f => ({
      ...f,
      allowanceType: formMode,
      invoiceNo: inv.invoiceNo || '',
      invoiceId: inv.invoiceId,
      paymentOrderNo: inv.paymentOrderNo || '',
      paymentOrderId: inv.paymentOrderId,
      supplierName: inv.supplierName || '',
      supplierId: inv.supplierId,
      warehouse: inv.warehouse || '',
      purchaseNo: inv.details?.[0]?.purchaseNo || '',
      purchaseId: inv.details?.[0]?.purchaseId || null,
      amount: String(inv.amount || inv.totalAmount || ''),
      tax: String(inv.tax || 0),
      totalAmount: String(inv.totalAmount || ''),
      details: inv.details?.length > 0 ? inv.details.map(d => ({
        productName: d.productName || '',
        quantity: String(d.quantity || ''),
        unitPrice: String(d.unitPrice || ''),
        subtotal: String(d.subtotal || ''),
        reason: formMode === '全額退貨' ? '全額退貨' : '',
      })) : f.details,
    }));
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
      amount: '', tax: '0', totalAmount: '', reason: formMode === '全額退貨' ? '全額退貨' : '', note: '',
      details: [],
    });
    setEditingId(null);
    setSelectedInvoice(null);
    setInvoiceSearch('');
    setInvoiceResults([]);
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
    setSelectedInvoice(null);
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
    if (!form.allowanceDate) return showToast('請選擇折讓日期', 'error');
    if (!form.totalAmount || parseFloat(form.totalAmount) <= 0) return showToast('折讓金額必須大於 0', 'error');

    const payload = { ...form, createdBy: session?.user?.email || '' };

    try {
      const url = editingId ? `/api/purchase-allowances/${editingId}` : '/api/purchase-allowances';
      const method = editingId ? 'PUT' : 'POST';
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (res.ok) {
        showToast(editingId ? '折讓單已更新' : '折讓單已建立', 'success');
        setShowForm(false);
        resetForm();
        fetchAll();
      } else {
        const err = await res.json();
        showToast(err.error?.message || '儲存失敗', 'error');
      }
    } catch { showToast('儲存失敗', 'error'); }
  }

  async function handleDelete(rec) {
    if (!confirm(`確定刪除折讓單「${rec.allowanceNo}」？`)) return;
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

    if (!confirm(`確認折讓單「${rec.allowanceNo}」，退款 NT$ ${Number(rec.totalAmount).toLocaleString()} 至帳戶？`)) return;

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
        showToast(result.error?.message || result.message || '確認失敗', 'error');
      }
    } catch (err) { showToast('確認失敗: ' + err.message, 'error'); }
  }

  const thStyle = { padding: '10px 14px', textAlign: 'left', borderBottom: '2px solid #e5e7eb', fontSize: 15, fontWeight: 600, color: '#374151', whiteSpace: 'nowrap' };
  const tdStyle = { padding: '10px 14px', borderBottom: '1px solid #f3f4f6', fontSize: 15 };
  const inputStyle = { width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14, boxSizing: 'border-box' };
  const labelStyle = { fontSize: 13, color: '#6b7280', display: 'block', marginBottom: 4 };

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
          <h2 style={{ fontSize: 22, fontWeight: 700 }}>進貨折讓管理</h2>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => { setFormMode('折讓'); resetForm(); setShowForm(v => formMode !== '折讓' ? true : !v); }}
              style={{ padding: '8px 16px', background: '#ea580c', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 14 }}>
              + 新增折讓單
            </button>
            <button onClick={() => { setFormMode('全額退貨'); resetForm(); setShowForm(v => formMode !== '全額退貨' ? true : !v); }}
              style={{ padding: '8px 16px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 14 }}>
              + 全額退貨退款
            </button>
          </div>
        </div>

        {/* KPI Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 24 }}>
          <div style={{ background: '#fff7ed', borderRadius: 8, padding: 16 }}>
            <div style={{ fontSize: 13, color: '#9a3412' }}>草稿件數</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: '#9a3412' }}>{draftRecords.length}</div>
          </div>
          <div style={{ background: '#fef3c7', borderRadius: 8, padding: 16 }}>
            <div style={{ fontSize: 13, color: '#92400e' }}>草稿金額</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: '#92400e' }}>NT$ {draftRecords.reduce((s, r) => s + r.totalAmount, 0).toLocaleString()}</div>
          </div>
          <div style={{ background: '#d1fae5', borderRadius: 8, padding: 16 }}>
            <div style={{ fontSize: 13, color: '#065f46' }}>已退款金額</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: '#065f46' }}>NT$ {confirmedRecords.reduce((s, r) => s + r.totalAmount, 0).toLocaleString()}</div>
          </div>
        </div>

        {/* Add/Edit form */}
        {showForm && (
          <div style={{ background: formMode === '全額退貨' ? '#fef2f2' : '#fffbeb', border: `1px solid ${formMode === '全額退貨' ? '#fca5a5' : '#fbbf24'}`, borderRadius: 8, padding: 20, marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>
                {editingId ? '編輯' : '新增'}{formMode === '全額退貨' ? '全額退貨退款單' : '折讓單'}
              </h3>
              <span style={{
                padding: '2px 10px', borderRadius: 10, fontSize: 13, fontWeight: 600,
                background: formMode === '全額退貨' ? '#fee2e2' : '#fef3c7',
                color: formMode === '全額退貨' ? '#dc2626' : '#92400e',
              }}>
                {formMode === '全額退貨' ? '全額退貨 — 將作廢原發票/付款單/進貨單' : '部分折讓'}
              </span>
            </div>

            {/* Invoice Search Section */}
            {!editingId && (
              <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 16, marginBottom: 16 }}>
                <label style={{ fontSize: 14, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 8 }}>
                  Step 1: 搜尋已付款的發票（輸入廠商名稱、發票號碼、付款單號）
                  {formMode === '全額退貨' && <span style={{ color: '#dc2626', marginLeft: 8 }}>— 確認後將全額退款並作廢原單據</span>}
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    value={invoiceSearch}
                    onChange={e => setInvoiceSearch(e.target.value)}
                    placeholder="輸入關鍵字搜尋已付款發票..."
                    style={{ ...inputStyle, fontSize: 15, padding: '10px 14px', border: '2px solid #f59e0b' }}
                  />
                  {searchingInvoice && <div style={{ position: 'absolute', right: 12, top: 12, fontSize: 13, color: '#9ca3af' }}>搜尋中...</div>}

                  {/* Search Results Dropdown */}
                  {invoiceResults.length > 0 && (
                    <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100, background: '#fff', border: '1px solid #d1d5db', borderRadius: '0 0 8px 8px', maxHeight: 320, overflowY: 'auto', boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}>
                      {invoiceResults.map((inv, idx) => (
                        <div key={idx} onClick={() => selectInvoice(inv)} style={{ padding: '12px 16px', borderBottom: '1px solid #f3f4f6', cursor: 'pointer', fontSize: 14 }}
                          onMouseEnter={e => e.currentTarget.style.background = '#fef3c7'}
                          onMouseLeave={e => e.currentTarget.style.background = '#fff'}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                              <span style={{ fontWeight: 700, color: '#ea580c' }}>{inv.supplierName}</span>
                              {inv.invoiceNo && <span style={{ marginLeft: 12, color: '#6b7280' }}>發票: {inv.invoiceNo}</span>}
                            </div>
                            <span style={{ fontWeight: 700, color: '#059669' }}>NT$ {inv.totalAmount?.toLocaleString()}</span>
                          </div>
                          <div style={{ fontSize: 13, color: '#9ca3af', marginTop: 4 }}>
                            付款單: {inv.paymentOrderNo || '-'} | 館別: {inv.warehouse || '-'} | 付款日: {inv.paidDate || '-'}
                            {inv.details?.length > 0 && ` | 品項: ${inv.details.map(d => d.productName).filter(Boolean).join(', ').substring(0, 40)}`}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Selected invoice info */}
                {selectedInvoice && (
                  <div style={{ marginTop: 12, background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8, padding: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ fontSize: 14 }}>
                        <span style={{ fontWeight: 700 }}>已選擇：</span>
                        <span style={{ color: '#ea580c', fontWeight: 600 }}>{selectedInvoice.supplierName}</span>
                        {selectedInvoice.invoiceNo && <span style={{ marginLeft: 8 }}>發票 {selectedInvoice.invoiceNo}</span>}
                        <span style={{ marginLeft: 8, fontWeight: 700, color: '#059669' }}>原金額 NT$ {selectedInvoice.totalAmount?.toLocaleString()}</span>
                      </div>
                      <button onClick={() => { setSelectedInvoice(null); resetForm(); setShowForm(true); }}
                        style={{ padding: '2px 10px', fontSize: 13, background: 'none', border: '1px solid #dc2626', color: '#dc2626', borderRadius: 4, cursor: 'pointer' }}>
                        清除
                      </button>
                    </div>
                  </div>
                )}

                {!selectedInvoice && !invoiceSearch && (
                  <div style={{ marginTop: 8, fontSize: 13, color: '#9ca3af' }}>
                    也可以跳過搜尋，直接手動填寫折讓資料
                  </div>
                )}
              </div>
            )}

            <form onSubmit={handleSave}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 12 }}>
                <div>
                  <label style={labelStyle}>折讓日期 *</label>
                  <input type="date" value={form.allowanceDate} onChange={e => setForm(f => ({ ...f, allowanceDate: e.target.value }))} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>供應商名稱</label>
                  <input value={form.supplierName} onChange={e => setForm(f => ({ ...f, supplierName: e.target.value }))} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>館別</label>
                  <select value={form.warehouse} onChange={e => setForm(f => ({ ...f, warehouse: e.target.value }))} style={inputStyle}>
                    <option value="">選擇館別</option>
                    {warehouses.map(w => <option key={w.id} value={w.name}>{w.name}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>原進貨單號</label>
                  <input value={form.purchaseNo} onChange={e => setForm(f => ({ ...f, purchaseNo: e.target.value }))} placeholder="選填" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>原發票號碼</label>
                  <input value={form.invoiceNo} onChange={e => setForm(f => ({ ...f, invoiceNo: e.target.value }))} placeholder="選填" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>原付款單號</label>
                  <input value={form.paymentOrderNo} onChange={e => setForm(f => ({ ...f, paymentOrderNo: e.target.value }))} placeholder="選填" style={inputStyle} />
                </div>
              </div>

              {/* Detail lines */}
              <div style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <label style={{ fontSize: 14, fontWeight: 600 }}>折讓明細</label>
                  <button type="button" onClick={addDetailLine} style={{ padding: '4px 12px', background: '#f59e0b', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 13 }}>+ 新增項目</button>
                </div>
                {form.details.length > 0 && (
                  <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 8 }}>
                    <thead>
                      <tr style={{ background: '#fef9c3' }}>
                        <th style={{ padding: '6px 8px', fontSize: 13, textAlign: 'left' }}>品名</th>
                        <th style={{ padding: '6px 8px', fontSize: 13, textAlign: 'right', width: 80 }}>數量</th>
                        <th style={{ padding: '6px 8px', fontSize: 13, textAlign: 'right', width: 100 }}>單價</th>
                        <th style={{ padding: '6px 8px', fontSize: 13, textAlign: 'right', width: 100 }}>小計</th>
                        <th style={{ padding: '6px 8px', fontSize: 13, textAlign: 'left' }}>原因</th>
                        <th style={{ width: 40 }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {form.details.map((d, idx) => (
                        <tr key={idx}>
                          <td style={{ padding: '4px 6px' }}>
                            <input value={d.productName} onChange={e => updateDetail(idx, 'productName', e.target.value)} style={{ width: '100%', padding: '4px 6px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 13 }} />
                          </td>
                          <td style={{ padding: '4px 6px' }}>
                            <input type="number" value={d.quantity} onChange={e => updateDetail(idx, 'quantity', e.target.value)} style={{ width: '100%', padding: '4px 6px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 13, textAlign: 'right' }} />
                          </td>
                          <td style={{ padding: '4px 6px' }}>
                            <input type="number" value={d.unitPrice} onChange={e => updateDetail(idx, 'unitPrice', e.target.value)} style={{ width: '100%', padding: '4px 6px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 13, textAlign: 'right' }} />
                          </td>
                          <td style={{ padding: '4px 6px' }}>
                            <input type="number" value={d.subtotal} onChange={e => updateDetail(idx, 'subtotal', e.target.value)} style={{ width: '100%', padding: '4px 6px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 13, textAlign: 'right', background: '#f9fafb' }} />
                          </td>
                          <td style={{ padding: '4px 6px' }}>
                            <input value={d.reason} onChange={e => updateDetail(idx, 'reason', e.target.value)} placeholder="產品瑕疵/數量不符" style={{ width: '100%', padding: '4px 6px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 13 }} />
                          </td>
                          <td style={{ padding: '4px 6px', textAlign: 'center' }}>
                            <button type="button" onClick={() => removeDetail(idx)} style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: 16 }}>✕</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 12 }}>
                <div>
                  <label style={labelStyle}>折讓金額（未稅）*</label>
                  <input type="number" value={form.amount} onChange={e => updateAmountField('amount', e.target.value)} style={{ ...inputStyle, textAlign: 'right' }} />
                </div>
                <div>
                  <label style={labelStyle}>稅額</label>
                  <input type="number" value={form.tax} onChange={e => updateAmountField('tax', e.target.value)} style={{ ...inputStyle, textAlign: 'right' }} />
                </div>
                <div>
                  <label style={labelStyle}>折讓總額（含稅）*</label>
                  <input type="number" value={form.totalAmount} onChange={e => setForm(f => ({ ...f, totalAmount: e.target.value }))} style={{ ...inputStyle, border: '2px solid #f59e0b', fontSize: 15, fontWeight: 700, textAlign: 'right', background: '#fffbeb' }} />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                <div>
                  <label style={labelStyle}>折讓原因 *</label>
                  <textarea value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} rows={2} placeholder="產品瑕疵 / 數量不符 / 價格錯誤..." style={{ ...inputStyle, resize: 'vertical' }} />
                </div>
                <div>
                  <label style={labelStyle}>備註</label>
                  <textarea value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} rows={2} placeholder="選填" style={{ ...inputStyle, resize: 'vertical' }} />
                </div>
              </div>

              {formMode === '全額退貨' && selectedInvoice && (
                <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 8, padding: 12, marginBottom: 12, fontSize: 14, color: '#991b1b' }}>
                  <strong>全額退貨確認後將執行：</strong>
                  <ul style={{ margin: '4px 0 0 16px', padding: 0, lineHeight: 1.8 }}>
                    <li>建立退款收入交易 NT$ {form.totalAmount ? Number(form.totalAmount).toLocaleString() : '0'}</li>
                    {form.paymentOrderNo && <li>原付款單 {form.paymentOrderNo} 標記為「已退貨」</li>}
                    {form.invoiceNo && <li>原發票 {form.invoiceNo} 標記為「已退貨」</li>}
                    {form.purchaseNo && <li>原進貨單 {form.purchaseNo} 標記為「已退貨」</li>}
                    <li>沖銷原出納付款交易</li>
                    <li>回沖損益表及月度彙總</li>
                  </ul>
                </div>
              )}

              <div style={{ display: 'flex', gap: 8 }}>
                <button type="submit" style={{
                  padding: '8px 24px', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 14, fontWeight: 600,
                  background: formMode === '全額退貨' ? '#dc2626' : '#ea580c',
                }}>
                  {editingId ? '更新' : '建立'}{formMode === '全額退貨' ? '退貨單（草稿）' : '折讓單（草稿）'}
                </button>
                <button type="button" onClick={() => { setShowForm(false); resetForm(); }} style={{ padding: '8px 20px', background: '#e5e7eb', color: '#374151', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 14 }}>取消</button>
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
                background: 'none', fontSize: 15, fontWeight: activeTab === tab.key ? 600 : 400,
                color: activeTab === tab.key ? '#ea580c' : '#6b7280', cursor: 'pointer',
              }}>
                {tab.label}
              </button>
            ))}
          </div>
          <input
            value={filterKeyword}
            onChange={e => setFilterKeyword(e.target.value)}
            placeholder="篩選折讓單..."
            style={{ padding: '6px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14, width: 200 }}
          />
        </div>

        {/* Draft Tab */}
        {activeTab === 'draft' && (
          filteredDraft.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: '#9ca3af' }}>目前沒有草稿折讓單</div>
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
                    <td style={tdStyle}><span style={{ fontFamily: 'monospace', fontSize: 14 }}>{r.allowanceNo}</span></td>
                    <td style={tdStyle}>
                      <span style={{
                        padding: '2px 8px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                        background: r.allowanceType === '全額退貨' ? '#fee2e2' : '#fef3c7',
                        color: r.allowanceType === '全額退貨' ? '#dc2626' : '#92400e',
                      }}>
                        {r.allowanceType || '折讓'}
                      </span>
                    </td>
                    <td style={tdStyle}>{r.allowanceDate}</td>
                    <td style={{ ...tdStyle, fontWeight: 600 }}>{r.supplierName || '-'}</td>
                    <td style={tdStyle}>{r.warehouse || '-'}</td>
                    <td style={tdStyle}>
                      <div style={{ fontSize: 13 }}>
                        {r.invoiceNo && <div>發票: {r.invoiceNo}</div>}
                        {r.paymentOrderNo && <div style={{ color: '#6b7280' }}>付款: {r.paymentOrderNo}</div>}
                        {!r.invoiceNo && !r.paymentOrderNo && '-'}
                      </div>
                    </td>
                    <td style={tdStyle}><span style={{ fontSize: 13, color: '#6b7280' }}>{r.reason?.substring(0, 20) || '-'}{r.reason?.length > 20 ? '...' : ''}</span></td>
                    <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700, color: '#059669' }}>NT$ {r.totalAmount.toLocaleString()}</td>
                    <td style={tdStyle}>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button onClick={() => { setConfirmingId(r.id); setConfirmDate(r.allowanceDate); }} style={{ padding: '4px 10px', fontSize: 13, color: '#fff', background: '#059669', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 600 }}>確認退款</button>
                        <button onClick={() => openEdit(r)} style={{ padding: '4px 10px', fontSize: 13, color: '#2563eb', background: 'none', border: '1px solid #2563eb', borderRadius: 4, cursor: 'pointer' }}>編輯</button>
                        <button onClick={() => handleDelete(r)} style={{ padding: '4px 10px', fontSize: 13, color: '#dc2626', background: 'none', border: '1px solid #dc2626', borderRadius: 4, cursor: 'pointer' }}>刪除</button>
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
            <div style={{ textAlign: 'center', padding: 40, color: '#9ca3af' }}>尚無已確認折讓紀錄</div>
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
                    <td style={tdStyle}><span style={{ fontFamily: 'monospace', fontSize: 14 }}>{r.allowanceNo}</span></td>
                    <td style={tdStyle}>
                      <span style={{
                        padding: '2px 8px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                        background: r.allowanceType === '全額退貨' ? '#fee2e2' : '#d1fae5',
                        color: r.allowanceType === '全額退貨' ? '#dc2626' : '#065f46',
                      }}>
                        {r.allowanceType || '折讓'}
                      </span>
                    </td>
                    <td style={tdStyle}>{r.allowanceDate}</td>
                    <td style={{ ...tdStyle, fontWeight: 600 }}>{r.supplierName || '-'}</td>
                    <td style={tdStyle}>{r.warehouse || '-'}</td>
                    <td style={tdStyle}>
                      <div style={{ fontSize: 13 }}>
                        {r.invoiceNo && <div>發票: {r.invoiceNo}</div>}
                        {r.paymentOrderNo && <div style={{ color: '#6b7280' }}>付款: {r.paymentOrderNo}</div>}
                        {!r.invoiceNo && !r.paymentOrderNo && '-'}
                      </div>
                    </td>
                    <td style={tdStyle}><span style={{ fontSize: 13, color: '#6b7280' }}>{r.reason?.substring(0, 30) || '-'}</span></td>
                    <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700, color: '#059669' }}>NT$ {r.totalAmount.toLocaleString()}</td>
                    <td style={tdStyle}><span style={{ fontFamily: 'monospace', fontSize: 13, color: '#059669' }}>{r.cashTransactionNo || '-'}</span></td>
                    <td style={tdStyle}><span style={{ fontSize: 13 }}>{r.confirmedBy || '-'}</span></td>
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
                  <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, color: isFullReturn ? '#dc2626' : '#374151' }}>
                    {isFullReturn ? '確認全額退貨退款' : '確認折讓退款'}
                  </h3>

                  <div style={{ background: isFullReturn ? '#fef2f2' : '#f0fdf4', padding: 12, borderRadius: 8, marginBottom: 16, fontSize: 14 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div><strong>{isFullReturn ? '退貨單' : '折讓單'}：</strong>{rec.allowanceNo}</div>
                      <span style={{
                        padding: '2px 10px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                        background: isFullReturn ? '#fee2e2' : '#fef3c7',
                        color: isFullReturn ? '#dc2626' : '#92400e',
                      }}>{rec.allowanceType || '折讓'}</span>
                    </div>
                    <div><strong>供應商：</strong>{rec.supplierName || '-'}</div>
                    {rec.invoiceNo && <div><strong>原發票：</strong>{rec.invoiceNo}</div>}
                    {rec.paymentOrderNo && <div><strong>原付款單：</strong>{rec.paymentOrderNo}</div>}
                    <div style={{ marginTop: 8 }}>
                      <strong>退款金額：</strong>
                      <span style={{ color: isFullReturn ? '#dc2626' : '#059669', fontWeight: 700, fontSize: 20 }}>NT$ {rec.totalAmount.toLocaleString()}</span>
                    </div>
                    {rec.reason && <div style={{ marginTop: 4 }}><strong>原因：</strong>{rec.reason}</div>}
                  </div>

                  <div style={{ background: isFullReturn ? '#fef2f2' : '#eff6ff', padding: 10, borderRadius: 6, marginBottom: 16, fontSize: 13, color: isFullReturn ? '#991b1b' : '#1d4ed8' }}>
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
                    <label style={{ fontSize: 13, color: '#374151', display: 'block', marginBottom: 4, fontWeight: 600 }}>退款入帳帳戶 *</label>
                    <select value={confirmAccountId} onChange={e => setConfirmAccountId(e.target.value)} style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14 }}>
                      <option value="">選擇帳戶</option>
                      {bankAccounts.map(a => <option key={a.id} value={a.id}>{a.name} ({a.type})</option>)}
                    </select>
                  </div>
                  <div style={{ marginBottom: 16 }}>
                    <label style={{ fontSize: 13, color: '#374151', display: 'block', marginBottom: 4, fontWeight: 600 }}>退款日期</label>
                    <input type="date" value={confirmDate} onChange={e => setConfirmDate(e.target.value)} style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14, boxSizing: 'border-box' }} />
                  </div>
                </>
              );
            })()}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button onClick={() => { setConfirmingId(null); setConfirmAccountId(''); }} style={{ padding: '8px 20px', background: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: 6, cursor: 'pointer', fontSize: 14 }}>取消</button>
              <button onClick={handleConfirm} style={{ padding: '8px 20px', background: '#059669', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>確認退款入帳</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
