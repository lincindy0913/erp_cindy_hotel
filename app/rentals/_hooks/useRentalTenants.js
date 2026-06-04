'use client';

import { useState } from 'react';
import { useToast } from '@/context/ToastContext';
import { useConfirm } from '@/context/ConfirmContext';
import { useColumnSort } from '@/components/SortableTh';
import { localDateStr } from '@/lib/localDate';

export function useRentalTenants({ onAfterSave } = {}) {
  const { showToast } = useToast();
  const confirm = useConfirm();

  const [tenants,                setTenants]                = useState([]);
  const [tenantsError,           setTenantsError]           = useState(null);
  const [tenantSearch,           setTenantSearch]           = useState('');
  const { sortKey: tenantSortKey, sortDir: tenantSortDir, toggleSort: tenantToggleSort } = useColumnSort('tenantCode', 'asc');
  const [showTenantModal,        setShowTenantModal]        = useState(false);
  const [editingTenant,          setEditingTenant]          = useState(null);
  const [contractPropertyChanges,setContractPropertyChanges]= useState({});
  const [tenantForm,             setTenantForm]             = useState({
    tenantCode: '', tenantType: 'individual',
    fullName: '', companyName: '', taxId: '', representativeName: '',
    idNumber: '', birthDate: '',
    phone: '', phone2: '', email: '', address: '',
    emergencyContact: '', emergencyPhone: '',
    bankCode: '', bankBranch: '', bankAccountName: '', bankAccountNumber: '',
    isBlacklisted: false, blacklistReason: '', creditNote: '', note: '',
    leaseStatus: 'active',
    initPropertyId: '', initMonthlyRent: '', initStartDate: '', initRentAccountId: '', initPaymentDueDay: '5',
  });
  const [tenantSaving,      setTenantSaving]      = useState(false);
  const [initContractErrors,setInitContractErrors]= useState(new Set());
  const [terminateModal,    setTerminateModal]    = useState(null);

  async function fetchTenants() {
    try {
      const params = new URLSearchParams();
      if (tenantSearch) params.set('search', tenantSearch);
      const res = await fetch(`/api/rentals/tenants?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setTenantsError(null);
      setTenants(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error('[fetchTenants]', e);
      setTenantsError('承租人資料載入失敗，請重試。');
      setTenants([]);
    }
  }

  function openTenantModal(tenant = null) {
    setContractPropertyChanges({});
    if (tenant) {
      setEditingTenant(tenant);
      setTenantForm({
        tenantCode: tenant.tenantCode || '',
        tenantType: tenant.tenantType || 'individual',
        fullName: tenant.fullName || '', companyName: tenant.companyName || '',
        taxId: tenant.taxId || '', representativeName: tenant.representativeName || '',
        idNumber: tenant.idNumber || '', birthDate: tenant.birthDate || '',
        phone: tenant.phone || '', phone2: tenant.phone2 || '',
        email: tenant.email || '', address: tenant.address || '',
        emergencyContact: tenant.emergencyContact || '', emergencyPhone: tenant.emergencyPhone || '',
        bankCode: tenant.bankCode || '', bankBranch: tenant.bankBranch || '',
        bankAccountName: tenant.bankAccountName || '', bankAccountNumber: tenant.bankAccountNumber || '',
        isBlacklisted: tenant.isBlacklisted || false, blacklistReason: tenant.blacklistReason || '',
        creditNote: tenant.creditNote || '', note: tenant.note || '',
        leaseStatus: tenant.leaseStatus || 'active',
        initPropertyId: '', initMonthlyRent: '', initStartDate: '', initRentAccountId: '', initPaymentDueDay: '5',
      });
      const initChanges = {};
      (tenant.contracts || []).forEach(c => {
        if (c.property?.id) initChanges[c.id] = String(c.property.id);
      });
      setContractPropertyChanges(initChanges);
      setInitContractErrors(new Set());
    } else {
      setEditingTenant(null);
      setInitContractErrors(new Set());
      setTenantForm({
        tenantCode: '', tenantType: 'individual',
        fullName: '', companyName: '', taxId: '', representativeName: '',
        idNumber: '', birthDate: '',
        phone: '', phone2: '', email: '', address: '',
        emergencyContact: '', emergencyPhone: '',
        bankCode: '', bankBranch: '', bankAccountName: '', bankAccountNumber: '',
        isBlacklisted: false, blacklistReason: '', creditNote: '', note: '',
        leaseStatus: 'active',
        initPropertyId: '', initMonthlyRent: '', initStartDate: '', initRentAccountId: '', initPaymentDueDay: '5',
      });
    }
    setShowTenantModal(true);
  }

  async function saveTenant() {
    setTenantSaving(true);
    const stepErrors = [];
    let tenantSaved = false;

    try {
      if (tenantForm.initPropertyId) {
        const missing = new Set();
        if (!tenantForm.initMonthlyRent || Number(tenantForm.initMonthlyRent) <= 0) missing.add('initMonthlyRent');
        if (!tenantForm.initStartDate) missing.add('initStartDate');
        if (!tenantForm.initRentAccountId) missing.add('initRentAccountId');
        if (missing.size > 0) {
          setInitContractErrors(missing);
          const labels = [...missing].map(f => ({ initMonthlyRent: '月租金', initStartDate: '開始日期', initRentAccountId: '收租帳戶' }[f])).join('、');
          showToast(`物業已選取，請補齊必填欄位：${labels}`, 'error');
          setTenantSaving(false);
          return;
        }
      }
      setInitContractErrors(new Set());

      const url = editingTenant ? `/api/rentals/tenants/${editingTenant.id}` : '/api/rentals/tenants';
      const method = editingTenant ? 'PUT' : 'POST';
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(tenantForm) });
      const data = await res.json();
      if (!res.ok) return showToast(data.error || '租客儲存失敗', 'error');
      tenantSaved = true;

      if (tenantForm.initPropertyId && tenantForm.initMonthlyRent && tenantForm.initStartDate && tenantForm.initRentAccountId) {
        const targetTenantId = editingTenant ? editingTenant.id : data.id;
        const sd = tenantForm.initStartDate;
        const sdDate = new Date(sd);
        sdDate.setFullYear(sdDate.getFullYear() + 1);
        const origMonth = parseInt(sd.slice(5, 7), 10);
        if (origMonth !== sdDate.getMonth() + 1) sdDate.setDate(0);
        const ed = localDateStr(sdDate);
        const contractRes = await fetch('/api/rentals/contracts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            propertyId: parseInt(tenantForm.initPropertyId),
            tenantId: targetTenantId,
            startDate: sd, endDate: ed,
            monthlyRent: parseFloat(tenantForm.initMonthlyRent),
            paymentDueDay: parseInt(tenantForm.initPaymentDueDay) || 5,
            rentAccountId: parseInt(tenantForm.initRentAccountId),
            status: 'pending',
          }),
        });
        if (!contractRes.ok) {
          const contractErr = await contractRes.json().catch(() => ({}));
          stepErrors.push(`建立合約失敗：${contractErr.error || '請至合約管理手動補建'}`);
        }
      }

      if (editingTenant) {
        const origContracts = editingTenant.contracts || [];
        for (const [cIdStr, newPropId] of Object.entries(contractPropertyChanges)) {
          const orig = origContracts.find(c => String(c.id) === cIdStr);
          if (orig && newPropId && String(orig.property?.id) !== String(newPropId)) {
            const propRes = await fetch(`/api/rentals/contracts/${cIdStr}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ propertyId: parseInt(newPropId) }),
            });
            if (!propRes.ok) {
              const propErr = await propRes.json().catch(() => ({}));
              stepErrors.push(`合約 #${cIdStr} 物業更換失敗：${propErr.error || '未知錯誤'}`);
            }
          }
        }
      }

      if (stepErrors.length > 0) {
        showToast(`租客已儲存，但有 ${stepErrors.length} 個步驟失敗：${stepErrors[0]}`, 'error');
      } else {
        showToast(editingTenant ? '租客資料已更新' : '租客已新增', 'success');
      }
      setShowTenantModal(false);
      fetchTenants();
      onAfterSave?.();
    } catch (err) {
      if (tenantSaved) {
        showToast(`租客已儲存，但後續操作發生例外：${err.message}`, 'error');
        setShowTenantModal(false);
        fetchTenants();
        onAfterSave?.();
      } else {
        showToast('儲存失敗: ' + err.message, 'error');
      }
    } finally {
      setTenantSaving(false);
    }
  }

  function deleteTenant(id) {
    confirm('確定要刪除此租客？', async () => {
      try {
        const res = await fetch(`/api/rentals/tenants/${id}`, { method: 'DELETE' });
        const data = await res.json();
        if (!res.ok) return showToast(data.error || '刪除失敗', 'error');
        fetchTenants();
      } catch (err) { showToast('刪除失敗: ' + err.message, 'error'); }
    }, '刪除租客');
  }

  async function terminateContract(contractId, endDate) {
    const tenantId = terminateModal?.tenant?.id;
    try {
      const res = await fetch(`/api/rentals/contracts/${contractId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'terminated', endDate }),
      });
      if (!res.ok) { const d = await res.json(); showToast(d.error || '操作失敗', 'error'); return; }
      showToast('合約已終止（退租完成）', 'success');
      setTerminateModal(null);
      fetchTenants();
      onAfterSave?.();
      if (tenantId) {
        const freshRes = await fetch(`/api/rentals/tenants/${tenantId}`);
        if (freshRes.ok) openTenantModal(await freshRes.json());
        else showToast('重新載入租客資料失敗', 'error');
      }
    } catch (e) { showToast('操作失敗: ' + e.message, 'error'); }
  }

  return {
    tenants, setTenants, tenantsError,
    tenantSearch, setTenantSearch,
    tenantSortKey, tenantSortDir, tenantToggleSort,
    showTenantModal, setShowTenantModal,
    editingTenant, setEditingTenant,
    contractPropertyChanges, setContractPropertyChanges,
    tenantForm, setTenantForm,
    tenantSaving,
    initContractErrors, setInitContractErrors,
    terminateModal, setTerminateModal,
    fetchTenants,
    openTenantModal,
    saveTenant,
    deleteTenant,
    terminateContract,
  };
}
