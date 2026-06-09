'use client';

import { useState, useEffect, useMemo, Suspense } from 'react';
import { useSession } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';
import Navigation from '@/components/Navigation';
import FetchErrorBanner from '@/components/FetchErrorBanner';
import HelpButton from '@/components/HelpButton';
import { useToast } from '@/context/ToastContext';
import { useExpenseTemplates } from './_hooks/useExpenseTemplates';
import { useExpenseRecords } from './_hooks/useExpenseRecords';
import { useExpenseExecute } from './_hooks/useExpenseExecute';
import TemplatesTab from './_tabs/TemplatesTab';
import ExecuteTab from './_tabs/ExecuteTab';
import RecordsTab from './_tabs/RecordsTab';
import { labelStyle, inputStyle, tableStyle, thStyle, tdStyle, smallBtnStyle, PAYMENT_METHODS } from './_tabs/styles';

const MAIN_TABS = [{ key: 'fixed', label: '固定費用' }];
const SUB_TABS = [
  { key: 'templates', label: '費用範本' },
  { key: 'execute', label: '快速執行' },
  { key: 'records', label: '執行記錄' },
];

function ExpensesPageInner() {
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const { showToast } = useToast();
  const [mainTab, setMainTab] = useState('fixed');
  const [subTab, setSubTab] = useState(() => searchParams.get('subTab') || 'templates');

  // Shared reference data
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [products, setProducts] = useState([]);
  const [accountingSubjects, setAccountingSubjects] = useState([]);
  const [cashAccounts, setCashAccounts] = useState([]);
  const [expensesError, setExpensesError] = useState(null);

  // Feature hooks
  const templateHook = useExpenseTemplates({ mainTab, accountingSubjects });
  const recordsHook = useExpenseRecords({ mainTab, session, searchParams });
  const executeHook = useExpenseExecute({
    mainTab, templates: templateHook.templates, suppliers, session,
    subTab, fetchRecords: recordsHook.fetchRecords,
  });

  const filteredTemplates = useMemo(
    () => templateHook.templates.filter(t => (t.templateType || 'fixed') === mainTab),
    [templateHook.templates, mainTab]
  );
  const activeTemplates = useMemo(() => filteredTemplates.filter(t => t.isActive), [filteredTemplates]);

  useEffect(() => { fetchAll(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (subTab === 'records') recordsHook.fetchRecords();
  }, [subTab, mainTab, recordsHook.recordFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    executeHook.resetExecuteForm();
    templateHook.setShowTemplateForm(false);
    templateHook.setEditingTemplate(null);
  }, [mainTab]); // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchAll() {
    setLoading(true);
    try {
      const [templatesRes, categoriesRes, warehousesRes] = await Promise.all([
        fetch('/api/expense-templates?activeOnly=false'),
        fetch('/api/settings/expense-categories'),
        fetch('/api/warehouse-departments'),
      ]);
      if (!templatesRes.ok) throw new Error(`HTTP ${templatesRes.status}`);
      const templatesData = await templatesRes.json();
      const categoriesData = await categoriesRes.json();
      const warehousesData = await warehousesRes.json();
      setExpensesError(null);
      templateHook.setTemplates(Array.isArray(templatesData) ? templatesData : []);
      setCategories(Array.isArray(categoriesData) ? categoriesData : []);
      const whList = warehousesData?.byName
        ? Object.keys(warehousesData.byName)
        : Array.isArray(warehousesData)
          ? warehousesData.map(w => w.name || w)
          : typeof warehousesData === 'object' ? Object.keys(warehousesData) : [];
      setWarehouses(whList);
      setLoading(false);

      // Deferred second batch
      const [suppliersRes, productsRes, accountingRes, cashflowRes] = await Promise.all([
        fetch('/api/suppliers?activeOnly=true'),
        fetch('/api/products?all=true'),
        fetch('/api/accounting-subjects'),
        fetch('/api/cashflow/accounts').catch(() => ({ json: () => [] })),
      ]);
      const suppliersData = await suppliersRes.json();
      let productsData = []; try { productsData = await productsRes.json(); } catch { /* ignore */ }
      let accountingData = []; try { accountingData = await accountingRes.json(); } catch { /* ignore */ }
      let cashflowData = []; try { cashflowData = await cashflowRes.json(); } catch { /* ignore */ }
      setSuppliers(Array.isArray(suppliersData) ? suppliersData : (suppliersData?.suppliers || []));
      setProducts(Array.isArray(productsData) ? productsData : []);
      setAccountingSubjects(Array.isArray(accountingData) ? accountingData : []);
      setCashAccounts(Array.isArray(cashflowData) ? cashflowData.filter(a => a.isActive !== false) : []);
    } catch (err) {
      console.error('載入資料失敗:', err);
      setExpensesError('費用範本資料載入失敗，請重試。');
      setLoading(false);
    }
  }

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
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h1 style={{ fontSize: 26, fontWeight: 700, margin: 0 }}>費用管理</h1>
          <HelpButton anchor="十二費用管理" />
        </div>
        {expensesError && <div className="mb-4"><FetchErrorBanner message={expensesError} onRetry={fetchAll} /></div>}
        {recordsHook.recordsError && subTab === 'records' && (
          <div className="mb-4"><FetchErrorBanner message={recordsHook.recordsError} onRetry={recordsHook.fetchRecords} /></div>
        )}

        {/* Main Tabs */}
        <div style={{ display: 'flex', gap: 0, marginBottom: 0, borderBottom: '2px solid #dee2e6' }}>
          {MAIN_TABS.map(tab => (
            <button key={tab.key} onClick={() => setMainTab(tab.key)}
              style={{
                padding: '12px 28px',
                background: mainTab === tab.key ? '#fff' : '#e9ecef',
                color: mainTab === tab.key ? '#1a73e8' : '#555',
                border: mainTab === tab.key ? '2px solid #dee2e6' : '1px solid transparent',
                borderBottom: mainTab === tab.key ? '2px solid #fff' : 'none',
                borderRadius: '8px 8px 0 0',
                fontWeight: mainTab === tab.key ? 700 : 500,
                fontSize: 18, cursor: 'pointer',
                marginBottom: mainTab === tab.key ? -2 : 0,
              }}>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Sub Tabs */}
        <div style={{ display: 'flex', gap: 8, padding: '12px 0', borderBottom: '1px solid #eee', background: '#fff', paddingLeft: 16 }}>
          {SUB_TABS.map(tab => (
            <button key={tab.key} onClick={() => setSubTab(tab.key)}
              style={{
                padding: '6px 18px',
                background: subTab === tab.key ? '#1a73e8' : '#f8f9fa',
                color: subTab === tab.key ? '#fff' : '#333',
                border: subTab === tab.key ? 'none' : '1px solid #dee2e6',
                borderRadius: 6, fontWeight: 500, fontSize: 17, cursor: 'pointer',
              }}>
              {tab.label}
            </button>
          ))}
        </div>

        <div style={{ background: '#fff', padding: 20, borderRadius: '0 0 8px 8px', minHeight: 400 }}>
          {subTab === 'templates' && (
            <TemplatesTab
              mainTab={mainTab}
              filteredTemplates={filteredTemplates}
              showTemplateForm={templateHook.showTemplateForm}
              editingTemplate={templateHook.editingTemplate}
              templateForm={templateHook.templateForm}
              setTemplateForm={templateHook.setTemplateForm}
              templateSaving={templateHook.templateSaving}
              resetTemplateForm={templateHook.resetTemplateForm}
              handleEditTemplate={templateHook.handleEditTemplate}
              addEntryLineSingle={templateHook.addEntryLineSingle}
              removeEntryLine={templateHook.removeEntryLine}
              updateEntryLine={templateHook.updateEntryLine}
              updateEntryLineAccounting={templateHook.updateEntryLineAccounting}
              addPurchaseItem={templateHook.addPurchaseItem}
              removePurchaseItem={templateHook.removePurchaseItem}
              updatePurchaseItem={templateHook.updatePurchaseItem}
              getPurchaseTotal={templateHook.getPurchaseTotal}
              handleSaveTemplate={templateHook.handleSaveTemplate}
              handleDeleteTemplate={templateHook.handleDeleteTemplate}
              handleToggleTemplateActive={templateHook.handleToggleTemplateActive}
              warehouses={warehouses}
              categories={categories}
              suppliers={suppliers}
              products={products}
              cashAccounts={cashAccounts}
              onImportTemplates={templateHook.fetchTemplates}
            />
          )}
          {subTab === 'execute' && (
            <ExecuteTab
              mainTab={mainTab}
              selectedTemplateId={executeHook.selectedTemplateId}
              executeForm={executeHook.executeForm}
              setExecuteForm={executeHook.setExecuteForm}
              duplicateWarning={executeHook.duplicateWarning}
              submitting={executeHook.submitting}
              handleSelectTemplate={executeHook.handleSelectTemplate}
              updateExecuteLine={executeHook.updateExecuteLine}
              updateExecuteItem={executeHook.updateExecuteItem}
              addExecuteItem={executeHook.addExecuteItem}
              removeExecuteItem={executeHook.removeExecuteItem}
              getExecutePurchaseTotal={executeHook.getExecutePurchaseTotal}
              handleExecute={executeHook.handleExecute}
              activeTemplates={activeTemplates}
              warehouses={warehouses}
              suppliers={suppliers}
              products={products}
              cashAccounts={cashAccounts}
            />
          )}
          {subTab === 'records' && (
            <RecordsTab
              mainTab={mainTab}
              sortedExpenseRecords={recordsHook.sortedExpenseRecords}
              recordsTotal={recordsHook.recordsTotal}
              recordsLoading={recordsHook.recordsLoading}
              recordFilter={recordsHook.recordFilter}
              setRecordFilter={recordsHook.setRecordFilter}
              expandedRecord={recordsHook.expandedRecord}
              setExpandedRecord={recordsHook.setExpandedRecord}
              expRecSortKey={recordsHook.expRecSortKey}
              expRecSortDir={recordsHook.expRecSortDir}
              toggleExpRecSort={recordsHook.toggleExpRecSort}
              handlePrintMonthlyReport={recordsHook.handlePrintMonthlyReport}
              handleDeleteRecord={recordsHook.handleDeleteRecord}
              openEditRecord={recordsHook.openEditRecord}
              fetchRecords={recordsHook.fetchRecords}
              warehouses={warehouses}
              showToast={showToast}
            />
          )}
        </div>
      </div>

      {/* Edit Record Modal */}
      {recordsHook.editingRecord && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }}>
          <div style={{ background: '#fff', padding: 24, borderRadius: 8, width: 560, maxHeight: '80vh', overflow: 'auto' }}>
            <h3 style={{ fontSize: 19, fontWeight: 600, marginBottom: 4 }}>編輯費用記錄</h3>
            <div style={{ fontSize: 15, color: '#888', marginBottom: 16 }}>
              {recordsHook.editingRecord.recordNo} | {recordsHook.editingRecord.warehouse} | {recordsHook.editingRecord.expenseMonth}
              {recordsHook.editingRecord.paymentOrderNo && <> | 付款單: {recordsHook.editingRecord.paymentOrderNo}</>}
            </div>
            <label htmlFor="f-21" style={labelStyle}>付款方式</label>
            <select id="f-21" value={recordsHook.editForm.paymentMethod}
              onChange={e => recordsHook.setEditForm(prev => ({ ...prev, paymentMethod: e.target.value }))}
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
                {recordsHook.editForm.entryLines.map((line, i) => (
                  <tr key={i}>
                    <td style={{ ...tdStyle, padding: '4px 6px' }}>
                      <input value={line.accountingName}
                        onChange={e => {
                          const lines = [...recordsHook.editForm.entryLines];
                          lines[i] = { ...lines[i], accountingName: e.target.value };
                          recordsHook.setEditForm(prev => ({ ...prev, entryLines: lines }));
                        }}
                        style={{ ...inputStyle, marginBottom: 0, fontSize: 16 }} />
                    </td>
                    <td style={{ ...tdStyle, padding: '4px 6px' }}>
                      <input value={line.accountingCode}
                        onChange={e => {
                          const lines = [...recordsHook.editForm.entryLines];
                          lines[i] = { ...lines[i], accountingCode: e.target.value };
                          recordsHook.setEditForm(prev => ({ ...prev, entryLines: lines }));
                        }}
                        style={{ ...inputStyle, marginBottom: 0, fontSize: 16, width: 80 }} />
                    </td>
                    <td style={{ ...tdStyle, padding: '4px 6px' }}>
                      <input value={line.summary}
                        onChange={e => {
                          const lines = [...recordsHook.editForm.entryLines];
                          lines[i] = { ...lines[i], summary: e.target.value };
                          recordsHook.setEditForm(prev => ({ ...prev, entryLines: lines }));
                        }}
                        style={{ ...inputStyle, marginBottom: 0, fontSize: 16 }} />
                    </td>
                    <td style={{ ...tdStyle, padding: '4px 6px' }}>
                      <input type="number" value={line.amount}
                        onChange={e => {
                          const lines = [...recordsHook.editForm.entryLines];
                          lines[i] = { ...lines[i], amount: e.target.value };
                          recordsHook.setEditForm(prev => ({ ...prev, entryLines: lines }));
                        }}
                        style={{ ...inputStyle, marginBottom: 0, fontSize: 16, textAlign: 'right' }} />
                    </td>
                    <td style={{ ...tdStyle, padding: '4px 6px', textAlign: 'center' }}>
                      {recordsHook.editForm.entryLines.length > 1 && (
                        <button onClick={() => {
                          const lines = recordsHook.editForm.entryLines.filter((_, idx) => idx !== i);
                          recordsHook.setEditForm(prev => ({ ...prev, entryLines: lines }));
                        }}
                          style={{ ...smallBtnStyle, color: '#dc3545', padding: '2px 6px' }}>✕</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button onClick={() => recordsHook.setEditForm(prev => ({
              ...prev,
              entryLines: [...prev.entryLines, { accountingCode: '', accountingName: '', summary: '', amount: '' }],
            }))}
              style={{ ...smallBtnStyle, marginBottom: 12 }}>+ 新增明細</button>
            <div style={{ textAlign: 'right', fontSize: 17, fontWeight: 600, marginBottom: 12 }}>
              合計: NT$ {recordsHook.editForm.entryLines.reduce((s, l) => s + (parseFloat(l.amount) || 0), 0).toLocaleString()}
            </div>
            <label htmlFor="f-22" style={labelStyle}>備註</label>
            <textarea id="f-22" value={recordsHook.editForm.note}
              onChange={e => recordsHook.setEditForm(prev => ({ ...prev, note: e.target.value }))}
              style={{ ...inputStyle, height: 60, resize: 'vertical' }}
              placeholder="備註" />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
              <button onClick={() => recordsHook.setEditingRecord(null)}
                style={{ padding: '8px 16px', background: '#f8f9fa', border: '1px solid #dee2e6', borderRadius: 6, cursor: 'pointer' }}>
                取消
              </button>
              <button onClick={recordsHook.handleSaveEdit}
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

export default function ExpensesPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen text-gray-400">載入中…</div>}>
      <ExpensesPageInner />
    </Suspense>
  );
}
