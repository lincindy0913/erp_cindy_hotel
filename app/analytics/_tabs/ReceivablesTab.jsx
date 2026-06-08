'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';

const NT  = v => `NT$ ${Number(v || 0).toLocaleString()}`;
const fmt = n => Number(n || 0).toLocaleString('zh-TW');

function AgeBadge({ days }) {
  if (days <= 30)  return <span className="text-xs px-1.5 py-0.5 rounded bg-yellow-100 text-yellow-800">{days} 天</span>;
  if (days <= 60)  return <span className="text-xs px-1.5 py-0.5 rounded bg-orange-100 text-orange-800">{days} 天</span>;
  return <span className="text-xs px-1.5 py-0.5 rounded bg-red-200 text-red-800 font-semibold">{days} 天</span>;
}

export default function ReceivablesTab() {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [section, setSection] = useState('all'); // all | rental | pms | engineering

  useEffect(() => {
    setLoading(true);
    fetch('/api/analytics/receivables')
      .then(r => r.ok ? r.json() : null)
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="flex items-center justify-center py-20 text-gray-400 gap-2">
      <div className="animate-spin w-5 h-5 border-2 border-gray-300 border-t-gray-600 rounded-full" />
      載入中…
    </div>
  );
  if (!data) return <div className="text-center py-20 text-gray-400">無法載入應收帳款資料</div>;

  const allItems = [
    ...(data.rental    || []).map(r => ({ ...r, _src: 'rental' })),
    ...(data.pms       || []).map(r => ({ ...r, _src: 'pms' })),
    ...(data.engineering || []).map(r => ({ ...r, _src: 'engineering' })),
  ].sort((a, b) => b.daysOverdue - a.daysOverdue);

  const shown = section === 'all' ? allItems : allItems.filter(i => i._src === section);

  const totalBySection = {
    rental:      (data.rental      || []).reduce((s, r) => s + r.amount, 0),
    pms:         (data.pms         || []).reduce((s, r) => s + r.amount, 0),
    engineering: (data.engineering || []).reduce((s, r) => s + r.amount, 0),
  };
  const grandTotal = Object.values(totalBySection).reduce((s, v) => s + v, 0);

  const SECTIONS = [
    { key: 'all',         label: '全部',   count: allItems.length,               total: grandTotal },
    { key: 'rental',      label: '租屋租金', count: (data.rental||[]).length,      total: totalBySection.rental },
    { key: 'pms',         label: 'PMS 信用卡', count: (data.pms||[]).length,      total: totalBySection.pms },
    { key: 'engineering', label: '工程應收', count: (data.engineering||[]).length, total: totalBySection.engineering },
  ];

  const SRC_LABEL = { rental: '租金', pms: 'PMS CC', engineering: '工程' };
  const SRC_COLOR = { rental: 'bg-teal-100 text-teal-800', pms: 'bg-purple-100 text-purple-800', engineering: 'bg-blue-100 text-blue-800' };

  return (
    <div className="space-y-5">
      {/* KPI summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {SECTIONS.map(s => (
          <button key={s.key} onClick={() => setSection(s.key)}
            className={`rounded-xl p-4 border text-left transition-colors ${section === s.key ? 'bg-cyan-50 border-cyan-400 shadow-sm' : 'bg-white border-gray-200 hover:border-cyan-200'}`}>
            <p className="text-xs text-gray-500">{s.label}</p>
            <p className={`text-xl font-bold mt-1 ${s.total > 0 ? 'text-red-600' : 'text-gray-400'}`}>{NT(s.total)}</p>
            <p className="text-xs text-gray-400 mt-0.5">{s.count} 筆</p>
          </button>
        ))}
      </div>

      {/* Table */}
      {shown.length === 0 ? (
        <div className="text-center py-16 text-gray-400">目前無待收應收帳款</div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500">
                <tr>
                  <th className="text-left px-4 py-2.5">來源</th>
                  <th className="text-left px-4 py-2.5">對象</th>
                  <th className="text-left px-4 py-2.5">說明</th>
                  <th className="text-right px-4 py-2.5">金額</th>
                  <th className="text-center px-4 py-2.5">到期日</th>
                  <th className="text-center px-4 py-2.5">逾期天數</th>
                  <th className="text-center px-4 py-2.5">處理</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {shown.map((r, i) => (
                  <tr key={i} className={r.daysOverdue > 30 ? 'bg-red-50/30' : 'hover:bg-gray-50/50'}>
                    <td className="px-4 py-2.5">
                      <span className={`text-xs px-2 py-0.5 rounded font-medium ${SRC_COLOR[r._src]}`}>
                        {SRC_LABEL[r._src]}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 font-medium max-w-[120px] truncate" title={r.party}>{r.party}</td>
                    <td className="px-4 py-2.5 text-gray-500 max-w-[160px] truncate" title={r.description}>{r.description}</td>
                    <td className="px-4 py-2.5 text-right font-semibold text-red-700">{NT(r.amount)}</td>
                    <td className="px-4 py-2.5 text-center text-gray-600 text-xs">{r.dueDate || '—'}</td>
                    <td className="px-4 py-2.5 text-center">
                      {r.daysOverdue > 0 ? <AgeBadge days={r.daysOverdue} /> : <span className="text-xs text-gray-400">未逾期</span>}
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      {r.url && (
                        <Link href={r.url} className="text-xs text-cyan-600 hover:underline">前往處理</Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-50 font-semibold">
                <tr>
                  <td colSpan={3} className="px-4 py-2 text-gray-700">合計（{shown.length} 筆）</td>
                  <td className="text-right px-4 py-2 text-red-700">{NT(shown.reduce((s, r) => s + r.amount, 0))}</td>
                  <td colSpan={3} />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
