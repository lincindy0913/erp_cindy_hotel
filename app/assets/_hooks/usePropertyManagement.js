'use client';

import { useState } from 'react';
import { useToast } from '@/context/ToastContext';
import { getApiError } from '@/lib/get-api-error';

export function usePropertyManagement({ properties, setProperties, loadProperties, selected, setSelected, showConfirm }) {
  const { showToast } = useToast();

  // Property inline edit (資產編號/分類/狀態)
  const [propInlineEdit, setPropInlineEdit] = useState(null);
  const [propInlineSaving, setPropInlineSaving] = useState(false);

  // Property edit modal
  const [showPropModal, setShowPropModal] = useState(false);
  const [editingProp, setEditingProp] = useState(null);
  const [propSaving, setPropSaving] = useState(false);
  const [propForm, setPropForm] = useState({
    name: '', buildingName: '', unitNo: '', address: '', ownerName: '',
    houseTaxRegistrationNo: '', status: 'available', category: '',
    sortOrder: '', rentCollectAccountId: '', depositAccountId: '', note: '',
    collectUtilityFee: false, publicInterestLandlord: false,
    publicInterestApplicant: '', publicInterestNote: '',
    publicInterestStartDate: '', publicInterestEndDate: '', publicInterestRent: '',
  });

  async function savePropField(propertyId, field, value) {
    if (propInlineSaving) return;
    const current = properties.find(p => p.id === propertyId);
    const currentVal = current?.[field] ?? '';
    if (String(value ?? '') === String(currentVal ?? '')) {
      setPropInlineEdit(null);
      return;
    }
    setPropInlineSaving(true);
    try {
      const body = {};
      if (field === 'sortOrder') body.sortOrder = value !== '' && value !== null ? parseInt(value) : null;
      else if (field === 'status') body.status = value;
      else body.category = value || null;
      const res = await fetch(`/api/rentals/properties/${propertyId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        showToast(errData?.error || '儲存失敗', 'error');
        return;
      }
      const parsed = field === 'sortOrder'
        ? (value !== '' && value !== null ? parseInt(value) : null)
        : value || null;
      setProperties(prev => prev.map(p => p.id === propertyId ? { ...p, [field]: parsed } : p));
      if (selected?.id === propertyId) setSelected(s => s ? { ...s, [field]: parsed } : s);
    } catch { showToast('儲存失敗', 'error'); }
    finally {
      setPropInlineSaving(false);
      setPropInlineEdit(prev =>
        prev?.id === propertyId && prev?.field === field ? null : prev
      );
    }
  }

  function openNewProperty() {
    setEditingProp(null);
    setPropForm({
      name: '', buildingName: '', unitNo: '', address: '', ownerName: '',
      houseTaxRegistrationNo: '', status: 'available', category: '',
      sortOrder: '', rentCollectAccountId: '', depositAccountId: '', note: '',
      collectUtilityFee: false, publicInterestLandlord: false,
      publicInterestApplicant: '', publicInterestNote: '',
      publicInterestStartDate: '', publicInterestEndDate: '', publicInterestRent: '',
    });
    setShowPropModal(true);
  }

  function openPropertyEdit(p) {
    setEditingProp(p);
    setPropForm({
      name: p.name || '',
      buildingName: p.buildingName || '',
      unitNo: p.unitNo || '',
      address: p.address || '',
      ownerName: p.ownerName || '',
      houseTaxRegistrationNo: p.houseTaxRegistrationNo || '',
      status: p.status || 'available',
      category: p.category || '',
      sortOrder: p.sortOrder != null ? String(p.sortOrder) : '',
      rentCollectAccountId: p.rentCollectAccountId != null ? String(p.rentCollectAccountId) : '',
      depositAccountId: p.depositAccountId != null ? String(p.depositAccountId) : '',
      note: p.note || '',
      collectUtilityFee: p.collectUtilityFee || false,
      publicInterestLandlord: p.publicInterestLandlord || false,
      publicInterestApplicant: p.publicInterestApplicant || '',
      publicInterestNote: p.publicInterestNote || '',
      publicInterestStartDate: p.publicInterestStartDate || '',
      publicInterestEndDate: p.publicInterestEndDate || '',
      publicInterestRent: p.publicInterestRent != null ? String(p.publicInterestRent) : '',
    });
    setShowPropModal(true);
  }

  async function savePropertyEdit() {
    if (!propForm.name.trim() && !editingProp?.asset) { showToast('請填寫物業名稱', 'error'); return; }
    setPropSaving(true);
    try {
      const body = {
        name: propForm.name.trim(),
        buildingName: propForm.buildingName,
        unitNo: propForm.unitNo,
        address: propForm.address,
        ownerName: propForm.ownerName || null,
        houseTaxRegistrationNo: propForm.houseTaxRegistrationNo || null,
        status: propForm.status,
        category: propForm.category || null,
        sortOrder: propForm.sortOrder !== '' ? parseInt(propForm.sortOrder) : null,
        rentCollectAccountId: propForm.rentCollectAccountId ? parseInt(propForm.rentCollectAccountId) : null,
        depositAccountId: propForm.depositAccountId ? parseInt(propForm.depositAccountId) : null,
        note: propForm.note || null,
        collectUtilityFee: propForm.collectUtilityFee,
        publicInterestLandlord: propForm.publicInterestLandlord,
        publicInterestApplicant:  propForm.publicInterestApplicant  || null,
        publicInterestNote:       propForm.publicInterestNote       || null,
        publicInterestStartDate:  propForm.publicInterestStartDate  || null,
        publicInterestEndDate:    propForm.publicInterestEndDate    || null,
        publicInterestRent:       propForm.publicInterestRent ? parseFloat(propForm.publicInterestRent) : null,
      };
      if (editingProp?.asset) {
        delete body.name;
        delete body.address;
      }
      const url = editingProp ? `/api/rentals/properties/${editingProp.id}` : '/api/rentals/properties';
      const method = editingProp ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) { showToast(getApiError(data) || '儲存失敗', 'error'); return; }
      showToast('已儲存', 'success');
      setShowPropModal(false);
      await loadProperties();
    } catch { showToast('儲存失敗', 'error'); }
    finally { setPropSaving(false); }
  }

  function deleteProperty(p, canEdit) {
    if (!canEdit) return;
    showConfirm(`確定刪除物業「${p.name}」？此操作無法復原。`, async () => {
      const res = await fetch(`/api/rentals/properties/${p.id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data?.code === 'ACCOUNT_HAS_DEPENDENCIES' && data?.counts) {
          const { contractCount, incomeCount, taxCount, maintenanceCount } = data.counts;
          const lines = [];
          if (contractCount > 0) lines.push(`合約 ${contractCount} 筆`);
          if (incomeCount > 0) lines.push(`收款紀錄 ${incomeCount} 筆`);
          if (taxCount > 0) lines.push(`稅務紀錄 ${taxCount} 筆`);
          if (maintenanceCount > 0) lines.push(`維修紀錄 ${maintenanceCount} 筆`);
          const lockedWarning = incomeCount > 0 ? '\n\n⚠ 若有已鎖帳的收款紀錄，系統將自動拒絕刪除。' : '';
          showConfirm(
            `「${p.name}」尚有關聯資料：${lines.join('、')}。\n確定要連同所有資料一起刪除？此操作無法復原。${lockedWarning}`,
            async () => {
              const res2 = await fetch(`/api/rentals/properties/${p.id}?force=true`, { method: 'DELETE' });
              const data2 = await res2.json().catch(() => ({}));
              if (!res2.ok) { showToast(data2?.error || '刪除失敗', 'error'); return; }
              showToast('已刪除', 'success');
              if (selected?.id === p.id) setSelected(null);
              await loadProperties();
            },
            '強制刪除'
          );
          return;
        }
        showToast(data?.error || '刪除失敗', 'error');
        return;
      }
      showToast('已刪除', 'success');
      if (selected?.id === p.id) setSelected(null);
      await loadProperties();
    });
  }

  return {
    propInlineEdit, setPropInlineEdit,
    propInlineSaving,
    showPropModal, setShowPropModal,
    editingProp,
    propSaving,
    propForm, setPropForm,
    savePropField,
    openNewProperty,
    openPropertyEdit,
    savePropertyEdit,
    deleteProperty,
  };
}
