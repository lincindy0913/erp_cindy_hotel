import { withAuth } from 'next-auth/middleware';
import { NextResponse } from 'next/server';

// 模組路由 → 所需權限對應表
const ROUTE_PERMISSIONS = {
  '/purchasing': 'purchasing.view',
  '/sales': 'sales.view',
  '/finance': 'finance.view',
  '/cashier': 'cashier.view',
  '/inventory': 'inventory.view',
  '/analytics': 'analytics.view',
  '/cashflow': 'cashflow.view',
  '/pms-income': 'pms.view',
  '/loans': 'loan.view',
  '/checks': 'check.view',
  '/reconciliation': 'reconciliation.view',
  '/rentals': 'rental.view',
  '/month-end': 'monthend.view',
  '/expenses': 'expense.view',
  '/settings': 'settings.view',
};

// 公開路由 - 不需登入
const PUBLIC_ROUTES = ['/', '/login', '/unauthorized'];

function isPublicRoute(pathname) {
  if (PUBLIC_ROUTES.includes(pathname)) return true;
  if (pathname.startsWith('/api/')) return true;
  return false;
}

function getRequiredPermission(pathname) {
  // 精確比對或前綴比對 (e.g. /purchasing/xxx)
  for (const [route, permission] of Object.entries(ROUTE_PERMISSIONS)) {
    if (pathname === route || pathname.startsWith(route + '/')) {
      return permission;
    }
  }
  return null;
}

export default withAuth(
  function middleware(req) {
    const { pathname } = req.nextUrl;
    const token = req.nextauth.token;

    // 公開路由直接放行
    if (isPublicRoute(pathname)) {
      return NextResponse.next();
    }

    // /admin 路由 - 僅 admin 角色可存取
    if (pathname.startsWith('/admin')) {
      if (token?.role !== 'admin') {
        return NextResponse.redirect(new URL('/unauthorized', req.url));
      }
      return NextResponse.next();
    }

    // 模組路由 - 檢查權限
    const requiredPermission = getRequiredPermission(pathname);
    if (requiredPermission) {
      const permissions = token?.permissions || [];
      // admin 有萬用權限 '*'
      if (permissions.includes('*')) {
        return NextResponse.next();
      }
      if (!permissions.includes(requiredPermission)) {
        return NextResponse.redirect(new URL('/unauthorized', req.url));
      }
    }

    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ token, req }) => {
        const { pathname } = req.nextUrl;
        // 公開路由不需要登入
        if (isPublicRoute(pathname)) {
          return true;
        }
        // 所有受保護路由必須登入
        return !!token;
      }
    }
  }
);

export const config = {
  matcher: [
    '/admin/:path*',
    '/purchasing/:path*',
    '/sales/:path*',
    '/finance/:path*',
    '/cashier/:path*',
    '/inventory/:path*',
    '/analytics/:path*',
    '/cashflow/:path*',
    '/pms-income/:path*',
    '/loans/:path*',
    '/checks/:path*',
    '/reconciliation/:path*',
    '/rentals/:path*',
    '/month-end/:path*',
    '/expenses/:path*',
    '/settings/:path*',
  ]
};
