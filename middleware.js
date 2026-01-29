import { withAuth } from 'next-auth/middleware';
import { NextResponse } from 'next/server';

// Only protect admin routes - all other pages are public (view only)
export default withAuth(
  function middleware(req) {
    const { pathname } = req.nextUrl;
    const token = req.nextauth.token;

    // Only admin can access /admin routes
    if (pathname.startsWith('/admin')) {
      if (token?.role !== 'admin') {
        return NextResponse.redirect(new URL('/unauthorized', req.url));
      }
    }

    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ token, req }) => {
        const { pathname } = req.nextUrl;
        // Only require login for /admin routes
        if (pathname.startsWith('/admin')) {
          return !!token;
        }
        // All other routes are public
        return true;
      }
    }
  }
);

export const config = {
  matcher: ['/admin/:path*']
};
