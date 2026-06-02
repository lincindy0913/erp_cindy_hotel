'use client';

import { useState } from 'react';
import { useToast } from '@/context/ToastContext';
import { useConfirm } from '@/context/ConfirmContext';
import { openPrintWindow } from '@/lib/printWindow';
import { todayStr } from '@/lib/localDate';

export function useRentalTaxes({ initialFilter } = {}) {
  const { showToast } = useToast();
  const confirm = useConfirm();

  const [taxes,          setTaxes]          = useState([]);
  const [taxFilter,      setTaxFilter]      = useState(initialFilter || {
    taxYear: new Date().getFullYear(), status: '', propertyId: '',
  });
  const [yearLocks,      setYearLocks]      = useState([]);
  const [yearLockSaving, setYearLockSaving] = useState(false);
  const [taxView,        setTaxView]        = useState('list');

  const [showTaxModal, setShowTaxModal] = useState(false);
  const [editingTax,   setEditingTax]   = useState(null);
  const [taxForm,      setTaxForm]      = useState({
    propertyId: '', taxYear: new Date().getFullYear(),
    taxType: '房屋稅', dueDate: '', amount: '', certNo: '', paidDate: '', note: '',
  });
  const [taxSaving,    setTaxSaving]    = useState(false);

  const [payingTaxId, setPayingTaxId] = useState(null);
  const [taxPayForm,  setTaxPayForm]  = useState({ accountId: '', paymentDate: todayStr() });

  const [taxTableYear,   setTaxTableYear]   = useState(new Date().getFullYear());
  const [taxTableRows,   setTaxTableRows]   = useState([]);
  const [taxTableSaving, setTaxTableSaving] = useState(false);

  async function fetchTaxes() {
    try {
      const params = new URLSearchParams();
      if (taxFilter.taxYear)    params.set('taxYear',    taxFilter.taxYear);
      if (taxFilter.status)     params.set('status',     taxFilter.status);
      if (taxFilter.propertyId) params.set('propertyId', taxFilter.propertyId);
      const res = await fetch(`/api/rentals/taxes?${params}`);
      const data = await res.json();
      setTaxes(Array.isArray(data) ? data : []);
    } catch { setTaxes([]); }
  }

  async function fetchYearLocks() {
    try {
      const res = await fetch('/api/rentals/year-locks');
      if (res.ok) setYearLocks(await res.json());
    } catch { /* ignore */ }
  }

  async function fetchTaxTable() {
    try {
      const res = await fetch(`/api/rentals/taxes/by-year?year=${taxTableYear}`);
      const data = await res.json();
      setTaxTableRows(data.rows || []);
    } catch { setTaxTableRows([]); }
  }

  async function lockYear(year) {
    if (!await confirm(`確定鎖定 ${year} 年租屋資料？鎖定後所有 ${year} 年的收租/稅款/維護費不可修改，適合完成報稅後執行。`, { title: '年度結算鎖定', danger: true })) return;
    setYearLockSaving(true);
    try {
      const res = await fetch('/api/rentals/year-locks', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year }),
      });
      const d = await res.json();
      if (!res.ok) { showToast(d.error || '鎖定失敗', 'error'); return; }
      showToast(`${year} 年已結算鎖定`, 'success');
      fetchYearLocks();
    } catch (e) { showToast('操作失敗: ' + e.message, 'error'); }
    finally { setYearLockSaving(false); }
  }

  async function unlockYear(year) {
    if (!await confirm(`確定解除 ${year} 年的結算鎖定？解鎖後可再次修改該年資料。`, { title: '解除年度鎖定', danger: false })) return;
    setYearLockSaving(true);
    try {
      const res = await fetch(`/api/rentals/year-locks/${year}`, { method: 'DELETE' });
      const d = await res.json();
      if (!res.ok) { showToast(d.error || '解鎖失敗', 'error'); return; }
      showToast(`${year} 年已解除鎖定`, 'success');
      fetchYearLocks();
    } catch (e) { showToast('操作失敗: ' + e.message, 'error'); }
    finally { setYearLockSaving(false); }
  }

  function openTaxEdit(tax) {
    setEditingTax(tax);
    setTaxForm({
      propertyId: String(tax.propertyId),
      taxYear: tax.taxYear,
      taxType: tax.taxType || '房屋稅',
      dueDate: tax.dueDate || '',
      amount: tax.amount != null ? String(tax.amount) : '',
      certNo: tax.certNo || '',
      paidDate: tax.paidDate || '',
      note: tax.note || '',
    });
    setShowTaxModal(true);
  }

  async function saveTax() {
    setTaxSaving(true);
    try {
      if (editingTax) {
        const res = await fetch(`/api/rentals/taxes/${editingTax.id}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            amount:  taxForm.amount === '' ? undefined : Number(taxForm.amount),
            dueDate: taxForm.dueDate || undefined,
            taxType: taxForm.taxType || undefined,
            certNo:  taxForm.certNo,
            paidDate: taxForm.paidDate,
            note:    taxForm.note,
          }),
        });
        const data = await res.json();
        if (!res.ok) return showToast(data.error || data.message || '更新失敗', 'error');
        setShowTaxModal(false);
        setEditingTax(null);
        fetchTaxes();
      } else {
        const res = await fetch('/api/rentals/taxes', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(taxForm),
        });
        const data = await res.json();
        if (!res.ok) return showToast(data.error || '儲存失敗', 'error');
        setShowTaxModal(false);
        fetchTaxes();
      }
    } catch (err) { showToast(editingTax ? '更新失敗: ' + err.message : '儲存失敗: ' + err.message, 'error'); }
    finally { setTaxSaving(false); }
  }

  async function confirmTaxPayment() {
    try {
      const res = await fetch(`/api/rentals/taxes/${payingTaxId}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(taxPayForm),
      });
      const data = await res.json();
      if (!res.ok) return showToast(data.error || '確認失敗', 'error');
      showToast('稅款已確認繳納', 'success');
      setPayingTaxId(null);
      fetchTaxes();
    } catch (err) { showToast('確認失敗: ' + err.message, 'error'); }
  }

  async function deleteTax(tax) {
    if (tax.status === 'paid') { showToast('已付款的稅款不可刪除', 'error'); return; }
    confirm(`確定要刪除此筆稅款（${tax.property?.name} ${tax.taxYear} ${tax.taxType}）？`, async () => {
      try {
        const res = await fetch(`/api/rentals/taxes/${tax.id}`, { method: 'DELETE' });
        const data = await res.json();
        if (!res.ok) return showToast(data.message || data.error || '刪除失敗', 'error');
        fetchTaxes();
      } catch (err) { showToast('刪除失敗: ' + err.message, 'error'); }
    }, '刪除稅款');
  }

  function printTaxes() {
    openPrintWindow(
      `稅款管理　${taxFilter.taxYear} 年`,
      ['物業', '稅款類型', '稅款年度', '金額', '狀態', '繳納日期', '備註'],
      taxes.map(t => [
        t.property?.name || '—', t.taxType, t.taxYear,
        `NT$ ${Number(t.amount || 0).toLocaleString('zh-TW')}`,
        t.status === 'paid' ? '已繳' : '待繳',
        t.paidDate || '—', t.note || '—',
      ])
    );
  }

  async function saveTaxTable() {
    setTaxTableSaving(true);
    try {
      const res = await fetch('/api/rentals/taxes/by-year', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          year: taxTableYear,
          rows: taxTableRows.map(r => ({ propertyId: r.propertyId, landTax: r.landTax, houseTax: r.houseTax })),
        }),
      });
      const data = await res.json();
      if (!res.ok) return showToast(data.error || '儲存失敗', 'error');
      showToast('已儲存年度稅額', 'success');
      fetchTaxTable();
      fetchTaxes();
    } catch (e) { showToast('儲存失敗: ' + e.message, 'error'); }
    finally { setTaxTableSaving(false); }
  }

  return {
    taxes, setTaxes,
    taxFilter, setTaxFilter,
    yearLocks,
    yearLockSaving,
    taxView, setTaxView,
    showTaxModal, setShowTaxModal,
    editingTax, setEditingTax,
    taxForm, setTaxForm,
    taxSaving,
    payingTaxId, setPayingTaxId,
    taxPayForm, setTaxPayForm,
    taxTableYear, setTaxTableYear,
    taxTableRows, setTaxTableRows,
    taxTableSaving,
    fetchTaxes,
    fetchYearLocks,
    fetchTaxTable,
    lockYear,
    unlockYear,
    openTaxEdit,
    saveTax,
    confirmTaxPayment,
    deleteTax,
    printTaxes,
    saveTaxTable,
  };
}
