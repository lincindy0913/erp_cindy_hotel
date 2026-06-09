'use client';

import { useState } from 'react';
import { useToast } from '@/context/ToastContext';
import { getApiError } from '@/lib/get-api-error';

export function useAssetDisposals({ selected, setDisposals, disposals, showConfirm }) {
  const { showToast } = useToast();

  const [showDisposalModal, setShowDisposalModal] = useState(false);
  const [editingDisposal, setEditingDisposal] = useState(null);
  const [disposalSaving, setDisposalSaving] = useState(false);
  const [disposalForm, setDisposalForm] = useState({
    disposalDate: '', salePrice: '', stampTax: '', landValueIncrementTax: '', notes: '',
  });

  function openDisposalCreate() {
    setEditingDisposal(null);
    setDisposalForm({ disposalDate: '', salePrice: '', stampTax: '', landValueIncrementTax: '', notes: '' });
    setShowDisposalModal(true);
  }

  function openDisposalEdit(d) {
    setEditingDisposal(d);
    setDisposalForm({
      disposalDate: d.disposalDate || '',
      salePrice: d.salePrice != null ? String(d.salePrice) : '',
      stampTax: d.stampTax != null ? String(d.stampTax) : '',
      landValueIncrementTax: d.landValueIncrementTax != null ? String(d.landValueIncrementTax) : '',
      notes: d.notes || '',
    });
    setShowDisposalModal(true);
  }

  async function saveDisposal() {
    if (!disposalForm.disposalDate) { showToast('請填寫處分日期', 'error'); return; }
    const assetId = selected?.asset?.id;
    if (!assetId) return;
    setDisposalSaving(true);
    try {
      const body = {
        disposalDate: disposalForm.disposalDate,
        salePrice: disposalForm.salePrice !== '' ? disposalForm.salePrice : null,
        stampTax: disposalForm.stampTax !== '' ? disposalForm.stampTax : null,
        landValueIncrementTax: disposalForm.landValueIncrementTax !== '' ? disposalForm.landValueIncrementTax : null,
        notes: disposalForm.notes || null,
      };
      const url = editingDisposal
        ? `/api/assets/${assetId}/disposals/${editingDisposal.id}`
        : `/api/assets/${assetId}/disposals`;
      const method = editingDisposal ? 'PATCH' : 'POST';
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) { showToast(getApiError(data) || '儲存失敗', 'error'); return; }
      showToast(editingDisposal ? '已更新' : '已建立', 'success');
      setShowDisposalModal(false);
      const refreshed = await fetch(`/api/assets/${assetId}/disposals`).then(r => r.ok ? r.json() : []);
      setDisposals(Array.isArray(refreshed) ? refreshed : []);
    } catch { showToast('儲存失敗', 'error'); }
    finally { setDisposalSaving(false); }
  }

  async function deleteDisposal(d) {
    const assetId = selected?.asset?.id;
    if (!assetId) return;
    showConfirm(`確定刪除「${d.disposalDate}」的處分記錄？`, async () => {
      const res = await fetch(`/api/assets/${assetId}/disposals/${d.id}`, { method: 'DELETE' });
      if (!res.ok) { showToast('刪除失敗', 'error'); return; }
      showToast('已刪除', 'success');
      setDisposals(prev => prev.filter(x => x.id !== d.id));
    });
  }

  return {
    showDisposalModal, setShowDisposalModal,
    editingDisposal,
    disposalSaving,
    disposalForm, setDisposalForm,
    openDisposalCreate,
    openDisposalEdit,
    saveDisposal,
    deleteDisposal,
  };
}
