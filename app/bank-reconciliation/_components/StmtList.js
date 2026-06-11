'use client';
import { RECON_STATUS } from '@/lib/recon-statuses';

const fmt = (n) => (n == null ? '—' : Number(n).toLocaleString('zh-TW'));

const STATUS_BADGE = {
  [RECON_STATUS.IN_PROGRESS]: 'bg-amber-100 text-amber-700',
  [RECON_STATUS.BALANCED]:    'bg-green-100 text-green-700',
  [RECON_STATUS.DIFF]:        'bg-red-100 text-red-700',
};

export default function StmtList({ stmts, onOpen }) {
  if (!stmts.length) return null;
  return (
    <div className="bg-white rounded-xl shadow-sm overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-xs text-gray-500 sticky top-0 z-10">
          <tr>
            <th className="px-4 py-3 text-left">月份</th>
            <th className="px-4 py-3 text-left">帳戶</th>
            <th className="px-4 py-3 text-right">系統期初</th>
            <th className="px-4 py-3 text-right">存摺期末</th>
            <th className="px-4 py-3 text-center">明細筆數</th>
            <th className="px-4 py-3 text-center">狀態</th>
            <th className="px-4 py-3 text-center">操作</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {stmts.map(s => (
            <tr key={s.id} className="hover:bg-gray-50">
              <td className="px-4 py-3 font-mono">{s.yearMonth}</td>
              <td className="px-4 py-3">{s.account?.name || s.accountId}</td>
              <td className="px-4 py-3 text-right tabular-nums">{fmt(s.openingBalance)}</td>
              <td className="px-4 py-3 text-right tabular-nums">{fmt(s.closingBankBalance)}</td>
              <td className="px-4 py-3 text-center">{s.lineCount}</td>
              <td className="px-4 py-3 text-center">
                <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_BADGE[s.status] || 'bg-gray-100'}`}>{s.status}</span>
              </td>
              <td className="px-4 py-3 text-center">
                <button onClick={() => onOpen(s.id)} className="text-xs text-blue-600 hover:underline">開啟</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
