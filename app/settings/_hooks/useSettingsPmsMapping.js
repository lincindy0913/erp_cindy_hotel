'use client';

import { useState, useEffect, useCallback } from 'react';
import { useConfirm } from '@/context/ConfirmContext';

// Default PMS mapping rules (fallback when API has no data)
const DEFAULT_PMS_COLUMNS = [
  { pmsColumnName: '住房收入', entryType: '貸方', accountingCode: '4111', accountingName: '住房收入', isSystemDefault: true },
  { pmsColumnName: '餐飲收入', entryType: '貸方', accountingCode: '4112', accountingName: '餐飲收入', isSystemDefault: true },
  { pmsColumnName: '其他營業收入', entryType: '貸方', accountingCode: '4113', accountingName: '其他營業收入', isSystemDefault: true },
  { pmsColumnName: '服務費收入', entryType: '貸方', accountingCode: '4114', accountingName: '服務費收入', isSystemDefault: true },
  { pmsColumnName: '代收款-稅金', entryType: '貸方', accountingCode: '2171', accountingName: '代收款-稅金', isSystemDefault: true },
  { pmsColumnName: '預收款', entryType: '借方', accountingCode: '2131', accountingName: '預收款', isSystemDefault: true },
  { pmsColumnName: '應收帳款', entryType: '借方', accountingCode: '1131', accountingName: '應收帳款', isSystemDefault: true },
  { pmsColumnName: '現金收入', entryType: '借方', accountingCode: '1111', accountingName: '現金收入', isSystemDefault: true },
  { pmsColumnName: '信用卡收入', entryType: '借方', accountingCode: '1141', accountingName: '信用卡收入', isSystemDefault: true },
  { pmsColumnName: '轉帳收入', entryType: '借方', accountingCode: '1112', accountingName: '銀行轉帳收入', isSystemDefault: true },
];

export function useSettingsPmsMapping({ activeSection, showToast, setSaving }) {
  const confirm = useConfirm();
  const [mappingRules, setMappingRules] = useState([]);
  const [mappingSubTab, setMappingSubTab] = useState('credit');
  const [editingMappingId, setEditingMappingId] = useState(null);
  const [mappingEditForm, setMappingEditForm] = useState({ accountingCode: '', accountingName: '', description: '' });
  const [showAddMappingForm, setShowAddMappingForm] = useState(false);
  const [newMappingForm, setNewMappingForm] = useState({
    pmsColumnName: '',
    entryType: '貸方',
    accountingCode: '',
    accountingName: '',
    description: '',
  });
  const [accountingSubjects, setAccountingSubjects] = useState([]);

  const fetchMappingRules = useCallback(async () => {
    try {
      const res = await fetch('/api/pms-income/mapping-rules');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          setMappingRules(data);
        } else {
          setMappingRules(DEFAULT_PMS_COLUMNS.map((col, i) => ({ id: -(i + 1), ...col, sortOrder: i })));
        }
      } else {
        setMappingRules(DEFAULT_PMS_COLUMNS.map((col, i) => ({ id: -(i + 1), ...col, sortOrder: i })));
      }
    } catch {
      setMappingRules(DEFAULT_PMS_COLUMNS.map((col, i) => ({ id: -(i + 1), ...col, sortOrder: i })));
    }
  }, []);

  const fetchAccountingSubjects = useCallback(async () => {
    try {
      const res = await fetch('/api/accounting-subjects');
      if (res.ok) {
        const data = await res.json();
        setAccountingSubjects(Array.isArray(data) ? data : []);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (activeSection === 'pms-mapping') {
      fetchMappingRules();
      fetchAccountingSubjects();
    }
  }, [activeSection, fetchMappingRules, fetchAccountingSubjects]);

  function startEditMapping(rule) {
    setEditingMappingId(rule.id);
    setMappingEditForm({
      accountingCode: rule.accountingCode || '',
      accountingName: rule.accountingName || '',
      description: rule.description || '',
    });
  }

  function cancelEditMapping() {
    setEditingMappingId(null);
    setMappingEditForm({ accountingCode: '', accountingName: '', description: '' });
  }

  async function saveMappingEdit(ruleId) {
    if (!mappingEditForm.accountingCode.trim() || !mappingEditForm.accountingName.trim()) {
      showToast('請填寫科目代碼和名稱', 'error');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/pms-income/mapping-rules?id=${ruleId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mappingEditForm),
      });
      if (res.ok) {
        cancelEditMapping();
        await fetchMappingRules();
        showToast('對應規則已更新');
      } else {
        const data = await res.json().catch(() => ({}));
        showToast((typeof data?.error === 'string' ? data.error : data?.error?.message) || '更新失敗', 'error');
      }
    } catch {
      showToast('更新失敗', 'error');
    }
    setSaving(false);
  }

  async function addMappingRule() {
    if (!newMappingForm.pmsColumnName.trim() || !newMappingForm.accountingCode.trim() || !newMappingForm.accountingName.trim()) {
      showToast('請填寫所有必要欄位', 'error');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/pms-income/mapping-rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...newMappingForm,
          entryType: mappingSubTab === 'credit' ? '貸方' : '借方',
        }),
      });
      if (res.ok) {
        setNewMappingForm({ pmsColumnName: '', entryType: '貸方', accountingCode: '', accountingName: '', description: '' });
        setShowAddMappingForm(false);
        await fetchMappingRules();
        showToast('對應規則已新增');
      } else {
        const data = await res.json().catch(() => ({}));
        showToast((typeof data?.error === 'string' ? data.error : data?.error?.message) || '新增失敗', 'error');
      }
    } catch {
      showToast('新增失敗', 'error');
    }
    setSaving(false);
  }

  async function deleteMappingRule(id) {
    if (!(await confirm('確定要刪除此對應規則？', { title: '刪除確認', danger: true }))) return;
    try {
      const res = await fetch(`/api/pms-income/mapping-rules?id=${id}`, { method: 'DELETE' });
      if (res.ok) {
        await fetchMappingRules();
        showToast('對應規則已刪除');
      } else {
        const data = await res.json().catch(() => ({}));
        showToast((typeof data?.error === 'string' ? data.error : data?.error?.message) || '刪除失敗', 'error');
      }
    } catch {
      showToast('刪除失敗', 'error');
    }
  }

  return {
    mappingRules,
    mappingSubTab, setMappingSubTab,
    editingMappingId,
    mappingEditForm, setMappingEditForm,
    showAddMappingForm, setShowAddMappingForm,
    newMappingForm, setNewMappingForm,
    accountingSubjects,
    fetchMappingRules,
    startEditMapping,
    cancelEditMapping,
    saveMappingEdit,
    addMappingRule,
    deleteMappingRule,
  };
}
