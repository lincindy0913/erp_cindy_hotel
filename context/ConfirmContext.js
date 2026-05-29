'use client';

import { createContext, useContext, useState, useRef, useCallback } from 'react';
import ConfirmModal from '@/components/ConfirmModal';

const ConfirmContext = createContext(null);

// Dual-mode confirm:
//   callback mode : confirm(msg, fn, title?, danger?) — drop-in for old askConfirm
//   promise mode  : confirm(msg, { title?, danger?, confirmLabel? }) → Promise<boolean>
export function ConfirmProvider({ children }) {
  const [dialog, setDialog] = useState({ open: false, title: '', message: '', danger: true, confirmLabel: '確定' });
  const resolveRef = useRef(null);
  const callbackRef = useRef(null);

  const confirm = useCallback((message, onConfirmOrOpts, title = '確認操作', danger = true) => {
    if (typeof onConfirmOrOpts === 'function') {
      callbackRef.current = onConfirmOrOpts;
      resolveRef.current = null;
      setDialog({ open: true, title, message, danger, confirmLabel: '確定' });
      return;
    }
    const opts = onConfirmOrOpts ?? {};
    callbackRef.current = null;
    return new Promise(resolve => {
      resolveRef.current = resolve;
      setDialog({
        open: true,
        title: opts.title ?? '確認操作',
        message,
        danger: opts.danger ?? true,
        confirmLabel: opts.confirmLabel ?? '確定',
      });
    });
  }, []);

  const handleClose = useCallback(() => {
    setDialog(d => ({ ...d, open: false }));
    resolveRef.current?.(false);
    resolveRef.current = null;
    callbackRef.current = null;
  }, []);

  const handleConfirm = useCallback(() => {
    setDialog(d => ({ ...d, open: false }));
    if (callbackRef.current) {
      callbackRef.current();
      callbackRef.current = null;
    } else {
      resolveRef.current?.(true);
      resolveRef.current = null;
    }
  }, []);

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      <ConfirmModal dialog={dialog} onClose={handleClose} onConfirm={handleConfirm} />
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm must be used within ConfirmProvider');
  return ctx.confirm;
}
