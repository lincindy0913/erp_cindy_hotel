'use client';

export default function LockHistoryModal({ lockAudits, onClose }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60]" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 p-5" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-bold text-gray-800">鎖帳操作紀錄</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
        </div>
        {lockAudits.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">尚無紀錄</p>
        ) : (
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {lockAudits.map(a => (
              <div key={a.id} className={`rounded-lg px-3 py-2 text-xs border ${a.action === 'lock' ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'}`}>
                <div className="flex items-center justify-between">
                  <span className={`font-semibold ${a.action === 'lock' ? 'text-red-700' : 'text-green-700'}`}>
                    {a.action === 'lock' ? '🔒 鎖帳' : '🔓 解鎖'}
                  </span>
                  <span className="text-gray-400">{new Date(a.performedAt).toLocaleString('zh-TW')}</span>
                </div>
                <div className="text-gray-600 mt-0.5">操作者：{a.performedBy}</div>
                {a.reason && <div className="text-gray-700 mt-0.5">原因：{a.reason}</div>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
