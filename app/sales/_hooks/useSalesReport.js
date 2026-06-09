'use client';

import { useState, useEffect } from 'react';
import { useToast } from '@/context/ToastContext';
import { useConfirm } from '@/context/ConfirmContext';
import { todayStr } from '@/lib/localDate';

export function useSalesReport({ activeView, searchParams }) {
  const { showToast } = useToast();
  const confirm = useConfirm();

  // 報表 view 篩選
  const [reportDateFrom, setReportDateFrom] = useState('');
  const [reportDateTo, setReportDateTo] = useState('');
  const [reportTitle, setReportTitle] = useState('');
  const [reportWarehouse, setReportWarehouse] = useState('');
  const [reportType, setReportType] = useState('');
  const [reportOwnerData, setReportOwnerData] = useState({ total: 0, count: 0 });

  // 業主發票私帳 — 個別登錄
  const [privateInvoices, setPrivateInvoices] = useState([]);
  const [privateLoading, setPrivateLoading] = useState(false);
  const [privateError, setPrivateError] = useState(null);
  const [showPrivateForm, setShowPrivateForm] = useState(false);
  const [editingPrivateId, setEditingPrivateId] = useState(null);
  const [privateForm, setPrivateForm] = useState({
    invoiceDate:  todayStr(),
    invoiceNo:    '',
    invoiceTitle: '',
    totalAmount:  '',
    note:         '',
    warehouse:    '',
  });
  const [privateSaving, setPrivateSaving] = useState(false);

  const reportSubIsOwner   = searchParams.get('sub') === 'owner';
  const reportSubIsPrivate = searchParams.get('sub') === 'private';

  async function fetchPrivateInvoices(from, to) {
    setPrivateLoading(true);
    try {
      const p = new URLSearchParams({ invoiceType: '業主發票私帳', limit: '500' });
      if (from) p.set('dateFrom', from);
      if (to)   p.set('dateTo', to);
      const res = await fetch(`/api/sales/with-info?${p}`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setPrivateError(null);
        setPrivateInvoices(Array.isArray(data.data) ? data.data : []);
      } else {
        setPrivateError('業主私帳發票載入失敗，請重試。');
      }
    } catch { setPrivateError('業主私帳發票載入失敗，請檢查網路連線。'); }
    setPrivateLoading(false);
  }

  async function fetchOwnerExpenseTotal(from, to) {
    try {
      const fromMonth = from ? from.slice(0, 7) : '2000-01';
      const toMonth   = to   ? to.slice(0, 7)   : '2099-12';
      const res = await fetch(`/api/owner-expenses?from=${fromMonth}&to=${toMonth}`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setReportOwnerData({ total: data.total ?? 0, count: data.count ?? 0 });
      }
    } catch { setReportOwnerData({ total: 0, count: 0 }); }
  }

  async function savePrivateInvoice() {
    if (!privateForm.invoiceNo.trim()) return showToast('請填寫發票號碼', 'error');
    if (!privateForm.invoiceTitle) return showToast('請選擇發票抬頭', 'error');
    if (!privateForm.totalAmount || Number(privateForm.totalAmount) <= 0) return showToast('請填寫金額', 'error');
    setPrivateSaving(true);
    try {
      const amt = parseFloat(privateForm.totalAmount) || 0;
      const body = {
        invoiceNo:    privateForm.invoiceNo.trim(),
        invoiceDate:  privateForm.invoiceDate,
        invoiceTitle: privateForm.invoiceTitle,
        invoiceType:  '業主發票私帳',
        totalAmount:  amt,
        amount:       amt,
        tax:          0,
        warehouse:    privateForm.warehouse,
        note:         privateForm.note,
        items:        [],
      };
      const url    = editingPrivateId ? `/api/sales/${editingPrivateId}` : '/api/sales';
      const method = editingPrivateId ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        credentials: 'include',
      });
      const data = await res.json();
      if (!res.ok) return showToast(data.error || data.message || '儲存失敗', 'error');
      showToast(editingPrivateId ? '已更新' : '已新增業主私帳發票', 'success');
      setShowPrivateForm(false);
      setEditingPrivateId(null);
      setPrivateForm({ invoiceDate: todayStr(), invoiceNo: '', invoiceTitle: '', totalAmount: '', note: '', warehouse: '' });
      fetchPrivateInvoices(reportDateFrom, reportDateTo);
    } catch (err) { showToast('儲存失敗: ' + err.message, 'error'); }
    finally { setPrivateSaving(false); }
  }

  async function deletePrivateInvoice(id) {
    if (!(await confirm('確定要刪除此筆業主私帳發票？', { title: '刪除確認', danger: true }))) return;
    try {
      const res = await fetch(`/api/sales/${id}`, { method: 'DELETE', credentials: 'include' });
      const data = await res.json();
      if (!res.ok) return showToast(data.error || '刪除失敗', 'error');
      showToast('已刪除', 'success');
      fetchPrivateInvoices(reportDateFrom, reportDateTo);
    } catch (err) { showToast('刪除失敗: ' + err.message, 'error'); }
  }

  function openEditPrivate(inv) {
    setEditingPrivateId(inv.id);
    setPrivateForm({
      invoiceDate:  inv.invoiceDate || todayStr(),
      invoiceNo:    inv.invoiceNo || '',
      invoiceTitle: inv.invoiceTitle || '',
      totalAmount:  String(inv.totalAmount || ''),
      note:         inv.items?.[0]?.note || '',
      warehouse:    inv.warehouse || '',
    });
    setShowPrivateForm(true);
  }

  // ── effects ──

  useEffect(() => {
    if (activeView === 'report') {
      fetchOwnerExpenseTotal(reportDateFrom, reportDateTo);
      fetchPrivateInvoices(reportDateFrom, reportDateTo);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeView, reportDateFrom, reportDateTo]);

  useEffect(() => {
    if (activeView === 'report' && reportSubIsPrivate) fetchPrivateInvoices(reportDateFrom, reportDateTo);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportSubIsPrivate]);

  return {
    reportDateFrom, setReportDateFrom,
    reportDateTo, setReportDateTo,
    reportTitle, setReportTitle,
    reportWarehouse, setReportWarehouse,
    reportType, setReportType,
    reportOwnerData,
    privateInvoices,
    privateLoading,
    privateError,
    showPrivateForm, setShowPrivateForm,
    editingPrivateId, setEditingPrivateId,
    privateForm, setPrivateForm,
    privateSaving,
    reportSubIsOwner,
    reportSubIsPrivate,
    fetchPrivateInvoices,
    fetchOwnerExpenseTotal,
    savePrivateInvoice,
    deletePrivateInvoice,
    openEditPrivate,
  };
}
