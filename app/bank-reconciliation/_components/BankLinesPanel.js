'use client';
import { RECON_LINE_STATUS } from '@/lib/recon-statuses';

const fmt = (n) => (n == null ? '—' : Number(n).toLocaleString('zh-TW'));

const MATCH_BADGE = {
  [RECON_LINE_STATUS.UNMATCHED]:  'bg-gray-100 text-gray-600',
  [RECON_LINE_STATUS.MATCHED]:    'bg-green-100 text-green-700',
  [RECON_LINE_STATUS.EXCEPTION]:  'bg-blue-100 text-blue-700',
};

export default function BankLinesPanel({
  lines,
  lineForm, setLineForm,
  addingLine, lineDateRef,
  autoMatching,
  onAddLine,
  onAutoMatch,
  onApproveException,
  onOpenBuildModal,
  onMatchLine,
  onDeleteLine,
}) {
  return (
    <div className="bg-white rounded-xl shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <h3 className="font-medium text-sm text-gray-700">銀行存摺明細</h3>
        <button onClick={onAutoMatch} disabled={autoMatching} className="text-xs bg-teal-600 text-white px-3 py-1 rounded-lg hover:bg-teal-700 disabled:opacity-50">
          {autoMatching ? '配對中…' : '自動配對'}
        </button>
      </div>

      {/* 新增存摺行 */}
      <div className="p-3 border-b bg-gray-50">
        <p className="text-xs text-gray-500 mb-2">新增存摺行</p>
        <div className="grid grid-cols-3 gap-2">
          <input ref={lineDateRef} type="date" value={lineForm.txDate} onChange={e => setLineForm(p => ({ ...p, txDate: e.target.value }))}
            className="border rounded px-2 py-1 text-xs" placeholder="日期" />
          <input type="text" value={lineForm.description} onChange={e => setLineForm(p => ({ ...p, description: e.target.value }))}
            className="border rounded px-2 py-1 text-xs" placeholder="說明" />
          <div className="flex gap-1">
            <input type="number" step="1" value={lineForm.creditAmount} onChange={e => setLineForm(p => ({ ...p, creditAmount: e.target.value }))}
              className="border rounded px-2 py-1 text-xs w-full" placeholder="存入" />
            <input type="number" step="1" value={lineForm.debitAmount} onChange={e => setLineForm(p => ({ ...p, debitAmount: e.target.value }))}
              className="border rounded px-2 py-1 text-xs w-full" placeholder="提出" />
          </div>
          <input type="number" step="1" value={lineForm.runningBalance} onChange={e => setLineForm(p => ({ ...p, runningBalance: e.target.value }))}
            className="border rounded px-2 py-1 text-xs col-span-2" placeholder="存摺餘額（選填）" />
          <button onClick={onAddLine} disabled={addingLine || !lineForm.txDate} className="text-xs bg-green-600 text-white rounded px-2 py-1 hover:bg-green-700 disabled:opacity-50">
            {addingLine ? '…' : '新增'}
          </button>
        </div>
      </div>

      <div className="overflow-y-auto max-h-96">
        <table className="w-full text-xs">
          <thead className="bg-gray-50 text-gray-500 sticky top-0">
            <tr>
              <th className="px-3 py-2 text-left">日期</th>
              <th className="px-3 py-2 text-left">說明</th>
              <th className="px-3 py-2 text-right">存入</th>
              <th className="px-3 py-2 text-right">提出</th>
              <th className="px-3 py-2 text-center">狀態</th>
              <th className="px-3 py-2 text-center">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {lines.length === 0 && (
              <tr><td colSpan={6} className="text-center py-6 text-gray-400">尚無存摺明細</td></tr>
            )}
            {lines.map(line => (
              <tr key={line.id} className={`hover:bg-gray-50 ${line.matchStatus === RECON_LINE_STATUS.UNMATCHED ? 'bg-amber-50/30' : ''}`}>
                <td className="px-3 py-2 font-mono">{line.txDate}</td>
                <td className="px-3 py-2 text-gray-500 max-w-[100px] truncate" title={line.description}>{line.description || '—'}</td>
                <td className="px-3 py-2 text-right text-green-700">{line.creditAmount > 0 ? fmt(line.creditAmount) : ''}</td>
                <td className="px-3 py-2 text-right text-red-600">{line.debitAmount > 0 ? fmt(line.debitAmount) : ''}</td>
                <td className="px-3 py-2 text-center">
                  <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${MATCH_BADGE[line.matchStatus] || 'bg-gray-100'}`}>
                    {line.matchStatus}
                    {line.matchedTxId && ` #${line.matchedTxId}`}
                  </span>
                </td>
                <td className="px-3 py-2 text-center">
                  <div className="flex gap-1 justify-center flex-wrap">
                    {line.matchStatus === RECON_LINE_STATUS.UNMATCHED && (
                      <>
                        <button onClick={() => onApproveException(line.id)} className="text-[10px] text-blue-600 hover:underline">例外</button>
                        <button onClick={() => onOpenBuildModal(line)} className="text-[10px] text-green-600 hover:underline font-medium">補建</button>
                      </>
                    )}
                    {line.matchedTxId && (
                      <button onClick={() => onMatchLine(line.id, null)} className="text-[10px] text-amber-600 hover:underline">解除</button>
                    )}
                    <button onClick={() => onDeleteLine(line.id)} className="text-[10px] text-red-500 hover:underline">刪</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
