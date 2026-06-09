'use client';

import { useState, useCallback, useEffect } from 'react';

/**
 * Manages rental reconciliation state and data fetching.
 */
export function useReconciliationRental({ activeTab, showMessage }) {
  const now = new Date();
  const [rentalPayments, setRentalPayments] = useState([]);
  const [rentalReconLoading, setRentalReconLoading] = useState(false);
  const [rentalReconYear, setRentalReconYear] = useState(now.getFullYear());
  const [rentalReconMonth, setRentalReconMonth] = useState(now.getMonth() + 1);
  const [rentalReconAccountId, setRentalReconAccountId] = useState('');
  const [rentalReconMethodFilter, setRentalReconMethodFilter] = useState('');
  const [rentalReconSearch, setRentalReconSearch] = useState('');

  const fetchRentalPayments = useCallback(async () => {
    setRentalReconLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('year', rentalReconYear);
      if (rentalReconMonth) params.set('month', rentalReconMonth);
      if (rentalReconAccountId) params.set('accountId', rentalReconAccountId);
      if (rentalReconMethodFilter) params.set('paymentMethod', rentalReconMethodFilter);
      params.set('limit', '500');
      const res = await fetch(`/api/rentals/payments?${params}`);
      const data = await res.json();
      setRentalPayments(data.data || []);
    } catch (e) {
      showMessage('載入租金付款紀錄失敗：' + (e.message || '請稍後再試'), 'error');
    }
    setRentalReconLoading(false);
  }, [rentalReconYear, rentalReconMonth, rentalReconAccountId, rentalReconMethodFilter, showMessage]);

  useEffect(() => {
    if (activeTab === 'rental') fetchRentalPayments();
  }, [activeTab, fetchRentalPayments]);

  return {
    rentalPayments,
    rentalReconLoading,
    rentalReconYear, setRentalReconYear,
    rentalReconMonth, setRentalReconMonth,
    rentalReconAccountId, setRentalReconAccountId,
    rentalReconMethodFilter, setRentalReconMethodFilter,
    rentalReconSearch, setRentalReconSearch,
    fetchRentalPayments,
  };
}
