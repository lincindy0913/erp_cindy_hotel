'use client';

import { useState, useRef, useEffect } from 'react';
import { signIn, useSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';

const EMAIL_KEY = 'erp_last_email';

export default function LoginForm() {
  const [email,        setEmail]        = useState('');
  const [password,     setPassword]     = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [totpCode,     setTotpCode]     = useState('');
  const [step,         setStep]         = useState('password'); // 'password' | 'totp'
  const [error,        setError]        = useState('');
  const [loading,      setLoading]      = useState(false);
  const totpRef    = useRef(null);
  const router     = useRouter();
  const searchParams = useSearchParams();
  const { status } = useSession();

  const callbackUrl = (() => {
    const raw = searchParams.get('callbackUrl') || '/';
    if (raw.startsWith('/')) return raw;
    return '/';
  })();

  useEffect(() => {
    const saved = localStorage.getItem(EMAIL_KEY);
    if (saved) setEmail(saved);
  }, []);

  useEffect(() => {
    if (status === 'authenticated') {
      router.replace(callbackUrl);
    }
  }, [status, callbackUrl, router]);

  async function handleSubmit(e, overrideTotpCode) {
    e?.preventDefault();
    setLoading(true);
    setError('');

    if (step === 'password' && email) {
      localStorage.setItem(EMAIL_KEY, email);
    }

    const result = await signIn('credentials', {
      email,
      password,
      totpCode: step === 'totp' ? (overrideTotpCode ?? totpCode) : '',
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

  function handleTotpChange(e) {
    const val = e.target.value.toUpperCase().replace(/\s/g, '');
    setTotpCode(val);
    if (val.length === 6 && !loading) {
      handleSubmit(null, val);
    }
  }

  function handleBackToPassword() {
    setStep('password');
    setTotpCode('');
    setError('');
  }

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
                  autoFocus
                  autoComplete="email"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                  placeholder="請輸入電子郵件"
                />
              </div>
              <div>
                <label htmlFor="f-2" className="block text-sm font-medium text-gray-700 mb-1">密碼</label>
                <div className="relative">
                  <input
                    id="f-2"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                    className="w-full px-4 py-3 pr-11 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                    placeholder="請輸入密碼"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(v => !v)}
                    tabIndex={-1}
                    aria-label={showPassword ? '隱藏密碼' : '顯示密碼'}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showPassword ? (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 4.411m0 0L21 21" />
                      </svg>
                    ) : (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    )}
                  </button>
                </div>
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
                onChange={handleTotpChange}
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
      </div>
    </div>
  );
}
