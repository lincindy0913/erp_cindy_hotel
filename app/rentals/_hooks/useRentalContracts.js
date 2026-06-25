'use client';

import { useState, useMemo } from 'react';
import { useToast } from '@/context/ToastContext';
import { useConfirm } from '@/context/ConfirmContext';
import { useColumnSort } from '@/components/SortableTh';
import { localDateStr } from '@/lib/localDate';
import { openPrintWindow } from '@/lib/printWindow';

export function useRentalContracts({ initialFilter, onAfterSave } = {}) {
  const { showToast } = useToast();
  const confirm = useConfirm();

  const [contracts,            setContracts]            = useState([]);
  const [contractsError,       setContractsError]       = useState(null);
  const [contractFilter,       setContractFilter]       = useState(initialFilter || { status: '', propertyId: '' });
  const { sortKey: contractSortKey, sortDir: contractSortDir, toggleSort: contractToggleSort } = useColumnSort('sortOrder', 'asc');
  const [showContractModal,    setShowContractModal]    = useState(false);
  const [editingContract,      setEditingContract]      = useState(null);
  const [renewingFromContract, setRenewingFromContract] = useState(null);
  const [contractForm,         setContractForm]         = useState({
    propertyId: '', tenantId: '', startDate: '', endDate: '',
    monthlyRent: '', paymentDueDay: '5', depositAmount: '', depositAccountId: '',
    rentAccountId: '', accountingSubjectId: '', status: 'pending', autoRenew: false,
    specialTerms: '', note: '', previousContractId: '', category: '',
  });
  const [contractSaving,  setContractSaving]  = useState(false);
  const [reminderOpen,    setReminderOpen]    = useState(false);
  const [reminderThreshold, setReminderThreshold] = useState(60);

  const contractMap = useMemo(
    () => new Map(contracts.map(c => [c.id, c])),
    [contracts]
  );

  const expiringContractCount = useMemo(
    () => 0, // computed in page.js from summary
    []
  );

  function getRenewalDepth(contractId) {
    const visited = new Set();
    let depth = 0;
    let current = contractId;
    while (true) {
      if (visited.has(current)) break;
      visited.add(current);
      const c = contractMap.get(current);
      if (!c?.previousContractId) break;
      current = c.previousContractId;
      depth++;
    }
    return depth;
  }

  async function fetchContracts() {
    try {
      const params = new URLSearchParams();
      if (contractFilter.status) params.set('status', contractFilter.status);
      if (contractFilter.propertyId) params.set('propertyId', contractFilter.propertyId);
      const res = await fetch(`/api/rentals/contracts?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setContractsError(null);
      setContracts(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error('[fetchContracts]', e);
      setContractsError('合約資料載入失敗，請重試。');
      setContracts([]);
    }
  }

  function openContractModal(contract = null) {
    setRenewingFromContract(null);
    if (contract) {
      setEditingContract(contract);
      setContractForm({
        propertyId: String(contract.propertyId || ''), tenantId: String(contract.tenantId || ''),
        startDate: contract.startDate || '', endDate: contract.endDate || '',
        monthlyRent: contract.monthlyRent || '', paymentDueDay: contract.paymentDueDay || '5',
        depositAmount: contract.depositAmount || '', depositAccountId: contract.depositAccountId || '',
        rentAccountId: contract.rentAccountId || '',
        accountingSubjectId: contract.accountingSubjectId ? String(contract.accountingSubjectId) : '',
        status: contract.status || 'pending',
        autoRenew: contract.autoRenew || false, specialTerms: contract.specialTerms || '', note: contract.note || '',
        previousContractId: '',
      });
    } else {
      setEditingContract(null);
      setContractForm({
        propertyId: '', tenantId: '', startDate: '', endDate: '',
        monthlyRent: '', paymentDueDay: '5', depositAmount: '', depositAccountId: '',
        rentAccountId: '', accountingSubjectId: '', status: 'pending', autoRenew: false,
        specialTerms: '', note: '', previousContractId: '',
      });
    }
    setShowContractModal(true);
  }

  function openRenewalModal(contract) {
    const nextDay = new Date(contract.endDate);
    nextDay.setDate(nextDay.getDate() + 1);
    const nextStart = localDateStr(nextDay);
    setRenewingFromContract(contract);
    setEditingContract(null);
    setContractForm({
      propertyId: contract.propertyId || '', tenantId: contract.tenantId || '',
      startDate: nextStart, endDate: '',
      monthlyRent: contract.monthlyRent || '', paymentDueDay: contract.paymentDueDay || '5',
      depositAmount: contract.depositAmount || '', depositAccountId: contract.depositAccountId || '',
      rentAccountId: contract.rentAccountId || '',
      accountingSubjectId: contract.accountingSubjectId ? String(contract.accountingSubjectId) : '',
      status: 'active', autoRenew: contract.autoRenew || false,
      specialTerms: contract.specialTerms || '', note: '', previousContractId: contract.id,
    });
    setShowContractModal(true);
  }

  async function saveContract() {
    if (!contractForm.accountingSubjectId) {
      showToast('請選擇會計科目', 'error');
      return;
    }

    let formToSave = contractForm;
    if (!editingContract && contractForm.propertyId && !contractForm.previousContractId) {
      const activeContract = contracts.find(
        c => String(c.propertyId) === String(contractForm.propertyId) && c.status === 'active'
      );
      if (activeContract) {
        const ok = await confirm(
          `此物業（${activeContract.propertyName}）已有生效合約（${activeContract.contractNo}，到期 ${activeContract.endDate}）。\n\n是否改為「續約」，自動帶入舊合約編號？`,
          { title: '偵測到重複合約', danger: false }
        );
        if (!ok) return;
        formToSave = { ...contractForm, previousContractId: String(activeContract.id) };
        setContractForm(formToSave);
      }
    }

    setContractSaving(true);
    try {
      const url = editingContract ? `/api/rentals/contracts/${editingContract.id}` : '/api/rentals/contracts';
      const method = editingContract ? 'PATCH' : 'POST';
      // PATCH 不允許修改 propertyId / tenantId，移除避免 API 拒絕
      const payload = editingContract
        ? (({ propertyId, tenantId, category, ...rest }) => rest)(formToSave)
        : formToSave;
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const data = await res.json();
      if (!res.ok) {
        if (data?.code === 'ACTIVE_CONTRACT_EXISTS') {
          showToast(`${data.error}，請先終止舊合約或透過「續約」功能新增`, 'error');
        } else {
          showToast(data?.error?.message || data?.error || '儲存失敗', 'error');
        }
        return;
      }
      setShowContractModal(false);
      setRenewingFromContract(null);
      fetchContracts();
      onAfterSave?.();
    } catch (err) { showToast('儲存失敗: ' + err.message, 'error'); }
    finally { setContractSaving(false); }
  }

  async function moveContract(contractId, direction) {
    const sorted = [...contracts].sort((a, b) => {
      const ao = a.property?.sortOrder ?? 999999;
      const bo = b.property?.sortOrder ?? 999999;
      return ao !== bo ? ao - bo : a.id - b.id;
    });
    const idx = sorted.findIndex(c => c.id === contractId);
    if (idx === -1) return;
    if (direction === 'up'   && idx === 0)               return;
    if (direction === 'down' && idx === sorted.length - 1) return;
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    const next = [...sorted];
    [next[idx], next[swapIdx]] = [next[swapIdx], next[idx]];
    setContracts(next.map((c, i) => ({ ...c, property: { ...c.property, sortOrder: i + 1 } })));
    const res = await fetch('/api/rentals/contracts', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'reorder', orderedIds: next.map(c => c.id) }),
    });
    if (!res.ok) { showToast('排序更新失敗', 'error'); fetchContracts(); }
  }

  function deleteContract(id) {
    confirm('確定要刪除此合約？', async () => {
      try {
        const res = await fetch(`/api/rentals/contracts/${id}`, { method: 'DELETE' });
        const data = await res.json();
        if (!res.ok) return showToast(data.error || '刪除失敗', 'error');
        fetchContracts();
      } catch (err) { showToast('刪除失敗: ' + err.message, 'error'); }
    }, '刪除合約');
  }

  function handleDepositAction(contractId, action) {
    const msg = action === 'depositReceive' ? '確定收取押金？收款後將建立金流紀錄。' : '確定退還押金？退還後將建立支出金流。';
    confirm(msg, async () => {
      try {
        const res = await fetch(`/api/rentals/contracts/${contractId}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action }),
        });
        const data = await res.json();
        if (!res.ok) return showToast(data.error || '操作失敗', 'error');
        showToast('操作成功', 'success');
        fetchContracts();
      } catch (err) { showToast('操作失敗: ' + err.message, 'error'); }
    }, action === 'depositReceive' ? '收取押金' : '退還押金', false);
  }

  function printContracts() {
    const statusLabel = contractFilter.status ? `（${contractFilter.status}）` : '';
    openPrintWindow(
      `合約清單${statusLabel}`,
      ['合約編號', '物業', '租客', '起始日', '到期日', '月租金', '押金', '狀態'],
      contracts.map(c => [
        c.contractNo, c.propertyName, c.tenantName, c.startDate, c.endDate,
        `NT$ ${Number(c.monthlyRent || 0).toLocaleString('zh-TW')}`,
        `NT$ ${Number(c.depositAmount || 0).toLocaleString('zh-TW')}`,
        c.status,
      ])
    );
  }

  async function markReminderSent(contractId, channel) {
    try {
      const res = await fetch(`/api/rentals/contracts/${contractId}/reminder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel: channel || null }),
      });
      if (!res.ok) { showToast('標記失敗', 'error'); return; }
      showToast('已標記為已提醒', 'success');
      fetchContracts();
    } catch (e) { showToast('標記失敗: ' + e.message, 'error'); }
  }

  async function clearReminder(contractId) {
    try {
      const res = await fetch(`/api/rentals/contracts/${contractId}/reminder`, { method: 'DELETE' });
      if (!res.ok) { showToast('清除失敗', 'error'); return; }
      fetchContracts();
    } catch (e) { showToast('清除失敗: ' + e.message, 'error'); }
  }

  return {
    contracts, setContracts, contractsError,
    contractFilter, setContractFilter,
    contractSortKey, contractSortDir, contractToggleSort,
    showContractModal, setShowContractModal,
    editingContract, setEditingContract,
    renewingFromContract, setRenewingFromContract,
    contractForm, setContractForm,
    contractSaving,
    reminderOpen, setReminderOpen,
    reminderThreshold, setReminderThreshold,
    contractMap,
    getRenewalDepth,
    fetchContracts,
    openContractModal,
    openRenewalModal,
    saveContract,
    moveContract,
    deleteContract,
    handleDepositAction,
    printContracts,
    markReminderSent,
    clearReminder,
  };
}
