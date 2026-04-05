'use client';

import { useState, useRef, useEffect } from 'react';
import { useSession, signOut } from 'next-auth/react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ROLE_LABELS, ROLE_COLORS, hasPermission } from '@/lib/permissions';
import NotificationBell from '@/components/NotificationBell';

// 主選單順序：儀錶板 → 庫存 → 進貨 → 發票登錄 → 付款 → 支票 → 費用 → 貸款 → 出納 → 代墊款 → 現金流 → 存簿對帳 → PMS收入 → 租屋管理 → 工程 → 分析 → 結帳(下拉)
const NAV_ITEMS = [
  { href: '/', label: '儀錶板', linkClass: 'link-dashboard', requiredPermission: null },
  { href: '/inventory', label: '庫存', linkClass: 'link-inventory', requiredPermission: 'inventory.view' },
  { href: '/purchasing', label: '進貨', linkClass: 'link-purchasing', requiredPermission: 'purchasing.view' },
  { href: '/sales', label: '發票登錄', linkClass: 'link-sales', requiredPermission: 'sales.view' },
  { href: '/finance', label: '付款', linkClass: 'link-finance', requiredPermission: 'finance.view' },
  { href: '/purchase-allowances', label: '退貨', linkClass: 'link-finance', requiredPermission: 'finance.view' },
  { href: '/checks', label: '支票', linkClass: 'link-checks', requiredPermission: 'check.view' },
  { href: '/expenses', label: '費用', linkClass: 'link-finance', requiredPermission: 'expense.view' },
  { href: '/loans', label: '貸款', linkClass: 'link-loans', requiredPermission: 'loan.view' },
  { href: '/cashier', label: '出納', linkClass: 'link-cashier', requiredPermission: 'cashier.view' },
  { href: '/employee-advances', label: '代墊款', linkClass: 'link-cashflow', requiredPermission: 'cashier.view' },
  { href: '/cashflow', label: '現金流', linkClass: 'link-cashflow', requiredPermission: 'cashflow.view' },
  { href: '/reconciliation', label: '存簿對帳', linkClass: 'link-reconciliation', requiredPermission: 'reconciliation.view' },
  { href: '/pms-income', label: 'PMS收入', linkClass: 'link-pms-income', requiredPermission: 'pms.view' },
  { href: '/rentals', label: '租屋管理', linkClass: 'link-rentals', requiredPermission: 'rental.view' },
  { href: '/engineering', label: '工程',      linkClass: 'link-engineering', requiredPermission: 'engineering.view' },
  { href: '/utility-bills', label: '水電費', linkClass: 'link-utility', requiredPermission: null },
  { href: '/analytics', label: '分析', linkClass: 'link-analytics', requiredPermission: 'analytics.view' },
];

// 結帳下拉：月結、年結
const CLOSE_BOOK_ITEMS = [
  { href: '/month-end', label: '月結', linkClass: 'link-monthend', requiredPermission: 'monthend.view' },
  { href: '/year-end', label: '年結', linkClass: 'link-year-end', requiredPermission: 'yearend.view' },
];

// 資料設定 dropdown items
const DATA_SETTINGS_ITEMS = [
  { href: '/products', label: '產品資料', linkClass: 'link-products', requiredPermission: null },
  { href: '/suppliers', label: '廠商', linkClass: 'link-suppliers', requiredPermission: null },
  { href: '/accounting-subjects', label: '會計科目', linkClass: 'link-products', requiredPermission: 'settings.view' },
  { href: '/fund-management', label: '資金管理', linkClass: 'link-cashflow', requiredPermission: 'cashflow.view' },
  { href: '/payment-voucher', label: '付款傳票', linkClass: 'link-finance', requiredPermission: 'finance.view' },
  { href: '/settings', label: '系統設定', linkClass: 'link-settings', requiredPermission: 'settings.view' },
  { href: '/admin/users', label: '使用者管理', linkClass: 'link-dashboard', adminOnly: true },
  { href: '/admin/audit-log', label: '稽核日誌', linkClass: 'link-audit', adminOnly: true },
  { href: '/admin/backup', label: '資料備份', linkClass: 'link-settings', adminOnly: true },
];

export default function Navigation({ borderColor = 'border-blue-500' }) {
  const { data: session } = useSession();
  const pathname = usePathname();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);
  const timeoutRef = useRef(null);

  const isAdmin = session?.user?.role === 'admin';
  const userPermissions = session?.user?.permissions || [];

  // 檢查使用者是否有指定權限
  function canAccess(requiredPermission) {
    // 未登入使用者看不到需要權限的項目
    if (!session) return requiredPermission === null;
    // admin 有所有權限
    if (isAdmin || userPermissions.includes('*')) return true;
    // 不需權限的項目
    if (!requiredPermission) return true;
    return hasPermission(userPermissions, requiredPermission);
  }

  // 過濾導覽項目
  const visibleNavItems = NAV_ITEMS.filter(item => canAccess(item.requiredPermission));

  // 過濾結帳下拉項目（月結、年結）
  const visibleCloseBookItems = CLOSE_BOOK_ITEMS.filter(item => canAccess(item.requiredPermission));
  const isCloseBookActive = CLOSE_BOOK_ITEMS.some(item => pathname === item.href);

  // 過濾資料設定 dropdown 項目
  const visibleSettingsItems = DATA_SETTINGS_ITEMS.filter(item => {
    if (item.adminOnly) return isAdmin;
    return canAccess(item.requiredPermission);
  });

  // Check if any dropdown item is active
  const isDropdownActive = DATA_SETTINGS_ITEMS.some(item => pathname === item.href);

  const [closeBookOpen, setCloseBookOpen] = useState(false);
  const closeBookRef = useRef(null);
  const closeBookTimeoutRef = useRef(null);
  const handleCloseBookEnter = () => {
    if (closeBookTimeoutRef.current) clearTimeout(closeBookTimeoutRef.current);
    setCloseBookOpen(true);
  };
  const handleCloseBookLeave = () => {
    closeBookTimeoutRef.current = setTimeout(() => setCloseBookOpen(false), 150);
  };

  const handleMouseEnter = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setDropdownOpen(true);
  };

  const handleMouseLeave = () => {
    timeoutRef.current = setTimeout(() => setDropdownOpen(false), 150);
  };

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (closeBookTimeoutRef.current) clearTimeout(closeBookTimeoutRef.current);
    };
  }, []);

  // 取得使用者角色徽章
  function renderRoleBadges() {
    const roles = session?.user?.roles || [];
    if (roles.length === 0) {
      // 向下相容：舊系統只有 admin/user
      if (isAdmin) {
        return (
          <span className="ml-1 text-xs bg-red-100 text-red-800 px-2 py-0.5 rounded">
            管理員
          </span>
        );
      }
      return null;
    }
    return roles.map(code => {
      const colorClass = ROLE_COLORS[code] || 'bg-gray-100 text-gray-800';
      return (
        <span key={code} className={`ml-1 text-xs px-2 py-0.5 rounded ${colorClass}`}>
          {ROLE_LABELS[code] || code}
        </span>
      );
    });
  }

  return (
    <nav className={`bg-white shadow-lg border-b-4 ${borderColor}`}>
      <div className="max-w-[100rem] mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-800">進銷存系統</h1>
          <div className="flex items-center gap-4">
            {/* Navigation links - filtered by permission */}
            <div className="flex gap-2 text-sm flex-wrap items-center">
              {visibleNavItems.map(item => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`${item.linkClass} ${pathname === item.href ? 'active font-medium' : ''}`}
                >
                  {item.label}
                </Link>
              ))}

              {/* 結帳 dropdown（月結、年結） */}
              {visibleCloseBookItems.length > 0 && (
                <div
                  className="relative"
                  ref={closeBookRef}
                  onMouseEnter={handleCloseBookEnter}
                  onMouseLeave={handleCloseBookLeave}
                >
                  <button
                    className={`link-monthend flex items-center gap-1 ${isCloseBookActive ? 'active font-medium' : ''}`}
                  >
                    結帳
                    <svg className={`w-3 h-3 transition-transform ${closeBookOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {closeBookOpen && (
                    <div className="absolute top-full left-0 mt-1 bg-white rounded-lg shadow-lg border border-gray-200 py-1 min-w-[100px] z-50">
                      {visibleCloseBookItems.map(item => (
                        <Link
                          key={item.href}
                          href={item.href}
                          className={`block px-4 py-2 text-sm hover:bg-gray-100 transition-colors ${
                            pathname === item.href ? 'font-medium bg-gray-50' : 'text-gray-700'
                          }`}
                          onClick={() => setCloseBookOpen(false)}
                        >
                          {item.label}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* 資料設定 dropdown - only show if there are visible items */}
              {visibleSettingsItems.length > 0 && (
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
                      {visibleSettingsItems.map(item => (
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
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Notification Bell */}
            {session && <NotificationBell />}

            {/* User info / Login button */}
            <div className="flex items-center gap-3 ml-4 border-l pl-4">
              {session ? (
                <>
                  <span className="text-sm text-gray-600 flex items-center flex-wrap">
                    <Link href="/profile/notifications" className="hover:text-gray-900 hover:underline" title="通知設定">
                      {session.user?.name}
                    </Link>
                    {renderRoleBadges()}
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
