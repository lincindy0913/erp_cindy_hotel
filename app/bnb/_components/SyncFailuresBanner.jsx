'use client';

export default function SyncFailuresBanner({ syncFailures, syncRetrying, retrySyncFailure }) {
  if (!syncFailures || syncFailures.length === 0) return null;
  return (
    <div className="mb-4 bg-red-50 border border-red-200 rounded-xl p-3 space-y-2">
      {syncFailures.map(f => (
        <div key={f.id} className="flex items-center justify-between text-sm">
          <span className="text-red-700">⚠ 出納同步失敗：{f.description}</span>
          <button onClick={() => retrySyncFailure(f)} disabled={syncRetrying === f.id}
            className="px-3 py-1 text-xs bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50">
            {syncRetrying === f.id ? '重試中…' : '重試'}
          </button>
        </div>
      ))}
    </div>
  );
}
