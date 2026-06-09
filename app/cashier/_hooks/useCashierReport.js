'use client';

import { useState } from 'react';
import { todayStr } from '@/lib/localDate';

export function useCashierReport({ accounts }) {
  const [reportDateFrom, setReportDateFrom] = useState(todayStr());
  const [reportDateTo, setReportDateTo] = useState(todayStr());
  const [reportData, setReportData] = useState([]);
  const [reportLoading, setReportLoading] = useState(false);

  async function fetchReportData() {
    setReportLoading(true);
    try {
      const res = await fetch('/api/payment-orders');
      const data = await res.json();
      const allOrders = Array.isArray(data) ? data : [];
      const filtered = allOrders.filter(o => {
        if (o.status !== '已執行') return false;
        const exec = o.executions?.[0];
        if (!exec) return false;
        const execDate = exec.executionDate;
        return execDate >= reportDateFrom && execDate <= reportDateTo;
      });
      filtered.sort((a, b) => {
        const da = a.executions?.[0]?.executionDate || '';
        const db = b.executions?.[0]?.executionDate || '';
        return da.localeCompare(db);
      });
      setReportData(filtered);
    } catch { setReportData([]); }
    setReportLoading(false);
  }

  const reportByMethod = {};
  reportData.forEach(o => {
    const exec = o.executions?.[0];
    const method = exec?.paymentMethod || o.paymentMethod || '未指定';
    if (!reportByMethod[method]) reportByMethod[method] = { count: 0, total: 0 };
    reportByMethod[method].count++;
    reportByMethod[method].total += Number(exec?.actualAmount ?? o.netAmount);
  });

  const reportTotal = reportData.reduce((sum, o) => {
    const exec = o.executions?.[0];
    return sum + Number(exec?.actualAmount ?? o.netAmount);
  }, 0);

  const reportByAccount = {};
  reportData.forEach(o => {
    const exec = o.executions?.[0];
    if (!exec) return;
    const accId = exec.accountId;
    const acct = accounts.find(a => a.id === accId);
    const accName = acct ? `${acct.name} (${acct.type})` : `帳戶#${accId}`;
    if (!reportByAccount[accName]) reportByAccount[accName] = { count: 0, total: 0 };
    reportByAccount[accName].count++;
    reportByAccount[accName].total += Number(exec.actualAmount);
  });

  return {
    reportDateFrom, setReportDateFrom,
    reportDateTo, setReportDateTo,
    reportData,
    reportLoading,
    fetchReportData,
    reportByMethod,
    reportTotal,
    reportByAccount,
  };
}
