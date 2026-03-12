'use client';

import { useState, useEffect, useMemo } from 'react';
import { useSession } from 'next-auth/react';
import Navigation from '@/components/Navigation';

export default function EmployeeAdvancesPage() {
  const { data: session } = useSession();
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
    employeeName: '', paymentMethod: '現金', amount: '', sourceDescription: '', warehouse: '', note: '',
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

  // Group by employee
  const employeeSummary = useMemo(() => {
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
    return Object.values(map).sort((a, b) => b.pendingAmount - a.pendingAmount);
  }, [advances]);

  // Filter pending by employee for settlement
  const [filterEmployee, setFilterEmployee] = useState('');
  const filteredPending = useMemo(() => {
    if (!filterEmployee) return pendingAdvances;
    return pendingAdvances.filter(a => a.employeeName === filterEmployee);
  }, [pendingAdvances, filterEmployee]);

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
    if (selectedIds.size === 0) return alert('請勾選要結算的代墊款');
    if (!settleAccountId) return alert('請選擇付款帳戶');

    const acct = accounts.find(a => a.id === parseInt(settleAccountId));
    if (!confirm(`確定從「${acct?.name || '帳戶'}」支付 ${selectedIds.size} 筆代墊款，共 NT$ ${selectedTotal.toLocaleString()}？`)) return;

    setSettling(true);
    try {
      const res = await fetch('/api/employee-advances/settle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          advanceIds: Array.from(selectedIds),
          accountId: parseInt(settleAccountId),
          settleDate,
          note: settleNote || null,
        }),
      });
      const result = await res.json();
      if (res.ok) {
        alert(result.message || '結算成功');
        setSelectedIds(new Set());
        setSettleNote('');
        fetchAll();
      } else {
        alert(result.error?.message || result.message || '結算失敗');
      }
    } catch (err) {
      alert('結算失敗: ' + err.message);
    }
    setSettling(false);
  }

  async function handleAdd(e) {
    e.preventDefault();
    if (!addForm.employeeName || !addForm.amount) return alert('請填寫員工姓名和金額');
    try {
      const res = await fetch('/api/employee-advances', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(addForm),
      });
      if (res.ok) {
        alert('新增成功');
        setShowAddForm(false);
        setAddForm({ employeeName: '', paymentMethod: '現金', amount: '', sourceDescription: '', warehouse: '', note: '' });
        fetchAll();
      } else {
        const err = await res.json();
        alert(err.error?.message || '新增失敗');
      }
    } catch { alert('新增失敗'); }
  }

  const bankAccounts = accounts.filter(a => a.isActive && (a.type === '銀行存款' || a.type === '現金'));
  const employeeNames = [...new Set(advances.map(a => a.employeeName))].sort();

  const TABS = [
    { key: 'pending', label: `待結算 (${pendingAdvances.length})` },
    { key: 'settled', label: `已結算 (${settledAdvances.length})` },
    { key: 'employees', label: `員工總覽 (${employeeSummary.length})` },
  ];

  const thStyle = { padding: '10px 12px', textAlign: 'left', borderBottom: '2px solid #e5e7eb', fontSize: 13, fontWeight: 600, color: '#374151', whiteSpace: 'nowrap' };
  const tdStyle = { padding: '10px 12px', borderBottom: '1px solid #f3f4f6', fontSize: 13 };

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
          <button onClick={() => setShowAddForm(v => !v)} style={{ padding: '8px 16px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}>
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
            <div style={{ fontSize: 24, fontWeight: 700, color: '#3730a3' }}>{employeeSummary.length}</div>
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
            {/* Filter + settle bar */}
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
              <div>
                <label style={{ fontSize: 12, color: '#6b7280', marginRight: 4 }}>篩選員工：</label>
                <select value={filterEmployee} onChange={e => { setFilterEmployee(e.target.value); setSelectedIds(new Set()); }} style={{ padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 13 }}>
                  <option value="">全部</option>
                  {employeeNames.map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
              <div style={{ flex: 1 }} />
              {selectedIds.size > 0 && (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', background: '#eff6ff', padding: '8px 16px', borderRadius: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>已選 {selectedIds.size} 筆，共 NT$ {selectedTotal.toLocaleString()}</span>
                  <select value={settleAccountId} onChange={e => setSettleAccountId(e.target.value)} style={{ padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 13 }}>
                    <option value="">選擇付款帳戶</option>
                    {bankAccounts.map(a => <option key={a.id} value={a.id}>{a.name} ({a.type})</option>)}
                  </select>
                  <input type="date" value={settleDate} onChange={e => setSettleDate(e.target.value)} style={{ padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 13 }} />
                  <button onClick={handleSettle} disabled={settling} style={{ padding: '8px 16px', background: '#059669', color: '#fff', border: 'none', borderRadius: 6, cursor: settling ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 600, opacity: settling ? 0.6 : 1 }}>
                    {settling ? '結算中...' : '確認結算'}
                  </button>
                </div>
              )}
            </div>

            {filteredPending.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 40, color: '#9ca3af' }}>目前沒有待結算的代墊款</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#f9fafb' }}>
                    <th style={thStyle}>
                      <input type="checkbox" checked={selectedIds.size === filteredPending.length && filteredPending.length > 0} onChange={toggleSelectAll} />
                    </th>
                    <th style={thStyle}>代墊單號</th>
                    <th style={thStyle}>代墊員工</th>
                    <th style={thStyle}>代墊方式</th>
                    <th style={thStyle}>來源</th>
                    <th style={thStyle}>說明</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>金額</th>
                    <th style={thStyle}>建立日期</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPending.map(a => (
                    <tr key={a.id} style={{ background: selectedIds.has(a.id) ? '#eff6ff' : 'transparent' }}>
                      <td style={tdStyle}>
                        <input type="checkbox" checked={selectedIds.has(a.id)} onChange={() => toggleSelect(a.id)} />
                      </td>
                      <td style={tdStyle}><span style={{ fontFamily: 'monospace', fontSize: 12 }}>{a.advanceNo}</span></td>
                      <td style={tdStyle}><span style={{ fontWeight: 600 }}>{a.employeeName}</span></td>
                      <td style={tdStyle}>
                        <span style={{ padding: '2px 8px', borderRadius: 12, fontSize: 11, background: a.paymentMethod === '信用卡' ? '#dbeafe' : '#f3f4f6', color: a.paymentMethod === '信用卡' ? '#1d4ed8' : '#374151' }}>
                          {a.paymentMethod}
                        </span>
                      </td>
                      <td style={tdStyle}><span style={{ fontSize: 12, color: '#6b7280' }}>{a.sourceType === 'maintenance' ? '維護費' : a.sourceType === 'expense' ? '費用' : '其他'}</span></td>
                      <td style={tdStyle}><span style={{ fontSize: 12 }}>{a.sourceDescription || '-'}</span></td>
                      <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600, color: '#dc2626' }}>NT$ {Number(a.amount).toLocaleString()}</td>
                      <td style={tdStyle}><span style={{ fontSize: 12, color: '#6b7280' }}>{a.createdAt?.substring(0, 10)}</span></td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ background: '#f9fafb' }}>
                    <td colSpan={6} style={{ ...tdStyle, fontWeight: 600 }}>合計 {filteredPending.length} 筆</td>
                    <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700, color: '#dc2626' }}>NT$ {filteredPending.reduce((s, a) => s + Number(a.amount), 0).toLocaleString()}</td>
                    <td style={tdStyle}></td>
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
                    <th style={thStyle}>代墊單號</th>
                    <th style={thStyle}>代墊員工</th>
                    <th style={thStyle}>代墊方式</th>
                    <th style={thStyle}>說明</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>代墊金額</th>
                    <th style={thStyle}>結算日期</th>
                    <th style={thStyle}>結算交易</th>
                  </tr>
                </thead>
                <tbody>
                  {settledAdvances.map(a => (
                    <tr key={a.id}>
                      <td style={tdStyle}><span style={{ fontFamily: 'monospace', fontSize: 12 }}>{a.advanceNo}</span></td>
                      <td style={tdStyle}><span style={{ fontWeight: 600 }}>{a.employeeName}</span></td>
                      <td style={tdStyle}>
                        <span style={{ padding: '2px 8px', borderRadius: 12, fontSize: 11, background: a.paymentMethod === '信用卡' ? '#dbeafe' : '#f3f4f6', color: a.paymentMethod === '信用卡' ? '#1d4ed8' : '#374151' }}>
                          {a.paymentMethod}
                        </span>
                      </td>
                      <td style={tdStyle}><span style={{ fontSize: 12 }}>{a.sourceDescription || '-'}</span></td>
                      <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600 }}>NT$ {Number(a.amount).toLocaleString()}</td>
                      <td style={tdStyle}>{a.settledDate || '-'}</td>
                      <td style={tdStyle}><span style={{ fontFamily: 'monospace', fontSize: 12, color: '#059669' }}>{a.settlementTxNo || '-'}</span></td>
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
            {employeeSummary.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 40, color: '#9ca3af' }}>尚無代墊款紀錄</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#f9fafb' }}>
                    <th style={thStyle}>員工</th>
                    <th style={{ ...thStyle, textAlign: 'center' }}>待結算筆數</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>待結算金額</th>
                    <th style={{ ...thStyle, textAlign: 'center' }}>已結算筆數</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>已結算金額</th>
                    <th style={{ ...thStyle, textAlign: 'center' }}>總筆數</th>
                    <th style={thStyle}>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {employeeSummary.map(emp => (
                    <tr key={emp.name}>
                      <td style={tdStyle}><span style={{ fontWeight: 600, fontSize: 14 }}>{emp.name}</span></td>
                      <td style={{ ...tdStyle, textAlign: 'center' }}>
                        {emp.pending > 0 ? <span style={{ background: '#fef3c7', color: '#92400e', padding: '2px 10px', borderRadius: 12, fontSize: 12, fontWeight: 600 }}>{emp.pending}</span> : <span style={{ color: '#9ca3af' }}>0</span>}
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
    </>
  );
}
