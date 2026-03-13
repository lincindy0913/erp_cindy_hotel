'use client';

import { useState, useEffect, useCallback } from 'react';
import Navigation from '@/components/Navigation';
import NotificationBanner from '@/components/NotificationBanner';
import ExportButtons from '@/components/ExportButtons';
import { EXPORT_CONFIGS } from '@/lib/export-columns';

const TABS = [
  { key: 'pending', label: '待兌現' },
  { key: 'payable', label: '應付支票' },
  { key: 'receivable', label: '應收支票' },
  { key: 'schedule', label: '到期日程' },
  { key: 'stats', label: '統計報表' }
];

const STATUS_MAP = {
  pending: { label: '待處理', color: 'bg-gray-100 text-gray-700' },
  due: { label: '到期', color: 'bg-orange-100 text-orange-700' },
  cleared: { label: '已兌現', color: 'bg-green-100 text-green-700' },
  bounced: { label: '退票', color: 'bg-red-100 text-red-700' },
  void: { label: '作廢', color: 'bg-gray-300 text-gray-600' }
};

function StatusBadge({ status }) {
  const info = STATUS_MAP[status] || { label: status, color: 'bg-gray-100 text-gray-700' };
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${info.color}`}>
      {info.label}
    </span>
  );
}

function getDueDateColor(dueDate) {
  if (!dueDate) return '';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dueDate + 'T00:00:00');
  const diffDays = Math.ceil((due - today) / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return 'text-red-600 font-bold';
  if (diffDays === 0) return 'text-red-600 font-bold';
  if (diffDays <= 3) return 'text-orange-600 font-semibold';
  if (diffDays <= 7) return 'text-yellow-600';
  if (diffDays <= 30) return 'text-gray-600';
  return 'text-gray-500';
}

function getDueDateLabel(dueDate) {
  if (!dueDate) return '';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dueDate + 'T00:00:00');
  const diffDays = Math.ceil((due - today) / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return `(逾期 ${Math.abs(diffDays)} 天)`;
  if (diffDays === 0) return '(今日到期)';
  if (diffDays <= 7) return `(${diffDays} 天後到期)`;
  return '';
}

function formatAmount(val) {
  const n = Number(val) || 0;
  return n.toLocaleString('zh-TW', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

// ============== Modal Component ==============
function Modal({ isOpen, onClose, title, children, width = 'max-w-lg' }) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40 no-print">
      <div className={`bg-white rounded-xl shadow-2xl ${width} w-full mx-4 max-h-[90vh] overflow-y-auto`}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-bold text-gray-800">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
        </div>
        <div className="px-6 py-4">{children}</div>
      </div>
    </div>
  );
}

// ============== Main Page ==============
export default function ChecksPage() {
  const [activeTab, setActiveTab] = useState('pending');
  const [checks, setChecks] = useState([]);
  const [summary, setSummary] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(false);

  // Modal states
  const [showAddModal, setShowAddModal] = useState(false);
  const [showClearModal, setShowClearModal] = useState(false);
  const [showBounceModal, setShowBounceModal] = useState(false);
  const [showVoidModal, setShowVoidModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showPrintSheetModal, setShowPrintSheetModal] = useState(false);
  const [selectedCheck, setSelectedCheck] = useState(null);

  // Batch clear：未兌現 TAB 批次兌現時需填寫兌現日
  const [selectedIds, setSelectedIds] = useState([]);
  const [showBatchClearModal, setShowBatchClearModal] = useState(false);
  const [batchClearDate, setBatchClearDate] = useState(() => new Date().toISOString().split('T')[0]);

  // Filters
  const [filterStatus, setFilterStatus] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [filterSupplierId, setFilterSupplierId] = useState('');

  // Add form
  const [addForm, setAddForm] = useState({
    checkType: 'payable', checkNumber: '', amount: '', dueDate: '',
    issueDate: '', sourceAccountId: '', destinationAccountId: '',
    drawerName: '', payeeName: '', supplierId: '', warehouse: '',
    bankName: '', bankBranch: '', note: ''
  });

  // Clear form
  const [clearForm, setClearForm] = useState({ clearDate: '', actualAmount: '', clearedBy: '' });

  // Bounce/void form
  const [actionReason, setActionReason] = useState('');

  // Reissue (重新開票) loading
  const [reissueLoading, setReissueLoading] = useState(null);

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
      const res = await fetch(`/api/checks?${query}`);
      const data = await res.json();
      setChecks(Array.isArray(data) ? data : []);
    } catch (e) { console.error(e); }
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
      const res = await fetch('/api/suppliers');
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
      fetchChecks({ status: '' }); // Fetch all, filter in UI
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

  // ---- Handlers ----
  const resetAddForm = () => {
    setAddForm({
      checkType: 'payable', checkNumber: '', amount: '', dueDate: '',
      issueDate: '', sourceAccountId: '', destinationAccountId: '',
      drawerName: '', payeeName: '', supplierId: '', warehouse: '',
      bankName: '', bankBranch: '', note: ''
    });
  };

  const handleAdd = async () => {
    try {
      const res = await fetch('/api/checks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(addForm)
      });
      if (!res.ok) {
        const err = await res.json();
        alert(err.error || '新增失敗');
        return;
      }
      setShowAddModal(false);
      resetAddForm();
      fetchChecks(activeTab === 'payable' ? { checkType: 'payable' } : activeTab === 'receivable' ? { checkType: 'receivable' } : {});
      fetchSummary();
    } catch (e) { alert('新增失敗: ' + e.message); }
  };

  const handleClear = async () => {
    if (!selectedCheck) return;
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
        alert(err.error || err.message || '兌現失敗');
        return;
      }
      setShowClearModal(false);
      setSelectedCheck(null);
      setClearForm({ clearDate: '', actualAmount: '', clearedBy: '' });
      fetchChecks(activeTab === 'pending' ? {} : { checkType: activeTab });
      fetchSummary();
    } catch (e) { alert('兌現失敗: ' + e.message); }
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
        alert(err.error || '退票失敗');
        return;
      }
      setShowBounceModal(false);
      setSelectedCheck(null);
      setActionReason('');
      fetchChecks(activeTab === 'pending' ? {} : { checkType: activeTab });
      fetchSummary();
    } catch (e) { alert('退票失敗: ' + e.message); }
  }

  const handleReissue = async (bouncedCheck) => {
    if (!bouncedCheck || bouncedCheck.status !== 'bounced' || bouncedCheck.checkType !== 'payable') return;
    if ((bouncedCheck.reissuedByChecks || []).length > 0) {
      alert('此退票已重新開票過，請至「應付支票」或「出納」查看新支票。');
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
      alert(`${data.message}\n付款單號：${data.orderNo}\n請至「出納」執行付款，執行後新支票將顯示於本頁並可標記為已兌現。`);
      window.open('/cashier', '_blank');
    } catch (e) {
      alert(e.message || '重新開票失敗');
    } finally {
      setReissueLoading(null);
    }
  };;

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
        alert(err.error || '作廢失敗');
        return;
      }
      setShowVoidModal(false);
      setSelectedCheck(null);
      setActionReason('');
      fetchChecks(activeTab === 'pending' ? {} : { checkType: activeTab });
      fetchSummary();
    } catch (e) { alert('作廢失敗: ' + e.message); }
  };

  const handleUpdate = async () => {
    if (!selectedCheck) return;
    try {
      const res = await fetch(`/api/checks/${selectedCheck.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(addForm)
      });
      if (!res.ok) {
        const err = await res.json();
        alert(err.error || err.message || '更新失敗');
        return;
      }
      setShowEditModal(false);
      setSelectedCheck(null);
      resetAddForm();
      fetchChecks(activeTab === 'pending' ? {} : { checkType: activeTab });
    } catch (e) { alert('更新失敗: ' + e.message); }
  };

  const handleDelete = async (check) => {
    if (!confirm(`確定要刪除支票 ${check.checkNumber}？`)) return;
    try {
      const res = await fetch(`/api/checks/${check.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json();
        alert(err.error || '刪除失敗');
        return;
      }
      fetchChecks(activeTab === 'pending' ? {} : { checkType: activeTab });
      fetchSummary();
    } catch (e) { alert('刪除失敗: ' + e.message); }
  };

  const openBatchClearModal = () => {
    if (selectedIds.length === 0) { alert('請選擇要兌現的支票'); return; }
    setBatchClearDate(new Date().toISOString().split('T')[0]);
    setShowBatchClearModal(true);
  };

  const handleBatchClear = async () => {
    if (!batchClearDate || !batchClearDate.trim()) {
      alert('請填寫兌現日');
      return;
    }
    try {
      const res = await fetch('/api/checks/batch-clear', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          checkIds: selectedIds,
          clearDate: batchClearDate.trim()
        })
      });
      const result = await res.json();
      alert(result.message || '批次兌現完成');
      setShowBatchClearModal(false);
      setSelectedIds([]);
      fetchChecks({});
      fetchSummary();
    } catch (e) { alert('批次兌現失敗: ' + e.message); }
  };

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
    setClearForm({
      clearDate: new Date().toISOString().split('T')[0],
      actualAmount: String(check.amount),
      clearedBy: ''
    });
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

  // ---- Derived data ----
  const pendingChecks = checks.filter(c => c.status === 'due' || c.status === 'pending');
  const pendingPayable = pendingChecks.filter(c => c.checkType === 'payable');
  const pendingReceivable = pendingChecks.filter(c => c.checkType === 'receivable');

  // Schedule data (includes overdue checks)
  const getScheduleData = () => {
    const days = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split('T')[0];

    // Collect overdue checks (grouped into a single "overdue" entry)
    const overdueChecks = checks.filter(c =>
      (c.status === 'pending' || c.status === 'due') && c.dueDate && c.dueDate < todayStr
    );
    if (overdueChecks.length > 0) {
      const payable = overdueChecks.filter(c => c.checkType === 'payable');
      const receivable = overdueChecks.filter(c => c.checkType === 'receivable');
      days.push({
        date: 'overdue',
        label: '逾期未兌現',
        dayOfWeek: -1,
        urgency: 'overdue',
        payable,
        receivable,
        payableTotal: payable.reduce((s, c) => s + Number(c.amount), 0),
        receivableTotal: receivable.reduce((s, c) => s + Number(c.amount), 0),
        net: receivable.reduce((s, c) => s + Number(c.amount), 0) - payable.reduce((s, c) => s + Number(c.amount), 0)
      });
    }

    for (let i = 0; i < scheduleRange; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() + i);
      const dateStr = d.toISOString().split('T')[0];
      const dayChecks = checks.filter(c =>
        c.dueDate === dateStr && (c.status === 'pending' || c.status === 'due')
      );
      const payable = dayChecks.filter(c => c.checkType === 'payable');
      const receivable = dayChecks.filter(c => c.checkType === 'receivable');
      const payableTotal = payable.reduce((s, c) => s + Number(c.amount), 0);
      const receivableTotal = receivable.reduce((s, c) => s + Number(c.amount), 0);

      // Determine urgency level
      let urgency = 'later';
      if (i === 0) urgency = 'today';
      else if (i <= 3) urgency = 'soon';
      else if (i <= 7) urgency = 'upcoming';

      days.push({
        date: dateStr,
        dayOfWeek: d.getDay(),
        urgency,
        payable,
        receivable,
        payableTotal,
        receivableTotal,
        net: receivableTotal - payableTotal
      });
    }
    return days;
  };

  // ============== FORM FIELDS ==============
  const renderCheckForm = (isEdit = false) => (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">支票類型 *</label>
          <select value={addForm.checkType} onChange={e => setAddForm(f => ({ ...f, checkType: e.target.value }))}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" disabled={isEdit}>
            <option value="payable">應付支票</option>
            <option value="receivable">應收支票</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">支票號碼 *</label>
          <input type="text" value={addForm.checkNumber}
            onChange={e => setAddForm(f => ({ ...f, checkNumber: e.target.value }))}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="輸入支票號碼" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">金額 *</label>
          <input type="number" value={addForm.amount}
            onChange={e => setAddForm(f => ({ ...f, amount: e.target.value }))}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="0" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">到期日 *</label>
          <input type="date" value={addForm.dueDate}
            onChange={e => setAddForm(f => ({ ...f, dueDate: e.target.value }))}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">開票日</label>
          <input type="date" value={addForm.issueDate}
            onChange={e => setAddForm(f => ({ ...f, issueDate: e.target.value }))}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">館別</label>
          <select value={addForm.warehouse} onChange={e => setAddForm(f => ({ ...f, warehouse: e.target.value }))}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
            <option value="">全部</option>
            <option value="麗格">麗格</option>
            <option value="麗軒">麗軒</option>
            <option value="民宿">民宿</option>
          </select>
        </div>
      </div>
      {addForm.checkType === 'payable' && (
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">來源帳戶 *</label>
            <select value={addForm.sourceAccountId}
              onChange={e => setAddForm(f => ({ ...f, sourceAccountId: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
              <option value="">選擇帳戶</option>
              {accounts.map(a => (
                <option key={a.id} value={a.id}>{a.name} ({a.accountCode})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">收款人</label>
            <input type="text" value={addForm.payeeName}
              onChange={e => setAddForm(f => ({ ...f, payeeName: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          </div>
        </div>
      )}
      {addForm.checkType === 'receivable' && (
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">目的帳戶 *</label>
            <select value={addForm.destinationAccountId}
              onChange={e => setAddForm(f => ({ ...f, destinationAccountId: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
              <option value="">選擇帳戶</option>
              {accounts.map(a => (
                <option key={a.id} value={a.id}>{a.name} ({a.accountCode})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">開票人</label>
            <input type="text" value={addForm.drawerName}
              onChange={e => setAddForm(f => ({ ...f, drawerName: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          </div>
        </div>
      )}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">供應商</label>
          <select value={addForm.supplierId}
            onChange={e => setAddForm(f => ({ ...f, supplierId: e.target.value }))}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
            <option value="">無</option>
            {suppliers.map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">銀行名稱</label>
          <input type="text" value={addForm.bankName}
            onChange={e => setAddForm(f => ({ ...f, bankName: e.target.value }))}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">備註</label>
        <textarea value={addForm.note} onChange={e => setAddForm(f => ({ ...f, note: e.target.value }))}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" rows={2} />
      </div>
      <div className="flex justify-end gap-3 pt-2">
        <button onClick={() => { isEdit ? setShowEditModal(false) : setShowAddModal(false); resetAddForm(); }}
          className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">取消</button>
        <button onClick={isEdit ? handleUpdate : handleAdd}
          className="px-4 py-2 text-sm bg-violet-600 text-white rounded-lg hover:bg-violet-700">
          {isEdit ? '更新' : '新增'}
        </button>
      </div>
    </div>
  );

  // ============== CHECK TABLE ==============
  const renderCheckTable = (data, showActions = true, showSelect = false) => (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50">
            {showSelect && <th className="px-3 py-2 text-left w-10"><input type="checkbox"
              checked={data.length > 0 && data.every(c => selectedIds.includes(c.id))}
              onChange={e => {
                if (e.target.checked) setSelectedIds(prev => [...new Set([...prev, ...data.map(c => c.id)])]);
                else setSelectedIds(prev => prev.filter(id => !data.some(c => c.id === id)));
              }} /></th>}
            <th className="px-3 py-2 text-left">狀態</th>
            <th className="px-3 py-2 text-left">支票號碼</th>
            <th className="px-3 py-2 text-left">類型</th>
            <th className="px-3 py-2 text-right">金額</th>
            <th className="px-3 py-2 text-left">到期日</th>
            <th className="px-3 py-2 text-left">帳戶</th>
            <th className="px-3 py-2 text-left">館別</th>
            {showActions && <th className="px-3 py-2 text-center">操作</th>}
          </tr>
        </thead>
        <tbody>
          {data.length === 0 ? (
            <tr><td colSpan={showSelect ? 9 : 8} className="px-3 py-8 text-center text-gray-400">無資料</td></tr>
          ) : data.map(c => (
            <tr key={c.id} className="border-t border-gray-100 hover:bg-gray-50">
              {showSelect && <td className="px-3 py-2">
                {(c.status === 'pending' || c.status === 'due') && (
                  <input type="checkbox" checked={selectedIds.includes(c.id)}
                    onChange={() => toggleSelectId(c.id)} />
                )}
              </td>}
              <td className="px-3 py-2"><StatusBadge status={c.status} /></td>
              <td className="px-3 py-2">
                <span className="font-mono text-xs">{c.checkNumber}</span>
                {c.reissueOfCheck && (
                  <span className="block text-xs text-amber-600 mt-0.5">重新開票（原退票 {c.reissueOfCheck.checkNo}）</span>
                )}
              </td>
              <td className="px-3 py-2">{c.checkType === 'payable' ? '應付' : '應收'}</td>
              <td className="px-3 py-2 text-right font-medium">${formatAmount(c.amount)}</td>
              <td className={`px-3 py-2 ${getDueDateColor(c.dueDate)}`}>
                {c.dueDate}
                <span className="text-xs ml-1">{(c.status === 'pending' || c.status === 'due') ? getDueDateLabel(c.dueDate) : ''}</span>
              </td>
              <td className="px-3 py-2 text-xs">
                {c.checkType === 'payable' ? c.sourceAccount?.name : c.destinationAccount?.name}
              </td>
              <td className="px-3 py-2">{c.warehouse || '-'}</td>
              {showActions && (
                <td className="px-3 py-2 text-center">
                  <div className="flex items-center justify-center gap-1 flex-wrap">
                    {(c.status === 'pending' || c.status === 'due') && (
                      <>
                        <button onClick={() => openClear(c)}
                          className="px-2 py-1 text-xs bg-green-50 text-green-700 rounded hover:bg-green-100">兌現</button>
                        <button onClick={() => openVoid(c)}
                          className="px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded hover:bg-gray-200">作廢</button>
                        <button onClick={() => openEdit(c)}
                          className="px-2 py-1 text-xs bg-violet-50 text-violet-700 rounded hover:bg-violet-100">編輯</button>
                      </>
                    )}
                    {c.status === 'bounced' && c.checkType === 'payable' && (
                      <>
                        {(c.reissuedByChecks || []).length > 0 ? (
                          <span className="text-xs text-green-600">已重新開票 → {c.reissuedByChecks[0].checkNo}</span>
                        ) : (
                          <button
                            onClick={() => handleReissue(c)}
                            disabled={reissueLoading === c.id}
                            className="px-2 py-1 text-xs bg-amber-50 text-amber-700 rounded hover:bg-amber-100 disabled:opacity-50">
                            {reissueLoading === c.id ? '處理中…' : '重新開票'}
                          </button>
                        )}
                      </>
                    )}
                    {c.status === 'pending' && (
                      <button onClick={() => handleDelete(c)}
                        className="px-2 py-1 text-xs bg-red-50 text-red-600 rounded hover:bg-red-100">刪除</button>
                    )}
                  </div>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  // ============== TAB: PENDING ==============
  const renderPendingTab = () => (
    <div className="space-y-6">
      {/* Summary cards */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-red-50 rounded-xl p-4 border border-red-200">
            <div className="text-xs text-red-600 font-medium">逾期應付</div>
            <div className="text-2xl font-bold text-red-700 mt-1">{summary.overduePayable?.count || 0}</div>
            <div className="text-sm text-red-500">${formatAmount(summary.overduePayable?.total)}</div>
          </div>
          <div className="bg-orange-50 rounded-xl p-4 border border-orange-200">
            <div className="text-xs text-orange-600 font-medium">逾期應收</div>
            <div className="text-2xl font-bold text-orange-700 mt-1">{summary.overdueReceivable?.count || 0}</div>
            <div className="text-sm text-orange-500">${formatAmount(summary.overdueReceivable?.total)}</div>
          </div>
          <div className="bg-yellow-50 rounded-xl p-4 border border-yellow-200">
            <div className="text-xs text-yellow-700 font-medium">7日內到期</div>
            <div className="text-2xl font-bold text-yellow-800 mt-1">{summary.dueSoon7?.count || 0}</div>
            <div className="text-sm text-yellow-600">${formatAmount(summary.dueSoon7?.total)}</div>
          </div>
          <div className="bg-violet-50 rounded-xl p-4 border border-violet-200">
            <div className="text-xs text-violet-600 font-medium">30日內到期</div>
            <div className="text-2xl font-bold text-violet-700 mt-1">{summary.dueSoon30?.count || 0}</div>
            <div className="text-sm text-violet-500">${formatAmount(summary.dueSoon30?.total)}</div>
          </div>
        </div>
      )}

      {/* Batch clear button */}
      {selectedIds.length > 0 && (
        <div className="flex items-center gap-3 bg-violet-50 px-4 py-3 rounded-lg border border-violet-200">
          <span className="text-sm text-violet-700">已選擇 {selectedIds.length} 張支票</span>
          <button onClick={openBatchClearModal}
            className="px-4 py-1.5 text-sm bg-violet-600 text-white rounded-lg hover:bg-violet-700">
            批次兌現
          </button>
          <button onClick={() => setSelectedIds([])}
            className="px-3 py-1.5 text-sm border border-violet-300 text-violet-600 rounded-lg hover:bg-violet-100">
            取消選擇
          </button>
        </div>
      )}

      {/* Payable section */}
      <div>
        <h3 className="text-base font-bold text-gray-700 mb-2 flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-red-400"></span>
          應付支票 ({pendingPayable.length})
        </h3>
        {renderCheckTable(pendingPayable, true, true)}
      </div>

      {/* Receivable section */}
      <div>
        <h3 className="text-base font-bold text-gray-700 mb-2 flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-green-400"></span>
          應收支票 ({pendingReceivable.length})
        </h3>
        {renderCheckTable(pendingReceivable, true, true)}
      </div>
    </div>
  );

  // ============== TAB: PAYABLE / RECEIVABLE ==============
  const renderCrudTab = (type) => {
    const filtered = checks.filter(c => c.checkType === type);
    return (
      <div className="space-y-4">
        {/* Filters */}
        <div className="flex flex-wrap items-end gap-3 bg-gray-50 p-4 rounded-lg">
          <div>
            <label className="block text-xs text-gray-500 mb-1">狀態</label>
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm">
              <option value="">全部</option>
              <option value="pending">待處理</option>
              <option value="due">到期</option>
              <option value="cleared">已兌現</option>
              <option value="bounced">退票</option>
              <option value="void">作廢</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">到期日起</label>
            <input type="date" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">到期日迄</label>
            <input type="date" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm" />
          </div>
          {type === 'payable' && (
            <div>
              <label className="block text-xs text-gray-500 mb-1">供應商</label>
              <select value={filterSupplierId} onChange={e => setFilterSupplierId(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm">
                <option value="">全部</option>
                {suppliers.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          )}
          <button onClick={() => { setFilterStatus(''); setFilterDateFrom(''); setFilterDateTo(''); setFilterSupplierId(''); }}
            className="px-3 py-1.5 text-sm text-gray-500 border border-gray-300 rounded-lg hover:bg-gray-100">
            清除篩選
          </button>
          <div className="flex-1"></div>
          <button onClick={() => { resetAddForm(); setAddForm(f => ({ ...f, checkType: type })); setShowAddModal(true); }}
            className="px-4 py-1.5 text-sm bg-violet-600 text-white rounded-lg hover:bg-violet-700">
            + 新增{type === 'payable' ? '應付' : '應收'}支票
          </button>
        </div>

        {/* Summary row */}
        <div className="flex gap-4 text-sm">
          <span className="text-gray-500">共 {filtered.length} 筆</span>
          <span className="text-gray-500">
            總金額: <span className="font-bold text-gray-800">${formatAmount(filtered.reduce((s, c) => s + Number(c.amount), 0))}</span>
          </span>
          <span className="text-gray-500">
            未兌現: <span className="font-bold text-orange-600">
              ${formatAmount(filtered.filter(c => c.status === 'pending' || c.status === 'due').reduce((s, c) => s + Number(c.amount), 0))}
            </span>
          </span>
        </div>

        {renderCheckTable(filtered)}
      </div>
    );
  };

  // ============== TAB: SCHEDULE ==============
  const renderScheduleTab = () => {
    const days = getScheduleData();
    const weekDays = ['日', '一', '二', '三', '四', '五', '六'];

    // Urgency color mappings for the timeline bar
    const urgencyStyles = {
      overdue: { bar: 'bg-red-500', bg: 'bg-red-50 border-red-300', dot: 'bg-red-500', text: 'text-red-700' },
      today:   { bar: 'bg-orange-500', bg: 'bg-orange-50 border-orange-300', dot: 'bg-orange-500', text: 'text-orange-700' },
      soon:    { bar: 'bg-yellow-400', bg: 'bg-yellow-50 border-yellow-200', dot: 'bg-yellow-500', text: 'text-yellow-700' },
      upcoming:{ bar: 'bg-blue-300', bg: 'bg-blue-50 border-blue-200', dot: 'bg-blue-400', text: 'text-blue-600' },
      later:   { bar: 'bg-gray-200', bg: 'bg-white border-gray-100', dot: 'bg-gray-300', text: 'text-gray-500' }
    };

    // Summary counts
    const overdueCount = days.find(d => d.date === 'overdue');
    const totalPayable = days.reduce((s, d) => s + d.payable.length, 0);
    const totalReceivable = days.reduce((s, d) => s + d.receivable.length, 0);

    return (
      <div className="space-y-4">
        {/* Controls and legend */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-600">顯示範圍:</span>
            <button onClick={() => setScheduleRange(7)}
              className={`px-3 py-1 text-sm rounded-lg ${scheduleRange === 7 ? 'bg-violet-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              7 天
            </button>
            <button onClick={() => setScheduleRange(30)}
              className={`px-3 py-1 text-sm rounded-lg ${scheduleRange === 30 ? 'bg-violet-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              30 天
            </button>
          </div>
          <div className="flex items-center gap-4 text-xs">
            <div className="flex items-center gap-1.5"><span className="w-3 h-1.5 rounded bg-red-500"></span><span className="text-gray-500">逾期</span></div>
            <div className="flex items-center gap-1.5"><span className="w-3 h-1.5 rounded bg-orange-500"></span><span className="text-gray-500">今日</span></div>
            <div className="flex items-center gap-1.5"><span className="w-3 h-1.5 rounded bg-yellow-400"></span><span className="text-gray-500">1-3 天</span></div>
            <div className="flex items-center gap-1.5"><span className="w-3 h-1.5 rounded bg-blue-300"></span><span className="text-gray-500">4-7 天</span></div>
            <div className="flex items-center gap-1.5"><span className="w-3 h-1.5 rounded bg-gray-200"></span><span className="text-gray-500">7 天後</span></div>
          </div>
        </div>

        {/* Quick summary */}
        <div className="flex items-center gap-4 text-sm bg-gray-50 rounded-lg px-4 py-2">
          {overdueCount && overdueCount.payable.length + overdueCount.receivable.length > 0 && (
            <span className="text-red-600 font-medium">逾期 {overdueCount.payable.length + overdueCount.receivable.length} 筆</span>
          )}
          <span className="text-gray-500">應付 {totalPayable} 筆</span>
          <span className="text-gray-500">應收 {totalReceivable} 筆</span>
        </div>

        {/* Timeline */}
        <div className="relative space-y-0">
          {days.map((day, idx) => {
            const hasData = day.payable.length > 0 || day.receivable.length > 0;
            const isWeekend = day.dayOfWeek === 0 || day.dayOfWeek === 6;
            const style = urgencyStyles[day.urgency] || urgencyStyles.later;
            const isOverdue = day.date === 'overdue';
            const isLast = idx === days.length - 1;

            return (
              <div key={day.date} className="flex">
                {/* Timeline column */}
                <div className="flex flex-col items-center w-8 flex-shrink-0">
                  <div className={`w-3 h-3 rounded-full ${hasData ? style.dot : 'bg-gray-200'} ring-2 ring-white z-10`}></div>
                  {!isLast && <div className="w-0.5 flex-1 bg-gray-200 min-h-[20px]"></div>}
                </div>

                {/* Content card */}
                <div className={`flex-1 mb-2 border rounded-lg overflow-hidden ${hasData ? style.bg : (isWeekend ? 'bg-gray-50 border-gray-100' : 'bg-white border-gray-100')}`}>
                  {/* Urgency bar */}
                  {hasData && <div className={`h-1 ${style.bar}`}></div>}

                  <div className="flex items-center px-4 py-2 gap-4">
                    <div className="w-32 flex-shrink-0">
                      {isOverdue ? (
                        <div className="text-sm font-bold text-red-600">{day.label}</div>
                      ) : (
                        <>
                          <div className={`text-sm font-medium ${style.text}`}>{day.date}</div>
                          <div className="text-xs text-gray-400">({weekDays[day.dayOfWeek]}){day.urgency === 'today' ? ' 今日' : ''}</div>
                        </>
                      )}
                    </div>
                    {hasData ? (
                      <div className="flex-1 flex items-center gap-6 text-sm">
                        {day.payable.length > 0 && (
                          <div className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-red-400"></span>
                            <span className="text-red-600">應付 {day.payable.length} 筆</span>
                            <span className="font-medium text-red-700">-${formatAmount(day.payableTotal)}</span>
                          </div>
                        )}
                        {day.receivable.length > 0 && (
                          <div className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-green-400"></span>
                            <span className="text-green-600">應收 {day.receivable.length} 筆</span>
                            <span className="font-medium text-green-700">+${formatAmount(day.receivableTotal)}</span>
                          </div>
                        )}
                        <div className={`ml-auto font-bold ${day.net >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                          淨額: {day.net >= 0 ? '+' : ''}${formatAmount(day.net)}
                        </div>
                      </div>
                    ) : (
                      <div className="flex-1 text-xs text-gray-300">-- 無到期支票 --</div>
                    )}
                  </div>
                  {hasData && (
                    <div className="border-t border-gray-100 px-4 py-2">
                      <div className="space-y-1">
                        {[...day.payable, ...day.receivable].map(c => (
                          <div key={c.id} className="flex items-center gap-3 text-xs">
                            <span className={`w-1.5 h-1.5 rounded-full ${c.checkType === 'payable' ? 'bg-red-400' : 'bg-green-400'}`}></span>
                            <span className="font-mono">{c.checkNumber}</span>
                            <span className={c.checkType === 'payable' ? 'text-red-600' : 'text-green-600'}>
                              {c.checkType === 'payable' ? '應付' : '應收'}
                            </span>
                            <span className="font-medium">${formatAmount(c.amount)}</span>
                            <span className="text-gray-400">{c.drawerName || c.payeeName || ''}</span>
                            <span className="text-gray-300">{c.checkType === 'payable' ? c.sourceAccount?.name : c.destinationAccount?.name}</span>
                            {isOverdue && c.dueDate && (
                              <span className="text-red-500 text-xs">{getDueDateLabel(c.dueDate)}</span>
                            )}
                            {(c.status === 'pending' || c.status === 'due') && (
                              <button onClick={() => openClear(c)}
                                className="ml-auto px-2 py-0.5 bg-green-50 text-green-700 rounded hover:bg-green-100">
                                兌現
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // ============== TAB: STATS ==============
  const renderStatsTab = () => {
    const bouncedChecks = checks.filter(c => c.status === 'bounced');
    const today = new Date().toISOString().split('T')[0];
    const overdueChecks = checks.filter(c => (c.status === 'pending' || c.status === 'due') && c.dueDate < today);

    return (
      <div className="space-y-6">
        {/* Month selector */}
        <div className="flex items-center gap-3 bg-gray-50 p-4 rounded-lg">
          <label className="text-sm text-gray-600">統計月份:</label>
          <select value={statsYear} onChange={e => setStatsYear(parseInt(e.target.value))}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm">
            {[2024, 2025, 2026, 2027].map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          <select value={statsMonth} onChange={e => setStatsMonth(parseInt(e.target.value))}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm">
            {Array.from({ length: 12 }, (_, i) => (
              <option key={i + 1} value={i + 1}>{i + 1} 月</option>
            ))}
          </select>
        </div>

        {/* Monthly summary */}
        {monthlyStats && (
          <div className="bg-white border border-gray-200 rounded-xl p-6">
            <h3 className="text-base font-bold text-gray-700 mb-4">{statsYear} 年 {statsMonth} 月 統計</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-violet-50 p-4 rounded-lg">
                <div className="text-xs text-violet-500">總支票數</div>
                <div className="text-xl font-bold text-violet-700">{monthlyStats.total}</div>
                <div className="text-sm text-violet-500">${formatAmount(monthlyStats.totalAmount)}</div>
              </div>
              <div className="bg-red-50 p-4 rounded-lg">
                <div className="text-xs text-red-500">應付</div>
                <div className="text-xl font-bold text-red-700">{monthlyStats.payable?.count || 0}</div>
                <div className="text-sm text-red-500">${formatAmount(monthlyStats.payable?.total)}</div>
              </div>
              <div className="bg-green-50 p-4 rounded-lg">
                <div className="text-xs text-green-500">應收</div>
                <div className="text-xl font-bold text-green-700">{monthlyStats.receivable?.count || 0}</div>
                <div className="text-sm text-green-500">${formatAmount(monthlyStats.receivable?.total)}</div>
              </div>
              <div className="bg-blue-50 p-4 rounded-lg">
                <div className="text-xs text-blue-500">已兌現</div>
                <div className="text-xl font-bold text-blue-700">{monthlyStats.cleared?.count || 0}</div>
                <div className="text-sm text-blue-500">${formatAmount(monthlyStats.cleared?.total)}</div>
              </div>
            </div>
          </div>
        )}

        {/* Abnormal checks */}
        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <h3 className="text-base font-bold text-gray-700 mb-4">異常支票</h3>

          {/* Bounced */}
          <div className="mb-4">
            <h4 className="text-sm font-semibold text-red-600 mb-2 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-red-400"></span>
              退票 ({bouncedChecks.length})
            </h4>
            {bouncedChecks.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-red-50">
                      <th className="px-3 py-2 text-left">支票號碼</th>
                      <th className="px-3 py-2 text-left">類型</th>
                      <th className="px-3 py-2 text-right">金額</th>
                      <th className="px-3 py-2 text-left">到期日</th>
                      <th className="px-3 py-2 text-left">退票原因</th>
                      <th className="px-3 py-2 text-center">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bouncedChecks.map(c => (
                      <tr key={c.id} className="border-t border-red-100">
                        <td className="px-3 py-2 font-mono text-xs">{c.checkNumber}</td>
                        <td className="px-3 py-2">{c.checkType === 'payable' ? '應付' : '應收'}</td>
                        <td className="px-3 py-2 text-right font-medium">${formatAmount(c.amount)}</td>
                        <td className="px-3 py-2">{c.dueDate}</td>
                        <td className="px-3 py-2 text-xs text-gray-500">{c.bouncedReason || '-'}</td>
                        <td className="px-3 py-2 text-center">
                          {c.checkType === 'payable' ? (
                            (c.reissuedByChecks || []).length > 0 ? (
                              <span className="text-xs text-green-600">已重新開票 → {c.reissuedByChecks[0].checkNo}</span>
                            ) : (
                              <button
                                onClick={() => handleReissue(c)}
                                disabled={reissueLoading === c.id}
                                className="px-2 py-1 text-xs bg-amber-50 text-amber-700 rounded hover:bg-amber-100 disabled:opacity-50">
                                {reissueLoading === c.id ? '處理中…' : '重新開票'}
                              </button>
                            )
                          ) : (
                            <span className="text-gray-400">－</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-sm text-gray-400 py-2">無退票記錄</div>
            )}
          </div>

          {/* Overdue */}
          <div>
            <h4 className="text-sm font-semibold text-orange-600 mb-2 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-orange-400"></span>
              逾期未兌現 ({overdueChecks.length})
            </h4>
            {overdueChecks.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-orange-50">
                      <th className="px-3 py-2 text-left">支票號碼</th>
                      <th className="px-3 py-2 text-left">類型</th>
                      <th className="px-3 py-2 text-right">金額</th>
                      <th className="px-3 py-2 text-left">到期日</th>
                      <th className="px-3 py-2 text-left">逾期天數</th>
                      <th className="px-3 py-2 text-center">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {overdueChecks.map(c => {
                      const diffDays = Math.ceil((new Date() - new Date(c.dueDate + 'T00:00:00')) / (1000 * 60 * 60 * 24));
                      return (
                        <tr key={c.id} className="border-t border-orange-100">
                          <td className="px-3 py-2 font-mono text-xs">{c.checkNumber}</td>
                          <td className="px-3 py-2">{c.checkType === 'payable' ? '應付' : '應收'}</td>
                          <td className="px-3 py-2 text-right font-medium">${formatAmount(c.amount)}</td>
                          <td className="px-3 py-2 text-red-600">{c.dueDate}</td>
                          <td className="px-3 py-2 text-red-600 font-bold">{diffDays} 天</td>
                          <td className="px-3 py-2 text-center">
                            <button onClick={() => openClear(c)}
                              className="px-2 py-1 text-xs bg-green-50 text-green-700 rounded hover:bg-green-100">兌現</button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-sm text-gray-400 py-2">無逾期記錄</div>
            )}
          </div>
        </div>
      </div>
    );
  };

  // 列印表用：應付且待兌現/到期的支票，依到期日、支票號排序
  const checksForPrintSheet = checks
    .filter(c => c.checkType === 'payable' && (c.status === 'pending' || c.status === 'due'))
    .sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || '') || (a.checkNumber || '').localeCompare(b.checkNumber || ''));
  const getPayeeName = (c) => c.payeeName || (c.supplierId && suppliers.find(s => s.id === c.supplierId)?.name) || '－';

  // ============== MAIN RENDER ==============
  return (
    <div className="min-h-screen bg-gray-50">
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          .no-print, .no-print * { visibility: hidden !important; }
          #check-pickup-print-root { visibility: visible !important; position: absolute !important; left: 0 !important; top: 0 !important; width: 100% !important; background: #fff !important; z-index: 99999 !important; }
          #check-pickup-print-root * { visibility: visible !important; }
        }
      `}} />
      <div className="no-print">
        <Navigation borderColor="border-violet-500" />
        <NotificationBanner moduleFilter="checks" />
      </div>
      <div className="max-w-7xl mx-auto px-4 py-6 no-print">
        {/* Header */}
        <div className="flex items-center justify-between mb-6 no-print">
          <div>
            <h2 className="text-2xl font-bold text-gray-800">支票管理</h2>
            <p className="text-sm text-gray-500 mt-1">管理應付及應收支票，追蹤兌現狀態與到期日程</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setShowPrintSheetModal(true)}
              className="px-4 py-2 text-sm font-medium text-violet-700 bg-violet-50 border border-violet-200 rounded-lg hover:bg-violet-100"
            >
              支票列印表（領取簽名）
            </button>
            <ExportButtons
              data={checks}
              columns={EXPORT_CONFIGS.checks.columns}
              exportName={EXPORT_CONFIGS.checks.filename}
              title="支票管理"
              sheetName="支票清單"
            />
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 bg-gray-100 rounded-xl p-1">
          {TABS.map(tab => (
            <button key={tab.key} onClick={() => { setActiveTab(tab.key); setSelectedIds([]); }}
              className={`flex-1 py-2.5 text-sm font-medium rounded-lg transition-all ${
                activeTab === tab.key
                  ? 'bg-violet-600 text-white shadow-md'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200'
              }`}>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-12">
            <div className="w-8 h-8 border-4 border-violet-200 border-t-violet-600 rounded-full animate-spin"></div>
          </div>
        )}

        {/* Tab content */}
        {!loading && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            {activeTab === 'pending' && renderPendingTab()}
            {activeTab === 'payable' && renderCrudTab('payable')}
            {activeTab === 'receivable' && renderCrudTab('receivable')}
            {activeTab === 'schedule' && renderScheduleTab()}
            {activeTab === 'stats' && renderStatsTab()}
          </div>
        )}
      </div>

      {/* ============ MODALS ============ */}

      {/* Add Modal */}
      <Modal isOpen={showAddModal} onClose={() => { setShowAddModal(false); resetAddForm(); }}
        title={`新增${addForm.checkType === 'payable' ? '應付' : '應收'}支票`}>
        {renderCheckForm(false)}
      </Modal>

      {/* Edit Modal */}
      <Modal isOpen={showEditModal} onClose={() => { setShowEditModal(false); resetAddForm(); setSelectedCheck(null); }}
        title="編輯支票">
        {renderCheckForm(true)}
      </Modal>

      {/* Clear Modal */}
      <Modal isOpen={showClearModal} onClose={() => { setShowClearModal(false); setSelectedCheck(null); }}
        title="兌現支票">
        {selectedCheck && (
          <div className="space-y-4">
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>支票號碼: <span className="font-mono font-medium">{selectedCheck.checkNumber}</span></div>
                <div>類型: {selectedCheck.checkType === 'payable' ? '應付' : '應收'}</div>
                <div>金額: <span className="font-bold">${formatAmount(selectedCheck.amount)}</span></div>
                <div>到期日: {selectedCheck.dueDate}</div>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">兌現日期</label>
              <input type="date" value={clearForm.clearDate}
                onChange={e => setClearForm(f => ({ ...f, clearDate: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">實際金額</label>
              <input type="number" value={clearForm.actualAmount}
                onChange={e => setClearForm(f => ({ ...f, actualAmount: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">兌現人</label>
              <input type="text" value={clearForm.clearedBy}
                onChange={e => setClearForm(f => ({ ...f, clearedBy: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="選填" />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => { setShowClearModal(false); setSelectedCheck(null); }}
                className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">取消</button>
              <button onClick={handleClear}
                className="px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700">確認兌現</button>
            </div>
          </div>
        )}
      </Modal>

      {/* Bounce Modal */}
      <Modal isOpen={showBounceModal} onClose={() => { setShowBounceModal(false); setSelectedCheck(null); }}
        title="退票處理">
        {selectedCheck && (
          <div className="space-y-4">
            <div className="bg-red-50 rounded-lg p-4 border border-red-200">
              <div className="text-sm text-red-700">
                確定要將支票 <span className="font-mono font-bold">{selectedCheck.checkNumber}</span> 標記為退票？
                {selectedCheck.status === 'cleared' && (
                  <span className="block mt-1 text-red-600 font-medium">此支票已兌現，退票將產生沖回交易</span>
                )}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">退票原因</label>
              <textarea value={actionReason} onChange={e => setActionReason(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" rows={3}
                placeholder="輸入退票原因..." />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => { setShowBounceModal(false); setSelectedCheck(null); }}
                className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">取消</button>
              <button onClick={handleBounce}
                className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700">確認退票</button>
            </div>
          </div>
        )}
      </Modal>

      {/* Batch Clear Modal：填寫兌現日後存檔，所有勾選的支票記錄兌現日期 */}
      <Modal isOpen={showBatchClearModal} onClose={() => setShowBatchClearModal(false)}
        title="批次兌現">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">已選擇 <strong>{selectedIds.length}</strong> 張支票，請填寫兌現日後存檔，所有勾選的支票將一併記錄該兌現日。</p>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">兌現日 <span className="text-red-500">*</span></label>
            <input type="date" value={batchClearDate} onChange={e => setBatchClearDate(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button onClick={() => setShowBatchClearModal(false)}
              className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">取消</button>
            <button onClick={handleBatchClear}
              className="px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700">存檔</button>
          </div>
        </div>
      </Modal>

      {/* Void Modal */}
      <Modal isOpen={showVoidModal} onClose={() => { setShowVoidModal(false); setSelectedCheck(null); }}
        title="作廢支票">
        {selectedCheck && (
          <div className="space-y-4">
            <div className="bg-gray-100 rounded-lg p-4">
              <div className="text-sm text-gray-700">
                確定要將支票 <span className="font-mono font-bold">{selectedCheck.checkNumber}</span> 作廢？
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">作廢原因</label>
              <textarea value={actionReason} onChange={e => setActionReason(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" rows={3}
                placeholder="輸入作廢原因..." />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => { setShowVoidModal(false); setSelectedCheck(null); }}
                className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">取消</button>
              <button onClick={handleVoid}
                className="px-4 py-2 text-sm bg-gray-700 text-white rounded-lg hover:bg-gray-800">確認作廢</button>
            </div>
          </div>
        )}
      </Modal>

      {/* 支票列印表（領取簽名）Modal */}
      <Modal isOpen={showPrintSheetModal} onClose={() => setShowPrintSheetModal(false)} title="支票領取簽名表" width="max-w-4xl">
        <div className="space-y-4 no-print">
          <p className="text-sm text-gray-500">列印日期：{new Date().toLocaleDateString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</p>
          <p className="text-sm text-gray-600">以下為應付且待兌現／到期之支票，共 {checksForPrintSheet.length} 張。廠商領取時請於簽收欄簽名。</p>
          <div className="overflow-x-auto border border-gray-200 rounded-lg">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-100">
                  <th className="px-3 py-2 text-left border-b border-gray-200 w-12">序號</th>
                  <th className="px-3 py-2 text-left border-b border-gray-200">支票號碼</th>
                  <th className="px-3 py-2 text-left border-b border-gray-200">受款人／廠商</th>
                  <th className="px-3 py-2 text-right border-b border-gray-200">金額</th>
                  <th className="px-3 py-2 text-left border-b border-gray-200">開票日</th>
                  <th className="px-3 py-2 text-left border-b border-gray-200">到期日</th>
                  <th className="px-3 py-2 text-left border-b border-gray-200 min-w-[120px]">簽收欄（簽名）</th>
                </tr>
              </thead>
              <tbody>
                {checksForPrintSheet.length === 0 ? (
                  <tr><td colSpan={7} className="px-3 py-6 text-center text-gray-400">目前無待領取之應付支票</td></tr>
                ) : checksForPrintSheet.map((c, idx) => (
                  <tr key={c.id} className="border-b border-gray-100">
                    <td className="px-3 py-2 text-gray-600">{idx + 1}</td>
                    <td className="px-3 py-2 font-mono">{c.checkNumber}</td>
                    <td className="px-3 py-2">{getPayeeName(c)}</td>
                    <td className="px-3 py-2 text-right font-medium">${formatAmount(c.amount)}</td>
                    <td className="px-3 py-2">{c.issueDate || '－'}</td>
                    <td className="px-3 py-2">{c.dueDate || '－'}</td>
                    <td className="px-3 py-2 align-top" style={{ minHeight: 32 }}>&nbsp;</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setShowPrintSheetModal(false)} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">關閉</button>
            <button type="button" onClick={() => window.print()} className="px-4 py-2 text-sm bg-violet-600 text-white rounded-lg hover:bg-violet-700">列印</button>
          </div>
        </div>
      </Modal>

      {/* 列印時只顯示此區塊 */}
      {showPrintSheetModal && (
        <div id="check-pickup-print-root" className="fixed -left-[9999px] top-0 w-screen bg-white p-8" aria-hidden="true">
          <h1 className="text-xl font-bold text-gray-800 mb-2">支票領取簽名表</h1>
          <p className="text-sm text-gray-500 mb-4">列印日期：{new Date().toLocaleDateString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</p>
          <p className="text-sm text-gray-600 mb-4">以下為應付且待兌現／到期之支票，廠商領取時請於簽收欄簽名。</p>
          <table className="w-full text-sm border border-gray-300">
            <thead>
              <tr className="bg-gray-100">
                <th className="px-3 py-2 text-left border border-gray-300 w-12">序號</th>
                <th className="px-3 py-2 text-left border border-gray-300">支票號碼</th>
                <th className="px-3 py-2 text-left border border-gray-300">受款人／廠商</th>
                <th className="px-3 py-2 text-right border border-gray-300">金額</th>
                <th className="px-3 py-2 text-left border border-gray-300">開票日</th>
                <th className="px-3 py-2 text-left border border-gray-300">到期日</th>
                <th className="px-3 py-2 text-left border border-gray-300 min-w-[120px]">簽收欄（簽名）</th>
              </tr>
            </thead>
            <tbody>
              {checksForPrintSheet.length === 0 ? (
                <tr><td colSpan={7} className="px-3 py-6 text-center text-gray-400 border border-gray-300">目前無待領取之應付支票</td></tr>
              ) : checksForPrintSheet.map((c, idx) => (
                <tr key={c.id}>
                  <td className="px-3 py-2 border border-gray-300 text-gray-600">{idx + 1}</td>
                  <td className="px-3 py-2 border border-gray-300 font-mono">{c.checkNumber}</td>
                  <td className="px-3 py-2 border border-gray-300">{getPayeeName(c)}</td>
                  <td className="px-3 py-2 border border-gray-300 text-right font-medium">${formatAmount(c.amount)}</td>
                  <td className="px-3 py-2 border border-gray-300">{c.issueDate || '－'}</td>
                  <td className="px-3 py-2 border border-gray-300">{c.dueDate || '－'}</td>
                  <td className="px-3 py-2 border border-gray-300" style={{ minHeight: 36 }}>&nbsp;</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
