'use client';

import { useState, useEffect, useCallback } from 'react';

export const IMPORT_TYPES = [
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

export const STATUS_LABELS = {
  pending: { label: '待上傳', color: 'bg-gray-100 text-gray-600' },
  uploaded: { label: '已上傳', color: 'bg-blue-100 text-blue-700' },
  validating: { label: '驗證中', color: 'bg-yellow-100 text-yellow-700' },
  validated: { label: '驗證通過', color: 'bg-green-100 text-green-700' },
  error: { label: '驗證失敗', color: 'bg-red-100 text-red-700' },
  confirmed: { label: '已確認', color: 'bg-blue-100 text-blue-700' },
  imported: { label: '已匯入', color: 'bg-green-100 text-green-700' },
};

const TEMPLATE_SAMPLES = {
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

export function useSetupImport() {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(null);
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
    setFetchError(null);
    try {
      const res = await fetch('/api/setup-import');
      if (!res.ok) { setFetchError('匯入作業列表載入失敗，請稍後再試'); return; }
      const data = await res.json();
      setSessions(Array.isArray(data) ? data : []);
    } catch {
      setFetchError('匯入作業列表載入失敗，請稍後再試');
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

  function downloadTemplate(type) {
    const typeInfo = IMPORT_TYPES.find(t => t.key === type);
    if (!typeInfo) return;
    const data = JSON.stringify(TEMPLATE_SAMPLES[type] || [], null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `template_${type}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function selectSession(s) {
    setActiveSession(s);
    setActiveBatchType(null);
    setValidationResult(null);
    setParsedRows([]);
    setUploadFile(null);
  }

  function selectBatchType(key) {
    setActiveBatchType(key);
    setValidationResult(null);
    setParsedRows([]);
    setUploadFile(null);
  }

  // Computed
  const activeBatchInfo = IMPORT_TYPES.find(t => t.key === activeBatchType);
  const activeBatchStatus = activeSession?.batches?.find(b => b.importType === activeBatchType)?.status;

  return {
    // State
    sessions, loading, fetchError,
    activeSession, showNewForm, setShowNewForm,
    newForm, setNewForm, creating,
    message,
    activeBatchType, uploadFile, parsedRows,
    validationResult, validating, importing,
    // Computed
    activeBatchInfo, activeBatchStatus,
    // Handlers
    fetchSessions, createSession,
    handleFileChange, validateBatch, confirmImport,
    downloadTemplate, selectSession, selectBatchType,
  };
}
