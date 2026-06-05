'use client';
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import Navigation from '@/components/Navigation';
import FetchErrorBanner from '@/components/FetchErrorBanner';

const HEALTH_LABEL = { good: '健康', warning: '注意', bad: '問題' };
const HEALTH_CLASS = {
  good:    'bg-green-100 text-green-800',
  warning: 'bg-yellow-100 text-yellow-800',
  bad:     'bg-red-100 text-red-800',
};

export default function PaymentHealthPage() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(null);
  const [filter, setFilter] = useState('all'); // 'all' | 'good' | 'warning' | 'bad'

  const fetchData = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const res = await fetch('/api/suppliers/payment-health');
      if (!res.ok) { setFetchError('廠商付款健康度載入失敗，請稍後再試'); return; }
      setData(await res.json());
    } catch { setFetchError('廠商付款健康度載入失敗，請稍後再試'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const filtered = filter === 'all' ? data : data.filter(r => r.health === filter);

  const summary = {
    good:    data.filter(r => r.health === 'good').length,
    warning: data.filter(r => r.health === 'warning').length,
    bad:     data.filter(r => r.health === 'bad').length,
  };

  return (
    <div className="min-h-screen page-bg-suppliers">
      <Navigation borderColor="border-teal-500" />
      <main className="max-w-full mx-auto px-4 py-8">

        <div className="flex items-center gap-4 mb-6">
          <Link href="/suppliers" className="text-teal-600 hover:underline text-sm">← 廠商管理</Link>
          <h2 className="text-2xl font-bold">廠商付款條件健康度</h2>
        </div>

        {fetchError && <FetchErrorBanner message={fetchError} onRetry={fetchData} />}

        <p className="text-sm text-gray-500 mb-6">
          依實際付款日（CashierExecution）與約定到期日（PaymentOrder.dueDate）計算延遲天數。
          正值 = 拖款，負值 = 提前付款。
        </p>

        {/* Summary badges */}
        <div className="flex gap-3 mb-6">
          {(['all', 'good', 'warning', 'bad'] ).map(k => (
            <button key={k} onClick={() => setFilter(k)}
              className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                filter === k ? 'border-teal-500 bg-teal-50 text-teal-700' : 'border-gray-200 hover:bg-gray-50 text-gray-600'
              }`}>
              {k === 'all' ? `全部 (${data.length})` : `${HEALTH_LABEL[k]} (${summary[k]})`}
            </button>
          ))}
        </div>

        {loading ? (
          <p className="text-gray-400 py-12 text-center">載入中…</p>
        ) : filtered.length === 0 ? (
          <p className="text-gray-400 py-12 text-center">
            {data.length === 0 ? '尚無已執行付款資料（需有含到期日的已執行付款單）' : '此分類無資料'}
          </p>
        ) : (
          <div className="bg-white rounded-lg shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 sticky top-0 z-10">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-700">廠商</th>
                  <th className="px-4 py-3 text-center font-medium text-gray-700">健康度</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-700">付款次數</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-700">拖款次數</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-700">拖款率</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-700">平均延遲（天）</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-700">最長延遲（天）</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-700">總付款金額</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map(r => (
                  <tr key={r.supplierId} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium">{r.supplierName}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`px-2 py-0.5 rounded text-xs font-semibold ${HEALTH_CLASS[r.health]}`}>
                        {HEALTH_LABEL[r.health]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">{r.totalPayments}</td>
                    <td className="px-4 py-3 text-right">
                      <span className={r.latePayments > 0 ? 'text-red-600 font-semibold' : 'text-gray-500'}>
                        {r.latePayments}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={r.lateRate > 30 ? 'text-red-600 font-semibold' : r.lateRate > 10 ? 'text-yellow-600' : 'text-green-600'}>
                        {r.lateRate}%
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={r.avgDelayDays > 7 ? 'text-red-600 font-semibold' : r.avgDelayDays > 0 ? 'text-yellow-600' : 'text-green-600'}>
                        {r.avgDelayDays > 0 ? `+${r.avgDelayDays}` : r.avgDelayDays}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={r.maxDelayDays > 14 ? 'text-red-600' : 'text-gray-700'}>
                        {r.maxDelayDays > 0 ? `+${r.maxDelayDays}` : r.maxDelayDays}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-gray-700">
                      NT$ {r.totalAmount.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-4 text-xs text-gray-400">
          健康：拖款率 ≤ 10%　注意：10–30%　問題：&gt; 30%。
          僅統計有設定到期日的已執行付款單。
        </div>
      </main>
    </div>
  );
}
