'use client';

import { useState, useMemo, useCallback } from 'react';
import { useToast } from '@/context/ToastContext';
import { useConfirm } from '@/context/ConfirmContext';

export const EMPTY_ENTRY_LINE = {
  entryType: 'debit',
  accountingCode: '',
  accountingName: '',
  summary: '',
  defaultAmount: '',
  supplierId: '',
  supplierName: '',
  warehouse: '',
  paymentMethod: '',
  accountId: '',
  advancedBy: '',
  note: ''
};

export const EMPTY_PURCHASE_ITEM = {
  productId: '',
  quantity: 1,
  unitPrice: '',
  note: ''
};

export function useExpenseTemplates({ mainTab, accountingSubjects } = {}) {
  const { showToast } = useToast();
  const confirm = useConfirm();

  // Template list
  const [templates, setTemplates] = useState([]);

  // Template form state
  const [showTemplateForm, setShowTemplateForm] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [templateForm, setTemplateForm] = useState({
    name: '', description: '', summary: '', categoryId: '', warehouse: '',
    defaultSupplierId: '', paymentMethod: '', sortOrder: 0,
    defaultTaxType: '',
    entryLines: [
      { ...EMPTY_ENTRY_LINE, entryType: 'debit' }
    ],
    purchaseItems: [{ ...EMPTY_PURCHASE_ITEM }],
    defaultDebitCode: '', defaultDebitName: '',
    defaultCreditCode: '1111', defaultCreditName: '銀行存款'
  });
  const [templateSaving, setTemplateSaving] = useState(false);

  // Accounting subject lookup maps
  const acctByCode = useMemo(
    () => new Map((accountingSubjects || []).map(s => [String(s.code).trim(), s])),
    [accountingSubjects]
  );
  const acctByName = useMemo(
    () => new Map((accountingSubjects || []).map(s => [(s.name || '').trim(), s])),
    [accountingSubjects]
  );

  async function fetchTemplates() {
    try {
      const res = await fetch('/api/expense-templates?activeOnly=false');
      if (!res.ok) return;
      const data = await res.json();
      setTemplates(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('載入範本失敗:', err);
    }
  }

  function resetTemplateForm() {
    setTemplateForm({
      name: '', description: '', summary: '', categoryId: '', warehouse: '',
      defaultSupplierId: '', paymentMethod: '', sortOrder: 0,
      defaultTaxType: '',
      entryLines: [
        { ...EMPTY_ENTRY_LINE, entryType: 'debit' }
      ],
      purchaseItems: [{ ...EMPTY_PURCHASE_ITEM }],
      defaultDebitCode: '', defaultDebitName: '',
      defaultCreditCode: '1111', defaultCreditName: '銀行存款'
    });
    setEditingTemplate(null);
    setShowTemplateForm(false);
  }

  function handleEditTemplate(tmpl) {
    setEditingTemplate(tmpl);
    const form = {
      name: tmpl.name,
      description: tmpl.description || '',
      summary: tmpl.summary || '',
      categoryId: tmpl.categoryId ? String(tmpl.categoryId) : '',
      warehouse: tmpl.warehouse || '',
      defaultSupplierId: tmpl.defaultSupplierId ? String(tmpl.defaultSupplierId) : '',
      paymentMethod: tmpl.paymentMethod || '',
      sortOrder: tmpl.sortOrder || 0,
      defaultTaxType: tmpl.defaultTaxType || '',
      entryLines: (tmpl.entryLines || [])
        .filter(l => l.entryType === 'debit')
        .map(l => ({
          entryType: 'debit',
          accountingCode: l.accountingCode || '',
          accountingName: l.accountingName || '',
          summary: l.summary || '',
          defaultAmount: l.defaultAmount != null ? String(l.defaultAmount) : '',
          supplierId: l.supplierId ? String(l.supplierId) : '',
          supplierName: l.supplierName || '',
          warehouse: l.warehouse || '',
          paymentMethod: l.paymentMethod || '',
          accountId: l.accountId ? String(l.accountId) : '',
          advancedBy: l.advancedBy || '',
          note: l.note || ''
        })),
      purchaseItems: Array.isArray(tmpl.purchaseItems) && tmpl.purchaseItems.length > 0
        ? tmpl.purchaseItems.map(item => ({
            productId: String(item.productId || ''),
            quantity: item.quantity || 1,
            unitPrice: item.unitPrice != null ? String(item.unitPrice) : '',
            note: item.note || ''
          }))
        : [{ ...EMPTY_PURCHASE_ITEM }],
      defaultDebitCode: tmpl.defaultDebitCode || '',
      defaultDebitName: tmpl.defaultDebitName || '',
      defaultCreditCode: tmpl.defaultCreditCode || '1111',
      defaultCreditName: tmpl.defaultCreditName || '銀行存款'
    };
    if (form.entryLines.length === 0) {
      form.entryLines = [{ ...EMPTY_ENTRY_LINE, entryType: 'debit' }];
    }
    setTemplateForm(form);
    setShowTemplateForm(true);
  }

  function addEntryLine(type) {
    setTemplateForm(prev => ({
      ...prev,
      entryLines: [...prev.entryLines, { ...EMPTY_ENTRY_LINE, entryType: type }]
    }));
  }

  function addEntryLineSingle() {
    setTemplateForm(prev => ({
      ...prev,
      entryLines: [...prev.entryLines, { ...EMPTY_ENTRY_LINE, entryType: 'debit' }]
    }));
  }

  function removeEntryLine(idx) {
    setTemplateForm(prev => ({
      ...prev,
      entryLines: prev.entryLines.filter((_, i) => i !== idx)
    }));
  }

  function updateEntryLine(idx, field, value) {
    setTemplateForm(prev => ({
      ...prev,
      entryLines: prev.entryLines.map((l, i) => i === idx ? { ...l, [field]: value } : l)
    }));
  }

  function updateEntryLineAccounting(idx, codeOrName, isCode) {
    setTemplateForm(prev => {
      const lines = prev.entryLines.map((l, i) => {
        if (i !== idx) return l;
        if (isCode) {
          const code = String(codeOrName).trim();
          const sub = acctByCode.get(code);
          return { ...l, accountingCode: codeOrName, accountingName: sub ? (sub.name || '') : l.accountingName };
        } else {
          const name = String(codeOrName).trim();
          const sub = acctByName.get(name);
          return { ...l, accountingName: codeOrName, accountingCode: sub ? (sub.code || '') : l.accountingCode };
        }
      });
      return { ...prev, entryLines: lines };
    });
  }

  function addPurchaseItem() {
    setTemplateForm(prev => ({
      ...prev,
      purchaseItems: [...prev.purchaseItems, { ...EMPTY_PURCHASE_ITEM }]
    }));
  }

  function removePurchaseItem(idx) {
    setTemplateForm(prev => ({
      ...prev,
      purchaseItems: prev.purchaseItems.filter((_, i) => i !== idx)
    }));
  }

  function updatePurchaseItem(idx, field, value) {
    setTemplateForm(prev => ({
      ...prev,
      purchaseItems: prev.purchaseItems.map((item, i) => i === idx ? { ...item, [field]: value } : item)
    }));
  }

  function getTemplateBalance() {
    const debit = templateForm.entryLines
      .filter(l => l.entryType === 'debit')
      .reduce((s, l) => s + (parseFloat(l.defaultAmount) || 0), 0);
    const credit = templateForm.entryLines
      .filter(l => l.entryType === 'credit')
      .reduce((s, l) => s + (parseFloat(l.defaultAmount) || 0), 0);
    return { debit, credit, balanced: debit === 0 && credit === 0 ? true : Math.abs(debit - credit) < 0.01 };
  }

  function getPurchaseTotal() {
    return templateForm.purchaseItems.reduce((sum, item) => {
      return sum + ((parseFloat(item.quantity) || 0) * (parseFloat(item.unitPrice) || 0));
    }, 0);
  }

  async function handleSaveTemplate() {
    if (!templateForm.name.trim()) {
      showToast('請輸入範本名稱', 'error');
      return;
    }

    if (mainTab === 'fixed') {
      if (!templateForm.entryLines.length) {
        showToast('請至少新增一筆費用項目', 'error');
        return;
      }
      for (const line of templateForm.entryLines) {
        if (!line.accountingName?.trim()) {
          showToast('每筆費用項目必須填寫名稱', 'error');
          return;
        }
        if (!line.warehouse?.trim()) {
          showToast('每筆費用項目必須選擇館別', 'error');
          return;
        }
        if (!line.paymentMethod?.trim()) {
          showToast('每筆費用項目必須選擇付款方式', 'error');
          return;
        }
        if ((line.paymentMethod === '轉帳' || line.paymentMethod === '匯款') && !line.accountId) {
          showToast(`費用「${line.accountingName}」：轉帳/匯款時必須選擇轉帳存簿`, 'error');
          return;
        }
      }
    }

    if (mainTab === 'purchase') {
      if (!templateForm.defaultSupplierId) {
        showToast('請選擇預設廠商', 'error');
        return;
      }
      const validItems = templateForm.purchaseItems.filter(item => item.productId);
      if (validItems.length === 0) {
        showToast('請至少新增一筆進貨品項', 'error');
        return;
      }
    }

    const body = {
      ...templateForm,
      templateType: mainTab,
      categoryId: templateForm.categoryId || null,
      defaultSupplierId: templateForm.defaultSupplierId || null,
    };

    if (mainTab === 'fixed') {
      body.entryLines = templateForm.entryLines.map((l, i) => ({
        entryType: l.entryType,
        accountingCode: l.accountingCode,
        accountingName: l.accountingName,
        summary: l.summary,
        defaultAmount: l.defaultAmount,
        supplierId: l.supplierId || null,
        supplierName: l.supplierName || '',
        warehouse: l.warehouse,
        paymentMethod: l.paymentMethod,
        accountId: l.accountId || null,
        advancedBy: l.advancedBy || null,
        note: l.note || '',
        sortOrder: i
      }));
      body.warehouseAmounts = null;
      body.defaultDebitCode = templateForm.defaultDebitCode || null;
      body.defaultDebitName = templateForm.defaultDebitName || null;
      body.defaultCreditCode = templateForm.defaultCreditCode || null;
      body.defaultCreditName = templateForm.defaultCreditName || null;
      delete body.purchaseItems;
    } else {
      body.purchaseItems = templateForm.purchaseItems
        .filter(item => item.productId)
        .map(item => ({
          productId: parseInt(item.productId),
          quantity: parseInt(item.quantity) || 1,
          unitPrice: parseFloat(item.unitPrice) || 0,
          note: item.note || ''
        }));
      delete body.entryLines;
    }

    setTemplateSaving(true);
    try {
      const url = editingTemplate
        ? `/api/expense-templates/${editingTemplate.id}`
        : '/api/expense-templates';
      const method = editingTemplate ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      if (res.ok) {
        showToast(editingTemplate ? '範本更新成功' : '範本新增成功', 'success');
        resetTemplateForm();
        fetchTemplates();
      } else {
        const err = await res.json();
        showToast(err.error || '儲存失敗', 'error');
      }
    } catch (err) {
      showToast('儲存範本失敗，請稍後再試', 'error');
    } finally {
      setTemplateSaving(false);
    }
  }

  async function handleDeleteTemplate(id) {
    if (!(await confirm('確定要刪除此範本嗎？', { title: '刪除確認', danger: true }))) return;
    try {
      const res = await fetch(`/api/expense-templates/${id}`, { method: 'DELETE' });
      if (res.ok) {
        showToast('範本已刪除', 'success');
        fetchTemplates();
      } else {
        const err = await res.json();
        showToast(err.error || '刪除失敗', 'error');
      }
    } catch (err) {
      showToast('刪除失敗，請稍後再試', 'error');
    }
  }

  async function handleToggleTemplateActive(tmpl) {
    try {
      const body = {
        ...tmpl,
        isActive: !tmpl.isActive,
        entryLines: tmpl.entryLines || [],
        purchaseItems: tmpl.purchaseItems || []
      };
      const res = await fetch(`/api/expense-templates/${tmpl.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      if (res.ok) fetchTemplates();
    } catch (err) {
      showToast('更新失敗', 'error');
    }
  }

  return {
    templates, setTemplates,
    showTemplateForm, setShowTemplateForm,
    editingTemplate, setEditingTemplate,
    templateForm, setTemplateForm,
    templateSaving,
    fetchTemplates,
    resetTemplateForm,
    handleEditTemplate,
    addEntryLine,
    addEntryLineSingle,
    removeEntryLine,
    updateEntryLine,
    updateEntryLineAccounting,
    addPurchaseItem,
    removePurchaseItem,
    updatePurchaseItem,
    getTemplateBalance,
    getPurchaseTotal,
    handleSaveTemplate,
    handleDeleteTemplate,
    handleToggleTemplateActive,
  };
}
