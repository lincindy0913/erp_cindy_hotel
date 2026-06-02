'use client';

import { useState, useEffect, Suspense, useMemo } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import Navigation from '@/components/Navigation';
import { useToast } from '@/context/ToastContext';
import { useConfirm } from '@/context/ConfirmContext';
import { sortRows, useColumnSort } from '@/components/SortableTh';
import { hasPermission, PERMISSIONS } from '@/lib/permissions';
import OwnerExpensesPanel from '@/components/owner-expenses/OwnerExpensesPanel';
import { todayStr } from '@/lib/localDate';
import ReportView from './_sections/ReportView';
import MonthlyView from './_sections/MonthlyView';
import ListView from './_sections/ListView';

const SALES_VIEWS = ['list', 'report', 'monthly', 'owner-monthly'];

function InvoicePageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const { showToast } = useToast();
  const confirm = useConfirm();
  const userPermissions = session?.user?.permissions || [];
  const isAdmin = session?.user?.role === 'admin';
  const canSalesView =
    isAdmin || userPermissions.includes('*') || hasPermission(userPermissions, PERMISSIONS.SALES_VIEW);
  const canOwnerExpense =
    isAdmin || userPermissions.includes('*') || hasPermission(userPermissions, PERMISSIONS.OWNER_EXPENSE_VIEW);
  const isLoggedIn = !!session;
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState(null);
  const [products, setProducts] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [selectedItems, setSelectedItems] = useState([]); // 勾選的品項
  const [availableItems, setAvailableItems] = useState([]); // 可選的未核銷品項
  const [invoices, setInvoices] = useState([]);
  const [allowances, setAllowances] = useState([]); // 已確認的進貨折讓
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
  const [searchInvoiceType, setSearchInvoiceType] = useState('');

  // 報表 view 篩選
  const [reportDateFrom, setReportDateFrom] = useState('');
  const [reportDateTo, setReportDateTo] = useState('');
  const [reportTitle, setReportTitle] = useState('');
  const [reportWarehouse, setReportWarehouse] = useState('');
  const [reportType, setReportType] = useState('');
  const [reportOwnerData, setReportOwnerData] = useState({ total: 0, count: 0 });

  // 業主發票私帳 — 個別登錄
  const [privateInvoices, setPrivateInvoices] = useState([]);
  const [privateLoading, setPrivateLoading] = useState(false);
  const [showPrivateForm, setShowPrivateForm] = useState(false);
  const [editingPrivateId, setEditingPrivateId] = useState(null);
  const [privateForm, setPrivateForm] = useState({
    invoiceDate: todayStr(),
    invoiceNo: '',
    invoiceTitle: '',
    totalAmount: '',
    note: '',
    warehouse: '',
  });
  const [privateSaving, setPrivateSaving] = useState(false);

  // 新增折讓發票表單
  const [showAddAllowanceForm, setShowAddAllowanceForm] = useState(false);
  const [allowanceSaving, setAllowanceSaving] = useState(false);
  const [allowanceFormData, setAllowanceFormData] = useState({
    allowanceDate: todayStr(),
    warehouse: '',
    supplierName: '',
    invoiceNo: '',
    amount: '',
    tax: '0',
    totalAmount: '',
    reason: '',
    note: '',
  });

  const INVOICE_SOURCES = ['進貨單', '租屋支出', '固定費用'];
  const SOURCE_COLORS = {
    '進貨單':      { bg: 'bg-gray-100',   text: 'text-gray-700',   border: 'border-gray-300',   dot: 'bg-gray-400'   },
    '租屋支出':    { bg: 'bg-purple-100', text: 'text-purple-800', border: 'border-purple-300', dot: 'bg-purple-400' },
    '業主發票私帳': { bg: 'bg-orange-100', text: 'text-orange-800', border: 'border-orange-300', dot: 'bg-orange-400' },
    '固定費用':    { bg: 'bg-blue-100',   text: 'text-blue-800',   border: 'border-blue-300',   dot: 'bg-blue-400'   },
  };

  // 勾選發票（列印用）
  const [checkedInvoiceIds, setCheckedInvoiceIds] = useState(new Set());

  // 發票列表分頁
  const [invoicePage, setInvoicePage] = useState(1);
  const [invoiceTotalPages, setInvoiceTotalPages] = useState(1);
  const [invoiceTotal, setInvoiceTotal] = useState(0);
  const invoicePageSize = 50;

  // 分頁：發票列表 / 發票私帳 / 報表 / 月度統計（與網址 ?view= 同步）
  const [activeView, setActiveView] = useState('list');
  const [statsStartMonth, setStatsStartMonth] = useState(() => `${new Date().getFullYear()}-01`);
  const [statsEndMonth,   setStatsEndMonth]   = useState(() => todayStr().slice(0, 7));
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
    invoiceDate: todayStr(),
    invoiceTitle: '', // 發票抬頭
    invoiceType: '進貨單', // 發票類型
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
    fetchAllowances();
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
    if (activeView === 'monthly' && canSalesView) fetchMonthlyStats();
  }, [activeView, canSalesView]);

  function goSalesView(next) {
    if (next === 'owner-monthly') {
      if (!canSalesView && !canOwnerExpense) return;
    } else if (!canSalesView) {
      return;
    }
    setActiveView(next);
    const p = new URLSearchParams(searchParams.toString());
    p.set('view', next);
    p.delete('sub');
    router.replace(`/sales?${p.toString()}`, { scroll: false });
  }

  /** 報表頁內子分頁：進項報表彙總 / 業主私帳登錄 / 業主私帳月結 */
  function goReportSub(panel) {
    if (!canSalesView) return;
    setActiveView('report');
    const p = new URLSearchParams(searchParams.toString());
    p.set('view', 'report');
    if (panel === 'owner' || panel === 'private') {
      p.set('sub', panel);
    } else {
      p.delete('sub');
    }
    router.replace(`/sales?${p.toString()}`, { scroll: false });
  }

  const reportSubIsOwner   = searchParams.get('sub') === 'owner';
  const reportSubIsPrivate = searchParams.get('sub') === 'private';

  // 僅有業主私帳權限時，預設開「業主私帳月結」分頁
  useEffect(() => {
    if (!session) return;
    if (!canSalesView && canOwnerExpense && searchParams.get('view') !== 'owner-monthly') {
      setActiveView('owner-monthly');
      const p = new URLSearchParams(searchParams.toString());
      p.set('view', 'owner-monthly');
      router.replace(`/sales?${p.toString()}`, { scroll: false });
    }
  }, [session, canSalesView, canOwnerExpense, searchParams, router]);

  // 網址 ?view= 與權限同步分頁
  useEffect(() => {
    if (!session) return;
    const v = searchParams.get('view');
    if (!v || !SALES_VIEWS.includes(v)) return;
    if (v === 'owner-monthly') {
      if (canSalesView || canOwnerExpense) setActiveView(v);
      return;
    }
    if (!canSalesView) return;
    setActiveView(v);
  }, [session, searchParams, canSalesView, canOwnerExpense]);

  // 從 URL ?month=YYYY-MM&invoiceTitle=XXX 預設篩選（發票私帳「查看發票」→ 發票列表）
  useEffect(() => {
    const m = searchParams.get('month');
    const t = searchParams.get('invoiceTitle');
    const v = searchParams.get('view');
    if (m) {
      setSearchDateFrom(`${m}-01`);
      const [y, mo] = m.split('-').map(Number);
      const lastDay = new Date(y, mo, 0).getDate();
      setSearchDateTo(`${m}-${String(lastDay).padStart(2, '0')}`);
    }
    if (t) setSearchInvoiceTitle(t);
    if ((m || t) && canSalesView) {
      setActiveView('list');
      if (v !== 'list') {
        const p = new URLSearchParams(searchParams.toString());
        p.set('view', 'list');
        router.replace(`/sales?${p.toString()}`, { scroll: false });
      }
    }
  }, [searchParams, canSalesView, router]);

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
  useEffect(() => {
    if (activeView === 'report') {
      fetchOwnerExpenseTotal(reportDateFrom, reportDateTo);
      fetchPrivateInvoices(reportDateFrom, reportDateTo);
    }
  }, [activeView, reportDateFrom, reportDateTo]);

  // 切到 sub=private 時也刷新
  useEffect(() => {
    if (activeView === 'report' && reportSubIsPrivate) fetchPrivateInvoices(reportDateFrom, reportDateTo);
  }, [reportSubIsPrivate]);

  async function fetchPrivateInvoices(from, to) {
    setPrivateLoading(true);
    try {
      const p = new URLSearchParams({ invoiceType: '業主發票私帳', limit: '500' });
      if (from) p.set('dateFrom', from);
      if (to)   p.set('dateTo', to);
      const res = await fetch(`/api/sales/with-info?${p}`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setPrivateInvoices(Array.isArray(data.data) ? data.data : []);
      }
    } catch {}
    setPrivateLoading(false);
  }

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
        if (['草稿', '待出納', '已付款', '已退貨', '部分退貨'].includes(invoice.paymentStatus)) {
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

  async function fetchInvoices(page = 1) {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(invoicePageSize) });
      if (searchDateFrom)    params.set('dateFrom', searchDateFrom);
      if (searchDateTo)      params.set('dateTo', searchDateTo);
      if (searchWarehouse)   params.set('warehouse', searchWarehouse);
      if (searchInvoiceType && searchInvoiceType !== '折讓') params.set('invoiceType', searchInvoiceType);
      if (searchInvoiceTitle) params.set('invoiceTitle', searchInvoiceTitle);

      const response = await fetch(`/api/sales/with-info?${params}`);
      if (!response.ok) { setInvoices([]); return; }
      const result = await response.json();
      if (result.data && result.pagination) {
        setInvoices(result.data);
        setInvoicePage(result.pagination.page);
        setInvoiceTotalPages(result.pagination.totalPages);
        setInvoiceTotal(result.pagination.total);
      } else {
        // 向下相容舊格式
        setInvoices(Array.isArray(result) ? result : []);
      }
    } catch (error) {
      console.error('取得發票列表失敗:', error);
      setInvoices([]);
    }
    setLoading(false);
  }

  async function fetchAllowances() {
    try {
      const res = await fetch('/api/purchase-allowances?status=已確認');
      if (!res.ok) { setAllowances([]); return; }
      const data = await res.json();
      setAllowances(Array.isArray(data) ? data : []);
    } catch { setAllowances([]); }
  }

  async function fetchOwnerExpenseTotal(from, to) {
    try {
      const fromMonth = from ? from.slice(0, 7) : '2000-01';
      const toMonth   = to   ? to.slice(0, 7)   : '2099-12';
      const res = await fetch(`/api/owner-expenses?from=${fromMonth}&to=${toMonth}`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setReportOwnerData({ total: data.total ?? 0, count: data.count ?? 0 });
      }
    } catch { setReportOwnerData({ total: 0, count: 0 }); }
  }

  async function savePrivateInvoice() {
    if (!privateForm.invoiceNo.trim()) return showToast('請填寫發票號碼', 'error');
    if (!privateForm.invoiceTitle) return showToast('請選擇發票抬頭', 'error');
    if (!privateForm.totalAmount || Number(privateForm.totalAmount) <= 0) return showToast('請填寫金額', 'error');
    setPrivateSaving(true);
    try {
      const amt = parseFloat(privateForm.totalAmount) || 0;
      const body = {
        invoiceNo:    privateForm.invoiceNo.trim(),
        invoiceDate:  privateForm.invoiceDate,
        invoiceTitle: privateForm.invoiceTitle,
        invoiceType:  '業主發票私帳',
        totalAmount:  amt,
        amount:       amt,
        tax:          0,
        warehouse:    privateForm.warehouse,
        note:         privateForm.note,
        items:        [],
      };
      const url    = editingPrivateId ? `/api/sales/${editingPrivateId}` : '/api/sales';
      const method = editingPrivateId ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        credentials: 'include',
      });
      const data = await res.json();
      if (!res.ok) return showToast(data.error || (data.message) || '儲存失敗', 'error');
      showToast(editingPrivateId ? '已更新' : '已新增業主私帳發票', 'success');
      setShowPrivateForm(false);
      setEditingPrivateId(null);
      setPrivateForm({ invoiceDate: todayStr(), invoiceNo: '', invoiceTitle: '', totalAmount: '', note: '', warehouse: '' });
      fetchPrivateInvoices(reportDateFrom, reportDateTo);
    } catch (err) { showToast('儲存失敗: ' + err.message, 'error'); }
    finally { setPrivateSaving(false); }
  }

  async function deletePrivateInvoice(id) {
    if (!(await confirm('確定要刪除此筆業主私帳發票？', { title: '刪除確認', danger: true }))) return;
    try {
      const res = await fetch(`/api/sales/${id}`, { method: 'DELETE', credentials: 'include' });
      const data = await res.json();
      if (!res.ok) return showToast(data.error || '刪除失敗', 'error');
      showToast('已刪除', 'success');
      fetchPrivateInvoices(reportDateFrom, reportDateTo);
    } catch (err) { showToast('刪除失敗: ' + err.message, 'error'); }
  }

  function openEditPrivate(inv) {
    setEditingPrivateId(inv.id);
    setPrivateForm({
      invoiceDate:  inv.invoiceDate || todayStr(),
      invoiceNo:    inv.invoiceNo || '',
      invoiceTitle: inv.invoiceTitle || '',
      totalAmount:  String(inv.totalAmount || ''),
      note:         inv.items?.[0]?.note || '',
      warehouse:    inv.warehouse || '',
    });
    setShowPrivateForm(true);
  }

  async function saveAllowance(e) {
    e.preventDefault();
    if (!allowanceFormData.allowanceDate || !allowanceFormData.supplierName || !allowanceFormData.totalAmount) {
      showToast('請填寫折讓日期、廠商名稱及折讓金額', 'error');
      return;
    }
    setAllowanceSaving(true);
    try {
      const res = await fetch('/api/purchase-allowances', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...allowanceFormData,
          allowanceType: '折讓',
          status: '已確認',
          amount: parseFloat(allowanceFormData.amount || allowanceFormData.totalAmount) || 0,
          tax: parseFloat(allowanceFormData.tax) || 0,
          totalAmount: parseFloat(allowanceFormData.totalAmount) || 0,
        }),
      });
      if (res.ok) {
        showToast('折讓發票已儲存', 'success');
        setShowAddAllowanceForm(false);
        setAllowanceFormData({ allowanceDate: todayStr(), warehouse: '', supplierName: '', invoiceNo: '', amount: '', tax: '0', totalAmount: '', reason: '', note: '' });
        fetchAllowances();
      } else {
        const err = await res.json().catch(() => ({}));
        showToast(err.message || '儲存失敗', 'error');
      }
    } catch { showToast('儲存失敗', 'error'); }
    setAllowanceSaving(false);
  }

  async function fetchProducts() {
    try {
      const response = await fetch('/api/products?all=true');
      if (!response.ok) { setProducts([]); return; }
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
      if (!response.ok) { setSuppliers([]); return; }
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

  // 伺服器已過濾 date/warehouse/invoiceType/invoiceTitle；廠商名稱在前端過濾目前頁面
  const filteredInvoicesForList = useMemo(
    () => invoices.filter(inv =>
      !searchSupplier || (inv.supplierName || '').toLowerCase().includes(searchSupplier.toLowerCase())
    ),
    [invoices, searchSupplier]
  );
  // 折讓篩選（與發票相同的日期/館別/廠商條件，但不篩 invoiceTitle/invoiceType）
  const filteredAllowancesForList = useMemo(
    () =>
      allowances.filter((a) => {
        if (searchSupplier && !(a.supplierName || '').toLowerCase().includes(searchSupplier.toLowerCase())) return false;
        const d = a.allowanceDate || '';
        if (searchDateFrom && d < searchDateFrom) return false;
        if (searchDateTo && d > searchDateTo) return false;
        if (searchWarehouse && (a.warehouse || '') !== searchWarehouse) return false;
        // 若篩選「來源」為非折讓類型時不顯示折讓
        if (searchInvoiceType && searchInvoiceType !== '折讓') return false;
        return true;
      }),
    [allowances, searchSupplier, searchDateFrom, searchDateTo, searchWarehouse, searchInvoiceType]
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

  // 合併發票＋折讓，依日期排序
  const mergedListForDisplay = useMemo(() => {
    const invRows = sortedInvoicesForList.map(i => ({ ...i, _isAllowance: false }));
    const allowanceRows = filteredAllowancesForList.map(a => ({
      _isAllowance: true,
      id: `a-${a.id}`,
      _allowanceId: a.id,
      warehouse: a.warehouse || '',
      invoiceTitle: '-',
      supplierName: a.supplierName || '-',
      invoiceNo: a.allowanceNo,
      invoiceDate: a.allowanceDate,
      items: a.details || [],
      totalAmount: -Number(a.totalAmount),
      invoiceType: '折讓',
      paymentStatus: a.status || '',
      allowanceType: a.allowanceType,
      reason: a.reason || '',
    }));
    const combined = [...invRows, ...allowanceRows];
    combined.sort((a, b) => {
      const da = a.invoiceDate || a.salesDate || '';
      const db = b.invoiceDate || b.salesDate || '';
      if (da > db) return saleInvDir === 'desc' ? -1 : 1;
      if (da < db) return saleInvDir === 'desc' ? 1 : -1;
      return 0;
    });
    return combined;
  }, [sortedInvoicesForList, filteredAllowancesForList, saleInvDir]);

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
    if (!(await confirm(`確定要刪除「${title}」嗎？`, { title: '刪除確認', danger: true }))) return;
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
        const wantAddMore = await confirm(`發票${isEditing ? '更新' : '登錄'}成功！\n\n是否要繼續新增發票？`, { title: '繼續新增', danger: false });
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
          invoiceDate: todayStr(),
          invoiceTitle: '',
          invoiceType: '進貨單',
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
    if (['草稿', '待出納', '已付款', '已退貨', '部分退貨'].includes(invoice.paymentStatus)) {
      showToast(`此發票目前付款狀態為「${invoice.paymentStatus}」，不可修改發票內容。`, 'error');
      return;
    }
    setEditingInvoice(invoice);
    setFormData({
      invoiceNo: invoice.invoiceNo || '',
      invoiceDate: invoice.invoiceDate || todayStr(),
      invoiceTitle: invoice.invoiceTitle || '',
      invoiceType: invoice.invoiceType || '進貨單',
      taxType: invoice.taxType || '應稅',
      invoiceAmount: invoice.invoiceAmount != null ? String(invoice.invoiceAmount) : String(invoice.amount || ''),
      supplierDiscount: invoice.supplierDiscount != null ? String(invoice.supplierDiscount) : '0'
    });
    setSelectedItems(invoice.items || []);
    setShowAddForm(true);
  }

  async function handleDelete(invoiceId) {
    if (!(await confirm('確定要刪除這張發票嗎？刪除後相關進貨單品項將可重新核銷。', { title: '刪除確認', danger: true }))) return;
    
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
    a.download = `發票清單_${todayStr()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="min-h-screen page-bg-sales">
      <Navigation borderColor="border-green-500" />

      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* 標題與操作 */}
        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-2xl font-bold">發票登錄/核銷</h2>
          </div>
          {activeView === 'list' && canSalesView && (
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
              <>
                <button
                  onClick={() => { setShowAddAllowanceForm(!showAddAllowanceForm); setShowAddForm(false); }}
                  className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 text-sm"
                >
                  ➕ 新增折讓發票
                </button>
                <button
                  onClick={() => {
                    setShowAddForm(!showAddForm);
                    setShowAddAllowanceForm(false);
                    if (!showAddForm) {
                      setSelectedItems([]);
                      setAvailableItems([]);
                      setFilterData({ yearMonth: '', supplierId: '', warehouse: '' });
                    }
                  }}
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
                >
                  ➕ 新增發票
                </button>
              </>
            )}
          </div>
          )}
        </div>

        {/* 新增折讓發票表單 */}
        {showAddAllowanceForm && canSalesView && (
          <div className="bg-white rounded-lg shadow-sm p-6 mb-6 border-2 border-red-200">
            <h3 className="text-lg font-semibold mb-4 text-red-700">新增折讓發票</h3>
            <form onSubmit={saveAllowance}>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
                <div>
                  <label htmlFor="f" className="block text-sm font-medium text-gray-700 mb-1">折讓日期 *</label>
                  <input id="f" type="date" required value={allowanceFormData.allowanceDate}
                    onChange={e => setAllowanceFormData({ ...allowanceFormData, allowanceDate: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 text-sm" />
                </div>
                <div>
                  <label htmlFor="f-2" className="block text-sm font-medium text-gray-700 mb-1">館別</label>
                  <select id="f-2" value={allowanceFormData.warehouse}
                    onChange={e => setAllowanceFormData({ ...allowanceFormData, warehouse: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 text-sm">
                    <option value="">請選擇</option>
                    <option value="麗格">麗格</option>
                    <option value="麗軒">麗軒</option>
                    <option value="民宿">民宿</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="f-3" className="block text-sm font-medium text-gray-700 mb-1">廠商名稱 *</label>
                  <input id="f-3" type="text" required value={allowanceFormData.supplierName}
                    onChange={e => setAllowanceFormData({ ...allowanceFormData, supplierName: e.target.value })}
                    placeholder="廠商名稱"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 text-sm" />
                </div>
                <div>
                  <label htmlFor="f-4" className="block text-sm font-medium text-gray-700 mb-1">原發票號</label>
                  <input id="f-4" type="text" value={allowanceFormData.invoiceNo}
                    onChange={e => setAllowanceFormData({ ...allowanceFormData, invoiceNo: e.target.value })}
                    placeholder="原始發票號碼"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 text-sm" />
                </div>
                <div>
                  <label htmlFor="f-5" className="block text-sm font-medium text-gray-700 mb-1">折讓金額（含稅）*</label>
                  <input id="f-5" type="number" required min="0.01" step="0.01" value={allowanceFormData.totalAmount}
                    onChange={e => setAllowanceFormData({ ...allowanceFormData, totalAmount: e.target.value, amount: e.target.value })}
                    placeholder="0.00"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 text-sm" />
                </div>
                <div>
                  <label htmlFor="f-6" className="block text-sm font-medium text-gray-700 mb-1">折讓原因</label>
                  <input id="f-6" type="text" value={allowanceFormData.reason}
                    onChange={e => setAllowanceFormData({ ...allowanceFormData, reason: e.target.value })}
                    placeholder="折讓原因"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 text-sm" />
                </div>
              </div>
              <div className="flex justify-end gap-3">
                <button type="button" onClick={() => setShowAddAllowanceForm(false)}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm">
                  取消
                </button>
                <button type="submit" disabled={allowanceSaving}
                  className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 text-sm">
                  {allowanceSaving ? '儲存中…' : '儲存折讓發票'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* 新增發票表單 */}
        {showAddForm && canSalesView && (
          <div className="bg-white rounded-lg shadow-sm p-6 mb-6 border-2 border-blue-200">
            <h3 className="text-lg font-semibold mb-4">{editingInvoice ? '編輯發票' : '新增發票'}</h3>
            <form onSubmit={handleSubmit}>
              {/* 篩選條件 */}
              <div className="bg-gray-50 border rounded-lg p-4 mb-6">
                <h4 className="text-md font-semibold mb-3">篩選未核銷的進貨單品項</h4>
                <div className="grid grid-cols-3 gap-4 mb-3">
                  <div>
                    <label htmlFor="f-21" className="block text-sm font-medium text-gray-700 mb-1">
                      進貨年月
                    </label>
                    <input id="f-21"
                      type="month"
                      value={filterData.yearMonth}
                      onChange={(e) => setFilterData({ ...filterData, yearMonth: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label htmlFor="f-22" className="block text-sm font-medium text-gray-700 mb-1">
                      廠商
                    </label>
                    <select id="f-22"
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
                    <label htmlFor="f-30" className="block text-sm font-medium text-gray-700 mb-1">
                      館別
                    </label>
                    <select id="f-30"
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
                      <thead className="bg-gray-50 sticky top-0 z-10">
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
                              <td className="px-3 py-2 text-sm">{item.productId ? getProductName(item.productId) : '（整張進貨單）'}</td>
                              <td className="px-3 py-2 text-sm">{item.quantity}</td>
                              <td className="px-3 py-2 text-sm">{item.productId ? `NT$ ${item.unitPrice}` : '—'}</td>
                              <td className="px-3 py-2 text-sm">NT$ {Number(item.subtotal).toFixed(2)}</td>
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
                      <thead className="bg-green-50 sticky top-0 z-10">
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
                  <label htmlFor="f-23" className="block text-sm font-medium text-gray-700 mb-1">
                    發票號碼 *
                  </label>
                  <input id="f-23"
                    type="text"
                    required
                    value={formData.invoiceNo}
                    onChange={(e) => setFormData({ ...formData, invoiceNo: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="輸入發票號碼"
                  />
                </div>
                <div>
                  <label htmlFor="f-24" className="block text-sm font-medium text-gray-700 mb-1">
                    發票日期 *
                  </label>
                  <input id="f-24"
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
                  <label htmlFor="f-25" className="block text-sm font-medium text-gray-700 mb-1">
                    發票類型 *
                  </label>
                  <select id="f-25"
                    required
                    value={formData.invoiceType}
                    onChange={(e) => setFormData({ ...formData, invoiceType: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="進貨單">進貨單</option>
                    <option value="租屋支出">租屋支出</option>
                    <option value="固定費用">固定費用</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="f-26" className="block text-sm font-medium text-gray-700 mb-1">
                    發票金額（手動輸入） *
                  </label>
                  <input id="f-26"
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
                  <label htmlFor="f-27" className="block text-sm font-medium text-gray-700 mb-1">
                    營業稅類型 *
                  </label>
                  <select id="f-27"
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
                  <label htmlFor="f-28" className="block text-sm font-medium text-gray-700 mb-1">
                    營業稅金額（自動計算）
                  </label>
                  <input id="f-28"
                    type="text"
                    readOnly
                    value={`NT$ ${taxAmount.toFixed(2)}`}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-100 text-gray-700"
                  />
                </div>
                <div>
                  <label htmlFor="f-29" className="block text-sm font-medium text-gray-700 mb-1">
                    廠商折讓金額 *
                  </label>
                  <input id="f-29"
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
                      invoiceDate: todayStr(),
                      invoiceTitle: '',
                      invoiceType: '進貨單',
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
        {(canSalesView || canOwnerExpense) && (
          <div className="flex flex-wrap gap-1 mb-4 bg-white rounded-lg shadow-sm border border-gray-100 p-1 w-fit">
            {[
              ...(canSalesView
                ? [
                    { key: 'list', label: '發票列表' },
                    { key: 'report', label: '報表' },
                    { key: 'monthly', label: '月度館別統計' },
                  ]
                : []),
              ...(canSalesView || canOwnerExpense ? [{ key: 'owner-monthly', label: '業主私帳月結' }] : []),
            ].map((v) => (
              <button
                key={v.key}
                type="button"
                onClick={() => goSalesView(v.key)}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  activeView === v.key ? 'bg-green-600 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                {v.label}
              </button>
            ))}
          </div>
        )}

        {/* ══ 業主發票私帳 · 月結登記（每月依發票抬頭填寫一次） ══ */}
        {activeView === 'owner-monthly' && (canSalesView || canOwnerExpense) && (
          <div className="space-y-3 mb-6">
            <p className="text-sm text-gray-600">
              {canSalesView ? (
                <>
                  此處登記「業主發票私帳」月結金額，會反映在
                  <button
                    type="button"
                    className="text-green-700 hover:underline mx-1 font-medium"
                    onClick={() => goSalesView('report')}
                  >
                    報表
                  </button>
                  的業主私帳統計。
                </>
              ) : (
                <>此處登記「業主發票私帳」月結金額（每月依發票抬頭填寫一次）。</>
              )}
              發票抬頭請至
              <Link href="/settings?tab=invoice-titles" className="text-green-700 hover:underline mx-1">
                設定 → 發票抬頭
              </Link>
              維護。
            </p>
            <OwnerExpensesPanel
              embedded
              onSaved={() => fetchOwnerExpenseTotal(reportDateFrom, reportDateTo)}
            />
          </div>
        )}

        {/* ══ 報表 ══ */}
        {activeView === 'report' && canSalesView && (
          <ReportView
            invoices={invoices}
            allowances={allowances}
            invoiceTitles={invoiceTitles}
            privateInvoices={privateInvoices}
            privateLoading={privateLoading}
            reportSubIsOwner={reportSubIsOwner}
            reportSubIsPrivate={reportSubIsPrivate}
            goReportSub={goReportSub}
            reportDateFrom={reportDateFrom}
            reportDateTo={reportDateTo}
            reportTitle={reportTitle}
            reportWarehouse={reportWarehouse}
            reportType={reportType}
            setReportDateFrom={setReportDateFrom}
            setReportDateTo={setReportDateTo}
            setReportTitle={setReportTitle}
            setReportWarehouse={setReportWarehouse}
            setReportType={setReportType}
            fetchPrivateInvoices={fetchPrivateInvoices}
            fetchOwnerExpenseTotal={fetchOwnerExpenseTotal}
            showPrivateForm={showPrivateForm}
            setShowPrivateForm={setShowPrivateForm}
            editingPrivateId={editingPrivateId}
            setEditingPrivateId={setEditingPrivateId}
            privateForm={privateForm}
            setPrivateForm={setPrivateForm}
            privateSaving={privateSaving}
            savePrivateInvoice={savePrivateInvoice}
            deletePrivateInvoice={deletePrivateInvoice}
            openEditPrivate={openEditPrivate}
            canSalesView={canSalesView}
            canOwnerExpense={canOwnerExpense}
            goSalesView={goSalesView}
          />
        )}

        {/* ══ 月度館別統計 ══ */}
        {activeView === 'monthly' && canSalesView && (
          <MonthlyView
            statsStartMonth={statsStartMonth}
            statsEndMonth={statsEndMonth}
            statsWarehouse={statsWarehouse}
            setStatsStartMonth={setStatsStartMonth}
            setStatsEndMonth={setStatsEndMonth}
            setStatsWarehouse={setStatsWarehouse}
            statsData={statsData}
            statsLoading={statsLoading}
            fetchMonthlyStats={fetchMonthlyStats}
            setSearchDateFrom={setSearchDateFrom}
            setSearchDateTo={setSearchDateTo}
            setSearchWarehouse={setSearchWarehouse}
            setSearchInvoiceTitle={setSearchInvoiceTitle}
            goSalesView={goSalesView}
          />
        )}

        {activeView === 'list' && canSalesView && (
          <ListView
            mergedListForDisplay={mergedListForDisplay}
            invoiceTitles={invoiceTitles}
            products={products}
            loading={loading}
            invoiceTotal={invoiceTotal}
            invoicePage={invoicePage}
            invoiceTotalPages={invoiceTotalPages}
            searchSupplier={searchSupplier}
            searchInvoiceTitle={searchInvoiceTitle}
            searchWarehouse={searchWarehouse}
            searchInvoiceType={searchInvoiceType}
            searchDateFrom={searchDateFrom}
            searchDateTo={searchDateTo}
            setSearchSupplier={setSearchSupplier}
            setSearchInvoiceTitle={setSearchInvoiceTitle}
            setSearchWarehouse={setSearchWarehouse}
            setSearchInvoiceType={setSearchInvoiceType}
            setSearchDateFrom={setSearchDateFrom}
            setSearchDateTo={setSearchDateTo}
            saleInvKey={saleInvKey}
            saleInvDir={saleInvDir}
            toggleSaleInv={toggleSaleInv}
            checkedInvoiceIds={checkedInvoiceIds}
            setCheckedInvoiceIds={setCheckedInvoiceIds}
            expandedInvoices={expandedInvoices}
            handleViewDetails={handleViewDetails}
            fetchInvoices={fetchInvoices}
            handleEdit={handleEdit}
            handleDelete={handleDelete}
            handlePrintInvoices={handlePrintInvoices}
            isLoggedIn={isLoggedIn}
            getSupplierName={getSupplierName}
          />
        )}
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
