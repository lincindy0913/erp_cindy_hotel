'use client';

import { useState } from 'react';
import { useConfirm } from '@/context/ConfirmContext';

export function useUtilityPayment({ showMessage }) {
  const confirm = useConfirm();

  const [paymentRecords, setPaymentRecords] = useState([]);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [paymentFilter, setPaymentFilter] = useState({ warehouse: '', year: '', billType: '', status: '' });
  const [creatingPO, setCreatingPO] = useState(null);

  async function fetchPaymentRecords() {
    setPaymentLoading(true);
    try {
      const params = new URLSearchParams({ withPayment: 'true' });
      if (paymentFilter.warehouse) params.set('warehouse', paymentFilter.warehouse);
      if (paymentFilter.year)      params.set('year',      paymentFilter.year);
      if (paymentFilter.billType)  params.set('billType',  paymentFilter.billType);
      const res = await fetch(`/api/utility-bills?${params}`);
      const data = await res.json();
      let rows = Array.isArray(data) ? data : [];
      if (paymentFilter.status === 'noPO') {
        rows = rows.filter(r => !r.paymentOrderId);
      } else if (paymentFilter.status) {
        rows = rows.filter(r => r.paymentOrder?.status === paymentFilter.status);
      }
      setPaymentRecords(rows);
    } catch {
      setPaymentRecords([]);
    }
    setPaymentLoading(false);
  }

  async function createPaymentOrder(record) {
    if (!(await confirm(`確定為「${record.warehouse} ${record.billYear}年${record.billMonth}月 ${record.billType}」建立付款單？`, { title: '建立付款單確認', danger: false }))) return;
    setCreatingPO(record.id);
    try {
      const res = await fetch(`/api/utility-bills/${record.id}`, { method: 'PATCH' });
      const data = await res.json();
      if (res.ok) {
        if (data.already) {
          showMessage(`此記錄已有付款單 ${data.orderNo}（${data.status}）`);
        } else {
          showMessage(`付款單已建立：${data.orderNo}　NT$${Number(data.totalAmount).toLocaleString()}`);
        }
        fetchPaymentRecords();
      } else {
        showMessage(data.error || '建立付款單失敗', 'error');
      }
    } catch {
      showMessage('建立付款單失敗', 'error');
    }
    setCreatingPO(null);
  }

  return {
    paymentRecords,
    paymentLoading,
    paymentFilter, setPaymentFilter,
    creatingPO,
    fetchPaymentRecords,
    createPaymentOrder,
  };
}
