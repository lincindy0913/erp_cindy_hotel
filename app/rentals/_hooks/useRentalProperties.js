'use client';

import { useState, useMemo, useCallback, useRef } from 'react';
import { useToast } from '@/context/ToastContext';

const CONTRACT_INCOME_CATEGORIES = ['公司', '湯三姐'];

export function useRentalProperties({ onInlineEditSaved } = {}) {
  const { showToast } = useToast();

  const [properties,        setProperties]        = useState([]);
  const [propertiesError,   setPropertiesError]   = useState(null);
  const [propInlineEdit,    setPropInlineEdit]    = useState(null); // { propertyId, field, value }
  const [propInlineSaving,  setPropInlineSaving]  = useState(false);
  const [showPropertyModal, setShowPropertyModal] = useState(false);
  const [editingProperty,   setEditingProperty]   = useState(null);
  const [propertyForm,      setPropertyForm]      = useState({
    name: '', address: '', buildingName: '', unitNo: '', ownerName: '',
    houseTaxRegistrationNo: '', status: 'available', category: '', sortOrder: '',
    rentCollectAccountId: '', depositAccountId: '', note: '',
    collectUtilityFee: false, publicInterestLandlord: false,
    publicInterestApplicant: '', publicInterestNote: '',
    publicInterestStartDate: '', publicInterestEndDate: '', publicInterestRent: '',
  });
  const [propertySaving,    setPropertySaving]    = useState(false);
  const editPropertyOpenedRef = useRef(false);

  const reportCategoryOptions = useMemo(() => {
    const seen = new Set();
    const result = [];
    properties.forEach(p => {
      if (p.category && !seen.has(p.category)) {
        seen.add(p.category);
        result.push({ value: p.category, label: p.category });
      }
    });
    result.sort((a, b) => a.label.localeCompare(b.label, 'zh-Hant'));
    return result;
  }, [properties]);

  async function fetchProperties() {
    try {
      const res = await fetch('/api/rentals/properties');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setPropertiesError(null);
      setProperties(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error('[fetchProperties]', e);
      setPropertiesError('物件資料載入失敗，請重試。');
      setProperties([]);
    }
  }

  async function savePropField(propertyId, field, value) {
    setPropInlineSaving(true);
    try {
      const body = {};
      if (field === 'sortOrder') body.sortOrder = value !== '' && value !== null ? parseInt(value) : null;
      else body.category = value || null;
      const res = await fetch(`/api/rentals/properties/${propertyId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) { showToast('儲存失敗', 'error'); return; }
      const apiField = field === 'category' ? 'contractCategory' : 'contractSortOrder';
      const parsed = field === 'sortOrder'
        ? (value !== '' && value !== null ? parseInt(value) : null)
        : (value || null);
      onInlineEditSaved?.(propertyId, apiField, parsed);
    } catch { showToast('儲存失敗', 'error'); }
    finally { setPropInlineSaving(false); setPropInlineEdit(null); }
  }

  const openPropertyModal = useCallback((property) => {
    if (!property) return;
    setEditingProperty(property);
    setPropertyForm({
      name: property.name || '', address: property.address || '',
      buildingName: property.buildingName || '', unitNo: property.unitNo || '',
      ownerName: property.ownerName || '', houseTaxRegistrationNo: property.houseTaxRegistrationNo || '',
      status: property.status || 'available',
      category: property.category || '', sortOrder: property.sortOrder != null ? String(property.sortOrder) : '',
      rentCollectAccountId: property.rentCollectAccountId || '', depositAccountId: property.depositAccountId || '',
      note: property.note || '', collectUtilityFee: property.collectUtilityFee || false,
      publicInterestLandlord: property.publicInterestLandlord || false,
      publicInterestApplicant: property.publicInterestApplicant || '',
      publicInterestNote: property.publicInterestNote || '',
      publicInterestStartDate: property.publicInterestStartDate || '',
      publicInterestEndDate: property.publicInterestEndDate || '',
      publicInterestRent: property.publicInterestRent != null ? String(property.publicInterestRent) : '',
    });
    setShowPropertyModal(true);
  }, []);

  async function saveProperty() {
    setPropertySaving(true);
    try {
      if (!editingProperty) {
        showToast('請從資產管理建立或綁定物業', 'error');
        return;
      }
      const res = await fetch(`/api/rentals/properties/${editingProperty.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(propertyForm),
      });
      const data = await res.json();
      if (!res.ok) return showToast(data.error || '儲存失敗', 'error');
      setShowPropertyModal(false);
      fetchProperties();
    } catch (err) { showToast('儲存失敗: ' + err.message, 'error'); }
    finally { setPropertySaving(false); }
  }

  return {
    properties, setProperties, propertiesError,
    propInlineEdit, setPropInlineEdit,
    propInlineSaving,
    CONTRACT_INCOME_CATEGORIES,
    reportCategoryOptions,
    showPropertyModal, setShowPropertyModal,
    editingProperty, setEditingProperty,
    propertyForm, setPropertyForm,
    propertySaving,
    editPropertyOpenedRef,
    fetchProperties,
    savePropField,
    openPropertyModal,
    saveProperty,
  };
}
