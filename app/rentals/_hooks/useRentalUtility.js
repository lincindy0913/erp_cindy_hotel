'use client';

import { useState } from 'react';
import { useToast } from '@/context/ToastContext';
import { useConfirm } from '@/context/ConfirmContext';

export function useRentalUtility() {
  const { showToast } = useToast();
  const confirm = useConfirm();

  const [utilityFilter,  setUtilityFilter]  = useState({ year: new Date().getFullYear(), month: new Date().getMonth() + 1 });
  const [utilityList,    setUtilityList]    = useState([]);
  const [showUtilityModal, setShowUtilityModal] = useState(false);
  const [utilityForm,    setUtilityForm]    = useState({
    propertyId: '', incomeYear: new Date().getFullYear(), incomeMonth: new Date().getMonth() + 1,
    expectedAmount: '', actualAmount: '', actualDate: '', accountId: '', note: '',
  });
  const [editingUtility, setEditingUtility] = useState(null);
  const [utilitySaving,  setUtilitySaving]  = useState(false);

  const [showBulkUtility,     setShowBulkUtility]     = useState(false);
  const [bulkUtilityYear,     setBulkUtilityYear]     = useState(new Date().getFullYear());
  const [bulkUtilityMonth,    setBulkUtilityMonth]    = useState(new Date().getMonth() + 1);
  const [bulkUtilityEntries,  setBulkUtilityEntries]  = useState([]);
  const [bulkUtilitySaving,   setBulkUtilitySaving]   = useState(false);

  async function fetchUtilityList() {
    try {
      const params = new URLSearchParams();
      if (utilityFilter.year)  params.set('year',  utilityFilter.year);
      if (utilityFilter.month) params.set('month', utilityFilter.month);
      const res = await fetch(`/api/rentals/utility-income?${params}`);
      const data = await res.json();
      setUtilityList(Array.isArray(data) ? data : []);
    } catch { setUtilityList([]); }
  }

  async function saveUtility() {
    try {
      const payload = {
        ...utilityForm,
        incomeYear:  utilityForm.incomeYear  || new Date().getFullYear(),
        incomeMonth: utilityForm.incomeMonth || new Date().getMonth() + 1,
      };
      const res = await fetch('/api/rentals/utility-income', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) return showToast(data.error || '儲存失敗', 'error');
      setShowUtilityModal(false);
      fetchUtilityList();
    } catch (e) { showToast('儲存失敗: ' + e.message, 'error'); }
    finally { setUtilitySaving(false); }
  }

  function deleteUtility(id) {
    confirm('確定刪除此筆水電收入？相關現金流紀錄也會一併刪除。', async () => {
      try {
        const res = await fetch(`/api/rentals/utility-income/${id}`, { method: 'DELETE' });
        const data = await res.json();
        if (!res.ok) return showToast(data.error || '刪除失敗', 'error');
        fetchUtilityList();
      } catch (e) { showToast('刪除失敗: ' + e.message, 'error'); }
    }, '刪除水電收入');
  }

  async function openBulkUtility(propertiesRef) {
    let propList = propertiesRef || [];
    if (propList.length === 0) {
      try {
        const res = await fetch('/api/rentals/properties');
        const data = await res.json();
        propList = Array.isArray(data) ? data : [];
      } catch { propList = []; }
    }
    const utilProps = propList.filter(p => p.collectUtilityFee);
    const entries = utilProps.map(p => ({ propertyId: p.id, propertyName: p.name, expectedAmount: '' }));
    setBulkUtilityEntries(entries);
    setShowBulkUtility(true);
    try {
      const res = await fetch(`/api/rentals/utility-income?year=${bulkUtilityYear}&month=${bulkUtilityMonth}`);
      const data = await res.json();
      if (Array.isArray(data)) {
        setBulkUtilityEntries(prev => prev.map(e => {
          const existing = data.find(u => u.propertyId === e.propertyId);
          return existing ? { ...e, expectedAmount: String(existing.expectedAmount || '') } : e;
        }));
      }
    } catch { /* ignore */ }
  }

  async function saveBulkUtility() {
    setBulkUtilitySaving(true);
    try {
      const entries = bulkUtilityEntries
        .filter(e => e.expectedAmount !== '' && !isNaN(parseFloat(e.expectedAmount)))
        .map(e => ({ propertyId: e.propertyId, incomeYear: bulkUtilityYear, incomeMonth: bulkUtilityMonth, expectedAmount: e.expectedAmount }));
      if (entries.length === 0) { showToast('無資料可儲存', 'error'); return; }
      const res = await fetch('/api/rentals/utility-income/batch', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entries }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) return showToast(d.error || '儲存失敗', 'error');
      showToast(`已儲存 ${d.saved} 筆電費應收`, 'success');
      setShowBulkUtility(false);
      fetchUtilityList();
    } catch (e) { showToast('儲存失敗: ' + e.message, 'error'); }
    finally { setBulkUtilitySaving(false); }
  }

  return {
    utilityFilter, setUtilityFilter,
    utilityList, setUtilityList,
    showUtilityModal, setShowUtilityModal,
    utilityForm, setUtilityForm,
    editingUtility, setEditingUtility,
    utilitySaving, setUtilitySaving,
    showBulkUtility, setShowBulkUtility,
    bulkUtilityYear, setBulkUtilityYear,
    bulkUtilityMonth, setBulkUtilityMonth,
    bulkUtilityEntries, setBulkUtilityEntries,
    bulkUtilitySaving,
    fetchUtilityList,
    saveUtility,
    deleteUtility,
    openBulkUtility,
    saveBulkUtility,
  };
}
