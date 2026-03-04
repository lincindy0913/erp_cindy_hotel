'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import Navigation from '@/components/Navigation';

const IMPORT_TYPES = [
  { key: 'account_balance', label: '帳戶期初餘額', icon: '🏦', desc: '設定各帳戶的開帳餘額', required: ['account_code', 'opening_balance'] },
  { key: 'inventory_stock', label: '庫存期初存量', icon: '📦', desc: '設定各產品各館別的期初存量', required: ['product_code', 'warehouse', 'beginning_qty'] },
  { key: 'loan', label: '貸款主檔', icon: '🏛️', desc: '匯入貸款現況與還款記錄', required: ['loan_name', 'bank_name', 'warehouse', 'original_amount', 'current_balance'] },
  { key: 'accounts_payable', label: '應付帳款期初', icon: '📋', desc: '匯入未結清應付款項', required: ['supplier_name', 'invoice_no', 'amount'] },
  { key: 'supplier', label: '廠商主檔（批量）', icon: '🏢', desc: '批量建立廠商主資料', required: ['name'] },
  { key: 'product', label: '產品主檔（批量）', icon: '🏷️', desc: '批量建立產品主資料', required: ['code', 'name'] },
  { key: 'rental_property', label: '租屋物業主檔', icon: '🏠', desc: '匯入出租物業資料', required: ['property_name', 'address'] },
  { key: 'rental_tenant', label: '租客主檔', icon: '👤', desc: '匯入租客主資料', required: ['name'] },
  { key: 'rental_contract', label: '租約主檔', icon: '📝', desc: '匯入租約合約資料', required: ['property_name', 'tenant_name', 'start_date', 'monthly_rent'] },
];

const STATUS_LABELS = {
  pending: { label: '待上傳', color: 'bg-gray-100 text-gray-600' },
  uploaded: { label: '已上傳', color: 'bg-blue-100 text-blue-700' },
  validating: { label: '驗證中', color: 'bg-yellow-100 text-yellow-700' },
  validated: { label: '驗證通過', color: 'bg-green-100 text-green-700' },
  error: { label: '驗證失敗', color: 'bg-red-100 text-red-700' },
  confirmed: { label: '已確認', color: 'bg-blue-100 text-blue-700' },
  imported: { label: '已匯入', color: 'bg-green-100 text-green-700' },
};

export default function SetupImportPage() {
  const { data: session } = useSession();
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeSession, setActiveSession] = useState(null);
  const [showNewForm, setShowNewForm] = useState(false);
  const [newForm, setNewForm] = useState({ openingDate: '', note: '' });
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState({ text: '', type: '' });

  // Import wizard state
  const [activeBatchType, setActiveBatchType] = useState(null);
  const [uploadFile, setUploadFile] = useState(null);
  const [parsedRows, setParsedRows] = useState([]);
  const [validationResult, setValidationResult] = useState(null);
  const [validating, setValidating] = useState(false);
  const [importing, setImporting] = useState(false);

  const showMsg = (text, type = 'success') => {
    setMessage({ text, type });
    setTimeout(() => setMessage({ text: '', type: '' }), 4000);
  };

  const fetchSessions = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/setup-import');
      const data = await res.json();
      setSessions(Array.isArray(data) ? data : []);
    } catch {
      console.error('Failed to load sessions');
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchSessions(); }, [fetchSessions]);

  async function createSession() {
    if (!newForm.openingDate) { showMsg('開帳基準日為必填', 'error'); return; }
    setCreating(true);
    try {
      const res = await fetch('/api/setup-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newForm)
      });
      const data = await res.json();
      if (res.ok) {
        showMsg('匯入作業已建立');
        setShowNewForm(false);
        setNewForm({ openingDate: '', note: '' });
        await fetchSessions();
        setActiveSession(data);
      } else {
        showMsg(data.error?.message || '建立失敗', 'error');
      }
    } catch { showMsg('建立失敗', 'error'); }
    setCreating(false);
  }

  function handleFileChange(e) {
    const file = e.target.files[0];
    if (!file) return;
    setUploadFile(file);
    setValidationResult(null);
    setParsedRows([]);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = JSON.parse(evt.target.result);
        const rows = Array.isArray(data) ? data : [data];
        setParsedRows(rows);
        showMsg(`已解析 ${rows.length} 筆資料`);
      } catch {
        showMsg('JSON 格式錯誤，請確認檔案格式', 'error');
        setParsedRows([]);
      }
    };
    reader.readAsText(file, 'UTF-8');
  }

  async function validateBatch() {
    if (!activeSession || !activeBatchType || parsedRows.length === 0) {
      showMsg('請先選擇作業、類型並上傳檔案', 'error');
      return;
    }
    setValidating(true);
    try {
      const res = await fetch(`/api/setup-import/${activeSession.id}/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          importType: activeBatchType,
          fileName: uploadFile?.name,
          rows: parsedRows,
        })
      });
      const data = await res.json();
      if (res.ok) {
        setValidationResult(data);
        if (data.errorRows === 0) {
          showMsg(`驗證通過：${data.validRows} 筆資料準備就緒`);
        } else {
          showMsg(`驗證完成：${data.validRows} 筆通過，${data.errorRows} 筆有誤`, 'error');
        }
        await fetchSessions();
        if (activeSession) {
          const updated = (await fetch('/api/setup-import').then(r => r.json())).find(s => s.id === activeSession.id);
          if (updated) setActiveSession(updated);
        }
      } else {
        showMsg(data.error?.message || '驗證失敗', 'error');
      }
    } catch { showMsg('驗證失敗', 'error'); }
    setValidating(false);
  }

  async function confirmImport() {
    if (!validationResult || validationResult.errorRows > 0) {
      showMsg('請先通過驗證再確認匯入', 'error');
      return;
    }
    setImporting(true);
    try {
      const res = await fetch(`/api/setup-import/${activeSession.id}/batch/${validationResult.batchId}/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: parsedRows })
      });
      const data = await res.json();
      if (res.ok) {
        showMsg(data.message || `成功匯入 ${data.importedRows} 筆資料`);
        setValidationResult(null);
        setParsedRows([]);
        setUploadFile(null);
        setActiveBatchType(null);
        await fetchSessions();
        if (activeSession) {
          const updated = (await fetch('/api/setup-import').then(r => r.json())).find(s => s.id === activeSession.id);
          if (updated) setActiveSession(updated);
        }
      } else {
        showMsg(data.error?.message || '匯入失敗', 'error');
      }
    } catch { showMsg('匯入失敗', 'error'); }
    setImporting(false);
  }

  // Download template (generate sample JSON)
  function downloadTemplate(type) {
    const typeInfo = IMPORT_TYPES.find(t => t.key === type);
    if (!typeInfo) return;

    const samples = {
      account_balance: [{ account_code: 'B001', account_name: '玉山銀行', opening_balance: 158420.50, note: '' }],
      inventory_stock: [{ product_code: 'PRD-0001', product_name: '礦泉水 500ml', warehouse: '麗格', beginning_qty: 120, unit_cost: 12.5 }],
      loan: [{ loan_name: '土銀房貸三樓', bank_name: '土地銀行', warehouse: '麗格', original_amount: 12000000, current_balance: 8450000, interest_rate: 1.85, start_date: '2020-01-01' }],
      accounts_payable: [{ supplier_name: '聯合食材', invoice_no: 'INV-2026001', amount: 45000, due_date: '2026-02-28', note: '' }],
      supplier: [{ name: '聯合食材', contact_person: '王大明', phone: '02-1234-5678', email: '', address: '台北市', payment_terms: '月結30天' }],
      product: [{ code: 'PRD-0001', name: '礦泉水 500ml', category: '飲料', unit: '瓶', cost_price: 12.5, is_in_stock: true }],
      rental_property: [{ property_name: '中山路一段3F', address: '台北市中山區中山北路1段100號3F', monthly_rent: 30000 }],
      rental_tenant: [{ name: '陳大文', phone: '0912345678', email: '', id_no: 'A123456789' }],
      rental_contract: [{ property_name: '中山路一段3F', tenant_name: '陳大文', start_date: '2024-01-01', end_date: '2025-12-31', monthly_rent: 30000, deposit: 60000 }],
    };

    const data = JSON.stringify(samples[type] || [], null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `template_${type}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const activeBatchInfo = IMPORT_TYPES.find(t => t.key === activeBatchType);
  const activeBatchStatus = activeSession?.batches?.find(b => b.importType === activeBatchType)?.status;

  return (
    <div className="min-h-screen bg-amber-50">
      <Navigation borderColor="border-amber-500" />

      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-gray-800">期初資料匯入</h2>
          <p className="text-sm text-gray-500 mt-1">系統上線前一次性批量匯入期初資料（帳戶餘額、庫存、貸款、應付款等）</p>
        </div>

        {/* Warning banner */}
        <div className="bg-amber-100 border border-amber-300 rounded-lg p-4 mb-6 flex items-start gap-3">
          <svg className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
          <div>
            <p className="text-sm font-semibold text-amber-800">⚠️ 重要說明</p>
            <p className="text-sm text-amber-700 mt-1">期初資料匯入屬不可輕易逆轉的操作，設計為系統上線前使用一次。首次月結完成後，工具將自動封存以防止誤操作。</p>
          </div>
        </div>

        {/* Message */}
        {message.text && (
          <div className={`mb-4 px-4 py-3 rounded-lg text-sm font-medium ${
            message.type === 'error' ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-green-50 text-green-700 border border-green-200'
          }`}>
            {message.text}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Session List */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-700">匯入作業</h3>
              <button
                onClick={() => setShowNewForm(!showNewForm)}
                className="text-xs px-3 py-1.5 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors"
              >
                + 新建作業
              </button>
            </div>

            {/* New session form */}
            {showNewForm && (
              <div className="bg-white rounded-lg border border-amber-200 p-4 mb-3">
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">開帳基準日 *</label>
                    <input
                      type="date"
                      value={newForm.openingDate}
                      onChange={e => setNewForm(f => ({ ...f, openingDate: e.target.value }))}
                      className="w-full px-3 py-1.5 border rounded-lg text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">備註</label>
                    <input
                      type="text"
                      value={newForm.note}
                      onChange={e => setNewForm(f => ({ ...f, note: e.target.value }))}
                      className="w-full px-3 py-1.5 border rounded-lg text-sm"
                      placeholder="可選填備註"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button onClick={createSession} disabled={creating} className="flex-1 px-3 py-1.5 bg-amber-600 text-white text-sm rounded-lg hover:bg-amber-700 disabled:opacity-50">
                      {creating ? '建立中...' : '建立'}
                    </button>
                    <button onClick={() => setShowNewForm(false)} className="px-3 py-1.5 border text-gray-600 text-sm rounded-lg hover:bg-gray-50">
                      取消
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Sessions list */}
            {loading ? (
              <div className="text-center py-8 text-gray-400 text-sm">載入中...</div>
            ) : sessions.length === 0 ? (
              <div className="text-center py-8 text-gray-400 text-sm bg-white rounded-lg border">
                尚無匯入作業<br />
                <span className="text-xs">請點擊「新建作業」開始</span>
              </div>
            ) : (
              <div className="space-y-2">
                {sessions.map(s => {
                  const importedCount = s.batches?.filter(b => b.status === 'imported').length || 0;
                  const totalCount = s.batches?.length || 0;
                  const isArchived = s.status === 'archived';

                  return (
                    <div
                      key={s.id}
                      onClick={() => { setActiveSession(s); setActiveBatchType(null); setValidationResult(null); setParsedRows([]); setUploadFile(null); }}
                      className={`bg-white rounded-lg border p-3 cursor-pointer transition-all ${
                        activeSession?.id === s.id ? 'border-amber-400 shadow-sm' : 'border-gray-200 hover:border-amber-300'
                      } ${isArchived ? 'opacity-60' : ''}`}
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="text-sm font-medium text-gray-800">{s.sessionNo}</div>
                          <div className="text-xs text-gray-500 mt-0.5">開帳日：{s.openingDate}</div>
                        </div>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          s.status === 'completed' ? 'bg-green-100 text-green-700' :
                          s.status === 'archived' ? 'bg-gray-100 text-gray-500' :
                          'bg-amber-100 text-amber-700'
                        }`}>
                          {s.status === 'completed' ? '已完成' : s.status === 'archived' ? '已封存' : '進行中'}
                        </span>
                      </div>
                      {totalCount > 0 && (
                        <div className="mt-2">
                          <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
                            <span>{importedCount}/{totalCount} 批次完成</span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-1.5">
                            <div
                              className="bg-amber-500 h-1.5 rounded-full"
                              style={{ width: totalCount > 0 ? `${(importedCount / totalCount) * 100}%` : '0%' }}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right: Import Wizard */}
          <div className="lg:col-span-2">
            {!activeSession ? (
              <div className="bg-white rounded-lg border border-dashed border-gray-300 p-12 text-center">
                <svg className="w-12 h-12 mx-auto text-gray-300 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                <p className="text-gray-400">請選擇或新建匯入作業</p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Session header */}
                <div className="bg-white rounded-lg border p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-semibold text-gray-800">{activeSession.sessionNo}</h3>
                      <p className="text-sm text-gray-500">開帳基準日：{activeSession.openingDate} · 建立人：{activeSession.createdBy}</p>
                    </div>
                    {activeSession.status === 'archived' && (
                      <span className="text-sm text-gray-500 bg-gray-100 px-3 py-1 rounded-lg">已封存（月結後）</span>
                    )}
                  </div>
                </div>

                {/* Data type selector grid */}
                <div className="bg-white rounded-lg border p-4">
                  <h4 className="text-sm font-semibold text-gray-700 mb-3">選擇匯入資料類型</h4>
                  <div className="grid grid-cols-3 gap-2">
                    {IMPORT_TYPES.map(type => {
                      const batchStatus = activeSession.batches?.find(b => b.importType === type.key)?.status;
                      const isImported = batchStatus === 'imported';
                      return (
                        <button
                          key={type.key}
                          onClick={() => {
                            setActiveBatchType(type.key);
                            setValidationResult(null);
                            setParsedRows([]);
                            setUploadFile(null);
                          }}
                          disabled={activeSession.status === 'archived'}
                          className={`p-3 rounded-lg border text-left transition-all relative ${
                            activeBatchType === type.key
                              ? 'border-amber-500 bg-amber-50'
                              : isImported
                                ? 'border-green-300 bg-green-50'
                                : 'border-gray-200 hover:border-amber-300 bg-white'
                          } disabled:opacity-50`}
                        >
                          <div className="text-lg mb-1">{type.icon}</div>
                          <div className="text-xs font-medium text-gray-800">{type.label}</div>
                          {batchStatus && (
                            <div className={`mt-1 text-xs px-1.5 py-0.5 rounded inline-block ${STATUS_LABELS[batchStatus]?.color || ''}`}>
                              {STATUS_LABELS[batchStatus]?.label || batchStatus}
                            </div>
                          )}
                          {isImported && (
                            <div className="absolute top-2 right-2">
                              <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                              </svg>
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Upload & Validate Panel */}
                {activeBatchType && (
                  <div className="bg-white rounded-lg border p-4">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h4 className="text-sm font-semibold text-gray-800">
                          {activeBatchInfo?.icon} {activeBatchInfo?.label}
                        </h4>
                        <p className="text-xs text-gray-500 mt-0.5">{activeBatchInfo?.desc}</p>
                      </div>
                      <button
                        onClick={() => downloadTemplate(activeBatchType)}
                        className="text-xs px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors flex items-center gap-1"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                        下載範本
                      </button>
                    </div>

                    {/* Required fields hint */}
                    <div className="bg-gray-50 rounded-lg p-3 mb-4 text-xs text-gray-500">
                      <span className="font-medium">必填欄位：</span>
                      {activeBatchInfo?.required.join('、')}
                    </div>

                    {/* File upload */}
                    <div className="mb-4">
                      <label className="block text-sm font-medium text-gray-600 mb-1">上傳 JSON 檔案</label>
                      <input
                        type="file"
                        accept=".json"
                        onChange={handleFileChange}
                        className="text-sm w-full border border-gray-200 rounded-lg px-3 py-2"
                      />
                      {parsedRows.length > 0 && (
                        <p className="text-xs text-gray-500 mt-1">已解析 <strong>{parsedRows.length}</strong> 筆資料</p>
                      )}
                    </div>

                    {/* Preview (first 3 rows) */}
                    {parsedRows.length > 0 && (
                      <div className="mb-4">
                        <p className="text-xs text-gray-500 mb-1">預覽（前 3 筆）</p>
                        <div className="overflow-auto max-h-32 bg-gray-50 rounded text-xs">
                          <pre className="p-2 text-gray-600">{JSON.stringify(parsedRows.slice(0, 3), null, 2)}</pre>
                        </div>
                      </div>
                    )}

                    {/* Validate button */}
                    <div className="flex gap-3">
                      <button
                        onClick={validateBatch}
                        disabled={parsedRows.length === 0 || validating}
                        className="px-4 py-2 bg-gray-600 text-white text-sm rounded-lg hover:bg-gray-700 disabled:opacity-50 transition-colors"
                      >
                        {validating ? '驗證中...' : '驗證資料'}
                      </button>
                      {validationResult && validationResult.errorRows === 0 && (
                        <button
                          onClick={confirmImport}
                          disabled={importing}
                          className="px-4 py-2 bg-amber-600 text-white text-sm rounded-lg hover:bg-amber-700 disabled:opacity-50 transition-colors"
                        >
                          {importing ? '匯入中...' : `確認匯入 ${validationResult.validRows} 筆`}
                        </button>
                      )}
                    </div>

                    {/* Validation result */}
                    {validationResult && (
                      <div className={`mt-4 rounded-lg p-4 ${validationResult.errorRows === 0 ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
                        <div className="flex items-center gap-2 mb-2">
                          {validationResult.errorRows === 0 ? (
                            <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                          ) : (
                            <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                          )}
                          <span className={`text-sm font-medium ${validationResult.errorRows === 0 ? 'text-green-800' : 'text-red-800'}`}>
                            {validationResult.errorRows === 0
                              ? `驗證通過：${validationResult.validRows} 筆資料可匯入`
                              : `驗證失敗：${validationResult.validRows} 筆通過，${validationResult.errorRows} 筆有誤`
                            }
                          </span>
                        </div>

                        {validationResult.errorDetails?.length > 0 && (
                          <div className="mt-2 space-y-1 max-h-40 overflow-auto">
                            {validationResult.errorDetails.slice(0, 10).map((err, i) => (
                              <div key={i} className="text-xs text-red-700">
                                第 {err.rowNo} 列：{err.errors?.map(e => `${e.field} - ${e.message}`).join('；')}
                              </div>
                            ))}
                            {validationResult.errorDetails.length > 10 && (
                              <div className="text-xs text-red-500">...還有 {validationResult.errorDetails.length - 10} 個錯誤</div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Batch progress table */}
                {activeSession.batches?.length > 0 && (
                  <div className="bg-white rounded-lg border overflow-hidden">
                    <div className="px-4 py-3 border-b bg-gray-50">
                      <h4 className="text-sm font-medium text-gray-700">批次進度</h4>
                    </div>
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-2 text-left text-xs text-gray-500">類型</th>
                          <th className="px-4 py-2 text-center text-xs text-gray-500">總計</th>
                          <th className="px-4 py-2 text-center text-xs text-gray-500">通過</th>
                          <th className="px-4 py-2 text-center text-xs text-gray-500">匯入</th>
                          <th className="px-4 py-2 text-center text-xs text-gray-500">狀態</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {activeSession.batches.map(b => {
                          const typeInfo = IMPORT_TYPES.find(t => t.key === b.importType);
                          const statusInfo = STATUS_LABELS[b.status] || { label: b.status, color: 'bg-gray-100 text-gray-600' };
                          return (
                            <tr key={b.id} className="hover:bg-gray-50">
                              <td className="px-4 py-2">
                                <span className="mr-1">{typeInfo?.icon}</span>
                                {typeInfo?.label || b.importType}
                              </td>
                              <td className="px-4 py-2 text-center text-gray-600">{b.totalRows}</td>
                              <td className="px-4 py-2 text-center text-green-600">{b.validRows}</td>
                              <td className="px-4 py-2 text-center text-amber-600">{b.importedRows}</td>
                              <td className="px-4 py-2 text-center">
                                <span className={`text-xs px-2 py-0.5 rounded-full ${statusInfo.color}`}>
                                  {statusInfo.label}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
