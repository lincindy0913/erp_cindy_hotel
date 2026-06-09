'use client';

import { getContractDisplayStatus, getTenantDisplayName } from '../_lib/rentalHelpers';

export default function TerminateContractModal({ terminateModal, setTerminateModal, terminateContract }) {
  if (!terminateModal) return null;

  const STATUS_LABELS = { active: '生效中', pending: '待審核', expired: '已到期', terminated: '已終止' };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setTerminateModal(null)}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
        <div className="p-5">
          <h3 className="text-base font-semibold text-gray-800 mb-1">辦理退租</h3>
          <p className="text-sm text-gray-500 mb-4">租客：{getTenantDisplayName(terminateModal.tenant)}</p>
          <div className="mb-3">
            <label htmlFor="f-29" className="text-sm text-gray-600 block mb-1">退租日期</label>
            <input id="f-29" type="date" value={terminateModal.endDate}
              onChange={e => setTerminateModal(m => ({ ...m, endDate: e.target.value }))}
              className="border rounded px-3 py-1.5 text-sm w-full" />
          </div>
          <p className="text-sm text-gray-600 mb-2">選擇要終止的合約：</p>
          <div className="space-y-2 mb-5">
            {terminateModal.contracts.map(c => (
              <div key={c.id} className="flex items-center justify-between border rounded-lg px-3 py-2 bg-orange-50">
                <div>
                  <span className="text-sm font-medium text-gray-800">{c.property?.name || '未知物業'}</span>
                  <span className="text-xs text-gray-500 ml-2">（{STATUS_LABELS[getContractDisplayStatus(c)] || c.status}）</span>
                  {c.endDate && <span className="text-xs text-gray-400 ml-2">到期 {c.endDate}</span>}
                </div>
                <button
                  onClick={() => terminateContract(c.id, terminateModal.endDate)}
                  className="text-xs px-3 py-1 bg-orange-500 text-white rounded hover:bg-orange-600 font-medium whitespace-nowrap">
                  確認退租
                </button>
              </div>
            ))}
          </div>
          <div className="flex justify-end">
            <button onClick={() => setTerminateModal(null)} className="px-4 py-2 text-sm bg-gray-200 rounded hover:bg-gray-300">取消</button>
          </div>
        </div>
      </div>
    </div>
  );
}
