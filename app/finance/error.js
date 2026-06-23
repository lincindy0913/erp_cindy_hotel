'use client';

import { useEffect } from 'react';

export default function Error({ error, reset }) {
  useEffect(() => {
    console.error('[finance] page error:', error);
  }, [error]);

  return (
    <div className="min-h-[40vh] flex flex-col items-center justify-center gap-4 text-center px-4">
      <div className="text-4xl">⚠️</div>
      <h2 className="text-lg font-semibold text-gray-800">財務頁面發生錯誤</h2>
      <p className="text-sm text-gray-500 max-w-md">{error?.message || '請重新整理或聯絡系統管理員'}</p>
      <button
        onClick={reset}
        className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700"
      >
        重試
      </button>
    </div>
  );
}
