'use client';

import { useState, useEffect } from 'react';

export function usePaymentOptions({ orders = [] } = {}) {
  // 付款條件選項管理
  const [paymentTermsOptions, setPaymentTermsOptions] = useState(['月結', '現金', '支票', '轉帳', '信用卡', '員工代付']);
  const [showTermsManager, setShowTermsManager] = useState(false);
  const [newTermName, setNewTermName] = useState('');

  // 付款方式選項管理
  const [paymentMethodOptions, setPaymentMethodOptions] = useState(['月結', '現金', '支票', '轉帳', '信用卡', '員工代付']);
  const [showMethodManager, setShowMethodManager] = useState(false);
  const [newMethodName, setNewMethodName] = useState('');

  // 開票賬戶選項管理（可搜尋下拉）
  const [checkAccountOptions, setCheckAccountOptions] = useState([]);
  const [showAccountManager, setShowAccountManager] = useState(false);
  const [newAccountName, setNewAccountName] = useState('');
  const [accountSearch, setAccountSearch] = useState('');
  const [showAccountDropdown, setShowAccountDropdown] = useState(false);

  // 付款帳戶（CashAccount）
  const [cashAccounts, setCashAccounts] = useState([]);

  // 初始載入帳戶資料
  useEffect(() => {
    fetchCashAccounts();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 從現有付款紀錄中提取開票賬戶選項
  useEffect(() => {
    if (orders.length > 0) {
      const accounts = [...new Set(orders.map(p => p.checkAccount).filter(Boolean))];
      setCheckAccountOptions(prev => {
        const merged = [...new Set([...prev, ...accounts])];
        return merged;
      });
    }
  }, [orders]);

  async function fetchCashAccounts() {
    try {
      const response = await fetch('/api/cashflow/accounts');
      if (!response.ok) { setCashAccounts([]); return; }
      const data = await response.json();
      setCashAccounts(Array.isArray(data) ? data.filter(a => a.isActive) : []);
    } catch (error) {
      console.error('取得帳戶列表失敗:', error);
      setCashAccounts([]);
    }
  }

  return {
    paymentTermsOptions, setPaymentTermsOptions,
    showTermsManager, setShowTermsManager,
    newTermName, setNewTermName,
    paymentMethodOptions, setPaymentMethodOptions,
    showMethodManager, setShowMethodManager,
    newMethodName, setNewMethodName,
    checkAccountOptions, setCheckAccountOptions,
    showAccountManager, setShowAccountManager,
    newAccountName, setNewAccountName,
    accountSearch, setAccountSearch,
    showAccountDropdown, setShowAccountDropdown,
    cashAccounts, setCashAccounts,
    fetchCashAccounts,
  };
}
