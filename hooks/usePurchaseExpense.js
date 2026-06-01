'use client';
import { useState, useEffect } from 'react';
import { todayStr } from '@/lib/localDate';

const emptyExecForm = () => ({
  warehouse: '', expenseMonth: todayStr().slice(0, 7),
  supplierId: '', supplierName: '', paymentTerms: '月結', taxType: '', department: '',
  items: [{ productId: '', quantity: 1, unitPrice: '', note: '', putInInventory: true, inventoryWarehouse: '' }],
  invoiceNo: '', invoiceDate: '', invoiceTitle: '', invoiceAmount: '', taxAmount: '', supplierDiscount: '', note: '',
});

const emptyTemplateForm = () => ({
  name: '', description: '', warehouse: '',
  defaultSupplierId: '', paymentMethod: '', defaultTaxType: '',
  purchaseItems: [{ productId: '', quantity: 1, unitPrice: '', note: '', inventoryWarehouse: '' }],
});

export function usePurchaseExpense({ showToast, confirm, session, products, suppliers }) {
  const [purchasePageTab, setPurchasePageTab] = useState('orders');
  const [monthlyExpenseSubTab, setMonthlyExpenseSubTab] = useState('execute');
  const [expenseTemplates, setExpenseTemplates] = useState([]);
  const [expenseRecords, setExpenseRecords] = useState([]);
  const [expenseRecordsTotal, setExpenseRecordsTotal] = useState(0);
  const [expenseRecordsLoading, setExpenseRecordsLoading] = useState(false);
  const [expenseRecordFilter, setExpenseRecordFilter] = useState({
    month: todayStr().slice(0, 7), warehouse: '', status: '',
  });
  const [selectedExpenseTemplateId, setSelectedExpenseTemplateId] = useState('');
  const [executeExpenseForm, setExecuteExpenseForm] = useState(emptyExecForm());
  const [submittingExpense, setSubmittingExpense] = useState(false);
  const [templateSaving, setTemplateSaving] = useState(false);
  const [showExpTemplateForm, setShowExpTemplateForm] = useState(false);
  const [editingExpTemplate, setEditingExpTemplate] = useState(null);
  const [expTemplateForm, setExpTemplateForm] = useState(emptyTemplateForm());

  useEffect(() => {
    if (purchasePageTab === 'monthlyExpense') fetchExpenseTemplates();
  }, [purchasePageTab]);

  useEffect(() => {
    if (purchasePageTab === 'monthlyExpense' && monthlyExpenseSubTab === 'records') fetchExpenseRecords();
  }, [purchasePageTab, monthlyExpenseSubTab, expenseRecordFilter]);

  async function fetchExpenseTemplates() {
    try {
      const res = await fetch('/api/expense-templates?activeOnly=false');
      if (!res.ok) { showToast('載入費用範本失敗', 'error'); return; }
      const data = await res.json();
      const list = Array.isArray(data) ? data : [];
      setExpenseTemplates(list.filter(t => (t.templateType || 'fixed') === 'purchase'));
    } catch (err) {
      console.error('載入費用範本失敗:', err);
      showToast('載入費用範本失敗', 'error');
    }
  }

  async function fetchExpenseRecords() {
    setExpenseRecordsLoading(true);
    try {
      const params = new URLSearchParams();
      if (expenseRecordFilter.month) params.set('month', expenseRecordFilter.month);
      if (expenseRecordFilter.warehouse) params.set('warehouse', expenseRecordFilter.warehouse);
      if (expenseRecordFilter.status) params.set('status', expenseRecordFilter.status);
      params.set('type', 'purchase');
      const res = await fetch(`/api/expense-records?${params.toString()}`);
      if (!res.ok) {
        showToast('載入執行記錄失敗', 'error');
        setExpenseRecords([]); setExpenseRecordsTotal(0);
        return;
      }
      const data = await res.json();
      setExpenseRecords(data.records || []);
      setExpenseRecordsTotal(data.total || 0);
    } catch (err) {
      console.error('載入執行記錄失敗:', err);
      showToast('載入執行記錄失敗', 'error');
      setExpenseRecords([]); setExpenseRecordsTotal(0);
    } finally {
      setExpenseRecordsLoading(false);
    }
  }

  function handleSelectExpenseTemplate(tmplId) {
    setSelectedExpenseTemplateId(tmplId);
    if (!tmplId) {
      setExecuteExpenseForm(prev => ({
        ...prev,
        items: [{ productId: '', quantity: 1, unitPrice: '', note: '', putInInventory: true, inventoryWarehouse: '' }],
        supplierId: '', supplierName: '', invoiceNo: '', invoiceDate: '', invoiceTitle: '', invoiceAmount: '', taxAmount: '', supplierDiscount: '',
      }));
      return;
    }
    const tmpl = expenseTemplates.find(t => t.id === parseInt(tmplId));
    if (!tmpl) return;
    const items = Array.isArray(tmpl.purchaseItems) && tmpl.purchaseItems.length > 0
      ? tmpl.purchaseItems.map(item => {
          const product = products.find(p => p.id === parseInt(item.productId));
          const isInStock = !!product?.isInStock;
          return {
            productId: String(item.productId || ''),
            quantity: item.quantity || 1,
            unitPrice: item.unitPrice != null ? String(item.unitPrice) : '',
            note: item.note || '',
            putInInventory: isInStock,
            inventoryWarehouse: (item.inventoryWarehouse != null && item.inventoryWarehouse !== '') ? String(item.inventoryWarehouse) : '',
          };
        })
      : [{ productId: '', quantity: 1, unitPrice: '', note: '', putInInventory: true, inventoryWarehouse: '' }];
    const supplier = suppliers.find(s => s.id === tmpl.defaultSupplierId);
    setExecuteExpenseForm(prev => ({
      ...prev,
      warehouse: tmpl.warehouse || prev.warehouse,
      supplierId: tmpl.defaultSupplierId ? String(tmpl.defaultSupplierId) : '',
      supplierName: supplier ? supplier.name : '',
      paymentTerms: tmpl.paymentMethod || supplier?.paymentTerms || '月結',
      taxType: tmpl.defaultTaxType || '',
      items,
      invoiceNo: '', invoiceDate: '', invoiceTitle: '', invoiceAmount: '', taxAmount: '', supplierDiscount: '',
    }));
  }

  function resetExpTemplateForm() {
    setExpTemplateForm(emptyTemplateForm());
    setEditingExpTemplate(null);
    setShowExpTemplateForm(false);
  }

  function handleEditExpTemplate(tmpl) {
    setEditingExpTemplate(tmpl);
    const supplier = suppliers.find(s => s.id === tmpl.defaultSupplierId);
    setExpTemplateForm({
      name: tmpl.name || '',
      description: tmpl.description || '',
      warehouse: tmpl.warehouse || '',
      defaultSupplierId: tmpl.defaultSupplierId ? String(tmpl.defaultSupplierId) : '',
      paymentMethod: tmpl.paymentMethod || supplier?.paymentTerms || '',
      defaultTaxType: tmpl.defaultTaxType || '',
      purchaseItems: Array.isArray(tmpl.purchaseItems) && tmpl.purchaseItems.length > 0
        ? tmpl.purchaseItems.map(item => ({
            productId: String(item.productId || ''),
            quantity: item.quantity || 1,
            unitPrice: item.unitPrice != null ? String(item.unitPrice) : '',
            note: item.note || '',
            inventoryWarehouse: item.inventoryWarehouse != null ? String(item.inventoryWarehouse) : '',
          }))
        : [{ productId: '', quantity: 1, unitPrice: '', note: '', inventoryWarehouse: '' }],
    });
    setShowExpTemplateForm(true);
  }

  async function handleSaveExpTemplate() {
    setTemplateSaving(true);
    if (!expTemplateForm.name.trim()) { showToast('請輸入範本名稱', 'error'); setTemplateSaving(false); return; }
    if (!expTemplateForm.defaultSupplierId) { showToast('請選擇廠商', 'error'); setTemplateSaving(false); return; }
    const validItems = expTemplateForm.purchaseItems.filter(item => item.productId);
    if (validItems.length === 0) { showToast('請至少新增一筆進貨品項', 'error'); setTemplateSaving(false); return; }
    const body = {
      name: expTemplateForm.name.trim(),
      description: expTemplateForm.description?.trim() || null,
      templateType: 'purchase',
      warehouse: expTemplateForm.warehouse || null,
      defaultSupplierId: parseInt(expTemplateForm.defaultSupplierId),
      paymentMethod: expTemplateForm.paymentMethod || '月結',
      defaultTaxType: expTemplateForm.defaultTaxType || null,
      purchaseItems: validItems.map(item => ({
        productId: parseInt(item.productId),
        quantity: parseInt(item.quantity) || 1,
        unitPrice: parseFloat(item.unitPrice) || 0,
        note: item.note || '',
        inventoryWarehouse: item.inventoryWarehouse?.trim() || null,
      })),
      isActive: true,
    };
    try {
      const url = editingExpTemplate ? `/api/expense-templates/${editingExpTemplate.id}` : '/api/expense-templates';
      const method = editingExpTemplate ? 'PUT' : 'POST';
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (res.ok) {
        showToast(editingExpTemplate ? '範本更新成功' : '範本新增成功', 'success');
        resetExpTemplateForm();
        fetchExpenseTemplates();
      } else {
        const err = await res.json();
        showToast(err.error || '儲存失敗', 'error');
      }
    } catch (err) {
      showToast('儲存失敗: ' + err.message, 'error');
    } finally {
      setTemplateSaving(false);
    }
  }

  async function handleDeleteExpTemplate(id) {
    if (!(await confirm('確定要刪除此範本嗎？', { title: '刪除確認', danger: true }))) return;
    try {
      const res = await fetch(`/api/expense-templates/${id}`, { method: 'DELETE' });
      if (res.ok) { showToast('範本已刪除', 'success'); fetchExpenseTemplates(); }
      else { const err = await res.json(); showToast(err.error || '刪除失敗', 'error'); }
    } catch (err) { showToast('刪除失敗: ' + err.message, 'error'); }
  }

  async function handleToggleExpTemplateActive(tmpl) {
    try {
      const res = await fetch(`/api/expense-templates/${tmpl.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...tmpl, isActive: !tmpl.isActive, purchaseItems: tmpl.purchaseItems || [] }),
      });
      if (res.ok) fetchExpenseTemplates();
    } catch { showToast('更新失敗', 'error'); }
  }

  function updateExecuteExpenseItem(idx, field, value) {
    setExecuteExpenseForm(prev => ({
      ...prev,
      items: prev.items.map((item, i) => i === idx ? { ...item, [field]: value } : item),
    }));
  }

  function getExecPurchaseTotal() {
    return executeExpenseForm.items.reduce((sum, item) =>
      sum + ((parseFloat(item.quantity) || 0) * (parseFloat(item.unitPrice) || 0)), 0);
  }

  function calcTaxAmount(purchaseAmt, taxType) {
    if (taxType === '應稅') return Math.round(purchaseAmt * 0.05);
    return 0;
  }

  async function handleExecutePurchaseExpense() {
    if (!selectedExpenseTemplateId) { showToast('請選擇範本', 'error'); return; }
    if (!executeExpenseForm.warehouse) { showToast('請選擇館別', 'error'); return; }
    if (!executeExpenseForm.expenseMonth) { showToast('請選擇費用月份', 'error'); return; }
    const validItems = executeExpenseForm.items.filter(item => item.productId);
    if (validItems.length === 0) { showToast('請至少新增一筆進貨品項', 'error'); return; }
    const productById = (id) => products.find(p => p.id === parseInt(id, 10));
    for (const item of validItems) {
      if (productById(item.productId)?.isInStock && item.putInInventory && !(item.inventoryWarehouse || '').trim()) {
        showToast('勾選「入庫」的品項請選擇庫存地點', 'error'); return;
      }
    }
    if (!executeExpenseForm.supplierId) { showToast('請選擇廠商', 'error'); return; }
    const purchaseTotal = getExecPurchaseTotal();
    const hasInvoice = !!(executeExpenseForm.invoiceNo?.trim());
    if (hasInvoice) {
      const invAmt = parseFloat(executeExpenseForm.invoiceAmount) || 0;
      const taxAmt = parseFloat(executeExpenseForm.taxAmount) || 0;
      const discountAmt = parseFloat(executeExpenseForm.supplierDiscount) || 0;
      if (invAmt <= 0) { showToast('請輸入發票金額', 'error'); return; }
      const expected = purchaseTotal + taxAmt - discountAmt;
      if (Math.abs(invAmt - expected) > 0.01) {
        showToast(`發票金額不符！\n發票金額: ${invAmt.toLocaleString()}\n應為: 進貨金額 ${purchaseTotal.toLocaleString()} + 營業稅 ${taxAmt.toLocaleString()} - 廠商折讓 ${discountAmt.toLocaleString()} = ${expected.toLocaleString()}`, 'error');
        return;
      }
    }
    setSubmittingExpense(true);
    try {
      const payload = {
        templateId: parseInt(selectedExpenseTemplateId, 10),
        warehouse: executeExpenseForm.warehouse,
        expenseMonth: executeExpenseForm.expenseMonth,
        supplierId: parseInt(executeExpenseForm.supplierId, 10),
        supplierName: executeExpenseForm.supplierName,
        paymentTerms: executeExpenseForm.paymentTerms || '月結',
        taxType: executeExpenseForm.taxType || null,
        department: executeExpenseForm.department || '',
        items: validItems.map(item => {
          const product = products.find(p => p.id === parseInt(item.productId, 10));
          const isInStock = !!product?.isInStock;
          const putInInventory = isInStock && !!item.putInInventory;
          return {
            productId: parseInt(item.productId, 10),
            quantity: parseInt(item.quantity, 10) || 1,
            unitPrice: parseFloat(item.unitPrice) || 0,
            note: item.note || '',
            putInInventory,
            inventoryWarehouse: putInInventory ? (item.inventoryWarehouse?.trim() || null) : null,
          };
        }),
        invoiceNo: executeExpenseForm.invoiceNo || null,
        invoiceDate: executeExpenseForm.invoiceDate || null,
        invoiceTitle: executeExpenseForm.invoiceTitle || null,
        invoiceAmount: hasInvoice ? parseFloat(executeExpenseForm.invoiceAmount) : null,
        taxAmount: hasInvoice ? (parseFloat(executeExpenseForm.taxAmount) || 0) : null,
        supplierDiscount: hasInvoice ? (parseFloat(executeExpenseForm.supplierDiscount) || 0) : null,
        createdBy: session?.user?.name || session?.user?.email || '系統',
        note: executeExpenseForm.note || null,
        allowDuplicate: false,
      };
      const res = await fetch('/api/expense-records/execute-purchase', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify(payload),
      });
      let data;
      try { data = await res.json(); } catch {
        setSubmittingExpense(false);
        showToast(`執行失敗 (${res.status})：回應無法解析。請確認已登入並重試。`, 'error'); return;
      }
      const resetForm = () => {
        setSelectedExpenseTemplateId('');
        setExecuteExpenseForm(emptyExecForm());
        if (monthlyExpenseSubTab !== 'records') setMonthlyExpenseSubTab('records');
        fetchExpenseRecords();
      };
      if (res.ok) {
        showToast(data.message || '已建立進銷存每月費用記錄', 'success');
        resetForm();
      } else if (res.status === 409 && data?.code === 'CONFLICT_UNIQUE') {
        const rec = data.existingRecord;
        const recDetail = rec ? [
          `單號：${rec.recordNo}`,
          rec.purchaseNo ? `進貨單：${rec.purchaseNo}` : null,
          `金額：NT$ ${Number(rec.totalDebit).toLocaleString()}`,
          `建立者：${rec.createdBy}`,
          `建立時間：${new Date(rec.createdAt).toLocaleString('zh-TW')}`,
        ].filter(Boolean).join('\n') : '';
        const dupMsg = (typeof data?.error === 'string' ? data.error : '此月份已有記錄')
          + (recDetail ? `\n\n${recDetail}` : '')
          + '\n\n確定要強制再建立一筆？';
        if (await confirm(dupMsg, { title: '重複建立確認', danger: true, confirmLabel: '強制建立' })) {
          payload.allowDuplicate = true;
          const res2 = await fetch('/api/expense-records/execute-purchase', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
            body: JSON.stringify(payload),
          });
          const data2 = await res2.json().catch(() => ({}));
          if (res2.ok) { showToast(data2.message || '已建立', 'success'); resetForm(); }
          else { showToast(data2?.error?.message ?? (typeof data2?.error === 'string' ? data2.error : null) ?? '執行失敗', 'error'); }
        }
      } else {
        showToast(data?.error?.message ?? (typeof data?.error === 'string' ? data.error : null) ?? '執行失敗', 'error');
      }
    } catch (err) {
      showToast('執行失敗: ' + (err?.message || String(err)), 'error');
    }
    setSubmittingExpense(false);
  }

  return {
    purchasePageTab, setPurchasePageTab,
    monthlyExpenseSubTab, setMonthlyExpenseSubTab,
    expenseTemplates, expenseRecords, expenseRecordsTotal, expenseRecordsLoading,
    expenseRecordFilter, setExpenseRecordFilter,
    selectedExpenseTemplateId, setSelectedExpenseTemplateId,
    executeExpenseForm, setExecuteExpenseForm,
    submittingExpense, templateSaving,
    showExpTemplateForm, setShowExpTemplateForm, editingExpTemplate, expTemplateForm, setExpTemplateForm,
    fetchExpenseTemplates, fetchExpenseRecords,
    handleSelectExpenseTemplate, resetExpTemplateForm, handleEditExpTemplate,
    handleSaveExpTemplate, handleDeleteExpTemplate, handleToggleExpTemplateActive,
    updateExecuteExpenseItem, getExecPurchaseTotal, calcTaxAmount,
    handleExecutePurchaseExpense,
  };
}
