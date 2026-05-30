'use client';

import { useState, useMemo } from 'react';
import { useToast } from '@/context/ToastContext';
import { todayStr } from '@/lib/localDate';
import { BNB_SOURCES } from '../_constants';

export default function BookingFormModal({ record, onClose, onSaved, warehouseList, roomNoList = [], existingRecords = [] }) {
  const { showToast } = useToast();
  const isEdit = !!(record?.id);
  const today = todayStr();

  const [form, setForm] = useState({
    importMonth:  record?.importMonth  || today.substring(0, 7),
    warehouse:    record?.warehouse    || '民宿',
    source:       record?.source       || '電話',
    guestName:    record?.guestName    || '',
    roomNo:       record?.roomNo       || '',
    checkInDate:  record?.checkInDate  || '',
    checkOutDate: record?.checkOutDate || '',
    roomCharge:   record?.roomCharge   > 0 ? String(record.roomCharge) : '',
    otherCharge:  record?.otherCharge  > 0 ? String(record.otherCharge) : '',
    status:          record?.status          || '已入住',
    isComplimentary: record?.isComplimentary || false,
    note:            record?.note            || '',
  });
  const [saving, setSaving] = useState(false);

  const conflictWarning = useMemo(() => {
    if (!form.roomNo || !form.checkInDate || !form.checkOutDate) return null;
    return existingRecords.filter(r => {
      if (r.id === record?.id) return false;
      if (r.status === '已刪除' || r.status === '取消') return false;
      if (r.roomNo !== form.roomNo) return false;
      return form.checkInDate < r.checkOutDate && form.checkOutDate > r.checkInDate;
    });
  }, [form.roomNo, form.checkInDate, form.checkOutDate, existingRecords, record?.id]);

  function handleCheckIn(val) {
    setForm(p => ({ ...p, checkInDate: val, importMonth: val ? val.substring(0, 7) : p.importMonth }));
  }

  async function handleSave() {
    if (!form.guestName.trim()) { showToast('請填寫姓名', 'error'); return; }
    if (!form.checkInDate || !form.checkOutDate) { showToast('請填寫入住/退房日期', 'error'); return; }
    if (form.checkInDate >= form.checkOutDate) { showToast('退房日需晚於入住日', 'error'); return; }
    setSaving(true);
    try {
      const url    = isEdit ? `/api/bnb/${record.id}` : '/api/bnb';
      const method = isEdit ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          roomCharge:  parseFloat(String(form.roomCharge).replace(/,/g, ''))  || 0,
          otherCharge: parseFloat(String(form.otherCharge).replace(/,/g, '')) || 0,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        showToast(err.message || err.error || '儲存失敗', 'error');
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (data.syncWarning) {
        showToast(`${isEdit ? '訂房已更新' : '訂房已新增'}，但出納同步失敗，請至出納管理手動確認。`, 'warning');
      } else {
        showToast(isEdit ? '訂房已更新' : '訂房已新增', 'success');
      }
      onSaved();
    } finally { setSaving(false); }
  }

  const inp = 'w-full border rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-indigo-300 outline-none';
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg">
        <div className="p-5 border-b flex items-center justify-between">
          <h3 className="font-semibold text-gray-800">
            {isEdit ? `編輯訂房 — ${record.guestName}` : '新增訂房'}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
        </div>
        <div className="p-5 space-y-3 max-h-[72vh] overflow-y-auto">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="bf-warehouse" className="block text-xs text-gray-500 mb-1">館別</label>
              <select id="bf-warehouse" value={form.warehouse} onChange={e => setForm(p => ({ ...p, warehouse: e.target.value }))} className={inp}>
                {(warehouseList?.length ? warehouseList : ['民宿']).map(w => <option key={w} value={w}>{w}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="bf-source" className="block text-xs text-gray-500 mb-1">來源</label>
              <select id="bf-source" value={form.source} onChange={e => setForm(p => ({ ...p, source: e.target.value }))} className={inp}>
                {BNB_SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
                {form.source && !BNB_SOURCES.includes(form.source) && (
                  <option value={form.source}>{form.source}（匯入值）</option>
                )}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="bf-guestName" className="block text-xs text-gray-500 mb-1">姓名 <span className="text-red-400">*</span></label>
              <input id="bf-guestName" type="text" value={form.guestName} onChange={e => setForm(p => ({ ...p, guestName: e.target.value }))} className={inp} placeholder="房客姓名" />
            </div>
            <div>
              <label htmlFor="bf-roomNo" className="block text-xs text-gray-500 mb-1">房間號碼</label>
              <input id="bf-roomNo" type="text" value={form.roomNo} onChange={e => setForm(p => ({ ...p, roomNo: e.target.value }))}
                list="bnb-roomno-list" className={inp} placeholder="例：101" />
              <datalist id="bnb-roomno-list">
                {roomNoList.map(r => <option key={r} value={r} />)}
              </datalist>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="bf-checkInDate" className="block text-xs text-gray-500 mb-1">入住日期 <span className="text-red-400">*</span></label>
              <input id="bf-checkInDate" type="date" value={form.checkInDate} onChange={e => handleCheckIn(e.target.value)} className={inp} />
            </div>
            <div>
              <label htmlFor="bf-checkOutDate" className="block text-xs text-gray-500 mb-1">退房日期 <span className="text-red-400">*</span></label>
              <input id="bf-checkOutDate" type="date" value={form.checkOutDate} onChange={e => setForm(p => ({ ...p, checkOutDate: e.target.value }))} className={inp} />
            </div>
          </div>
          {conflictWarning?.length > 0 && (
            <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800 space-y-1">
              <p className="font-medium">⚠ 偵測到重複預訂（同房號日期重疊）</p>
              {conflictWarning.map(c => (
                <p key={c.id}>{c.roomNo} · {c.guestName}　{c.checkInDate} ～ {c.checkOutDate}</p>
              ))}
              <p className="text-amber-600">可繼續儲存，請確認是否為同房多人或資料錯誤。</p>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="bf-roomCharge" className="block text-xs text-gray-500 mb-1">房費</label>
              <input id="bf-roomCharge" type="number" min="0" value={form.roomCharge} onChange={e => setForm(p => ({ ...p, roomCharge: e.target.value }))} className={inp} placeholder="0" />
            </div>
            <div>
              <label htmlFor="bf-otherCharge" className="block text-xs text-gray-500 mb-1">其他消費</label>
              <input id="bf-otherCharge" type="number" min="0" value={form.otherCharge} onChange={e => setForm(p => ({ ...p, otherCharge: e.target.value }))} className={inp} placeholder="0" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="bf-status" className="block text-xs text-gray-500 mb-1">狀態</label>
              <select id="bf-status" value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value }))} className={inp}>
                <option value="已預訂">已預訂</option>
                <option value="已入住">已入住</option>
                <option value="已退房">已退房</option>
              </select>
            </div>
            <div>
              <label htmlFor="bf-importMonth" className="block text-xs text-gray-500 mb-1">匯入月份</label>
              <input id="bf-importMonth" type="month" value={form.importMonth} onChange={e => setForm(p => ({ ...p, importMonth: e.target.value }))} className={inp} />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700 select-none">
              <input type="checkbox" checked={form.isComplimentary}
                onChange={e => setForm(p => ({ ...p, isComplimentary: e.target.checked }))}
                className="rounded" />
              招待訂房（免費，付款欄可全填 $0）
            </label>
            {form.isComplimentary && (
              <span className="text-xs bg-rose-100 text-rose-700 px-2 py-0.5 rounded">招待</span>
            )}
          </div>
          <div>
            <label htmlFor="bf-note" className="block text-xs text-gray-500 mb-1">備註</label>
            <textarea id="bf-note" value={form.note} onChange={e => setForm(p => ({ ...p, note: e.target.value }))}
              rows={2} className={`${inp} resize-y`} placeholder="選填" />
          </div>
        </div>
        <div className="p-4 flex gap-2 justify-end border-t">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border hover:bg-gray-50">取消</button>
          <button onClick={handleSave} disabled={saving}
            className="px-5 py-2 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50">
            {saving ? '儲存中…' : isEdit ? '更新' : '新增'}
          </button>
        </div>
      </div>
    </div>
  );
}
