'use client';

import { useState, useEffect, useCallback } from 'react';

const NT = (v) => `NT$ ${Number(v || 0).toLocaleString()}`;

/**
 * 依 API preset（otaDeposit | otaCommission | bookingCenter）顯示篩選後的 PMS 明細。
 */
export default function PmsIncomePresetRecordsTab({
  preset,
  title,
  subtitle,
  WAREHOUSES,
  accent = 'teal',
  onGoFullRecords,
}) {
  const [warehouse, setWarehouse] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [records, setRecords] = useState([]);
  const [total, setTotal] = useState(0);
  const [sumAmount, setSumAmount] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const limit = 30;

  const ring =
    accent === 'orange'
      ? 'focus:ring-orange-400 border-orange-200'
      : accent === 'amber'
        ? 'focus:ring-amber-400 border-amber-200'
        : 'focus:ring-teal-400 border-teal-200';

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      params.set('preset', preset);
      params.set('page', String(page));
      params.set('limit', String(limit));
      if (warehouse) params.set('warehouse', warehouse);
      if (startDate) params.set('startDate', startDate);
      if (endDate) params.set('endDate', endDate);

      const res = await fetch(`/api/pms-income?${params}`, { credentials: 'include' });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error || '載入失敗');
        setRecords([]);
        return;
      }
      setRecords(data.records || []);
      setTotal(data.total ?? 0);
      setSumAmount(Number(data.sumAmount ?? 0));
      setTotalPages(data.totalPages ?? 1);
    } catch (e) {
      setError(e.message || '載入失敗');
      setRecords([]);
    } finally {
      setLoading(false);
    }
  }, [preset, page, warehouse, startDate, endDate]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold text-gray-800">{title}</h3>
        {subtitle && <p className="text-sm text-gray-500 mt-1">{subtitle}</p>}
      </div>

      <div className="flex flex-wrap items-end gap-3 bg-white rounded-xl border border-gray-100 p-4">
        <div>
          <label className="block text-xs text-gray-500 mb-1">館別</label>
          <select
            value={warehouse}
            onChange={(e) => {
              setPage(1);
              setWarehouse(e.target.value);
            }}
            className={`border rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-2 ${ring}`}
          >
            <option value="">全部館別</option>
            {WAREHOUSES.map((w) => (
              <option key={w} value={w}>
                {w}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">起始日</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => {
              setPage(1);
              setStartDate(e.target.value);
            }}
            className={`border rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-2 ${ring}`}
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">結束日</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => {
              setPage(1);
              setEndDate(e.target.value);
            }}
            className={`border rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-2 ${ring}`}
          />
        </div>
        <button
          type="button"
          onClick={() => fetchData()}
          className="px-4 py-1.5 rounded-lg bg-gray-800 text-white text-sm hover:bg-gray-900"
        >
          重新整理
        </button>
        {typeof onGoFullRecords === 'function' && (
          <button
            type="button"
            onClick={onGoFullRecords}
            className="ml-auto text-sm text-teal-700 hover:underline"
          >
            開啟完整收入明細 →
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-4 text-sm">
        <div className="rounded-lg bg-white border border-gray-100 px-4 py-2">
          <span className="text-gray-500">筆數（篩選結果）</span>
          <span className="ml-2 font-semibold text-gray-800">{total}</span>
        </div>
        <div className="rounded-lg bg-white border border-gray-100 px-4 py-2">
          <span className="text-gray-500">金額合計</span>
          <span className="ml-2 font-semibold text-teal-700">{NT(sumAmount)}</span>
        </div>
      </div>

      {error && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</div>
      )}

      {loading ? (
        <div className="text-center py-16 text-gray-400">載入中…</div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-100 bg-white shadow-sm">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-gray-600 text-xs border-b">
                <th className="px-3 py-2 text-left whitespace-nowrap">營業日</th>
                <th className="px-3 py-2 text-left whitespace-nowrap">館別</th>
                <th className="px-3 py-2 text-left whitespace-nowrap">借貸</th>
                <th className="px-3 py-2 text-left whitespace-nowrap">PMS 欄位</th>
                <th className="px-3 py-2 text-right whitespace-nowrap">金額</th>
                <th className="px-3 py-2 text-left whitespace-nowrap">會計科目</th>
                <th className="px-3 py-2 text-left whitespace-nowrap">來源檔</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {records.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-gray-400">
                    無符合資料。請確認已由「飯店 Excel 匯入」寫入明細，或放寬日期／館別。
                  </td>
                </tr>
              ) : (
                records.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50/80">
                    <td className="px-3 py-2 whitespace-nowrap text-gray-700">{r.businessDate}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{r.warehouse}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{r.entryType}</td>
                    <td className="px-3 py-2 whitespace-nowrap font-medium text-gray-800">{r.pmsColumnName}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold">{NT(r.amount)}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-gray-600">
                      {r.accountingCode} {r.accountingName}
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-500 max-w-[180px] truncate" title={r.importBatch?.fileName}>
                      {r.importBatch?.fileName || '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 text-sm">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="px-3 py-1 rounded border disabled:opacity-40"
          >
            上一頁
          </button>
          <span className="text-gray-600">
            {page} / {totalPages}
          </span>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            className="px-3 py-1 rounded border disabled:opacity-40"
          >
            下一頁
          </button>
        </div>
      )}
    </div>
  );
}
