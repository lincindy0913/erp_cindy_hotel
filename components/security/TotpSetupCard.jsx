'use client';

import { useState } from 'react';

export default function TotpSetupCard({ initialEnabled = false }) {
  const [enabled,     setEnabled]     = useState(initialEnabled);
  const [step,        setStep]        = useState('idle');   // idle | setup | verify | done | disable
  const [qrCode,      setQrCode]      = useState('');
  const [secret,      setSecret]      = useState('');
  const [token,       setToken]       = useState('');
  const [backupCodes, setBackupCodes] = useState([]);
  const [password,    setPassword]    = useState('');
  const [error,       setError]       = useState('');
  const [loading,     setLoading]     = useState(false);

  async function startSetup() {
    setLoading(true); setError('');
    try {
      const res  = await fetch('/api/auth/totp/setup');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || '無法取得 QR code');
      setQrCode(data.qrCode);
      setSecret(data.secret);
      setToken('');
      setStep('setup');
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }

  async function verifyAndEnable() {
    if (!token || token.replace(/\s/g, '').length < 6) { setError('請輸入 6 位數驗證碼'); return; }
    setLoading(true); setError('');
    try {
      const res  = await fetch('/api/auth/totp/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secret, token }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || '驗證碼錯誤');
      setBackupCodes(data.backupCodes);
      setEnabled(true);
      setStep('done');
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }

  async function disableTotp() {
    if (!password) { setError('請輸入密碼'); return; }
    setLoading(true); setError('');
    try {
      const res  = await fetch('/api/auth/totp/setup', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || '操作失敗');
      setEnabled(false);
      setPassword('');
      setStep('idle');
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }

  return (
    <div className="bg-white border rounded-xl p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-gray-800">雙因素驗證（2FA）</h3>
          <p className="text-sm text-gray-500 mt-0.5">使用 Google Authenticator 或相容 App 保護帳號</p>
        </div>
        <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${enabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
          {enabled ? '已啟用' : '未啟用'}
        </span>
      </div>

      {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</div>}

      {/* 未啟用 — 引導設定 */}
      {!enabled && step === 'idle' && (
        <button onClick={startSetup} disabled={loading}
          className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
          {loading ? '載入中...' : '開始設定 2FA'}
        </button>
      )}

      {/* Step 1: 顯示 QR code */}
      {step === 'setup' && (
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            1. 使用 <strong>Google Authenticator</strong>（或任何 TOTP App）掃描下方 QR Code
          </p>
          {qrCode && (
            <div className="flex justify-center">
              <img src={qrCode} alt="2FA QR Code" className="w-44 h-44 border rounded-lg" />
            </div>
          )}
          <p className="text-xs text-gray-400 text-center break-all">
            無法掃描？手動輸入金鑰：<code className="bg-gray-100 px-1 rounded">{secret}</code>
          </p>
          <p className="text-sm text-gray-600">2. 掃描後輸入 App 顯示的 6 位數驗證碼</p>
          <input
            type="text"
            inputMode="numeric"
            maxLength={6}
            value={token}
            onChange={e => setToken(e.target.value)}
            placeholder="000000"
            className="w-full border rounded-lg px-4 py-2 text-center text-xl tracking-widest font-mono focus:ring-2 focus:ring-blue-500"
          />
          <div className="flex gap-2">
            <button onClick={() => { setStep('idle'); setError(''); }}
              className="flex-1 px-4 py-2 text-sm border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50">
              取消
            </button>
            <button onClick={verifyAndEnable} disabled={loading}
              className="flex-1 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
              {loading ? '驗證中...' : '確認啟用'}
            </button>
          </div>
        </div>
      )}

      {/* Step 2: 啟用成功，顯示備用碼 */}
      {step === 'done' && (
        <div className="space-y-3">
          <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-800">
            ✓ 雙因素驗證已成功啟用！
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
            <p className="text-sm font-semibold text-amber-800 mb-2">⚠ 備用碼（請立即抄寫並妥善保存，僅顯示一次）</p>
            <div className="grid grid-cols-2 gap-1.5">
              {backupCodes.map((c, i) => (
                <code key={i} className="bg-white border rounded px-2 py-1 text-sm font-mono text-center text-gray-700">
                  {c}
                </code>
              ))}
            </div>
            <p className="text-xs text-amber-600 mt-2">每組備用碼只能使用一次，遺失後無法復原。</p>
          </div>
          <button onClick={() => setStep('idle')}
            className="px-4 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200">
            完成
          </button>
        </div>
      )}

      {/* 已啟用 — 可停用 */}
      {enabled && step === 'idle' && (
        <button onClick={() => { setStep('disable'); setError(''); }}
          className="px-4 py-2 text-sm border border-red-300 text-red-600 rounded-lg hover:bg-red-50">
          停用 2FA
        </button>
      )}

      {/* 確認停用 */}
      {step === 'disable' && (
        <div className="space-y-3">
          <p className="text-sm text-gray-600">請輸入目前的登入密碼以確認停用 2FA</p>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="登入密碼"
            className="w-full border rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-red-400"
          />
          <div className="flex gap-2">
            <button onClick={() => { setStep('idle'); setPassword(''); setError(''); }}
              className="flex-1 px-4 py-2 text-sm border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50">
              取消
            </button>
            <button onClick={disableTotp} disabled={loading}
              className="flex-1 px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50">
              {loading ? '處理中...' : '確認停用'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
