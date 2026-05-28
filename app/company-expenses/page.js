'use client';

import { useState, useEffect, useMemo, Suspense } from 'react';
import { useSession } from 'next-auth/react';
import { useSearchParams, useRouter } from 'next/navigation';
import Navigation from '@/components/Navigation';
import { useToast } from '@/context/ToastContext';
import { sortRows, useColumnSort, SortableThInline } from '@/components/SortableTh';
import ExportButtons from '@/components/ExportButtons';
import ConfirmModal, { useConfirmDialog } from '@/components/ConfirmModal';

const TABS = [
  { key: 'expenses',  label: '公司費用' },
  { key: 'invoices',  label: '工程進項' },
];

const PERIODS = [
  '113.3-4', '113.5-6', '113.7-8', '113.9-10', '113.11-12',
  '114.1-2', '114.3-4', '114.5-6', '114.7-8', '114.9-10', '114.11-12',
  '115.1-2', '115.3-4',
];

const MATERIAL_TYPES = [
  '鋼筋', '混凝土', '水泥', '泥水工', '混凝土工', '板模', '粗工', '鐵工',
  '機械作業', '衛生零件', '衛浴設備', '鋁門窗', '電梯', '化糞池',
  '三輪車', '通信', '雜項材料', '其他',
];

function fmt(n) {
  if (n == null || n === '') return '—';
  const v = Number(n);
  return isNaN(v) ? '—' : v.toLocaleString('zh-TW');
}

function sum(arr, key) {
  return arr.reduce((s, r) => s + Number(r[key] || 0), 0);
}

const EMPTY_EXPENSE = {
  expenseDate: '', invoiceNo: '', invoiceType: '', vendorTaxId: '',
  vendorName: '', itemName: '', amount: '', taxAmount: '', otherAmount: '', totalAmount: '', period: '', note: '',
};

const EMPTY_INVOICE = {
  invoiceDate: '', invoiceNo: '', vendorTaxId: '', vendorName: '',
  materialType: '', itemName: '', amount: '', taxAmount: '', totalAmount: '',
  projectId: '', location: '', period: '', note: '',
};

function CompanyExpensesPageInner() {
  const { data: session } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get('tab');
  const [activeTab, setActiveTab] = useState(() => (TABS.find(t => t.key === tabParam) ? tabParam : 'expenses'));

  const [expenses,   setExpenses]   = useState([]);
  const [invoices,   setInvoices]   = useState([]);
  const [projects,   setProjects]   = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [periodFilter, setPeriodFilter] = useState('');
  const [projectFilter, setProjectFilter] = useState('');
  const [vendorFilter,  setVendorFilter]  = useState('');
  const [matFilter,     setMatFilter]     = useState('');

  const [showModal,     setShowModal]     = useState(false);
  const [editingRow,    setEditingRow]    = useState(null);
  const [saving,        setSaving]        = useState(false);
  const [expenseForm,   setExpenseForm]   = useState(EMPTY_EXPENSE);
  const [invoiceForm,   setInvoiceForm]   = useState(EMPTY_INVOICE);

  const [showCsvModal,  setShowCsvModal]  = useState(false);
  const [csvRows,       setCsvRows]       = useState([]);
  const [csvImporting,  setCsvImporting]  = useState(false);

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
    try {
      const [eRes, iRes, pRes] = await Promise.all([
        fetch('/api/company-expenses?type=expense'),
        fetch('/api/company-expenses?type=invoice'),
        fetch('/api/engineering/projects'),
      ]);
      setExpenses(await eRes.json());
      setInvoices(await iRes.json());
      setProjects(await pRes.json());
    } catch (e) {
      addToast('載入失敗：' + e.message, 'error');
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
        vendorName: row.vendorName || '', itemName: row.itemName || '',
        amount: row.amount || '', taxAmount: row.taxAmount || '',
        otherAmount: row.otherAmount || '', totalAmount: row.totalAmount || '',
        period: row.period || '', note: row.note || '',
      });
    } else {
      setInvoiceForm({
        invoiceDate: row.invoiceDate || '', invoiceNo: row.invoiceNo || '',
        vendorTaxId: row.vendorTaxId || '', vendorName: row.vendorName || '',
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
      const url  = editingRow ? `/api/company-expenses/expense/${editingRow.id}` : '/api/company-expenses';
      const method = editingRow ? 'PUT' : 'POST';
      const body = editingRow ? expenseForm : { ...expenseForm, type: 'expense' };
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
      const url  = editingRow ? `/api/company-expenses/input-invoice/${editingRow.id}` : '/api/company-expenses';
      const method = editingRow ? 'PUT' : 'POST';
      const body = editingRow ? invoiceForm : { ...invoiceForm, type: 'invoice' };
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
    const header = '日期,發票號碼,廠商統編,廠商名稱,材料別,品名,未稅,稅額,總計,地點,期間,備註';
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

  if (!session) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />
      <div className="max-w-screen-xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold text-gray-900">慶豐營造工程分業</h1>
          <div className="flex items-center gap-2">
            {activeTab === 'invoices' && (
              <>
                <button onClick={downloadCsvTemplate}
                  className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 border border-gray-300">
                  ↓ 下載範本
                </button>
                <label className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 cursor-pointer">
                  ↑ 匯入 CSV
                  <input type="file" accept=".csv" className="hidden" onChange={handleCsvFile} />
                </label>
              </>
            )}
            <button onClick={openAdd} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
              + 新增
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-4 border-b border-gray-200">
          {TABS.map(t => (
            <button key={t.key} onClick={() => switchTab(t.key)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === t.key ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-2 mb-4">
          <select value={periodFilter} onChange={e => setPeriodFilter(e.target.value)}
            className="border rounded-lg px-3 py-1.5 text-sm">
            <option value="">全部期間</option>
            {PERIODS.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          {activeTab === 'invoices' && (
            <>
              <select value={projectFilter} onChange={e => setProjectFilter(e.target.value)}
                className="border rounded-lg px-3 py-1.5 text-sm">
                <option value="">全部工程</option>
                {projects.map(p => <option key={p.id} value={String(p.id)}>{p.name}</option>)}
              </select>
              <select value={matFilter} onChange={e => setMatFilter(e.target.value)}
                className="border rounded-lg px-3 py-1.5 text-sm">
                <option value="">全部材料別</option>
                {MATERIAL_TYPES.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </>
          )}
          <input value={vendorFilter} onChange={e => setVendorFilter(e.target.value)}
            placeholder="廠商名稱搜尋…" className="border rounded-lg px-3 py-1.5 text-sm w-44" />
          <button onClick={() => { setPeriodFilter(''); setProjectFilter(''); setVendorFilter(''); setMatFilter(''); }}
            className="px-3 py-1.5 border rounded-lg text-sm text-gray-600 hover:bg-gray-50">清除</button>
        </div>

        {loading ? (
          <div className="text-center py-20 text-gray-400">載入中…</div>
        ) : (
          <>
            {/* ===== 公司費用 Tab ===== */}
            {activeTab === 'expenses' && (
              <>
                <div className="text-sm text-gray-500 mb-2">
                  共 {filteredExpenses.length} 筆 ／ 總計 NT$ {sum(filteredExpenses, 'totalAmount').toLocaleString('zh-TW')}
                </div>
                <div className="tbl-wrap">
                  <table className="min-w-full text-sm">
                    <thead className="bg-gray-50 text-gray-600">
                      <tr>
                        <SortableThInline label="日期" colKey="expenseDate" sortKey={expKey} sortDir={expDir} onSort={expToggle} thStyle={{ padding: '8px 12px', textAlign: 'left' }} />
                        <th className="px-3 py-2 text-left">發票號碼</th>
                        <th className="px-3 py-2 text-left">廠商名稱</th>
                        <th className="px-3 py-2 text-left">品名</th>
                        <SortableThInline label="未稅" colKey="amount" sortKey={expKey} sortDir={expDir} onSort={expToggle} thStyle={{ padding: '8px 12px', textAlign: 'right' }} />
                        <SortableThInline label="稅額" colKey="taxAmount" sortKey={expKey} sortDir={expDir} onSort={expToggle} thStyle={{ padding: '8px 12px', textAlign: 'right' }} />
                        <th className="px-3 py-2 text-right">其他</th>
                        <SortableThInline label="總計" colKey="totalAmount" sortKey={expKey} sortDir={expDir} onSort={expToggle} thStyle={{ padding: '8px 12px', textAlign: 'right' }} />
                        <th className="px-3 py-2 text-left">期間</th>
                        <th className="px-3 py-2 text-left">備註</th>
                        <th className="px-3 py-2" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {filteredExpenses.length === 0 ? (
                        <tr><td colSpan={11} className="px-3 py-8 text-center text-gray-400">無資料</td></tr>
                      ) : sortRows(filteredExpenses, expKey, expDir).map(row => (
                        <tr key={row.id} className="hover:bg-gray-50">
                          <td className="px-3 py-2 whitespace-nowrap">{row.expenseDate}</td>
                          <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-500">{row.invoiceNo}</td>
                          <td className="px-3 py-2">{row.vendorName}</td>
                          <td className="px-3 py-2 max-w-[200px] truncate">{row.itemName}</td>
                          <td className="px-3 py-2 text-right">{fmt(row.amount)}</td>
                          <td className="px-3 py-2 text-right text-gray-500">{fmt(row.taxAmount)}</td>
                          <td className="px-3 py-2 text-right text-gray-500">{fmt(row.otherAmount) === '—' || Number(row.otherAmount) === 0 ? '' : fmt(row.otherAmount)}</td>
                          <td className="px-3 py-2 text-right font-medium">{fmt(row.totalAmount)}</td>
                          <td className="px-3 py-2 text-xs text-gray-400">{row.period}</td>
                          <td className="px-3 py-2 text-xs text-gray-400 max-w-[150px] truncate">{row.note}</td>
                          <td className="px-3 py-2 whitespace-nowrap">
                            <button onClick={() => openEdit(row)} className="text-blue-600 hover:underline text-xs mr-2">編輯</button>
                            <button onClick={() => deleteRow(row)} className="text-red-500 hover:underline text-xs">刪除</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    {filteredExpenses.length > 0 && (
                      <tfoot className="bg-gray-50 font-medium">
                        <tr>
                          <td colSpan={4} className="px-3 py-2 text-gray-600">合計 {filteredExpenses.length} 筆</td>
                          <td className="px-3 py-2 text-right">{sum(filteredExpenses, 'amount').toLocaleString('zh-TW')}</td>
                          <td className="px-3 py-2 text-right text-gray-500">{sum(filteredExpenses, 'taxAmount').toLocaleString('zh-TW')}</td>
                          <td className="px-3 py-2 text-right text-gray-500">{sum(filteredExpenses, 'otherAmount').toLocaleString('zh-TW')}</td>
                          <td className="px-3 py-2 text-right text-blue-700">{sum(filteredExpenses, 'totalAmount').toLocaleString('zh-TW')}</td>
                          <td colSpan={3} />
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              </>
            )}

            {/* ===== 工程進項 Tab ===== */}
            {activeTab === 'invoices' && (
              <>
                <div className="text-sm text-gray-500 mb-2">
                  共 {filteredInvoices.length} 筆 ／ 總計 NT$ {sum(filteredInvoices, 'totalAmount').toLocaleString('zh-TW')}
                </div>
                <div className="tbl-wrap">
                  <table className="min-w-full text-sm">
                    <thead className="bg-gray-50 text-gray-600">
                      <tr>
                        <SortableThInline label="日期" colKey="invoiceDate" sortKey={invKey} sortDir={invDir} onSort={invToggle} thStyle={{ padding: '8px 12px', textAlign: 'left' }} />
                        <th className="px-3 py-2 text-left">發票號碼</th>
                        <SortableThInline label="材料別" colKey="materialType" sortKey={invKey} sortDir={invDir} onSort={invToggle} thStyle={{ padding: '8px 12px', textAlign: 'left' }} />
                        <th className="px-3 py-2 text-left">廠商名稱</th>
                        <th className="px-3 py-2 text-left">材料名稱</th>
                        <SortableThInline label="未稅" colKey="amount" sortKey={invKey} sortDir={invDir} onSort={invToggle} thStyle={{ padding: '8px 12px', textAlign: 'right' }} />
                        <SortableThInline label="稅額" colKey="taxAmount" sortKey={invKey} sortDir={invDir} onSort={invToggle} thStyle={{ padding: '8px 12px', textAlign: 'right' }} />
                        <SortableThInline label="總計" colKey="totalAmount" sortKey={invKey} sortDir={invDir} onSort={invToggle} thStyle={{ padding: '8px 12px', textAlign: 'right' }} />
                        <th className="px-3 py-2 text-left">工程案</th>
                        <th className="px-3 py-2 text-left">地點</th>
                        <th className="px-3 py-2 text-left">期間</th>
                        <th className="px-3 py-2 text-left">備註</th>
                        <th className="px-3 py-2" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {filteredInvoices.length === 0 ? (
                        <tr><td colSpan={13} className="px-3 py-8 text-center text-gray-400">無資料</td></tr>
                      ) : sortRows(filteredInvoices, invKey, invDir).map(row => (
                        <tr key={row.id} className="hover:bg-gray-50">
                          <td className="px-3 py-2 whitespace-nowrap">{row.invoiceDate}</td>
                          <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-500">{row.invoiceNo}</td>
                          <td className="px-3 py-2">
                            <span className="px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded text-xs">{row.materialType}</span>
                          </td>
                          <td className="px-3 py-2">{row.vendorName}</td>
                          <td className="px-3 py-2 max-w-[180px] truncate">{row.itemName}</td>
                          <td className="px-3 py-2 text-right">{fmt(row.amount)}</td>
                          <td className="px-3 py-2 text-right text-gray-500">{fmt(row.taxAmount)}</td>
                          <td className="px-3 py-2 text-right font-medium">{fmt(row.totalAmount)}</td>
                          <td className="px-3 py-2 text-xs text-gray-600">{row.project?.name || '—'}</td>
                          <td className="px-3 py-2 text-xs text-gray-400 max-w-[120px] truncate">{row.location}</td>
                          <td className="px-3 py-2 text-xs text-gray-400">{row.period}</td>
                          <td className="px-3 py-2 text-xs text-gray-400 max-w-[150px] truncate">{row.note}</td>
                          <td className="px-3 py-2 whitespace-nowrap">
                            <button onClick={() => openEdit(row)} className="text-blue-600 hover:underline text-xs mr-2">編輯</button>
                            <button onClick={() => deleteRow(row)} className="text-red-500 hover:underline text-xs">刪除</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    {filteredInvoices.length > 0 && (
                      <tfoot className="bg-gray-50 font-medium">
                        <tr>
                          <td colSpan={5} className="px-3 py-2 text-gray-600">合計 {filteredInvoices.length} 筆</td>
                          <td className="px-3 py-2 text-right">{sum(filteredInvoices, 'amount').toLocaleString('zh-TW')}</td>
                          <td className="px-3 py-2 text-right text-gray-500">{sum(filteredInvoices, 'taxAmount').toLocaleString('zh-TW')}</td>
                          <td className="px-3 py-2 text-right text-blue-700">{sum(filteredInvoices, 'totalAmount').toLocaleString('zh-TW')}</td>
                          <td colSpan={5} />
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              </>
            )}
          </>
        )}
      </div>

      {/* ===== CSV 匯入預覽 Modal ===== */}
      {showCsvModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
            <div className="px-6 py-4 border-b flex items-center justify-between">
              <h3 className="text-lg font-bold">CSV 匯入預覽（工程進項）</h3>
              <button onClick={() => { setShowCsvModal(false); setCsvRows([]); }}
                className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
            </div>
            <div className="px-6 py-3 text-sm text-gray-500 bg-gray-50 border-b">
              共 <span className="font-semibold text-gray-800">{csvRows.length}</span> 筆資料。確認後點「確認匯入」。
              <span className="ml-2 text-xs text-gray-400">CSV 欄位：日期, 發票號碼, 廠商統編, 廠商名稱, 材料別, 品名, 未稅, 稅額, 總計, 地點, 期間, 備註</span>
            </div>
            <div className="overflow-auto flex-1">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-gray-100 text-gray-600">
                  <tr>
                    {['日期','發票號碼','廠商名稱','材料別','品名','未稅','稅額','總計','地點','期間'].map(h => (
                      <th key={h} className="px-3 py-2 text-left whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {csvRows.map((r, i) => (
                    <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                      <td className="px-3 py-1.5 whitespace-nowrap">{r.invoiceDate}</td>
                      <td className="px-3 py-1.5 font-mono text-gray-500">{r.invoiceNo}</td>
                      <td className="px-3 py-1.5 max-w-[120px] truncate">{r.vendorName}</td>
                      <td className="px-3 py-1.5">{r.materialType}</td>
                      <td className="px-3 py-1.5 max-w-[150px] truncate">{r.itemName}</td>
                      <td className="px-3 py-1.5 text-right">{r.amount}</td>
                      <td className="px-3 py-1.5 text-right text-gray-500">{r.taxAmount}</td>
                      <td className="px-3 py-1.5 text-right font-medium">{r.totalAmount}</td>
                      <td className="px-3 py-1.5">{r.location}</td>
                      <td className="px-3 py-1.5">{r.period}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-6 py-4 border-t flex justify-end gap-3">
              <button onClick={() => { setShowCsvModal(false); setCsvRows([]); }}
                className="px-4 py-2 border rounded-lg text-sm text-gray-600 hover:bg-gray-50">取消</button>
              <button onClick={importCsvRows} disabled={csvImporting || !csvRows.length}
                className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50">
                {csvImporting ? '匯入中…' : `確認匯入 ${csvRows.length} 筆`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== Modal ===== */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onKeyDown={e => { if (e.key === 'Escape') setShowModal(false); }}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
            onKeyDown={e => { if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA' && e.target.tagName !== 'SELECT' && !saving) (activeTab === 'expenses' ? saveExpense : saveInvoice)(); }}>
            <div className="px-6 py-4 border-b">
              <h3 className="text-lg font-bold">
                {editingRow ? '編輯' : '新增'}
                {activeTab === 'expenses' ? '公司費用' : '工程進項'}
              </h3>
            </div>
            <div className="px-6 py-4 space-y-3">
              {activeTab === 'expenses' ? (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-gray-600">日期 *</label>
                      <input type="date" value={expenseForm.expenseDate}
                        onChange={e => setExpenseForm(f => ({ ...f, expenseDate: e.target.value }))}
                        className="w-full border rounded px-2 py-1.5 text-sm" />
                    </div>
                    <div>
                      <label className="text-xs text-gray-600">期間</label>
                      <select value={expenseForm.period}
                        onChange={e => setExpenseForm(f => ({ ...f, period: e.target.value }))}
                        className="w-full border rounded px-2 py-1.5 text-sm">
                        <option value="">—</option>
                        {PERIODS.map(p => <option key={p} value={p}>{p}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-gray-600">發票號碼</label>
                      <input value={expenseForm.invoiceNo}
                        onChange={e => setExpenseForm(f => ({ ...f, invoiceNo: e.target.value }))}
                        className="w-full border rounded px-2 py-1.5 text-sm" />
                    </div>
                    <div>
                      <label className="text-xs text-gray-600">廠商統編</label>
                      <input value={expenseForm.vendorTaxId}
                        onChange={e => setExpenseForm(f => ({ ...f, vendorTaxId: e.target.value }))}
                        className="w-full border rounded px-2 py-1.5 text-sm" />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-gray-600">廠商名稱</label>
                    <input value={expenseForm.vendorName}
                      onChange={e => setExpenseForm(f => ({ ...f, vendorName: e.target.value }))}
                      className="w-full border rounded px-2 py-1.5 text-sm" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-600">品名</label>
                    <input value={expenseForm.itemName}
                      onChange={e => setExpenseForm(f => ({ ...f, itemName: e.target.value }))}
                      className="w-full border rounded px-2 py-1.5 text-sm" />
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    <div>
                      <label className="text-xs text-gray-600">銷售額</label>
                      <input type="number" value={expenseForm.amount}
                        onChange={e => setExpenseForm(f => ({ ...f, amount: e.target.value }))}
                        className="w-full border rounded px-2 py-1.5 text-sm" />
                    </div>
                    <div>
                      <label className="text-xs text-gray-600">稅額</label>
                      <input type="number" value={expenseForm.taxAmount}
                        onChange={e => setExpenseForm(f => ({ ...f, taxAmount: e.target.value }))}
                        className="w-full border rounded px-2 py-1.5 text-sm" />
                    </div>
                    <div>
                      <label className="text-xs text-gray-600">其他費用</label>
                      <input type="number" value={expenseForm.otherAmount}
                        onChange={e => setExpenseForm(f => ({ ...f, otherAmount: e.target.value }))}
                        className="w-full border rounded px-2 py-1.5 text-sm" />
                    </div>
                    <div>
                      <label className="text-xs text-gray-600">總計</label>
                      <input type="number" value={expenseForm.totalAmount}
                        onChange={e => setExpenseForm(f => ({ ...f, totalAmount: e.target.value }))}
                        className="w-full border rounded px-2 py-1.5 text-sm" />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-gray-600">備註</label>
                    <input value={expenseForm.note}
                      onChange={e => setExpenseForm(f => ({ ...f, note: e.target.value }))}
                      className="w-full border rounded px-2 py-1.5 text-sm" />
                  </div>
                </>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-gray-600">日期 *</label>
                      <input type="date" value={invoiceForm.invoiceDate}
                        onChange={e => setInvoiceForm(f => ({ ...f, invoiceDate: e.target.value }))}
                        className="w-full border rounded px-2 py-1.5 text-sm" />
                    </div>
                    <div>
                      <label className="text-xs text-gray-600">期間</label>
                      <select value={invoiceForm.period}
                        onChange={e => setInvoiceForm(f => ({ ...f, period: e.target.value }))}
                        className="w-full border rounded px-2 py-1.5 text-sm">
                        <option value="">—</option>
                        {PERIODS.map(p => <option key={p} value={p}>{p}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-gray-600">發票號碼</label>
                      <input value={invoiceForm.invoiceNo}
                        onChange={e => setInvoiceForm(f => ({ ...f, invoiceNo: e.target.value }))}
                        className="w-full border rounded px-2 py-1.5 text-sm" />
                    </div>
                    <div>
                      <label className="text-xs text-gray-600">廠商統編</label>
                      <input value={invoiceForm.vendorTaxId}
                        onChange={e => setInvoiceForm(f => ({ ...f, vendorTaxId: e.target.value }))}
                        className="w-full border rounded px-2 py-1.5 text-sm" />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-gray-600">廠商名稱</label>
                    <input value={invoiceForm.vendorName}
                      onChange={e => setInvoiceForm(f => ({ ...f, vendorName: e.target.value }))}
                      className="w-full border rounded px-2 py-1.5 text-sm" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-gray-600">材料別</label>
                      <select value={invoiceForm.materialType}
                        onChange={e => setInvoiceForm(f => ({ ...f, materialType: e.target.value }))}
                        className="w-full border rounded px-2 py-1.5 text-sm">
                        <option value="">—</option>
                        {MATERIAL_TYPES.map(m => <option key={m} value={m}>{m}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-gray-600">工程案</label>
                      <select value={invoiceForm.projectId}
                        onChange={e => setInvoiceForm(f => ({ ...f, projectId: e.target.value }))}
                        className="w-full border rounded px-2 py-1.5 text-sm">
                        <option value="">—</option>
                        {projects.map(p => <option key={p.id} value={String(p.id)}>{p.name}</option>)}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-gray-600">材料名稱</label>
                    <input value={invoiceForm.itemName}
                      onChange={e => setInvoiceForm(f => ({ ...f, itemName: e.target.value }))}
                      className="w-full border rounded px-2 py-1.5 text-sm" />
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="text-xs text-gray-600">金額</label>
                      <input type="number" value={invoiceForm.amount}
                        onChange={e => setInvoiceForm(f => ({ ...f, amount: e.target.value }))}
                        className="w-full border rounded px-2 py-1.5 text-sm" />
                    </div>
                    <div>
                      <label className="text-xs text-gray-600">稅金</label>
                      <input type="number" value={invoiceForm.taxAmount}
                        onChange={e => setInvoiceForm(f => ({ ...f, taxAmount: e.target.value }))}
                        className="w-full border rounded px-2 py-1.5 text-sm" />
                    </div>
                    <div>
                      <label className="text-xs text-gray-600">總金額</label>
                      <input type="number" value={invoiceForm.totalAmount}
                        onChange={e => setInvoiceForm(f => ({ ...f, totalAmount: e.target.value }))}
                        className="w-full border rounded px-2 py-1.5 text-sm" />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-gray-600">地點</label>
                    <input value={invoiceForm.location}
                      onChange={e => setInvoiceForm(f => ({ ...f, location: e.target.value }))}
                      className="w-full border rounded px-2 py-1.5 text-sm" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-600">備註</label>
                    <input value={invoiceForm.note}
                      onChange={e => setInvoiceForm(f => ({ ...f, note: e.target.value }))}
                      className="w-full border rounded px-2 py-1.5 text-sm" />
                  </div>
                </>
              )}
            </div>
            <div className="px-6 py-4 border-t flex justify-end gap-2">
              <button onClick={() => setShowModal(false)} disabled={saving}
                className="px-4 py-2 border rounded-lg text-sm">取消</button>
              <button onClick={activeTab === 'expenses' ? saveExpense : saveInvoice}
                disabled={saving}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm disabled:opacity-50">
                {saving ? '儲存中…' : '儲存'}
              </button>
            </div>
          </div>
        </div>
      )}
      <ConfirmModal dialog={confirmDlg} onClose={closeConfirm} />
    </div>
  );
}

export default function CompanyExpensesPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-50 flex items-center justify-center text-gray-400">載入中…</div>}>
      <CompanyExpensesPageInner />
    </Suspense>
  );
}
