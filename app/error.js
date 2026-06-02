'use client';

export default function RouteError({ error, reset }) {
  return (
    <div className="min-h-[60vh] flex items-center justify-center p-8">
      <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-8 text-center">
        <div className="text-5xl mb-4">⚠️</div>
        <h1 className="text-xl font-bold text-gray-800 mb-2">頁面發生錯誤</h1>
        <p className="text-sm text-gray-500 mb-6">
          系統遇到未預期的問題。請重新整理後再試，若問題持續請聯繫管理員。
        </p>
        {process.env.NODE_ENV !== 'production' && error?.message && (
          <pre className="text-left text-xs bg-red-50 text-red-700 rounded p-3 mb-4 overflow-auto max-h-32 whitespace-pre-wrap">
            {error.message}
          </pre>
        )}
        <div className="flex gap-3 justify-center">
          <button
            onClick={reset}
            className="px-4 py-2 text-sm bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
          >
            重試
          </button>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            重新整理
          </button>
        </div>
      </div>
    </div>
  );
}
