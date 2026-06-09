'use client';

import { useState, useEffect } from 'react';

// Cache: propertyId → raw all-years maintenance array
const _maintenanceCache = new Map();

export default function MaintenanceList({ propertyId, year }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(!_maintenanceCache.has(propertyId));

  useEffect(() => {
    let cancelled = false;
    const cached = _maintenanceCache.get(propertyId);
    if (cached) {
      setItems(cached.filter(m => m.maintenanceDate?.startsWith(String(year))));
      setLoading(false);
      return;
    }
    setLoading(true);
    fetch(`/api/rentals/maintenance?propertyId=${propertyId}`)
      .then(r => r.json())
      .then(data => {
        if (cancelled) return;
        const arr = Array.isArray(data) ? data : [];
        _maintenanceCache.set(propertyId, arr);
        setItems(arr.filter(m => m.maintenanceDate?.startsWith(String(year))));
      })
      .catch(() => { if (!cancelled) setItems([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [propertyId, year]);

  if (loading) return <p className="text-xs text-gray-400">載入中…</p>;
  if (items.length === 0) return <p className="text-xs text-gray-400">{year} 年無維護費紀錄</p>;

  return (
    <table className="w-full text-xs border">
      <thead className="bg-gray-50">
        <tr>
          <th className="text-left px-2 py-1">日期</th>
          <th className="text-left px-2 py-1">類別</th>
          <th className="text-right px-2 py-1">金額</th>
        </tr>
      </thead>
      <tbody>
        {items.map(m => (
          <tr key={m.id} className="border-t">
            <td className="px-2 py-1">{m.maintenanceDate}</td>
            <td className="px-2 py-1">{m.category || '—'}</td>
            <td className="px-2 py-1 text-right text-blue-700 font-medium">{Number(m.amount).toLocaleString('zh-TW')}</td>
          </tr>
        ))}
      </tbody>
      <tfoot className="bg-gray-50 font-semibold">
        <tr>
          <td colSpan={2} className="px-2 py-1">合計</td>
          <td className="px-2 py-1 text-right text-blue-700">{items.reduce((s, m) => s + Number(m.amount || 0), 0).toLocaleString('zh-TW')}</td>
        </tr>
      </tfoot>
    </table>
  );
}
