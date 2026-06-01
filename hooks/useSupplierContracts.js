'use client';
import { useState } from 'react';

export function useSupplierContracts({ showToast, confirm, editingSupplier }) {
  const [contracts, setContracts] = useState([]);
  const [uploadingContract, setUploadingContract] = useState(false);

  async function fetchContracts(supplierId) {
    try {
      const response = await fetch(`/api/suppliers/${supplierId}/contracts`);
      if (response.ok) setContracts(await response.json());
    } catch (error) {
      console.error('取得合約清單失敗:', error);
    }
  }

  async function handleUploadContract(e) {
    const file = e.target.files[0];
    if (!file || !editingSupplier) return;
    setUploadingContract(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const response = await fetch(`/api/suppliers/${editingSupplier.id}/contracts`, { method: 'POST', body: fd });
      if (response.ok) {
        showToast('合約上傳成功！', 'success');
        await fetchContracts(editingSupplier.id);
      } else {
        const error = await response.json();
        showToast('上傳失敗：' + (error.error || '未知錯誤'), 'error');
      }
    } catch (error) {
      console.error('上傳合約失敗:', error);
      showToast('上傳合約失敗，請稍後再試', 'error');
    } finally {
      setUploadingContract(false);
      e.target.value = '';
    }
  }

  async function handleDeleteContract(contractId) {
    if (!(await confirm('確定要刪除這份合約嗎？', { title: '刪除確認', danger: true }))) return;
    try {
      const response = await fetch(`/api/suppliers/${editingSupplier.id}/contracts/${contractId}`, { method: 'DELETE' });
      if (response.ok) {
        showToast('合約已刪除', 'success');
        await fetchContracts(editingSupplier.id);
      } else {
        const error = await response.json();
        const msg = error?.error?.message || (typeof error?.error === 'string' ? error.error : '未知錯誤');
        showToast('刪除失敗：' + msg, 'error');
      }
    } catch (error) {
      console.error('刪除合約失敗:', error);
      showToast('刪除合約失敗，請稍後再試', 'error');
    }
  }

  return { contracts, setContracts, uploadingContract, fetchContracts, handleUploadContract, handleDeleteContract };
}
