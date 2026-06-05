'use client';
import { useState, useCallback } from 'react';
import { todayStr } from '@/lib/localDate';

const OI_CATEGORIES = ['停車費', '清潔費', '設備租借', '其他'];

export function useOtherIncome({ showToast, defaultWarehouse = '民宿' }) {
  const thisMonth = todayStr().slice(0, 7);

  // ── 其他收入 list state ───────────────────────────────────────
  const [oiMonth,     setOiMonth]     = useState(thisMonth);
  const [oiWarehouse, setOiWarehouse] = useState('');
  const [oiRows,      setOiRows]      = useState([]);
  const [oiLoading,   setOiLoading]   = useState(false);
  const [oiError,     setOiError]     = useState(null);

  // ── 其他收入 modal state ──────────────────────────────────────
  const [oiModalOpen, setOiModalOpen] = useState(false);
  const [oiEditRow,   setOiEditRow]   = useState(null);
  const [oiSaving,    setOiSaving]    = useState(false);
  const [oiForm,      setOiForm]      = useState({
    importMonth: thisMonth, warehouse: defaultWarehouse,
    incomeDate: '', category: '', description: '', amount: '', note: '',
  });

  // ── 月固定費用模板 state ──────────────────────────────────────
  const [recurringTemplates,  setRecurringTemplates]  = useState([]);
  const [showRecurringMgr,    setShowRecurringMgr]    = useState(false);
  const [recurringForm,       setRecurringForm]       = useState({ warehouse: '', category: '', description: '', defaultAmt: '' });
  const [recurringDraftMonth, setRecurringDraftMonth] = useState(thisMonth);
  const [recurringDrafting,   setRecurringDrafting]   = useState(false);

  // ── CRUD ─────────────────────────────────────────────────────
  const fetchOtherIncome = useCallback(async () => {
    setOiLoading(true);
    setOiError(null);
    try {
      const params = new URLSearchParams();
      if (oiMonth) params.set('month', oiMonth);
      if (oiWarehouse) params.set('warehouse', oiWarehouse);
      const res = await fetch(`/api/bnb/other-income?${params}`);
      if (!res.ok) { setOiError('載入其他收入失敗，請稍後再試'); return; }
      const json = await res.json();
      setOiRows(Array.isArray(json.data) ? json.data : []);
    } catch { setOiError('載入其他收入失敗，請稍後再試'); }
    finally { setOiLoading(false); }
  }, [oiMonth, oiWarehouse]);

  function openOiModal(row) {
    setOiEditRow(row);
    setOiForm(row ? {
      importMonth: row.importMonth || oiMonth,
      warehouse:   row.warehouse   || defaultWarehouse,
      incomeDate:  row.incomeDate  || '',
      category:    row.category    || '',
      description: row.description || '',
      amount:      row.amount != null ? String(row.amount) : '',
      note:        row.note        || '',
    } : {
      importMonth: oiMonth,
      warehouse:   oiWarehouse || defaultWarehouse,
      incomeDate:  todayStr(),
      category: '', description: '', amount: '', note: '',
    });
    setOiModalOpen(true);
  }

  async function saveOtherIncome() {
    if (!oiForm.importMonth || !oiForm.incomeDate || !oiForm.description || !oiForm.amount) {
      showToast('請填寫月份、日期、說明、金額', 'error'); return;
    }
    setOiSaving(true);
    try {
      const body = {
        importMonth: oiForm.importMonth,
        warehouse:   oiForm.warehouse,
        incomeDate:  oiForm.incomeDate,
        category:    oiForm.category || null,
        description: oiForm.description.trim(),
        amount:      parseFloat(oiForm.amount) || 0,
        note:        oiForm.note?.trim() || null,
      };
      const url    = oiEditRow ? `/api/bnb/other-income/${oiEditRow.id}` : '/api/bnb/other-income';
      const method = oiEditRow ? 'PUT' : 'POST';
      const res    = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data   = await res.json();
      if (!res.ok) { showToast(data.error || '儲存失敗', 'error'); return; }
      showToast(oiEditRow ? '已更新' : '已新增', 'success');
      setOiModalOpen(false);
      fetchOtherIncome();
    } catch { showToast('儲存失敗', 'error'); }
    finally { setOiSaving(false); }
  }

  async function deleteOtherIncome(id) {
    try {
      const res = await fetch(`/api/bnb/other-income/${id}`, { method: 'DELETE' });
      if (!res.ok) { const d = await res.json(); showToast(d.error || '刪除失敗', 'error'); return; }
      showToast('已刪除', 'success');
      fetchOtherIncome();
    } catch { showToast('刪除失敗', 'error'); }
  }

  // ── 固定費用模板 ─────────────────────────────────────────────
  function fetchRecurringTemplates(wh) {
    const p = new URLSearchParams(wh ? { warehouse: wh } : {});
    fetch(`/api/bnb/recurring-expenses?${p}`)
      .then(r => r.ok ? r.json() : [])
      .then(data => setRecurringTemplates(Array.isArray(data) ? data : []))
      .catch(() => {});
  }

  async function saveRecurringTemplate() {
    if (!recurringForm.warehouse || !recurringForm.category || !recurringForm.description || !recurringForm.defaultAmt) {
      showToast('請填寫所有欄位', 'error'); return;
    }
    const res = await fetch('/api/bnb/recurring-expenses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(recurringForm),
    });
    if (res.ok) {
      showToast('模板已建立', 'success');
      setRecurringForm({ warehouse: '', category: '', description: '', defaultAmt: '' });
      fetchRecurringTemplates();
    } else {
      const err = await res.json().catch(() => ({}));
      showToast(err.error || '建立失敗', 'error');
    }
  }

  async function deleteRecurringTemplate(id) {
    const res = await fetch(`/api/bnb/recurring-expenses/${id}`, { method: 'DELETE' });
    if (res.ok) { showToast('已停用', 'success'); fetchRecurringTemplates(); }
    else showToast('操作失敗', 'error');
  }

  async function createRecurringDrafts() {
    if (!recurringDraftMonth) { showToast('請選擇月份', 'error'); return; }
    setRecurringDrafting(true);
    try {
      const res  = await fetch('/api/bnb/recurring-expenses?action=draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month: recurringDraftMonth }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        showToast(data.message || `已建立 ${data.created} 筆草稿`, 'success');
        fetchOtherIncome();
      } else showToast(data.error || '建立失敗', 'error');
    } catch { showToast('建立失敗', 'error'); }
    finally { setRecurringDrafting(false); }
  }

  return {
    // list
    oiMonth, setOiMonth, oiWarehouse, setOiWarehouse,
    oiRows, oiLoading, oiError, fetchOtherIncome,
    // modal
    oiModalOpen, setOiModalOpen, oiEditRow,
    oiForm, setOiForm, oiSaving,
    openOiModal, saveOtherIncome, deleteOtherIncome,
    // recurring
    recurringTemplates, showRecurringMgr, setShowRecurringMgr,
    recurringForm, setRecurringForm,
    recurringDraftMonth, setRecurringDraftMonth, recurringDrafting,
    fetchRecurringTemplates, saveRecurringTemplate,
    deleteRecurringTemplate, createRecurringDrafts,
    // constant
    OI_CATEGORIES,
  };
}
