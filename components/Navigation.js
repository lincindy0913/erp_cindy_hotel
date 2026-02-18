'use client';

import { useSession, signOut } from 'next-auth/react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

// Navigation items - visible to everyone (public can view all pages)
const NAV_ITEMS = [
  { href: '/', label: '儀表板', linkClass: 'link-dashboard' },
  { href: '/products', label: '主資料', linkClass: 'link-products' },
  { href: '/suppliers', label: '廠商', linkClass: 'link-suppliers' },
  { href: '/purchasing', label: '進貨', linkClass: 'link-purchasing' },
  { href: '/sales', label: '發票登錄/核銷', linkClass: 'link-sales' },
  { href: '/finance', label: '付款', linkClass: 'link-finance' },
  { href: '/inventory', label: '庫存', linkClass: 'link-inventory' },
  { href: '/analytics', label: '分析', linkClass: 'link-analytics' },
  { href: '/cashflow', label: '現金流', linkClass: 'link-cashflow' }
];

export default function Navigation({ borderColor = 'border-blue-500' }) {
  const { data: session } = useSession();
  const pathname = usePathname();

  const isAdmin = session?.user?.role === 'admin';

  return (
    <nav className={`bg-white shadow-lg border-b-4 ${borderColor}`}>
      <div className="max-w-7xl mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-800">進銷存系統</h1>
          <div className="flex items-center gap-4">
            {/* Navigation links - visible to everyone */}
            <div className="flex gap-2 text-sm flex-wrap">
              {NAV_ITEMS.map(item => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`${item.linkClass} ${pathname === item.href ? 'active font-medium' : ''}`}
                >
                  {item.label}
                </Link>
              ))}
              {/* Admin-only link */}
              {isAdmin && (
                <Link
                  href="/admin/users"
                  className={`link-dashboard ${pathname === '/admin/users' ? 'active font-medium' : ''}`}
                >
                  使用者管理
                </Link>
              )}
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
