'use client';

import { useState } from 'react';
import { useConfirm } from '@/context/ConfirmContext';

export function useSettingsExpenseCategories({ showToast, setSaving, fetchExpenseCategories }) {
  const confirm = useConfirm();
  const [categoryForm, setCategoryForm] = useState({ name: '', description: '', sortOrder: '' });
  const [editingCategoryId, setEditingCategoryId] = useState(null);

  async function saveExpenseCategory() {
    if (!categoryForm.name.trim()) {
      showToast('請輸入分類名稱', 'error');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: categoryForm.name.trim(),
        description: categoryForm.description.trim(),
        sortOrder: parseInt(categoryForm.sortOrder, 10) || 0,
      };

      let res;
      if (editingCategoryId) {
        res = await fetch(`/api/settings/expense-categories?id=${editingCategoryId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } else {
        res = await fetch('/api/settings/expense-categories', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      }

      if (res.ok) {
        setCategoryForm({ name: '', description: '', sortOrder: '' });
        setEditingCategoryId(null);
        await fetchExpenseCategories();
        showToast(editingCategoryId ? '分類已更新' : '分類已新增');
      } else {
        const data = await res.json().catch(() => ({}));
        showToast((typeof data?.error === 'string' ? data.error : data?.error?.message) || '儲存分類失敗', 'error');
      }
    } catch (err) {
      showToast('儲存分類失敗', 'error');
    }
    setSaving(false);
  }

  function editExpenseCategory(cat) {
    setEditingCategoryId(cat.id);
    setCategoryForm({
      name: cat.name || '',
      description: cat.description || '',
      sortOrder: cat.sortOrder != null ? String(cat.sortOrder) : '',
    });
  }

  function cancelEditCategory() {
    setEditingCategoryId(null);
    setCategoryForm({ name: '', description: '', sortOrder: '' });
  }

  async function deleteExpenseCategory(id) {
    if (!(await confirm('確定要刪除此費用分類？', { title: '刪除確認', danger: true }))) return;
    try {
      const res = await fetch(`/api/settings/expense-categories?id=${id}`, { method: 'DELETE' });
      if (res.ok) {
        await fetchExpenseCategories();
        showToast('分類已刪除');
      } else {
        const data = await res.json().catch(() => ({}));
        showToast((typeof data?.error === 'string' ? data.error : data?.error?.message) || '刪除失敗', 'error');
      }
    } catch (err) {
      showToast('刪除失敗', 'error');
    }
  }

  return {
    categoryForm, setCategoryForm,
    editingCategoryId,
    saveExpenseCategory,
    editExpenseCategory,
    cancelEditCategory,
    deleteExpenseCategory,
  };
}
