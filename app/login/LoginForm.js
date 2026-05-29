'use client';

import { useState, useRef, useEffect } from 'react';
import { signIn, useSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';

export default function LoginForm() {
  const [email,     setEmail]     = useState('');
  const [password,  setPassword]  = useState('');
  const [totpCode,  setTotpCode]  = useState('');
  const [step,      setStep]      = useState('password'); // 'password' | 'totp'
  const [error,     setError]     = useState('');
  const [loading,   setLoading]   = useState(false);
  const totpRef    = useRef(null);
  const router     = useRouter();
  const searchParams = useSearchParams();
  const { status } = useSession();

  // Resolve the safe same-origin callbackUrl, fall back to '/'
  // Only accept relative paths to avoid open redirect (window not available during SSR)
  const callbackUrl = (() => {
    const raw = searchParams.get('callbackUrl') || '/';
    if (raw.startsWith('/')) return raw;
    return '/';
  })();

  // Already authenticated → skip the form and go straight to the destination
  useEffect(() => {
    if (status === 'authenticated') {
      router.replace(callbackUrl);
    }
  }, [status, callbackUrl, router]);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError('');

    const result = await signIn('credentials', {
      email,
      password,
      totpCode: step === 'totp' ? totpCode : '',
      redirect: false,
    });

    setLoading(false);

    if (!result?.error) {
      router.push(callbackUrl);
      router.refresh();
      return;
    }

    if (result.error === 'TOTP_REQUIRED') {
      setStep('totp');
      setTotpCode('');
      setTimeout(() => totpRef.current?.focus(), 100);
      return;
    }

    setError(step === 'totp' ? '驗證碼錯誤，請重新輸入' : '登入失敗，請確認帳號密碼是否正確');
  }

  function handleBackToPassword() {
    setStep('password');
    setTotpCode('');
    setError('');
  }

  // Don't flash the form while the session check is in flight
  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
        <div className="text-gray-400 text-sm">載入中...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="bg-white p-8 rounded-xl shadow-xl w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-800 mb-2">進銷存系統</h1>
          <p className="text-gray-500">
            {step === 'totp' ? '請輸入驗證器上的 6 位數驗證碼' : '請輸入帳號密碼登入'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 p-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          {step === 'password' ? (
            <>
              <div>
                <label htmlFor="f" className="block text-sm font-medium text-gray-700 mb-1">電子郵件</label>
                <input
                  id="f"
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                  placeholder="請輸入電子郵件"
                />
              </div>
              <div>
                <label htmlFor="f-2" className="block text-sm font-medium text-gray-700 mb-1">密碼</label>
                <input
                  id="f-2"
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                  placeholder="請輸入密碼"
                />
              </div>
            </>
          ) : (
            <div>
              <label htmlFor="f-3" className="block text-sm font-medium text-gray-700 mb-1">驗證碼</label>
              <input
                id="f-3"
                ref={totpRef}
                type="text"
                inputMode="numeric"
                pattern="[0-9A-Z\s]{6,10}"
                maxLength={10}
                value={totpCode}
                onChange={e => setTotpCode(e.target.value)}
                required
                autoComplete="one-time-code"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition text-center text-2xl tracking-widest font-mono"
                placeholder="000000"
              />
              <p className="text-xs text-gray-400 mt-1.5">
                請開啟 Google Authenticator 或其他驗證器 App，輸入 6 位數字驗證碼。
                或輸入備用碼（含大寫英文字母）。
              </p>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition font-medium"
          >
            {loading ? '驗證中...' : step === 'totp' ? '確認驗證碼' : '登入'}
          </button>

          {step === 'totp' && (
            <button
              type="button"
              onClick={handleBackToPassword}
              className="w-full text-sm text-gray-500 hover:text-gray-700 py-1"
            >
              ← 返回重新輸入帳號密碼
            </button>
          )}
        </form>

        {step === 'password' && (
          <div className="mt-6 text-center text-sm text-gray-500">
            <p>預設管理員帳號: admin@hotel.com</p>
          </div>
        )}
      </div>
    </div>
  );
}
