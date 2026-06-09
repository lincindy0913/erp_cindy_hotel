'use client';

import { useState } from 'react';
import { useToast } from '@/context/ToastContext';
import { todayStr } from '@/lib/localDate';

const EMPTY_PURCHASE_ITEM = {
  productId: '',
  quantity: 1,
  unitPrice: '',
  note: ''
};

export function useExpenseExecute({ mainTab, templates, suppliers, session, subTab, fetchRecords } = {}) {
  const { showToast } = useToast();

  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [executeForm, setExecuteForm] = useState({
    warehouse: '',
    expenseMonth: todayStr().slice(0, 7),
    supplierId: '',
    supplierName: '',
    paymentMethod: '',
    paymentTerms: '',
    note: '',
    entryLines: [],
    items: [],
    invoiceNo: '',
    invoiceDate: todayStr(),
    invoiceTitle: '',
    taxType: '',
    department: '',
    warehouseAmounts: [],
    checkIssueDate: todayStr(),
    checkDate: '',
    checkNo: '',
    checkAccountId: '',
    checkNote: ''
  });
  const [duplicateWarning, setDuplicateWarning] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  function handleSelectTemplate(tmplId) {
    setSelectedTemplateId(tmplId);
    setDuplicateWarning(null);
    if (!tmplId) {
      setExecuteForm(prev => ({ ...prev, entryLines: [], items: [], warehouseAmounts: [] }));
      return;
    }
    const tmpl = (templates || []).find(t => t.id === parseInt(tmplId));
    if (!tmpl) return;

    if (mainTab === 'purchase') {
      const items = Array.isArray(tmpl.purchaseItems) ? tmpl.purchaseItems.map(item => ({
        productId: String(item.productId || ''),
        quantity: item.quantity || 1,
        unitPrice: item.unitPrice != null ? String(item.unitPrice) : '',
        note: item.note || ''
      })) : [{ ...EMPTY_PURCHASE_ITEM }];

      setExecuteForm(prev => ({
        ...prev,
        supplierId: tmpl.defaultSupplierId ? String(tmpl.defaultSupplierId) : '',
        supplierName: tmpl.defaultSupplierId
          ? ((suppliers || []).find(s => s.id === tmpl.defaultSupplierId)?.name || '')
          : '',
        paymentTerms: tmpl.paymentMethod || '月結',
        warehouse: tmpl.warehouse || prev.warehouse,
        taxType: tmpl.defaultTaxType || '',
        items
      }));
    } else {
      const resolvedLines = (tmpl.entryLines || []).map(l => {
        let summary = (l.summary || l.accountingName || '')
          .replace(/\{\{館別\}\}/g, l.warehouse || '___')
          .replace(/\{\{月份\}\}/g, executeForm.expenseMonth || '___');
        return {
          entryType: l.entryType,
          accountingCode: l.accountingCode,
          accountingName: l.accountingName,
          summary: summary || l.accountingName || '',
          amount: l.defaultAmount != null ? String(l.defaultAmount) : '',
          supplierId: l.supplierId ? String(l.supplierId) : '',
          supplierName: l.supplierName || '',
          warehouse: l.warehouse || '',
          paymentMethod: l.paymentMethod || '',
          accountId: l.accountId ? String(l.accountId) : '',
          advancedBy: l.advancedBy || '',
          sortOrder: l.sortOrder
        };
      });

      setExecuteForm(prev => ({
        ...prev,
        supplierId: tmpl.defaultSupplierId ? String(tmpl.defaultSupplierId) : '',
        supplierName: tmpl.defaultSupplierId
          ? ((suppliers || []).find(s => s.id === tmpl.defaultSupplierId)?.name || '')
          : '',
        paymentMethod: tmpl.paymentMethod || '',
        warehouse: tmpl.warehouse || prev.warehouse,
        entryLines: resolvedLines,
        warehouseAmounts: []
      }));
    }
  }

  function updateExecuteLine(idx, field, value) {
    setExecuteForm(prev => ({
      ...prev,
      entryLines: prev.entryLines.map((l, i) => i === idx ? { ...l, [field]: value } : l)
    }));
  }

  function updateExecuteWarehouseAmount(wh, amount) {
    setExecuteForm(prev => ({
      ...prev,
      warehouseAmounts: prev.warehouseAmounts.map(w => w.warehouse === wh ? { ...w, amount } : w)
    }));
  }

  function updateExecuteItem(idx, field, value) {
    setExecuteForm(prev => ({
      ...prev,
      items: prev.items.map((item, i) => i === idx ? { ...item, [field]: value } : item)
    }));
  }

  function addExecuteItem() {
    setExecuteForm(prev => ({
      ...prev,
      items: [...prev.items, { ...EMPTY_PURCHASE_ITEM }]
    }));
  }

  function removeExecuteItem(idx) {
    setExecuteForm(prev => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== idx)
    }));
  }

  function getExecuteBalance() {
    const debit = executeForm.entryLines
      .filter(l => l.entryType === 'debit')
      .reduce((s, l) => s + (parseFloat(l.amount) || 0), 0);
    const credit = executeForm.entryLines
      .filter(l => l.entryType === 'credit')
      .reduce((s, l) => s + (parseFloat(l.amount) || 0), 0);
    return { debit, credit, balanced: Math.abs(debit - credit) < 0.01 };
  }

  function getExecutePurchaseTotal() {
    return executeForm.items.reduce((sum, item) => {
      return sum + ((parseFloat(item.quantity) || 0) * (parseFloat(item.unitPrice) || 0));
    }, 0);
  }

  async function handleExecute(allowDuplicate = false) {
    if (!selectedTemplateId) {
      showToast('請選擇範本', 'error');
      return;
    }
    if (mainTab === 'purchase' && !executeForm.warehouse) {
      showToast('請選擇館別', 'error');
      return;
    }
    if (!executeForm.expenseMonth) {
      showToast('請選擇費用月份', 'error');
      return;
    }

    setSubmitting(true);
    setDuplicateWarning(null);

    try {
      if (mainTab === 'purchase') {
        const validItems = executeForm.items.filter(item => item.productId);
        if (validItems.length === 0) {
          showToast('請至少新增一筆進貨品項', 'error');
          setSubmitting(false);
          return;
        }
        if (!executeForm.supplierId) {
          showToast('請選擇廠商', 'error');
          setSubmitting(false);
          return;
        }

        const body = {
          templateId: parseInt(selectedTemplateId),
          warehouse: executeForm.warehouse,
          expenseMonth: executeForm.expenseMonth,
          supplierId: parseInt(executeForm.supplierId),
          supplierName: executeForm.supplierName,
          paymentTerms: executeForm.paymentTerms || '月結',
          taxType: executeForm.taxType || null,
          department: executeForm.department || '',
          items: validItems.map(item => ({
            productId: parseInt(item.productId),
            quantity: parseInt(item.quantity) || 1,
            unitPrice: parseFloat(item.unitPrice) || 0,
            note: item.note || ''
          })),
          invoiceNo: executeForm.invoiceNo || null,
          invoiceDate: executeForm.invoiceDate || null,
          invoiceTitle: executeForm.invoiceTitle || null,
          createdBy: session?.user?.name || session?.user?.email || '系統',
          note: executeForm.note || null,
          allowDuplicate
        };

        const res = await fetch('/api/expense-records/execute-purchase', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });

        if (res.ok) {
          const result = await res.json();
          let msg = `執行成功！\n進貨單號: ${result.linkedPurchaseNo}`;
          if (result.linkedSalesNo) msg += `\n發票單號: ${result.linkedSalesNo}`;
          msg += `\n費用記錄: ${result.recordNo}`;
          showToast(msg, 'success');
          setSelectedTemplateId('');
          setExecuteForm(prev => ({ ...prev, items: [], invoiceNo: '', invoiceDate: '', invoiceTitle: '' }));
          if (subTab === 'records') fetchRecords();
        } else if (res.status === 409) {
          const err = await res.json();
          if (err.code === 'CONFLICT_UNIQUE') {
            setDuplicateWarning(typeof err.error === 'string' ? err.error : '此月份已有記錄');
          } else {
            showToast(err.error || '執行失敗', 'error');
          }
        } else {
          const err = await res.json();
          showToast(err.error || '執行失敗', 'error');
        }
      } else {
        if (!executeForm.expenseMonth?.trim()) {
          showToast('請選擇費用月份', 'error');
          setSubmitting(false);
          return;
        }
        const lines = (executeForm.entryLines || [])
          .map((l, idx) => ({ ...l, amount: parseFloat(l.amount) || 0, sortOrder: idx }))
          .filter(l => l.amount > 0);
        if (lines.length === 0) {
          showToast('請至少填寫一筆金額大於 0 的分錄', 'error');
          setSubmitting(false);
          return;
        }
        const needsCheckFields =
          executeForm.paymentMethod === '支票' || lines.some((l) => l.paymentMethod === '支票');
        const effectiveCheckAccountId =
          lines.find((l) => l.paymentMethod === '支票' && l.accountId)?.accountId ||
          executeForm.checkAccountId ||
          '';
        if (needsCheckFields) {
          if (!executeForm.checkIssueDate || !executeForm.checkDate || !executeForm.checkNo?.trim() || !effectiveCheckAccountId) {
            showToast('付款方式為支票時，請填寫：付款(開票)日期、支票日期、支票號碼，並於該列「付款帳戶」選擇開票帳戶', 'error');
            setSubmitting(false);
            return;
          }
        }
        const body = {
          templateId: parseInt(selectedTemplateId),
          expenseMonth: executeForm.expenseMonth.trim(),
          entryLines: lines.map(l => ({
            entryType: l.entryType,
            accountingCode: l.accountingCode,
            accountingName: l.accountingName,
            summary: l.summary,
            amount: l.amount,
            warehouse: l.warehouse || '',
            paymentMethod: l.paymentMethod || '月結',
            accountId: l.accountId ? parseInt(l.accountId) : null,
            advancedBy: l.advancedBy || null,
            supplierId: l.supplierId ? parseInt(l.supplierId) : null,
            supplierName: l.supplierName || null,
            sortOrder: l.sortOrder
          })),
          paymentMethod: executeForm.paymentMethod || '月結',
          advancedBy: executeForm.advancedBy || null,
          creditCardAdvanceMode: !!executeForm.creditCardAdvanceMode,
          createdBy: session?.user?.name || session?.user?.email || '系統',
          note: executeForm.note || null,
          allowDuplicate
        };
        if (needsCheckFields) {
          body.checkIssueDate = executeForm.checkIssueDate;
          body.checkDate = executeForm.checkDate;
          body.checkNo = executeForm.checkNo?.trim();
          body.checkAccountId = effectiveCheckAccountId ? parseInt(String(effectiveCheckAccountId), 10) : null;
          body.checkNote = executeForm.checkNote || null;
        }

        const res = await fetch('/api/expense-records/execute-fixed', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });

        if (res.ok) {
          const result = await res.json();
          let msg = result.message || `執行成功！已建立 ${result.created?.length || 0} 筆記錄`;
          if (executeForm.creditCardAdvanceMode) msg += `\n\n已建立「老闆信用卡代墊」記錄，可至「員工預支」頁面結算。\n（付款單狀態為「已代墊」，不會出現在出納待付清單）`;
          else if (needsCheckFields) msg += '\n\n已連動支票管理，可至「支票管理」頁面追蹤兌現。';
          showToast(msg, 'success');
          setSelectedTemplateId('');
          setExecuteForm(prev => ({
            ...prev,
            entryLines: [],
            checkIssueDate: todayStr(),
            checkDate: '',
            checkNo: '',
            checkAccountId: '',
            checkNote: ''
          }));
          if (subTab === 'records') fetchRecords();
        } else if (res.status === 409) {
          const err = await res.json();
          if (err.code === 'CONFLICT_UNIQUE') {
            setDuplicateWarning(typeof err.error === 'string' ? err.error : '此月份已有記錄');
          } else {
            showToast(err.error || '執行失敗', 'error');
          }
        } else {
          const err = await res.json();
          showToast(err.error || '執行失敗', 'error');
        }
      }
    } catch (err) {
      showToast('執行失敗，請稍後再試', 'error');
    }
    setSubmitting(false);
  }

  function resetExecuteForm() {
    setSelectedTemplateId('');
    setDuplicateWarning(null);
    setExecuteForm(prev => ({
      ...prev,
      items: [],
      entryLines: [],
      invoiceNo: '',
      invoiceDate: '',
      invoiceTitle: '',
      taxType: '',
      supplierId: '',
      supplierName: '',
    }));
  }

  return {
    selectedTemplateId, setSelectedTemplateId,
    executeForm, setExecuteForm,
    duplicateWarning, setDuplicateWarning,
    submitting,
    handleSelectTemplate,
    updateExecuteLine,
    updateExecuteWarehouseAmount,
    updateExecuteItem,
    addExecuteItem,
    removeExecuteItem,
    getExecuteBalance,
    getExecutePurchaseTotal,
    handleExecute,
    resetExecuteForm,
  };
}
