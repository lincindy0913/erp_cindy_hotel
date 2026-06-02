'use client';

import { useState, useEffect } from 'react';
import { useToast } from '@/context/ToastContext';

const FINANCE_LAST_CHECK_KEY = 'finance_lastCheck';

function getLastCheckValues() {
  try {
    const raw = typeof window !== 'undefined' && window.localStorage.getItem(FINANCE_LAST_CHECK_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveLastCheckValues(data) {
  try {
    if (typeof window !== 'undefined' && data) {
      window.localStorage.setItem(FINANCE_LAST_CHECK_KEY, JSON.stringify({
        checkIssueDate: data.checkIssueDate || '',
        checkDate: data.checkDate || '',
        checkNo: data.checkNo || '',
        checkAccountId: data.checkAccountId || ''
      }));
    }
  } catch (_) {}
}

export function usePaymentForm({
  suppliers = [],
  unpaidInvoices = [],
  selectedInvoiceIds,
  setSelectedInvoiceIds,
  paymentMethodOptions = [],
  setPaymentMethodOptions,
  onAfterSubmit,
} = {}) {
  const { showToast } = useToast();

  const [showAddForm, setShowAddForm] = useState(false);
  const [loadingInvoices, setLoadingInvoices] = useState(false);
  const [formSaving, setFormSaving] = useState(false);

  const [filterData, setFilterData] = useState({
    yearMonth: '',
    supplierId: '',
    warehouse: '',
    paymentTerms: ''
  });

  const [formData, setFormData] = useState({
    paymentMethod: '月結',
    checkIssueDate: '',
    checkDate: '',
    checkNo: '',
    checkAccountId: '',
    note: '',
    discount: '',
    paymentAmount: '',
    paymentDate: '',
    accountId: '',
    advancedBy: '',
    advancePaymentMethod: '',
  });

  // 付款方式為支票時，付款日期／支票日期／開票帳戶預設為上一次選取
  useEffect(() => {
    if (formData.paymentMethod !== '支票') return;
    const last = getLastCheckValues();
    if (!last) return;
    const needIssue = !formData.checkIssueDate?.trim();
    const needDate = !formData.checkDate?.trim();
    const needAccount = !formData.checkAccountId;
    if (!needIssue && !needDate && !needAccount) return;
    setFormData(prev => ({
      ...prev,
      ...(needIssue && last.checkIssueDate ? { checkIssueDate: last.checkIssueDate } : {}),
      ...(needDate && last.checkDate ? { checkDate: last.checkDate } : {}),
      ...(needAccount && last.checkAccountId ? { checkAccountId: String(last.checkAccountId) } : {})
    }));
  }, [formData.paymentMethod]);

  // 當勾選的發票變動時，自動更新付款金額（含支票金額）
  useEffect(() => {
    if (selectedInvoiceIds && selectedInvoiceIds.size > 0) {
      const total = parseFloat(calculateTotalForSet(selectedInvoiceIds, unpaidInvoices)) || 0;
      const discountNum = parseFloat(formData.discount) || 0;
      setFormData(prev => ({
        ...prev,
        paymentAmount: (total - discountNum).toFixed(2)
      }));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedInvoiceIds]);

  function getSupplierName(supplierId) {
    const supplier = suppliers.find(s => s.id === supplierId);
    return supplier ? supplier.name : '未知廠商';
  }

  function autoFillPaymentMethod(newSelected) {
    if (newSelected.size === 0) return;
    const firstInvoiceId = [...newSelected][0];
    const firstInvoice = unpaidInvoices.find(inv => inv.id === firstInvoiceId);
    if (firstInvoice?.supplierId) {
      const supplier = suppliers.find(s => s.id === firstInvoice.supplierId);
      if (supplier?.paymentTerms) {
        const method = supplier.paymentTerms;
        if (!paymentMethodOptions.includes(method)) {
          setPaymentMethodOptions(prev => [...prev, method]);
        }
        setFormData(prev => ({ ...prev, paymentMethod: method }));
      }
    }
  }

  function calculateTotalForSet(selectedSet, invoices) {
    let total = 0;
    selectedSet.forEach(invoiceId => {
      const invoice = invoices.find(inv => inv.id === invoiceId);
      if (invoice) {
        total += parseFloat(invoice.totalAmount || (invoice.amount || 0) + (invoice.tax || 0));
      }
    });
    return total;
  }

  function calculateTotal() {
    return calculateTotalForSet(selectedInvoiceIds, unpaidInvoices).toFixed(2);
  }

  function updatePaymentAmountForSet(newSelected) {
    const newTotal = calculateTotalForSet(newSelected, unpaidInvoices);
    const discountNum = parseFloat(formData.discount) || 0;
    setFormData(prev => ({ ...prev, paymentAmount: Math.max(0, newTotal - discountNum).toFixed(2) }));
  }

  function handleInvoiceToggle(invoiceId) {
    const newSelected = new Set(selectedInvoiceIds);
    if (newSelected.has(invoiceId)) {
      newSelected.delete(invoiceId);
    } else {
      newSelected.add(invoiceId);
    }
    setSelectedInvoiceIds(newSelected);
    autoFillPaymentMethod(newSelected);
    updatePaymentAmountForSet(newSelected);
  }

  function handleSelectAll() {
    if (selectedInvoiceIds.size === unpaidInvoices.length && unpaidInvoices.length > 0) {
      setSelectedInvoiceIds(new Set());
      setFormData(prev => ({ ...prev, paymentAmount: '0.00' }));
    } else {
      const newSelected = new Set(unpaidInvoices.map(inv => inv.id));
      setSelectedInvoiceIds(newSelected);
      autoFillPaymentMethod(newSelected);
      updatePaymentAmountForSet(newSelected);
    }
  }

  function resetFilterAndForm() {
    setFilterData({ yearMonth: '', supplierId: '', warehouse: '', paymentTerms: '' });
    setFormData({
      paymentMethod: '月結',
      checkIssueDate: '',
      checkDate: '',
      checkNo: '',
      checkAccountId: '',
      note: '',
      discount: '',
      paymentAmount: '',
      paymentDate: '',
      accountId: ''
    });
  }

  async function handleSubmit(e) {
    e.preventDefault();

    if (selectedInvoiceIds.size === 0) {
      showToast('請至少勾選一張發票進行付款', 'error');
      return;
    }

    const invoiceTotal = parseFloat(calculateTotal());
    const discountVal = parseFloat(formData.discount) || 0;
    const paymentAmountVal = parseFloat(formData.paymentAmount) || 0;
    const expectedPayment = invoiceTotal - discountVal;

    if (Math.abs(expectedPayment - paymentAmountVal) > 0.01) {
      showToast(`付款金額驗證失敗！\n\n發票總金額：NT$ ${invoiceTotal.toFixed(2)}\n會計折讓：NT$ ${discountVal.toFixed(2)}\n應付金額：NT$ ${expectedPayment.toFixed(2)}\n輸入付款金額：NT$ ${paymentAmountVal.toFixed(2)}\n\n「發票總金額 - 會計折讓」必須等於「付款金額」`, 'error');
      return;
    }

    const firstInvoice = unpaidInvoices.find(inv => selectedInvoiceIds.has(inv.id));
    const supplierId = firstInvoice?.supplierId || null;
    const supplierName = firstInvoice?.supplierName || (supplierId ? getSupplierName(supplierId) : null);
    const warehouse = firstInvoice?.warehouse || null;

    const isCheck = formData.paymentMethod === '支票';

    if (isCheck) {
      if (!formData.checkIssueDate?.trim()) {
        showToast('請填寫付款(開票)日期', 'error');
        return;
      }
      if (!formData.checkDate?.trim()) {
        showToast('請填寫支票日期', 'error');
        return;
      }
      if (!formData.checkNo?.trim()) {
        showToast('請填寫支票號碼', 'error');
        return;
      }
      if (!formData.checkAccountId) {
        showToast('請選擇開票帳戶（資金帳戶）', 'error');
        return;
      }
      if (!formData.paymentAmount || parseFloat(formData.paymentAmount) <= 0) {
        showToast('請先勾選發票，支票金額將自動帶入勾選發票的加總金額', 'error');
        return;
      }
    }

    setFormSaving(true);
    try {
      const orderData = {
        invoiceIds: Array.from(selectedInvoiceIds),
        supplierId,
        supplierName,
        warehouse,
        paymentMethod: formData.paymentMethod,
        amount: invoiceTotal,
        discount: discountVal,
        netAmount: paymentAmountVal,
        note: formData.note || null,
        status: '草稿',
      };

      if (isCheck) {
        orderData.checkIssueDate = formData.checkIssueDate || null;
        orderData.checkDueDate = formData.checkDate || null;
        orderData.checkNo = formData.checkNo || null;
        orderData.checkAccountId = formData.checkAccountId ? parseInt(formData.checkAccountId) : null;
      } else {
        orderData.dueDate = formData.paymentDate || null;
        orderData.accountId = formData.accountId ? parseInt(formData.accountId) : null;
      }

      if ((formData.paymentMethod === '員工代付' || formData.paymentMethod === '信用卡') && formData.advancedBy) {
        orderData.isEmployeeAdvance = true;
        orderData.advancedBy = formData.advancedBy;
        orderData.advancePaymentMethod = formData.advancePaymentMethod || formData.paymentMethod;
      }

      const response = await fetch('/api/payment-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(orderData)
      });

      if (response.ok) {
        const result = await response.json();
        if (isCheck) saveLastCheckValues(formData);
        const checkMsg = result.linkedCheckNo ? `\n已自動建立支票記錄：${result.linkedCheckNo}` : '';
        showToast(`付款單建立成功（草稿）！${checkMsg}`, 'success');
        setShowAddForm(false);
        setSelectedInvoiceIds(new Set());
        resetFilterAndForm();
        onAfterSubmit?.();
      } else {
        const error = await response.json();
        showToast('建立失敗：' + (error.error || error.message || '未知錯誤'), 'error');
      }
    } catch (error) {
      console.error('建立付款單失敗:', error);
      showToast('建立付款單失敗，請稍後再試', 'error');
    } finally {
      setFormSaving(false);
    }
  }

  return {
    showAddForm, setShowAddForm,
    loadingInvoices, setLoadingInvoices,
    formSaving, setFormSaving,
    filterData, setFilterData,
    formData, setFormData,
    calculateTotal,
    calculateTotalForSet,
    handleInvoiceToggle,
    handleSelectAll,
    resetFilterAndForm,
    handleSubmit,
    getSupplierName,
    getLastCheckValues,
    saveLastCheckValues,
  };
}
