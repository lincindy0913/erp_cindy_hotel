'use client';

import { useState, useEffect, Fragment, useMemo } from 'react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import Navigation from '@/components/Navigation';
import NotificationBanner from '@/components/NotificationBanner';
import ExportButtons from '@/components/ExportButtons';
import { EXPORT_CONFIGS } from '@/lib/export-columns';
import { useToast } from '@/context/ToastContext';
import { useConfirm } from '@/context/ConfirmContext';
import { sortRows, useColumnSort, SortableTh } from '@/components/SortableTh';
import { todayStr, localDateStr } from '@/lib/localDate';
import ReportTab from './_tabs/ReportTab';
import ForecastTab from './_tabs/ForecastTab';
import CashCountTabComponent from './_tabs/CashCountTab';
import CategoryMgmtTab from './_tabs/CategoryMgmtTab';
import OverviewTab      from './_tabs/OverviewTab';
import SubjectQueryTab  from './_tabs/SubjectQueryTab';
import TransactionsTab  from './_tabs/TransactionsTab';
import FetchErrorBanner from '@/components/FetchErrorBanner';

const ACCOUNT_TYPES = ['現金', '銀行存款', '代墊款', '信用卡'];
const TX_TYPES = ['收入', '支出', '移轉'];
const TABS = [
  { key: 'overview', label: '帳戶總覽' },
  { key: 'transactions', label: '交易紀錄' },
  { key: 'subject-query', label: '科目查詢' },
  { key: 'report', label: '現金流量表' },
  { key: 'forecast', label: '資金預測' },
  { key: 'cash-count', label: '現金盤點' },
  { key: 'category-mgmt', label: '損益科目管理' },
];

const PL_LEVEL1_OPTIONS = ['收入', '費用', '業外'];
const PL_GROUP_SUGGESTIONS = {
  '收入': ['住宿收入', '餐飲收入', '其他營業收入'],
  '費用': ['收款成本', '人事費用', '行政費用', '行銷費用', '維修費用', '業外費用'],
  '業外': ['業外收入', '業外支出', '業外收支'],
};

export default function CashFlowPage() {
  const { data: session } = useSession();
  const { showToast } = useToast();
  const confirm = useConfirm();
  const isLoggedIn = !!session;
  const [activeTab, setActiveTab] = useState('overview');

  // Shared data
  const [accounts, setAccounts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [accountsError, setAccountsError] = useState(null);
  const [transactionsError, setTransactionsError] = useState(null);

  // Account form
  const [showAccountForm, setShowAccountForm] = useState(false);
  const [accountForm, setAccountForm] = useState({ name: '', type: '現金', warehouse: '', openingBalance: '', isPrimary: false });

  // Category form
  const [showCategoryForm, setShowCategoryForm] = useState(false);
  const [categoryForm, setCategoryForm] = useState({ name: '', type: '收入', warehouse: '', accountingSubjectId: '', level1: '', plGroup: '', plOrder: '' });

  // Category management tab state
  const [editCatId, setEditCatId] = useState(null);
  const [editCatForm, setEditCatForm] = useState({});
  const [seedLoading, setSeedLoading] = useState(false);
  const [seedResult, setSeedResult] = useState(null);
  const [noCatStats, setNoCatStats] = useState(null);
  const [batchCatForm, setBatchCatForm] = useState({ categoryId: '', type: '', sourceType: '', startDate: '', endDate: '', noCategoryOnly: true });
  const [batchLoading, setBatchLoading] = useState(false);
  const [accountingSubjects, setAccountingSubjects] = useState([]);

  // Transaction form
  const [showTxForm, setShowTxForm] = useState(false);
  const [txForm, setTxForm] = useState({
    transactionDate: todayStr(),
    type: '支出',
    warehouse: '',
    accountId: '',
    categoryId: '',
    supplierId: '',
    paymentNo: '',
    amount: '',
    hasFee: false,
    fee: '',
    accountingSubject: '',
    paymentTerms: '',
    description: '',
    transferAccountId: '',
    invoiceNo: '',
    invoiceAmount: '',
    invoiceDate: '',
    taxType: '',
    taxAmount: ''
  });

  // Transaction filters
  const [txFilter, setTxFilter] = useState({
    startDate: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
    endDate: todayStr(),
    warehouse: '',
    type: '',
    accountId: '',
    sourceType: '',
    accountingSubject: ''
  });
  const [txPage, setTxPage] = useState(1);
  const [txPagination, setTxPagination] = useState({ page: 1, limit: 50, totalCount: 0, totalPages: 1 });

  const { sortKey: cfTxKey, sortDir: cfTxDir, toggleSort: cfTxToggle } = useColumnSort('transactionDate', 'desc');
  const sortedTransactions = useMemo(
    () =>
      sortRows(transactions, cfTxKey, cfTxDir, {
        transactionNo: (tx) => tx.transactionNo || '',
        transactionDate: (tx) => tx.transactionDate || '',
        type: (tx) => tx.type || '',
        warehouse: (tx) => tx.warehouse || '',
        accountName: (tx) => tx.account?.name || '',
        supplierName: (tx) => tx.supplier?.name || '',
        accountingSubject: (tx) =>
          tx.category?.accountingSubject
            ? `${tx.category.accountingSubject.code || ''} ${tx.category.accountingSubject.name || ''}`
            : String(tx.accountingSubject || ''),
        paymentNo: (tx) => tx.paymentNo || '',
        amount: (tx) => Number(tx.amount || 0),
        fee: (tx) => (tx.hasFee ? Number(tx.fee || 0) : -1),
        description: (tx) => tx.description || '',
        sourceType: (tx) => tx.sourceType || '',
      }),
    [transactions, cfTxKey, cfTxDir]
  );

  // Report state
  const [reportData, setReportData] = useState(null);
  const [reportFilter, setReportFilter] = useState({
    startDate: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
    endDate: todayStr(),
    warehouse: '',
    supplierId: '',
    accountingSubject: ''
  });

  // Subject query state
  const [subjectFilter, setSubjectFilter] = useState({
    startDate: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
    endDate: todayStr(),
    warehouse: '',
    accountingSubject: ''
  });
  const [subjectData, setSubjectData] = useState(null);
  const [subjectLoading, setSubjectLoading] = useState(false);

  // Overview category summary (current month)
  const [overviewCategorySummary, setOverviewCategorySummary] = useState(null);

  // PMS 現金流 mini-widget
  const [pmsDashboard, setPmsDashboard] = useState(null);

  // Forecast state
  const [summaryData, setSummaryData] = useState(null);
  const [forecastWarehouse, setForecastWarehouse] = useState('');

  useEffect(() => {
    fetchAll();
  }, []);

  async function fetchAll() {
    setLoading(true);
    await Promise.all([
      fetchAccounts(),
      fetchCategories(),
      fetchSuppliers(),
      fetchWarehouses(),
      fetchAccountingSubjects(),
      fetchOverviewCategorySummary(),
      fetchNoCatStats(),
      fetchPmsDashboard(),
    ]);
    setLoading(false);
  }

  async function fetchOverviewCategorySummary() {
    try {
      const now = new Date();
      const startDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
      const endDate = localDateStr(now);
      const res = await fetch(`/api/cashflow/report?startDate=${startDate}&endDate=${endDate}`);
      if (!res.ok) { setOverviewCategorySummary(null); return; }
      const data = await res.json();
      setOverviewCategorySummary(data);
    } catch { setOverviewCategorySummary(null); }
  }

  async function fetchPmsDashboard() {
    try {
      const now = new Date();
      const today = localDateStr(now);
      const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      // 取本月訂房資料（最多500筆）
      const res = await fetch(`/api/pms-income/reservations?take=500&month=${yearMonth}`);
      if (!res.ok) { setPmsDashboard(null); return; }
      const rows = await res.json();
      let cashTotal = 0, wireTotal = 0, ccTotal = 0, depositIn = 0;
      let todayCash = 0, todayWire = 0, todayCc = 0;
      const bySource = {};
      for (const r of rows) {
        cashTotal  += Number(r.cash  || 0);
        wireTotal  += Number(r.wireTransfer || 0);
        ccTotal    += Number(r.creditCard || 0);
        depositIn  += Number(r.depositIn || 0);
        if (r.businessDate === today) {
          todayCash += Number(r.cash || 0);
          todayWire += Number(r.wireTransfer || 0);
          todayCc   += Number(r.creditCard || 0);
        }
        const src = r.sourceOverride || r.source || '其他';
        bySource[src] = (bySource[src] || 0) + Number(r.totalRevenue || 0);
      }
      const totalRevenue = Object.values(bySource).reduce((s, v) => s + v, 0);
      setPmsDashboard({ cashTotal, wireTotal, ccTotal, depositIn, todayCash, todayWire, todayCc, bySource, totalRevenue, yearMonth, count: rows.length });
    } catch { setPmsDashboard(null); }
  }

  async function fetchAccountingSubjects() {
    try {
      const res = await fetch('/api/accounting-subjects');
      if (!res.ok) { setAccountingSubjects([]); return; }
      const data = await res.json();
      setAccountingSubjects(Array.isArray(data) ? data : []);
    } catch { setAccountingSubjects([]); }
  }

  async function fetchAccounts() {
    try {
      const res = await fetch('/api/cashflow/accounts');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setAccountsError(null);
      setAccounts(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error('[fetchAccounts]', e);
      setAccountsError('帳戶資料載入失敗，請重試。');
      setAccounts([]);
    }
  }

  async function fetchCategories() {
    try {
      const res = await fetch('/api/cashflow/categories');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setCategories(Array.isArray(data) ? data : []);
    } catch (e) { console.error('[fetchCategories]', e); setCategories([]); }
  }

  async function fetchTransactions(page) {
    try {
      const p = page || txPage;
      const params = new URLSearchParams();
      if (txFilter.startDate) params.append('startDate', txFilter.startDate);
      if (txFilter.endDate) params.append('endDate', txFilter.endDate);
      if (txFilter.warehouse) params.append('warehouse', txFilter.warehouse);
      if (txFilter.type) params.append('type', txFilter.type);
      if (txFilter.accountId) params.append('accountId', txFilter.accountId);
      if (txFilter.sourceType) params.append('sourceType', txFilter.sourceType);
      if (txFilter.accountingSubject) params.append('accountingSubject', txFilter.accountingSubject);
      params.append('page', String(p));
      params.append('limit', '50');

      const res = await fetch(`/api/cashflow/transactions?${params.toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setTransactionsError(null);
      if (data && data.data) {
        setTransactions(Array.isArray(data.data) ? data.data : []);
        setTxPagination(data.pagination || { page: 1, limit: 50, totalCount: 0, totalPages: 1 });
      } else {
        setTransactions(Array.isArray(data) ? data : []);
        setTxPagination({ page: 1, limit: 50, totalCount: (Array.isArray(data) ? data.length : 0), totalPages: 1 });
      }
    } catch (e) {
      console.error('[fetchTransactions]', e);
      setTransactionsError('交易紀錄載入失敗，請重試。');
      setTransactions([]);
    }
  }

  async function fetchSuppliers() {
    try {
      const res = await fetch('/api/suppliers?all=true');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setSuppliers(Array.isArray(data) ? data : []);
    } catch (e) { console.error('[fetchSuppliers]', e); setSuppliers([]); }
  }

  async function fetchWarehouses() {
    try {
      const res = await fetch('/api/warehouse-departments');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data && data.list) {
        setWarehouses(data.list.filter(w => w.type === 'building').map(w => w.name));
      } else if (data && data.byName) {
        setWarehouses(Object.keys(data.byName));
      } else {
        setWarehouses(Object.keys(data || {}));
      }
    } catch (e) { console.error('[fetchWarehouses]', e); setWarehouses([]); }
  }

  async function fetchReport() {
    try {
      const params = new URLSearchParams();
      if (reportFilter.startDate) params.set('startDate', reportFilter.startDate);
      if (reportFilter.endDate) params.set('endDate', reportFilter.endDate);
      if (reportFilter.warehouse) params.set('warehouse', reportFilter.warehouse);
      if (reportFilter.supplierId) params.set('supplierId', reportFilter.supplierId);
      if (reportFilter.accountingSubject) params.set('accountingSubject', reportFilter.accountingSubject);
      const res = await fetch(`/api/cashflow/report?${params.toString()}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { showToast(data.error?.message || data.error || '產生報表失敗', 'error'); setReportData(null); return; }
      setReportData(data);
    } catch (e) { showToast('產生報表失敗: ' + (e.message || ''), 'error'); setReportData(null); }
  }

  async function fetchSubjectQuery() {
    setSubjectLoading(true);
    try {
      const params = new URLSearchParams();
      if (subjectFilter.startDate) params.set('startDate', subjectFilter.startDate);
      if (subjectFilter.endDate) params.set('endDate', subjectFilter.endDate);
      if (subjectFilter.warehouse) params.set('warehouse', subjectFilter.warehouse);
      if (subjectFilter.accountingSubject) params.set('accountingSubject', subjectFilter.accountingSubject);
      params.set('limit', '500');
      const res = await fetch(`/api/cashflow/transactions?${params}`);
      const data = await res.json();
      const txs = Array.isArray(data.data) ? data.data : (Array.isArray(data) ? data : []);

      // Group by accountingSubject + warehouse (exclude transfer types)
      const grouped = {};
      let totalIncome = 0, totalExpense = 0;
      for (const tx of txs) {
        if (tx.type === '移轉' || tx.type === '移轉入') continue;
        const subject = tx.accountingSubject ||
          (tx.category?.accountingSubject ? `${tx.category.accountingSubject.code} ${tx.category.accountingSubject.name}` : '未分類');
        const wh = tx.warehouse || '未指定';
        const key = `${subject}__${wh}`;
        if (!grouped[key]) grouped[key] = { subject, warehouse: wh, income: 0, expense: 0, count: 0 };
        if (tx.type === '收入') { grouped[key].income += Number(tx.amount); totalIncome += Number(tx.amount); }
        else if (tx.type === '支出') { grouped[key].expense += Number(tx.amount); totalExpense += Number(tx.amount); }
        grouped[key].count++;
      }
      const rows = Object.values(grouped).sort((a, b) => a.subject.localeCompare(b.subject, 'zh-TW'));
      setSubjectData({ rows, totalIncome, totalExpense, totalCount: txs.filter(t => t.type !== '移轉' && t.type !== '移轉入').length });
    } catch { setSubjectData(null); }
    setSubjectLoading(false);
  }

  async function fetchSummary() {
    try {
      const params = new URLSearchParams();
      if (forecastWarehouse) params.append('warehouse', forecastWarehouse);
      params.append('days', '30');
      const res = await fetch(`/api/cashflow/summary?${params.toString()}`);
      const data = await res.json();
      setSummaryData(data);
    } catch { setSummaryData(null); }
  }

  // ==================== Account CRUD ====================
  async function handleCreateAccount(e) {
    e.preventDefault();
    if (!accountForm.name || !accountForm.warehouse) {
      showToast('請填寫帳戶名稱和館別', 'error');
      return;
    }
    try {
      const res = await fetch('/api/cashflow/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(accountForm)
      });
      if (res.ok) {
        setShowAccountForm(false);
        setAccountForm({ name: '', type: '現金', warehouse: '', openingBalance: '', isPrimary: false });
        fetchAccounts();
      } else {
        const err = await res.json();
        showToast(err.error || '建立失敗', 'error');
      }
    } catch { showToast('建立帳戶失敗', 'error'); }
  }

  async function handleSetPrimaryAccount(id, warehouse, type) {
    try {
      const res = await fetch(`/api/cashflow/accounts/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isPrimary: true }),
      });
      if (res.ok) { fetchAccounts(); showToast('已設為主要帳戶', 'success'); }
      else { const err = await res.json(); showToast(err.error || '設定失敗', 'error'); }
    } catch { showToast('設定失敗', 'error'); }
  }

  async function handleDeleteAccount(id) {
    if (!(await confirm('確定要刪除此帳戶嗎？', { title: '刪除確認', danger: true }))) return;
    try {
      const res = await fetch(`/api/cashflow/accounts/${id}`, { method: 'DELETE' });
      if (res.ok) {
        fetchAccounts();
      } else {
        const err = await res.json();
        showToast(err.error || '刪除失敗', 'error');
      }
    } catch { showToast('刪除帳戶失敗', 'error'); }
  }

  // ==================== Category CRUD ====================
  async function handleCreateCategory(e) {
    e.preventDefault();
    if (!categoryForm.name) {
      showToast('請填寫類別名稱', 'error');
      return;
    }
    try {
      const res = await fetch('/api/cashflow/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...categoryForm,
          plOrder: categoryForm.plOrder ? parseInt(categoryForm.plOrder) : null,
          accountingSubjectId: categoryForm.accountingSubjectId ? parseInt(categoryForm.accountingSubjectId) : null,
        })
      });
      if (res.ok) {
        setShowCategoryForm(false);
        setCategoryForm({ name: '', type: '收入', warehouse: '', accountingSubjectId: '', level1: '', plGroup: '', plOrder: '' });
        fetchCategories();
        fetchNoCatStats();
      } else {
        const err = await res.json();
        showToast(err.error || '建立失敗', 'error');
      }
    } catch { showToast('建立類別失敗', 'error'); }
  }

  async function handleDeleteCategory(id) {
    if (!(await confirm('確定要刪除此類別嗎？', { title: '刪除確認', danger: true }))) return;
    try {
      const res = await fetch(`/api/cashflow/categories/${id}`, { method: 'DELETE' });
      if (res.ok) {
        fetchCategories();
      } else {
        const err = await res.json();
        showToast(err.error || '刪除失敗', 'error');
      }
    } catch { showToast('刪除類別失敗', 'error'); }
  }

  async function handleUpdateCategory(e) {
    e.preventDefault();
    try {
      const res = await fetch(`/api/cashflow/categories/${editCatId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...editCatForm,
          plOrder: editCatForm.plOrder ? parseInt(editCatForm.plOrder) : null,
          accountingSubjectId: editCatForm.accountingSubjectId ? parseInt(editCatForm.accountingSubjectId) : null,
        }),
      });
      if (res.ok) {
        setEditCatId(null);
        fetchCategories();
        showToast('科目已更新', 'success');
      } else {
        const err = await res.json();
        showToast(err.error?.message || err.error || '更新失敗', 'error');
      }
    } catch { showToast('更新科目失敗', 'error'); }
  }

  async function handleSeedCategories() {
    if (!(await confirm('這將新增預設損益科目（不刪除現有科目）。確定執行？', { title: '初始化確認', danger: false }))) return;
    setSeedLoading(true); setSeedResult(null);
    try {
      const res = await fetch('/api/cash-categories/seed', { method: 'POST' });
      const d = await res.json();
      setSeedResult(d);
      fetchCategories();
      showToast(`初始化完成：新增 ${d.created} 筆，補欄位 ${d.updated ?? 0} 筆，跳過 ${d.skipped} 筆`, 'success');
    } catch { showToast('初始化失敗', 'error'); }
    setSeedLoading(false);
  }

  async function fetchNoCatStats() {
    try {
      const res = await fetch('/api/cashflow/transactions/batch-categorize');
      if (res.ok) setNoCatStats(await res.json());
    } catch (e) { console.warn('[fetchNoCatStats] failed:', e.message); }
  }

  async function handleBatchCategorize(e) {
    e.preventDefault();
    if (!batchCatForm.categoryId) { showToast('請選擇目標科目', 'error'); return; }
    const payload = {
      categoryId: parseInt(batchCatForm.categoryId),
      noCategoryOnly: batchCatForm.noCategoryOnly,
      type:       batchCatForm.type       || undefined,
      sourceType: batchCatForm.sourceType || undefined,
      startDate:  batchCatForm.startDate  || undefined,
      endDate:    batchCatForm.endDate    || undefined,
    };
    setBatchLoading(true);
    try {
      const res = await fetch('/api/cashflow/transactions/batch-categorize', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const d = await res.json();
      if (res.ok) {
        showToast(`已更新 ${d.updatedCount} 筆交易的科目`, 'success');
        fetchNoCatStats();
      } else {
        showToast(d.error?.message || d.error || '批量更新失敗', 'error');
      }
    } catch { showToast('批量更新失敗', 'error'); }
    setBatchLoading(false);
  }

  // ==================== Transaction CRUD ====================
  async function handleCreateTransaction(e) {
    e.preventDefault();
    if (!txForm.accountId || !txForm.amount || !txForm.transactionDate) {
      showToast('請填寫帳戶、金額和日期', 'error');
      return;
    }
    if (txForm.type === '移轉' && !txForm.transferAccountId) {
      showToast('移轉交易必須指定目的帳戶', 'error');
      return;
    }
    if (txForm.type !== '移轉') {
      if (!txForm.warehouse) { showToast('館別為必填', 'error'); return; }
      if (!txForm.accountingSubject) { showToast('會計科目為必填', 'error'); return; }
      if (!txForm.supplierId) { showToast('廠商為必填', 'error'); return; }
      if (!txForm.invoiceNo) { showToast('發票號碼為必填', 'error'); return; }
      if (!txForm.invoiceAmount) { showToast('發票金額為必填', 'error'); return; }
      if (!txForm.invoiceDate) { showToast('發票日期為必填', 'error'); return; }
      if (!txForm.taxType) { showToast('發票稅項為必填', 'error'); return; }
      if (txForm.taxAmount === '') { showToast('發票稅金為必填', 'error'); return; }
    }
    try {
      const res = await fetch('/api/cashflow/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(txForm)
      });
      if (res.ok) {
        setShowTxForm(false);
        setTxForm({
          transactionDate: todayStr(),
          type: '支出',
          warehouse: '',
          accountId: '',
          categoryId: '',
          supplierId: '',
          paymentNo: '',
          amount: '',
          hasFee: false,
          fee: '',
          accountingSubject: '',
          paymentTerms: '',
          description: '',
          transferAccountId: '',
          invoiceNo: '',
          invoiceAmount: '',
          invoiceDate: '',
          taxType: '',
          taxAmount: ''
        });
        fetchTransactions();
        fetchAccounts();
      } else {
        const err = await res.json();
        showToast(err.error || '建立失敗', 'error');
      }
    } catch { showToast('建立交易失敗', 'error'); }
  }

  async function handleDeleteTransaction(id) {
    if (!(await confirm('確定要刪除此交易嗎？移轉交易將同時刪除配對交易。', { title: '刪除確認', danger: true }))) return;
    try {
      const res = await fetch(`/api/cashflow/transactions/${id}`, { method: 'DELETE' });
      if (res.ok) {
        fetchTransactions();
        fetchAccounts();
      } else {
        const err = await res.json();
        showToast(err.error || '刪除失敗', 'error');
      }
    } catch { showToast('刪除交易失敗', 'error'); }
  }

  // ==================== Helpers ====================
  function formatMoney(val) {
    const num = parseFloat(val) || 0;
    return `NT$ ${num.toLocaleString('zh-TW', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  function getAccountName(id) {
    const acc = accounts.find(a => a.id === id);
    return acc ? `${acc.warehouse}-${acc.name}` : '未知帳戶';
  }

  function getSupplierName(id) {
    const s = suppliers.find(s => s.id === id);
    return s ? s.name : '';
  }

  // Group accounts by type
  function getAccountsByType() {
    const grouped = {};
    for (const type of ACCOUNT_TYPES) {
      grouped[type] = accounts.filter(a => a.type === type);
    }
    return grouped;
  }

  // Filter categories by type for transaction form
  function getCategoriesForType(type) {
    if (type === '移轉') return [];
    const catType = type === '收入' ? '收入' : '支出';
    return categories.filter(c => c.type === catType && c.isActive);
  }

  if (loading) {
    return (
      <div className="min-h-screen page-bg-cashflow">
        <Navigation borderColor="border-emerald-600" />
        <main className="max-w-7xl mx-auto px-4 py-8">
          <div className="text-center py-16 text-gray-500">載入中...</div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen page-bg-cashflow">
      <Navigation borderColor="border-emerald-600" />
      <NotificationBanner moduleFilter="cashflow" />

      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold">現金流管理</h2>
          {activeTab === 'transactions' && (
            <ExportButtons
              data={transactions.map(tx => ({
                ...tx,
                accountName: tx.account?.name || '-',
                categoryName: tx.category?.name || '-',
                supplierName: tx.supplier?.name || '-',
              }))}
              columns={EXPORT_CONFIGS.cashflow.columns}
              exportName={EXPORT_CONFIGS.cashflow.filename}
              title="現金交易紀錄"
              sheetName="交易紀錄"
            />
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 border-b border-gray-200">
          {TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => {
                setActiveTab(tab.key);
                if (tab.key === 'transactions') fetchTransactions();
                if (tab.key === 'forecast') fetchSummary();
              }}
              className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
                activeTab === tab.key
                  ? 'bg-emerald-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {accountsError && (
          <FetchErrorBanner message={accountsError} onRetry={fetchAccounts} />
        )}
        {activeTab === 'transactions' && transactionsError && (
          <FetchErrorBanner message={transactionsError} onRetry={fetchTransactions} />
        )}

        {/* ==================== Tab 1: Account Overview ==================== */}
        {activeTab === 'overview' && (
          <OverviewTab
            accounts={accounts} warehouses={warehouses} isLoggedIn={isLoggedIn}
            pmsDashboard={pmsDashboard} overviewCategorySummary={overviewCategorySummary}
            showAccountForm={showAccountForm} setShowAccountForm={setShowAccountForm}
            accountForm={accountForm} setAccountForm={setAccountForm}
            handleCreateAccount={handleCreateAccount} handleSetPrimaryAccount={handleSetPrimaryAccount}
            handleDeleteAccount={handleDeleteAccount} formatMoney={formatMoney}
          />
        )}

        {/* ==================== Tab 2: Transactions ==================== */}
        {activeTab === 'transactions' && (
          <TransactionsTab
            accounts={accounts} suppliers={suppliers} warehouses={warehouses}
            accountingSubjects={accountingSubjects} categories={categories}
            isLoggedIn={isLoggedIn} noCatStats={noCatStats} setActiveTab={setActiveTab}
            txFilter={txFilter} setTxFilter={setTxFilter}
            txPage={txPage} setTxPage={setTxPage} txPagination={txPagination}
            transactions={transactions} sortedTransactions={sortedTransactions}
            cfTxKey={cfTxKey} cfTxDir={cfTxDir} cfTxToggle={cfTxToggle}
            showTxForm={showTxForm} setShowTxForm={setShowTxForm}
            txForm={txForm} setTxForm={setTxForm}
            handleCreateTransaction={handleCreateTransaction} handleDeleteTransaction={handleDeleteTransaction}
            fetchTransactions={fetchTransactions} formatMoney={formatMoney}
            getAccountName={getAccountName} getSupplierName={getSupplierName}
            getCategoriesForType={getCategoriesForType}
          />
        )}

        {/* ==================== Tab 3: Subject Query ==================== */}
        {activeTab === 'subject-query' && (
          <SubjectQueryTab
            warehouses={warehouses} accountingSubjects={accountingSubjects}
            subjectFilter={subjectFilter} setSubjectFilter={setSubjectFilter}
            subjectData={subjectData} subjectLoading={subjectLoading}
            fetchSubjectQuery={fetchSubjectQuery} formatMoney={formatMoney}
          />
        )}

        {/* ==================== Tab 4: Cash Flow Report ==================== */}
        {activeTab === 'report' && (
          <ReportTab
            reportFilter={reportFilter}
            setReportFilter={setReportFilter}
            warehouses={warehouses}
            suppliers={suppliers}
            reportData={reportData}
            fetchReport={fetchReport}
            formatMoney={formatMoney}
          />
        )}

        {/* ==================== Tab 5: Fund Forecast ==================== */}
        {activeTab === 'forecast' && (
          <ForecastTab
            forecastWarehouse={forecastWarehouse}
            setForecastWarehouse={setForecastWarehouse}
            warehouses={warehouses}
            summaryData={summaryData}
            fetchSummary={fetchSummary}
            formatMoney={formatMoney}
          />
        )}

        {/* === Cash Count Tab (spec26) === */}
        {activeTab === 'cash-count' && (
          <CashCountTabComponent accounts={accounts.filter(a => a.type === '現金')} warehouses={warehouses} />
        )}

        {/* ==================== Tab: 損益科目管理 ==================== */}
        {activeTab === 'category-mgmt' && (
          <CategoryMgmtTab
            noCatStats={noCatStats}
            seedLoading={seedLoading}
            handleSeedCategories={handleSeedCategories}
            batchCatForm={batchCatForm}
            setBatchCatForm={setBatchCatForm}
            batchLoading={batchLoading}
            handleBatchCategorize={handleBatchCategorize}
            categories={categories}
            showCategoryForm={showCategoryForm}
            setShowCategoryForm={setShowCategoryForm}
            categoryForm={categoryForm}
            setCategoryForm={setCategoryForm}
            handleCreateCategory={handleCreateCategory}
            editCatId={editCatId}
            setEditCatId={setEditCatId}
            editCatForm={editCatForm}
            setEditCatForm={setEditCatForm}
            handleUpdateCategory={handleUpdateCategory}
            handleDeleteCategory={handleDeleteCategory}
          />
        )}
      </main>
    </div>
  );
}
