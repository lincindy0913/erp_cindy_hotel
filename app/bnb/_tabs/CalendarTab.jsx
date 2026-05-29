'use client';

import WhQuickBtns from '../_components/WhQuickBtns';
import { inputCls } from '../_constants';
import { todayStr } from '@/lib/localDate';

export default function CalendarTab({
  calYear, setCalYear, calMonth, setCalMonth,
  calWarehouse, setCalWarehouse,
  calData, calLoading,
  warehouseList,
}) {
  const today = todayStr();
  const daysInMonth = new Date(calYear, calMonth, 0).getDate();
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const dayMap = {};
  for (const r of calData) {
    if (r.status === '已刪除') continue;
    const inn = new Date(r.checkInDate);
    const out = new Date(r.checkOutDate);
    for (let d = new Date(inn); d < out; d.setDate(d.getDate() + 1)) {
      if (d.getFullYear() === calYear && d.getMonth() + 1 === calMonth) {
        const key = d.getDate();
        if (!dayMap[key]) dayMap[key] = [];
        dayMap[key].push(r);
      }
    }
  }
  const firstDay = new Date(calYear, calMonth - 1, 1).getDay();
  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (const d of days) cells.push(d);
  const weekLabels = ['日','一','二','三','四','五','六'];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={() => { const d = new Date(calYear, calMonth - 2, 1); setCalYear(d.getFullYear()); setCalMonth(d.getMonth() + 1); }}
          className="px-3 py-1.5 text-sm rounded-lg border hover:bg-gray-50">← 上月</button>
        <span className="font-semibold text-gray-800 text-lg">{calYear} 年 {calMonth} 月</span>
        <button onClick={() => { const d = new Date(calYear, calMonth, 1); setCalYear(d.getFullYear()); setCalMonth(d.getMonth() + 1); }}
          className="px-3 py-1.5 text-sm rounded-lg border hover:bg-gray-50">下月 →</button>
        <select value={calWarehouse} onChange={e => setCalWarehouse(e.target.value)} className={inputCls}>
          <option value="">全館</option>
          {warehouseList.map(w => <option key={w} value={w}>{w}</option>)}
        </select>
        <WhQuickBtns list={warehouseList} value={calWarehouse} onChange={setCalWarehouse} />
        {calLoading && <span className="text-xs text-gray-400 animate-pulse">載入中…</span>}
      </div>
      <div className="bg-white rounded-xl shadow overflow-hidden">
        <div className="grid grid-cols-7 border-b">
          {weekLabels.map(w => (
            <div key={w} className={`py-2 text-center text-xs font-medium ${w === '日' ? 'text-red-400' : w === '六' ? 'text-blue-400' : 'text-gray-500'}`}>{w}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 auto-rows-[minmax(80px,auto)]">
          {cells.map((day, idx) => {
            if (!day) return <div key={`e${idx}`} className="border-b border-r border-gray-50" />;
            const bookings = dayMap[day] || [];
            const isToday = `${calYear}-${String(calMonth).padStart(2,'0')}-${String(day).padStart(2,'0')}` === today;
            const dow = (firstDay + day - 1) % 7;
            const hasUnfilled = bookings.some(b => !b.paymentFilled && !b.paymentLocked);
            return (
              <div key={day} className={`border-b border-r border-gray-100 p-1.5 ${isToday ? 'bg-indigo-50' : hasUnfilled ? 'bg-red-50/40' : bookings.length > 0 ? 'bg-green-50/40' : ''}`}>
                <div className={`text-xs font-semibold mb-1 ${isToday ? 'text-indigo-600' : dow === 0 ? 'text-red-400' : dow === 6 ? 'text-blue-400' : 'text-gray-500'}`}>{day}</div>
                {bookings.slice(0, 3).map(b => {
                  const chipCls = b.paymentLocked ? 'bg-gray-100 text-gray-500' : !b.paymentFilled ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-700';
                  const prefix = b.paymentLocked ? '🔒 ' : '';
                  return (
                    <div key={b.id} className={`text-[10px] leading-4 px-1 rounded truncate mb-0.5 ${chipCls}`}
                      title={`${b.guestName} ${b.checkInDate}~${b.checkOutDate}${b.paymentLocked ? ' [已鎖帳]' : !b.paymentFilled ? ' [未付款]' : ''}`}>
                      {prefix}{b.roomNo ? `${b.roomNo} ` : ''}{b.guestName}
                    </div>
                  );
                })}
                {bookings.length > 3 && <div className="text-[10px] text-gray-400">+{bookings.length - 3}</div>}
              </div>
            );
          })}
        </div>
      </div>
      <div className="text-xs text-gray-400 flex flex-wrap gap-4">
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-green-100 inline-block" />已付款</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-100 inline-block" />未付款</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-gray-100 inline-block" />已鎖帳</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-indigo-50 inline-block" />今日</span>
        <span>共 {calData.filter(r => r.status !== '已刪除').length} 筆訂房</span>
      </div>
    </div>
  );
}
