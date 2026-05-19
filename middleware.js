import { withAuth } from 'next-auth/middleware';
import { NextResponse } from 'next/server';

// ── API Versioning ──
// Current API version. Bump when making breaking changes.
const API_VERSION = '1.0';
// Clients can send Api-Version header; for now we accept all and return current version.

// ── CSRF protection ──
// State-changing requests (POST/PUT/PATCH/DELETE) to /api/ routes validate Origin/Referer.
// JSON-only requests without Origin are allowed (browsers cannot forge JSON cross-origin).
// JWT + SameSite=strict cookies + Origin check = layered CSRF defence.
const CSRF_STATE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function validateCsrf(req) {
  const method = req.method?.toUpperCase();
  if (!CSRF_STATE_METHODS.has(method)) return { ok: true };

  const origin  = req.headers.get('origin');
  const referer = req.headers.get('referer');

  // No Origin/Referer → only safe if content-type is JSON (cannot be forged cross-origin)
  if (!origin && !referer) {
    const ct = req.headers.get('content-type') || '';
    return ct.includes('application/json') || ct === ''
      ? { ok: true }
      : { ok: false, reason: 'Missing Origin on state-changing request' };
  }

  // Use Host header directly — req.url may resolve to an internal address (e.g. 0.0.0.0:3000)
  // in Docker, which would mismatch against the browser's Referer/Origin (localhost:3000).
  const expectedHost = req.headers.get('host') || req.nextUrl.host;
  const checkHost = origin || referer;

  // Reject literal "null" origin (sandboxed iframes / opaque origins)
  if (checkHost === 'null') return { ok: false, reason: 'Null origin rejected' };

  try {
    if (new URL(checkHost).host === expectedHost) return { ok: true };
    return { ok: false, reason: `Origin/Referer host mismatch: got ${new URL(checkHost).host}, expected ${expectedHost}` };
  } catch {
    return { ok: false, reason: 'Invalid Origin/Referer header' };
  }
}

// ── Rate limiting (in-memory sliding window) ──
const rateLimitStore = new Map();
const RATE_LIMITS = {
  '/api/auth':           { windowMs: 15 * 60_000, max: 10 },   // login: 10 per 15 min
  '/api/backup':         { windowMs: 60_000, max: 10 },         // backup ops: 10 per min
  '/api/users':          { windowMs: 60_000, max: 20 },         // user management: 20 per min
  '/api/roles':          { windowMs: 60_000, max: 20 },         // role management: 20 per min
  '/api/payment-orders': { windowMs: 60_000, max: 30 },         // payment orders: 30 per min
  '/api/cashier':        { windowMs: 60_000, max: 30 },         // cashier execute: 30 per min
  '/api/year-end':       { windowMs: 60_000, max: 10 },         // year-end: 10 per min
  '/api/month-end':      { windowMs: 60_000, max: 10 },         // month-end: 10 per min
  '/api/export':         { windowMs: 60_000, max: 15 },         // data export: 15 per min
  '/api/import':         { windowMs: 60_000, max: 10 },         // data import: 10 per min
  '/api/setup-import':   { windowMs: 60_000, max: 10 },         // setup import: 10 per min
  '/api/settings':       { windowMs: 60_000, max: 20 },         // system settings: 20 per min
  '/api/notification-channels': { windowMs: 60_000, max: 15 },  // notification config: 15 per min
};

function checkRateLimit(pathname, ip) {
  let config = null;
  let matchedPrefix = null;
  for (const [prefix, cfg] of Object.entries(RATE_LIMITS)) {
    if (pathname.startsWith(prefix)) { config = cfg; matchedPrefix = prefix; break; }
  }
  if (!config) return { allowed: true };

  // Group by matched prefix (e.g. /api/users, /api/auth) so sub-paths share the limit
  const key = `${matchedPrefix}:${ip}`;
  const now = Date.now();
  const windowStart = now - config.windowMs;

  let timestamps = rateLimitStore.get(key);
  if (!timestamps) { timestamps = []; rateLimitStore.set(key, timestamps); }

  while (timestamps.length > 0 && timestamps[0] <= windowStart) timestamps.shift();

  if (timestamps.length >= config.max) {
    return { allowed: false, retryAfterMs: timestamps[0] + config.windowMs - now };
  }
  timestamps.push(now);
  return { allowed: true };
}

// Periodic cleanup (runs on cold start, non-blocking)
if (typeof globalThis.__rlCleanup === 'undefined') {
  globalThis.__rlCleanup = setInterval(() => {
    const now = Date.now();
    for (const [key, ts] of rateLimitStore) {
      while (ts.length > 0 && ts[0] <= now - 15 * 60_000) ts.shift();
      if (ts.length === 0) rateLimitStore.delete(key);
    }
  }, 5 * 60_000);
}

// 模組路由 → 所需權限對應表
const ROUTE_PERMISSIONS = {
  '/purchasing': 'purchasing.view',
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
  '/assets': 'rental.view',
  '/bnb': 'bnb.view',
  '/month-end': 'monthend.view',
  '/expenses': 'expense.view',
  '/engineering': 'engineering.view',
  '/settings': 'settings.view',
};

// 公開路由 - 不需登入
const PUBLIC_ROUTES = ['/', '/login', '/unauthorized'];
const PUBLIC_API_PREFIXES = ['/api/auth'];
const PUBLIC_API_ROUTES = ['/api/health', '/api/dashboard/summary'];

function isPublicRoute(pathname) {
  if (PUBLIC_ROUTES.includes(pathname)) return true;
  if (PUBLIC_API_ROUTES.includes(pathname)) return true;
  if (PUBLIC_API_PREFIXES.some(prefix => pathname.startsWith(prefix))) return true;
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
    const isApiRoute = pathname.startsWith('/api/');

    // 公開路由直接放行
    if (isPublicRoute(pathname)) {
      return NextResponse.next();
    }

    // ── Rate limiting (before auth check) ──
    if (isApiRoute) {
      const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
        || req.headers.get('x-real-ip') || 'unknown';
      const rl = checkRateLimit(pathname, ip);
      if (!rl.allowed) {
        return NextResponse.json(
          { error: { code: 'RATE_LIMITED', message: '請求過於頻繁，請稍後再試' } },
          { status: 429, headers: { 'Retry-After': String(Math.ceil((rl.retryAfterMs || 60000) / 1000)) } }
        );
      }
    }

    // ── CSRF validation for state-changing API requests ──
    if (isApiRoute) {
      const csrf = validateCsrf(req);
      if (!csrf.ok) {
        return NextResponse.json(
          { error: { code: 'CSRF_REJECTED', message: '請求來源驗證失敗' } },
          { status: 403 }
        );
      }
    }

    // API 路由：統一回傳 JSON，避免被重導向
    if (isApiRoute && !token) {
      return NextResponse.json(
        { error: { code: 'UNAUTHORIZED', message: '請先登入' } },
        { status: 401 }
      );
    }

    // /admin 路由 - 僅 admin 角色可存取
    if (pathname.startsWith('/admin')) {
      if (token?.role !== 'admin') {
        if (isApiRoute) {
          return NextResponse.json(
            { error: { code: 'FORBIDDEN', message: '權限不足' } },
            { status: 403 }
          );
        }
        return NextResponse.redirect(new URL('/unauthorized', req.url));
      }
      return NextResponse.next();
    }

    // /sales：進項發票與「發票私帳」同一頁，擁有 sales.view 或 owner_expense.view 即可
    if (pathname === '/sales' || pathname.startsWith('/sales/')) {
      const permissions = token?.permissions || [];
      const ok =
        token?.role === 'admin' ||
        permissions.includes('*') ||
        permissions.includes('sales.view') ||
        permissions.includes('owner_expense.view');
      if (!ok) {
        if (isApiRoute) {
          return NextResponse.json(
            { error: { code: 'FORBIDDEN', message: '權限不足' } },
            { status: 403 }
          );
        }
        return NextResponse.redirect(new URL('/unauthorized', req.url));
      }
      const res = NextResponse.next();
      if (isApiRoute) {
        res.headers.set('Api-Version', API_VERSION);
        res.headers.set('Deprecation', 'false');
      }
      return res;
    }

    // /owner-expenses：業主發票私帳月結（與發票登錄能力一致）
    if (pathname === '/owner-expenses' || pathname.startsWith('/owner-expenses/')) {
      const permissions = token?.permissions || [];
      const ok =
        token?.role === 'admin' ||
        permissions.includes('*') ||
        permissions.includes('sales.view') ||
        permissions.includes('owner_expense.view');
      if (!ok) {
        if (isApiRoute) {
          return NextResponse.json(
            { error: { code: 'FORBIDDEN', message: '權限不足' } },
            { status: 403 }
          );
        }
        return NextResponse.redirect(new URL('/unauthorized', req.url));
      }
      return NextResponse.next();
    }

    // 模組路由 - 檢查權限
    const requiredPermission = getRequiredPermission(pathname);
    if (requiredPermission) {
      const permissions = token?.permissions || [];
      // admin role 或萬用權限 '*' 直接放行
      if (token?.role === 'admin' || permissions.includes('*')) {
        return NextResponse.next();
      }
      if (!permissions.includes(requiredPermission)) {
        if (isApiRoute) {
          return NextResponse.json(
            { error: { code: 'FORBIDDEN', message: '權限不足' } },
            { status: 403 }
          );
        }
        return NextResponse.redirect(new URL('/unauthorized', req.url));
      }
    }

    // ── Attach API version header to all API responses ──
    const res = NextResponse.next();
    if (isApiRoute) {
      res.headers.set('Api-Version', API_VERSION);
      res.headers.set('Deprecation', 'false');
    }
    return res;
  },
  {
    callbacks: {
      authorized: ({ token, req }) => {
        const { pathname } = req.nextUrl;
        // 公開路由不需要登入
        if (isPublicRoute(pathname)) {
          return true;
        }
        // API 授權回應在 middleware 主體處理（回 401 JSON）
        if (pathname.startsWith('/api/')) {
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
    '/api/:path*',
    '/admin/:path*',
    '/purchasing/:path*',
    '/sales',
    '/sales/:path*',
    '/owner-expenses',
    '/owner-expenses/:path*',
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
    '/assets/:path*',
    '/month-end/:path*',
    '/expenses/:path*',
    '/settings/:path*',
    '/warehouse-departments/:path*',
    '/bnb/:path*',
    '/bnb',
  ]
};
