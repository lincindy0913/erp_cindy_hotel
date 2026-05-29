'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useToast } from '@/context/ToastContext';

function downloadCsv(rows) {
  const cols = ['日期', '館別', '住客', '公司', '來源', '住宿金額', '發票號碼'];
  const lines = [
    cols.join(','),
    ...rows.map(r => [
      r.businessDate,
      r.warehouse,
      `"${(r.guestName || '').replace(/"/g, '""')}"`,
      `"${(r.companyName || '').replace(/"/g, '""')}"`,
      r.source || '',
      r.totalRevenue || 0,
      `"${(r.invoiceNo || '').replace(/"/g, '""')}"`,
    ].join(',')),
  ];
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `發票報表.csv`; a.click();
  URL.revokeObjectURL(url);
}

function downloadTaxReport(rows, yearMonth, showToast) {
  const invoiced = rows.filter(r => r.invoiceNo);
  if (invoiced.length === 0) { showToast('尚無已開發票資料可申報', 'info'); return; }

  // Group by 字軌 (first 2 chars of invoice number)
  const byPrefix = {};
  for (const r of invoiced) {
    const inv    = (r.invoiceNo || '').trim().replace(/[-\s]/g, '');
    const prefix = inv.slice(0, 2).toUpperCase();
    const numStr = inv.slice(2).replace(/\D/g, '').padStart(8, '0');
    const num    = parseInt(numStr, 10) || 0;
    if (!byPrefix[prefix]) byPrefix[prefix] = { prefix, nums: [], totalInclTax: 0, count: 0 };
    byPrefix[prefix].nums.push(num);
    byPrefix[prefix].totalInclTax += Number(r.totalRevenue) || 0;
    byPrefix[prefix].count++;
  }

  const cols = ['字軌', '起始號碼', '結束號碼', '使用張數', '銷售額（含稅）', '應稅銷售額（未稅）', '稅額（5%）', '免稅銷售額'];
  const lines = [cols.join(',')];
  for (const d of Object.values(byPrefix)) {
    const sorted      = d.nums.filter(n => n > 0).sort((a, b) => a - b);
    const start       = sorted.length ? String(sorted[0]).padStart(8, '0') : '00000000';
    const end         = sorted.length ? String(sorted[sorted.length - 1]).padStart(8, '0') : '00000000';
    const inclTax     = Math.round(d.totalInclTax);
    const exclTax     = Math.round(inclTax / 1.05);
    const taxAmt      = inclTax - exclTax;
    lines.push([d.prefix, start, end, d.count, inclTax, exclTax, taxAmt, 0].join(','));
  }

  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = `統一發票申報_${yearMonth || ''}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function PmsIncomeInvoiceTab({ WAREHOUSES }) {
  const { showToast } = useToast();
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
      setRows(await res.json());
    } catch { setRows([]); } finally { setLoading(false); }
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

  const filtered = useMemo(() => rows.filter(r => {
    if (guestSearch && !(r.guestName || '').toLowerCase().includes(guestSearch.toLowerCase())) return false;
    if (invoiceSearch === '__has__') return !!r.invoiceNo;
    if (invoiceSearch && !(r.invoiceNo || '').toLowerCase().includes(invoiceSearch.toLowerCase())) return false;
    return true;
  }), [rows, guestSearch, invoiceSearch]);

  const withInvoice    = useMemo(() => filtered.filter(r => r.invoiceNo), [filtered]);
  const withoutInvoice = useMemo(() => filtered.filter(r => !r.invoiceNo), [filtered]);

  // 月報彙總
  const invoiceAmount   = useMemo(() => withInvoice.reduce((s, r) => s + (r.totalRevenue || 0), 0), [withInvoice]);
  const noInvoiceAmount = useMemo(() => withoutInvoice.reduce((s, r) => s + (r.totalRevenue || 0), 0), [withoutInvoice]);

  // 來源分布（已開發票）
  const bySource = useMemo(() => {
    const m = {};
    for (const r of withInvoice) {
      const src = r.source || '其他';
      if (!m[src]) m[src] = { count: 0, amount: 0 };
      m[src].count++;
      m[src].amount += r.totalRevenue || 0;
    }
    return Object.entries(m).sort((a, b) => b[1].amount - a[1].amount);
  }, [withInvoice]);

  const fmt = n => n ? Number(n).toLocaleString('zh-TW') : '0';

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs text-gray-500 mb-1">館別</label>
          <select value={warehouse} onChange={e => setWarehouse(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
            <option value="全館">全館</option>
            {buildingList.map(w => <option key={w} value={w}>{w}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">年份</label>
          <select value={year} onChange={e => setYear(parseInt(e.target.value))}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
            {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}年</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">月份</label>
          <select value={month} onChange={e => setMonth(parseInt(e.target.value))}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
            {Array.from({ length: 12 }, (_, i) => i + 1).map(m =>
              <option key={m} value={m}>{m}月</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">住客搜尋</label>
          <input value={guestSearch} onChange={e => setGuestSearch(e.target.value)}
            placeholder="姓名…" className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-32" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">發票號碼</label>
          <input value={invoiceSearch === '__has__' ? '' : invoiceSearch}
            onChange={e => setInvoiceSearch(e.target.value)}
            placeholder="如 AB12345678…" className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-36" />
        </div>
        <button onClick={() => setInvoiceSearch(v => v === '__has__' ? '' : '__has__')}
          className={`px-3 py-2 text-sm rounded-lg border transition-colors ${invoiceSearch === '__has__' ? 'bg-indigo-600 text-white border-indigo-600' : 'border-gray-300 text-gray-600 hover:bg-gray-50'}`}>
          只看已開發票
        </button>
        <button onClick={load} className="px-3 py-2 text-sm border border-teal-300 text-teal-700 rounded-lg hover:bg-teal-50">
          重新整理
        </button>
        <button onClick={() => downloadCsv(filtered)}
          className="px-3 py-2 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700">
          匯出明細 CSV
        </button>
        <button onClick={() => downloadTaxReport(filtered, monthStr, showToast)}
          className="px-3 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
          title="依字軌彙總，含起訖號碼、應稅/稅額，符合國稅局申報格式">
          申報格式 CSV
        </button>
      </div>

      {/* ── 月度發票報表 ── */}
      <div className="bg-white border rounded-xl p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-800">
            {year}年{month}月 銷項發票月報（{warehouse === '全館' ? '全館' : warehouse}）
          </h3>
          <span className="text-xs text-gray-400">共 {filtered.length} 筆訂房</span>
        </div>

        {/* KPI 卡片 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3">
            <div className="text-xs text-indigo-600 mb-1">已開發票張數</div>
            <div className="text-xl font-bold text-indigo-700">{withInvoice.length} 張</div>
          </div>
          <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3">
            <div className="text-xs text-indigo-600 mb-1">已開發票金額</div>
            <div className="text-xl font-bold text-indigo-700">NT$ {fmt(invoiceAmount)}</div>
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
            <div className="text-xs text-amber-600 mb-1">未開發票張數</div>
            <div className="text-xl font-bold text-amber-700">{withoutInvoice.length} 張</div>
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
            <div className="text-xs text-amber-600 mb-1">未開發票金額</div>
            <div className="text-xl font-bold text-amber-700">NT$ {fmt(noInvoiceAmount)}</div>
          </div>
        </div>

        {/* 來源分布（已開發票） */}
        {bySource.length > 0 && (
          <div>
            <div className="text-xs font-medium text-gray-600 mb-2">已開發票來源分布</div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border rounded-lg overflow-hidden">
                <thead className="bg-gray-50 text-xs text-gray-500">
                  <tr>
                    <th className="px-3 py-2 text-left">來源</th>
                    <th className="px-3 py-2 text-right">張數</th>
                    <th className="px-3 py-2 text-right">金額</th>
                    <th className="px-3 py-2 text-right">占比</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {bySource.map(([src, { count, amount }]) => (
                    <tr key={src} className="hover:bg-gray-50">
                      <td className="px-3 py-1.5 text-gray-700">{src}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{count}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums font-medium">{fmt(amount)}</td>
                      <td className="px-3 py-1.5 text-right text-gray-400">
                        {invoiceAmount > 0 ? ((amount / invoiceAmount) * 100).toFixed(1) : 0}%
                      </td>
                    </tr>
                  ))}
                  <tr className="bg-indigo-50 font-semibold text-xs">
                    <td className="px-3 py-2 text-indigo-700">合計</td>
                    <td className="px-3 py-2 text-right text-indigo-700">{withInvoice.length}</td>
                    <td className="px-3 py-2 text-right text-indigo-700">{fmt(invoiceAmount)}</td>
                    <td className="px-3 py-2 text-right text-indigo-500">100%</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* 明細表格 */}
      {loading ? (
        <div className="text-center py-12 text-gray-400">載入中…</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-400">本月無訂房記錄</div>
      ) : (
        <div className="bg-white rounded-lg border overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead className="bg-gray-50 sticky top-0">
              <tr>
                <th className="px-3 py-2 text-left text-xs text-gray-500">日期</th>
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
                      <input autoFocus
                        className="border rounded px-2 py-0.5 text-xs w-36 font-mono focus:ring-1 focus:ring-indigo-400 text-center"
                        value={editVal} placeholder="發票號碼"
                        onChange={e => setEditVal(e.target.value)}
                        onBlur={() => saveInvoice(r.id, editVal)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') saveInvoice(r.id, editVal);
                          if (e.key === 'Escape') setEditingId(null);
                        }}
                      />
                    ) : (
                      <span onClick={() => { setEditingId(r.id); setEditVal(r.invoiceNo || ''); }}
                        className={`cursor-pointer inline-block px-2 py-0.5 rounded text-xs font-mono
                          ${r.invoiceNo ? 'text-indigo-700 bg-indigo-50 hover:bg-indigo-100' : 'text-gray-300 hover:text-indigo-400 hover:underline'}`}
                        title="點擊輸入/修改發票號碼">
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
