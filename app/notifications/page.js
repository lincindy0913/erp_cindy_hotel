'use client';

import { useState, useEffect, useCallback } from 'react';
import Navigation from '@/components/Navigation';
import Link from 'next/link';

const REFRESH_INTERVAL = 300000; // 5 minutes

const LEVEL_OPTIONS = [
  { key: 'all', label: '全部' },
  { key: 'critical', label: '緊急' },
  { key: 'urgent', label: '急迫' },
  { key: 'warning', label: '警告' },
];

const LEVEL_CONFIG = {
  critical: {
    label: '緊急',
    textColor: 'text-red-700',
    bgColor: 'bg-red-50',
    borderColor: 'border-red-300',
    badgeBg: 'bg-red-600',
    badgeText: 'text-white',
    cardBg: 'bg-red-50',
    cardBorder: 'border-red-200',
    btnBg: 'bg-red-600 hover:bg-red-700',
    icon: (
      <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
      </svg>
    ),
  },
  urgent: {
    label: '急迫',
    textColor: 'text-orange-700',
    bgColor: 'bg-orange-50',
    borderColor: 'border-orange-300',
    badgeBg: 'bg-orange-500',
    badgeText: 'text-white',
    cardBg: 'bg-orange-50',
    cardBorder: 'border-orange-200',
    btnBg: 'bg-orange-500 hover:bg-orange-600',
    icon: (
      <svg className="w-5 h-5 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  warning: {
    label: '警告',
    textColor: 'text-amber-700',
    bgColor: 'bg-amber-50',
    borderColor: 'border-amber-300',
    badgeBg: 'bg-amber-500',
    badgeText: 'text-white',
    cardBg: 'bg-amber-50',
    cardBorder: 'border-amber-200',
    btnBg: 'bg-amber-500 hover:bg-amber-600',
    icon: (
      <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
};

// Notification type definitions for settings display
const NOTIFICATION_TYPES = [
  { code: 'N01', name: 'PMS 報表未匯入', description: '連續 3 天無 PMS 匯入時提醒' },
  { code: 'N02', name: '貸款還款提醒', description: '還款日前 3 天提醒' },
  { code: 'N03', name: '支票到期提醒', description: '支票到期前 3 天提醒' },
  { code: 'N04', name: '支票逾期警告', description: '支票逾期未兌現警告' },
  { code: 'N05', name: '付款單待出納', description: '有付款單等待出納執行' },
  { code: 'N06', name: '付款單被退回', description: '付款單被出納退回需修改' },
  { code: 'N07', name: '貸款到期預警', description: '貸款 6 個月內到期' },
  { code: 'N08', name: '費用傳票待確認', description: '常用費用傳票待確認' },
  { code: 'N09', name: '庫存偏低', description: '品項庫存低於安全庫存' },
  { code: 'N10', name: '月結未執行', description: '上月月結尚未執行' },
  { code: 'N11', name: 'PMS 貸借差異', description: 'PMS 匯入貸借不平衡' },
  { code: 'N12', name: '信用卡繳款到期', description: '信用卡帳單繳款日即將到期' },
  { code: 'N13', name: '現金盤點逾期', description: '現金帳戶逾期未盤點' },
  { code: 'N14', name: '備份異常', description: '備份失敗或驗證失敗' },
];

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState([]);
  const [summary, setSummary] = useState({ total: 0, critical: 0, urgent: 0, warning: 0 });
  const [calculatedAt, setCalculatedAt] = useState('');
  const [loading, setLoading] = useState(true);

  // Tab state
  const [activeMainTab, setActiveMainTab] = useState('notifications'); // 'notifications' | 'settings'

  // Filters
  const [levelFilter, setLevelFilter] = useState('all');

  // Settings state
  const [settings, setSettings] = useState({});
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsMessage, setSettingsMessage] = useState('');

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications/calculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications || []);
        setSummary(data.summary || { total: 0, critical: 0, urgent: 0, warning: 0 });
        setCalculatedAt(data.calculatedAt || '');
      }
    } catch (err) {
      console.error('Failed to fetch notifications:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchSettings = useCallback(async () => {
    setSettingsLoading(true);
    try {
      const res = await fetch('/api/notifications/settings');
      if (res.ok) {
        const data = await res.json();
        setSettings(data.settings || {});
      } else {
        // Default all enabled
        const defaults = {};
        NOTIFICATION_TYPES.forEach(t => { defaults[t.code] = true; });
        setSettings(defaults);
      }
    } catch (err) {
      console.error('Failed to fetch settings:', err);
      const defaults = {};
      NOTIFICATION_TYPES.forEach(t => { defaults[t.code] = true; });
      setSettings(defaults);
    } finally {
      setSettingsLoading(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    fetchNotifications();
    const interval = setInterval(fetchNotifications, REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  useEffect(() => {
    if (activeMainTab === 'settings') {
      fetchSettings();
    }
  }, [activeMainTab, fetchSettings]);

  const handleToggleSetting = (code) => {
    setSettings(prev => ({ ...prev, [code]: !prev[code] }));
  };

  const handleSaveSettings = async () => {
    setSettingsSaving(true);
    setSettingsMessage('');
    try {
      const res = await fetch('/api/notifications/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings }),
      });
      if (res.ok) {
        setSettingsMessage('設定已儲存');
        setTimeout(() => setSettingsMessage(''), 3000);
      } else {
        const data = await res.json();
        setSettingsMessage(data.error?.message || '儲存失敗');
      }
    } catch (err) {
      setSettingsMessage('儲存失敗，請稍後再試');
    } finally {
      setSettingsSaving(false);
    }
  };

  // Apply level filter on client side
  const filteredNotifications = notifications.filter((n) => {
    if (levelFilter !== 'all' && n.level !== levelFilter) return false;
    return true;
  });

  // Group by level
  const grouped = {
    critical: filteredNotifications.filter((n) => n.level === 'critical'),
    urgent: filteredNotifications.filter((n) => n.level === 'urgent'),
    warning: filteredNotifications.filter((n) => n.level === 'warning'),
  };

  return (
    <div className="min-h-screen page-bg-notifications">
      <Navigation borderColor="border-amber-500" />

      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Page header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-800">通知中心</h2>
            <p className="text-sm text-gray-500 mt-1">
              系統自動偵測需要關注的事項
              {calculatedAt && (
                <span className="ml-2">
                  (更新時間: {new Date(calculatedAt).toLocaleString('zh-TW')})
                </span>
              )}
            </p>
          </div>
          {activeMainTab === 'notifications' && (
            <button
              onClick={() => { setLoading(true); fetchNotifications(); }}
              className="px-4 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition-colors text-sm flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              重新整理
            </button>
          )}
        </div>

        {/* Main tabs: 待處理通知 / 通知設定 */}
        <div className="flex gap-1 mb-6 bg-gray-100 rounded-xl p-1 w-fit">
          <button
            onClick={() => setActiveMainTab('notifications')}
            className={`px-5 py-2 text-sm rounded-lg transition-colors font-medium ${
              activeMainTab === 'notifications'
                ? 'bg-white text-amber-700 shadow-sm'
                : 'text-gray-600 hover:text-gray-800'
            }`}
          >
            待處理通知
          </button>
          <button
            onClick={() => setActiveMainTab('settings')}
            className={`px-5 py-2 text-sm rounded-lg transition-colors font-medium ${
              activeMainTab === 'settings'
                ? 'bg-white text-amber-700 shadow-sm'
                : 'text-gray-600 hover:text-gray-800'
            }`}
          >
            通知設定
          </button>
        </div>

        {/* ============= TAB 1: 待處理通知 ============= */}
        {activeMainTab === 'notifications' && (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                <div className="text-sm text-gray-500">通知總數</div>
                <div className="text-3xl font-bold text-gray-800 mt-1">{summary.total}</div>
              </div>
              <div className="bg-white rounded-xl shadow-sm border border-red-200 p-4">
                <div className="text-sm text-red-600 flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-red-500"></span>
                  緊急
                </div>
                <div className="text-3xl font-bold text-red-700 mt-1">{summary.critical}</div>
              </div>
              <div className="bg-white rounded-xl shadow-sm border border-orange-200 p-4">
                <div className="text-sm text-orange-600 flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-orange-500"></span>
                  急迫
                </div>
                <div className="text-3xl font-bold text-orange-700 mt-1">{summary.urgent}</div>
              </div>
              <div className="bg-white rounded-xl shadow-sm border border-amber-200 p-4">
                <div className="text-sm text-amber-600 flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                  警告
                </div>
                <div className="text-3xl font-bold text-amber-700 mt-1">{summary.warning}</div>
              </div>
            </div>

            {/* Filter bar */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-6">
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-600 font-medium">等級:</span>
                  <div className="flex gap-1">
                    {LEVEL_OPTIONS.map((opt) => (
                      <button
                        key={opt.key}
                        onClick={() => setLevelFilter(opt.key)}
                        className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                          levelFilter === opt.key
                            ? 'bg-amber-500 text-white'
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Loading state */}
            {loading && (
              <div className="text-center py-12 text-gray-400">
                <svg className="animate-spin h-8 w-8 mx-auto mb-3 text-amber-500" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                載入通知中...
              </div>
            )}

            {/* No notifications */}
            {!loading && filteredNotifications.length === 0 && (
              <div className="text-center py-16 bg-white rounded-xl shadow-sm border border-gray-200">
                <svg className="w-16 h-16 mx-auto text-green-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-gray-600 text-lg font-medium">目前沒有需要關注的通知</p>
                <p className="text-gray-400 text-sm mt-1">系統運作正常</p>
              </div>
            )}

            {/* Notification groups */}
            {!loading && filteredNotifications.length > 0 && (
              <div className="space-y-6">
                {['critical', 'urgent', 'warning'].map((level) => {
                  const items = grouped[level];
                  if (!items || items.length === 0) return null;
                  const config = LEVEL_CONFIG[level];

                  return (
                    <div key={level}>
                      {/* Group header */}
                      <div className="flex items-center gap-2 mb-3">
                        <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium ${config.badgeBg} ${config.badgeText}`}>
                          {config.icon}
                          {config.label}
                          <span className="ml-1">({items.reduce((s, n) => s + n.count, 0)})</span>
                        </span>
                      </div>

                      {/* Notification cards */}
                      <div className="grid gap-3">
                        {items.map((n) => (
                          <div
                            key={n.code}
                            className={`bg-white rounded-xl shadow-sm border ${config.cardBorder} overflow-hidden`}
                          >
                            <div className={`flex items-center gap-4 p-4 ${config.cardBg} border-l-4 ${config.borderColor}`}>
                              {/* Icon */}
                              <div className="flex-shrink-0">
                                {config.icon}
                              </div>

                              {/* Content */}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className={`text-sm font-semibold ${config.textColor}`}>
                                    {n.title}
                                  </span>
                                  <span className={`text-xs px-2 py-0.5 rounded-full ${config.badgeBg} ${config.badgeText}`}>
                                    {n.count}
                                  </span>
                                  <span className="text-xs text-gray-400 uppercase">{n.code}</span>
                                </div>
                                <p className="text-sm text-gray-600">{n.message}</p>
                              </div>

                              {/* Action button */}
                              {n.targetUrl && (
                                <Link
                                  href={n.targetUrl}
                                  className={`flex-shrink-0 px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors ${config.btnBg}`}
                                >
                                  前往處理
                                </Link>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* ============= TAB 2: 通知設定 ============= */}
        {activeMainTab === 'settings' && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200">
            <div className="p-6 border-b border-gray-100">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-gray-800">通知類型設定</h3>
                  <p className="text-sm text-gray-500 mt-1">選擇您要接收的通知類型，關閉後將不會在通知中心顯示該類別</p>
                </div>
                <div className="flex items-center gap-3">
                  {settingsMessage && (
                    <span className={`text-sm ${settingsMessage.includes('失敗') ? 'text-red-600' : 'text-green-600'}`}>
                      {settingsMessage}
                    </span>
                  )}
                  <button
                    onClick={handleSaveSettings}
                    disabled={settingsSaving}
                    className="px-4 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition-colors text-sm disabled:opacity-50 flex items-center gap-2"
                  >
                    {settingsSaving ? (
                      <>
                        <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        儲存中...
                      </>
                    ) : '儲存設定'}
                  </button>
                </div>
              </div>
            </div>

            {settingsLoading ? (
              <div className="p-8 text-center text-gray-400">
                <svg className="animate-spin h-8 w-8 mx-auto mb-3 text-amber-500" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                載入設定中...
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {NOTIFICATION_TYPES.map((type) => {
                  const isEnabled = settings[type.code] !== false;
                  return (
                    <div key={type.code} className="flex items-center justify-between px-6 py-4 hover:bg-gray-50 transition-colors">
                      <div className="flex items-center gap-4">
                        <span className="text-xs font-mono text-gray-400 bg-gray-100 px-2 py-1 rounded w-10 text-center">
                          {type.code}
                        </span>
                        <div>
                          <div className="text-sm font-medium text-gray-800">{type.name}</div>
                          <div className="text-xs text-gray-500 mt-0.5">{type.description}</div>
                        </div>
                      </div>
                      <button
                        onClick={() => handleToggleSetting(type.code)}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 ${
                          isEnabled ? 'bg-amber-500' : 'bg-gray-300'
                        }`}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow ${
                            isEnabled ? 'translate-x-6' : 'translate-x-1'
                          }`}
                        />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
