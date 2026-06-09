'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useToast } from '@/context/ToastContext';
import { useConfirm } from '@/context/ConfirmContext';
import { sortRows, useColumnSort } from '@/components/SortableTh';
import { todayStr, localDateStr, parseLocalDate } from '@/lib/localDate';

export const CHECK_SORT_ACCESSORS = {
  status: (c) => c.status || '',
  checkNumber: (c) => c.checkNumber || '',
  checkTypeLabel: (c) => (c.checkType === 'payable' ? '應付' : '應收'),
  amount: (c) => Number(c.amount || 0),
  dueDate: (c) => c.dueDate || '',
  account: (c) => (c.checkType === 'payable' ? c.sourceAccount?.name || '' : c.destinationAccount?.name || ''),
  warehouse: (c) => c.warehouse || '',
};

export function useChecks() {
  const { showToast } = useToast();
  const confirm = useConfirm();

  const [activeTab, setActiveTab] = useState('pending');
  const [checks, setChecks] = useState([]);
  const [checksPagination, setChecksPagination] = useState({ page: 1, pageSize: 50, total: 0, totalPages: 1 });
  const [summary, setSummary] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [checksError, setChecksError] = useState(null);

  // Modal states
  const [showAddModal, setShowAddModal] = useState(false);
  const [deletingCheckId, setDeletingCheckId] = useState(null);
  const [showClearModal, setShowClearModal] = useState(false);
  const [showBounceModal, setShowBounceModal] = useState(false);
  const [showVoidModal, setShowVoidModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedCheck, setSelectedCheck] = useState(null);

  // Batch clear
  const [selectedIds, setSelectedIds] = useState([]);
  const [showBatchClearModal, setShowBatchClearModal] = useState(false);
  const [batchClearDate, setBatchClearDate] = useState(() => todayStr());

  // Filters
  const [filterStatus, setFilterStatus] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [filterSupplierId, setFilterSupplierId] = useState('');

  // Add/Edit form
  const [addForm, setAddForm] = useState({
    checkType: 'payable', checkNumber: '', amount: '', dueDate: '',
    issueDate: '', sourceAccountId: '', destinationAccountId: '',
    drawerName: '', payeeName: '', supplierId: '', warehouse: '',
    bankName: '', bankBranch: '', note: ''
  });

  // Clear form
  const [clearForm, setClearForm] = useState({ clearDate: '', actualAmount: '', clearedBy: '' });

  // Bounce/void reason
  const [actionReason, setActionReason] = useState('');

  // Loading states
  const [reissueLoading, setReissueLoading] = useState(null);
  const [checkSaving, setCheckSaving] = useState(false);
  const [clearSaving, setClearSaving] = useState(false);

  // Schedule view
  const [scheduleRange, setScheduleRange] = useState(30);

  // Stats
  const [statsYear, setStatsYear] = useState(new Date().getFullYear());
  const [statsMonth, setStatsMonth] = useState(new Date().getMonth() + 1);
  const [monthlyStats, setMonthlyStats] = useState(null);

  // ---- Data fetching ----
  const fetchChecks = useCallback(async (params = {}) => {
    setLoading(true);
    try {
      const query = new URLSearchParams();
      if (params.checkType) query.set('checkType', params.checkType);
      if (params.status) query.set('status', params.status);
      if (params.dueDateFrom) query.set('dueDateFrom', params.dueDateFrom);
      if (params.dueDateTo) query.set('dueDateTo', params.dueDateTo);
      if (params.supplierId) query.set('supplierId', params.supplierId);
      query.set('page', params.page || '1');
      query.set('pageSize', params.pageSize || '50');
      const res = await fetch(`/api/checks?${query}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setChecksError(null);
      setChecks(Array.isArray(json.data) ? json.data : []);
      if (json.pagination) setChecksPagination(json.pagination);
    } catch (e) {
      console.error('[fetchChecks]', e);
      setChecksError('支票資料載入失敗，請重試。');
      setChecks([]);
    }
    setLoading(false);
  }, []);

  const fetchSummary = useCallback(async () => {
    try {
      const q = new URLSearchParams();
      if (statsYear) q.set('year', statsYear);
      if (statsMonth) q.set('month', statsMonth);
      const res = await fetch(`/api/checks/summary?${q}`);
      const data = await res.json();
      setSummary(data);
      if (data.monthlyStats) setMonthlyStats(data.monthlyStats);
    } catch (e) { console.error(e); }
  }, [statsYear, statsMonth]);

  const fetchAccounts = useCallback(async () => {
    try {
      const res = await fetch('/api/cashflow/accounts');
      const data = await res.json();
      setAccounts(Array.isArray(data) ? data : []);
    } catch (e) { console.error(e); }
  }, []);

  const fetchSuppliers = useCallback(async () => {
    try {
      const res = await fetch('/api/suppliers?all=true');
      const data = await res.json();
      setSuppliers(Array.isArray(data) ? data : []);
    } catch (e) { console.error(e); }
  }, []);

  useEffect(() => {
    fetchAccounts();
    fetchSuppliers();
  }, [fetchAccounts, fetchSuppliers]);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  useEffect(() => {
    if (activeTab === 'pending') {
      fetchChecks({ status: 'pending,due' });
    } else if (activeTab === 'payable') {
      const params = { checkType: 'payable' };
      if (filterStatus) params.status = filterStatus;
      if (filterDateFrom) params.dueDateFrom = filterDateFrom;
      if (filterDateTo) params.dueDateTo = filterDateTo;
      if (filterSupplierId) params.supplierId = filterSupplierId;
      fetchChecks(params);
    } else if (activeTab === 'receivable') {
      const params = { checkType: 'receivable' };
      if (filterStatus) params.status = filterStatus;
      if (filterDateFrom) params.dueDateFrom = filterDateFrom;
      if (filterDateTo) params.dueDateTo = filterDateTo;
      fetchChecks(params);
    } else if (activeTab === 'schedule') {
      fetchChecks({});
    } else if (activeTab === 'stats') {
      fetchChecks({});
      fetchSummary();
    }
  }, [activeTab, filterStatus, filterDateFrom, filterDateTo, filterSupplierId, fetchChecks, fetchSummary]);

  // ---- Pagination ----
  const goToPage = (newPage) => {
    const params = {};
    if (activeTab === 'payable' || activeTab === 'receivable') params.checkType = activeTab === 'payable' ? 'payable' : 'receivable';
    if (filterStatus) params.status = filterStatus;
    if (filterDateFrom) params.dueDateFrom = filterDateFrom;
    if (filterDateTo) params.dueDateTo = filterDateTo;
    if (filterSupplierId) params.supplierId = filterSupplierId;
    params.page = newPage;
    fetchChecks(params);
  };

  // ---- Form helpers ----
  const resetAddForm = () => {
    setAddForm({
      checkType: 'payable', checkNumber: '', amount: '', dueDate: '',
      issueDate: '', sourceAccountId: '', destinationAccountId: '',
      drawerName: '', payeeName: '', supplierId: '', warehouse: '',
      bankName: '', bankBranch: '', note: ''
    });
  };

  // ---- CRUD Handlers ----
  const handleAdd = async () => {
    if (!addForm.checkNumber?.trim()) { showToast('請填寫支票號碼', 'error'); return; }
    if (!addForm.amount || parseFloat(addForm.amount) <= 0) { showToast('請填寫有效金額', 'error'); return; }
    if (!addForm.dueDate) { showToast('請填寫到期日', 'error'); return; }
    if (addForm.checkType === 'payable' && !addForm.sourceAccountId) { showToast('應付支票必須選擇來源帳戶', 'error'); return; }
    if (addForm.checkType === 'receivable' && !addForm.destinationAccountId) { showToast('應收支票必須選擇目的帳戶', 'error'); return; }

    setCheckSaving(true);
    try {
      const res = await fetch('/api/checks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(addForm)
      });
      if (!res.ok) {
        const err = await res.json();
        showToast(err.error || '新增失敗', 'error');
        return;
      }
      setShowAddModal(false);
      resetAddForm();
      fetchChecks(activeTab === 'payable' ? { checkType: 'payable' } : activeTab === 'receivable' ? { checkType: 'receivable' } : {});
      fetchSummary();
    } catch (e) { showToast('新增失敗: ' + e.message, 'error'); }
    finally { setCheckSaving(false); }
  };

  const handleClear = async () => {
    if (!selectedCheck) return;
    setClearSaving(true);
    try {
      const res = await fetch(`/api/checks/${selectedCheck.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'clear',
          clearDate: clearForm.clearDate || undefined,
          actualAmount: clearForm.actualAmount || undefined,
          clearedBy: clearForm.clearedBy || undefined
        })
      });
      if (!res.ok) {
        const err = await res.json();
        showToast(err.error || err.message || '兌現失敗', 'error');
        return;
      }
      setShowClearModal(false);
      setSelectedCheck(null);
      setClearForm({ clearDate: '', actualAmount: '', clearedBy: '' });
      fetchChecks(activeTab === 'pending' ? {} : { checkType: activeTab });
      fetchSummary();
    } catch (e) { showToast('兌現失敗: ' + e.message, 'error'); }
    finally { setClearSaving(false); }
  };

  const handleBounce = async () => {
    if (!selectedCheck) return;
    try {
      const res = await fetch(`/api/checks/${selectedCheck.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'bounce', bouncedReason: actionReason })
      });
      if (!res.ok) {
        const err = await res.json();
        showToast(err.error || '退票失敗', 'error');
        return;
      }
      setShowBounceModal(false);
      setSelectedCheck(null);
      setActionReason('');
      fetchChecks(activeTab === 'pending' ? {} : { checkType: activeTab });
      fetchSummary();
    } catch (e) { showToast('退票失敗: ' + e.message, 'error'); }
  };

  const handleReissue = async (bouncedCheck) => {
    if (!bouncedCheck || bouncedCheck.status !== 'bounced' || bouncedCheck.checkType !== 'payable') return;
    if ((bouncedCheck.reissuedByChecks || []).length > 0) {
      showToast('此退票已重新開票過，請至「應付支票」或「出納」查看新支票。', 'info');
      return;
    }
    setReissueLoading(bouncedCheck.id);
    try {
      const res = await fetch('/api/checks/reissue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bouncedCheckId: bouncedCheck.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || '重新開票失敗');
      fetchChecks();
      showToast(`${data.message}\n付款單號：${data.orderNo}\n請至「出納」執行付款，執行後新支票將顯示於本頁並可標記為已兌現。`, 'success');
      window.open('/cashier', '_blank');
    } catch (e) {
      showToast(e.message || '重新開票失敗', 'error');
    } finally {
      setReissueLoading(null);
    }
  };

  const handleVoid = async () => {
    if (!selectedCheck) return;
    try {
      const res = await fetch(`/api/checks/${selectedCheck.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'void', voidReason: actionReason })
      });
      if (!res.ok) {
        const err = await res.json();
        showToast(err.error || '作廢失敗', 'error');
        return;
      }
      setShowVoidModal(false);
      setSelectedCheck(null);
      setActionReason('');
      fetchChecks(activeTab === 'pending' ? {} : { checkType: activeTab });
      fetchSummary();
    } catch (e) { showToast('作廢失敗: ' + e.message, 'error'); }
  };

  const handleUpdate = async () => {
    if (!selectedCheck) return;
    if (!addForm.checkNumber?.trim()) { showToast('請填寫支票號碼', 'error'); return; }
    if (!addForm.amount || parseFloat(addForm.amount) <= 0) { showToast('請填寫有效金額', 'error'); return; }
    if (!addForm.dueDate) { showToast('請填寫到期日', 'error'); return; }

    setCheckSaving(true);
    try {
      const res = await fetch(`/api/checks/${selectedCheck.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(addForm)
      });
      if (!res.ok) {
        const err = await res.json();
        showToast(err.error || err.message || '更新失敗', 'error');
        return;
      }
      setShowEditModal(false);
      setSelectedCheck(null);
      resetAddForm();
      fetchChecks(activeTab === 'pending' ? {} : { checkType: activeTab });
    } catch (e) { showToast('更新失敗: ' + e.message, 'error'); }
    finally { setCheckSaving(false); }
  };

  const handleDelete = async (check) => {
    if (!(await confirm(`確定要刪除支票 ${check.checkNumber}？`, { title: '刪除確認', danger: true }))) return;
    setDeletingCheckId(check.id);
    try {
      const res = await fetch(`/api/checks/${check.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json();
        showToast(err.error || '刪除失敗', 'error');
        return;
      }
      fetchChecks(activeTab === 'pending' ? {} : { checkType: activeTab });
      fetchSummary();
    } catch (e) { showToast('刪除失敗: ' + e.message, 'error'); }
    finally { setDeletingCheckId(null); }
  };

  const openBatchClearModal = () => {
    if (selectedIds.length === 0) { showToast('請選擇要兌現的支票', 'error'); return; }
    setBatchClearDate(todayStr());
    setShowBatchClearModal(true);
  };

  const handleBatchClear = async () => {
    if (!batchClearDate || !batchClearDate.trim()) {
      showToast('請填寫兌現日', 'error');
      return;
    }
    try {
      const res = await fetch('/api/checks/batch-clear', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ checkIds: selectedIds, clearDate: batchClearDate.trim() })
      });
      const result = await res.json();
      showToast(result.message || '批次兌現完成', 'success');
      setShowBatchClearModal(false);
      setSelectedIds([]);
      fetchChecks({});
      fetchSummary();
    } catch (e) { showToast('批次兌現失敗: ' + e.message, 'error'); }
  };

  // ---- Open modal helpers ----
  const openEdit = (check) => {
    setSelectedCheck(check);
    setAddForm({
      checkType: check.checkType,
      checkNumber: check.checkNumber,
      amount: String(check.amount),
      dueDate: check.dueDate,
      issueDate: check.issueDate || '',
      sourceAccountId: check.sourceAccountId ? String(check.sourceAccountId) : '',
      destinationAccountId: check.destinationAccountId ? String(check.destinationAccountId) : '',
      drawerName: check.drawerName || '',
      payeeName: check.payeeName || '',
      supplierId: check.supplierId ? String(check.supplierId) : '',
      warehouse: check.warehouse || '',
      bankName: check.bankName || '',
      bankBranch: check.bankBranch || '',
      note: check.note || ''
    });
    setShowEditModal(true);
  };

  const openClear = (check) => {
    setSelectedCheck(check);
    setClearForm({ clearDate: todayStr(), actualAmount: String(check.amount), clearedBy: '' });
    setShowClearModal(true);
  };

  const openBounce = (check) => {
    setSelectedCheck(check);
    setActionReason('');
    setShowBounceModal(true);
  };

  const openVoid = (check) => {
    setSelectedCheck(check);
    setActionReason('');
    setShowVoidModal(true);
  };

  const toggleSelectId = (id) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  // ---- Derived / sorted data ----
  const pendingChecks = checks.filter(c => c.status === 'due' || c.status === 'pending');
  const pendingPayable = pendingChecks.filter(c => c.checkType === 'payable');
  const pendingReceivable = pendingChecks.filter(c => c.checkType === 'receivable');

  const { sortKey: chkPPk, sortDir: chkPPd, toggleSort: chkPPt } = useColumnSort('dueDate', 'asc');
  const sortedPendingPayable = useMemo(
    () => sortRows(pendingPayable, chkPPk, chkPPd, CHECK_SORT_ACCESSORS),
    [pendingPayable, chkPPk, chkPPd]
  );
  const { sortKey: chkPRk, sortDir: chkPRd, toggleSort: chkPRt } = useColumnSort('dueDate', 'asc');
  const sortedPendingReceivable = useMemo(
    () => sortRows(pendingReceivable, chkPRk, chkPRd, CHECK_SORT_ACCESSORS),
    [pendingReceivable, chkPRk, chkPRd]
  );
  const payableCrudList = useMemo(() => checks.filter((c) => c.checkType === 'payable'), [checks]);
  const receivableCrudList = useMemo(() => checks.filter((c) => c.checkType === 'receivable'), [checks]);
  const { sortKey: chkPayk, sortDir: chkPayd, toggleSort: chkPayt } = useColumnSort('dueDate', 'desc');
  const sortedPayableCrud = useMemo(
    () => sortRows(payableCrudList, chkPayk, chkPayd, CHECK_SORT_ACCESSORS),
    [payableCrudList, chkPayk, chkPayd]
  );
  const { sortKey: chkReck, sortDir: chkRecd, toggleSort: chkRect } = useColumnSort('dueDate', 'desc');
  const sortedReceivableCrud = useMemo(
    () => sortRows(receivableCrudList, chkReck, chkRecd, CHECK_SORT_ACCESSORS),
    [receivableCrudList, chkReck, chkRecd]
  );

  // Schedule data
  const getScheduleData = () => {
    const days = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayDateStr = localDateStr(today);

    const overdueChecks = checks.filter(c =>
      (c.status === 'pending' || c.status === 'due') && c.dueDate && c.dueDate < todayDateStr
    );
    if (overdueChecks.length > 0) {
      const payable = overdueChecks.filter(c => c.checkType === 'payable');
      const receivable = overdueChecks.filter(c => c.checkType === 'receivable');
      days.push({
        date: 'overdue', label: '逾期未兌現', dayOfWeek: -1, urgency: 'overdue',
        payable, receivable,
        payableTotal: payable.reduce((s, c) => s + Number(c.amount), 0),
        receivableTotal: receivable.reduce((s, c) => s + Number(c.amount), 0),
        net: receivable.reduce((s, c) => s + Number(c.amount), 0) - payable.reduce((s, c) => s + Number(c.amount), 0)
      });
    }

    for (let i = 0; i < scheduleRange; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() + i);
      const dateStr = localDateStr(d);
      const dayChecks = checks.filter(c =>
        c.dueDate === dateStr && (c.status === 'pending' || c.status === 'due')
      );
      const payable = dayChecks.filter(c => c.checkType === 'payable');
      const receivable = dayChecks.filter(c => c.checkType === 'receivable');
      const payableTotal = payable.reduce((s, c) => s + Number(c.amount), 0);
      const receivableTotal = receivable.reduce((s, c) => s + Number(c.amount), 0);
      let urgency = 'later';
      if (i === 0) urgency = 'today';
      else if (i <= 3) urgency = 'soon';
      else if (i <= 7) urgency = 'upcoming';
      days.push({ date: dateStr, dayOfWeek: d.getDay(), urgency, payable, receivable, payableTotal, receivableTotal, net: receivableTotal - payableTotal });
    }
    return days;
  };

  return {
    // Tab
    activeTab, setActiveTab,
    // Data
    checks, accounts, suppliers, summary, monthlyStats,
    loading, checksError,
    checksPagination,
    // Modal open/close flags
    showAddModal, setShowAddModal,
    showEditModal, setShowEditModal,
    showClearModal, setShowClearModal,
    showBounceModal, setShowBounceModal,
    showVoidModal, setShowVoidModal,
    showBatchClearModal, setShowBatchClearModal,
    selectedCheck, setSelectedCheck,
    // Forms
    addForm, setAddForm,
    clearForm, setClearForm,
    actionReason, setActionReason,
    batchClearDate, setBatchClearDate,
    // Loading flags
    checkSaving, setCheckSaving, clearSaving, deletingCheckId, reissueLoading,
    // Filters
    filterStatus, setFilterStatus,
    filterDateFrom, setFilterDateFrom,
    filterDateTo, setFilterDateTo,
    filterSupplierId, setFilterSupplierId,
    // Schedule / Stats
    scheduleRange, setScheduleRange,
    statsYear, setStatsYear,
    statsMonth, setStatsMonth,
    // Handlers
    fetchChecks, fetchSummary,
    goToPage,
    resetAddForm,
    handleAdd, handleUpdate, handleDelete,
    handleClear, handleBounce, handleVoid, handleReissue,
    openEdit, openClear, openBounce, openVoid,
    openBatchClearModal, handleBatchClear,
    selectedIds, setSelectedIds, toggleSelectId,
    // Derived sorted lists
    sortedPendingPayable, chkPPk, chkPPd, chkPPt,
    sortedPendingReceivable, chkPRk, chkPRd, chkPRt,
    sortedPayableCrud, chkPayk, chkPayd, chkPayt,
    sortedReceivableCrud, chkReck, chkRecd, chkRect,
    pendingPayable, pendingReceivable,
    getScheduleData,
  };
}
