'use client';

import { useState, useMemo } from 'react';
import { useToast } from '@/context/ToastContext';
import { getApiError } from '@/lib/get-api-error';

export function useAssetModal({ properties, loadProperties, setSelected, linkProperty, showConfirm }) {
  const { showToast } = useToast();

  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: '', assetType: 'BUILDING', address: '', areaSqm: '',
    acquisitionDate: '', notes: '', rentalPropertyId: '',
    serialNo: '', category: '', ownerName: '', registeredOwner: '', houseTaxRegistrationNo: '',
    isAvailableForRental: false, hasHouseTax: false, hasLandTax: false, hasMaintenanceFee: false,
  });

  // Unlinked properties for the modal dropdown
  const propertyOptions = useMemo(() => {
    return properties
      .filter(p => {
        if (!p.asset) return true;
        if (editing && p.asset.id === editing.id) return true;
        return false;
      })
      .sort((a, b) => {
        const sa = a.sortOrder ?? Infinity;
        const sb = b.sortOrder ?? Infinity;
        if (sa !== sb) return sa - sb;
        return (a.name || '').localeCompare(b.name || '', 'zh-TW');
      });
  }, [properties, editing]);

  function openCreateFromProperty(p) {
    setEditing(null);
    setForm(f => ({
      ...f,
      name: p.name || '',
      assetType: 'BUILDING',
      address: p.address || '',
      areaSqm: '',
      acquisitionDate: '',
      notes: '',
      serialNo: '',
      category: p.category || '',
      rentalPropertyId: String(p.id),
      isAvailableForRental: true,
      hasHouseTax: false,
      hasLandTax: false,
      hasMaintenanceFee: false,
    }));
    setShowModal(true);
  }

  function openCreate() {
    setEditing(null);
    setForm({
      name: '', assetType: 'BUILDING', address: '', areaSqm: '',
      acquisitionDate: '', notes: '', rentalPropertyId: linkProperty || '',
      serialNo: '', category: '',
      isAvailableForRental: false, hasHouseTax: false, hasLandTax: false, hasMaintenanceFee: false,
    });
    setShowModal(true);
  }

  function openEdit(a) {
    setEditing(a);
    setForm({
      name: a.name || '',
      assetType: a.assetType || 'BUILDING',
      address: a.address || '',
      areaSqm: a.areaSqm != null ? String(a.areaSqm) : '',
      acquisitionDate: a.acquisitionDate || '',
      notes: a.notes || '',
      rentalPropertyId: a.rentalPropertyId != null ? String(a.rentalPropertyId) : '',
      serialNo: a.serialNo || '',
      category: a.category || '',
      ownerName: a.ownerName || '',
      registeredOwner: a.registeredOwner || '',
      houseTaxRegistrationNo: a.houseTaxRegistrationNo || '',
      isAvailableForRental: a.isAvailableForRental || false,
      hasHouseTax: a.hasHouseTax || false,
      hasLandTax: a.hasLandTax || false,
      hasMaintenanceFee: a.hasMaintenanceFee || false,
    });
    setShowModal(true);
  }

  async function saveModal() {
    if (!form.name.trim()) { showToast('請填寫資產名稱', 'error'); return; }
    setSaving(true);
    try {
      const body = {
        name: form.name.trim(),
        assetType: form.assetType,
        address: form.address.trim() || null,
        areaSqm: form.areaSqm === '' ? null : (isNaN(parseFloat(form.areaSqm)) ? null : parseFloat(form.areaSqm)),
        acquisitionDate: form.acquisitionDate || null,
        notes: form.notes.trim() || null,
        serialNo: form.serialNo.trim() || null,
        category: form.category.trim() || null,
        ownerName: form.ownerName.trim() || null,
        registeredOwner: form.registeredOwner.trim() || null,
        houseTaxRegistrationNo: form.houseTaxRegistrationNo.trim() || null,
        rentalPropertyId: form.rentalPropertyId === '' ? null : form.rentalPropertyId,
        isAvailableForRental: form.isAvailableForRental,
        hasHouseTax: form.hasHouseTax,
        hasLandTax: form.hasLandTax,
        hasMaintenanceFee: form.hasMaintenanceFee,
      };
      const url = editing ? `/api/assets/${editing.id}` : '/api/assets';
      const method = editing ? 'PATCH' : 'POST';
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) { showToast(getApiError(data) || '儲存失敗', 'error'); return; }
      showToast(editing ? '已更新' : '已建立', 'success');
      setShowModal(false);
      const freshProps = await loadProperties();
      const linkedProp = freshProps.find(p => p.asset?.id === data.id);
      if (linkedProp) setSelected(linkedProp);
    } catch {
      showToast('儲存失敗', 'error');
    } finally {
      setSaving(false);
    }
  }

  function deleteAsset(a) {
    showConfirm(`確定刪除資產「${a.name}」？`, async () => {
      const res = await fetch(`/api/assets/${a.id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { showToast(getApiError(data) || '刪除失敗', 'error'); return; }
      showToast('已刪除', 'success');
      setSelected(prev => prev?.asset?.id === a.id ? { ...prev, asset: null } : prev);
      await loadProperties();
    });
  }

  return {
    showModal, setShowModal,
    editing, setEditing,
    saving,
    form, setForm,
    propertyOptions,
    openCreate,
    openEdit,
    openCreateFromProperty,
    saveModal,
    deleteAsset,
  };
}
