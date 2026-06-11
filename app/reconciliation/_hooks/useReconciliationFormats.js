'use client';

import { useState, useCallback, useEffect } from 'react';

const DEFAULT_FORMAT_FORM = {
  bankName: '', bankCode: '', fileEncoding: 'UTF-8', fileType: 'csv',
  dateColumn: '', descriptionColumn: '', debitColumn: '', creditColumn: '',
  balanceColumn: '', referenceColumn: '', dateFormat: 'YYYY-MM-DD'
};

/**
 * Manages bank formats state, fetching, and creation.
 */
export function useReconciliationFormats({ activeTab, showMessage }) {
  const [formats, setFormats] = useState([]);
  const [formatsLoading, setFormatsLoading] = useState(false);
  const [formatsFetchError, setFormatsFetchError] = useState(null);
  const [showFormatForm, setShowFormatForm] = useState(false);
  const [formatForm, setFormatForm] = useState(DEFAULT_FORMAT_FORM);
  const [formatSaving, setFormatSaving] = useState(false);

  const fetchFormats = useCallback(async () => {
    setFormatsLoading(true);
    setFormatsFetchError(null);
    try {
      const res = await fetch('/api/reconciliation/bank-formats');
      const data = await res.json();
      setFormats(Array.isArray(data) ? data : []);
    } catch (e) {
      setFormatsFetchError('載入銀行格式失敗：' + (e.message || '請稍後再試'));
    }
    setFormatsLoading(false);
  }, []);

  useEffect(() => {
    if (activeTab === 'formats' || activeTab === 'account') fetchFormats();
  }, [activeTab, fetchFormats]);

  const submitFormat = async () => {
    if (!formatForm.bankName.trim()) {
      showMessage('銀行名稱為必填', 'error');
      return;
    }
    setFormatSaving(true);
    try {
      const res = await fetch('/api/reconciliation/bank-formats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formatForm)
      });
      const data = await res.json();
      if (data.error) {
        showMessage(data.error, 'error');
      } else {
        showMessage('銀行格式已建立');
        setShowFormatForm(false);
        setFormatForm(DEFAULT_FORMAT_FORM);
        fetchFormats();
      }
    } catch (e) {
      showMessage('儲存格式失敗', 'error');
    } finally {
      setFormatSaving(false);
    }
  };

  return {
    formats,
    formatsLoading,
    formatsFetchError,
    showFormatForm, setShowFormatForm,
    formatForm, setFormatForm,
    formatSaving,
    fetchFormats,
    submitFormat,
  };
}
