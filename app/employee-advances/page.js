'use client';

import { useState, useEffect, useMemo } from 'react';
import { useSession } from 'next-auth/react';
import Navigation from '@/components/Navigation';
import { useToast } from '@/context/ToastContext';
import { sortRows, useColumnSort, SortableThInline } from '@/components/SortableTh';

export default function EmployeeAdvancesPage() {
  const { data: session } = useSession();
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState('pending');
  const [advances, setAdvances] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);

  // Settlement form
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [settleAccountId, setSettleAccountId] = useState('');
  const [settleDate, setSettleDate] = useState(new Date().toISOString().split('T')[0]);
  const [settleNote, setSettleNote] = useState('');
  const [settling, setSettling] = useState(false);

  // Add form
  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState({
    employeeName: '', paymentMethod: '現金', amount: '', sourceDescription: '', expenseName: '', summary: '', warehouse: '', note: '',
  });

  useEffect(() => { fetchAll(); }, []);

  async function fetchAll() {
    setLoading(true);
    const [advRes, accRes] = await Promise.all([
      fetch('/api/employee-advances').then(r => r.json()).catch(() => []),
      fetch('/api/cashflow/accounts').then(r => r.json()).catch(() => []),
    ]);
    setAdvances(Array.isArray(advRes) ? advRes : []);
    setAccounts(Array.isArray(accRes) ? accRes : []);
    setLoading(false);
  }

  const pendingAdvances = useMemo(() => advances.filter(a => a.status === '待結算'), [advances]);
  const settledAdvances = useMemo(() => advances.filter(a => a.status === '已結算'), [advances]);
  const [filterEmployee, setFilterEmployee] = useState('');

  const employeeSummaryList = useMemo(() => {
    const map = {};
    advances.forEach(a => {
      if (!map[a.employeeName]) {
        map[a.employeeName] = { name: a.employeeName, pending: 0, pendingAmount: 0, settled: 0, settledAmount: 0, total: 0 };
      }
      const e = map[a.employeeName];
      e.total++;
      if (a.status === '待結算') { e.pending++; e.pendingAmount += Number(a.amount); }
      else { e.settled++; e.settledAmount += Number(a.settledAmount || a.amount); }
    });
    return Object.values(map);
  }, [advances]);
  const { sortKey: advEmpKey, sortDir: advEmpDir, toggleSort: toggleAdvEmp } = useColumnSort('pendingAmount', 'desc');
  const sortedEmployeeSummary = useMemo(
    () =>
      sortRows(employeeSummaryList, advEmpKey, advEmpDir, {
        name: (e) => e.name,
        pending: (e) => e.pending,
        pendingAmount: (e) => e.pendingAmount,
        settled: (e) => e.settled,
        settledAmount: (e) => e.settledAmount,
        total: (e) => e.total,
      }),
    [employeeSummaryList, advEmpKey, advEmpDir]
  );

  const filteredPending = useMemo(() => {
    if (!filterEmployee) return pendingAdvances;
    return pendingAdvances.filter(a => a.employeeName === filterEmployee);
  }, [pendingAdvances, filterEmployee]);

  const { sortKey: advPenKey, sortDir: advPenDir, toggleSort: toggleAdvPen } = useColumnSort('createdAt', 'desc');
  const sortedFilteredPending = useMemo(
    () =>
      sortRows(filteredPending, advPenKey, advPenDir, {
        advanceNo: (a) => a.advanceNo || '',
        employeeName: (a) => a.employeeName || '',
        paymentMethod: (a) => a.paymentMethod || '',
        source: (a) => a.sourceType || '',
        expenseName: (a) => a.expenseName || '',
        summary: (a) => a.summary || a.sourceDescription || '',
        amount: (a) => Number(a.amount || 0),
        createdAt: (a) => a.createdAt || '',
      }),
    [filteredPending, advPenKey, advPenDir]
  );

  const { sortKey: advSetKey, sortDir: advSetDir, toggleSort: toggleAdvSet } = useColumnSort('settledDate', 'desc');
  const sortedSettledAdvances = useMemo(
    () =>
      sortRows(settledAdvances, advSetKey, advSetDir, {
        advanceNo: (a) => a.advanceNo || '',
        employeeName: (a) => a.employeeName || '',
        paymentMethod: (a) => a.paymentMethod || '',
        description: (a) => a.sourceDescription || '',
        amount: (a) => Number(a.amount || 0),
        settledDate: (a) => a.settledDate || '',
        settlementTxNo: (a) => a.settlementTxNo || '',
      }),
    [settledAdvances, advSetKey, advSetDir]
  );

  const selectedAdvances = filteredPending.filter(a => selectedIds.has(a.id));
  const selectedTotal = selectedAdvances.reduce((sum, a) => sum + Number(a.amount), 0);

  function toggleSelect(id) {
    const ns = new Set(selectedIds);
    if (ns.has(id)) ns.delete(id); else ns.add(id);
    setSelectedIds(ns);
  }

  function toggleSelectAll() {
    if (selectedIds.size === filteredPending.length && filteredPending.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredPending.map(a => a.id)));
    }
  }

  async function handleSettle() {
    if (selectedIds.size === 0) return showToast('請勾選要結算的代墊款', 'error');
    if (!settleAccountId) return showToast('請選擇付款帳戶', 'error');
    if (billTotal && parseFloat(billTotal) < selectedTotal) return showToast('帳單總額不能小於代墊公費合計', 'error');

    const acct = accounts.find(a => a.id === parseInt(settleAccountId));
    const hasPrivate = billTotal && privateAmount > 0;
    const totalPay = hasPrivate ? parseFloat(billTotal) : selectedTotal;
    const confirmMsg = hasPrivate
      ? `確定從「${acct?.name || '帳戶'}」支付信用卡帳單 NT$ ${totalPay.toLocaleString()}？\n\n公費代墊：${selectedIds.size} 筆 = NT$ ${selectedTotal.toLocaleString()}\n老闆私帳：NT$ ${privateAmount.toLocaleString()}`
      : `確定從「${acct?.name || '帳戶'}」支付 ${selectedIds.size} 筆代墊款，共 NT$ ${selectedTotal.toLocaleString()}？`;
    if (!confirm(confirmMsg)) return;

    setSettling(true);
    try {
      const payload = {
        advanceIds: Array.from(selectedIds),
        accountId: parseInt(settleAccountId),
        settleDate,
        note: settleNote || null,
      };
      if (hasPrivate) {
        payload.billTotal = parseFloat(billTotal);
        payload.privateAmount = privateAmount;
        payload.privateAccountId = privateAccountId ? parseInt(privateAccountId) : null;
      }
      const res = await fetch('/api/employee-advances/settle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = await res.json();
      if (res.ok) {
        showToast(result.message || '結算成功', 'success');
        setSelectedIds(new Set());
        setSettleNote('');
        setBillTotal('');
        setPrivateAccountId('');
        fetchAll();
      } else {
        showToast(result.error?.message || result.message || '結算失敗', 'error');
      }
    } catch (err) {
      showToast('結算失敗: ' + err.message, 'error');
    }
    setSettling(false);
  }

  async function handleAdd(e) {
    e.preventDefault();
    if (!addForm.employeeName || !addForm.amount) return showToast('請填寫員工姓名和金額', 'error');
    try {
      const res = await fetch('/api/employee-advances', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(addForm),
      });
      if (res.ok) {
        showToast('新增成功', 'success');
        setShowAddForm(false);
        setAddForm({ employeeName: '', paymentMethod: '現金', amount: '', sourceDescription: '', expenseName: '', summary: '', warehouse: '', note: '' });
        fetchAll();
      } else {
        const err = await res.json();
        showToast(err.error?.message || '新增失敗', 'error');
      }
    } catch { showToast('新增失敗', 'error'); }
  }

  // Edit state
  const [editingAdvance, setEditingAdvance] = useState(null);
  const [editForm, setEditForm] = useState({});

  function openEditAdvance(adv) {
    setEditingAdvance(adv);
    setEditForm({
      employeeName: adv.employeeName || '',
      paymentMethod: adv.paymentMethod || '現金',
      amount: String(Number(adv.amount)),
      expenseName: adv.expenseName || '',
      summary: adv.summary || '',
      sourceDescription: adv.sourceDescription || '',
      warehouse: adv.warehouse || '',
      note: adv.note || '',
    });
  }

  async function handleEditSave() {
    if (!editForm.employeeName || !editForm.amount) return showToast('請填寫員工姓名和金額', 'error');
    try {
      const res = await fetch(`/api/employee-advances/${editingAdvance.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      });
      if (res.ok) {
        showToast('編輯成功，已連動更新費用記錄', 'success');
        setEditingAdvance(null);
        fetchAll();
      } else {
        const err = await res.json();
        showToast(err.error?.message || err.error || '編輯失敗', 'error');
      }
    } catch { showToast('編輯失敗', 'error'); }
  }

  async function handleDeleteAdvance(adv) {
    if (!confirm(`確定刪除代墊款「${adv.advanceNo}」？\n${adv.expenseName || adv.sourceDescription || ''} NT$ ${Number(adv.amount).toLocaleString()}\n\n此操作會連動刪除關聯的費用記錄和付款單。`)) return;
    try {
      const res = await fetch(`/api/employee-advances/${adv.id}`, { method: 'DELETE' });
      if (res.ok) {
        showToast('已刪除代墊款及關聯資料', 'success');
        fetchAll();
      } else {
        const err = await res.json();
        showToast(err.error?.message || err.error || '刪除失敗', 'error');
      }
    } catch { showToast('刪除失敗', 'error'); }
  }

  const bankAccounts = accounts.filter(a => a.isActive && (a.type === '銀行存款' || a.type === '現金'));
  const employeeNames = [...new Set(advances.map(a => a.employeeName))].sort();

  const TABS = [
    { key: 'pending', label: `待結算 (${pendingAdvances.length})` },
    { key: 'settled', label: `已結算 (${settledAdvances.length})` },
    { key: 'employees', label: `員工總覽 (${employeeSummaryList.length})` },
  ];

  // Settlement panel state
  const [billTotal, setBillTotal] = useState('');
  const privateAmount = billTotal ? Math.max(0, parseFloat(billTotal) - selectedTotal) : 0;
  const [privateAccountId, setPrivateAccountId] = useState('');

  const thStyle = { padding: '10px 14px', textAlign: 'left', borderBottom: '2px solid #e5e7eb', fontSize: 15, fontWeight: 600, color: '#374151', whiteSpace: 'nowrap' };
  const tdStyle = { padding: '10px 14px', borderBottom: '1px solid #f3f4f6', fontSize: 15 };

  if (loading) return (
    <>
      <Navigation borderColor="border-green-500" />
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: 24 }}>
        <div style={{ textAlign: 'center', padding: 60, color: '#6b7280' }}>載入中...</div>
      </div>
    </>
  );

  return (
    <>
      <Navigation borderColor="border-green-500" />
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ fontSize: 22, fontWeight: 700 }}>員工代墊款管理</h2>
          <button onClick={() => setShowAddForm(v => !v)} style={{ padding: '8px 16px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 14 }}>
            + 手動新增代墊款
          </button>
        </div>

        {/* KPI Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
          <div style={{ background: '#fef3c7', borderRadius: 8, padding: 16 }}>
            <div style={{ fontSize: 12, color: '#92400e' }}>待結算筆數</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: '#92400e' }}>{pendingAdvances.length}</div>
          </div>
          <div style={{ background: '#fee2e2', borderRadius: 8, padding: 16 }}>
            <div style={{ fontSize: 12, color: '#991b1b' }}>待結算金額</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: '#991b1b' }}>NT$ {pendingAdvances.reduce((s, a) => s + Number(a.amount), 0).toLocaleString()}</div>
          </div>
          <div style={{ background: '#d1fae5', borderRadius: 8, padding: 16 }}>
            <div style={{ fontSize: 12, color: '#065f46' }}>已結算筆數</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: '#065f46' }}>{settledAdvances.length}</div>
          </div>
          <div style={{ background: '#e0e7ff', borderRadius: 8, padding: 16 }}>
            <div style={{ fontSize: 12, color: '#3730a3' }}>代墊員工數</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: '#3730a3' }}>{employeeSummaryList.length}</div>
          </div>
        </div>

        {/* Add form */}
        {showAddForm && (
          <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, padding: 20, marginBottom: 20 }}>
            <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>手動新增代墊款</h3>
            <form onSubmit={handleAdd} style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, color: '#6b7280' }}>代墊員工 *</label>
                <input value={addForm.employeeName} onChange={e => setAddForm(f => ({ ...f, employeeName: e.target.value }))} style={{ width: '100%', padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 13 }} />
              </div>
              <div>
                <label style={{ fontSize: 12, color: '#6b7280' }}>代墊方式</label>
                <select value={addForm.paymentMethod} onChange={e => setAddForm(f => ({ ...f, paymentMethod: e.target.value }))} style={{ width: '100%', padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 13 }}>
                  <option value="現金">現金</option>
                  <option value="信用卡">信用卡</option>
                  <option value="其他">其他</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize: 12, color: '#6b7280' }}>金額 *</label>
                <input type="number" value={addForm.amount} onChange={e => setAddForm(f => ({ ...f, amount: e.target.value }))} style={{ width: '100%', padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 13 }} />
              </div>
              <div>
                <label style={{ fontSize: 12, color: '#6b7280' }}>費用名稱</label>
                <input value={addForm.expenseName} onChange={e => setAddForm(f => ({ ...f, expenseName: e.target.value }))} placeholder="選填" style={{ width: '100%', padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 13 }} />
              </div>
              <div>
                <label style={{ fontSize: 12, color: '#6b7280' }}>摘要</label>
                <input value={addForm.summary} onChange={e => setAddForm(f => ({ ...f, summary: e.target.value }))} placeholder="選填" style={{ width: '100%', padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 13 }} />
              </div>
              <div>
                <label style={{ fontSize: 12, color: '#6b7280' }}>說明</label>
                <input value={addForm.sourceDescription} onChange={e => setAddForm(f => ({ ...f, sourceDescription: e.target.value }))} style={{ width: '100%', padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 13 }} />
              </div>
              <div>
                <label style={{ fontSize: 12, color: '#6b7280' }}>館別</label>
                <input value={addForm.warehouse} onChange={e => setAddForm(f => ({ ...f, warehouse: e.target.value }))} style={{ width: '100%', padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 13 }} />
              </div>
              <div>
                <label style={{ fontSize: 12, color: '#6b7280' }}>備註</label>
                <input value={addForm.note} onChange={e => setAddForm(f => ({ ...f, note: e.target.value }))} style={{ width: '100%', padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 13 }} />
              </div>
              <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 8 }}>
                <button type="submit" style={{ padding: '8px 20px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}>新增</button>
                <button type="button" onClick={() => setShowAddForm(false)} style={{ padding: '8px 20px', background: '#e5e7eb', color: '#374151', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}>取消</button>
              </div>
            </form>
          </div>
        )}

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 0, borderBottom: '2px solid #e5e7eb', marginBottom: 20 }}>
          {TABS.map(tab => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)} style={{
              padding: '10px 20px', border: 'none', borderBottom: activeTab === tab.key ? '3px solid #2563eb' : '3px solid transparent',
              background: 'none', fontSize: 14, fontWeight: activeTab === tab.key ? 600 : 400,
              color: activeTab === tab.key ? '#2563eb' : '#6b7280', cursor: 'pointer',
            }}>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Pending Tab */}
        {activeTab === 'pending' && (
          <div>
            {/* Filter bar */}
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 16 }}>
              <div>
                <label style={{ fontSize: 13, color: '#6b7280', marginRight: 4 }}>篩選員工：</label>
                <select value={filterEmployee} onChange={e => { setFilterEmployee(e.target.value); setSelectedIds(new Set()); }} style={{ padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 14 }}>
                  <option value="">全部</option>
                  {employeeNames.map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
            </div>

            {/* Settlement Panel - shows when items selected */}
            {selectedIds.size > 0 && (
              <div style={{ background: '#f0fdf4', border: '2px solid #86efac', borderRadius: 12, padding: 20, marginBottom: 20 }}>
                <h3 style={{ fontSize: 16, fontWeight: 700, color: '#065f46', marginBottom: 12 }}>結算明細 — 已選 {selectedIds.size} 筆</h3>

                {/* Selected items detail table */}
                <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 16, background: '#fff', borderRadius: 8, overflow: 'hidden' }}>
                  <thead>
                    <tr style={{ background: '#ecfdf5' }}>
                      <th style={{ padding: '8px 12px', fontSize: 13, fontWeight: 600, textAlign: 'left', borderBottom: '1px solid #d1fae5' }}>代墊單號</th>
                      <th style={{ padding: '8px 12px', fontSize: 13, fontWeight: 600, textAlign: 'left', borderBottom: '1px solid #d1fae5' }}>代墊員工</th>
                      <th style={{ padding: '8px 12px', fontSize: 13, fontWeight: 600, textAlign: 'left', borderBottom: '1px solid #d1fae5' }}>費用名稱</th>
                      <th style={{ padding: '8px 12px', fontSize: 13, fontWeight: 600, textAlign: 'left', borderBottom: '1px solid #d1fae5' }}>摘要</th>
                      <th style={{ padding: '8px 12px', fontSize: 13, fontWeight: 600, textAlign: 'right', borderBottom: '1px solid #d1fae5' }}>金額</th>
                      <th style={{ padding: '8px 12px', fontSize: 13, fontWeight: 600, textAlign: 'center', borderBottom: '1px solid #d1fae5' }}>取消</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedAdvances.map(a => (
                      <tr key={a.id}>
                        <td style={{ padding: '6px 12px', fontSize: 13, borderBottom: '1px solid #f3f4f6', fontFamily: 'monospace' }}>{a.advanceNo}</td>
                        <td style={{ padding: '6px 12px', fontSize: 13, borderBottom: '1px solid #f3f4f6', fontWeight: 600 }}>{a.employeeName}</td>
                        <td style={{ padding: '6px 12px', fontSize: 13, borderBottom: '1px solid #f3f4f6' }}>{a.expenseName || '-'}</td>
                        <td style={{ padding: '6px 12px', fontSize: 13, borderBottom: '1px solid #f3f4f6' }}>{a.summary || a.sourceDescription || '-'}</td>
                        <td style={{ padding: '6px 12px', fontSize: 13, borderBottom: '1px solid #f3f4f6', textAlign: 'right', fontWeight: 600 }}>NT$ {Number(a.amount).toLocaleString()}</td>
                        <td style={{ padding: '6px 12px', fontSize: 13, borderBottom: '1px solid #f3f4f6', textAlign: 'center' }}>
                          <button onClick={() => toggleSelect(a.id)} style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: 14 }}>✕</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: '#ecfdf5' }}>
                      <td colSpan={4} style={{ padding: '8px 12px', fontSize: 14, fontWeight: 700 }}>代墊公費合計</td>
                      <td style={{ padding: '8px 12px', fontSize: 15, fontWeight: 700, textAlign: 'right', color: '#dc2626' }}>NT$ {selectedTotal.toLocaleString()}</td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>

                {/* Settlement form */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 12 }}>
                  <div>
                    <label style={{ fontSize: 13, color: '#065f46', display: 'block', marginBottom: 4, fontWeight: 600 }}>付款帳戶 *</label>
                    <select value={settleAccountId} onChange={e => setSettleAccountId(e.target.value)} style={{ width: '100%', padding: '8px 10px', border: '1px solid #86efac', borderRadius: 6, fontSize: 14 }}>
                      <option value="">選擇帳戶</option>
                      {bankAccounts.map(a => <option key={a.id} value={a.id}>{a.name} ({a.type})</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: 13, color: '#065f46', display: 'block', marginBottom: 4, fontWeight: 600 }}>結算日期 *</label>
                    <input type="date" value={settleDate} onChange={e => setSettleDate(e.target.value)} style={{ width: '100%', padding: '8px 10px', border: '1px solid #86efac', borderRadius: 6, fontSize: 14, boxSizing: 'border-box' }} />
                  </div>
                  <div>
                    <label style={{ fontSize: 13, color: '#065f46', display: 'block', marginBottom: 4, fontWeight: 600 }}>備註</label>
                    <input value={settleNote} onChange={e => setSettleNote(e.target.value)} placeholder="選填" style={{ width: '100%', padding: '8px 10px', border: '1px solid #86efac', borderRadius: 6, fontSize: 14, boxSizing: 'border-box' }} />
                  </div>
                </div>

                {/* Credit card bill section */}
                <div style={{ background: '#faf5ff', border: '1px solid #d8b4fe', borderRadius: 8, padding: 16, marginBottom: 12 }}>
                  <h4 style={{ fontSize: 14, fontWeight: 700, color: '#7c3aed', marginBottom: 8 }}>信用卡帳單拆帳（選填）</h4>
                  <p style={{ fontSize: 12, color: '#6b7280', marginBottom: 12 }}>
                    若信用卡帳單包含老闆私帳，請輸入帳單總額，系統會自動計算私帳金額並建立「股東往來」交易記錄。
                  </p>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, alignItems: 'end' }}>
                    <div>
                      <label style={{ fontSize: 13, color: '#7c3aed', display: 'block', marginBottom: 4, fontWeight: 600 }}>信用卡帳單總額</label>
                      <input type="number" value={billTotal} onChange={e => setBillTotal(e.target.value)} placeholder="留空則不拆帳" style={{ width: '100%', padding: '8px 10px', border: '1px solid #d8b4fe', borderRadius: 6, fontSize: 14, boxSizing: 'border-box' }} />
                    </div>
                    <div>
                      <label style={{ fontSize: 13, color: '#7c3aed', display: 'block', marginBottom: 4, fontWeight: 600 }}>老闆私帳金額（自動計算）</label>
                      <div style={{ padding: '8px 10px', background: '#ede9fe', borderRadius: 6, fontSize: 15, fontWeight: 700, color: billTotal && privateAmount > 0 ? '#7c3aed' : '#9ca3af' }}>
                        {billTotal ? `NT$ ${privateAmount.toLocaleString()}` : '—'}
                      </div>
                    </div>
                    <div>
                      <label style={{ fontSize: 13, color: '#7c3aed', display: 'block', marginBottom: 4, fontWeight: 600 }}>私帳入帳科目</label>
                      <select value={privateAccountId} onChange={e => setPrivateAccountId(e.target.value)} disabled={!billTotal || privateAmount <= 0} style={{ width: '100%', padding: '8px 10px', border: '1px solid #d8b4fe', borderRadius: 6, fontSize: 14, opacity: billTotal && privateAmount > 0 ? 1 : 0.5 }}>
                        <option value="">股東往來（預設）</option>
                        {bankAccounts.map(a => <option key={a.id} value={a.id}>{a.name} ({a.type})</option>)}
                      </select>
                    </div>
                  </div>
                  {billTotal && parseFloat(billTotal) < selectedTotal && (
                    <div style={{ marginTop: 8, padding: 8, background: '#fef2f2', borderRadius: 6, fontSize: 13, color: '#dc2626' }}>
                      帳單總額不能小於代墊公費合計 NT$ {selectedTotal.toLocaleString()}
                    </div>
                  )}
                  {billTotal && privateAmount > 0 && (
                    <div style={{ marginTop: 8, padding: 8, background: '#f5f3ff', borderRadius: 6, fontSize: 13, color: '#5b21b6' }}>
                      帳單總額 NT$ {parseFloat(billTotal).toLocaleString()} = 代墊公費 NT$ {selectedTotal.toLocaleString()} + 老闆私帳 NT$ {privateAmount.toLocaleString()}
                    </div>
                  )}
                </div>

                {/* Summary and settle button */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 12, borderTop: '1px solid #86efac' }}>
                  <div style={{ fontSize: 14, color: '#065f46' }}>
                    <span style={{ fontWeight: 600 }}>付款總額：</span>
                    <span style={{ fontSize: 18, fontWeight: 700, color: '#dc2626' }}>NT$ {(billTotal && privateAmount > 0 ? parseFloat(billTotal) : selectedTotal).toLocaleString()}</span>
                    {billTotal && privateAmount > 0 && (
                      <span style={{ fontSize: 13, color: '#6b7280', marginLeft: 8 }}>
                        （公費 {selectedTotal.toLocaleString()} + 私帳 {privateAmount.toLocaleString()}）
                      </span>
                    )}
                  </div>
                  <button onClick={handleSettle} disabled={settling} style={{ padding: '10px 28px', background: '#059669', color: '#fff', border: 'none', borderRadius: 8, cursor: settling ? 'not-allowed' : 'pointer', fontSize: 15, fontWeight: 700, opacity: settling ? 0.6 : 1 }}>
                    {settling ? '結算中...' : '確認結算'}
                  </button>
                </div>
              </div>
            )}

            {filteredPending.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 40, color: '#9ca3af' }}>目前沒有待結算的代墊款</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#f9fafb' }}>
                    <th style={thStyle}>
                      <input type="checkbox" checked={selectedIds.size === filteredPending.length && filteredPending.length > 0} onChange={toggleSelectAll} />
                    </th>
                    <SortableThInline label="代墊單號" colKey="advanceNo" sortKey={advPenKey} sortDir={advPenDir} onSort={toggleAdvPen} thStyle={thStyle} />
                    <SortableThInline label="代墊員工" colKey="employeeName" sortKey={advPenKey} sortDir={advPenDir} onSort={toggleAdvPen} thStyle={thStyle} />
                    <SortableThInline label="代墊方式" colKey="paymentMethod" sortKey={advPenKey} sortDir={advPenDir} onSort={toggleAdvPen} thStyle={thStyle} />
                    <SortableThInline label="來源" colKey="source" sortKey={advPenKey} sortDir={advPenDir} onSort={toggleAdvPen} thStyle={thStyle} />
                    <SortableThInline label="費用名稱" colKey="expenseName" sortKey={advPenKey} sortDir={advPenDir} onSort={toggleAdvPen} thStyle={thStyle} />
                    <SortableThInline label="摘要" colKey="summary" sortKey={advPenKey} sortDir={advPenDir} onSort={toggleAdvPen} thStyle={thStyle} />
                    <SortableThInline label="金額" colKey="amount" sortKey={advPenKey} sortDir={advPenDir} onSort={toggleAdvPen} thStyle={{ ...thStyle, textAlign: 'right' }} align="right" />
                    <SortableThInline label="建立日期" colKey="createdAt" sortKey={advPenKey} sortDir={advPenDir} onSort={toggleAdvPen} thStyle={thStyle} />
                    <th style={thStyle}>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedFilteredPending.map(a => (
                    <tr key={a.id} style={{ background: selectedIds.has(a.id) ? '#eff6ff' : 'transparent' }}>
                      <td style={tdStyle}>
                        <input type="checkbox" checked={selectedIds.has(a.id)} onChange={() => toggleSelect(a.id)} />
                      </td>
                      <td style={tdStyle}><span style={{ fontFamily: 'monospace', fontSize: 14 }}>{a.advanceNo}</span></td>
                      <td style={tdStyle}><span style={{ fontWeight: 600 }}>{a.employeeName}</span></td>
                      <td style={tdStyle}>
                        <span style={{ padding: '2px 8px', borderRadius: 12, fontSize: 13, background: a.paymentMethod === '信用卡' ? '#dbeafe' : '#f3f4f6', color: a.paymentMethod === '信用卡' ? '#1d4ed8' : '#374151' }}>
                          {a.paymentMethod}
                        </span>
                      </td>
                      <td style={tdStyle}><span style={{ fontSize: 14, color: '#6b7280' }}>{a.sourceType === 'maintenance' ? '維護費' : a.sourceType === 'expense' ? '費用' : '其他'}</span></td>
                      <td style={tdStyle}><span style={{ fontSize: 14 }}>{a.expenseName || '-'}</span></td>
                      <td style={tdStyle}><span style={{ fontSize: 14 }}>{a.summary || a.sourceDescription || '-'}</span></td>
                      <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600, color: '#dc2626' }}>NT$ {Number(a.amount).toLocaleString()}</td>
                      <td style={tdStyle}><span style={{ fontSize: 14, color: '#6b7280' }}>{a.createdAt?.substring(0, 10)}</span></td>
                      <td style={tdStyle}>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button onClick={() => openEditAdvance(a)} style={{ padding: '4px 10px', fontSize: 13, color: '#2563eb', background: 'none', border: '1px solid #2563eb', borderRadius: 4, cursor: 'pointer' }}>編輯</button>
                          <button onClick={() => handleDeleteAdvance(a)} style={{ padding: '4px 10px', fontSize: 13, color: '#dc2626', background: 'none', border: '1px solid #dc2626', borderRadius: 4, cursor: 'pointer' }}>刪除</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ background: '#f9fafb' }}>
                    <td colSpan={7} style={{ ...tdStyle, fontWeight: 600 }}>合計 {filteredPending.length} 筆</td>
                    <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700, color: '#dc2626' }}>NT$ {filteredPending.reduce((s, a) => s + Number(a.amount), 0).toLocaleString()}</td>
                    <td colSpan={2} style={tdStyle}></td>
                  </tr>
                </tfoot>
              </table>
            )}
          </div>
        )}

        {/* Settled Tab */}
        {activeTab === 'settled' && (
          <div>
            {settledAdvances.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 40, color: '#9ca3af' }}>尚無已結算紀錄</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#f9fafb' }}>
                    <SortableThInline label="代墊單號" colKey="advanceNo" sortKey={advSetKey} sortDir={advSetDir} onSort={toggleAdvSet} thStyle={thStyle} />
                    <SortableThInline label="代墊員工" colKey="employeeName" sortKey={advSetKey} sortDir={advSetDir} onSort={toggleAdvSet} thStyle={thStyle} />
                    <SortableThInline label="代墊方式" colKey="paymentMethod" sortKey={advSetKey} sortDir={advSetDir} onSort={toggleAdvSet} thStyle={thStyle} />
                    <SortableThInline label="說明" colKey="description" sortKey={advSetKey} sortDir={advSetDir} onSort={toggleAdvSet} thStyle={thStyle} />
                    <SortableThInline label="代墊金額" colKey="amount" sortKey={advSetKey} sortDir={advSetDir} onSort={toggleAdvSet} thStyle={{ ...thStyle, textAlign: 'right' }} align="right" />
                    <SortableThInline label="結算日期" colKey="settledDate" sortKey={advSetKey} sortDir={advSetDir} onSort={toggleAdvSet} thStyle={thStyle} />
                    <SortableThInline label="結算交易" colKey="settlementTxNo" sortKey={advSetKey} sortDir={advSetDir} onSort={toggleAdvSet} thStyle={thStyle} />
                  </tr>
                </thead>
                <tbody>
                  {sortedSettledAdvances.map(a => (
                    <tr key={a.id}>
                      <td style={tdStyle}><span style={{ fontFamily: 'monospace', fontSize: 14 }}>{a.advanceNo}</span></td>
                      <td style={tdStyle}><span style={{ fontWeight: 600 }}>{a.employeeName}</span></td>
                      <td style={tdStyle}>
                        <span style={{ padding: '2px 8px', borderRadius: 12, fontSize: 13, background: a.paymentMethod === '信用卡' ? '#dbeafe' : '#f3f4f6', color: a.paymentMethod === '信用卡' ? '#1d4ed8' : '#374151' }}>
                          {a.paymentMethod}
                        </span>
                      </td>
                      <td style={tdStyle}><span style={{ fontSize: 14 }}>{a.sourceDescription || '-'}</span></td>
                      <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600 }}>NT$ {Number(a.amount).toLocaleString()}</td>
                      <td style={tdStyle}>{a.settledDate || '-'}</td>
                      <td style={tdStyle}><span style={{ fontFamily: 'monospace', fontSize: 14, color: '#059669' }}>{a.settlementTxNo || '-'}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* Employees Tab */}
        {activeTab === 'employees' && (
          <div>
            {employeeSummaryList.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 40, color: '#9ca3af' }}>尚無代墊款紀錄</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#f9fafb' }}>
                    <SortableThInline label="員工" colKey="name" sortKey={advEmpKey} sortDir={advEmpDir} onSort={toggleAdvEmp} thStyle={thStyle} />
                    <SortableThInline label="待結算筆數" colKey="pending" sortKey={advEmpKey} sortDir={advEmpDir} onSort={toggleAdvEmp} thStyle={{ ...thStyle, textAlign: 'center' }} align="center" />
                    <SortableThInline label="待結算金額" colKey="pendingAmount" sortKey={advEmpKey} sortDir={advEmpDir} onSort={toggleAdvEmp} thStyle={{ ...thStyle, textAlign: 'right' }} align="right" />
                    <SortableThInline label="已結算筆數" colKey="settled" sortKey={advEmpKey} sortDir={advEmpDir} onSort={toggleAdvEmp} thStyle={{ ...thStyle, textAlign: 'center' }} align="center" />
                    <SortableThInline label="已結算金額" colKey="settledAmount" sortKey={advEmpKey} sortDir={advEmpDir} onSort={toggleAdvEmp} thStyle={{ ...thStyle, textAlign: 'right' }} align="right" />
                    <SortableThInline label="總筆數" colKey="total" sortKey={advEmpKey} sortDir={advEmpDir} onSort={toggleAdvEmp} thStyle={{ ...thStyle, textAlign: 'center' }} align="center" />
                    <th style={thStyle}>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedEmployeeSummary.map(emp => (
                    <tr key={emp.name}>
                      <td style={tdStyle}><span style={{ fontWeight: 600, fontSize: 14 }}>{emp.name}</span></td>
                      <td style={{ ...tdStyle, textAlign: 'center' }}>
                        {emp.pending > 0 ? <span style={{ background: '#fef3c7', color: '#92400e', padding: '3px 12px', borderRadius: 12, fontSize: 14, fontWeight: 600 }}>{emp.pending}</span> : <span style={{ color: '#9ca3af' }}>0</span>}
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'right', fontWeight: emp.pendingAmount > 0 ? 700 : 400, color: emp.pendingAmount > 0 ? '#dc2626' : '#9ca3af' }}>
                        NT$ {emp.pendingAmount.toLocaleString()}
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'center', color: '#6b7280' }}>{emp.settled}</td>
                      <td style={{ ...tdStyle, textAlign: 'right', color: '#6b7280' }}>NT$ {emp.settledAmount.toLocaleString()}</td>
                      <td style={{ ...tdStyle, textAlign: 'center' }}>{emp.total}</td>
                      <td style={tdStyle}>
                        {emp.pending > 0 && (
                          <button onClick={() => { setActiveTab('pending'); setFilterEmployee(emp.name); }} style={{ padding: '4px 12px', background: '#059669', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 12 }}>
                            去結算
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

      {/* Edit Modal */}
      {editingAdvance && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#fff', padding: 24, borderRadius: 12, width: 500, maxHeight: '80vh', overflow: 'auto' }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>編輯代墊款 — {editingAdvance.advanceNo}</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, color: '#6b7280', display: 'block', marginBottom: 4 }}>代墊員工 *</label>
                <input value={editForm.employeeName} onChange={e => setEditForm(f => ({ ...f, employeeName: e.target.value }))}
                  style={{ width: '100%', padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 14, boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ fontSize: 12, color: '#6b7280', display: 'block', marginBottom: 4 }}>付款方式</label>
                <select value={editForm.paymentMethod} onChange={e => setEditForm(f => ({ ...f, paymentMethod: e.target.value }))}
                  style={{ width: '100%', padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 14, boxSizing: 'border-box' }}>
                  <option value="現金">現金</option>
                  <option value="信用卡">信用卡</option>
                  <option value="其他">其他</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize: 12, color: '#6b7280', display: 'block', marginBottom: 4 }}>金額 *</label>
                <input type="number" value={editForm.amount} onChange={e => setEditForm(f => ({ ...f, amount: e.target.value }))}
                  style={{ width: '100%', padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 14, boxSizing: 'border-box', textAlign: 'right' }} />
              </div>
              <div>
                <label style={{ fontSize: 12, color: '#6b7280', display: 'block', marginBottom: 4 }}>費用名稱</label>
                <input value={editForm.expenseName} onChange={e => setEditForm(f => ({ ...f, expenseName: e.target.value }))}
                  style={{ width: '100%', padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 14, boxSizing: 'border-box' }} />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ fontSize: 12, color: '#6b7280', display: 'block', marginBottom: 4 }}>摘要</label>
                <input value={editForm.summary} onChange={e => setEditForm(f => ({ ...f, summary: e.target.value }))}
                  style={{ width: '100%', padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 14, boxSizing: 'border-box' }} />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ fontSize: 12, color: '#6b7280', display: 'block', marginBottom: 4 }}>來源說明</label>
                <input value={editForm.sourceDescription} onChange={e => setEditForm(f => ({ ...f, sourceDescription: e.target.value }))}
                  style={{ width: '100%', padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 14, boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ fontSize: 12, color: '#6b7280', display: 'block', marginBottom: 4 }}>館別</label>
                <input value={editForm.warehouse} onChange={e => setEditForm(f => ({ ...f, warehouse: e.target.value }))}
                  style={{ width: '100%', padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 14, boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ fontSize: 12, color: '#6b7280', display: 'block', marginBottom: 4 }}>備註</label>
                <input value={editForm.note} onChange={e => setEditForm(f => ({ ...f, note: e.target.value }))}
                  style={{ width: '100%', padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 14, boxSizing: 'border-box' }} />
              </div>
            </div>
            {editingAdvance.paymentOrderNo && (
              <div style={{ marginTop: 12, padding: 8, background: '#f3f4f6', borderRadius: 6, fontSize: 12, color: '#6b7280' }}>
                關聯付款單：{editingAdvance.paymentOrderNo}（修改金額會同步更新付款單和費用記錄）
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
              <button onClick={() => setEditingAdvance(null)} style={{ padding: '8px 20px', background: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}>取消</button>
              <button onClick={handleEditSave} style={{ padding: '8px 20px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>儲存</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
