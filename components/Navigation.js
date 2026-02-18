'use client';

import { useState, useRef, useEffect } from 'react';
import { useSession, signOut } from 'next-auth/react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

// Navigation items - visible to everyone (public can view all pages)
const NAV_ITEMS = [
  { href: '/', label: '儀表板', linkClass: 'link-dashboard' },
  { href: '/purchasing', label: '進貨', linkClass: 'link-purchasing' },
  { href: '/sales', label: '發票登錄/核銷', linkClass: 'link-sales' },
  { href: '/finance', label: '付款', linkClass: 'link-finance' },
  { href: '/inventory', label: '庫存', linkClass: 'link-inventory' },
  { href: '/analytics', label: '分析', linkClass: 'link-analytics' },
  { href: '/cashflow', label: '現金流', linkClass: 'link-cashflow' }
];

// 資料設定 dropdown items
const DATA_SETTINGS_ITEMS = [
  { href: '/products', label: '產品資料', linkClass: 'link-products' },
  { href: '/suppliers', label: '廠商', linkClass: 'link-suppliers' },
  { href: '/accounting-subjects', label: '會計科目', linkClass: 'link-products' },
  { href: '/fund-management', label: '資金管理', linkClass: 'link-cashflow' },
  { href: '/admin/users', label: '使用者管理', linkClass: 'link-dashboard', adminOnly: true },
];

export default function Navigation({ borderColor = 'border-blue-500' }) {
  const { data: session } = useSession();
  const pathname = usePathname();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);
  const timeoutRef = useRef(null);

  const isAdmin = session?.user?.role === 'admin';

  // Check if any dropdown item is active
  const isDropdownActive = DATA_SETTINGS_ITEMS.some(item => pathname === item.href);

  const handleMouseEnter = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setDropdownOpen(true);
  };

  const handleMouseLeave = () => {
    timeoutRef.current = setTimeout(() => setDropdownOpen(false), 150);
  };

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); };
  }, []);

  return (
    <nav className={`bg-white shadow-lg border-b-4 ${borderColor}`}>
      <div className="max-w-7xl mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-800">進銷存系統</h1>
          <div className="flex items-center gap-4">
            {/* Navigation links - visible to everyone */}
            <div className="flex gap-2 text-sm flex-wrap items-center">
              {NAV_ITEMS.map(item => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`${item.linkClass} ${pathname === item.href ? 'active font-medium' : ''}`}
                >
                  {item.label}
                </Link>
              ))}

              {/* 資料設定 dropdown */}
              <div
                className="relative"
                ref={dropdownRef}
                onMouseEnter={handleMouseEnter}
                onMouseLeave={handleMouseLeave}
              >
                <button
                  className={`link-products flex items-center gap-1 ${isDropdownActive ? 'active font-medium' : ''}`}
                >
                  資料設定
                  <svg className={`w-3 h-3 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {dropdownOpen && (
                  <div className="absolute top-full left-0 mt-1 bg-white rounded-lg shadow-lg border border-gray-200 py-1 min-w-[140px] z-50">
                    {DATA_SETTINGS_ITEMS.map(item => {
                      if (item.adminOnly && !isAdmin) return null;
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          className={`block px-4 py-2 text-sm hover:bg-gray-100 transition-colors ${
                            pathname === item.href ? 'font-medium bg-gray-50' : 'text-gray-700'
                          }`}
                          onClick={() => setDropdownOpen(false)}
                        >
                          {item.label}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* User info / Login button */}
            <div className="flex items-center gap-3 ml-4 border-l pl-4">
              {session ? (
                <>
                  <span className="text-sm text-gray-600">
                    {session.user?.name}
                    {isAdmin && (
                      <span className="ml-1 text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded">
                        管理員
                      </span>
                    )}
                  </span>
                  <button
                    onClick={() => signOut({ callbackUrl: '/' })}
                    className="text-sm text-red-600 hover:text-red-800 hover:underline"
                  >
                    登出
                  </button>
                </>
              ) : (
                <Link
                  href="/login"
                  className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors"
                >
                  登入管理
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
}
