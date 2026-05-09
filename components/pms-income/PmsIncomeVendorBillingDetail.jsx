'use client';

import { useState, useCallback, useEffect } from 'react';

const DIRECTION_LABEL = { AR: '應收 AR', AP: '應付 AP' };
const STATUS_COLOR = {
  草稿:  'bg-gray-100 text-gray-600',
  已送出: 'bg-blue-100 text-blue-700',
  已確認: 'bg-amber-100 text-amber-700',
  已結帳: 'bg-green-100 text-green-700',
};
const STATUS_FLOW = ['草稿', '已送出', '已確認', '已結帳'];

function Num({ v, cls = '' }) {
  if (v == null || v === '') return <span className="text-gray-300">—</span>;
  return <span className={cls}>{Number(v).toLocaleString('zh-TW')}</span>;
}

const EMPTY_ITEM = { description: '', guestName: '', checkInDate: '', checkOutDate: '', roomType: '', quantity: 1, unitPrice: '', notes: '' };

export default function PmsIncomeVendorBillingDetail({ billingId, WAREHOUSES, onBack }) {
  const [billing,    setBilling]    = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState('');

  // item form
  const [showItemForm, setShowItemForm] = useState(false);
  const [editItemId,   setEditItemId]   = useState(null);
  const [itemForm,     setItemForm]     = useState(EMPTY_ITEM);
  const [itemSaving,   setItemSaving]   = useState(false);
  const [itemError,    setItemError]    = useState('');

  // settle modal
  const [showSettle,  setShowSettle]  = useState(false);
  const [accounts,    setAccounts]    = useState([]);
  const [settleAccId, setSettleAccId] = useState('');
  const [settleDate,  setSettleDate]  = useState('');
  const [settling,    setSettling]    = useState(false);
  const [settleError, setSettleError] = useState('');
  const [settleOk,    setSettleOk]    = useState('');

  // status update
  const [statusLoading, setStatusLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res  = await fetch(`/api/pms-income/vendor-billing/${billingId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || '載入失敗');
      setBilling(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [billingId]);

  useEffect(() => { load(); }, [load]);

  // load bank accounts when settle modal opens
  const openSettle = async () => {
    setSettleError(''); setSettleOk(''); setSettleAccId(''); setSettleDate('');
    try {
      const res  = await fetch('/api/cashflow/accounts');
      const data = await res.json();
      if (res.ok) {
        const all = Array.isArray(data) ? data : (data.accounts || []);
        setAccounts(all.filter(a => a.type === '銀行存款' && (!billing.warehouse || a.warehouse === billing.warehouse)));
      }
    } catch { setAccounts([]); }
    setShowSettle(true);
  };

  const advanceStatus = async () => {
    const idx  = STATUS_FLOW.indexOf(billing.status);
    const next = STATUS_FLOW[idx + 1];
    if (!next || next === '已結帳') return;
    setStatusLoading(true);
    try {
      const res  = await fetch(`/api/pms-income/vendor-billing/${billingId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || '更新失敗');
      setBilling(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setStatusLoading(false);
    }
  };

  const settle = async () => {
    if (!settleAccId) { setSettleError('請選擇存簿帳戶'); return; }
    setSettling(true); setSettleError('');
    try {
      const res  = await fetch(`/api/pms-income/vendor-billing/${billingId}/settle`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId: parseInt(settleAccId), settleDate }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || '結帳失敗');
      setSettleOk(`結帳完成！金流單號：${data.transactionNo}，${data.type} ${Number(data.amount).toLocaleString('zh-TW')} 元 → ${data.accountName}`);
      await load();
    } catch (e) {
      setSettleError(e.message);
    } finally {
      setSettling(false);
    }
  };

  const openAddItem = () => { setEditItemId(null); setItemForm(EMPTY_ITEM); setItemError(''); setShowItemForm(true); };
  const openEditItem = (item) => {
    setEditItemId(item.id);
    setItemForm({ description: item.description, guestName: item.guestName || '', checkInDate: item.checkInDate || '', checkOutDate: item.checkOutDate || '', roomType: item.roomType || '', quantity: item.quantity, unitPrice: item.unitPrice, notes: item.notes || '' });
    setItemError(''); setShowItemForm(true);
  };

  const saveItem = async () => {
    if (!itemForm.description) { setItemError('請填寫項目說明'); return; }
    if (!itemForm.unitPrice && itemForm.unitPrice !== 0) { setItemError('請填寫單價'); return; }
    setItemSaving(true); setItemError('');
    try {
      const url    = editItemId ? `/api/pms-income/vendor-billing/${billingId}/items/${editItemId}` : `/api/pms-income/vendor-billing/${billingId}/items`;
      const method = editItemId ? 'PATCH' : 'POST';
      const res    = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(itemForm) });
      const data   = await res.json();
      if (!res.ok) throw new Error(data.error?.message || '儲存失敗');
      setShowItemForm(false);
      await load();
    } catch (e) {
      setItemError(e.message);
    } finally {
      setItemSaving(false);
    }
  };

  const deleteItem = async (itemId) => {
    if (!confirm('確定刪除此項目？')) return;
    try {
      const res = await fetch(`/api/pms-income/vendor-billing/${billingId}/items/${itemId}`, { method: 'DELETE' });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error?.message || '刪除失敗'); }
      await load();
    } catch (e) { setError(e.message); }
  };

  const deleteBilling = async () => {
    if (!confirm('確定刪除此帳單及所有項目？')) return;
    try {
      const res = await fetch(`/api/pms-income/vendor-billing/${billingId}`, { method: 'DELETE' });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error?.message || '刪除失敗'); }
      onBack();
    } catch (e) { setError(e.message); }
  };

  if (loading) return <div className="p-8 text-center text-gray-400">載入中…</div>;
  if (error && !billing) return <div className="p-4 bg-red-50 text-red-700 rounded-lg">{error}</div>;
  if (!billing) return null;

  const canAdvance = billing.status !== '已結帳' && billing.status !== '已確認';
  const nextStatus = STATUS_FLOW[STATUS_FLOW.indexOf(billing.status) + 1];
  const canSettle  = billing.status === '已確認' && Number(billing.totalAmount) > 0;
  const isSettled  = billing.status === '已結帳';
  const itemTotal  = (billing.items || []).reduce((s, i) => s + i.amount, 0);

  return (
    <div className="space-y-4">
      {/* back + header */}
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800">
          ← 返回列表
        </button>
        <span className="text-gray-300">|</span>
        <h2 className="text-base font-semibold text-gray-800">
          {billing.warehouse}・{billing.supplierName}・{billing.billingMonth}
        </h2>
        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLOR[billing.status] || 'bg-gray-100 text-gray-600'}`}>
          {billing.status}
        </span>
        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${billing.direction === 'AR' ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'}`}>
          {DIRECTION_LABEL[billing.direction] || billing.direction}
        </span>
      </div>

      {error && <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>}

      {/* info + actions row */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 flex flex-wrap gap-6 items-start">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-8 gap-y-2 flex-1 text-sm">
          <div><span className="text-gray-400 text-xs">館別</span><div className="font-medium">{billing.warehouse}</div></div>
          <div><span className="text-gray-400 text-xs">廠商</span><div className="font-medium">{billing.supplierName}</div></div>
          <div><span className="text-gray-400 text-xs">帳單月份</span><div className="font-medium">{billing.billingMonth}</div></div>
          <div><span className="text-gray-400 text-xs">到期日</span><div className="font-medium">{billing.dueDate || '—'}</div></div>
          <div><span className="text-gray-400 text-xs">帳單金額</span><div className="font-semibold text-indigo-700 text-base"><Num v={billing.totalAmount} /></div></div>
          <div><span className="text-gray-400 text-xs">已結帳金額</span><div className="font-semibold text-green-700 text-base"><Num v={billing.settledAmount} /></div></div>
          {billing.account && <div className="col-span-2"><span className="text-gray-400 text-xs">結帳帳戶</span><div className="font-medium">{billing.account.name}</div></div>}
          {billing.notes  && <div className="col-span-2 sm:col-span-4"><span className="text-gray-400 text-xs">備註</span><div>{billing.notes}</div></div>}
        </div>

        {/* action buttons */}
        <div className="flex flex-col gap-2 min-w-[140px]">
          {canAdvance && nextStatus && nextStatus !== '已結帳' && (
            <button onClick={advanceStatus} disabled={statusLoading}
              className="px-4 py-1.5 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
              {statusLoading ? '更新中…' : `送出為「${nextStatus}」`}
            </button>
          )}
          {billing.status === '已送出' && (
            <button onClick={advanceStatus} disabled={statusLoading}
              className="px-4 py-1.5 text-sm rounded-lg bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50">
              {statusLoading ? '更新中…' : '確認帳單'}
            </button>
          )}
          {canSettle && (
            <button onClick={openSettle}
              className="px-4 py-1.5 text-sm rounded-lg bg-green-600 text-white hover:bg-green-700 font-medium">
              結帳 →
            </button>
          )}
          {!isSettled && (
            <button onClick={deleteBilling} className="px-4 py-1.5 text-sm rounded-lg border border-red-300 text-red-600 hover:bg-red-50">
              刪除帳單
            </button>
          )}
        </div>
      </div>

      {/* items table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-700">行程項目明細</h3>
          {!isSettled && (
            <button onClick={openAddItem} className="px-3 py-1 text-xs rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100">
              + 新增項目
            </button>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500">
              <tr>
                {['說明', '旅客姓名', '入住', '退房', '房型', '數量', '單價', '金額', '備註', ''].map(h => (
                  <th key={h} className="px-3 py-2 text-left whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {(billing.items || []).length === 0 ? (
                <tr><td colSpan={10} className="px-4 py-6 text-center text-gray-400">尚無項目，請點「新增項目」</td></tr>
              ) : (billing.items || []).map(item => (
                <tr key={item.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2 font-medium">{item.description}</td>
                  <td className="px-3 py-2 text-gray-600">{item.guestName || '—'}</td>
                  <td className="px-3 py-2 text-gray-600">{item.checkInDate || '—'}</td>
                  <td className="px-3 py-2 text-gray-600">{item.checkOutDate || '—'}</td>
                  <td className="px-3 py-2 text-gray-600">{item.roomType || '—'}</td>
                  <td className="px-3 py-2 text-right">{item.quantity}</td>
                  <td className="px-3 py-2 text-right"><Num v={item.unitPrice} /></td>
                  <td className="px-3 py-2 text-right font-medium"><Num v={item.amount} /></td>
                  <td className="px-3 py-2 text-gray-500 text-xs">{item.notes || '—'}</td>
                  <td className="px-3 py-2">
                    {!isSettled && (
                      <div className="flex gap-2">
                        <button onClick={() => openEditItem(item)} className="text-xs text-indigo-600 hover:underline">編輯</button>
                        <button onClick={() => deleteItem(item.id)} className="text-xs text-red-500 hover:underline">刪除</button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {(billing.items || []).length > 0 && (
                <tr className="bg-gray-50 font-semibold">
                  <td colSpan={7} className="px-3 py-2 text-right text-xs text-gray-500">合計</td>
                  <td className="px-3 py-2 text-right text-indigo-700"><Num v={itemTotal} /></td>
                  <td colSpan={2} />
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* item add/edit modal */}
      {showItemForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 space-y-4">
            <h3 className="text-base font-semibold text-gray-800">{editItemId ? '編輯項目' : '新增項目'}</h3>

            <div>
              <label className="block text-xs text-gray-500 mb-1">項目說明 *</label>
              <input type="text" placeholder="行程名稱或費用說明" className="w-full border rounded-lg px-3 py-1.5 text-sm"
                value={itemForm.description} onChange={e => setItemForm(f => ({ ...f, description: e.target.value }))} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">旅客姓名</label>
                <input type="text" className="w-full border rounded-lg px-3 py-1.5 text-sm"
                  value={itemForm.guestName} onChange={e => setItemForm(f => ({ ...f, guestName: e.target.value }))} />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">房型</label>
                <input type="text" className="w-full border rounded-lg px-3 py-1.5 text-sm"
                  value={itemForm.roomType} onChange={e => setItemForm(f => ({ ...f, roomType: e.target.value }))} />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">入住日</label>
                <input type="date" className="w-full border rounded-lg px-3 py-1.5 text-sm"
                  value={itemForm.checkInDate} onChange={e => setItemForm(f => ({ ...f, checkInDate: e.target.value }))} />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">退房日</label>
                <input type="date" className="w-full border rounded-lg px-3 py-1.5 text-sm"
                  value={itemForm.checkOutDate} onChange={e => setItemForm(f => ({ ...f, checkOutDate: e.target.value }))} />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">數量</label>
                <input type="number" min="1" className="w-full border rounded-lg px-3 py-1.5 text-sm"
                  value={itemForm.quantity} onChange={e => setItemForm(f => ({ ...f, quantity: e.target.value }))} />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">單價 *</label>
                <input type="number" step="0.01" className="w-full border rounded-lg px-3 py-1.5 text-sm"
                  value={itemForm.unitPrice} onChange={e => setItemForm(f => ({ ...f, unitPrice: e.target.value }))} />
              </div>
            </div>

            {itemForm.quantity && itemForm.unitPrice ? (
              <div className="text-xs text-gray-500">
                金額：<span className="font-semibold text-indigo-700">
                  {(Math.round(parseFloat(itemForm.quantity || 0) * parseFloat(itemForm.unitPrice || 0) * 100) / 100).toLocaleString('zh-TW')}
                </span>
              </div>
            ) : null}

            <div>
              <label className="block text-xs text-gray-500 mb-1">備註</label>
              <input type="text" className="w-full border rounded-lg px-3 py-1.5 text-sm"
                value={itemForm.notes} onChange={e => setItemForm(f => ({ ...f, notes: e.target.value }))} />
            </div>

            {itemError && <div className="text-xs text-red-600">{itemError}</div>}

            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => setShowItemForm(false)} className="px-4 py-1.5 text-sm rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50">取消</button>
              <button onClick={saveItem} disabled={itemSaving} className="px-4 py-1.5 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50">
                {itemSaving ? '儲存中…' : '儲存'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* settle modal */}
      {showSettle && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
            <h3 className="text-base font-semibold text-gray-800">
              結帳確認 — {billing.direction === 'AR' ? '應收入帳' : '應付出帳'}
            </h3>

            <div className="bg-gray-50 rounded-lg p-3 text-sm space-y-1">
              <div className="flex justify-between"><span className="text-gray-500">廠商</span><span className="font-medium">{billing.supplierName}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">方向</span>
                <span className={`font-medium ${billing.direction === 'AR' ? 'text-blue-700' : 'text-orange-700'}`}>
                  {DIRECTION_LABEL[billing.direction]}
                </span>
              </div>
              <div className="flex justify-between"><span className="text-gray-500">金額</span>
                <span className="font-semibold text-indigo-700 text-base">{Number(billing.totalAmount).toLocaleString('zh-TW')} 元</span>
              </div>
            </div>

            <div>
              <label className="block text-xs text-gray-500 mb-1">
                {billing.direction === 'AR' ? '收款存簿 *' : '付款存簿 *'}（{billing.warehouse}）
              </label>
              {accounts.length === 0 ? (
                <div className="text-xs text-amber-600 p-2 bg-amber-50 rounded">
                  找不到 {billing.warehouse} 的銀行存款帳戶，請至現金流帳戶設定新增。
                </div>
              ) : (
                <select className="w-full border rounded-lg px-3 py-1.5 text-sm" value={settleAccId} onChange={e => setSettleAccId(e.target.value)}>
                  <option value="">請選擇帳戶</option>
                  {accounts.map(a => (
                    <option key={a.id} value={a.id}>{a.name}（{a.type}）</option>
                  ))}
                </select>
              )}
            </div>

            <div>
              <label className="block text-xs text-gray-500 mb-1">結帳日期</label>
              <input type="date" className="w-full border rounded-lg px-3 py-1.5 text-sm"
                value={settleDate} onChange={e => setSettleDate(e.target.value)} />
            </div>

            {settleError && <div className="text-xs text-red-600">{settleError}</div>}
            {settleOk    && <div className="text-xs text-green-700 bg-green-50 p-2 rounded">{settleOk}</div>}

            <div className="flex justify-end gap-2 pt-1">
              {settleOk ? (
                <button onClick={() => setShowSettle(false)} className="px-4 py-1.5 text-sm rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50">關閉</button>
              ) : (
                <>
                  <button onClick={() => setShowSettle(false)} className="px-4 py-1.5 text-sm rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50">取消</button>
                  <button onClick={settle} disabled={settling || accounts.length === 0}
                    className="px-4 py-1.5 text-sm rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 font-medium">
                    {settling ? '結帳中…' : `確認結帳 ${Number(billing.totalAmount).toLocaleString('zh-TW')} 元`}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
