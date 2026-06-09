'use client';

import { useState, useCallback, useEffect } from 'react';

/**
 * Manages the shared accounts list used across reconciliation tabs.
 */
export function useReconciliationAccounts({ showMessage }) {
  const [accounts, setAccounts] = useState([]);

  const fetchAccounts = useCallback(async () => {
    try {
      const res = await fetch('/api/cashflow/accounts');
      const data = await res.json();
      setAccounts(Array.isArray(data) ? data.filter(a => a.isActive) : []);
    } catch (e) {
      showMessage('載入帳戶失敗：' + (e.message || '請稍後再試'), 'error');
    }
  }, [showMessage]);

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  return { accounts, fetchAccounts };
}
