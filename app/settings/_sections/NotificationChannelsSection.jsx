'use client';

import { useState, useEffect } from 'react';

const EVENT_CODES = [
  { code: 'N01', label: 'PMS 報表未匯入警示' },
  { code: 'N02', label: '貸款本月應還款提醒' },
  { code: 'N03', label: '支票 3 日內到期提醒' },
  { code: 'N04', label: '支票已逾期未兌現' },
  { code: 'N05', label: '租金逾期未收' },
  { code: 'N06', label: '合約即將到期' },
  { code: 'N07', label: '貸款 6 個月內到期' },
  { code: 'N08', label: '費用傳票待確認' },
  { code: 'N09', label: '庫存偏低警示' },
  { code: 'N10', label: '對帳差異警示' },
  { code: 'N11', label: '代墊款逾期提醒' },
  { code: 'N12', label: '信用卡繳款到期' },
  { code: 'N13', label: '現金盤點逾期提醒' },
];

export default function NotificationChannelsSection({ showToast }) {
  const [channels, setChannels] = useState([]);
  const [channelConfig, setChannelConfig] = useState(null);
  const [chLoading, setChLoading] = useState(true);
  const [lineBindingUrl, setLineBindingUrl] = useState('');
  const [testingChannel, setTestingChannel] = useState(null);

  useEffect(() => {
    fetchChannels();
    fetchChannelConfig();
  }, []);

  async function fetchChannels() {
    setChLoading(true);
    try {
      const res = await fetch('/api/notification-channels');
      if (res.ok) {
        const data = await res.json();
        setChannels(data.channels || []);
      }
    } catch { /* ignore */ }
    setChLoading(false);
  }

  async function fetchChannelConfig() {
    try {
      const res = await fetch('/api/notification-channels/config');
      if (!res.ok) { return; }
      const data = await res.json();
      setChannelConfig(data);
    } catch { /* ignore */ }
  }

  async function toggleChannel(eventCode, channel, enabled) {
    try {
      const payload = { notificationCode: eventCode };
      if (channel === 'email') payload.enableEmail = enabled;
      if (channel === 'line') payload.enableLine = enabled;

      const res = await fetch('/api/notification-channels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        await fetchChannels();
        showToast('通知渠道已更新');
      }
    } catch {
      showToast('更新失敗', 'error');
    }
  }

  async function generateLineBinding() {
    try {
      const res = await fetch('/api/notification-channels/line-binding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (res.ok) {
        const data = await res.json();
        setLineBindingUrl(data.bindingUrl || '');
        showToast('LINE 綁定連結已產生（15分鐘有效）');
      }
    } catch {
      showToast('產生綁定連結失敗', 'error');
    }
  }

  async function testChannel(channel) {
    setTestingChannel(channel);
    try {
      const res = await fetch('/api/notification-channels/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel }),
      });
      if (res.ok) {
        showToast(`${channel} 測試通知已發送`);
      } else {
        const data = await res.json().catch(() => ({}));
        showToast((typeof data?.error === 'string' ? data.error : data?.error?.message) || '測試失敗', 'error');
      }
    } catch {
      showToast('測試失敗', 'error');
    }
    setTestingChannel(null);
  }

  if (chLoading) return <div className="text-center py-8 text-gray-500">載入通知渠道設定中...</div>;

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-700 mb-4">通知渠道狀態</h3>
        <div className="grid grid-cols-3 gap-4">
          <div className="p-4 bg-gray-50 rounded-lg border">
            <div className="text-sm font-medium text-gray-600">站內通知</div>
            <div className="text-green-600 font-medium mt-1">已啟用</div>
          </div>
          <div className="p-4 bg-gray-50 rounded-lg border">
            <div className="text-sm font-medium text-gray-600">Email</div>
            <div className={`font-medium mt-1 ${channelConfig?.smtpHost ? 'text-green-600' : 'text-gray-400'}`}>
              {channelConfig?.smtpHost ? '已設定' : '未設定'}
            </div>
            <button onClick={() => testChannel('email')} disabled={testingChannel === 'email'} className="mt-2 text-xs text-blue-600 hover:underline">
              {testingChannel === 'email' ? '發送中...' : '發送測試'}
            </button>
          </div>
          <div className="p-4 bg-gray-50 rounded-lg border">
            <div className="text-sm font-medium text-gray-600">LINE</div>
            <div className={`font-medium mt-1 ${channelConfig?.lineBotAccessToken ? 'text-green-600' : 'text-gray-400'}`}>
              {channelConfig?.lineBotAccessToken ? '已設定' : '未設定'}
            </div>
            <button onClick={generateLineBinding} className="mt-2 text-xs text-blue-600 hover:underline">產生綁定連結</button>
            {lineBindingUrl && <div className="mt-2 text-xs text-gray-500 break-all">{lineBindingUrl}</div>}
          </div>
        </div>
      </div>
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-700 mb-4">事件通知偏好</h3>
        <table className="w-full text-sm">
          <thead className="bg-gray-50 sticky top-0 z-10">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-gray-500">事件</th>
              <th className="px-4 py-3 text-center font-medium text-gray-500">站內</th>
              <th className="px-4 py-3 text-center font-medium text-gray-500">Email</th>
              <th className="px-4 py-3 text-center font-medium text-gray-500">LINE</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {EVENT_CODES.map(ev => {
              const ch = channels.find(c => c.notificationCode === ev.code) || {};
              return (
                <tr key={ev.code} className="hover:bg-gray-50">
                  <td className="px-4 py-3">{ev.code} - {ev.label}</td>
                  <td className="px-4 py-3 text-center">
                    <input type="checkbox" checked={true} disabled className="rounded opacity-60 cursor-not-allowed" />
                  </td>
                  <td className="px-4 py-3 text-center">
                    <input type="checkbox" checked={!!ch.enableEmail} onChange={e => toggleChannel(ev.code, 'email', e.target.checked)} className="rounded" />
                  </td>
                  <td className="px-4 py-3 text-center">
                    <input type="checkbox" checked={!!ch.enableLine} onChange={e => toggleChannel(ev.code, 'line', e.target.checked)} className="rounded" />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
