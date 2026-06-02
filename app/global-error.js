'use client';

export default function GlobalError({ error, reset }) {
  return (
    <html lang="zh-TW">
      <body style={{ margin: 0, fontFamily: 'sans-serif', background: '#f9fafb' }}>
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
          <div style={{ maxWidth: '28rem', width: '100%', background: '#fff', borderRadius: '0.75rem', boxShadow: '0 4px 24px rgba(0,0,0,0.10)', padding: '2rem', textAlign: 'center' }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>⚠️</div>
            <h1 style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#1f2937', marginBottom: '0.5rem' }}>系統發生嚴重錯誤</h1>
            <p style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '1.5rem' }}>
              請重新整理頁面，若問題持續發生請聯繫管理員。
            </p>
            {process.env.NODE_ENV !== 'production' && error?.message && (
              <pre style={{ textAlign: 'left', fontSize: '0.75rem', background: '#fef2f2', color: '#b91c1c', borderRadius: '0.375rem', padding: '0.75rem', marginBottom: '1rem', overflow: 'auto', maxHeight: '8rem', whiteSpace: 'pre-wrap' }}>
                {error.message}
              </pre>
            )}
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
              <button
                onClick={reset}
                style={{ padding: '0.5rem 1rem', fontSize: '0.875rem', background: '#f3f4f6', border: 'none', borderRadius: '0.5rem', cursor: 'pointer' }}
              >
                重試
              </button>
              <button
                onClick={() => window.location.reload()}
                style={{ padding: '0.5rem 1rem', fontSize: '0.875rem', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '0.5rem', cursor: 'pointer' }}
              >
                重新整理
              </button>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
