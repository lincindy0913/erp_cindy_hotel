import { useEffect } from 'react';

/**
 * 按 Esc 鍵時執行 onEsc。
 * @param {() => void} onEsc  - 關閉 handler
 * @param {boolean}    active - 只有在 modal 開啟時才掛載（預設 true）
 */
export function useEscKey(onEsc, active = true) {
  useEffect(() => {
    if (!active || !onEsc) return;
    const handler = (e) => { if (e.key === 'Escape') onEsc(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onEsc, active]);
}
