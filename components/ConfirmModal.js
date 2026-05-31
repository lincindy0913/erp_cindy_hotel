'use client';
import { useState, useCallback, useRef } from 'react';

/**
 * Hook for imperative confirm dialogs.
 * Usage:
 *   const { dialog, confirm, close } = useConfirmDialog();
 *   confirm('Are you sure?', () => doSomething());
 *   <ConfirmModal dialog={dialog} onClose={close} />
 */
export function useConfirmDialog() {
  const callbackRef = useRef(null);

  const handleConfirm = useCallback(() => {
    const cb = callbackRef.current;
    callbackRef.current = null;
    setDialog(d => ({ ...d, open: false }));
    cb?.();
  }, []);

  const [dialog, setDialog] = useState({
    open: false, title: '確認', message: '', danger: false, confirmLabel: '確定',
    _onConfirm: handleConfirm,
  });

  const confirm = useCallback((message, callback, options = {}) => {
    callbackRef.current = callback;
    setDialog({
      open: true,
      message,
      title: options.title ?? '確認',
      danger: options.danger ?? false,
      confirmLabel: options.confirmLabel ?? '確定',
      _onConfirm: handleConfirm,
    });
  }, [handleConfirm]);

  const close = useCallback(() => {
    callbackRef.current = null;
    setDialog(d => ({ ...d, open: false }));
  }, []);

  return { dialog, confirm, close };
}

export default function ConfirmModal({ dialog, onClose, onConfirm }) {
  if (!dialog?.open) return null;
  const handleConfirm = onConfirm ?? dialog._onConfirm;
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[80]" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-sm mx-4" onClick={e => e.stopPropagation()}>
        <h3 className="font-semibold text-gray-800 mb-2">{dialog.title}</h3>
        <div className="text-sm text-gray-600 mb-6 whitespace-pre-line">{dialog.message}</div>
        <div className="flex justify-end gap-2">
          <button onClick={onClose}
            className="px-4 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200">
            取消
          </button>
          <button onClick={handleConfirm}
            className={`px-4 py-2 text-sm text-white rounded-lg ${dialog.danger ? 'bg-red-600 hover:bg-red-700' : 'bg-teal-600 hover:bg-teal-700'}`}>
            {dialog.confirmLabel || '確定'}
          </button>
        </div>
      </div>
    </div>
  );
}
