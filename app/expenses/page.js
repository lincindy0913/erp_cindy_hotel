'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import Navigation from '@/components/Navigation';
import ExportButtons from '@/components/ExportButtons';
import { EXPORT_CONFIGS } from '@/lib/export-columns';

const TABS = [
  { key: 'templates', label: '費用範本' },
  { key: 'records', label: '執行記錄' },
  { key: 'execute', label: '快速執行' }
];

const EMPTY_ENTRY_LINE = {
  entryType: 'debit',
  accountingCode: '',
  accountingName: '',
  summary: '',
  defaultAmount: ''
};

export default function ExpensesPage() {
  const { data: session } = useSession();
  const isLoggedIn = !!session;
  const [activeTab, setActiveTab] = useState('templates');

  // Shared data
  const [templates, setTemplates] = useState([]);
  const [categories, setCategories] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);

  // Template tab state
  const [activeCategoryTab, setActiveCategoryTab] = useState('all');
  const [showTemplateForm, setShowTemplateForm] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [templateForm, setTemplateForm] = useState({
    name: '', description: '', categoryId: '', warehouse: '',
    defaultSupplierId: '', paymentMethod: '', sortOrder: 0,
    entryLines: [
      { ...EMPTY_ENTRY_LINE, entryType: 'debit' },
      { ...EMPTY_ENTRY_LINE, entryType: 'credit' }
    ]
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
  const [voidReason, setVoidReason] = useState('');
  const [showVoidModal, setShowVoidModal] = useState(null);

  // Execute tab state
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [executeForm, setExecuteForm] = useState({
    warehouse: '',
    expenseMonth: new Date().toISOString().slice(0, 7),
    supplierId: '',
    supplierName: '',
    paymentMethod: '',
    note: '',
    entryLines: []
  });
  const [duplicateWarning, setDuplicateWarning] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchAll();
  }, []);

  useEffect(() => {
    if (activeTab === 'records') fetchRecords();
  }, [activeTab, recordFilter]);

  async function fetchAll() {
    setLoading(true);
    try {
      const [templatesRes, categoriesRes, warehousesRes, suppliersRes] = await Promise.all([
        fetch('/api/expense-templates'),
        fetch('/api/settings/expense-categories'),
        fetch('/api/warehouse-departments'),
        fetch('/api/suppliers?activeOnly=true')
      ]);
      const templatesData = await templatesRes.json();
      const categoriesData = await categoriesRes.json();
      const warehousesData = await warehousesRes.json();
      const suppliersData = await suppliersRes.json();

      setTemplates(Array.isArray(templatesData) ? templatesData : []);
      setCategories(Array.isArray(categoriesData) ? categoriesData : []);
      // warehouse-departments API returns object { '館別名': [...departments] }
      const whList = warehousesData && typeof warehousesData === 'object' && !Array.isArray(warehousesData)
        ? Object.keys(warehousesData)
        : Array.isArray(warehousesData)
          ? warehousesData.map(w => w.name || w)
          : [];
      setWarehouses(whList);
      setSuppliers(Array.isArray(suppliersData) ? suppliersData : (suppliersData?.suppliers || []));
    } catch (err) {
      console.error('載入資料失敗:', err);
    }
    setLoading(false);
  }

  async function fetchTemplates() {
    try {
      const res = await fetch('/api/expense-templates');
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
      if (recordFilter.status) params.set('status', recordFilter.status);
      const res = await fetch(`/api/expense-records?${params.toString()}`);
      const data = await res.json();
      setRecords(data.records || []);
      setRecordsTotal(data.total || 0);
    } catch (err) {
      console.error('載入記錄失敗:', err);
    }
    setRecordsLoading(false);
  }

  // ====== Template CRUD ======
  function resetTemplateForm() {
    setTemplateForm({
      name: '', description: '', categoryId: '', warehouse: '',
      defaultSupplierId: '', paymentMethod: '', sortOrder: 0,
      entryLines: [
        { ...EMPTY_ENTRY_LINE, entryType: 'debit' },
        { ...EMPTY_ENTRY_LINE, entryType: 'credit' }
      ]
    });
    setEditingTemplate(null);
    setShowTemplateForm(false);
  }

  function handleEditTemplate(tmpl) {
    setEditingTemplate(tmpl);
    setTemplateForm({
      name: tmpl.name,
      description: tmpl.description || '',
      categoryId: tmpl.categoryId ? String(tmpl.categoryId) : '',
      warehouse: tmpl.warehouse || '',
      defaultSupplierId: tmpl.defaultSupplierId ? String(tmpl.defaultSupplierId) : '',
      paymentMethod: tmpl.paymentMethod || '',
      sortOrder: tmpl.sortOrder || 0,
      entryLines: tmpl.entryLines.map(l => ({
        entryType: l.entryType,
        accountingCode: l.accountingCode,
        accountingName: l.accountingName,
        summary: l.summary || '',
        defaultAmount: l.defaultAmount != null ? String(l.defaultAmount) : ''
      }))
    });
    setShowTemplateForm(true);
  }

  function addEntryLine(type) {
    setTemplateForm(prev => ({
      ...prev,
      entryLines: [...prev.entryLines, { ...EMPTY_ENTRY_LINE, entryType: type }]
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

  function getTemplateBalance() {
    const debit = templateForm.entryLines
      .filter(l => l.entryType === 'debit')
      .reduce((s, l) => s + (parseFloat(l.defaultAmount) || 0), 0);
    const credit = templateForm.entryLines
      .filter(l => l.entryType === 'credit')
      .reduce((s, l) => s + (parseFloat(l.defaultAmount) || 0), 0);
    return { debit, credit, balanced: debit === 0 && credit === 0 ? true : Math.abs(debit - credit) < 0.01 };
  }

  async function handleSaveTemplate() {
    if (!templateForm.name.trim()) {
      alert('請輸入範本名稱');
      return;
    }
    if (templateForm.entryLines.length === 0) {
      alert('請至少新增一筆分錄');
      return;
    }
    for (const line of templateForm.entryLines) {
      if (!line.accountingCode.trim() || !line.accountingName.trim()) {
        alert('每筆分錄必須填寫科目代碼和科目名稱');
        return;
      }
    }
    const bal = getTemplateBalance();
    if (!bal.balanced && bal.debit > 0 && bal.credit > 0) {
      alert(`借貸不平衡：借方 ${bal.debit.toFixed(2)} ≠ 貸方 ${bal.credit.toFixed(2)}`);
      return;
    }

    const body = {
      ...templateForm,
      categoryId: templateForm.categoryId || null,
      defaultSupplierId: templateForm.defaultSupplierId || null,
      entryLines: templateForm.entryLines.map((l, i) => ({ ...l, sortOrder: i }))
    };

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
        alert(editingTemplate ? '範本更新成功' : '範本新增成功');
        resetTemplateForm();
        fetchTemplates();
      } else {
        const err = await res.json();
        alert(err.error || '儲存失敗');
      }
    } catch (err) {
      alert('儲存範本失敗: ' + err.message);
    }
  }

  async function handleDeleteTemplate(id) {
    if (!confirm('確定要刪除此範本嗎？')) return;
    try {
      const res = await fetch(`/api/expense-templates/${id}`, { method: 'DELETE' });
      if (res.ok) {
        alert('範本已刪除');
        fetchTemplates();
      } else {
        const err = await res.json();
        alert(err.error || '刪除失敗');
      }
    } catch (err) {
      alert('刪除失敗: ' + err.message);
    }
  }

  async function handleToggleTemplateActive(tmpl) {
    try {
      const res = await fetch(`/api/expense-templates/${tmpl.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...tmpl,
          isActive: !tmpl.isActive,
          entryLines: tmpl.entryLines
        })
      });
      if (res.ok) {
        fetchTemplates();
      }
    } catch (err) {
      alert('更新失敗');
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
        alert(err.error || '確認失敗');
      }
    } catch (err) {
      alert('確認失敗');
    }
  }

  async function handleVoidRecord(id) {
    if (!voidReason.trim()) {
      alert('請輸入作廢原因');
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
        alert(err.error || '作廢失敗');
      }
    } catch (err) {
      alert('作廢失敗');
    }
  }

  async function handleDeleteRecord(id) {
    if (!confirm('確定要刪除此記錄嗎？')) return;
    try {
      const res = await fetch(`/api/expense-records/${id}`, { method: 'DELETE' });
      if (res.ok) {
        fetchRecords();
      } else {
        const err = await res.json();
        alert(err.error || '刪除失敗');
      }
    } catch (err) {
      alert('刪除失敗');
    }
  }

  // ====== Quick Execute ======
  function handleSelectTemplate(tmplId) {
    setSelectedTemplateId(tmplId);
    setDuplicateWarning(null);
    if (!tmplId) {
      setExecuteForm(prev => ({ ...prev, entryLines: [] }));
      return;
    }
    const tmpl = templates.find(t => t.id === parseInt(tmplId));
    if (!tmpl) return;

    // Resolve summary template variables
    const resolvedLines = tmpl.entryLines.map(l => {
      let summary = l.summary || l.accountingName;
      summary = summary
        .replace(/\{\{館別\}\}/g, executeForm.warehouse || '___')
        .replace(/\{\{月份\}\}/g, executeForm.expenseMonth || '___');
      return {
        entryType: l.entryType,
        accountingCode: l.accountingCode,
        accountingName: l.accountingName,
        summary,
        amount: l.defaultAmount != null ? String(l.defaultAmount) : '',
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
      entryLines: resolvedLines
    }));
  }

  function updateExecuteLine(idx, field, value) {
    setExecuteForm(prev => ({
      ...prev,
      entryLines: prev.entryLines.map((l, i) => i === idx ? { ...l, [field]: value } : l)
    }));
  }

  // Re-resolve summaries when warehouse or month changes
  function refreshSummaries() {
    if (!selectedTemplateId) return;
    const tmpl = templates.find(t => t.id === parseInt(selectedTemplateId));
    if (!tmpl) return;
    setExecuteForm(prev => ({
      ...prev,
      entryLines: prev.entryLines.map((l, idx) => {
        const origSummary = tmpl.entryLines[idx]?.summary || tmpl.entryLines[idx]?.accountingName || l.accountingName;
        const resolved = origSummary
          .replace(/\{\{館別\}\}/g, prev.warehouse || '___')
          .replace(/\{\{月份\}\}/g, prev.expenseMonth || '___');
        return { ...l, summary: resolved };
      })
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

  async function handleExecute(allowDuplicate = false) {
    if (!selectedTemplateId) {
      alert('請選擇範本');
      return;
    }
    if (!executeForm.warehouse) {
      alert('請選擇館別');
      return;
    }
    if (!executeForm.expenseMonth) {
      alert('請選擇費用月份');
      return;
    }
    const bal = getExecuteBalance();
    if (!bal.balanced) {
      alert(`借貸不平衡：借方 ${bal.debit.toFixed(2)} ≠ 貸方 ${bal.credit.toFixed(2)}`);
      return;
    }
    if (bal.debit <= 0) {
      alert('金額必須大於 0');
      return;
    }

    setSubmitting(true);
    try {
      const body = {
        templateId: parseInt(selectedTemplateId),
        warehouse: executeForm.warehouse,
        expenseMonth: executeForm.expenseMonth,
        supplierId: executeForm.supplierId || null,
        supplierName: executeForm.supplierName || null,
        paymentMethod: executeForm.paymentMethod || null,
        note: executeForm.note || null,
        createdBy: session?.user?.name || session?.user?.email || '系統',
        allowDuplicate,
        entryLines: executeForm.entryLines.map((l, i) => ({
          entryType: l.entryType,
          accountingCode: l.accountingCode,
          accountingName: l.accountingName,
          summary: l.summary,
          amount: parseFloat(l.amount),
          sortOrder: i
        }))
      };

      const res = await fetch('/api/expense-records', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      if (res.status === 409) {
        const data = await res.json();
        if (data.duplicate) {
          setDuplicateWarning(data.message);
          setSubmitting(false);
          return;
        }
      }

      if (res.ok) {
        const data = await res.json();
        alert(`費用記錄建立成功！編號: ${data.recordNo}`);
        setDuplicateWarning(null);
        setSelectedTemplateId('');
        setExecuteForm(prev => ({ ...prev, entryLines: [], note: '' }));
        // Switch to records tab to show the new record
        setActiveTab('records');
        fetchRecords();
      } else {
        const err = await res.json();
        alert(err.error || '建立失敗');
      }
    } catch (err) {
      alert('建立失敗: ' + err.message);
    }
    setSubmitting(false);
  }

  // ====== Filtered templates for category sub-tabs ======
  function getFilteredTemplates() {
    if (activeCategoryTab === 'all') return templates;
    if (activeCategoryTab === 'uncategorized') return templates.filter(t => !t.categoryId);
    return templates.filter(t => t.categoryId === parseInt(activeCategoryTab));
  }

  // ====== Status badge helper ======
  function statusBadge(status) {
    const styles = {
      '待確認': 'bg-yellow-100 text-yellow-800',
      '已確認': 'bg-green-100 text-green-800',
      '已作廢': 'bg-gray-200 text-gray-500'
    };
    return (
      <span className={`px-2 py-1 rounded text-xs font-medium ${styles[status] || 'bg-gray-100 text-gray-600'}`}>
        {status}
      </span>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen page-bg-expenses">
        <Navigation borderColor="border-rose-500" />
        <main className="max-w-7xl mx-auto px-4 py-8">
          <p className="text-center text-gray-500 py-12">載入中...</p>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen page-bg-expenses">
      <Navigation borderColor="border-rose-500" />

      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold">常見費用管理</h2>
          {activeTab === 'records' && (
            <ExportButtons
              data={records.map(rec => ({
                ...rec,
                templateName: rec.template?.name || '-',
                executedBy: rec.executedByUser?.name || '-',
              }))}
              columns={EXPORT_CONFIGS.expenses.columns}
              exportName={EXPORT_CONFIGS.expenses.filename}
              title="費用執行記錄"
              sheetName="費用記錄"
            />
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 border-b border-gray-200">
          {TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
                activeTab === tab.key
                  ? 'bg-rose-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* ==================== Tab 1: Templates ==================== */}
        {activeTab === 'templates' && (
          <div>
            {/* Category sub-tabs */}
            <div className="flex flex-wrap gap-2 mb-4">
              <button
                onClick={() => setActiveCategoryTab('all')}
                className={`px-3 py-1 text-xs rounded-full border transition-colors ${
                  activeCategoryTab === 'all'
                    ? 'bg-rose-100 border-rose-300 text-rose-700'
                    : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'
                }`}
              >
                全部 ({templates.length})
              </button>
              {categories.map(cat => {
                const count = templates.filter(t => t.categoryId === cat.id).length;
                return (
                  <button
                    key={cat.id}
                    onClick={() => setActiveCategoryTab(String(cat.id))}
                    className={`px-3 py-1 text-xs rounded-full border transition-colors ${
                      activeCategoryTab === String(cat.id)
                        ? 'bg-rose-100 border-rose-300 text-rose-700'
                        : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    {cat.name} ({count})
                  </button>
                );
              })}
              <button
                onClick={() => setActiveCategoryTab('uncategorized')}
                className={`px-3 py-1 text-xs rounded-full border transition-colors ${
                  activeCategoryTab === 'uncategorized'
                    ? 'bg-rose-100 border-rose-300 text-rose-700'
                    : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'
                }`}
              >
                未分類 ({templates.filter(t => !t.categoryId).length})
              </button>
            </div>

            {/* Add template button */}
            {isLoggedIn && (
              <div className="mb-4">
                <button
                  onClick={() => { resetTemplateForm(); setShowTemplateForm(true); }}
                  className="px-4 py-2 bg-rose-600 text-white rounded hover:bg-rose-700 text-sm"
                >
                  + 新增範本
                </button>
              </div>
            )}

            {/* Template Form (add/edit) */}
            {showTemplateForm && (
              <div className="bg-white rounded-lg shadow-sm p-6 mb-6 border border-rose-200">
                <h3 className="text-lg font-bold mb-4">
                  {editingTemplate ? '編輯範本' : '新增範本'}
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">範本名稱 *</label>
                    <input
                      type="text"
                      value={templateForm.name}
                      onChange={e => setTemplateForm(prev => ({ ...prev, name: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                      placeholder="例：水電費"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">費用類別</label>
                    <select
                      value={templateForm.categoryId}
                      onChange={e => setTemplateForm(prev => ({ ...prev, categoryId: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                    >
                      <option value="">-- 未分類 --</option>
                      {categories.map(cat => (
                        <option key={cat.id} value={cat.id}>{cat.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">適用館別</label>
                    <select
                      value={templateForm.warehouse}
                      onChange={e => setTemplateForm(prev => ({ ...prev, warehouse: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                    >
                      <option value="">全部館別</option>
                      {warehouses.map(w => (
                        <option key={w} value={w}>{w}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">預設供應商</label>
                    <select
                      value={templateForm.defaultSupplierId}
                      onChange={e => setTemplateForm(prev => ({ ...prev, defaultSupplierId: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                    >
                      <option value="">-- 無 --</option>
                      {suppliers.map(s => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">付款方式</label>
                    <input
                      type="text"
                      value={templateForm.paymentMethod}
                      onChange={e => setTemplateForm(prev => ({ ...prev, paymentMethod: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                      placeholder="例：銀行轉帳"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">說明</label>
                    <input
                      type="text"
                      value={templateForm.description}
                      onChange={e => setTemplateForm(prev => ({ ...prev, description: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                      placeholder="範本說明"
                    />
                  </div>
                </div>

                {/* Entry lines */}
                <div className="mb-4">
                  <div className="flex justify-between items-center mb-2">
                    <h4 className="text-sm font-bold text-gray-700">分錄明細</h4>
                    <div className="flex gap-2">
                      <button onClick={() => addEntryLine('debit')} className="px-3 py-1 bg-blue-100 text-blue-700 rounded text-xs hover:bg-blue-200">
                        + 借方
                      </button>
                      <button onClick={() => addEntryLine('credit')} className="px-3 py-1 bg-green-100 text-green-700 rounded text-xs hover:bg-green-200">
                        + 貸方
                      </button>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-3 py-2 text-left w-20">借/貸</th>
                          <th className="px-3 py-2 text-left w-28">科目代碼</th>
                          <th className="px-3 py-2 text-left">科目名稱</th>
                          <th className="px-3 py-2 text-left">摘要模板</th>
                          <th className="px-3 py-2 text-right w-32">預設金額</th>
                          <th className="px-3 py-2 w-12"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {templateForm.entryLines.map((line, idx) => (
                          <tr key={idx} className={`border-t ${line.entryType === 'debit' ? 'bg-blue-50/30' : 'bg-green-50/30'}`}>
                            <td className="px-3 py-2">
                              <select
                                value={line.entryType}
                                onChange={e => updateEntryLine(idx, 'entryType', e.target.value)}
                                className={`px-2 py-1 rounded text-xs font-medium border ${
                                  line.entryType === 'debit'
                                    ? 'bg-blue-100 text-blue-700 border-blue-200'
                                    : 'bg-green-100 text-green-700 border-green-200'
                                }`}
                              >
                                <option value="debit">借方</option>
                                <option value="credit">貸方</option>
                              </select>
                            </td>
                            <td className="px-3 py-2">
                              <input
                                type="text"
                                value={line.accountingCode}
                                onChange={e => updateEntryLine(idx, 'accountingCode', e.target.value)}
                                className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                                placeholder="6000"
                              />
                            </td>
                            <td className="px-3 py-2">
                              <input
                                type="text"
                                value={line.accountingName}
                                onChange={e => updateEntryLine(idx, 'accountingName', e.target.value)}
                                className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                                placeholder="水電瓦斯費"
                              />
                            </td>
                            <td className="px-3 py-2">
                              <input
                                type="text"
                                value={line.summary}
                                onChange={e => updateEntryLine(idx, 'summary', e.target.value)}
                                className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                                placeholder="{{館別}}{{月份}}水電費"
                              />
                            </td>
                            <td className="px-3 py-2">
                              <input
                                type="number"
                                step="0.01"
                                value={line.defaultAmount}
                                onChange={e => updateEntryLine(idx, 'defaultAmount', e.target.value)}
                                className="w-full px-2 py-1 border border-gray-300 rounded text-sm text-right"
                                placeholder="0.00"
                              />
                            </td>
                            <td className="px-3 py-2 text-center">
                              <button
                                onClick={() => removeEntryLine(idx)}
                                className="text-red-500 hover:text-red-700 text-xs"
                                title="移除"
                              >
                                X
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {/* Balance summary */}
                  {(() => {
                    const bal = getTemplateBalance();
                    return (
                      <div className={`mt-2 p-2 rounded text-sm flex gap-6 ${
                        bal.balanced ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
                      }`}>
                        <span>借方合計: {bal.debit.toFixed(2)}</span>
                        <span>貸方合計: {bal.credit.toFixed(2)}</span>
                        <span className="font-medium">
                          {bal.balanced ? '-- 借貸平衡 --' : `差額: ${Math.abs(bal.debit - bal.credit).toFixed(2)}`}
                        </span>
                      </div>
                    );
                  })()}
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={handleSaveTemplate}
                    className="px-4 py-2 bg-rose-600 text-white rounded hover:bg-rose-700 text-sm"
                  >
                    {editingTemplate ? '更新範本' : '儲存範本'}
                  </button>
                  <button
                    onClick={resetTemplateForm}
                    className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 text-sm"
                  >
                    取消
                  </button>
                </div>
              </div>
            )}

            {/* Template list */}
            <div className="space-y-3">
              {getFilteredTemplates().length === 0 ? (
                <div className="bg-white rounded-lg shadow-sm p-8 text-center text-gray-500">
                  尚無費用範本
                </div>
              ) : (
                getFilteredTemplates().map(tmpl => (
                  <div
                    key={tmpl.id}
                    className={`bg-white rounded-lg shadow-sm border ${
                      tmpl.isActive ? 'border-gray-200' : 'border-gray-100 opacity-60'
                    }`}
                  >
                    <div className="p-4">
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <h4 className="font-bold text-base">{tmpl.name}</h4>
                            {tmpl.category && (
                              <span className="px-2 py-0.5 bg-rose-50 text-rose-600 rounded text-xs">
                                {tmpl.category.name}
                              </span>
                            )}
                            {tmpl.warehouse && (
                              <span className="px-2 py-0.5 bg-blue-50 text-blue-600 rounded text-xs">
                                {tmpl.warehouse}
                              </span>
                            )}
                            {!tmpl.isActive && (
                              <span className="px-2 py-0.5 bg-gray-200 text-gray-500 rounded text-xs">停用</span>
                            )}
                          </div>
                          {tmpl.description && (
                            <p className="text-sm text-gray-500 mb-2">{tmpl.description}</p>
                          )}
                          {/* Entry lines summary */}
                          <div className="flex flex-wrap gap-1 text-xs">
                            {tmpl.entryLines.map((line, i) => (
                              <span
                                key={i}
                                className={`px-2 py-0.5 rounded ${
                                  line.entryType === 'debit'
                                    ? 'bg-blue-50 text-blue-700'
                                    : 'bg-green-50 text-green-700'
                                }`}
                              >
                                {line.entryType === 'debit' ? '借' : '貸'} {line.accountingCode} {line.accountingName}
                                {line.defaultAmount ? ` $${Number(line.defaultAmount).toLocaleString()}` : ''}
                              </span>
                            ))}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 ml-4">
                          {isLoggedIn && (
                            <>
                              <button
                                onClick={() => {
                                  setSelectedTemplateId(String(tmpl.id));
                                  handleSelectTemplate(String(tmpl.id));
                                  setActiveTab('execute');
                                }}
                                className="px-3 py-1.5 bg-rose-600 text-white rounded text-xs hover:bg-rose-700"
                              >
                                執行
                              </button>
                              <button
                                onClick={() => handleEditTemplate(tmpl)}
                                className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded text-xs hover:bg-gray-200"
                              >
                                編輯
                              </button>
                              <button
                                onClick={() => handleToggleTemplateActive(tmpl)}
                                className={`px-3 py-1.5 rounded text-xs ${
                                  tmpl.isActive
                                    ? 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200'
                                    : 'bg-green-100 text-green-700 hover:bg-green-200'
                                }`}
                              >
                                {tmpl.isActive ? '停用' : '啟用'}
                              </button>
                              {tmpl._count?.records === 0 && (
                                <button
                                  onClick={() => handleDeleteTemplate(tmpl.id)}
                                  className="px-3 py-1.5 bg-red-100 text-red-700 rounded text-xs hover:bg-red-200"
                                >
                                  刪除
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* ==================== Tab 2: Records ==================== */}
        {activeTab === 'records' && (
          <div>
            {/* Filters */}
            <div className="bg-white rounded-lg shadow-sm p-4 mb-4 flex flex-wrap gap-4 items-end">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">費用月份</label>
                <input
                  type="month"
                  value={recordFilter.month}
                  onChange={e => setRecordFilter(prev => ({ ...prev, month: e.target.value }))}
                  className="px-3 py-2 border border-gray-300 rounded text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">館別</label>
                <select
                  value={recordFilter.warehouse}
                  onChange={e => setRecordFilter(prev => ({ ...prev, warehouse: e.target.value }))}
                  className="px-3 py-2 border border-gray-300 rounded text-sm"
                >
                  <option value="">全部</option>
                  {warehouses.map(w => (
                    <option key={w} value={w}>{w}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">狀態</label>
                <select
                  value={recordFilter.status}
                  onChange={e => setRecordFilter(prev => ({ ...prev, status: e.target.value }))}
                  className="px-3 py-2 border border-gray-300 rounded text-sm"
                >
                  <option value="">全部</option>
                  <option value="待確認">待確認</option>
                  <option value="已確認">已確認</option>
                  <option value="已作廢">已作廢</option>
                </select>
              </div>
              <div className="text-sm text-gray-500">
                共 {recordsTotal} 筆
              </div>
            </div>

            {/* Records list */}
            <div className="bg-white rounded-lg shadow-sm overflow-hidden">
              {recordsLoading ? (
                <div className="p-8 text-center text-gray-500">載入中...</div>
              ) : records.length === 0 ? (
                <div className="p-8 text-center text-gray-500">尚無執行記錄</div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium text-gray-700">單號</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-700">範本</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-700">館別</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-700">月份</th>
                      <th className="px-4 py-3 text-right font-medium text-gray-700">借方</th>
                      <th className="px-4 py-3 text-right font-medium text-gray-700">貸方</th>
                      <th className="px-4 py-3 text-center font-medium text-gray-700">狀態</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-700">建立者</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-700">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {records.map(rec => (
                      <RecordRow
                        key={rec.id}
                        rec={rec}
                        isExpanded={expandedRecord === rec.id}
                        onToggle={() => setExpandedRecord(expandedRecord === rec.id ? null : rec.id)}
                        onConfirm={() => handleConfirmRecord(rec.id)}
                        onVoidClick={() => { setShowVoidModal(rec.id); setVoidReason(''); }}
                        onDelete={() => handleDeleteRecord(rec.id)}
                        isLoggedIn={isLoggedIn}
                        statusBadge={statusBadge}
                      />
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Void modal */}
            {showVoidModal && (
              <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
                <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md">
                  <h3 className="text-lg font-bold mb-4">作廢記錄</h3>
                  <label className="block text-sm font-medium text-gray-700 mb-1">作廢原因 *</label>
                  <textarea
                    value={voidReason}
                    onChange={e => setVoidReason(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded text-sm mb-4"
                    rows={3}
                    placeholder="請輸入作廢原因..."
                  />
                  <div className="flex gap-2 justify-end">
                    <button
                      onClick={() => { setShowVoidModal(null); setVoidReason(''); }}
                      className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 text-sm"
                    >
                      取消
                    </button>
                    <button
                      onClick={() => handleVoidRecord(showVoidModal)}
                      className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 text-sm"
                    >
                      確定作廢
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ==================== Tab 3: Quick Execute ==================== */}
        {activeTab === 'execute' && (
          <div>
            <div className="bg-white rounded-lg shadow-sm p-6">
              <h3 className="text-lg font-bold mb-4">快速執行費用範本</h3>

              {/* Template selection + basic info */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">選擇範本 *</label>
                  <select
                    value={selectedTemplateId}
                    onChange={e => handleSelectTemplate(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                  >
                    <option value="">-- 請選擇範本 --</option>
                    {templates.filter(t => t.isActive).map(t => (
                      <option key={t.id} value={t.id}>
                        {t.name} {t.category ? `(${t.category.name})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">館別 *</label>
                  <select
                    value={executeForm.warehouse}
                    onChange={e => {
                      setExecuteForm(prev => ({ ...prev, warehouse: e.target.value }));
                      setTimeout(refreshSummaries, 0);
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                  >
                    <option value="">-- 請選擇 --</option>
                    {warehouses.map(w => (
                      <option key={w} value={w}>{w}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">費用月份 *</label>
                  <input
                    type="month"
                    value={executeForm.expenseMonth}
                    onChange={e => {
                      setExecuteForm(prev => ({ ...prev, expenseMonth: e.target.value }));
                      setTimeout(refreshSummaries, 0);
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">供應商</label>
                  <select
                    value={executeForm.supplierId}
                    onChange={e => {
                      const sup = suppliers.find(s => s.id === parseInt(e.target.value));
                      setExecuteForm(prev => ({
                        ...prev,
                        supplierId: e.target.value,
                        supplierName: sup ? sup.name : ''
                      }));
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                  >
                    <option value="">-- 無 --</option>
                    {suppliers.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">付款方式</label>
                  <input
                    type="text"
                    value={executeForm.paymentMethod}
                    onChange={e => setExecuteForm(prev => ({ ...prev, paymentMethod: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                    placeholder="例：銀行轉帳"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">備註</label>
                  <input
                    type="text"
                    value={executeForm.note}
                    onChange={e => setExecuteForm(prev => ({ ...prev, note: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                    placeholder="備註..."
                  />
                </div>
              </div>

              {/* Entry lines with editable amounts */}
              {executeForm.entryLines.length > 0 && (
                <div className="mb-6">
                  <h4 className="text-sm font-bold text-gray-700 mb-2">分錄明細</h4>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-3 py-2 text-left w-20">借/貸</th>
                          <th className="px-3 py-2 text-left w-28">科目代碼</th>
                          <th className="px-3 py-2 text-left">科目名稱</th>
                          <th className="px-3 py-2 text-left">摘要</th>
                          <th className="px-3 py-2 text-right w-40">金額 *</th>
                        </tr>
                      </thead>
                      <tbody>
                        {executeForm.entryLines.map((line, idx) => (
                          <tr key={idx} className={`border-t ${line.entryType === 'debit' ? 'bg-blue-50/30' : 'bg-green-50/30'}`}>
                            <td className="px-3 py-2">
                              <span className={`px-2 py-1 rounded text-xs font-medium ${
                                line.entryType === 'debit'
                                  ? 'bg-blue-100 text-blue-700'
                                  : 'bg-green-100 text-green-700'
                              }`}>
                                {line.entryType === 'debit' ? '借方' : '貸方'}
                              </span>
                            </td>
                            <td className="px-3 py-2 font-mono">{line.accountingCode}</td>
                            <td className="px-3 py-2">{line.accountingName}</td>
                            <td className="px-3 py-2">
                              <input
                                type="text"
                                value={line.summary}
                                onChange={e => updateExecuteLine(idx, 'summary', e.target.value)}
                                className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                              />
                            </td>
                            <td className="px-3 py-2">
                              <input
                                type="number"
                                step="0.01"
                                value={line.amount}
                                onChange={e => updateExecuteLine(idx, 'amount', e.target.value)}
                                className="w-full px-2 py-1 border border-gray-300 rounded text-sm text-right"
                                placeholder="0.00"
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Balance summary row */}
                  {(() => {
                    const bal = getExecuteBalance();
                    return (
                      <div className={`mt-2 p-3 rounded text-sm flex gap-6 items-center ${
                        bal.balanced && bal.debit > 0
                          ? 'bg-green-50 text-green-700 border border-green-200'
                          : bal.debit === 0 && bal.credit === 0
                          ? 'bg-gray-50 text-gray-500'
                          : 'bg-red-50 text-red-700 border border-red-200'
                      }`}>
                        <span className="font-medium">借方合計: NT$ {bal.debit.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                        <span className="font-medium">貸方合計: NT$ {bal.credit.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                        {bal.balanced && bal.debit > 0 ? (
                          <span className="font-bold">-- 借貸平衡 --</span>
                        ) : bal.debit === 0 && bal.credit === 0 ? (
                          <span>請輸入金額</span>
                        ) : (
                          <span className="font-bold">差額: NT$ {Math.abs(bal.debit - bal.credit).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                        )}
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* Duplicate warning */}
              {duplicateWarning && (
                <div className="mb-4 p-3 bg-yellow-50 border border-yellow-300 rounded text-sm text-yellow-800">
                  <p className="font-medium mb-2">{duplicateWarning}</p>
                  <button
                    onClick={() => handleExecute(true)}
                    disabled={submitting}
                    className="px-4 py-1.5 bg-yellow-600 text-white rounded text-xs hover:bg-yellow-700 mr-2"
                  >
                    確定，仍要新增
                  </button>
                  <button
                    onClick={() => setDuplicateWarning(null)}
                    className="px-4 py-1.5 bg-gray-200 text-gray-700 rounded text-xs hover:bg-gray-300"
                  >
                    取消
                  </button>
                </div>
              )}

              {/* Submit button */}
              <button
                onClick={() => handleExecute(false)}
                disabled={submitting || !selectedTemplateId || executeForm.entryLines.length === 0}
                className={`px-6 py-2.5 rounded text-sm font-medium ${
                  submitting || !selectedTemplateId || executeForm.entryLines.length === 0
                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    : 'bg-rose-600 text-white hover:bg-rose-700'
                }`}
              >
                {submitting ? '處理中...' : '執行建立'}
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

// ====== Record Row Component ======
function RecordRow({ rec, isExpanded, onToggle, onConfirm, onVoidClick, onDelete, isLoggedIn, statusBadge }) {
  return (
    <>
      <tr className="hover:bg-gray-50 cursor-pointer" onClick={onToggle}>
        <td className="px-4 py-3 font-mono text-xs">
          <span className="flex items-center gap-1">
            <span className={`transform transition-transform ${isExpanded ? 'rotate-90' : ''}`}>&#9654;</span>
            {rec.recordNo}
          </span>
        </td>
        <td className="px-4 py-3">{rec.template?.name || '-'}</td>
        <td className="px-4 py-3">{rec.warehouse}</td>
        <td className="px-4 py-3">{rec.expenseMonth}</td>
        <td className="px-4 py-3 text-right font-medium text-blue-700">
          {Number(rec.totalDebit).toLocaleString(undefined, { minimumFractionDigits: 2 })}
        </td>
        <td className="px-4 py-3 text-right font-medium text-green-700">
          {Number(rec.totalCredit).toLocaleString(undefined, { minimumFractionDigits: 2 })}
        </td>
        <td className="px-4 py-3 text-center">{statusBadge(rec.status)}</td>
        <td className="px-4 py-3 text-xs text-gray-500">{rec.createdBy}</td>
        <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
          {isLoggedIn && (
            <div className="flex gap-1">
              {rec.status === '待確認' && (
                <>
                  <button
                    onClick={onConfirm}
                    className="px-2 py-1 bg-green-100 text-green-700 rounded text-xs hover:bg-green-200"
                  >
                    確認
                  </button>
                  <button
                    onClick={onVoidClick}
                    className="px-2 py-1 bg-gray-100 text-gray-600 rounded text-xs hover:bg-gray-200"
                  >
                    作廢
                  </button>
                  <button
                    onClick={onDelete}
                    className="px-2 py-1 bg-red-100 text-red-600 rounded text-xs hover:bg-red-200"
                  >
                    刪除
                  </button>
                </>
              )}
              {rec.status === '已確認' && (
                <button
                  onClick={onVoidClick}
                  className="px-2 py-1 bg-gray-100 text-gray-600 rounded text-xs hover:bg-gray-200"
                >
                  作廢
                </button>
              )}
            </div>
          )}
        </td>
      </tr>
      {isExpanded && (
        <tr>
          <td colSpan="9" className="px-4 py-0">
            <div className="bg-gray-50 rounded p-3 mb-2">
              {rec.supplierName && (
                <p className="text-xs text-gray-600 mb-1">供應商: {rec.supplierName}</p>
              )}
              {rec.paymentMethod && (
                <p className="text-xs text-gray-600 mb-1">付款方式: {rec.paymentMethod}</p>
              )}
              {rec.note && (
                <p className="text-xs text-gray-600 mb-1">備註: {rec.note}</p>
              )}
              {rec.confirmedBy && (
                <p className="text-xs text-gray-600 mb-1">確認者: {rec.confirmedBy} ({rec.confirmedAt?.slice(0, 10)})</p>
              )}
              {rec.voidedBy && (
                <p className="text-xs text-red-600 mb-1">作廢者: {rec.voidedBy} ({rec.voidedAt?.slice(0, 10)}) - {rec.voidReason}</p>
              )}
              <table className="w-full text-xs mt-2">
                <thead>
                  <tr className="border-b">
                    <th className="py-1 text-left w-16">借/貸</th>
                    <th className="py-1 text-left w-24">科目代碼</th>
                    <th className="py-1 text-left">科目名稱</th>
                    <th className="py-1 text-left">摘要</th>
                    <th className="py-1 text-right w-28">金額</th>
                  </tr>
                </thead>
                <tbody>
                  {rec.entryLines.map((line, i) => (
                    <tr key={i} className={`border-t ${line.entryType === 'debit' ? 'text-blue-700' : 'text-green-700'}`}>
                      <td className="py-1">
                        <span className={`px-1.5 py-0.5 rounded text-xs ${
                          line.entryType === 'debit' ? 'bg-blue-50' : 'bg-green-50'
                        }`}>
                          {line.entryType === 'debit' ? '借' : '貸'}
                        </span>
                      </td>
                      <td className="py-1 font-mono">{line.accountingCode}</td>
                      <td className="py-1">{line.accountingName}</td>
                      <td className="py-1">{line.summary}</td>
                      <td className="py-1 text-right font-medium">
                        {Number(line.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
