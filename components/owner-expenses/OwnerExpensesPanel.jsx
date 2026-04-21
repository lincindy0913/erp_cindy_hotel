'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useToast } from '@/context/ToastContext';
import ExportButtons from '@/components/ExportButtons';

const NT = (v) => `NT$ ${Number(v || 0).toLocaleString()}`;

const TABS = [
  { key: 'monthly', label: '月結登記' },
  { key: 'yearly', label: '年度彙整' },
  { key: 'companies', label: '發票抬頭' },
];

const EXPORT_COLS = [
  { header: '公司名稱', key: 'companyName' },
  { header: '統編', key: 'taxId' },
  { header: '金額', key: 'totalAmount', format: 'number' },
  { header: '張數', key: 'invoiceCount', format: 'number' },
  { header: '狀態', key: 'status' },
  { header: '備註', key: 'note' },
];

/** 進項發票「業主發票私帳」區塊（嵌入 /sales 或獨立頁） */
export default function OwnerExpensesPanel({ embedded = true }) {
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState('monthly');

  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [monthData, setMonthData] = useState(null);
  const [monthLoading, setMonthLoading] = useState(false);
  const [editMap, setEditMap] = useState({});
  const [saving, setSaving] = useState(new Set());

  const [year, setYear] = useState(() => new Date().getFullYear().toString());
  const [yearData, setYearData] = useState(null);
  const [yearLoading, setYearLoading] = useState(false);

  const [companies, setCompanies] = useState([]);
  const [compLoading, setCompLoading] = useState(false);

  const fetchMonth = useCallback(async () => {
    setMonthLoading(true);
    try {
      const res = await fetch(`/api/owner-expenses?month=${month}`);
      if (!res.ok) {
        showToast('載入月份資料失敗', 'error');
        return;
      }
      const data = await res.json();
      setMonthData(data);
      const map = {};
      for (const r of data.rows) {
        map[r.companyId] = {
          totalAmount: r.totalAmount || '',
          invoiceCount: r.invoiceCount || '',
          note: r.note || '',
        };
      }
      setEditMap(map);
    } catch {
      showToast('載入月份資料失敗', 'error');
    } finally {
      setMonthLoading(false);
    }
  }, [month, showToast]);

  const fetchYear = useCallback(async () => {
    setYearLoading(true);
    try {
      const res = await fetch(`/api/owner-expenses?year=${year}`);
      if (!res.ok) {
        showToast('載入年度資料失敗', 'error');
        return;
      }
      setYearData(await res.json());
    } catch {
      showToast('載入年度資料失敗', 'error');
    } finally {
      setYearLoading(false);
    }
  }, [year, showToast]);

  const fetchCompanies = useCallback(async () => {
    setCompLoading(true);
    try {
      const res = await fetch('/api/settings/invoice-titles');
      if (!res.ok) {
        showToast('載入發票抬頭失敗', 'error');
        return;
      }
      setCompanies(await res.json());
    } catch {
      showToast('載入發票抬頭失敗', 'error');
    } finally {
      setCompLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    if (activeTab === 'monthly') fetchMonth();
  }, [activeTab, month, fetchMonth]);

  useEffect(() => {
    if (activeTab === 'yearly') fetchYear();
  }, [activeTab, year, fetchYear]);

  useEffect(() => {
    if (activeTab === 'companies') fetchCompanies();
  }, [activeTab, fetchCompanies]);

  async function saveRow(row) {
    const vals = editMap[row.companyId] || {};
    if (!vals.totalAmount && vals.totalAmount !== 0) return;
    setSaving((prev) => new Set([...prev, row.companyId]));
    try {
      const method = row.expenseId ? 'PATCH' : 'POST';
      const url = row.expenseId ? `/api/owner-expenses/${row.expenseId}` : '/api/owner-expenses';
      const body = row.expenseId
        ? { totalAmount: vals.totalAmount, invoiceCount: vals.invoiceCount || 1, note: vals.note }
        : {
            expenseMonth: month,
            companyId: row.companyId,
            totalAmount: vals.totalAmount,
            invoiceCount: vals.invoiceCount || 1,
            note: vals.note,
          };
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        showToast('儲存失敗', 'error');
        return;
      }
      showToast(`${row.companyName} 已儲存`, 'success');
      fetchMonth();
    } catch {
      showToast('儲存失敗', 'error');
    } finally {
      setSaving((prev) => {
        const n = new Set(prev);
        n.delete(row.companyId);
        return n;
      });
    }
  }

  async function saveAll() {
    if (!monthData) return;
    setSaving(new Set(monthData.rows.map((r) => r.companyId)));
    let count = 0;
    try {
      for (const row of monthData.rows) {
        const vals = editMap[row.companyId] || {};
        if (!vals.totalAmount && vals.totalAmount !== '0') continue;
        const method = row.expenseId ? 'PATCH' : 'POST';
        const url = row.expenseId ? `/api/owner-expenses/${row.expenseId}` : '/api/owner-expenses';
        const body = row.expenseId
          ? { totalAmount: vals.totalAmount, invoiceCount: vals.invoiceCount || 1, note: vals.note }
          : {
              expenseMonth: month,
              companyId: row.companyId,
              totalAmount: vals.totalAmount,
              invoiceCount: vals.invoiceCount || 1,
              note: vals.note,
            };
        const res = await fetch(url, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (res.ok) count++;
      }
      showToast(`已儲存 ${count} 筆`, 'success');
      fetchMonth();
    } catch {
      showToast('批次儲存發生錯誤', 'error');
    } finally {
      setSaving(new Set());
    }
  }

  async function toggleConfirm(row) {
    if (!row.expenseId) {
      showToast('請先儲存金額', 'error');
      return;
    }
    const newStatus = row.status === '已確認' ? '待確認' : '已確認';
    const res = await fetch(`/api/owner-expenses/${row.expenseId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    });
    if (!res.ok) {
      showToast('更新狀態失敗', 'error');
      return;
    }
    showToast(newStatus === '已確認' ? '已確認' : '已取消確認', 'success');
    fetchMonth();
  }

  const inputCls = 'border rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-indigo-400 outline-none';
  const btnCls = 'px-3 py-1.5 text-sm rounded-lg border hover:bg-gray-50 transition-colors';

  const invoiceListHref = (m, companyName) =>
    `/sales?view=list&month=${encodeURIComponent(m)}&invoiceTitle=${encodeURIComponent(companyName)}`;

  const inner = (
    <>
      {!embedded && (
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-gray-900">業主發票私帳</h2>
          <p className="text-sm text-gray-500 mt-1">老闆旗下各公司月底私用發票彙整</p>
        </div>
      )}

      <div className="flex gap-1 mb-6 bg-white rounded-xl shadow-sm border border-gray-100 p-1 w-fit">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setActiveTab(t.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
              activeTab === t.key ? 'bg-purple-600 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === 'monthly' && (
        <div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-4 flex flex-wrap gap-3 items-end">
            <div>
              <label className="block text-xs text-gray-500 mb-1">月份</label>
              <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className={inputCls} />
            </div>
            <button type="button" onClick={fetchMonth} className={`${btnCls} bg-purple-50 text-purple-700`}>
              查詢
            </button>
            {monthData && (
              <>
                <button
                  type="button"
                  onClick={saveAll}
                  className="px-4 py-1.5 text-sm rounded-lg bg-purple-600 text-white hover:bg-purple-700 transition-colors"
                >
                  全部儲存
                </button>
                <div className="ml-auto flex items-end gap-2">
                  <ExportButtons
                    data={monthData.rows.map((r) => ({ ...r, ...editMap[r.companyId] }))}
                    columns={EXPORT_COLS}
                    filename={`業主發票私帳_${month}`}
                    title={`業主發票私帳 ${month}`}
                  />
                </div>
              </>
            )}
          </div>

          {monthData && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
              {[
                { label: '本月合計', val: NT(monthData.monthTotal), color: 'text-purple-700 font-bold' },
                { label: '公司數', val: `${monthData.rows.length} 間`, color: 'text-gray-700' },
                { label: '已確認', val: `${monthData.confirmedCount} 間`, color: 'text-green-600' },
                {
                  label: '待確認',
                  val: `${monthData.rows.filter((r) => r.totalAmount > 0 && r.status !== '已確認').length} 間`,
                  color: 'text-amber-600',
                },
              ].map((c) => (
                <div key={c.label} className="bg-white rounded-xl border border-gray-100 shadow-sm p-3">
                  <p className="text-xs text-gray-500">{c.label}</p>
                  <p className={`text-sm mt-0.5 ${c.color}`}>{c.val}</p>
                </div>
              ))}
            </div>
          )}

          {monthLoading ? (
            <div className="text-center py-16 text-gray-400">載入中…</div>
          ) : monthData ? (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-purple-50 text-purple-800 text-xs">
                    {['公司名稱', '統編', '金額（NT$）', '張數', '備註', '狀態', '操作', '進項發票'].map((h) => (
                      <th key={h} className="px-4 py-2.5 text-left font-medium whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {monthData.rows.length === 0 && (
                    <tr>
                      <td colSpan={8} className="text-center py-12 text-gray-400">
                        尚無發票抬頭資料，請至設定頁面新增
                      </td>
                    </tr>
                  )}
                  {monthData.rows.map((row) => {
                    const vals = editMap[row.companyId] || {};
                    const isSaving = saving.has(row.companyId);
                    const isConfirmed = row.status === '已確認';
                    return (
                      <tr key={row.companyId} className={`hover:bg-gray-50 ${isConfirmed ? 'bg-green-50/40' : ''}`}>
                        <td className="px-4 py-3 font-medium text-gray-800 whitespace-nowrap">{row.companyName}</td>
                        <td className="px-4 py-3 text-gray-500 font-mono text-xs">{row.taxId}</td>
                        <td className="px-4 py-3">
                          <input
                            type="number"
                            min="0"
                            step="1"
                            value={vals.totalAmount ?? ''}
                            onChange={(e) =>
                              setEditMap((p) => ({
                                ...p,
                                [row.companyId]: { ...p[row.companyId], totalAmount: e.target.value },
                              }))
                            }
                            disabled={isConfirmed}
                            placeholder="0"
                            className="w-32 border rounded-lg px-2 py-1 text-sm text-right focus:ring-2 focus:ring-purple-400 outline-none disabled:bg-gray-50 disabled:text-gray-400"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <input
                            type="number"
                            min="0"
                            step="1"
                            value={vals.invoiceCount ?? ''}
                            onChange={(e) =>
                              setEditMap((p) => ({
                                ...p,
                                [row.companyId]: { ...p[row.companyId], invoiceCount: e.target.value },
                              }))
                            }
                            disabled={isConfirmed}
                            placeholder="0"
                            className="w-16 border rounded-lg px-2 py-1 text-sm text-center focus:ring-2 focus:ring-purple-400 outline-none disabled:bg-gray-50 disabled:text-gray-400"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <input
                            type="text"
                            value={vals.note ?? ''}
                            onChange={(e) =>
                              setEditMap((p) => ({
                                ...p,
                                [row.companyId]: { ...p[row.companyId], note: e.target.value },
                              }))
                            }
                            disabled={isConfirmed}
                            placeholder="備註"
                            className="w-40 border rounded-lg px-2 py-1 text-sm focus:ring-2 focus:ring-purple-400 outline-none disabled:bg-gray-50 disabled:text-gray-400"
                          />
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {row.status === '已確認' ? (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700">已確認</span>
                          ) : row.totalAmount > 0 ? (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">待確認</span>
                          ) : (
                            <span className="text-xs text-gray-300">未填</span>
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="flex gap-1.5">
                            {!isConfirmed && (
                              <button
                                type="button"
                                onClick={() => saveRow(row)}
                                disabled={isSaving}
                                className="text-xs px-2.5 py-1 rounded-lg border border-purple-300 text-purple-600 hover:bg-purple-50 disabled:opacity-50"
                              >
                                {isSaving ? '…' : '儲存'}
                              </button>
                            )}
                            {row.expenseId && (
                              <button
                                type="button"
                                onClick={() => toggleConfirm(row)}
                                className={`text-xs px-2.5 py-1 rounded-lg border ${
                                  isConfirmed
                                    ? 'border-gray-300 text-gray-500 hover:bg-gray-50'
                                    : 'border-green-300 text-green-600 hover:bg-green-50'
                                }`}
                              >
                                {isConfirmed ? '取消確認' : '確認'}
                              </button>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <Link
                            href={invoiceListHref(month, row.companyName)}
                            className="text-xs px-2.5 py-1 rounded-lg border border-blue-300 text-blue-600 hover:bg-blue-50 inline-block"
                          >
                            查看發票
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                {monthData.rows.length > 0 && (
                  <tfoot>
                    <tr className="bg-purple-50 font-semibold text-purple-800 text-sm">
                      <td className="px-4 py-2.5" colSpan={2}>
                        合計
                      </td>
                      <td className="px-4 py-2.5 text-left">
                        {NT(
                          monthData.rows.reduce((s, r) => {
                            const v = parseFloat(editMap[r.companyId]?.totalAmount) || 0;
                            return s + v;
                          }, 0)
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-center text-xs text-purple-600">
                        {monthData.rows.reduce((s, r) => s + (parseInt(editMap[r.companyId]?.invoiceCount, 10) || 0), 0)} 張
                      </td>
                      <td colSpan={4} />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          ) : (
            <div className="text-center py-16 text-gray-400">請選擇月份後按「查詢」</div>
          )}
        </div>
      )}

      {activeTab === 'yearly' && (
        <div>
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1">年份</label>
              <select value={year} onChange={(e) => setYear(e.target.value)} className={inputCls}>
                {[2024, 2025, 2026, 2027].map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>
            <button type="button" onClick={fetchYear} className={`${btnCls} bg-purple-50 text-purple-700`}>
              查詢
            </button>
            {yearData && (
              <div className="ml-auto">
                <ExportButtons
                  data={yearData.yearRows.map((r) => ({
                    month: r.month,
                    ...Object.fromEntries(yearData.companies.map((c) => [c.companyName, r.byCompany[c.id] || 0])),
                    total: r.total,
                  }))}
                  columns={[
                    { header: '月份', key: 'month' },
                    ...(yearData.companies || []).map((c) => ({
                      header: c.companyName,
                      key: c.companyName,
                      format: 'number',
                    })),
                    { header: '合計', key: 'total', format: 'number' },
                  ]}
                  filename={`業主發票私帳年度_${year}`}
                  title={`業主發票私帳年度彙整 ${year}`}
                />
              </div>
            )}
          </div>

          {yearLoading ? (
            <div className="text-center py-16 text-gray-400">載入中…</div>
          ) : yearData ? (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-purple-50 text-purple-800 text-xs">
                    <th className="px-4 py-2.5 text-left font-medium whitespace-nowrap">月份</th>
                    {yearData.companies.map((c) => (
                      <th key={c.id} className="px-4 py-2.5 text-right font-medium whitespace-nowrap">
                        {c.companyName}
                      </th>
                    ))}
                    <th className="px-4 py-2.5 text-right font-medium whitespace-nowrap">合計</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {yearData.yearRows.length === 0 && (
                    <tr>
                      <td colSpan={yearData.companies.length + 2} className="text-center py-12 text-gray-400">
                        本年度無資料
                      </td>
                    </tr>
                  )}
                  {yearData.yearRows.map((row) => (
                    <tr key={row.month} className="hover:bg-gray-50">
                      <td className="px-4 py-2.5 font-medium text-gray-700">{row.month}</td>
                      {yearData.companies.map((c) => (
                        <td key={c.id} className="px-4 py-2.5 text-right text-gray-600">
                          {row.byCompany[c.id] > 0 ? Number(row.byCompany[c.id]).toLocaleString() : '—'}
                        </td>
                      ))}
                      <td className="px-4 py-2.5 text-right font-semibold text-purple-700">
                        {Number(row.total).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
                {yearData.yearRows.length > 0 && (
                  <tfoot>
                    <tr className="bg-purple-50 font-bold text-purple-800 text-sm">
                      <td className="px-4 py-2.5">全年合計</td>
                      {yearData.companies.map((c) => {
                        const total = yearData.yearRows.reduce((s, r) => s + (r.byCompany[c.id] || 0), 0);
                        return (
                          <td key={c.id} className="px-4 py-2.5 text-right">
                            {Number(total).toLocaleString()}
                          </td>
                        );
                      })}
                      <td className="px-4 py-2.5 text-right">{Number(yearData.yearTotal).toLocaleString()}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          ) : (
            <div className="text-center py-16 text-gray-400">請選擇年份後按「查詢」</div>
          )}
        </div>
      )}

      {activeTab === 'companies' && (
        <div className="max-w-2xl">
          <div className="flex justify-between items-center mb-4">
            <p className="text-sm text-gray-500">
              月結登記的館別來自「設定 → 發票抬頭管理」，如需新增或修改請至設定頁面操作。
            </p>
            <a
              href="/settings?tab=invoice-titles"
              className="px-4 py-1.5 text-sm rounded-lg border border-purple-300 text-purple-700 hover:bg-purple-50 transition-colors"
            >
              前往設定
            </a>
          </div>

          {compLoading ? (
            <div className="text-center py-16 text-gray-400">載入中…</div>
          ) : companies.length === 0 ? (
            <div className="text-center py-16 text-gray-400">尚無發票抬頭，請至設定頁面新增</div>
          ) : (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-purple-50 text-purple-800 text-xs">
                    {['發票抬頭', '統編', '狀態'].map((h) => (
                      <th key={h} className="px-4 py-2.5 text-left font-medium">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {companies.map((c) => (
                    <tr key={c.id} className={`hover:bg-gray-50 ${!c.isActive ? 'opacity-40' : ''}`}>
                      <td className="px-4 py-3 font-medium text-gray-800">{c.title}</td>
                      <td className="px-4 py-3 text-gray-500 font-mono text-xs">{c.taxId || '—'}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full ${
                            c.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                          }`}
                        >
                          {c.isActive ? '啟用' : '停用'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </>
  );

  if (embedded) {
    return <div className="space-y-2">{inner}</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="max-w-6xl mx-auto px-4 py-8">{inner}</main>
    </div>
  );
}
