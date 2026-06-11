'use client';

export function ConfirmModal({ confirmState, setConfirmState }) {
  if (!confirmState) return null;
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60]">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-sm mx-4 p-6">
        <p className="text-gray-800 text-sm mb-5 whitespace-pre-line">{confirmState.message}</p>
        <div className="flex justify-end gap-2">
          <button className="px-4 py-2 text-sm bg-gray-200 rounded hover:bg-gray-300"
            onClick={() => setConfirmState(null)}>取消</button>
          <button className="px-4 py-2 text-sm bg-red-600 text-white rounded hover:bg-red-700"
            onClick={() => { const fn = confirmState.onConfirm; setConfirmState(null); fn(); }}>
            {confirmState.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
