'use client';

import { useState, useCallback } from 'react';
import { useToast } from '@/context/ToastContext';
import { todayStr } from '@/lib/localDate';
import { DEFAULT_WAREHOUSE } from '../_constants';

const EMPTY_FORM = {
  cardTotal: '', roomPriceTotal: '', subsidizedRooms: '',
  avgRoomRate: '', monthlyRoomCount: '', roomSuppliesCost: '', fbExpense: '',
  fitGuestCount: '', staffCount: '', salary: '', businessSource: '其他100%',
  otherIncome: '', otherIncomeNote: '', note: '',
};

export function useBnbDeclaration({ onSaved } = {}) {
  const { showToast } = useToast();

  const [declMonth,     setDeclMonth]     = useState(() => todayStr().slice(0, 7));
  const [declWarehouse, setDeclWarehouse] = useState(DEFAULT_WAREHOUSE);
  const [declActual,    setDeclActual]    = useState(null);
  const [declForm,      setDeclForm]      = useState(EMPTY_FORM);
  const [declSaving,    setDeclSaving]    = useState(false);
  const [declLoading,   setDeclLoading]   = useState(false);
  const [declSearched,  setDeclSearched]  = useState(false);
  const [declError,     setDeclError]     = useState(null);

  const fetchDecl = useCallback(async () => {
    setDeclLoading(true);
    setDeclSearched(true);
    setDeclError(null);
    try {
      const wh = encodeURIComponent(declWarehouse);
      const [actualRes, reportRes] = await Promise.all([
        fetch(`/api/bnb/actual-stats?month=${declMonth}&warehouse=${wh}`),
        fetch(`/api/bnb/monthly-report?month=${declMonth}&warehouse=${wh}`),
      ]);
      const actual = actualRes.ok ? await actualRes.json() : null;
      setDeclActual(actual);
      const saved = reportRes.ok ? await reportRes.json() : null;
      if (saved) {
        setDeclForm({
          cardTotal:        saved.cardTotal        ?? '',
          roomPriceTotal:   saved.roomPriceTotal   ?? '',
          subsidizedRooms:  saved.subsidizedRooms  ?? '',
          avgRoomRate:      saved.avgRoomRate       ?? '',
          monthlyRoomCount: saved.monthlyRoomCount ?? '',
          roomSuppliesCost: saved.roomSuppliesCost ?? '',
          fbExpense:        saved.fbExpense        ?? '',
          fitGuestCount:    saved.fitGuestCount    ?? '',
          staffCount:       saved.staffCount       ?? '',
          salary:           saved.salary           ?? '',
          businessSource:   saved.businessSource   || '其他100%',
          otherIncome:      saved.otherIncome      || '',
          otherIncomeNote:  saved.otherIncomeNote  || '',
          note:             saved.note             || '',
        });
      } else if (actual) {
        setDeclForm({
          cardTotal:        Math.round(actual.payCard) || '',
          roomPriceTotal:   Math.round(actual.revenueTotal) || '',
          subsidizedRooms:  '', avgRoomRate: actual.avgRoomRate || '',
          monthlyRoomCount: actual.roomCount || '', roomSuppliesCost: '',
          fbExpense: '', fitGuestCount: '', staffCount: '', salary: '',
          businessSource: actual.businessSourceAuto || '其他100%',
          otherIncome: '', otherIncomeNote: '', note: '',
        });
      }
    } catch { setDeclError('載入旅宿網申報資料失敗，請稍後再試'); }
    finally { setDeclLoading(false); }
  }, [declMonth, declWarehouse]);

  function handleAutoFillDecl() {
    if (!declActual) { showToast('請先查詢實際資料', 'error'); return; }
    setDeclForm(prev => ({
      ...prev,
      cardTotal:        Math.round(declActual.payCard) || '',
      roomPriceTotal:   Math.round(declActual.revenueTotal) || '',
      avgRoomRate:      declActual.avgRoomRate || prev.avgRoomRate || '',
      monthlyRoomCount: declActual.roomCount || '',
      businessSource:   declActual.businessSourceAuto || prev.businessSource || '',
    }));
    showToast('已從實際資料帶入可計算的欄位', 'success');
  }

  async function handleDeclSave() {
    setDeclSaving(true);
    try {
      const res = await fetch('/api/bnb/monthly-report', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...declForm, reportMonth: declMonth, warehouse: declWarehouse }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        showToast(err.error || '儲存失敗', 'error');
        return;
      }
      showToast('月報已儲存', 'success');
      onSaved?.();
    } finally { setDeclSaving(false); }
  }

  return {
    declMonth, setDeclMonth, declWarehouse, setDeclWarehouse,
    declActual, declForm, setDeclForm, declSaving,
    declLoading, declSearched, setDeclSearched, declError,
    fetchDecl, handleAutoFillDecl, handleDeclSave,
  };
}
