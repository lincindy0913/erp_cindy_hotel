'use client';

import { NOTIFICATION_FIELDS } from '../_hooks/useSettingsCore';

export default function NotificationsSection({
  notificationSettings,
  setNotificationSettings,
  saving,
  saveNotificationSettings,
  auditInfo,
}) {
  function renderAuditTrail(sectionKey) {
    const info = auditInfo[sectionKey];
    if (!info) return null;
    return (
      <div className="mt-6 pt-4 border-t border-gray-100">
        <p className="text-xs text-gray-400">
          最後修改：{info.email} 於 {new Date(info.updatedAt).toLocaleString('zh-TW')}
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-700 mb-6">通知門檻設定</h3>
        <p className="text-sm text-gray-500 mb-6">設定各項自動通知的提前天數或日期，系統將根據以下參數發送提醒通知。</p>
        <div className="space-y-6">
          {NOTIFICATION_FIELDS.map((field) => (
            <div key={field.key} className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-6 pb-4 border-b border-gray-100 last:border-b-0">
              <div className="sm:w-72">
                <label className="block text-sm font-medium text-gray-700">{field.label}</label>
                <p className="text-xs text-gray-400 mt-0.5">{field.description}</p>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="0"
                  value={notificationSettings[field.key]}
                  onChange={e =>
                    setNotificationSettings(prev => ({ ...prev, [field.key]: e.target.value }))
                  }
                  className="w-24 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-400 focus:border-gray-400 text-sm text-center"
                />
                <span className="text-sm text-gray-500">
                  {field.key.includes('Months') ? '個月' : field.key.includes('DayOfMonth') ? '號' : '天'}
                </span>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-8 pt-4 border-t border-gray-200">
          <button
            onClick={saveNotificationSettings}
            disabled={saving}
            className="px-6 py-2.5 bg-gray-700 text-white rounded-lg hover:bg-gray-800 disabled:opacity-50 text-sm font-medium transition-colors"
          >
            {saving ? '儲存中...' : '儲存通知設定'}
          </button>
        </div>
        {renderAuditTrail('notifications')}
      </div>
    </div>
  );
}
