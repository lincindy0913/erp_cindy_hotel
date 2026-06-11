'use client';

import { useState, useEffect, useMemo } from 'react';
import { useSession } from 'next-auth/react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useToast } from '@/context/ToastContext';
import { useColumnSort } from '@/components/SortableTh';
import { useConfirmDialog } from '@/components/ConfirmModal';

export const TABS = [
  { key: 'expenses', label: '公司費用' },
  { key: 'invoices', label: '工程進項' },
];

export const PERIODS = [
  '113.3-4', '113.5-6', '113.7-8', '113.9-10', '113.11-12',
  '114.1-2', '114.3-4', '114.5-6', '114.7-8', '114.9-10', '114.11-12',
  '115.1-2', '115.3-4',
];

export const MATERIAL_TYPES = [
  '鋼筋', '混凝土', '水泥', '泥水工', '混凝土工', '板模', '粗工', '鐵工',
  '機械作業', '衛生零件', '衛浴設備', '鋁門窗', '電梯', '化糞池',
  '三輪車', '通信', '雜項材料', '其他',
];

export const EMPTY_EXPENSE = {
  expenseDate: '', invoiceNo: '', invoiceType: '', vendorTaxId: '',
  vendorName: '', supplierId: '', itemName: '', amount: '', taxAmount: '', otherAmount: '', totalAmount: '', period: '', note: '',
};

export const EMPTY_INVOICE = {
  invoiceDate: '', invoiceNo: '', vendorTaxId: '', vendorName: '',
  supplierId: '', materialType: '', itemName: '', amount: '', taxAmount: '', totalAmount: '',
  projectId: '', location: '', period: '', note: '',
};

export function fmt(n) {
  if (n == null || n === '') return '—';
  const v = Number(n);
  return isNaN(v) ? '—' : v.toLocaleString('zh-TW');
}

export function sum(arr, key) {
  return arr.reduce((s, r) => s + Number(r[key] || 0), 0);
}

export function useCompanyExpenses() {
  const { data: session } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get('tab');
  const [activeTab, setActiveTab] = useState(() => (TABS.find(t => t.key === tabParam) ? tabParam : 'expenses'));

  const [expenses,   setExpenses]   = useState([]);
  const [invoices,   setInvoices]   = useState([]);
  const [projects,   setProjects]   = useState([]);
  const [suppliers,  setSuppliers]  = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [fetchError, setFetchError] = useState(null);
  const [periodFilter,  setPeriodFilter]  = useState('');
  const [projectFilter, setProjectFilter] = useState('');
  const [vendorFilter,  setVendorFilter]  = useState('');
  const [matFilter,     setMatFilter]     = useState('');

  const [showModal,    setShowModal]    = useState(false);
  const [editingRow,   setEditingRow]   = useState(null);
  const [saving,       setSaving]       = useState(false);
  const [expenseForm,  setExpenseForm]  = useState(EMPTY_EXPENSE);
  const [invoiceForm,  setInvoiceForm]  = useState(EMPTY_INVOICE);

  const [showCsvModal, setShowCsvModal] = useState(false);
  const [csvRows,      setCsvRows]      = useState([]);
  const [csvImporting, setCsvImporting] = useState(false);

  const { addToast } = useToast();
  const { dialog: confirmDlg, confirm: askConfirm, close: closeConfirm } = useConfirmDialog();

  const { sortKey: expKey, sortDir: expDir, toggleSort: expToggle } = useColumnSort('expenseDate', 'desc', 'companyExp');
  const { sortKey: invKey, sortDir: invDir, toggleSort: invToggle } = useColumnSort('invoiceDate', 'desc', 'companyInv');

  function switchTab(key) {
    setActiveTab(key);
    router.replace(`/company-expenses?tab=${key}`, { scroll: false });
  }

  async function load() {
    setLoading(true);
    setFetchError(null);
    try {
      const [eRes, iRes, pRes, sRes] = await Promise.all([
        fetch('/api/company-expenses?type=expense'),
        fetch('/api/company-expenses?type=invoice'),
        fetch('/api/engineering/projects'),
        fetch('/api/suppliers?limit=500'),
      ]);
      if (!eRes.ok || !iRes.ok) throw new Error('費用資料載入失敗');
      setExpenses(await eRes.json());
      setInvoices(await iRes.json());
      setProjects(pRes.ok ? await pRes.json() : []);
      const sData = sRes.ok ? await sRes.json() : [];
      setSuppliers(Array.isArray(sData) ? sData : (sData.data || []));
    } catch (e) {
      setFetchError(e.message || '費用資料載入失敗，請稍後再試');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  // ── filtered data ──────────────────────────────────────────────
  const filteredExpenses = useMemo(() => {
    let r = expenses;
    if (periodFilter) r = r.filter(e => e.period === periodFilter);
    if (vendorFilter)  r = r.filter(e => (e.vendorName || '').includes(vendorFilter));
    return r;
  }, [expenses, periodFilter, vendorFilter]);

  const filteredInvoices = useMemo(() => {
    let r = invoices;
    if (periodFilter)  r = r.filter(i => i.period === periodFilter);
    if (projectFilter) r = r.filter(i => String(i.projectId) === projectFilter);
    if (vendorFilter)  r = r.filter(i => (i.vendorName || '').includes(vendorFilter));
    if (matFilter)     r = r.filter(i => (i.materialType || '').includes(matFilter));
    return r;
  }, [invoices, periodFilter, projectFilter, vendorFilter, matFilter]);

  // ── modal helpers ──────────────────────────────────────────────
  function openAdd() {
    setEditingRow(null);
    if (activeTab === 'expenses') setExpenseForm({ ...EMPTY_EXPENSE });
    else setInvoiceForm({ ...EMPTY_INVOICE });
    setShowModal(true);
  }

  function openEdit(row) {
    setEditingRow(row);
    if (activeTab === 'expenses') {
      setExpenseForm({
        expenseDate: row.expenseDate || '', invoiceNo: row.invoiceNo || '',
        invoiceType: row.invoiceType || '', vendorTaxId: row.vendorTaxId || '',
        vendorName: row.vendorName || '', supplierId: row.supplierId ? String(row.supplierId) : '',
        itemName: row.itemName || '', amount: row.amount || '', taxAmount: row.taxAmount || '',
        otherAmount: row.otherAmount || '', totalAmount: row.totalAmount || '',
        period: row.period || '', note: row.note || '',
      });
    } else {
      setInvoiceForm({
        invoiceDate: row.invoiceDate || '', invoiceNo: row.invoiceNo || '',
        vendorTaxId: row.vendorTaxId || '', vendorName: row.vendorName || '',
        supplierId: row.supplierId ? String(row.supplierId) : '',
        materialType: row.materialType || '', itemName: row.itemName || '',
        amount: row.amount || '', taxAmount: row.taxAmount || '',
        totalAmount: row.totalAmount || '', projectId: row.projectId ? String(row.projectId) : '',
        location: row.location || '', period: row.period || '', note: row.note || '',
      });
    }
    setShowModal(true);
  }

  async function saveExpense() {
    if (!expenseForm.expenseDate) { addToast('請填寫日期', 'error'); return; }
    setSaving(true);
    try {
      const url    = editingRow ? `/api/company-expenses/expense/${editingRow.id}` : '/api/company-expenses';
      const method = editingRow ? 'PUT' : 'POST';
      const body   = editingRow ? expenseForm : { ...expenseForm, type: 'expense' };
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error(await res.text());
      const row = await res.json();
      if (editingRow) {
        setExpenses(prev => prev.map(e => e.id === row.id ? row : e));
      } else {
        setExpenses(prev => [row, ...prev]);
      }
      setShowModal(false);
      addToast(editingRow ? '已更新' : '已新增', 'success');
    } catch (e) {
      addToast('儲存失敗：' + e.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  async function saveInvoice() {
    if (!invoiceForm.invoiceDate) { addToast('請填寫日期', 'error'); return; }
    setSaving(true);
    try {
      const url    = editingRow ? `/api/company-expenses/input-invoice/${editingRow.id}` : '/api/company-expenses';
      const method = editingRow ? 'PUT' : 'POST';
      const body   = editingRow ? invoiceForm : { ...invoiceForm, type: 'invoice' };
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error(await res.text());
      const row = await res.json();
      if (editingRow) {
        setInvoices(prev => prev.map(i => i.id === row.id ? row : i));
      } else {
        setInvoices(prev => [row, ...prev]);
      }
      setShowModal(false);
      addToast(editingRow ? '已更新' : '已新增', 'success');
    } catch (e) {
      addToast('儲存失敗：' + e.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  function deleteRow(row) {
    const label = activeTab === 'expenses'
      ? `${row.expenseDate || ''} ${row.vendorName || ''} NT$${Number(row.totalAmount || 0).toLocaleString('zh-TW')}`
      : `${row.invoiceDate || ''} ${row.vendorName || ''} ${row.invoiceNo || ''}`;
    askConfirm(`確定刪除？\n${label.trim()}`, async () => {
      const url = activeTab === 'expenses'
        ? `/api/company-expenses/expense/${row.id}`
        : `/api/company-expenses/input-invoice/${row.id}`;
      try {
        const res = await fetch(url, { method: 'DELETE' });
        if (!res.ok) throw new Error(await res.text());
        if (activeTab === 'expenses') setExpenses(prev => prev.filter(e => e.id !== row.id));
        else setInvoices(prev => prev.filter(i => i.id !== row.id));
        addToast('已刪除', 'success');
      } catch (e) {
        addToast('刪除失敗：' + e.message, 'error');
      }
    }, '確認刪除');
  }

  function downloadCsvTemplate() {
    const header  = '日期,發票號碼,廠商統編,廠商名稱,材料別,品名,未稅,稅額,總計,地點,期間,備註';
    const example = '2026-01-15,AB12345678,12345678,範例廠商有限公司,鋼筋,鋼筋材料,100000,5000,105000,台北市,114.1-2,備註說明';
    const blob = new Blob(['﻿' + header + '\n' + example], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = '工程進項匯入範本.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function parseCsv(text) {
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) return [];
    const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
    const COL_MAP = {
      '日期': 'invoiceDate', '發票日期': 'invoiceDate',
      '發票號碼': 'invoiceNo', '統編': 'vendorTaxId', '廠商統編': 'vendorTaxId',
      '廠商名稱': 'vendorName', '廠商': 'vendorName',
      '材料別': 'materialType', '材料類別': 'materialType',
      '品名': 'itemName', '材料名稱': 'itemName',
      '未稅': 'amount', '未稅金額': 'amount',
      '稅額': 'taxAmount', '含稅': 'totalAmount', '總計': 'totalAmount', '合計': 'totalAmount',
      '地點': 'location', '期間': 'period', '備註': 'note',
    };
    return lines.slice(1).map(line => {
      const vals = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''));
      const row = { ...EMPTY_INVOICE };
      headers.forEach((h, i) => {
        const key = COL_MAP[h];
        if (key) row[key] = vals[i] || '';
      });
      return row;
    }).filter(r => r.invoiceDate || r.vendorName);
  }

  function handleCsvFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const rows = parseCsv(ev.target.result);
      setCsvRows(rows);
      setShowCsvModal(true);
    };
    reader.readAsText(file, 'UTF-8');
    e.target.value = '';
  }

  async function importCsvRows() {
    if (!csvRows.length) return;
    setCsvImporting(true);
    let ok = 0; let fail = 0;
    for (const row of csvRows) {
      try {
        const res = await fetch('/api/company-expenses', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...row, type: 'invoice' }),
        });
        if (res.ok) ok++; else fail++;
      } catch { fail++; }
    }
    setCsvImporting(false);
    setShowCsvModal(false);
    setCsvRows([]);
    await load();
    addToast(`匯入完成：${ok} 筆成功${fail > 0 ? `，${fail} 筆失敗` : ''}`, fail > 0 ? 'error' : 'success');
  }

  function clearFilters() {
    setPeriodFilter('');
    setProjectFilter('');
    setVendorFilter('');
    setMatFilter('');
  }

  return {
    session,
    activeTab, switchTab,
    loading, fetchError, load,
    expenses, invoices, projects, suppliers,
    filteredExpenses, filteredInvoices,
    periodFilter, setPeriodFilter,
    projectFilter, setProjectFilter,
    vendorFilter, setVendorFilter,
    matFilter, setMatFilter,
    clearFilters,
    showModal, setShowModal,
    editingRow,
    saving,
    expenseForm, setExpenseForm,
    invoiceForm, setInvoiceForm,
    openAdd, openEdit,
    saveExpense, saveInvoice,
    deleteRow,
    showCsvModal, setShowCsvModal,
    csvRows, setCsvRows,
    csvImporting,
    handleCsvFile, importCsvRows,
    downloadCsvTemplate,
    expKey, expDir, expToggle,
    invKey, invDir, invToggle,
    confirmDlg, closeConfirm,
  };
}
