'use client';

import { useState, useEffect } from 'react';
import { useConfirm } from '@/context/ConfirmContext';

// Notification fields definition (shared across hooks)
export const NOTIFICATION_FIELDS = [
  { key: 'pmsImportAlertDays', label: 'PMS 匯入提醒天數', description: '超過此天數未匯入 PMS 資料時發送警告' },
  { key: 'loanRepaymentAlertDays', label: '借款還款提醒天數', description: '借款到期前幾天開始提醒還款' },
  { key: 'checkDueAlertDays', label: '支票到期提醒天數', description: '支票到期前幾天開始提醒' },
  { key: 'checkDueWarningDays', label: '支票到期警告天數', description: '支票即將到期的緊急警告天數' },
  { key: 'loanExpiryAlertMonths', label: '貸款到期提醒月數', description: '貸款到期前幾個月開始提醒' },
  { key: 'monthEndAlertDayOfMonth', label: '月結提醒日（每月幾號）', description: '每月幾號提醒進行月結作業' },
];

export function useSettingsCore() {
  const confirm = useConfirm();
  const [loading, setLoading] = useState(true);
  const [settingsError, setSettingsError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);

  // Finance state
  const [taxRate, setTaxRate] = useState('5');
  const [invoiceTitles, setInvoiceTitles] = useState([]);
  const [newInvoiceTitle, setNewInvoiceTitle] = useState('');
  const [newInvoiceTaxId, setNewInvoiceTaxId] = useState('');
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [newPaymentMethod, setNewPaymentMethod] = useState('');

  // Notification state
  const [notificationSettings, setNotificationSettings] = useState({
    pmsImportAlertDays: '3',
    loanRepaymentAlertDays: '7',
    checkDueAlertDays: '7',
    checkDueWarningDays: '3',
    loanExpiryAlertMonths: '3',
    monthEndAlertDayOfMonth: '25',
  });

  // System info state
  const [systemInfo, setSystemInfo] = useState({
    version: '',
    dbStatus: '',
    dbError: '',
    productCount: 0,
    supplierCount: 0,
    purchaseCount: 0,
    invoiceCount: 0,
    expenseCount: 0,
    userCount: 0,
    cashAccountCount: 0,
    loanCount: 0,
    cashTransactionCount: 0,
    warehouseCount: 0,
    departmentCount: 0,
  });

  // Master data counts state
  const [masterDataCounts, setMasterDataCounts] = useState({
    products: 0,
    suppliers: 0,
    accountingSubjects: 0,
    warehouses: 0,
  });

  // Expense categories state
  const [expenseCategories, setExpenseCategories] = useState([]);

  // Audit trail state
  const [auditInfo, setAuditInfo] = useState({});

  // Toast helper
  function showToast(message, type = 'success') {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }

  // ---- Data Fetching ----
  async function fetchSettings() {
    try {
      const res = await fetch('/api/settings');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setSettingsError(null);
      if (data && typeof data === 'object') {
        if (data.taxRate !== undefined) setTaxRate(String(data.taxRate));
        const notifKeys = NOTIFICATION_FIELDS.map(f => f.key);
        const notif = {};
        notifKeys.forEach(k => {
          if (data[k] !== undefined) notif[k] = String(data[k]);
        });
        if (Object.keys(notif).length > 0) {
          setNotificationSettings(prev => ({ ...prev, ...notif }));
        }
      }
    } catch (err) {
      console.error('取得系統設定失敗:', err);
      setSettingsError('系統設定載入失敗，部分功能可能顯示預設值。');
    }
  }

  async function fetchInvoiceTitles() {
    try {
      const res = await fetch('/api/settings/invoice-titles');
      if (res.ok) {
        const data = await res.json();
        setInvoiceTitles(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error('取得發票抬頭失敗:', err);
    }
  }

  async function fetchPaymentMethods() {
    try {
      const res = await fetch('/api/settings/payment-methods');
      if (res.ok) {
        const data = await res.json();
        setPaymentMethods(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error('取得付款方式失敗:', err);
    }
  }

  async function fetchExpenseCategories() {
    try {
      const res = await fetch('/api/settings/expense-categories');
      if (res.ok) {
        const data = await res.json();
        setExpenseCategories(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error('取得費用分類失敗:', err);
    }
  }

  async function fetchSystemInfo() {
    try {
      const res = await fetch('/api/settings/system-info');
      if (res.ok) {
        const data = await res.json();
        setSystemInfo(prev => ({ ...prev, ...data }));
      }
    } catch (err) {
      console.error('取得系統資訊失敗:', err);
    }
  }

  async function fetchMasterDataCounts() {
    try {
      const [productsRes, suppliersRes, accountingRes, warehouseRes] = await Promise.all([
        fetch('/api/products?all=true').catch(() => null),
        fetch('/api/suppliers?all=true').catch(() => null),
        fetch('/api/accounting-subjects').catch(() => null),
        fetch('/api/warehouse-departments').catch(() => null),
      ]);

      const counts = { products: 0, suppliers: 0, accountingSubjects: 0, warehouses: 0 };

      if (productsRes && productsRes.ok) {
        const data = await productsRes.json();
        counts.products = Array.isArray(data) ? data.length : (data.products ? data.products.length : 0);
      }
      if (suppliersRes && suppliersRes.ok) {
        const data = await suppliersRes.json();
        counts.suppliers = Array.isArray(data) ? data.length : (data.suppliers ? data.suppliers.length : 0);
      }
      if (accountingRes && accountingRes.ok) {
        const data = await accountingRes.json();
        counts.accountingSubjects = Array.isArray(data) ? data.length : 0;
      }
      if (warehouseRes && warehouseRes.ok) {
        const data = await warehouseRes.json();
        if (data && typeof data === 'object') {
          counts.warehouses = data.list ? data.list.length : (data.byName ? Object.keys(data.byName).length : Object.keys(data).length);
        }
      }

      setMasterDataCounts(counts);
    } catch (err) {
      console.error('取得主資料統計失敗:', err);
    }
  }

  async function fetchAllData() {
    setLoading(true);
    await Promise.all([
      fetchSettings(),
      fetchInvoiceTitles(),
      fetchPaymentMethods(),
      fetchExpenseCategories(),
      fetchSystemInfo(),
      fetchMasterDataCounts(),
    ]);
    setLoading(false);
  }

  useEffect(() => {
    fetchAllData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- Finance Save Handlers ----
  async function saveTaxRate() {
    setSaving(true);
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'taxRate', value: taxRate }),
      });
      if (res.ok) {
        showToast('稅率已儲存');
      } else {
        const data = await res.json().catch(() => ({}));
        showToast((typeof data?.error === 'string' ? data.error : data?.error?.message) || '儲存稅率失敗', 'error');
      }
    } catch (err) {
      showToast('儲存稅率失敗', 'error');
    }
    setSaving(false);
  }

  async function addInvoiceTitle() {
    if (!newInvoiceTitle.trim()) return;
    try {
      const res = await fetch('/api/settings/invoice-titles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newInvoiceTitle.trim(), taxId: newInvoiceTaxId.trim() || null }),
      });
      if (res.ok) {
        setNewInvoiceTitle('');
        setNewInvoiceTaxId('');
        await fetchInvoiceTitles();
        showToast('發票抬頭已新增');
      } else {
        const data = await res.json().catch(() => ({}));
        showToast((typeof data?.error === 'string' ? data.error : data?.error?.message) || '新增發票抬頭失敗', 'error');
      }
    } catch (err) {
      showToast('新增發票抬頭失敗', 'error');
    }
  }

  async function deleteInvoiceTitle(id) {
    if (!(await confirm('確定要刪除此發票抬頭？', { title: '刪除確認', danger: true }))) return;
    try {
      const res = await fetch(`/api/settings/invoice-titles?id=${id}`, { method: 'DELETE' });
      if (res.ok) {
        await fetchInvoiceTitles();
        showToast('發票抬頭已刪除');
      } else {
        const data = await res.json().catch(() => ({}));
        showToast((typeof data?.error === 'string' ? data.error : data?.error?.message) || '刪除失敗', 'error');
      }
    } catch (err) {
      showToast('刪除失敗', 'error');
    }
  }

  async function addPaymentMethod() {
    if (!newPaymentMethod.trim()) return;
    try {
      const res = await fetch('/api/settings/payment-methods', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newPaymentMethod.trim() }),
      });
      if (res.ok) {
        setNewPaymentMethod('');
        await fetchPaymentMethods();
        showToast('付款方式已新增');
      } else {
        const data = await res.json().catch(() => ({}));
        showToast((typeof data?.error === 'string' ? data.error : data?.error?.message) || '新增付款方式失敗', 'error');
      }
    } catch (err) {
      showToast('新增付款方式失敗', 'error');
    }
  }

  async function deletePaymentMethod(id) {
    if (!(await confirm('確定要刪除此付款方式？', { title: '刪除確認', danger: true }))) return;
    try {
      const res = await fetch(`/api/settings/payment-methods?id=${id}`, { method: 'DELETE' });
      if (res.ok) {
        await fetchPaymentMethods();
        showToast('付款方式已刪除');
      } else {
        const data = await res.json().catch(() => ({}));
        showToast((typeof data?.error === 'string' ? data.error : data?.error?.message) || '刪除失敗', 'error');
      }
    } catch (err) {
      showToast('刪除失敗', 'error');
    }
  }

  // ---- Notification Save Handler ----
  async function saveNotificationSettings() {
    setSaving(true);
    try {
      const promises = Object.entries(notificationSettings).map(([key, value]) =>
        fetch('/api/settings', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key, value }),
        })
      );
      const results = await Promise.all(promises);
      const allOk = results.every(r => r.ok);
      if (allOk) {
        showToast('通知設定已儲存');
      } else {
        const failed = results.find(r => !r.ok);
        const data = failed ? await failed.json().catch(() => ({})) : {};
        showToast((typeof data?.error === 'string' ? data.error : data?.error?.message) || '部分設定儲存失敗', 'error');
      }
    } catch (err) {
      showToast('儲存通知設定失敗', 'error');
    }
    setSaving(false);
  }

  return {
    // Loading/error
    loading,
    settingsError,
    saving,
    setSaving,
    toast,
    showToast,
    fetchAllData,
    // Finance
    taxRate, setTaxRate,
    invoiceTitles,
    newInvoiceTitle, setNewInvoiceTitle,
    newInvoiceTaxId, setNewInvoiceTaxId,
    paymentMethods,
    newPaymentMethod, setNewPaymentMethod,
    saveTaxRate,
    addInvoiceTitle,
    deleteInvoiceTitle,
    addPaymentMethod,
    deletePaymentMethod,
    // Notifications
    notificationSettings, setNotificationSettings,
    saveNotificationSettings,
    // System info
    systemInfo,
    masterDataCounts,
    // Expense categories (list only; CRUD in useSettingsExpenseCategories)
    expenseCategories, setExpenseCategories, fetchExpenseCategories,
    // Audit
    auditInfo,
  };
}
