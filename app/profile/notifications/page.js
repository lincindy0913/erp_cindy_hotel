'use client';

import { useState, useEffect } from 'react';
import Navigation from '@/components/Navigation';

const PRIORITY_COLORS = {
  high: 'text-red-600',
  medium: 'text-orange-500',
  low: 'text-gray-400',
};

const PRIORITY_ICONS = {
  high: '🔴',
  medium: '🟠',
  low: '🟡',
};

export default function ProfileNotificationsPage() {
  const [channels, setChannels] = useState([]);
  const [user, setUser] = useState(null);
  const [sysReady, setSysReady] = useState({ email: false, line: false });
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const [editingEmail, setEditingEmail] = useState(false);
  const [emailInput, setEmailInput] = useState('');
  const [savingEmail, setSavingEmail] = useState(false);
  const [showLineBinding, setShowLineBinding] = useState(false);
  const [lineBindingUrl, setLineBindingUrl] = useState(null);
  const [lineBindingExpiry, setLineBindingExpiry] = useState(null);
  const [unbindingLine, setUnbindingLine] = useState(false);
  const [updatingCode, setUpdatingCode] = useState(null);

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setLoading(true);
    try {
      const res = await fetch('/api/notification-channels');
      if (res.ok) {
        const data = await res.json();
        setChannels(data.channels || []);
        setUser(data.user || null);
        setSysReady({
          email: data.systemStatus?.emailEnabled || false,
          line: data.systemStatus?.lineEnabled || false,
        });
        setEmailInput(data.user?.notificationEmail || data.user?.email || '');
      }
    } catch (err) {
      console.error('取得通知設定失敗:', err);
    }
    setLoading(false);
  }

  async function updateChannel(code, field, value) {
    setUpdatingCode(code);
    try {
      const res = await fetch('/api/notification-channels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notificationCode: code, [field]: value }),
      });
      if (res.ok) {
        setChannels(prev => prev.map(ch =>
          ch.notificationCode === code ? { ...ch, [field]: value } : ch
        ));
        // Warn if disabling high-priority external channel
        const ch = channels.find(c => c.notificationCode === code);
        if (ch?.priority === 'high' && !value) {
          showToast('提醒：此為重要財務通知，建議保持至少一種外部渠道開啟', 'warning');
        }
      } else {
        const err = await res.json();
        showToast(err.error?.message || '更新失敗', 'error');
      }
    } catch {
      showToast('系統錯誤', 'error');
    }
    setUpdatingCode(null);
  }

  async function saveEmail() {
    setSavingEmail(true);
    try {
      const res = await fetch('/api/notification-channels', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notificationEmail: emailInput }),
      });
      if (res.ok) {
        setUser(prev => ({ ...prev, notificationEmail: emailInput || null }));
        setEditingEmail(false);
        showToast('通知 Email 已更新');
      } else {
        const err = await res.json();
        showToast(err.error?.message || '更新失敗', 'error');
      }
    } catch {
      showToast('系統錯誤', 'error');
    }
    setSavingEmail(false);
  }

  async function generateLineBinding() {
    try {
      const res = await fetch('/api/notification-channels/line-binding', {
        method: 'POST',
      });
      if (res.ok) {
        const data = await res.json();
        setLineBindingUrl(data.bindingUrl);
        setLineBindingExpiry(data.expiredAt);
        setShowLineBinding(true);
      } else {
        const err = await res.json();
        showToast(err.error?.message || '產生綁定連結失敗', 'error');
      }
    } catch {
      showToast('系統錯誤', 'error');
    }
  }

  async function unlinkLine() {
    if (!confirm('確定要解除 LINE 帳號綁定？')) return;
    setUnbindingLine(true);
    try {
      const res = await fetch('/api/notification-channels/line-binding', {
        method: 'DELETE',
      });
      if (res.ok) {
        setUser(prev => ({ ...prev, lineUserId: null, lineDisplayName: null, lineLinkedAt: null }));
        setChannels(prev => prev.map(ch => ({ ...ch, enableLine: false })));
        showToast('LINE 帳號已解除綁定');
      } else {
        const err = await res.json();
        showToast(err.error?.message || '解除綁定失敗', 'error');
      }
    } catch {
      showToast('系統錯誤', 'error');
    }
    setUnbindingLine(false);
  }

  function showToast(message, type = 'success') {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  }

  const lineLinked = !!user?.lineUserId;
  const notifEmail = user?.notificationEmail || user?.email || '';

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation borderColor="border-gray-500" />

      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg text-sm max-w-sm ${
          toast.type === 'error' ? 'bg-red-600 text-white' :
          toast.type === 'warning' ? 'bg-amber-500 text-white' :
          'bg-green-600 text-white'
        }`}>
          {toast.message}
        </div>
      )}

      <main className="max-w-3xl mx-auto px-4 py-6">
        <h2 className="text-2xl font-bold text-gray-800 mb-6">我的通知設定</h2>

        {loading ? (
          <div className="text-center py-16 text-gray-400">載入中...</div>
        ) : (
          <div className="space-y-6">
            {/* Email Channel */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-lg">📧</span>
                  <h3 className="font-semibold text-gray-700">Email 通知</h3>
                  {!sysReady.email && (
                    <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-xs rounded">系統尚未設定</span>
                  )}
                </div>
                {!editingEmail ? (
                  <button
                    onClick={() => setEditingEmail(true)}
                    className="text-xs text-gray-500 hover:text-gray-700 underline"
                  >
                    ✏️ 修改通知 Email
                  </button>
                ) : (
                  <div className="flex gap-2 items-center">
                    <input
                      type="email"
                      value={emailInput}
                      onChange={e => setEmailInput(e.target.value)}
                      placeholder="通知用 Email"
                      className="border rounded px-2 py-1 text-sm w-48"
                    />
                    <button
                      onClick={saveEmail}
                      disabled={savingEmail}
                      className="px-3 py-1 bg-gray-700 text-white text-xs rounded hover:bg-gray-800 disabled:opacity-50"
                    >
                      {savingEmail ? '儲存中...' : '儲存'}
                    </button>
                    <button
                      onClick={() => { setEditingEmail(false); setEmailInput(notifEmail); }}
                      className="px-3 py-1 bg-gray-100 text-gray-600 text-xs rounded"
                    >
                      取消
                    </button>
                  </div>
                )}
              </div>
              <div className="text-sm text-gray-500">
                通知將發送至：<span className="font-medium text-gray-700">{notifEmail || '（使用登入 Email）'}</span>
              </div>
              {!sysReady.email && (
                <div className="mt-2 text-xs text-amber-600">⚠️ Email 渠道尚未啟用，請聯繫管理員設定 SMTP</div>
              )}
            </div>

            {/* LINE Channel */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-lg">📱</span>
                  <h3 className="font-semibold text-gray-700">LINE 通知</h3>
                  {!sysReady.line && (
                    <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-xs rounded">系統尚未設定</span>
                  )}
                </div>
                {lineLinked ? (
                  <button
                    onClick={unlinkLine}
                    disabled={unbindingLine}
                    className="text-xs text-red-500 hover:text-red-700 underline disabled:opacity-50"
                  >
                    {unbindingLine ? '解除中...' : '解除綁定'}
                  </button>
                ) : (
                  sysReady.line && (
                    <button
                      onClick={generateLineBinding}
                      className="px-3 py-1.5 bg-green-600 text-white text-xs rounded hover:bg-green-700"
                    >
                      🔗 綁定 LINE 帳號
                    </button>
                  )
                )}
              </div>

              {lineLinked ? (
                <div className="text-sm text-green-600 font-medium">
                  ✅ 已綁定：{user.lineDisplayName || 'LINE 用戶'}
                  {user.lineLinkedAt && (
                    <span className="ml-2 text-xs text-gray-400">
                      （{new Date(user.lineLinkedAt).toLocaleDateString('zh-TW')} 綁定）
                    </span>
                  )}
                </div>
              ) : (
                <div className="text-sm text-gray-400">
                  {sysReady.line ? '尚未綁定 LINE 帳號' : '⚠️ LINE Bot 渠道尚未啟用，請聯繫管理員'}
                </div>
              )}

              {/* LINE Binding QR Code */}
              {showLineBinding && lineBindingUrl && (
                <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg">
                  <h4 className="text-sm font-semibold text-green-800 mb-2">📱 LINE 帳號綁定</h4>
                  <p className="text-xs text-green-700 mb-3">
                    請用手機 LINE App 點擊下方連結，或複製連結後在 LINE 開啟，完成綁定。
                  </p>
                  {lineBindingExpiry && (
                    <p className="text-xs text-amber-600 mb-3">
                      ⏱ 連結將於 {new Date(lineBindingExpiry).toLocaleTimeString('zh-TW')} 過期（15 分鐘）
                    </p>
                  )}
                  <div className="flex gap-2">
                    <a
                      href={lineBindingUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-1.5 bg-green-600 text-white text-xs rounded hover:bg-green-700"
                    >
                      開啟 LINE
                    </a>
                    <button
                      onClick={() => { navigator.clipboard.writeText(lineBindingUrl); showToast('連結已複製'); }}
                      className="px-3 py-1.5 bg-gray-100 text-gray-600 text-xs rounded hover:bg-gray-200"
                    >
                      複製連結
                    </button>
                    <button
                      onClick={() => setShowLineBinding(false)}
                      className="px-3 py-1.5 bg-gray-100 text-gray-500 text-xs rounded"
                    >
                      關閉
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Notification Preferences Table */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 bg-gray-50">
                <h3 className="font-semibold text-gray-700">通知渠道設定</h3>
                <p className="text-xs text-gray-400 mt-0.5">站內通知永遠開啟；Email/LINE 為額外推播渠道</p>
              </div>
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 w-1/2">通知事件</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500">站內</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500">Email</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500">LINE</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {channels.map(ch => (
                    <tr key={ch.notificationCode} className="hover:bg-gray-50">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <span className="text-xs">{PRIORITY_ICONS[ch.priority]}</span>
                          <span className="text-gray-700 text-sm">
                            {ch.label}
                            <span className="ml-1 text-xs text-gray-400">（{ch.notificationCode}）</span>
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="text-green-600 text-sm" title="站內通知永遠開啟">●</span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {sysReady.email ? (
                          <input
                            type="checkbox"
                            checked={ch.enableEmail}
                            disabled={updatingCode === ch.notificationCode}
                            onChange={e => updateChannel(ch.notificationCode, 'enableEmail', e.target.checked)}
                            className="w-4 h-4 accent-blue-600 cursor-pointer"
                          />
                        ) : (
                          <span className="text-gray-200 text-sm" title="Email 渠道未設定">○</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {sysReady.line && lineLinked ? (
                          <input
                            type="checkbox"
                            checked={ch.enableLine}
                            disabled={updatingCode === ch.notificationCode}
                            onChange={e => updateChannel(ch.notificationCode, 'enableLine', e.target.checked)}
                            className="w-4 h-4 accent-green-600 cursor-pointer"
                          />
                        ) : (
                          <span
                            className="text-gray-200 text-sm"
                            title={!sysReady.line ? 'LINE Bot 未設定' : '尚未綁定 LINE'}
                          >
                            ○
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 text-xs text-gray-400">
                ● 站內：永遠開啟　✅ 啟用　○ 停用或渠道未就緒
              </div>
            </div>

            {/* Back link */}
            <div className="text-center">
              <a href="/" className="text-sm text-gray-400 hover:text-gray-600 underline">
                ← 返回儀表板
              </a>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
