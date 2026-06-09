'use client';

import { useState } from 'react';
import { useToast } from '@/context/ToastContext';
import { useConfirm } from '@/context/ConfirmContext';
import { todayStr } from '@/lib/localDate';

export function useCashierBatch({ pendingOrders, accounts, fetchOrders, fetchAccounts }) {
  const { showToast } = useToast();
  const confirm = useConfirm();

  const [selectedOrderIds, setSelectedOrderIds] = useState(new Set());
  const [batchAccounts, setBatchAccounts] = useState([{ accountId: '', amount: '' }]);
  const [batchExecutionDate, setBatchExecutionDate] = useState(todayStr());
  const [batchNote, setBatchNote] = useState('');
  const [batchExecuting, setBatchExecuting] = useState(false);
  const [batchIsEmployeeAdvance, setBatchIsEmployeeAdvance] = useState(false);
  const [batchAdvancedBy, setBatchAdvancedBy] = useState('');
  const [batchAdvancePaymentMethod, setBatchAdvancePaymentMethod] = useState('現金');
  const [batchExtraAmounts, setBatchExtraAmounts] = useState({});

  function syncBatchAccountFromOrders(orderSet) {
    const sel = pendingOrders.filter(o => orderSet.has(o.id));
    if (sel.length === 0) return;
    const selWithAccount = sel.filter(o => o.accountId != null && o.accountId !== '');
    if (selWithAccount.length !== sel.length) return;
    const accountTotals = {};
    for (const o of sel) {
      const aid = String(o.accountId);
      accountTotals[aid] = (accountTotals[aid] || 0) + Number(o.netAmount);
    }
    const newAccounts = Object.entries(accountTotals).map(([accountId, amount]) => ({
      accountId,
      amount: String(amount),
    }));
    setBatchAccounts(newAccounts);
  }

  function handleToggleSelect(orderId) {
    const newSelected = new Set(selectedOrderIds);
    if (newSelected.has(orderId)) {
      newSelected.delete(orderId);
    } else {
      newSelected.add(orderId);
    }
    setSelectedOrderIds(newSelected);
    syncBatchAccountFromOrders(newSelected);
  }

  function handleSelectAll() {
    if (selectedOrderIds.size === pendingOrders.length && pendingOrders.length > 0) {
      setSelectedOrderIds(new Set());
      setBatchAccounts([{ accountId: '', amount: '' }]);
    } else {
      const newSelected = new Set(pendingOrders.map(o => o.id));
      setSelectedOrderIds(newSelected);
      syncBatchAccountFromOrders(newSelected);
    }
  }

  function resetBatch() {
    setSelectedOrderIds(new Set());
    setBatchAccounts([{ accountId: '', amount: '' }]);
    setBatchExtraAmounts({});
    setBatchIsEmployeeAdvance(false);
    setBatchAdvancedBy('');
    setBatchAdvancePaymentMethod('現金');
  }

  const selectedOrders = pendingOrders.filter(o => selectedOrderIds.has(o.id));
  const batchExtrasTotal = selectedOrders.reduce((sum, o) => sum + (parseFloat(batchExtraAmounts[o.id]) || 0), 0);
  const selectedTotal = selectedOrders.reduce((sum, o) => sum + Number(o.netAmount), 0) + batchExtrasTotal;
  const hasLoanOrders = selectedOrders.some(o => (o.summary || '').includes('貸款還款'));

  const selectedByMethod = {};
  selectedOrders.forEach(o => {
    const extra = parseFloat(batchExtraAmounts[o.id]) || 0;
    const method = o.paymentMethod || '未指定';
    if (!selectedByMethod[method]) selectedByMethod[method] = { count: 0, total: 0, orders: [] };
    selectedByMethod[method].count++;
    selectedByMethod[method].total += Number(o.netAmount) + extra;
    selectedByMethod[method].orders.push(o);
  });

  const batchAccountsTotal = batchAccounts.reduce((sum, a) => sum + (parseFloat(a.amount) || 0), 0);
  const batchAmountDiff = Math.round((selectedTotal - batchAccountsTotal) * 100) / 100;

  async function handleBatchExecute() {
    if (selectedOrderIds.size === 0) {
      showToast('請至少勾選一筆付款單', 'error');
      return;
    }
    const validAccounts = batchAccounts.filter(a => a.accountId && parseFloat(a.amount) > 0);
    if (validAccounts.length === 0) {
      showToast('請新增至少一個資金帳戶並輸入金額', 'error');
      return;
    }
    if (Math.abs(batchAmountDiff) > 0.01) {
      showToast(`資金帳戶總額 NT$ ${batchAccountsTotal.toLocaleString()} 與付款單總額 NT$ ${selectedTotal.toLocaleString()} 不符，差額 NT$ ${batchAmountDiff.toLocaleString()}`, 'error');
      return;
    }

    const accIds = validAccounts.map(a => a.accountId);
    if (new Set(accIds).size !== accIds.length) {
      showToast('不可重複選擇相同帳戶', 'error');
      return;
    }

    const accountSummary = validAccounts.map(a => {
      const acct = accounts.find(ac => ac.id === parseInt(a.accountId));
      return `${acct?.name || '帳戶'}: NT$ ${parseFloat(a.amount).toLocaleString()}`;
    }).join('\n');

    const confirmMsg = `確定要批次執行 ${selectedOrderIds.size} 筆付款單？\n總金額：NT$ ${selectedTotal.toLocaleString()}\n\n資金來源：\n${accountSummary}`;
    if (!(await confirm(confirmMsg, { title: '批次執行確認', danger: false }))) return;

    if (batchIsEmployeeAdvance && !batchAdvancedBy.trim()) {
      showToast('請輸入代墊員工姓名', 'error');
      return;
    }

    setBatchExecuting(true);
    try {
      const orderExtras = {};
      for (const o of selectedOrders) {
        const extra = parseFloat(batchExtraAmounts[o.id]) || 0;
        if (extra > 0) orderExtras[o.id] = extra;
      }

      const res = await fetch('/api/cashier/batch-execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderIds: Array.from(selectedOrderIds),
          accounts: validAccounts.map(a => ({
            accountId: parseInt(a.accountId),
            amount: parseFloat(a.amount),
          })),
          executionDate: batchExecutionDate,
          note: batchNote || '批次執行',
          orderExtras,
          isEmployeeAdvance: batchIsEmployeeAdvance,
          advancedBy: batchAdvancedBy.trim(),
          advancePaymentMethod: batchAdvancePaymentMethod,
        }),
      });

      let result;
      try {
        result = await res.json();
      } catch {
        showToast(`批次執行失敗 (HTTP ${res.status})：伺服器回應無法解析`, 'error');
        setBatchExecuting(false);
        return;
      }
      if (res.ok) {
        showToast(result.message || '批次執行成功', 'success');
        resetBatch();
        fetchOrders();
        fetchAccounts();
      } else {
        const msg = (typeof result?.error === 'string' ? result.error : result?.error?.message) || result?.message || JSON.stringify(result);
        showToast(`批次執行失敗：${msg}`, 'error');
      }
    } catch (err) {
      console.error('Batch execute error:', err);
      showToast('批次執行失敗: ' + (err?.message || String(err)), 'error');
    }
    setBatchExecuting(false);
  }

  return {
    selectedOrderIds, setSelectedOrderIds,
    batchAccounts, setBatchAccounts,
    batchExecutionDate, setBatchExecutionDate,
    batchNote, setBatchNote,
    batchExecuting,
    batchIsEmployeeAdvance, setBatchIsEmployeeAdvance,
    batchAdvancedBy, setBatchAdvancedBy,
    batchAdvancePaymentMethod, setBatchAdvancePaymentMethod,
    batchExtraAmounts, setBatchExtraAmounts,
    selectedOrders,
    batchExtrasTotal,
    selectedTotal,
    hasLoanOrders,
    selectedByMethod,
    batchAccountsTotal,
    batchAmountDiff,
    handleToggleSelect,
    handleSelectAll,
    handleBatchExecute,
    resetBatch,
  };
}
