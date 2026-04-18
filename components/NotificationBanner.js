'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';

// Module filter to notification code mapping
const MODULE_CODE_MAP = {
  'checks': ['N03', 'N04'],
  'cashflow': ['N04'],
  'loans': ['N02', 'N07'],
  'finance': ['N05', 'N06'],
  'cashier': ['N05'],
  'engineering': ['N05'],
  'pms-income': ['N01', 'N11'],
};

const LEVEL_STYLES = {
  critical: {
    bg: 'bg-red-50',
    border: 'border-red-200',
    text: 'text-red-800',
    subtext: 'text-red-600',
    icon: (
      <svg className="w-4 h-4 text-red-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
      </svg>
    ),
    closeBtn: 'text-red-500 hover:text-red-700',
    linkColor: 'text-red-700 hover:text-red-900',
  },
  urgent: {
    bg: 'bg-orange-50',
    border: 'border-orange-200',
    text: 'text-orange-800',
    subtext: 'text-orange-600',
    icon: (
      <svg className="w-4 h-4 text-orange-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    closeBtn: 'text-orange-500 hover:text-orange-700',
    linkColor: 'text-orange-700 hover:text-orange-900',
  },
  warning: {
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    text: 'text-amber-800',
    subtext: 'text-amber-600',
    icon: (
      <svg className="w-4 h-4 text-amber-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    closeBtn: 'text-amber-500 hover:text-amber-700',
    linkColor: 'text-amber-700 hover:text-amber-900',
  },
};

// Get today's date string for localStorage key (dismiss resets daily)
function getTodayKey() {
  return new Date().toISOString().split('T')[0];
}

export default function NotificationBanner({ moduleFilter }) {
  const [notifications, setNotifications] = useState([]);
  const [dismissed, setDismissed] = useState({});
  const [loaded, setLoaded] = useState(false);

  const relevantCodes = MODULE_CODE_MAP[moduleFilter] || [];

  // Load dismissed state from localStorage
  useEffect(() => {
    try {
      const key = `ntf-banner-dismissed-${getTodayKey()}`;
      const stored = localStorage.getItem(key);
      if (stored) {
        setDismissed(JSON.parse(stored));
      }
    } catch {
      // Ignore localStorage errors
    }
  }, []);

  const fetchNotifications = useCallback(async () => {
    if (relevantCodes.length === 0) {
      setLoaded(true);
      return;
    }
    try {
      const res = await fetch('/api/notifications/calculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (res.ok) {
        const data = await res.json();
        const allNotifications = data.notifications || [];
        // Filter to only relevant codes for this module
        const filtered = allNotifications.filter(n => relevantCodes.includes(n.code));
        setNotifications(filtered);
      }
    } catch (err) {
      console.error('NotificationBanner fetch error:', err);
    } finally {
      setLoaded(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [relevantCodes.join(',')]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  const handleDismiss = (code) => {
    const newDismissed = { ...dismissed, [code]: true };
    setDismissed(newDismissed);
    try {
      const key = `ntf-banner-dismissed-${getTodayKey()}`;
      localStorage.setItem(key, JSON.stringify(newDismissed));
    } catch {
      // Ignore localStorage errors
    }
  };

  // Filter out dismissed notifications
  const visibleNotifications = notifications.filter(n => !dismissed[n.code]);

  // Don't render anything if no relevant notifications or still loading
  if (!loaded || visibleNotifications.length === 0) {
    return null;
  }

  return (
    <div className="max-w-7xl mx-auto px-4 pt-2">
      <div className="space-y-2">
        {visibleNotifications.map((n) => {
          const style = LEVEL_STYLES[n.level] || LEVEL_STYLES.warning;
          return (
            <div
              key={n.code}
              className={`flex items-center gap-3 px-4 py-2.5 rounded-lg border ${style.bg} ${style.border}`}
            >
              {style.icon}
              <span className={`text-sm font-medium ${style.text} flex-1`}>
                {n.title}
                <span className={`ml-1 text-xs ${style.subtext}`}>({n.count})</span>
                <span className={`ml-2 text-xs font-normal ${style.subtext}`}>{n.message}</span>
              </span>
              <Link
                href={n.targetUrl}
                className={`text-xs font-medium whitespace-nowrap ${style.linkColor}`}
              >
                前往處理 →
              </Link>
              <button
                onClick={() => handleDismiss(n.code)}
                className={`p-1 rounded ${style.closeBtn} transition-colors`}
                title="關閉此通知（今日內不再顯示）"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
