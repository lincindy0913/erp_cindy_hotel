'use client';

import { useState, useMemo } from 'react';
import { useToast } from '@/context/ToastContext';
import { useConfirm } from '@/context/ConfirmContext';
import { sortRows, useColumnSort } from '@/components/SortableTh';
import { todayStr } from '@/lib/localDate';

export function useExpenseRecords({ mainTab, session, searchParams } = {}) {
  const { showToast } = useToast();
  const confirm = useConfirm();

  const [records, setRecords] = useState([]);
  const [recordsTotal, setRecordsTotal] = useState(0);
  const [recordsLoading, setRecordsLoading] = useState(false);
  const [recordsError, setRecordsError] = useState(null);
  const [recordFilter, setRecordFilter] = useState({
    month: (searchParams && searchParams.get('month')) || todayStr().slice(0, 7),
    warehouse: (searchParams && searchParams.get('warehouse')) || '',
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

  // Void modal state
  const [voidReason, setVoidReason] = useState('');
  const [showVoidModal, setShowVoidModal] = useState(null);

  // Edit record state
  const [editingRecord, setEditingRecord] = useState(null);
  const [editForm, setEditForm] = useState({ entryLines: [], note: '', paymentMethod: '' });

  async function fetchRecords() {
    setRecordsLoading(true);
    try {
      const params = new URLSearchParams();
      if (recordFilter.month) params.set('month', recordFilter.month);
      if (recordFilter.warehouse) params.set('warehouse', recordFilter.warehouse);
      if (recordFilter.status) params.set('paymentStatus', recordFilter.status);
      params.set('type', mainTab);
      const res = await fetch(`/api/expense-records?${params.toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setRecordsError(null);
      setRecords(data.records || []);
      setRecordsTotal(data.total || 0);
    } catch (err) {
      console.error('載入記錄失敗:', err);
      setRecordsError('費用執行記錄載入失敗，請重試。');
      setRecords([]);
    }
    setRecordsLoading(false);
  }

  async function handleConfirmRecord(id) {
    if (!(await confirm('確定要確認此記錄嗎？', { title: '確認操作', danger: false }))) return;
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
    if (!(await confirm('確定要刪除此記錄及關聯的付款單嗎？此操作無法復原。', { title: '刪除確認', danger: true }))) return;
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

  function handlePrintMonthlyReport(sortedRecords) {
    const rows = sortedRecords;
    if (rows.length === 0) { showToast('沒有資料可列印', 'error'); return; }
    const monthLabel = recordFilter.month || '全部月份';
    const warehouseLabel = recordFilter.warehouse || '全部館別';
    const title = `每月支出報表 — ${monthLabel} ${warehouseLabel}`;
    const w = window.open('', '_blank');
    const total = rows.reduce((s, r) => s + Number(r.totalDebit || 0), 0);
    w.document.write(`<html><head><title>${title}</title><style>
      body{font-family:'Microsoft JhengHei',sans-serif;padding:20px;font-size:13px}
      h2{margin:0 0 4px}
      .info{color:#666;font-size:12px;margin-bottom:12px}
      table{width:100%;border-collapse:collapse;margin-top:8px}
      th,td{border:1px solid #ccc;padding:6px 8px;text-align:left;vertical-align:top}
      th{background:#f3f4f6;font-weight:600;font-size:12px}
      .right{text-align:right}
      .amt{text-align:right;font-weight:500}
      .sub{font-size:11px;color:#555;margin-top:3px}
      .badge{display:inline-block;padding:1px 6px;border-radius:3px;font-size:11px}
      .paid{background:#d4edda;color:#155724}
      .pending{background:#fff3cd;color:#856404}
      .advance{background:#f3e8ff;color:#6d28d9}
      .total-row{font-weight:700;background:#f9fafb}
      @media print{button{display:none}}
    </style></head><body>
    <h2>${title}</h2>
    <div class="info">列印時間: ${new Date().toLocaleString('zh-TW')}</div>
    <table>
      <thead><tr>
        <th>記錄單號</th><th>範本</th><th>月份</th><th>館別</th>
        <th class="right">金額</th><th>費用明細</th><th>關聯單號</th><th>狀態</th>
      </tr></thead>
      <tbody>
        ${rows.map(r => {
          const debitLines = (r.entryLines || []).filter(l => l.entryType === 'debit');
          const ps = r.paymentStatus || r.status || '';
          const badgeClass = ps === '已付款' ? 'paid' : ps === '待出納' ? 'pending' : ps === '已代墊' ? 'advance' : '';
          const relatedNos = [r.purchaseNo, r.salesNo, r.paymentOrderNo].filter(Boolean).join(' / ');
          const linesHtml = debitLines.map(l =>
            `<div class="sub">${l.accountingName || ''}${l.summary ? ' — ' + l.summary : ''} <span style="float:right">${Number(l.amount).toLocaleString()}</span></div>`
          ).join('');
          return `<tr>
            <td style="font-family:monospace">${r.recordNo || ''}</td>
            <td>${r.template?.name || '－'}</td>
            <td>${r.expenseMonth || ''}</td>
            <td>${r.warehouse || ''}</td>
            <td class="amt">${Number(r.totalDebit || 0).toLocaleString()}</td>
            <td>${linesHtml || '－'}</td>
            <td style="font-size:11px">${relatedNos || '－'}</td>
            <td><span class="badge ${badgeClass}">${ps || '－'}</span></td>
          </tr>`;
        }).join('')}
        <tr class="total-row">
          <td colspan="4" class="right">合計 ${rows.length} 筆</td>
          <td class="amt">NT$ ${total.toLocaleString()}</td>
          <td colspan="3"></td>
        </tr>
      </tbody>
    </table>
    <button onclick="window.print()" style="margin-top:14px;padding:8px 20px;font-size:14px;cursor:pointer">列印</button>
    </body></html>`);
    w.document.close();
  }

  return {
    records, setRecords,
    recordsTotal, setRecordsTotal,
    recordsLoading,
    recordsError, setRecordsError,
    recordFilter, setRecordFilter,
    expandedRecord, setExpandedRecord,
    expRecSortKey, expRecSortDir, toggleExpRecSort,
    sortedExpenseRecords,
    voidReason, setVoidReason,
    showVoidModal, setShowVoidModal,
    editingRecord, setEditingRecord,
    editForm, setEditForm,
    fetchRecords,
    handleConfirmRecord,
    handleVoidRecord,
    handleDeleteRecord,
    openEditRecord,
    handleSaveEdit,
    handlePrintMonthlyReport,
  };
}
