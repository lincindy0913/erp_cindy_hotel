'use client';

import { useState, useEffect, useCallback } from 'react';

export default function PmsIncomeInvoiceTab({ WAREHOUSES }) {
  const now = new Date();
  const [warehouse, setWarehouse] = useState('全館');
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [guestSearch, setGuestSearch] = useState('');
  const [invoiceSearch, setInvoiceSearch] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editVal, setEditVal] = useState('');

  const buildingList = WAREHOUSES?.length ? WAREHOUSES : ['麗格', '麗軒', '民宿'];
  const monthStr = `${year}-${String(month).padStart(2, '0')}`;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ month: monthStr, take: '2000' });
      if (warehouse !== '全館') params.set('warehouse', warehouse);
      const res = await fetch(`/api/pms-income/reservations?${params}`);
      if (!res.ok) throw new Error('載入失敗');
      const data = await res.json();
      setRows(data);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [monthStr, warehouse]);

  useEffect(() => { load(); }, [load]);

  const saveInvoice = async (id, val) => {
    setEditingId(null);
    const cleaned = val.trim() || null;
    await fetch(`/api/pms-income/reservations/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ invoiceNo: cleaned }),
    });
    setRows(prev => prev.map(r => r.id === id ? { ...r, invoiceNo: cleaned } : r));
  };

  const filtered = rows.filter(r => {
    if (guestSearch && !(r.guestName || '').toLowerCase().includes(guestSearch.toLowerCase())) return false;
    if (invoiceSearch) {
      if (invoiceSearch === '__has__') return !!r.invoiceNo;
      if (!(r.invoiceNo || '').toLowerCase().includes(invoiceSearch.toLowerCase())) return false;
    }
    return true;
  });

  const withInvoice = filtered.filter(r => r.invoiceNo);
  const withoutInvoice = filtered.filter(r => !r.invoiceNo);

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs text-gray-500 mb-1">館別</label>
          <select value={warehouse} onChange={e => setWarehouse(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-teal-500">
            <option value="全館">全館</option>
            {buildingList.map(w => <option key={w} value={w}>{w}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">年份</label>
          <select value={year} onChange={e => setYear(parseInt(e.target.value, 10))}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-teal-500">
            {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}年</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">月份</label>
          <select value={month} onChange={e => setMonth(parseInt(e.target.value, 10))}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-teal-500">
            {Array.from({ length: 12 }, (_, i) => i + 1).map(m =>
              <option key={m} value={m}>{m}月</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">住客搜尋</label>
          <input value={guestSearch} onChange={e => setGuestSearch(e.target.value)}
            placeholder="姓名…"
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-32 focus:ring-2 focus:ring-teal-500" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">發票號碼搜尋</label>
          <input value={invoiceSearch === '__has__' ? '' : invoiceSearch} onChange={e => setInvoiceSearch(e.target.value)}
            placeholder="如 AB12345678…"
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-36 focus:ring-2 focus:ring-teal-500" />
        </div>
        <button onClick={() => setInvoiceSearch(invoiceSearch === '__has__' ? '' : '__has__')}
          className={`px-3 py-2 text-sm rounded-lg border transition-colors ${invoiceSearch === '__has__' ? 'bg-indigo-600 text-white border-indigo-600' : 'border-gray-300 text-gray-600 hover:bg-gray-50'}`}>
          只看已開發票
        </button>
        <button onClick={load}
          className="px-3 py-2 text-sm border border-teal-300 text-teal-700 rounded-lg hover:bg-teal-50">
          重新整理
        </button>
      </div>

      {/* Summary chips */}
      <div className="flex gap-3 text-sm">
        <span className="px-3 py-1 bg-gray-100 rounded-full text-gray-600">
          本月共 <strong>{filtered.length}</strong> 筆訂房
        </span>
        <span className="px-3 py-1 bg-indigo-50 text-indigo-700 rounded-full">
          已開發票 <strong>{withInvoice.length}</strong> 筆
        </span>
        <span className="px-3 py-1 bg-amber-50 text-amber-700 rounded-full">
          未開發票 <strong>{withoutInvoice.length}</strong> 筆
        </span>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400">載入中…</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-400">本月無訂房記錄</div>
      ) : (
        <div className="bg-white rounded-lg border overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead className="bg-gray-50 sticky top-0">
              <tr>
                <th className="px-3 py-2 text-left text-xs text-gray-500 whitespace-nowrap">日期</th>
                <th className="px-3 py-2 text-left text-xs text-gray-500">館別</th>
                <th className="px-3 py-2 text-left text-xs text-gray-500">住客</th>
                <th className="px-3 py-2 text-left text-xs text-gray-500">公司</th>
                <th className="px-3 py-2 text-left text-xs text-gray-500">來源</th>
                <th className="px-3 py-2 text-right text-xs text-gray-500">住宿金額</th>
                <th className="px-3 py-2 text-center text-xs text-gray-500 w-44">
                  發票號碼 <span className="text-gray-400 font-normal">（點擊編輯）</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map(r => (
                <tr key={r.id} className={`hover:bg-blue-50/30 ${r.invoiceNo ? '' : 'bg-amber-50/20'}`}>
                  <td className="px-3 py-1.5 whitespace-nowrap text-xs text-gray-500">{r.businessDate}</td>
                  <td className="px-3 py-1.5 text-xs text-gray-500">{r.warehouse}</td>
                  <td className="px-3 py-1.5 font-medium text-gray-800 max-w-[120px] truncate" title={r.guestName}>
                    {r.guestName || '—'}
                  </td>
                  <td className="px-3 py-1.5 text-xs text-gray-400 max-w-[100px] truncate" title={r.companyName}>
                    {r.companyName || ''}
                  </td>
                  <td className="px-3 py-1.5 text-xs text-gray-500">{r.source}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-gray-700">
                    {r.totalRevenue ? r.totalRevenue.toLocaleString('zh-TW') : '—'}
                  </td>
                  <td className="px-3 py-1.5 text-center">
                    {editingId === r.id ? (
                      <input
                        autoFocus
                        className="border rounded px-2 py-0.5 text-xs w-36 font-mono focus:ring-1 focus:ring-indigo-400 text-center"
                        value={editVal}
                        placeholder="發票號碼"
                        onChange={e => setEditVal(e.target.value)}
                        onBlur={() => saveInvoice(r.id, editVal)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') saveInvoice(r.id, editVal);
                          if (e.key === 'Escape') setEditingId(null);
                        }}
                      />
                    ) : (
                      <span
                        onClick={() => { setEditingId(r.id); setEditVal(r.invoiceNo || ''); }}
                        className={`cursor-pointer inline-block px-2 py-0.5 rounded text-xs font-mono
                          ${r.invoiceNo
                            ? 'text-indigo-700 bg-indigo-50 hover:bg-indigo-100'
                            : 'text-gray-300 hover:text-indigo-400 hover:underline'}`}
                        title="點擊輸入/修改發票號碼"
                      >
                        {r.invoiceNo || '+ 輸入發票'}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
