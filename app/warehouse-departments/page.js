'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Navigation from '@/components/Navigation';

export default function WarehouseDepartmentsPage() {
  const [data, setData] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => { fetchData(); }, []);

  async function fetchData() {
    setLoading(true);
    try {
      const res = await fetch('/api/warehouse-departments');
      if (res.ok) setData(await res.json());
      else setError('載入失敗');
    } catch { setError('網路錯誤'); }
    finally { setLoading(false); }
  }

  const byName = data && data.byName ? data.byName : data;
  const warehouses = byName && typeof byName === 'object' ? Object.keys(byName) : [];

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />
      <main className="max-w-4xl mx-auto px-4 py-8">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/settings" className="text-sm text-gray-500 hover:text-gray-700">← 系統設定</Link>
          <span className="text-gray-300">/</span>
          <h1 className="text-2xl font-bold text-gray-800">館別 / 部門（唯讀）</h1>
        </div>

        <div className="mb-4 p-4 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
          館別與部門的<strong>新增、刪除、修改</strong>請至「<Link href="/settings#warehouses" className="underline font-medium">設定 → 倉庫設定</Link>」管理，此頁僅供查詢。
        </div>

        {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{error}</div>}

        <div className="bg-white rounded-lg shadow-sm p-6">
          <h2 className="text-lg font-semibold mb-4">現有館別與部門</h2>
          {loading ? (
            <p className="text-gray-500 text-sm">載入中...</p>
          ) : warehouses.length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-8">尚無館別，請至設定 → 倉庫設定新增</p>
          ) : (
            <div className="space-y-4">
              {warehouses.map(warehouse => (
                <div key={warehouse} className="border border-gray-200 rounded-lg overflow-hidden">
                  <div className="px-4 py-3 bg-gray-50">
                    <span className="font-medium text-gray-800">{warehouse}</span>
                  </div>
                  <div className="px-4 py-3">
                    {(!byName[warehouse] || byName[warehouse].length === 0) ? (
                      <p className="text-gray-400 text-sm">尚無部門</p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {byName[warehouse].map(dept => (
                          <span key={dept} className="inline-flex items-center px-3 py-1 bg-blue-50 text-blue-700 rounded-full text-sm">
                            {dept}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
