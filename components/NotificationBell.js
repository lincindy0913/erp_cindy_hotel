'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';

const REFRESH_INTERVAL = 300000; // 5 minutes

// Level config: icon SVG path, colors
const LEVEL_CONFIG = {
  critical: {
    color: 'text-red-600',
    bg: 'bg-red-50',
    border: 'border-red-200',
    badge: 'bg-red-600',
    label: '緊急',
    icon: (
      <svg className="w-4 h-4 text-red-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
      </svg>
    ),
  },
  urgent: {
    color: 'text-orange-600',
    bg: 'bg-orange-50',
    border: 'border-orange-200',
    badge: 'bg-orange-500',
    label: '急迫',
    icon: (
      <svg className="w-4 h-4 text-orange-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  warning: {
    color: 'text-amber-600',
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    badge: 'bg-gray-500',
    label: '警告',
    icon: (
      <svg className="w-4 h-4 text-amber-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
};

export default function NotificationBell() {
  const router = useRouter();
  const [notifications, setNotifications] = useState([]);
  const [summary, setSummary] = useState({ total: 0, critical: 0, urgent: 0, warning: 0 });
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

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
      }
    } catch (err) {
      console.error('Failed to fetch notifications:', err);
    }
  }, []);

  // Fetch on mount and set up interval
  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleNotificationClick = (targetUrl) => {
    setIsOpen(false);
    if (targetUrl) {
      router.push(targetUrl);
    }
  };

  // Sort notifications: critical -> urgent -> warning, take max 10
  const sortedNotifications = [...notifications]
    .sort((a, b) => {
      const order = { critical: 0, urgent: 1, warning: 2 };
      return (order[a.level] ?? 99) - (order[b.level] ?? 99);
    })
    .slice(0, 10);

  // Badge color logic: red for critical > 0, orange for urgent > 0, gray for warning only
  const getBadgeColor = () => {
    if (summary.critical > 0) return 'bg-red-500';
    if (summary.urgent > 0) return 'bg-orange-500';
    return 'bg-gray-500';
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
        title="通知中心"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>

        {/* Badge - hidden when total === 0 */}
        {summary.total > 0 && (
          <span className={`absolute -top-1 -right-1 min-w-[18px] h-[18px] flex items-center justify-center px-1 text-xs font-bold text-white ${getBadgeColor()} rounded-full leading-none`}>
            {summary.total > 99 ? '99+' : summary.total}
          </span>
        )}
      </button>

      {/* Dropdown panel */}
      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-lg shadow-xl border border-gray-200 z-50 max-h-[480px] flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-gray-800">通知中心</h3>
            <button
              onClick={() => {
                setIsOpen(false);
                router.push('/notifications');
              }}
              className="text-xs text-amber-600 hover:text-amber-800 hover:underline"
            >
              查看全部
            </button>
          </div>

          {/* Notification list */}
          <div className="overflow-y-auto flex-1">
            {sortedNotifications.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-gray-400">
                目前沒有通知
              </div>
            ) : (
              sortedNotifications.map((n) => {
                const config = LEVEL_CONFIG[n.level] || LEVEL_CONFIG.warning;
                return (
                  <button
                    key={n.code}
                    onClick={() => handleNotificationClick(n.targetUrl)}
                    className={`w-full text-left px-4 py-3 border-b border-gray-50 hover:bg-gray-50 transition-colors flex items-start gap-3`}
                  >
                    <div className={`mt-0.5 p-1 rounded ${config.bg}`}>
                      {config.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-800 truncate">{n.title}</span>
                        <span className={`text-xs px-1.5 py-0.5 rounded-full text-white ${config.badge}`}>
                          {n.count}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{n.message}</p>
                    </div>
                    <svg className="w-4 h-4 text-gray-400 flex-shrink-0 mt-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                );
              })
            )}
          </div>

          {/* Footer */}
          {sortedNotifications.length > 0 && (
            <div className="px-4 py-2 border-t border-gray-100 bg-gray-50 rounded-b-lg">
              <div className="flex items-center justify-center gap-3 text-xs text-gray-500">
                {summary.critical > 0 && (
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-red-500"></span>
                    緊急 {summary.critical}
                  </span>
                )}
                {summary.urgent > 0 && (
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-orange-500"></span>
                    急迫 {summary.urgent}
                  </span>
                )}
                {summary.warning > 0 && (
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                    警告 {summary.warning}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
