'use client';

import { useState, useMemo } from 'react';
import { useToast } from '@/context/ToastContext';
import { useConfirm } from '@/context/ConfirmContext';
import { todayStr } from '@/lib/localDate';

export function useRentalMaintenance({ initialFilter } = {}) {
  const { showToast } = useToast();
  const confirm = useConfirm();

  const [maintenances,        setMaintenances]        = useState([]);
  const [maintenancesHasMore, setMaintenancesHasMore] = useState(false);
  const [maintenanceFilter,   setMaintenanceFilter]   = useState(initialFilter || {
    year: new Date().getFullYear(), category: '', status: '', propertyId: '',
  });
  const [showMaintenanceModal, setShowMaintenanceModal] = useState(false);
  const [maintenanceForm,      setMaintenanceForm]      = useState({
    propertyId: '', maintenanceDate: todayStr(), category: '水電', amount: '',
    accountingSubjectId: '', accountId: '', isEmployeeAdvance: false, advancedBy: '',
    advancePaymentMethod: '現金', isCapitalized: false, isRecurring: false, note: '',
  });
  const [editingMaintenance, setEditingMaintenance] = useState(null);
  const [maintenanceSaving,  setMaintenanceSaving]  = useState(false);

  const maintenanceAnalysis = useMemo(() => {
    const byCategory = {};
    const byProperty = {};
    let total = 0, paid = 0, pending = 0;
    maintenances.forEach(m => {
      const amt = Number(m.amount || 0);
      total += amt;
      if (m.status === 'paid') paid += amt; else pending += amt;
      byCategory[m.category] = (byCategory[m.category] || 0) + amt;
      const pname = m.property?.name || `物業#${m.propertyId}`;
      byProperty[pname] = (byProperty[pname] || 0) + amt;
    });
    const catEntries  = Object.entries(byCategory).sort((a, b) => b[1] - a[1]);
    const propEntries = Object.entries(byProperty).sort((a, b) => b[1] - a[1]);
    return { total, paid, pending, catEntries, propEntries };
  }, [maintenances]);

  async function fetchMaintenances() {
    try {
      const params = new URLSearchParams();
      if (maintenanceFilter.year)       params.set('year',       maintenanceFilter.year);
      if (maintenanceFilter.category)   params.set('category',   maintenanceFilter.category);
      if (maintenanceFilter.status)     params.set('status',     maintenanceFilter.status);
      if (maintenanceFilter.propertyId) params.set('propertyId', maintenanceFilter.propertyId);
      const res = await fetch(`/api/rentals/maintenance?${params}`);
      const data = await res.json();
      setMaintenances(Array.isArray(data) ? data : []);
      setMaintenancesHasMore(res.headers.get('X-Has-More') === 'true');
    } catch { setMaintenances([]); }
  }

  async function saveMaintenance() {
    if (!maintenanceForm.accountingSubjectId) {
      showToast('請選擇會計科目', 'error');
      return;
    }
    setMaintenanceSaving(true);
    if (editingMaintenance) {
      try {
        const res = await fetch(`/api/rentals/maintenance/${editingMaintenance.id}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            propertyId:         maintenanceForm.propertyId,
            maintenanceDate:    maintenanceForm.maintenanceDate,
            category:           maintenanceForm.category,
            amount:             maintenanceForm.amount,
            accountingSubjectId:maintenanceForm.accountingSubjectId,
            isCapitalized:      maintenanceForm.isCapitalized,
            isRecurring:        maintenanceForm.isRecurring,
            note:               maintenanceForm.note,
          }),
        });
        const data = await res.json();
        if (!res.ok) return showToast(data?.error?.message || data?.error || '更新失敗', 'error');
        setShowMaintenanceModal(false);
        setEditingMaintenance(null);
        fetchMaintenances();
      } catch (err) { showToast('更新失敗: ' + err.message, 'error'); }
      finally { setMaintenanceSaving(false); }
      return;
    }
    if (!maintenanceForm.accountId) {
      showToast('請選擇支出戶頭（存檔後將同步至出納待出納）', 'error');
      setMaintenanceSaving(false);
      return;
    }
    try {
      const res = await fetch('/api/rentals/maintenance', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(maintenanceForm),
      });
      const data = await res.json();
      if (!res.ok) return showToast(data?.error?.message || data?.error || '儲存失敗', 'error');
      setShowMaintenanceModal(false);
      fetchMaintenances();
    } catch (err) { showToast('儲存失敗: ' + err.message, 'error'); }
    finally { setMaintenanceSaving(false); }
  }

  async function deleteMaintenance(m) {
    if (m.status === 'paid' || m.cashTransactionId) {
      showToast('已付款的維護費不可刪除', 'error');
      return;
    }
    confirm('確定要刪除此筆維護紀錄嗎？', async () => {
      try {
        const res = await fetch(`/api/rentals/maintenance/${m.id}`, { method: 'DELETE' });
        if (!res.ok) {
          const data = await res.json();
          return showToast(data?.error?.message || data?.error || '刪除失敗', 'error');
        }
        fetchMaintenances();
      } catch (err) { showToast('刪除失敗: ' + err.message, 'error'); }
    }, '刪除維護紀錄');
  }

  return {
    maintenances, setMaintenances,
    maintenancesHasMore,
    maintenanceFilter, setMaintenanceFilter,
    showMaintenanceModal, setShowMaintenanceModal,
    maintenanceForm, setMaintenanceForm,
    editingMaintenance, setEditingMaintenance,
    maintenanceSaving,
    maintenanceAnalysis,
    fetchMaintenances,
    saveMaintenance,
    deleteMaintenance,
  };
}
