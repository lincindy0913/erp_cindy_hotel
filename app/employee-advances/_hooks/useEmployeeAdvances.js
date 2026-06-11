'use client';

import { useState, useEffect, useMemo } from 'react';
import { useSession } from 'next-auth/react';
import { useToast } from '@/context/ToastContext';
import { useConfirm } from '@/context/ConfirmContext';
import { sortRows, useColumnSort } from '@/components/SortableTh';
import { todayStr } from '@/lib/localDate';

export function useEmployeeAdvances() {
  const { data: session } = useSession();
  const { showToast } = useToast();
  const confirm = useConfirm();

  const [activeTab, setActiveTab] = useState('pending');
  const [advances, setAdvances] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(null);

  // Settlement form
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [settleAccountId, setSettleAccountId] = useState('');
  const [settleDate, setSettleDate] = useState(todayStr());
  const [settleNote, setSettleNote] = useState('');
  const [settling, setSettling] = useState(false);
  const [billTotal, setBillTotal] = useState('');
  const [privateAccountId, setPrivateAccountId] = useState('');

  // Add form
  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState({
    employeeName: '', paymentMethod: '現金', amount: '', sourceDescription: '', expenseName: '', summary: '', warehouse: '', note: '',
  });

  const [warehousesList, setWarehousesList] = useState([]);
  const [expenseCategories, setExpenseCategories] = useState([]);

  // Edit state
  const [editingAdvance, setEditingAdvance] = useState(null);
  const [editForm, setEditForm] = useState({});

  // Filter
  const [filterEmployee, setFilterEmployee] = useState('');

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchAll(); }, []);

  async function fetchAll() {
    setLoading(true);
    setFetchError(null);
    try {
      const [advRes, accRes, whRes, catRes] = await Promise.all([
        fetch('/api/employee-advances').then(r => r.ok ? r.json() : Promise.reject()),
        fetch('/api/cashflow/accounts').then(r => r.json()).catch(() => []),
        fetch('/api/warehouse-departments').then(r => r.json()).catch(() => ({ list: [] })),
        fetch('/api/settings/expense-categories').then(r => r.json()).catch(() => []),
      ]);
      setAdvances(Array.isArray(advRes) ? advRes : []);
      setAccounts(Array.isArray(accRes) ? accRes : []);
      setWarehousesList(Array.isArray(whRes?.list) ? whRes.list.filter(w => w.type === 'building') : []);
      setExpenseCategories(Array.isArray(catRes) ? catRes : []);
    } catch {
      setFetchError('代墊款資料載入失敗，請稍後再試');
    }
    setLoading(false);
  }

  const pendingAdvances = useMemo(() => advances.filter(a => a.status === '待結算'), [advances]);
  const settledAdvances = useMemo(() => advances.filter(a => a.status === '已結算'), [advances]);

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
  const privateAmount = billTotal ? Math.max(0, parseFloat(billTotal) - selectedTotal) : 0;

  const bankAccounts = accounts.filter(a => a.isActive && (a.type === '銀行存款' || a.type === '現金'));
  const employeeNames = [...new Set(advances.map(a => a.employeeName))].sort();

  const TABS = [
    { key: 'pending', label: `待結算 (${pendingAdvances.length})` },
    { key: 'settled', label: `已結算 (${settledAdvances.length})` },
    { key: 'employees', label: `員工總覽 (${employeeSummaryList.length})` },
  ];

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
    if (!(await confirm(confirmMsg, { title: '結算確認', danger: false }))) return;

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
    if (!(await confirm(`確定刪除代墊款「${adv.advanceNo}」？\n${adv.expenseName || adv.sourceDescription || ''} NT$ ${Number(adv.amount).toLocaleString()}\n\n此操作會連動刪除關聯的費用記錄和付款單。`, { title: '刪除確認', danger: true }))) return;
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

  function handlePrint(activeTab, filteredPending, settledAdvances) {
    const rows = activeTab === 'pending' ? filteredPending :
      activeTab === 'settled' ? settledAdvances : [];
    if (rows.length === 0) { showToast('目前無資料可列印', 'error'); return; }
    const tabLabel = activeTab === 'pending' ? '待結算' : '已結算';
    const w = window.open('', '_blank');
    w.document.write(`<html><head><title>代墊款 — ${tabLabel}</title>
      <style>body{font-family:'Microsoft JhengHei',sans-serif;padding:20px}
      table{width:100%;border-collapse:collapse;font-size:15px}
      th,td{border:1px solid #ccc;padding:6px 8px;text-align:left}
      th{background:#f5f5f5;font-weight:600}
      .right{text-align:right} .center{text-align:center}
      @media print{button{display:none}}</style></head><body>
      <h2>員工代墊款 — ${tabLabel}</h2>
      <p>列印日期：${new Date().toLocaleDateString('zh-TW')}　共 ${rows.length} 筆</p>
      <table><thead><tr>
        <th>代墊單號</th><th>代墊人</th><th>方式</th><th>費用名稱</th><th>摘要</th>
        <th>館別</th><th class="right">金額</th><th>狀態</th>
        ${activeTab === 'settled' ? '<th>結算交易</th>' : ''}
      </tr></thead><tbody>
      ${rows.map(a => `<tr>
        <td>${a.advanceNo || ''}</td><td>${a.employeeName || ''}</td><td>${a.paymentMethod || ''}</td>
        <td>${a.expenseName || ''}</td><td>${a.summary || a.sourceDescription || ''}</td>
        <td>${a.warehouse || ''}</td><td class="right">NT$ ${Number(a.amount).toLocaleString()}</td>
        <td>${a.status}</td>
        ${activeTab === 'settled' ? `<td>${a.settlementTxNo || ''}</td>` : ''}
      </tr>`).join('')}
      </tbody><tfoot><tr>
        <td colspan="${activeTab === 'settled' ? 6 : 6}" style="font-weight:600">合計 ${rows.length} 筆</td>
        <td class="right" style="font-weight:700">NT$ ${rows.reduce((s, a) => s + Number(a.amount), 0).toLocaleString()}</td>
        <td colspan="${activeTab === 'settled' ? 2 : 1}"></td>
      </tr></tfoot></table>
      <button onclick="window.print()" style="margin-top:16px;padding:8px 24px;font-size:17px;cursor:pointer">列印</button>
      </body></html>`);
    w.document.close();
  }

  function handleExportExcel(activeTab, filteredPending, settledAdvances) {
    const rows = activeTab === 'pending' ? filteredPending :
      activeTab === 'settled' ? settledAdvances : [];
    if (rows.length === 0) { showToast('目前無資料可匯出', 'error'); return; }
    const tabLabel = activeTab === 'pending' ? '待結算' : '已結算';
    const header = ['代墊單號', '代墊人', '方式', '費用名稱', '摘要', '館別', '金額', '狀態',
      ...(activeTab === 'settled' ? ['結算交易號'] : [])];
    const csvRows = [header.join(',')];
    rows.forEach(a => {
      const cols = [
        a.advanceNo || '', a.employeeName || '', a.paymentMethod || '',
        a.expenseName || '', a.summary || a.sourceDescription || '', a.warehouse || '',
        Number(a.amount), a.status,
        ...(activeTab === 'settled' ? [a.settlementTxNo || ''] : []),
      ];
      csvRows.push(cols.map(c => `"${String(c).replace(/"/g, '""')}"`).join(','));
    });
    const bom = '﻿';
    const blob = new Blob([bom + csvRows.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `代墊款_${tabLabel}_${todayStr()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return {
    // session (exposed in case page needs it)
    session,
    // data
    advances, accounts, loading, fetchError, fetchAll,
    // tab
    activeTab, setActiveTab, TABS,
    // pending / settled / summary
    pendingAdvances, settledAdvances, employeeSummaryList,
    filteredPending, sortedFilteredPending,
    sortedSettledAdvances, sortedEmployeeSummary,
    // sort hooks
    advPenKey, advPenDir, toggleAdvPen,
    advSetKey, advSetDir, toggleAdvSet,
    advEmpKey, advEmpDir, toggleAdvEmp,
    // filter
    filterEmployee, setFilterEmployee,
    // selection
    selectedIds, setSelectedIds, selectedAdvances, selectedTotal,
    toggleSelect, toggleSelectAll,
    // settlement form
    settleAccountId, setSettleAccountId,
    settleDate, setSettleDate,
    settleNote, setSettleNote,
    settling, handleSettle,
    billTotal, setBillTotal,
    privateAmount, privateAccountId, setPrivateAccountId,
    // add form
    showAddForm, setShowAddForm,
    addForm, setAddForm, handleAdd,
    // edit
    editingAdvance, setEditingAdvance,
    editForm, setEditForm,
    openEditAdvance, handleEditSave,
    handleDeleteAdvance,
    // derived
    bankAccounts, employeeNames,
    warehousesList, expenseCategories,
    // actions
    handlePrint, handleExportExcel,
  };
}
