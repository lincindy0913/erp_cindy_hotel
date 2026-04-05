'use client';

import { useState, useEffect, Fragment, useMemo } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import Navigation from '@/components/Navigation';
import NotificationBanner from '@/components/NotificationBanner';
import { useToast } from '@/context/ToastContext';
import { sortRows, useColumnSort, SortableTh } from '@/components/SortableTh';

export default function PaymentPage() {
  const { data: session } = useSession();
  const { showToast } = useToast();
  const isLoggedIn = !!session;
  const [orders, setOrders] = useState([]);
  const [unpaidInvoices, setUnpaidInvoices] = useState([]);
  const [allInvoices, setAllInvoices] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingInvoices, setLoadingInvoices] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState(new Set());
  const [expandedOrders, setExpandedOrders] = useState(new Set());
  const [selectedOrderIds, setSelectedOrderIds] = useState(new Set()); // 付款單勾選，供批量提交出納
  const [activeTab, setActiveTab] = useState('draft');

  // 付款條件選項管理
  const [paymentTermsOptions, setPaymentTermsOptions] = useState(['月結', '現金', '支票', '轉帳', '信用卡', '員工代付']);
  const [showTermsManager, setShowTermsManager] = useState(false);
  const [newTermName, setNewTermName] = useState('');

  // 付款方式選項管理
  const [paymentMethodOptions, setPaymentMethodOptions] = useState(['月結', '現金', '支票', '轉帳', '信用卡', '員工代付']);
  const [showMethodManager, setShowMethodManager] = useState(false);
  const [newMethodName, setNewMethodName] = useState('');

  // 開票賬戶選項管理（可搜尋下拉）
  const [checkAccountOptions, setCheckAccountOptions] = useState([]);
  const [showAccountManager, setShowAccountManager] = useState(false);
  const [newAccountName, setNewAccountName] = useState('');
  const [accountSearch, setAccountSearch] = useState('');
  const [showAccountDropdown, setShowAccountDropdown] = useState(false);

  // 付款帳戶（CashAccount）
  const [cashAccounts, setCashAccounts] = useState([]);

  // 篩選條件（新增付款單用）
  const [filterData, setFilterData] = useState({
    yearMonth: '',
    supplierId: '',
    warehouse: '',
    paymentTerms: ''
  });

  // 搜尋篩選（付款單列表用）
  const [finSearchDateFrom, setFinSearchDateFrom] = useState('');
  const [finSearchDateTo, setFinSearchDateTo] = useState('');
  const [finSearchWarehouse, setFinSearchWarehouse] = useState('');
  const [finSearchSupplierId, setFinSearchSupplierId] = useState('');
  const [finSearchPaymentMethod, setFinSearchPaymentMethod] = useState('');

  // 按付款單的館別列印草稿報表
  const [showWarehouseReportModal, setShowWarehouseReportModal] = useState(false);
  const [reportMonth, setReportMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [reportWarehouse, setReportWarehouse] = useState('');
  // 按進貨單的館別列印
  const [showPurchaseReportModal, setShowPurchaseReportModal] = useState(false);
  const [purchaseReportMonth, setPurchaseReportMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [purchaseReportWarehouse, setPurchaseReportWarehouse] = useState('');
  const [purchaseReportDateFrom, setPurchaseReportDateFrom] = useState('');
  const [purchaseReportDateTo, setPurchaseReportDateTo] = useState('');
  const [purchaseReportSupplierId, setPurchaseReportSupplierId] = useState('');
  const [purchaseReportData, setPurchaseReportData] = useState(null);
  const [purchaseReportLoading, setPurchaseReportLoading] = useState(false);
  const [batchSubmitting, setBatchSubmitting] = useState(false);
  const [submittingOrderId, setSubmittingOrderId] = useState(null);
  const [formSaving, setFormSaving] = useState(false);

  // 表單資料
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

  useEffect(() => {
    fetchOrders();
    fetchSuppliers();
    fetchAllInvoices();
    fetchCashAccounts();
  }, []);

  // 切換分頁時清空付款單勾選
  useEffect(() => {
    setSelectedOrderIds(new Set());
  }, [activeTab]);

  // 從現有付款紀錄中提取開票賬戶選項
  useEffect(() => {
    if (orders.length > 0) {
      const accounts = [...new Set(orders.map(p => p.checkAccount).filter(Boolean))];
      setCheckAccountOptions(prev => {
        const merged = [...new Set([...prev, ...accounts])];
        return merged;
      });
    }
  }, [orders]);

  // 當勾選的發票變動時，自動更新付款金額（含支票金額）
  useEffect(() => {
    if (selectedInvoiceIds.size > 0) {
      const total = parseFloat(calculateTotal()) || 0;
      const discountNum = parseFloat(formData.discount) || 0;
      setFormData(prev => ({
        ...prev,
        paymentAmount: (total - discountNum).toFixed(2)
      }));
    }
  }, [selectedInvoiceIds]);

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

  async function fetchOrders() {
    try {
      const response = await fetch('/api/payment-orders');
      const data = await response.json();
      setOrders(Array.isArray(data) ? data : []);
      setLoading(false);
    } catch (error) {
      console.error('取得付款單列表失敗:', error);
      setOrders([]);
      setLoading(false);
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

  async function fetchAllInvoices() {
    try {
      const response = await fetch('/api/sales');
      const data = await response.json();
      setAllInvoices(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('取得發票列表失敗:', error);
      setAllInvoices([]);
    }
  }

  async function fetchCashAccounts() {
    try {
      const response = await fetch('/api/cashflow/accounts');
      const data = await response.json();
      setCashAccounts(Array.isArray(data) ? data.filter(a => a.isActive) : []);
    } catch (error) {
      console.error('取得帳戶列表失敗:', error);
      setCashAccounts([]);
    }
  }

  // 查詢未付款的發票
  async function fetchUnpaidInvoices() {
    setLoadingInvoices(true);
    try {
      const params = new URLSearchParams();
      if (filterData.yearMonth) params.append('yearMonth', filterData.yearMonth);
      if (filterData.supplierId) params.append('supplierId', filterData.supplierId);
      if (filterData.warehouse) params.append('warehouse', filterData.warehouse);
      if (filterData.paymentTerms) params.append('paymentTerms', filterData.paymentTerms);

      const url = `/api/sales/unpaid?${params.toString()}`;
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      const invoices = Array.isArray(data) ? data : [];
      setUnpaidInvoices(invoices);
      setSelectedInvoiceIds(new Set());

      if (invoices.length === 0) {
        showToast('查詢完成，但沒有找到未付款的發票。\n\n請檢查：\n1. 篩選條件是否正確\n2. 是否有建立發票資料\n3. 該發票是否已被付款', 'info');
      }
    } catch (error) {
      console.error('取得未付款發票失敗:', error);
      setUnpaidInvoices([]);
      showToast('查詢失敗：' + (error.message || '請稍後再試'), 'error');
    } finally {
      setLoadingInvoices(false);
    }
  }

  function getSupplierName(supplierId) {
    const supplier = suppliers.find(s => s.id === supplierId);
    return supplier ? supplier.name : '未知廠商';
  }

  // Auto-fill payment method from supplier's default paymentTerms
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

  function updatePaymentAmountForSet(newSelected) {
    const newTotal = calculateTotalForSet(newSelected);
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

  function calculateTotalForSet(selectedSet) {
    let total = 0;
    selectedSet.forEach(invoiceId => {
      const invoice = unpaidInvoices.find(inv => inv.id === invoiceId);
      if (invoice) {
        total += parseFloat(invoice.totalAmount || (invoice.amount || 0) + (invoice.tax || 0));
      }
    });
    return total;
  }

  function calculateTotal() {
    return calculateTotalForSet(selectedInvoiceIds).toFixed(2);
  }

  async function handleSubmit(e) {
    e.preventDefault();

    if (selectedInvoiceIds.size === 0) {
      showToast('請至少勾選一張發票進行付款', 'error');
      return;
    }

    // 會計折讓與付款金額驗證
    const invoiceTotal = parseFloat(calculateTotal());
    const discountVal = parseFloat(formData.discount) || 0;
    const paymentAmountVal = parseFloat(formData.paymentAmount) || 0;
    const expectedPayment = invoiceTotal - discountVal;

    if (Math.abs(expectedPayment - paymentAmountVal) > 0.01) {
      showToast(`付款金額驗證失敗！\n\n發票總金額：NT$ ${invoiceTotal.toFixed(2)}\n會計折讓：NT$ ${discountVal.toFixed(2)}\n應付金額：NT$ ${expectedPayment.toFixed(2)}\n輸入付款金額：NT$ ${paymentAmountVal.toFixed(2)}\n\n「發票總金額 - 會計折讓」必須等於「付款金額」`, 'error');
      return;
    }

    // 從選取的發票推導供應商和倉別
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
        // 支票：傳送支票相關欄位，後端會自動建立 Check 記錄；開票帳戶連動資金帳戶
        orderData.checkIssueDate = formData.checkIssueDate || null;
        orderData.checkDueDate = formData.checkDate || null;
        orderData.checkNo = formData.checkNo || null;
        orderData.checkAccountId = formData.checkAccountId ? parseInt(formData.checkAccountId) : null;
      } else {
        // 非支票：付款日期、付款帳戶
        orderData.dueDate = formData.paymentDate || null;
        orderData.accountId = formData.accountId ? parseInt(formData.accountId) : null;
      }

      // 員工代墊款：傳送代墊員工資訊
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
        setUnpaidInvoices([]);
        resetFilterAndForm();
        setActiveTab('draft');
        fetchOrders();
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

  async function handleDelete(orderId) {
    if (!confirm('確定要刪除這筆付款單嗎？')) return;

    try {
      const response = await fetch(`/api/payment-orders/${orderId}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        showToast('付款單刪除成功！', 'success');
        fetchOrders();
      } else {
        const error = await response.json();
        showToast('刪除失敗：' + (error.error || error.message || '未知錯誤'), 'error');
      }
    } catch (error) {
      console.error('刪除付款單失敗:', error);
      showToast('刪除付款單失敗，請稍後再試', 'error');
    }
  }

  function handleOrderToggle(orderId) {
    const newSelected = new Set(selectedOrderIds);
    if (newSelected.has(orderId)) newSelected.delete(orderId);
    else newSelected.add(orderId);
    setSelectedOrderIds(newSelected);
  }

  function handleSelectAllOrders() {
    const current = getDisplayOrders();
    const canSelect = current.filter(o => o.status === '草稿' || o.status === '已拒絕');
    if (selectedOrderIds.size === canSelect.length && canSelect.length > 0) {
      setSelectedOrderIds(new Set());
    } else {
      setSelectedOrderIds(new Set(canSelect.map(o => o.id)));
    }
  }

  async function handleBatchSubmitToCashier() {
    const ids = Array.from(selectedOrderIds);
    if (ids.length === 0) return;
    const orders = displayOrders.filter(o => ids.includes(o.id));
    const draftCount = orders.filter(o => o.status === '草稿').length;
    const rejectedCount = orders.filter(o => o.status === '已拒絕').length;
    const isSubmit = draftCount > 0 && rejectedCount === 0;
    const isResubmit = rejectedCount > 0 && draftCount === 0;
    const isMixed = draftCount > 0 && rejectedCount > 0;
    const actionLabel = isSubmit ? '提交出納' : isResubmit ? '重新提交' : '提交/重新提交';
    if (!confirm(`確定要將選取的 ${ids.length} 筆付款單${actionLabel}嗎？`)) return;

    setBatchSubmitting(true);
    try {
      let ok = 0;
      const errors = [];
      for (const orderId of ids) {
        const order = orders.find(o => o.id === orderId);
        const action = order?.status === '已拒絕' ? 'resubmit' : 'submit';
        try {
          const response = await fetch(`/api/payment-orders/${orderId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action })
          });
          if (response.ok) ok++;
          else {
            const err = await response.json();
            errors.push(`${order?.orderNo || orderId}: ${err.error || err.message || '未知錯誤'}`);
          }
        } catch (e) {
          errors.push(`${order?.orderNo || orderId}: 網路錯誤`);
        }
      }
      if (ok > 0) {
        setSelectedOrderIds(new Set());
        fetchOrders();
        showToast(`成功 ${actionLabel} ${ok} 筆${errors.length ? `，失敗 ${errors.length} 筆` : ''}`, errors.length ? 'warning' : 'success');
      }
      if (errors.length > 0) {
        showToast(`部分失敗：\n${errors.slice(0, 5).join('\n')}${errors.length > 5 ? `\n...等 ${errors.length} 筆` : ''}`, 'error');
      }
    } finally {
      setBatchSubmitting(false);
    }
  }

  async function handleSubmitToCashier(orderId) {
    if (!confirm('確定要提交此付款單到出納嗎？')) return;

    setSubmittingOrderId(orderId);
    try {
      const response = await fetch(`/api/payment-orders/${orderId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'submit' })
      });

      if (response.ok) {
        showToast('付款單已提交出納！', 'success');
        fetchOrders();
      } else {
        const error = await response.json();
        showToast('提交失敗：' + (error.error || error.message || '未知錯誤'), 'error');
      }
    } catch (error) {
      console.error('提交出納失敗:', error);
      showToast('提交出納失敗，請稍後再試', 'error');
    } finally {
      setSubmittingOrderId(null);
    }
  }

  async function handleResubmit(orderId) {
    if (!confirm('確定要重新提交此付款單到出納嗎？')) return;

    setSubmittingOrderId(orderId);
    try {
      const response = await fetch(`/api/payment-orders/${orderId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'resubmit' })
      });

      if (response.ok) {
        showToast('付款單已重新提交出納！', 'success');
        fetchOrders();
      } else {
        const error = await response.json();
        showToast('重新提交失敗：' + (error.error || error.message || '未知錯誤'), 'error');
      }
    } catch (error) {
      console.error('重新提交失敗:', error);
      showToast('重新提交失敗，請稍後再試', 'error');
    } finally {
      setSubmittingOrderId(null);
    }
  }

  async function handleVoid(orderId) {
    if (!confirm('確定要作廢此付款單嗎？此操作不可復原。')) return;

    try {
      const response = await fetch(`/api/payment-orders/${orderId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'void' })
      });

      if (response.ok) {
        showToast('付款單已作廢！', 'success');
        fetchOrders();
      } else {
        const error = await response.json();
        showToast('作廢失敗：' + (error.error || error.message || '未知錯誤'), 'error');
      }
    } catch (error) {
      console.error('作廢失敗:', error);
    }
  }

  function getInvoicesForOrder(order) {
    if (order.invoiceIds && Array.isArray(order.invoiceIds)) {
      return order.invoiceIds;
    }
    return [];
  }

  function getInvoiceDetails(invoiceId) {
    return allInvoices.find(inv => inv.id === invoiceId);
  }

  function handleViewDetails(orderId) {
    const newExpanded = new Set(expandedOrders);
    if (newExpanded.has(orderId)) {
      newExpanded.delete(orderId);
    } else {
      newExpanded.add(orderId);
    }
    setExpandedOrders(newExpanded);
  }

  // Tab filter
  const draftOrders = orders.filter(o => o.status === '草稿');
  const pendingOrders = orders.filter(o => o.status === '待出納');
  const executedOrders = orders.filter(o => o.status === '已執行');
  const rejectedOrders = orders.filter(o => o.status === '已拒絕');
  const advancedOrders = orders.filter(o => o.status === '已代墊');
  const returnedOrders = orders.filter(o => o.status === '已退貨');

  const TABS = [
    { key: 'draft', label: '草稿', count: draftOrders.length, color: 'bg-gray-100 text-gray-800' },
    { key: 'pending', label: '待出納', count: pendingOrders.length, color: 'bg-yellow-100 text-yellow-800' },
    { key: 'executed', label: '已執行', count: executedOrders.length, color: 'bg-green-100 text-green-800' },
    { key: 'rejected', label: '已拒絕', count: rejectedOrders.length, color: 'bg-red-100 text-red-800' },
    ...(advancedOrders.length > 0 ? [{ key: 'advanced', label: '已代墊', count: advancedOrders.length, color: 'bg-purple-100 text-purple-800' }] : []),
    ...(returnedOrders.length > 0 ? [{ key: 'returned', label: '已退貨', count: returnedOrders.length, color: 'bg-orange-100 text-orange-800' }] : []),
  ];

  function getDisplayOrders() {
    switch (activeTab) {
      case 'draft': return draftOrders;
      case 'pending': return pendingOrders;
      case 'executed': return executedOrders;
      case 'rejected': return rejectedOrders;
      case 'advanced': return advancedOrders;
      case 'returned': return returnedOrders;
      default: return orders;
    }
  }

  const rawDisplayOrders = getDisplayOrders();
  // 搜尋篩選
  const displayOrders = useMemo(() => {
    return rawDisplayOrders.filter(o => {
      if (finSearchDateFrom) {
        const d = (o.createdAt || '').slice(0, 10);
        if (d < finSearchDateFrom) return false;
      }
      if (finSearchDateTo) {
        const d = (o.createdAt || '').slice(0, 10);
        if (d > finSearchDateTo) return false;
      }
      if (finSearchWarehouse && (o.warehouse || '') !== finSearchWarehouse) return false;
      if (finSearchSupplierId && String(o.supplierId || '') !== finSearchSupplierId) return false;
      if (finSearchPaymentMethod && (o.paymentMethod || '') !== finSearchPaymentMethod) return false;
      return true;
    });
  }, [rawDisplayOrders, finSearchDateFrom, finSearchDateTo, finSearchWarehouse, finSearchSupplierId, finSearchPaymentMethod]);

  const { sortKey: finSortKey, sortDir: finSortDir, toggleSort: toggleFinSort } = useColumnSort('createdAt', 'desc');
  const sortedDisplayOrders = useMemo(
    () =>
      sortRows(displayOrders, finSortKey, finSortDir, {
        orderNo: (o) => o.orderNo || '',
        supplierName: (o) => o.supplierName || '',
        warehouse: (o) => o.warehouse || '',
        paymentMethod: (o) => o.paymentMethod || '',
        invoiceCount: (o) => o.invoices?.length || 0,
        discount: (o) => Number(o.discount || 0),
        netAmount: (o) => Number(o.netAmount || 0),
        status: (o) => o.status || '',
        createdAt: (o) => o.createdAt || '',
      }),
    [displayOrders, finSortKey, finSortDir]
  );

  // 按館別列印報表：依報表月份篩選草稿，再依館別分組
  const draftOrdersInReportMonth = draftOrders.filter(o => {
    const created = o.createdAt ? o.createdAt.slice(0, 7) : '';
    return created === reportMonth;
  });
  const warehouseOptionsForReport = [
    { value: '', label: '全部館別（分頁列印）' },
    ...Array.from(new Set(draftOrdersInReportMonth.map(o => o.warehouse || '').filter(Boolean))).sort().map(w => ({ value: w, label: w })),
    ...(draftOrdersInReportMonth.some(o => !o.warehouse) ? [{ value: '__none__', label: '未指定館別' }] : []),
  ];
  const reportOrdersByWarehouse = reportWarehouse === ''
    ? (() => {
        const groups = {};
        draftOrdersInReportMonth.forEach(o => {
          const key = o.warehouse || '__none__';
          if (!groups[key]) groups[key] = [];
          groups[key].push(o);
        });
        return groups;
      })()
    : reportWarehouse === '__none__'
      ? { '__none__': draftOrdersInReportMonth.filter(o => !o.warehouse) }
      : { [reportWarehouse]: draftOrdersInReportMonth.filter(o => o.warehouse === reportWarehouse) };

  // 按進貨單的館別列印：查詢進貨單館別對應的付款單
  async function fetchPurchaseReport() {
    if (!purchaseReportMonth && !purchaseReportDateFrom && !purchaseReportDateTo) { showToast('請選擇月份或日期區間', 'error'); return; }
    setPurchaseReportLoading(true);
    setPurchaseReportData(null);
    try {
      const params = new URLSearchParams();
      if (purchaseReportDateFrom || purchaseReportDateTo) {
        if (purchaseReportDateFrom) params.set('dateFrom', purchaseReportDateFrom);
        if (purchaseReportDateTo) params.set('dateTo', purchaseReportDateTo);
      } else {
        params.set('month', purchaseReportMonth);
      }
      if (purchaseReportWarehouse) params.set('warehouse', purchaseReportWarehouse);
      if (purchaseReportSupplierId) params.set('supplierId', purchaseReportSupplierId);
      const res = await fetch(`/api/finance/purchase-warehouse-report?${params}`);
      if (res.ok) {
        const data = await res.json();
        setPurchaseReportData(data);
      } else {
        setPurchaseReportData({ error: '查詢失敗' });
      }
    } catch {
      setPurchaseReportData({ error: '查詢失敗' });
    }
    setPurchaseReportLoading(false);
  }

  // 按搜尋結果列印付款單（依館別分頁）
  function handlePrintFilteredByWarehouse() {
    const rows = sortedDisplayOrders;
    if (rows.length === 0) { showToast('無資料可列印', 'error'); return; }
    const groups = {};
    rows.forEach(o => { const k = o.warehouse || '未指定館別'; if (!groups[k]) groups[k] = []; groups[k].push(o); });
    const filterInfo = [];
    if (finSearchDateFrom || finSearchDateTo) filterInfo.push(`日期: ${finSearchDateFrom || '~'} ~ ${finSearchDateTo || '~'}`);
    if (finSearchWarehouse) filterInfo.push(`館別: ${finSearchWarehouse}`);
    if (finSearchSupplierId) { const s = suppliers.find(s => String(s.id) === finSearchSupplierId); filterInfo.push(`廠商: ${s?.name || ''}`); }
    if (finSearchPaymentMethod) filterInfo.push(`付款方式: ${finSearchPaymentMethod}`);
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(`<html><head><title>付款單 — 按館別列印</title>
      <style>body{font-family:'Microsoft JhengHei',sans-serif;padding:20px}
      table{width:100%;border-collapse:collapse;font-size:12px;margin-bottom:20px}
      th,td{border:1px solid #ccc;padding:6px 8px;text-align:left}
      th{background:#f5f5f5;font-weight:600} .right{text-align:right}
      h2{margin:0 0 4px} h3{margin:16px 0 8px} .info{color:#666;font-size:12px;margin-bottom:12px}
      .page-break{page-break-before:always}
      @media print{button{display:none}}</style></head><body>
      <h2>付款管理 — ${activeTab === 'draft' ? '草稿' : activeTab === 'pending' ? '待出納' : activeTab === 'executed' ? '已執行' : '已拒絕'}</h2>
      <div class="info">${filterInfo.length ? filterInfo.join('　') + '<br>' : ''}列印時間: ${new Date().toLocaleString('zh-TW')}</div>`);
    let first = true;
    Object.entries(groups).sort().forEach(([wh, list]) => {
      if (!first) w.document.write('<div class="page-break"></div>');
      first = false;
      const total = list.reduce((s, o) => s + Number(o.netAmount || 0), 0);
      w.document.write(`<h3>館別: ${wh} (${list.length} 筆)</h3>
      <table><thead><tr><th>付款單號</th><th>廠商</th><th>付款方式</th><th class="right">淨額</th><th>狀態</th><th>建立日期</th></tr></thead><tbody>`);
      list.forEach(o => {
        w.document.write(`<tr><td>${o.orderNo}</td><td>${o.supplierName || '－'}</td><td>${o.paymentMethod || '－'}</td>
          <td class="right">${Number(o.netAmount || 0).toLocaleString()}</td><td>${o.status}</td>
          <td>${o.createdAt ? new Date(o.createdAt).toLocaleDateString('zh-TW') : '－'}</td></tr>`);
      });
      w.document.write(`</tbody><tfoot><tr><td colspan="3" class="right"><strong>小計</strong></td>
        <td class="right"><strong>${total.toLocaleString()}</strong></td><td colspan="2"></td></tr></tfoot></table>`);
    });
    const grandTotal = rows.reduce((s, o) => s + Number(o.netAmount || 0), 0);
    w.document.write(`<div style="font-size:14px;font-weight:700;margin-top:8px">總計: ${rows.length} 筆, NT$ ${grandTotal.toLocaleString()}</div>
    <button onclick="window.print()" style="margin-top:12px;padding:8px 20px;font-size:14px;cursor:pointer">列印</button></body></html>`);
    w.document.close();
  }

  // 匯出Excel
  function handleFinExportExcel() {
    const rows = sortedDisplayOrders;
    if (rows.length === 0) { showToast('無資料可匯出', 'error'); return; }
    const header = ['付款單號', '廠商', '館別', '付款方式', '發票數', '折讓', '淨額', '狀態', '建立日期'];
    const csvRows = [header.join(',')];
    rows.forEach(o => {
      csvRows.push([
        o.orderNo || '',
        (o.supplierName || '').replace(/,/g, '，'),
        o.warehouse || '',
        o.paymentMethod || '',
        (o.invoices?.length || 0),
        Number(o.discount || 0),
        Number(o.netAmount || 0),
        o.status || '',
        o.createdAt ? new Date(o.createdAt).toLocaleDateString('zh-TW') : ''
      ].map(c => `"${c}"`).join(','));
    });
    const blob = new Blob(['\uFEFF' + csvRows.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `付款單_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function getStatusBadge(status) {
    const map = {
      '草稿': 'bg-gray-100 text-gray-800',
      '待出納': 'bg-yellow-100 text-yellow-800',
      '已執行': 'bg-green-100 text-green-800',
      '已拒絕': 'bg-red-100 text-red-800',
      '已作廢': 'bg-gray-200 text-gray-500',
      '已代墊': 'bg-purple-100 text-purple-800',
      '已退貨': 'bg-orange-100 text-orange-800',
    };
    return map[status] || 'bg-gray-100 text-gray-800';
  }

  // Build traceability chain for an executed order
  function getTraceabilityChain(order) {
    const invoiceIds = getInvoicesForOrder(order);
    const invoiceNos = invoiceIds.map(id => {
      const inv = getInvoiceDetails(id);
      return inv ? (inv.invoiceNo || inv.salesNo || `#${id}`) : `#${id}`;
    });

    const chain = {
      invoices: invoiceNos.join(', '),
      paymentOrderNo: order.orderNo,
      executionNo: null,
      cashTransactionNo: null,
    };

    if (order.executions && order.executions.length > 0) {
      const exec = order.executions[0];
      chain.executionNo = exec.executionNo;
      // cashTransactionId is stored on the execution - we display it as CF-xxx
      if (exec.cashTransactionId) {
        // We don't have the transaction no directly, but we can construct it from the execution
        // The cashier/execute API stores it - we show what we have
        chain.cashTransactionNo = exec.cashTransactionId;
      }
    }

    return chain;
  }

  return (
    <div className="min-h-screen page-bg-finance">
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          .no-print-finance, .no-print-finance * { visibility: hidden !important; }
          #finance-warehouse-report-print-root { visibility: visible !important; position: absolute !important; left: 0 !important; top: 0 !important; width: 100% !important; background: #fff !important; z-index: 99999 !important; }
          #finance-warehouse-report-print-root * { visibility: visible !important; }
        }
      `}} />
      <Navigation borderColor="border-indigo-500" />
      <NotificationBanner moduleFilter="finance" />

      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold">付款管理</h2>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handlePrintFilteredByWarehouse}
              className="bg-white border border-indigo-300 text-indigo-700 px-4 py-2 rounded-lg hover:bg-indigo-50 text-sm"
            >
              按付款單的館別列印
            </button>
            <button
              type="button"
              onClick={() => {
                // 預填搜尋條件到進貨報表
                if (finSearchDateFrom) {
                  setPurchaseReportDateFrom(finSearchDateFrom);
                  setPurchaseReportMonth('');
                }
                if (finSearchDateTo) {
                  setPurchaseReportDateTo(finSearchDateTo);
                  setPurchaseReportMonth('');
                }
                if (finSearchWarehouse) {
                  setPurchaseReportWarehouse(finSearchWarehouse);
                }
                if (finSearchSupplierId) {
                  setPurchaseReportSupplierId(finSearchSupplierId);
                }
                setShowPurchaseReportModal(true);
              }}
              className="bg-white border border-green-300 text-green-700 px-4 py-2 rounded-lg hover:bg-green-50 text-sm"
            >
              按進貨單的館別列印
            </button>
            <button onClick={handleFinExportExcel}
              className="px-3 py-2 rounded-lg text-sm font-medium bg-white text-green-700 hover:bg-green-50 border border-green-300">
              📥 匯出Excel
            </button>
            {isLoggedIn && (
              <button
                onClick={() => {
                  setShowAddForm(!showAddForm);
                  if (!showAddForm) {
                    setSelectedInvoiceIds(new Set());
                    setUnpaidInvoices([]);
                    resetFilterAndForm();
                  }
                }}
                className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700"
              >
                + 新增付款單
              </button>
            )}
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-lg shadow p-4 border-l-4 border-gray-400">
            <p className="text-sm text-gray-500">草稿</p>
            <p className="text-2xl font-bold text-gray-700">{draftOrders.length}</p>
          </div>
          <div className="bg-white rounded-lg shadow p-4 border-l-4 border-yellow-500">
            <p className="text-sm text-gray-500">待出納</p>
            <p className="text-2xl font-bold text-yellow-700">{pendingOrders.length}</p>
          </div>
          <div className="bg-white rounded-lg shadow p-4 border-l-4 border-green-500">
            <p className="text-sm text-gray-500">已執行</p>
            <p className="text-2xl font-bold text-green-700">{executedOrders.length}</p>
          </div>
          <div className="bg-white rounded-lg shadow p-4 border-l-4 border-red-400">
            <p className="text-sm text-gray-500">已拒絕</p>
            <p className="text-2xl font-bold text-red-600">{rejectedOrders.length}</p>
          </div>
        </div>

        {/* 新增付款表單 */}
        {showAddForm && (
          <div className="bg-white rounded-lg shadow-sm p-6 mb-6 border-2 border-indigo-200">
            <h3 className="text-lg font-semibold mb-4">新增付款單（草稿）</h3>
            <form onSubmit={handleSubmit}>
              {/* 篩選條件 */}
              <div className="bg-gray-50 border rounded-lg p-4 mb-6">
                <h4 className="text-md font-semibold mb-3">篩選未付款的發票</h4>
                <div className="grid grid-cols-4 gap-4 mb-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">銷帳年月</label>
                    <input
                      type="month"
                      value={filterData.yearMonth}
                      onChange={(e) => setFilterData({ ...filterData, yearMonth: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">廠商</label>
                    <select
                      value={filterData.supplierId}
                      onChange={(e) => setFilterData({ ...filterData, supplierId: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="">全部廠商</option>
                      {suppliers.map(s => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">管別</label>
                    <select
                      value={filterData.warehouse}
                      onChange={(e) => setFilterData({ ...filterData, warehouse: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="">全部管別</option>
                      <option value="麗格">麗格</option>
                      <option value="麗軒">麗軒</option>
                      <option value="民宿">民宿</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      付款條件
                      <button
                        type="button"
                        onClick={() => setShowTermsManager(!showTermsManager)}
                        className="ml-2 text-indigo-600 hover:text-indigo-800 text-xs"
                      >
                        管理選項
                      </button>
                    </label>
                    <select
                      value={filterData.paymentTerms}
                      onChange={(e) => setFilterData({ ...filterData, paymentTerms: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="">全部條件</option>
                      {paymentTermsOptions.map(term => (
                        <option key={term} value={term}>{term}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* 付款條件管理面板 */}
                {showTermsManager && (
                  <div className="bg-white border border-gray-300 rounded-lg p-4 mb-3">
                    <div className="flex justify-between items-center mb-3">
                      <h5 className="text-sm font-semibold text-gray-700">管理付款條件選項</h5>
                      <button type="button" onClick={() => setShowTermsManager(false)} className="text-gray-400 hover:text-gray-600 text-sm">關閉</button>
                    </div>
                    <div className="flex gap-2 mb-3">
                      <input
                        type="text"
                        value={newTermName}
                        onChange={(e) => setNewTermName(e.target.value)}
                        placeholder="輸入新付款條件名稱"
                        className="flex-1 px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            const trimmed = newTermName.trim();
                            if (trimmed && !paymentTermsOptions.includes(trimmed)) {
                              setPaymentTermsOptions([...paymentTermsOptions, trimmed]);
                              setNewTermName('');
                            }
                          }
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const trimmed = newTermName.trim();
                          if (trimmed && !paymentTermsOptions.includes(trimmed)) {
                            setPaymentTermsOptions([...paymentTermsOptions, trimmed]);
                            setNewTermName('');
                          }
                        }}
                        className="px-4 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm"
                      >
                        新增
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {paymentTermsOptions.map(term => (
                        <span key={term} className="inline-flex items-center gap-1 px-3 py-1 bg-gray-100 rounded-full text-sm">
                          {term}
                          <button
                            type="button"
                            onClick={() => {
                              setPaymentTermsOptions(paymentTermsOptions.filter(t => t !== term));
                              if (filterData.paymentTerms === term) {
                                setFilterData({ ...filterData, paymentTerms: '' });
                              }
                            }}
                            className="text-red-400 hover:text-red-600 ml-1"
                            title={`刪除「${term}」`}
                          >
                            x
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <button
                  type="button"
                  onClick={fetchUnpaidInvoices}
                  className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
                >
                  查詢未付款發票
                </button>
              </div>

              {/* 未付款發票列表（勾選） */}
              {loadingInvoices ? (
                <div className="text-center py-8 text-gray-500">載入中...</div>
              ) : unpaidInvoices.length > 0 ? (
                <div className="mb-6">
                  <div className="flex justify-between items-center mb-3">
                    <h4 className="text-md font-semibold">請勾選要支付的發票（共 {unpaidInvoices.length} 張）</h4>
                    <button
                      type="button"
                      onClick={handleSelectAll}
                      className="text-sm text-indigo-600 hover:underline"
                    >
                      {selectedInvoiceIds.size === unpaidInvoices.length ? '取消全選' : '全選'}
                    </button>
                  </div>
                  <div className="border rounded-lg overflow-hidden">
                    <table className="w-full">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-3 py-2 text-left text-sm font-medium text-gray-700 w-12">
                            <input
                              type="checkbox"
                              checked={selectedInvoiceIds.size === unpaidInvoices.length && unpaidInvoices.length > 0}
                              onChange={handleSelectAll}
                              className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                            />
                          </th>
                          <th className="px-3 py-2 text-left text-sm font-medium text-gray-700">館別</th>
                          <th className="px-3 py-2 text-left text-sm font-medium text-gray-700">發票抬頭</th>
                          <th className="px-3 py-2 text-left text-sm font-medium text-gray-700">廠商</th>
                          <th className="px-3 py-2 text-left text-sm font-medium text-gray-700">發票號</th>
                          <th className="px-3 py-2 text-left text-sm font-medium text-gray-700">發票日期</th>
                          <th className="px-3 py-2 text-left text-sm font-medium text-gray-700">總金額</th>
                          <th className="px-3 py-2 text-left text-sm font-medium text-gray-700">操作</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {unpaidInvoices.map((invoice) => {
                          const isSelected = selectedInvoiceIds.has(invoice.id);
                          return (
                            <tr key={invoice.id} className={isSelected ? 'bg-indigo-50' : ''}>
                              <td className="px-3 py-2">
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => handleInvoiceToggle(invoice.id)}
                                  className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                                />
                              </td>
                              <td className="px-3 py-2 text-sm">{invoice.warehouse || '-'}</td>
                              <td className="px-3 py-2 text-sm">{invoice.invoiceTitle || '-'}</td>
                              <td className="px-3 py-2 text-sm">{invoice.supplierName || getSupplierName(invoice.supplierId)}</td>
                              <td className="px-3 py-2 text-sm font-medium">
                                <Link href={`/sales?edit=${invoice.id}`} target="_blank" className="text-indigo-600 hover:underline">
                                  {invoice.invoiceNo || invoice.salesNo}
                                </Link>
                              </td>
                              <td className="px-3 py-2 text-sm">{invoice.invoiceDate || invoice.salesDate}</td>
                              <td className="px-3 py-2 text-sm font-semibold">
                                NT$ {parseFloat(invoice.totalAmount || (invoice.amount || 0) + (invoice.tax || 0)).toFixed(2)}
                              </td>
                              <td className="px-3 py-2 text-sm">
                                <Link href={`/payment-voucher/${invoice.id}`} target="_blank" className="text-green-600 hover:underline text-sm">列印傳票</Link>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  {selectedInvoiceIds.size > 0 && (
                    <div className="mt-4 text-right">
                      <span className="text-sm text-gray-600">已選 {selectedInvoiceIds.size} 張發票，總金額：</span>
                      <span className="text-xl font-bold text-indigo-600 ml-2">NT$ {calculateTotal()}</span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 mb-6">
                  <div className="text-center text-yellow-800">
                    <p className="text-sm font-medium mb-2">尚未查詢或沒有未付款的發票</p>
                    <p className="text-xs text-yellow-600">請先設定篩選條件（可選），然後點擊「查詢未付款發票」按鈕</p>
                  </div>
                </div>
              )}

              {/* 付款資訊 */}
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">付款單號</label>
                  <input type="text" value="自動產生" readOnly disabled className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-100 text-gray-600 cursor-not-allowed" />
                  <p className="text-xs text-gray-500 mt-1">系統自動產生 PAY-YYYYMMDD-XXXX</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    付款方式 *
                    <button type="button" onClick={() => setShowMethodManager(!showMethodManager)} className="ml-2 text-indigo-600 hover:text-indigo-800 text-xs">管理選項</button>
                  </label>
                  <select
                    required
                    value={formData.paymentMethod}
                    onChange={(e) => {
                      const next = e.target.value;
                      if (next === '支票') {
                        const last = getLastCheckValues();
                        if (last) {
                          setFormData(prev => ({
                            ...prev,
                            paymentMethod: next,
                            checkIssueDate: last.checkIssueDate || prev.checkIssueDate,
                            checkDate: last.checkDate || prev.checkDate,
                            checkAccountId: last.checkAccountId || prev.checkAccountId
                          }));
                          return;
                        }
                      }
                      setFormData({ ...formData, paymentMethod: next });
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    {paymentMethodOptions.map(method => (
                      <option key={method} value={method}>{method}</option>
                    ))}
                  </select>
                  {showMethodManager && (
                    <div className="mt-2 bg-gray-50 border border-gray-300 rounded-lg p-3">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-xs font-semibold text-gray-700">管理付款方式選項</span>
                        <button type="button" onClick={() => setShowMethodManager(false)} className="text-gray-400 hover:text-gray-600 text-xs">關閉</button>
                      </div>
                      <div className="flex gap-2 mb-2">
                        <input
                          type="text"
                          value={newMethodName}
                          onChange={(e) => setNewMethodName(e.target.value)}
                          placeholder="輸入新付款方式"
                          className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              const trimmed = newMethodName.trim();
                              if (trimmed && !paymentMethodOptions.includes(trimmed)) {
                                setPaymentMethodOptions([...paymentMethodOptions, trimmed]);
                                setNewMethodName('');
                              }
                            }
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const trimmed = newMethodName.trim();
                            if (trimmed && !paymentMethodOptions.includes(trimmed)) {
                              setPaymentMethodOptions([...paymentMethodOptions, trimmed]);
                              setNewMethodName('');
                            }
                          }}
                          className="px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700 text-sm"
                        >
                          新增
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {paymentMethodOptions.map(method => (
                          <span key={method} className="inline-flex items-center gap-1 px-2 py-0.5 bg-white border rounded-full text-xs">
                            {method}
                            <button
                              type="button"
                              onClick={() => {
                                setPaymentMethodOptions(paymentMethodOptions.filter(m => m !== method));
                                if (formData.paymentMethod === method) {
                                  setFormData({ ...formData, paymentMethod: paymentMethodOptions[0] || '' });
                                }
                              }}
                              className="text-red-400 hover:text-red-600"
                            >
                              x
                            </button>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* 付款資訊欄位 - 依付款方式顯示不同欄位 */}
              <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4 mb-6">
                <h4 className="text-md font-semibold mb-3">
                  付款資訊
                  {formData.paymentMethod === '支票' && (
                    <span className="ml-2 text-sm font-normal text-amber-600">
                      （支票付款將自動建立支票記錄，可至支票管理頁面追蹤）
                    </span>
                  )}
                </h4>

                {formData.paymentMethod === '支票' ? (
                  /* 支票付款：付款(開票)日期、支票日期、支票號碼、開票帳戶、支票金額、會計折讓、備註 */
                  <div className="space-y-4">
                    <p className="text-sm text-amber-700">
                      支票付款將在儲存後自動建立支票記錄，可至
                      <Link href="/checks" className="text-indigo-600 hover:underline font-semibold mx-1">支票管理</Link>
                      頁面追蹤兌現與到期。
                    </p>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">付款(開票)日期 *</label>
                        <input
                          type="date"
                          required
                          value={formData.checkIssueDate}
                          onChange={(e) => setFormData({ ...formData, checkIssueDate: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">支票日期 *</label>
                        <input
                          type="date"
                          required
                          value={formData.checkDate}
                          onChange={(e) => setFormData({ ...formData, checkDate: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">支票號碼 *</label>
                        <input
                          type="text"
                          required
                          value={formData.checkNo}
                          onChange={(e) => setFormData({ ...formData, checkNo: e.target.value })}
                          placeholder="請輸入支票號碼"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">開票帳戶 *</label>
                        <select
                          required
                          value={formData.checkAccountId}
                          onChange={(e) => setFormData({ ...formData, checkAccountId: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        >
                          <option value="">請選擇資金帳戶（開票帳戶）</option>
                          {cashAccounts.map(acc => (
                            <option key={acc.id} value={acc.id}>
                              {acc.name}{acc.warehouse ? ` (${acc.warehouse})` : ''} - {acc.type}
                            </option>
                          ))}
                        </select>
                        <p className="text-xs text-gray-500 mt-1">連動「資金帳戶管理」設定</p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">支票金額 *</label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          required
                          readOnly
                          value={formData.paymentAmount}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50"
                        />
                        {selectedInvoiceIds.size > 0 && (
                          <p className="text-xs text-gray-500 mt-1">
                            已依勾選發票總額 NT$ {calculateTotal()} - 折讓 NT$ {parseFloat(formData.discount || 0).toFixed(2)} 自動帶入
                          </p>
                        )}
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">會計折讓</label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={formData.discount}
                          onChange={(e) => {
                            const discount = e.target.value;
                            const total = parseFloat(calculateTotal()) || 0;
                            const discountNum = parseFloat(discount) || 0;
                            setFormData({
                              ...formData,
                              discount: discount,
                              paymentAmount: (total - discountNum).toFixed(2)
                            });
                          }}
                          placeholder="0.00"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                      </div>
                      <div className="col-span-2">
                        <label className="block text-sm font-medium text-gray-700 mb-1">備註</label>
                        <textarea
                          value={formData.note}
                          onChange={(e) => setFormData({ ...formData, note: e.target.value })}
                          placeholder="輸入備註事項..."
                          rows="2"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                      </div>
                    </div>
                  </div>
                ) : (
                  /* 現金/轉帳/信用卡/員工代墊款/月結：付款日期、付款金額、付款帳戶、會計折讓、備註 */
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">付款日期</label>
                      <input
                        type="date"
                        value={formData.paymentDate}
                        onChange={(e) => setFormData({ ...formData, paymentDate: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">付款帳戶</label>
                      <select
                        value={formData.accountId}
                        onChange={(e) => setFormData({ ...formData, accountId: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      >
                        <option value="">請選擇帳戶</option>
                        {cashAccounts.map(acc => (
                          <option key={acc.id} value={acc.id}>
                            {acc.name}{acc.warehouse ? ` (${acc.warehouse})` : ''} - {acc.type}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">會計折讓</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={formData.discount}
                        onChange={(e) => {
                          const discount = e.target.value;
                          const total = parseFloat(calculateTotal()) || 0;
                          const discountNum = parseFloat(discount) || 0;
                          setFormData({
                            ...formData,
                            discount: discount,
                            paymentAmount: (total - discountNum).toFixed(2)
                          });
                        }}
                        placeholder="0.00"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">付款金額 *</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        required
                        value={formData.paymentAmount}
                        onChange={(e) => setFormData({ ...formData, paymentAmount: e.target.value })}
                        placeholder="0.00"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                      {selectedInvoiceIds.size > 0 && (
                        <p className="text-xs text-gray-500 mt-1">
                          發票總金額 NT$ {calculateTotal()} - 折讓 NT$ {parseFloat(formData.discount || 0).toFixed(2)} = NT$ {(parseFloat(calculateTotal()) - parseFloat(formData.discount || 0)).toFixed(2)}
                        </p>
                      )}
                    </div>
                    {/* 員工代墊款欄位 - 付款方式為員工代付或信用卡時顯示 */}
                    {(formData.paymentMethod === '員工代付' || formData.paymentMethod === '信用卡') && (
                      <div className="col-span-2 bg-purple-50 border border-purple-200 rounded-lg p-3">
                        <div className="text-sm font-medium text-purple-800 mb-2">員工代墊資訊（存檔後自動連動代墊款管理）</div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-medium text-purple-700 mb-1">代墊員工 *</label>
                            <input
                              type="text"
                              value={formData.advancedBy}
                              onChange={(e) => setFormData({ ...formData, advancedBy: e.target.value })}
                              placeholder="員工姓名"
                              className="w-full px-3 py-2 border border-purple-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white text-sm"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-purple-700 mb-1">代墊方式</label>
                            <select
                              value={formData.advancePaymentMethod || formData.paymentMethod}
                              onChange={(e) => setFormData({ ...formData, advancePaymentMethod: e.target.value })}
                              className="w-full px-3 py-2 border border-purple-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white text-sm"
                            >
                              <option value="現金">現金</option>
                              <option value="信用卡">信用卡</option>
                              <option value="其他">其他</option>
                            </select>
                          </div>
                        </div>
                      </div>
                    )}
                    <div className="col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-1">備註</label>
                      <textarea
                        value={formData.note}
                        onChange={(e) => setFormData({ ...formData, note: e.target.value })}
                        placeholder="輸入備註事項..."
                        rows="2"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* 操作按鈕 */}
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddForm(false);
                    setSelectedInvoiceIds(new Set());
                    setUnpaidInvoices([]);
                    setFormSaving(false);
                    resetFilterAndForm();
                  }}
                  className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={selectedInvoiceIds.size === 0 || formSaving}
                  className={`px-6 py-2 rounded-lg ${
                    selectedInvoiceIds.size === 0 || formSaving
                      ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                      : 'bg-indigo-600 text-white hover:bg-indigo-700'
                  }`}
                >
                  {formSaving ? '儲存中…' : '儲存草稿'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* 搜尋篩選 */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">查詢條件</h3>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 items-end">
            <div>
              <label className="block text-xs text-gray-500 mb-1">建立日期起</label>
              <input type="date" value={finSearchDateFrom} onChange={e => setFinSearchDateFrom(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">建立日期迄</label>
              <input type="date" value={finSearchDateTo} onChange={e => setFinSearchDateTo(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">館別</label>
              <select value={finSearchWarehouse} onChange={e => setFinSearchWarehouse(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500">
                <option value="">全部館別</option>
                {[...new Set(orders.map(o => o.warehouse).filter(Boolean))].sort().map(w => <option key={w} value={w}>{w}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">廠商</label>
              <select value={finSearchSupplierId} onChange={e => setFinSearchSupplierId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500">
                <option value="">全部廠商</option>
                {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">付款方式</label>
              <select value={finSearchPaymentMethod} onChange={e => setFinSearchPaymentMethod(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500">
                <option value="">全部方式</option>
                {paymentMethodOptions.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
          </div>
          <div className="flex items-center gap-3 mt-3">
            {(finSearchDateFrom || finSearchDateTo || finSearchWarehouse || finSearchSupplierId || finSearchPaymentMethod) && (
              <button onClick={() => { setFinSearchDateFrom(''); setFinSearchDateTo(''); setFinSearchWarehouse(''); setFinSearchSupplierId(''); setFinSearchPaymentMethod(''); }}
                className="px-3 py-1.5 border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50 text-sm">清除篩選</button>
            )}
            <span className="text-xs text-gray-400">共 {displayOrders.length} 筆 / 總計 {rawDisplayOrders.length} 筆</span>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-4">
          {TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === tab.key
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white text-gray-600 hover:bg-indigo-50 border border-gray-200'
              }`}
            >
              {tab.label} ({tab.count})
            </button>
          ))}
        </div>

        {/* 付款單列表 */}
        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          {/* 批量操作列：草稿/已拒絕 有勾選時顯示 */}
          {selectedOrderIds.size > 0 && (activeTab === 'draft' || activeTab === 'rejected') && (
            <div className="px-4 py-3 bg-indigo-50 border-b border-indigo-200 flex items-center justify-between">
              <span className="text-sm text-indigo-800">
                已勾選 <strong>{selectedOrderIds.size}</strong> 筆付款單
              </span>
              <button
                type="button"
                onClick={handleBatchSubmitToCashier}
                disabled={batchSubmitting}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium disabled:opacity-50"
              >
                {batchSubmitting ? '提交中…' : '批量提交出納'}
              </button>
            </div>
          )}
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                {(activeTab === 'draft' || activeTab === 'rejected') && (
                  <th className="px-3 py-3 text-left text-sm font-medium text-gray-700 w-12">
                    <input
                      type="checkbox"
                      checked={
                        getDisplayOrders().filter(o => o.status === '草稿' || o.status === '已拒絕').length > 0 &&
                        selectedOrderIds.size === getDisplayOrders().filter(o => o.status === '草稿' || o.status === '已拒絕').length
                      }
                      onChange={handleSelectAllOrders}
                      className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                    />
                  </th>
                )}
                <SortableTh label="付款單號" colKey="orderNo" sortKey={finSortKey} sortDir={finSortDir} onSort={toggleFinSort} className="px-4 py-3" />
                <SortableTh label="廠商" colKey="supplierName" sortKey={finSortKey} sortDir={finSortDir} onSort={toggleFinSort} className="px-4 py-3" />
                <SortableTh label="館別" colKey="warehouse" sortKey={finSortKey} sortDir={finSortDir} onSort={toggleFinSort} className="px-4 py-3" />
                <SortableTh label="付款方式" colKey="paymentMethod" sortKey={finSortKey} sortDir={finSortDir} onSort={toggleFinSort} className="px-4 py-3" />
                <SortableTh label="發票數" colKey="invoiceCount" sortKey={finSortKey} sortDir={finSortDir} onSort={toggleFinSort} className="px-4 py-3" />
                <SortableTh label="折讓" colKey="discount" sortKey={finSortKey} sortDir={finSortDir} onSort={toggleFinSort} className="px-4 py-3" align="right" />
                <SortableTh label="淨額" colKey="netAmount" sortKey={finSortKey} sortDir={finSortDir} onSort={toggleFinSort} className="px-4 py-3" align="right" />
                <SortableTh label="狀態" colKey="status" sortKey={finSortKey} sortDir={finSortDir} onSort={toggleFinSort} className="px-4 py-3" />
                <SortableTh label="建立日期" colKey="createdAt" sortKey={finSortKey} sortDir={finSortDir} onSort={toggleFinSort} className="px-4 py-3" />
                <th className="px-4 py-3 text-center text-sm font-medium text-gray-700">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {loading ? (
                <tr>
                  <td colSpan={(activeTab === 'draft' || activeTab === 'rejected') ? 11 : 10} className="px-4 py-8 text-center text-gray-500">載入中...</td>
                </tr>
              ) : displayOrders.length === 0 ? (
                <tr>
                  <td colSpan={(activeTab === 'draft' || activeTab === 'rejected') ? 11 : 10} className="px-4 py-8 text-center text-gray-500">
                    {activeTab === 'draft' ? '目前無草稿付款單' :
                     activeTab === 'pending' ? '目前無待出納的付款單' :
                     activeTab === 'executed' ? '目前無已執行的付款單' :
                     '目前無已拒絕的付款單'}
                  </td>
                </tr>
              ) : (
                sortedDisplayOrders.map((order, index) => {
                  const invoiceIds = getInvoicesForOrder(order);
                  const isExpanded = expandedOrders.has(order.id);
                  return (
                    <Fragment key={order.id}>
                      <tr className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-indigo-50 transition-colors`}>
                        {(activeTab === 'draft' || activeTab === 'rejected') && (
                          <td className="px-3 py-3">
                            {(order.status === '草稿' || order.status === '已拒絕') ? (
                              <input
                                type="checkbox"
                                checked={selectedOrderIds.has(order.id)}
                                onChange={() => handleOrderToggle(order.id)}
                                className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                              />
                            ) : (
                              <span className="w-4 inline-block" />
                            )}
                          </td>
                        )}
                        <td className="px-4 py-3 text-sm font-medium text-indigo-700">{order.orderNo}</td>
                        <td className="px-4 py-3 text-sm">{order.supplierName || '-'}</td>
                        <td className="px-4 py-3 text-sm">{order.warehouse || '-'}</td>
                        <td className="px-4 py-3 text-sm">{order.paymentMethod}</td>
                        <td className="px-4 py-3 text-sm">{invoiceIds.length} 張</td>
                        <td className="px-4 py-3 text-sm text-right">{order.discount > 0 ? `NT$ ${Number(order.discount).toLocaleString()}` : '-'}</td>
                        <td className="px-4 py-3 text-sm text-right font-semibold">NT$ {Number(order.netAmount).toLocaleString()}</td>
                        <td className="px-4 py-3 text-sm">
                          <span className={`px-2 py-0.5 rounded text-xs ${getStatusBadge(order.status)}`}>
                            {order.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-500">
                          {new Date(order.createdAt).toLocaleDateString('zh-TW')}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <div className="flex flex-wrap gap-1 justify-center">
                            <button
                              onClick={() => handleViewDetails(order.id)}
                              className="text-indigo-600 hover:underline text-xs"
                            >
                              {isExpanded ? '收起' : '查看'}
                            </button>
                            {order.status === '草稿' && isLoggedIn && (
                              <>
                                <button
                                  onClick={() => handleSubmitToCashier(order.id)}
                                  disabled={submittingOrderId === order.id}
                                  className="bg-yellow-500 text-white px-2 py-0.5 rounded text-xs hover:bg-yellow-600 disabled:opacity-50"
                                >
                                  {submittingOrderId === order.id ? '提交中…' : '提交出納'}
                                </button>
                                <button
                                  onClick={() => handleVoid(order.id)}
                                  className="text-gray-500 hover:underline text-xs"
                                >
                                  作廢
                                </button>
                                <button
                                  onClick={() => handleDelete(order.id)}
                                  className="text-red-600 hover:underline text-xs"
                                >
                                  刪除
                                </button>
                              </>
                            )}
                            {order.status === '待出納' && isLoggedIn && (
                              <button
                                onClick={() => handleVoid(order.id)}
                                className="text-gray-500 hover:underline text-xs"
                              >
                                作廢
                              </button>
                            )}
                            {order.status === '待出納' && order.rejectedAt && isLoggedIn && (
                              <span className="text-xs text-amber-700 bg-amber-50 px-2 py-0.5 rounded">曾被退回，請修改後重新送出</span>
                            )}
                            {order.status === '已拒絕' && isLoggedIn && (
                              <>
                                <button
                                  onClick={() => handleResubmit(order.id)}
                                  disabled={submittingOrderId === order.id}
                                  className="bg-yellow-500 text-white px-2 py-0.5 rounded text-xs hover:bg-yellow-600 disabled:opacity-50"
                                >
                                  {submittingOrderId === order.id ? '提交中…' : '重新提交'}
                                </button>
                                <button
                                  onClick={() => handleVoid(order.id)}
                                  className="text-gray-500 hover:underline text-xs"
                                >
                                  作廢
                                </button>
                                <button
                                  onClick={() => handleDelete(order.id)}
                                  className="text-red-600 hover:underline text-xs"
                                >
                                  刪除
                                </button>
                              </>
                            )}
                            {order.status === '已執行' && order.executions?.[0] && (
                              <span className="text-xs text-gray-500">{order.executions[0].executionNo}</span>
                            )}
                          </div>
                        </td>
                      </tr>
                      {/* 展開的詳細資訊 */}
                      {isExpanded && (
                        <tr className="bg-indigo-50">
                          <td colSpan={(activeTab === 'draft' || activeTab === 'rejected') ? 11 : 10} className="px-4 py-4">
                            <div className="space-y-4">
                              {/* 曾被出納退回（待出納但 rejectedAt 有值）：請修改後重新送出 */}
                              {order.status === '待出納' && order.rejectedAt && (
                                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                                  <div className="text-sm font-semibold text-amber-800 mb-1">曾被出納退回</div>
                                  <div className="text-sm text-amber-700">{order.rejectedReason || '（未填原因）'}</div>
                                  {order.rejectedBy && (
                                    <div className="text-xs text-amber-600 mt-1">退回人：{order.rejectedBy} | {order.rejectedAt ? new Date(order.rejectedAt).toLocaleString('zh-TW') : ''}</div>
                                  )}
                                  <p className="text-xs text-amber-600 mt-2">請修改資料正確後，存檔即會回到出納待執行列表。</p>
                                </div>
                              )}
                              {/* 拒絕原因（已拒絕狀態，若有） */}
                              {order.status === '已拒絕' && order.rejectedReason && (
                                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                                  <div className="text-sm font-semibold text-red-700 mb-1">退回原因</div>
                                  <div className="text-sm text-red-600">{order.rejectedReason}</div>
                                  {order.rejectedBy && (
                                    <div className="text-xs text-red-400 mt-1">退回人：{order.rejectedBy} | {order.rejectedAt ? new Date(order.rejectedAt).toLocaleString('zh-TW') : ''}</div>
                                  )}
                                </div>
                              )}

                              {/* 追蹤鏈 (traceability chain) - 顯示於已執行的付款單 */}
                              {order.status === '已執行' && order.executions?.length > 0 && (
                                <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                                  <div className="text-sm font-semibold text-green-700 mb-2">追蹤鏈</div>
                                  <div className="flex items-center gap-2 flex-wrap text-sm">
                                    <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs">
                                      發票: {getInvoicesForOrder(order).map(id => {
                                        const inv = getInvoiceDetails(id);
                                        return inv ? (inv.invoiceNo || inv.salesNo || `#${id}`) : `#${id}`;
                                      }).join(', ')}
                                    </span>
                                    <span className="text-gray-400">-&gt;</span>
                                    <span className="bg-indigo-100 text-indigo-800 px-2 py-1 rounded text-xs">
                                      付款單: {order.orderNo}
                                    </span>
                                    <span className="text-gray-400">-&gt;</span>
                                    <span className="bg-amber-100 text-amber-800 px-2 py-1 rounded text-xs">
                                      出納單: {order.executions[0].executionNo}
                                    </span>
                                    {order.executions[0].cashTransactionId && (
                                      <>
                                        <span className="text-gray-400">-&gt;</span>
                                        <span className="bg-emerald-100 text-emerald-800 px-2 py-1 rounded text-xs">
                                          現金流: CF-{order.executions[0].cashTransactionId}
                                        </span>
                                      </>
                                    )}
                                  </div>
                                </div>
                              )}

                              {/* 付款基本資訊 */}
                              <div className="grid grid-cols-2 md:grid-cols-5 gap-4 pb-4 border-b border-gray-300">
                                <div>
                                  <div className="text-xs text-gray-500 mb-1">付款單號</div>
                                  <div className="text-sm font-semibold">{order.orderNo}</div>
                                </div>
                                <div>
                                  <div className="text-xs text-gray-500 mb-1">廠商</div>
                                  <div className="text-sm font-semibold">{order.supplierName || '-'}</div>
                                </div>
                                <div>
                                  <div className="text-xs text-gray-500 mb-1">付款方式</div>
                                  <div className="text-sm font-semibold">{order.paymentMethod}</div>
                                </div>
                                <div>
                                  <div className="text-xs text-gray-500 mb-1">發票數量</div>
                                  <div className="text-sm font-semibold">{invoiceIds.length} 張</div>
                                </div>
                                <div>
                                  <div className="text-xs text-gray-500 mb-1">狀態</div>
                                  <span className={`px-2 py-0.5 rounded text-xs ${getStatusBadge(order.status)}`}>
                                    {order.status}
                                  </span>
                                </div>
                              </div>

                              {/* 金額資訊 */}
                              <div className="pb-4 border-b border-gray-300">
                                <div className="grid grid-cols-3 gap-4">
                                  <div>
                                    <div className="text-xs text-gray-500 mb-1">發票總額</div>
                                    <div className="text-lg font-semibold">
                                      NT$ {Number(order.amount).toLocaleString()}
                                    </div>
                                  </div>
                                  <div>
                                    <div className="text-xs text-gray-500 mb-1">會計折讓</div>
                                    <div className="text-lg font-semibold">
                                      {order.discount > 0 ? `NT$ ${Number(order.discount).toLocaleString()}` : '-'}
                                    </div>
                                  </div>
                                  <div>
                                    <div className="text-xs text-gray-500 mb-1">應付淨額</div>
                                    <div className="text-2xl font-bold text-indigo-600">
                                      NT$ {Number(order.netAmount).toLocaleString()}
                                    </div>
                                  </div>
                                </div>
                              </div>

                              {/* 付款資訊 */}
                              <div className="pb-4 border-b border-gray-300">
                                <div className="text-sm font-semibold mb-3 text-gray-700">付款資訊</div>
                                {order.paymentMethod === '支票' ? (
                                  <div className="bg-amber-50 border border-amber-200 rounded p-3">
                                    <p className="text-sm text-amber-700">
                                      支票付款 — 請至
                                      <Link href="/checks" className="text-indigo-600 hover:underline font-semibold mx-1">支票管理</Link>
                                      頁面查看支票詳情與兌現狀態
                                    </p>
                                    {order.checkNo && (
                                      <p className="text-sm text-gray-600 mt-1">關聯支票號碼：{order.checkNo}</p>
                                    )}
                                  </div>
                                ) : (
                                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                    {order.dueDate && (
                                      <div>
                                        <div className="text-xs text-gray-500 mb-1">付款日期</div>
                                        <div className="text-sm font-semibold">{order.dueDate}</div>
                                      </div>
                                    )}
                                    {order.accountId && (
                                      <div>
                                        <div className="text-xs text-gray-500 mb-1">付款帳戶</div>
                                        <div className="text-sm font-semibold">
                                          {(() => {
                                            const acc = cashAccounts.find(a => a.id === order.accountId);
                                            return acc ? `${acc.name}${acc.warehouse ? ` (${acc.warehouse})` : ''}` : `帳戶 #${order.accountId}`;
                                          })()}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                )}
                                {order.note && (
                                  <div className="mt-3">
                                    <div className="text-xs text-gray-500 mb-1">備註</div>
                                    <div className="text-sm">{order.note}</div>
                                  </div>
                                )}
                              </div>

                              {/* 出納執行資訊 */}
                              {order.executions?.length > 0 && (
                                <div className="pb-4 border-b border-gray-300">
                                  <div className="text-sm font-semibold mb-3 text-gray-700">出納執行記錄</div>
                                  {order.executions.map(exec => (
                                    <div key={exec.id} className="bg-white rounded border p-3 text-sm">
                                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                        <div>
                                          <div className="text-xs text-gray-500">執行單號</div>
                                          <div className="font-medium">{exec.executionNo}</div>
                                        </div>
                                        <div>
                                          <div className="text-xs text-gray-500">執行日期</div>
                                          <div>{exec.executionDate}</div>
                                        </div>
                                        <div>
                                          <div className="text-xs text-gray-500">實付金額</div>
                                          <div className="font-medium">NT$ {Number(exec.actualAmount).toLocaleString()}</div>
                                        </div>
                                        <div>
                                          <div className="text-xs text-gray-500">執行人</div>
                                          <div>{exec.executedBy || '-'}</div>
                                        </div>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}

                              {/* 支付發票列表 */}
                              {invoiceIds.length > 0 && (
                                <div>
                                  <div className="flex justify-between items-center mb-3">
                                    <div className="text-sm font-semibold text-gray-700">支付的發票詳情（共 {invoiceIds.length} 張）</div>
                                    <div className="flex gap-2">
                                      <Link
                                        href={`/payment-voucher/${order.id}`}
                                        target="_blank"
                                        className="text-xs bg-indigo-600 text-white px-2 py-1 rounded hover:bg-indigo-700"
                                      >
                                        列印傳票
                                      </Link>
                                    </div>
                                  </div>
                                  <div className="border rounded-lg overflow-hidden">
                                    <table className="w-full text-sm">
                                      <thead className="bg-gray-100">
                                        <tr>
                                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-700">序號</th>
                                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-700">發票號</th>
                                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-700">發票日期</th>
                                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-700">廠商</th>
                                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-700">管別</th>
                                          <th className="px-3 py-2 text-right text-xs font-medium text-gray-700">小計</th>
                                          <th className="px-3 py-2 text-right text-xs font-medium text-gray-700">稅額</th>
                                          <th className="px-3 py-2 text-right text-xs font-medium text-gray-700">總金額</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-gray-200 bg-white">
                                        {invoiceIds.map((invoiceId, idx) => {
                                          const invoice = getInvoiceDetails(invoiceId);
                                          if (!invoice) {
                                            return (
                                              <tr key={idx} className="hover:bg-gray-50">
                                                <td colSpan="8" className="px-3 py-2 text-gray-500 text-center">
                                                  發票 ID {invoiceId} 不存在
                                                </td>
                                              </tr>
                                            );
                                          }
                                          const amount = parseFloat(invoice.amount || 0);
                                          const tax = parseFloat(invoice.tax || 0);
                                          const totalAmount = parseFloat(invoice.totalAmount || amount + tax);

                                          let supplierId = invoice.supplierId || null;
                                          let warehouse = invoice.warehouse || '-';

                                          if (!supplierId && invoice.items && invoice.items.length > 0) {
                                            supplierId = invoice.items[0].supplierId;
                                          }

                                          const supplierName = supplierId ? getSupplierName(supplierId) : '未知廠商';

                                          return (
                                            <tr key={idx} className="hover:bg-gray-50">
                                              <td className="px-3 py-2 text-gray-600">{idx + 1}</td>
                                              <td className="px-3 py-2 font-medium">{invoice.invoiceNo || invoice.salesNo || '-'}</td>
                                              <td className="px-3 py-2 text-gray-600">{invoice.invoiceDate || invoice.salesDate || '-'}</td>
                                              <td className="px-3 py-2">{supplierName}</td>
                                              <td className="px-3 py-2">{warehouse}</td>
                                              <td className="px-3 py-2 text-right">NT$ {amount.toFixed(2)}</td>
                                              <td className="px-3 py-2 text-right">NT$ {tax.toFixed(2)}</td>
                                              <td className="px-3 py-2 text-right font-semibold">NT$ {totalAmount.toFixed(2)}</td>
                                            </tr>
                                          );
                                        })}
                                        {/* 總計列 */}
                                        <tr className="bg-gray-100 font-semibold">
                                          <td colSpan="5" className="px-3 py-2 text-right">總計：</td>
                                          <td className="px-3 py-2 text-right">
                                            NT$ {invoiceIds.reduce((sum, invoiceId) => {
                                              const invoice = getInvoiceDetails(invoiceId);
                                              if (!invoice) return sum;
                                              return sum + parseFloat(invoice.amount || 0);
                                            }, 0).toFixed(2)}
                                          </td>
                                          <td className="px-3 py-2 text-right">
                                            NT$ {invoiceIds.reduce((sum, invoiceId) => {
                                              const invoice = getInvoiceDetails(invoiceId);
                                              if (!invoice) return sum;
                                              return sum + parseFloat(invoice.tax || 0);
                                            }, 0).toFixed(2)}
                                          </td>
                                          <td className="px-3 py-2 text-right text-indigo-600">
                                            NT$ {Number(order.netAmount).toLocaleString()}
                                          </td>
                                        </tr>
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
      </main>

      {/* 按館別列印草稿報表 Modal */}
      {showWarehouseReportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 no-print-finance" onClick={() => setShowWarehouseReportModal(false)}>
          <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto no-print-finance" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-bold text-gray-800">付款單草稿報表（按付款單的館別列印）</h3>
              <button type="button" onClick={() => setShowWarehouseReportModal(false)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
            </div>
            <div className="px-6 py-4 space-y-4">
              <p className="text-sm text-gray-600">每月進銷存費用之付款單草稿，可依館別篩選後列印，供飯店會計使用。</p>
              <div className="flex flex-wrap items-end gap-4">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">報表月份</label>
                  <input type="month" value={reportMonth} onChange={e => setReportMonth(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">館別</label>
                  <select value={reportWarehouse} onChange={e => setReportWarehouse(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm min-w-[180px]">
                    {warehouseOptionsForReport.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                {Object.keys(reportOrdersByWarehouse).length === 0 ? (
                  <div className="px-4 py-8 text-center text-gray-500 text-sm">該月份無草稿付款單，或請選擇其他館別。</div>
                ) : (
                  Object.entries(reportOrdersByWarehouse).map(([whKey, list]) => {
                    const whLabel = whKey === '__none__' ? '未指定館別' : whKey;
                    const total = list.reduce((s, o) => s + Number(o.netAmount || 0), 0);
                    return (
                      <div key={whKey} className="mb-6 last:mb-0">
                        <div className="bg-gray-100 px-4 py-2 font-semibold text-gray-800 border-b border-gray-200">館別：{whLabel}（共 {list.length} 筆，淨額合計 NT$ {total.toLocaleString()}）</div>
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="bg-gray-50">
                              <th className="px-3 py-2 text-left">序號</th>
                              <th className="px-3 py-2 text-left">付款單號</th>
                              <th className="px-3 py-2 text-left">銷帳年月</th>
                              <th className="px-3 py-2 text-left">廠商</th>
                              <th className="px-3 py-2 text-left">付款方式</th>
                              <th className="px-3 py-2 text-right">發票數</th>
                              <th className="px-3 py-2 text-right">折讓</th>
                              <th className="px-3 py-2 text-right">淨額</th>
                              <th className="px-3 py-2 text-left">建立日期</th>
                              <th className="px-3 py-2 text-left">備註</th>
                            </tr>
                          </thead>
                          <tbody>
                            {list.map((o, idx) => {
                              const invCount = getInvoicesForOrder(o).length;
                              return (
                                <tr key={o.id} className="border-t border-gray-100">
                                  <td className="px-3 py-2 text-gray-600">{idx + 1}</td>
                                  <td className="px-3 py-2 font-medium text-indigo-700">{o.orderNo}</td>
                                  <td className="px-3 py-2 text-gray-600">{reportMonth || '－'}</td>
                                  <td className="px-3 py-2">{o.supplierName || '-'}</td>
                                  <td className="px-3 py-2">{o.paymentMethod}</td>
                                  <td className="px-3 py-2 text-right">{invCount} 張</td>
                                  <td className="px-3 py-2 text-right">{Number(o.discount) > 0 ? `NT$ ${Number(o.discount).toLocaleString()}` : '-'}</td>
                                  <td className="px-3 py-2 text-right font-semibold">NT$ {Number(o.netAmount).toLocaleString()}</td>
                                  <td className="px-3 py-2 text-gray-500">{o.createdAt ? new Date(o.createdAt).toLocaleDateString('zh-TW') : '-'}</td>
                                  <td className="px-3 py-2 text-gray-500 max-w-[120px] truncate" title={o.note || ''}>{o.note || '－'}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    );
                  })
                )}
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowWarehouseReportModal(false)} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">關閉</button>
                <button type="button" onClick={() => window.print()} className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">列印</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 列印時只顯示此區塊 */}
      {showWarehouseReportModal && (
        <div id="finance-warehouse-report-print-root" className="fixed -left-[9999px] top-0 w-screen bg-white p-8" aria-hidden="true">
          <h1 className="text-xl font-bold text-gray-800 mb-2">付款單草稿報表（按付款單的館別）</h1>
          <p className="text-sm text-gray-500 mb-4">報表月份：{reportMonth}　列印日期：{new Date().toLocaleDateString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</p>
          <p className="text-sm text-gray-600 mb-4">每月進銷存費用之付款單草稿，依館別列示。</p>
          {Object.keys(reportOrdersByWarehouse).length === 0 ? (
            <p className="text-sm text-gray-500">該月份無草稿付款單。</p>
          ) : (
            Object.entries(reportOrdersByWarehouse).map(([whKey, list]) => {
              const whLabel = whKey === '__none__' ? '未指定館別' : whKey;
              const total = list.reduce((s, o) => s + Number(o.netAmount || 0), 0);
              return (
                <div key={whKey} className="mb-6 break-inside-avoid">
                  <h2 className="text-base font-bold text-gray-800 mt-4 mb-2 border-b border-gray-300 pb-1">館別：{whLabel}（共 {list.length} 筆，淨額合計 NT$ {total.toLocaleString()}）</h2>
                  <table className="w-full text-sm border border-gray-300">
                    <thead>
                      <tr className="bg-gray-100">
                        <th className="px-3 py-2 text-left border border-gray-300">序號</th>
                        <th className="px-3 py-2 text-left border border-gray-300">付款單號</th>
                        <th className="px-3 py-2 text-left border border-gray-300">銷帳年月</th>
                        <th className="px-3 py-2 text-left border border-gray-300">廠商</th>
                        <th className="px-3 py-2 text-left border border-gray-300">付款方式</th>
                        <th className="px-3 py-2 text-right border border-gray-300">發票數</th>
                        <th className="px-3 py-2 text-right border border-gray-300">折讓</th>
                        <th className="px-3 py-2 text-right border border-gray-300">淨額</th>
                        <th className="px-3 py-2 text-left border border-gray-300">建立日期</th>
                        <th className="px-3 py-2 text-left border border-gray-300">備註</th>
                      </tr>
                    </thead>
                    <tbody>
                      {list.map((o, idx) => {
                        const invCount = getInvoicesForOrder(o).length;
                        return (
                          <tr key={o.id}>
                            <td className="px-3 py-2 border border-gray-300 text-gray-600">{idx + 1}</td>
                            <td className="px-3 py-2 border border-gray-300 font-medium">{o.orderNo}</td>
                            <td className="px-3 py-2 border border-gray-300">{reportMonth || '－'}</td>
                            <td className="px-3 py-2 border border-gray-300">{o.supplierName || '-'}</td>
                            <td className="px-3 py-2 border border-gray-300">{o.paymentMethod}</td>
                            <td className="px-3 py-2 border border-gray-300 text-right">{invCount} 張</td>
                            <td className="px-3 py-2 border border-gray-300 text-right">{Number(o.discount) > 0 ? `NT$ ${Number(o.discount).toLocaleString()}` : '-'}</td>
                            <td className="px-3 py-2 border border-gray-300 text-right font-semibold">NT$ {Number(o.netAmount).toLocaleString()}</td>
                            <td className="px-3 py-2 border border-gray-300 text-gray-500">{o.createdAt ? new Date(o.createdAt).toLocaleDateString('zh-TW') : '-'}</td>
                            <td className="px-3 py-2 border border-gray-300 text-gray-500">{o.note || '－'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* 按進貨單的館別列印 Modal */}
      {showPurchaseReportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 no-print-finance" onClick={() => setShowPurchaseReportModal(false)}>
          <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto no-print-finance" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-bold text-gray-800">付款單報表（按進貨單的館別列印）</h3>
              <button type="button" onClick={() => setShowPurchaseReportModal(false)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
            </div>
            <div className="px-6 py-4 space-y-4">
              <p className="text-sm text-gray-600">依進貨單的館別查詢對應的付款單，可用日期區間、館別、廠商篩選後列印。</p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">進貨日期起</label>
                  <input type="date" value={purchaseReportDateFrom} onChange={e => { setPurchaseReportDateFrom(e.target.value); if (e.target.value) setPurchaseReportMonth(''); }} className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">進貨日期迄</label>
                  <input type="date" value={purchaseReportDateTo} onChange={e => { setPurchaseReportDateTo(e.target.value); if (e.target.value) setPurchaseReportMonth(''); }} className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">或選擇月份</label>
                  <input type="month" value={purchaseReportMonth} onChange={e => { setPurchaseReportMonth(e.target.value); if (e.target.value) { setPurchaseReportDateFrom(''); setPurchaseReportDateTo(''); } }} className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">進貨館別</label>
                  <select value={purchaseReportWarehouse} onChange={e => setPurchaseReportWarehouse(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm">
                    <option value="">全部館別</option>
                    <option value="麗格">麗格</option>
                    <option value="麗軒">麗軒</option>
                    <option value="民宿">民宿</option>
                    <option value="慶豐">慶豐</option>
                    <option value="自在海">自在海</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">廠商</label>
                  <select value={purchaseReportSupplierId} onChange={e => setPurchaseReportSupplierId(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm">
                    <option value="">全部廠商</option>
                    {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div className="flex items-end">
                  <button
                    type="button"
                    onClick={fetchPurchaseReport}
                    disabled={purchaseReportLoading}
                    className="px-4 py-1.5 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 disabled:opacity-50 w-full"
                  >
                    {purchaseReportLoading ? '查詢中...' : '查詢'}
                  </button>
                </div>
              </div>
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                {!purchaseReportData ? (
                  <div className="px-4 py-8 text-center text-gray-400 text-sm">請選擇月份後按「查詢」。</div>
                ) : purchaseReportData.error ? (
                  <div className="px-4 py-8 text-center text-red-500 text-sm">{purchaseReportData.error}</div>
                ) : Object.keys(purchaseReportData.groups || {}).length === 0 ? (
                  <div className="px-4 py-8 text-center text-gray-500 text-sm">該月份無對應進貨資料。</div>
                ) : (
                  Object.entries(purchaseReportData.groups).map(([whKey, list]) => {
                    const total = list.reduce((s, o) => s + Number(o.netAmount || 0), 0);
                    return (
                      <div key={whKey} className="mb-6 last:mb-0">
                        <div className="bg-green-50 px-4 py-2 font-semibold text-gray-800 border-b border-gray-200">進貨館別：{whKey}（共 {list.length} 筆，淨額合計 NT$ {total.toLocaleString()}）</div>
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="bg-gray-50">
                              <th className="px-3 py-2 text-left">序號</th>
                              <th className="px-3 py-2 text-left">付款單號</th>
                              <th className="px-3 py-2 text-left">廠商</th>
                              <th className="px-3 py-2 text-left">付款單館別</th>
                              <th className="px-3 py-2 text-left">付款方式</th>
                              <th className="px-3 py-2 text-right">淨額</th>
                              <th className="px-3 py-2 text-left">進貨單號</th>
                              <th className="px-3 py-2 text-left">備註</th>
                            </tr>
                          </thead>
                          <tbody>
                            {list.map((o, idx) => (
                              <tr key={o.id} className="border-t border-gray-100">
                                <td className="px-3 py-2 text-gray-600">{idx + 1}</td>
                                <td className="px-3 py-2 font-medium text-indigo-700">{o.orderNo}</td>
                                <td className="px-3 py-2">{o.supplierName || '-'}</td>
                                <td className="px-3 py-2">{o.warehouse || '-'}</td>
                                <td className="px-3 py-2">{o.paymentMethod}</td>
                                <td className="px-3 py-2 text-right font-semibold">NT$ {Number(o.netAmount).toLocaleString()}</td>
                                <td className="px-3 py-2 text-gray-600">{o.purchaseNo || '-'}</td>
                                <td className="px-3 py-2 text-gray-500 max-w-[120px] truncate" title={o.note || ''}>{o.note || '－'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    );
                  })
                )}
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowPurchaseReportModal(false)} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">關閉</button>
                {purchaseReportData && !purchaseReportData.error && Object.keys(purchaseReportData.groups || {}).length > 0 && (
                  <button type="button" onClick={() => window.print()} className="px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700">列印</button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 按進貨單的館別列印 — 列印區域 */}
      {showPurchaseReportModal && purchaseReportData && !purchaseReportData.error && (
        <div id="finance-warehouse-report-print-root" className="fixed -left-[9999px] top-0 w-screen bg-white p-8" aria-hidden="true">
          <h1 className="text-xl font-bold text-gray-800 mb-2">付款單報表（按進貨單的館別）</h1>
          <p className="text-sm text-gray-500 mb-4">進貨月份：{purchaseReportMonth}　館別：{purchaseReportWarehouse || '全部'}　列印日期：{new Date().toLocaleDateString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</p>
          {Object.entries(purchaseReportData.groups || {}).map(([whKey, list]) => {
            const total = list.reduce((s, o) => s + Number(o.netAmount || 0), 0);
            return (
              <div key={whKey} className="mb-6 break-inside-avoid">
                <h2 className="text-base font-bold text-gray-800 mt-4 mb-2 border-b border-gray-300 pb-1">進貨館別：{whKey}（共 {list.length} 筆，淨額合計 NT$ {total.toLocaleString()}）</h2>
                <table className="w-full text-sm border border-gray-300">
                  <thead>
                    <tr className="bg-gray-100">
                      <th className="px-3 py-2 text-left border border-gray-300">序號</th>
                      <th className="px-3 py-2 text-left border border-gray-300">付款單號</th>
                      <th className="px-3 py-2 text-left border border-gray-300">廠商</th>
                      <th className="px-3 py-2 text-left border border-gray-300">付款單館別</th>
                      <th className="px-3 py-2 text-left border border-gray-300">付款方式</th>
                      <th className="px-3 py-2 text-right border border-gray-300">淨額</th>
                      <th className="px-3 py-2 text-left border border-gray-300">進貨單號</th>
                      <th className="px-3 py-2 text-left border border-gray-300">備註</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((o, idx) => (
                      <tr key={o.id}>
                        <td className="px-3 py-2 border border-gray-300 text-gray-600">{idx + 1}</td>
                        <td className="px-3 py-2 border border-gray-300 font-medium">{o.orderNo}</td>
                        <td className="px-3 py-2 border border-gray-300">{o.supplierName || '-'}</td>
                        <td className="px-3 py-2 border border-gray-300">{o.warehouse || '-'}</td>
                        <td className="px-3 py-2 border border-gray-300">{o.paymentMethod}</td>
                        <td className="px-3 py-2 border border-gray-300 text-right font-semibold">NT$ {Number(o.netAmount).toLocaleString()}</td>
                        <td className="px-3 py-2 border border-gray-300 text-gray-600">{o.purchaseNo || '-'}</td>
                        <td className="px-3 py-2 border border-gray-300 text-gray-500">{o.note || '－'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
