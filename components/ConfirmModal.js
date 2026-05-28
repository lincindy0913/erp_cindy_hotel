'use client';

import { useState, useCallback } from 'react';

export function useConfirmDialog() {
  const [dialog, setDialog] = useState({ open: false, title: '', message: '', onConfirm: null, danger: true });

  const confirm = useCallback((message, onConfirm, title = '確認操作', danger = true) => {
    setDialog({ open: true, title, message, onConfirm, danger });
  }, []);

  const close = useCallback(() => setDialog(d => ({ ...d, open: false })), []);

  return { dialog, confirm, close };
}

export default function ConfirmModal({ dialog, onClose }) {
  if (!dialog.open) return null;
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[80]" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-sm mx-4" onClick={e => e.stopPropagation()}>
        <h3 className="font-semibold text-gray-800 mb-2">{dialog.title}</h3>
        <p className="text-sm text-gray-600 mb-6 whitespace-pre-line">{dialog.message}</p>
        <div className="flex justify-end gap-2">
          <button onClick={onClose}
            className="px-4 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200">
            取消
          </button>
          <button
            onClick={() => { onClose(); dialog.onConfirm?.(); }}
            className={`px-4 py-2 text-sm text-white rounded-lg ${dialog.danger ? 'bg-red-600 hover:bg-red-700' : 'bg-teal-600 hover:bg-teal-700'}`}>
            確認
          </button>
        </div>
      </div>
    </div>
  );
}
