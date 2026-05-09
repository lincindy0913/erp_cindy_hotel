'use client';

import { useState, useCallback, useEffect } from 'react';
import PmsIncomeVendorBillingDetail from './PmsIncomeVendorBillingDetail';

const DIRECTION_LABEL = { AR: '應收', AP: '應付' };
const STATUS_COLOR = {
  草稿:  'bg-gray-100 text-gray-600',
  已送出: 'bg-blue-100 text-blue-700',
  已確認: 'bg-amber-100 text-amber-700',
  已結帳: 'bg-green-100 text-green-700',
};

function Num({ v, cls = '' }) {
  if (v == null || v === '') return <span className="text-gray-300">—</span>;
  return <span className={cls}>{Number(v).toLocaleString('zh-TW')}</span>;
}

const EMPTY_FORM = { warehouse: '', supplierName: '', supplierId: '', direction: 'AP', billingMonth: '', dueDate: '', notes: '' };

export default function PmsIncomeVendorBillingTab({ WAREHOUSES }) {
  const [billings,   setBillings]   = useState([]);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState('');
  const [selectedId, setSelectedId] = useState(null);

  // filters
  const [fWarehouse,    setFWarehouse]    = useState('');
  const [fMonth,        setFMonth]        = useState('');
  const [fDirection,    setFDirection]    = useState('');
  const [fStatus,       setFStatus]       = useState('');

  // new billing modal
  const [showCreate, setShowCreate] = useState(false);
  const [form,       setForm]       = useState(EMPTY_FORM);
  const [saving,     setSaving]     = useState(false);
  const [formError,  setFormError]  = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const q = new URLSearchParams();
      if (fWarehouse) q.set('warehouse',    fWarehouse);
      if (fMonth)     q.set('billingMonth', fMonth);
      if (fDirection) q.set('direction',    fDirection);
      if (fStatus)    q.set('status',       fStatus);
      const res  = await fetch(`/api/pms-income/vendor-billing?${q}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || '載入失敗');
      setBillings(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [fWarehouse, fMonth, fDirection, fStatus]);

  useEffect(() => { load(); }, [load]);

  const today     = new Date().toISOString().slice(0, 10);
  const arTotal   = billings.filter(b => b.direction === 'AR').reduce((s, b) => s + b.totalAmount, 0);
  const apTotal   = billings.filter(b => b.direction === 'AP').reduce((s, b) => s + b.totalAmount, 0);
  const settled   = billings.filter(b => b.status === '已結帳').reduce((s, b) => s + b.settledAmount, 0);
  const unsettled = billings.filter(b => b.status !== '已結帳').reduce((s, b) => s + b.totalAmount, 0);
  const overdueCount = billings.filter(b => b.status !== '已結帳' && b.dueDate && b.dueDate < today).length;

  const create = async () => {
    if (!form.warehouse || !form.supplierName || !form.direction || !form.billingMonth) {
      setFormError('請填寫館別、廠商名稱、方向及帳單月份'); return;
    }
    setSaving(true); setFormError('');
    try {
      const res  = await fetch('/api/pms-income/vendor-billing', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || '新增失敗');
      setShowCreate(false);
      setForm(EMPTY_FORM);
      setSelectedId(data.id);
      await load();
    } catch (e) {
      setFormError(e.message);
    } finally {
      setSaving(false);
    }
  };

  if (selectedId) {
    return (
      <PmsIncomeVendorBillingDetail
        billingId={selectedId}
        WAREHOUSES={WAREHOUSES}
        onBack={() => { setSelectedId(null); load(); }}
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: '應收合計 (AR)', value: arTotal,   cls: 'text-blue-600' },
          { label: '應付合計 (AP)', value: apTotal,   cls: 'text-orange-600' },
          { label: '已結帳金額',    value: settled,   cls: 'text-green-600' },
          { label: '待結帳金額',    value: unsettled, cls: 'text-amber-600' },
        ].map(k => (
          <div key={k.label} className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
            <div className="text-xs text-gray-500 mb-1">{k.label}</div>
            <div className={`text-lg font-semibold ${k.cls}`}>
              <Num v={k.value} />
            </div>
          </div>
        ))}
      </div>

      {overdueCount > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-2.5 flex items-center gap-2 text-sm text-red-700">
          <span className="font-bold">⚠ {overdueCount} 筆帳單已超過到期日未結帳</span>
          <span className="text-xs text-red-500">（已以紅底標示）</span>
        </div>
      )}

      {/* filter bar */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs text-gray-500 mb-1">館別</label>
          <select className="border rounded-lg px-3 py-1.5 text-sm" value={fWarehouse} onChange={e => setFWarehouse(e.target.value)}>
            <option value="">全部</option>
            {WAREHOUSES.map(w => <option key={w} value={w}>{w}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">帳單月份</label>
          <input type="month" className="border rounded-lg px-3 py-1.5 text-sm" value={fMonth} onChange={e => setFMonth(e.target.value)} />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">方向</label>
          <select className="border rounded-lg px-3 py-1.5 text-sm" value={fDirection} onChange={e => setFDirection(e.target.value)}>
            <option value="">全部</option>
            <option value="AR">應收 (AR)</option>
            <option value="AP">應付 (AP)</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">狀態</label>
          <select className="border rounded-lg px-3 py-1.5 text-sm" value={fStatus} onChange={e => setFStatus(e.target.value)}>
            <option value="">全部</option>
            {['草稿', '已送出', '已確認', '已結帳'].map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div className="ml-auto flex gap-2">
          <button onClick={load} className="px-3 py-1.5 text-sm rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50">重新整理</button>
          <button onClick={() => { setShowCreate(true); setFormError(''); setForm(EMPTY_FORM); }}
            className="px-3 py-1.5 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 font-medium">
            + 新增帳單
          </button>
        </div>
      </div>

      {error && <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>}

      {/* table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500">
              <tr>
                {['帳單月份', '館別', '廠商', '方向', '項目', '金額', '狀態', '到期日', ''].map(h => (
                  <th key={h} className="px-4 py-2.5 text-left whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-400">載入中…</td></tr>
              ) : billings.length === 0 ? (
                <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-400">尚無帳單資料</td></tr>
              ) : billings.map(b => {
                const isOverdue = b.status !== '已結帳' && b.dueDate && b.dueDate < today;
                return (
                  <tr key={b.id}
                    className={`cursor-pointer ${isOverdue ? 'bg-red-50 hover:bg-red-100' : 'hover:bg-gray-50'}`}
                    onClick={() => setSelectedId(b.id)}>
                    <td className="px-4 py-2.5 font-medium">{b.billingMonth}</td>
                    <td className="px-4 py-2.5">{b.warehouse}</td>
                    <td className="px-4 py-2.5">{b.supplierName}</td>
                    <td className="px-4 py-2.5">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${b.direction === 'AR' ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'}`}>
                        {DIRECTION_LABEL[b.direction] || b.direction}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-gray-500">{b.itemCount} 項</td>
                    <td className="px-4 py-2.5 font-medium text-right"><Num v={b.totalAmount} /></td>
                    <td className="px-4 py-2.5">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLOR[b.status] || 'bg-gray-100 text-gray-600'}`}>
                        {b.status}
                      </span>
                    </td>
                    <td className={`px-4 py-2.5 ${isOverdue ? 'text-red-600 font-medium' : 'text-gray-500'}`}>
                      {b.dueDate || '—'}{isOverdue && ' ⚠'}
                    </td>
                    <td className="px-4 py-2.5">
                      <button className="text-xs text-indigo-600 hover:underline" onClick={e => { e.stopPropagation(); setSelectedId(b.id); }}>
                        開啟
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* create modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
            <h3 className="text-base font-semibold text-gray-800">新增廠商行程帳單</h3>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">館別 *</label>
                <select className="w-full border rounded-lg px-3 py-1.5 text-sm" value={form.warehouse} onChange={e => setForm(f => ({ ...f, warehouse: e.target.value }))}>
                  <option value="">請選擇</option>
                  {WAREHOUSES.map(w => <option key={w} value={w}>{w}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">帳單月份 *</label>
                <input type="month" className="w-full border rounded-lg px-3 py-1.5 text-sm" value={form.billingMonth} onChange={e => setForm(f => ({ ...f, billingMonth: e.target.value }))} />
              </div>
            </div>

            <div>
              <label className="block text-xs text-gray-500 mb-1">廠商名稱 *</label>
              <input type="text" placeholder="旅行社或廠商名稱" className="w-full border rounded-lg px-3 py-1.5 text-sm" value={form.supplierName} onChange={e => setForm(f => ({ ...f, supplierName: e.target.value }))} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">方向 *</label>
                <select className="w-full border rounded-lg px-3 py-1.5 text-sm" value={form.direction} onChange={e => setForm(f => ({ ...f, direction: e.target.value }))}>
                  <option value="AP">應付 AP（飯店付廠商）</option>
                  <option value="AR">應收 AR（代訂中心付飯店）</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">到期日</label>
                <input type="date" className="w-full border rounded-lg px-3 py-1.5 text-sm" value={form.dueDate} onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))} />
              </div>
            </div>

            <div>
              <label className="block text-xs text-gray-500 mb-1">備註</label>
              <input type="text" className="w-full border rounded-lg px-3 py-1.5 text-sm" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
            </div>

            {formError && <div className="text-xs text-red-600">{formError}</div>}

            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => setShowCreate(false)} className="px-4 py-1.5 text-sm rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50">取消</button>
              <button onClick={create} disabled={saving} className="px-4 py-1.5 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50">
                {saving ? '建立中…' : '建立帳單'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
