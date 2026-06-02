'use client';

import { useState, useEffect } from 'react';
import { useToast } from '@/context/ToastContext';
import { useConfirm } from '@/context/ConfirmContext';

export function usePaymentOrders() {
  const { showToast } = useToast();
  const confirm = useConfirm();

  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedOrders, setExpandedOrders] = useState(new Set());
  const [selectedOrderIds, setSelectedOrderIds] = useState(new Set());
  const [activeTab, setActiveTab] = useState('draft');
  const [batchSubmitting, setBatchSubmitting] = useState(false);
  const [submittingOrderId, setSubmittingOrderId] = useState(null);
  const [highlightOrderNo, setHighlightOrderNo] = useState(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setHighlightOrderNo(params.get('highlight'));
  }, []);

  useEffect(() => {
    setSelectedOrderIds(new Set());
  }, [activeTab]);

  // 從 payment-voucher 跳轉過來時，自動切換 tab、展開並捲動到目標付款單
  useEffect(() => {
    if (!highlightOrderNo || orders.length === 0) return;
    const target = orders.find(o => o.orderNo === highlightOrderNo);
    if (!target) return;
    const statusToTab = { '草稿': 'draft', '待出納': 'pending', '已執行': 'executed', '已拒絕': 'rejected', '已代墊': 'advanced', '已退貨': 'returned' };
    const tab = statusToTab[target.status] || 'draft';
    setActiveTab(tab);
    setExpandedOrders(prev => new Set([...prev, target.id]));
    setTimeout(() => {
      const el = document.getElementById(`order-row-${target.id}`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 150);
  }, [orders, highlightOrderNo]);

  async function fetchOrders() {
    try {
      const response = await fetch('/api/payment-orders');
      if (!response.ok) { setOrders([]); setLoading(false); return; }
      const data = await response.json();
      setOrders(Array.isArray(data) ? data : []);
      setLoading(false);
    } catch (error) {
      console.error('取得付款單列表失敗:', error);
      setOrders([]);
      setLoading(false);
    }
  }

  async function handleDelete(orderId) {
    if (!(await confirm('確定要刪除這筆付款單嗎？', { title: '刪除確認', danger: true }))) return;

    try {
      const response = await fetch(`/api/payment-orders/${orderId}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        showToast('付款單刪除成功！', 'success');
        fetchOrders();
      } else {
        const error = await response.json();
        showToast('刪除失敗：' + (error.error || error.message || '未知錯誤'), 'error');
      }
    } catch (error) {
      console.error('刪除付款單失敗:', error);
      showToast('刪除付款單失敗，請稍後再試', 'error');
    }
  }

  function handleOrderToggle(orderId) {
    const newSelected = new Set(selectedOrderIds);
    if (newSelected.has(orderId)) newSelected.delete(orderId);
    else newSelected.add(orderId);
    setSelectedOrderIds(newSelected);
  }

  function handleSelectAllOrders(displayOrders) {
    const canSelect = displayOrders.filter(o => o.status === '草稿' || o.status === '已拒絕');
    if (selectedOrderIds.size === canSelect.length && canSelect.length > 0) {
      setSelectedOrderIds(new Set());
    } else {
      setSelectedOrderIds(new Set(canSelect.map(o => o.id)));
    }
  }

  async function handleBatchSubmitToCashier(displayOrders) {
    const ids = Array.from(selectedOrderIds);
    if (ids.length === 0) return;
    const ordersInDisplay = displayOrders.filter(o => ids.includes(o.id));
    const draftCount = ordersInDisplay.filter(o => o.status === '草稿').length;
    const rejectedCount = ordersInDisplay.filter(o => o.status === '已拒絕').length;
    const isSubmit = draftCount > 0 && rejectedCount === 0;
    const isResubmit = rejectedCount > 0 && draftCount === 0;
    const actionLabel = isSubmit ? '提交出納' : isResubmit ? '重新提交' : '提交/重新提交';
    if (!(await confirm(`確定要將選取的 ${ids.length} 筆付款單${actionLabel}嗎？`, { title: '批次提交確認', danger: false }))) return;

    setBatchSubmitting(true);
    try {
      let ok = 0;
      const errors = [];
      for (const orderId of ids) {
        const order = ordersInDisplay.find(o => o.id === orderId);
        const action = order?.status === '已拒絕' ? 'resubmit' : 'submit';
        try {
          const response = await fetch(`/api/payment-orders/${orderId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action })
          });
          if (response.ok) ok++;
          else {
            const err = await response.json();
            errors.push(`${order?.orderNo || orderId}: ${err.error || err.message || '未知錯誤'}`);
          }
        } catch (e) {
          errors.push(`${order?.orderNo || orderId}: 網路錯誤`);
        }
      }
      if (ok > 0) {
        setSelectedOrderIds(new Set());
        fetchOrders();
        showToast(`成功 ${actionLabel} ${ok} 筆${errors.length ? `，失敗 ${errors.length} 筆` : ''}`, errors.length ? 'warning' : 'success');
      }
      if (errors.length > 0) {
        showToast(`部分失敗：\n${errors.slice(0, 5).join('\n')}${errors.length > 5 ? `\n...等 ${errors.length} 筆` : ''}`, 'error');
      }
    } finally {
      setBatchSubmitting(false);
    }
  }

  async function handleSubmitToCashier(orderId) {
    if (!(await confirm('確定要提交此付款單到出納嗎？', { title: '提交確認', danger: false }))) return;

    setSubmittingOrderId(orderId);
    try {
      const response = await fetch(`/api/payment-orders/${orderId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'submit' })
      });

      if (response.ok) {
        showToast('付款單已提交出納！', 'success');
        fetchOrders();
      } else {
        const error = await response.json();
        showToast('提交失敗：' + (error.error || error.message || '未知錯誤'), 'error');
      }
    } catch (error) {
      console.error('提交出納失敗:', error);
      showToast('提交出納失敗，請稍後再試', 'error');
    } finally {
      setSubmittingOrderId(null);
    }
  }

  async function handleResubmit(orderId) {
    if (!(await confirm('確定要重新提交此付款單到出納嗎？', { title: '重新提交確認', danger: false }))) return;

    setSubmittingOrderId(orderId);
    try {
      const response = await fetch(`/api/payment-orders/${orderId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'resubmit' })
      });

      if (response.ok) {
        showToast('付款單已重新提交出納！', 'success');
        fetchOrders();
      } else {
        const error = await response.json();
        showToast('重新提交失敗：' + (error.error || error.message || '未知錯誤'), 'error');
      }
    } catch (error) {
      console.error('重新提交失敗:', error);
      showToast('重新提交失敗，請稍後再試', 'error');
    } finally {
      setSubmittingOrderId(null);
    }
  }

  async function handleVoid(orderId) {
    if (!(await confirm('確定要作廢此付款單嗎？此操作不可復原。', { title: '作廢確認', danger: true }))) return;

    try {
      const response = await fetch(`/api/payment-orders/${orderId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'void' })
      });

      if (response.ok) {
        showToast('付款單已作廢！', 'success');
        fetchOrders();
      } else {
        const error = await response.json();
        showToast('作廢失敗：' + (error.error || error.message || '未知錯誤'), 'error');
      }
    } catch (error) {
      console.error('作廢失敗:', error);
    }
  }

  function handleViewDetails(orderId) {
    const newExpanded = new Set(expandedOrders);
    if (newExpanded.has(orderId)) {
      newExpanded.delete(orderId);
    } else {
      newExpanded.add(orderId);
    }
    setExpandedOrders(newExpanded);
  }

  function getStatusBadge(status) {
    const map = {
      '草稿': 'bg-gray-100 text-gray-800',
      '待出納': 'bg-yellow-100 text-yellow-800',
      '已執行': 'bg-green-100 text-green-800',
      '已拒絕': 'bg-red-100 text-red-800',
      '已作廢': 'bg-gray-200 text-gray-500',
      '已代墊': 'bg-purple-100 text-purple-800',
      '已退貨': 'bg-orange-100 text-orange-800',
      '部分退貨': 'bg-amber-100 text-amber-800',
    };
    return map[status] || 'bg-gray-100 text-gray-800';
  }

  return {
    orders,
    loading,
    expandedOrders, setExpandedOrders,
    selectedOrderIds, setSelectedOrderIds,
    activeTab, setActiveTab,
    batchSubmitting,
    submittingOrderId,
    highlightOrderNo,
    fetchOrders,
    handleDelete,
    handleOrderToggle,
    handleSelectAllOrders,
    handleBatchSubmitToCashier,
    handleSubmitToCashier,
    handleResubmit,
    handleVoid,
    handleViewDetails,
    getStatusBadge,
  };
}
