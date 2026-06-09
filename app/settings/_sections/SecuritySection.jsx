'use client';

import { useState, useEffect } from 'react';
import TotpSetupCard from '@/components/security/TotpSetupCard';

export default function SecuritySection() {
  const [totpEnabled, setTotpEnabled] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch('/api/auth/totp/status')
      .then(r => r.ok ? r.json() : { totpEnabled: false })
      .then(d => { setTotpEnabled(d.totpEnabled); setLoaded(true); })
      .catch(() => setLoaded(true));
  }, []);

  if (!loaded) return <div className="text-gray-400 text-sm py-8 text-center">載入中...</div>;

  return (
    <div className="space-y-4 max-w-lg">
      <h3 className="text-base font-semibold text-gray-800">帳號安全設定</h3>
      <TotpSetupCard initialEnabled={totpEnabled} />
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-700 space-y-1">
        <p className="font-semibold">建議做法</p>
        <p>• 啟用雙因素驗證後，每次登入需額外輸入 App 上的驗證碼</p>
        <p>• 備用碼請列印或抄寫保存，遺失後必須聯絡管理員重置</p>
        <p>• 支援 Google Authenticator、Microsoft Authenticator、Authy 等 TOTP App</p>
      </div>
    </div>
  );
}
