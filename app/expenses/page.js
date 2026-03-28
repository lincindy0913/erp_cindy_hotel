'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import Navigation from '@/components/Navigation';
import ExportButtons from '@/components/ExportButtons';
import { useToast } from '@/context/ToastContext';
import { sortRows, useColumnSort, SortableThInline } from '@/components/SortableTh';

// 進銷存每月費用已移至 /purchasing 小分頁
const MAIN_TABS = [
  { key: 'fixed', label: '固定費用' }
];

const SUB_TABS = [
  { key: 'templates', label: '費用範本' },
  { key: 'execute', label: '快速執行' },
  { key: 'records', label: '執行記錄' }
];

const EMPTY_ENTRY_LINE = {
  entryType: 'debit',
  accountingCode: '',
  accountingName: '',
  summary: '',
  defaultAmount: '',
  supplierId: '',      // 廠商（選填）
  supplierName: '',
  warehouse: '',       // 館別
  paymentMethod: '',   // 付款方式
  accountId: '',       // 轉帳存簿 (CashAccount id)
  advancedBy: '',      // 代墊員工 (信用卡/員工代付)
  note: ''             // 備註
};

const PAYMENT_METHODS = ['月結', '現金', '轉帳', '支票', '匯款', '信用卡', '員工代付'];

const EMPTY_PURCHASE_ITEM = {
  productId: '',
  quantity: 1,
  unitPrice: '',
  note: ''
};

export default function ExpensesPage() {
  const { data: session } = useSession();
  const { showToast } = useToast();
  const isLoggedIn = !!session;
  const [mainTab, setMainTab] = useState('fixed');
  const [subTab, setSubTab] = useState('templates');

  // Shared data
  const [templates, setTemplates] = useState([]);
  const [categories, setCategories] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [products, setProducts] = useState([]);
  const [accountingSubjects, setAccountingSubjects] = useState([]);
  const [cashAccounts, setCashAccounts] = useState([]);  // 存簿 (CashAccount)
  const [loading, setLoading] = useState(true);

  // Template tab state
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

  // Records tab state
  const [records, setRecords] = useState([]);
  const [recordsTotal, setRecordsTotal] = useState(0);
  const [recordsLoading, setRecordsLoading] = useState(false);
  const [recordFilter, setRecordFilter] = useState({
    month: new Date().toISOString().slice(0, 7),
    warehouse: '',
    status: ''
  });
  const [expandedRecord, setExpandedRecord] = useState(null);
  const { sortKey: expRecSortKey, sortDir: expRecSortDir, toggleSort: toggleExpRecSort } = useColumnSort('recordNo', 'desc');
  const sortedExpenseRecords = useMemo(
    () =>
      sortRows(records, expRecSortKey, expRecSortDir, {
        recordNo: (r) => r.recordNo || '',
        templateName: (r) => r.template?.name || '',
        expenseMonth: (r) => r.expenseMonth || '',
        warehouse: (r) => r.warehouse || '',
        totalDebit: (r) => Number(r.totalDebit || 0),
        relatedNos: (r) => [r.purchaseNo, r.salesNo, r.paymentOrderNo].filter(Boolean).join('|'),
        paymentStatus: (r) => r.paymentStatus || r.status || '',
      }),
    [records, expRecSortKey, expRecSortDir]
  );
  const [voidReason, setVoidReason] = useState('');
  const [showVoidModal, setShowVoidModal] = useState(null);
  const [editingRecord, setEditingRecord] = useState(null);  // record object being edited
  const [editForm, setEditForm] = useState({ entryLines: [], note: '', paymentMethod: '' });

  // Execute tab state
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [executeForm, setExecuteForm] = useState({
    warehouse: '',
    expenseMonth: new Date().toISOString().slice(0, 7),
    supplierId: '',
    supplierName: '',
    paymentMethod: '',
    paymentTerms: '',
    note: '',
    entryLines: [],
    items: [],
    invoiceNo: '',
    invoiceDate: '',
    invoiceTitle: '',
    taxType: '',
    department: '',
    warehouseAmounts: [],
    checkIssueDate: '',
    checkDate: '',
    checkNo: '',
    checkAccountId: '',
    checkNote: ''
  });
  const [duplicateWarning, setDuplicateWarning] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchAll();
  }, []);

  useEffect(() => {
    if (subTab === 'records') fetchRecords();
  }, [subTab, mainTab, recordFilter]);

  useEffect(() => {
    // Reset selection when switching main tabs
    setSelectedTemplateId('');
    setShowTemplateForm(false);
    setEditingTemplate(null);
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
  }, [mainTab]);

  async function fetchAll() {
    setLoading(true);
    try {
      // 第一批：頁面顯示必要資料（範本、分類、館別）
      const [templatesRes, categoriesRes, warehousesRes] = await Promise.all([
        fetch('/api/expense-templates?activeOnly=false'),
        fetch('/api/settings/expense-categories'),
        fetch('/api/warehouse-departments'),
      ]);
      const templatesData = await templatesRes.json();
      const categoriesData = await categoriesRes.json();
      const warehousesData = await warehousesRes.json();

      setTemplates(Array.isArray(templatesData) ? templatesData : []);
      setCategories(Array.isArray(categoriesData) ? categoriesData : []);
      const whList = warehousesData && warehousesData.byName
        ? Object.keys(warehousesData.byName)
        : warehousesData && typeof warehousesData === 'object' && !Array.isArray(warehousesData)
          ? Object.keys(warehousesData)
          : Array.isArray(warehousesData)
            ? warehousesData.map(w => w.name || w)
          : [];
      setWarehouses(whList);
      setLoading(false);

      // 第二批：延遲載入（廠商、商品、會計科目、存簿）- 不阻塞頁面顯示
      const [suppliersRes, productsRes, accountingRes, cashflowRes] = await Promise.all([
        fetch('/api/suppliers?activeOnly=true'),
        fetch('/api/products?all=true'),
        fetch('/api/accounting-subjects'),
        fetch('/api/cashflow/accounts').catch(() => ({ json: () => [] }))
      ]);
      const suppliersData = await suppliersRes.json();
      let productsData = [];
      try { productsData = await productsRes.json(); } catch(e) {}
      let accountingData = [];
      try { accountingData = await accountingRes.json(); } catch(e) {}
      let cashflowData = [];
      try { cashflowData = await cashflowRes.json(); } catch(e) {}

      setSuppliers(Array.isArray(suppliersData) ? suppliersData : (suppliersData?.suppliers || []));
      setProducts(Array.isArray(productsData) ? productsData : []);
      setAccountingSubjects(Array.isArray(accountingData) ? accountingData : []);
      setCashAccounts(Array.isArray(cashflowData) ? cashflowData.filter(a => a.isActive !== false) : []);
    } catch (err) {
      console.error('載入資料失敗:', err);
      setLoading(false);
    }
  }

  async function fetchTemplates() {
    try {
      const res = await fetch('/api/expense-templates?activeOnly=false');
      const data = await res.json();
      setTemplates(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('載入範本失敗:', err);
    }
  }

  async function fetchRecords() {
    setRecordsLoading(true);
    try {
      const params = new URLSearchParams();
      if (recordFilter.month) params.set('month', recordFilter.month);
      if (recordFilter.warehouse) params.set('warehouse', recordFilter.warehouse);
      if (recordFilter.status) params.set('paymentStatus', recordFilter.status);
      params.set('type', mainTab);
      const res = await fetch(`/api/expense-records?${params.toString()}`);
      const data = await res.json();
      setRecords(data.records || []);
      setRecordsTotal(data.total || 0);
    } catch (err) {
      console.error('載入記錄失敗:', err);
    }
    setRecordsLoading(false);
  }

  // Filter templates by current main tab type
  const filteredTemplates = useMemo(() => templates.filter(t => (t.templateType || 'fixed') === mainTab), [templates, mainTab]);
  const activeTemplates = useMemo(() => filteredTemplates.filter(t => t.isActive), [filteredTemplates]);
  const productMap = useMemo(() => new Map(products.map(p => [p.id, p])), [products]);
  const supplierMap = useMemo(() => new Map(suppliers.map(s => [s.id, s])), [suppliers]);
  const getProductName = useCallback((id) => {
    const p = productMap.get(parseInt(id));
    return p ? `${p.code} - ${p.name}` : id;
  }, [productMap]);
  const getSupplierName = useCallback((id) => {
    const s = supplierMap.get(parseInt(id));
    return s?.name || id;
  }, [supplierMap]);

  // ====== Template CRUD ======
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
      // 只載入借方（費用項目），貸方由系統自動補上
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
      form.entryLines = [
        { ...EMPTY_ENTRY_LINE, entryType: 'debit' }
      ];
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

  const acctByCode = useMemo(() => new Map(accountingSubjects.map(s => [String(s.code).trim(), s])), [accountingSubjects]);
  const acctByName = useMemo(() => new Map(accountingSubjects.map(s => [(s.name || '').trim(), s])), [accountingSubjects]);

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
      showToast('儲存範本失敗: ' + err.message, 'error');
    }
  }

  async function handleDeleteTemplate(id) {
    if (!confirm('確定要刪除此範本嗎？')) return;
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
      showToast('刪除失敗: ' + err.message, 'error');
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

  // ====== Record Actions ======
  async function handleConfirmRecord(id) {
    if (!confirm('確定要確認此記錄嗎？')) return;
    try {
      const res = await fetch(`/api/expense-records/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'confirm', confirmedBy: session?.user?.name || '系統' })
      });
      if (res.ok) {
        fetchRecords();
      } else {
        const err = await res.json();
        showToast(err.error || '確認失敗', 'error');
      }
    } catch (err) {
      showToast('確認失敗', 'error');
    }
  }

  async function handleVoidRecord(id) {
    if (!voidReason.trim()) {
      showToast('請輸入作廢原因', 'error');
      return;
    }
    try {
      const res = await fetch(`/api/expense-records/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'void',
          voidReason: voidReason.trim(),
          voidedBy: session?.user?.name || '系統'
        })
      });
      if (res.ok) {
        setShowVoidModal(null);
        setVoidReason('');
        fetchRecords();
      } else {
        const err = await res.json();
        showToast(err.error || '作廢失敗', 'error');
      }
    } catch (err) {
      showToast('作廢失敗', 'error');
    }
  }

  async function handleDeleteRecord(id) {
    if (!confirm('確定要刪除此記錄及關聯的付款單嗎？此操作無法復原。')) return;
    try {
      const res = await fetch(`/api/expense-records/${id}`, { method: 'DELETE' });
      if (res.ok) fetchRecords();
      else {
        const err = await res.json();
        showToast(err.error || '刪除失敗', 'error');
      }
    } catch (err) {
      showToast('刪除失敗', 'error');
    }
  }

  function openEditRecord(record) {
    setEditingRecord(record);
    setEditForm({
      entryLines: record.entryLines.filter(l => l.entryType === 'debit').map(l => ({
        accountingCode: l.accountingCode,
        accountingName: l.accountingName,
        summary: l.summary || '',
        amount: l.amount
      })),
      note: record.note || '',
      paymentMethod: record.paymentMethod || ''
    });
  }

  async function handleSaveEdit() {
    if (!editingRecord) return;
    const debitLines = editForm.entryLines.map((l, i) => ({
      entryType: 'debit',
      accountingCode: l.accountingCode,
      accountingName: l.accountingName,
      summary: l.summary,
      amount: parseFloat(l.amount) || 0,
      sortOrder: i
    }));
    const debitTotal = debitLines.reduce((s, l) => s + l.amount, 0);
    if (debitTotal <= 0) { showToast('金額必須大於 0', 'error'); return; }
    // Auto-add credit line to balance
    const creditLines = [{
      entryType: 'credit',
      accountingCode: editingRecord.entryLines.find(l => l.entryType === 'credit')?.accountingCode || '1111',
      accountingName: editingRecord.entryLines.find(l => l.entryType === 'credit')?.accountingName || '銀行存款',
      summary: '',
      amount: debitTotal,
      sortOrder: debitLines.length
    }];
    try {
      const res = await fetch(`/api/expense-records/${editingRecord.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'edit',
          entryLines: [...debitLines, ...creditLines],
          note: editForm.note,
          paymentMethod: editForm.paymentMethod
        })
      });
      if (res.ok) {
        setEditingRecord(null);
        fetchRecords();
      } else {
        const err = await res.json();
        showToast(err.error || '儲存失敗', 'error');
      }
    } catch (err) {
      showToast('儲存失敗', 'error');
    }
  }

  // ====== Quick Execute ======
  function handleSelectTemplate(tmplId) {
    setSelectedTemplateId(tmplId);
    setDuplicateWarning(null);
    if (!tmplId) {
      setExecuteForm(prev => ({ ...prev, entryLines: [], items: [], warehouseAmounts: [] }));
      return;
    }
    const tmpl = templates.find(t => t.id === parseInt(tmplId));
    if (!tmpl) return;

    if (mainTab === 'purchase') {
      // Purchase type: load items from template
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
          ? (suppliers.find(s => s.id === tmpl.defaultSupplierId)?.name || '')
          : '',
        paymentTerms: tmpl.paymentMethod || '月結',
        warehouse: tmpl.warehouse || prev.warehouse,
        taxType: tmpl.defaultTaxType || '',
        items
      }));
    } else {
      // Fixed type: 100% 範本呈現，每筆含館別/付款方式/存簿，只需改當月金額
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
          ? (suppliers.find(s => s.id === tmpl.defaultSupplierId)?.name || '')
          : '',
        paymentMethod: tmpl.paymentMethod || '',
        warehouse: tmpl.warehouse || prev.warehouse,
        entryLines: resolvedLines,
        warehouseAmounts: []  // 不再使用，改用 entryLines 每筆自帶館別
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
        // Execute purchase type
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
          showToast(msg, 'error');
          setSelectedTemplateId('');
          setExecuteForm(prev => ({ ...prev, items: [], invoiceNo: '', invoiceDate: '', invoiceTitle: '' }));
          if (subTab === 'records') fetchRecords();
        } else if (res.status === 409) {
          const err = await res.json();
          if (err.duplicate) {
            setDuplicateWarning(err.error);
          } else {
            showToast(err.error || '執行失敗', 'error');
          }
        } else {
          const err = await res.json();
          showToast(err.error || '執行失敗', 'error');
        }
      } else {
        // Execute fixed type: 每筆分錄含館別/付款方式/存簿，依館別分組建立記錄
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
        if (executeForm.paymentMethod === '支票') {
          if (!executeForm.checkIssueDate || !executeForm.checkDate || !executeForm.checkNo?.trim() || !executeForm.checkAccountId) {
            showToast('付款方式為支票時，請填寫：付款(開票)日期、支票日期、支票號碼、開票帳戶', 'error');
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
        if (executeForm.paymentMethod === '支票') {
          body.checkIssueDate = executeForm.checkIssueDate;
          body.checkDate = executeForm.checkDate;
          body.checkNo = executeForm.checkNo?.trim();
          body.checkAccountId = executeForm.checkAccountId ? parseInt(executeForm.checkAccountId) : null;
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
          else if (executeForm.paymentMethod === '支票') msg += '\n\n已連動支票管理，可至「支票管理」頁面追蹤兌現。';
          showToast(msg, 'error');
          setSelectedTemplateId('');
          setExecuteForm(prev => ({
            ...prev,
            entryLines: [],
            checkIssueDate: '',
            checkDate: '',
            checkNo: '',
            checkAccountId: '',
            checkNote: ''
          }));
          if (subTab === 'records') fetchRecords();
        } else if (res.status === 409) {
          const err = await res.json();
          if (err.duplicate) {
            setDuplicateWarning(err.error);
          } else {
            showToast(err.error || '執行失敗', 'error');
          }
        } else {
          const err = await res.json();
          showToast(err.error || '執行失敗', 'error');
        }
      }
    } catch (err) {
      showToast('執行失敗: ' + err.message, 'error');
    }
    setSubmitting(false);
  }

  // ====== RENDER ======
  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#f4f6f9' }}>
        <Navigation />
        <div style={{ padding: 32, textAlign: 'center' }}>載入中...</div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f4f6f9' }}>
      <Navigation />
      <div style={{ maxWidth: 1400, margin: '0 auto', padding: '24px 16px' }}>
        <h1 style={{ fontSize: 26, fontWeight: 700, marginBottom: 16 }}>費用管理</h1>

        {/* Main Tabs: 進銷存每月費用 / 固定費用 */}
        <div style={{ display: 'flex', gap: 0, marginBottom: 0, borderBottom: '2px solid #dee2e6' }}>
          {MAIN_TABS.map(tab => (
            <button key={tab.key}
              onClick={() => setMainTab(tab.key)}
              style={{
                padding: '12px 28px',
                background: mainTab === tab.key ? '#fff' : '#e9ecef',
                color: mainTab === tab.key ? '#1a73e8' : '#555',
                border: mainTab === tab.key ? '2px solid #dee2e6' : '1px solid transparent',
                borderBottom: mainTab === tab.key ? '2px solid #fff' : 'none',
                borderRadius: '8px 8px 0 0',
                fontWeight: mainTab === tab.key ? 700 : 500,
                fontSize: 18,
                cursor: 'pointer',
                marginBottom: mainTab === tab.key ? -2 : 0,
                position: 'relative'
              }}>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Sub Tabs: 費用範本 / 快速執行 / 執行記錄 */}
        <div style={{ display: 'flex', gap: 8, padding: '12px 0', borderBottom: '1px solid #eee', background: '#fff', paddingLeft: 16 }}>
          {SUB_TABS.map(tab => (
            <button key={tab.key}
              onClick={() => setSubTab(tab.key)}
              style={{
                padding: '6px 18px',
                background: subTab === tab.key ? '#1a73e8' : '#f8f9fa',
                color: subTab === tab.key ? '#fff' : '#333',
                border: subTab === tab.key ? 'none' : '1px solid #dee2e6',
                borderRadius: 6,
                fontWeight: 500,
                fontSize: 17,
                cursor: 'pointer'
              }}>
              {tab.label}
            </button>
          ))}
        </div>

        <div style={{ background: '#fff', padding: 20, borderRadius: '0 0 8px 8px', minHeight: 400 }}>
          {/* ====== TEMPLATES TAB ====== */}
          {subTab === 'templates' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <h2 style={{ fontSize: 20, fontWeight: 600 }}>
                  {mainTab === 'purchase' ? '進銷存費用範本' : '固定費用範本'}
                </h2>
                <button onClick={() => { resetTemplateForm(); setShowTemplateForm(true); }}
                  style={{ padding: '8px 16px', background: '#1a73e8', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 500 }}>
                  + 新增範本
                </button>
              </div>

              {/* Template Form */}
              {showTemplateForm && (
                <div style={{ border: '1px solid #dee2e6', borderRadius: 8, padding: 20, marginBottom: 20, background: '#fafbfc' }}>
                  <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>
                    {editingTemplate ? '編輯範本' : '新增範本'}
                  </h3>

                  {/* Common fields */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
                    <div>
                      <label style={labelStyle}>範本名稱 *</label>
                      <input value={templateForm.name}
                        onChange={e => setTemplateForm(prev => ({ ...prev, name: e.target.value }))}
                        style={inputStyle} placeholder="例: 每月OO廠商進貨" />
                    </div>
                    <div>
                      <label style={labelStyle}>館別</label>
                      <select value={templateForm.warehouse}
                        onChange={e => setTemplateForm(prev => ({ ...prev, warehouse: e.target.value }))}
                        style={inputStyle}>
                        <option value="">不限</option>
                        {warehouses.map(w => <option key={w} value={w}>{w}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={labelStyle}>分類</label>
                      <select value={templateForm.categoryId}
                        onChange={e => setTemplateForm(prev => ({ ...prev, categoryId: e.target.value }))}
                        style={inputStyle}>
                        <option value="">無分類</option>
                        {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
                    <div>
                      <label style={labelStyle}>說明</label>
                      <input value={templateForm.description}
                        onChange={e => setTemplateForm(prev => ({ ...prev, description: e.target.value }))}
                        style={inputStyle} placeholder="範本說明..." />
                    </div>
                  </div>

                  {/* Purchase-type specific: product items */}
                  {mainTab === 'purchase' && (
                    <div style={{ marginBottom: 16 }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                        <div>
                          <label style={labelStyle}>付款條件</label>
                          <input value={templateForm.paymentMethod}
                            onChange={e => setTemplateForm(prev => ({ ...prev, paymentMethod: e.target.value }))}
                            style={inputStyle} placeholder="月結" />
                        </div>
                        <div>
                          <label style={labelStyle}>預設稅別</label>
                          <select value={templateForm.defaultTaxType}
                            onChange={e => setTemplateForm(prev => ({ ...prev, defaultTaxType: e.target.value }))}
                            style={inputStyle}>
                            <option value="">不指定</option>
                            <option value="應稅">應稅</option>
                            <option value="免稅">免稅</option>
                            <option value="零稅率">零稅率</option>
                          </select>
                        </div>
                      </div>

                      <h4 style={{ fontSize: 17, fontWeight: 600, marginBottom: 8 }}>預設進貨品項</h4>
                      <table style={tableStyle}>
                        <thead>
                          <tr>
                            <th style={thStyle}>商品</th>
                            <th style={{ ...thStyle, width: 80 }}>數量</th>
                            <th style={{ ...thStyle, width: 100 }}>單價</th>
                            <th style={{ ...thStyle, width: 100 }}>小計</th>
                            <th style={thStyle}>備註</th>
                            <th style={{ ...thStyle, width: 40 }}></th>
                          </tr>
                        </thead>
                        <tbody>
                          {templateForm.purchaseItems.map((item, idx) => (
                            <tr key={idx}>
                              <td style={tdStyle}>
                                <select value={item.productId}
                                  onChange={e => updatePurchaseItem(idx, 'productId', e.target.value)}
                                  style={{ ...inputStyle, marginBottom: 0 }}>
                                  <option value="">選擇商品</option>
                                  {products.map(p => <option key={p.id} value={p.id}>{p.code} - {p.name}</option>)}
                                </select>
                              </td>
                              <td style={tdStyle}>
                                <input type="number" value={item.quantity}
                                  onChange={e => updatePurchaseItem(idx, 'quantity', e.target.value)}
                                  style={{ ...inputStyle, marginBottom: 0, width: '100%' }} min="1" />
                              </td>
                              <td style={tdStyle}>
                                <input type="number" value={item.unitPrice}
                                  onChange={e => updatePurchaseItem(idx, 'unitPrice', e.target.value)}
                                  style={{ ...inputStyle, marginBottom: 0, width: '100%' }} step="0.01" />
                              </td>
                              <td style={{ ...tdStyle, textAlign: 'right' }}>
                                {((parseFloat(item.quantity) || 0) * (parseFloat(item.unitPrice) || 0)).toLocaleString()}
                              </td>
                              <td style={tdStyle}>
                                <input value={item.note}
                                  onChange={e => updatePurchaseItem(idx, 'note', e.target.value)}
                                  style={{ ...inputStyle, marginBottom: 0 }} />
                              </td>
                              <td style={tdStyle}>
                                <button onClick={() => removePurchaseItem(idx)}
                                  style={{ color: '#dc3545', border: 'none', background: 'none', cursor: 'pointer', fontSize: 19 }}>✕</button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr>
                            <td colSpan={3} style={{ ...tdStyle, textAlign: 'right', fontWeight: 600 }}>合計</td>
                            <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600 }}>{getPurchaseTotal().toLocaleString()}</td>
                            <td colSpan={2} style={tdStyle}></td>
                          </tr>
                        </tfoot>
                      </table>
                      <button onClick={addPurchaseItem}
                        style={{ marginTop: 8, padding: '4px 12px', background: '#e8f0fe', color: '#1a73e8', border: '1px solid #1a73e8', borderRadius: 4, cursor: 'pointer', fontSize: 16 }}>
                        + 新增品項
                      </button>
                    </div>
                  )}

                  {/* Fixed-type: 費用項目（每筆自選館別、付款方式、轉帳存簿）*/}
                  {mainTab === 'fixed' && (
                    <div style={{ marginBottom: 16 }}>
                      <h4 style={{ fontSize: 17, fontWeight: 600, marginBottom: 8 }}>費用項目（每筆需選擇館別、付款方式）</h4>
                      <table style={tableStyle}>
                        <thead>
                          <tr>
                            <th style={{ ...thStyle, width: 110 }}>費用名稱 *</th>
                            <th style={{ ...thStyle, width: 80 }}>會計代碼</th>
                            <th style={{ ...thStyle, width: 100 }}>摘要</th>
                            <th style={{ ...thStyle, width: 110 }}>廠商</th>
                            <th style={{ ...thStyle, width: 80 }}>館別 *</th>
                            <th style={{ ...thStyle, width: 80 }}>付款方式 *</th>
                            <th style={{ ...thStyle, width: 120 }}>轉帳存簿</th>
                            <th style={{ ...thStyle, width: 100 }}>備註</th>
                            <th style={{ ...thStyle, width: 80 }}>預設金額</th>
                            <th style={{ ...thStyle, width: 40 }}></th>
                          </tr>
                        </thead>
                        <tbody>
                          {templateForm.entryLines.map((line, idx) => (
                            <tr key={idx}>
                              <td style={tdStyle}>
                                <input value={line.accountingName}
                                  onChange={e => updateEntryLineAccounting(idx, e.target.value, false)}
                                  style={{ ...inputStyle, marginBottom: 0 }} placeholder="例: 薪資" />
                              </td>
                              <td style={tdStyle}>
                                <input value={line.accountingCode}
                                  onChange={e => updateEntryLineAccounting(idx, e.target.value, true)}
                                  style={{ ...inputStyle, marginBottom: 0 }} placeholder="選填" />
                              </td>
                              <td style={tdStyle}>
                                <input value={line.summary}
                                  onChange={e => updateEntryLine(idx, 'summary', e.target.value)}
                                  style={{ ...inputStyle, marginBottom: 0 }} placeholder="摘要" />
                              </td>
                              <td style={tdStyle}>
                                <select value={line.supplierId}
                                  onChange={e => {
                                    const s = suppliers.find(s => s.id === parseInt(e.target.value));
                                    updateEntryLine(idx, 'supplierId', e.target.value);
                                    updateEntryLine(idx, 'supplierName', s?.name || '');
                                  }}
                                  style={{ ...inputStyle, marginBottom: 0 }}>
                                  <option value="">不指定</option>
                                  {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                </select>
                              </td>
                              <td style={tdStyle}>
                                <select value={line.warehouse}
                                  onChange={e => updateEntryLine(idx, 'warehouse', e.target.value)}
                                  style={{ ...inputStyle, marginBottom: 0 }}>
                                  <option value="">選擇館別</option>
                                  {warehouses.map(w => <option key={w} value={w}>{w}</option>)}
                                </select>
                              </td>
                              <td style={tdStyle}>
                                <select value={line.paymentMethod}
                                  onChange={e => {
                                    updateEntryLine(idx, 'paymentMethod', e.target.value);
                                    if (e.target.value !== '轉帳' && e.target.value !== '匯款') updateEntryLine(idx, 'accountId', '');
                                  }}
                                  style={{ ...inputStyle, marginBottom: 0 }}>
                                  <option value="">選擇</option>
                                  {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                                </select>
                              </td>
                              <td style={tdStyle}>
                                {(line.paymentMethod === '轉帳' || line.paymentMethod === '匯款') ? (
                                  <select value={line.accountId}
                                    onChange={e => updateEntryLine(idx, 'accountId', e.target.value)}
                                    style={{ ...inputStyle, marginBottom: 0 }}>
                                    <option value="">選擇存簿</option>
                                    {cashAccounts.filter(a => a.warehouse === line.warehouse || !a.warehouse).map(a => (
                                      <option key={a.id} value={a.id}>{a.name} {a.warehouse ? `(${a.warehouse})` : ''}</option>
                                    ))}
                                  </select>
                                ) : (line.paymentMethod === '信用卡' || line.paymentMethod === '員工代付') ? (
                                  <input value={line.advancedBy || ''}
                                    onChange={e => updateEntryLine(idx, 'advancedBy', e.target.value)}
                                    style={{ ...inputStyle, marginBottom: 0 }} placeholder="代墊員工" />
                                ) : <span style={{ fontSize: 15, color: '#999' }}>—</span>}
                              </td>
                              <td style={tdStyle}>
                                <input value={line.note}
                                  onChange={e => updateEntryLine(idx, 'note', e.target.value)}
                                  style={{ ...inputStyle, marginBottom: 0 }} placeholder="備註" />
                              </td>
                              <td style={tdStyle}>
                                <input type="number" value={line.defaultAmount}
                                  onChange={e => updateEntryLine(idx, 'defaultAmount', e.target.value)}
                                  style={{ ...inputStyle, marginBottom: 0, textAlign: 'right' }} step="0.01" placeholder="0" />
                              </td>
                              <td style={tdStyle}>
                                <button onClick={() => removeEntryLine(idx)}
                                  style={{ color: '#dc3545', border: 'none', background: 'none', cursor: 'pointer', fontSize: 19 }}>✕</button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                        <button type="button" onClick={addEntryLineSingle}
                          style={{ padding: '4px 12px', background: '#e8f0fe', color: '#1a73e8', border: '1px solid #1a73e8', borderRadius: 4, cursor: 'pointer', fontSize: 16 }}>
                          + 新增費用
                        </button>
                      </div>
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    <button onClick={resetTemplateForm}
                      style={{ padding: '8px 16px', background: '#f8f9fa', border: '1px solid #dee2e6', borderRadius: 6, cursor: 'pointer' }}>
                      取消
                    </button>
                    <button onClick={handleSaveTemplate}
                      style={{ padding: '8px 16px', background: '#1a73e8', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 500 }}>
                      {editingTemplate ? '更新' : '儲存'}
                    </button>
                  </div>
                </div>
              )}

              {/* Template List */}
              {filteredTemplates.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 40, color: '#999' }}>
                  尚無{mainTab === 'purchase' ? '進銷存' : '固定'}費用範本
                </div>
              ) : (
                <table style={tableStyle}>
                  <thead>
                    <tr>
                      <th style={thStyle}>名稱</th>
                      <th style={thStyle}>摘要</th>
                      <th style={thStyle}>分類</th>
                      <th style={thStyle}>館別</th>
                      <th style={thStyle}>{mainTab === 'purchase' ? '預設廠商' : '付款方式'}</th>
                      <th style={thStyle}>{mainTab === 'purchase' ? '品項數' : '費用項目數'}</th>
                      <th style={thStyle}>{mainTab === 'purchase' ? '預估金額' : '預設金額'}</th>
                      <th style={thStyle}>狀態</th>
                      <th style={thStyle}>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTemplates.map(tmpl => {
                      const itemCount = mainTab === 'purchase'
                        ? (Array.isArray(tmpl.purchaseItems) ? tmpl.purchaseItems.length : 0)
                        : (tmpl.entryLines?.filter(l => l.entryType === 'debit').length || 0);
                      const totalAmt = mainTab === 'purchase'
                        ? (Array.isArray(tmpl.purchaseItems) ? tmpl.purchaseItems.reduce((s, i) => s + (i.quantity || 0) * (i.unitPrice || 0), 0) : 0)
                        : (tmpl.entryLines?.filter(l => l.entryType === 'debit').reduce((s, l) => s + (Number(l.defaultAmount) || 0), 0) || 0);
                      return (
                        <tr key={tmpl.id} style={{ opacity: tmpl.isActive ? 1 : 0.5 }}>
                          <td style={tdStyle}>
                            <div style={{ fontWeight: 500 }}>{tmpl.name}</div>
                            {tmpl.description && <div style={{ fontSize: 15, color: '#888' }}>{tmpl.description}</div>}
                          </td>
                          <td style={tdStyle}>{tmpl.summary || '-'}</td>
                          <td style={tdStyle}>{tmpl.category?.name || '-'}</td>
                          <td style={tdStyle}>{tmpl.warehouse || '不限'}</td>
                          <td style={tdStyle}>
                            {mainTab === 'purchase'
                              ? (tmpl.defaultSupplierId ? getSupplierName(tmpl.defaultSupplierId) : '-')
                              : (tmpl.paymentMethod || '-')}
                          </td>
                          <td style={{ ...tdStyle, textAlign: 'center' }}>{itemCount}</td>
                          <td style={{ ...tdStyle, textAlign: 'right' }}>{totalAmt > 0 ? totalAmt.toLocaleString() : '-'}</td>
                          <td style={tdStyle}>
                            <span style={{
                              padding: '2px 8px', borderRadius: 4, fontSize: 15,
                              background: tmpl.isActive ? '#d4edda' : '#f8d7da',
                              color: tmpl.isActive ? '#155724' : '#721c24'
                            }}>
                              {tmpl.isActive ? '啟用' : '停用'}
                            </span>
                          </td>
                          <td style={tdStyle}>
                            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                              <button onClick={() => handleEditTemplate(tmpl)}
                                style={smallBtnStyle}>編輯</button>
                              <button onClick={() => handleToggleTemplateActive(tmpl)}
                                style={{ ...smallBtnStyle, color: tmpl.isActive ? '#dc3545' : '#28a745' }}>
                                {tmpl.isActive ? '停用' : '啟用'}
                              </button>
                              <button onClick={() => handleDeleteTemplate(tmpl.id)}
                                style={{ ...smallBtnStyle, color: '#dc3545' }}>刪除</button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* ====== EXECUTE TAB ====== */}
          {subTab === 'execute' && (
            <div>
              <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 16 }}>
                快速執行 - {mainTab === 'purchase' ? '進銷存每月費用' : '固定費用'}
              </h2>

              {/* Template selection and basic info */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 16 }}>
                <div>
                  <label style={labelStyle}>選擇範本 *</label>
                  <select value={selectedTemplateId}
                    onChange={e => handleSelectTemplate(e.target.value)}
                    style={inputStyle}>
                    <option value="">-- 選擇範本 --</option>
                    {activeTemplates.map(t => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </div>
                {mainTab === 'purchase' && (
                  <div>
                    <label style={labelStyle}>館別 *</label>
                    <select value={executeForm.warehouse}
                      onChange={e => setExecuteForm(prev => ({ ...prev, warehouse: e.target.value }))}
                      style={inputStyle}>
                      <option value="">選擇館別</option>
                      {warehouses.map(w => <option key={w} value={w}>{w}</option>)}
                    </select>
                  </div>
                )}
                <div>
                  <label style={labelStyle}>費用月份 *</label>
                  <input type="month" value={executeForm.expenseMonth}
                    onChange={e => setExecuteForm(prev => ({ ...prev, expenseMonth: e.target.value }))}
                    style={inputStyle} />
                </div>
              </div>

              {selectedTemplateId && (
                <>
                  {/* Purchase-type execution */}
                  {mainTab === 'purchase' && (
                    <div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 16 }}>
                        <div>
                          <label style={labelStyle}>廠商 *</label>
                          <select value={executeForm.supplierId}
                            onChange={e => {
                              const s = suppliers.find(s => s.id === parseInt(e.target.value));
                              setExecuteForm(prev => ({
                                ...prev,
                                supplierId: e.target.value,
                                supplierName: s?.name || ''
                              }));
                            }}
                            style={inputStyle}>
                            <option value="">選擇廠商</option>
                            {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                          </select>
                        </div>
                        <div>
                          <label style={labelStyle}>付款條件</label>
                          <input value={executeForm.paymentTerms}
                            onChange={e => setExecuteForm(prev => ({ ...prev, paymentTerms: e.target.value }))}
                            style={inputStyle} placeholder="月結" />
                        </div>
                        <div>
                          <label style={labelStyle}>稅別</label>
                          <select value={executeForm.taxType}
                            onChange={e => setExecuteForm(prev => ({ ...prev, taxType: e.target.value }))}
                            style={inputStyle}>
                            <option value="">不指定</option>
                            <option value="應稅">應稅</option>
                            <option value="免稅">免稅</option>
                            <option value="零稅率">零稅率</option>
                          </select>
                        </div>
                      </div>

                      <h4 style={{ fontSize: 17, fontWeight: 600, marginBottom: 8 }}>進貨品項</h4>
                      <table style={tableStyle}>
                        <thead>
                          <tr>
                            <th style={thStyle}>商品</th>
                            <th style={{ ...thStyle, width: 80 }}>數量</th>
                            <th style={{ ...thStyle, width: 100 }}>單價</th>
                            <th style={{ ...thStyle, width: 100 }}>小計</th>
                            <th style={thStyle}>備註</th>
                            <th style={{ ...thStyle, width: 40 }}></th>
                          </tr>
                        </thead>
                        <tbody>
                          {executeForm.items.map((item, idx) => (
                            <tr key={idx}>
                              <td style={tdStyle}>
                                <select value={item.productId}
                                  onChange={e => updateExecuteItem(idx, 'productId', e.target.value)}
                                  style={{ ...inputStyle, marginBottom: 0 }}>
                                  <option value="">選擇商品</option>
                                  {products.map(p => <option key={p.id} value={p.id}>{p.code} - {p.name}</option>)}
                                </select>
                              </td>
                              <td style={tdStyle}>
                                <input type="number" value={item.quantity}
                                  onChange={e => updateExecuteItem(idx, 'quantity', e.target.value)}
                                  style={{ ...inputStyle, marginBottom: 0, width: '100%' }} min="1" />
                              </td>
                              <td style={tdStyle}>
                                <input type="number" value={item.unitPrice}
                                  onChange={e => updateExecuteItem(idx, 'unitPrice', e.target.value)}
                                  style={{ ...inputStyle, marginBottom: 0, width: '100%' }} step="0.01" />
                              </td>
                              <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 500 }}>
                                {((parseFloat(item.quantity) || 0) * (parseFloat(item.unitPrice) || 0)).toLocaleString()}
                              </td>
                              <td style={tdStyle}>
                                <input value={item.note}
                                  onChange={e => updateExecuteItem(idx, 'note', e.target.value)}
                                  style={{ ...inputStyle, marginBottom: 0 }} />
                              </td>
                              <td style={tdStyle}>
                                <button onClick={() => removeExecuteItem(idx)}
                                  style={{ color: '#dc3545', border: 'none', background: 'none', cursor: 'pointer', fontSize: 19 }}>✕</button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr>
                            <td colSpan={3} style={{ ...tdStyle, textAlign: 'right', fontWeight: 600 }}>合計</td>
                            <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700, fontSize: 18 }}>
                              {getExecutePurchaseTotal().toLocaleString()}
                            </td>
                            <td colSpan={2} style={tdStyle}></td>
                          </tr>
                        </tfoot>
                      </table>
                      <button onClick={addExecuteItem}
                        style={{ marginTop: 8, padding: '4px 12px', background: '#e8f0fe', color: '#1a73e8', border: '1px solid #1a73e8', borderRadius: 4, cursor: 'pointer', fontSize: 16 }}>
                        + 新增品項
                      </button>

                      {/* Invoice section */}
                      <div style={{ marginTop: 20, padding: 16, background: '#f0f7ff', borderRadius: 8, border: '1px solid #bee5eb' }}>
                        <h4 style={{ fontSize: 17, fontWeight: 600, marginBottom: 12, color: '#0c5460' }}>
                          發票資訊 (選填 - 填寫後會同時建立發票記錄)
                        </h4>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                          <div>
                            <label style={labelStyle}>發票號碼</label>
                            <input value={executeForm.invoiceNo}
                              onChange={e => setExecuteForm(prev => ({ ...prev, invoiceNo: e.target.value }))}
                              style={inputStyle} placeholder="例: AB-12345678" />
                          </div>
                          <div>
                            <label style={labelStyle}>發票日期</label>
                            <input type="date" value={executeForm.invoiceDate}
                              onChange={e => setExecuteForm(prev => ({ ...prev, invoiceDate: e.target.value }))}
                              style={inputStyle} />
                          </div>
                          <div>
                            <label style={labelStyle}>發票抬頭</label>
                            <input value={executeForm.invoiceTitle}
                              onChange={e => setExecuteForm(prev => ({ ...prev, invoiceTitle: e.target.value }))}
                              style={inputStyle} placeholder="公司名稱" />
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Fixed-type execution */}
                  {mainTab === 'fixed' && (
                    <div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 16 }}>
                        <div>
                          <label style={labelStyle}>費用月份 *</label>
                          <input type="month" value={executeForm.expenseMonth}
                            onChange={e => setExecuteForm(prev => ({ ...prev, expenseMonth: e.target.value }))}
                            style={inputStyle} />
                        </div>
                        <div>
                          <label style={labelStyle}>付款方式</label>
                          <select value={executeForm.paymentMethod}
                            onChange={e => setExecuteForm(prev => ({ ...prev, paymentMethod: e.target.value }))}
                            style={inputStyle}>
                            <option value="月結">月結</option>
                            <option value="現金">現金</option>
                            <option value="匯款">匯款</option>
                            <option value="支票">支票</option>
                            <option value="信用卡">信用卡</option>
                            <option value="員工代付">員工代付</option>
                          </select>
                        </div>
                        <div>
                          <label style={labelStyle}>廠商</label>
                          <select value={executeForm.supplierId}
                            onChange={e => {
                              const s = suppliers.find(s => s.id === parseInt(e.target.value));
                              setExecuteForm(prev => ({
                                ...prev,
                                supplierId: e.target.value,
                                supplierName: s?.name || ''
                              }));
                            }}
                            style={inputStyle}>
                            <option value="">不指定</option>
                            {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                          </select>
                        </div>
                      </div>
                      {/* 老闆信用卡代墊模式 */}
                      <div style={{ background: executeForm.creditCardAdvanceMode ? '#f3e8ff' : '#f8f9fa', border: `1px solid ${executeForm.creditCardAdvanceMode ? '#8b5cf6' : '#dee2e6'}`, borderRadius: 8, padding: 12, marginBottom: 12, transition: 'all 0.2s' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 17, fontWeight: 600, color: executeForm.creditCardAdvanceMode ? '#6d28d9' : '#495057' }}>
                          <input type="checkbox" checked={!!executeForm.creditCardAdvanceMode}
                            onChange={e => {
                              const checked = e.target.checked;
                              setExecuteForm(prev => {
                                const updated = { ...prev, creditCardAdvanceMode: checked };
                                if (checked) {
                                  updated.creditCardAdvanceName = prev.creditCardAdvanceName || '老闆';
                                  // 自動將所有分錄的付款方式改為信用卡、代墊員工填入
                                  updated.entryLines = prev.entryLines.map(l => l.entryType === 'debit' ? { ...l, paymentMethod: '信用卡', advancedBy: prev.creditCardAdvanceName || '老闆' } : l);
                                } else {
                                  // 取消時恢復分錄的付款方式
                                  updated.entryLines = prev.entryLines.map(l => l.entryType === 'debit' ? { ...l, paymentMethod: '', advancedBy: '' } : l);
                                }
                                return updated;
                              });
                            }}
                            style={{ width: 18, height: 18, accentColor: '#6d28d9' }} />
                          老闆信用卡代墊模式
                        </label>
                        {executeForm.creditCardAdvanceMode && (
                          <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid #c4b5fd' }}>
                            <div style={{ fontSize: 15, color: '#6d28d9', marginBottom: 8, lineHeight: 1.6 }}>
                              開啟後，所有費用項目將自動建立<strong>員工代墊記錄</strong>（不會進入出納待付清單）。<br/>
                              出納繳信用卡帳單時，到「員工預支」頁面勾選結算即可。
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <label style={{ fontSize: 15, color: '#6d28d9', fontWeight: 500, whiteSpace: 'nowrap' }}>代墊人</label>
                              <input value={executeForm.creditCardAdvanceName || ''}
                                onChange={e => {
                                  const name = e.target.value;
                                  setExecuteForm(prev => ({
                                    ...prev,
                                    creditCardAdvanceName: name,
                                    entryLines: prev.entryLines.map(l => l.entryType === 'debit' ? { ...l, advancedBy: name } : l)
                                  }));
                                }}
                                placeholder="老闆" style={{ ...inputStyle, marginBottom: 0, borderColor: '#c4b5fd', background: '#fff', width: 150 }} />
                            </div>
                          </div>
                        )}
                      </div>

                      {/* 當無逐筆分錄且付款方式為信用卡/員工代付時，顯示整批代墊員工欄位 */}
                      {!executeForm.creditCardAdvanceMode && (!executeForm.entryLines || executeForm.entryLines.length === 0) &&
                        (executeForm.paymentMethod === '信用卡' || executeForm.paymentMethod === '員工代付') && (
                        <div style={{ background: '#f3e8ff', border: '1px solid #c4b5fd', borderRadius: 8, padding: 12, marginBottom: 12 }}>
                          <div style={{ fontSize: 16, fontWeight: 600, color: '#6d28d9', marginBottom: 8 }}>員工代墊資訊（存檔後自動連動代墊款管理）</div>
                          <div>
                            <label style={{ fontSize: 14, color: '#6d28d9' }}>代墊員工 *</label>
                            <input value={executeForm.advancedBy || ''}
                              onChange={e => setExecuteForm(prev => ({ ...prev, advancedBy: e.target.value }))}
                              placeholder="員工姓名" style={{ ...inputStyle, borderColor: '#c4b5fd', background: '#fff' }} />
                          </div>
                        </div>
                      )}

                      {/* 付款方式為支票時，顯示支票資訊（存檔後連動支票管理） */}
                      {executeForm.paymentMethod === '支票' && (
                        <div style={{ background: '#fef3c7', border: '1px solid #f59e0b', borderRadius: 8, padding: 12, marginBottom: 12 }}>
                          <div style={{ fontSize: 16, fontWeight: 600, color: '#b45309', marginBottom: 8 }}>支票資訊（存檔後連動支票管理）</div>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                            <div>
                              <label style={{ fontSize: 14, color: '#b45309' }}>付款(開票)日期 *</label>
                              <input type="date" value={executeForm.checkIssueDate || ''}
                                onChange={e => setExecuteForm(prev => ({ ...prev, checkIssueDate: e.target.value }))}
                                style={{ ...inputStyle, borderColor: '#f59e0b', background: '#fff' }} />
                            </div>
                            <div>
                              <label style={{ fontSize: 14, color: '#b45309' }}>支票日期(到期日) *</label>
                              <input type="date" value={executeForm.checkDate || ''}
                                onChange={e => setExecuteForm(prev => ({ ...prev, checkDate: e.target.value }))}
                                style={{ ...inputStyle, borderColor: '#f59e0b', background: '#fff' }} />
                            </div>
                            <div>
                              <label style={{ fontSize: 14, color: '#b45309' }}>支票號碼 *</label>
                              <input type="text" value={executeForm.checkNo || ''}
                                onChange={e => setExecuteForm(prev => ({ ...prev, checkNo: e.target.value }))}
                                placeholder="請輸入支票號碼" style={{ ...inputStyle, borderColor: '#f59e0b', background: '#fff' }} />
                            </div>
                            <div>
                              <label style={{ fontSize: 14, color: '#b45309' }}>開票帳戶 *</label>
                              <select value={executeForm.checkAccountId || ''}
                                onChange={e => setExecuteForm(prev => ({ ...prev, checkAccountId: e.target.value }))}
                                style={{ ...inputStyle, borderColor: '#f59e0b', background: '#fff' }}>
                                <option value="">請選擇</option>
                                {cashAccounts.map(a => (
                                  <option key={a.id} value={a.id}>{a.name}{a.warehouse ? ` (${a.warehouse})` : ''}</option>
                                ))}
                              </select>
                            </div>
                            <div style={{ gridColumn: '1 / -1' }}>
                              <label style={{ fontSize: 14, color: '#b45309' }}>備註</label>
                              <input type="text" value={executeForm.checkNote || ''}
                                onChange={e => setExecuteForm(prev => ({ ...prev, checkNote: e.target.value }))}
                                placeholder="選填" style={{ ...inputStyle, borderColor: '#f59e0b', background: '#fff' }} />
                            </div>
                          </div>
                        </div>
                      )}

                      {/* 固定費用：依範本列出費用項目，可新增/刪除/編輯 */}
                      <div style={{ marginBottom: 20 }}>
                          <h4 style={{ fontSize: 17, fontWeight: 600, marginBottom: 8 }}>費用項目（請填入本月金額）</h4>
                          <table style={tableStyle}>
                            <thead>
                              <tr>
                                <th style={{ ...thStyle, width: 120 }}>費用名稱</th>
                                <th style={{ ...thStyle, width: 120 }}>廠商</th>
                                <th style={{ ...thStyle, width: 100 }}>館別</th>
                                <th style={{ ...thStyle, width: 90 }}>付款方式</th>
                                <th style={{ ...thStyle, width: 140 }}>存簿 / 代墊員工</th>
                                <th style={{ ...thStyle, width: 150 }}>摘要</th>
                                <th style={{ ...thStyle, width: 120 }}>金額 *</th>
                                <th style={{ ...thStyle, width: 40 }}></th>
                              </tr>
                            </thead>
                            <tbody>
                              {executeForm.entryLines.filter(l => l.entryType === 'debit').map((line, idx) => {
                                const realIdx = executeForm.entryLines.indexOf(line);
                                return (
                                  <tr key={realIdx}>
                                    <td style={{ ...tdStyle, fontWeight: 500 }}>
                                      <input value={line.accountingName || ''}
                                        onChange={e => updateExecuteLine(realIdx, 'accountingName', e.target.value)}
                                        style={{ ...inputStyle, marginBottom: 0, fontWeight: 500 }} placeholder="費用名稱" />
                                    </td>
                                    <td style={tdStyle}>
                                      <select value={line.supplierId || ''}
                                        onChange={e => {
                                          const s = suppliers.find(s => s.id === parseInt(e.target.value));
                                          updateExecuteLine(realIdx, 'supplierId', e.target.value);
                                          updateExecuteLine(realIdx, 'supplierName', s?.name || '');
                                        }}
                                        style={{ ...inputStyle, marginBottom: 0 }}>
                                        <option value="">不指定</option>
                                        {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                      </select>
                                    </td>
                                    <td style={tdStyle}>
                                      <select value={line.warehouse || ''}
                                        onChange={e => updateExecuteLine(realIdx, 'warehouse', e.target.value)}
                                        style={{ ...inputStyle, marginBottom: 0 }}>
                                        <option value="">不指定</option>
                                        {warehouses.map(w => <option key={w} value={w}>{w}</option>)}
                                      </select>
                                    </td>
                                    <td style={tdStyle}>
                                      <select value={line.paymentMethod || ''}
                                        onChange={e => updateExecuteLine(realIdx, 'paymentMethod', e.target.value)}
                                        style={{ ...inputStyle, marginBottom: 0 }}>
                                        <option value="">不指定</option>
                                        {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                                      </select>
                                    </td>
                                    <td style={tdStyle}>
                                      {(line.paymentMethod === '信用卡' || line.paymentMethod === '員工代付') ? (
                                        <input value={line.advancedBy || ''}
                                          onChange={e => updateExecuteLine(realIdx, 'advancedBy', e.target.value)}
                                          style={{ ...inputStyle, marginBottom: 0 }} placeholder="代墊員工姓名" />
                                      ) : (line.paymentMethod === '轉帳' || line.paymentMethod === '匯款') ? (
                                        <select value={line.accountId || ''}
                                          onChange={e => updateExecuteLine(realIdx, 'accountId', e.target.value)}
                                          style={{ ...inputStyle, marginBottom: 0 }}>
                                          <option value="">不指定</option>
                                          {cashAccounts.map(a => (
                                            <option key={a.id} value={a.id}>{a.name}{a.warehouse ? ` (${a.warehouse})` : ''}</option>
                                          ))}
                                        </select>
                                      ) : <span style={{ fontSize: 15, color: '#999' }}>—</span>}
                                    </td>
                                    <td style={tdStyle}>
                                      <input value={line.summary || ''}
                                        onChange={e => updateExecuteLine(realIdx, 'summary', e.target.value)}
                                        style={{ ...inputStyle, marginBottom: 0 }} placeholder="摘要" />
                                    </td>
                                    <td style={tdStyle}>
                                      <input type="number" value={line.amount}
                                        onChange={e => updateExecuteLine(realIdx, 'amount', e.target.value)}
                                        style={{ ...inputStyle, marginBottom: 0, textAlign: 'right' }} step="0.01" placeholder="0" />
                                    </td>
                                    <td style={tdStyle}>
                                      <button onClick={() => {
                                        setExecuteForm(prev => ({
                                          ...prev,
                                          entryLines: prev.entryLines.filter((_, i) => i !== realIdx)
                                        }));
                                      }}
                                        style={{ color: '#dc3545', border: 'none', background: 'none', cursor: 'pointer', fontSize: 19 }}>✕</button>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                            <tfoot>
                              <tr>
                                <td colSpan={6} style={{ ...tdStyle, textAlign: 'right', fontWeight: 600 }}>合計</td>
                                <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700, fontSize: 18 }}>
                                  {executeForm.entryLines
                                    .filter(l => l.entryType === 'debit')
                                    .reduce((s, l) => s + (parseFloat(l.amount) || 0), 0)
                                    .toLocaleString()}
                                </td>
                                <td style={tdStyle}></td>
                              </tr>
                            </tfoot>
                          </table>
                          <button onClick={() => {
                            setExecuteForm(prev => ({
                              ...prev,
                              entryLines: [...prev.entryLines, {
                                entryType: 'debit',
                                accountingCode: '',
                                accountingName: '',
                                summary: '',
                                amount: '',
                                supplierId: '',
                                supplierName: '',
                                warehouse: executeForm.warehouse || '',
                                paymentMethod: prev.creditCardAdvanceMode ? '信用卡' : (executeForm.paymentMethod || ''),
                                accountId: '',
                                advancedBy: prev.creditCardAdvanceMode ? (prev.creditCardAdvanceName || '老闆') : '',
                                sortOrder: prev.entryLines.length
                              }]
                            }));
                          }}
                            style={{ marginTop: 8, padding: '4px 12px', background: '#e8f0fe', color: '#1a73e8', border: '1px solid #1a73e8', borderRadius: 4, cursor: 'pointer', fontSize: 16 }}>
                            + 新增費用項目
                          </button>
                        </div>

                  {/* Note */}
                  <div style={{ marginTop: 16 }}>
                    <label style={labelStyle}>備註</label>
                    <input value={executeForm.note}
                      onChange={e => setExecuteForm(prev => ({ ...prev, note: e.target.value }))}
                      style={inputStyle} placeholder="選填" />
                  </div>

                  {/* Duplicate warning */}
                  {duplicateWarning && (
                    <div style={{ marginTop: 12, padding: 12, background: '#fff3cd', border: '1px solid #ffc107', borderRadius: 6 }}>
                      <p style={{ marginBottom: 8, color: '#856404' }}>{duplicateWarning}</p>
                      <button onClick={() => handleExecute(true)} disabled={submitting}
                        style={{ padding: '6px 16px', background: '#ffc107', color: '#333', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 500 }}>
                        確定重複執行
                      </button>
                    </div>
                  )}

                  {/* Execute button */}
                  <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end' }}>
                    <button onClick={() => handleExecute(false)}
                      disabled={submitting}
                      style={{
                        padding: '10px 32px',
                        background: submitting ? '#ccc' : '#28a745',
                        color: '#fff',
                        border: 'none',
                        borderRadius: 6,
                        cursor: submitting ? 'not-allowed' : 'pointer',
                        fontWeight: 600,
                        fontSize: 18
                      }}>
                      {submitting ? '執行中...' : '執行'}
                    </button>
                  </div>

                  {/* Data flow info */}
                  <div style={{ marginTop: 16, padding: 12, background: '#f8f9fa', borderRadius: 6, fontSize: 16, color: '#666' }}>
                    {mainTab === 'purchase' ? (
                      <div>
                        <strong>執行後資料流向：</strong>
                        <br />→ 進貨管理：自動建立進貨單 (PUR-XXXXXX)
                        {executeForm.invoiceNo && <><br />→ 發票管理：自動建立發票記錄 (INV-XXXXXX)</>}
                        <br />→ 費用記錄：建立本筆費用執行記錄 (EXP-XXXXXX)
                      </div>
                    ) : (
                      <div>
                        <strong>執行後資料流向：</strong>
                        <br />→ 付款管理：自動建立付款單 (PAY-XXXXXX)
                        <br />→ 費用記錄：建立本筆費用執行記錄 (EXP-XXXXXX)
                        <br />→ 部門費用/月彙總：自動同步更新
                      </div>
                    )}
                  </div>
                </div>
              )}
                </>
              )}
            </div>
          )}

          {/* ====== RECORDS TAB ====== */}
          {subTab === 'records' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <h2 style={{ fontSize: 20, fontWeight: 600 }}>
                  {mainTab === 'purchase' ? '進銷存費用記錄' : '固定費用記錄'}
                </h2>
              </div>

              {/* Filters */}
              <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
                <div>
                  <label style={{ ...labelStyle, fontSize: 15 }}>月份</label>
                  <input type="month" value={recordFilter.month}
                    onChange={e => setRecordFilter(prev => ({ ...prev, month: e.target.value }))}
                    style={{ ...inputStyle, width: 160 }} />
                </div>
                <div>
                  <label style={{ ...labelStyle, fontSize: 15 }}>館別</label>
                  <select value={recordFilter.warehouse}
                    onChange={e => setRecordFilter(prev => ({ ...prev, warehouse: e.target.value }))}
                    style={{ ...inputStyle, width: 120 }}>
                    <option value="">全部</option>
                    {warehouses.map(w => <option key={w} value={w}>{w}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ ...labelStyle, fontSize: 15 }}>付款狀態</label>
                  <select value={recordFilter.status}
                    onChange={e => setRecordFilter(prev => ({ ...prev, status: e.target.value }))}
                    style={{ ...inputStyle, width: 120 }}>
                    <option value="">全部</option>
                    <option value="待出納">待出納</option>
                    <option value="已代墊">已代墊</option>
                    <option value="已付款">已付款</option>
                  </select>
                </div>
              </div>

              {recordsLoading ? (
                <div style={{ textAlign: 'center', padding: 40 }}>載入中...</div>
              ) : records.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 40, color: '#999' }}>
                  本月尚無{mainTab === 'purchase' ? '進銷存' : '固定'}費用記錄
                </div>
              ) : (
                <table style={tableStyle}>
                  <thead>
                    <tr>
                      <SortableThInline label="記錄單號" colKey="recordNo" sortKey={expRecSortKey} sortDir={expRecSortDir} onSort={toggleExpRecSort} thStyle={thStyle} />
                      <SortableThInline label="範本" colKey="templateName" sortKey={expRecSortKey} sortDir={expRecSortDir} onSort={toggleExpRecSort} thStyle={thStyle} />
                      <SortableThInline label="月份" colKey="expenseMonth" sortKey={expRecSortKey} sortDir={expRecSortDir} onSort={toggleExpRecSort} thStyle={thStyle} />
                      <SortableThInline label="館別" colKey="warehouse" sortKey={expRecSortKey} sortDir={expRecSortDir} onSort={toggleExpRecSort} thStyle={thStyle} />
                      <SortableThInline label="金額" colKey="totalDebit" sortKey={expRecSortKey} sortDir={expRecSortDir} onSort={toggleExpRecSort} thStyle={{ ...thStyle, textAlign: 'right' }} align="right" />
                      <SortableThInline label="關聯單號" colKey="relatedNos" sortKey={expRecSortKey} sortDir={expRecSortDir} onSort={toggleExpRecSort} thStyle={thStyle} />
                      <SortableThInline label="狀態" colKey="paymentStatus" sortKey={expRecSortKey} sortDir={expRecSortDir} onSort={toggleExpRecSort} thStyle={thStyle} />
                      <th style={thStyle}>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedExpenseRecords.map(r => {
                      const ps = r.paymentStatus;
                      return (
                      <tr key={r.id} style={{ background: '#fff' }}>
                        <td style={tdStyle}>
                          <span style={{ fontFamily: 'monospace', fontSize: 16 }}>{r.recordNo}</span>
                        </td>
                        <td style={tdStyle}>{r.template?.name || '-'}</td>
                        <td style={tdStyle}>{r.expenseMonth}</td>
                        <td style={tdStyle}>{r.warehouse}</td>
                        <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 500 }}>
                          {Number(r.totalDebit).toLocaleString()}
                        </td>
                        <td style={tdStyle}>
                          <div style={{ fontSize: 15 }}>
                            {r.purchaseNo && <div>進貨: <span style={{ color: '#1a73e8' }}>{r.purchaseNo}</span></div>}
                            {r.salesNo && <div>發票: <span style={{ color: '#1a73e8' }}>{r.salesNo}</span></div>}
                            {r.paymentOrderNo && <div>付款: <span style={{ color: '#1a73e8' }}>{r.paymentOrderNo}</span></div>}
                            {!r.purchaseNo && !r.salesNo && !r.paymentOrderNo && '-'}
                          </div>
                        </td>
                        <td style={tdStyle}>
                          <span style={{
                            padding: '2px 8px', borderRadius: 4, fontSize: 15,
                            background: ps === '已付款' ? '#d4edda' : ps === '待出納' ? '#fff3cd' : ps === '已代墊' ? '#f3e8ff' : '#e2e3e5',
                            color: ps === '已付款' ? '#155724' : ps === '待出納' ? '#856404' : ps === '已代墊' ? '#6d28d9' : '#383d41'
                          }}>
                            {ps || r.status}
                          </span>
                        </td>
                        <td style={tdStyle}>
                          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                            <button onClick={() => setExpandedRecord(expandedRecord === r.id ? null : r.id)}
                              style={smallBtnStyle}>
                              {expandedRecord === r.id ? '收起' : '明細'}
                            </button>
                            {(ps === '待出納' || ps === '已代墊') && (
                              <>
                                <button onClick={() => openEditRecord(r)}
                                  style={{ ...smallBtnStyle, color: '#1a73e8' }}>編輯</button>
                                <button onClick={() => handleDeleteRecord(r.id)}
                                  style={{ ...smallBtnStyle, color: '#dc3545' }}>刪除</button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                      );
                    })}
                    {sortedExpenseRecords.map(r => expandedRecord === r.id && (
                      <tr key={`detail-${r.id}`}>
                        <td colSpan={8} style={{ padding: 16, background: '#fafbfc' }}>
                          <div style={{ fontSize: 16 }}>
                            <div style={{ marginBottom: 8 }}>
                              <strong>建立者:</strong> {r.createdBy} | <strong>建立時間:</strong> {r.createdAt?.split('T')[0]}
                              {r.confirmedBy && <> | <strong>確認者:</strong> {r.confirmedBy}</>}
                              {r.note && <> | <strong>備註:</strong> {r.note}</>}
                            </div>
                            {r.entryLines && r.entryLines.length > 0 && (
                              <table style={{ ...tableStyle, fontSize: 15 }}>
                                <thead>
                                  <tr>
                                    <th style={{ ...thStyle, padding: '4px 8px' }}>費用名稱</th>
                                    <th style={{ ...thStyle, padding: '4px 8px' }}>會計代碼</th>
                                    <th style={{ ...thStyle, padding: '4px 8px', textAlign: 'right' }}>金額</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {r.entryLines.filter(l => l.entryType === 'debit').map((line, i) => (
                                    <tr key={i}>
                                      <td style={{ ...tdStyle, padding: '4px 8px' }}>{line.accountingName}</td>
                                      <td style={{ ...tdStyle, padding: '4px 8px' }}>{line.accountingCode}</td>
                                      <td style={{ ...tdStyle, padding: '4px 8px', textAlign: 'right' }}>{Number(line.amount).toLocaleString()}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              <div style={{ marginTop: 8, fontSize: 16, color: '#888' }}>
                共 {recordsTotal} 筆記錄
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Edit Record Modal */}
      {editingRecord && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
        }}>
          <div style={{ background: '#fff', padding: 24, borderRadius: 8, width: 560, maxHeight: '80vh', overflow: 'auto' }}>
            <h3 style={{ fontSize: 19, fontWeight: 600, marginBottom: 4 }}>編輯費用記錄</h3>
            <div style={{ fontSize: 15, color: '#888', marginBottom: 16 }}>
              {editingRecord.recordNo} | {editingRecord.warehouse} | {editingRecord.expenseMonth}
              {editingRecord.paymentOrderNo && <> | 付款單: {editingRecord.paymentOrderNo}</>}
            </div>

            <label style={labelStyle}>付款方式</label>
            <select value={editForm.paymentMethod}
              onChange={e => setEditForm(prev => ({ ...prev, paymentMethod: e.target.value }))}
              style={{ ...inputStyle, width: 200, marginBottom: 12 }}>
              <option value="">—</option>
              {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
            </select>

            <label style={labelStyle}>費用明細 (借方)</label>
            <table style={{ ...tableStyle, marginBottom: 12 }}>
              <thead>
                <tr>
                  <th style={{ ...thStyle, padding: '4px 8px' }}>費用名稱</th>
                  <th style={{ ...thStyle, padding: '4px 8px' }}>會計代碼</th>
                  <th style={{ ...thStyle, padding: '4px 8px', width: 100 }}>摘要</th>
                  <th style={{ ...thStyle, padding: '4px 8px', width: 110, textAlign: 'right' }}>金額</th>
                  <th style={{ ...thStyle, padding: '4px 8px', width: 40 }}></th>
                </tr>
              </thead>
              <tbody>
                {editForm.entryLines.map((line, i) => (
                  <tr key={i}>
                    <td style={{ ...tdStyle, padding: '4px 6px' }}>
                      <input value={line.accountingName}
                        onChange={e => {
                          const lines = [...editForm.entryLines];
                          lines[i] = { ...lines[i], accountingName: e.target.value };
                          setEditForm(prev => ({ ...prev, entryLines: lines }));
                        }}
                        style={{ ...inputStyle, marginBottom: 0, fontSize: 16 }} />
                    </td>
                    <td style={{ ...tdStyle, padding: '4px 6px' }}>
                      <input value={line.accountingCode}
                        onChange={e => {
                          const lines = [...editForm.entryLines];
                          lines[i] = { ...lines[i], accountingCode: e.target.value };
                          setEditForm(prev => ({ ...prev, entryLines: lines }));
                        }}
                        style={{ ...inputStyle, marginBottom: 0, fontSize: 16, width: 80 }} />
                    </td>
                    <td style={{ ...tdStyle, padding: '4px 6px' }}>
                      <input value={line.summary}
                        onChange={e => {
                          const lines = [...editForm.entryLines];
                          lines[i] = { ...lines[i], summary: e.target.value };
                          setEditForm(prev => ({ ...prev, entryLines: lines }));
                        }}
                        style={{ ...inputStyle, marginBottom: 0, fontSize: 16 }} />
                    </td>
                    <td style={{ ...tdStyle, padding: '4px 6px' }}>
                      <input type="number" value={line.amount}
                        onChange={e => {
                          const lines = [...editForm.entryLines];
                          lines[i] = { ...lines[i], amount: e.target.value };
                          setEditForm(prev => ({ ...prev, entryLines: lines }));
                        }}
                        style={{ ...inputStyle, marginBottom: 0, fontSize: 16, textAlign: 'right' }} />
                    </td>
                    <td style={{ ...tdStyle, padding: '4px 6px', textAlign: 'center' }}>
                      {editForm.entryLines.length > 1 && (
                        <button onClick={() => {
                          const lines = editForm.entryLines.filter((_, idx) => idx !== i);
                          setEditForm(prev => ({ ...prev, entryLines: lines }));
                        }}
                        style={{ ...smallBtnStyle, color: '#dc3545', padding: '2px 6px' }}>✕</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button onClick={() => setEditForm(prev => ({
              ...prev,
              entryLines: [...prev.entryLines, { accountingCode: '', accountingName: '', summary: '', amount: '' }]
            }))}
              style={{ ...smallBtnStyle, marginBottom: 12 }}>+ 新增明細</button>

            <div style={{ textAlign: 'right', fontSize: 17, fontWeight: 600, marginBottom: 12 }}>
              合計: NT$ {editForm.entryLines.reduce((s, l) => s + (parseFloat(l.amount) || 0), 0).toLocaleString()}
            </div>

            <label style={labelStyle}>備註</label>
            <textarea value={editForm.note}
              onChange={e => setEditForm(prev => ({ ...prev, note: e.target.value }))}
              style={{ ...inputStyle, height: 60, resize: 'vertical' }}
              placeholder="備註" />

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
              <button onClick={() => setEditingRecord(null)}
                style={{ padding: '8px 16px', background: '#f8f9fa', border: '1px solid #dee2e6', borderRadius: 6, cursor: 'pointer' }}>
                取消
              </button>
              <button onClick={handleSaveEdit}
                style={{ padding: '8px 16px', background: '#1a73e8', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 500 }}>
                儲存並同步付款單
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ====== Styles ======
const labelStyle = { display: 'block', fontSize: 16, fontWeight: 500, marginBottom: 4, color: '#555' };
const inputStyle = {
  width: '100%', padding: '6px 10px', border: '1px solid #dee2e6', borderRadius: 4,
  fontSize: 17, boxSizing: 'border-box', marginBottom: 4
};
const tableStyle = { width: '100%', borderCollapse: 'collapse', fontSize: 17 };
const thStyle = {
  textAlign: 'left', padding: '8px 10px', background: '#f8f9fa',
  borderBottom: '2px solid #dee2e6', fontWeight: 600, fontSize: 16
};
const tdStyle = { padding: '8px 10px', borderBottom: '1px solid #eee', verticalAlign: 'middle' };
const smallBtnStyle = {
  padding: '3px 8px', background: 'none', border: '1px solid #dee2e6',
  borderRadius: 4, cursor: 'pointer', fontSize: 15, color: '#1a73e8'
};
