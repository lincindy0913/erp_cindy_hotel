'use client';
import { RECON_STATUS, RECON_LINE_STATUS } from '@/lib/recon-statuses';

const fmt = (n) => (n == null ? '—' : Number(n).toLocaleString('zh-TW'));

const STATUS_BADGE = {
  [RECON_STATUS.IN_PROGRESS]: 'bg-amber-100 text-amber-700',
  [RECON_STATUS.BALANCED]:    'bg-green-100 text-green-700',
  [RECON_STATUS.DIFF]:        'bg-red-100 text-red-700',
};

export default function ReconSummary({ detail, stats, onUpdateStmt }) {
  return (
    <div className="bg-white rounded-xl shadow-sm p-5 border-l-4 border-blue-500">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-bold text-gray-800">{detail.yearMonth} 調節表</h2>
        <span className={`text-xs px-3 py-1 rounded-full ${STATUS_BADGE[detail.status] || 'bg-gray-100 text-gray-600'}`}>{detail.status}</span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div>
          <p className="text-xs text-gray-500">系統期初餘額</p>
          <p className="font-bold text-gray-800">{fmt(detail.openingBalance)}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500">系統期末餘額（計算值）</p>
          <p className="font-bold text-blue-700">{fmt(stats.sysBalance)}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500 mb-1">存摺期末餘額（人工輸入）</p>
          <input type="number" step="1"
            defaultValue={detail.closingBankBalance ?? ''}
            onBlur={e => onUpdateStmt({ closingBankBalance: parseFloat(e.target.value) || null })}
            className="border rounded-lg px-3 py-1.5 text-sm w-full text-right"
            placeholder="輸入存摺期末餘額" />
        </div>
        <div>
          <p className="text-xs text-gray-500">差異</p>
          <p className={`font-bold text-xl ${stats.diff == null ? 'text-gray-400' : Math.abs(stats.diff) < 1 ? 'text-green-600' : 'text-red-600'}`}>
            {stats.diff == null ? '—' : (stats.diff >= 0 ? '+' : '') + fmt(stats.diff)}
          </p>
          {stats.diff != null && Math.abs(stats.diff) < 1 && (
            <button onClick={() => onUpdateStmt({ status: RECON_STATUS.BALANCED })} className="mt-1 text-xs text-green-700 underline">
              標記為已平衡
            </button>
          )}
        </div>
      </div>
      <div className="mt-3 flex gap-3 text-xs text-gray-500">
        <span>未配對存摺明細：<b className={stats.unmatchedLines ? 'text-red-600' : 'text-green-600'}>{stats.unmatchedLines} 筆</b></span>
        <span>未配對系統交易：<b className={stats.unmatchedSysTxs ? 'text-amber-600' : 'text-green-600'}>{stats.unmatchedSysTxs} 筆</b></span>
      </div>
    </div>
  );
}
