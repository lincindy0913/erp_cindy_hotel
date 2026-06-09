'use client';

import { useState } from 'react';
import { useToast } from '@/context/ToastContext';
import { todayStr } from '@/lib/localDate';

export function useCashierExecution({ fetchOrders, fetchAccounts }) {
  const { showToast } = useToast();

  const [expandedOrderId, setExpandedOrderId] = useState(null);
  const [rejectingOrderId, setRejectingOrderId] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [executeData, setExecuteData] = useState({
    executionDate: todayStr(),
    actualAmount: 0,
    extraAmount: '',
    accountId: '',
    paymentMethod: '',
    note: '',
    isEmployeeAdvance: false,
    advancedBy: '',
    advancePaymentMethod: '現金',
  });
  const [executionResults, setExecutionResults] = useState({});
  const [executingOrderId, setExecutingOrderId] = useState(null);
  const [selfExecWarning, setSelfExecWarning] = useState(null);

  function toggleExpand(order) {
    if (expandedOrderId === order.id) {
      setExpandedOrderId(null);
      setRejectingOrderId(null);
    } else {
      setExpandedOrderId(order.id);
      setRejectingOrderId(null);
      setRejectReason('');
      const accountIdStr = (order.accountId != null && order.accountId !== '') ? String(order.accountId) : '';
      setExecuteData({
        executionDate: todayStr(),
        actualAmount: order.netAmount,
        extraAmount: '',
        accountId: accountIdStr,
        paymentMethod: order.paymentMethod,
        note: '',
        isEmployeeAdvance: false,
        advancedBy: '',
        advancePaymentMethod: '現金',
      });
    }
  }

  async function handleExecute(e, order) {
    e.preventDefault();
    if (!executeData.accountId) {
      showToast('請選擇付款帳戶', 'error');
      return;
    }

    setExecutingOrderId(order.id);
    try {
      const res = await fetch('/api/cashier/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paymentOrderId: order.id,
          ...executeData,
          actualAmount: parseFloat(executeData.actualAmount),
        }),
      });

      if (res.ok) {
        const result = await res.json();
        setExecutionResults(prev => ({
          ...prev,
          [order.id]: {
            executionNo: result.executionNo,
            cashTransactionNo: result.cashTransactionNo,
          }
        }));
        showToast(`出納確認成功！執行單號：${result.executionNo}`, 'success');
        if (result.selfExecution) {
          setSelfExecWarning({
            executionNo: result.executionNo,
            cashTransactionNo: result.cashTransactionNo,
            orderNo: order.orderNo,
          });
        }
        setExpandedOrderId(null);
        fetchOrders();
      } else {
        const err = await res.json();
        showToast(err.error || err.message || '執行失敗', 'error');
      }
    } catch {
      showToast('操作失敗', 'error');
    } finally {
      setExecutingOrderId(null);
    }
  }

  async function handleReject(order) {
    if (!rejectReason.trim()) {
      showToast('請輸入退回原因', 'error');
      return;
    }

    try {
      const res = await fetch(`/api/payment-orders/${order.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reject', reason: rejectReason.trim() }),
      });
      if (res.ok) {
        showToast('付款單已退回', 'success');
        setExpandedOrderId(null);
        setRejectingOrderId(null);
        setRejectReason('');
        fetchOrders();
      } else {
        const err = await res.json();
        showToast(err.error || err.message || '退回失敗', 'error');
      }
    } catch {
      showToast('操作失敗', 'error');
    }
  }

  return {
    expandedOrderId, setExpandedOrderId,
    rejectingOrderId, setRejectingOrderId,
    rejectReason, setRejectReason,
    executeData, setExecuteData,
    executionResults,
    executingOrderId,
    selfExecWarning, setSelfExecWarning,
    toggleExpand,
    handleExecute,
    handleReject,
  };
}
