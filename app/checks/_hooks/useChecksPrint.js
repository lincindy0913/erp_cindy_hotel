'use client';

import { useState } from 'react';
import { useToast } from '@/context/ToastContext';

export function useChecksPrint({ checks, suppliers }) {
  const { showToast } = useToast();

  const [showPrintSheetModal, setShowPrintSheetModal] = useState(false);
  const [printWarehouse, setPrintWarehouse] = useState('');
  const [showPrintByPOModal, setShowPrintByPOModal] = useState(false);
  const [showPrintByPurchaseModal, setShowPrintByPurchaseModal] = useState(false);
  const [printSearchWarehouse, setPrintSearchWarehouse] = useState('');
  const [printSearchDateFrom, setPrintSearchDateFrom] = useState('');
  const [printSearchDateTo, setPrintSearchDateTo] = useState('');
  const [printSearchResults, setPrintSearchResults] = useState([]);
  const [printSearchLoading, setPrintSearchLoading] = useState(false);

  const handlePrintSearch = async (source) => {
    if (!printSearchWarehouse) {
      showToast('請選擇館別', 'error');
      return;
    }
    setPrintSearchLoading(true);
    try {
      const q = new URLSearchParams({ source, warehouse: printSearchWarehouse });
      if (printSearchDateFrom) q.set('dateFrom', printSearchDateFrom);
      if (printSearchDateTo) q.set('dateTo', printSearchDateTo);
      const res = await fetch(`/api/checks/print-search?${q}`);
      const data = await res.json();
      setPrintSearchResults(Array.isArray(data) ? data : []);
      if (Array.isArray(data) && data.length === 0) showToast('查無符合條件的支票', 'info');
    } catch (e) {
      showToast('查詢失敗: ' + e.message, 'error');
    }
    setPrintSearchLoading(false);
  };

  const resetPrintSearch = () => {
    setPrintSearchWarehouse('');
    setPrintSearchDateFrom('');
    setPrintSearchDateTo('');
    setPrintSearchResults([]);
  };

  const checksForPrintSheet = (checks || [])
    .filter(c => c.checkType === 'payable' && (c.status === 'pending' || c.status === 'due'))
    .filter(c => !printWarehouse || c.warehouse === printWarehouse)
    .sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || '') || (a.checkNumber || '').localeCompare(b.checkNumber || ''));

  const getPayeeName = (c) => c.payeeName || (c.supplierId && (suppliers || []).find(s => s.id === c.supplierId)?.name) || '－';

  return {
    showPrintSheetModal, setShowPrintSheetModal,
    printWarehouse, setPrintWarehouse,
    showPrintByPOModal, setShowPrintByPOModal,
    showPrintByPurchaseModal, setShowPrintByPurchaseModal,
    printSearchWarehouse, setPrintSearchWarehouse,
    printSearchDateFrom, setPrintSearchDateFrom,
    printSearchDateTo, setPrintSearchDateTo,
    printSearchResults,
    printSearchLoading,
    handlePrintSearch,
    resetPrintSearch,
    checksForPrintSheet,
    getPayeeName,
  };
}
